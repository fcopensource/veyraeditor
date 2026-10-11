// Veyra Live Server: live reload client, injected into every HTML page the server sends.
// Shared by the VS Code extension and by Veyra's built-in server, so pages behave the same in both.
// Events: "reload" reloads the page; "css" swaps changed stylesheets in place without a reload.
(function () {
  if (window.__veyraLiveReload) return;
  window.__veyraLiveReload = true;

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
    if (!swapped) location.reload();
  }

  var wasOpen = false;
  function connect() {
    var events = new EventSource("/__veyra_live/events");
    events.addEventListener("reload", function () { location.reload(); });
    events.addEventListener("css", refreshStyles);
    events.onopen = function () {
      // The server restarted while this page was open: show the latest files.
      if (wasOpen) location.reload();
      wasOpen = true;
    };
    events.onerror = function () {
      events.close();
      setTimeout(connect, 1000);
    };
  }
  connect();
})();
