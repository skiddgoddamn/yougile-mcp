import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function withTempDir(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "yg-cfg-"));
  process.env.YOUGILE_MCP_CONFIG_DIR = dir;
  try { fn(dir); } finally { delete process.env.YOUGILE_MCP_CONFIG_DIR; rmSync(dir, { recursive: true, force: true }); }
}

test("loadConfig returns {} when no file exists", async () => {
  await withTempDir(async () => {
    const { loadConfig } = await import("../src/config.ts");
    assert.deepEqual(loadConfig(), {});
  });
});

test("saveConfig then loadConfig round-trips the api key", async () => {
  await withTempDir(async () => {
    const { loadConfig, saveConfig } = await import("../src/config.ts");
    saveConfig({ api_key: "KEY123", company_id: "c1", company_name: "Acme" });
    const cfg = loadConfig();
    assert.equal(cfg.api_key, "KEY123");
    assert.equal(cfg.company_id, "c1");
    assert.equal(cfg.company_name, "Acme");
  });
});
