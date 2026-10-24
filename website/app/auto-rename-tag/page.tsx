import type {Metadata} from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {Blocks,Braces,Code2,Download,Keyboard,Layers,ShieldCheck,Sparkles,Undo2,Users,Zap} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {MoreExtensions} from '@/components/MoreExtensions';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {ClosingCTA} from '@/components/ContentPage';
import {absolute,jsonLd,marketplaceUrl,VSCODE_EXTENSIONS,vsixUrl} from '@/lib/site';
import '../live-server/live-server.css';
import '../port-manager/port-manager.css';

const EXT=VSCODE_EXTENSIONS.autoRenameTag;
const MARKETPLACE=marketplaceUrl(EXT.id), VSIX=vsixUrl(EXT);

export const metadata:Metadata={
  title:'Auto Rename Tag for VS Code: Rename HTML and JSX Tag Pairs',
  description:'Rename an HTML, JSX or XML tag in VS Code and its closing tag changes with it as you type. React, Vue, Svelte, Astro, XML and PHP, with nested tags and fragments handled. Free.',
  keywords:['auto rename tag','rename html tag','rename jsx tag','VS Code rename tag','closing tag','react','vue','svelte','VS Code extension'],
  alternates:{canonical:'/auto-rename-tag'},
  openGraph:{url:'/auto-rename-tag',title:'Auto Rename Tag Veyra',description:'Rename one tag, and its pair follows. Free for VS Code.',images:[{url:'/auto-rename-tag-hero.webp',width:1920,height:960,alt:'Renaming Card to PlanCard in a React component, with the closing tag following'}]},
};

const FEATURES=[
  {icon:Keyboard,title:'As you type',copy:'Add, delete or replace letters in either tag, and the other one keeps up, letter by letter.'},
  {icon:Layers,title:'Nested tags',copy:'A <div> inside a <div> inside a <div>: the right closing tag is always the one that changes.'},
  {icon:Braces,title:'Real-world JSX',copy:'Components like <Foo.Bar>, attributes like onClick={() => a > b}, and fragments that become elements.'},
  {icon:Blocks,title:'Every template',copy:'HTML, React, Vue, Svelte, Astro, XML, PHP, Razor, Blade, Twig, Liquid and more.'},
  {icon:Undo2,title:'Undo stays in step',copy:'Each undo takes both tags back together, so they never end up mismatched.'},
  {icon:Users,title:'Plays well with others',copy:'With VS Code’s own linked editing on, tags are renamed once, not twice.'},
  {icon:ShieldCheck,title:'Knows when to stop',copy:'Attributes, self-closing tags, invalid names, comparisons and multiple cursors are left alone.'},
  {icon:Code2,title:'Comments and scripts',copy:'Tags inside comments, CDATA and <script> blocks are never mistaken for the real pair.'},
  {icon:Sparkles,title:'Tiny and private',copy:'16 KB, nothing to set up, and nothing sent anywhere.'},
];
const FAQ=[
  {q:'Is it free?',a:'Yes. Auto Rename Tag Veyra is free and MIT licensed, with no account and no telemetry.'},
  {q:'Which languages does it work in?',a:'HTML, XML, SVG, React (JSX and TSX, including .js files), Vue, Svelte, Astro, PHP, Razor, Blade, Twig, Jinja, Liquid, Handlebars, Markdown and MDX. Add more with the veyraRename.languages setting.'},
  {q:'Doesn’t VS Code do this already?',a:'VS Code’s linked editing does it for HTML when you turn it on. Auto Rename Tag Veyra also works in JSX, Vue, Svelte and the other templates, and the two work fine together.'},
  {q:'What happens when I press undo?',a:'Both tags go back together. Each undo step keeps the opening and closing tags in step.'},
  {q:'Is it the same as the Auto Rename Tag extension?',a:'It is an independent extension, written from scratch, that understands JSX attributes, fragments, comments and script blocks.'},
];

export default function AutoRenameTagPage(){
  const app={
    '@context':'https://schema.org','@type':'SoftwareApplication',name:'Auto Rename Tag Veyra',applicationCategory:'DeveloperApplication',
    operatingSystem:'Windows, macOS, Linux',url:absolute('/auto-rename-tag'),image:absolute('/auto-rename-tag-icon.png'),softwareVersion:EXT.version,downloadUrl:EXT.listed?MARKETPLACE:VSIX,
    description:'A free VS Code extension that renames the paired HTML, JSX or XML tag as you type.',
    offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},publisher:{'@type':'Organization',name:'Veyra',url:absolute('/')},
  };
  const faq={'@context':'https://schema.org','@type':'FAQPage',mainEntity:FAQ.map(item=>({'@type':'Question',name:item.q,acceptedAnswer:{'@type':'Answer',text:item.a}}))};

  return <><Nav/><Breadcrumbs items={[{name:'Extensions',path:'/extensions'},{name:'Auto Rename Tag Veyra',path:'/auto-rename-tag'}]}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(app)}}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(faq)}}/>
    <main className="page-shell"><div className="content live-page">
      <section className="live-hero">
        <div className="live-hero-glow" aria-hidden="true"/>
        <div className="live-icon"><Image src="/auto-rename-tag-icon.png" width={148} height={148} alt="Auto Rename Tag Veyra icon" priority/></div>
        <span className="live-kicker"><i/>NEW · FOR VS CODE</span>
        <h1>Auto Rename Tag <em>Veyra</em></h1>
        <p className="live-tagline">Rename one tag, and its pair follows.</p>
        <p className="live-intro">Change &lt;div&gt; to &lt;section&gt; and the closing tag changes with it, as you type. In HTML, React, Vue, Svelte, Astro, XML and PHP.</p>
        <div className="live-actions">
          {EXT.listed?<a className="primary" href={MARKETPLACE}><Zap size={16}/>Get it for VS Code</a>:<a className="primary" href={VSIX}><Download size={16}/>Download for VS Code</a>}
          <a className="secondary" href="#install"><Zap size={16}/>How to install</a>
        </div>
        <p className="live-micro">{EXT.id} · v{EXT.version} · Free · MIT · Windows, macOS, Linux</p>
      </section>

      <section className="pm-shot"><img src="/auto-rename-tag-dark.webp" alt="Before and after: typing PlanCard over Card in the opening tag, and the closing tag becomes PlanCard too" width={1400} height={480}/></section>

      <section className="content-section">
        <header><span>FEATURES</span><h2>Never chase a closing tag again.</h2></header>
        <div className="cards">{FEATURES.map(feature=><article className="card" key={feature.title}><feature.icon/><h3>{feature.title}</h3><p>{feature.copy}</p></article>)}</div>
      </section>

      <section className="pm-shot"><img src="/auto-rename-tag-light.webp" alt="The same rename in a light theme" width={1400} height={480} loading="lazy"/></section>

      <section className="content-section split" id="install">
        <div>
          <span className="kicker">INSTALL</span>
          <h2>Ready in a minute.</h2>
          {EXT.listed?<ol className="live-install">
            <li>In VS Code, open <strong>Extensions</strong> (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>) and search for <strong>Auto Rename Tag Veyra</strong>, or open it on the <a href={MARKETPLACE}>Visual Studio Marketplace</a>.</li>
            <li>Click <strong>Install</strong>, then rename any tag.</li>
          </ol>:<ol className="live-install">
            <li><a href={VSIX}>Download the <code>.vsix</code></a> (16 KB).</li>
            <li>In VS Code, press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> and run <strong>Extensions: Install from VSIX…</strong>, then choose the file.</li>
            <li>Open an HTML or React file and rename a tag. There&apos;s nothing to set up.</li>
          </ol>}
          <p className="live-note">Pairs well with <Link href="/live-server">Veyra Live Server</Link>, which shows your page in the browser as you save. {EXT.listed?'':'Coming to the Visual Studio Marketplace soon.'}</p>
        </div>
        <div className="visual" aria-label="Examples">
          <small>You type, it follows</small>
          <b>&lt;div&gt;</b> <i>→ &lt;section&gt; … &lt;/section&gt;</i><br/>
          <b>&lt;Card&gt;</b> <i>→ &lt;PlanCard&gt; … &lt;/PlanCard&gt;</i><br/>
          <b>&lt;&gt;</b> <i>→ &lt;main&gt; … &lt;/main&gt;</i>
        </div>
      </section>

      <section className="content-section">
        <header><span>FAQ</span><h2>Questions</h2></header>
        <div className="live-faq">{FAQ.map(item=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
        <MoreExtensions current="/auto-rename-tag"/>
      </section>

      <ClosingCTA title="Made by the Veyra team." copy="Veyra Studio is a fast, free code editor with Live Server, Python debugging and Veyra AI built in."/>
    </div></main><Footer/></>;
}
