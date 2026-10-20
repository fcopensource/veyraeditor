// Veyra Container Studio webview: the Logs panel and the Dashboard.
(function () {
  "use strict";
  const vscode = acquireVsCodeApi();
  const app = document.getElementById("app");
  const mode = document.body.dataset.mode;
  const logo = document.body.dataset.logo;

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "class") el.className = v;
      else if (k === "style") el.setAttribute("style", v);
      else if (k in el && typeof v !== "string") el[k] = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) if (c !== undefined && c !== null && c !== false) el.append(c instanceof Node ? c : String(c));
    return el;
  }
  const fmtSize = bytes => {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.min(units.length - 1, Math.floor(Math.log10(Math.abs(bytes)) / 3));
    const v = bytes / 1000 ** i;
    return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
  };
  let toastTimer;
  function toast(text, kind) {
    document.querySelector(".toast")?.remove();
    const el = h("div", { class: `toast ${kind || ""}`, role: "status" }, text);
    document.body.append(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), kind === "error" ? 7000 : 2600);
  }

  // ---------- ANSI colours in logs ----------
  const ANSI = { 30: "black", 31: "red", 32: "green", 33: "yellow", 34: "blue", 35: "magenta", 36: "cyan", 37: "white", 90: "gray", 91: "red", 92: "green", 93: "yellow", 94: "blue", 95: "magenta", 96: "cyan", 97: "white" };
  /** Splits a line with ANSI escape codes into styled spans. Unknown codes are dropped. */
  function ansi(text) {
    const out = [];
    let fg = "", bold = false, dim = false, last = 0;
    const re = /\x1b\[([\d;]*)m|\x1b\[[\d;?]*[A-Za-z]|\x1b\][^\x07]*\x07/g;
    const push = s => { if (!s) return; out.push(fg || bold || dim ? h("span", { class: [fg && `a-${fg}`, bold && "a-bold", dim && "a-dim"].filter(Boolean).join(" ") }, s) : s); };
    let match;
    while ((match = re.exec(text))) {
      push(text.slice(last, match.index));
      last = re.lastIndex;
      if (match[1] === undefined) continue;
      const codes = match[1] === "" ? [0] : match[1].split(";").map(Number);
      for (let i = 0; i < codes.length; i++) {
        const c = codes[i];
        if (c === 0) { fg = ""; bold = false; dim = false; }
        else if (c === 1) bold = true;
        else if (c === 2) dim = true;
        else if (c === 22) { bold = false; dim = false; }
        else if (c === 39) fg = "";
        else if (ANSI[c]) fg = ANSI[c];
        else if (c === 38 || c === 48) i += codes[i + 1] === 5 ? 2 : 4; // 256 / true colour: skip
      }
    }
    push(text.slice(last));
    return out;
  }
  const plain = text => text.replace(/\x1b\[[\d;?]*[A-Za-z]|\x1b\][^\x07]*\x07/g, "");
  const PROBLEM = /\b(error|err|fatal|panic|exception|traceback|failed|failure|unhandled|crit(ical)?)\b/i;
  const WARN = /\b(warn(ing)?|deprecated)\b/i;
  const SOURCE_COLORS = ["#4fc1ff", "#c586c0", "#4ec9b0", "#dcdcaa", "#f48771", "#9cdcfe", "#ce9178", "#b5cea8"];
  const sourceColor = name => SOURCE_COLORS[[...name].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) % SOURCE_COLORS.length];

  // ---------- Logs ----------
  function logs() {
    const MAX = 20000;
    const S = { lines: [], follow: true, time: false, wrap: false, problems: false, filter: "", live: false, target: null, ended: null };
    let list, count, status, follow, jump, filterInput;

    const matches = l => (!S.problems || l.err || PROBLEM.test(l.plain)) && (!S.filter || l.plain.toLowerCase().includes(S.filter) || (l.source || "").toLowerCase().includes(S.filter));
    function lineEl(l) {
      const cls = ["line", l.err && "stderr", PROBLEM.test(l.plain) ? "problem" : WARN.test(l.plain) ? "warn" : ""].filter(Boolean).join(" ");
      const text = h("span", { class: "text" }, ...(S.filter ? highlight(l) : ansi(l.text)));
      return h("div", { class: cls },
        l.time ? h("time", { title: l.time }, localTime(l.time)) : h("time", {}, ""),
        l.source ? h("span", { class: "src", style: `color:${sourceColor(l.source)}` }, l.source) : null,
        text);
    }
    function highlight(l) {
      const lower = l.plain.toLowerCase(), out = [];
      let at = 0, i;
      while (S.filter && (i = lower.indexOf(S.filter, at)) >= 0) { out.push(l.plain.slice(at, i), h("mark", {}, l.plain.slice(i, i + S.filter.length))); at = i + S.filter.length; }
      out.push(l.plain.slice(at));
      return out;
    }
    const localTime = iso => { const d = new Date(iso); return isNaN(d) ? "" : `${d.toLocaleTimeString([], { hour12: false })}.${String(d.getMilliseconds()).padStart(3, "0")}`; };
    function renderAll() {
      const shown = S.lines.filter(matches).slice(-5000);
      list.replaceChildren(...shown.map(lineEl));
      if (!S.lines.length) list.append(h("div", { class: "empty" }, S.ended !== null ? "No logs." : "Waiting for logs…"));
      else if (!shown.length) list.append(h("div", { class: "empty" }, "No lines match."));
      updateCount();
      if (S.follow) scrollEnd();
    }
    function updateCount() {
      const shown = S.filter || S.problems ? S.lines.filter(matches).length : S.lines.length;
      count.textContent = S.filter || S.problems ? `${shown.toLocaleString()} of ${S.lines.length.toLocaleString()} lines` : `${S.lines.length.toLocaleString()} lines`;
    }
    const scrollEnd = () => { list.scrollTop = list.scrollHeight; };
    function setFollow(on) { S.follow = on; follow.classList.toggle("on", on); jump.hidden = on; if (on) scrollEnd(); }
    function setStatus() {
      status.className = `live ${S.live ? "on" : ""}`;
      status.textContent = S.live ? "Live" : S.ended === null ? "Connecting…" : "Stopped";
      stopBtn.textContent = S.live ? "Stop" : "Resume";
    }
    const toggle = (key, btn) => () => { S[key] = !S[key]; btn.classList.toggle("on", S[key]); if (key === "wrap") list.classList.toggle("wrap", S.wrap); if (key === "time") list.classList.toggle("times", S.time); renderAll(); };
    const exportText = () => S.lines.filter(matches).map(l => [S.time && l.time, l.source && `${l.source} |`, l.plain].filter(Boolean).join(" ")).join("\n");

    const timeBtn = h("button", { class: "chip", title: "Show timestamps" }, "Time");
    const wrapBtn = h("button", { class: "chip", title: "Wrap long lines" }, "Wrap");
    const probBtn = h("button", { class: "chip", title: "Only errors and lines printed to stderr" }, "Problems only");
    const stopBtn = h("button", { class: "btn small", onclick: () => vscode.postMessage({ type: S.live ? "stop" : "reattach" }) }, "Stop");
    timeBtn.onclick = toggle("time", timeBtn); wrapBtn.onclick = toggle("wrap", wrapBtn); probBtn.onclick = toggle("problems", probBtn);
    follow = h("button", { class: "chip on", title: "Keep showing the newest lines", onclick: () => setFollow(!S.follow) }, "Follow");
    filterInput = h("input", { class: "search", type: "search", placeholder: "Filter lines (Ctrl+F)", oninput: e => { S.filter = e.target.value.toLowerCase(); renderAll(); } });
    status = h("span", { class: "live" }, "Connecting…");
    count = h("span", { class: "count" }, "");
    list = h("div", { class: "log-list", tabindex: "0", onscroll: () => { const atEnd = list.scrollHeight - list.scrollTop - list.clientHeight < 30; if (S.follow !== atEnd) setFollow(atEnd); } });
    jump = h("button", { class: "jump", hidden: true, onclick: () => setFollow(true) }, "↓ Newest");
    const title = h("strong", { class: "log-title" }, "Logs");

    app.replaceChildren(h("div", { class: "logs" },
      h("header", { class: "log-bar" },
        h("img", { src: logo, alt: "", class: "mini-logo" }), title, status,
        h("div", { class: "grow" }, filterInput),
        follow, timeBtn, wrapBtn, probBtn,
        h("span", { class: "sep" }),
        stopBtn,
        h("button", { class: "btn small", title: "Clear the view (the container keeps its logs)", onclick: () => { S.lines = []; renderAll(); } }, "Clear"),
        h("button", { class: "btn small", onclick: () => vscode.postMessage({ type: "copy", text: exportText(), count: S.lines.filter(matches).length }) }, "Copy"),
        h("button", { class: "btn small", onclick: () => vscode.postMessage({ type: "save", text: exportText() }) }, "Save…"),
        h("button", { class: "btn small", title: "Open in an editor tab", onclick: () => vscode.postMessage({ type: "openEditor", text: exportText() }) }, "Open")),
      h("div", { class: "log-wrap" }, list, jump),
      h("footer", { class: "log-foot" }, count)));
    renderAll();
    document.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") { e.preventDefault(); filterInput.focus(); filterInput.select(); } });

    window.addEventListener("message", ({ data: msg }) => {
      switch (msg.type) {
        case "init": S.target = msg.target; title.textContent = msg.target.name; break;
        case "attached": S.live = true; S.ended = null; S.lines = []; renderAll(); setStatus(); break;
        case "lines": {
          const added = msg.lines.map(l => ({ ...l, plain: plain(l.text) }));
          const wasEmpty = !S.lines.length;
          S.lines.push(...added);
          const overflow = S.lines.length - MAX;
          if (overflow > 0) S.lines.splice(0, overflow);
          if (wasEmpty || overflow > 0) renderAll();
          else {
            const shown = added.filter(matches);
            list.append(...shown.map(lineEl));
            while (list.childElementCount > 5000) list.firstElementChild.remove();
            updateCount();
            if (S.follow) scrollEnd();
          }
          break;
        }
        case "ended":
          S.live = false; S.ended = msg.code;
          setStatus();
          if (!S.lines.length) renderAll();
          if (!msg.stopped && msg.code) toast("The log stream stopped. The container may have been removed.", "error");
          break;
        case "toast": toast(msg.text, msg.kind); break;
      }
    });
  }

  // ---------- Dashboard ----------
  function dashboard() {
    const S = { state: null, pruning: undefined };
    const send = msg => vscode.postMessage(msg);
    const bar = (pct, label, cls) => h("div", { class: `meter ${cls || ""}`, title: label },
      h("div", { class: "meter-fill", style: `width:${Math.max(0, Math.min(100, pct)).toFixed(1)}%` }), h("span", {}, label));

    function render() {
      const st = S.state;
      if (!st) { app.replaceChildren(h("div", { class: "loading" }, h("img", { src: logo, alt: "" }))); return; }
      const header = h("header", { class: "dash-head" },
        h("img", { src: logo, alt: "", class: "logo" }),
        h("div", {}, h("h1", {}, "Docker Dashboard"),
          h("div", { class: "muted" }, st.version ? `Docker ${st.version.server} · ${st.version.os}${st.version.context ? ` · context ${st.version.context}` : ""}` : st.error ? st.error.title : "Connecting…")),
        h("div", { class: "grow" }),
        h("button", { class: "btn", onclick: () => send({ type: "command", command: "pullImage" }) }, "Pull Image"),
        h("button", { class: "btn primary", onclick: () => send({ type: "command", command: "runImage" }) }, "Run Image"),
        h("button", { class: "btn icon", title: "Refresh", onclick: () => { send({ type: "command", command: "refresh" }); send({ type: "refreshDisk" }); } }, "⟳"));

      if (st.error) {
        app.replaceChildren(header, h("section", { class: "state-card" },
          h("div", { class: "big-icon" }, "!"), h("h2", {}, st.error.title), h("p", {}, st.error.detail),
          h("div", { class: "row" },
            st.error.action === "startDocker" ? h("button", { class: "btn primary", onclick: () => send({ type: "command", command: "startDocker" }) }, "Start Docker") : null,
            h("button", { class: "btn", onclick: () => send({ type: "command", command: "refresh" }) }, "Try again"))));
        return;
      }

      const c = st.counts;
      const diskTotal = (st.disk || []).reduce((a, d) => a + d.size, 0);
      const reclaim = (st.disk || []).reduce((a, d) => a + d.reclaimable, 0);
      const tiles = h("section", { class: "tiles" },
        tile("Running", `${c.running}`, `of ${c.containers} containers`, c.running ? "ok" : ""),
        tile("Images", `${c.images}`, c.dangling ? `${c.dangling} untagged` : "all tagged"),
        tile("Volumes", `${c.volumes}`, "named and anonymous"),
        tile("Disk used", st.disk ? fmtSize(diskTotal) : "…", st.disk ? (reclaim ? `${fmtSize(reclaim)} can be freed` : "nothing to free") : "measuring", reclaim > 1e9 ? "warn" : ""));

      const containers = [...st.containers].sort((a, b) => rank(a) - rank(b) || (a.project || "~").localeCompare(b.project || "~") || a.name.localeCompare(b.name));
      const table = h("section", { class: "panel" },
        h("div", { class: "panel-head" }, h("h2", {}, "Containers"), h("span", { class: "muted" }, c.running ? "CPU and memory update every few seconds" : "")),
        containers.length ? h("div", { class: "ctable" },
          h("div", { class: "crow head" }, h("span", {}, ""), h("span", {}, "Name"), h("span", {}, "Ports"), h("span", {}, "CPU"), h("span", {}, "Memory"), h("span", {}, "")),
          ...containers.map(row)) : h("p", { class: "muted pad" }, "No containers yet. Run an image, or click ▶ Compose Up above a compose file."));

      const cleanup = h("section", { class: "panel", id: "cleanup" },
        h("div", { class: "panel-head" }, h("h2", {}, "Clean up"), h("span", { class: "muted" }, st.disk ? (reclaim ? `You can free about ${fmtSize(reclaim)}` : "Nothing to free right now") : "Measuring disk use…")),
        h("div", { class: "clean-grid" },
          clean("Stopped containers", `${c.stopped} stopped`, disk(st, "Containers"), "containers", "Remove stopped", c.stopped === 0),
          clean("Untagged images", `${c.dangling} left over from builds`, null, "danglingImages", "Remove untagged", c.dangling === 0),
          clean("Unused images", "Images no container uses", disk(st, "Images"), "unusedImages", "Remove unused", false, true),
          clean("Build cache", "Layers kept to speed up builds", disk(st, "Build Cache"), "buildCache", "Clear cache"),
          clean("Unused volumes", "Anonymous volumes no container uses", disk(st, "Local Volumes"), "volumes", "Delete unused", false, true),
          clean("Unused networks", "Networks no container uses", null, "networks", "Remove unused")));

      app.replaceChildren(header, tiles, table, cleanup);
    }
    const rank = r => (r.state === "running" ? 0 : r.state === "paused" || r.state === "restarting" ? 1 : 2);
    const disk = (st, type) => (st.disk || []).find(d => d.type === type);
    const tile = (label, value, note, cls) => h("div", { class: `tile ${cls || ""}` }, h("small", {}, label), h("strong", {}, value), h("span", {}, note));
    function clean(title, note, usage, what, label, disabled, danger) {
      const busy = S.pruning === what;
      return h("div", { class: "clean" },
        h("div", {}, h("strong", {}, title), h("small", {}, note)),
        h("div", { class: "clean-size" }, usage ? h("span", {}, fmtSize(usage.size)) : null, usage && usage.reclaimable ? h("small", {}, `${fmtSize(usage.reclaimable)} unused`) : null),
        h("button", { class: `btn small ${danger ? "danger" : ""}`, disabled: disabled || !!S.pruning, onclick: () => send({ type: "prune", what }) }, busy ? "Working…" : label));
    }
    function row(r) {
      const running = r.state === "running";
      const s = r.stats;
      const dot = r.health === "unhealthy" ? "bad" : running ? (r.health === "starting" ? "warn" : "ok") : r.state === "paused" || r.state === "restarting" ? "warn" : /code [1-9]/.test(r.status) ? "bad" : "off";
      const action = (name, label, title, cls) => h("button", { class: `btn tiny ${cls || ""}`, title, onclick: () => send({ type: "container", id: r.id, action: name }) }, label);
      return h("div", { class: `crow ${running ? "" : "dim"}` },
        h("span", { class: `dot ${dot}`, title: r.health || r.state }),
        h("span", { class: "cname" }, h("strong", {}, r.service || r.name), h("small", {}, [r.project && `${r.project} · `, r.image, " · ", r.status].filter(Boolean).join(""))),
        h("span", { class: "ports" }, ...(r.ports.length ? r.ports.map(p => h("a", { href: "#", title: `${p.url} → container port ${p.container}`, onclick: e => { e.preventDefault(); send({ type: "open", url: p.url }); } }, String(p.host))) : [h("small", { class: "muted" }, "–")])),
        h("span", {}, running && s ? bar(s.cpu, `${s.cpu.toFixed(1)}%`, s.cpu > 80 ? "hot" : "") : h("small", { class: "muted" }, running ? "…" : "–")),
        h("span", {}, running && s ? bar(s.memPercent, `${fmtSize(s.memUsed)}${s.memLimit ? ` / ${fmtSize(s.memLimit)}` : ""}`, s.memPercent > 85 ? "hot" : "") : h("small", { class: "muted" }, running ? "…" : "–")),
        h("span", { class: "actions" },
          action("logs", "Logs", "View logs"),
          running ? action("shell", "Shell", "Open a shell inside") : null,
          running ? action("stop", "Stop", "Stop") : r.state === "paused" ? action("unpause", "Resume", "Resume") : action("start", "Start", "Start", "go"),
          action("restart", "⟳", "Restart"),
          action("remove", "✕", "Remove", "danger")));
    }

    render();
    window.addEventListener("message", ({ data: msg }) => {
      switch (msg.type) {
        case "state": S.state = msg; render(); break;
        case "pruning": S.pruning = msg.what; render(); break;
        case "focusCleanup": setTimeout(() => document.getElementById("cleanup")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); break;
        case "toast": toast(msg.text, msg.kind); break;
      }
    });
  }

  if (mode === "logs") logs(); else dashboard();
  vscode.postMessage({ type: "ready" });
})();
