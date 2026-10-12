import type {Metadata} from 'next';
import {OG_IMAGE} from '@/lib/site';
import Link from 'next/link';
import {ArrowRight,Rss} from 'lucide-react';
import {ContentPage} from '@/components/ContentPage';
import {allPosts,formatDate} from '@/lib/blog';

export const metadata:Metadata={
  title:'Blog: Guides, AI Coding and Engineering',
  description:'Guides, product news and engineering notes from the Veyra team: switching from VS Code, TypeScript setup, privacy and how Veyra is built.',
  alternates:{canonical:'/blog',types:{'application/rss+xml':'/blog/rss.xml'}},
  openGraph:{images:[OG_IMAGE],url:'/blog',title:'The Veyra blog'},
};

export default function Blog(){
  const [featured,...rest]=allPosts();
  return <ContentPage path="/blog" crumb="Blog" kicker="BLOG" title="Notes from the Veyra team."
    intro={<>Guides, product news and how Veyra is built. <a href="/blog/rss.xml" className="rss-link"><Rss size={14}/>RSS</a></>}>
    {featured&&<Link href={`/blog/${featured.slug}`} className="post-featured">
      <span className="post-meta"><em>{featured.category}</em>{formatDate(featured.date)} · {featured.readingTime} min read</span>
      <h2>{featured.title}</h2>
      <p>{featured.description}</p>
      <span className="card-link">Read the article <ArrowRight size={14}/></span>
    </Link>}
    <div className="post-grid">
      {rest.map(post=><Link key={post.slug} href={`/blog/${post.slug}`} className="post-card">
        <span className="post-meta"><em>{post.category}</em>{post.readingTime} min read</span>
        <h3>{post.title}</h3>
        <p>{post.description}</p>
        <span className="post-date">{formatDate(post.date)}</span>
      </Link>)}
    </div>
  </ContentPage>;
}
