import { useEffect, useRef, useState } from 'react';
import { Check, CircleAlert, Download, LoaderCircle, Package, Power, RotateCw, Search, Sparkles, Trash2, Upload, Wrench } from 'lucide-react';
import { fetchExtension, parseExtension, searchExtensions, themeId, type Extension, type Listing } from './extensions';
import { TOOLS, environment, installTool, onToolsChange, refreshTools, restartTool, setToolEnabled, toolFor, toolState, uninstallTool, type Tool } from './lsp/tools';
import './extensions.css';

const CATEGORIES = [['', 'All categories'], ['Programming Languages', 'Languages'], ['Linters', 'Linters'], ['Formatters', 'Formatters'], ['Themes', 'Themes'], ['Snippets', 'Snippets'], ['Other', 'Other']];

function ToolCard({ tool, onError, onNotice }: { tool: Tool; onError: (e: string) => void; onNotice: (n: string) => void }) {
  const state = toolState(tool.key);
  const run = async (action: () => Promise<unknown>, done?: string) => { onError(''); try { await action(); if (done) onNotice(done); } catch (e) { onError(String(e)); } };
  const status = !state.installed ? 'Not installed' : !state.enabled ? `v${state.version} · Disabled`
    : tool.kind === 'formatter' ? `v${state.version} · Ready: Format Document or format on save`
    : state.running === 'running' ? `v${state.version} · Running` : state.running === 'starting' ? `v${state.version} · Starting…`
    : state.running === 'failed' ? `v${state.version} · Failed to start` : `v${state.version} · Starts when you open a ${tool.languages.slice(0, 3).join('/')} file`;
  return <article className={'tool-card ' + (state.running === 'failed' ? 'failed' : state.installed && state.enabled ? 'on' : '')}>
    <div className="extension-title"><Wrench size={16} /><h4>{tool.name}</h4>{tool.beta && <em className="badge">Beta</em>}</div>
    <small>{tool.publisher}</small>
    <p>{tool.description}</p>
    <div className={'tool-status ' + state.running}>{state.busy ? <><LoaderCircle size={12} className="spin" />Working…</> : state.running === 'running' ? <><Check size={12} />{status}</> : state.running === 'failed' ? <><CircleAlert size={12} />{status}</> : status}</div>
    {state.running === 'failed' && state.error && <p className="tool-error">{state.error}</p>}
    <div className="extension-footer">
      {!state.installed
        ? <button className="secondary" aria-label={`Install ${tool.name}`} disabled={state.busy} onClick={() => void run(() => installTool(tool.key), `${tool.name} installed.`)}><Download size={12} />{state.busy ? 'Installing…' : 'Install'}</button>
        : <>
          <button className="secondary" aria-label={`${state.enabled ? 'Disable' : 'Enable'} ${tool.name}`} disabled={state.busy} onClick={() => void run(() => setToolEnabled(tool.key, !state.enabled))}><Power size={12} />{state.enabled ? 'Disable' : 'Enable'}</button>
          {tool.kind === 'server' && state.enabled && <button className="secondary" aria-label={`Restart ${tool.name}`} disabled={state.busy} onClick={() => void run(() => restartTool(tool.key))}><RotateCw size={12} />Restart</button>}
          <button className="secondary" aria-label={`Uninstall ${tool.name}`} disabled={state.busy} onClick={() => void run(() => uninstallTool(tool.key), `${tool.name} removed.`)}><Trash2 size={12} /></button>
        </>}
    </div>
  </article>;
}

export function ExtensionsPanel({ items, onChange, theme, onTheme }: { items: Extension[]; onChange: (items: Extension[]) => void; theme: string; onTheme: (theme: string) => void }) {
  const [view, setView] = useState('discover'); const [query, setQuery] = useState(''); const [category, setCategory] = useState('');
  const [results, setResults] = useState<Listing[]>([]); const [loading, setLoading] = useState(false); const [busy, setBusy] = useState(''); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [, setTick] = useState(0);
  const upload = useRef<HTMLInputElement>(null);
  useEffect(() => { void refreshTools(); return onToolsChange(() => setTick(n => n + 1)); }, []);
  useEffect(() => {
    if (view !== 'discover') return; let current = true; setLoading(true); const timer = setTimeout(() => {
      searchExtensions(query, category).then(data => { if (current) setResults(data); }).catch(e => { if (current) setError(String(e)); }).finally(() => { if (current) setLoading(false); });
    }, 350); return () => { current = false; clearTimeout(timer); };
  }, [query, category, view]);
  function commit(next: Extension[]) { onChange(next); }
  async function install(listing: Listing) {
    const id = `${listing.namespace}.${listing.name}`; setBusy(id); setError(''); setNotice('');
    const tool = toolFor(id);
    try {
      if (tool) { await installTool(tool.key); setNotice(`${listing.displayName || listing.name} is built into Veyra: installed ${tool.name}.`); return; }
      const ext = await fetchExtension(listing); commit([...items.filter(x => x.id.toLowerCase() !== ext.id.toLowerCase()), ext]);
      setNotice(`${ext.name} installed. ${ext.themes.length ? 'Choose its theme below.' : 'Snippets are ready in editor suggestions.'}`);
    } catch (e) { setError(String(e)); } finally { setBusy(''); }
  }
  async function importFile(file: File) { setBusy('import'); setError(''); try { if (file.size > 16 * 1024 * 1024) throw new Error('Choose a VSIX smaller than 16 MB.'); const ext = parseExtension(new Uint8Array(await file.arrayBuffer())); commit([...items.filter(x => x.id.toLowerCase() !== ext.id.toLowerCase()), ext]); setView('installed'); setNotice(`${ext.name} installed.`); } catch (e) { setError(String(e)); } finally { setBusy(''); } }
  function change(next: Extension[]) { try { commit(next); setError(''); } catch (e) { setError(String(e)); } }
  const themes = items.filter(x => x.enabled).flatMap(x => x.themes.map((t, i) => ({ id: themeId(x.id, i), name: t.name })));
  function applyTheme(id: string, name: string) { try { onTheme(id); setError(''); setNotice(`${name} applied to your workspace and editor.`); } catch (e) { setError(String(e)); } }
  const env = environment();
  const installedTools = TOOLS.filter(tool => toolState(tool.key).installed);
  const toolCards = (list: Tool[]) => list.map(tool => <ToolCard key={tool.key} tool={tool} onError={setError} onNotice={setNotice} />);

  return <section className="extensions-panel" aria-label="Extension marketplace">
    <div className="extensions-intro"><Package size={25} /><h3>Make room for more.</h3><p>Language tools for web development, plus themes and snippets from Open VSX.</p></div>
    <div className="extension-tabs"><button className={view === 'discover' ? 'active' : ''} onClick={() => setView('discover')}>Discover</button><button className={view === 'installed' ? 'active' : ''} onClick={() => setView('installed')}>Installed <span>{items.length + installedTools.length}</span></button></div>
    <button className="secondary import-extension" disabled={!!busy} onClick={() => upload.current?.click()}><Upload size={13} /> Install from VSIX…</button><input ref={upload} type="file" accept=".vsix" hidden onChange={e => { const file = e.target.files?.[0]; if (file) void importFile(file); e.target.value = ''; }} />
    <label className="extension-theme">Editor theme<select aria-label="Extension editor theme" value={theme} onChange={e => applyTheme(e.target.value, themes.find(t => t.id === e.target.value)?.name || 'Default appearance')}><option value="">Use appearance setting</option>{themes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
    {view === 'installed' && themes.length > 0 && <div className="theme-choices"><h4>Apply an installed theme</h4>{themes.map(t => <button className="secondary" key={t.id} disabled={!!busy || theme === t.id} onClick={() => applyTheme(t.id, t.name)} aria-label={`${theme === t.id ? 'Applied' : 'Apply'} ${t.name}`}>{theme === t.id && <Check size={13} />}<span>{t.name}</span><small>{theme === t.id ? 'Applied' : 'Apply'}</small></button>)}</div>}
    {error && <p className="extension-error" role="alert">{error}</p>}{notice && <p className="extension-notice" role="status">{notice}</p>}
    {view === 'discover' ? <>
      <h4 className="extension-section"><Sparkles size={13} />Web development</h4>
      {env.node ? <p className="hint">Runs on your Node.js {env.node}{env.npm ? '' : ' (npm not found)'}; tools are stored in Veyra's app folder, not in your project.</p>
        : <p className="extension-warning">Language tools need <b>Node.js 18 or newer</b>. Install it from nodejs.org, then restart Veyra.</p>}
      <div className="extension-list">{toolCards(TOOLS)}</div>
      <h4 className="extension-section"><Package size={13} />Open VSX marketplace</h4>
      <label className="search-input"><Search size={14} /><input aria-label="Search extensions" placeholder="Search extensions…" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <select aria-label="Extension category" value={category} onChange={e => setCategory(e.target.value)}>{CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <p className="extension-note">Themes and snippets install directly; known web extensions install Veyra's built-in equivalent. Extensions that run their own code need the VS Code extension host, which is planned.</p>
      {loading ? <p role="status" className="hint">Searching Open VSX…</p> : <div className="extension-list">{results.length === 0 && !error && <p className="hint">No extensions found. Try another search.</p>}{results.map(item => {
        const id = `${item.namespace}.${item.name}`; const tool = toolFor(id);
        const installed = tool ? toolState(tool.key).installed : items.some(x => x.id.toLowerCase() === id.toLowerCase());
        return <article className="extension-card" key={id}><div className="extension-title"><Package size={18} /><h4>{item.displayName || item.name}</h4>{tool && <em className="badge built-in">Built into Veyra</em>}</div><small>{item.namespace} · {item.version}</small><p>{item.description}</p><div className="extension-footer"><small>{(item.downloadCount || 0).toLocaleString()} downloads</small><button className="secondary" disabled={!!busy || installed} onClick={() => void install(item)}>{installed ? <Check size={12} /> : <Download size={12} />}{installed ? 'Installed' : busy === id ? 'Installing…' : 'Install'}</button></div></article>;
      })}</div>}
    </> :
      <div className="extension-list">
        {!items.length && !installedTools.length && <p className="hint">Your installed extensions will appear here.</p>}
        {toolCards(installedTools)}
        {items.map(item => <article className="extension-card" key={item.id}><div className="extension-title"><Package size={18} /><h4>{item.name}</h4></div><small>{item.publisher} · {item.version}</small><p>{item.themes.length} themes · {item.snippets.length} snippets · {item.enabled ? 'Enabled' : 'Disabled'}</p><div className="extension-footer"><button className="secondary" disabled={!!busy} onClick={() => change(items.map(x => x.id === item.id ? { ...x, enabled: !x.enabled } : x))}>{item.enabled ? 'Disable' : 'Enable'}</button><button className="secondary" disabled={!!busy} onClick={() => change(items.filter(x => x.id !== item.id))}>Uninstall</button></div></article>)}
      </div>}
  </section>;
}
