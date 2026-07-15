import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function load(dir: string) {
  process.env.YOUGILE_MCP_CONFIG_DIR = dir;
  const auth = await import("../src/auth.ts");
  auth.initAuth(); auth.setApiKey("KEY");
  return await import("../src/tools/chat.ts");
}

test("yg_task_chat_get GETs /chats/{id}/messages", async () => {
  const dir = mkdtempSync(join(tmpdir(), "yg-ch-"));
  const orig = globalThis.fetch;
  try {
    const c = await load(dir);
    let seenUrl = ""; let seenMethod = "";
    globalThis.fetch = (async (u: string, i: RequestInit) => { seenUrl = u; seenMethod = i.method as string; return new Response(JSON.stringify({ content: [] }), { status: 200 }); }) as unknown as typeof fetch;
    await c.chatHandlers.yg_task_chat_get({ taskId: "t1", limit: 20 }, { apiKey: "KEY" });
    assert.equal(seenMethod, "GET");
    assert.match(seenUrl, /\/chats\/t1\/messages\?limit=20$/);
  } finally { globalThis.fetch = orig; rmSync(dir, { recursive: true, force: true }); }
});

test("yg_task_comment POSTs text body", async () => {
  const dir = mkdtempSync(join(tmpdir(), "yg-ch-"));
  const orig = globalThis.fetch;
  try {
    const c = await load(dir);
    let seenUrl = ""; let seenMethod = ""; let seenBody = "";
    globalThis.fetch = (async (u: string, i: RequestInit) => { seenUrl = u; seenMethod = i.method as string; seenBody = i.body as string; return new Response(JSON.stringify({ id: "m1" }), { status: 200 }); }) as unknown as typeof fetch;
    await c.chatHandlers.yg_task_comment({ taskId: "t1", text: "Готово" }, { apiKey: "KEY" });
    assert.equal(seenMethod, "POST");
    assert.match(seenUrl, /\/chats\/t1\/messages$/);
    assert.deepEqual(JSON.parse(seenBody), { text: "Готово" });
  } finally { globalThis.fetch = orig; rmSync(dir, { recursive: true, force: true }); }
});
