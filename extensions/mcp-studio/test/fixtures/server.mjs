// A small real MCP server for the tests, built with the official SDK.
// node server.mjs            → stdio server
// node server.mjs --crash    → prints an error and exits, like a server missing its API key
// node server.mjs --http P   → Streamable HTTP server on port P (stateless)
import http from "node:http";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

if (process.argv.includes("--crash")) {
  console.error("Error: TEST_API_KEY is not set. Add it to the server's environment.");
  process.exit(1);
}

function build() {
  const server = new McpServer({ name: "veyra-test-server", version: "1.2.3" }, { instructions: "A test server." });
  server.registerTool("add", { description: "Add two numbers", inputSchema: { a: z.number(), b: z.number() } },
    async ({ a, b }) => ({ content: [{ type: "text", text: String(a + b) }] }));
  server.registerTool("greet", { description: "Greet someone", inputSchema: { name: z.string(), loud: z.boolean().optional(), style: z.enum(["formal", "casual"]).optional() } },
    async ({ name, loud, style }) => ({ content: [{ type: "text", text: `${style === "formal" ? "Good day" : "Hi"}, ${name}${loud ? "!" : "."} env=${process.env.TEST_VALUE ?? "none"}` }] }));
  server.registerTool("broken", { description: "Always fails" }, async () => { throw new Error("Something went wrong inside the tool"); });
  server.registerResource("readme", "note://readme", { description: "A note", mimeType: "text/plain" },
    async uri => ({ contents: [{ uri: uri.href, text: "Hello from a resource" }] }));
  server.registerResource("user", new ResourceTemplate("user://{id}", { list: undefined }), { description: "A user by id" },
    async (uri, { id }) => ({ contents: [{ uri: uri.href, text: `User ${id}` }] }));
  server.registerPrompt("review", { description: "Review code", argsSchema: { language: z.string() } },
    ({ language }) => ({ messages: [{ role: "user", content: { type: "text", text: `Review this ${language} code.` } }] }));
  return server;
}

const at = process.argv.indexOf("--http");
if (at > 0) {
  const port = Number(process.argv[at + 1]);
  http.createServer(async (req, res) => {
    if (req.url !== "/mcp") { res.writeHead(404).end(); return; }
    if (req.method !== "POST") { res.writeHead(405).end(); return; }
    let body = "";
    for await (const chunk of req) body += chunk;
    const server = build();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, JSON.parse(body));
  }).listen(port, "127.0.0.1", () => console.log("ready"));
} else {
  await build().connect(new StdioServerTransport());
}
