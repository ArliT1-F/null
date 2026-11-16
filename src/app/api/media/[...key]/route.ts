import { StorageNotFoundError, assertSafeKey, getStorage } from "@/lib/storage";

/**
 * GET /api/media/[...key] — serves a stored object. See docs/API.md.
 *
 * Keys are generated server-side (`avatars/<userId>/<year>/<asset>@256.webp`),
 * so this route only has to refuse anything that is not a plain path: no
 * traversal, no backslashes, no unexpected characters (`assertSafeKey`), and
 * only inside the folders the pipeline writes to.
 *
 * The object bytes are user-supplied images, so the response is deliberately
 * inert: `nosniff`, immutable caching, and the sandboxing CSP that
 * next.config.ts also applies to this path.
 */

export const runtime = "nodejs";

/** Only these top-level folders are produced by the media pipeline. */
const ALLOWED_ROOTS = new Set(["avatars", "backgrounds", "galleries", "audio", "uploads"]);

function notFound() {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const segments = Array.isArray(key) ? key : [];

  let storageKey: string;
  try {
    // A real key always names a folder *and* a file (`avatars/<user>/…/x.webp`);
    // a bare folder name is never an object.
    if (segments.length < 2) return notFound();
    if (!ALLOWED_ROOTS.has(segments[0] ?? "")) return notFound();
    storageKey = segments.join("/");
    assertSafeKey(storageKey);
  } catch {
    return notFound();
  }

  try {
    const object = await getStorage().get(storageKey);
    if (!object) return notFound();

    return new Response(object.body, {
      status: 200,
      headers: {
        "Content-Type": object.contentType,
        "Content-Length": String(object.size),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    if (error instanceof StorageNotFoundError) return notFound();
    console.error("[media] could not read object", { storageKey, error });
    return new Response("Media unavailable", {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
