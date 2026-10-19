import type {Metadata} from 'next';
import Link from 'next/link';
import {Nav} from '@/components/Nav';import {Footer} from '@/components/Footer';

export const metadata:Metadata={
  title:'Veyra PDF Privacy Policy',
  description:'How Veyra PDF handles your data: your PDFs are processed only on your computer, never uploaded, and the app has no account, analytics or tracking.',
  alternates:{canonical:'/pdf/privacy'},
};

export default function VeyraPdfPrivacy(){
  return <><Nav/><main className="page-shell"><article className="legal">
    <div className="page-head"><span>LEGAL</span><h1>Veyra PDF Privacy Policy</h1><p>Last updated 19 October 2026</p></div>
    <p>Veyra PDF is a Windows application made by Veyra / Flightcoders for editing, organizing and converting PDF files. This policy explains what the app handles and what it does not.</p>
    <h2>Your files stay on your computer</h2>
    <p>Everything Veyra PDF does to your documents (merging, splitting, highlighting, signing, watermarking, converting) happens on your own computer. Your PDFs, images, text and signatures are never uploaded to us or to anyone else.</p>
    <h2>We do not collect your data</h2>
    <p>Veyra PDF has no account and no analytics, telemetry, advertising or tracking. We do not receive your files, your name, your signature or information about how you use the app.</p>
    <h2>What stays on your computer</h2>
    <ul>
      <li><strong>Recent files:</strong> the names and locations of PDFs you opened, so you can reopen them from the Home screen. You can remove any of them from the list.</li>
      <li><strong>Your saved signature:</strong> only if you leave &ldquo;Remember on this computer&rdquo; switched on.</li>
      <li><strong>Settings:</strong> such as light or dark mode.</li>
    </ul>
    <p>This information is stored in the app&apos;s own data on your PC and is removed when you uninstall Veyra PDF.</p>
    <h2>Internet access</h2>
    <p>Veyra PDF works offline. It connects to the internet only if you choose to open a link, such as this website. If a paid Pro edition is offered in future, activating a licence key will contact our payment provider, Lemon Squeezy, to check the key; this policy will be updated before that happens.</p>
    <h2>Files you open and save</h2>
    <p>The app reads only the files you choose to open and writes only to the places you choose to save. Make sure you have the right to change any document you edit, including removing watermarks.</p>
    <h2>Children</h2>
    <p>Veyra PDF does not collect personal information from anyone, including children.</p>
    <h2>Changes</h2>
    <p>If this policy changes, we update this page and the date above.</p>
    <h2>Contact</h2>
    <p>Questions about privacy: see <Link href="/about#contact">Contact</Link>.</p>
  </article></main><Footer/></>;
}
