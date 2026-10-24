import type {Metadata} from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {AtSign,ClipboardList,Download,Filter,FolderTree,Highlighter,Languages,RefreshCw,Sparkles,Tags,Zap} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {ClosingCTA} from '@/components/ContentPage';
import {absolute,jsonLd,marketplaceUrl,VSCODE_EXTENSIONS,vsixUrl} from '@/lib/site';
import '../live-server/live-server.css';
import '../port-manager/port-manager.css';

const EXT=VSCODE_EXTENSIONS.todoTree;
const MARKETPLACE=marketplaceUrl(EXT.id), VSIX=vsixUrl(EXT);

export const metadata:Metadata={
  title:'Todo Tree for VS Code: Every TODO and FIXME in One Place',
  description:'List every TODO, FIXME, BUG, HACK and NOTE in your project in one tree in VS Code. Grouped by file or tag, coloured in your code, with owners, a filter and a Markdown checklist. Free.',
  keywords:['todo tree','VS Code todo','find todos','fixme','todo highlight','todo list','code comments','VS Code extension'],
  alternates:{canonical:'/todo-tree'},
  openGraph:{url:'/todo-tree',title:'Todo Tree Veyra',description:'Every TODO in your project, in one tree. Free for VS Code.',images:[{url:'/todo-tree-hero.webp',width:1920,height:960,alt:'The Todo Tree panel next to code with coloured TODO, FIXME and HACK tags'}]},
};

const FEATURES=[
  {icon:FolderTree,title:'One tree for everything',copy:'Every TODO, FIXME, BUG, HACK, XXX and NOTE, grouped by folder and file, with a count on the icon.'},
  {icon:Tags,title:'Or by tag',copy:'Switch to see all the FIXMEs together, then all the TODOs, with the file and line next to each.'},
  {icon:Highlighter,title:'Colour in your code',copy:'Tags are coloured in the editor and the scroll bar: amber TODO, red FIXME and BUG, purple HACK, blue NOTE.'},
  {icon:AtSign,title:'Who it’s for',copy:'TODO(@sam) shows @sam next to it. Filter by a name to see just your own.'},
  {icon:Filter,title:'Filter in a keystroke',copy:'Show only what matches a word, a tag, an owner or a folder, like login, FIXME, @sam or src/api.'},
  {icon:ClipboardList,title:'Copy as a checklist',copy:'Every tag as a Markdown checklist with files and lines, ready for an issue or a pull request.'},
  {icon:RefreshCw,title:'Always current',copy:'New tags show up as you type, before you save, and when files are added or deleted.'},
  {icon:Languages,title:'Every language',copy:'Comments in JavaScript, Python, HTML, SQL, shell, Markdown task lists and many more.'},
  {icon:Sparkles,title:'Nothing to install',copy:'It reads files through VS Code, so it works in remote and web workspaces, and nothing is sent anywhere.'},
];
const FAQ=[
  {q:'Is it free?',a:'Yes. Todo Tree Veyra is free and MIT licensed, with no account and no telemetry.'},
  {q:'Which tags does it find?',a:'TODO, FIXME, BUG, HACK, XXX and NOTE, written in capitals at the start of a comment. Add your own, like REVIEW, with the veyraTodo.tags setting.'},
  {q:'Does it look in node_modules?',a:'No. node_modules, dist, build, out, minified files and anything in your files.exclude or search.exclude settings are skipped, and so are big and binary files.'},
  {q:'How do I see only my own TODOs?',a:'Write them as TODO(@yourname): … and filter the tree by @yourname.'},
  {q:'Is it the same as the Todo Tree extension?',a:'It is an independent extension, written from scratch, with owners, a Markdown checklist export and updates as you type, and nothing extra to install.'},
];

export default function TodoTreePage(){
  const app={
    '@context':'https://schema.org','@type':'SoftwareApplication',name:'Todo Tree Veyra',applicationCategory:'DeveloperApplication',
    operatingSystem:'Windows, macOS, Linux',url:absolute('/todo-tree'),image:absolute('/todo-tree-icon.png'),softwareVersion:EXT.version,downloadUrl:EXT.listed?MARKETPLACE:VSIX,
    description:'A free VS Code extension that lists every TODO, FIXME, BUG, HACK and NOTE in a project in one tree and colours them in the editor.',
    offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},publisher:{'@type':'Organization',name:'Veyra',url:absolute('/')},
  };
  const faq={'@context':'https://schema.org','@type':'FAQPage',mainEntity:FAQ.map(item=>({'@type':'Question',name:item.q,acceptedAnswer:{'@type':'Answer',text:item.a}}))};

  return <><Nav/><Breadcrumbs items={[{name:'Extensions',path:'/extensions'},{name:'Todo Tree Veyra',path:'/todo-tree'}]}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(app)}}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(faq)}}/>
    <main className="page-shell"><div className="content live-page">
      <section className="live-hero">
        <div className="live-hero-glow" aria-hidden="true"/>
        <div className="live-icon"><Image src="/todo-tree-icon.png" width={148} height={148} alt="Todo Tree Veyra icon" priority/></div>
        <span className="live-kicker"><i/>NEW · FOR VS CODE</span>
        <h1>Todo Tree <em>Veyra</em></h1>
        <p className="live-tagline">Every TODO in your project, in one tree.</p>
        <p className="live-intro">Find every TODO, FIXME, BUG, HACK and NOTE in your comments, grouped by file or by tag. Click one to jump to it, see who it&apos;s for, and copy them all as a checklist.</p>
        <div className="live-actions">
          {EXT.listed?<a className="primary" href={MARKETPLACE}><Zap size={16}/>Get it for VS Code</a>:<a className="primary" href={VSIX}><Download size={16}/>Download for VS Code</a>}
          <a className="secondary" href="#install"><Zap size={16}/>How to install</a>
        </div>
        <p className="live-micro">{EXT.id} · v{EXT.version} · Free · MIT · Windows, macOS, Linux</p>
      </section>

      <section className="pm-shot"><img src="/todo-tree-by-file.webp" alt="The Todo Tree panel grouped by folder and file next to code with coloured tags" width={1400} height={760}/></section>

      <section className="content-section">
        <header><span>FEATURES</span><h2>Never lose a TODO again.</h2></header>
        <div className="cards">{FEATURES.map(feature=><article className="card" key={feature.title}><feature.icon/><h3>{feature.title}</h3><p>{feature.copy}</p></article>)}</div>
      </section>

      <section className="pm-shot"><img src="/todo-tree-by-tag.webp" alt="The tags grouped under TODO, FIXME, BUG, HACK, XXX and NOTE in a light theme" width={1400} height={760} loading="lazy"/></section>

      <section className="content-section split" id="install">
        <div>
          <span className="kicker">INSTALL</span>
          <h2>Ready in a minute.</h2>
          {EXT.listed?<ol className="live-install">
            <li>In VS Code, open <strong>Extensions</strong> (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>) and search for <strong>Todo Tree Veyra</strong>, or open it on the <a href={MARKETPLACE}>Visual Studio Marketplace</a>.</li>
            <li>Click <strong>Install</strong>, then the checklist icon in the activity bar.</li>
          </ol>:<ol className="live-install">
            <li><a href={VSIX}>Download the <code>.vsix</code></a> (21 KB).</li>
            <li>In VS Code, press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> and run <strong>Extensions: Install from VSIX…</strong>, then choose the file.</li>
            <li>Click the checklist icon in the activity bar. There&apos;s nothing to set up.</li>
          </ol>}
          <p className="live-note">Pairs well with <Link href="/error-lens">Error Lens Veyra</Link>, which shows problems right on their lines. {EXT.listed?'':'Coming to the Visual Studio Marketplace soon.'}</p>
        </div>
        <div className="visual" aria-label="Tags it finds">
          <small>In any comment</small>
          <b>{'// TODO:'}</b> <i>remember the user</i><br/>
          <b>{'# FIXME(@maya):'}</b> <i>rounding</i><br/>
          <b>{'<!-- NOTE:'}</b> <i>prices in cents</i><br/>
          <b>{'- [ ] TODO'}</b> <i>write the guide</i>
        </div>
      </section>

      <section className="content-section">
        <header><span>FAQ</span><h2>Questions</h2></header>
        <div className="live-faq">{FAQ.map(item=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
        <p className="live-more"><Sparkles size={14}/>More for VS Code: <Link href="/error-lens">Error Lens Veyra</Link>, <Link href="/git-graph">Git Graph Veyra</Link>, <Link href="/path-intellisense">Path IntelliSense Veyra</Link> and <Link href="/document-viewer">Veyra Document Viewer</Link>.</p>
      </section>

      <ClosingCTA title="Made by the Veyra team." copy="Veyra Studio is a fast, free code editor with Live Server, Python debugging and Veyra AI built in."/>
    </div></main><Footer/></>;
}
