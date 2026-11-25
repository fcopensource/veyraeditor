import type {Metadata} from 'next';
import Link from 'next/link';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';

export const metadata:Metadata={
  title:'JSON Viewer Veyra Privacy Policy',
  description:'How the JSON Viewer Veyra Chrome extension handles your data: JSON is shown in your browser only, nothing is sent anywhere, and there is no tracking.',
  alternates:{canonical:'/json-viewer/privacy'},
};

export default function JsonViewerPrivacy(){
  return <><Nav/><main className="page-shell"><article className="legal">
    <div className="page-head"><span>LEGAL</span><h1>JSON Viewer Veyra Privacy Policy</h1><p>Last updated 25 November 2026</p></div>
    <p>JSON Viewer Veyra is a Chrome extension made by Veyra / FlightCoders that shows JSON documents as a readable, searchable tree. This policy explains what it handles and what it does not.</p>
    <h2>We do not collect your data</h2>
    <p>The extension does not collect, store, send or sell any personal data or browsing data. It has no account, analytics, advertising or tracking, and it makes no network requests.</p>
    <h2>What it reads</h2>
    <p>When a page you open is JSON (it has a JSON content type, or it is plain text that is valid JSON), the extension reads that page&apos;s text inside your browser to show it as a tree. On every other page it stops immediately and reads nothing.</p>
    <h2>What it stores</h2>
    <p>Only your choice of view (tree or raw), indentation and theme, saved with Chrome&apos;s own extension storage. If Chrome sync is turned on, Chrome may sync these settings to your Google account.</p>
    <h2>JSON you paste or open</h2>
    <p>JSON you paste or open on the extension&apos;s own page stays in that browser tab and is gone when you close it.</p>
    <h2>Permissions</h2>
    <ul>
      <li><strong>Storage:</strong> to remember your view, indentation and theme.</li>
      <li><strong>Access to the pages you open:</strong> JSON can come from any website or API, so the extension checks each page&apos;s content type and only changes pages that are JSON.</li>
    </ul>
    <h2>Children</h2>
    <p>The extension does not collect personal information from anyone, including children.</p>
    <h2>Changes</h2>
    <p>If this policy changes, we update this page and the date above.</p>
    <h2>Contact</h2>
    <p>Questions about privacy: see <Link href="/about#contact">Contact</Link>.</p>
  </article></main><Footer/></>;
}
