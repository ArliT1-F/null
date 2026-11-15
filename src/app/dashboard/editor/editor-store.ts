"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { ProfileConfig } from "@/lib/profile-config";
import { normalizeProfileConfig } from "@/lib/profile-config";

/**
 * Editor state.
 *
 * A deliberately small store rather than a form library:
 *  - `draft` is the working config; edits mutate it immutably.
 *  - `history` gives real undo/redo with a bounded stack (no memory creep on a
 *    4 GB machine).
 *  - `dirty` compares against the config when the editor loaded.
 *
 * Nothing here writes to the DOM or to `style` attributes; the preview is a
 * React re-render driven by the same tokens the server uses.
 */

type Snapshot = { config: ProfileConfig; at: number };

const HISTORY_LIMIT = 60;

export type EditorState = ReturnType<typeof useEditorStore>;

export function useEditorStore(initial: ProfileConfig) {
  const [draft, setDraftState] = useState<ProfileConfig>(() => normalizeProfileConfig(initial));
  const [baseline, setBaseline] = useState<ProfileConfig>(() => normalizeProfileConfig(initial));
  const past = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);

  const bump = useCallback(() => setHistoryVersion((v) => v + 1), []);

  const commit = useCallback(
    (next: ProfileConfig, coalesce = false) => {
      setDraftState((current) => {
        const now = Date.now();
        const last = past.current[past.current.length - 1];
        // Merge rapid successive edits (e.g. dragging a slider) into one undo step.
        const shouldCoalesce = coalesce && last && now - last.at < 700;
        if (!shouldCoalesce) {
          past.current.push({ config: current, at: now });
          if (past.current.length > HISTORY_LIMIT) past.current.shift();
        } else if (last) {
          last.at = now;
        }
        future.current = [];
        return next;
      });
      bump();
    },
    [bump],
  );

  /** Sets a nested value by dot path, e.g. "theme.text.accent". */
  const set = useCallback(
    (path: string, value: unknown, coalesce = false) => {
      setDraftState((current) => {
        const next = structuredClone(current) as Record<string, unknown>;
        const keys = path.split(".");
        let node: Record<string, unknown> = next;
        for (let i = 0; i < keys.length - 1; i++) {
          node = node[keys[i]] as Record<string, unknown>;
        }
        node[keys[keys.length - 1]] = value;

        const now = Date.now();
        const last = past.current[past.current.length - 1];
        const shouldCoalesce = coalesce && last && now - last.at < 700;
        if (!shouldCoalesce) {
          past.current.push({ config: current, at: now });
          if (past.current.length > HISTORY_LIMIT) past.current.shift();
        } else if (last) {
          last.at = now;
        }
        future.current = [];
        return normalizeProfileConfig(next);
      });
      bump();
    },
    [bump],
  );

  const undo = useCallback(() => {
    const previous = past.current.pop();
    if (!previous) return;
    setDraftState((current) => {
      future.current.push({ config: current, at: Date.now() });
      return previous.config;
    });
    bump();
  }, [bump]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    setDraftState((current) => {
      past.current.push({ config: current, at: Date.now() });
      return next.config;
    });
    bump();
  }, [bump]);

  const reset = useCallback(
    (config: ProfileConfig) => {
      commit(normalizeProfileConfig(config));
    },
    [commit],
  );

  const markSaved = useCallback((config: ProfileConfig) => {
    setBaseline(normalizeProfileConfig(config));
  }, []);

  // historyVersion is read so undo/redo availability recomputes after the refs
  // mutate; the stack itself lives in refs to avoid re-rendering on every push.
  const canUndo = historyVersion >= 0 && past.current.length > 0;
  const canRedo = historyVersion >= 0 && future.current.length > 0;
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(baseline), [draft, baseline]);

  return { draft, set, commit, undo, redo, reset, markSaved, canUndo, canRedo, dirty, baseline };
}
