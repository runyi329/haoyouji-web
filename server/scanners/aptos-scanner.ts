import * as dbRecharge from "../db-recharge";

// Aptos API配置
const APTOS_API_URL = 'https://fullnode.mainnet.aptoslabs.com/v1';

// USDT on Aptos (LayerZero USDT)
const USDT_COIN_TYPE = '0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDT';

// 已处理的交易哈希
const processedTxns = new Set<string>();

// Store地址缓存（地址 -> Store地址）
const storeAddressCache = new Map<string, string>();

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
 * 获取地址对应的Primary Fungible Store地址
 */
async function getPrimaryStoreAddress(walletAddress: string): Promise<string | null> {
  // 先检查缓存
  if (storeAddressCache.has(walletAddress)) {
    return storeAddressCache.get(walletAddress)!;
  }

  try {
    // 方法1：从最近的交易中提取Store地址
    const txResponse = await fetch(
      `${APTOS_API_URL}/accounts/${walletAddress}/transactions?limit=5`
    );

    if (txResponse.ok) {
      const transactions = await txResponse.json();
      
      for (const tx of transactions) {
        if (tx.events && Array.isArray(tx.events)) {
          // 查找Withdraw或Deposit事件
          for (const event of tx.events) {
            if ((event.type?.includes('Withdraw') || event.type?.includes('Deposit')) && 
                event.data?.store) {
              const storeAddress = event.data.store;
              
              // 验证这个Store是否属于该地址
              const isValid = await verifyStoreOwner(storeAddress, walletAddress);
              if (isValid) {
                console.log(`[Aptos Scanner] Found Primary Store for ${walletAddress.slice(0, 10)}...: ${storeAddress}`);
                storeAddressCache.set(walletAddress, storeAddress);
                return storeAddress;
              }
            }
          }
        }
      }
    }

    console.warn(`[Aptos Scanner] Could not find Primary Store for ${walletAddress.slice(0, 10)}...`);
    return null;
    
  } catch (error) {
    console.error(`[Aptos Scanner] Error getting Primary Store:`, error);
    return null;
  }
}

/**
 * 验证Store是否属于指定地址
 */
async function verifyStoreOwner(storeAddress: string, expectedOwner: string): Promise<boolean> {
  try {
    const response = await fetch(
      `${APTOS_API_URL}/accounts/${storeAddress}/resources`
    );

    if (!response.ok) {
      return false;
    }

    const resources = await response.json();
    const fungibleStore = resources.find((r: any) => 
      r.type && r.type.includes('FungibleStore')
    );

    if (fungibleStore && fungibleStore.data && fungibleStore.data.owner) {
      return fungibleStore.data.owner.toLowerCase() === expectedOwner.toLowerCase();
    }

    return false;
  } catch (error) {
    return false;
  }
}

/**
 * 扫描单个Aptos钱包地址
 * 查询过去24小时内转入该地址的USDT交易
 */
async function scanWalletAddress(walletAddress: string, label: string) {
  try {
    console.log(`[Aptos Scanner] Scanning ${label} (${walletAddress.slice(0, 10)}...)...`);
    
    // 1. 获取该地址对应的Primary Fungible Store
    const storeAddress = await getPrimaryStoreAddress(walletAddress);
    
    if (!storeAddress) {
      console.warn(`[Aptos Scanner] No Primary Store found for ${label}, skipping...`);
      return;
    }

    // 2. 查询最近的交易
    const txResponse = await fetch(
      `${APTOS_API_URL}/accounts/${walletAddress}/transactions?limit=50`
    );

    if (!txResponse.ok) {
      console.error(`[Aptos Scanner] Failed to fetch transactions: ${txResponse.status}`);
      return;
    }

    const transactions = await txResponse.json();

    if (!Array.isArray(transactions)) {
      console.error('[Aptos Scanner] Invalid transaction response');
      return;
    }

    // 24小时前的时间戳（微秒）
    const oneDayAgo = Date.now() * 1000 - 24 * 60 * 60 * 1000 * 1000;

    // 3. 处理每笔交易
    for (const tx of transactions) {
      // 只处理24小时内的交易
      if (parseInt(tx.timestamp) < oneDayAgo) {
        continue;
      }

      if (tx.type === 'user_transaction' && tx.success) {
        await processAptosTransaction(tx, walletAddress, storeAddress);
      }
    }

  } catch (error) {
    console.error(`[Aptos Scanner] Error scanning ${label}:`, error);
  }
}

/**
 * 处理单笔Aptos交易
 * 查找转入目标地址Store的USDT
 */
async function processAptosTransaction(tx: any, walletAddress: string, storeAddress: string) {
  try {
    const txnHash = tx.hash;
    
    // 跳过已处理的交易
    if (processedTxns.has(txnHash)) {
      return;
    }

    // 检查events中的Deposit事件
    if (tx.events && Array.isArray(tx.events)) {
      for (const event of tx.events) {
        // 查找Deposit事件，并且是转入到我们的Store
        if (event.type && event.type.includes('Deposit')) {
          const eventData = event.data;
          
          // 关键：检查是否是转入到我们的Store
          if (eventData && eventData.store && 
              eventData.store.toLowerCase() === storeAddress.toLowerCase()) {
            
            const amount = extractAmountFromEvent(eventData);
            
            if (amount && amount > 0) {
              scanStats.foundTransactions++;
              
              const timestamp = new Date(parseInt(tx.timestamp) / 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
              console.log(`[Aptos Scanner] 🎯 Detected INCOMING transfer: ${amount} USDT to ${walletAddress.slice(0, 10)}... (tx: ${txnHash}, time: ${timestamp})`);
              
              // 匹配订单
              const matchResult = await dbRecharge.findOrderByAmount(amount, txnHash);
              
              if (matchResult) {
                const { order, matchType, amountDiff } = matchResult;
                
                if (matchType === 'exact') {
                  console.log(`[Aptos Scanner] ✅ Exact match! Order ${order.orderNo}, amount ${amount} USDT`);
                } else {
                  console.log(`[Aptos Scanner] 🔄 Fuzzy match! Order ${order.orderNo}, order amount ${order.amount}, actual ${amount} USDT, diff ${amountDiff}`);
                }
                
                // 完成订单
                const success = await dbRecharge.completeRechargeOrder(order.id, txnHash, amount, matchType);
                
                if (success) {
                  console.log(`[Aptos Scanner] ✅ Order ${order.orderNo} completed! User ${order.userId} +${amount} USDT (match: ${matchType})`);
                  scanStats.matchedOrders++;
                  processedTxns.add(txnHash);
                }
              } else {
                scanStats.unmatchedTransactions++;
                console.log(`[Aptos Scanner] ⚠️  No matching order for amount ${amount} USDT`);
                // 记录未匹配交易
                await dbRecharge.recordUnmatchedTransaction(txnHash, amount, tx.sender || '');
                processedTxns.add(txnHash);
              }
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
 * 从事件数据中提取金额
 */
function extractAmountFromEvent(eventData: any): number | null {
  try {
    if (eventData.amount) {
      // USDT通常是6位小数
      const amount = parseFloat(eventData.amount) / 1e6;
      return amount;
    }
    return null;
  } catch (error) {
    return null;
  }
}
