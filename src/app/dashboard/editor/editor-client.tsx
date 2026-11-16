"use client";

import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  ExternalLink,
  GripVertical,
  LayoutTemplate,
  Link2,
  Monitor,
  Palette,
  Pencil,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Smartphone,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button, Icon, Input, Spinner } from "@/components/ui";
import { ProfileView, type RenderLink } from "@/components/profile/profile-renderer";
import { normalizeProfileConfig, type ProfileConfig } from "@/lib/profile-config";
import { backgroundImageFor, safeBackgroundUrl } from "@/lib/background-image";
import { cn } from "@/lib/utils";
import {
  ColorControl,
  ControlGroup,
  RangeControl,
  SegmentedControl,
  TextControl,
  ToggleControl,
} from "./controls";
import { useEditorStore } from "./editor-store";
import {
  addLink,
  applyAvatar,
  applyTheme,
  editLink,
  listVersionsAction,
  moveLink,
  publishAction,
  removeLink,
  restoreVersionAction,
  saveDraftConfig,
  saveIdentity,
  type ActionResult,
} from "./actions";

type LinkRow = { id: string; label: string; url: string; icon: string; highlight: boolean; visible: boolean };

type ThemeOption = { slug: string; name: string; category: string; tokens: Record<string, unknown> };

type VersionRow = { id: string; version: number; createdAt: string };

export type EditorProps = {
  username: string;
  usernameDisplay: string;
  identity: {
    displayName: string;
    bio: string;
    headline: string;
    location: string;
    statusText: string;
    avatarUrl: string | null;
    visibility: "PUBLIC" | "UNLISTED" | "PRIVATE";
  };
  initialConfig: ProfileConfig;
  initialLinks: LinkRow[];
  themes: ThemeOption[];
  activeThemeSlug: string;
  versions: VersionRow[];
  publishedAt: string | null;
  revision: number;
  draftDirty: boolean;
};

type Panel = "design" | "identity" | "links" | "publish";

export function EditorClient(props: EditorProps) {
  const store = useEditorStore(props.initialConfig);
  const [panel, setPanel] = useState<Panel>("design");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [toast, setToast] = useState<{ tone: "ok" | "error"; message: string } | null>(null);
  const [identity, setIdentity] = useState(props.identity);
  const [links, setLinks] = useState<LinkRow[]>(props.initialLinks);
  const [versions, setVersions] = useState<VersionRow[]>(props.versions);
  const [publishedAt, setPublishedAt] = useState<string | null>(props.publishedAt);
  const [revision, setRevision] = useState(props.revision);
  const [publishing, startPublishing] = useTransition();
  const [draftDirty, setDraftDirty] = useState(props.draftDirty);
  const [activeThemeSlug, setActiveThemeSlug] = useState(props.activeThemeSlug);

  /** Re-reads real version rows so history buttons never point at phantom ids. */
  const refreshVersions = useCallback(async () => {
    const result = await listVersionsAction();
    if (result.ok && result.data) setVersions(result.data.versions);
  }, []);

  const showToast = useCallback((tone: "ok" | "error", message: string) => {
    setToast({ tone, message });
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  // --- Autosave -----------------------------------------------------------
  // Debounced so dragging a slider does not produce a request per pixel, and
  // skipped when nothing changed since the last successful save.
  const saveTimer = useRef<number | null>(null);
  const latestDraft = useRef(store.draft);
  latestDraft.current = store.draft;

  const persist = useCallback(async () => {
    setSaving(true);
    const result = await saveDraftConfig(latestDraft.current);
    setSaving(false);
    if (result.ok) {
      setSavedAt(new Date());
      store.markSaved(latestDraft.current);
      setDraftDirty(true);
    } else {
      showToast("error", result.error);
    }
  }, [showToast, store]);

  useEffect(() => {
    if (!store.dirty) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void persist(), 900);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [store.draft, store.dirty, persist]);

  // --- Keyboard shortcuts -------------------------------------------------
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (!(event.metaKey || event.ctrlKey)) return;

      if (event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        store.undo();
      } else if ((event.key.toLowerCase() === "z" && event.shiftKey) || event.key.toLowerCase() === "y") {
        event.preventDefault();
        store.redo();
      } else if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!typing) void persist();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store, persist]);

  // --- Preview props ------------------------------------------------------
  const visibleLinks: RenderLink[] = useMemo(
    () =>
      links
        .filter((l) => l.visible)
        .map((l) => ({ id: l.id, label: l.label, url: l.url, icon: l.icon, highlight: l.highlight })),
    [links],
  );

  const backgroundUrl = backgroundImageFor(store.draft.theme.background);

  const preview = (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-ink-200/70 bg-white transition-all duration-300 dark:border-white/10",
        device === "mobile" ? "mx-auto w-[390px] max-w-full" : "w-full",
      )}
    >
      <div className="relative min-h-[520px] overflow-y-auto">
        <div className="relative">
          {/*
            The background image layer is rendered *inside* `.vessel-profile` by
            the profile stylesheet below (`buildLiveCss`), i.e. by the same code
            path as the public page. An earlier version drew it as a sibling of
            the profile, which painted it underneath `.vessel-profile`'s opaque
            `--p-bg` fill and made every image invisible.
          */}
          <ProfileView
            profile={{
              username: props.username,
              usernameDisplay: props.usernameDisplay,
              displayName: identity.displayName || props.usernameDisplay,
              bio: identity.bio || null,
              avatarUrl: identity.avatarUrl,
              headline: identity.headline || null,
              location: identity.location || null,
              statusText: identity.statusText || null,
              links: visibleLinks,
              showLocation: store.draft.layout.showLocation,
              showStatus: store.draft.layout.showStatus,
              showAvatar: store.draft.layout.showAvatar,
              entrance: "none",
              appName: "Vessel",
            }}
            backgroundUrl={backgroundUrl}
          />
        </div>
      </div>
    </div>
  );

  const css = useMemo(() => buildLiveCss(store.draft), [store.draft]);

  return (
    <div className="min-h-dvh">
      <style dangerouslySetInnerHTML={{ __html: css }} />

      {/* Top bar --------------------------------------------------------- */}
      <div className="sticky top-16 z-30 -mx-4 mb-5 border-b border-ink-200/70 bg-white/90 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 dark:border-white/10 dark:bg-ink-950/90">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Editor</span>
            <span className="hidden text-xs text-ink-400 sm:inline">
              {saving ? "saving…" : savedAt ? `saved ${savedAt.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}` : store.dirty ? "unsaved changes" : "up to date"}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Button variant="quiet" size="sm" onClick={store.undo} disabled={!store.canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
              <Icon icon={Undo2} className="size-4" />
            </Button>
            <Button variant="quiet" size="sm" onClick={store.redo} disabled={!store.canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
              <Icon icon={Redo2} className="size-4" />
            </Button>
            <span className="mx-1 h-5 w-px bg-ink-200 dark:bg-white/10" />
            <Button variant="ghost" size="sm" onClick={() => void persist()} disabled={saving}>
              {saving ? <Spinner className="size-3.5" /> : <Icon icon={Save} className="size-3.5" />}
              Save
            </Button>
            <Button
              variant="accent"
              size="sm"
              disabled={publishing}
              onClick={() =>
                startPublishing(async () => {
                  const result = await publishAction();
                  if (result.ok) {
                    setRevision(result.data!.version);
                    setPublishedAt(new Date().toISOString());
                    setDraftDirty(false);
                    await refreshVersions();
                    showToast("ok", `Published version ${result.data!.version}`);
                  } else {
                    showToast("error", result.error);
                  }
                })
              }
            >
              {publishing ? <Spinner className="size-3.5" /> : <Icon icon={Sparkles} className="size-3.5" />}
              Publish
            </Button>
            <a
              href={`/${props.username}`}
              target="_blank"
              rel="noopener"
              className="btn-quiet hidden sm:inline-flex"
              title="Open the published profile"
            >
              <Icon icon={ExternalLink} className="size-4" />
            </a>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)_300px]">
        {/* Left: inspector ---------------------------------------------- */}
        <div className="order-2 lg:order-1">
          <div className="overflow-hidden rounded-2xl border border-ink-200/70 bg-white dark:border-white/10 dark:bg-white/[0.02]">
            <div className="grid grid-cols-4 border-b border-ink-200/70 dark:border-white/10" role="tablist">
              {(
                [
                  { key: "design", label: "Design", icon: Palette },
                  { key: "identity", label: "Identity", icon: Pencil },
                  { key: "links", label: "Links", icon: Link2 },
                  { key: "publish", label: "Publish", icon: LayoutTemplate },
                ] as const
              ).map(({ key, label, icon: TabIcon }) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={panel === key}
                  onClick={() => setPanel(key)}
                  className={cn(
                    "flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors",
                    panel === key
                      ? "border-b-2 border-brand-500 text-brand-600 dark:text-brand-300"
                      : "text-ink-400 hover:text-ink-700 dark:hover:text-ink-200",
                  )}
                >
                  <Icon icon={TabIcon} className="size-4" />
                  {label}
                </button>
              ))}
            </div>

            <div className="max-h-[calc(100dvh-14rem)] overflow-y-auto">
              {panel === "design" && (
                <DesignPanel
                  store={store}
                  themes={props.themes}
                  activeThemeSlug={activeThemeSlug}
                  onThemeChanged={setActiveThemeSlug}
                  onToast={showToast}
                />
              )}
              {panel === "identity" && (
                <IdentityPanel
                  identity={identity}
                  setIdentity={setIdentity}
                  onSaved={(next) => {
                    setIdentity(next);
                    showToast("ok", "Profile details saved");
                  }}
                  onError={(error) => showToast("error", error)}
                />
              )}
              {panel === "links" && (
                <LinksPanel links={links} setLinks={setLinks} onToast={showToast} />
              )}
              {panel === "publish" && (
                <PublishPanel
                  draftDirty={draftDirty}
                  publishedAt={publishedAt}
                  revision={revision}
                  versions={versions}
                  onRestore={async (id) => {
                    const result = await restoreVersionAction(id);
                    if (result.ok) {
                      setRevision(result.data!.version);
                      setPublishedAt(new Date().toISOString());
                      setDraftDirty(false);
                      await refreshVersions();
                      showToast("ok", `Restored as version ${result.data!.version}`);
                    } else {
                      showToast("error", result.error);
                    }
                  }}
                  onPublish={() =>
                    startPublishing(async () => {
                      const result = await publishAction();
                      if (result.ok) {
                        setRevision(result.data!.version);
                        setPublishedAt(new Date().toISOString());
                        setDraftDirty(false);
                        await refreshVersions();
                        showToast("ok", `Published version ${result.data!.version}`);
                      } else {
                        showToast("error", result.error);
                      }
                    })
                  }
                  publishing={publishing}
                />
              )}
            </div>
          </div>
        </div>

        {/* Center: live canvas ------------------------------------------ */}
        <div className="order-1 lg:order-2">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1 rounded-full border border-ink-200 bg-white p-1 dark:border-white/10 dark:bg-white/[0.04]">
              <button
                onClick={() => setDevice("desktop")}
                aria-pressed={device === "desktop"}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium transition-colors",
                  device === "desktop" ? "bg-ink-950 text-white dark:bg-brand-400 dark:text-[#04231b]" : "text-ink-500",
                )}
              >
                <Icon icon={Monitor} className="size-3.5" /> Desktop
              </button>
              <button
                onClick={() => setDevice("mobile")}
                aria-pressed={device === "mobile"}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium transition-colors",
                  device === "mobile" ? "bg-ink-950 text-white dark:bg-brand-400 dark:text-[#04231b]" : "text-ink-500",
                )}
              >
                <Icon icon={Smartphone} className="size-3.5" /> Mobile
              </button>
            </div>
            <p className="hidden text-[11px] text-ink-400 sm:block">Live preview — visitors see the last published version</p>
          </div>
          {preview}
        </div>

        {/* Right: summary ----------------------------------------------- */}
        <div className="order-3 hidden xl:block">
          <div className="space-y-4">
            <div className="panel p-4">
              <p className="eyebrow">Public URL</p>
              <p className="mt-1.5 truncate font-mono text-[13px]">
                <span className="text-ink-400">/</span>
                {props.usernameDisplay}
              </p>
              <p className="mt-2 text-[11px] text-ink-400">
                {publishedAt ? `Live · version ${revision}` : "Not published yet"}
              </p>
            </div>

            <div className="panel p-4">
              <p className="eyebrow">Checklist</p>
              <ul className="mt-2.5 space-y-2 text-[12px]">
                <ChecklistItem done={Boolean(identity.avatarUrl)} label="Add an avatar" />
                <ChecklistItem done={links.length > 0} label="Add at least one link" />
                <ChecklistItem done={Boolean(identity.bio)} label="Write a short bio" />
                <ChecklistItem done={Boolean(publishedAt)} label="Publish your profile" />
                <ChecklistItem done={identity.visibility !== "PRIVATE"} label="Profile is publicly visible" />
              </ul>
            </div>

            <div className="panel p-4">
              <p className="eyebrow">Shortcuts</p>
              <dl className="mt-2 space-y-1.5 text-[11px] text-ink-500 dark:text-ink-400">
                <ShortcutRow keys="Ctrl + Z" action="Undo" />
                <ShortcutRow keys="Ctrl + Shift + Z" action="Redo" />
                <ShortcutRow keys="Ctrl + S" action="Save draft" />
              </dl>
            </div>
          </div>
        </div>
      </div>

      {/* Toast ---------------------------------------------------------- */}
      {toast && (
        <div
          role="status"
          className={cn(
            "fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-sm shadow-lg",
            toast.tone === "ok"
              ? "bg-ink-950 text-white dark:bg-brand-400 dark:text-[#04231b]"
              : "bg-red-600 text-white",
          )}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Panels
 * ---------------------------------------------------------------------- */

function DesignPanel({
  store,
  themes,
  activeThemeSlug,
  onThemeChanged,
  onToast,
}: {
  store: ReturnType<typeof useEditorStore>;
  themes: ThemeOption[];
  activeThemeSlug: string;
  onThemeChanged: (slug: string) => void;
  onToast: (tone: "ok" | "error", message: string) => void;
}) {
  const { draft, set } = store;
  const { theme, layout } = draft;

  return (
    <div>
      <ControlGroup title="Themes">
        <div className="grid grid-cols-2 gap-1.5">
          {themes.map((themeOption) => (
            <button
              key={themeOption.slug}
              type="button"
              onClick={async () => {
                const result = await applyTheme(themeOption.slug, themeOption.tokens);
                if (!result.ok) {
                  onToast("error", result.error);
                  return;
                }
                // A theme is a starting point, not a patch: its full token set
                // replaces the previous appearance so switching templates gives
                // the intended result rather than a muddy blend.
                store.reset(normalizeProfileConfig({ version: 1, theme: themeOption.tokens }));
                onThemeChanged(themeOption.slug);
                onToast("ok", `${themeOption.name} applied`);
              }}
              className={cn(
                "rounded-lg border px-2 py-2 text-left text-[11px] transition-colors",
                activeThemeSlug === themeOption.slug
                  ? "border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-400/10 dark:text-brand-200"
                  : "border-ink-200 hover:border-ink-300 dark:border-white/10 dark:hover:border-white/25",
              )}
            >
              <span className="block truncate font-medium">{themeOption.name}</span>
              <span className="block truncate text-[10px] opacity-60">{themeOption.category}</span>
            </button>
          ))}
        </div>
      </ControlGroup>

      <ControlGroup title="Background">
        <SegmentedControl
          label="Type"
          value={theme.background.type}
          options={[
            { value: "solid", label: "Solid" },
            { value: "gradient", label: "Gradient" },
            { value: "image", label: "Image" },
          ]}
          onChange={(value) => set("theme.background.type", value)}
        />
        {theme.background.type === "solid" && (
          <ColorControl label="Colour" value={theme.background.color} onChange={(v) => set("theme.background.color", v, true)} />
        )}
        {theme.background.type === "gradient" && (
          <>
            <ColorControl label="From" value={theme.background.gradientFrom} onChange={(v) => set("theme.background.gradientFrom", v, true)} />
            <ColorControl label="To" value={theme.background.gradientTo} onChange={(v) => set("theme.background.gradientTo", v, true)} />
            <RangeControl
              label="Angle"
              value={theme.background.gradientAngle}
              min={0}
              max={360}
              unit="°"
              onChange={(v) => set("theme.background.gradientAngle", v, true)}
            />
          </>
        )}
        {theme.background.type === "image" && (
          <>
            <BackgroundUpload
              value={theme.background.imageUrl}
              onChange={(url) => set("theme.background.imageUrl", url)}
              onError={(message) => onToast("error", message)}
            />
            <TextControl
              label="Or paste an image URL"
              value={theme.background.imageUrl ?? ""}
              onChange={(v) => set("theme.background.imageUrl", v || null)}
              placeholder="https://…"
            />
            {theme.background.imageUrl && !safeBackgroundUrl(theme.background.imageUrl) ? (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                That URL can&apos;t be used as a background. Use an <code>https://</code> link to an image, or
                upload a file above.
              </p>
            ) : null}
          </>
        )}
        <RangeControl label="Blur" value={theme.background.blur} min={0} max={40} unit="px" onChange={(v) => set("theme.background.blur", v, true)} />
        <RangeControl label="Dim" value={theme.background.dim} min={0} max={90} unit="%" onChange={(v) => set("theme.background.dim", v, true)} />
      </ControlGroup>

      <ControlGroup title="Card">
        <ColorControl label="Surface" value={theme.card.surface} onChange={(v) => set("theme.card.surface", v, true)} />
        <RangeControl label="Opacity" value={theme.card.opacity} min={0} max={100} unit="%" onChange={(v) => set("theme.card.opacity", v, true)} />
        <ColorControl label="Border" value={theme.card.borderColor} onChange={(v) => set("theme.card.borderColor", v, true)} />
        <RangeControl label="Border opacity" value={theme.card.borderOpacity} min={0} max={100} unit="%" onChange={(v) => set("theme.card.borderOpacity", v, true)} />
        <RangeControl label="Border width" value={theme.card.borderWidth} min={0} max={6} unit="px" onChange={(v) => set("theme.card.borderWidth", v, true)} />
        <SegmentedControl
          label="Corner radius"
          value={theme.card.radius}
          options={[
            { value: "none", label: "0" },
            { value: "sm", label: "S" },
            { value: "md", label: "M" },
            { value: "lg", label: "L" },
            { value: "xl", label: "XL" },
            { value: "full", label: "Pill" },
          ]}
          onChange={(v) => set("theme.card.radius", v)}
        />
        <SegmentedControl
          label="Shadow"
          value={theme.card.shadow}
          options={[
            { value: "none", label: "None" },
            { value: "soft", label: "Soft" },
            { value: "strong", label: "Strong" },
          ]}
          onChange={(v) => set("theme.card.shadow", v)}
        />
        <RangeControl label="Glass blur" value={theme.card.blur} min={0} max={40} unit="px" onChange={(v) => set("theme.card.blur", v, true)} />
        <RangeControl label="Padding" value={theme.card.padding} min={8} max={64} unit="px" onChange={(v) => set("theme.card.padding", v, true)} />
      </ControlGroup>

      <ControlGroup title="Colours">
        <ColorControl label="Text" value={theme.text.primary} onChange={(v) => set("theme.text.primary", v, true)} />
        <ColorControl label="Muted" value={theme.text.muted} onChange={(v) => set("theme.text.muted", v, true)} />
        <ColorControl label="Accent" value={theme.text.accent} onChange={(v) => set("theme.text.accent", v, true)} />
      </ControlGroup>

      <ControlGroup title="Typography">
        <SegmentedControl
          label="Font"
          value={theme.typography.font}
          options={[
            { value: "inter", label: "Inter" },
            { value: "sora", label: "Sora" },
            { value: "system", label: "System" },
            { value: "serif", label: "Serif" },
            { value: "mono", label: "Mono" },
          ]}
          onChange={(v) => set("theme.typography.font", v)}
        />
        <RangeControl label="Base size" value={theme.typography.baseSize} min={12} max={22} unit="px" onChange={(v) => set("theme.typography.baseSize", v, true)} />
        <RangeControl label="Line height" value={theme.typography.lineHeight} min={1.1} max={2} step={0.05} onChange={(v) => set("theme.typography.lineHeight", v, true)} />
        <RangeControl label="Letter spacing" value={theme.typography.letterSpacing} min={-2} max={4} step={0.1} unit="%" onChange={(v) => set("theme.typography.letterSpacing", v, true)} />
        <SegmentedControl
          label="Heading weight"
          value={theme.typography.headingWeight}
          options={[
            { value: "500", label: "500" },
            { value: "600", label: "600" },
            { value: "700", label: "700" },
            { value: "800", label: "800" },
          ]}
          onChange={(v) => set("theme.typography.headingWeight", v)}
          columns={4}
        />
      </ControlGroup>

      <ControlGroup title="Buttons" defaultOpen={false}>
        <SegmentedControl
          label="Shape"
          value={theme.buttons.radius}
          options={[
            { value: "none", label: "0" },
            { value: "md", label: "M" },
            { value: "lg", label: "L" },
            { value: "full", label: "Pill" },
          ]}
          onChange={(v) => set("theme.buttons.radius", v)}
          columns={4}
        />
        <ColorControl label="Fill" value={theme.buttons.fill} onChange={(v) => set("theme.buttons.fill", v, true)} />
        <RangeControl label="Fill opacity" value={theme.buttons.fillOpacity} min={0} max={100} unit="%" onChange={(v) => set("theme.buttons.fillOpacity", v, true)} />
        <ToggleControl label="Lift on hover" checked={theme.buttons.hoverLift} onChange={(v) => set("theme.buttons.hoverLift", v)} />
      </ControlGroup>

      <ControlGroup title="Layout">
        <RangeControl label="Card width" value={layout.width} min={320} max={760} unit="px" onChange={(v) => set("layout.width", v, true)} />
        <RangeControl label="Gap" value={layout.gap} min={4} max={32} unit="px" onChange={(v) => set("layout.gap", v, true)} />
        <SegmentedControl
          label="Alignment"
          value={layout.alignment}
          options={[
            { value: "center", label: "Center" },
            { value: "left", label: "Left" },
          ]}
          onChange={(v) => set("layout.alignment", v)}
        />
        <ToggleControl label="Show avatar" checked={layout.showAvatar} onChange={(v) => set("layout.showAvatar", v)} />
        <ToggleControl label="Show location" checked={layout.showLocation} onChange={(v) => set("layout.showLocation", v)} />
        <ToggleControl label="Show status" checked={layout.showStatus} onChange={(v) => set("layout.showStatus", v)} />
      </ControlGroup>

      <ControlGroup title="Effects" defaultOpen={false}>
        <ToggleControl label="Animated background" checked={theme.effects.animatedBackground} onChange={(v) => set("theme.effects.animatedBackground", v)} />
        <ToggleControl label="Accent glow" checked={theme.effects.glow} onChange={(v) => set("theme.effects.glow", v)} />
        <ToggleControl label="Film grain" checked={theme.effects.noise} onChange={(v) => set("theme.effects.noise", v)} />
        <SegmentedControl
          label="Entrance"
          value={theme.effects.entrance}
          options={[
            { value: "none", label: "None" },
            { value: "fade", label: "Fade" },
            { value: "rise", label: "Rise" },
          ]}
          onChange={(v) => set("theme.effects.entrance", v)}
        />
      </ControlGroup>
    </div>
  );
}

function IdentityPanel({
  identity,
  setIdentity,
  onSaved,
  onError,
}: {
  identity: EditorProps["identity"];
  setIdentity: (value: EditorProps["identity"]) => void;
  onSaved: (value: EditorProps["identity"]) => void;
  onError: (message: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function uploadAvatar(file: File) {
    setAvatarBusy(true);
    const form = new FormData();
    form.set("file", file);
    form.set("kind", "AVATAR");

    try {
      const res = await fetch("/api/media", { method: "POST", body: form });
      const data = (await res.json()) as { ok: boolean; url?: string; error?: string };
      if (!data.ok || !data.url) throw new Error(data.error ?? "Upload failed");

      // Persist immediately: the avatar lives on the account, not in the draft
      // config, so it must be written before the editor can show it as saved.
      const applied = await applyAvatar(data.url);
      if (!applied.ok) throw new Error(applied.error);

      setIdentity({ ...identity, avatarUrl: data.url });
    } catch (error) {
      onError(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setAvatarBusy(false);
    }
  }

  return (
    <div className="p-4">
      <div className="mb-5 flex items-center gap-3">
        <div className="relative size-16 shrink-0 overflow-hidden rounded-full border border-ink-200 bg-ink-100 dark:border-white/10 dark:bg-white/10">
          {identity.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={identity.avatarUrl} alt="Your avatar" className="size-full object-cover" />
          ) : (
            <span className="grid size-full place-items-center text-lg font-semibold text-ink-400">
              {(identity.displayName || "?").slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>
        <div className="space-y-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInput.current?.click()}
            disabled={avatarBusy}
            className="text-[11px]"
          >
            {avatarBusy ? <Spinner className="size-3" /> : <Icon icon={Upload} className="size-3" />}
            {identity.avatarUrl ? "Replace" : "Upload"}
          </Button>
          {identity.avatarUrl && (
            <button
              type="button"
              onClick={async () => {
                const applied = await applyAvatar(null);
                if (applied.ok) setIdentity({ ...identity, avatarUrl: null });
                else onError(applied.error);
              }}
              className="block text-[11px] text-red-600 hover:underline dark:text-red-400"
            >
              Remove
            </button>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadAvatar(file);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <div className="space-y-3">
        <TextControl
          label="Display name"
          value={identity.displayName}
          maxLength={60}
          onChange={(v) => setIdentity({ ...identity, displayName: v })}
        />
        <TextControl
          label="Headline"
          value={identity.headline}
          maxLength={120}
          placeholder="One line about you"
          onChange={(v) => setIdentity({ ...identity, headline: v })}
        />
        <TextControl
          label="Bio"
          value={identity.bio}
          maxLength={600}
          multiline
          placeholder="A few sentences about what you do"
          onChange={(v) => setIdentity({ ...identity, bio: v })}
        />
        <TextControl
          label="Location"
          value={identity.location}
          maxLength={120}
          placeholder="Tirana, AL"
          onChange={(v) => setIdentity({ ...identity, location: v })}
        />
        <TextControl
          label="Status"
          value={identity.statusText}
          maxLength={120}
          placeholder="Open to freelance work"
          onChange={(v) => setIdentity({ ...identity, statusText: v })}
        />

        <div>
          <p className="mb-1.5 text-xs text-ink-600 dark:text-ink-300">Visibility</p>
          <SegmentedControl
            value={identity.visibility}
            options={[
              { value: "PUBLIC", label: "Public" },
              { value: "UNLISTED", label: "Unlisted" },
              { value: "PRIVATE", label: "Private" },
            ]}
            onChange={(v) => setIdentity({ ...identity, visibility: v })}
          />
          <p className="mt-1.5 text-[11px] text-ink-400">
            {identity.visibility === "PUBLIC"
              ? "Anyone with the link can view it, and search engines may index it."
              : identity.visibility === "UNLISTED"
                ? "Anyone with the link can view it, but it is excluded from indexing."
                : "Only you can see it. Visitors get a 404."}
          </p>
        </div>

        <Button
          variant="accent"
          className="w-full text-[12px]"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await saveIdentity({
                displayName: identity.displayName,
                bio: identity.bio,
                headline: identity.headline,
                location: identity.location,
                statusText: identity.statusText,
                visibility: identity.visibility,
              });
              if (result.ok) onSaved(identity);
              else onError(result.error);
            })
          }
        >
          {pending ? <Spinner className="size-3.5" /> : <Icon icon={Save} className="size-3.5" />}
          Save details
        </Button>
        <p className="text-center text-[11px] text-ink-400">
          Remember to publish for these changes to appear on your live profile.
        </p>
      </div>
    </div>
  );
}

function LinksPanel({
  links,
  setLinks,
  onToast,
}: {
  links: LinkRow[];
  setLinks: (links: LinkRow[]) => void;
  onToast: (tone: "ok" | "error", message: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ label: "", url: "", icon: "LINK", highlight: false });
  const [busy, setBusy] = useState(false);
  const dragIndex = useRef<number | null>(null);

  function resetForm() {
    setForm({ label: "", url: "", icon: "LINK", highlight: false });
    setAdding(false);
    setEditingId(null);
  }

  async function submit() {
    setBusy(true);
    const result: ActionResult<{ id: string }> =
      editingId !== null
        ? await editLink({ id: editingId, ...form })
        : (await addLink(form)) as ActionResult<{ id: string }>;

    setBusy(false);
    if (!result.ok) {
      onToast("error", result.error);
      return;
    }

    if (editingId !== null) {
      setLinks(links.map((l) => (l.id === editingId ? { ...l, ...form } : l)));
    } else if (result.data?.id) {
      setLinks([...links, { id: result.data.id, visible: true, ...form }]);
    }
    resetForm();
  }

  async function persistOrder(next: LinkRow[]) {
    setLinks(next);
    const result = await moveLink(next[0]?.id ?? "", next.map((l) => l.id));
    if (!result.ok) onToast("error", result.error);
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= links.length) return;
    const next = [...links];
    [next[index], next[target]] = [next[target], next[index]];
    void persistOrder(next);
  }

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium text-ink-600 dark:text-ink-300">
          {links.length} link{links.length === 1 ? "" : "s"}
        </p>
        {!adding && editingId === null && (
          <Button variant="ghost" size="sm" onClick={() => setAdding(true)} className="text-[11px]">
            <Icon icon={Plus} className="size-3" /> Add
          </Button>
        )}
      </div>

      {(adding || editingId !== null) && (
        <div className="mb-4 space-y-2.5 rounded-xl border border-ink-200 bg-ink-50/60 p-3 dark:border-white/10 dark:bg-white/[0.03]">
          <Input
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            placeholder="Label (e.g. Instagram)"
            className="text-xs"
            aria-label="Link label"
            maxLength={80}
          />
          <Input
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            placeholder="https://instagram.com/you"
            className="text-xs"
            aria-label="Link URL"
            inputMode="url"
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-[11px] text-ink-600 dark:text-ink-300">
              <input
                type="checkbox"
                checked={form.highlight}
                onChange={(e) => setForm({ ...form, highlight: e.target.checked })}
                className="accent-brand-500"
              />
              Highlight
            </label>
            <div className="flex gap-1.5">
              <Button variant="quiet" size="sm" onClick={resetForm} className="text-[11px]">
                Cancel
              </Button>
              <Button variant="accent" size="sm" onClick={() => void submit()} disabled={busy || !form.label || !form.url} className="text-[11px]">
                {busy ? <Spinner className="size-3" /> : null}
                {editingId !== null ? "Update" : "Add link"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {links.length === 0 && !adding ? (
        <p className="rounded-xl border border-dashed border-ink-200 px-3 py-8 text-center text-[11px] text-ink-400 dark:border-white/10">
          No links yet. Add your socials, website or anything else.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {links.map((link, index) => (
            <li
              key={link.id}
              draggable
              onDragStart={() => (dragIndex.current = index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                const from = dragIndex.current;
                dragIndex.current = null;
                if (from === null || from === index) return;
                const next = [...links];
                const [moved] = next.splice(from, 1);
                next.splice(index, 0, moved);
                void persistOrder(next);
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-2 py-1.5 dark:border-white/10 dark:bg-white/[0.03]",
                !link.visible && "opacity-55",
              )}
            >
              <Icon icon={GripVertical} className="size-3.5 shrink-0 cursor-grab text-ink-300" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium">{link.label}</p>
                <p className="truncate text-[10px] text-ink-400">{link.url}</p>
              </div>
              <div className="flex shrink-0 items-center">
                <button onClick={() => move(index, -1)} disabled={index === 0} className="btn-quiet !p-1 disabled:opacity-30" aria-label={`Move ${link.label} up`}>
                  <Icon icon={ChevronUp} className="size-3" />
                </button>
                <button onClick={() => move(index, 1)} disabled={index === links.length - 1} className="btn-quiet !p-1 disabled:opacity-30" aria-label={`Move ${link.label} down`}>
                  <Icon icon={ChevronDown} className="size-3" />
                </button>
                <button
                  onClick={async () => {
                    const next = links.map((l) => (l.id === link.id ? { ...l, visible: !l.visible } : l));
                    setLinks(next);
                    const result = await editLink({ id: link.id, label: link.label, url: link.url, icon: link.icon, highlight: link.highlight, visible: !link.visible });
                    if (!result.ok) onToast("error", result.error);
                  }}
                  className="btn-quiet !p-1"
                  aria-label={link.visible ? `Hide ${link.label}` : `Show ${link.label}`}
                >
                  {link.visible ? <Icon icon={Eye} className="size-3" /> : <Icon icon={EyeOff} className="size-3" />}
                </button>
                <button
                  onClick={() => {
                    setEditingId(link.id);
                    setAdding(false);
                    setForm({ label: link.label, url: link.url, icon: link.icon, highlight: link.highlight });
                  }}
                  className="btn-quiet !p-1"
                  aria-label={`Edit ${link.label}`}
                >
                  <Icon icon={Pencil} className="size-3" />
                </button>
                <button
                  onClick={async () => {
                    const result = await removeLink(link.id);
                    if (result.ok) setLinks(links.filter((l) => l.id !== link.id));
                    else onToast("error", result.error);
                  }}
                  className="btn-quiet !p-1 text-red-500 hover:!bg-red-50 dark:hover:!bg-red-500/10"
                  aria-label={`Delete ${link.label}`}
                >
                  <Icon icon={Trash2} className="size-3" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-[10px] leading-relaxed text-ink-400">
        Drag to reorder. Links support https:// and mailto: only.
      </p>
    </div>
  );
}

function PublishPanel({
  draftDirty,
  publishedAt,
  revision,
  versions,
  onPublish,
  onRestore,
  publishing,
}: {
  draftDirty: boolean;
  publishedAt: string | null;
  revision: number;
  versions: VersionRow[];
  onPublish: () => void;
  onRestore: (id: string) => Promise<void>;
  publishing: boolean;
}) {
  return (
    <div className="p-4">
      <div
        className={cn(
          "rounded-xl border px-3 py-2.5 text-[11px]",
          draftDirty
            ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200"
            : "border-brand-200 bg-brand-50 text-brand-800 dark:border-brand-400/25 dark:bg-brand-400/10 dark:text-brand-200",
        )}
      >
        {draftDirty
          ? "You have unpublished changes. Visitors still see the previous version."
          : publishedAt
            ? "Your published profile matches your draft."
            : "Not published yet. Publish to make your profile live."}
      </div>

      <Button variant="accent" className="mt-3 w-full text-[12px]" onClick={onPublish} disabled={publishing}>
        {publishing ? <Spinner className="size-3.5" /> : <Icon icon={Sparkles} className="size-3.5" />}
        Publish now
      </Button>

      <div className="mt-5">
        <p className="eyebrow">Version history</p>
        {versions.length === 0 ? (
          <p className="mt-2 text-[11px] text-ink-400">Publish once to start keeping history.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {versions.map((version) => (
              <li key={version.id} className="flex items-center justify-between rounded-lg border border-ink-200 px-2.5 py-2 text-[11px] dark:border-white/10">
                <div>
                  <p className="font-medium">Version {version.version}</p>
                  <p className="text-[10px] text-ink-400">
                    {new Date(version.createdAt).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </div>
                {version.version === revision ? (
                  <span className="chip-accent">live</span>
                ) : (
                  <button
                    onClick={() => void onRestore(version.id)}
                    className="flex items-center gap-1 text-[11px] text-ink-500 hover:text-ink-900 dark:hover:text-white"
                    title="Restore this version as a new publish"
                  >
                    <Icon icon={RotateCcw} className="size-3" /> Restore
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ChecklistItem({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={cn(
          "grid size-4 shrink-0 place-items-center rounded-full text-[9px] font-bold",
          done ? "bg-brand-500 text-white" : "border border-ink-300 text-transparent dark:border-white/20",
        )}
        aria-hidden
      >
        ✓
      </span>
      <span className={done ? "text-ink-500 line-through decoration-ink-300 dark:text-ink-400" : ""}>{label}</span>
    </li>
  );
}

function ShortcutRow({ keys, action }: { keys: string; action: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt>{action}</dt>
      <dd className="rounded border border-ink-200 bg-ink-50 px-1.5 py-0.5 font-mono text-[10px] dark:border-white/10 dark:bg-white/[0.05]">
        {keys}
      </dd>
    </div>
  );
}

/** Uploads a background image and stores its media URL in the draft config. */
function BackgroundUpload({
  value,
  onChange,
  onError,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  onError: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    const form = new FormData();
    form.set("file", file);
    form.set("kind", "BACKGROUND");
    try {
      const res = await fetch("/api/media", { method: "POST", body: form });
      const data = (await res.json()) as { ok: boolean; url?: string; error?: string };
      if (!data.ok || !data.url) throw new Error(data.error ?? "Upload failed");
      onChange(data.url);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="mb-1.5 text-xs text-ink-600 dark:text-ink-300">Background image</p>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="text-[11px]" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? <Spinner className="size-3" /> : <Icon icon={Upload} className="size-3" />}
          {value ? "Replace" : "Upload"}
        </Button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[11px] text-red-600 hover:underline dark:text-red-400"
          >
            Remove
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />
      {value && (
        <div
          className="mt-2 h-16 w-full rounded-lg border border-ink-200 bg-cover bg-center dark:border-white/10"
          suppressHydrationWarning
          style={{ backgroundImage: `url(${value})` }}
          aria-hidden
        />
      )}
    </div>
  );
}

/** Preview stylesheet — the same generator the public page uses, plus keys. */
import { buildProfileCss } from "@/lib/profile-css";

function buildLiveCss(config: ProfileConfig): string {
  return (
    buildProfileCss(config) +
    `@keyframes vp-rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}@keyframes vp-fade{from{opacity:0}to{opacity:1}}.vp-anim-rise{animation:vp-rise .55s cubic-bezier(.22,1,.36,1) both}.vp-anim-fade{animation:vp-fade .45s ease both}`
  );
}
