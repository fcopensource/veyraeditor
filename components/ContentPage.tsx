import Link from 'next/link';
import {Download,Github} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {GITHUB_URL} from '@/lib/site';

/** Shared shell for marketing and documentation pages: navigation, breadcrumb data, heading and footer. */
export function ContentPage({kicker,title,intro,path,crumb,children}:{kicker:string;title:React.ReactNode;intro:React.ReactNode;path:string;crumb:string;children:React.ReactNode}){
  return <><Nav/><Breadcrumbs items={[{name:crumb,path}]}/><main className="page-shell">
    <div className="page-head"><span>{kicker}</span><h1>{title}</h1><p>{intro}</p></div>
    <div className="content">{children}</div>
  </main><Footer/></>;
}

/** Closing "download it" block used at the bottom of content pages. */
export function ClosingCTA({title='Try Veyra today.',copy='Free and open source for Windows, macOS and Linux. Installs in under a minute and keeps itself up to date.'}:{title?:string;copy?:string}){
  return <section className="content-cta">
    <h2>{title}</h2><p>{copy}</p>
    <div><Link className="primary" href="/download"><Download size={16}/>Download Veyra</Link><a className="secondary" href={GITHUB_URL}><Github size={16}/>View on GitHub</a></div>
  </section>;
}
