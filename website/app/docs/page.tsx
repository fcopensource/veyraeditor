import type {Metadata} from 'next';
import Link from 'next/link';
import {Info,TriangleAlert} from 'lucide-react';
import {ClosingCTA,ContentPage} from '@/components/ContentPage';
import {GITHUB_URL} from '@/lib/site';

export const metadata:Metadata={
  title:'Documentation: Getting Started with Veyra',
  description:'Install Veyra on Windows, macOS or Linux, open your first project, learn the keyboard shortcuts, set up TypeScript, ESLint and Prettier, connect AI with Ollama or your own API key, and fix common problems.',
  alternates:{canonical:'/docs'},
  openGraph:{url:'/docs',title:'Veyra documentation: getting started'},
};

const SECTIONS=[
  ['install','Install'],['first-project','Your first project'],['shortcuts','Keyboard shortcuts'],['language-tools','Language tools'],
  ['ai','Set up AI'],['git','Git'],['extensions','Extensions & themes'],['updates','Updates'],['troubleshooting','Troubleshooting'],['source','Build from source'],
] as const;

const SHORTCUTS:[string,string,string][]=[
  ['Quick open a file','Ctrl+P','⌘P'],['Command palette','Ctrl+Shift+P','⇧⌘P'],['Save / save all','Ctrl+S / Ctrl+Shift+S','⌘S / ⇧⌘S'],
  ['Find / replace in file','Ctrl+F / Ctrl+Alt+F','⌘F / ⌥⌘F'],['Search in all files','Ctrl+Shift+F','⇧⌘F'],['Go to line','Ctrl+G','⌃G'],
  ['Go to symbol','Ctrl+Shift+O','⇧⌘O'],['Format document','Shift+Alt+F','⇧⌥F'],['Toggle word wrap','Alt+Z','⌥Z'],
  ['Toggle sidebar','Ctrl+B','⌘B'],['Open terminal / new terminal','Ctrl+` / Ctrl+Shift+`','⌃` / ⌃⇧`'],['Source control','Ctrl+Shift+G','⌃⇧G'],
  ['AI assistant','Ctrl+L','⌘L'],['Edit selection with AI','Ctrl+K','⌘K'],['Open folder / new file','Ctrl+O / Ctrl+N','⌘O / ⌘N'],['Settings','Ctrl+,','⌘,'],
];

const Note=({warn,children}:{warn?:boolean;children:React.ReactNode})=><div className={'callout'+(warn?' warn':'')}>{warn?<TriangleAlert/>:<Info/>}<p>{children}</p></div>;

export default function Docs(){
  const howTo={'@context':'https://schema.org','@type':'HowTo',name:'Install Veyra and open your first project',step:[
    {'@type':'HowToStep',name:'Download',text:'Download the installer for your operating system from veyraeditor.com/download.'},
    {'@type':'HowToStep',name:'Install',text:'Run the installer. On macOS drag Veyra Studio to Applications; on Linux run the AppImage or install the .deb or .rpm package.'},
    {'@type':'HowToStep',name:'Open a folder',text:'Start Veyra and choose Open a project, or press Ctrl+O (⌘O on macOS).'},
    {'@type':'HowToStep',name:'Turn on language tools',text:'Open Extensions, then Web development, and install TypeScript & JavaScript, ESLint or Prettier.'},
  ]};
  return <ContentPage path="/docs" crumb="Docs" kicker="DOCUMENTATION" title="Getting started with Veyra"
    intro="Everything you need to install Veyra, open your first project and make it yours. It takes about five minutes.">
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(howTo).replace(/</g,'\\u003c')}}/>
    <div className="docs">
      <nav aria-label="On this page"><strong>ON THIS PAGE</strong>{SECTIONS.map(([id,label])=><a key={id} href={'#'+id}>{label}</a>)}</nav>
      <article>
        <section id="install"><h2>Install</h2>
          <p>Get the installer for your system from the <Link href="/download">download page</Link>. Veyra is free, and installs in under a minute.</p>
          <h3>Windows 10 and 11</h3>
          <p>Run the <code>.exe</code> installer (or the <code>.msi</code> for managed installs). Preview builds aren&apos;t signed by Microsoft yet, so SmartScreen may say <em>&quot;Windows protected your PC&quot;</em>: choose <strong>More info → Run anyway</strong>.</p>
          <h3>macOS 11 or newer</h3>
          <p>Choose the <code>.dmg</code> for <strong>Apple silicon</strong> (M1 and later) or <strong>Intel</strong>, then drag <strong>Veyra Studio</strong> into Applications. The first time, <strong>right-click → Open</strong>, or allow it in <strong>System Settings → Privacy &amp; Security → Open Anyway</strong>.</p>
          <Note warn>If macOS says the app &quot;is damaged and can&apos;t be opened&quot;, run this once in Terminal, then open it again: <code>xattr -cr &quot;/Applications/Veyra Studio.app&quot;</code></Note>
          <h3>Linux</h3>
          <p>Use the <code>.AppImage</code> on any 64-bit distribution (<code>chmod +x</code> it, then run it), or install the <code>.deb</code> (Debian, Ubuntu) or <code>.rpm</code> (Fedora, openSUSE) package. Veyra needs WebKitGTK 4.1 and glibc 2.35 or newer.</p>
        </section>

        <section id="first-project"><h2>Your first project</h2>
          <ol>
            <li>Start Veyra and choose <strong>Open a project</strong>, or press <kbd>Ctrl</kbd>+<kbd>O</kbd> (<kbd>⌘O</kbd> on macOS).</li>
            <li>Pick any folder. The explorer shows its files, with Git status badges if it&apos;s a repository.</li>
            <li>Click a file to open it in a tab. Press <kbd>Ctrl</kbd>+<kbd>P</kbd> to jump to any file by typing part of its name.</li>
            <li>Edits are kept safely until you save with <kbd>Ctrl</kbd>+<kbd>S</kbd>. Turn on <strong>Auto save</strong> or <strong>Format on save</strong> in Settings.</li>
          </ol>
          <Note>Right-click a tab for Close Others, Close to the Right, Copy Path and Reveal in Explorer. Middle-click closes a tab, and you can drag tabs to reorder them.</Note>
        </section>

        <section id="shortcuts"><h2>Keyboard shortcuts</h2>
          <p>The shortcuts most people use every day. Every command, with its shortcut, is in the command palette and in <strong>Settings → Keyboard shortcuts</strong>.</p>
          <div className="table-wrap"><table>
            <thead><tr><th>Action</th><th>Windows / Linux</th><th>macOS</th></tr></thead>
            <tbody>{SHORTCUTS.map(([action,win,mac])=><tr key={action}><td>{action}</td><td><code>{win}</code></td><td><code>{mac}</code></td></tr>)}</tbody>
          </table></div>
        </section>

        <section id="language-tools"><h2>Language tools (TypeScript, ESLint, Prettier…)</h2>
          <p>Every language gets syntax highlighting, snippets and completions. For full IntelliSense in web projects, install language tools from <strong>Extensions → Discover → Web development</strong>:</p>
          <ul>
            <li><strong>TypeScript &amp; JavaScript (Node.js):</strong> real errors, auto-imports, hover docs, go to definition, rename across files and quick fixes, using your <code>tsconfig.json</code> and <code>node_modules</code> types.</li>
            <li><strong>ESLint:</strong> your project&apos;s lint rules as you type, with quick fixes.</li>
            <li><strong>Prettier:</strong> <em>Format Document</em> (<kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>F</kbd>) or format on save, with your project&apos;s Prettier version and config.</li>
            <li><strong>Tailwind CSS</strong>, <strong>Emmet</strong>, <strong>Svelte</strong> and <strong>Vue</strong>.</li>
          </ul>
          <Note>Language tools need <strong>Node.js 18 or newer</strong> (<a href="https://nodejs.org">nodejs.org</a>). They&apos;re stored in Veyra&apos;s own app folder, never in your project, and start automatically when you open a matching file. See <Link href="/extensions">all language tools</Link>.</Note>
        </section>

        <section id="ai"><h2>Set up AI</h2>
          <p>AI is optional. Open the assistant with <kbd>Ctrl</kbd>+<kbd>L</kbd> and pick a provider.</p>
          <h3>Private and free: Ollama</h3>
          <ol>
            <li>Install Ollama from <a href="https://ollama.com">ollama.com</a>.</li>
            <li>Download a coding model, for example: <code>ollama pull qwen2.5-coder</code></li>
            <li>In Veyra&apos;s AI panel, choose <strong>Ollama · local</strong>. Nothing leaves your computer.</li>
          </ol>
          <h3>Cloud models: Claude, OpenAI, Gemini and more</h3>
          <p>Choose the provider in the AI panel and paste your API key. Keys are stored in your operating system&apos;s keychain. The provider bills you directly; Veyra adds nothing.</p>
          <h3>What you can do</h3>
          <ul>
            <li><strong>Ask</strong> about your code. Veyra shows exactly which files are included.</li>
            <li><strong>Edit with AI</strong> (<kbd>Ctrl</kbd>+<kbd>K</kbd>): describe a change and review it as a diff before it&apos;s applied.</li>
            <li><strong>Inline completions:</strong> ghost-text suggestions as you type. Press <kbd>Tab</kbd> to accept. Turn them off in Settings.</li>
          </ul>
        </section>

        <section id="git"><h2>Git</h2>
          <p>Open <strong>Source control</strong> (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd>) to stage files, write a message and commit with <kbd>Ctrl</kbd>+<kbd>Enter</kbd>. You can amend, switch and create branches, stash, pull and push, and view history. Changed lines are marked in the editor gutter, and files show status badges in the explorer.</p>
          <Note>Veyra uses the Git installed on your computer. If Git isn&apos;t found, install it from <a href="https://git-scm.com">git-scm.com</a> and restart Veyra.</Note>
        </section>

        <section id="extensions"><h2>Extensions &amp; themes</h2>
          <p>In <strong>Extensions</strong>, search the Open VSX marketplace. Themes and snippets install directly. Popular VS Code web extensions such as ESLint, Prettier, Tailwind CSS, Volar and Svelte are marked <strong>Built into Veyra</strong> and install Veyra&apos;s equivalent. You can also <strong>Install from VSIX</strong>.</p>
          <p>Extensions that run their own code need a VS Code extension host, which is on the <Link href="/roadmap">roadmap</Link>.</p>
        </section>

        <section id="updates"><h2>Updates</h2>
          <p>Veyra checks for new versions automatically and shows a banner when one is ready. Updates are signed and verified before they install, and never interrupt unsaved work. You can also run <strong>Check for updates</strong> from the command palette. See what changed in the <Link href="/changelog">changelog</Link>.</p>
        </section>

        <section id="troubleshooting"><h2>Troubleshooting</h2>
          <h3>A language tool says &quot;Failed to start&quot;</h3>
          <p>Check that <code>node --version</code> prints 18 or newer in a terminal, then click <strong>Restart</strong> on the tool in Extensions. The card shows the server&apos;s last error message.</p>
          <h3>No IntelliSense in a TypeScript project</h3>
          <p>Make sure the TypeScript &amp; JavaScript tool is installed and enabled, and run <code>npm install</code> in your project so type definitions exist in <code>node_modules</code>.</p>
          <h3>Something feels slow or broken</h3>
          <p>Open the <strong>Health monitor</strong> from the command palette. It checks responsiveness, memory, errors, Git and your toolchain, and suggests a fix for each warning.</p>
          <h3>Still stuck?</h3>
          <p><a href={GITHUB_URL+'/issues'}>Open an issue on GitHub</a> with your operating system, Veyra version (shown in the update banner and on the release you downloaded) and what you expected to happen.</p>
        </section>

        <section id="source"><h2>Build from source</h2>
          <p>Veyra is open source under the MIT license. You need Node.js 18+ and Rust.</p>
          <pre><code>git clone {GITHUB_URL}.git{'\n'}cd veyraeditor{'\n'}npm install{'\n'}npm run tauri dev</code></pre>
          <p>Pull requests are welcome. See the repository&apos;s README for the project layout and tests.</p>
        </section>
      </article>
    </div>
    <div style={{marginTop:60}}><ClosingCTA title="Ready when you are." /></div>
  </ContentPage>;
}
