// The Rewind panel: a timeline you can scrub and play, and what the file looked like at that moment.
(function () {
  const vscode = acquireVsCodeApi();
  const app = document.getElementById("app");
  let state = { name: "", exists: true, entries: [], selected: "", view: "changes", playing: false, speed: 1, snapshot: null };
  let timer = 0;
  const saved = vscode.getState(); if (saved && saved.view) state.view = saved.view;

  const h = (tag, props, ...children) => {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (key === "class") el.className = value;
      else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
      else if (value === true) el.setAttribute(key, "");
      else if (value !== false && value !== undefined && value !== null) el.setAttribute(key, value);
    }
    for (const child of children.flat()) if (child !== null && child !== undefined && child !== false) el.append(child.nodeType ? child : document.createTextNode(String(child)));
    return el;
  };
  const index = () => state.entries.findIndex(e => e.id === state.selected);
  const select = i => {
    const entry = state.entries[Math.max(0, Math.min(state.entries.length - 1, i))];
    if (!entry || entry.id === state.selected) return;
    state.selected = entry.id; vscode.postMessage({ type: "select", id: entry.id }); render();
  };
  const stop = () => { state.playing = false; clearTimeout(timer); };
  function play() {
    if (state.playing) { stop(); render(); return; }
    if (index() >= state.entries.length - 1) select(0);
    state.playing = true; render(); step();
  }
  function step() {
    if (!state.playing) return;
    const i = index();
    if (i >= state.entries.length - 1) { stop(); render(); return; }
    select(i + 1);
    timer = setTimeout(step, 900 / state.speed);
  }

  function timeline() {
    const n = state.entries.length, i = index();
    const ticks = state.entries.map((e, k) => h("button", {
      class: "tick" + (k === i ? " current" : "") + (e.label ? " named" : "") + " r-" + e.reason.replace(/\s.*/, "").toLowerCase(),
      style: `left:${n > 1 ? (k / (n - 1)) * 100 : 50}%`, title: `${e.label ? e.label + " · " : ""}${e.when} · ${e.reason} · ${e.stats}`,
      "aria-label": `${e.when}, ${e.reason}`, onclick: () => { stop(); select(k); },
    }));
    const slider = h("input", { type: "range", min: 0, max: Math.max(0, n - 1), value: Math.max(0, i), "aria-label": "Move through time",
      oninput: event => { stop(); select(Number(event.target.value)); } });
    return h("section", { class: "timeline" },
      h("button", { class: "play" + (state.playing ? " on" : ""), title: state.playing ? "Pause" : "Play the file's story", "aria-label": state.playing ? "Pause" : "Play", onclick: play }, state.playing ? "❚❚" : "▶"),
      h("div", { class: "track" }, h("div", { class: "rail" }), ...ticks, slider),
      h("select", { class: "speed", "aria-label": "Playback speed", onchange: event => { state.speed = Number(event.target.value); } },
        ...[1, 2, 4, 8].map(s => h("option", { value: s, selected: s === state.speed }, s + "×"))),
    );
  }

  function changes(snapshot) {
    if (snapshot.same) return h("div", { class: "empty same" }, h("b", {}, "This is exactly what the file looks like now."), h("span", {}, "Move back in time to see what changed."));
    if (!snapshot.hunks.length) return h("div", { class: "empty" }, "Only whitespace or line endings differ.");
    return h("div", { class: "hunks" },
      h("p", { class: "legend" }, h("span", { class: "del" }, "Red"), " lines were there then and are gone now. ", h("span", { class: "add" }, "Green"), " lines were added since."),
      ...snapshot.hunks.map(hunk => {
        const removed = hunk.ops.filter(o => o.k === "d").map(o => o.t).join("\n");
        return h("div", { class: "hunk" },
          h("header", {}, h("span", {}, `Line ${hunk.oldStart} then · line ${hunk.newStart} now`),
            removed ? h("button", { class: "link", onclick: () => vscode.postMessage({ type: "copyText", text: removed }) }, "Copy the removed lines") : null),
          h("pre", {}, ...hunk.ops.map(o => h("div", { class: "line " + (o.k === "a" ? "add" : o.k === "d" ? "del" : "same") },
            h("span", { class: "no" }, o.k === "a" ? "" : o.o ?? ""), h("span", { class: "no" }, o.k === "d" ? "" : o.n ?? ""),
            h("span", { class: "sign" }, o.k === "a" ? "+" : o.k === "d" ? "−" : " "), h("code", {}, o.t || " ")))));
      }));
  }
  function version(snapshot) {
    return h("pre", { class: "version" }, ...snapshot.lines.map((line, k) => h("div", { class: "line" + (snapshot.focusLine === k + 1 ? " focus" : ""), id: "L" + (k + 1) },
      h("span", { class: "no" }, k + 1), h("code", {}, line || " "))));
  }

  function render() {
    vscode.setState({ view: state.view });
    app.replaceChildren();
    if (!state.entries.length) {
      app.append(h("div", { class: "empty big" }, h("div", { class: "logo" }), h("h1", {}, "No history yet"),
        h("p", {}, `Rewind keeps ${state.name || "this file"}'s history as you edit and save. Make a change and it appears here.`),
        h("button", { class: "primary", onclick: () => vscode.postMessage({ type: "checkpoint" }) }, "Take a checkpoint now")));
      return;
    }
    const i = index(), entry = state.entries[i], first = state.entries[0];
    const named = state.entries.filter(e => e.label).length;
    app.append(
      h("header", { class: "top" },
        h("div", { class: "title" }, h("div", { class: "logo" }), h("div", {}, h("h1", {}, state.name, !state.exists ? h("em", { class: "gone" }, "deleted") : null),
          h("small", {}, `${state.entries.length} snapshots since ${first.when}${named ? ` · ${named} checkpoint${named === 1 ? "" : "s"}` : ""}`))),
        h("div", { class: "actions" },
          h("button", { onclick: () => vscode.postMessage({ type: "checkpoint" }), title: "Name the file as it is now, to come back to later" }, "＋ Checkpoint"),
          h("button", { onclick: () => vscode.postMessage({ type: "compare", id: entry.id }), title: "Open VS Code's diff editor, where you can revert single blocks" }, "Compare in editor"),
          h("button", { class: "primary", disabled: state.snapshot && state.snapshot.same, onclick: () => vscode.postMessage({ type: "restore", id: entry.id }), title: "Put this version back. Ctrl+Z undoes it." }, "Restore this version"))),
      timeline(),
      h("section", { class: "moment" },
        h("div", {}, entry.label ? h("span", { class: "chip" }, "🔖 " + entry.label) : null,
          h("b", {}, entry.when), h("span", { class: "reason" }, entry.reason), h("span", { class: "stats" }, entry.stats), h("span", { class: "muted" }, `${entry.lines} lines · ${i + 1} of ${state.entries.length}`)),
        h("div", { class: "row" },
          h("button", { class: "link", onclick: () => vscode.postMessage({ type: "label", id: entry.id }) }, entry.label ? "Rename" : "Name it"),
          h("button", { class: "link", onclick: () => vscode.postMessage({ type: "copy", id: entry.id }) }, "Copy this version"),
          h("div", { class: "tabs", role: "tablist" },
            ...[["changes", "Changes since then"], ["version", "That version"]].map(([key, label]) => h("button", { role: "tab", "aria-selected": state.view === key ? "true" : "false", class: state.view === key ? "on" : "", onclick: () => { state.view = key; render(); } }, label))))),
      h("main", {}, !state.snapshot || state.snapshot.id !== entry.id ? h("div", { class: "empty" }, "Loading…") : state.view === "changes" ? changes(state.snapshot) : version(state.snapshot)),
    );
    const focus = document.querySelector(".line.focus");
    if (focus) focus.scrollIntoView({ block: "center" });
  }

  window.addEventListener("message", event => {
    const message = event.data;
    if (message.type === "history") {
      Object.assign(state, { name: message.name, exists: message.exists, entries: message.entries });
      if (!state.playing) state.selected = message.selected;
      render();
    } else if (message.type === "snapshot") {
      state.snapshot = message;
      if (message.focusLine) state.view = "version";
      if (message.id === state.selected) render();
    }
  });
  window.addEventListener("keydown", event => {
    if (event.target && /INPUT|SELECT/.test(event.target.tagName) && event.target.type !== "range") return;
    if (event.key === "ArrowLeft") { stop(); select(index() - 1); event.preventDefault(); }
    else if (event.key === "ArrowRight") { stop(); select(index() + 1); event.preventDefault(); }
    else if (event.key === "Home") { stop(); select(0); event.preventDefault(); }
    else if (event.key === "End") { stop(); select(state.entries.length - 1); event.preventDefault(); }
    else if (event.key === " ") { play(); event.preventDefault(); }
  });
  render();
  vscode.postMessage({ type: "ready" });
})();
