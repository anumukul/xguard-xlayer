import { NextRequest, NextResponse } from "next/server";
import { okxGet } from "@/lib/okx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const chainId = searchParams.get("chainId") ?? "195";
    const fromTokenAddress = searchParams.get("fromTokenAddress");
    const toTokenAddress = searchParams.get("toTokenAddress");
    const amount = searchParams.get("amount");
    const slippage = searchParams.get("slippage") ?? "50";

    if (!fromTokenAddress || !toTokenAddress || !amount) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
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
    return NextResponse.json({ error: e?.message || "Quote failed" }, { status: 500 });
  }
}