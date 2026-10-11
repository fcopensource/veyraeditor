import { useEffect, useMemo, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { openUrl } from '@tauri-apps/plugin-opener';
import { BadgeCheck, Check, CircleAlert, CloudDownload, Download, ExternalLink, Info, LoaderCircle, Palette, Power, Radio, RefreshCw, RotateCw, Sparkles, Square, Terminal, Trash2, Wrench } from 'lucide-react';
import { goLive, goOffline, useLiveServer } from './live';

/** The Veyra Live Server extension for VS Code is attached to every Veyra release. */
const VSCODE_LIVE_SERVER = 'https://github.com/fcopensource/veyraeditor/releases/latest';
import { capabilities, compactCount, fetchDetails, fetchExtension, fetchManifest, fetchText, support, themeId, type Capabilities, type Details, type Extension } from './extensions';
import { TOOLS, environment, installTool, onToolsChange, openClaudeCode, refreshTools, restartTool, setToolEnabled, toolFor, toolState, uninstallTool, type Tool } from './lsp/tools';
import { ExtIcon, Rating, marketTarget, useMarketIcon, type ExtensionTarget } from './extensionUi';
import './extensions.css';
import './extensions-ui.css';

type Props = { target: ExtensionTarget; items: Extension[]; onChange: (items: Extension[]) => void; theme: string; onTheme: (theme: string) => void; onOpen: (target: ExtensionTarget) => void };
const open = (url?: string) => { if (url) void openUrl(url.replace(/^git\+/, '').replace(/\.git$/, '')).catch(() => {}); };
const date = (value?: string) => value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';

/** Sanitised Markdown; links open in the browser, never inside Veyra. */
function Markdown({ source, empty }: { source: string | null; empty: string }) {
  const html = useMemo(() => source ? DOMPurify.sanitize(marked.parse(source, { async: false, gfm: true }) as string) : '', [source]);
  if (source === null) return <div className="ext-loading"><LoaderCircle size={16} className="spin" />Loading…</div>;
  if (!source.trim()) return <p className="ext-empty">{empty}</p>;
  return <article className="ext-markdown markdown-preview" dangerouslySetInnerHTML={{ __html: html }} onClick={event => {
    const anchor = (event.target as HTMLElement).closest('a'); if (!anchor) return;
    event.preventDefault();
    const href = anchor.getAttribute('href') || '';
    if (href.startsWith('#')) { (event.currentTarget.querySelector(`[id="${CSS.escape(href.slice(1))}"]`) as HTMLElement | null)?.scrollIntoView({ behavior: 'smooth' }); return; }
    if (/^https?:/i.test(href)) open(href);
  }} />;
}

export function ExtensionPage(props: Props) {
  return props.target.kind === 'tool' ? <ToolPage {...props} toolKey={props.target.key} /> : <MarketPage {...props} namespace={props.target.namespace} name={props.target.name} />;
}

/* ---------- Marketplace extension ---------- */
function MarketPage({ namespace, name, target, items, onChange, theme, onTheme, onOpen }: Props & { namespace: string; name: string }) {
  const id = `${namespace}.${name}`;
  const [details, setDetails] = useState<Details | null>(null);
  const [failed, setFailed] = useState('');
  const [readme, setReadme] = useState<string | null>(null);
  const [changelog, setChangelog] = useState<string | null>(null);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [manifest, setManifest] = useState<any>(null);
  const [tab, setTab] = useState<'details' | 'features' | 'changelog' | 'versions'>('details');
  const [busy, setBusy] = useState(''); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [, setTick] = useState(0);
  useEffect(() => onToolsChange(() => setTick(n => n + 1)), []);
  useEffect(() => {
    let current = true;
    setDetails(null); setFailed(''); setReadme(null); setChangelog(null); setCaps(null); setManifest(null); setTab('details');
    fetchDetails(namespace, name).then(async data => {
      if (!current) return;
      setDetails(data);
      void (data.files?.readme ? fetchText(data.files.readme) : Promise.resolve('')).then(text => { if (current) setReadme(text); }).catch(() => { if (current) setReadme(''); });
      void fetchManifest(data).then(m => { if (current) { setManifest(m); setCaps(capabilities(m)); } }).catch(() => { if (current) setCaps(capabilities(null)); });
    }).catch(e => { if (current) setFailed(String(e)); });
    return () => { current = false; };
  }, [namespace, name]);
  useEffect(() => {
    if (tab !== 'changelog' || changelog !== null || !details) return;
    let current = true;
    void (details.files?.changelog ? fetchText(details.files.changelog) : Promise.resolve('')).then(text => { if (current) setChangelog(text); }).catch(() => { if (current) setChangelog(''); });
    return () => { current = false; };
  }, [tab, details, changelog]);

  const local = items.find(x => x.id.toLowerCase() === id.toLowerCase());
  const tool = toolFor(id);
  const title = details?.displayName || local?.name || target.title;
  const icon = details?.files?.icon || local?.icon || target.icon;
  const level = caps ? support(caps) : null;
  const versions = Object.keys(details?.allVersions || {}).filter(v => v !== 'latest');

  async function install(version?: string) {
    if (!details) return;
    setBusy(version || 'install'); setError(''); setNotice('');
    try {
      const ext = await fetchExtension({ ...details, version: version || details.version });
      onChange([...items.filter(x => x.id.toLowerCase() !== ext.id.toLowerCase()), { ...ext, enabled: local ? local.enabled : true }]);
      setNotice(local ? `${ext.name} ${local.version === ext.version ? 'reinstalled' : `is now v${ext.version}`}.` : `${ext.name} installed.${ext.themes.length ? ' Pick its colour theme with "Set Colour Theme".' : ''}`);
    } catch (e) { setError(String(e)); } finally { setBusy(''); }
  }
  const change = (next: Extension[]) => { try { onChange(next); setError(''); } catch (e) { setError(String(e)); } };
  const localThemes = local?.enabled ? local.themes.map((t, i) => ({ id: themeId(local.id, i), name: t.name })) : [];

  if (failed && !local) return <div className="ext-page"><div className="ext-page-error"><CircleAlert size={20} /><div><b>Couldn't load {target.title}</b><p>{failed}</p></div></div></div>;

  return <div className="ext-page" aria-label={`Extension: ${title}`}>
    <header className="ext-hero">
      <ExtIcon src={icon} name={title} size={112} />
      <div className="ext-hero-main">
        <div className="ext-hero-title"><h1>{title}</h1>{details?.version && <span className="ext-version big">v{details.version}</span>}{details?.preview && <em className="ext-badge">Preview</em>}{details?.deprecated && <em className="ext-badge warn">Deprecated</em>}</div>
        <div className="ext-hero-meta">
          <span className="ext-publisher big">{details?.verified && <BadgeCheck size={15} className="ext-verified" />}{details?.namespaceDisplayName || namespace}</span>
          {details?.downloadCount ? <span title={`${details.downloadCount.toLocaleString()} downloads`}><CloudDownload size={14} />{compactCount(details.downloadCount)} downloads</span> : null}
          <Rating value={details?.averageRating} count={details?.reviewCount} size={13} />
          {details?.license && <span>{details.license}</span>}
        </div>
        <p className="ext-hero-description">{details?.description || local?.description || ''}</p>
        <div className="ext-hero-actions">
          {tool ? <>
            <button className="ext-button primary" onClick={() => onOpen({ kind: 'tool', key: tool.key, title: tool.name })}><Sparkles size={14} />{toolState(tool.key).installed ? `Open ${tool.name}` : `Install ${tool.name}`}</button>
            <span className="ext-hero-note">Veyra has this built in: it installs the same language server natively.</span>
          </> : local ? <>
            {details && details.version !== local.version && <button className="ext-button primary" disabled={!!busy || level !== 'installable'} onClick={() => void install()}><RefreshCw size={14} />Update to v{details.version}</button>}
            {localThemes.length > 0 && (localThemes.length === 1
              ? <button className="ext-button primary" disabled={theme === localThemes[0].id} onClick={() => onTheme(localThemes[0].id)}><Palette size={14} />{theme === localThemes[0].id ? 'Colour theme applied' : 'Set Colour Theme'}</button>
              : <select className="ext-button" aria-label="Set colour theme" value={localThemes.some(t => t.id === theme) ? theme : ''} onChange={e => onTheme(e.target.value)}><option value="">Set Colour Theme…</option>{localThemes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>)}
            <button className="ext-button" onClick={() => change(items.map(x => x.id === local.id ? { ...x, enabled: !x.enabled } : x))}><Power size={14} />{local.enabled ? 'Disable' : 'Enable'}</button>
            <button className="ext-button" disabled={!!busy || !details} title="Download and install this version again" onClick={() => void install(local.version)}>{busy === local.version ? <LoaderCircle size={14} className="spin" /> : <RotateCw size={14} />}Reinstall</button>
            <button className="ext-button danger" onClick={() => change(items.filter(x => x.id !== local.id))}><Trash2 size={14} />Uninstall</button>
          </> : <>
            <button className="ext-button primary" disabled={!details || !!busy || level !== 'installable'} onClick={() => void install()}>{busy === 'install' ? <LoaderCircle size={14} className="spin" /> : <Download size={14} />}{busy === 'install' ? 'Installing…' : 'Install'}</button>
          </>}
          {!tool && versions.length > 1 && level === 'installable' && <select className="ext-button" aria-label="Install another version" value="" disabled={!!busy} onChange={e => e.target.value && void install(e.target.value)}><option value="">Install another version…</option>{versions.slice(0, 30).map(v => <option key={v} value={v}>v{v}{v === details?.version ? ' (latest)' : ''}{v === local?.version ? ' (installed)' : ''}</option>)}</select>}
        </div>
        {!tool && level && level !== 'installable' && <div className="ext-compat"><Info size={15} /><span>{level === 'host'
          ? <>This extension runs its own code, which needs a VS Code extension host. That's on Veyra's roadmap. Themes, snippets and the built-in language tools work today.</>
          : <>It contributes language grammars or icon themes. Veyra will support these in an upcoming release.</>}
          {/python|pylance|debugpy|jupyter/i.test(id) && <> <button className="link-button" onClick={() => onOpen({ kind: 'tool', key: 'python', title: 'Python (Pyright)' })}>Use the built-in Python (Pyright) tool instead</button> for errors, completions and go to definition.</>}</span></div>}
        {error && <p className="extension-error" role="alert">{error}</p>}{notice && <p className="extension-notice" role="status">{notice}</p>}
      </div>
    </header>

    <nav className="ext-tabs" role="tablist">
      {(['details', 'features', 'changelog', 'versions'] as const).map(name => <button key={name} role="tab" aria-selected={tab === name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>{name === 'details' ? 'Details' : name === 'features' ? 'Features' : name === 'changelog' ? 'Changelog' : `Versions${versions.length ? ` (${versions.length})` : ''}`}</button>)}
    </nav>

    <div className="ext-body">
      <div className="ext-content">
        {tab === 'details' && <Markdown source={details ? readme : (local ? '' : null)} empty="This extension has no README." />}
        {tab === 'features' && <Features caps={caps} manifest={manifest} local={local} />}
        {tab === 'changelog' && <Markdown source={details ? changelog : ''} empty="No changelog was published with this extension." />}
        {tab === 'versions' && <div className="ext-versions">{versions.length ? versions.map(v => <div key={v} className="ext-version-row">
          <b>v{v}</b>{v === details?.version && <em className="ext-badge builtin">Latest</em>}{v === local?.version && <em className="ext-badge">Installed</em>}
          <span />{!tool && level === 'installable' && v !== local?.version && <button className="ext-button small" disabled={!!busy} onClick={() => void install(v)}>{busy === v ? <LoaderCircle size={12} className="spin" /> : <Download size={12} />}Install v{v}</button>}
        </div>) : <p className="ext-empty">No version history available.</p>}</div>}
      </div>
      <aside className="ext-side">
        <h3>Installation</h3>
        <dl><dt>Identifier</dt><dd><code>{id}</code></dd>{local && <><dt>Installed</dt><dd>v{local.version}{local.enabled ? '' : ' · disabled'}</dd></>}{details?.version && <><dt>Latest</dt><dd>v{details.version}</dd></>}</dl>
        <h3>Marketplace</h3>
        <dl>{details?.timestamp && <><dt>Last released</dt><dd>{date(details.timestamp)}</dd></>}{details?.publishedBy?.loginName && <><dt>Published by</dt><dd>{details.publishedBy.fullName || details.publishedBy.loginName}</dd></>}
          {details?.engines?.vscode && <><dt>VS Code</dt><dd>{details.engines.vscode}</dd></>}</dl>
        {!!details?.categories?.length && <><h3>Categories</h3><div className="ext-chips">{details.categories.map(c => <span key={c}>{c}</span>)}</div></>}
        <h3>Resources</h3>
        <div className="ext-links">
          <button onClick={() => open(`https://open-vsx.org/extension/${namespace}/${name}`)}><ExternalLink size={12} />Open VSX</button>
          {details?.repository && <button onClick={() => open(details.repository)}><ExternalLink size={12} />Repository</button>}
          {details?.homepage && <button onClick={() => open(details.homepage)}><ExternalLink size={12} />Homepage</button>}
          {details?.bugs && <button onClick={() => open(details.bugs)}><ExternalLink size={12} />Issues</button>}
        </div>
        {!!details?.tags?.filter(t => !t.startsWith('__')).length && <><h3>Tags</h3><div className="ext-chips">{details.tags.filter(t => !t.startsWith('__')).slice(0, 24).map(t => <span key={t}>{t}</span>)}</div></>}
      </aside>
    </div>
  </div>;
}

function Features({ caps, manifest, local }: { caps: Capabilities | null; manifest: any; local?: Extension }) {
  if (!caps) return <div className="ext-loading"><LoaderCircle size={16} className="spin" />Reading what this extension contributes…</div>;
  const c = manifest?.contributes || {};
  const rows: [string, number, string][] = [
    ['Colour themes', caps.themes, 'Works in Veyra'], ['Snippets', caps.snippets, 'Works in Veyra'],
    ['Languages', caps.languages, 'Coming soon'], ['Grammars', caps.grammars, 'Coming soon'], ['File icon themes', caps.iconThemes, 'Coming soon'],
    ['Commands', caps.commands, 'Needs extension host'], ['Settings', caps.settings, 'Needs extension host'], ['Keybindings', caps.keybindings, 'Needs extension host'],
  ];
  const listed = rows.filter(([, n]) => n > 0);
  return <div className="ext-features">
    {caps.runsCode && <div className="ext-compat"><Info size={15} /><span>Includes program code (<code>{manifest?.main || manifest?.browser}</code>) that runs in an extension host.</span></div>}
    {listed.length ? <table><thead><tr><th>Contribution</th><th>Count</th><th>In Veyra</th></tr></thead><tbody>
      {listed.map(([label, n, status]) => <tr key={label}><td>{label}</td><td>{n}</td><td className={status === 'Works in Veyra' ? 'ok' : ''}>{status === 'Works in Veyra' && <Check size={12} />}{status}</td></tr>)}
    </tbody></table> : <p className="ext-empty">This extension doesn't declare any contributions.</p>}
    {Array.isArray(c.themes) && c.themes.length > 0 && <><h3>Themes</h3><ul>{c.themes.map((t: any, i: number) => <li key={i}>{String(t.label || t.id || t.path)}<small>{t.uiTheme === 'vs' ? 'Light' : t.uiTheme === 'hc-black' ? 'High contrast' : 'Dark'}</small></li>)}</ul></>}
    {local && local.snippets.length > 0 && <><h3>Snippets</h3><ul>{[...new Set(local.snippets.map(s => s.language))].map(l => <li key={l}>{l}<small>{local.snippets.filter(s => s.language === l).length} snippets</small></li>)}</ul></>}
    {Array.isArray(c.commands) && c.commands.length > 0 && <><h3>Commands</h3><ul>{c.commands.slice(0, 60).map((cmd: any, i: number) => <li key={i}>{String(cmd.title || cmd.command)}<small><code>{String(cmd.command)}</code></small></li>)}</ul></>}
    {Array.isArray(c.languages) && c.languages.length > 0 && <><h3>Languages</h3><div className="ext-chips">{c.languages.map((l: any, i: number) => <span key={i}>{String(l.aliases?.[0] || l.id)}</span>)}</div></>}
  </div>;
}

/* ---------- Built-in language tool ---------- */
function ToolPage({ toolKey, onOpen }: Props & { toolKey: string }) {
  const tool = TOOLS.find(t => t.key === toolKey) as Tool;
  const [, setTick] = useState(0);
  const liveInfo = useLiveServer();
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [readme, setReadme] = useState<string | null>(null);
  useEffect(() => onToolsChange(() => setTick(n => n + 1)), []);
  const origin = tool?.replaces.find(id => id.includes('.')) || '';
  const marketIcon = useMarketIcon(origin);
  const icon = tool?.icon || marketIcon;
  useEffect(() => {
    if (tool?.readme) { setReadme(tool.readme); return; }
    if (!origin) { setReadme(''); return; }
    let current = true; const dot = origin.indexOf('.');
    fetchDetails(origin.slice(0, dot), origin.slice(dot + 1)).then(d => d.files?.readme ? fetchText(d.files.readme) : '').then(text => { if (current) setReadme(text); }).catch(() => { if (current) setReadme(''); });
    return () => { current = false; };
  }, [origin]);
  if (!tool) return <div className="ext-page"><p className="ext-empty">Unknown tool.</p></div>;
  const state = toolState(tool.key); const env = environment(); const live = tool.kind === 'feature' ? liveInfo : null;
  const run = (action: () => Promise<unknown>, done?: string) => { setError(''); setNotice(''); void action().then(() => { if (done) setNotice(done); }).catch(e => setError(String(e))); };
  const status = tool.kind === 'feature' ? (live ? `Running at ${live.url}` : 'Ready: click Go Live or right-click an HTML file')
    : tool.kind === 'cli' ? (state.installed ? 'Ready: opens in Veyra\'s terminal' : 'Not installed')
    : tool.kind === 'debugger' ? (state.installed ? 'Ready: open a Python file and press F5' : 'Not installed')
    : !state.installed ? 'Not installed' : !state.enabled ? 'Disabled' : tool.kind === 'formatter' ? 'Ready: Format Document or format on save'
    : state.running === 'running' ? 'Running' : state.running === 'starting' ? 'Starting…' : state.running === 'failed' ? 'Failed to start' : `Starts when you open a ${tool.languages.slice(0, 3).join(' / ')} file`;

  return <div className="ext-page" aria-label={`Extension: ${tool.name}`}>
    <header className="ext-hero">
      <ExtIcon src={icon} name={tool.name} size={112} />
      <div className="ext-hero-main">
        <div className="ext-hero-title"><h1>{tool.name}</h1>{state.version && <span className="ext-version big">v{state.version}</span>}<em className="ext-badge builtin">Built into Veyra</em>{tool.beta && <em className="ext-badge">Beta</em>}</div>
        <div className="ext-hero-meta"><span className="ext-publisher big"><Wrench size={14} />{tool.publisher}</span><span className={'ext-status ' + (state.running === 'running' ? 'on' : state.running === 'failed' ? 'failed' : '')}>{state.busy ? 'Working…' : status}</span></div>
        <p className="ext-hero-description">{tool.description}</p>
        <div className="ext-hero-actions">
          {tool.kind === 'feature' ? (live
            ? <>
              <button className="ext-button primary" onClick={() => open(live.url)}><ExternalLink size={14} />Open in browser</button>
              <button className="ext-button" aria-label={`Stop ${tool.name}`} onClick={() => run(goOffline, 'Live Server stopped.')}><Square size={13} />Stop</button>
            </>
            : <button className="ext-button primary" aria-label={`Go Live with ${tool.name}`} onClick={() => run(() => goLive(), 'Live Server is running. Save a file to see the browser update.')}><Radio size={14} />Go Live</button>)
          : tool.kind === 'cli' ? (state.installed
            ? <button className="ext-button primary" aria-label={`Open ${tool.name}`} onClick={() => run(async () => openClaudeCode())}><Terminal size={14} />Open {tool.name}</button>
            : <>
              <button className="ext-button primary" aria-label={`Install ${tool.name}`} onClick={() => run(() => installTool(tool.key), 'Installing in the terminal below. When it finishes, click "Check again".')}><Download size={14} />Install {tool.name}</button>
              <button className="ext-button" onClick={() => run(async () => { await refreshTools(); if (!toolState(tool.key).installed) throw new Error(`${tool.name} wasn't found yet. Wait for the installer to finish, then check again.`); }, `${tool.name} is ready.`)}><RefreshCw size={14} />Check again</button>
            </>)
          : !state.installed
            ? <button className="ext-button primary" aria-label={`Install ${tool.name}`} disabled={state.busy || (tool.kind === 'debugger' ? !env.python : !env.node)} onClick={() => run(() => installTool(tool.key), `${tool.name} installed.`)}>{state.busy ? <LoaderCircle size={14} className="spin" /> : <Download size={14} />}{state.busy ? 'Installing…' : 'Install'}</button>
            : <>
              {tool.kind !== 'debugger' && <button className="ext-button" disabled={state.busy} onClick={() => run(() => setToolEnabled(tool.key, !state.enabled))}><Power size={14} />{state.enabled ? 'Disable' : 'Enable'}</button>}
              {tool.kind === 'server' && state.enabled && <button className="ext-button" disabled={state.busy} onClick={() => run(() => restartTool(tool.key), 'Restarted.')}><RotateCw size={14} />Restart</button>}
              <button className="ext-button" disabled={state.busy} title="Download and install again" onClick={() => run(async () => { await uninstallTool(tool.key); await installTool(tool.key); }, `${tool.name} reinstalled.`)}><RefreshCw size={14} />Reinstall</button>
              <button className="ext-button danger" disabled={state.busy} onClick={() => run(() => uninstallTool(tool.key), `${tool.name} removed.`)}><Trash2 size={14} />Uninstall</button>
            </>}
        </div>
        {tool.kind === 'feature' && <div className="ext-compat"><Info size={15} /><span>Built into Veyra: nothing to install, no Node.js needed. Serves your open folder on <b>http://127.0.0.1:5500</b> (the next free port if it&apos;s taken), only to this computer. Using VS Code too? <button className="link-button" onClick={() => open(VSCODE_LIVE_SERVER)}>Get Veyra Live Server for VS Code</button> (the <code>.vsix</code> file in each release).</span></div>}
        {tool.kind === 'cli' && <div className="ext-compat"><Info size={15} /><span>Runs Anthropic&apos;s official installer in a terminal, then opens Claude Code in your project. Needs a <b>Claude Pro, Max, Team, Enterprise or Console</b> account; Claude Code asks you to sign in the first time.</span></div>}
        {tool.kind === 'debugger' && !env.python && <div className="ext-compat"><Info size={15} /><span>Needs <b>Python 3.8 or newer</b>. Install it from python.org, then restart Veyra.</span></div>}
        {(tool.kind === 'server' || tool.kind === 'formatter') && !env.node && <div className="ext-compat"><Info size={15} /><span>Needs <b>Node.js 18 or newer</b>. Install it from nodejs.org, then restart Veyra.</span></div>}
        {state.running === 'failed' && state.error && <pre className="tool-error">{state.error}</pre>}
        {error && <p className="extension-error" role="alert">{error}</p>}{notice && <p className="extension-notice" role="status">{notice}</p>}
      </div>
    </header>
    <div className="ext-body">
      <div className="ext-content">
        <h2 className="ext-subtitle">{tool.readme ? `About ${tool.name}` : 'About the original extension'}</h2>
        <Markdown source={readme} empty="No README available." />
      </div>
      <aside className="ext-side">
        <h3>How it runs</h3>
        <dl>
          <dt>Runtime</dt><dd>{tool.kind === 'feature' ? 'Native, built into Veyra' : tool.kind === 'cli' ? (state.installed ? `Claude Code ${state.version}` : 'Not installed') : tool.kind === 'debugger' ? (env.python ? `Python ${env.python}` : 'Python not found') : env.node ? `Node.js ${env.node}` : 'Node.js not found'}</dd>
          <dt>Kind</dt><dd>{tool.kind === 'feature' ? 'Development server with live reload' : tool.kind === 'server' ? 'Language server' : tool.kind === 'formatter' ? 'Formatter' : tool.kind === 'debugger' ? 'Debugger (Debug Adapter Protocol)' : 'Terminal app'}</dd>
          <dt>Stored in</dt><dd>{tool.kind === 'feature' ? 'Built into Veyra' : tool.kind === 'cli' ? 'Installed by Anthropic\'s installer' : 'Veyra\'s app folder'}</dd>
        </dl>
        <h3>Languages</h3>
        <div className="ext-chips">{tool.languages.map(l => <span key={l}>{l}</span>)}</div>
        <h3>Stands in for</h3>
        <div className="ext-links">{tool.replaces.filter(id => id.includes('.')).map(id => <button key={id} onClick={() => onOpen(marketTarget(id, id))}><ExternalLink size={12} />{id}</button>)}</div>
      </aside>
    </div>
  </div>;
}
