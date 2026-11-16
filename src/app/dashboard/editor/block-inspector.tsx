"use client";

import { useState } from "react";
import { clampFrame, resolveBlockFrame } from "@/lib/canvas-guides";
import {
  BLOCK_TYPE_LABELS,
  DEFAULT_IDENTITY_FRAME,
  DEFAULT_LINKS_FRAME,
  embedProviderName,
  GRID_SNAP_OPTIONS,
  isBlockLocked,
  isEmbedAllowed,
  MAX_BLOCKS,
  MAX_GALLERY_IMAGES,
  RADIUS_OPTIONS,
  type CanvasFrame,
  type ProfileBlock,
  type ProfileConfig,
} from "@/lib/profile-config";
import { RangeControl, SegmentedControl, TextControl, ToggleControl } from "./controls";
import type { EditorSelection, UpdateOptions } from "./editor-store";
import { uploadMediaFile } from "./upload-client";

/**
 * Right-hand context-aware Properties Inspector (V2.1 + V2.2).
 *
 * Adapts to whatever the user clicked on the canvas or in the Layers tree:
 *  - Component Block → rich block props, media upload, group membership, canvas geometry
 *  - Block Group → group name, visibility, lock, alignment & spacing helpers
 *  - Identity / Links section → canvas frame geometry & display toggles
 *  - Nothing selected → Canvas stage settings & layout summary
 */
export function BlockInspector({
  draft,
  selection,
  onSelect,
  onUpdate,
  onDuplicateBlock,
  onCopyBlock,
  onCreateGroup,
  onJumpToTab,
  onNotify,
}: {
  draft: ProfileConfig;
  selection: EditorSelection;
  onSelect: (next: EditorSelection) => void;
  onUpdate: (recipe: (d: ProfileConfig) => ProfileConfig, opts?: UpdateOptions | string) => void;
  onDuplicateBlock: (id: string) => string | null;
  onCopyBlock: (id: string) => boolean;
  onCreateGroup: (name?: string, initialBlockId?: string) => string | null;
  onJumpToTab: (tab: "profile" | "links" | "design") => void;
  onNotify: (msg: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [newGalleryUrl, setNewGalleryUrl] = useState("");
  const isCanvas = draft.layout.mode === "canvas";

  function patchBlock<T extends ProfileBlock["type"]>(
    id: string,
    patch: Partial<Extract<ProfileBlock, { type: T }>["props"]>,
    opts: UpdateOptions | string = { label: "Edit block", coalesce: true },
  ) {
    onUpdate(
      (d) => ({
        ...d,
        blocks: d.blocks.map((b) =>
          b.id === id ? ({ ...b, props: { ...b.props, ...patch } } as ProfileBlock) : b,
        ),
      }),
      opts,
    );
  }

  function patchBlockMeta(
    id: string,
    patch: Partial<Pick<ProfileBlock, "label" | "visible" | "locked" | "groupId" | "frame">>,
    opts: UpdateOptions | string = "Update block",
  ) {
    onUpdate(
      (d) => ({
        ...d,
        blocks: d.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as ProfileBlock) : b)),
      }),
      opts,
    );
  }

  // 1. Selected Block Inspector
  if (selection?.kind === "block") {
    const index = draft.blocks.findIndex((b) => b.id === selection.id);
    const block = draft.blocks[index];
    if (!block) return <StageInspector draft={draft} onUpdate={onUpdate} />;

    const locked = isBlockLocked(block, draft.groups);
    const parentGroup = block.groupId ? draft.groups.find((g) => g.id === block.groupId) : null;
    const frame = resolveBlockFrame(block, index);

    async function handleBlockImageUpload(file: File, target: "image" | "gallery") {
      setUploading(true);
      const res = await uploadMediaFile(file, "GALLERY");
      setUploading(false);
      if (!res.ok) {
        onNotify(res.error);
        return;
      }
      if (target === "image") {
        patchBlock<"image">(block.id, { src: res.media.url }, "Upload block image");
      } else if (block.type === "gallery") {
        if (block.props.images.length >= MAX_GALLERY_IMAGES) return;
        patchBlock<"gallery">(
          block.id,
          { images: [...block.props.images, { src: res.media.url, alt: "" }] },
          "Upload gallery image",
        );
      }
      onNotify("Image uploaded.");
    }

    return (
      <div className="divide-y divide-ink-200/70 dark:divide-white/[0.07]">
        {/* Header */}
        <div className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-brand-500/15 px-2 py-0.5 text-[11px] font-semibold text-brand-700 dark:text-brand-300">
                {BLOCK_TYPE_LABELS[block.type]}
              </span>
              {locked && (
                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-300">
                  Locked
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="text-[11px] text-ink-400 hover:text-ink-800 dark:hover:text-white"
            >
              Done
            </button>
          </div>

          <TextControl
            label="Layer name"
            value={block.label}
            maxLength={60}
            placeholder={`${BLOCK_TYPE_LABELS[block.type]} layer`}
            onChange={(label) => patchBlockMeta(block.id, { label }, { label: "Rename layer", coalesce: true })}
          />

          {/* Group assignment */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs text-ink-600 dark:text-ink-300" htmlFor="inspector-group-select">
                Group
              </label>
              {!block.groupId && (
                <button
                  type="button"
                  onClick={() => onCreateGroup(`${BLOCK_TYPE_LABELS[block.type]} group`, block.id)}
                  className="text-[11px] text-brand-600 hover:underline dark:text-brand-400"
                >
                  + New group
                </button>
              )}
            </div>
            <select
              id="inspector-group-select"
              value={block.groupId ?? ""}
              onChange={(e) =>
                patchBlockMeta(block.id, { groupId: e.target.value || null }, "Change block group")
              }
              className="w-full rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-black/30 dark:text-white"
            >
              <option value="">None (ungrouped)</option>
              {draft.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <ToggleControl
              label="Visible"
              checked={block.visible}
              onChange={(visible) => patchBlockMeta(block.id, { visible }, "Toggle block visibility")}
            />
            <ToggleControl
              label="Lock"
              checked={block.locked}
              onChange={(nextLock) => patchBlockMeta(block.id, { locked: nextLock }, "Toggle block lock")}
            />
          </div>
          {parentGroup?.locked && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              Locked by group &ldquo;{parentGroup.name}&rdquo;.
            </p>
          )}
        </div>

        {/* Block-specific content & style controls */}
        <fieldset disabled={locked} className="space-y-3.5 p-4 disabled:opacity-60">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Content &amp; Style</p>

          {block.type === "text" && (
            <>
              <TextControl
                label="Text"
                multiline
                maxLength={2000}
                value={block.props.content}
                placeholder="Write a note, intro, or section heading…"
                onChange={(content) => patchBlock<"text">(block.id, { content })}
              />
              <SegmentedControl
                label="Size"
                columns={4}
                value={block.props.size}
                options={[
                  { value: "sm", label: "S" },
                  { value: "md", label: "M" },
                  { value: "lg", label: "L" },
                  { value: "xl", label: "XL" },
                ]}
                onChange={(size) => patchBlock<"text">(block.id, { size }, "Change text size")}
              />
              <SegmentedControl
                label="Alignment"
                columns={3}
                value={block.props.align}
                options={[
                  { value: "left", label: "Left" },
                  { value: "center", label: "Center" },
                  { value: "right", label: "Right" },
                ]}
                onChange={(align) => patchBlock<"text">(block.id, { align }, "Change text alignment")}
              />
              <SegmentedControl
                label="Colour tone"
                columns={3}
                value={block.props.tone}
                options={[
                  { value: "primary", label: "Primary" },
                  { value: "muted", label: "Muted" },
                  { value: "accent", label: "Accent" },
                ]}
                onChange={(tone) => patchBlock<"text">(block.id, { tone }, "Change text tone")}
              />
              <SegmentedControl
                label="Weight"
                columns={3}
                value={block.props.weight}
                options={[
                  { value: "normal", label: "Regular" },
                  { value: "medium", label: "Medium" },
                  { value: "bold", label: "Bold" },
                ]}
                onChange={(weight) => patchBlock<"text">(block.id, { weight }, "Change text weight")}
              />
            </>
          )}

          {block.type === "image" && (
            <>
              <div className="flex items-center gap-2">
                <label className="btn-secondary flex-1 cursor-pointer justify-center text-xs">
                  {uploading ? "Uploading…" : block.props.src ? "Replace image" : "Upload image"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
                    className="sr-only"
                    disabled={uploading || locked}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void handleBlockImageUpload(f, "image");
                    }}
                  />
                </label>
                {block.props.src && (
                  <button
                    type="button"
                    onClick={() => patchBlock<"image">(block.id, { src: "" }, "Clear image")}
                    className="btn-ghost text-xs"
                  >
                    Clear
                  </button>
                )}
              </div>
              <TextControl
                label="Or image URL"
                value={block.props.src}
                placeholder="https://… or /api/media/…"
                maxLength={512}
                onChange={(src) => patchBlock<"image">(block.id, { src })}
              />
              <TextControl
                label="Alt text"
                value={block.props.alt}
                placeholder="Describe the image for screen readers"
                maxLength={200}
                onChange={(alt) => patchBlock<"image">(block.id, { alt })}
              />
              <TextControl
                label="Caption"
                value={block.props.caption}
                placeholder="Optional caption"
                maxLength={300}
                onChange={(caption) => patchBlock<"image">(block.id, { caption })}
              />
              <SegmentedControl
                label="Aspect ratio"
                columns={4}
                value={block.props.aspect}
                options={[
                  { value: "auto", label: "Auto" },
                  { value: "1:1", label: "1:1" },
                  { value: "4:3", label: "4:3" },
                  { value: "16:9", label: "16:9" },
                ]}
                onChange={(aspect) => patchBlock<"image">(block.id, { aspect }, "Change aspect ratio")}
              />
              <SegmentedControl
                label="Fit"
                columns={2}
                value={block.props.fit}
                options={[
                  { value: "cover", label: "Cover" },
                  { value: "contain", label: "Contain" },
                ]}
                onChange={(fit) => patchBlock<"image">(block.id, { fit }, "Change image fit")}
              />
              <SegmentedControl
                label="Corners"
                columns={6}
                value={block.props.radius}
                options={RADIUS_OPTIONS.map((r) => ({ value: r, label: r }))}
                onChange={(radius) => patchBlock<"image">(block.id, { radius }, "Change image corners")}
              />
            </>
          )}

          {block.type === "gallery" && (
            <>
              <SegmentedControl
                label="Columns"
                columns={3}
                value={String(block.props.columns) as "1" | "2" | "3"}
                options={[
                  { value: "1", label: "1 col" },
                  { value: "2", label: "2 cols" },
                  { value: "3", label: "3 cols" },
                ]}
                onChange={(v) => patchBlock<"gallery">(block.id, { columns: Number(v) }, "Change gallery columns")}
              />
              <RangeControl
                label="Grid gap"
                value={block.props.gap}
                min={4}
                max={24}
                unit="px"
                onChange={(gap) => patchBlock<"gallery">(block.id, { gap })}
              />
              <SegmentedControl
                label="Image corners"
                columns={6}
                value={block.props.radius}
                options={RADIUS_OPTIONS.map((r) => ({ value: r, label: r }))}
                onChange={(radius) => patchBlock<"gallery">(block.id, { radius }, "Change gallery corners")}
              />

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-ink-600 dark:text-ink-300">
                    Images ({block.props.images.length}/{MAX_GALLERY_IMAGES})
                  </span>
                  {block.props.images.length < MAX_GALLERY_IMAGES && (
                    <label className="cursor-pointer text-[11px] font-medium text-brand-600 hover:underline dark:text-brand-400">
                      {uploading ? "Uploading…" : "+ Upload photo"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
                        className="sr-only"
                        disabled={uploading || locked}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) void handleBlockImageUpload(f, "gallery");
                        }}
                      />
                    </label>
                  )}
                </div>

                {block.props.images.map((img, i) => (
                  <div
                    key={`${img.src}-${i}`}
                    className="space-y-1.5 rounded-lg border border-ink-200/80 p-2 dark:border-white/10"
                  >
                    <div className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.src} alt="" className="size-8 shrink-0 rounded object-cover" />
                      <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-ink-400">{img.src}</span>
                      <button
                        type="button"
                        onClick={() =>
                          patchBlock<"gallery">(
                            block.id,
                            { images: block.props.images.filter((_, idx) => idx !== i) },
                            "Remove gallery image",
                          )
                        }
                        aria-label="Remove gallery image"
                        className="text-xs text-ink-400 hover:text-red-500"
                      >
                        ✕
                      </button>
                    </div>
                    <input
                      type="text"
                      value={img.alt}
                      maxLength={200}
                      placeholder="Alt text"
                      onChange={(e) => {
                        const next = [...block.props.images];
                        next[i] = { ...img, alt: e.target.value };
                        patchBlock<"gallery">(block.id, { images: next });
                      }}
                      className="w-full rounded border border-ink-200 bg-white px-2 py-1 text-[11px] dark:border-white/10 dark:bg-black/25"
                    />
                  </div>
                ))}

                {block.props.images.length < MAX_GALLERY_IMAGES && (
                  <div className="flex gap-1.5">
                    <input
                      type="url"
                      value={newGalleryUrl}
                      onChange={(e) => setNewGalleryUrl(e.target.value)}
                      placeholder="https://… image URL"
                      className="min-w-0 flex-1 rounded-lg border border-ink-200 bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-black/25"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const clean = newGalleryUrl.trim();
                        if (!clean.startsWith("https://") && !clean.startsWith("/api/media/")) {
                          onNotify("Use an https:// URL or upload an image.");
                          return;
                        }
                        patchBlock<"gallery">(
                          block.id,
                          { images: [...block.props.images, { src: clean, alt: "" }] },
                          "Add gallery image",
                        );
                        setNewGalleryUrl("");
                      }}
                      className="btn-secondary px-2.5 py-1 text-xs"
                    >
                      Add
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {block.type === "divider" && (
            <>
              <SegmentedControl
                label="Style"
                columns={4}
                value={block.props.style}
                options={[
                  { value: "line", label: "Line" },
                  { value: "dots", label: "Dots" },
                  { value: "gradient", label: "Glow" },
                  { value: "spacing", label: "Space" },
                ]}
                onChange={(style) => patchBlock<"divider">(block.id, { style }, "Change divider style")}
              />
              <RangeControl
                label="Vertical space"
                value={block.props.spacing}
                min={0}
                max={64}
                unit="px"
                onChange={(spacing) => patchBlock<"divider">(block.id, { spacing })}
              />
            </>
          )}

          {block.type === "embed" && (
            <>
              <TextControl
                label="Embed URL"
                value={block.props.url}
                placeholder="https://youtu.be/… or open.spotify.com/…"
                maxLength={2048}
                onChange={(url) => patchBlock<"embed">(block.id, { url })}
              />
              {block.props.url &&
                (isEmbedAllowed(block.props.url) ? (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                    ✓ {embedProviderName(block.props.url)} embed allowlisted &amp; sandboxed.
                  </p>
                ) : (
                  <p className="text-[11px] text-red-500">
                    Only YouTube, Vimeo, Spotify, and SoundCloud https links are permitted.
                  </p>
                ))}
              <TextControl
                label="Accessible title"
                value={block.props.title}
                placeholder="Video or track title"
                maxLength={200}
                onChange={(title) => patchBlock<"embed">(block.id, { title })}
              />
              <SegmentedControl
                label="Frame size"
                columns={4}
                value={block.props.aspect}
                options={[
                  { value: "16:9", label: "16:9" },
                  { value: "4:3", label: "4:3" },
                  { value: "1:1", label: "1:1" },
                  { value: "compact", label: "Audio" },
                ]}
                onChange={(aspect) => patchBlock<"embed">(block.id, { aspect }, "Change embed frame")}
              />
            </>
          )}
        </fieldset>

        {/* Canvas frame geometry controls */}
        {isCanvas && (
          <FrameControls
            frame={frame}
            stageHeight={draft.canvas.height}
            disabled={locked}
            onChange={(next, label) =>
              patchBlockMeta(block.id, { frame: next }, { label: label ?? "Adjust canvas frame", coalesce: true })
            }
          />
        )}

        {/* Quick actions footer */}
        <div className="flex flex-wrap gap-1.5 p-4">
          <button
            type="button"
            disabled={draft.blocks.length >= MAX_BLOCKS}
            onClick={() => onDuplicateBlock(block.id)}
            className="btn-secondary flex-1 text-xs"
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={() => {
              onCopyBlock(block.id);
              onNotify("Copied block to clipboard.");
            }}
            className="btn-secondary flex-1 text-xs"
          >
            Copy
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={() => {
              onUpdate((d) => ({ ...d, blocks: d.blocks.filter((b) => b.id !== block.id) }), "Delete block");
              onSelect(null);
            }}
            className="btn-danger text-xs"
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  // 2. Selected Group Inspector
  if (selection?.kind === "group") {
    const group = draft.groups.find((g) => g.id === selection.id);
    if (!group) return <StageInspector draft={draft} onUpdate={onUpdate} />;
    const groupId = group.id;
    const groupName = group.name;
    const members = draft.blocks.filter((b) => b.groupId === groupId);

    function alignGroupMembers(mode: "center" | "left" | "stack") {
      onUpdate((d) => {
        let nextY =
          Math.min(
            ...d.blocks
              .filter((b) => b.groupId === groupId)
              .map((b, i) => (b.frame ?? resolveBlockFrame(b, i)).y),
          ) || 120;
        return {
          ...d,
          blocks: d.blocks.map((b, i) => {
            if (b.groupId !== groupId) return b;
            const cur = b.frame ?? resolveBlockFrame(b, i);
            if (mode === "center") {
              return { ...b, frame: clampFrame({ ...cur, x: (100 - cur.w) / 2 }, d.canvas.height) };
            }
            if (mode === "left") {
              return { ...b, frame: clampFrame({ ...cur, x: 8 }, d.canvas.height) };
            }
            const stacked = clampFrame({ ...cur, y: nextY }, d.canvas.height);
            nextY += (cur.h ?? 96) + d.layout.gap;
            return { ...b, frame: stacked };
          }),
        };
      }, `Align group "${groupName}"`);
    }

    return (
      <div className="divide-y divide-ink-200/70 dark:divide-white/[0.07]">
        <div className="space-y-3.5 p-4">
          <div className="flex items-center justify-between">
            <span className="rounded-md bg-brand-500/15 px-2 py-0.5 text-[11px] font-semibold text-brand-700 dark:text-brand-300">
              Layer Group
            </span>
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="text-[11px] text-ink-400 hover:text-ink-800 dark:hover:text-white"
            >
              Done
            </button>
          </div>
          <TextControl
            label="Group name"
            value={group.name}
            maxLength={60}
            onChange={(name) =>
              onUpdate(
                (d) => ({
                  ...d,
                  groups: d.groups.map((g) => (g.id === group.id ? { ...g, name: name || "Group" } : g)),
                }),
                { label: "Rename group", coalesce: true },
              )
            }
          />
          <ToggleControl
            label="Visible on page"
            description="Hides or reveals every block in this group together."
            checked={group.visible}
            onChange={(visible) =>
              onUpdate(
                (d) => ({ ...d, groups: d.groups.map((g) => (g.id === group.id ? { ...g, visible } : g)) }),
                "Toggle group visibility",
              )
            }
          />
          <ToggleControl
            label="Lock group"
            description="Prevents accidental dragging, editing, or deletion."
            checked={group.locked}
            onChange={(locked) =>
              onUpdate(
                (d) => ({ ...d, groups: d.groups.map((g) => (g.id === group.id ? { ...g, locked } : g)) }),
                "Toggle group lock",
              )
            }
          />
        </div>

        {isCanvas && members.length > 0 && !group.locked && (
          <div className="space-y-2 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
              Canvas distribution
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              <button type="button" onClick={() => alignGroupMembers("left")} className="btn-secondary px-2 py-1.5 text-[11px]">
                Align left
              </button>
              <button type="button" onClick={() => alignGroupMembers("center")} className="btn-secondary px-2 py-1.5 text-[11px]">
                Center X
              </button>
              <button type="button" onClick={() => alignGroupMembers("stack")} className="btn-secondary px-2 py-1.5 text-[11px]">
                Stack Y
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2 p-4">
          <p className="text-xs text-ink-500 dark:text-ink-400">
            {members.length} {members.length === 1 ? "block" : "blocks"} in this group.
          </p>
          <button
            type="button"
            onClick={() => {
              onUpdate(
                (d) => ({
                  ...d,
                  groups: d.groups.filter((g) => g.id !== group.id),
                  blocks: d.blocks.map((b) => (b.groupId === group.id ? { ...b, groupId: null } : b)),
                }),
                "Ungroup blocks",
              );
              onSelect(null);
            }}
            className="btn-secondary w-full text-xs"
          >
            Ungroup (keep blocks)
          </button>
        </div>
      </div>
    );
  }

  // 3. Selected Identity / Links Section Inspector
  if (selection?.kind === "identity" || selection?.kind === "links") {
    const isIdentity = selection.kind === "identity";
    const frame = isIdentity
      ? (draft.canvas.identityFrame ?? DEFAULT_IDENTITY_FRAME)
      : (draft.canvas.linksFrame ?? DEFAULT_LINKS_FRAME);

    return (
      <div className="divide-y divide-ink-200/70 dark:divide-white/[0.07]">
        <div className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <span className="rounded-md bg-brand-500/15 px-2 py-0.5 text-[11px] font-semibold text-brand-700 dark:text-brand-300">
              {isIdentity ? "Identity card" : "Links panel"}
            </span>
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="text-[11px] text-ink-400 hover:text-ink-800 dark:hover:text-white"
            >
              Done
            </button>
          </div>
          <p className="text-xs text-ink-500 dark:text-ink-400">
            {isIdentity
              ? "Displays your avatar, display name, @handle, bio, and status badges."
              : "Displays your ordered social and external link buttons."}
          </p>
          <button
            type="button"
            onClick={() => onJumpToTab(isIdentity ? "profile" : "links")}
            className="btn-secondary w-full text-xs"
          >
            {isIdentity ? "Edit profile details →" : "Manage links →"}
          </button>
        </div>

        {isIdentity && (
          <div className="space-y-3 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Visibility</p>
            <ToggleControl
              label="Show avatar"
              checked={draft.layout.showAvatar}
              onChange={(showAvatar) =>
                onUpdate((d) => ({ ...d, layout: { ...d.layout, showAvatar } }), "Toggle avatar")
              }
            />
            <ToggleControl
              label="Show location"
              checked={draft.layout.showLocation}
              onChange={(showLocation) =>
                onUpdate((d) => ({ ...d, layout: { ...d.layout, showLocation } }), "Toggle location")
              }
            />
            <ToggleControl
              label="Show status"
              checked={draft.layout.showStatus}
              onChange={(showStatus) =>
                onUpdate((d) => ({ ...d, layout: { ...d.layout, showStatus } }), "Toggle status")
              }
            />
          </div>
        )}

        {isCanvas && (
          <FrameControls
            frame={frame}
            stageHeight={draft.canvas.height}
            onChange={(next, label) =>
              onUpdate(
                (d) => ({
                  ...d,
                  canvas: {
                    ...d.canvas,
                    ...(isIdentity ? { identityFrame: next } : { linksFrame: next }),
                  },
                }),
                { label: label ?? "Adjust section position", coalesce: true },
              )
            }
          />
        )}
      </div>
    );
  }

  // 4. Default: Stage & Layout Inspector
  return <StageInspector draft={draft} onUpdate={onUpdate} />;
}

function FrameControls({
  frame,
  stageHeight,
  disabled,
  onChange,
}: {
  frame: CanvasFrame;
  stageHeight: number;
  disabled?: boolean;
  onChange: (next: CanvasFrame, label?: string) => void;
}) {
  return (
    <fieldset disabled={disabled} className="space-y-3 p-4 disabled:opacity-50">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Canvas Frame</p>
        <button
          type="button"
          onClick={() => onChange(clampFrame({ ...frame, x: (100 - frame.w) / 2 }, stageHeight), "Center on canvas")}
          className="text-[11px] font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          Center X
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[11px] text-ink-500 dark:text-ink-400">
          X (%)
          <input
            type="number"
            min={0}
            max={95}
            step={0.5}
            value={frame.x}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) onChange(clampFrame({ ...frame, x: v }, stageHeight));
            }}
            className="mt-1 w-full rounded-md border border-ink-200 bg-white px-2 py-1 font-mono text-xs dark:border-white/10 dark:bg-black/30"
          />
        </label>
        <label className="block text-[11px] text-ink-500 dark:text-ink-400">
          Y (px)
          <input
            type="number"
            min={0}
            max={2200}
            step={1}
            value={frame.y}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) onChange(clampFrame({ ...frame, y: v }, stageHeight));
            }}
            className="mt-1 w-full rounded-md border border-ink-200 bg-white px-2 py-1 font-mono text-xs dark:border-white/10 dark:bg-black/30"
          />
        </label>
        <label className="block text-[11px] text-ink-500 dark:text-ink-400">
          Width (%)
          <input
            type="number"
            min={10}
            max={100}
            step={0.5}
            value={frame.w}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) onChange(clampFrame({ ...frame, w: v }, stageHeight));
            }}
            className="mt-1 w-full rounded-md border border-ink-200 bg-white px-2 py-1 font-mono text-xs dark:border-white/10 dark:bg-black/30"
          />
        </label>
        <label className="block text-[11px] text-ink-500 dark:text-ink-400">
          Height (px)
          <div className="mt-1 flex gap-1">
            <input
              type="number"
              min={24}
              max={1200}
              placeholder="Auto"
              value={frame.h ?? ""}
              onChange={(e) => {
                const raw = e.target.value.trim();
                if (!raw) {
                  onChange({ ...frame, h: null });
                  return;
                }
                const v = Number(raw);
                if (Number.isFinite(v)) onChange(clampFrame({ ...frame, h: v }, stageHeight));
              }}
              className="min-w-0 flex-1 rounded-md border border-ink-200 bg-white px-2 py-1 font-mono text-xs dark:border-white/10 dark:bg-black/30"
            />
            {frame.h !== null && (
              <button
                type="button"
                onClick={() => onChange({ ...frame, h: null }, "Reset height to auto")}
                className="rounded border border-ink-200 px-1.5 text-[10px] text-ink-500 dark:border-white/10"
                title="Auto height"
              >
                Auto
              </button>
            )}
          </div>
        </label>
      </div>

      <RangeControl
        label="Layer order (Z)"
        value={frame.z}
        min={1}
        max={100}
        onChange={(z) => onChange(clampFrame({ ...frame, z }, stageHeight), "Change layer depth")}
      />
    </fieldset>
  );
}

function StageInspector({
  draft,
  onUpdate,
}: {
  draft: ProfileConfig;
  onUpdate: (recipe: (d: ProfileConfig) => ProfileConfig, opts?: UpdateOptions | string) => void;
}) {
  const isCanvas = draft.layout.mode === "canvas";

  return (
    <div className="divide-y divide-ink-200/70 dark:divide-white/[0.07]">
      <div className="space-y-2 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Inspector</p>
        <p className="text-xs text-ink-500 dark:text-ink-400">
          Click any element on the canvas or in Layers to inspect its properties, position, and styling.
        </p>
      </div>

      {isCanvas ? (
        <div className="space-y-3.5 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Canvas Stage</p>
          <RangeControl
            label="Stage width"
            value={draft.canvas.width}
            min={480}
            max={1120}
            step={10}
            unit="px"
            onChange={(width) =>
              onUpdate((d) => ({ ...d, canvas: { ...d.canvas, width } }), {
                label: "Resize canvas width",
                coalesce: true,
              })
            }
          />
          <RangeControl
            label="Stage height"
            value={draft.canvas.height}
            min={420}
            max={2400}
            step={20}
            unit="px"
            onChange={(height) =>
              onUpdate((d) => ({ ...d, canvas: { ...d.canvas, height } }), {
                label: "Resize canvas height",
                coalesce: true,
              })
            }
          />
          <SegmentedControl
            label="Grid snap"
            columns={4}
            value={String(draft.canvas.gridSnap) as "0" | "4" | "8" | "16"}
            options={GRID_SNAP_OPTIONS.map((v) => ({ value: String(v) as "0" | "4" | "8" | "16", label: v === 0 ? "Off" : `${v}px` }))}
            onChange={(v) =>
              onUpdate(
                (d) => ({
                  ...d,
                  canvas: { ...d.canvas, gridSnap: Number(v) as 0 | 4 | 8 | 16 },
                }),
                "Change grid snap",
              )
            }
          />
          <ToggleControl
            label="Auto-stack on mobile"
            description="Reflows positioned layers cleanly into a single column under 480px."
            checked={draft.canvas.mobileStack}
            onChange={(mobileStack) =>
              onUpdate((d) => ({ ...d, canvas: { ...d.canvas, mobileStack } }), "Toggle mobile stacking")
            }
          />
        </div>
      ) : (
        <div className="space-y-3.5 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Card Layout</p>
          <RangeControl
            label="Card width"
            value={draft.layout.width}
            min={340}
            max={960}
            step={10}
            unit="px"
            onChange={(width) =>
              onUpdate((d) => ({ ...d, layout: { ...d.layout, width } }), {
                label: "Change card width",
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
                label: "Change element gap",
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
              onUpdate((d) => ({ ...d, layout: { ...d.layout, alignment } }), "Change alignment")
            }
          />
          <ToggleControl
            label="Show view count"
            description="Displays total page views (anonymous counter only)."
            checked={draft.layout.showViewCount}
            onChange={(showViewCount) =>
              onUpdate((d) => ({ ...d, layout: { ...d.layout, showViewCount } }), "Toggle view counter")
            }
          />
        </div>
      )}
    </div>
  );
}
