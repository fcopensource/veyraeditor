// Veyra MCP Studio webview: the Inspector and the Add Server page. Plain DOM code.
(function () {
  const vscode = acquireVsCodeApi();
  const app = document.getElementById("app");
  const mode = document.body.dataset.mode;
  const logo = document.body.dataset.logo;

  const h = (tag, attrs = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "html") el.innerHTML = v;
      else if (k in el && k !== "list" && k !== "type") el[k] = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  };
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const pretty = text => { try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; } };
  const highlight = text => esc(text).replace(/("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g, m => `<span class="j-${m[0] === '"' ? (/:\s*$/.test(m) ? "key" : "str") : m === "true" || m === "false" ? "bool" : m === "null" ? "null" : "num"}">${m}</span>`);
  const isJson = text => { const t = String(text).trim(); if (!/^[[{]/.test(t)) return false; try { JSON.parse(t); return true; } catch { return false; } };
  const codeBlock = text => { const p = pretty(text); return h("pre", { class: "code", html: isJson(text) && p.length < 300000 ? highlight(p) : esc(p) }); };
  function toast(text, kind = "ok") {
    const t = h("div", { class: `toast ${kind}` }, text);
    document.body.append(t);
    setTimeout(() => t.classList.add("out"), 2200);
    setTimeout(() => t.remove(), 2600);
  }
  let seq = 0;
  const nextId = () => `r${++seq}`;

  window.addEventListener("message", e => (mode === "add" ? addMessage : inspectorMessage)(e.data));
  app.append(h("div", { class: "loading" }, h("img", { src: logo, alt: "" })));
  vscode.postMessage({ type: "ready" });

  // =====================================================================
  // Inspector
  // =====================================================================
  const S = { server: null, info: null, tools: [], resources: [], templates: [], prompts: [], tab: "tools", selected: null, log: [], logOpen: false, logFilter: "", state: "connecting", failure: null, missing: [], results: {} };
  let E = {};

  function inspectorMessage(msg) {
    switch (msg.type) {
      case "init": S.server = msg.server; buildInspector(); break;
      case "connecting": S.state = "connecting"; S.failure = null; renderHeader(); renderBody(); break;
      case "connected":
        Object.assign(S, { state: "connected", info: msg.info, tools: msg.tools, resources: msg.resources, templates: msg.templates, prompts: msg.prompts, missing: msg.missing || [] });
        if (!S.tools.length && (S.resources.length || S.templates.length)) S.tab = "resources";
        else if (!S.tools.length && !S.resources.length && S.prompts.length) S.tab = "prompts";
        S.selected = null;
        renderHeader(); renderBody();
        break;
      case "failed": S.state = "failed"; S.failure = msg; S.missing = msg.missing || []; renderHeader(); renderBody(); break;
      case "disconnected": S.state = "disconnected"; renderHeader(); renderBody(); break;
      case "log": S.log.push(msg.entry); if (S.log.length > 2000) S.log.shift(); renderLogCount(); if (S.logOpen) appendLog(msg.entry); break;
      case "result": S.results[msg.id]?.(msg); delete S.results[msg.id]; break;
      case "toast": toast(msg.text, msg.kind); break;
    }
  }

  function buildInspector() {
    app.innerHTML = "";
    E.header = h("header", { class: "ins-head" });
    E.body = h("div", { class: "ins-body" });
    E.logCount = h("span", { class: "count" });
    E.logList = h("div", { class: "log-list" });
    E.logPanel = h("section", { class: "log-panel", hidden: true },
      h("div", { class: "log-tools" },
        h("input", { class: "log-filter", placeholder: "Filter messages", oninput: e => { S.logFilter = e.target.value.toLowerCase(); renderLog(); } }),
        h("button", { class: "btn small", onclick: () => vscode.postMessage({ type: "copy", text: S.log.map(l => `${new Date(l.at).toISOString()} ${l.kind.toUpperCase()} ${l.text}`).join("\n") }) }, "Copy all"),
        h("button", { class: "btn small", onclick: () => { S.log = []; renderLog(); renderLogCount(); } }, "Clear")),
      E.logList);
    E.logToggle = h("button", { class: "log-toggle", onclick: () => { S.logOpen = !S.logOpen; E.logPanel.hidden = !S.logOpen; E.logToggle.classList.toggle("open", S.logOpen); document.body.classList.toggle("log-open", S.logOpen); if (S.logOpen) renderLog(); } }, h("span", { class: "chev" }, "▸"), "Messages ", E.logCount, h("small", {}, "every message between VS Code and the server"));
    app.append(E.header, E.body, h("footer", { class: "log-dock" }, E.logToggle, E.logPanel));
    renderHeader(); renderBody(); renderLogCount();
  }

  function renderHeader() {
    const s = S.server, i = S.info;
    const pill = { connecting: ["Connecting…", "busy"], connected: ["Connected", "ok"], failed: ["Not connected", "bad"], disconnected: ["Disconnected", "idle"] }[S.state];
    E.header.innerHTML = "";
    E.header.append(
      h("div", { class: "ins-title" },
        h("img", { src: logo, alt: "" }),
        h("div", {},
          h("h1", {}, s.name, h("span", { class: `pill ${pill[1]}` }, pill[0])),
          h("div", { class: "meta" },
            h("span", {}, s.app), h("span", {}, s.transport === "stdio" ? "Local" : s.transport === "sse" ? "Remote · SSE" : "Remote · HTTP"),
            i?.name ? h("span", {}, `${i.name}${i.version ? " " + i.version : ""}`) : null,
            i?.protocolVersion ? h("span", { title: "MCP protocol version" }, `MCP ${i.protocolVersion}`) : null),
          h("code", { class: "cmd", title: s.file }, s.summary))),
      h("div", { class: "ins-actions" },
        S.state === "connected" ? h("button", { class: "btn", onclick: () => vscode.postMessage({ type: "disconnect" }) }, "Disconnect") : null,
        h("button", { class: "btn primary", disabled: S.state === "connecting", onclick: () => vscode.postMessage({ type: "reconnect" }) }, S.state === "connected" ? "Reconnect" : "Connect"),
        h("button", { class: "btn", onclick: () => vscode.postMessage({ type: "openConfig" }) }, "Open config")));
  }

  function renderBody() {
    E.body.innerHTML = "";
    if (S.server?.secrets) E.body.append(h("div", { class: "note warn" }, `This server has ${S.server.secrets === 1 ? "a secret" : S.server.secrets + " secrets"} written in its config file${S.server.scope === "project" ? ", which may be committed to git" : ""}. Values are hidden here.`));
    if (S.missing.length) E.body.append(h("div", { class: "note warn" }, `Not set on this computer: ${S.missing.join(", ")}. The app that runs this server may set them; here they were left empty.`));
    if (S.state === "connecting") { E.body.append(h("div", { class: "state" }, h("div", { class: "spinner" }), h("b", {}, "Starting the server…"), h("small", {}, S.server.transport === "stdio" && /^(npx|uvx)\b/.test(S.server.summary) ? "The first start can take a minute while the package downloads." : "Connecting and asking what it offers."))); return; }
    if (S.state === "failed") {
      E.body.append(h("div", { class: "state failure" }, h("div", { class: "fail-icon" }, "!"), h("b", {}, S.failure.title), S.failure.detail ? h("pre", { class: "fail-detail" }, S.failure.detail) : null,
        h("div", { class: "row" }, h("button", { class: "btn primary", onclick: () => vscode.postMessage({ type: "reconnect" }) }, "Try again"), h("button", { class: "btn", onclick: () => { S.logOpen = true; E.logPanel.hidden = false; E.logToggle.classList.add("open"); document.body.classList.add("log-open"); renderLog(); } }, "Show messages"))));
      return;
    }
    if (S.state === "disconnected") { E.body.append(h("div", { class: "state" }, h("b", {}, "Disconnected"), h("small", {}, "Click Connect to start the server again."))); return; }
    if (S.info?.instructions) E.body.append(h("details", { class: "instructions" }, h("summary", {}, "Instructions from the server"), h("p", {}, S.info.instructions)));
    const counts = { tools: S.tools.length, resources: S.resources.length + S.templates.length, prompts: S.prompts.length };
    const tabs = h("nav", { class: "tabs" }, ...[["tools", "Tools"], ["resources", "Resources"], ["prompts", "Prompts"]].map(([id, label]) =>
      h("button", { class: `tab${S.tab === id ? " active" : ""}`, onclick: () => { S.tab = id; S.selected = null; renderBody(); } }, label, h("span", { class: "count" }, counts[id]))));
    const list = h("div", { class: "list" });
    const detail = h("div", { class: "detail" });
    E.body.append(tabs, h("div", { class: "split" }, list, detail));
    const items = S.tab === "tools" ? S.tools.map(t => ({ key: "t:" + t.name, title: t.name, sub: t.description, item: t, kind: "tool" }))
      : S.tab === "prompts" ? S.prompts.map(p => ({ key: "p:" + p.name, title: p.name, sub: p.description, item: p, kind: "prompt" }))
      : [...S.resources.map(r => ({ key: "r:" + r.uri, title: r.name || r.uri, sub: r.uri, item: r, kind: "resource" })), ...S.templates.map(t => ({ key: "rt:" + t.uriTemplate, title: t.name || t.uriTemplate, sub: t.uriTemplate, item: t, kind: "template" }))];
    if (!items.length) { list.append(h("p", { class: "empty" }, `This server offers no ${S.tab}.`)); detail.append(h("div", { class: "state small" }, h("small", {}, "Nothing to show."))); return; }
    if (!S.selected || !items.some(i => i.key === S.selected)) S.selected = items[0].key;
    for (const i of items) list.append(h("button", { class: `item${S.selected === i.key ? " selected" : ""}`, onclick: () => { S.selected = i.key; renderBody(); } }, h("b", {}, i.title), i.sub ? h("small", {}, i.sub) : null));
    const current = items.find(i => i.key === S.selected);
    if (current.kind === "tool") renderTool(detail, current.item);
    else if (current.kind === "prompt") renderPrompt(detail, current.item);
    else renderResource(detail, current.item, current.kind === "template");
  }

  function fieldInput(f, values) {
    const id = `f-${f.name}`;
    let input;
    if (f.type === "boolean") input = h("select", { id, onchange: e => (values[f.name] = e.target.value) }, h("option", { value: "" }, "(not set)"), h("option", { value: "true" }, "true"), h("option", { value: "false" }, "false"));
    else if (f.type === "enum") input = h("select", { id, onchange: e => (values[f.name] = e.target.value) }, h("option", { value: "" }, "(not set)"), ...f.options.map(o => h("option", { value: o }, o)));
    else if (f.type === "json") input = h("textarea", { id, rows: 3, spellcheck: false, placeholder: "JSON, like [\"a\", \"b\"] or {\"key\": 1}", oninput: e => (values[f.name] = e.target.value) });
    else input = h("input", { id, spellcheck: false, placeholder: f.type === "string" ? "" : f.type === "integer" ? "whole number" : "number", oninput: e => (values[f.name] = e.target.value) });
    if (f.default !== undefined) { const d = typeof f.default === "string" ? f.default : JSON.stringify(f.default); input.value = d; values[f.name] = d; }
    return h("label", { class: "field", for: id }, h("span", { class: "label" }, f.name, f.required ? h("i", { class: "req", title: "Required" }, "*") : null, h("em", {}, f.type === "json" ? "JSON" : f.type)), f.description ? h("small", {}, f.description) : null, input);
  }

  function renderTool(box, tool) {
    const values = {};
    const result = h("div", { class: "result" });
    let rawMode = false;
    const formBox = h("div", { class: "form" });
    const raw = h("textarea", { class: "raw", rows: 8, spellcheck: false, value: "{\n  \n}" });
    const run = () => {
      const id = nextId();
      runBtn.disabled = true; runBtn.textContent = "Running…";
      result.innerHTML = ""; result.append(h("div", { class: "running" }, h("div", { class: "spinner small" }), "Waiting for the server…"));
      S.results[id] = msg => { runBtn.disabled = false; runBtn.textContent = "Run tool"; showResult(result, msg, "tool"); };
      vscode.postMessage(rawMode ? { type: "callTool", id, name: tool.name, raw: raw.value } : { type: "callTool", id, name: tool.name, values });
    };
    const runBtn = h("button", { class: "btn primary", onclick: run }, "Run tool");
    const annotations = tool.annotations ? Object.entries(tool.annotations).filter(([k, v]) => v === true && /Hint$/.test(k)).map(([k]) => h("span", { class: "badge" }, k.replace(/Hint$/, "").replace(/([A-Z])/g, " $1").toLowerCase())) : [];
    const fields = tool.fields || [];
    if (fields.length) fields.forEach(f => formBox.append(fieldInput(f, values))); else formBox.append(h("p", { class: "empty" }, "This tool takes no arguments."));
    const switcher = h("button", { class: "link", onclick: () => { rawMode = !rawMode; formBox.hidden = rawMode; raw.hidden = !rawMode; switcher.textContent = rawMode ? "Use the form" : "Edit as JSON"; } }, "Edit as JSON");
    raw.hidden = true;
    box.append(
      h("div", { class: "d-head" }, h("h2", {}, tool.title || tool.name), ...annotations),
      tool.description ? h("p", { class: "desc" }, tool.description) : null,
      h("div", { class: "form-head" }, h("b", {}, "Arguments"), fields.length ? switcher : null),
      formBox, raw,
      h("div", { class: "row" }, runBtn, h("small", { class: "hint" }, "Ctrl+Enter"), h("button", { class: "link", onclick: () => vscode.postMessage({ type: "copy", text: JSON.stringify(tool.inputSchema, null, 2) }) }, "Copy input schema")),
      result);
    box.onkeydown = e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); if (!runBtn.disabled) run(); } };
  }

  function renderPrompt(box, prompt) {
    const values = {};
    const result = h("div", { class: "result" });
    const args = prompt.arguments || [];
    const form = h("div", { class: "form" }, ...(args.length ? args.map(a => fieldInput({ name: a.name, type: "string", required: !!a.required, description: a.description }, values)) : [h("p", { class: "empty" }, "This prompt takes no arguments.")]));
    const btn = h("button", { class: "btn primary", onclick: () => {
      const missing = args.find(a => a.required && !(values[a.name] || "").trim());
      if (missing) { toast(`Fill in "${missing.name}"`, "error"); return; }
      const id = nextId();
      result.innerHTML = ""; result.append(h("div", { class: "running" }, h("div", { class: "spinner small" }), "Waiting for the server…"));
      S.results[id] = msg => showResult(result, msg, "prompt");
      vscode.postMessage({ type: "getPrompt", id, name: prompt.name, args: values });
    } }, "Get prompt");
    box.append(h("div", { class: "d-head" }, h("h2", {}, prompt.title || prompt.name)), prompt.description ? h("p", { class: "desc" }, prompt.description) : null, h("div", { class: "form-head" }, h("b", {}, "Arguments")), form, h("div", { class: "row" }, btn), result);
  }

  function renderResource(box, res, isTemplate) {
    const result = h("div", { class: "result" });
    const uriInput = h("input", { class: "uri", value: isTemplate ? res.uriTemplate : res.uri, spellcheck: false });
    const read = () => {
      if (/\{[^}]+\}/.test(uriInput.value)) { toast("Replace the {placeholders} in the address first", "error"); return; }
      const id = nextId();
      result.innerHTML = ""; result.append(h("div", { class: "running" }, h("div", { class: "spinner small" }), "Reading…"));
      S.results[id] = msg => showResult(result, msg, "resource");
      vscode.postMessage({ type: "readResource", id, uri: uriInput.value });
    };
    box.append(h("div", { class: "d-head" }, h("h2", {}, res.title || res.name || res.uri || res.uriTemplate), res.mimeType ? h("span", { class: "badge" }, res.mimeType) : null),
      res.description ? h("p", { class: "desc" }, res.description) : null,
      h("label", { class: "field" }, h("span", { class: "label" }, isTemplate ? "Address (fill in the {placeholders})" : "Address"), uriInput),
      h("div", { class: "row" }, h("button", { class: "btn primary", onclick: read }, "Read resource")), result);
    if (!isTemplate) read();
  }

  function showResult(box, msg, kind) {
    box.innerHTML = "";
    if (!msg.ok) { box.append(h("div", { class: "res-head bad" }, "✗ Failed", msg.ms !== undefined ? h("span", {}, `${msg.ms} ms`) : null), h("pre", { class: "fail-detail" }, msg.error)); return; }
    const r = msg.result || {};
    const isError = kind === "tool" && r.isError;
    const copyAll = h("button", { class: "btn small", onclick: () => vscode.postMessage({ type: "copy", text: JSON.stringify(r, null, 2) }) }, "Copy JSON");
    box.append(h("div", { class: `res-head ${isError ? "bad" : "ok"}` }, isError ? "✗ The tool reported an error" : "✓ Done", h("span", {}, `${msg.ms} ms`), h("span", { class: "grow" }), copyAll));
    const parts = kind === "tool" ? (r.content || []) : kind === "prompt" ? (r.messages || []).map(m => ({ ...m.content, role: m.role })) : (r.contents || []).map(c => ({ ...c, type: c.blob ? "blob" : "resourceText" }));
    if (kind === "prompt" && r.description) box.append(h("p", { class: "desc" }, r.description));
    for (const part of parts) {
      const role = part.role ? h("span", { class: "role" }, part.role) : null;
      if (part.type === "text" || part.type === "resourceText") box.append(h("div", { class: "part" }, role, part.uri ? h("small", { class: "uri-label" }, part.uri) : null, codeBlock(part.text ?? "")));
      else if (part.type === "image") box.append(h("div", { class: "part" }, role, h("img", { class: "img", src: `data:${part.mimeType};base64,${part.data}`, alt: "Image from the server" })));
      else if (part.type === "audio") box.append(h("div", { class: "part" }, role, h("audio", { controls: true, src: `data:${part.mimeType};base64,${part.data}` })));
      else if (part.type === "resource_link") box.append(h("div", { class: "part" }, role, h("small", {}, "Link to a resource: "), h("code", {}, part.uri)));
      else if (part.type === "resource") box.append(h("div", { class: "part" }, role, h("small", { class: "uri-label" }, part.resource?.uri), codeBlock(part.resource?.text ?? "(binary content)")));
      else if (part.type === "blob") box.append(h("div", { class: "part" }, h("small", { class: "uri-label" }, part.uri), h("p", { class: "empty" }, `Binary content (${part.mimeType || "unknown type"}).`)));
      else box.append(h("div", { class: "part" }, role, codeBlock(JSON.stringify(part))));
    }
    if (!parts.length && !r.structuredContent) box.append(h("p", { class: "empty" }, "The server returned nothing."));
    if (r.structuredContent) box.append(h("div", { class: "part" }, h("small", { class: "uri-label" }, "Structured result"), codeBlock(JSON.stringify(r.structuredContent))));
  }

  function renderLogCount() { if (E.logCount) E.logCount.textContent = S.log.length; }
  const logLine = l => h("div", { class: `log ${l.kind}` }, h("time", {}, new Date(l.at).toLocaleTimeString()), h("span", { class: "kind" }, { sent: "→ sent", received: "← received", stderr: "server log", info: "info", error: "error" }[l.kind]), h("span", { class: "text", title: "Click to expand", onclick: e => e.currentTarget.classList.toggle("open") }, l.text));
  function renderLog() { E.logList.innerHTML = ""; S.log.filter(l => !S.logFilter || l.text.toLowerCase().includes(S.logFilter)).slice(-500).forEach(l => E.logList.append(logLine(l))); E.logList.scrollTop = E.logList.scrollHeight; }
  function appendLog(l) { if (S.logFilter && !l.text.toLowerCase().includes(S.logFilter)) return; const stick = E.logList.scrollTop + E.logList.clientHeight >= E.logList.scrollHeight - 30; E.logList.append(logLine(l)); if (stick) E.logList.scrollTop = E.logList.scrollHeight; }

  // =====================================================================
  // Add Server
  // =====================================================================
  const A = { catalog: [], targets: [], folder: "", query: "", category: "All", selected: null, answers: {}, custom: { transport: "stdio", command: "", args: "", env: [], url: "", headers: [] }, name: "", testing: false };
  let F = {};
  function addMessage(msg) {
    switch (msg.type) {
      case "init": A.catalog = msg.catalog; A.targets = msg.targets; A.folder = msg.workspaceFolder; buildAdd(); break;
      case "folderPicked": A.answers[msg.key] = msg.path; renderForm(); break;
      case "testResult": A.testing = false; renderTestResult(msg); break;
      case "added": renderAdded(msg); break;
      case "toast": toast(msg.text, msg.kind); break;
    }
  }
  const CATEGORIES = ["All", "Developer tools", "Web & browser", "Docs & knowledge", "Files & data", "Productivity", "Testing"];
  function buildAdd() {
    app.innerHTML = "";
    F.grid = h("div", { class: "cards" });
    F.form = h("section", { class: "add-form" });
    F.chips = h("div", { class: "chips" });
    app.append(h("div", { class: "add-page" },
      h("header", { class: "add-head" }, h("img", { src: logo, alt: "" }), h("div", {}, h("h1", {}, "Add an MCP server"), h("p", {}, "Pick a popular server or add your own, choose which AI apps get it, and test it before saving."))),
      h("div", { class: "add-layout" },
        h("div", { class: "add-left" },
          h("input", { class: "search", placeholder: "Search servers, like browser, docs or GitHub", oninput: e => { A.query = e.target.value.toLowerCase(); renderCards(); } }),
          F.chips, F.grid),
        F.form)));
    renderChips(); renderCards(); renderForm();
  }
  function renderChips() {
    F.chips.innerHTML = "";
    CATEGORIES.forEach(c => F.chips.append(h("button", { class: A.category === c ? "active" : "", onclick: () => { A.category = c; renderChips(); renderCards(); } }, c)));
  }
  function renderCards() {
    F.grid.innerHTML = "";
    F.grid.append(h("button", { class: `card custom${A.selected === "custom" ? " selected" : ""}`, onclick: () => select("custom") }, h("div", { class: "card-icon" }, "+"), h("b", {}, "Custom server"), h("small", {}, "Any command or URL: your own server, or one from its docs.")));
    const shown = A.catalog.filter(e => (A.category === "All" || e.category === A.category) && (!A.query || `${e.name} ${e.maker} ${e.description} ${e.category}`.toLowerCase().includes(A.query)));
    for (const e of shown) F.grid.append(h("button", { class: `card${A.selected === e.id ? " selected" : ""}`, onclick: () => select(e.id) },
      h("div", { class: "card-icon" }, e.name[0]), h("b", {}, e.name), h("small", {}, e.description),
      h("div", { class: "card-tags" }, h("span", { class: `tag ${e.runtime === "Remote" ? "remote" : "local"}` }, e.runtime), e.auth === "oauth" ? h("span", { class: "tag" }, "Sign-in") : e.auth === "none" ? h("span", { class: "tag ok" }, "No sign-in") : null, (e.fields || []).some(f => f.secret && f.required) ? h("span", { class: "tag" }, "API key") : null)));
    if (!shown.length) F.grid.append(h("p", { class: "empty" }, `No server matches "${A.query}". Use Custom server to add any server.`));
  }
  function select(id) {
    A.selected = id; A.answers = {};
    const e = A.catalog.find(x => x.id === id);
    A.name = e ? e.id : A.name || "";
    if (e) for (const f of e.fields || []) if (f.defaultWorkspace && A.folder) A.answers[f.key] = A.folder;
    renderCards(); renderForm();
    F.form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function currentDef() {
    const e = A.catalog.find(x => x.id === A.selected);
    if (e) {
      const def = { name: A.name.trim(), ...JSON.parse(JSON.stringify(e.def)) };
      for (const f of e.fields || []) {
        const v = (A.answers[f.key] || "").trim();
        if (!v) continue;
        if (f.target === "arg") def.args = [...(def.args || []), v];
        else if (f.target === "env") def.env = { ...(def.env || {}), [f.key]: v };
        else def.headers = { ...(def.headers || {}), [f.key]: (f.prefix || "") + v };
      }
      return def;
    }
    const c = A.custom;
    const pairs = list => Object.fromEntries(list.filter(p => p.enabled !== false && p.key.trim()).map(p => [p.key.trim(), p.value]));
    if (c.transport === "stdio") {
      const def = { name: A.name.trim(), transport: "stdio", command: c.command.trim(), args: splitArgs(c.args) };
      const env = pairs(c.env); if (Object.keys(env).length) def.env = env;
      if (!def.args.length) delete def.args;
      return def;
    }
    const def = { name: A.name.trim(), transport: c.transport, url: c.url.trim() };
    const headers = pairs(c.headers); if (Object.keys(headers).length) def.headers = headers;
    return def;
  }
  function splitArgs(line) {
    const out = []; let cur = "", quote = null, has = false;
    for (const ch of line) {
      if (quote) { if (ch === quote) quote = null; else cur += ch; continue; }
      if (ch === '"' || ch === "'") { quote = ch; has = true; continue; }
      if (/\s/.test(ch)) { if (has || cur) { out.push(cur); cur = ""; has = false; } continue; }
      cur += ch;
    }
    if (has || cur) out.push(cur);
    return out;
  }
  function missingRequired() {
    const e = A.catalog.find(x => x.id === A.selected);
    if (!A.name.trim()) return "Enter a name for the server.";
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(A.name.trim())) return "Use a name of letters, numbers, dashes, dots or underscores.";
    if (e) { const f = (e.fields || []).find(f => f.required && !(A.answers[f.key] || "").trim()); if (f) return `Fill in "${f.label}".`; return null; }
    if (A.custom.transport === "stdio" && !A.custom.command.trim()) return "Enter the command that starts the server.";
    if (A.custom.transport !== "stdio" && !A.custom.url.trim()) return "Enter the server's URL.";
    return null;
  }

  function kvRows(list, keyPh, valuePh) {
    const wrap = h("div", { class: "kv" });
    const add = (row, ghost) => {
      const el = h("div", { class: `kv-row${ghost ? " ghost" : ""}` });
      const k = h("input", { value: row.key, placeholder: keyPh, spellcheck: false });
      const v = h("input", { value: row.value, placeholder: valuePh, spellcheck: false });
      const x = h("button", { class: "icon-btn", title: "Remove", html: "&times;", onclick: () => { const i = list.indexOf(row); if (i >= 0) list.splice(i, 1); el.remove(); } });
      const typed = () => { row.key = k.value; row.value = v.value; if (el.classList.contains("ghost") && (row.key || row.value)) { el.classList.remove("ghost"); list.push(row); add({ key: "", value: "" }, true); } };
      k.oninput = typed; v.oninput = typed;
      el.append(k, v, x); wrap.append(el);
    };
    list.forEach(r => add(r, false)); add({ key: "", value: "" }, true);
    return wrap;
  }

  function renderForm() {
    const box = F.form;
    box.innerHTML = "";
    if (!A.selected) { box.append(h("div", { class: "state small" }, h("img", { src: logo, alt: "", class: "faint" }), h("b", {}, "Choose a server"), h("small", {}, "Pick one from the list, or Custom server to add any command or URL."))); return; }
    const e = A.catalog.find(x => x.id === A.selected);
    const parts = [];
    parts.push(h("h2", {}, e ? e.name : "Custom server"));
    if (e) {
      parts.push(h("p", { class: "desc" }, e.description, " ", h("a", { href: e.homepage }, "Documentation")));
      const needs = e.runtime === "Node.js" ? "Needs Node.js 18 or newer." : e.runtime === "Python (uv)" ? "Needs uv (docs.astral.sh/uv), which runs Python servers." : e.auth === "oauth" ? "Remote: the app signs you in with your browser the first time it connects." : e.auth === "none" ? "Remote, with no sign-in." : "Remote: sign in with your browser, or use a token.";
      parts.push(h("div", { class: "note" }, needs));
    }
    parts.push(field("Name", h("input", { value: A.name, spellcheck: false, placeholder: "my-server", oninput: ev => (A.name = ev.target.value) }), "How the server is named in each app's config."));
    if (e) {
      for (const f of e.fields || []) {
        const input = h("input", { value: A.answers[f.key] || "", spellcheck: false, placeholder: f.placeholder || "", type: f.secret ? "password" : "text", oninput: ev => (A.answers[f.key] = ev.target.value) });
        const control = f.target === "arg" && /folder|repository/i.test(f.label) ? h("div", { class: "with-btn" }, input, h("button", { class: "btn small", onclick: () => vscode.postMessage({ type: "pickFolder", key: f.key }) }, "Browse…")) : input;
        parts.push(field(`${f.label}${f.required ? " *" : ""}`, control, f.help));
      }
    } else {
      const c = A.custom;
      parts.push(h("div", { class: "segmented" }, ...[["stdio", "Local command"], ["http", "Remote URL"], ["sse", "Remote (SSE)"]].map(([id, label]) => h("button", { class: c.transport === id ? "active" : "", onclick: () => { c.transport = id; renderForm(); } }, label))));
      if (c.transport === "stdio") {
        parts.push(field("Command *", h("input", { value: c.command, spellcheck: false, placeholder: "npx", oninput: ev => (c.command = ev.target.value) }), "The program only: npx, uvx, node, python, docker, or a full path."));
        parts.push(field("Arguments", h("input", { value: c.args, spellcheck: false, placeholder: '-y @scope/server --dir "My Files"', oninput: ev => (c.args = ev.target.value) }), "Everything after the program, separated by spaces. Quote anything with spaces."));
        parts.push(field("Environment variables", kvRows(c.env, "NAME", "value"), "API keys and settings the server reads from its environment."));
      } else {
        parts.push(field("URL *", h("input", { value: c.url, spellcheck: false, placeholder: c.transport === "sse" ? "https://example.com/sse" : "https://example.com/mcp", oninput: ev => (c.url = ev.target.value) }), c.transport === "sse" ? "Older servers use SSE; most new ones use HTTP." : "Most servers end in /mcp."));
        parts.push(field("Headers", kvRows(c.headers, "Authorization", "Bearer …"), "Only if the server needs a token. Many sign you in with your browser instead."));
      }
    }
    const remote = e ? e.runtime === "Remote" : A.custom.transport !== "stdio";
    const targets = h("div", { class: "targets" }, ...A.targets.map(t => {
      const blocked = remote && t.local;
      return h("label", { class: `target${blocked ? " blocked" : ""}`, title: t.file },
        h("input", { type: "checkbox", checked: t.checked && !blocked, disabled: blocked, onchange: ev => (t.checked = ev.target.checked) }),
        h("span", {}, h("b", {}, t.label), h("small", {}, blocked ? "Add remote servers in Claude Desktop under Settings → Connectors" : t.scope === "project" ? "This project only (shared through git)" : "All projects")));
    }));
    parts.push(field("Add to", targets));
    F.result = h("div", { class: "test-result" });
    F.testBtn = h("button", { class: "btn", onclick: () => {
      const problem = missingRequired(); if (problem) { toast(problem, "error"); return; }
      A.testing = true; F.testBtn.disabled = true; F.testBtn.textContent = "Testing…";
      F.result.innerHTML = ""; F.result.append(h("div", { class: "running" }, h("div", { class: "spinner small" }), "Starting the server… the first run can take a minute while it downloads."));
      vscode.postMessage({ type: "test", def: currentDef() });
    } }, "Test connection");
    F.addBtn = h("button", { class: "btn primary", onclick: () => {
      const problem = missingRequired(); if (problem) { toast(problem, "error"); return; }
      const chosen = A.targets.filter(t => t.checked && !(remote && t.local)).map(t => t.id);
      if (!chosen.length) { toast("Choose at least one app under Add to", "error"); return; }
      vscode.postMessage({ type: "add", def: currentDef(), targets: chosen });
    } }, "Add server");
    parts.push(h("div", { class: "row actions" }, F.testBtn, F.addBtn), F.result);
    box.append(...parts);
  }
  function field(label, control, help) { return h("div", { class: "field" }, h("span", { class: "label" }, label), control, help ? h("small", {}, help) : null); }
  function renderTestResult(msg) {
    F.testBtn.disabled = false; F.testBtn.textContent = "Test connection";
    F.result.innerHTML = "";
    F.result.append(h("div", { class: `res-head ${msg.ok ? "ok" : "bad"}` }, msg.ok ? "✓ " : "✗ ", msg.title), msg.detail ? h("pre", { class: msg.ok ? "ok-detail" : "fail-detail" }, msg.detail) : null);
  }
  function renderAdded(msg) {
    F.result.innerHTML = "";
    F.result.append(h("div", { class: `res-head ${msg.ok ? "ok" : "bad"}` }, msg.ok ? "✓ " : "✗ ", msg.text), ...(msg.skipped || []).map(s => h("p", { class: "hint" }, s)), msg.warn ? h("div", { class: "note warn" }, msg.warn) : null);
    if (msg.ok) toast("Server added");
  }
})();
