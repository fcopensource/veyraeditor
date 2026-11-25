import type {Metadata} from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {AlertTriangle,Binary,Copy,Download,FileUp,Github,Lock,Palette,Route,Search,ShieldCheck,TreePine,Zap} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {ClosingCTA} from '@/components/ContentPage';
import {absolute,jsonLd} from '@/lib/site';
import '../live-server/live-server.css';
import '../port-manager/port-manager.css';

/** Set this to the Chrome Web Store link once the extension is published; until then the page offers the zip. */
const CHROME_STORE_URL='';
const VERSION='1.0.0';
const ZIP=`https://github.com/fcopensource/veyraeditor/raw/main/browser/json-viewer/release/json-viewer-veyra-${VERSION}.zip`;
const SOURCE='https://github.com/fcopensource/veyraeditor/tree/main/browser/json-viewer';

export const metadata:Metadata={
  title:'JSON Viewer for Chrome: Readable, Searchable JSON, Exact Numbers',
  description:'A free Chrome extension that shows JSON as a clear, searchable tree. Exact big numbers, the path of every value, broken JSON explained with line numbers, raw and original views. Private: nothing is sent anywhere.',
  keywords:['json viewer','chrome json viewer','json formatter','json formatter chrome','view json in browser','pretty print json','json tree viewer','json path','chrome extension'],
  alternates:{canonical:'/json-viewer'},
  openGraph:{url:'/json-viewer',title:'JSON Viewer Veyra for Chrome',description:'JSON as a clear, searchable tree. Exact numbers. Private.',images:[{url:'/json-viewer-tree.png',width:1280,height:800,alt:'The JSON Viewer tree in Chrome with a value selected and its path shown'}]},
};

const FEATURES=[
  {icon:TreePine,title:'A tree you can read',copy:'Open and close any level, with a count of keys and items. Small files open fully; big ones show 200 items at a time, so a 10 MB response stays fast.'},
  {icon:Binary,title:'Exact numbers',copy:'Long IDs like 9007199254740993123 and prices like 19.90 are shown exactly as sent. Most viewers round them without telling you.'},
  {icon:Route,title:'The path of every value',copy:'Click a value to see $.items[0].price. Copy the path for your code, or copy the value.'},
  {icon:Search,title:'Search everything',copy:'Keys and values, case-insensitive. Enter and Shift+Enter step through the matches; Ctrl+F jumps to the box.'},
  {icon:AlertTriangle,title:'Mistakes, explained',copy:'Broken JSON shows the line and column, highlights the line, and says what’s wrong in plain words, like an extra comma before }.'},
  {icon:Copy,title:'Raw, original, copy, download',copy:'A coloured raw view with 2 spaces, 4 spaces, tabs or one line, the text exactly as sent, and one-click copy or download.'},
  {icon:FileUp,title:'Paste or open a file',copy:'Click the toolbar button to paste JSON or open a .json file, and get the same viewer.'},
  {icon:Palette,title:'Dark, light or automatic',copy:'Follows your system, or pick one. Your view, indent and theme are remembered.'},
  {icon:Lock,title:'Private by design',copy:'No network requests, no analytics, no account. JSON is shown as text only, so a document can never run code through the viewer.'},
];
const FAQ=[
  {q:'Is it free?',a:'Yes. JSON Viewer Veyra is free and open source under the MIT license, with no ads, no account and no tracking.'},
  {q:'Which pages does it change?',a:'Only pages that are JSON: a JSON content type such as application/json, or plain text that is valid JSON. Web pages are never touched.'},
  {q:'Why does it need access to the pages I open?',a:'JSON can come from any website or API, so the extension checks each page’s content type. On anything that isn’t JSON it stops immediately and reads nothing.'},
  {q:'What does “exact numbers” mean?',a:'JavaScript can only hold numbers up to about 16 digits exactly, so many viewers show 9007199254740993123 as 9007199254740993000, and 19.90 as 19.9. This viewer shows every number exactly as the server sent it.'},
  {q:'Does it work with big files?',a:'Yes. It draws only what you open, 200 items at a time, so responses of many megabytes stay quick to scroll and search.'},
  {q:'Does it work in Edge, Brave and other browsers?',a:'Yes, in any Chromium browser: Chrome, Edge, Brave, Opera, Vivaldi and Arc.'},
];

export default function JsonViewerPage(){
  const published=!!CHROME_STORE_URL;
  const app={
    '@context':'https://schema.org','@type':'SoftwareApplication',name:'JSON Viewer Veyra',applicationCategory:'BrowserApplication',
    operatingSystem:'Chrome, Edge, Brave and other Chromium browsers',url:absolute('/json-viewer'),image:absolute('/json-viewer-icon.png'),softwareVersion:VERSION,
    downloadUrl:published?CHROME_STORE_URL:ZIP,license:'https://opensource.org/licenses/MIT',
    description:'A free Chrome extension that shows JSON as a clear, searchable tree, with exact numbers and the path of every value.',
    offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},publisher:{'@type':'Organization',name:'FlightCoders',url:'https://flightcoders.com'},
  };
  const faq={'@context':'https://schema.org','@type':'FAQPage',mainEntity:FAQ.map(item=>({'@type':'Question',name:item.q,acceptedAnswer:{'@type':'Answer',text:item.a}}))};

  return <><Nav/><Breadcrumbs items={[{name:'JSON Viewer',path:'/json-viewer'}]}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(app)}}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(faq)}}/>
    <main className="page-shell"><div className="content live-page">
      <section className="live-hero">
        <div className="live-hero-glow" aria-hidden="true"/>
        <div className="live-icon"><Image src="/json-viewer-icon.png" width={148} height={148} alt="JSON Viewer Veyra icon" priority/></div>
        <span className="live-kicker"><i/>NEW · FOR CHROME</span>
        <h1>JSON Viewer <em>Veyra</em></h1>
        <p className="live-tagline">JSON as a clear, searchable tree.</p>
        <p className="live-intro">Open any JSON in Chrome and read it as a tree, with exact numbers, the path of every value, search, and broken JSON explained line by line. Private: nothing is sent anywhere.</p>
        <div className="live-actions">
          {published?<a className="primary" href={CHROME_STORE_URL}><Zap size={16}/>Add to Chrome</a>:<a className="primary" href={ZIP}><Download size={16}/>Download for Chrome</a>}
          <a className="secondary" href="#install"><Zap size={16}/>How to install</a>
        </div>
        <p className="live-micro">v{VERSION} · Free · MIT · Chrome, Edge, Brave · 32 KB · No tracking</p>
      </section>

      <section className="pm-shot"><img src="/json-viewer-tree.png" alt="The JSON Viewer tree in Chrome: an order with customer, items and shipping, the tracking value selected and its path $.shipping.tracking shown" width={1280} height={800}/></section>

      <section className="content-section">
        <header><span>FEATURES</span><h2>Read JSON like it was meant to be read.</h2></header>
        <div className="cards">{FEATURES.map(feature=><article className="card" key={feature.title}><feature.icon/><h3>{feature.title}</h3><p>{feature.copy}</p></article>)}</div>
      </section>

      <section className="pm-shot"><img src="/json-viewer-error.png" alt="Broken JSON: the message says there's an extra comma before the closing brace on line 7, and line 7 is highlighted" width={1280} height={800} loading="lazy"/></section>

      <section className="content-section split" id="install">
        <div>
          <span className="kicker">INSTALL</span>
          <h2>Ready in a minute.</h2>
          {published?<ol className="live-install">
            <li>Open it in the <a href={CHROME_STORE_URL}>Chrome Web Store</a> and click <strong>Add to Chrome</strong>.</li>
            <li>Open any JSON, like an API response. That&apos;s it.</li>
          </ol>:<ol className="live-install">
            <li><a href={ZIP}>Download the zip</a> (32 KB) and unzip it.</li>
            <li>Open <code>chrome://extensions</code> and turn on <strong>Developer mode</strong> (top right).</li>
            <li>Click <strong>Load unpacked</strong> and choose the unzipped folder. Then open any JSON.</li>
          </ol>}
          <p className="live-note">{published?'':'Coming to the Chrome Web Store soon. '}The source is <a href={SOURCE}><Github size={13} style={{verticalAlign:'-2px'}}/> on GitHub</a>, and the <Link href="/json-viewer/privacy">privacy policy</Link> is one page: nothing is collected. For JSON in your editor, try <Link href="/api-client">API Client Veyra</Link> for VS Code.</p>
        </div>
        <div className="visual" aria-label="Shortcuts">
          <small>In the viewer</small>
          <b>Ctrl+F</b> <i>search</i><br/>
          <b>Enter</b> <i>next match</i><br/>
          <b>← →</b> <i>close / open</i><br/>
          <b>click</b> <i>see the path</i>
        </div>
      </section>

      <section className="content-section">
        <header><span>FAQ</span><h2>Questions</h2></header>
        <div className="live-faq">{FAQ.map(item=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
        <p className="live-note" style={{marginTop:18}}><ShieldCheck size={14} style={{verticalAlign:'-2px'}}/> Chrome is a trademark of Google LLC. JSON Viewer Veyra is an independent extension, not made or endorsed by Google.</p>
      </section>

      <ClosingCTA title="Made by the Veyra team." copy="Veyra Studio is a fast, free code editor with Live Server, Python debugging and Search Everywhere built in."/>
    </div></main><Footer/></>;
}
