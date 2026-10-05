export const isMac = /Macintosh|Mac OS X/.test(navigator.userAgent);
export const isWindows = /Windows/.test(navigator.userAgent);

/** Convert a Mac-style shortcut label (⇧⌘P) into the host convention (Ctrl+Shift+P). */
export function keys(label: string) {
  if (isMac || !label) return label;
  const mods = [/[⌘⌃]/.test(label) ? "Ctrl" : "", label.includes("⇧") ? "Shift" : "", label.includes("⌥") ? "Alt" : ""].filter(Boolean);
  return [...mods, label.replace(/[⌘⌃⇧⌥]/g, "")].join("+");
}

export const revealLabel = isMac ? "Reveal in Finder" : isWindows ? "Reveal in File Explorer" : "Open Containing Folder";
export const trashLabel = isWindows ? "Recycle Bin" : "Trash";

/** Quote a path for the given shell so "Run Active File" works in PowerShell, cmd and POSIX shells. */
export function quoteForShell(shell: string, path: string) {
  if (/^cmd$/i.test(shell)) return `"${path}"`;
  if (/pwsh|powershell/i.test(shell)) return `'${path.replaceAll("'", "''")}'`;
  return `'${path.replaceAll("'", "'\\''")}'`;
}
