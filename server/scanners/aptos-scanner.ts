import * as dbRecharge from "../db-recharge";

// Aptos API配置
const APTOS_API_URL = 'https://fullnode.mainnet.aptoslabs.com/v1';

// USDT on Aptos (Fungible Asset)
const USDT_ASSET_TYPE = '0x357b0b74bc833e95a115ad22604854d6b0fca151cecd94111770e5d6ffc9dc2b';

// 已处理的交易哈希
const processedTxns = new Set<string>();

// 扫描统计
export let scanStats = {
  scannedAddresses: 0,
  foundTransactions: 0,
  matchedOrders: 0,
  unmatchedTransactions: 0,
};

/**
 * 扫描Aptos网络的USDT交易
 */
export async function scanAptosTransactions() {
  scanStats = {
    scannedAddresses: 0,
    foundTransactions: 0,
    matchedOrders: 0,
    unmatchedTransactions: 0,
  };

  try {
    // 获取所有启用的Aptos地址
    const wallets = await dbRecharge.getEnabledWalletAddresses('APTOS');
    
    if (wallets.length === 0) {
      console.log('[Aptos Scanner] No enabled APTOS wallet addresses found');
      return scanStats;
    }

    scanStats.scannedAddresses = wallets.length;

    // 扫描每个地址
    for (const wallet of wallets) {
      await scanWalletAddress(wallet.address, wallet.label || wallet.address);
    }

    console.log(`[Aptos Scanner] Scan completed for ${wallets.length} wallet(s)`);
    return scanStats;
    
  } catch (error) {
    console.error('[Aptos Scanner] Scan error:', error);
    throw error;
  }
}

/**
 * 扫描单个Aptos钱包地址
 */
async function scanWalletAddress(walletAddress: string, label: string) {
  try {
    console.log(`[Aptos Scanner] Scanning ${label} (${walletAddress.slice(0, 10)}...)...`);
    
    // 获取账户的交易记录
    const response = await fetch(
      `${APTOS_API_URL}/accounts/${walletAddress}/transactions?limit=20`
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Aptos Scanner] API error: ${response.status} - ${errorText}`);
      return;
    }

    const transactions = await response.json();
    
    if (!Array.isArray(transactions)) {
      console.error('[Aptos Scanner] Invalid response format');
      return;
    }

    // 过滤出USDT转账交易
    for (const tx of transactions) {
      if (tx.type === 'user_transaction' && tx.success) {
        await processAptosTransaction(tx, walletAddress);
      }
    }

  } catch (error) {
    console.error(`[Aptos Scanner] Error scanning ${label}:`, error);
  }
}

/**
 * 处理单笔Aptos交易
 */
async function processAptosTransaction(tx: any, walletAddress: string) {
  try {
    const txnHash = tx.hash;
    
    // 跳过已处理的交易
    if (processedTxns.has(txnHash)) {
      return;
    }

    // 检查是否是USDT转账
    const changes = tx.changes || [];
    for (const change of changes) {
      if (change.type === 'write_resource' && 
          change.data?.type?.includes('coin::CoinStore') &&
          change.address === walletAddress) {
        
        // 尝试从payload中提取金额
        const payload = tx.payload;
        if (payload?.function?.includes('transfer') || payload?.function?.includes('coin_transfer')) {
          const amount = extractAmount(payload, change);
          
          if (amount && amount > 0) {
            scanStats.foundTransactions++;
            console.log(`[Aptos Scanner] Detected transfer: ${amount} USDT to ${walletAddress.slice(0, 10)}... (tx: ${txnHash})`);
            
            // 匹配订单
            const matchResult = await dbRecharge.findOrderByAmount(amount, txnHash);
            
            if (matchResult) {
              scanStats.matchedOrders++;
              processedTxns.add(txnHash);
              console.log(`[Aptos Scanner] ✅ Matched order ${matchResult.orderNo}`);
            } else {
              scanStats.unmatchedTransactions++;
            }
          }
        }
      }
    }

  } catch (error) {
    console.error('[Aptos Scanner] Error processing transaction:', error);
  }
}

/**
 * 从交易payload中提取金额
 */
function extractAmount(payload: any, change: any): number | null {
  try {
    // 方法1: 从payload的arguments中提取
    if (payload?.arguments && Array.isArray(payload.arguments)) {
      // 通常第二个参数是金额
      const amountArg = payload.arguments[1];
      if (typeof amountArg === 'string') {
        const amount = parseFloat(amountArg) / 1e6; // USDT通常是6位小数
        return amount;
      }
    }
    
    // 方法2: 从change数据中提取
    if (change?.data?.coin?.value) {
      const amount = parseFloat(change.data.coin.value) / 1e6;
      return amount;
    }
    
    return null;
  } catch (error) {
    return null;
  }
}
