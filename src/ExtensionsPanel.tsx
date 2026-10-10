import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, ChevronDown, ChevronRight, CircleAlert, CloudDownload, Download, LoaderCircle, Power, Search, SlidersHorizontal, Trash2, Upload } from 'lucide-react';
import { compactCount, fetchExtension, parseExtension, searchExtensions, themeId, type Extension, type Listing } from './extensions';
import { TOOLS, environment, installTool, onToolsChange, refreshTools, setToolEnabled, toolFor, toolState, uninstallTool, type Tool } from './lsp/tools';
import { ExtIcon, Rating, marketTarget, useMarketIcon, type ExtensionTarget } from './extensionUi';
import './extensions.css';
import './extensions-ui.css';

const CATEGORIES = [['', 'All categories'], ['Themes', 'Themes'], ['Snippets', 'Snippets'], ['Programming Languages', 'Languages'], ['Linters', 'Linters'], ['Formatters', 'Formatters'], ['Other', 'Other']];
type Props = { items: Extension[]; onChange: (items: Extension[]) => void; theme: string; onTheme: (theme: string) => void; onOpen: (target: ExtensionTarget) => void; selected?: string };

/** One VS Code-style list row. The whole row opens the extension's page; buttons inside act directly. */
function Row({ icon, name, version, description, publisher, verified, downloads, rating, badge, status, actions, onOpen, selected }: {
  icon?: string; name: string; version?: string; description?: string; publisher: string; verified?: boolean; downloads?: number; rating?: number;
  badge?: React.ReactNode; status?: React.ReactNode; actions?: React.ReactNode; onOpen: () => void; selected?: boolean;
}) {
  return <article className={'ext-row' + (selected ? ' selected' : '')} role="button" tabIndex={0} aria-label={name}
    onClick={onOpen} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onOpen(); } }}>
    <ExtIcon src={icon} name={name} size={40} />
    <div className="ext-row-main">
      <div className="ext-row-top"><b>{name}</b>{version && <span className="ext-version">v{version}</span>}
        <span className="ext-row-stats">{downloads ? <span title={`${downloads.toLocaleString()} downloads`}><CloudDownload size={12} />{compactCount(downloads)}</span> : null}<Rating value={rating} size={10} /></span></div>
      {description && <p>{description}</p>}
      <div className="ext-row-bottom"><span className="ext-publisher">{verified && <BadgeCheck size={12} className="ext-verified" />}{publisher}</span>{badge}{status}
        <span className="ext-row-actions" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>{actions}</span></div>
    </div>
  </article>;
}

function ToolRow({ tool, onOpen, selected, run }: { tool: Tool; onOpen: (target: ExtensionTarget) => void; selected?: boolean; run: (action: () => Promise<unknown>, done?: string) => void }) {
  const state = toolState(tool.key);
  const icon = useMarketIcon(tool.replaces[0]);
  const status = state.busy ? <span className="ext-status"><LoaderCircle size={11} className="spin" />Working…</span>
    : !state.installed ? null
    : !state.enabled ? <span className="ext-status off">Disabled</span>
    : state.running === 'running' ? <span className="ext-status on">Running</span>
    : state.running === 'failed' ? <span className="ext-status failed"><CircleAlert size={11} />Failed</span>
    : <span className="ext-status">{tool.kind === 'formatter' ? 'Ready' : 'Idle'}</span>;
  return <Row icon={icon} name={tool.name} version={state.version || undefined} description={tool.description} publisher={tool.publisher} selected={selected}
    badge={<em className="ext-badge builtin">{tool.beta ? 'Beta' : 'Built in'}</em>} status={status}
    onOpen={() => onOpen({ kind: 'tool', key: tool.key, title: tool.name, icon })}
    actions={!state.installed
      ? <button className="ext-action primary" aria-label={`Install ${tool.name}`} disabled={state.busy} onClick={() => run(() => installTool(tool.key), `${tool.name} installed.`)}><Download size={12} />Install</button>
      : <>
        <button className="ext-action icon" title={state.enabled ? 'Disable' : 'Enable'} aria-label={`${state.enabled ? 'Disable' : 'Enable'} ${tool.name}`} disabled={state.busy} onClick={() => run(() => setToolEnabled(tool.key, !state.enabled))}><Power size={13} /></button>
        <button className="ext-action icon" title="Uninstall" aria-label={`Uninstall ${tool.name}`} disabled={state.busy} onClick={() => run(() => uninstallTool(tool.key), `${tool.name} removed.`)}><Trash2 size={13} /></button>
      </>} />;
}

function Section({ id, title, count, collapsed, onToggle, tools, children }: { id: string; title: string; count?: number; collapsed: boolean; onToggle: (id: string) => void; tools?: React.ReactNode; children: React.ReactNode }) {
  return <section className={'ext-section' + (collapsed ? ' collapsed' : '')}>
    <header><button aria-expanded={!collapsed} onClick={() => onToggle(id)}>{collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}<span>{title}</span>{count !== undefined && <i>{count}</i>}</button>{tools}</header>
    {!collapsed && <div className="ext-section-body">{children}</div>}
  </section>;
}

export function ExtensionsPanel({ items, onChange, theme, onTheme, onOpen, selected }: Props) {
  const [query, setQuery] = useState(''); const [category, setCategory] = useState(''); const [filters, setFilters] = useState(false);
  const [results, setResults] = useState<Listing[]>([]); const [loading, setLoading] = useState(false); const [busy, setBusy] = useState('');
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [, setTick] = useState(0);
  const upload = useRef<HTMLInputElement>(null);
  useEffect(() => { void refreshTools(); return onToolsChange(() => setTick(n => n + 1)); }, []);
  useEffect(() => {
    let current = true; setLoading(true); setError('');
    const timer = setTimeout(() => {
      searchExtensions(query, category).then(data => { if (current) setResults(data); }).catch(e => { if (current) setError(String(e)); }).finally(() => { if (current) setLoading(false); });
    }, 300);
    return () => { current = false; clearTimeout(timer); };
  }, [query, category]);
  const toggle = (id: string) => setCollapsed(all => { const next = new Set(all); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const run = (action: () => Promise<unknown>, done?: string) => { setError(''); setNotice(''); void action().then(() => { if (done) setNotice(done); }).catch(e => setError(String(e))); };

  async function install(listing: Listing) {
    const id = `${listing.namespace}.${listing.name}`; setBusy(id); setError(''); setNotice('');
    const tool = toolFor(id);
    try {
      if (tool) { await installTool(tool.key); setNotice(`${listing.displayName || listing.name} is built into Veyra: installed ${tool.name}.`); return; }
      const ext = await fetchExtension(listing); onChange([...items.filter(x => x.id.toLowerCase() !== ext.id.toLowerCase()), ext]);
      setNotice(`${ext.name} installed. ${ext.themes.length ? 'Choose its colour theme below.' : 'Its snippets are ready in editor suggestions.'}`);
    } catch (e) { setError(String(e)); } finally { setBusy(''); }
  }
  async function importFile(file: File) {
    setBusy('import'); setError(''); setNotice('');
    try {
      if (file.size > 16 * 1024 * 1024) throw new Error('Choose a VSIX smaller than 16 MB.');
      const ext = parseExtension(new Uint8Array(await file.arrayBuffer())); onChange([...items.filter(x => x.id.toLowerCase() !== ext.id.toLowerCase()), ext]); setNotice(`${ext.name} installed.`);
    } catch (e) { setError(String(e)); } finally { setBusy(''); }
  }
  const change = (next: Extension[]) => { try { onChange(next); setError(''); } catch (e) { setError(String(e)); } };
  const themes = items.filter(x => x.enabled).flatMap(x => x.themes.map((t, i) => ({ id: themeId(x.id, i), name: t.name })));
  const env = environment();
  const installedTools = TOOLS.filter(tool => toolState(tool.key).installed);
  const searching = !!query.trim();
  const match = (text: string) => !searching || text.toLowerCase().includes(query.trim().toLowerCase());
  const installedCount = items.length + installedTools.length;
  const isSelected = (target: ExtensionTarget) => selected === (target.kind === 'tool' ? 'tool:' + target.key : `${target.namespace}.${target.name}`.toLowerCase());

  return <section className="extensions-panel" aria-label="Extension marketplace">
    <div className="ext-toolbar">
      <label className="ext-search"><Search size={14} /><input aria-label="Search extensions" placeholder="Search extensions" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <button className={'ext-tool' + (filters || category ? ' active' : '')} title="Filter by category" aria-label="Filter extensions" aria-expanded={filters} onClick={() => setFilters(v => !v)}><SlidersHorizontal size={14} /></button>
      <button className="ext-tool" title="Install from VSIX…" aria-label="Install from VSIX" disabled={!!busy} onClick={() => upload.current?.click()}><Upload size={14} /></button>
      <input ref={upload} type="file" accept=".vsix" hidden onChange={e => { const file = e.target.files?.[0]; if (file) void importFile(file); e.target.value = ''; }} />
    </div>
    {filters && <div className="ext-filters">{CATEGORIES.map(([value, label]) => <button key={value} className={category === value ? 'active' : ''} onClick={() => setCategory(value)}>{label}</button>)}
      <select aria-label="Extension category" value={category} onChange={e => setCategory(e.target.value)} hidden>{CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>}
    {error && <p className="extension-error" role="alert">{error}</p>}{notice && <p className="extension-notice" role="status">{notice}</p>}

    <Section id="installed" title="Installed" count={installedCount} collapsed={collapsed.has('installed')} onToggle={toggle}>
      {themes.length > 0 && <label className="ext-theme-row">Colour theme<select aria-label="Extension editor theme" value={theme} onChange={e => onTheme(e.target.value)}><option value="">Use appearance setting</option>{themes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
      {!installedCount && <p className="hint">Your installed extensions will appear here.</p>}
      {installedTools.filter(tool => match(tool.name)).map(tool => <ToolRow key={tool.key} tool={tool} onOpen={onOpen} run={run} selected={isSelected({ kind: 'tool', key: tool.key, title: '' })} />)}
      {items.filter(item => match(item.name + ' ' + item.id)).map(item => <Row key={item.id} icon={item.icon} name={item.name} version={item.version} publisher={item.publisher}
        description={`${item.themes.length} themes · ${item.snippets.length} snippets · ${item.enabled ? 'Enabled' : 'Disabled'}`} selected={isSelected(marketTarget(item.id, item.name))}
        onOpen={() => onOpen(marketTarget(item.id, item.name, item.icon))}
        actions={<>
          <button className="ext-action icon" title={item.enabled ? 'Disable' : 'Enable'} aria-label={`${item.enabled ? 'Disable' : 'Enable'} ${item.name}`} disabled={!!busy} onClick={() => change(items.map(x => x.id === item.id ? { ...x, enabled: !x.enabled } : x))}><Power size={13} /></button>
          <button className="ext-action icon" title="Uninstall" aria-label={`Uninstall ${item.name}`} disabled={!!busy} onClick={() => change(items.filter(x => x.id !== item.id))}><Trash2 size={13} /></button>
        </>} />)}
    </Section>

    {!searching && <Section id="web" title="Built-in web tools" count={TOOLS.length} collapsed={collapsed.has('web')} onToggle={toggle}>
      {env.node ? <p className="hint">Runs on your Node.js {env.node}{env.npm ? '' : ' (npm not found)'}. Tools live in Veyra's app folder, never in your project.</p>
        : <p className="extension-warning">Language tools need <b>Node.js 18 or newer</b>. Install it from nodejs.org, then restart Veyra.</p>}
      {TOOLS.filter(tool => !toolState(tool.key).installed).map(tool => <ToolRow key={tool.key} tool={tool} onOpen={onOpen} run={run} selected={isSelected({ kind: 'tool', key: tool.key, title: '' })} />)}
      {TOOLS.every(tool => toolState(tool.key).installed) && <p className="hint">All web development tools are installed.</p>}
    </Section>}

    <Section id="market" title={searching ? 'Open VSX marketplace' : category ? `Popular · ${CATEGORIES.find(c => c[0] === category)?.[1]}` : 'Popular on Open VSX'} count={loading ? undefined : results.length} collapsed={collapsed.has('market')} onToggle={toggle}
      tools={loading ? <LoaderCircle size={13} className="spin ext-section-spinner" /> : undefined}>
      {!loading && !results.length && !error && <p className="hint">No extensions found. Try another search.</p>}
      {results.map(item => {
        const id = `${item.namespace}.${item.name}`; const tool = toolFor(id); const name = item.displayName || item.name;
        const installed = tool ? toolState(tool.key).installed : items.some(x => x.id.toLowerCase() === id.toLowerCase());
        return <Row key={id} icon={item.files?.icon} name={name} description={item.description} publisher={item.namespaceDisplayName || item.namespace} verified={item.verified}
          downloads={item.downloadCount} rating={item.averageRating} selected={isSelected(marketTarget(id, name))}
          badge={tool ? <em className="ext-badge builtin">Built into Veyra</em> : item.deprecated ? <em className="ext-badge warn">Deprecated</em> : undefined}
          onOpen={() => onOpen(marketTarget(id, name, item.files?.icon))}
          actions={installed ? <span className="ext-installed">Installed</span>
            : <button className="ext-action primary" aria-label={`Install ${name}`} disabled={!!busy} onClick={() => void install(item)}>{busy === id ? <LoaderCircle size={12} className="spin" /> : <Download size={12} />}{busy === id ? 'Installing…' : 'Install'}</button>} />;
      })}
    </Section>
  </section>;
}
