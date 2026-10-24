import type {Metadata} from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {BookOpen,Brain,Download,Gauge,GitCompare,Hammer,ListChecks,Lock,Search,ShieldCheck,Sparkles,Stethoscope,Zap} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {MoreExtensions} from '@/components/MoreExtensions';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {ClosingCTA} from '@/components/ContentPage';
import {absolute,jsonLd,marketplaceUrl,VSCODE_EXTENSIONS,vsixUrl} from '@/lib/site';
import '../live-server/live-server.css';
import '../port-manager/port-manager.css';

const EXT=VSCODE_EXTENSIONS.mongodb;
const MARKETPLACE=marketplaceUrl(EXT.id), VSIX=vsixUrl(EXT);

export const metadata:Metadata={
  title:'MongoDB Query Performance in VS Code: Query Lens',
  description:'See how every MongoDB query in your code performs, right above it: full collection scans, in-memory sorts and the index that fixes them, unused indexes and Mongoose schema drift. Free VS Code extension.',
  keywords:['MongoDB','MongoDB VS Code','MongoDB index','MongoDB explain','slow MongoDB query','Mongoose','PyMongo','collection scan','index advisor','MongoDB performance'],
  alternates:{canonical:'/mongodb'},
  openGraph:{url:'/mongodb',title:'Veyra Query Lens for MongoDB',description:'See how every MongoDB query performs, right above your code. Free.',images:[{url:'/mongodb-hero.webp',width:1920,height:960,alt:'Veyra Query Lens for MongoDB'}]},
};

const FEATURES=[
  {icon:Search,title:'A lens above every query',copy:'Documents read vs returned, time, and the index used, from explain() on your development database. Scans and in-memory sorts are flagged.'},
  {icon:Hammer,title:'The index that fixes it',copy:'Suggested with MongoDB’s Equality, Sort, Range rule. Create it in one click and watch the lens turn green.'},
  {icon:Brain,title:'Works on real app code',copy:'Values your code computes at run time are filled with real values from the collection, so you see the plan your app really gets.'},
  {icon:Stethoscope,title:'Index Doctor',copy:'The indexes your code is missing, and the ones nothing uses or that duplicate another, with sizes and use counts.'},
  {icon:GitCompare,title:'Schema drift',copy:'Mongoose schemas compared with real documents: wrong types, missing required fields, and fields Mongoose silently drops.'},
  {icon:ListChecks,title:'Problems and quick fixes',copy:'Slow queries appear in the Problems panel. Ctrl+. creates the index or copies it as code.'},
  {icon:Sparkles,title:'Node.js, Mongoose, Python',copy:'The official driver, Mongoose models from any file, PyMongo and Motor, with sorts, limits and aggregation $match stages.'},
  {icon:Lock,title:'Safe by design',copy:'Explain only, with time limits. Nothing changes unless you confirm, and a read-only mode makes changes impossible.'},
  {icon:Gauge,title:'No setup',copy:'A local MONGODB_URI in .env connects by itself. Connection strings live in VS Code’s secret storage.'},
];
const FAQ=[
  {q:'Is it free?',a:'Yes. Veyra Query Lens is free and MIT licensed, with no account and no telemetry.'},
  {q:'Does it run my queries on the database?',a:'It runs explain("executionStats") for the find() each query makes, which reads documents like the query does, with a time limit. Updates and deletes are never run. Indexes are created or dropped only when you click and confirm.'},
  {q:'Which database should I connect?',a:'A development database, ideally with realistic data: plans depend on the data. On databases that aren’t on your computer, queries are checked only when you click, and you can turn on read-only mode.'},
  {q:'How is it different from MongoDB’s own extension?',a:'MongoDB for VS Code lets you browse data and run queries in playgrounds. Query Lens works on the queries in your application code: it checks each one where it’s written, suggests the index that fixes it, finds unused indexes, and compares Mongoose schemas with your data. They work well side by side.'},
  {q:'What if a query is matched to the wrong collection?',a:'Add a comment like // veyra-collection: orders on the line above it.'},
];

export default function MongoPage(){
  const app={
    '@context':'https://schema.org','@type':'SoftwareApplication',name:'Veyra Query Lens for MongoDB',applicationCategory:'DeveloperApplication',
    operatingSystem:'Windows, macOS, Linux',url:absolute('/mongodb'),image:absolute('/mongodb-icon.png'),softwareVersion:EXT.version,downloadUrl:EXT.listed?MARKETPLACE:VSIX,
    description:'A free VS Code extension that shows how every MongoDB query in your code performs, suggests the index that fixes slow ones, finds unused indexes and checks Mongoose schemas against real data.',
    offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},publisher:{'@type':'Organization',name:'Veyra',url:absolute('/')},
  };
  const faq={'@context':'https://schema.org','@type':'FAQPage',mainEntity:FAQ.map(item=>({'@type':'Question',name:item.q,acceptedAnswer:{'@type':'Answer',text:item.a}}))};

  return <><Nav/><Breadcrumbs items={[{name:'Extensions',path:'/extensions'},{name:'Query Lens for MongoDB',path:'/mongodb'}]}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(app)}}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(faq)}}/>
    <main className="page-shell"><div className="content live-page">
      <section className="live-hero">
        <div className="live-hero-glow" aria-hidden="true"/>
        <div className="live-icon"><Image src="/mongodb-icon.png" width={148} height={148} alt="Veyra Query Lens for MongoDB icon" priority/></div>
        <span className="live-kicker"><i/>NEW · VEYRA ORIGINAL · FOR VS CODE</span>
        <h1>Veyra <em>Query Lens</em> for MongoDB</h1>
        <p className="live-tagline">See how every MongoDB query performs, right above your code.</p>
        <p className="live-intro">Slow queries usually show up in production. Query Lens shows them while you write them: the documents each query reads, the index that fixes it, the indexes nothing uses, and where your Mongoose schemas don&apos;t match your data.</p>
        <div className="live-actions">
          {EXT.listed?<a className="primary" href={MARKETPLACE}><Zap size={16}/>Get it for VS Code</a>:<a className="primary" href={VSIX}><Download size={16}/>Download for VS Code</a>}
          <Link className="secondary" href="/mongodb/docs"><BookOpen size={16}/>Read the guide</Link>
        </div>
        <p className="live-micro">{EXT.id} · v{EXT.version} · Free · MIT · Windows, macOS, Linux</p>
      </section>

      <section className="pm-shot"><img src="/mongodb-lens.webp" alt="Lenses above four MongoDB queries: a full collection scan with a Create index button, two that use an index, and an in-memory sort" width={1600} height={820}/></section>

      <section className="content-section">
        <header><span>FEATURES</span><h2>Find slow MongoDB queries before your users do.</h2></header>
        <div className="cards">{FEATURES.map(feature=><article className="card" key={feature.title}><feature.icon/><h3>{feature.title}</h3><p>{feature.copy}</p></article>)}</div>
      </section>

      <section className="pm-shot"><img src="/mongodb-query.webp" alt="Query details: the verdict, the numbers, the plan, the suggested index and the code to add it in Mongoose, Node.js, Python or mongosh" width={1600} height={1300} loading="lazy"/></section>

      <section className="content-section split reverse">
        <div>
          <span className="kicker">HOW IT WORKS</span>
          <h2>Your code, your data, MongoDB&apos;s own answer.</h2>
          <ul>
            <li><ShieldCheck/><span><strong>Reads your code</strong> for find, aggregate, count and update calls in JavaScript, TypeScript and Python, and works out each collection.</span></li>
            <li><ShieldCheck/><span><strong>Fills in run-time values</strong> with real ones from the collection, so the plan is the one your app gets.</span></li>
            <li><ShieldCheck/><span><strong>Asks MongoDB</strong> with explain(&quot;executionStats&quot;), with a time limit, and reads the plan from both query engines.</span></li>
            <li><ShieldCheck/><span><strong>Explains it in plain words</strong>, with the index that fixes it, and never suggests one you already have.</span></li>
          </ul>
        </div>
        <div className="visual" aria-label="A lens above a query">
          <small>orders.service.ts</small>
          <i>⚠ Full collection scan · 48,210 read → 20 returned</i><br/>
          <b>Order.find(&#123; customerId &#125;)</b><br/>
          <b>  .sort(&#123; createdAt: -1 &#125;)</b><br/>
          <span style={{color:'#5f6d7a'}}>fix:</span> <i>&#123; customerId: 1, createdAt: -1 &#125;</i>
        </div>
      </section>

      <section className="pm-shot"><img src="/mongodb-doctor.webp" alt="Index Doctor: a missing index, an unused index, a duplicate index, every collection's indexes, and Mongoose schemas compared with the data" width={1600} height={1420} loading="lazy"/></section>

      <section className="pm-shot"><img src="/mongodb-schema.webp" alt="A Mongoose schema with underlined fields, and problems where documents don't match it" width={1600} height={860} loading="lazy"/></section>

      <section className="content-section split" id="install">
        <div>
          <span className="kicker">INSTALL</span>
          <h2>Ready in a minute.</h2>
          {EXT.listed?<ol className="live-install">
            <li>In VS Code, open <strong>Extensions</strong> (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>) and search for <strong>Veyra Query Lens</strong>, or open it on the <a href={MARKETPLACE}>Visual Studio Marketplace</a>.</li>
            <li>Open a project that uses MongoDB, with a development database running.</li>
          </ol>:<ol className="live-install">
            <li><a href={VSIX}>Download the <code>.vsix</code></a> (395 KB).</li>
            <li>In VS Code, press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> and run <strong>Extensions: Install from VSIX…</strong>, then choose the file.</li>
            <li>Open a project that uses MongoDB. With <code>MONGODB_URI</code> in <code>.env</code> it connects by itself; otherwise run <strong>MongoDB Lens: Connect to MongoDB…</strong>.</li>
          </ol>}
          <p className="live-note">Everything is explained in the <Link href="/mongodb/docs">User Guide</Link>, which also ships inside the extension. {EXT.listed?'':'Coming to the Visual Studio Marketplace soon.'}</p>
        </div>
        <div className="visual" aria-label="Commands">
          <small>Command Palette</small>
          <b>MongoDB Lens: Connect to MongoDB…</b><br/>
          <b>MongoDB Lens: Check All Queries</b><br/>
          <b>MongoDB Lens: Open Index Doctor</b><br/>
          <b>MongoDB Lens: Check Schema Against Data</b><br/>
          <b>MongoDB Lens: Open User Guide</b>
        </div>
      </section>

      <section className="content-section">
        <header><span>FAQ</span><h2>Questions</h2></header>
        <div className="live-faq">{FAQ.map(item=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
        <MoreExtensions current="/mongodb"/>
        <p className="live-note" style={{marginTop:12}}>MongoDB is a trademark of MongoDB, Inc. Veyra Query Lens is an independent extension and is not made or endorsed by MongoDB, Inc.</p>
      </section>

      <ClosingCTA title="Made by the Veyra team." copy="Veyra Studio is a fast, free code editor with Live Server, Python debugging and Veyra AI built in."/>
    </div></main><Footer/></>;
}
