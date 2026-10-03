import { scanTRC20Transactions } from "./blockchain-scanner";
import { scanAptosTransactions } from "./scanners/aptos-scanner";
import { scanSolanaTransactions } from "./scanners/solana-scanner";
import { scanERC20Transactions } from "./scanners/erc20-scanner";
import { scanBSCTransactions } from "./scanners/bsc-scanner";
import * as dbRecharge from "./db-recharge";
import type { RechargeNetwork, RechargeScanTarget } from "./db-recharge";
import { getDb } from "./db";
import { scannerHeartbeat } from "../drizzle/schema";
import { eq } from "drizzle-orm";

type ScanStats = {
  scannedAddresses: number;
  foundTransactions: number;
  matchedOrders: number;
  unmatchedTransactions: number;
};

type ChainScanner = (targets: RechargeScanTarget[]) => Promise<ScanStats>;

const CHAIN_SCANNERS: Array<{ network: RechargeNetwork; label: string; scan: ChainScanner }> = [
  { network: "TRC20", label: "TRC20", scan: scanTRC20Transactions },
  { network: "APTOS", label: "Aptos", scan: scanAptosTransactions },
  { network: "SOLANA", label: "Solana", scan: scanSolanaTransactions },
  { network: "ERC20", label: "ERC20", scan: scanERC20Transactions },
  { network: "BEP20", label: "BEP20", scan: scanBSCTransactions },
];

let scanInProgress = false;

function emptyStats(): ScanStats {
  return {
    scannedAddresses: 0,
    foundTransactions: 0,
    matchedOrders: 0,
    unmatchedTransactions: 0,
  };
}

function addStats(total: ScanStats, current: ScanStats) {
  total.scannedAddresses += current.scannedAddresses;
  total.foundTransactions += current.foundTransactions;
  total.matchedOrders += current.matchedOrders;
  total.unmatchedTransactions += current.unmatchedTransactions;
}

/**
 * 扫描当前支付窗口内的充值订单。
 *
 * 每个扫描目标均直接从 pending/submitted 订单的 network + wallet_address 取得，
 * 不会遍历全部启用钱包；每个扫描器再以相同网络和地址作为订单匹配范围。
 * 前端未开放的网络不会被新订单使用，但历史有效订单仍可完成一次受限扫描。
 */
export async function scanAllChains() {
  const results: {
    success: boolean;
    skipped?: boolean;
    activeTargets: number;
    chains: Record<string, unknown>;
    totalStats: ScanStats;
    errors: string[];
  } = {
    success: true,
    activeTargets: 0,
    chains: {},
    totalStats: emptyStats(),
    errors: [],
  };

  if (scanInProgress) {
    console.log("[Multi-Chain Scanner] Previous order-driven scan is still running; skipping overlap");
    results.skipped = true;
    return results;
  }

  scanInProgress = true;
  const startTime = Date.now();
  try {
    const targets = await dbRecharge.getActiveRechargeScanTargets();
    results.activeTargets = targets.length;

    if (targets.length === 0) {
      console.log("[Multi-Chain Scanner] No active recharge orders to scan");
      await updateMultiChainHeartbeat(results);
      return results;
    }

    console.log(`[Multi-Chain Scanner] Starting order-driven scan for ${targets.length} active target(s)`);
    for (const config of CHAIN_SCANNERS) {
      const chainTargets = targets.filter((target) => target.network === config.network);
      if (chainTargets.length === 0) continue;

      try {
        console.log(`[Multi-Chain Scanner] Scanning ${config.label}: ${chainTargets.length} order-bound address(es)`);
        const stats = await config.scan(chainTargets);
        results.chains[config.network] = { success: true, activeTargets: chainTargets.length, stats };
        addStats(results.totalStats, stats);
      } catch (error) {
        console.error(`[Multi-Chain Scanner] ${config.label} scan failed:`, error);
        results.chains[config.network] = {
          success: false,
          activeTargets: chainTargets.length,
          error: String(error),
        };
        results.errors.push(`${config.network}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    results.success = results.errors.length === 0;
    console.log(`[Multi-Chain Scanner] Scan completed in ${Date.now() - startTime}ms; targets=${results.activeTargets}, matched=${results.totalStats.matchedOrders}`);
    await updateMultiChainHeartbeat(results);
    return results;
  } catch (error) {
    console.error("[Multi-Chain Scanner] Order-driven scan failed:", error);
    results.success = false;
    results.errors.push(error instanceof Error ? error.message : String(error));
    await updateMultiChainHeartbeat(results);
    return results;
  } finally {
    scanInProgress = false;
  }
}

/**
 * 更新多链扫描器心跳
 */
async function updateMultiChainHeartbeat(results: {
  success: boolean;
  totalStats: ScanStats;
  errors: string[];
}) {
  try {
    const db = await getDb();
    const now = new Date();

    const existing = await db
      .select()
      .from(scannerHeartbeat)
      .where(eq(scannerHeartbeat.scannerType, "multi-chain"))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(scannerHeartbeat)
        .set({
          lastScanAt: now,
          scanCount: existing[0].scanCount! + 1,
          successCount: results.success ? existing[0].successCount! + 1 : existing[0].successCount,
          errorCount: results.success ? existing[0].errorCount : existing[0].errorCount! + 1,
          lastError: results.errors.length > 0 ? results.errors.join("; ") : null,
          scannedAddresses: results.totalStats.scannedAddresses,
          foundTransactions: results.totalStats.foundTransactions,
          matchedOrders: results.totalStats.matchedOrders,
          unmatchedTransactions: results.totalStats.unmatchedTransactions,
        })
        .where(eq(scannerHeartbeat.scannerType, "multi-chain"));
    } else {
      await db.insert(scannerHeartbeat).values({
        scannerType: "multi-chain",
        lastScanAt: now,
        scanCount: 1,
        successCount: results.success ? 1 : 0,
        errorCount: results.success ? 0 : 1,
        lastError: results.errors.length > 0 ? results.errors.join("; ") : null,
        scannedAddresses: results.totalStats.scannedAddresses,
        foundTransactions: results.totalStats.foundTransactions,
        matchedOrders: results.totalStats.matchedOrders,
        unmatchedTransactions: results.totalStats.unmatchedTransactions,
      });
    }
  } catch (err) {
    console.error("[Multi-Chain Scanner] Failed to update heartbeat:", err);
  }
}
