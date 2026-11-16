"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { LINK_ICONS, type ProfileLink, type SavedTheme } from "@/db/schema";
import { audit, requireUser } from "@/lib/auth/session";
import { compileCustomCss, MAX_CUSTOM_CSS_LENGTH } from "@/lib/custom-css";
import { env } from "@/lib/env";
import { profileConfigSchema, themeSchema, type ProfileConfig } from "@/lib/profile-config";
import type { RevisionChange } from "@/lib/profile-diff";
import {
  applySavedTheme,
  applyThemeForUser,
  compareVersions,
  createLink,
  createSavedTheme,
  CustomCssError,
  deleteLink,
  deleteSavedTheme,
  getEditorData,
  getProfileForUser,
  listVersions,
  publishProfile,
  reorderLinks,
  restoreVersion,
  saveDraftCustomCss,
  setAvatar,
  updateDraftConfig,
  updateIdentity,
  updateLink,
} from "@/lib/profiles/service";
import { getTheme } from "@/lib/themes";
import { LIMITS, consume } from "@/lib/rate-limit";
import { linkLabelSchema, linkUrlSchema } from "@/lib/validation";

/**
 * Editor server actions.
 *
 * Every mutation re-derives the user from the session, checks ownership
 * server-side, validates inputs with Zod, and enforces entitlements where
 * applicable.
 */

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : T))
  | { ok: false; error: string; field?: string };

export type VersionSummary = {
  id: string;
  version: number;
  label: string | null;
  createdAt: string;
  previousVersion: number | null;
  changes: RevisionChange[];
};

async function ownProfile() {
  const user = await requireUser();
  const profile = await getProfileForUser(user.id);
  if (!profile) throw new Error("Profile not found");
  return { user, profile };
}

function revalidateProfile(username: string) {
  revalidateTag(`profile:${username}`);
  revalidatePath(`/${username}`);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/editor");
}

function serializeVersions(
  rows: Awaited<ReturnType<typeof listVersions>>,
): VersionSummary[] {
  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    label: row.label,
    createdAt: row.createdAt.toISOString(),
    previousVersion: row.previousVersion,
    changes: row.changes,
  }));
}

// ---------------------------------------------------------------------------
// Draft configuration & Custom CSS
// ---------------------------------------------------------------------------

export async function saveDraftAction(
  input: unknown,
): Promise<ActionResult<{ config: ProfileConfig }>> {
  try {
    const { profile } = await ownProfile();
    const parsed = profileConfigSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Some customisation values were invalid.",
      };
    }
    await updateDraftConfig(profile.userId, parsed.data);
    return { ok: true, config: parsed.data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save draft." };
  }
}

export async function saveCustomCssAction(
  rawCss: string,
): Promise<ActionResult<{ draftCss: string; compiledCss: string }>> {
  try {
    const user = await requireUser();
    if (typeof rawCss !== "string" || rawCss.length > MAX_CUSTOM_CSS_LENGTH) {
      return {
        ok: false,
        error: `Custom CSS exceeds the ${MAX_CUSTOM_CSS_LENGTH.toLocaleString()}-character limit.`,
      };
    }

    const check = compileCustomCss(rawCss);
    if (!check.ok) {
      const first = check.diagnostics[0];
      return {
        ok: false,
        error: first ? `Line ${first.line}:${first.column} — ${first.message}` : "Custom CSS has errors.",
      };
    }

    const saved = await saveDraftCustomCss(user.id, rawCss);
    await audit({
      actorId: user.id,
      action: "profile.save_custom_css",
      targetType: "profile",
      targetId: user.id,
      metadata: { bytes: rawCss.length },
    });
    return { ok: true, ...saved };
  } catch (error) {
    if (error instanceof CustomCssError) return { ok: false, error: error.message };
    return { ok: false, error: "Could not save custom CSS." };
  }
}

// ---------------------------------------------------------------------------
// Identity & Avatar
// ---------------------------------------------------------------------------

export async function saveIdentityAction(input: {
  displayName?: string | null;
  bio?: string | null;
  headline?: string | null;
  location?: string | null;
  statusText?: string | null;
  visibility?: "PUBLIC" | "UNLISTED" | "PRIVATE";
  avatarUrl?: string | null;
}): Promise<ActionResult> {
  try {
    const { user, profile } = await ownProfile();
    const clean = (v: string | null | undefined, max: number) =>
      v === undefined ? undefined : (v ?? "").trim().slice(0, max) || null;

    const visibility =
      input.visibility && (["PUBLIC", "UNLISTED", "PRIVATE"] as const).includes(input.visibility)
        ? input.visibility
        : undefined;

    await updateIdentity(profile.userId, {
      displayName: clean(input.displayName, 60),
      bio: clean(input.bio, 600),
      headline: clean(input.headline, 120),
      location: clean(input.location, 120),
      statusText: clean(input.statusText, 120),
      visibility,
    });

    if (input.avatarUrl !== undefined) {
      const url = input.avatarUrl;
      if (url !== null && url !== "") {
        const expectedPrefix = `${env.MEDIA_PUBLIC_PREFIX}/`;
        const isSafeLocal = url.startsWith(expectedPrefix) && !url.includes("..");
        const isSafeHttps = url.startsWith("https://") && !/[\s"'()\\;{}<>]/.test(url);
        if (!isSafeLocal && !isSafeHttps) {
          return { ok: false, error: "That avatar URL is not allowed." };
        }
        await setAvatar(user.id, url);
      } else {
        await setAvatar(user.id, null);
      }
    }

    if (visibility) revalidateProfile(user.username);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save profile." };
  }
}

// ---------------------------------------------------------------------------
// Curated Themes & Saved Custom Themes
// ---------------------------------------------------------------------------

export async function applyThemeAction(
  slug: string,
): Promise<ActionResult<{ config: ProfileConfig }>> {
  try {
    const { profile } = await ownProfile();
    const clean = slug.trim().toLowerCase();
    const theme = await getTheme(clean);
    if (!theme) {
      return { ok: false, error: "That theme is not available." };
    }
    const config = await applyThemeForUser(profile.userId, theme.slug, theme.tokens);
    return { ok: true, config };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not apply theme." };
  }
}

export async function saveCustomThemeAction(
  name: string,
  tokens: unknown,
): Promise<ActionResult<{ savedTheme: SavedTheme }>> {
  try {
    const user = await requireUser();
    const parsed = themeSchema.safeParse(tokens);
    if (!parsed.success) return { ok: false, error: "Current theme tokens are invalid." };

    const savedTheme = await createSavedTheme(user.id, name, parsed.data);
    return { ok: true, savedTheme };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save theme." };
  }
}

export async function applySavedThemeAction(
  savedThemeId: string,
): Promise<ActionResult<{ config: ProfileConfig }>> {
  try {
    const user = await requireUser();
    const config = await applySavedTheme(user.id, savedThemeId);
    return { ok: true, config };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not apply theme." };
  }
}

export async function deleteSavedThemeAction(savedThemeId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const ok = await deleteSavedTheme(user.id, savedThemeId);
    return ok ? { ok: true } : { ok: false, error: "Saved theme not found." };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not delete theme." };
  }
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

export async function createLinkAction(input: {
  label: string;
  url: string;
  icon?: string | null;
  highlight?: boolean;
}): Promise<ActionResult<{ id: string; link: ProfileLink }>> {
  try {
    const { profile } = await ownProfile();
    const label = linkLabelSchema.safeParse(input.label);
    if (!label.success) return { ok: false, error: label.error.issues[0].message, field: "label" };

    const url = linkUrlSchema.safeParse(input.url);
    if (!url.success) return { ok: false, error: url.error.issues[0].message, field: "url" };

    const icon =
      input.icon && (LINK_ICONS as readonly string[]).includes(input.icon) ? input.icon : "LINK";

    const link = await createLink(profile.id, {
      label: label.data,
      url: url.data,
      icon,
      highlight: Boolean(input.highlight),
    });
    return { ok: true, id: link.id, link };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not add link." };
  }
}

export async function updateLinkAction(
  linkId: string,
  input: {
    label: string;
    url: string;
    icon?: string | null;
    highlight?: boolean;
    visible?: boolean;
  },
): Promise<ActionResult> {
  try {
    const { profile } = await ownProfile();
    const label = linkLabelSchema.safeParse(input.label);
    if (!label.success) return { ok: false, error: label.error.issues[0].message, field: "label" };

    const url = linkUrlSchema.safeParse(input.url);
    if (!url.success) return { ok: false, error: url.error.issues[0].message, field: "url" };

    const icon =
      input.icon && (LINK_ICONS as readonly string[]).includes(input.icon) ? input.icon : "LINK";

    const updated = await updateLink(profile.id, linkId, {
      label: label.data,
      url: url.data,
      icon,
      highlight: input.highlight,
      visible: input.visible,
    });
    if (!updated) return { ok: false, error: "Link not found." };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not update link." };
  }
}

export async function deleteLinkAction(linkId: string): Promise<ActionResult> {
  try {
    const { profile } = await ownProfile();
    const ok = await deleteLink(profile.id, linkId);
    return ok ? { ok: true } : { ok: false, error: "Link not found." };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not delete link." };
  }
}

export async function reorderLinksAction(orderedIds: string[]): Promise<ActionResult> {
  try {
    const { profile } = await ownProfile();
    if (!Array.isArray(orderedIds) || orderedIds.length > 100) {
      return { ok: false, error: "Invalid link order." };
    }
    await reorderLinks(profile.id, orderedIds);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not reorder links." };
  }
}

// ---------------------------------------------------------------------------
// Publish, diff & append-only restore
// ---------------------------------------------------------------------------

export async function publishAction(
  label?: string,
): Promise<ActionResult<{ version: number; username: string; versions: VersionSummary[] }>> {
  try {
    const { user, profile } = await ownProfile();
    const limit = consume(`publish:${user.id}`, LIMITS.publish.limit, LIMITS.publish.windowMs);
    if (!limit.allowed) {
      return {
        ok: false,
        error: `Publishing too often. Try again in ${limit.retryAfterSeconds}s.`,
      };
    }

    const result = await publishProfile(user.id, label);
    revalidateProfile(user.username);
    await audit({
      actorId: user.id,
      action: "profile.publish",
      targetType: "profile",
      targetId: user.id,
      metadata: { version: result.version },
    });

    const versions = serializeVersions(await listVersions(profile.id, 20));
    return { ok: true, version: result.version, username: user.username, versions };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Publish failed." };
  }
}

export type RestoredEditorPayload = {
  version: number;
  draft: ProfileConfig;
  themeSlug: string;
  identity: {
    displayName: string;
    bio: string;
    headline: string;
    location: string;
    statusText: string;
    avatarUrl: string | null;
    visibility: "PUBLIC" | "UNLISTED" | "PRIVATE";
  };
  links: ProfileLink[];
  customCss: { draft: string; published: string | null };
  versions: VersionSummary[];
};

export async function restoreVersionAction(
  versionId: string,
): Promise<ActionResult<{ restored: RestoredEditorPayload }>> {
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

    const fresh = await getEditorData(user.id);
    if (!fresh) return { ok: false, error: "Restored — reload to refresh editor state." };

    const versions = serializeVersions(await listVersions(fresh.profile.id, 20));
    return {
      ok: true,
      restored: {
        version: result.version,
        draft: fresh.config,
        themeSlug: fresh.profile.themeSlug,
        identity: {
          displayName: fresh.user.displayName ?? "",
          bio: fresh.user.bio ?? "",
          headline: fresh.profile.headline ?? "",
          location: fresh.profile.location ?? "",
          statusText: fresh.profile.statusText ?? "",
          avatarUrl: fresh.user.avatarUrl,
          visibility: fresh.profile.visibility,
        },
        links: fresh.links,
        customCss: fresh.customCss,
        versions,
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Restore failed." };
  }
}

export async function versionDiffAction(
  versionId: string,
  baselineVersionId?: string,
): Promise<ActionResult<{ previousVersion: number | null; changes: RevisionChange[] }>> {
  try {
    const { profile } = await ownProfile();
    const diff = await compareVersions(profile.id, versionId, baselineVersionId);
    if (!diff) return { ok: false, error: "Revision not found." };
    return { ok: true, ...diff };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not load diff." };
  }
}
