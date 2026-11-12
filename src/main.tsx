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

/* The launch screen stays long enough for its animation in the desktop app (about 2 s from start),
   and goes at once in a browser preview or test, where there is no real Tauri window. */
const desktop = !!(window as { __TAURI_INTERNALS__?: { metadata?: unknown } }).__TAURI_INTERNALS__?.metadata;
if (splash) {
  if (!desktop) splash.remove();
  else {
    const steps = ["Loading the editor…", "Preparing your workspace…", "Almost ready…"];
    steps.forEach((text, i) => setTimeout(() => { if (status) status.textContent = text; }, 400 + i * 550));
    requestAnimationFrame(() => setTimeout(() => {
      splash.classList.add("done");
      setTimeout(() => splash.remove(), 500);
    }, Math.max(0, 2000 - performance.now())));
  }
}
