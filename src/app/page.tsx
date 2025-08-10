"use client";

import { useEffect, useMemo, useState } from "react";
import { formatUnits, parseUnits, zeroAddress } from "viem";
import { useAccount, useBalance, useConnect, useDisconnect, usePublicClient, useWalletClient } from "wagmi";
import { injected } from "wagmi/connectors";
import { ERC20_ABI } from "@/lib/erc20";
import { simulateTx, type SimResult } from "@/lib/sim";
import { assessSafety, type SafetyResult } from "@/lib/safety";

const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || "195");
const FINALITY_CONFS = 12n;

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

  const [simApprove, setSimApprove] = useState<SimResult | null>(null);
  const [simSwap, setSimSwap] = useState<SimResult | null>(null);
  const [safety, setSafety] = useState<SafetyResult | null>(null);

  const [approveConf, setApproveConf] = useState<number>(0);
  const [swapConf, setSwapConf] = useState<number>(0);

  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { data: bal } = useBalance({ address, query: { enabled: !!address } });

  // Fetch token metadata
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
        // ignore
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
      await runSafety();
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

      const s = json?.data?.spender || json?.spender || json?.result?.spender || json?.tx?.to || json?.to;
      if (s) setSpender(s);
      setStatus("Approve tx ready");

      // Auto simulate + safety
      await simulateApprove();
      await runSafety();
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

      // Auto simulate + safety
      await simulateSwap();
      await runSafety();
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

  async function simulateApprove() {
    if (!publicClient || !address) return;
    const tx = approveTx;
    if (!tx?.to || !tx?.data) return;
    const res = await simulateTx(publicClient, address, tx);
    setSimApprove(res);
  }

  async function simulateSwap() {
    if (!publicClient || !address) return;
    const tx = swapTx;
    if (!tx?.to || !tx?.data) return;
    const res = await simulateTx(publicClient, address, tx);
    setSimSwap(res);
  }

  async function runSafety() {
    if (!publicClient) return;
    try {
      const result = await assessSafety({
        publicClient,
        chainId: chainId ?? 0,
        expectedChainId: CHAIN_ID,
        fromToken: fromTokenAddress as `0x${string}`,
        toToken: toTokenAddress as `0x${string}`,
        spender,
        slippageBps: Number(slippage || "0"),
        approveData: (approveTx?.data as `0x${string}`) || null,
        quote,
      });
      setSafety(result);
    } catch (e: any) {
      setError(`Safety check failed: ${e.message}`);
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
      setApproveConf(0);
      trackFinality(receipt.blockNumber);
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
      setSwapConf(0);
      trackFinality(receipt.blockNumber, "swap");
    } catch (e: any) {
      setError(e.message);
      setStatus(null);
    }
  }

  function trackFinality(baseBlock: bigint, which: "approve" | "swap" = "approve") {
    if (!publicClient) return;
    const interval = setInterval(async () => {
      try {
        const cur = await publicClient.getBlockNumber();
        const confs = Number(cur - baseBlock);
        if (which === "approve") setApproveConf(confs);
        else setSwapConf(confs);
        if (cur - baseBlock >= FINALITY_CONFS) clearInterval(interval);
      } catch {
        // ignore
      }
    }, 1500);
  }

  useEffect(() => { if (isConnected && chainId !== CHAIN_ID) {
    setError(`Please switch network to chainId ${CHAIN_ID}`);
  } }, [isConnected, chainId]);

  function renderSim(sim: SimResult | null) {
    if (!sim) return <div>—</div>;
    const fee = sim.fee ?? 0n;
    return (
      <div style={{ display: "grid", gap: 4 }}>
        <div>Gas estimate: {sim.gas?.toString() ?? "—"}</div>
        <div>Fee price: {sim.maxFeePerGas ? `${formatUnits(sim.maxFeePerGas, 18)} OKB/gas (maxFeePerGas)` : sim.gasPrice ? `${formatUnits(sim.gasPrice, 18)} OKB/gas (gasPrice)` : "—"}</div>
        <div>Estimated fee: {sim.fee ? `${formatUnits(fee, 18)} OKB` : "—"}</div>
        <div>eth_call: {sim.callSuccess ? "success" : `revert${sim.callRevertReason ? `: ${sim.callRevertReason}` : ""}`}</div>
        {!sim.ok && sim.error && <div style={{ color: "crimson" }}>Sim error: {sim.error}</div>}
      </div>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto", display: "grid", gap: 16 }}>
      <h1>XGuard — Simulate, Safety, and Finality</h1>

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
        <button onClick={simulateApprove} disabled={!address || !approveTx?.to || !approveTx?.data}>Simulate Approve</button>
        <button onClick={sendApprove} disabled={!isConnected || !approveTx?.to || !approveTx?.data}>Send Approve</button>
        <button onClick={getSwap}>Get Swap TX</button>
        <button onClick={simulateSwap} disabled={!address || !swapTx?.to || !swapTx?.data}>Simulate Swap</button>
        <button onClick={sendSwap} disabled={!isConnected || !swapTx?.to || !swapTx?.data}>Send Swap</button>
      </div>

      {spender && allowance !== null && (
        <div>Allowance for spender {spender.slice(0, 6)}...{spender.slice(-4)}: {formatUnits(allowance, decimals)} {symbol}</div>
      )}

      {safety && (
        <div style={{ border: "1px solid #444", padding: 12, borderRadius: 8 }}>
          <b>Safety Score: {safety.score}/100 ({safety.level})</b>
          <ul style={{ marginTop: 6 }}>
            {safety.issues.map((i, idx) => (
              <li key={idx} style={{ color: i.severity === "high" ? "crimson" : i.severity === "medium" ? "orange" : "inherit" }}>
                [{i.severity}] {i.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <h3>Approve — Simulation</h3>
          {renderSim(simApprove)}
          {approveConf > 0 && (
            <div>Approve confirmations: {approveConf}/{FINALITY_CONFS.toString()} {approveConf >= Number(FINALITY_CONFS) ? "✓ final" : ""}</div>
          )}
        </div>
        <div>
          <h3>Swap — Simulation</h3>
          {renderSim(simSwap)}
          {swapConf > 0 && (
            <div>Swap confirmations: {swapConf}/{FINALITY_CONFS.toString()} {swapConf >= Number(FINALITY_CONFS) ? "✓ final" : ""}</div>
          )}
        </div>
      </div>

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