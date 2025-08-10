import { Chain } from "viem";

export const xLayerTestnet: Chain = {
  id: 195,
  name: "X Layer Testnet",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_XLAYER_RPC || "https://xlayertestrpc.okx.com"] },
    public: { http: [process.env.NEXT_PUBLIC_XLAYER_RPC || "https://xlayertestrpc.okx.com"] },
  },
  blockExplorers: {
    default: { name: "OKLink", url: "https://www.oklink.com/xlayer-test" },
  },
};