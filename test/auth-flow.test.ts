import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function load(dir: string) {
  process.env.YOUGILE_MCP_CONFIG_DIR = dir;
  const auth = await import("../src/auth.ts?flow-" + encodeURIComponent(dir));
  auth.initAuth();
  return auth;
}

test("yg_auth_companies posts to /auth/companies without Bearer", async () => {
  const dir = mkdtempSync(join(tmpdir(), "yg-flow-"));
  const orig = globalThis.fetch;
  try {
    const auth = await load(dir);
    let seenUrl = ""; let seenInit: RequestInit = {};
    globalThis.fetch = (async (u: string, i: RequestInit) => { seenUrl = u; seenInit = i; return new Response(JSON.stringify({ content: [{ id: "co1", name: "Acme" }] }), { status: 200 }); }) as unknown as typeof fetch;
    const res = await auth.authHandlers.yg_auth_companies({ login: "a@b.c", password: "p" }, { apiKey: "" });
    assert.match(seenUrl, /\/auth\/companies$/);
    assert.equal((seenInit.headers as Record<string, string>).Authorization, undefined);
    const payload = JSON.parse(res.content[0].text as string);
    assert.equal(payload.companies[0].id, "co1");
  } finally { globalThis.fetch = orig; rmSync(dir, { recursive: true, force: true }); }
});

test("yg_auth_create_key reuses an existing non-deleted key and stores it", async () => {
  const dir = mkdtempSync(join(tmpdir(), "yg-flow-"));
  const orig = globalThis.fetch;
  try {
    const auth = await load(dir);
    globalThis.fetch = (async (u: string) => {
      if (String(u).endsWith("/auth/keys/get")) return new Response(JSON.stringify([{ key: "EXISTING", deleted: false }]), { status: 200 });
      return new Response(JSON.stringify({ key: "NEW" }), { status: 200 });
    }) as unknown as typeof fetch;
    const res = await auth.authHandlers.yg_auth_create_key({ login: "a", password: "p", companyId: "co1" }, { apiKey: "" });
    const payload = JSON.parse(res.content[0].text as string);
    assert.equal(payload.ok, true);
    assert.equal(auth.getApiKey(), "EXISTING");
    assert.equal(auth.currentCompany().id, "co1");
  } finally { globalThis.fetch = orig; rmSync(dir, { recursive: true, force: true }); }
});

test("yg_auth_create_key creates a new key when none exist", async () => {
  const dir = mkdtempSync(join(tmpdir(), "yg-flow-"));
  const orig = globalThis.fetch;
  try {
    const auth = await load(dir);
    globalThis.fetch = (async (u: string) => {
      if (String(u).endsWith("/auth/keys/get")) return new Response(JSON.stringify([]), { status: 200 });
      return new Response(JSON.stringify({ key: "NEW" }), { status: 200 });
    }) as unknown as typeof fetch;
    await auth.authHandlers.yg_auth_create_key({ login: "a", password: "p", companyId: "co1" }, { apiKey: "" });
    assert.equal(auth.getApiKey(), "NEW");
  } finally { globalThis.fetch = orig; rmSync(dir, { recursive: true, force: true }); }
});
