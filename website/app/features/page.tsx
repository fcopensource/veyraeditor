import type {Metadata} from 'next';
import Link from 'next/link';
import {
  ArrowRight, Braces, Check, Command, FolderGit2, HeartPulse, KeyRound, LayoutPanelLeft, LockKeyhole,
  Puzzle, RefreshCw, Search, Sparkles, TerminalSquare, Wrench,
} from 'lucide-react';
import {ClosingCTA,ContentPage} from '@/components/ContentPage';

export const metadata:Metadata={
  title:'Features: Editor, IntelliSense, Git, Terminal & AI',
  description:'Everything in Veyra, the free AI code editor: Monaco editing, TypeScript and Node.js IntelliSense, ESLint, Prettier, Tailwind, built-in Git, a real terminal, AI from Claude, OpenAI, Gemini or Ollama, extensions and signed updates.',
  alternates:{canonical:'/features'},
  openGraph:{url:'/features',title:'Veyra features: a complete, local-first AI code editor'},
};

const Item=({children}:{children:React.ReactNode})=><li><Check/><span>{children}</span></li>;

export default function Features(){
  return <ContentPage path="/features" crumb="Features" kicker="FEATURES" title="Everything you need. Nothing in the way."
    intro="Veyra brings the editing power of VS Code, real language intelligence, Git, a terminal and AI into one fast native app that keeps your code on your machine.">

    <div className="stats">
      <div><b>~10 MB</b><span>installer download</span></div>
      <div><b>80+</b><span>languages highlighted</span></div>
      <div><b>11</b><span>AI providers, including local</span></div>
      <div><b>0</b><span>telemetry or tracking</span></div>
    </div>

    <section className="content-section split">
      <div>
        <span className="kicker">THE EDITOR</span>
        <h2>The editor developers already know.</h2>
        <p>Veyra is built on Monaco, the engine inside VS Code, so editing feels familiar from the first keystroke.</p>
        <ul>
          <Item>Multi-cursor editing, bracket matching, folding, minimap and split view</Item>
          <Item>VS Code-style tabs: drag to reorder, middle-click to close, and smart labels for files with the same name</Item>
          <Item>Command palette, quick open (<kbd>Ctrl</kbd>+<kbd>P</kbd>), go to line and go to symbol</Item>
          <Item>Search and replace across the whole project, with case, word and regex options</Item>
          <Item>Auto save, format on save, and atomic writes that protect every file</Item>
        </ul>
      </div>
      <div className="visual" aria-hidden="true">
        <small>src/server.ts</small>
        <i>import</i> {'{'} createServer {'}'} <i>from</i> <b>&quot;node:http&quot;</b>;<br/><br/>
        <i>const</i> port = Number(process.env.PORT ?? <b>3000</b>);<br/>
        createServer((req, res) =&gt; {'{'}<br/>
        &nbsp;&nbsp;res.end(<b>&quot;Hello from Veyra&quot;</b>);<br/>
        {'}'}).listen(port);
      </div>
    </section>

    <section className="content-section split reverse">
      <div>
        <span className="kicker">NEW IN 0.5</span>
        <h2>Real IntelliSense for web development.</h2>
        <p>Install the same language servers that power VS Code&apos;s most popular web extensions with one click from <Link href="/extensions">Extensions</Link>. They run on your own Node.js and read your project&apos;s config.</p>
        <ul>
          <Item><strong>TypeScript &amp; JavaScript:</strong> errors as you type, auto-imports, hover docs, go to definition, rename across files, quick fixes</Item>
          <Item><strong>ESLint</strong> with your project&apos;s rules and one-click fixes</Item>
          <Item><strong>Prettier</strong> formatting with your project&apos;s config</Item>
          <Item><strong>Tailwind CSS</strong> class completion, previews and colour swatches</Item>
          <Item><strong>Emmet</strong>, <strong>Svelte</strong> and <strong>Vue</strong> support</Item>
        </ul>
      </div>
      <div className="visual" aria-hidden="true">
        <small>Problems · 1</small>
        <i>const</i> count: <b>number</b> = <em>&quot;42&quot;</em>;<br/>
        <em>~~~~~ Type &apos;string&apos; is not assignable to type &apos;number&apos;. ts(2322)</em><br/><br/>
        <small>Quick fix</small>
        ✓ Change to <b>42</b>
      </div>
    </section>

    <section className="content-section">
      <header><span>BUILT IN</span><h2>A complete workspace, out of the box.</h2><p>No setup marathon. Everything below works the moment Veyra opens.</p></header>
      <div className="cards">
        <article className="card"><FolderGit2/><h3>Git you can see</h3><p>Gutter markers, file badges and side-by-side diffs. Stage, commit, amend, switch branches, stash, pull and push in a click, with history at hand.</p></article>
        <article className="card"><TerminalSquare/><h3>A real terminal</h3><p>PowerShell, zsh or bash on a native PTY. Multiple sessions and one-key &quot;run this file&quot;, right beside your code.</p></article>
        <article className="card"><Sparkles/><h3>AI with boundaries</h3><p>Ask, edit with <kbd>Ctrl</kbd>+<kbd>K</kbd>, and inline ghost-text completions. You choose the context, and every change is a diff you approve.</p></article>
        <article className="card"><Search/><h3>Find anything</h3><p>Fuzzy file search, project-wide text search and a command palette that reaches every action and setting.</p></article>
        <article className="card"><Puzzle/><h3>Extensions</h3><p>Themes and snippets from the Open VSX marketplace, VSIX import, and built-in equivalents of popular VS Code web extensions.</p></article>
        <article className="card"><HeartPulse/><h3>Self-diagnosing</h3><p>A live health score watches responsiveness, memory, errors, Git and your toolchain, and tells you how to fix each warning.</p></article>
        <article className="card"><KeyRound/><h3>Secrets done right</h3><p>API keys live in your operating system&apos;s keychain, never in plain text, and load in the background.</p></article>
        <article className="card"><RefreshCw/><h3>Always current</h3><p>Signed automatic updates on every platform. A new version is one click away and never interrupts unsaved work.</p></article>
        <article className="card"><LockKeyhole/><h3>Local by default</h3><p>Your projects never leave your machine unless you send them to an AI provider you chose. No telemetry, ever.</p></article>
      </div>
    </section>

    <section className="content-section">
      <header><span>AI</span><h2>Bring the model you trust.</h2><p>Run models privately with Ollama, or connect your own key for Claude, OpenAI, Gemini, OpenRouter, Groq, Mistral, DeepSeek, Grok, Together or any OpenAI-compatible API.</p></header>
      <div className="cards two">
        <article className="card"><Command/><h3>Review every change</h3><ul><li><Check/>AI edits arrive as a diff you accept or reject</li><li><Check/>Stale proposals can never overwrite newer edits</li><li><Check/>Undo works exactly as you expect</li></ul></article>
        <article className="card"><Braces/><h3>Context you can see</h3><ul><li><Check/>Smart workspace context finds relevant files</li><li><Check/>Veyra shows exactly what will be sent</li><li><Check/>Local models keep everything on your machine</li></ul></article>
      </div>
    </section>

    <section className="content-section">
      <header><span>FAST AND NATIVE</span><h2>Light enough to open instantly.</h2><p>Veyra pairs a Rust backend with your system&apos;s own web view instead of bundling a browser. The result is a small download, quick start-up and low memory use.</p></header>
      <div className="cards">
        <Link className="card" href="/download"><LayoutPanelLeft/><h3>Windows, macOS, Linux</h3><p>Native installers for Windows 10/11, macOS on Apple silicon and Intel, and Linux AppImage, .deb and .rpm.</p><span className="card-link">Download <ArrowRight size={14}/></span></Link>
        <Link className="card" href="/docs"><Wrench/><h3>Get productive fast</h3><p>Install, open a folder and turn on language tools in minutes with the getting-started guide.</p><span className="card-link">Read the docs <ArrowRight size={14}/></span></Link>
        <Link className="card" href="/vs-code-alternative"><Sparkles/><h3>Coming from VS Code?</h3><p>See how Veyra compares with VS Code and Cursor, and what feels the same.</p><span className="card-link">Compare <ArrowRight size={14}/></span></Link>
      </div>
    </section>

    <ClosingCTA/>
  </ContentPage>;
}
