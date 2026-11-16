import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { MediaError, storeImage, type MediaKind } from "@/lib/media";
import { LIMITS, consume } from "@/lib/rate-limit";
import { isAllowedOrigin } from "@/lib/request";

/**
 * POST /api/media — upload an image. See docs/API.md.
 *
 * The editor posts multipart/form-data here (`file` + `kind`) and expects
 * `{ ok, id, url, width, height, size }` back. Validation happens by content,
 * not by name or declared type: `storeImage` decodes the bytes with sharp,
 * re-encodes them, and rejects anything it cannot read, so a renamed script or
 * a PDF never reaches storage.
 *
 * Node runtime is required — sharp and the local storage provider touch the
 * filesystem.
 */

export const runtime = "nodejs";

/** Kinds the editor can upload today (AUDIO/DOCUMENT have no upload path yet). */
const UPLOAD_KINDS = ["AVATAR", "BACKGROUND", "GALLERY"] as const;

function fail(message: string, status: number, headers?: Record<string, string>) {
  return NextResponse.json({ ok: false, error: message }, { status, headers });
}

export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) {
    return fail("Cross-origin uploads are not allowed.", 403);
  }

  const user = await getCurrentUser();
  if (!user) return fail("Sign in to upload images.", 401);

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
    const { asset, url } = await storeImage(file, kind as MediaKind, user.id);
    return NextResponse.json({
      ok: true,
      id: asset.id,
      url,
      width: asset.width,
      height: asset.height,
      size: asset.sizeBytes,
    });
  } catch (error) {
    if (error instanceof MediaError) return fail(error.message, error.status);
    // Never leak internals (paths, sharp messages) to the browser.
    console.error("[media] upload failed", error);
    return fail("The image could not be stored. Try again.", 500);
  }
}
