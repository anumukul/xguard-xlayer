import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const base = (process.env.OKX_BASE_URL || "https://www.okx.com").trim().replace(/\/+$/, "");
  const url = `${base}/api/v5/public/time`;
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return NextResponse.json({ base, url, status: res.status, body: json });
}