import { scanTRC20Transactions } from "./blockchain-scanner";
import { scanAptosTransactions } from "./scanners/aptos-scanner";
import { scanSolanaTransactions } from "./scanners/solana-scanner";
import { scanERC20Transactions } from "./scanners/erc20-scanner";
import { scanBSCTransactions } from "./scanners/bsc-scanner";
import { getDb } from "./db";
import { scannerHeartbeat } from "../drizzle/schema";
import { eq } from "drizzle-orm";

/**
 * 扫描所有支持的区块链网络
 */
export async function scanAllChains() {
  console.log('[Multi-Chain Scanner] ========== Starting scan for all chains ==========');
  
  const startTime = Date.now();
  const results: any = {
    success: true,
    chains: {},
    totalStats: {
      scannedAddresses: 0,
      foundTransactions: 0,
      matchedOrders: 0,
      unmatchedTransactions: 0,
    },
    errors: []
  };

  // 1. 扫描 TRC20 (TRON)
  try {
    console.log('[Multi-Chain Scanner] Scanning TRC20...');
    await scanTRC20Transactions();
    results.chains.TRC20 = { success: true };
  } catch (error) {
    console.error('[Multi-Chain Scanner] TRC20 scan failed:', error);
    results.chains.TRC20 = { success: false, error: String(error) };
    results.errors.push(`TRC20: ${error}`);
  }

  // 2. 扫描 Aptos
  try {
    console.log('[Multi-Chain Scanner] Scanning Aptos...');
    const aptosStats = await scanAptosTransactions();
    results.chains.APTOS = { success: true, stats: aptosStats };
    results.totalStats.scannedAddresses += aptosStats.scannedAddresses;
    results.totalStats.foundTransactions += aptosStats.foundTransactions;
    results.totalStats.matchedOrders += aptosStats.matchedOrders;
    results.totalStats.unmatchedTransactions += aptosStats.unmatchedTransactions;
  } catch (error) {
    console.error('[Multi-Chain Scanner] Aptos scan failed:', error);
    results.chains.APTOS = { success: false, error: String(error) };
    results.errors.push(`Aptos: ${error}`);
  }

  // 3. 扫描 Solana
  try {
    console.log('[Multi-Chain Scanner] Scanning Solana...');
    const solanaStats = await scanSolanaTransactions();
    results.chains.SOLANA = { success: true, stats: solanaStats };
    results.totalStats.scannedAddresses += solanaStats.scannedAddresses;
    results.totalStats.foundTransactions += solanaStats.foundTransactions;
    results.totalStats.matchedOrders += solanaStats.matchedOrders;
    results.totalStats.unmatchedTransactions += solanaStats.unmatchedTransactions;
  } catch (error) {
    console.error('[Multi-Chain Scanner] Solana scan failed:', error);
    results.chains.SOLANA = { success: false, error: String(error) };
    results.errors.push(`Solana: ${error}`);
  }

  // 4. 扫描 ERC20 (Ethereum)
  try {
    console.log('[Multi-Chain Scanner] Scanning ERC20...');
    const erc20Stats = await scanERC20Transactions();
    results.chains.ERC20 = { success: true, stats: erc20Stats };
    results.totalStats.scannedAddresses += erc20Stats.scannedAddresses;
    results.totalStats.foundTransactions += erc20Stats.foundTransactions;
    results.totalStats.matchedOrders += erc20Stats.matchedOrders;
    results.totalStats.unmatchedTransactions += erc20Stats.unmatchedTransactions;
  } catch (error) {
    console.error('[Multi-Chain Scanner] ERC20 scan failed:', error);
    results.chains.ERC20 = { success: false, error: String(error) };
    results.errors.push(`ERC20: ${error}`);
  }

  // 5. 扫描 BSC (BEP20)
  try {
    console.log('[Multi-Chain Scanner] Scanning BSC...');
    const bscStats = await scanBSCTransactions();
    results.chains.BEP20 = { success: true, stats: bscStats };
    results.totalStats.scannedAddresses += bscStats.scannedAddresses;
    results.totalStats.foundTransactions += bscStats.foundTransactions;
    results.totalStats.matchedOrders += bscStats.matchedOrders;
    results.totalStats.unmatchedTransactions += bscStats.unmatchedTransactions;
  } catch (error) {
    console.error('[Multi-Chain Scanner] BSC scan failed:', error);
    results.chains.BEP20 = { success: false, error: String(error) };
    results.errors.push(`BSC: ${error}`);
  }

  const duration = Date.now() - startTime;
  
  console.log('[Multi-Chain Scanner] ========== Scan completed ==========');
  console.log(`[Multi-Chain Scanner] Duration: ${duration}ms`);
  console.log(`[Multi-Chain Scanner] Total addresses scanned: ${results.totalStats.scannedAddresses}`);
  console.log(`[Multi-Chain Scanner] Total transactions found: ${results.totalStats.foundTransactions}`);
  console.log(`[Multi-Chain Scanner] Total orders matched: ${results.totalStats.matchedOrders}`);
  console.log(`[Multi-Chain Scanner] Total unmatched: ${results.totalStats.unmatchedTransactions}`);
  
  if (results.errors.length > 0) {
    console.error(`[Multi-Chain Scanner] Errors: ${results.errors.join(', ')}`);
    results.success = false;
  }

  // 更新心跳
  await updateMultiChainHeartbeat(results);

  return results;
}

/**
 * 更新多链扫描器心跳
 */
async function updateMultiChainHeartbeat(results: any) {
  try {
    const db = await getDb();
    const now = new Date();
    
    // 查找现有记录
    const existing = await db
      .select()
      .from(scannerHeartbeat)
      .where(eq(scannerHeartbeat.scannerType, 'multi-chain'))
      .limit(1);
    
    if (existing.length > 0) {
      // 更新现有记录
      await db
        .update(scannerHeartbeat)
        .set({
          lastScanAt: now,
          scanCount: existing[0].scanCount! + 1,
          successCount: results.success ? existing[0].successCount! + 1 : existing[0].successCount,
          errorCount: results.success ? existing[0].errorCount : existing[0].errorCount! + 1,
          lastError: results.errors.length > 0 ? results.errors.join('; ') : null,
          scannedAddresses: results.totalStats.scannedAddresses,
          foundTransactions: results.totalStats.foundTransactions,
          matchedOrders: results.totalStats.matchedOrders,
          unmatchedTransactions: results.totalStats.unmatchedTransactions,
        })
        .where(eq(scannerHeartbeat.scannerType, 'multi-chain'));
    } else {
      // 插入新记录
      await db.insert(scannerHeartbeat).values({
        scannerType: 'multi-chain',
        lastScanAt: now,
        scanCount: 1,
        successCount: results.success ? 1 : 0,
        errorCount: results.success ? 0 : 1,
        lastError: results.errors.length > 0 ? results.errors.join('; ') : null,
        scannedAddresses: results.totalStats.scannedAddresses,
        foundTransactions: results.totalStats.foundTransactions,
        matchedOrders: results.totalStats.matchedOrders,
        unmatchedTransactions: results.totalStats.unmatchedTransactions,
      });
    }
  } catch (err) {
    console.error('[Multi-Chain Scanner] Failed to update heartbeat:', err);
  }
}
