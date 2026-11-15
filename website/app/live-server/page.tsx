import type {Metadata} from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {ArrowDownUp,Code2,Download,FolderTree,Keyboard,LockKeyhole,MonitorSmartphone,MousePointerClick,Paintbrush,Radio,RefreshCw,Route,Save,ShieldCheck,TerminalSquare,Zap} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {ClosingCTA} from '@/components/ContentPage';
import {absolute,jsonLd} from '@/lib/site';
import {Installs} from '@/components/Installs';

/** The VS Code edition on the Visual Studio Marketplace. */
const MARKETPLACE='https://marketplace.visualstudio.com/items?itemName=flightcoders.veyra-live-server';
/** The current VS Code edition, hosted on this site (public/downloads/vscode). */
const VERSION='1.4.0';
const VSIX_URL=`/downloads/vscode/veyra-live-server-${VERSION}.vsix`;
const WHATS_NEW:[string,string][]=[
  ['Test on your phone','Share on Your Network serves the page to phones and tablets on the same Wi-Fi, and shows the address to open. Off until you turn it on.'],
  ['Browser console in VS Code','console.log, warnings, errors and unhandled promise rejections appear in the Browser Console output, with an error count in the status bar.'],
  ['Keeps your place','After a live reload the page comes back at the same scroll position.'],
  ['API proxy','Forward /api (or any path) to your backend, any method, with request bodies streamed. No CORS setup.'],
  ['Single-page apps','Routes like /about get your index.html, for React Router, Vue Router and friends.'],
  ['Smarter reloads','Only changes inside the served folder reload the page, and veyraLiveServer.ignore skips more, like **/*.log.'],
];
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
  {icon:MonitorSmartphone,title:'Test on your phone',copy:'Turn on Share on Your Network and open the page on any phone or tablet on the same Wi-Fi. It reloads with every save. In VS Code.'},
  {icon:TerminalSquare,title:'The browser console in your editor',copy:'console.log, warnings, errors and failed promises from the page appear in VS Code, with an error count in the status bar. In VS Code.'},
  {icon:ArrowDownUp,title:'Keeps your place',copy:'After a reload the page comes back at the same scroll position, so you stay where you were working.'},
  {icon:Route,title:'API proxy and single-page apps',copy:'Send /api to your backend without CORS headaches, and serve index.html for React or Vue routes. In VS Code.'},
  {icon:LockKeyhole,title:'Private by design',copy:'Listens on 127.0.0.1 only unless you choose to share it on your network. Nothing outside your folder is ever served.'},
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
  {q:'Can I open my site on my phone?',a:'Yes, in VS Code since 1.4. Click the port in the status bar, choose Share on Your Network, and open the address it shows on your phone (same Wi-Fi). It\'s off by default, so your work stays on your computer until you turn it on.'},
  {q:'Can I see my page\'s console errors without opening DevTools?',a:'Yes, in VS Code since 1.4. Messages and errors from the page appear in the Veyra Live Server: Browser Console output, and the status bar shows how many errors there were. Turn it off with veyraLiveServer.browserConsole.'},
];

export default async function LiveServerPage(){
  const app={
    '@context':'https://schema.org','@type':'SoftwareApplication',name:'Veyra Live Server',applicationCategory:'DeveloperApplication',
    operatingSystem:'Windows, macOS, Linux',url:absolute('/live-server'),image:absolute('/live-server-icon.png'),
    description:'A local development server with live reload for HTML, CSS and JavaScript, built into Veyra Studio and available for VS Code.',
    offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},softwareVersion:VERSION,
    publisher:{'@type':'Organization',name:'Veyra Studio',url:absolute('/')},
  };
  const faq={'@context':'https://schema.org','@type':'FAQPage',mainEntity:FAQ.map(item=>({'@type':'Question',name:item.q,acceptedAnswer:{'@type':'Answer',text:item.a}}))};

  return <><Nav/><Breadcrumbs items={[{name:'Extensions',path:'/extensions'},{name:'Veyra Live Server',path:'/live-server'}]}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(app)}}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(faq)}}/>
    <main className="page-shell"><div className="content live-page">
      <section className="live-hero">
        <div className="live-hero-glow" aria-hidden="true"/>
        <div className="live-icon"><Image src="/live-server-icon-296.png" width={148} height={148} alt="Veyra Live Server icon" priority/></div>
        <a className="live-new" href="#whats-new"><b>New</b>Version {VERSION}: test on your phone, browser console, API proxy</a>
        <span className="live-kicker"><i/>VEYRA EDITION · FOR VEYRA AND VS CODE</span>
        <h1>Veyra <em>Live Server</em></h1>
        <p className="live-tagline">Save. See it. Instantly.</p>
        <p className="live-intro">A local development server with live reload. Every save updates your browser, and CSS changes apply without a reload. Built into Veyra Studio, and free for VS Code.</p>
        <div className="live-actions">
          <Link className="primary" href="/download"><Download size={16}/>Get Veyra: it&apos;s built in</Link>
          <a className="secondary" href={MARKETPLACE}><Code2 size={16}/>Get it for VS Code</a>
        </div>
        <p className="live-micro"><Installs id="flightcoders.veyra-live-server"/>VS Code edition on the Visual Studio Marketplace · flightcoders.veyra-live-server · Free · MIT</p>
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

      <section className="content-section" id="whats-new">
        <header><span>NEW IN {VERSION}</span><h2>What&apos;s new in Live Server {VERSION}</h2><p>The VS Code edition. Update from the Extensions view, or <a href={VSIX_URL} download>download the .vsix</a>.</p></header>
        <ul className="live-new-list">{WHATS_NEW.map(([title,copy])=><li key={title}><strong>{title}</strong><span>{copy}</span></li>)}</ul>
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
          <div role="row" className="head"><span role="columnheader"/><span role="columnheader"><Image src="/veyra-96.png" width={18} height={18} alt=""/>In Veyra Studio</span><span role="columnheader"><Code2 size={16}/>In VS Code</span></div>
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
          <p className="live-note">Or from a terminal: <code>code --install-extension flightcoders.veyra-live-server</code>. Working offline? <a href={VSIX_URL} download>Download the <code>.vsix</code> ({VERSION})</a>, then in Extensions click <strong>…</strong> → <strong>Install from VSIX…</strong>.</p>
        </div>
        <div className="visual" aria-label="VS Code settings">
          <small>settings.json · optional</small>
          {'{'}<br/>
          &nbsp;&nbsp;<b>&quot;veyraLiveServer.port&quot;</b>: <i>5500</i>,<br/>
          &nbsp;&nbsp;<b>&quot;veyraLiveServer.root&quot;</b>: <em>&quot;/public&quot;</em>,<br/>
          &nbsp;&nbsp;<b>&quot;veyraLiveServer.openBrowser&quot;</b>: <i>true</i>,<br/>
          &nbsp;&nbsp;<b>&quot;veyraLiveServer.spa&quot;</b>: <i>true</i>,<br/>
          &nbsp;&nbsp;<b>&quot;veyraLiveServer.proxy&quot;</b>: {'{'} <b>&quot;/api&quot;</b>: <em>&quot;http://localhost:3000&quot;</em> {'}'}<br/>
          {'}'}
        </div>
      </section>

      <section className="content-section split reverse">
        <div>
          <span className="kicker">SECURITY</span>
          <h2>Private by default.</h2>
          <ul>
            <li><ShieldCheck/><span>Accepts connections from <strong>your computer only</strong> (127.0.0.1). Phones on your Wi-Fi can connect only after you turn on <strong>Share on Your Network</strong>, which asks first.</span></li>
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
    </div></main><Footer/></>;
}
