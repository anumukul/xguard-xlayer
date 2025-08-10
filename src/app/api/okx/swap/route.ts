import { NextRequest, NextResponse } from "next/server";
import { okxGet } from "@/lib/okx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const chainId = searchParams.get("chainId");
    const fromTokenAddress = searchParams.get("fromTokenAddress");
    const toTokenAddress = searchParams.get("toTokenAddress");
    const amount = searchParams.get("amount");
    
    const slippage = searchParams.get("slippage") ?? "0.5";

    
    const userWalletAddress =
      searchParams.get("userWalletAddress") ||
      searchParams.get("userAddress") ||
      "";

    
    const receiverAddress =
      searchParams.get("receiverAddress") ||
      searchParams.get("receiver") ||
      userWalletAddress;

    if (!chainId || !fromTokenAddress || !toTokenAddress || !amount || !userWalletAddress) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
    }

    
    const data = await okxGet("/dex/aggregator/swap", {
      chainId,
      fromTokenAddress,
      toTokenAddress,
      amount,
      slippage,
      userWalletAddress,   
      receiverAddress,     
      swapMode: "exactIn",
    });

    
    console.log("OKX swap raw:", JSON.stringify(data)?.slice(0, 600));

    return NextResponse.json(data, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Swap build failed" }, { status: 500 });
  }
}