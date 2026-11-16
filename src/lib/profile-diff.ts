/** Bounded, deterministic leaf diffs for validated published snapshots. No HTML. */
export type RevisionChange = { path: string; before: string; after: string };

export const MAX_DIFF_CHANGES = 100;

export function diffSnapshots(before: unknown, after: unknown): RevisionChange[] {
  const changes: RevisionChange[] = [];
  const display = (value: unknown) =>
    value === undefined ? "(absent)" : JSON.stringify(value).slice(0, 240);

  function walk(a: unknown, b: unknown, path: string, depth: number) {
    if (changes.length >= MAX_DIFF_CHANGES || JSON.stringify(a) === JSON.stringify(b)) return;
    if (
      depth < 8 &&
      a &&
      b &&
      typeof a === "object" &&
      typeof b === "object" &&
      !Array.isArray(a) &&
      !Array.isArray(b)
    ) {
      const left = a as Record<string, unknown>;
      const right = b as Record<string, unknown>;
      for (const key of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()) {
        // Ignore the snapshot timestamp itself so identical re-publishes diff cleanly.
        if (depth === 0 && key === "publishedAt") continue;
        walk(left[key], right[key], path ? `${path}.${key}` : key, depth + 1);
      }
    } else {
      changes.push({ path, before: display(a), after: display(b) });
    }
  }

  walk(before, after, "", 0);
  return changes;
}

/** Turns a dot path like `config.theme.text.accent` into a short readable label. */
export function formatDiffPath(path: string): string {
  if (!path) return "snapshot";
  return path.replace(/^config\./, "");
}
