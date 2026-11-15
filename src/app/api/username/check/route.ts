import { NextResponse } from "next/server";
import { usernameTaken } from "@/lib/profiles/service";
import { LIMITS, consume } from "@/lib/rate-limit";
import { clientIpHash } from "@/lib/request";
import { validateUsername } from "@/lib/username";

/**
 * GET /api/username/check?u=name
 *
 * Availability probe for the registration form. Rate limited by IP because it
 * is unauthenticated and reveals whether a username exists.
 */
export async function GET(request: Request) {
  const key = `username-check:${clientIpHash(request) ?? "anon"}`;
  const limit = consume(key, LIMITS.usernameCheck.limit, LIMITS.usernameCheck.windowMs);
  if (!limit.allowed) {
    return NextResponse.json(
      { available: false, reason: "Too many checks. Slow down a moment." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const raw = new URL(request.url).searchParams.get("u") ?? "";
  const check = validateUsername(raw);

  if (!check.ok) {
    return NextResponse.json({ available: false, reason: check.reason });
  }

  const taken = await usernameTaken(check.username);
  return NextResponse.json(
    taken
      ? { available: false, reason: "That username is already taken." }
      : { available: true, username: check.username },
    { headers: { "Cache-Control": "no-store" } },
  );
}
