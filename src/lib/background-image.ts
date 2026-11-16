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

    if (raw.startsWith("/")) {
        if (raw.startsWith("//")) return null;
        return isCssSafe(raw) ? raw : null;
    }

    try {
        const parsed = new URL(raw);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
        const normalized = parsed.toString();
        return isCssSafe(normalized) ? normalized : null;
    } catch {
        return null;
    }
}

export function backgroundImageFor(
    background: { type: string; imageUrl?: string | null } | null | undefined,
): string | null {
    if (!background || background.type !== "image") return null;
    return safeBackgroundUrl(background.imageUrl);
}

function isCssSafe(url: string): boolean {
    return !/[\s"'()\\;{}<>]/.test(url);
}