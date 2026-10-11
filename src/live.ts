import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

/* Live Server: serves the open folder on http://127.0.0.1:5500 and reloads the browser on save.
   The server itself is native (src-tauri/src/live_server.rs); the same features ship for VS Code in
   extensions/live-server, sharing the browser script. */

export type LiveInfo = { port: number; url: string; page: string };

let current: LiveInfo | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export const liveServer = () => current;
export const useLiveServer = () => useSyncExternalStore(subscribe, liveServer);
export const isHtml = (path: string) => /\.html?$/i.test(path);

let activePath = "";
/** The workbench reports the active file, so Go Live opens the page being edited. */
export const setLiveActive = (path: string) => { activePath = path; };

/** Start (or reuse) the server and open `path` in the browser: an HTML file, or the folder's index. */
export async function goLive(path = activePath) {
  const info = await invoke<LiveInfo>("live_start", { path: isHtml(path) ? path : null });
  current = info; changed();
  await openUrl(info.page).catch(() => {});
  return info;
}

export async function goOffline() {
  await invoke("live_stop");
  current = null; changed();
}

/** Stops the server without waiting, for example when the folder is closed. */
export function stopLiveServer() { if (current) void goOffline().catch(() => {}); }
