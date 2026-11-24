import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { onSave, collected, EMPTY, DAILY_CAP, PER_SAVE } = require('../out/pay.js');

const at = (h, m, s = 0, day = 24) => new Date(2026, 10, day, h, m, s);

test('each save pays $25', () => {
  const { state, paid } = onSave(EMPTY, at(9, 0));
  assert.equal(paid, PER_SAVE);
  assert.equal(state.pending, 25);
});

test('saves seconds apart (autosave, save all) pay once', () => {
  let s = onSave(EMPTY, at(9, 0, 0)).state;
  const second = onSave(s, at(9, 0, 2));
  assert.equal(second.paid, 0);
  s = onSave(second.state, at(9, 0, 6)).state;
  assert.equal(s.pending, 50);
});

test('a day pays at most $1,000, and the next day starts fresh', () => {
  let s = EMPTY;
  for (let k = 0; k < 60; k++) s = onSave(s, at(9, k)).state;
  assert.equal(s.earnedToday, DAILY_CAP);
  assert.equal(s.pending, DAILY_CAP);
  const tomorrow = onSave(s, at(9, 0, 0, 25));
  assert.equal(tomorrow.paid, 25);
  assert.equal(tomorrow.state.earnedToday, 25);
});

test('the game collecting cash takes it out of pending', () => {
  let s = onSave(EMPTY, at(9, 0)).state;
  s = onSave(s, at(9, 1)).state;
  assert.equal(collected(s, 50).pending, 0);
  assert.equal(collected(s, 999).pending, 0);
  assert.equal(collected(s, -5).pending, 50);
});
