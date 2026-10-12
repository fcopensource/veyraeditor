import type {Metadata} from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {Code2,Download,FolderTree,Keyboard,LockKeyhole,MousePointerClick,Paintbrush,Radio,RefreshCw,Save,ShieldCheck,Zap} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {ClosingCTA} from '@/components/ContentPage';
import {latestRelease,RELEASES_URL} from '@/lib/releases';
import {absolute,jsonLd} from '@/lib/site';

/** The VS Code edition on the Visual Studio Marketplace. */
const MARKETPLACE='https://marketplace.visualstudio.com/items?itemName=flightcoders.veyra-live-server';
import './live-server.css';

export const metadata:Metadata={
  title:'Veyra Live Server: Live Reload for Veyra and VS Code',
  description:'Veyra Live Server serves your site at 127.0.0.1:5500 and updates the browser on every save, with CSS applied without a reload. In Veyra and VS Code.',
  alternates:{canonical:'/live-server'},
  openGraph:{url:'/live-server',title:'Veyra Live Server',description:'Save. See it. Instantly. Live reload built into Veyra, and free for VS Code.',images:[{url:'/live-server-icon.png',width:512,height:512,alt:'Veyra Live Server icon'}]},
};
export const revalidate=300;

const FEATURES=[
  {icon:RefreshCw,title:'Live reload',copy:'Save an HTML or JavaScript file and every open tab reloads on its own. No refresh key, no browser extension.'},
  {icon:Paintbrush,title:'CSS without a reload',copy:'Save a stylesheet and the new CSS is swapped in place. Scroll position, open menus and typed text stay exactly where they were.'},
  {icon:MousePointerClick,title:'Go Live in one click',copy:'Click Go Live in the status bar, or right-click any HTML file and choose Open with Live Server. The page opens in your browser.'},
  {icon:FolderTree,title:'Folders and media just work',copy:'index.html opens automatically, folders without one show a clean list of their files, and videos and audio stream and seek smoothly.'},
  {icon:LockKeyhole,title:'Private by design',copy:'Listens on 127.0.0.1 only, so other devices on your network can\'t see your work. Nothing outside your folder is ever served.'},
  {icon:Zap,title:'Tiny and native',copy:'Built into Veyra in Rust, with no Node.js and nothing to install. The VS Code edition has zero runtime dependencies and is under 100 KB.'},
];

const COMPARE:[string,string,string][]=[
  ['Install','Nothing: it\'s built in','Search “Veyra Live Server” in Extensions and click Install'],
  ['Start','Go Live in the status bar','Go Live in the status bar'],
  ['Open a page','Right-click an HTML file → Open with Live Server','Right-click an HTML file → Open with Live Server'],
  ['Shortcuts','Alt+L Alt+O to open, Alt+L Alt+C to stop','Alt+L Alt+O to open, Alt+L Alt+C to stop (⌘L ⌘O on macOS)'],
  ['Address','http://127.0.0.1:5500, or the next free port','http://127.0.0.1:5500, or the next free port'],
  ['Needs','Nothing else','VS Code 1.85 or newer'],
];

const FAQ=[
  {q:'Is Veyra Live Server free?',a:'Yes. It\'s built into Veyra Studio, which is free and open source, and the VS Code edition is free and MIT licensed.'},
  {q:'How is it different from the classic Live Server extension?',a:'It works the same way, with the same port and shortcuts, so it feels familiar. It also applies CSS changes without reloading the page, only accepts connections from your own computer, never serves files outside your folder, and has no runtime dependencies.'},
  {q:'Do I need Node.js?',a:'Not in Veyra: the server is part of the app. In VS Code, the extension runs inside VS Code itself, so there\'s nothing else to install either.'},
  {q:'Can I open my site on my phone?',a:'Not yet. Veyra Live Server listens on your own computer only (127.0.0.1) to keep your work private. Sharing on your local network is on the roadmap as an opt-in setting.'},
];

export default async function LiveServerPage(){
  const release=await latestRelease();
  const vsix=release?.assets.find(asset=>/^veyra-live-server-.*\.vsix$/i.test(asset.name));
  const vsixVersion=vsix?.name.match(/-(\d+\.\d+\.\d+)\.vsix$/i)?.[1];
  const vsixUrl=vsix?.browser_download_url||RELEASES_URL;
  const app={
    '@context':'https://schema.org','@type':'SoftwareApplication',name:'Veyra Live Server',applicationCategory:'DeveloperApplication',
    operatingSystem:'Windows, macOS, Linux',url:absolute('/live-server'),image:absolute('/live-server-icon.png'),
    description:'A local development server with live reload for HTML, CSS and JavaScript, built into Veyra Studio and available for VS Code.',
    offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},...(vsixVersion?{softwareVersion:vsixVersion}:{}),
    publisher:{'@type':'Organization',name:'Veyra Studio',url:absolute('/')},
  };
  const faq={'@context':'https://schema.org','@type':'FAQPage',mainEntity:FAQ.map(item=>({'@type':'Question',name:item.q,acceptedAnswer:{'@type':'Answer',text:item.a}}))};

  return <><Nav/><Breadcrumbs items={[{name:'Extensions',path:'/extensions'},{name:'Veyra Live Server',path:'/live-server'}]}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(app)}}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(faq)}}/>
    <main className="page-shell live-page">
      <section className="live-hero">
        <div className="live-hero-glow" aria-hidden="true"/>
        <div className="live-icon"><Image src="/live-server-icon.png" width={148} height={148} alt="Veyra Live Server icon" priority/></div>
        <span className="live-kicker"><i/>VEYRA EDITION · FOR VEYRA AND VS CODE</span>
        <h1>Veyra <em>Live Server</em></h1>
        <p className="live-tagline">Save. See it. Instantly.</p>
        <p className="live-intro">A local development server with live reload. Every save updates your browser, and CSS changes apply without a reload. Built into Veyra Studio, and free for VS Code.</p>
        <div className="live-actions">
          <Link className="primary" href="/download"><Download size={16}/>Get Veyra: it&apos;s built in</Link>
          <a className="secondary" href={MARKETPLACE}><Code2 size={16}/>Get it for VS Code</a>
        </div>
        <p className="live-micro">VS Code edition on the Visual Studio Marketplace · flightcoders.veyra-live-server · Free · MIT</p>
      </section>

      <section className="live-demo" aria-label="How a CSS change looks">
        <div className="live-editor">
          <div className="live-bar"><span/><span/><span/><b>style.css</b></div>
          <pre><span className="k">h1</span> {'{'}{'\n'}  color: <span className="swatch"/><span className="v">#2255dd</span>;{'\n'}{'}'}</pre>
          <div className="live-status"><span><Save size={11}/>Saved</span><span className="on"><Radio size={11}/>Port : 5500</span></div>
        </div>
        <div className="live-arrow" aria-hidden="true"><i/><i/><i/></div>
        <div className="live-browser">
          <div className="live-bar"><span/><span/><span/><b>127.0.0.1:5500</b></div>
          <div className="live-page-preview"><small>VEYRA LIVE SERVER</small><h2>Hello from Live Server</h2><p>Typed text stays: the page never reloaded</p></div>
        </div>
      </section>

      <section className="content-section">
        <header><span>HOW IT WORKS</span><h2>Three steps. Zero setup.</h2></header>
        <ol className="live-steps">
          <li><b>1</b><h3>Open your project</h3><p>Any folder with HTML, CSS and JavaScript: a landing page, a portfolio, a course exercise.</p></li>
          <li><b>2</b><h3>Click Go Live</h3><p>In the status bar, or right-click an HTML file. Your browser opens the page at 127.0.0.1:5500.</p></li>
          <li><b>3</b><h3>Edit and save</h3><p>HTML and JavaScript reload the page; CSS updates in place. Click the port in the status bar to stop.</p></li>
        </ol>
      </section>

      <section className="content-section">
        <header><span>FEATURES</span><h2>Everything you expect from Live Server. Then a little more.</h2></header>
        <div className="cards">{FEATURES.map(feature=><article className="card" key={feature.title}><feature.icon/><h3>{feature.title}</h3><p>{feature.copy}</p></article>)}</div>
      </section>

      <section className="content-section">
        <header><span>ONE SERVER, TWO EDITORS</span><h2>The same Live Server in Veyra and VS Code.</h2><p>Both editions share the same live reload script and follow the same rules, so your project behaves identically wherever you open it.</p></header>
        <div className="live-table" role="table" aria-label="Veyra and VS Code editions">
          <div role="row" className="head"><span role="columnheader"/><span role="columnheader"><Image src="/veyra.png" width={18} height={18} alt=""/>In Veyra Studio</span><span role="columnheader"><Code2 size={16}/>In VS Code</span></div>
          {COMPARE.map(([label,veyra,vscode])=><div role="row" key={label}><span role="rowheader">{label}</span><span role="cell">{veyra}</span><span role="cell">{vscode}</span></div>)}
        </div>
      </section>

      <section className="content-section split">
        <div>
          <span className="kicker">VS CODE EDITION</span>
          <h2>Install in VS Code</h2>
          <ol className="live-install">
            <li>In VS Code, open <strong>Extensions</strong> (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>) and search for <strong>Veyra Live Server</strong>, or open it on the <a href={MARKETPLACE}>Visual Studio Marketplace</a>.</li>
            <li>Click <strong>Install</strong>.</li>
            <li>Click <strong>Go Live</strong> in the status bar. Click the port to open, copy, restart or stop.</li>
          </ol>
          <p className="live-note">Or from a terminal: <code>code --install-extension flightcoders.veyra-live-server</code>. Working offline? <a href={vsixUrl}>Download the <code>.vsix</code></a> and choose <strong>Install from VSIX…</strong>.</p>
        </div>
        <div className="visual" aria-label="VS Code settings">
          <small>settings.json · optional</small>
          {'{'}<br/>
          &nbsp;&nbsp;<b>&quot;veyraLiveServer.port&quot;</b>: <i>5500</i>,<br/>
          &nbsp;&nbsp;<b>&quot;veyraLiveServer.root&quot;</b>: <em>&quot;/public&quot;</em>,<br/>
          &nbsp;&nbsp;<b>&quot;veyraLiveServer.openBrowser&quot;</b>: <i>true</i><br/>
          {'}'}
        </div>
      </section>

      <section className="content-section split reverse">
        <div>
          <span className="kicker">SECURITY</span>
          <h2>Private by default.</h2>
          <ul>
            <li><ShieldCheck/><span>Accepts connections from <strong>your computer only</strong> (127.0.0.1), never from your Wi-Fi or office network.</span></li>
            <li><ShieldCheck/><span>Serves <strong>only the open folder</strong>. Tricks like <code>../</code>, encoded slashes and symbolic links that point outside are refused.</span></li>
            <li><ShieldCheck/><span>No telemetry, no accounts, no runtime dependencies to keep patched.</span></li>
          </ul>
        </div>
        <div className="visual" aria-label="Requests outside the folder are refused">
          <small>Requests</small>
          GET /index.html <b>200 OK</b><br/>
          GET /css/style.css <b>200 OK</b><br/>
          GET /../.ssh/id_rsa <em>404 Not Found</em><br/>
          GET /..%2f.env <em>404 Not Found</em><br/>
          <i>192.168.1.20</i> → port 5500 <em>refused</em>
        </div>
      </section>

      <section className="content-section">
        <header><span>FAQ</span><h2>Questions</h2></header>
        <div className="live-faq">{FAQ.map(item=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
        <p className="live-more"><Keyboard size={14}/>Step-by-step guide in the <Link href="/docs#live-server">documentation</Link>.</p>
      </section>

      <ClosingCTA title="Go live with Veyra." copy="Veyra Live Server is built into Veyra Studio: free and open source for Windows, macOS and Linux."/>
    </main><Footer/></>;
}
