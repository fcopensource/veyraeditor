import type {Metadata} from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {Cloud,Code2,Download,FilePlus2,FolderTree,Globe,MousePointerClick,ShieldCheck,Zap} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {ClosingCTA} from '@/components/ContentPage';
import {latestRelease} from '@/lib/releases';
import {absolute,jsonLd} from '@/lib/site';
import '../live-server/live-server.css';
import '../port-manager/port-manager.css';
import './salesforce-studio.css';

/** Public downloads and product page; the source is private. */
const REPO='fcopensource/salesforce-studio-releases';
const GITHUB=`https://github.com/${REPO}`;
const RELEASES=`${GITHUB}/releases/latest`;

export const metadata:Metadata={
  title:'Salesforce Studio: a Fast LWC & Apex Editor for Chrome',
  description:'Edit Lightning web components, Aura, Apex and Visualforce right in Chrome or Edge. One click from any Salesforce tab, loads in seconds, Ctrl+S saves. Free.',
  alternates:{canonical:'/salesforce-studio'},
  openGraph:{url:'/salesforce-studio',title:'Salesforce Studio, powered by Veyra',description:'Your org’s code, open in seconds. One click from any Salesforce tab.',images:[{url:'/salesforce-studio-home.png',width:1440,height:860,alt:'Salesforce Studio connected to an org'}]},
};
export const revalidate=300;

const FEATURES=[
  {icon:MousePointerClick,title:'One click from any Salesforce tab',copy:'Click the Studio icon on a Lightning, Setup or Classic page and it opens connected to that org, production or sandbox. No Consumer Key, no OAuth app.'},
  {icon:Zap,title:'Opens in seconds',copy:'Parallel Tooling API queries load every component at once, instead of one slow, queued retrieval of the whole org.'},
  {icon:FolderTree,title:'An explorer you already know',copy:'Lightning Web Components, Aura, Apex classes and triggers, Visualforce pages and components, and message channels, in Lightning Studio’s order.'},
  {icon:FilePlus2,title:'Create anything',copy:'New LWC with master label, isExposed, CSS and SVG files and searchable targets. Triggers with their object and events. Deploy in one step.'},
  {icon:Code2,title:'A real editor',copy:'The Monaco editor with LWC typings, Salesforce snippets, Apex keywords, formatting, tabs and drafts that survive a closed tab.'},
  {icon:Cloud,title:'Save with Ctrl+S',copy:'Saves straight to the org, like Lightning Studio: no validation step, no waiting. LWC, Aura and Visualforce save in place in a second; errors show in the console.'},
];
const TYPES=['Lightning Web Components','Aura Components','Apex Classes','Apex Triggers','Visualforce Pages','Visualforce Components','Lightning Message Channels'];
const FAQ=[
  {q:'Is Salesforce Studio free?',a:'Yes. It is free to use for personal and business work, with no account and no telemetry. It works in Chrome and Edge.'},
  {q:'How does it connect without an OAuth app?',a:'Like Lightning Studio and Salesforce Inspector, it uses the Salesforce sign-in already in your browser. It reads that org’s session cookie and calls the API only on the org’s own my.salesforce.com address. The session is never stored; signing out of Salesforce disconnects Studio.'},
  {q:'What happens when I press Ctrl+S?',a:'The open component is saved straight to your org, like Lightning Studio. LWC, Aura and Visualforce files are saved in place with the Tooling API in about a second. Apex classes and triggers are deployed directly. Any error appears in the console and your edit stays in the editor.'},
  {q:'Why do Apex tests run when I save Apex in production?',a:'Salesforce requires your local Apex tests for every Apex change in a production org, whichever tool you use. LWC, Aura and Visualforce changes never run tests, and in a sandbox no tests run at all.'},
  {q:'Can I review changes before deploying?',a:'Yes. Review changes shows a diff of everything you edited, lets you validate first and choose the Apex test level, and checks whether someone changed the component in the org since you opened it. In production it asks you to type the org name before deploying.'},
  {q:'My org blocks browser sessions for the API. Can I still use it?',a:'Yes. Under Settings, connect with your own OAuth app (authorization code with PKCE) instead.'},
];

export default async function SalesforceStudioPage(){
  const release=await latestRelease(REPO);
  const zip=release?.assets.find(asset=>/^salesforce-studio-.*\.zip$/i.test(asset.name));
  const zipUrl=zip?.browser_download_url||RELEASES;
  const version=release?.version;
  const app={
    '@context':'https://schema.org','@type':'SoftwareApplication',name:'Salesforce Studio',applicationCategory:'DeveloperApplication',
    operatingSystem:'Chrome, Microsoft Edge',url:absolute('/salesforce-studio'),image:absolute('/salesforce-studio-home.png'),
    description:'A browser extension that edits, validates and deploys Lightning web components, Aura, Apex and Visualforce in your Salesforce org.',
    offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},...(version?{softwareVersion:version}:{}),
    publisher:{'@type':'Organization',name:'Veyra Studio',url:absolute('/')},
  };
  const faq={'@context':'https://schema.org','@type':'FAQPage',mainEntity:FAQ.map(item=>({'@type':'Question',name:item.q,acceptedAnswer:{'@type':'Answer',text:item.a}}))};

  return <><Nav/><Breadcrumbs items={[{name:'Extensions',path:'/extensions'},{name:'Salesforce Studio',path:'/salesforce-studio'}]}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(app)}}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(faq)}}/>
    <main className="page-shell"><div className="content live-page">
      <section className="live-hero">
        <div className="live-hero-glow" aria-hidden="true"/>
        <div className="live-icon"><Image src="/salesforce-studio-icon.png" width={148} height={148} alt="Salesforce Studio icon" priority/></div>
        <span className="live-kicker"><i/>VEYRA ORIGINAL · FOR CHROME &amp; EDGE</span>
        <h1>Salesforce <em>Studio</em></h1>
        <p className="live-tagline">Your org’s code, open in seconds.</p>
        <p className="live-intro">Edit Lightning web components, Aura, Apex and Visualforce right in your browser. One click from any Salesforce tab, and Ctrl+S saves straight to your org.</p>
        <div className="live-actions">
          <a className="primary" href={zipUrl}><Download size={16}/>Download for Chrome &amp; Edge</a>
          <a className="secondary" href={`${GITHUB}#readme`}><Code2 size={16}/>Guide &amp; releases</a>
        </div>
        <p className="live-micro">{version?`v${version} · `:''}Free · Chrome and Edge · By Veyra</p>
      </section>

      <section className="pm-shot">
        <img src="/salesforce-studio-home.png" alt="Salesforce Studio connected to a production org: the explorer lists Lightning web components, Aura, Apex and Visualforce with counts, next to quick-create buttons" width={1440} height={860} loading="lazy"/>
      </section>

      <section className="content-section">
        <header><span>FEATURES</span><h2>Everything Lightning Studio does fast, done clean.</h2></header>
        <div className="cards">{FEATURES.map(feature=><article className="card" key={feature.title}><feature.icon/><h3>{feature.title}</h3><p>{feature.copy}</p></article>)}</div>
      </section>

      <section className="content-section split reverse">
        <div>
          <span className="kicker">NEW COMPONENTS</span>
          <h2>Create a component the way Salesforce expects it.</h2>
          <p>Pick a type from <strong>New</strong> and fill in a short form. Studio writes the files and their metadata for you, then deploys in one step.</p>
          <div className="pm-stack">{TYPES.map(name=><span key={name}>{name}</span>)}</div>
        </div>
        <div className="sfs-shot"><img src="/salesforce-studio-new-lwc.png" alt="The New Lightning Web Component form with master label, isExposed, CSS file and a searchable list of targets" width={1440} height={860} loading="lazy"/></div>
      </section>

      <section className="content-section split">
        <div>
          <span className="kicker">SAVE IN A SECOND</span>
          <h2>Ctrl+S. Done.</h2>
          <ul>
            <li><ShieldCheck/><span><strong>Straight to the org.</strong> No validation step and no confirmation: Ctrl+S saves, like Lightning Studio.</span></li>
            <li><ShieldCheck/><span><strong>Clear errors.</strong> A compile error shows in red in the console, and your edit stays put.</span></li>
            <li><ShieldCheck/><span><strong>No surprise test runs.</strong> LWC, Aura and Visualforce never run Apex tests.</span></li>
            <li><ShieldCheck/><span><strong>Review when you want it.</strong> See a diff, validate first, and deploy several components together from Review changes.</span></li>
            <li><ShieldCheck/><span><strong>Nothing stored.</strong> Your Salesforce session is read when needed and never saved.</span></li>
          </ul>
        </div>
        <div className="sfs-shot"><img src="/salesforce-studio-editor.png" alt="Editing a Lightning web component in Salesforce Studio with the explorer open" width={1440} height={860} loading="lazy"/></div>
      </section>

      <section className="content-section split">
        <div>
          <span className="kicker">INSTALL</span>
          <h2>Ready in a minute.</h2>
          <ol className="live-install">
            <li><a href={zipUrl}>Download the zip</a> and unzip it.</li>
            <li>Open <code>chrome://extensions</code> or <code>edge://extensions</code> and turn on <strong>Developer mode</strong>.</li>
            <li>Click <strong>Load unpacked</strong> and choose the unzipped folder.</li>
            <li>Open any Salesforce tab and click the <strong>Salesforce Studio</strong> icon.</li>
          </ol>
          <p className="live-note">Every release is on <a href={RELEASES}>GitHub</a>. To update, load the new folder and click <strong>Reload</strong> on the extension.</p>
        </div>
        <div className="visual" aria-label="Keyboard shortcuts">
          <small>Shortcuts</small>
          <b>Ctrl+S</b> Save to the org<br/>
          <b>Shift+Alt+F</b> Format document<br/>
          <b>Ctrl+Space</b> Suggestions
        </div>
      </section>

      <section className="content-section">
        <header><span>FAQ</span><h2>Questions</h2></header>
        <div className="live-faq">{FAQ.map(item=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
        <p className="live-more"><Globe size={14}/>More from Veyra: <Link href="/live-server">Veyra Live Server</Link>, <Link href="/port-manager">Veyra Port Manager</Link> and <Link href="/extensions">all extensions</Link>.</p>
        <p className="sfs-legal">Salesforce Studio is a product of Veyra / Flightcoders, free to use under its <a href={`${GITHUB}/blob/main/LICENSE`}>License Agreement</a>. It is not affiliated with or endorsed by Salesforce, Inc. Salesforce, Lightning and Visualforce are trademarks of Salesforce, Inc.</p>
      </section>

      <ClosingCTA title="Made by the Veyra team." copy="Veyra Studio is a fast, free code editor with Live Server, Python debugging and Veyra AI built in."/>
    </div></main><Footer/></>;
}
