import { describe, expect, it } from "vitest";
import {
  rehydrateNullableProfileDates,
  rehydrateProfileDates,
} from "@/lib/profiles/serialize";

/**
 * Regression guard.
 *
 * An earlier build crashed every public profile with
 * `c.publishedAt.toISOString is not a function`, because `unstable_cache`
 * serialises its result through JSON and `Date` objects come back as strings.
 * These tests pin the cache-boundary contract so the same class of bug fails
 * here instead of in production.
 */

const base = {
  username: "arlit1",
  usernameDisplay: "ArliT1",
  displayName: "Arli",
  bio: null,
  avatarUrl: null,
  headline: null,
  location: null,
  statusText: null,
  config: {},
  links: [],
  revision: 1,
} as const;

describe("rehydrateProfileDates", () => {
  it("restores a JSON-stringified date into a real Date", () => {
    // Exactly what a serialising cache hands back.
    const cached = JSON.parse(JSON.stringify({ ...base, publishedAt: new Date("2026-01-02T03:04:05.000Z") }));

    expect(typeof cached.publishedAt).toBe("string");
    const hydrated = rehydrateProfileDates(cached);

    expect(hydrated.publishedAt).toBeInstanceOf(Date);
    expect(hydrated.publishedAt.toISOString()).toBe("2026-01-02T03:04:05.000Z");
  });

  it("is idempotent for values that are already Dates", () => {
    const date = new Date("2026-05-06T07:08:09.000Z");
    const hydrated = rehydrateProfileDates({ ...base, publishedAt: date });
    expect(hydrated.publishedAt).toBeInstanceOf(Date);
    expect(hydrated.publishedAt.getTime()).toBe(date.getTime());
  });

  it("preserves every other field untouched", () => {
    const hydrated = rehydrateProfileDates({ ...base, publishedAt: "2026-01-01T00:00:00.000Z" });
    expect(hydrated.username).toBe("arlit1");
    expect(hydrated.usernameDisplay).toBe("ArliT1");
    expect(hydrated.revision).toBe(1);
  });
});

describe("rehydrateNullableProfileDates", () => {
  it("passes null through", () => {
    expect(rehydrateNullableProfileDates(null)).toBeNull();
  });

  it("hydrates a cached profile", () => {
    const hydrated = rehydrateNullableProfileDates({ ...base, publishedAt: "2026-03-04T05:06:07.000Z" });
    expect(hydrated!.publishedAt).toBeInstanceOf(Date);
    expect(hydrated!.publishedAt.toISOString()).toBe("2026-03-04T05:06:07.000Z");
  });

  it("falls back to the epoch for an unparseable value instead of throwing", () => {
    // A stale cache entry written by an older schema must never 500 the page.
    const hydrated = rehydrateNullableProfileDates({ ...base, publishedAt: "not-a-date" });
    expect(hydrated!.publishedAt).toBeInstanceOf(Date);
    expect(hydrated!.publishedAt.getTime()).toBe(0);
  });
});
