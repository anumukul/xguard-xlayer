import { NextRequest, NextResponse } from "next/server";
import { okxGet } from "@/lib/okx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const chainId = sp.get("chainId");
    const tokenContractAddress = sp.get("tokenContractAddress");
    const approveAmount = sp.get("approveAmount");

    if (!chainId || !tokenContractAddress || !approveAmount) {
      return NextResponse.json(
        { error: "Missing required query params: chainId, tokenContractAddress, approveAmount" },
        { status: 400 }
      );
    }

    const data = await okxGet("/dex/aggregator/approve-transaction", {
      chainId,
      tokenContractAddress,
      approveAmount,
    });

    return NextResponse.json(data, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Unknown error" }, { status: 500 });
  }
}