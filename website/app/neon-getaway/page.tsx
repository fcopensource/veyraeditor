import type {Metadata} from 'next';
import Image from 'next/image';
import {Car,Coins,Download,Gamepad2,Map,Music,ShieldAlert,Siren,Trophy,Zap} from 'lucide-react';
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
import './neon-getaway.css';

const EXT_BASE=VSCODE_EXTENSIONS.neonGetaway;
const MARKETPLACE=marketplaceUrl(EXT_BASE.id), VSIX=vsixUrl(EXT_BASE);

export const metadata:Metadata={
  title:'Neon Getaway: an Open World Driving Game for VS Code',
  description:'A free neon open-world driving game inside VS Code. Take any car, drift through Solara Bay, outrun the cops, pull off missions and races, and spend the in-game cash your coding earns. Offline, no account.',
  keywords:['VS Code game','game for VS Code','open world game','driving game','car game','police chase game','drift game','retro neon game','coffee break game','VS Code extension'],
  alternates:{canonical:'/neon-getaway'},
  openGraph:{url:'/neon-getaway',title:'Neon Getaway: an open-world driving game in VS Code',description:'Steal cars, outrun the cops and drift through a neon city, right inside VS Code. Free.',images:[{url:'/neon-getaway-chase.jpg',width:1600,height:1000,alt:'A four-star police chase at night in Neon Getaway'}]},
};

const FEATURES=[
  {icon:Map,title:'A whole city',copy:'Solara Bay: the towers of Neon Heights, the palms of Palm Shore, the docks and Old Town. Traffic drives its lanes, people walk the sidewalks, and the sea glitters at night.'},
  {icon:Car,title:'Take any car',copy:'Walk up to a car and press E: parked, passing, even a police car if you dare. Four cars to buy at Rico\'s Garage, up to the 250 km/h Hyperion.'},
  {icon:Zap,title:'Drift it',copy:'Arcade handling, and Space for handbrake drifts that leave tyre marks across the junction.'},
  {icon:Siren,title:'Outrun the cops',copy:'Up to five wanted stars. The police hunt you through the streets; get out of sight and they lose you. Stop next to one and you\'re busted.'},
  {icon:Trophy,title:'Jobs to pull off',copy:'Six story jobs for Rico and Nova: a timed delivery, a car to "borrow", a bank getaway, a street race and The Big Score. Plus taxi fares and 20 hidden mixtapes.'},
  {icon:Coins,title:'Your code pays',copy:'Every file you save in VS Code earns $25 of in-game cash, up to $1,000 a day. The status bar shows what\'s waiting.'},
  {icon:Music,title:'A synthwave radio',copy:'Two stations, an engine and sirens, all made live by the game: nothing to download. M turns the sound off.'},
  {icon:Gamepad2,title:'Right in a tab',copy:'Ctrl+Alt+G, or the button in the status bar. Pause any time, close the tab, and your progress is saved.'},
  {icon:ShieldAlert,title:'Free, offline, kind',copy:'No account, no ads, no tracking. No weapons and no gore: people always dive out of the way.'},
];

const CONTROLS:[string,string][]=[['W A S D / arrows','Drive or walk'],['Space','Handbrake: drift'],['E','Get in or out of a car'],['Enter / F','Start a job, garage, spray shop, fares'],['Tab','City map'],['R · M · H','Radio · sound · horn'],['Esc / P','Pause']];

const FAQ=[
  {q:'Is Neon Getaway free?',a:'Yes. It\'s free and MIT licensed, with no account, no ads, no in-app purchases and no tracking. It runs offline inside VS Code.'},
  {q:'How do I start playing?',a:'Install the extension, then press Ctrl+Alt+G (Cmd+Alt+G on a Mac), click Neon Getaway in the status bar, or run "Play Neon Getaway" from the Command Palette. The game opens in its own tab.'},
  {q:'How does my coding earn cash?',a:'Every time you save a file in VS Code you earn $25 of in-game cash, up to $1,000 a day. Saves a few seconds apart count once. The cash waits in the status bar until you play.'},
  {q:'Will it slow down VS Code?',a:'No. The game only runs while its tab is open, it pauses when you switch away, and the whole extension is about 65 KB. In the tab it runs at 60 frames a second.'},
  {q:'Can I play without sound?',a:'Yes. Sound starts only after you press a key in the game, M turns it off, and the neonGetaway.sound setting turns it off for good.'},
  {q:'Is it violent?',a:'No. There are no weapons and no blood. You steal cars and run from the police, and people always jump clear of your car.'},
];

export default async function NeonGetawayPage(){
  const EXT=await liveExtension(EXT_BASE);
  const app={
    '@context':'https://schema.org','@type':'VideoGame',name:'Neon Getaway',genre:['Driving','Open world','Arcade'],gamePlatform:'Visual Studio Code',applicationCategory:'GameApplication',
    operatingSystem:'Windows, macOS, Linux',url:absolute('/neon-getaway'),image:absolute('/neon-getaway-chase.jpg'),softwareVersion:EXT.version,downloadUrl:EXT.listed?MARKETPLACE:VSIX,
    description:'A free open-world driving game inside VS Code: take any car, outrun the police, and pull off jobs in the neon city of Solara Bay.',
    offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},publisher:{'@type':'Organization',name:'FlightCoders',url:'https://flightcoders.com'},
  };
  const faq={'@context':'https://schema.org','@type':'FAQPage',mainEntity:FAQ.map(item=>({'@type':'Question',name:item.q,acceptedAnswer:{'@type':'Answer',text:item.a}}))};

  return <><Nav/><Breadcrumbs items={[{name:'Extensions',path:'/extensions'},{name:'Neon Getaway',path:'/neon-getaway'}]}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(app)}}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(faq)}}/>
    <main className="page-shell"><div className="content live-page ng-page">
      <section className="live-hero">
        <div className="live-hero-glow" aria-hidden="true"/>
        <div className="live-icon"><Image src="/neon-getaway-icon.png" width={148} height={148} alt="Neon Getaway icon: a neon car driving into a synthwave sunset" priority/></div>
        <span className="live-kicker"><i/>NEW · A GAME FOR VS CODE</span>
        <h1>Neon <em>Getaway</em></h1>
        <p className="live-tagline">An open-world driving game, right inside VS Code.</p>
        <p className="live-intro">Take any car, drift through the neon streets of Solara Bay, outrun the cops and pull off the big score. Then get back to work: every file you save earns you cash for your next car.</p>
        <div className="live-actions">
          {EXT.listed?<a className="primary" href={MARKETPLACE}><Gamepad2 size={16}/>Get it for VS Code</a>:<a className="primary" href={VSIX}><Download size={16}/>Download for VS Code</a>}
          <a className="secondary" href="#install"><Zap size={16}/>How to install</a>
        </div>
        <p className="live-micro"><Installs id={EXT.id}/>{EXT.id} · v{EXT.version} · Free · MIT · Offline · Windows, macOS, Linux</p>
      </section>

      <section className="pm-shot"><img src="/neon-getaway-chase.jpg" alt="A four-star police chase at night: a purple sports car at 214 km/h with police cars and flashing lights behind it, the Fresh Coat Spray shop, the minimap, $12,450 and four wanted stars" width={1600} height={1000}/></section>

      <section className="content-section">
        <header><span>THE GAME</span><h2>Steal it. Drift it. Lose the cops.</h2></header>
        <div className="cards">{FEATURES.map(feature=><article className="card" key={feature.title}><feature.icon/><h3>{feature.title}</h3><p>{feature.copy}</p></article>)}</div>
      </section>

      <section className="pm-shot"><img src="/neon-getaway-drift.jpg" alt="Drifting a sports car through a Neon Heights junction, tyre marks behind it, neon-edged rooftops and a helipad, on the Special Delivery job with 1:14 left" width={1600} height={1000} loading="lazy"/></section>

      <section className="content-section split">
        <div>
          <span className="kicker">YOUR CODE PAYS</span>
          <h2>Ship code. Buy a supercar.</h2>
          <p className="live-note">Every file you save in VS Code earns $25 of in-game cash, up to $1,000 a day. The status bar shows what&apos;s waiting: a good day of work buys the Pulse GT, a great week the Hyperion. Saves a few seconds apart (autosave, Save All) count once.</p>
        </div>
        <div className="visual" aria-label="The status bar after a morning of work">
          <small>status bar, after a morning of work</small>
          <b>🚀 +$475</b> <i>▸ Your code earned $475. Click to spend it.</i><br/>
          <b>Pulse GT</b> <i>▸ $1,500</i><br/>
          <b>Vapor S</b> <i>▸ $4,000</i><br/>
          <b>Hyperion</b> <i>▸ $9,000</i>
        </div>
      </section>

      <section className="ng-pair">
        <img src="/neon-getaway-garage.jpg" alt="Rico's Garage: the Hyperion supercar for $9,000, with bars for top speed, acceleration and handling" width={1600} height={1000} loading="lazy"/>
        <img src="/neon-getaway-map.jpg" alt="The Solara Bay map: Neon Heights, Palm Shore, Dockside and Old Town, with Rico's Garage, Police HQ, the spray shop, Solara Savings, the race start and the pier" width={1600} height={1000} loading="lazy"/>
      </section>

      <section className="content-section split" id="install">
        <div>
          <span className="kicker">INSTALL</span>
          <h2>Ready in a minute.</h2>
          {EXT.listed?<ol className="live-install">
            <li>In VS Code, open <strong>Extensions</strong> (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>) and search for <strong>Neon Getaway</strong>, or open it on the <a href={MARKETPLACE}>Visual Studio Marketplace</a>.</li>
            <li>Click <strong>Install</strong>, then press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>G</kbd> to play.</li>
          </ol>:<ol className="live-install">
            <li><a href={VSIX}>Download the <code>.vsix</code></a> (65 KB).</li>
            <li>In VS Code, press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> and run <strong>Extensions: Install from VSIX…</strong>, then choose the file.</li>
            <li>Press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>G</kbd> (<kbd>Cmd</kbd>+<kbd>Alt</kbd>+<kbd>G</kbd> on a Mac) to play.</li>
          </ol>}
          <p className="live-note">{EXT.listed?'':'Coming to the Visual Studio Marketplace and Open VSX soon.'}</p>
        </div>
        <div className="visual ng-keys" aria-label="Controls">
          <small>controls</small>
          {CONTROLS.map(([k,v])=><span key={k}><b>{k}</b> <i>▸ {v}</i><br/></span>)}
        </div>
      </section>

      <section className="content-section">
        <header><span>FAQ</span><h2>Questions</h2></header>
        <div className="live-faq">{FAQ.map(item=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
        <MoreExtensions current="/neon-getaway"/>
      </section>

      <ClosingCTA title="Made by the Veyra team." copy="Veyra Studio is a fast, free code editor with Live Server, Python debugging and Search Everywhere built in."/>
    </div></main><Footer/></>;
}
