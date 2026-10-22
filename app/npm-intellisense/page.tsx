import type {Metadata} from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {AlertTriangle,Boxes,Code2,Compass,Download,Eraser,Globe,Info,Layers,PackageSearch,Zap} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {ClosingCTA} from '@/components/ContentPage';
import {absolute,jsonLd,marketplaceUrl,VSCODE_EXTENSIONS,vsixUrl} from '@/lib/site';
import '../live-server/live-server.css';
import '../port-manager/port-manager.css';

const EXT=VSCODE_EXTENSIONS.npmIntelliSense;
const MARKETPLACE=marketplaceUrl(EXT.id), VSIX=vsixUrl(EXT);

export const metadata:Metadata={
  title:'Veyra npm IntelliSense: Autocomplete npm Imports in VS Code',
  description:'Autocomplete npm packages, subpaths and Node built-ins in import and require, with versions. Catch missing packages, install in one click, find unused ones.',
  keywords:['npm intellisense','npm autocomplete','VS Code import autocomplete','missing dependency','unused dependencies','package.json','pnpm','yarn'],
  alternates:{canonical:'/npm-intellisense'},
  openGraph:{url:'/npm-intellisense',title:'Veyra npm IntelliSense',description:'Every package, one keystroke away.',images:[{url:'/npm-intellisense-hero.webp',width:1920,height:960,alt:'Veyra npm IntelliSense completing package names with versions'}]},
};

const FEATURES=[
  {icon:Zap,title:'Package names, with versions',copy:'Type inside an import or require and pick from your package.json, each with its version and whether it is a dependency or dev dependency.'},
  {icon:Compass,title:'Subpaths that are right',copy:'next/navigation, @mui/material/Button, date-fns/locale: read from the package’s own exports, so they match the version you have installed.'},
  {icon:Boxes,title:'Node.js built-ins',copy:'fs, path, crypto and the rest, with node: added when your file already uses it.'},
  {icon:AlertTriangle,title:'Missing packages, caught',copy:'Imports of packages that are not installed, or only work because another package installed them, are flagged as you type.'},
  {icon:PackageSearch,title:'Install in one click',copy:'Quick fixes run the right command for your project: npm install, pnpm add, yarn add or bun add, as a dependency or dev dependency.'},
  {icon:Info,title:'Details on hover',copy:'Installed version, the range in package.json, licence, links and the latest version on npm, highlighted when you are behind.'},
  {icon:Eraser,title:'Find unused dependencies',copy:'Scans your project and lists what nothing imports, leaving build tools, @types and anything in your scripts alone.'},
  {icon:Layers,title:'Monorepos and aliases',copy:'Nearest package.json first, then the workspace root. @/, ~/, #imports and tsconfig paths are never mistaken for packages.'},
  {icon:Code2,title:'Vue, Svelte and Astro',copy:'JavaScript, TypeScript, JSX and TSX, plus the script parts of .vue, .svelte and .astro files.'},
];
const FAQ=[
  {q:'Is Veyra npm IntelliSense free?',a:'Yes. It is free and MIT licensed, with no account and no telemetry.'},
  {q:'How is it different from npm Intellisense?',a:'It shows versions and dependency types, completes subpaths from each package’s exports, warns about missing and uninstalled packages with one-click installs, shows package details on hover and finds unused dependencies. It also understands monorepos, aliases and Vue, Svelte and Astro files.'},
  {q:'Does it work with pnpm, yarn and bun?',a:'Yes. It reads your lockfile or the packageManager field and uses the matching command for quick fixes. Yarn Plug’n’Play projects work too.'},
  {q:'Does it go online?',a:'Only to show the latest version of a package on hover, sending just the package name to the npm registry. Turn off veyraNpm.latestVersion to stay fully offline.'},
];

export default function NpmIntelliSensePage(){
  const app={
    '@context':'https://schema.org','@type':'SoftwareApplication',name:'Veyra npm IntelliSense',applicationCategory:'DeveloperApplication',
    operatingSystem:'Windows, macOS, Linux',url:absolute('/npm-intellisense'),image:absolute('/npm-intellisense-icon.png'),softwareVersion:EXT.version,downloadUrl:EXT.listed?MARKETPLACE:VSIX,
    description:'A VS Code extension that autocompletes npm packages in imports with versions, flags missing packages with one-click installs, and finds unused dependencies.',
    offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},publisher:{'@type':'Organization',name:'Veyra',url:absolute('/')},
  };
  const faq={'@context':'https://schema.org','@type':'FAQPage',mainEntity:FAQ.map(item=>({'@type':'Question',name:item.q,acceptedAnswer:{'@type':'Answer',text:item.a}}))};

  return <><Nav/><Breadcrumbs items={[{name:'Extensions',path:'/extensions'},{name:'Veyra npm IntelliSense',path:'/npm-intellisense'}]}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(app)}}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(faq)}}/>
    <main className="page-shell"><div className="content live-page">
      <section className="live-hero">
        <div className="live-hero-glow" aria-hidden="true"/>
        <div className="live-icon"><Image src="/npm-intellisense-icon.png" width={148} height={148} alt="Veyra npm IntelliSense icon" priority/></div>
        <span className="live-kicker"><i/>NEW · VEYRA ORIGINAL · FOR VS CODE</span>
        <h1>Veyra <em>npm IntelliSense</em></h1>
        <p className="live-tagline">Every package, one keystroke away.</p>
        <p className="live-intro">Autocomplete npm packages in your imports, catch missing ones before they break your build, and keep package.json tidy.</p>
        <div className="live-actions">
          {EXT.listed?<a className="primary" href={MARKETPLACE}><Code2 size={16}/>Get it for VS Code</a>:<a className="primary" href={VSIX}><Download size={16}/>Download for VS Code</a>}
          <a className="secondary" href="#install"><Zap size={16}/>How to install</a>
        </div>
        <p className="live-micro">{EXT.id} · v{EXT.version} · Free · MIT · npm, pnpm, yarn and bun</p>
      </section>

      <section className="pm-shot"><img src="/npm-intellisense-hero.webp" alt="Typing an import shows framer-motion, @tanstack/react-query, react-router and vitest with their versions" width={1920} height={960}/></section>

      <section className="content-section">
        <header><span>FEATURES</span><h2>Smarter imports, healthier package.json.</h2></header>
        <div className="cards">{FEATURES.map(feature=><article className="card" key={feature.title}><feature.icon/><h3>{feature.title}</h3><p>{feature.copy}</p></article>)}</div>
      </section>

      <section className="pm-shot"><img src="/npm-intellisense-missing.webp" alt="An import of dayjs flagged as not installed, with the quick fix Install dayjs and pnpm add dayjs running in the terminal" width={1600} height={900} loading="lazy"/></section>
      <section className="pm-shot"><img src="/npm-intellisense-hover.webp" alt="Hovering zod shows its installed version, licence, links and the latest version on npm" width={1600} height={900} loading="lazy"/></section>
      <section className="pm-shot"><img src="/npm-intellisense-unused.webp" alt="Find Unused Dependencies lists moment and request as not imported anywhere, with checkboxes to uninstall them" width={1600} height={900} loading="lazy"/></section>

      <section className="content-section split" id="install">
        <div>
          <span className="kicker">INSTALL</span>
          <h2>Ready in a minute.</h2>
          {EXT.listed?<ol className="live-install">
            <li>In VS Code, open <strong>Extensions</strong> (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>) and search for <strong>Veyra npm IntelliSense</strong>, or open it on the <a href={MARKETPLACE}>Visual Studio Marketplace</a>.</li>
            <li>Click <strong>Install</strong>, then type <code>import x from &quot;</code> in any JavaScript or TypeScript file.</li>
          </ol>:<ol className="live-install">
            <li><a href={VSIX}>Download the <code>.vsix</code></a> (80 KB).</li>
            <li>In VS Code, press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> and run <strong>Extensions: Install from VSIX…</strong>, then choose the file.</li>
            <li>Type <code>import x from &quot;</code> in any JavaScript or TypeScript file of a project with a package.json.</li>
          </ol>}
          {EXT.listed?null:<p className="live-note">Coming to the Visual Studio Marketplace soon.</p>}
        </div>
        <div className="visual" aria-label="Commands">
          <small>Command Palette</small>
          <b>Veyra npm: Add Import from Package…</b><br/>
          <b>Veyra npm: Install Package…</b><br/>
          <b>Veyra npm: Install All Dependencies</b><br/>
          <b>Veyra npm: Find Unused Dependencies</b>
        </div>
      </section>

      <section className="content-section">
        <header><span>FAQ</span><h2>Questions</h2></header>
        <div className="live-faq">{FAQ.map(item=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
        <p className="live-more"><Globe size={14}/>More for VS Code: <Link href="/mongodb">Veyra Query Lens for MongoDB</Link>, <Link href="/env">Veyra Env</Link>, <Link href="/docker">Veyra Container Studio for Docker</Link>, <Link href="/mcp-studio">Veyra MCP Studio</Link>, <Link href="/api-client">Veyra API Client</Link>, <Link href="/port-manager">Veyra Port Manager</Link> and <Link href="/live-server">Veyra Live Server</Link>.</p>
      </section>

      <ClosingCTA title="Made by the Veyra team." copy="Veyra Studio is a fast, free code editor with Live Server, Python debugging and Veyra AI built in."/>
    </div></main><Footer/></>;
}
