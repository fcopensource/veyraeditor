import ReactDOM from "react-dom/client";
import App from "./App";
import { version } from "../package.json";

const splash = document.getElementById("splash");
const status = document.getElementById("splash-status");
const versionLabel = document.getElementById("splash-version");
if (versionLabel) versionLabel.textContent = "Version " + version;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App />,
);

/* The launch screen stays long enough for its animation in the desktop app (about 2.5 s from start) and fills its
   progress bar as it goes. It goes at once in a browser preview or test, where there is no real Tauri window,
   unless the address has ?splash (to see it in a browser). */
const desktop = !!(window as { __TAURI_INTERNALS__?: { metadata?: unknown } }).__TAURI_INTERNALS__?.metadata;
const preview = new URLSearchParams(location.search).has("splash");
if (splash) {
  if (!desktop && !preview) splash.remove();
  else {
    const progress = (p: number) => splash.style.setProperty("--p", String(p));
    const steps: [string, number][] = [["Loading the editor…", .38], ["Preparing your workspace…", .7], ["Almost ready…", .9]];
    progress(.18);
    steps.forEach(([text, p], i) => setTimeout(() => { if (status) status.textContent = text; progress(p); }, 450 + i * 600));
    requestAnimationFrame(() => setTimeout(() => {
      progress(1);
      setTimeout(() => {
        splash.classList.add("done");
        setTimeout(() => splash.remove(), 700);
      }, 260);
    }, Math.max(0, 2350 - performance.now())));
  }
}
