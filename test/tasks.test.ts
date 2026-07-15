import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function load(dir: string) {
  process.env.YOUGILE_MCP_CONFIG_DIR = dir;
  const auth = await import("../src/auth.ts");
  auth.initAuth(); auth.setApiKey("KEY");
  return await import("../src/tools/tasks.ts");
}

test("yg_task_create wraps deadline ms into { deadline } and sends body", async () => {
  const dir = mkdtempSync(join(tmpdir(), "yg-tk-"));
  const orig = globalThis.fetch;
  try {
    const t = await load(dir);
    let seenBody = "";
    globalThis.fetch = (async (_u: string, i: RequestInit) => { seenBody = i.body as string; return new Response(JSON.stringify({ id: "t1" }), { status: 200 }); }) as unknown as typeof fetch;
    await t.tasksHandlers.yg_task_create({ title: "Do", columnId: "c1", deadline: 1700000000000, assigned: ["u1"] }, { apiKey: "KEY" });
    const body = JSON.parse(seenBody);
    assert.equal(body.title, "Do");
    assert.equal(body.columnId, "c1");
    assert.deepEqual(body.assigned, ["u1"]);
    assert.deepEqual(body.deadline, { deadline: 1700000000000 });
  } finally { globalThis.fetch = orig; rmSync(dir, { recursive: true, force: true }); }
});

test("yg_task_update sends only provided fields to PUT /tasks/{id}", async () => {
  const dir = mkdtempSync(join(tmpdir(), "yg-tk-"));
  const orig = globalThis.fetch;
  try {
    const t = await load(dir);
    let seenUrl = ""; let seenMethod = ""; let seenBody = "";
    globalThis.fetch = (async (u: string, i: RequestInit) => { seenUrl = u; seenMethod = i.method as string; seenBody = i.body as string; return new Response(JSON.stringify({ id: "t1" }), { status: 200 }); }) as unknown as typeof fetch;
    await t.tasksHandlers.yg_task_update({ id: "t1", columnId: "c2" }, { apiKey: "KEY" });
    assert.equal(seenMethod, "PUT");
    assert.match(seenUrl, /\/tasks\/t1$/);
    assert.deepEqual(JSON.parse(seenBody), { columnId: "c2" });
  } finally { globalThis.fetch = orig; rmSync(dir, { recursive: true, force: true }); }
});

test("yg_tasks_list applies client filters (assignedTo, deadlineBefore, changedAfter)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "yg-tk-"));
  const orig = globalThis.fetch;
  try {
    const t = await load(dir);
    const page = { content: [
      { id: "a", assigned: ["u1"], deadline: { deadline: 100 }, timestamp: 500, completed: false },
      { id: "b", assigned: ["u2"], deadline: { deadline: 100 }, timestamp: 500, completed: false },
      { id: "c", assigned: ["u1"], deadline: { deadline: 999 }, timestamp: 500, completed: false },
      { id: "d", assigned: ["u1"], deadline: { deadline: 100 }, timestamp: 50,  completed: false },
    ] };
    globalThis.fetch = (async () => new Response(JSON.stringify(page), { status: 200 })) as unknown as typeof fetch;
    const res = await t.tasksHandlers.yg_tasks_list({ assignedTo: "u1", deadlineBefore: 200, changedAfter: 100 }, { apiKey: "KEY" });
    const payload = JSON.parse(res.content[0].text as string);
    assert.deepEqual(payload.content.map((x: any) => x.id), ["a"]);
    assert.equal(payload.count, 1);
  } finally { globalThis.fetch = orig; rmSync(dir, { recursive: true, force: true }); }
});

test("yg_task_create forwards checklists in POST body", async () => {
  const dir = mkdtempSync(join(tmpdir(), "yg-tk-"));
  const orig = globalThis.fetch;
  try {
    const t = await load(dir);
    let seenBody = "";
    globalThis.fetch = (async (_u: string, i: RequestInit) => { seenBody = i.body as string; return new Response(JSON.stringify({ id: "t2" }), { status: 200 }); }) as unknown as typeof fetch;
    const checklistsInput = [{ title: "cl", items: [{ title: "i", isCompleted: false }] }];
    await t.tasksHandlers.yg_task_create({ title: "T", columnId: "c1", checklists: checklistsInput }, { apiKey: "KEY" });
    const body = JSON.parse(seenBody);
    assert.equal(body.title, "T");
    assert.equal(body.columnId, "c1");
    assert.deepEqual(body.checklists, checklistsInput);
  } finally { globalThis.fetch = orig; rmSync(dir, { recursive: true, force: true }); }
});
