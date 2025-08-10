import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const localISO = new Date().toISOString();
  const res = await fetch("https://www.okx.com/api/v5/public/time", { cache: "no-store" });
  const js = await res.json().catch(() => ({}));
  const serverMs = Number(js?.data?.[0]?.ts || js?.ts || 0);
  const serverISO = isFinite(serverMs) ? new Date(serverMs).toISOString() : null;
  const deltaMs = serverISO ? Math.abs(new Date(localISO).getTime() - serverMs) : null;
  return NextResponse.json({ localISO, serverISO, deltaMs });
}