import type {Metadata} from 'next';
import Link from 'next/link';
import {ArrowRight,Download,Puzzle} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {getLiveProducts} from '@/lib/catalog';
import {JETBRAINS_IDES,JETBRAINS_PLUGINS} from '@/lib/jetbrains';
import {absolute,jsonLd} from '@/lib/site';
import './jetbrains.css';

export const metadata:Metadata={
  title:'Veyra Plugins for JetBrains IDEs: IntelliJ IDEA, WebStorm, PyCharm and more',
  description:'Free plugins for IntelliJ IDEA, WebStorm, PyCharm, GoLand, Rider, Android Studio and every JetBrains IDE, by the team behind Veyra Studio.',
  keywords:['jetbrains plugins','intellij plugin','webstorm plugin','pycharm plugin','free jetbrains plugin'],
  alternates:{canonical:'/jetbrains'},
  openGraph:{url:'/jetbrains',title:'Veyra for JetBrains IDEs',description:'Free plugins for IntelliJ IDEA, WebStorm, PyCharm and every JetBrains IDE.'},
};

/** Every Veyra plugin for JetBrains IDEs. */
export default async function JetBrainsHub(){
  const {extensions}=await getLiveProducts();
  const list={'@context':'https://schema.org','@type':'ItemList',name:'Veyra plugins for JetBrains IDEs',itemListElement:JETBRAINS_PLUGINS.map((p,i)=>({'@type':'ListItem',position:i+1,url:absolute(`/jetbrains/${p.slug}`),name:p.name}))};
  const latest=JETBRAINS_PLUGINS[0];
  return <><Nav/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(list)}}/>
    <main className="jb">
      <section className="jb-hero">
        <div className="jb-fields" aria-hidden="true"><i/><i/><i/><i/></div>
        <div className="jb-wrap">
          <span className="jb-kicker"><b/>Veyra for JetBrains IDEs</span>
          <h1>Plugins for the IDE <span>you already love.</span></h1>
          <p>Free, focused plugins for IntelliJ IDEA, WebStorm, PyCharm and every JetBrains IDE, built and tested by the team behind Veyra Studio and {extensions.length} VS Code extensions.</p>
          <div className="jb-ctas">
            {latest&&<Link className="jb-btn primary" href={`/jetbrains/${latest.slug}`}><Puzzle/>Explore {latest.name}</Link>}
            <a className="jb-btn ghost" href="#install"><Download/>How to install a plugin</a>
          </div>
          <div className="jb-ides" aria-label="Works in">{JETBRAINS_IDES.map(ide=><span key={ide}>{ide}</span>)}</div>
        </div>
      </section>

      <section className="jb-section">
        <div className="jb-wrap">
          <header className="jb-head">
            <div><small>THE PLUGINS</small><h2>{JETBRAINS_PLUGINS.length} plugin{JETBRAINS_PLUGINS.length===1?'':'s'}. More on the way.</h2></div>
            <p>Each one is tested on Windows, macOS and Linux, and checked against the IDE versions JetBrains recommends.</p>
          </header>
          <div className="jb-grid">
            {JETBRAINS_PLUGINS.map(p=><Link key={p.slug} className="jb-card" href={`/jetbrains/${p.slug}`}>
              <div className="jb-card-top">
                {/* eslint-disable-next-line @next/next/no-img-element -- the plugin's own SVG icon */}
                <img src={p.icon} alt=""/>
                <div><h3>{p.name}</h3></div>
              </div>
              <p>{p.summary}</p>
              <div className="jb-meta">
                <span>v{p.version}</span><span>{p.since}+</span><span>Free · MIT</span>
                {p.marketplace?<span className="live">On JetBrains Marketplace</span>:<span className="soon">Marketplace review</span>}
              </div>
              <span className="go">See the plugin<ArrowRight/></span>
            </Link>)}
            <div className="jb-next"><b>Next plugin: coming soon</b><span>Tell us which tool you miss in your JetBrains IDE: <Link href="/flightcoders">talk to the team</Link>.</span></div>
          </div>
        </div>
      </section>

      <section className="jb-section" id="install">
        <div className="jb-wrap">
          <header className="jb-head"><div><small>INSTALL</small><h2>Ready in a minute.</h2></div><p>Until a plugin is approved on JetBrains Marketplace, install it from its .zip. Approved plugins install and update from Settings → Plugins.</p></header>
          <ol className="jb-steps">
            <li><b>Download</b> the plugin’s <code>.zip</code> from its page. Don’t unzip it.</li>
            <li>Open <b>Settings</b> (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>S</kbd>, on macOS <kbd>⌘</kbd>+<kbd>,</kbd>) → <b>Plugins</b>.</li>
            <li>Click the <b>⚙ gear</b> → <b>Install Plugin from Disk…</b> and choose the <code>.zip</code>.</li>
            <li><b>Restart</b> the IDE if it asks. That’s it.</li>
          </ol>
        </div>
      </section>
    </main><Footer/></>;
}
