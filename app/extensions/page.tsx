import type {Metadata} from 'next';
import {OG_IMAGE} from '@/lib/site';
import Image from 'next/image';
import Link from 'next/link';
import {ArrowRight,BadgeCheck,Check,Code2,Download,LayoutPanelLeft,Package,Palette,Puzzle,Search,ShieldCheck,Sparkles,Wrench} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {ClosingCTA} from '@/components/ContentPage';
import {ExtensionGallery} from '@/components/ExtensionGallery';
import './extensions.css';

export const metadata:Metadata={
  title:'Extensions: Live Server, ESLint, Prettier & More',
  description:'Path IntelliSense Veyra, Query Lens for MongoDB, Env, Container Studio for Docker, MCP Studio, API Client, npm IntelliSense, Port Manager and Live Server for VS Code, plus ESLint, Prettier, Tailwind and Python built into Veyra Studio.',
  alternates:{canonical:'/extensions'},
  openGraph:{images:[OG_IMAGE],url:'/extensions',title:'Veyra extensions: your favourite tools, built in'},
};

/** What installing a popular VS Code extension gives you in Veyra. Kept honest: partial support says so. */
const MAPPED:[string,string,string,'built'|'partial'|'market'][]=[
  ['Live Server','ritwickdey.LiveServer','Veyra Live Server, built in','built'],
  ['ESLint','dbaeumer.vscode-eslint','Built in','built'],
  ['Prettier','esbenp.prettier-vscode','Built in, with format on save','built'],
  ['Tailwind CSS IntelliSense','bradlc.vscode-tailwindcss','Built in','built'],
  ['Pylance / Python','ms-python.vscode-pylance','Python (Pyright), built in','built'],
  ['Python Debugger','ms-python.debugpy','Built in: breakpoints, stepping, Debug Console','built'],
  ['Claude Code','anthropic.claude-code','Built in, runs in Veyra’s terminal','built'],
  ['Vue - Official','vue.volar','Built in (beta)','built'],
  ['GitLens','eamodio.gitlens','Built-in Git: history, graph, diffs, branches (no inline blame yet)','partial'],
  ['One Dark Pro, Dracula…','Colour themes','Install from Open VSX in one click','market'],
];

export default function Extensions(){
  return <><Nav/><Breadcrumbs items={[{name:'Extensions',path:'/extensions'}]}/>
    <main className="page-shell"><div className="content ext-page-site">
      {/* Hero: the pitch, and Veyra's Extensions view as it looks in the app */}
      <section className="ext-hero-site">
        <div className="ext-hero-copy">
          <span className="ext-kicker"><Puzzle size={13}/>EXTENSIONS</span>
          <h1>Your favourite tools.<br/><em>Already in Veyra.</em></h1>
          <p>Click Install on the VS Code extension you know and Veyra sets up the real thing: the same language servers, formatter and debugger, with nothing to configure. Add themes and snippets from the open marketplace.</p>
          <div className="ext-hero-actions">
            <Link className="primary" href="/download"><Download size={16}/>Download Veyra</Link>
            <a className="secondary" href="#gallery"><Search size={16}/>Browse built-in tools</a>
          </div>
          <ul className="ext-hero-stats">
            <li><b>11</b><span>built-in tools</span></li>
            <li><b>1 click</b><span>to install</span></li>
            <li><b>0</b><span>settings to copy</span></li>
          </ul>
        </div>
        <div className="ext-mock" aria-hidden="true">
          <div className="ext-mock-head"><span>EXTENSIONS</span><i/></div>
          <div className="ext-mock-search"><Search size={13}/>live server</div>
          <div className="ext-mock-label">POPULAR ON OPEN VSX</div>
          <div className="ext-mock-row featured"><Image src="/live-server-icon-296.png" width={34} height={34} alt=""/><span><b>Live Server</b><small>Launch a development local server with live reload</small><em>Built into Veyra</em></span><button>Installed</button></div>
          <div className="ext-mock-row"><span className="ext-mock-icon tone-violet"><Sparkles size={16}/></span><span><b>ESLint</b><small>Integrates ESLint into the editor</small><em>Built into Veyra</em></span><button>Install</button></div>
          <div className="ext-mock-row"><span className="ext-mock-icon tone-pink"><Palette size={16}/></span><span><b>Prettier</b><small>Code formatter using prettier</small><em>Built into Veyra</em></span><button>Install</button></div>
          <div className="ext-mock-row"><span className="ext-mock-icon tone-dark"><Code2 size={16}/></span><span><b>One Dark Pro</b><small>Atom’s iconic One Dark theme</small><i>★ 4.7 · 9.1M</i></span><button>Install</button></div>
          <div className="ext-mock-glow"/>
        </div>
      </section>

      {/* Veyra originals */}
      <section className="ext-section">
        <header><span>VEYRA ORIGINALS</span><h2>Made by Veyra.</h2></header>
        <div className="ext-originals">
          <Link href="/live-server" className="ext-original live">
            <Image src="/live-server-icon-296.png" width={96} height={96} alt=""/>
            <div><small>LIVE PREVIEW · ALSO FOR VS CODE</small><h3>Veyra Live Server</h3><p>Save. See it. Instantly. Go Live serves your folder and reloads the browser on save, with CSS applied without a reload.</p><span className="ext-link">Explore Live Server <ArrowRight size={14}/></span></div>
          </Link>
          <Link href="/docs#ai" className="ext-original ai">
            <Image src="/veyra-ai.svg" width={96} height={96} alt=""/>
            <div><small>AI ASSISTANT · BUILT IN</small><h3>Veyra AI</h3><p>Ask about your code, explain it, or edit with AI and review every change as a diff. Sign in with a free account: 10 free requests, no API key.</p><span className="ext-link">Set up Veyra AI <ArrowRight size={14}/></span></div>
          </Link>
          <Link href="/port-manager" className="ext-original ports">
            <Image src="/port-manager-icon.png" width={96} height={96} alt=""/>
            <div><small>FOR VS CODE</small><h3>Veyra Port Manager</h3><p>Every port in use, and the app behind it. Open, copy or stop it in one click, and free a busy port in seconds. System services are never touched.</p><span className="ext-link">Explore Port Manager <ArrowRight size={14}/></span></div>
          </Link>
          <Link href="/path-intellisense" className="ext-original pathis">
            <Image src="/path-intellisense-icon.png" width={96} height={96} alt=""/>
            <div><small>NEW · FOR VS CODE</small><h3>Path IntelliSense Veyra</h3><p>File paths, completed as you type: imports, src, href, CSS url() and Markdown. tsconfig aliases with no setup, the right import extension, and broken paths flagged with a fix.</p><span className="ext-link">Explore Path IntelliSense <ArrowRight size={14}/></span></div>
          </Link>
          <Link href="/mongodb" className="ext-original mongodb">
            <Image src="/mongodb-icon.png" width={96} height={96} alt=""/>
            <div><small>NEW · FOR VS CODE</small><h3>Veyra Query Lens for MongoDB</h3><p>See how every MongoDB query performs, right above your code. The index that fixes slow ones in one click, unused indexes, and Mongoose schemas checked against real data.</p><span className="ext-link">Explore Query Lens <ArrowRight size={14}/></span></div>
          </Link>
          <Link href="/env" className="ext-original env">
            <Image src="/env-icon.png" width={96} height={96} alt=""/>
            <div><small>NEW · FOR VS CODE</small><h3>Veyra Env</h3><p>Never ship a missing or leaked env variable again. Warnings for missing variables, autocomplete for process.env, secrets hidden on screen, a .gitignore guard and .env.example in sync.</p><span className="ext-link">Explore Veyra Env <ArrowRight size={14}/></span></div>
          </Link>
          <Link href="/docker" className="ext-original docker">
            <Image src="/docker-icon.png" width={96} height={96} alt=""/>
            <div><small>NEW · FOR VS CODE</small><h3>Veyra Container Studio for Docker</h3><p>Docker in VS Code, made easy. Containers, images and Compose in one sidebar, live logs, CPU and memory, one-click cleanup, and Dockerfile checks with fixes.</p><span className="ext-link">Explore Container Studio <ArrowRight size={14}/></span></div>
          </Link>
          <Link href="/mcp-studio" className="ext-original mcp">
            <Image src="/mcp-studio-icon.png" width={96} height={96} alt=""/>
            <div><small>NEW · FOR VS CODE</small><h3>Veyra MCP Studio</h3><p>Your MCP servers, all in one place. See the servers of VS Code, Claude, Cursor and Windsurf, add popular ones in two clicks, try every tool, and see why a server fails.</p><span className="ext-link">Explore MCP Studio <ArrowRight size={14}/></span></div>
          </Link>
          <Link href="/api-client" className="ext-original api">
            <Image src="/api-client-icon.png" width={96} height={96} alt=""/>
            <div><small>NEW · FOR VS CODE</small><h3>Veyra API Client</h3><p>Test any API without leaving VS Code. REST and GraphQL, collections saved in your repo, environments with private values, and cURL and Postman import. Free, no account.</p><span className="ext-link">Explore API Client <ArrowRight size={14}/></span></div>
          </Link>
          <Link href="/npm-intellisense" className="ext-original npm">
            <Image src="/npm-intellisense-icon.png" width={96} height={96} alt=""/>
            <div><small>NEW · FOR VS CODE</small><h3>Veyra npm IntelliSense</h3><p>Every package, one keystroke away. Autocomplete imports with versions, catch missing packages and install them in one click, and find unused dependencies.</p><span className="ext-link">Explore npm IntelliSense <ArrowRight size={14}/></span></div>
          </Link>
          <Link href="/salesforce-studio" className="ext-original salesforce">
            <Image src="/salesforce-studio-icon.png" width={96} height={96} alt=""/>
            <div><small>FOR CHROME, EDGE &amp; FIREFOX</small><h3>Salesforce Studio</h3><p>Your org’s code, open in seconds. Edit LWC, Aura, Apex and Visualforce from any Salesforce tab, and save to your org with Ctrl+S.</p><span className="ext-link">Explore Salesforce Studio <ArrowRight size={14}/></span></div>
          </Link>
        </div>
      </section>

      {/* Interactive gallery */}
      <section className="ext-section" id="gallery">
        <header><span>BUILT-IN TOOLS</span><h2>Everything in one click.</h2><p>Open <strong>Extensions</strong> in Veyra, click <strong>Install</strong>, and the tool starts automatically when you open a matching file. Tools live in Veyra&apos;s own app folder, never in your project.</p></header>
        <ExtensionGallery/>
      </section>

      {/* VS Code mapping */}
      <section className="ext-section">
        <header><span>COMING FROM VS CODE</span><h2>Your favourites, mapped.</h2><p>Search for the extension you already use. Veyra shows what it becomes, and installs it in one click.</p></header>
        <div className="ext-map" role="table" aria-label="VS Code extensions and what they become in Veyra">
          <div role="row" className="head"><span role="columnheader">VS Code extension</span><span role="columnheader">In Veyra</span></div>
          {MAPPED.map(([name,id,veyra,kind])=><div role="row" key={id}>
            <span role="cell"><b>{name}</b><code>{id}</code></span>
            <span role="cell" className={'ext-map-'+kind}>{kind==='built'?<Check size={15}/>:kind==='partial'?<Wrench size={15}/>:<Package size={15}/>}{veyra}</span>
          </div>)}
        </div>
      </section>

      {/* How it works */}
      <section className="ext-section">
        <header><span>HOW IT WORKS</span><h2>Three ways to extend Veyra.</h2></header>
        <div className="ext-ways">
          <article><span className="ext-way-icon"><BadgeCheck size={22}/></span><h3>Built-in tools</h3><p>The engines behind the most popular extensions, run natively by Veyra: language servers, Prettier, debugpy, Live Server and Claude Code.</p></article>
          <article><span className="ext-way-icon"><Palette size={22}/></span><h3>Open VSX marketplace</h3><p>Search thousands of extensions from <a href="https://open-vsx.org">Open VSX</a>. Colour themes and snippets install and work instantly.</p></article>
          <article><span className="ext-way-icon"><Package size={22}/></span><h3>Install from VSIX</h3><p>Already have a <code>.vsix</code> file? Install it directly. Veyra checks what it contains first and tells you what will work.</p></article>
        </div>
        <p className="ext-note"><ShieldCheck size={15}/>Extensions that run their own JavaScript need a VS Code extension host, which is on the <Link href="/roadmap">roadmap</Link>. Each extension&apos;s page in Veyra tells you upfront whether it works today.</p>
      </section>

      {/* Extension pages */}
      <section className="content-section split reverse">
        <div>
          <span className="kicker">EXTENSION PAGES</span>
          <h2>Every extension gets its own page.</h2>
          <p>Click any extension to open it in an editor tab, just like VS Code, with more detail where it helps.</p>
          <ul>
            <li><Package/><span><strong>Real icons</strong>, verified publishers, download counts and star ratings</span></li>
            <li><Code2/><span><strong>Details, Features, Changelog and Versions</strong>: install any version you like</span></li>
            <li><LayoutPanelLeft/><span><strong>Install, Uninstall, Disable, Reinstall, Update</strong> and <strong>Set Colour Theme</strong> in one place</span></li>
            <li><Wrench/><span>Each page says upfront whether the extension works in Veyra today</span></li>
          </ul>
        </div>
        <div className="visual" aria-hidden="true">
          <small>Extension: Prettier - Code formatter</small>
          <b>Prettier - Code formatter</b> <i>v12.4.0</i><br/>
          <span style={{color:'#5f6d7a'}}>✓ Prettier · 9.4M downloads · ★★★★☆</span><br/><br/>
          [ Install Prettier ]  <span style={{color:'#5f6d7a'}}>Built into Veyra</span><br/><br/>
          <span style={{color:'#5f6d7a'}}>DETAILS · FEATURES · CHANGELOG · VERSIONS (50)</span>
        </div>
      </section>

      <section className="content-section">
        <div className="cards two">
          <Link className="card" href="/docs#language-tools"><Wrench/><h3>Set up language tools</h3><p>Step-by-step setup and troubleshooting for TypeScript, ESLint, Prettier and Python.</p><span className="card-link">Read the guide <ArrowRight size={14}/></span></Link>
          <Link className="card" href="/roadmap"><Sparkles/><h3>What&apos;s next</h3><p>Node.js debugging, Rust, Go and C++ language servers, more grammars and icon themes, and a full extension host.</p><span className="card-link">See the roadmap <ArrowRight size={14}/></span></Link>
        </div>
      </section>

      <ClosingCTA/>
    </div></main><Footer/></>;
}
