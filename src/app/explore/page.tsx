import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { Compass } from "lucide-react";
import { db } from "@/db/client";
import { profiles, users } from "@/db/schema";
import { ProfilePreviewCard } from "@/components/profile-preview-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { EmptyState } from "@/components/ui";
import { normalizeProfileConfig } from "@/lib/profile-config";

export const metadata: Metadata = {
  title: "Explore profiles",
  description: "Recently published Vessel profiles.",
};

export const revalidate = 60;

const PAGE_SIZE = 12;

/**
 * Public discovery page.
 *
 * Only published, PUBLIC, active profiles appear — an unlisted or private
 * profile is never listed here even though it may be reachable directly.
 */
export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const rows = await db
    .select({
      username: users.username,
      usernameDisplay: users.usernameDisplay,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      config: profiles.publishedSnapshot,
      themeSlug: profiles.themeSlug,
      publishedAt: profiles.publishedAt,
    })
    .from(profiles)
    .innerJoin(users, eq(users.id, profiles.userId))
    .where(
      and(
        eq(users.status, "ACTIVE"),
        eq(profiles.visibility, "PUBLIC"),
        isNotNull(profiles.publishedSnapshot),
        isNotNull(profiles.publishedAt),
      ),
    )
    .orderBy(desc(profiles.publishedAt))
    .limit(PAGE_SIZE)
    .offset(offset);

  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(profiles)
    .innerJoin(users, eq(users.id, profiles.userId))
    .where(
      and(
        eq(users.status, "ACTIVE"),
        eq(profiles.visibility, "PUBLIC"),
        isNotNull(profiles.publishedSnapshot),
        isNotNull(profiles.publishedAt),
      ),
    );

  const total = countRows[0]?.count ?? 0;
  const hasMore = offset + rows.length < total;

  return (
    <div>
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="mb-10 max-w-xl">
          <p className="eyebrow">Discover</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.02em]">
            Recently published
          </h1>
          <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
            {total > 0
              ? `${total} public profile${total === 1 ? "" : "s"} on this instance, newest first.`
              : "No profiles have been published on this instance yet."}
          </p>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={Compass}
            title="Nothing published yet"
            description="Be the first — claim a username, design your page and hit publish."
            action={
              <Link href="/register" className="btn-primary">
                Create your profile
              </Link>
            }
          />
        ) : (
          <>
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((row) => {
                const snapshot = row.config as { config?: unknown } | null;
                const config = normalizeProfileConfig(snapshot?.config ?? {});
                return (
                  <li key={row.username}>
                    <Link
                      href={`/${row.username}`}
                      className="group block overflow-hidden rounded-2xl border border-ink-200/80 bg-white p-2 shadow-panel transition-transform duration-300 hover:-translate-y-1 dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none"
                    >
                      <ProfilePreviewCard config={config} className="pointer-events-none min-h-[320px]" />
                      <div className="flex items-center justify-between px-2 pb-1 pt-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{row.displayName || row.usernameDisplay}</p>
                          <p className="truncate text-[11px] text-ink-400">@{row.usernameDisplay}</p>
                        </div>
                        <span className="chip shrink-0">{row.themeSlug}</span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>

            <nav className="mt-10 flex items-center justify-between" aria-label="Pagination">
              {page > 1 ? (
                <Link href={`/explore?page=${page - 1}`} className="btn-ghost">
                  ← Previous
                </Link>
              ) : (
                <span />
              )}
              <span className="text-xs text-ink-400">Page {page}</span>
              {hasMore ? (
                <Link href={`/explore?page=${page + 1}`} className="btn-ghost">
                  Next →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
