// Veyra Env: the Compare panel. Values arrive masked; a real value is asked for only when you reveal a cell.
(function () {
  "use strict";
  const vscode = acquireVsCodeApi();
  const app = document.getElementById("app");
  const logo = document.body.dataset.logo;
  const S = { files: [], rows: [], filter: "", only: false, revealed: new Map() };

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "class") el.className = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) if (c !== undefined && c !== null && c !== false) el.append(c instanceof Node ? c : String(c));
    return el;
  }
  let toastTimer;
  function toast(text) {
    document.querySelector(".toast")?.remove();
    const el = h("div", { class: "toast", role: "status" }, text);
    document.body.append(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), 2400);
  }

  /** "missing" when a non-template file lacks it, "differs" when values differ between .env files. */
  function status(row) {
    const real = row.cells.map((c, i) => ({ c, f: S.files[i] })).filter(x => !x.f.template);
    if (real.some(x => !x.c.set)) return "missing";
    const values = new Set(real.filter(x => x.c.set && !x.c.empty).map(x => x.c.hash));
    if (real.some(x => x.c.set && x.c.empty)) return "empty";
    return values.size > 1 ? "differs" : "same";
  }
  const key = (file, name) => `${file}\u0000${name}`;

  function render() {
    const rows = S.rows
      .map(r => ({ ...r, status: status(r) }))
      .filter(r => (!S.filter || r.name.toLowerCase().includes(S.filter)) && (!S.only || r.status !== "same"));
    const counts = S.rows.reduce((a, r) => { const s = status(r); a[s] = (a[s] || 0) + 1; return a; }, {});
    const head = h("header", { class: "head" },
      h("img", { src: logo, alt: "", class: "logo" }),
      h("div", {}, h("h1", {}, "Compare Env Files"), h("div", { class: "muted" }, `${S.rows.length} variables in ${S.files.length} files`)),
      h("div", { class: "grow" }),
      h("div", { class: "pills" },
        counts.missing ? h("span", { class: "pill missing" }, `${counts.missing} missing`) : null,
        counts.differs ? h("span", { class: "pill differs" }, `${counts.differs} different`) : null,
        counts.empty ? h("span", { class: "pill empty" }, `${counts.empty} empty`) : null,
        !counts.missing && !counts.differs && !counts.empty && S.rows.length ? h("span", { class: "pill ok" }, "All in sync") : null));
    const tools = h("div", { class: "tools" },
      h("input", { class: "search", type: "search", placeholder: "Filter variables", value: S.filter, oninput: e => { S.filter = e.target.value.toLowerCase(); renderTable(); } }),
      h("label", { class: "check" }, h("input", { type: "checkbox", checked: S.only, onchange: e => { S.only = e.target.checked; renderTable(); } }), "Only missing and different"));
    const tableWrap = h("div", { class: "table-wrap" });
    app.replaceChildren(head, tools, tableWrap);
    renderTable();

    function renderTable() {
      const shown = S.rows.map(r => ({ ...r, status: status(r) })).filter(r => (!S.filter || r.name.toLowerCase().includes(S.filter)) && (!S.only || r.status !== "same"));
      if (!S.files.length) { tableWrap.replaceChildren(h("p", { class: "muted pad" }, "No .env files in this folder.")); return; }
      const table = h("table", {},
        h("thead", {}, h("tr", {}, h("th", { class: "name" }, "Variable"),
          ...S.files.map(f => h("th", { class: f.template ? "template" : "" },
            h("div", { class: "fname" }, f.name, f.exposed ? h("span", { class: "warn-dot", title: "Not ignored by git" }, "!") : null),
            h("small", {}, [f.folder, f.template ? "template" : ""].filter(Boolean).join(" · ") || " "))))),
        h("tbody", {}, ...shown.map(row => h("tr", { class: row.status },
          h("td", { class: "name" }, h("span", {}, row.name), row.status !== "same" ? h("span", { class: `tag ${row.status}` }, row.status === "differs" ? "different" : row.status) : null),
          ...row.cells.map((c, i) => cell(row, c, S.files[i]))))));
      tableWrap.replaceChildren(shown.length ? table : h("p", { class: "muted pad" }, S.rows.length ? "Nothing matches." : "The env files have no variables yet."));
    }
    void rows;
  }

  function cell(row, c, f) {
    if (!c.set) {
      return h("td", { class: "cell absent" },
        h("span", { class: "muted" }, "not set"),
        h("button", { class: "link", title: f.template ? `Add ${row.name} to ${f.name} without a value` : `Add ${row.name} to ${f.name}`, onclick: () => vscode.postMessage({ type: "add", file: f.id, name: row.name, withValue: false }) }, "+ Add"));
    }
    const k = key(f.id, row.name);
    const real = S.revealed.get(k);
    const text = c.empty ? "" : real !== undefined ? real : c.shown;
    return h("td", { class: `cell ${c.empty ? "is-empty" : ""}` },
      h("span", { class: `value ${c.secret && real === undefined ? "masked" : ""}`, title: "Open in the file", onclick: () => vscode.postMessage({ type: "open", file: f.id, line: c.line }) }, c.empty ? h("em", { class: "muted" }, f.template ? "listed" : "empty") : text),
      c.secret && !c.empty ? h("button", { class: "icon", title: real === undefined ? "Show value" : "Hide value", onclick: () => {
        if (real === undefined) vscode.postMessage({ type: "reveal", file: f.id, name: row.name });
        else { S.revealed.delete(k); render(); }
      } }, real === undefined ? "👁" : "◌") : null,
      !c.empty ? h("button", { class: "icon", title: "Copy value", onclick: () => vscode.postMessage({ type: "copy", file: f.id, name: row.name }) }, "⧉") : null);
  }

  window.addEventListener("message", ({ data: msg }) => {
    switch (msg.type) {
      case "data": S.files = msg.files; S.rows = msg.rows; render(); break;
      case "revealed": S.revealed.set(key(msg.file, msg.name), msg.value); render(); break;
      case "toast": toast(msg.text); break;
    }
  });
  render();
  vscode.postMessage({ type: "ready" });
})();
