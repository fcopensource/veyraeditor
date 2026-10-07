import type {ReactNode} from 'react';

/** Minimal Markdown for release notes: headings, bold lines, bullets, paragraphs, **bold**, `code` and [links](url). */
function inline(text:string):ReactNode[]{
  const out:ReactNode[]=[];const pattern=/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;let last=0,m:RegExpExecArray|null,k=0;
  while((m=pattern.exec(text))){
    if(m.index>last)out.push(text.slice(last,m.index));
    const t=m[0];
    if(t.startsWith('**'))out.push(<strong key={k++}>{t.slice(2,-2)}</strong>);
    else if(t.startsWith('`'))out.push(<code key={k++}>{t.slice(1,-1)}</code>);
    else{const [,label,href]=t.match(/\[([^\]]+)\]\(([^)]+)\)/)!;out.push(/^https?:\/\//.test(href)?<a key={k++} href={href} rel="noreferrer">{label}</a>:label);}
    last=m.index+t.length;
  }
  if(last<text.length)out.push(text.slice(last));
  return out;
}
export function Markdown({source}:{source:string}){
  const blocks:ReactNode[]=[];let list:string[]=[];let k=0;
  const flush=()=>{if(list.length){blocks.push(<ul key={k++}>{list.map((item,i)=><li key={i}>{inline(item)}</li>)}</ul>);list=[];}};
  for(const raw of source.replace(/\r/g,'').split('\n')){
    const line=raw.trim();
    if(/^[-*] /.test(line)){list.push(line.slice(2));continue;}
    flush();
    if(!line||line==='---')continue;
    if(/^#{1,4} /.test(line))blocks.push(<h3 key={k++}>{inline(line.replace(/^#+ /,''))}</h3>);
    else if(/^\*\*[^*]+\*\*$/.test(line))blocks.push(<h3 key={k++}>{line.slice(2,-2)}</h3>);
    else blocks.push(<p key={k++}>{inline(line)}</p>);
  }
  flush();
  return <div className="markdown">{blocks}</div>;
}
