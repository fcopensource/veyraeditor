import type {Metadata} from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {AlertTriangle,Code2,Download,FileCode2,FolderTree,Globe,Image as ImageIcon,Link2,ShieldCheck,Sparkles,Zap} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {MoreExtensions} from '@/components/MoreExtensions';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {ClosingCTA} from '@/components/ContentPage';
import {absolute,jsonLd,marketplaceUrl,VSCODE_EXTENSIONS,vsixUrl} from '@/lib/site';
import '../live-server/live-server.css';
import '../port-manager/port-manager.css';

const EXT=VSCODE_EXTENSIONS.pathIntelliSense;
const MARKETPLACE=marketplaceUrl(EXT.id), VSIX=vsixUrl(EXT);

export const metadata:Metadata={
  title:'Path IntelliSense for VS Code: File Path Autocomplete',
  description:'Autocomplete file paths in VS Code as you type: imports, require, src, href, CSS url() and Markdown links. tsconfig aliases with no setup, the right import extension, and warnings for broken paths. Free.',
  keywords:['path intellisense','VS Code path autocomplete','file path autocomplete','import path completion','tsconfig paths','alias autocomplete','broken import path','VS Code extension'],
  alternates:{canonical:'/path-intellisense'},
  openGraph:{url:'/path-intellisense',title:'Path IntelliSense Veyra',description:'File paths, completed as you type. Free.',images:[{url:'/path-intellisense-hero.webp',width:1920,height:960,alt:'Path IntelliSense Veyra completing a path with an image preview'}]},
};

const FEATURES=[
  {icon:FolderTree,title:'Paths everywhere',copy:'Imports, require(), HTML src and href, CSS url() and @import, Markdown links, and any string that starts like a path.'},
  {icon:Link2,title:'Aliases, no setup',copy:'@/components from tsconfig or jsconfig paths (following extends), and #utils from package.json imports, read by themselves.'},
  {icon:FileCode2,title:'The right import',copy:'No extension for bundlers, .js for Node ESM, folders instead of /index: imports written the way your project needs.'},
  {icon:AlertTriangle,title:'Broken paths flagged',copy:'“Can’t find ./utils/fromat. Did you mean ./utils/format?” with a one-click fix, resolved the way TypeScript does.'},
  {icon:ImageIcon,title:'Image previews',copy:'See the image and its file size right in the suggestion list before you pick it.'},
  {icon:ShieldCheck,title:'No false alarms',copy:'Routes like href="/about", URLs, anchors, template strings and paths still being typed are never flagged.'},
  {icon:Globe,title:'Public folders',copy:'Paths starting with / find files in public/ and static/, like Vite, Next.js and most site tools serve them.'},
  {icon:Code2,title:'Every language',copy:'JavaScript, TypeScript, JSX, Vue, Svelte, Astro, HTML, CSS, SCSS, Less and Markdown, in local, remote and virtual workspaces.'},
  {icon:Sparkles,title:'Free and private',copy:'MIT licensed, with no account and no telemetry.'},
];
const FAQ=[
  {q:'Is it free?',a:'Yes. Path IntelliSense Veyra is free and MIT licensed, with no account and no telemetry.'},
  {q:'Do I need to configure my aliases?',a:'No. Aliases in tsconfig.json or jsconfig.json paths (including ones inherited with extends) and in package.json imports are read by themselves. For others, add them to the veyraPath.mappings setting.'},
  {q:'Why does it insert .js for my TypeScript files?',a:'Because your tsconfig uses moduleResolution node16 or nodenext. In Node ESM, imports must name the file Node loads after compiling, which is the .js file. Bundler projects get no extension. You can choose yourself with veyraPath.importExtension.'},
  {q:'Will it flag my page links as broken?',a:'No. In HTML and Markdown only paths to files, like ./styles/main.css, are checked. Links to pages such as /about are routes, not files, so they are left alone.'},
  {q:'Is it the same as the Path Intellisense extension?',a:'It is an independent extension, written from scratch and inspired by the classic Path Intellisense. It adds checks for broken paths, project-aware import extensions, package.json imports and image previews.'},
];

export default function PathIntelliSensePage(){
  const app={
    '@context':'https://schema.org','@type':'SoftwareApplication',name:'Path IntelliSense Veyra',applicationCategory:'DeveloperApplication',
    operatingSystem:'Windows, macOS, Linux',url:absolute('/path-intellisense'),image:absolute('/path-intellisense-icon.png'),softwareVersion:EXT.version,downloadUrl:EXT.listed?MARKETPLACE:VSIX,
    description:'A free VS Code extension that autocompletes file paths in imports, HTML, CSS and Markdown, understands tsconfig aliases, and flags broken paths.',
    offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},publisher:{'@type':'Organization',name:'Veyra',url:absolute('/')},
  };
  const faq={'@context':'https://schema.org','@type':'FAQPage',mainEntity:FAQ.map(item=>({'@type':'Question',name:item.q,acceptedAnswer:{'@type':'Answer',text:item.a}}))};

  return <><Nav/><Breadcrumbs items={[{name:'Extensions',path:'/extensions'},{name:'Path IntelliSense Veyra',path:'/path-intellisense'}]}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(app)}}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(faq)}}/>
    <main className="page-shell"><div className="content live-page">
      <section className="live-hero">
        <div className="live-hero-glow" aria-hidden="true"/>
        <div className="live-icon"><Image src="/path-intellisense-icon.png" width={148} height={148} alt="Path IntelliSense Veyra icon" priority/></div>
        <span className="live-kicker"><i/>NEW · FOR VS CODE</span>
        <h1>Path IntelliSense <em>Veyra</em></h1>
        <p className="live-tagline">File paths, completed as you type.</p>
        <p className="live-intro">Start a path with ./, ../, / or one of your aliases, and see the folders and files that are really there. Imports are written the way your project needs, and paths that don&apos;t exist are flagged with a fix.</p>
        <div className="live-actions">
          {EXT.listed?<a className="primary" href={MARKETPLACE}><Zap size={16}/>Get it for VS Code</a>:<a className="primary" href={VSIX}><Download size={16}/>Download for VS Code</a>}
          <a className="secondary" href="#install"><Zap size={16}/>How to install</a>
        </div>
        <p className="live-micro">{EXT.id} · v{EXT.version} · Free · MIT · Windows, macOS, Linux</p>
      </section>

      <section className="pm-shot"><img src="/path-intellisense-completion.webp" alt="Completing @/assets/ with folders first, images with their sizes and an image preview" width={1600} height={760}/></section>

      <section className="content-section">
        <header><span>FEATURES</span><h2>Every path, one keystroke away.</h2></header>
        <div className="cards">{FEATURES.map(feature=><article className="card" key={feature.title}><feature.icon/><h3>{feature.title}</h3><p>{feature.copy}</p></article>)}</div>
      </section>

      <section className="pm-shot"><img src="/path-intellisense-broken.webp" alt="A misspelled import path underlined, with the quick fix Change to ./utils/format" width={1600} height={640} loading="lazy"/></section>

      <section className="pm-shot"><img src="/path-intellisense-style.webp" alt="A bundler project importing without an extension, and a Node ESM project importing ./db.js" width={1600} height={700} loading="lazy"/></section>

      <section className="content-section split" id="install">
        <div>
          <span className="kicker">INSTALL</span>
          <h2>Ready in a minute.</h2>
          {EXT.listed?<ol className="live-install">
            <li>In VS Code, open <strong>Extensions</strong> (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>) and search for <strong>Path IntelliSense Veyra</strong>, or open it on the <a href={MARKETPLACE}>Visual Studio Marketplace</a>.</li>
            <li>Click <strong>Install</strong>. There&apos;s nothing to set up.</li>
          </ol>:<ol className="live-install">
            <li><a href={VSIX}>Download the <code>.vsix</code></a> (22 KB).</li>
            <li>In VS Code, press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> and run <strong>Extensions: Install from VSIX…</strong>, then choose the file.</li>
            <li>Type <code>import x from &quot;./</code> in any file. There&apos;s nothing to set up.</li>
          </ol>}
          <p className="live-note">Pairs well with <Link href="/npm-intellisense">Veyra npm IntelliSense</Link>, which completes package names. {EXT.listed?'':'Coming to the Visual Studio Marketplace soon.'}</p>
        </div>
        <div className="visual" aria-label="Imports written for each project">
          <small>Inserted for you</small>
          <b>Vite, Next.js</b> <i>./components/Header</i><br/>
          <b>Node ESM</b> <i>./db.js</i><br/>
          <b>Aliases</b> <i>@/lib/db</i><br/>
          <span style={{color:'#5f6d7a'}}>read from tsconfig.json</span>
        </div>
      </section>

      <section className="content-section">
        <header><span>FAQ</span><h2>Questions</h2></header>
        <div className="live-faq">{FAQ.map(item=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
        <MoreExtensions current="/path-intellisense"/>
      </section>

      <ClosingCTA title="Made by the Veyra team." copy="Veyra Studio is a fast, free code editor with Live Server, Python debugging and Veyra AI built in."/>
    </div></main><Footer/></>;
}
