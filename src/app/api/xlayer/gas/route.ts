import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const XLAYER_RPC = process.env.XLAYER_RPC_URL?.trim() || "https://rpc.xlayer.tech";

export async function GET() {
  try {
    const res = await fetch(XLAYER_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_gasPrice",
        params: [],
      }),
      cache: "no-store",
    });

    const json = await res.json();
    if (!res.ok || json?.error) {
      return NextResponse.json({ error: json?.error || "eth_gasPrice failed" }, { status: 500 });
    }

    const gasPriceHex: string = json.result; 
    const gasPriceWei = BigInt(gasPriceHex);
    return NextResponse.json({
      gasPriceWei: gasPriceWei.toString(),
      gasPriceGwei: Number(gasPriceWei) / 1e9,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Gas price fetch failed" }, { status: 500 });
  }
}