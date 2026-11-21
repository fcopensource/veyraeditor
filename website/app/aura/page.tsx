import type {Metadata} from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {BarChart3,Camera,Download,Flame,GitCommitHorizontal,ShieldCheck,Skull,Sparkles,Trophy,Zap} from 'lucide-react';
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

const EXT_BASE=VSCODE_EXTENSIONS.aura;
const MARKETPLACE=marketplaceUrl(EXT_BASE.id), VSIX=vsixUrl(EXT_BASE);

export const metadata:Metadata={
  title:'Veyra Aura for VS Code: Your Coding Aura, Ranks and Streaks',
  description:'Farm aura for clearing errors, commits and passing tests. Lose it for “wip” commits and force pushes. Rank up from NPC to Final Boss, keep your 🔥 streak and share your aura card. Free VS Code extension, 100% local.',
  keywords:['coding aura','aura points','VS Code gamification','coding streak','developer stats','gen z','VS Code extension','commit streak','fun VS Code extension','productivity'],
  alternates:{canonical:'/aura'},
  openGraph:{url:'/aura',title:'Veyra Aura: your coding aura ✨',description:'Farm aura, rank up from NPC to Final Boss, share your aura card. Free for VS Code.',images:[{url:'/aura-card.png',width:1200,height:630,alt:'An aura card: 1,150 aura, Locked In, a 7-day streak and +590 this week'}]},
};

const FEATURES=[
  {icon:Sparkles,title:'Aura for real wins',copy:'Clear every error in a file, ship a commit, get your tests green, delete dead code. Real wins, real aura.'},
  {icon:Skull,title:'Roast mode 💀',copy:'A “wip” commit message, failing tests, a force push or a leftover debugger costs you. Turn it off if you only want the W’s.'},
  {icon:Trophy,title:'NPC to Final Boss',copy:'Eight ranks: NPC, Side Character, Main Character, Locked In, Sigma, Aura Farmer, Goated and Final Boss.'},
  {icon:Flame,title:'Your 🔥 streak',copy:'Code every day to keep it alive. Each streak day adds a bonus, up to +50 a day.'},
  {icon:Zap,title:'Every move, live',copy:'Your aura and streak sit in the status bar, and each move flashes there as it happens: +15 aura 🧹.'},
  {icon:BarChart3,title:'The Aura panel',copy:'A glowing ring, your rank and progress, the week as a chart, your best moves, and a feed of every move.'},
  {icon:Camera,title:'Share your aura card',copy:'One click makes a 1200 × 630 card for X, Instagram and LinkedIn, with the caption copied and ready to post.'},
  {icon:GitCommitHorizontal,title:'Knows what you did',copy:'Errors from Problems, commits from VS Code’s Git, tests and builds from tasks and the terminal. No setup.'},
  {icon:ShieldCheck,title:'100% local',copy:'Your aura is stored in VS Code on your computer. No account, no leaderboard, no telemetry.'},
];
const MOVES:[string,string][]=[
  ['🧹 Clear every error in a file','+15'],['📦 Ship a commit','+20'],['✍️ A commit message that eats','+5'],['✅ Tests pass','+20'],
  ['🏗️ Build passes','+10'],['✂️ Delete 50+ lines','+15'],['🔒 25 minutes locked in','+10'],['🔥 Each streak day','+5'],
  ['💀 “wip” commit message','−5'],['🫠 Tests said nah','−5'],['☢️ git push --force','−20'],['🐛 Leftover debugger','−5'],
];
const FAQ=[
  {q:'Is it free?',a:'Yes. Veyra Aura is free and MIT licensed, with no account and no telemetry.'},
  {q:'Can I farm aura by saving the same file 500 times?',a:'No. Every move has a daily limit, so aura comes from real work: clearing errors, commits, passing tests and builds.'},
  {q:'How does it know my tests passed?',a:'From VS Code tasks, and from commands you run in VS Code’s terminal (npm test, pytest, go test, cargo test and more) when shell integration is on, which it is by default in VS Code 1.93 and newer.'},
  {q:'Can I turn off losing aura?',a:'Yes. Turn off Roast mode in Settings → Veyra Aura and you only ever gain aura.'},
  {q:'Is my code sent anywhere?',a:'No. Aura only counts what VS Code already sees on your computer, and stores your aura there. Nothing leaves your machine.'},
  {q:'What are the ranks?',a:'NPC (0), Side Character (100), Main Character (300), Locked In (700), Sigma (1,500), Aura Farmer (3,000), Goated (6,000) and Final Boss (10,000). Below zero is Negative Aura.'},
];

export default async function AuraPage(){
  const EXT=await liveExtension(EXT_BASE);
  const app={
    '@context':'https://schema.org','@type':'SoftwareApplication',name:'Veyra Aura',applicationCategory:'DeveloperApplication',
    operatingSystem:'Windows, macOS, Linux',url:absolute('/aura'),image:absolute('/aura-icon.png'),softwareVersion:EXT.version,downloadUrl:EXT.listed?MARKETPLACE:VSIX,
    description:'A free VS Code extension that turns coding into aura points: earn aura for clearing errors, commits and passing tests, rank up from NPC to Final Boss, keep a streak and share an aura card.',
    offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},publisher:{'@type':'Organization',name:'Veyra',url:absolute('/')},
  };
  const faq={'@context':'https://schema.org','@type':'FAQPage',mainEntity:FAQ.map(item=>({'@type':'Question',name:item.q,acceptedAnswer:{'@type':'Answer',text:item.a}}))};

  return <><Nav/><Breadcrumbs items={[{name:'Extensions',path:'/extensions'},{name:'Veyra Aura',path:'/aura'}]}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(app)}}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(faq)}}/>
    <main className="page-shell"><div className="content live-page">
      <section className="live-hero">
        <div className="live-hero-glow" aria-hidden="true"/>
        <div className="live-icon"><Image src="/aura-icon.png" width={148} height={148} alt="Veyra Aura icon" priority/></div>
        <span className="live-kicker"><i/>NEW · FOR VS CODE</span>
        <h1>Veyra <em>Aura</em> ✨</h1>
        <p className="live-tagline">Your coding aura. Farm it, flex it, share it.</p>
        <p className="live-intro">Clear your errors, ship a commit, get your tests green: aura goes up. Leave a “wip” commit message or force-push to main? That’s a minus 💀. Rank up from NPC to Final Boss, keep your 🔥 streak alive, and share your aura card.</p>
        <div className="live-actions">
          {EXT.listed?<a className="primary" href={MARKETPLACE}><Zap size={16}/>Get it for VS Code</a>:<a className="primary" href={VSIX}><Download size={16}/>Download for VS Code</a>}
          <a className="secondary" href="#install"><Zap size={16}/>How to install</a>
        </div>
        <p className="live-micro"><Installs id={EXT.id}/>{EXT.id} · v{EXT.version} · Free · MIT · Windows, macOS, Linux</p>
      </section>

      <section className="pm-shot"><img src="/aura-card.png" alt="An aura card: My code aura 1,150, Locked In, Do not disturb. Seriously., a 7-day streak, +590 this week, and a glowing ring" width={1200} height={630}/></section>

      <section className="content-section">
        <header><span>FEATURES</span><h2>Main character energy, for your code.</h2></header>
        <div className="cards">{FEATURES.map(feature=><article className="card" key={feature.title}><feature.icon/><h3>{feature.title}</h3><p>{feature.copy}</p></article>)}</div>
      </section>

      <section className="content-section">
        <header><span>HOW TO FARM AURA</span><h2>The moves.</h2></header>
        <div className="cards">{MOVES.map(([move,aura])=><article className="card" key={move}><h3>{move}</h3><p><strong>{aura} aura</strong></p></article>)}</div>
        <p className="live-note">Daily limits on every move mean you can’t farm aura by spamming saves. Nice try.</p>
      </section>

      <section className="content-section">
        <header><span>THE AURA PANEL</span><h2>Your rank, your week, every move.</h2></header>
        <p className="live-note">Click the ✨ in the status bar: your aura in a glowing ring, progress to the next rank, your streak, the week as a chart, your best moves, and the full rank ladder.</p>
      </section>
      <section className="pm-shot"><img src="/aura-panel.png" alt="The Aura panel: 1,150 aura in a glowing ring, the Locked In rank with progress to Sigma, a 7-day streak, the week as a bar chart, best moves, a feed of every move and the rank ladder" width={1280} height={1500} loading="lazy"/></section>

      <section className="content-section split" id="install">
        <div>
          <span className="kicker">INSTALL</span>
          <h2>Start farming in a minute.</h2>
          {EXT.listed?<ol className="live-install">
            <li>In VS Code, open <strong>Extensions</strong> (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>) and search for <strong>Veyra Aura</strong>, or open it on the <a href={MARKETPLACE}>Visual Studio Marketplace</a>.</li>
            <li>Click <strong>Install</strong> and start coding. Your aura shows in the status bar.</li>
          </ol>:<ol className="live-install">
            <li><a href={VSIX}>Download the <code>.vsix</code></a> (83 KB).</li>
            <li>In VS Code, press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> and run <strong>Extensions: Install from VSIX…</strong>, then choose the file.</li>
            <li>Start coding. Your aura shows in the status bar; click it for the panel and your aura card.</li>
          </ol>}
          <p className="live-note">More fun with code: <Link href="/garden">Code Garden Veyra</Link> grows a garden as you code, and <Link href="/pets">Veyra Pets</Link> keeps you company. Using IntelliJ IDEA, PyCharm, WebStorm or Android Studio? Get <Link href="/jetbrains/aura">Aura Veyra for JetBrains IDEs</Link>. {EXT.listed?'':'Coming to the Visual Studio Marketplace soon.'}</p>
        </div>
        <div className="visual" aria-label="The ranks">
          <small>The ranks</small>
          <b>🧍 NPC</b> <i>0</i><br/>
          <b>✨ Main Character</b> <i>300</i><br/>
          <b>🗿 Sigma</b> <i>1,500</i><br/>
          <b>🐐 Goated</b> <i>6,000</i><br/>
          <b>👑 Final Boss</b> <i>10,000</i>
        </div>
      </section>

      <section className="content-section">
        <header><span>FAQ</span><h2>Questions</h2></header>
        <div className="live-faq">{FAQ.map(item=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
        <MoreExtensions current="/aura"/>
      </section>

      <ClosingCTA title="Made by the Veyra team." copy="Veyra Studio is a fast, free code editor with Live Server, Python debugging and Search Everywhere built in."/>
    </div></main><Footer/></>;
}
