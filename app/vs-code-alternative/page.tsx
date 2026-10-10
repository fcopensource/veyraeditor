import type {Metadata} from 'next';
import Link from 'next/link';
import {Check,Feather,Keyboard,LockKeyhole,Sparkles} from 'lucide-react';
import {ClosingCTA,ContentPage} from '@/components/ContentPage';

export const metadata:Metadata={
  title:'VS Code Alternative: Veyra vs VS Code vs Cursor',
  description:'Looking for a fast, free VS Code or Cursor alternative? Compare Veyra with VS Code and Cursor: download size, AI providers including local Ollama, privacy, extensions, Git and language support.',
  alternates:{canonical:'/vs-code-alternative'},
  openGraph:{url:'/vs-code-alternative',title:'Veyra: a lightweight VS Code and Cursor alternative'},
  keywords:['VS Code alternative','Cursor alternative','lightweight code editor','free AI code editor','Ollama code editor','open source code editor'],
};

const ROWS:[string,string,string,string][]=[
  ['Price','Free','Free','Free tier, paid plans for AI'],
  ['Source code','Open source (MIT)','Open-source core, proprietary builds','Proprietary'],
  ['Built with','Rust + system web view (Tauri)','Electron','Electron (VS Code fork)'],
  ['Installer size','About 10 MB','About 100 MB','Similar to VS Code'],
  ['Telemetry','None','On by default, can be turned off','Collected, privacy mode available'],
  ['AI providers','Any: Ollama (local), Claude, OpenAI, Gemini and 7 more, with your own key','GitHub Copilot','Cursor\'s own service'],
  ['Fully local AI','Yes, with Ollama','Possible with extra setup','Not officially'],
  ['AI edits reviewed as diffs','Always','Yes','Yes'],
  ['TypeScript, ESLint, Prettier, Tailwind','Built in, one click','Built in / extensions','Built in / extensions'],
  ['Git and terminal','Built in','Built in','Built in'],
  ['Extension marketplace','Open VSX themes & snippets; extension host planned','Full VS Code Marketplace','Most VS Code extensions'],
  ['Debugger','Not yet','Yes','Yes'],
];

export default function Compare(){
  return <ContentPage path="/vs-code-alternative" crumb="VS Code alternative" kicker="COMPARE" title="A lighter VS Code alternative."
    intro="Veyra keeps what developers love about VS Code (the Monaco editor, familiar shortcuts, real IntelliSense) in a native app a tenth of the size, with AI you control.">

    <section className="content-section">
      <div className="cards four">
        <article className="card"><Feather/><h3>A tenth of the size</h3><p>No bundled browser. Veyra uses your system&apos;s web view and a Rust backend.</p></article>
        <article className="card"><Keyboard/><h3>Feels familiar</h3><p>Same editor engine, same shortcuts, same command palette. No relearning.</p></article>
        <article className="card"><Sparkles/><h3>Your AI, your choice</h3><p>Use free local models or your own key for 10 cloud providers. No AI subscription required.</p></article>
        <article className="card"><LockKeyhole/><h3>Private by design</h3><p>No telemetry. Code is only sent where you send it, and you see exactly what.</p></article>
      </div>
    </section>

    <section className="content-section">
      <header><span>SIDE BY SIDE</span><h2>Veyra, VS Code and Cursor compared</h2><p>A fair comparison as of October 2026. VS Code and Cursor are excellent editors; Veyra is for people who want something lighter, more private and open to any AI.</p></header>
      <div className="table-wrap"><table>
        <thead><tr><th></th><th className="us">Veyra</th><th>VS Code</th><th>Cursor</th></tr></thead>
        <tbody>{ROWS.map(([label,us,code,cursor])=><tr key={label}><td>{label}</td><td className="us">{us}</td><td>{code}</td><td>{cursor}</td></tr>)}</tbody>
      </table></div>
    </section>

    <section className="content-section split">
      <div>
        <span className="kicker">HONEST ADVICE</span>
        <h2>When to choose which</h2>
        <p><strong>Choose Veyra</strong> if you want a fast, small, private editor for web development and everyday coding, with AI from any provider (including fully local).</p>
        <p><strong>Stay with VS Code</strong> for now if you depend on a debugger or on a specific extension that runs its own code. Both are on the Veyra <Link href="/roadmap">roadmap</Link>.</p>
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

    <ClosingCTA title="Try it alongside your current editor." copy="Veyra is free and installs in under a minute. Keep VS Code installed and see which one you reach for."/>
  </ContentPage>;
}
