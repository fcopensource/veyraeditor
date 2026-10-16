import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {marked} from 'marked';

/* Blog posts are Markdown files in content/blog/<slug>.md with a small front-matter header:
     ---
     title: …            description: …        date: 2026-10-01
     category: Guides    readingTime: 6
     updated: 2026-10-05 (optional)   keywords: a, b, c (optional)
     ---
   Add a file to publish a post; pages, sitemap and RSS pick it up at build time. */

export type Post={slug:string;title:string;description:string;date:string;updated:string;category:string;readingTime:number;keywords:string[];html:string;headings:{id:string;text:string}[]};
const DIR=path.join(process.cwd(),'content','blog');

const slugify=(text:string)=>text.toLowerCase().replace(/<[^>]+>/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

function parse(slug:string,raw:string):Post{
  const text=raw.replace(/\r\n/g,'\n');
  const match=text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if(!match) throw new Error(`content/blog/${slug}.md needs a --- front-matter header ---`);
  const meta:Record<string,string>={};
  for(const line of match[1].split('\n')){const i=line.indexOf(':');if(i>0)meta[line.slice(0,i).trim()]=line.slice(i+1).trim();}
  // Headings get stable ids so the table of contents and shared links can jump to them.
  const headings:{id:string;text:string}[]=[];
  const renderer=new marked.Renderer();
  renderer.heading=({tokens,depth})=>{
    const inner=marked.Parser.parseInline(tokens);
    const id=slugify(inner);
    if(depth===2)headings.push({id,text:inner.replace(/<[^>]+>/g,'')});
    return `<h${depth} id="${id}">${inner}</h${depth}>`;
  };
  // External links open in a new tab; internal ones stay on the site.
  renderer.link=({href,title,tokens})=>{
    const inner=marked.Parser.parseInline(tokens);
    const external=/^https?:\/\//.test(href);
    return `<a href="${href}"${title?` title="${title}"`:''}${external?' target="_blank" rel="noopener noreferrer"':''}>${inner}</a>`;
  };
  const html=marked.parse(match[2],{async:false,gfm:true,renderer}) as string;
  const date=meta.date||'2026-01-01';
  return {slug,title:meta.title||slug,description:meta.description||'',date,updated:meta.updated||date,category:meta.category||'News',readingTime:Number(meta.readingTime)||5,
    keywords:(meta.keywords||'').split(',').map(k=>k.trim()).filter(Boolean),html,headings};
}

let cache:Post[]|null=null;
/** Every post, newest first. */
export function allPosts():Post[]{
  if(cache)return cache;
  const files=readdirSync(DIR).filter(file=>file.endsWith('.md'));
  cache=files.map(file=>parse(file.slice(0,-3),readFileSync(path.join(DIR,file),'utf8'))).sort((a,b)=>b.date.localeCompare(a.date));
  return cache;
}
export const getPost=(slug:string)=>allPosts().find(post=>post.slug===slug)||null;
/** Up to three other posts: the same category first, then the newest. */
export function relatedPosts(post:Post,count=3):Post[]{
  const others=allPosts().filter(item=>item.slug!==post.slug);
  return [...others.filter(item=>item.category===post.category),...others.filter(item=>item.category!==post.category)].slice(0,count);
}
export const formatDate=(date:string)=>new Date(date+'T12:00:00Z').toLocaleDateString('en',{year:'numeric',month:'long',day:'numeric'});
