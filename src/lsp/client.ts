import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { monaco } from "../editor";

/* A Language Server Protocol client for Monaco. One instance per running server. The Rust side only
   frames and relays JSON-RPC; everything protocol-level happens here. */

type Json = any; // LSP payloads are large unions; they are validated at the use site.
export type Host = {
  root: () => string;
  /** Make sure a workspace file has a model and an (inactive) tab, so edits to it are visible and savable. */
  ensureOpen: (path: string) => Promise<void>;
  openFile: (path: string, line?: number, column?: number) => void;
  notify: (message: string) => void;
};
export type ServerOptions = {
  key: string; name: string; languages: string[];
  initializationOptions?: (root: string) => Json;
  /** Answer `workspace/configuration` for a section. */
  settings?: (section: string, root: string) => Json;
};

const clients = new Map<number, LspClient>();
let routing: Promise<unknown> | null = null;
function route() {
  routing ??= Promise.all([
    listen<{ id: number; message: string }>("lsp-message", event => clients.get(event.payload.id)?.receive(event.payload.message)),
    listen<{ id: number; code: number | null; log: string }>("lsp-exit", event => clients.get(event.payload.id)?.exited(event.payload.code, event.payload.log)),
  ]);
  return routing;
}
let nextClientId = 1;

/* ---------- Conversions between LSP (0-based) and Monaco (1-based) ---------- */
const toPosition = (p: monaco.IPosition) => ({ line: p.lineNumber - 1, character: p.column - 1 });
export const toRange = (r: Json) => new monaco.Range(r.start.line + 1, r.start.character + 1, r.end.line + 1, r.end.character + 1);
const fromRange = (r: monaco.IRange) => ({ start: { line: r.startLineNumber - 1, character: r.startColumn - 1 }, end: { line: r.endLineNumber - 1, character: r.endColumn - 1 } });
const markdown = (content: Json): monaco.IMarkdownString[] => {
  if (!content) return [];
  if (Array.isArray(content)) return content.flatMap(markdown);
  if (typeof content === "string") return [{ value: content }];
  if (content.kind) return [{ value: content.value }];
  if (content.language) return [{ value: "```" + content.language + "\n" + content.value + "\n```" }];
  return [];
};
const K = () => monaco.languages.CompletionItemKind;
const completionKind = (kind?: number) => {
  const k = K();
  return ([undefined, k.Text, k.Method, k.Function, k.Constructor, k.Field, k.Variable, k.Class, k.Interface, k.Module, k.Property, k.Unit, k.Value, k.Enum, k.Keyword, k.Snippet, k.Color, k.File, k.Reference, k.Folder, k.EnumMember, k.Constant, k.Struct, k.Event, k.Operator, k.TypeParameter] as (monaco.languages.CompletionItemKind | undefined)[])[kind || 1] ?? k.Text;
};
const symbolKind = (kind: number) => Math.max(0, kind - 1) as monaco.languages.SymbolKind;
const severity = (s?: number) => [monaco.MarkerSeverity.Error, monaco.MarkerSeverity.Error, monaco.MarkerSeverity.Warning, monaco.MarkerSeverity.Info, monaco.MarkerSeverity.Hint][s || 1];

/** LSP language ids differ from Monaco's for JSX/TSX. */
export function lspLanguageId(model: monaco.editor.ITextModel) {
  const path = model.uri.path.toLowerCase(), id = model.getLanguageId();
  if (path.endsWith(".tsx")) return "typescriptreact";
  if (path.endsWith(".jsx")) return "javascriptreact";
  return id;
}

export class LspClient {
  readonly id = nextClientId++;
  capabilities: Json = {};
  state: "starting" | "running" | "stopped" | "failed" = "starting";
  error = "";
  private seq = 0;
  private pending = new Map<number, { resolve: (v: Json) => void; reject: (e: Error) => void }>();
  private versions = new Map<string, number>();
  private disposables: monaco.IDisposable[] = [];
  private diagnostics = new Map<string, Json[]>();
  onChange?: () => void;

  constructor(readonly options: ServerOptions, private host: Host) {}

  /* ---------- Transport ---------- */
  private send(message: Json) { return invoke("lsp_send", { id: this.id, message: JSON.stringify({ jsonrpc: "2.0", ...message }) }); }
  request<T = Json>(method: string, params: Json, token?: monaco.CancellationToken): Promise<T> {
    if (this.state !== "running" && method !== "initialize") return Promise.reject(new Error("not running"));
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      token?.onCancellationRequested(() => { void this.send({ method: "$/cancelRequest", params: { id } }).catch(() => {}); this.pending.delete(id); resolve(null as T); });
      this.send({ id, method, params }).catch(error => { this.pending.delete(id); reject(error); });
    });
  }
  notify(method: string, params: Json) { if (this.state === "running" || method === "initialized") void this.send({ method, params }).catch(() => {}); }

  receive(raw: string) {
    let message: Json;
    try { message = JSON.parse(raw); } catch { return; }
    if (message.id !== undefined && message.method) { void this.answer(message); return; }
    if (message.id !== undefined) {
      const waiter = this.pending.get(message.id); this.pending.delete(message.id);
      if (!waiter) return;
      if (message.error) waiter.reject(new Error(message.error.message)); else waiter.resolve(message.result);
      return;
    }
    this.notification(message.method, message.params);
  }
  /** Requests the server makes of the editor. */
  private async answer(message: Json) {
    let result: Json = null;
    const root = this.host.root();
    try {
      switch (message.method) {
        case "workspace/configuration":
          result = (message.params?.items || []).map((item: Json) => this.options.settings?.(item.section || "", root) ?? null); break;
        case "workspace/workspaceFolders": result = [{ uri: monaco.Uri.file(root).toString(), name: root.split(/[\\/]/).pop() }]; break;
        case "workspace/applyEdit": result = { applied: await this.applyWorkspaceEdit(message.params.edit) }; break;
        case "window/showMessageRequest": this.host.notify(`${this.options.name}: ${message.params.message}`); break;
        default: break; // client/registerCapability, window/workDoneProgress/create, ...: acknowledge
      }
      await this.send({ id: message.id, result });
    } catch (error) { await this.send({ id: message.id, error: { code: -32603, message: String(error) } }).catch(() => {}); }
  }
  private notification(method: string, params: Json) {
    if (method === "textDocument/publishDiagnostics") {
      this.diagnostics.set(params.uri, params.diagnostics || []);
      const model = monaco.editor.getModel(monaco.Uri.parse(params.uri)) || this.modelFor(params.uri);
      if (model) monaco.editor.setModelMarkers(model, "lsp:" + this.options.key, (params.diagnostics || []).map((d: Json) => ({
        ...toRange(d.range).toJSON(), startLineNumber: d.range.start.line + 1, startColumn: d.range.start.character + 1, endLineNumber: d.range.end.line + 1, endColumn: d.range.end.character + 1,
        message: d.message, severity: severity(d.severity), source: d.source || this.options.name, code: typeof d.code === "object" ? String(d.code?.value ?? "") : d.code !== undefined ? String(d.code) : undefined,
        tags: d.tags,
      })));
    } else if (method === "window/showMessage" && params?.type <= 2) this.host.notify(`${this.options.name}: ${params.message}`);
    else if (method === "eslint/noLibrary") this.host.notify("ESLint isn't installed in this project. Run npm install --save-dev eslint to enable linting.");
  }
  /** Monaco encodes paths slightly differently from some servers; match models by decoded path. */
  private modelFor(uri: string) {
    const target = decodeURIComponent(monaco.Uri.parse(uri).path).toLowerCase();
    return monaco.editor.getModels().find(m => decodeURIComponent(m.uri.path).toLowerCase() === target) || null;
  }
  exited(code: number | null, log: string) {
    const wasRunning = this.state === "running";
    this.state = this.state === "stopped" ? "stopped" : "failed";
    this.error = log.trim().split("\n").slice(-3).join(" ");
    for (const waiter of this.pending.values()) waiter.reject(new Error("server exited"));
    this.pending.clear();
    this.cleanup();
    if (wasRunning && this.state === "failed") this.host.notify(`${this.options.name} stopped unexpectedly${code !== null ? ` (code ${code})` : ""}.`);
    this.onChange?.();
  }

  /* ---------- Lifecycle ---------- */
  async start() {
    await route();
    clients.set(this.id, this);
    const root = this.host.root(), rootUri = monaco.Uri.file(root).toString();
    try {
      await invoke("lsp_start", { id: this.id, key: this.options.key });
      const result = await this.request("initialize", {
        processId: null, clientInfo: { name: "Veyra Studio" }, locale: "en", rootPath: root, rootUri,
        workspaceFolders: [{ uri: rootUri, name: root.split(/[\\/]/).pop() }],
        initializationOptions: this.options.initializationOptions?.(root),
        capabilities: {
          workspace: { configuration: true, workspaceFolders: true, applyEdit: true, workspaceEdit: { documentChanges: true }, didChangeConfiguration: { dynamicRegistration: true } },
          window: { workDoneProgress: true, showMessage: {} },
          textDocument: {
            synchronization: { didSave: true, dynamicRegistration: false },
            completion: { contextSupport: true, completionItem: { snippetSupport: true, documentationFormat: ["markdown", "plaintext"], deprecatedSupport: true, insertReplaceSupport: false, labelDetailsSupport: true, resolveSupport: { properties: ["documentation", "detail", "additionalTextEdits"] } } },
            hover: { contentFormat: ["markdown", "plaintext"] },
            signatureHelp: { signatureInformation: { documentationFormat: ["markdown", "plaintext"], parameterInformation: { labelOffsetSupport: true } } },
            definition: { linkSupport: true }, typeDefinition: { linkSupport: true }, implementation: { linkSupport: true }, references: {}, documentHighlight: {},
            documentSymbol: { hierarchicalDocumentSymbolSupport: true }, formatting: {}, rangeFormatting: {}, rename: { prepareSupport: true },
            codeAction: { codeActionLiteralSupport: { codeActionKind: { valueSet: ["", "quickfix", "refactor", "refactor.extract", "refactor.inline", "refactor.rewrite", "source", "source.organizeImports", "source.fixAll"] } }, resolveSupport: { properties: ["edit"] }, isPreferredSupport: true },
            publishDiagnostics: { relatedInformation: true, tagSupport: { valueSet: [1, 2] } },
            inlayHint: {}, colorProvider: {},
          },
        },
      });
      this.capabilities = result?.capabilities || {};
      this.state = "running";
      this.notify("initialized", {});
      this.notify("workspace/didChangeConfiguration", { settings: {} });
      this.registerProviders();
      this.syncDocuments();
    } catch (error) {
      this.state = "failed"; this.error = String(error);
      void invoke("lsp_stop", { id: this.id }).catch(() => {});
    }
    this.onChange?.();
  }
  async stop() {
    if (this.state === "running") { try { await Promise.race([this.request("shutdown", null), new Promise(r => setTimeout(r, 1500))]); this.notify("exit", null); } catch { /* already gone */ } }
    this.state = "stopped";
    await invoke("lsp_stop", { id: this.id }).catch(() => {});
    this.cleanup();
    clients.delete(this.id);
    this.onChange?.();
  }
  private cleanup() {
    this.disposables.forEach(d => d.dispose()); this.disposables = [];
    for (const model of monaco.editor.getModels()) monaco.editor.setModelMarkers(model, "lsp:" + this.options.key, []);
    this.versions.clear();
  }

  /* ---------- Document sync ---------- */
  handles(model: monaco.editor.ITextModel) {
    const root = monaco.Uri.file(this.host.root()).path.toLowerCase();
    return this.options.languages.includes(model.getLanguageId()) && decodeURIComponent(model.uri.path).toLowerCase().startsWith(decodeURIComponent(root));
  }
  private open(model: monaco.editor.ITextModel) {
    const uri = model.uri.toString();
    if (this.versions.has(uri) || !this.handles(model)) return;
    this.versions.set(uri, 1);
    this.notify("textDocument/didOpen", { textDocument: { uri, languageId: lspLanguageId(model), version: 1, text: model.getValue() } });
    const changes = model.onDidChangeContent(() => {
      const version = (this.versions.get(uri) || 1) + 1; this.versions.set(uri, version);
      this.notify("textDocument/didChange", { textDocument: { uri, version }, contentChanges: [{ text: model.getValue() }] });
    });
    const disposed = model.onWillDispose(() => { this.versions.delete(uri); this.notify("textDocument/didClose", { textDocument: { uri } }); changes.dispose(); disposed.dispose(); });
    this.disposables.push(changes, disposed);
  }
  private syncDocuments() {
    monaco.editor.getModels().forEach(model => this.open(model));
    this.disposables.push(monaco.editor.onDidCreateModel(model => this.open(model)));
    this.disposables.push(monaco.editor.onDidChangeModelLanguage(({ model }) => this.open(model)));
    const saved = (event: Event) => {
      const uri = monaco.Uri.file(this.host.root() + "/" + (event as CustomEvent<string>).detail).toString();
      if (this.versions.has(uri)) this.notify("textDocument/didSave", { textDocument: { uri } });
    };
    window.addEventListener("veyra-saved", saved);
    this.disposables.push({ dispose: () => window.removeEventListener("veyra-saved", saved) });
  }
  private doc = (model: monaco.editor.ITextModel) => ({ uri: model.uri.toString() });

  /** Workspace edits may touch files that are not open: open them as tabs first so the change is visible and saved. */
  async applyWorkspaceEdit(edit: Json): Promise<boolean> {
    const perFile = new Map<string, Json[]>();
    for (const [uri, edits] of Object.entries(edit?.changes || {})) perFile.set(uri, edits as Json[]);
    for (const change of edit?.documentChanges || []) if (change.textDocument) perFile.set(change.textDocument.uri, [...(perFile.get(change.textDocument.uri) || []), ...change.edits]);
    for (const [uri, edits] of perFile) {
      let model = this.modelFor(uri);
      const relative = this.relative(uri);
      if (relative) await this.host.ensureOpen(relative);
      model ??= this.modelFor(uri);
      if (!model) continue;
      model.pushEditOperations([], edits.map((e: Json) => ({ range: toRange(e.range), text: e.newText })), () => null);
    }
    return true;
  }
  /** Convert a WorkspaceEdit for Monaco, first opening any files it touches so the changes are visible and savable. */
  private async monacoEdit(edit: Json): Promise<monaco.languages.WorkspaceEdit> {
    const entries: [string, Json[]][] = [...Object.entries(edit?.changes || {}) as [string, Json[]][], ...(edit?.documentChanges || []).filter((c: Json) => c.textDocument).map((c: Json) => [c.textDocument.uri, c.edits] as [string, Json[]])];
    const edits: monaco.languages.IWorkspaceTextEdit[] = [];
    for (const [uri, list] of entries) {
      const relative = this.relative(uri);
      if (relative) await this.host.ensureOpen(relative);
      const model = this.modelFor(uri);
      if (model) for (const e of list) edits.push({ resource: model.uri, textEdit: { range: toRange(e.range), text: e.newText }, versionId: undefined });
    }
    return { edits };
  }
  private relative(uri: string) {
    const path = decodeURIComponent(monaco.Uri.parse(uri).path), root = decodeURIComponent(monaco.Uri.file(this.host.root()).path);
    return path.toLowerCase().startsWith(root.toLowerCase() + "/") ? path.slice(root.length + 1) : "";
  }
  /** Locations in files that are not loaded yet need a model before Monaco can show them. */
  private async locations(result: Json): Promise<monaco.languages.Location[]> {
    const list = (Array.isArray(result) ? result : result ? [result] : []).map((l: Json) => ({ uri: l.targetUri || l.uri, range: l.targetSelectionRange || l.range }));
    for (const location of list) { const relative = this.relative(location.uri); if (relative && !this.modelFor(location.uri)) await this.host.ensureOpen(relative); }
    return list.map((l: Json) => ({ uri: (this.modelFor(l.uri)?.uri) || monaco.Uri.parse(l.uri), range: toRange(l.range) }));
  }

  /* ---------- Monaco providers ---------- */
  private registerProviders() {
    const caps = this.capabilities, L = monaco.languages, add = (d: monaco.IDisposable) => this.disposables.push(d);
    for (const language of this.options.languages) {
      if (caps.completionProvider) add(L.registerCompletionItemProvider(language, {
        triggerCharacters: caps.completionProvider.triggerCharacters || [],
        provideCompletionItems: async (model, position, context, token) => {
          if (!this.handles(model)) return { suggestions: [] };
          const result = await this.request("textDocument/completion", { textDocument: this.doc(model), position: toPosition(position), context: { triggerKind: context.triggerKind === L.CompletionTriggerKind.TriggerCharacter ? 2 : context.triggerKind === L.CompletionTriggerKind.TriggerForIncompleteCompletions ? 3 : 1, triggerCharacter: context.triggerCharacter } }, token).catch(() => null);
          const items: Json[] = Array.isArray(result) ? result : result?.items || [];
          const word = model.getWordUntilPosition(position);
          const fallback = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
          return {
            incomplete: !!result?.isIncomplete,
            suggestions: items.slice(0, 2000).map(item => {
              const edit = item.textEdit;
              const suggestion: monaco.languages.CompletionItem & { _lsp?: Json } = {
                label: item.labelDetails ? { label: item.label, detail: item.labelDetails.detail, description: item.labelDetails.description } : item.label,
                kind: completionKind(item.kind), detail: item.detail, documentation: item.documentation ? markdown(item.documentation)[0] : undefined,
                insertText: edit?.newText ?? item.insertText ?? item.label,
                insertTextRules: item.insertTextFormat === 2 ? L.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
                range: edit ? toRange(edit.range ?? edit.replace) : fallback,
                sortText: item.sortText, filterText: item.filterText, preselect: item.preselect, commitCharacters: item.commitCharacters,
                additionalTextEdits: item.additionalTextEdits?.map((e: Json) => ({ range: toRange(e.range), text: e.newText })),
                tags: item.deprecated || item.tags?.includes(1) ? [L.CompletionItemTag.Deprecated] : undefined,
              };
              suggestion._lsp = item;
              return suggestion;
            }),
          };
        },
        resolveCompletionItem: caps.completionProvider.resolveProvider ? async (item: monaco.languages.CompletionItem & { _lsp?: Json }, token) => {
          if (!item._lsp) return item;
          const resolved = await this.request("completionItem/resolve", item._lsp, token).catch(() => null);
          if (!resolved) return item;
          return { ...item, detail: resolved.detail ?? item.detail, documentation: resolved.documentation ? markdown(resolved.documentation)[0] : item.documentation, additionalTextEdits: resolved.additionalTextEdits?.map((e: Json) => ({ range: toRange(e.range), text: e.newText })) ?? item.additionalTextEdits };
        } : undefined,
      }));
      if (caps.hoverProvider) add(L.registerHoverProvider(language, {
        provideHover: async (model, position, token) => {
          if (!this.handles(model)) return null;
          const result = await this.request("textDocument/hover", { textDocument: this.doc(model), position: toPosition(position) }, token).catch(() => null);
          return result ? { contents: markdown(result.contents), range: result.range ? toRange(result.range) : undefined } : null;
        },
      }));
      if (caps.signatureHelpProvider) add(L.registerSignatureHelpProvider(language, {
        signatureHelpTriggerCharacters: caps.signatureHelpProvider.triggerCharacters || ["(", ","],
        signatureHelpRetriggerCharacters: caps.signatureHelpProvider.retriggerCharacters || [],
        provideSignatureHelp: async (model, position, token) => {
          if (!this.handles(model)) return null;
          const result = await this.request("textDocument/signatureHelp", { textDocument: this.doc(model), position: toPosition(position) }, token).catch(() => null);
          if (!result?.signatures?.length) return null;
          return { value: { activeSignature: result.activeSignature || 0, activeParameter: result.activeParameter || 0, signatures: result.signatures.map((s: Json) => ({ label: s.label, documentation: s.documentation ? markdown(s.documentation)[0] : undefined, parameters: (s.parameters || []).map((p: Json) => ({ label: p.label, documentation: p.documentation ? markdown(p.documentation)[0] : undefined })), activeParameter: s.activeParameter })) }, dispose() {} };
        },
      }));
      const locate = (method: string) => async (model: monaco.editor.ITextModel, position: monaco.Position, token: monaco.CancellationToken) =>
        this.handles(model) ? this.locations(await this.request(method, { textDocument: this.doc(model), position: toPosition(position), context: { includeDeclaration: true } }, token).catch(() => null)) : [];
      if (caps.definitionProvider) add(L.registerDefinitionProvider(language, { provideDefinition: locate("textDocument/definition") }));
      if (caps.typeDefinitionProvider) add(L.registerTypeDefinitionProvider(language, { provideTypeDefinition: locate("textDocument/typeDefinition") }));
      if (caps.implementationProvider) add(L.registerImplementationProvider(language, { provideImplementation: locate("textDocument/implementation") }));
      if (caps.referencesProvider) add(L.registerReferenceProvider(language, { provideReferences: (model, position, _context, token) => locate("textDocument/references")(model, position, token) }));
      if (caps.documentHighlightProvider) add(L.registerDocumentHighlightProvider(language, {
        provideDocumentHighlights: async (model, position, token) => {
          if (!this.handles(model)) return [];
          const result = await this.request("textDocument/documentHighlight", { textDocument: this.doc(model), position: toPosition(position) }, token).catch(() => null);
          return (result || []).map((h: Json) => ({ range: toRange(h.range), kind: (h.kind || 1) - 1 }));
        },
      }));
      if (caps.documentSymbolProvider) add(L.registerDocumentSymbolProvider(language, {
        displayName: this.options.name,
        provideDocumentSymbols: async (model, token) => {
          if (!this.handles(model)) return [];
          const result: Json[] = await this.request("textDocument/documentSymbol", { textDocument: this.doc(model) }, token).catch(() => null) || [];
          const convert = (s: Json): monaco.languages.DocumentSymbol => ({ name: s.name, detail: s.detail || "", kind: symbolKind(s.kind), tags: [], range: toRange(s.range || s.location.range), selectionRange: toRange(s.selectionRange || s.location.range), children: (s.children || []).map(convert) });
          return result.map(convert);
        },
      }));
      const formatOptions = (model: monaco.editor.ITextModel) => { const o = model.getOptions(); return { tabSize: o.tabSize, insertSpaces: o.insertSpaces }; };
      const textEdits = (edits: Json[] | null) => (edits || []).map((e: Json) => ({ range: toRange(e.range), text: e.newText }));
      if (caps.documentFormattingProvider) add(L.registerDocumentFormattingEditProvider(language, {
        displayName: this.options.name,
        provideDocumentFormattingEdits: async (model, _options, token) => this.handles(model) ? textEdits(await this.request("textDocument/formatting", { textDocument: this.doc(model), options: formatOptions(model) }, token).catch(() => null)) : [],
      }));
      if (caps.documentRangeFormattingProvider) add(L.registerDocumentRangeFormattingEditProvider(language, {
        displayName: this.options.name,
        provideDocumentRangeFormattingEdits: async (model, range, _options, token) => this.handles(model) ? textEdits(await this.request("textDocument/rangeFormatting", { textDocument: this.doc(model), range: fromRange(range), options: formatOptions(model) }, token).catch(() => null)) : [],
      }));
      if (caps.renameProvider) add(L.registerRenameProvider(language, {
        provideRenameEdits: async (model, position, newName, token) => {
          const result = await this.request("textDocument/rename", { textDocument: this.doc(model), position: toPosition(position), newName }, token);
          return this.monacoEdit(result);
        },
        resolveRenameLocation: caps.renameProvider?.prepareProvider ? async (model, position, token) => {
          const result = await this.request("textDocument/prepareRename", { textDocument: this.doc(model), position: toPosition(position) }, token).catch(() => null);
          if (!result) return { range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column), text: "", rejectReason: "This symbol can't be renamed." };
          const range = toRange(result.range || result);
          return { range, text: result.placeholder || model.getValueInRange(range) };
        } : undefined,
      }));
      if (caps.codeActionProvider) add(L.registerCodeActionProvider(language, {
        provideCodeActions: async (model, range, context, token) => {
          if (!this.handles(model)) return { actions: [], dispose() {} };
          const all = this.diagnostics.get(model.uri.toString()) || [];
          const diagnostics = all.filter((d: Json) => toRange(d.range).intersectRanges(range));
          const result: Json[] = await this.request("textDocument/codeAction", { textDocument: this.doc(model), range: fromRange(range), context: { diagnostics, only: context.only ? [context.only] : undefined, triggerKind: 1 } }, token).catch(() => null) || [];
          return {
            actions: result.map((action: Json) => ({
              title: action.title, kind: action.kind, isPreferred: action.isPreferred, disabled: action.disabled?.reason,
              diagnostics: context.markers.filter(m => diagnostics.some((d: Json) => d.message === m.message)),
              command: { id: "veyra.lsp.codeAction", title: action.title, arguments: [this.id, action] },
            })),
            dispose() {},
          };
        },
      }));
      if (caps.inlayHintProvider) add(L.registerInlayHintsProvider(language, {
        provideInlayHints: async (model, range, token) => {
          if (!this.handles(model)) return { hints: [], dispose() {} };
          const result: Json[] = await this.request("textDocument/inlayHint", { textDocument: this.doc(model), range: fromRange(range) }, token).catch(() => null) || [];
          return { hints: result.map((h: Json) => ({ position: { lineNumber: h.position.line + 1, column: h.position.character + 1 }, label: typeof h.label === "string" ? h.label : h.label.map((p: Json) => p.value).join(""), kind: h.kind, paddingLeft: h.paddingLeft, paddingRight: h.paddingRight })), dispose() {} };
        },
      }));
      if (caps.colorProvider) add(L.registerColorProvider(language, {
        provideDocumentColors: async (model, token) => {
          if (!this.handles(model)) return [];
          const result: Json[] = await this.request("textDocument/documentColor", { textDocument: this.doc(model) }, token).catch(() => null) || [];
          return result.map((c: Json) => ({ color: c.color, range: toRange(c.range) }));
        },
        provideColorPresentations: async (model, info, token) => {
          const result: Json[] = await this.request("textDocument/colorPresentation", { textDocument: this.doc(model), color: info.color, range: fromRange(info.range) }, token).catch(() => null) || [];
          return result.map((p: Json) => ({ label: p.label, textEdit: p.textEdit ? { range: toRange(p.textEdit.range), text: p.textEdit.newText } : undefined }));
        },
      }));
    }
  }

  /** Apply a code action chosen in the lightbulb menu: resolve it if needed, apply its edit, run its command. */
  async runCodeAction(action: Json) {
    let resolved = action;
    if (!action.edit && !action.command && this.capabilities.codeActionProvider?.resolveProvider) resolved = await this.request("codeAction/resolve", action).catch(() => action);
    if (resolved.edit) await this.applyWorkspaceEdit(resolved.edit);
    const command = resolved.command && typeof resolved.command === "object" ? resolved.command : resolved.command ? resolved : null;
    if (command?.command) await this.request("workspace/executeCommand", { command: command.command, arguments: command.arguments }).catch(error => this.host.notify(String(error)));
  }
}

monaco.editor.registerCommand("veyra.lsp.codeAction", (_accessor, clientId: number, action: Json) => { void clients.get(clientId)?.runCodeAction(action); });
