import type {Metadata} from 'next';
import Image from 'next/image';
import {Bug,Download,EyeOff,GitPullRequest,KeyRound,Lock,PackageX,ShieldCheck,Terminal,Zap} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {MoreExtensions} from '@/components/MoreExtensions';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {ClosingCTA} from '@/components/ContentPage';
import {absolute,jsonLd,marketplaceUrl,VSCODE_EXTENSIONS,vsixUrl} from '@/lib/site';
import '../live-server/live-server.css';
import '../port-manager/port-manager.css';

const EXT=VSCODE_EXTENSIONS.codeGuard;
const MARKETPLACE=marketplaceUrl(EXT.id), VSIX=vsixUrl(EXT);

export const metadata:Metadata={
  title:'Veyra Code Guard: Find Trojans and Backdoors in Code',
  description:'A free security reviewer for VS Code and GitHub pull requests. Checks every line for Trojan Source characters, obfuscated eval, download-and-run commands, reverse shells, crypto miners, credential theft, leaked keys and poisoned install scripts.',
  keywords:['malicious code','trojan source','backdoor','supply chain security','code review','secret scanning','GitHub Action','VS Code security','npm postinstall','malware detection'],
  alternates:{canonical:'/code-guard'},
  openGraph:{url:'/code-guard',title:'Veyra Code Guard',description:'Every line checked for trojans and backdoors, in VS Code and on every pull request.',images:[{url:'/code-guard-dark.webp',width:1400,height:860,alt:'VS Code flagging a script that steals an SSH key and runs a hidden payload'}]},
};

const FEATURES=[
  {icon:EyeOff,title:'Sees what you can’t',copy:'Trojan Source characters, invisible characters, look-alike letters and code pushed off-screen.'},
  {icon:Bug,title:'Hidden code being run',copy:'eval of decoded strings, packed JavaScript, encoded PowerShell and Python exec tricks.'},
  {icon:Terminal,title:'Backdoors',copy:'Reverse shells, download-and-run commands, crypto miners and disabled defences.'},
  {icon:KeyRound,title:'Stolen and leaked secrets',copy:'Code that reads SSH keys, wallets or browser passwords, and API keys committed by mistake.'},
  {icon:PackageX,title:'Poisoned packages',copy:'npm install scripts that fetch or run code, and GitHub workflows that run outsiders’ code.'},
  {icon:GitPullRequest,title:'Reviews pull requests',copy:'A GitHub Action that comments on the exact lines and fails the check when it’s serious.'},
  {icon:ShieldCheck,title:'Explains every finding',copy:'What it found and why it matters, in plain words, so you can decide quickly.'},
  {icon:Zap,title:'Fast',copy:'Checks as you type, and scans a whole project of hundreds of files in seconds.'},
  {icon:Lock,title:'Private',copy:'Runs entirely on your computer or your CI. Your code is never uploaded anywhere.'},
];
const FAQ=[
  {q:'Is it free?',a:'Yes. Veyra Code Guard is free and MIT licensed, with no account and no telemetry, in VS Code and on GitHub.'},
  {q:'How do I add it to my GitHub pull requests?',a:'Add a workflow file with two steps: actions/checkout and fcopensource/veyraeditor/extensions/code-guard. It then reviews every pull request automatically.'},
  {q:'Does it upload my code?',a:'No. Everything runs on your computer in VS Code, or on your own GitHub Actions runner.'},
  {q:'What if a finding is safe?',a:'Add a veyra-guard-ignore comment on the line or the line above. If a pull request adds one, Code Guard reports it so reviewers see what is being excused.'},
  {q:'Can it catch every attack?',a:'No tool can. Code Guard recognises the patterns attackers use; use it alongside careful review and dependency audits, not instead of them.'},
];
const WORKFLOW=`name: Veyra Code Guard
on: pull_request
permissions:
  contents: read
  pull-requests: write
jobs:
  code-guard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: fcopensource/veyraeditor/extensions/code-guard@main`;

export default function CodeGuardPage(){
  const app={
    '@context':'https://schema.org','@type':'SoftwareApplication',name:'Veyra Code Guard',applicationCategory:'SecurityApplication',
    operatingSystem:'Windows, macOS, Linux',url:absolute('/code-guard'),image:absolute('/code-guard-icon.png'),softwareVersion:EXT.version,downloadUrl:EXT.listed?MARKETPLACE:VSIX,
    description:'A free security reviewer for VS Code and GitHub that checks every line of code for trojans, backdoors and malicious code.',
    offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},publisher:{'@type':'Organization',name:'Veyra',url:absolute('/')},
  };
  const faq={'@context':'https://schema.org','@type':'FAQPage',mainEntity:FAQ.map(item=>({'@type':'Question',name:item.q,acceptedAnswer:{'@type':'Answer',text:item.a}}))};

  return <><Nav/><Breadcrumbs items={[{name:'Extensions',path:'/extensions'},{name:'Veyra Code Guard',path:'/code-guard'}]}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(app)}}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(faq)}}/>
    <main className="page-shell"><div className="content live-page">
      <section className="live-hero">
        <div className="live-hero-glow" aria-hidden="true"/>
        <div className="live-icon"><Image src="/code-guard-icon.png" width={148} height={148} alt="Veyra Code Guard icon" priority/></div>
        <span className="live-kicker"><i/>NEW · FOR VS CODE AND GITHUB</span>
        <h1>Veyra <em>Code Guard</em></h1>
        <p className="live-tagline">Every line checked for trojans and backdoors.</p>
        <p className="live-intro">Malicious code rarely looks malicious. Code Guard reads every line for the tricks attackers use, from invisible characters to poisoned install scripts, and explains each finding, in VS Code as you work and on every GitHub pull request.</p>
        <div className="live-actions">
          {EXT.listed?<a className="primary" href={MARKETPLACE}><Zap size={16}/>Get it for VS Code</a>:<a className="primary" href={VSIX}><Download size={16}/>Download for VS Code</a>}
          <a className="secondary" href="#github"><GitPullRequest size={16}/>Add to GitHub</a>
        </div>
        <p className="live-micro">{EXT.id} · v{EXT.version} · Free · MIT · Windows, macOS, Linux</p>
      </section>

      <section className="pm-shot"><img src="/code-guard-dark.webp" alt="VS Code showing an update-checker script with Code Guard flagging the lines that read an SSH key, send it to a Discord webhook, run a decoded payload and hide a text-direction character" width={1400} height={860}/></section>

      <section className="content-section">
        <header><span>WHAT IT CATCHES</span><h2>The tricks attackers actually use.</h2></header>
        <div className="cards">{FEATURES.map(feature=><article className="card" key={feature.title}><feature.icon/><h3>{feature.title}</h3><p>{feature.copy}</p></article>)}</div>
      </section>

      <section className="content-section split" id="github">
        <div>
          <span className="kicker">ON GITHUB</span>
          <h2>A reviewer on every pull request.</h2>
          <ol className="live-install">
            <li>Add the workflow below to your repository as <code>.github/workflows/code-guard.yml</code>.</li>
            <li>On every pull request, Code Guard reads each new line, marks anything suspicious in <strong>Files changed</strong> and comments on it.</li>
            <li>When a finding is high or critical, the check fails, so it can’t be merged by accident.</li>
          </ol>
          <p className="live-note">Pull requests from forks are covered too: every line is still marked, even without permission to comment.</p>
        </div>
        <div className="pm-terminal"><div className="live-bar"><span/><span/><span/><b>.github/workflows/code-guard.yml</b></div><pre>{WORKFLOW}</pre></div>
      </section>

      <section className="content-section split" id="install">
        <div>
          <span className="kicker">IN VS CODE</span>
          <h2>Ready in a minute.</h2>
          {EXT.listed?<ol className="live-install">
            <li>In VS Code, open <strong>Extensions</strong> (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>) and search for <strong>Veyra Code Guard</strong>, or open it on the <a href={MARKETPLACE}>Visual Studio Marketplace</a>.</li>
            <li>Click <strong>Install</strong>. Files are checked as you open them; run <strong>Veyra Code Guard: Scan Whole Workspace</strong> to check everything.</li>
          </ol>:<ol className="live-install">
            <li><a href={VSIX}>Download the <code>.vsix</code></a> (30 KB).</li>
            <li>In VS Code, press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> and run <strong>Extensions: Install from VSIX…</strong>, then choose the file.</li>
            <li>Files are checked as you open them; run <strong>Veyra Code Guard: Scan Whole Workspace</strong> to check everything.</li>
          </ol>}
          <p className="live-note">Hover over a flagged line to see why it matters. {EXT.listed?'':'Coming to the Visual Studio Marketplace soon.'}</p>
        </div>
        <div className="visual" aria-label="Severities">
          <small>Severities</small>
          <b>Critical</b> <i>hidden code run, backdoors, miners</i><br/>
          <b>High</b> <i>stolen secrets, persistence</i><br/>
          <b>Medium</b> <i>worth a second look</i><br/>
          <b>Low</b> <i>install hooks</i>
        </div>
      </section>

      <section className="pm-shot"><img src="/code-guard-light.webp" alt="The same script in a light theme, with the findings listed in the Problems panel" width={1400} height={860} loading="lazy"/></section>

      <section className="content-section">
        <header><span>FAQ</span><h2>Questions</h2></header>
        <div className="live-faq">{FAQ.map(item=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
        <MoreExtensions current="/code-guard"/>
      </section>

      <ClosingCTA title="Made by the Veyra team." copy="Veyra Studio is a fast, free code editor with Live Server, Python debugging and Veyra AI built in."/>
    </div></main><Footer/></>;
}
