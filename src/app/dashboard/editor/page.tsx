import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/ui";
import { ShieldAlert } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getEditorData, listVersions } from "@/lib/profiles/service";
import { normalizeProfileConfig } from "@/lib/profile-config";
import { listThemes } from "@/lib/themes";
import { EditorClient } from "./editor-client";

export const metadata: Metadata = { title: "Editor", robots: { index: false, follow: false } };

/**
 * Editor entry point.
 *
 * The server resolves the owner's data and hands the client a fully-formed,
 * validated initial state — so the editor never renders a loading skeleton or an
 * empty canvas, and the client cannot be tricked into editing someone else's
 * profile (all mutations re-resolve the session server-side).
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

  const [themes, versions] = await Promise.all([listThemes(), listVersions(data.profile.id, 12)]);

  const draftDirty = data.profile.draftUpdatedAt > (data.profile.publishedAt ?? new Date(0));

  return (
    <EditorClient
      username={user.username}
      usernameDisplay={user.usernameDisplay}
      identity={{
        displayName: data.user.displayName ?? data.user.usernameDisplay,
        bio: data.user.bio ?? "",
        headline: data.profile.headline ?? "",
        location: data.profile.location ?? "",
        statusText: data.profile.statusText ?? "",
        avatarUrl: data.user.avatarUrl,
        visibility: data.profile.visibility,
      }}
      initialConfig={normalizeProfileConfig(data.profile.draftConfig)}
      initialLinks={data.links.map((l) => ({
        id: l.id,
        label: l.label,
        url: l.url,
        icon: l.icon,
        highlight: l.highlight,
        visible: l.visible,
      }))}
      themes={themes.map((t) => ({ slug: t.slug, name: t.name, category: t.category, tokens: t.tokens }))}
      activeThemeSlug={data.profile.themeSlug}
      versions={versions.map((v) => ({ id: v.id, version: v.version, createdAt: v.createdAt.toISOString(), changes: v.changes }))}
      publishedAt={data.profile.publishedAt?.toISOString() ?? null}
      revision={data.profile.revision}
      draftDirty={draftDirty}
    />
  );
}
