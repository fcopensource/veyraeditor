import type {Metadata} from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {Beaker,ClipboardList,Download,Flame,GitBranch,Network,Route,ScanSearch,ShieldCheck,Trash2,Zap} from 'lucide-react';
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

const EXT_BASE=VSCODE_EXTENSIONS.blastRadius;
const MARKETPLACE=marketplaceUrl(EXT_BASE.id), VSIX=vsixUrl(EXT_BASE);

export const metadata:Metadata={
  title:'Blast Radius for VS Code: See What Your Change Can Break Before You Commit',
  description:'Change impact analysis for VS Code. See every file, page, API route, component and test that depends on your uncommitted changes, as a list and a graph, and run only the affected tests. JavaScript, TypeScript, React, Vue, Svelte and Python. Free.',
  keywords:['change impact analysis','affected tests','dependency graph','VS Code dependency graph','reverse dependencies','who imports this file','run affected tests','import graph','code review','VS Code extension'],
  alternates:{canonical:'/blast-radius'},
  openGraph:{url:'/blast-radius',title:'Veyra Blast Radius',description:'Know what your change can break, before you commit. Free for VS Code.',images:[{url:'/blast-radius-graph.png',width:1400,height:860,alt:'The Blast Radius graph: a changed file in the middle and every file that depends on it in rings around it'}]},
};

const FEATURES=[
  {icon:Flame,title:'The blast radius of your changes',copy:'Next to your commit box: every file that depends on what you changed, with a count on the view and in the status bar.'},
  {icon:Route,title:'Grouped the way you think',copy:'Tests to run, pages, routes and APIs, components, config and middleware, and other code. The important ones first.'},
  {icon:Network,title:'A graph you can explore',copy:'Your changes in the middle, every ring one import further. Hover a file to see exactly how your change reaches it.'},
  {icon:Beaker,title:'Run only the affected tests',copy:'One click runs just the tests that depend on your change, with Vitest, Jest, Mocha, Playwright, node --test or pytest.'},
  {icon:ScanSearch,title:'Used by 7 files',copy:'The top of every file shows how many files import it and how far a change would reach, before you touch it.'},
  {icon:Trash2,title:'Deleted a file?',copy:'Blast Radius still shows every file that imported it, because those are exactly the ones that break.'},
  {icon:ClipboardList,title:'An impact report for your PR',copy:'Copy a Markdown summary of what your change affects and which tests to run, ready for your pull request.'},
  {icon:GitBranch,title:'Understands your project',copy:'JavaScript, TypeScript, Vue, Svelte, Astro and Python. tsconfig path aliases like @/components, monorepos and Next.js routes.'},
  {icon:ShieldCheck,title:'100% local',copy:'It reads your files and runs git status, and that is all. No account, no telemetry, nothing sent anywhere.'},
];
const FAQ=[
  {q:'Is it free?',a:'Yes. Veyra Blast Radius is free and MIT licensed, with no account and no telemetry.'},
  {q:'What is a blast radius?',a:'Every file that could behave differently because you changed a file: the files that import it, the files that import those, and so on. If you change a database helper, that can be a handful of services, the pages that use them and the tests that cover them.'},
  {q:'Which languages does it understand?',a:'JavaScript and TypeScript (including JSX, ESM and CommonJS), Vue, Svelte, Astro and Python. It follows path aliases and baseUrl from tsconfig.json and jsconfig.json, including several in a monorepo.'},
  {q:'How does it know what I changed?',a:'It asks git for your uncommitted changes: staged, unstaged and new files. You can also see the blast radius of any file, from the Explorer, an editor tab, or the Used by line at the top of the file.'},
  {q:'Does it run my tests?',a:'Only when you click Run Affected Tests. It picks Vitest, Jest, Mocha, Playwright, node --test or pytest from your project, or uses the command you set.'},
  {q:'Is it slow on a big project?',a:'No. It reads only the import lines, so thousands of files are mapped in seconds, and the map is updated as you save.'},
];

export default async function BlastRadiusPage(){
  const EXT=await liveExtension(EXT_BASE);
  const app={
    '@context':'https://schema.org','@type':'SoftwareApplication',name:'Veyra Blast Radius',applicationCategory:'DeveloperApplication',
    operatingSystem:'Windows, macOS, Linux',url:absolute('/blast-radius'),image:absolute('/blast-radius-icon.png'),softwareVersion:EXT.version,downloadUrl:EXT.listed?MARKETPLACE:VSIX,
    description:'A free VS Code extension that shows every file, page, route, component and test that depends on your uncommitted changes, as a list and a graph, and runs only the affected tests.',
    offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},publisher:{'@type':'Organization',name:'Veyra',url:absolute('/')},
  };
  const faq={'@context':'https://schema.org','@type':'FAQPage',mainEntity:FAQ.map(item=>({'@type':'Question',name:item.q,acceptedAnswer:{'@type':'Answer',text:item.a}}))};

  return <><Nav/><Breadcrumbs items={[{name:'Extensions',path:'/extensions'},{name:'Veyra Blast Radius',path:'/blast-radius'}]}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(app)}}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(faq)}}/>
    <main className="page-shell"><div className="content live-page">
      <section className="live-hero">
        <div className="live-hero-glow" aria-hidden="true"/>
        <div className="live-icon"><Image src="/blast-radius-icon.png" width={148} height={148} alt="Veyra Blast Radius icon" priority/></div>
        <span className="live-kicker"><i/>NEW · FOR VS CODE</span>
        <h1>Veyra <em>Blast Radius</em></h1>
        <p className="live-tagline">Know what your change can break, before you commit.</p>
        <p className="live-intro">You changed one file. What else did you just change? Blast Radius follows every import in your project backwards and shows every page, API route, component and test that depends on what you edited. Then it runs only the tests that matter.</p>
        <div className="live-actions">
          {EXT.listed?<a className="primary" href={MARKETPLACE}><Zap size={16}/>Get it for VS Code</a>:<a className="primary" href={VSIX}><Download size={16}/>Download for VS Code</a>}
          <a className="secondary" href="#install"><Zap size={16}/>How to install</a>
        </div>
        <p className="live-micro"><Installs id={EXT.id}/>{EXT.id} · v{EXT.version} · Free · MIT · Windows, macOS, Linux</p>
      </section>

      <section className="pm-shot"><img src="/blast-radius-graph.png" alt="The Blast Radius graph: db.ts in the middle, and in rings around it the services, components, pages, API routes and tests that depend on it" width={1400} height={860}/></section>

      <section className="content-section">
        <header><span>FEATURES</span><h2>Change code without fear.</h2></header>
        <div className="cards">{FEATURES.map(feature=><article className="card" key={feature.title}><feature.icon/><h3>{feature.title}</h3><p>{feature.copy}</p></article>)}</div>
      </section>

      <section className="content-section">
        <header><span>TRACE THE PATH</span><h2>See exactly why a file is affected.</h2></header>
        <p className="live-note">Hover any file in the graph and the path from your change lights up: <em>&ldquo;Affected 2 hops away, through src/lib/db.ts → src/lib/users.ts → src/lib/auth.ts&rdquo;</em>. Click it to open the file.</p>
      </section>
      <section className="pm-shot"><img src="/blast-radius-trace.png" alt="Hovering auth.ts in the graph highlights the import path from db.ts through users.ts to auth.ts" width={1400} height={860} loading="lazy"/></section>

      <section className="content-section split" id="install">
        <div>
          <span className="kicker">INSTALL</span>
          <h2>Ready in a minute.</h2>
          {EXT.listed?<ol className="live-install">
            <li>In VS Code, open <strong>Extensions</strong> (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>) and search for <strong>Veyra Blast Radius</strong>, or open it on the <a href={MARKETPLACE}>Visual Studio Marketplace</a>.</li>
            <li>Click <strong>Install</strong>, change a file, and open <strong>Source Control → Blast Radius</strong>.</li>
          </ol>:<ol className="live-install">
            <li><a href={VSIX}>Download the <code>.vsix</code></a> (76 KB).</li>
            <li>In VS Code, press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> and run <strong>Extensions: Install from VSIX…</strong>, then choose the file.</li>
            <li>Change a file and open <strong>Source Control → Blast Radius</strong>. There&apos;s nothing to set up.</li>
          </ol>}
          <p className="live-note">Pairs well with <Link href="/git-graph">Git Graph Veyra</Link> for your history and <Link href="/error-lens">Error Lens Veyra</Link> for problems on their lines. {EXT.listed?'':'Coming to the Visual Studio Marketplace soon.'}</p>
        </div>
        <div className="visual" aria-label="What it shows">
          <small>You changed src/lib/db.ts</small>
          <b>Tests to run</b> <i>users.test.ts, cart.test.ts</i><br/>
          <b>Pages &amp; APIs</b> <i>/users, /checkout, /api/orders</i><br/>
          <b>Components</b> <i>UserCard, CartDrawer</i><br/>
          <b>Used by</b> <i>2 files · blast radius 19</i>
        </div>
      </section>

      <section className="content-section">
        <header><span>FAQ</span><h2>Questions</h2></header>
        <div className="live-faq">{FAQ.map(item=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
        <MoreExtensions current="/blast-radius"/>
      </section>

      <ClosingCTA title="Made by the Veyra team." copy="Veyra Studio is a fast, free code editor with Live Server, Python debugging and Search Everywhere built in."/>
    </div></main><Footer/></>;
}
