/** AF52 advanced orders accrue management fees only after fulfillment.
 * Ordinary orders retain their original creation-day policy. This helper only
 * resolves a date; it never rewrites submission dates or financial history.
 */
type FeeStartOrder = {
  managementFeeStartAt?: unknown;
  management_fee_start_at?: unknown;
  isAdvanced?: unknown;
  advancedOrderId?: unknown;
  advancedStatus?: unknown;
  status?: unknown;
  fulfilledAt?: unknown;
  confirmedAt?: unknown;
  createdAt?: unknown;
  created_at?: unknown;
};

function validFeeDate(value: unknown): Date | string | null {
  if (!(value instanceof Date) && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? value : null;
}

export function getAfManagementFeeStartAt(order: FeeStartOrder): Date | string | null {
  if (Object.prototype.hasOwnProperty.call(order, 'managementFeeStartAt')) {
    return validFeeDate(order.managementFeeStartAt);
  }
  if (Object.prototype.hasOwnProperty.call(order, 'management_fee_start_at')) {
    return validFeeDate(order.management_fee_start_at);
  }
  if (order.isAdvanced || order.advancedOrderId) {
    const fulfilled = order.advancedStatus === 'fulfilled'
      || (!order.advancedStatus && order.status === 'completed');
    if (!fulfilled) return null;
    return validFeeDate(order.fulfilledAt) || validFeeDate(order.confirmedAt);
  }
  return validFeeDate(order.createdAt ?? order.created_at);
}

/** Trusted alias only; the same-ledger join also covers gifts of advanced orders. */
function advancedFeeSourceMatch(alias: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) throw new Error('Invalid AF fee SQL alias');
  const advancedSource = `CASE WHEN COALESCE(${alias}.is_gift, 0) = 1 THEN ${alias}.source_order_id ELSE ${alias}.id END`;
  return `fee_advanced.order_id = (${advancedSource})
    AND fee_advanced.ledger_id = ${alias}.ledger_id
    AND fee_main.id = fee_advanced.order_id AND fee_main.ledger_id = fee_advanced.ledger_id
    AND COALESCE(fee_main.is_gift, 0) = 0 AND fee_main.side = 'buy'`;
}

export function afHasAdvancedFeeSourceSql(alias: string): string {
  const match = advancedFeeSourceMatch(alias);
  return `(${alias}.ledger_id = 52 AND EXISTS (
    SELECT 1 FROM af_advanced_orders fee_advanced
    INNER JOIN af_orders fee_main ON fee_main.id = fee_advanced.order_id
    WHERE ${match}
  ))`;
}

export function afManagementFeeStartAtSql(alias: string): string {
  const match = advancedFeeSourceMatch(alias);
  return `(CASE WHEN ${afHasAdvancedFeeSourceSql(alias)} THEN (
    SELECT CASE WHEN fee_advanced.status = 'fulfilled'
      THEN COALESCE(fee_advanced.fulfilled_at, fee_main.confirmed_at) ELSE NULL END
    FROM af_advanced_orders fee_advanced
    INNER JOIN af_orders fee_main ON fee_main.id = fee_advanced.order_id
    WHERE ${match} LIMIT 1
  ) ELSE ${alias}.created_at END)`;
}
