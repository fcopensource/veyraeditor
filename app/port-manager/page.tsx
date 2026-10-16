import type {Metadata} from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {Bell,Code2,Download,Eraser,Gauge,Globe,Layers,ShieldCheck,Sparkles,Star} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {ClosingCTA} from '@/components/ContentPage';
import {latestRelease,RELEASES_URL} from '@/lib/releases';
import {absolute,jsonLd} from '@/lib/site';
import '../live-server/live-server.css';
import './port-manager.css';

/** The extension on the Visual Studio Marketplace. */
const MARKETPLACE='https://marketplace.visualstudio.com/items?itemName=flightcoders.veyra-port-manager';

export const metadata:Metadata={
  title:'Veyra Port Manager: Free a Busy Port in VS Code',
  description:'“Port 3000 is already in use”? Veyra Port Manager shows every port in use and the app behind it, and frees it in one click. Free for VS Code.',
  alternates:{canonical:'/port-manager'},
  openGraph:{url:'/port-manager',title:'Veyra Port Manager',description:'Every port in use. One click to free it.',images:[{url:'/port-manager-icon.png',width:512,height:512,alt:'Veyra Port Manager icon'}]},
};
export const revalidate=300;

const FEATURES=[
  {icon:Layers,title:'Every port, explained',copy:'Port 3000, 5173, 8080 and the rest, each with the program behind it, its command line and the folder it runs from.'},
  {icon:Sparkles,title:'Knows your stack',copy:'Vite, Next.js, Nuxt, Astro, Angular, Django, Flask, FastAPI, Rails, Laravel, Spring Boot, Postgres, MySQL, Redis, Docker and more, by name.'},
  {icon:Star,title:'Your workspace first',copy:'Servers started from the open folder are grouped at the top, ahead of everything else on your computer.'},
  {icon:Eraser,title:'Free a port in seconds',copy:'Run Free a Port…, type 3000, see what holds it and stop it. No terminal, no netstat, no hunting for the right kill command.'},
  {icon:Bell,title:'Ready when your server is',copy:'When a web dev server starts in your workspace, Port Manager offers to open it in your browser.'},
  {icon:Gauge,title:'Light as air',copy:'Instant refreshes while the view is open, a check every 20 seconds otherwise, nothing while VS Code is in the background.'},
];
const STACK=['Vite','Next.js','Nuxt','Astro','SvelteKit','Angular','React','Remix','Django','Flask','FastAPI','Rails','Laravel','Spring Boot','.NET','PostgreSQL','MySQL','MongoDB','Redis','Docker','Node.js','Python','Deno','Bun'];
const FAQ=[
  {q:'Is Veyra Port Manager free?',a:'Yes. It is free and MIT licensed, with no account, no telemetry and no runtime dependencies.'},
  {q:'Can it stop something important by mistake?',a:'No. System services, other users’ programs and code editors (VS Code, Cursor, Windsurf, Veyra Studio) are never offered for stopping. Stopping always asks first, and Port Manager checks the program still holds that port before it acts, so a reused process ID can never stop the wrong program.'},
  {q:'Does it need administrator rights?',a:'No. It sees and stops only your own programs, using what Windows, macOS and Linux already report.'},
  {q:'Does it work with Remote SSH, WSL or Codespaces?',a:'Yes. It lists the ports on the machine you are connected to, and opens them in your local browser through VS Code’s port forwarding.'},
];

export default async function PortManagerPage(){
  const release=await latestRelease();
  const vsix=release?.assets.find(asset=>/^veyra-port-manager-.*\.vsix$/i.test(asset.name));
  const vsixUrl=vsix?.browser_download_url||RELEASES_URL;
  const version=vsix?.name.match(/-(\d+\.\d+\.\d+)\.vsix$/i)?.[1];
  const app={
    '@context':'https://schema.org','@type':'SoftwareApplication',name:'Veyra Port Manager',applicationCategory:'DeveloperApplication',
    operatingSystem:'Windows, macOS, Linux',url:absolute('/port-manager'),image:absolute('/port-manager-icon.png'),
    description:'A VS Code extension that shows every port in use and the program behind it, and frees a busy port in one click.',
    offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},...(version?{softwareVersion:version}:{}),
    publisher:{'@type':'Organization',name:'Veyra Studio',url:absolute('/')},
  };
  const faq={'@context':'https://schema.org','@type':'FAQPage',mainEntity:FAQ.map(item=>({'@type':'Question',name:item.q,acceptedAnswer:{'@type':'Answer',text:item.a}}))};

  return <><Nav/><Breadcrumbs items={[{name:'Extensions',path:'/extensions'},{name:'Veyra Port Manager',path:'/port-manager'}]}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(app)}}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(faq)}}/>
    <main className="page-shell"><div className="content live-page">
      <section className="live-hero">
        <div className="live-hero-glow" aria-hidden="true"/>
        <div className="live-icon"><Image src="/port-manager-icon.png" width={148} height={148} alt="Veyra Port Manager icon" priority/></div>
        <span className="live-kicker"><i/>VEYRA ORIGINAL · FOR VS CODE</span>
        <h1>Veyra <em>Port Manager</em></h1>
        <p className="live-tagline">Every port in use. One click to free it.</p>
        <p className="live-intro">See every port your programs use and the app behind it. Open it, copy its address, or stop it, safely, without leaving VS Code.</p>
        <div className="live-actions">
          <a className="primary" href={MARKETPLACE}><Code2 size={16}/>Get it for VS Code</a>
          <a className="secondary" href={vsixUrl}><Download size={16}/>Download the .vsix</a>
        </div>
        <p className="live-micro">flightcoders.veyra-port-manager{version?` · v${version}`:''} · Free · MIT · Windows, macOS, Linux</p>
      </section>

      <section className="pm-problem" aria-label="The problem it solves">
        <div className="pm-terminal">
          <div className="live-bar"><span/><span/><span/><b>Terminal</b></div>
          <pre><span className="pm-dim">$</span> npm run dev{'\n'}<span className="pm-err">Error: listen EADDRINUSE: address already in use :::3000</span>{'\n'}<span className="pm-dim">    at Server.setupListenHandle [as _listen2]</span></pre>
        </div>
        <div className="pm-arrow" aria-hidden="true"><i/><i/><i/></div>
        <div className="pm-fix">
          <small>VEYRA PORTS: FREE A PORT</small>
          <div className="pm-fix-row"><b>3000</b><span>Next.js · <code>node</code> · PID 18244</span></div>
          <div className="pm-fix-actions"><span className="pm-stop">Stop</span><span className="pm-ok">✓ Port 3000 is free</span></div>
        </div>
      </section>

      <section className="pm-shot">
        <img src="/port-manager-hero.webp" alt="The Ports in Use view in VS Code: Next.js on 3000 and Vite on 5173 in This Workspace, Django on 8000 and PostgreSQL on 5432 in Apps and Dev Servers" width={1920} height={960} loading="lazy"/>
      </section>

      <section className="content-section">
        <header><span>FEATURES</span><h2>Port problems, solved for good.</h2></header>
        <div className="cards">{FEATURES.map(feature=><article className="card" key={feature.title}><feature.icon/><h3>{feature.title}</h3><p>{feature.copy}</p></article>)}</div>
      </section>

      <section className="content-section">
        <header><span>RECOGNISED</span><h2>It knows what’s running.</h2><p>Port Manager reads each program’s command line and names what it is, so you never have to guess which <code>node</code> is which.</p></header>
        <div className="pm-stack">{STACK.map(name=><span key={name}>{name}</span>)}</div>
      </section>

      <section className="content-section split reverse">
        <div>
          <span className="kicker">SAFE BY DESIGN</span>
          <h2>Powerful, never dangerous.</h2>
          <ul>
            <li><ShieldCheck/><span><strong>Protected programs.</strong> System services, other users’ programs and your code editor are never offered for stopping.</span></li>
            <li><ShieldCheck/><span><strong>Always asks.</strong> Every stop is confirmed, with the program’s full command line shown first.</span></li>
            <li><ShieldCheck/><span><strong>Checks before acting.</strong> A fresh look confirms the program still holds the port, so a reused process ID can never stop the wrong program.</span></li>
            <li><ShieldCheck/><span><strong>No admin rights, no telemetry.</strong> It reads only what your system already reports.</span></li>
          </ul>
        </div>
        <div className="visual" aria-label="Protected and stoppable ports">
          <small>Ports in Use</small>
          <b>3000</b> Next.js · node <i>Stop</i><br/>
          <b>5173</b> Vite · node <i>Stop</i><br/>
          <b>5432</b> PostgreSQL · postgres <i>Stop</i><br/>
          <span style={{color:'#5f6d7a'}}>12824 VS Code · Code.exe</span> <em>protected</em><br/>
          <span style={{color:'#5f6d7a'}}>445 System · svchost.exe</span> <em>protected</em>
        </div>
      </section>

      <section className="content-section split">
        <div>
          <span className="kicker">INSTALL</span>
          <h2>Ready in ten seconds.</h2>
          <ol className="live-install">
            <li>In VS Code, open <strong>Extensions</strong> (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>) and search for <strong>Veyra Port Manager</strong>, or open it on the <a href={MARKETPLACE}>Visual Studio Marketplace</a>.</li>
            <li>Click <strong>Install</strong>.</li>
            <li>Click the <strong>Veyra Ports</strong> icon in the Activity Bar.</li>
          </ol>
          <p className="live-note">Or from a terminal: <code>code --install-extension flightcoders.veyra-port-manager</code>. Working offline? <a href={vsixUrl}>Download the <code>.vsix</code></a> and choose <strong>Install from VSIX…</strong>.</p>
        </div>
        <div className="visual" aria-label="Commands">
          <small>Command Palette</small>
          <b>Veyra Ports: Free a Port…</b> <i>Alt+P Alt+F</i><br/>
          <b>Veyra Ports: Show Ports in Use</b><br/>
          <b>Veyra Ports: Refresh</b><br/>
          <b>Veyra Ports: Show or Hide System Ports</b>
        </div>
      </section>

      <section className="content-section">
        <header><span>FAQ</span><h2>Questions</h2></header>
        <div className="live-faq">{FAQ.map(item=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
        <p className="live-more"><Globe size={14}/>More from Veyra: <Link href="/live-server">Veyra Live Server</Link> and <Link href="/extensions">all extensions</Link>.</p>
      </section>

      <ClosingCTA title="Made by the Veyra team." copy="Veyra Studio is a fast, free code editor with Live Server, Python debugging and Veyra AI built in."/>
    </div></main><Footer/></>;
}
