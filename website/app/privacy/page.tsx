import type {Metadata} from 'next';
import {Nav} from '@/components/Nav';import {Footer} from '@/components/Footer';

export const metadata:Metadata={title:'Privacy Policy',description:'How Veyra handles your data: your code stays on your machine, no telemetry, and accounts store only your name and email.',alternates:{canonical:'/privacy'}};

export default function Privacy(){
  return <><Nav/><main className="page-shell"><article className="legal">
    <div className="page-head"><span>LEGAL</span><h1>Privacy Policy</h1><p>Last updated 7 October 2026</p></div>
    <p>Veyra is built to be local-first. This policy explains what the website and the Veyra Studio app collect, and what they deliberately do not.</p>
    <h2>Your code stays on your machine</h2>
    <p>Veyra Studio works directly on files on your computer. Your projects never leave it unless you send a message to Veyra AI, and then only your message and the code you attach pass through our server to the AI provider. We don&apos;t store or analyse that code.</p>
    <h2>The desktop app</h2>
    <ul>
      <li><strong>Update checks:</strong> the app periodically asks for the latest version from GitHub Releases or veyraeditor.com. The request includes your app version, operating system and processor type, which are needed to choose the right download. It contains nothing that identifies you.</li>
      <li><strong>AI features:</strong> when you use Veyra AI, your messages and only the code you explicitly attach are sent to veyraeditor.com, which forwards them to its AI provider to answer. Nothing is sent until you send a message.</li>
      <li><strong>Veyra AI sign-in:</strong> when you sign in to Veyra AI, the app keeps a sign-in token in a private file in Veyra's app data folder on your computer. There are no AI API keys in the app; the provider key stays on our server. You can sign out anytime from the AI panel.</li>
      <li>The app has no analytics or telemetry.</li>
    </ul>
    <h2>Accounts on this website</h2>
    <ul>
      <li>If you create an account we store your <strong>name, email address and a securely hashed password</strong> (scrypt) in our own database at our hosting provider. We never store your password itself.</li>
      <li>If you use Veyra AI we store <strong>how many requests and tokens your account has used</strong>, to apply the free request limit. We don&apos;t store your messages or code.</li>
      <li>We use your email only for account messages such as password resets and, rarely, important product news. We never sell or share it.</li>
      <li>We set only essential cookies to keep you signed in. There are no advertising or tracking cookies.</li>
    </ul>
    <h2>Your choices</h2>
    <p>You can use Veyra without an account. You can delete your account and all its data at any time from your <a href="/dashboard">dashboard</a>.</p>
    <h2>Contact</h2>
    <p>Questions about privacy: <a href="https://github.com/fcopensource/veyraeditor/issues">github.com/fcopensource/veyraeditor/issues</a>.</p>
  </article></main><Footer/></>;
}
