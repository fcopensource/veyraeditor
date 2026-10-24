/* Pure helpers: which problems to show, on which lines, and how they read. No VS Code, so they're tested in Node. */

/** Severities as VS Code numbers them: 0 error, 1 warning, 2 info, 3 hint. */
export type Severity = 0 | 1 | 2 | 3;
export const SEVERITY_NAMES = ["error", "warning", "info", "hint"] as const;
export interface Problem { line: number; severity: Severity; message: string; source?: string; code?: string }
export interface LineProblem { line: number; top: Problem; count: number; all: Problem[] }
export interface Filters { severities: Set<string>; excludeSources: string[]; excludeMessages: RegExp[] }

/** A diagnostic's code can be a string, a number or { value, target }. */
export function codeText(code: unknown): string | undefined {
  if (code === undefined || code === null || code === "") return undefined;
  if (typeof code === "object") return codeText((code as { value?: unknown }).value);
  return String(code);
}

/** Turns patterns from settings into regular expressions, reporting the ones that aren't valid. */
export function compilePatterns(patterns: string[]): { regexes: RegExp[]; invalid: string[] } {
  const regexes: RegExp[] = [], invalid: string[] = [];
  for (const p of patterns) { try { regexes.push(new RegExp(p, "i")); } catch { invalid.push(p); } }
  return { regexes, invalid };
}

export function filterProblems(problems: Problem[], f: Filters): Problem[] {
  const sources = new Set(f.excludeSources.map(s => s.toLowerCase()));
  return problems.filter(p => f.severities.has(SEVERITY_NAMES[p.severity])
    && !(p.source && sources.has(p.source.toLowerCase()))
    && !f.excludeMessages.some(re => re.test(p.message)));
}

/** One entry per line: the most severe problem first (the earliest one when they tie), and how many there are. */
export function byLine(problems: Problem[]): LineProblem[] {
  const lines = new Map<number, Problem[]>();
  for (const p of problems) { const list = lines.get(p.line) ?? []; list.push(p); lines.set(p.line, list); }
  return [...lines.entries()].sort((a, b) => a[0] - b[0]).map(([line, all]) => {
    const sorted = [...all].sort((a, b) => a.severity - b.severity);
    return { line, top: sorted[0], count: all.length, all: sorted };
  });
}

/** Which lines show their message: all of them, the cursor's line, or the problem nearest the cursor. */
export function pickLines(lines: LineProblem[], mode: string, cursorLine: number): LineProblem[] {
  if (mode === "activeLine") return lines.filter(l => l.line === cursorLine);
  if (mode === "closestProblem") {
    let best: LineProblem | undefined;
    for (const l of lines) if (!best || Math.abs(l.line - cursorLine) < Math.abs(best.line - cursorLine)) best = l;
    return best ? [best] : [];
  }
  return lines;
}

/** Fills in the message template, keeping it on one line and not too long. */
export function formatMessage(template: string, entry: Pick<LineProblem, "top" | "count">, max = 200): string {
  const p = entry.top;
  const values: Record<string, string> = { message: p.message, source: p.source ?? "", code: p.code ?? "", severity: SEVERITY_NAMES[p.severity], count: String(entry.count) };
  let text = template.replace(/\{(message|source|code|severity|count)\}/g, (_, k: string) => values[k]);
  text = text.replace(/\s*\(\s*\)|\s*\[\s*\]/g, "").replace(/\s+/g, " ").trim().replace(/^[:·\-–|]+\s*/, "");
  if (entry.count > 1 && !template.includes("{count}")) text += `  (+${entry.count - 1} more)`;
  return truncate(text, max);
}
export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/** Whether a line should wait for a pause in typing before its message shows again. */
export function hiddenWhileTyping(mode: string, line: number, lastEdit: { line: number; at: number } | undefined, now: number, delay: number): boolean {
  if (mode !== "hideCurrentLine" || !lastEdit) return false;
  return lastEdit.line === line && now - lastEdit.at < delay;
}

/** All the problems on a line, one per line of text, for copying. */
export function describe(entry: LineProblem): string {
  return entry.all.map(p => `${SEVERITY_NAMES[p.severity]}: ${p.message}${p.source ? ` (${p.source}${p.code ? ` ${p.code}` : ""})` : ""}`).join("\n");
}
/** A web search for a problem, without file paths or line numbers that only make sense on this computer. */
export function searchQuery(p: Problem): string {
  const message = p.message.split(/\r?\n/)[0].replace(/(['"`])[^'"`]*[\\/][^'"`]*\1/g, "").replace(/\s+/g, " ").trim();
  return [p.source, p.code, message].filter(Boolean).join(" ");
}
