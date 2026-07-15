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

test("yg_auth_create_key returns a masked preview, never the full key", async () => {
  const dir = mkdtempSync(join(tmpdir(), "yg-flow-"));
  const orig = globalThis.fetch;
  try {
    const auth = await load(dir);
    globalThis.fetch = (async (u: string) => {
      if (String(u).endsWith("/auth/keys/get")) return new Response(JSON.stringify([{ key: "SUPERSECRETKEY123456", deleted: false }]), { status: 200 });
      return new Response(JSON.stringify({ key: "NEW" }), { status: 200 });
    }) as unknown as typeof fetch;
    const res = await auth.authHandlers.yg_auth_create_key({ login: "a", password: "p", companyId: "co1" }, { apiKey: "" });
    const payload = JSON.parse(res.content[0].text as string);
    assert.notEqual(payload.key_preview, "SUPERSECRETKEY123456", "key_preview should not equal the full key");
    assert(typeof payload.key_preview === "string", "key_preview should be a string");
    assert(!payload.key_preview.includes("SUPERSECRETKEY123456"), "key_preview should not contain the full key");
    assert.equal(payload.key_preview, "SUPE…3456", "key_preview should match masked format (first 4 + … + last 4)");
    assert.equal(auth.getApiKey(), "SUPERSECRETKEY123456", "stored key should be unmasked");
  } finally { globalThis.fetch = orig; rmSync(dir, { recursive: true, force: true }); }
});

test("yg_auth_create_key skips deleted keys and reuses the first alive one", async () => {
  const dir = mkdtempSync(join(tmpdir(), "yg-flow-"));
  const orig = globalThis.fetch;
  try {
    const auth = await load(dir);
    let createCalled = false;
    globalThis.fetch = (async (u: string) => {
      if (String(u).endsWith("/auth/keys/get")) return new Response(JSON.stringify([{ key: "DEADKEY", deleted: true }, { key: "ALIVEKEY", deleted: false }]), { status: 200 });
      if (String(u).endsWith("/auth/keys")) { createCalled = true; return new Response(JSON.stringify({ key: "NEW" }), { status: 200 }); }
      return new Response(JSON.stringify({ key: "NEW" }), { status: 200 });
    }) as unknown as typeof fetch;
    const res = await auth.authHandlers.yg_auth_create_key({ login: "a", password: "p", companyId: "co1" }, { apiKey: "" });
    const payload = JSON.parse(res.content[0].text as string);
    assert.equal(payload.ok, true);
    assert(!createCalled, "create endpoint (/auth/keys) should NOT be called when alive key exists");
    assert.equal(auth.getApiKey(), "ALIVEKEY", "should reuse the alive key, skipping deleted ones");
  } finally { globalThis.fetch = orig; rmSync(dir, { recursive: true, force: true }); }
});
