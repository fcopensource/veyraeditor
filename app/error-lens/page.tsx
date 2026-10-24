import type {Metadata} from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {Copy,Download,EyeOff,Filter,Keyboard,Languages,MousePointer2,Palette,Sparkles,TriangleAlert,Zap} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {ClosingCTA} from '@/components/ContentPage';
import {absolute,jsonLd,marketplaceUrl,VSCODE_EXTENSIONS,vsixUrl} from '@/lib/site';
import '../live-server/live-server.css';
import '../port-manager/port-manager.css';

const EXT=VSCODE_EXTENSIONS.errorLens;
const MARKETPLACE=marketplaceUrl(EXT.id), VSIX=vsixUrl(EXT);

export const metadata:Metadata={
  title:'Error Lens for VS Code: See Errors Inline, at the End of the Line',
  description:'Show errors and warnings right at the end of their lines in VS Code, with the line tinted and the cursor’s problem in the status bar. Every language, calm while you type. Free.',
  keywords:['error lens','VS Code inline errors','show errors inline','diagnostics','warnings','eslint inline','typescript errors','VS Code extension'],
  alternates:{canonical:'/error-lens'},
  openGraph:{url:'/error-lens',title:'Error Lens Veyra',description:'See every problem right where it is. Free for VS Code.',images:[{url:'/error-lens-hero.webp',width:1920,height:960,alt:'TypeScript errors shown at the end of their lines in VS Code'}]},
};

const FEATURES=[
  {icon:TriangleAlert,title:'Right on the line',copy:'Each error and warning appears at the end of its line, coloured by severity, with “+2 more” when a line has several.'},
  {icon:Palette,title:'Fits your theme',copy:'The line is gently tinted, and every colour comes from your theme, light or dark. Change them like any theme colour.'},
  {icon:MousePointer2,title:'The cursor’s problem',copy:'The status bar shows the problem on the line you’re on, with every problem on that line in its tooltip.'},
  {icon:Keyboard,title:'Calm while you type',copy:'The line you’re editing waits until you pause, so half-typed code doesn’t flash red.'},
  {icon:Filter,title:'Only what you want',copy:'Pick severities, hide noisy sources like spell checkers, or skip messages that match a pattern.'},
  {icon:EyeOff,title:'Follow the cursor',copy:'Show every problem, only the cursor’s line, or only the problem nearest the cursor.'},
  {icon:Copy,title:'Copy or search',copy:'Copy every problem on a line, or search the web for it without your local file paths.'},
  {icon:Languages,title:'Every language',copy:'TypeScript, Python, ESLint, C#, Go, Rust, spelling: whatever VS Code checks, Error Lens Veyra shows.'},
  {icon:Sparkles,title:'Light and private',copy:'It runs no checks of its own, so it adds no load, and nothing is sent anywhere.'},
];
const FAQ=[
  {q:'Is it free?',a:'Yes. Error Lens Veyra is free and MIT licensed, with no account and no telemetry.'},
  {q:'Does it work with my language?',a:'Yes. It shows the problems VS Code already knows about, from any language extension or linter: TypeScript, Python, ESLint, C#, Go, Rust, spell checkers and more.'},
  {q:'Can I make it quieter?',a:'Turn warnings or info off with one command, hide a source like cSpell, show only the cursor’s line, or skip messages that match a regular expression.'},
  {q:'Will errors flash while I type?',a:'No. By default the line you’re typing on waits until you pause before its message comes back. You can also wait for a pause to update everything.'},
  {q:'Is it the same as the Error Lens extension?',a:'It is an independent extension, written from scratch, with a calm typing mode, the cursor’s problem in the status bar and a privacy-friendly web search.'},
];

export default function ErrorLensPage(){
  const app={
    '@context':'https://schema.org','@type':'SoftwareApplication',name:'Error Lens Veyra',applicationCategory:'DeveloperApplication',
    operatingSystem:'Windows, macOS, Linux',url:absolute('/error-lens'),image:absolute('/error-lens-icon.png'),softwareVersion:EXT.version,downloadUrl:EXT.listed?MARKETPLACE:VSIX,
    description:'A free VS Code extension that shows errors and warnings at the end of their lines, with the line tinted and the cursor’s problem in the status bar.',
    offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},publisher:{'@type':'Organization',name:'Veyra',url:absolute('/')},
  };
  const faq={'@context':'https://schema.org','@type':'FAQPage',mainEntity:FAQ.map(item=>({'@type':'Question',name:item.q,acceptedAnswer:{'@type':'Answer',text:item.a}}))};

  return <><Nav/><Breadcrumbs items={[{name:'Extensions',path:'/extensions'},{name:'Error Lens Veyra',path:'/error-lens'}]}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(app)}}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(faq)}}/>
    <main className="page-shell"><div className="content live-page">
      <section className="live-hero">
        <div className="live-hero-glow" aria-hidden="true"/>
        <div className="live-icon"><Image src="/error-lens-icon.png" width={148} height={148} alt="Error Lens Veyra icon" priority/></div>
        <span className="live-kicker"><i/>NEW · FOR VS CODE</span>
        <h1>Error Lens <em>Veyra</em></h1>
        <p className="live-tagline">See every problem right where it is.</p>
        <p className="live-intro">Errors and warnings appear at the end of their lines, the line is gently tinted, and the problem under your cursor shows in the status bar. No more hovering over squiggles.</p>
        <div className="live-actions">
          {EXT.listed?<a className="primary" href={MARKETPLACE}><Zap size={16}/>Get it for VS Code</a>:<a className="primary" href={VSIX}><Download size={16}/>Download for VS Code</a>}
          <a className="secondary" href="#install"><Zap size={16}/>How to install</a>
        </div>
        <p className="live-micro">{EXT.id} · v{EXT.version} · Free · MIT · Windows, macOS, Linux</p>
      </section>

      <section className="pm-shot"><img src="/error-lens-dark.webp" alt="A TypeScript file with each error’s message at the end of its line, a warning in amber, and the cursor’s problem in the status bar" width={1400} height={760}/></section>

      <section className="content-section">
        <header><span>FEATURES</span><h2>Problems, where your eyes already are.</h2></header>
        <div className="cards">{FEATURES.map(feature=><article className="card" key={feature.title}><feature.icon/><h3>{feature.title}</h3><p>{feature.copy}</p></article>)}</div>
      </section>

      <section className="pm-shot"><img src="/error-lens-light.webp" alt="The same file in a light theme" width={1400} height={760} loading="lazy"/></section>

      <section className="content-section split" id="install">
        <div>
          <span className="kicker">INSTALL</span>
          <h2>Ready in a minute.</h2>
          {EXT.listed?<ol className="live-install">
            <li>In VS Code, open <strong>Extensions</strong> (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>) and search for <strong>Error Lens Veyra</strong>, or open it on the <a href={MARKETPLACE}>Visual Studio Marketplace</a>.</li>
            <li>Click <strong>Install</strong>. Problems show up straight away.</li>
          </ol>:<ol className="live-install">
            <li><a href={VSIX}>Download the <code>.vsix</code></a> (19 KB).</li>
            <li>In VS Code, press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> and run <strong>Extensions: Install from VSIX…</strong>, then choose the file.</li>
            <li>Open any file with a problem. There&apos;s nothing to set up.</li>
          </ol>}
          <p className="live-note">Too much at once? Run <strong>Error Lens Veyra: Show or Hide Warnings</strong> to focus on errors. {EXT.listed?'':'Coming to the Visual Studio Marketplace soon.'}</p>
        </div>
        <div className="visual" aria-label="Message template examples">
          <small>veyraLens.messageTemplate</small>
          <b>{'{message}'}</b> <i>Cannot find name &apos;fasle&apos;.</i><br/>
          <b>{'{source}: {message}'}</b> <i>ts: Cannot find…</i><br/>
          <b>{'{message} ({code})'}</b> <i>… (2304)</i>
        </div>
      </section>

      <section className="content-section">
        <header><span>FAQ</span><h2>Questions</h2></header>
        <div className="live-faq">{FAQ.map(item=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
        <p className="live-more"><Sparkles size={14}/>More for VS Code: <Link href="/git-graph">Git Graph Veyra</Link>, <Link href="/path-intellisense">Path IntelliSense Veyra</Link>, <Link href="/document-viewer">Veyra Document Viewer</Link> and <Link href="/env">Veyra Env</Link>.</p>
      </section>

      <ClosingCTA title="Made by the Veyra team." copy="Veyra Studio is a fast, free code editor with Live Server, Python debugging and Veyra AI built in."/>
    </div></main><Footer/></>;
}
