import { useEffect } from "react";
import { lookForUpdate } from "./updater";

type Props = {
  /** Increment to run a manual check (Help → Check for Updates), which reports "up to date" and errors. */
  manualCheck: number;
  notify: (message: string) => void;
};

const SIX_HOURS = 6 * 60 * 60 * 1000;

/** Signed auto-updates: checks shortly after launch and every six hours. Nothing is shown here: when an update
    is ready, the title bar's account button turns into "Update" (AccountButton), the one place updates appear. */
export function UpdateChecker({ manualCheck, notify }: Props) {
  useEffect(() => {
    const first = window.setTimeout(() => void lookForUpdate(false, notify), 15000);
    const timer = window.setInterval(() => void lookForUpdate(false, notify), SIX_HOURS);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, []);
  useEffect(() => { if (manualCheck) void lookForUpdate(true, notify); }, [manualCheck]);
  return null;
}
