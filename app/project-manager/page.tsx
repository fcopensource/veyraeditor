import type {Metadata} from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {Download,FileJson,FolderGit2,History,Keyboard,Layers,PanelBottom,ShieldCheck,Star,Tags,Zap} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {MoreExtensions} from '@/components/MoreExtensions';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {Installs} from '@/components/Installs';
import {ClosingCTA} from '@/components/ContentPage';
import {absolute,jsonLd,marketplaceUrl,VSCODE_EXTENSIONS,vsixUrl} from '@/lib/site';
import {liveExtension} from '@/lib/catalog';
import '../live-server/live-server.css';
import '../port-manager/port-manager.css';

const EXT_BASE=VSCODE_EXTENSIONS.projectManager;
const MARKETPLACE=marketplaceUrl(EXT_BASE.id), VSIX=vsixUrl(EXT_BASE);

export const metadata:Metadata={
  title:'Project Manager for VS Code: Switch Projects in a Keystroke',
  description:'Save folders as projects, find every Git repository on your disk, and reopen recent folders from one sidebar and one search box in VS Code. Tags, sorting, and a projects.json you can sync. Free.',
  keywords:['project manager','VS Code project manager','switch projects','VS Code workspaces','git repositories','recent folders','favorite projects','VS Code extension'],
  alternates:{canonical:'/project-manager'},
  openGraph:{url:'/project-manager',title:'Project Manager Veyra',description:'Switch between your projects in a keystroke. Free for VS Code.',images:[{url:'/project-manager-hero.jpg',width:1400,height:760,alt:'The Projects sidebar and the Open a Project search box in VS Code'}]},
};

const FEATURES=[
  {icon:Keyboard,title:'One keystroke',copy:'Shift+Alt+P opens a search box with every project. Type a few letters, press Enter, and you’re there.'},
  {icon:Star,title:'Saved projects',copy:'Save the open folder, or any folder from the Explorer, with a name you choose. They stay at the top.'},
  {icon:FolderGit2,title:'Git repositories, found',copy:'Choose the folders you keep code in and every repository inside shows up. node_modules, build output and hidden folders are skipped.'},
  {icon:History,title:'Recent folders',copy:'The folders VS Code opened lately, right in the sidebar, without digging through File → Open Recent.'},
  {icon:Tags,title:'Tags and sorting',copy:'Tag projects work, clients or learning, group the sidebar by tag, and sort by name or by the most recently opened.'},
  {icon:Layers,title:'Know what it is',copy:'Node.js, Python, Rust, Go, Java, .NET, PHP, Ruby, Dart and C/C++ projects each get their own icon.'},
  {icon:PanelBottom,title:'Always know where you are',copy:'The project’s name in the status bar. Click it to switch. Open any project here, in a new window, or in a terminal.'},
  {icon:FileJson,title:'A plain projects.json',copy:'Edit it by hand, keep it in a synced folder to share it between computers, or bring the one from another project manager.'},
  {icon:ShieldCheck,title:'Private and safe',copy:'Nothing is sent anywhere, and your folders are never touched: removing a project only takes it off the list.'},
];
const FAQ=[
  {q:'Is it free?',a:'Yes. Project Manager Veyra is free and MIT licensed, with no account and no telemetry.'},
  {q:'How do I switch projects?',a:'Press Shift+Alt+P, type part of the name and press Enter. Use the window button next to a project to open it in a new window, or set veyraProjects.openInNewWindow to always do that.'},
  {q:'How does it find my Git repositories?',a:'Run “Add a Folder to Look for Git Repositories In” and pick the folders you keep code in. It looks up to 4 folders deep (veyraProjects.scanDepth) for folders with a .git inside, and skips dependencies, build output and hidden folders.'},
  {q:'Can I use my projects on more than one computer?',a:'Yes. Set veyraProjects.projectsLocation to a folder that syncs, like OneDrive, Dropbox or iCloud, and every computer uses the same projects.json.'},
  {q:'I already use another project manager. Can I bring my list?',a:'Yes. It reads the same projects.json format. Point veyraProjects.projectsLocation at the folder that holds yours.'},
  {q:'Is it the same as the Project Manager extension?',a:'It is an independent extension, written from scratch, with Git repositories, recent folders and saved projects in one list, and an icon for each kind of project.'},
];

export default async function ProjectManagerPage(){
  const EXT=await liveExtension(EXT_BASE);
  const app={
    '@context':'https://schema.org','@type':'SoftwareApplication',name:'Project Manager Veyra',applicationCategory:'DeveloperApplication',
    operatingSystem:'Windows, macOS, Linux',url:absolute('/project-manager'),image:absolute('/project-manager-icon.png'),softwareVersion:EXT.version,downloadUrl:EXT.listed?MARKETPLACE:VSIX,
    description:'A free VS Code extension to save projects, find Git repositories and switch between them in a keystroke.',
    offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},publisher:{'@type':'Organization',name:'Veyra',url:absolute('/')},
  };
  const faq={'@context':'https://schema.org','@type':'FAQPage',mainEntity:FAQ.map(item=>({'@type':'Question',name:item.q,acceptedAnswer:{'@type':'Answer',text:item.a}}))};

  return <><Nav/><Breadcrumbs items={[{name:'Extensions',path:'/extensions'},{name:'Project Manager Veyra',path:'/project-manager'}]}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(app)}}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(faq)}}/>
    <main className="page-shell"><div className="content live-page">
      <section className="live-hero">
        <div className="live-hero-glow" aria-hidden="true"/>
        <div className="live-icon"><Image src="/project-manager-icon.png" width={148} height={148} alt="Project Manager Veyra icon" priority/></div>
        <span className="live-kicker"><i/>NEW · FOR VS CODE</span>
        <h1>Project Manager <em>Veyra</em></h1>
        <p className="live-tagline">Switch between your projects in a keystroke.</p>
        <p className="live-intro">Save the folders you work in, find every Git repository on your disk, and jump back to recent folders, all from one sidebar and one search box. Press Shift+Alt+P, type, Enter.</p>
        <div className="live-actions">
          {EXT.listed?<a className="primary" href={MARKETPLACE}><Zap size={16}/>Get it for VS Code</a>:<a className="primary" href={VSIX}><Download size={16}/>Download for VS Code</a>}
          <a className="secondary" href="#install"><Zap size={16}/>How to install</a>
        </div>
        <p className="live-micro"><Installs id={EXT.id}/>{EXT.id} · v{EXT.version} · Free · MIT · Windows, macOS, Linux</p>
      </section>

      <section className="pm-shot"><img src="/project-manager-hero.jpg" alt="The Projects sidebar with saved projects, Git repositories and recent folders, and the Open a Project search box filtering to projects matching ap" width={1400} height={760}/></section>

      <section className="content-section">
        <header><span>FEATURES</span><h2>Every project, one keystroke away.</h2></header>
        <div className="cards">{FEATURES.map(feature=><article className="card" key={feature.title}><feature.icon/><h3>{feature.title}</h3><p>{feature.copy}</p></article>)}</div>
      </section>

      <section className="content-section split" id="install">
        <div>
          <span className="kicker">INSTALL</span>
          <h2>Ready in a minute.</h2>
          {EXT.listed?<ol className="live-install">
            <li>In VS Code, open <strong>Extensions</strong> (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>) and search for <strong>Project Manager Veyra</strong>, or open it on the <a href={MARKETPLACE}>Visual Studio Marketplace</a>.</li>
            <li>Click <strong>Install</strong>, then the folders icon in the activity bar.</li>
          </ol>:<ol className="live-install">
            <li><a href={VSIX}>Download the <code>.vsix</code></a> (36 KB).</li>
            <li>In VS Code, press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> and run <strong>Extensions: Install from VSIX…</strong>, then choose the file.</li>
            <li>Click the folders icon in the activity bar, then the save icon to save your first project.</li>
          </ol>}
          <p className="live-note">Pairs well with <Link href="/git-graph">Git Graph Veyra</Link>, which draws your repository&apos;s history. {EXT.listed?'':'Coming to the Visual Studio Marketplace soon.'}</p>
        </div>
        <div className="visual" aria-label="Shortcuts">
          <small>Shortcuts</small>
          <b>Shift+Alt+P</b> <i>open a project</i><br/>
          <b>Enter</b> <i>open it here</i><br/>
          <b>window button</b> <i>open in a new window</i><br/>
          <b>status bar</b> <i>switch projects</i>
        </div>
      </section>

      <section className="content-section">
        <header><span>FAQ</span><h2>Questions</h2></header>
        <div className="live-faq">{FAQ.map(item=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
        <MoreExtensions current="/project-manager"/>
      </section>

      <ClosingCTA title="Made by the Veyra team." copy="Veyra Studio is a fast, free code editor with Live Server, Python debugging and Search Everywhere built in."/>
    </div></main><Footer/></>;
}
