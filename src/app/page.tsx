"use client";

import { useEffect, useMemo, useState } from "react";
import { formatUnits, parseUnits, zeroAddress } from "viem";
import { useAccount, useBalance, useConnect, useDisconnect, usePublicClient, useWalletClient } from "wagmi";
import { injected } from "wagmi/connectors";
import { ERC20_ABI } from "@/lib/erc20";

const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || "195");

type TxPayload = {
  to?: `0x${string}`;
  data?: `0x${string}`;
  value?: string | bigint | null;
  gas?: string | bigint | null;
  gasPrice?: string | bigint | null;
};

function extractTx(res: any): TxPayload {
  
  const cand = res?.data || res?.result || res?.tx || res?.transaction || res;
  const paths = [cand, cand?.tx, cand?.transaction, res?.data?.tx, res?.data?.transaction];
  for (const c of paths) {
    if (c && c.to && c.data) {
      return {
        to: c.to,
        data: c.data,
        value: c.value ?? null,
        gas: c.gas ?? null,
        gasPrice: c.gasPrice ?? null,
      };
    }
  }
  
  if (cand && typeof cand === "object") {
    const first = Object.values(cand).find((v: any) => v && v.to && v.data);
    if (first) {
      return {
        to: first.to,
        data: first.data,
        value: first.value ?? null,
        gas: first.gas ?? null,
        gasPrice: first.gasPrice ?? null,
      };
    }
  }
  return {};
}

export default function Home() {
  const [fromTokenAddress, setFromTokenAddress] = useState("");
  const [toTokenAddress, setToTokenAddress] = useState("");
  const [amount, setAmount] = useState("0.01");
  const [slippage, setSlippage] = useState("50"); // bps
  const [quote, setQuote] = useState<any>(null);
  const [approveResp, setApproveResp] = useState<any>(null);
  const [swapResp, setSwapResp] = useState<any>(null);
  const [spender, setSpender] = useState<`0x${string}` | null>(null);
  const [decimals, setDecimals] = useState<number>(18);
  const [symbol, setSymbol] = useState<string>("TOKEN");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { data: bal } = useBalance({ address, query: { enabled: !!address } });


  useEffect(() => {
    async function run() {
      setDecimals(18);
      setSymbol("TOKEN");
      if (!publicClient || !fromTokenAddress || fromTokenAddress === zeroAddress) return;
      try {
        const [d, s] = await Promise.all([
          publicClient.readContract({ abi: ERC20_ABI as any, address: fromTokenAddress as `0x${string}`, functionName: "decimals" }),
          publicClient.readContract({ abi: ERC20_ABI as any, address: fromTokenAddress as `0x${string}`, functionName: "symbol" }),
        ]);
        setDecimals(Number(d));
        setSymbol(String(s));
      } catch {
        
      }
    }
    run();
  }, [publicClient, fromTokenAddress]);

  async function getQuote() {
    setStatus("Fetching quote..."); setError(null);
    try {
      const url = `/api/okx/quote?chainId=${CHAIN_ID}&fromTokenAddress=${fromTokenAddress}&toTokenAddress=${toTokenAddress}&amount=${amount}&slippage=${slippage}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Quote failed");
      setQuote(json);
      setStatus("Quote OK");
    } catch (e: any) {
      setError(e.message);
      setQuote(null);
      setStatus(null);
    }
  }

  async function getApprove() {
    setStatus("Fetching approve tx..."); setError(null);
    try {
      const url = `/api/okx/approve?chainId=${CHAIN_ID}&tokenContractAddress=${fromTokenAddress}&approveAmount=${amount}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Approve tx fetch failed");
      setApproveResp(json);

      // Try to read spender from response (OKX usually provides it)
      const s = json?.data?.spender || json?.spender || json?.result?.spender || json?.tx?.to || json?.to;
      if (s) setSpender(s);
      setStatus("Approve tx ready");
    } catch (e: any) {
      setError(e.message);
      setApproveResp(null);
      setStatus(null);
    }
  }

  async function getSwap() {
    setStatus("Fetching swap tx..."); setError(null);
    try {
      const url = `/api/okx/swap?chainId=${CHAIN_ID}&fromTokenAddress=${fromTokenAddress}&toTokenAddress=${toTokenAddress}&amount=${amount}&userWalletAddress=${address}&slippage=${slippage}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Swap tx fetch failed");
      setSwapResp(json);
      setStatus("Swap tx ready");
    } catch (e: any) {
      setError(e.message);
      setSwapResp(null);
      setStatus(null);
    }
  }

  const approveTx = useMemo(() => extractTx(approveResp), [approveResp]);
  const swapTx = useMemo(() => extractTx(swapResp), [swapResp]);

  const parsedAmount = useMemo(() => {
    try { return parseUnits(amount || "0", decimals); } catch { return 0n; }
  }, [amount, decimals]);

  const [allowance, setAllowance] = useState<bigint | null>(null);
  async function checkAllowance() {
    if (!publicClient || !address || !spender || !fromTokenAddress || fromTokenAddress === zeroAddress) return;
    try {
      const value = await publicClient.readContract({
        abi: ERC20_ABI as any,
        address: fromTokenAddress as `0x${string}`,
        functionName: "allowance",
        args: [address, spender],
      });
      setAllowance(value as bigint);
    } catch (e: any) {
      setError(`Allowance read failed: ${e.message}`);
    }
  }

  async function sendApprove() {
    if (!walletClient || !address) return;
    if (!approveTx?.to || !approveTx?.data) {
      setError("Approve tx payload missing to/data");
      return;
    }
    setStatus("Sending approve...");
    setError(null);
    try {
      const hash = await walletClient.sendTransaction({
        account: address,
        to: approveTx.to,
        data: approveTx.data,
        value: approveTx.value ? BigInt(approveTx.value) : undefined,
        chain: walletClient.chain,
      });
      setStatus(`Approve sent: ${hash}`);
      const receipt = await publicClient!.waitForTransactionReceipt({ hash });
      setStatus(`Approve confirmed in block ${receipt.blockNumber}`);
      await checkAllowance();
    } catch (e: any) {
      setError(e.message);
      setStatus(null);
    }
  }

  async function sendSwap() {
    if (!walletClient || !address) return;
    if (!swapTx?.to || !swapTx?.data) {
      setError("Swap tx payload missing to/data");
      return;
    }
    setStatus("Sending swap...");
    setError(null);
    try {
      const valueBN = typeof swapTx.value === "string" ? BigInt(swapTx.value) : (typeof swapTx.value === "bigint" ? swapTx.value : 0n);
      const hash = await walletClient.sendTransaction({
        account: address,
        to: swapTx.to,
        data: swapTx.data,
        value: valueBN && valueBN > 0n ? valueBN : undefined,
        chain: walletClient.chain,
      });
      setStatus(`Swap sent: ${hash}`);
      const receipt = await publicClient!.waitForTransactionReceipt({ hash });
      setStatus(`Swap confirmed in block ${receipt.blockNumber}`);
    } catch (e: any) {
      setError(e.message);
      setStatus(null);
    }
  }

  useEffect(() => { if (isConnected && chainId !== CHAIN_ID) {
    setError(`Please switch network to chainId ${CHAIN_ID}`);
  } }, [isConnected, chainId]);

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto", display: "grid", gap: 16 }}>
      <h1>XGuard — Wallet + Approval + Swap</h1>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {!isConnected ? (
          <button onClick={() => connect({ connector: injected() })}>Connect Wallet</button>
        ) : (
          <>
            <span>Connected: {address?.slice(0, 6)}...{address?.slice(-4)}</span>
            <button onClick={() => disconnect()}>Disconnect</button>
          </>
        )}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <label>Chain ID (expect {CHAIN_ID}) — Wallet: {chainId ?? "n/a"}</label>
        <input placeholder="From token address (ERC20)" value={fromTokenAddress} onChange={e => setFromTokenAddress(e.target.value as `0x${string}`)} />
        <input placeholder="To token address (ERC20)" value={toTokenAddress} onChange={e => setToTokenAddress(e.target.value as `0x${string}`)} />
        <input placeholder={`Amount in ${symbol} (e.g., 0.01)`} value={amount} onChange={e => setAmount(e.target.value)} />
        <input placeholder="Slippage (bps, 50 = 0.50%)" value={slippage} onChange={e => setSlippage(e.target.value)} />
        <div>Wallet balance: {bal ? `${formatUnits(bal.value, bal.decimals)} ${bal.symbol}` : "—"}</div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={getQuote}>Get Quote</button>
        <button onClick={getApprove}>Get Approval TX</button>
        <button onClick={checkAllowance} disabled={!spender || !fromTokenAddress}>Check Allowance</button>
        <button onClick={sendApprove} disabled={!approveTx?.to || !approveTx?.data || !isConnected}>Send Approve</button>
        <button onClick={getSwap}>Get Swap TX</button>
        <button onClick={sendSwap} disabled={!swapTx?.to || !swapTx?.data || !isConnected}>Send Swap</button>
      </div>

      {spender && allowance !== null && (
        <div>Allowance for spender {spender.slice(0, 6)}...{spender.slice(-4)}: {formatUnits(allowance, decimals)} {symbol}</div>
      )}

      {status && <div style={{ color: "seagreen" }}>{status}</div>}
      {error && <div style={{ color: "crimson" }}>Error: {error}</div>}

      <div style={{ display: "grid", gap: 8 }}>
        <details>
          <summary>Quote response</summary>
          <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(quote, null, 2)}</pre>
        </details>
        <details>
          <summary>Approve response</summary>
          <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(approveResp, null, 2)}</pre>
        </details>
        <details>
          <summary>Swap response</summary>
          <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(swapResp, null, 2)}</pre>
        </details>
    </main>
  );
}