export type Preferences = {
  fontSize: number; fontFamily: string; lineHeight: number; ligatures: boolean;
  tabSize: number; insertSpaces: boolean; wrap: boolean; minimap: boolean; light: boolean;
  lineNumbers: "on" | "relative" | "off"; renderWhitespace: "none" | "boundary" | "selection" | "trailing" | "all";
  cursorStyle: "line" | "block" | "underline"; cursorBlinking: "blink" | "smooth" | "phase" | "expand" | "solid"; smoothCaret: boolean;
  bracketGuides: boolean; stickyScroll: boolean; rulers: string;
  autoSave: "off" | "afterDelay" | "onFocusChange"; autoSaveDelay: number; formatOnSave: boolean;
  terminalFontSize: number; gitGutter: boolean;
};

export const defaultPreferences: Preferences = {
  fontSize: 14, fontFamily: "'JetBrains Mono', 'Cascadia Code', Menlo, Monaco, Consolas, monospace", lineHeight: 23, ligatures: true,
  tabSize: 2, insertSpaces: true, wrap: false, minimap: true, light: false,
  lineNumbers: "on", renderWhitespace: "selection", cursorStyle: "line", cursorBlinking: "smooth", smoothCaret: true,
  bracketGuides: true, stickyScroll: true, rulers: "",
  autoSave: "off", autoSaveDelay: 1000, formatOnSave: false,
  terminalFontSize: 13, gitGutter: true,
};

/** Earlier defaults: someone who never changed them gets the new ones. */
const OLD_DEFAULT_FONT = "'Cascadia Code', 'JetBrains Mono', Menlo, Monaco, Consolas, monospace";

export function readPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem("veyra.preferences") || "{}");
    if (saved.fontFamily === OLD_DEFAULT_FONT) { delete saved.fontFamily; if (saved.lineHeight === 24) delete saved.lineHeight; }
    return { ...defaultPreferences, ...saved };
  }
  catch { return { ...defaultPreferences }; }
}

export const rulerColumns = (value: string) => value.split(",").map(item => parseInt(item.trim(), 10)).filter(item => item > 0 && item < 500);
