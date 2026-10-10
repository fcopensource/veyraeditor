import { useEffect, useState } from "react";
import { Download, Sparkles } from "lucide-react";
import { installUpdate, lookForUpdate, useUpdate } from "./updater";

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
  const { update, progress } = useUpdate();
  const [dismissed, setDismissed] = useState("");
  const [notes, setNotes] = useState(false);

  useEffect(() => {
    const first = window.setTimeout(() => void lookForUpdate(false, notify), 15000);
    const timer = window.setInterval(() => void lookForUpdate(false, notify), SIX_HOURS);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, []);
  useEffect(() => { if (manualCheck) void lookForUpdate(true, notify); }, [manualCheck]);

  // "Later" hides the banner; the title-bar button keeps offering the update.
  if (!update || (dismissed === update.version && progress === null)) return null;
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
      <button className="primary" disabled={progress !== null} onClick={() => void installUpdate(beforeInstall, notify)}><Download size={14}/>{progress === null ? "Update & restart" : progress >= 100 ? "Restarting…" : `Downloading ${progress}%`}</button>
    </div>
  </aside>;
}
