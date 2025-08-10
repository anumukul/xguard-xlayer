import crypto from "crypto";

const BASE_URL = process.env.OKX_BASE_URL || "https://web3.okx.com/api/v5";

function isoTs() {
  return new Date().toISOString();
}

function sign(message: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(message).digest("base64");
}

function buildHeaders(method: string, path: string, bodyOrQuery = "") {
  const ts = isoTs();
  const prehash = `${ts}${method.toUpperCase()}${path}${bodyOrQuery}`;
  const signature = sign(prehash, process.env.OKX_API_SECRET || "");
  return {
    "OK-ACCESS-KEY": process.env.OKX_API_KEY || "",
    "OK-ACCESS-SIGN": signature,
    "OK-ACCESS-TIMESTAMP": ts,
    "OK-ACCESS-PASSPHRASE": process.env.OKX_API_PASSPHRASE || "",
    "OK-ACCESS-PROJECT": process.env.OKX_PROJECT_ID || "",
    "Content-Type": "application/json"
  };
}

export async function okxGet(path: string, query: Record<string, any>) {
  const qs = "?" + new URLSearchParams(
    Object.fromEntries(
      Object.entries(query).filter(([_, v]) => v !== undefined && v !== null && v !== "")
    ) as Record<string, string>
  ).toString();

  const headers = buildHeaders("GET", path, qs);
  const res = await fetch(BASE_URL + path + qs, {
    method: "GET",
    headers,
    
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OKX GET ${path} ${res.status}: ${text}`);
  }
  return res.json();
}

export async function okxPost(path: string, payload: any) {
  const body = JSON.stringify(payload ?? {});
  const headers = buildHeaders("POST", path, body);
  const res = await fetch(BASE_URL + path, {
    method: "POST",
    headers,
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OKX POST ${path} ${res.status}: ${text}`);
  }
  return res.json();
}