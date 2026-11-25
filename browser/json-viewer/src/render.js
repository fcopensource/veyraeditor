/*
 * JSON Viewer Veyra: the viewer. VJV.mount(host, options) draws the toolbar, the tree, the raw view and the path bar.
 * Every value from the page is put in with textContent, never as HTML, so a JSON document can't run anything.
 */
(function (root) {
  'use strict';
  const V = root.VJV;
  const CHUNK = 200; // array items and object keys shown at a time

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function button(label, title, onClick, cls) {
    const b = el('button', 'vjv-btn' + (cls ? ' ' + cls : ''), label);
    b.type = 'button'; b.title = title; b.setAttribute('aria-label', title);
    b.addEventListener('click', onClick);
    return b;
  }
  const keyOf = parts => JSON.stringify(parts);
  const isContainer = v => v !== null && typeof v === 'object' && !(v instanceof V.Num);

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back below */ }
    const t = el('textarea'); t.value = text; t.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(t); t.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
    t.remove(); return ok;
  }

  /**
   * Mounts the viewer into host.
   * options: { text, parsed, settings: {theme, indent, view}, saveSettings(s), title, original }
   */
  function mount(host, options) {
    const settings = Object.assign({ theme: 'auto', indent: 2, view: 'tree' }, options.settings || {});
    const parsed = options.parsed || V.parse(options.text);
    const value = parsed.ok ? parsed.value : undefined;
    const save = () => { try { options.saveSettings && options.saveSettings(settings); } catch { /* settings are a nicety */ } };
    let view = 'tree';     // which pane is showing: tree, raw or original
    let rawDirty = true;   // the raw pane needs redrawing (new indent)

    const rootEl = el('div', 'vjv');
    rootEl.dataset.theme = settings.theme;
    host.appendChild(rootEl);

    // ---- toolbar
    const bar = el('div', 'vjv-bar');
    const brand = el('span', 'vjv-brand', '{ } JSON Viewer');
    const tabs = el('div', 'vjv-tabs'); tabs.setAttribute('role', 'tablist');
    const tabTree = button('Tree', 'Show as a tree', () => show('tree'), 'vjv-tab');
    const tabRaw = button('Raw', 'Show formatted JSON', () => show('raw'), 'vjv-tab');
    const tabOrig = button('Original', 'Show the text as the page sent it', () => show('original'), 'vjv-tab');
    for (const t of [tabTree, tabRaw, tabOrig]) t.setAttribute('role', 'tab');
    tabs.append(tabTree, tabRaw, tabOrig);
    const searchBox = el('input', 'vjv-search');
    searchBox.type = 'search'; searchBox.placeholder = 'Search keys and values'; searchBox.setAttribute('aria-label', 'Search keys and values');
    const hitsLabel = el('span', 'vjv-hits');
    const prev = button('↑', 'Previous match (Shift+Enter)', () => step(-1));
    const next = button('↓', 'Next match (Enter)', () => step(1));
    const expandAll = button('Expand all', 'Open every level', () => openAll(true));
    const collapseAll = button('Collapse all', 'Close every level', () => openAll(false));
    const indentSel = el('select', 'vjv-select'); indentSel.title = 'Indentation for Raw, Copy and Download'; indentSel.setAttribute('aria-label', 'Indentation');
    for (const [v, l] of [['2', '2 spaces'], ['4', '4 spaces'], ['\t', 'Tabs'], ['0', 'One line']]) { const o = el('option', '', l); o.value = v; indentSel.appendChild(o); }
    indentSel.value = String(settings.indent);
    indentSel.addEventListener('change', () => { settings.indent = indentSel.value === '\t' ? '\t' : +indentSel.value; save(); rawDirty = true; if (view === 'raw') renderRaw(); });
    const copyAll = button('Copy', 'Copy the JSON', async () => flash(copyAll, await copyText(formatted()) ? 'Copied' : 'Copy failed'));
    const download = button('Download', 'Save as a .json file', () => {
      const url = URL.createObjectURL(new Blob([formatted()], { type: 'application/json' }));
      const a = el('a'); a.href = url; a.download = (options.title || 'data').replace(/[^\w.-]+/g, '_').replace(/(\.json)?$/i, '.json');
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    const themes = ['auto', 'dark', 'light'];
    const themeBtn = button('', 'Theme', () => { settings.theme = themes[(themes.indexOf(settings.theme) + 1) % 3]; rootEl.dataset.theme = settings.theme; themeBtn.textContent = themeLabel(); save(); });
    const themeLabel = () => settings.theme === 'auto' ? '◐ Auto' : settings.theme === 'dark' ? '● Dark' : '○ Light';
    themeBtn.textContent = themeLabel();
    const searchWrap = el('div', 'vjv-searchwrap'); searchWrap.append(searchBox, hitsLabel, prev, next);
    const tools = el('div', 'vjv-tools'); tools.append(expandAll, collapseAll, indentSel, copyAll, download, themeBtn);
    bar.append(brand, tabs, searchWrap, tools);
    rootEl.appendChild(bar);

    // ---- path bar
    const pathBar = el('div', 'vjv-pathbar');
    const pathText = el('code', 'vjv-path', '$');
    const copyPath = button('Copy path', 'Copy the path of the selected value', async () => flash(copyPath, await copyText(pathText.textContent) ? 'Copied' : 'Copy failed'));
    const copyValue = button('Copy value', 'Copy the selected value', async () => flash(copyValue, await copyText(selectedValueText()) ? 'Copied' : 'Copy failed'));
    const summary = el('span', 'vjv-summary');
    pathBar.append(pathText, summary, copyPath, copyValue);
    rootEl.appendChild(pathBar);

    const body = el('div', 'vjv-body');
    rootEl.appendChild(body);
    const treePane = el('div', 'vjv-tree'); treePane.setAttribute('role', 'tree'); treePane.tabIndex = 0;
    const rawPane = el('pre', 'vjv-raw');
    const origPane = el('pre', 'vjv-raw vjv-original');
    body.append(treePane, rawPane, origPane);

    function flash(btn, text) { const old = btn.textContent; btn.textContent = text; btn.disabled = true; setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 1200); }
    const formatted = () => parsed.ok ? V.stringify(value, settings.indent) : options.text;

    // ---- error: say where, and show the text with that line marked
    if (!parsed.ok) {
      const err = el('div', 'vjv-error');
      err.appendChild(el('b', '', 'This JSON has a mistake'));
      err.appendChild(el('span', '', parsed.where ? ` on line ${parsed.where.line}, column ${parsed.where.column}: ${parsed.error}` : `: ${parsed.error}`));
      rootEl.insertBefore(err, body);
      for (const b of [tabTree, tabRaw, expandAll, collapseAll, searchWrap, copyValue, copyPath, indentSel]) b.style.display = 'none';
      pathBar.style.display = 'none';
      const lines = options.text.split('\n');
      lines.forEach((line, i) => {
        const row = el('div', 'vjv-line' + (parsed.where && parsed.where.line === i + 1 ? ' vjv-line-bad' : ''));
        row.appendChild(el('span', 'vjv-ln', String(i + 1)));
        row.appendChild(el('span', '', line || ' '));
        origPane.appendChild(row);
      });
      show('original');
      const bad = origPane.querySelector('.vjv-line-bad');
      if (bad) setTimeout(() => bad.scrollIntoView({ block: 'center' }), 0);
      return { root: rootEl };
    }
    origPane.textContent = options.original ?? options.text;

    // ---- the tree, drawn lazily: a container's children are made the first time it opens
    const nodes = new Map(); // keyOf(parts) -> record
    const recOf = new WeakMap(); // a node's wrap or row element -> record
    let selected = null;
    const total = V.countNodes(value, 20000);

    function makeNode(key, v, parts, depth) {
      const rec = { parts, v, depth, open: false, built: false, shown: 0 };
      const wrap = el('div', 'vjv-node');
      const row = el('div', 'vjv-row'); row.setAttribute('role', 'treeitem'); row.tabIndex = -1;
      row.style.setProperty('--d', depth);
      rec.row = row; rec.wrap = wrap;
      const container = isContainer(v);
      const empty = container && (Array.isArray(v) ? !v.length : !Object.keys(v).length);
      const tog = el('span', 'vjv-tog' + (container && !empty ? '' : ' vjv-tog-none'), container && !empty ? '▸' : '');
      tog.setAttribute('aria-hidden', 'true');
      row.appendChild(tog);
      if (key !== null) {
        row.appendChild(el('span', typeof key === 'number' ? 'vjv-idx' : 'vjv-key', typeof key === 'number' ? String(key) : JSON.stringify(key)));
        row.appendChild(el('span', 'vjv-colon', ':'));
      }
      if (container) {
        const arr = Array.isArray(v);
        row.appendChild(el('span', 'vjv-brace', arr ? '[' : '{'));
        rec.more = el('span', 'vjv-more', empty ? '' : V.describe(v));
        row.appendChild(rec.more);
        rec.close = el('span', 'vjv-brace vjv-close', arr ? ']' : '}');
        row.appendChild(rec.close);
        if (!empty) {
          row.setAttribute('aria-expanded', 'false');
          rec.kids = el('div', 'vjv-kids'); rec.kids.setAttribute('role', 'group'); rec.kids.hidden = true;
          rec.end = el('div', 'vjv-row vjv-endrow'); rec.end.style.setProperty('--d', depth);
          rec.end.append(el('span', 'vjv-tog vjv-tog-none'), el('span', 'vjv-brace', arr ? ']' : '}'));
          rec.end.hidden = true;
          tog.addEventListener('click', e => { e.stopPropagation(); toggle(rec); });
          row.addEventListener('dblclick', e => { e.preventDefault(); toggle(rec); });
        }
      } else {
        row.appendChild(leaf(v));
      }
      row.addEventListener('click', () => select(rec));
      wrap.appendChild(row);
      if (rec.kids) wrap.append(rec.kids, rec.end);
      nodes.set(keyOf(parts), rec);
      recOf.set(wrap, rec); recOf.set(row, rec);
      return rec;
    }
    /** The child records of an open container, in order. */
    const childrenOf = rec => rec.kids ? [...rec.kids.children].map(c => recOf.get(c)).filter(Boolean) : [];

    function leaf(v) {
      const kind = V.kindOf(v);
      if (kind === 'string') {
        const s = el('span', 'vjv-str');
        const full = JSON.stringify(v);
        if (V.isLink(v)) {
          s.appendChild(document.createTextNode('"'));
          const a = el('a', 'vjv-link', v); a.href = v; a.target = '_blank'; a.rel = 'noopener noreferrer nofollow';
          a.addEventListener('click', e => e.stopPropagation());
          s.appendChild(a); s.appendChild(document.createTextNode('"'));
        } else if (full.length > 400) {
          const short = el('span', '', full.slice(0, 300) + '…');
          const more = el('button', 'vjv-showall', `show all ${v.length.toLocaleString('en')} characters`); more.type = 'button';
          more.addEventListener('click', e => { e.stopPropagation(); short.textContent = full; more.remove(); });
          s.append(short, more);
        } else s.textContent = full;
        return s;
      }
      return el('span', 'vjv-' + kind, kind === 'number' ? String(v) : JSON.stringify(v));
    }

    /** Adds the next CHUNK of a container's children, with a "show more" row if there are still more. */
    function build(rec, upTo) {
      const v = rec.v;
      const entries = Array.isArray(v) ? v : Object.keys(v);
      const count = entries.length;
      const until = Math.min(count, Math.max(rec.shown + CHUNK, upTo == null ? 0 : upTo + 1));
      if (rec.moreBtn) { rec.moreBtn.remove(); rec.moreBtn = null; }
      const frag = document.createDocumentFragment();
      for (let i = rec.shown; i < until; i++) {
        const k = Array.isArray(v) ? i : entries[i];
        frag.appendChild(makeNode(k, v[k], rec.parts.concat([k]), rec.depth + 1).wrap);
      }
      rec.kids.appendChild(frag);
      rec.shown = until; rec.built = true;
      if (until < count) {
        const left = count - until;
        rec.moreBtn = el('div', 'vjv-row vjv-morerow'); rec.moreBtn.style.setProperty('--d', rec.depth + 1);
        const b = el('button', 'vjv-showall', `Show ${Math.min(CHUNK, left).toLocaleString('en')} more of ${left.toLocaleString('en')}`); b.type = 'button';
        b.addEventListener('click', e => { e.stopPropagation(); build(rec); });
        rec.moreBtn.appendChild(b);
        rec.kids.appendChild(rec.moreBtn);
      }
    }

    function setOpen(rec, open) {
      if (!rec.kids || rec.open === open) return;
      if (open && !rec.built) build(rec);
      rec.open = open;
      rec.kids.hidden = !open; rec.end.hidden = !open;
      rec.more.hidden = open; rec.close.hidden = open;
      rec.row.setAttribute('aria-expanded', String(open));
      rec.row.firstChild.textContent = open ? '▾' : '▸';
    }
    const toggle = rec => setOpen(rec, !rec.open);

    function select(rec) {
      if (selected) { selected.row.classList.remove('vjv-sel'); selected.row.tabIndex = -1; }
      selected = rec;
      rec.row.classList.add('vjv-sel'); rec.row.tabIndex = 0;
      pathText.textContent = V.pathOf(rec.parts);
      summary.textContent = V.describe(rec.v);
    }
    const selectedValueText = () => selected ? (isContainer(selected.v) ? V.stringify(selected.v, settings.indent) : V.kindOf(selected.v) === 'string' ? selected.v : String(selected.v)) : formatted();

    /** Opens every container on the way to a path, building chunks as needed, and returns the record there. */
    function reveal(parts) {
      let rec = nodes.get(keyOf([]));
      for (let i = 0; i < parts.length; i++) {
        if (!rec.built || (typeof parts[i] === 'number' && parts[i] >= rec.shown) || (typeof parts[i] === 'string' && !nodes.has(keyOf(parts.slice(0, i + 1))))) {
          const idx = typeof parts[i] === 'number' ? parts[i] : Object.keys(rec.v).indexOf(parts[i]);
          build(rec, idx);
        }
        setOpen(rec, true);
        rec = nodes.get(keyOf(parts.slice(0, i + 1)));
        if (!rec) return null;
      }
      return rec;
    }

    function openAll(open) {
      if (open && total > 20000 && !confirm('This JSON is very large. Opening everything may take a while. Continue?')) return;
      (function walk(rec) {
        if (!rec.kids) return;
        if (open) { if (!rec.built) build(rec); while (rec.shown < (Array.isArray(rec.v) ? rec.v.length : Object.keys(rec.v).length) && rec.shown < 5000) build(rec); }
        setOpen(rec, open);
        for (const r of childrenOf(rec)) walk(r);
      })(rootRec);
      if (!open) setOpen(rootRec, true);
    }

    const rootRec = makeNode(null, value, [], 0);
    treePane.appendChild(rootRec.wrap);

    // open the first levels: everything when it's small, otherwise the top level and small children
    if (isContainer(value)) {
      setOpen(rootRec, true);
      const deep = total <= 300 ? 6 : 1;
      (function open(rec, d) {
        if (d >= deep) return;
        for (const r of childrenOf(rec)) {
          // the top level always opens (only the first 200 children are drawn); deeper, only small containers
          if (r.kids && (d === 0 || (Array.isArray(r.v) ? r.v.length : Object.keys(r.v).length) <= 50)) { setOpen(r, true); open(r, d + 1); }
        }
      })(rootRec, 0);
    }
    select(rootRec);

    // keyboard: up/down move, right/left open/close, Enter toggles
    treePane.addEventListener('keydown', e => {
      if (!selected) return;
      const rows = [...treePane.querySelectorAll('.vjv-row[role="treeitem"]')].filter(r => r.offsetParent !== null);
      const i = rows.indexOf(selected.row);
      const go = r => { const rec = recOf.get(r); if (rec) { select(rec); r.focus(); r.scrollIntoView({ block: 'nearest' }); } };
      if (e.key === 'ArrowDown' && i < rows.length - 1) { go(rows[i + 1]); e.preventDefault(); }
      else if (e.key === 'ArrowUp' && i > 0) { go(rows[i - 1]); e.preventDefault(); }
      else if (e.key === 'ArrowRight' && selected.kids) { setOpen(selected, true); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { if (selected.open) setOpen(selected, false); else if (selected.parts.length) go(nodes.get(keyOf(selected.parts.slice(0, -1))).row); e.preventDefault(); }
      else if (e.key === 'Enter' && selected.kids) { toggle(selected); e.preventDefault(); }
    });

    // ---- search
    let hits = [], at = -1, timer;
    function clearHits() { for (const r of treePane.querySelectorAll('.vjv-hit,.vjv-hit-now')) r.classList.remove('vjv-hit', 'vjv-hit-now'); }
    function runSearch() {
      clearHits();
      hits = V.search(value, searchBox.value, 2000); at = -1;
      if (!searchBox.value.trim()) { hitsLabel.textContent = ''; return; }
      if (!hits.length) { hitsLabel.textContent = 'No matches'; return; }
      if (view !== 'tree') show('tree');
      for (const p of hits.slice(0, 300)) { const r = reveal(p); if (r) r.row.classList.add('vjv-hit'); }
      step(1);
    }
    function step(dir) {
      if (!hits.length) return;
      at = (at + dir + hits.length) % hits.length;
      treePane.querySelector('.vjv-hit-now')?.classList.remove('vjv-hit-now');
      const rec = reveal(hits[at]);
      if (rec) { rec.row.classList.add('vjv-hit', 'vjv-hit-now'); select(rec); rec.row.scrollIntoView({ block: 'center' }); }
      hitsLabel.textContent = `${at + 1} of ${hits.length}${hits.length >= 2000 ? '+' : ''}`;
    }
    searchBox.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(runSearch, 220); });
    searchBox.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); } if (e.key === 'Escape') { searchBox.value = ''; runSearch(); } });
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && view !== 'original') { e.preventDefault(); searchBox.focus(); searchBox.select(); }
    });

    // ---- raw view, coloured (plain above 3 MB, to stay fast)
    function renderRaw() {
      if (!rawDirty) return;
      rawDirty = false;
      const text = V.stringify(value, settings.indent === 0 ? 2 : settings.indent);
      rawPane.textContent = '';
      if (text.length > 3e6) { rawPane.textContent = text; return; }
      const frag = document.createDocumentFragment();
      for (const [type, t] of V.tokenize(text)) {
        if (type === 'space' || type === 'punct') frag.appendChild(document.createTextNode(t));
        else frag.appendChild(el('span', 'vjv-t-' + type, t));
      }
      rawPane.appendChild(frag);
    }

    function show(which) {
      view = which;
      treePane.hidden = which !== 'tree'; rawPane.hidden = which !== 'raw'; origPane.hidden = which !== 'original';
      for (const [t, w] of [[tabTree, 'tree'], [tabRaw, 'raw'], [tabOrig, 'original']]) { t.classList.toggle('vjv-on', w === which); t.setAttribute('aria-selected', String(w === which)); }
      expandAll.disabled = collapseAll.disabled = which !== 'tree';
      if (which === 'raw') renderRaw();
      if (parsed.ok && settings.view !== which && which !== 'original') { settings.view = which; save(); }
    }
    show(settings.view === 'raw' ? 'raw' : 'tree');

    return { root: rootEl, reveal, select, nodes, search: q => { searchBox.value = q; runSearch(); }, show };
  }

  root.VJV = Object.assign(root.VJV || {}, { mount });
})(typeof self !== 'undefined' ? self : this);
