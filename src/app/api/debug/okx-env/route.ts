import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    OKX_BASE_URL: !!process.env.OKX_BASE_URL,
    OKX_API_KEY: !!process.env.OKX_API_KEY,
    OKX_API_SECRET: !!process.env.OKX_API_SECRET,
    OKX_API_PASSPHRASE: !!process.env.OKX_API_PASSPHRASE,
    OKX_PROJECT_ID: !!process.env.OKX_PROJECT_ID,
  });
}