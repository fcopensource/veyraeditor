import { useEffect, useRef } from "react";
import { Terminal as XTerminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Channel, invoke } from "@tauri-apps/api/core";
import "@xterm/xterm/css/xterm.css";

export function Terminal({ root }: { root: string }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current || !root) return;
    let disposed = false;
    const term = new XTerminal({ fontSize: 12, fontFamily: 'Menlo, monospace', cursorBlink: true, scrollback: 5000, theme: { background:"#13171e", foreground:"#ced8e5", cursor:"#80d6cb", selectionBackground:"#35485f" } });
    const fit = new FitAddon(); term.loadAddon(fit); term.open(host.current);
    const output = new Channel<number[]>(); output.onmessage = data => { if (!disposed) term.write(new Uint8Array(data)); };
    const resize = () => { if (!disposed && host.current && host.current.clientHeight > 0) { fit.fit(); invoke("terminal_resize", { rows:term.rows, cols:term.cols }).catch(() => {}); } };
    const listener = term.onData(data => { invoke("terminal_write", { data }).catch(e => term.writeln(String(e))); });
    invoke("terminal_start", { output }).then(() => { if (!disposed) { resize(); term.focus(); } }).catch(e => { if (!disposed) term.writeln(String(e)); });
    const observer = new ResizeObserver(resize); observer.observe(host.current);
    return () => { disposed = true; observer.disconnect(); listener.dispose(); term.dispose(); void invoke("terminal_stop"); };
  }, [root]);
  return <div className="terminal-host" ref={host} />;
}
