/** Bounded, deterministic leaf diffs for validated published snapshots. No HTML. */
export type RevisionChange = { path: string; before: string; after: string };
export function diffSnapshots(before: unknown, after: unknown): RevisionChange[] {
  const changes: RevisionChange[] = [];
  const display = (value: unknown) => value === undefined ? "(absent)" : JSON.stringify(value).slice(0, 240);
  function walk(a: unknown, b: unknown, path: string, depth: number) {
    if (changes.length >= 100 || JSON.stringify(a) === JSON.stringify(b)) return;
    if (depth < 8 && a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
      const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
      for (const key of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()) walk(left[key], right[key], path ? `${path}.${key}` : key, depth + 1);
    } else changes.push({ path, before: display(a), after: display(b) });
  }
  walk(before, after, "", 0);
  return changes;
}
