# XGuard — Simulate‑Before‑Sign Swaps on X Layer

Security‑first swap dApp:

- Fetch best routes via OKX DEX API
- Simulate before signing + Safety Score
- Execute swap on X Layer with live inclusion (WS) and zkEVM finality

## Stack

Next.js + React + TypeScript + Wagmi + Ethers + Viem + Axios + Zustand

## Quick start

1. Copy `.env.example` → `.env.local` and fill in your OKX credentials
2. npm i
3. npm run dev
4. Open http://localhost:3000

Endpoints in use (upcoming steps)

- GET /dex/aggregator/approve-transaction
- GET /dex/aggregator/quote
- GET /dex/aggregator/swap
- POST /dex/pre-transaction/gas-limit
- POST /dex/pre-transaction/simulate (fallback to eth_call if unavailable)

X Layer

- RPC: https://xlayertestrpc.okx.com
- WSS: wss://xlayertestws.okx.com
- zkEVM RPC: zkevm_virtualBatchNumber, zkevm_verifiedBatchNumber
- Gas Station (testnet): https://testrpc.xlayer.tech/gasstation
