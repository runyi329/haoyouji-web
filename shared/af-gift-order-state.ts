/**
 * Read-time reconciliation for legacy AF52 gifts whose main order was cancelled.
 * This is not a data migration and never creates fills, refunds or wallet entries.
 * Settled sell history is left intact for audit; unsold pending/completed gifts
 * cannot remain active after their same-ledger, non-gift buy source is cancelled.
 */
export function afEffectiveOrderStatusSql(alias: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) {
    throw new Error("Invalid AF order SQL alias");
  }
  return `(CASE WHEN ${alias}.ledger_id = 52
    AND COALESCE(${alias}.is_gift, 0) = 1
    AND ${alias}.status IN ('pending', 'completed')
    AND COALESCE(${alias}.sell_status, '') != 'sold'
    AND ${alias}.sell_confirmed_at IS NULL
    AND EXISTS (
      SELECT 1 FROM af_orders af_gift_source
      WHERE af_gift_source.id = ${alias}.source_order_id
        AND af_gift_source.ledger_id = ${alias}.ledger_id
        AND COALESCE(af_gift_source.is_gift, 0) = 0
        AND af_gift_source.side = 'buy'
        AND af_gift_source.status = 'cancelled'
    ) THEN 'cancelled' ELSE ${alias}.status END)`;
}

export function getAfGiftActivationError(input: {
  ledgerId: number;
  isGift: unknown;
  status?: string;
  sellStatus?: string;
  sourceStatus: string | null;
}): string | null {
  if (input.ledgerId !== 52 || Number(input.isGift) !== 1) return null;
  const requestsSell = input.sellStatus === 'selling' || input.sellStatus === 'sold';
  const requestsBuy = input.status === 'pending' || input.status === 'completed';
  if (!requestsBuy && !requestsSell) return null;
  if (input.sourceStatus === 'cancelled') {
    return '正单已撤销，关联赠单已作废，不能重新委买、确认成交或卖出';
  }
  if (!input.sourceStatus) {
    return '未找到同账本的有效正单，已阻止赠单成交或卖出，请核查关联订单';
  }
  if ((input.status === 'completed' || requestsSell) && input.sourceStatus !== 'completed') {
    return '正单尚未成交，不能单独确认赠单成交或卖出';
  }
  return null;
}
