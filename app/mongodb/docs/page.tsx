import type {Metadata} from 'next';
import Link from 'next/link';
import {ArrowLeft,Download} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {getGuide} from '@/lib/guide';
import {absolute,jsonLd,VSCODE_EXTENSIONS,vsixUrl,marketplaceUrl} from '@/lib/site';

export const metadata:Metadata={
  title:'Query Lens for MongoDB: User Guide',
  description:'How Veyra Query Lens for MongoDB works: connecting, reading the lens, index suggestions, supported Node.js, Mongoose and Python code, Index Doctor, schema drift, safety, settings and troubleshooting.',
  alternates:{canonical:'/mongodb/docs'},
  openGraph:{url:'/mongodb/docs',title:'Query Lens for MongoDB: User Guide',images:[{url:'/mongodb-hero.webp',width:1920,height:960,alt:'Veyra Query Lens for MongoDB'}]},
};

export default function MongoDocs(){
  const guide=getGuide('mongodb',{'../README.md':'/mongodb'});
  const ext=VSCODE_EXTENSIONS.mongodb;
  const article={'@context':'https://schema.org','@type':'TechArticle',headline:'Veyra Query Lens for MongoDB: User Guide',description:metadata.description,url:absolute('/mongodb/docs'),wordCount:guide.words,inLanguage:'en',
    about:{'@type':'SoftwareApplication',name:'Veyra Query Lens for MongoDB',url:absolute('/mongodb')},author:{'@type':'Organization',name:'Veyra',url:absolute('/')}};
  return <><Nav/><Breadcrumbs items={[{name:'Extensions',path:'/extensions'},{name:'Query Lens for MongoDB',path:'/mongodb'},{name:'User Guide',path:'/mongodb/docs'}]}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(article)}}/>
    <main className="page-shell">
      <article className="post">
        <header className="post-head">
          <Link href="/mongodb" className="post-back"><ArrowLeft size={14}/>Query Lens for MongoDB</Link>
          <span className="post-meta"><em>User Guide</em> · v{ext.version} · {Math.max(1,Math.round(guide.words/230))} min read</span>
          <h1>Query Lens for MongoDB: User Guide</h1>
          <p>Everything Query Lens does and how it works. The same guide ships inside the extension: run <strong>MongoDB Lens: Open User Guide</strong>.</p>
        </header>
        <div className="post-layout">
          <nav className="post-toc" aria-label="In this guide"><strong>IN THIS GUIDE</strong>{guide.headings.map(h=><a key={h.id} href={`#${h.id}`}>{h.text}</a>)}</nav>
          <div className="post-body" dangerouslySetInnerHTML={{__html:guide.html}}/>
        </div>
        <aside className="post-cta">
          <div><b>Veyra Query Lens for MongoDB</b><span>Free for VS Code · Node.js, Mongoose and Python</span></div>
          <a className="primary" href={ext.listed?marketplaceUrl(ext.id):vsixUrl(ext)}><Download size={16}/>{ext.listed?'Get it for VS Code':'Download for VS Code'}</a>
        </aside>
      </article>
    </main><Footer/></>;
}
