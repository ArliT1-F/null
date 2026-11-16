import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { MediaError, storeFont, storeImage, storeVideo, type MediaKind } from "@/lib/media";
import { LIMITS, consume } from "@/lib/rate-limit";
import { isAllowedOrigin } from "@/lib/request";

/**
 * POST /api/media — upload verified media (images, custom fonts, background videos).
 *
 * The editor posts `multipart/form-data` here (`file` + `kind`) and receives
 * `{ ok, id, url, width, height, size }`. Validation happens strictly by binary
 * content, never by filename or declared MIME type.
 */

export const runtime = "nodejs";

const UPLOAD_KINDS = ["AVATAR", "BACKGROUND", "GALLERY", "FONT", "VIDEO"] as const;

function fail(message: string, status: number, headers?: Record<string, string>) {
  return NextResponse.json({ ok: false, error: message }, { status, headers });
}

export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) {
    return fail("Cross-origin uploads are not allowed.", 403);
  }

  const user = await getCurrentUser();
  if (!user) return fail("Sign in to upload media.", 401);

  const limit = consume(`upload:${user.id}`, LIMITS.upload.limit, LIMITS.upload.windowMs);
  if (!limit.allowed) {
    return fail("Too many uploads. Try again later.", 429, {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("Expected a multipart/form-data upload.", 400);
  }

  const file = form.get("file");
  if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
    return fail("No file was uploaded.", 400);
  }

  const kind = String(form.get("kind") ?? "").toUpperCase();
  if (!(UPLOAD_KINDS as readonly string[]).includes(kind)) {
    return fail("Unsupported media kind.", 400);
  }

  try {
    const { asset, url } =
      kind === "FONT"
        ? await storeFont(file as File, user.id)
        : kind === "VIDEO"
          ? await storeVideo(file as File, user.id)
          : await storeImage(file as File, kind as MediaKind, user.id);

    return NextResponse.json({
      ok: true,
      id: asset.id,
      url,
      ...(asset.width !== undefined ? { width: asset.width } : {}),
      ...(asset.height !== undefined ? { height: asset.height } : {}),
      ...(asset.mimeType ? { mimeType: asset.mimeType } : {}),
      size: asset.sizeBytes,
    });
  } catch (error) {
    if (error instanceof MediaError) return fail(error.message, error.status);
    // Never leak internals (paths, parser messages) to the browser.
    console.error("[media] upload failed", error);
    return fail("The file could not be stored. Try again.", 500);
  }
}
