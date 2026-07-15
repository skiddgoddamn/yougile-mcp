import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

export interface StoredConfig {
  api_key?: string;
  company_id?: string;
  company_name?: string;
  base_url?: string;
}

export function configDir(): string {
  return process.env.YOUGILE_MCP_CONFIG_DIR || join(homedir(), ".yougile-mcp");
}
function configPath(): string { return join(configDir(), "config.json"); }

export function loadConfig(): StoredConfig {
  try {
    const parsed = JSON.parse(readFileSync(configPath(), "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as StoredConfig) : {};
  } catch { return {}; }
}

export function saveConfig(cfg: StoredConfig): void {
  mkdirSync(configDir(), { recursive: true });
  writeFileSync(configPath(), JSON.stringify(cfg, null, 2), "utf8");
}
