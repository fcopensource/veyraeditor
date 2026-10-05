import { useEffect, useRef } from "react";
import { Terminal as XTerminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Channel, invoke } from "@tauri-apps/api/core";
import "@xterm/xterm/css/xterm.css";

const dark: ITheme = { background: "#13171e", foreground: "#ced8e5", cursor: "#80d6cb", selectionBackground: "#35485f" };
const light: ITheme = { background: "#fbfcfe", foreground: "#2b3a4f", cursor: "#277b6c", selectionBackground: "#cfe3f7", black: "#2b3a4f", white: "#8a96a8", brightWhite: "#5c6a7e", yellow: "#9a6b00", brightYellow: "#8a5d00" };

/** Dispatch `veyra-terminal` with {sessionId, action} to control a session from outside (e.g. the Clear Terminal menu item). */
export function terminalAction(sessionId: number, action: "clear" | "focus") { window.dispatchEvent(new CustomEvent("veyra-terminal", { detail: { sessionId, action } })); }

export function Terminal({ root, sessionId, active, fontSize = 13, lightTheme = false }: { root: string; sessionId: number; active: boolean; fontSize?: number; lightTheme?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<XTerminal | null>(null);
  const fit = useRef<FitAddon | null>(null);
  useEffect(() => {
    if (!host.current || !root) return;
    let disposed = false;
    const instance = new XTerminal({ fontSize, fontFamily: "'Cascadia Mono', 'Cascadia Code', Menlo, Consolas, monospace", cursorBlink: true, scrollback: 10000, allowProposedApi: true, theme: lightTheme ? light : dark });
    const fitter = new FitAddon(); instance.loadAddon(fitter); instance.open(host.current);
    term.current = instance; fit.current = fitter;
    const output = new Channel<number[]>(); output.onmessage = data => { if (!disposed) instance.write(new Uint8Array(data)); };
    const resize = () => { if (!disposed && host.current && host.current.clientHeight > 0) { fitter.fit(); invoke("terminal_resize", { sessionId, rows: instance.rows, cols: instance.cols }).catch(() => { }); } };
    const listener = instance.onData(data => { invoke("terminal_write", { sessionId, data }).catch(e => instance.writeln(String(e))); });
    invoke("terminal_start", { sessionId, output }).then(() => { if (!disposed) { resize(); if (active) instance.focus(); } }).catch(e => { if (!disposed) instance.writeln(String(e)); });
    const observer = new ResizeObserver(resize); observer.observe(host.current);
    const control = (event: Event) => {
      const { detail } = event as CustomEvent<{ sessionId: number; action: string }>;
      if (detail.sessionId !== sessionId) return;
      if (detail.action === "clear") instance.clear();
      instance.focus();
    };
    window.addEventListener("veyra-terminal", control);
    return () => { disposed = true; window.removeEventListener("veyra-terminal", control); observer.disconnect(); listener.dispose(); instance.dispose(); term.current = null; void invoke("terminal_stop", { sessionId }); };
  }, [root, sessionId]);
  useEffect(() => {
    if (!term.current) return;
    term.current.options.fontSize = fontSize;
    term.current.options.theme = lightTheme ? light : dark;
    fit.current?.fit();
  }, [fontSize, lightTheme]);
  useEffect(() => { if (active) host.current?.querySelector<HTMLTextAreaElement>(".xterm-helper-textarea")?.focus(); }, [active]);
  return <div className="terminal-host" ref={host} />;
}
