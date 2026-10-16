import type {Metadata} from 'next';
import {OG_IMAGE} from '@/lib/site';
import Link from 'next/link';
import {Bug,CheckCircle2,FileKey2,GitBranch,KeyRound,LockKeyhole,PackageCheck,ShieldCheck,ShieldEllipsis} from 'lucide-react';
import {ClosingCTA,ContentPage} from '@/components/ContentPage';
import {GITHUB_URL} from '@/lib/site';

export const metadata:Metadata={
  title:'Security & Privacy at Veyra',
  description:'How Veyra protects your code and secrets: no telemetry, a strict Content Security Policy, secret-safe AI context, signed updates and an independent audit.',
  alternates:{canonical:'/security'},
  openGraph:{images:[OG_IMAGE],url:'/security',title:'Security & privacy at Veyra'},
};

const AUDIT:[string,string,string][]=[
  ['SEC-01','Content Security Policy','Fixed: strict policy, tested in production builds'],
  ['PRIV-02','Secrets in AI context','Fixed: excluded by name, .gitignore and content'],
  ['REL-03','Signing wording','Fixed: accurate trust panel on the download page'],
  ['REL-04','Version consistency','Fixed: versions come from the release itself'],
  ['CI-05','Release test gates','Fixed: tests and audits must pass before building'],
  ['SUP-06','Install scripts & advisories','Fixed: no install scripts; dependencies audited'],
  ['DOC-07 / 08','Size and Node.js claims','Fixed: generated from real release files'],
  ['REL-09','App identifier','Decided: migrate once at 1.0, with tests'],
];

export default function Security(){
  return <ContentPage path="/security" crumb="Security" kicker="SECURITY & PRIVACY" title="Your code only goes where you send it."
    intro="Veyra is built so that your projects, secrets and keys stay under your control. Here's exactly how, including what an independent audit found and what we changed.">

    <section className="content-section">
      <div className="cards">
        <article className="card"><LockKeyhole/><h3>No telemetry</h3><p>Veyra doesn&apos;t collect usage data. Your projects never touch our servers, and you can use the editor without an account.</p></article>
        <article className="card"><FileKey2/><h3>Secret-safe AI</h3><p>The assistant never picks <code>.env</code> files, keys, credentials, gitignored files or files containing tokens. Attaching one yourself needs a deliberate second Send.</p></article>
        <article className="card"><KeyRound/><h3>No API keys in the app</h3><p>The AI provider key stays on the veyraeditor.com server and never reaches the app. Veyra keeps only a revocable sign-in token in a private file in its app data folder.</p></article>
        <article className="card"><ShieldCheck/><h3>Strict Content Security Policy</h3><p>The interface can only run Veyra&apos;s own code and only talk to the extension marketplace. Injected or remote scripts are blocked.</p></article>
        <article className="card"><PackageCheck/><h3>Signed updates</h3><p>Every update is signed, and installed copies verify the signature before installing anything.</p></article>
        <article className="card"><GitBranch/><h3>Gated, public releases</h3><p>Releases are built by GitHub Actions from the open-source code, and only after tests and dependency audits pass.</p></article>
      </div>
    </section>

    <section className="content-section split">
      <div>
        <span className="kicker">INDEPENDENT AUDIT · OCTOBER 2026</span>
        <h2>What the audit found, and what we did</h2>
        <p>A read-only review of the website, release process and desktop app reported ten actionable findings. None were exploited vulnerabilities, but every one was real. All are fixed or have a documented decision, shipped in <strong>Veyra 0.6.1</strong>.</p>
        <p>The fixes found two more problems along the way: a vulnerable dependency inside one language tool, and a Find &amp; Replace bug. Both are fixed too. Read the story in <Link href="/blog/keeping-secrets-out-of-ai">How Veyra keeps your secrets out of AI prompts</Link>.</p>
      </div>
      <div className="table-wrap"><table>
        <thead><tr><th>Finding</th><th>Area</th><th>Status</th></tr></thead>
        <tbody>{AUDIT.map(([id,area,status])=><tr key={id}><td><code>{id}</code></td><td>{area}</td><td className="yes"><CheckCircle2 size={13} style={{verticalAlign:'-2px',marginRight:5}}/>{status}</td></tr>)}</tbody>
      </table></div>
    </section>

    <section className="content-section">
      <header><span>TRUST, HONESTLY</span><h2>What&apos;s signed, and what isn&apos;t yet</h2><p>We&apos;d rather tell you than have your operating system surprise you.</p></header>
      <div className="table-wrap"><table>
        <thead><tr><th>Control</th><th>Status</th><th>What it means for you</th></tr></thead>
        <tbody>
          <tr><td>Update signing</td><td className="yes">In place</td><td>Updates are verified by Veyra before they install.</td></tr>
          <tr><td>SHA-256 checksums</td><td className="yes">Published</td><td>Compare your download with the checksums on the <Link href="/download">download page</Link>.</td></tr>
          <tr><td>Microsoft Store</td><td className="yes">Yes</td><td>The Store version is verified by Microsoft and installs without a warning.</td></tr>
          <tr><td>Windows publisher signing (direct download)</td><td className="no">Coming</td><td>The installer from this site may get a SmartScreen warning on first run: choose More info → Run anyway, or use the Microsoft Store.</td></tr>
          <tr><td>Apple notarization</td><td className="no">Coming</td><td>Right-click → Open the first time on macOS.</td></tr>
        </tbody>
      </table></div>
    </section>

    <section className="content-section">
      <div className="cards two">
        <a className="card" href={`${GITHUB_URL}/security/advisories/new`}><Bug/><h3>Report a vulnerability</h3><p>Please report security issues privately through GitHub&apos;s security advisories, not public issues. We aim to respond within a few days.</p><span className="card-link">Report privately →</span></a>
        <a className="card" href={`${GITHUB_URL}/blob/main/docs/security/audit-2026-10-10-response.md`}><ShieldEllipsis/><h3>Read the full audit response</h3><p>Every finding, the exact change and how it was verified, in the open-source repository.</p><span className="card-link">Open on GitHub →</span></a>
      </div>
    </section>

    <ClosingCTA title="Private by design. Free to use." copy="Veyra is open source, has no telemetry, and keeps your code on your machine."/>
  </ContentPage>;
}
