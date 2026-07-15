import { yougileFetch } from "../api.js";
import { text } from "../types.js";
import type { ToolDef, Handler } from "../types.js";

const pageProps = {
  limit: { type: "integer", description: "Max items per page (YouGile caps ~50)." },
  offset: { type: "integer", description: "Items to skip (pagination)." },
};

export const structureTools: ToolDef[] = [
  { name: "yg_projects_list", description: "List projects. Filter by title; paginate with limit/offset.",
    inputSchema: { type: "object", properties: { title: { type: "string" }, includeDeleted: { type: "boolean" }, ...pageProps } } },
  { name: "yg_project_create", description: "Create a project.",
    inputSchema: { type: "object", properties: { title: { type: "string" }, users: { type: "object", description: "Map of userId -> role (e.g. {\"<id>\":\"admin\"})." } }, required: ["title"] } },
  { name: "yg_boards_list", description: "List boards. Filter by projectId/title.",
    inputSchema: { type: "object", properties: { projectId: { type: "string" }, title: { type: "string" }, includeDeleted: { type: "boolean" }, ...pageProps } } },
  { name: "yg_board_create", description: "Create a board inside a project.",
    inputSchema: { type: "object", properties: { title: { type: "string" }, projectId: { type: "string" } }, required: ["title", "projectId"] } },
  { name: "yg_columns_list", description: "List columns. Filter by boardId/title.",
    inputSchema: { type: "object", properties: { boardId: { type: "string" }, title: { type: "string" }, includeDeleted: { type: "boolean" }, ...pageProps } } },
  { name: "yg_column_create", description: "Create a column on a board.",
    inputSchema: { type: "object", properties: { title: { type: "string" }, boardId: { type: "string" }, color: { type: "integer", description: "Column color 1-16." } }, required: ["title", "boardId"] } },
  { name: "yg_employees_list", description: "List company employees/users. Filter by email or projectId. Use to resolve assignee ids.",
    inputSchema: { type: "object", properties: { email: { type: "string" }, projectId: { type: "string" }, ...pageProps } } },
];

function pick(args: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (args[k] !== undefined) out[k] = args[k];
  return out;
}

export const structureHandlers: Record<string, Handler> = {
  async yg_projects_list(args) { return text(await yougileFetch("GET", "/projects", { params: pick(args, ["title", "includeDeleted", "limit", "offset"]) })); },
  async yg_project_create(args) { return text(await yougileFetch("POST", "/projects", { body: pick(args, ["title", "users"]) })); },
  async yg_boards_list(args) { return text(await yougileFetch("GET", "/boards", { params: pick(args, ["projectId", "title", "includeDeleted", "limit", "offset"]) })); },
  async yg_board_create(args) { return text(await yougileFetch("POST", "/boards", { body: pick(args, ["title", "projectId"]) })); },
  async yg_columns_list(args) { return text(await yougileFetch("GET", "/columns", { params: pick(args, ["boardId", "title", "includeDeleted", "limit", "offset"]) })); },
  async yg_column_create(args) { return text(await yougileFetch("POST", "/columns", { body: pick(args, ["title", "boardId", "color"]) })); },
  async yg_employees_list(args) { return text(await yougileFetch("GET", "/users", { params: pick(args, ["email", "projectId", "limit", "offset"]) })); },
};
