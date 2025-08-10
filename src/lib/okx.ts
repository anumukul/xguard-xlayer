import crypto from "node:crypto";

const BASE = (process.env.OKX_BASE_URL || "https://www.okx.com").trim().replace(/\/+$/, "");
const API_PREFIX = "/api/v5";


try {
  const p = new URL(BASE).pathname.replace(/\/+$/, "");
  if (p && /\/api(\/|$)/i.test(p)) {
    throw new Error(`OKX_BASE_URL must NOT include '/api'. Use host only, e.g. 'https://www.okx.com' or 'https://web3.okx.com'. Current: ${BASE}`);
  }
} catch {

}

const KEY = (process.env.OKX_API_KEY || "").trim();
const SECRET = (process.env.OKX_API_SECRET || "").trim();
const PASSPHRASE = (process.env.OKX_API_PASSPHRASE || "").trim();
const PROJECT_ID = (process.env.OKX_PROJECT_ID || "").trim();

function normalizeApiPath(path: string): string {
  
  if (/^https?:\/\//i.test(path)) path = new URL(path).pathname;
  path = path.trim();


  const stripped = path.replace(/^\/+/, "");
  if (/^api\/v\d+\//i.test(stripped)) {
    throw new Error(`Do not include '/api/v5' in path. Pass '/web3/...' instead. Received: '${path}'`);
  }

  if (!path.startsWith("/")) path = `/${path}`;
  return path;
}

function buildHeaders(method: "GET" | "POST", requestPathWithQuery: string, bodyJson?: any) {
  const body = bodyJson ? JSON.stringify(bodyJson) : "";
  const timestamp = new Date().toISOString();
  const prehash = `${timestamp}${method}${requestPathWithQuery}${body}`;
  const signature = crypto.createHmac("sha256", SECRET).update(prehash).digest("base64");

  const headers: Record<string, string> = {
    "OK-ACCESS-KEY": KEY,
    "OK-ACCESS-SIGN": signature,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": PASSPHRASE,
    "Content-Type": "application/json",
  };
  if (PROJECT_ID) headers["OK-ACCESS-PROJECT"] = PROJECT_ID;
  return { headers, body };
}

async function okxRequest<T = any>(
  method: "GET" | "POST",
  path: string,
  params?: Record<string, any>,
  bodyJson?: any
): Promise<T> {
  const qs = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && String(v) !== "") qs.append(k, String(v));
    }
  }

  const normalizedPath = normalizeApiPath(path); 
  const requestPath = `${API_PREFIX}${normalizedPath}${qs.size ? `?${qs.toString()}` : ""}`;
  const url = `${BASE}${requestPath}`;

  if (!KEY || !SECRET || !PASSPHRASE || !PROJECT_ID) {
    throw new Error("Missing OKX credentials: set OKX_API_KEY, OKX_API_SECRET, OKX_API_PASSPHRASE, OKX_PROJECT_ID");
  }

  const { headers, body } = buildHeaders(method, requestPath, bodyJson);

  const res = await fetch(url, {
    method,
    headers,
    body: method === "POST" ? body : undefined,
    cache: "no-store",
    next: { revalidate: 0 },
  });

  const text = await res.text();
  let json: any;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }

  if (!res.ok) {
    const msg = json?.msg || json?.error || json?.message || `OKX ${method} ${path} failed (${res.status})`;
    throw new Error(`${msg}: ${JSON.stringify(json)}`);
  }
  return json as T;
}

export function okxGet<T = any>(path: string, params?: Record<string, any>) {
  return okxRequest<T>("GET", path, params);
}
export function okxPost<T = any>(path: string, body?: any) {
  return okxRequest<T>("POST", path, undefined, body);
}