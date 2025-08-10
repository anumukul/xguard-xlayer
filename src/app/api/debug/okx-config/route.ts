import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const base = (process.env.OKX_BASE_URL || "https://www.okx.com").trim().replace(/\/+$/, "");
  return NextResponse.json({
    base,
    apiPrefix: "/api/v5",
    finalExampleUrl: `${base}/api/v5/web3/dex/aggregator/quote`,
  });
}