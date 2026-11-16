"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clampFrame, defaultFrameForBlock } from "@/lib/canvas-guides";
import {
  blockSchema,
  createBlockId,
  createGroupId,
  DEFAULT_IDENTITY_FRAME,
  DEFAULT_LINKS_FRAME,
  isBlockLocked,
  MAX_BLOCKS,
  MAX_GROUPS,
  type ProfileBlock,
  type ProfileConfig,
} from "@/lib/profile-config";

/**
 * Isolated editor state container (V2.1 + V2.2).
 *
 * Holds the draft ProfileConfig, a bounded undo/redo timeline with human labels
 * and named checkpoints, active canvas/layer selection, and a single-block
 * clipboard — all cleanly separated from panels and preview components.
 */

export const MAX_HISTORY = 50;
const COALESCE_WINDOW_MS = 650;

export type HistoryEntry = {
  id: string;
  label: string;
  timestamp: number;
  /** Optional user-named checkpoint pinned on this state. */
  checkpoint: string | null;
  config: ProfileConfig;
};

export type EditorSelection =
  | { kind: "block"; id: string }
  | { kind: "group"; id: string }
  | { kind: "identity" }
  | { kind: "links" }
  | null;

type HistoryState = {
  /** Timeline from oldest (0) to latest; `index` points at the active state. */
  entries: HistoryEntry[];
  index: number;
};

function makeEntry(config: ProfileConfig, label: string, checkpoint: string | null = null): HistoryEntry {
  return {
    id: createBlockId(),
    label,
    timestamp: Date.now(),
    checkpoint,
    config,
  };
}

export type UpdateOptions = {
  label?: string;
  /** Coalesces rapid continuous edits (slider/color drags, text typing) into one undo step. */
  coalesce?: boolean;
};

export function useEditorStore(initial: ProfileConfig) {
  const [history, setHistory] = useState<HistoryState>(() => ({
    entries: [makeEntry(initial, "Opened editor")],
    index: 0,
  }));
  const [dirty, setDirty] = useState(false);
  const [selection, setSelection] = useState<EditorSelection>(null);
  const [clipboard, setClipboard] = useState<ProfileBlock | null>(null);
  const lastCoalesceRef = useRef<{ label: string; at: number } | null>(null);

  const currentEntry = history.entries[history.index] ?? history.entries[0];
  const present = currentEntry.config;

  const update = useCallback(
    (recipe: (draft: ProfileConfig) => ProfileConfig, opts: UpdateOptions | string = {}) => {
      const options: UpdateOptions = typeof opts === "string" ? { label: opts } : opts;
      const label = options.label ?? "Edit design";

      setHistory((state) => {
        const active = state.entries[state.index];
        const next = recipe(active.config);
        if (next === active.config) return state;

        const now = Date.now();
        const canCoalesce =
          Boolean(options.coalesce) &&
          !active.checkpoint &&
          state.index > 0 &&
          lastCoalesceRef.current !== null &&
          lastCoalesceRef.current.label === label &&
          now - lastCoalesceRef.current.at < COALESCE_WINDOW_MS;

        if (canCoalesce) {
          lastCoalesceRef.current = { label, at: now };
          const copy = state.entries.slice(0, state.index + 1);
          copy[state.index] = { ...active, config: next, timestamp: now };
          return { entries: copy, index: state.index };
        }

        lastCoalesceRef.current = options.coalesce ? { label, at: now } : null;
        const head = state.entries.slice(0, state.index + 1);
        const appended = [...head, makeEntry(next, label)];
        const trimmed =
          appended.length > MAX_HISTORY ? appended.slice(appended.length - MAX_HISTORY) : appended;
        return { entries: trimmed, index: trimmed.length - 1 };
      });
      setDirty(true);
    },
    [],
  );

  /** Replaces the draft from server (theme apply / restore) as an undoable step. */
  const replace = useCallback((next: ProfileConfig, label = "Applied preset", markClean = true) => {
    lastCoalesceRef.current = null;
    setHistory((state) => {
      const head = state.entries.slice(0, state.index + 1);
      const appended = [...head, makeEntry(next, label)];
      const trimmed =
        appended.length > MAX_HISTORY ? appended.slice(appended.length - MAX_HISTORY) : appended;
      return { entries: trimmed, index: trimmed.length - 1 };
    });
    setDirty(!markClean);
  }, []);

  /** Pins a user-named checkpoint on the active history state. */
  const createCheckpoint = useCallback((name: string) => {
    const clean = name.trim().slice(0, 60);
    if (!clean) return false;
    lastCoalesceRef.current = null;
    setHistory((state) => {
      const copy = [...state.entries];
      const active = copy[state.index];
      copy[state.index] = { ...active, checkpoint: clean, timestamp: Date.now() };
      return { ...state, entries: copy };
    });
    return true;
  }, []);

  const removeCheckpoint = useCallback((entryId: string) => {
    setHistory((state) => ({
      ...state,
      entries: state.entries.map((e) => (e.id === entryId ? { ...e, checkpoint: null } : e)),
    }));
  }, []);

  const jumpToHistory = useCallback((targetIndex: number) => {
    lastCoalesceRef.current = null;
    setHistory((state) => {
      if (targetIndex < 0 || targetIndex >= state.entries.length || targetIndex === state.index) {
        return state;
      }
      return { ...state, index: targetIndex };
    });
    setDirty(true);
  }, []);

  const undo = useCallback(() => {
    lastCoalesceRef.current = null;
    let moved = false;
    setHistory((state) => {
      if (state.index <= 0) return state;
      moved = true;
      return { ...state, index: state.index - 1 };
    });
    if (moved) setDirty(true);
  }, []);

  const redo = useCallback(() => {
    lastCoalesceRef.current = null;
    let moved = false;
    setHistory((state) => {
      if (state.index >= state.entries.length - 1) return state;
      moved = true;
      return { ...state, index: state.index + 1 };
    });
    if (moved) setDirty(true);
  }, []);

  const markSaved = useCallback(() => setDirty(false), []);

  /** Block helpers: add, duplicate, copy, paste, group. */
  const addBlock = useCallback(
    (type: ProfileBlock["type"], groupId: string | null = null) => {
      if (present.blocks.length >= MAX_BLOCKS) return null;
      const id = createBlockId();
      const frame =
        present.layout.mode === "canvas" ? defaultFrameForBlock(present.blocks.length) : null;
      const parsed = blockSchema.parse({ id, type, groupId, frame, props: {} });
      update(
        (d) => {
          const nextBlocks = [...d.blocks, parsed];
          const neededHeight =
            frame ? Math.min(2400, Math.max(d.canvas.height, frame.y + 160)) : d.canvas.height;
          return {
            ...d,
            blocks: nextBlocks,
            canvas: frame ? { ...d.canvas, height: neededHeight } : d.canvas,
          };
        },
        `Add ${type} block`,
      );
      setSelection({ kind: "block", id });
      return id;
    },
    [present.blocks.length, present.layout.mode, update],
  );

  const duplicateBlock = useCallback(
    (blockId: string) => {
      const idx = present.blocks.findIndex((b) => b.id === blockId);
      if (idx < 0 || present.blocks.length >= MAX_BLOCKS) return null;
      const source = present.blocks[idx];
      const newId = createBlockId();
      const offsetFrame = source.frame
        ? clampFrame({ ...source.frame, x: source.frame.x + 2, y: source.frame.y + 24, z: Math.min(100, source.frame.z + 1) })
        : null;
      const clone: ProfileBlock = {
        ...structuredClone(source),
        id: newId,
        locked: false,
        label: source.label ? `${source.label} copy`.slice(0, 60) : "",
        frame: offsetFrame,
      };
      update((d) => {
        const next = [...d.blocks];
        next.splice(idx + 1, 0, clone);
        return { ...d, blocks: next };
      }, `Duplicate ${source.type} block`);
      setSelection({ kind: "block", id: newId });
      return newId;
    },
    [present.blocks, update],
  );

  const copyBlock = useCallback(
    (blockId: string) => {
      const found = present.blocks.find((b) => b.id === blockId);
      if (!found) return false;
      setClipboard(structuredClone(found));
      return true;
    },
    [present.blocks],
  );

  const pasteBlock = useCallback(
    (targetGroupId?: string | null) => {
      if (!clipboard || present.blocks.length >= MAX_BLOCKS) return null;
      const newId = createBlockId();
      const validGroup =
        targetGroupId !== undefined
          ? targetGroupId
          : clipboard.groupId && present.groups.some((g) => g.id === clipboard.groupId)
            ? clipboard.groupId
            : null;
      const frame = clipboard.frame
        ? clampFrame({ ...clipboard.frame, x: clipboard.frame.x + 3, y: clipboard.frame.y + 28, z: Math.min(100, clipboard.frame.z + 1) })
        : present.layout.mode === "canvas"
          ? defaultFrameForBlock(present.blocks.length)
          : null;
      const pasted: ProfileBlock = {
        ...structuredClone(clipboard),
        id: newId,
        locked: false,
        groupId: validGroup,
        frame,
      };
      update((d) => ({ ...d, blocks: [...d.blocks, pasted] }), `Paste ${pasted.type} block`);
      setSelection({ kind: "block", id: newId });
      return newId;
    },
    [clipboard, present.blocks.length, present.groups, present.layout.mode, update],
  );

  const createGroup = useCallback(
    (name = "New group", initialBlockId?: string) => {
      if (present.groups.length >= MAX_GROUPS) return null;
      const id = createGroupId();
      const cleanName = name.trim().slice(0, 60) || `Group ${present.groups.length + 1}`;
      update(
        (d) => ({
          ...d,
          groups: [...d.groups, { id, name: cleanName, visible: true, locked: false, collapsed: false }],
          blocks: initialBlockId
            ? d.blocks.map((b) => (b.id === initialBlockId ? { ...b, groupId: id } : b))
            : d.blocks,
        }),
        `Create group "${cleanName}"`,
      );
      setSelection({ kind: "group", id });
      return id;
    },
    [present.groups.length, update],
  );

  // Global keyboard shortcuts (inactive inside form fields and Monaco editors).
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable ||
          target.closest(".monaco-editor"))
      ) {
        return;
      }

      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (mod && key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && key === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (mod && key === "d" && selection?.kind === "block") {
        event.preventDefault();
        duplicateBlock(selection.id);
        return;
      }
      if (event.key === "Escape" && selection) {
        setSelection(null);
        return;
      }

      // Keyboard nudging in freeform canvas mode for accessible precision positioning.
      if (
        present.layout.mode === "canvas" &&
        selection &&
        (event.key === "ArrowUp" ||
          event.key === "ArrowDown" ||
          event.key === "ArrowLeft" ||
          event.key === "ArrowRight")
      ) {
        const stepPx = event.shiftKey ? Math.max(8, present.canvas.gridSnap || 10) : 2;
        const stepPct = event.shiftKey ? 2 : 0.5;
        const dx = event.key === "ArrowLeft" ? -stepPct : event.key === "ArrowRight" ? stepPct : 0;
        const dy = event.key === "ArrowUp" ? -stepPx : event.key === "ArrowDown" ? stepPx : 0;

        if (selection.kind === "identity") {
          event.preventDefault();
          update(
            (d) => {
              const cur = d.canvas.identityFrame ?? DEFAULT_IDENTITY_FRAME;
              return {
                ...d,
                canvas: {
                  ...d.canvas,
                  identityFrame: clampFrame({ ...cur, x: cur.x + dx, y: cur.y + dy }, d.canvas.height),
                },
              };
            },
            { label: "Nudge profile card", coalesce: true },
          );
        } else if (selection.kind === "links") {
          event.preventDefault();
          update(
            (d) => {
              const cur = d.canvas.linksFrame ?? DEFAULT_LINKS_FRAME;
              return {
                ...d,
                canvas: {
                  ...d.canvas,
                  linksFrame: clampFrame({ ...cur, x: cur.x + dx, y: cur.y + dy }, d.canvas.height),
                },
              };
            },
            { label: "Nudge links panel", coalesce: true },
          );
        } else if (selection.kind === "block") {
          const idx = present.blocks.findIndex((b) => b.id === selection.id);
          const blk = present.blocks[idx];
          if (blk && !isBlockLocked(blk, present.groups)) {
            event.preventDefault();
            update(
              (d) => ({
                ...d,
                blocks: d.blocks.map((b, i) => {
                  if (b.id !== selection.id) return b;
                  const cur = b.frame ?? defaultFrameForBlock(i);
                  return {
                    ...b,
                    frame: clampFrame({ ...cur, x: cur.x + dx, y: cur.y + dy }, d.canvas.height),
                  };
                }),
              }),
              { label: "Nudge block", coalesce: true },
            );
          }
        }
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    undo,
    redo,
    selection,
    duplicateBlock,
    present.layout.mode,
    present.canvas.gridSnap,
    present.blocks,
    present.groups,
    update,
  ]);

  const selectedBlock = useMemo(
    () =>
      selection?.kind === "block"
        ? (present.blocks.find((b) => b.id === selection.id) ?? null)
        : null,
    [selection, present.blocks],
  );

  const selectedGroup = useMemo(
    () =>
      selection?.kind === "group"
        ? (present.groups.find((g) => g.id === selection.id) ?? null)
        : null,
    [selection, present.groups],
  );

  return {
    draft: present,
    dirty,
    history: history.entries,
    historyIndex: history.index,
    canUndo: history.index > 0,
    canRedo: history.index < history.entries.length - 1,
    selection,
    setSelection,
    selectedBlock,
    selectedGroup,
    clipboard,
    update,
    replace,
    undo,
    redo,
    jumpToHistory,
    createCheckpoint,
    removeCheckpoint,
    markSaved,
    addBlock,
    duplicateBlock,
    copyBlock,
    pasteBlock,
    createGroup,
  };
}

export type EditorStore = ReturnType<typeof useEditorStore>;
