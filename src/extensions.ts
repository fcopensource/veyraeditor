import { unzipSync, strFromU8 } from 'fflate';
import { parse, type ParseError } from 'jsonc-parser';
import { monaco } from './editor';

export type Extension = { id: string; name: string; publisher: string; version: string; description: string; enabled: boolean; themes: { name: string; data: monaco.editor.IStandaloneThemeData }[]; snippets: { language: string; name: string; prefix: string; body: string; description: string }[] };
export type Listing = { namespace: string; name: string; displayName?: string; description?: string; version: string; downloadCount?: number };
const storageKey = 'veyra.extensions.v1';
export const themeId = (id: string, index: number) => `ext-${Array.from(id).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('')}-${index}`;
export function installedExtensions(): Extension[] { try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { return []; } }
export function saveExtensions(items: Extension[]) { try { localStorage.setItem(storageKey, JSON.stringify(items)); } catch { throw new Error('Extension storage is full. Remove an unused extension and try again.'); } }
export async function download(url: string, limit = 16 * 1024 * 1024): Promise<Uint8Array> {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: 'omit' });
    if (!response.ok) throw new Error(`Registry request failed (${response.status}). Please try again.`);
    const reader = response.body?.getReader(); if (!reader) throw new Error('Download could not be read.');
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > limit) { await reader.cancel(); throw new Error('This extension exceeds the 16 MB download limit.'); } chunks.push(value); }
    const data = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; } return data;
  } finally { clearTimeout(timer); }
}
export async function searchExtensions(query: string, category: string): Promise<Listing[]> {
  const params = new URLSearchParams({ query, size: '24', category });
  const data = JSON.parse(strFromU8(await download(`https://open-vsx.org/api/-/search?${params}`, 1024 * 1024)));
  return data.extensions || [];
}
export async function fetchExtension(item: Listing) {
  const endpoint = `https://open-vsx.org/api/${encodeURIComponent(item.namespace)}/${encodeURIComponent(item.name)}/${encodeURIComponent(item.version)}`;
  const metadata = JSON.parse(strFromU8(await download(endpoint, 1024 * 1024)));
  const url = new URL(metadata.files.download);
  if (url.protocol !== 'https:' || url.hostname !== 'open-vsx.org') throw new Error('Unexpected extension download address.');
  const extension = parseExtension(await download(url.href));
  if (extension.id.toLowerCase() !== `${item.namespace}.${item.name}`.toLowerCase() || extension.version !== item.version) throw new Error('The downloaded package does not match the registry listing.');
  return extension;
}
export function parseExtension(bytes: Uint8Array): Extension {
  if (bytes.length > 16 * 1024 * 1024) throw new Error('VSIX files must be smaller than 16 MB.');
  let total = 0;
  const files = unzipSync(bytes, {
    filter: file => {
      if (!/\.(json|code-snippets)$/i.test(file.name)) return false;
      total += file.originalSize; if (file.originalSize > 2 * 1024 * 1024 || total > 8 * 1024 * 1024) throw new Error('Extension data is too large.');
      return true;
    }
  });
  const read = (path: string): any => {
    if (!path.startsWith('extension/') || path.split('/').some(p => p === '..') || path.includes('\\')) throw new Error('Invalid extension resource path.');
    const content = files[path]; if (!content) throw new Error(`Missing extension resource: ${path}`);
    const errors: ParseError[] = []; const value = parse(strFromU8(content), errors, { allowTrailingComma: true });
    if (errors.length) throw new Error(`Invalid JSON in ${path}`); return value;
  };
  const resource = (path: string) => 'extension/' + path.replace(/^\.\//, '');
  const pkg = read('extension/package.json');
  if (typeof pkg.publisher !== 'string' || typeof pkg.name !== 'string' || !/^[\w-]+$/.test(pkg.publisher) || !/^[\w-]+$/.test(pkg.name) || typeof pkg.version !== 'string') throw new Error('Invalid extension identity.');
  const result: Extension = { id: `${pkg.publisher}.${pkg.name}`, name: String(pkg.displayName || pkg.name), publisher: pkg.publisher, version: pkg.version, description: String(pkg.description || ''), enabled: true, themes: [], snippets: [] };
  const themeData = (path: string, seen = new Set<string>()): any => {
    if (seen.has(path) || seen.size > 8) throw new Error('Theme includes form a cycle or are too deep.'); seen.add(path);
    const data = read(path); if (!data.include) return data;
    // Resolve relative includes without allowing access outside the package.
    const parts = path.split('/').slice(0, -1); for (const part of String(data.include).split('/')) { if (part === '..') parts.pop(); else if (part !== '.') parts.push(part); }
    const base = themeData(parts.join('/'), seen); return { ...base, ...data, colors: { ...base.colors, ...data.colors }, tokenColors: [...(base.tokenColors || []), ...(data.tokenColors || [])] };
  };
  for (const theme of pkg.contributes?.themes || []) {
    const data = themeData(resource(theme.path));
    const colors: Record<string, string> = {}; for (const [key, value] of Object.entries(data.colors || {})) if (typeof value === 'string' && /^#[\da-f]{3,8}$/i.test(value)) colors[key] = value;
    const rules: monaco.editor.ITokenThemeRule[] = [];
    for (const rule of Array.isArray(data.tokenColors) ? data.tokenColors : []) {
      const scopes = Array.isArray(rule.scope) ? rule.scope : String(rule.scope || '').split(',');
      for (const scope of scopes) {
        const token = String(scope).trim().split('.')[0]; if (!['comment', 'string', 'keyword', 'constant', 'entity', 'variable', 'storage', 'support'].includes(token)) continue;
        const settings = rule.settings || {}; rules.push({ token: token === 'constant' ? 'number' : token === 'storage' ? 'keyword' : token === 'entity' ? 'type.identifier' : token, ...(typeof settings.foreground === 'string' && /^#[\da-f]{6}$/i.test(settings.foreground) ? { foreground: settings.foreground.slice(1) } : {}), ...(typeof settings.fontStyle === 'string' ? { fontStyle: settings.fontStyle } : {}) });
      }
    }
    result.themes.push({ name: String(theme.label || theme.id || result.name), data: { base: theme.uiTheme === 'vs' ? 'vs' : 'vs-dark', inherit: true, rules, colors } });
  }
  for (const contribution of pkg.contributes?.snippets || []) {
    const data = read(resource(contribution.path));
    for (const [name, snippet] of Object.entries(data) as [string, any][]) {
      const body = Array.isArray(snippet.body) ? snippet.body.join('\n') : snippet.body; if (typeof body !== 'string') continue;
      const languages = String(contribution.language || snippet.scope || '*').split(',').map(x => x.trim());
      for (const prefix of Array.isArray(snippet.prefix) ? snippet.prefix : [snippet.prefix]) if (typeof prefix === 'string') for (const language of languages) result.snippets.push({ name, prefix, body, language, description: String(snippet.description || name) });
    }
  }
  if (!result.themes.length && !result.snippets.length) throw new Error('This extension needs capabilities Veyra does not support yet. Choose a color theme or snippet extension.');
  if (result.snippets.length > 10000) throw new Error('This extension contains too many snippets.');
  return result;
}
export function activateExtensions(items: Extension[]) {
  const disposables: monaco.IDisposable[] = [];
  for (const item of items.filter(x => x.enabled)) {
    item.themes.forEach((theme, index) => monaco.editor.defineTheme(themeId(item.id, index), theme.data));
    for (const language of new Set(item.snippets.map(s => s.language))) {
      disposables.push(monaco.languages.registerCompletionItemProvider(language, {
        provideCompletionItems(model, position) {
          const word = model.getWordUntilPosition(position); const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
          return { suggestions: item.snippets.filter(s => s.language === language).map(s => ({ label: s.prefix, kind: monaco.languages.CompletionItemKind.Snippet, detail: `${s.name} · ${item.name}`, documentation: s.description, insertText: s.body, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range })) };
        }
      }));
    }
  }
  return () => disposables.forEach(d => d.dispose());
}
