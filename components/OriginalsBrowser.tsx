'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {ArrowRight,Search,X} from 'lucide-react';
import {ORIGINALS,isNew,type Group} from '@/lib/products';
import {Pagination} from './Pagination';

const PER_PAGE=6;
const FILTERS:(Group|'all')[]=['all','Write code','Run and test','Project','Just for fun','Apps and AI'];
type Sort='newest'|'az';
interface View {q:string;group:Group|'all';sort:Sort;page:number}
const slug=(g:string)=>g.toLowerCase().replace(/[^a-z]+/g,'-');

/** Reads and writes the view in the address (?q=…&group=…&sort=…&page=…), so it survives back, refresh and sharing. */
function readView():View{
  const p=new URLSearchParams(window.location.search);
  const group=FILTERS.find(g=>slug(g)===p.get('group'))??'all';
  return {q:p.get('q')??'',group,sort:p.get('sort')==='az'?'az':'newest',page:Math.max(1,Number(p.get('page'))||1)};
}
function writeView(v:View,push:boolean){
  const p=new URLSearchParams(window.location.search);
  const set=(k:string,val:string|undefined)=>{if(val)p.set(k,val);else p.delete(k);};
  set('q',v.q.trim()||undefined);set('group',v.group==='all'?undefined:slug(v.group));set('sort',v.sort==='az'?'az':undefined);set('page',v.page>1?String(v.page):undefined);
  const url=`${window.location.pathname}${p.toString()?`?${p}`:''}#made-by-veyra`;
  if(push)window.history.pushState(null,'',url);else window.history.replaceState(null,'',url);
}

export function OriginalsBrowser(){
  const [view,setView]=useState<View>({q:'',group:'all',sort:'newest',page:1});
  const top=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    setView(readView());
    const back=()=>setView(readView());
    window.addEventListener('popstate',back);
    return()=>window.removeEventListener('popstate',back);
  },[]);
  const update=useCallback((next:Partial<View>,push=false)=>{
    setView(v=>{const merged={...v,...next};writeView(merged,push);return merged;});
  },[]);

  const counts=useMemo(()=>Object.fromEntries(FILTERS.map(g=>[g,g==='all'?ORIGINALS.length:ORIGINALS.filter(p=>p.group===g).length])),[]);
  const matching=useMemo(()=>{
    const q=view.q.trim().toLowerCase();
    return ORIGINALS
      .filter(p=>(view.group==='all'||p.group===view.group)&&(!q||[p.title,p.name,p.summary,p.copy,p.group].some(t=>t.toLowerCase().includes(q))))
      .sort((a,b)=>view.sort==='az'?a.title.replace(/^Veyra /,'').localeCompare(b.title.replace(/^Veyra /,'')):b.order-a.order);
  },[view.q,view.group,view.sort]);
  const pages=Math.max(1,Math.ceil(matching.length/PER_PAGE));
  const page=Math.min(view.page,pages);
  const shown=matching.slice((page-1)*PER_PAGE,page*PER_PAGE);
  const goTo=(p:number)=>{
    update({page:Math.min(pages,Math.max(1,p))},true);
    const el=top.current;
    if(el&&el.getBoundingClientRect().top<0)el.scrollIntoView({behavior:'smooth',block:'start'});
  };

  return <div className="originals-browser" ref={top}>
    <div className="ext-gallery-bar">
      <label className="ext-gallery-search"><Search size={16}/><input value={view.q} onChange={e=>update({q:e.target.value,page:1})} placeholder="Search Veyra's extensions…" aria-label="Search Veyra's extensions"/>{view.q&&<button type="button" aria-label="Clear search" onClick={()=>update({q:'',page:1})}><X size={14}/></button>}</label>
      <div className="originals-tools">
        <div className="ext-gallery-filters" role="tablist" aria-label="Groups">
          {FILTERS.filter(g=>counts[g]).map(g=><button key={g} type="button" role="tab" aria-selected={view.group===g} className={view.group===g?'active':''} onClick={()=>update({group:g,page:1},true)}>{g==='all'?'All':g}<span>{counts[g]}</span></button>)}
        </div>
        <label className="originals-sort"><span>Sort</span><select value={view.sort} onChange={e=>update({sort:e.target.value as Sort,page:1})} aria-label="Sort"><option value="newest">Newest</option><option value="az">A to Z</option></select></label>
      </div>
    </div>
    <p className="page-count" aria-live="polite">{matching.length?`Showing ${(page-1)*PER_PAGE+1}–${Math.min(page*PER_PAGE,matching.length)} of ${matching.length}`:'Nothing matches'}{view.group!=='all'?` in ${view.group}`:''}{view.q.trim()?` for “${view.q.trim()}”`:''}</p>
    <div className="ext-originals" key={`${page}-${view.group}-${view.sort}`}>
      {shown.map((p,i)=><Link key={p.href} href={p.href} className={`ext-original ${p.tone} card-in`} style={{animationDelay:`${i*45}ms`}}>
        <Image src={p.icon} width={96} height={96} alt=""/>
        <div><small>{isNew(p)?'NEW · ':''}{(p.platform??'').toUpperCase()}</small><h3>{p.title}</h3><p>{p.summary}</p><span className="ext-link">{p.cta} <ArrowRight size={14}/></span></div>
      </Link>)}
    </div>
    {!matching.length&&<p className="ext-gallery-empty">Nothing matches “{view.q}”. <button type="button" className="link-button" onClick={()=>update({q:'',group:'all',page:1})}>Show everything</button></p>}
    <Pagination page={page} pages={pages} onPage={goTo} label="Veyra extensions pages"/>
  </div>;
}
