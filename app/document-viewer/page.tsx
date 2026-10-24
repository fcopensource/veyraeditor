import type {Metadata} from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {Copy,Download,ExternalLink,FileSpreadsheet,FileText,Lock,Presentation,Search,Table2,Zap} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {MoreExtensions} from '@/components/MoreExtensions';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {ClosingCTA} from '@/components/ContentPage';
import {absolute,jsonLd,marketplaceUrl,VSCODE_EXTENSIONS,vsixUrl} from '@/lib/site';
import '../live-server/live-server.css';
import '../port-manager/port-manager.css';

const EXT=VSCODE_EXTENSIONS.documentViewer;
const MARKETPLACE=marketplaceUrl(EXT.id), VSIX=vsixUrl(EXT);

export const metadata:Metadata={
  title:'Open Word, PowerPoint and Excel Files in VS Code: Document Viewer',
  description:'Open .docx, .pptx and .xlsx files right in VS Code. Word pages, PowerPoint slides with speaker notes and a Present mode, Excel sheets with formats and formulas, and CSV as a sortable table. Free and offline.',
  keywords:['docx viewer VS Code','open word file in VS Code','pptx viewer','xlsx viewer VS Code','excel viewer','powerpoint viewer','csv table viewer','office viewer','VS Code extension'],
  alternates:{canonical:'/document-viewer'},
  openGraph:{url:'/document-viewer',title:'Veyra Document Viewer',description:'Open Word, PowerPoint and Excel files right in VS Code. Free.',images:[{url:'/document-viewer-hero.webp',width:1920,height:960,alt:'A PowerPoint deck open in VS Code with slide thumbnails and speaker notes'}]},
};

const FEATURES=[
  {icon:FileText,title:'Word, as pages',copy:'.docx shown page by page with headings, tables, images and fonts, and an outline of the headings to jump through.'},
  {icon:Presentation,title:'PowerPoint, as slides',copy:'Theme colours, layouts and masters, pictures, shapes and tables, with the speaker notes for each slide.'},
  {icon:Zap,title:'Present mode',copy:'Show the deck full screen from the slide you are on, and move through it with the arrow keys or Space.'},
  {icon:FileSpreadsheet,title:'Excel, as sheets',copy:'Currency, percent and date formats, merged cells, fills, sheet tabs, and each cell’s formula in the formula bar.'},
  {icon:Table2,title:'CSV as a table',copy:'Open as Table turns CSV and TSV into a grid you can sort and filter. Quotes, commas and line breaks are read correctly.'},
  {icon:Search,title:'Find and zoom',copy:'Ctrl+F highlights every match in a document, deck or sheet. Zoom in and out without losing your place.'},
  {icon:Copy,title:'Copy the text',copy:'Copy all the text of a file in one click, ready to paste into a note, an issue or a prompt.'},
  {icon:ExternalLink,title:'Open in app',copy:'Need to edit? One click opens the file in Word, PowerPoint or Excel.'},
  {icon:Lock,title:'Offline and private',copy:'Everything runs inside VS Code. Files are never uploaded, and there is no account or telemetry.'},
];
const FAQ=[
  {q:'Is it free?',a:'Yes. Veyra Document Viewer is free and MIT licensed, with no account and no telemetry.'},
  {q:'Are my files uploaded anywhere?',a:'No. Files are read and shown inside VS Code on your computer. Nothing is sent over the network.'},
  {q:'Can I edit documents with it?',a:'It is a viewer. To change a file, click Open in app and it opens in Word, PowerPoint or Excel, or whichever app your computer uses for that file.'},
  {q:'Does it open old .doc, .ppt and .xls files?',a:'Those Office 97–2003 files use a closed binary format, so they open with a short explanation and an Open in default app button. Save them as .docx, .pptx or .xlsx to view them here.'},
  {q:'Why do CSV files still open as text?',a:'So you can keep editing them. Click Open as Table in the editor title bar, or right-click the file, to see a CSV or TSV as a sortable table.'},
  {q:'Are Excel formulas recalculated?',a:'No. Cells show the result saved in the file, and the formula itself appears in the formula bar when you click the cell.'},
];

export default function DocumentViewerPage(){
  const app={
    '@context':'https://schema.org','@type':'SoftwareApplication',name:'Veyra Document Viewer',applicationCategory:'DeveloperApplication',
    operatingSystem:'Windows, macOS, Linux',url:absolute('/document-viewer'),image:absolute('/document-viewer-icon.png'),softwareVersion:EXT.version,downloadUrl:EXT.listed?MARKETPLACE:VSIX,
    description:'A free VS Code extension that opens Word, PowerPoint and Excel files, and shows CSV files as a sortable table.',
    offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},publisher:{'@type':'Organization',name:'Veyra',url:absolute('/')},
  };
  const faq={'@context':'https://schema.org','@type':'FAQPage',mainEntity:FAQ.map(item=>({'@type':'Question',name:item.q,acceptedAnswer:{'@type':'Answer',text:item.a}}))};

  return <><Nav/><Breadcrumbs items={[{name:'Extensions',path:'/extensions'},{name:'Veyra Document Viewer',path:'/document-viewer'}]}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(app)}}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(faq)}}/>
    <main className="page-shell"><div className="content live-page">
      <section className="live-hero">
        <div className="live-hero-glow" aria-hidden="true"/>
        <div className="live-icon"><Image src="/document-viewer-icon.png" width={148} height={148} alt="Veyra Document Viewer icon" priority/></div>
        <span className="live-kicker"><i/>NEW · FOR VS CODE</span>
        <h1>Veyra <em>Document Viewer</em></h1>
        <p className="live-tagline">Open Word, PowerPoint and Excel files right in VS Code.</p>
        <p className="live-intro">Click a .docx, .pptx or .xlsx in the Explorer and see the document itself, not a binary file warning. Pages look like pages, slides look like slides, and spreadsheets keep their formats and formulas.</p>
        <div className="live-actions">
          {EXT.listed?<a className="primary" href={MARKETPLACE}><Zap size={16}/>Get it for VS Code</a>:<a className="primary" href={VSIX}><Download size={16}/>Download for VS Code</a>}
          <a className="secondary" href="#install"><Zap size={16}/>How to install</a>
        </div>
        <p className="live-micro">{EXT.id} · v{EXT.version} · Free · MIT · Windows, macOS, Linux</p>
      </section>

      <section className="pm-shot"><img src="/document-viewer-ppt.webp" alt="A PowerPoint deck open in VS Code: slide thumbnails, the title slide and the speaker notes" width={1400} height={900}/></section>

      <section className="content-section">
        <header><span>FEATURES</span><h2>Every Office file, one click away.</h2></header>
        <div className="cards">{FEATURES.map(feature=><article className="card" key={feature.title}><feature.icon/><h3>{feature.title}</h3><p>{feature.copy}</p></article>)}</div>
      </section>

      <section className="pm-shot"><img src="/document-viewer-word.webp" alt="A Word report shown as a white page with an outline of its headings" width={1400} height={900} loading="lazy"/></section>

      <section className="pm-shot"><img src="/document-viewer-excel.webp" alt="An Excel workbook with dollar amounts, percentages, dates and the formula =SUM(B3:B5) in the formula bar" width={1400} height={900} loading="lazy"/></section>

      <section className="content-section split" id="install">
        <div>
          <span className="kicker">INSTALL</span>
          <h2>Ready in a minute.</h2>
          {EXT.listed?<ol className="live-install">
            <li>In VS Code, open <strong>Extensions</strong> (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>) and search for <strong>Veyra Document Viewer</strong>, or open it on the <a href={MARKETPLACE}>Visual Studio Marketplace</a>.</li>
            <li>Click <strong>Install</strong>, then click any Word, PowerPoint or Excel file.</li>
          </ol>:<ol className="live-install">
            <li><a href={VSIX}>Download the <code>.vsix</code></a> (110 KB).</li>
            <li>In VS Code, press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> and run <strong>Extensions: Install from VSIX…</strong>, then choose the file.</li>
            <li>Click any <code>.docx</code>, <code>.pptx</code> or <code>.xlsx</code> file. There&apos;s nothing to set up.</li>
          </ol>}
          <p className="live-note">To open a file as text instead, right-click it and choose <strong>Open With…</strong>. {EXT.listed?'':'Coming to the Visual Studio Marketplace soon.'}</p>
        </div>
        <div className="visual" aria-label="Supported files">
          <small>Opens</small>
          <b>Word</b> <i>.docx .docm .dotx</i><br/>
          <b>PowerPoint</b> <i>.pptx .pptm .ppsx</i><br/>
          <b>Excel</b> <i>.xlsx .xlsm</i><br/>
          <b>Tables</b> <i>.csv .tsv</i>
        </div>
      </section>

      <section className="pm-shot"><img src="/document-viewer-csv.webp" alt="A CSV file as a table sorted by spend, with a filter box" width={1400} height={900} loading="lazy"/></section>

      <section className="content-section">
        <header><span>FAQ</span><h2>Questions</h2></header>
        <div className="live-faq">{FAQ.map(item=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
        <MoreExtensions current="/document-viewer"/>
      </section>

      <ClosingCTA title="Made by the Veyra team." copy="Veyra Studio is a fast, free code editor with Live Server, Python debugging and Veyra AI built in."/>
    </div></main><Footer/></>;
}
