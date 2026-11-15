// Veyra Live Server: live reload client, injected into every HTML page the server sends.
// Shared by the VS Code extension and by Veyra's built-in server, so pages behave the same in both.
// Events: "reload" reloads the page; "css" swaps changed stylesheets in place without a reload.
// After a reload the page comes back at the same scroll position. When the script tag has data-console
// (VS Code with the browser console on), console messages and errors are also sent to the editor.
(function () {
  if (window.__veyraLiveReload) return;
  window.__veyraLiveReload = true;
  var me = document.currentScript;

  // ---- Keep the scroll position across reloads
  var SCROLL_KEY = "__veyra_scroll:" + location.pathname + location.search;
  function reload() {
    try { sessionStorage.setItem(SCROLL_KEY, JSON.stringify([window.scrollX, window.scrollY, Date.now()])); } catch (e) { /* private mode */ }
    location.reload();
  }
  try {
    var saved = JSON.parse(sessionStorage.getItem(SCROLL_KEY) || "null");
    sessionStorage.removeItem(SCROLL_KEY);
    // Only right after our own reload (not if you come back to the page later).
    if (saved && Date.now() - saved[2] < 10000) {
      var restore = function () { window.scrollTo(saved[0], saved[1]); };
      if (document.readyState === "complete") restore(); else window.addEventListener("load", restore);
      if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    }
  } catch (e) { /* no storage */ }

  function refreshStyles() {
    var links = document.querySelectorAll('link[rel~="stylesheet"][href]');
    var swapped = 0;
    links.forEach(function (link) {
      var url = new URL(link.href, location.href);
      if (url.origin !== location.origin) return;
      url.searchParams.set("_veyra", String(Date.now()));
      var next = link.cloneNode();
      next.href = url.href;
      next.onload = next.onerror = function () { link.remove(); };
      link.after(next);
      swapped++;
    });
    // Styles from <style> blocks or @import can't be swapped: reload instead.
    if (!swapped) reload();
  }

  // ---- Browser console in the editor (only when the server asks for it)
  if (me && me.hasAttribute("data-console") && navigator.sendBeacon) {
    var describe = function (value) {
      if (value instanceof Error) return value.stack || (value.name + ": " + value.message);
      if (typeof value === "string") return value;
      if (value === undefined) return "undefined";
      if (typeof value === "function") return "ƒ " + (value.name || "anonymous") + "()";
      if (value instanceof Element) return "<" + value.tagName.toLowerCase() + (value.id ? "#" + value.id : "") + ">";
      try {
        var seen = [];
        return JSON.stringify(value, function (k, v) {
          if (typeof v === "object" && v !== null) { if (seen.indexOf(v) >= 0) return "[Circular]"; seen.push(v); }
          return typeof v === "bigint" ? v.toString() + "n" : v;
        }, 2);
      } catch (e) { return String(value); }
    };
    var post = function (level, parts) {
      try {
        var text = Array.prototype.map.call(parts, describe).join(" ");
        navigator.sendBeacon("/__veyra_live/log", new Blob([JSON.stringify({ level: level, text: text, page: location.pathname })], { type: "text/plain" }));
      } catch (e) { /* never break the page */ }
    };
    ["log", "info", "warn", "error", "debug"].forEach(function (level) {
      var original = console[level];
      console[level] = function () { post(level, arguments); return original.apply(console, arguments); };
    });
    window.addEventListener("error", function (event) {
      var where = event.filename ? " (" + event.filename.replace(location.origin, "") + ":" + event.lineno + ":" + event.colno + ")" : "";
      post("error", [(event.error && event.error.stack) || ("Uncaught " + event.message + where)]);
    });
    window.addEventListener("unhandledrejection", function (event) {
      post("error", ["Unhandled promise rejection: ", event.reason]);
    });
  }

  var wasOpen = false;
  function connect() {
    var events = new EventSource("/__veyra_live/events");
    events.addEventListener("reload", reload);
    events.addEventListener("css", refreshStyles);
    events.onopen = function () {
      // The server restarted while this page was open: show the latest files.
      if (wasOpen) reload();
      wasOpen = true;
    };
    events.onerror = function () {
      events.close();
      setTimeout(connect, 1000);
    };
  }
  connect();
})();
