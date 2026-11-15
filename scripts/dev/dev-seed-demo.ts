import { db, pool } from "@/db/client";
import { users, profiles } from "@/db/schema";
import { hashPassword } from "@/lib/password";
import { DEFAULT_PROFILE_CONFIG } from "@/lib/profile-config";

async function main(){
const hash = await hashPassword("test-password-123");
const [u] = await db.insert(users).values({
  email: "arli@example.com", passwordHash: hash, username: "arlit1",
  usernameDisplay: "ArliT1", displayName: "Arli", emailVerifiedAt: new Date(),
  bio: "Designer and tinkerer from Tirana. Building small, careful things for the web.",
}).returning();
await db.insert(profiles).values({ userId: u.id, draftConfig: DEFAULT_PROFILE_CONFIG, themeSlug: "aurora" });
console.log("created", u.id, u.username);
await pool.end();
}
main();
