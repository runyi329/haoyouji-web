import * as dbRecharge from "../db-recharge";
import type { RechargeScanTarget } from "../db-recharge";

// Aptos Indexer GraphQL API配置
const INDEXER_API_URL = 'https://api.mainnet.aptoslabs.com/v1/graphql';

// USDT on Aptos (LayerZero USDT) - Fungible Asset Metadata地址
const USDT_ASSET_TYPE = '0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDT';
const USDT_METADATA_ADDRESS = USDT_ASSET_TYPE.split('::')[0].toLowerCase();

// 已处理的交易版本号
const processedTxns = new Set<string>();

// 扫描统计
export let scanStats = {
  scannedAddresses: 0,
  foundTransactions: 0,
  matchedOrders: 0,
  unmatchedTransactions: 0,
};

/**
 * 扫描处于支付窗口内订单绑定的Aptos地址。
 */
export async function scanAptosTransactions(targets?: RechargeScanTarget[]) {
  scanStats = {
    scannedAddresses: 0,
    foundTransactions: 0,
    matchedOrders: 0,
    unmatchedTransactions: 0,
  };

  try {
    const wallets = targets ?? (await dbRecharge.getActiveRechargeScanTargets())
      .filter((target) => target.network === 'APTOS');
    
    if (wallets.length === 0) {
      console.log('[Aptos Scanner] No active APTOS recharge orders to scan');
      return scanStats;
    }

    scanStats.scannedAddresses = wallets.length;

    // 扫描每个地址
    for (const wallet of wallets) {
      await scanWalletAddress(wallet.walletAddress, wallet.label || wallet.walletAddress);
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
 * 使用GraphQL Indexer API查询转入该地址的USDT交易
 */
async function scanWalletAddress(walletAddress: string, label: string) {
  try {
    console.log(`[Aptos Scanner] Scanning ${label} (${walletAddress.slice(0, 10)}...)...`);
    
    // 计算24小时前的时间戳
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    // GraphQL查询：获取该地址的Fungible Asset Deposit活动
    const query = `
      query GetFungibleAssetDeposits($owner_address: String!, $since: timestamp!) {
        fungible_asset_activities(
          where: {
            owner_address: { _eq: $owner_address }
            type: { _like: "%Deposit%" }
            transaction_timestamp: { _gte: $since }
            is_transaction_success: { _eq: true }
          }
          order_by: { transaction_version: desc }
          limit: 50
        ) {
          transaction_version
          transaction_timestamp
          type
          amount
          asset_type
          storage_id
          entry_function_id_str
          is_transaction_success
        }
      }
    `;
    
    const response = await fetch(INDEXER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: {
          owner_address: walletAddress,
          since: oneDayAgo
        }
      })
    });

    if (!response.ok) {
      console.error(`[Aptos Scanner] GraphQL API error: ${response.status}`);
      return;
    }

    const result = await response.json();

    if (result.errors) {
      console.error(`[Aptos Scanner] GraphQL errors:`, result.errors);
      return;
    }

    const activities = result.data?.fungible_asset_activities || [];

    if (activities.length === 0) {
      return;
    }

    console.log(`[Aptos Scanner] Found ${activities.length} deposit activities`);

    // 处理每个Deposit活动
    for (const activity of activities) {
      await processDepositActivity(activity, walletAddress);
    }

  } catch (error) {
    console.error(`[Aptos Scanner] Error scanning ${label}:`, error);
  }
}

/**
 * 处理单个Deposit活动
 */
async function processDepositActivity(activity: any, walletAddress: string) {
  try {
    const txVersion = activity.transaction_version.toString();
    
    // 跳过已处理的交易
    if (processedTxns.has(txVersion)) {
      return;
    }

    // Aptos Indexer 的 asset_type 可能返回完整类型或 metadata 地址；两种表示均严格限定为 USDT。
    const assetType = String(activity.asset_type ?? '').trim().toLowerCase();
    if (assetType !== USDT_ASSET_TYPE.toLowerCase() && assetType !== USDT_METADATA_ADDRESS) {
      console.warn(`[Aptos Scanner] Ignoring non-USDT deposit asset: ${assetType || 'unknown'}`);
      return;
    }

    // 解析金额（USDT有6位小数）
    const amount = parseFloat(activity.amount) / 1e6;
    
    if (amount <= 0) {
      return;
    }

    scanStats.foundTransactions++;

    const timestamp = new Date(activity.transaction_timestamp).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    // Aptos 的 transaction_timestamp 是 ISO 字符串，转换为毫秒时间戳
    const blockTimestamp = activity.transaction_timestamp ? new Date(activity.transaction_timestamp).getTime() : undefined;
    console.log(`[Aptos Scanner] 🎯 Detected INCOMING transfer: ${amount} USDT to ${walletAddress.slice(0, 10)}... (version: ${txVersion}, time: ${timestamp})`);

    // 匹配订单（传入txVersion + blockTimestamp双重防重复）
    const matchResult = await dbRecharge.findOrderByAmount(amount, txVersion, blockTimestamp, {
      network: 'APTOS',
      walletAddress,
    });

    if (!matchResult) {
      // 未匹配时不加入 processedTxns，下次扫描会重试
      // 只有成功完成订单后才加入，防止重复入账
      console.log(`[Aptos Scanner] ⚠️  No matching order for amount ${amount} USDT, will retry next scan`);
      scanStats.unmatchedTransactions++;
      return;
    }

    const { order, matchType, amountDiff } = matchResult;

    if (matchType === 'exact') {
      console.log(`[Aptos Scanner] ✅ Exact match! Order ${order.orderNo}, amount ${amount} USDT`);
    } else {
      console.log(`[Aptos Scanner] 🔄 Fuzzy match! Order ${order.orderNo}, order amount ${order.amount}, actual ${amount} USDT, diff ${amountDiff}`);
    }

    // 完成订单
    const success = await dbRecharge.completeRechargeOrder(order.id, txVersion, amount, matchType);

    if (success) {
      console.log(`[Aptos Scanner] ✅ Order ${order.orderNo} completed! User ${order.userId} +${amount} USDT (match: ${matchType})`);
      scanStats.matchedOrders++;
      processedTxns.add(txVersion);
    }

  } catch (error) {
    console.error('[Aptos Scanner] Error processing deposit activity:', error);
  }
}
