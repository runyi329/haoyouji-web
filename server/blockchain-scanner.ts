import * as dbRecharge from "./db-recharge";

// TronGrid API配置
const TRONGRID_API_URL = 'https://api.trongrid.io';
const TRONGRID_API_KEY = process.env.TRONGRID_API_KEY || '';

// 收款钱包地址（从环境变量读取）
const WALLET_ADDRESS = process.env.RECHARGE_WALLET_ADDRESS_TRC20 || process.env.RECHARGE_WALLET_ADDRESS || '';

// USDT TRC20 合约地址
const USDT_CONTRACT_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

// 已处理的交易哈希（防止重复处理）
const processedTxns = new Set<string>();

// 上次扫描的时间戳
let lastScanTimestamp = Date.now() - 5 * 60 * 1000; // 从5分钟前开始

/**
 * 扫描TRC20 USDT交易
 */
export async function scanTRC20Transactions() {
  if (!WALLET_ADDRESS) {
    console.error('[Scanner] RECHARGE_WALLET_ADDRESS_TRC20 not configured');
    return;
  }

  try {
    console.log(`[Scanner] Scanning TRC20 transactions for ${WALLET_ADDRESS}...`);
    
    // 获取最近的TRC20转账记录
    const response = await fetch(
      `${TRONGRID_API_URL}/v1/accounts/${WALLET_ADDRESS}/transactions/trc20?limit=20&only_to=true&contract_address=${USDT_CONTRACT_ADDRESS}`,
      {
        headers: {
          'TRON-PRO-API-KEY': TRONGRID_API_KEY
        }
      }
    );

    if (!response.ok) {
      throw new Error(`TronGrid API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.data || data.data.length === 0) {
      console.log('[Scanner] No new transactions found');
      return;
    }

    // 处理每笔交易
    for (const tx of data.data) {
      await processTRC20Transaction(tx);
    }

    console.log(`[Scanner] Scan completed, processed ${data.data.length} transactions`);
    
  } catch (error) {
    console.error('[Scanner] Scan error:', error);
  }
}

/**
 * 处理单笔TRC20交易（改进版：支持模糊匹配）
 */
async function processTRC20Transaction(tx: any) {
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
    if (toAddress.toLowerCase() !== WALLET_ADDRESS.toLowerCase()) {
      return;
    }

    console.log(`[Scanner] Detected transfer: ${amount} USDT from ${fromAddress} (tx: ${txnHash})`);

    // 使用改进的匹配算法查找订单
    const matchResult = await dbRecharge.findOrderByAmount(amount);

    if (!matchResult) {
      console.log(`[Scanner] ⚠️ No matching order for amount ${amount} USDT`);
      // 记录未匹配交易，供管理员手动处理
      await dbRecharge.recordUnmatchedTransaction(txnHash, amount, fromAddress);
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
      processedTxns.add(txnHash);
    }

  } catch (error) {
    console.error('[Scanner] Process transaction error:', error);
  }
}

/**
 * 启动扫描器
 */
export function startScanner() {
  console.log('[Scanner] Starting blockchain scanner...');
  console.log(`[Scanner] Wallet address: ${WALLET_ADDRESS}`);
  console.log(`[Scanner] Scan interval: 60 seconds`);
  console.log(`[Scanner] Match strategy: exact (±0.01) → fuzzy (≤3 USDT fee tolerance) → record unmatched`);

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
  // 这里可以添加清理逻辑
}
