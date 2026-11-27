import { isCryptoAssetCode } from '../shared/crypto-asset-catalog';

/** 已获得权限的订单行只提取市场资产引用，不读取用户或数据库。 */
export function getOrderCryptoQuoteSymbols(orders: readonly unknown[]): string[] {
  const codes = new Set<string>();
  const add = (raw: unknown) => {
    if (typeof raw !== 'string') return;
    const code = raw.trim().toUpperCase();
    if (isCryptoAssetCode(code)) codes.add(code);
  };
  const parse = (raw: unknown): unknown => {
    if (Buffer.isBuffer(raw)) raw = raw.toString('utf8');
    if (typeof raw !== 'string') return raw;
    try { return JSON.parse(raw); } catch { return null; }
  };
  const visit = (raw: unknown, depth: number) => {
    if (depth > 5) return;
    const row = parse(raw);
    if (!row || typeof row !== 'object' || Array.isArray(row)) return;
    const value = row as Record<string, unknown>;
    if (['settled', 'completed', 'cancelled'].includes(String(value.status ?? '').toLowerCase()) || value.settlement_snapshot != null) return;
    for (const key of ['coin', 'amount_currency', 'collateral_coin', 'interest_base_currency', 'interest_rate_currency', 'denomination']) add(value[key]);
    for (const key of ['collateral_assets', 'lent_out_assets', 'joint_order_segments']) {
      const list = parse(value[key]);
      if (Array.isArray(list)) for (const item of list) visit(item, depth + 1);
    }
    for (const key of ['option_info', 'order_snapshot']) visit(value[key], depth + 1);
  };
  for (const order of orders) visit(order, 0);
  return Array.from(codes);
}
