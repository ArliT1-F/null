/**
 * Resolves and validates media URLs used by profile presentation.
 *
 * Every helper enforces strict scheme and character rules so `javascript:`,
 * `data:`, protocol-relative URLs, embedded credentials, and CSS/HTML break-out
 * characters (`"`, `'`, `(`, `)`, `\`, `;`, `{`, `}`, `<`, `>`, whitespace)
 * never reach a generated stylesheet or DOM attribute.
 */

function isCssSafe(url: string): boolean {
  return !/[\s"'()\\;{}<>]/.test(url);
}

export function safeBackgroundUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;

  if (raw.startsWith("/")) {
    if (raw.startsWith("//")) return null;
    return isCssSafe(raw) ? raw : null;
  }

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (parsed.username || parsed.password) return null;
    const normalized = parsed.toString();
    return isCssSafe(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

/**
 * Image painted behind the profile:
 *  - For `type: "image"`, the configured background image.
 *  - For `type: "video"`, the poster fallback (or `imageUrl` when no dedicated
 *    poster is set), guaranteeing instant SSR paint and reduced-motion/data-saver
 *    fallback.
 */
export function backgroundImageFor(
  background: { type: string; imageUrl?: string | null; posterUrl?: string | null } | null | undefined,
): string | null {
  if (!background) return null;
  if (background.type === "image") return safeBackgroundUrl(background.imageUrl);
  if (background.type === "video") {
    return safeBackgroundUrl(background.posterUrl) ?? safeBackgroundUrl(background.imageUrl);
  }
  return null;
}

const VIDEO_EXT = /\.(mp4|webm)$/i;

/**
 * Validates a background video URL. Accepts same-origin uploaded video assets
 * (`/api/media/videos/...`) or direct `https://` `.mp4`/`.webm` files with no
 * credentials.
 */
export function safeVideoUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw || !isCssSafe(raw)) return null;

  if (raw.startsWith("/")) {
    if (raw.startsWith("//") || raw.includes("..")) return null;
    const pathname = raw.split("?")[0] ?? "";
    return VIDEO_EXT.test(pathname) ? raw : null;
  }

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    if (!VIDEO_EXT.test(parsed.pathname)) return null;
    const normalized = parsed.toString();
    return isCssSafe(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

export function backgroundVideoFor(
  background: { type: string; videoUrl?: string | null } | null | undefined,
): string | null {
  if (!background || background.type !== "video") return null;
  return safeVideoUrl(background.videoUrl);
}

export function videoMimeFor(url: string): "video/mp4" | "video/webm" {
  const pathOnly = url.split("?")[0]?.toLowerCase() ?? "";
  return pathOnly.endsWith(".webm") ? "video/webm" : "video/mp4";
}

const FONT_EXT = /\.(woff2|woff|ttf|otf)$/i;

/**
 * Validates an uploaded font URL. Only uploaded fonts served from our own media
 * pipeline (or a configured `https://` S3/R2 CDN path under `/fonts/`) are
 * accepted — visitors never make third-party font requests.
 */
export function safeFontUrl(
  value: string | null | undefined,
  allowedCdnBase?: string | null,
): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw || !isCssSafe(raw)) return null;

  if (raw.startsWith("/")) {
    if (raw.startsWith("//") || raw.includes("..") || raw.includes("?") || raw.includes("#")) return null;
    if (!/^\/(?:api\/)?media\/fonts\/(?:[a-zA-Z0-9_-]+\/)+[a-zA-Z0-9._-]+$/.test(raw)) return null;
    return FONT_EXT.test(raw) ? raw : null;
  }

  const cdnBase = allowedCdnBase?.trim();
  if (!cdnBase) return null;

  try {
    const allowedOrigin = new URL(cdnBase).origin;
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" || parsed.origin !== allowedOrigin) return null;
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    if (!parsed.pathname.includes("/fonts/") || !parsed.pathname.split("/").every((s) => s !== "..")) {
      return null;
    }
    if (!FONT_EXT.test(parsed.pathname)) return null;
    const normalized = parsed.toString();
    return isCssSafe(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

export function fontFormatFor(url: string): "woff2" | "woff" | "truetype" | "opentype" {
  const lower = url.toLowerCase();
  if (lower.endsWith(".woff2")) return "woff2";
  if (lower.endsWith(".woff")) return "woff";
  if (lower.endsWith(".otf")) return "opentype";
  return "truetype";
}
