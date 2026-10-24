'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import Image from 'next/image';
import {Search,X} from 'lucide-react';
import {FILTERS,TOOLS,type Category} from '@/lib/tools';
import {Pagination} from './Pagination';

export function ExtensionGallery(){
  const [filter,setFilter]=useState<Category|'all'>('all');
  const [query,setQuery]=useState('');
  const [page,setPage]=useState(1);
  const top=useRef<HTMLDivElement>(null);
  useEffect(()=>setPage(1),[filter,query]);
  const shown=useMemo(()=>{
    const q=query.trim().toLowerCase();
    return TOOLS.filter(tool=>(filter==='all'||tool.category.includes(filter))&&(!q||[tool.name,tool.by,tool.copy,tool.replaces].some(text=>text.toLowerCase().includes(q))));
  },[filter,query]);
  const PER_PAGE=6, pages=Math.max(1,Math.ceil(shown.length/PER_PAGE)), visible=shown.slice((page-1)*PER_PAGE,page*PER_PAGE);
  const goTo=(p:number)=>{setPage(Math.min(pages,Math.max(1,p)));const el=top.current;if(el&&el.getBoundingClientRect().top<0)el.scrollIntoView({behavior:'smooth',block:'start'});};
  return <div className="ext-gallery" ref={top}>
    <div className="ext-gallery-bar">
      <label className="ext-gallery-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search tools or a VS Code extension id…" aria-label="Search built-in tools"/>{query&&<button type="button" aria-label="Clear search" onClick={()=>setQuery('')}><X size={14}/></button>}</label>
      <div className="ext-gallery-filters" role="tablist" aria-label="Categories">
        {FILTERS.map(([id,label])=><button key={id} type="button" role="tab" aria-selected={filter===id} className={filter===id?'active':''} onClick={()=>setFilter(id)}>{label}<span>{id==='all'?TOOLS.length:TOOLS.filter(t=>t.category.includes(id)).length}</span></button>)}
      </div>
    </div>
    <div className="ext-gallery-grid" aria-live="polite">
      {visible.map(tool=><article key={tool.name} className={'ext-tile tone-'+tool.tone}>
        <header>
          <span className="ext-tile-icon">{tool.image?<Image src={tool.image} width={44} height={44} alt=""/>:tool.icon&&<tool.icon size={22}/>}</span>
          <div><h3>{tool.name}</h3><small>{tool.by}</small></div>
          {tool.badge&&<em>{tool.badge}</em>}
        </header>
        <p>{tool.copy}</p>
        <div className="ext-tile-foot"><span title="The VS Code extension this stands in for"><code>{tool.replaces}</code></span><span className="ext-needs">{tool.needs==='Nothing'?'Built in':tool.needs}</span></div>
      </article>)}
      {!shown.length&&<p className="ext-gallery-empty">No built-in tool matches “{query}”. Themes and snippets for it may be on Open VSX: search for it in Veyra&apos;s Extensions view.</p>}
    </div>
    {shown.length>PER_PAGE&&<p className="page-count" aria-live="polite">Showing {(page-1)*PER_PAGE+1}–{Math.min(page*PER_PAGE,shown.length)} of {shown.length}</p>}
    <Pagination page={page} pages={pages} onPage={goTo} label="Built-in tools pages"/>
  </div>;
}
