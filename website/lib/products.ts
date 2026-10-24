/** Everything Veyra makes, in one place: the Products menu (desktop and mobile) and the footer read from here. */
export interface Product { href: string; icon: string; name: string; copy: string; tag?: string }

export const APPS: Product[] = [
  { href: '/download', icon: '/veyra-96.png', name: 'Veyra Studio', copy: 'The fast, free AI code editor' },
  { href: '/pdf', icon: '/veyra-96.png', name: 'Veyra PDF', copy: 'Edit, sign and merge PDFs offline', tag: 'New' },
  { href: '/salesforce-studio', icon: '/salesforce-studio-icon.png', name: 'Salesforce Studio', copy: 'LWC, Apex and Aura in your browser' },
];

/** The VS Code extensions, grouped by what they help with. A new extension is one line in the right group. */
export const EXTENSION_GROUPS: { group: string; items: Product[] }[] = [
  { group: 'Write code', items: [
    { href: '/error-lens', icon: '/error-lens-icon.png', name: 'Error Lens', copy: 'Problems shown right on the line' },
    { href: '/path-intellisense', icon: '/path-intellisense-icon.png', name: 'Path IntelliSense', copy: 'File paths, completed as you type' },
    { href: '/npm-intellisense', icon: '/npm-intellisense-icon.png', name: 'npm IntelliSense', copy: 'Autocomplete and check npm imports' },
    { href: '/auto-rename-tag', icon: '/auto-rename-tag-icon.png', name: 'Auto Rename Tag', copy: 'Rename a tag, its pair follows' },
    { href: '/todo-tree', icon: '/todo-tree-icon.png', name: 'Todo Tree', copy: 'Every TODO in one tree' },
  ] },
  { group: 'Run and test', items: [
    { href: '/live-server', icon: '/live-server-icon-296.png', name: 'Live Server', copy: 'Live reload as you save' },
    { href: '/api-client', icon: '/api-client-icon.png', name: 'API Client', copy: 'Test any API without leaving VS Code' },
    { href: '/port-manager', icon: '/port-manager-icon.png', name: 'Port Manager', copy: 'Free a busy port in one click' },
    { href: '/docker', icon: '/docker-icon.png', name: 'Container Studio', copy: 'Docker containers, Compose and logs' },
    { href: '/mongodb', icon: '/mongodb-icon.png', name: 'Query Lens', copy: 'Slow MongoDB queries and the index that fixes them' },
  ] },
  { group: 'Project', items: [
    { href: '/git-graph', icon: '/git-graph-icon.png', name: 'Git Graph', copy: 'Your repository as a graph' },
    { href: '/env', icon: '/env-icon.png', name: 'Env', copy: '.env checks, hidden secrets, in sync' },
    { href: '/mcp-studio', icon: '/mcp-studio-icon.png', name: 'MCP Studio', copy: 'Manage and test MCP servers' },
    { href: '/document-viewer', icon: '/document-viewer-icon.png', name: 'Document Viewer', copy: 'Open Word, PowerPoint and Excel files' },
  ] },
  { group: 'Just for fun', items: [
    { href: '/pets', icon: '/pets-icon.png', name: 'Pets', copy: 'Cute pets that cheer you on' },
  ] },
];

export const EXTENSIONS: Product[] = EXTENSION_GROUPS.flatMap(g => g.items);
export const PRODUCT_PATHS = [...APPS, ...EXTENSIONS].map(p => p.href);
