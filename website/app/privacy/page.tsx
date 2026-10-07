import type {Metadata} from 'next';
import {Nav} from '@/components/Nav';import {Footer} from '@/components/Footer';

export const metadata:Metadata={title:'Privacy Policy'};

export default function Privacy(){
  return <><Nav/><main className="page-shell"><article className="legal">
    <div className="page-head"><span>LEGAL</span><h1>Privacy Policy</h1><p>Last updated 7 October 2026</p></div>
    <p>Veyra is built to be local-first. This policy explains what the website and the Veyra Studio app collect, and what they deliberately do not.</p>
    <h2>Your code stays on your machine</h2>
    <p>Veyra Studio works directly on files on your computer. We never receive, store or analyse your source code, file names or projects.</p>
    <h2>The desktop app</h2>
    <ul>
      <li><strong>Update checks:</strong> the app periodically asks for the latest version from GitHub Releases or veyraeditor.com. The request includes your app version, operating system and processor type, which are needed to choose the right download. It contains nothing that identifies you.</li>
      <li><strong>AI features:</strong> when you use AI Studio, your messages and only the code you explicitly attach go directly from your computer to the provider you choose (for example Ollama on your own machine, Anthropic or OpenAI). That provider's privacy policy applies. Veyra never sees these requests.</li>
      <li><strong>API keys</strong> you enter are stored in your operating system's credential store on your computer and are never sent to us.</li>
      <li>The app has no analytics or telemetry.</li>
    </ul>
    <h2>Accounts on this website</h2>
    <ul>
      <li>If you create an account we store your <strong>name, email address and a securely hashed password</strong> (scrypt) in our own database at our hosting provider. We never store your password itself.</li>
      <li>We use your email only for account messages such as password resets and, rarely, important product news. We never sell or share it.</li>
      <li>We set only essential cookies to keep you signed in. There are no advertising or tracking cookies.</li>
    </ul>
    <h2>Your choices</h2>
    <p>You can use Veyra without an account. You can delete your account and all its data at any time from your <a href="/dashboard">dashboard</a>.</p>
    <h2>Contact</h2>
    <p>Questions about privacy: <a href="https://github.com/fcopensource/veyraeditor/issues">github.com/fcopensource/veyraeditor/issues</a>.</p>
  </article></main><Footer/></>;
}
