import type {Metadata} from 'next';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {ArrowLeft,ArrowRight,Download} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {allPosts,formatDate,getPost,relatedPosts} from '@/lib/blog';
import {absolute,jsonLd} from '@/lib/site';

type Params={params:Promise<{slug:string}>};
export const dynamicParams=false;
export function generateStaticParams(){return allPosts().map(post=>({slug:post.slug}));}

export async function generateMetadata({params}:Params):Promise<Metadata>{
  const post=getPost((await params).slug);
  if(!post)return {};
  return {
    title:post.title,description:post.description,...(post.keywords.length?{keywords:post.keywords}:{}),
    alternates:{canonical:`/blog/${post.slug}`},
    // The share image is this post's own opengraph-image.tsx, with its title.
    openGraph:{type:'article',url:`/blog/${post.slug}`,title:post.title,description:post.description,publishedTime:post.date,modifiedTime:post.updated,section:post.category,tags:post.keywords},
    twitter:{card:'summary_large_image',title:post.title,description:post.description},
  };
}

export default async function BlogPost({params}:Params){
  const post=getPost((await params).slug);
  if(!post)notFound();
  const posts=allPosts();
  const index=posts.findIndex(item=>item.slug===post.slug);
  const newer=posts[index-1],older=posts[index+1];
  const article={'@context':'https://schema.org','@type':'BlogPosting',headline:post.title,description:post.description,datePublished:post.date,dateModified:post.updated,
    mainEntityOfPage:absolute(`/blog/${post.slug}`),image:absolute(`/blog/${post.slug}/opengraph-image`),articleSection:post.category,
    ...(post.keywords.length?{keywords:post.keywords.join(', ')}:{}),wordCount:post.html.replace(/<[^>]+>/g,' ').split(/\s+/).filter(Boolean).length,inLanguage:'en',
    author:{'@type':'Organization',name:'Veyra',url:absolute('/')},publisher:{'@id':absolute('/#organization')}};
  return <><Nav/><Breadcrumbs items={[{name:'Blog',path:'/blog'},{name:post.title,path:`/blog/${post.slug}`}]}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(article)}}/>
    <main className="page-shell">
      <article className="post">
        <header className="post-head">
          <Link href="/blog" className="post-back"><ArrowLeft size={14}/>All articles</Link>
          <span className="post-meta"><em>{post.category}</em><time dateTime={post.date}>{formatDate(post.date)}</time>{post.updated!==post.date&&<> · Updated <time dateTime={post.updated}>{formatDate(post.updated)}</time></>} · {post.readingTime} min read</span>
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
        <section className="post-related" aria-label="Related articles">
          <h2>Keep reading</h2>
          <div>{relatedPosts(post).map(item=><Link key={item.slug} href={`/blog/${item.slug}`}><em>{item.category}</em><b>{item.title}</b><span>{item.description}</span></Link>)}</div>
        </section>
        <nav className="post-nav" aria-label="More articles">
          {older?<Link href={`/blog/${older.slug}`}><small><ArrowLeft size={12}/>Previous</small>{older.title}</Link>:<span/>}
          {newer?<Link href={`/blog/${newer.slug}`} className="next"><small>Next<ArrowRight size={12}/></small>{newer.title}</Link>:<span/>}
        </nav>
      </article>
    </main><Footer/></>;
}
