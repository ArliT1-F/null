import { db, pool } from "@/db/client";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { publishProfile } from "@/lib/profiles/service";
import { createLink } from "@/lib/profiles/service";

async function main() {
  const [u] = await db.select().from(users).where(eq(users.username, "arlit1")).limit(1);
  if (!u) throw new Error("no user");
  const { getProfileForUser } = await import("@/lib/profiles/service");
  const p = await getProfileForUser(u.id);
  if (!p) throw new Error("no profile");
  const existing = await db.query.profileLinks.findMany?.();
  void existing;
  const links = [
    { label: "Photography", url: "https://instagram.com/arli", icon: "INSTAGRAM" },
    { label: "Open source", url: "https://github.com/arli", icon: "GITHUB" },
    { label: "Latest video", url: "https://youtube.com/@arli", icon: "YOUTUBE" },
    { label: "Now playing", url: "https://open.spotify.com/user/arli", icon: "SPOTIFY", highlight: true },
    { label: "Email me", url: "mailto:arli@example.com", icon: "MAIL" },
  ];
  for (const l of links) await createLink(p.id, l as any);
  const r = await publishProfile(u.id);
  console.log("published v" + r.version);
  await pool.end();
}
main();
