'use strict';
/*
 * Veyra Live Values: the runtime hook.
 *
 * VS Code terminals prepared by the extension start Node with NODE_OPTIONS="--require <this file>". The hook wraps
 * console.log / info / warn / error / debug / trace and records each call with the file and line that made it, plus
 * crashes, into a local file (VEYRA_LIVE_FILE) that the extension reads. Nothing leaves the computer.
 *
 * It only records calls made from your own code (inside VEYRA_LIVE_ROOTS, outside node_modules), never changes what
 * your program prints, and does nothing at all when VEYRA_LIVE_FILE is not set.
 */
(function () {
  const target = process.env.VEYRA_LIVE_FILE;
  if (!target || global.__veyraLiveValues) return;
  Object.defineProperty(global, '__veyraLiveValues', { value: true });

  const fs = require('fs');
  const path = require('path');
  const util = require('util');
  const { fileURLToPath } = require('url');

  // Stack traces point at your .ts source, not the compiled .js, when source maps exist (tsx, ts-node, tsc --sourceMap).
  try { if (typeof process.setSourceMapsEnabled === 'function') process.setSourceMapsEnabled(true); } catch { /* older Node */ }

  const windows = process.platform === 'win32';
  const norm = p => { const r = path.resolve(p); return windows ? r.toLowerCase() : r; };
  const roots = (process.env.VEYRA_LIVE_ROOTS || '').split(path.delimiter).filter(Boolean).map(r => norm(r) + path.sep);
  const self = norm(__filename);
  const SHORT = { depth: 2, breakLength: Infinity, compact: true, maxArrayLength: 12, maxStringLength: 240, colors: false };
  const FULL = { depth: 6, breakLength: 90, maxArrayLength: 100, maxStringLength: 4000, colors: false };

  /** The first frame of a stack that belongs to the user's code: { file, line, col } (1-based line and column). */
  function userFrame(stack) {
    if (typeof stack !== 'string') return null;
    for (const raw of stack.split('\n')) {
      const m = /^\s*at (?:.*? \()?(.+?):(\d+):(\d+)\)?\s*$/.exec(raw);
      if (!m) continue;
      let file = m[1];
      if (file.startsWith('file://')) { try { file = fileURLToPath(file); } catch { continue; } }
      if (file.startsWith('node:') || !path.isAbsolute(file)) continue;
      const key = norm(file);
      if (key === self || /[\\/]node_modules[\\/]/.test(key)) continue;
      if (roots.length && !roots.some(r => key.startsWith(r))) continue;
      return { file: path.resolve(file), line: Number(m[2]), col: Number(m[3]) };
    }
    return null;
  }

  const oneLine = s => s.replace(/\s*\n\s*/g, ' ⏎ ');
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  let queue = [];
  let timer = null;
  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!queue.length) return;
    const text = queue.join('');
    queue = [];
    try { fs.appendFileSync(target, text); } catch { /* the extension closed: drop it */ }
  }
  function push(record) {
    queue.push(JSON.stringify(record) + '\n');
    if (queue.length >= 200) flush();
    else if (!timer) { timer = setTimeout(flush, 25); if (timer.unref) timer.unref(); }
  }

  let busy = false; // a custom inspect() that logs must not record itself
  function record(level, args, stack) {
    if (busy) return;
    busy = true;
    try {
      const at = userFrame(stack);
      if (!at) return;
      const text = clip(oneLine(util.formatWithOptions(SHORT, ...args)), 600);
      const full = clip(util.formatWithOptions(FULL, ...args), 8000);
      const last = args[args.length - 1];
      const num = typeof last === 'number' && Number.isFinite(last) ? last : undefined;
      push({ v: 1, t: Date.now(), pid: process.pid, level, file: at.file, line: at.line, col: at.col, text, full, num });
    } catch { /* never break the program */ }
    finally { busy = false; }
  }

  for (const level of ['log', 'info', 'warn', 'error', 'debug', 'trace']) {
    const original = console[level];
    if (typeof original !== 'function') continue;
    const wrapped = function (...args) {
      record(level === 'trace' ? 'log' : level, args, new Error().stack);
      return original.apply(this, args);
    };
    Object.defineProperty(wrapped, 'name', { value: original.name });
    console[level] = wrapped;
  }

  // Crashes: an uncaught exception or unhandled rejection, at the line that threw. Monitoring only: Node still
  // prints the error and exits exactly as it would without the hook.
  process.on('uncaughtExceptionMonitor', (error, origin) => {
    try {
      const stack = error && typeof error === 'object' ? String(error.stack || '') : '';
      const at = userFrame(stack);
      if (at) {
        const name = error instanceof Error ? `${error.name}: ${error.message}` : util.inspect(error, SHORT);
        push({ v: 1, t: Date.now(), pid: process.pid, level: 'crash', origin, file: at.file, line: at.line, col: at.col,
          text: clip(oneLine(name), 600), full: clip(stack || name, 8000) });
      }
    } catch { /* ignore */ }
    flush();
  });
  process.on('exit', flush);
})();
