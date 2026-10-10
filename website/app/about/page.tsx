import type {Metadata} from 'next';
import Link from 'next/link';
import {ArrowRight,Bug,Eye,Feather,GitPullRequest,Github,HandHeart,LockKeyhole,MessageSquare} from 'lucide-react';
import {ClosingCTA,ContentPage} from '@/components/ContentPage';
import {GITHUB_URL} from '@/lib/site';

export const metadata:Metadata={
  title:'About Veyra: an Open-Source, Local-First Code Editor',
  description:'Why Veyra exists: a fast, private, open-source code editor with AI you control. Our principles, how Veyra is built, and how to get in touch or contribute.',
  alternates:{canonical:'/about'},
  openGraph:{url:'/about',title:'About Veyra'},
};

export default function About(){
  return <ContentPage path="/about" crumb="About" kicker="ABOUT" title="An editor that respects your work."
    intro="Veyra started with a simple idea: a code editor should be fast, private and yours, and AI should help you without taking over.">

    <section className="content-section split">
      <div>
        <span className="kicker">WHY VEYRA</span>
        <h2>Small, fast and in your hands.</h2>
        <p>Modern editors have grown heavy, and AI tools increasingly decide what gets sent where. Veyra takes a different path: a native app that downloads in seconds, starts instantly, and treats your code as yours.</p>
        <p>We build on proven open technology (the Monaco editor, the Language Server Protocol, Tauri and Rust) so developers get a familiar, reliable experience without the weight.</p>
      </div>
      <div className="visual" aria-hidden="true">
        <small>veyra · principles.md</small>
        <b>1.</b> Your code stays on your machine.<br/>
        <b>2.</b> AI is optional, visible and reviewable.<br/>
        <b>3.</b> Fast to download, fast to open.<br/>
        <b>4.</b> Familiar for VS Code users.<br/>
        <b>5.</b> Open source, built in public.
      </div>
    </section>

    <section className="content-section">
      <header><span>PRINCIPLES</span><h2>What we won&apos;t compromise on</h2></header>
      <div className="cards">
        <article className="card"><LockKeyhole/><h3>Privacy first</h3><p>No telemetry, no tracking, no account required. Your projects never touch our servers.</p></article>
        <article className="card"><Eye/><h3>Transparent AI</h3><p>You pick the provider, you see the context, and every AI edit is a diff you approve.</p></article>
        <article className="card"><Feather/><h3>Lightweight</h3><p>A Rust core and your system&apos;s web view keep Veyra around a tenth of the size of typical editors.</p></article>
      </div>
    </section>

    <section className="content-section">
      <header><span>OPEN SOURCE</span><h2>Built in public, with you.</h2><p>Every line of Veyra is on GitHub under the MIT license, and every release is built publicly by GitHub Actions.</p></header>
      <div className="cards">
        <a className="card" href={GITHUB_URL}><Github/><h3>Read the code</h3><p>Browse the source, star the project and follow development.</p><span className="card-link">GitHub <ArrowRight size={14}/></span></a>
        <a className="card" href={GITHUB_URL+'/issues'}><Bug/><h3>Report a problem</h3><p>Found a bug or have an idea? Open an issue. We read every one.</p><span className="card-link">Open an issue <ArrowRight size={14}/></span></a>
        <a className="card" href={GITHUB_URL+'/pulls'}><GitPullRequest/><h3>Contribute</h3><p>Pull requests are welcome, from typo fixes to new language support.</p><span className="card-link">Pull requests <ArrowRight size={14}/></span></a>
      </div>
    </section>

    <section className="content-section" id="contact">
      <header><span>CONTACT</span><h2>Get in touch</h2><p>The fastest way to reach the team is GitHub. For questions about your account on this website, sign in to your <Link href="/dashboard">dashboard</Link>.</p></header>
      <div className="cards two">
        <a className="card" href={GITHUB_URL+'/issues/new'}><MessageSquare/><h3>Questions &amp; feedback</h3><p>Ask anything about Veyra, request a feature or share feedback.</p><span className="card-link">Start a conversation <ArrowRight size={14}/></span></a>
        <Link className="card" href="/privacy"><HandHeart/><h3>Privacy &amp; terms</h3><p>Exactly what the app and this website collect, and what they never do.</p><span className="card-link">Privacy policy <ArrowRight size={14}/></span></Link>
      </div>
    </section>

    <ClosingCTA/>
  </ContentPage>;
}
