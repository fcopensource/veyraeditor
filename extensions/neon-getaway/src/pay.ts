/** Paychecks: saving files in VS Code earns in-game cash, $25 a save, up to $1,000 a day. */

export interface PayState {
  /** Cash earned but not yet handed to the game. */
  pending: number;
  /** The local day the daily total belongs to, like 2026-11-24. */
  day: string;
  earnedToday: number;
  /** When the last paid save happened (ms). Saves closer together than MIN_GAP_MS (autosave, save-all) count once. */
  lastAt: number;
}

export const PER_SAVE = 25;
export const DAILY_CAP = 1000;
export const MIN_GAP_MS = 5000;
export const EMPTY: PayState = { pending: 0, day: '', earnedToday: 0, lastAt: 0 };

export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** A file was saved: the new state, and how much it paid (0 when capped or too soon after the last one). */
export function onSave(state: PayState, now: Date): { state: PayState; paid: number } {
  const s = { ...EMPTY, ...state };
  const day = dayKey(now);
  if (s.day !== day) { s.day = day; s.earnedToday = 0; }
  if (now.getTime() - s.lastAt < MIN_GAP_MS) return { state: s, paid: 0 };
  const paid = Math.max(0, Math.min(PER_SAVE, DAILY_CAP - s.earnedToday));
  if (!paid) return { state: s, paid: 0 };
  return { state: { ...s, pending: s.pending + paid, earnedToday: s.earnedToday + paid, lastAt: now.getTime() }, paid };
}

/** The game took `amount` of the pending cash. */
export function collected(state: PayState, amount: number): PayState {
  return { ...EMPTY, ...state, pending: Math.max(0, (state.pending || 0) - Math.max(0, amount)) };
}
