import type {Metadata} from 'next';
import Link from 'next/link';
import {Nav} from '@/components/Nav';import {Footer} from '@/components/Footer';

export const metadata:Metadata={
  title:'BaazCyber Antivirus Privacy Policy',
  description:'How BaazCyber Antivirus handles your data: every scan runs on your PC, no files are uploaded, and there is no account, analytics or telemetry.',
  alternates:{canonical:'/baazcyber/privacy'},
};

export default function BaazCyberPrivacy(){
  return <><Nav/><main className="page-shell"><article className="legal">
    <div className="page-head"><span>LEGAL</span><h1>BaazCyber Antivirus Privacy Policy</h1><p>Last updated 8 November 2026</p></div>
    <p>BaazCyber Antivirus is a Windows app made by BaazCyber, a FlightCoders company. It scans files on your computer for malware. This policy explains what the app does with your data. In short: <strong>your files never leave your computer</strong>.</p>

    <h2>We do not collect your data</h2>
    <p>BaazCyber has no account, no analytics and no telemetry. Scanning happens entirely on your PC with BaazCyber&apos;s own scanning engine. We never receive your files, their contents, their names, your scan results or anything about what is on your computer.</p>

    <h2>What stays on your computer</h2>
    <ul>
      <li><strong>Quarantined files.</strong> When you quarantine a threat, BaazCyber moves the file into its own folder (<code>%LOCALAPPDATA%\BaazCyber</code>) and stores it encoded, so it can no longer run. You can restore or delete it at any time from the Quarantine screen.</li>
      <li><strong>Scan history and settings.</strong> A record of your past scans and your preferences are kept on your PC so the app can show them to you.</li>
      <li><strong>Security reports.</strong> PDF reports are created on your PC and saved only where you choose.</li>
    </ul>
    <p>Uninstalling BaazCyber removes the app. To remove its data as well, delete the <code>%LOCALAPPDATA%\BaazCyber</code> folder.</p>

    <h2>The only network request: update checks</h2>
    <p>When BaazCyber starts, it checks whether a newer version is available by contacting <code>veyraeditor.com</code>, which answers from our releases on GitHub. The request contains only what any update check needs: your Windows version type (for example <em>windows</em>, <em>x86_64</em>) and the BaazCyber version you have installed. As with any request on the internet, the servers involved see your IP address. We do not use these requests to identify you, and we do not combine them with any other data.</p>
    <p>If an update is available, it is downloaded from GitHub only when you choose to install it, and its digital signature is checked before it is installed.</p>
    <p>If you installed BaazCyber from the Microsoft Store, the Store&apos;s own privacy statement also applies to the download and installation.</p>

    <h2>Children</h2>
    <p>BaazCyber does not collect personal information from anyone, including children.</p>

    <h2>Changes</h2>
    <p>If this policy changes, we will update this page and the date above.</p>

    <h2>Contact</h2>
    <p>Questions about privacy? Email <a href="mailto:hire@flightcoders.com">hire@flightcoders.com</a>. You can also read more about <Link href="/baazcyber">BaazCyber Antivirus</Link>.</p>
  </article></main><Footer/></>;
}
