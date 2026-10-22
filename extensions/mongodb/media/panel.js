// Veyra Query Lens for MongoDB: the Query details panel and Index Doctor.
(function () {
  "use strict";
  const vscode = acquireVsCodeApi();
  const app = document.getElementById("app");
  const mode = document.body.dataset.mode;
  const logo = document.body.dataset.logo;
  const send = msg => vscode.postMessage(msg);

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
  const n = x => Number(x || 0).toLocaleString("en-US");
  const size = b => { if (b === undefined || b === null) return "–"; if (!b) return "0 B"; const u = ["B", "KB", "MB", "GB", "TB"]; const i = Math.min(4, Math.floor(Math.log10(b) / 3)); const v = b / 1000 ** i; return `${v >= 100 || !i ? Math.round(v) : v.toFixed(1)} ${u[i]}`; };
  let toastTimer;
  function toast(text, kind) {
    document.querySelector(".toast")?.remove();
    const el = h("div", { class: `toast ${kind || ""}`, role: "status" }, text);
    document.body.append(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), kind === "error" ? 7000 : 2400);
  }
  const badge = level => h("span", { class: `badge ${level}` }, level === "good" ? "✓ Good" : level === "warning" ? "⚠ Needs an index" : "ℹ Worth a look");
  /** Code tabs: Mongoose, Node.js, Python, mongosh. */
  function codeTabs(code) {
    const tabs = [["mongoose", "Mongoose"], ["node", "Node.js"], ["python", "Python"], ["mongosh", "mongosh"]];
    let active = "mongoose";
    const pre = h("pre", { class: "code" });
    const bar = h("div", { class: "tabs" });
    const render = () => {
      bar.replaceChildren(...tabs.map(([id, label]) => h("button", { class: `tab ${id === active ? "on" : ""}`, onclick: () => { active = id; render(); } }, label)),
        h("button", { class: "btn small copy", onclick: () => send({ type: "copy", text: code[active] }) }, "Copy"));
      pre.textContent = code[active];
    };
    render();
    return h("div", { class: "codebox" }, bar, pre);
  }

  // ---------- Query details ----------
  function queryView(d) {
    const q = d.query, r = d.result;
    const header = h("header", { class: "head" },
      h("img", { src: logo, alt: "", class: "logo" }),
      h("div", {}, h("h1", {}, h("span", { class: "mono" }, `${q.collection}.${q.method}()`)),
        h("div", { class: "muted" }, `${d.file}:${d.line}`, q.via ? ` · collection from ${q.via === "model" ? `the ${q.model} model` : q.via === "comment" ? "a veyra-collection comment" : q.via === "attribute" ? "the attribute name" : q.via === "variable" ? "the variable's assignment" : "collection()"}` : "")),
      h("div", { class: "grow" }),
      d.host && !q.unsupported ? h("button", { class: "btn", onclick: () => send({ type: "recheck" }) }, "Check again") : null);
    const parts = [header];
    if (d.source) parts.push(h("section", { class: "card" }, h("h2", {}, "In your code"), h("pre", { class: "code" }, d.source)));
    if (q.unsupported) parts.push(h("section", { class: "card note" }, h("h2", {}, "Not checked"), h("p", {}, q.unsupported), h("p", { class: "muted" }, "Query Lens checks queries whose filter is written out in the code. If the collection is guessed wrong, add a comment above the query: // veyra-collection: orders")));
    else if (!d.host) parts.push(h("section", { class: "card note" }, h("p", {}, "Connect to a development database to see how this query performs.")));
    else if (!r) parts.push(h("section", { class: "card" }, h("div", { class: "spinner" })));
    else if (r.error) parts.push(h("section", { class: "card bad" }, h("h2", {}, "Couldn't check this query"), h("p", {}, r.error)));
    else {
      const p = r.plan, v = r.verdict;
      parts.push(h("section", { class: `card verdict ${v.level}` },
        h("div", { class: "row" }, badge(v.level), h("h2", {}, v.title)),
        h("p", {}, v.detail),
        h("div", { class: "stats" },
          stat("Documents read", n(p.docsExamined)), stat("Index keys read", n(p.keysExamined)), stat("Returned", n(p.returned)), stat("Time", `${n(p.ms)} ms`),
          stat("Plan", p.stages.join(" ← ") || "–"), stat("Index", p.index || "none"))));
      if (v.suggestion) {
        parts.push(h("section", { class: "card" },
          h("h2", {}, "The index that fixes it"),
          h("p", {}, "Fields matched exactly come first, then the sort, then ranges (MongoDB's Equality, Sort, Range rule)."),
          h("div", { class: "row" }, h("code", { class: "keys" }, Object.entries(v.suggestion).map(([k, dir]) => `${k}: ${dir}`).join(", ")),
            d.readOnly ? h("span", { class: "muted" }, "Read-only mode: copy it below") : h("button", { class: "btn primary", onclick: () => send({ type: "create", keys: v.suggestion }) }, `Create on ${d.host}`)),
          h("p", { class: "muted" }, "Then add it to your code so every environment gets it:"),
          d.code ? codeTabs(d.code) : null));
      }
      parts.push(h("section", { class: "card" },
        h("h2", {}, "What was run"),
        h("p", { class: "muted" }, r.sampled && r.sampled.length ? `Values for ${r.sampled.join(", ")} come from your code at run time, so a real value from the collection was used.` : "The filter as written in your code."),
        h("pre", { class: "code" }, `db.${q.collection}.find(${r.filter})${r.sort ? `.sort(${r.sort})` : ""}${q.limit ? `.limit(${q.limit})` : ""}.explain("executionStats")`),
        h("p", { class: "muted" }, `Indexes on ${q.collection}: `, (r.indexes || []).join("  ·  ") || "none")));
    }
    app.replaceChildren(...parts);
  }
  const stat = (label, value) => h("div", { class: "stat" }, h("small", {}, label), h("strong", {}, value));

  // ---------- Index Doctor ----------
  let doctorState, busy;
  function doctorView(d) {
    doctorState = d;
    const header = h("header", { class: "head" },
      h("img", { src: logo, alt: "", class: "logo" }),
      h("div", {}, h("h1", {}, "Index Doctor"), h("div", { class: "muted" }, d.connected ? `${d.host}${d.local ? "" : " · not on this computer"}${d.readOnly ? " · read-only" : ""}` : "Not connected")),
      h("div", { class: "grow" }),
      d.connected ? h("button", { class: "btn", onclick: () => { busy = "schemas"; render(); send({ type: "schemas" }); } }, busy === "schemas" ? "Checking schemas…" : "Check Mongoose schemas") : null,
      d.connected ? h("button", { class: "btn primary", onclick: () => send({ type: "analyzeAll" }) }, d.unchecked ? `Check all queries (${d.unchecked} left)` : "Check all queries again") : null,
      h("button", { class: "btn icon", title: "Refresh", onclick: () => send({ type: "refresh" }) }, "⟳"));
    if (!d.connected) {
      app.replaceChildren(header, h("section", { class: "card note center" }, h("h2", {}, "Connect to a development database"), h("p", {}, "Index Doctor compares the indexes in your database with the queries in your code."), h("button", { class: "btn primary", onclick: () => send({ type: "connect" }) }, "Connect")));
      return;
    }
    const missing = d.collections.flatMap(c => c.missing.map(m => ({ ...m, collection: c.name })));
    const unused = d.collections.flatMap(c => c.indexes.filter(i => i.unused || i.redundantWith).map(i => ({ ...i, collection: c.name })));
    const tiles = h("section", { class: "tiles" },
      tile("Queries in your code", n(d.queries), d.unchecked ? `${n(d.unchecked)} not checked yet` : "all checked"),
      tile("Missing indexes", n(missing.length), missing.length ? "queries scan whole collections" : "none found", missing.length ? "warn" : "ok"),
      tile("Unused or duplicate", n(unused.length), unused.length ? `${size(unused.reduce((a, i) => a + (i.size || 0), 0))} of disk, slower writes` : "none found", unused.length ? "warn" : "ok"),
      tile("Collections", n(d.collections.length), `${size(d.collections.reduce((a, c) => a + (c.size || 0), 0))} of data`));
    const parts = [header, tiles];
    parts.push(h("section", { class: "card" }, h("h2", {}, "Missing indexes"),
      missing.length ? h("div", { class: "list" }, ...missing.map(m => h("div", { class: "item" },
        h("div", { class: "item-main" }, h("div", {}, h("strong", { class: "mono" }, m.collection), " ", h("code", { class: "keys" }, m.keysText)),
          h("small", { class: "muted" }, `Needed by ${m.queries.length} quer${m.queries.length === 1 ? "y" : "ies"}: `, ...m.queries.map((q, i) => [i ? ", " : "", h("a", { href: "#", onclick: e => { e.preventDefault(); send({ type: "reveal", uri: q.uri, line: q.line, character: q.character }); } }, q.file)]))),
        h("div", { class: "row" },
          h("button", { class: "btn small", onclick: () => send({ type: "copy", text: m.code.mongoose }) }, "Copy Mongoose"),
          h("button", { class: "btn small", onclick: () => send({ type: "copy", text: m.code.node }) }, "Copy Node.js"),
          d.readOnly ? null : h("button", { class: "btn small primary", onclick: () => send({ type: "create", collection: m.collection, keys: m.keys }) }, "Create"))))) : h("p", { class: "muted" }, d.unchecked ? "Check all queries to find the indexes your code needs." : "Every checked query has the index it needs.")));
    parts.push(h("section", { class: "card" }, h("h2", {}, "Indexes nothing uses"),
      h("p", { class: "muted" }, "Every index slows down writes and takes disk and memory. Usage counts start from the last server restart, so check before dropping an index that's needed now and then."),
      unused.length ? h("div", { class: "list" }, ...unused.map(i => h("div", { class: "item" },
        h("div", { class: "item-main" }, h("div", {}, h("strong", { class: "mono" }, `${i.collection}.${i.name}`), " ", h("code", { class: "keys" }, i.keys)),
          h("small", { class: "muted" }, i.redundantWith ? `Duplicate: ${i.redundantWith} starts with the same fields and can do its job` : `Used 0 times${i.since ? ` since ${new Date(i.since).toLocaleDateString()}` : ""}, and no query in your code uses it`, ` · ${size(i.size)}`)),
        h("div", { class: "row" },
          h("button", { class: "btn small", onclick: () => send({ type: "copy", text: i.drop }) }, "Copy drop command"),
          d.readOnly ? null : h("button", { class: "btn small danger", onclick: () => send({ type: "drop", collection: i.collection, name: i.name }) }, "Drop"))))) : h("p", { class: "muted" }, "Every index is used.")));
    parts.push(h("section", { class: "card" }, h("h2", {}, "All collections"),
      ...d.collections.map(c => h("details", { class: "coll" },
        h("summary", {}, h("strong", { class: "mono" }, c.name), h("span", { class: "muted" }, ` ${n(c.count)} documents · ${size(c.size)} · ${c.indexes.length} index${c.indexes.length === 1 ? "" : "es"} · ${c.queries} quer${c.queries === 1 ? "y" : "ies"} in code`)),
        h("table", {}, h("thead", {}, h("tr", {}, ...["Index", "Fields", "Size", "Used", "Used by your code"].map(t => h("th", {}, t)))),
          h("tbody", {}, ...c.indexes.map(i => h("tr", { class: i.unused || i.redundantWith ? "flag" : "" },
            h("td", { class: "mono" }, i.name, i.unique ? h("span", { class: "tag" }, "unique") : null, i.ttl !== undefined && i.ttl !== null ? h("span", { class: "tag" }, "TTL") : null, i.partial ? h("span", { class: "tag" }, "partial") : null),
            h("td", { class: "mono" }, i.keys), h("td", {}, size(i.size)), h("td", {}, c.statsAvailable ? n(i.ops) : "–"),
            h("td", {}, i.usedBy.length ? i.usedBy.join(", ") : h("span", { class: "muted" }, "–"))))))))));
    if (d.schemas) {
      parts.push(h("section", { class: "card" }, h("h2", {}, "Mongoose schemas compared with the data"),
        d.schemas.length ? h("div", { class: "list" }, ...d.schemas.map(s => h("div", { class: "item col" },
          h("div", {}, h("strong", {}, s.model), h("span", { class: "muted" }, ` → ${s.collection} · ${n(s.sampled)} documents checked · `), h("a", { href: "#", onclick: e => { e.preventDefault(); send({ type: "reveal", uri: s.uri, line: 0, character: 0 }); } }, s.file)),
          s.drift.length ? h("ul", { class: "drift" }, ...s.drift.map(x => h("li", { class: x.kind }, h("span", { class: "tag" }, ({ "wrong-type": "wrong type", "required-missing": "missing", "not-in-schema": "not in schema", "never-present": "unused" })[x.kind]), x.message))) : h("p", { class: "ok-text" }, "✓ Matches the data")))) : h("p", { class: "muted" }, "No Mongoose schemas with a model were found.")));
    }
    app.replaceChildren(...parts);
  }
  const tile = (label, value, note, cls) => h("div", { class: `tile ${cls || ""}` }, h("small", {}, label), h("strong", {}, value), h("span", {}, note));
  function render() { if (doctorState) doctorView(doctorState); }

  window.addEventListener("message", ({ data: msg }) => {
    switch (msg.type) {
      case "query": queryView(msg); break;
      case "doctor": busy = undefined; doctorView(msg); break;
      case "busy": if (mode === "query") app.querySelector(".verdict, .bad")?.classList.add("stale"); break;
      case "toast": toast(msg.text, msg.kind); break;
    }
  });
  app.replaceChildren(h("div", { class: "loading" }, h("img", { src: logo, alt: "" })));
  send({ type: "ready" });
})();
