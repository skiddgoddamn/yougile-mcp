#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ToolDef, Handler } from "./types.js";
import { text } from "./types.js";
import { initAuth, currentApiKey, AuthError, authRequiredPayload, AUTH_TOOLS, authHandlers } from "./auth.js";
import { structureTools, structureHandlers } from "./tools/structure.js";
import { tasksTools, tasksHandlers } from "./tools/tasks.js";
import { chatTools, chatHandlers } from "./tools/chat.js";
import { log } from "./log.js";

const READONLY = (process.env.YG_READONLY || "").toLowerCase() === "true";
const CONFIRM = (process.env.YG_CONFIRM || "").toLowerCase() === "true";

initAuth();

const MUTATING_TOKENS = ["_create", "_update", "_comment"];
const AUTH_TOOL_NAMES = new Set(AUTH_TOOLS.map((t) => t.name));

export function isMutating(name: string): boolean {
  if (AUTH_TOOL_NAMES.has(name)) return false;
  return MUTATING_TOKENS.some((t) => name.includes(t));
}

export const ALL_TOOLS: ToolDef[] = [...AUTH_TOOLS];
export const HANDLERS: Record<string, Handler> = { ...authHandlers };
function registerTools(defs: ToolDef[], handlers: Record<string, Handler>): void {
  ALL_TOOLS.push(...defs); Object.assign(HANDLERS, handlers);
}
registerTools(structureTools, structureHandlers);
registerTools(tasksTools, tasksHandlers);
registerTools(chatTools, chatHandlers);

function deny(reason: string): CallToolResult { log.warning(`DENIED: ${reason}`); return text({ denied: true, reason }); }

export async function dispatch(name: string, rawArgs: Record<string, unknown>): Promise<CallToolResult> {
  const args = { ...rawArgs };
  const confirm = args.confirm === true; delete args.confirm;

  if (AUTH_TOOL_NAMES.has(name)) return authHandlers[name](args, { apiKey: "" });

  const mutating = isMutating(name);
  if (mutating && READONLY) return deny(`Tool '${name}' is blocked: server runs in READ-ONLY mode (YG_READONLY=true).`);
  if (mutating && CONFIRM && !confirm)
    return text({ confirm_required: true, tool: name, arguments: args, note: "Mutating operation and YG_CONFIRM is enabled. Re-call with confirm=true to execute." });

  const handler = HANDLERS[name];
  if (!handler) return text({ error: `Unknown tool: ${name}` });
  if (!currentApiKey()) return text(authRequiredPayload("No YouGile API key configured"));

  try {
    return await handler(args, { apiKey: currentApiKey() });
  } catch (e) {
    if (e instanceof AuthError) return text(authRequiredPayload(e.message));
    log.error(`Tool ${name} failed: ${e instanceof Error ? e.stack || e.message : String(e)}`);
    return { content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }] };
  }
}

function augment(tool: ToolDef): ToolDef {
  const schema = JSON.parse(JSON.stringify(tool.inputSchema ?? { type: "object", properties: {} }));
  schema.properties ??= {};
  if (CONFIRM && isMutating(tool.name)) schema.properties.confirm ??= { type: "boolean", description: "Must be true to execute this mutating call (YG_CONFIRM is enabled)." };
  return { ...tool, inputSchema: schema };
}

async function main(): Promise<void> {
  const server = new Server({ name: "yougile", version: "1.0.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: ALL_TOOLS.map(augment) }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => dispatch(req.params.name, (req.params.arguments ?? {}) as Record<string, unknown>));
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info("yougile-mcp server started (stdio).");
}

// Only start the server when run directly, not when imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { log.error(String(e)); process.exit(1); });
}
