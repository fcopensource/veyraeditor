import type {Metadata} from 'next';
import {Bell,Download,FolderOpen,Gauge,Globe,Layers,Lock,MousePointerClick,ShieldCheck} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {ClosingCTA} from '@/components/ContentPage';
import {absolute,jsonLd} from '@/lib/site';
import '../live-server/live-server.css';

/* Veyra for JetBrains IDEs. Until each plugin is approved on JetBrains Marketplace, its .zip is downloaded from here
   (public/downloads/jetbrains/) and installed with "Install Plugin from Disk…". */

const PLUGIN = {name:'Port Manager Veyra',version:'1.0.0',file:'/downloads/jetbrains/port-manager-veyra-1.0.0.zip',size:'120 KB',source:'https://github.com/fcopensource/jetbrains-plugins/tree/main/port-manager-veyra'};

export const metadata:Metadata={
  title:'Port Manager Veyra for JetBrains IDEs: Free a Busy Port',
  description:'A free plugin for IntelliJ IDEA, WebStorm, PyCharm, GoLand, Rider, Android Studio and every JetBrains IDE: see every port in use, the program behind it and its project, and stop it in one click.',
  keywords:['jetbrains port plugin','intellij kill port','port already in use intellij','webstorm port','pycharm port in use','free a port'],
  alternates:{canonical:'/jetbrains'},
  openGraph:{url:'/jetbrains',title:'Port Manager Veyra for JetBrains IDEs',description:'See every port in use and stop it in one click. Free.',images:[{url:'/port-manager-hero.png',alt:'Port Manager Veyra'}]},
};

const FEATURES=[
  {icon:Layers,title:'Every port, grouped',copy:'A Ports tool window with This Project, Apps & Dev Servers, Editors & Tools and System, so you see what matters first.'},
  {icon:Gauge,title:'Knows your servers',copy:'Recognises 40+ dev servers and tools: Vite, Next.js, Django, Spring Boot, Rails, PostgreSQL, Docker and more.'},
  {icon:MousePointerClick,title:'Stop it in one click',copy:'Open in Browser, Copy Address, Stop and Reveal Folder. Free a Port… stops whatever holds a port.'},
  {icon:Bell,title:'Tells you when it starts',copy:'A notification when your project’s server starts, with Open in Browser and Stop, and a ports counter in the status bar.'},
  {icon:Lock,title:'Safe by design',copy:'System services, other users’ programs and JetBrains IDEs are protected and can never be stopped.'},
  {icon:ShieldCheck,title:'Private and light',copy:'Uses your system’s own tools (netstat, lsof, ss). Nothing is sent anywhere.'},
];
const IDES='IntelliJ IDEA, WebStorm, PyCharm, GoLand, PhpStorm, Rider, CLion, RubyMine, RustRover, DataGrip and Android Studio';

export default function JetBrainsPage(){
  const app={
    '@context':'https://schema.org','@type':'SoftwareApplication',name:PLUGIN.name,applicationCategory:'DeveloperApplication',
    operatingSystem:'Windows, macOS, Linux',url:absolute('/jetbrains'),image:absolute('/port-manager-jetbrains.svg'),softwareVersion:PLUGIN.version,
    downloadUrl:absolute(PLUGIN.file),description:'A free JetBrains IDE plugin that shows every port in use and stops it in one click.',
    offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},publisher:{'@type':'Organization',name:'Veyra',url:absolute('/')},
  };
  return <><Nav/><Breadcrumbs items={[{name:'Extensions',path:'/extensions'},{name:'For JetBrains IDEs',path:'/jetbrains'}]}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(app)}}/>
    <main className="page-shell"><div className="content live-page">
      <section className="live-hero">
        <div className="live-hero-glow" aria-hidden="true"/>
        {/* eslint-disable-next-line @next/next/no-img-element -- the plugin's own SVG icon */}
        <div className="live-icon"><img src="/port-manager-jetbrains.svg" width={148} height={148} alt="Port Manager Veyra icon"/></div>
        <span className="live-kicker"><i/>NEW · FOR JETBRAINS IDES</span>
        <h1>Port Manager <em>Veyra</em></h1>
        <p className="live-tagline">Port 3000 is already in use? Not anymore.</p>
        <p className="live-intro">See every port in use, the program behind it and the project it belongs to, and stop it in one click. For {IDES}, version 2024.3 or newer.</p>
        <div className="live-actions">
          <a className="primary" href={PLUGIN.file} download><Download size={16}/>Download the plugin (.zip)</a>
          <a className="secondary" href="#install"><FolderOpen size={16}/>How to install</a>
        </div>
        <p className="live-micro">Version {PLUGIN.version} · {PLUGIN.size} · Free · MIT · Windows, macOS, Linux · <a href={PLUGIN.source}>Source code</a></p>
      </section>

      <section className="content-section">
        <header><span>FEATURES</span><h2>Every port. One click.</h2></header>
        <div className="cards">{FEATURES.map(f=><article className="card" key={f.title}><f.icon/><h3>{f.title}</h3><p>{f.copy}</p></article>)}</div>
      </section>

      <section className="content-section split" id="install">
        <div>
          <span className="kicker">INSTALL</span>
          <h2>Ready in a minute.</h2>
          <ol className="live-install">
            <li><a href={PLUGIN.file} download>Download the <code>.zip</code></a> ({PLUGIN.size}). <strong>Don’t unzip it.</strong></li>
            <li>In your JetBrains IDE open <strong>Settings</strong> (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>S</kbd>, on macOS <kbd>⌘</kbd>+<kbd>,</kbd>) → <strong>Plugins</strong>.</li>
            <li>Click the <strong>⚙</strong> gear → <strong>Install Plugin from Disk…</strong>, choose the <code>.zip</code> and click <strong>OK</strong>. Restart if asked.</li>
            <li>Open <strong>View → Tool Windows → Ports</strong>, or click <strong>“N ports”</strong> in the status bar.</li>
          </ol>
          <p className="live-note">Coming to JetBrains Marketplace soon, so it can be installed and updated from <strong>Settings → Plugins</strong>.</p>
        </div>
        <div className="visual" aria-label="Where to find it">
          <small>In the IDE</small>
          <b>View → Tool Windows → Ports</b><br/>
          <b>Tools → Show Ports in Use</b><br/>
          <b>Tools → Free a Port…</b><br/>
          <b>Status bar</b> <i>“N ports”</i>
        </div>
      </section>

      <section className="content-section">
        <header><span>ALSO FOR VS CODE</span><h2>Using VS Code too?</h2></header>
        <p className="live-note"><Globe size={14}/> The same idea for VS Code, Cursor and VSCodium: <a href="/port-manager">Veyra Port Manager for VS Code</a>.</p>
      </section>

      <ClosingCTA title="Made by the Veyra team." copy="Veyra Studio is a fast, free code editor with Live Server, Python debugging and Search Everywhere built in."/>
    </div></main><Footer/></>;
}
