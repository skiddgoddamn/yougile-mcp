import { getApiKey, AuthError, currentBaseUrl } from "./auth.js";
import { log, LOG_BODIES } from "./log.js";

const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);

interface RetryOpts { fetchImpl?: typeof fetch; maxAttempts?: number; sleep?: (ms: number) => Promise<void>; }

export async function requestWithRetry(url: string, reqInit: RequestInit, opts: RetryOpts = {}): Promise<Response> {
  const f = opts.fetchImpl ?? fetch;
  const maxAttempts = opts.maxAttempts ?? 4;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  let delay = 1000;
  let resp = await f(url, reqInit);
  for (let attempt = 1; attempt < maxAttempts; attempt++) {
    if (!RETRY_STATUS.has(resp.status)) break;
    const ra = resp.headers.get("Retry-After");
    const wait = ra && /^\d+$/.test(ra) ? Number(ra) * 1000 : delay;
    log.warning(`HTTP ${resp.status} from ${url} — retry ${attempt}/${maxAttempts - 1} in ${wait}ms`);
    await sleep(wait);
    delay = Math.min(delay * 2, 30000);
    resp = await f(url, reqInit);
  }
  return resp;
}

interface FetchInit { params?: Record<string, unknown>; body?: unknown; auth?: boolean; fetchImpl?: typeof fetch; }

export async function yougileFetch(method: string, path: string, init: FetchInit = {}): Promise<any> {
  let url = currentBaseUrl() + path;
  if (init.params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(init.params)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) v.forEach((x) => qs.append(k, String(x)));
      else qs.append(k, String(v));
    }
    const q = qs.toString();
    if (q) url += (url.includes("?") ? "&" : "?") + q;
  }
  const headers: Record<string, string> = {};
  if (init.auth !== false) headers.Authorization = `Bearer ${getApiKey()}`;
  const reqInit: RequestInit = { method: method.toUpperCase(), headers };
  if (init.body !== undefined) { headers["Content-Type"] = "application/json"; reqInit.body = JSON.stringify(init.body); }
  if (LOG_BODIES) log.debug(`REQUEST ${method} ${url}: ${String(reqInit.body ?? "")}`.slice(0, 2000));
  const resp = await requestWithRetry(url, reqInit, { fetchImpl: init.fetchImpl });
  if (resp.status === 204) return { success: true };
  if (resp.status === 401 || resp.status === 403) throw new AuthError("YouGile API key rejected (401/403) — re-run yg_setup");
  const bodyText = await resp.text();
  if (resp.status >= 400) {
    let msg = bodyText.slice(0, 500);
    try { const j = JSON.parse(bodyText); msg = j.message || j.error || msg; } catch { /* keep raw */ }
    throw new Error(`YouGile API error ${resp.status}: ${msg}`);
  }
  if (LOG_BODIES) log.debug(`RESPONSE ${resp.status}: ${bodyText.slice(0, 2000)}`);
  return bodyText ? JSON.parse(bodyText) : { success: true };
}
