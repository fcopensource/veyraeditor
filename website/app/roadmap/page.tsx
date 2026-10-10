import type {Metadata} from 'next';
import Link from 'next/link';
import {ClosingCTA,ContentPage} from '@/components/ContentPage';
import {GITHUB_URL} from '@/lib/site';

export const metadata:Metadata={
  title:'Roadmap: What\'s Next for Veyra',
  description:'The Veyra roadmap: shipped web development language tools, and what comes next: Rust, Go and C++ language servers, Python and Java, TextMate grammars, icon themes and a VS Code extension host.',
  alternates:{canonical:'/roadmap'},
  openGraph:{url:'/roadmap',title:'Veyra roadmap'},
};

type Milestone={title:string;status:'done'|'next'|'planned';label:string;copy:string;items:string[]};
const MILESTONES:Milestone[]=[
  {title:'Foundations',status:'done',label:'SHIPPED · 0.1–0.4',copy:'A fast native editor with everything needed for daily work.',
    items:['Monaco editor & tabs','Explorer with drag and drop','Built-in Git','Native terminal','AI assistant with 11 providers','AI inline completions','Health monitor','Signed auto-updates']},
  {title:'Web development language tools',status:'done',label:'SHIPPED · 0.5',copy:'The language servers behind VS Code\'s most popular web extensions, installed with one click.',
    items:['TypeScript & JavaScript (Node.js)','ESLint','Prettier & format on save','Tailwind CSS','Emmet','Svelte','Vue (beta)','VS Code-style tabs']},
  {title:'Systems languages',status:'next',label:'UP NEXT',copy:'The same real IntelliSense for compiled languages: errors as you type, type-aware completion, go to definition, rename and formatting.',
    items:['Rust (rust-analyzer)','Go (gopls)','C / C++ (clangd)','Server detection & install help','Inlay type hints']},
  {title:'More languages',status:'planned',label:'PLANNED',copy:'Each additional language becomes a small addition on the same foundation.',
    items:['Python (Pyright)','Java','PHP','YAML & JSON schemas','Dockerfile','Bash','TOML']},
  {title:'Declarative extensions',status:'planned',label:'PLANNED',copy:'Thousands of Open VSX extensions that contain no code, applied exactly as VS Code applies them.',
    items:['TextMate grammars (exact VS Code colours)','File icon themes','Language packs','Language configuration']},
  {title:'Extension host',status:'planned',label:'PLANNED',copy:'Run extensions that ship their own code, starting with the most popular and growing through a compatibility layer.',
    items:['EditorConfig','Commands & keybindings','Curated extension support']},
];

export default function Roadmap(){
  return <ContentPage path="/roadmap" crumb="Roadmap" kicker="ROADMAP" title="Where Veyra is going."
    intro="Veyra ships in small, frequent updates that install automatically. Here's what's done, what we're building now, and what comes next.">
    <section className="content-section">
      <div className="timeline">
        {MILESTONES.map(m=><article key={m.title} className={'milestone '+m.status}>
          <header><h3>{m.title}</h3><span className="status">{m.label}</span></header>
          <p>{m.copy}</p>
          <ul>{m.items.map(item=><li key={item}>{item}</li>)}</ul>
        </article>)}
      </div>
    </section>
    <section className="content-section" style={{textAlign:'center'}}>
      <p>Want something sooner? <a href={GITHUB_URL+'/issues'}>Request a feature on GitHub</a>, or follow every release in the <Link href="/changelog">changelog</Link>.</p>
    </section>
    <ClosingCTA/>
  </ContentPage>;
}
