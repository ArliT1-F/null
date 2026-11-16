import type { NextConfig } from "next";

/** Resolves an optional validated Pro CSS sandbox origin for `frame-src` allowlisting. */
function configuredSandboxOrigin(): string | null {
  const raw = process.env.PRO_CSS_SANDBOX_ORIGIN?.trim();
  const appRaw = process.env.APP_URL?.trim() || "http://localhost:3000";
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const app = new URL(appRaw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (parsed.origin.toLowerCase() === app.origin.toLowerCase()) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

const sandboxOrigin = configuredSandboxOrigin();

const embedFrameSources = [
  "https://www.youtube-nocookie.com",
  "https://player.vimeo.com",
  "https://open.spotify.com",
  "https://w.soundcloud.com",
  ...(sandboxOrigin ? [sandboxOrigin] : []),
].join(" ");

/**
 * Security headers applied to every response.
 *
 * Content-Security-Policy is enforced globally with strict sources:
 *   - No third-party scripts, fonts, or analytics.
 *   - Profile styling is emitted as typed CSS custom properties and validated
 *     token stylesheets, not arbitrary inline script.
 *   - `frame-ancestors 'none'` defeats clickjacking across all browsers
 *     (the dedicated `/sandbox/profile/:username` route overrides CSP to allow
 *     framing solely from `APP_URL`).
 *   - `frame-src` allows only the four allowlisted embed players (V2.1) and,
 *     when configured, the separate `PRO_CSS_SANDBOX_ORIGIN` (V2.5).
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "font-src 'self' data:",
      "worker-src 'self' blob:",
      "connect-src 'self'",
      `frame-src ${embedFrameSources}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

if (process.env.NODE_ENV === "production") {
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  });
}

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["@node-rs/argon2", "sharp"],
  images: {
    unoptimized: true, // media pipeline produces pre-sized WebP/AVIF variants directly
  },
  headers: async () => [
    {
      source: "/((?!sandbox/).*)",
      headers: securityHeaders,
    },
    {
      // Uploaded media is served strictly as inert data — even if a polyglot file
      // somehow slipped past decode+re-encode, browsers refuse to execute it.
      source: "/api/media/:path*",
      headers: [
        { key: "Content-Security-Policy", value: "default-src 'none'; sandbox" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
        { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
      ],
    },
  ],
};

export default nextConfig;
