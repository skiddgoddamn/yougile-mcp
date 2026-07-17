import { AsyncLocalStorage } from "node:async_hooks";
import { loadConfig, saveConfig, type StoredConfig, type CompanyEntry } from "./config.js";
import { text } from "./types.js";
import type { ToolDef, Handler } from "./types.js";
import { yougileFetch } from "./api.js";

export class AuthError extends Error {
  constructor(message = "YouGile API key is not configured") { super(message); this.name = "AuthError"; }
}

interface AuthState {
  companies: CompanyEntry[];
  active_company_id: string;
  base_url: string;
}

let state: AuthState = { companies: [], active_company_id: "", base_url: "" };

// Per-call API key override (e.g. `company` arg targeting a non-active company).
// AsyncLocalStorage scopes it to the handler's async context — race-safe across
// concurrent dispatches, unlike a plain mutable global.
const callKey = new AsyncLocalStorage<string>();
export function runWithApiKey<T>(key: string | undefined, fn: () => T): T {
  return key ? callKey.run(key, fn) : fn();
}

export function initAuth(): void {
  const file = loadConfig();
  const companies: CompanyEntry[] = Array.isArray(file.companies) ? file.companies.filter((c) => c && c.api_key) : [];
  // Migrate a legacy single-key config into the companies list.
  const legacyKey = file.api_key ?? process.env.YOUGILE_API_KEY ?? "";
  if (legacyKey && !companies.some((c) => c.api_key === legacyKey)) {
    companies.push({ id: file.company_id ?? "", name: file.company_name ?? "", api_key: legacyKey });
  }
  const active = file.active_company_id ?? file.company_id ?? companies[0]?.id ?? "";
  state = { companies, active_company_id: active, base_url: file.base_url ?? process.env.YOUGILE_BASE_URL ?? "" };
}

function activeEntry(): CompanyEntry | undefined {
  return state.companies.find((c) => c.id === state.active_company_id) ?? state.companies[0];
}

export function currentApiKey(): string {
  return callKey.getStore() || activeEntry()?.api_key || "";
}
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
  const e = activeEntry();
  return { id: e?.id ?? "", name: e?.name ?? "" };
}
export function listCompanies(): Array<{ id: string; name: string; active: boolean; key_preview: string }> {
  return state.companies.map((c) => ({ id: c.id, name: c.name ?? "", active: c.id === state.active_company_id, key_preview: mask(c.api_key) }));
}

/** Resolve the stored API key for a company by id or (case-insensitive) name. */
export function resolveKeyForCompany(idOrName: string): string {
  const needle = idOrName.trim().toLowerCase();
  const hit = state.companies.find((c) => c.id.toLowerCase() === needle || (c.name ?? "").toLowerCase() === needle);
  if (!hit) throw new Error(`No stored key for company '${idOrName}'. Run yg_auth_status to list companies, or yg_auth_create_key to fetch keys.`);
  return hit.api_key;
}

function persist(): void {
  const active = activeEntry();
  saveConfig({
    companies: state.companies,
    active_company_id: state.active_company_id || undefined,
    // Mirror active company into legacy fields for backward compatibility.
    api_key: active?.api_key || undefined,
    company_id: active?.id || undefined,
    company_name: active?.name || undefined,
    base_url: state.base_url || undefined,
  });
}

function upsertCompany(entry: CompanyEntry): void {
  const rest = state.companies.filter((c) => c.id !== entry.id);
  state = { ...state, companies: [...rest, entry] };
}

/** Store/replace a single key (yg_setup). Uses `companyId` when known, else "". */
export function setApiKey(key: string, companyId = "", companyName = ""): void {
  upsertCompany({ id: companyId, name: companyName, api_key: key });
  state = { ...state, active_company_id: companyId };
  persist();
}
export function setActiveCompany(id: string): void { state = { ...state, active_company_id: id }; persist(); }
export function setBaseUrl(url: string): void { state = { ...state, base_url: url }; persist(); }

function mask(key: string): string {
  return key && key.length > 8 ? `${key.slice(0, 4)}…${key.slice(-4)}` : "****";
}

/** Get an existing (non-deleted) key for a company, or create a new one. */
async function obtainKey(login: string, password: string, companyId: string): Promise<string> {
  try {
    const existing = await yougileFetch("POST", "/auth/keys/get", { auth: false, body: { login, password, companyId } });
    const list = Array.isArray(existing) ? existing : existing?.content;
    const alive = Array.isArray(list) ? list.find((k: any) => k && !k.deleted && k.key) : null;
    if (alive) return alive.key;
  } catch { /* fall through to create */ }
  const created = await yougileFetch("POST", "/auth/keys", { auth: false, body: { login, password, companyId } });
  return created?.key ?? created?.content?.key ?? "";
}

async function listCompaniesFor(login: string, password: string): Promise<Array<{ id: string; name?: string }>> {
  const res = await yougileFetch("POST", "/auth/companies", { auth: false, body: { login, password } });
  const arr = Array.isArray(res?.content) ? res.content : Array.isArray(res) ? res : [];
  return arr.filter((c: any) => c && c.id).map((c: any) => ({ id: String(c.id), name: c.name ? String(c.name) : "" }));
}

export function authRequiredPayload(reason: string): Record<string, unknown> {
  return {
    authorization_required: true,
    reason,
    next_step:
      "Provide a YouGile API key via yg_setup, or run yg_auth_create_key with login+password (no companyId) to fetch keys for ALL your companies at once. Switch the active company with yg_company_use, or pass `company` on any tool call.",
  };
}

export const AUTH_TOOLS: ToolDef[] = [
  {
    name: "yg_auth_status",
    description: "Show YouGile auth status: the active company and every stored company (with masked key previews).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "yg_setup",
    description: "Store a single YouGile API key (create one in the YouGile UI, or use yg_auth_create_key). Optionally set a custom base URL for self-hosted instances.",
    inputSchema: {
      type: "object",
      properties: {
        apiKey: { type: "string", description: "YouGile API key (Bearer token)." },
        baseUrl: { type: "string", description: "Optional API base URL, default https://ru.yougile.com/api-v2" },
      },
      required: ["apiKey"],
    },
  },
  {
    name: "yg_auth_companies",
    description: "List YouGile companies for a login/password (without creating keys). Credentials are used once and NOT stored.",
    inputSchema: {
      type: "object",
      properties: { login: { type: "string" }, password: { type: "string" } },
      required: ["login", "password"],
    },
  },
  {
    name: "yg_auth_create_key",
    description: "Fetch (or reuse) YouGile API keys from login/password and store them. Omit companyId to grab keys for ALL your companies at once (recommended); pass companyId to fetch just one. Credentials are used once and NOT stored.",
    inputSchema: {
      type: "object",
      properties: {
        login: { type: "string" },
        password: { type: "string" },
        companyId: { type: "string", description: "Optional. Omit to fetch keys for every company the login can access." },
        companyName: { type: "string", description: "Optional display name to store (used only with companyId)." },
      },
      required: ["login", "password"],
    },
  },
  {
    name: "yg_company_use",
    description: "Switch the active YouGile company for subsequent tool calls. Pass a company id or name (see yg_auth_status).",
    inputSchema: {
      type: "object",
      properties: { company: { type: "string", description: "Company id or name to make active." } },
      required: ["company"],
    },
  },
];

export const authHandlers: Record<string, Handler> = {
  async yg_auth_status() {
    const c = currentCompany();
    const companies = listCompanies();
    return text({
      api_key_set: Boolean(currentApiKey()),
      active_company_id: c.id || null,
      active_company_name: c.name || null,
      companies,
      hint: companies.length
        ? "Pass `company` (id or name) on any tool call, or yg_company_use to switch the active company."
        : "Run yg_auth_create_key with login+password (no companyId) to fetch keys for all your companies.",
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
  async yg_auth_companies(args) {
    const login = String(args.login ?? "").trim();
    const password = String(args.password ?? "");
    if (!login || !password) return text({ error: "login and password are required" });
    const companies = await listCompaniesFor(login, password);
    return text({ companies, hint: "Call yg_auth_create_key with login+password (no companyId) to store keys for all of them." });
  },
  async yg_auth_create_key(args) {
    const login = String(args.login ?? "").trim();
    const password = String(args.password ?? "");
    const companyId = String(args.companyId ?? "").trim();
    if (!login || !password) return text({ error: "login and password are required" });

    // Single company (explicit companyId) — legacy behavior.
    if (companyId) {
      const key = await obtainKey(login, password, companyId);
      if (!key) return text({ error: "Could not obtain an API key from YouGile." });
      setApiKey(key, companyId, String(args.companyName ?? ""));
      return text({ ok: true, message: "API key created and stored.", key_preview: mask(key), company_id: companyId });
    }

    // No companyId — fetch keys for EVERY company the login can access.
    const companies = await listCompaniesFor(login, password);
    if (!companies.length) return text({ error: "No companies found for this login." });
    const results: Array<{ id: string; name: string; ok: boolean; key_preview?: string; error?: string }> = [];
    for (const co of companies) {
      try {
        const key = await obtainKey(login, password, co.id);
        if (key) {
          upsertCompany({ id: co.id, name: co.name ?? "", api_key: key });
          results.push({ id: co.id, name: co.name ?? "", ok: true, key_preview: mask(key) });
        } else {
          results.push({ id: co.id, name: co.name ?? "", ok: false, error: "no key returned" });
        }
      } catch (e) {
        results.push({ id: co.id, name: co.name ?? "", ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
    const stored = results.filter((r) => r.ok);
    if (!stored.length) return text({ error: "Could not obtain any API keys.", results });
    // Set active to the first company that got a key (keep existing active if still valid).
    if (!state.companies.some((c) => c.id === state.active_company_id)) {
      state = { ...state, active_company_id: stored[0].id };
    }
    persist();
    return text({
      ok: true,
      message: `Stored keys for ${stored.length} of ${companies.length} companies.`,
      active_company_id: currentCompany().id || null,
      companies: results,
    });
  },
  async yg_company_use(args) {
    const sel = String(args.company ?? "").trim();
    if (!sel) return text({ error: "company (id or name) is required" });
    let key: string;
    try { key = resolveKeyForCompany(sel); } catch (e) { return text({ error: e instanceof Error ? e.message : String(e) }); }
    const entry = state.companies.find((c) => c.api_key === key)!;
    setActiveCompany(entry.id);
    return text({ ok: true, active_company_id: entry.id, active_company_name: entry.name ?? "" });
  },
};
