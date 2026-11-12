import type {Metadata} from 'next';
import {OG_IMAGE,jsonLd,type QA} from '@/lib/site';
import Link from 'next/link';
import {Check,Feather,Keyboard,LockKeyhole,Sparkles} from 'lucide-react';
import {ClosingCTA,ContentPage} from '@/components/ContentPage';

export const metadata:Metadata={
  title:'Lightweight VS Code Alternative That Uses Less Memory',
  description:'Veyra is a free, lightweight VS Code alternative: the same Monaco editor and shortcuts in a native Rust app with no bundled browser, so it is lighter on memory. Compare Veyra, VS Code and Cursor.',
  alternates:{canonical:'/vs-code-alternative'},
  openGraph:{images:[OG_IMAGE],url:'/vs-code-alternative',title:'Veyra: the lightweight VS Code alternative'},
  keywords:['VS Code alternative','lightweight VS Code alternative','VS Code alternative low memory','VS Code uses too much memory','code editor that uses less RAM','low memory code editor','lightweight code editor','Cursor alternative','code editor without AI','Veyra'],
};

const FAQ:QA[]=[
  {q:'Is Veyra a good VS Code alternative?',a:'Yes, if you want a lighter editor for web development and everyday coding. Veyra uses the same Monaco editor as VS Code with the same shortcuts and command palette, plus Git, a terminal, IntelliSense for TypeScript, ESLint, Prettier, Tailwind and Python, and Android Studio-style Search Everywhere. It has no AI and no telemetry.'},
  {q:'Does Veyra use less memory than VS Code?',a:'Veyra is built to be lighter. VS Code is an Electron app that ships its own copy of Chromium and Node.js and runs several processes, including an extension host. Veyra is a native Rust app that uses the web view already built into your operating system and has no extension host, so there is less running for each window. You can compare both yourself in Task Manager or Activity Monitor with the same project open.'},
  {q:'Why does VS Code use so much RAM?',a:'VS Code runs on Electron, so every window brings a Chromium browser engine and a Node.js runtime, and extensions run in a separate extension host process. Each language server you install adds more. That flexibility costs memory, which is why lighter editors like Veyra exist.'},
  {q:'Can I use my VS Code shortcuts and themes in Veyra?',a:'Your shortcuts already work, because Veyra uses the same editor engine and key bindings (Ctrl+P, Ctrl+Shift+P, Ctrl+B and more). You can install themes and snippets from Open VSX inside Veyra.'},
  {q:'Can Veyra run VS Code extensions?',a:'Not yet. Veyra installs themes and snippets from Open VSX and has the most popular language tools built in. Extensions that run their own code need an extension host, which is on the roadmap.'},
  {q:'Is Veyra free?',a:'Yes. Veyra is free and open source (MIT) for Windows, macOS and Linux. There are no paid plans and no AI subscription.'},
];

const ROWS:[string,string,string,string][]=[
  ['Price','Free','Free','Free tier, paid plans for AI'],
  ['Source code','Open source (MIT)','Open-source core, proprietary builds','Proprietary'],
  ['Built with','Rust + system web view (Tauri)','Electron','Electron (VS Code fork)'],
  ['Installer size','7–11 MB (Linux AppImage ~83 MB)','About 100 MB','Similar to VS Code'],
  ['Memory','Lighter: one small Rust process plus the system web view; no bundled Chromium or Node.js, no extension host','Heavier: its own Chromium and Node.js, with separate processes for the window, GPU, extension host and more','Like VS Code, plus its AI features'],
  ['Telemetry','None','On by default, can be turned off','Collected, privacy mode available'],
  ['AI','None: a pure editor, your code stays local','GitHub Copilot','Cursor\'s own service'],
  ['Search Everywhere (Shift Shift)','Yes','No','No'],
  ['TypeScript, ESLint, Prettier, Tailwind','Built in, one click','Built in / extensions','Built in / extensions'],
  ['Git and terminal','Built in','Built in','Built in'],
  ['Extension marketplace','Open VSX themes & snippets; extension host planned','Full VS Code Marketplace','Most VS Code extensions'],
  ['Debugger','Python built in; Node.js next','Yes','Yes'],
];

export default function Compare(){
  const faq={'@context':'https://schema.org','@type':'FAQPage',mainEntity:FAQ.map(item=>({'@type':'Question',name:item.q,acceptedAnswer:{'@type':'Answer',text:item.a}}))};
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(faq)}}/><ContentPage path="/vs-code-alternative" crumb="VS Code alternative" kicker="COMPARE" title="The lightweight VS Code alternative."
    intro="Veyra keeps what developers love about VS Code (the Monaco editor, familiar shortcuts, real IntelliSense) in a native Rust app that's a tenth of the size and lighter on memory, with no AI and no tracking.">

    <section className="content-section">
      <div className="cards four">
        <article className="card"><Feather/><h3>Light on memory</h3><p>No bundled browser and no extension host. Veyra uses your system&apos;s web view and a small Rust backend, at a tenth of the download size.</p></article>
        <article className="card"><Keyboard/><h3>Feels familiar</h3><p>Same editor engine, same shortcuts, same command palette. No relearning.</p></article>
        <article className="card"><Sparkles/><h3>No AI, no tracking</h3><p>Veyra is a pure code editor. Nothing is sent to an AI service or analytics server, and there is no subscription.</p></article>
        <article className="card"><LockKeyhole/><h3>Private by design</h3><p>No telemetry. Code is only sent where you send it, and you see exactly what.</p></article>
      </div>
    </section>

    <section className="content-section">
      <header><span>SIDE BY SIDE</span><h2>Veyra, VS Code and Cursor compared</h2><p>A fair comparison as of November 2026. VS Code and Cursor are excellent editors; Veyra is for people who want something lighter and more private.</p></header>
      <div className="table-wrap"><table>
        <thead><tr><th></th><th className="us">Veyra</th><th>VS Code</th><th>Cursor</th></tr></thead>
        <tbody>{ROWS.map(([label,us,code,cursor])=><tr key={label}><td>{label}</td><td className="us">{us}</td><td>{code}</td><td>{cursor}</td></tr>)}</tbody>
      </table></div>
    </section>

    <section className="content-section split">
      <div>
        <span className="kicker">HONEST ADVICE</span>
        <h2>When to choose which</h2>
        <p><strong>Choose Veyra</strong> if you want a fast, small, private editor for web development and everyday coding, with no AI and no telemetry.</p>
        <p><strong>Stay with VS Code</strong> for now if you need a debugger for languages other than Python, or a specific extension that runs its own code. Both are on the Veyra <Link href="/roadmap">roadmap</Link>.</p>
      </div>
      <div className="card">
        <h3 style={{marginTop:0}}>Switching from VS Code</h3>
        <ul>
          <li><Check/><span>Open the same project folder: no import needed</span></li>
          <li><Check/><span>Your shortcuts already work: <kbd>Ctrl</kbd>+<kbd>P</kbd>, <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>, <kbd>Ctrl</kbd>+<kbd>B</kbd></span></li>
          <li><Check/><span>Install TypeScript, ESLint and Prettier in one click</span></li>
          <li><Check/><span>Bring your favourite theme from Open VSX</span></li>
        </ul>
        <Link className="card-link" href="/docs">Read the getting-started guide →</Link>
      </div>
    </section>

    <section className="content-section">
      <header><span>QUESTIONS</span><h2>Switching from VS Code: common questions</h2></header>
      <div className="live-faq">{FAQ.map(item=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
      <p style={{marginTop:18}}>Read more: <Link href="/blog/lightweight-vs-code-alternative-less-memory">why Veyra uses less memory than VS Code</Link> and <Link href="/blog/moving-from-vs-code">moving from VS Code in ten minutes</Link>.</p>
    </section>

    <ClosingCTA title="Try it alongside your current editor." copy="Veyra is free and installs in under a minute. Keep VS Code installed and see which one you reach for."/>
  </ContentPage></>;
}
