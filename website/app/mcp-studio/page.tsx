import type {Metadata} from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {Copy,Download,FlaskConical,LayoutList,LifeBuoy,Lock,MessagesSquare,PlusCircle,SearchCheck,ShieldCheck,Stethoscope,Zap} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {ClosingCTA} from '@/components/ContentPage';
import {absolute,jsonLd,marketplaceUrl,VSCODE_EXTENSIONS,vsixUrl} from '@/lib/site';
import '../live-server/live-server.css';
import '../port-manager/port-manager.css';

const EXT=VSCODE_EXTENSIONS.mcpStudio;
const MARKETPLACE=marketplaceUrl(EXT.id), VSIX=vsixUrl(EXT);

export const metadata:Metadata={
  title:'Veyra MCP Studio: Manage and Test MCP Servers in VS Code',
  description:'See the MCP servers of VS Code, Claude, Cursor and Windsurf in one place. Add servers in two clicks, try every tool in an inspector, and see why a server fails. Free.',
  keywords:['MCP','MCP server','Model Context Protocol','MCP inspector','MCP client','VS Code MCP','Claude MCP','Cursor MCP','claude_desktop_config.json','mcp.json'],
  alternates:{canonical:'/mcp-studio'},
  openGraph:{url:'/mcp-studio',title:'Veyra MCP Studio',description:'Your MCP servers, all in one place. Free, no account.',images:[{url:'/mcp-studio-hero.webp',width:1920,height:960,alt:'Veyra MCP Studio: the Inspector connected to a GitHub MCP server'}]},
};

const FEATURES=[
  {icon:LayoutList,title:'One sidebar for every app',copy:'The servers of VS Code, Claude Code, Claude Desktop, Cursor and Windsurf, grouped by app, with a status for each one.'},
  {icon:PlusCircle,title:'Add servers in two clicks',copy:'Pick from 20 popular servers like GitHub, Playwright and Context7, fill in a folder or key, and choose which apps get it. No JSON editing.'},
  {icon:FlaskConical,title:'Test before you save',copy:'Test connection starts the server and lists its tools, so you know it works before your AI app tries it.'},
  {icon:SearchCheck,title:'Inspector',copy:'Try every tool with a form built from its schema, read resources, fill in prompts, and see results as coloured JSON.'},
  {icon:MessagesSquare,title:'Every message',copy:'The raw JSON-RPC between VS Code and the server, plus what the server prints. Filter it, expand it, copy it for a bug report.'},
  {icon:Stethoscope,title:'Clear errors',copy:'"uvx was not found: install uv, then restart VS Code." Missing programs, wrong packages, crashes and bad keys, explained.'},
  {icon:Copy,title:'Copy between apps',copy:'Move a server from Cursor to Claude Code in one step. Each app’s format and variable syntax is converted for you.'},
  {icon:LifeBuoy,title:'Safe edits',copy:'Comments and other settings in your files are kept, and a backup is made before every change.'},
  {icon:Lock,title:'Secrets masked',copy:'Tokens and keys are hidden everywhere, and you are warned before a secret lands in a project file that git could commit.'},
];
const FAQ=[
  {q:'What is an MCP server?',a:'MCP (Model Context Protocol) is an open standard that lets AI assistants use tools. An MCP server gives an assistant like Claude, Copilot or Cursor a new ability, such as reading files, searching documentation, driving a browser or working with GitHub issues.'},
  {q:'Is Veyra MCP Studio free?',a:'Yes. It is free and MIT licensed, with no account and no telemetry.'},
  {q:'Which apps does it work with?',a:'VS Code, Claude Code, Claude Desktop, Cursor and Windsurf, for all projects and for the open project. GitHub Copilot CLI servers are shown too. MCP Studio edits the same config files these apps use, so nothing is duplicated.'},
  {q:'Is it safe?',a:'Starting a server runs its command on your computer, just like your AI app would, so only add servers you trust. In Restricted Mode (an untrusted folder) MCP Studio does not start any server. It only connects to the servers you start, and never sends your configs anywhere.'},
  {q:'Why does my server fail?',a:'Open it in the Inspector or click Test. MCP Studio shows the reason in plain words, such as a program that is not installed, a package name that does not exist, a missing environment variable or a server that crashed, along with everything the server printed.'},
];

export default function McpStudioPage(){
  const app={
    '@context':'https://schema.org','@type':'SoftwareApplication',name:'Veyra MCP Studio',applicationCategory:'DeveloperApplication',
    operatingSystem:'Windows, macOS, Linux',url:absolute('/mcp-studio'),image:absolute('/mcp-studio-icon.png'),softwareVersion:EXT.version,downloadUrl:EXT.listed?MARKETPLACE:VSIX,
    description:'A free VS Code extension to manage, test and inspect MCP servers for VS Code, Claude, Cursor and Windsurf.',
    offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},publisher:{'@type':'Organization',name:'Veyra',url:absolute('/')},
  };
  const faq={'@context':'https://schema.org','@type':'FAQPage',mainEntity:FAQ.map(item=>({'@type':'Question',name:item.q,acceptedAnswer:{'@type':'Answer',text:item.a}}))};

  return <><Nav/><Breadcrumbs items={[{name:'Extensions',path:'/extensions'},{name:'Veyra MCP Studio',path:'/mcp-studio'}]}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(app)}}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(faq)}}/>
    <main className="page-shell"><div className="content live-page">
      <section className="live-hero">
        <div className="live-hero-glow" aria-hidden="true"/>
        <div className="live-icon"><Image src="/mcp-studio-icon.png" width={148} height={148} alt="Veyra MCP Studio icon" priority/></div>
        <span className="live-kicker"><i/>NEW · VEYRA ORIGINAL · FOR VS CODE</span>
        <h1>Veyra <em>MCP Studio</em></h1>
        <p className="live-tagline">Your MCP servers, all in one place.</p>
        <p className="live-intro">See every MCP server from VS Code, Claude, Cursor and Windsurf in one sidebar. Add popular ones in two clicks, try any tool with a simple form, and find out in plain words why a server does not start. Free, with no account.</p>
        <div className="live-actions">
          {EXT.listed?<a className="primary" href={MARKETPLACE}><Zap size={16}/>Get it for VS Code</a>:<a className="primary" href={VSIX}><Download size={16}/>Download for VS Code</a>}
          <a className="secondary" href="#install"><Zap size={16}/>How to install</a>
        </div>
        <p className="live-micro">{EXT.id} · v{EXT.version} · Free · MIT · Windows, macOS, Linux</p>
      </section>

      <section className="pm-shot"><img src="/mcp-studio-inspector.webp" alt="The Inspector: a form for the search_issues tool and its JSON result after running it in 412 ms" width={1600} height={1060}/></section>

      <section className="content-section">
        <header><span>FEATURES</span><h2>MCP without the JSON headaches.</h2></header>
        <div className="cards">{FEATURES.map(feature=><article className="card" key={feature.title}><feature.icon/><h3>{feature.title}</h3><p>{feature.copy}</p></article>)}</div>
      </section>

      <section className="pm-shot"><img src="/mcp-studio-servers.webp" alt="The MCP Servers sidebar with servers grouped by app, passing in green or failing in red with the reason" width={1600} height={720} loading="lazy"/></section>

      <section className="content-section split reverse">
        <div>
          <span className="kicker">ONE PLACE, EVERY APP</span>
          <h2>It edits the files your apps already use.</h2>
          <ul>
            <li><ShieldCheck/><span><strong>No new config to learn.</strong> MCP Studio reads and writes each app&apos;s own file, so your servers work the same with or without it.</span></li>
            <li><ShieldCheck/><span><strong>Nothing lost.</strong> Comments and other settings are kept, and a backup is made before every change.</span></li>
            <li><ShieldCheck/><span><strong>Always current.</strong> Edit a file by hand or in another app and the sidebar updates straight away.</span></li>
            <li><ShieldCheck/><span><strong>Private.</strong> No account and no telemetry. It only talks to the servers you start.</span></li>
          </ul>
        </div>
        <div className="visual" aria-label="Config files MCP Studio manages">
          <small>Config files</small>
          <b>VS Code</b> <i>mcp.json</i><br/>
          <b>Claude Code</b> <i>~/.claude.json · .mcp.json</i><br/>
          <b>Claude Desktop</b> <i>claude_desktop_config.json</i><br/>
          <b>Cursor</b> <i>~/.cursor/mcp.json</i><br/>
          <b>Windsurf</b> <i>mcp_config.json</i>
        </div>
      </section>

      <section className="pm-shot"><img src="/mcp-studio-add.webp" alt="The Add MCP Server page: a searchable catalog of servers and a form with the apps to add it to and a successful connection test" width={1600} height={1080} loading="lazy"/></section>

      <section className="pm-shot"><img src="/mcp-studio-fix.webp" alt="A failed server: uvx was not found, with the fix and a Try again button" width={1600} height={860} loading="lazy"/></section>

      <section className="content-section split" id="install">
        <div>
          <span className="kicker">INSTALL</span>
          <h2>Ready in a minute.</h2>
          {EXT.listed?<ol className="live-install">
            <li>In VS Code, open <strong>Extensions</strong> (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>) and search for <strong>Veyra MCP Studio</strong>, or open it on the <a href={MARKETPLACE}>Visual Studio Marketplace</a>.</li>
            <li>Click <strong>Install</strong>, then the <strong>MCP Studio</strong> icon in the Activity Bar.</li>
          </ol>:<ol className="live-install">
            <li><a href={VSIX}>Download the <code>.vsix</code></a> (250 KB).</li>
            <li>In VS Code, press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> and run <strong>Extensions: Install from VSIX…</strong>, then choose the file.</li>
            <li>Click the <strong>MCP Studio</strong> icon in the Activity Bar, then <strong>＋</strong> to add your first server.</li>
          </ol>}
          <p className="live-note">Try it: add <strong>Microsoft Learn</strong> from the catalog. It needs no key and no install. {EXT.listed?'':'Coming to the Visual Studio Marketplace soon.'}</p>
        </div>
        <div className="visual" aria-label="Commands">
          <small>Command Palette</small>
          <b>MCP Studio: Add MCP Server…</b><br/>
          <b>MCP Studio: Browse Server Catalog</b><br/>
          <b>MCP Studio: Check All Servers</b><br/>
          <b>MCP Studio: Refresh</b><br/>
          <span style={{color:'#5f6d7a'}}>Right-click a server:</span> <i>Inspect, Test, Copy, Remove</i>
        </div>
      </section>

      <section className="content-section">
        <header><span>FAQ</span><h2>Questions</h2></header>
        <div className="live-faq">{FAQ.map(item=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
        <p className="live-more"><ShieldCheck size={14}/>More for VS Code: <Link href="/api-client">Veyra API Client</Link>, <Link href="/npm-intellisense">Veyra npm IntelliSense</Link>, <Link href="/port-manager">Veyra Port Manager</Link> and <Link href="/live-server">Veyra Live Server</Link>.</p>
      </section>

      <ClosingCTA title="Made by the Veyra team." copy="Veyra Studio is a fast, free code editor with Live Server, Python debugging and Veyra AI built in."/>
    </div></main><Footer/></>;
}
