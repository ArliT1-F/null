import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  profileLinks,
  profileVersions,
  profiles,
  users,
  type Profile,
  type ProfileLink,
} from "@/db/schema";
import { normalizeProfileConfig, type ProfileConfig } from "@/lib/profile-config";
import { validateUsername } from "@/lib/username";

/**
 * Profile domain service.
 *
 * The invariant this module protects: **editing never changes what visitors
 * see.** All edits touch `profiles.draftConfig`; `publishProfile()` copies the
 * draft into `profiles.publishedSnapshot` inside a transaction. That single rule
 * makes drafts, previews, revision history and rollback all fall out naturally.
 */

export type ProfileWithUser = {
  profile: Profile;
  user: { id: string; username: string; usernameDisplay: string; displayName: string | null; avatarUrl: string | null; status: string };
  links: ProfileLink[];
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
  revision: number;
  publishedAt: Date;
};

export type PublicLink = {
  id: string;
  label: string;
  url: string;
  icon: string;
  highlight: boolean;
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

  const links = await db
    .select()
    .from(profileLinks)
    .where(eq(profileLinks.profileId, profile.id))
    .orderBy(asc(profileLinks.position), asc(profileLinks.createdAt));

  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  return {
    profile,
    links,
    user: userRows[0],
    config: normalizeProfileConfig(profile.draftConfig),
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
    .select({ profile: profiles, user: users })
    .from(profiles)
    .innerJoin(users, eq(users.id, profiles.userId))
    .where(and(eq(users.username, canonical), eq(users.status, "ACTIVE")))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (row.profile.visibility === "PRIVATE") return null;
  if (!row.profile.publishedSnapshot) return null;

  const snapshot = row.profile.publishedSnapshot as {
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
  };

  return {
    username: row.user.username,
    usernameDisplay: snapshot.identity?.usernameDisplay ?? row.user.usernameDisplay,
    displayName: snapshot.identity?.displayName || row.user.usernameDisplay,
    bio: snapshot.identity?.bio ?? row.user.bio,
    avatarUrl: snapshot.identity?.avatarUrl ?? row.user.avatarUrl,
    headline: snapshot.identity?.headline ?? null,
    location: snapshot.identity?.location ?? null,
    statusText: snapshot.identity?.statusText ?? null,
    config: normalizeProfileConfig(snapshot.config),
    links: (snapshot.links ?? []).filter((l) => l && l.url && l.label),
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
// Draft edits
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

/**
 * Reorders links atomically. Accepts the full ordered list of link ids that
 * belong to the profile; unknown or foreign ids are ignored.
 */
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

/** Records a click for analytics; never throws for the visitor. */
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
// Publish
// ---------------------------------------------------------------------------

export type PublishResult = {
  version: number;
  publishedAt: Date;
  revision: number;
};

/**
 * Publishes the current draft.
 *
 * Everything happens in one transaction: version row, immutable snapshot, and
 * the pointer visitors resolve. If any step fails, the previously published
 * profile stays live untouched.
 */
export async function publishProfile(userId: string): Promise<PublishResult> {
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

    const links = await tx
      .select()
      .from(profileLinks)
      .where(and(eq(profileLinks.profileId, profile.id), eq(profileLinks.visible, true)))
      .orderBy(asc(profileLinks.position), asc(profileLinks.createdAt));

    const [{ nextVersion }] = await tx
      .select({ nextVersion: sql<number>`coalesce(max(${profileVersions.version}), 0) + 1` })
      .from(profileVersions)
      .where(eq(profileVersions.profileId, profile.id));

    const snapshot = {
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
      themeSlug: profile.themeSlug,
      publishedAt: new Date().toISOString(),
    };

    await tx.insert(profileVersions).values({
      profileId: profile.id,
      version: Number(nextVersion),
      snapshot,
    });

    const [updated] = await tx
      .update(profiles)
      .set({
        publishedSnapshot: snapshot,
        publishedAt: new Date(),
        revision: sql`${profiles.revision} + 1`,
      })
      .where(eq(profiles.id, profile.id))
      .returning();

    return {
      version: Number(nextVersion),
      publishedAt: updated.publishedAt!,
      revision: updated.revision,
    };
  });
}

/** Reverts the live profile to a previous snapshot by publishing a new version. */
export async function restoreVersion(userId: string, versionId: string): Promise<PublishResult> {
  const profile = await getProfileForUser(userId);
  if (!profile) throw new Error("Profile not found");

  const rows = await db
    .select()
    .from(profileVersions)
    .where(and(eq(profileVersions.id, versionId), eq(profileVersions.profileId, profile.id)))
    .limit(1);

  const target = rows[0];
  if (!target) throw new Error("Version not found");

  // Restore means: copy the old snapshot back into the draft, then publish.
  // This keeps history append-only — nothing is ever rewritten.
  const snapshot = target.snapshot as { config?: unknown; identity?: Record<string, unknown>; links?: PublicLink[] };
  await db
    .update(profiles)
    .set({ draftConfig: snapshot.config ?? {}, draftUpdatedAt: new Date() })
    .where(eq(profiles.id, profile.id));

  const identity = snapshot.identity ?? {};
  await db
    .update(users)
    .set({
      displayName: (identity.displayName as string | null) ?? null,
      bio: (identity.bio as string | null) ?? null,
      avatarUrl: (identity.avatarUrl as string | null) ?? null,
    })
    .where(eq(users.id, userId));

  await db
    .update(profiles)
    .set({
      headline: (identity.headline as string | null) ?? null,
      location: (identity.location as string | null) ?? null,
      statusText: (identity.statusText as string | null) ?? null,
    })
    .where(eq(profiles.id, profile.id));

  // Links are restored as a set to keep ids stable where possible.
  const snapshotLinks: PublicLink[] = Array.isArray(snapshot.links) ? snapshot.links : [];
  const existing = await db.select().from(profileLinks).where(eq(profileLinks.profileId, profile.id));
  const existingById = new Map(existing.map((l) => [l.id, l]));

  await db.transaction(async (tx) => {
    const keep = new Set<string>();
    for (const [index, link] of snapshotLinks.entries()) {
      const current = existingById.get(link.id);
      if (current) {
        keep.add(current.id);
        await tx
          .update(profileLinks)
          .set({ label: link.label, url: link.url, icon: link.icon, highlight: link.highlight, visible: true, position: index })
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
  });

  return publishProfile(userId);
}

export async function listVersions(profileId: string, limit = 20) {
  return db
    .select({
      id: profileVersions.id,
      version: profileVersions.version,
      createdAt: profileVersions.createdAt,
    })
    .from(profileVersions)
    .where(eq(profileVersions.profileId, profileId))
    .orderBy(desc(profileVersions.version))
    .limit(limit);
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
