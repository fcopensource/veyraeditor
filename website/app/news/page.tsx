import type {Metadata} from 'next';
import Link from 'next/link';
import {ArrowRight,Rss} from 'lucide-react';
import {ContentPage} from '@/components/ContentPage';
import {allPosts,formatDate} from '@/lib/blog';
import {OG_IMAGE,absolute,jsonLd} from '@/lib/site';

/* Tech News: the blog posts in the "Tech News" category, newest first. Each is a normal post at /blog/<slug>. */
export const metadata:Metadata={
  title:'Tech News for Developers: VS Code, Claude, GitHub, JetBrains',
  description:'Developer tech news, explained: VS Code releases, Claude and Anthropic, GitHub Copilot, Microsoft and JetBrains IDEs. What changed and what it means for your work.',
  alternates:{canonical:'/news',types:{'application/rss+xml':'/blog/rss.xml'}},
  openGraph:{images:[OG_IMAGE],url:'/news',title:'Tech News for developers | Veyra'},
};

export default function News(){
  const posts=allPosts().filter(post=>post.category==='Tech News');
  const list={'@context':'https://schema.org','@type':'CollectionPage',name:'Tech News for developers',url:absolute('/news'),
    mainEntity:{'@type':'ItemList',itemListElement:posts.map((post,i)=>({'@type':'ListItem',position:i+1,url:absolute(`/blog/${post.slug}`),name:post.title}))}};
  return <ContentPage path="/news" crumb="Tech News" kicker="TECH NEWS" title="Developer news, minus the noise."
    intro={<>The releases and announcements that change how you write code: VS Code, Claude, GitHub, Microsoft and JetBrains, with links to every source. <a href="/blog/rss.xml" className="rss-link"><Rss size={14}/>RSS</a></>}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(list)}}/>
    <div className="post-grid">
      {posts.map(post=><Link key={post.slug} href={`/blog/${post.slug}`} className="post-card">
        <span className="post-meta"><em>{post.category}</em>{post.readingTime} min read</span>
        <h3>{post.title}</h3>
        <p>{post.description}</p>
        <span className="post-date">{formatDate(post.date)}</span>
      </Link>)}
    </div>
    <p><Link href="/blog" className="card-link">Guides and engineering notes on the blog <ArrowRight size={14}/></Link></p>
  </ContentPage>;
}
