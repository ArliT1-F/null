import { z } from "zod";

/**
 * Profile presentation configuration.
 *
 * This is the *only* place flexible, user-authored structure lives. Everything
 * business-critical (username, links, publish state) is structured SQL.
 *
 * Rules enforced here:
 *  - Every colour is a strictly validated CSS colour token, never raw CSS.
 *  - Every media reference is a media URL owned by the profile's user (same-origin
 *    `/api/media/...` or https) — validated again at render time.
 *  - Unknown keys are stripped, so the stored config can never grow into an
 *    unvalidated blob that the renderer trusts.
 *  - Blocks never store raw HTML, CSS or JavaScript. Text is plain text;
 *    embeds are allowlisted https URLs rendered in a sandboxed iframe.
 *
 * Config version 2 adds component blocks + per-breakpoint overrides. Version 1
 * configs (theme + layout only) load as v2 with empty blocks — the upgrade is
 * lossless and needs no database migration (blocks live in `draft_config` JSONB).
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

export const BLOCK_TYPES = ["text", "image", "gallery", "divider", "embed"] as const;
export const BLOCK_TYPE_LABELS: Record<(typeof BLOCK_TYPES)[number], string> = {
  text: "Text",
  image: "Image",
  gallery: "Gallery",
  divider: "Divider",
  embed: "Embed",
};

export const MAX_BLOCKS = 24;
export const MAX_GALLERY_IMAGES = 6;

/** Hosts whose embeds may be rendered. Everything else is rejected at write time. */
export const EMBED_HOSTS = [
  "youtube.com",
  "www.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtu.be",
  "vimeo.com",
  "player.vimeo.com",
  "open.spotify.com",
  "soundcloud.com",
] as const;

const blockId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/, "Block id must be alphanumeric");

/** Media URL: same-origin path or https. Rejects javascript:/data: outright. */
const mediaUrl = z
  .string()
  .max(512)
  .refine((value) => {
    const v = value.trim();
    if (!v) return false;
    if (v.startsWith("/")) return !v.startsWith("//") && !/[\s"'()\\;{}<>]/.test(v);
    try {
      const parsed = new URL(v);
      return parsed.protocol === "https:" && !/[\s"'()\\;{}<>]/.test(v);
    } catch {
      return false;
    }
  }, "Use an https image URL or an uploaded media file");

const embedUrl = z
  .string()
  .max(2048)
  .refine((value) => isEmbedAllowed(value), "Only YouTube, Vimeo, Spotify and SoundCloud embeds are allowed");

export function isEmbedAllowed(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) return false;
    const host = parsed.hostname.toLowerCase();
    return (EMBED_HOSTS as readonly string[]).includes(host);
  } catch {
    return false;
  }
}

/**
 * Normalises a user-supplied embed URL to the iframe `src`.
 * Converts watch/share URLs to embed URLs where the provider supports it.
 * Returns null when the URL is not allowlisted.
 */
export function embedUrlFor(value: string): string | null {
  const raw = value.trim();
  if (!isEmbedAllowed(raw)) return null;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    if (host === "youtu.be") {
      const id = parsed.pathname.replace(/^\//, "").split("/")[0];
      return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null;
    }
    if (host === "youtube.com" || host === "www.youtube.com") {
      const v = parsed.searchParams.get("v");
      if (v) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v)}`;
      if (parsed.pathname.startsWith("/embed/")) return raw;
      if (parsed.pathname.startsWith("/shorts/")) {
        const id = parsed.pathname.split("/")[2];
        return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null;
      }
      return null;
    }
    if (host === "vimeo.com") {
      const id = parsed.pathname.replace(/^\//, "").split("/")[0];
      return id ? `https://player.vimeo.com/video/${encodeURIComponent(id)}` : null;
    }
    if (host === "open.spotify.com") {
      const match = parsed.pathname.match(/^\/(?:embed\/)?(track|album|playlist|episode|show|artist)\/([a-zA-Z0-9]+)$/);
      return match ? `https://open.spotify.com/embed/${match[1]}/${match[2]}` : null;
    }
    if (host === "soundcloud.com") return `https://w.soundcloud.com/player/?url=${encodeURIComponent(parsed.origin + parsed.pathname)}`;
    if (host === "player.vimeo.com") return /^\/video\/\d+$/.test(parsed.pathname) ? parsed.origin + parsed.pathname : null;
    if (host === "youtube-nocookie.com" || host === "www.youtube-nocookie.com") return /^\/embed\/[a-zA-Z0-9_-]+$/.test(parsed.pathname) ? parsed.origin + parsed.pathname : null;
    return null;
  } catch {
    return null;
  }
}

const textBlockProps = z.object({
  content: z.string().max(2000).default(""),
  align: z.enum(["left", "center", "right"]).default("left"),
  size: z.enum(["sm", "md", "lg"]).default("md"),
});

const imageBlockProps = z.object({
  src: z.union([z.literal(""), mediaUrl]).default(""),
  alt: z.string().max(200).default(""),
  caption: z.string().max(300).default(""),
  radius: z.enum(RADIUS_OPTIONS).default("lg"),
});

const galleryImage = z.object({
  src: mediaUrl,
  alt: z.string().max(200).default(""),
});

const galleryBlockProps = z.object({
  images: z.array(galleryImage).max(MAX_GALLERY_IMAGES).default([]),
  columns: z.number().int().min(1).max(3).default(2),
});

const dividerBlockProps = z.object({
  style: z.enum(["line", "dots", "spacing"]).default("line"),
  spacing: z.number().int().min(0).max(64).default(16),
});

const embedBlockProps = z.object({
  url: z.union([z.literal(""), embedUrl]).default(""),
  title: z.string().max(200).default(""),
});

const blockBase = z.object({
  id: blockId,
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  groupId: z
    .string()
    .max(64)
    .regex(/^[a-zA-Z0-9_-]*$/, "Group id must be alphanumeric")
    .nullable()
    .default(null),
});

export const blockSchema = z.discriminatedUnion("type", [
  blockBase.extend({ type: z.literal("text"), props: textBlockProps.default({}) }),
  blockBase.extend({ type: z.literal("image"), props: imageBlockProps.default({}) }),
  blockBase.extend({ type: z.literal("gallery"), props: galleryBlockProps.default({}) }),
  blockBase.extend({ type: z.literal("divider"), props: dividerBlockProps.default({}) }),
  blockBase.extend({ type: z.literal("embed"), props: embedBlockProps.default({}) }),
]);

export type ProfileBlock = z.infer<typeof blockSchema>;

export function createBlockId(): string {
  // Client-generated ids are validated by blockId; crypto.randomUUID is
  // available in browsers and Node. Fall back to a timestamp suffix.
  try {
    return crypto.randomUUID().slice(0, 22);
  } catch {
    return `b${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  }
}

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

/** Partial layout overrides per breakpoint. Absent fields inherit the base layout. */
const breakpointOverrideSchema = z.object({
  width: z.number().int().min(320).max(760).optional(),
  gap: z.number().int().min(4).max(32).optional(),
  padding: z.number().int().min(8).max(64).optional(),
});

export const breakpointsSchema = z.object({
  mobile: breakpointOverrideSchema.default({}),
  tablet: breakpointOverrideSchema.default({}),
});

export const profileConfigSchema = z.object({
  // Any stored version (1 or 2) normalises to 2. Version 1 simply has no
  // blocks/breakpoints, which default to empty.
  version: z.preprocess(() => 2, z.literal(2).default(2)),
  theme: themeSchema.default({}),
  layout: layoutSchema.default({}),
  blocks: z
    .array(blockSchema)
    .max(MAX_BLOCKS)
    .default([])
    .superRefine((blocks, ctx) => {
      const seen = new Set<string>();
      for (const block of blocks) {
        if (seen.has(block.id)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate block id", path: [blocks.indexOf(block)] });
        }
        seen.add(block.id);
      }
    }),
  breakpoints: breakpointsSchema.default({}),
});

export type ProfileConfig = z.infer<typeof profileConfigSchema>;
export type ThemeTokens = ProfileConfig["theme"];
export type LayoutTokens = ProfileConfig["layout"];
export type BreakpointOverrides = ProfileConfig["breakpoints"];

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

/** Validates blocks one by one: invalid blocks are dropped, valid ones kept. */
function salvageBlocks(input: unknown): ProfileBlock[] {
  if (!Array.isArray(input)) return [];
  const out: ProfileBlock[] = [];
  const seen = new Set<string>();
  for (const raw of input.slice(0, MAX_BLOCKS)) {
    const parsed = blockSchema.safeParse(raw);
    if (!parsed.success) continue;
    if (seen.has(parsed.data.id)) continue;
    seen.add(parsed.data.id);
    out.push(parsed.data);
  }
  return out;
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
  const breakpoints = breakpointsSchema.safeParse(merged.breakpoints);

  return {
    version: 2,
    theme: theme.success ? theme.data : salvageSection(themeSchema, DEFAULT_PROFILE_CONFIG.theme, merged.theme),
    layout: layout.success ? layout.data : DEFAULT_PROFILE_CONFIG.layout,
    blocks: salvageBlocks(isRecord(input) ? (input as AnyRecord).blocks : undefined),
    breakpoints: breakpoints.success ? breakpoints.data : DEFAULT_PROFILE_CONFIG.breakpoints,
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
  return normalizeProfileConfig({ version: 2, theme: tokens });
}
