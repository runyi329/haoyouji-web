import type { R1AiParticipationSummary, R1RecordedMargin } from './r1-stock-presentation';

/** 唯一权威的每用户账本级展示开关；旧标签开关仅保留文本，不读取或迁移。 */
export const LEDGER37_AI_DISPLAY_KEY = '__ledger37AiDisplay';
export type Ledger37AiViewer = {
  userId: number;
  username: string | null;
  nickname: string | null;
  avatar: string | null;
};
export type Ledger37PresentationContext = {
  ledgerId: 37;
  viewerUserId: number;
  canManage: boolean;
  /** 仅日历数字登记，不授予股票或原始AI数据读取权限。 */
  canRecordCalendar?: boolean;
  aiEnabled: boolean;
  viewer?: Ledger37AiViewer | null;
  isViewingAs?: boolean;
};
/** 安全目录：编号使用 categoryId，改名或重排不改变显示名。 */
export type Ledger37AiProject = {
  categoryId: number;
  displayName: string;
  kind: 'stock' | 'ordinary';
  summary: R1AiParticipationSummary | null;
  receivedDividends: number | null;
  recordedMargins: R1RecordedMargin[] | null;
  startDate: string | null;
};
export type Ledger37AiOverview = {
  viewerUserId: number;
  aiEnabled: boolean;
  projects: Ledger37AiProject[];
};
/** 全账本symbol+currency目录；null表示未参与或个人收益/行情/汇率未知，不能补零。 */
export type StockPoolRow = {
  symbol: string;
  stockName: string;
  currency: 'CNY' | 'USD' | 'USDT';
  status: 'holding' | 'closed';
  pnlCny: number | null;
  hasParticipation: boolean;
};
export type Ledger37AiStockPoolRow = StockPoolRow;
export type Ledger37AiStockPool = {
  viewerUserId: number;
  aiEnabled: boolean;
  stocks: StockPoolRow[];
};
export type Ledger37AiDisplayResult = { success: true; aiEnabled: boolean };
