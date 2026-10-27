/**
 * Everything Veyra makes, in one place. The Products menu, the footer, the Extensions page, the sitemap,
 * the home page and the "More for VS Code" links on every extension page are all built from this list.
 * A new extension is one entry here.
 */
export interface Product {
  href: string;
  icon: string;
  /** Short name for menus. */
  name: string;
  /** Full name for cards and headings. */
  title: string;
  /** One line for menus and tooltips. */
  copy: string;
  /** A few sentences for cards. */
  summary: string;
  /** What the card's link says. */
  cta: string;
  /** The card's colour accent (a class in extensions.css). */
  tone: string;
  group: Group;
  /** Release order: higher is newer. */
  order: number;
  /** When its page was last changed, for the sitemap. */
  updated?: string;
  /** Where it runs, shown above the card's title. */
  platform?: string;
  tag?: string;
}
export type Group = 'Write code' | 'Run and test' | 'Project' | 'Just for fun' | 'Apps and AI';

export const APPS: Pick<Product, 'href' | 'icon' | 'name' | 'copy' | 'tag'>[] = [
  { href: '/download', icon: '/veyra-96.png', name: 'Veyra Studio', copy: 'The fast, free AI code editor' },
  { href: '/pdf', icon: '/veyra-96.png', name: 'Veyra PDF', copy: 'Edit, sign and merge PDFs offline', tag: 'New' },
  { href: '/salesforce-studio', icon: '/salesforce-studio-icon.png', name: 'Salesforce Studio', copy: 'LWC, Apex and Aura in your browser' },
];

const vs = (p: Omit<Product, 'platform'> & { platform?: string }): Product => ({ platform: 'For VS Code', ...p });

/** The VS Code extensions, newest last. */
export const EXTENSIONS: Product[] = [
  vs({ href: '/live-server', icon: '/live-server-icon-296.png', name: 'Live Server', title: 'Veyra Live Server', group: 'Run and test', order: 1, tone: 'live', platform: 'Built into Veyra · also for VS Code',
    copy: 'Live reload as you save', cta: 'Explore Live Server',
    summary: 'Save. See it. Instantly. Go Live serves your folder and reloads the browser on save, with CSS applied without a reload.' }),
  vs({ href: '/port-manager', icon: '/port-manager-icon.png', name: 'Port Manager', title: 'Veyra Port Manager', group: 'Run and test', order: 2, tone: 'ports',
    copy: 'Free a busy port in one click', cta: 'Explore Port Manager',
    summary: 'Every port in use, and the app behind it. Open, copy or stop it in one click, and free a busy port in seconds. System services are never touched.' }),
  vs({ href: '/npm-intellisense', icon: '/npm-intellisense-icon.png', name: 'npm IntelliSense', title: 'Veyra npm IntelliSense', group: 'Write code', order: 3, tone: 'npm', updated: '2026-10-20',
    copy: 'Autocomplete and check npm imports', cta: 'Explore npm IntelliSense',
    summary: 'Every package, one keystroke away. Autocomplete imports with versions, catch missing packages and install them in one click, and find unused dependencies.' }),
  vs({ href: '/api-client', icon: '/api-client-icon.png', name: 'API Client', title: 'Veyra API Client', group: 'Run and test', order: 4, tone: 'api', updated: '2026-10-20',
    copy: 'Test any API without leaving VS Code', cta: 'Explore API Client',
    summary: 'Test any API without leaving VS Code. REST and GraphQL, collections saved in your repo, environments with private values, and cURL and Postman import. Free, no account.' }),
  vs({ href: '/mcp-studio', icon: '/mcp-studio-icon.png', name: 'MCP Studio', title: 'Veyra MCP Studio', group: 'Project', order: 5, tone: 'mcp', updated: '2026-10-20',
    copy: 'Manage and test MCP servers', cta: 'Explore MCP Studio',
    summary: 'Your MCP servers, all in one place. See the servers of VS Code, Claude, Cursor and Windsurf, add popular ones in two clicks, try every tool, and see why a server fails.' }),
  vs({ href: '/docker', icon: '/docker-icon.png', name: 'Container Studio', title: 'Veyra Container Studio for Docker', group: 'Run and test', order: 6, tone: 'docker', updated: '2026-10-20',
    copy: 'Docker containers, Compose and logs', cta: 'Explore Container Studio',
    summary: 'Docker in VS Code, made easy. Containers, images and Compose in one sidebar, live logs, CPU and memory, one-click cleanup, and Dockerfile checks with fixes.' }),
  vs({ href: '/env', icon: '/env-icon.png', name: 'Env', title: 'Veyra Env', group: 'Project', order: 7, tone: 'env', updated: '2026-10-22',
    copy: '.env checks, hidden secrets, in sync', cta: 'Explore Veyra Env',
    summary: 'Never ship a missing or leaked env variable again. Warnings for missing variables, autocomplete for process.env, secrets hidden on screen, a .gitignore guard and .env.example in sync.' }),
  vs({ href: '/mongodb', icon: '/mongodb-icon.png', name: 'Query Lens', title: 'Veyra Query Lens for MongoDB', group: 'Run and test', order: 8, tone: 'mongodb', updated: '2026-10-22',
    copy: 'Slow MongoDB queries and the index that fixes them', cta: 'Explore Query Lens',
    summary: 'See how every MongoDB query performs, right above your code. The index that fixes slow ones in one click, unused indexes, and Mongoose schemas checked against real data.' }),
  vs({ href: '/path-intellisense', icon: '/path-intellisense-icon.png', name: 'Path IntelliSense', title: 'Path IntelliSense Veyra', group: 'Write code', order: 9, tone: 'pathis', updated: '2026-10-23',
    copy: 'File paths, completed as you type', cta: 'Explore Path IntelliSense',
    summary: 'File paths, completed as you type: imports, src, href, CSS url() and Markdown. tsconfig aliases with no setup, the right import extension, and broken paths flagged with a fix.' }),
  vs({ href: '/document-viewer', icon: '/document-viewer-icon.png', name: 'Document Viewer', title: 'Veyra Document Viewer', group: 'Project', order: 10, tone: 'docs', updated: '2026-10-24',
    copy: 'Open Word, PowerPoint and Excel files', cta: 'Explore Document Viewer',
    summary: 'Open Word, PowerPoint and Excel files right in VS Code. Real pages, slides with a Present mode, sheets with their formats and formulas, and CSV as a sortable table.' }),
  vs({ href: '/git-graph', icon: '/git-graph-icon.png', name: 'Git Graph', title: 'Git Graph Veyra', group: 'Project', order: 11, tone: 'gitgraph', updated: '2026-10-24',
    copy: 'Your repository as a graph', cta: 'Explore Git Graph',
    summary: 'Your repository as a graph. Every branch, merge and tag, what each commit changed, and one-click checkout, cherry-pick and revert. Fast and private.' }),
  vs({ href: '/error-lens', icon: '/error-lens-icon.png', name: 'Error Lens', title: 'Error Lens Veyra', group: 'Write code', order: 12, tone: 'errorlens', updated: '2026-10-24',
    copy: 'Problems shown right on the line', cta: 'Explore Error Lens',
    summary: 'See every problem right where it is. Errors and warnings at the end of their lines, the line gently tinted, and the cursor’s problem in the status bar. Every language.' }),
  vs({ href: '/todo-tree', icon: '/todo-tree-icon.png', name: 'Todo Tree', title: 'Todo Tree Veyra', group: 'Write code', order: 13, tone: 'todotree', updated: '2026-10-24',
    copy: 'Every TODO in one tree', cta: 'Explore Todo Tree',
    summary: 'Every TODO in your project, in one tree. FIXME, BUG, HACK and NOTE too, coloured in your code, with owners, a filter and a Markdown checklist to copy.' }),
  vs({ href: '/auto-rename-tag', icon: '/auto-rename-tag-icon.png', name: 'Auto Rename Tag', title: 'Auto Rename Tag Veyra', group: 'Write code', order: 14, tone: 'renametag', updated: '2026-10-24',
    copy: 'Rename a tag, its pair follows', cta: 'Explore Auto Rename Tag',
    summary: 'Rename one tag and its pair follows, as you type. HTML, React, Vue, Svelte, Astro and XML, with nested tags, components and fragments handled.' }),
  vs({ href: '/pets', icon: '/pets-icon.png', name: 'Pets', title: 'Pets Veyra', group: 'Just for fun', order: 15, tone: 'pets', updated: '2026-10-24',
    copy: 'Cute pets that cheer you on', cta: 'Meet the pets',
    summary: 'A cat, dog, fox, bunny or panda that lives in VS Code. They play ball, nap, and cheer when you save and fix your errors. Drawn from scratch.' }),
  vs({ href: '/codesnap', icon: '/codesnap-icon.png', name: 'CodeSnap', title: 'CodeSnap Veyra', group: 'Project', order: 16, tone: 'codesnap', updated: '2026-10-25',
    copy: 'Your code as a beautiful image', cta: 'Explore CodeSnap',
    summary: 'Turn your code into a beautiful image in your theme’s colours. Gradients, window frames, highlighted lines and social media sizes. Copy it or save it as PNG.' }),
  vs({ href: '/code-guard', icon: '/code-guard-icon.png', name: 'Code Guard', title: 'Veyra Code Guard', group: 'Write code', order: 17, tone: 'codeguard', platform: 'For VS Code and GitHub', updated: '2026-10-28',
    copy: 'Find trojans and backdoors in code', cta: 'Explore Code Guard',
    summary: 'A security reviewer that checks every line for trojans, backdoors and supply-chain attacks, shows how to fix each one, grades your project A to F and writes a PDF security report. In VS Code, before every commit and on GitHub.' }),
];

/** Everything on the Extensions page's "Made by Veyra" list: the extensions, plus Veyra AI and Salesforce Studio. */
export const ORIGINALS: Product[] = [
  ...EXTENSIONS,
  { href: '/docs#ai', icon: '/veyra-ai.svg', name: 'Veyra AI', title: 'Veyra AI', group: 'Apps and AI', order: 0, tone: 'ai', platform: 'Built into Veyra',
    copy: 'Ask, explain and edit with AI', cta: 'Set up Veyra AI',
    summary: 'Ask about your code, explain it, or edit with AI and review every change as a diff. Sign in with a free account: 10 free requests, no API key.' },
  { href: '/salesforce-studio', icon: '/salesforce-studio-icon.png', name: 'Salesforce Studio', title: 'Salesforce Studio', group: 'Apps and AI', order: 0.5, tone: 'salesforce', platform: 'For Chrome, Edge & Firefox',
    copy: 'LWC, Apex and Aura in your browser', cta: 'Explore Salesforce Studio',
    summary: 'Your org’s code, open in seconds. Edit LWC, Aura, Apex and Visualforce from any Salesforce tab, and save to your org with Ctrl+S.' },
];

/** The newest few get a "New" badge, so badges move on by themselves as extensions are added. */
const NEWEST = new Set([...EXTENSIONS].sort((a, b) => b.order - a.order).slice(0, 5).map(p => p.href));
export const isNew = (p: Pick<Product, 'href'>) => NEWEST.has(p.href);

export const GROUPS: Group[] = ['Write code', 'Run and test', 'Project', 'Just for fun'];
/** The extensions grouped for the Products menu, in GROUPS order. */
export const EXTENSION_GROUPS = GROUPS.map(group => ({ group, items: EXTENSIONS.filter(p => p.group === group) })).filter(g => g.items.length);
export const PRODUCT_PATHS = [...APPS, ...EXTENSIONS].map(p => p.href);

/** A few other extensions to suggest on an extension's page: the same group first, then the newest. */
export function related(href: string, count = 4): Product[] {
  const self = EXTENSIONS.find(p => p.href === href);
  const others = EXTENSIONS.filter(p => p.href !== href);
  const sameGroup = others.filter(p => p.group === self?.group).sort((a, b) => b.order - a.order);
  const rest = others.filter(p => p.group !== self?.group).sort((a, b) => b.order - a.order);
  return [...sameGroup, ...rest].slice(0, count);
}
