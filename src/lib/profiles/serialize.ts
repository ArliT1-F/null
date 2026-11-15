import type { PublishedProfile } from "./service";

/**
 * Cache boundary hydration.
 *
 * Anything retrieved through `unstable_cache` — or any other serializing cache —
 * comes back as plain JSON: `Date` values become ISO strings. Server components
 * then call date methods on them and throw at runtime.
 *
 * These helpers normalise the cached shape back into the domain type, so the
 * cached and uncached code paths return *identically shaped* objects. They are
 * deliberately pure and dependency-free so they can be unit tested directly.
 *
 * The input type is intentionally loose (`unknown` for the date) because a
 * cached value genuinely may be a `Date` (fresh write) or a string (JSON
 * round-trip); narrowing it to `Date` would only hide the bug.
 */

export type Hydrated<T> = Omit<T, "publishedAt"> & { publishedAt: Date };

export function rehydrateProfileDates<T extends { publishedAt: unknown }>(profile: T): Hydrated<T> {
  const raw = profile.publishedAt;
  return {
    ...(profile as object),
    publishedAt: raw instanceof Date ? raw : new Date(raw as string),
  } as Hydrated<T>;
}

/**
 * Nullable variant used by the public profile loader.
 *
 * A cache entry that survived a schema change, or was written by an older
 * version of the app, could carry an unparseable value. That must degrade to a
 * stale timestamp — never a 500 on someone's public profile.
 */
export function rehydrateNullableProfileDates<T extends { publishedAt: unknown }>(
  profile: T | null,
): Hydrated<T> | null {
  if (!profile) return null;

  const hydrated = rehydrateProfileDates(profile);
  if (Number.isNaN(hydrated.publishedAt.getTime())) {
    return { ...(profile as object), publishedAt: new Date(0) } as Hydrated<T>;
  }
  return hydrated;
}

/** Compile-time assertion that the hydrated shape matches the domain type. */
export type _HydratedMatchesDomain = Hydrated<PublishedProfile> extends PublishedProfile ? true : never;
