"use client";

import { useMemo, useState } from "react";
import type { SavedTheme } from "@/db/schema";
import type { ThemeCard } from "@/lib/themes";
import {
  BACKGROUND_MOTIONS,
  BACKGROUND_TYPES,
  BUTTON_STYLES,
  CARD_HOVER_OPTIONS,
  configWithTheme,
  ENTRANCE_OPTIONS,
  FONT_OPTIONS,
  RADIUS_OPTIONS,
  type BreakpointOverride,
  type FontValue,
  type HeadingFontValue,
  type ProfileConfig,
} from "@/lib/profile-config";
import { cn } from "@/lib/utils";
import { ColorControl, ControlGroup, RangeControl, SegmentedControl, ToggleControl } from "./controls";
import type { UpdateOptions } from "./editor-store";
import type { DeviceMode } from "./interactive-canvas";
import { uploadMediaFile } from "./upload-client";

type DesignSubTab = "themes" | "backdrop" | "style" | "type" | "motion" | "responsive";

const SUB_TABS: readonly { id: DesignSubTab; label: string }[] = [
  { id: "themes", label: "Themes" },
  { id: "backdrop", label: "Backdrop" },
  { id: "style", label: "Style" },
  { id: "type", label: "Type" },
  { id: "motion", label: "Motion" },
  { id: "responsive", label: "Screens" },
];

/**
 * Full V2 Design panel:
 *  - 20 curated themes + category filter + user-saved personal themes
 *  - Solid, 2/3-stop linear gradient, multi-point mesh, image, and looping MP4/WebM video + poster
 *  - Card glass/shadow/border, colour tokens, and button variants
 *  - Self-hosted open-source Google Fonts, separate heading font, and binary-verified custom font uploads
 *  - Expanded entrance, stagger, background motion, accent glow, and card hover animations
 *  - Full Desktop / Tablet (<=900px) / Mobile (<=480px) breakpoint overrides
 */
export function DesignPanel({
  draft,
  themes,
  savedThemes,
  themeSlug,
  device,
  onDeviceChange,
  onUpdate,
  onApplyTheme,
  onSaveCustomTheme,
  onApplySavedTheme,
  onDeleteSavedTheme,
  onNotify,
}: {
  draft: ProfileConfig;
  themes: ThemeCard[];
  savedThemes: SavedTheme[];
  themeSlug: string | null;
  device: DeviceMode;
  onDeviceChange: (next: DeviceMode) => void;
  onUpdate: (recipe: (d: ProfileConfig) => ProfileConfig, opts?: UpdateOptions | string) => void;
  onApplyTheme: (slug: string) => void;
  onSaveCustomTheme: (name: string) => Promise<boolean>;
  onApplySavedTheme: (id: string) => void;
  onDeleteSavedTheme: (id: string) => void;
  onNotify: (msg: string) => void;
}) {
  const [subTab, setSubTab] = useState<DesignSubTab>("themes");
  const [category, setCategory] = useState<string>("All");
  const [newThemeName, setNewThemeName] = useState("");
  const [savingTheme, setSavingTheme] = useState(false);
  const [uploadingKind, setUploadingKind] = useState<string | null>(null);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const t of themes) set.add(t.category);
    return ["All", ...Array.from(set)];
  }, [themes]);

  const filteredThemes = useMemo(
    () => (category === "All" ? themes : themes.filter((t) => t.category === category)),
    [themes, category],
  );

  async function handleUpload(
    file: File,
    kind: "BACKGROUND" | "VIDEO" | "FONT",
    slot: "bg-image" | "bg-video" | "bg-poster" | "custom-font",
  ) {
    setUploadingKind(slot);
    const res = await uploadMediaFile(file, kind);
    setUploadingKind(null);
    if (!res.ok) {
      onNotify(res.error);
      return;
    }

    if (slot === "bg-image") {
      onUpdate(
        (d) => ({
          ...d,
          theme: { ...d.theme, background: { ...d.theme.background, type: "image", imageUrl: res.media.url } },
        }),
        "Upload background image",
      );
      onNotify("Background image uploaded.");
    } else if (slot === "bg-video") {
      onUpdate(
        (d) => ({
          ...d,
          theme: { ...d.theme, background: { ...d.theme.background, type: "video", videoUrl: res.media.url } },
        }),
        "Upload video background",
      );
      onNotify("Video background uploaded.");
    } else if (slot === "bg-poster") {
      onUpdate(
        (d) => ({
          ...d,
          theme: { ...d.theme, background: { ...d.theme.background, posterUrl: res.media.url } },
        }),
        "Upload video poster",
      );
      onNotify("Poster image uploaded.");
    } else if (slot === "custom-font") {
      const displayName = file.name.replace(/\.(woff2|woff|ttf|otf)$/i, "").slice(0, 60) || "Custom font";
      onUpdate(
        (d) => ({
          ...d,
          theme: {
            ...d.theme,
            typography: {
              ...d.theme.typography,
              font: "custom",
              customFontUrl: res.media.url,
              customFontName: displayName,
            },
          },
        }),
        `Upload font "${displayName}"`,
      );
      onNotify(`Font "${displayName}" uploaded and active.`);
    }
  }

  function patchBreakpoint(
    bp: "tablet" | "mobile",
    field: keyof BreakpointOverride,
    value: BreakpointOverride[keyof BreakpointOverride] | undefined,
  ) {
    onUpdate(
      (d) => {
        const next: BreakpointOverride = { ...d.breakpoints[bp] };
        if (value === undefined) {
          delete next[field];
        } else {
          (next as Record<string, unknown>)[field] = value;
        }
        return { ...d, breakpoints: { ...d.breakpoints, [bp]: next } };
      },
      { label: `Update ${bp} ${field}`, coalesce: true },
    );
  }

  const { background: bg, card, text, typography, buttons, effects } = draft.theme;

  return (
    <div>
      {/* Sub-navigation */}
      <div className="grid grid-cols-3 gap-1 border-b border-ink-200/70 p-2.5 dark:border-white/[0.07]">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id)}
            className={cn(
              "rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors",
              subTab === t.id
                ? "bg-ink-900 text-white dark:bg-white dark:text-ink-950"
                : "text-ink-500 hover:bg-ink-100 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-white/[0.05] dark:hover:text-white",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 1. THEMES (Curated 20 + Saved Custom Themes) */}
      {subTab === "themes" && (
        <div className="space-y-5 p-4">
          {/* Save current design as reusable custom theme */}
          <div className="space-y-2.5 rounded-xl border border-ink-200/80 bg-ink-50/60 p-3 dark:border-white/[0.07] dark:bg-white/[0.02]">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-ink-800 dark:text-ink-100">My saved themes</p>
              <span className="text-[10px] text-ink-400">{savedThemes.length} saved</span>
            </div>
            <form
              className="flex gap-1.5"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newThemeName.trim() || savingTheme) return;
                setSavingTheme(true);
                const ok = await onSaveCustomTheme(newThemeName.trim());
                setSavingTheme(false);
                if (ok) setNewThemeName("");
              }}
            >
              <input
                type="text"
                value={newThemeName}
                onChange={(e) => setNewThemeName(e.target.value)}
                maxLength={60}
                placeholder="Save current look as…"
                aria-label="Custom theme name"
                className="min-w-0 flex-1 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-black/30"
              />
              <button
                type="submit"
                disabled={!newThemeName.trim() || savingTheme}
                className="btn-secondary shrink-0 px-3 py-1.5 text-xs"
              >
                {savingTheme ? "…" : "Save"}
              </button>
            </form>

            {savedThemes.length > 0 && (
              <div className="grid grid-cols-2 gap-1.5 pt-1">
                {savedThemes.map((saved) => {
                  const preview = configWithTheme(saved.tokens).theme;
                  const swatch =
                    preview.background.type === "solid"
                      ? preview.background.color
                      : `linear-gradient(135deg, ${preview.background.gradientFrom}, ${preview.background.gradientTo})`;
                  return (
                    <div
                      key={saved.id}
                      className="group relative overflow-hidden rounded-lg border border-ink-200 bg-white dark:border-white/10 dark:bg-white/[0.03]"
                    >
                      <button
                        type="button"
                        onClick={() => onApplySavedTheme(saved.id)}
                        className="w-full p-2 text-left"
                      >
                        <div className="h-7 rounded" style={{ background: swatch }} />
                        <p className="mt-1.5 truncate pr-4 text-[11px] font-medium">{saved.name}</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteSavedTheme(saved.id)}
                        aria-label={`Delete saved theme ${saved.name}`}
                        className="absolute right-1.5 top-1.5 rounded bg-black/55 px-1 text-[10px] text-white opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Curated templates */}
          <div>
            <p className="mb-2 text-xs text-ink-500 dark:text-ink-400">
              Presets keep your blocks, groups, links, and layout intact.
            </p>
            <div className="mb-3 flex flex-wrap gap-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[11px] transition-colors",
                    category === cat
                      ? "bg-brand-500/20 font-medium text-brand-700 dark:text-brand-300"
                      : "bg-ink-100 text-ink-500 hover:text-ink-800 dark:bg-white/[0.05] dark:text-ink-400 dark:hover:text-white",
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {filteredThemes.map((theme) => {
                const preview = configWithTheme(theme.tokens).theme;
                const swatch =
                  preview.background.type === "solid"
                    ? preview.background.color
                    : preview.background.type === "mesh"
                      ? `radial-gradient(at 20% 25%, ${preview.background.gradientFrom}, transparent 65%), radial-gradient(at 80% 75%, ${preview.background.gradientTo}, transparent 65%), ${preview.background.color}`
                      : `linear-gradient(${preview.background.gradientAngle}deg, ${preview.background.gradientFrom}, ${preview.background.gradientTo})`;
                const active = themeSlug === theme.slug;
                return (
                  <button
                    key={theme.slug}
                    type="button"
                    onClick={() => onApplyTheme(theme.slug)}
                    className={cn(
                      "group rounded-xl border p-2 text-left transition-all",
                      active
                        ? "border-brand-500 ring-2 ring-brand-500/20"
                        : "border-ink-200 hover:border-ink-300 dark:border-white/10 dark:hover:border-white/20",
                    )}
                  >
                    <div
                      className="flex h-14 items-end rounded-lg p-2"
                      style={{ background: swatch, color: preview.text.primary }}
                    >
                      <span
                        className="inline-block size-2.5 rounded-full shadow"
                        style={{ background: preview.text.accent }}
                      />
                    </div>
                    <p className="mt-1.5 truncate text-xs font-medium">{theme.name}</p>
                    <p className="truncate text-[10px] text-ink-400">{theme.category}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 2. BACKDROP (Solid / Gradient / Mesh / Image / Looping Video + Poster) */}
      {subTab === "backdrop" && (
        <ControlGroup title="Background & Video">
          <SegmentedControl
            label="Type"
            columns={5}
            value={bg.type}
            options={BACKGROUND_TYPES.map((t) => ({
              value: t,
              label: t === "gradient" ? "Grad" : t.charAt(0).toUpperCase() + t.slice(1),
            }))}
            onChange={(type) =>
              onUpdate(
                (d) => ({ ...d, theme: { ...d.theme, background: { ...d.theme.background, type } } }),
                `Switch background to ${type}`,
              )
            }
          />

          {(bg.type === "solid" || bg.type === "mesh") && (
            <ColorControl
              label={bg.type === "mesh" ? "Base canvas" : "Colour"}
              value={bg.color}
              onChange={(color) =>
                onUpdate(
                  (d) => ({ ...d, theme: { ...d.theme, background: { ...d.theme.background, color } } }),
                  { label: "Change background colour", coalesce: true },
                )
              }
            />
          )}

          {(bg.type === "gradient" || bg.type === "mesh") && (
            <>
              <ColorControl
                label={bg.type === "mesh" ? "Spot 1" : "From"}
                value={bg.gradientFrom}
                onChange={(gradientFrom) =>
                  onUpdate(
                    (d) => ({ ...d, theme: { ...d.theme, background: { ...d.theme.background, gradientFrom } } }),
                    { label: "Change gradient start", coalesce: true },
                  )
                }
              />
              <div className="space-y-2">
                <ToggleControl
                  label={bg.type === "mesh" ? "Custom Spot 2" : "Three-colour gradient"}
                  checked={bg.gradientMid !== null}
                  onChange={(on) =>
                    onUpdate(
                      (d) => ({
                        ...d,
                        theme: {
                          ...d.theme,
                          background: {
                            ...d.theme.background,
                            gradientMid: on ? d.theme.text.accent : null,
                          },
                        },
                      }),
                      "Toggle mid gradient stop",
                    )
                  }
                />
                {bg.gradientMid && (
                  <ColorControl
                    label={bg.type === "mesh" ? "Spot 2" : "Mid"}
                    value={bg.gradientMid}
                    onChange={(gradientMid) =>
                      onUpdate(
                        (d) => ({ ...d, theme: { ...d.theme, background: { ...d.theme.background, gradientMid } } }),
                        { label: "Change gradient midpoint", coalesce: true },
                      )
                    }
                  />
                )}
              </div>
              <ColorControl
                label={bg.type === "mesh" ? "Spot 3" : "To"}
                value={bg.gradientTo}
                onChange={(gradientTo) =>
                  onUpdate(
                    (d) => ({ ...d, theme: { ...d.theme, background: { ...d.theme.background, gradientTo } } }),
                    { label: "Change gradient end", coalesce: true },
                  )
                }
              />
              {bg.type === "gradient" && (
                <RangeControl
                  label="Angle"
                  value={bg.gradientAngle}
                  min={0}
                  max={360}
                  unit="deg"
                  onChange={(gradientAngle) =>
                    onUpdate(
                      (d) => ({ ...d, theme: { ...d.theme, background: { ...d.theme.background, gradientAngle } } }),
                      { label: "Change gradient angle", coalesce: true },
                    )
                  }
                />
              )}
            </>
          )}

          {bg.type === "image" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <label className="btn-secondary flex-1 cursor-pointer justify-center text-xs">
                  {uploadingKind === "bg-image"
                    ? "Uploading…"
                    : bg.imageUrl
                      ? "Change image"
                      : "Upload image"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
                    className="sr-only"
                    disabled={uploadingKind !== null}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void handleUpload(f, "BACKGROUND", "bg-image");
                    }}
                  />
                </label>
                {bg.imageUrl && (
                  <button
                    type="button"
                    className="btn-ghost text-xs"
                    onClick={() =>
                      onUpdate(
                        (d) => ({ ...d, theme: { ...d.theme, background: { ...d.theme.background, imageUrl: null } } }),
                        "Clear background image",
                      )
                    }
                  >
                    Remove
                  </button>
                )}
              </div>
              <ColorControl
                label="Fallback colour"
                value={bg.gradientFrom}
                onChange={(gradientFrom) =>
                  onUpdate(
                    (d) => ({ ...d, theme: { ...d.theme, background: { ...d.theme.background, gradientFrom } } }),
                    { label: "Change fallback colour", coalesce: true },
                  )
                }
              />
              <RangeControl
                label="Backdrop blur"
                value={bg.blur}
                min={0}
                max={40}
                unit="px"
                onChange={(blur) =>
                  onUpdate(
                    (d) => ({ ...d, theme: { ...d.theme, background: { ...d.theme.background, blur } } }),
                    { label: "Change backdrop blur", coalesce: true },
                  )
                }
              />
              <RangeControl
                label="Dim overlay"
                value={bg.dim}
                min={0}
                max={90}
                unit="%"
                onChange={(dim) =>
                  onUpdate(
                    (d) => ({ ...d, theme: { ...d.theme, background: { ...d.theme.background, dim } } }),
                    { label: "Change backdrop dim", coalesce: true },
                  )
                }
              />
            </div>
          )}

          {bg.type === "video" && (
            <div className="space-y-3">
              <div className="rounded-lg border border-ink-200/80 bg-ink-50/70 p-2.5 text-[11px] text-ink-500 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-ink-400">
                Muted looping MP4 or WebM clip (up to 16 MB), streamed with HTTP byte ranges. Visitors with Reduced Motion or Data Saver see your poster image with zero video bytes transferred.
              </div>

              <div className="flex items-center gap-2">
                <label className="btn-secondary flex-1 cursor-pointer justify-center text-xs">
                  {uploadingKind === "bg-video"
                    ? "Uploading video…"
                    : bg.videoUrl
                      ? "Replace video"
                      : "Upload MP4 / WebM"}
                  <input
                    type="file"
                    accept="video/mp4,video/webm,.mp4,.webm"
                    className="sr-only"
                    disabled={uploadingKind !== null}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void handleUpload(f, "VIDEO", "bg-video");
                    }}
                  />
                </label>
                {bg.videoUrl && (
                  <button
                    type="button"
                    className="btn-ghost text-xs"
                    onClick={() =>
                      onUpdate(
                        (d) => ({ ...d, theme: { ...d.theme, background: { ...d.theme.background, videoUrl: null } } }),
                        "Remove background video",
                      )
                    }
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <label className="btn-secondary flex-1 cursor-pointer justify-center text-xs">
                  {uploadingKind === "bg-poster"
                    ? "Uploading poster…"
                    : bg.posterUrl
                      ? "Replace poster"
                      : "Upload poster fallback"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/avif"
                    className="sr-only"
                    disabled={uploadingKind !== null}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void handleUpload(f, "BACKGROUND", "bg-poster");
                    }}
                  />
                </label>
                {bg.posterUrl && (
                  <button
                    type="button"
                    className="btn-ghost text-xs"
                    onClick={() =>
                      onUpdate(
                        (d) => ({ ...d, theme: { ...d.theme, background: { ...d.theme.background, posterUrl: null } } }),
                        "Clear poster image",
                      )
                    }
                  >
                    Clear
                  </button>
                )}
              </div>

              <ColorControl
                label="Fallback colour"
                value={bg.gradientFrom}
                onChange={(gradientFrom) =>
                  onUpdate(
                    (d) => ({ ...d, theme: { ...d.theme, background: { ...d.theme.background, gradientFrom } } }),
                    { label: "Change video fallback colour", coalesce: true },
                  )
                }
              />
              <RangeControl
                label="Video blur"
                value={bg.blur}
                min={0}
                max={40}
                unit="px"
                onChange={(blur) =>
                  onUpdate(
                    (d) => ({ ...d, theme: { ...d.theme, background: { ...d.theme.background, blur } } }),
                    { label: "Change video blur", coalesce: true },
                  )
                }
              />
              <RangeControl
                label="Dim overlay"
                value={bg.dim}
                min={0}
                max={90}
                unit="%"
                onChange={(dim) =>
                  onUpdate(
                    (d) => ({ ...d, theme: { ...d.theme, background: { ...d.theme.background, dim } } }),
                    { label: "Change video dim", coalesce: true },
                  )
                }
              />
            </div>
          )}
        </ControlGroup>
      )}

      {/* 3. STYLE (Colours, Card, Buttons) */}
      {subTab === "style" && (
        <>
          <ControlGroup title="Colours">
            <ColorControl
              label="Primary text"
              value={text.primary}
              onChange={(primary) =>
                onUpdate((d) => ({ ...d, theme: { ...d.theme, text: { ...d.theme.text, primary } } }), {
                  label: "Change text colour",
                  coalesce: true,
                })
              }
            />
            <ColorControl
              label="Muted text"
              value={text.muted}
              onChange={(muted) =>
                onUpdate((d) => ({ ...d, theme: { ...d.theme, text: { ...d.theme.text, muted } } }), {
                  label: "Change muted colour",
                  coalesce: true,
                })
              }
            />
            <ColorControl
              label="Accent"
              value={text.accent}
              onChange={(accent) =>
                onUpdate((d) => ({ ...d, theme: { ...d.theme, text: { ...d.theme.text, accent } } }), {
                  label: "Change accent colour",
                  coalesce: true,
                })
              }
            />
          </ControlGroup>

          <ControlGroup title="Card surface">
            <ColorControl
              label="Surface"
              value={card.surface}
              onChange={(surface) =>
                onUpdate((d) => ({ ...d, theme: { ...d.theme, card: { ...d.theme.card, surface } } }), {
                  label: "Change card surface",
                  coalesce: true,
                })
              }
            />
            <RangeControl
              label="Opacity"
              value={card.opacity}
              min={0}
              max={100}
              unit="%"
              onChange={(opacity) =>
                onUpdate((d) => ({ ...d, theme: { ...d.theme, card: { ...d.theme.card, opacity } } }), {
                  label: "Change card opacity",
                  coalesce: true,
                })
              }
            />
            <RangeControl
              label="Glass blur"
              value={card.blur}
              min={0}
              max={40}
              unit="px"
              onChange={(blur) =>
                onUpdate((d) => ({ ...d, theme: { ...d.theme, card: { ...d.theme.card, blur } } }), {
                  label: "Change card blur",
                  coalesce: true,
                })
              }
            />
            <SegmentedControl
              label="Corner radius"
              columns={6}
              value={card.radius}
              options={RADIUS_OPTIONS.map((r) => ({ value: r, label: r }))}
              onChange={(radius) =>
                onUpdate((d) => ({ ...d, theme: { ...d.theme, card: { ...d.theme.card, radius } } }), "Change card radius")
              }
            />
            <ColorControl
              label="Border colour"
              value={card.borderColor}
              onChange={(borderColor) =>
                onUpdate((d) => ({ ...d, theme: { ...d.theme, card: { ...d.theme.card, borderColor } } }), {
                  label: "Change border colour",
                  coalesce: true,
                })
              }
            />
            <RangeControl
              label="Border opacity"
              value={card.borderOpacity}
              min={0}
              max={100}
              unit="%"
              onChange={(borderOpacity) =>
                onUpdate((d) => ({ ...d, theme: { ...d.theme, card: { ...d.theme.card, borderOpacity } } }), {
                  label: "Change border opacity",
                  coalesce: true,
                })
              }
            />
            <RangeControl
              label="Border width"
              value={card.borderWidth}
              min={0}
              max={6}
              unit="px"
              onChange={(borderWidth) =>
                onUpdate((d) => ({ ...d, theme: { ...d.theme, card: { ...d.theme.card, borderWidth } } }), {
                  label: "Change border width",
                  coalesce: true,
                })
              }
            />
            <RangeControl
              label="Padding"
              value={card.padding}
              min={12}
              max={64}
              unit="px"
              onChange={(padding) =>
                onUpdate((d) => ({ ...d, theme: { ...d.theme, card: { ...d.theme.card, padding } } }), {
                  label: "Change card padding",
                  coalesce: true,
                })
              }
            />
            <SegmentedControl
              label="Shadow"
              columns={3}
              value={card.shadow}
              options={[
                { value: "none", label: "None" },
                { value: "soft", label: "Soft" },
                { value: "strong", label: "Deep" },
              ]}
              onChange={(shadow) =>
                onUpdate((d) => ({ ...d, theme: { ...d.theme, card: { ...d.theme.card, shadow } } }), "Change card shadow")
              }
            />
          </ControlGroup>

          <ControlGroup title="Link buttons" defaultOpen={false}>
            <SegmentedControl
              label="Style"
              columns={4}
              value={buttons.style}
              options={BUTTON_STYLES.map((s) => ({ value: s, label: s }))}
              onChange={(style) =>
                onUpdate((d) => ({ ...d, theme: { ...d.theme, buttons: { ...d.theme.buttons, style } } }), "Change button style")
              }
            />
            <SegmentedControl
              label="Radius"
              columns={6}
              value={buttons.radius}
              options={RADIUS_OPTIONS.map((r) => ({ value: r, label: r }))}
              onChange={(radius) =>
                onUpdate((d) => ({ ...d, theme: { ...d.theme, buttons: { ...d.theme.buttons, radius } } }), "Change button radius")
              }
            />
            <ColorControl
              label="Fill tint"
              value={buttons.fill}
              onChange={(fill) =>
                onUpdate((d) => ({ ...d, theme: { ...d.theme, buttons: { ...d.theme.buttons, fill } } }), {
                  label: "Change button fill",
                  coalesce: true,
                })
              }
            />
            <RangeControl
              label="Fill strength"
              value={buttons.fillOpacity}
              min={0}
              max={100}
              unit="%"
              onChange={(fillOpacity) =>
                onUpdate((d) => ({ ...d, theme: { ...d.theme, buttons: { ...d.theme.buttons, fillOpacity } } }), {
                  label: "Change button fill opacity",
                  coalesce: true,
                })
              }
            />
            <ToggleControl
              label="Lift on hover"
              checked={buttons.hoverLift}
              onChange={(hoverLift) =>
                onUpdate((d) => ({ ...d, theme: { ...d.theme, buttons: { ...d.theme.buttons, hoverLift } } }), "Toggle button hover lift")
              }
            />
          </ControlGroup>
        </>
      )}

      {/* 4. TYPOGRAPHY (Self-hosted Google Fonts + Custom Font Uploads) */}
      {subTab === "type" && (
        <>
          <ControlGroup title="Font family">
            <div>
              <label htmlFor="body-font-select" className="mb-1.5 block text-xs text-ink-600 dark:text-ink-300">
                Body font (self-hosted — zero external requests)
              </label>
              <select
                id="body-font-select"
                value={typography.font}
                onChange={(e) =>
                  onUpdate(
                    (d) => ({
                      ...d,
                      theme: {
                        ...d.theme,
                        typography: { ...d.theme.typography, font: e.target.value as FontValue },
                      },
                    }),
                    "Change body font",
                  )
                }
                className="w-full rounded-lg border border-ink-200 bg-white px-2.5 py-2 text-xs dark:border-white/10 dark:bg-black/30 dark:text-white"
              >
                {FONT_OPTIONS.filter((f) => f.value !== "custom" || typography.customFontUrl).map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.value === "custom" && typography.customFontName
                      ? `${typography.customFontName} (Uploaded)`
                      : `${f.label} · ${f.category}`}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="heading-font-select" className="mb-1.5 block text-xs text-ink-600 dark:text-ink-300">
                Heading font
              </label>
              <select
                id="heading-font-select"
                value={typography.headingFont}
                onChange={(e) =>
                  onUpdate(
                    (d) => ({
                      ...d,
                      theme: {
                        ...d.theme,
                        typography: {
                          ...d.theme.typography,
                          headingFont: e.target.value as HeadingFontValue,
                        },
                      },
                    }),
                    "Change heading font",
                  )
                }
                className="w-full rounded-lg border border-ink-200 bg-white px-2.5 py-2 text-xs dark:border-white/10 dark:bg-black/30 dark:text-white"
              >
                <option value="inherit">Same as body font</option>
                {FONT_OPTIONS.filter((f) => f.value !== "custom" || typography.customFontUrl).map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.value === "custom" && typography.customFontName
                      ? `${typography.customFontName} (Uploaded)`
                      : `${f.label} · ${f.category}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Custom web font upload (WOFF2 / WOFF / TTF / OTF) */}
            <div className="space-y-2 rounded-xl border border-ink-200/80 bg-ink-50/60 p-3 dark:border-white/[0.07] dark:bg-white/[0.02]">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-ink-700 dark:text-ink-200">Custom font file</p>
                <span className="text-[10px] text-ink-400">WOFF2 · WOFF · TTF · OTF · max 2 MB</span>
              </div>
              {typography.customFontUrl && (
                <p className="truncate text-[11px] text-emerald-600 dark:text-emerald-400">
                  ✓ {typography.customFontName || "Uploaded font"} ready
                </p>
              )}
              <div className="flex gap-2">
                <label className="btn-secondary flex-1 cursor-pointer justify-center text-xs">
                  {uploadingKind === "custom-font"
                    ? "Verifying font…"
                    : typography.customFontUrl
                      ? "Replace font"
                      : "Upload font"}
                  <input
                    type="file"
                    accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf"
                    className="sr-only"
                    disabled={uploadingKind !== null}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void handleUpload(f, "FONT", "custom-font");
                    }}
                  />
                </label>
                {typography.customFontUrl && (
                  <button
                    type="button"
                    className="btn-ghost text-xs"
                    onClick={() =>
                      onUpdate(
                        (d) => ({
                          ...d,
                          theme: {
                            ...d.theme,
                            typography: {
                              ...d.theme.typography,
                              font: d.theme.typography.font === "custom" ? "inter" : d.theme.typography.font,
                              headingFont:
                                d.theme.typography.headingFont === "custom"
                                  ? "inherit"
                                  : d.theme.typography.headingFont,
                              customFontUrl: null,
                              customFontName: null,
                            },
                          },
                        }),
                        "Remove custom font",
                      )
                    }
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </ControlGroup>

          <ControlGroup title="Scale & spacing">
            <RangeControl
              label="Base size"
              value={typography.baseSize}
              min={12}
              max={22}
              unit="px"
              onChange={(baseSize) =>
                onUpdate((d) => ({ ...d, theme: { ...d.theme, typography: { ...d.theme.typography, baseSize } } }), {
                  label: "Change font size",
                  coalesce: true,
                })
              }
            />
            <SegmentedControl
              label="Heading weight"
              columns={4}
              value={typography.headingWeight}
              options={[
                { value: "500", label: "500" },
                { value: "600", label: "600" },
                { value: "700", label: "700" },
                { value: "800", label: "800" },
              ]}
              onChange={(headingWeight) =>
                onUpdate(
                  (d) => ({ ...d, theme: { ...d.theme, typography: { ...d.theme.typography, headingWeight } } }),
                  "Change heading weight",
                )
              }
            />
            <RangeControl
              label="Letter spacing"
              value={typography.letterSpacing}
              min={-2}
              max={4}
              step={0.5}
              onChange={(letterSpacing) =>
                onUpdate((d) => ({ ...d, theme: { ...d.theme, typography: { ...d.theme.typography, letterSpacing } } }), {
                  label: "Change letter spacing",
                  coalesce: true,
                })
              }
            />
            <RangeControl
              label="Line height"
              value={typography.lineHeight}
              min={1.1}
              max={2}
              step={0.05}
              onChange={(lineHeight) =>
                onUpdate((d) => ({ ...d, theme: { ...d.theme, typography: { ...d.theme.typography, lineHeight } } }), {
                  label: "Change line height",
                  coalesce: true,
                })
              }
            />
          </ControlGroup>
        </>
      )}

      {/* 5. MOTION & EFFECTS */}
      {subTab === "motion" && (
        <ControlGroup title="Animations & atmosphere">
          <p className="text-[11px] text-ink-500 dark:text-ink-400">
            All motion is pure CSS and automatically disabled for visitors with <code>prefers-reduced-motion</code>.
          </p>

          <ToggleControl
            label="Ambient backdrop motion"
            description="Soft colour blooms moving gently behind your card."
            checked={effects.animatedBackground}
            onChange={(animatedBackground) =>
              onUpdate(
                (d) => ({ ...d, theme: { ...d.theme, effects: { ...d.theme.effects, animatedBackground } } }),
                "Toggle backdrop motion",
              )
            }
          />
          {effects.animatedBackground && (
            <SegmentedControl
              label="Backdrop style"
              columns={3}
              value={effects.backgroundMotion}
              options={BACKGROUND_MOTIONS.map((m) => ({
                value: m,
                label: m.charAt(0).toUpperCase() + m.slice(1),
              }))}
              onChange={(backgroundMotion) =>
                onUpdate(
                  (d) => ({ ...d, theme: { ...d.theme, effects: { ...d.theme.effects, backgroundMotion } } }),
                  "Change backdrop motion style",
                )
              }
            />
          )}

          <ToggleControl
            label="Accent aura glow"
            description="Subtle accent-tinted halo around your profile card."
            checked={effects.glow}
            onChange={(glow) =>
              onUpdate(
                (d) => ({ ...d, theme: { ...d.theme, effects: { ...d.theme.effects, glow } } }),
                "Toggle accent glow",
              )
            }
          />

          <ToggleControl
            label="Film grain texture"
            description="Delicate analog grain over smooth gradients."
            checked={effects.noise}
            onChange={(noise) =>
              onUpdate(
                (d) => ({ ...d, theme: { ...d.theme, effects: { ...d.theme.effects, noise } } }),
                "Toggle film grain",
              )
            }
          />

          <SegmentedControl
            label="Page entrance"
            columns={5}
            value={effects.entrance}
            options={ENTRANCE_OPTIONS.map((e) => ({
              value: e,
              label: e.charAt(0).toUpperCase() + e.slice(1),
            }))}
            onChange={(entrance) =>
              onUpdate(
                (d) => ({ ...d, theme: { ...d.theme, effects: { ...d.theme.effects, entrance } } }),
                "Change entrance animation",
              )
            }
          />

          <ToggleControl
            label="Stagger sections"
            description="Cascades header, blocks, and links with gentle delays."
            checked={effects.stagger}
            onChange={(stagger) =>
              onUpdate(
                (d) => ({ ...d, theme: { ...d.theme, effects: { ...d.theme.effects, stagger } } }),
                "Toggle section stagger",
              )
            }
          />

          <SegmentedControl
            label="Card hover"
            columns={3}
            value={effects.cardHover}
            options={CARD_HOVER_OPTIONS.map((c) => ({
              value: c,
              label: c.charAt(0).toUpperCase() + c.slice(1),
            }))}
            onChange={(cardHover) =>
              onUpdate(
                (d) => ({ ...d, theme: { ...d.theme, effects: { ...d.theme.effects, cardHover } } }),
                "Change card hover",
              )
            }
          />
        </ControlGroup>
      )}

      {/* 6. RESPONSIVE BREAKPOINTS (Desktop / Tablet / Mobile) */}
      {subTab === "responsive" && (
        <div className="space-y-4 p-4">
          <SegmentedControl
            label="Editing viewport"
            columns={3}
            value={device}
            options={[
              { value: "desktop", label: "Desktop" },
              { value: "tablet", label: "Tablet ≤900" },
              { value: "mobile", label: "Mobile ≤480" },
            ]}
            onChange={onDeviceChange}
          />

          {device === "desktop" ? (
            <div className="space-y-3.5 rounded-xl border border-ink-200/80 p-3.5 dark:border-white/[0.08]">
              <p className="text-xs text-ink-500 dark:text-ink-400">
                Desktop defines the base values inherited by Tablet and Mobile unless overridden.
              </p>
              <RangeControl
                label="Card width"
                value={draft.layout.width}
                min={320}
                max={960}
                step={10}
                unit="px"
                onChange={(width) =>
                  onUpdate((d) => ({ ...d, layout: { ...d.layout, width } }), {
                    label: "Change desktop width",
                    coalesce: true,
                  })
                }
              />
              <RangeControl
                label="Element gap"
                value={draft.layout.gap}
                min={4}
                max={32}
                unit="px"
                onChange={(gap) =>
                  onUpdate((d) => ({ ...d, layout: { ...d.layout, gap } }), {
                    label: "Change desktop gap",
                    coalesce: true,
                  })
                }
              />
              <RangeControl
                label="Card padding"
                value={draft.theme.card.padding}
                min={12}
                max={64}
                unit="px"
                onChange={(padding) =>
                  onUpdate((d) => ({ ...d, theme: { ...d.theme, card: { ...d.theme.card, padding } } }), {
                    label: "Change desktop padding",
                    coalesce: true,
                  })
                }
              />
              <RangeControl
                label="Base font size"
                value={draft.theme.typography.baseSize}
                min={12}
                max={22}
                unit="px"
                onChange={(baseSize) =>
                  onUpdate((d) => ({ ...d, theme: { ...d.theme, typography: { ...d.theme.typography, baseSize } } }), {
                    label: "Change desktop font size",
                    coalesce: true,
                  })
                }
              />
              <SegmentedControl
                label="Alignment"
                columns={2}
                value={draft.layout.alignment}
                options={[
                  { value: "center", label: "Centred" },
                  { value: "left", label: "Left" },
                ]}
                onChange={(alignment) =>
                  onUpdate((d) => ({ ...d, layout: { ...d.layout, alignment } }), "Change desktop alignment")
                }
              />
            </div>
          ) : (
            (() => {
              const bp = device;
              const override = draft.breakpoints[bp];
              const hasAny = Object.keys(override).length > 0;
              return (
                <div className="space-y-3.5 rounded-xl border border-ink-200/80 p-3.5 dark:border-white/[0.08]">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium capitalize">
                      {bp} overrides ({bp === "tablet" ? "≤ 900px" : "≤ 480px"})
                    </p>
                    {hasAny && (
                      <button
                        type="button"
                        onClick={() =>
                          onUpdate(
                            (d) => ({ ...d, breakpoints: { ...d.breakpoints, [bp]: {} } }),
                            `Reset ${bp} overrides`,
                          )
                        }
                        className="text-[11px] font-medium text-brand-600 hover:underline dark:text-brand-400"
                      >
                        Reset all
                      </button>
                    )}
                  </div>

                  <RangeControl
                    label={`Card width ${override.width !== undefined ? "· custom" : "(inherited)"}`}
                    value={override.width ?? draft.layout.width}
                    min={320}
                    max={bp === "mobile" ? 480 : 900}
                    step={10}
                    unit="px"
                    onChange={(v) => patchBreakpoint(bp, "width", v)}
                  />
                  <RangeControl
                    label={`Element gap ${override.gap !== undefined ? "· custom" : "(inherited)"}`}
                    value={override.gap ?? draft.layout.gap}
                    min={4}
                    max={32}
                    unit="px"
                    onChange={(v) => patchBreakpoint(bp, "gap", v)}
                  />
                  <RangeControl
                    label={`Card padding ${override.padding !== undefined ? "· custom" : "(inherited)"}`}
                    value={override.padding ?? draft.theme.card.padding}
                    min={8}
                    max={64}
                    unit="px"
                    onChange={(v) => patchBreakpoint(bp, "padding", v)}
                  />
                  <RangeControl
                    label={`Font size ${override.baseSize !== undefined ? "· custom" : "(inherited)"}`}
                    value={override.baseSize ?? draft.theme.typography.baseSize}
                    min={12}
                    max={22}
                    unit="px"
                    onChange={(v) => patchBreakpoint(bp, "baseSize", v)}
                  />
                  <SegmentedControl
                    label="Text alignment"
                    columns={3}
                    value={override.alignment ?? "inherit"}
                    options={[
                      { value: "inherit", label: "Inherit" },
                      { value: "center", label: "Centred" },
                      { value: "left", label: "Left" },
                    ]}
                    onChange={(v) =>
                      patchBreakpoint(bp, "alignment", v === "inherit" ? undefined : v)
                    }
                  />

                  {draft.layout.mode === "canvas" && (
                    <SegmentedControl
                      label="Canvas layout on this screen"
                      columns={3}
                      value={
                        override.canvasStack === undefined
                          ? "auto"
                          : override.canvasStack
                            ? "stack"
                            : "free"
                      }
                      options={[
                        { value: "auto", label: "Default" },
                        { value: "stack", label: "Stack" },
                        { value: "free", label: "Freeform" },
                      ]}
                      onChange={(v) =>
                        patchBreakpoint(
                          bp,
                          "canvasStack",
                          v === "auto" ? undefined : v === "stack",
                        )
                      }
                    />
                  )}
                </div>
              );
            })()
          )}
        </div>
      )}
    </div>
  );
}
