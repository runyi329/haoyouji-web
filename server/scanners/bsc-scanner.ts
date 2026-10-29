import type { RechargeScanTarget } from "../db-recharge";
import { scanEvmUsdtTransactions } from "./evm-usdt-scanner";

const BSC_RPC_URLS = Array.from(new Set([
  process.env.BSC_RPC_URL,
  "https://bsc-rpc.publicnode.com",
  "https://bsc-dataseed.binance.org/",
].filter((url): url is string => Boolean(url))));
const USDT_BEP20_CONTRACT = "0x55d398326f99059ff775485246999027b3197955";

export async function scanBSCTransactions(targets?: RechargeScanTarget[]) {
  return scanEvmUsdtTransactions({
    network: "BEP20",
    label: "BEP20",
    rpcUrls: BSC_RPC_URLS,
    contractAddress: USDT_BEP20_CONTRACT,
    decimals: 18,
    minConfirmations: 15,
    lookbackBlocks: 12_000,
  }, targets);
}
