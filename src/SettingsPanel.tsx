import { useState } from "react";
import { Moon, RotateCcw, Search, Sun } from "lucide-react";
import { defaultPreferences, type Preferences } from "./preferences";
import { keys } from "./platform";

type Shortcut = { name: string; shortcut?: string };
type Props = { preferences: Preferences; onChange: (update: (p: Preferences) => Preferences) => void; shortcuts: Shortcut[] };
type Setting = { section: string; key: keyof Preferences; label: string; detail?: string; options?: string[]; min?: number; max?: number; step?: number };

const settings: Setting[] = [
  { section: "Appearance", key: "fontSize", label: "Font size", min: 8, max: 32 },
  { section: "Appearance", key: "fontFamily", label: "Font family", detail: "Comma-separated, first installed font wins" },
  { section: "Appearance", key: "lineHeight", label: "Line height", min: 14, max: 48 },
  { section: "Appearance", key: "ligatures", label: "Font ligatures" },
  { section: "Appearance", key: "minimap", label: "Minimap" },
  { section: "Editor", key: "tabSize", label: "Tab size", min: 1, max: 8 },
  { section: "Editor", key: "insertSpaces", label: "Insert spaces", detail: "Use spaces when pressing Tab" },
  { section: "Editor", key: "wrap", label: "Word wrap" },
  { section: "Editor", key: "lineNumbers", label: "Line numbers", options: ["on", "relative", "off"] },
  { section: "Editor", key: "renderWhitespace", label: "Render whitespace", options: ["none", "boundary", "selection", "trailing", "all"] },
  { section: "Editor", key: "rulers", label: "Rulers", detail: "Columns, e.g. 80, 120" },
  { section: "Editor", key: "cursorStyle", label: "Cursor style", options: ["line", "block", "underline"] },
  { section: "Editor", key: "cursorBlinking", label: "Cursor blinking", options: ["blink", "smooth", "phase", "expand", "solid"] },
  { section: "Editor", key: "smoothCaret", label: "Smooth caret animation" },
  { section: "Editor", key: "bracketGuides", label: "Bracket pair guides" },
  { section: "Editor", key: "stickyScroll", label: "Sticky scroll", detail: "Keep enclosing scopes pinned while scrolling" },
  { section: "Editor", key: "aiInlineCompletions", label: "AI inline completions", detail: "Ghost-text suggestions from your AI Studio model, Tab to accept. \"local\" = only Ollama/localhost models (no cloud cost)", options: ["local", "always", "off"] },
  { section: "Editor", key: "gitGutter", label: "Git change markers", detail: "Show added, modified and deleted lines in the gutter" },
  { section: "Files", key: "autoSave", label: "Auto save", options: ["off", "afterDelay", "onFocusChange"] },
  { section: "Files", key: "formatOnSave", label: "Format on save", detail: "Uses Prettier or the language server when installed (Extensions → Web development)" },
  { section: "Files", key: "autoSaveDelay", label: "Auto save delay (ms)", detail: "Used when auto save is afterDelay", min: 200, max: 60000, step: 100 },
  { section: "Terminal", key: "terminalFontSize", label: "Terminal font size", min: 8, max: 28 },
];

export function SettingsPanel({ preferences, onChange, shortcuts }: Props) {
  const [filter, setFilter] = useState("");
  const q = filter.trim().toLowerCase();
  const visible = settings.filter(s => !q || (s.section + " " + s.label + " " + (s.detail || "")).toLowerCase().includes(q));
  const sections = [...new Set(visible.map(s => s.section))];
  const set = (key: keyof Preferences, value: unknown) => onChange(p => ({ ...p, [key]: value }));

  function control(s: Setting) {
    const value = preferences[s.key];
    if (typeof value === "boolean") return <input type="checkbox" aria-label={s.label} checked={value} onChange={e => set(s.key, e.target.checked)}/>;
    if (s.options) return <select aria-label={s.label} value={String(value)} onChange={e => set(s.key, e.target.value)}>{s.options.map(o => <option key={o}>{o}</option>)}</select>;
    if (typeof value === "number") return <input type="number" aria-label={s.label} min={s.min} max={s.max} step={s.step || 1} value={value}
      onChange={e => { const n = parseFloat(e.target.value); if (!Number.isNaN(n)) set(s.key, Math.max(s.min ?? -Infinity, Math.min(s.max ?? Infinity, n))); }}/>;
    return <input className="setting-text" aria-label={s.label} value={String(value)} onChange={e => set(s.key, e.target.value)}/>;
  }

  return <div className="panel-body settings">
    <h3>Make it yours</h3>
    <p className="hint">Preferences are saved on this device and apply immediately.</p>
    <label className="search-input settings-filter"><Search size={14}/><input aria-label="Search settings" placeholder="Search settings" value={filter} onChange={e => setFilter(e.target.value)}/></label>
    {(!q || "appearance theme light dark".includes(q)) && <label>Appearance<button className="secondary" onClick={() => set("light", !preferences.light)}>{preferences.light ? <Sun size={14}/> : <Moon size={14}/>} {preferences.light ? "Light" : "Midnight"}</button></label>}
    {sections.map(section => <div key={section} className="settings-section">
      <h4>{section}</h4>
      {visible.filter(s => s.section === section).map(s => <label key={s.key} className={typeof preferences[s.key] === "string" && !s.options ? "setting-wide" : ""}>
        <span>{s.label}{s.detail && <small>{s.detail}</small>}</span>{control(s)}</label>)}
    </div>)}
    {!visible.length && <p className="hint">No settings match “{filter}”.</p>}
    <button className="secondary settings-reset" onClick={() => onChange(p => ({ ...defaultPreferences, light: p.light }))}><RotateCcw size={13}/>Reset to defaults</button>
    <hr/><h4 id="keyboard-shortcuts">Keyboard shortcuts</h4>
    {shortcuts.filter(c => c.shortcut).map(c => <div className="shortcut" key={c.name}><span>{c.name}</span><kbd>{keys(c.shortcut!)}</kbd></div>)}
  </div>;
}
