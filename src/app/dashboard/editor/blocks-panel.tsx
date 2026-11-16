"use client";

import { useState } from "react";
import { materializeCanvasFrames } from "@/lib/canvas-guides";
import {
  BLOCK_TYPE_LABELS,
  BLOCK_TYPES,
  BLOCKS_POSITIONS,
  isBlockLocked,
  MAX_BLOCKS,
  MAX_GROUPS,
  type BlockGroup,
  type ProfileBlock,
  type ProfileConfig,
} from "@/lib/profile-config";
import { cn } from "@/lib/utils";
import { SegmentedControl } from "./controls";
import type { EditorSelection, UpdateOptions } from "./editor-store";

/**
 * Layers, nested groups, and component block palette (V2.1 + V2.2).
 *
 * Manages block hierarchy (groups, visibility, locks, collapse, drag-to-reorder,
 * drag-into-group, duplicate, copy/paste) and switches between Stack and
 * freeform Canvas layout modes. Selecting any layer opens its full controls in
 * the right-hand Properties Inspector.
 */
export function BlocksPanel({
  draft,
  selection,
  onSelect,
  onUpdate,
  onAddBlock,
  onDuplicateBlock,
  onCopyBlock,
  onPasteBlock,
  onCreateGroup,
  hasClipboard,
  onOpenInspector,
}: {
  draft: ProfileConfig;
  selection: EditorSelection;
  onSelect: (next: EditorSelection) => void;
  onUpdate: (recipe: (d: ProfileConfig) => ProfileConfig, opts?: UpdateOptions | string) => void;
  onAddBlock: (type: ProfileBlock["type"], groupId?: string | null) => string | null;
  onDuplicateBlock: (id: string) => string | null;
  onCopyBlock: (id: string) => boolean;
  onPasteBlock: (groupId?: string | null) => string | null;
  onCreateGroup: (name?: string) => string | null;
  hasClipboard: boolean;
  onOpenInspector?: () => void;
}) {
  const [dragBlockId, setDragBlockId] = useState<string | null>(null);
  const [dropGroupId, setDropGroupId] = useState<string | "ungrouped" | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupNameDraft, setGroupNameDraft] = useState("");

  const { blocks, groups, layout } = draft;
  const atBlockLimit = blocks.length >= MAX_BLOCKS;
  const atGroupLimit = groups.length >= MAX_GROUPS;

  function setLayoutMode(mode: "stack" | "canvas") {
    if (mode === layout.mode) return;
    onUpdate((d) => {
      if (mode === "canvas") {
        const materialized = materializeCanvasFrames(d.blocks, d.canvas.height);
        return {
          ...d,
          layout: { ...d.layout, mode: "canvas" },
          blocks: materialized.blocks,
          canvas: { ...d.canvas, height: materialized.height },
        };
      }
      return { ...d, layout: { ...d.layout, mode: "stack" } };
    }, `Switch to ${mode} layout`);
  }

  function updateGroup(id: string, patch: Partial<BlockGroup>, label = "Update group") {
    onUpdate(
      (d) => ({
        ...d,
        groups: d.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)),
      }),
      label,
    );
  }

  function deleteGroup(id: string) {
    onUpdate(
      (d) => ({
        ...d,
        groups: d.groups.filter((g) => g.id !== id),
        blocks: d.blocks.map((b) => (b.groupId === id ? { ...b, groupId: null } : b)),
      }),
      "Ungroup blocks",
    );
    if (selection?.kind === "group" && selection.id === id) onSelect(null);
  }

  function moveGroup(id: string, delta: -1 | 1) {
    onUpdate((d) => {
      const idx = d.groups.findIndex((g) => g.id === id);
      const target = idx + delta;
      if (idx < 0 || target < 0 || target >= d.groups.length) return d;
      const nextGroups = [...d.groups];
      const [moved] = nextGroups.splice(idx, 1);
      nextGroups.splice(target, 0, moved);

      // Keep underlying block order aligned with group order for predictable stack rendering.
      const order = new Map<string, number>();
      nextGroups.forEach((g, i) => order.set(g.id, i));
      const grouped = nextGroups.flatMap((g) => d.blocks.filter((b) => b.groupId === g.id));
      const ungrouped = d.blocks.filter((b) => !b.groupId || !order.has(b.groupId));
      return { ...d, groups: nextGroups, blocks: [...grouped, ...ungrouped] };
    }, "Reorder group");
  }

  function moveBlock(id: string, delta: -1 | 1) {
    onUpdate((d) => {
      const idx = d.blocks.findIndex((b) => b.id === id);
      const target = idx + delta;
      if (idx < 0 || target < 0 || target >= d.blocks.length) return d;
      if (isBlockLocked(d.blocks[idx], d.groups)) return d;
      const next = [...d.blocks];
      const [item] = next.splice(idx, 1);
      next.splice(target, 0, item);
      return { ...d, blocks: next };
    }, "Reorder block");
  }

  function reorderBlockOnto(sourceId: string, targetId: string, newGroupId: string | null) {
    if (sourceId === targetId) return;
    onUpdate((d) => {
      const srcIdx = d.blocks.findIndex((b) => b.id === sourceId);
      const dstIdx = d.blocks.findIndex((b) => b.id === targetId);
      if (srcIdx < 0 || dstIdx < 0) return d;
      if (isBlockLocked(d.blocks[srcIdx], d.groups)) return d;
      const next = [...d.blocks];
      const [moved] = next.splice(srcIdx, 1);
      const insertAt = next.findIndex((b) => b.id === targetId);
      next.splice(insertAt < 0 ? next.length : insertAt, 0, { ...moved, groupId: newGroupId });
      return { ...d, blocks: next };
    }, "Reorder layer");
  }

  function assignBlockToGroup(blockId: string, groupId: string | null) {
    onUpdate((d) => {
      const blk = d.blocks.find((b) => b.id === blockId);
      if (!blk || blk.groupId === groupId || isBlockLocked(blk, d.groups)) return d;
      return {
        ...d,
        blocks: d.blocks.map((b) => (b.id === blockId ? { ...b, groupId } : b)),
      };
    }, groupId ? "Move block into group" : "Remove block from group");
  }

  function toggleBlockFlag(id: string, field: "visible" | "locked") {
    onUpdate(
      (d) => ({
        ...d,
        blocks: d.blocks.map((b) => (b.id === id ? { ...b, [field]: !b[field] } : b)),
      }),
      field === "visible" ? "Toggle block visibility" : "Toggle block lock",
    );
  }

  function removeBlock(id: string) {
    onUpdate((d) => {
      const blk = d.blocks.find((b) => b.id === id);
      if (!blk || isBlockLocked(blk, d.groups)) return d;
      return { ...d, blocks: d.blocks.filter((b) => b.id !== id) };
    }, "Delete block");
    if (selection?.kind === "block" && selection.id === id) onSelect(null);
  }

  function selectAndInspect(next: EditorSelection) {
    onSelect(next);
    onOpenInspector?.();
  }

  const knownGroupIds = new Set(groups.map((g) => g.id));
  const ungroupedBlocks = blocks.filter((b) => !b.groupId || !knownGroupIds.has(b.groupId));

  function renderBlockRow(block: ProfileBlock, targetGroupId: string | null) {
    const isSelected = selection?.kind === "block" && selection.id === block.id;
    const locked = isBlockLocked(block, groups);
    const globalIdx = blocks.findIndex((b) => b.id === block.id);
    const summary = blockSummary(block);

    return (
      <li
        key={block.id}
        draggable={!locked}
        onDragStart={(e) => {
          if (locked) {
            e.preventDefault();
            return;
          }
          setDragBlockId(block.id);
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", block.id);
        }}
        onDragOver={(e) => {
          if (!dragBlockId || dragBlockId === block.id) return;
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (dragBlockId) reorderBlockOnto(dragBlockId, block.id, targetGroupId);
          setDragBlockId(null);
          setDropGroupId(null);
        }}
        onDragEnd={() => {
          setDragBlockId(null);
          setDropGroupId(null);
        }}
        className={cn(
          "group/row flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs transition-colors",
          isSelected
            ? "border-brand-500/60 bg-brand-500/[0.08] text-ink-950 dark:border-brand-400/50 dark:bg-brand-400/[0.1] dark:text-white"
            : "border-ink-200/80 bg-white hover:border-ink-300 dark:border-white/[0.08] dark:bg-white/[0.02] dark:hover:border-white/15",
          !block.visible && "opacity-55",
          dragBlockId === block.id && "opacity-40",
        )}
      >
        <span
          className={cn(
            "select-none text-[11px] text-ink-400",
            locked ? "cursor-not-allowed opacity-40" : "cursor-grab active:cursor-grabbing",
          )}
          title={locked ? "Locked" : "Drag to reorder or drop into a group"}
          aria-hidden="true"
        >
          ⋮⋮
        </span>

        <span className="shrink-0 rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[10px] uppercase text-ink-500 dark:bg-white/[0.07] dark:text-ink-300">
          {blockBadge(block.type)}
        </span>

        <button
          type="button"
          onClick={() => selectAndInspect({ kind: "block", id: block.id })}
          className="min-w-0 flex-1 truncate text-left font-medium"
        >
          {block.label || summary}
        </button>

        <div className="flex shrink-0 items-center gap-0.5 opacity-80 group-hover/row:opacity-100">
          <button
            type="button"
            onClick={() => moveBlock(block.id, -1)}
            disabled={locked || globalIdx === 0}
            aria-label="Move layer up"
            title="Move up"
            className="rounded px-1 py-0.5 text-[10px] text-ink-400 hover:bg-ink-100 hover:text-ink-800 disabled:opacity-25 dark:hover:bg-white/10 dark:hover:text-white"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => moveBlock(block.id, 1)}
            disabled={locked || globalIdx === blocks.length - 1}
            aria-label="Move layer down"
            title="Move down"
            className="rounded px-1 py-0.5 text-[10px] text-ink-400 hover:bg-ink-100 hover:text-ink-800 disabled:opacity-25 dark:hover:bg-white/10 dark:hover:text-white"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={() => toggleBlockFlag(block.id, "visible")}
            aria-label={block.visible ? "Hide block" : "Show block"}
            title={block.visible ? "Hide" : "Show"}
            className={cn(
              "rounded px-1 py-0.5 text-[10px] hover:bg-ink-100 dark:hover:bg-white/10",
              block.visible ? "text-ink-400" : "font-medium text-amber-500",
            )}
          >
            {block.visible ? "◉" : "○"}
          </button>
          <button
            type="button"
            onClick={() => toggleBlockFlag(block.id, "locked")}
            aria-label={block.locked ? "Unlock block" : "Lock block"}
            title={block.locked ? "Unlock" : "Lock"}
            className={cn(
              "rounded px-1 py-0.5 text-[10px] hover:bg-ink-100 dark:hover:bg-white/10",
              block.locked ? "text-amber-500" : "text-ink-400",
            )}
          >
            {block.locked ? "🔒" : "·"}
          </button>
          <button
            type="button"
            onClick={() => onDuplicateBlock(block.id)}
            disabled={atBlockLimit}
            aria-label="Duplicate block"
            title="Duplicate (⌘D)"
            className="rounded px-1 py-0.5 text-[10px] text-ink-400 hover:bg-ink-100 hover:text-ink-800 disabled:opacity-25 dark:hover:bg-white/10 dark:hover:text-white"
          >
            ⧉
          </button>
          <button
            type="button"
            onClick={() => onCopyBlock(block.id)}
            aria-label="Copy block"
            title="Copy block"
            className="hidden rounded px-1 py-0.5 text-[10px] text-ink-400 hover:bg-ink-100 hover:text-ink-800 group-hover/row:inline-block dark:hover:bg-white/10 dark:hover:text-white"
          >
            ⎘
          </button>
          <button
            type="button"
            onClick={() => removeBlock(block.id)}
            disabled={locked}
            aria-label="Delete block"
            title="Delete"
            className="rounded px-1 py-0.5 text-[10px] text-ink-400 hover:bg-red-500/10 hover:text-red-500 disabled:opacity-25"
          >
            ✕
          </button>
        </div>
      </li>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Layout mode switcher (Stack vs Freeform Canvas) */}
      <div className="space-y-2.5 rounded-xl border border-ink-200/80 bg-ink-50/60 p-3 dark:border-white/[0.07] dark:bg-white/[0.02]">
        <SegmentedControl
          label="Layout mode"
          value={layout.mode}
          columns={2}
          options={[
            { value: "stack", label: "Stack" },
            { value: "canvas", label: "Freeform Canvas" },
          ]}
          onChange={setLayoutMode}
        />
        {layout.mode === "stack" ? (
          <SegmentedControl
            label="Blocks placement"
            value={layout.blocksPosition}
            columns={2}
            options={BLOCKS_POSITIONS.map((v) => ({
              value: v,
              label: v === "above-links" ? "Above links" : "Below links",
            }))}
            onChange={(v) => onUpdate((d) => ({ ...d, layout: { ...d.layout, blocksPosition: v } }), "Change block placement")}
          />
        ) : (
          <p className="text-[11px] text-ink-500 dark:text-ink-400">
            Drag and resize any element directly on the canvas. Hold <kbd className="rounded bg-black/10 px-1 dark:bg-white/10">Alt</kbd> to bypass snapping.
          </p>
        )}
      </div>

      {/* Add component blocks palette */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium text-ink-700 dark:text-ink-200">Add block</p>
          <span className="text-[11px] tabular-nums text-ink-400">
            {blocks.length}/{MAX_BLOCKS}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {BLOCK_TYPES.map((type) => {
            const targetGroup = selection?.kind === "group" ? selection.id : null;
            return (
              <button
                key={type}
                type="button"
                disabled={atBlockLimit}
                onClick={() => {
                  const id = onAddBlock(type, targetGroup);
                  if (id) onOpenInspector?.();
                }}
                className="flex items-center justify-center gap-1 rounded-lg border border-ink-200 bg-white px-2 py-2 text-xs font-medium text-ink-700 transition-colors hover:border-brand-500/50 hover:text-ink-950 disabled:opacity-40 dark:border-white/10 dark:bg-white/[0.03] dark:text-ink-200 dark:hover:border-brand-400/50 dark:hover:text-white"
              >
                <span className="text-brand-500 dark:text-brand-400">+</span>
                {BLOCK_TYPE_LABELS[type]}
              </button>
            );
          })}
          {hasClipboard && (
            <button
              type="button"
              disabled={atBlockLimit}
              onClick={() => onPasteBlock(selection?.kind === "group" ? selection.id : undefined)}
              className="rounded-lg border border-dashed border-brand-500/50 bg-brand-500/[0.06] px-2 py-2 text-xs font-medium text-brand-700 hover:bg-brand-500/10 disabled:opacity-40 dark:text-brand-300"
            >
              ⎘ Paste
            </button>
          )}
        </div>
      </div>

      {/* Core profile sections in Canvas mode */}
      {layout.mode === "canvas" && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
            Profile sections
          </p>
          <div className="space-y-1">
            {(
              [
                { kind: "identity", label: "Identity card", badge: "ID" },
                { kind: "links", label: "Links panel", badge: "LN" },
              ] as const
            ).map((sec) => {
              const active = selection?.kind === sec.kind;
              return (
                <button
                  key={sec.kind}
                  type="button"
                  onClick={() => selectAndInspect({ kind: sec.kind })}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium transition-colors",
                    active
                      ? "border-brand-500/60 bg-brand-500/[0.08] text-ink-950 dark:border-brand-400/50 dark:bg-brand-400/[0.1] dark:text-white"
                      : "border-ink-200/80 bg-white hover:border-ink-300 dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-ink-200",
                  )}
                >
                  <span className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[10px] text-ink-500 dark:bg-white/[0.07] dark:text-ink-300">
                    {sec.badge}
                  </span>
                  <span className="flex-1">{sec.label}</span>
                  <span className="text-[10px] text-ink-400">Canvas</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Layers & Nested Group Hierarchy */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
            Layers &amp; Groups
          </p>
          <button
            type="button"
            disabled={atGroupLimit}
            onClick={() => onCreateGroup(`Group ${groups.length + 1}`)}
            className="rounded-md border border-ink-200 px-2 py-0.5 text-[11px] font-medium text-ink-600 hover:border-ink-300 hover:text-ink-900 disabled:opacity-40 dark:border-white/10 dark:text-ink-300 dark:hover:text-white"
          >
            + Group
          </button>
        </div>

        {/* Named collapsible groups */}
        {groups.map((group, gIdx) => {
          const members = blocks.filter((b) => b.groupId === group.id);
          const groupSelected = selection?.kind === "group" && selection.id === group.id;
          const isDropTarget = dropGroupId === group.id;
          const isEditing = editingGroupId === group.id;

          return (
            <div
              key={group.id}
              onDragOver={(e) => {
                if (!dragBlockId) return;
                e.preventDefault();
                setDropGroupId(group.id);
              }}
              onDragLeave={() => {
                if (dropGroupId === group.id) setDropGroupId(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragBlockId) assignBlockToGroup(dragBlockId, group.id);
                setDragBlockId(null);
                setDropGroupId(null);
              }}
              className={cn(
                "rounded-xl border transition-colors",
                groupSelected
                  ? "border-brand-500/60 bg-brand-500/[0.04] dark:border-brand-400/50"
                  : "border-ink-200/80 bg-ink-50/40 dark:border-white/[0.08] dark:bg-white/[0.015]",
                isDropTarget && "ring-2 ring-brand-500/50",
                !group.visible && "opacity-60",
              )}
            >
              <div className="flex items-center gap-1.5 px-2.5 py-2 text-xs">
                <button
                  type="button"
                  onClick={() => updateGroup(group.id, { collapsed: !group.collapsed }, "Toggle group folder")}
                  aria-label={group.collapsed ? "Expand group" : "Collapse group"}
                  className="rounded px-1 py-0.5 text-[10px] text-ink-400 hover:text-ink-800 dark:hover:text-white"
                >
                  {group.collapsed ? "▸" : "▾"}
                </button>

                {isEditing ? (
                  <input
                    type="text"
                    value={groupNameDraft}
                    maxLength={60}
                    autoFocus
                    onChange={(e) => setGroupNameDraft(e.target.value)}
                    onBlur={() => {
                      const clean = groupNameDraft.trim();
                      if (clean) updateGroup(group.id, { name: clean }, `Rename group "${clean}"`);
                      setEditingGroupId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") setEditingGroupId(null);
                    }}
                    className="min-w-0 flex-1 rounded border border-brand-500 bg-white px-1.5 py-0.5 text-xs dark:bg-black/50"
                    aria-label="Group name"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => selectAndInspect({ kind: "group", id: group.id })}
                    onDoubleClick={() => {
                      setGroupNameDraft(group.name);
                      setEditingGroupId(group.id);
                    }}
                    className="min-w-0 flex-1 truncate text-left font-medium text-ink-800 dark:text-ink-100"
                    title="Click to inspect, double-click to rename"
                  >
                    {group.name}
                    <span className="ml-1.5 text-[10px] font-normal text-ink-400">({members.length})</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => moveGroup(group.id, -1)}
                  disabled={gIdx === 0}
                  aria-label="Move group up"
                  className="rounded px-1 text-[10px] text-ink-400 hover:text-ink-800 disabled:opacity-25 dark:hover:text-white"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveGroup(group.id, 1)}
                  disabled={gIdx === groups.length - 1}
                  aria-label="Move group down"
                  className="rounded px-1 text-[10px] text-ink-400 hover:text-ink-800 disabled:opacity-25 dark:hover:text-white"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => updateGroup(group.id, { visible: !group.visible }, "Toggle group visibility")}
                  aria-label={group.visible ? "Hide group" : "Show group"}
                  title={group.visible ? "Hide group" : "Show group"}
                  className={cn("rounded px-1 text-[10px]", group.visible ? "text-ink-400" : "text-amber-500")}
                >
                  {group.visible ? "◉" : "○"}
                </button>
                <button
                  type="button"
                  onClick={() => updateGroup(group.id, { locked: !group.locked }, "Toggle group lock")}
                  aria-label={group.locked ? "Unlock group" : "Lock group"}
                  title={group.locked ? "Unlock group" : "Lock group"}
                  className={cn("rounded px-1 text-[10px]", group.locked ? "text-amber-500" : "text-ink-400")}
                >
                  {group.locked ? "🔒" : "·"}
                </button>
                <button
                  type="button"
                  onClick={() => deleteGroup(group.id)}
                  aria-label="Ungroup"
                  title="Ungroup (keeps blocks)"
                  className="rounded px-1 text-[10px] text-ink-400 hover:text-red-500"
                >
                  ✕
                </button>
              </div>

              {!group.collapsed && (
                <div className="border-t border-ink-200/60 px-2 pb-2 pt-1.5 dark:border-white/[0.06]">
                  {members.length === 0 ? (
                    <p className="py-2 text-center text-[11px] text-ink-400">
                      Drag blocks here or select this group and click + Block.
                    </p>
                  ) : (
                    <ul className="space-y-1">{members.map((b) => renderBlockRow(b, group.id))}</ul>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Ungrouped blocks */}
        <div
          onDragOver={(e) => {
            if (!dragBlockId) return;
            e.preventDefault();
            setDropGroupId("ungrouped");
          }}
          onDragLeave={() => {
            if (dropGroupId === "ungrouped") setDropGroupId(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragBlockId) assignBlockToGroup(dragBlockId, null);
            setDragBlockId(null);
            setDropGroupId(null);
          }}
          className={cn(
            "rounded-lg transition-colors",
            dropGroupId === "ungrouped" && "ring-2 ring-brand-500/40",
          )}
        >
          {blocks.length === 0 && groups.length === 0 ? (
            <p className="rounded-xl border border-dashed border-ink-200 p-5 text-center text-xs text-ink-400 dark:border-white/10">
              No blocks yet. Add text, photos, galleries, dividers, or embeds above — and group them into collapsible layers.
            </p>
          ) : ungroupedBlocks.length > 0 ? (
            <>
              {groups.length > 0 && (
                <p className="mb-1 text-[10px] uppercase tracking-wider text-ink-400">Ungrouped</p>
              )}
              <ul className="space-y-1">{ungroupedBlocks.map((b) => renderBlockRow(b, null))}</ul>
            </>
          ) : groups.length > 0 && dragBlockId ? (
            <p className="rounded-lg border border-dashed border-ink-200 py-2 text-center text-[11px] text-ink-400 dark:border-white/10">
              Drop here to remove from group
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function blockBadge(type: ProfileBlock["type"]): string {
  switch (type) {
    case "text":
      return "TX";
    case "image":
      return "IM";
    case "gallery":
      return "GL";
    case "divider":
      return "DV";
    case "embed":
      return "EM";
  }
}

export function blockSummary(block: ProfileBlock): string {
  switch (block.type) {
    case "text":
      return block.props.content.trim().slice(0, 32) || "Text";
    case "image":
      return block.props.caption.trim().slice(0, 32) || block.props.alt.trim().slice(0, 32) || "Image";
    case "gallery":
      return `Gallery (${block.props.images.length})`;
    case "divider":
      return `Divider · ${block.props.style}`;
    case "embed":
      return block.props.title.trim().slice(0, 32) || "Embed";
  }
}
