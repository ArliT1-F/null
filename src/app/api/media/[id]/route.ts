import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { deleteAsset } from "@/lib/media";
import { isAllowedOrigin } from "@/lib/request";

/**
 * DELETE /api/media/:id — deletes an owned asset and all of its variants.
 * See docs/API.md.
 *
 * `deleteAsset` scopes the lookup to the caller, so an asset belonging to
 * someone else is indistinguishable from one that does not exist: both answer
 * 404, which keeps the endpoint from confirming that an id is real.
 */

export const runtime = "nodejs";

function fail(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAllowedOrigin(request)) return fail("Cross-origin requests are not allowed.", 403);

  const user = await getCurrentUser();
  if (!user) return fail("Sign in first.", 401);

  const { id } = await params;
  if (!id || id.length > 64) return fail("Not found.", 404);

  const deleted = await deleteAsset(id, user.id);
  if (!deleted) return fail("Not found.", 404);

  return NextResponse.json({ ok: true });
}
