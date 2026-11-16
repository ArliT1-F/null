import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  profileCustomCss,
  profileLinks,
  profileVersions,
  profiles,
  savedThemes,
  users,
  type Profile,
  type ProfileLink,
  type SavedTheme,
} from "@/db/schema";
import { compileCustomCss, MAX_CUSTOM_CSS_LENGTH } from "@/lib/custom-css";
import { getEntitlements } from "@/lib/entitlements";
import {
  applyThemeToConfig,
  filterVisibleBlocks,
  normalizeProfileConfig,
  themeSchema,
  type ProfileConfig,
  type ThemeTokens,
} from "@/lib/profile-config";
import { diffSnapshots, type RevisionChange } from "@/lib/profile-diff";
import { validateUsername } from "@/lib/username";

/**
 * Profile domain service.
 *
 * The invariant this module protects: **editing never changes what visitors
 * see.** All edits touch `profiles.draftConfig` (and, when entitled, the
 * separate `profile_custom_css.draft_css`); `publishProfile()` snapshots the
 * validated state into `profiles.publishedSnapshot` + `profile_versions` inside
 * a single transaction.
 *
 * Raw user CSS NEVER enters `draftConfig` or `publishedSnapshot.config`
 * (guardrail #3), and is rendered solely via `PRO_CSS_SANDBOX_ORIGIN`
 * (guardrail #4).
 */

export type ProfileWithUser = {
  profile: Profile;
  user: {
    id: string;
    username: string;
    usernameDisplay: string;
    displayName: string | null;
    avatarUrl: string | null;
    status: string;
  };
  links: ProfileLink[];
};

export type PublicLink = {
  id: string;
  label: string;
  url: string;
  icon: string;
  highlight: boolean;
};

export type PublishedProfile = {
  username: string;
  usernameDisplay: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  headline: string | null;
  location: string | null;
  statusText: string | null;
  config: ProfileConfig;
  links: PublicLink[];
  /** Visible blocks in render order (respecting group visibility); full config retains hidden blocks. */
  blocks: ProfileConfig["blocks"];
  /** Compiled, scoped custom CSS — NEVER rendered on APP_URL; sandbox-origin only. */
  publishedCustomCss: string | null;
  revision: number;
  publishedAt: Date;
};

type StoredSnapshot = {
  config: unknown;
  links: PublicLink[];
  identity: {
    displayName: string | null;
    bio: string | null;
    avatarUrl: string | null;
    headline: string | null;
    location: string | null;
    statusText: string | null;
    usernameDisplay: string;
  };
  /** Optional revision label entered at publish time. */
  label?: string | null;
  /** Validated custom CSS captured at publish time (kept outside `config`). */
  customCss?: string | null;
  publishedAt?: string;
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getProfileForUser(userId: string) {
  const rows = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  return rows[0] ?? null;
}

export async function getEditorData(userId: string) {
  const profile = await getProfileForUser(userId);
  if (!profile) return null;

  const [links, userRows, cssRows, userSavedThemes] = await Promise.all([
    db
      .select()
      .from(profileLinks)
      .where(eq(profileLinks.profileId, profile.id))
      .orderBy(asc(profileLinks.position), asc(profileLinks.createdAt)),
    db.select().from(users).where(eq(users.id, userId)).limit(1),
    db.select().from(profileCustomCss).where(eq(profileCustomCss.profileId, profile.id)).limit(1),
    db
      .select()
      .from(savedThemes)
      .where(eq(savedThemes.userId, userId))
      .orderBy(desc(savedThemes.createdAt))
      .limit(40),
  ]);

  const user = userRows[0];
  if (!user) return null;

  return {
    profile,
    links,
    user,
    config: normalizeProfileConfig(profile.draftConfig),
    customCss: {
      draft: cssRows[0]?.draftCss ?? "",
      published: cssRows[0]?.publishedCss ?? null,
    },
    savedThemes: userSavedThemes,
    entitlements: getEntitlements({ id: user.id, role: user.role }),
  };
}

/**
 * Loads the published profile that a visitor should see.
 * Returns null when the profile does not exist, is unpublished, private, or the
 * owner's account is not active.
 */
export async function getPublishedProfile(username: string): Promise<PublishedProfile | null> {
  const canonical = username.toLowerCase();

  const rows = await db
    .select({
      profile: profiles,
      user: users,
      publishedCss: profileCustomCss.publishedCss,
    })
    .from(profiles)
    .innerJoin(users, eq(users.id, profiles.userId))
    .leftJoin(profileCustomCss, eq(profileCustomCss.profileId, profiles.id))
    .where(and(eq(users.username, canonical), eq(users.status, "ACTIVE")))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (row.profile.visibility === "PRIVATE") return null;
  if (!row.profile.publishedSnapshot) return null;

  const snapshot = row.profile.publishedSnapshot as StoredSnapshot;
  const config = normalizeProfileConfig(snapshot.config);

  // Re-check entitlement and re-compile stored CSS at read time (defence in depth).
  let publishedCustomCss: string | null = null;
  const entitlements = getEntitlements({ id: row.user.id, role: row.user.role });
  const rawCss = row.publishedCss ?? snapshot.customCss ?? null;
  if (entitlements.canPublishCustomCss && rawCss && rawCss.trim()) {
    const compiled = compileCustomCss(rawCss);
    if (compiled.ok && compiled.css) {
      publishedCustomCss = compiled.css;
    }
  }

  return {
    username: row.user.username,
    usernameDisplay: snapshot.identity?.usernameDisplay ?? row.user.usernameDisplay,
    displayName: snapshot.identity?.displayName || row.user.usernameDisplay,
    bio: snapshot.identity?.bio ?? row.user.bio,
    avatarUrl: snapshot.identity?.avatarUrl ?? row.user.avatarUrl,
    headline: snapshot.identity?.headline ?? null,
    location: snapshot.identity?.location ?? null,
    statusText: snapshot.identity?.statusText ?? null,
    config,
    links: (snapshot.links ?? []).filter((l) => l && l.url && l.label),
    blocks: filterVisibleBlocks(config.blocks, config.groups),
    publishedCustomCss,
    revision: row.profile.revision,
    publishedAt: row.profile.publishedAt ?? row.profile.updatedAt,
  };
}

/** Cheap existence check used by the route resolver before rendering. */
export async function usernameTaken(username: string): Promise<boolean> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username.toLowerCase()))
    .limit(1);
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Draft edits (config, theme presets, saved themes, custom CSS, identity)
// ---------------------------------------------------------------------------

export async function updateDraftConfig(userId: string, config: unknown): Promise<Profile> {
  const normalized = normalizeProfileConfig(config);
  const [updated] = await db
    .update(profiles)
    .set({ draftConfig: normalized, draftUpdatedAt: new Date() })
    .where(eq(profiles.userId, userId))
    .returning();
  if (!updated) throw new Error("Profile not found");
  return updated;
}

/**
 * Applies a theme's token preset to a user's draft while preserving their
 * authored blocks, layer groups, responsive breakpoint overrides, layout mode,
 * canvas positions, and uploaded font reference.
 */
export async function applyThemeForUser(
  userId: string,
  themeSlug: string,
  tokens: unknown,
): Promise<ProfileConfig> {
  const profile = await getProfileForUser(userId);
  if (!profile) throw new Error("Profile not found");

  const merged = applyThemeToConfig(profile.draftConfig, tokens);
  await db
    .update(profiles)
    .set({ draftConfig: merged, themeSlug, draftUpdatedAt: new Date() })
    .where(eq(profiles.id, profile.id));
  return merged;
}

export async function listSavedThemes(userId: string): Promise<SavedTheme[]> {
  return db
    .select()
    .from(savedThemes)
    .where(eq(savedThemes.userId, userId))
    .orderBy(desc(savedThemes.createdAt))
    .limit(40);
}

export async function createSavedTheme(
  userId: string,
  name: string,
  tokens: unknown,
): Promise<SavedTheme> {
  const cleanName = name.trim().slice(0, 60);
  if (!cleanName) throw new Error("Give your theme a name.");

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error("Account not found.");

  const entitlements = getEntitlements({ id: user.id, role: user.role });
  const existing = await db
    .select({ id: savedThemes.id })
    .from(savedThemes)
    .where(eq(savedThemes.userId, userId));
  if (existing.length >= entitlements.maxSavedThemes) {
    throw new Error(
      `You can save up to ${entitlements.maxSavedThemes} personal themes. Remove one to save another.`,
    );
  }

  const validTokens: ThemeTokens = themeSchema.parse(tokens);
  const [created] = await db
    .insert(savedThemes)
    .values({ userId, name: cleanName, tokens: validTokens })
    .returning();
  return created;
}

export async function applySavedTheme(userId: string, savedThemeId: string): Promise<ProfileConfig> {
  const [saved] = await db
    .select()
    .from(savedThemes)
    .where(and(eq(savedThemes.id, savedThemeId), eq(savedThemes.userId, userId)))
    .limit(1);
  if (!saved) throw new Error("Saved theme not found.");

  return applyThemeForUser(userId, "custom", saved.tokens);
}

export async function deleteSavedTheme(userId: string, savedThemeId: string): Promise<boolean> {
  const deleted = await db
    .delete(savedThemes)
    .where(and(eq(savedThemes.id, savedThemeId), eq(savedThemes.userId, userId)))
    .returning({ id: savedThemes.id });
  return deleted.length > 0;
}

export class CustomCssError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_ENTITLED" | "INVALID_CSS" | "NOT_FOUND" = "INVALID_CSS",
  ) {
    super(message);
    this.name = "CustomCssError";
  }
}

/**
 * Validates, scopes, and saves draft custom CSS in `profile_custom_css`.
 * Never touches `draftConfig`. Enforces entitlements at write time.
 */
export async function saveDraftCustomCss(
  userId: string,
  rawCss: string,
): Promise<{ draftCss: string; compiledCss: string }> {
  const rows = await db
    .select({ userId: users.id, role: users.role, profileId: profiles.id })
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new CustomCssError("Profile not found.", "NOT_FOUND");

  const entitlements = getEntitlements({ id: row.userId, role: row.role });
  if (!entitlements.canEditCustomCss) {
    throw new CustomCssError(
      entitlements.customCssDisabledReason ?? "Custom CSS is not available on this account.",
      "NOT_ENTITLED",
    );
  }

  const normalized = rawCss.replace(/\r\n/g, "\n");
  if (normalized.length > MAX_CUSTOM_CSS_LENGTH) {
    throw new CustomCssError(
      `Custom CSS exceeds the ${MAX_CUSTOM_CSS_LENGTH.toLocaleString()}-character limit.`,
      "INVALID_CSS",
    );
  }

  const compiled = compileCustomCss(normalized);
  if (!compiled.ok) {
    const first = compiled.diagnostics[0];
    throw new CustomCssError(
      first ? `Line ${first.line}:${first.column} — ${first.message}` : "Custom CSS has errors.",
      "INVALID_CSS",
    );
  }

  const now = new Date();
  await db
    .insert(profileCustomCss)
    .values({
      profileId: row.profileId,
      draftCss: normalized,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: profileCustomCss.profileId,
      set: { draftCss: normalized, updatedAt: now },
    });

  await touchDraft(row.profileId);
  return { draftCss: normalized, compiledCss: compiled.css };
}

export async function updateIdentity(
  userId: string,
  fields: {
    displayName?: string | null;
    bio?: string | null;
    headline?: string | null;
    location?: string | null;
    statusText?: string | null;
    themeSlug?: string;
    visibility?: Profile["visibility"];
  },
) {
  if (Object.keys(fields).length === 0) return;

  const profileFields: Partial<typeof profiles.$inferInsert> = {};
  if (fields.headline !== undefined) profileFields.headline = fields.headline;
  if (fields.location !== undefined) profileFields.location = fields.location;
  if (fields.statusText !== undefined) profileFields.statusText = fields.statusText;
  if (fields.themeSlug !== undefined) profileFields.themeSlug = fields.themeSlug;
  if (fields.visibility !== undefined) profileFields.visibility = fields.visibility;

  if (Object.keys(profileFields).length > 0) {
    profileFields.draftUpdatedAt = new Date();
    await db.update(profiles).set(profileFields).where(eq(profiles.userId, userId));
  }

  const userFields: Partial<typeof users.$inferInsert> = {};
  if (fields.displayName !== undefined) userFields.displayName = fields.displayName;
  if (fields.bio !== undefined) userFields.bio = fields.bio;
  if (Object.keys(userFields).length > 0) {
    await db.update(users).set(userFields).where(eq(users.id, userId));
  }
}

export async function setAvatar(userId: string, avatarUrl: string | null) {
  await db.update(users).set({ avatarUrl }).where(eq(users.id, userId));
  await db.update(profiles).set({ draftUpdatedAt: new Date() }).where(eq(profiles.userId, userId));
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

export async function createLink(
  profileId: string,
  input: { label: string; url: string; icon?: string; highlight?: boolean },
) {
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${profileLinks.position}), -1)` })
    .from(profileLinks)
    .where(eq(profileLinks.profileId, profileId));

  const [link] = await db
    .insert(profileLinks)
    .values({
      profileId,
      label: input.label,
      url: input.url,
      icon: input.icon ?? "LINK",
      highlight: input.highlight ?? false,
      position: Number(max) + 1,
    })
    .returning();

  await touchDraft(profileId);
  return link;
}

export async function updateLink(
  profileId: string,
  linkId: string,
  input: { label?: string; url?: string; icon?: string; highlight?: boolean; visible?: boolean },
) {
  const [link] = await db
    .update(profileLinks)
    .set(input)
    .where(and(eq(profileLinks.id, linkId), eq(profileLinks.profileId, profileId)))
    .returning();
  if (link) await touchDraft(profileId);
  return link ?? null;
}

export async function deleteLink(profileId: string, linkId: string) {
  const deleted = await db
    .delete(profileLinks)
    .where(and(eq(profileLinks.id, linkId), eq(profileLinks.profileId, profileId)))
    .returning({ id: profileLinks.id });
  if (deleted.length) await touchDraft(profileId);
  return deleted.length > 0;
}

export async function reorderLinks(profileId: string, orderedIds: string[]) {
  if (orderedIds.length === 0) return;

  const owned = await db
    .select({ id: profileLinks.id })
    .from(profileLinks)
    .where(eq(profileLinks.profileId, profileId));
  const ownedIds = new Set(owned.map((l) => l.id));

  const valid = orderedIds.filter((id) => ownedIds.has(id));
  if (valid.length === 0) return;

  await db.transaction(async (tx) => {
    for (const [index, id] of valid.entries()) {
      await tx.update(profileLinks).set({ position: index }).where(eq(profileLinks.id, id));
    }
    await tx.update(profiles).set({ draftUpdatedAt: new Date() }).where(eq(profiles.id, profileId));
  });
}

export async function recordLinkClick(profileId: string, linkId: string) {
  await db
    .update(profileLinks)
    .set({ clicks: sql`${profileLinks.clicks} + 1` })
    .where(and(eq(profileLinks.id, linkId), eq(profileLinks.profileId, profileId)));
}

async function touchDraft(profileId: string) {
  await db.update(profiles).set({ draftUpdatedAt: new Date() }).where(eq(profiles.id, profileId));
}

// ---------------------------------------------------------------------------
// Publish, history, diff & append-only restore
// ---------------------------------------------------------------------------

export type PublishResult = {
  version: number;
  publishedAt: Date;
  revision: number;
};

/**
 * Publishes the current draft atomically: validates config and (if present)
 * custom CSS, snapshots everything into `profile_versions` and
 * `profiles.publishedSnapshot`, updates `profile_custom_css.published_css`, and
 * bumps `revision`.
 */
export async function publishProfile(userId: string, label?: string): Promise<PublishResult> {
  return db.transaction(async (tx) => {
    const profileRows = await tx
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1)
      .for("update");

    const profile = profileRows[0];
    if (!profile) throw new Error("Profile not found");

    const userRows = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = userRows[0];
    if (!user) throw new Error("User not found");
    if (user.status !== "ACTIVE") throw new Error("Cannot publish: account is not active");

    const [links, cssRows] = await Promise.all([
      tx
        .select()
        .from(profileLinks)
        .where(and(eq(profileLinks.profileId, profile.id), eq(profileLinks.visible, true)))
        .orderBy(asc(profileLinks.position), asc(profileLinks.createdAt)),
      tx
        .select()
        .from(profileCustomCss)
        .where(eq(profileCustomCss.profileId, profile.id))
        .limit(1),
    ]);

    const cssRow = cssRows[0];
    const draftCss = cssRow?.draftCss ?? "";
    const entitlements = getEntitlements({ id: user.id, role: user.role });

    let nextPublishedCss: string | null = null;
    if (draftCss.trim() && entitlements.canPublishCustomCss) {
      const compiled = compileCustomCss(draftCss);
      if (!compiled.ok) {
        const first = compiled.diagnostics[0];
        throw new CustomCssError(
          first ? `Custom CSS error at line ${first.line}: ${first.message}` : "Custom CSS has errors.",
          "INVALID_CSS",
        );
      }
      nextPublishedCss = draftCss;
    }

    const [{ nextVersion }] = await tx
      .select({ nextVersion: sql<number>`coalesce(max(${profileVersions.version}), 0) + 1` })
      .from(profileVersions)
      .where(eq(profileVersions.profileId, profile.id));

    const version = Number(nextVersion);
    const now = new Date();
    const revision = profile.revision + 1;
    const cleanLabel = label?.trim().slice(0, 80) || null;

    const snapshot: StoredSnapshot = {
      config: normalizeProfileConfig(profile.draftConfig),
      identity: {
        usernameDisplay: user.usernameDisplay,
        displayName: user.displayName,
        bio: user.bio,
        avatarUrl: user.avatarUrl,
        headline: profile.headline,
        location: profile.location,
        statusText: profile.statusText,
      },
      links: links.map((link) => ({
        id: link.id,
        label: link.label,
        url: link.url,
        icon: link.icon,
        highlight: link.highlight,
      })),
      ...(cleanLabel ? { label: cleanLabel } : {}),
      ...(nextPublishedCss ? { customCss: nextPublishedCss } : {}),
      publishedAt: now.toISOString(),
    };

    await tx.insert(profileVersions).values({
      profileId: profile.id,
      version,
      snapshot,
    });

    await tx
      .update(profiles)
      .set({
        publishedSnapshot: snapshot,
        publishedAt: now,
        revision,
        updatedAt: now,
      })
      .where(eq(profiles.id, profile.id));

    if (cssRow || nextPublishedCss !== null) {
      await tx
        .insert(profileCustomCss)
        .values({
          profileId: profile.id,
          draftCss,
          publishedCss: nextPublishedCss,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: profileCustomCss.profileId,
          set: { publishedCss: nextPublishedCss, updatedAt: now },
        });
    }

    return { version, publishedAt: now, revision };
  });
}

/**
 * Restores a previous published version by copying its config, identity, links,
 * and optional custom CSS back into the draft and publishing as a new version
 * (strictly append-only — past versions are never deleted or overwritten).
 */
export async function restoreVersion(userId: string, versionId: string): Promise<PublishResult> {
  const profile = await getProfileForUser(userId);
  if (!profile) throw new Error("Profile not found");

  const versionRows = await db
    .select()
    .from(profileVersions)
    .where(and(eq(profileVersions.id, versionId), eq(profileVersions.profileId, profile.id)))
    .limit(1);
  const target = versionRows[0];
  if (!target) throw new Error("Version not found");

  const snapshot = target.snapshot as Partial<StoredSnapshot>;
  const normalizedConfig = normalizeProfileConfig(snapshot.config);
  const snapshotLinks = Array.isArray(snapshot.links) ? snapshot.links : [];
  const rawRestoredCss = typeof snapshot.customCss === "string" ? snapshot.customCss : "";
  const safeRestoredCss =
    rawRestoredCss.trim() && compileCustomCss(rawRestoredCss).ok ? rawRestoredCss : "";

  await db.transaction(async (tx) => {
    const now = new Date();
    await tx
      .update(profiles)
      .set({
        draftConfig: normalizedConfig,
        headline: snapshot.identity?.headline ?? profile.headline,
        location: snapshot.identity?.location ?? profile.location,
        statusText: snapshot.identity?.statusText ?? profile.statusText,
        draftUpdatedAt: now,
      })
      .where(eq(profiles.id, profile.id));

    if (snapshot.identity) {
      await tx
        .update(users)
        .set({
          displayName: snapshot.identity.displayName ?? undefined,
          bio: snapshot.identity.bio ?? undefined,
          avatarUrl: snapshot.identity.avatarUrl ?? null,
        })
        .where(eq(users.id, userId));
    }

    // Reconcile links (keep existing IDs when present so click counts survive rollback).
    const existing = await tx
      .select()
      .from(profileLinks)
      .where(eq(profileLinks.profileId, profile.id));
    const existingById = new Map(existing.map((l) => [l.id, l]));
    const keep = new Set<string>();

    for (const [index, link] of snapshotLinks.entries()) {
      const current = existingById.get(link.id);
      if (current) {
        keep.add(current.id);
        await tx
          .update(profileLinks)
          .set({
            label: link.label,
            url: link.url,
            icon: link.icon,
            highlight: link.highlight,
            visible: true,
            position: index,
          })
          .where(eq(profileLinks.id, current.id));
      } else {
        const [inserted] = await tx
          .insert(profileLinks)
          .values({
            profileId: profile.id,
            label: link.label,
            url: link.url,
            icon: link.icon,
            highlight: link.highlight,
            visible: true,
            position: index,
          })
          .returning({ id: profileLinks.id });
        keep.add(inserted.id);
      }
    }
    for (const link of existing) {
      if (!keep.has(link.id)) {
        await tx.delete(profileLinks).where(eq(profileLinks.id, link.id));
      }
    }

    // Restore custom CSS state (clearing it if the target version had none).
    const existingCss = await tx
      .select({ profileId: profileCustomCss.profileId })
      .from(profileCustomCss)
      .where(eq(profileCustomCss.profileId, profile.id))
      .limit(1);
    if (existingCss.length > 0 || safeRestoredCss) {
      await tx
        .insert(profileCustomCss)
        .values({
          profileId: profile.id,
          draftCss: safeRestoredCss,
          publishedCss: safeRestoredCss || null,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: profileCustomCss.profileId,
          set: {
            draftCss: safeRestoredCss,
            publishedCss: safeRestoredCss || null,
            updatedAt: now,
          },
        });
    }
  });

  return publishProfile(userId, `Restored from v${target.version}`);
}

export async function listVersions(profileId: string, limit = 20) {
  const rows = await db
    .select({
      id: profileVersions.id,
      version: profileVersions.version,
      createdAt: profileVersions.createdAt,
      snapshot: profileVersions.snapshot,
    })
    .from(profileVersions)
    .where(eq(profileVersions.profileId, profileId))
    .orderBy(desc(profileVersions.version))
    .limit(limit + 1);

  return rows.slice(0, limit).map((row, index) => {
    const snap = row.snapshot as Partial<StoredSnapshot> | null;
    const prev = rows[index + 1];
    return {
      id: row.id,
      version: row.version,
      label: typeof snap?.label === "string" ? snap.label : null,
      createdAt: row.createdAt,
      previousVersion: prev?.version ?? null,
      changes: prev ? diffSnapshots(prev.snapshot, row.snapshot) : diffSnapshots({}, row.snapshot),
    };
  });
}

export async function compareVersions(
  profileId: string,
  versionId: string,
  baselineVersionId?: string,
): Promise<{ previousVersion: number | null; changes: RevisionChange[] } | null> {
  const target = await getVersion(profileId, versionId);
  if (!target) return null;

  let baseline: typeof target | null = null;
  if (baselineVersionId) {
    baseline = await getVersion(profileId, baselineVersionId);
  } else {
    const rows = await db
      .select()
      .from(profileVersions)
      .where(and(eq(profileVersions.profileId, profileId), sql`${profileVersions.version} < ${target.version}`))
      .orderBy(desc(profileVersions.version))
      .limit(1);
    baseline = rows[0] ?? null;
  }

  return {
    previousVersion: baseline?.version ?? null,
    changes: baseline ? diffSnapshots(baseline.snapshot, target.snapshot) : [],
  };
}

export async function getVersion(profileId: string, versionId: string) {
  const rows = await db
    .select()
    .from(profileVersions)
    .where(and(eq(profileVersions.id, versionId), eq(profileVersions.profileId, profileId)))
    .limit(1);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Username change
// ---------------------------------------------------------------------------

export type UsernameChangeResult = { ok: true; username: string } | { ok: false; reason: string };

export async function changeUsername(userId: string, next: string): Promise<UsernameChangeResult> {
  const check = validateUsername(next);
  if (!check.ok) return { ok: false, reason: check.reason };

  if (await usernameTaken(check.username)) {
    return { ok: false, reason: "That username is already taken." };
  }

  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const current = rows[0];
  if (!current) return { ok: false, reason: "Account not found." };

  if (current.username === check.username) {
    return { ok: false, reason: "That is already your username." };
  }

  const [updated] = await db
    .update(users)
    .set({
      username: check.username,
      usernameDisplay: check.display,
      usernameChangedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning({ username: users.username });

  return { ok: true, username: updated.username };
}
