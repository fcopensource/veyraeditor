import type {Metadata} from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {Activity,Boxes,Download,FileCheck2,Hammer,Layers,MessageSquareWarning,ScrollText,ShieldCheck,Sparkles,Terminal,Trash2,Zap} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {ClosingCTA} from '@/components/ContentPage';
import {absolute,jsonLd,marketplaceUrl,VSCODE_EXTENSIONS,vsixUrl} from '@/lib/site';
import '../live-server/live-server.css';
import '../port-manager/port-manager.css';

const EXT=VSCODE_EXTENSIONS.docker;
const MARKETPLACE=marketplaceUrl(EXT.id), VSIX=vsixUrl(EXT);

export const metadata:Metadata={
  title:'Docker for VS Code: Containers, Compose and Logs',
  description:'A free Docker extension for VS Code. Manage containers, images and Docker Compose, stream live logs, open a shell, watch CPU and memory, clean up disk space and check Dockerfiles.',
  keywords:['Docker','Docker VS Code','Docker extension','VS Code Docker extension','Docker Compose','Docker Desktop','Dockerfile','Docker logs','container manager','Docker GUI'],
  alternates:{canonical:'/docker'},
  openGraph:{url:'/docker',title:'Veyra Container Studio for Docker',description:'Docker in VS Code, made easy. Free.',images:[{url:'/docker-hero.webp',width:1920,height:960,alt:'Veyra Container Studio: the Docker Dashboard in VS Code'}]},
};

const FEATURES=[
  {icon:Boxes,title:'One sidebar',copy:'Containers, images, volumes and networks, with Compose projects grouped and running containers first. It updates by itself as Docker changes.'},
  {icon:ScrollText,title:'Live logs',copy:'For one container or a whole Compose project, with service colours, filtering, timestamps and a Problems only switch. Copy or save them.'},
  {icon:Terminal,title:'Shell and ports',copy:'Open a shell inside any running container in one click, or open its published port straight in your browser.'},
  {icon:Activity,title:'Live CPU and memory',copy:'The Dashboard shows what every running container uses, updated every few seconds, with busy ones in orange.'},
  {icon:Trash2,title:'Disk cleanup',copy:'See how much space images, containers and build cache take, and free it in one click. Named volumes are always kept.'},
  {icon:Layers,title:'Compose in your file',copy:'Compose Up, Rebuild, Down and Logs above every compose.yaml, and an Up button above each service.'},
  {icon:Hammer,title:'Build and Run',copy:'Above every Dockerfile. Ports from EXPOSE are published for you, so EXPOSE 3000 opens on localhost:3000.'},
  {icon:FileCheck2,title:'Dockerfile checks',copy:'Catches unpinned latest tags, apt-get without -y, secrets in ENV, ADD instead of COPY, running as root and more, with quick fixes.'},
  {icon:MessageSquareWarning,title:'Errors in plain words',copy:'"Port 8080 is already in use." "Docker is not running", with a button that starts Docker Desktop.'},
];
const FAQ=[
  {q:'Is Veyra Container Studio free?',a:'Yes. It is free and MIT licensed, with no account and no telemetry.'},
  {q:'What do I need?',a:'VS Code 1.85 or newer and Docker: Docker Desktop on Windows and macOS, or Docker Engine on Linux, with Docker Compose v2. Container Studio uses the docker command on your computer, so your current Docker context works too, including remote ones.'},
  {q:'How is it different from other Docker extensions?',a:'It puts the things you check every day in one place: live logs you can filter, CPU and memory per container, disk cleanup that shows what you will free, one-click Compose and Build buttons in your files, Dockerfile checks with fixes, and errors explained in plain words.'},
  {q:'Can cleanup delete my data?',a:'Cleanup asks before every step and says what is kept. Volume cleanup only deletes unused anonymous volumes; named volumes, which usually hold databases, are never deleted by it.'},
  {q:'Is it safe to open someone else’s project?',a:'In Restricted Mode (an untrusted folder) you can still manage your containers, but building images and starting Compose projects from that folder is turned off, because they run code from it.'},
];

export default function DockerPage(){
  const app={
    '@context':'https://schema.org','@type':'SoftwareApplication',name:'Veyra Container Studio for Docker',applicationCategory:'DeveloperApplication',
    operatingSystem:'Windows, macOS, Linux',url:absolute('/docker'),image:absolute('/docker-icon.png'),softwareVersion:EXT.version,downloadUrl:EXT.listed?MARKETPLACE:VSIX,
    description:'A free Docker extension for VS Code: containers, images, volumes and Docker Compose, live logs, CPU and memory, disk cleanup and Dockerfile checks.',
    offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},publisher:{'@type':'Organization',name:'Veyra',url:absolute('/')},
  };
  const faq={'@context':'https://schema.org','@type':'FAQPage',mainEntity:FAQ.map(item=>({'@type':'Question',name:item.q,acceptedAnswer:{'@type':'Answer',text:item.a}}))};

  return <><Nav/><Breadcrumbs items={[{name:'Extensions',path:'/extensions'},{name:'Veyra Container Studio for Docker',path:'/docker'}]}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(app)}}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(faq)}}/>
    <main className="page-shell"><div className="content live-page">
      <section className="live-hero">
        <div className="live-hero-glow" aria-hidden="true"/>
        <div className="live-icon"><Image src="/docker-icon.png" width={148} height={148} alt="Veyra Container Studio icon" priority/></div>
        <span className="live-kicker"><i/>NEW · VEYRA ORIGINAL · FOR VS CODE</span>
        <h1>Veyra <em>Container Studio</em></h1>
        <p className="live-tagline">Docker in VS Code, made easy.</p>
        <p className="live-intro">See and control your containers, images, volumes and Docker Compose projects without leaving your editor. Live logs, a shell, CPU and memory, one-click cleanup, and Build and Compose Up buttons right in your files. Free, with no account.</p>
        <div className="live-actions">
          {EXT.listed?<a className="primary" href={MARKETPLACE}><Zap size={16}/>Get it for VS Code</a>:<a className="primary" href={VSIX}><Download size={16}/>Download for VS Code</a>}
          <a className="secondary" href="#install"><Zap size={16}/>How to install</a>
        </div>
        <p className="live-micro">{EXT.id} · v{EXT.version} · Free · MIT · Windows, macOS, Linux</p>
      </section>

      <section className="pm-shot"><img src="/docker-dashboard.webp" alt="The Docker Dashboard: running containers with live CPU and memory bars, disk use, and a cleanup section that can free about 3 GB" width={1600} height={1180}/></section>

      <section className="content-section">
        <header><span>FEATURES</span><h2>The Docker things you do every day. In your editor.</h2></header>
        <div className="cards">{FEATURES.map(feature=><article className="card" key={feature.title}><feature.icon/><h3>{feature.title}</h3><p>{feature.copy}</p></article>)}</div>
      </section>

      <section className="pm-shot"><img src="/docker-sidebar.webp" alt="The Containers view with a Compose project and its services with ports, a crashed container in red, and images with sizes" width={1600} height={900} loading="lazy"/></section>

      <section className="pm-shot"><img src="/docker-logs.webp" alt="Live logs for a Compose project with coloured service names, timestamps and an error highlighted" width={1600} height={1000} loading="lazy"/></section>

      <section className="content-section split reverse">
        <div>
          <span className="kicker">START YOUR APP IN ONE CLICK</span>
          <h2>Build, run and fix, right in your files.</h2>
          <ul>
            <li><ShieldCheck/><span><strong>Compose Up above compose.yaml</strong>, plus Up for each service. Output shows in VS Code&apos;s terminal, and the logs are one click away.</span></li>
            <li><ShieldCheck/><span><strong>Build and Run above a Dockerfile</strong>, with the ports from EXPOSE published for you.</span></li>
            <li><ShieldCheck/><span><strong>Checks as you type</strong> explain what to change and why, with quick fixes for the common ones.</span></li>
            <li><ShieldCheck/><span><strong>Safe by default.</strong> Building and starting projects is turned off in untrusted folders.</span></li>
          </ul>
        </div>
        <div className="visual" aria-label="Buttons above a compose file">
          <small>compose.yaml</small>
          <b>▶ Compose Up</b> <i>Rebuild</i> <i>■ Down</i> <i>Logs</i><br/>
          <span style={{color:'#5f6d7a'}}>services:</span><br/>
          <b>  ▶ Up api</b><br/>
          <span style={{color:'#5f6d7a'}}>  api: build: .</span><br/>
          <b>  ▶ Up db</b><br/>
          <span style={{color:'#5f6d7a'}}>  db: image: postgres:16</span>
        </div>
      </section>

      <section className="pm-shot"><img src="/docker-editor.webp" alt="A Dockerfile with Build and Run buttons and underlined mistakes, a compose file with Compose Up buttons, and the Problems list with quick fixes" width={1600} height={900} loading="lazy"/></section>

      <section className="content-section split" id="install">
        <div>
          <span className="kicker">INSTALL</span>
          <h2>Ready in a minute.</h2>
          {EXT.listed?<ol className="live-install">
            <li>In VS Code, open <strong>Extensions</strong> (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>) and search for <strong>Veyra Container Studio</strong>, or open it on the <a href={MARKETPLACE}>Visual Studio Marketplace</a>.</li>
            <li>Click <strong>Install</strong>, then the <strong>Docker</strong> icon in the Activity Bar.</li>
          </ol>:<ol className="live-install">
            <li><a href={VSIX}>Download the <code>.vsix</code></a> (95 KB).</li>
            <li>In VS Code, press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> and run <strong>Extensions: Install from VSIX…</strong>, then choose the file.</li>
            <li>Start Docker Desktop, then click the <strong>Docker</strong> icon in the Activity Bar.</li>
          </ol>}
          <p className="live-note">Try it: open a project with a <code>compose.yaml</code> and click <strong>▶ Compose Up</strong>. {EXT.listed?'':'Coming to the Visual Studio Marketplace soon.'}</p>
        </div>
        <div className="visual" aria-label="Commands">
          <small>Command Palette</small>
          <b>Docker: Open Dashboard</b><br/>
          <b>Docker: Clean Up Disk Space…</b><br/>
          <b>Docker: Run Image…</b><br/>
          <b>Docker: Compose Up</b><br/>
          <b>Docker: Build and Run</b><br/>
          <span style={{color:'#5f6d7a'}}>Right-click a container:</span> <i>Logs, Shell, Stop, Remove</i>
        </div>
      </section>

      <section className="content-section">
        <header><span>FAQ</span><h2>Questions</h2></header>
        <div className="live-faq">{FAQ.map(item=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
        <p className="live-more"><Sparkles size={14}/>More for VS Code: <Link href="/mcp-studio">Veyra MCP Studio</Link>, <Link href="/api-client">Veyra API Client</Link>, <Link href="/port-manager">Veyra Port Manager</Link> and <Link href="/npm-intellisense">Veyra npm IntelliSense</Link>.</p>
        <p className="live-note" style={{marginTop:12}}>Docker is a trademark of Docker, Inc. Veyra Container Studio is an independent extension and is not made or endorsed by Docker, Inc.</p>
      </section>

      <ClosingCTA title="Made by the Veyra team." copy="Veyra Studio is a fast, free code editor with Live Server, Python debugging and Veyra AI built in."/>
    </div></main><Footer/></>;
}
