import type { Address } from "viem";

export type SafetyIssue = { severity: "low" | "medium" | "high"; message: string };
export type SafetyResult = { score: number; level: "low" | "medium" | "high"; issues: SafetyIssue[] };

export type SafetyInputs = {
  publicClient: any;
  chainId: number;
  expectedChainId: number;
  fromToken?: Address | null;
  toToken?: Address | null;
  spender?: Address | null;
  slippageBps?: number;
  approveData?: `0x${string}` | null;
  quote?: any;
};

const APPROVE_SELECTOR = "0x095ea7b3";
const UINT256_MAX = (1n << 256n) - 1n;
const INFINITE_THRESHOLD = (1n << 255n); 

export async function assessSafety(input: SafetyInputs): Promise<SafetyResult> {
  let score = 100;
  const issues: SafetyIssue[] = [];

  
  if (input.chainId !== input.expectedChainId) {
    issues.push({ severity: "high", message: `Wallet on chainId ${input.chainId}, expected ${input.expectedChainId}` });
    score -= 40;
  }


  const s = input.slippageBps ?? 50;
  if (s > 500) {
    issues.push({ severity: "high", message: `High slippage: ${bpsToPct(s)}% (>5.00%)` });
    score -= 30;
  } else if (s > 300) {
    issues.push({ severity: "medium", message: `Elevated slippage: ${bpsToPct(s)}% (>3.00%)` });
    score -= 15;
  } else if (s > 100) {
    issues.push({ severity: "low", message: `Moderate slippage: ${bpsToPct(s)}% (>1.00%)` });
    score -= 5;
  }


  if (input.spender) {
    try {
      const code = await input.publicClient.getBytecode({ address: input.spender });
      if (!code || code === "0x") {
        issues.push({ severity: "high", message: `Spender has no bytecode (EOA?): ${short(input.spender)}` });
        score -= 30;
      }
    } catch {
      issues.push({ severity: "medium", message: `Could not read bytecode for spender ${short(input.spender)}` });
      score -= 10;
    }
  } else {
    issues.push({ severity: "medium", message: "Unknown spender address for approval" });
    score -= 10;
  }


  for (const [label, addr] of [
    ["From token", input.fromToken],
    ["To token", input.toToken],
  ] as const) {
    if (!addr) {
      issues.push({ severity: "medium", message: `${label} not set` });
      score -= 10;
      continue;
    }
    try {
      const code = await input.publicClient.getBytecode({ address: addr });
      if (!code || code === "0x") {
        issues.push({ severity: "high", message: `${label} has no bytecode (not a contract): ${short(addr)}` });
        score -= 25;
      }
    } catch {
      issues.push({ severity: "medium", message: `Could not read bytecode for ${label.toLowerCase()} ${short(addr)}` });
      score -= 10;
    }
  }

  
  const approveInfo = parseApprove(input.approveData);
  if (approveInfo) {
    if (approveInfo.amount === UINT256_MAX || approveInfo.amount >= INFINITE_THRESHOLD) {
      issues.push({ severity: "medium", message: "Approve sets unlimited allowance (max uint256)" });
      score -= 15;
    }
  }

  
  const priceImpactPct = getPriceImpactPct(input.quote);
  if (priceImpactPct !== undefined) {
    if (priceImpactPct > 5) {
      issues.push({ severity: "high", message: `High price impact: ${priceImpactPct.toFixed(2)}%` });
      score -= 30;
    } else if (priceImpactPct > 2) {
      issues.push({ severity: "medium", message: `Elevated price impact: ${priceImpactPct.toFixed(2)}%` });
      score -= 15;
    } else if (priceImpactPct > 1) {
      issues.push({ severity: "low", message: `Price impact: ${priceImpactPct.toFixed(2)}%` });
      score -= 5;
    }
  }

  
  if (score < 0) score = 0;
  let level: "low" | "medium" | "high" = "low";
  if (score < 60) level = "high";
  else if (score < 80) level = "medium";

  return { score, level, issues };
}

function parseApprove(data?: `0x${string}` | null):
  | { spender: `0x${string}`; amount: bigint }
  | null {
  if (!data || !data.startsWith(APPROVE_SELECTOR)) return null;
  
  const raw = data.slice(10);
  const pSpender = raw.slice(0, 64);
  const pAmount = raw.slice(64, 128);

  const spender = ("0x" + pSpender.slice(24)) as `0x${string}`;
  const amount = BigInt("0x" + pAmount);
  return { spender, amount };
}

function getPriceImpactPct(quote: any): number | undefined {
  if (!quote) return undefined;

  const candidates = [
    quote?.data?.priceImpact,
    quote?.priceImpact,
    quote?.result?.priceImpact,
    quote?.tx?.priceImpact,
  ];
  for (const c of candidates) {
    if (typeof c === "number") {
      return c > 1 ? c : c * 100; 
    }
    if (typeof c === "string" && c.trim() !== "") {
      const n = Number(c);
      if (!Number.isNaN(n)) return n;
    }
    if (typeof c === "object" && c?.bps) {
      const n = Number(c.bps);
      if (!Number.isNaN(n)) return n / 100; 
    }
  }
  return undefined;
}

function bpsToPct(bps: number) {
  return (bps / 100).toFixed(2);
}

function short(addr: string) {
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}