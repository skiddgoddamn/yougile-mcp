import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function load(dir: string, env: Record<string, string> = {}) {
  process.env.YOUGILE_MCP_CONFIG_DIR = dir;
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  const mod = await import("../src/index.ts?disp-" + encodeURIComponent(dir + JSON.stringify(env)));
  return mod;
}

test("isMutating flags _create/_update/_comment, not reads or auth", async () => {
  const dir = mkdtempSync(join(tmpdir(), "yg-disp-"));
  try {
    const m = await load(dir);
    assert.equal(m.isMutating("yg_task_create"), true);
    assert.equal(m.isMutating("yg_task_update"), true);
    assert.equal(m.isMutating("yg_task_comment"), true);
    assert.equal(m.isMutating("yg_tasks_list"), false);
    assert.equal(m.isMutating("yg_setup"), false);
    assert.equal(m.isMutating("yg_auth_create_key"), false); // auth tool, exempt
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("dispatch returns auth_required when no key configured", async () => {
  const dir = mkdtempSync(join(tmpdir(), "yg-disp-"));
  try {
    const m = await load(dir);
    const res = await m.dispatch("yg_tasks_list", {});
    const payload = JSON.parse(res.content[0].text as string);
    assert.equal(payload.authorization_required, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("READONLY blocks mutating tools", async () => {
  const dir = mkdtempSync(join(tmpdir(), "yg-disp-"));
  try {
    const m = await load(dir, { YG_READONLY: "true" });
    const res = await m.dispatch("yg_task_create", { title: "x", columnId: "c1" });
    const payload = JSON.parse(res.content[0].text as string);
    assert.equal(payload.denied, true);
  } finally { delete process.env.YG_READONLY; rmSync(dir, { recursive: true, force: true }); }
});

test("CONFIRM requires confirm=true for mutating tools", async () => {
  const dir = mkdtempSync(join(tmpdir(), "yg-disp-"));
  try {
    const m = await load(dir, { YG_CONFIRM: "true" });
    const res = await m.dispatch("yg_task_create", { title: "x", columnId: "c1" });
    const payload = JSON.parse(res.content[0].text as string);
    assert.equal(payload.confirm_required, true);
  } finally { delete process.env.YG_CONFIRM; rmSync(dir, { recursive: true, force: true }); }
});
