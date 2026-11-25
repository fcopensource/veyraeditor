// JSON Viewer Veyra: the page behind the toolbar button. Paste JSON, drop a file or open one, and view it.
(function () {
  'use strict';
  const V = window.VJV;
  const $ = id => document.getElementById(id);
  const KEY = 'vjvSettings';
  const storage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync;
  // An example with a big number and a price written as 19.90: both are shown exactly as written.
  const SAMPLE = [
    '{',
    '  "store": "Neon Books",',
    '  "open": true,',
    '  "rating": 4.8,',
    '  "orderId": 9007199254740993123,',
    '  "price": 19.90,',
    '  "tags": ["books", "coffee"],',
    '  "owner": { "name": "Ada", "site": "https://example.com" },',
    '  "hours": [',
    '    { "day": "Mon", "from": "09:00", "to": "18:00" },',
    '    { "day": "Sat", "from": "10:00", "to": "16:00" }',
    '  ],',
    '  "closedOn": null',
    '}',
  ].join('\n');

  async function show(text, title) {
    let settings;
    try { settings = storage ? (await storage.get(KEY))[KEY] : undefined; } catch { settings = undefined; }
    $('start').hidden = true;
    document.documentElement.classList.add('vjv-page');
    const out = $('out'); out.textContent = '';
    const back = document.createElement('button'); back.type = 'button'; back.className = 'vjv-back'; back.textContent = '← New';
    back.addEventListener('click', () => { out.textContent = ''; $('start').hidden = false; document.documentElement.classList.remove('vjv-page'); $('input').focus(); });
    V.mount(out, { text, settings, title: title || 'data', saveSettings: s => storage && storage.set({ [KEY]: s }) });
    out.querySelector('.vjv-bar')?.prepend(back);
  }
  const readFile = file => file && file.text().then(t => show(t, file.name.replace(/\.[^.]+$/, '')));

  $('view').addEventListener('click', () => { const t = $('input').value; if (t.trim()) show(t); else $('input').focus(); });
  $('sample').addEventListener('click', () => { $('input').value = SAMPLE; show(SAMPLE, 'example'); });
  $('file').addEventListener('change', e => readFile(e.target.files[0]));
  $('input').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) $('view').click(); });
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => { e.preventDefault(); readFile(e.dataTransfer.files[0]); });
  document.addEventListener('paste', e => {
    if (!$('start').hidden && document.activeElement !== $('input')) { const t = e.clipboardData.getData('text'); if (t.trim()) { $('input').value = t; show(t); } }
  });
  $('input').focus();
})();
