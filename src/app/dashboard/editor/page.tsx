import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/session";
import { getEditorData, listVersions } from "@/lib/profiles/service";
import { listThemes } from "@/lib/themes";
import { EditorClient } from "./editor-client";

export const metadata: Metadata = { title: "Editor", robots: { index: false, follow: false } };

/**
 * Editor entry point.
 *
 * Resolves the authenticated owner's draft configuration, links, custom CSS
 * draft, entitlements, saved themes, curated presets, and published revisions
 * on the server so the visual canvas paints immediately with zero client waterfalls.
 */
export default async function EditorPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirectTo=%2Fdashboard%2Feditor");

  const data = await getEditorData(user.id);
  if (!data) {
    return (
      <EmptyState
        title="Profile unavailable"
        description="We could not load your profile. Sign out and back in, or contact the operator if this persists."
        icon={ShieldAlert}
      />
    );
  }

  const [themes, versions] = await Promise.all([
    listThemes(),
    listVersions(data.profile.id, 20),
  ]);

  const draftDirty = data.profile.draftUpdatedAt > (data.profile.publishedAt ?? new Date(0));

  return (
    <EditorClient
      user={{
        id: user.id,
        username: user.username,
        usernameDisplay: user.usernameDisplay,
        displayName: data.user.displayName,
        avatarUrl: data.user.avatarUrl,
      }}
      profile={{
        bio: data.user.bio,
        headline: data.profile.headline,
        location: data.profile.location,
        statusText: data.profile.statusText,
        visibility: data.profile.visibility,
        themeSlug: data.profile.themeSlug,
        publishedAt: data.profile.publishedAt?.toISOString() ?? null,
        draftDirty,
      }}
      initialDraft={data.config}
      initialLinks={data.links}
      initialCustomCss={data.customCss}
      entitlements={data.entitlements}
      initialSavedThemes={data.savedThemes}
      themes={themes}
      versions={versions.map((v) => ({
        id: v.id,
        version: v.version,
        label: v.label,
        createdAt: v.createdAt.toISOString(),
      }))}
    />
  );
}
