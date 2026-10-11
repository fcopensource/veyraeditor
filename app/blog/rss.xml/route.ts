import {allPosts} from '@/lib/blog';
import {SITE_URL} from '@/lib/site';

export const dynamic='force-static';

const escape=(text:string)=>text.replace(/[<>&'"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c]!));

/** RSS 2.0 feed of the blog, for feed readers and search engines. */
export function GET(){
  const items=allPosts().map(post=>`    <item>
      <title>${escape(post.title)}</title>
      <link>${SITE_URL}/blog/${post.slug}</link>
      <guid isPermaLink="true">${SITE_URL}/blog/${post.slug}</guid>
      <pubDate>${new Date(post.date+'T12:00:00Z').toUTCString()}</pubDate>
      <category>${escape(post.category)}</category>
      <description>${escape(post.description)}</description>
    </item>`).join('\n');
  const xml=`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Veyra blog</title>
    <link>${SITE_URL}/blog</link>
    <atom:link href="${SITE_URL}/blog/rss.xml" rel="self" type="application/rss+xml"/>
    <description>Guides, product news and engineering notes from the Veyra team.</description>
    <language>en</language>
${items}
  </channel>
</rss>`;
  return new Response(xml,{headers:{'content-type':'application/rss+xml; charset=utf-8'}});
}
