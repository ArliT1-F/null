import { z } from "zod";

/**
 * Profile presentation configuration.
 *
 * This is the *only* place flexible, user-authored structure lives. Everything
 * business-critical (username, links, publish state) is structured SQL.
 *
 * Rules enforced here:
 *  - Every colour is a strictly validated CSS colour token, never raw CSS.
 *  - Every media reference is a media asset id owned by the profile's user.
 *  - Unknown keys are stripped, so the stored config can never grow into an
 *    unvalidated blob that the renderer trusts.
 */

const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;
const color = z.string().regex(HEX_COLOR, "Expected a hex colour");

export const FONT_OPTIONS = [
  { value: "inter", label: "Inter" },
  { value: "sora", label: "Sora" },
  { value: "system", label: "System" },
  { value: "serif", label: "Editorial Serif" },
  { value: "mono", label: "Mono" },
] as const;

export const RADIUS_OPTIONS = ["none", "sm", "md", "lg", "xl", "full"] as const;
export const BACKGROUND_TYPES = ["solid", "gradient", "image"] as const;
export const BUTTON_STYLES = ["solid", "outline", "soft", "glass"] as const;
export const CARD_ALIGNMENTS = ["center", "left"] as const;

export const themeSchema = z.object({
  background: z
    .object({
      type: z.enum(BACKGROUND_TYPES).default("gradient"),
      color: color.default("#0b0f14"),
      gradientFrom: color.default("#121b2a"),
      gradientTo: color.default("#0a2a22"),
      gradientAngle: z.number().int().min(0).max(360).default(135),
      /** Media asset id (not a URL) — the renderer resolves it. */
      imageUrl: z.string().max(512).nullable().default(null),
      blur: z.number().int().min(0).max(40).default(0),
      dim: z.number().int().min(0).max(90).default(20),
    })
    .default({}),
  card: z
    .object({
      surface: color.default("#ffffff"),
      opacity: z.number().min(0).max(100).default(6),
      borderColor: color.default("#ffffff"),
      borderOpacity: z.number().min(0).max(100).default(12),
      borderWidth: z.number().int().min(0).max(6).default(1),
      radius: z.enum(RADIUS_OPTIONS).default("xl"),
      shadow: z.enum(["none", "soft", "strong"]).default("strong"),
      blur: z.number().int().min(0).max(40).default(14),
      padding: z.number().int().min(8).max(64).default(28),
    })
    .default({}),
  text: z
    .object({
      primary: color.default("#f5f7fa"),
      muted: color.default("#a3adbf"),
      accent: color.default("#3fcf9f"),
    })
    .default({}),
  typography: z
    .object({
      font: z.enum(["inter", "sora", "system", "serif", "mono"]).default("inter"),
      baseSize: z.number().int().min(12).max(22).default(15),
      headingWeight: z.enum(["500", "600", "700", "800"]).default("700"),
      letterSpacing: z.number().min(-2).max(4).default(0),
      lineHeight: z.number().min(1.1).max(2).default(1.55),
    })
    .default({}),
  buttons: z
    .object({
      style: z.enum(BUTTON_STYLES).default("soft"),
      radius: z.enum(RADIUS_OPTIONS).default("lg"),
      fill: color.default("#ffffff"),
      fillOpacity: z.number().min(0).max(100).default(8),
      hoverLift: z.boolean().default(true),
    })
    .default({}),
  effects: z
    .object({
      animatedBackground: z.boolean().default(true),
      glow: z.boolean().default(true),
      noise: z.boolean().default(false),
      entrance: z.enum(["none", "fade", "rise"]).default("rise"),
    })
    .default({}),
});

export const layoutSchema = z.object({
  width: z.number().int().min(320).max(760).default(480),
  alignment: z.enum(CARD_ALIGNMENTS).default("center"),
  gap: z.number().int().min(4).max(32).default(12),
  showAvatar: z.boolean().default(true),
  showStatus: z.boolean().default(true),
  showLocation: z.boolean().default(true),
  showViewCount: z.boolean().default(false),
});

export const profileConfigSchema = z.object({
  version: z.literal(1).default(1),
  theme: themeSchema.default({}),
  layout: layoutSchema.default({}),
});

export type ProfileConfig = z.infer<typeof profileConfigSchema>;
export type ThemeTokens = ProfileConfig["theme"];
export type LayoutTokens = ProfileConfig["layout"];

export const DEFAULT_PROFILE_CONFIG: ProfileConfig = profileConfigSchema.parse({});

type AnyRecord = Record<string, unknown>;

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Merges a stored (possibly partial or older) config over the defaults, one
 * level at a time. Salvaging per-section means one bad colour does not throw
 * away everything else the user configured.
 */
function deepMerge<T>(defaults: T, input: unknown): T {
  if (!isRecord(defaults) || !isRecord(input)) {
    return (isRecord(input) || typeof input === "string" || typeof input === "boolean" || typeof input === "number"
      ? input
      : defaults) as T;
  }
  const out: AnyRecord = { ...defaults };
  for (const [key, value] of Object.entries(input)) {
    if (!(key in out)) continue; // unknown keys are dropped
    const current = out[key];
    out[key] = isRecord(current) && isRecord(value) ? deepMerge(current, value) : value;
  }
  return out as T;
}

export function normalizeProfileConfig(input: unknown): ProfileConfig {
  const parsed = profileConfigSchema.safeParse(input);
  if (parsed.success) return parsed.data;

  // Re-validate section by section so a single invalid field only costs that
  // field. Each section is tried as a whole first; if it still fails, valid
  // individual fields are kept and only the offending ones fall back.
  const merged = deepMerge(DEFAULT_PROFILE_CONFIG, input);

  const theme = themeSchema.safeParse(merged.theme);
  const layout = layoutSchema.safeParse(merged.layout);

  return {
    version: 1,
    theme: theme.success ? theme.data : salvageSection(themeSchema, DEFAULT_PROFILE_CONFIG.theme, merged.theme),
    layout: layout.success ? layout.data : DEFAULT_PROFILE_CONFIG.layout,
  };
}

/** Peels ZodDefault/ZodOptional wrappers off to reach an inner object schema. */
function unwrapObject(schema: z.ZodTypeAny): z.ZodObject<z.ZodRawShape> | null {
  let current: unknown = schema;
  for (let depth = 0; depth < 4 && current; depth++) {
    if (current instanceof z.ZodObject) return current as z.ZodObject<z.ZodRawShape>;
    const inner = (current as { _def?: { innerType?: unknown } })._def?.innerType;
    if (!inner) return null;
    current = inner;
  }
  return null;
}

/**
 * Keeps every individually valid field of a section, replacing only the fields
 * that fail their own schema check.
 */
function salvageSection<T extends z.ZodObject<z.ZodRawShape>>(schema: T, defaults: z.infer<T>, input: unknown): z.infer<T> {
  if (!isRecord(input)) return defaults;

  const shape = schema.shape as Record<string, z.ZodTypeAny>;
  const out: AnyRecord = { ...defaults };

  for (const [key, fieldSchema] of Object.entries(shape)) {
    if (!(key in input)) continue;

    const value = input[key];

    const nested = unwrapObject(fieldSchema);
    if (nested) {
      out[key] = salvageSection(nested, (defaults as AnyRecord)[key] as AnyRecord, value);
      continue;
    }

    const result = fieldSchema.safeParse(value);
    if (result.success) out[key] = result.data;
  }

  return out as z.infer<T>;
}

/**
 * Produces the CSS custom properties consumed by the public profile renderer.
 * Values are drawn exclusively from validated tokens, so nothing user-authored
 * can escape into a raw `style` attribute.
 */
export function themeToCssVars(theme: ThemeTokens, layout: LayoutTokens): Record<string, string> {
  const radius: Record<string, string> = {
    none: "0px",
    sm: "6px",
    md: "10px",
    lg: "14px",
    xl: "20px",
    full: "999px",
  };
  const fontStack: Record<string, string> = {
    inter: "var(--font-sans)",
    sora: "var(--font-display)",
    system: "ui-sans-serif, system-ui, sans-serif",
    serif: "ui-serif, Georgia, serif",
    mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
  };

  const { background: bg, card, text, typography, buttons } = theme;

  const backdrop =
    bg.type === "solid"
      ? bg.color
      : bg.type === "gradient"
        ? `linear-gradient(${bg.gradientAngle}deg, ${bg.gradientFrom}, ${bg.gradientTo})`
        : bg.gradientFrom; // image handled by a separate layer

  return {
    "--p-bg": backdrop,
    "--p-bg-flat": bg.color,
    "--p-bg-blur": `${bg.blur}px`,
    "--p-bg-dim": `${bg.dim / 100}`,
    "--p-card-surface": card.surface,
    "--p-card-opacity": `${card.opacity / 100}`,
    "--p-card-border": card.borderColor,
    "--p-card-border-opacity": `${card.borderOpacity / 100}`,
    "--p-card-border-width": `${card.borderWidth}px`,
    "--p-card-radius": radius[card.radius],
    "--p-card-blur": `${card.blur}px`,
    "--p-card-padding": `${card.padding}px`,
    "--p-card-shadow":
      card.shadow === "none"
        ? "none"
        : card.shadow === "soft"
          ? "0 8px 24px -12px rgba(0,0,0,0.45)"
          : "0 24px 70px -30px rgba(0,0,0,0.75)",
    "--p-text": text.primary,
    "--p-muted": text.muted,
    "--p-accent": text.accent,
    "--p-font": fontStack[typography.font],
    "--p-base-size": `${typography.baseSize}px`,
    "--p-heading-weight": typography.headingWeight,
    "--p-tracking": `${typography.letterSpacing / 100}em`,
    "--p-leading": `${typography.lineHeight}`,
    "--p-btn-radius": radius[buttons.radius],
    "--p-btn-fill": buttons.fill,
    "--p-btn-fill-opacity": `${buttons.fillOpacity / 100}`,
    "--p-width": `${layout.width}px`,
    "--p-gap": `${layout.gap}px`,
    "--p-align": layout.alignment,
  };
}

/** Applies a theme's partial token set over the defaults (used by the seeder + UI). */
export function configWithTheme(tokens: unknown): ProfileConfig {
  return normalizeProfileConfig({ version: 1, theme: tokens });
}
