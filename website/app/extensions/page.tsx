import type {Metadata} from 'next';
import Link from 'next/link';
import {ArrowRight,Brush,Code2,FileCode2,Package,Palette,ScanSearch,Sparkles,Wind,Wrench} from 'lucide-react';
import {ClosingCTA,ContentPage} from '@/components/ContentPage';

export const metadata:Metadata={
  title:'Extensions: TypeScript, ESLint, Prettier & Tailwind',
  description:'Install TypeScript & JavaScript IntelliSense, ESLint, Prettier, Tailwind CSS IntelliSense, Emmet, Svelte and Vue in Veyra with one click, plus themes and snippets from the Open VSX marketplace.',
  alternates:{canonical:'/extensions'},
  openGraph:{url:'/extensions',title:'Veyra extensions and language tools'},
};

const TOOLS=[
  {icon:Code2,name:'TypeScript & JavaScript',for:'Node.js, React, Next.js, Express…',copy:'Full IntelliSense from your tsconfig and node_modules: real errors as you type, auto-imports, hover docs, go to definition, rename across files, quick fixes and organize imports.',replaces:'VS Code TypeScript features'},
  {icon:ScanSearch,name:'ESLint',for:'JavaScript, TypeScript, Vue, Svelte',copy:'Your project\'s lint rules as you type, with quick fixes and "fix all".',replaces:'dbaeumer.vscode-eslint'},
  {icon:Brush,name:'Prettier',for:'JS, TS, CSS, HTML, JSON, Markdown, YAML…',copy:'Opinionated formatting with your project\'s Prettier version and config. Format Document, or turn on Format on save.',replaces:'esbenp.prettier-vscode'},
  {icon:Wind,name:'Tailwind CSS IntelliSense',for:'HTML, JSX, Vue, Svelte, CSS',copy:'Class name completion, hover previews of the generated CSS, colour swatches and linting.',replaces:'bradlc.vscode-tailwindcss'},
  {icon:Sparkles,name:'Emmet',for:'HTML, JSX, CSS',copy:'Type ul>li*3 or div.card and expand it into full markup and styles.',replaces:'Built-in Emmet'},
  {icon:FileCode2,name:'Svelte',for:'.svelte components',copy:'Diagnostics, completions and go to definition for Svelte components.',replaces:'svelte.svelte-vscode'},
  {icon:FileCode2,name:'Vue (Volar)',for:'.vue single-file components',copy:'Language support for template, script and style blocks.',replaces:'vue.volar',beta:true},
];

export default function Extensions(){
  return <ContentPage path="/extensions" crumb="Extensions" kicker="EXTENSIONS" title="Your favourite tools, built in."
    intro="Veyra installs the same language servers behind VS Code's most popular web extensions, with one click. Add themes and snippets from the open marketplace.">

    <section className="content-section">
      <header><span>WEB DEVELOPMENT</span><h2>Language tools</h2><p>Open <strong>Extensions → Discover → Web development</strong> and click Install. Tools run on your own Node.js 18+, read your project&apos;s config, and start automatically when you open a matching file.</p></header>
      <div className="cards">
        {TOOLS.map(tool=><article className="card" key={tool.name}>
          <tool.icon/>{tool.beta&&<em className="badge">BETA</em>}
          <h3>{tool.name}</h3><p>{tool.copy}</p>
          <ul><li><Wrench/>{tool.for}</li><li><Package/>Stands in for <code>{tool.replaces}</code></li></ul>
        </article>)}
      </div>
    </section>

    <section className="content-section split">
      <div>
        <span className="kicker">OPEN VSX MARKETPLACE</span>
        <h2>Themes, snippets and more.</h2>
        <p>Search thousands of extensions from <a href="https://open-vsx.org">Open VSX</a>, the open marketplace used by VS Code-compatible editors, right inside Veyra.</p>
        <ul>
          <li><Palette/><span><strong>Colour themes</strong> apply to the whole workspace and editor</span></li>
          <li><Code2/><span><strong>Snippets</strong> appear in editor suggestions</span></li>
          <li><Package/><span><strong>Install from VSIX</strong> for extensions you already have</span></li>
          <li><Sparkles/><span>Popular web extensions are marked <strong>Built into Veyra</strong> and install the native equivalent</span></li>
        </ul>
        <p>Extensions that run their own JavaScript need a VS Code extension host. It&apos;s on the <Link href="/roadmap">roadmap</Link>.</p>
      </div>
      <div className="visual" aria-hidden="true">
        <small>Extensions · Search &quot;eslint&quot;</small>
        <b>ESLint</b> · dbaeumer <i>Built into Veyra</i><br/>
        <span style={{color:'#5f6d7a'}}>Integrates ESLint into the editor</span><br/><br/>
        <b>Prettier</b> · esbenp <i>Built into Veyra</i><br/>
        <span style={{color:'#5f6d7a'}}>Code formatter using prettier</span><br/><br/>
        <b>One Dark Pro</b> · zhuangtongfa<br/>
        <span style={{color:'#5f6d7a'}}>Atom&apos;s iconic One Dark theme</span>
      </div>
    </section>

    <section className="content-section">
      <div className="cards two">
        <Link className="card" href="/docs#language-tools"><Wrench/><h3>Set up language tools</h3><p>Step-by-step setup and troubleshooting for TypeScript, ESLint and Prettier.</p><span className="card-link">Read the guide <ArrowRight size={14}/></span></Link>
        <Link className="card" href="/roadmap"><Sparkles/><h3>What&apos;s next</h3><p>Rust, Go and C++ language servers, more grammars and icon themes, and a full extension host.</p><span className="card-link">See the roadmap <ArrowRight size={14}/></span></Link>
      </div>
    </section>

    <ClosingCTA/>
  </ContentPage>;
}
