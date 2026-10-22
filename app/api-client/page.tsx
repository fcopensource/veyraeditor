import type {Metadata} from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {Braces,Code2,Download,FileJson,FolderGit2,Globe,History,KeyRound,Lock,ShieldCheck,Zap} from 'lucide-react';
import {Nav} from '@/components/Nav';
import {Footer} from '@/components/Footer';
import {Breadcrumbs} from '@/components/Breadcrumbs';
import {ClosingCTA} from '@/components/ContentPage';
import {absolute,jsonLd,marketplaceUrl,VSCODE_EXTENSIONS,vsixUrl} from '@/lib/site';
import '../live-server/live-server.css';
import '../port-manager/port-manager.css';

const EXT=VSCODE_EXTENSIONS.apiClient;
const MARKETPLACE=marketplaceUrl(EXT.id), VSIX=vsixUrl(EXT);

export const metadata:Metadata={
  title:'Veyra API Client: a Free Postman Alternative for VS Code',
  description:'Send REST and GraphQL requests in VS Code. Collections saved in your repo, environments with private values, cURL and Postman import. Free, no account.',
  keywords:['API client','REST client','VS Code API client','Postman alternative','Thunder Client alternative','GraphQL client','HTTP client','curl import'],
  alternates:{canonical:'/api-client'},
  openGraph:{url:'/api-client',title:'Veyra API Client',description:'Test any API without leaving VS Code. Free, no account, no limits.',images:[{url:'/api-client-hero.webp',width:1920,height:960,alt:'Veyra API Client: a request beside its response'}]},
};

const FEATURES=[
  {icon:Zap,title:'Every request you need',copy:'GET to OPTIONS, with params, headers and a body in JSON, text, XML, form, multipart or GraphQL. Ctrl+Enter sends.'},
  {icon:FileJson,title:'Responses you can read',copy:'Status, time and size at a glance, pretty JSON with colours, HTML and image preview, headers, and the exact request that was sent.'},
  {icon:FolderGit2,title:'Collections in your repo',copy:'Saved as readable JSON in .veyra-api. Commit them and your team has the same requests, with no paid sync plan.'},
  {icon:Globe,title:'Environments',copy:'Dev, Staging and Production, used anywhere as {{baseUrl}} or {{token}}. Unknown variables are flagged before you send.'},
  {icon:Lock,title:'Secrets stay local',copy:'Mark a value Private and it is stored only on your computer, in a file git ignores. Shared values travel with the repo.'},
  {icon:KeyRound,title:'Auth built in',copy:'Bearer tokens, Basic auth and API keys in a header or query. The right Authorization and Content-Type headers are added for you.'},
  {icon:Braces,title:'Import cURL and Postman',copy:'Paste a command from your browser or API docs, or bring a whole Postman collection with folders, auth and variables.'},
  {icon:Code2,title:'Copy as code',copy:'Any request as cURL, JavaScript fetch or Python requests, ready to paste into your app or docs.'},
  {icon:History,title:'History and .http files',copy:'Every request you send is kept, ready to reopen or save. Send Request buttons appear in .http and .rest files.'},
];
const FAQ=[
  {q:'Is Veyra API Client free?',a:'Yes. It is free and MIT licensed, with no account, no request limits and no telemetry. Sharing collections through git is free too.'},
  {q:'Where are my requests saved?',a:'In a .veyra-api folder in your project, as readable JSON: one file per collection, plus environments.json. With no folder open, they are kept in VS Code’s storage on your computer.'},
  {q:'How do I keep tokens out of git?',a:'Tick Private next to a variable. Its value is saved only in environments.local.json on your computer, which the .veyra-api/.gitignore file excludes. Everyone else sees the variable with an empty value to fill in.'},
  {q:'Can I move from Postman or Thunder Client?',a:'Yes. Export your collection from Postman as Collection v2.1 and choose Import Postman Collection. Folders, headers, bodies, auth and collection variables come across. Any single request can also be pasted as a cURL command.'},
  {q:'Does it send my requests through a Veyra server?',a:'No. Requests go straight from your computer to the API you call. Nothing passes through Veyra.'},
];

export default function ApiClientPage(){
  const app={
    '@context':'https://schema.org','@type':'SoftwareApplication',name:'Veyra API Client',applicationCategory:'DeveloperApplication',
    operatingSystem:'Windows, macOS, Linux',url:absolute('/api-client'),image:absolute('/api-client-icon.png'),softwareVersion:EXT.version,downloadUrl:EXT.listed?MARKETPLACE:VSIX,
    description:'A free API client extension for VS Code: REST and GraphQL requests, collections saved in the repo, environments with private values, and cURL and Postman import.',
    offers:{'@type':'Offer',price:'0',priceCurrency:'USD'},publisher:{'@type':'Organization',name:'Veyra',url:absolute('/')},
  };
  const faq={'@context':'https://schema.org','@type':'FAQPage',mainEntity:FAQ.map(item=>({'@type':'Question',name:item.q,acceptedAnswer:{'@type':'Answer',text:item.a}}))};

  return <><Nav/><Breadcrumbs items={[{name:'Extensions',path:'/extensions'},{name:'Veyra API Client',path:'/api-client'}]}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(app)}}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(faq)}}/>
    <main className="page-shell"><div className="content live-page">
      <section className="live-hero">
        <div className="live-hero-glow" aria-hidden="true"/>
        <div className="live-icon"><Image src="/api-client-icon.png" width={148} height={148} alt="Veyra API Client icon" priority/></div>
        <span className="live-kicker"><i/>NEW · VEYRA ORIGINAL · FOR VS CODE</span>
        <h1>Veyra <em>API Client</em></h1>
        <p className="live-tagline">Test any API without leaving VS Code.</p>
        <p className="live-intro">Send REST and GraphQL requests, keep them in collections that live in your repo, and switch between Dev, Staging and Production in one click. Free, with no account and no limits.</p>
        <div className="live-actions">
          {EXT.listed?<a className="primary" href={MARKETPLACE}><Code2 size={16}/>Get it for VS Code</a>:<a className="primary" href={VSIX}><Download size={16}/>Download for VS Code</a>}
          <a className="secondary" href="#install"><Zap size={16}/>How to install</a>
        </div>
        <p className="live-micro">{EXT.id} · v{EXT.version} · Free · MIT · Windows, macOS, Linux</p>
      </section>

      <section className="pm-shot"><img src="/api-client-request.webp" alt="A POST request with a JSON body beside its 201 Created response, 84 ms and 412 bytes, shown as pretty JSON" width={1600} height={1000}/></section>

      <section className="content-section">
        <header><span>FEATURES</span><h2>Everything you use Postman for. In your editor.</h2></header>
        <div className="cards">{FEATURES.map(feature=><article className="card" key={feature.title}><feature.icon/><h3>{feature.title}</h3><p>{feature.copy}</p></article>)}</div>
      </section>

      <section className="pm-shot"><img src="/api-client-collections.webp" alt="The Collections sidebar with requests coloured by method, and the .veyra-api folder with shared and private files" width={1600} height={900} loading="lazy"/></section>

      <section className="content-section split reverse">
        <div>
          <span className="kicker">YOUR WORKFLOW, YOUR REPO</span>
          <h2>No account. No cloud. No limits.</h2>
          <ul>
            <li><ShieldCheck/><span><strong>Requests go straight to your API.</strong> Nothing passes through a Veyra server, and there is no telemetry.</span></li>
            <li><ShieldCheck/><span><strong>Shared through git, for free.</strong> Collections are files in your project, reviewed in pull requests like your code.</span></li>
            <li><ShieldCheck/><span><strong>Secrets never committed.</strong> Private values live only in a git-ignored file on your computer.</span></li>
            <li><ShieldCheck/><span><strong>Bring your work with you.</strong> Import Postman collections and cURL commands; export back to Postman any time.</span></li>
          </ul>
        </div>
        <div className="visual" aria-label="The .veyra-api folder">
          <small>.veyra-api/</small>
          <b>collections/shop-api.json</b><br/>
          <b>environments.json</b> <i>shared</i><br/>
          <b>environments.local.json</b> <em>private</em><br/>
          <span style={{color:'#5f6d7a'}}>.gitignore</span>
        </div>
      </section>

      <section className="pm-shot"><img src="/api-client-environments.webp" alt="The environment editor with Development active, a private token shown as dots, and built-in values" width={1600} height={900} loading="lazy"/></section>

      <section className="content-section split" id="install">
        <div>
          <span className="kicker">INSTALL</span>
          <h2>Ready in a minute.</h2>
          {EXT.listed?<ol className="live-install">
            <li>In VS Code, open <strong>Extensions</strong> (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>) and search for <strong>Veyra API Client</strong>, or open it on the <a href={MARKETPLACE}>Visual Studio Marketplace</a>.</li>
            <li>Click <strong>Install</strong>, then the <strong>Veyra API</strong> icon in the Activity Bar.</li>
          </ol>:<ol className="live-install">
            <li><a href={VSIX}>Download the <code>.vsix</code></a> (100 KB).</li>
            <li>In VS Code, press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> and run <strong>Extensions: Install from VSIX…</strong>, then choose the file.</li>
            <li>Click the <strong>Veyra API</strong> icon in the Activity Bar and choose <strong>New Request</strong>.</li>
          </ol>}
          <p className="live-note">Try it: send <code>GET https://jsonplaceholder.typicode.com/todos/1</code>. {EXT.listed?'':'Coming to the Visual Studio Marketplace soon.'}</p>
        </div>
        <div className="visual" aria-label="Commands">
          <small>Command Palette</small>
          <b>Veyra API: New Request</b><br/>
          <b>Veyra API: Import cURL</b><br/>
          <b>Veyra API: Import Postman Collection…</b><br/>
          <b>Veyra API: Switch Environment</b><br/>
          <span style={{color:'#5f6d7a'}}>In a request:</span> <i>Ctrl+Enter</i> send
        </div>
      </section>

      <section className="content-section">
        <header><span>FAQ</span><h2>Questions</h2></header>
        <div className="live-faq">{FAQ.map(item=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
        <p className="live-more"><ShieldCheck size={14}/>More for VS Code: <Link href="/mongodb">Veyra Query Lens for MongoDB</Link>, <Link href="/env">Veyra Env</Link>, <Link href="/docker">Veyra Container Studio for Docker</Link>, <Link href="/mcp-studio">Veyra MCP Studio</Link>, <Link href="/npm-intellisense">Veyra npm IntelliSense</Link>, <Link href="/port-manager">Veyra Port Manager</Link> and <Link href="/live-server">Veyra Live Server</Link>.</p>
      </section>

      <ClosingCTA title="Made by the Veyra team." copy="Veyra Studio is a fast, free code editor with Live Server, Python debugging and Veyra AI built in."/>
    </div></main><Footer/></>;
}
