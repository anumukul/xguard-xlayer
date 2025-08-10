import type { Address } from "viem";

export type TxLike = {
  to?: Address;
  data?: `0x${string}`;
  value?: bigint | string | null;
};

export type SimResult = {
  ok: boolean;
  gas?: bigint;
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  fee?: bigint;
  callSuccess: boolean;
  callRevertReason?: string;
  error?: string;
};

export async function simulateTx(publicClient: any, account: Address, tx: TxLike): Promise<SimResult> {
  try {
    if (!tx?.to || !tx?.data) {
      return { ok: false, callSuccess: false, error: "Missing to/data for simulation" };
    }

    
    const valueBN =
      typeof tx.value === "bigint"
        ? tx.value
        : typeof tx.value === "string" && tx.value
        ? BigInt(tx.value)
        : 0n;

   
    const gas = await publicClient.estimateGas({
      account,
      to: tx.to,
      data: tx.data,
      value: valueBN > 0n ? valueBN : undefined,
    });

   
    let maxFeePerGas: bigint | undefined;
    let maxPriorityFeePerGas: bigint | undefined;
    let gasPrice: bigint | undefined;

    try {
      const fees = await publicClient.estimateFeesPerGas();
      maxFeePerGas = fees.maxFeePerGas;
      maxPriorityFeePerGas = fees.maxPriorityFeePerGas;
    } catch {
      
      gasPrice = await publicClient.getGasPrice();
    }

    const effectivePrice = maxFeePerGas ?? gasPrice ?? 0n;
    const fee = gas * effectivePrice;

    
    let callSuccess = false;
    let callRevertReason: string | undefined;
    try {
      await publicClient.call({
        account,
        to: tx.to,
        data: tx.data,
        value: valueBN > 0n ? valueBN : undefined,
      });
      callSuccess = true;
    } catch (e: any) {
      callSuccess = false;
      callRevertReason = extractRevertMessage(e);
    }

    return {
      ok: true,
      gas,
      gasPrice,
      maxFeePerGas,
      maxPriorityFeePerGas,
      fee,
      callSuccess,
      callRevertReason,
    };
  } catch (e: any) {
    return {
      ok: false,
      callSuccess: false,
      error: e?.message || "Simulation failed",
    };
  }
}

function extractRevertMessage(e: any): string | undefined {
  
  const m = e?.shortMessage || e?.message;
  const dataMsg = e?.cause?.reason || e?.cause?.message || e?.data?.message;
  if (dataMsg) return String(dataMsg);
  if (m) return String(m);
  try {
    const js = typeof e === "string" ? JSON.parse(e) : e;
    return js?.error?.message || js?.message;
  } catch {
    return undefined;
  }
}