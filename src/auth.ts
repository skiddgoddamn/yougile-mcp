import { loadConfig, saveConfig, type StoredConfig } from "./config.js";
import { text } from "./types.js";
import type { ToolDef, Handler } from "./types.js";

export class AuthError extends Error {
  constructor(message = "YouGile API key is not configured") { super(message); this.name = "AuthError"; }
}

let state: StoredConfig = {};

export function initAuth(): void {
  const file = loadConfig();
  state = {
    api_key: file.api_key ?? process.env.YOUGILE_API_KEY ?? "",
    company_id: file.company_id ?? "",
    company_name: file.company_name ?? "",
    base_url: file.base_url ?? process.env.YOUGILE_BASE_URL ?? "",
  };
}

export function currentApiKey(): string { return state.api_key ?? ""; }
export function getApiKey(): string {
  const k = currentApiKey();
  if (!k) throw new AuthError();
  return k;
}
export const DEFAULT_BASE_URL = "https://ru.yougile.com/api-v2";
export function currentBaseUrl(): string {
  return (state.base_url && state.base_url.trim()) || process.env.YOUGILE_BASE_URL || DEFAULT_BASE_URL;
}
export function currentCompany(): { id: string; name: string } {
  return { id: state.company_id ?? "", name: state.company_name ?? "" };
}

function persist(): void {
  saveConfig({
    api_key: state.api_key || undefined,
    company_id: state.company_id || undefined,
    company_name: state.company_name || undefined,
    base_url: state.base_url || undefined,
  });
}

export function setApiKey(key: string): void { state.api_key = key; persist(); }
export function setCompany(id: string, name: string): void { state.company_id = id; state.company_name = name; persist(); }
export function setBaseUrl(url: string): void { state.base_url = url; persist(); }

export function authRequiredPayload(reason: string): Record<string, unknown> {
  return {
    authorization_required: true,
    reason,
    next_step:
      "Provide a YouGile API key via yg_setup, or run yg_auth_companies then yg_auth_create_key to generate one from login/password. Create keys in the YouGile UI under Settings if you prefer.",
  };
}

export const AUTH_TOOLS: ToolDef[] = [
  {
    name: "yg_auth_status",
    description: "Show YouGile auth status: whether an API key is stored and which company (if known).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "yg_setup",
    description: "Store a YouGile API key (create one in the YouGile UI, or use yg_auth_create_key). Optionally set a custom base URL for self-hosted instances.",
    inputSchema: {
      type: "object",
      properties: {
        apiKey: { type: "string", description: "YouGile API key (Bearer token)." },
        baseUrl: { type: "string", description: "Optional API base URL, default https://ru.yougile.com/api-v2" },
      },
      required: ["apiKey"],
    },
  },
];

export const authHandlers: Record<string, Handler> = {
  async yg_auth_status() {
    const c = currentCompany();
    return text({
      api_key_set: Boolean(currentApiKey()),
      company_id: c.id || null,
      company_name: c.name || null,
      hint: currentApiKey() ? "Configured." : "Run yg_setup with an API key, or yg_auth_companies + yg_auth_create_key.",
    });
  },
  async yg_setup(args) {
    const key = String(args.apiKey ?? "").trim();
    if (!key) return text({ error: "apiKey is required" });
    setApiKey(key);
    const baseUrl = String(args.baseUrl ?? "").trim();
    if (baseUrl) { setBaseUrl(baseUrl); }
    return text({ ok: true, message: "API key saved." });
  },
};
