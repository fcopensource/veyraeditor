'use client';
import {useMemo,useState} from 'react';
import Image from 'next/image';
import {Braces,Bug,Code2,FileCode2,Paintbrush,ScanSearch,Search,Sparkles,TerminalSquare,Wind,X} from 'lucide-react';

type Category='web'|'python'|'debug'|'ai'|'preview';
type Tool={name:string;by:string;category:Category[];copy:string;replaces:string;needs:string;tone:string;icon?:typeof Code2;image?:string;badge?:string};

/** Built-in tools: what installing a popular VS Code extension gives you in Veyra. */
const TOOLS:Tool[]=[
  {name:'Veyra Live Server',by:'Veyra',category:['preview','web'],copy:'Go Live serves your folder at 127.0.0.1:5500. Save and the browser reloads; CSS applies without a reload.',replaces:'ritwickdey.LiveServer',needs:'Nothing',tone:'veyra',image:'/live-server-icon.png',badge:'Veyra original'},
  {name:'TypeScript & JavaScript',by:'typescript-language-server',category:['web'],copy:'Errors as you type, auto-imports, hover docs, go to definition, rename and quick fixes from your tsconfig.',replaces:'vscode.typescript-language-features',needs:'Node.js 18+',tone:'blue',icon:Braces},
  {name:'ESLint',by:'Microsoft vscode-eslint',category:['web'],copy:'Your project’s lint rules as you type, with quick fixes and “fix all”.',replaces:'dbaeumer.vscode-eslint',needs:'Node.js 18+',tone:'violet',icon:ScanSearch},
  {name:'Prettier',by:'Prettier',category:['web'],copy:'Format Document or format on save, with your project’s Prettier version and config.',replaces:'esbenp.prettier-vscode',needs:'Node.js 18+',tone:'pink',icon:Paintbrush},
  {name:'Tailwind CSS IntelliSense',by:'Tailwind Labs',category:['web'],copy:'Class completion, hover previews of the generated CSS, colour swatches and linting.',replaces:'bradlc.vscode-tailwindcss',needs:'Node.js 18+',tone:'cyan',icon:Wind},
  {name:'Emmet',by:'olrtg/emmet-language-server',category:['web'],copy:'Type ul>li*3 or div.card and expand it into full markup and styles.',replaces:'vscode.emmet',needs:'Node.js 18+',tone:'green',icon:Sparkles},
  {name:'Svelte',by:'Svelte',category:['web'],copy:'Diagnostics, completions and go to definition for .svelte components.',replaces:'svelte.svelte-vscode',needs:'Node.js 18+',tone:'orange',icon:FileCode2},
  {name:'Vue (Volar)',by:'Vue',category:['web'],copy:'Template, script and style support for .vue single-file components.',replaces:'vue.volar',needs:'Node.js 18+',tone:'green',icon:FileCode2,badge:'Beta'},
  {name:'Python (Pyright)',by:'Microsoft Pyright',category:['python'],copy:'Type checking, errors as you type, completions and go to definition, using your virtual environment.',replaces:'ms-python.vscode-pylance',needs:'Node.js 18+',tone:'yellow',icon:Code2},
  {name:'Python Debugger',by:'Microsoft debugpy',category:['python','debug'],copy:'Breakpoints, stepping, variables, watch, call stack and a Debug Console. Press F5.',replaces:'ms-python.debugpy',needs:'Python 3.8+',tone:'red',icon:Bug},
  {name:'Claude Code',by:'Anthropic',category:['ai'],copy:'Anthropic’s coding agent, installed with its official installer and opened in your project’s terminal.',replaces:'anthropic.claude-code',needs:'Claude account',tone:'coral',icon:TerminalSquare},
];
const FILTERS:[Category|'all',string][]=[['all','All'],['web','Web development'],['python','Python'],['debug','Debugging'],['ai','AI & terminal'],['preview','Live preview']];

export function ExtensionGallery(){
  const [filter,setFilter]=useState<Category|'all'>('all');
  const [query,setQuery]=useState('');
  const shown=useMemo(()=>{
    const q=query.trim().toLowerCase();
    return TOOLS.filter(tool=>(filter==='all'||tool.category.includes(filter))&&(!q||[tool.name,tool.by,tool.copy,tool.replaces].some(text=>text.toLowerCase().includes(q))));
  },[filter,query]);
  return <div className="ext-gallery">
    <div className="ext-gallery-bar">
      <label className="ext-gallery-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search tools or a VS Code extension id…" aria-label="Search built-in tools"/>{query&&<button type="button" aria-label="Clear search" onClick={()=>setQuery('')}><X size={14}/></button>}</label>
      <div className="ext-gallery-filters" role="tablist" aria-label="Categories">
        {FILTERS.map(([id,label])=><button key={id} type="button" role="tab" aria-selected={filter===id} className={filter===id?'active':''} onClick={()=>setFilter(id)}>{label}<span>{id==='all'?TOOLS.length:TOOLS.filter(t=>t.category.includes(id)).length}</span></button>)}
      </div>
    </div>
    <div className="ext-gallery-grid" aria-live="polite">
      {shown.map(tool=><article key={tool.name} className={'ext-tile tone-'+tool.tone}>
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
  </div>;
}
