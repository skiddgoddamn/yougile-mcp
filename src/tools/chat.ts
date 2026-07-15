import { yougileFetch } from "../api.js";
import { text } from "../types.js";
import type { ToolDef, Handler } from "../types.js";

export const chatTools: ToolDef[] = [
  { name: "yg_task_chat_get", description: "Read the chat/comments of a task (chatId = task id). Useful for watching discussion.",
    inputSchema: { type: "object", properties: {
      taskId: { type: "string" }, includeSystem: { type: "boolean", description: "Include system messages." },
      limit: { type: "integer" }, offset: { type: "integer" },
    }, required: ["taskId"] } },
  { name: "yg_task_comment", description: "Post a comment to a task's chat.",
    inputSchema: { type: "object", properties: {
      taskId: { type: "string" }, text: { type: "string" }, label: { type: "string", description: "Optional message label/color." },
    }, required: ["taskId", "text"] } },
];

export const chatHandlers: Record<string, Handler> = {
  async yg_task_chat_get(args) {
    const taskId = String(args.taskId ?? "").trim();
    if (!taskId) return text({ error: "taskId is required" });
    const params: Record<string, unknown> = {};
    for (const k of ["includeSystem", "limit", "offset"]) if (args[k] !== undefined) params[k] = args[k];
    return text(await yougileFetch("GET", `/chats/${encodeURIComponent(taskId)}/messages`, { params }));
  },
  async yg_task_comment(args) {
    const taskId = String(args.taskId ?? "").trim();
    const msg = String(args.text ?? "");
    if (!taskId || !msg) return text({ error: "taskId and text are required" });
    const body: Record<string, unknown> = { text: msg };
    if (args.label !== undefined) body.label = args.label;
    return text(await yougileFetch("POST", `/chats/${encodeURIComponent(taskId)}/messages`, { body }));
  },
};
