import { NextRequest, NextResponse } from "next/server";
import { okxGet } from "@/lib/okx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const chainId = sp.get("chainId");
    const fromTokenAddress = sp.get("fromTokenAddress");
    const toTokenAddress = sp.get("toTokenAddress");
    const amount = sp.get("amount");
    const slippage = sp.get("slippage") ?? "50"; 

    if (!chainId || !fromTokenAddress || !toTokenAddress || !amount) {
      return NextResponse.json(
        { error: "Missing required query params: chainId, fromTokenAddress, toTokenAddress, amount" },
        { status: 400 }
      );
    }

    const data = await okxGet("/dex/aggregator/quote", {
      chainId,
      fromTokenAddress,
      toTokenAddress,
      amount,
      slippage,
    });

    return NextResponse.json(data, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Unknown error" }, { status: 500 });
  }
}