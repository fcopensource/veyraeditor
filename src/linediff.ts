export type LineChange = { kind: "added" | "modified" | "deleted"; start: number; end: number };

/**
 * Myers O(ND) line diff between `before` and `after`, reported as editor gutter ranges
 * (1-based line numbers in `after`). Gives up on very large or very different files.
 */
export function lineChanges(before: string, after: string, maxEdits = 2000): LineChange[] | null {
  const a = before.split(/\r?\n/), b = after.split(/\r?\n/);
  let start = 0; while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length, endB = b.length; while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const A = a.slice(start, endA), B = b.slice(start, endB), n = A.length, m = B.length;
  if (!n && !m) return [];
  const max = Math.min(n + m, maxEdits), offset = max + 1, trace: Int32Array[] = [];
  let v = new Int32Array(2 * max + 3), found = false;
  for (let d = 0; d <= max && !found; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && A[x] === B[y]) { x++; y++; }
      v[offset + k] = x;
      if (x >= n && y >= m) { found = true; break; }
    }
  }
  if (!found) return null;
  // Walk back through the trace to recover deleted (from A) and inserted (into B) indices.
  const deleted = new Set<number>(), inserted = new Set<number>();
  let x = n, y = m;
  for (let d = trace.length - 1; d > 0; d--) {
    const prev = trace[d], k = x - y;
    const down = k === -d || (k !== d && prev[offset + k - 1] < prev[offset + k + 1]);
    const prevK = down ? k + 1 : k - 1, prevX = prev[offset + prevK], prevY = prevX - prevK;
    while (x > prevX && y > prevY) { x--; y--; }
    if (down) inserted.add(y - 1); else deleted.add(x - 1);
    x = prevX; y = prevY;
  }
  // Group into hunks: a run of insertions paired with deletions at the same spot is a modification.
  const changes: LineChange[] = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (!deleted.has(i) && !inserted.has(j)) { i++; j++; continue; }
    let dels = 0, ins = 0;
    while (deleted.has(i)) { i++; dels++; }
    const from = j; while (inserted.has(j)) { j++; ins++; }
    const line = start + from + 1;
    if (ins && dels) changes.push({ kind: "modified", start: line, end: line + ins - 1 });
    else if (ins) changes.push({ kind: "added", start: line, end: line + ins - 1 });
    else changes.push({ kind: "deleted", start: Math.max(1, line - 1), end: Math.max(1, line - 1) });
  }
  return changes;
}
