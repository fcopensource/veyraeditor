import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { DimensionalIcon } from "./DimensionalIcon";

type TabInfo = { path: string; dirty: boolean };
type Props = {
  tabs: TabInfo[]; active: string; root: string; quickOpenTitle: string;
  onSelect: (path: string) => void; onClose: (path: string) => void; onCloseMany: (paths: string[]) => void;
  onReorder: (from: string, to: string) => void; onQuickOpen: () => void; onReveal: (path: string) => void;
};
const baseName = (path: string) => path.split("/").pop() || path;

/** VS Code-style editor tabs: thin hover scrollbar, wheel scrolling, middle-click close, drag to reorder, context menu. */
export function TabBar({ tabs, active, root, quickOpenTitle, onSelect, onClose, onCloseMany, onReorder, onQuickOpen, onReveal }: Props) {
  const strip = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; path: string } | null>(null);
  const [dragging, setDragging] = useState("");
  const [dropTarget, setDropTarget] = useState("");
  const [edges, setEdges] = useState({ left: false, right: false });

  // Same file name in two folders: show the folder as a description, like VS Code.
  const names = new Map<string, number>();
  for (const tab of tabs) names.set(baseName(tab.path), (names.get(baseName(tab.path)) || 0) + 1);
  const description = (path: string) => (names.get(baseName(path)) || 0) > 1 ? path.split("/").slice(-2, -1)[0] || "" : "";

  const measure = () => {
    const el = strip.current; if (!el) return;
    setEdges({ left: el.scrollLeft > 1, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 });
  };
  // Keep the active tab visible.
  useLayoutEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>(".tab.active");
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
    measure();
  }, [active, tabs.length]);
  useEffect(() => {
    const el = strip.current; if (!el) return;
    // Vertical wheel scrolls the strip sideways (non-passive so the page itself doesn't scroll).
    const wheel = (event: WheelEvent) => { if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) { el.scrollLeft += event.deltaY; event.preventDefault(); } };
    el.addEventListener("wheel", wheel, { passive: false });
    const observer = new ResizeObserver(measure); observer.observe(el);
    return () => { el.removeEventListener("wheel", wheel); observer.disconnect(); };
  }, []);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") setMenu(null); };
    window.addEventListener("mousedown", close); window.addEventListener("keydown", key); window.addEventListener("blur", close);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", key); window.removeEventListener("blur", close); };
  }, [menu]);

  const index = (path: string) => tabs.findIndex(tab => tab.path === path);
  const action = (fn: () => void) => () => { setMenu(null); fn(); };
  const absolute = (path: string) => (root.replace(/[\\/]+$/, "") + "/" + path).replace(/\//g, root.includes("\\") ? "\\" : "/");

  return <div className={"tab-bar" + (edges.left ? " shadow-left" : "") + (edges.right ? " shadow-right" : "")}>
    <div className="tabs" role="tablist" ref={strip} onScroll={measure}>
      {tabs.map(tab => {
        const isActive = tab.path === active, folder = description(tab.path);
        return <div key={tab.path} title={tab.path}
          className={"tab" + (isActive ? " active" : "") + (tab.dirty ? " dirty" : "") + (dragging === tab.path ? " dragging" : "") + (dropTarget === tab.path ? " drop-target" : "")}
          draggable onDragStart={event => { setDragging(tab.path); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", tab.path); }}
          onDragEnd={() => { setDragging(""); setDropTarget(""); }}
          onDragOver={event => { if (dragging && dragging !== tab.path) { event.preventDefault(); setDropTarget(tab.path); } }}
          onDragLeave={() => setDropTarget(target => target === tab.path ? "" : target)}
          onDrop={event => { event.preventDefault(); if (dragging && dragging !== tab.path) onReorder(dragging, tab.path); setDragging(""); setDropTarget(""); }}
          onAuxClick={event => { if (event.button === 1) { event.preventDefault(); onClose(tab.path); } }}
          onMouseDown={event => { if (event.button === 1) event.preventDefault(); }}
          onContextMenu={event => { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY, path: tab.path }); }}>
          <button role="tab" aria-selected={isActive} onClick={() => onSelect(tab.path)}>
            <DimensionalIcon path={tab.path} />
            <span className="tab-label">{baseName(tab.path)}</span>
            {folder && <span className="tab-description">{folder}</span>}
          </button>
          <button className="close-tab" aria-label={"Close " + tab.path} title={tab.dirty ? "Unsaved changes · Close" : "Close"} onClick={() => onClose(tab.path)}>
            <i className="dirty-dot" /><X size={14} />
          </button>
        </div>;
      })}
      {!tabs.length && <div className="welcome-tab"><img src="/veyra.png" alt="" />Welcome</div>}
    </div>
    <button className="icon-button tab-add" title={quickOpenTitle} aria-label="Quick open" onClick={onQuickOpen}><Plus size={16} /></button>
    {menu && <div className="tab-menu" role="menu" style={{ left: Math.min(menu.x, window.innerWidth - 230), top: menu.y }} onMouseDown={event => event.stopPropagation()}>
      <button role="menuitem" onClick={action(() => onClose(menu.path))}>Close</button>
      <button role="menuitem" disabled={tabs.length < 2} onClick={action(() => onCloseMany(tabs.filter(tab => tab.path !== menu.path).map(tab => tab.path)))}>Close Others</button>
      <button role="menuitem" disabled={index(menu.path) === tabs.length - 1} onClick={action(() => onCloseMany(tabs.slice(index(menu.path) + 1).map(tab => tab.path)))}>Close to the Right</button>
      <button role="menuitem" disabled={!tabs.some(tab => !tab.dirty)} onClick={action(() => onCloseMany(tabs.filter(tab => !tab.dirty).map(tab => tab.path)))}>Close Saved</button>
      <button role="menuitem" onClick={action(() => onCloseMany(tabs.map(tab => tab.path)))}>Close All</button>
      <i />
      <button role="menuitem" onClick={action(() => void navigator.clipboard.writeText(absolute(menu.path)))}>Copy Path</button>
      <button role="menuitem" onClick={action(() => void navigator.clipboard.writeText(menu.path))}>Copy Relative Path</button>
      <button role="menuitem" onClick={action(() => onReveal(menu.path))}>Reveal in Explorer View</button>
    </div>}
  </div>;
}
