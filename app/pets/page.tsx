import type {Metadata} from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {CircleDot,Cloud,Download,Heart,Moon,PartyPopper,PawPrint,Save,Sparkles,TriangleAlert,Zap} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {ClosingCTA} from '@/components/ContentPage';
import {absolute,jsonLd,marketplaceUrl,VSCODE_EXTENSIONS,vsixUrl} from '@/lib/site';
import '../live-server/live-server.css';
import '../port-manager/port-manager.css';

const EXT=VSCODE_EXTENSIONS.pets;
const MARKETPLACE=marketplaceUrl(EXT.id), VSIX=vsixUrl(EXT);

export const metadata:Metadata={
  title:'VS Code Pets: A Cat, Dog, Fox, Bunny or Panda in Your Editor',
  description:'Cute pets that live in VS Code: they walk, nap, chase a ball, and cheer when you save and fix your errors. A cat, dog, fox, bunny or panda, drawn from scratch. Free.',
  keywords:['vscode pets','VS Code pets','pet extension','cat in VS Code','coding pet','cute VS Code extension','fun VS Code extension'],
  alternates:{canonical:'/pets'},
  openGraph:{url:'/pets',title:'Pets Veyra',description:'A little friend for your coding day. Free for VS Code.',images:[{url:'/pets-hero.webp',width:1920,height:960,alt:'A cat, dog, fox and bunny playing in VS Code'}]},
};

const FEATURES=[
  {icon:PawPrint,title:'Five pets, many colours',copy:'Cats, dogs, foxes, bunnies and a panda, in fourteen colours. Name them whatever you like.'},
  {icon:Heart,title:'Pet them',copy:'Click a pet and it hops with little hearts. Hover to see its name.'},
  {icon:CircleDot,title:'Play ball',copy:'Click the sky to drop a ball, or drag to throw it, and watch everyone race for it.'},
  {icon:Save,title:'A hop when you save',copy:'Every save gets a happy little jump and a sparkle.'},
  {icon:TriangleAlert,title:'Worried by errors',copy:'New errors? Your pets sit down and look worried, with a little “!” above them.'},
  {icon:PartyPopper,title:'A party when they’re fixed',copy:'Fix the last error and everyone jumps for joy in a shower of stars.'},
  {icon:Moon,title:'Naps while you’re away',copy:'After a while without typing they curl up and sleep, and wake when you’re back.'},
  {icon:Cloud,title:'Four places to live',copy:'A sunny meadow with drifting clouds, a starry night, the beach, or your theme’s own colours.'},
  {icon:Sparkles,title:'Light and private',copy:'They only move while you can see them, and nothing is sent anywhere.'},
];
const FAQ=[
  {q:'Is it free?',a:'Yes. Pets Veyra is free and MIT licensed, with no account and no telemetry.'},
  {q:'Where do the pets live?',a:'In the Pets view at the bottom of the Explorer. Open them in a bigger panel from the view’s ⋯ menu, where they grow to fit.'},
  {q:'Do they slow VS Code down?',a:'No. They are drawn on one small canvas, and they only move while you can see them.'},
  {q:'Can I turn off the reactions to my code?',a:'Yes. Set veyraPets.reactToCode to false and they just play.'},
  {q:'Is it the same as the VS Code Pets extension?',a:'It is an independent extension. Every pet is drawn from scratch, and they react to your saves and errors.'},
];

export default function PetsPage(){
  const app={
    '@context':'https://schema.org','@type':'SoftwareApplication',name:'Pets Veyra',applicationCategory:'GameApplication',
    operatingSystem:'Windows, macOS, Linux',url:absolute('/pets'),image:absolute('/pets-icon.png'),softwareVersion:EXT.version,downloadUrl:EXT.listed?MARKETPLACE:VSIX,
    description:'A free VS Code extension with cute pets that play, nap and react to your coding.',
    offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},publisher:{'@type':'Organization',name:'Veyra',url:absolute('/')},
  };
  const faq={'@context':'https://schema.org','@type':'FAQPage',mainEntity:FAQ.map(item=>({'@type':'Question',name:item.q,acceptedAnswer:{'@type':'Answer',text:item.a}}))};

  return <><Nav/><Breadcrumbs items={[{name:'Extensions',path:'/extensions'},{name:'Pets Veyra',path:'/pets'}]}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(app)}}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(faq)}}/>
    <main className="page-shell"><div className="content live-page">
      <section className="live-hero">
        <div className="live-hero-glow" aria-hidden="true"/>
        <div className="live-icon"><Image src="/pets-icon.png" width={148} height={148} alt="Pets Veyra icon" priority/></div>
        <span className="live-kicker"><i/>NEW · FOR VS CODE</span>
        <h1>Pets <em>Veyra</em></h1>
        <p className="live-tagline">A little friend for your coding day.</p>
        <p className="live-intro">A cat, dog, fox, bunny or panda lives in your editor. They play ball, take naps, and cheer you on: a hop when you save, a worried look at new errors, and a party when you fix the last one.</p>
        <div className="live-actions">
          {EXT.listed?<a className="primary" href={MARKETPLACE}><Zap size={16}/>Get it for VS Code</a>:<a className="primary" href={VSIX}><Download size={16}/>Download for VS Code</a>}
          <a className="secondary" href="#install"><Zap size={16}/>How to install</a>
        </div>
        <p className="live-micro">{EXT.id} · v{EXT.version} · Free · MIT · Windows, macOS, Linux</p>
      </section>

      <section className="pm-shot"><img src="/pets-vscode.webp" alt="VS Code with a cat, dog, fox and bunny on a sunny meadow, in the Explorer and a bigger panel" width={1400} height={800}/></section>

      <section className="content-section">
        <header><span>FEATURES</span><h2>They play. They nap. They cheer you on.</h2></header>
        <div className="cards">{FEATURES.map(feature=><article className="card" key={feature.title}><feature.icon/><h3>{feature.title}</h3><p>{feature.copy}</p></article>)}</div>
      </section>

      <section className="pm-shot"><img src="/pets-night.webp" alt="A bunny, a sleeping dog, a fox and a cat under a starry night sky" width={1040} height={596} loading="lazy"/></section>

      <section className="content-section split" id="install">
        <div>
          <span className="kicker">INSTALL</span>
          <h2>Ready in a minute.</h2>
          {EXT.listed?<ol className="live-install">
            <li>In VS Code, open <strong>Extensions</strong> (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>) and search for <strong>Pets Veyra</strong>, or open it on the <a href={MARKETPLACE}>Visual Studio Marketplace</a>.</li>
            <li>Click <strong>Install</strong> and say hello to Mochi in the Explorer.</li>
          </ol>:<ol className="live-install">
            <li><a href={VSIX}>Download the <code>.vsix</code></a> (32 KB).</li>
            <li>In VS Code, press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> and run <strong>Extensions: Install from VSIX…</strong>, then choose the file.</li>
            <li>Open the <strong>Pets</strong> view at the bottom of the Explorer and say hello to Mochi.</li>
          </ol>}
          <p className="live-note">Add more friends with <strong>Pets Veyra: Add a Pet</strong>. {EXT.listed?'':'Coming to the Visual Studio Marketplace soon.'}</p>
        </div>
        <div className="visual" aria-label="Your pets react">
          <small>When you…</small>
          <b>save a file</b> <i>a happy hop</i><br/>
          <b>add an error</b> <i>a worried “!”</i><br/>
          <b>fix the last one</b> <i>a party of stars</i><br/>
          <b>step away</b> <i>a little nap</i>
        </div>
      </section>

      <section className="content-section">
        <header><span>FAQ</span><h2>Questions</h2></header>
        <div className="live-faq">{FAQ.map(item=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
        <p className="live-more"><Sparkles size={14}/>More for VS Code: <Link href="/error-lens">Error Lens Veyra</Link>, <Link href="/todo-tree">Todo Tree Veyra</Link>, <Link href="/auto-rename-tag">Auto Rename Tag Veyra</Link> and <Link href="/git-graph">Git Graph Veyra</Link>.</p>
      </section>

      <ClosingCTA title="Made by the Veyra team." copy="Veyra Studio is a fast, free code editor with Live Server, Python debugging and Veyra AI built in."/>
    </div></main><Footer/></>;
}
