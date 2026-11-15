/**
 * Dev helper: mints a session cookie for a given username so the authenticated
 * surfaces can be exercised from curl during development. Never used in prod.
 */
import { db, pool } from "@/db/client";
import { users, sessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashToken, randomToken } from "@/lib/crypto";

async function main() {
  const username = process.argv[2] ?? "arlit1";
  const [u] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!u) throw new Error("user not found");
  const raw = randomToken(32);
  await db.insert(sessions).values({
    tokenHash: hashToken(raw),
    userId: u.id,
    expiresAt: new Date(Date.now() + 864e5),
    userAgent: "dev-script",
  });
  console.log(raw);
  await pool.end();
}
main();
