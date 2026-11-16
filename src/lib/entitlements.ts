import { env } from "@/lib/env";

/**
 * Centralised entitlement service (guardrail #5).
 *
 * Feature modules never inspect subscription state, roles, or feature flags
 * directly — every capability decision flows through `getEntitlements()`. When
 * V4 billing introduces persistent subscriptions, only `resolvePlan()` changes.
 */

export type PlanTier = "FREE" | "PRO" | "PREMIUM";

export type CustomCssAvailability =
  | "enabled"
  | "feature_disabled"
  | "sandbox_origin_missing"
  | "plan_required";

export type Entitlements = {
  plan: PlanTier;
  /** Whether the user may author and save custom CSS in the Monaco editor. */
  canEditCustomCss: boolean;
  /** Whether custom CSS will render publicly inside the separate sandbox origin. */
  canPublishCustomCss: boolean;
  customCssStatus: CustomCssAvailability;
  /** Human-readable explanation when custom CSS is gated or awaiting sandbox config. */
  customCssDisabledReason: string | null;
  /** Configured separate sandbox origin, or null when unset. */
  sandboxOrigin: string | null;
  maxSavedThemes: number;
  maxBlocks: number;
  customFonts: boolean;
  videoBackgrounds: boolean;
};

export type EntitlementSubject = {
  id: string;
  role: "USER" | "ADMIN";
  /** Optional explicit tier hook for V4 subscription integration and tests. */
  plan?: PlanTier;
};

export type EntitlementEnvOverride = {
  featureProCss: boolean;
  proCssDevAll: boolean;
  proCssSandboxOrigin: string | null;
};

const STATUS_REASONS: Record<CustomCssAvailability, string | null> = {
  enabled: null,
  feature_disabled:
    "Pro custom CSS is disabled on this instance. Operators can enable FEATURE_PRO_CSS=true alongside a dedicated PRO_CSS_SANDBOX_ORIGIN.",
  plan_required:
    "Custom CSS is a Pro feature, rendered inside an isolated sandbox origin so visitor security and page speed stay guaranteed.",
  sandbox_origin_missing:
    "Pro CSS requires a separate PRO_CSS_SANDBOX_ORIGIN before custom stylesheets can be saved or served publicly.",
};

/**
 * Resolves a user's plan tier before V4 subscriptions land:
 *  - Explicit plan wins when passed (future subscription service / unit tests).
 *  - Instance admins receive PRO access so operators can use and verify Pro features.
 *  - In non-production only, `FEATURE_PRO_CSS_DEV_ALL=true` grants PRO for local testing.
 */
export function resolvePlan(
  user: EntitlementSubject,
  flags: Pick<EntitlementEnvOverride, "proCssDevAll"> = { proCssDevAll: env.proCssDevAll },
): PlanTier {
  if (user.plan) return user.plan;
  if (user.role === "ADMIN") return "PRO";
  if (flags.proCssDevAll) return "PRO";
  return "FREE";
}

export function getEntitlements(
  user: EntitlementSubject,
  override?: EntitlementEnvOverride,
): Entitlements {
  const flags: EntitlementEnvOverride = override ?? {
    featureProCss: env.FEATURE_PRO_CSS,
    proCssDevAll: env.proCssDevAll,
    proCssSandboxOrigin: env.proCssSandboxOrigin,
  };

  const plan = resolvePlan(user, flags);
  const isProOrAbove = plan === "PRO" || plan === "PREMIUM";

  let customCssStatus: CustomCssAvailability;
  if (!flags.featureProCss) {
    customCssStatus = "feature_disabled";
  } else if (!isProOrAbove) {
    customCssStatus = "plan_required";
  } else if (!flags.proCssSandboxOrigin) {
    customCssStatus = "sandbox_origin_missing";
  } else {
    customCssStatus = "enabled";
  }

  return {
    plan,
    // Entitled users may only save/publish custom CSS once origin isolation is active.
    canEditCustomCss: customCssStatus === "enabled",
    canPublishCustomCss: customCssStatus === "enabled",
    customCssStatus,
    customCssDisabledReason: STATUS_REASONS[customCssStatus],
    sandboxOrigin: flags.proCssSandboxOrigin,
    maxSavedThemes: isProOrAbove ? 24 : 8,
    maxBlocks: 24,
    customFonts: true,
    videoBackgrounds: true,
  };
}
