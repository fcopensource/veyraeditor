import { invoke } from "@tauri-apps/api/core";
import { monaco, languageFor } from "./editor";

/* Autocomplete for Veyra, in three layers:
   1. Keywords, snippets and document words for languages Monaco has no IntelliSense for.
   2. Project files loaded as background models so TypeScript/JavaScript IntelliSense sees imports across files.
   3. AI inline completions (ghost text, Tab to accept) using the model chosen in AI Studio. */

type Snippet = [label: string, body: string, detail: string];
type LanguagePack = { keywords: string; snippets: Snippet[] };

const PACKS: Record<string, LanguagePack> = {
  python: {
    keywords: "False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield print len range enumerate zip isinstance dict list set tuple str int float bool open super self",
    snippets: [
      ["def", "def ${1:name}(${2:args}):\n\t${0:pass}", "function"],
      ["class", "class ${1:Name}:\n\tdef __init__(self${2:, args}):\n\t\t${0:pass}", "class"],
      ["if __name__", "if __name__ == \"__main__\":\n\t${0:main()}", "main guard"],
      ["for", "for ${1:item} in ${2:items}:\n\t${0:pass}", "for loop"],
      ["try", "try:\n\t${1:pass}\nexcept ${2:Exception} as ${3:error}:\n\t${0:raise}", "try / except"],
      ["with open", "with open(${1:path}, \"${2:r}\") as ${3:file}:\n\t${0:data = file.read()}", "open a file"],
      ["async def", "async def ${1:name}(${2:args}):\n\t${0:pass}", "async function"],
      ["list comprehension", "[${1:x} for ${1:x} in ${2:items}${3: if ${4:condition}}]", "comprehension"],
    ],
  },
  rust: {
    keywords: "as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while Option Some None Result Ok Err Vec String Box println! format! vec! panic! assert_eq!",
    snippets: [
      ["fn", "fn ${1:name}(${2}) -> ${3:()} {\n\t${0}\n}", "function"],
      ["fn main", "fn main() {\n\t${0}\n}", "entry point"],
      ["struct", "#[derive(Debug, Clone)]\nstruct ${1:Name} {\n\t${0}\n}", "struct"],
      ["impl", "impl ${1:Type} {\n\t${0}\n}", "impl block"],
      ["match", "match ${1:value} {\n\t${2:pattern} => ${3:expr},\n\t_ => ${0:todo!()},\n}", "match"],
      ["test", "#[test]\nfn ${1:it_works}() {\n\t${0:assert_eq!(2 + 2, 4);}\n}", "unit test"],
      ["for", "for ${1:item} in ${2:items} {\n\t${0}\n}", "for loop"],
    ],
  },
  go: {
    keywords: "break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var nil true false error string int bool byte rune make new len append fmt",
    snippets: [
      ["func", "func ${1:name}(${2}) ${3:error} {\n\t${0}\n}", "function"],
      ["main", "package main\n\nimport \"fmt\"\n\nfunc main() {\n\t${0:fmt.Println(\"hello\")}\n}", "main package"],
      ["iferr", "if err != nil {\n\treturn ${0:err}\n}", "error check"],
      ["for range", "for ${1:_}, ${2:v} := range ${3:items} {\n\t${0}\n}", "range loop"],
      ["struct", "type ${1:Name} struct {\n\t${0}\n}", "struct type"],
    ],
  },
  java: {
    keywords: "abstract boolean break byte case catch char class continue default do double else enum extends final finally float for if implements import instanceof int interface long new null package private protected public return short static super switch this throw throws try void while var record String List Map ArrayList HashMap System",
    snippets: [
      ["main", "public static void main(String[] args) {\n\t${0}\n}", "main method"],
      ["sout", "System.out.println(${0});", "print line"],
      ["class", "public class ${1:Name} {\n\t${0}\n}", "class"],
      ["for each", "for (${1:var} ${2:item} : ${3:items}) {\n\t${0}\n}", "for-each loop"],
      ["try", "try {\n\t${1}\n} catch (${2:Exception} ${3:e}) {\n\t${0}\n}", "try / catch"],
    ],
  },
  c: {
    keywords: "auto break case char const continue default do double else enum extern float for goto if int long register return short signed sizeof static struct switch typedef union unsigned void volatile while include define NULL printf malloc free",
    snippets: [
      ["main", "#include <stdio.h>\n\nint main(void) {\n\t${0}\n\treturn 0;\n}", "main function"],
      ["for", "for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t${0}\n}", "for loop"],
      ["printf", "printf(\"${1:%d}\\n\", ${0});", "print"],
    ],
  },
  cpp: {
    keywords: "auto bool break case catch class const constexpr continue default delete do double else enum explicit false float for friend if include inline int long namespace new nullptr operator private protected public return short sizeof static struct switch template this throw true try typedef typename using virtual void while std vector string map cout endl",
    snippets: [
      ["main", "#include <iostream>\n\nint main() {\n\t${0}\n\treturn 0;\n}", "main function"],
      ["cout", "std::cout << ${0} << std::endl;", "print"],
      ["class", "class ${1:Name} {\npublic:\n\t${1:Name}();\n\t${0}\n};", "class"],
      ["for range", "for (const auto& ${1:item} : ${2:items}) {\n\t${0}\n}", "range-for loop"],
    ],
  },
  csharp: {
    keywords: "abstract as async await base bool break case catch class const continue decimal default delegate do double else enum event false finally float for foreach if in int interface internal is lock long namespace new null object out override private protected public readonly ref return sealed static string struct switch this throw true try using var virtual void while Console List Task",
    snippets: [
      ["cw", "Console.WriteLine(${0});", "write line"],
      ["class", "public class ${1:Name}\n{\n\t${0}\n}", "class"],
      ["prop", "public ${1:string} ${2:Name} { get; set; }", "property"],
      ["foreach", "foreach (var ${1:item} in ${2:items})\n{\n\t${0}\n}", "foreach loop"],
    ],
  },
  php: {
    keywords: "abstract and array as break case catch class clone const continue declare default do echo else elseif empty endforeach endif extends final finally fn for foreach function global if implements include interface isset list match namespace new null private protected public require return static switch throw trait try use var while yield",
    snippets: [
      ["function", "function ${1:name}(${2}) {\n\t${0}\n}", "function"],
      ["class", "class ${1:Name}\n{\n\tpublic function __construct(${2})\n\t{\n\t\t${0}\n\t}\n}", "class"],
      ["foreach", "foreach (\\$${1:items} as \\$${2:item}) {\n\t${0}\n}", "foreach loop"],
    ],
  },
  ruby: {
    keywords: "alias and begin break case class def defined? do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield puts require attr_accessor",
    snippets: [
      ["def", "def ${1:name}${2:(args)}\n\t${0}\nend", "method"],
      ["class", "class ${1:Name}\n\tdef initialize(${2})\n\t\t${0}\n\tend\nend", "class"],
      ["each", "${1:items}.each do |${2:item}|\n\t${0}\nend", "each block"],
    ],
  },
  shell: {
    keywords: "if then else elif fi case esac for while until do done in function return local export echo printf read source exit set unset shift test",
    snippets: [
      ["shebang", "#!/usr/bin/env bash\nset -euo pipefail\n\n${0}", "script header"],
      ["if", "if [[ ${1:condition} ]]; then\n\t${0}\nfi", "if"],
      ["for", "for ${1:item} in ${2:items}; do\n\t${0}\ndone", "for loop"],
      ["function", "${1:name}() {\n\t${0}\n}", "function"],
    ],
  },
  sql: {
    keywords: "SELECT FROM WHERE INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE ALTER DROP INDEX JOIN LEFT RIGHT INNER OUTER ON GROUP BY ORDER HAVING LIMIT OFFSET AS AND OR NOT NULL IS IN LIKE BETWEEN DISTINCT COUNT SUM AVG MIN MAX PRIMARY KEY FOREIGN REFERENCES DEFAULT UNIQUE",
    snippets: [
      ["select", "SELECT ${1:*}\nFROM ${2:table}\nWHERE ${3:condition};", "select query"],
      ["insert", "INSERT INTO ${1:table} (${2:columns})\nVALUES (${3:values});", "insert row"],
      ["create table", "CREATE TABLE ${1:name} (\n\tid INTEGER PRIMARY KEY,\n\t${0}\n);", "create table"],
    ],
  },
};
PACKS.kotlin = { keywords: "fun val var class object interface if else when for while do return null true false is in as package import data sealed override open private public internal suspend", snippets: [["fun", "fun ${1:name}(${2}): ${3:Unit} {\n\t${0}\n}", "function"]] };
PACKS.swift = { keywords: "func let var class struct enum protocol extension if else guard switch case for in while return nil true false import self init throws try catch async await", snippets: [["func", "func ${1:name}(${2}) -> ${3:Void} {\n\t${0}\n}", "function"]] };

let registered = false;
/** Register keyword/snippet/word completions for languages without a built-in language service. */
export function registerLanguageCompletions() {
  if (registered) return;
  registered = true;
  for (const [language, pack] of Object.entries(PACKS)) {
    const keywords = pack.keywords.split(" ");
    monaco.languages.registerCompletionItemProvider(language, {
      provideCompletionItems(model, position) {
        const word = model.getWordUntilPosition(position);
        const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
        const K = monaco.languages.CompletionItemKind;
        const items: monaco.languages.CompletionItem[] = [
          ...pack.snippets.map(([label, body, detail]) => ({ label, kind: K.Snippet, insertText: body, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail, documentation: body.replace(/\$\{\d+:?([^}]*)\}/g, "$1").replace(/\$\d/g, ""), range, sortText: "0" + label })),
          ...keywords.map(keyword => ({ label: keyword, kind: K.Keyword, insertText: keyword, range, sortText: "1" + keyword })),
        ];
        // Registering a provider turns off Monaco's word-based fallback, so add words from open files of this language.
        const seen = new Set([...keywords, word.word]);
        for (const other of monaco.editor.getModels()) {
          if (other.getLanguageId() !== language) continue;
          for (const match of other.getValue().slice(0, 300_000).matchAll(/[A-Za-z_$][\w$]{2,}/g)) {
            if (seen.has(match[0])) continue;
            seen.add(match[0]);
            items.push({ label: match[0], kind: K.Text, insertText: match[0], range, sortText: "2" + match[0] });
            if (seen.size > 2000) break;
          }
        }
        return { suggestions: items };
      },
    });
  }
}

/* ---------- Project-wide IntelliSense for TypeScript / JavaScript ---------- */

/** URIs of models created only so the language service can see them (not open in a tab). */
export const backgroundModels = new Set<string>();
const SCRIPT = /\.(tsx?|jsx?|mjs|cjs|mts|cts)$/;
let syncGeneration = 0;

/** Load the workspace's script files as models so imports, types and go-to-definition work across files. */
export async function syncProjectModels(root: string, files: string[], read: (path: string) => Promise<string>) {
  const generation = ++syncGeneration;
  const candidates = files.filter(path => SCRIPT.test(path) && !/(^|\/)(node_modules|dist|build|out|coverage)\//.test(path)).slice(0, 600);
  for (let i = 0; i < candidates.length; i += 8) {
    await Promise.all(candidates.slice(i, i + 8).map(async path => {
      const uri = monaco.Uri.file(root + "/" + path);
      if (monaco.editor.getModel(uri)) return;
      const text = await read(path).catch(() => null);
      if (text === null || text.length > 300_000 || generation !== syncGeneration || monaco.editor.getModel(uri)) return;
      monaco.editor.createModel(text, languageFor(path), uri);
      backgroundModels.add(uri.toString());
    }));
    if (generation !== syncGeneration) return;
  }
}
/** Forget everything when the workspace closes or changes (models themselves are disposed by the caller). */
export function resetProjectModels() { syncGeneration++; backgroundModels.clear(); }

monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true);
monaco.languages.typescript.javascriptDefaults.setEagerModelSync(true);

/* ---------- AI inline completions ---------- */

export type InlineMode = "off" | "local" | "always";
type AISettings = { kind?: string; endpoint?: string; model?: string };
const isLocal = (settings: AISettings) => settings.kind === "ollama" || (settings.kind === "custom" && /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(?=[:/]|$)/.test(settings.endpoint || ""));
let inlineRegistered = false;
let pausedUntil = 0;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Status for the UI: "idle", "thinking" or an error message. */
export const inlineStatus = { value: "idle", listeners: new Set<(value: string) => void>() };
const setStatus = (value: string) => { inlineStatus.value = value; inlineStatus.listeners.forEach(listener => listener(value)); };

export function registerInlineAI(mode: () => InlineMode) {
  if (inlineRegistered) return;
  inlineRegistered = true;
  monaco.languages.registerInlineCompletionsProvider("*", {
    async provideInlineCompletions(model, position, context, token) {
      const empty = { items: [] };
      const setting = mode();
      if (setting === "off" || Date.now() < pausedUntil) return empty;
      let settings: AISettings = {};
      try { settings = JSON.parse(localStorage.getItem("veyra.ai.settings") || "{}"); } catch { /* defaults */ }
      if (!settings.model || !settings.kind || (setting === "local" && !isLocal(settings))) return empty;
      const line = model.getLineContent(position.lineNumber);
      const before = line.slice(0, position.column - 1), after = line.slice(position.column - 1);
      // Don't interrupt mid-word, and leave blank documents alone.
      if (/^\w/.test(after) || model.getValueLength() < 2) return empty;
      if (context.triggerKind === monaco.languages.InlineCompletionTriggerKind.Automatic) {
        await sleep(450); // wait for a pause in typing
        if (token.isCancellationRequested) return empty;
      }
      const offset = model.getOffsetAt(position), value = model.getValue();
      const prefix = value.slice(Math.max(0, offset - 6000), offset), suffix = value.slice(offset, offset + 1500);
      setStatus("thinking");
      try {
        let text = await invoke<string>("ai_complete", {
          config: { kind: settings.kind, endpoint: settings.endpoint || "" }, model: settings.model,
          path: model.uri.path.split("/").slice(-3).join("/"), language: model.getLanguageId(), prefix, suffix,
        });
        setStatus("idle");
        if (token.isCancellationRequested || !text?.trim()) return empty;
        // Drop text the model repeated from the current line, cap the length, and avoid duplicating what follows.
        const typed = before.trimStart();
        if (typed && text.startsWith(typed)) text = text.slice(typed.length);
        text = text.split("\n").slice(0, 12).join("\n");
        if (after.trim() && text.endsWith(after.trim())) text = text.slice(0, -after.trim().length);
        if (!text.trim()) return empty;
        return { items: [{ insertText: text, range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column) }] };
      } catch (error) {
        // Model offline or misconfigured: back off for a minute instead of failing on every keystroke.
        pausedUntil = Date.now() + 60_000;
        setStatus("AI completions paused: " + String(error).slice(0, 120));
        return empty;
      }
    },
    freeInlineCompletions() { /* nothing to release */ },
  });
}
