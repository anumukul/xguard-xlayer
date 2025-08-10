"use client";
import { useState } from "react";

type OkxToken = {
  tokenContractAddress: string;
  tokenSymbol: string;
  decimal: string | number;
  tokenUnitPrice?: string;
};

type OkxQuoteData = {
  chainId: string;
  fromToken: OkxToken;
  toToken: OkxToken;
  fromTokenAmount: string;   
  toTokenAmount: string;     
  priceImpactPercentage?: string;
  estimateGasFee?: string;  
  dexRouterList?: any[];
  quoteCompareList?: any[];
};

type OkxQuoteResponse = {
  code: string;
  data?: OkxQuoteData[];
  msg?: string;
};

type OkxSwapResponse = any;

function toNumber(x: string | number | undefined, fallback = 0): number {
  if (x === undefined || x === null) return fallback;
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function format(x: number, digits = 6) {
  if (!Number.isFinite(x)) return "-";
  return x.toLocaleString(undefined, { maximumFractionDigits: digits });
}


function extractTx(obj: any) {
  if (!obj) return null;
  const cands = [
    obj?.data?.[0]?.tx,
    obj?.data?.[0]?.transaction,
    obj?.data?.[0]?.txData,
    obj?.data?.tx,
    obj?.tx,
    obj?.transaction,
    obj?.txData,
  ];
  for (const t of cands) {
    if (!t) continue;
    const to = t.to ?? t.target;
    const data = t.data;
    const value = t.value ?? "0";
    if (to && data) return { to, data, value };
  }
  return null;
}

export default function Simulate() {
  
  const [chainId, setChainId] = useState("196");
  const [fromToken, setFromToken] = useState("0x74b7f16337b8972027f6196a17a631ac6de26d22"); 
  const [toToken, setToToken] = useState("0x1e4a5963abfd975d8c9021ce480b42188849d41d");  
  const [amount, setAmount] = useState("10");

  const [slippage, setSlippage] = useState("50");
  const [loading, setLoading] = useState(false);

  const [quote, setQuote] = useState<OkxQuoteData | null>(null);
  const [swapRaw, setSwapRaw] = useState<any | null>(null);
  const [swapTx, setSwapTx] = useState<any | null>(null);
  const [gasGwei, setGasGwei] = useState<number | null>(null);
  const [error, setError] = useState<string>("");

  async function getJson(url: string) {
    const res = await fetch(url, { cache: "no-store" });
    const j = await res.json();
    if (!res.ok || j?.error) throw new Error(j?.error || j?.msg || "Request failed");
    return j;
  }

  async function onSimulate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    setQuote(null);
    setSwapRaw(null);
    setSwapTx(null);
    try {
     
      const slipBpsNum = Number(slippage || "0");
      const slipFraction = (slipBpsNum / 10_000).toString();

   
      const q: OkxQuoteResponse = await getJson(
        `/api/okx/quote?chainId=${chainId}`
        + `&fromTokenAddress=${fromToken}`
        + `&toTokenAddress=${toToken}`
        + `&amount=${amount}`
        + `&slippage=${slipFraction}`
      );
      if (q.code !== "0" || !q.data?.length) throw new Error(q.msg || "No quote");
      const qd = q.data[0];
      setQuote(qd);

     
      const dummy = "0x000000000000000000000000000000000000dEaD";
      const s: OkxSwapResponse = await getJson(
        `/api/okx/swap?chainId=${chainId}`
        + `&fromTokenAddress=${fromToken}`
        + `&toTokenAddress=${toToken}`
        + `&amount=${amount}`
        + `&slippage=${slipFraction}`          
        + `&userWalletAddress=${dummy}`
        + `&receiverAddress=${dummy}`
      );
      setSwapRaw(s);
      setSwapTx(extractTx(s) || null);

      
      const g = await getJson("/api/xlayer/gas");
      setGasGwei(g.gasPriceGwei ?? null);
    } catch (err: any) {
      setError(err?.message || "Simulation failed");
    } finally {
      setLoading(false);
    }
  }


  const toAmt = toNumber(quote?.toTokenAmount);
  const slipBps = toNumber(slippage);
  const minReceived = toAmt * (1 - slipBps / 10000); 
  const priceImpact = toNumber(quote?.priceImpactPercentage);

  const estGasUnits = toNumber(quote?.estimateGasFee);
  const gasPriceGwei = gasGwei ?? undefined;
  const estOkbCost =
    gasPriceGwei && estGasUnits ? (gasPriceGwei / 1e9) * estGasUnits : undefined;

  const routeName =
    quote?.dexRouterList?.[0]?.subRouterList?.[0]?.dexProtocol?.[0]?.dexName ||
    quote?.dexRouterList?.[0]?.subRouterList?.[0]?.dexName ||
    "—";

  const dataHex: string = swapTx?.data || "";
  const dataBytes =
    typeof dataHex === "string"
      ? (dataHex.startsWith("0x") ? (dataHex.length - 2) / 2 : dataHex.length / 2)
      : 0;

  
  const okxMinReceive =
    swapRaw?.data?.[0]?.tx?.minReceiveAmount ??
    swapRaw?.tx?.minReceiveAmount ??
    undefined;
  const okxSlippage =
    swapRaw?.data?.[0]?.tx?.slippage ??
    swapRaw?.tx?.slippage ??
    undefined;
  const okxGas =
    swapRaw?.data?.[0]?.tx?.gas ??
    swapRaw?.tx?.gas ??
    undefined;
  const okxGasPrice =
    swapRaw?.data?.[0]?.tx?.gasPrice ??
    swapRaw?.tx?.gasPrice ??
    undefined;

  
  const looksStablePair =
    (quote?.fromToken.tokenSymbol || "").toUpperCase().includes("USD") &&
    (quote?.toToken.tokenSymbol || "").toUpperCase().includes("USD");
  const largeDeviation =
    looksStablePair && toNumber(quote?.fromTokenAmount) > 0
      ? Math.abs(1 - toAmt / toNumber(quote?.fromTokenAmount)) > 0.02 // >2%
      : false;

  return (
    <main style={{ padding: 24, maxWidth: 960, margin: "0 auto", fontFamily: "sans-serif" }}>
      <h2>Swap Simulation (No Wallet, No Spend)</h2>
      <p>This shows a live OKX DEX quote and a built transaction, but does not send any on-chain tx.</p>

      <form onSubmit={onSimulate} style={{ display: "grid", gap: 12, maxWidth: 720 }}>
        <label>
          Chain ID
          <input value={chainId} onChange={(e) => setChainId(e.target.value)} />
        </label>
        <label>
          From token (0x…)
          <input value={fromToken} onChange={(e) => setFromToken(e.target.value)} />
        </label>
        <label>
          To token (0x…)
          <input value={toToken} onChange={(e) => setToToken(e.target.value)} />
        </label>
        <label>
          Amount (human units)
          <input value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>
          Slippage (bps, 50 = 0.5%)
          <input value={slippage} onChange={(e) => setSlippage(e.target.value)} />
        </label>
        <button disabled={loading} type="submit">
          {loading ? "Simulating..." : "Simulate"}
        </button>
      </form>

      {error && (
        <div style={{ marginTop: 16, color: "crimson" }}>
          Error: {error}
        </div>
      )}

      {quote && (
        <section style={{ marginTop: 24 }}>
          <h3>Quote</h3>
          <div>Route: {routeName}</div>
          <div>From: {quote.fromToken.tokenSymbol} → To: {quote.toToken.tokenSymbol}</div>
          <div>Amount In: {quote.fromTokenAmount}</div>
          <div>Amount Out: {format(toAmt, 6)}</div>
          <div>Min Received (@ slippage {slippage} bps): {format(minReceived, 6)} {quote.toToken.tokenSymbol}</div>
          <div>Price Impact: {format(priceImpact, 3)}%</div>
          <div>Estimated Gas Units: {estGasUnits || "—"}</div>
          <div>Gas Price: {gasPriceGwei ? `${format(gasPriceGwei, 3)} gwei` : "—"}</div>
          <div>Estimated Gas Cost: {estOkbCost !== undefined ? `${format(estOkbCost, 6)} OKB` : "—"}</div>
          {largeDeviation && (
            <div style={{ marginTop: 8, color: "#b58900" }}>
              Heads up: this stable-to-stable quote deviates more than 2%. Try reversing direction or a different amount.
            </div>
          )}
          <details style={{ marginTop: 12 }}>
            <summary>Raw quote JSON</summary>
            <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(quote, null, 2)}</pre>
          </details>
        </section>
      )}

      <section style={{ marginTop: 24 }}>
        <h3>Built Transaction (Not Sent)</h3>
        <div>To (router/spender): <code>{swapTx?.to || "—"}</code></div>
        <div>Value: <code>{swapTx?.value || "0"}</code></div>
        <div>Data bytes: {dataBytes}</div>
        <div>OKX min receive (from tx): <code>{okxMinReceive ?? "—"}</code></div>
        <div>OKX slippage used (fraction): <code>{okxSlippage ?? "—"}</code></div>
        <div>OKX gas limit: <code>{okxGas ?? "—"}</code> | OKX gas price: <code>{okxGasPrice ?? "—"}</code></div>
        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
          <button
            onClick={() => {
              navigator.clipboard.writeText(JSON.stringify(swapTx || {})).catch(() => {});
            }}
          >
            Copy Raw TX JSON
          </button>
          <button
            onClick={() => {
              navigator.clipboard.writeText(String(swapTx?.data || ""));
            }}
          >
            Copy Calldata
          </button>
        </div>
        <details style={{ marginTop: 12 }}>
          <summary>Raw swap JSON</summary>
          <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(swapRaw, null, 2)}</pre>
        </details>
      </section>

      <section style={{ marginTop: 24 }}>
        <h3>Notes</h3>
        <ul>
          <li>This is an offline simulation: no wallet, no OKB, no on-chain transactions.</li>
          <li>UI slippage is in basis points; it is converted to a fraction for the OKX API.</li>
          <li>Gas cost is estimated from quote-provided gas units and live gas price.</li>
          <li>If “To” is still “—”, expand “Raw swap JSON” and share it; we’ll map the fields.</li>
        </ul>
      </section>
    </main>
  );
}