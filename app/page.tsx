import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Braces,
  Check,
  Command,
  Download,
  FolderGit2,
  Github,
  Layers3,
  LockKeyhole,
  Sparkles,
  TerminalSquare,
  Zap,
} from "lucide-react";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { VeyraScene } from "@/components/VeyraScene";
import { CodeBackdrop, CodeExperience } from "@/components/CodeExperience";
const features = [
  {
    icon: Braces,
    title: "A serious editor",
    copy: "Monaco editing, language intelligence, multiple cursors, diagnostics and native command menus.",
  },
  {
    icon: FolderGit2,
    title: "Git, made visual",
    copy: "Stage, commit, sync and understand your repository through a dimensional commit graph.",
  },
  {
    icon: TerminalSquare,
    title: "A real terminal",
    copy: "Your shell, your tools and your project context—inside the workspace where you need them.",
  },
  {
    icon: Sparkles,
    title: "Intelligence with boundaries",
    copy: "Use local or cloud models, attach explicit context and review every proposed edit before it lands.",
  },
  {
    icon: Layers3,
    title: "Built for deep work",
    copy: "A calm, cinematic interface with responsive panels, quick navigation and expressive file icons.",
  },
  {
    icon: LockKeyhole,
    title: "Local by default",
    copy: "Your projects stay on your machine. Local AI works through Ollama without sending code away.",
  },
];
export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <section className="hero">
          <div className="aurora one" />
          <div className="aurora two" />
          <CodeBackdrop />
          <VeyraScene />
          <div className="hero-copy">
            <div className="eyebrow">
              <i />
              PUBLIC PREVIEW · V0.3
            </div>
            <h1>
              Your code.
              <br />
              <em>In its element.</em>
            </h1>
            <p>
              Veyra is a fast, local-first desktop editor where beautiful craft,
              native tools and practical AI meet.
            </p>
            <div className="hero-actions">
              <Link className="primary" href="/download">
                <Download size={17} />
                Download for macOS
              </Link>
              <a
                className="secondary"
                href="https://github.com/fcopensource/veyraeditor"
              >
                <Github size={17} />
                View source
              </a>
            </div>
            <span className="micro">
              Apple silicon · Open source · No credit card
            </span>
          </div>
          <div className="product-shell">
            <div className="window-bar">
              <span className="traffic">
                <i />
                <i />
                <i />
              </span>
              <b>
                <Image src="/veyra.png" width={20} height={20} alt="" />
                Veyra Studio
              </b>
              <small>
                <Command size={12} /> K
              </small>
            </div>
            <div className="screen">
              <Image
                src="/editor.png"
                fill
                priority
                sizes="(max-width: 900px) 96vw, 1100px"
                alt="Veyra code editor interface"
              />
            </div>
            <div className="float-card left">
              <Zap size={16} />
              <span>
                <b>Local intelligence</b>
                <small>Powered by your model</small>
              </span>
            </div>
            <div className="float-card right">
              <Check size={16} />
              <span>
                <b>All changes reviewed</b>
                <small>You stay in control</small>
              </span>
            </div>
          </div>
        </section>
        <section className="trust">
          <span>BUILT WITH</span>
          <b>Rust</b>
          <i /> <b>Tauri</b>
          <i /> <b>Monaco</b>
          <i /> <b>React</b>
          <i /> <b>TypeScript</b>
        </section>
        <CodeExperience />
        <section id="features" className="section feature-story">
          <div className="section-title">
            <span>// THE WORKSPACE, REIMAGINED</span>
            <h2>
              Built for flow.
              <br />
              Designed with intent.
            </h2>
            <p>
              A professional local editor foundation designed to stay quick as
              your project grows.
            </p>
          </div>
          <div className="feature-ledger">
            {features.map(({ icon: Icon, title, copy }, index) => (
              <article key={title}>
                <span className="feature-number">0{index + 1}</span>
                <div className={"feature-icon tone-" + index}>
                  <Icon size={23} />
                </div>
                <div>
                  <small>{index % 2 ? "WORKFLOW" : "FOUNDATION"}</small>
                  <h3>{title}</h3>
                </div>
                <p>{copy}</p>
                <ArrowRight className="feature-arrow" size={18} />
              </article>
            ))}
          </div>
        </section>
        <section className="manifesto">
          <span>ONE WINDOW · EVERY IDEA</span>
          <h2>Stay inside the work.</h2>
          <p>
            Files, terminal, source control, intelligent context and the final
            diff—arranged as one continuous instrument.
          </p>
          <div className="signal-line">
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
        </section>
        <section id="ai" className="intelligence">
          <div>
            <span>VEYRA INTELLIGENCE</span>
            <h2>
              AI that works
              <br />
              <em>at your pace.</em>
            </h2>
            <p>
              Ask questions across your workspace, understand unfamiliar code
              and turn intent into a reviewable edit. Choose Ollama for private
              local work or connect your preferred cloud model.
            </p>
            <ul>
              <li>
                <Check />
                Explicit file and selection context
              </li>
              <li>
                <Check />
                Diff review before every edit
              </li>
              <li>
                <Check />
                OpenAI, OpenRouter, Ollama and compatible APIs
              </li>
            </ul>
            <Link href="/register">
              Get early access <ArrowRight size={15} />
            </Link>
          </div>
          <div className="ai-demo">
            <header>
              <Sparkles size={15} />
              VEYRA AI <b>LOCAL</b>
            </header>
            <div className="bubble user">
              Make this parser handle empty input safely.
            </div>
            <div className="bubble ai">
              <i />
              <p>
                I found the parsing boundary in <code>src/parser.ts</code>. I
                can add an early return and a focused test.
              </p>
              <span>2 files in context</span>
            </div>
            <div className="diff">
              <small>PROPOSED EDIT</small>
              <pre>
                <del>- const tokens = scan(input);</del>
                {"\n"}
                <ins>+ if (!input.trim()) return [];</ins>
                {"\n"}
                <ins>+ const tokens = scan(input);</ins>
              </pre>
              <footer>
                <button>Discard</button>
                <button>Apply edit</button>
              </footer>
            </div>
          </div>
        </section>
        <section className="cta">
          <div className="cta-glow" />
          <Image src="/veyra.png" width={84} height={84} alt="Veyra" />
          <span>YOUR NEXT IDEA DESERVES A GREAT ROOM</span>
          <h2>
            Build beyond
            <br />
            the ordinary.
          </h2>
          <p>
            Download the preview, explore the source, and help shape an editor
            built for the way software is changing.
          </p>
          <div>
            <Link className="primary" href="/download">
              Download Veyra <ArrowRight size={16} />
            </Link>
            <Link className="secondary" href="/register">
              Create account
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
