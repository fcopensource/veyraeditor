import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { ServerDef } from "./model";
// Connecting to an MCP server with the official SDK, recording every message, and listing and calling what it offers.

export interface LogEntry { at: number; kind: "sent" | "received" | "stderr" | "info" | "error"; text: string }
export interface ServerInfo { name?: string; version?: string; protocolVersion?: string; instructions?: string; capabilities: Record<string, unknown> }

export class Session {
  readonly log: LogEntry[] = [];
  stderr = "";
  info: ServerInfo = { capabilities: {} };
  onLog?: (entry: LogEntry) => void;
  private client?: Client;
  private closed = false;

  private constructor(readonly def: ServerDef) {}

  private record(kind: LogEntry["kind"], text: string) {
    const entry = { at: Date.now(), kind, text };
    this.log.push(entry);
    if (this.log.length > 2000) this.log.splice(0, this.log.length - 2000);
    this.onLog?.(entry);
  }

  /** Start or reach the server and complete the MCP handshake. Throws with the server's own output on failure. */
  static async open(def: ServerDef, options: { cwd?: string; timeoutMs?: number; onLog?: (entry: LogEntry) => void } = {}): Promise<Session> {
    const session = new Session(def);
    session.onLog = options.onLog;
    const transport = session.transport(options.cwd);
    session.watch(transport);
    const client = new Client({ name: "Veyra MCP Studio", version: "1.0.0" }, { capabilities: {} });
    session.client = client;
    session.record("info", def.transport === "stdio" ? `Starting: ${[def.command, ...(def.args ?? [])].join(" ")}` : `Connecting to ${def.url} (${def.transport === "sse" ? "SSE" : "Streamable HTTP"})`);
    try {
      await client.connect(transport, { timeout: options.timeoutMs ?? 60000 });
    } catch (error) {
      session.record("error", String((error as Error)?.message ?? error));
      await session.close().catch(() => {});
      throw Object.assign(error instanceof Error ? error : new Error(String(error)), { stderr: session.stderr });
    }
    const version = client.getServerVersion();
    session.info = { ...session.info, name: version?.name, version: version?.version, instructions: client.getInstructions(), capabilities: (client.getServerCapabilities() ?? {}) as Record<string, unknown> };
    session.record("info", `Connected to ${version?.name ?? "the server"}${version?.version ? ` ${version.version}` : ""}${session.info.protocolVersion ? ` · protocol ${session.info.protocolVersion}` : ""}`);
    return session;
  }

  private transport(cwd?: string): Transport {
    const def = this.def;
    if (def.transport === "stdio") {
      const transport = new StdioClientTransport({
        command: def.command!, args: def.args ?? [], cwd: def.cwd || cwd,
        // The same base environment the SDK gives every server, plus the server's own variables.
        env: { ...getDefaultEnvironment(), ...(def.env ?? {}) },
        stderr: "pipe",
      });
      transport.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        this.stderr = (this.stderr + text).slice(-20000);
        for (const line of text.split(/\r?\n/)) if (line.trim()) this.record("stderr", line);
      });
      return transport;
    }
    const url = new URL(def.url!);
    const headers = def.headers ?? {};
    if (def.transport === "sse") {
      return new SSEClientTransport(url, {
        requestInit: { headers },
        eventSourceInit: { fetch: (input, init) => fetch(input, { ...init, headers: { ...(init?.headers as Record<string, string>), ...headers } }) },
      });
    }
    return new StreamableHTTPClientTransport(url, { requestInit: { headers } });
  }

  /** Record every message in both directions, including the handshake. */
  private watch(transport: Transport) {
    const send = transport.send.bind(transport);
    transport.send = async (message, opts) => { this.record("sent", JSON.stringify(message)); return send(message, opts); };
    let handler: Transport["onmessage"];
    Object.defineProperty(transport, "onmessage", {
      configurable: true,
      get: () => handler,
      set: (fn: Transport["onmessage"]) => {
        handler = fn && ((message, extra) => {
          this.record("received", JSON.stringify(message));
          const result = (message as any)?.result;
          if (result?.protocolVersion && result?.serverInfo) this.info.protocolVersion = result.protocolVersion;
          fn(message, extra);
        });
      },
    });
  }

  private get c() { if (!this.client || this.closed) throw new Error("The server is not connected."); return this.client; }
  get has() {
    const caps = this.info.capabilities;
    return { tools: !!caps.tools, resources: !!caps.resources, prompts: !!caps.prompts };
  }

  /** Every page of a list, following the cursor. */
  private async all<T>(fetchPage: (cursor?: string) => Promise<{ nextCursor?: string } & Record<string, unknown>>, key: string): Promise<T[]> {
    const items: T[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 50; page++) {
      const result = await fetchPage(cursor);
      items.push(...((result[key] as T[]) ?? []));
      cursor = result.nextCursor;
      if (!cursor) break;
    }
    return items;
  }
  tools() { return this.has.tools ? this.all<any>(cursor => this.c.listTools(cursor ? { cursor } : undefined), "tools") : Promise.resolve([]); }
  resources() { return this.has.resources ? this.all<any>(cursor => this.c.listResources(cursor ? { cursor } : undefined), "resources") : Promise.resolve([]); }
  async resourceTemplates() {
    if (!this.has.resources) return [];
    try { return await this.all<any>(cursor => this.c.listResourceTemplates(cursor ? { cursor } : undefined), "resourceTemplates"); } catch { return []; }
  }
  prompts() { return this.has.prompts ? this.all<any>(cursor => this.c.listPrompts(cursor ? { cursor } : undefined), "prompts") : Promise.resolve([]); }

  callTool(name: string, args: Record<string, unknown>, timeoutMs = 120000) { return this.c.callTool({ name, arguments: args }, undefined, { timeout: timeoutMs }); }
  readResource(uri: string) { return this.c.readResource({ uri }); }
  getPrompt(name: string, args: Record<string, string>) { return this.c.getPrompt({ name, arguments: args }); }
  ping() { return this.c.ping(); }

  async close() {
    if (this.closed) return;
    this.closed = true;
    await this.client?.close().catch(() => {});
    this.record("info", "Disconnected");
  }
}

// ---------- Tool forms ----------

export interface FormField { name: string; type: "string" | "number" | "integer" | "boolean" | "enum" | "json"; required: boolean; description?: string; options?: string[]; default?: unknown }
/** Form fields for a tool's input schema. Anything that is not a simple value is edited as JSON. */
export function formFields(schema: any): FormField[] {
  const props = schema?.properties && typeof schema.properties === "object" ? schema.properties : {};
  const required = new Set<string>(Array.isArray(schema?.required) ? schema.required : []);
  return Object.entries<any>(props).map(([name, p]) => {
    const type = Array.isArray(p?.type) ? p.type.find((t: string) => t !== "null") : p?.type;
    const base = { name, required: required.has(name), description: p?.description, default: p?.default };
    if (Array.isArray(p?.enum) && p.enum.every((v: unknown) => typeof v === "string")) return { ...base, type: "enum" as const, options: p.enum };
    if (type === "string" || type === "number" || type === "integer" || type === "boolean") return { ...base, type };
    return { ...base, type: "json" as const };
  });
}
/** The arguments for a tool call from form values, checked and converted. */
export function argumentsFrom(fields: FormField[], values: Record<string, string | boolean>): { args: Record<string, unknown>; error?: string } {
  const args: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = values[f.name];
    if (f.type === "boolean") { if (raw !== undefined && raw !== "") args[f.name] = raw === true || raw === "true"; else if (f.required) args[f.name] = false; continue; }
    const text = typeof raw === "string" ? raw : "";
    if (!text.trim()) { if (f.required) return { args, error: `Fill in "${f.name}".` }; continue; }
    if (f.type === "number" || f.type === "integer") {
      const n = Number(text);
      if (!Number.isFinite(n) || (f.type === "integer" && !Number.isInteger(n))) return { args, error: `"${f.name}" must be ${f.type === "integer" ? "a whole number" : "a number"}.` };
      args[f.name] = n;
    } else if (f.type === "json") {
      try { args[f.name] = JSON.parse(text); } catch { return { args, error: `"${f.name}" must be valid JSON, like [1, 2] or {"a": 1}.` }; }
    } else args[f.name] = text;
  }
  return { args };
}
