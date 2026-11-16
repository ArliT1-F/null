import { z } from "zod";

/**
 * Environment contract.
 *
 * Everything the app needs is read here exactly once, validated, and exported
 * as a typed object. Modules must not read `process.env` directly, which keeps
 * configuration portable between laptop, self-hosted desktop and cloud.
 */

const bool = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? fallback : v === "true" || v === "1"));

const int = (fallback: number, min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v === "") return fallback;
      const n = Number.parseInt(v, 10);
      return Number.isFinite(n) ? n : fallback;
    })
    .pipe(z.number().int().min(min).max(max));

/**
 * Normalises and verifies the isolated Pro CSS sandbox origin (guardrail #4).
 *
 * Custom user CSS must NEVER execute on the primary application origin. A
 * configured sandbox origin that shares scheme+host+port with `APP_URL`, uses a
 * non-http(s) scheme, embeds credentials, or uses plain http in production is
 * rejected outright at startup.
 */
export function resolveSandboxOrigin(
  rawSandbox: string | undefined,
  appUrl: string,
  isProduction: boolean,
): string | null {
  const trimmed = rawSandbox?.trim() ?? "";
  if (!trimmed) return null;

  let sandbox: URL;
  try {
    sandbox = new URL(trimmed);
  } catch {
    throw new Error("PRO_CSS_SANDBOX_ORIGIN must be a valid http(s) origin URL");
  }

  if (sandbox.protocol !== "https:" && sandbox.protocol !== "http:") {
    throw new Error("PRO_CSS_SANDBOX_ORIGIN must use https:// (or http:// in local development)");
  }
  if (isProduction && sandbox.protocol !== "https:") {
    throw new Error("PRO_CSS_SANDBOX_ORIGIN must use https:// in production");
  }
  if (sandbox.username || sandbox.password) {
    throw new Error("PRO_CSS_SANDBOX_ORIGIN must not contain credentials");
  }
  if ((sandbox.pathname && sandbox.pathname !== "/") || sandbox.search || sandbox.hash) {
    throw new Error("PRO_CSS_SANDBOX_ORIGIN must be a bare origin with no path, query, or hash");
  }

  const app = new URL(appUrl);
  if (sandbox.origin.toLowerCase() === app.origin.toLowerCase()) {
    throw new Error(
      "PRO_CSS_SANDBOX_ORIGIN must be a separate origin from APP_URL — user CSS is never served on the application origin",
    );
  }

  return sandbox.origin;
}

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_NAME: z.string().min(1).default("null"),

  DATABASE_URL: z.string().min(1),

  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  APP_ENCRYPTION_KEY: z.string().min(16, "APP_ENCRYPTION_KEY is required for token encryption"),

  SESSION_COOKIE_NAME: z.string().min(1).default("null_session"),
  SESSION_TTL_DAYS: int(30, 1, 365),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  /**
   * Where uploaded media lives. Deliberately *not* fixed here: production
   * defaults to the container path, development to a repo-local `media/`
   * directory (gitignored), so `npm run dev` works without configuring
   * anything. A blank value is treated as unset — an empty line in a .env file
   * must not become a path.
   */
  MEDIA_ROOT: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  MEDIA_PUBLIC_PREFIX: z.string().startsWith("/").default("/api/media"),
  MAX_UPLOAD_MB: int(16, 1, 256),

  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PUBLIC_BASE_URL: z.string().url().optional().or(z.literal("")),

  MAIL_DRIVER: z.enum(["console", "smtp"]).default("console"),
  MAIL_FROM: z.string().default("null <no-reply@localhost>"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: int(587, 1, 65535),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: bool(false),

  TRUST_PROXY: bool(false),
  ALLOWED_ORIGINS: z.string().optional(),

  FEATURE_BILLING: bool(false),
  FEATURE_INTEGRATIONS: bool(false),
  /** Enables the Pro Monaco CSS editor. Public rendering also requires PRO_CSS_SANDBOX_ORIGIN. */
  FEATURE_PRO_CSS: bool(false),
  /** Grants Pro entitlements to all signed-in accounts in non-production environments only. */
  FEATURE_PRO_CSS_DEV_ALL: bool(false),
  /** Distinct origin (e.g. https://sandbox.example.com) that serves isolated custom-CSS frames. */
  PRO_CSS_SANDBOX_ORIGIN: z.string().optional(),
});

function load() {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration:\n${issues}\n\nSee .env.example for the full contract.`,
    );
  }

  const raw = parsed.data;

  if (raw.STORAGE_DRIVER === "s3") {
    const missing = (["S3_BUCKET", "S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const)
      .filter((k) => !raw[k]);
    if (missing.length) {
      throw new Error(`STORAGE_DRIVER=s3 requires: ${missing.join(", ")}`);
    }
  }

  if (raw.MAIL_DRIVER === "smtp" && !raw.SMTP_HOST) {
    throw new Error("MAIL_DRIVER=smtp requires SMTP_HOST");
  }

  const isProd = raw.NODE_ENV === "production";
  if (isProd && raw.AUTH_SECRET.includes("replace-me")) {
    throw new Error("Refusing to start in production with a placeholder AUTH_SECRET");
  }

  const proCssSandboxOrigin = resolveSandboxOrigin(raw.PRO_CSS_SANDBOX_ORIGIN, raw.APP_URL, isProd);

  return {
    ...raw,
    MEDIA_ROOT: raw.MEDIA_ROOT ?? (isProd ? "/srv/null/media" : "media"),
    isProduction: isProd,
    isDevelopment: raw.NODE_ENV === "development",
    isTest: raw.NODE_ENV === "test",
    maxUploadBytes: raw.MAX_UPLOAD_MB * 1024 * 1024,
    allowedOrigins: (raw.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    appOrigin: new URL(raw.APP_URL).origin,
    proCssSandboxOrigin,
    /** Public custom-CSS rendering requires both the feature flag and a verified separate origin. */
    proCssPublicEnabled: raw.FEATURE_PRO_CSS && proCssSandboxOrigin !== null,
    /** Dev override never activates in production, even if accidentally set. */
    proCssDevAll: !isProd && raw.FEATURE_PRO_CSS_DEV_ALL,
  };
}

export const env = load();
export type Env = typeof env;
