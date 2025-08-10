import { NextRequest, NextResponse } from "next/server";
import { okxGet } from "@/lib/okx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const chainId = searchParams.get("chainId");
    const tokenContractAddress = searchParams.get("tokenContractAddress");
    const owner = searchParams.get("owner");
    const spender = searchParams.get("spender");
    if (!chainId || !tokenContractAddress || !owner || !spender) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
    }

    const data = await okxGet("/dex/aggregator/approve/allowance", {
      chainId, tokenContractAddress, owner, spender,
    });
    return NextResponse.json(data, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Allowance failed" }, { status: 500 });
  }
}