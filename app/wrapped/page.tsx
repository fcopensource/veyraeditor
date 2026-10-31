import type {Metadata} from 'next';
import Image from 'next/image';
import {BarChart3,Bug,Building2,CalendarDays,Clock,Download,Flame,GitCommitHorizontal,Languages,Lock,Moon,Rocket,Scissors,Share2,Sunrise,Users,Zap} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {MoreExtensions} from '@/components/MoreExtensions';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {ClosingCTA} from '@/components/ContentPage';
import {absolute,jsonLd,marketplaceUrl,VSCODE_EXTENSIONS,vsixUrl} from '@/lib/site';
import '../live-server/live-server.css';
import '../port-manager/port-manager.css';
import './wrapped.css';

const EXT=VSCODE_EXTENSIONS.wrapped;
const MARKETPLACE=marketplaceUrl(EXT.id), VSIX=vsixUrl(EXT);

export const metadata:Metadata={
  title:'Veyra Wrapped: Your Year in Code, for VS Code',
  description:'Your Git history as a story to share: commits, lines written, your coding hours, longest streak, top languages, favourite words and your coding personality. Save a card for X or LinkedIn. Free, private VS Code extension.',
  keywords:['git wrapped','code wrapped','year in code','developer year in review','git stats','commit stats','coding stats','VS Code extension','spotify wrapped for developers'],
  alternates:{canonical:'/wrapped'},
  openGraph:{url:'/wrapped',title:'Veyra Wrapped: your year in code',description:'Your Git history as a story to share, with your coding personality. Free for VS Code.',images:[{url:'/wrapped-card.webp',width:1200,height:630,alt:'A Veyra Wrapped share card: 130 commits, 62k lines added, peak hour 10 PM, The Night Owl'}]},
};

const FEATURES=[
  {icon:GitCommitHorizontal,title:'Commits and active days',copy:'How much you shipped, on how many days, and your pace on a day you code.'},
  {icon:BarChart3,title:'Lines you really wrote',copy:'Added and removed, with lockfiles, builds and minified files left out.'},
  {icon:Clock,title:'Your coding hours',copy:'A 24-hour clock of your commits, in your own timezone, with your peak hour.'},
  {icon:CalendarDays,title:'Days and streaks',copy:'Your favourite day to ship, your weekend share, your longest streak and busiest day.'},
  {icon:Languages,title:'Languages and files',copy:'Your top languages, and the files you couldn’t stop editing.'},
  {icon:Share2,title:'A card to share',copy:'Save or copy a sharp 2400 × 1260 card for X, LinkedIn or Slack.'},
  {icon:Users,title:'Just you, or the team',copy:'Your own commits, or the whole team’s year with the people behind it.'},
  {icon:Zap,title:'Plays like a story',copy:'Tap or press → to skip, ← to go back. Numbers count up as each slide appears.'},
  {icon:Lock,title:'Private',copy:'Your own Git on your own computer. Nothing is uploaded, no account, no telemetry.'},
];
const PERSONAS=[
  {icon:Moon,title:'The Night Owl',copy:'Your best ideas arrive after dark, and so do your commits.'},
  {icon:Sunrise,title:'The Early Bird',copy:'You ship before most people have had their coffee.'},
  {icon:CalendarDays,title:'The Weekend Warrior',copy:'Saturdays and Sundays are for building.'},
  {icon:Scissors,title:'The Refactorer',copy:'You leave code smaller and cleaner than you found it.'},
  {icon:Bug,title:'The Bug Hunter',copy:'No bug survives long once you are on its trail.'},
  {icon:Flame,title:'The Marathoner',copy:'Day after day without a break.'},
  {icon:Building2,title:'The Architect',copy:'You build big: whole systems, file after file.'},
  {icon:Rocket,title:'The Steady Shipper',copy:'Calm, consistent and always moving forward.'},
];
const FAQ=[
  {q:'Is it free?',a:'Yes. Veyra Wrapped is free and MIT licensed, with no account and no telemetry.'},
  {q:'Does it upload my code or history?',a:'No. It reads your history with the Git already on your computer, and the story and card are made in VS Code. Nothing leaves your machine.'},
  {q:'Which commits count as mine?',a:'The ones made with the name or email Git uses for you, even if Git guessed them. Run Show the Team’s Year in Code to include everyone.'},
  {q:'Can I wrap more than this year?',a:'Yes. Choose this year, the last 12 months or all time each time you open it, or set veyraWrapped.period to skip the question.'},
  {q:'How is my coding personality chosen?',a:'From your numbers: when you commit, how often at weekends, how much you remove compared with what you add, how many commits fix bugs, your longest streak and how much you build. The trait that stands out most wins.'},
  {q:'Why don’t my lockfiles count?',a:'Files people don’t write by hand, such as package-lock.json, builds, minified files and source maps, would drown out your real work, so they are left out of lines and languages.'},
];

export default function WrappedPage(){
  const app={
    '@context':'https://schema.org','@type':'SoftwareApplication',name:'Veyra Wrapped',applicationCategory:'DeveloperApplication',
    operatingSystem:'Windows, macOS, Linux',url:absolute('/wrapped'),image:absolute('/wrapped-icon.png'),softwareVersion:EXT.version,downloadUrl:EXT.listed?MARKETPLACE:VSIX,
    description:'A free VS Code extension that turns your Git history into a story to share, with your coding personality and a share card.',
    offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},publisher:{'@type':'Organization',name:'Veyra',url:absolute('/')},
  };
  const faq={'@context':'https://schema.org','@type':'FAQPage',mainEntity:FAQ.map(item=>({'@type':'Question',name:item.q,acceptedAnswer:{'@type':'Answer',text:item.a}}))};

  return <><Nav/><Breadcrumbs items={[{name:'Extensions',path:'/extensions'},{name:'Veyra Wrapped',path:'/wrapped'}]}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(app)}}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(faq)}}/>
    <main className="page-shell"><div className="content live-page">
      <section className="live-hero">
        <div className="live-hero-glow" aria-hidden="true"/>
        <div className="live-icon"><Image src="/wrapped-icon.png" width={148} height={148} alt="Veyra Wrapped icon" priority/></div>
        <span className="live-kicker"><i/>NEW · FOR VS CODE</span>
        <h1 className="wr-title">Your year <em>in code.</em></h1>
        <p className="live-tagline">Your Git history, told as a story you’ll want to share.</p>
        <p className="live-intro">How many commits you made, how many lines you wrote, the hour your code comes alive, your longest streak, your top languages and your coding personality. Then save a card for X or LinkedIn.</p>
        <div className="live-actions">
          {EXT.listed?<a className="primary" href={MARKETPLACE}><Zap size={16}/>Get it for VS Code</a>:<a className="primary" href={VSIX}><Download size={16}/>Download for VS Code</a>}
          <a className="secondary" href="#install"><Zap size={16}/>How to install</a>
        </div>
        <p className="live-micro">{EXT.id} · v{EXT.version} · Free · MIT · Windows, macOS, Linux</p>
      </section>

      <div className="wr-card"><img src="/wrapped-card.webp" alt="A Veyra Wrapped share card: 130 commits, 62.0k lines added, 24 active days, an 8-day streak, peak hour 10 PM, TypeScript, The Night Owl" width={1200} height={630}/></div>
      <p className="wr-caption">A real card, made from the Veyra repository’s own history.</p>

      <section className="content-section">
        <header><span>THE STORY</span><h2>Slide by slide, like your phone’s stories.</h2></header>
        <div className="wr-slides">
          <figure><img src="/wrapped-commits.webp" alt="A slide: You made 130 commits on 24 days of coding" width={1280} height={800} loading="lazy"/><figcaption>Your commits, counting up</figcaption></figure>
          <figure><img src="/wrapped-hours.webp" alt="A slide: a 24-hour clock of commits with the peak at 10 PM" width={1280} height={800} loading="lazy"/><figcaption>The hour your code comes alive</figcaption></figure>
          <figure><img src="/wrapped-personality.webp" alt="A slide revealing the coding personality: The Night Owl" width={1280} height={800} loading="lazy"/><figcaption>Your coding personality, revealed</figcaption></figure>
        </div>
      </section>

      <section className="content-section">
        <header><span>WHAT’S INSIDE</span><h2>Everything your history says about you.</h2></header>
        <div className="cards">{FEATURES.map(feature=><article className="card" key={feature.title}><feature.icon/><h3>{feature.title}</h3><p>{feature.copy}</p></article>)}</div>
      </section>

      <section className="content-section">
        <header><span>EIGHT PERSONALITIES</span><h2>Which one are you?</h2></header>
        <div className="wr-personas">{PERSONAS.map(p=><article className="wr-persona" key={p.title}><span><p.icon/></span><h3>{p.title}</h3><p>{p.copy}</p></article>)}</div>
      </section>

      <section className="content-section split" id="install">
        <div>
          <span className="kicker">INSTALL</span>
          <h2>Your story in a minute.</h2>
          {EXT.listed?<ol className="live-install">
            <li>In VS Code, open <strong>Extensions</strong> (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>) and search for <strong>Veyra Wrapped</strong>, or open it on the <a href={MARKETPLACE}>Visual Studio Marketplace</a>.</li>
            <li>Open a repository and run <strong>Veyra Wrapped: Show My Year in Code</strong>.</li>
          </ol>:<ol className="live-install">
            <li><a href={VSIX}>Download the <code>.vsix</code></a> (46 KB).</li>
            <li>In VS Code, press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> and run <strong>Extensions: Install from VSIX…</strong>, then choose the file.</li>
            <li>Open a repository and run <strong>Veyra Wrapped: Show My Year in Code</strong>, or click ✨ in Source Control.</li>
          </ol>}
          <p className="live-note">Share your card with <strong>#VeyraWrapped</strong>. {EXT.listed?'':'Coming to the Visual Studio Marketplace soon.'}</p>
        </div>
        <div className="visual" aria-label="Periods">
          <small>Wrap</small>
          <b>This year</b> <i>since 1 January</i><br/>
          <b>12 months</b> <i>a rolling year</i><br/>
          <b>All time</b> <i>every commit</i><br/>
          <b>The team</b> <i>everyone’s work</i>
        </div>
      </section>

      <section className="content-section">
        <header><span>FAQ</span><h2>Questions</h2></header>
        <div className="live-faq">{FAQ.map(item=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
        <MoreExtensions current="/wrapped"/>
      </section>

      <ClosingCTA title="Made by the Veyra team." copy="Veyra Studio is a fast, free code editor with Live Server, Python debugging and Veyra AI built in."/>
    </div></main><Footer/></>;
}
