import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

export interface CompanyEntry {
  id: string;
  name?: string;
  api_key: string;
}

export interface StoredConfig {
  // Legacy single-company fields — still written (mirroring the active company)
  // for backward compatibility with older readers.
  api_key?: string;
  company_id?: string;
  company_name?: string;
  base_url?: string;
  // Multi-company: one API key per YouGile company.
  companies?: CompanyEntry[];
  active_company_id?: string;
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
