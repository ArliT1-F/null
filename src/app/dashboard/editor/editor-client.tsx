"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { ICON_CHOICES, linkIcon } from "@/components/profile/icons";
import { Icon } from "@/components/ui";
import type { ProfileLink, SavedTheme } from "@/db/schema";
import type { ThemeCard } from "@/lib/themes";
import { materializeCanvasFrames } from "@/lib/canvas-guides";
import type { Entitlements } from "@/lib/entitlements";
import type { ProfileConfig } from "@/lib/profile-config";
import { cn } from "@/lib/utils";
import {
  applySavedThemeAction,
  applyThemeAction,
  createLinkAction,
  deleteLinkAction,
  deleteSavedThemeAction,
  publishAction,
  reorderLinksAction,
  restoreVersionAction,
  saveCustomCssAction,
  saveCustomThemeAction,
  saveDraftAction,
  saveIdentityAction,
  updateLinkAction,
  versionDiffAction,
} from "./actions";
import { BlockInspector } from "./block-inspector";
import { BlocksPanel } from "./blocks-panel";
import { SegmentedControl } from "./controls";
import { CssPanel } from "./css-panel";
import { DesignPanel } from "./design-panel";
import { useEditorStore } from "./editor-store";
import { HistoryPanel, type VersionItem } from "./history-panel";
import { InteractiveCanvas, type DeviceMode } from "./interactive-canvas";
import { uploadMediaFile } from "./upload-client";

type EditorProps = {
  user: {
    id: string;
    username: string;
    usernameDisplay: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  profile: {
    bio: string | null;
    headline: string | null;
    location: string | null;
    statusText: string | null;
    visibility: "PUBLIC" | "UNLISTED" | "PRIVATE";
    themeSlug: string;
    publishedAt: string | null;
    draftDirty: boolean;
  };
  initialDraft: ProfileConfig;
  initialLinks: ProfileLink[];
  initialCustomCss: { draft: string; published: string | null };
  entitlements: Entitlements;
  initialSavedThemes: SavedTheme[];
  themes: ThemeCard[];
  versions: VersionItem[];
};

type LeftTab = "blocks" | "design" | "profile" | "links" | "css" | "history";

const LEFT_TABS: readonly { id: LeftTab; label: string }[] = [
  { id: "blocks", label: "Layers" },
  { id: "design", label: "Design" },
  { id: "profile", label: "Profile" },
  { id: "links", label: "Links" },
  { id: "css", label: "CSS" },
  { id: "history", label: "History" },
];

export function EditorClient({
  user,
  profile,
  initialDraft,
  initialLinks,
  initialCustomCss,
  entitlements,
  initialSavedThemes,
  themes,
  versions: initialVersions,
}: EditorProps) {
  const [tab, setTab] = useState<LeftTab>("blocks");
  const [device, setDevice] = useState<DeviceMode>("desktop");
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [sandboxPreview, setSandboxPreview] = useState(false);

  const store = useEditorStore(initialDraft);
  const { draft } = store;

  const [themeSlug, setThemeSlug] = useState<string | null>(profile.themeSlug);
  const [savedThemes, setSavedThemes] = useState<SavedTheme[]>(initialSavedThemes);
  const [published, setPublished] = useState<boolean>(Boolean(profile.publishedAt));
  const [unpublishedDraft, setUnpublishedDraft] = useState<boolean>(profile.draftDirty);
  const [versions, setVersions] = useState<VersionItem[]>(initialVersions);

  // Identity & visibility state
  const [identity, setIdentity] = useState({
    displayName: user.displayName ?? "",
    headline: profile.headline ?? "",
    bio: profile.bio ?? "",
    location: profile.location ?? "",
    statusText: profile.statusText ?? "",
    avatarUrl: user.avatarUrl,
    visibility: profile.visibility,
  });
  const [identityDirty, setIdentityDirty] = useState(false);

  // Links state
  const [links, setLinks] = useState<ProfileLink[]>(initialLinks);

  // Custom CSS state (strictly separate from ProfileConfig — guardrail #3)
  const [customCss, setCustomCss] = useState<string>(initialCustomCss.draft);
  const [savedCustomCss, setSavedCustomCss] = useState<string>(initialCustomCss.draft);
  const cssDirty = customCss !== savedCustomCss;

  // Publish note dropdown
  const [publishNote, setPublishNote] = useState("");
  const [showPublishNote, setShowPublishNote] = useState(false);

  // Feedback
  const [toast, setToast] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  function notify(text: string, kind: "info" | "error" = "info") {
    setToast({ kind, text });
  }

  const anyUnsaved = store.dirty || identityDirty || cssDirty;

  async function flushPendingDrafts(): Promise<boolean> {
    if (identityDirty) {
      const res = await saveIdentityAction({
        displayName: identity.displayName || null,
        headline: identity.headline || null,
        bio: identity.bio || null,
        location: identity.location || null,
        statusText: identity.statusText || null,
        visibility: identity.visibility,
        avatarUrl: identity.avatarUrl,
      });
      if (!res.ok) {
        notify(res.error, "error");
        return false;
      }
      setIdentityDirty(false);
    }
    if (store.dirty) {
      const res = await saveDraftAction(draft);
      if (!res.ok) {
        notify(res.error, "error");
        return false;
      }
      store.markSaved();
    }
    if (cssDirty && entitlements.canEditCustomCss) {
      const res = await saveCustomCssAction(customCss);
      if (!res.ok) {
        notify(res.error, "error");
        return false;
      }
      setSavedCustomCss(res.draftCss);
    }
    setUnpublishedDraft(true);
    return true;
  }

  function saveAll() {
    startTransition(async () => {
      const ok = await flushPendingDrafts();
      if (ok) notify("Draft saved.");
    });
  }

  function handleSaveCss() {
    startTransition(async () => {
      const res = await saveCustomCssAction(customCss);
      if (!res.ok) {
        notify(res.error, "error");
        return;
      }
      setSavedCustomCss(res.draftCss);
      setUnpublishedDraft(true);
      notify("Custom CSS draft saved.");
    });
  }

  function handlePublish(label?: string) {
    startTransition(async () => {
      const saved = await flushPendingDrafts();
      if (!saved) return;

      const res = await publishAction(label);
      if (!res.ok) {
        notify(res.error, "error");
        return;
      }
      setPublished(true);
      setUnpublishedDraft(false);
      setVersions(res.versions);
      setPublishNote("");
      setShowPublishNote(false);
      notify(`Published v${res.version} — live at /${res.username}`);
    });
  }

  function handleApplyTheme(slug: string) {
    startTransition(async () => {
      if (store.dirty) {
        const saved = await saveDraftAction(draft);
        if (!saved.ok) {
          notify(saved.error, "error");
          return;
        }
      }
      const res = await applyThemeAction(slug);
      if (!res.ok) {
        notify(res.error, "error");
        return;
      }
      store.replace(res.config, `Apply theme "${slug}"`);
      setThemeSlug(slug);
      setUnpublishedDraft(true);
      notify("Theme applied — blocks & layout preserved.");
    });
  }

  async function handleSaveCustomTheme(name: string): Promise<boolean> {
    const res = await saveCustomThemeAction(name, draft.theme);
    if (!res.ok) {
      notify(res.error, "error");
      return false;
    }
    setSavedThemes((prev) => [res.savedTheme, ...prev]);
    notify(`Saved theme "${res.savedTheme.name}".`);
    return true;
  }

  function handleApplySavedTheme(id: string) {
    startTransition(async () => {
      if (store.dirty) await saveDraftAction(draft);
      const res = await applySavedThemeAction(id);
      if (!res.ok) {
        notify(res.error, "error");
        return;
      }
      store.replace(res.config, "Apply saved theme");
      setThemeSlug(null);
      setUnpublishedDraft(true);
      notify("Saved theme applied.");
    });
  }

  function handleDeleteSavedTheme(id: string) {
    startTransition(async () => {
      const res = await deleteSavedThemeAction(id);
      if (!res.ok) {
        notify(res.error, "error");
        return;
      }
      setSavedThemes((prev) => prev.filter((t) => t.id !== id));
      notify("Saved theme deleted.");
    });
  }

  function handleRestoreVersion(versionId: string) {
    startTransition(async () => {
      const res = await restoreVersionAction(versionId);
      if (!res.ok) {
        notify(res.error, "error");
        return;
      }
      const { restored } = res;
      store.replace(restored.draft, `Restored to v${restored.version}`);
      setThemeSlug(restored.themeSlug);
      setIdentity(restored.identity);
      setIdentityDirty(false);
      setLinks(restored.links);
      setCustomCss(restored.customCss.draft);
      setSavedCustomCss(restored.customCss.draft);
      setVersions(restored.versions);
      setPublished(true);
      setUnpublishedDraft(false);
      store.setSelection(null);
      notify(`Restored as v${restored.version}.`);
    });
  }

  async function handleAvatarUpload(file: File) {
    setUploadingAvatar(true);
    const res = await uploadMediaFile(file, "AVATAR");
    setUploadingAvatar(false);
    if (!res.ok) {
      notify(res.error, "error");
      return;
    }
    setIdentity((i) => ({ ...i, avatarUrl: res.media.url }));
    setIdentityDirty(true);
    notify("Avatar uploaded — click Save to keep it.");
  }

  function switchLayoutMode(mode: "stack" | "canvas") {
    if (mode === draft.layout.mode) return;
    store.update((d) => {
      if (mode === "canvas") {
        const m = materializeCanvasFrames(d.blocks, d.canvas.height);
        return {
          ...d,
          layout: { ...d.layout, mode: "canvas" },
          blocks: m.blocks,
          canvas: { ...d.canvas, height: m.height },
        };
      }
      return { ...d, layout: { ...d.layout, mode: "stack" } };
    }, `Switch to ${mode} layout`);
  }

  const previewProfile = useMemo(
    () => ({
      username: user.username,
      usernameDisplay: user.usernameDisplay,
      displayName: identity.displayName || user.usernameDisplay,
      avatarUrl: identity.avatarUrl,
      headline: identity.headline || null,
      bio: identity.bio || null,
      location: identity.location || null,
      statusText: identity.statusText || null,
      config: draft,
      links,
    }),
    [user, identity, draft, links],
  );

  return (
    <div className="space-y-4">
      {/* Top workspace toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink-200/80 bg-white px-4 py-3 dark:border-white/[0.08] dark:bg-ink-900">
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
              published && identity.visibility !== "PRIVATE"
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : "bg-ink-100 text-ink-600 dark:bg-white/[0.06] dark:text-ink-300",
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                published && identity.visibility !== "PRIVATE" ? "bg-emerald-500" : "bg-ink-400",
              )}
            />
            {identity.visibility === "PRIVATE"
              ? "Private"
              : published
                ? identity.visibility === "UNLISTED"
                  ? "Unlisted · Live"
                  : "Published"
                : "Draft"}
          </span>

          {anyUnsaved ? (
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
              Unsaved edits
            </span>
          ) : unpublishedDraft && published ? (
            <span className="text-xs text-ink-400">Draft ahead of live</span>
          ) : null}

          {toast && (
            <span
              role="status"
              className={cn(
                "text-xs",
                toast.kind === "error"
                  ? "font-medium text-red-600 dark:text-red-400"
                  : "text-ink-500 dark:text-ink-400",
              )}
            >
              {toast.text}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={store.undo}
            disabled={!store.canUndo}
            title="Undo (⌘Z)"
            aria-label="Undo"
            className="btn-ghost px-2.5 py-1.5 text-xs disabled:opacity-30"
          >
            ↶
          </button>
          <button
            type="button"
            onClick={store.redo}
            disabled={!store.canRedo}
            title="Redo (⇧⌘Z)"
            aria-label="Redo"
            className="btn-ghost px-2.5 py-1.5 text-xs disabled:opacity-30"
          >
            ↷
          </button>

          {published && identity.visibility !== "PRIVATE" && (
            <Link
              href={`/${user.usernameDisplay}`}
              target="_blank"
              className="btn-ghost px-3 py-1.5 text-xs"
            >
              /{user.usernameDisplay} ↗
            </Link>
          )}

          <button
            type="button"
            onClick={saveAll}
            disabled={pending || !anyUnsaved}
            className="btn-secondary px-3 py-1.5 text-xs"
          >
            Save
          </button>

          <div className="relative flex items-center">
            <button
              type="button"
              onClick={() => handlePublish(publishNote || undefined)}
              disabled={pending}
              className="btn-primary rounded-r-none px-3.5 py-1.5 text-xs"
            >
              {pending ? "Working…" : published ? "Publish update" : "Publish"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setShowPublishNote((s) => !s)}
              aria-label="Add revision note"
              title="Publish with revision note"
              className="btn-primary rounded-l-none border-l border-black/15 px-2 py-1.5 text-xs"
            >
              ▾
            </button>
            {showPublishNote && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handlePublish(publishNote);
                }}
                className="absolute right-0 top-10 z-30 w-64 space-y-2 rounded-xl border border-ink-200 bg-white p-3 shadow-elevated dark:border-white/15 dark:bg-ink-900"
              >
                <label className="block text-[11px] font-medium text-ink-600 dark:text-ink-300">
                  Revision note (optional)
                  <input
                    type="text"
                    maxLength={80}
                    value={publishNote}
                    onChange={(e) => setPublishNote(e.target.value)}
                    placeholder="e.g. New portfolio layout"
                    className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-black/30"
                  />
                </label>
                <button type="submit" disabled={pending} className="btn-primary w-full text-xs">
                  Snapshot &amp; publish
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Three-panel workspace: Left Controls | Center Visual Canvas | Right Properties Inspector */}
      <div
        className={cn(
          "grid items-start gap-4",
          inspectorOpen
            ? "lg:grid-cols-[310px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_280px]"
            : "lg:grid-cols-[320px_minmax(0,1fr)]",
        )}
      >
        {/* LEFT PANEL */}
        <aside className="overflow-hidden rounded-2xl border border-ink-200/80 bg-white dark:border-white/[0.08] dark:bg-ink-900">
          <nav
            className="grid grid-cols-6 border-b border-ink-200/80 text-[11px] font-medium dark:border-white/[0.08]"
            aria-label="Editor sections"
          >
            {LEFT_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTab(t.id);
                  if (t.id === "css" && customCss.trim()) setSandboxPreview(true);
                }}
                className={cn(
                  "border-b-2 px-1 py-2.5 text-center transition-colors",
                  tab === t.id
                    ? "border-brand-500 text-ink-950 dark:text-white"
                    : "border-transparent text-ink-400 hover:text-ink-800 dark:hover:text-ink-200",
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="max-h-[calc(100dvh-12rem)] overflow-y-auto">
            {tab === "blocks" && (
              <BlocksPanel
                draft={draft}
                selection={store.selection}
                onSelect={store.setSelection}
                onUpdate={store.update}
                onAddBlock={store.addBlock}
                onDuplicateBlock={store.duplicateBlock}
                onCopyBlock={(id) => {
                  const ok = store.copyBlock(id);
                  if (ok) notify("Copied block.");
                  return ok;
                }}
                onPasteBlock={store.pasteBlock}
                onCreateGroup={store.createGroup}
                hasClipboard={store.clipboard !== null}
                onOpenInspector={() => setInspectorOpen(true)}
              />
            )}

            {tab === "design" && (
              <DesignPanel
                draft={draft}
                themes={themes}
                savedThemes={savedThemes}
                themeSlug={themeSlug}
                device={device}
                onDeviceChange={setDevice}
                onUpdate={store.update}
                onApplyTheme={handleApplyTheme}
                onSaveCustomTheme={handleSaveCustomTheme}
                onApplySavedTheme={handleApplySavedTheme}
                onDeleteSavedTheme={handleDeleteSavedTheme}
                onNotify={(msg) => notify(msg)}
              />
            )}

            {tab === "profile" && (
              <ProfilePanel
                identity={identity}
                uploading={uploadingAvatar}
                onChange={(patch) => {
                  setIdentity((i) => ({ ...i, ...patch }));
                  setIdentityDirty(true);
                }}
                onAvatarUpload={handleAvatarUpload}
              />
            )}

            {tab === "links" && (
              <LinksPanel
                links={links}
                onChange={(next) => {
                  setLinks(next);
                  setUnpublishedDraft(true);
                }}
                onStatus={(msg, isErr) => notify(msg, isErr ? "error" : "info")}
              />
            )}

            {tab === "css" && (
              <CssPanel
                value={customCss}
                dirty={cssDirty}
                saving={pending}
                entitlements={entitlements}
                sandboxPreview={sandboxPreview}
                onToggleSandboxPreview={setSandboxPreview}
                onChange={setCustomCss}
                onSave={handleSaveCss}
              />
            )}

            {tab === "history" && (
              <HistoryPanel
                history={store.history}
                historyIndex={store.historyIndex}
                canUndo={store.canUndo}
                canRedo={store.canRedo}
                onUndo={store.undo}
                onRedo={store.redo}
                onJumpToHistory={store.jumpToHistory}
                onCreateCheckpoint={(name) => {
                  const ok = store.createCheckpoint(name);
                  if (ok) notify(`Checkpoint "${name.trim()}" pinned.`);
                  return ok;
                }}
                onRemoveCheckpoint={store.removeCheckpoint}
                versions={versions}
                pending={pending}
                onRestoreVersion={handleRestoreVersion}
                onLoadDiff={async (versionId, baselineId) => {
                  const res = await versionDiffAction(versionId, baselineId);
                  if (!res.ok) {
                    notify(res.error, "error");
                    return null;
                  }
                  return { previousVersion: res.previousVersion, changes: res.changes };
                }}
              />
            )}
          </div>
        </aside>

        {/* CENTER PANEL: Live Visual Canvas */}
        <section aria-label="Visual canvas and preview" className="min-w-0 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-white p-0.5 dark:border-white/10 dark:bg-ink-900">
              {(["stack", "canvas"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setSandboxPreview(false);
                    switchLayoutMode(m);
                  }}
                  aria-pressed={!sandboxPreview && draft.layout.mode === m}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[11px] font-medium capitalize transition-colors",
                    !sandboxPreview && draft.layout.mode === m
                      ? "bg-ink-900 text-white dark:bg-white dark:text-ink-950"
                      : "text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-white",
                  )}
                >
                  {m}
                </button>
              ))}
              {entitlements.canEditCustomCss && customCss.trim() && (
                <button
                  type="button"
                  onClick={() => setSandboxPreview((s) => !s)}
                  aria-pressed={sandboxPreview}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                    sandboxPreview
                      ? "bg-brand-500 text-ink-950"
                      : "text-brand-600 hover:text-brand-700 dark:text-brand-400",
                  )}
                >
                  CSS Sandbox
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <div className="inline-flex rounded-lg border border-ink-200 bg-white p-0.5 dark:border-white/10 dark:bg-ink-900">
                {(["desktop", "tablet", "mobile"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setDevice(mode)}
                    aria-pressed={device === mode}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-[11px] capitalize transition-colors",
                      device === mode
                        ? "bg-ink-900 text-white dark:bg-white dark:text-ink-950"
                        : "text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-white",
                    )}
                  >
                    {mode}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setInspectorOpen((o) => !o)}
                aria-pressed={inspectorOpen}
                className={cn(
                  "rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors",
                  inspectorOpen
                    ? "border-brand-500/40 bg-brand-500/10 text-brand-700 dark:text-brand-300"
                    : "border-ink-200 bg-white text-ink-500 dark:border-white/10 dark:bg-ink-900 dark:text-ink-400",
                )}
              >
                Inspector
              </button>
            </div>
          </div>

          <InteractiveCanvas
            profile={previewProfile}
            device={device}
            selection={store.selection}
            onSelect={store.setSelection}
            onUpdate={store.update}
            customCss={customCss}
            sandboxPreview={sandboxPreview}
            onOpenInspector={() => setInspectorOpen(true)}
          />
        </section>

        {/* RIGHT PANEL: Properties Inspector */}
        {inspectorOpen && (
          <aside
            aria-label="Properties inspector"
            className="max-h-[calc(100dvh-10rem)] overflow-y-auto rounded-2xl border border-ink-200/80 bg-white lg:col-span-2 xl:col-span-1 dark:border-white/[0.08] dark:bg-ink-900"
          >
            <BlockInspector
              draft={draft}
              selection={store.selection}
              onSelect={store.setSelection}
              onUpdate={store.update}
              onDuplicateBlock={store.duplicateBlock}
              onCopyBlock={store.copyBlock}
              onCreateGroup={store.createGroup}
              onJumpToTab={(t) => setTab(t)}
              onNotify={(msg) => notify(msg)}
            />
          </aside>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Profile identity & visibility panel
 * ---------------------------------------------------------------------- */

function ProfilePanel({
  identity,
  uploading,
  onChange,
  onAvatarUpload,
}: {
  identity: {
    displayName: string;
    headline: string;
    bio: string;
    location: string;
    statusText: string;
    avatarUrl: string | null;
    visibility: "PUBLIC" | "UNLISTED" | "PRIVATE";
  };
  uploading: boolean;
  onChange: (patch: Partial<typeof identity>) => void;
  onAvatarUpload: (file: File) => void;
}) {
  return (
    <div className="space-y-4 p-4">
      <div>
        <span className="label">Avatar</span>
        <div className="flex items-center gap-3">
          {identity.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={identity.avatarUrl}
              alt="Avatar preview"
              className="size-14 rounded-full border border-ink-200 object-cover dark:border-white/10"
            />
          ) : (
            <div className="grid size-14 place-items-center rounded-full bg-ink-100 text-sm font-medium text-ink-500 dark:bg-white/[0.06]">
              {(identity.displayName || "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="btn-secondary cursor-pointer text-xs">
              {uploading ? "Uploading…" : "Upload image"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
                className="sr-only"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) onAvatarUpload(file);
                }}
              />
            </label>
            {identity.avatarUrl && (
              <button
                type="button"
                className="text-left text-xs text-ink-400 hover:text-red-500"
                onClick={() => onChange({ avatarUrl: null })}
              >
                Remove
              </button>
            )}
          </div>
        </div>
        <p className="hint">PNG, JPEG, WebP, AVIF or GIF · re-encoded to WebP with EXIF stripped.</p>
      </div>

      <SegmentedControl
        label="Visibility"
        columns={3}
        value={identity.visibility}
        options={[
          { value: "PUBLIC", label: "Public" },
          { value: "UNLISTED", label: "Unlisted" },
          { value: "PRIVATE", label: "Private" },
        ]}
        onChange={(visibility) => onChange({ visibility })}
      />

      <div>
        <label className="label" htmlFor="ed-name">
          Display name
        </label>
        <input
          id="ed-name"
          className="field"
          maxLength={60}
          value={identity.displayName}
          onChange={(e) => onChange({ displayName: e.target.value })}
          placeholder="Your name"
        />
      </div>

      <div>
        <label className="label" htmlFor="ed-headline">
          Headline
        </label>
        <input
          id="ed-headline"
          className="field"
          maxLength={120}
          value={identity.headline}
          onChange={(e) => onChange({ headline: e.target.value })}
          placeholder="One-line intro"
        />
      </div>

      <div>
        <label className="label" htmlFor="ed-bio">
          Bio
        </label>
        <textarea
          id="ed-bio"
          className="field min-h-[100px] resize-y"
          maxLength={600}
          value={identity.bio}
          onChange={(e) => onChange({ bio: e.target.value })}
          placeholder="A short note about what you make or care about."
        />
        <p className="hint">{identity.bio.length}/600</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="ed-location">
            Location
          </label>
          <input
            id="ed-location"
            className="field"
            maxLength={120}
            value={identity.location}
            onChange={(e) => onChange({ location: e.target.value })}
            placeholder="City"
          />
        </div>
        <div>
          <label className="label" htmlFor="ed-status">
            Status
          </label>
          <input
            id="ed-status"
            className="field"
            maxLength={120}
            value={identity.statusText}
            onChange={(e) => onChange({ statusText: e.target.value })}
            placeholder="Available, building…"
          />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Links panel
 * ---------------------------------------------------------------------- */

function LinksPanel({
  links,
  onChange,
  onStatus,
}: {
  links: ProfileLink[];
  onChange: (next: ProfileLink[]) => void;
  onStatus: (msg: string, isErr?: boolean) => void;
}) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [icon, setIcon] = useState<string>("LINK");
  const [highlight, setHighlight] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function addLink(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const normalized = /^[a-z]+:/i.test(url) ? url : `https://${url}`;
      const res = await createLinkAction({ label, url: normalized, icon, highlight });
      if (!res.ok) {
        onStatus(res.error, true);
        return;
      }
      onChange([...links, res.link]);
      setLabel("");
      setUrl("");
      setHighlight(false);
      onStatus("Link added.");
    });
  }

  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= links.length) return;
    const reordered = [...links];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    onChange(reordered);
    startTransition(async () => {
      const res = await reorderLinksAction(reordered.map((l) => l.id));
      if (!res.ok) onStatus(res.error, true);
    });
  }

  function toggleFlag(link: ProfileLink, field: "visible" | "highlight") {
    const next = { ...link, [field]: !link[field] };
    onChange(links.map((l) => (l.id === link.id ? next : l)));
    startTransition(async () => {
      const res = await updateLinkAction(link.id, {
        label: next.label,
        url: next.url,
        icon: next.icon,
        highlight: next.highlight,
        visible: next.visible,
      });
      if (!res.ok) onStatus(res.error, true);
    });
  }

  function saveEdit(link: ProfileLink) {
    startTransition(async () => {
      const normalized = /^[a-z]+:/i.test(link.url) ? link.url : `https://${link.url}`;
      const res = await updateLinkAction(link.id, {
        label: link.label,
        url: normalized,
        icon: link.icon,
        highlight: link.highlight,
        visible: link.visible,
      });
      if (!res.ok) {
        onStatus(res.error, true);
        return;
      }
      onChange(links.map((l) => (l.id === link.id ? { ...link, url: normalized } : l)));
      setEditingId(null);
      onStatus("Link updated.");
    });
  }

  function remove(id: string) {
    const previous = links;
    onChange(links.filter((l) => l.id !== id));
    startTransition(async () => {
      const res = await deleteLinkAction(id);
      if (!res.ok) {
        onChange(previous);
        onStatus(res.error, true);
      } else {
        onStatus("Link removed.");
      }
    });
  }

  return (
    <div className="space-y-5 p-4">
      <form onSubmit={addLink} className="space-y-3 rounded-xl bg-ink-50 p-3.5 dark:bg-white/[0.03]">
        <p className="text-xs font-medium">Add a link</p>
        <input
          className="field"
          placeholder="Label (e.g. GitHub)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
          maxLength={80}
        />
        <input
          className="field"
          placeholder="https://github.com/you"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
          maxLength={2048}
        />
        <div className="flex items-center justify-between gap-2">
          <select
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            className="field py-1.5 text-xs"
            aria-label="Icon"
          >
            {ICON_CHOICES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-ink-600 dark:text-ink-300">
            <input
              type="checkbox"
              checked={highlight}
              onChange={(e) => setHighlight(e.target.checked)}
              className="rounded accent-brand-500"
            />
            Highlight
          </label>
        </div>
        <button type="submit" disabled={pending} className="btn-primary w-full text-xs">
          Add link
        </button>
      </form>

      {links.length === 0 ? (
        <p className="py-6 text-center text-xs text-ink-400">No links yet.</p>
      ) : (
        <ul className="space-y-2">
          {links.map((link, index) => {
            const editing = editingId === link.id;
            const LinkIconComp = linkIcon(link.icon);
            return (
              <li
                key={link.id}
                className={cn(
                  "rounded-xl border border-ink-200/80 p-3 text-xs dark:border-white/10",
                  !link.visible && "opacity-55",
                )}
              >
                {editing ? (
                  <div className="space-y-2">
                    <input
                      className="field py-1.5 text-xs"
                      value={link.label}
                      maxLength={80}
                      onChange={(e) =>
                        onChange(links.map((l) => (l.id === link.id ? { ...l, label: e.target.value } : l)))
                      }
                    />
                    <input
                      className="field py-1.5 text-xs"
                      value={link.url}
                      maxLength={2048}
                      onChange={(e) =>
                        onChange(links.map((l) => (l.id === link.id ? { ...l, url: e.target.value } : l)))
                      }
                    />
                    <div className="flex items-center justify-between gap-2">
                      <select
                        value={link.icon}
                        onChange={(e) =>
                          onChange(links.map((l) => (l.id === link.id ? { ...l, icon: e.target.value } : l)))
                        }
                        className="field py-1 text-xs"
                      >
                        {ICON_CHOICES.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => saveEdit(link)}
                        disabled={pending}
                        className="btn-primary px-3 py-1.5 text-xs"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2.5">
                      <span className="text-ink-400">
                        <Icon icon={LinkIconComp} className="size-4" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{link.label}</p>
                        <p className="truncate text-[11px] text-ink-400">{link.url}</p>
                      </div>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between border-t border-ink-100 pt-2 dark:border-white/[0.06]">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => move(index, -1)}
                          disabled={index === 0}
                          aria-label="Move up"
                          className="rounded px-1.5 py-0.5 text-ink-400 hover:bg-ink-100 hover:text-ink-800 disabled:opacity-30 dark:hover:bg-white/10"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => move(index, 1)}
                          disabled={index === links.length - 1}
                          aria-label="Move down"
                          className="rounded px-1.5 py-0.5 text-ink-400 hover:bg-ink-100 hover:text-ink-800 disabled:opacity-30 dark:hover:bg-white/10"
                        >
                          ↓
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingId(link.id)}
                          className="text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-white"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleFlag(link, "highlight")}
                          className={cn(
                            link.highlight
                              ? "font-medium text-brand-600 dark:text-brand-400"
                              : "text-ink-400 hover:text-ink-800 dark:hover:text-white",
                          )}
                        >
                          ★
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleFlag(link, "visible")}
                          className="text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-white"
                        >
                          {link.visible ? "Hide" : "Show"}
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(link.id)}
                          className="text-ink-400 hover:text-red-500"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
