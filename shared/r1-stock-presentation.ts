/** R1 的展示升级只作用于既有37号股票标签；稳定ID使改名后配置仍保留。 */
export const R1_STOCK_LEDGER_ID = 37;
export const R1_STOCK_CATEGORY_ID = 90250;
export const R1_AI_DISPLAY_KEY_PREFIX = "__stockAiDisplay_category_";
export type R1StockView = "user" | "admin" | "ai";
export function isR1StockPresentationScope(ledgerId: number, categoryId: number): boolean {
  return ledgerId === R1_STOCK_LEDGER_ID && categoryId === R1_STOCK_CATEGORY_ID;
}
export function r1AiDisplayKey(categoryId: number): string {
  if (!Number.isSafeInteger(categoryId) || categoryId <= 0) throw new Error("标签无效");
  return `${R1_AI_DISPLAY_KEY_PREFIX}${categoryId}`;
}
export type R1StockPresentationContext = {
  ledgerId: 37;
  categoryId: number;
  viewerUserId: number;
  canManage: boolean;
  aiEnabled: boolean;
};
export type R1AiParticipationRow = {
  id: number;
  symbol: string;
  stockName: string;
  currency: "CNY" | "USD" | "USDT";
  quantity: number;
  allocatedQuantity: number;
  allocationRatio: number;
  startDate: string | null;
  status: "active" | "paused" | "closed" | "pending";
  floatingPnl: number | null;
  realizedPnl: number | null;
  totalPnl: number | null;
};
export type R1AiParticipationSummary = {
  floatingPnl: number | null;
  realizedPnl: number | null;
  totalPnl: number | null;
};
export type R1RecordedMargin = {
  assetCode: string;
  amount: string;
};
/** 只含当前用户已算分配结果；禁止扩展成原始组合对象或用spread传出敏感字段。 */
export type R1AiParticipationPortfolio = {
  viewerUserId: number;
  aiEnabled: boolean;
  usdCnyRate: number | null;
  usdtCnyRate: number | null;
  updatedAt: string | null;
  summary: R1AiParticipationSummary;
  participations: R1AiParticipationRow[];
  recordedMargins: R1RecordedMargin[] | null;
  observation: {
    summary: R1AiParticipationSummary;
    participations: R1AiParticipationRow[];
  } | null;
};
