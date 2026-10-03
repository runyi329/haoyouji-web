import * as dbRecharge from "../db-recharge";
import type { RechargeScanTarget } from "../db-recharge";

// Etherscan V2 API（旧版 /api 已停止支持）
const ETHERSCAN_API_URL = 'https://api.etherscan.io/v2/api';
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || ''; // 需要免费API key

// USDT ERC20 Contract Address
const USDT_CONTRACT_ADDRESS = '0xdac17f958d2ee523a2206206994597c13d831ec7';

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
 * 扫描处于支付窗口内订单绑定的ERC20地址。
 */
export async function scanERC20Transactions(targets?: RechargeScanTarget[]) {
  scanStats = {
    scannedAddresses: 0,
    foundTransactions: 0,
    matchedOrders: 0,
    unmatchedTransactions: 0,
  };

  try {
    const wallets = targets ?? (await dbRecharge.getActiveRechargeScanTargets())
      .filter((target) => target.network === 'ERC20');
    
    if (wallets.length === 0) {
      console.log('[ERC20 Scanner] No active ERC20 recharge orders to scan');
      return scanStats;
    }

    if (!ETHERSCAN_API_KEY) {
      console.warn('[ERC20 Scanner] ⚠️  ETHERSCAN_API_KEY not set. ERC20 scanning will be limited.');
    }

    scanStats.scannedAddresses = wallets.length;

    // 扫描每个地址
    for (const wallet of wallets) {
      await scanWalletAddress(wallet.walletAddress, wallet.label || wallet.walletAddress);
    }

    console.log(`[ERC20 Scanner] Scan completed for ${wallets.length} wallet(s)`);
    return scanStats;
    
  } catch (error) {
    console.error('[ERC20 Scanner] Scan error:', error);
    throw error;
  }
}

/**
 * 扫描单个ERC20钱包地址
 */
async function scanWalletAddress(walletAddress: string, label: string) {
  try {
    console.log(`[ERC20 Scanner] Scanning ${label} (${walletAddress.slice(0, 10)}...)...`);
    
    // 构建API请求
    const params = new URLSearchParams({
      chainid: '1',
      module: 'account',
      action: 'tokentx',
      contractaddress: USDT_CONTRACT_ADDRESS,
      address: walletAddress,
      page: '1',
      offset: '20',
      sort: 'desc'
    });

    if (ETHERSCAN_API_KEY) {
      params.append('apikey', ETHERSCAN_API_KEY);
    }

    const response = await fetch(`${ETHERSCAN_API_URL}?${params}`);
    const data = await response.json();

    if (data.status !== '1') {
      console.error(`[ERC20 Scanner] API error: ${data.message}`);
      return;
    }

    const transactions = data.result || [];

    // 处理每笔交易
    for (const tx of transactions) {
      // 只处理转入交易
      if (tx.to.toLowerCase() === walletAddress.toLowerCase()) {
        await processERC20Transaction(tx, walletAddress);
      }
    }

  } catch (error) {
    console.error(`[ERC20 Scanner] Error scanning ${label}:`, error);
  }
}

/**
 * 处理单笔ERC20交易
 */
async function processERC20Transaction(tx: any, walletAddress: string) {
  try {
    const txnHash = tx.hash;
    
    // 跳过已处理的交易
    if (processedTxns.has(txnHash)) {
      return;
    }

    // 提取金额 (USDT有6位小数)
    const amount = parseFloat(tx.value) / 1e6;
    // Etherscan API 返回的 timeStamp 是秒级时间戳，转换为毫秒
    const blockTimestamp = tx.timeStamp ? parseInt(tx.timeStamp) * 1000 : undefined;
    
    if (amount > 0) {
      scanStats.foundTransactions++;
      console.log(`[ERC20 Scanner] Detected transfer: ${amount} USDT from ${tx.from} to ${walletAddress.slice(0, 10)}... (tx: ${txnHash})`);
      
      // 匹配订单（传入txnHash + blockTimestamp双重防重复）
      const matchResult = await dbRecharge.findOrderByAmount(amount, txnHash, blockTimestamp, {
        network: 'ERC20',
        walletAddress,
      });
      
      if (matchResult) {
        const completed = await dbRecharge.completeRechargeOrder(
          matchResult.order.id,
          txnHash,
          amount,
          matchResult.matchType,
        );
        if (completed) {
          scanStats.matchedOrders++;
          processedTxns.add(txnHash);
          console.log(`[ERC20 Scanner] ✅ Order ${matchResult.order.orderNo} completed`);
        }
      } else {
        scanStats.unmatchedTransactions++;
      }
    }

  } catch (error) {
    console.error('[ERC20 Scanner] Error processing transaction:', error);
  }
}
