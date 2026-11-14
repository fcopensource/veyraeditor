import type {Metadata} from 'next';
import Image from 'next/image';
import {BookOpen,Camera,Droplets,Download,Flame,Flower2,GitCommitHorizontal,Moon,ShieldCheck,Sprout,Zap} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {MoreExtensions} from '@/components/MoreExtensions';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {Installs} from '@/components/Installs';
import {ClosingCTA} from '@/components/ContentPage';
import {absolute,jsonLd,marketplaceUrl,VSCODE_EXTENSIONS,vsixUrl} from '@/lib/site';
import '../live-server/live-server.css';
import '../port-manager/port-manager.css';

const EXT=VSCODE_EXTENSIONS.garden;
const MARKETPLACE=marketplaceUrl(EXT.id), VSIX=vsixUrl(EXT);

export const metadata:Metadata={
  title:'Code Garden for VS Code: Your Coding Grows a Garden',
  description:'A free VS Code extension where your coding grows a living garden. Saving waters it, commits make flowers bloom, fixing errors brings butterflies, and coding streaks unlock rare plants. Nine to collect.',
  keywords:['vscode garden','code garden','fun VS Code extension','coding streak','gamify coding','VS Code productivity game','cozy VS Code extension'],
  alternates:{canonical:'/garden'},
  openGraph:{url:'/garden',title:'Code Garden Veyra',description:'Your coding grows a garden. Free for VS Code.',images:[{url:'/garden-hero.webp',width:1520,height:760,alt:'A sunny code garden with a daisy, tulip, lavender, a cherry blossom tree and glowing mushrooms'}]},
};

const FEATURES=[
  {icon:Sprout,title:'It grows while you code',copy:'Every minute you’re typing helps your plants grow: seed, sprout, leaves, bud and bloom. A new seed sprouts every 20 minutes.'},
  {icon:Droplets,title:'Saving waters it',copy:'Watered soil grows plants at full speed. Leave it a day and they droop, but nothing ever dies. One save and it rains.'},
  {icon:Zap,title:'Butterflies for fixes',copy:'Fix your last error and butterflies flutter in, and every plant gets a boost.'},
  {icon:GitCommitHorizontal,title:'Commits make flowers bloom',copy:'Every commit makes your most grown plant burst into flower.'},
  {icon:Flame,title:'Streaks unlock rare plants',copy:'Nine species to collect, from the daisy to the golden Veyra Bloom for a 30-day streak.'},
  {icon:BookOpen,title:'A collection to fill',copy:'When the garden is full, the oldest bloom is pressed into your collection to make room.'},
  {icon:Moon,title:'Day and night',copy:'Sunrise, clouds and bees by day; stars, fireflies and glowing mushrooms at night, following your clock.'},
  {icon:Camera,title:'Share your garden',copy:'Save a picture of your garden with your streak underneath, ready for X, LinkedIn or the team chat.'},
  {icon:ShieldCheck,title:'Private and light',copy:'It never reads your code and never connects to the internet. About 60 KB, and it syncs with Settings Sync.'},
];
const PLANTS=[
  ['🌼','Daisy','Your first flower'],['🌷','Tulip','Code on 2 days in a row'],['🌻','Sunflower','Code for 3 hours in total'],
  ['💜','Lavender','Save 100 times'],['🌵','Cactus','Fix 10 errors'],['🍄','Glow Mushroom','Code for an hour after 10 pm'],
  ['🌹','Rose','Make 15 commits'],['🌸','Cherry Blossom','Code on 7 days in a row'],['✨','Veyra Bloom','A 30-day streak, or 40 pressed flowers'],
];
const FAQ=[
  {q:'Is it free?',a:'Yes. Code Garden is free and MIT licensed, with no account and no telemetry.'},
  {q:'What counts as coding?',a:'A minute in which you typed in a file while VS Code was focused. Reading, idle time and typing in the terminal don’t count.'},
  {q:'Can my plants die?',a:'No. A dry garden droops and grows at half speed, and the next save waters it again. A garden you forget for a month is still there when you come back.'},
  {q:'Does it read my code?',a:'No. It only counts minutes, saves, the moment your errors reach zero, and commits from VS Code’s built-in Git. Nothing is sent anywhere.'},
  {q:'Where is it?',a:'In the Code Garden view at the bottom of the Explorer, with your streak in the status bar. You can also open it in a bigger panel.'},
  {q:'Does it work in Cursor and VSCodium?',a:'Yes, it’s a regular VS Code extension: install the .vsix with “Extensions: Install from VSIX…”.'},
];

export default function GardenPage(){
  const app={
    '@context':'https://schema.org','@type':'SoftwareApplication',name:'Code Garden Veyra',applicationCategory:'GameApplication',
    operatingSystem:'Windows, macOS, Linux',url:absolute('/garden'),image:absolute('/garden-icon.png'),softwareVersion:EXT.version,downloadUrl:EXT.listed?MARKETPLACE:VSIX,
    description:'A free VS Code extension where your coding grows a living garden: saves water it, commits make flowers bloom, and streaks unlock rare plants.',
    offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},publisher:{'@type':'Organization',name:'Veyra',url:absolute('/')},
  };
  const faq={'@context':'https://schema.org','@type':'FAQPage',mainEntity:FAQ.map(item=>({'@type':'Question',name:item.q,acceptedAnswer:{'@type':'Answer',text:item.a}}))};

  return <><Nav/><Breadcrumbs items={[{name:'Extensions',path:'/extensions'},{name:'Code Garden Veyra',path:'/garden'}]}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(app)}}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(faq)}}/>
    <main className="page-shell"><div className="content live-page">
      <section className="live-hero">
        <div className="live-hero-glow" aria-hidden="true"/>
        <div className="live-icon"><Image src="/garden-icon.png" width={148} height={148} alt="Code Garden Veyra icon" priority/></div>
        <span className="live-kicker"><i/>NEW · FOR VS CODE</span>
        <h1>Code Garden <em>Veyra</em></h1>
        <p className="live-tagline">Your coding grows a garden.</p>
        <p className="live-intro">A little garden lives in your editor and grows while you work. Saving waters it, fixing your last error brings butterflies, every commit makes a flower bloom, and coding streaks unlock rare plants to collect.</p>
        <div className="live-actions">
          {EXT.listed?<a className="primary" href={MARKETPLACE}><Zap size={16}/>Get it for VS Code</a>:<a className="primary" href={VSIX}><Download size={16}/>Download for VS Code</a>}
          <a className="secondary" href="#install"><Zap size={16}/>How to install</a>
        </div>
        <p className="live-micro"><Installs id={EXT.id}/>{EXT.id} · v{EXT.version} · Free · MIT · Windows, macOS, Linux</p>
      </section>

      <section className="pm-shot"><img src="/garden-hero.webp" alt="A sunny code garden: a daisy, tulip, sunflower bud, lavender, a cherry blossom tree and glowing mushrooms in front of a wooden fence" width={1520} height={760}/></section>

      <section className="content-section">
        <header><span>FEATURES</span><h2>Steady work, made visible.</h2></header>
        <div className="cards">{FEATURES.map(feature=><article className="card" key={feature.title}><feature.icon/><h3>{feature.title}</h3><p>{feature.copy}</p></article>)}</div>
      </section>

      <section className="pm-shot"><img src="/garden-night.webp" alt="The garden at night: every species in bloom under the moon and stars, with fireflies and glowing mushrooms" width={1520} height={760} loading="lazy"/></section>

      <section className="content-section">
        <header><span>COLLECT ALL NINE</span><h2>Every plant has a story.</h2></header>
        <div className="cards">{PLANTS.map(([emoji,name,how])=><article className="card" key={name}><Flower2 aria-hidden="true"/><h3>{emoji} {name}</h3><p>{how}</p></article>)}</div>
      </section>

      <section className="pm-shot"><img src="/garden-butterflies.webp" alt="Butterflies over the garden with a banner: Bug fixed! Butterflies are here" width={1520} height={760} loading="lazy"/></section>

      <section className="content-section split" id="install">
        <div>
          <span className="kicker">INSTALL</span>
          <h2>Plant your first seed.</h2>
          {EXT.listed?<ol className="live-install">
            <li>In VS Code, open <strong>Extensions</strong> (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>) and search for <strong>Code Garden Veyra</strong>, or open it on the <a href={MARKETPLACE}>Visual Studio Marketplace</a>.</li>
            <li>Click <strong>Install</strong>. Your first daisy seed is already in the soil, at the bottom of the Explorer.</li>
          </ol>:<ol className="live-install">
            <li><a href={VSIX}>Download the <code>.vsix</code></a> (62 KB).</li>
            <li>In VS Code, press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> and run <strong>Extensions: Install from VSIX…</strong>, then choose the file.</li>
            <li>Open the <strong>Code Garden</strong> view at the bottom of the Explorer. Your first daisy seed is already in the soil.</li>
          </ol>}
          <p className="live-note">Share your garden with <strong>Code Garden: Save a Snapshot to Share…</strong>. {EXT.listed?'':'Coming to the Visual Studio Marketplace soon.'}</p>
        </div>
        <div className="visual" aria-label="What your coding does">
          <small>When you…</small>
          <b>code</b> <i>plants grow</i><br/>
          <b>save</b> <i>the soil is watered</i><br/>
          <b>fix the last error</b> <i>butterflies</i><br/>
          <b>commit</b> <i>a flower blooms</i>
        </div>
      </section>

      <section className="pm-shot"><img src="/garden-snapshot.webp" alt="A saved snapshot of a code garden with the caption: My Code Garden, 12-day streak, 5 in bloom" width={1040} height={692} loading="lazy"/></section>

      <section className="content-section">
        <header><span>FAQ</span><h2>Questions</h2></header>
        <div className="live-faq">{FAQ.map(item=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
        <MoreExtensions current="/garden"/>
      </section>

      <ClosingCTA title="Made by the Veyra team." copy="Veyra Studio is a fast, free code editor with Live Server, Python debugging and Search Everywhere built in."/>
    </div></main><Footer/></>;
}
