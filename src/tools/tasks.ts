import { yougileFetch } from "../api.js";
import { text } from "../types.js";
import type { ToolDef, Handler } from "../types.js";

function toMs(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "number") return v;
  const s = String(v);
  if (/^\d+$/.test(s)) return Number(s);
  const t = Date.parse(s);
  return Number.isNaN(t) ? undefined : t;
}

// YouGile task deadline is an object { deadline: <ms>, ... }. Accept ms/ISO and wrap.
function normalizeDeadline(v: unknown): unknown {
  if (v === null) return null; // clear
  if (v === undefined) return undefined;
  if (typeof v === "object") return v; // caller passed the full object
  const ms = toMs(v);
  return ms === undefined ? undefined : { deadline: ms };
}

function taskDeadlineMs(task: any): number | undefined {
  const d = task?.deadline;
  if (d === undefined || d === null) return undefined;
  if (typeof d === "number") return d;
  if (typeof d === "object" && typeof d.deadline === "number") return d.deadline;
  return undefined;
}

/**
 * YouGile renders task descriptions as HTML, not plain text or markdown. Plain text with "\n"
 * collapses into one unreadable paragraph in the UI, which is easy to miss when writing via the API.
 */
export const DESCRIPTION_FIELD_DOC =
  "Task description. RENDERED AS HTML, not markdown and not plain text — newlines are ignored and " +
  "plain text collapses into one wall of text in the UI. Use tags: <p> paragraphs, <b> bold, <i> italic, " +
  "<ul>/<ol> + <li> lists, <br> line break, <a href> links. Example: " +
  "\"<p><b>Goal.</b> Ship it.</p><ul><li>step one</li><li>step two</li></ul>\". " +
  "Reading a task back returns the same HTML.";

export const tasksTools: ToolDef[] = [
  { name: "yg_tasks_list",
    description: "List tasks (the workhorse for watching). Server filters: columnId, title, includeDeleted, limit, offset. Client filters applied to the page: assignedTo (user id), completed, archived, deadlineBefore (ms epoch or ISO), changedAfter (ms epoch or ISO, vs task timestamp).",
    inputSchema: { type: "object", properties: {
      columnId: { type: "string" }, title: { type: "string" }, includeDeleted: { type: "boolean" },
      limit: { type: "integer" }, offset: { type: "integer" },
      assignedTo: { type: "string" }, completed: { type: "boolean" }, archived: { type: "boolean" },
      deadlineBefore: { type: "string", description: "ms epoch or ISO date; keep tasks with deadline <= this." },
      changedAfter: { type: "string", description: "ms epoch or ISO date; keep tasks changed after this (task.timestamp)." },
    } } },
  { name: "yg_task_get", description: "Get one task by id (full card).",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "yg_task_create", description: "Create a task in a column.",
    inputSchema: { type: "object", properties: {
      title: { type: "string" }, columnId: { type: "string" }, description: { type: "string", description: DESCRIPTION_FIELD_DOC },
      assigned: { type: "array", items: { type: "string" }, description: "User ids to assign." },
      deadline: { type: "string", description: "ms epoch or ISO date." },
      subtasks: { type: "array", items: { type: "string" }, description: "Subtask (task) ids." },
      checklists: { type: "array", description: "Checklists, each { title, items: [{ title, isCompleted }] }." },
      completed: { type: "boolean" }, archived: { type: "boolean" }, color: { type: "string" },
    }, required: ["title", "columnId"] } },
  { name: "yg_task_update", description: "Update a task: move (columnId), assign, deadline, complete, archive, edit title/description. Only provided fields change. Pass deadline=null to clear.",
    inputSchema: { type: "object", properties: {
      id: { type: "string" }, columnId: { type: "string" }, title: { type: "string" }, description: { type: "string", description: DESCRIPTION_FIELD_DOC },
      assigned: { type: "array", items: { type: "string" } },
      deadline: { type: "string", description: "ms epoch or ISO date; null clears." },
      completed: { type: "boolean" }, archived: { type: "boolean" },
    }, required: ["id"] } },
];

export const tasksHandlers: Record<string, Handler> = {
  async yg_tasks_list(args) {
    const params: Record<string, unknown> = {};
    for (const k of ["columnId", "title", "includeDeleted", "limit", "offset"]) if (args[k] !== undefined) params[k] = args[k];
    const res = await yougileFetch("GET", "/tasks", { params });
    let items: any[] = Array.isArray(res?.content) ? res.content : (Array.isArray(res) ? res : []);
    if (typeof args.assignedTo === "string") items = items.filter((t) => Array.isArray(t.assigned) && t.assigned.includes(args.assignedTo));
    if (typeof args.completed === "boolean") items = items.filter((t) => Boolean(t.completed) === args.completed);
    if (typeof args.archived === "boolean") items = items.filter((t) => Boolean(t.archived) === args.archived);
    const before = toMs(args.deadlineBefore);
    if (before !== undefined) items = items.filter((t) => { const d = taskDeadlineMs(t); return d !== undefined && d <= before; });
    const after = toMs(args.changedAfter);
    if (after !== undefined) items = items.filter((t) => typeof t.timestamp === "number" && t.timestamp > after);
    return text({ content: items, count: items.length, paging: res?.paging });
  },
  async yg_task_get(args) {
    const id = String(args.id ?? "").trim();
    if (!id) return text({ error: "id is required" });
    return text(await yougileFetch("GET", `/tasks/${encodeURIComponent(id)}`));
  },
  async yg_task_create(args) {
    const body: Record<string, unknown> = {};
    for (const k of ["title", "columnId", "description", "assigned", "subtasks", "checklists", "completed", "archived", "color"]) if (args[k] !== undefined) body[k] = args[k];
    const dl = normalizeDeadline(args.deadline);
    if (dl !== undefined) body.deadline = dl;
    return text(await yougileFetch("POST", "/tasks", { body }));
  },
  async yg_task_update(args) {
    const id = String(args.id ?? "").trim();
    if (!id) return text({ error: "id is required" });
    const body: Record<string, unknown> = {};
    for (const k of ["columnId", "title", "description", "assigned", "completed", "archived"]) if (args[k] !== undefined) body[k] = args[k];
    const dl = normalizeDeadline(args.deadline);
    if (dl !== undefined) body.deadline = dl;
    return text(await yougileFetch("PUT", `/tasks/${encodeURIComponent(id)}`, { body }));
  },
};
