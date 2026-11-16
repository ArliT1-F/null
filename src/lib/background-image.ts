/**
 * Resolves the background image of a theme.
 *
 * The stored value is either a same-origin media path ("/api/media/...") — what
 * the editor writes after an upload — or an absolute http(s) URL pasted into the
 * URL field. Everything else is ignored: `javascript:` and `data:` URLs must
 * never reach the DOM, and the value is interpolated into a generated
 * stylesheet, so characters that could close the `url()` token or start a new
 * declaration are rejected outright (defence in depth — the schema only guards
 * the length).
 *
 * Returning `null` means "no background image"; callers simply omit the layer.
 */
export function safeBackgroundUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;

  // Same-origin path. "//host" is protocol-relative (a different origin), so it
  // is not a media path.
  if (raw.startsWith("/")) {
    if (raw.startsWith("//")) return null;
    return isCssSafe(raw) ? raw : null;
  }

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    // toString() normalises/percent-encodes the URL, which also neutralises
    // whitespace and other characters the URL parser tolerates.
    const normalized = parsed.toString();
    return isCssSafe(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

/** `null` unless the theme actually selected an image background with a usable URL. */
export function backgroundImageFor(
  background: { type: string; imageUrl?: string | null } | null | undefined,
): string | null {
  if (!background || background.type !== "image") return null;
  return safeBackgroundUrl(background.imageUrl);
}

function isCssSafe(url: string): boolean {
  // Anything that could terminate url(...) or open a new declaration/rule.
  return !/[\s"'()\\;{}<>]/.test(url);
}
