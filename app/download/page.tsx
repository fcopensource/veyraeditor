import type {Metadata} from 'next';
import Image from 'next/image';
import {Apple,Check,Download,Github,Laptop,Monitor,ShieldCheck,Terminal} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {checksums,installers,latestRelease,RELEASES_URL} from '@/lib/releases';
import {Breadcrumbs} from '@/components/Breadcrumbs';

export const metadata:Metadata={title:'Download Veyra for Windows, macOS & Linux',description:'Download Veyra, the free AI code editor, for Windows 10/11, macOS (Apple silicon and Intel) and Linux (AppImage, .deb, .rpm). Small installers with signed automatic updates.',alternates:{canonical:'/download'},openGraph:{url:'/download',title:'Download Veyra: free AI code editor'}};
export const revalidate=300;

type Link={label:string;href?:string;size?:number};
const mb=(bytes?:number)=>bytes?` · ${(bytes/1048576).toFixed(0)} MB`:'';

function Platform({icon,name,detail,primary,others,requirements}:{icon:React.ReactNode;name:string;detail:string;primary:Link;others:Link[];requirements:string[]}){
  return <article className="download-card platform-card">
    {icon}<h2>{name}</h2><p>{detail}</p>
    <a className="primary" href={primary.href||RELEASES_URL}><Download/>{primary.href?primary.label+mb(primary.size):'See all downloads'}</a>
    <div className="alt-downloads">{others.filter(link=>link.href).map(link=><a key={link.label} href={link.href}>{link.label}{mb(link.size)}</a>)}</div>
    <div className="requirements">{requirements.map(item=><span key={item}><Check/>{item}</span>)}</div>
  </article>;
}

export default async function DownloadPage(){
  const release=await latestRelease();
  const files=installers(release);
  const sums=checksums(release);
  const asset=(file?:{browser_download_url:string;size:number})=>({href:file?.browser_download_url,size:file?.size});
  return <><Nav/><Breadcrumbs items={[{name:'Download',path:'/download'}]}/><main className="page-shell">
    <div className="page-head"><span>{release?`VERSION ${release.version}`:'PUBLIC PREVIEW'}</span><h1>Meet your new workspace.</h1><p>Veyra runs natively on Windows, macOS and Linux, and keeps itself up to date automatically.</p></div>
    <div className="download-grid platforms">
      <Platform icon={<Monitor className="platform"/>} name="Windows" detail="Windows 10 and 11 · 64-bit" primary={{label:'Download installer (.exe)',...asset(files.windows)}} others={[{label:'MSI package',...asset(files.windowsMsi)}]} requirements={['Windows 10 or newer','WebView2 (installed automatically)']}/>
      <Platform icon={<Apple className="platform"/>} name="macOS" detail="Apple silicon and Intel" primary={{label:'Apple silicon (.dmg)',...asset(files.macArm)}} others={[{label:'Intel Mac (.dmg)',...asset(files.macIntel)}]} requirements={['macOS 11 or newer']}/>
      <Platform icon={<Terminal className="platform"/>} name="Linux" detail="64-bit distributions" primary={{label:'AppImage',...asset(files.appImage)}} others={[{label:'Debian / Ubuntu (.deb)',...asset(files.deb)},{label:'Fedora (.rpm)',...asset(files.rpm)}]} requirements={['WebKitGTK 4.1','glibc 2.35 or newer']}/>
    </div>
    <div className="download-grid">
      <article className="download-card primary-card"><div><h2>Always up to date</h2><p>Installed copies check for new versions and offer a one-click, signature-verified update. No reinstalling.</p><a className="secondary" href={RELEASES_URL}><Github/>Release notes</a></div><Image src="/veyra.png" width={120} height={120} alt="Veyra app icon"/></article>
      <article className="download-card"><Laptop className="platform"/><h2>Build from source</h2><p>Clone Veyra and run the complete Tauri application locally with Node.js 22+ and Rust.</p><a className="secondary" href="https://github.com/fcopensource/veyraeditor"><Github/>Open on GitHub</a></article>
    </div>
    <section className="trust-panel" aria-labelledby="trust-title">
      <h2 id="trust-title"><ShieldCheck/>Trust & verification</h2>
      <div className="trust-rows">
        <div><b>Automatic updates</b><span className="trust-ok">Cryptographically signed</span><p>Every update is signed with Veyra's update key, and installed copies verify the signature before installing anything.</p></div>
        <div><b>Windows publisher signing</b><span className="trust-warn">Not yet (preview)</span><p>Installers aren't signed with a Microsoft code-signing certificate yet, so SmartScreen may warn on first run: choose More info → Run anyway.</p></div>
        <div><b>Apple notarization</b><span className="trust-warn">Not yet (preview)</span><p>The app isn't notarized by Apple yet. The first time, right-click Veyra Studio → Open (see the <a href="/docs#install">install guide</a>).</p></div>
        <div><b>Built in public</b><span className="trust-ok">GitHub Actions</span><p>Every release is built from the open-source code by GitHub Actions. Compare the SHA-256 checksums below with your download.</p></div>
      </div>
      {sums.length>0&&<details className="checksums"><summary>SHA-256 checksums for v{release?.version}</summary>
        <table><thead><tr><th>File</th><th>Size</th><th>SHA-256</th></tr></thead><tbody>{sums.map(sum=><tr key={sum.name}><td><a href={sum.url}>{sum.name}</a></td><td>{sum.size} MB</td><td><code>{sum.sha256}</code></td></tr>)}</tbody></table>
        <p>Check a download: <code>certutil -hashfile FILE SHA256</code> (Windows) or <code>shasum -a 256 FILE</code> (macOS/Linux).</p>
      </details>}
    </section>
  </main><Footer/></>;
}
