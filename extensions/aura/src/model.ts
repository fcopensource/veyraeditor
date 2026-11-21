/* Veyra Aura: the rules. Pure logic, no `vscode` import, so it is unit-tested with plain Node. */

export type MoveId =
  | 'clearedErrors' | 'cleanSave' | 'commit' | 'goodCommitMessage' | 'badCommitMessage'
  | 'testsPassed' | 'testsFailed' | 'buildPassed' | 'buildFailed' | 'forcePush'
  | 'deletedLines' | 'lockedIn' | 'nightOwl' | 'debuggerLeft' | 'streak';

export interface Move {
  aura: number; emoji: string;
  /** What the feed says. {file}, {n} and {msg} are filled in. */
  text: string;
  /** At most this many per day (per key, see `award`). */
  daily: number;
  /** A penalty: only given when roast mode is on. */
  roast?: boolean;
}

export const MOVES: Record<MoveId, Move> = {
  clearedErrors:     { aura: 15,  emoji: '🧹', text: 'Cleared every error in {file}', daily: 20 },
  cleanSave:         { aura: 1,   emoji: '💾', text: 'Clean save, zero errors', daily: 25 },
  commit:            { aura: 20,  emoji: '📦', text: 'Shipped a commit', daily: 15 },
  goodCommitMessage: { aura: 5,   emoji: '✍️', text: 'That commit message ate', daily: 15 },
  badCommitMessage:  { aura: -5,  emoji: '💀', text: 'Commit message “{msg}” is giving nothing', daily: 10, roast: true },
  testsPassed:       { aura: 20,  emoji: '✅', text: 'Tests passed. W.', daily: 10 },
  testsFailed:       { aura: -5,  emoji: '🫠', text: 'Tests said nah', daily: 10, roast: true },
  buildPassed:       { aura: 10,  emoji: '🏗️', text: 'Build passed', daily: 8 },
  buildFailed:       { aura: -3,  emoji: '🧱', text: 'Build fumbled', daily: 8, roast: true },
  forcePush:         { aura: -20, emoji: '☢️', text: 'Force-pushed. Bold move.', daily: 5, roast: true },
  deletedLines:      { aura: 15,  emoji: '✂️', text: 'Deleted {n} lines from {file}. Less code, more aura.', daily: 6 },
  lockedIn:          { aura: 10,  emoji: '🔒', text: '25 minutes locked in', daily: 8 },
  nightOwl:          { aura: 5,   emoji: '🦉', text: 'Coding after midnight. Built different.', daily: 1 },
  debuggerLeft:      { aura: -5,  emoji: '🐛', text: 'Left a debugger statement in {file}', daily: 1, roast: true },
  streak:            { aura: 0,   emoji: '🔥', text: '{n}-day streak', daily: 1 },
};

export interface Rank { name: string; emoji: string; min: number; vibe: string }
export const RANKS: Rank[] = [
  { name: 'NPC',            emoji: '🧍', min: 0,     vibe: 'Just spawned in.' },
  { name: 'Side Character', emoji: '🎭', min: 100,   vibe: 'Getting some screen time.' },
  { name: 'Main Character', emoji: '✨', min: 300,   vibe: 'The plot revolves around you now.' },
  { name: 'Locked In',      emoji: '🔒', min: 700,   vibe: 'Do not disturb. Seriously.' },
  { name: 'Sigma',          emoji: '🗿', min: 1500,  vibe: 'Ships in silence.' },
  { name: 'Aura Farmer',    emoji: '🌾', min: 3000,  vibe: 'Harvesting aura daily.' },
  { name: 'Goated',         emoji: '🐐', min: 6000,  vibe: 'The GOAT conversation includes you.' },
  { name: 'Final Boss',     emoji: '👑', min: 10000, vibe: 'Other devs fear this energy.' },
];
const NEGATIVE: Rank = { name: 'Negative Aura', emoji: '☠️', min: -Infinity, vibe: 'It can only go up from here.' };

/** The rank for a total, the next one, and how far along you are (0..1). */
export function rankFor(total: number): { rank: Rank; next?: Rank; progress: number } {
  if (total < 0) return { rank: NEGATIVE, next: RANKS[0], progress: 0 };
  let i = 0;
  while (i + 1 < RANKS.length && total >= RANKS[i + 1].min) i++;
  const rank = RANKS[i], next = RANKS[i + 1];
  return { rank, next, progress: next ? (total - rank.min) / (next.min - rank.min) : 1 };
}

export interface AuraEvent { t: number; id: MoveId; aura: number; text: string; emoji: string }

export interface AuraState {
  total: number;
  /** Aura gained (or lost) per local day, "2026-11-21" → n. */
  days: Record<string, number>;
  streak: number;
  bestStreak: number;
  lastDay: string;
  /** Per-day counters for the daily limits: "2026-11-21|commit" → n. */
  counts: Record<string, number>;
  /** Newest last. */
  events: AuraEvent[];
  /** Minutes with edits today (for "locked in"). */
  activeMinutes: Record<string, number>;
}

export const MAX_EVENTS = 200;

export const emptyState = (): AuraState => ({ total: 0, days: {}, streak: 0, bestStreak: 0, lastDay: '', counts: {}, events: [], activeMinutes: {} });

/** A local date key, "2026-11-21". */
export function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const yesterday = (t: number) => { const d = new Date(t); d.setDate(d.getDate() - 1); return dayKey(d.getTime()); };

const fill = (text: string, vars: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

export interface Awarded { state: AuraState; events: AuraEvent[]; rankUp?: Rank }

/**
 * Gives (or takes) the aura for a move. Returns the new state and what happened: nothing when the daily limit for
 * that move (per `key`, e.g. per file) is used up, or for a roast when roast mode is off. The first move of a day
 * also keeps the streak going, with a bonus of 5 aura per streak day (up to 50).
 */
export function award(prev: AuraState, id: MoveId, t: number, vars: Record<string, string | number> = {}, opts: { roast?: boolean; key?: string } = {}): Awarded {
  const move = MOVES[id];
  if (move.roast && opts.roast === false) return { state: prev, events: [] };
  const day = dayKey(t);
  const countKey = `${day}|${id}${opts.key ? `|${opts.key}` : ''}`;
  if ((prev.counts[countKey] ?? 0) >= move.daily) return { state: prev, events: [] };

  const state: AuraState = { ...prev, days: { ...prev.days }, counts: { ...prev.counts }, events: [...prev.events] };
  const events: AuraEvent[] = [];
  const add = (mid: MoveId, aura: number, text: string) => {
    state.total += aura;
    state.days[day] = (state.days[day] ?? 0) + aura;
    const e = { t, id: mid, aura, text, emoji: MOVES[mid].emoji };
    state.events.push(e); events.push(e);
  };

  // Streak: a day counts once you do something good in it.
  if (move.aura > 0 && state.lastDay !== day) {
    state.streak = state.lastDay === yesterday(t) ? state.streak + 1 : 1;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    state.lastDay = day;
    if (state.streak >= 2) add('streak', Math.min(50, state.streak * 5), fill(MOVES.streak.text, { n: state.streak }));
  }
  state.counts[countKey] = (state.counts[countKey] ?? 0) + 1;
  add(id, move.aura, fill(move.text, vars));
  if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS);
  // Keep a couple of months of days and counters.
  const cutoff = dayKey(t - 62 * 86400000);
  for (const k of Object.keys(state.days)) if (k < cutoff) delete state.days[k];
  for (const k of Object.keys(state.counts)) if (k.slice(0, 10) < day) delete state.counts[k];

  const before = rankFor(prev.total).rank, after = rankFor(state.total).rank;
  return { state, events, rankUp: after.min > before.min ? after : undefined };
}

/**
 * Counts an active minute (a minute with edits). Every 25th active minute of the day earns "locked in".
 * Returns the new state and the minute count for today.
 */
export function activeMinute(prev: AuraState, t: number): { state: AuraState; minutes: number; lockedIn: boolean } {
  const day = dayKey(t);
  const minutes = (prev.activeMinutes[day] ?? 0) + 1;
  const activeMinutes: Record<string, number> = { [day]: minutes };
  return { state: { ...prev, activeMinutes }, minutes, lockedIn: minutes % 25 === 0 };
}

/** Is it the middle of the night (midnight to 4 am)? */
export const isNight = (t: number) => new Date(t).getHours() < 4;

const BAD_MESSAGES = /^(wip|fix|fixes|fixed|update|updates|changes|change|stuff|asdf+|test|tests|commit|minor|idk|temp|tmp|misc|done|final|ok|oops|lol|\.+|-+|x+|a+|aaa+|f+)$/i;
const CONVENTIONAL = /^(feat|fix|docs|refactor|perf|test|tests|chore|build|ci|style|revert)(\([^)]+\))?!?: \S.{5,}/i;
/** "good" (conventional or descriptive), "bad" (says nothing), or "ok". */
export function judgeCommitMessage(message: string): 'good' | 'bad' | 'ok' {
  const first = (message.split('\n')[0] ?? '').trim();
  if (first.length < 4 || BAD_MESSAGES.test(first)) return 'bad';
  if (CONVENTIONAL.test(first)) return 'good';
  if (first.length >= 20 && first.split(/\s+/).length >= 4) return 'good';
  return 'ok';
}

/** What a terminal command is, for aura: tests, a build, a force push, or nothing we score. */
export function classifyCommand(commandLine: string): 'test' | 'build' | 'forcePush' | undefined {
  const c = commandLine.trim();
  if (/\bgit\s+push\b/.test(c)) {
    if (/--force-with-lease\b/.test(c)) return undefined; // the careful way: no roast
    return /(\s--force\b|\s-f\b|\s\+\S)/.test(c) ? 'forcePush' : undefined;
  }
  if (/\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|\b(npm\s+t)\b|\b(jest|vitest|mocha|pytest|phpunit|rspec|ava)\b|\bgo\s+test\b|\bcargo\s+test\b|\bdotnet\s+test\b|\bplaywright\s+test\b|\bgradlew?\s+test\b|\bmvn\s+test\b/.test(c)) return 'test';
  if (/\b(npm|pnpm|yarn|bun)\s+(run\s+)?build\b|\btsc\b|\bcargo\s+build\b|\bgo\s+build\b|\bdotnet\s+build\b|\bmvn\s+(package|install)\b|\bgradlew?\s+(build|assemble)\b|\bmake\b|\bnext\s+build\b|\bvite\s+build\b/.test(c)) return 'build';
  return undefined;
}

/** Does this code contain a debugger statement on its own line (JavaScript / TypeScript)? */
export const hasDebugger = (text: string) => /^\s*debugger\s*;?\s*$/m.test(text);

/** The last 7 days, oldest first: { day: "Mon", aura }. */
export function lastWeek(state: AuraState, t: number): { day: string; key: string; aura: number }[] {
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(t); d.setDate(d.getDate() - i);
    const key = dayKey(d.getTime());
    out.push({ key, day: d.toLocaleDateString('en', { weekday: 'short' }), aura: state.days[key] ?? 0 });
  }
  return out;
}

/** Your best moves of the last 7 days: the moves that earned the most, by kind. */
export function topMoves(state: AuraState, t: number, count = 3): { emoji: string; label: string; aura: number; times: number }[] {
  const since = t - 7 * 86400000;
  const by = new Map<MoveId, { aura: number; times: number }>();
  for (const e of state.events) {
    if (e.t < since || e.aura <= 0 || e.id === 'streak') continue;
    const s = by.get(e.id) ?? { aura: 0, times: 0 };
    s.aura += e.aura; s.times++; by.set(e.id, s);
  }
  const LABELS: Partial<Record<MoveId, string>> = {
    clearedErrors: 'Errors cleared', cleanSave: 'Clean saves', commit: 'Commits', goodCommitMessage: 'Fire commit messages',
    testsPassed: 'Test runs passed', buildPassed: 'Builds passed', deletedLines: 'Big deletes', lockedIn: 'Locked-in sessions', nightOwl: 'Late nights',
  };
  return [...by.entries()].sort((a, b) => b[1].aura - a[1].aura).slice(0, count)
    .map(([id, s]) => ({ emoji: MOVES[id].emoji, label: LABELS[id] ?? id, aura: s.aura, times: s.times }));
}

export const fmt = (n: number) => (n < 0 ? '−' : '') + Math.abs(Math.round(n)).toLocaleString('en');
export const signed = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n).toLocaleString('en');

/** The text to post with the aura card. */
export function caption(state: AuraState, t: number): string {
  const { rank } = rankFor(state.total);
  const week = lastWeek(state, t).reduce((s, d) => s + d.aura, 0);
  const streak = state.streak >= 2 && state.lastDay >= dayKey(t - 86400000) ? ` · 🔥 ${state.streak}-day streak` : '';
  return `My code aura: ${fmt(state.total)} (${rank.name} ${rank.emoji})${streak} · ${signed(week)} this week. Built different. #VeyraAura #coding\nveyraeditor.com/aura`;
}

/** The streak still alive today or yesterday, else 0. */
export const liveStreak = (state: AuraState, t: number) => (state.lastDay === dayKey(t) || state.lastDay === yesterday(t) ? state.streak : 0);
