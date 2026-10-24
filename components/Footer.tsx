import Image from 'next/image';
import Link from 'next/link';

export function Footer(){
  return <footer className="site-footer">
    <div className="footer-brand">
      <Link className="brand" href="/"><span><Image src="/veyra-96.png" width={30} height={30} alt=""/></span><b>Veyra</b><i>STUDIO</i></Link>
      <p>A fast, local-first code editor with Git, a real terminal and AI built in.</p>
    </div>
    <div><strong>Product</strong><Link href="/features">Features</Link><Link href="/extensions">Extensions</Link><Link href="/live-server">Live Server</Link><Link href="/port-manager">Port Manager</Link><Link href="/mongodb">MongoDB</Link><Link href="/env">Env</Link><Link href="/docker">Docker</Link><Link href="/mcp-studio">MCP Studio</Link><Link href="/api-client">API Client</Link><Link href="/git-graph">Git Graph</Link><Link href="/document-viewer">Document Viewer</Link><Link href="/path-intellisense">Path IntelliSense</Link><Link href="/npm-intellisense">npm IntelliSense</Link><Link href="/salesforce-studio">Salesforce Studio</Link><Link href="/pdf">Veyra PDF</Link><Link href="/download">Download</Link><Link href="/changelog">Changelog</Link><Link href="/roadmap">Roadmap</Link></div>
    <div><strong>Resources</strong><Link href="/docs">Documentation</Link><Link href="/blog">Blog</Link><Link href="/faq">FAQ</Link><Link href="/vs-code-alternative">VS Code alternative</Link><a href="https://github.com/fcopensource/veyraeditor/issues">Report an issue</a></div>
    <div><strong>Company</strong><Link href="/about">About</Link><Link href="/security">Security</Link><Link href="/about#contact">Contact</Link><a href="https://github.com/fcopensource/veyraeditor">Source code</a><Link href="/login">Log in</Link><Link href="/register">Create account</Link></div>
    <div className="footer-legal"><small>© 2026 Veyra Studio · MIT licensed</small><span><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></span></div>
  </footer>;
}
