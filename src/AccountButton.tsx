import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowDownToLine, LoaderCircle, LogIn } from "lucide-react";
import { installUpdate, useUpdate } from "./updater";

const SITE = "https://veyraeditor.com";
type Account = { name: string; email: string };
/** Tell the title bar the Veyra account changed (signed in or out in the AI panel). */
export const accountChanged = () => window.dispatchEvent(new Event("veyra-account"));

/**
 * The title bar's right-corner button. Normally "Sign in" (opens veyraeditor.com) or your name when signed in;
 * when an update is ready it becomes "Update", shows progress while installing, and Veyra restarts on the new version.
 */
export function AccountButton({ beforeInstall, notify }: { beforeInstall: () => Promise<boolean>; notify: (message: string) => void }) {
  const { update, progress } = useUpdate();
  const [account, setAccount] = useState<Account | null>(null);
  const lastCheck = useRef(0);

  useEffect(() => {
    const load = (force = false) => {
      if (!force && Date.now() - lastCheck.current < 60_000) return;
      lastCheck.current = Date.now();
      invoke<Account | null>("veyra_account").then(result => setAccount(result?.email ? result : null)).catch(() => {});
    };
    const changed = () => load(true), focused = () => load();
    load(true);
    window.addEventListener("veyra-account", changed);
    window.addEventListener("focus", focused);
    return () => { window.removeEventListener("veyra-account", changed); window.removeEventListener("focus", focused); };
  }, []);

  if (progress !== null) return <button className="account-button updating" disabled aria-label={`Updating Veyra, ${progress}%`}>
    <LoaderCircle size={14} className="spin" />{progress >= 100 ? "Restarting…" : `Updating ${progress}%`}
  </button>;
  if (update) return <button className="account-button update" title={`Veyra ${update.version} is ready · install and restart`} aria-label={`Update Veyra to ${update.version}`}
    onClick={() => void installUpdate(beforeInstall, notify)}>
    <ArrowDownToLine size={14} />Update<i aria-hidden="true" />
  </button>;
  if (account) {
    const first = account.name.trim().split(/\s+/)[0] || account.email;
    return <button className="account-button signed-in" title={`${account.name} · ${account.email}\nOpen your account on veyraeditor.com`} aria-label={`Account: ${account.name}`}
      onClick={() => void openUrl(SITE + "/dashboard").catch(() => {})}>
      <span className="account-avatar">{first.slice(0, 1).toUpperCase()}</span>{first}
    </button>;
  }
  return <button className="account-button" title="Sign in or create a free account on veyraeditor.com" aria-label="Sign in"
    onClick={() => void openUrl(SITE + "/login?next=/dashboard").catch(() => notify("Open veyraeditor.com/login in your browser to sign in."))}>
    <LogIn size={14} />Sign in
  </button>;
}
