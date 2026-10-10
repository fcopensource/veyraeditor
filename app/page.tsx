import Image from "next/image";
import Link from "next/link";
import {
  Apple, ArrowRight, Braces, Check, Command, FolderGit2, Github, HeartPulse, KeyRound,
  LockKeyhole, Monitor, Wrench, RefreshCw, Sparkles, Terminal, TerminalSquare, Zap,
} from "lucide-react";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { CodeUniverse } from "@/components/CodeUniverse";
import { LiveIDE } from "@/components/LiveIDE";
import { DownloadCTA } from "@/components/DownloadCTA";
import { ScrollReveal } from "@/components/ScrollReveal";
import { latestRelease } from "@/lib/releases";
import type { Metadata } from "next";
import { FAQ } from "@/lib/site";

export const revalidate = 300;
export const metadata: Metadata = { alternates: { canonical: "/" }, openGraph: { url: "/" } };

const features = [
  { icon: Braces, title: "A serious editor", copy: "Monaco at the core: IntelliSense, multi-cursor editing, diagnostics, formatting and 80+ languages, wrapped in a native, lightweight shell." },
  { icon: FolderGit2, title: "Git you can see", copy: "Live gutter markers, file-tree badges and side-by-side diffs. Stage, commit, amend, switch branches, stash and sync in a click." },
  { icon: TerminalSquare, title: "A real terminal", copy: "PowerShell, zsh or bash on a native PTY, with multiple sessions and one-key \"run this file\", right beside your code." },
  { icon: Sparkles, title: "AI with boundaries", copy: "Local Ollama or 10 cloud providers. You choose the context, and every edit is a diff you approve and can undo." },
  { icon: Wrench, title: "Real IntelliSense", copy: "One-click TypeScript, ESLint, Prettier, Tailwind, Emmet, Svelte and Vue: the language servers behind VS Code's favourite web extensions." },
  { icon: KeyRound, title: "Secrets done right", copy: "API keys are encrypted in your OS keychain and load in the background, exactly like VS Code secrets." },
  { icon: HeartPulse, title: "Self-diagnosing", copy: "A live health score watches responsiveness, memory, errors, Git and your toolchain, with a fix for every warning." },
  { icon: RefreshCw, title: "Always current", copy: "Signed automatic updates on every platform. A new version is one click away and never interrupts unsaved work." },
  { icon: LockKeyhole, title: "Local by default", copy: "Your projects never leave your machine unless you send them. Atomic saves guard every file you touch." },
];
const providers = ["Ollama", "Claude", "OpenAI", "Gemini", "OpenRouter", "Groq", "Mistral", "DeepSeek", "Grok", "Together", "Any OpenAI API"];

export default async function Home() {
  const release = await latestRelease();
  const version = release?.version ? `v${release.version}` : "preview";
  return (
    <>
      <Nav />
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
              Code at the
              <br />
              <em>speed of thought.</em>
            </h1>
            <p>
              Veyra is a fast, local-first code editor with Git, a real terminal and AI from
              11 providers built in, so you can go from idea to shipped without leaving the window.
            </p>
            <div className="hero-actions">
              <DownloadCTA />
              <a className="secondary" href="https://github.com/fcopensource/veyraeditor">
                <Github size={17} />
                Star on GitHub
              </a>
            </div>
            <div className="hero-meta">
              <span><Check size={13} /> Free & open source</span>
              <span><Check size={13} /> 7–11 MB installers</span>
              <span><Check size={13} /> Auto-updates</span>
            </div>
          </div>
          <a className="scroll-cue" href="#showcase" aria-label="Scroll to explore"><span /></a>
        </section>

        <section className="what-is" data-reveal aria-labelledby="what-is-veyra">
          <span>// WHAT IS VEYRA?</span>
          <h2 id="what-is-veyra">A free, open-source AI code editor that stays on your machine.</h2>
          <p>
            <strong>Veyra</strong> (Veyra Studio) is a desktop code editor for <strong>Windows, macOS and Linux</strong>. It pairs
            the Monaco editor with a native Rust core, so it opens fast and its installers are only 7–11 MB. Git, a real
            terminal, project-wide IntelliSense and an <strong>AI assistant</strong> are built in. Use local models with Ollama,
            or bring your own key for Claude, OpenAI, Gemini and more. Every AI change is a diff you approve, and your code
            never leaves your computer unless you send it.
          </p>
          <div className="what-is-links">
            <Link href="/download">Download Veyra free</Link>
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
              <b><Image src="/veyra.png" width={20} height={20} alt="" />Veyra Studio</b>
              <small><Command size={12} /> K</small>
            </div>
            <div className="screen">
              <Image src="/editor.png" fill sizes="(max-width: 900px) 96vw, 1100px" alt="The Veyra editor with explorer, code and terminal" />
            </div>
            <div className="float-card left"><Zap size={16} /><span><b>Local intelligence</b><small>Your model, your machine</small></span></div>
            <div className="float-card right"><Check size={16} /><span><b>All changes reviewed</b><small>You stay in control</small></span></div>
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
            <span><b>Veyra {release?.version ? bump(release.version) : "0.5.0"} is ready</b><small>Signed and verified · installs in seconds</small></span>
            <i>Update & restart</i>
          </div>
        </section>

        <section id="ai" className="intelligence" data-reveal>
          <div>
            <span>VEYRA INTELLIGENCE</span>
            <h2>AI that works<br /><em>at your pace.</em></h2>
            <p>
              Ask questions across your workspace, understand unfamiliar code and turn intent into a
              reviewable edit. Keep it private with local models, or bring your own key for the cloud.
            </p>
            <ul>
              <li><Check />Smart workspace context, and you see exactly what's sent</li>
              <li><Check />Every edit is a diff you apply and can undo</li>
              <li><Check />Keys stored in your OS keychain, never in your project</li>
            </ul>
            <div className="provider-cloud">{providers.map(name => <span key={name}>{name}</span>)}</div>
          </div>
          <div className="ai-demo">
            <header><Sparkles size={15} />VEYRA AI <b>LOCAL</b></header>
            <div className="bubble user">Make this parser handle empty input safely.</div>
            <div className="bubble ai"><i /><p>I found the parsing boundary in <code>src/parser.ts</code>. I can add an early return and a focused test.</p><span>2 files in context</span></div>
            <div className="diff">
              <small>PROPOSED EDIT</small>
              <pre>
                <del>- const tokens = scan(input);</del>{"\n"}
                <ins>+ if (!input.trim()) return [];</ins>{"\n"}
                <ins>+ const tokens = scan(input);</ins>
              </pre>
              <footer><button>Discard</button><button>Apply edit</button></footer>
            </div>
          </div>
        </section>

        <section className="manifesto" data-reveal>
          <span>ONE WINDOW · EVERY IDEA</span>
          <h2>Stay inside the work.</h2>
          <p>Files, terminal, source control, intelligent context and the final diff, arranged as one continuous instrument.</p>
          <div className="signal-line"><i /><i /><i /><i /><i /></div>
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
          <Image src="/veyra.png" width={84} height={84} alt="Veyra" />
          <span>YOUR NEXT IDEA DESERVES A GREAT ROOM</span>
          <h2>Build beyond<br />the ordinary.</h2>
          <p>Download Veyra for free, explore the source, and help shape an editor built for the way software is changing.</p>
          <div>
            <DownloadCTA />
            <a className="secondary" href="https://github.com/fcopensource/veyraeditor"><Github size={16} />View source</a>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

/** The next patch version, for the illustrative update prompt. */
function bump(version: string) {
  const [major, minor, patch] = version.split("-")[0].split(".").map(n => parseInt(n, 10) || 0);
  return `${major}.${minor}.${patch + 1}`;
}
