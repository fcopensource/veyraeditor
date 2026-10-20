// Veyra API Client webview: the request editor and the environment editor.
// Plain DOM code; the extension sends "load", "response" and other messages, and receives edits.
(function () {
  const vscode = acquireVsCodeApi();
  const app = document.getElementById("app");
  const mode = document.body.dataset.mode;
  const logo = document.body.dataset.logo;

  // ---------- Small helpers ----------
  const h = (tag, attrs = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "html") el.innerHTML = v;
      else if (k in el && k !== "list") el[k] = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  };
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const bytes = n => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB` : `${(n / 1048576).toFixed(1)} MB`);
  const duration = ms => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`);
  const VAR = /\{\{\s*([$\w.-]+)\s*\}\}/g;
  const DYNAMIC = ["$guid", "$uuid", "$timestamp", "$isoTimestamp", "$randomInt", "$randomEmail"];

  function toast(text, kind = "ok") {
    const t = h("div", { class: `toast ${kind}` }, text);
    document.body.append(t);
    setTimeout(() => t.classList.add("out"), 2200);
    setTimeout(() => t.remove(), 2600);
  }

  // JSON with colours. Strings are matched first, so keys and values inside them stay intact.
  function highlightJson(text) {
    return esc(text).replace(/("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g, m => {
      const cls = m[0] === '"' ? (/:\s*$/.test(m) ? "key" : "str") : m === "true" || m === "false" ? "bool" : m === "null" ? "null" : "num";
      return `<span class="j-${cls}">${m}</span>`;
    });
  }
  function highlightMarkup(text) {
    return esc(text).replace(/(&lt;\/?)([\w:-]+)([^&]*?)(\/?&gt;)/g, (_, open, tag, attrs, close) =>
      `<span class="x-punct">${open}</span><span class="x-tag">${tag}</span>${attrs.replace(/([\w:-]+)(=)("[^"]*"|'[^']*')/g, '<span class="x-attr">$1</span>$2<span class="x-val">$3</span>')}<span class="x-punct">${close}</span>`);
  }

  // A table of key/value rows with an on/off box, used for params, headers, form fields and variables.
  function kvTable(rows, onChange, opts = {}) {
    const table = h("div", { class: "kv" });
    const head = h("div", { class: "kv-row kv-head" }, h("span"), h("span", {}, opts.keyLabel || "Key"), h("span", {}, opts.valueLabel || "Value"), opts.secret ? h("span", { class: "kv-secret-head", title: "Private values are kept on this computer and never committed" }, "Private") : null, h("span"));
    table.append(head);
    const addRow = (row, isGhost) => {
      const el = h("div", { class: `kv-row${isGhost ? " ghost" : ""}${row.enabled ? "" : " off"}` });
      const check = h("input", { type: "checkbox", checked: row.enabled, title: "Include", onchange: () => { row.enabled = check.checked; el.classList.toggle("off", !row.enabled); onChange(); } });
      const key = h("input", { class: "kv-key", value: row.key, placeholder: opts.keyPlaceholder || "key", spellcheck: false, ...(opts.keyList ? { list: opts.keyList } : {}) });
      if (opts.keyList) key.setAttribute("list", opts.keyList);
      const value = h("input", { class: "kv-value", value: row.value, placeholder: opts.valuePlaceholder || "value", spellcheck: false, type: row.secret && !row.show ? "password" : "text" });
      const secret = opts.secret ? h("input", { type: "checkbox", class: "kv-secret", checked: !!row.secret, title: "Private: stored only on this computer", onchange: () => { row.secret = secret.checked; value.type = row.secret ? "password" : "text"; onChange(); } }) : null;
      const remove = h("button", { class: "icon-btn kv-remove", title: "Remove", html: "&times;", onclick: () => { const i = rows.indexOf(row); if (i >= 0) rows.splice(i, 1); el.remove(); onChange(); } });
      const typed = () => {
        row.key = key.value; row.value = value.value;
        if (el.classList.contains("ghost") && (row.key || row.value)) { el.classList.remove("ghost"); rows.push(row); addRow({ key: "", value: "", enabled: true }, true); }
        onChange();
      };
      key.addEventListener("input", typed); value.addEventListener("input", typed);
      if (opts.secret) value.addEventListener("focus", () => { if (row.secret) value.type = "text"; });
      if (opts.secret) value.addEventListener("blur", () => { if (row.secret) value.type = "password"; });
      el.append(check, key, value, ...(secret ? [secret] : []), remove);
      table.append(el);
    };
    rows.forEach(r => addRow(r, false));
    addRow({ key: "", value: "", enabled: true }, true);
    return table;
  }

  const HEADERS = ["Accept", "Accept-Encoding", "Accept-Language", "Authorization", "Cache-Control", "Content-Type", "Cookie", "If-None-Match", "Origin", "Referer", "User-Agent", "X-API-Key", "X-Request-ID", "X-Requested-With"];
  const datalist = h("datalist", { id: "header-names" }, ...HEADERS.map(name => h("option", { value: name })));
  document.body.append(datalist);

  window.addEventListener("message", e => (mode === "environments" ? envMessage : requestMessage)(e.data));
  if (mode === "environments") initEnvironments(); else initRequest();
  vscode.postMessage({ type: "ready" });

  // =====================================================================
  // Request editor
  // =====================================================================
  let req, state = { tab: "params", respTab: "body", view: "pretty", sending: false, response: null, error: null, variables: {}, environments: [], activeEnvironment: undefined, saved: false, collectionName: "", layout: "auto", split: 0.5 };
  const persisted = vscode.getState() || {};
  if (persisted.split) state.split = persisted.split;
  let els = {};

  function initRequest() {
    app.innerHTML = "";
    app.append(h("div", { class: "loading-app" }, h("img", { src: logo, alt: "" })));
  }

  function requestMessage(msg) {
    switch (msg.type) {
      case "load":
        req = msg.request; state.saved = msg.saved; state.collectionName = msg.collectionName || ""; state.layout = msg.layout;
        state.environments = msg.environments; state.activeEnvironment = msg.activeEnvironment; state.variables = msg.variables;
        if (msg.response) state.response = msg.response;
        buildRequest();
        break;
      case "variables":
        state.variables = msg.variables; state.environments = msg.environments; state.activeEnvironment = msg.activeEnvironment;
        renderEnvSelect(); renderUrlMirror(); renderHint();
        break;
      case "sending": state.sending = true; state.error = null; state.started = performance.now(); renderResponse(); break;
      case "response": state.sending = false; state.response = msg.response; state.error = null; renderResponse(); break;
      case "failed": state.sending = false; state.error = msg; if (!msg.cancelled) state.response = null; renderResponse(); break;
      case "saved": state.saved = true; state.collectionName = msg.collectionName; req.name = msg.name; els.name.value = msg.name; renderCrumb(); toast(`Saved to ${msg.collectionName}`); break;
      case "renamed": req.name = msg.name; if (els.name) els.name.value = msg.name; break;
      case "toast": toast(msg.text, msg.kind); break;
    }
  }

  const changed = debounce(() => vscode.postMessage({ type: "update", request: req }), 250);
  function edit() { changed(); renderTabCounts(); renderHint(); }

  function send() {
    if (state.sending) { vscode.postMessage({ type: "cancel" }); return; }
    pullQueryFromUrl();
    vscode.postMessage({ type: "send", request: req });
  }

  // Query strings typed into the URL move into the Params table, where they are easier to edit.
  function pullQueryFromUrl() {
    const url = els.url.value, q = url.indexOf("?");
    if (q < 0) return;
    const base = url.slice(0, q);
    const params = url.slice(q + 1).split("#")[0].split("&").filter(Boolean).map(pair => {
      const eq = pair.indexOf("="), dec = s => { try { return decodeURIComponent(s.replace(/\+/g, " ")); } catch { return s; } };
      return { key: dec(eq < 0 ? pair : pair.slice(0, eq)), value: dec(eq < 0 ? "" : pair.slice(eq + 1)), enabled: true };
    });
    req.url = base; els.url.value = base; req.params.push(...params);
    renderUrlMirror();
    if (state.tab === "params") renderTab();
    edit();
  }

  function resolve(text) {
    const missing = new Set();
    let out = text;
    for (let i = 0; i < 5; i++) {
      const next = out.replace(VAR, (whole, name) => (name in state.variables ? state.variables[name] : whole));
      if (next === out) break;
      out = next;
    }
    out.replace(VAR, (whole, name) => { if (!DYNAMIC.includes(name)) missing.add(name); return whole; });
    return { text: out, missing: [...missing] };
  }
  function fullUrl() {
    const query = req.params.filter(p => p.enabled && p.key).map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join("&");
    const base = req.url.trim();
    return query ? `${base}${base.includes("?") ? "&" : "?"}${query}` : base;
  }

  function buildRequest() {
    app.innerHTML = "";
    els = {};
    const methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
    els.method = h("select", { class: `method m-${req.method}`, title: "Method", onchange: () => { req.method = els.method.value; els.method.className = `method m-${req.method}`; edit(); } },
      ...[...new Set([...methods, req.method])].map(mth => h("option", { value: mth, selected: mth === req.method }, mth)));
    els.mirror = h("div", { class: "url-mirror", "aria-hidden": "true" });
    els.url = h("input", { class: "url", value: req.url, spellcheck: false, autocomplete: "off", placeholder: "Enter a URL, like https://api.example.com/users or {{baseUrl}}/users",
      oninput: () => { req.url = els.url.value; renderUrlMirror(); edit(); },
      onscroll: () => (els.mirror.scrollLeft = els.url.scrollLeft),
      onkeydown: e => { if (e.key === "Enter") { e.preventDefault(); send(); } },
      onblur: pullQueryFromUrl, onpaste: e => {
        const text = e.clipboardData.getData("text");
        if (/^\s*curl\s/i.test(text)) { e.preventDefault(); toast("Use Import cURL in the Collections view to import a cURL command", "info"); }
      } });
    els.send = h("button", { class: "send", onclick: send, title: "Send (Ctrl+Enter)" });
    els.name = h("input", { class: "name", value: req.name, spellcheck: false, title: "Request name", oninput: () => { req.name = els.name.value || "Request"; edit(); } });
    els.crumb = h("span", { class: "crumb" });
    els.envSelect = h("select", { class: "env", title: "Environment", onchange: () => {
      if (els.envSelect.value === "__edit") { vscode.postMessage({ type: "editEnvironments" }); renderEnvSelect(); return; }
      vscode.postMessage({ type: "setEnvironment", id: els.envSelect.value });
    } });
    els.saveBtn = h("button", { class: "btn ghost-btn", onclick: () => vscode.postMessage({ type: "save" }), title: "Save to a collection (Ctrl+S)" });
    const menu = h("div", { class: "menu" },
      h("button", { onclick: () => copyAs("curl") }, "Copy as cURL"),
      h("button", { onclick: () => copyAs("fetch") }, "Copy as JavaScript fetch"),
      h("button", { onclick: () => copyAs("python") }, "Copy as Python requests"));
    const more = h("div", { class: "menu-wrap" }, h("button", { class: "btn ghost-btn", title: "Copy as code", onclick: e => { e.stopPropagation(); menu.classList.toggle("open"); } }, h("span", { html: "&lt;/&gt;" }), " Code"), menu);
    document.addEventListener("click", () => menu.classList.remove("open"));

    els.hint = h("div", { class: "hint" });
    els.tabs = h("nav", { class: "tabs" });
    els.tabBody = h("div", { class: "tab-body" });
    els.response = h("section", { class: "response" });
    els.divider = h("div", { class: "divider", title: "Drag to resize" });
    els.split = h("div", { class: "split" }, h("section", { class: "request" }, els.tabs, els.tabBody), els.divider, els.response);

    app.append(
      h("header", { class: "bar" }, h("div", { class: "title" }, els.crumb, els.name), h("div", { class: "actions" }, h("span", { class: "env-label" }, "Environment"), els.envSelect, more, els.saveBtn)),
      h("div", { class: "urlbar" }, els.method, h("div", { class: "url-wrap" }, els.mirror, els.url), els.send),
      els.hint, els.split,
    );
    setupDivider();
    renderCrumb(); renderEnvSelect(); renderUrlMirror(); renderHint(); renderTabs(); renderTab(); renderResponse(); applyLayout();
    new ResizeObserver(applyLayout).observe(app);
    if (!req.url) els.url.focus();
  }

  function copyAs(as) { pullQueryFromUrl(); vscode.postMessage({ type: "update", request: req }); vscode.postMessage({ type: "copy", as }); }

  function renderCrumb() {
    els.crumb.textContent = state.saved ? `${state.collectionName} ›` : "Not saved ›";
    els.crumb.classList.toggle("unsaved", !state.saved);
    els.saveBtn.textContent = state.saved ? "Saved" : "Save";
    els.saveBtn.classList.toggle("primary-outline", !state.saved);
    els.saveBtn.disabled = state.saved;
  }
  function renderEnvSelect() {
    if (!els.envSelect) return;
    els.envSelect.innerHTML = "";
    els.envSelect.append(h("option", { value: "" }, "No environment"), ...state.environments.map(e => h("option", { value: e.id, selected: e.id === state.activeEnvironment }, e.name)), h("option", { value: "__edit" }, "Edit environments…"));
  }
  function renderUrlMirror() {
    const text = els.url.value;
    els.mirror.innerHTML = esc(text).replace(/\{\{\s*([$\w.-]+)\s*\}\}/g, (whole, name) => `<span class="var ${name in state.variables || DYNAMIC.includes(name) ? "known" : "unknown"}">${whole}</span>`) + " ";
    els.mirror.scrollLeft = els.url.scrollLeft;
  }
  function renderHint() {
    if (!els.hint) return;
    const url = fullUrl();
    const resolved = resolve(url);
    const missing = [...new Set([...resolved.missing, ...(JSON.stringify(req.headers) + JSON.stringify(req.body) + JSON.stringify(req.auth)).match(/\{\{\s*[$\w.-]+\s*\}\}/g)?.map(v => v.replace(/[{}\s]/g, "")).filter(n => !(n in state.variables) && !DYNAMIC.includes(n)) ?? []])];
    els.hint.innerHTML = "";
    if (url && (url !== resolved.text || req.params.some(p => p.enabled && p.key))) els.hint.append(h("span", { class: "resolved", title: "The URL that will be sent" }, "→ ", resolved.text));
    if (missing.length) els.hint.append(h("span", { class: "missing" }, `Unknown: ${missing.map(n => `{{${n}}}`).join(", ")}`, h("button", { class: "link", onclick: () => vscode.postMessage({ type: "editEnvironments" }) }, "Add to environment")));
  }

  const TABS = [["params", "Params"], ["headers", "Headers"], ["body", "Body"], ["auth", "Auth"]];
  function renderTabs() {
    els.tabs.innerHTML = "";
    for (const [id, label] of TABS) els.tabs.append(h("button", { class: `tab${state.tab === id ? " active" : ""}`, "data-tab": id, onclick: () => { state.tab = id; renderTabs(); renderTab(); } }, label, h("span", { class: "count" })));
    renderTabCounts();
  }
  function renderTabCounts() {
    if (!els.tabs) return;
    const counts = { params: req.params.filter(p => p.enabled && p.key).length, headers: req.headers.filter(p => p.enabled && p.key).length, body: req.body.type !== "none" ? "•" : "", auth: req.auth.type !== "none" ? "•" : "" };
    for (const b of els.tabs.querySelectorAll(".tab")) { const c = counts[b.dataset.tab]; b.querySelector(".count").textContent = c ? c : ""; }
  }

  function renderTab() {
    const body = els.tabBody;
    body.innerHTML = "";
    if (state.tab === "params") body.append(h("p", { class: "help" }, "Query parameters, added to the URL as ?key=value."), kvTable(req.params, edit, { keyPlaceholder: "parameter", valuePlaceholder: "value or {{variable}}" }));
    if (state.tab === "headers") body.append(h("p", { class: "help" }, "Content-Type and Authorization are added for you from Body and Auth."), kvTable(req.headers, edit, { keyPlaceholder: "Header-Name", valuePlaceholder: "value or {{variable}}", keyList: "header-names" }));
    if (state.tab === "body") renderBody(body);
    if (state.tab === "auth") renderAuth(body);
  }

  function renderBody(container) {
    const types = [["none", "None"], ["json", "JSON"], ["text", "Text"], ["xml", "XML"], ["form", "Form URL-encoded"], ["multipart", "Multipart form"], ["graphql", "GraphQL"]];
    const seg = h("div", { class: "segmented" }, ...types.map(([id, label]) => h("button", { class: req.body.type === id ? "active" : "", onclick: () => { req.body.type = id; edit(); renderTab(); } }, label)));
    container.append(seg);
    const t = req.body.type;
    if (t === "none") { container.append(h("p", { class: "empty-note" }, "This request has no body.")); return; }
    if (t === "form" || t === "multipart") { container.append(kvTable(req.body.form, edit, { keyPlaceholder: "field", valuePlaceholder: "value" })); return; }
    const status = h("span", { class: "json-status" });
    const area = codeArea(req.body.text, value => { req.body.text = value; validate(); edit(); }, t === "graphql" ? "query { user(id: 1) { name } }" : t === "json" ? '{\n  "name": "Ana"\n}' : "");
    const validate = () => {
      if (t !== "json") { status.textContent = ""; return; }
      try { if (req.body.text.trim()) JSON.parse(req.body.text.replace(VAR, "0")); status.textContent = req.body.text.trim() ? "✓ Valid JSON" : ""; status.className = "json-status ok"; }
      catch (e) { status.textContent = `✗ ${e.message.replace(/^JSON\.parse: /, "")}`; status.className = "json-status bad"; }
    };
    const format = t === "json" ? h("button", { class: "btn small", onclick: () => {
      try { const v = JSON.stringify(JSON.parse(req.body.text), null, 2); req.body.text = v; area.value = v; validate(); edit(); } catch { toast("Fix the JSON first", "error"); }
    } }, "Format") : null;
    container.append(h("div", { class: "code-tools" }, status, format), area);
    validate();
    if (t === "graphql") {
      container.append(h("div", { class: "sub-label" }, "Variables (JSON)"), codeArea(req.body.variables, v => { req.body.variables = v; edit(); }, '{ "id": 1 }', "small"));
    }
  }

  function codeArea(value, onInput, placeholder, size = "") {
    const area = h("textarea", { class: `code ${size}`, value, placeholder, spellcheck: false, oninput: () => onInput(area.value),
      onkeydown: e => {
        if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); const s = area.selectionStart; area.setRangeText("  ", s, area.selectionEnd, "end"); onInput(area.value); }
        if (e.key === "Enter") { // keep the indentation of the current line
          const s = area.selectionStart, line = area.value.slice(0, s).split("\n").pop(), indent = line.match(/^\s*/)[0] + (/[{[]\s*$/.test(line) ? "  " : "");
          e.preventDefault(); area.setRangeText("\n" + indent, s, area.selectionEnd, "end"); onInput(area.value);
        }
      } });
    return area;
  }

  function renderAuth(container) {
    const a = req.auth;
    const select = h("select", { class: "auth-type", onchange: () => {
      const type = select.value;
      req.auth = type === "bearer" ? { type, token: "" } : type === "basic" ? { type, username: "", password: "" } : type === "apikey" ? { type, key: "X-API-Key", value: "", in: "header" } : { type: "none" };
      edit(); renderTab();
    } }, ...[["none", "No auth"], ["bearer", "Bearer token"], ["basic", "Basic auth"], ["apikey", "API key"]].map(([v, l]) => h("option", { value: v, selected: a.type === v }, l)));
    const field = (label, key, opts = {}) => h("label", { class: "field" }, h("span", {}, label), h("input", { value: a[key] ?? "", spellcheck: false, placeholder: opts.placeholder || "", type: opts.password ? "password" : "text", oninput: e => { a[key] = e.target.value; edit(); } }));
    container.append(h("div", { class: "auth" }, h("label", { class: "field" }, h("span", {}, "Type"), select),
      a.type === "bearer" ? field("Token", "token", { placeholder: "{{token}} or paste a token" }) : null,
      a.type === "basic" ? [field("Username", "username"), field("Password", "password", { password: true })] : null,
      a.type === "apikey" ? [field("Key", "key"), field("Value", "value", { placeholder: "{{apiKey}}" }), h("label", { class: "field" }, h("span", {}, "Add to"),
        h("select", { onchange: e => { a.in = e.target.value; edit(); } }, h("option", { value: "header", selected: a.in !== "query" }, "Header"), h("option", { value: "query", selected: a.in === "query" }, "Query parameter")))] : null,
      a.type === "none" ? h("p", { class: "empty-note" }, "This request sends no credentials.") : h("p", { class: "help" }, "Tip: keep secrets in an environment as private values, and use {{name}} here."),
    ));
  }

  // ---------- Response ----------
  let ticker;
  function renderResponse() {
    const box = els.response;
    if (!box) return;
    box.innerHTML = "";
    clearInterval(ticker);
    els.send.classList.toggle("cancel", state.sending);
    els.send.innerHTML = state.sending ? "Cancel" : '<span class="send-icon">➤</span> Send';
    if (state.sending) {
      const time = h("span", { class: "elapsed" }, "0 ms");
      ticker = setInterval(() => (time.textContent = duration(performance.now() - state.started)), 50);
      box.append(h("div", { class: "state sending" }, h("div", { class: "pulse" }), h("div", {}, "Sending… ", time)));
      return;
    }
    if (state.error) {
      box.append(h("div", { class: `state error${state.error.cancelled ? " cancelled" : ""}` },
        h("div", { class: "error-title" }, state.error.cancelled ? "Request cancelled" : "Could not get a response"),
        h("p", {}, state.error.message), ...(state.error.warnings || []).map(w => h("p", { class: "warn" }, w))));
      return;
    }
    const r = state.response;
    if (!r) {
      box.append(h("div", { class: "state empty" }, h("img", { src: logo, alt: "" }), h("div", { class: "empty-title" }, "Ready when you are"),
        h("div", { class: "keys" }, h("span", {}, h("kbd", {}, "Ctrl"), "+", h("kbd", {}, "Enter"), " send"), h("span", {}, h("kbd", {}, "Enter"), " in the URL sends too"))));
      return;
    }
    const cls = r.status < 300 ? "ok" : r.status < 400 ? "redirect" : r.status < 500 ? "client" : "server";
    let pretty = r.text;
    if (r.kind === "json" && r.text) { try { pretty = JSON.stringify(JSON.parse(r.text), null, 2); } catch { /* invalid JSON: show as sent */ } }
    const summary = h("div", { class: "resp-bar" },
      h("span", { class: `status ${cls}` }, `${r.status} ${r.statusText}`),
      h("span", { class: "metric", title: "Time" }, "⏱ ", duration(r.ms)),
      h("span", { class: "metric", title: "Size" }, "⇩ ", bytes(r.size)),
      r.redirected ? h("span", { class: "metric", title: r.url }, "↪ redirected") : null,
      h("span", { class: "grow" }),
      r.text !== undefined ? h("button", { class: "btn small", onclick: () => vscode.postMessage({ type: "copyResponse", pretty: state.view === "pretty" ? pretty : undefined }) }, "Copy") : null,
      r.text !== undefined ? h("button", { class: "btn small", onclick: () => vscode.postMessage({ type: "openResponse", pretty: state.view === "pretty" ? pretty : undefined }) }, "Open in editor") : null,
      h("button", { class: "btn small", onclick: () => vscode.postMessage({ type: "saveResponse" }) }, "Save"));
    const tabs = h("nav", { class: "tabs small" },
      h("button", { class: `tab${state.respTab === "body" ? " active" : ""}`, onclick: () => { state.respTab = "body"; renderResponse(); } }, "Body"),
      h("button", { class: `tab${state.respTab === "headers" ? " active" : ""}`, onclick: () => { state.respTab = "headers"; renderResponse(); } }, "Headers", h("span", { class: "count" }, r.headers.length)),
      h("button", { class: `tab${state.respTab === "request" ? " active" : ""}`, onclick: () => { state.respTab = "request"; renderResponse(); } }, "Sent"));
    box.append(summary, ...(r.warnings || []).map(w => h("div", { class: "warn-bar" }, w)), tabs);

    if (state.respTab === "headers") {
      box.append(h("div", { class: "resp-content" }, headerTable(r.headers)));
      return;
    }
    if (state.respTab === "request") {
      box.append(h("div", { class: "resp-content" }, h("div", { class: "sent-url" }, h("b", {}, req.method), " ", r.url), headerTable(r.sentHeaders)));
      return;
    }
    const canPreview = r.kind === "html" || r.kind === "image";
    if (!canPreview && state.view === "preview") state.view = "pretty";
    if (r.kind === "image" && state.view !== "preview") state.view = "preview";
    const views = h("div", { class: "segmented small" },
      ...(r.kind === "image" ? [] : [["pretty", "Pretty"], ["raw", "Raw"]]).concat(canPreview ? [["preview", "Preview"]] : []).map(([id, label]) =>
        h("button", { class: state.view === id ? "active" : "", onclick: () => { state.view = id; renderResponse(); } }, label)));
    const content = h("div", { class: "resp-content body" });
    if (r.kind === "image") content.append(r.base64 ? h("img", { class: "preview-img", src: `data:${r.contentType.split(";")[0]};base64,${r.base64}`, alt: "Response image" }) : h("p", { class: "empty-note" }, "The image is too large to preview. Save it to open it."));
    else if (r.kind === "binary") content.append(h("p", { class: "empty-note" }, `Binary content (${r.contentType || "unknown type"}, ${bytes(r.size)}). Use Save to keep it.`));
    else if (state.view === "preview") content.append(h("iframe", { class: "preview-html", sandbox: "", srcdoc: r.text }));
    else if (!r.text) content.append(h("p", { class: "empty-note" }, "The response has no body."));
    else {
      const text = state.view === "pretty" ? pretty : r.text;
      const big = text.length > 400000;
      const html = state.view === "raw" || big ? esc(text) : r.kind === "json" ? highlightJson(text) : r.kind === "html" || r.kind === "xml" ? highlightMarkup(text) : esc(text);
      content.append(h("pre", { class: "code-view", html }));
      if (r.truncated) content.append(h("p", { class: "warn" }, `Showing the first 5 MB of ${bytes(r.size)}. Use Save for the full response.`));
    }
    box.append(h("div", { class: "view-bar" }, views, h("span", { class: "content-type" }, r.contentType)), content);
  }
  function headerTable(list) {
    return h("table", { class: "headers" }, h("tbody", {}, ...list.map(([k, v]) => h("tr", {}, h("td", { class: "hk" }, k), h("td", { class: "hv" }, v)))));
  }

  // ---------- Layout: response below or beside, with a draggable divider ----------
  function applyLayout() {
    if (!els.split) return;
    const beside = state.layout === "beside" || (state.layout === "auto" && app.clientWidth > 1100);
    els.split.classList.toggle("beside", beside);
    els.split.style.setProperty("--split", `${Math.round(state.split * 1000) / 10}%`);
  }
  function setupDivider() {
    els.divider.addEventListener("pointerdown", e => {
      e.preventDefault();
      els.divider.setPointerCapture(e.pointerId);
      const rect = els.split.getBoundingClientRect();
      const move = ev => {
        const beside = els.split.classList.contains("beside");
        const f = beside ? (ev.clientX - rect.left) / rect.width : (ev.clientY - rect.top) / rect.height;
        state.split = Math.min(0.8, Math.max(0.2, f));
        applyLayout();
      };
      const up = () => { els.divider.removeEventListener("pointermove", move); els.divider.removeEventListener("pointerup", up); vscode.setState({ ...vscode.getState(), split: state.split }); };
      els.divider.addEventListener("pointermove", move); els.divider.addEventListener("pointerup", up);
    });
    els.divider.addEventListener("dblclick", () => { state.split = 0.5; applyLayout(); });
  }

  document.addEventListener("keydown", e => {
    if (mode !== "request" || !req) return;
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); send(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); vscode.postMessage({ type: "save" }); }
    if (e.key === "Escape" && state.sending) vscode.postMessage({ type: "cancel" });
  });

  // =====================================================================
  // Environment editor
  // =====================================================================
  let envState = { environments: [], active: undefined, selected: undefined, inWorkspace: true };
  function initEnvironments() { app.innerHTML = ""; app.append(h("div", { class: "loading-app" }, h("img", { src: logo, alt: "" }))); }
  const saveEnvs = debounce(() => vscode.postMessage({ type: "saveEnvironments", environments: envState.environments }), 400);
  let envEditing = false;
  function envMessage(msg) {
    if (msg.type !== "environments") return;
    // While typing, keep the local copy: the saved version comes back with the same content.
    if (envEditing && !msg.select) { envState.active = msg.activeEnvironment; renderEnvList(); return; }
    envState.environments = msg.environments; envState.active = msg.activeEnvironment; envState.inWorkspace = msg.inWorkspace;
    if (msg.select) envState.selected = msg.select;
    if (!envState.environments.find(e => e.id === envState.selected)) envState.selected = envState.environments[0]?.id;
    buildEnvironments();
  }
  let envEls = {};
  function buildEnvironments() {
    app.innerHTML = "";
    envEls.list = h("div", { class: "env-list" });
    envEls.detail = h("div", { class: "env-detail" });
    app.append(h("div", { class: "env-page" },
      h("aside", {}, h("div", { class: "env-head" }, h("h2", {}, "Environments"), h("button", { class: "btn small primary", onclick: addEnv }, "+ New")), envEls.list),
      envEls.detail));
    renderEnvList(); renderEnvDetail();
  }
  function addEnv() {
    const env = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: `Environment ${envState.environments.length + 1}`, variables: [{ key: "baseUrl", value: "http://localhost:3000", enabled: true }] };
    envState.environments.push(env); envState.selected = env.id;
    saveEnvs(); renderEnvList(); renderEnvDetail();
  }
  function renderEnvList() {
    envEls.list.innerHTML = "";
    if (!envState.environments.length) envEls.list.append(h("p", { class: "empty-note" }, "No environments yet."));
    for (const env of envState.environments) {
      envEls.list.append(h("button", { class: `env-item${env.id === envState.selected ? " selected" : ""}`, onclick: () => { envState.selected = env.id; renderEnvList(); renderEnvDetail(); } },
        h("span", { class: `dot${env.id === envState.active ? " on" : ""}` }), h("span", { class: "env-name" }, env.name), h("span", { class: "env-count" }, env.variables.length)));
    }
  }
  function renderEnvDetail() {
    const box = envEls.detail;
    box.innerHTML = "";
    const env = envState.environments.find(e => e.id === envState.selected);
    if (!env) { box.append(h("div", { class: "state empty" }, h("img", { src: logo, alt: "" }), h("div", { class: "empty-title" }, "Create an environment"), h("p", {}, "Store base URLs and tokens for Dev, Staging and Production, and use them in requests as {{name}}."), h("button", { class: "btn primary", onclick: addEnv }, "+ New environment"))); return; }
    const isActive = env.id === envState.active;
    const touched = () => { envEditing = true; saveEnvs(); clearTimeout(envEls.t); envEls.t = setTimeout(() => (envEditing = false), 1200); };
    box.append(
      h("div", { class: "env-title" },
        h("input", { class: "name big", value: env.name, oninput: e => { env.name = e.target.value; renderEnvList(); touched(); } }),
        h("button", { class: `btn ${isActive ? "active-env" : "primary"}`, onclick: () => { envState.active = isActive ? undefined : env.id; vscode.postMessage({ type: "activate", id: envState.active }); renderEnvList(); renderEnvDetail(); } }, isActive ? "✓ Active" : "Use this environment"),
        h("button", { class: "btn danger", onclick: () => { envState.environments = envState.environments.filter(e => e !== env); if (envState.active === env.id) vscode.postMessage({ type: "activate", id: "" }); envState.selected = envState.environments[0]?.id; saveEnvs(); renderEnvList(); renderEnvDetail(); } }, "Delete")),
      h("p", { class: "help" }, "Use a variable anywhere in a request as ", h("code", {}, "{{name}}"), ". ", envState.inWorkspace ? "Shared values are saved in .veyra-api/environments.json for your team; private values only in environments.local.json on this computer, which git ignores." : "Values are saved in VS Code's storage on this computer."),
      kvTable(env.variables, touched, { keyLabel: "Variable", keyPlaceholder: "baseUrl", valuePlaceholder: "https://api.example.com", secret: true }),
      h("p", { class: "help" }, "Built-in values: ", ...DYNAMIC.map(d => h("code", {}, `{{${d}}}`)).flatMap((c, i) => (i ? [" ", c] : [c]))),
    );
  }
})();
