import { z } from "zod";
import { safeFontUrl } from "./background-image";

/**
 * Profile presentation configuration (Config v2).
 *
 * This is the *only* place flexible, user-authored structure lives. Everything
 * business-critical (username, links, publish state, custom CSS) is structured SQL.
 *
 * Rules enforced here:
 *  - Every colour is a strictly validated CSS hex colour token, never raw CSS.
 *  - Every media reference is a validated same-origin path or https URL —
 *    validated again at render time.
 *  - Unknown keys are stripped, so the stored config can never grow into an
 *    unvalidated blob that the renderer trusts.
 *  - Blocks never store raw HTML, CSS or JavaScript. Text is plain text;
 *    embeds are allowlisted https URLs rendered in a sandboxed iframe.
 *  - Raw user CSS is NEVER stored here (see `profile_custom_css` + guardrail #3).
 *
 * Version 1 configs (theme + layout only) and early Version 2 configs load
 * losslessly with safe defaults — no destructive migration required.
 */

const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;
const color = z.string().regex(HEX_COLOR, "Expected a hex colour");

/** Self-hosted variable Google Fonts, system stacks, and user-uploaded font. */
export const FONT_VALUES = [
  "inter",
  "sora",
  "space-grotesk",
  "jakarta",
  "dm-sans",
  "outfit",
  "playfair",
  "jetbrains-mono",
  "fira-code",
  "system",
  "serif",
  "mono",
  "custom",
] as const;

export type FontValue = (typeof FONT_VALUES)[number];

export const FONT_OPTIONS: readonly { value: FontValue; label: string; category: string }[] = [
  { value: "inter", label: "Inter", category: "Google Sans" },
  { value: "sora", label: "Sora", category: "Google Geometric" },
  { value: "space-grotesk", label: "Space Grotesk", category: "Google Display" },
  { value: "jakarta", label: "Plus Jakarta Sans", category: "Google Sans" },
  { value: "dm-sans", label: "DM Sans", category: "Google Sans" },
  { value: "outfit", label: "Outfit", category: "Google Geometric" },
  { value: "playfair", label: "Playfair Display", category: "Google Serif" },
  { value: "jetbrains-mono", label: "JetBrains Mono", category: "Google Mono" },
  { value: "fira-code", label: "Fira Code", category: "Google Mono" },
  { value: "system", label: "System UI", category: "System" },
  { value: "serif", label: "Editorial Serif", category: "System" },
  { value: "mono", label: "System Mono", category: "System" },
  { value: "custom", label: "Uploaded Font", category: "Custom" },
] as const;

export const HEADING_FONT_VALUES = ["inherit", ...FONT_VALUES] as const;
export type HeadingFontValue = (typeof HEADING_FONT_VALUES)[number];

export const FONT_STACKS: Record<FontValue, string> = {
  inter: "var(--font-sans)",
  sora: "var(--font-display)",
  "space-grotesk": '"Space Grotesk Variable", ui-sans-serif, system-ui, sans-serif',
  jakarta: '"Plus Jakarta Sans Variable", ui-sans-serif, system-ui, sans-serif',
  "dm-sans": '"DM Sans Variable", ui-sans-serif, system-ui, sans-serif',
  outfit: '"Outfit Variable", ui-sans-serif, system-ui, sans-serif',
  playfair: '"Playfair Display Variable", ui-serif, Georgia, serif',
  "jetbrains-mono": '"JetBrains Mono Variable", ui-monospace, SFMono-Regular, Menlo, monospace',
  "fira-code": '"Fira Code Variable", ui-monospace, SFMono-Regular, Menlo, monospace',
  system: "ui-sans-serif, system-ui, sans-serif",
  serif: "ui-serif, Georgia, serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
  custom: '"null-user-font", var(--font-sans)',
};

export const RADIUS_OPTIONS = ["none", "sm", "md", "lg", "xl", "full"] as const;
export const BACKGROUND_TYPES = ["solid", "gradient", "mesh", "image", "video"] as const;
export const BUTTON_STYLES = ["solid", "outline", "soft", "glass"] as const;
export const CARD_ALIGNMENTS = ["center", "left"] as const;
export const LAYOUT_MODES = ["stack", "canvas"] as const;
export const BLOCKS_POSITIONS = ["above-links", "below-links"] as const;
export const ENTRANCE_OPTIONS = ["none", "fade", "rise", "scale", "blur"] as const;
export const BACKGROUND_MOTIONS = ["drift", "pulse", "aurora"] as const;
export const CARD_HOVER_OPTIONS = ["none", "lift", "glow"] as const;
export const GRID_SNAP_OPTIONS = [0, 4, 8, 16] as const;

export const BLOCK_TYPES = ["text", "image", "gallery", "divider", "embed"] as const;
export const BLOCK_TYPE_LABELS: Record<(typeof BLOCK_TYPES)[number], string> = {
  text: "Text",
  image: "Image",
  gallery: "Gallery",
  divider: "Divider",
  embed: "Embed",
};

export const MAX_BLOCKS = 24;
export const MAX_GROUPS = 12;
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

const safeId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/, "Identifier must be alphanumeric");

/** Media URL: same-origin path or https. Rejects javascript:/data: outright. */
const mediaUrl = z
  .string()
  .max(512)
  .refine((value) => {
    const v = value.trim();
    if (!v) return false;
    if (v.startsWith("/")) return !v.startsWith("//") && !v.includes("..") && !/[\s"'()\\;{}<>]/.test(v);
    try {
      const parsed = new URL(v);
      return parsed.protocol === "https:" && !parsed.username && !parsed.password && !/[\s"'()\\;{}<>]/.test(v);
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

export function embedProviderName(value: string): string | null {
  if (!isEmbedAllowed(value)) return null;
  try {
    const host = new URL(value.trim()).hostname.toLowerCase();
    if (host.includes("youtu")) return "YouTube";
    if (host.includes("vimeo")) return "Vimeo";
    if (host.includes("spotify")) return "Spotify";
    if (host.includes("soundcloud")) return "SoundCloud";
    return null;
  } catch {
    return null;
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
      return id && /^[a-zA-Z0-9_-]+$/.test(id)
        ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`
        : null;
    }
    if (host === "youtube.com" || host === "www.youtube.com") {
      const v = parsed.searchParams.get("v");
      if (v && /^[a-zA-Z0-9_-]+$/.test(v)) {
        return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v)}`;
      }
      if (parsed.pathname.startsWith("/embed/")) {
        const id = parsed.pathname.split("/")[2];
        return id && /^[a-zA-Z0-9_-]+$/.test(id)
          ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`
          : null;
      }
      if (parsed.pathname.startsWith("/shorts/")) {
        const id = parsed.pathname.split("/")[2];
        return id && /^[a-zA-Z0-9_-]+$/.test(id)
          ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`
          : null;
      }
      return null;
    }
    if (host === "vimeo.com") {
      const id = parsed.pathname.replace(/^\//, "").split("/")[0];
      return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
    }
    if (host === "open.spotify.com") {
      const match = parsed.pathname.match(
        /^\/(?:embed\/)?(track|album|playlist|episode|show|artist)\/([a-zA-Z0-9]+)$/,
      );
      return match ? `https://open.spotify.com/embed/${match[1]}/${match[2]}` : null;
    }
    if (host === "soundcloud.com") {
      return `https://w.soundcloud.com/player/?url=${encodeURIComponent(parsed.origin + parsed.pathname)}`;
    }
    if (host === "player.vimeo.com") {
      return /^\/video\/\d+$/.test(parsed.pathname) ? parsed.origin + parsed.pathname : null;
    }
    if (host === "youtube-nocookie.com" || host === "www.youtube-nocookie.com") {
      return /^\/embed\/[a-zA-Z0-9_-]+$/.test(parsed.pathname) ? parsed.origin + parsed.pathname : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Bounded position & dimensions for freeform canvas mode.
 * `x` and `w` are percentages of the canvas stage (0–100) so designs remain
 * proportional across screen widths; `y` and optional `h` are stage pixels.
 */
export const canvasFrameSchema = z.object({
  x: z.number().min(0).max(95).default(15),
  y: z.number().int().min(0).max(2200).default(40),
  w: z.number().min(10).max(100).default(70),
  h: z.number().int().min(24).max(1200).nullable().default(null),
  z: z.number().int().min(1).max(100).default(10),
});

export type CanvasFrame = z.infer<typeof canvasFrameSchema>;

const textBlockProps = z.object({
  content: z.string().max(2000).default(""),
  align: z.enum(["left", "center", "right"]).default("left"),
  size: z.enum(["sm", "md", "lg", "xl"]).default("md"),
  tone: z.enum(["primary", "muted", "accent"]).default("primary"),
  weight: z.enum(["normal", "medium", "bold"]).default("normal"),
});

const imageBlockProps = z.object({
  src: z.union([z.literal(""), mediaUrl]).default(""),
  alt: z.string().max(200).default(""),
  caption: z.string().max(300).default(""),
  radius: z.enum(RADIUS_OPTIONS).default("lg"),
  aspect: z.enum(["auto", "1:1", "16:9", "4:3"]).default("auto"),
  fit: z.enum(["cover", "contain"]).default("cover"),
});

const galleryImage = z.object({
  src: mediaUrl,
  alt: z.string().max(200).default(""),
});

const galleryBlockProps = z.object({
  images: z.preprocess(
    (v) => (Array.isArray(v) ? v.slice(0, MAX_GALLERY_IMAGES + 1) : v),
    z.array(galleryImage).max(MAX_GALLERY_IMAGES).default([]),
  ),
  columns: z.number().int().min(1).max(3).default(2),
  gap: z.number().int().min(4).max(24).default(8),
  radius: z.enum(RADIUS_OPTIONS).default("md"),
});

const dividerBlockProps = z.object({
  style: z.enum(["line", "dots", "gradient", "spacing"]).default("line"),
  spacing: z.number().int().min(0).max(64).default(16),
});

const embedBlockProps = z.object({
  url: z.union([z.literal(""), embedUrl]).default(""),
  title: z.string().max(200).default(""),
  aspect: z.enum(["16:9", "4:3", "1:1", "compact"]).default("16:9"),
});

const blockBase = z.object({
  id: safeId,
  label: z.string().max(60).default(""),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  groupId: z
    .string()
    .max(64)
    .regex(/^[a-zA-Z0-9_-]*$/, "Group id must be alphanumeric")
    .nullable()
    .transform((v) => (v === "" ? null : v))
    .default(null),
  frame: canvasFrameSchema.nullable().default(null),
});

export const blockSchema = z.discriminatedUnion("type", [
  blockBase.extend({ type: z.literal("text"), props: textBlockProps.default({}) }),
  blockBase.extend({ type: z.literal("image"), props: imageBlockProps.default({}) }),
  blockBase.extend({ type: z.literal("gallery"), props: galleryBlockProps.default({}) }),
  blockBase.extend({ type: z.literal("divider"), props: dividerBlockProps.default({}) }),
  blockBase.extend({ type: z.literal("embed"), props: embedBlockProps.default({}) }),
]);

export type ProfileBlock = z.infer<typeof blockSchema>;

export const blockGroupSchema = z.object({
  id: safeId,
  name: z.string().trim().min(1).max(60).default("Group"),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  collapsed: z.boolean().default(false),
});

export type BlockGroup = z.infer<typeof blockGroupSchema>;

export function createBlockId(): string {
  try {
    return crypto.randomUUID().slice(0, 22);
  } catch {
    return `b${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  }
}

export function createGroupId(): string {
  return `g_${createBlockId().slice(0, 16)}`;
}

const customFontUrlField = z
  .string()
  .max(512)
  .refine((v) => safeFontUrl(v) !== null, "Expected an uploaded font file (.woff2, .woff, .ttf or .otf)")
  .nullable()
  .default(null);

export const themeSchema = z.object({
  background: z
    .object({
      type: z.enum(BACKGROUND_TYPES).default("gradient"),
      color: color.default("#0b0f14"),
      gradientFrom: color.default("#121b2a"),
      gradientMid: color.nullable().default(null),
      gradientTo: color.default("#0a2a22"),
      gradientAngle: z.number().int().min(0).max(360).default(135),
      /** Background image URL (same-origin /api/media/... or https://). */
      imageUrl: z.string().max(512).nullable().default(null),
      /** Background video URL (same-origin /api/media/videos/... or https:// .mp4/.webm). */
      videoUrl: z.string().max(512).nullable().default(null),
      /** Poster image shown before video loads and under reduced-motion/data-saver. */
      posterUrl: z.string().max(512).nullable().default(null),
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
      font: z.enum(FONT_VALUES).default("inter"),
      headingFont: z.enum(HEADING_FONT_VALUES).default("inherit"),
      customFontUrl: customFontUrlField,
      /** Display name shown in the editor only — never interpolated into CSS. */
      customFontName: z.string().max(60).nullable().default(null),
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
      backgroundMotion: z.enum(BACKGROUND_MOTIONS).default("drift"),
      glow: z.boolean().default(true),
      noise: z.boolean().default(false),
      entrance: z.enum(ENTRANCE_OPTIONS).default("rise"),
      stagger: z.boolean().default(false),
      cardHover: z.enum(CARD_HOVER_OPTIONS).default("none"),
    })
    .default({}),
});

export const layoutSchema = z.object({
  mode: z.enum(LAYOUT_MODES).default("stack"),
  blocksPosition: z.enum(BLOCKS_POSITIONS).default("above-links"),
  width: z.number().int().min(320).max(960).default(480),
  alignment: z.enum(CARD_ALIGNMENTS).default("center"),
  gap: z.number().int().min(4).max(32).default(12),
  showAvatar: z.boolean().default(true),
  showStatus: z.boolean().default(true),
  showLocation: z.boolean().default(true),
  showViewCount: z.boolean().default(false),
});

export const DEFAULT_IDENTITY_FRAME: CanvasFrame = { x: 20, y: 36, w: 60, h: null, z: 10 };
export const DEFAULT_LINKS_FRAME: CanvasFrame = { x: 20, y: 290, w: 60, h: null, z: 20 };

export const canvasSchema = z.object({
  width: z.number().int().min(480).max(1120).default(880),
  height: z.number().int().min(420).max(2400).default(720),
  gridSnap: z
    .number()
    .int()
    .refine((v): v is (typeof GRID_SNAP_OPTIONS)[number] => (GRID_SNAP_OPTIONS as readonly number[]).includes(v), {
      message: "Invalid grid snap",
    })
    .default(8),
  /** Automatically reflows freeform canvas items into a readable vertical stack on phones. */
  mobileStack: z.boolean().default(true),
  identityFrame: canvasFrameSchema.default(DEFAULT_IDENTITY_FRAME),
  linksFrame: canvasFrameSchema.default(DEFAULT_LINKS_FRAME),
});

export type CanvasConfig = z.infer<typeof canvasSchema>;

/** Partial layout/typography overrides per breakpoint. Absent fields inherit Desktop. */
export const breakpointOverrideSchema = z.object({
  width: z.number().int().min(320).max(960).optional(),
  gap: z.number().int().min(4).max(32).optional(),
  padding: z.number().int().min(8).max(64).optional(),
  baseSize: z.number().int().min(12).max(22).optional(),
  alignment: z.enum(CARD_ALIGNMENTS).optional(),
  canvasStack: z.boolean().optional(),
});

export type BreakpointOverride = z.infer<typeof breakpointOverrideSchema>;

export const breakpointsSchema = z.object({
  mobile: breakpointOverrideSchema.default({}),
  tablet: breakpointOverrideSchema.default({}),
});

export const profileConfigSchema = z.object({
  // Any stored version (1 or 2) normalises to 2.
  version: z.preprocess(() => 2, z.literal(2).default(2)),
  theme: themeSchema.default({}),
  layout: layoutSchema.default({}),
  canvas: canvasSchema.default({}),
  blocks: z.preprocess(
    // Guard against oversized input arrays before running collection constraints.
    (v) => (Array.isArray(v) && v.length > MAX_BLOCKS ? v.slice(0, MAX_BLOCKS + 1) : v),
    z
      .array(blockSchema)
      .max(MAX_BLOCKS)
      .default([])
      .superRefine((blocks, ctx) => {
        const seen = new Set<string>();
        for (let i = 0; i < blocks.length; i++) {
          const block = blocks[i];
          if (seen.has(block.id)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate block id", path: [i] });
          }
          seen.add(block.id);
        }
      }),
  ),
  groups: z.preprocess(
    (v) => (Array.isArray(v) && v.length > MAX_GROUPS ? v.slice(0, MAX_GROUPS + 1) : v),
    z
      .array(blockGroupSchema)
      .max(MAX_GROUPS)
      .default([])
      .superRefine((groups, ctx) => {
        const seen = new Set<string>();
        for (let i = 0; i < groups.length; i++) {
          const group = groups[i];
          if (seen.has(group.id)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate group id", path: [i] });
          }
          seen.add(group.id);
        }
      }),
  ),
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
    return (
      isRecord(input) || typeof input === "string" || typeof input === "boolean" || typeof input === "number"
        ? input
        : defaults
    ) as T;
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

function salvageGroups(input: unknown): BlockGroup[] {
  if (!Array.isArray(input)) return [];
  const out: BlockGroup[] = [];
  const seen = new Set<string>();
  for (const raw of input.slice(0, MAX_GROUPS)) {
    const parsed = blockGroupSchema.safeParse(raw);
    if (!parsed.success) continue;
    if (seen.has(parsed.data.id)) continue;
    seen.add(parsed.data.id);
    out.push(parsed.data);
  }
  return out;
}

/**
 * Ensures any legacy block bearing a `groupId` without a matching entry in
 * `groups[]` gets a visible, unlocked group record automatically.
 */
function reconcileGroups(blocks: ProfileBlock[], groups: BlockGroup[]): {
  blocks: ProfileBlock[];
  groups: BlockGroup[];
} {
  const nextGroups = [...groups];
  const known = new Set(nextGroups.map((g) => g.id));
  for (const block of blocks) {
    if (!block.groupId || known.has(block.groupId)) continue;
    if (nextGroups.length < MAX_GROUPS) {
      nextGroups.push({
        id: block.groupId,
        name: block.groupId,
        visible: true,
        locked: false,
        collapsed: false,
      });
      known.add(block.groupId);
    }
  }
  const validIds = new Set(nextGroups.map((g) => g.id));
  const nextBlocks = blocks.map((b) =>
    b.groupId && !validIds.has(b.groupId) ? { ...b, groupId: null } : b,
  );
  return { blocks: nextBlocks, groups: nextGroups };
}

export function normalizeProfileConfig(input: unknown): ProfileConfig {
  const parsed = profileConfigSchema.safeParse(input);
  if (parsed.success) {
    const reconciled = reconcileGroups(parsed.data.blocks, parsed.data.groups);
    return { ...parsed.data, ...reconciled };
  }

  const merged = deepMerge(DEFAULT_PROFILE_CONFIG, input);

  const theme = themeSchema.safeParse(merged.theme);
  const layout = layoutSchema.safeParse(merged.layout);
  const canvas = canvasSchema.safeParse(merged.canvas);
  const breakpoints = breakpointsSchema.safeParse(merged.breakpoints);

  const rawBlocks = isRecord(input) ? (input as AnyRecord).blocks : undefined;
  const rawGroups = isRecord(input) ? (input as AnyRecord).groups : undefined;
  const reconciled = reconcileGroups(salvageBlocks(rawBlocks), salvageGroups(rawGroups));

  return {
    version: 2,
    theme: theme.success ? theme.data : salvageSection(themeSchema, DEFAULT_PROFILE_CONFIG.theme, merged.theme),
    layout: layout.success ? layout.data : salvageSection(layoutSchema, DEFAULT_PROFILE_CONFIG.layout, merged.layout),
    canvas: canvas.success ? canvas.data : salvageSection(canvasSchema, DEFAULT_PROFILE_CONFIG.canvas, merged.canvas),
    blocks: reconciled.blocks,
    groups: reconciled.groups,
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
function salvageSection<T extends z.ZodObject<z.ZodRawShape>>(
  schema: T,
  defaults: z.infer<T>,
  input: unknown,
): z.infer<T> {
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

/** Returns blocks that should be visible to visitors (respecting group visibility). */
export function filterVisibleBlocks(blocks: ProfileBlock[], groups: BlockGroup[] = []): ProfileBlock[] {
  const hiddenGroups = new Set(groups.filter((g) => !g.visible).map((g) => g.id));
  return blocks.filter((b) => b.visible && (!b.groupId || !hiddenGroups.has(b.groupId)));
}

/** Returns true when a block is directly locked or inside a locked group. */
export function isBlockLocked(block: ProfileBlock, groups: BlockGroup[] = []): boolean {
  if (block.locked) return true;
  if (!block.groupId) return false;
  return groups.some((g) => g.id === block.groupId && g.locked);
}

/**
 * Produces the CSS custom properties consumed by the public profile renderer.
 * Values are drawn exclusively from validated tokens, so nothing user-authored
 * can escape into a raw `style` attribute.
 */
export function themeToCssVars(
  theme: ThemeTokens,
  layout: LayoutTokens,
  canvas?: CanvasConfig,
): Record<string, string> {
  const radius: Record<string, string> = {
    none: "0px",
    sm: "6px",
    md: "10px",
    lg: "14px",
    xl: "20px",
    full: "999px",
  };

  const { background: bg, card, text, typography, buttons, effects } = theme;
  const mid = bg.gradientMid ?? text.accent;

  const backdrop =
    bg.type === "solid"
      ? bg.color
      : bg.type === "gradient"
        ? bg.gradientMid
          ? `linear-gradient(${bg.gradientAngle}deg, ${bg.gradientFrom} 0%, ${bg.gradientMid} 52%, ${bg.gradientTo} 100%)`
          : `linear-gradient(${bg.gradientAngle}deg, ${bg.gradientFrom}, ${bg.gradientTo})`
        : bg.type === "mesh"
          ? `radial-gradient(at 18% 22%, ${bg.gradientFrom} 0px, transparent 58%), radial-gradient(at 82% 18%, ${mid} 0px, transparent 52%), radial-gradient(at 74% 84%, ${bg.gradientTo} 0px, transparent 58%), ${bg.color}`
          : bg.gradientFrom; // image/video rendered via dedicated child layers

  const hasCustomFont = safeFontUrl(typography.customFontUrl) !== null;
  const resolvedBodyFont: FontValue =
    typography.font === "custom" && !hasCustomFont ? "inter" : typography.font;
  const resolvedHeadingFont: FontValue =
    typography.headingFont === "inherit"
      ? resolvedBodyFont
      : typography.headingFont === "custom" && !hasCustomFont
        ? resolvedBodyFont
        : typography.headingFont;

  const baseShadow =
    card.shadow === "none"
      ? "none"
      : card.shadow === "soft"
        ? "0 8px 24px -12px rgba(0,0,0,0.45)"
        : "0 24px 70px -30px rgba(0,0,0,0.75)";

  const glowRing = effects.glow
    ? "0 0 60px -22px color-mix(in srgb, var(--p-accent) 42%, transparent)"
    : "";
  const combinedShadow =
    baseShadow === "none" ? glowRing || "none" : glowRing ? `${baseShadow}, ${glowRing}` : baseShadow;

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
    "--p-card-shadow": combinedShadow,
    "--p-text": text.primary,
    "--p-muted": text.muted,
    "--p-accent": text.accent,
    "--p-font": FONT_STACKS[resolvedBodyFont],
    "--p-heading-font": FONT_STACKS[resolvedHeadingFont],
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
    "--p-flex-align": layout.alignment === "center" ? "center" : "flex-start",
    "--p-canvas-width": `${canvas?.width ?? 880}px`,
    "--p-canvas-height": `${canvas?.height ?? 720}px`,
  };
}

/** Applies a theme's partial token set over the defaults (used by the seeder + standalone previews). */
export function configWithTheme(tokens: unknown): ProfileConfig {
  return normalizeProfileConfig({ version: 2, theme: tokens });
}

/**
 * Applies a theme to an existing draft while preserving the user's blocks,
 * layer groups, responsive overrides, layout mode, canvas geometry, and any
 * uploaded custom font file (so switching themes never deletes authored work).
 */
export function applyThemeToConfig(current: unknown, themeTokens: unknown): ProfileConfig {
  const existing = normalizeProfileConfig(current);
  const nextTheme = configWithTheme(themeTokens).theme;

  // Retain the uploaded font asset reference so the user can switch back to it
  // in one click even if the chosen preset uses a Google Font.
  if (!nextTheme.typography.customFontUrl && existing.theme.typography.customFontUrl) {
    nextTheme.typography.customFontUrl = existing.theme.typography.customFontUrl;
    nextTheme.typography.customFontName = existing.theme.typography.customFontName;
  }

  return normalizeProfileConfig({
    ...existing,
    version: 2,
    theme: nextTheme,
  });
}
