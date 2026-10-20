import type { ServerDef } from "./model";
// Popular MCP servers, ready to add. Every package was checked on npm or PyPI, and every remote address answered
// as an MCP endpoint or is listed in its maker's documentation, when this list was written (October 2026).

export interface CatalogField {
  key: string; label: string; help?: string; placeholder?: string;
  /** Where the value goes: an environment variable, an argument, or an HTTP header. */
  target: "env" | "arg" | "header";
  /** For headers: text placed before the value, such as "Bearer ". */
  prefix?: string;
  secret?: boolean; required?: boolean;
  /** Fill in the first open folder. */
  defaultWorkspace?: boolean;
}
export interface CatalogEntry {
  id: string; name: string; maker: string; description: string;
  category: "Files & data" | "Web & browser" | "Developer tools" | "Productivity" | "Docs & knowledge" | "Testing";
  runtime: "Node.js" | "Python (uv)" | "Remote";
  /** How sign-in works for remote servers. */
  auth?: "none" | "oauth" | "oauth-or-token";
  def: Omit<ServerDef, "name">;
  fields?: CatalogField[];
  homepage: string;
}

export const CATALOG: CatalogEntry[] = [
  {
    id: "filesystem", name: "Filesystem", maker: "MCP reference servers", category: "Files & data", runtime: "Node.js",
    description: "Read, write, search and move files, limited to the folders you allow.",
    def: { transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem"] },
    fields: [{ key: "folder", label: "Allowed folder", target: "arg", required: true, defaultWorkspace: true, help: "The server can only see files inside this folder." }],
    homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
  },
  {
    id: "memory", name: "Memory", maker: "MCP reference servers", category: "Files & data", runtime: "Node.js",
    description: "A knowledge graph the AI can store facts in and recall later.",
    def: { transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"] },
    homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/memory",
  },
  {
    id: "git", name: "Git", maker: "MCP reference servers", category: "Developer tools", runtime: "Python (uv)",
    description: "Read and search a Git repository: status, diffs, logs and branches.",
    def: { transport: "stdio", command: "uvx", args: ["mcp-server-git", "--repository"] },
    fields: [{ key: "repository", label: "Repository folder", target: "arg", required: true, defaultWorkspace: true }],
    homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/git",
  },
  {
    id: "fetch", name: "Fetch", maker: "MCP reference servers", category: "Web & browser", runtime: "Python (uv)",
    description: "Fetch a web page and turn it into clean text for the AI to read.",
    def: { transport: "stdio", command: "uvx", args: ["mcp-server-fetch"] },
    homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/fetch",
  },
  {
    id: "time", name: "Time", maker: "MCP reference servers", category: "Productivity", runtime: "Python (uv)",
    description: "The current time and time-zone conversions.",
    def: { transport: "stdio", command: "uvx", args: ["mcp-server-time"] },
    homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/time",
  },
  {
    id: "sequential-thinking", name: "Sequential Thinking", maker: "MCP reference servers", category: "Productivity", runtime: "Node.js",
    description: "Helps the AI work through hard problems step by step, revising as it goes.",
    def: { transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-sequential-thinking"] },
    homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking",
  },
  {
    id: "playwright", name: "Playwright", maker: "Microsoft", category: "Web & browser", runtime: "Node.js",
    description: "Let the AI open pages, click, type and test websites in a real browser.",
    def: { transport: "stdio", command: "npx", args: ["-y", "@playwright/mcp@latest"] },
    homepage: "https://github.com/microsoft/playwright-mcp",
  },
  {
    id: "chrome-devtools", name: "Chrome DevTools", maker: "Google", category: "Web & browser", runtime: "Node.js",
    description: "Inspect pages in Chrome: console, network requests and performance traces.",
    def: { transport: "stdio", command: "npx", args: ["-y", "chrome-devtools-mcp@latest"] },
    homepage: "https://github.com/ChromeDevTools/chrome-devtools-mcp",
  },
  {
    id: "context7", name: "Context7", maker: "Upstash", category: "Docs & knowledge", runtime: "Node.js",
    description: "Up-to-date documentation and code examples for thousands of libraries.",
    def: { transport: "stdio", command: "npx", args: ["-y", "@upstash/context7-mcp"] },
    homepage: "https://github.com/upstash/context7",
  },
  {
    id: "brave-search", name: "Brave Search", maker: "Brave", category: "Web & browser", runtime: "Node.js",
    description: "Search the web, news, images and videos with the Brave Search API.",
    def: { transport: "stdio", command: "npx", args: ["-y", "@brave/brave-search-mcp-server"] },
    fields: [{ key: "BRAVE_API_KEY", label: "Brave Search API key", target: "env", secret: true, required: true, help: "Free key at https://brave.com/search/api/" }],
    homepage: "https://github.com/brave/brave-search-mcp-server",
  },
  {
    id: "firecrawl", name: "Firecrawl", maker: "Firecrawl", category: "Web & browser", runtime: "Node.js",
    description: "Crawl and scrape websites into clean Markdown, with search and extraction.",
    def: { transport: "stdio", command: "npx", args: ["-y", "firecrawl-mcp"] },
    fields: [{ key: "FIRECRAWL_API_KEY", label: "Firecrawl API key", target: "env", secret: true, required: true, help: "From https://firecrawl.dev" }],
    homepage: "https://github.com/firecrawl/firecrawl-mcp-server",
  },
  {
    id: "everything", name: "Everything (test server)", maker: "MCP reference servers", category: "Testing", runtime: "Node.js",
    description: "A test server with sample tools, resources and prompts. Good for trying the Inspector.",
    def: { transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-everything"] },
    homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/everything",
  },
  {
    id: "github", name: "GitHub", maker: "GitHub", category: "Developer tools", runtime: "Remote", auth: "oauth-or-token",
    description: "Issues, pull requests, code search and repositories, from GitHub's hosted server.",
    def: { transport: "http", url: "https://api.githubcopilot.com/mcp/" },
    fields: [{ key: "Authorization", label: "Personal access token (optional)", target: "header", prefix: "Bearer ", secret: true, help: "Leave empty to sign in with your browser in apps that support it." }],
    homepage: "https://github.com/github/github-mcp-server",
  },
  {
    id: "microsoft-learn", name: "Microsoft Learn", maker: "Microsoft", category: "Docs & knowledge", runtime: "Remote", auth: "none",
    description: "Search and read official Microsoft and Azure documentation. No sign-in.",
    def: { transport: "http", url: "https://learn.microsoft.com/api/mcp" },
    homepage: "https://github.com/MicrosoftDocs/mcp",
  },
  {
    id: "deepwiki", name: "DeepWiki", maker: "Cognition", category: "Docs & knowledge", runtime: "Remote", auth: "none",
    description: "Ask questions about any public GitHub repository. No sign-in.",
    def: { transport: "http", url: "https://mcp.deepwiki.com/mcp" },
    homepage: "https://docs.devin.ai/work-with-devin/deepwiki-mcp",
  },
  {
    id: "notion", name: "Notion", maker: "Notion", category: "Productivity", runtime: "Remote", auth: "oauth",
    description: "Search, read and update your Notion pages and databases.",
    def: { transport: "http", url: "https://mcp.notion.com/mcp" },
    homepage: "https://developers.notion.com/docs/mcp",
  },
  {
    id: "linear", name: "Linear", maker: "Linear", category: "Productivity", runtime: "Remote", auth: "oauth",
    description: "Find, create and update Linear issues and projects.",
    def: { transport: "http", url: "https://mcp.linear.app/mcp" },
    homepage: "https://linear.app/docs/mcp",
  },
  {
    id: "sentry", name: "Sentry", maker: "Sentry", category: "Developer tools", runtime: "Remote", auth: "oauth",
    description: "Look up errors, issues and stack traces from Sentry.",
    def: { transport: "http", url: "https://mcp.sentry.dev/mcp" },
    homepage: "https://docs.sentry.io/product/sentry-mcp/",
  },
  {
    id: "supabase", name: "Supabase", maker: "Supabase", category: "Files & data", runtime: "Remote", auth: "oauth",
    description: "Manage Supabase projects: tables, SQL queries, logs and edge functions.",
    def: { transport: "http", url: "https://mcp.supabase.com/mcp" },
    homepage: "https://supabase.com/docs/guides/getting-started/mcp",
  },
  {
    id: "stripe", name: "Stripe", maker: "Stripe", category: "Developer tools", runtime: "Remote", auth: "oauth",
    description: "Work with Stripe customers, payments, products and docs.",
    def: { transport: "http", url: "https://mcp.stripe.com" },
    homepage: "https://docs.stripe.com/mcp",
  },
];

/** The server a catalog entry makes, with the user's answers filled in. */
export function fromCatalog(entry: CatalogEntry, name: string, answers: Record<string, string>): ServerDef {
  const def: ServerDef = { name, ...structuredClone(entry.def) };
  for (const field of entry.fields ?? []) {
    const value = (answers[field.key] ?? "").trim();
    if (!value) continue;
    if (field.target === "arg") def.args = [...(def.args ?? []), value];
    else if (field.target === "env") def.env = { ...(def.env ?? {}), [field.key]: value };
    else def.headers = { ...(def.headers ?? {}), [field.key]: `${field.prefix ?? ""}${value}` };
  }
  return def;
}
/** A field that must be answered before adding, or null. */
export function missingField(entry: CatalogEntry, answers: Record<string, string>): CatalogField | null {
  return (entry.fields ?? []).find(f => f.required && !(answers[f.key] ?? "").trim()) ?? null;
}
