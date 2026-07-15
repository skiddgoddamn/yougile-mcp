import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function load(dir: string) {
  process.env.YOUGILE_MCP_CONFIG_DIR = dir;
  const auth = await import("../src/auth.ts");
  auth.initAuth(); auth.setApiKey("KEY");
  const mod = await import("../src/tools/structure.ts");
  return mod;
}

test("yg_projects_list issues GET /projects with title param", async () => {
  const dir = mkdtempSync(join(tmpdir(), "yg-st-"));
  const orig = globalThis.fetch;
  try {
    const s = await load(dir);
    let seenUrl = ""; let seenMethod = "";
    globalThis.fetch = (async (u: string, i: RequestInit) => { seenUrl = u; seenMethod = i.method as string; return new Response(JSON.stringify({ content: [] }), { status: 200 }); }) as unknown as typeof fetch;
    await s.structureHandlers.yg_projects_list({ title: "Sales" }, { apiKey: "KEY" });
    assert.equal(seenMethod, "GET");
    assert.match(seenUrl, /\/projects\?title=Sales/);
  } finally { globalThis.fetch = orig; rmSync(dir, { recursive: true, force: true }); }
});

test("yg_column_create posts title/boardId/color as body", async () => {
  const dir = mkdtempSync(join(tmpdir(), "yg-st-"));
  const orig = globalThis.fetch;
  try {
    const s = await load(dir);
    let seenBody = "";
    globalThis.fetch = (async (_u: string, i: RequestInit) => { seenBody = i.body as string; return new Response(JSON.stringify({ id: "col1" }), { status: 200 }); }) as unknown as typeof fetch;
    await s.structureHandlers.yg_column_create({ title: "To do", boardId: "b1", color: 3 }, { apiKey: "KEY" });
    assert.deepEqual(JSON.parse(seenBody), { title: "To do", boardId: "b1", color: 3 });
  } finally { globalThis.fetch = orig; rmSync(dir, { recursive: true, force: true }); }
});

test("yg_boards_list omits undefined params", async () => {
  const dir = mkdtempSync(join(tmpdir(), "yg-st-"));
  const orig = globalThis.fetch;
  try {
    const s = await load(dir);
    let seenUrl = "";
    globalThis.fetch = (async (u: string) => { seenUrl = u; return new Response(JSON.stringify({ content: [] }), { status: 200 }); }) as unknown as typeof fetch;
    await s.structureHandlers.yg_boards_list({ projectId: "p1" }, { apiKey: "KEY" });
    assert.match(seenUrl, /\/boards\?projectId=p1$/);
  } finally { globalThis.fetch = orig; rmSync(dir, { recursive: true, force: true }); }
});
