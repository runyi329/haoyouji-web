import * as dbRecharge from "../db-recharge";
import type { RechargeScanTarget } from "../db-recharge";
import { fetchWithTimeout } from "./fetch-with-timeout";

// Aptos Indexer GraphQL API配置
const INDEXER_API_URL = 'https://api.mainnet.aptoslabs.com/v1/graphql';

// Aptos 上历史和新版原生USDt的白名单。只按链上metadata/完整资产类型核验，
// 不用显示名称“USDT”做模糊判断，以免将同名伪资产入账。
const USDT_ASSET_TYPE = '0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDT';
const APTOS_NATIVE_USDT_METADATA = '0x357b0b74bc833e95a115ad22604854d6b0fca151cecd94111770e5d6ffc9dc2b';

function normalizeAptosAddress(value: string): string {
  const raw = value.trim().toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{1,64}$/.test(raw)) return '';
  return `0x${raw.padStart(64, '0')}`;
}

const APTOS_USDT_METADATA_ADDRESSES = new Set([
  USDT_ASSET_TYPE.split('::')[0],
  APTOS_NATIVE_USDT_METADATA,
].map(normalizeAptosAddress));

export function isSupportedAptosUsdt(assetType: unknown): boolean {
  const raw = String(assetType ?? '').trim();
  const metadata = normalizeAptosAddress(raw.split('::')[0] || '');
  return Boolean(metadata && APTOS_USDT_METADATA_ADDRESSES.has(metadata));
}

// 同一个Aptos transaction version可能含多个资产事件，因此使用storage_id等事件标识去重。
const processedEvents = new Set<string>();

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
    const wallets = (targets ?? await dbRecharge.getActiveRechargeScanTargets())
      .filter((target) => target.network === 'APTOS');
    
    if (wallets.length === 0) {
      console.log('[Aptos Scanner] No active APTOS recharge orders to scan');
      return scanStats;
    }

    scanStats.scannedAddresses = wallets.length;

    // 扫描每个地址
    for (const wallet of wallets) {
      await scanWalletAddress(wallet);
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
async function scanWalletAddress(target: RechargeScanTarget) {
  const walletAddress = target.walletAddress;
  const label = target.label || walletAddress;
  try {
    console.log(`[Aptos Scanner] Scanning ${label} (${walletAddress.slice(0, 10)}...)...`);
    
    // 优先从该地址最早仍可核对订单开始扫描，最多72小时；用分页避免高频地址只拿到最新50条。
    const targetSince = target.scanSince ? new Date(target.scanSince).getTime() : NaN;
    const fallbackSince = Date.now() - 24 * 60 * 60 * 1000;
    const since = new Date(Math.max(Date.now() - dbRecharge.RECHARGE_RECONCILIATION_HOURS * 60 * 60 * 1000, Number.isFinite(targetSince) ? targetSince : fallbackSince)).toISOString();
    
    // GraphQL查询：获取该地址的Fungible Asset Deposit活动
    const query = `
      query GetFungibleAssetDeposits($owner_address: String!, $since: timestamp!, $offset: Int!) {
        fungible_asset_activities(
          where: {
            owner_address: { _eq: $owner_address }
            type: { _like: "%Deposit%" }
            transaction_timestamp: { _gte: $since }
            is_transaction_success: { _eq: true }
          }
          order_by: { transaction_version: desc }
          limit: 50
          offset: $offset
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
    
    for (let offset = 0; offset < 200; offset += 50) {
      const response = await fetchWithTimeout(INDEXER_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { owner_address: walletAddress, since, offset } }),
      });
      if (!response.ok) throw new Error(`Aptos GraphQL HTTP ${response.status}`);
      const result = await response.json();
      if (result.errors) throw new Error(`Aptos GraphQL错误：${JSON.stringify(result.errors).slice(0, 300)}`);
      const activities = result.data?.fungible_asset_activities || [];
      if (activities.length === 0) break;
      console.log(`[Aptos Scanner] Found ${activities.length} deposit activities (offset ${offset})`);
      for (const activity of activities) {
        await processDepositActivity(activity, walletAddress);
      }
      if (activities.length < 50) break;
    }

  } catch (error) {
    console.error(`[Aptos Scanner] Error scanning ${label}:`, error);
    throw error;
  }
}

/**
 * 处理单个Deposit活动
 */
async function processDepositActivity(activity: any, walletAddress: string) {
  try {
    const txVersion = activity.transaction_version.toString();
    const eventId = String(activity.storage_id || `${txVersion}:${activity.entry_function_id_str || 'deposit'}`);
    
    // 跳过已处理的交易
    if (processedEvents.has(eventId)) {
      return;
    }

    // Aptos Indexer 的 asset_type 可能返回完整类型或 metadata 地址；两种表示均严格限定为 USDT。
    const assetType = String(activity.asset_type ?? '').trim();
    if (!isSupportedAptosUsdt(assetType)) {
      console.warn(`[Aptos Scanner] Ignoring non-whitelisted USDT asset: ${assetType || 'unknown'}`);
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
    const chainEvent = await dbRecharge.recordRechargeChainEvent({
      network: 'APTOS',
      transactionId: txVersion,
      eventId,
      walletAddress,
      tokenContract: normalizeAptosAddress(assetType.split('::')[0] || ''),
      assetType,
      amount,
      blockHeight: txVersion,
      blockTimestamp,
      matchReason: '等待订单核对',
    });

    // 匹配订单（传入txVersion + blockTimestamp双重防重复）
    const matchResult = await dbRecharge.findOrderByAmount(amount, txVersion, blockTimestamp, {
      network: 'APTOS',
      walletAddress,
    });

    if (!matchResult) {
      console.log(`[Aptos Scanner] ⚠️ No matching order for ${amount} USDT; recorded chain event #${chainEvent.id}`);
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
    const success = await dbRecharge.completeRechargeOrder(order.id, txVersion, amount, matchType, Number(chainEvent.id));

    if (success) {
      console.log(`[Aptos Scanner] ✅ Order ${order.orderNo} completed! User ${order.userId} +${amount} USDT (match: ${matchType})`);
      scanStats.matchedOrders++;
      processedEvents.add(eventId);
    }

  } catch (error) {
    console.error('[Aptos Scanner] Error processing deposit activity:', error);
    throw error;
  }
}
