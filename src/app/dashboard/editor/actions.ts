"use server";

import { revalidateTag } from "next/cache";
import { env } from "@/lib/env";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { profiles } from "@/db/schema";
import { audit, requireUser } from "@/lib/auth/session";
import { normalizeProfileConfig } from "@/lib/profile-config";
import {
  createLink,
  deleteLink,
  getProfileForUser,
  listVersions,
  publishProfile,
  reorderLinks,
  restoreVersion,
  setAvatar,
  updateDraftConfig,
  updateIdentity,
  updateLink,
} from "@/lib/profiles/service";
import { LIMITS, consume } from "@/lib/rate-limit";
import { linkLabelSchema, linkUrlSchema } from "@/lib/validation";
import { LINK_ICONS } from "@/db/schema";

/**
 * Editor server actions.
 *
 * Every action re-derives the user from the session — no action trusts an id
 * supplied by the client. Ownership is enforced by resolving the caller's own
 * profile inside each handler.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; field?: string };

async function ownProfile() {
  const user = await requireUser();
  const profile = await getProfileForUser(user.id);
  if (!profile) throw new Error("Profile not found");
  return { user, profile };
}

function revalidateProfile(username: string) {
  // Tag-based invalidation so a publish is visible immediately.
  revalidateTag(`profile:${username}`);
}

// ---------------------------------------------------------------------------
// Draft configuration
// ---------------------------------------------------------------------------

export async function saveDraftConfig(input: unknown): Promise<ActionResult> {
  try {
    const { profile } = await ownProfile();
    const normalized = normalizeProfileConfig(input);
    await updateDraftConfig(profile.userId, normalized);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save" };
  }
}

export async function saveIdentity(input: {
  displayName?: string;
  bio?: string;
  headline?: string;
  location?: string;
  statusText?: string;
  visibility?: "PUBLIC" | "UNLISTED" | "PRIVATE";
}): Promise<ActionResult> {
  try {
    const { user, profile } = await ownProfile();

    const clean = (value: string | undefined, max: number) =>
      value === undefined ? undefined : value.trim().slice(0, max) || "";

    await updateIdentity(profile.userId, {
      displayName: clean(input.displayName, 60),
      bio: clean(input.bio, 600),
      headline: clean(input.headline, 120),
      location: clean(input.location, 120),
      statusText: clean(input.statusText, 120),
      visibility: input.visibility,
    });

    if (input.visibility) revalidateProfile(user.username);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save" };
  }
}

export async function applyTheme(themeSlug: string, tokens: unknown): Promise<ActionResult> {
  try {
    const { profile } = await ownProfile();
    const normalized = normalizeProfileConfig({ version: 1, theme: tokens });
    await updateDraftConfig(profile.userId, normalized);
    await db.update(profiles).set({ themeSlug }).where(eq(profiles.userId, profile.userId));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not apply theme" };
  }
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

export async function addLink(input: {
  label: string;
  url: string;
  icon?: string;
  highlight?: boolean;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const { profile } = await ownProfile();

    const label = linkLabelSchema.safeParse(input.label);
    if (!label.success) return { ok: false, error: label.error.issues[0].message, field: "label" };

    const url = linkUrlSchema.safeParse(input.url);
    if (!url.success) return { ok: false, error: url.error.issues[0].message, field: "url" };

    const icon = input.icon && (LINK_ICONS as readonly string[]).includes(input.icon) ? input.icon : "LINK";

    const link = await createLink(profile.id, {
      label: label.data,
      url: url.data,
      icon,
      highlight: Boolean(input.highlight),
    });
    return { ok: true, data: { id: link.id } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not add link" };
  }
}

export async function editLink(input: {
  id: string;
  label: string;
  url: string;
  icon?: string;
  highlight?: boolean;
  visible?: boolean;
}): Promise<ActionResult> {
  try {
    const { profile } = await ownProfile();

    const label = linkLabelSchema.safeParse(input.label);
    if (!label.success) return { ok: false, error: label.error.issues[0].message, field: "label" };

    const url = linkUrlSchema.safeParse(input.url);
    if (!url.success) return { ok: false, error: url.error.issues[0].message, field: "url" };

    const icon = input.icon && (LINK_ICONS as readonly string[]).includes(input.icon) ? input.icon : "LINK";

    const updated = await updateLink(profile.id, input.id, {
      label: label.data,
      url: url.data,
      icon,
      highlight: input.highlight,
      visible: input.visible,
    });
    if (!updated) return { ok: false, error: "Link not found" };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not update link" };
  }
}

export async function removeLink(id: string): Promise<ActionResult> {
  try {
    const { profile } = await ownProfile();
    const ok = await deleteLink(profile.id, id);
    return ok ? { ok: true } : { ok: false, error: "Link not found" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not delete link" };
  }
}

export async function moveLink(id: string, orderedIds: string[]): Promise<ActionResult> {
  try {
    const { profile } = await ownProfile();
    await reorderLinks(profile.id, orderedIds);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not reorder links" };
  }
}

// ---------------------------------------------------------------------------
// Publish / restore
// ---------------------------------------------------------------------------

export async function publishAction(): Promise<ActionResult<{ version: number }>> {
  try {
    const user = await requireUser();
    const limit = consume(`publish:${user.id}`, LIMITS.publish.limit, LIMITS.publish.windowMs);
    if (!limit.allowed) {
      return { ok: false, error: `You are publishing too often. Try again in ${limit.retryAfterSeconds}s.` };
    }

    const result = await publishProfile(user.id);
    revalidateProfile(user.username);
    await audit({
      actorId: user.id,
      action: "profile.publish",
      targetType: "profile",
      targetId: user.id,
      metadata: { version: result.version },
    });

    return { ok: true, data: { version: result.version } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Publish failed" };
  }
}

export async function restoreVersionAction(versionId: string): Promise<ActionResult<{ version: number }>> {
  try {
    const user = await requireUser();
    const result = await restoreVersion(user.id, versionId);
    revalidateProfile(user.username);
    await audit({
      actorId: user.id,
      action: "profile.restore",
      targetType: "profile",
      targetId: user.id,
      metadata: { restoredTo: versionId, newVersion: result.version },
    });
    return { ok: true, data: { version: result.version } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Restore failed" };
  }
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

/**
 * Sets or clears the account avatar.
 *
 * The avatar is identity data (it belongs to the user, not the appearance
 * config), so it is stored on the `users` row and included in the next
 * published snapshot.
 */
export async function applyAvatar(url: string | null): Promise<ActionResult> {
  try {
    const { user } = await ownProfile();

    if (url !== null) {
      // Only accept media the profile actually serves: a same-origin media path.
      const expectedPrefix = `${env.MEDIA_PUBLIC_PREFIX}/`;
      if (!url.startsWith(expectedPrefix) && !url.startsWith("https://")) {
        return { ok: false, error: "That image URL is not allowed." };
      }
    }

    await setAvatar(user.id, url);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not update the avatar" };
  }
}

// ---------------------------------------------------------------------------
// Version history
// ---------------------------------------------------------------------------

export type VersionSummary = { id: string; version: number; createdAt: string };

/**
 * Returns the real version history.
 *
 * The editor re-reads this after publishing or restoring instead of guessing
 * client-side, so every "Restore" button refers to a row that actually exists.
 */
export async function listVersionsAction(): Promise<ActionResult<{ versions: VersionSummary[] }>> {
  try {
    const { profile } = await ownProfile();
    const rows = await listVersions(profile.id, 12);
    return {
      ok: true,
      data: {
        versions: rows.map((row) => ({
          id: row.id,
          version: row.version,
          createdAt: row.createdAt.toISOString(),
        })),
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not load versions" };
  }
}
