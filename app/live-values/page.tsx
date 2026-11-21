import type {Metadata} from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {Activity,Bug,Download,Flame,ListTree,MousePointerClick,Play,RefreshCw,ShieldCheck,Zap} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {MoreExtensions} from '@/components/MoreExtensions';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {Installs} from '@/components/Installs';
import {ClosingCTA} from '@/components/ContentPage';
import {absolute,jsonLd,marketplaceUrl,VSCODE_EXTENSIONS,vsixUrl} from '@/lib/site';
import {liveExtension} from '@/lib/catalog';
import '../live-server/live-server.css';
import '../port-manager/port-manager.css';

const EXT_BASE=VSCODE_EXTENSIONS.liveValues;
const MARKETPLACE=marketplaceUrl(EXT_BASE.id), VSIX=vsixUrl(EXT_BASE);

export const metadata:Metadata={
  title:'Live Values for VS Code: console.log Values Next to Your Code',
  description:'See console.log values, warnings, errors and crashes right next to the line that printed them, as your Node.js app runs. A free Console Ninja and Quokka alternative for VS Code. 100% local.',
  keywords:['console.log inline','inline console.log','console.log values in editor','Console Ninja alternative','Quokka alternative','runtime values','Node.js debugging','VS Code extension','TypeScript','logging'],
  alternates:{canonical:'/live-values'},
  openGraph:{url:'/live-values',title:'Veyra Live Values',description:'console.log values right next to your code, live. Free for VS Code.',images:[{url:'/live-values-editor.png',width:1926,height:1134,alt:'VS Code showing console.log values at the end of each line, a warning and the line that crashed'}]},
};

const FEATURES=[
  {icon:Zap,title:'Values at the end of the line',copy:'console.log, info, debug, warn and error, shown right after the line that printed them, as your program runs.'},
  {icon:Flame,title:'Crashes where they happen',copy:'An uncaught exception or unhandled rejection marks the line that threw, in red, with the error message.'},
  {icon:RefreshCw,title:'Loops, counted',copy:'A line that runs twelve times shows ×12 and its latest value. Every new run starts clean.'},
  {icon:Activity,title:'Numbers, charted',copy:'Hover a line that prints numbers for a tiny chart of them, with the minimum, maximum and last value.'},
  {icon:MousePointerClick,title:'The whole value on hover',copy:'Objects in full, the values printed before, and links to copy or clear them.'},
  {icon:ListTree,title:'A Live Values sidebar',copy:'Every line that printed, by file, with warnings and crashes flagged. Click one to jump to it.'},
  {icon:Play,title:'Run This File in one click',copy:'JavaScript or TypeScript, from the editor’s title bar. Or run anything in any VS Code terminal: node, npm run dev, tsx, nodemon.'},
  {icon:Bug,title:'Works with the debugger',copy:'Node debug sessions (F5 and launch.json) get live values too, and TypeScript values land on your .ts lines.'},
  {icon:ShieldCheck,title:'100% local',copy:'A small hook writes what your code prints to a file on your computer. Only your project’s code is recorded, and nothing is sent anywhere.'},
];
const FAQ=[
  {q:'Is it free?',a:'Yes. Veyra Live Values is free and MIT licensed, with no account, no paid tier and no telemetry.'},
  {q:'How does it work?',a:'It adds a small hook to Node.js in VS Code’s terminals (through NODE_OPTIONS). The hook notes each console call with its file and line and writes it to a file on your computer, and the extension shows the values in the editor. It never changes what your program prints or how it behaves.'},
  {q:'Do I have to change my code?',a:'No. Keep using console.log. Run your code in a VS Code terminal opened after installing the extension (or click Run This File) and the values appear.'},
  {q:'Does it work with TypeScript?',a:'Yes. With tsx, ts-node, or tsc with source maps, values land on your .ts lines. Run This File runs TypeScript with tsx.'},
  {q:'What about browser code?',a:'Live Values sees code that runs in Node.js: servers, scripts, CLIs, tests and the server side of full-stack apps. Code that runs in the browser isn’t covered yet.'},
  {q:'How is it different from Console Ninja or Quokka?',a:'The same idea, values next to your code, but free with no paid tier, open source, and 100% local. It works with the terminal and tools you already use.'},
];

export default async function LiveValuesPage(){
  const EXT=await liveExtension(EXT_BASE);
  const app={
    '@context':'https://schema.org','@type':'SoftwareApplication',name:'Veyra Live Values',applicationCategory:'DeveloperApplication',
    operatingSystem:'Windows, macOS, Linux',url:absolute('/live-values'),image:absolute('/live-values-icon.png'),softwareVersion:EXT.version,downloadUrl:EXT.listed?MARKETPLACE:VSIX,
    description:'A free VS Code extension that shows console.log values, warnings, errors and crashes next to the line of Node.js code that printed them, live.',
    offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},publisher:{'@type':'Organization',name:'Veyra',url:absolute('/')},
  };
  const faq={'@context':'https://schema.org','@type':'FAQPage',mainEntity:FAQ.map(item=>({'@type':'Question',name:item.q,acceptedAnswer:{'@type':'Answer',text:item.a}}))};

  return <><Nav/><Breadcrumbs items={[{name:'Extensions',path:'/extensions'},{name:'Veyra Live Values',path:'/live-values'}]}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(app)}}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(faq)}}/>
    <main className="page-shell"><div className="content live-page">
      <section className="live-hero">
        <div className="live-hero-glow" aria-hidden="true"/>
        <div className="live-icon"><Image src="/live-values-icon.png" width={148} height={148} alt="Veyra Live Values icon" priority/></div>
        <span className="live-kicker"><i/>NEW · FOR VS CODE</span>
        <h1>Veyra <em>Live Values</em></h1>
        <p className="live-tagline">See what your code prints, right next to the line that printed it.</p>
        <p className="live-intro">Stop jumping between your code and the terminal to work out which <code>console.log</code> printed what. Run your Node.js code as usual, and every value, warning, error and crash appears at the end of its line, live.</p>
        <div className="live-actions">
          {EXT.listed?<a className="primary" href={MARKETPLACE}><Zap size={16}/>Get it for VS Code</a>:<a className="primary" href={VSIX}><Download size={16}/>Download for VS Code</a>}
          <a className="secondary" href="#install"><Zap size={16}/>How to install</a>
        </div>
        <p className="live-micro"><Installs id={EXT.id}/>{EXT.id} · v{EXT.version} · Free · MIT · Windows, macOS, Linux</p>
      </section>

      <section className="pm-shot"><img src="/live-values-editor.png" alt="VS Code with orders.js: each console.log value in mint at the end of its line, a warning in amber, the crashed line in red, and the Live Values sidebar" width={1926} height={1134}/></section>

      <section className="content-section">
        <header><span>FEATURES</span><h2>Your logs, where your code is.</h2></header>
        <div className="cards">{FEATURES.map(feature=><article className="card" key={feature.title}><feature.icon/><h3>{feature.title}</h3><p>{feature.copy}</p></article>)}</div>
      </section>

      <section className="content-section">
        <header><span>HOVER ANY LINE</span><h2>The whole story of a value.</h2></header>
        <p className="live-note">The full value with objects expanded, how many times it printed, a chart of the numbers, and the values before it. Here, a log inside a loop printed three orders: 40.38, 9.99 and 108.8.</p>
      </section>
      <section className="pm-shot"><img src="/live-values-hover.png" alt="Hovering a console.log inside a loop: printed 3 times, a small chart with min, max and last, the values before it, and Copy value and Clear links" width={1926} height={1134} loading="lazy"/></section>

      <section className="content-section split" id="install">
        <div>
          <span className="kicker">INSTALL</span>
          <h2>Ready in a minute.</h2>
          {EXT.listed?<ol className="live-install">
            <li>In VS Code, open <strong>Extensions</strong> (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>) and search for <strong>Veyra Live Values</strong>, or open it on the <a href={MARKETPLACE}>Visual Studio Marketplace</a>.</li>
            <li>Click <strong>Install</strong>, open a <strong>new</strong> terminal and run your code.</li>
          </ol>:<ol className="live-install">
            <li><a href={VSIX}>Download the <code>.vsix</code></a> (70 KB).</li>
            <li>In VS Code, press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> and run <strong>Extensions: Install from VSIX…</strong>, then choose the file.</li>
            <li>Open a <strong>new</strong> terminal and run your code (<code>node app.js</code>, <code>npm run dev</code>…), or open a file and click <strong>Run This File with Live Values</strong>.</li>
          </ol>}
          <p className="live-note">Pairs well with <Link href="/error-lens">Error Lens Veyra</Link>, which shows problems at the end of their lines, and <Link href="/port-manager">Veyra Port Manager</Link> for the servers you start. {EXT.listed?'':'Coming to the Visual Studio Marketplace soon.'}</p>
        </div>
        <div className="visual" aria-label="What you see">
          <small>orders.js, after one run</small>
          <b>console.log(&apos;rate&apos;, rate);</b> <i>▸ rate 0.15 ×3</i><br/>
          <b>console.log(`order ${'{'}id{'}'}`, paid);</b> <i>▸ order 103 108.8 ×3</i><br/>
          <b>console.warn(&apos;Big day!&apos;, revenue);</b> <i>⚠ Big day! 159.17</i><br/>
          <b>console.log(vip.customer);</b> <i>💥 TypeError</i>
        </div>
      </section>

      <section className="content-section">
        <header><span>FAQ</span><h2>Questions</h2></header>
        <div className="live-faq">{FAQ.map(item=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
        <MoreExtensions current="/live-values"/>
      </section>

      <ClosingCTA title="Made by the Veyra team." copy="Veyra Studio is a fast, free code editor with Live Server, Python debugging and Search Everywhere built in."/>
    </div></main><Footer/></>;
}
