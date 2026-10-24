'use client';
import {ChevronLeft,ChevronRight} from 'lucide-react';

/** Page numbers to show: always the first and last, the current one and its neighbours, and "…" for gaps. */
export function pageList(page:number,pages:number):(number|'gap')[]{
  if(pages<=7)return Array.from({length:pages},(_,i)=>i+1);
  const keep=new Set([1,pages,page-1,page,page+1].filter(p=>p>=1&&p<=pages));
  const out:(number|'gap')[]=[];
  [...keep].sort((a,b)=>a-b).forEach((p,i,all)=>{if(i&&p-all[i-1]>1)out.push('gap');out.push(p);});
  return out;
}

export function Pagination({page,pages,onPage,label}:{page:number;pages:number;onPage:(page:number)=>void;label:string}){
  if(pages<=1)return null;
  return <nav className="pagination" aria-label={label}>
    <button type="button" className="page-step" onClick={()=>onPage(page-1)} disabled={page<=1} aria-label="Previous page"><ChevronLeft size={16}/><span>Previous</span></button>
    <ol>
      {pageList(page,pages).map((p,i)=>p==='gap'
        ?<li key={'gap'+i} className="page-gap" aria-hidden="true">…</li>
        :<li key={p}><button type="button" className={p===page?'active':''} aria-current={p===page?'page':undefined} aria-label={`Page ${p}`} onClick={()=>onPage(p)}>{p}</button></li>)}
    </ol>
    <button type="button" className="page-step" onClick={()=>onPage(page+1)} disabled={page>=pages} aria-label="Next page"><span>Next</span><ChevronRight size={16}/></button>
  </nav>;
}
