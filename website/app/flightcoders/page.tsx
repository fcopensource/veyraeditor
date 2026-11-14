import type {Metadata} from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {AppWindow,ArrowRight,Blocks,Cloud,Code2,Gauge,Globe,LockKeyhole,MessagesSquare,Puzzle,Rocket,ShieldCheck,Wrench} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {LeadForm} from '@/components/LeadForm';
import {EXTENSIONS} from '@/lib/products';
import {absolute,jsonLd,OG_IMAGE} from '@/lib/site';
import '../live-server/live-server.css';
import './flightcoders.css';

export const metadata:Metadata={
  title:'FlightCoders: Custom VS Code Extensions, Desktop Apps & Developer Tools',
  description:'FlightCoders, the team behind Veyra Studio, builds VS Code and JetBrains extensions, desktop apps, browser extensions, web apps and Salesforce solutions. Tell us about your project.',
  keywords:['hire VS Code extension developer','custom VS Code extension','JetBrains plugin development','Tauri desktop app development','browser extension development','Salesforce developer','developer tools agency','FlightCoders'],
  alternates:{canonical:'/flightcoders'},
  openGraph:{url:'/flightcoders',title:'FlightCoders: we build developer tools people use',description:'VS Code extensions, desktop apps, browser extensions and web apps, from the team behind Veyra Studio.',images:[OG_IMAGE]},
};

const SERVICES=[
  {icon:Puzzle,title:'VS Code & JetBrains extensions',copy:'Language support, linters, panels, webviews, debuggers and integrations, published and maintained on the Marketplace and Open VSX.'},
  {icon:AppWindow,title:'Desktop apps',copy:'Fast native apps for Windows, macOS and Linux with Tauri and Rust: small installers, signed auto-updates, Microsoft Store listings.'},
  {icon:Globe,title:'Web apps & websites',copy:'Next.js and React products, dashboards and marketing sites that load fast and rank, with accounts, payments and admin.'},
  {icon:Blocks,title:'Browser extensions',copy:'Chrome, Edge and Firefox extensions, from idea to store review, with the permissions and privacy reviewers expect.'},
  {icon:Cloud,title:'Salesforce development',copy:'Lightning Web Components, Apex, integrations and developer tooling for Salesforce teams.'},
  {icon:Wrench,title:'Developer tooling & automation',copy:'CI pipelines, release automation, internal CLIs and the tooling that makes your team faster.'},
];
const WORK=[
  {href:'/download',icon:'/veyra-96.png',title:'Veyra Studio',kind:'Desktop app · Rust + Tauri',copy:'A lightweight code editor for Windows, macOS and Linux, with signed auto-updates and a Microsoft Store listing.'},
  {href:'/extensions',icon:'/live-server-icon-296.png',title:`${EXTENSIONS.length} VS Code extensions`,kind:'Extensions · Marketplace & Open VSX',copy:'Live Server, Rewind, Error Lens, Container Studio, Query Lens and more, each tested in real VS Code.'},
  {href:'/salesforce-studio',icon:'/salesforce-studio-icon.png',title:'Salesforce Studio',kind:'Browser extension · Chrome & Firefox',copy:'LWC, Apex and Aura editing in the browser, saved straight to your org.'},
  {href:'/pdf',icon:'/veyra-96.png',title:'Veyra PDF',kind:'Windows app · Microsoft Store',copy:'Edit, sign, merge and organise PDFs offline.'},
  {href:'/baazcyber',icon:'/baazcyber-logo.png',title:'BaazCyber Antivirus',kind:'Security app · Windows',copy:'A modern antivirus with real-time protection and a clean, fast interface.'},
];
const STEPS=[
  {title:'Tell us',copy:'Send the form. We reply within one business day with questions, not a sales script.'},
  {title:'Plan',copy:'A short call, then a written scope with milestones, a fixed quote and a timeline.'},
  {title:'Build',copy:'Weekly demos you can click, with tested code from the first milestone.'},
  {title:'Launch',copy:'We publish to the stores, set up updates, and stay around for fixes.'},
];
const FAQ=[
  {q:'How much does a project cost?',a:'It depends on scope. After a short call we send a fixed quote with milestones, so you know the price before we start.'},
  {q:'Do I own the code?',a:'Yes. Once the project is paid, the code and the published listings are yours.'},
  {q:'Can you publish to the VS Code Marketplace, Microsoft Store or Chrome Web Store?',a:'Yes. We publish our own products to all of them, so we handle packaging, signing, store review and updates for you.'},
  {q:'Do you work with startups and solo founders?',a:'Yes. Many great developer tools start with one person and an idea. Tell us what you have in mind, however early.'},
];

export default function FlightCodersPage(){
  const org={
    '@context':'https://schema.org','@type':'ProfessionalService',name:'FlightCoders',url:absolute('/flightcoders'),image:absolute('/veyra-96.png'),
    description:'FlightCoders builds VS Code and JetBrains extensions, desktop apps, browser extensions, web apps and Salesforce solutions.',
    areaServed:'Worldwide',knowsAbout:['VS Code extensions','JetBrains plugins','Tauri','Rust','React','Next.js','Browser extensions','Salesforce'],
    makesOffer:SERVICES.map(s=>({'@type':'Offer',itemOffered:{'@type':'Service',name:s.title,description:s.copy}})),
  };
  const faq={'@context':'https://schema.org','@type':'FAQPage',mainEntity:FAQ.map(item=>({'@type':'Question',name:item.q,acceptedAnswer:{'@type':'Answer',text:item.a}}))};
  return <><Nav/><Breadcrumbs items={[{name:'FlightCoders',path:'/flightcoders'}]}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(org)}}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(faq)}}/>
    <main className="page-shell fc-page">
      <section className="fc-hero">
        <div className="fc-glow" aria-hidden="true"/>
        <span className="fc-kicker"><i/>FLIGHTCODERS · THE TEAM BEHIND VEYRA</span>
        <h1>We build the tools <em>developers love.</em></h1>
        <p>VS Code extensions, desktop apps, browser extensions and web apps, built by the people who ship Veyra Studio and {EXTENSIONS.length} extensions of their own. Tell us what you need; we reply within one business day.</p>
        <div className="fc-actions"><a className="fc-primary" href="#start">Start a project<ArrowRight size={17}/></a><a className="fc-secondary" href="#work">See our work</a></div>
        <ul className="fc-proof">
          <li><Rocket size={15}/>Products live on the VS Code Marketplace, Microsoft Store, Chrome &amp; Firefox stores</li>
          <li><ShieldCheck size={15}/>Fixed quotes, weekly demos, you own the code</li>
        </ul>
      </section>

      <section className="fc-section">
        <header><span>WHAT WE BUILD</span><h2>From idea to store listing.</h2></header>
        <div className="fc-services">{SERVICES.map(s=><article key={s.title}><s.icon size={22}/><h3>{s.title}</h3><p>{s.copy}</p></article>)}</div>
      </section>

      <section className="fc-section" id="work">
        <header><span>OUR WORK</span><h2>Shipped, used and maintained by us.</h2><p>Everything here is ours: designed, built, tested and published by FlightCoders.</p></header>
        <div className="fc-work">{WORK.map(w=><Link key={w.title} href={w.href} className="fc-work-card">
          <Image src={w.icon} width={52} height={52} alt=""/><div><small>{w.kind}</small><h3>{w.title}</h3><p>{w.copy}</p></div><ArrowRight size={16} className="fc-arrow"/>
        </Link>)}</div>
      </section>

      <section className="fc-section">
        <header><span>HOW WE WORK</span><h2>Clear steps, no surprises.</h2></header>
        <ol className="fc-steps">{STEPS.map((s,i)=><li key={s.title}><b>0{i+1}</b><h3>{s.title}</h3><p>{s.copy}</p></li>)}</ol>
        <div className="fc-why">
          <div><Gauge size={18}/><b>Fast by default</b><span>Small, quick software is our signature: Veyra Studio's installers are 7–12 MB.</span></div>
          <div><Code2 size={18}/><b>Tested code</b><span>Automated tests and CI on every project, like our own products.</span></div>
          <div><LockKeyhole size={18}/><b>Private and secure</b><span>NDAs welcome. Your code and data stay yours.</span></div>
          <div><MessagesSquare size={18}/><b>Direct contact</b><span>You talk to the developers building your product.</span></div>
        </div>
      </section>

      <section className="fc-start" id="start">
        <div className="fc-start-copy">
          <span>START A PROJECT</span>
          <h2>Tell us what you want to build.</h2>
          <p>A few lines are enough. We&apos;ll reply within one business day with questions or a first plan.</p>
          <ul><li>Free first consultation</li><li>Fixed quote before any work starts</li><li>You own the code</li></ul>
        </div>
        <LeadForm/>
      </section>

      <section className="fc-section">
        <header><span>FAQ</span><h2>Questions</h2></header>
        <div className="live-faq">{FAQ.map(item=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
      </section>
    </main><Footer/></>;
}
