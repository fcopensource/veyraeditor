/* Turns `git log --numstat` output into the numbers and story of a "Wrapped". No VS Code here, so it can be tested on its own. */

/** One commit record per \x1e; fields separated by \x1f. %aI keeps the author's own timezone, so hours are their local hours. */
export const LOG_FORMAT = "%x1e%H%x1f%an%x1f%ae%x1f%aI%x1f%s";

export interface FileStat { path: string; added: number; deleted: number }
export interface Commit { hash: string; author: string; email: string; date: string; subject: string; files: FileStat[] }

export function parseLog(text: string): Commit[] {
  const commits: Commit[] = [];
  for (const record of text.split("\x1e")) {
    if (!record.trim()) continue;
    const [header, ...rest] = record.split("\n");
    const [hash, author, email, date, subject = ""] = header.split("\x1f");
    if (!hash || !date) continue;
    const files: FileStat[] = [];
    for (const line of rest) {
      const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line.trim());
      if (m) files.push({ path: renamedTo(m[3]), added: m[1] === "-" ? 0 : +m[1], deleted: m[2] === "-" ? 0 : +m[2] });
    }
    commits.push({ hash, author, email, date, subject, files });
  }
  return commits;
}

/** numstat writes renames as "src/{old => new}/a.ts" or "old.ts => new.ts". */
function renamedTo(path: string) {
  const brace = /^(.*)\{(.*) => (.*)\}(.*)$/.exec(path);
  if (brace) return (brace[1] + brace[3] + brace[4]).replace(/\/\//g, "/");
  const arrow = path.indexOf(" => ");
  return arrow >= 0 ? path.slice(arrow + 4) : path;
}

const LANGUAGES: Record<string, [string, string]> = {
  ts: ["TypeScript", "#3178c6"], tsx: ["TypeScript", "#3178c6"], mts: ["TypeScript", "#3178c6"], cts: ["TypeScript", "#3178c6"],
  js: ["JavaScript", "#f1e05a"], jsx: ["JavaScript", "#f1e05a"], mjs: ["JavaScript", "#f1e05a"], cjs: ["JavaScript", "#f1e05a"],
  py: ["Python", "#3572a5"], rs: ["Rust", "#dea584"], go: ["Go", "#00add8"], java: ["Java", "#b07219"], kt: ["Kotlin", "#a97bff"], kts: ["Kotlin", "#a97bff"],
  swift: ["Swift", "#f05138"], c: ["C", "#555555"], h: ["C", "#555555"], cpp: ["C++", "#f34b7d"], cc: ["C++", "#f34b7d"], hpp: ["C++", "#f34b7d"],
  cs: ["C#", "#178600"], rb: ["Ruby", "#cc342d"], php: ["PHP", "#4f5d95"], dart: ["Dart", "#00b4ab"], scala: ["Scala", "#c22d40"],
  html: ["HTML", "#e34c26"], htm: ["HTML", "#e34c26"], css: ["CSS", "#663399"], scss: ["SCSS", "#c6538c"], sass: ["SCSS", "#c6538c"], less: ["Less", "#1d365d"],
  vue: ["Vue", "#41b883"], svelte: ["Svelte", "#ff3e00"], astro: ["Astro", "#ff5a03"], sql: ["SQL", "#e38c00"], sh: ["Shell", "#89e051"], bash: ["Shell", "#89e051"],
  ps1: ["PowerShell", "#012456"], lua: ["Lua", "#000080"], r: ["R", "#198ce7"], ex: ["Elixir", "#6e4a7e"], exs: ["Elixir", "#6e4a7e"], zig: ["Zig", "#ec915c"],
  md: ["Markdown", "#083fa1"], mdx: ["Markdown", "#083fa1"], json: ["JSON", "#a0a0a0"], yml: ["YAML", "#cb171e"], yaml: ["YAML", "#cb171e"], toml: ["TOML", "#9c4221"],
  cls: ["Apex", "#1797c0"], trigger: ["Apex", "#1797c0"], ipynb: ["Jupyter", "#da5b0b"],
};

/** Files people don't write by hand: they would drown out the real work. */
const GENERATED = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|Cargo\.lock|poetry\.lock|composer\.lock|Gemfile\.lock|go\.sum)$|(^|\/)(node_modules|dist|build|out|vendor|\.next|coverage)\/|\.min\.(js|css)$|\.map$|\.snap$/i;
export const isGenerated = (path: string) => GENERATED.test(path);

export function languageOf(path: string): [string, string] | undefined {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return path.includes(".") ? LANGUAGES[ext] : undefined;
}

/** Filler left out of the favourite-words list ("fix" still counts toward the Bug Hunter separately). */
const STOP = new Set("the and for with from into that this then than when what are was were has have had not but use used using also more some only just add adds added update updates updated change changes changed fix fixes fixed make makes made via per its it's out new all now can will".split(" "));

export type PersonalityId = "night-owl" | "early-bird" | "weekend-warrior" | "refactorer" | "bug-hunter" | "marathoner" | "architect" | "steady";
export interface Personality { id: PersonalityId; title: string; line: string }
const PERSONALITIES: Record<PersonalityId, Omit<Personality, "id">> = {
  "night-owl": { title: "The Night Owl", line: "Your best ideas arrive after dark, and so do your commits." },
  "early-bird": { title: "The Early Bird", line: "You ship before most people have had their coffee." },
  "weekend-warrior": { title: "The Weekend Warrior", line: "Saturdays and Sundays are for building, and you know it." },
  refactorer: { title: "The Refactorer", line: "You leave code smaller and cleaner than you found it." },
  "bug-hunter": { title: "The Bug Hunter", line: "No bug survives long once you are on its trail." },
  marathoner: { title: "The Marathoner", line: "Day after day without a break: your consistency is rare." },
  architect: { title: "The Architect", line: "You build big: whole systems, file after file." },
  steady: { title: "The Steady Shipper", line: "Calm, consistent and always moving the work forward." },
};

export interface Wrapped {
  repo: string; who: string; team: boolean;
  period: { label: string; from: string; to: string };
  commits: number; activeDays: number; added: number; deleted: number; files: number;
  longestStreak: number; busiestDay: { date: string; count: number } | null;
  hours: number[]; weekdays: number[]; peakHour: number; peakWeekday: number;
  nightShare: number; morningShare: number; weekendShare: number;
  languages: { name: string; color: string; lines: number; share: number }[];
  topFiles: { path: string; commits: number }[];
  biggest: { subject: string; lines: number; date: string } | null;
  words: { word: string; count: number }[];
  contributors: { name: string; commits: number }[];
  personality: Personality;
}

const day = (iso: string) => iso.slice(0, 10);
const nextDay = (d: string) => new Date(Date.parse(d + "T00:00:00Z") + 864e5).toISOString().slice(0, 10);

/** Monday = 0 … Sunday = 6, in the author's own calendar (the date part of %aI). */
const weekdayOf = (iso: string) => (new Date(day(iso) + "T00:00:00Z").getUTCDay() + 6) % 7;

export function summarize(commits: Commit[], meta: { repo: string; who: string; team: boolean; period: { label: string; from: string; to: string } }): Wrapped {
  const hours = Array(24).fill(0), weekdays = Array(7).fill(0);
  const days = new Map<string, number>(), files = new Map<string, number>(), langs = new Map<string, { color: string; lines: number }>();
  const words = new Map<string, number>(), people = new Map<string, number>();
  let added = 0, deleted = 0, fixes = 0;
  let biggest: Wrapped["biggest"] = null;

  for (const c of commits) {
    hours[+c.date.slice(11, 13)]++;
    weekdays[weekdayOf(c.date)]++;
    days.set(day(c.date), (days.get(day(c.date)) ?? 0) + 1);
    people.set(c.author, (people.get(c.author) ?? 0) + 1);
    if (/\b(fix|fixes|fixed|bug|bugfix|hotfix)\b/i.test(c.subject)) fixes++;
    for (const w of c.subject.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? []) if (!STOP.has(w)) words.set(w, (words.get(w) ?? 0) + 1);
    let size = 0;
    for (const f of c.files) {
      if (isGenerated(f.path)) continue;
      added += f.added; deleted += f.deleted; size += f.added + f.deleted;
      files.set(f.path, (files.get(f.path) ?? 0) + 1);
      const lang = languageOf(f.path);
      if (lang && f.added) { const l = langs.get(lang[0]) ?? { color: lang[1], lines: 0 }; l.lines += f.added; langs.set(lang[0], l); }
    }
    if (size && (!biggest || size > biggest.lines)) biggest = { subject: c.subject, lines: size, date: day(c.date) };
  }

  const sortedDays = [...days.keys()].sort();
  let longestStreak = 0, run = 0, prev = "";
  for (const d of sortedDays) { run = prev && nextDay(prev) === d ? run + 1 : 1; longestStreak = Math.max(longestStreak, run); prev = d; }
  let busiestDay: Wrapped["busiestDay"] = null;
  for (const [date, count] of days) if (!busiestDay || count > busiestDay.count || (count === busiestDay.count && date > busiestDay.date)) busiestDay = { date, count };

  const n = commits.length || 1;
  const share = (hs: number[]) => hs.reduce((a, h) => a + hours[h], 0) / n;
  const nightShare = share([21, 22, 23, 0, 1, 2, 3, 4]);
  const morningShare = share([5, 6, 7, 8]);
  const weekendShare = (weekdays[5] + weekdays[6]) / n;
  const totalLang = [...langs.values()].reduce((a, l) => a + l.lines, 0) || 1;

  const stats = { commits: commits.length, added, deleted, files: files.size, longestStreak, nightShare, morningShare, weekendShare, fixShare: fixes / n };
  return {
    ...meta,
    commits: commits.length, activeDays: days.size, added, deleted, files: files.size,
    longestStreak, busiestDay, hours, weekdays,
    peakHour: hours.indexOf(Math.max(...hours)), peakWeekday: weekdays.indexOf(Math.max(...weekdays)),
    nightShare, morningShare, weekendShare,
    languages: [...langs].sort((a, b) => b[1].lines - a[1].lines).slice(0, 5).map(([name, l]) => ({ name, color: l.color, lines: l.lines, share: l.lines / totalLang })),
    topFiles: [...files].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([path, commits]) => ({ path, commits })),
    biggest,
    words: [...words].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12).map(([word, count]) => ({ word, count })),
    contributors: [...people].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, commits]) => ({ name, commits })),
    personality: personalityOf(stats),
  };
}

/** Each trait scores how far past its threshold the numbers go; the strongest wins. */
export function personalityOf(s: { commits: number; added: number; deleted: number; files: number; longestStreak: number; nightShare: number; morningShare: number; weekendShare: number; fixShare: number }): Personality {
  if (s.commits < 5) return { id: "steady", ...PERSONALITIES.steady };
  const scores: [PersonalityId, number][] = [
    ["night-owl", s.nightShare / 0.35],
    ["early-bird", s.morningShare / 0.3],
    ["weekend-warrior", s.weekendShare / 0.3],
    ["refactorer", s.deleted > 500 ? (s.deleted / Math.max(s.added, 1)) / 0.7 : 0],
    ["bug-hunter", s.fixShare / 0.3],
    ["marathoner", s.longestStreak / 10],
    ["architect", Math.max(s.added / 60000, s.files / 800)],
  ];
  const [id, score] = scores.reduce((best, cur) => (cur[1] > best[1] ? cur : best));
  const pick: PersonalityId = score >= 1 ? id : "steady";
  return { id: pick, ...PERSONALITIES[pick] };
}

/** The `--since` date and the label for each period setting. */
export function periodFor(kind: "thisYear" | "last12Months" | "allTime", now = new Date()): { label: string; since?: string; from: string; to: string } {
  const to = now.toISOString().slice(0, 10);
  if (kind === "thisYear") { const y = now.getFullYear(); return { label: String(y), since: `${y}-01-01`, from: `${y}-01-01`, to }; }
  if (kind === "last12Months") { const f = new Date(now); f.setFullYear(f.getFullYear() - 1); const from = f.toISOString().slice(0, 10); return { label: "the last 12 months", since: from, from, to }; }
  return { label: "all time", from: "", to };
}

/** Reads `git var GIT_AUTHOR_IDENT` ("Ada Lovelace <ada@x.dev> 1761980000 +0530"): the identity git really uses, even when it guessed it. */
export function parseIdent(text: string): { name: string; email: string } {
  const m = /^(.*?)\s*<([^>]*)>/.exec(text.trim());
  return m ? { name: m[1].trim(), email: m[2].trim() } : { name: "", email: "" };
}

/** Commits by this person: either their email or their name matches what git is configured with. */
export function isMe(c: Commit, me: { name?: string; email?: string }) {
  return (!!me.email && c.email.toLowerCase() === me.email.toLowerCase()) || (!!me.name && c.author.toLowerCase() === me.name.toLowerCase());
}
