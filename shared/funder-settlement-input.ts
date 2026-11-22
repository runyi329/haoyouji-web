import { finitePositive } from './usdt-cny-display';

export type FunderSettlementDraftInput = {
  interestEndDate?: string;
  settlementPrice?: string;
  settlementExchangeRate?: string;
  settlementOptionMarkPrice?: string;
};

/** Match the API decimal-string contract; keep an explicit zero, never infer one from blank. */
export function readFunderSettlementOptionMarkInput(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) && number >= 0 ? text : null;
}

/** Validate only confirmed input. A same-day empty option input still allows a server quote. */
export function getFunderSettlementDraftError(
  draft: FunderSettlementDraftInput,
  today: string,
  assetType: unknown,
): string | null {
  const historical = (draft.interestEndDate || today) !== today;
  if (historical && (finitePositive(draft.settlementPrice) === null
    || finitePositive(draft.settlementExchangeRate) === null)) {
    return '历史结算日请填写有效的标的价和 USDT 兑人民币汇率';
  }
  if (assetType !== 'crypto_option') return null;
  const hasManualMark = typeof draft.settlementOptionMarkPrice === 'string'
    && draft.settlementOptionMarkPrice.trim() !== '';
  if ((historical || hasManualMark)
    && readFunderSettlementOptionMarkInput(draft.settlementOptionMarkPrice) === null) {
    return historical
      ? '历史期权结算日请填写真实合约结算价（u/张，归零可填0）'
      : '请填写有效的真实合约结算价（u/张，归零可填0），或留空使用服务器报价';
  }
  return null;
}
