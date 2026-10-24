import type {Metadata} from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {ArrowUpDown,Download,GitBranch,GitCompare,GitMerge,Keyboard,Lock,MousePointerClick,Search,Sparkles,Zap} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {ClosingCTA} from '@/components/ContentPage';
import {absolute,jsonLd,marketplaceUrl,VSCODE_EXTENSIONS,vsixUrl} from '@/lib/site';
import '../live-server/live-server.css';
import '../port-manager/port-manager.css';

const EXT=VSCODE_EXTENSIONS.gitGraph;
const MARKETPLACE=marketplaceUrl(EXT.id), VSIX=vsixUrl(EXT);

export const metadata:Metadata={
  title:'Git Graph for VS Code: See Branches, Commits and Merges',
  description:'See your git history as a graph in VS Code: every branch, merge and tag, what each commit changed, and one-click checkout, cherry-pick, revert and compare. Free and private.',
  keywords:['git graph','VS Code git graph','git history','git log graph','branches','cherry-pick','compare commits','VS Code extension'],
  alternates:{canonical:'/git-graph'},
  openGraph:{url:'/git-graph',title:'Git Graph Veyra',description:'Your repository as a graph, in VS Code. Free.',images:[{url:'/git-graph-hero.webp',width:1920,height:960,alt:'Git Graph Veyra showing branches as coloured lanes and a commit’s changed files'}]},
};

const FEATURES=[
  {icon:GitBranch,title:'Every branch at a glance',copy:'Branches as coloured lanes with merges, tags, remote branches and your uncommitted changes on top.'},
  {icon:ArrowUpDown,title:'Ahead and behind',copy:'Branch labels show how many commits you have to push and to pull, so you know before you sync.'},
  {icon:MousePointerClick,title:'What changed',copy:'Click a commit for its message, author and every changed file with its lines. Click a file to open the diff.'},
  {icon:GitCompare,title:'Compare two commits',copy:'Ctrl+click a second commit to see every file that changed between them.'},
  {icon:GitMerge,title:'One-click actions',copy:'Check out, create a branch or tag, cherry-pick, revert, reset, merge, push, rename and delete from a right-click.'},
  {icon:Lock,title:'Asks before it’s risky',copy:'Reset Hard, deleting unmerged branches and other changes that lose work explain what will happen first.'},
  {icon:Search,title:'Find and filter',copy:'Search messages, authors and hashes, or show the history of a single branch.'},
  {icon:Keyboard,title:'Keyboard friendly',copy:'Arrow keys move through commits with the details following along. Ctrl+Alt+G opens the graph.'},
  {icon:Sparkles,title:'Fast and private',copy:'Only the rows on screen are drawn, so long histories stay smooth. Nothing is sent anywhere.'},
];
const FAQ=[
  {q:'Is it free?',a:'Yes. Git Graph Veyra is free and MIT licensed, with no account and no telemetry.'},
  {q:'How do I open it?',a:'Click Git Graph in the status bar or the graph button in the Source Control view, press Ctrl+Alt+G (Cmd+Alt+G on a Mac), or run Git Graph Veyra: View Git Graph from the Command Palette.'},
  {q:'Can it lose my work?',a:'Actions that rewrite or discard work, like Reset Hard or deleting a branch that is not merged, explain what will happen and ask first. Saying no changes nothing.'},
  {q:'Does it send my code or history anywhere?',a:'No. It runs the same git as VS Code on your computer. Authors are shown with their initials, so not even profile pictures are downloaded.'},
  {q:'Is it the same as the Git Graph extension?',a:'It is an independent extension, written from scratch, with ahead and behind counts on branches, commit comparison and line counts for every file.'},
];

export default function GitGraphPage(){
  const app={
    '@context':'https://schema.org','@type':'SoftwareApplication',name:'Git Graph Veyra',applicationCategory:'DeveloperApplication',
    operatingSystem:'Windows, macOS, Linux',url:absolute('/git-graph'),image:absolute('/git-graph-icon.png'),softwareVersion:EXT.version,downloadUrl:EXT.listed?MARKETPLACE:VSIX,
    description:'A free VS Code extension that shows a git repository as a graph, with commit details, diffs, comparisons and one-click actions.',
    offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},publisher:{'@type':'Organization',name:'Veyra',url:absolute('/')},
  };
  const faq={'@context':'https://schema.org','@type':'FAQPage',mainEntity:FAQ.map(item=>({'@type':'Question',name:item.q,acceptedAnswer:{'@type':'Answer',text:item.a}}))};

  return <><Nav/><Breadcrumbs items={[{name:'Extensions',path:'/extensions'},{name:'Git Graph Veyra',path:'/git-graph'}]}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(app)}}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(faq)}}/>
    <main className="page-shell"><div className="content live-page">
      <section className="live-hero">
        <div className="live-hero-glow" aria-hidden="true"/>
        <div className="live-icon"><Image src="/git-graph-icon.png" width={148} height={148} alt="Git Graph Veyra icon" priority/></div>
        <span className="live-kicker"><i/>NEW · FOR VS CODE</span>
        <h1>Git Graph <em>Veyra</em></h1>
        <p className="live-tagline">Your repository, as a graph.</p>
        <p className="live-intro">See every branch, merge and tag at a glance. Click a commit to see what it changed, click a file for the diff, and right-click to check out, cherry-pick or revert.</p>
        <div className="live-actions">
          {EXT.listed?<a className="primary" href={MARKETPLACE}><Zap size={16}/>Get it for VS Code</a>:<a className="primary" href={VSIX}><Download size={16}/>Download for VS Code</a>}
          <a className="secondary" href="#install"><Zap size={16}/>How to install</a>
        </div>
        <p className="live-micro">{EXT.id} · v{EXT.version} · Free · MIT · Windows, macOS, Linux</p>
      </section>

      <section className="pm-shot"><img src="/git-graph-main.webp" alt="Branches as coloured lanes with branch, remote and tag labels, authors, dates and hashes" width={1400} height={900}/></section>

      <section className="content-section">
        <header><span>FEATURES</span><h2>Your history, finally readable.</h2></header>
        <div className="cards">{FEATURES.map(feature=><article className="card" key={feature.title}><feature.icon/><h3>{feature.title}</h3><p>{feature.copy}</p></article>)}</div>
      </section>

      <section className="pm-shot"><img src="/git-graph-details.webp" alt="A commit’s details: message, author, date, hash, parent and its changed files with line counts" width={1400} height={900} loading="lazy"/></section>

      <section className="content-section split" id="install">
        <div>
          <span className="kicker">INSTALL</span>
          <h2>Ready in a minute.</h2>
          {EXT.listed?<ol className="live-install">
            <li>In VS Code, open <strong>Extensions</strong> (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>) and search for <strong>Git Graph Veyra</strong>, or open it on the <a href={MARKETPLACE}>Visual Studio Marketplace</a>.</li>
            <li>Click <strong>Install</strong>, then click <strong>Git Graph</strong> in the status bar.</li>
          </ol>:<ol className="live-install">
            <li><a href={VSIX}>Download the <code>.vsix</code></a> (37 KB).</li>
            <li>In VS Code, press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> and run <strong>Extensions: Install from VSIX…</strong>, then choose the file.</li>
            <li>Open a folder that uses git and click <strong>Git Graph</strong> in the status bar, or press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>G</kbd>.</li>
          </ol>}
          <p className="live-note">It uses the same git as VS Code, so there&apos;s nothing to set up. {EXT.listed?'':'Coming to the Visual Studio Marketplace soon.'}</p>
        </div>
        <div className="visual" aria-label="Right-click actions">
          <small>Right-click a commit</small>
          <b>Create Branch Here</b><br/>
          <b>Cherry-Pick</b> <i>onto main</i><br/>
          <b>Revert</b> <i>with a new commit</i><br/>
          <b>Compare</b> <i>Ctrl+Click</i>
        </div>
      </section>

      <section className="pm-shot"><img src="/git-graph-menu.webp" alt="The right-click menu of a commit with branch, tag, cherry-pick, revert, reset and copy actions" width={1400} height={900} loading="lazy"/></section>

      <section className="content-section">
        <header><span>FAQ</span><h2>Questions</h2></header>
        <div className="live-faq">{FAQ.map(item=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
        <p className="live-more"><Sparkles size={14}/>More for VS Code: <Link href="/document-viewer">Veyra Document Viewer</Link>, <Link href="/path-intellisense">Path IntelliSense Veyra</Link>, <Link href="/env">Veyra Env</Link> and <Link href="/docker">Veyra Container Studio for Docker</Link>.</p>
      </section>

      <ClosingCTA title="Made by the Veyra team." copy="Veyra Studio is a fast, free code editor with Live Server, Python debugging and Veyra AI built in."/>
    </div></main><Footer/></>;
}
