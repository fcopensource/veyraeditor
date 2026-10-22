import fs from 'node:fs';
import path from 'node:path';
import {marked} from 'marked';

/* Product guides are Markdown files in content/guides/<name>.md: the same files that ship inside the extensions
   (copied from extensions/<name>/docs/GUIDE.md). The title and the "Contents" list are left out: the page has its own. */

export type Guide={html:string;headings:{id:string;text:string}[];words:number};
const slugify=(text:string)=>text.toLowerCase().replace(/<[^>]+>/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

export function getGuide(name:string,links:Record<string,string>={}):Guide{
  const raw=fs.readFileSync(path.join(process.cwd(),'content','guides',`${name}.md`),'utf8').replace(/\r\n/g,'\n');
  const body=raw.replace(/^# .*\n/,'').replace(/\n## Contents\n[\s\S]*?\n---\n/,'\n');
  const headings:{id:string;text:string}[]=[];
  const renderer=new marked.Renderer();
  renderer.heading=({tokens,depth})=>{
    const inner=marked.Parser.parseInline(tokens);
    const id=slugify(inner);
    if(depth===2)headings.push({id,text:inner.replace(/<[^>]+>/g,'').replace(/^\d+\.\s*/,'')});
    return `<h${depth} id="${id}">${inner}</h${depth}>`;
  };
  renderer.link=({href,title,tokens})=>{
    const inner=marked.Parser.parseInline(tokens);
    const target=links[href]??href;
    const external=/^https?:\/\//.test(target);
    return `<a href="${target}"${title?` title="${title}"`:''}${external?' target="_blank" rel="noopener noreferrer"':''}>${inner}</a>`;
  };
  const html=marked.parse(body,{async:false,gfm:true,renderer}) as string;
  return {html,headings,words:html.replace(/<[^>]+>/g,' ').split(/\s+/).filter(Boolean).length};
}
