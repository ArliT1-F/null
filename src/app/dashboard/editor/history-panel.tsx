"use client";

import { useState } from "react";
import { formatDiffPath, type RevisionChange } from "@/lib/profile-diff";
import { cn } from "@/lib/utils";
import type { HistoryEntry } from "./editor-store";

export type VersionItem = {
  id: string;
  version: number;
  label: string | null;
  createdAt: string;
};

/**
 * Full V2 History panel (V2.1, NUL-5):
 *  1. In-session Undo/Redo visual timeline with named checkpoints and one-click jump.
 *  2. Published revisions log with flexible version-to-version diff comparison
 *     and append-only restore that syncs the live editor state immediately.
 */
export function HistoryPanel({
  history,
  historyIndex,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onJumpToHistory,
  onCreateCheckpoint,
  onRemoveCheckpoint,
  versions,
  pending,
  onRestoreVersion,
  onLoadDiff,
}: {
  history: HistoryEntry[];
  historyIndex: number;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onJumpToHistory: (index: number) => void;
  onCreateCheckpoint: (name: string) => boolean;
  onRemoveCheckpoint: (id: string) => void;
  versions: VersionItem[];
  pending: boolean;
  onRestoreVersion: (versionId: string) => void;
  onLoadDiff: (
    versionId: string,
    baselineId?: string,
  ) => Promise<{ previousVersion: number | null; changes: RevisionChange[] } | null>;
}) {
  const [checkpointName, setCheckpointName] = useState("");
  const [checkpointsOnly, setCheckpointsOnly] = useState(false);
  const [openDiffId, setOpenDiffId] = useState<string | null>(null);
  const [baselineId, setBaselineId] = useState<string>("");
  const [diffState, setDiffState] = useState<{
    previousVersion: number | null;
    changes: RevisionChange[];
  } | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);

  async function inspectRevision(versionId: string, explicitBaseline?: string) {
    if (openDiffId === versionId && explicitBaseline === undefined) {
      setOpenDiffId(null);
      setDiffState(null);
      return;
    }
    setOpenDiffId(versionId);
    setLoadingDiff(true);
    const res = await onLoadDiff(versionId, explicitBaseline || undefined);
    setLoadingDiff(false);
    setDiffState(res);
  }

  const timelineItems = history
    .map((entry, idx) => ({ entry, idx }))
    .filter(({ entry, idx }) => !checkpointsOnly || Boolean(entry.checkpoint) || idx === historyIndex)
    .reverse();

  return (
    <div className="divide-y divide-ink-200/70 dark:divide-white/[0.07]">
      {/* 1. Session undo/redo timeline + named checkpoints */}
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-semibold text-ink-800 dark:text-ink-100">Session timeline</h3>
            <p className="text-[11px] text-ink-400">
              Step {historyIndex + 1} of {history.length}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className="btn-secondary px-2.5 py-1 text-xs disabled:opacity-35"
              title="Undo (⌘Z)"
            >
              ↶ Undo
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              className="btn-secondary px-2.5 py-1 text-xs disabled:opacity-35"
              title="Redo (⇧⌘Z)"
            >
              ↷ Redo
            </button>
          </div>
        </div>

        {/* Pin named checkpoint */}
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (onCreateCheckpoint(checkpointName)) {
              setCheckpointName("");
            }
          }}
        >
          <input
            type="text"
            value={checkpointName}
            onChange={(e) => setCheckpointName(e.target.value)}
            maxLength={60}
            placeholder="Name a checkpoint (e.g. Before new font)…"
            aria-label="Checkpoint name"
            className="min-w-0 flex-1 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-black/30"
          />
          <button
            type="submit"
            disabled={!checkpointName.trim()}
            className="btn-secondary shrink-0 px-2.5 py-1.5 text-xs"
          >
            Pin
          </button>
        </form>

        {history.some((h) => h.checkpoint) && (
          <label className="flex items-center gap-2 text-[11px] text-ink-500 dark:text-ink-400">
            <input
              type="checkbox"
              checked={checkpointsOnly}
              onChange={(e) => setCheckpointsOnly(e.target.checked)}
              className="rounded accent-brand-500"
            />
            Show pinned checkpoints only
          </label>
        )}

        <ul className="max-h-52 space-y-1 overflow-y-auto pr-0.5">
          {timelineItems.map(({ entry, idx }) => {
            const isCurrent = idx === historyIndex;
            const isFuture = idx > historyIndex;
            return (
              <li key={entry.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onJumpToHistory(idx)}
                  className={cn(
                    "flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors",
                    isCurrent
                      ? "border-brand-500/60 bg-brand-500/10 font-medium text-ink-950 dark:border-brand-400/50 dark:text-white"
                      : "border-transparent hover:bg-ink-100 dark:hover:bg-white/[0.04]",
                    isFuture && "opacity-55",
                  )}
                >
                  <span className="min-w-0 truncate">
                    {entry.checkpoint ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="rounded bg-brand-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700 dark:text-brand-300">
                          ★ {entry.checkpoint}
                        </span>
                      </span>
                    ) : (
                      entry.label
                    )}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-ink-400">
                    {isCurrent ? "current" : formatTime(entry.timestamp)}
                  </span>
                </button>
                {entry.checkpoint && (
                  <button
                    type="button"
                    onClick={() => onRemoveCheckpoint(entry.id)}
                    aria-label={`Unpin checkpoint ${entry.checkpoint}`}
                    className="rounded px-1 text-[10px] text-ink-400 hover:text-red-500"
                  >
                    ✕
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* 2. Published revisions & structured diffs */}
      <div className="space-y-3 p-4">
        <div>
          <h3 className="text-xs font-semibold text-ink-800 dark:text-ink-100">Published revisions</h3>
          <p className="mt-0.5 text-[11px] text-ink-500 dark:text-ink-400">
            Every Publish captures an immutable snapshot. Restoring is append-only — past versions are never lost.
          </p>
        </div>

        {versions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-ink-200 p-5 text-center text-xs text-ink-400 dark:border-white/10">
            No published revisions yet. Hit Publish to snapshot v1.
          </p>
        ) : (
          <ul className="space-y-2">
            {versions.map((v, idx) => {
              const isOpen = openDiffId === v.id;
              const otherVersions = versions.filter((o) => o.id !== v.id);
              return (
                <li
                  key={v.id}
                  className="rounded-xl border border-ink-200/80 p-3 text-xs dark:border-white/10"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        <span className="font-mono text-brand-600 dark:text-brand-400">v{v.version}</span>
                        {v.label ? ` · ${v.label}` : ""}
                        {idx === 0 && (
                          <span className="ml-1.5 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                            live
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-[11px] text-ink-400">{formatRevisionDate(v.createdAt)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        disabled={loadingDiff}
                        onClick={() => {
                          setBaselineId("");
                          void inspectRevision(v.id);
                        }}
                        className="btn-ghost px-2 py-1 text-[11px]"
                      >
                        {isOpen ? "Hide" : "Diff"}
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => onRestoreVersion(v.id)}
                        className="btn-secondary px-2.5 py-1 text-[11px]"
                      >
                        Restore
                      </button>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="mt-2.5 space-y-2 border-t border-ink-200/70 pt-2.5 text-[11px] dark:border-white/[0.08]">
                      {otherVersions.length > 0 && (
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-[10px] text-ink-400" htmlFor={`diff-base-${v.id}`}>
                            Compare against
                          </label>
                          <select
                            id={`diff-base-${v.id}`}
                            value={baselineId}
                            onChange={(e) => {
                              const next = e.target.value;
                              setBaselineId(next);
                              void inspectRevision(v.id, next);
                            }}
                            className="rounded border border-ink-200 bg-white px-2 py-0.5 text-[10px] dark:border-white/10 dark:bg-black/30"
                          >
                            <option value="">Previous revision</option>
                            {otherVersions.map((o) => (
                              <option key={o.id} value={o.id}>
                                v{o.version}
                                {o.label ? ` · ${o.label.slice(0, 24)}` : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {loadingDiff ? (
                        <p className="text-ink-400">Computing diff…</p>
                      ) : !diffState || diffState.previousVersion === null ? (
                        <p className="text-ink-400">Initial published revision — no earlier baseline.</p>
                      ) : diffState.changes.length === 0 ? (
                        <p className="text-ink-400">
                          Identical to v{diffState.previousVersion} (no field changes).
                        </p>
                      ) : (
                        <>
                          <p className="text-[10px] text-ink-400">
                            {diffState.changes.length}{" "}
                            {diffState.changes.length === 1 ? "change" : "changes"} from v
                            {diffState.previousVersion} → v{v.version}
                          </p>
                          <ul className="max-h-56 space-y-1.5 overflow-y-auto font-mono text-[10.5px]">
                            {diffState.changes.map((c) => (
                              <li
                                key={c.path}
                                className="rounded-md bg-ink-50 p-1.5 dark:bg-white/[0.03]"
                              >
                                <p className="break-all font-semibold text-ink-700 dark:text-ink-200">
                                  {formatDiffPath(c.path)}
                                </p>
                                <p className="break-all text-red-600/90 dark:text-red-400">− {c.before}</p>
                                <p className="break-all text-emerald-700 dark:text-emerald-400">+ {c.after}</p>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function formatTime(ms: number): string {
  try {
    return new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "";
  }
}

function formatRevisionDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}
