import type {Metadata} from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {Download,Eraser,Store,FileImage,Files,Globe,Highlighter,LayoutGrid,ShieldCheck,Signature,Stamp,WifiOff} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {ClosingCTA} from '@/components/ContentPage';
import {absolute,jsonLd,PDF_DOWNLOAD_URL,PDF_STORE_URL,PDF_VERSION} from '@/lib/site';
import '../live-server/live-server.css';
import '../port-manager/port-manager.css';
import '../salesforce-studio/salesforce-studio.css';

export const metadata:Metadata={
  title:'Veyra PDF: Free Offline PDF Editor for Windows',
  description:'Edit, highlight, sign, merge, split and watermark PDFs on Windows. Everything happens on your PC: no uploads, no account, no ads. Free download.',
  keywords:['PDF editor for Windows','offline PDF editor','sign PDF','merge PDF','split PDF','PDF watermark','JPG to PDF','highlight PDF','Veyra PDF'],
  alternates:{canonical:'/pdf'},
  openGraph:{url:'/pdf',title:'Veyra PDF: every PDF tool, one private app',description:'Edit, sign, merge, split and watermark PDFs offline on Windows.',images:[{url:'/veyra-pdf-home.webp',width:1366,height:860,alt:'Veyra PDF home screen with all tools'}]},
};

const FEATURES=[
  {icon:Highlighter,title:'Highlight and add text',copy:'Mark what matters in yellow, green, blue or pink, and type anywhere on a page in any size and colour.'},
  {icon:Signature,title:'Fill & sign',copy:'Draw your signature or type it in a handwriting style, then click to place it. Veyra PDF can remember it for next time.'},
  {icon:Files,title:'Combine files',copy:'Merge any number of PDFs and JPG or PNG images into one PDF, in the order you choose.'},
  {icon:LayoutGrid,title:'Organize pages',copy:'Drag pages into order, rotate, delete, duplicate and insert blank pages. Extract chosen pages or split into several files.'},
  {icon:Stamp,title:'Watermarks and page numbers',copy:'Add CONFIDENTIAL, DRAFT or your own text with a live preview, and number pages like “Page 3 of 12” in any corner.'},
  {icon:Eraser,title:'Remove watermarks and white-out',copy:'Lift off watermarks added with a PDF editor, and cover text, numbers or marks with White-out.'},
  {icon:FileImage,title:'Convert',copy:'Photos and scans to PDF, PDF pages to JPG or PNG, and all the text out to a .txt file.'},
  {icon:WifiOff,title:'Offline and private',copy:'Your files never leave your PC. There is no account, no upload and no tracking, so private documents stay private.'},
];
const TOOLS=['Highlight','Add text','Fill & sign','Draw','Shapes','White-out','Add image','Combine files','Organize pages','Rotate pages','Delete pages','Extract pages','Split PDF','Insert blank page','Duplicate pages','Add watermark','Remove watermark','Add page numbers','Images to PDF','PDF to images','Extract text','Document properties'];
const FAQ=[
  {q:'Is Veyra PDF free?',a:'Yes. Veyra PDF is free to download and use on Windows 10 and 11, with no account, no ads and no watermark on your files.'},
  {q:'Are my files uploaded anywhere?',a:'No. Unlike online PDF tools, Veyra PDF does all its work on your computer. Your PDFs are never uploaded, so bank statements, contracts and ID documents stay on your PC.'},
  {q:'Can I sign a PDF with Veyra PDF?',a:'Yes. Choose Fill & sign, draw your signature with the mouse or a pen, or type your name and pick a handwriting style, then click on the page to place it. You can move and resize it before saving.'},
  {q:'Can Veyra PDF remove a watermark?',a:'It removes watermarks that were added with a PDF editor such as Acrobat, Word or Veyra PDF. A watermark that is part of a scanned image cannot be lifted off; cover it with White-out instead. Only change documents you own or have permission to edit.'},
  {q:'Can I edit the existing text in a PDF?',a:'You can cover existing text with White-out and type new text on top. Changing the original words in place is on the roadmap.'},
  {q:'Windows says “Windows protected your PC”. Is it safe?',a:'Yes. The direct download is not yet signed with a Microsoft certificate, so SmartScreen may warn the first time. Choose More info, then Run anyway, or get Veyra PDF from the Microsoft Store instead: that version is signed, installs without the warning and updates by itself.'},
];

export default function VeyraPdfPage(){
  const app={
    '@context':'https://schema.org','@type':'SoftwareApplication',name:'Veyra PDF',applicationCategory:'BusinessApplication',
    operatingSystem:'Windows 10, Windows 11',url:absolute('/pdf'),image:absolute('/veyra-pdf-home.webp'),downloadUrl:PDF_STORE_URL,installUrl:PDF_STORE_URL,softwareVersion:PDF_VERSION,
    description:'An offline PDF editor and toolkit for Windows: highlight, add text, sign, merge, split, organize, watermark and convert PDFs without uploading them.',
    offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},publisher:{'@type':'Organization',name:'Veyra',url:absolute('/')},
  };
  const faq={'@context':'https://schema.org','@type':'FAQPage',mainEntity:FAQ.map(item=>({'@type':'Question',name:item.q,acceptedAnswer:{'@type':'Answer',text:item.a}}))};

  return <><Nav/><Breadcrumbs items={[{name:'Veyra PDF',path:'/pdf'}]}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(app)}}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(faq)}}/>
    <main className="page-shell"><div className="content live-page">
      <section className="live-hero">
        <div className="live-hero-glow" aria-hidden="true"/>
        <div className="live-icon"><Image src="/logo-512.png" width={148} height={148} alt="Veyra PDF icon" priority/></div>
        <span className="live-kicker"><i/>VEYRA ORIGINAL · FOR WINDOWS</span>
        <h1>Veyra <em>PDF</em></h1>
        <p className="live-tagline">Every PDF tool you need. One private app.</p>
        <p className="live-intro">Edit, highlight, sign, merge, split, watermark and convert PDFs right on your PC. Fast, offline and free, with nothing uploaded.</p>
        <div className="live-actions">
          <a className="primary" href={PDF_STORE_URL}><Store size={16}/>Get it from the Microsoft Store</a>
          <a className="secondary" href={PDF_DOWNLOAD_URL}><Download size={16}/>Download the installer</a>
          <a className="secondary" href="#tools"><LayoutGrid size={16}/>See all 22 tools</a>
        </div>
        <p className="live-micro">v{PDF_VERSION} · Free · Windows 10 and 11 · Microsoft Store or 2 MB installer · By Veyra</p>
      </section>

      <section className="pm-shot">
        <img src="/veyra-pdf-home.webp" alt="Veyra PDF home screen: open files, recent files and 22 tools in Edit & sign, Organize, Watermark & numbers and Convert" width={1366} height={860} loading="lazy"/>
      </section>

      <section className="content-section">
        <header><span>FEATURES</span><h2>Everything you do with PDFs, without the upload.</h2></header>
        <div className="cards">{FEATURES.map(feature=><article className="card" key={feature.title}><feature.icon/><h3>{feature.title}</h3><p>{feature.copy}</p></article>)}</div>
      </section>

      <section className="content-section split reverse">
        <div>
          <span className="kicker">EDIT &amp; SIGN</span>
          <h2>Mark it up like paper.</h2>
          <p>Pick a tool from the bar beside the page and draw. Highlights, text, boxes, ink, white-out, images and signatures can all be moved, resized and deleted, and Ctrl+Z undoes anything.</p>
        </div>
        <div className="sfs-shot"><img src="/veyra-pdf-edit.webp" alt="A report in Veyra PDF with highlighted lines, a red box, added text and freehand ink" width={1366} height={860} loading="lazy"/></div>
      </section>

      <section className="content-section split">
        <div>
          <span className="kicker">FILL &amp; SIGN</span>
          <h2>Sign in seconds.</h2>
          <ul>
            <li><ShieldCheck/><span><strong>Draw or type.</strong> Use a mouse, pen or finger, or type your name in one of four handwriting styles.</span></li>
            <li><ShieldCheck/><span><strong>Place it anywhere.</strong> Click the page, then drag and resize until it sits on the line.</span></li>
            <li><ShieldCheck/><span><strong>Remembered for next time.</strong> Your signature is kept only on your PC.</span></li>
          </ul>
        </div>
        <div className="sfs-shot"><img src="/veyra-pdf-sign.webp" alt="The Fill & sign dialog with a typed signature in four handwriting styles" width={1366} height={860} loading="lazy"/></div>
      </section>

      <section className="content-section split reverse" id="tools">
        <div>
          <span className="kicker">22 TOOLS</span>
          <h2>All in one app.</h2>
          <div className="pm-stack">{TOOLS.map(name=><span key={name}>{name}</span>)}</div>
        </div>
        <div className="sfs-shot"><img src="/veyra-pdf-organize.webp" alt="Organize view in dark mode: page thumbnails to drag into order, with the tools panel" width={1366} height={860} loading="lazy"/></div>
      </section>

      <section className="content-section split">
        <div>
          <span className="kicker">INSTALL</span>
          <h2>Ready in a minute.</h2>
          <ol className="live-install">
            <li>Open <a href={PDF_STORE_URL}>Veyra PDF in the Microsoft Store</a> and click <strong>Get</strong>. It&apos;s signed, trusted by Windows, and updates by itself.</li>
            <li>Open <strong>Veyra PDF</strong> from the Start menu, or right-click any PDF and choose <strong>Open with</strong>.</li>
          </ol>
          <p className="live-note">Prefer not to use the Store? <a href={PDF_DOWNLOAD_URL}>Download the installer</a> (2 MB). No administrator rights needed.</p>
        </div>
        <div className="visual" aria-label="Keyboard shortcuts">
          <small>Shortcuts</small>
          <b>Ctrl+O</b> Open files<br/>
          <b>H · T · P</b> Highlight · Text · Draw<br/>
          <b>Ctrl+S</b> Save as PDF
        </div>
      </section>

      <section className="content-section">
        <header><span>FAQ</span><h2>Questions</h2></header>
        <div className="live-faq">{FAQ.map(item=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
        <p className="live-more"><Globe size={14}/>More from Veyra: <Link href="/salesforce-studio">Salesforce Studio</Link>, <Link href="/live-server">Veyra Live Server</Link> and <Link href="/port-manager">Veyra Port Manager</Link>.</p>
        <p className="sfs-legal">Veyra PDF is a product of Veyra / Flightcoders. See the <Link href="/pdf/privacy">Privacy Policy</Link>.</p>
      </section>

      <ClosingCTA title="Made by the Veyra team." copy="Veyra Studio is a fast, free code editor with Live Server, Python debugging and Veyra AI built in."/>
    </div></main><Footer/></>;
}
