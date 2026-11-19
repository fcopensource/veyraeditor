import type {Metadata} from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {Activity,ClipboardList,Download,Flame,History,LayoutGrid,Link2,Palette,ShieldCheck,UserRound,Zap} from 'lucide-react';
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

const EXT_BASE=VSCODE_EXTENSIONS.hotspots;
const MARKETPLACE=marketplaceUrl(EXT_BASE.id), VSIX=vsixUrl(EXT_BASE);

export const metadata:Metadata={
  title:'Hotspots for VS Code: A Heat Map of Your Codebase, From Git History',
  description:'Find the files where bugs live: complex code that changes all the time. A heat map of your whole codebase from your own git history, with change coupling, code ownership and knowledge risks. Free VS Code extension, 100% local.',
  keywords:['code hotspots','technical debt','code health','git history analysis','code churn','codebase heatmap','treemap','change coupling','bus factor','code ownership','refactoring','VS Code extension'],
  alternates:{canonical:'/hotspots'},
  openGraph:{url:'/hotspots',title:'Veyra Hotspots',description:'A living heat map of your codebase. Find the files where bugs live. Free for VS Code.',images:[{url:'/hotspots-map.png',width:1440,height:880,alt:'The Hotspot Map: every file as a tile sized by lines of code and coloured from calm slate to hot coral'}]},
};

const FEATURES=[
  {icon:LayoutGrid,title:'Your whole codebase, at a glance',copy:'Every file is a tile, sized by its code and coloured by risk. Zoom into any folder, filter by name, hover for the details.'},
  {icon:Flame,title:'Top hotspots, ranked',copy:'The files to refactor first: complex code that changes all the time, with the reason spelled out for each.'},
  {icon:Link2,title:'Files that change together',copy:'Pairs that keep landing in the same commits, often across folders. A hidden dependency, made visible.'},
  {icon:UserRound,title:'Knowledge risks',copy:'Files only one person has ever changed, and code whose only author has left the project.'},
  {icon:Palette,title:'Five ways to look',copy:'Hotspots, change frequency, complexity, code age and knowledge risk, each one click away.'},
  {icon:Activity,title:'Flames in the Explorer',copy:'The hottest files get a flame where you already work, and the status bar shows the open file’s rank.'},
  {icon:History,title:'File history in a click',copy:'See a file’s recent commits, who made them and what each one changed, without leaving the editor.'},
  {icon:ClipboardList,title:'A report for your team',copy:'Copy the top hotspots, coupled files and knowledge risks as Markdown for a planning meeting or an issue.'},
  {icon:ShieldCheck,title:'100% local',copy:'It reads your git history and your files, and that is all. No account, no telemetry, nothing sent anywhere.'},
];
const FAQ=[
  {q:'Is it free?',a:'Yes. Veyra Hotspots is free and MIT licensed, with no account and no telemetry.'},
  {q:'What is a hotspot?',a:'A file that is both complex and changed often. Either one on its own is fine: complex code nobody touches is stable, and simple code that changes a lot is easy. Together they are where most bugs and slow reviews come from, so that is where refactoring pays off most.'},
  {q:'How is complexity measured?',a:'From the file’s lines of code and how deeply they are indented. Indentation follows nesting (ifs inside loops inside callbacks) in every language, so it works the same for TypeScript, Python, Go, Rust, Java, C# and the rest.'},
  {q:'What does “changes together” mean?',a:'Two files that shared at least 4 commits, and changed together at least 40% of the time. Huge commits like formatting runs and mass renames are ignored, so the pairs reflect real dependencies.'},
  {q:'How much history does it read?',a:'The last year by default. Choose the last month, 3, 6 or 24 months, or all history. It refreshes after commits, pulls and checkouts.'},
  {q:'Is my code sent anywhere?',a:'No. It runs git log on your computer and reads your files locally. Nothing leaves your machine.'},
];

export default async function HotspotsPage(){
  const EXT=await liveExtension(EXT_BASE);
  const app={
    '@context':'https://schema.org','@type':'SoftwareApplication',name:'Veyra Hotspots',applicationCategory:'DeveloperApplication',
    operatingSystem:'Windows, macOS, Linux',url:absolute('/hotspots'),image:absolute('/hotspots-icon.png'),softwareVersion:EXT.version,downloadUrl:EXT.listed?MARKETPLACE:VSIX,
    description:'A free VS Code extension that shows a heat map of a codebase from its git history, ranking the complex, often-changed files where bugs concentrate, with change coupling and knowledge risks.',
    offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},publisher:{'@type':'Organization',name:'Veyra',url:absolute('/')},
  };
  const faq={'@context':'https://schema.org','@type':'FAQPage',mainEntity:FAQ.map(item=>({'@type':'Question',name:item.q,acceptedAnswer:{'@type':'Answer',text:item.a}}))};

  return <><Nav/><Breadcrumbs items={[{name:'Extensions',path:'/extensions'},{name:'Veyra Hotspots',path:'/hotspots'}]}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(app)}}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(faq)}}/>
    <main className="page-shell"><div className="content live-page">
      <section className="live-hero">
        <div className="live-hero-glow" aria-hidden="true"/>
        <div className="live-icon"><Image src="/hotspots-icon.png" width={148} height={148} alt="Veyra Hotspots icon" priority/></div>
        <span className="live-kicker"><i/>NEW · FOR VS CODE</span>
        <h1>Veyra <em>Hotspots</em></h1>
        <p className="live-tagline">A living heat map of your codebase.</p>
        <p className="live-intro">Some files cause most of the trouble: they&apos;re complicated <em>and</em> they change all the time. Hotspots reads your project&apos;s own git history, finds them, and shows your whole codebase as one heat map, with who knows each file and which files secretly change together.</p>
        <div className="live-actions">
          {EXT.listed?<a className="primary" href={MARKETPLACE}><Zap size={16}/>Get it for VS Code</a>:<a className="primary" href={VSIX}><Download size={16}/>Download for VS Code</a>}
          <a className="secondary" href="#install"><Zap size={16}/>How to install</a>
        </div>
        <p className="live-micro"><Installs id={EXT.id}/>{EXT.id} · v{EXT.version} · Free · MIT · Windows, macOS, Linux</p>
      </section>

      <section className="pm-shot"><img src="/hotspots-map.png" alt="The Hotspot Map of a real project: hundreds of files as tiles, the hottest in orange and coral, with the top hotspots ranked on the right" width={1440} height={880}/></section>

      <section className="content-section">
        <header><span>FEATURES</span><h2>Know where the bugs live.</h2></header>
        <div className="cards">{FEATURES.map(feature=><article className="card" key={feature.title}><feature.icon/><h3>{feature.title}</h3><p>{feature.copy}</p></article>)}</div>
      </section>

      <section className="content-section">
        <header><span>EVERY FILE HAS A STORY</span><h2>Click a file to see why it&apos;s hot.</h2></header>
        <p className="live-note">How often it changed, how deeply it&apos;s nested, who knows it best, and the files that always change with it, linked right on the map. This is the real map of the Veyra Studio repository: its #1 hotspot changed in 38 commits last year.</p>
      </section>
      <section className="pm-shot"><img src="/hotspots-detail.png" alt="App.tsx selected: rank 1 critical hotspot, 38 commits, 785 lines, 9 levels deep, who knows it, and dashed lines to the two files that change with it" width={1440} height={880} loading="lazy"/></section>

      <section className="content-section">
        <header><span>FIVE WAYS TO LOOK</span><h2>Hotspots, churn, complexity, age and knowledge.</h2></header>
        <p className="live-note">Switch the colours to see what changes most, what&apos;s most deeply nested, what nobody has touched in years, or the code only one person understands, before they go on holiday.</p>
      </section>
      <section className="pm-shot"><img src="/hotspots-knowledge.png" alt="The same map in Knowledge risk mode: files changed by only one person stand out from shared files" width={1440} height={880} loading="lazy"/></section>

      <section className="content-section split" id="install">
        <div>
          <span className="kicker">INSTALL</span>
          <h2>Ready in a minute.</h2>
          {EXT.listed?<ol className="live-install">
            <li>In VS Code, open <strong>Extensions</strong> (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>) and search for <strong>Veyra Hotspots</strong>, or open it on the <a href={MARKETPLACE}>Visual Studio Marketplace</a>.</li>
            <li>Click <strong>Install</strong>, then the <strong>Hotspots</strong> icon in the activity bar.</li>
          </ol>:<ol className="live-install">
            <li><a href={VSIX}>Download the <code>.vsix</code></a> (47 KB).</li>
            <li>In VS Code, press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> and run <strong>Extensions: Install from VSIX…</strong>, then choose the file.</li>
            <li>Open a git project and click the <strong>Hotspots</strong> icon in the activity bar. There&apos;s nothing to set up.</li>
          </ol>}
          <p className="live-note">Pairs well with <Link href="/blast-radius">Veyra Blast Radius</Link>, which shows what a change can break before you commit, and <Link href="/git-graph">Git Graph Veyra</Link>. Using IntelliJ IDEA, Android Studio or PyCharm? Get <Link href="/jetbrains/hotspots">Hotspots Veyra for JetBrains IDEs</Link>. {EXT.listed?'':'Coming to the Visual Studio Marketplace soon.'}</p>
        </div>
        <div className="visual" aria-label="What it finds">
          <small>Your top hotspots</small>
          <b>#1 App.tsx</b> <i>38 commits · 9 levels deep</i><br/>
          <b>#2 lib.rs</b> <i>30 commits</i><br/>
          <b>Changes together</b> <i>App.tsx ↔ lib.rs, 59%</i><br/>
          <b>Knowledge risk</b> <i>only one person knows it</i>
        </div>
      </section>

      <section className="content-section">
        <header><span>FAQ</span><h2>Questions</h2></header>
        <div className="live-faq">{FAQ.map(item=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
        <MoreExtensions current="/hotspots"/>
      </section>

      <ClosingCTA title="Made by the Veyra team." copy="Veyra Studio is a fast, free code editor with Live Server, Python debugging and Search Everywhere built in."/>
    </div></main><Footer/></>;
}
