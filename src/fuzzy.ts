export type FuzzyMatch = { score: number; indices: number[] };

const boundary = (text: string, i: number) => i === 0 || "/\\._- ".includes(text[i - 1]) || (text[i] !== text[i].toLowerCase() && text[i - 1] === text[i - 1].toLowerCase());

/** Subsequence match with bonuses for consecutive characters and word starts, in the spirit of VS Code's quick open. */
export function fuzzy(query: string, target: string): FuzzyMatch | null {
  if (!query) return { score: 0, indices: [] };
  const q = query.toLowerCase().replace(/\s+/g, ""), t = target.toLowerCase();
  // Prefer matching within the file name so "app" ranks src/App.tsx above apps/x/index.ts.
  const nameStart = Math.max(target.lastIndexOf("/"), target.lastIndexOf("\\")) + 1;
  const attempt = (from: number) => {
    const indices: number[] = []; let score = 0, last = -2, ti = from;
    for (const ch of q) {
      let found = -1;
      for (let i = ti; i < t.length; i++) if (t[i] === ch) { if (found < 0) found = i; if (boundary(target, i) || i === last + 1) { found = i; break; } }
      if (found < 0) return null;
      score += 1 + (found === last + 1 ? 5 : 0) + (boundary(target, found) ? 8 : 0) + (found >= nameStart ? 3 : 0) + (target[found] === query[indices.length] ? 1 : 0);
      indices.push(found); last = found; ti = found + 1;
    }
    return { score: score - (t.length - q.length) * 0.02, indices };
  };
  const inName = nameStart > 0 ? attempt(nameStart) : null;
  const anywhere = attempt(0);
  if (inName && (!anywhere || inName.score + 10 >= anywhere.score)) return { score: inName.score + 10, indices: inName.indices };
  return anywhere;
}

export function rank<T>(items: T[], query: string, text: (item: T) => string, limit = 80) {
  if (!query.trim()) return items.slice(0, limit).map(item => ({ item, indices: [] as number[] }));
  return items.flatMap(item => { const match = fuzzy(query, text(item)); return match ? [{ item, ...match }] : []; })
    .sort((a, b) => b.score - a.score).slice(0, limit);
}
