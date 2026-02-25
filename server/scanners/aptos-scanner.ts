import * as dbRecharge from "../db-recharge";

// Aptos API配置
const APTOS_API_URL = 'https://fullnode.mainnet.aptoslabs.com/v1';

// USDT on Aptos (LayerZero USDT)
const USDT_COIN_TYPE = '0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDT';

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
 * 查询过去24小时内转入该地址的USDT交易
 */
async function scanWalletAddress(walletAddress: string, label: string) {
  try {
    console.log(`[Aptos Scanner] Scanning ${label} (${walletAddress.slice(0, 10)}...)...`);
    
    // 获取账户资源，检查USDT余额变化
    const resourceResponse = await fetch(
      `${APTOS_API_URL}/accounts/${walletAddress}/resources`
    );

    if (!resourceResponse.ok) {
      console.error(`[Aptos Scanner] Failed to fetch resources: ${resourceResponse.status}`);
      return;
    }

    const resources = await resourceResponse.json();
    
    // 查找USDT CoinStore
    const usdtResource = resources.find((r: any) => 
      r.type && r.type.includes('CoinStore') && r.type.includes('USDT')
    );

    if (!usdtResource) {
      console.log(`[Aptos Scanner] No USDT CoinStore found for ${label}`);
      return;
    }

    console.log(`[Aptos Scanner] Found USDT resource, fetching recent transactions...`);

    // 获取最近的交易
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

    // 处理每笔交易
    for (const tx of transactions) {
      // 只处理24小时内的交易
      if (parseInt(tx.timestamp) < oneDayAgo) {
        continue;
      }

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
 * 查找转入目标地址的USDT
 */
async function processAptosTransaction(tx: any, walletAddress: string) {
  try {
    const txnHash = tx.hash;
    
    // 跳过已处理的交易
    if (processedTxns.has(txnHash)) {
      return;
    }

    // 检查events中的DepositEvent
    if (tx.events && Array.isArray(tx.events)) {
      for (const event of tx.events) {
        // 查找存款事件
        if (event.type && event.type.includes('DepositEvent')) {
          const eventData = event.data;
          
          // 检查是否是转入目标地址
          if (eventData && eventData.account === walletAddress) {
            const amount = extractAmountFromEvent(eventData);
            
            if (amount && amount > 0) {
              scanStats.foundTransactions++;
              console.log(`[Aptos Scanner] Detected deposit: ${amount} USDT to ${walletAddress.slice(0, 10)}... (tx: ${txnHash})`);
              
              // 匹配订单
              const matchResult = await dbRecharge.findOrderByAmount(amount, txnHash);
              
              if (matchResult) {
                scanStats.matchedOrders++;
                processedTxns.add(txnHash);
                console.log(`[Aptos Scanner] ✅ Matched order ${matchResult.orderNo}`);
              } else {
                scanStats.unmatchedTransactions++;
                console.log(`[Aptos Scanner] ⚠️  No matching order for amount ${amount}`);
              }
            }
          }
        }
      }
    }

    // 备用方案：从changes中查找
    if (tx.changes && Array.isArray(tx.changes)) {
      for (const change of tx.changes) {
        if (change.type === 'write_resource' && 
            change.address === walletAddress &&
            change.data?.type?.includes('CoinStore') &&
            change.data?.type?.includes('USDT')) {
          
          // 从payload中提取金额
          const payload = tx.payload;
          if (payload?.function?.includes('transfer')) {
            // 检查接收方是否是目标地址
            const receiver = payload.arguments?.[0];
            if (receiver === walletAddress) {
              const amount = extractAmountFromPayload(payload);
              
              if (amount && amount > 0 && !processedTxns.has(txnHash)) {
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
                  console.log(`[Aptos Scanner] ⚠️  No matching order for amount ${amount}`);
                }
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

/**
 * 从交易payload中提取金额
 */
function extractAmountFromPayload(payload: any): number | null {
  try {
    // 通常第二个参数是金额
    if (payload?.arguments && Array.isArray(payload.arguments) && payload.arguments.length >= 2) {
      const amountArg = payload.arguments[1];
      if (typeof amountArg === 'string' || typeof amountArg === 'number') {
        const amount = parseFloat(amountArg.toString()) / 1e6; // USDT通常是6位小数
        return amount;
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}
