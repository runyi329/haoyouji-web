import * as dbRecharge from "../db-recharge";
import type { RechargeNetwork, RechargeScanTarget } from "../db-recharge";

const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

type ScanStats = {
  scannedAddresses: number;
  foundTransactions: number;
  matchedOrders: number;
  unmatchedTransactions: number;
};

type EvmUsdtScannerConfig = {
  network: Extract<RechargeNetwork, "ERC20" | "BEP20">;
  label: string;
  rpcUrl: string;
  contractAddress: string;
  decimals: number;
  minConfirmations: number;
  lookbackBlocks: number;
};

type RpcResponse<T> = {
  result?: T;
  error?: { message?: string };
};

type EvmLog = {
  address?: string;
  blockNumber?: string;
  data?: string;
  removed?: boolean;
  transactionHash?: string;
};

type EvmBlock = {
  timestamp?: string;
};

function hexToNumber(value: string | undefined): number | null {
  if (!value || !/^0x[0-9a-f]+$/i.test(value)) return null;
  const parsed = Number.parseInt(value, 16);
  return Number.isFinite(parsed) ? parsed : null;
}

function hexToDecimalString(value: string): string | null {
  if (!/^0x[0-9a-f]+$/i.test(value)) return null;
  const hex = value.slice(2).replace(/^0+/, "") || "0";
  const digits: number[] = [0];

  for (const char of hex) {
    let carry = Number.parseInt(char, 16);
    for (let index = 0; index < digits.length; index++) {
      const expanded = digits[index] * 16 + carry;
      digits[index] = expanded % 10;
      carry = Math.floor(expanded / 10);
    }
    while (carry > 0) {
      digits.push(carry % 10);
      carry = Math.floor(carry / 10);
    }
  }

  return digits.reverse().join("");
}

function formatTokenAmount(rawValue: string, decimals: number): number | null {
  const raw = hexToDecimalString(rawValue);
  if (raw === null) return null;
  const padded = raw.padStart(decimals + 1, "0");
  const integer = padded.slice(0, -decimals) || "0";
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  const normalized = fraction ? `${integer}.${fraction}` : integer;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function toAddressTopic(address: string): string | null {
  const normalized = address.trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(normalized)) return null;
  return `0x${normalized.slice(2).padStart(64, "0")}`;
}

async function rpcCall<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const payload = await response.json() as RpcResponse<T>;
  if (payload.error) throw new Error(payload.error.message || "RPC 返回错误");
  if (payload.result === undefined) throw new Error("RPC 未返回结果");
  return payload.result;
}

/**
 * 使用链上 JSON-RPC 扫描 USDT Transfer 日志。
 * 只查询订单支付窗口内绑定的收款地址，并只处理达到确认阈值的区块。
 */
export async function scanEvmUsdtTransactions(
  config: EvmUsdtScannerConfig,
  targets?: RechargeScanTarget[],
): Promise<ScanStats> {
  const stats: ScanStats = {
    scannedAddresses: 0,
    foundTransactions: 0,
    matchedOrders: 0,
    unmatchedTransactions: 0,
  };

  const wallets = (targets ?? await dbRecharge.getActiveRechargeScanTargets())
    .filter((target) => target.network === config.network);
  const uniqueWallets: RechargeScanTarget[] = [];
  const seenWalletAddresses: Record<string, boolean> = {};
  for (const wallet of wallets) {
    const key = wallet.walletAddress.toLowerCase();
    if (!seenWalletAddresses[key]) {
      seenWalletAddresses[key] = true;
      uniqueWallets.push(wallet);
    }
  }

  if (uniqueWallets.length === 0) {
    console.log(`[${config.label} Scanner] No active ${config.network} recharge orders to scan`);
    return stats;
  }

  const latestBlockHex = await rpcCall<string>(config.rpcUrl, "eth_blockNumber", []);
  const latestBlock = hexToNumber(latestBlockHex);
  if (latestBlock === null) throw new Error("无法解析最新区块高度");

  const finalizedBlock = latestBlock - config.minConfirmations;
  if (finalizedBlock <= 0) return stats;
  const fromBlock = Math.max(0, finalizedBlock - config.lookbackBlocks);
  const blockTimestampCache = new Map<string, number | undefined>();

  for (const wallet of uniqueWallets) {
    const destinationTopic = toAddressTopic(wallet.walletAddress);
    if (!destinationTopic) {
      console.warn(`[${config.label} Scanner] Invalid configured wallet address: ${wallet.walletAddress}`);
      continue;
    }

    stats.scannedAddresses++;
    const logs = await rpcCall<EvmLog[]>(config.rpcUrl, "eth_getLogs", [{
      address: config.contractAddress,
      fromBlock: `0x${fromBlock.toString(16)}`,
      toBlock: `0x${finalizedBlock.toString(16)}`,
      topics: [ERC20_TRANSFER_TOPIC, null, destinationTopic],
    }]);

    for (const log of logs) {
      if (log.removed || !log.transactionHash || !log.data) continue;
      const logBlock = hexToNumber(log.blockNumber);
      if (logBlock === null || logBlock > finalizedBlock) continue;

      const amount = formatTokenAmount(log.data, config.decimals);
      if (amount === null) continue;

      const cacheKey = log.blockNumber!;
      let blockTimestamp = blockTimestampCache.get(cacheKey);
      if (blockTimestamp === undefined && !blockTimestampCache.has(cacheKey)) {
        const block = await rpcCall<EvmBlock | null>(config.rpcUrl, "eth_getBlockByNumber", [log.blockNumber, false]);
        const timestampSeconds = hexToNumber(block?.timestamp);
        blockTimestamp = timestampSeconds === null ? undefined : timestampSeconds * 1000;
        blockTimestampCache.set(cacheKey, blockTimestamp);
      }

      stats.foundTransactions++;
      const matchResult = await dbRecharge.findOrderByAmount(amount, log.transactionHash, blockTimestamp, {
        network: config.network,
        walletAddress: wallet.walletAddress,
      });

      if (!matchResult) {
        stats.unmatchedTransactions++;
        continue;
      }

      const completed = await dbRecharge.completeRechargeOrder(
        matchResult.order.id,
        log.transactionHash,
        amount,
        matchResult.matchType,
      );
      if (completed) {
        stats.matchedOrders++;
        console.log(`[${config.label} Scanner] Completed ${matchResult.order.orderNo} at ${config.minConfirmations}+ confirmations`);
      }
    }
  }

  return stats;
}
