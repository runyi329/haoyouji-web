import type { RechargeScanTarget } from "../db-recharge";
import { scanEvmUsdtTransactions } from "./evm-usdt-scanner";

const ETHEREUM_RPC_URL = process.env.ETHEREUM_RPC_URL || "https://ethereum-rpc.publicnode.com";
const USDT_ERC20_CONTRACT = "0xdac17f958d2ee523a2206206994597c13d831ec7";

export async function scanERC20Transactions(targets?: RechargeScanTarget[]) {
  return scanEvmUsdtTransactions({
    network: "ERC20",
    label: "ERC20",
    rpcUrl: ETHEREUM_RPC_URL,
    contractAddress: USDT_ERC20_CONTRACT,
    decimals: 6,
    minConfirmations: 12,
    lookbackBlocks: 3_000,
  }, targets);
}
