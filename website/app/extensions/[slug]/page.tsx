import type {Metadata} from 'next';
import {notFound,permanentRedirect} from 'next/navigation';
import {Download,ExternalLink,Zap} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {MoreExtensions} from '@/components/MoreExtensions';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {Installs} from '@/components/Installs';
import {ClosingCTA} from '@/components/ContentPage';
import {getLiveProducts} from '@/lib/catalog';
import {absolute,jsonLd} from '@/lib/site';
import '../../live-server/live-server.css';

/* The automatic page for a Veyra extension that's on the Marketplace but doesn't have a hand-written page here yet.
   Its name, icon, description and version come from the shared catalog, so it appears as soon as it's published. */

export const revalidate = 600;

async function find(slug: string) {
  const {remote} = await getLiveProducts();
  const own = remote.get(`/${slug}`);
  if (own) permanentRedirect(`/${slug}`); // it has its own page
  return remote.get(`/extensions/${slug}`);
}

export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{
  const ext = await find((await params).slug);
  if (!ext) return {title:'Extension not found'};
  return {
    title:`${ext.name}: a free VS Code extension by Veyra`,
    description:ext.line,
    alternates:{canonical:`/extensions/${ext.slug}`},
    openGraph:{url:`/extensions/${ext.slug}`,title:ext.name,description:ext.line,images:[{url:ext.icon,width:256,height:256,alt:`${ext.name} icon`}]},
  };
}

export default async function AutoExtensionPage({params}:{params:Promise<{slug:string}>}){
  const ext = await find((await params).slug);
  if (!ext) notFound();
  const app = {
    '@context':'https://schema.org','@type':'SoftwareApplication',name:ext.name,applicationCategory:'DeveloperApplication',
    operatingSystem:'Windows, macOS, Linux',url:absolute(`/extensions/${ext.slug}`),image:ext.icon,softwareVersion:ext.version??undefined,
    downloadUrl:ext.marketplace,description:ext.line,offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},publisher:{'@type':'Organization',name:'Veyra',url:absolute('/')},
  };
  return <><Nav/><Breadcrumbs items={[{name:'Extensions',path:'/extensions'},{name:ext.name,path:`/extensions/${ext.slug}`}]}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(app)}}/>
    <main className="page-shell"><div className="content live-page">
      <section className="live-hero">
        <div className="live-hero-glow" aria-hidden="true"/>
        {/* eslint-disable-next-line @next/next/no-img-element -- the icon comes from the Marketplace */}
        <div className="live-icon"><img src={ext.icon} width={148} height={148} alt={`${ext.name} icon`}/></div>
        <span className="live-kicker"><i/>{ext.isNew?'NEW · ':''}{ext.platform.toUpperCase()}</span>
        <h1>{ext.name}</h1>
        <p className="live-intro">{ext.line}</p>
        <div className="live-actions">
          <a className="primary" href={ext.marketplace}><Zap size={16}/>Get it for VS Code</a>
          <a className="secondary" href={`vscode:extension/${ext.id}`}><Download size={16}/>Open in VS Code</a>
        </div>
        <p className="live-micro"><Installs id={ext.id}/>{ext.id}{ext.version?` · v${ext.version}`:''} · Free · Windows, macOS, Linux</p>
      </section>

      <section className="content-section split" id="install">
        <div>
          <span className="kicker">INSTALL</span>
          <h2>Ready in a minute.</h2>
          <ol className="live-install">
            <li>In VS Code, open <strong>Extensions</strong> (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>) and search for <strong>{ext.name}</strong>, or open it on the <a href={ext.marketplace}>Visual Studio Marketplace</a>.</li>
            <li>Click <strong>Install</strong>.</li>
          </ol>
          <p className="live-note">Screenshots, settings and the full guide are on its <a href={ext.marketplace}>Marketplace page <ExternalLink size={12}/></a>.</p>
        </div>
      </section>

      <section className="content-section">
        <MoreExtensions current={`/extensions/${ext.slug}`}/>
      </section>
      <ClosingCTA title="Made by the Veyra team." copy="Veyra Studio is a fast, free code editor with Live Server, Python debugging and Search Everywhere built in."/>
    </div></main><Footer/></>;
}
