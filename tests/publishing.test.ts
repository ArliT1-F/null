/**
 * Integration tests against a real PostgreSQL database.
 *
 * These exercise the invariants that matter most: drafts never leak to visitors,
 * publishing is transactional and versioned, ownership is enforced, and
 * usernames are unique case-insensitively.
 *
 * Run with a disposable database:
 *   TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/null_test npm test
 * Without TEST_DATABASE_URL the suite is skipped rather than failed.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

let db: typeof import("@/db/client").db;
let pool: typeof import("@/db/client").pool;
let schema: typeof import("@/db/schema");
let service: typeof import("@/lib/profiles/service");
let accounts: typeof import("@/lib/accounts");
let migrate: () => Promise<void>;

let userId = "";
let username = `test${Date.now().toString(36).slice(-6)}`;

suite("profile publishing", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.AUTH_SECRET ??= "test-secret-that-is-long-enough-for-validation";
    process.env.APP_ENCRYPTION_KEY ??= "dGVzdC1rZXktMzItYnl0ZXMtbG9uZy1lbm91Z2g=";

    ({ db, pool } = await import("@/db/client"));
    schema = await import("@/db/schema");
    service = await import("@/lib/profiles/service");
    accounts = await import("@/lib/accounts");

    // Apply migrations through Drizzle's migrator so the schema matches prod.
    const { migrate: drizzleMigrate } = await import("drizzle-orm/node-postgres/migrator");
    migrate = async () => {
      await drizzleMigrate(db, { migrationsFolder: "./src/db/migrations" });
    };
    await migrate();

    const result = await accounts.registerAccount({
      email: `${username}@example.test`,
      password: "irrelevant-hash",
      username,
      passwordHash: "not-a-real-hash",
    });
    if (!result.ok) throw new Error(`registration failed: ${result.reason}`);
    userId = result.userId;
  });

  afterAll(async () => {
    if (userId) {
      await db.delete(schema.users).where(eq(schema.users.id, userId));
    }
    await pool?.end();
  });

  it("creates a profile with a draft but nothing published", async () => {
    const profile = await service.getProfileForUser(userId);
    expect(profile).not.toBeNull();
    expect(profile!.publishedSnapshot).toBeNull();
    expect(profile!.publishedAt).toBeNull();
  });

  it("does not expose a draft to visitors", async () => {
    const published = await service.getPublishedProfile(username);
    expect(published).toBeNull();
  });

  it("publishes the draft as version 1 and makes it publicly readable", async () => {
    await service.createLink((await service.getProfileForUser(userId))!.id, {
      label: "Website",
      url: "https://example.com",
      icon: "GLOBE",
    });

    const first = await service.publishProfile(userId);
    expect(first.version).toBe(1);

    const published = await service.getPublishedProfile(username);
    expect(published).not.toBeNull();
    expect(published!.links).toHaveLength(1);
    expect(published!.links[0].label).toBe("Website");
  });

  it("keeps edits private until the next publish, then bumps the version", async () => {
    await service.updateDraftConfig(userId, {
      theme: { text: { accent: "#ff0000" } },
    });
    await service.createLink((await service.getProfileForUser(userId))!.id, {
      label: "Second",
      url: "https://example.org",
    });

    const stillPublished = await service.getPublishedProfile(username);
    expect(stillPublished!.links).toHaveLength(1);
    expect(stillPublished!.config.theme.text.accent).not.toBe("#ff0000");

    const second = await service.publishProfile(userId);
    expect(second.version).toBe(2);

    const updated = await service.getPublishedProfile(username);
    expect(updated!.links).toHaveLength(2);
    expect(updated!.config.theme.text.accent).toBe("#ff0000");
  });

  it("does not publish hidden links", async () => {
    const profile = (await service.getProfileForUser(userId))!;
    const link = await service.createLink(profile.id, { label: "Hidden", url: "https://hidden.example" });
    await service.updateLink(profile.id, link.id, { visible: false });
    await service.publishProfile(userId);

    const published = await service.getPublishedProfile(username);
    expect(published!.links.map((l) => l.label)).not.toContain("Hidden");
  });

  it("hides a private profile from visitors", async () => {
    await service.updateIdentity(userId, { visibility: "PRIVATE" });
    expect(await service.getPublishedProfile(username)).toBeNull();
    await service.updateIdentity(userId, { visibility: "PUBLIC" });
    expect(await service.getPublishedProfile(username)).not.toBeNull();
  });

  it("restores an earlier version by publishing a new one", async () => {
    const profile = (await service.getProfileForUser(userId))!;
    const versions = await service.listVersions(profile.id, 10);
    const firstVersion = versions.find((v) => v.version === 1)!;

    const result = await service.restoreVersion(userId, firstVersion.id);
    expect(result.version).toBeGreaterThan(2);

    const restored = await service.getPublishedProfile(username);
    expect(restored!.links).toHaveLength(1);
    expect(restored!.links[0].label).toBe("Website");
  });

  it("enforces username uniqueness case-insensitively", async () => {
    const taken = await service.usernameTaken(username.toUpperCase());
    expect(taken).toBe(true);
    expect(await service.usernameTaken(`${username}-free`)).toBe(false);
  });

  it("refuses to register a username that differs only by case", async () => {
    const result = await accounts.registerAccount({
      email: `other-${username}@example.test`,
      password: "x",
      username: username.toUpperCase(),
      passwordHash: "hash",
    });
    expect(result.ok).toBe(false);
  });

  it("records click counts without exposing them publicly", async () => {
    const profile = (await service.getProfileForUser(userId))!;
    const links = await db.select().from(schema.profileLinks).where(eq(schema.profileLinks.profileId, profile.id));
    await service.recordLinkClick(profile.id, links[0].id);
    const after = await db.select().from(schema.profileLinks).where(eq(schema.profileLinks.id, links[0].id));
    expect(after[0].clicks).toBe(1);

    const published = await service.getPublishedProfile(username);
    expect(published!.links[0]).not.toHaveProperty("clicks");
  });

  // --- snapshot and history invariants -----------------------------------
  it("never publishes a snapshot without at least the profile identity", async () => {
    const profile = await service.getProfileForUser(userId);
    const snapshot = profile!.publishedSnapshot as {
      identity: Record<string, unknown>;
      config: unknown;
      links: unknown[];
    };
    expect(snapshot).toBeTruthy();
    expect(snapshot.identity).toBeDefined();
    expect(snapshot.identity.usernameDisplay).toBeTruthy();
    expect(Array.isArray(snapshot.links)).toBe(true);
    expect(snapshot.config).toBeDefined();
  });

  it("keeps history append-only: version numbers never repeat or skip", async () => {
    const profile = await service.getProfileForUser(userId);
    const versions = await service.listVersions(profile!.id, 100);
    const numbers = versions.map((v) => v.version).sort((a, b) => a - b);
    const expected = Array.from({ length: numbers.length }, (_, i) => i + 1);
    expect(numbers).toEqual(expected);
  });

  it("records the revision counter in step with published versions", async () => {
    const profile = await service.getProfileForUser(userId);
    const versions = await service.listVersions(profile!.id, 100);
    expect(profile!.revision).toBe(versions[0].version);
  });
});

// Imported late so the module graph is built after DATABASE_URL is set.
import { eq } from "drizzle-orm";
