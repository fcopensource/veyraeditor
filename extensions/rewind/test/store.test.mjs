import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const { Store } = createRequire(import.meta.url)("../out/store.js");

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), "rewind-store-"));
const limits = { interval: 30_000, maxCount: 500, maxAgeDays: 30, maxFileSize: 1024 * 1024 };

test("captures, reads back and de-duplicates snapshots", async () => {
  const dir = temp(), store = new Store(dir, limits), file = path.join(dir, "app.ts");
  const first = await store.capture(file, "const a = 1;\n", "open", undefined, 1_000);
  assert.equal(first.reason, "open"); assert.equal(first.added, 1);
  assert.equal(await store.capture(file, "const a = 1;\n", "save", undefined, 2_000), undefined, "unchanged");
  const second = await store.capture(file, "const a = 2;\nconst b = 3;\n", "save", undefined, 3_000);
  assert.deepEqual([second.added, second.removed, second.lines], [2, 1, 2]);
  assert.equal(await store.capture(file, "typing…", "edit", undefined, 10_000), undefined, "typing waits for the interval");
  assert.ok(await store.capture(file, "typing…", "edit", undefined, 40_000));
  assert.equal(await store.read(first.hash), "const a = 1;\n");
  // A fresh store reads the same history from disk.
  const again = new Store(dir, limits);
  assert.deepEqual((await again.history(file)).entries.map(e => e.reason), ["open", "save", "edit"]);
  assert.equal(await again.read(second.hash), "const a = 2;\nconst b = 3;\n");
  // Identical content shares one blob.
  const other = path.join(dir, "copy.ts");
  await store.capture(other, "const a = 1;\n", "open", undefined, 50_000);
  assert.equal(fs.readdirSync(path.join(dir, "blobs")).length, 3);
});

test("checkpoints, renaming, moving files and clearing", async () => {
  const dir = temp(), store = new Store(dir, limits), file = path.join(dir, "a.ts"), moved = path.join(dir, "b.ts");
  const one = await store.capture(file, "v1", "save", undefined, 1_000);
  const named = await store.capture(file, "v1", "checkpoint", "Before refactor", 2_000);
  assert.equal(named.label, "Before refactor", "a checkpoint of unchanged text still counts");
  await store.rename(file, one.id, "First draft");
  assert.deepEqual((await store.history(file)).entries.map(e => e.label), ["First draft", "Before refactor"]);
  await store.move(file, moved);
  assert.equal((await store.history(file)).entries.length, 0);
  assert.equal((await new Store(dir, limits).history(moved)).entries.length, 2, "history follows a renamed file");
  assert.deepEqual((await store.all()).map(h => h.path), [moved]);
  await store.clear(moved);
  assert.deepEqual(await store.all(), []);
  assert.equal(fs.readdirSync(path.join(dir, "blobs")).length, 0, "unused blobs are removed");
});

test("skips binary and oversized files, and survives many quick saves", async () => {
  const dir = temp(), store = new Store(dir, { ...limits, maxFileSize: 100 }), file = path.join(dir, "x.bin");
  assert.equal(await store.capture(file, "a\u0000b", "save"), undefined);
  assert.equal(await store.capture(file, "x".repeat(200), "save"), undefined);
  const busy = new Store(dir, limits), f = path.join(dir, "busy.ts");
  await Promise.all(Array.from({ length: 25 }, (_, i) => busy.capture(f, "version " + i, "save", undefined, 1_000 + i)));
  const entries = (await new Store(dir, limits).history(f)).entries;
  assert.equal(entries.length, 25, "no save is lost when they arrive together");
  assert.ok(await busy.size() > 0);
});
