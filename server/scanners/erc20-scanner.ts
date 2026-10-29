import type { RechargeScanTarget } from "../db-recharge";
import { scanEvmUsdtTransactions } from "./evm-usdt-scanner";

const ETHEREUM_RPC_URLS = Array.from(new Set([
  process.env.ETHEREUM_RPC_URL,
  "https://ethereum-rpc.publicnode.com",
  "https://cloudflare-eth.com",
].filter((url): url is string => Boolean(url))));
const USDT_ERC20_CONTRACT = "0xdac17f958d2ee523a2206206994597c13d831ec7";

export async function scanERC20Transactions(targets?: RechargeScanTarget[]) {
  return scanEvmUsdtTransactions({
    network: "ERC20",
    label: "ERC20",
    rpcUrls: ETHEREUM_RPC_URLS,
    contractAddress: USDT_ERC20_CONTRACT,
    decimals: 6,
    minConfirmations: 12,
    lookbackBlocks: 3_000,
  }, targets);
}
