/**
 * V2 PostgreSQL integration suite.
 *
 * Exercises additive V2 tables (`saved_themes`, `profile_custom_css`), `FONT` &
 * `VIDEO` enum values, canvas/group/breakpoint publishing, theme application
 * without destructive layout resets, entitlement-gated Pro CSS isolation,
 * revision labels, arbitrary version diffs, and append-only restore.
 *
 * Skipped automatically when `TEST_DATABASE_URL` is unset.
 */

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  blockGroupSchema,
  blockSchema,
  createBlockId,
  createGroupId,
  DEFAULT_PROFILE_CONFIG,
  normalizeProfileConfig,
} from "@/lib/profile-config";

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

let db: typeof import("@/db/client").db;
let pool: typeof import("@/db/client").pool;
let schema: typeof import("@/db/schema");
let service: typeof import("@/lib/profiles/service");
let accounts: typeof import("@/lib/accounts");

const suffix = Date.now().toString(36).slice(-6);
const freeUsername = `v2free${suffix}`;
const proUsername = `v2pro${suffix}`;
let freeUserId = "";
let proUserId = "";

suite("V2 customization, saved themes, custom CSS & revision lifecycle", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.APP_URL ??= "http://localhost:3000";
    process.env.AUTH_SECRET ??= "test-secret-that-is-long-enough-for-validation";
    process.env.APP_ENCRYPTION_KEY ??= "dGVzdC1rZXktMzItYnl0ZXMtbG9uZy1lbm91Z2g=";
    process.env.FEATURE_PRO_CSS = "true";
    process.env.FEATURE_PRO_CSS_DEV_ALL = "false";
    process.env.PRO_CSS_SANDBOX_ORIGIN = "http://sandbox.localhost:3000";

    ({ db, pool } = await import("@/db/client"));
    schema = await import("@/db/schema");
    service = await import("@/lib/profiles/service");
    accounts = await import("@/lib/accounts");

    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(db, { migrationsFolder: "./src/db/migrations" });

    const r1 = await accounts.registerAccount({
      email: `${freeUsername}@example.test`,
      password: "irrelevant-password-123",
      username: freeUsername,
      passwordHash: "not-a-real-hash",
    });
    if (!r1.ok) throw new Error(`free reg failed: ${r1.reason}`);
    freeUserId = r1.userId;

    const r2 = await accounts.registerAccount({
      email: `${proUsername}@example.test`,
      password: "irrelevant-password-123",
      username: proUsername,
      passwordHash: "not-a-real-hash",
    });
    if (!r2.ok) throw new Error(`pro reg failed: ${r2.reason}`);
    proUserId = r2.userId;
    // Promote second user to ADMIN so they hold PRO entitlements.
    await db.update(schema.users).set({ role: "ADMIN" }).where(eq(schema.users.id, proUserId));
  });

  afterAll(async () => {
    for (const id of [freeUserId, proUserId]) {
      if (id) await db.delete(schema.users).where(eq(schema.users.id, id));
    }
    await pool?.end();
  });

  it("persists V2 canvas layout, groups, custom font, breakpoints & saves/applies custom themes without losing blocks", async () => {
    const group = blockGroupSchema.parse({ id: createGroupId(), name: "Hero Stack" });
    const textBlock = blockSchema.parse({
      id: createBlockId(),
      type: "text",
      groupId: group.id,
      locked: true,
      frame: { x: 15, y: 380, w: 70, h: 110, z: 30 },
      props: { content: "Designing tactile digital spaces.", size: "lg", tone: "accent" },
    });

    const draft = normalizeProfileConfig({
      ...DEFAULT_PROFILE_CONFIG,
      theme: {
        ...DEFAULT_PROFILE_CONFIG.theme,
        background: {
          ...DEFAULT_PROFILE_CONFIG.theme.background,
          type: "mesh",
          color: "#0b0d14",
          gradientFrom: "#1f2a52",
          gradientTo: "#13292a",
          meshAccent: "#3fcf9f",
        },
        typography: {
          ...DEFAULT_PROFILE_CONFIG.theme.typography,
          font: "space-grotesk",
          headingFont: "playfair",
          customFontUrl: "/api/media/fonts/u1/2026/brand.woff2",
          customFontName: "Studio Sans",
        },
      },
      layout: { ...DEFAULT_PROFILE_CONFIG.layout, mode: "canvas", width: 640 },
      canvas: { ...DEFAULT_PROFILE_CONFIG.canvas, height: 980, gridSnap: 16 },
      blocks: [textBlock],
      groups: [group],
      breakpoints: {
        tablet: { width: 540, gap: 14 },
        mobile: { width: 400, gap: 10, hideBackgroundMedia: true },
      },
    });

    await service.updateDraftConfig(freeUserId, draft);

    // Save custom theme and verify cross-user isolation
    const saved = await service.createSavedTheme(freeUserId, "My Studio Mesh", draft.theme);
    expect(saved.name).toBe("My Studio Mesh");
    const list = await service.listSavedThemes(freeUserId);
    expect(list.some((t) => t.id === saved.id)).toBe(true);
    // Other user cannot apply or delete someone else's saved theme
    await expect(service.applySavedTheme(proUserId, saved.id)).rejects.toThrow();
    expect(await service.deleteSavedTheme(proUserId, saved.id)).toBe(false);

    // Apply another theme then re-apply saved theme; blocks, groups & canvas survive intact
    const switched = await service.applyThemeForUser(freeUserId, "paper", {
      background: { type: "solid", color: "#faf8f4" },
      text: { primary: "#141414", muted: "#555555", accent: "#1155cc" },
    });
    expect(switched.theme.background.color).toBe("#faf8f4");
    expect(switched.layout.mode).toBe("canvas");
    expect(switched.blocks).toHaveLength(1);
    expect(switched.groups).toHaveLength(1);

    const reapplied = await service.applySavedTheme(freeUserId, saved.id);
    expect(reapplied.theme.background.type).toBe("mesh");
    expect(reapplied.theme.typography.font).toBe("space-grotesk");
    expect(reapplied.blocks[0]!.frame).toEqual(textBlock.frame);

    // Publish with a label and verify public snapshot
    const v1 = await service.publishProfile(freeUserId, "Initial V2 canvas launch");
    expect(v1.version).toBe(1);
    const live = await service.getPublishedProfile(freeUsername);
    expect(live).not.toBeNull();
    expect(live!.config.layout.mode).toBe("canvas");
    expect(live!.config.blocks).toHaveLength(1);
    expect(live!.config.groups).toHaveLength(1);
    expect(live!.config.breakpoints.mobile.gap).toBe(10);
    expect(live!.publishedCustomCss).toBeNull();
  });

  it("blocks FREE users from saving custom CSS on the server", async () => {
    await expect(
      service.saveDraftCustomCss(freeUserId, ".vp-card { border-radius: 32px; }"),
    ).rejects.toThrow(service.CustomCssError);
  });

  it("isolates draft vs published Pro CSS, rejects unsafe CSS, diffs arbitrary revisions, and restores append-only", async () => {
    // 1. Reject unsafe CSS
    await expect(
      service.saveDraftCustomCss(proUserId, ".vp-card { background: url(https://evil.example/x); }"),
    ).rejects.toThrow(service.CustomCssError);

    // 2. Save valid draft CSS — never leaks before publish
    const cssV1 = ".vp-card { border-radius: 32px; } @keyframes glow { to { opacity: 1; } }";
    const saved = await service.saveDraftCustomCss(proUserId, cssV1);
    expect(saved.compiledCss).toContain(".null-profile .vp-card");
    expect(saved.compiledCss).toContain("@keyframes null-u-glow");
    expect(await service.getPublishedProfile(proUsername)).toBeNull();

    // 3. Publish v1 with custom CSS + label
    const p1 = await service.publishProfile(proUserId, "v1 with custom CSS");
    expect(p1.version).toBe(1);
    const live1 = await service.getPublishedProfile(proUsername);
    expect(live1?.publishedCustomCss).toContain(".null-profile .vp-card");
    // Custom CSS never touches structured ProfileConfig JSONB
    expect("customCss" in (live1!.config as Record<string, unknown>)).toBe(false);

    // 4. Save different draft CSS — live v1 still serves original CSS until republished
    await service.saveDraftCustomCss(proUserId, ".vp-link { letter-spacing: 0.08em; }");
    const stillLive1 = await service.getPublishedProfile(proUsername);
    expect(stillLive1?.publishedCustomCss).toContain("border-radius:32px");
    expect(stillLive1?.publishedCustomCss).not.toContain("letter-spacing");

    // 5. Publish v2 (new CSS) and v3 (cleared CSS)
    const p2 = await service.publishProfile(proUserId, "v2 typography CSS");
    expect(p2.version).toBe(2);
    await service.saveDraftCustomCss(proUserId, "");
    const p3 = await service.publishProfile(proUserId, "v3 cleared CSS");
    expect(p3.version).toBe(3);

    const live3 = await service.getPublishedProfile(proUsername);
    expect(live3?.publishedCustomCss).toBeNull();

    // 6. Verify version labels & arbitrary baseline diff (v3 against v1)
    const proProfile = (await service.getProfileForUser(proUserId))!;
    const versions = await service.listVersions(proProfile.id, 10);
    expect(versions.map((v) => v.version)).toEqual([3, 2, 1]);
    expect(versions[0]!.label).toBe("v3 cleared CSS");
    expect(versions[2]!.label).toBe("v1 with custom CSS");

    const v3Id = versions[0]!.id;
    const v1Id = versions[2]!.id;
    const diff = await service.compareVersions(proProfile.id, v3Id, v1Id);
    expect(diff?.previousVersion).toBe(1);
    expect(diff?.changes.some((c) => c.path.toLowerCase().includes("css"))).toBe(true);

    // 7. Restore v1 -> creates append-only v4 and restores both draft & published custom CSS
    const restored = await service.restoreVersion(proUserId, v1Id);
    expect(restored.version).toBe(4);
    const live4 = await service.getPublishedProfile(proUsername);
    expect(live4?.publishedCustomCss).toContain("border-radius:32px");
    const editorData = await service.getEditorData(proUserId);
    expect(editorData?.customCss.draft).toBe(cssV1);
  });

  it("supports FONT and VIDEO rows in media_assets enum cleanly", async () => {
    const [fontRow] = await db
      .insert(schema.mediaAssets)
      .values({
        userId: freeUserId,
        kind: "FONT",
        storageKey: `fonts/${freeUserId}/2026/test.woff2`,
        provider: "local",
        mimeType: "font/woff2",
        sizeBytes: 1024,
        variants: [],
      })
      .returning();
    expect(fontRow.kind).toBe("FONT");

    const [videoRow] = await db
      .insert(schema.mediaAssets)
      .values({
        userId: freeUserId,
        kind: "VIDEO",
        storageKey: `videos/${freeUserId}/2026/loop.mp4`,
        provider: "local",
        mimeType: "video/mp4",
        sizeBytes: 4096,
        variants: [],
      })
      .returning();
    expect(videoRow.kind).toBe("VIDEO");
  });
});
