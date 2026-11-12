import type {Metadata} from 'next';
import Image from 'next/image';
import {Bookmark,Download,FileX2,Gauge,History,LockKeyhole,Play,Search,Undo2,Zap} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {MoreExtensions} from '@/components/MoreExtensions';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {ClosingCTA} from '@/components/ContentPage';
import {absolute,jsonLd,marketplaceUrl,VSCODE_EXTENSIONS,vsixUrl} from '@/lib/site';
import '../live-server/live-server.css';
import '../port-manager/port-manager.css';

const EXT=VSCODE_EXTENSIONS.rewind;
const MARKETPLACE=marketplaceUrl(EXT.id), VSIX=vsixUrl(EXT);

export const metadata:Metadata={
  title:'Veyra Rewind for VS Code: Local History and Time Travel for Every File',
  description:'Every version of every file, without a commit. Scrub a timeline, play back how a file evolved, find code you deleted, restore deleted files and name checkpoints. Free, offline and private.',
  keywords:['VS Code local history','recover deleted code','restore deleted file VS Code','file history','undo history','time travel','checkpoint','VS Code extension'],
  alternates:{canonical:'/rewind'},
  openGraph:{url:'/rewind',title:'Veyra Rewind: time travel for your code',description:'Every version of every file, without a commit. Free for VS Code.',images:[{url:'/rewind-changes.png',width:1000,height:640,alt:'The Rewind panel with a timeline of snapshots and the lines deleted since then'}]},
};

const FEATURES=[
  {icon:History,title:'Scrub through time',copy:'Every save, every pause in typing and every checkpoint on one timeline. Drag the slider or use the arrow keys.'},
  {icon:Play,title:'Play the story',copy:'Watch a file evolve step by step, at 1× to 8×. Perfect for “when did this break?”'},
  {icon:Search,title:'Find deleted code',copy:'Search for text that was in any file but isn’t any more, across your whole history.'},
  {icon:Undo2,title:'Restore anything',copy:'Put back a whole version as one edit (Ctrl+Z undoes it), or revert a single block in the diff editor.'},
  {icon:FileX2,title:'Bring back deleted files',copy:'Deleted a file, even outside VS Code? Restore it from the last version Rewind saw.'},
  {icon:Bookmark,title:'Checkpoints',copy:'Name a moment, like “before the refactor”. Checkpoints are kept forever.'},
  {icon:Gauge,title:'Tiny and fast',copy:'Snapshots are compressed and never stored twice, and history thins out as it ages. The extension itself is 68 KB.'},
  {icon:LockKeyhole,title:'Private by design',copy:'History stays on your computer. No account, no network access, no telemetry.'},
  {icon:Zap,title:'Zero setup',copy:'Install it and keep coding. Dependencies, build output and lock files are skipped automatically.'},
];
const FAQ=[
  {q:'Is it free?',a:'Yes. Veyra Rewind is free and MIT licensed, with no account and no telemetry.'},
  {q:'How is it different from Git?',a:'Git keeps the versions you commit. Rewind keeps everything in between: the experiment you abandoned, the function you deleted before lunch, the file you never added. Use both.'},
  {q:'How is it different from Ctrl+Z?',a:'Undo is lost when you close a file or restart VS Code, and you can only step back one change at a time. Rewind keeps history across restarts and lets you jump straight to any moment.'},
  {q:'How much disk space does it use?',a:'Very little. Snapshots are compressed, identical content is stored once, and older history is thinned out: everything from today, one per 10 minutes for a week, one per hour up to 30 days. Run “Rewind: Show History Storage” to see the total.'},
  {q:'Does my code leave my computer?',a:'Never. History is kept in VS Code’s private storage for the extension on your computer, and Rewind makes no network requests.'},
];

export default function RewindPage(){
  const app={
    '@context':'https://schema.org','@type':'SoftwareApplication',name:'Veyra Rewind',applicationCategory:'DeveloperApplication',
    operatingSystem:'Windows, macOS, Linux',url:absolute('/rewind'),image:absolute('/rewind-icon.png'),softwareVersion:EXT.version,downloadUrl:EXT.listed?MARKETPLACE:VSIX,
    description:'A free VS Code extension that keeps the history of every file: scrub a timeline, play it back, find deleted code, restore deleted files and name checkpoints.',
    offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},publisher:{'@type':'Organization',name:'Veyra',url:absolute('/')},
  };
  const faq={'@context':'https://schema.org','@type':'FAQPage',mainEntity:FAQ.map(item=>({'@type':'Question',name:item.q,acceptedAnswer:{'@type':'Answer',text:item.a}}))};

  return <><Nav/><Breadcrumbs items={[{name:'Extensions',path:'/extensions'},{name:'Veyra Rewind',path:'/rewind'}]}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(app)}}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(faq)}}/>
    <main className="page-shell"><div className="content live-page">
      <section className="live-hero">
        <div className="live-hero-glow" aria-hidden="true"/>
        <div className="live-icon"><Image src="/rewind-icon.png" width={148} height={148} alt="Veyra Rewind icon" priority/></div>
        <span className="live-kicker"><i/>NEW · FOR VS CODE</span>
        <h1>Veyra <em>Rewind</em></h1>
        <p className="live-tagline">Time travel for your code.</p>
        <p className="live-intro">Every version of every file, without a single commit. Scrub a timeline to see any file at any moment, play back how it evolved, and bring back the code or the file you deleted.</p>
        <div className="live-actions">
          {EXT.listed?<a className="primary" href={MARKETPLACE}><Zap size={16}/>Get it for VS Code</a>:<a className="primary" href={VSIX}><Download size={16}/>Download for VS Code</a>}
          <a className="secondary" href="#install"><Zap size={16}/>How to install</a>
        </div>
        <p className="live-micro">{EXT.id} · v{EXT.version} · Free · MIT · Windows, macOS, Linux</p>
      </section>

      <section className="pm-shot"><img src="/rewind-changes.png" alt="The Rewind panel for cart.js: a timeline with a checkpoint, and the lines deleted since then in red with the lines added since in green" width={1000} height={640}/></section>

      <section className="content-section">
        <header><span>FEATURES</span><h2>The undo button you always wanted.</h2></header>
        <div className="cards">{FEATURES.map(feature=><article className="card" key={feature.title}><feature.icon/><h3>{feature.title}</h3><p>{feature.copy}</p></article>)}</div>
      </section>

      <section className="pm-shot"><img src="/rewind-version.png" alt="The same panel showing the whole file as it was at that moment" width={1000} height={640} loading="lazy"/></section>

      <section className="content-section split" id="install">
        <div>
          <span className="kicker">INSTALL</span>
          <h2>Ready in a minute.</h2>
          {EXT.listed?<ol className="live-install">
            <li>In VS Code, open <strong>Extensions</strong> (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>) and search for <strong>Veyra Rewind</strong>, or open it on the <a href={MARKETPLACE}>Visual Studio Marketplace</a>.</li>
            <li>Click <strong>Install</strong>. History starts with the next file you open.</li>
          </ol>:<ol className="live-install">
            <li><a href={VSIX}>Download the <code>.vsix</code></a> (68 KB).</li>
            <li>In VS Code, press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> and run <strong>Extensions: Install from VSIX…</strong>, then choose the file.</li>
            <li>Keep coding. Press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Z</kbd> to rewind the file you&apos;re in.</li>
          </ol>}
          <p className="live-note">Lost something? Run <strong>Rewind: Find Deleted Code…</strong> and type what you remember. {EXT.listed?'':'Coming to the Visual Studio Marketplace soon.'}</p>
        </div>
        <div className="visual" aria-label="Keyboard shortcuts">
          <small>rewind · shortcuts</small>
          <b>Ctrl+Alt+Z</b> <i>Rewind this file</i><br/>
          <b>Ctrl+Alt+S</b> <i>Take a checkpoint</i><br/>
          <b>← →</b> <i>Step through time</i><br/>
          <b>Space</b> <i>Play the story</i>
        </div>
      </section>

      <section className="content-section">
        <header><span>FAQ</span><h2>Questions</h2></header>
        <div className="live-faq">{FAQ.map(item=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
        <MoreExtensions current="/rewind"/>
      </section>

      <ClosingCTA title="Made by the Veyra team." copy="Veyra Studio is a fast, free code editor with Live Server, Python debugging and Search Everywhere built in."/>
    </div></main><Footer/></>;
}
