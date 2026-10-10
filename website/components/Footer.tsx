import Image from 'next/image';
import Link from 'next/link';

export function Footer(){
  return <footer className="site-footer">
    <div className="footer-brand">
      <Link className="brand" href="/"><span><Image src="/veyra.png" width={30} height={30} alt=""/></span><b>Veyra</b><i>STUDIO</i></Link>
      <p>A fast, local-first code editor with Git, a real terminal and AI built in.</p>
    </div>
    <div><strong>Product</strong><Link href="/features">Features</Link><Link href="/extensions">Extensions</Link><Link href="/download">Download</Link><Link href="/changelog">Changelog</Link><Link href="/roadmap">Roadmap</Link></div>
    <div><strong>Resources</strong><Link href="/docs">Documentation</Link><Link href="/faq">FAQ</Link><Link href="/vs-code-alternative">VS Code alternative</Link><a href="https://github.com/fcopensource/veyraeditor/issues">Report an issue</a></div>
    <div><strong>Company</strong><Link href="/about">About</Link><Link href="/about#contact">Contact</Link><a href="https://github.com/fcopensource/veyraeditor">Source code</a><Link href="/login">Log in</Link><Link href="/register">Create account</Link></div>
    <div className="footer-legal"><small>© 2026 Veyra Studio · MIT licensed</small><span><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></span></div>
  </footer>;
}
