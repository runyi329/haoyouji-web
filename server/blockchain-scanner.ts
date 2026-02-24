import * as dbRecharge from "./db-recharge";
import { getDb } from "./db";
import { scannerHeartbeat } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// TronGrid API配置
const TRONGRID_API_URL = 'https://api.trongrid.io';
const TRONGRID_API_KEY = process.env.TRONGRID_API_KEY || '';

// USDT TRC20 合约地址
const USDT_CONTRACT_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

// 已处理的交易哈希（防止重复处理）
const processedTxns = new Set<string>();

// 上次扫描的时间戳
let lastScanTimestamp = Date.now() - 5 * 60 * 1000; // 从5分钟前开始

// 扫描统计数据
let currentScanStats = {
  scannedAddresses: 0,
  foundTransactions: 0,
  matchedOrders: 0,
  unmatchedTransactions: 0,
};

/**
 * 更新扫描器心跳
 */
async function updateScannerHeartbeat(success: boolean, error?: string) {
  try {
    const db = await getDb();
    const now = new Date();
    
    // 查找现有记录
    const existing = await db
      .select()
      .from(scannerHeartbeat)
      .where(eq(scannerHeartbeat.scannerType, 'blockchain'))
      .limit(1);
    
    if (existing.length > 0) {
      // 更新现有记录
      await db
        .update(scannerHeartbeat)
        .set({
          lastScanAt: now,
          scanCount: existing[0].scanCount! + 1,
          successCount: success ? existing[0].successCount! + 1 : existing[0].successCount,
          errorCount: success ? existing[0].errorCount : existing[0].errorCount! + 1,
          lastError: error || existing[0].lastError,
          scannedAddresses: currentScanStats.scannedAddresses,
          foundTransactions: currentScanStats.foundTransactions,
          matchedOrders: currentScanStats.matchedOrders,
          unmatchedTransactions: currentScanStats.unmatchedTransactions,
        })
        .where(eq(scannerHeartbeat.scannerType, 'blockchain'));
    } else {
      // 插入新记录
      await db.insert(scannerHeartbeat).values({
        scannerType: 'blockchain',
        lastScanAt: now,
        scanCount: 1,
        successCount: success ? 1 : 0,
        errorCount: success ? 0 : 1,
        lastError: error,
        scannedAddresses: currentScanStats.scannedAddresses,
        foundTransactions: currentScanStats.foundTransactions,
        matchedOrders: currentScanStats.matchedOrders,
        unmatchedTransactions: currentScanStats.unmatchedTransactions,
      });
    }
  } catch (err) {
    console.error('[Scanner] Failed to update heartbeat:', err);
  }
}

/**
 * 扫描所有启用的收款地址的TRC20 USDT交易
 */
export async function scanTRC20Transactions() {
  // 重置统计数据
  currentScanStats = {
    scannedAddresses: 0,
    foundTransactions: 0,
    matchedOrders: 0,
    unmatchedTransactions: 0,
  };
  
  try {
    // 从数据库获取所有启用的TRC20收款地址
    const wallets = await dbRecharge.getEnabledWalletAddresses('TRC20');
    
    if (wallets.length === 0) {
      console.warn('[Scanner] ⚠️  No enabled TRC20 wallet addresses found in database. Please add wallet addresses in admin panel.');
      await updateScannerHeartbeat(false, 'No enabled wallet addresses');
      return;
    }

    currentScanStats.scannedAddresses = wallets.length;

    // 扫描每个地址
    for (const wallet of wallets) {
      await scanWalletAddress(wallet.address, wallet.label || wallet.address);
    }

    console.log(`[Scanner] Scan completed for ${wallets.length} wallet(s)`);
    
    // 更新心跳（成功）
    await updateScannerHeartbeat(true);
    
  } catch (error) {
    console.error('[Scanner] Scan error:', error);
    await updateScannerHeartbeat(false, error instanceof Error ? error.message : String(error));
  }
}

/**
 * 扫描单个钱包地址的交易
 */
async function scanWalletAddress(walletAddress: string, label: string) {
  try {
    console.log(`[Scanner] Scanning ${label} (${walletAddress.slice(0, 8)}...)...`);
    
    // 获取最近的TRC20转账记录
    const response = await fetch(
      `${TRONGRID_API_URL}/v1/accounts/${walletAddress}/transactions/trc20?limit=20&only_to=true&contract_address=${USDT_CONTRACT_ADDRESS}`,
      {
        headers: {
          'TRON-PRO-API-KEY': TRONGRID_API_KEY
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Scanner] TronGrid API error for ${label}: ${response.status} ${response.statusText}`);
      console.error(`[Scanner] Response: ${errorText}`);
      throw new Error(`TronGrid API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.data || data.data.length === 0) {
      return;
    }

    // 处理每笔交易
    currentScanStats.foundTransactions += data.data.length;
    for (const tx of data.data) {
      await processTRC20Transaction(tx, walletAddress);
    }

  } catch (error) {
    console.error(`[Scanner] Error scanning ${label}:`, error);
  }
}

/**
 * 处理单笔TRC20交易（改进版：支持模糊匹配）
 */
async function processTRC20Transaction(tx: any, walletAddress: string) {
  try {
    const txnHash = tx.transaction_id;
    const timestamp = tx.block_timestamp;
    
    // 跳过已处理的交易
    if (processedTxns.has(txnHash)) {
      return;
    }

    // 跳过上次扫描之前的交易
    if (timestamp < lastScanTimestamp) {
      return;
    }

    // 解析转账金额（USDT有6位小数）
    const amount = parseFloat(tx.value) / 1e6;
    const toAddress = tx.to;
    const fromAddress = tx.from || '';

    // 确认是转到我们的地址
    if (toAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      return;
    }

    console.log(`[Scanner] Detected transfer: ${amount} USDT from ${fromAddress} to ${walletAddress.slice(0, 8)}... (tx: ${txnHash})`);

    // 使用改进的匹配算法查找订单
    const matchResult = await dbRecharge.findOrderByAmount(amount);

    if (!matchResult) {
      console.log(`[Scanner] ⚠️ No matching order for amount ${amount} USDT`);
      // 记录未匹配交易，供管理员手动处理
      await dbRecharge.recordUnmatchedTransaction(txnHash, amount, fromAddress);
      currentScanStats.unmatchedTransactions++;
      processedTxns.add(txnHash);
      return;
    }

    const { order, matchType, amountDiff } = matchResult;

    if (matchType === 'exact') {
      console.log(`[Scanner] ✅ Exact match! Order ${order.orderNo}, amount ${amount} USDT`);
    } else {
      console.log(`[Scanner] 🔄 Fuzzy match! Order ${order.orderNo}, order amount ${order.amount}, actual ${amount} USDT, diff ${amountDiff} (likely fee)`);
    }

    // 完成订单（按实际到账金额入账）
    const success = await dbRecharge.completeRechargeOrder(order.id, txnHash, amount, matchType);

    if (success) {
      console.log(`[Scanner] ✅ Order ${order.orderNo} completed! User ${order.userId} +${amount} USDT (match: ${matchType})`);
      currentScanStats.matchedOrders++;
      processedTxns.add(txnHash);
    }

  } catch (error) {
    console.error('[Scanner] Process transaction error:', error);
  }
}

/**
 * 启动扫描器（不再依赖环境变量，从数据库读取地址）
 */
export function startScanner() {
  console.log('[Scanner] Starting blockchain scanner...');
  console.log('[Scanner] Wallet addresses: loaded from database');
  console.log('[Scanner] Scan interval: 60 seconds');
  console.log('[Scanner] Match strategy: exact (±0.01) → fuzzy (≤3 USDT fee tolerance) → record unmatched');

  // 立即执行一次
  scanTRC20Transactions();

  // 每分钟扫描一次
  setInterval(async () => {
    await scanTRC20Transactions();
    
    // 更新上次扫描时间
    lastScanTimestamp = Date.now() - 60 * 1000; // 保留1分钟重叠
    
    // 清理过期订单
    await dbRecharge.cleanExpiredOrders();
    
  }, 60 * 1000);

  console.log('[Scanner] Blockchain scanner started successfully');
}

/**
 * 停止扫描器
 */
export function stopScanner() {
  console.log('[Scanner] Stopping blockchain scanner...');
}
