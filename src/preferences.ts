export type Preferences = {
  fontSize: number; fontFamily: string; lineHeight: number; ligatures: boolean;
  tabSize: number; insertSpaces: boolean; wrap: boolean; minimap: boolean; light: boolean;
  lineNumbers: "on" | "relative" | "off"; renderWhitespace: "none" | "boundary" | "selection" | "trailing" | "all";
  cursorStyle: "line" | "block" | "underline"; cursorBlinking: "blink" | "smooth" | "phase" | "expand" | "solid"; smoothCaret: boolean;
  bracketGuides: boolean; stickyScroll: boolean; rulers: string;
  autoSave: "off" | "afterDelay" | "onFocusChange"; autoSaveDelay: number; formatOnSave: boolean;
  terminalFontSize: number; gitGutter: boolean;
  aiInlineCompletions: "off" | "local" | "always";
};

export const defaultPreferences: Preferences = {
  fontSize: 14, fontFamily: "'Cascadia Code', 'JetBrains Mono', Menlo, Monaco, Consolas, monospace", lineHeight: 24, ligatures: true,
  tabSize: 2, insertSpaces: true, wrap: false, minimap: true, light: false,
  lineNumbers: "on", renderWhitespace: "selection", cursorStyle: "line", cursorBlinking: "smooth", smoothCaret: true,
  bracketGuides: true, stickyScroll: true, rulers: "",
  autoSave: "off", autoSaveDelay: 1000, formatOnSave: false,
  terminalFontSize: 13, gitGutter: true,
  aiInlineCompletions: "local",
};

export function readPreferences(): Preferences {
  try { return { ...defaultPreferences, ...JSON.parse(localStorage.getItem("veyra.preferences") || "{}") }; }
  catch { return { ...defaultPreferences }; }
}

export const rulerColumns = (value: string) => value.split(",").map(item => parseInt(item.trim(), 10)).filter(item => item > 0 && item < 500);
