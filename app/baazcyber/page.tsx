import type { Metadata } from 'next';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { absolute, jsonLd } from '@/lib/site';
import { latestRelease, installers } from '@/lib/releases';
import './baazcyber.css';

const GITHUB_REPO = 'fcopensource/baazcyber';
const GITHUB_RELEASES = `https://github.com/${GITHUB_REPO}/releases/latest`;

export const metadata: Metadata = {
  title: 'BaazCyber Antivirus: Real-Time Malware Protection for Windows',
  description:
    'BaazCyber Antivirus scans every file for trojans, backdoors, ransomware and malicious scripts, quarantines threats, and updates automatically. Free for Windows.',
  keywords: [
    'antivirus', 'malware scanner', 'trojan detection', 'ransomware protection',
    'backdoor scanner', 'free antivirus windows', 'BaazCyber', 'baaz engine',
  ],
  alternates: { canonical: '/baazcyber' },
  openGraph: {
    url: '/baazcyber',
    title: 'BaazCyber Antivirus',
    description: 'Free antivirus for Windows. Scans for trojans, backdoors, ransomware and quarantines threats.',
  },
};

const FEATURES = [
  {
    icon: <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    title: 'Real-Time Protection',
    copy: 'Scans files on demand or on a schedule. Quick Scan, Full Scan, or choose any folder.',
  },
  {
    icon: <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>,
    title: 'Heuristic Engine',
    copy: 'Catches unknown threats by behaviour — double extensions, reverse shells, hidden payloads and more.',
  },
  {
    icon: <svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 9h16M9 3v4m6-4v4"/></svg>,
    title: 'Safe Quarantine',
    copy: 'Threats are encoded and isolated, unable to run. Restore or delete from inside the app.',
  },
  {
    icon: <svg viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>,
    title: 'Signature Database',
    copy: 'Built-in hash database of known malware, updated with every release.',
  },
  {
    icon: <svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    title: 'Auto-Updates',
    copy: 'New versions install silently in the background. You always have the latest protection.',
  },
  {
    icon: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>,
    title: 'Clear Explanations',
    copy: 'Every finding explains what was found, why it is dangerous, and what to do.',
  },
];

const STEPS = [
  { n: 1, title: 'Install', body: 'Download from the Microsoft Store or GitHub. No account required.' },
  { n: 2, title: 'Scan', body: 'Hit Quick Scan for a fast check, Full Scan for the whole system, or pick any folder.' },
  { n: 3, title: 'Review', body: 'See every threat with its severity, file path and the reason it was flagged.' },
  { n: 4, title: 'Quarantine', body: 'Move threats to the safe quarantine box with one click. Restore or delete anytime.' },
];

const CATCHES = [
  {
    icon: <svg viewBox="0 0 24 24"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>,
    title: 'Trojans & backdoors',
    copy: 'Reverse shells, web shells, download-and-run droppers.',
  },
  {
    icon: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 14.14 14.14"/></svg>,
    title: 'Ransomware & wipers',
    copy: 'File encryptors, backup deleters and disk wipers.',
  },
  {
    icon: <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
    title: 'Keyloggers & spyware',
    copy: 'Programs that steal passwords, clipboard data or browser history.',
  },
  {
    icon: <svg viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
    title: 'Obfuscated & encoded code',
    copy: 'base64 eval tricks, packed scripts, hidden PowerShell payloads.',
  },
  {
    icon: <svg viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>,
    title: 'Supply-chain attacks',
    copy: 'Typo-squatted packages and poisoned install scripts.',
  },
  {
    icon: <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg>,
    title: 'Double-extension tricks',
    copy: 'Executables disguised as documents (invoice.pdf.exe).',
  },
];

const FAQ = [
  { q: 'Is BaazCyber Antivirus free?', a: 'Yes. BaazCyber Antivirus is free to download and use. No subscription, no account required.' },
  { q: 'Does it upload my files?', a: 'No. Everything runs locally on your computer. Your files are never sent anywhere.' },
  { q: 'How does it update?', a: 'The app checks for new releases automatically. A notification appears when an update is ready, and it installs with one click.' },
  { q: 'Does it catch zero-day malware?', a: 'BaazCyber uses heuristic analysis to catch unknown threats by behaviour — not just known signatures. It cannot catch every new threat, and should be used as one layer of your defence.' },
  { q: 'Can I scan a specific folder?', a: 'Yes. Choose Folder… from the main screen to scan any directory, including external drives.' },
  { q: 'What is the quarantine?', a: 'Quarantined files are moved to a safe folder, encoded so they cannot run, and catalogued. You can restore them if they were a false positive, or delete them permanently.' },
];

export default async function BaazCyberPage() {
  const release = await latestRelease(GITHUB_REPO).catch(() => null);
  const installer = installers(release);
  const windowsUrl = installer.windows?.browser_download_url ?? GITHUB_RELEASES;
  const version = release?.version;

  const app = {
    '@context': 'https://schema.org', '@type': 'SoftwareApplication',
    name: 'BaazCyber Antivirus', applicationCategory: 'SecurityApplication',
    operatingSystem: 'Windows', url: absolute('/baazcyber'),
    description: 'Free antivirus for Windows. Scans every file for trojans, backdoors, ransomware and malicious scripts, and quarantines threats.',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    publisher: { '@type': 'Organization', name: 'FlightCoders', url: 'https://flightcoders.com' },
  };

  return (
    <>
      <Nav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(app) }} />
      <main className="bc-page">

        {/* Hero */}
        <section className="bc-hero">
          <div className="bc-shield-wrap">
            <img src="/baazcyber-logo.png" alt="BaazCyber Antivirus" width={120} height={120} />
          </div>
          <span className="bc-kicker"><i />FREE · WINDOWS · AUTO-UPDATES</span>
          <h1>Your PC. <em>Protected.</em></h1>
          <p className="bc-lede">
            BaazCyber Antivirus scans every file for trojans, backdoors, ransomware and malicious scripts,
            quarantines what it finds, and keeps itself up to date automatically.
          </p>
          <div className="bc-actions">
            <a className="primary" href={windowsUrl}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download for Windows
            </a>
            <a className="secondary" href={GITHUB_RELEASES}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>
              View on GitHub
            </a>
          </div>
          <p className="bc-micro">
            {version ? `v${version} · ` : ''}Windows 10 &amp; 11 · Free · No account needed
          </p>
        </section>

        {/* Stats */}
        <div className="bc-stats">
          <div><b>45+</b><span>threat patterns</span></div>
          <div><b>Real-time</b><span>heuristic engine</span></div>
          <div><b>0</b><span>bytes uploaded</span></div>
          <div><b>Auto</b><span>updates</span></div>
        </div>

        {/* Features */}
        <section className="bc-features">
          <header>
            <span>FEATURES</span>
            <h2>Everything you need. Nothing you don't.</h2>
          </header>
          <div className="bc-grid">
            {FEATURES.map(f => (
              <article className="bc-card" key={f.title}>
                {f.icon}
                <h3>{f.title}</h3>
                <p>{f.copy}</p>
              </article>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="bc-how">
          <div className="bc-how-inner">
            <header>
              <span>HOW IT WORKS</span>
              <h2>Simple, effective, and fast.</h2>
            </header>
            <div className="bc-steps">
              {STEPS.map(s => (
                <div className="bc-step" key={s.n}>
                  <div className="bc-step-num">{s.n}</div>
                  <div className="bc-step-body">
                    <h4>{s.title}</h4>
                    <p>{s.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* What it catches */}
        <section className="bc-catches">
          <header>
            <span>WHAT IT CATCHES</span>
            <h2>The threats that matter most.</h2>
          </header>
          <div className="bc-catch-grid">
            {CATCHES.map(c => (
              <div className="bc-catch" key={c.title}>
                {c.icon}
                <div>
                  <h4>{c.title}</h4>
                  <p>{c.copy}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Download CTA */}
        <section className="bc-install">
          <h2>Download BaazCyber Antivirus</h2>
          <p>Free for Windows 10 and 11. No sign-up, no subscription, no telemetry.</p>
          <div className="bc-actions" style={{ justifyContent: 'center' }}>
            <a className="primary" href={windowsUrl}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download for Windows
            </a>
            <a className="secondary" href={GITHUB_RELEASES}>Release notes</a>
          </div>
          <p className="bc-micro" style={{ marginTop: 16 }}>
            {version ? `Version ${version} · ` : ''}Built with Rust and Tauri · Open source on GitHub
          </p>
        </section>

        {/* FAQ */}
        <section className="bc-faq">
          <h2>Questions</h2>
          {FAQ.map(item => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </section>

      </main>
      <Footer />
    </>
  );
}
