// 与 financeGetInterestPaymentSummary 的只读 API 上限保持一致，不改变服务端限制。
export const FINANCE_INTEREST_SUMMARY_BATCH_SIZE = 200;

export type FinanceInterestSummaryInput = { ledgerId: number; orderIds: number[] };
export type FinanceInterestSummaryRow = {
  orderId: number;
  currency: string;
  total: number;
  exchangeRate: number | null;
};

/** 稳定排序、去重后覆盖全部订单；每个查询仍使用原 tRPC procedure 和输入缓存键。 */
export function buildFinanceInterestSummaryInputs(ledgerId: number, orderIds: readonly number[]): FinanceInterestSummaryInput[] {
  const ids = Array.from(new Set(orderIds.filter(id => Number.isInteger(id) && id > 0))).sort((a, b) => a - b);
  const inputs: FinanceInterestSummaryInput[] = [];
  for (let offset = 0; offset < ids.length; offset += FINANCE_INTEREST_SUMMARY_BATCH_SIZE) {
    inputs.push({ ledgerId, orderIds: ids.slice(offset, offset + FINANCE_INTEREST_SUMMARY_BATCH_SIZE) });
  }
  return inputs;
}

type SummaryQueryResult = {
  data?: unknown;
  isSuccess: boolean;
  isError: boolean;
  isPlaceholderData?: boolean;
};

/** 未加载、失败或占位数据均不是“无付款”；只有全部分片成功才发布完整汇总。 */
export function mergeFinanceInterestSummaryResults(
  results: readonly SummaryQueryResult[],
  expectedBatchCount: number,
  enabled: boolean,
): FinanceInterestSummaryRow[] | undefined {
  if (!enabled || results.length !== expectedBatchCount || results.some(result =>
    !result.isSuccess || result.isError || result.isPlaceholderData || result.data == null
  )) return undefined;

  const rows: FinanceInterestSummaryRow[] = [];
  for (const result of results) {
    if (Array.isArray(result.data)) {
      // 不转换金额、币种或历史 FX，保留 API 返回的付款分组。
      rows.push(...result.data);
    } else if (result.data !== null && typeof result.data === 'object') {
      // 兼容原数字映射（U 口径）及服务端空 {}，不为旧数据填充历史 FX。
      for (const [orderId, total] of Object.entries(result.data)) {
        if (!Number.isInteger(Number(orderId)) || Number(orderId) <= 0 || typeof total !== 'number' || !Number.isFinite(total)) return undefined;
        rows.push({ orderId: Number(orderId), currency: 'U', total, exchangeRate: null });
      }
    } else return undefined;
  }
  return rows;
}
