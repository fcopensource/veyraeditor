import { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/* One shared update state, so the update banner and the title-bar account button always agree. */
export type UpdateState = { update: Update | null; progress: number | null };
let state: UpdateState = { update: null, progress: null };
const listeners = new Set<(state: UpdateState) => void>();
const set = (next: Partial<UpdateState>) => { state = { ...state, ...next }; listeners.forEach(listener => listener(state)); };
let checking = false;

/** The current update state, re-rendering when it changes. */
export function useUpdate() {
  const [value, setValue] = useState(state);
  useEffect(() => { listeners.add(setValue); setValue(state); return () => { listeners.delete(setValue); }; }, []);
  return value;
}

/** Ask the update server. Background checks stay silent; manual checks report what happened. */
export async function lookForUpdate(manual: boolean, notify: (message: string) => void) {
  if (checking) return;
  checking = true;
  if (manual) notify("Checking for updates…");
  try {
    const found = await check();
    if (found) { set({ update: found }); if (manual) notify(`Veyra ${found.version} is available`); }
    else if (manual) notify("Veyra is up to date");
  } catch (error) {
    if (manual) notify("Could not check for updates: " + String(error));
  } finally { checking = false; }
}

/** Download, install and restart. Unsaved work is resolved first by `beforeInstall`. */
export async function installUpdate(beforeInstall: () => Promise<boolean>, notify: (message: string) => void) {
  const update = state.update;
  if (!update || state.progress !== null || !await beforeInstall()) return;
  let total = 0, received = 0;
  set({ progress: 0 });
  try {
    await update.downloadAndInstall(event => {
      if (event.event === "Started") total = event.data.contentLength || 0;
      else if (event.event === "Progress") { received += event.data.chunkLength; set({ progress: total ? Math.min(99, Math.round(received / total * 100)) : 50 }); }
      else if (event.event === "Finished") set({ progress: 100 });
    });
    notify(`Veyra ${update.version} installed. Restarting…`);
    await relaunch();
  } catch (error) {
    set({ progress: null });
    notify("Update failed: " + String(error));
  }
}
