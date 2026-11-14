import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { getStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Liveness + readiness for uptime monitoring and container health checks.
 * Deliberately excluded from rate limiting and from auth: a monitor must be able
 * to hit it, and it exposes nothing beyond component status.
 */
export async function GET() {
  const started = Date.now();
  const checks: Record<string, "ok" | "error"> = { app: "ok", database: "error", storage: "error" };
  let healthy = true;

  try {
    await db.execute(sql`select 1`);
    checks.database = "ok";
  } catch {
    healthy = false;
  }

  try {
    // The storage driver is exercised through a harmless existence probe.
    await getStorage().exists("__healthcheck__");
    checks.storage = "ok";
  } catch {
    healthy = false;
  }

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      checks,
      latencyMs: Date.now() - started,
      timestamp: new Date().toISOString(),
    },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
