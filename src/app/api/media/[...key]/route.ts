import { env } from "@/lib/env";
import { parseByteRangeHeader } from "@/lib/media-verify";
import { StorageNotFoundError, assertSafeKey, getStorage } from "@/lib/storage";

/**
 * GET /api/media/[...key] — serves stored media objects (images, fonts, videos).
 *
 * Keys are generated server-side, restricted to pipeline roots, checked with
 * `assertSafeKey`, and returned strictly as inert data (`nosniff`, immutable
 * caching, and `Content-Security-Policy: default-src 'none'; sandbox`).
 * Supports HTTP `Range` (`206 Partial Content`) so video backgrounds stream
 * efficiently without downloading the full asset up front.
 */

export const runtime = "nodejs";

const ALLOWED_ROOTS = new Set([
  "avatars",
  "backgrounds",
  "galleries",
  "fonts",
  "videos",
  "audio",
  "uploads",
]);

function notFound() {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

function sandboxCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin) return {};
  if (origin === "null" || (env.proCssSandboxOrigin && origin === env.proCssSandboxOrigin)) {
    return { "Access-Control-Allow-Origin": origin, Vary: "Origin" };
  }
  return {};
}

export async function GET(request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const segments = Array.isArray(key) ? key : [];

  let storageKey: string;
  try {
    if (segments.length < 2) return notFound();
    if (!ALLOWED_ROOTS.has(segments[0] ?? "")) return notFound();
    storageKey = segments.join("/");
    assertSafeKey(storageKey);
  } catch {
    return notFound();
  }

  try {
    const storage = getStorage();
    const range = parseByteRangeHeader(request.headers.get("range"));
    if (range === "invalid") {
      return new Response("Range not satisfiable", {
        status: 416,
        headers: { "Cache-Control": "no-store" },
      });
    }

    if (range && storage.getRange) {
      const slice = await storage.getRange(storageKey, range.start, range.end);
      if (!slice) return notFound();
      if (slice === "unsatisfiable") {
        const whole = await storage.get(storageKey);
        await whole?.body.cancel().catch(() => {});
        return new Response("Range not satisfiable", {
          status: 416,
          headers: {
            "Cache-Control": "no-store",
            ...(whole ? { "Content-Range": `bytes */${whole.size}` } : {}),
          },
        });
      }
      return new Response(slice.body, {
        status: 206,
        headers: {
          "Content-Type": slice.contentType,
          "Content-Range": `bytes ${slice.start}-${slice.end}/${slice.totalSize}`,
          "Content-Length": String(slice.size),
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
          "Cross-Origin-Resource-Policy": "cross-origin",
          "Content-Security-Policy": "default-src 'none'; sandbox",
          ...sandboxCorsHeaders(request),
        },
      });
    }

    const object = await storage.get(storageKey);
    if (!object) return notFound();

    return new Response(object.body, {
      status: 200,
      headers: {
        "Content-Type": object.contentType,
        "Content-Length": String(object.size),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "cross-origin",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        ...sandboxCorsHeaders(request),
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
