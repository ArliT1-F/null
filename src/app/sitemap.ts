import type { MetadataRoute } from "next";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { profiles, users } from "@/db/schema";
import { env } from "@/lib/env";

export const revalidate = 3600;

/**
 * Sitemap.
 *
 * Only PUBLIC, published, active profiles are included. Unlisted profiles are
 * reachable by URL but deliberately excluded so they never become discoverable
 * through search.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.APP_URL;

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/explore`, changeFrequency: "hourly", priority: 0.8 },
    { url: `${base}/docs`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/legal/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/legal/privacy`, changeFrequency: "yearly", priority: 0.2 },
  ];

  let profileRoutes: MetadataRoute.Sitemap = [];
  try {
    const rows = await db
      .select({ username: users.username, publishedAt: profiles.publishedAt })
      .from(profiles)
      .innerJoin(users, eq(users.id, profiles.userId))
      .where(
        and(
          eq(users.status, "ACTIVE"),
          eq(profiles.visibility, "PUBLIC"),
          isNotNull(profiles.publishedAt),
          isNotNull(profiles.publishedSnapshot),
        ),
      )
      .orderBy(desc(profiles.publishedAt))
      .limit(5000);

    profileRoutes = rows.map((row) => ({
      url: `${base}/${row.username}`,
      lastModified: row.publishedAt ?? undefined,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));
  } catch {
    // The sitemap must still respond if the database is briefly unavailable.
  }

  return [...staticRoutes, ...profileRoutes];
}
