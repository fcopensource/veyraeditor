/*
 * JSON Viewer Veyra: turns a page that is only JSON into the viewer. On every other page it stops at once:
 * a web page is text/html, and the browser shows JSON as one <pre> and nothing else.
 */
(function () {
  'use strict';
  const V = window.VJV;
  if (!V || document.documentElement.classList.contains('vjv-page')) return;
  const type = (document.contentType || '').toLowerCase();
  const jsonType = V.isJsonType(type);
  if (!jsonType && type !== 'text/plain') return;
  const body = document.body;
  if (!body) return;
  // Chrome shows a JSON response as <pre>text</pre>, plus its own small "Pretty-print" box in newer versions.
  const pre = body.querySelector(':scope > pre');
  if (!pre) return;
  const builtIn = [...body.children].filter(e => e !== pre);
  if (builtIn.some(e => !e.classList.contains('json-formatter-container'))) return;
  const text = pre.textContent || '';
  if (text.length > 60 * 1024 * 1024) return; // over 60 MB: leave it to the browser
  if (!jsonType && !V.looksLikeJson(text)) return;
  const parsed = V.parse(text);
  if (!parsed.ok && !jsonType) return; // plain text that only looked like JSON

  const KEY = 'vjvSettings';
  const storage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync;
  const start = settings => {
    pre.hidden = true; pre.style.display = 'none';
    for (const e of builtIn) e.style.display = 'none';
    document.documentElement.classList.add('vjv-page');
    const host = document.createElement('div');
    host.className = 'vjv-host';
    body.appendChild(host);
    const name = decodeURIComponent((location.pathname.split('/').pop() || location.hostname || 'data').replace(/\.json$/i, ''));
    V.mount(host, { text, parsed, settings, title: name, saveSettings: s => storage && storage.set({ [KEY]: s }) });
  };
  if (storage) storage.get(KEY).then(r => start(r && r[KEY]), () => start()); else start();
})();
