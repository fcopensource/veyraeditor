import Image from "next/image";
import Link from "next/link";
import {
  Apple, ArrowRight, Braces, Check, Command, FolderGit2, Github, HeartPulse, KeyRound,
  ListTodo, LockKeyhole, Monitor, Search, Wrench, RefreshCw, Sparkles, Terminal, TerminalSquare, Zap,
} from "lucide-react";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { CodeUniverse } from "@/components/CodeUniverse";
import { LiveIDE } from "@/components/LiveIDE";
import { DownloadCTA } from "@/components/DownloadCTA";
import { ScrollReveal } from "@/components/ScrollReveal";
import { ScrollBird } from "@/components/ScrollBird";
import "./flightcoders/flightcoders.css";
import { installerSizes, latestRelease } from "@/lib/releases";
import type { Metadata } from "next";
import { FAQ } from "@/lib/site";
import { allPosts, formatDate } from "@/lib/blog";
import { EXTENSIONS } from "@/lib/products";
import { compact, extensionName, installsLabel, roundedDown, stats } from "@/lib/stats";

export const revalidate = 300;
export const metadata: Metadata = { alternates: { canonical: "/" }, openGraph: { url: "/" } };

const features = [
  { icon: Braces, title: "A serious editor", copy: "Monaco at the core: IntelliSense, multi-cursor editing, a built-in Python debugger and 80+ languages, wrapped in a native, lightweight shell." },
  { icon: FolderGit2, title: "Git you can see", copy: "Live gutter markers, file-tree badges and side-by-side diffs. Stage, commit, amend, switch branches, stash and sync in a click." },
  { icon: TerminalSquare, title: "A real terminal", copy: "PowerShell, zsh or bash on a native PTY, with multiple sessions and one-key \"run this file\", right beside your code." },
  { icon: Search, title: "Search Everywhere", copy: "Tap Shift twice to find any file or action. Ctrl+E jumps back to recent files, and Recent Projects reopen in one click." },
  { icon: Wrench, title: "Real IntelliSense", copy: "One-click TypeScript, ESLint, Prettier, Tailwind, Emmet, Svelte, Vue and Python: the language servers behind VS Code's favourite extensions." },
  { icon: ListTodo, title: "A TODO window", copy: "Every TODO, FIXME and HACK comment in your project, grouped by file and colour-coded. Click one to jump straight to it." },
  { icon: HeartPulse, title: "Self-diagnosing", copy: "A live health score watches responsiveness, memory, errors, Git and your toolchain, with a fix for every warning." },
  { icon: RefreshCw, title: "Always current", copy: "Signed automatic updates on every platform. A new version is one click away and never interrupts unsaved work." },
  { icon: LockKeyhole, title: "Private by design", copy: "No AI, no telemetry, no tracking. Your code never leaves your machine, and atomic saves guard every file you touch." },
];
const flowHighlights = ["Shift Shift", "Ctrl+E", "Recent Projects", "TODO window", "Command palette"];

export default async function Home() {
  const release = await latestRelease();
  const version = release?.version ? `v${release.version}` : "preview";
  const sizes = installerSizes(release);
  const numbers = await stats();
  const downloads = roundedDown(numbers.total);
  return (
    <>
      <Nav />
      <ScrollBird />
      <ScrollReveal />
      <main className="landing">
        <section className="hero hero-universe">
          <CodeUniverse />
          <div className="hero-vignette" />
          <div className="hero-copy">
            <a className="eyebrow" href="https://github.com/fcopensource/veyraeditor/releases/latest">
              <i />
              {version.toUpperCase()} · NOW ON WINDOWS, MACOS & LINUX
              <ArrowRight size={12} />
            </a>
            <h1>
              The lightweight
              <br />
              <em>VS Code alternative.</em>
            </h1>
            <p>
              Veyra feels like VS Code (the same Monaco editor, the same shortcuts) but it&apos;s a native
              Rust app with no bundled browser, so it&apos;s light on memory and quick to open. Git, a real
              terminal and fast search are built in, with no AI and no tracking.
            </p>
            <div className="hero-actions">
              <DownloadCTA />
              <a className="secondary" href="https://github.com/fcopensource/veyraeditor">
                <Github size={17} />
                Star on GitHub
              </a>
            </div>
            <div className="hero-meta">
              {downloads >= 100 && <span className="hero-downloads"><Check size={13} /> {compact(downloads)}+ downloads</span>}
              <span><Check size={13} /> Free & open source</span>
              <span><Check size={13} /> {sizes.label}</span>
              <span><Check size={13} /> Auto-updates</span>
            </div>
          </div>
          <a className="scroll-cue" href="#showcase" aria-label="Scroll to explore"><span /></a>
        </section>

        <section className="what-is" data-reveal aria-labelledby="what-is-veyra">
          <span>// WHAT IS VEYRA?</span>
          <h2 id="what-is-veyra">A free, lightweight VS Code alternative that stays on your machine.</h2>
          <p>
            <strong>Veyra</strong> (Veyra Studio) is a desktop code editor for <strong>Windows, macOS and Linux</strong>. It pairs
            the Monaco editor with a native Rust core, so it opens fast and its installers are small ({sizes.min && sizes.max ? `${sizes.min}–${sizes.max} MB` : "around 10 MB"} on Windows, macOS and Linux .deb/.rpm{sizes.appImage ? `; the self-contained AppImage is about ${sizes.appImage} MB` : ""}). Git, a real
            terminal, project-wide IntelliSense and Android Studio-style navigation (Search Everywhere, Recent Files and a TODO window)
            are built in. Veyra is a pure code editor with <strong>no AI and no telemetry</strong>, so your code
            never leaves your computer.
          </p>
          <div className="what-is-links">
            <Link href="/download">Download Veyra free</Link>
            <Link href="/vs-code-alternative">Veyra vs VS Code</Link>
            <Link href="/blog/lightweight-vs-code-alternative-less-memory">Why Veyra uses less memory</Link>
            <a href="https://github.com/fcopensource/veyraeditor">Source code on GitHub</a>
            <Link href="/changelog">What&apos;s new</Link>
          </div>
        </section>

        <section className="trust" data-reveal>
          <span>BUILT WITH</span>
          <b>Rust</b><i /><b>Tauri</b><i /><b>Monaco</b><i /><b>React</b><i /><b>three.js</b>
        </section>

        <section id="showcase" className="showcase" data-reveal>
          <div className="product-shell">
            <div className="window-bar">
              <span className="traffic"><i /><i /><i /></span>
              <b><Image src="/veyra-96.png" width={20} height={20} alt="" />Veyra Studio</b>
              <small><Command size={12} /> K</small>
            </div>
            <div className="screen">
              <Image src="/editor.webp" fill sizes="(max-width: 900px) 96vw, 1100px" alt="The Veyra editor with explorer, code and terminal" />
            </div>
            <div className="float-card left"><Zap size={16} /><span><b>Search Everywhere</b><small>Tap Shift twice</small></span></div>
            <div className="float-card right"><Check size={16} /><span><b>Your code stays local</b><small>No AI, no telemetry</small></span></div>
            <div className="float-card bottom"><HeartPulse size={16} /><span><b>Health 98 / 100</b><small>Everything running smoothly</small></span></div>
          </div>
        </section>

        <LiveIDE />

        <section id="features" className="section feature-story">
          <div className="section-title" data-reveal>
            <span>// THE WORKSPACE, REIMAGINED</span>
            <h2>Built for flow.<br />Designed with intent.</h2>
            <p>Everything a modern developer reaches for, native and fast, in one calm window.</p>
          </div>
          <div className="feature-grid">
            {features.map(({ icon: Icon, title, copy }, index) => (
              <article key={title} data-reveal style={{ transitionDelay: `${(index % 4) * 70}ms` }}>
                <div className={"feature-icon tone-" + (index % 6)}><Icon size={22} /></div>
                <h3>{title}</h3>
                <p>{copy}</p>
                <span className="feature-number">0{index + 1}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="platforms" data-reveal>
          <div className="platforms-head">
            <span>// ONE EDITOR, EVERY DESK</span>
            <h2>Native on Windows,<br />macOS and Linux.</h2>
            <p>Tiny installers built from the same source, kept current with signed one-click updates.</p>
          </div>
          <div className="platform-row">
            <Link href="/download" className="platform-tile"><Monitor /><b>Windows</b><small>10 & 11 · .exe / .msi</small></Link>
            <Link href="/download" className="platform-tile"><Apple /><b>macOS</b><small>Apple silicon & Intel · .dmg</small></Link>
            <Link href="/download" className="platform-tile"><Terminal /><b>Linux</b><small>.AppImage · .deb · .rpm</small></Link>
          </div>
          <div className="update-demo" aria-hidden="true">
            <Sparkles size={16} />
            <span><b>A new version is ready</b><small>One click in the top-right corner · signed and verified</small></span>
            <i>↓ Update</i>
          </div>
        </section>

        <section id="ai" className="intelligence" data-reveal>
          <div>
            <span>NEW IN 0.11</span>
            <h2>Find anything<br /><em>in a heartbeat.</em></h2>
            <p>
              The navigation Android Studio users love, now in Veyra. Jump to any file or action, hop between
              recent files, reopen projects in one click and keep track of every TODO in your code.
            </p>
            <ul>
              <li><Check />Search Everywhere: tap Shift twice for files and actions in one search</li>
              <li><Check />Recent Files with Ctrl/⌘+E, and Recent Projects on the Welcome page</li>
              <li><Check />A TODO window that lists every TODO, FIXME and HACK, grouped by file</li>
            </ul>
            <div className="provider-cloud">{flowHighlights.map(name => <span key={name}>{name}</span>)}</div>
          </div>
          <div className="ai-demo">
            <header><Search size={15} />SEARCH EVERYWHERE <b>⇧⇧</b></header>
            <div className="bubble user">parser</div>
            <div className="bubble ai"><i /><p><code>src/parser.ts</code> · <code>tests/parser.test.ts</code> · Format document</p><span>Files and actions, one search</span></div>
            <div className="diff">
              <small>TODO WINDOW · 3 ITEMS</small>
              <pre>
                <ins>TODO  split the lexer into tokens.ts</ins>{"\n"}
                <ins>FIXME handle empty input</ins>{"\n"}
                <ins>HACK  retry twice on timeout</ins>
              </pre>
              <footer><button>Recent files · Ctrl+E</button><button>Jump to TODO</button></footer>
            </div>
          </div>
        </section>

        <section className="manifesto" data-reveal>
          <span>ONE WINDOW · EVERY IDEA</span>
          <h2>Stay inside the work.</h2>
          <p>Files, search, terminal, source control and the final diff, arranged as one continuous instrument.</p>
          <div className="signal-line"><i /><i /><i /><i /><i /></div>
        </section>

        <section className="home-blog home-new" data-reveal aria-labelledby="new-title">
          <header>
            <div><span>// NEW FOR VS CODE</span><h2 id="new-title">Fresh from the Veyra team</h2></div>
            <Link className="secondary" href="/extensions#made-by-veyra">All {EXTENSIONS.length} extensions <ArrowRight size={14} /></Link>
          </header>
          <div className="new-grid">
            {[...EXTENSIONS].sort((x, y) => y.order - x.order).slice(0, 3).map(p => (
              <Link key={p.href} href={p.href} className={`new-card tone-${p.tone}`}>
                <Image src={p.icon} width={56} height={56} alt="" />
                <div><small>{p.group}{installsLabel(numbers.perExtension[extensionName(p.href)]) ? ` · ${installsLabel(numbers.perExtension[extensionName(p.href)])}` : ""}</small><h3>{p.title}</h3><p>{p.copy}</p></div>
                <ArrowRight className="new-arrow" size={16} />
              </Link>
            ))}
          </div>
        </section>

        <section className="home-blog" data-reveal aria-labelledby="blog-title">
          <header>
            <div><span>// FROM THE BLOG</span><h2 id="blog-title">Guides and notes from the team</h2></div>
            <Link className="secondary" href="/blog">All articles <ArrowRight size={14} /></Link>
          </header>
          <div className="post-grid">
            {allPosts().slice(0, 3).map(post => (
              <Link key={post.slug} href={`/blog/${post.slug}`} className="post-card">
                <span className="post-meta"><em>{post.category}</em>{post.readingTime} min read</span>
                <h3>{post.title}</h3>
                <p>{post.description}</p>
                <span className="post-date">{formatDate(post.date)}</span>
              </Link>
            ))}
          </div>
        </section>

        <section id="faq" className="faq" data-reveal aria-labelledby="faq-title">
          <div className="faq-head">
            <span>// QUESTIONS</span>
            <h2 id="faq-title">Frequently asked questions</h2>
            <p>Everything you need to know about Veyra. More answers on the <Link href="/faq">FAQ page</Link>, or <a href="https://github.com/fcopensource/veyraeditor/issues">ask on GitHub</a>.</p>
          </div>
          <div className="faq-list">
            {FAQ.map((item, index) => (
              <details key={item.q} open={index === 0}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="cta" data-reveal>
          <div className="cta-glow" />
          <Image src="/veyra-192.png" width={84} height={84} alt="Veyra" />
          <span>YOUR NEXT IDEA DESERVES A GREAT ROOM</span>
          <h2>Build beyond<br />the ordinary.</h2>
          <p>Download Veyra for free, explore the source, and help shape an editor built for the way software is changing.</p>
          <div>
            <DownloadCTA />
            <a className="secondary" href="https://github.com/fcopensource/veyraeditor"><Github size={16} />View source</a>
          </div>
        </section>

        <section className="fc-band" data-reveal aria-labelledby="hire-title">
          <div>
            <span>FLIGHTCODERS · WORK WITH US</span>
            <h2 id="hire-title">Need a developer tool, app or extension built?</h2>
            <p>The team behind Veyra builds VS Code extensions, desktop apps, browser extensions and web apps for you.</p>
          </div>
          <Link className="fc-primary" href="/flightcoders#start">Start a project <ArrowRight size={16} /></Link>
        </section>
      </main>
      <Footer />
    </>
  );
}
