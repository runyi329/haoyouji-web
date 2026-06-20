import * as dbRecharge from "../db-recharge";

// BscScan API配置
const BSCSCAN_API_URL = 'https://api.bscscan.com/api';
const BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY || ''; // 需要免费API key

// USDT BEP20 Contract Address
const USDT_CONTRACT_ADDRESS = '0x55d398326f99059ff775485246999027b3197955';

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
 * 扫描BSC网络的USDT交易
 */
export async function scanBSCTransactions() {
  scanStats = {
    scannedAddresses: 0,
    foundTransactions: 0,
    matchedOrders: 0,
    unmatchedTransactions: 0,
  };

  try {
    // 获取所有启用的BEP20地址
    const wallets = await dbRecharge.getEnabledWalletAddresses('BEP20');
    
    if (wallets.length === 0) {
      console.log('[BSC Scanner] No enabled BEP20 wallet addresses found');
      return scanStats;
    }

    if (!BSCSCAN_API_KEY) {
      console.warn('[BSC Scanner] ⚠️  BSCSCAN_API_KEY not set. BSC scanning will be limited.');
    }

    scanStats.scannedAddresses = wallets.length;

    // 扫描每个地址
    for (const wallet of wallets) {
      await scanWalletAddress(wallet.address, wallet.label || wallet.address);
    }

    console.log(`[BSC Scanner] Scan completed for ${wallets.length} wallet(s)`);
    return scanStats;
    
  } catch (error) {
    console.error('[BSC Scanner] Scan error:', error);
    throw error;
  }
}

/**
 * 扫描单个BSC钱包地址
 */
async function scanWalletAddress(walletAddress: string, label: string) {
  try {
    console.log(`[BSC Scanner] Scanning ${label} (${walletAddress.slice(0, 10)}...)...`);
    
    // 构建API请求
    const params = new URLSearchParams({
      module: 'account',
      action: 'tokentx',
      contractaddress: USDT_CONTRACT_ADDRESS,
      address: walletAddress,
      page: '1',
      offset: '20',
      sort: 'desc'
    });

    if (BSCSCAN_API_KEY) {
      params.append('apikey', BSCSCAN_API_KEY);
    }

    const response = await fetch(`${BSCSCAN_API_URL}?${params}`);
    const data = await response.json();

    if (data.status !== '1') {
      console.error(`[BSC Scanner] API error: ${data.message}`);
      return;
    }

    const transactions = data.result || [];

    // 处理每笔交易
    for (const tx of transactions) {
      // 只处理转入交易
      if (tx.to.toLowerCase() === walletAddress.toLowerCase()) {
        await processBSCTransaction(tx, walletAddress);
      }
    }

  } catch (error) {
    console.error(`[BSC Scanner] Error scanning ${label}:`, error);
  }
}

/**
 * 处理单笔BSC交易
 */
async function processBSCTransaction(tx: any, walletAddress: string) {
  try {
    const txnHash = tx.hash;
    
    // 跳过已处理的交易
    if (processedTxns.has(txnHash)) {
      return;
    }

    // 提取金额 (USDT朐18位小数在BSC上)
    const amount = parseFloat(tx.value) / 1e18;
    // BSCScan API 返回的 timeStamp 是秒级时间戳，转换为毫秒
    const blockTimestamp = tx.timeStamp ? parseInt(tx.timeStamp) * 1000 : undefined;
    
    if (amount > 0) {
      scanStats.foundTransactions++;
      console.log(`[BSC Scanner] Detected transfer: ${amount} USDT from ${tx.from} to ${walletAddress.slice(0, 10)}... (tx: ${txnHash})`);
      
      // 匹配订单（传入txnHash + blockTimestamp双重防重复）
      const matchResult = await dbRecharge.findOrderByAmount(amount, txnHash, blockTimestamp);
      
      if (matchResult) {
        scanStats.matchedOrders++;
        processedTxns.add(txnHash);
        console.log(`[BSC Scanner] ✅ Matched order ${matchResult.orderNo}`);
      } else {
        scanStats.unmatchedTransactions++;
      }
    }

  } catch (error) {
    console.error('[BSC Scanner] Error processing transaction:', error);
  }
}
