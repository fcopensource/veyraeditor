import type {Metadata} from 'next';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {ArrowLeft,Download,ExternalLink,Github} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {JETBRAINS_IDES,JETBRAINS_PLUGINS,jetbrainsPlugin} from '@/lib/jetbrains';
import {absolute,jsonLd} from '@/lib/site';
import '../jetbrains.css';

export const dynamicParams=false;
export function generateStaticParams(){return JETBRAINS_PLUGINS.map(p=>({slug:p.slug}));}

export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{
  const p=jetbrainsPlugin((await params).slug);
  if(!p) return {};
  return {
    title:`${p.name} for JetBrains IDEs`,
    description:`${p.summary} For ${JETBRAINS_IDES.slice(0,6).join(', ')} and every JetBrains IDE, version ${p.since} or newer. Free.`,
    alternates:{canonical:`/jetbrains/${p.slug}`},
    openGraph:{url:`/jetbrains/${p.slug}`,title:`${p.name} for JetBrains IDEs`,description:p.tagline},
  };
}

/** One JetBrains plugin: what it does, the download (or its Marketplace page), and how to install it. */
export default async function JetBrainsPluginPage({params}:{params:Promise<{slug:string}>}){
  const p=jetbrainsPlugin((await params).slug);
  if(!p) notFound();
  const app={
    '@context':'https://schema.org','@type':'SoftwareApplication',name:p.name,applicationCategory:'DeveloperApplication',
    operatingSystem:'Windows, macOS, Linux',url:absolute(`/jetbrains/${p.slug}`),image:absolute(p.icon),softwareVersion:p.version,
    downloadUrl:p.marketplace??absolute(p.file),description:p.summary,offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},
    publisher:{'@type':'Organization',name:'Veyra',url:absolute('/')},
  };
  return <><Nav/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(app)}}/>
    <main className="jb">
      <section className="jb-hero">
        <div className="jb-fields" aria-hidden="true"><i/><i/><i/><i/></div>
        <div className="jb-wrap">
          <p style={{margin:'0 0 22px'}}><Link href="/jetbrains" className="jb-btn ghost" style={{padding:'8px 14px',fontSize:13.5}}><ArrowLeft/>All JetBrains plugins</Link></p>
          <div className="jb-plugin-hero">
            {/* eslint-disable-next-line @next/next/no-img-element -- the plugin's own SVG icon */}
            <img src={p.icon} alt={`${p.name} icon`}/>
            <div>
              <span className="jb-kicker"><b/>For JetBrains IDEs · {p.since}+</span>
              <h1>{p.name.replace(/ Veyra$/,'')} <span>Veyra</span></h1>
            </div>
          </div>
          <p><b>{p.tagline}</b> {p.summary}</p>
          <div className="jb-ctas">
            {p.marketplace
              ?<><a className="jb-btn primary" href={p.marketplace}><ExternalLink/>Get it on JetBrains Marketplace</a><a className="jb-btn ghost" href={p.file} download><Download/>Download the .zip</a></>
              :<a className="jb-btn primary" href={p.file} download><Download/>Download the plugin (.zip, {p.size})</a>}
            <a className="jb-btn ghost" href={p.source}><Github/>Source code</a>
          </div>
          <div className="jb-ides" aria-label="Works in">{JETBRAINS_IDES.map(ide=><span key={ide}>{ide}</span>)}</div>
        </div>
      </section>

      <section className="jb-section">
        <div className="jb-wrap">
          <header className="jb-head"><div><small>FEATURES</small><h2>What it does.</h2></div><p>Version {p.version} · Free · MIT · Windows, macOS and Linux</p></header>
          <div className="jb-features">{p.features.map(f=><article key={f.title}><h3>{f.title}</h3><p>{f.copy}</p></article>)}</div>
        </div>
      </section>

      <section className="jb-section" id="install">
        <div className="jb-wrap">
          <header className="jb-head"><div><small>INSTALL</small><h2>Ready in a minute.</h2></div>
            <p>{p.marketplace?'Install it from JetBrains Marketplace in Settings → Plugins, or from the .zip:':'Coming to JetBrains Marketplace soon. Until then, install it from the .zip:'}</p></header>
          <ol className="jb-steps">
            <li><a href={p.file} download><b>Download</b> the <code>.zip</code></a> ({p.size}). Don’t unzip it.</li>
            <li>Open <b>Settings</b> (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>S</kbd>, on macOS <kbd>⌘</kbd>+<kbd>,</kbd>) → <b>Plugins</b>.</li>
            <li>Click the <b>⚙ gear</b> → <b>Install Plugin from Disk…</b> and choose the <code>.zip</code>.</li>
            <li><b>Restart</b> the IDE if it asks.</li>
          </ol>
          <header className="jb-head" style={{marginTop:56}}><div><small>WHERE TO FIND IT</small><h2>In your IDE.</h2></div></header>
          <ul className="jb-where">{p.where.map(w=><li key={w}>{w}</li>)}</ul>
          {p.slug==='port-manager'&&<p className="jb-note">Using VS Code too? The same idea for VS Code, Cursor and VSCodium: <Link href="/port-manager">Veyra Port Manager for VS Code</Link>.</p>}
        </div>
      </section>
    </main><Footer/></>;
}
