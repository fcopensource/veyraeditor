import { useEffect, useRef, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Download, Sparkles } from "lucide-react";

type Props = {
  /** Increment to run a manual check (Help → Check for Updates), which reports "up to date" and errors. */
  manualCheck: number;
  /** Resolve unsaved work before the installer restarts Veyra; false cancels the update. */
  beforeInstall: () => Promise<boolean>;
  notify: (message: string) => void;
};

const SIX_HOURS = 6 * 60 * 60 * 1000;

/** Signed auto-updates: checks shortly after launch and every six hours, then offers a one-click install. */
export function UpdateBanner({ manualCheck, beforeInstall, notify }: Props) {
  const [update, setUpdate] = useState<Update | null>(null);
  const [dismissed, setDismissed] = useState("");
  const [notes, setNotes] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const checking = useRef(false);

  async function lookForUpdate(manual: boolean) {
    if (checking.current) return;
    checking.current = true;
    if (manual) notify("Checking for updates…");
    try {
      const found = await check();
      if (found) { setUpdate(found); setDismissed(""); if (manual) notify(`Veyra ${found.version} is available`); }
      else if (manual) notify("Veyra is up to date");
    } catch (error) {
      // Background checks stay silent (offline, dev builds); manual checks explain what happened.
      if (manual) notify("Could not check for updates: " + String(error));
    } finally { checking.current = false; }
  }

  useEffect(() => {
    const first = window.setTimeout(() => void lookForUpdate(false), 15000);
    const timer = window.setInterval(() => void lookForUpdate(false), SIX_HOURS);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, []);
  useEffect(() => { if (manualCheck) void lookForUpdate(true); }, [manualCheck]);

  async function install() {
    if (!update || progress !== null || !await beforeInstall()) return;
    let total = 0, received = 0;
    setProgress(0);
    try {
      await update.downloadAndInstall(event => {
        if (event.event === "Started") total = event.data.contentLength || 0;
        else if (event.event === "Progress") { received += event.data.chunkLength; setProgress(total ? Math.min(99, Math.round(received / total * 100)) : 50); }
        else if (event.event === "Finished") setProgress(100);
      });
      notify(`Veyra ${update.version} installed. Restarting…`);
      await relaunch();
    } catch (error) {
      setProgress(null);
      notify("Update failed: " + String(error));
    }
  }

  if (!update || dismissed === update.version) return null;
  return <aside className="update-banner" role="status" aria-label="Update available">
    <Sparkles size={18}/>
    <div>
      <b>Veyra {update.version} is ready</b>
      <span>You have {update.currentVersion}. {update.body && <button className="text-button" onClick={() => setNotes(v => !v)}>{notes ? "Hide" : "What's new"}</button>}</span>
      {notes && update.body && <pre>{update.body}</pre>}
      {progress !== null && <div className="update-progress" aria-label={`Downloading ${progress}%`}><i style={{ width: progress + "%" }}/></div>}
    </div>
    <div className="update-actions">
      {progress === null && <button className="secondary" onClick={() => setDismissed(update.version)}>Later</button>}
      <button className="primary" disabled={progress !== null} onClick={() => void install()}><Download size={14}/>{progress === null ? "Update & restart" : progress >= 100 ? "Restarting…" : `Downloading ${progress}%`}</button>
    </div>
  </aside>;
}
