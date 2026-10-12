import type {Metadata} from 'next';
import {OG_IMAGE} from '@/lib/site';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {ArrowLeft,ArrowRight,Download} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {allPosts,formatDate,getPost} from '@/lib/blog';
import {absolute,jsonLd} from '@/lib/site';

type Params={params:Promise<{slug:string}>};
export const dynamicParams=false;
export function generateStaticParams(){return allPosts().map(post=>({slug:post.slug}));}

export async function generateMetadata({params}:Params):Promise<Metadata>{
  const post=getPost((await params).slug);
  if(!post)return {};
  return {
    title:post.title,description:post.description,
    alternates:{canonical:`/blog/${post.slug}`},
    openGraph:{images:[OG_IMAGE],type:'article',url:`/blog/${post.slug}`,title:post.title,description:post.description,publishedTime:post.date,section:post.category},
  };
}

export default async function BlogPost({params}:Params){
  const post=getPost((await params).slug);
  if(!post)notFound();
  const posts=allPosts();
  const index=posts.findIndex(item=>item.slug===post.slug);
  const newer=posts[index-1],older=posts[index+1];
  const article={'@context':'https://schema.org','@type':'BlogPosting',headline:post.title,description:post.description,datePublished:post.date,dateModified:post.date,
    mainEntityOfPage:absolute(`/blog/${post.slug}`),image:absolute('/opengraph-image'),articleSection:post.category,
    author:{'@type':'Organization',name:'Veyra',url:absolute('/')},publisher:{'@id':absolute('/#organization')}};
  return <><Nav/><Breadcrumbs items={[{name:'Blog',path:'/blog'},{name:post.title,path:`/blog/${post.slug}`}]}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(article)}}/>
    <main className="page-shell">
      <article className="post">
        <header className="post-head">
          <Link href="/blog" className="post-back"><ArrowLeft size={14}/>All articles</Link>
          <span className="post-meta"><em>{post.category}</em>{formatDate(post.date)} · {post.readingTime} min read</span>
          <h1>{post.title}</h1>
          <p>{post.description}</p>
        </header>
        <div className="post-layout">
          {post.headings.length>2&&<nav className="post-toc" aria-label="In this article"><strong>IN THIS ARTICLE</strong>{post.headings.map(h=><a key={h.id} href={`#${h.id}`}>{h.text}</a>)}</nav>}
          <div className="post-body" dangerouslySetInnerHTML={{__html:post.html}}/>
        </div>
        <aside className="post-cta">
          <div><b>Try Veyra free</b><span>Windows, macOS and Linux · 7–11 MB · no telemetry</span></div>
          <Link className="primary" href="/download"><Download size={16}/>Download</Link>
        </aside>
        <nav className="post-nav" aria-label="More articles">
          {older?<Link href={`/blog/${older.slug}`}><small><ArrowLeft size={12}/>Previous</small>{older.title}</Link>:<span/>}
          {newer?<Link href={`/blog/${newer.slug}`} className="next"><small>Next<ArrowRight size={12}/></small>{newer.title}</Link>:<span/>}
        </nav>
      </article>
    </main><Footer/></>;
}
