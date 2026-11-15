import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { profileLinks, profiles, users } from "@/db/schema";
import { LIMITS, consume } from "@/lib/rate-limit";
import { clientIpHash, isAllowedOrigin } from "@/lib/request";

/**
 * POST /api/track/link  —  body `{ username, linkId }`
 *
 * Counts a click on a link that is currently published.
 *
 * Privacy: no cookie, no fingerprint, no stored identifier. The only effect is a
 * counter increment on an aggregate row. Nothing is written for a visitor who
 * blocks the request, and the visitor is never told anything failed.
 */
export async function POST(request: Request) {
  // Same-origin only, so a third-party page cannot inflate someone's counters.
  if (!isAllowedOrigin(request)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const limit = consume(
    `track:${clientIpHash(request) ?? "anon"}`,
    LIMITS.publicProfile.limit,
    LIMITS.publicProfile.windowMs,
  );
  // Over the limit: accept and drop, so throttling is invisible to visitors.
  if (!limit.allowed) return NextResponse.json({ ok: true });

  let body: { username?: string; linkId?: string };
  try {
    body = (await request.json()) as { username?: string; linkId?: string };
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (!body.username || !body.linkId) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Resolve the profile and prove the link is part of the published snapshot
  // before counting it — an unpublished or foreign link never increments.
  const rows = await db
    .select({
      profileId: profiles.id,
      snapshot: profiles.publishedSnapshot,
    })
    .from(profiles)
    .innerJoin(users, eq(users.id, profiles.userId))
    .where(and(eq(users.username, body.username.toLowerCase()), eq(users.status, "ACTIVE")))
    .limit(1);

  const row = rows[0];
  if (!row) return NextResponse.json({ ok: true });

  const snapshot = row.snapshot as { links?: { id: string }[] } | null;
  const publishedIds = new Set((snapshot?.links ?? []).map((link) => link.id));
  if (!publishedIds.has(body.linkId)) return NextResponse.json({ ok: true });

  await db
    .update(profileLinks)
    .set({ clicks: sql`${profileLinks.clicks} + 1` })
    .where(and(eq(profileLinks.id, body.linkId), eq(profileLinks.profileId, row.profileId)));

  return NextResponse.json({ ok: true });
}
