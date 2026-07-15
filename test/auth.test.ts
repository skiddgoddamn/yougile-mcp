import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function freshAuth(dir: string) {
  process.env.YOUGILE_MCP_CONFIG_DIR = dir;
  delete process.env.YOUGILE_API_KEY;
  const mod = await import("../src/auth.ts?" + encodeURIComponent(dir)); // cache-bust per dir
  mod.initAuth();
  return mod;
}

test("getApiKey throws AuthError before setup", async () => {
  const dir = mkdtempSync(join(tmpdir(), "yg-auth-"));
  try {
    const auth = await freshAuth(dir);
    assert.throws(() => auth.getApiKey(), (e: Error) => e.name === "AuthError");
    assert.equal(auth.currentApiKey(), "");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("yg_setup stores the key and yg_auth_status reflects it", async () => {
  const dir = mkdtempSync(join(tmpdir(), "yg-auth-"));
  try {
    const auth = await freshAuth(dir);
    await auth.authHandlers.yg_setup({ apiKey: "  KEY-abc  " }, { apiKey: "" });
    assert.equal(auth.getApiKey(), "KEY-abc");
    const res = await auth.authHandlers.yg_auth_status({}, { apiKey: "" });
    const payload = JSON.parse(res.content[0].text as string);
    assert.equal(payload.api_key_set, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
