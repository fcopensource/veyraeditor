import type {Metadata} from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {AlertTriangle,Columns3,Download,EyeOff,FileCheck2,GitBranch,Keyboard,RefreshCw,ShieldCheck,Sparkles,Zap} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {MoreExtensions} from '@/components/MoreExtensions';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {ClosingCTA} from '@/components/ContentPage';
import {absolute,jsonLd,marketplaceUrl,VSCODE_EXTENSIONS,vsixUrl} from '@/lib/site';
import '../live-server/live-server.css';
import '../port-manager/port-manager.css';

const EXT=VSCODE_EXTENSIONS.env;
const MARKETPLACE=marketplaceUrl(EXT.id), VSIX=vsixUrl(EXT);

export const metadata:Metadata={
  title:'.env Files in VS Code: dotenv Checks, Secrets and Sync',
  description:'A free VS Code extension for .env files: warnings for missing env variables, autocomplete for process.env, secrets hidden on screen, a .gitignore guard and .env.example kept in sync.',
  keywords:['env','dotenv','.env','env file','environment variables','process.env','VS Code dotenv','.env.example','secrets','gitignore'],
  alternates:{canonical:'/env'},
  openGraph:{url:'/env',title:'Veyra Env',description:'Never ship a missing or leaked env variable again. Free.',images:[{url:'/env-hero.webp',width:1920,height:960,alt:'Veyra Env: comparing env files side by side'}]},
};

const FEATURES=[
  {icon:AlertTriangle,title:'Missing-variable warnings',copy:'Code that reads a variable no .env file sets is underlined as you type, with a quick fix that adds it to .env.'},
  {icon:Keyboard,title:'Autocomplete and hover',copy:'Every name after process.env., os.getenv(" and more, with the file that sets it. Hover for values, F12 to jump to them.'},
  {icon:EyeOff,title:'Secrets hidden on screen',copy:'Passwords, tokens and keys show as dots until you put the cursor on their line. Share your screen without leaking a key.'},
  {icon:GitBranch,title:'A .gitignore guard',copy:'A warning when an env file isn’t ignored, an error when it’s already committed, and one-click fixes for both.'},
  {icon:RefreshCw,title:'.env.example in sync',copy:'Adds new variable names to the example, never their values, with the comment above each one.'},
  {icon:Columns3,title:'Compare side by side',copy:'Every variable in every env file in one table, with missing, empty and different values marked.'},
  {icon:FileCheck2,title:'.env checks',copy:'Duplicate keys, unclosed quotes, spaces around =, values with spaces and invalid names, with quick fixes and syntax colours.'},
  {icon:Sparkles,title:'Ten languages',copy:'JavaScript, TypeScript, Python, Go, Ruby, PHP, Rust, Java, Kotlin and C#, plus Vite, Next.js, Bun and Deno styles.'},
  {icon:ShieldCheck,title:'Private',copy:'It reads files and asks git, and that’s all. No account, no telemetry, nothing sent anywhere.'},
];
const FAQ=[
  {q:'Is Veyra Env free?',a:'Yes. It is free and MIT licensed, with no account and no telemetry.'},
  {q:'Does hiding values change my .env file?',a:'No. Values are hidden only on screen, in the editor, autocomplete, hovers and the sidebar. The file on disk is unchanged, and putting the cursor on a line shows its value.'},
  {q:'How does it know what is a secret?',a:'From the name (like _SECRET, _TOKEN, _PASSWORD or API_KEY) and from the value (like sk_live_, ghp_, AKIA, JWTs, private keys and URLs with a password). Public values such as NEXT_PUBLIC_ stay visible. You can hide every value, or none, in the settings.'},
  {q:'What if a variable is set on my host, not in .env?',a:'Variables set by the system or platform, like NODE_ENV, PATH, CI and VERCEL_ENV, are never reported. For your own, use the quick fix "Never report", or list them in the veyraEnv.ignore setting.'},
  {q:'Does it work in a monorepo?',a:'Yes. Each code file is checked against the .env files in its own folder and the folders above it.'},
];

export default function EnvPage(){
  const app={
    '@context':'https://schema.org','@type':'SoftwareApplication',name:'Veyra Env',applicationCategory:'DeveloperApplication',
    operatingSystem:'Windows, macOS, Linux',url:absolute('/env'),image:absolute('/env-icon.png'),softwareVersion:EXT.version,downloadUrl:EXT.listed?MARKETPLACE:VSIX,
    description:'A free VS Code extension for .env files: missing-variable warnings, autocomplete for process.env, secrets hidden on screen, a .gitignore guard and .env.example kept in sync.',
    offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},publisher:{'@type':'Organization',name:'Veyra',url:absolute('/')},
  };
  const faq={'@context':'https://schema.org','@type':'FAQPage',mainEntity:FAQ.map(item=>({'@type':'Question',name:item.q,acceptedAnswer:{'@type':'Answer',text:item.a}}))};

  return <><Nav/><Breadcrumbs items={[{name:'Extensions',path:'/extensions'},{name:'Veyra Env',path:'/env'}]}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(app)}}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(faq)}}/>
    <main className="page-shell"><div className="content live-page">
      <section className="live-hero">
        <div className="live-hero-glow" aria-hidden="true"/>
        <div className="live-icon"><Image src="/env-icon.png" width={148} height={148} alt="Veyra Env icon" priority/></div>
        <span className="live-kicker"><i/>NEW · VEYRA ORIGINAL · FOR VS CODE</span>
        <h1>Veyra <em>Env</em></h1>
        <p className="live-tagline">Never ship a missing or leaked env variable again.</p>
        <p className="live-intro">Warnings when your code reads a variable .env doesn&apos;t set, autocomplete for process.env, secrets hidden on screen, a .gitignore guard, and .env.example kept in sync. Free, with nothing to set up.</p>
        <div className="live-actions">
          {EXT.listed?<a className="primary" href={MARKETPLACE}><Zap size={16}/>Get it for VS Code</a>:<a className="primary" href={VSIX}><Download size={16}/>Download for VS Code</a>}
          <a className="secondary" href="#install"><Zap size={16}/>How to install</a>
        </div>
        <p className="live-micro">{EXT.id} · v{EXT.version} · Free · MIT · Windows, macOS, Linux</p>
      </section>

      <section className="pm-shot"><img src="/env-code.webp" alt="process.env.STRIPE_SECRET_KEY underlined as not set in .env, with a quick fix, and autocomplete after process.env." width={1600} height={760}/></section>

      <section className="content-section">
        <header><span>FEATURES</span><h2>Everything about .env files, handled.</h2></header>
        <div className="cards">{FEATURES.map(feature=><article className="card" key={feature.title}><feature.icon/><h3>{feature.title}</h3><p>{feature.copy}</p></article>)}</div>
      </section>

      <section className="pm-shot"><img src="/env-hidden.webp" alt="A .env file with secret values shown as dots and public values visible" width={1600} height={640} loading="lazy"/></section>

      <section className="content-section split reverse">
        <div>
          <span className="kicker">KEEP SECRETS OUT OF GIT</span>
          <h2>The mistakes that leak keys, caught early.</h2>
          <ul>
            <li><ShieldCheck/><span><strong>Not in .gitignore?</strong> A warning, and one click adds it.</span></li>
            <li><ShieldCheck/><span><strong>Already committed?</strong> An error, and one click stops tracking it while keeping the file on your disk.</span></li>
            <li><ShieldCheck/><span><strong>.env.example out of date?</strong> One click adds the new names, never the values.</span></li>
            <li><ShieldCheck/><span><strong>Uses git itself</strong>, so every .gitignore rule works, in every folder.</span></li>
          </ul>
        </div>
        <div className="visual" aria-label="A .env file with hidden values">
          <small>.env</small>
          <b>DATABASE_URL</b>=<i>post••••••••</i><br/>
          <b>STRIPE_SECRET_KEY</b>=<i>sk_l••••••••</i><br/>
          <b>PORT</b>=3000<br/>
          <span style={{color:'#5f6d7a'}}># hidden until the cursor is on the line</span>
        </div>
      </section>

      <section className="pm-shot"><img src="/env-git.webp" alt="Problems: an env file already committed to git, one not in .gitignore, a duplicate key and .env.example out of sync, each with a quick fix" width={1600} height={900} loading="lazy"/></section>

      <section className="pm-shot"><img src="/env-compare.webp" alt="The Compare panel with .env, .env.production and .env.example side by side, and missing, different and empty variables marked" width={1600} height={1000} loading="lazy"/></section>

      <section className="content-section split" id="install">
        <div>
          <span className="kicker">INSTALL</span>
          <h2>Ready in a minute.</h2>
          {EXT.listed?<ol className="live-install">
            <li>In VS Code, open <strong>Extensions</strong> (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>) and search for <strong>Veyra Env</strong>, or open it on the <a href={MARKETPLACE}>Visual Studio Marketplace</a>.</li>
            <li>Click <strong>Install</strong>, then open a project with a <code>.env</code> file.</li>
          </ol>:<ol className="live-install">
            <li><a href={VSIX}>Download the <code>.vsix</code></a> (75 KB).</li>
            <li>In VS Code, press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> and run <strong>Extensions: Install from VSIX…</strong>, then choose the file.</li>
            <li>Open a project with a <code>.env</code> file. There&apos;s nothing to set up.</li>
          </ol>}
          <p className="live-note">Try it: type <code>process.env.</code> in a JavaScript file. {EXT.listed?'':'Coming to the Visual Studio Marketplace soon.'}</p>
        </div>
        <div className="visual" aria-label="Commands">
          <small>Command Palette</small>
          <b>Env: Compare Env Files</b><br/>
          <b>Env: Update .env.example</b><br/>
          <b>Env: Show or Hide Values</b><br/>
          <b>Env: Create .env</b><br/>
          <span style={{color:'#5f6d7a'}}>In code:</span> <i>Ctrl+. to add a missing variable</i>
        </div>
      </section>

      <section className="content-section">
        <header><span>FAQ</span><h2>Questions</h2></header>
        <div className="live-faq">{FAQ.map(item=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
        <MoreExtensions current="/env"/>
      </section>

      <ClosingCTA title="Made by the Veyra team." copy="Veyra Studio is a fast, free code editor with Live Server, Python debugging and Veyra AI built in."/>
    </div></main><Footer/></>;
}
