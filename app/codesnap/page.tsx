import type {Metadata} from 'next';
import Image from 'next/image';
import {Clipboard,Download,Highlighter,Image as ImageIcon,LayoutTemplate,Lock,Palette,Ratio,Sparkles,Zap} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {MoreExtensions} from '@/components/MoreExtensions';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {ClosingCTA} from '@/components/ContentPage';
import {absolute,jsonLd,marketplaceUrl,VSCODE_EXTENSIONS,vsixUrl} from '@/lib/site';
import '../live-server/live-server.css';
import '../port-manager/port-manager.css';

const EXT=VSCODE_EXTENSIONS.codesnap;
const MARKETPLACE=marketplaceUrl(EXT.id), VSIX=vsixUrl(EXT);

export const metadata:Metadata={
  title:'CodeSnap for VS Code: Beautiful Code Screenshots',
  description:'Turn code into beautiful images in VS Code: your theme’s colours, gradient backgrounds, window frames, highlighted lines and social media sizes. Copy or save as PNG. Free.',
  keywords:['codesnap','code screenshot','VS Code screenshot','code image','share code','carbon','code snippet image','VS Code extension'],
  alternates:{canonical:'/codesnap'},
  openGraph:{url:'/codesnap',title:'CodeSnap Veyra',description:'Your code, as a beautiful image. Free for VS Code.',images:[{url:'/codesnap-hero.webp',width:1920,height:960,alt:'A code snippet as an image on a gradient, with highlighted lines'}]},
};

const FEATURES=[
  {icon:Palette,title:'Your theme’s colours',copy:'Exactly what you see in the editor, from any theme, light or dark.'},
  {icon:Highlighter,title:'Highlight what matters',copy:'Click lines in the preview to highlight them while the rest fade back.'},
  {icon:ImageIcon,title:'Gorgeous backgrounds',copy:'Ten hand-picked gradients, a solid colour of your choice, or transparent.'},
  {icon:LayoutTemplate,title:'A window to match',copy:'A macOS or Windows window with your file’s name, or no window at all.'},
  {icon:Ratio,title:'Social media sizes',copy:'Fit the code, or square, 16:9 and LinkedIn shapes with the window centred.'},
  {icon:Zap,title:'Live',copy:'Change the selection and the snap follows, so you can try a few before you share.'},
  {icon:Clipboard,title:'Copy or save',copy:'Copy the image and paste it anywhere, or save a sharp PNG at 2× or 3×.'},
  {icon:Sparkles,title:'Neat by default',copy:'Shared indentation is removed, tabs line up, and line numbers start at the real line.'},
  {icon:Lock,title:'Private',copy:'Everything happens on your computer, and your clipboard is put back afterwards.'},
];
const FAQ=[
  {q:'Is it free?',a:'Yes. CodeSnap Veyra is free and MIT licensed, with no account and no telemetry.'},
  {q:'How do I take a snap?',a:'Select some code and press Ctrl+Alt+S (Cmd+Alt+S on a Mac), or right-click and choose Snap Code to an Image.'},
  {q:'Will it use my theme’s colours?',a:'Yes. It uses VS Code’s own Copy with Syntax Highlighting, so the colours are exactly those of your theme.'},
  {q:'What happens to my clipboard?',a:'CodeSnap Veyra copies the selection to read its colours, then puts back the text that was on your clipboard before.'},
  {q:'Is it the same as the CodeSnap extension?',a:'It is an independent extension, written from scratch, with highlighted lines, social media sizes, live updates and a sharp canvas-drawn image.'},
];

export default function CodeSnapPage(){
  const app={
    '@context':'https://schema.org','@type':'SoftwareApplication',name:'CodeSnap Veyra',applicationCategory:'DeveloperApplication',
    operatingSystem:'Windows, macOS, Linux',url:absolute('/codesnap'),image:absolute('/codesnap-icon.png'),softwareVersion:EXT.version,downloadUrl:EXT.listed?MARKETPLACE:VSIX,
    description:'A free VS Code extension that turns code into beautiful images to share.',
    offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},publisher:{'@type':'Organization',name:'Veyra',url:absolute('/')},
  };
  const faq={'@context':'https://schema.org','@type':'FAQPage',mainEntity:FAQ.map(item=>({'@type':'Question',name:item.q,acceptedAnswer:{'@type':'Answer',text:item.a}}))};

  return <><Nav/><Breadcrumbs items={[{name:'Extensions',path:'/extensions'},{name:'CodeSnap Veyra',path:'/codesnap'}]}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(app)}}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(faq)}}/>
    <main className="page-shell"><div className="content live-page">
      <section className="live-hero">
        <div className="live-hero-glow" aria-hidden="true"/>
        <div className="live-icon"><Image src="/codesnap-icon.png" width={148} height={148} alt="CodeSnap Veyra icon" priority/></div>
        <span className="live-kicker"><i/>NEW · FOR VS CODE</span>
        <h1>CodeSnap <em>Veyra</em></h1>
        <p className="live-tagline">Your code, as a beautiful image.</p>
        <p className="live-intro">Select some code, press Ctrl+Alt+S, and share it on X, LinkedIn, in docs or on slides: your theme’s colours, a gradient, a window, and the lines that matter highlighted.</p>
        <div className="live-actions">
          {EXT.listed?<a className="primary" href={MARKETPLACE}><Zap size={16}/>Get it for VS Code</a>:<a className="primary" href={VSIX}><Download size={16}/>Download for VS Code</a>}
          <a className="secondary" href="#install"><Zap size={16}/>How to install</a>
        </div>
        <p className="live-micro">{EXT.id} · v{EXT.version} · Free · MIT · Windows, macOS, Linux</p>
      </section>

      <section className="pm-shot"><img src="/codesnap-example-dark.webp" alt="A TypeScript snippet on a gradient in a macOS-style window, with two highlighted lines" width={1488} height={644}/></section>

      <section className="content-section">
        <header><span>FEATURES</span><h2>Share code that looks as good as it reads.</h2></header>
        <div className="cards">{FEATURES.map(feature=><article className="card" key={feature.title}><feature.icon/><h3>{feature.title}</h3><p>{feature.copy}</p></article>)}</div>
      </section>

      <section className="pm-shot"><img src="/codesnap-vscode.webp" alt="VS Code with code selected and the CodeSnap panel beside it" width={1400} height={800} loading="lazy"/></section>

      <section className="content-section split" id="install">
        <div>
          <span className="kicker">INSTALL</span>
          <h2>Ready in a minute.</h2>
          {EXT.listed?<ol className="live-install">
            <li>In VS Code, open <strong>Extensions</strong> (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>) and search for <strong>CodeSnap Veyra</strong>, or open it on the <a href={MARKETPLACE}>Visual Studio Marketplace</a>.</li>
            <li>Click <strong>Install</strong>, select some code and press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>S</kbd>.</li>
          </ol>:<ol className="live-install">
            <li><a href={VSIX}>Download the <code>.vsix</code></a> (26 KB).</li>
            <li>In VS Code, press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> and run <strong>Extensions: Install from VSIX…</strong>, then choose the file.</li>
            <li>Select some code and press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>S</kbd>.</li>
          </ol>}
          <p className="live-note">Click lines in the preview to highlight them before you copy. {EXT.listed?'':'Coming to the Visual Studio Marketplace soon.'}</p>
        </div>
        <div className="visual" aria-label="Sizes">
          <small>Sizes</small>
          <b>Fit the code</b> <i>for docs and chats</i><br/>
          <b>Square 1:1</b> <i>for Instagram</i><br/>
          <b>Wide 16:9</b> <i>for X and slides</i><br/>
          <b>LinkedIn</b> <i>1.91:1</i>
        </div>
      </section>

      <section className="pm-shot"><img src="/codesnap-example-light.webp" alt="The same snippet from a light theme, on a soft pink-to-blue gradient" width={1488} height={644} loading="lazy"/></section>

      <section className="content-section">
        <header><span>FAQ</span><h2>Questions</h2></header>
        <div className="live-faq">{FAQ.map(item=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
        <MoreExtensions current="/codesnap"/>
      </section>

      <ClosingCTA title="Made by the Veyra team." copy="Veyra Studio is a fast, free code editor with Live Server, Python debugging and Veyra AI built in."/>
    </div></main><Footer/></>;
}
