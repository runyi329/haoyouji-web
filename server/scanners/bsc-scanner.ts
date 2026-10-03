import type { RechargeScanTarget } from "../db-recharge";
import { scanEvmUsdtTransactions } from "./evm-usdt-scanner";

const BSC_RPC_URL = process.env.BSC_RPC_URL || "https://bsc-rpc.publicnode.com";
const USDT_BEP20_CONTRACT = "0x55d398326f99059ff775485246999027b3197955";

export async function scanBSCTransactions(targets?: RechargeScanTarget[]) {
  return scanEvmUsdtTransactions({
    network: "BEP20",
    label: "BEP20",
    rpcUrl: BSC_RPC_URL,
    contractAddress: USDT_BEP20_CONTRACT,
    decimals: 18,
    minConfirmations: 15,
    lookbackBlocks: 12_000,
  }, targets);
}
