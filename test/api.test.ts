import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function mockResp(status: number, body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers });
}

async function loadApi(dir: string, key = "KEY") {
  process.env.YOUGILE_MCP_CONFIG_DIR = dir;
  const auth = await import("../src/auth.ts");
  auth.initAuth();
  if (key) auth.setApiKey(key);
  const api = await import("../src/api.ts");
  return { api, auth };
}

test("yougileFetch builds URL with query params and Bearer header", async () => {
  const dir = mkdtempSync(join(tmpdir(), "yg-api-"));
  try {
    const { api } = await loadApi(dir);
    let seenUrl = ""; let seenInit: RequestInit = {};
    const fetchImpl = (async (u: string, i: RequestInit) => { seenUrl = u; seenInit = i; return mockResp(200, JSON.stringify({ content: [] })); }) as unknown as typeof fetch;
    await api.yougileFetch("GET", "/tasks", { params: { columnId: "c1", limit: 50, skip: undefined }, fetchImpl });
    assert.match(seenUrl, /\/api-v2\/tasks\?/);
    assert.match(seenUrl, /columnId=c1/);
    assert.match(seenUrl, /limit=50/);
    assert.doesNotMatch(seenUrl, /skip=/);
    assert.equal((seenInit.headers as Record<string, string>).Authorization, "Bearer KEY");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("yougileFetch serializes JSON body and sets content-type", async () => {
  const dir = mkdtempSync(join(tmpdir(), "yg-api-"));
  try {
    const { api } = await loadApi(dir);
    let seenInit: RequestInit = {};
    const fetchImpl = (async (_u: string, i: RequestInit) => { seenInit = i; return mockResp(200, JSON.stringify({ id: "t1" })); }) as unknown as typeof fetch;
    const out = await api.yougileFetch("POST", "/tasks", { body: { title: "Hi", columnId: "c1" }, fetchImpl });
    assert.equal((seenInit.headers as Record<string, string>)["Content-Type"], "application/json");
    assert.equal(seenInit.body, JSON.stringify({ title: "Hi", columnId: "c1" }));
    assert.equal(out.id, "t1");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("yougileFetch maps 401 to AuthError", async () => {
  const dir = mkdtempSync(join(tmpdir(), "yg-api-"));
  try {
    const { api } = await loadApi(dir);
    const fetchImpl = (async () => mockResp(401, "unauthorized")) as unknown as typeof fetch;
    await assert.rejects(api.yougileFetch("GET", "/tasks", { fetchImpl }), (e: Error) => e.name === "AuthError");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("yougileFetch retries on 500 then succeeds", async () => {
  const dir = mkdtempSync(join(tmpdir(), "yg-api-"));
  try {
    const { api } = await loadApi(dir);
    let calls = 0;
    const fetchImpl = (async () => { calls++; return calls < 2 ? mockResp(500, "err") : mockResp(200, JSON.stringify({ ok: 1 })); }) as unknown as typeof fetch;
    // inject fast sleep by monkeypatching via maxAttempts path: use params-free call; retry uses default sleep,
    // so keep the failure count at 1 to keep the test fast (single 1s backoff).
    const out = await api.yougileFetch("GET", "/x", { fetchImpl });
    assert.equal(out.ok, 1);
    assert.equal(calls, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("yougileFetch throws Error with API message on 400", async () => {
  const dir = mkdtempSync(join(tmpdir(), "yg-api-"));
  try {
    const { api } = await loadApi(dir);
    const fetchImpl = (async () => mockResp(400, JSON.stringify({ message: "bad title" }))) as unknown as typeof fetch;
    await assert.rejects(api.yougileFetch("POST", "/tasks", { body: {}, fetchImpl }), /YouGile API error 400: bad title/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
