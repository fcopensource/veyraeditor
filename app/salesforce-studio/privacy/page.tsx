import type {Metadata} from 'next';
import Link from 'next/link';
import {Nav} from '@/components/Nav';import {Footer} from '@/components/Footer';

export const metadata:Metadata={
  title:'Salesforce Studio Privacy Policy',
  description:'How the Salesforce Studio browser extension handles your data: it talks only to your own Salesforce org, stores nothing on our servers and has no analytics.',
  alternates:{canonical:'/salesforce-studio/privacy'},
};

export default function SalesforceStudioPrivacy(){
  return <><Nav/><main className="page-shell"><article className="legal">
    <div className="page-head"><span>LEGAL</span><h1>Salesforce Studio Privacy Policy</h1><p>Last updated 16 October 2026</p></div>
    <p>Salesforce Studio is a browser extension for Chrome and Microsoft Edge, made by Veyra / Flightcoders. It lets you edit and save code in Salesforce orgs you are allowed to access. This policy explains what the extension handles and what it does not.</p>
    <h2>We do not collect your data</h2>
    <p>Salesforce Studio has no server of its own, no account and no analytics or telemetry. We never receive your code, your Salesforce data, your session or your credentials.</p>
    <h2>What the extension uses, and why</h2>
    <ul>
      <li><strong>Your Salesforce sign-in.</strong> To connect without a separate login, the extension uses the Salesforce session already in your browser for the org you choose. It sends that session only to that org&apos;s own Salesforce address, to load and save your code. It never writes the session to storage and never sends it anywhere else.</li>
      <li><strong>Your org&apos;s code.</strong> The extension loads Lightning web components, Aura, Apex and Visualforce source from your org so you can edit it, and sends your changes back to the same org when you save.</li>
      <li><strong>Optional OAuth sign-in.</strong> If you connect with your own Salesforce OAuth app instead, the access token Salesforce issues is kept in the browser&apos;s session storage, which is cleared when you close the browser.</li>
      <li><strong>Optional AI assistant.</strong> Only if you enter an AI service address in Settings and ask a question, the open file and your question are sent to that address. You choose and control that service. Your Salesforce session is never sent to it.</li>
    </ul>
    <h2>What stays in your browser</h2>
    <ul>
      <li>Drafts of files you edit, kept per org so a closed tab never loses work.</li>
      <li>Records of deployments in progress, so they can be resumed.</li>
      <li>Your settings: which org you chose, editor preferences, an OAuth Consumer Key and AI service address if you enter them.</li>
    </ul>
    <p>This data stays on your computer in the browser&apos;s own extension storage. It is removed when you clear the extension&apos;s data or uninstall it.</p>
    <h2>Permissions</h2>
    <ul>
      <li><strong>Cookies:</strong> to use the Salesforce sign-in you already have, as described above.</li>
      <li><strong>Storage:</strong> to keep your drafts and settings in your browser.</li>
      <li><strong>Identity:</strong> only for the optional OAuth sign-in.</li>
      <li><strong>Access to Salesforce sites:</strong> to recognise which org a Salesforce tab belongs to and to work with that org.</li>
      <li><strong>Optional access to one AI address:</strong> requested only when you set up the AI assistant.</li>
    </ul>
    <h2>Sharing</h2>
    <p>We do not sell, share or transfer any data, because we never receive any. Salesforce processes your org&apos;s data under your agreement with Salesforce.</p>
    <h2>Changes</h2>
    <p>If this policy changes, we update this page and the date above.</p>
    <h2>Contact</h2>
    <p>Questions about privacy: see <Link href="/about#contact">Contact</Link> or open an issue at <a href="https://github.com/fcopensource/salesforce-studio-releases/issues">github.com/fcopensource/salesforce-studio-releases/issues</a>.</p>
    <p>Salesforce Studio is not affiliated with or endorsed by Salesforce, Inc. Salesforce is a trademark of Salesforce, Inc.</p>
  </article></main><Footer/></>;
}
