import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject, type SetStateAction } from "react";
import { useLocation, useParams, useSearch } from "wouter";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  BellRing,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  Handshake,
  Lock,
  Repeat2,
  LockOpen,
  Minus,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useOptionGreeks } from "@/hooks/useOptionGreeks";
import { OrderCardImageDownload } from "@/components/OrderCardImageDownload";

/** T+0账本采用页面内状态与确认页反馈，不显示顶部下拉式操作提示。 */
const t0Toast = {
  success: (..._args: unknown[]) => undefined,
  error: (..._args: unknown[]) => undefined,
  message: (..._args: unknown[]) => undefined,
};

type TradeAction = "openLong" | "closeLong" | "openShort" | "closeShort";
type PositionSide = "long" | "short";
type T0InstrumentType = "spot" | "contract" | "option" | "grid";
type T0OptionDirection = "long_call" | "long_put" | "short_call" | "short_put";
type T0OptionPremiumCurrency = "USDT" | "ETH";
type T0GridDirection = "long" | "short";
type T0JournalPayoutDirection = "withdrawal" | "deposit";
type T0JournalPayoutLog = {
  id: string;
  relatedUserId: number;
  relatedUserName: string;
  occurredOn: string;
  direction: T0JournalPayoutDirection;
  amount: number;
  ethReferencePrice?: string;
  ethQuantity?: string;
  depositInputMode?: "u" | "eth";
  note?: string;
  createdAt: string;
};
/** 编辑普通现货/合约开仓时的保存前复核：防止数量与成交价被误写反。 */
type OpeningEditSaveSafetyReview = {
  manualConfirmPendingFill: boolean;
  quantity: number;
  price: number;
  markPrice: number | null;
  priceDeviation: number | null;
  quantityExceeded: boolean;
  priceDeviationExceeded: boolean;
};
type OpeningEditSaveSafetySignal = Omit<OpeningEditSaveSafetyReview, "manualConfirmPendingFill">;
const T0_OPENING_EDIT_QUANTITY_REVIEW_LIMIT = 300;
const T0_OPENING_EDIT_PRICE_DEVIATION_REVIEW_LIMIT = 250;
function getOpeningEditSaveSafetySignal(input: {
  quantity: number;
  price: number;
  markPrice: number | null;
  originalQuantity?: number;
  originalPrice?: number;
}): OpeningEditSaveSafetySignal | null {
  const quantityChanged = input.originalQuantity === undefined || Math.abs(input.quantity - input.originalQuantity) > 0.0000001;
  const priceChanged = input.originalPrice === undefined || Math.abs(input.price - input.originalPrice) > 0.0000001;
  const priceDeviation = input.markPrice !== null && Number.isFinite(input.markPrice) && input.markPrice > 0
    ? Math.abs(input.price - input.markPrice)
    : null;
  const quantityExceeded = quantityChanged && input.quantity > T0_OPENING_EDIT_QUANTITY_REVIEW_LIMIT;
  const priceDeviationExceeded = priceChanged
    && priceDeviation !== null
    && priceDeviation > T0_OPENING_EDIT_PRICE_DEVIATION_REVIEW_LIMIT;
  if (!quantityExceeded && !priceDeviationExceeded) return null;
  return {
    quantity: input.quantity,
    price: input.price,
    markPrice: input.markPrice,
    priceDeviation,
    quantityExceeded,
    priceDeviationExceeded,
  };
}

/**
 * ETH 处于四位数报价时，录入框只固定展示实时价前两位；后两位和小数由管理员快速补齐。
 * 前缀只是界面辅助，绝不直接写入表单或订单事实。
 */
function getT0EthPriceInputPrefix(markPrice: number | null): string {
  if (markPrice === null || !Number.isFinite(markPrice) || markPrice < 1_000 || markPrice >= 10_000) return "";
  return String(Math.trunc(markPrice)).slice(0, 2);
}

function limitT0ManualDecimalInput(value: string, maximumFractionDigits: number): string {
  const normalized = value.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const firstDecimal = normalized.indexOf(".");
  const integerPart = (firstDecimal === -1 ? normalized : normalized.slice(0, firstDecimal)).replace(/\D/g, "");
  if (firstDecimal === -1) return integerPart;
  const fractionalPart = normalized.slice(firstDecimal + 1).replace(/\D/g, "").slice(0, maximumFractionDigits);
  return `${integerPart}.${fractionalPart}`;
}

/** 人工录入ETH数量：最多500.00，整数最多三位，小数最多两位。 */
function limitT0EthQuantityInput(value: string): string {
  const normalized = limitT0ManualDecimalInput(value, 2);
  const firstDecimal = normalized.indexOf(".");
  const integerPart = (firstDecimal === -1 ? normalized : normalized.slice(0, firstDecimal)).slice(0, 3);
  const fractionalPart = firstDecimal === -1 ? "" : normalized.slice(firstDecimal + 1);
  const hasDecimal = firstDecimal !== -1;
  if (!integerPart && !fractionalPart) return "";
  const numericValue = Number(`${integerPart || "0"}${hasDecimal ? `.${fractionalPart}` : ""}`);
  if (Number.isFinite(numericValue) && numericValue > 500) return "500";
  return hasDecimal ? `${integerPart}.${fractionalPart}` : integerPart;
}

function normalizeT0MarketPriceInput(value: string, prefix = "", autoAppendDecimal = true): string {
  const normalized = limitT0ManualDecimalInput(value, 2);
  const firstDecimal = normalized.indexOf(".");
  const integerPart = (firstDecimal === -1 ? normalized : normalized.slice(0, firstDecimal)).replace(/\D/g, "");
  const fractionalPart = firstDecimal === -1 ? "" : normalized.slice(firstDecimal + 1).replace(/\D/g, "");
  const hasDecimal = firstDecimal !== -1;
  if (!integerPart && !fractionalPart) return "";

  // 输入不足四位时视为“实时前缀后的尾数”；手动输入满四位则尊重为完整成交价。
  const fullInteger = prefix && integerPart.length < 4 ? `${prefix}${integerPart}` : integerPart;
  const fullValue = `${fullInteger}${hasDecimal ? `.${fractionalPart}` : ""}`;
  return autoAppendDecimal && /^\d{4}$/.test(fullValue) ? `${fullValue}.` : fullValue;
}
type SharedIncomeTransfer = {
  id: string;
  closingEntryId: string;
  sourceUserId: number;
  sourceUserName: string;
  recipientUserId: number;
  recipientUserName: string;
  recipientUsername?: string;
  amount: number;
  sourceNetPnl: number;
  shareableAmount: number;
  reducesRegularDistribution: boolean;
  createdAt: string;
};
type SharedIncomeReduction = {
  amount: number;
  sourceNetPnl: number;
};
type SharedIncomeEligibility = {
  sourceUserId: number;
  recipientUserId: number;
  enabled: boolean;
  updatedAt?: string;
};
type SharedIncomeAllocationBudgetMode = "percentage" | "amount";
type SharedIncomeAllocationMetric = "principal" | "historicalProfit" | "holdingLoss" | "realizedAnnualized" | "externalShareContribution" | "receivedSharedAmountGap" | "receivedSharedCountGap" | "withdrawalProgress" | "openingOrderCount";
type SharedIncomePrincipalRule = {
  /** 0% 是全员均分，100% 是完全按本金曲线。 */
  influencePercentage: number;
  curve: "linear" | "balanced" | "strong";
};
const DEFAULT_SHARED_INCOME_PRINCIPAL_RULE: SharedIncomePrincipalRule = {
  // 保持当前线上默认“完全按本金比例”，设置页仅供管理员先试算平滑方案。
  influencePercentage: 100,
  curve: "linear",
};
function getSharedIncomePrincipalCurveExponent(curve: SharedIncomePrincipalRule["curve"]) {
  return curve === "strong" ? 0.35 : curve === "balanced" ? 0.5 : 1;
}
function getSharedIncomePrincipalCurveLabel(curve: SharedIncomePrincipalRule["curve"]) {
  return curve === "strong" ? "强平滑" : curve === "balanced" ? "平滑比例" : "直接比例";
}
function getSharedIncomePrincipalGuideExample(rule: SharedIncomePrincipalRule) {
  /** 0.5%、1.5%、3%、5%、8%、12%、17%、23%、30%：由小到大完整覆盖。 */
  const principals = [50, 150, 300, 500, 800, 1_200, 1_700, 2_300, 3_000];
  const principalTotal = principals.reduce((total, principal) => total + principal, 0);
  const influence = Math.min(100, Math.max(0, Number(rule.influencePercentage) || 0)) / 100;
  const scores = principals.map((principal) => Math.pow(principal, getSharedIncomePrincipalCurveExponent(rule.curve)));
  const scoreTotal = scores.reduce((total, score) => total + score, 0);
  return principals.map((principal, index) => ({
    principal,
    principalShare: principalTotal > 0 ? principal / principalTotal : 0,
    allocation: 100 * ((1 - influence) / principals.length + (scoreTotal > 0 ? influence * scores[index] / scoreTotal : 0)),
  }));
}
const SHARED_INCOME_ALLOCATION_DIMENSIONS: ReadonlyArray<{
  id: SharedIncomeAllocationMetric;
  label: string;
  category: string;
  compactLabel: string;
  emptyMessage: string;
  guideDescription: string;
  guideFormula: string;
  accent: string;
}> = [
  { id: "principal", label: "按本金比例", category: "规模公平", compactLabel: "本金", emptyMessage: "当前开启的分配人没有已登记本金", guideDescription: "按实际累计投入的比例分配，投入规模越大，本维度的分配份额越高。", guideFormula: "累计投入占比 → 本维度份额", accent: "#2563eb" },
  { id: "historicalProfit", label: "按已获利润", category: "收益激励", compactLabel: "已获利润", emptyMessage: "当前开启的分配人没有已获得的历史利润", guideDescription: "以已实现订单收益与既得共享收益为依据，回馈持续创造实际收益的参与者。", guideFormula: "已获历史利润占比 → 本维度份额", accent: "#f59e0b" },
  { id: "holdingLoss", label: "按持仓浮亏", category: "风险补偿", compactLabel: "持仓浮亏", emptyMessage: "当前开启的分配人没有持仓浮亏", guideDescription: "仅参考当前仍持有仓位的浮亏，浮亏越多，本维度补偿权重越高。", guideFormula: "未实现浮亏占比 → 本维度份额", accent: "#059669" },
  { id: "realizedAnnualized", label: "按实现年化", category: "收益平衡", compactLabel: "已实现年化", emptyMessage: "当前开启的分配人没有可计算的已实现年化补差", guideDescription: "以所有有效参与人的已实现年化均值为目标，优先补足低于均值者，让长期回报趋向平衡。", guideFormula: "距平均年化的补足额 → 本维度份额", accent: "#7c3aed" },
  { id: "externalShareContribution", label: "按对外共享贡献", category: "协作回馈", compactLabel: "贡献权重", emptyMessage: "当前开启的分配人还没有对外共享贡献记录", guideDescription: "同时参考对外共享金额和贡献订单次数，回馈已为其他成员创造共享收益的人。", guideFormula: "共享金额与订单次数综合 → 本维度份额", accent: "#0f766e" },
  { id: "receivedSharedAmountGap", label: "按收到共享金额补差", category: "分配均衡", compactLabel: "收到共享", emptyMessage: "当前没有可参与收到共享金额补差的分配人", guideDescription: "历史收到共享金额越少，补差权重越高，避免收益机会长期集中。", guideFormula: "最高已收金额 − 个人已收金额 → 权重", accent: "#e11d48" },
  { id: "receivedSharedCountGap", label: "按收到共享次数补差", category: "机会均衡", compactLabel: "收到次数", emptyMessage: "当前没有可参与收到共享次数补差的分配人", guideDescription: "历史收到共享的次数越少，机会补差越多，保障每个人都持续有参与感。", guideFormula: "最高已收次数 − 个人已收次数 → 权重", accent: "#db2777" },
  { id: "withdrawalProgress", label: "按提现进度", category: "回款平衡", compactLabel: "提现占比", emptyMessage: "当前开启的分配人没有可计算的提现进度", guideDescription: "提现占投入比例越低，本维度速度越高；始终保留最低档，不会把有效成员排空。", guideFormula: "权重 = 100 − 提现进度（最低 1）", accent: "#0284c7" },
  { id: "openingOrderCount", label: "按挂单数量", category: "市场贡献", compactLabel: "挂单数量", emptyMessage: "当前开启的分配人没有可统计的开仓或挂单记录", guideDescription: "统计现货、合约、期权、网格的全部开仓记录；已成交和当前挂单均计入，多空直接相加不抵消。倾斜度100%时，零笔用户不获得本维度份额。", guideFormula: "均分保障 + 挂单数量比例 → 本维度份额", accent: "#4f46e5" },
];

function getSharedIncomeAllocationClientVisual(metric: SharedIncomeAllocationMetric): { metricLabel: string; directionLabel: string; priorityLabel: string } {
  switch (metric) {
    case "historicalProfit": return { metricLabel: "已获利润", directionLabel: "越多", priorityLabel: "越优先" };
    case "holdingLoss": return { metricLabel: "持仓浮亏", directionLabel: "越多", priorityLabel: "越优先" };
    case "realizedAnnualized": return { metricLabel: "实现年化", directionLabel: "越少", priorityLabel: "越优先" };
    case "externalShareContribution": return { metricLabel: "对外共享", directionLabel: "越多", priorityLabel: "越优先" };
    case "receivedSharedAmountGap": return { metricLabel: "已收共享", directionLabel: "越少", priorityLabel: "越优先" };
    case "receivedSharedCountGap": return { metricLabel: "已收次数", directionLabel: "越少", priorityLabel: "越优先" };
    case "withdrawalProgress": return { metricLabel: "提现进度", directionLabel: "越少", priorityLabel: "越优先" };
    case "openingOrderCount": return { metricLabel: "挂单数量", directionLabel: "越多", priorityLabel: "越优先" };
    default: return { metricLabel: "参与条件", directionLabel: "符合", priorityLabel: "越优先" };
  }
}
type T0ReopenReminder = {
  id: string;
  sourceOpeningEntryId: string;
  accountId: string;
  accountName: string;
  relatedUserId?: string;
  relatedUserName?: string;
  relatedUsername?: string;
  relatedFundId?: string;
  relatedFundName?: string;
  symbol: string;
  instrumentType: T0InstrumentType;
  side: PositionSide;
  anchorPrice: number;
  defaultQuantity: number;
};

type T0JournalSystemActivity = {
  id: string;
  type: "auto_fill" | "recovery_fill" | "take_profit" | "expiry_settlement";
  entryId: string;
  occurredAt: string;
  occurredAtLabel?: string;
  recordedAt: string;
  action: string;
  quantity: number;
  price: number;
  accountName?: string;
  relatedUserName?: string;
  note?: string;
};
type TotalProfitAttributionDetailEntry = {
  id: string;
  kind: "order" | "commission" | "shared";
  createdAt: string;
  amount: number;
  trade?: PreviewTrade;
  quantity?: number;
  transfer?: SharedIncomeTransfer;
  sourceTrade?: PreviewTrade;
  recipientName?: string;
};
type T0TotalProfitContextSummaryItem = {
  id: string;
  label: string;
  value: string;
  unit?: string;
  detail?: string;
  detailBelow?: boolean;
  color: string;
  trackColor: string;
  gradient: string;
  progress?: number;
};
type T0TotalProfitContextSummary = {
  title: string;
  subtitle: string;
  centerLabel: string;
  totalText: string;
  centerUnit?: string;
  totalToneClass: string;
  ringBackground: string;
  items: T0TotalProfitContextSummaryItem[];
};

function T0TotalProfitContextSummaryCard({ summary, animated }: { summary: T0TotalProfitContextSummary; animated: boolean }) {
  const [whole, fraction] = summary.totalText.split(".");
  const wholeFontSize = whole.length >= 8 ? 12 : whole.length >= 7 ? 13 : 15;
  return <section className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5" aria-label={summary.title}>
    <div className="flex items-center justify-between gap-3">
      <div className="text-xs font-semibold text-slate-800">{summary.title}</div>
      <div className="shrink-0 text-[10px] text-slate-400">{summary.subtitle}</div>
    </div>
    <div className="mt-2 grid grid-cols-[88px_minmax(0,1fr)] items-center gap-2.5">
      <div className="relative h-[88px] w-[88px] shrink-0 rounded-full shadow-sm" style={{ background: summary.ringBackground }}>
        <div className="absolute inset-[8px] flex min-w-0 flex-col items-center justify-center rounded-full bg-white px-1 shadow-[inset_0_1px_2px_rgba(15,23,42,0.05)]">
          <span className="text-[9px] font-medium text-slate-400">{summary.centerLabel}</span>
          <span title={`${summary.totalText} ${summary.centerUnit || "U"}`} className={`mt-1 max-w-full whitespace-nowrap font-bold leading-none tracking-[-0.055em] tabular-nums ${summary.totalToneClass}`} style={{ fontSize: `${wholeFontSize}px` }}>{whole}</span>
          <span className="mt-1 whitespace-nowrap text-[9px] font-semibold leading-none tabular-nums text-slate-400">{fraction ? `.${fraction}` : ""}<span className="ml-0.5 text-[8px]">{summary.centerUnit || "U"}</span></span>
        </div>
      </div>
      <div className="min-w-0 overflow-hidden rounded-lg border border-slate-100 bg-white/90 shadow-[0_1px_2px_rgba(15,23,42,0.03)] divide-y divide-slate-100">
        {summary.items.map((item, index) => {
          const progress = item.progress === undefined ? undefined : Math.max(0, Math.min(1, item.progress));
          return <div key={item.id} className="px-2.5 py-1">
            <div className="flex min-w-0 items-center gap-1.5 text-[10px] leading-none"><span className="flex min-w-0 items-center gap-1 font-medium text-slate-600"><i className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} /><span className="shrink-0">{item.label}</span><span className="min-w-0 truncate font-bold tracking-[-0.035em] tabular-nums" style={{ color: item.color }}>{item.value}{item.unit && <span className="ml-0.5 text-[8px] font-medium text-slate-400">{item.unit}</span>}</span></span>{!item.detailBelow && <span className="ml-auto shrink-0 text-[8px] font-medium tabular-nums text-slate-400">{item.detail || ""}</span>}</div>
            {item.detailBelow && item.detail && <div className="mt-1 pl-2.5 text-[9px] font-semibold leading-none tabular-nums text-slate-600">{item.detail}</div>}
            {progress === undefined ? <div className="mt-1 h-[4px] rounded-full" style={{ background: `linear-gradient(90deg, ${item.trackColor} 0%, ${item.trackColor} 44%, transparent 100%)` }} /> : <div className="mt-1 h-[4px] overflow-hidden rounded-full" style={{ backgroundColor: item.trackColor }}><div className="h-full rounded-full" style={{ width: animated ? `${progress * 100}%` : "0%", background: item.gradient, boxShadow: "inset 0 -1px 2px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.24)", transition: `width 0.85s cubic-bezier(0.4,0,0.2,1) ${index * 70}ms` }} /></div>}
          </div>;
        })}
      </div>
    </div>
  </section>;
}

type T0WeeklySettlementIncome = {
  order: number;
  commission: number;
  shared: number;
  total: number;
  orderCount: number;
  commissionCount: number;
  sharedCount: number;
};
type T0WeeklySettlementMember = {
  userId: number;
  name: string;
  income: T0WeeklySettlementIncome;
  /** 服务端按北京时间逐日归集的权威结果；旧冻结快照可不含。 */
  dailyIncomeByDate?: Record<string, T0WeeklySettlementIncome>;
};
type T0WeeklySettlementReport = {
  calculationVersion: string;
  generatedAt: string;
  status: "realtime" | "frozen" | "backfill";
  period: { weekStartBjt: string; weekEndExclusiveBjt: string; timezone: string; periodStartUtc: string; periodEndUtc: string };
  sourceCutoffAt: string;
  sourceCounts: { entries: number; closings: number; sharedTransfers: number };
  summary: {
    participantCount: number;
    income: T0WeeklySettlementIncome;
  };
  members: T0WeeklySettlementMember[];
};
type T0WeeklySettlementCenter = {
  timezone: string;
  view: "admin" | "member";
  current: T0WeeklySettlementReport;
  history: Array<{ id: string; kind: "frozen" | "backfill"; frozenAt?: string; sourceHash?: string; report: T0WeeklySettlementReport }>;
  definition: { income: string; freeze: string };
};
type T0TeamWeeklySettlement = {
  enabled: boolean;
  generatedAt?: string;
  status?: "realtime" | "backfill";
  currentWeekStartBjt?: string;
  availableWeekStarts?: string[];
  period?: T0WeeklySettlementReport["period"];
  summary?: { participantCount: number; income: T0WeeklySettlementIncome };
  members?: Array<{
    userId: number;
    name: string;
    avatar?: string;
    income: T0WeeklySettlementIncome;
  }>;
  definition?: string;
};
type T0WeeklySettlementAllocationIncome = { order: number; commission: number; shared: number; adjustment: number; total: number };
type T0WeeklySettlementAdjustment = {
  id: string;
  weekStartBjt: string;
  type: "source_correction" | "allocation_transfer" | "hold";
  accountId: string | null;
  accountName: string | null;
  sourceClosingEntryId: string | null;
  sourceNetPnlDelta: number;
  allocations: Array<{ userId: number; name: string; amount: number }>;
  reason: string;
  createdByUserId: number;
  createdByName: string;
  createdAt: string;
};
type T0WeeklySettlementAccountReconciliationClosing = {
  closingEntryId: string;
  occurredAt: string;
  ownerUserId: number;
  ownerName: string;
  action: "closeLong" | "closeShort";
  quantity: number;
  fee: number;
  netPnl: number | null;
  regularDistributable: number | null;
  recordedSharedReduction: number;
  sharedTransferTotal: number;
  allocatedTotal: number;
  variance: number | null;
  allocations: Array<{ userId: number; name: string; kind: "order" | "commission" | "shared"; amount: number }>;
};
type T0WeeklySettlementAccountReconciliation = {
  generatedAt: string;
  period: T0WeeklySettlementReport["period"];
  sourceCutoffAt: string;
  reconciliationHash: string;
  settlementReference: {
    status: "realtime" | "frozen" | "backfill";
    frozenAt?: string;
    frozenSourceHash?: string;
    sourceHash: string;
    adjustmentHash: string;
    frozenSourceChanged: boolean;
  };
  confirmation: {
    state: "unconfirmed" | "confirmed" | "stale";
    latest: {
      id: string;
      weekStartBjt: string;
      basisHash: string;
      settlementSourceStatus: "realtime" | "frozen" | "backfill";
      settlementSourceHash: string | null;
      note: string;
      confirmedByUserId: number;
      confirmedByName: string;
      confirmedAt: string;
    } | null;
  };
  summary: { accountCount: number; closingCount: number; unreconciledClosingCount: number; netPnl: number; allocatedTotal: number; variance: number };
  accounts: Array<{
    accountId: string;
    accountName: string;
    closingCount: number;
    unreconciledClosingCount: number;
    recipientCount: number;
    netPnl: number;
    allocatedTotal: number;
    variance: number;
    closings: T0WeeklySettlementAccountReconciliationClosing[];
  }>;
  destinations: Array<{
    userId: number;
    name: string;
    income: T0WeeklySettlementAllocationIncome;
    sources: Array<{ accountId: string; accountName: string; closingCount: number; income: T0WeeklySettlementAllocationIncome }>;
  }>;
  adjustments: T0WeeklySettlementAdjustment[];
  definition: string;
};
type T0WeeklySettlementAccountReconciliationAccount = T0WeeklySettlementAccountReconciliation["accounts"][number];

/**
 * 账户来源四维报表中的前三张汇总卡。
 * 只对账户现有逐笔平仓及其最终用户去向做前端归集，不重算 FIFO、分佣或共享归属。
 */
function buildT0SettlementAccountSourceBreakdown(
  account: T0WeeklySettlementAccountReconciliationAccount,
  weekStartBjt: string,
) {
  const recipients = new Map<number, { userId: number; name: string; amount: number }>();
  const kinds: Record<"order" | "commission" | "shared", number> = { order: 0, commission: 0, shared: 0 };
  const weekStartTimestamp = getT0CalendarDateUtc(weekStartBjt);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = weekStartTimestamp === null
      ? ""
      : new Date(weekStartTimestamp + index * 24 * 60 * 60 * 1_000).toISOString().slice(0, 10);
    return { date, label: `周${["一", "二", "三", "四", "五", "六", "日"][index]}`, amount: 0 };
  });
  const dayByDate = new Map(days.map((day) => [day.date, day]));

  account.closings.forEach((closing) => {
    const occurredAt = new Date(closing.occurredAt);
    if (!Number.isNaN(occurredAt.getTime())) {
      const day = dayByDate.get(getBeijingDateInputValue(occurredAt));
      if (day) day.amount += Number(closing.allocatedTotal) || 0;
    }
    closing.allocations.forEach((allocation) => {
      const amount = Number(allocation.amount) || 0;
      const existing = recipients.get(allocation.userId) || { userId: allocation.userId, name: allocation.name, amount: 0 };
      existing.amount += amount;
      recipients.set(allocation.userId, existing);
      kinds[allocation.kind] += amount;
    });
  });

  return {
    recipients: Array.from(recipients.values()).sort((left, right) => Math.abs(right.amount) - Math.abs(left.amount) || left.name.localeCompare(right.name, "zh-CN")),
    kinds,
    days,
  };
}

/** 共享收益的可分享说明页。维度清单直接复用AI实际算法配置，后续新增方案会自动进入长图。 */
function SharedIncomeAllocationGuidePage({
  exportRef,
  currentUser,
  principalRule,
  canManage,
  onConfigurePrincipal,
  onClose,
}: {
  exportRef: RefObject<HTMLElement | null>;
  currentUser?: any;
  principalRule: SharedIncomePrincipalRule;
  canManage: boolean;
  onConfigurePrincipal: () => void;
  onClose: () => void;
}) {
  const principalEqualFloor = Math.max(0, 100 - principalRule.influencePercentage);
  return <div className="fixed inset-0 z-[150] flex flex-col bg-slate-100" role="dialog" aria-modal="true" aria-label="AI智能共享收益分配说明">
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 shadow-sm">
      <button type="button" onClick={onClose} aria-label="返回智能分配" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-700 active:bg-slate-100"><ArrowLeft className="h-5 w-5" /></button>
      <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-slate-900">AI 智能共享收益分配</div><div className="truncate text-[10px] text-slate-400">一图看懂共享收益如何兼顾公平</div></div>
      <OrderCardImageDownload targetRef={exportRef} currentUser={currentUser} orderNo="AI共享收益分配" filenamePrefix="52号账本AI共享收益分配方案" previewTitle="AI智能共享收益分配图片预览" previewHint="包含全部分配维度与当前挂单数量规则" color="#4338CA" outerPadding={0} captureFullContent fullContentHorizontalBleed={0} fullContentBottomPadding={0} exportBackground="#F8FAFC" variant="bare" buttonLabel="下载" />
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <main ref={exportRef} className="mx-auto w-full max-w-md space-y-3 rounded-2xl bg-slate-50 p-3 text-slate-800">
        <section className="overflow-hidden rounded-xl bg-slate-900 px-4 py-4 text-white shadow-sm">
          <div><div className="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] text-indigo-200"><BookOpen className="h-3.5 w-3.5" />共享收益 · 多维公平</div><h2 className="mt-1 text-[21px] font-bold tracking-tight">AI 智能共享收益分配</h2><p className="mt-1 text-[11px] leading-5 text-slate-300">每笔共享收益都可组合多个公平维度；每个已选维度均分本次预算，再按各自规则计算。</p></div>
          <div className="mt-3 grid grid-cols-3 divide-x divide-white/10 overflow-hidden rounded-lg border border-white/10 bg-white/[0.06] text-center"><div className="px-1.5 py-2"><div className="text-[9px] text-indigo-200">①</div><div className="mt-0.5 text-[10px] font-semibold">确定预算</div><div className="mt-0.5 text-[8px] text-slate-300">仅正向净收益</div></div><div className="px-1.5 py-2"><div className="text-[9px] text-indigo-200">②</div><div className="mt-0.5 text-[10px] font-semibold">选择公平维度</div><div className="mt-0.5 text-[8px] text-slate-300">可复选组合</div></div><div className="px-1.5 py-2"><div className="text-[9px] text-indigo-200">③</div><div className="mt-0.5 text-[10px] font-semibold">分配到人</div><div className="mt-0.5 text-[8px] text-slate-300">精确到分</div></div></div>
        </section>

        <section className="pt-1"><div className="flex items-end justify-between gap-3 px-1"><div><div className="text-[13px] font-bold text-slate-900">全部公平维度</div><p className="mt-0.5 text-[9px] text-slate-400">每一项都用一句话和一个小图讲清楚</p></div><span className="text-[10px] font-semibold text-slate-400">{SHARED_INCOME_ALLOCATION_DIMENSIONS.length} 项</span></div><div className="mt-2.5 space-y-2.5">{SHARED_INCOME_ALLOCATION_DIMENSIONS.map((dimension, index) => {
          const isInverseGuide = dimension.id === "realizedAnnualized" || dimension.id === "receivedSharedAmountGap" || dimension.id === "receivedSharedCountGap" || dimension.id === "withdrawalProgress";
          const barHeights = isInverseGuide ? [76, 48, 25] : [25, 48, 76];
          const guideVisual = getSharedIncomeAllocationClientVisual(dimension.id);
          const DirectionIcon = isInverseGuide ? ArrowDownLeft : ArrowUpRight;
          if (dimension.id === "principal") return <article key={dimension.id} className="rounded-xl border border-blue-200 bg-white px-3 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="flex items-start justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><span className="shrink-0 text-[11px] font-bold text-blue-600">{String(index + 1).padStart(2, "0")}</span><div><div className="text-[9px] font-semibold text-blue-700">规模公平</div><h3 className="text-[13px] font-bold text-slate-900">按本金比例共享收益</h3></div></div>{canManage && <button type="button" data-html2canvas-ignore="true" onClick={onConfigurePrincipal} className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-blue-100 bg-blue-50 px-2 text-[10px] font-bold text-blue-700 active:scale-[0.98]"><SlidersHorizontal className="h-3.5 w-3.5" />设置</button>}</div>
            <div className="mt-2.5 divide-y divide-slate-100 border-y border-slate-100"><div className="flex items-center gap-2 py-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[9px] font-black text-white">1</span><p className="text-[10px] leading-4 text-slate-700"><b className="text-blue-700">按本金：</b>当前 <b>{principalRule.influencePercentage}%</b> 的共享收益，按每人的本金占比分配。</p></div><div className="flex items-center gap-2 py-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-400 text-[9px] font-black text-amber-950">2</span><p className="text-[10px] leading-4 text-slate-700"><b className="text-amber-800">均分保障：</b>当前 <b>{principalEqualFloor}%</b> 的共享收益，按有效参与人数均分。</p></div><div className="flex items-center gap-2 py-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[9px] font-black text-white">3</span><p className="text-[10px] leading-4 text-slate-700"><b className="text-slate-900">AI 输出：</b>自动生成本次共享收益建议，确认前仍可人工调整。</p></div></div>
            <div className="mt-2 text-center font-mono text-[8px] leading-4 text-slate-400">共享收益建议 = 子池 × [{principalEqualFloor}% ÷ 有效人数 + {principalRule.influencePercentage}% × 本金权重]</div>
          </article>;
          return <article key={dimension.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.035)]" style={{ borderTopWidth: 3, borderTopColor: `${dimension.accent}80` }}><div className="flex items-start justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><span className="shrink-0 text-[11px] font-bold" style={{ color: dimension.accent }}>{String(index + 1).padStart(2, "0")}</span><div className="min-w-0"><div className="text-[9px] font-semibold" style={{ color: dimension.accent }}>{dimension.category}</div><h3 className="truncate text-[12px] font-bold text-slate-800">{dimension.label}</h3></div></div><span className="shrink-0 text-[8px] font-semibold" style={{ color: dimension.accent }}>共享收益</span></div><div className="mt-2 grid grid-cols-[66px_minmax(0,1fr)_66px] items-center gap-2"><div className="text-center"><div className="flex h-9 items-end justify-center gap-1">{barHeights.map((height, barIndex) => <span key={barIndex} className="w-3 rounded-t-sm" style={{ height: `${height}%`, backgroundColor: dimension.accent, opacity: 0.46 + barIndex * 0.24 }} />)}</div><div className="mt-0.5 text-[7px] font-semibold text-slate-400">{isInverseGuide ? "多 ← 少" : "少 → 多"}</div></div><div className="min-w-0 text-center"><div className="text-[8px] text-slate-400">看 {guideVisual.metricLabel}</div><div className="mt-0.5 flex items-center justify-center gap-1" style={{ color: dimension.accent }}><DirectionIcon className="h-4 w-4" /><span className="text-[15px] font-black">{guideVisual.directionLabel}</span></div></div><div className="text-center"><div className="mx-auto flex h-9 w-9 flex-col items-center justify-center rounded-full text-[8px] font-bold leading-3 text-white" style={{ backgroundColor: dimension.accent }}><span>共享</span><span>收益</span></div><div className="mt-0.5 text-[8px] font-bold" style={{ color: dimension.accent }}>{guideVisual.priorityLabel}</div></div></div></article>;
        })}</div></section>

        <section className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-3"><div className="text-[11px] font-bold text-amber-900">共同规则</div><div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[9px] leading-4 text-amber-800"><div>• 仅已登记本金且已开启资格的人参与</div><div>• 多选维度时各维度均分预算</div><div>• 金额按分计算，余数按规则补足</div><div>• AI结果可在确认前手动微调</div></div></section>
        <p className="px-1 text-center text-[9px] leading-4 text-slate-400">本说明图用于解释分配规则；实际到账金额以平仓确认时的收益、资格和订单快照为准。</p>
      </main>
    </div>
  </div>;
}


function SharedIncomePrincipalRuleSettingsPage({
  rule,
  onChange,
  isSaving,
  onSaveAndExit,
  onClose,
}: {
  rule: SharedIncomePrincipalRule;
  onChange: (next: SharedIncomePrincipalRule) => void;
  isSaving: boolean;
  onSaveAndExit: () => void;
  onClose: () => void;
}) {
  const example = getSharedIncomePrincipalGuideExample(rule);
  const equalFloor = Math.max(0, 100 - rule.influencePercentage);
  return <div className="fixed inset-0 z-[160] flex flex-col bg-slate-100" role="dialog" aria-modal="true" aria-label="按本金比例设置">
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 shadow-sm">
      <button type="button" onClick={onClose} aria-label="返回方案说明" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-700 active:bg-slate-100"><ArrowLeft className="h-5 w-5" /></button>
      <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-slate-900">按本金比例 · 设置</div><div className="truncate text-[10px] text-slate-400">保存后影响后续AI建议；历史到账不变</div></div>
      <button type="button" disabled={isSaving} onClick={() => onChange(DEFAULT_SHARED_INCOME_PRINCIPAL_RULE)} className="text-[11px] font-semibold text-blue-700 active:opacity-60 disabled:opacity-40">恢复默认</button>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <main className="mx-auto w-full max-w-md space-y-3">
        <section className="rounded-xl border border-blue-100 bg-blue-50/50 px-2.5 py-2"><div className="flex items-baseline justify-between gap-2"><div className="text-[12px] font-bold text-blue-950">即时试算 · 子池 100 U</div><span className="text-[8px] font-medium text-blue-800/70">蓝条 = 本次分配占比</span></div><p className="mt-0.5 text-[8px] leading-3 text-blue-800/80">九位成员从极小到大本金依次排列；拖动下方滑杆即可纵向比较每一位的变化。</p><div className="mt-1.5 overflow-hidden rounded-md border border-blue-100 bg-white tabular-nums"><div className="grid h-5 grid-cols-[66px_minmax(0,1fr)_72px] items-center gap-1.5 border-b border-blue-100 bg-blue-50/60 px-2 text-[7px] font-semibold text-blue-800"><span>本金</span><span className="text-center">本次分配</span><span className="text-right">金额／占比</span></div>{example.map((item, index) => <div key={item.principal} className={`grid h-7 grid-cols-[66px_minmax(0,1fr)_72px] items-center gap-1.5 px-2 ${index > 0 ? "border-t border-blue-50" : ""}`}><div className="min-w-0 whitespace-nowrap text-[8px] leading-3 text-slate-500"><span className="font-semibold text-slate-700">{(item.principalShare * 100).toFixed(1)}%</span><span className="ml-1">{item.principal.toLocaleString()}U</span></div><div className="h-2 overflow-hidden rounded-full bg-blue-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(1, item.allocation)}%` }} /></div><div className="whitespace-nowrap text-right text-[8px] leading-3"><span className="font-bold text-rose-600">{item.allocation.toFixed(2)}U</span><span className="ml-1 text-[7px] text-blue-700">{item.allocation.toFixed(2)}%</span></div></div>)}</div></section>
        <section className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm"><div className="text-[13px] font-bold text-slate-900">本金曲线</div><p className="mt-1 text-[10px] leading-4 text-slate-500">本金越多仍分得越多；曲线越平滑，大本金的边际优势越小。</p><div className="mt-2 grid grid-cols-3 gap-1.5">{(["linear", "balanced", "strong"] as const).map((curve) => <button key={curve} type="button" onClick={() => onChange({ ...rule, curve })} className={`min-h-14 rounded-lg border px-1.5 text-left ${rule.curve === curve ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-600"}`}><span className="block text-[10px] font-bold">{getSharedIncomePrincipalCurveLabel(curve)}</span><span className="mt-1 block text-[8px] leading-3 opacity-75">{curve === "linear" ? "本金翻倍，份额同样翻倍" : curve === "balanced" ? "推荐：平方根递减" : "更优先照顾均衡"}</span></button>)}</div></section>
        <section className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm"><div className="flex items-baseline justify-between gap-3"><div className="text-[13px] font-bold text-slate-900">本金影响度</div><div className="text-sm font-bold tabular-nums text-blue-700">{rule.influencePercentage}%</div></div><p className="mt-1 text-[10px] leading-4 text-slate-500">本维度中 <b className="text-slate-700">{equalFloor}% 全员均分</b>，<b className="text-slate-700">{rule.influencePercentage}% 按本金曲线</b> 分配。</p><input type="range" min="0" max="100" step="1" value={rule.influencePercentage} onChange={(event) => onChange({ ...rule, influencePercentage: Math.min(100, Math.max(0, Number(event.target.value) || 0)) })} className="mt-3 h-3 w-full cursor-pointer accent-blue-600" aria-label="本金影响度" /><div className="mt-1 flex justify-between text-[9px] font-medium text-slate-400"><span>0% 全员均分</span><span>100% 只看本金</span></div></section>

        <section className="border-l-2 border-amber-400 px-3 py-1"><div className="text-[10px] font-bold text-amber-900">固定账本口径</div><p className="mt-1 text-[9px] leading-4 text-amber-800">投入金额、资格与历史流水只能由账本事实生成；这里不能按人加减分或改写任何历史到账。</p></section>
      </main>
    </div>
    <footer className="shrink-0 border-t border-slate-200 bg-white px-3 py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] shadow-[0_-2px_10px_rgba(15,23,42,0.06)]"><div className="mx-auto flex w-full max-w-md gap-2"><button type="button" disabled={isSaving} onClick={onClose} className="h-10 shrink-0 rounded-lg border border-slate-200 bg-white px-4 text-[12px] font-semibold text-slate-700 active:scale-[0.99] disabled:opacity-40">取消</button><button type="button" disabled={isSaving} onClick={onSaveAndExit} className="h-10 min-w-0 flex-1 rounded-lg bg-blue-700 px-4 text-[12px] font-semibold text-white shadow-sm active:scale-[0.99] disabled:opacity-40">{isSaving ? "正在保存…" : "保存并退出"}</button></div></footer>
  </div>;
}

function T0SettlementAccountSourceTopRows({
  account,
  weekStartBjt,
}: {
  account: T0WeeklySettlementAccountReconciliationAccount;
  weekStartBjt: string;
}) {
  const breakdown = useMemo(() => buildT0SettlementAccountSourceBreakdown(account, weekStartBjt), [account, weekStartBjt]);
  const typeRows: Array<{ key: "order" | "commission" | "shared"; label: string; className: string }> = [
    { key: "order", label: "订单", className: "bg-blue-50 text-blue-700" },
    { key: "commission", label: "分佣", className: "bg-amber-50 text-amber-700" },
    { key: "shared", label: "共享", className: "bg-emerald-50 text-emerald-700" },
  ];
  return <div className="border-b border-slate-100 bg-white" aria-label={`${account.accountName}按类型及日期去向汇总`}>
    <div className="flex min-h-8 items-center gap-2 border-b border-slate-100 px-3 py-1.5 tabular-nums"><span className="shrink-0 text-[10px] font-semibold text-slate-600">按类型</span><div className="grid min-w-0 flex-1 grid-cols-3 divide-x divide-slate-100 text-center">{typeRows.map((item) => {
      const amount = breakdown.kinds[item.key];
      return <div key={item.key} className="min-w-0 whitespace-nowrap px-1 text-[10px]"><span className={`mr-1 inline-flex rounded px-1 py-0.5 text-[8px] font-semibold ${item.className}`}>{item.label}</span><span className={`font-semibold tracking-[-0.045em] ${amount >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatT0SettlementAmount(amount)}</span></div>;
    })}</div></div>
    <div className="flex items-stretch gap-2 px-3 py-1.5 tabular-nums"><span className="flex shrink-0 items-center text-[10px] font-semibold text-slate-600">按日期</span><div className="grid min-w-0 flex-1 grid-cols-7 divide-x divide-slate-100 text-center">{breakdown.days.map((day) => <div key={day.date || day.label} className="min-w-0 px-0.5"><div className="text-[8px] text-slate-400">{day.label}</div><div className={`mt-0.5 whitespace-nowrap text-[8px] font-semibold tracking-[-0.08em] ${day.amount >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatT0SettlementAmount(day.amount)}</div></div>)}</div></div>
  </div>;
}

function T0SettlementAccountRecipientSummary({
  account,
  weekStartBjt,
  exportControl,
}: {
  account: T0WeeklySettlementAccountReconciliationAccount;
  weekStartBjt: string;
  exportControl?: ReactNode;
}) {
  const breakdown = useMemo(() => buildT0SettlementAccountSourceBreakdown(account, weekStartBjt), [account, weekStartBjt]);
  return <section className="overflow-hidden border-b border-slate-100 bg-white" aria-label={`${account.accountName}按用户去向汇总`}>
    <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-3 py-2"><div className="flex items-center gap-1"><span className="text-[10px] font-semibold text-slate-600">按用户去向</span>{exportControl}</div><span className="text-[9px] text-slate-400">{breakdown.recipients.length} 人</span></div>
    {breakdown.recipients.length === 0 ? <div className="px-3 py-2 text-[10px] text-slate-400">暂无可归属用户去向</div> : <div className="grid grid-cols-2 gap-px bg-slate-100">{breakdown.recipients.map((recipient) => <div key={recipient.userId} className="flex min-w-0 items-center justify-between gap-1.5 bg-white px-2.5 py-1.5 text-[10px] tabular-nums"><span className="min-w-0 truncate font-medium text-slate-600">{recipient.name}</span><span className={`shrink-0 whitespace-nowrap font-semibold tracking-[-0.035em] ${recipient.amount >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatT0SettlementAmount(recipient.amount)} U</span></div>)}</div>}
  </section>;
}
function formatT0SettlementAmount(value: number | null | undefined) {
  if (value === null || value === undefined) return "--";
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "--";
}
function isT0SettlementReconciled(value: number | null | undefined) {
  return Number.isFinite(Number(value)) && Math.abs(Number(value)) <= 0.000001;
}
function formatT0SettlementOccurredAt(value: string | null | undefined) {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return "--";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "--";
  return `${part("month")}/${part("day")} ${part("hour")}:${part("minute")}`;
}
function formatT0WeeklySettlementPeriod(start: string | null | undefined, endExclusive: string | null | undefined) {
  const startText = String(start || "").slice(0, 10);
  const endText = String(endExclusive || "").slice(0, 10);
  const startTimestamp = getT0CalendarDateUtc(startText);
  const endTimestamp = getT0CalendarDateUtc(endText);
  if (startTimestamp === null || endTimestamp === null) return "结算周期";
  const lastDay = new Date(endTimestamp - 24 * 60 * 60 * 1000);
  const startDate = new Date(startTimestamp);
  return `${startDate.getUTCMonth() + 1}/${startDate.getUTCDate()}–${lastDay.getUTCMonth() + 1}/${lastDay.getUTCDate()}`;
}

/** 用于独立明细卡的中文周区间；结束日为服务端排他结束日减一天。 */
function formatT0WeeklySettlementPeriodChinese(start: string | null | undefined, endExclusive: string | null | undefined) {
  const startText = String(start || "").slice(0, 10);
  const endText = String(endExclusive || "").slice(0, 10);
  const startTimestamp = getT0CalendarDateUtc(startText);
  const endTimestamp = getT0CalendarDateUtc(endText);
  if (startTimestamp === null || endTimestamp === null) return formatT0WeeklySettlementPeriod(start, endExclusive);
  const startDate = new Date(startTimestamp);
  const lastDay = new Date(endTimestamp - 24 * 60 * 60 * 1_000);
  return `${startDate.getUTCMonth() + 1}月${startDate.getUTCDate()}日—${lastDay.getUTCMonth() + 1}月${lastDay.getUTCDate()}日`;
}

function formatT0WeeklySettlementCountdown(remainingSeconds: number | null | undefined) {
  const totalSeconds = Math.max(0, Math.floor(Number(remainingSeconds) || 0));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const clock = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return days > 0 ? `${days}天 ${clock}` : clock;
}

function getT0WeeklySettlementWeekStart(value: string | null | undefined) {
  const instant = new Date(String(value || ""));
  if (Number.isNaN(instant.getTime())) return null;
  const timestamp = getT0CalendarDateUtc(getBeijingDateInputValue(instant));
  if (timestamp === null) return null;
  const date = new Date(timestamp);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function getT0WeeklySettlementPeriodFromWeekStart(weekStartBjt: string | null | undefined) {
  const weekStartTimestamp = getT0CalendarDateUtc(String(weekStartBjt || ""));
  if (weekStartTimestamp === null) return null;
  const periodStartUtc = new Date(`${weekStartBjt}T00:00:00+08:00`);
  if (Number.isNaN(periodStartUtc.getTime())) return null;
  const weekEndTimestamp = weekStartTimestamp + 7 * 24 * 60 * 60 * 1_000;
  return {
    weekStartBjt: String(weekStartBjt),
    weekEndExclusiveBjt: new Date(weekEndTimestamp).toISOString().slice(0, 10),
    timezone: "Asia/Shanghai",
    periodStartUtc: periodStartUtc.toISOString(),
    periodEndUtc: new Date(periodStartUtc.getTime() + 7 * 24 * 60 * 60 * 1_000).toISOString(),
  };
}

/** 单周按日收益明细：每天以100%横向三色条展示订单、分佣、共享的收益构成，不补造空日数据。 */
function T0WeeklySettlementDailyIncomeProgressList({
  weekStartBjt,
  dailyIncomeByDate,
}: {
  weekStartBjt: string;
  dailyIncomeByDate?: ReadonlyMap<string, Pick<T0WeeklySettlementIncome, "order" | "commission" | "shared">>;
}) {
  const days = useMemo(() => {
    const weekStartTimestamp = getT0CalendarDateUtc(weekStartBjt);
    if (weekStartTimestamp === null) return [];
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(weekStartTimestamp + index * 24 * 60 * 60 * 1_000).toISOString().slice(0, 10);
      const income = dailyIncomeByDate?.get(date) || { order: 0, commission: 0, shared: 0 };
      return { date, label: `周${["一", "二", "三", "四", "五", "六", "日"][index]}`, income };
    });
  }, [dailyIncomeByDate, weekStartBjt]);
  const series = [
    { key: "order" as const, label: "订单", positive: "#2563eb", negative: "#059669" },
    { key: "commission" as const, label: "分佣", positive: "#f59e0b", negative: "#10b981" },
    { key: "shared" as const, label: "共享", positive: "#16a34a", negative: "#047857" },
  ];
  return <div className="mt-3 overflow-hidden rounded-lg border border-slate-100 bg-slate-50/60">
    <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-2.5 py-2"><span className="text-[10px] font-medium text-slate-500">每日收益构成 · 每日100%</span><div className="flex items-center gap-2 text-[9px] text-slate-500" aria-label="收益类别图例">{series.map((item) => <span key={item.key} className="inline-flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-sm" style={{ backgroundColor: item.positive }} />{item.label}</span>)}</div></div>
    <div className="divide-y divide-slate-100">
      {days.map((day) => {
        const values = series.map((item) => ({ ...item, value: Number(day.income[item.key]) || 0 }));
        const absoluteTotal = values.reduce((total, item) => total + Math.abs(item.value), 0);
        const dayTotal = values.reduce((total, item) => total + item.value, 0);
        return <div key={day.date} className="grid grid-cols-[46px_minmax(0,1fr)_58px] items-center gap-2 px-2.5 py-1.5 tabular-nums" aria-label={`${day.label} ${day.date.slice(5).replace("-", "月")}日，收益 ${formatT0SettlementAmount(dayTotal)} U`}>
          <div><div className="text-[10px] font-semibold text-slate-600">{day.label}</div><div className="mt-0.5 text-[9px] text-slate-400">{day.date.slice(5).replace("-", "/")}</div></div>
          <div className="min-w-0"><div className="flex h-2 overflow-hidden rounded-full bg-slate-200" role="img" aria-label={`${day.label}收益类别占比`}>{absoluteTotal > 0 ? values.map((item) => <div key={item.key} title={`${item.label} ${formatT0SettlementAmount(item.value)} U`} style={{ width: `${Math.abs(item.value) / absoluteTotal * 100}%`, backgroundColor: item.value >= 0 ? item.positive : item.negative }} />) : <div className="w-full bg-slate-200" />}</div><div className="mt-1 grid grid-cols-3 gap-1 text-[8px] leading-none">{values.map((item) => <span key={item.key} className="truncate" style={{ color: item.value >= 0 ? item.positive : item.negative }}>{formatT0SettlementAmount(item.value)}</span>)}</div></div>
          <div className={`whitespace-nowrap text-right text-[11px] font-bold ${dayTotal >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatT0SettlementAmount(dayTotal)}<span className="ml-0.5 text-[8px] font-medium">U</span></div>
        </div>;
      })}
    </div>
  </div>;
}

/** 历史收益以结算周为最小页；左右仅切换展示周期，绝不重算或改写任何周结金额。 */
function T0HistoricalSettlementWeekCalendar({ reports, dailyIncomeByDate, targetUserId, selectedWeekStart, onSelectedWeekStartChange }: {
  reports: Array<{ id: string; report: T0WeeklySettlementReport }>;
  dailyIncomeByDate?: ReadonlyMap<string, Pick<T0WeeklySettlementIncome, "order" | "commission" | "shared">>;
  targetUserId?: number;
  selectedWeekStart: string | null;
  onSelectedWeekStartChange: (weekStartBjt: string) => void;
}) {
  const reportsByWeekStart = useMemo(() => new Map(reports.map(({ report }) => [report.period.weekStartBjt, report])), [reports]);
  const earliestWeekStart = useMemo(() => reports.reduce<string | null>((earliest, item) => !earliest || item.report.period.weekStartBjt < earliest ? item.report.period.weekStartBjt : earliest, null), [reports]);
  const latestWeekStart = useMemo(() => reports.reduce<string | null>((latest, item) => !latest || item.report.period.weekStartBjt > latest ? item.report.period.weekStartBjt : latest, null), [reports]);
  const [boundaryHint, setBoundaryHint] = useState("");
  const visibleWeekStart = selectedWeekStart && reportsByWeekStart.has(selectedWeekStart) ? selectedWeekStart : latestWeekStart || "";
  const shiftWeek = useCallback((weekStart: string, offset: number) => {
    const timestamp = getT0CalendarDateUtc(weekStart);
    return timestamp === null ? weekStart : new Date(timestamp + offset * 7 * 24 * 60 * 60 * 1_000).toISOString().slice(0, 10);
  }, []);
  const visiblePeriod = getT0WeeklySettlementPeriodFromWeekStart(visibleWeekStart);
  const visiblePeriodLabel = visiblePeriod ? formatT0WeeklySettlementPeriodChinese(visiblePeriod.weekStartBjt, visiblePeriod.weekEndExclusiveBjt) : visibleWeekStart;
  const report = reportsByWeekStart.get(visibleWeekStart);
  const authoritativeDailyIncomeByDate = useMemo(() => {
    const targetId = Number(targetUserId);
    const member = report?.members.find((item) => item.userId === targetId) || report?.members[0];
    const source = member?.dailyIncomeByDate;
    if (source && typeof source === "object") {
      return new Map(Object.entries(source).map(([date, income]) => [date, {
        order: Number(income?.order) || 0,
        commission: Number(income?.commission) || 0,
        shared: Number(income?.shared) || 0,
      }]));
    }
    // 只允许尚未拿到服务端报表的首屏即时模型临时展示本地明细；
    // 旧冻结快照没有逐日字段时宁可明确提示，不用另一套FIFO算法伪造数据。
    return report?.calculationVersion === "client-total-profit-v1" ? dailyIncomeByDate : undefined;
  }, [dailyIncomeByDate, report, targetUserId]);

  if (reports.length === 0) return <div className="px-3 py-7 text-center text-xs text-slate-400">暂无已结束结算周期</div>;
  const goPreviousWeek = () => {
    const previous = shiftWeek(visibleWeekStart, -1);
    if (earliestWeekStart && previous < earliestWeekStart) {
      setBoundaryHint("这是最早的一周");
      return;
    }
    setBoundaryHint("");
    onSelectedWeekStartChange(previous);
  };
  const goNextWeek = () => {
    const next = shiftWeek(visibleWeekStart, 1);
    if (latestWeekStart && next > latestWeekStart) {
      setBoundaryHint("这是最新的一周");
      return;
    }
    onSelectedWeekStartChange(next);
    setBoundaryHint(next === latestWeekStart ? "这是最新的一周" : "");
  };
  const emptyLabel = "无结算收益";

  return <div>
    <div className="flex h-11 items-center justify-between border-t border-slate-100 px-1.5">
      <button type="button" onClick={goPreviousWeek} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors active:scale-90 active:bg-slate-100 active:text-slate-900" aria-label="查看上一周结算"><ChevronLeft className="h-5 w-5" strokeWidth={2.35} /></button>
      <div className="whitespace-nowrap text-[13px] font-semibold tracking-[-0.02em] tabular-nums text-slate-800" aria-live="polite">{visiblePeriodLabel}</div>
      <button type="button" onClick={goNextWeek} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors active:scale-90 active:bg-slate-100 active:text-slate-900" aria-label="查看下一周结算"><ChevronRight className="h-5 w-5" strokeWidth={2.35} /></button>
    </div>
    {boundaryHint && <div className="border-t border-slate-100 bg-slate-50 px-3 py-1.5 text-center text-[10px] text-slate-500" role="status">{boundaryHint}</div>}
    {!report ? <div key={visibleWeekStart} className="min-h-[126px] border-t border-slate-200 bg-slate-50/60 px-3 py-3 text-center" aria-label={`${visiblePeriodLabel}，${emptyLabel}`}>
      <div className="pt-4 text-xl font-semibold text-slate-300">—</div>
      <div className="mt-3 text-xs text-slate-400">{emptyLabel}</div>
    </div> : (() => {
      const income = report.summary.income;
      const positive = income.total >= 0;
      return <div key={visibleWeekStart} className="border-t border-slate-200 bg-white px-3 py-3" aria-label={`${visiblePeriodLabel}，结算收益 ${formatT0SettlementAmount(income.total)} U`}>
        <div className="flex items-end justify-between gap-3"><span className="text-[11px] font-medium text-slate-500">七日收益明细</span><div className={`whitespace-nowrap text-[clamp(20px,6.2vw,27px)] font-bold leading-none tracking-[-0.04em] tabular-nums ${positive ? "text-rose-600" : "text-emerald-600"}`}>{formatT0SettlementAmount(income.total)} <span className="text-[10px] font-medium">U</span></div></div>
        {authoritativeDailyIncomeByDate
          ? <T0WeeklySettlementDailyIncomeProgressList weekStartBjt={visibleWeekStart} dailyIncomeByDate={authoritativeDailyIncomeByDate} />
          : <div className="mt-3 border-t border-slate-100 px-1 py-3 text-center text-[10px] leading-5 text-slate-400">该冻结周快照未保留逐日构成；周结算合计仍以冻结报告为准。</div>}
      </div>;
    })()}
  </div>;
}

function T0MemberWeeklySettlementCurrentCard({
  report,
  displayName,
  avatar,
  countdown,
  isRealtimeWeek,
}: {
  report: T0WeeklySettlementReport;
  displayName: string;
  avatar?: string;
  countdown: number | null;
  isRealtimeWeek: boolean;
}) {
  const income = report.summary.income;
  const periodStatusLabel = isRealtimeWeek ? "距下期结算" : report.status === "frozen" ? "已冻结" : "本期已结束";
  const periodStatusValue = isRealtimeWeek ? (countdown === null ? "--:--:--" : countdown <= 0 ? "切换中" : formatT0WeeklySettlementCountdown(countdown)) : "结算完成";
  return <div className="bg-white">
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-slate-800 bg-slate-900 px-3 py-3 text-white">
      <div className="min-w-0"><div className="truncate text-[11px] font-medium text-slate-300">结算周期</div><div className="mt-1 whitespace-nowrap text-[clamp(12px,3.5vw,15px)] font-bold leading-none tabular-nums">{formatT0WeeklySettlementPeriod(report.period.weekStartBjt, report.period.weekEndExclusiveBjt)} <span className="ml-1 text-[10px] font-medium text-slate-300">北京时间</span></div></div>
      <div className="shrink-0 text-right tabular-nums"><div className="text-[11px] font-medium text-slate-300">{periodStatusLabel}</div><div className="mt-1 whitespace-nowrap text-[clamp(12px,3.5vw,15px)] font-bold leading-none tracking-[-0.035em] text-white">{periodStatusValue}</div></div>
    </div>
    <div className="px-3 py-3 text-center tabular-nums"><div className="text-[11px] text-slate-500">{displayName}{isRealtimeWeek ? "本周" : "本期"}收益结算</div><div className="mt-1 flex min-w-0 items-center justify-center gap-1.5"><div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-800 text-xs font-bold text-white">{avatar ? <img src={avatar} alt={`${displayName}头像`} className="h-full w-full object-cover" /> : <span>{displayName.slice(0, 1)}</span>}</div><div className={`whitespace-nowrap text-[clamp(24px,7vw,30px)] font-bold leading-none tracking-[-0.04em] ${income.total >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatT0SettlementAmount(income.total)} <span className="text-xs font-semibold">U</span></div></div></div>
    <div className="grid grid-cols-3 divide-x divide-slate-200 border-t border-slate-100 text-center tabular-nums">
      {[{ label: "订单", value: income.order, count: income.orderCount }, { label: "分佣", value: income.commission, count: income.commissionCount }, { label: "共享", value: income.shared, count: income.sharedCount }].map((item) => <div key={item.label} className="min-w-0 px-1.5 py-3"><div className="whitespace-nowrap text-[11px] text-slate-500">{item.label}<span className="ml-1 text-[10px] text-slate-400">{item.count}笔</span></div><div className={`mt-1 whitespace-nowrap text-[clamp(12px,3.5vw,15px)] font-bold leading-none tracking-[-0.035em] ${item.value >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatT0SettlementAmount(item.value)}<span className="ml-0.5 text-[9px] font-medium">U</span></div></div>)}
    </div>
  </div>;
}

function T0AdminWeeklySettlementOverviewCard({
  report,
  isRealtimeWeek,
  onPreviousWeek,
  onNextWeek,
  hasPreviousWeek,
  hasNextWeek,
  memberAvatarByUserId,
}: {
  report: T0WeeklySettlementReport;
  isRealtimeWeek: boolean;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  hasPreviousWeek: boolean;
  hasNextWeek: boolean;
  memberAvatarByUserId?: ReadonlyMap<number, string>;
}) {
  const income = report.summary.income;
  const avatarPreview = report.members.slice(0, 4);
  const statusLabel = isRealtimeWeek ? "实时累计" : report.status === "frozen" ? "已冻结" : "回溯核算";
  const statusClass = isRealtimeWeek ? "bg-emerald-50 text-emerald-700" : report.status === "frozen" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700";
  return <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-3 py-2.5"><div className="min-w-0"><div className="text-sm font-semibold text-slate-900">{isRealtimeWeek ? "全体用户本周结算" : "全体用户本期结算"}</div><div className="mt-0.5 text-[11px] tabular-nums text-slate-500">{formatT0WeeklySettlementPeriod(report.period.weekStartBjt, report.period.weekEndExclusiveBjt)} · 北京时间 · {report.summary.participantCount} 人</div></div><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${statusClass}`}>{statusLabel}</span></div>
    <div className="px-3 py-3 text-center tabular-nums"><div className="text-[11px] text-slate-500">全体用户{isRealtimeWeek ? "本周" : "本期"}结算收益</div><div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1"><button type="button" onClick={onPreviousWeek} disabled={!hasPreviousWeek} className="justify-self-start inline-flex h-9 items-center gap-0.5 rounded-md px-2 text-[13px] font-semibold text-slate-600 active:bg-slate-50 disabled:opacity-25" aria-label="查看上周全体用户结算"><ChevronLeft className="h-5 w-5" />上周</button><div className="flex min-w-0 items-center justify-center gap-2"><div className="flex h-8 min-w-8 shrink-0 items-center justify-center pl-1" aria-label={`参与结算的${report.summary.participantCount}位用户头像`}>{avatarPreview.map((member, index) => { const avatar = memberAvatarByUserId?.get(member.userId); return <span key={member.userId} className="-ml-1.5 flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-slate-700 text-[9px] font-bold text-white" style={{ zIndex: avatarPreview.length - index }}>{avatar ? <img src={avatar} alt={`${member.name}头像`} className="h-full w-full object-cover" /> : member.name.slice(0, 1)}</span>; })}{report.summary.participantCount > avatarPreview.length && <span className="-ml-1.5 flex h-7 min-w-7 items-center justify-center rounded-full border-2 border-white bg-slate-200 px-1 text-[9px] font-bold text-slate-600">+{report.summary.participantCount - avatarPreview.length}</span>}</div><div className={`whitespace-nowrap text-[clamp(24px,7vw,30px)] font-bold leading-none tracking-[-0.04em] ${income.total >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatT0SettlementAmount(income.total)} <span className="text-xs font-semibold">U</span></div></div><button type="button" onClick={onNextWeek} disabled={!hasNextWeek} className="justify-self-end inline-flex h-9 items-center gap-0.5 rounded-md px-2 text-[13px] font-semibold text-slate-600 active:bg-slate-50 disabled:opacity-25" aria-label="查看下周全体用户结算">下周<ChevronRight className="h-5 w-5" /></button></div></div>
    <div className="grid grid-cols-3 divide-x divide-slate-200 border-t border-slate-100 text-center tabular-nums">{[{ label: "订单", value: income.order, count: income.orderCount }, { label: "分佣", value: income.commission, count: income.commissionCount }, { label: "共享", value: income.shared, count: income.sharedCount }].map((item) => <div key={item.label} className="min-w-0 px-1.5 py-3"><div className="whitespace-nowrap text-[11px] text-slate-500">{item.label}<span className="ml-1 text-[10px] text-slate-400">{item.count}笔</span></div><div className={`mt-1 whitespace-nowrap text-[clamp(12px,3.5vw,15px)] font-bold leading-none tracking-[-0.035em] ${item.value >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatT0SettlementAmount(item.value)}<span className="ml-0.5 text-[9px] font-medium">U</span></div></div>)}</div>
  </div>;
}

function T0AdminWeeklySettlementMemberList({
  report,
  expandedMemberId,
  onExpandedMemberChange,
}: {
  report: T0WeeklySettlementReport;
  expandedMemberId: number | null;
  onExpandedMemberChange: (userId: number | null) => void;
}) {
  return <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5"><span className="text-sm font-semibold text-slate-900">用户收益结算</span><span className="text-[11px] text-slate-400">{report.members.length} 人</span></div><div className="divide-y divide-slate-100">{report.members.map((member) => { const expanded = expandedMemberId === member.userId; return <div key={member.userId}><button type="button" onClick={() => onExpandedMemberChange(expanded ? null : member.userId)} className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left active:bg-slate-50"><div className="min-w-0"><div className="truncate text-sm font-semibold text-slate-800">{member.name}</div><div className="mt-1 text-[10px] tabular-nums text-slate-400">订单 {member.income.orderCount} · 分佣 {member.income.commissionCount} · 共享 {member.income.sharedCount}</div></div><div className="shrink-0 text-right tabular-nums"><div className={`text-sm font-bold leading-none ${member.income.total >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatT0SettlementAmount(member.income.total)} <span className="text-[9px] font-medium">U</span></div><div className="mt-1 text-[10px] text-slate-400">点击查看收益构成</div></div></button>{expanded && <div className="grid grid-cols-3 divide-x divide-slate-200 border-t border-slate-100 bg-slate-50/70 text-center tabular-nums"><div className="min-w-0 px-1 py-2"><div className="text-[10px] text-slate-400">订单</div><div className={`mt-1 whitespace-nowrap text-xs font-semibold ${member.income.order >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatT0SettlementAmount(member.income.order)}</div></div><div className="min-w-0 px-1 py-2"><div className="text-[10px] text-slate-400">分佣</div><div className={`mt-1 whitespace-nowrap text-xs font-semibold ${member.income.commission >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatT0SettlementAmount(member.income.commission)}</div></div><div className="min-w-0 px-1 py-2"><div className="text-[10px] text-slate-400">共享</div><div className={`mt-1 whitespace-nowrap text-xs font-semibold ${member.income.shared >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatT0SettlementAmount(member.income.shared)}</div></div></div>}</div>; })}</div></div>;
}

function T0TeamWeeklySettlementCard({
  teamSettlement,
  isLoading,
  hasError,
  countdown,
  onPreviousWeek,
  onNextWeek,
  hasPreviousWeek = false,
  hasNextWeek = false,
}: {
  teamSettlement?: T0TeamWeeklySettlement;
  isLoading: boolean;
  hasError: boolean;
  countdown: number | null;
  onPreviousWeek?: () => void;
  onNextWeek?: () => void;
  hasPreviousWeek?: boolean;
  hasNextWeek?: boolean;
}) {
  // 首次进入仍显示加载态；周切换时保留上一张已读卡，避免移动端看起来像“点击无反应”。
  if (isLoading && !teamSettlement) return <div className="min-h-[220px] bg-white px-3 py-12 text-center text-xs text-slate-400">团队结算数据加载中…</div>;
  if (hasError) return <div className="min-h-[220px] bg-white px-3 py-12 text-center text-xs leading-5 text-rose-600">团队结算暂时无法读取，请稍后刷新。</div>;
  if (!teamSettlement) return <div className="min-h-[220px] bg-white" />;
  if (!teamSettlement.enabled || !teamSettlement.period || !teamSettlement.summary) return <div className="min-h-[220px] bg-white px-3 py-12 text-center text-xs leading-5 text-rose-600">团队结算暂时无法读取，请稍后刷新。</div>;
  const members = Array.isArray(teamSettlement.members) ? teamSettlement.members : [];
  const income = teamSettlement.summary.income;
  const avatarPreview = members.slice(0, 6);
  const isRealtimeWeek = teamSettlement.status !== "backfill";
  const periodStatusLabel = isRealtimeWeek ? "距下期结算" : "本期状态";
  const periodStatusValue = isLoading ? "切换中" : isRealtimeWeek ? (countdown === null ? "--:--:--" : countdown <= 0 ? "切换中" : formatT0WeeklySettlementCountdown(countdown)) : "回溯核算";
  return <>
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-slate-800 bg-slate-900 px-3 py-3 text-white">
      <div className="min-w-0"><div className="truncate text-[11px] font-medium text-slate-300">团队结算周期</div><div className="mt-1 whitespace-nowrap text-[clamp(12px,3.5vw,15px)] font-bold leading-none tabular-nums">{formatT0WeeklySettlementPeriod(teamSettlement.period.weekStartBjt, teamSettlement.period.weekEndExclusiveBjt)} <span className="ml-1 text-[10px] font-medium text-slate-300">北京时间</span></div></div>
      <div className="shrink-0 text-right tabular-nums"><div className="text-[11px] font-medium text-slate-300">{periodStatusLabel}</div><div className="mt-1 whitespace-nowrap text-[clamp(12px,3.5vw,15px)] font-bold leading-none tracking-[-0.035em] text-white">{periodStatusValue}</div></div>
    </div>
    <div className="px-3 py-3 text-center tabular-nums"><div className="text-[11px] text-slate-500">团队{isRealtimeWeek ? "本周" : "本期"}收益结算 · {teamSettlement.summary.participantCount} 人</div><div className="mt-1 flex min-w-0 items-center justify-center gap-1.5"><div className="flex h-8 min-w-8 shrink-0 items-center justify-center pl-1">{avatarPreview.map((member, index) => <span key={member.userId} className="-ml-1.5 flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-slate-700 text-[9px] font-bold text-white" style={{ zIndex: avatarPreview.length - index }}>{member.avatar ? <img src={member.avatar} alt={`${member.name}头像`} className="h-full w-full object-cover" /> : member.name.slice(0, 1)}</span>)}{members.length > avatarPreview.length && <span className="-ml-1.5 flex h-7 min-w-7 items-center justify-center rounded-full border-2 border-white bg-slate-200 px-1 text-[9px] font-bold text-slate-600">+{members.length - avatarPreview.length}</span>}</div><div className={`whitespace-nowrap text-[clamp(24px,7vw,30px)] font-bold leading-none tracking-[-0.04em] ${income.total >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatT0SettlementAmount(income.total)} <span className="text-xs font-semibold">U</span></div></div></div>
    <div className="grid grid-cols-3 divide-x divide-slate-200 border-t border-slate-100 text-center tabular-nums">
      {[{ label: "订单", value: income.order }, { label: "分佣", value: income.commission }, { label: "共享", value: income.shared }].map((item) => <div key={item.label} className="min-w-0 px-1.5 py-2.5"><div className="text-[10px] text-slate-500">{item.label}</div><div className={`mt-1 whitespace-nowrap text-[clamp(11px,3.25vw,14px)] font-bold leading-none tracking-[-0.035em] ${item.value >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatT0SettlementAmount(item.value)}</div></div>)}
    </div>
    </div>
    <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex h-11 items-center justify-between border-b border-slate-100 px-1.5">
        <button type="button" onClick={onPreviousWeek} disabled={!hasPreviousWeek} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors active:scale-90 active:bg-slate-100 ${hasPreviousWeek ? "text-slate-500 active:text-slate-900" : "text-slate-200"}`} aria-label="查看上一周团队结算"><ChevronLeft className="h-5 w-5" strokeWidth={2.35} /></button>
        <div className="whitespace-nowrap text-[13px] font-semibold tracking-[-0.02em] tabular-nums text-slate-800" aria-live="polite">{formatT0WeeklySettlementPeriodChinese(teamSettlement.period.weekStartBjt, teamSettlement.period.weekEndExclusiveBjt)}</div>
        <button type="button" onClick={onNextWeek} disabled={!hasNextWeek} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors active:scale-90 active:bg-slate-100 ${hasNextWeek ? "text-slate-500 active:text-slate-900" : "text-slate-200"}`} aria-label="查看下一周团队结算"><ChevronRight className="h-5 w-5" strokeWidth={2.35} /></button>
      </div>
      <div>
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2"><span className="text-xs font-semibold text-slate-800">成员{isRealtimeWeek ? "本周" : "本期"}收益</span><span className="text-[10px] text-slate-400">仅下属成员</span></div>
      {members.length > 0 ? <div className="divide-y divide-slate-100">{members.map((member) => {
        const composition = [
          { key: "order", label: "订单", value: Number(member.income.order) || 0, positive: "#2563eb", negative: "#059669" },
          { key: "commission", label: "分佣", value: Number(member.income.commission) || 0, positive: "#f59e0b", negative: "#10b981" },
          { key: "shared", label: "共享", value: Number(member.income.shared) || 0, positive: "#16a34a", negative: "#047857" },
        ];
        const absoluteTotal = composition.reduce((total, item) => total + Math.abs(item.value), 0);
        return <div key={member.userId} className="px-3 py-3">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-800 text-[11px] font-bold text-white">{member.avatar ? <img src={member.avatar} alt={`${member.name}头像`} className="h-full w-full object-cover" /> : member.name.slice(0, 1)}</div>
              <div className="min-w-0"><div className="truncate text-[13px] font-semibold text-slate-800">{member.name}</div><div className="mt-0.5 text-[10px] text-slate-400">{isRealtimeWeek ? "本周" : "本期"}收益结算</div></div>
            </div>
            <div className={`shrink-0 whitespace-nowrap text-[clamp(17px,5vw,21px)] font-bold leading-none tracking-[-0.035em] tabular-nums ${member.income.total >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatT0SettlementAmount(member.income.total)} <span className="text-[9px] font-semibold">U</span></div>
          </div>
          <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-slate-200" role="img" aria-label={`${member.name}本周订单、分佣、共享收益构成`}>{absoluteTotal > 0 ? composition.map((item) => <div key={item.key} title={`${item.label} ${formatT0SettlementAmount(item.value)} U`} style={{ width: `${Math.abs(item.value) / absoluteTotal * 100}%`, backgroundColor: item.value >= 0 ? item.positive : item.negative }} />) : <div className="w-full bg-slate-200" />}</div>
          <div className="mt-2 grid grid-cols-3 gap-1 text-center tabular-nums">{composition.map((item) => <div key={item.key} className="min-w-0"><div className="text-[10px] text-slate-500">{item.label}</div><div className="mt-0.5 truncate text-[11px] font-bold leading-none" style={{ color: item.value >= 0 ? item.positive : item.negative }}>{formatT0SettlementAmount(item.value)}</div></div>)}</div>
        </div>;
      })}</div> : <div className="px-3 py-8 text-center text-xs text-slate-400">暂无符合团队结算范围的成员</div>}
      </div>
    </div>
  </>;
}

type T0SettlementAdjustmentPrefill = { accountId?: string; closingEntryId?: string };

/** 管理员专用：调整单仅追加保存；原订单、分佣快照、共享流水和冻结周报都不在此编辑。 */
function T0WeeklySettlementAdjustmentSheet({
  reconciliation,
  prefill,
  onClose,
  onSaved,
}: {
  reconciliation: T0WeeklySettlementAccountReconciliation;
  prefill?: T0SettlementAdjustmentPrefill;
  onClose: () => void;
  onSaved: () => void;
}) {
  const allUsers = useMemo(() => {
    const users = new Map<number, string>();
    reconciliation.destinations.forEach((destination) => users.set(destination.userId, destination.name));
    reconciliation.accounts.forEach((account) => account.closings.forEach((closing) => {
      users.set(closing.ownerUserId, closing.ownerName);
      closing.allocations.forEach((allocation) => users.set(allocation.userId, allocation.name));
    }));
    return Array.from(users.entries()).map(([userId, name]) => ({ userId, name })).sort((left, right) => left.name.localeCompare(right.name, "zh-CN") || left.userId - right.userId);
  }, [reconciliation.accounts, reconciliation.destinations]);
  const [type, setType] = useState<"source_correction" | "allocation_transfer" | "hold">(prefill?.closingEntryId ? "source_correction" : "allocation_transfer");
  const [accountId, setAccountId] = useState(prefill?.accountId || reconciliation.accounts[0]?.accountId || "");
  const [sourceClosingEntryId, setSourceClosingEntryId] = useState(prefill?.closingEntryId || "");
  const [sourceNetPnlDelta, setSourceNetPnlDelta] = useState("");
  const [allocationRows, setAllocationRows] = useState<Array<{ userId: string; amount: string }>>(() => [{ userId: String(allUsers[0]?.userId || ""), amount: "" }]);
  const [transferFromUserId, setTransferFromUserId] = useState(String(allUsers[0]?.userId || ""));
  const [transferToUserId, setTransferToUserId] = useState(String(allUsers[1]?.userId || allUsers[0]?.userId || ""));
  const [transferAmount, setTransferAmount] = useState("");
  const [reason, setReason] = useState("");
  const [errorText, setErrorText] = useState("");
  const requestIdRef = useRef<string | null>(null);
  const utils = trpc.useUtils();
  const selectedAccount = reconciliation.accounts.find((account) => account.accountId === accountId);
  const isPreviewRuntime = typeof window !== "undefined" && window.location.hostname.includes(".manus.computer");
  const saveMutation = trpc.ledger.t0CreateWeeklySettlementAdjustment.useMutation({
    onSuccess: async () => {
      requestIdRef.current = null;
      await utils.ledger.t0GetWeeklySettlementAccountReconciliation.invalidate({ ledgerId: 52 });
      onSaved();
      onClose();
    },
    onError: (error) => setErrorText(error.message || "结算调整保存失败"),
  });
  const typeMeta: Record<typeof type, { label: string; description: string }> = {
    source_correction: { label: "账户收益补正", description: "补正来源账户收益，并把同额补正分配到用户去向" },
    allocation_transfer: { label: "用户去向调整", description: "账户收益不变，只在两位用户之间转移归属" },
    hold: { label: "暂挂说明", description: "只记录待核对原因，不产生任何金额影响" },
  };
  const createClientRequestId = () => {
    if (requestIdRef.current) return requestIdRef.current;
    const uuid = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `t0adjust-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    requestIdRef.current = uuid;
    return uuid;
  };
  const submit = () => {
    setErrorText("");
    if (!reason.trim()) {
      setErrorText("请填写调整原因");
      return;
    }
    if ((type === "source_correction" || type === "allocation_transfer") && !accountId) {
      setErrorText("请选择来源账户");
      return;
    }
    const allocations = type === "allocation_transfer"
      ? [
        { userId: Number(transferFromUserId), amount: transferAmount.trim() ? `-${transferAmount.trim().replace(/^-/, "")}` : "" },
        { userId: Number(transferToUserId), amount: transferAmount.trim().replace(/^-/, "") },
      ]
      : type === "source_correction"
        ? allocationRows.filter((row) => row.userId && row.amount.trim()).map((row) => ({ userId: Number(row.userId), amount: row.amount.trim() }))
        : [];
    if (type === "allocation_transfer" && (!transferFromUserId || !transferToUserId || transferFromUserId === transferToUserId || !transferAmount.trim())) {
      setErrorText("请选择不同的转出、转入用户并填写金额");
      return;
    }
    if (type === "source_correction" && (!sourceNetPnlDelta.trim() || allocations.length === 0)) {
      setErrorText("请填写账户补正金额及至少一位用户去向");
      return;
    }
    saveMutation.mutate({
      ledgerId: 52,
      weekStartBjt: reconciliation.period.weekStartBjt,
      type,
      accountId: type === "hold" ? undefined : accountId || undefined,
      sourceClosingEntryId: type === "hold" ? undefined : sourceClosingEntryId || undefined,
      sourceNetPnlDelta: type === "source_correction" ? sourceNetPnlDelta.trim() : "0",
      allocations,
      reason: reason.trim(),
      clientRequestId: createClientRequestId(),
    });
  };
  return <div className="fixed inset-0 z-[90] flex items-end bg-slate-950/35 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label="新增结算调整单">
    <section className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-w-md sm:rounded-2xl">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3"><div><div className="text-base font-semibold text-slate-900">结算调整单</div><div className="mt-0.5 text-[10px] text-slate-400">{formatT0WeeklySettlementPeriod(reconciliation.period.weekStartBjt, reconciliation.period.weekEndExclusiveBjt)} · 北京时间</div></div><button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 active:bg-slate-100" aria-label="关闭结算调整单"><X className="h-4 w-4" /></button></div>
      <div className="space-y-4 px-4 py-4">
        {isPreviewRuntime && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">当前为只读热预览，可核对填写与守恒规则；保存不会写入真实数据。</div>}
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="调整类型">{(["source_correction", "allocation_transfer", "hold"] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={type === item} onClick={() => { setType(item); setErrorText(""); requestIdRef.current = null; }} className={`min-h-9 rounded-md px-1 text-[11px] font-semibold ${type === item ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>{item === "source_correction" ? "账户补正" : item === "allocation_transfer" ? "用户去向" : "暂挂"}</button>)}</div>
        <p className="-mt-2 text-[11px] leading-5 text-slate-500">{typeMeta[type].description}</p>
        {type !== "hold" && <label className="block"><span className="text-[11px] font-medium text-slate-600">来源账户</span><select value={accountId} onChange={(event) => { setAccountId(event.target.value); setSourceClosingEntryId(""); requestIdRef.current = null; }} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-800"><option value="">请选择账户</option>{reconciliation.accounts.map((account) => <option key={account.accountId} value={account.accountId}>{account.accountName}</option>)}</select></label>}
        {type !== "hold" && selectedAccount && <label className="block"><span className="text-[11px] font-medium text-slate-600">关联平仓单 <span className="font-normal text-slate-400">可不选</span></span><select value={sourceClosingEntryId} onChange={(event) => { setSourceClosingEntryId(event.target.value); requestIdRef.current = null; }} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-800"><option value="">不关联具体平仓单</option>{selectedAccount.closings.map((closing) => <option key={closing.closingEntryId} value={closing.closingEntryId}>#{closing.closingEntryId} · {formatT0SettlementOccurredAt(closing.occurredAt)} · {formatT0SettlementAmount(closing.netPnl)} U</option>)}</select></label>}
        {type === "source_correction" && <><label className="block"><span className="text-[11px] font-medium text-slate-600">账户净收益补正 <span className="font-normal text-slate-400">正数增加，负数减少</span></span><input inputMode="decimal" value={sourceNetPnlDelta} onChange={(event) => { setSourceNetPnlDelta(event.target.value); requestIdRef.current = null; }} placeholder="例如 100.00 或 -100.00" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-2 text-sm tabular-nums" /></label><div><div className="mb-1 flex items-center justify-between"><span className="text-[11px] font-medium text-slate-600">用户去向 <span className="font-normal text-slate-400">合计必须等于补正金额</span></span><button type="button" onClick={() => { setAllocationRows((rows) => [...rows, { userId: String(allUsers[0]?.userId || ""), amount: "" }]); requestIdRef.current = null; }} className="text-[11px] font-semibold text-blue-600">增加用户</button></div><div className="space-y-2">{allocationRows.map((row, index) => <div key={index} className="grid grid-cols-[minmax(0,1fr)_104px_28px] items-center gap-2"><select value={row.userId} onChange={(event) => { setAllocationRows((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, userId: event.target.value } : item)); requestIdRef.current = null; }} className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-xs"><option value="">选择用户</option>{allUsers.map((user) => <option key={user.userId} value={user.userId}>{user.name}</option>)}</select><input inputMode="decimal" value={row.amount} onChange={(event) => { setAllocationRows((rows) => rows.map((item, rowIndex) => rowIndex === index ? { ...item, amount: event.target.value } : item)); requestIdRef.current = null; }} placeholder="金额" className="h-9 min-w-0 rounded-lg border border-slate-200 px-2 text-xs tabular-nums" />{allocationRows.length > 1 ? <button type="button" onClick={() => { setAllocationRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index)); requestIdRef.current = null; }} className="flex h-7 w-7 items-center justify-center rounded text-slate-400 active:bg-slate-100" aria-label="移除此用户"><Minus className="h-3.5 w-3.5" /></button> : <span />}</div>)}</div></div></>}
        {type === "allocation_transfer" && <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3"><div className="text-[11px] font-medium text-slate-600">用户去向调整 <span className="font-normal text-slate-400">账户收益不变</span></div><label className="block"><span className="text-[10px] text-slate-500">从谁减少</span><select value={transferFromUserId} onChange={(event) => { setTransferFromUserId(event.target.value); requestIdRef.current = null; }} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm"><option value="">选择用户</option>{allUsers.map((user) => <option key={user.userId} value={user.userId}>{user.name}</option>)}</select></label><label className="block"><span className="text-[10px] text-slate-500">给谁增加</span><select value={transferToUserId} onChange={(event) => { setTransferToUserId(event.target.value); requestIdRef.current = null; }} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm"><option value="">选择用户</option>{allUsers.map((user) => <option key={user.userId} value={user.userId}>{user.name}</option>)}</select></label><label className="block"><span className="text-[10px] text-slate-500">转移金额</span><input inputMode="decimal" value={transferAmount} onChange={(event) => { setTransferAmount(event.target.value); requestIdRef.current = null; }} placeholder="例如 100.00" className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm tabular-nums" /></label><div className="text-[10px] text-slate-500">系统保存时自动记录：转出 -金额、转入 +金额，合计严格为 0。</div></div>}
        <label className="block"><span className="text-[11px] font-medium text-slate-600">调整原因</span><textarea value={reason} onChange={(event) => { setReason(event.target.value); requestIdRef.current = null; }} maxLength={500} rows={3} placeholder="说明发现的问题、核对依据和处理原因" className="mt-1 w-full resize-none rounded-lg border border-slate-200 px-2 py-2 text-sm leading-5" /></label>
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-[10px] leading-5 text-slate-500">保存后新增一张不可修改的调整凭证；如需更正，请另开一张反向调整单。不会自动移动真实资金。</div>
        {errorText && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] leading-5 text-rose-700" role="alert">{errorText}</div>}
        <div className="flex gap-2 pb-1"><button type="button" onClick={onClose} className="h-10 flex-1 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600">取消</button><button type="button" onClick={submit} disabled={saveMutation.isPending} className="h-10 flex-[1.4] rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-50">{saveMutation.isPending ? "保存中…" : "保存调整"}</button></div>
      </div>
    </section>
  </div>;
}

/** 银行式对账确认仅追加审计凭证；服务端会重算哈希并拒绝已变化、未对齐或进行中的结算周。 */
function T0WeeklySettlementReconciliationConfirmationSheet({
  reconciliation,
  onClose,
  onConfirmed,
}: {
  reconciliation: T0WeeklySettlementAccountReconciliation;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [note, setNote] = useState("");
  const [errorText, setErrorText] = useState("");
  const requestIdRef = useRef<string | null>(null);
  const utils = trpc.useUtils();
  const isPreviewRuntime = typeof window !== "undefined" && window.location.hostname.includes(".manus.computer");
  const createClientRequestId = () => {
    if (requestIdRef.current) return requestIdRef.current;
    requestIdRef.current = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `t0reconcile-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    return requestIdRef.current;
  };
  const confirmMutation = trpc.ledger.t0ConfirmWeeklySettlementAccountReconciliation.useMutation({
    onSuccess: async () => {
      requestIdRef.current = null;
      await utils.ledger.t0GetWeeklySettlementAccountReconciliation.invalidate();
      onConfirmed();
      onClose();
    },
    onError: (error) => setErrorText(error.message || "账目已平确认失败"),
  });
  const submit = () => {
    setErrorText("");
    confirmMutation.mutate({
      ledgerId: 52,
      weekStartBjt: reconciliation.period.weekStartBjt,
      expectedReconciliationHash: reconciliation.reconciliationHash,
      note: note.trim() || undefined,
      clientRequestId: createClientRequestId(),
    });
  };
  const sourceLabel = reconciliation.settlementReference.status === "frozen" ? "已冻结周" : "回溯核算周";
  return <div className="fixed inset-0 z-[90] flex items-end bg-slate-950/35 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label="确认账目已平">
    <section className="w-full rounded-t-2xl bg-white shadow-2xl sm:max-w-md sm:rounded-2xl">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><div className="text-base font-semibold text-slate-900">确认账目已平</div><div className="mt-0.5 text-[10px] text-slate-400">{formatT0WeeklySettlementPeriod(reconciliation.period.weekStartBjt, reconciliation.period.weekEndExclusiveBjt)} · {sourceLabel}</div></div><button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 active:bg-slate-100" aria-label="关闭账目已平确认"><X className="h-4 w-4" /></button></div>
      <div className="space-y-4 px-4 py-4">
        {isPreviewRuntime && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">当前为只读热预览，可查看确认前校验；不会保存账目已平确认。</div>}
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3"><div className="flex items-center gap-2 text-sm font-semibold text-emerald-800"><ShieldCheck className="h-4 w-4" />本周期账户账目已对齐</div><div className="mt-2 grid grid-cols-3 divide-x divide-emerald-100 text-center tabular-nums"><div><div className="text-[9px] text-emerald-700/70">账户净收益</div><div className="mt-1 text-xs font-bold text-emerald-800">{formatT0SettlementAmount(reconciliation.summary.netPnl)}</div></div><div><div className="text-[9px] text-emerald-700/70">用户去向</div><div className="mt-1 text-xs font-bold text-emerald-800">{formatT0SettlementAmount(reconciliation.summary.allocatedTotal)}</div></div><div><div className="text-[9px] text-emerald-700/70">调整凭证</div><div className="mt-1 text-xs font-bold text-emerald-800">{reconciliation.adjustments.length} 张</div></div></div></div>
        <label className="block"><span className="text-[11px] font-medium text-slate-600">核对说明 <span className="font-normal text-slate-400">可选</span></span><textarea value={note} onChange={(event) => { setNote(event.target.value); setErrorText(""); requestIdRef.current = null; }} maxLength={300} rows={3} placeholder="例如：已核对各账户利润与用户去向" className="mt-1 w-full resize-none rounded-lg border border-slate-200 px-2 py-2 text-sm leading-5" /></label>
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-[10px] leading-5 text-slate-500">确认后会新增一张不可修改的对账凭证，锁定本周逐笔来源、用户去向及全部调整哈希。后续任何来源或调整变化，都将自动变为“需重新确认”；不会自动移动真实资金。</div>
        {errorText && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] leading-5 text-rose-700" role="alert">{errorText}</div>}
        <div className="flex gap-2 pb-1"><button type="button" onClick={onClose} className="h-10 flex-1 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600">取消</button><button type="button" onClick={submit} disabled={confirmMutation.isPending} className="h-10 flex-[1.4] rounded-lg bg-slate-900 text-sm font-semibold text-white disabled:opacity-50">{confirmMutation.isPending ? "确认中…" : "确认账目已平"}</button></div>
      </div>
    </section>
  </div>;
}

/** 管理员结算工作台：先按账户核对来源，再按用户反查去向；调整单仅追加，不提供资金写入操作。 */
function T0WeeklySettlementAccountReconciliationPanel({
  reconciliation,
  isLoading,
  hasError,
  weeks,
  selectedWeekStart,
  onSelectedWeekStartChange,
  expandedAccountId,
  onExpandedAccountChange,
  expandedDestinationUserId,
  onExpandedDestinationUserChange,
}: {
  reconciliation?: T0WeeklySettlementAccountReconciliation;
  isLoading: boolean;
  hasError: boolean;
  weeks: Array<{ weekStartBjt: string; weekEndExclusiveBjt: string }>;
  selectedWeekStart: string;
  onSelectedWeekStartChange: (weekStartBjt: string) => void;
  expandedAccountId: string | null;
  onExpandedAccountChange: (accountId: string | null) => void;
  expandedDestinationUserId: number | null;
  onExpandedDestinationUserChange: (userId: number | null) => void;
}) {
  const [adjustmentPrefill, setAdjustmentPrefill] = useState<T0SettlementAdjustmentPrefill | null>(null);
  const [showConfirmationSheet, setShowConfirmationSheet] = useState(false);
  const [expandedClosingKey, setExpandedClosingKey] = useState<string | null>(null);
  const accountsSourceExportRef = useRef<HTMLElement | null>(null);
  const accountSummaryExportTargetsRef = useRef(new Map<string, HTMLElement>());
  const accountRecipientExportTargetsRef = useRef(new Map<string, HTMLElement>());
  const accountOrderExportTargetsRef = useRef(new Map<string, HTMLElement>());
  const destinationUserExportTargetsRef = useRef(new Map<string, HTMLElement>());
  const getAccountExportRef = useCallback((targets: Map<string, HTMLElement>, accountId: string) => {
    return { get current() { return targets.get(accountId) || null; } };
  }, []);
  if (isLoading && !reconciliation) return <div className="mt-3 border-y border-slate-200 px-3 py-10 text-center text-xs text-slate-400">账户对账数据加载中…</div>;
  if (hasError && !reconciliation) return <div className="mt-3 border border-rose-200 bg-rose-50 px-3 py-3 text-xs leading-5 text-rose-700">账户对账暂时无法读取，请稍后刷新。</div>;
  if (!reconciliation) return <div className="mt-3 border-y border-slate-200 px-3 py-10 text-center text-xs text-slate-400">暂无账户对账数据</div>;
  const allReconciled = reconciliation.summary.unreconciledClosingCount === 0 && isT0SettlementReconciled(reconciliation.summary.variance);
  const orderedWeeks = Array.from(new Map(weeks.map((week) => [week.weekStartBjt, week])).values()).sort((left, right) => left.weekStartBjt.localeCompare(right.weekStartBjt));
  const selectedWeekIndex = Math.max(0, orderedWeeks.findIndex((week) => week.weekStartBjt === selectedWeekStart));
  const olderWeek = orderedWeeks[selectedWeekIndex - 1];
  const newerWeek = orderedWeeks[selectedWeekIndex + 1];
  const referenceStatusLabel = reconciliation.settlementReference.status === "frozen" ? "已冻结" : reconciliation.settlementReference.status === "backfill" ? "回溯核算" : "实时周";
  const hasUnresolvedHold = reconciliation.adjustments.some((adjustment) => adjustment.type === "hold");
  const canConfirm = reconciliation.settlementReference.status !== "realtime"
    && !reconciliation.settlementReference.frozenSourceChanged
    && !hasUnresolvedHold
    && allReconciled;
  const confirmationLabel = reconciliation.confirmation.state === "confirmed"
    ? "账目已平"
    : reconciliation.confirmation.state === "stale"
      ? "需重新确认"
      : "待确认";
  const kindMeta: Record<"order" | "commission" | "shared", { label: string; className: string }> = {
    order: { label: "订单", className: "bg-blue-50 text-blue-700" },
    commission: { label: "分佣", className: "bg-amber-50 text-amber-700" },
    shared: { label: "共享", className: "bg-emerald-50 text-emerald-700" },
  };
  return <>
    <section className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="账户对账汇总">
      <div className="border-b border-slate-100 px-3 py-2.5"><div className="flex items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-1"><button type="button" onClick={() => olderWeek && onSelectedWeekStartChange(olderWeek.weekStartBjt)} disabled={!olderWeek} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 active:bg-slate-50 disabled:opacity-25" aria-label="查看更早一周账户对账"><ChevronLeft className="h-4 w-4" /></button><div className="min-w-0"><div className="text-sm font-semibold text-slate-900">账户对账</div><div className="mt-0.5 whitespace-nowrap text-[10px] tabular-nums text-slate-400">{formatT0WeeklySettlementPeriod(reconciliation.period.weekStartBjt, reconciliation.period.weekEndExclusiveBjt)} · 北京时间</div></div><button type="button" onClick={() => newerWeek && onSelectedWeekStartChange(newerWeek.weekStartBjt)} disabled={!newerWeek} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 active:bg-slate-50 disabled:opacity-25" aria-label="查看更新一周账户对账"><ChevronRight className="h-4 w-4" /></button></div><button type="button" onClick={() => setAdjustmentPrefill({})} className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-slate-200 px-2 text-[10px] font-semibold text-slate-600 active:bg-slate-50"><Plus className="h-3 w-3" />调整</button></div><div className="mt-2 flex flex-wrap items-center gap-1.5"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${reconciliation.settlementReference.status === "frozen" ? "bg-blue-50 text-blue-700" : reconciliation.settlementReference.status === "backfill" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{referenceStatusLabel}</span><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${allReconciled ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{allReconciled ? "全部已对齐" : `${reconciliation.summary.unreconciledClosingCount} 笔待核对`}</span>{reconciliation.confirmation.state === "confirmed" ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700"><Check className="h-3 w-3" />{confirmationLabel}</span> : canConfirm ? <button type="button" onClick={() => setShowConfirmationSheet(true)} className="inline-flex h-7 items-center gap-1 rounded-md bg-slate-900 px-2 text-[10px] font-semibold text-white active:opacity-85"><ShieldCheck className="h-3 w-3" />{reconciliation.confirmation.state === "stale" ? "重新确认" : "账目已平确认"}</button> : <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${reconciliation.confirmation.state === "stale" || reconciliation.settlementReference.frozenSourceChanged || hasUnresolvedHold ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"}`}>{reconciliation.confirmation.state === "stale" ? confirmationLabel : reconciliation.settlementReference.frozenSourceChanged ? "冻结来源已变化" : hasUnresolvedHold ? "有暂挂待处理" : reconciliation.settlementReference.status === "realtime" ? "周结束后确认" : "未满足确认条件"}</span>}</div></div>
      <div className="grid grid-cols-3 divide-x divide-slate-200 text-center tabular-nums">
        <div className="min-w-0 px-1.5 py-3"><div className="text-[10px] text-slate-500">账户净收益</div><div className={`mt-1 whitespace-nowrap text-[clamp(12px,3.4vw,15px)] font-bold leading-none tracking-[-0.035em] ${reconciliation.summary.netPnl >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatT0SettlementAmount(reconciliation.summary.netPnl)}<span className="ml-0.5 text-[8px] font-medium">U</span></div><div className="mt-1 text-[9px] text-slate-400">{reconciliation.summary.accountCount} 个账户</div></div>
        <div className="min-w-0 px-1.5 py-3"><div className="text-[10px] text-slate-500">用户去向</div><div className={`mt-1 whitespace-nowrap text-[clamp(12px,3.4vw,15px)] font-bold leading-none tracking-[-0.035em] ${reconciliation.summary.allocatedTotal >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatT0SettlementAmount(reconciliation.summary.allocatedTotal)}<span className="ml-0.5 text-[8px] font-medium">U</span></div><div className="mt-1 text-[9px] text-slate-400">{reconciliation.destinations.length} 人</div></div>
        <div className="min-w-0 px-1.5 py-3"><div className="text-[10px] text-slate-500">对账差额</div><div className={`mt-1 whitespace-nowrap text-[clamp(12px,3.4vw,15px)] font-bold leading-none tracking-[-0.035em] ${isT0SettlementReconciled(reconciliation.summary.variance) ? "text-slate-700" : reconciliation.summary.variance >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatT0SettlementAmount(reconciliation.summary.variance)}<span className="ml-0.5 text-[8px] font-medium">U</span></div><div className="mt-1 text-[9px] text-slate-400">{reconciliation.summary.closingCount} 笔平仓</div></div>
      </div>
    </section>

    <section className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="本周期结算调整单">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5"><div><div className="text-sm font-semibold text-slate-900">结算调整单</div><div className="mt-0.5 text-[10px] text-slate-400">追加凭证，不改原始记录</div></div><span className="text-[11px] tabular-nums text-slate-400">{(reconciliation.adjustments || []).length} 张</span></div>
      {(reconciliation.adjustments || []).length === 0 ? <div className="px-3 py-4 text-[11px] leading-5 text-slate-400">本周期暂无追加调整。发现填写或归属错误时，可从上方“调整”建立凭证。</div> : <div className="divide-y divide-slate-100">{(reconciliation.adjustments || []).map((adjustment) => {
        const typeLabel = adjustment.type === "source_correction" ? "账户收益补正" : adjustment.type === "allocation_transfer" ? "用户去向调整" : "暂挂说明";
        const typeClass = adjustment.type === "source_correction" ? "bg-rose-50 text-rose-700" : adjustment.type === "allocation_transfer" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700";
        return <div key={adjustment.id} className="px-3 py-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${typeClass}`}>{typeLabel}</span>{adjustment.accountName && <span className="truncate text-[11px] font-medium text-slate-700">{adjustment.accountName}</span>}{adjustment.sourceClosingEntryId && <span className="text-[10px] text-slate-400">#{adjustment.sourceClosingEntryId}</span>}</div><div className="mt-1 text-[11px] leading-5 text-slate-600">{adjustment.reason}</div></div>{adjustment.type === "source_correction" && <div className={`shrink-0 text-sm font-bold tabular-nums ${adjustment.sourceNetPnlDelta >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatT0SettlementAmount(adjustment.sourceNetPnlDelta)} <span className="text-[8px] font-medium">U</span></div>}</div>{adjustment.allocations.length > 0 && <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[10px] tabular-nums">{adjustment.allocations.map((line) => <span key={line.userId} className={line.amount >= 0 ? "text-rose-600" : "text-emerald-600"}>{line.name} {formatT0SettlementAmount(line.amount)} U</span>)}</div>}<div className="mt-2 text-[9px] text-slate-400">{adjustment.createdByName} · {formatT0SettlementOccurredAt(adjustment.createdAt)} · 凭证 #{adjustment.id}</div></div>;
      })}</div>}
    </section>

    <section ref={accountsSourceExportRef} className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="按账户查看本周期结算来源">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5"><div className="flex items-center gap-1"><span className="text-sm font-semibold text-slate-900">账户来源</span>{expandedAccountId && <OrderCardImageDownload targetRef={accountsSourceExportRef} orderNo={reconciliation.period.weekStartBjt} filenamePrefix="T0账户来源" previewTitle="账户来源图片预览" previewHint="仅包含当前已展开账户的完整来源；未展开账户不会进入图片" color="#475569" outerPadding={8} captureFullContent fullContentHorizontalBleed={0} fullContentBottomPadding={0} exportBackground="#FFFFFF" variant="bare" />}</div><span className="text-[11px] text-slate-400">点账户看逐笔去向</span></div>
      {reconciliation.accounts.length === 0 ? <div className="px-3 py-7 text-center text-xs text-slate-400">本周期暂无已实现平仓收益</div> : <div className="divide-y divide-slate-100">{reconciliation.accounts.map((account) => {
        const expanded = expandedAccountId === account.accountId;
        const accountReconciled = account.unreconciledClosingCount === 0 && isT0SettlementReconciled(account.variance);
        return <div key={account.accountId} data-card-export-hide={expanded ? undefined : "true"}>
          <div ref={(node) => { if (node) accountSummaryExportTargetsRef.current.set(account.accountId, node); else accountSummaryExportTargetsRef.current.delete(account.accountId); }}>
            <div className="flex items-center gap-1.5"><button type="button" onClick={() => { onExpandedAccountChange(expanded ? null : account.accountId); setExpandedClosingKey(null); }} className="flex min-w-0 flex-1 items-center justify-between gap-3 px-3 py-2.5 text-left active:bg-slate-50" aria-expanded={expanded}>
              <div className="flex min-w-0 items-baseline gap-x-1.5 gap-y-0.5"><div className="truncate text-sm font-semibold text-slate-800">{account.accountName}</div><div className="shrink-0 whitespace-nowrap text-[10px] tabular-nums text-slate-400">{account.closingCount} 笔 · 去向 {account.recipientCount} 人{account.unreconciledClosingCount > 0 ? ` · ${account.unreconciledClosingCount} 笔待核对` : ""}</div></div>
              <div className="shrink-0 text-right tabular-nums"><div className={`text-sm font-bold leading-none ${account.netPnl >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatT0SettlementAmount(account.netPnl)} <span className="text-[9px] font-medium">U</span></div>{!accountReconciled && <div className={`mt-1 whitespace-nowrap text-[10px] ${account.variance >= 0 ? "text-rose-600" : "text-emerald-600"}`}>差额 {formatT0SettlementAmount(account.variance)} U</div>}</div>
            </button>{expanded && <div data-card-export-hide="true" className="pr-2"><OrderCardImageDownload targetRef={getAccountExportRef(accountSummaryExportTargetsRef.current, account.accountId)} orderNo={`${account.accountName}-${reconciliation.period.weekStartBjt}`} filenamePrefix="T0账户摘要" previewTitle={`${account.accountName}账户摘要图片预览`} previewHint="包含账户、实际净收益、已归属用户、差额、按类型和按日期" color="#475569" outerPadding={8} captureFullContent fullContentHorizontalBleed={0} fullContentBottomPadding={0} exportBackground="#FFFFFF" variant="bare" /></div>}</div>
            {expanded && <div className="border-t border-slate-100 bg-slate-50/60"><div className="grid grid-cols-3 divide-x divide-slate-200 border-b border-slate-100 bg-white text-center tabular-nums"><div className="px-1 py-2"><div className="text-[9px] text-slate-400">实际净收益</div><div className={`mt-1 text-xs font-semibold ${account.netPnl >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatT0SettlementAmount(account.netPnl)}</div></div><div className="px-1 py-2"><div className="text-[9px] text-slate-400">已归属用户</div><div className={`mt-1 text-xs font-semibold ${account.allocatedTotal >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatT0SettlementAmount(account.allocatedTotal)}</div></div><div className="px-1 py-2"><div className="text-[9px] text-slate-400">差额</div><div className={`mt-1 text-xs font-semibold ${isT0SettlementReconciled(account.variance) ? "text-slate-700" : account.variance >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatT0SettlementAmount(account.variance)}</div></div></div><T0SettlementAccountSourceTopRows account={account} weekStartBjt={reconciliation.period.weekStartBjt} /></div>}
          </div>
          {expanded && <div className="bg-slate-50/60">
            <div ref={(node) => { if (node) accountRecipientExportTargetsRef.current.set(account.accountId, node); else accountRecipientExportTargetsRef.current.delete(account.accountId); }}><T0SettlementAccountRecipientSummary account={account} weekStartBjt={reconciliation.period.weekStartBjt} exportControl={<OrderCardImageDownload targetRef={getAccountExportRef(accountRecipientExportTargetsRef.current, account.accountId)} orderNo={`${account.accountName}-${reconciliation.period.weekStartBjt}`} filenamePrefix="T0账户用户去向" previewTitle={`${account.accountName}用户去向图片预览`} previewHint="仅包含当前账户的全部用户去向" color="#475569" outerPadding={8} captureFullContent fullContentHorizontalBleed={0} fullContentBottomPadding={0} exportBackground="#FFFFFF" variant="bare" />} /></div>
            <div ref={(node) => { if (node) accountOrderExportTargetsRef.current.set(account.accountId, node); else accountOrderExportTargetsRef.current.delete(account.accountId); }}><div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-3 py-1.5"><div className="flex items-center gap-1"><span className="text-[9px] font-semibold text-slate-600">逐笔订单</span><OrderCardImageDownload targetRef={getAccountExportRef(accountOrderExportTargetsRef.current, account.accountId)} orderNo={`${account.accountName}-${reconciliation.period.weekStartBjt}`} filenamePrefix="T0账户逐笔订单" previewTitle={`${account.accountName}逐笔订单图片预览`} previewHint="仅包含当前账户的全部逐笔订单及已展开的用户去向" color="#475569" outerPadding={8} captureFullContent fullContentHorizontalBleed={0} fullContentBottomPadding={0} exportBackground="#FFFFFF" variant="bare" /></div><span className="text-[9px] text-slate-400">点单笔看用户去向</span></div>
            <div className="divide-y divide-slate-100">{account.closings.map((closing) => {
              const closingReconciled = closing.variance !== null && isT0SettlementReconciled(closing.variance);
              const closingKey = `${account.accountId}:${closing.closingEntryId}`;
              const closingExpanded = expandedClosingKey === closingKey;
              return <div key={closing.closingEntryId}>
                <button type="button" onClick={() => setExpandedClosingKey(closingExpanded ? null : closingKey)} className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left active:bg-white" aria-expanded={closingExpanded}>
                  <div className="min-w-0"><div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[10px] font-semibold text-slate-700"><span>{formatT0SettlementOccurredAt(closing.occurredAt)}</span><span className="text-slate-300">·</span><span>{closing.action === "closeLong" ? "平多" : "平空"}</span></div><div className="mt-0.5 text-[9px] text-slate-400">{closing.ownerName} · {closing.quantity} ETH · 手续费已内含</div></div>
                  <div className="flex shrink-0 items-start gap-1 text-right tabular-nums"><div><div className={`text-[12px] font-bold leading-none ${closing.allocatedTotal >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatT0SettlementAmount(closing.allocatedTotal)} <span className="text-[8px] font-medium">U</span></div>{!closingReconciled && <div className={`mt-0.5 text-[8px] ${closing.variance === null || closing.variance >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{closing.variance === null ? "待核对" : `差额 ${formatT0SettlementAmount(closing.variance)}`}</div>}</div><ChevronRight className={`mt-0.5 h-3.5 w-3.5 text-slate-400 transition-transform ${closingExpanded ? "rotate-90" : ""}`} /></div>
                </button>
                {closingExpanded && <div className="border-t border-slate-100 bg-white/75 px-3 py-2.5">
                  {(closing.recordedSharedReduction !== 0 || closing.sharedTransferTotal !== 0) && <div className="text-[9px] tabular-nums text-slate-400">共享：来源内扣 {formatT0SettlementAmount(closing.recordedSharedReduction)} U · 去向 {formatT0SettlementAmount(closing.sharedTransferTotal)} U</div>}
                  {closing.allocations.length > 0 ? <div className="mt-2 space-y-1.5 border-l-2 border-slate-200 pl-2">{closing.allocations.map((allocation, index) => <div key={`${allocation.userId}:${allocation.kind}:${index}`} className="flex items-center justify-between gap-2 text-[11px] tabular-nums"><div className="min-w-0 truncate"><span className={`mr-1.5 inline-flex rounded px-1 py-0.5 text-[9px] font-medium ${kindMeta[allocation.kind].className}`}>{kindMeta[allocation.kind].label}</span><span className="font-medium text-slate-600">{allocation.name}</span></div><span className={`shrink-0 font-semibold ${allocation.amount >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatT0SettlementAmount(allocation.amount)} U</span></div>)}</div> : <div className="mt-2 text-[10px] text-rose-600">未找到可归属的用户去向，需核对历史开平仓关联。</div>}
                  {!closingReconciled && <button type="button" onClick={() => setAdjustmentPrefill({ accountId: account.accountId, closingEntryId: closing.closingEntryId })} className="mt-2 h-7 rounded-md border border-rose-200 bg-white px-2 text-[10px] font-semibold text-rose-700 active:bg-rose-50">处理差额</button>}
                </div>}
              </div>;
            })}</div></div>
          </div>}
        </div>;
      })}</div>}
    </section>

    <section className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="按用户反查账户来源">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5"><span className="text-sm font-semibold text-slate-900">用户去向</span><span className="text-[11px] text-slate-400">点用户反查账户</span></div>
      {reconciliation.destinations.length === 0 ? <div className="px-3 py-7 text-center text-xs text-slate-400">暂无用户收益去向</div> : <div className="divide-y divide-slate-100">{reconciliation.destinations.map((destination) => {
        const expanded = expandedDestinationUserId === destination.userId;
        const destinationKey = String(destination.userId);
        return <div key={destination.userId} ref={(node) => { if (node) destinationUserExportTargetsRef.current.set(destinationKey, node); else destinationUserExportTargetsRef.current.delete(destinationKey); }}><div className="px-3 py-3"><div className="flex min-w-0 items-center gap-1"><button type="button" onClick={() => onExpandedDestinationUserChange(expanded ? null : destination.userId)} className="min-w-0 truncate text-left text-sm font-semibold text-slate-800 active:text-slate-600" aria-expanded={expanded}>{destination.name}</button>{expanded && <div data-card-export-hide="true"><OrderCardImageDownload targetRef={getAccountExportRef(destinationUserExportTargetsRef.current, destinationKey)} orderNo={`${destination.name}-${reconciliation.period.weekStartBjt}`} filenamePrefix="T0用户账户去向" previewTitle={`${destination.name}账户来源图片预览`} previewHint={`仅包含${destination.name}的订单、分佣、共享汇总及全部账户来源`} color="#475569" outerPadding={8} captureFullContent fullContentHorizontalBleed={0} fullContentBottomPadding={0} exportBackground="#FFFFFF" variant="bare" /></div>}</div><button type="button" onClick={() => onExpandedDestinationUserChange(expanded ? null : destination.userId)} className="mt-1 flex w-full items-center justify-between gap-3 text-left active:opacity-75" aria-label={`${expanded ? "收起" : "展开"}${destination.name}的账户来源`}><div className="min-w-0 text-[10px] tabular-nums text-slate-400">订单 {formatT0SettlementAmount(destination.income.order)} · 分佣 {formatT0SettlementAmount(destination.income.commission)} · 共享 {formatT0SettlementAmount(destination.income.shared)}</div><div className={`shrink-0 text-right text-sm font-bold tabular-nums ${destination.income.total >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatT0SettlementAmount(destination.income.total)} <span className="text-[9px] font-medium">U</span></div></button></div>{expanded && <div className="divide-y divide-slate-100 border-t border-slate-100 bg-slate-50/60">{destination.sources.map((source) => <div key={source.accountId} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[11px] tabular-nums"><div className="min-w-0"><div className="truncate font-semibold text-slate-700">{source.accountName}</div><div className="mt-1 text-[9px] text-slate-400">{source.closingCount} 笔 · 订单 {formatT0SettlementAmount(source.income.order)} · 分佣 {formatT0SettlementAmount(source.income.commission)} · 共享 {formatT0SettlementAmount(source.income.shared)}</div></div><div className={`shrink-0 font-semibold ${source.income.total >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatT0SettlementAmount(source.income.total)} U</div></div>)}</div>}</div>;
      })}</div>}
    </section>
    {reconciliation.confirmation.latest && <section className={`mt-3 rounded-xl border px-3 py-3 ${reconciliation.confirmation.state === "confirmed" ? "border-emerald-100 bg-emerald-50/45" : "border-amber-200 bg-amber-50/55"}`} aria-label="账目已平确认凭证"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className={`flex items-center gap-1.5 text-xs font-semibold ${reconciliation.confirmation.state === "confirmed" ? "text-emerald-800" : "text-amber-800"}`}><ShieldCheck className="h-3.5 w-3.5" />{reconciliation.confirmation.state === "confirmed" ? "账目已平确认" : "上次确认已过期"}</div><div className="mt-1 text-[10px] leading-5 text-slate-600">{reconciliation.confirmation.latest.confirmedByName} · {formatT0SettlementOccurredAt(reconciliation.confirmation.latest.confirmedAt)} · 凭证 #{reconciliation.confirmation.latest.id}</div>{reconciliation.confirmation.latest.note && <div className="mt-1 text-[10px] leading-5 text-slate-600">{reconciliation.confirmation.latest.note}</div>}</div><span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-semibold ${reconciliation.confirmation.state === "confirmed" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{reconciliation.confirmation.state === "confirmed" ? "当前有效" : "需重新确认"}</span></div></section>}
    <p className="mt-3 px-1 text-[10px] leading-5 text-slate-400">{reconciliation.definition} 只读核对，不自动移动真实资金。</p>
    {adjustmentPrefill && <T0WeeklySettlementAdjustmentSheet
      reconciliation={reconciliation}
      prefill={adjustmentPrefill}
      onClose={() => setAdjustmentPrefill(null)}
      onSaved={() => setAdjustmentPrefill(null)}
    />}
    {showConfirmationSheet && <T0WeeklySettlementReconciliationConfirmationSheet
      reconciliation={reconciliation}
      onClose={() => setShowConfirmationSheet(false)}
      onConfirmed={() => setShowConfirmationSheet(false)}
    />}
  </>;
}
function getBeijingDateInputValue(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

type T0XirrCashFlow = {
  occurredOn: string;
  amount: number;
  /** 当前账面净值按北京时间截至日收盘时点计入，首日与截至日均纳入持有期。 */
  atEndOfBeijingDay?: boolean;
};

/** 平仓共享与止盈预分配共用的候选人快照；耗时的历史收益与目标年化只在打开分配面板时计算。 */
type SharedIncomeCandidate = {
  userId: string;
  name: string;
  username?: string;
  remainingQuantity: number;
  longQuantity: number;
  shortQuantity: number;
  cumulativeDepositAmount: number;
  /** 累计提现 ÷ 累计投入，保留真实比例；超过100%时显示原值，但分配权重仍设最低档。 */
  withdrawalProgressPercentage: number | null;
  hasPrincipal: boolean;
  holdingNetPnl: number;
  closedNetPnl: number;
  closedLossPnl: number;
  /** 已平正收益与既得共享收益之和，供“已获得利润”权重使用。 */
  historicalProfit: number;
  /** 此订单使用者对该候选人的手动平仓共享资格；未设置时默认开启。 */
  sharedIncomeEnabled: boolean;
  receivedSharedIncome: number;
  receivedSharedIncomeCount: number;
  contributedSharedIncome: number;
  contributedSharedIncomeOrderCount: number;
  /** 全部T+0开仓记录：现货、合约、期权、网格均包含，已成交与当前挂单均计数，多空不抵消。 */
  openingOrderCount: number;
  realizedCashFlows: T0XirrCashFlow[];
  realizedTerminalValue: number;
  heldDays: number;
  settlementAgeDays: number | null;
  annualizedReference: number | null;
  annualizedTargetTopUps: Array<{ targetRate: number; topUp: number | null }>;
};

/** 分配页进入当刻固定的重型候选统计；资格开关和本次金额在其上轻量叠加。 */
type SharedIncomeClosePreview = {
  sourceNetPnl: number;
  shareableAmount: number;
  candidates: SharedIncomeCandidate[];
};

function getT0CalendarDateUtc(value: string) {
  const matched = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) return null;
  const [, yearText, monthText, dayText] = matched;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? timestamp
    : null;
}

function formatT0TeamMemberStartDate(value: string | null | undefined) {
  const normalized = String(value || "").slice(0, 10);
  const timestamp = getT0CalendarDateUtc(normalized);
  const todayTimestamp = getT0CalendarDateUtc(getBeijingDateInputValue());
  if (timestamp === null || todayTimestamp === null) return null;
  const elapsedDays = Math.max(0, Math.floor((todayTimestamp - timestamp) / (24 * 60 * 60 * 1000)));
  const [year, month, day] = normalized.split("-");
  return `${year}年${month}月${day}日 · 距今${elapsedDays}天`;
}

/**
 * 使用与 Excel XIRR 相同的现金流折现公式，并统一以北京时间自然日作为日期口径。
 * 当前期末净值按截至日收盘时点计入，因此投入首日与截至日均纳入持有期。
 */
function calculateT0Xirr(cashFlows: T0XirrCashFlow[]) {
  const grouped = new Map<number, number>();
  cashFlows.forEach((cashFlow) => {
    const calendarTimestamp = getT0CalendarDateUtc(cashFlow.occurredOn);
    if (calendarTimestamp === null || !Number.isFinite(cashFlow.amount) || Math.abs(cashFlow.amount) < 0.000001) return;
    const timestamp = calendarTimestamp + (cashFlow.atEndOfBeijingDay ? 24 * 60 * 60 * 1000 : 0);
    grouped.set(timestamp, (grouped.get(timestamp) || 0) + cashFlow.amount);
  });
  const flows = Array.from(grouped.entries())
    .map(([timestamp, amount]) => ({ timestamp, amount }))
    .filter((cashFlow) => Math.abs(cashFlow.amount) >= 0.000001)
    .sort((left, right) => left.timestamp - right.timestamp);
  if (flows.length < 2 || !flows.some((cashFlow) => cashFlow.amount < 0) || !flows.some((cashFlow) => cashFlow.amount > 0)) return null;
  const firstTimestamp = flows[0].timestamp;
  const lastTimestamp = flows[flows.length - 1].timestamp;
  if (lastTimestamp <= firstTimestamp) return null;

  const npv = (rate: number) => {
    if (rate <= -1) return Number.POSITIVE_INFINITY;
    return flows.reduce((total, cashFlow) => {
      const years = (cashFlow.timestamp - firstTimestamp) / (365 * 24 * 60 * 60 * 1000);
      return total + cashFlow.amount / Math.pow(1 + rate, years);
    }, 0);
  };

  let lower = -0.999999999;
  let upper = 1;
  let lowerValue = npv(lower);
  let upperValue = npv(upper);
  if (!Number.isFinite(lowerValue) || Number.isNaN(upperValue)) return null;
  // 短期内出现较高收益时，真实年化 XIRR 可远超 1e15；继续扩展上界而非误判为无解。
  for (let index = 0; index < 256 && lowerValue * upperValue > 0; index += 1) {
    upper = upper * 2 + 1;
    upperValue = npv(upper);
    if (Number.isNaN(upperValue) || !Number.isFinite(upper)) return null;
  }
  if (lowerValue * upperValue > 0) return null;

  for (let index = 0; index < 128; index += 1) {
    const middle = (lower + upper) / 2;
    const middleValue = npv(middle);
    if (!Number.isFinite(middleValue)) return null;
    if (Math.abs(middleValue) < 0.0000001) return middle;
    if (lowerValue * middleValue > 0) {
      lower = middle;
      lowerValue = middleValue;
    } else {
      upper = middle;
      upperValue = middleValue;
    }
  }
  const result = (lower + upper) / 2;
  return Number.isFinite(result) ? result : null;
}

function formatT0AnnualizedReturn(rate: number | null) {
  if (rate === null || !Number.isFinite(rate)) return "--";
  const percentage = rate * 100;
  const absolute = Math.abs(percentage);
  if (absolute >= 1_000_000_000) return `${percentage >= 0 ? "+" : ""}${percentage.toExponential(2)}%`;
  const maximumFractionDigits = absolute >= 1000 ? 0 : absolute >= 100 ? 1 : 2;
  return `${percentage >= 0 ? "+" : ""}${percentage.toLocaleString("zh-CN", { maximumFractionDigits })}%`;
}

/**
 * 反算为达到指定已实现年化收益所需的本次共享收益。
 * 仅使用投入、提现、平仓盈利及既得共享收益现金流；不包含持仓浮盈亏。
 */
function calculateT0XirrTargetTopUp(cashFlows: T0XirrCashFlow[], currentTerminalValue: number, targetRate: number, asOfDate = getBeijingDateInputValue()) {
  if (!Number.isFinite(currentTerminalValue) || !Number.isFinite(targetRate) || targetRate <= -1) return null;
  const terminalDate = getT0CalendarDateUtc(asOfDate);
  if (terminalDate === null) return null;
  const terminalTimestamp = terminalDate + 24 * 60 * 60 * 1000;
  let hasInvestmentCashFlow = false;
  let requiredTerminalValue = 0;
  for (const cashFlow of cashFlows) {
    const calendarTimestamp = getT0CalendarDateUtc(cashFlow.occurredOn);
    if (calendarTimestamp === null || !Number.isFinite(cashFlow.amount)) continue;
    const timestamp = calendarTimestamp + (cashFlow.atEndOfBeijingDay ? 24 * 60 * 60 * 1000 : 0);
    if (timestamp > terminalTimestamp) continue;
    if (cashFlow.amount < 0) hasInvestmentCashFlow = true;
    const yearsToTerminal = (terminalTimestamp - timestamp) / (365 * 24 * 60 * 60 * 1000);
    requiredTerminalValue -= cashFlow.amount * Math.pow(1 + targetRate, yearsToTerminal);
  }
  if (!hasInvestmentCashFlow || !Number.isFinite(requiredTerminalValue)) return null;
  const topUp = requiredTerminalValue - currentTerminalValue;
  return Number.isFinite(topUp) ? Math.max(0, topUp) : null;
}
/** 已锁定是已成交仓位的附加状态，不与“已成交”互斥。 */
type T0ExecutionFilter = "all" | "filled" | "pending";

function hasSameT0StringArrayValues(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

const T0_INSTRUMENT_TYPES: Array<{ value: T0InstrumentType; label: string; shortLabel: string }> = [
  { value: "spot", label: "现货", shortLabel: "现" },
  { value: "contract", label: "合约", shortLabel: "合" },
  { value: "option", label: "期权", shortLabel: "期" },
  { value: "grid", label: "网格", shortLabel: "网" },
];
const T0_GRID_DIRECTIONS: Array<{ value: T0GridDirection; label: string }> = [
  { value: "long", label: "做多网格" },
  { value: "short", label: "做空网格" },
];
const T0_INSTRUMENT_FILTER_OPTIONS: T0MultiSelectOption[] = T0_INSTRUMENT_TYPES.map((item) => ({
  id: item.value,
  label: item.label,
}));
const T0_EXECUTION_FILTER_OPTIONS: T0MultiSelectOption[] = [
  { id: "filled", label: "已成交" },
  { id: "pending", label: "已挂单" },
];

/** 空数组代表全部；勾满全部类型同样回归“全部类型”，避免出现重复的全选状态。 */
function normalizeT0InstrumentTypeFilterIds(ids: string[]): T0InstrumentType[] {
  const selected = T0_INSTRUMENT_TYPES
    .map((item) => item.value)
    .filter((type) => ids.includes(type));
  return selected.length === T0_INSTRUMENT_TYPES.length ? [] : selected;
}

function matchesT0ExecutionFilter(trade: Pick<PreviewTrade, "isPending" | "isLocked">, filter: T0ExecutionFilter) {
  if (filter === "all") return true;
  if (filter === "pending") return Boolean(trade.isPending);
  return !trade.isPending;
}

function getT0ExecutionFilterSummary(filter: T0ExecutionFilter, hideLocked = false) {
  const summary = filter === "filled"
    ? "已成交"
    : filter === "pending"
      ? "已挂单"
      : "状态全部";
  return hideLocked ? `${summary}·隐藏已锁定` : summary;
}

type T0PersistedTopFilters = {
  accountIds: string[];
  relatedUserIds: string[];
  /** 成员端用于区分“首次默认本人”与用户明确点选的“全部”（空数组）。 */
  memberRelatedUserFilterTouched: boolean;
  /** 成员端“订单来源”多选上线后的本机筛选版本；旧记录首次打开默认回到全部已授权来源。 */
  memberSourceUserFilterV2: boolean;
  relatedFundIds: string[];
  instrumentTypeIds: T0InstrumentType[];
  executionFilter: T0ExecutionFilter;
  /** 独立于成交/挂单状态：勾选时从展示、汇总与历史中排除已锁定订单。 */
  hideLocked: boolean;
};

const T0_TOP_FILTER_STORAGE_PREFIX = "haoyouji:t0-top-filters:v1";
const T0_REFERRAL_DESCENDANTS_TOKEN_PREFIX = "referral-descendants:";

type T0ResolvedRelatedUserFilter = {
  userIds: Set<string>;
  includesUnlinked: boolean;
  waitingForReferralData: boolean;
};

function createT0ReferralDescendantsToken(rootUserId: string) {
  return `${T0_REFERRAL_DESCENDANTS_TOKEN_PREFIX}${rootUserId}`;
}

function getT0ReferralDescendantsRootUserId(value: string): string | null {
  if (!value.startsWith(T0_REFERRAL_DESCENDANTS_TOKEN_PREFIX)) return null;
  const rootUserId = value.slice(T0_REFERRAL_DESCENDANTS_TOKEN_PREFIX.length);
  return /^\d+$/.test(rootUserId) ? rootUserId : null;
}

/** 将“推荐”筛选令牌展开为真实关联用户 ID；推荐集合本身绝不代表根用户。 */
function resolveT0RelatedUserFilter(
  selectedIds: string[],
  descendantsByRootUserId: Map<string, string[]>,
  referralDataLoaded: boolean,
): T0ResolvedRelatedUserFilter {
  const userIds = new Set<string>();
  let includesUnlinked = false;
  let waitingForReferralData = false;
  for (const id of selectedIds) {
    if (id === "unlinked") {
      includesUnlinked = true;
      continue;
    }
    const rootUserId = getT0ReferralDescendantsRootUserId(id);
    if (rootUserId) {
      const descendants = descendantsByRootUserId.get(rootUserId);
      if (descendants) {
        descendants.forEach((descendantUserId) => userIds.add(descendantUserId));
      } else if (!referralDataLoaded) {
        // 本地存储恢复后，先等待服务端树数据；此时不以不完整条件误筛流水。
        waitingForReferralData = true;
      }
      continue;
    }
    userIds.add(id);
  }
  return { userIds, includesUnlinked, waitingForReferralData };
}

function isT0RelatedUserSelectionEquivalentToAll(
  selectedIds: string[],
  resolvedFilter: T0ResolvedRelatedUserFilter,
  selectableUserIds: string[],
  hasUnlinkedTrades: boolean,
) {
  if (selectedIds.length === 0 || resolvedFilter.waitingForReferralData) return false;
  return selectableUserIds.every((userId) => resolvedFilter.userIds.has(userId))
    && (!hasUnlinkedTrades || resolvedFilter.includesUnlinked);
}

function sanitizeT0FilterIds(value: unknown): string[] {
  return Array.isArray(value)
    ? Array.from(new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0)))
    : [];
}

function getT0TopFilterStorageKey(ledgerId: number, viewerMode: "admin" | "member", viewerId: string) {
  return `${T0_TOP_FILTER_STORAGE_PREFIX}:${ledgerId}:${viewerMode}:${viewerId}`;
}

function readPersistedT0TopFilters(storageKey: string | null): T0PersistedTopFilters | null {
  if (!storageKey || typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "null") as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== "object") return null;
    const executionFilter = parsed.executionFilter;
    return {
      accountIds: sanitizeT0FilterIds(parsed.accountIds),
      relatedUserIds: sanitizeT0FilterIds(parsed.relatedUserIds),
      memberRelatedUserFilterTouched: parsed.memberRelatedUserFilterTouched === true,
      memberSourceUserFilterV2: parsed.memberSourceUserFilterV2 === true,
      relatedFundIds: sanitizeT0FilterIds(parsed.relatedFundIds),
      instrumentTypeIds: normalizeT0InstrumentTypeFilterIds(sanitizeT0FilterIds(parsed.instrumentTypeIds)),
      // 旧版“已锁定”是互斥状态；迁移后锁定归入已成交，因此恢复为全部而非反向隐藏。
      executionFilter: executionFilter === "filled" || executionFilter === "pending" ? executionFilter : "all",
      hideLocked: parsed.hideLocked === true,
    };
  } catch {
    return null;
  }
}

function persistT0TopFilters(storageKey: string | null, filters: T0PersistedTopFilters) {
  if (!storageKey || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(filters));
  } catch {
    // 私密模式或浏览器存储不可用时，筛选仍可在当前页面正常使用。
  }
}

const T0_PREVIEW_MEMBER_RECENT_LIMIT = 12;
const T0_PREVIEW_MEMBER_SELECTION_COUNT_LIMIT = 9999;

function getT0PreviewMemberRecentStorageKey(managerUserId: number | null) {
  return Number.isInteger(managerUserId) && Number(managerUserId) > 0
    ? `t0-preview-member-recents:52:${managerUserId}`
    : null;
}

function getT0PreviewMemberSelectionCountStorageKey(managerUserId: number | null) {
  return Number.isInteger(managerUserId) && Number(managerUserId) > 0
    ? `t0-preview-member-selection-counts:52:${managerUserId}`
    : null;
}

function readT0PreviewMemberRecentIds(storageKey: string | null): number[] {
  if (!storageKey || typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
    if (!Array.isArray(parsed)) return [];
    return Array.from(new Set(parsed
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0)))
      .slice(0, T0_PREVIEW_MEMBER_RECENT_LIMIT);
  } catch {
    return [];
  }
}

function persistT0PreviewMemberRecentIds(storageKey: string | null, memberIds: number[]) {
  if (!storageKey || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(memberIds.slice(0, T0_PREVIEW_MEMBER_RECENT_LIMIT)));
  } catch {
    // 私密模式或浏览器存储不可用时，当前页面的最近排序仍可正常使用。
  }
}

function readT0PreviewMemberSelectionCounts(storageKey: string | null): Record<number, number> {
  if (!storageKey || typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: Record<number, number> = {};
    for (const [memberId, rawCount] of Object.entries(parsed)) {
      const id = Number(memberId);
      const count = Number(rawCount);
      if (Number.isInteger(id) && id > 0 && Number.isFinite(count) && count > 0) {
        result[id] = Math.min(T0_PREVIEW_MEMBER_SELECTION_COUNT_LIMIT, Math.floor(count));
      }
    }
    return result;
  } catch {
    return {};
  }
}

function persistT0PreviewMemberSelectionCounts(storageKey: string | null, selectionCounts: Record<number, number>) {
  if (!storageKey || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(selectionCounts));
  } catch {
    // 私密模式或浏览器存储不可用时，当前页面的常用排序仍可正常使用。
  }
}

function getT0InstrumentFilterSummary(selectedTypes: T0InstrumentType[]): string {
  if (selectedTypes.length === 0) return "类型全部";
  return T0_INSTRUMENT_TYPES
    .filter((item) => selectedTypes.includes(item.value))
    .map((item) => item.label)
    .join("、") || "类型";
}

function getOptionDaysToExpiry(expiryDate?: string) {
  const matched = expiryDate?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!matched) return undefined;
  const [, year, month, day] = matched;
  const expiryDay = Date.UTC(Number(year), Number(month) - 1, Number(day));
  // 订单页面统一按北京时间的自然日表达“距到期日还有几天”，避免 UTC 跨日造成提前少一天。
  const beijingNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const today = Date.UTC(beijingNow.getUTCFullYear(), beijingNow.getUTCMonth(), beijingNow.getUTCDate());
  return Math.max(0, Math.round((expiryDay - today) / (24 * 60 * 60 * 1000)));
}

function getInstrumentShortLabel(value?: T0InstrumentType, optionExpiryDate?: string) {
  const shortLabel = T0_INSTRUMENT_TYPES.find((item) => item.value === value)?.shortLabel;
  if (value !== "option" || !shortLabel) return shortLabel;
  const daysToExpiry = getOptionDaysToExpiry(optionExpiryDate);
  return daysToExpiry === undefined ? shortLabel : `${daysToExpiry}天·${shortLabel}`;
}

// 期权格只保留紫色拉丝底；边界完全交给梯形行的统一分隔线，
// 避免期权格自身边框/暗边造成与中间价格列视觉高度不一致。
const T0_OPTION_METAL_SURFACE_STYLE = {
  background: [
    "repeating-linear-gradient(168deg, rgba(255,255,255,0.055) 0px, rgba(255,255,255,0.055) 1px, transparent 1px, transparent 4px)",
    "linear-gradient(90deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.03) 38%, rgba(0,0,0,0.05) 100%)",
    "linear-gradient(90deg, #6d28d9 0%, #7c3aed 48%, #6d28d9 100%)",
  ].join(", "),
  border: "none",
  boxShadow: "none",
  boxSizing: "border-box" as const,
  color: "rgba(255,255,255,0.95)",
  textShadow: "0 1px 2.5px rgba(0,0,0,0.60), 0 -0.5px 1px rgba(255,255,255,0.22)",
};

const T0_OPTION_DIRECTIONS: Array<{ value: T0OptionDirection; label: string }> = [
  { value: "long_call", label: "买入看涨" },
  { value: "short_call", label: "卖出看涨" },
  { value: "long_put", label: "买入看跌" },
  { value: "short_put", label: "卖出看跌" },
];
function getOptionDirectionLabel(value?: T0OptionDirection) {
  return T0_OPTION_DIRECTIONS.find((item) => item.value === value)?.label;
}
/**
 * 期权的左右报价侧按到期收益的涨跌方向归类，而不是按买入/卖出归类：
 * 左侧（看涨）= 买入看涨、卖出看跌；右侧（看跌）= 买入看跌、卖出看涨。
 */
function getOptionLadderSide(direction: T0OptionDirection): PositionSide {
  return direction === "long_call" || direction === "short_put" ? "long" : "short";
}
function getOptionOpeningAction(direction: T0OptionDirection): Extract<TradeAction, "openLong" | "openShort"> {
  return getOptionLadderSide(direction) === "long" ? "openLong" : "openShort";
}
type PreviewAccount = {
  id: string;
  name: string;
  lastUsedAt?: string | null;
};

type PreviewRelatedUser = {
  id: string;
  name: string;
  username?: string;
  avatar?: string;
  lastUsedAt?: string | null;
};

type T0PreviewMember = {
  id: number;
  name: string;
  username?: string;
  avatar?: string;
  /** 服务端按T+0订单、共享受益及充提现流水汇总的最近业务活动；仅用于用户视角选择排序。 */
  lastActivityAt?: string | null;
};

/** 仅在“选择用户视角”名单打开时计算，数据口径与用户进入后的T+0只读展示一致。 */
type T0PreviewMemberCardMetrics = {
  longQuantity: number;
  shortQuantity: number;
  /** 资金流水尚在读取时保留仓位展示，但不把未加载误报为零。 */
  fundsLoaded: boolean;
  cumulativeDepositAmount: number;
  /** 累计提现 ÷ 累计投入；无累计投入时不计算百分比。 */
  cashReturnRate: number | null;
};

/** 团队总览仅获取经授权的下属成员汇总，绝不下发团队原始订单或资金流水。 */
type T0TeamOverviewMember = {
  userId: number;
  parentUserId: number;
  depth: number;
  name: string;
  username?: string;
  avatar?: string;
  /** 最早的充值发生日或非期权订单创建日；不下发来源类型。 */
  firstActivityOn: string | null;
  cumulativeDepositAmount: number;
  currentCumulativeIncome: number | null;
  cumulativeWithdrawalAmount: number;
  realizedIncomeRate: number | null;
  annualizedReturn: number | null;
  hasT0FinancialData: boolean;
};
type T0TeamOverview = {
  enabled: boolean;
  asOf?: string;
  relation?: { rootUserId: number; rootIncluded: boolean; directMemberCount: number; recursiveMemberCount: number };
  financialDefinition?: { income: string; excludes: string[]; rate: string };
  dataCompleteness?: { isComplete: boolean; reason?: string; calculationVersion: string };
  summary?: { cumulativeDepositAmount: number; currentCumulativeIncome: number | null; cumulativeWithdrawalAmount: number; realizedIncomeRate: number | null };
  members?: T0TeamOverviewMember[];
};

type PreviewRelatedFund = {
  id: string;
  relatedUserId?: string;
  name: string;
  lastUsedAt?: string | null;
};

type PreviewTrade = {
  id: string;
  accountId: string;
  accountName?: string;
  accountHidden?: boolean;
  relatedUserId?: string;
  relatedUserName?: string;
  relatedUsername?: string;
  relatedUserAvatar?: string;
  relatedUserHidden?: boolean;
  relatedFundId?: string;
  relatedFundName?: string;
  relatedFundHidden?: boolean;
  symbol: string;
  action: TradeAction;
  instrumentType?: T0InstrumentType;
  optionDirection?: T0OptionDirection;
  optionExpiryDate?: string;
  optionPremium?: number;
  optionPremiumCurrency?: T0OptionPremiumCurrency;
  gridDirection?: T0GridDirection;
  gridRangeMin?: number;
  gridRangeMax?: number;
  gridLeverage?: number;
  gridCount?: number;
  /** 账本接口下发的最近有效期权标记价，用于刷新首屏与轮询间隙的可靠兜底。 */
  optionMarkPrice?: number;
  /** 到期自动结算时每 ETH 期权获得或支付的最终价值（USDT）。 */
  optionSettlementPrice?: number;
  /** Deribit 最终 delivery 使用的 ETH 指数交割价（USDT）。 */
  optionDeliveryPrice?: number;
  optionSettledAt?: string;
  optionSettlementSource?: string;
  /** 开仓主单的展示锁定标记；成员端只读展示。 */
  isLocked?: boolean;
  /** 开仓主单：管理员展示相反多空与损益，成员始终保留原始订单视图。 */
  isCounterparty?: boolean;
  /** 管理端反向投影标识；平仓由其 FIFO 对应的开仓标记自动派生。 */
  isCounterpartyView?: boolean;
  /** 管理端反向投影保留的真实流水键与原始字段，供编辑、回撤及写库使用。 */
  sourceEntryId?: string;
  /** 仅用于前端收益展示：筛选投影前可计算净收益的流水键，不参与任何写库操作。 */
  detailEntryId?: string;
  sourceAction?: TradeAction;
  sourceOptionDirection?: T0OptionDirection;
  sourceGridDirection?: T0GridDirection;
  sourceFee?: number;
  /** 管理员报价专用：挂单在触发前不进入真实仓位、盈亏或费用计算。 */
  isPending?: boolean;
  /** 挂单实际触发成交的系统时间与统一行情价格；关联成员可只读查看。 */
  filledAt?: string;
  filledPrice?: number;
  /** 仅现货/合约开仓支持的自动止盈计划与实际触发信息。 */
  takeProfitEnabled?: boolean;
  takeProfitPrice?: number;
  takeProfitQuantity?: number;
  takeProfitTriggeredAt?: string;
  takeProfitTriggeredPrice?: number;
  takeProfitTriggeredQuantity?: number;
  /** 每次平仓后是否在管理员报价单保留非财务待补开提醒。 */
  keepReopenReminder?: boolean;
  takeProfitPlans?: T0TakeProfitPlan[];
  quantity: number;
  price: number;
  fee: number;
  createdAt: string;
  /** 服务端落库时间，仅用于系统自动动作的历史排序；交易时间仍按 createdAt 展示。 */
  recordedAt?: string;
  targetPrice?: number;
  /** 新平仓指定的真实开仓流水；缺失时仅兼容旧历史 FIFO。 */
  targetOpeningEntryId?: string;
  /** 剩余仓位转入后，原开仓在历史卡上保留的初始数量；不参与任何仓位计算。 */
  originalQuantityBeforeReassignment?: number;
  /** 从原开仓独立转入新订单的数量；仅用于历史说明。 */
  reassignedQuantity?: number;
  successorOpeningEntryId?: string;
  note?: string;
  clientRequestId?: string;
  isSyncing?: boolean;
  /** 仅成员收益投影视图使用：ETH 数量保持完整，利润与交易成本按此比例结算。 */
  profitShareRate?: number;
  /** 仅成员收益投影视图使用：用于让“本人”筛选保留其作为受益人的订单，同时仍显示原始关联用户。 */
  profitShareBeneficiaryUserId?: string;
  /** 共享收益不生成独立流水；仅在收款人的同一来源平仓单视图上标记其实际共享金额。 */
  sharedIncomeRecipientUserId?: string;
  sharedIncomeAmount?: number;
  /** 历史来源平仓已无法读取时的只读到账回退行；仅展示共享到账，绝不当作真实平仓。 */
  isSharedIncomeOnly?: boolean;
  sharedIncomeSourceClosingEntryId?: string;
  sharedIncomeSourceUserName?: string;
  /** 仅历史列表使用的视觉拆分标记；绝不参与仓位、收益汇总或任何写库载荷。 */
  historyIncomeKind?: "commission" | "shared";
};

type LadderOptionMetadata = {
  direction?: T0OptionDirection;
  expiryDate?: string;
  strikePrice?: number;
  premium?: number;
  premiumCurrency?: T0OptionPremiumCurrency;
  cachedMarkPrice?: number;
};

type LadderCellMetadata = {
  accountName?: string;
  relatedUserName: string;
  relatedFundName: string;
  instrumentShortLabel?: string;
  option?: LadderOptionMetadata;
};

type ProfitShareSnapshot = {
  entryId: string;
  openingEntryId: string;
  relatedFundId: number;
  relatedFundName?: string;
  sourceUserId: number;
  beneficiaryUserId: number;
  percentage: number;
  matchedQuantity: number;
  sourceUserName?: string;
  beneficiaryUserName?: string;
};

type ProfitShareRule = {
  id: number;
  relatedFundId: number;
  relatedFundName: string;
  sourceUserId: number;
  sourceUserName: string;
  beneficiaryUserId: number;
  beneficiaryUserName: string;
  percentage: number;
  createdAt: string;
};

type ProfitShareAllocationDraft = {
  user: PreviewRelatedUser;
  percentage: string;
};

const UNLINKED_USER_ACCOUNT_MEMORY_KEY = "__unlinked__";

function relatedUserAccountMemoryKey(relatedUserId?: string) {
  return relatedUserId || UNLINKED_USER_ACCOUNT_MEMORY_KEY;
}

type RecoverableTrade = {
  auditId: string;
  operation: "delete" | "revert";
  revertedAt: string;
  trade: PreviewTrade;
};

type PartialOpeningAttributionDraft = {
  entryId: number;
  remainingQuantity: string;
  accountId?: number;
  accountName?: string;
  relatedUserId?: number;
  relatedFundId?: number;
  relatedFundName?: string;
};

function previewTradeFromEntry(entry: any): PreviewTrade {
  return {
    id: String(entry.id),
    accountId: String(entry.accountId),
    accountName: entry.accountName ? String(entry.accountName) : undefined,
    accountHidden: Boolean(entry.accountHidden),
    relatedUserId: entry.relatedUserId === undefined || entry.relatedUserId === null ? undefined : String(entry.relatedUserId),
    relatedUserName: entry.relatedUserName ? String(entry.relatedUserName) : undefined,
    relatedUsername: entry.relatedUsername ? String(entry.relatedUsername) : undefined,
    relatedUserAvatar: entry.relatedUserAvatar ? String(entry.relatedUserAvatar) : undefined,
    relatedUserHidden: Boolean(entry.relatedUserHidden),
    relatedFundId: entry.relatedFundId === undefined || entry.relatedFundId === null ? undefined : String(entry.relatedFundId),
    relatedFundName: entry.relatedFundName ? String(entry.relatedFundName) : undefined,
    relatedFundHidden: Boolean(entry.relatedFundHidden),
    symbol: String(entry.symbol || "ETH"),
    action: entry.action as TradeAction,
    instrumentType: entry.instrumentType === "spot" || entry.instrumentType === "contract" || entry.instrumentType === "option" || entry.instrumentType === "grid"
      ? entry.instrumentType
      : undefined,
    optionDirection: entry.optionDirection === "long_call" || entry.optionDirection === "long_put" || entry.optionDirection === "short_call" || entry.optionDirection === "short_put"
      ? entry.optionDirection
      : undefined,
    optionExpiryDate: entry.optionExpiryDate ? String(entry.optionExpiryDate) : undefined,
    optionPremium: entry.optionPremium === undefined || entry.optionPremium === null ? undefined : Number(entry.optionPremium),
    optionPremiumCurrency: entry.optionPremiumCurrency === "USDT" || entry.optionPremiumCurrency === "ETH"
      ? entry.optionPremiumCurrency
      : undefined,
    gridDirection: entry.gridDirection === "long" || entry.gridDirection === "short"
      ? entry.gridDirection
      : undefined,
    gridRangeMin: entry.gridRangeMin === undefined || entry.gridRangeMin === null ? undefined : Number(entry.gridRangeMin),
    gridRangeMax: entry.gridRangeMax === undefined || entry.gridRangeMax === null ? undefined : Number(entry.gridRangeMax),
    gridLeverage: entry.gridLeverage === undefined || entry.gridLeverage === null ? undefined : Number(entry.gridLeverage),
    gridCount: entry.gridCount === undefined || entry.gridCount === null ? undefined : Number(entry.gridCount),
    optionMarkPrice: Number.isFinite(Number(entry.optionMarkPrice)) && Number(entry.optionMarkPrice) > 0
      ? Number(entry.optionMarkPrice)
      : undefined,
    optionSettlementPrice: entry.optionSettlementPrice === undefined || entry.optionSettlementPrice === null
      ? undefined
      : Number(entry.optionSettlementPrice),
    optionDeliveryPrice: entry.optionDeliveryPrice === undefined || entry.optionDeliveryPrice === null
      ? undefined
      : Number(entry.optionDeliveryPrice),
    optionSettledAt: entry.optionSettledAt ? String(entry.optionSettledAt) : undefined,
    optionSettlementSource: entry.optionSettlementSource ? String(entry.optionSettlementSource) : undefined,
    isLocked: Boolean(entry.isLocked),
    isCounterparty: Boolean(entry.isCounterparty),
    isPending: Boolean(entry.isPending),
    filledAt: entry.filledAt ? String(entry.filledAt) : undefined,
    filledPrice: entry.filledPrice === undefined || entry.filledPrice === null ? undefined : Number(entry.filledPrice),
    takeProfitEnabled: Boolean(entry.takeProfitEnabled),
    takeProfitPrice: entry.takeProfitPrice === undefined || entry.takeProfitPrice === null ? undefined : Number(entry.takeProfitPrice),
    takeProfitQuantity: entry.takeProfitQuantity === undefined || entry.takeProfitQuantity === null ? undefined : Number(entry.takeProfitQuantity),
    takeProfitTriggeredAt: entry.takeProfitTriggeredAt ? String(entry.takeProfitTriggeredAt) : undefined,
    takeProfitTriggeredPrice: entry.takeProfitTriggeredPrice === undefined || entry.takeProfitTriggeredPrice === null ? undefined : Number(entry.takeProfitTriggeredPrice),
    takeProfitTriggeredQuantity: entry.takeProfitTriggeredQuantity === undefined || entry.takeProfitTriggeredQuantity === null ? undefined : Number(entry.takeProfitTriggeredQuantity),
    keepReopenReminder: Boolean(entry.keepReopenReminder),
    takeProfitPlans: Array.isArray(entry.takeProfitPlans) ? entry.takeProfitPlans.map((plan: any) => ({
      id: String(plan.id || ''), triggerPrice: Number(plan.triggerPrice), quantity: Number(plan.quantity),
      status: plan.status === 'triggered' || plan.status === 'cancelled' ? plan.status : 'pending',
      triggeredAt: plan.triggeredAt ? String(plan.triggeredAt) : undefined,
      triggeredPrice: plan.triggeredPrice === undefined || plan.triggeredPrice === null ? undefined : Number(plan.triggeredPrice),
      triggeredQuantity: plan.triggeredQuantity === undefined || plan.triggeredQuantity === null ? undefined : Number(plan.triggeredQuantity),
      closingEntryId: plan.closingEntryId === undefined || plan.closingEntryId === null ? undefined : String(plan.closingEntryId),
    })) : undefined,
    quantity: Number(entry.quantity),
    price: Number(entry.price),
    fee: Number(entry.fee || 0),
    createdAt: String(entry.createdAt),
    recordedAt: entry.recordedAt ? String(entry.recordedAt) : undefined,
    targetPrice: entry.targetPrice === undefined || entry.targetPrice === null ? undefined : Number(entry.targetPrice),
    targetOpeningEntryId: (entry.targetOpeningEntryId ?? entry.target_opening_entry_id) === undefined || (entry.targetOpeningEntryId ?? entry.target_opening_entry_id) === null
      ? undefined
      : String(entry.targetOpeningEntryId ?? entry.target_opening_entry_id),
    originalQuantityBeforeReassignment: entry.originalQuantityBeforeReassignment === undefined || entry.originalQuantityBeforeReassignment === null
      ? undefined
      : Number(entry.originalQuantityBeforeReassignment),
    reassignedQuantity: entry.reassignedQuantity === undefined || entry.reassignedQuantity === null
      ? undefined
      : Number(entry.reassignedQuantity),
    successorOpeningEntryId: entry.successorOpeningEntryId === undefined || entry.successorOpeningEntryId === null
      ? undefined
      : String(entry.successorOpeningEntryId),
    note: entry.note || undefined,
  };
}

type PositionBucket = {
  key: string;
  side: PositionSide;
  /** 期权行权价不参与现货/合约的标记价盈亏计算。 */
  instrumentType?: T0InstrumentType;
  /** T 型报价展示和开平匹配使用的归属档位（非实际成交价）。 */
  price: number;
  originalQuantity: number;
  remainingQuantity: number;
  /** 整合报价中的未成交挂单数量：只参与展示数量，不参与仓位、盈亏、手续费或可平数量。 */
  pendingQuantity?: number;
  /** 整合报价中已锁定的剩余数量；逐笔报价继续由对应主单决定黑金外观。 */
  lockedRemainingQuantity?: number;
  /** 剩余仓位按实际成交价累计的成本，用于均价与盈亏。 */
  costBasis: number;
  /** 收益分配后参与净利润计算的等效数量，不改变展示、开平仓与 FIFO 的实际 ETH 数量。 */
  financialQuantity: number;
  /** 收益分配后参与净利润计算的成本，用于未平仓净利润与收益率。 */
  financialCostBasis: number;
  /** 尚未随已平数量分摊的开仓手续费。 */
  openingFeeBasis: number;
  /** 已平部分未扣任何手续费的毛利润。 */
  realizedGrossPnl: number;
  /** 已平部分分摊的开仓手续费。 */
  realizedOpeningFee: number;
  /** 已平部分实际发生的平仓手续费。 */
  realizedClosingFee: number;
  realizedPnl: number;
  /** 已平部分按原始开仓成本累计，用于已平仓成本统计。 */
  closedQuantity: number;
  closedCostBasis: number;
  /** 已平部分的实际平仓成交名义金额。 */
  closedNotional: number;
  openedAt: string;
};

type AdminLadderDisplayMode = "integrated" | "individual";

type LadderLivePriceMarkerPlacement = "above" | "below" | "center";

type LadderPriceRow = {
  key: string;
  price: number;
  long?: PositionBucket;
  short?: PositionBucket;
  /** 实时价仅作为价格轴标记，绝不伪装成真实订单或独立档位行。 */
  livePriceMarkerPlacement?: LadderLivePriceMarkerPlacement;
  /** 管理员“逐笔报价”模式中，左右两侧各自对应的独立未平仓主单。 */
  longOpeningTrade?: PreviewTrade;
  shortOpeningTrade?: PreviewTrade;
  /** 非财务提醒位：永不加入订单/持仓/收益数组，仅用于报价单占位。 */
  longReminder?: T0ReopenReminder;
  shortReminder?: T0ReopenReminder;
};

/** 某一开仓主单被分批平掉时，对应的平仓流水及本次分配数量。 */
type LinkedClosingAllocation = {
  trade: PreviewTrade;
  quantity: number;
};

/** 历史记录“关联”模式的一组开仓主单及其 FIFO 分配的平仓流水。 */
type LinkedJournalGroup = {
  id: string;
  opening?: PreviewTrade;
  closings: LinkedClosingAllocation[];
};

type T0TakeProfitPlan = {
  id?: string;
  triggerPrice: number;
  quantity: number;
  status: "pending" | "triggered" | "cancelled";
  triggeredAt?: string;
  triggeredPrice?: number;
  triggeredQuantity?: number;
  /** 已触发计划明确绑定本次自动生成的平仓流水，不能再依赖时间顺序推断。 */
  closingEntryId?: string;
  /** 管理员在设置本段止盈时保存的预分配金额；真正成交时由服务端按实际订单复核。 */
  sharedIncomeAllocations?: Array<{ recipientUserId: number; amount: number }>;
};

type T0TakeProfitPlanDraft = { price: string; quantity: string; sharedIncomeAllocations?: Array<{ recipientUserId: number; amount: string }> };

function normalizeTakeProfitPlanDrafts(plans: T0TakeProfitPlanDraft[]) {
  return plans.map((plan) => ({
    price: plan.price.trim(),
    quantity: normalizeEthQuantity(plan.quantity),
    sharedIncomeAllocations: (plan.sharedIncomeAllocations ?? [])
      .map((allocation) => ({ recipientUserId: Number(allocation.recipientUserId), amount: String(allocation.amount).trim() }))
      .filter((allocation) => Number.isInteger(allocation.recipientUserId) && allocation.recipientUserId > 0 && Number(allocation.amount) > 0),
  }));
}

function getTradeTakeProfitPlanDrafts(trade: PreviewTrade): T0TakeProfitPlanDraft[] {
  const pending = (trade.takeProfitPlans ?? [])
    .filter((plan) => plan.status === "pending")
    .map((plan) => ({
      price: String(plan.triggerPrice),
      quantity: normalizeEthQuantity(String(plan.quantity)),
      sharedIncomeAllocations: (plan.sharedIncomeAllocations ?? []).map((allocation) => ({
        recipientUserId: allocation.recipientUserId,
        amount: allocation.amount.toFixed(2),
      })),
    }));
  if (pending.length > 0) return pending;
  return trade.takeProfitEnabled && trade.takeProfitPrice !== undefined && trade.takeProfitQuantity !== undefined
    ? [{ price: String(trade.takeProfitPrice), quantity: normalizeEthQuantity(String(trade.takeProfitQuantity)) }]
    : [];
}

type EntryForm = {
  action: TradeAction;
  accountId: string;
  accountName: string;
  relatedUserId: string;
  relatedUserName: string;
  relatedUsername: string;
  relatedFundId: string;
  relatedFundName: string;
  instrumentType?: T0InstrumentType;
  optionDirection: T0OptionDirection;
  optionExpiryDate: string;
  optionPremium: string;
  optionPremiumCurrency: T0OptionPremiumCurrency;
  gridDirection: T0GridDirection;
  gridRangeMin: string;
  gridRangeMax: string;
  gridLeverage: string;
  gridCount: string;
  /** 开仓订单默认为未锁；锁定后仅管理员逐笔报价使用黑金标识。 */
  isLocked: boolean;
  /** 仅开仓：管理员按相反多空与盈亏展示，成员仍按原始订单展示。 */
  isCounterparty: boolean;
  /** 仅开仓：默认直接成交；设为挂单后等待统一标记价自动触发。 */
  isPending: boolean;
  /** 每次平仓后在管理员报价单保留不计仓位/收益的原价位待补开提醒。 */
  keepReopenReminder?: boolean;
  /** 从提醒占位重新新建开仓时的独立模板键。 */
  reminderTemplateId?: string;
  /** 仅现货/合约开仓：止盈可预设在挂单上，成交后才由统一标记价自动触发。 */
  isTakeProfit: boolean;
  takeProfitPrice: string;
  takeProfitQuantity: string;
  takeProfitPlans: T0TakeProfitPlanDraft[];
  quantity: string;
  price: string;
  /** 新建普通开仓时固定的实时价前两位，仅作输入辅助，绝不作为订单价格保存。 */
  priceInputPrefix?: string;
  note: string;
  targetPrice?: number;
  /** 从逐笔开仓卡进入平仓时保存真实流水 ID，跨二次确认保持不变。 */
  targetOpeningEntryId?: string;
  editingEntryId?: string;
};

type JournalDirectoryKind = "account" | "relatedUser" | "relatedFund";
type JournalDirectoryRenameKind = Exclude<JournalDirectoryKind, "relatedUser">;
type JournalDirectoryTarget = {
  kind: JournalDirectoryKind;
  id: string;
  name: string;
  username?: string;
};
type JournalDirectoryRenameTarget = {
  kind: JournalDirectoryRenameKind;
  id: string;
  name: string;
  username?: string;
};

const ACTIONS: Record<TradeAction, { label: string; side: PositionSide; opening: boolean; activeClass: string; idleClass: string }> = {
  openLong: {
    label: "开多",
    side: "long",
    opening: true,
    activeClass: "border-rose-600 bg-rose-700 text-white",
    idleClass: "border-rose-200 bg-rose-50 text-rose-700",
  },
  closeLong: {
    label: "平多",
    side: "long",
    opening: false,
    activeClass: "border-rose-600 bg-rose-700 text-white",
    idleClass: "border-rose-200 bg-white text-rose-700",
  },
  openShort: {
    label: "开空",
    side: "short",
    opening: true,
    activeClass: "border-emerald-600 bg-emerald-600 text-white",
    idleClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  closeShort: {
    label: "平空",
    side: "short",
    opening: false,
    activeClass: "border-emerald-700 bg-emerald-700 text-white",
    idleClass: "border-emerald-200 bg-white text-emerald-700",
  },
};

const RECENT_JOURNAL_ACTIONS: TradeAction[] = ["openLong", "openShort", "closeLong", "closeShort"];
const RECENT_JOURNAL_PAGE_SIZE = 10;
const TOTAL_REVENUE_DETAIL_PAGE_SIZE = 10;
const PAYOUT_INCOME_PAGE_SIZE = 20;

const numberFormatter = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// 仅作为未取得实时价时的首屏中心位。真实行情和历史订单不设人为上下限，
// 否则 ETH 跌破 2500 时会把 2433.92 这样的实时价错误塞进 2500 档位。
const LADDER_DEFAULT_CENTER_PRICE = 2750;
const LADDER_STEP = 10;
const LADDER_NEAR_VISIBLE_STEPS = 3;
const POSITION_ARCHIVE_STEP = 10;
const INTEGRATED_ARCHIVE_STEPS = [10, 25, 50, 100, 250, 500] as const;
type IntegratedArchiveStep = (typeof INTEGRATED_ARCHIVE_STEPS)[number];
// T+0 只读取服务端的 ETH 永续专用内存缓存；500ms 的页面节拍可呈现实时流，同时不直连外部交易所。
const T0_PRICE_REFRESH_INTERVAL_MS = 500;
// 账本数据由 App 的52号账本前台统一两秒调度刷新，避免该页产生第二个重叠轮询。
const T0_JOURNAL_STALE_TIME_MS = 2_000;
const DEFAULT_QUANTITY_QUICK_OPTIONS = ["10.00", "20.00", "30.00", "40.00", "50.00"];
const OKX_VIP2_TAKER_FEE_RATE = 0.00036;
const OKX_VIP2_TAKER_FEE_LABEL = "0.0360%";
const ETH_QUANTITY_PATTERN = /^(?:0|[1-9]\d{0,3})(?:\.\d{1,2})?$/;

/**
 * 未平仓利润统一按开仓名义金额预提双边手续费：已发生开仓手续费 + 按同价估算的未来平仓手续费。
 * 这是展示层的净利润预估，不计资金费；实际平仓后仍以实际成交价及实际手续费结算。
 */
function calculateEstimatedUnrealizedNetPnl(
  side: PositionSide,
  markPrice: number | null,
  quantity: number,
  openingCostBasis: number,
): number | null {
  if (markPrice === null || quantity <= 0 || openingCostBasis <= 0) return null;
  const openingAverage = openingCostBasis / quantity;
  const grossPnl = side === "long"
    ? (markPrice - openingAverage) * quantity
    : (openingAverage - markPrice) * quantity;
  const estimatedRoundTripFee = openingCostBasis * OKX_VIP2_TAKER_FEE_RATE * 2;
  return grossPnl - estimatedRoundTripFee;
}

/**
 * T+0 期权浮盈严格使用同一份期权合约标记价与开仓权利金：
 * 多头 = （期权标记价 − 权利金单价）× 未平数量；空头方向相反。此处明确不计手续费。
 * Greeks 接口已将期权标记价统一为 USDT/张；ETH 计价权利金则按 T+0 的内部 ETH 参考价换算。
 */
function calculateOptionUnrealizedPnl({
  quantity,
  optionMarkPrice,
  premium,
  premiumCurrency,
  ethMarkPrice,
  direction,
}: {
  quantity: number;
  optionMarkPrice: number | null;
  premium?: number;
  premiumCurrency?: T0OptionPremiumCurrency;
  ethMarkPrice: number | null;
  direction?: T0OptionDirection;
}) {
  // 行情尚在请求、合约临时无报价时，null 经 Number(null) 会变成 0，
  // 从而把“尚未取得价格”误算成权利金全损。此时应等待真实期权价格，不能展示盈亏。
  if (optionMarkPrice === null || optionMarkPrice === undefined) return null;
  const safeQuantity = Number(quantity);
  const safeOptionMarkPrice = Number(optionMarkPrice);
  const safePremium = Number(premium);
  if (!Number.isFinite(safeQuantity) || safeQuantity <= 0
    || !Number.isFinite(safeOptionMarkPrice) || safeOptionMarkPrice < 0
    || !Number.isFinite(safePremium) || safePremium <= 0) return null;
  const premiumUsdtPerContract = premiumCurrency === "ETH"
    ? (ethMarkPrice !== null && Number.isFinite(ethMarkPrice) && ethMarkPrice > 0 ? safePremium * ethMarkPrice : null)
    : safePremium;
  if (premiumUsdtPerContract === null || !Number.isFinite(premiumUsdtPerContract) || premiumUsdtPerContract <= 0) return null;
  const isShortOption = direction === "short_call" || direction === "short_put";
  const pnlPerContract = isShortOption
    ? premiumUsdtPerContract - safeOptionMarkPrice
    : safeOptionMarkPrice - premiumUsdtPerContract;
  return {
    pnl: pnlPerContract * safeQuantity,
    premiumTotal: premiumUsdtPerContract * safeQuantity,
  };
}

/** 实时请求偶发零值、空值或尚未返回时，始终保留账本首屏下发的最近正数报价。 */
function resolveUsableOptionMarkPrice(liveMarkPrice: unknown, cachedMarkPrice?: number): number | null {
  const live = Number(liveMarkPrice);
  if (Number.isFinite(live) && live > 0) return live;
  const cached = Number(cachedMarkPrice);
  return Number.isFinite(cached) && cached > 0 ? cached : null;
}

function formatOptionQuote(value: number, currency: T0OptionPremiumCurrency) {
  if (!Number.isFinite(value)) return "--";
  const precision = Math.abs(value) < 1 ? 6 : 2;
  const formatted = Number(value).toLocaleString("zh-CN", {
    minimumFractionDigits: precision === 6 ? 2 : 2,
    maximumFractionDigits: precision,
  });
  return `${formatted} ${currency === "ETH" ? "ETH" : "U"}`;
}

/** 自动到期结算以开仓权利金和Deribit官方交割价计算；普通开平仓继续沿用既有成交价口径。 */
function calculateOptionExpiryCloseDetail(
  opening: PreviewTrade,
  closing: PreviewTrade,
  quantity: number,
): RecentJournalTradeDetail | null {
  if (opening.instrumentType !== "option" || closing.instrumentType !== "option"
    || closing.optionSettlementPrice === undefined || closing.optionDeliveryPrice === undefined
    || opening.optionPremium === undefined || !opening.optionPremiumCurrency || !opening.optionDirection) return null;
  const matchedQuantity = Number(quantity);
  const deliveryPrice = Number(closing.optionDeliveryPrice);
  const settlementPrice = Number(closing.optionSettlementPrice);
  const premium = Number(opening.optionPremium);
  if (![matchedQuantity, deliveryPrice, settlementPrice, premium].every(Number.isFinite)
    || matchedQuantity <= 0 || deliveryPrice <= 0 || settlementPrice < 0 || premium <= 0) return null;
  const premiumUsdtPerEth = opening.optionPremiumCurrency === "ETH" ? premium * deliveryPrice : premium;
  const financialQuantity = getTradeFinancialQuantity(closing, matchedQuantity);
  const isShortOption = opening.optionDirection.startsWith("short");
  const grossPnl = (isShortOption
    ? premiumUsdtPerEth - settlementPrice
    : settlementPrice - premiumUsdtPerEth) * financialQuantity;
  const allocatedOpeningFee = opening.quantity > 0 ? opening.fee * (matchedQuantity / opening.quantity) : 0;
  // 自动到期流水的 fee 已同时固化开仓与到期结算两边的交易成本。
  const closingFee = closing.quantity > 0 ? closing.fee * (matchedQuantity / closing.quantity) : 0;
  const premiumQuote = formatOptionQuote(premium, opening.optionPremiumCurrency);
  const settlementQuote = formatOptionQuote(settlementPrice, "USDT");
  return isShortOption
    ? {
      buyPrice: settlementPrice,
      sellPrice: premiumUsdtPerEth,
      buyQuote: settlementQuote,
      sellQuote: premiumQuote,
      grossPnl,
      netPnl: grossPnl - allocatedOpeningFee - closingFee,
      allocatedOpeningFee,
      closingFee,
      isOptionQuote: true,
      isOptionExpirySettlement: true,
    }
    : {
      buyPrice: premiumUsdtPerEth,
      sellPrice: settlementPrice,
      buyQuote: premiumQuote,
      sellQuote: settlementQuote,
      grossPnl,
      netPnl: grossPnl - allocatedOpeningFee - closingFee,
      allocatedOpeningFee,
      closingFee,
      isOptionQuote: true,
      isOptionExpirySettlement: true,
    };
}

/**
 * 会员收益分配仅影响利润与交易成本，不得缩减订单本身的 ETH 数量。
 * 非收益投影视图没有该字段，按完整订单（100%）核算。
 */
function getTradeProfitShareRate(trade: PreviewTrade) {
  const rate = Number(trade.profitShareRate);
  return Number.isFinite(rate) && rate > 0 && rate <= 1 ? rate : 1;
}

function getTradeFinancialQuantity(trade: PreviewTrade, quantity = trade.quantity) {
  const normalizedQuantity = Number(quantity);
  if (!Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) return 0;
  return normalizedQuantity * getTradeProfitShareRate(trade);
}

function priceKey(price: number) {
  return Number(price).toFixed(2);
}

/**
 * 多仓向上、空仓向下归档；默认十美元档用于真实开平匹配。
 * 整合报价可传入更宽的展示档位，但绝不改变真实成交、FIFO 或可平数量口径。
 */
function archivePriceForSide(side: PositionSide, value: number, archiveStep = POSITION_ARCHIVE_STEP) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const safeArchiveStep = Number.isFinite(archiveStep) && archiveStep > 0 ? archiveStep : POSITION_ARCHIVE_STEP;
  const scaled = value / safeArchiveStep;
  const rounded = side === "long"
    ? Math.ceil(scaled - 1e-9)
    : Math.floor(scaled + 1e-9);
  return Number((rounded * safeArchiveStep).toFixed(2));
}

function archivePriceForTrade(trade: PreviewTrade, archiveStep = POSITION_ARCHIVE_STEP) {
  const side = ACTIONS[trade.action].side;
  // 开仓永远以真实成交价归类，兼容此前被按方向写入错误百元档的旧流水。
  const sourcePrice = ACTIONS[trade.action].opening
    ? trade.price
    : (trade.targetPrice !== undefined && trade.targetPrice > 0 ? trade.targetPrice : trade.price);
  return archivePriceForSide(side, sourcePrice, archiveStep);
}

function formatPrice(value: number | null | undefined) {
  if (!value || !Number.isFinite(value)) return "--";
  return numberFormatter.format(value);
}

function formatLadderPrice(value: number) {
  return String(Math.round(value));
}

/**
 * 实时标记价保留两位小数：整数部分维持报价档主视觉，小数作为紧凑的精度提示。
 * 其他非实时档继续显示整数，避免梯形报价表产生视觉噪音。
 */
function splitLadderMarkPrice(value: number) {
  const [integerPart, fractionalPart = "00"] = value.toFixed(2).split(".");
  return { integerPart, fractionalPart };
}

type LadderLivePriceMarker = {
  anchorPrice: number;
  placement: LadderLivePriceMarkerPlacement;
};

/**
 * 实时价所在的标准相邻档。中点明确归入低档：例如 2300 / 2400 时，
 * 2300–2350 均归 2300，2351 起归 2400。此函数只服务价格簿展示，
 * 不参与真实成交、FIFO、仓位或任何资金计算。
 */
function getLadderReferenceBand(markPrice: number | null, step: number) {
  if (markPrice === null || !Number.isFinite(markPrice) || markPrice <= 0) return null;
  const safeStep = Number.isFinite(step) && step > 0 ? step : LADDER_STEP;
  const normalizedMarkPrice = Number(markPrice.toFixed(2));
  const lowerPrice = Number((Math.floor(normalizedMarkPrice / safeStep) * safeStep).toFixed(2));
  const upperPrice = Number((lowerPrice + safeStep).toFixed(2));
  const midpoint = lowerPrice + safeStep / 2;
  return {
    lowerPrice,
    upperPrice,
    // 不能使用 Math.round：它会把恰好处于中点的 2350 错归至 2400。
    anchorPrice: normalizedMarkPrice > midpoint ? upperPrice : lowerPrice,
  };
}

/**
 * 根据当前可见的上下相邻价格行，确定实时标记应贴在哪一侧。
 * 标记本身位于两行的交界处，因此视觉上始终处于两档数字的居中位置。
 */
function resolveLadderLivePriceMarker(markPrice: number | null, prices: number[]): LadderLivePriceMarker | null {
  if (markPrice === null || !Number.isFinite(markPrice) || markPrice <= 0) return null;
  const normalizedMarkPrice = Number(markPrice.toFixed(2));
  const visiblePrices = Array.from(new Set(
    prices
      .filter((price) => Number.isFinite(price) && price > 0)
      .map((price) => Number(price.toFixed(2))),
  )).sort((left, right) => right - left);
  const exactPrice = visiblePrices.find((price) => priceKey(price) === priceKey(normalizedMarkPrice));
  if (exactPrice !== undefined) return { anchorPrice: exactPrice, placement: "center" };

  // visiblePrices 为从高到低：上档取“刚好高于”的最后一个，下档取“刚好低于”的第一个。
  const upperPrice = [...visiblePrices].reverse().find((price) => price > normalizedMarkPrice);
  const lowerPrice = visiblePrices.find((price) => price < normalizedMarkPrice);
  if (upperPrice === undefined || lowerPrice === undefined) return null;

  const midpoint = lowerPrice + (upperPrice - lowerPrice) / 2;
  // 恰好在中点时归低档；高于中点才贴到上档下方。
  return normalizedMarkPrice > midpoint
    ? { anchorPrice: upperPrice, placement: "below" }
    : { anchorPrice: lowerPrice, placement: "above" };
}

/** 将实时标记挂到同价位的第一条行，避免逐笔同价多行时重复绘制。 */
function applyLadderLivePriceMarker(rows: LadderPriceRow[], marker: LadderLivePriceMarker | null) {
  if (!marker) return rows;
  let markerApplied = false;
  return rows.map((row) => {
    if (markerApplied || priceKey(row.price) !== priceKey(marker.anchorPrice)) return row;
    markerApplied = true;
    return { ...row, livePriceMarkerPlacement: marker.placement };
  });
}

/**
 * 只保留必要价格档：
 * - 实时价展示归属档上下各 3 档，便于快速开平；
 * - 每个已有未平仓的归属档，无论距离当前价多远都固定保留；
 * - 没有仓位、且不在实时价附近的空白档自动隐藏。
 */
function buildAdaptiveLadderLevels(markAnchorPrice: number | null, positionPrices: number[] = [], step = LADDER_STEP) {
  const safeStep = Number.isFinite(step) && step > 0 ? step : LADDER_STEP;
  const defaultCenter = Math.round(LADDER_DEFAULT_CENTER_PRICE / safeStep) * safeStep;
  // 实时价归属档是价格簿的坐标基准，不能再限制在旧的 2500–3000 区间。
  // 只排除非正数，既能覆盖 ETH 当前的低价区间，也保留极端行情的真实顺序。
  const center = markAnchorPrice !== null && Number.isFinite(markAnchorPrice) && markAnchorPrice > 0
    ? markAnchorPrice
    : defaultCenter;
  const levels = new Set<number>();

  for (let offset = -LADDER_NEAR_VISIBLE_STEPS; offset <= LADDER_NEAR_VISIBLE_STEPS; offset += 1) {
    const price = center + offset * safeStep;
    if (price > 0) levels.add(price);
  }
  // 远端空白价位可以折叠，但已有仓位的十元归档档位必须始终可见。
  // 不能复用实时价格的2500–3000展示边界：旧仓可能在区间外，
  // 仍须保留为一个独立档位，且不补齐两者之间的数百个空白档。
  for (const price of positionPrices) {
    if (Number.isFinite(price) && price > 0) {
      levels.add(price);
    }
  }
  return Array.from(levels).sort((a, b) => b - a);
}

function formatQuantity(value: number) {
  if (!Number.isFinite(value) || value === 0) return "0.00";
  return value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 仅展示已由服务端固化的ETH数量；金额与数量的最终计算始终由后端定点完成。 */
function formatPayoutEthQuantity(value: string | null | undefined) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "—";
  return numeric.toLocaleString("zh-CN", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function formatPayoutEthReferencePrice(value: string | null | undefined) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "—";
  return numeric.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 8 });
}

// 梯形报价表空间有限：只压缩展示精度，不影响订单原始数量、FIFO 或盈亏计算。
function formatLadderQuantity(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (Math.abs(value) < 100) {
    return value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return Math.round(value).toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

/** 整合报价的挂单/锁定摘要统一保留一位小数，区别于大数量的紧凑展示精度。 */
function formatIntegratedStatusQuantity(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0.0";
  return value.toLocaleString("zh-CN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** 止盈计划覆盖本笔全部剩余仓位时只标“止盈”；部分计划则明确标出计划止盈数量。 */
function getTakeProfitMarkerLabel(enabled: boolean | undefined, plannedQuantity: number | undefined, remainingQuantity: number) {
  if (!enabled) return null;
  const quantity = Number(plannedQuantity);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity >= remainingQuantity - 0.0000001) return "止盈";
  return `止盈${formatLadderQuantity(quantity)}`;
}

function getTradeTakeProfitPlans(trade: PreviewTrade): T0TakeProfitPlan[] {
  if (trade.takeProfitPlans && trade.takeProfitPlans.length > 0) return trade.takeProfitPlans;
  if (trade.takeProfitPrice !== undefined && trade.takeProfitQuantity !== undefined) {
    return [{
      triggerPrice: trade.takeProfitPrice,
      quantity: trade.takeProfitQuantity,
      status: trade.takeProfitEnabled ? "pending" : "triggered",
      triggeredAt: trade.takeProfitTriggeredAt,
      triggeredPrice: trade.takeProfitTriggeredPrice,
      triggeredQuantity: trade.takeProfitTriggeredQuantity,
    }];
  }
  return [];
}

function getPendingTakeProfitQuantity(trade: PreviewTrade) {
  return getTradeTakeProfitPlans(trade)
    .filter((plan) => plan.status === "pending")
    .reduce((total, plan) => total + plan.quantity, 0);
}

function formatQuantityQuickOption(value: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return numeric.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function normalizeEthQuantity(value: string) {
  const trimmed = value.trim();
  if (!ETH_QUANTITY_PATTERN.test(trimmed) || Number(trimmed) <= 0) return trimmed;
  const [integerPart, fractionalPart = ""] = trimmed.split(".");
  return `${integerPart}.${fractionalPart.padEnd(2, "0")}`;
}

function formatFee(value: number) {
  if (!Number.isFinite(value)) return "--";
  return value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatBeijingMonthDayTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${Number(values.month)}/${Number(values.day)} ${values.hour}:${values.minute}`;
}

/**
 * 提现流水的 created_at 来自账本库的北京时间墙上时间；驱动会把它附上 Z 发送到前端。
 * 此处仅对提现通知保留原始月日时分，避免再次按 UTC 转换后误显示为次日凌晨。
 */
function formatPayoutRecordedBeijingTime(value: string) {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
  if (!match) return formatBeijingMonthDayTime(value);
  const [, , month, day, hour, minute] = match;
  return `${Number(month)}/${Number(day)} ${hour}:${minute}`;
}

/** 历史列表按真正发生的成交/触发活动排序：挂单取成交时间，自动止盈兼容旧记录取实际落库时间。 */
function getTradeActivityTime(trade: Pick<PreviewTrade, "createdAt" | "filledAt" | "recordedAt" | "note">) {
  if (trade.filledAt) return trade.filledAt;
  if (trade.note?.includes("[系统自动止盈]") && trade.recordedAt) return trade.recordedAt;
  return trade.createdAt;
}

/** 已触发的挂单同时保留原始挂单时间与实际成交时间；普通成交单仅展示原始下单时间。 */
function formatT0TradeTimeline(trade: Pick<PreviewTrade, "createdAt" | "filledAt">) {
  const createdAt = formatBeijingMonthDayTime(trade.createdAt);
  return trade.filledAt
    ? `挂单 ${createdAt} · 成交 ${formatBeijingMonthDayTime(trade.filledAt)}`
    : createdAt;
}

/** 系统自动成交／结算需要保留完整上下文，避免账户、用户或专项资金被省略号截断。 */
function hasSystemGeneratedSettlementNote(note?: string | null) {
  const normalizedNote = note?.trim() ?? "";
  return normalizedNote.includes("[系统自动成交]") || normalizedNote.includes("[系统自动结算]");
}

function getHistoryContextLayoutClass(showFullContext: boolean) {
  return showFullContext
    ? "mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-4 text-slate-500"
    : "mt-1 flex min-w-0 items-center gap-x-1.5 whitespace-nowrap text-[11px] text-slate-500";
}

function getHistoryContextValueClass(showFullContext: boolean) {
  return showFullContext
    ? "max-w-full whitespace-normal break-words"
    : "min-w-0 truncate";
}

function formatBeijingLiveTime(value: Date) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}/${values.month}/${values.day} ${values.hour}:${values.minute}:${values.second}`;
}

function formatSigned(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${numberFormatter.format(Math.abs(value))}`;
}

function formatSignedPercent(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${(Math.abs(value) * 100).toFixed(2)}%`;
}

function formatAmount(value: number) {
  return Number.isFinite(value) ? numberFormatter.format(value) : "--";
}

/**
 * 最近速记中的平仓展示按实际买卖口径计算净利润：
 * 多仓为卖出价－买入均价，空仓为卖出均价－买入价；
 * 再按已平数量分摊开仓手续费，并扣除本笔平仓手续费。
 * 同一账户、关联用户、专项款与十美元归属档位分别独立核算，避免拼单资金互相串仓。
 */
type RecentJournalTradeDetail = {
  buyPrice?: number;
  sellPrice?: number;
  /** 期权保留原计价币种的开仓权利金与到期结算报价。 */
  buyQuote?: string;
  sellQuote?: string;
  isOptionQuote?: boolean;
  isOptionExpirySettlement?: boolean;
  grossPnl?: number;
  netPnl?: number;
  allocatedOpeningFee?: number;
  closingFee?: number;
};

/** 与顶部总利润采用同一档位匹配口径的单笔已实现毛收益。 */
type RealizedGrossProfitDetail = {
  trade: PreviewTrade;
  quantity: number;
  grossPnl: number;
};

/**
 * 速记历史的开平成本匹配：默认严格按报价归属档位；旧流水若因 targetPrice 与原开仓档位不一致
 * 无法匹配时，退回至同账户、用户、项目和方向内的时间 FIFO，仅用于补全历史收益展示。
 * 仓位、可平数量和关联组单仍沿用严格档位规则，绝不因展示兜底改变现有持仓或审计归属。
 */
function buildRecentJournalTradeDetailsByScope(trades: PreviewTrade[], strictArchiveMatch: boolean) {
  const positions = new Map<string, {
    quantity: number;
    costBasis: number;
    financialQuantity: number;
    financialCostBasis: number;
    openingFeeBasis: number;
  }>();
  const details = new Map<string, RecentJournalTradeDetail>();
  const orderedTrades = [...trades]
    .filter((trade) => trade.symbol === "ETH")
    .sort((a, b) => getTradeActivityTime(a).localeCompare(getTradeActivityTime(b)) || a.id.localeCompare(b.id));

  for (const trade of orderedTrades) {
    const config = ACTIONS[trade.action];
    const side = config.side;
    const key = [
      side,
      ...(strictArchiveMatch ? [priceKey(archivePriceForTrade(trade))] : []),
      trade.accountId,
      trade.relatedUserId ?? "legacy-user",
      trade.relatedFundId ?? "legacy-fund",
    ].join(":");

    if (config.opening) {
      const current = positions.get(key) ?? {
        quantity: 0,
        costBasis: 0,
        financialQuantity: 0,
        financialCostBasis: 0,
        openingFeeBasis: 0,
      };
      const financialQuantity = getTradeFinancialQuantity(trade);
      current.quantity += trade.quantity;
      current.costBasis += trade.quantity * trade.price;
      current.financialQuantity += financialQuantity;
      current.financialCostBasis += financialQuantity * trade.price;
      current.openingFeeBasis += trade.fee;
      positions.set(key, current);
      const optionQuote = trade.instrumentType === "option" && trade.optionPremium !== undefined && trade.optionPremiumCurrency
        ? formatOptionQuote(trade.optionPremium, trade.optionPremiumCurrency)
        : undefined;
      details.set(trade.id, side === "long"
        ? { buyPrice: trade.price, buyQuote: optionQuote, isOptionQuote: Boolean(optionQuote) }
        : { sellPrice: trade.price, sellQuote: optionQuote, isOptionQuote: Boolean(optionQuote) });
      continue;
    }

    const current = positions.get(key);
    const matchedQuantity = current ? Math.min(current.quantity, trade.quantity) : 0;
    const openingAverage = current && current.quantity > 0 ? current.costBasis / current.quantity : undefined;
    const matchedFinancialQuantity = current ? getTradeFinancialQuantity(trade, matchedQuantity) : 0;
    const openingFinancialAverage = current && current.financialQuantity > 0
      ? current.financialCostBasis / current.financialQuantity
      : undefined;
    const allocatedOpeningFee = current && current.financialQuantity > 0 && matchedFinancialQuantity > 0
      ? current.openingFeeBasis * (matchedFinancialQuantity / current.financialQuantity)
      : 0;
    const closingFee = trade.quantity > 0 ? trade.fee * (matchedQuantity / trade.quantity) : 0;
    if (current && openingAverage !== undefined && openingFinancialAverage !== undefined && matchedQuantity > 0) {
      current.quantity -= matchedQuantity;
      current.costBasis = Math.max(0, current.costBasis - openingAverage * matchedQuantity);
      current.financialQuantity = Math.max(0, current.financialQuantity - matchedFinancialQuantity);
      current.financialCostBasis = Math.max(0, current.financialCostBasis - openingFinancialAverage * matchedFinancialQuantity);
      current.openingFeeBasis = Math.max(0, current.openingFeeBasis - allocatedOpeningFee);
      positions.set(key, current);
    }

    if (side === "long") {
      const grossPnl = openingFinancialAverage === undefined || matchedFinancialQuantity <= 0
        ? undefined
        : (trade.price - openingFinancialAverage) * matchedFinancialQuantity;
      details.set(trade.id, {
        buyPrice: openingAverage,
        sellPrice: trade.price,
        grossPnl,
        netPnl: grossPnl === undefined ? undefined : grossPnl - allocatedOpeningFee - closingFee,
        allocatedOpeningFee,
        closingFee,
      });
    } else {
      const grossPnl = openingFinancialAverage === undefined || matchedFinancialQuantity <= 0
        ? undefined
        : (openingFinancialAverage - trade.price) * matchedFinancialQuantity;
      details.set(trade.id, {
        buyPrice: trade.price,
        sellPrice: openingAverage,
        grossPnl,
        netPnl: grossPnl === undefined ? undefined : grossPnl - allocatedOpeningFee - closingFee,
        allocatedOpeningFee,
        closingFee,
      });
    }
  }

  // 自动到期平仓保存的是行权价与最终期权结算价，不能套用普通现货/合约的 price 差额公式。
  // 以 FIFO 已分配的原开仓单覆盖该类明细，保证历史单条、关联视图与净利润一致。
  const allocations = buildOpeningClosingAllocations(trades);
  for (const opening of trades) {
    if (!ACTIONS[opening.action].opening || opening.instrumentType !== "option") continue;
    for (const allocation of allocations.get(opening.id) ?? []) {
      const optionExpiryDetail = calculateOptionExpiryCloseDetail(opening, allocation.trade, allocation.quantity);
      if (optionExpiryDetail) details.set(allocation.trade.id, optionExpiryDetail);
    }
  }
  return details;
}

function buildRecentJournalTradeDetails(trades: PreviewTrade[]) {
  const strictDetails = buildRecentJournalTradeDetailsByScope(trades, true);
  const fallbackDetails = buildRecentJournalTradeDetailsByScope(trades, false);
  fallbackDetails.forEach((fallbackDetail, entryId) => {
    const strictDetail = strictDetails.get(entryId);
    if (strictDetail?.netPnl === undefined && fallbackDetail.netPnl !== undefined) {
      strictDetails.set(entryId, fallbackDetail);
    }
  });
  // 自动止盈已持久化“计划 → 平仓流水”的精确外键。普通历史列表也必须优先使用它：
  // 旧自动流水的 trade_time 可能因时区写入早于原开仓，不能再仅靠时间 FIFO 推断卖出价和收益。
  applyTriggeredTakeProfitHistoryDetails(trades, strictDetails);
  return strictDetails;
}

/** 按单张开仓主单的实际分配数量计算关联平仓的净利润，避免跨主单平仓时重复展示总利润。 */
function buildLinkedClosingDetail(opening: PreviewTrade, allocation: LinkedClosingAllocation): RecentJournalTradeDetail {
  const { trade: closing, quantity } = allocation;
  const optionExpiryDetail = calculateOptionExpiryCloseDetail(opening, closing, quantity);
  if (optionExpiryDetail) return optionExpiryDetail;
  const side = ACTIONS[opening.action].side;
  const allocatedOpeningFee = opening.quantity > 0 ? opening.fee * (quantity / opening.quantity) : 0;
  const closingFee = closing.quantity > 0 ? closing.fee * (quantity / closing.quantity) : 0;
  const financialQuantity = getTradeFinancialQuantity(closing, quantity);
  const grossPnl = side === "long"
    ? (closing.price - opening.price) * financialQuantity
    : (opening.price - closing.price) * financialQuantity;
  return side === "long"
    ? {
      buyPrice: opening.price,
      sellPrice: closing.price,
      grossPnl,
      netPnl: grossPnl - allocatedOpeningFee - closingFee,
      allocatedOpeningFee,
      closingFee,
    }
    : {
      buyPrice: closing.price,
      sellPrice: opening.price,
      grossPnl,
      netPnl: grossPnl - allocatedOpeningFee - closingFee,
      allocatedOpeningFee,
      closingFee,
    };
}

/** 用已触发止盈计划的不可变平仓外键覆盖普通历史明细，保证其卖出价和收益来自正确的开仓主单。 */
function applyTriggeredTakeProfitHistoryDetails(trades: PreviewTrade[], details: Map<string, RecentJournalTradeDetail>) {
  const closingsByStoredEntryId = new Map<string, PreviewTrade[]>();
  for (const trade of trades) {
    if (ACTIONS[trade.action].opening) continue;
    const closingEntryId = getStoredEntryId(trade);
    const rows = closingsByStoredEntryId.get(closingEntryId) ?? [];
    rows.push(trade);
    closingsByStoredEntryId.set(closingEntryId, rows);
  }

  const assignedClosingEntryIds = new Set<string>();
  for (const opening of trades) {
    if (!ACTIONS[opening.action].opening) continue;
    let remainingOpeningQuantity = opening.quantity;
    for (const plan of opening.takeProfitPlans ?? []) {
      if (plan.status !== "triggered" || !plan.closingEntryId || remainingOpeningQuantity <= 0.0000001) continue;
      const closingEntryId = String(plan.closingEntryId);
      if (assignedClosingEntryIds.has(closingEntryId)) continue;
      const closingRows = closingsByStoredEntryId.get(closingEntryId) ?? [];
      let remainingPlanQuantity = Number(plan.triggeredQuantity ?? plan.quantity);
      if (!Number.isFinite(remainingPlanQuantity) || remainingPlanQuantity <= 0.0000001) continue;
      let applied = false;
      for (const closing of closingRows) {
        if (ACTIONS[closing.action].side !== ACTIONS[opening.action].side || remainingPlanQuantity <= 0.0000001) continue;
        const quantity = Math.min(closing.quantity, remainingPlanQuantity, remainingOpeningQuantity);
        if (quantity <= 0.0000001) continue;
        details.set(closing.id, buildLinkedClosingDetail(opening, { trade: closing, quantity }));
        remainingPlanQuantity -= quantity;
        remainingOpeningQuantity -= quantity;
        applied = true;
      }
      if (applied) assignedClosingEntryIds.add(closingEntryId);
    }
  }
}

type ProfitShareDistributionItem = {
  beneficiaryUserId: number;
  beneficiaryUserName: string;
  percentageLabel: string;
  netPnl: number;
};

/** 新规则下仅正向订单先分配共享收益，普通分佣读取本单剩余净收益；历史共享记录不会进入此映射。 */
function getRegularDistributableNetPnl(
  sourceNetPnl: number,
  closingEntryId: string,
  sharedIncomeReductions?: ReadonlyMap<string, SharedIncomeReduction>,
) {
  if (!Number.isFinite(sourceNetPnl) || sourceNetPnl <= 0) return sourceNetPnl;
  const reduction = sharedIncomeReductions?.get(closingEntryId);
  const sharedAmount = Number(reduction?.amount || 0);
  if (!Number.isFinite(sharedAmount) || sharedAmount <= 0) return sourceNetPnl;
  return Math.max(0, sourceNetPnl - Math.min(sourceNetPnl, sharedAmount));
}

/** 成员投影视图已先按原快照拆分净收益；此处再按本单剩余比例等比缩放，避免与共享收益重复入账。 */
function getRegularDistributionScale(
  closingEntryId: string,
  sharedIncomeReductions?: ReadonlyMap<string, SharedIncomeReduction>,
) {
  const reduction = sharedIncomeReductions?.get(closingEntryId);
  const sourceNetPnl = Number(reduction?.sourceNetPnl || 0);
  const sharedAmount = Number(reduction?.amount || 0);
  if (!Number.isFinite(sourceNetPnl) || sourceNetPnl <= 0 || !Number.isFinite(sharedAmount) || sharedAmount <= 0) return 1;
  return Math.max(0, sourceNetPnl - Math.min(sourceNetPnl, sharedAmount)) / sourceNetPnl;
}

/**
 * 管理员历史记录的逐人分配明细：严格以平仓时继承的开仓快照为准。
 * 一笔平仓若 FIFO 关联多张开仓，逐张先扣对应手续费、再按该张开仓快照拆分，最后汇总到受益人。
 * 对采用新规则的共享收益，先从本单正向净收益中扣除共享金额，再按原快照的比例结算剩余部分。
 */
function buildClosingProfitShareDistribution(input: {
  trades: PreviewTrade[];
  snapshots: ProfitShareSnapshot[];
  closing: PreviewTrade;
  displayedNetPnl: number;
  sharedIncomeReductions?: ReadonlyMap<string, SharedIncomeReduction>;
  /** 同一批交易已建立的FIFO映射；预分配候选统计可复用它，避免每笔平仓重复扫描全历史。 */
  allocationsByOpening?: ReadonlyMap<string, LinkedClosingAllocation[]>;
}): ProfitShareDistributionItem[] {
  const { trades, snapshots, closing, displayedNetPnl, sharedIncomeReductions } = input;
  const closingEntryId = getStoredEntryId(closing);
  const closingSnapshots = snapshots.filter((snapshot) => snapshot.entryId === closingEntryId);
  if (closingSnapshots.length === 0 || !Number.isFinite(displayedNetPnl)) return [];

  const snapshotsByOpeningId = new Map<string, ProfitShareSnapshot[]>();
  for (const snapshot of closingSnapshots) {
    const rows = snapshotsByOpeningId.get(snapshot.openingEntryId) ?? [];
    rows.push(snapshot);
    snapshotsByOpeningId.set(snapshot.openingEntryId, rows);
  }

  const allocationsByOpening = input.allocationsByOpening ?? buildOpeningClosingAllocations(trades);
  const totals = new Map<number, { name: string; netPnl: number; percentages: Set<number> }>();
  const handledOpeningIds = new Set<string>();
  for (const opening of trades) {
    if (!ACTIONS[opening.action].opening) continue;
    const openingEntryId = getStoredEntryId(opening);
    if (handledOpeningIds.has(openingEntryId)) continue;
    const openingSnapshots = snapshotsByOpeningId.get(openingEntryId);
    if (!openingSnapshots?.length) continue;
    handledOpeningIds.add(openingEntryId);
    const matchingClosings = (allocationsByOpening.get(opening.id) ?? [])
      .filter((allocation) => getStoredEntryId(allocation.trade) === closingEntryId);
    for (const allocation of matchingClosings) {
      const segmentNetPnl = buildLinkedClosingDetail(opening, allocation).netPnl;
      if (segmentNetPnl === undefined || !Number.isFinite(segmentNetPnl)) continue;
      for (const snapshot of openingSnapshots) {
        const current = totals.get(snapshot.beneficiaryUserId) ?? {
          name: snapshot.beneficiaryUserName || `用户#${snapshot.beneficiaryUserId}`,
          netPnl: 0,
          percentages: new Set<number>(),
        };
        current.netPnl += segmentNetPnl * (snapshot.percentage / 100);
        current.percentages.add(snapshot.percentage);
        totals.set(snapshot.beneficiaryUserId, current);
      }
    }
  }

  // 罕见的旧流水或投影视图无法回溯 FIFO 时，仍只使用已固化快照按实际匹配数量归一化拆分，绝不读取当前规则。
  if (totals.size === 0) {
    const weightedRows = closingSnapshots.map((snapshot) => ({
      snapshot,
      weight: Math.max(0, snapshot.matchedQuantity) * Math.max(0, snapshot.percentage),
    }));
    const totalWeight = weightedRows.reduce((total, item) => total + item.weight, 0);
    for (const { snapshot, weight } of weightedRows) {
      const current = totals.get(snapshot.beneficiaryUserId) ?? {
        name: snapshot.beneficiaryUserName || `用户#${snapshot.beneficiaryUserId}`,
        netPnl: 0,
        percentages: new Set<number>(),
      };
      current.netPnl += displayedNetPnl * (totalWeight > 0 ? weight / totalWeight : snapshot.percentage / 100);
      current.percentages.add(snapshot.percentage);
      totals.set(snapshot.beneficiaryUserId, current);
    }
  }

  const calculatedTotal = Array.from(totals.values()).reduce((total, item) => total + item.netPnl, 0);
  // 统一以共享后的剩余净利润为分配总额，消除浮点尾差及反向展示视图带来的展示口径差异。
  const regularDistributableNetPnl = getRegularDistributableNetPnl(displayedNetPnl, closingEntryId, sharedIncomeReductions);
  const scale = Math.abs(calculatedTotal) > 1e-9 ? regularDistributableNetPnl / calculatedTotal : 1;
  return Array.from(totals.entries())
    .map(([beneficiaryUserId, item]) => ({
      beneficiaryUserId,
      beneficiaryUserName: item.name,
      percentageLabel: Array.from(item.percentages).sort((left, right) => left - right).map((percentage) => `${formatPrice(percentage)}%`).join(" / "),
      netPnl: item.netPnl * scale,
    }))
    .sort((left, right) => right.netPnl - left.netPnl || left.beneficiaryUserName.localeCompare(right.beneficiaryUserName, "zh-CN"));
}

/**
 * 持仓详情只读取开仓当时固化的收益分配快照，不读取当前项目规则。
 * 正常情况下 entryId 与 openingEntryId 相同；旧数据缺少原始开仓快照时，才以同一开仓
 * 后续平仓继承的快照回填展示，且每位受益人只保留一条比例。
 */
function getOpeningProfitShareSnapshotAllocations(snapshots: ProfitShareSnapshot[], openingEntryId: string) {
  const inheritedSnapshots = snapshots.filter((snapshot) => snapshot.openingEntryId === openingEntryId && snapshot.percentage > 0);
  const directSnapshots = inheritedSnapshots.filter((snapshot) => snapshot.entryId === openingEntryId);
  const candidates = directSnapshots.length > 0 ? directSnapshots : inheritedSnapshots;
  const byBeneficiary = new Map<number, ProfitShareSnapshot>();
  for (const snapshot of candidates) {
    if (!byBeneficiary.has(snapshot.beneficiaryUserId)) byBeneficiary.set(snapshot.beneficiaryUserId, snapshot);
  }
  return Array.from(byBeneficiary.values())
    .map((snapshot) => ({
      beneficiaryUserId: snapshot.beneficiaryUserId,
      beneficiaryUserName: snapshot.beneficiaryUserName || `用户#${snapshot.beneficiaryUserId}`,
      percentage: snapshot.percentage,
    }))
    .sort((left, right) => right.percentage - left.percentage || left.beneficiaryUserName.localeCompare(right.beneficiaryUserName, "zh-CN"));
}

/**
 * 报价订单的牵手标记只认开仓时固化的分配快照：存在任一非订单人受益人，
 * 即说明本单不是订单人 100% 独享收益。已平仓继承的同源快照可兼容旧订单。
 */
function hasOpeningProfitSharingWithOthers(snapshots: ProfitShareSnapshot[], openingEntryId?: string) {
  if (!openingEntryId) return false;
  return snapshots.some((snapshot) => (
    snapshot.openingEntryId === openingEntryId
    && snapshot.percentage > 0.000001
    && snapshot.beneficiaryUserId !== snapshot.sourceUserId
  ));
}

function formatProfitSharePercentage(percentage: number) {
  if (!Number.isFinite(percentage)) return "0%";
  return `${Number(percentage.toFixed(4)).toString()}%`;
}

function buildPositionBuckets(trades: PreviewTrade[]) {
  const buckets = new Map<string, PositionBucket>();
  // 仓位扣减必须遵循账本实际写入顺序，而不是挂单的历史成交时间。否则一笔后来
  // 才录入、但 filledAt 更早的订单会被倒插进旧平仓之前，造成逐笔报价余额错位。
  const orderedTrades = [...trades]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

  for (const trade of orderedTrades) {
    const config = ACTIONS[trade.action];
    const side = config.side;

    if (config.opening) {
      const archivePrice = archivePriceForTrade(trade);
      const key = `${side}:${priceKey(archivePrice)}`;
      const existing = buckets.get(key);
      const financialQuantity = trade.instrumentType === "option" ? 0 : getTradeFinancialQuantity(trade);
      if (existing) {
        // 同档混有不同类型时，不能把整档误标成期权；仅纯期权档使用专属视觉与无伪浮盈口径。
        if (existing.instrumentType !== trade.instrumentType) existing.instrumentType = undefined;
        existing.originalQuantity += trade.quantity;
        existing.remainingQuantity += trade.quantity;
        existing.costBasis += trade.quantity * trade.price;
        existing.financialQuantity += financialQuantity;
        existing.financialCostBasis += financialQuantity * trade.price;
        existing.openingFeeBasis += trade.fee;
      } else {
        buckets.set(key, {
          key,
          side,
          instrumentType: trade.instrumentType,
          price: archivePrice,
          originalQuantity: trade.quantity,
          remainingQuantity: trade.quantity,
          costBasis: trade.quantity * trade.price,
          financialQuantity,
          financialCostBasis: financialQuantity * trade.price,
          openingFeeBasis: trade.fee,
          realizedGrossPnl: 0,
          realizedOpeningFee: 0,
          realizedClosingFee: 0,
          realizedPnl: 0,
          closedQuantity: 0,
          closedCostBasis: 0,
          closedNotional: 0,
          openedAt: trade.createdAt,
        });
      }
      continue;
    }

    if (!trade.targetPrice) continue;
    const archivePrice = archivePriceForSide(side, trade.targetPrice);
    const targetKey = `${side}:${priceKey(archivePrice)}`;
    const target = buckets.get(targetKey);
    if (!target || target.remainingQuantity <= 0) continue;

    const closedQuantity = Math.min(target.remainingQuantity, trade.quantity);
    const closedFinancialQuantity = getTradeFinancialQuantity(trade, closedQuantity);
    const averageCost = target.costBasis / target.remainingQuantity;
    const financialAverageCost = target.financialQuantity > 0
      ? target.financialCostBasis / target.financialQuantity
      : averageCost;
    const allocatedOpeningFee = target.financialQuantity > 0
      ? target.openingFeeBasis * (closedFinancialQuantity / target.financialQuantity)
      : 0;
    const closingFee = trade.quantity > 0 ? trade.fee * (closedQuantity / trade.quantity) : 0;
    const grossPnl = side === "long"
      ? (trade.price - financialAverageCost) * closedFinancialQuantity
      : (financialAverageCost - trade.price) * closedFinancialQuantity;
    target.remainingQuantity -= closedQuantity;
    target.costBasis = Math.max(0, target.costBasis - averageCost * closedQuantity);
    target.financialQuantity = Math.max(0, target.financialQuantity - closedFinancialQuantity);
    target.financialCostBasis = Math.max(0, target.financialCostBasis - financialAverageCost * closedFinancialQuantity);
    target.openingFeeBasis = Math.max(0, target.openingFeeBasis - allocatedOpeningFee);
    target.realizedGrossPnl += grossPnl;
    target.realizedOpeningFee += allocatedOpeningFee;
    target.realizedClosingFee += closingFee;
    target.realizedPnl += grossPnl - allocatedOpeningFee - closingFee;
    target.closedQuantity += closedQuantity;
    target.closedCostBasis += averageCost * closedQuantity;
    target.closedNotional += trade.price * closedQuantity;
  }

  return Array.from(buckets.values()).filter((bucket) => bucket.originalQuantity > 0);
}

/**
 * 按顶部“总利润”完全一致的归属档位 FIFO 口径，逐笔还原每条平仓流水的毛收益。
 * 该函数不计入任何手续费或资金费，所有明细相加应与总利润一致。
 */
function buildRealizedGrossProfitDetails(trades: PreviewTrade[]) {
  const positions = new Map<string, {
    quantity: number;
    costBasis: number;
    financialQuantity: number;
    financialCostBasis: number;
  }>();
  const details: RealizedGrossProfitDetail[] = [];
  const orderedTrades = [...trades]
    .filter((trade) => trade.symbol === "ETH")
    .sort((a, b) => getTradeActivityTime(a).localeCompare(getTradeActivityTime(b)) || a.id.localeCompare(b.id));

  for (const trade of orderedTrades) {
    const config = ACTIONS[trade.action];
    const side = config.side;
    if (config.opening) {
      const archivePrice = archivePriceForTrade(trade);
      const key = `${side}:${priceKey(archivePrice)}`;
      const current = positions.get(key);
      const financialQuantity = getTradeFinancialQuantity(trade);
      if (current) {
        current.quantity += trade.quantity;
        current.costBasis += trade.quantity * trade.price;
        current.financialQuantity += financialQuantity;
        current.financialCostBasis += financialQuantity * trade.price;
      } else {
        positions.set(key, {
          quantity: trade.quantity,
          costBasis: trade.quantity * trade.price,
          financialQuantity,
          financialCostBasis: financialQuantity * trade.price,
        });
      }
      continue;
    }

    if (!trade.targetPrice) continue;
    const archivePrice = archivePriceForSide(side, trade.targetPrice);
    const key = `${side}:${priceKey(archivePrice)}`;
    const target = positions.get(key);
    if (!target || target.quantity <= 0) continue;

    const quantity = Math.min(target.quantity, trade.quantity);
    const openingAverage = target.costBasis / target.quantity;
    const financialQuantity = getTradeFinancialQuantity(trade, quantity);
    const financialOpeningAverage = target.financialQuantity > 0
      ? target.financialCostBasis / target.financialQuantity
      : openingAverage;
    const grossPnl = side === "long"
      ? (trade.price - financialOpeningAverage) * financialQuantity
      : (financialOpeningAverage - trade.price) * financialQuantity;
    target.quantity -= quantity;
    target.costBasis = Math.max(0, target.costBasis - openingAverage * quantity);
    target.financialQuantity = Math.max(0, target.financialQuantity - financialQuantity);
    target.financialCostBasis = Math.max(0, target.financialCostBasis - financialOpeningAverage * financialQuantity);
    positions.set(key, target);
    details.push({
      trade,
      quantity,
      grossPnl,
    });
  }

  const journalDetails = buildRecentJournalTradeDetails(trades);
  return details
    .map((detail) => {
      const optionDetail = journalDetails.get(detail.trade.id);
      return optionDetail?.isOptionExpirySettlement && optionDetail.grossPnl !== undefined
        ? { ...detail, grossPnl: optionDetail.grossPnl }
        : detail;
    })
    .sort((a, b) => getTradeActivityTime(b.trade).localeCompare(getTradeActivityTime(a.trade)) || b.trade.id.localeCompare(a.trade.id));
}

/**
 * 将平仓流水按同一账户、关联用户、专项款、方向和十美元归属档位，依时间顺序分配至开仓主单。
 * 这是价格簿现有平仓可用量口径的逐笔展开：一笔平仓若跨越多张主单，会在各主单下显示实际分配量。
 */
function buildOpeningClosingAllocations(trades: PreviewTrade[]) {
  const openingQueues = new Map<string, Array<{ entryId: string; storedEntryId: string; remainingQuantity: number }>>();
  const allocations = new Map<string, LinkedClosingAllocation[]>();
  const sourceOpeningById = new Map<string, PreviewTrade>();
  const sourceClosingById = new Map<string, PreviewTrade[]>();

  for (const trade of trades) {
    if (trade.symbol !== "ETH") continue;
    if (ACTIONS[trade.action].opening) {
      sourceOpeningById.set(getStoredEntryId(trade), trade);
      continue;
    }
    const sourceId = getStoredEntryId(trade);
    const rows = sourceClosingById.get(sourceId) ?? [];
    rows.push(trade);
    sourceClosingById.set(sourceId, rows);
  }

  // 自动止盈在服务端记录了“计划 → 平仓流水”的不可变外键。先按该外键分配：即使旧记录
  // 曾以错误时区写入 trade_time，也绝不会被 FIFO 误认为发生在开仓之前。
  const directlyLinkedClosingIds = new Set<string>();
  const directlyClosedByOpeningId = new Map<string, number>();
  for (const opening of Array.from(sourceOpeningById.values())) {
    const directRows = allocations.get(opening.id) ?? [];
    let directlyClosed = 0;
    for (const plan of opening.takeProfitPlans ?? []) {
      if (plan.status !== "triggered" || !plan.closingEntryId) continue;
      const closingRows = sourceClosingById.get(String(plan.closingEntryId)) ?? [];
      for (const closing of closingRows) {
        if (directlyLinkedClosingIds.has(closing.id)) continue;
        const configuredQuantity = Number(plan.triggeredQuantity ?? plan.quantity);
        const availableQuantity = Math.max(0, opening.quantity - directlyClosed);
        const quantity = Math.min(closing.quantity, configuredQuantity, availableQuantity);
        if (quantity <= 0.0000001) continue;
        directRows.push({ trade: closing, quantity });
        directlyClosed += quantity;
        directlyLinkedClosingIds.add(closing.id);
      }
    }
    if (directRows.length > 0) {
      directRows.sort((a, b) => getTradeActivityTime(a.trade).localeCompare(getTradeActivityTime(b.trade)) || a.trade.id.localeCompare(b.trade.id));
      allocations.set(opening.id, directRows);
      directlyClosedByOpeningId.set(opening.id, directlyClosed);
    }
  }

  // 与基础仓位桶保持相同的账本顺序，避免后来录入的订单因历史成交时间更早
  // 而被倒插到旧平仓之前，导致逐笔报价和详情页显示不同余额。
  const orderedTrades = [...trades]
    .filter((trade) => trade.symbol === "ETH")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

  const scopeKeyFor = (trade: PreviewTrade) => [
    ACTIONS[trade.action].side,
    priceKey(archivePriceForTrade(trade)),
    trade.accountId,
    trade.relatedUserId ?? "legacy-user",
    trade.relatedFundId ?? "legacy-fund",
  ].join(":");

  for (const trade of orderedTrades) {
    const config = ACTIONS[trade.action];
    const scopeKey = scopeKeyFor(trade);
    if (config.opening) {
      const queue = openingQueues.get(scopeKey) ?? [];
      const directQuantity = directlyClosedByOpeningId.get(trade.id) ?? 0;
      queue.push({
        entryId: trade.id,
        storedEntryId: getStoredEntryId(trade),
        remainingQuantity: Math.max(0, trade.quantity - directQuantity),
      });
      openingQueues.set(scopeKey, queue);
      continue;
    }

    if (directlyLinkedClosingIds.has(trade.id)) continue;
    const targetOpeningEntryId = trade.targetOpeningEntryId;
    if (targetOpeningEntryId) {
      // 新平仓已经在服务端验证来源；读侧绝不在来源缺失时借用 FIFO 的其他开仓卡。
      const opening = (openingQueues.get(scopeKey) ?? [])
        .find((item) => item.storedEntryId === targetOpeningEntryId);
      if (!opening || opening.remainingQuantity <= 0.0000001) continue;
      const allocatedQuantity = Math.min(opening.remainingQuantity, trade.quantity);
      opening.remainingQuantity -= allocatedQuantity;
      const linkedRows = allocations.get(opening.entryId) ?? [];
      linkedRows.push({ trade, quantity: allocatedQuantity });
      allocations.set(opening.entryId, linkedRows);
      continue;
    }
    let remainingToAllocate = trade.quantity;
    const queue = openingQueues.get(scopeKey) ?? [];
    for (const opening of queue) {
      if (remainingToAllocate <= 0.0000001) break;
      if (opening.remainingQuantity <= 0.0000001) continue;
      const allocatedQuantity = Math.min(opening.remainingQuantity, remainingToAllocate);
      opening.remainingQuantity -= allocatedQuantity;
      remainingToAllocate -= allocatedQuantity;
      const linkedRows = allocations.get(opening.entryId) ?? [];
      linkedRows.push({ trade, quantity: allocatedQuantity });
      allocations.set(opening.entryId, linkedRows);
    }
  }

  return allocations;
}
function invertTradeAction(action: TradeAction): TradeAction {
  switch (action) {
    case "openLong": return "openShort";
    case "closeLong": return "closeShort";
    case "openShort": return "openLong";
    case "closeShort": return "closeLong";
  }
}

function invertOptionDirection(direction?: T0OptionDirection): T0OptionDirection | undefined {
  if (!direction) return undefined;
  const opposite: Record<T0OptionDirection, T0OptionDirection> = {
    long_call: "short_call",
    short_call: "long_call",
    long_put: "short_put",
    short_put: "long_put",
  };
  return opposite[direction];
}

function invertGridDirection(direction?: T0GridDirection): T0GridDirection | undefined {
  return direction === "long" ? "short" : direction === "short" ? "long" : undefined;
}

function getStoredEntryId(trade: PreviewTrade) {
  return trade.sourceEntryId ?? trade.id;
}
function getDetailEntryId(trade: PreviewTrade) {
  return trade.detailEntryId ?? trade.id;
}
function getStoredAction(trade: PreviewTrade): TradeAction {
  return trade.sourceAction ?? trade.action;
}

function getStoredOptionDirection(trade: PreviewTrade) {
  return trade.sourceOptionDirection ?? trade.optionDirection;
}

function getStoredGridDirection(trade: PreviewTrade) {
  return trade.sourceGridDirection ?? trade.gridDirection;
}

/**
 * 管理端镜像仅改变可见投影：开平方向反转，手续费同号反转后令净收益严格等于用户端净收益的相反数。
 * 数据库仍保存用户原始方向；关闭标记后重新拉取即可完整回到普通展示。
 */
function asAdminCounterpartyTrade(trade: PreviewTrade): PreviewTrade {
  const sourceAction = getStoredAction(trade);
  const sourceFee = trade.sourceFee ?? trade.fee;
  return {
    ...trade,
    action: invertTradeAction(sourceAction),
    optionDirection: invertOptionDirection(getStoredOptionDirection(trade)),
    gridDirection: invertGridDirection(getStoredGridDirection(trade)),
    fee: -sourceFee,
    sourceEntryId: getStoredEntryId(trade),
    sourceAction,
    sourceOptionDirection: getStoredOptionDirection(trade),
    sourceGridDirection: getStoredGridDirection(trade),
    sourceFee,
    isCounterpartyView: true,
  };
}

/**
 * 平仓标记并不落库：按原始 FIFO 找到其归属开仓后，在管理员侧拆分为可独立展示的片段。
 * 这样同一笔平仓跨越普通与反向开仓时，数量、手续费及盈亏仍可逐段精确对应。
 */
function projectAdminCounterpartyTrades(rawTrades: PreviewTrade[]): PreviewTrade[] {
  const allocations = buildOpeningClosingAllocations(rawTrades);
  const slicesByClosingId = new Map<string, Array<{ trade: PreviewTrade; quantity: number; isCounterparty: boolean }>>();
  for (const opening of rawTrades) {
    if (!ACTIONS[opening.action].opening) continue;
    for (const allocation of allocations.get(opening.id) ?? []) {
      const slices = slicesByClosingId.get(allocation.trade.id) ?? [];
      slices.push({ trade: allocation.trade, quantity: allocation.quantity, isCounterparty: Boolean(opening.isCounterparty) });
      slicesByClosingId.set(allocation.trade.id, slices);
    }
  }

  return rawTrades.flatMap((trade) => {
    if (ACTIONS[trade.action].opening) {
      return trade.isCounterparty ? [asAdminCounterpartyTrade(trade)] : [trade];
    }
    const slices = slicesByClosingId.get(trade.id);
    if (!slices || slices.length === 0) return [trade];
    // 只有同一笔平仓同时关联普通与反向展示开仓时，才需要拆成不同展示方向的片段。
    // 普通订单跨多张开仓的 FIFO 只是来源匹配，账本主流水仍必须保留原始完整数量，
    // 不能把一笔“平 50”在普通历史中误显示成两笔“平 25”。
    const quantitiesByPresentation = new Map<boolean, number>();
    for (const slice of slices) {
      quantitiesByPresentation.set(
        slice.isCounterparty,
        (quantitiesByPresentation.get(slice.isCounterparty) ?? 0) + slice.quantity,
      );
    }
    const allocatedQuantity = slices.reduce((total, slice) => total + slice.quantity, 0);
    const unmatchedQuantity = Math.max(0, trade.quantity - allocatedQuantity);
    if (unmatchedQuantity > 0.0000001) {
      quantitiesByPresentation.set(false, (quantitiesByPresentation.get(false) ?? 0) + unmatchedQuantity);
    }
    const presentationSlices = [false, true]
      .map((isCounterparty) => ({ isCounterparty, quantity: quantitiesByPresentation.get(isCounterparty) ?? 0 }))
      .filter((slice) => slice.quantity > 0.0000001);
    if (presentationSlices.length === 1) {
      return presentationSlices[0].isCounterparty ? [asAdminCounterpartyTrade(trade)] : [trade];
    }
    return presentationSlices.map((slice, index) => {
      const ratio = trade.quantity > 0 ? slice.quantity / trade.quantity : 0;
      const sliceTrade: PreviewTrade = {
        ...trade,
        id: `fifo-${trade.id}-${index + 1}`,
        sourceEntryId: trade.id,
        quantity: slice.quantity,
        fee: trade.fee * ratio,
      };
      return slice.isCounterparty ? asAdminCounterpartyTrade(sliceTrade) : sliceTrade;
    });
  });
}

/**
 * 已有平仓的开仓不能再改动会影响 FIFO 的字段；但单独切换管理员反向展示或锁定标记，
 * 都不会改变任何真实成交、数量或配对关系。前端据此走受限更新分支，服务端只更新对应单列作为最终保护。
 */
function getSafeDependentOpeningEdit(input: {
  form: EntryForm;
  original: PreviewTrade | null;
  normalizedQuantity: string;
  effectivePrice: string;
  /** 部分平仓时，表单展示的是剩余可操作数量，而不是原始开仓总量。 */
  editableQuantity?: number;
}): "counterparty" | "lock" | null {
  const { form, original, normalizedQuantity, effectivePrice, editableQuantity } = input;
  if (!original || !form.editingEntryId) return null;
  const sameNumber = (left: string | number, right: number | undefined) => Math.abs(Number(left) - Number(right ?? 0)) <= 0.0000001;
  const originalRelatedUserId = original.relatedUserId ?? "";
  const originalRelatedFundId = original.relatedFundId ?? "legacy";
  const originalInstrumentType = original.instrumentType ?? "contract";
  const sameOption = originalInstrumentType !== "option" || (
    form.optionDirection === getStoredOptionDirection(original)
    && form.optionExpiryDate === (original.optionExpiryDate ?? "")
    && sameNumber(form.optionPremium || "0", original.optionPremium)
    && form.optionPremiumCurrency === (original.optionPremiumCurrency ?? "USDT")
  );
  const sameGrid = originalInstrumentType !== "grid" || (
    form.gridDirection === getStoredGridDirection(original)
    && sameNumber(form.gridRangeMin || "0", original.gridRangeMin)
    && sameNumber(form.gridRangeMax || "0", original.gridRangeMax)
    && sameNumber(form.gridLeverage || "0", original.gridLeverage)
    && Number(form.gridCount || 0) === Number(original.gridCount ?? 0)
  );

  const isOtherwiseUnchanged = form.action === getStoredAction(original)
    && form.accountId === original.accountId
    && form.relatedUserId === originalRelatedUserId
    && form.relatedFundId === originalRelatedFundId
    && form.instrumentType === originalInstrumentType
    && sameNumber(normalizedQuantity, editableQuantity ?? original.quantity)
    && sameNumber(effectivePrice, original.price)
    && form.isLocked === Boolean(original.isLocked)
    && form.isPending === Boolean(original.isPending)
    && form.note.trim() === (original.note ?? "").trim()
    && sameOption
    && sameGrid;
  if (!isOtherwiseUnchanged) return null;

  const isCounterpartyChanged = Boolean(form.isCounterparty) !== Boolean(original.isCounterparty);
  const isLockChanged = Boolean(form.isLocked) !== Boolean(original.isLocked);
  if (isCounterpartyChanged && !isLockChanged) return "counterparty";
  if (isLockChanged && !isCounterpartyChanged) return "lock";
  return null;
}

/**
 * 整合报价的宽档仅聚合展示：先沿用十美元真实 FIFO 得出每张已成交主单的剩余数量，
 * 再按所选宽度归档；挂单也显示在对应档位，但绝不进入仓位、盈亏、手续费或可平数量。
 * 因此切换 25/50/100U 等宽度不会让已平仓位回补，也不会改变真实可平数量。
 */
function buildIntegratedDisplayBuckets(
  trades: PreviewTrade[],
  allocations: Map<string, LinkedClosingAllocation[]>,
  archiveStep: number,
) {
  const displayBuckets = new Map<string, PositionBucket>();

  for (const trade of trades) {
    if (!ACTIONS[trade.action].opening || trade.symbol !== "ETH") continue;
    const isPending = Boolean(trade.isPending);
    const linkedClosings = isPending ? [] : (allocations.get(trade.id) ?? []);
    const closedQuantity = linkedClosings.reduce((total, item) => total + item.quantity, 0);
    const remainingQuantity = isPending ? trade.quantity : Math.max(0, trade.quantity - closedQuantity);
    if (remainingQuantity <= 0.0000001) continue;

    const side = ACTIONS[trade.action].side;
    const displayPrice = archivePriceForTrade(trade, archiveStep);
    const key = `${side}:${priceKey(displayPrice)}`;
    const remainingFinancialQuantity = isPending ? 0 : getTradeFinancialQuantity(trade, remainingQuantity);
    const remainingOpeningFee = isPending ? 0 : (trade.quantity > 0 ? trade.fee * (remainingQuantity / trade.quantity) : 0);
    const existing = displayBuckets.get(key);

    if (existing) {
      // 整合报价只在整档全部为期权时显示紫色金属底；混合档仍按普通仓位展示，避免错误归类。
      if (existing.instrumentType !== trade.instrumentType) existing.instrumentType = undefined;
      existing.originalQuantity += remainingQuantity;
      existing.remainingQuantity += remainingQuantity;
      existing.pendingQuantity = (existing.pendingQuantity ?? 0) + (isPending ? remainingQuantity : 0);
      existing.lockedRemainingQuantity = (existing.lockedRemainingQuantity ?? 0) + (!isPending && trade.isLocked ? remainingQuantity : 0);
      existing.costBasis += isPending ? 0 : remainingQuantity * trade.price;
      existing.financialQuantity += remainingFinancialQuantity;
      existing.financialCostBasis += isPending ? 0 : remainingFinancialQuantity * trade.price;
      existing.openingFeeBasis += remainingOpeningFee;
      if (trade.createdAt < existing.openedAt) existing.openedAt = trade.createdAt;
      continue;
    }

    displayBuckets.set(key, {
      key,
      side,
      instrumentType: trade.instrumentType,
      price: displayPrice,
      originalQuantity: remainingQuantity,
      remainingQuantity,
      pendingQuantity: isPending ? remainingQuantity : 0,
      lockedRemainingQuantity: !isPending && trade.isLocked ? remainingQuantity : 0,
      costBasis: isPending ? 0 : remainingQuantity * trade.price,
      financialQuantity: remainingFinancialQuantity,
      financialCostBasis: isPending ? 0 : remainingFinancialQuantity * trade.price,
      openingFeeBasis: remainingOpeningFee,
      // 宽档只承担未平仓展示，已平仓明细仍按真实十美元档与主单 FIFO 展示。
      realizedGrossPnl: 0,
      realizedOpeningFee: 0,
      realizedClosingFee: 0,
      realizedPnl: 0,
      closedQuantity: 0,
      closedCostBasis: 0,
      closedNotional: 0,
      openedAt: trade.createdAt,
    });
  }

  return Array.from(displayBuckets.values());
}

/**
 * 类型是开仓研究维度。筛选时不能直接过滤平仓流水，否则已平数量会被错误地回补为未平仓；
 * 因此先按完整 FIFO 找到每张开仓对应的平仓，再仅投影该类型开仓所分摊的平仓数量。
 */
function filterTradesByInstrumentTypes(trades: PreviewTrade[], selectedTypes: T0InstrumentType[]) {
  if (selectedTypes.length === 0) return trades;
  const selectedTypeSet = new Set(selectedTypes);
  const matches = (trade: PreviewTrade) => Boolean(trade.instrumentType && selectedTypeSet.has(trade.instrumentType));
  const openings = trades.filter((trade) => ACTIONS[trade.action].opening && matches(trade));
  const allocations = buildOpeningClosingAllocations(trades);
  const filterKey = selectedTypes.join("-");
  const closings = openings.flatMap((opening) => (allocations.get(opening.id) ?? []).map(({ trade, quantity }) => ({
    ...trade,
    id: `instrument-${filterKey}-${trade.id}-${opening.id}`,
    sourceEntryId: getStoredEntryId(trade),
    detailEntryId: getDetailEntryId(trade),
    quantity,
    fee: trade.quantity > 0 ? trade.fee * (quantity / trade.quantity) : 0,
    instrumentType: opening.instrumentType,
  })));
  return [...openings, ...closings].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/** 开平仓保持完整 ETH 数量，收益与交易成本按同一开仓的多人快照分配；所有受益人比例严格合计100%。 */
function projectMemberProfitShareTrades(
  rawTrades: PreviewTrade[],
  snapshots: ProfitShareSnapshot[],
  viewerUserId: string,
) {
  const viewerId = Number(viewerUserId);
  if (!Number.isInteger(viewerId) || viewerId <= 0) return rawTrades;
  const beneficiarySnapshotsByEntry = new Map<string, ProfitShareSnapshot[]>();
  const entriesWithSnapshots = new Set<string>();
  for (const snapshot of snapshots) {
    entriesWithSnapshots.add(snapshot.entryId);
    if (snapshot.beneficiaryUserId === viewerId) {
      const entryRows = beneficiarySnapshotsByEntry.get(snapshot.entryId) ?? [];
      entryRows.push(snapshot);
      beneficiarySnapshotsByEntry.set(snapshot.entryId, entryRows);
    }
  }
  const projected: PreviewTrade[] = [];
  for (const trade of rawTrades) {
    // 关联用户本人始终查看完整原始订单；收益分配只影响其他受益人的投影，不能把本人的开仓隐藏。
    // 这也保证反向展示订单在成员端始终保留原方向、完整数量及原始损益口径。
    if (Number(trade.relatedUserId || 0) === viewerId) {
      projected.push(trade);
      continue;
    }
    const beneficiarySnapshots = beneficiarySnapshotsByEntry.get(trade.id) ?? [];
    if (beneficiarySnapshots.length === 0) {
      // 规则上线前的历史订单没有快照，订单本人继续按完整原单查看，保证历史可追溯。
      if (!entriesWithSnapshots.has(trade.id) && Number(trade.relatedUserId || 0) === viewerId) projected.push(trade);
      continue;
    }
    for (const snapshot of beneficiarySnapshots) {
      const rate = Number(snapshot.percentage || 0) / 100;
      if (rate <= 0.0000001) continue;
      const matchedQuantity = ACTIONS[trade.action].opening ? trade.quantity : snapshot.matchedQuantity;
      if (!Number.isFinite(matchedQuantity) || matchedQuantity <= 0) continue;
      const allocatedFee = ACTIONS[trade.action].opening
        ? trade.fee * rate
        : (trade.quantity > 0 ? trade.fee * (matchedQuantity / trade.quantity) * rate : 0);
      projected.push({
        ...trade,
        // 受益人视角使用独立行 ID；定向平仓仍指向服务端真实开仓 ID，
        // 因此必须保留稳定来源键，避免已平仓位被错误回补到梯形报价。
        sourceEntryId: getStoredEntryId(trade),
        id: `beneficiary-${trade.id}-${snapshot.openingEntryId}-${snapshot.beneficiaryUserId}`,
        quantity: matchedQuantity,
        fee: allocatedFee,
        profitShareRate: rate,
        profitShareBeneficiaryUserId: String(viewerId),
      });
    }
  }
  return projected.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/**
 * 共享收益是来源平仓单的一部分，而不是另一张交易流水。
 * 仅为收款人的历史视角补上该来源平仓单；若该用户本就因原分佣可见该单，直接把共享金额合并到同一行。
 */
function attachSharedIncomePerspectiveTrades(
  baseTrades: PreviewTrade[],
  rawTrades: PreviewTrade[],
  transfers: SharedIncomeTransfer[],
  viewerUserId: number,
) {
  if (!Number.isInteger(viewerUserId) || viewerUserId <= 0) return baseTrades;
  const sharedTransferByClosingId = new Map<string, {
    amount: number;
    createdAt: string;
    sourceUserId: number;
    sourceUserName: string;
  }>();
  for (const transfer of transfers) {
    if (transfer.recipientUserId !== viewerUserId || !Number.isFinite(transfer.amount) || transfer.amount <= 0) continue;
    const closingEntryId = String(transfer.closingEntryId || "").trim();
    if (!closingEntryId) continue;
    const existing = sharedTransferByClosingId.get(closingEntryId);
    sharedTransferByClosingId.set(closingEntryId, {
      amount: (existing?.amount || 0) + transfer.amount,
      // 同一来源若有多笔共享转账，历史行按最后一笔实际到账时间排序。
      createdAt: !existing || String(transfer.createdAt || "") > existing.createdAt ? String(transfer.createdAt || "") : existing.createdAt,
      sourceUserId: Number(transfer.sourceUserId || existing?.sourceUserId || 0),
      sourceUserName: String(transfer.sourceUserName || existing?.sourceUserName || ""),
    });
  }
  if (sharedTransferByClosingId.size === 0) return baseTrades;

  const projected = [...baseTrades];
  for (const [closingEntryId, sharedTransfer] of sharedTransferByClosingId) {
    const sharedAmount = sharedTransfer.amount;
    const projectedIndex = projected.findIndex((trade) => (
      !ACTIONS[trade.action].opening && getStoredEntryId(trade) === closingEntryId
    ));
    if (projectedIndex >= 0) {
      const existing = projected[projectedIndex];
      projected[projectedIndex] = {
        ...existing,
        sharedIncomeRecipientUserId: String(viewerUserId),
        sharedIncomeAmount: (Number(existing.sharedIncomeAmount) || 0) + sharedAmount,
      };
      continue;
    }
    const sourceClosing = rawTrades.find((trade) => (
      !ACTIONS[trade.action].opening && getStoredEntryId(trade) === closingEntryId
    ));
    if (sourceClosing) {
      projected.push({
        ...sourceClosing,
        id: `shared-income-view-${closingEntryId}-${viewerUserId}`,
        sourceEntryId: getStoredEntryId(sourceClosing),
        detailEntryId: getDetailEntryId(sourceClosing),
        sharedIncomeRecipientUserId: String(viewerUserId),
        sharedIncomeAmount: sharedAmount,
        historyIncomeKind: "shared",
      });
      continue;
    }
    // 来源平仓已回退或删除时，该共享转账仅保留在服务端审计中，绝不能作为有效收益补造一行。
    // 恢复同一来源平仓后，服务端会自然重新下发该转账并回到上方的正常分支。
    continue;
  }
  return projected.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
}

/**
 * 历史记录的关联视图：每张开仓单与其对应平仓流水组成一组。
 * 无法由现有 FIFO 口径匹配到开仓单的平仓记录也单独保留，避免审计流水被隐藏。
 */
function buildLinkedJournalGroups(trades: PreviewTrade[]): LinkedJournalGroup[] {
  const allocations = buildOpeningClosingAllocations(trades);
  const linkedClosingIds = new Set<string>();
  const openingGroups = trades
    .filter((trade) => trade.symbol === "ETH" && ACTIONS[trade.action].opening)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    .map((opening) => {
      const closings = allocations.get(opening.id) ?? [];
      closings.forEach(({ trade }) => linkedClosingIds.add(trade.id));
      return { id: `opening-${opening.id}`, opening, closings } satisfies LinkedJournalGroup;
    });
  const unmatchedClosingGroups = trades
    .filter((trade) => trade.symbol === "ETH" && !ACTIONS[trade.action].opening && !linkedClosingIds.has(trade.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    .map((trade) => ({
      id: `unmatched-${trade.id}`,
      closings: [{ trade, quantity: trade.quantity }],
    }) satisfies LinkedJournalGroup);

  return [...openingGroups, ...unmatchedClosingGroups]
    .sort((left, right) => {
      const activityTime = (group: LinkedJournalGroup) => [group.opening, ...group.closings.map((item) => item.trade)]
        .filter((trade): trade is PreviewTrade => Boolean(trade))
        .map((trade) => getTradeActivityTime(trade))
        .sort()
        .at(-1) ?? "";
      return activityTime(right).localeCompare(activityTime(left)) || right.id.localeCompare(left.id);
    });
}

function calculateSummary(
  buckets: PositionBucket[],
  markPrice: number | null,
  trades: PreviewTrade[],
  realizedDetails: ReadonlyMap<string, RecentJournalTradeDetail> = buildRecentJournalTradeDetails(trades),
) {
  // 期权自动到期时 price 仍保留行权价供 FIFO 匹配，故累计收益必须复用历史明细中的权利金/结算价公式。
  const calculateSide = (side: PositionSide) => {
    const active = buckets.filter((bucket) => bucket.side === side && bucket.remainingQuantity > 0.0000001);
    const all = buckets.filter((bucket) => bucket.side === side);
    const sideTrades = trades.filter((trade) => ACTIONS[trade.action].side === side);
    const quantity = active.reduce((total, bucket) => total + bucket.remainingQuantity, 0);
    const weightedCost = active.reduce((total, bucket) => total + bucket.costBasis, 0);
    const average = quantity > 0 ? weightedCost / quantity : 0;
    const financialQuantity = active.reduce((total, bucket) => total + bucket.financialQuantity, 0);
    const financialCostBasis = active.reduce((total, bucket) => total + bucket.financialCostBasis, 0);
    const unrealized = calculateEstimatedUnrealizedNetPnl(side, markPrice, financialQuantity, financialCostBasis);
    const realizedClosingTrades = sideTrades.filter((trade) => !ACTIONS[trade.action].opening);
    const realized = realizedClosingTrades.reduce((total, trade) => total + (realizedDetails.get(trade.id)?.netPnl ?? 0), 0);
    const realizedGross = realizedClosingTrades.reduce((total, trade) => total + (realizedDetails.get(trade.id)?.grossPnl ?? 0), 0);
    const realizedOpeningFee = realizedClosingTrades.reduce((total, trade) => total + (realizedDetails.get(trade.id)?.allocatedOpeningFee ?? 0), 0);
    const realizedClosingFee = realizedClosingTrades.reduce((total, trade) => total + (realizedDetails.get(trade.id)?.closingFee ?? 0), 0);
    const closedQuantity = all.reduce((total, bucket) => total + bucket.closedQuantity, 0);
    const closedCostBasis = all.reduce((total, bucket) => total + bucket.closedCostBasis, 0);
    const closedNotional = all.reduce((total, bucket) => total + bucket.closedNotional, 0);
    const closedAverageCost = closedQuantity > 0 ? closedCostBasis / closedQuantity : 0;
    const closedAveragePrice = closedQuantity > 0 ? closedNotional / closedQuantity : 0;
    // 累计交易额口径：当前账户、当前方向下，所有已保存开/平仓成交名义金额之和。
    const turnover = sideTrades.reduce((total, trade) => total + trade.quantity * trade.price, 0);
    // 累计佣金口径：当前账户、当前方向下，所有已保存开/平仓实际发生的手续费之和。
    const commission = sideTrades.reduce((total, trade) => total + trade.fee, 0);
    return {
      quantity,
      average,
      unrealized,
      realizedGross,
      realizedOpeningFee,
      realizedClosingFee,
      realized,
      turnover,
      commission,
      closedQuantity,
      closedAverageCost,
      closedAveragePrice,
      activeLevels: active.length,
    };
  };

  const long = calculateSide("long");
  const short = calculateSide("short");
  return {
    long,
    short,
    realized: long.realized + short.realized,
    unrealized: (long.unrealized ?? 0) + (short.unrealized ?? 0),
  };
}

type T0JournalProps = {
  /** 资金方“融资复息订单”页内直接展示个人只读仓位时使用，不再显示路由返回按钮。 */
  embedded?: boolean;
  /** 仅由52号账本管理员代入成员时传入；后端仍会强制返回目标成员的只读范围。 */
  allowAdminViewAs?: boolean;
};

export function T0JournalView({ embedded = false, allowAdminViewAs = false }: T0JournalProps) {
  const { id } = useParams<{ id: string }>();
  const ledgerId = Number(id);
  const [location, setLocation] = useLocation();
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const previewUserIdFromUrlValue = Number(searchParams.get("previewUserId"));
  const previewUserIdFromUrl = Number.isInteger(previewUserIdFromUrlValue) && previewUserIdFromUrlValue > 0
    ? previewUserIdFromUrlValue
    : null;
  const isTotalProfitPageRoute = location === `/ledger/${ledgerId}/t0-journal/total-profit`;
  /** 仅供界面验收的直达页：使用真实读取数据模拟平仓，但永不允许写入账本。 */
  const isCloseDistributionPreviewLink = searchParams.get("preview") === "close-distribution";
  /** AI分配规则的只读说明页：可独立打开、下载长图，不需要先进入某一笔平仓流程。 */
  const isSharedIncomeAllocationGuideRoute = searchParams.get("aiAllocationGuide") === "1";
  const closeSharedIncomeAllocationGuideRoute = `/ledger/${ledgerId}/t0-journal${previewUserIdFromUrl ? `?previewUserId=${previewUserIdFromUrl}` : ""}`;
  const payoutEntryDirection = searchParams.get("payout") === "deposit"
    ? "deposit"
    : searchParams.get("payout") === "withdrawal"
      ? "withdrawal"
      : null;
  const [accounts, setAccounts] = useState<PreviewAccount[]>([]);
  const [recentRelatedUsers, setRecentRelatedUsers] = useState<PreviewRelatedUser[]>([]);
  const [relatedFunds, setRelatedFunds] = useState<PreviewRelatedFund[]>([]);
  const [trades, setTrades] = useState<PreviewTrade[]>([]);
  // 管理员切换历史呈现时保留原始流水；用户呈现基于它重新走与成员端相同的投影。
  const [rawJournalTrades, setRawJournalTrades] = useState<PreviewTrade[]>([]);
  // 空数组代表“全部”；有选择时按同一维度的并集、不同维度的交集筛选。
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [relatedUserFilterIds, setRelatedUserFilterIds] = useState<string[]>([]);
  const [relatedFundFilterIds, setRelatedFundFilterIds] = useState<string[]>([]);
  const [instrumentTypeFilterIds, setInstrumentTypeFilterIds] = useState<T0InstrumentType[]>([]);
  const [executionFilter, setExecutionFilter] = useState<T0ExecutionFilter>("all");
  const [hideLocked, setHideLocked] = useState(false);
  // 成员端用户范围固定为本人；保留旧状态字段仅用于兼容此前浏览器保存的筛选状态。
  const [memberRelatedUserFilterTouched, setMemberRelatedUserFilterTouched] = useState(false);
  // 历史记录拥有独立筛选范围：不影响上方持仓汇总与T形交割表。
  const [showHistoryFilters, setShowHistoryFilters] = useState(false);
  /** 用户历史记录仅可按已授权可见的收益类别与来源筛选，不扩展订单可见范围。 */
  const [historyIncomeKindFilterIds, setHistoryIncomeKindFilterIds] = useState<string[]>([]);
  const [historyIncomeSourceFilterIds, setHistoryIncomeSourceFilterIds] = useState<string[]>([]);
  // 管理员筛到单个用户后，可在历史区仅切换展示口径，不改变其实际管理权限。
  const [historyPresentation, setHistoryPresentation] = useState<"admin" | "member">("admin");
  const [historyAccountFilterIds, setHistoryAccountFilterIds] = useState<string[]>([]);
  const [historyRelatedUserFilterIds, setHistoryRelatedUserFilterIds] = useState<string[]>([]);
  const [historyRelatedFundFilterIds, setHistoryRelatedFundFilterIds] = useState<string[]>([]);
  const [historyInstrumentTypeFilterIds, setHistoryInstrumentTypeFilterIds] = useState<T0InstrumentType[]>([]);
  const [historyExecutionFilter, setHistoryExecutionFilter] = useState<T0ExecutionFilter>("all");
  const [historyHideLocked, setHistoryHideLocked] = useState(false);
  const [journalActionFilters, setJournalActionFilters] = useState<Set<TradeAction>>(
    () => new Set(RECENT_JOURNAL_ACTIONS),
  );
  /** 仅显示已实现净收益为正的平多、平空历史记录；管理员与成员端共用同一口径。 */
  const [showOnlyProfitableHistory, setShowOnlyProfitableHistory] = useState(false);
  /** 仅显示当前用户实际获得过共享收益的来源平仓记录。 */
  const [showOnlySharedIncomeHistory, setShowOnlySharedIncomeHistory] = useState(false);
  const [showLinkedJournalGroups, setShowLinkedJournalGroups] = useState(false);
  const [recentJournalPage, setRecentJournalPage] = useState(1);
  const [lastRelatedUserId, setLastRelatedUserId] = useState("");
  const [lastAccountIdByRelatedUser, setLastAccountIdByRelatedUser] = useState<Record<string, string>>({});
  const [lastFundIdByRelatedUser, setLastFundIdByRelatedUser] = useState<Record<string, string>>({});
  const [, setRelatedUserQuickPickerOpen] = useState(false);
  const [relatedUserPickerOpen, setRelatedUserPickerOpen] = useState(false);
  const [relatedUserSearch, setRelatedUserSearch] = useState("");
  // 实时行情会持续触发页面渲染，不能依赖React低优先级延后值；固定短防抖保证停止输入后必定发起搜索。
  const [debouncedRelatedUserSearch, setDebouncedRelatedUserSearch] = useState("");
  // 管理员的“用户视角预览”只影响当前T+0页面读取范围，不改变登录会话身份。
  const [previewUserId, setPreviewUserId] = useState<number | null>(() => previewUserIdFromUrl);
  const [previewMemberPickerOpen, setPreviewMemberPickerOpen] = useState(false);
  // 管理员的“筛选用户”和“选择用户视角”复用同一张成员卡片名单；普通用户仍使用原有下拉筛选。
  const [previewMemberPickerMode, setPreviewMemberPickerMode] = useState<"preview" | "filter">("preview");
  const [adminUnifiedSelectedMemberId, setAdminUnifiedSelectedMemberId] = useState<number | null>(() => previewUserIdFromUrl);
  const [previewMemberSearch, setPreviewMemberSearch] = useState("");
  const [previewMemberRecentIds, setPreviewMemberRecentIds] = useState<number[]>([]);
  const [previewMemberSelectionCounts, setPreviewMemberSelectionCounts] = useState<Record<number, number>>({});
  const [profitShareSource, setProfitShareSource] = useState<PreviewRelatedFund | null>(null);
  const [profitShareRecipientPickerOpen, setProfitShareRecipientPickerOpen] = useState(false);
  const [profitShareRecipientSearch, setProfitShareRecipientSearch] = useState("");
  const [debouncedProfitShareRecipientSearch, setDebouncedProfitShareRecipientSearch] = useState("");
  const [profitShareAllocations, setProfitShareAllocations] = useState<ProfitShareAllocationDraft[]>([]);
  // T+0 顶部提示已静默；收益分配保存失败必须留在弹窗内，避免看起来“点了没反应”。
  const [profitShareSaveError, setProfitShareSaveError] = useState<string | null>(null);
  const [entryProfitShareEditTarget, setEntryProfitShareEditTarget] = useState<PreviewTrade | null>(null);
  const [profitShareSnapshots, setProfitShareSnapshots] = useState<ProfitShareSnapshot[]>([]);
  const [directoryManagerKind, setDirectoryManagerKind] = useState<JournalDirectoryKind | null>(null);
  const [directoryRenameTarget, setDirectoryRenameTarget] = useState<JournalDirectoryRenameTarget | null>(null);
  const [directoryDeleteTarget, setDirectoryDeleteTarget] = useState<JournalDirectoryTarget | null>(null);
  const [directoryRenameDraft, setDirectoryRenameDraft] = useState("");
  const [showEntrySheet, setShowEntrySheet] = useState(false);
  const [partialOpeningAttributionDraft, setPartialOpeningAttributionDraft] = useState<PartialOpeningAttributionDraft | null>(null);
  const [partialOpeningAttributionScope, setPartialOpeningAttributionScope] = useState<"history" | "future" | null>(null);
  const [partialOpeningAttributionError, setPartialOpeningAttributionError] = useState<string | null>(null);
  const [closeConfirmationStep, setCloseConfirmationStep] = useState<"input" | "review">("input");
  // 平仓必须以服务端事务提交为准；失败时保留二次确认页，不能让界面误以为已成交。
  const [closeSaveError, setCloseSaveError] = useState<string | null>(null);
  // 开仓同样不能乐观关闭。顶部提示已静默，所有校验与服务端失败都必须留在当前表单内。
  const [openingSaveError, setOpeningSaveError] = useState<string | null>(null);
  /** 仅在编辑普通开仓且数值明显异常时出现；关闭或确认后不会残留到下一笔订单。 */
  const [openingEditSaveSafetyReview, setOpeningEditSaveSafetyReview] = useState<OpeningEditSaveSafetyReview | null>(null);
  /** 平仓确认中的共享收益草案：仅在提交当下传入服务端，额度仍由服务端用收益快照复核。 */
  const [sharedIncomeDrafts, setSharedIncomeDrafts] = useState<Record<string, string>>({});
  const [sharedIncomeTargetSelections, setSharedIncomeTargetSelections] = useState<Record<string, number>>({});
  /** 本次平仓仅可从正向净收益中拿出的共享预算；不改变本单服务端收益上限。 */
  const [sharedIncomeAllocationBudgetMode, setSharedIncomeAllocationBudgetMode] = useState<SharedIncomeAllocationBudgetMode>("percentage");
  const [sharedIncomeAllocationBudgetValue, setSharedIncomeAllocationBudgetValue] = useState("99");
  /** AI分配可同时选择多个维度；空数组代表保留当前草案做手动调整。 */
  const [sharedIncomeAllocationMetrics, setSharedIncomeAllocationMetrics] = useState<SharedIncomeAllocationMetric[]>([]);
  /** 0%为此维度全员均分，100%为完全按累计挂单数量比例分配；默认70%保留30%均分保障。 */
  const [sharedIncomeOpeningOrderCountIntensity, setSharedIncomeOpeningOrderCountIntensity] = useState(70);
  /** 当前仅用于热预览试算；后续发布版会以版本化审计规则替代此本地草案。 */
  const [sharedIncomePrincipalRule, setSharedIncomePrincipalRule] = useState<SharedIncomePrincipalRule>(DEFAULT_SHARED_INCOME_PRINCIPAL_RULE);
  const [showSharedIncomeAllocationGuide, setShowSharedIncomeAllocationGuide] = useState(false);
  const [showSharedIncomePrincipalRuleSettings, setShowSharedIncomePrincipalRuleSettings] = useState(false);
  const [sharedIncomeAllocationPlanError, setSharedIncomeAllocationPlanError] = useState<string | null>(null);
  /** 切换资格后先本地稳定呈现，再由服务端权威读模型回填；AI方案会随开启用户即时重分配。 */
  const [sharedIncomeEligibilityOverrides, setSharedIncomeEligibilityOverrides] = useState<Record<string, boolean>>({});
  /** 止盈每一段各自保存预分配草案；成交时再由服务端按实际订单核算。 */
  const [takeProfitAllocationPlanIndex, setTakeProfitAllocationPlanIndex] = useState<number | null>(null);
  const [takeProfitSharedIncomeDrafts, setTakeProfitSharedIncomeDrafts] = useState<Record<string, string>>({});
  const [takeProfitSharedIncomeTargetSelections, setTakeProfitSharedIncomeTargetSelections] = useState<Record<string, number>>({});
  /** 分配面板仅在打开当刻固定参考行情；后续实时行情只刷新报价表，不阻塞候选人与年化计算。 */
  const [sharedIncomePreviewMarkPrice, setSharedIncomePreviewMarkPrice] = useState<number | null>(null);
  const [expandedOpenedTradeIds, setExpandedOpenedTradeIds] = useState<Set<string>>(() => new Set());
  const [showSettledOpeningHistory, setShowSettledOpeningHistory] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<PreviewTrade | null>(null);
  const [revertCandidate, setRevertCandidate] = useState<PreviewTrade | null>(null);
  const [historyActionMenuTradeId, setHistoryActionMenuTradeId] = useState<string | null>(null);
  const [netProfitDetail, setNetProfitDetail] = useState<{
    trade: PreviewTrade;
    detail: RecentJournalTradeDetail;
    presentation?: "admin" | "member";
    viewerUserId?: number;
  } | null>(null);
  const [showTotalNetProfitDetail, setShowTotalNetProfitDetail] = useState(false);
  const [totalRevenueDetailPage, setTotalRevenueDetailPage] = useState(1);
  // 总收益报告独立保存所查看的明细，避免关闭个人收益账本后误切换其列表。
  const [totalProfitDetailTab, setTotalProfitDetailTab] = useState<"income" | "order" | "commission" | "shared" | "withdrawal" | "deposit" | "team">("order");
  // 顶层结算页与下方的已平仓/充值/提现等明细Tab完全独立，避免切换时改动原报告筛选。
  const [totalProfitPageTab, setTotalProfitPageTab] = useState<"income" | "settlement">("income");
  const [isTotalProfitCompositionAnimated, setIsTotalProfitCompositionAnimated] = useState(false);
  // 受控团队负责人的结算页可在个人卡与下属团队本周汇总卡之间左右滑动；默认始终回到个人结算。
  const [memberSettlementCardPage, setMemberSettlementCardPage] = useState<"self" | "team">("self");
  // 个人顶部结算卡与七日明细共用的周期；null 表示始终跟随最新实时周。
  const [memberSettlementSelectedWeekStart, setMemberSettlementSelectedWeekStart] = useState<string | null>(null);
  // 团队Tab独立保存查看周；null 表示本周实时汇总，历史周由服务端按当前事实只读回溯。
  const [teamSettlementSelectedWeekStart, setTeamSettlementSelectedWeekStart] = useState<string | null>(null);
  // 历史周请求切换时仅保留同一负责人的已读团队卡，不能把另一位用户的数据短暂带入当前视图。
  const teamSettlementSnapshotRef = useRef<{ scopeKey: string; report: T0TeamWeeklySettlement } | null>(null);
  const prefetchedTeamSettlementWeekKeyRef = useRef<string | null>(null);
  // 管理员结算默认先看原概览；账户对账按需读取全局账户及用户去向，成员视角永不展示。
  const [adminSettlementTab, setAdminSettlementTab] = useState<"overview" | "reconciliation">("overview");
  // null 表示默认最新实时周；仅管理员主动用左右箭头选择历史周后才固定在该周。
  const [selectedSettlementReconciliationWeekStart, setSelectedSettlementReconciliationWeekStart] = useState<string | null>(null);
  const prefetchedSettlementReconciliationWeekStartRef = useRef<string | null>(null);
  const [expandedSettlementMemberId, setExpandedSettlementMemberId] = useState<number | null>(null);
  const [expandedSettlementAccountId, setExpandedSettlementAccountId] = useState<string | null>(null);
  const [expandedSettlementDestinationUserId, setExpandedSettlementDestinationUserId] = useState<number | null>(null);
  const [expandedSettlementReportId, setExpandedSettlementReportId] = useState<string | null>(null);
  const [showPayoutLog, setShowPayoutLog] = useState(false);
  // 个人收益账本内的三张只读明细表；登记入口仍只开放给管理员。
  const [payoutLedgerTab, setPayoutLedgerTab] = useState<"income" | "withdrawal" | "deposit">("income");
  const [showGlobalLedger, setShowGlobalLedger] = useState(false);
  /** 仅受控团队负责人可打开；团队页只展示递归下属的汇总，不提供订单下钻。 */
  const [globalLedgerTab, setGlobalLedgerTab] = useState<"positions" | "funds" | "income" | "system">("positions");
  const [globalFundsSort, setGlobalFundsSort] = useState<{ key: "deposit" | "withdrawal" | "net"; direction: "asc" | "desc" } | null>(null);
  const [globalIncomeSort, setGlobalIncomeSort] = useState<{ key: "order" | "commission" | "shared" | "total"; direction: "asc" | "desc" } | null>(null);
  const [payoutIncomePage, setPayoutIncomePage] = useState(1);
  const [showPayoutXirrHelp, setShowPayoutXirrHelp] = useState(false);
  const [payoutOccurredOn, setPayoutOccurredOn] = useState(() => getBeijingDateInputValue());
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutDepositInputMode, setPayoutDepositInputMode] = useState<"u" | "eth">("u");
  const [payoutEthQuantity, setPayoutEthQuantity] = useState("");
  const [payoutEthReferencePrice, setPayoutEthReferencePrice] = useState("");
  const [payoutEthReferencePriceIsManual, setPayoutEthReferencePriceIsManual] = useState(false);
  const [payoutNote, setPayoutNote] = useState("");
  const [payoutSubmitNotice, setPayoutSubmitNotice] = useState<{ tone: "pending" | "success" | "error"; message: string } | null>(null);
  const [editingPayoutLog, setEditingPayoutLog] = useState<T0JournalPayoutLog | null>(null);
  const [isPayoutListEditing, setIsPayoutListEditing] = useState(false);
  const [deletePayoutLogId, setDeletePayoutLogId] = useState<string | null>(null);
  const [showNetPositionDetail, setShowNetPositionDetail] = useState(false);
  const [grossProfitDetail, setGrossProfitDetail] = useState<{
    side: PositionSide;
    gross: number;
    openingFee: number;
    closingFee: number;
    net: number;
  } | null>(null);
  const [restoreCandidate, setRestoreCandidate] = useState<RecoverableTrade | null>(null);
  const [recoverableEntries, setRecoverableEntries] = useState<RecoverableTrade[]>([]);
  const [showRecoverableRecords, setShowRecoverableRecords] = useState(false);
  const [entrySide, setEntrySide] = useState<PositionSide>("long");
  /** 当前由哪张开仓主单发起平仓；其真实 ID 会随提交写入，禁止同档其他主单被混扣。 */
  const [closingSourceTrade, setClosingSourceTrade] = useState<PreviewTrade | null>(null);
  /** 编辑已有开仓时保留原始快照，用于识别不影响 FIFO 的“仅反向展示切换”。 */
  const [editingOriginalTrade, setEditingOriginalTrade] = useState<PreviewTrade | null>(null);
  const [lastSavedQuantity, setLastSavedQuantity] = useState("");
  const [lastOpeningInstrumentType, setLastOpeningInstrumentType] = useState<T0InstrumentType>("contract");
  const [showCumulativeData, setShowCumulativeData] = useState(false);
  const [adminLadderDisplayMode, setAdminLadderDisplayMode] = useState<AdminLadderDisplayMode>("individual");
  /** 仅控制整合报价的显示聚合宽度；真实成交、FIFO 与平仓匹配始终使用十美元档。 */
  const [integratedArchiveStep, setIntegratedArchiveStep] = useState<IntegratedArchiveStep>(POSITION_ARCHIVE_STEP);
  const [lastMarkPrice, setLastMarkPrice] = useState<number | null>(null);
  const [previousMarkPrice, setPreviousMarkPrice] = useState<number | null>(null);
  const [liveClock, setLiveClock] = useState(() => new Date());
  const previousFetchedMarkPriceRef = useRef<number | null>(null);
  const settlementPeriodRefreshRef = useRef<string | null>(null);
  /** “盈利”历史记录截图入口：仅导出当前历史记录区块。 */
  const profitableHistoryExportRef = useRef<HTMLElement | null>(null);
  const sharedIncomeAllocationGuideExportRef = useRef<HTMLElement | null>(null);
  const payoutSharedContentRef = useRef<HTMLDivElement | null>(null);
  const totalProfitAttributionExportRef = useRef<HTMLDivElement | null>(null);
  /** 结算图片仅包含周期、本周三项收益和七日明细，不截取账本顶部或页面操作栏。 */
  const weeklySettlementExportRef = useRef<HTMLElement | null>(null);
  /** 手机上切换历史筛选后，将历史区标题、筛选和汇总一并定位到屏幕顶部；桌面端不改变阅读位置。 */
  const focusHistoryOnMobile = useCallback(() => {
    if (typeof window === "undefined" || window.innerWidth >= 768) return;
    window.requestAnimationFrame(() => {
      profitableHistoryExportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);
  const hasInitializedJournalFiltersRef = useRef(false);
  const activeTopFilterStorageKeyRef = useRef<string | null>(null);
  // React 的 pending 状态要等下一次 render 才会禁用按钮；此锁在同一事件循环内立即生效，
  // 仅覆盖真正写入账本的提交段，不能阻碍“参数确认 → 二次确认”的正常流程。
  const saveEntryCommitLockRef = useRef(false);
  // 二次确认页发生网络不确定错误时，重试必须沿用首次请求标识，才能由服务端幂等键回放同一笔平仓。
  const closeCommitRequestIdRef = useRef<string | null>(null);
  // 历史 FIFO、已实现盈亏和年化计算只在进入本次分配页时执行一次。
  // 行情刷新与账本轮询继续更新报价表，但不能阻塞正在填写的分配页。
  const sharedIncomeClosePreviewSnapshotRef = useRef<{ key: string; preview: SharedIncomeClosePreview } | null>(null);
  // 直达预览链接只初始化一次；退出链接后才允许下次重新选择可用模拟订单。
  const closeDistributionPreviewLinkInitializedRef = useRef(false);
  // 剩余仓位转入同样是真实账本写入；同步锁覆盖 React pending 状态尚未刷新的双击窗口。
  const residualReassignCommitLockRef = useRef(false);
  // 服务端已提交但响应丢失时，按同一归属草稿重试必须复用请求 ID，不能再次新建承接单。
  const residualReassignRequestIdRef = useRef<string | null>(null);
  const residualReassignRequestFingerprintRef = useRef<string | null>(null);
  const [hydratedTopFilterStorageKey, setHydratedTopFilterStorageKey] = useState<string | null>(null);
  // 从报价表进入表单后，返回与保存必须回到原先的整合/逐笔模式。
  const entrySheetLadderDisplayModeRef = useRef<AdminLadderDisplayMode>("individual");
  // 整合报价详情必须沿用进入时的展示归档宽度，避免详情范围在交互中漂移。
  const entrySheetArchiveStepRef = useRef<number>(POSITION_ARCHIVE_STEP);
  // 四位价格自动补点仅服务向前输入；退格时必须允许连续删回个位和十位来纠错。
  const smartOpeningPriceBackspaceRef = useRef(false);
  const [entryForm, setEntryForm] = useState<EntryForm>({
    action: "openLong",
    accountId: "",
    accountName: "",
    relatedUserId: "",
    relatedUserName: "",
    relatedUsername: "",
    relatedFundId: "",
    relatedFundName: "",
    instrumentType: "contract",
    optionDirection: "long_call",
    optionExpiryDate: "",
    optionPremium: "",
    optionPremiumCurrency: "USDT",
    gridDirection: "long",
    gridRangeMin: "",
    gridRangeMax: "",
    gridLeverage: "",
    gridCount: "",
    isLocked: false,
    isCounterparty: false,
    isPending: false,
    isTakeProfit: false,
    takeProfitPrice: "",
    takeProfitQuantity: "",
    takeProfitPlans: [],
    quantity: "",
    price: "",
    priceInputPrefix: "",
    note: "",
  });

  useEffect(() => {
    if (previewUserIdFromUrl !== null) setPreviewUserId(previewUserIdFromUrl);
  }, [previewUserIdFromUrl]);

  useEffect(() => {
    const keyword = relatedUserSearch.trim();
    if (!keyword) {
      setDebouncedRelatedUserSearch("");
      return;
    }
    const timer = window.setTimeout(() => setDebouncedRelatedUserSearch(keyword), 180);
    return () => window.clearTimeout(timer);
  }, [relatedUserSearch]);

  useEffect(() => {
    const keyword = profitShareRecipientSearch.trim();
    if (!keyword) {
      setDebouncedProfitShareRecipientSearch("");
      return;
    }
    const timer = window.setTimeout(() => setDebouncedProfitShareRecipientSearch(keyword), 180);
    return () => window.clearTimeout(timer);
  }, [profitShareRecipientSearch]);

  const viewAsUserId = searchParams.get("viewAs") || (typeof window !== "undefined" ? window.sessionStorage.getItem("view-as-user-id") : null);
  // 登录代入时，服务端会以目标成员身份返回只读数据。该目标也必须进入 React Query 键，
  // 否则同一个 SPA 会话切换成员时可能短暂复用上一位成员的账本或周结算回包。
  const viewAsSessionUserId = Number.parseInt(String(viewAsUserId || ""), 10);
  const hasViewAsSessionScope = Number.isInteger(viewAsSessionUserId) && viewAsSessionUserId > 0;
  const viewerScopeUserId = hasViewAsSessionScope ? viewAsSessionUserId : undefined;
  const { data: me, isLoading: meLoading } = trpc.auth.me.useQuery(undefined, { retry: false });
  const { data: ledgerData, isLoading: ledgerLoading } = trpc.ledger.getById.useQuery(
    { ledgerId },
    { enabled: Number.isFinite(ledgerId) && ledgerId > 0 },
  );
  const isLedgerAdmin = (ledgerData as any)?.userRole === "admin" || (ledgerData as any)?.userRole === "owner";
  const isSuperAdmin = (me as any)?.role === "super_admin" || (me as any)?.role === "admin";
  const hasLedgerMembership = Boolean((ledgerData as any)?.userRole);
  // 账本成员可读取个人范围；仅嵌入页允许管理员代入成员读取该成员的同一只读范围。
  const canAccess = ledgerId === 52
    && (hasLedgerMembership || isSuperAdmin)
    && (!viewAsUserId || (embedded && allowAdminViewAs));
  const { data: t0MarkPriceRaw } = trpc.getT0EthPerpetualMark.useQuery(undefined, {
    enabled: canAccess,
    refetchInterval: T0_PRICE_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 250,
  });
  // 登记投入使用项目统一数字币行情缓存的ETH价；该查询不参与订单成交或收益计算。
  const { data: cryptoPrices } = trpc.getCryptoPrices.useQuery(undefined, {
    enabled: canAccess,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 25_000,
  });
  const canUseMemberPreview = canAccess && (isLedgerAdmin || isSuperAdmin) && !Boolean(viewAsUserId);
  const previewMemberRecentStorageKey = getT0PreviewMemberRecentStorageKey(
    canUseMemberPreview ? Number((me as any)?.id || 0) : null,
  );
  const previewMemberSelectionCountStorageKey = getT0PreviewMemberSelectionCountStorageKey(
    canUseMemberPreview ? Number((me as any)?.id || 0) : null,
  );
  const t0JournalQuery = trpc.ledger.t0GetJournal.useQuery(
    { ledgerId: 52, previewUserId: previewUserId || undefined, viewerScopeUserId },
    {
      enabled: canAccess,
      staleTime: T0_JOURNAL_STALE_TIME_MS,
      // 统一由52号账本活动页面的两秒调度失效并重拉，后台页面不会请求。
      refetchOnWindowFocus: true,
    },
  );
  const t0SharedIncomePrincipalRuleQuery = trpc.ledger.t0GetSharedIncomePrincipalRule.useQuery(
    { ledgerId: 52 },
    {
      enabled: canAccess,
      staleTime: 60_000,
      refetchOnWindowFocus: true,
    },
  );
  const savedSharedIncomePrincipalRule = useMemo<SharedIncomePrincipalRule>(() => {
    const data = t0SharedIncomePrincipalRuleQuery.data as any;
    const rawInfluencePercentage = Number(data?.influencePercentage);
    return {
      curve: data?.curve === "balanced" || data?.curve === "strong" ? data.curve : "linear",
      influencePercentage: Math.min(100, Math.max(0, Math.trunc(Number.isFinite(rawInfluencePercentage) ? rawInfluencePercentage : 100))),
    };
  }, [t0SharedIncomePrincipalRuleQuery.data]);
  useEffect(() => {
    // 设置页内允许实时试算草案；退出设置后才以服务端已保存版本重新接管。
    if (!showSharedIncomePrincipalRuleSettings) setSharedIncomePrincipalRule(savedSharedIncomePrincipalRule);
  }, [savedSharedIncomePrincipalRule, showSharedIncomePrincipalRuleSettings]);
  // tRPC切换查询键时仍可能在一个渲染周期内保留上一范围的缓存回包。
  // 用户预览绝不能因为展示名称已更新，就把管理员或上一位成员的订单、收益和资金数据
  // 填进当前用户页面；所有下游投影必须只消费与当前目标严格匹配的回包。
  const rawJournalData = t0JournalQuery.data as any;
  const queriedViewerMode = rawJournalData?.viewerMode;
  const isUserPreview = previewUserId !== null;
  // 管理员切回时不能用上一位成员的缓存数据短暂放开编辑按钮；等待完整管理范围重新返回。
  const isViewAsSessionSwitching = hasViewAsSessionScope
    && (rawJournalData?.viewerMode !== "member" || Number(rawJournalData?.viewerRelatedUserId || 0) !== viewerScopeUserId);
  const isPreviewSwitching = isUserPreview
    ? rawJournalData?.viewerMode !== "member" || Number(rawJournalData?.viewerRelatedUserId || 0) !== previewUserId
    : isViewAsSessionSwitching || (canUseMemberPreview && queriedViewerMode !== undefined && queriedViewerMode !== "admin");
  const activeJournalData = isPreviewSwitching ? undefined : rawJournalData;
  const isMemberView = isUserPreview || (!canUseMemberPreview && queriedViewerMode === "member");
  const canManage = canAccess && queriedViewerMode === "admin" && !isUserPreview && !isPreviewSwitching;
  // 管理员无论从筛选框还是用户视角入口选人，都记住同一位成员；用户视角期间不改动成员端自身的下拉条件。
  useEffect(() => {
    if (!canUseMemberPreview) return;
    if (isUserPreview) {
      setAdminUnifiedSelectedMemberId(previewUserId);
      return;
    }
    if (!canManage) return;
    const filterUserId = relatedUserFilterIds.length === 1 && /^\d+$/.test(relatedUserFilterIds[0])
      ? Number(relatedUserFilterIds[0])
      : null;
    setAdminUnifiedSelectedMemberId((current) => current === filterUserId ? current : filterUserId);
  }, [canManage, canUseMemberPreview, isUserPreview, previewUserId, relatedUserFilterIds]);
  // 普通成员（含管理员代入成员后的同一只读呈现）与管理员全局视图均用独立路由展示总收益。
  // 页面顶部的“结算”Tab按同一权限自动切为个人结算或全局结算中心。
  const isTotalProfitPage = isTotalProfitPageRoute && (isMemberView || canManage);
  const isTotalProfitReportVisible = showTotalNetProfitDetail || isTotalProfitPage;

  const t0TeamOverviewAccessQuery = trpc.ledger.t0CanViewTeamOverview.useQuery(
    { ledgerId: 52, previewUserId: isUserPreview ? previewUserId || undefined : undefined },
    {
      // 仅查询授权开关以决定是否显示“团队”Tab，不在总收益首屏聚合团队财务数据。
      enabled: canAccess && isTotalProfitReportVisible && (isUserPreview || queriedViewerMode === "member"),
      staleTime: T0_JOURNAL_STALE_TIME_MS,
      refetchOnWindowFocus: true,
    },
  );
  const canViewTeamOverview = Boolean((t0TeamOverviewAccessQuery.data as { enabled?: boolean } | undefined)?.enabled);
  const t0TeamOverviewQuery = trpc.ledger.t0GetTeamOverview.useQuery(
    { ledgerId: 52, previewUserId: isUserPreview ? previewUserId || undefined : undefined },
    {
      // 团队成员、入金及收益聚合只在用户实际点入团队Tab后执行。
      enabled: canViewTeamOverview && totalProfitDetailTab === "team",
      staleTime: T0_JOURNAL_STALE_TIME_MS,
      refetchOnWindowFocus: true,
    },
  );
  const teamOverview = t0TeamOverviewQuery.data as T0TeamOverview | undefined;
  const teamOverviewMembers = useMemo(() => Array.isArray(teamOverview?.members) ? teamOverview.members : [], [teamOverview?.members]);
  const isAdminReconciliationActive = canManage && isTotalProfitPage && totalProfitPageTab === "settlement" && adminSettlementTab === "reconciliation";
  // 管理员在主账本单选一位用户时，周结算必须走服务端同一份成员周报。
  // 不能只因未进入 URL 预览模式就回退为全局周报，再由前端本地流水临时拼接。
  const weeklySettlementPreviewUserId = isUserPreview
    ? previewUserId || undefined
    : (canManage && relatedUserFilterIds.length === 1 && /^\d+$/.test(relatedUserFilterIds[0])
      ? Number(relatedUserFilterIds[0])
      : undefined);
  const t0WeeklySettlementQuery = trpc.ledger.t0GetWeeklySettlementCenter.useQuery(
    { ledgerId: 52, previewUserId: weeklySettlementPreviewUserId, viewerScopeUserId },
    {
      // 成员与管理员都以服务端统一FIFO、冻结分佣快照和共享扣减为周结算权威口径。
      // 成员端已加载的总收益明细只可在本查询返回前临时构造首屏，不能长期覆盖权威周报。
      enabled: canAccess && totalProfitPageTab === "settlement" && (isTotalProfitPage || showTotalNetProfitDetail),
      staleTime: 10_000,
      // 管理员进入账户对账后，周清单已在首屏取得；同时轮询结算中心和逐笔对账会重复全历史核算。
      refetchInterval: isTotalProfitReportVisible && !isAdminReconciliationActive ? 15_000 : false,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: !isAdminReconciliationActive,
    },
  );
  const weeklySettlementCenter = t0WeeklySettlementQuery.data as T0WeeklySettlementCenter | undefined;
  const reconciliationWeekOptions = useMemo(() => {
    const current = weeklySettlementCenter?.current?.period;
    const history = weeklySettlementCenter?.history || [];
    const options = [
      ...(current ? [{ weekStartBjt: current.weekStartBjt, weekEndExclusiveBjt: current.weekEndExclusiveBjt }] : []),
      ...history.map((item) => ({ weekStartBjt: item.report.period.weekStartBjt, weekEndExclusiveBjt: item.report.period.weekEndExclusiveBjt })),
    ];
    return Array.from(new Map(options.map((item) => [item.weekStartBjt, item])).values()).sort((left, right) => left.weekStartBjt.localeCompare(right.weekStartBjt));
  }, [weeklySettlementCenter]);
  const effectiveSettlementReconciliationWeekStart = selectedSettlementReconciliationWeekStart && reconciliationWeekOptions.some((item) => item.weekStartBjt === selectedSettlementReconciliationWeekStart)
    ? selectedSettlementReconciliationWeekStart
    : weeklySettlementCenter?.current?.period?.weekStartBjt || null;
  const isRealtimeSettlementReconciliation = Boolean(
    effectiveSettlementReconciliationWeekStart
    && effectiveSettlementReconciliationWeekStart === weeklySettlementCenter?.current?.period?.weekStartBjt,
  );
  const t0TeamWeeklySettlementQuery = trpc.ledger.t0GetTeamWeeklySettlement.useQuery(
    { ledgerId: 52, previewUserId: isUserPreview ? previewUserId || undefined : undefined, weekStartBjt: teamSettlementSelectedWeekStart || undefined },
    {
      // 负责人进入结算页即在后台预热团队本周；点“团队”时直接复用结果，避免首次点击长时间等待。
      // 普通成员仍不会请求或取得任何团队结算数据。
      enabled: canViewTeamOverview && isMemberView && !isPreviewSwitching && totalProfitPageTab === "settlement" && isTotalProfitReportVisible,
      staleTime: 60_000,
      refetchInterval: !teamSettlementSelectedWeekStart && isTotalProfitReportVisible ? 30_000 : false,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
    },
  );
  const teamWeeklySettlement = t0TeamWeeklySettlementQuery.data as T0TeamWeeklySettlement | undefined;
  const teamSettlementQueryScopeKey = isUserPreview ? `preview:${previewUserId || "none"}` : "member:self";
  if (teamWeeklySettlement) {
    teamSettlementSnapshotRef.current = { scopeKey: teamSettlementQueryScopeKey, report: teamWeeklySettlement };
  }
  // 同一负责人切换周时，查询缓存切键的一瞬不清空已展示卡；切换完成后再替换为目标周真实报告。
  const displayedTeamWeeklySettlement = teamWeeklySettlement
    || (teamSettlementSnapshotRef.current?.scopeKey === teamSettlementQueryScopeKey ? teamSettlementSnapshotRef.current.report : undefined);
  const teamSettlementWeekStarts = useMemo(() => Array.from(new Set([
    ...(Array.isArray(displayedTeamWeeklySettlement?.availableWeekStarts) ? displayedTeamWeeklySettlement.availableWeekStarts : []),
    ...(displayedTeamWeeklySettlement?.currentWeekStartBjt ? [displayedTeamWeeklySettlement.currentWeekStartBjt] : []),
  ])).filter((weekStartBjt) => /^\d{4}-\d{2}-\d{2}$/.test(weekStartBjt)).sort((left, right) => left.localeCompare(right)), [displayedTeamWeeklySettlement]);
  const effectiveTeamSettlementWeekStart = teamSettlementSelectedWeekStart || displayedTeamWeeklySettlement?.currentWeekStartBjt || displayedTeamWeeklySettlement?.period?.weekStartBjt || null;
  const selectedTeamSettlementWeekIndex = Math.max(0, teamSettlementWeekStarts.indexOf(effectiveTeamSettlementWeekStart || ""));
  const previousTeamSettlementWeekStart = teamSettlementWeekStarts[selectedTeamSettlementWeekIndex - 1];
  const nextTeamSettlementWeekStart = teamSettlementWeekStarts[selectedTeamSettlementWeekIndex + 1];
  const selectTeamSettlementWeek = useCallback((weekStartBjt: string) => {
    setTeamSettlementSelectedWeekStart(weekStartBjt === displayedTeamWeeklySettlement?.currentWeekStartBjt ? null : weekStartBjt);
  }, [displayedTeamWeeklySettlement?.currentWeekStartBjt]);
  const isTeamSettlementWeekLoading = t0TeamWeeklySettlementQuery.isLoading
    || Boolean(teamSettlementSelectedWeekStart && displayedTeamWeeklySettlement?.period?.weekStartBjt !== teamSettlementSelectedWeekStart);
  const t0WeeklySettlementAccountReconciliationQuery = trpc.ledger.t0GetWeeklySettlementAccountReconciliation.useQuery(
    { ledgerId: 52, weekStartBjt: effectiveSettlementReconciliationWeekStart || undefined },
    {
      // 账户、逐笔平仓及其他用户去向仅在管理员明确点开“账户对账”后读取。
      enabled: isAdminReconciliationActive && Boolean(effectiveSettlementReconciliationWeekStart),
      // 历史周只会因追加调整或重新确认失效；较长缓存让左右切换可直接复用已预热结果。
      staleTime: isRealtimeSettlementReconciliation ? 10_000 : 5 * 60_000,
      // 已结束历史周只在管理员明确切换、刷新或新增调整后更新；当前实时周才需要低频复核。
      refetchInterval: isAdminReconciliationActive && isRealtimeSettlementReconciliation ? 30_000 : false,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: isRealtimeSettlementReconciliation,
    },
  );
  const weeklySettlementAccountReconciliationRaw = t0WeeklySettlementAccountReconciliationQuery.data as T0WeeklySettlementAccountReconciliation | undefined;
	  const weeklySettlementAccountReconciliation = !effectiveSettlementReconciliationWeekStart || weeklySettlementAccountReconciliationRaw?.period.weekStartBjt === effectiveSettlementReconciliationWeekStart
	    ? weeklySettlementAccountReconciliationRaw
	    : undefined;
		// 服务端是有效性权威；本地再以当前活动、已成交的平仓流水兜底，
		// 防止回退刚成功而查询缓存尚未回填时，残留共享到账短暂进入任何收益汇总。
		const activeSharedIncomeClosingEntryIds = useMemo(() => new Set(
		  rawJournalTrades
		    .filter((trade) => !ACTIONS[trade.action].opening && !trade.isPending)
		    .map((trade) => getStoredEntryId(trade)),
		), [rawJournalTrades]);
		const sharedIncomeTransfers = useMemo<SharedIncomeTransfer[]>(() => {
		  const rows = activeJournalData?.sharedIncomeTransfers;
	    return Array.isArray(rows) ? rows.map((item: any) => ({
      id: String(item.id),
      closingEntryId: String(item.closingEntryId),
      sourceUserId: Number(item.sourceUserId),
      sourceUserName: String(item.sourceUserName || `用户#${item.sourceUserId}`),
      recipientUserId: Number(item.recipientUserId),
      recipientUserName: String(item.recipientUserName || `用户#${item.recipientUserId}`),
      recipientUsername: item.recipientUsername ? String(item.recipientUsername) : undefined,
      amount: Number(item.amount || 0),
      sourceNetPnl: Number(item.sourceNetPnl || 0),
	      shareableAmount: Number(item.shareableAmount || 0),
	      reducesRegularDistribution: Boolean(item.reducesRegularDistribution),
	      createdAt: String(item.createdAt || ""),
		  })).filter((item) => item.id && Number.isFinite(item.amount) && item.amount > 0 && activeSharedIncomeClosingEntryIds.has(item.closingEntryId)) : [];
		}, [activeJournalData, activeSharedIncomeClosingEntryIds]);
	const sharedIncomeContributionsBySourceUser = useMemo(() => {
	  const contributions = new Map<string, { amount: number; orderCount: number }>();
	  const rows = activeJournalData?.sharedIncomeContributions;
	  if (!Array.isArray(rows)) return contributions;
	  for (const row of rows) {
	    const sourceUserId = String(row?.sourceUserId || "").trim();
	    const amount = Number(row?.amount || 0);
	    const orderCount = Number(row?.orderCount || 0);
	    if (!sourceUserId || !Number.isFinite(amount) || !Number.isFinite(orderCount)) continue;
	    contributions.set(sourceUserId, { amount: Math.max(0, amount), orderCount: Math.max(0, Math.floor(orderCount)) });
	  }
	  return contributions;
	}, [activeJournalData]);
	const sharedIncomeEligibilityByPair = useMemo(() => {
	  const settings = new Map<string, boolean>();
	  const rows = activeJournalData?.sharedIncomeEligibilities;
	  if (!Array.isArray(rows)) return settings;
	  for (const row of rows) {
	    const sourceUserId = Number(row?.sourceUserId || 0);
	    const recipientUserId = Number(row?.recipientUserId || 0);
	    if (!Number.isInteger(sourceUserId) || sourceUserId <= 0 || !Number.isInteger(recipientUserId) || recipientUserId <= 0) continue;
	    settings.set(`${sourceUserId}:${recipientUserId}`, Boolean(row?.enabled));
	  }
	  return settings;
	}, [activeJournalData]);
	// 系统动态来自服务端不可变审计，仅管理员范围下发；不参与仓位、资金或收益口径计算。
  const systemActivityLogs = useMemo<T0JournalSystemActivity[]>(() => {
    const rows = activeJournalData?.systemActivityLogs;
    return Array.isArray(rows) ? rows.map((item: any) => ({
      id: String(item.id || ""),
      type: item.type === "recovery_fill" || item.type === "take_profit" || item.type === "expiry_settlement" ? item.type : "auto_fill",
      entryId: String(item.entryId || ""),
      occurredAt: String(item.occurredAt || ""),
      occurredAtLabel: item.occurredAtLabel ? String(item.occurredAtLabel) : undefined,
      recordedAt: String(item.recordedAt || ""),
      action: String(item.action || "订单"),
      quantity: Number(item.quantity || 0),
      price: Number(item.price || 0),
      accountName: item.accountName ? String(item.accountName) : undefined,
      relatedUserName: item.relatedUserName ? String(item.relatedUserName) : undefined,
      note: item.note ? String(item.note) : undefined,
    })).filter((item) => item.id && item.entryId && item.occurredAt) : [];
  }, [activeJournalData]);
  const reopenReminders = useMemo<T0ReopenReminder[]>(() => {
    const rows = activeJournalData?.reopenReminders;
    return Array.isArray(rows) ? rows.map((item: any) => ({
      id: String(item.id),
      sourceOpeningEntryId: String(item.sourceOpeningEntryId || ''),
      accountId: String(item.accountId || ''),
      accountName: String(item.accountName || '未命名账户'),
      relatedUserId: item.relatedUserId === undefined || item.relatedUserId === null ? undefined : String(item.relatedUserId),
      relatedUserName: item.relatedUserName ? String(item.relatedUserName) : undefined,
      relatedUsername: item.relatedUsername ? String(item.relatedUsername) : undefined,
      relatedFundId: item.relatedFundId === undefined || item.relatedFundId === null ? undefined : String(item.relatedFundId),
      relatedFundName: item.relatedFundName ? String(item.relatedFundName) : undefined,
      symbol: String(item.symbol || 'ETH'),
      instrumentType: item.instrumentType === 'spot' || item.instrumentType === 'option' || item.instrumentType === 'grid' ? item.instrumentType : 'contract',
      side: item.side === 'short' ? 'short' : 'long',
      anchorPrice: Number(item.anchorPrice || 0),
      defaultQuantity: Number(item.defaultQuantity || 0),
    })).filter((item) => item.id && item.anchorPrice > 0 && item.defaultQuantity > 0) : [];
  }, [activeJournalData]);
  const visibleReopenReminders = useMemo(() => reopenReminders.filter((reminder) => (
    // 待补位只是管理端的运营提醒，不属于用户仓位、收益或交易流水。
    // 即便管理员正在预览某位用户的客户端视图，也不得显示该占位。
    canManage
    && !isMemberView
    && (!selectedAccountIds.length || selectedAccountIds.includes(reminder.accountId))
    && (!relatedUserFilterIds.length || (reminder.relatedUserId ? relatedUserFilterIds.includes(reminder.relatedUserId) : false))
    && (!relatedFundFilterIds.length || (reminder.relatedFundId ? relatedFundFilterIds.includes(reminder.relatedFundId) : false))
    && (!instrumentTypeFilterIds.length || instrumentTypeFilterIds.includes(reminder.instrumentType))
  )), [canManage, instrumentTypeFilterIds, isMemberView, relatedFundFilterIds, relatedUserFilterIds, reopenReminders, selectedAccountIds]);

  const sharedIncomeReductionsByClosingEntryId = useMemo(() => {
    const rows = activeJournalData?.sharedIncomeReductions;
    const reductions = new Map<string, SharedIncomeReduction>();
    if (!Array.isArray(rows)) return reductions;
    for (const row of rows) {
      const closingEntryId = String(row?.closingEntryId || "").trim();
      const amount = Number(row?.amount || 0);
      const sourceNetPnl = Number(row?.sourceNetPnl || 0);
      if (!closingEntryId || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(sourceNetPnl) || sourceNetPnl <= 0) continue;
      reductions.set(closingEntryId, { amount, sourceNetPnl });
    }
    return reductions;
  }, [activeJournalData]);
  const payoutDepositAmountByRelatedUser = useMemo(() => new Map(
    (Array.isArray(activeJournalData?.payoutDepositTotals)
      ? activeJournalData.payoutDepositTotals
      : [])
      .map((item: any) => [String(item.relatedUserId), Math.max(0, Number(item.cumulativeDepositAmount) || 0)] as const),
  ), [activeJournalData]);
  const payoutDepositorIdentityByRelatedUser = useMemo(() => new Map(
    (Array.isArray(activeJournalData?.payoutDepositTotals)
      ? activeJournalData.payoutDepositTotals
      : [])
      .map((item: any) => [String(item.relatedUserId), {
        name: String(item.relatedUserName || `用户#${item.relatedUserId}`),
        username: String(item.relatedUsername || "").trim() || undefined,
      }] as const),
  ), [activeJournalData]);
  const payoutCashFlowsByRelatedUser = useMemo(() => {
    const cashFlowsByUser = new Map<string, Array<{ occurredOn: string; direction: T0JournalPayoutDirection; amount: number }>>();
    const rows = Array.isArray(activeJournalData?.payoutCashFlows)
      ? activeJournalData.payoutCashFlows
      : [];
    for (const row of rows) {
      const relatedUserId = String(row.relatedUserId || "");
      const amount = Number(row.amount || 0);
      const occurredOn = String(row.occurredOn || "").slice(0, 10);
      if (!relatedUserId || !Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) continue;
      const direction: T0JournalPayoutDirection = row.direction === "deposit" ? "deposit" : "withdrawal";
      cashFlowsByUser.set(relatedUserId, [...(cashFlowsByUser.get(relatedUserId) || []), { occurredOn, direction, amount }]);
    }
    return cashFlowsByUser;
  }, [activeJournalData]);
  const t0PreviewMembersQuery = trpc.ledger.t0GetPreviewMembers.useQuery(
    { ledgerId: 52 },
    {
      enabled: canUseMemberPreview,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  );
  useEffect(() => {
    setPreviewMemberRecentIds(readT0PreviewMemberRecentIds(previewMemberRecentStorageKey));
  }, [previewMemberRecentStorageKey]);
  useEffect(() => {
    setPreviewMemberSelectionCounts(readT0PreviewMemberSelectionCounts(previewMemberSelectionCountStorageKey));
  }, [previewMemberSelectionCountStorageKey]);
  const previewMembers = useMemo<T0PreviewMember[]>(() => Array.isArray(t0PreviewMembersQuery.data)
    ? t0PreviewMembersQuery.data.map((member: any) => ({
      id: Number(member.id),
      name: String(member.name || `用户#${member.id}`),
      username: member.username ? String(member.username) : undefined,
      avatar: member.avatar ? String(member.avatar) : undefined,
      lastActivityAt: member.lastActivityAt ? String(member.lastActivityAt) : null,
    })).filter((member) => Number.isInteger(member.id) && member.id > 0)
    : [], [t0PreviewMembersQuery.data]);
  const previewMemberAvatarById = useMemo(() => new Map(
    previewMembers
      .filter((member) => Boolean(member.avatar))
      .map((member) => [member.id, member.avatar!] as const),
  ), [previewMembers]);
  const selectedPreviewMember = previewMembers.find((member) => member.id === previewUserId) ?? null;
  const visiblePreviewMembers = useMemo(() => {
    const keyword = previewMemberSearch.trim().toLowerCase();
    const recentIndexByMemberId = new Map(previewMemberRecentIds.map((memberId, index) => [memberId, index]));
    return previewMembers
      .filter((member) => !keyword || `${member.name} ${member.username || ""} ${member.id}`.toLowerCase().includes(keyword))
      .sort((left, right) => {
        const selectionCountOrder = (previewMemberSelectionCounts[right.id] || 0) - (previewMemberSelectionCounts[left.id] || 0);
        if (selectionCountOrder !== 0) return selectionCountOrder;
        const leftRecentIndex = recentIndexByMemberId.get(left.id) ?? Number.POSITIVE_INFINITY;
        const rightRecentIndex = recentIndexByMemberId.get(right.id) ?? Number.POSITIVE_INFINITY;
        if (leftRecentIndex !== rightRecentIndex) return leftRecentIndex - rightRecentIndex;
        const activityOrder = String(right.lastActivityAt || "").localeCompare(String(left.lastActivityAt || ""));
        if (activityOrder !== 0) return activityOrder;
        return left.name.localeCompare(right.name, "zh-CN") || left.id - right.id;
      });
  }, [previewMemberRecentIds, previewMemberSearch, previewMemberSelectionCounts, previewMembers]);
  // 预览切换不能把上一位成员的分佣快照、订单投影或来源筛选带给下一位成员。
  // 新成员数据返回前保持“切换中”，返回后再统一投影，避免分佣偶发被旧筛选隐藏。
  const resetPreviewMemberDerivedView = () => {
    setAccounts([]);
    setRecentRelatedUsers([]);
    setRawJournalTrades([]);
    setRelatedFunds([]);
    setTrades([]);
    setProfitShareSnapshots([]);
    setRecoverableEntries([]);
    setSelectedAccountIds([]);
    setRelatedUserFilterIds([]);
    setRelatedFundFilterIds([]);
    setMemberRelatedUserFilterTouched(false);
    setHistoryIncomeKindFilterIds([]);
    setHistoryIncomeSourceFilterIds([]);
    setHistoryRelatedUserFilterIds([]);
    setHistoryRelatedFundFilterIds([]);
    setHistoryPresentation("admin");
    setHistoryActionMenuTradeId(null);
    setLastRelatedUserId("");
    setRecentJournalPage(1);
  };
  const openAdminMemberPicker = (mode: "preview" | "filter") => {
    setPreviewMemberPickerMode(mode);
    setPreviewMemberSearch("");
    setPreviewMemberPickerOpen(true);
  };
  const recordPreviewMemberSelection = (memberId: number) => {
    setPreviewMemberSelectionCounts((current) => {
      const next = {
        ...current,
        [memberId]: Math.min(T0_PREVIEW_MEMBER_SELECTION_COUNT_LIMIT, (current[memberId] || 0) + 1),
      };
      persistT0PreviewMemberSelectionCounts(previewMemberSelectionCountStorageKey, next);
      return next;
    });
    setPreviewMemberRecentIds((current) => {
      const next = [memberId, ...current.filter((currentMemberId) => currentMemberId !== memberId)]
        .slice(0, T0_PREVIEW_MEMBER_RECENT_LIMIT);
      persistT0PreviewMemberRecentIds(previewMemberRecentStorageKey, next);
      return next;
    });
  };
  const selectAdminMemberFilter = (member: T0PreviewMember | null) => {
    const selectedMemberId = member?.id ?? null;
    if (selectedMemberId) recordPreviewMemberSelection(selectedMemberId);
    setAdminUnifiedSelectedMemberId(selectedMemberId);
    setRelatedUserFilterIds(selectedMemberId ? [String(selectedMemberId)] : []);
    // 项目从属于用户；筛选对象切换时不能保留上一位用户的项目条件。
    setRelatedFundFilterIds([]);
    setRecentJournalPage(1);
    setPreviewMemberPickerOpen(false);
    setPreviewMemberSearch("");
  };
  const openPreviewMember = (member: T0PreviewMember) => {
    recordPreviewMemberSelection(member.id);
    setAdminUnifiedSelectedMemberId(member.id);
    resetPreviewMemberDerivedView();
    setPreviewUserId(member.id);
    setPreviewMemberPickerOpen(false);
    setPreviewMemberSearch("");
    setShowEntrySheet(false);
    setShowPayoutLog(false);
  };
  const returnToAdminFromPreview = () => {
    const nextFilterIds = adminUnifiedSelectedMemberId ? [String(adminUnifiedSelectedMemberId)] : [];
    resetPreviewMemberDerivedView();
    // 保留刚才代入的同一位用户，使管理员筛选框与用户视角选择器回到同一对象。
    setRelatedUserFilterIds(nextFilterIds);
    setPreviewUserId(null);
    setPreviewMemberPickerOpen(false);
    setShowEntrySheet(false);
    setShowPayoutLog(false);
    setLocation(`/ledger/${ledgerId}/t0-journal`);
  };
  // 仅管理员已在顶部筛选出一位真实用户时，才允许将“历史记录”切换为该用户登录后的呈现。
  const historyPerspectiveTargetUserId = canManage
    && relatedUserFilterIds.length === 1
    && /^\d+$/.test(relatedUserFilterIds[0])
    ? Number(relatedUserFilterIds[0])
    : 0;
  /** 管理员仅筛选一位用户时，历史收益须以这位用户的实际归属口径展示。 */
  const selectedAdminHistoryUserId = !isMemberView ? historyPerspectiveTargetUserId : 0;
  const isHistoryUserPerspective = Boolean(
    historyPresentation === "member" && historyPerspectiveTargetUserId > 0,
  );
  const historyIsMemberPresentation = isMemberView || isHistoryUserPerspective;
  /** 单选用户时，无论管理员直接筛选或代入用户视角，都使用同一组三类已实现收益筛选。 */
  const historyUsesIncomeCategories = historyIsMemberPresentation || selectedAdminHistoryUserId > 0;
  /** 管理员未单选用户时，同样显示收入分类；明细改用全局真实归因行，绝不把原始订单总利润伪装成佣金。 */
  const hasGlobalHistoryIncomeCategories = canManage
    && !isMemberView
    && !isHistoryUserPerspective
    && selectedAdminHistoryUserId === 0;
  const historyHasIncomeCategoryToolbar = historyUsesIncomeCategories || hasGlobalHistoryIncomeCategories;
  useEffect(() => {
    if (historyPerspectiveTargetUserId === 0 && historyPresentation !== "admin") {
      setHistoryPresentation("admin");
    }
  }, [historyPerspectiveTargetUserId, historyPresentation]);
  const payoutTargetRelatedUserId = isUserPreview
    ? previewUserId
    : isMemberView
      ? Number(activeJournalData?.viewerRelatedUserId || 0)
    : (canManage && relatedUserFilterIds.length === 1 && /^\d+$/.test(relatedUserFilterIds[0])
      ? Number(relatedUserFilterIds[0])
      : 0);
  // “总收益”与“结算”必须绑定同一个对象：管理员单选某位用户后，结算按该用户实际归属展示；
  // 只有管理员处于“用户：全部”时才显示全体结算和账户对账。
  const hasIndividualSettlementScope = Number.isInteger(payoutTargetRelatedUserId) && payoutTargetRelatedUserId > 0;
  const historyIncomeViewerUserId = historyIsMemberPresentation
    ? Number(payoutTargetRelatedUserId)
    : selectedAdminHistoryUserId;
  const t0PayoutLogsQuery = trpc.ledger.t0GetPayoutLogs.useQuery(
    { ledgerId: 52, relatedUserId: payoutTargetRelatedUserId || undefined, previewUserId: previewUserId || undefined },
    {
      enabled: canAccess && payoutTargetRelatedUserId > 0,
      staleTime: 0,
      refetchOnWindowFocus: true,
    },
  );
  const t0GlobalPayoutLogsQuery = trpc.ledger.t0GetPayoutLogs.useQuery(
    { ledgerId: 52, allUsers: true },
    {
      enabled: canManage && (
        (showGlobalLedger && globalLedgerTab === "funds")
        || (showTotalNetProfitDetail && payoutTargetRelatedUserId <= 0)
        // 用户视角名单的“存 / 回款”直接读取管理员已有权限的真实资金流水；
        // 仅弹层打开期间加载，不改变全局账本开关，也不会触发任何写入。
        || (canUseMemberPreview && previewMemberPickerOpen)
      ),
      staleTime: 0,
      refetchOnWindowFocus: true,
    },
  );
  const t0Utils = trpc.useUtils();
  const adjacentHistoricalTeamSettlementWeekStart = useMemo(() => {
    if (!canViewTeamOverview || !isMemberView || !displayedTeamWeeklySettlement || !effectiveTeamSettlementWeekStart) return null;
    const index = teamSettlementWeekStarts.indexOf(effectiveTeamSettlementWeekStart);
    return index > 0 ? teamSettlementWeekStarts[index - 1] || null : null;
  }, [canViewTeamOverview, displayedTeamWeeklySettlement, effectiveTeamSettlementWeekStart, isMemberView, teamSettlementWeekStarts]);
  useEffect(() => {
    if (!adjacentHistoricalTeamSettlementWeekStart) return;
    const prefetchKey = `${teamSettlementQueryScopeKey}:${adjacentHistoricalTeamSettlementWeekStart}`;
    if (prefetchedTeamSettlementWeekKeyRef.current === prefetchKey) return;
    // 团队本周卡呈现后短暂后台预取上一实际收益周，手机点击箭头时优先直接命中只读缓存。
    const timer = window.setTimeout(() => {
      prefetchedTeamSettlementWeekKeyRef.current = prefetchKey;
      void t0Utils.ledger.t0GetTeamWeeklySettlement.prefetch({
        ledgerId: 52,
        previewUserId: isUserPreview ? previewUserId || undefined : undefined,
        weekStartBjt: adjacentHistoricalTeamSettlementWeekStart,
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [adjacentHistoricalTeamSettlementWeekStart, isUserPreview, previewUserId, t0Utils, teamSettlementQueryScopeKey]);
  const adjacentHistoricalReconciliationWeekStart = useMemo(() => {
    if (!isAdminReconciliationActive || !weeklySettlementAccountReconciliationRaw || !effectiveSettlementReconciliationWeekStart) return null;
    const index = reconciliationWeekOptions.findIndex((item) => item.weekStartBjt === effectiveSettlementReconciliationWeekStart);
    return index > 0 ? reconciliationWeekOptions[index - 1]?.weekStartBjt || null : null;
  }, [effectiveSettlementReconciliationWeekStart, isAdminReconciliationActive, reconciliationWeekOptions, weeklySettlementAccountReconciliationRaw]);
  useEffect(() => {
    if (!adjacentHistoricalReconciliationWeekStart || prefetchedSettlementReconciliationWeekStartRef.current === adjacentHistoricalReconciliationWeekStart) return;
    // 当前周结果先完整呈现，再在浏览器空闲片刻预热左侧相邻历史周；不阻塞首屏或用户手势。
    const timer = window.setTimeout(() => {
      prefetchedSettlementReconciliationWeekStartRef.current = adjacentHistoricalReconciliationWeekStart;
      void t0Utils.ledger.t0GetWeeklySettlementAccountReconciliation.prefetch({ ledgerId: 52, weekStartBjt: adjacentHistoricalReconciliationWeekStart });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [adjacentHistoricalReconciliationWeekStart, t0Utils]);
  const resetPayoutLogForm = () => {
    setEditingPayoutLog(null);
    setPayoutAmount("");
    setPayoutDepositInputMode("u");
    setPayoutEthQuantity("");
    setPayoutEthReferencePrice("");
    setPayoutEthReferencePriceIsManual(false);
    setPayoutNote("");
    setPayoutSubmitNotice(null);
    setPayoutOccurredOn(getBeijingDateInputValue());
  };
  const openPayoutEntryPage = (direction: T0JournalPayoutDirection) => {
    setEditingPayoutLog(null);
    setPayoutAmount("");
    setPayoutDepositInputMode("u");
    setPayoutEthQuantity("");
    setPayoutEthReferencePrice("");
    setPayoutEthReferencePriceIsManual(false);
    setPayoutNote("");
    setPayoutSubmitNotice(null);
    setPayoutOccurredOn(getBeijingDateInputValue());
    setShowPayoutLog(false);
    setLocation(`/ledger/${ledgerId}/t0-journal?payout=${direction}`);
  };
  const createPayoutLogMutation = trpc.ledger.t0CreatePayoutLog.useMutation({
    onSuccess: async (createdLog) => {
      const payoutLogQueryInput = { ledgerId: 52 as const, relatedUserId: payoutTargetRelatedUserId || undefined, previewUserId: previewUserId || undefined };
      // 先将服务端刚写入的真实记录放入当前缓存，避免移动端请求重排时弹窗短暂显示“暂无资金记录”。
      t0Utils.ledger.t0GetPayoutLogs.setData(payoutLogQueryInput, (current) => [
        createdLog,
        ...(Array.isArray(current) ? current.filter((log) => log.id !== createdLog.id) : []),
      ]);
      resetPayoutLogForm();
      await Promise.all([
        t0Utils.ledger.t0GetPayoutLogs.invalidate(payoutLogQueryInput),
        t0Utils.ledger.t0GetPayoutLogs.invalidate({ ledgerId: 52 as const, allUsers: true }),
      ]);
      setPayoutSubmitNotice({ tone: "success", message: "已保存，正在刷新下方流水记录。" });
      t0Toast.success("资金流水已保存");
    },
    onError: (error) => {
      const message = error.message || "资金流水保存失败";
      setPayoutSubmitNotice({ tone: "error", message });
      t0Toast.error(message);
    },
  });
  const updatePayoutLogMutation = trpc.ledger.t0UpdatePayoutLog.useMutation({
    onSuccess: async (updatedLog) => {
      const payoutLogQueryInput = { ledgerId: 52 as const, relatedUserId: payoutTargetRelatedUserId || undefined, previewUserId: previewUserId || undefined };
      t0Utils.ledger.t0GetPayoutLogs.setData(payoutLogQueryInput, (current) => [
        updatedLog,
        ...(Array.isArray(current) ? current.filter((log) => log.id !== updatedLog.id) : []),
      ]);
      resetPayoutLogForm();
      await Promise.all([
        t0Utils.ledger.t0GetPayoutLogs.invalidate(payoutLogQueryInput),
        t0Utils.ledger.t0GetPayoutLogs.invalidate({ ledgerId: 52 as const, allUsers: true }),
      ]);
      setPayoutSubmitNotice({ tone: "success", message: "已更新，正在刷新下方流水记录。" });
      t0Toast.success("资金流水已更新");
    },
    onError: (error) => {
      const message = error.message || "资金流水更新失败";
      setPayoutSubmitNotice({ tone: "error", message });
      t0Toast.error(message);
    },
  });
  const deletePayoutLogMutation = trpc.ledger.t0DeletePayoutLog.useMutation({
    onSuccess: async (deletedLog) => {
      const payoutLogQueryInput = { ledgerId: 52 as const, relatedUserId: payoutTargetRelatedUserId || undefined, previewUserId: previewUserId || undefined };
      t0Utils.ledger.t0GetPayoutLogs.setData(payoutLogQueryInput, (current) =>
        Array.isArray(current) ? current.filter((log) => log.id !== deletedLog.id) : [],
      );
      setDeletePayoutLogId(null);
      if (editingPayoutLog?.id === deletedLog.id) resetPayoutLogForm();
      await Promise.all([
        t0Utils.ledger.t0GetPayoutLogs.invalidate(payoutLogQueryInput),
        t0Utils.ledger.t0GetPayoutLogs.invalidate({ ledgerId: 52 as const, allUsers: true }),
      ]);
      t0Toast.success("资金流水已删除");
    },
    onError: (error) => t0Toast.error(error.message || "资金流水删除失败"),
  });
  // 推荐树仅供管理员在完整管理视图内筛选，普通成员不读取任何下线名单。
  const t0ReferralFilterQuery = trpc.ledger.t0GetReferralFilterOptions.useQuery(
    { ledgerId: 52 },
    {
      enabled: canAccess && canManage,
      staleTime: 60_000,
      refetchInterval: 60_000,
      refetchOnWindowFocus: true,
    },
  );
  const referralDescendantsByRootUserId = useMemo(() => {
    const raw = (t0ReferralFilterQuery.data as any)?.descendantsByUserId;
    const map = new Map<string, string[]>();
    if (!raw || typeof raw !== "object") return map;
    for (const [rootUserId, descendantUserIds] of Object.entries(raw as Record<string, unknown>)) {
      if (!/^\d+$/.test(rootUserId) || !Array.isArray(descendantUserIds)) continue;
      const descendants = Array.from(new Set(descendantUserIds
        .map((userId) => String(userId))
        .filter((userId) => /^\d+$/.test(userId) && userId !== rootUserId)));
      if (descendants.length > 0) map.set(rootUserId, descendants);
    }
    return map;
  }, [t0ReferralFilterQuery.data]);
  const currentReferralRootUserId = useMemo(() => {
    // 用户预览必须从目标成员本人作为筛选根节点，不能沿用管理员浏览器缓存的用户筛选。
    if (isUserPreview && previewUserId) return String(previewUserId);
    const apiRootUserId = String((t0ReferralFilterQuery.data as any)?.rootUserId || "");
    if (/^\d+$/.test(apiRootUserId)) return apiRootUserId;
    const signedInUserId = String((me as any)?.id || "");
    return canManage && /^\d+$/.test(signedInUserId) ? signedInUserId : "";
  }, [canManage, isUserPreview, me, previewUserId, t0ReferralFilterQuery.data]);
  const referralDataLoaded = !canManage || t0ReferralFilterQuery.isSuccess;
  const referralDescendantsForCurrentRoot = currentReferralRootUserId
    ? referralDescendantsByRootUserId.get(currentReferralRootUserId)
    : undefined;
  const topFilterStorageKey = useMemo(() => {
    // 预览是管理员当前会话内的临时只读核对，不读取或覆写被预览用户在其他设备上的筛选偏好。
    if (isUserPreview) return null;
    const journal = activeJournalData as any;
    const viewerMode = journal?.viewerMode;
    const memberViewerId = journal?.viewerRelatedUserId;
    const signedInUserId = (me as any)?.id;
    if ((viewerMode !== "admin" && viewerMode !== "member") || !signedInUserId) return null;
    const viewerId = viewerMode === "member" ? String(memberViewerId || signedInUserId) : String(signedInUserId);
    return getT0TopFilterStorageKey(ledgerId, viewerMode, viewerId);
  }, [isUserPreview, ledgerId, me, activeJournalData]);
  const directoryImpactTarget = directoryRenameTarget || directoryDeleteTarget;
  const directoryImpactDimension = directoryImpactTarget?.kind === "account"
    ? "account"
    : directoryImpactTarget?.kind === "relatedFund"
      ? "related_fund"
      : "related_user";
  const directoryImpactQuery = trpc.ledger.t0GetDirectoryImpact.useQuery(
    {
      ledgerId: 52,
      dimension: directoryImpactDimension,
      dimensionId: Number(directoryImpactTarget?.id || 0),
    },
    {
      enabled: canManage && Boolean(directoryImpactTarget?.id),
      staleTime: 0,
      refetchOnWindowFocus: false,
    },
  );
  const relatedUserSearchQuery = trpc.ledger.t0SearchRelatedUsers.useQuery(
    { ledgerId: 52, query: debouncedRelatedUserSearch },
    {
      enabled: canManage && relatedUserPickerOpen && debouncedRelatedUserSearch.length > 0,
      staleTime: 30_000,
      // 移动端弹出键盘、切换输入焦点不能触发同关键词重查并闪掉结果。
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      // 切换关键词时保留上一组结果的容器，待新结果回来后再原位替换。
      placeholderData: (previousData) => previousData,
    },
  );
  const profitShareRecipientSearchQuery = trpc.ledger.t0SearchRelatedUsers.useQuery(
    { ledgerId: 52, query: debouncedProfitShareRecipientSearch },
    {
      enabled: canManage && Boolean(profitShareSource) && profitShareRecipientPickerOpen && debouncedProfitShareRecipientSearch.length > 0,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      placeholderData: (previousData) => previousData,
    },
  );
  const relatedUserSearchDataMayNotMatch = relatedUserSearch.trim() !== debouncedRelatedUserSearch || relatedUserSearchQuery.isPlaceholderData;
  const profitShareRecipientSearchDataMayNotMatch = profitShareRecipientSearch.trim() !== debouncedProfitShareRecipientSearch || profitShareRecipientSearchQuery.isPlaceholderData;
  const relatedUserSearchUpdating = relatedUserSearchDataMayNotMatch || relatedUserSearchQuery.isFetching;
  const profitShareRecipientSearchUpdating = profitShareRecipientSearchDataMayNotMatch || profitShareRecipientSearchQuery.isFetching;
  const profitShareRules = useMemo<ProfitShareRule[]>(() => {
    const rows = activeJournalData?.profitShareRules;
    return Array.isArray(rows) ? rows.map((rule: any) => ({
      id: Number(rule.id),
      relatedFundId: Number(rule.relatedFundId),
      relatedFundName: String(rule.relatedFundName || `项目#${rule.relatedFundId}`),
      sourceUserId: Number(rule.sourceUserId),
      sourceUserName: String(rule.sourceUserName || `用户#${rule.sourceUserId}`),
      beneficiaryUserId: Number(rule.beneficiaryUserId),
      beneficiaryUserName: String(rule.beneficiaryUserName || `用户#${rule.beneficiaryUserId}`),
      percentage: Number(rule.percentage || 0),
      createdAt: String(rule.createdAt || ""),
    })) : [];
  }, [activeJournalData]);
  const activeProfitShareRules = profitShareSource
    ? profitShareRules.filter((rule) => rule.relatedFundId === Number(profitShareSource.id))
    : [];
  const profitShareDraftTotal = profitShareAllocations.reduce((total, allocation) => total + (Number.isInteger(Number(allocation.percentage)) ? Number(allocation.percentage) : 0), 0);
  const netProfitShareDistribution = useMemo(() => {
    if (!canManage || netProfitDetail?.presentation === "member" || !netProfitDetail || netProfitDetail.detail.netPnl === undefined) return [];
    return buildClosingProfitShareDistribution({
      trades,
      snapshots: profitShareSnapshots,
      closing: netProfitDetail.trade,
      displayedNetPnl: netProfitDetail.detail.netPnl,
      sharedIncomeReductions: sharedIncomeReductionsByClosingEntryId,
    });
  }, [canManage, netProfitDetail, profitShareSnapshots, sharedIncomeReductionsByClosingEntryId, trades]);
  /** 管理员查看单笔平仓时，必须把共享与本单原有分佣放回同一张去向表，完整对上净收益。 */
  const netProfitAllocationSummary = useMemo(() => {
    if (!canManage || netProfitDetail?.presentation === "member" || !netProfitDetail) return null;
    const netPnl = Number(netProfitDetail.detail.netPnl);
    if (!Number.isFinite(netPnl)) return null;
    const closingEntryId = getStoredEntryId(netProfitDetail.trade);
    const sharedRows = sharedIncomeTransfers
      .filter((transfer) => transfer.closingEntryId === closingEntryId && Number.isFinite(transfer.amount) && Math.abs(transfer.amount) > 0.000001);
    const sharedTotal = sharedRows.reduce((total, transfer) => total + transfer.amount, 0);
    const regularPool = getRegularDistributableNetPnl(netPnl, closingEntryId, sharedIncomeReductionsByClosingEntryId);
    const regularRows = netProfitShareDistribution
      .filter((allocation) => Number.isFinite(allocation.netPnl) && Math.abs(allocation.netPnl) > 0.000001)
      .map((allocation) => ({ ...allocation }));
    const sourceUserId = Number(netProfitDetail.trade.relatedUserId || 0);
    const sourceUserName = netProfitDetail.trade.relatedUserName
      || netProfitDetail.trade.relatedUsername
      || (sourceUserId > 0 ? `用户#${sourceUserId}` : "关联用户");
    const regularTotalBeforeFallback = regularRows.reduce((total, allocation) => total + allocation.netPnl, 0);
    const regularGap = regularPool - regularTotalBeforeFallback;
    // 旧订单可能没有平仓快照或快照不完整；将尚未进入快照的部分明确归到下单用户，不能留成一笔无去向的余额。
    if (Math.abs(regularGap) > 0.004) {
      regularRows.push({
        beneficiaryUserId: sourceUserId,
        beneficiaryUserName: sourceUserName,
        percentageLabel: regularRows.length === 0 ? "100%" : "未设比例部分",
        netPnl: regularGap,
      });
    }
    const regularTotal = regularRows.reduce((total, allocation) => total + allocation.netPnl, 0);
    return {
      netPnl,
      sharedRows,
      sharedTotal,
      regularRows,
      regularTotal,
      allocationTotal: sharedTotal + regularTotal,
      showCommissionBreakdown: regularRows.length > 1,
    };
  }, [canManage, netProfitDetail, netProfitShareDistribution, sharedIncomeReductionsByClosingEntryId, sharedIncomeTransfers]);

  const lastRelatedUser = recentRelatedUsers.find((user) => user.id === lastRelatedUserId)
    ?? recentRelatedUsers[0]
    ?? null;
  /**
   * 下单账户按关联用户单独记忆；没有关联用户时使用独立的“未关联”记忆。
   * 刷新页面后优先从该用户最近保存的流水恢复，因此不受点击哪个价格档位影响。
   */
  const getRememberedAccountForRelatedUser = (relatedUserId?: string) => {
    const memoryKey = relatedUserAccountMemoryKey(relatedUserId);
    const rememberedId = lastAccountIdByRelatedUser[memoryKey];
    const rememberedAccount = rememberedId ? accounts.find((account) => account.id === rememberedId) : undefined;
    if (rememberedAccount) return rememberedAccount;

    const savedTrade = trades
      .filter((trade) => trade.symbol === "ETH" && relatedUserAccountMemoryKey(trade.relatedUserId) === memoryKey)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return savedTrade ? accounts.find((account) => account.id === savedTrade.accountId) : undefined;
  };
  /** 专项款同样按关联用户独立记忆，避免不同用户的资金项目串用。 */
  const getRememberedFundForRelatedUser = (relatedUserId?: string) => {
    if (!relatedUserId) return undefined;
    const rememberedId = lastFundIdByRelatedUser[relatedUserId];
    const rememberedFund = rememberedId ? relatedFunds.find((fund) => fund.id === rememberedId && fund.relatedUserId === relatedUserId) : undefined;
    if (rememberedFund) return rememberedFund;
    return [...relatedFunds]
      .filter((fund) => fund.relatedUserId === relatedUserId)
      .sort((a, b) => String(b.lastUsedAt ?? "").localeCompare(String(a.lastUsedAt ?? "")))[0];
  };
  // 合约速记只使用服务端统一缓存的 ETH 永续标记价；Gate实时流断线时由 Gate → HTX REST 保温。
  const markPriceRaw = (t0MarkPriceRaw as any)?.price;
  const fetchedMarkPrice = Number(markPriceRaw) > 0 ? Number(markPriceRaw) : null;
  const markPrice = fetchedMarkPrice ?? lastMarkPrice;
  const payoutLiveEthPrice = Number((cryptoPrices as any)?.prices?.ETH) > 0
    ? Number((cryptoPrices as any)?.prices?.ETH)
    : markPrice;

  useEffect(() => {
    if (!fetchedMarkPrice) return;
    const previous = previousFetchedMarkPriceRef.current;
    if (previous !== null) {
      setPreviousMarkPrice(previous);
    }
    previousFetchedMarkPriceRef.current = fetchedMarkPrice;
    setLastMarkPrice(fetchedMarkPrice);
  }, [fetchedMarkPrice]);

  useEffect(() => {
    if (payoutEntryDirection !== "deposit" || editingPayoutLog || payoutEthReferencePriceIsManual || !payoutLiveEthPrice) return;
    setPayoutEthReferencePrice(payoutLiveEthPrice.toFixed(2));
  }, [editingPayoutLog, payoutEntryDirection, payoutEthReferencePriceIsManual, payoutLiveEthPrice]);

  useEffect(() => {
    const timer = window.setInterval(() => setLiveClock(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const liveBeijingTime = useMemo(() => formatBeijingLiveTime(liveClock), [liveClock]);

  useEffect(() => {
    if (showEntrySheet) setShowSettledOpeningHistory(false);
  }, [showEntrySheet, entryForm.targetPrice, entrySide]);
  useEffect(() => {
    if (closeConfirmationStep === "input" || !showEntrySheet) {
      setSharedIncomeDrafts({});
      setSharedIncomeTargetSelections({});
      setSharedIncomeAllocationBudgetMode("percentage");
      setSharedIncomeAllocationBudgetValue("99");
      setSharedIncomeAllocationMetrics([]);
      setShowSharedIncomeAllocationGuide(false);
      setSharedIncomeAllocationPlanError(null);
      setSharedIncomeEligibilityOverrides({});
      setCloseSaveError(null);
    }
    // 普通平仓离开二次确认页后，下次进入必须重新取一份账本快照；
    // 止盈预分配有独立打开态，不能被这里的 input 状态提前清空。
    if (!showEntrySheet || (closeConfirmationStep === "input" && takeProfitAllocationPlanIndex === null)) {
      sharedIncomeClosePreviewSnapshotRef.current = null;
    }
    if (!showEntrySheet) setOpeningSaveError(null);
  }, [closeConfirmationStep, showEntrySheet, takeProfitAllocationPlanIndex]);

  useEffect(() => {
    const journal = activeJournalData as any;
    if (!journal) return;
    const nextAccounts: PreviewAccount[] = Array.isArray(journal.accounts)
      ? journal.accounts.map((account: any) => ({
        id: String(account.id),
        name: String(account.name || ""),
        lastUsedAt: account.lastUsedAt ?? null,
      }))
      : [];
    const nextRecentRelatedUsers: PreviewRelatedUser[] = Array.isArray(journal.recentUsers)
      ? journal.recentUsers.map((user: any) => ({
        id: String(user.id),
        name: String(user.name || user.username || `用户#${user.id}`),
        username: user.username ? String(user.username) : undefined,
        avatar: user.avatar ? String(user.avatar) : undefined,
        lastUsedAt: user.lastUsedAt ?? null,
      }))
      : [];
    const nextRelatedFunds: PreviewRelatedFund[] = Array.isArray(journal.relatedFunds)
      ? journal.relatedFunds.map((fund: any) => ({
        id: String(fund.id),
        relatedUserId: fund.relatedUserId === undefined || fund.relatedUserId === null ? undefined : String(fund.relatedUserId),
        name: String(fund.name || "未命名专项款"),
        lastUsedAt: fund.lastUsedAt ?? null,
      }))
      : [];
    const rawTrades: PreviewTrade[] = Array.isArray(journal.entries)
      ? journal.entries.map(previewTradeFromEntry)
      : [];
    const nextProfitShareSnapshots: ProfitShareSnapshot[] = Array.isArray(journal.profitShareSnapshots)
      ? journal.profitShareSnapshots.map((snapshot: any) => ({
        entryId: String(snapshot.entryId),
        openingEntryId: String(snapshot.openingEntryId),
        relatedFundId: Number(snapshot.relatedFundId || 0),
        relatedFundName: snapshot.relatedFundName ? String(snapshot.relatedFundName) : undefined,
        sourceUserId: Number(snapshot.sourceUserId),
        beneficiaryUserId: Number(snapshot.beneficiaryUserId),
        percentage: Number(snapshot.percentage || 0),
        matchedQuantity: Number(snapshot.matchedQuantity || 0),
        sourceUserName: snapshot.sourceUserName ? String(snapshot.sourceUserName) : undefined,
        beneficiaryUserName: snapshot.beneficiaryUserName ? String(snapshot.beneficiaryUserName) : undefined,
      }))
      : [];
    const nextTrades = journal.viewerMode === "member"
      ? projectMemberProfitShareTrades(
        rawTrades,
        nextProfitShareSnapshots,
        String(journal.viewerRelatedUserId || ""),
      )
      : projectAdminCounterpartyTrades(rawTrades);
    const nextRecoverableEntries: RecoverableTrade[] = Array.isArray(journal.recoverableEntries)
      ? journal.recoverableEntries.map((item: any) => ({
        auditId: String(item.auditId),
        operation: item.operation === "delete" ? "delete" : "revert",
        revertedAt: String(item.revertedAt),
        trade: previewTradeFromEntry(item.entry),
      }))
      : [];
    setAccounts(nextAccounts);
    setRecentRelatedUsers(nextRecentRelatedUsers);
    setRawJournalTrades(rawTrades);
    setRelatedFunds(nextRelatedFunds);
    setTrades(nextTrades);
    setProfitShareSnapshots(nextProfitShareSnapshots);
    setRecoverableEntries(nextRecoverableEntries);
    const latestTypedOpening = nextTrades
      .filter((entry) => ACTIONS[entry.action].opening && entry.instrumentType)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (latestTypedOpening?.instrumentType) {
      setLastOpeningInstrumentType(latestTypedOpening.instrumentType);
    }
    const latestSavedEntry = nextTrades
      .filter((entry) => entry.symbol === "ETH")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    setLastSavedQuantity(latestSavedEntry ? normalizeEthQuantity(String(latestSavedEntry.quantity)) : "");
    // 顶部五项筛选按“账本 + 当前身份”单独保存：强制刷新、关闭浏览器后再次进入均恢复；
    // 静默同步只剔除已失效的选项，不能覆盖仍有效的已选条件。
    const hasTopFilterScopeChanged = activeTopFilterStorageKeyRef.current !== topFilterStorageKey;
    const shouldRestoreTopFilters = !hasInitializedJournalFiltersRef.current || hasTopFilterScopeChanged;
    const persistedTopFilters = shouldRestoreTopFilters ? readPersistedT0TopFilters(topFilterStorageKey) : null;
    const restoredMemberRelatedUserFilterTouched = Boolean(persistedTopFilters?.memberRelatedUserFilterTouched);
    const restoredMemberSourceUserFilterV2 = Boolean(persistedTopFilters?.memberSourceUserFilterV2);
    if (hasTopFilterScopeChanged) {
      activeTopFilterStorageKeyRef.current = topFilterStorageKey;
      setHydratedTopFilterStorageKey(null);
    }
    if (shouldRestoreTopFilters) {
      setMemberRelatedUserFilterTouched(restoredMemberSourceUserFilterV2 && restoredMemberRelatedUserFilterTouched);
    }
    if (journal.viewerMode === "admin") {
      setSelectedAccountIds((current) => {
        const preferred = shouldRestoreTopFilters ? (persistedTopFilters?.accountIds ?? []) : current;
        return preferred.filter((id) => nextAccounts.some((account) => account.id === id));
      });
      setRelatedUserFilterIds((current) => {
        const preferred = shouldRestoreTopFilters ? (persistedTopFilters?.relatedUserIds ?? []) : current;
        const next = preferred.filter((id) => {
          if (id === "unlinked" || nextRecentRelatedUsers.some((user) => user.id === id)) return true;
          const rootUserId = getT0ReferralDescendantsRootUserId(id);
          // 下线树异步返回前不能清掉 localStorage 中的选择；树到位后再剔除失效根用户。
          return Boolean(rootUserId && (!referralDataLoaded || referralDescendantsByRootUserId.has(rootUserId)));
        });
        return hasSameT0StringArrayValues(current, next) ? current : next;
      });
      setRelatedFundFilterIds((current) => {
        const preferred = shouldRestoreTopFilters ? (persistedTopFilters?.relatedFundIds ?? []) : current;
        return preferred.filter((id) => id === "unclassified" || nextRelatedFunds.some((fund) => fund.id === id));
      });
    } else {
      // 成员端不展示、也不保留账户筛选；账户仅用于管理员识别订单落在哪个下单账户。
      // “用户”改为已授权订单来源多选：旧版本机保存的是“默认本人”，首次升级时必须回到
      // 全部已授权来源，避免已经分配给成员的订单被无提示隐藏。
      const memberFundFilterIds = [
        ...nextRelatedFunds.map((fund) => fund.id),
        ...(nextTrades.some((trade) => !trade.relatedFundId) ? ["unclassified"] : []),
      ];
      const memberSourceUserIds = new Set(nextTrades
        .map((trade) => trade.relatedUserHidden ? "" : String(trade.relatedUserId || "").trim())
        .filter(Boolean));
      const normalizeMemberFilter = (current: string[], optionIds: string[]) => {
        if (optionIds.length === 1) return optionIds;
        return current.filter((id) => optionIds.includes(id));
      };
      setSelectedAccountIds((current) => current.length === 0 ? current : []);
      setRelatedUserFilterIds((current) => {
        const preferred = shouldRestoreTopFilters && restoredMemberSourceUserFilterV2
          ? (persistedTopFilters?.relatedUserIds ?? [])
          : current;
        const next = preferred.filter((id) => memberSourceUserIds.has(id));
        return hasSameT0StringArrayValues(current, next) ? current : next;
      });
      setRelatedFundFilterIds((current) => normalizeMemberFilter(
        shouldRestoreTopFilters ? (persistedTopFilters?.relatedFundIds ?? []) : current,
        memberFundFilterIds,
      ));
    }
    setInstrumentTypeFilterIds((current) => shouldRestoreTopFilters
      ? (persistedTopFilters?.instrumentTypeIds ?? [])
      : normalizeT0InstrumentTypeFilterIds(current));
    setExecutionFilter((current) => shouldRestoreTopFilters ? (persistedTopFilters?.executionFilter ?? "all") : current);
    setHideLocked((current) => shouldRestoreTopFilters ? Boolean(persistedTopFilters?.hideLocked) : current);
    setLastRelatedUserId((current) => nextRecentRelatedUsers.some((user) => user.id === current)
      ? current
      : (nextRecentRelatedUsers[0]?.id || ""));
    hasInitializedJournalFiltersRef.current = true;
    setHydratedTopFilterStorageKey(topFilterStorageKey);
  }, [memberRelatedUserFilterTouched, referralDataLoaded, referralDescendantsByRootUserId, relatedUserFilterIds, activeJournalData, topFilterStorageKey]);

  useEffect(() => {
    if (!topFilterStorageKey || hydratedTopFilterStorageKey !== topFilterStorageKey) return;
    persistT0TopFilters(topFilterStorageKey, {
      accountIds: selectedAccountIds,
      relatedUserIds: relatedUserFilterIds,
      memberRelatedUserFilterTouched,
      memberSourceUserFilterV2: true,
      relatedFundIds: relatedFundFilterIds,
      instrumentTypeIds: instrumentTypeFilterIds,
      executionFilter,
      hideLocked,
    });
  }, [executionFilter, hideLocked, hydratedTopFilterStorageKey, instrumentTypeFilterIds, memberRelatedUserFilterTouched, relatedFundFilterIds, relatedUserFilterIds, selectedAccountIds, topFilterStorageKey]);

  const priceTrend = previousMarkPrice === null || markPrice === null
    ? "flat"
    : markPrice > previousMarkPrice
      ? "up"
      : markPrice < previousMarkPrice
        ? "down"
        : "flat";
  const priceTrendClass = priceTrend === "up"
    ? "text-rose-600"
    : priceTrend === "down"
      ? "text-emerald-600"
      : "text-rose-600";

  const executionScopedTrades = useMemo(
    () => executionFilter === "all"
      ? trades
      : trades.filter((trade) => matchesT0ExecutionFilter(trade, executionFilter)),
    [trades, executionFilter],
  );
  const lockVisibilityScopedTrades = useMemo(
    () => hideLocked
      ? executionScopedTrades.filter((trade) => !trade.isLocked)
      : executionScopedTrades,
    [executionScopedTrades, hideLocked],
  );
  const instrumentScopedTrades = useMemo(
    () => filterTradesByInstrumentTypes(lockVisibilityScopedTrades, instrumentTypeFilterIds),
    [lockVisibilityScopedTrades, instrumentTypeFilterIds],
  );
  const topRelatedUserFilter = useMemo(
    () => resolveT0RelatedUserFilter(
      relatedUserFilterIds,
      referralDescendantsByRootUserId,
      referralDataLoaded,
    ),
    [referralDataLoaded, referralDescendantsByRootUserId, relatedUserFilterIds],
  );
  // 管理员筛选某位用户时，除该用户原始下单外，还必须看到该用户作为分佣受益人的
  // 完整开平仓链路。快照只在成交时落库，因此同时收集开仓主单与对应平仓流水键。
  const topProfitShareBeneficiaryEntryIds = useMemo(() => {
    const entryIds = new Set<string>();
    if (isMemberView || relatedUserFilterIds.length === 0 || topRelatedUserFilter.waitingForReferralData) return entryIds;
    for (const snapshot of profitShareSnapshots) {
      if (snapshot.percentage <= 0 || !topRelatedUserFilter.userIds.has(String(snapshot.beneficiaryUserId))) continue;
      entryIds.add(snapshot.openingEntryId);
      entryIds.add(snapshot.entryId);
    }
    return entryIds;
  }, [isMemberView, profitShareSnapshots, relatedUserFilterIds.length, topRelatedUserFilter]);
  const selectedTrades = useMemo(
    () => instrumentScopedTrades.filter((trade) => (
      // 成员端账户不属于筛选维度，必须忽略旧版 localStorage 中可能残留的账户条件。
      (isMemberView || selectedAccountIds.length === 0 || selectedAccountIds.includes(trade.accountId))
      && trade.symbol === "ETH"
      // 成员端数据范围仍严格由服务端锁定为“本人订单 + 明确分佣/共享来源”。
      // 此处只允许在已经下发的来源之间做本地隐藏：空选即显示全部，选择本人可只看自己下单。
      && (isMemberView
        ? (relatedUserFilterIds.length === 0 || Boolean(trade.relatedUserId && relatedUserFilterIds.includes(trade.relatedUserId)))
        : (relatedUserFilterIds.length === 0
        || topRelatedUserFilter.waitingForReferralData
        || (topRelatedUserFilter.includesUnlinked && (!trade.relatedUserId || trade.relatedUserHidden))
        || Boolean(trade.relatedUserId && topRelatedUserFilter.userIds.has(trade.relatedUserId))
        || Boolean(trade.profitShareBeneficiaryUserId && topRelatedUserFilter.userIds.has(trade.profitShareBeneficiaryUserId))
        || topProfitShareBeneficiaryEntryIds.has(getStoredEntryId(trade))))
      && (relatedFundFilterIds.length === 0
        || relatedFundFilterIds.some((id) => id === "unclassified" ? (!trade.relatedFundId || trade.relatedFundHidden) : trade.relatedFundId === id))
    )),
    [instrumentScopedTrades, isMemberView, selectedAccountIds, relatedUserFilterIds, relatedFundFilterIds, topProfitShareBeneficiaryEntryIds, topRelatedUserFilter],
  );
  // 挂单仅作管理员报价与状态统计展示；成交前绝不进入真实仓位、FIFO、手续费、浮盈或收益汇总。
  const selectedFilledTrades = useMemo(
    () => selectedTrades.filter((trade) => !trade.isPending),
    [selectedTrades],
  );
  // 历史记录先严格继承管理员端的账户、用户、项目、类型与状态筛选；成员端不含账户维度，
  // 再按历史面板内的条件作进一步细分，避免顶部筛到某位用户时历史仍显示全部流水。
  // 管理员切为用户呈现时，历史区从原始流水重新生成与该用户本人相同的订单投影。
  const historyPerspectiveTrades = useMemo(() => {
    const memberHistoryUserId = isHistoryUserPerspective
      ? historyPerspectiveTargetUserId
      : (isMemberView
        ? Number(activeJournalData?.viewerProfitShareBeneficiaryUserId || activeJournalData?.viewerRelatedUserId || 0)
        // 管理员仅筛选一位用户时，同样必须补上该用户实际收到的共享收益来源。
        : historyPerspectiveTargetUserId);
    // 管理员单选用户的历史收益也必须先按冻结分佣快照投影；原始管理员流水没有
    // profitShareBeneficiaryUserId，直接拿它生成“名字”会误报暂无具名分佣。
    const shouldProjectSingleUserIncome = historyUsesIncomeCategories && memberHistoryUserId > 0;
    const baseTrades = shouldProjectSingleUserIncome
      ? projectMemberProfitShareTrades(
        rawJournalTrades,
        profitShareSnapshots,
        String(memberHistoryUserId),
      )
      : selectedTrades;
    return attachSharedIncomePerspectiveTrades(baseTrades, rawJournalTrades, sharedIncomeTransfers, memberHistoryUserId);
  }, [historyPerspectiveTargetUserId, historyUsesIncomeCategories, isHistoryUserPerspective, isMemberView, profitShareSnapshots, rawJournalTrades, selectedTrades, sharedIncomeTransfers, activeJournalData]);
  const historyExecutionScopedTrades = useMemo(
    () => historyExecutionFilter === "all"
      ? historyPerspectiveTrades
      : historyPerspectiveTrades.filter((trade) => matchesT0ExecutionFilter(trade, historyExecutionFilter)),
    [historyPerspectiveTrades, historyExecutionFilter],
  );
  const historyLockVisibilityScopedTrades = useMemo(
    () => historyHideLocked
      ? historyExecutionScopedTrades.filter((trade) => !trade.isLocked)
      : historyExecutionScopedTrades,
    [historyExecutionScopedTrades, historyHideLocked],
  );
  const historyInstrumentScopedTrades = useMemo(
    () => filterTradesByInstrumentTypes(historyLockVisibilityScopedTrades, historyInstrumentTypeFilterIds),
    [historyLockVisibilityScopedTrades, historyInstrumentTypeFilterIds],
  );
  /** 单用户类别与名字只从已授权可见的收益投影中生成；管理员全局类别使用真实全局归因明细。 */
  const historyMemberIncomeKindFilterOptions = useMemo<T0MultiSelectOption[]>(() => {
    if (!historyHasIncomeCategoryToolbar) return [];
    const viewerUserId = historyIncomeViewerUserId;
    if (historyUsesIncomeCategories && (!Number.isInteger(viewerUserId) || viewerUserId <= 0)) return [];
    // 三类是固定口径；即使当前用户某一类暂为 0，也保留入口，管理员与用户端始终同一布局。
    return [
      { id: "order", label: "订单", summaryLabel: "订单" },
      { id: "commission", label: "佣金", summaryLabel: "佣金" },
      { id: "shared", label: "共享", summaryLabel: "共享" },
    ];
  }, [historyHasIncomeCategoryToolbar, historyIncomeViewerUserId, historyUsesIncomeCategories]);
  /** “全部”按字面展示完整流水（含挂单与开平仓）；仅选订单/佣金/共享时才切换为对应收益分类。 */
  const historyIncomeKindsAllSelected = historyMemberIncomeKindFilterOptions.length > 0
    && historyMemberIncomeKindFilterOptions.every((option) => historyIncomeKindFilterIds.includes(option.id));
  // 点击某个交易动作或“关联”时，暂时退出收益分类，才能如实显示开仓与完整开平链路。
  // 这只是前端查看模式，不改变用户选择的收益类别、原始订单或任何收益归属。
  const isHistoryTransactionOrLinkedView = journalActionFilters.size === 1 || showLinkedJournalGroups;
  useEffect(() => {
    if (!historyHasIncomeCategoryToolbar || historyMemberIncomeKindFilterOptions.length === 0) return;
    const availableKindIds = new Set(historyMemberIncomeKindFilterOptions.map((option) => option.id));
    setHistoryIncomeKindFilterIds((current) => {
      const validCurrent = current.filter((id) => availableKindIds.has(id));
      // 动作／关联查看模式刻意保留空类别；切回收入分类时由对应按钮重新恢复三类收益。
      return validCurrent.length > 0 || isHistoryTransactionOrLinkedView
        ? validCurrent
        : Array.from(availableKindIds);
    });
    setShowOnlyProfitableHistory(false);
    setShowOnlySharedIncomeHistory(false);
    if (!historyUsesIncomeCategories && historyIncomeSourceFilterIds.length > 0) {
      setHistoryIncomeSourceFilterIds([]);
    }
  }, [historyHasIncomeCategoryToolbar, historyIncomeSourceFilterIds.length, historyMemberIncomeKindFilterOptions, historyUsesIncomeCategories, isHistoryTransactionOrLinkedView]);
  /** 名字只列出与当前用户有明确分佣关系的来源；纯共享保持“共享”类别而不披露来源人。 */
  const historyMemberIncomeSourceFilterOptions = useMemo<T0MultiSelectOption[]>(() => {
    if (!historyUsesIncomeCategories) return [];
    const viewerUserId = historyIncomeViewerUserId;
    if (!Number.isInteger(viewerUserId) || viewerUserId <= 0) return [];
    const commissionSources = new Map<string, T0MultiSelectOption>();
    for (const trade of historyPerspectiveTrades) {
      if (ACTIONS[trade.action].opening) continue;
      const sourceUserId = Number(trade.relatedUserId || 0);
      const hasCommissionRelationship = Number(trade.profitShareBeneficiaryUserId || 0) === viewerUserId
        && sourceUserId > 0
        && sourceUserId !== viewerUserId;
      if (!hasCommissionRelationship) continue;
      const sourceName = trade.relatedUserHidden
        ? "未关联用户"
        : trade.relatedUserName || trade.relatedUsername || `用户#${sourceUserId}`;
      commissionSources.set(String(sourceUserId), {
        id: String(sourceUserId),
        label: sourceName,
        summaryLabel: sourceName,
      });
    }
    return Array.from(commissionSources.values()).sort((left, right) => left.label.localeCompare(right.label, "zh-CN"));
  }, [historyIncomeViewerUserId, historyPerspectiveTrades, historyUsesIncomeCategories]);
  const historyMemberIncomeSourceScopedTrades = useMemo(() => {
    if (!historyUsesIncomeCategories || (historyIncomeKindFilterIds.length === 0 && historyIncomeSourceFilterIds.length === 0)) return historyInstrumentScopedTrades;
    const viewerUserId = historyIncomeViewerUserId;
    const selectedKindIds = new Set(historyIncomeKindFilterIds);
    const selectedSourceIds = new Set(historyIncomeSourceFilterIds);
    const allowOrder = selectedKindIds.size === 0 || selectedKindIds.has("order");
    const allowCommission = selectedKindIds.size === 0 || selectedKindIds.has("commission");
    const allowShared = selectedKindIds.size === 0 || selectedKindIds.has("shared");
    return historyInstrumentScopedTrades.filter((trade) => {
      const sourceUserId = Number(trade.relatedUserId || 0);
      const hasCommissionRelationship = Number(trade.profitShareBeneficiaryUserId || 0) === viewerUserId
        && sourceUserId > 0
        && sourceUserId !== viewerUserId;
      const hasSharedIncome = Number(trade.sharedIncomeRecipientUserId || 0) === viewerUserId
        && Number(trade.sharedIncomeAmount || 0) > 0;
      const sourceIsSelected = selectedSourceIds.size === 0 || selectedSourceIds.has(String(sourceUserId));
      const isOwnOrder = sourceUserId === viewerUserId;
      // 本人订单的开仓需作为 FIFO 计算基底保留；展示层会在筛选时仅显示其平仓净收益。
      if (isOwnOrder) return selectedSourceIds.size === 0 && allowOrder;
      // 具名来源的分佣平仓需要保留同来源开仓作为只读 FIFO 计算基底；
      // 后续展示层会隐藏这些开仓，只向用户展示分佣与共享结果。
      if (hasCommissionRelationship) return sourceIsSelected && (allowCommission || (allowShared && hasSharedIncome));
      if (ACTIONS[trade.action].opening) return false;
      // 纯共享没有可显示的来源人，因此只有“名字”未限定时才归入共享类别。
      return allowShared && selectedSourceIds.size === 0 && hasSharedIncome;
    });
  }, [historyIncomeKindFilterIds, historyIncomeSourceFilterIds, historyIncomeViewerUserId, historyInstrumentScopedTrades, historyUsesIncomeCategories]);
  const historyRelatedUserFilter = useMemo(
    () => resolveT0RelatedUserFilter(
      historyRelatedUserFilterIds,
      referralDescendantsByRootUserId,
      referralDataLoaded,
    ),
    [historyRelatedUserFilterIds, referralDataLoaded, referralDescendantsByRootUserId],
  );
  const historyProfitShareBeneficiaryEntryIds = useMemo(() => {
    const entryIds = new Set<string>();
    if (isMemberView || historyRelatedUserFilterIds.length === 0 || historyRelatedUserFilter.waitingForReferralData) return entryIds;
    for (const snapshot of profitShareSnapshots) {
      if (snapshot.percentage <= 0 || !historyRelatedUserFilter.userIds.has(String(snapshot.beneficiaryUserId))) continue;
      entryIds.add(snapshot.openingEntryId);
      entryIds.add(snapshot.entryId);
    }
    return entryIds;
  }, [historyRelatedUserFilter, historyRelatedUserFilterIds.length, isMemberView, profitShareSnapshots]);
  const journalScopeTrades = useMemo(
    () => historyMemberIncomeSourceScopedTrades.filter((trade) => (
      trade.symbol === "ETH"
      && (historyUsesIncomeCategories || historyAccountFilterIds.length === 0 || historyAccountFilterIds.includes(trade.accountId))
      // 用户呈现已在源数据层严格按本人/分层快照过滤，不能再套用管理员的用户、推荐或账户筛选。
      && (historyUsesIncomeCategories
        || isHistoryUserPerspective
        || isMemberView
        || historyRelatedUserFilterIds.length === 0
        || historyRelatedUserFilter.waitingForReferralData
        || (historyRelatedUserFilter.includesUnlinked && (!trade.relatedUserId || trade.relatedUserHidden))
        || Boolean(trade.relatedUserId && historyRelatedUserFilter.userIds.has(trade.relatedUserId))
        || Boolean(trade.profitShareBeneficiaryUserId && historyRelatedUserFilter.userIds.has(trade.profitShareBeneficiaryUserId))
        || Boolean(isMemberView && trade.sharedIncomeRecipientUserId)
        || (!isMemberView && historyProfitShareBeneficiaryEntryIds.has(getStoredEntryId(trade))))
      && (historyUsesIncomeCategories || historyRelatedFundFilterIds.length === 0
        || historyRelatedFundFilterIds.some((id) => id === "unclassified" ? (!trade.relatedFundId || trade.relatedFundHidden) : trade.relatedFundId === id))
    )),
    [historyMemberIncomeSourceScopedTrades, historyUsesIncomeCategories, isHistoryUserPerspective, isMemberView, historyAccountFilterIds, historyProfitShareBeneficiaryEntryIds, historyRelatedUserFilter, historyRelatedUserFilterIds, historyRelatedFundFilterIds],
  );
  const isHistoryMemberIncomeSourceFilterActive = historyUsesIncomeCategories
    && (!historyIncomeKindsAllSelected || historyIncomeSourceFilterIds.length > 0)
    && (historyIncomeKindFilterIds.length > 0 || historyIncomeSourceFilterIds.length > 0);
  // 来源筛选打开时，具名分佣的开仓只作为 FIFO 计算基底，不作为用户历史行显示。
  const historyDisplayScopeTrades = useMemo(
    () => isHistoryMemberIncomeSourceFilterActive
      ? journalScopeTrades.filter((trade) => !ACTIONS[trade.action].opening)
      : journalScopeTrades,
    [isHistoryMemberIncomeSourceFilterActive, journalScopeTrades],
  );
  const availableJournalActions = useMemo(
    // 收益分类下的开仓只作为 FIFO 计算基底；动作栏仍需从同一授权范围识别并保留开多、开空入口。
    () => RECENT_JOURNAL_ACTIONS.filter((action) => (historyUsesIncomeCategories ? historyPerspectiveTrades : historyDisplayScopeTrades)
      .some((trade) => trade.action === action)),
    [historyDisplayScopeTrades, historyPerspectiveTrades, historyUsesIncomeCategories],
  );
  const availableJournalActionKey = availableJournalActions.join("|");
  const hasSharedIncomeHistory = useMemo(
    () => historyDisplayScopeTrades.some((trade) => Number(trade.sharedIncomeAmount || 0) > 0),
    [historyDisplayScopeTrades],
  );
  const recentJournalTrades = useMemo(
    () => showLinkedJournalGroups
      ? journalScopeTrades
      : showOnlySharedIncomeHistory
        ? historyDisplayScopeTrades.filter((trade) => Number(trade.sharedIncomeAmount || 0) > 0)
        : historyDisplayScopeTrades.filter((trade) => journalActionFilters.has(trade.action)),
    [historyDisplayScopeTrades, journalActionFilters, journalScopeTrades, showLinkedJournalGroups, showOnlySharedIncomeHistory],
  );
  /**
   * 同一来源平仓若同时给当前呈现用户带来分佣和共享，历史页将其拆成两行：
   * 分佣行与共享行均保留同一真实来源键；这只是读取后的视觉投影，不新增任何账本流水。
   */
  const historyDisplayTrades = useMemo(() => recentJournalTrades.flatMap((trade) => {
    const sharedIncomeAmount = Math.max(0, Number(trade.sharedIncomeAmount || 0));
    const isSingleUserIncomePresentation = historyIsMemberPresentation || selectedAdminHistoryUserId > 0;
    const shouldSplitMixedIncome = isSingleUserIncomePresentation
      && !ACTIONS[trade.action].opening
      && sharedIncomeAmount > 0
      && Boolean(trade.profitShareBeneficiaryUserId);
    const commissionDisplayTrade: PreviewTrade = {
      ...trade,
      id: `history-commission-${trade.id}`,
      sourceEntryId: getStoredEntryId(trade),
      detailEntryId: getDetailEntryId(trade),
      sharedIncomeRecipientUserId: undefined,
      sharedIncomeAmount: undefined,
      historyIncomeKind: "commission",
    };
    const sharedDisplayTrade: PreviewTrade = {
      ...trade,
      id: `history-shared-${trade.id}`,
      sourceEntryId: getStoredEntryId(trade),
      detailEntryId: getDetailEntryId(trade),
      historyIncomeKind: "shared",
    };
    if (!isHistoryMemberIncomeSourceFilterActive) {
      if (!shouldSplitMixedIncome) return [trade];
      return showOnlySharedIncomeHistory ? [sharedDisplayTrade] : [commissionDisplayTrade, sharedDisplayTrade];
    }

    // 筛选的开仓只用于上方已经完成的 FIFO 计算，不能作为用户收入历史展示。
    if (ACTIONS[trade.action].opening) return [];
    const viewerUserId = historyIncomeViewerUserId;
    const sourceUserId = Number(trade.relatedUserId || 0);
    const hasCommissionRelationship = Number(trade.profitShareBeneficiaryUserId || 0) === viewerUserId
      && sourceUserId > 0
      && sourceUserId !== viewerUserId;
    const selectedKindIds = new Set(historyIncomeKindFilterIds);
    const selectedSourceIds = new Set(historyIncomeSourceFilterIds);
    const sourceIsSelected = selectedSourceIds.size === 0 || selectedSourceIds.has(String(sourceUserId));
    const allowOrder = selectedKindIds.size === 0 || selectedKindIds.has("order");
    const allowCommission = selectedKindIds.size === 0 || selectedKindIds.has("commission");
    const allowShared = selectedKindIds.size === 0 || selectedKindIds.has("shared");
    const isOwnOrder = sourceUserId === viewerUserId;
    if (isOwnOrder) {
      return selectedSourceIds.size === 0 && allowOrder && !showOnlySharedIncomeHistory ? [trade] : [];
    }
    const showCommission = hasCommissionRelationship
      && sourceIsSelected
      && allowCommission
      && !showOnlySharedIncomeHistory;
    const showNamedShared = hasCommissionRelationship
      && sharedIncomeAmount > 0
      && sourceIsSelected
      && allowShared;
    if (hasCommissionRelationship) {
      if (shouldSplitMixedIncome) {
        return [
          ...(showCommission ? [commissionDisplayTrade] : []),
          ...(showNamedShared ? [sharedDisplayTrade] : []),
        ];
      }
      return showCommission ? [trade] : [];
    }
    const showSharedOnly = Number(trade.sharedIncomeRecipientUserId || 0) === viewerUserId
      && sharedIncomeAmount > 0
      && selectedSourceIds.size === 0
      && allowShared;
    return showSharedOnly ? [trade] : [];
  }), [historyIncomeKindFilterIds, historyIncomeSourceFilterIds, historyIncomeViewerUserId, historyIsMemberPresentation, isHistoryMemberIncomeSourceFilterActive, recentJournalTrades, selectedAdminHistoryUserId, showOnlySharedIncomeHistory]);
  const linkedJournalGroups = useMemo(
    () => buildLinkedJournalGroups(journalScopeTrades),
    [journalScopeTrades],
  );
  const hasLinkedJournalPairs = useMemo(
    () => linkedJournalGroups.some((group) => (
      (Boolean(group.opening) && group.closings.length > 0)
      || (!group.opening && Number(group.closings[0]?.trade.sharedIncomeAmount || 0) > 0)
    )),
    [linkedJournalGroups],
  );
  useEffect(() => {
    setJournalActionFilters((current) => {
      const availableSet = new Set(availableJournalActions);
      const validCurrent = new Set(Array.from(current).filter((action) => availableSet.has(action)));
      if (validCurrent.size === 0 && availableJournalActions.length > 0) {
        return new Set(availableJournalActions);
      }
      if (validCurrent.size === current.size) return current;
      return validCurrent;
    });
  }, [availableJournalActionKey]);
  useEffect(() => {
    if (!hasLinkedJournalPairs && showLinkedJournalGroups) {
      setShowLinkedJournalGroups(false);
    }
  }, [hasLinkedJournalPairs, showLinkedJournalGroups]);
  const recentJournalTradeDetails = useMemo(() => buildRecentJournalTradeDetails(trades), [trades]);
  const historyPerspectiveTradeDetails = useMemo(
    () => buildRecentJournalTradeDetails(historyPerspectiveTrades),
    [historyPerspectiveTrades],
  );
  // 顶部类型筛选会将平仓投影为“对应开仓类型的数量切片”。先在当前历史范围内重建一次
  // 明细，可保证合约/现货/期权的开平仓在任意组合筛选下都用同一条切片收益展示；
  // 原始流水映射保留为历史异常记录的兜底。
  const scopedRecentJournalTradeDetails = useMemo(
    () => buildRecentJournalTradeDetails(journalScopeTrades),
    [journalScopeTrades],
  );
  const getHistoricalTradeDetail = useCallback((trade: PreviewTrade) => (
    scopedRecentJournalTradeDetails.get(trade.id)
    ?? scopedRecentJournalTradeDetails.get(getDetailEntryId(trade))
    ?? (isHistoryUserPerspective
      ? historyPerspectiveTradeDetails.get(getDetailEntryId(trade))
      : recentJournalTradeDetails.get(getDetailEntryId(trade)))
  ), [historyPerspectiveTradeDetails, isHistoryUserPerspective, recentJournalTradeDetails, scopedRecentJournalTradeDetails]);
  const getTradeAccountName = (trade: PreviewTrade) => trade.accountHidden
    ? "未关联账户"
    : trade.accountName
    || accounts.find((account) => account.id === trade.accountId)?.name
    || "未命名账户";
  const getTradeRelatedUserName = (trade: PreviewTrade) => trade.relatedUserHidden
    ? "未关联用户"
    : trade.relatedUserName
    || trade.relatedUsername
    || (trade.relatedUserId ? `用户#${trade.relatedUserId}` : "未关联用户");
  const getTradeRelatedFundName = (trade: PreviewTrade) => trade.relatedFundHidden
    ? "未关联项目"
    : trade.relatedFundName
      || (trade.relatedFundId ? `专项款#${trade.relatedFundId}` : "未区分专项款（历史） ");
  const memberViewerRelatedUserId = Number(activeJournalData?.viewerRelatedUserId || 0);
  const viewerProfitShareBeneficiaryUserId = Number(
    activeJournalData?.viewerProfitShareBeneficiaryUserId
      || memberViewerRelatedUserId
      || 0,
  );
  /**
   * 成员呈现始终展示该用户本单可得；管理员“全部”视图展示完整订单的总净利润。
   * 管理员仅在明确筛选单一用户时，才显示该用户的实际可得；不能把订单关联用户
   * 或当前登录管理员自动误当作受益人。点击总净利润可展开全部分佣明细。
  */
  const resolveMemberPayout = useCallback((
    trade: PreviewTrade,
    displayedNetPnlInput: number | undefined,
    viewerUserId: number,
    viewerTrades: PreviewTrade[],
  ) => {
    const displayedNetPnl = Number(displayedNetPnlInput);
    if (!Number.isInteger(viewerUserId) || viewerUserId <= 0) return null;
    const sharedIncomeAmount = Number(trade.sharedIncomeRecipientUserId) === viewerUserId
      ? Math.max(0, Number(trade.sharedIncomeAmount) || 0)
      : 0;
    // 历史页“共享”展示行仅显示实际共享款，不再把同来源的常规分佣合并进去。
    if (trade.historyIncomeKind === "shared") {
      return sharedIncomeAmount > 0 ? { netPnl: sharedIncomeAmount, isProfitShared: true } : null;
    }
    // 纯共享受益人没有原订单的成本明细，但仍应在同一来源平仓单中看到自己的已到账金额。
    if (!Number.isFinite(displayedNetPnl)) {
      return sharedIncomeAmount > 0 ? { netPnl: sharedIncomeAmount, isProfitShared: true } : null;
    }
    // 分层受益人的流水已在成员投影时完成数量、手续费与净收益的折算。
    if (trade.profitShareBeneficiaryUserId) {
      return {
        netPnl: displayedNetPnl * getRegularDistributionScale(getStoredEntryId(trade), sharedIncomeReductionsByClosingEntryId) + sharedIncomeAmount,
        isProfitShared: true,
      };
    }
    const allocations = buildClosingProfitShareDistribution({
      trades: viewerTrades,
      snapshots: profitShareSnapshots,
      closing: trade,
      displayedNetPnl,
      sharedIncomeReductions: sharedIncomeReductionsByClosingEntryId,
    });
    if (allocations.length === 0) {
      return Number(trade.relatedUserId || 0) === viewerUserId
        ? { netPnl: getRegularDistributableNetPnl(displayedNetPnl, getStoredEntryId(trade), sharedIncomeReductionsByClosingEntryId) + sharedIncomeAmount, isProfitShared: true }
        : (sharedIncomeAmount > 0 ? { netPnl: sharedIncomeAmount, isProfitShared: true } : null);
    }
    const allocation = allocations.find((item) => item.beneficiaryUserId === viewerUserId);
    return { netPnl: (allocation?.netPnl ?? 0) + sharedIncomeAmount, isProfitShared: true };
  }, [profitShareSnapshots, sharedIncomeReductionsByClosingEntryId]);
  const resolveDisplayedPayout = useCallback((trade: PreviewTrade, displayedNetPnlInput: number | undefined) => {
    const displayedNetPnl = Number(displayedNetPnlInput);
    if (isMemberView) {
      return resolveMemberPayout(trade, displayedNetPnl, viewerProfitShareBeneficiaryUserId, trades);
    }
    if (selectedAdminHistoryUserId <= 0) return null;
    // 管理员单选用户与用户本人视角必须复用同一归属函数：共享到账不能只在用户端出现。
    return resolveMemberPayout(trade, displayedNetPnl, selectedAdminHistoryUserId, trades);
  }, [isMemberView, resolveMemberPayout, selectedAdminHistoryUserId, trades, viewerProfitShareBeneficiaryUserId]);
  const resolveViewerPayout = useCallback((trade: PreviewTrade, detail?: RecentJournalTradeDetail) => {
    return resolveDisplayedPayout(trade, detail?.netPnl);
  }, [resolveDisplayedPayout]);
  const resolveHistoryViewerPayout = useCallback((trade: PreviewTrade, detail?: RecentJournalTradeDetail) => {
    if (isHistoryUserPerspective) {
      return resolveMemberPayout(
        trade,
        detail?.netPnl,
        historyPerspectiveTargetUserId,
        historyPerspectiveTrades,
      );
    }
    return resolveViewerPayout(trade, detail);
  }, [historyPerspectiveTargetUserId, historyPerspectiveTrades, isHistoryUserPerspective, resolveMemberPayout, resolveViewerPayout]);
  /**
   * 共享收益平仓预览：所有已登记投入的关联用户都可参与；仍有未平仓位的用户额外显示持仓参考。
   * 任意正向净收益订单都可先分配共享收益，剩余部分再按该订单的既有快照结算。
   */
  const sharedIncomeClosePreviewBaseline = useMemo<SharedIncomeClosePreview>(() => {
    const activeTakeProfitPlan = takeProfitAllocationPlanIndex === null
      ? null
      : entryForm.takeProfitPlans[takeProfitAllocationPlanIndex] ?? null;
    const isTakeProfitAllocationPreview = Boolean(activeTakeProfitPlan && ACTIONS[entryForm.action].opening);
    const closeQuantity = Number(normalizeEthQuantity(isTakeProfitAllocationPreview ? activeTakeProfitPlan!.quantity : entryForm.quantity));
    const closePrice = Number(isTakeProfitAllocationPreview ? activeTakeProfitPlan!.price : entryForm.price);
    const sourceUserId = Number(entryForm.relatedUserId);
    // 共享收益的候选仓位、已平盈亏与 XIRR 只认可现货和合约；期权、网格一律不计入。
    const isEligibleSharedIncomeInstrument = (instrumentType: T0InstrumentType | undefined) => instrumentType === "spot" || instrumentType === "contract";
    const isManualClosePreview = closeConfirmationStep === "review" && !ACTIONS[entryForm.action].opening;
    const previewSnapshotKey = [
      isTakeProfitAllocationPreview ? "take-profit" : isManualClosePreview ? "manual-close" : "inactive",
      takeProfitAllocationPlanIndex ?? "",
      entryForm.action,
      entryForm.accountId,
      entryForm.editingEntryId ?? "",
      entryForm.instrumentType ?? "",
      entryForm.quantity,
      entryForm.price,
      entryForm.relatedUserId,
      entryForm.relatedFundId,
      entryForm.targetPrice ?? "",
      activeTakeProfitPlan?.quantity ?? "",
      activeTakeProfitPlan?.price ?? "",
      closingSourceTrade ? getStoredEntryId(closingSourceTrade) : "",
      sharedIncomePreviewMarkPrice ?? "",
    ].join("|");
    if (!canManage || (!isManualClosePreview && !isTakeProfitAllocationPreview)
      || !isEligibleSharedIncomeInstrument(entryForm.instrumentType)
      || !Number.isFinite(closeQuantity) || closeQuantity <= 0 || !Number.isFinite(closePrice) || closePrice <= 0
      || !Number.isInteger(sourceUserId) || sourceUserId <= 0) {
      return { sourceNetPnl: 0, shareableAmount: 0, candidates: [] as SharedIncomeCandidate[] };
    }
    const cachedSnapshot = sharedIncomeClosePreviewSnapshotRef.current;
    if (cachedSnapshot?.key === previewSnapshotKey) return cachedSnapshot.preview;
    // 与最终提交一致：管理员反向展示下的“平空/平多”仅是视觉方向，FIFO 与盈亏必须使用原始流水方向。
    const previewAction: TradeAction = isTakeProfitAllocationPreview
      ? (entryForm.action === "openLong" ? "closeLong" : "closeShort")
      : closingSourceTrade?.isCounterpartyView
        ? invertTradeAction(entryForm.action)
        : entryForm.action;
    const openingArchivePrice = archivePriceForSide(ACTIONS[entryForm.action].side, Number(entryForm.price));
    // FIFO 按活动时间排序；止盈预览的虚拟开仓必须先于虚拟平仓，不能同毫秒后被字符串 ID 排序倒置。
    const takeProfitPreviewTimestamp = Date.now();
    const syntheticOpening: PreviewTrade | null = isTakeProfitAllocationPreview ? {
      id: "take-profit-shared-income-opening-preview",
      accountId: entryForm.accountId,
      relatedUserId: String(sourceUserId),
      relatedFundId: entryForm.relatedFundId && entryForm.relatedFundId !== "legacy" ? entryForm.relatedFundId : undefined,
      symbol: "ETH",
      action: entryForm.action,
      instrumentType: entryForm.instrumentType,
      quantity: Number(normalizeEthQuantity(entryForm.quantity)),
      price: Number(entryForm.price),
      fee: Number(normalizeEthQuantity(entryForm.quantity)) * Number(entryForm.price) * OKX_VIP2_TAKER_FEE_RATE,
      createdAt: new Date(takeProfitPreviewTimestamp - 1).toISOString(),
      targetPrice: openingArchivePrice,
    } : null;
    const syntheticClosing: PreviewTrade = {
      id: isTakeProfitAllocationPreview ? "take-profit-shared-income-close-preview" : "shared-income-close-preview",
      accountId: entryForm.accountId,
      relatedUserId: String(sourceUserId),
      relatedFundId: entryForm.relatedFundId && entryForm.relatedFundId !== "legacy" ? entryForm.relatedFundId : undefined,
      symbol: "ETH",
      action: previewAction,
      quantity: closeQuantity,
      price: closePrice,
      fee: closeQuantity * closePrice * OKX_VIP2_TAKER_FEE_RATE,
      createdAt: new Date(takeProfitPreviewTimestamp).toISOString(),
      targetPrice: isTakeProfitAllocationPreview ? openingArchivePrice : entryForm.targetPrice,
      targetOpeningEntryId: isTakeProfitAllocationPreview
        ? "take-profit-shared-income-opening-preview"
        : entryForm.targetOpeningEntryId,
    };
    const allTrades = [
      ...trades.filter((trade) => !trade.isSyncing && (!isTakeProfitAllocationPreview || getStoredEntryId(trade) !== entryForm.editingEntryId)),
      ...(syntheticOpening ? [syntheticOpening] : []),
      syntheticClosing,
    ];
    const allocations = buildOpeningClosingAllocations(allTrades);
    const managerUserId = Number((me as any)?.id || 0);
    // 市场参与贡献采用独立、可追溯的订单口径：所有开仓均算一笔，现货/合约/期权/网格、
    // 已成交/当前挂单全部包含；多空绝不抵消。回退或删除记录已不在权威trades集合中，天然排除。
    const openingOrderCountByUser = new Map<string, number>();
    for (const trade of trades) {
      if (!ACTIONS[trade.action].opening || !trade.relatedUserId) continue;
      const userId = String(trade.relatedUserId);
      openingOrderCountByUser.set(userId, (openingOrderCountByUser.get(userId) || 0) + 1);
    }
    let sourceNetPnl = 0;
    for (const opening of allTrades) {
      if (!ACTIONS[opening.action].opening || !isEligibleSharedIncomeInstrument(opening.instrumentType)) continue;
      const matched = (allocations.get(opening.id) || []).filter((allocation) => allocation.trade.id === syntheticClosing.id);
      if (matched.length === 0) continue;
      for (const allocation of matched) {
        const netPnl = Number(buildLinkedClosingDetail(opening, allocation).netPnl || 0);
        sourceNetPnl += netPnl;
      }
    }
    const candidateByUser = new Map<string, { userId: string; name: string; username?: string; remainingQuantity: number; longQuantity: number; shortQuantity: number; firstOpenedAt: string; basis: number; unrealizedPnl: number }>();
    const closedNetPnlByUser = new Map<string, number>();
    const closedLossPnlByUser = new Map<string, number>();
    const lastSettlementDateByUser = new Map<string, string>();
    const recordHistoricalPnl = (relatedUserId: string | number, amount: number) => {
      if (!relatedUserId || !Number.isFinite(amount) || Math.abs(amount) <= 0.000001) return;
      const userId = String(relatedUserId);
      if (amount > 0) {
        closedNetPnlByUser.set(userId, (closedNetPnlByUser.get(userId) || 0) + amount);
      } else {
        closedLossPnlByUser.set(userId, (closedLossPnlByUser.get(userId) || 0) + Math.abs(amount));
      }
    };
    const recordSettlementDate = (relatedUserId: string | number, settledOn: string) => {
      if (!relatedUserId || getT0CalendarDateUtc(settledOn) === null) return;
      const userId = String(relatedUserId);
      const previousSettlementDate = lastSettlementDateByUser.get(userId);
      if (!previousSettlementDate || settledOn.localeCompare(previousSettlementDate) > 0) {
        lastSettlementDateByUser.set(userId, settledOn);
      }
    };
    const historicalClosingAllocations = buildOpeningClosingAllocations(trades);
    const handledHistoricalClosingIds = new Set<string>();
    // 平仓流水历史上没有可靠的 instrumentType；必须从其 FIFO 配对的开仓单继承类型，不能直接按平仓行过滤。
    for (const opening of trades) {
      if (!ACTIONS[opening.action].opening || !isEligibleSharedIncomeInstrument(opening.instrumentType) || !opening.relatedUserId || opening.isPending) continue;
      for (const allocation of historicalClosingAllocations.get(opening.id) || []) {
        if (allocation.trade.isPending) continue;
        const settledOn = getBeijingDateInputValue(new Date(getTradeActivityTime(allocation.trade)));
        // 自己订单只要已平仓即属于结算，不以盈亏为条件。
        recordSettlementDate(opening.relatedUserId, settledOn);
        const closingEntryId = getStoredEntryId(allocation.trade);
        if (handledHistoricalClosingIds.has(closingEntryId)) continue;
        handledHistoricalClosingIds.add(closingEntryId);
        const netPnl = Number(recentJournalTradeDetails.get(allocation.trade.id)?.netPnl);
        if (!Number.isFinite(netPnl)) continue;
        const distributions = buildClosingProfitShareDistribution({
          trades,
          snapshots: profitShareSnapshots,
          closing: allocation.trade,
          displayedNetPnl: netPnl,
          sharedIncomeReductions: sharedIncomeReductionsByClosingEntryId,
          allocationsByOpening: historicalClosingAllocations,
        });
        if (distributions.length === 0) {
          const regularNetPnl = getRegularDistributableNetPnl(netPnl, closingEntryId, sharedIncomeReductionsByClosingEntryId);
          recordHistoricalPnl(opening.relatedUserId, regularNetPnl);
          continue;
        }
        for (const distribution of distributions) {
          const beneficiaryUserId = String(distribution.beneficiaryUserId);
          recordHistoricalPnl(beneficiaryUserId, distribution.netPnl);
          recordSettlementDate(beneficiaryUserId, settledOn);
        }
      }
    }
    // 共享收益到账同样属于一次结算；只为实际受益人重置计时。
    for (const transfer of sharedIncomeTransfers) {
      if (!Number.isFinite(Number(transfer.amount)) || Number(transfer.amount) <= 0) continue;
      recordSettlementDate(transfer.recipientUserId, getBeijingDateInputValue(new Date(transfer.createdAt)));
    }
    const now = Date.now();
    for (const opening of trades) {
      if (!ACTIONS[opening.action].opening || !isEligibleSharedIncomeInstrument(opening.instrumentType) || opening.isPending || !opening.relatedUserId || opening.relatedUserId === String(sourceUserId) || opening.relatedUserId === String(managerUserId)) continue;
      // 历史候选统计与结算日期已经使用同一份 FIFO；不能为每一笔开仓再次全量重算。
      const closingQuantity = (historicalClosingAllocations.get(opening.id) || []).reduce((total, allocation) => total + allocation.quantity, 0);
      const remainingQuantity = Math.max(0, opening.quantity - closingQuantity);
      if (remainingQuantity <= 0.000001) continue;
      const current = candidateByUser.get(opening.relatedUserId) || {
        userId: opening.relatedUserId,
        name: opening.relatedUserName || opening.relatedUsername || `用户#${opening.relatedUserId}`,
        username: opening.relatedUsername,
        remainingQuantity: 0,
        longQuantity: 0,
        shortQuantity: 0,
        firstOpenedAt: opening.createdAt,
        basis: 0,
        unrealizedPnl: 0,
      };
      const markPrice = sharedIncomePreviewMarkPrice ?? opening.price;
      const gross = ACTIONS[opening.action].side === "long"
        ? (markPrice - opening.price) * remainingQuantity
        : (opening.price - markPrice) * remainingQuantity;
      const estimatedFee = opening.price * remainingQuantity * OKX_VIP2_TAKER_FEE_RATE * 2;
      current.remainingQuantity += remainingQuantity;
      if (ACTIONS[opening.action].side === "long") current.longQuantity += remainingQuantity;
      else current.shortQuantity += remainingQuantity;
      current.basis += opening.price * remainingQuantity;
      current.unrealizedPnl += gross - estimatedFee;
      if (opening.createdAt < current.firstOpenedAt) current.firstOpenedAt = opening.createdAt;
      candidateByUser.set(opening.relatedUserId, current);
    }
    // 已有入金但当前没有未平仓位的历史用户也应可参与共享收益分配；
    // 其持仓相关数值归零，仅保留资金、已实现收益与年化参考。
    for (const [userId, cumulativeDepositAmount] of payoutDepositAmountByRelatedUser) {
      if (cumulativeDepositAmount <= 0 || userId === String(sourceUserId) || userId === String(managerUserId) || candidateByUser.has(userId)) continue;
      const identity = payoutDepositorIdentityByRelatedUser.get(userId);
      const firstDepositDate = (payoutCashFlowsByRelatedUser.get(userId) || [])
        .filter((cashFlow) => cashFlow.direction === "deposit")
        .map((cashFlow) => cashFlow.occurredOn)
        .filter((occurredOn) => getT0CalendarDateUtc(occurredOn) !== null)
        .sort()[0];
      candidateByUser.set(userId, {
        userId,
        name: identity?.name || `用户#${userId}`,
        username: identity?.username,
        remainingQuantity: 0,
        longQuantity: 0,
        shortQuantity: 0,
        firstOpenedAt: firstDepositDate ? `${firstDepositDate}T00:00:00.000+08:00` : new Date(now).toISOString(),
        basis: 0,
        unrealizedPnl: 0,
      });
    }
    const candidates = Array.from(candidateByUser.values()).map((candidate) => {
      const heldDays = Math.max(1, Math.floor((now - new Date(candidate.firstOpenedAt).getTime()) / 86_400_000) + 1);
      const lastSettlementDate = lastSettlementDateByUser.get(candidate.userId);
      const settlementTimestamp = lastSettlementDate
        ? getT0CalendarDateUtc(lastSettlementDate)
        : null;
      const currentSettlementTimestamp = getT0CalendarDateUtc(getBeijingDateInputValue(new Date(now)));
      // 按北京时间自然日计数：今天结算为 0 天，次日无结算为 1 天未结算。
      const settlementAgeDays = settlementTimestamp !== null && currentSettlementTimestamp !== null
        ? Math.max(0, Math.floor((currentSettlementTimestamp - settlementTimestamp) / 86_400_000))
        : null;
      const cumulativeDepositAmount = payoutDepositAmountByRelatedUser.get(candidate.userId) || 0;
      const userCashFlows = payoutCashFlowsByRelatedUser.get(candidate.userId) || [];
      const cumulativeWithdrawalAmount = userCashFlows
        .filter((cashFlow) => cashFlow.direction === "withdrawal")
        .reduce((total, cashFlow) => total + cashFlow.amount, 0);
	      const withdrawalProgressPercentage = cumulativeDepositAmount > 0
	        ? Math.max(0, cumulativeWithdrawalAmount / cumulativeDepositAmount * 100)
	        : null;
	      const receivedSharedIncomeTransfers = sharedIncomeTransfers
	        .filter((transfer) => transfer.recipientUserId === Number(candidate.userId));
	      const receivedSharedIncome = receivedSharedIncomeTransfers
	        .reduce((total, transfer) => total + transfer.amount, 0);
	      const contribution = sharedIncomeContributionsBySourceUser.get(candidate.userId) || { amount: 0, orderCount: 0 };
      // 已结算年化口径：只计实际投入/提现、已平订单收益及既得共享收益；当前持仓浮盈亏仅展示参考，不计入年化。
      const closedNetPnl = closedNetPnlByUser.get(candidate.userId) || 0;
	      const closedLossPnl = closedLossPnlByUser.get(candidate.userId) || 0;
      const currentNetValue = cumulativeDepositAmount + closedNetPnl + receivedSharedIncome - cumulativeWithdrawalAmount;
      const realizedCashFlows: T0XirrCashFlow[] = [
        ...userCashFlows.map((cashFlow) => ({
          occurredOn: cashFlow.occurredOn,
          amount: cashFlow.direction === "deposit" ? -cashFlow.amount : cashFlow.amount,
        })),
      ];
      const annualizedReference = calculateT0Xirr([
        ...realizedCashFlows,
        { occurredOn: getBeijingDateInputValue(), amount: currentNetValue, atEndOfBeijingDay: true },
      ]);
	      return {
	        ...candidate,
	        cumulativeDepositAmount,
	        withdrawalProgressPercentage,
	        hasPrincipal: cumulativeDepositAmount > 0,
	        holdingNetPnl: candidate.unrealizedPnl,
        closedNetPnl,
        closedLossPnl,
        historicalProfit: closedNetPnl + receivedSharedIncome,
        // 资格开关不参与本次重型快照计算；在下方依订单使用者轻量覆盖。
        sharedIncomeEnabled: true,
	        receivedSharedIncome,
        receivedSharedIncomeCount: receivedSharedIncomeTransfers.length,
        contributedSharedIncome: contribution.amount,
        contributedSharedIncomeOrderCount: contribution.orderCount,
        openingOrderCount: openingOrderCountByUser.get(candidate.userId) || 0,
        realizedCashFlows,
        realizedTerminalValue: currentNetValue,
        heldDays,
        settlementAgeDays,
        annualizedReference,
        annualizedTargetTopUps: [3.65, 1, 0.52, 1.04].map((targetRate) => ({
          targetRate,
          topUp: calculateT0XirrTargetTopUp(realizedCashFlows, currentNetValue, targetRate),
        })),
      };
	    }).sort((left, right) => Number(right.sharedIncomeEnabled) - Number(left.sharedIncomeEnabled) || right.receivedSharedIncomeCount - left.receivedSharedIncomeCount || Number(right.hasPrincipal) - Number(left.hasPrincipal) || (left.annualizedReference ?? Number.POSITIVE_INFINITY) - (right.annualizedReference ?? Number.POSITIVE_INFINITY) || right.heldDays - left.heldDays);
    const preview = {
      sourceNetPnl,
      shareableAmount: Math.floor((Math.max(0, sourceNetPnl) + 1e-9) * 100) / 100,
      candidates,
    };
    sharedIncomeClosePreviewSnapshotRef.current = { key: previewSnapshotKey, preview };
    return preview;
  }, [canManage, closeConfirmationStep, closingSourceTrade, entryForm.action, entryForm.accountId, entryForm.editingEntryId, entryForm.instrumentType, entryForm.price, entryForm.quantity, entryForm.relatedFundId, entryForm.relatedUserId, entryForm.takeProfitPlans, entryForm.targetPrice, me, payoutCashFlowsByRelatedUser, payoutDepositAmountByRelatedUser, payoutDepositorIdentityByRelatedUser, profitShareSnapshots, recentJournalTradeDetails, sharedIncomeContributionsBySourceUser, sharedIncomeReductionsByClosingEntryId, sharedIncomeTransfers, sharedIncomePreviewMarkPrice, takeProfitAllocationPlanIndex, trades]);
  // 开关即时生效，但只替换候选人的一个布尔字段，不再重新扫描历史流水、FIFO 和 XIRR。
  const sharedIncomeClosePreview = useMemo<SharedIncomeClosePreview>(() => {
    const sourceUserId = Number(entryForm.relatedUserId);
    if (!Number.isInteger(sourceUserId) || sourceUserId <= 0 || sharedIncomeClosePreviewBaseline.candidates.length === 0) {
      return sharedIncomeClosePreviewBaseline;
    }
    return {
      ...sharedIncomeClosePreviewBaseline,
      candidates: sharedIncomeClosePreviewBaseline.candidates.map((candidate) => {
        const key = `${sourceUserId}:${candidate.userId}`;
        const sharedIncomeEnabled = sharedIncomeEligibilityOverrides[key]
          ?? sharedIncomeEligibilityByPair.get(key)
          ?? true;
        return candidate.sharedIncomeEnabled === sharedIncomeEnabled
          ? candidate
          : { ...candidate, sharedIncomeEnabled };
      }).sort((left, right) => Number(right.sharedIncomeEnabled) - Number(left.sharedIncomeEnabled)),
    };
  }, [entryForm.relatedUserId, sharedIncomeClosePreviewBaseline, sharedIncomeEligibilityByPair, sharedIncomeEligibilityOverrides]);
	  const sharedIncomeBudget = useMemo(() => {
	    const maximum = Math.max(0, Math.floor((sharedIncomeClosePreview.shareableAmount + 1e-9) * 100) / 100);
	    const rawValue = sharedIncomeAllocationBudgetValue.trim();
	    const value = Number(rawValue);
	    if (!rawValue || !Number.isFinite(value) || value < 0) {
	      return { maximum, allocationLimit: 0, error: "请输入本次共享分配额度" };
	    }
	    if (sharedIncomeAllocationBudgetMode === "percentage") {
	      if (value < 1 || value > 100) return { maximum, allocationLimit: 0, error: "分配比例为1%至100%" };
	      return { maximum, allocationLimit: Math.floor((maximum * value + 1e-9)) / 100, error: null as string | null };
	    }
	    if (value - maximum > 0.00001) return { maximum, allocationLimit: 0, error: `分配金额不得超过本单可共享收益 ${maximum.toFixed(2)} u` };
	    return { maximum, allocationLimit: Math.floor((value + 1e-9) * 100) / 100, error: null as string | null };
	  }, [sharedIncomeAllocationBudgetMode, sharedIncomeAllocationBudgetValue, sharedIncomeClosePreview.shareableAmount]);
	  const sharedIncomeBudgetPercentage = sharedIncomeBudget.maximum > 0
	    ? (sharedIncomeBudget.allocationLimit / sharedIncomeBudget.maximum) * 100
	    : 0;
	  const sharedIncomeBudgetSliderPercentage = Math.min(99, Math.max(1, Math.round(
	    Number(sharedIncomeAllocationBudgetValue) || 1,
	  )));
	  const sharedIncomeAvailableAllocationDimensions = SHARED_INCOME_ALLOCATION_DIMENSIONS;
  const sharedIncomeSelectedDimensions = useMemo(() => sharedIncomeAvailableAllocationDimensions
    .filter((dimension) => sharedIncomeAllocationMetrics.includes(dimension.id)), [sharedIncomeAllocationMetrics]);
	  const sharedIncomeDimensionWeightPercentage = sharedIncomeSelectedDimensions.length > 0
	    ? 100 / sharedIncomeSelectedDimensions.length
	    : 0;
	  const sharedIncomeEligibleCandidateIds = useMemo(() => new Set(
	    sharedIncomeClosePreview.candidates
	      .filter((candidate) => candidate.hasPrincipal && candidate.sharedIncomeEnabled)
	      .map((candidate) => candidate.userId),
	  ), [sharedIncomeClosePreview.candidates]);
	  const sharedIncomeAllocatedTotal = useMemo(() => Array.from(sharedIncomeEligibleCandidateIds)
	    .reduce((total, recipientUserId) => total + (Number(sharedIncomeDrafts[recipientUserId]) || 0), 0), [sharedIncomeDrafts, sharedIncomeEligibleCandidateIds]);
	  const sharedIncomeSaveAllocations = useMemo(() => sharedIncomeClosePreview.candidates
	    .filter((candidate) => candidate.hasPrincipal && candidate.sharedIncomeEnabled)
	    .map((candidate) => ({ recipientUserId: Number(candidate.userId), amount: (Number(sharedIncomeDrafts[candidate.userId]) || 0).toFixed(2) }))
	    .filter((allocation) => Number.isInteger(allocation.recipientUserId) && allocation.recipientUserId > 0 && Number(allocation.amount) > 0), [sharedIncomeClosePreview.candidates, sharedIncomeDrafts]);
  const buildSharedIncomeAllocationPlan = useCallback((
    metrics: SharedIncomeAllocationMetric[],
    candidates: SharedIncomeCandidate[],
    allocationLimit: number,
    openingOrderCountIntensity: number,
  principalRule: SharedIncomePrincipalRule,
  ): { drafts: Record<string, string>; error: string | null } => {
	    const allocationLimitCents = Math.round(allocationLimit * 100);
	    const selectedDimensions = SHARED_INCOME_ALLOCATION_DIMENSIONS.filter((dimension) => metrics.includes(dimension.id));
	    if (allocationLimitCents <= 0 || selectedDimensions.length === 0) return { drafts: {}, error: null };
	    const eligibleCandidates = candidates.filter((candidate) => candidate.hasPrincipal && candidate.sharedIncomeEnabled);
	    // 协作回馈与两类共享补差都不能把任何有效成员排空：子池的20%均分保底，
	    // 其余80%才按对应指标倾斜。指标完全相同则自然退化为全员均分。
    const getSmoothedWeights = (scoredCandidates: Array<{ candidate: SharedIncomeCandidate; score: number }>, scoreShare = 0.8) => {
      if (scoredCandidates.length === 0) return [];
      const normalizedScores = scoredCandidates.map(({ candidate, score }) => ({ candidate, score: Math.max(0, Number.isFinite(score) ? score : 0) }));
      const totalScore = normalizedScores.reduce((total, item) => total + item.score, 0);
      if (totalScore <= 0.000001) return normalizedScores.map(({ candidate }) => ({ candidate, weight: 1 }));
      const normalizedScoreShare = Math.min(1, Math.max(0, Number(scoreShare) || 0));
      const equalFloorWeight = (1 - normalizedScoreShare) / normalizedScores.length;
      return normalizedScores.map(({ candidate, score }) => ({
        candidate,
        weight: equalFloorWeight + normalizedScoreShare * score / totalScore,
      }));
	    };
	    const getReceivedSharedIncomeGapWeights = (valueForCandidate: (candidate: SharedIncomeCandidate) => number) => {
	      const values = eligibleCandidates.map((candidate) => ({ candidate, value: Math.max(0, valueForCandidate(candidate)) }));
	      if (values.length === 0) return [];
	      const maximumValue = Math.max(...values.map((item) => item.value));
	      // 收到越少，补差分数越高；收到最多者仍通过全员保底获得本维度的一部分。
	      return getSmoothedWeights(values.map(({ candidate, value }) => ({ candidate, score: maximumValue - value })));
	    };
	    const getExternalShareContributionWeights = () => {
	      if (eligibleCandidates.length === 0) return [];
	      const totalContributedAmount = eligibleCandidates.reduce((total, candidate) => total + Math.max(0, candidate.contributedSharedIncome), 0);
	      const totalContributedOrderCount = eligibleCandidates.reduce((total, candidate) => total + Math.max(0, candidate.contributedSharedIncomeOrderCount), 0);
	      const activeFactorCount = Number(totalContributedAmount > 0.000001) + Number(totalContributedOrderCount > 0);
	      return getSmoothedWeights(eligibleCandidates.map((candidate) => ({
	        candidate,
	        score: (totalContributedAmount > 0.000001 ? candidate.contributedSharedIncome / totalContributedAmount / activeFactorCount : 0)
	          + (totalContributedOrderCount > 0 ? candidate.contributedSharedIncomeOrderCount / totalContributedOrderCount / activeFactorCount : 0),
	      })));
	    };
    const getWeightedCandidates = (metric: SharedIncomeAllocationMetric) => {
      if (metric === "externalShareContribution") return getExternalShareContributionWeights();
      if (metric === "receivedSharedAmountGap") return getReceivedSharedIncomeGapWeights((candidate) => candidate.receivedSharedIncome);
      if (metric === "receivedSharedCountGap") return getReceivedSharedIncomeGapWeights((candidate) => candidate.receivedSharedIncomeCount);
      if (metric === "openingOrderCount") {
        const totalOpeningOrderCount = eligibleCandidates.reduce((total, candidate) => total + Math.max(0, candidate.openingOrderCount), 0);
        const normalizedOpeningOrderCountIntensity = Math.min(100, Math.max(0, Number(openingOrderCountIntensity) || 0)) / 100;
        // 0% 明确表示本维度全员均分，即使暂时无人有开仓记录也可成立；只要存在按数量倾斜而又没有任何订单，才提示该维度无数据。
        if (totalOpeningOrderCount <= 0 && normalizedOpeningOrderCountIntensity > 0.000001) return [];
        // 倾斜度0%时本维度退化为全员均分；100%时完全依挂单数量比例。默认70%意味着30%均分保障。
        return getSmoothedWeights(
          eligibleCandidates.map((candidate) => ({ candidate, score: candidate.openingOrderCount })),
          normalizedOpeningOrderCountIntensity,
        );
      }      if (metric === "principal") {
        const influence = Math.min(100, Math.max(0, Number(principalRule.influencePercentage) || 0)) / 100;
        const exponent = getSharedIncomePrincipalCurveExponent(principalRule.curve);
        return getSmoothedWeights(eligibleCandidates.map((candidate) => ({
          candidate,
          score: Math.pow(Math.max(0, candidate.cumulativeDepositAmount), exponent),
        })), influence);
      }      if (metric === "withdrawalProgress") {
	        // 回款进度严格按用户设定的反向速度：提现占投入 1% 时权重 99，99% 时权重 1。
	        // 0% 提现维持最高 99 档；超过100%仍保留最低 1 档，不会把任何有效分配人排空。
	        return eligibleCandidates.map((candidate) => {
	          const withdrawalProgressPercentage = Math.max(0, Number(candidate.withdrawalProgressPercentage) || 0);
	          return {
	            candidate,
	            weight: Math.min(99, Math.max(1, 100 - withdrawalProgressPercentage)),
	          };
	        });
	      }
	      if (metric === "realizedAnnualized") {
	        const candidatesWithAnnualizedReturn = eligibleCandidates.filter((candidate) => candidate.annualizedReference !== null && Number.isFinite(candidate.annualizedReference));
	        if (candidatesWithAnnualizedReturn.length === 0) return [];
	        // 以所有有效人的已实现年化算术均值为目标。高于均值者在本维度权重为零；
	        // 低于均值者按达到该均值所需的实际金额作为权重，令结果朝共同年化收敛。
	        const averageAnnualizedReturn = candidatesWithAnnualizedReturn.reduce((total, candidate) => total + Number(candidate.annualizedReference), 0) / candidatesWithAnnualizedReturn.length;
	        return candidatesWithAnnualizedReturn.map((candidate) => {
	          const annualizedReference = Number(candidate.annualizedReference);
	          const topUp = annualizedReference < averageAnnualizedReturn - 0.000001
	            ? calculateT0XirrTargetTopUp(candidate.realizedCashFlows, candidate.realizedTerminalValue, averageAnnualizedReturn)
	            : 0;
	          return { candidate, weight: topUp === null ? 0 : topUp };
	        }).filter((item) => Number.isFinite(item.weight) && item.weight > 0.000001);
	      }
	      return eligibleCandidates.map((candidate) => ({
	        candidate,
	        weight: metric === "historicalProfit"
	            ? candidate.historicalProfit
	            : Math.max(0, -candidate.holdingNetPnl),
	      })).filter((item) => Number.isFinite(item.weight) && item.weight > 0.000001);
	    };
	    const weightedDimensions = selectedDimensions.map((dimension) => {
	      const weightedCandidates = getWeightedCandidates(dimension.id);
	      return { dimension, weightedCandidates, totalWeight: weightedCandidates.reduce((total, item) => total + item.weight, 0) };
	    });
	    const unavailableDimension = weightedDimensions.find(({ weightedCandidates, totalWeight }) => weightedCandidates.length === 0 || totalWeight <= 0.000001);
	    if (unavailableDimension) return { drafts: {}, error: unavailableDimension.dimension.emptyMessage };
	    const allocationByUserId = new Map<string, number>();
    const baseDimensionCents = Math.floor(allocationLimitCents / weightedDimensions.length);
    let dimensionRemainder = allocationLimitCents - baseDimensionCents * weightedDimensions.length;
	    for (const { dimension, weightedCandidates, totalWeight } of weightedDimensions) {
	      const receivesRemainderCent = dimensionRemainder > 0;
	      const dimensionCents = baseDimensionCents + (receivesRemainderCent ? 1 : 0);
	      if (receivesRemainderCent) dimensionRemainder -= 1;
      const guaranteesMinimumCents = (dimension.id === "externalShareContribution" || dimension.id === "receivedSharedAmountGap" || dimension.id === "receivedSharedCountGap" || dimension.id === "withdrawalProgress")
	        && dimensionCents >= weightedCandidates.length;
	      const equalMinimumCents = guaranteesMinimumCents ? 1 : 0;
	      const distributableCents = dimensionCents - equalMinimumCents * weightedCandidates.length;
	      const baseAllocations = weightedCandidates.map((item) => {
	        const exactCents = distributableCents * item.weight / totalWeight;
	        const cents = equalMinimumCents + Math.floor(exactCents);
	        return { userId: item.candidate.userId, cents, fraction: exactCents - cents };
	      });
	      let recipientRemainder = dimensionCents - baseAllocations.reduce((total, item) => total + item.cents, 0);
	      for (const item of [...baseAllocations].sort((left, right) => right.fraction - left.fraction || left.userId.localeCompare(right.userId))) {
	        if (recipientRemainder <= 0) break;
	        item.cents += 1;
	        recipientRemainder -= 1;
	      }
	      for (const item of baseAllocations) allocationByUserId.set(item.userId, (allocationByUserId.get(item.userId) || 0) + item.cents);
	    }
	    return {
	      drafts: Object.fromEntries([...allocationByUserId.entries()]
	        .filter(([, cents]) => cents > 0)
	        .map(([userId, cents]) => [userId, (cents / 100).toFixed(2)])),
	      error: null,
	    };
	  }, []);
	  useEffect(() => {
	    if (sharedIncomeAllocationMetrics.length === 0 || sharedIncomeBudget.error) return;
    const plan = buildSharedIncomeAllocationPlan(
      sharedIncomeAllocationMetrics,
      sharedIncomeClosePreview.candidates,
      sharedIncomeBudget.allocationLimit,
      sharedIncomeOpeningOrderCountIntensity,
      sharedIncomePrincipalRule,
    );
	    setSharedIncomeTargetSelections((current) => Object.keys(current).length === 0 ? current : {});
	    setSharedIncomeDrafts(plan.drafts);
	    setSharedIncomeAllocationPlanError(plan.error);
  }, [buildSharedIncomeAllocationPlan, sharedIncomeAllocationMetrics, sharedIncomeBudget.allocationLimit, sharedIncomeBudget.error, sharedIncomeClosePreview.candidates, sharedIncomeOpeningOrderCountIntensity, sharedIncomePrincipalRule]);
	  const toggleSharedIncomeAllocationMetric = (metric: SharedIncomeAllocationMetric) => {
	    setSharedIncomeTargetSelections({});
	    setSharedIncomeAllocationPlanError(null);
	    setSharedIncomeAllocationMetrics((current) => current.includes(metric)
	      ? current.filter((currentMetric) => currentMetric !== metric)
	      : [...current, metric]);
	  };
  const takeProfitSharedIncomeAllocatedTotal = useMemo(
    () => Object.values(takeProfitSharedIncomeDrafts).reduce((total, amount) => total + (Number(amount) || 0), 0),
    [takeProfitSharedIncomeDrafts],
  );
  const openTakeProfitAllocationPanel = (planIndex: number) => {
    const plan = entryForm.takeProfitPlans[planIndex];
    if (!plan) return;
    setTakeProfitSharedIncomeDrafts(
      Object.fromEntries((plan.sharedIncomeAllocations ?? []).map((allocation) => [String(allocation.recipientUserId), allocation.amount])),
    );
    setTakeProfitSharedIncomeTargetSelections({});
    setSharedIncomePreviewMarkPrice(markPrice);
    setTakeProfitAllocationPlanIndex(planIndex);
  };
  const closeTakeProfitAllocationPanel = () => {
    setTakeProfitAllocationPlanIndex(null);
    setTakeProfitSharedIncomeDrafts({});
    setTakeProfitSharedIncomeTargetSelections({});
    setSharedIncomePreviewMarkPrice(null);
  };
  const saveTakeProfitAllocationPlan = () => {
    if (takeProfitAllocationPlanIndex === null) return;
    if (takeProfitSharedIncomeAllocatedTotal - sharedIncomeClosePreview.shareableAmount > 0.00001) {
      t0Toast.error(`预分配合计不可超过预计可共享收益 ${sharedIncomeClosePreview.shareableAmount.toFixed(2)} u`);
      return;
    }
    const allocations = Object.entries(takeProfitSharedIncomeDrafts)
      .map(([recipientUserId, amount]) => ({ recipientUserId: Number(recipientUserId), amount: (Number(amount) || 0).toFixed(2) }))
      .filter((allocation) => Number.isInteger(allocation.recipientUserId) && allocation.recipientUserId > 0 && Number(allocation.amount) > 0);
    setEntryForm((current) => ({
      ...current,
      takeProfitPlans: current.takeProfitPlans.map((plan, index) => index === takeProfitAllocationPlanIndex
        ? { ...plan, sharedIncomeAllocations: allocations }
        : plan),
    }));
    closeTakeProfitAllocationPanel();
  };
  /** 手动平仓和止盈预分配共享同一候选人卡片、参考数据与快捷分配逻辑，只切换草案的保存目标。 */
  const renderSharedIncomeAllocationCandidates = (input: {
    drafts: Record<string, string>;
    setDrafts: Dispatch<SetStateAction<Record<string, string>>>;
    targetSelections: Record<string, number>;
    setTargetSelections: Dispatch<SetStateAction<Record<string, number>>>;
    allocatedTotal: number;
    emptyMessage: string;
    footerText?: string;
    /** 手动平仓页可按订单使用者持久化候选资格；止盈预分配沿用已保存方案，不显示此开关。 */
    showEligibilityControls?: boolean;
    eligibilityPendingUserId?: string | null;
    onEligibilityChange?: (candidate: SharedIncomeCandidate, enabled: boolean) => void;
    allocationLimit?: number;
    /** AI方案下只显示姓名、当前权重与本次分配；复选维度时显示组合占比。 */
    compactAllocationMetric?: SharedIncomeAllocationMetric | "combined";
  }) => {
    if (sharedIncomeClosePreview.candidates.length === 0) {
      return <div className="mt-2 rounded border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-4 text-slate-500">{input.emptyMessage}</div>;
    }
    const allocationLimit = input.allocationLimit ?? sharedIncomeClosePreview.shareableAmount;
    if (input.compactAllocationMetric) {
      const isRealizedAnnualizedMetric = input.compactAllocationMetric === "realizedAnnualized";
      const isExternalShareContributionMetric = input.compactAllocationMetric === "externalShareContribution";
      const isReceivedSharedAmountGapMetric = input.compactAllocationMetric === "receivedSharedAmountGap";
      const isReceivedSharedCountGapMetric = input.compactAllocationMetric === "receivedSharedCountGap";
      const isWithdrawalProgressMetric = input.compactAllocationMetric === "withdrawalProgress";
      const isOpeningOrderCountMetric = input.compactAllocationMetric === "openingOrderCount";
      const compactMetricLabel = input.compactAllocationMetric === "principal" ? "本金" : input.compactAllocationMetric === "historicalProfit" ? "已获利润" : input.compactAllocationMetric === "holdingLoss" ? "持仓浮亏" : isRealizedAnnualizedMetric ? "已实现年化" : isExternalShareContributionMetric ? "贡献权重" : isReceivedSharedAmountGapMetric ? "收到共享" : isReceivedSharedCountGapMetric ? "收到次数" : isOpeningOrderCountMetric ? "挂单数量" : isWithdrawalProgressMetric ? "提现占比" : "组合占比";
      const enabledCandidates = sharedIncomeClosePreview.candidates.filter((candidate) => !input.showEligibilityControls || candidate.sharedIncomeEnabled);
      const eligibleMetricCandidates = enabledCandidates.filter((candidate) => candidate.hasPrincipal);
      const totalContributedAmount = eligibleMetricCandidates.reduce((total, candidate) => total + Math.max(0, candidate.contributedSharedIncome), 0);
      const totalContributedOrderCount = eligibleMetricCandidates.reduce((total, candidate) => total + Math.max(0, candidate.contributedSharedIncomeOrderCount), 0);
      const contributionFactorCount = Number(totalContributedAmount > 0.000001) + Number(totalContributedOrderCount > 0);
      const getExternalContributionPercentage = (candidate: SharedIncomeCandidate) => contributionFactorCount > 0
        ? ((totalContributedAmount > 0.000001 ? candidate.contributedSharedIncome / totalContributedAmount / contributionFactorCount : 0)
          + (totalContributedOrderCount > 0 ? candidate.contributedSharedIncomeOrderCount / totalContributedOrderCount / contributionFactorCount : 0)) * 100
        : 0;
      const getCompactMetricValue = (candidate: SharedIncomeCandidate) => input.compactAllocationMetric === "principal"
        ? candidate.cumulativeDepositAmount
        : input.compactAllocationMetric === "historicalProfit"
          ? candidate.historicalProfit
          : input.compactAllocationMetric === "holdingLoss"
            ? Math.max(0, -candidate.holdingNetPnl)
            : isRealizedAnnualizedMetric
              ? Number(candidate.annualizedReference) * 100
              : isExternalShareContributionMetric
                ? getExternalContributionPercentage(candidate)
                : isReceivedSharedAmountGapMetric
                  ? candidate.receivedSharedIncome
                  : isReceivedSharedCountGapMetric
                    ? candidate.receivedSharedIncomeCount
                    : isOpeningOrderCountMetric
                      ? candidate.openingOrderCount
                    : isWithdrawalProgressMetric
                      ? Math.max(0, Number(candidate.withdrawalProgressPercentage) || 0)
                      : allocationLimit > 0 ? Math.max(0, Number(input.drafts[candidate.userId]) || 0) / allocationLimit * 100 : 0;
      const compactMetricUnit = input.compactAllocationMetric === "combined" || isRealizedAnnualizedMetric || isExternalShareContributionMetric || isWithdrawalProgressMetric
        ? "%"
        : isReceivedSharedCountGapMetric || isOpeningOrderCountMetric ? " 笔" : " u";
      const getCandidateDisplayName = (candidate: SharedIncomeCandidate) => [candidate.name, candidate.username]
        .find((value) => Boolean(value && /[\u3400-\u9fff]/.test(value)))
        || candidate.name
        || candidate.username
        || `用户#${candidate.userId}`;
      const disabledCandidates = sharedIncomeClosePreview.candidates.filter((candidate) => input.showEligibilityControls && !candidate.sharedIncomeEnabled);
      const allocatedCandidates = enabledCandidates.filter((candidate) => candidate.hasPrincipal && (Number(input.drafts[candidate.userId]) || 0) > 0.004);
      const annualizedCandidates = enabledCandidates.filter((candidate) => candidate.hasPrincipal && candidate.annualizedReference !== null && Number.isFinite(candidate.annualizedReference));
      const annualizedAverage = annualizedCandidates.length > 0
        ? annualizedCandidates.reduce((total, candidate) => total + Number(candidate.annualizedReference), 0) / annualizedCandidates.length
        : null;
      const withdrawalProgressCandidates = enabledCandidates.filter((candidate) => candidate.hasPrincipal && candidate.withdrawalProgressPercentage !== null && Number.isFinite(candidate.withdrawalProgressPercentage));
      const withdrawalProgressAverage = withdrawalProgressCandidates.length > 0
        ? withdrawalProgressCandidates.reduce((total, candidate) => total + Number(candidate.withdrawalProgressPercentage), 0) / withdrawalProgressCandidates.length
        : null;
      const openingOrderCountTotal = eligibleMetricCandidates.reduce((total, candidate) => total + Math.max(0, candidate.openingOrderCount), 0);
      const allocatedMetricTotal = isRealizedAnnualizedMetric
        ? annualizedAverage === null ? 0 : annualizedAverage * 100
        : isWithdrawalProgressMetric
          ? withdrawalProgressAverage === null ? 0 : withdrawalProgressAverage
          : isOpeningOrderCountMetric
            ? openingOrderCountTotal
        : allocatedCandidates.reduce((total, candidate) => total + getCompactMetricValue(candidate), 0);
      const getCompactMetricValueClassName = (candidate: SharedIncomeCandidate) => input.compactAllocationMetric === "holdingLoss"
        ? "font-semibold text-emerald-600"
        : isExternalShareContributionMetric
          ? "font-semibold text-blue-600"
        : isReceivedSharedAmountGapMetric
          ? "font-semibold text-rose-600"
        : isOpeningOrderCountMetric
          ? "font-semibold text-indigo-700"
        : isWithdrawalProgressMetric
          ? "font-semibold text-sky-700"
        : isRealizedAnnualizedMetric
          ? Number(candidate.annualizedReference) < 0 ? "font-semibold text-emerald-600" : "font-semibold text-rose-600"
          : "font-semibold text-slate-700";
      const compactSummaryLabel = isRealizedAnnualizedMetric ? "平均年化" : isWithdrawalProgressMetric ? "平均提现占比" : isOpeningOrderCountMetric ? "累计挂单" : compactMetricLabel;
      const compactSummaryValueClassName = input.compactAllocationMetric === "holdingLoss"
        ? "font-semibold text-emerald-600"
        : isExternalShareContributionMetric
          ? "font-semibold text-blue-600"
        : isReceivedSharedAmountGapMetric
          ? "font-semibold text-rose-600"
        : isOpeningOrderCountMetric
          ? "font-semibold text-indigo-700"
        : isWithdrawalProgressMetric
          ? "font-semibold text-sky-700"
        : isRealizedAnnualizedMetric && annualizedAverage !== null && annualizedAverage < 0
          ? "font-semibold text-emerald-600"
          : isRealizedAnnualizedMetric ? "font-semibold text-rose-600" : "font-semibold text-slate-700";
      const formatCompactMetricValue = (candidate: SharedIncomeCandidate) => isRealizedAnnualizedMetric
        ? formatT0AnnualizedReturn(candidate.annualizedReference)
        : isReceivedSharedCountGapMetric || isOpeningOrderCountMetric
          ? `${Math.round(getCompactMetricValue(candidate))}${compactMetricUnit}`
        : `${formatPrice(getCompactMetricValue(candidate))}${compactMetricUnit}`;
      const formatCompactMetricSummary = () => isRealizedAnnualizedMetric
        ? formatT0AnnualizedReturn(annualizedAverage)
        : isReceivedSharedCountGapMetric || isOpeningOrderCountMetric
          ? `${Math.round(allocatedMetricTotal)}${compactMetricUnit}`
        : `${formatPrice(allocatedMetricTotal)}${compactMetricUnit}`;
      const updateCompactDraft = (candidate: SharedIncomeCandidate, rawValue: string) => {
        const nextValue = rawValue.replace(/[^0-9.]/g, "");
        input.setTargetSelections((current) => { const { [candidate.userId]: _removed, ...rest } = current; return rest; });
        input.setDrafts((current) => {
          if (!candidate.hasPrincipal) return current;
          if (!nextValue) { const { [candidate.userId]: _removed, ...rest } = current; return rest; }
          return { ...current, [candidate.userId]: nextValue };
        });
      };
      const getCompactDraftAdjustment = (candidate: SharedIncomeCandidate) => {
        const rawCurrentAmount = Number(input.drafts[candidate.userId] ?? 0);
        const currentAmount = Number.isFinite(rawCurrentAmount) ? Math.max(0, rawCurrentAmount) : 0;
        const currentCents = Math.round(currentAmount * 100);
        const stepCents = currentCents > 0 ? Math.max(1, Math.round(currentCents * 0.05)) : 0;
        const reservedForOthersCents = Math.max(0, Math.round((input.allocatedTotal - currentAmount) * 100));
        const availableCents = Math.max(0, Math.round(allocationLimit * 100) - reservedForOthersCents);
        return { currentCents, stepCents, availableCents };
      };
      const adjustCompactDraftByPercent = (candidate: SharedIncomeCandidate, direction: -1 | 1) => {
        if (!candidate.hasPrincipal) return;
        const { currentCents, stepCents, availableCents } = getCompactDraftAdjustment(candidate);
        if (currentCents <= 0 || stepCents <= 0) return;
        const nextCents = direction < 0 ? currentCents - stepCents : currentCents + stepCents;
        if (nextCents < 0 || nextCents > availableCents) return;
        updateCompactDraft(candidate, (nextCents / 100).toFixed(2));
      };
      return <>
        <div className="overflow-hidden rounded border border-slate-200 bg-white">
          <table className="w-full table-auto border-collapse tabular-nums">
            <colgroup><col className="w-px" /><col className="w-px" /><col /></colgroup>
            <thead><tr className="h-7 border-b border-slate-200 bg-slate-50 text-[9px] font-medium text-slate-500"><th className="w-px px-2 text-left font-medium">共享分配人</th><th className="w-px whitespace-nowrap px-1 text-left font-medium">{compactMetricLabel}</th><th className="px-2 text-right font-medium">分配（u）</th></tr></thead>
            <tbody>
              {enabledCandidates.map((candidate) => {
                const candidateDisplayName = getCandidateDisplayName(candidate);
                const canAdjustCandidate = candidate.hasPrincipal;
                const canDisplayMetricValue = candidate.hasPrincipal && (!isRealizedAnnualizedMetric || (candidate.annualizedReference !== null && Number.isFinite(candidate.annualizedReference)));
                const { currentCents, stepCents, availableCents } = getCompactDraftAdjustment(candidate);
                const canDecreaseCandidate = canAdjustCandidate && currentCents > 0 && stepCents > 0;
                const canIncreaseCandidate = canAdjustCandidate && stepCents > 0 && currentCents + stepCents <= availableCents;
                const adjustmentAmount = stepCents / 100;
                return <tr key={candidate.userId} className={candidate.hasPrincipal ? "h-10 border-b border-slate-100" : "h-10 border-b border-slate-100 bg-slate-100 opacity-70"}>
                  <td className="w-px whitespace-nowrap px-2 align-middle"><div className="flex min-w-max items-center justify-between gap-1"><span className="whitespace-nowrap text-[11px] font-semibold text-slate-800">{candidateDisplayName}</span>{input.showEligibilityControls && <button type="button" disabled={Boolean(input.eligibilityPendingUserId)} aria-pressed aria-label={`${candidateDisplayName}关闭本单共享资格`} onClick={() => input.onEligibilityChange?.(candidate, false)} className="relative h-4 w-7 shrink-0 rounded-full bg-blue-600 transition disabled:opacity-45"><span className="absolute left-[14px] top-0.5 h-3 w-3 rounded-full bg-white shadow transition" /></button>}</div></td>
                  <td className="w-px whitespace-nowrap px-1 text-left align-middle text-[10px] text-slate-500"><b className={getCompactMetricValueClassName(candidate)}>{canDisplayMetricValue ? formatCompactMetricValue(candidate) : "--"}</b></td>
                  <td className="px-2 align-middle"><div className="grid h-8 grid-cols-[1.75rem_minmax(0,1fr)_1.75rem] overflow-hidden rounded border border-slate-200 bg-white focus-within:border-blue-400"><button type="button" disabled={!canDecreaseCandidate} aria-label={`${candidateDisplayName}分配金额减少当前金额的5%`} title={canDecreaseCandidate ? `减少 ${formatPrice(adjustmentAmount)} u（当前金额的 5%）` : "请先输入分配金额"} onClick={() => adjustCompactDraftByPercent(candidate, -1)} className="flex items-center justify-center border-r border-slate-100 text-slate-500 active:bg-slate-50 disabled:text-slate-300"><Minus className="h-3.5 w-3.5" strokeWidth={2.25} /></button><input aria-label={`${candidateDisplayName}本次共享收益金额`} disabled={!canAdjustCandidate} value={input.drafts[candidate.userId] ?? ""} onChange={(event) => updateCompactDraft(candidate, event.target.value)} inputMode="decimal" className="min-w-0 bg-white px-1 text-right text-[16px] font-semibold tabular-nums text-slate-800 outline-none disabled:bg-slate-50 disabled:text-slate-300" /><button type="button" disabled={!canIncreaseCandidate} aria-label={`${candidateDisplayName}分配金额增加当前金额的5%`} title={canIncreaseCandidate ? `增加 ${formatPrice(adjustmentAmount)} u（当前金额的 5%）` : "剩余分配额度不足"} onClick={() => adjustCompactDraftByPercent(candidate, 1)} className="flex items-center justify-center border-l border-slate-100 text-blue-600 active:bg-blue-50 disabled:text-slate-300"><Plus className="h-3.5 w-3.5" strokeWidth={2.25} /></button></div></td>
                </tr>;
              })}
              {enabledCandidates.some((candidate) => candidate.hasPrincipal) && <tr className="h-8 bg-slate-50 text-[10px] tabular-nums text-slate-500"><td className="w-px whitespace-nowrap px-2">共分配 <b className="font-semibold text-slate-800">{allocatedCandidates.length}</b> 人</td><td className="w-px whitespace-nowrap px-1 text-left">{compactSummaryLabel} <b className={compactSummaryValueClassName}>{formatCompactMetricSummary()}</b></td><td className="whitespace-nowrap px-2 text-right">已分 <b className="font-semibold text-rose-600">{input.allocatedTotal.toFixed(2)} u</b></td></tr>}
              {disabledCandidates.map((candidate) => {
                const candidateDisplayName = getCandidateDisplayName(candidate);
                return <tr key={candidate.userId} className="h-8 border-t border-slate-100 bg-slate-100 opacity-70"><td colSpan={3} className="px-2"><div className="flex items-center gap-1"><span className="min-w-0 truncate text-[11px] font-medium text-slate-500">{candidateDisplayName}</span><button type="button" disabled={Boolean(input.eligibilityPendingUserId)} aria-pressed={false} aria-label={`${candidateDisplayName}开启本单共享资格`} onClick={() => input.onEligibilityChange?.(candidate, true)} className="relative h-4 w-7 shrink-0 rounded-full bg-slate-400 transition disabled:opacity-45"><span className="absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white shadow transition" /></button></div></td></tr>;
              })}
            </tbody>
          </table>
        </div>
        {input.footerText && <div className="mt-2 rounded bg-slate-50 px-2.5 py-2 text-[10px] leading-4 text-slate-500">{input.footerText}</div>}
      </>;
    }
    return <>
      <div className="divide-y divide-slate-100 overflow-hidden rounded border border-slate-200">
	        {sharedIncomeClosePreview.candidates.map((candidate) => {
          const candidateDisplayName = [candidate.name, candidate.username]
            .find((value) => Boolean(value && /[\u3400-\u9fff]/.test(value)))
            || candidate.name
            || candidate.username
            || `用户#${candidate.userId}`;
          const candidateEligible = !input.showEligibilityControls || candidate.sharedIncomeEnabled;
          const canAdjustCandidate = candidate.hasPrincipal && candidateEligible;
          const currentSharedIncomeDraft = Number(input.drafts[candidate.userId] ?? 0);
          const currentSharedIncomeAmount = Number.isFinite(currentSharedIncomeDraft) ? Math.max(0, currentSharedIncomeDraft) : 0;
          // 空草案直接复用打开面板时算好的基准年化；输入金额时只重算当前这一位用户。
          const displayedRealizedAnnualized = currentSharedIncomeAmount > 0
            ? calculateT0Xirr([
              ...candidate.realizedCashFlows,
              { occurredOn: getBeijingDateInputValue(), amount: candidate.realizedTerminalValue + currentSharedIncomeAmount, atEndOfBeijingDay: true },
            ])
            : candidate.annualizedReference;
          const allocationReservedForOthers = Math.max(0, input.allocatedTotal - currentSharedIncomeAmount);
          const availableForCandidate = Math.max(0, allocationLimit - allocationReservedForOthers);
          const selectedTargetRate = input.targetSelections[candidate.userId];
          const onePercentShareAmount = candidate.cumulativeDepositAmount * 0.01;
          const canAllocateOnePercent = canAdjustCandidate && onePercentShareAmount > 0.004 && onePercentShareAmount <= availableForCandidate + 0.004;
          const twoPercentShareAmount = candidate.cumulativeDepositAmount * 0.02;
          const canAllocateTwoPercent = canAdjustCandidate && twoPercentShareAmount > 0.004 && twoPercentShareAmount <= availableForCandidate + 0.004;
          const orderPoolOnePercentShareAmount = allocationLimit * 0.01;
          const canAllocateOrderPoolOnePercent = canAdjustCandidate && orderPoolOnePercentShareAmount > 0.004 && orderPoolOnePercentShareAmount <= availableForCandidate + 0.004;
          const orderPoolTwoPercentShareAmount = allocationLimit * 0.02;
          const canAllocateOrderPoolTwoPercent = canAdjustCandidate && orderPoolTwoPercentShareAmount > 0.004 && orderPoolTwoPercentShareAmount <= availableForCandidate + 0.004;
          const annualizedTargetOptions = candidate.annualizedTargetTopUps;
          const settlementAgeDays = currentSharedIncomeAmount > 0 ? 0 : candidate.settlementAgeDays;
          const settlementEnergyCells = settlementAgeDays === null ? 0 : Math.min(10, settlementAgeDays);
          const settlementEnergyTone = settlementAgeDays === null || settlementAgeDays >= 8
            ? "bg-rose-500" : settlementAgeDays >= 6 ? "bg-orange-500" : settlementAgeDays >= 4 ? "bg-amber-400" : settlementAgeDays >= 3 ? "bg-lime-500" : "bg-emerald-500";
          const settlementEnergyLabel = settlementAgeDays === null ? "尚未盈利结算" : `${settlementAgeDays} 天未结算`;
          const clearCandidate = () => {
            input.setTargetSelections((current) => { const { [candidate.userId]: _removed, ...rest } = current; return rest; });
            input.setDrafts((current) => { const { [candidate.userId]: _removed, ...rest } = current; return rest; });
          };
	          if (input.showEligibilityControls && !candidate.sharedIncomeEnabled) {
	            return <div key={candidate.userId} className="flex h-8 items-center gap-1 bg-slate-100 px-2 opacity-70">
	              <span className="min-w-0 truncate text-[11px] font-medium text-slate-500">{candidateDisplayName}</span>
	              <button type="button" disabled={Boolean(input.eligibilityPendingUserId)} aria-pressed={false} aria-label={`${candidateDisplayName}开启本单共享资格`} onClick={() => input.onEligibilityChange?.(candidate, true)} className="relative h-4 w-7 shrink-0 rounded-full bg-slate-400 transition disabled:opacity-45"><span className="absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white shadow transition" /></button>
	            </div>;
	          }
          return <div key={candidate.userId} className={`grid grid-cols-[minmax(0,1fr)_5.75rem] items-stretch gap-x-2 gap-y-1 px-2 py-2 ${candidate.hasPrincipal && candidateEligible ? "" : "bg-slate-100 text-slate-400 opacity-70"}`}>
            <div className="min-w-0 flex-1">
	              <div className="flex min-w-0 items-center gap-1"><div className={`min-w-0 truncate text-[12px] font-semibold ${candidateEligible ? "text-slate-800" : "text-slate-500"}`}>{candidateDisplayName}</div>{input.showEligibilityControls && <button type="button" disabled={Boolean(input.eligibilityPendingUserId)} aria-pressed={candidate.sharedIncomeEnabled} aria-label={`${candidateDisplayName}${candidate.sharedIncomeEnabled ? "关闭" : "开启"}本单共享资格`} onClick={() => input.onEligibilityChange?.(candidate, !candidate.sharedIncomeEnabled)} className={`relative h-4 w-7 shrink-0 rounded-full transition disabled:opacity-45 ${candidate.sharedIncomeEnabled ? "bg-blue-600" : "bg-slate-400"}`}><span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition ${candidate.sharedIncomeEnabled ? "left-[14px]" : "left-0.5"}`} /></button>}</div>
              {candidate.hasPrincipal ? <>
                <div className="mt-0.5 flex items-center gap-1 whitespace-nowrap text-[10px] text-slate-500">
                  <span>接受共享（{candidate.receivedSharedIncomeCount}次）<b className={candidate.receivedSharedIncome > 0 ? "ml-0.5 font-semibold text-rose-600" : "ml-0.5 font-semibold text-slate-500"}>{candidate.receivedSharedIncome > 0 ? "+" : ""}{candidate.receivedSharedIncome === 0 ? "0" : formatPrice(candidate.receivedSharedIncome)} u</b></span>
                  <span className="text-slate-300">·</span>
                  <span>本单共享 <b className={currentSharedIncomeAmount > 0 ? "font-semibold text-rose-600" : "font-semibold text-slate-500"}>{currentSharedIncomeAmount > 0 ? "+" : ""}{currentSharedIncomeAmount === 0 ? "0" : formatPrice(currentSharedIncomeAmount)} u</b></span>
                </div>
                <div className="mt-0.5 flex items-center gap-1 whitespace-nowrap text-[10px] text-slate-500"><span>付出共享（{candidate.contributedSharedIncomeOrderCount}次）<b className={candidate.contributedSharedIncome > 0 ? "ml-0.5 font-semibold text-emerald-600" : "ml-0.5 font-semibold text-slate-500"}>{candidate.contributedSharedIncome > 0 ? "-" : ""}{candidate.contributedSharedIncome === 0 ? "0" : formatPrice(candidate.contributedSharedIncome)} u</b></span></div>
                <div className="mt-0.5 whitespace-nowrap text-[10px] text-slate-500">多 {formatQuantity(candidate.longQuantity)} E · 空 {formatQuantity(candidate.shortQuantity)} E · 本金 {formatPrice(candidate.cumulativeDepositAmount)} u</div>
	                <div className="mt-0.5 flex items-center gap-1 whitespace-nowrap text-[10px] text-slate-500"><span>历史利润 <b className="font-semibold text-rose-600">+{formatPrice(candidate.historicalProfit)} u</b></span><span className="text-slate-300">·</span><span>已实现年化 <b className={displayedRealizedAnnualized !== null && Number.isFinite(displayedRealizedAnnualized) ? (displayedRealizedAnnualized >= 0 ? "font-semibold text-rose-600" : "font-semibold text-emerald-600") : "font-semibold text-slate-400"}>{displayedRealizedAnnualized === null || !Number.isFinite(displayedRealizedAnnualized) ? "--" : formatT0AnnualizedReturn(displayedRealizedAnnualized)}</b></span></div>
                <div className="mt-0.5 whitespace-nowrap text-[10px] text-slate-500">持仓总浮盈亏 <b className={candidate.holdingNetPnl >= 0 ? "font-semibold text-rose-600" : "font-semibold text-emerald-600"}>{formatSigned(candidate.holdingNetPnl)} u</b></div>
              </> : <><div className="mt-0.5 whitespace-nowrap text-[10px] text-slate-500">多 {formatQuantity(candidate.longQuantity)} E · 空 {formatQuantity(candidate.shortQuantity)} E · 本金 未登记</div><div className="mt-0.5 text-[10px] text-slate-500">未投入本金，不参与共享收益分配</div></>}
            </div>
            <div className={`relative w-[92px] ${candidate.hasPrincipal ? "row-span-2 self-stretch pb-10" : "self-stretch"}`}>
              {candidate.hasPrincipal && <div className="grid w-full grid-cols-2 gap-1">
                {annualizedTargetOptions.map(({ targetRate, topUp }) => {
                  const hasAlreadyReachedTarget = candidate.annualizedReference !== null && Number.isFinite(candidate.annualizedReference) && candidate.annualizedReference >= targetRate - 0.000001;
                  const isAvailable = canAdjustCandidate && topUp !== null && !hasAlreadyReachedTarget && topUp <= availableForCandidate + 0.004;
                  const isSelectedTarget = selectedTargetRate === targetRate;
                  const isOtherTargetDimmed = selectedTargetRate !== undefined && !isSelectedTarget;
                  const targetLabel = `${Math.round(targetRate * 100)}%`;
                  return <button key={targetRate} type="button" aria-label={`目标年化 ${targetLabel}`} disabled={!isAvailable} title={topUp === null ? "缺少有效投入现金流，无法计算目标年化" : hasAlreadyReachedTarget ? `该用户历史已实现年化已达到 ${targetLabel}` : topUp > availableForCandidate + 0.004 ? `需要 ${formatPrice(topUp)} U，超过本次可用额度` : `补 ${formatPrice(topUp)} U 后达到 ${targetLabel} 年化`} onClick={() => {
                    if (!isAvailable || topUp === null) return;
                    input.setTargetSelections((current) => ({ ...current, [candidate.userId]: targetRate }));
                    input.setDrafts((current) => topUp <= 0.004 ? (() => { const { [candidate.userId]: _removed, ...rest } = current; return rest; })() : ({ ...current, [candidate.userId]: topUp.toFixed(2) }));
                  }} className={`h-4 rounded border text-[8px] font-semibold tabular-nums active:scale-[0.98] disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-300 ${isSelectedTarget ? "border-blue-600 bg-blue-600 text-white" : isOtherTargetDimmed ? "border-slate-200 bg-slate-100 text-slate-400" : "border-blue-200 bg-blue-50 text-blue-700"}`}>{targetLabel}</button>;
                })}
                <button type="button" disabled={!canAllocateOnePercent} title={canAllocateOnePercent ? `按该用户累计投入本金的 1% 分配，即 ${formatPrice(onePercentShareAmount)} U` : `剩余额度不足以分配 ${formatPrice(onePercentShareAmount)} U`} onClick={() => { if (!canAllocateOnePercent) return; input.setTargetSelections((current) => { const { [candidate.userId]: _removed, ...rest } = current; return rest; }); input.setDrafts((current) => ({ ...current, [candidate.userId]: onePercentShareAmount.toFixed(2) })); }} className="h-4 whitespace-nowrap rounded border border-amber-200 bg-amber-50 text-[8px] font-semibold tabular-nums text-amber-700 active:scale-[0.98] disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-300">本金 1%</button>
                <button type="button" disabled={!canAllocateTwoPercent} title={canAllocateTwoPercent ? `按该用户累计投入本金的 2% 分配，即 ${formatPrice(twoPercentShareAmount)} U` : `剩余额度不足以分配 ${formatPrice(twoPercentShareAmount)} U`} onClick={() => { if (!canAllocateTwoPercent) return; input.setTargetSelections((current) => { const { [candidate.userId]: _removed, ...rest } = current; return rest; }); input.setDrafts((current) => ({ ...current, [candidate.userId]: twoPercentShareAmount.toFixed(2) })); }} className="h-4 whitespace-nowrap rounded border border-amber-200 bg-amber-50 text-[8px] font-semibold tabular-nums text-amber-700 active:scale-[0.98] disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-300">本金 2%</button>
                <button type="button" disabled={!canAllocateOrderPoolOnePercent} aria-label="按本单可共享收益的1%分配" title={canAllocateOrderPoolOnePercent ? `按本单可共享收益的 1% 分配，即 ${formatPrice(orderPoolOnePercentShareAmount)} U` : `剩余额度不足以分配 ${formatPrice(orderPoolOnePercentShareAmount)} U`} onClick={() => { if (!canAllocateOrderPoolOnePercent) return; input.setTargetSelections((current) => { const { [candidate.userId]: _removed, ...rest } = current; return rest; }); input.setDrafts((current) => ({ ...current, [candidate.userId]: orderPoolOnePercentShareAmount.toFixed(2) })); }} style={canAllocateOrderPoolOnePercent ? { backgroundColor: "#2563EB", borderColor: "#1D4ED8", color: "#FFFFFF" } : undefined} className="h-4 whitespace-nowrap rounded border text-[8px] font-semibold tabular-nums shadow-sm active:scale-[0.98] disabled:border-slate-200 disabled:bg-white disabled:text-slate-300 disabled:shadow-none">本单 1%</button>
                <button type="button" disabled={!canAllocateOrderPoolTwoPercent} aria-label="按本单可共享收益的2%分配" title={canAllocateOrderPoolTwoPercent ? `按本单可共享收益的 2% 分配，即 ${formatPrice(orderPoolTwoPercentShareAmount)} U` : `剩余额度不足以分配 ${formatPrice(orderPoolTwoPercentShareAmount)} U`} onClick={() => { if (!canAllocateOrderPoolTwoPercent) return; input.setTargetSelections((current) => { const { [candidate.userId]: _removed, ...rest } = current; return rest; }); input.setDrafts((current) => ({ ...current, [candidate.userId]: orderPoolTwoPercentShareAmount.toFixed(2) })); }} style={canAllocateOrderPoolTwoPercent ? { backgroundColor: "#2563EB", borderColor: "#1D4ED8", color: "#FFFFFF" } : undefined} className="h-4 whitespace-nowrap rounded border text-[8px] font-semibold tabular-nums shadow-sm active:scale-[0.98] disabled:border-slate-200 disabled:bg-white disabled:text-slate-300 disabled:shadow-none">本单 2%</button>
              </div>}
              <div className={candidate.hasPrincipal ? "absolute bottom-0 right-0 w-full" : "relative w-full"}>{candidate.hasPrincipal && candidateEligible && (input.drafts[candidate.userId] ?? "").trim() !== "" && <button type="button" aria-label={`清零${candidate.name}本单共享收益`} title="清零本单共享收益" onClick={clearCandidate} className="absolute left-1 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-xl leading-none text-slate-500 active:bg-slate-100 active:text-slate-800">×</button>}<input aria-label={`${candidate.name}共享收益金额`} disabled={!canAdjustCandidate} value={input.drafts[candidate.userId] ?? ""} onChange={(event) => {
                const nextValue = event.target.value.replace(/[^0-9.]/g, "");
                input.setTargetSelections((current) => { const { [candidate.userId]: _removed, ...rest } = current; return rest; });
                input.setDrafts((current) => { if (!canAdjustCandidate) return current; if (!nextValue) { const { [candidate.userId]: _removed, ...rest } = current; return rest; } return { ...current, [candidate.userId]: nextValue }; });
              }} inputMode="decimal" className="h-8 w-full rounded border border-slate-200 bg-white pl-8 pr-2 text-right text-[16px] font-semibold tabular-nums text-slate-800 outline-none focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-300" /></div>
            </div>
            {candidate.hasPrincipal && <div className="col-start-1 mt-0.5 flex items-center gap-1.5"><span className={`shrink-0 text-[9px] font-medium ${settlementAgeDays === null || settlementAgeDays >= 8 ? "text-rose-600" : settlementAgeDays >= 4 ? "text-amber-600" : "text-emerald-600"}`}>{settlementEnergyLabel}</span><div className="flex min-w-0 flex-1 items-center gap-px" aria-label={settlementEnergyLabel}>{Array.from({ length: settlementEnergyCells }, (_, index) => <span key={index} className={`h-2 w-2 shrink-0 rounded-[1px] ${settlementEnergyTone}`} />)}</div></div>}
          </div>;
        })}
      </div>
      {input.footerText && <div className="mt-2 rounded bg-slate-50 px-2.5 py-2 text-[10px] leading-4 text-slate-500">{input.footerText}</div>}
    </>;
  };

  const netProfitDetailUsesMemberPresentation = Boolean(
    netProfitDetail && (isMemberView || netProfitDetail.presentation === "member"),
  );
  const memberProfitShareDetail = netProfitDetail && netProfitDetailUsesMemberPresentation
    ? resolveMemberPayout(
      netProfitDetail.trade,
      netProfitDetail.detail.netPnl,
      netProfitDetail.presentation === "member"
        ? Number(netProfitDetail.viewerUserId || 0)
        : viewerProfitShareBeneficiaryUserId,
      netProfitDetail.presentation === "member" ? historyPerspectiveTrades : trades,
    )
    : null;
  const memberRelatedUserName = useMemo(() => {
    if (isUserPreview) return selectedPreviewMember?.name || `用户#${previewUserId}`;
    const selfName = String((me as any)?.name || (me as any)?.username || "").trim();
    if (selfName) return selfName;
    const ownTrade = trades.find((trade) => Boolean(trade.relatedUserId));
    return ownTrade ? getTradeRelatedUserName(ownTrade) : "本人";
  }, [isUserPreview, me, previewUserId, selectedPreviewMember, trades]);
  const payoutLogs = useMemo<T0JournalPayoutLog[]>(() => {
    const rows = t0PayoutLogsQuery.data;
    const targetUserId = Number(payoutTargetRelatedUserId);
    if (!Array.isArray(rows) || !Number.isInteger(targetUserId) || targetUserId <= 0) return [];
    // 用户预览切换时，React Query 可能在新请求返回前短暂保留上一位用户的缓存。
    // 资金流水必须以当前报告用户为唯一口径：缓存不匹配时宁可暂不显示，也绝不展示别人的提现。
    return rows
      .filter((row: any) => Number(row.relatedUserId || 0) === targetUserId)
      .map((row: any) => ({
        id: String(row.id),
        relatedUserId: Number(row.relatedUserId || 0),
        relatedUserName: String(row.relatedUserName || "当前用户"),
        occurredOn: String(row.occurredOn || "").slice(0, 10),
        direction: String(row.direction) === "deposit" ? "deposit" : "withdrawal",
        amount: Number(row.amount || 0),
        ethReferencePrice: row.ethReferencePrice == null ? undefined : String(row.ethReferencePrice).trim() || undefined,
        ethQuantity: row.ethQuantity == null ? undefined : String(row.ethQuantity).trim() || undefined,
        depositInputMode: row.depositInputMode === "eth" ? "eth" as const : "u" as const,
        note: String(row.note || "").trim() || undefined,
        createdAt: String(row.createdAt || ""),
      }));
  }, [payoutTargetRelatedUserId, t0PayoutLogsQuery.data]);
  const globalPayoutLogs = useMemo<T0JournalPayoutLog[]>(() => {
    const rows = t0GlobalPayoutLogsQuery.data;
    if (!Array.isArray(rows)) return [];
    return rows
      .map((row: any) => ({
        id: String(row.id),
        relatedUserId: Number(row.relatedUserId || 0),
        relatedUserName: String(row.relatedUserName || "未关联用户"),
        occurredOn: String(row.occurredOn || "").slice(0, 10),
        direction: String(row.direction) === "deposit" ? "deposit" as const : "withdrawal" as const,
        amount: Number(row.amount || 0),
        ethReferencePrice: row.ethReferencePrice == null ? undefined : String(row.ethReferencePrice).trim() || undefined,
        ethQuantity: row.ethQuantity == null ? undefined : String(row.ethQuantity).trim() || undefined,
        depositInputMode: row.depositInputMode === "eth" ? "eth" as const : "u" as const,
        note: String(row.note || "").trim() || undefined,
        createdAt: String(row.createdAt || ""),
      }))
      .filter((row) => Number.isFinite(row.amount));
  }, [t0GlobalPayoutLogsQuery.data]);
  const availableRelatedFunds = useMemo(
    () => relatedUserFilterIds.length === 0 || topRelatedUserFilter.waitingForReferralData
      ? relatedFunds
      : relatedFunds.filter((fund) => Boolean(fund.relatedUserId) && topRelatedUserFilter.userIds.has(fund.relatedUserId!)),
    [relatedFunds, relatedUserFilterIds.length, topRelatedUserFilter],
  );
  const memberFundFilterOptionIds = useMemo(() => [
    ...relatedFunds.map((fund) => fund.id),
    ...(trades.some((trade) => !trade.relatedFundId) ? ["unclassified"] : []),
  ], [relatedFunds, trades]);
  const shouldLockMemberFundFilter = isMemberView && memberFundFilterOptionIds.length === 1;
  const lockedRelatedFundName = availableRelatedFunds.find((fund) => relatedFundFilterIds.includes(fund.id))?.name
    || availableRelatedFunds[0]?.name
    || (trades.some((trade) => !trade.relatedFundId) ? "未区分项目（历史）" : "暂无项目");
  const accountFilterOptions = accounts.map((account) => ({ id: account.id, label: account.name }));
  const hasUnlinkedTrades = trades.some((trade) => !trade.relatedUserId || trade.relatedUserHidden);
  const selectedReferralFilterIds = new Set([
    ...relatedUserFilterIds,
    ...historyRelatedUserFilterIds,
  ]);
  const currentReferralRootUser = recentRelatedUsers.find((user) => user.id === currentReferralRootUserId);
  const currentReferralDescendants = currentReferralRootUserId
    ? referralDescendantsByRootUserId.get(currentReferralRootUserId)
    : undefined;
  const currentReferralToken = currentReferralRootUserId
    ? createT0ReferralDescendantsToken(currentReferralRootUserId)
    : "";
  const shouldKeepCurrentReferralLoadingOption = Boolean(
    currentReferralToken
    && selectedReferralFilterIds.has(currentReferralToken)
    && !referralDataLoaded,
  );
  const toRelatedUserFilterOption = (
    user: PreviewRelatedUser,
    kind?: T0MultiSelectOption["kind"],
  ): T0MultiSelectOption => ({
    // 下拉内保留昵称和用户名便于辨认；顶部筛选框选中后只展示昵称，节省移动端空间。
    id: user.id,
    label: `${user.name}${user.username ? ` · @${user.username}` : ""}`,
    summaryLabel: user.name,
    kind,
  });
  /**
   * 成员只能从服务端已经授权下发的订单来源中选择。
   * 这不是用户搜索或权限扩展：来源名单直接由当前成员投影后的 trades 构造，
   * 因而“本人 + 已分佣/共享来源”之外的名字永远不会出现在下拉框中。
   */
  const memberSourceUserFilterOptions = useMemo<T0MultiSelectOption[]>(() => {
    if (!isMemberView) return [];
    const viewerId = String(viewerProfitShareBeneficiaryUserId || "");
    const optionsById = new Map<string, T0MultiSelectOption>();
    for (const trade of trades) {
      const relatedUserId = trade.relatedUserHidden ? "" : String(trade.relatedUserId || "").trim();
      if (!relatedUserId || optionsById.has(relatedUserId)) continue;
      const isSelf = relatedUserId === viewerId;
      const name = isSelf ? memberRelatedUserName : getTradeRelatedUserName(trade);
      const username = isSelf
        ? String((me as any)?.username || "").trim()
        : String(trade.relatedUsername || "").trim();
      optionsById.set(relatedUserId, {
        id: relatedUserId,
        label: `${name}${isSelf ? "（本人）" : username ? ` · @${username}` : ""}`,
        summaryLabel: `${name}${isSelf ? "（本人）" : ""}`,
      });
    }
    return Array.from(optionsById.values()).sort((left, right) => {
      const leftIsSelf = left.id === viewerId;
      const rightIsSelf = right.id === viewerId;
      return Number(rightIsSelf) - Number(leftIsSelf) || left.label.localeCompare(right.label, "zh-CN");
    });
  }, [isMemberView, me, memberRelatedUserName, trades, viewerProfitShareBeneficiaryUserId]);
  const relatedUserFilterOptions: T0MultiSelectOption[] = isMemberView
    ? memberSourceUserFilterOptions
    : [
      // 管理员只在本人下方显示一条递归“推荐”，不再为每位关联用户重复展示其推荐分支。
      ...(currentReferralRootUser ? [toRelatedUserFilterOption(currentReferralRootUser)] : []),
      ...(currentReferralDescendants || shouldKeepCurrentReferralLoadingOption ? [{
        id: currentReferralToken,
        // 数字只统计当前 T+0 中实际有订单、可被筛选命中的递归推荐用户。
        label: `推荐（${currentReferralDescendants ? currentReferralDescendants.length : "读取中"}）`,
        summaryLabel: `推荐${currentReferralDescendants ? `（${currentReferralDescendants.length}）` : ""}`,
        kind: "referral-descendants" as const,
      }] : []),
      ...recentRelatedUsers
        .filter((user) => user.id !== currentReferralRootUserId)
        .map((user) => toRelatedUserFilterOption(user)),
      ...(hasUnlinkedTrades ? [{ id: "unlinked", label: "未关联用户（历史）" }] : []),
    ];
  const payoutTargetUserIdentity = useMemo(() => {
    if (payoutTargetRelatedUserId <= 0) return { name: "当前用户", username: "", avatar: "" };
    const targetId = String(payoutTargetRelatedUserId);
    const relatedTrade = trades.find((trade) => trade.relatedUserId === targetId);
    if (isMemberView) {
      return {
        name: memberRelatedUserName || "本人",
        username: String((me as any)?.username || "").trim(),
        avatar: relatedTrade?.relatedUserAvatar || String((me as any)?.avatar || "").trim(),
      };
    }
    const relatedUser = recentRelatedUsers.find((user) => user.id === targetId);
    const payoutUserName = payoutLogs[0]?.relatedUserName || "";
    return {
      name: relatedUser?.name || relatedTrade?.relatedUserName || relatedTrade?.relatedUsername || payoutUserName || "当前用户",
      username: relatedUser?.username || relatedTrade?.relatedUsername || "",
      avatar: relatedTrade?.relatedUserAvatar || "",
    };
  }, [isMemberView, me, memberRelatedUserName, payoutLogs, payoutTargetRelatedUserId, recentRelatedUsers, trades]);

  const relatedFundFilterOptions = [
    ...(trades.some((trade) => !trade.relatedFundId) ? [{ id: "unclassified", label: "未区分项目（历史）" }] : []),
    ...availableRelatedFunds.map((fund) => ({ id: fund.id, label: fund.name })),
  ];
  const historyAvailableRelatedFunds = useMemo(
    () => historyRelatedUserFilterIds.length === 0 || historyRelatedUserFilter.waitingForReferralData
      ? relatedFunds
      : relatedFunds.filter((fund) => Boolean(fund.relatedUserId) && historyRelatedUserFilter.userIds.has(fund.relatedUserId!)),
    [historyRelatedUserFilter, historyRelatedUserFilterIds.length, relatedFunds],
  );
  const historyRelatedFundFilterOptions = [
    ...(trades.some((trade) => !trade.relatedFundId) ? [{ id: "unclassified", label: "未区分项目（历史）" }] : []),
    ...historyAvailableRelatedFunds.map((fund) => ({ id: fund.id, label: fund.name })),
  ];
  const topSelectableRelatedUserIds = isMemberView
    ? memberSourceUserFilterOptions.map((option) => option.id)
    : recentRelatedUsers.map((user) => user.id);
  const topRelatedUserSelectionIsAll = isT0RelatedUserSelectionEquivalentToAll(
    relatedUserFilterIds,
    topRelatedUserFilter,
    topSelectableRelatedUserIds,
    isMemberView ? false : hasUnlinkedTrades,
  );
  const historyRelatedUserSelectionIsAll = isT0RelatedUserSelectionEquivalentToAll(
    historyRelatedUserFilterIds,
    historyRelatedUserFilter,
    topSelectableRelatedUserIds,
    isMemberView ? false : hasUnlinkedTrades,
  );
  // 管理员筛选改为单选成员卡；旧浏览器若残留多选，保留当前筛选结果直到管理员重新在名单中选择。
  const adminFilterSelectedMemberId = canManage
    && relatedUserFilterIds.length === 1
    && /^\d+$/.test(relatedUserFilterIds[0])
    ? Number(relatedUserFilterIds[0])
    : null;
  const adminFilterSelectedMember = previewMembers.find((member) => member.id === adminFilterSelectedMemberId) ?? null;
  const adminFilterSummary = topRelatedUserSelectionIsAll || relatedUserFilterIds.length === 0
    ? "全部"
    : adminFilterSelectedMember?.name
      || relatedUserFilterOptions.find((option) => option.id === relatedUserFilterIds[0])?.summaryLabel
      || (relatedUserFilterIds.length === 1 ? `用户#${relatedUserFilterIds[0]}` : `已选 ${relatedUserFilterIds.length} 项`);
  const isAdminFilterMemberPicker = previewMemberPickerMode === "filter";
  const activeAdminMemberPickerId = isAdminFilterMemberPicker
    ? adminFilterSelectedMemberId
    : (previewUserId ?? adminUnifiedSelectedMemberId);
  const historyFilterGridTemplateColumns = useMemo(() => {
    const summaryFor = (label: string, options: T0MultiSelectOption[], selectedIds: string[]) => {
    if (label === "用户" && historyRelatedUserSelectionIsAll) return "用户全部";
    const selected = options.filter((option) => selectedIds.includes(option.id));
    if (selected.length === 0) return `${label}全部`;
    if (selected.length === 1) return `${label}${selected[0].summaryLabel ?? selected[0].label}`;
    return `${label}已选 ${selected.length} 项`;
    };
    const filters = [
      { summary: summaryFor("用户", relatedUserFilterOptions, historyRelatedUserFilterIds), selectedCount: historyRelatedUserFilterIds.length },
      { summary: summaryFor("项目", historyRelatedFundFilterOptions, historyRelatedFundFilterIds), selectedCount: historyRelatedFundFilterIds.length },
    ];
    if (!isMemberView) {
      filters.unshift({ summary: summaryFor("账户", accountFilterOptions, historyAccountFilterIds), selectedCount: historyAccountFilterIds.length });
    }
    return buildT0FilterGridTemplateColumns(filters);
  }, [accountFilterOptions, isMemberView, relatedUserFilterOptions, historyRelatedFundFilterOptions, historyAccountFilterIds, historyRelatedUserFilterIds, historyRelatedFundFilterIds, historyRelatedUserSelectionIsAll]);
  const hasActiveHistoryDetailFilters = (!isMemberView && historyAccountFilterIds.length > 0)
    || historyRelatedUserFilterIds.length > 0
    || historyRelatedFundFilterIds.length > 0
    || historyInstrumentTypeFilterIds.length > 0
    || historyExecutionFilter !== "all"
    || historyHideLocked
    || (historyUsesIncomeCategories && (historyIncomeKindFilterIds.length > 0 || historyIncomeSourceFilterIds.length > 0));
  const canFilterMemberHistoryIncome = historyUsesIncomeCategories && historyMemberIncomeKindFilterOptions.length > 0;
  const historyInstrumentFilterSummary = getT0InstrumentFilterSummary(historyInstrumentTypeFilterIds);
  const historyExecutionFilterSummary = getT0ExecutionFilterSummary(historyExecutionFilter, historyHideLocked);
  const historyTypeStatusGridTemplateColumns = useMemo(
    () => buildT0FilterGridTemplateColumns([
      // 两项都按当前文字共同分配空间；不能因另一项仍为“全部”而把已选类型压成极窄固定宽度。
      { summary: historyInstrumentFilterSummary, selectedCount: 1 },
      { summary: historyExecutionFilterSummary, selectedCount: 1 },
    ]),
    [historyInstrumentFilterSummary, historyExecutionFilterSummary],
  );
  useEffect(() => {
    setHistoryAccountFilterIds((current) => current.filter((id) => accounts.some((account) => account.id === id)));
    setHistoryRelatedUserFilterIds((current) => current.filter((id) => {
      if (isMemberView) return memberSourceUserFilterOptions.some((option) => option.id === id);
      if (id === "unlinked" || recentRelatedUsers.some((user) => user.id === id)) return true;
      const rootUserId = getT0ReferralDescendantsRootUserId(id);
      return Boolean(rootUserId && (!referralDataLoaded || referralDescendantsByRootUserId.has(rootUserId)));
    }));
    setHistoryRelatedFundFilterIds((current) => current.filter((id) => id === "unclassified" || relatedFunds.some((fund) => fund.id === id)));
  }, [accounts, isMemberView, memberSourceUserFilterOptions, recentRelatedUsers, referralDataLoaded, referralDescendantsByRootUserId, relatedFunds]);
  useEffect(() => {
    const selectableIds = new Set(historyMemberIncomeKindFilterOptions.map((option) => option.id));
    setHistoryIncomeKindFilterIds((current) => {
      const next = current.filter((id) => selectableIds.has(id));
      return hasSameT0StringArrayValues(current, next) ? current : next;
    });
  }, [historyMemberIncomeKindFilterOptions]);
  useEffect(() => {
    const selectableIds = new Set(historyMemberIncomeSourceFilterOptions.map((option) => option.id));
    setHistoryIncomeSourceFilterIds((current) => {
      const next = current.filter((id) => selectableIds.has(id));
      return hasSameT0StringArrayValues(current, next) ? current : next;
    });
  }, [historyMemberIncomeSourceFilterOptions]);
  // 成员端历史记录复用顶部的“订单来源”多选；它只收窄已经授权的本人/分佣/共享来源。
  useEffect(() => {
    if (!isMemberView) return;
    setHistoryAccountFilterIds((current) => current.length === 0 ? current : []);
    setHistoryRelatedUserFilterIds((current) => current.join("|") === relatedUserFilterIds.join("|")
      ? current
      : relatedUserFilterIds);
    setRelatedFundFilterIds((current) => current.filter((id) => (
      id === "unclassified" || availableRelatedFunds.some((fund) => fund.id === id)
    )));
    setHistoryRelatedFundFilterIds([]);
  }, [availableRelatedFunds, isMemberView, relatedUserFilterIds]);
  const topFilterGridTemplateColumns = useMemo(() => {
    const summaryFor = (label: string, options: T0MultiSelectOption[], selectedIds: string[]) => {
      if (label === "用户" && topRelatedUserSelectionIsAll) return "用户全部";
      const selected = options.filter((option) => selectedIds.includes(option.id));
      if (selected.length === 0) return `${label}全部`;
      if (selected.length === 1) return `${label}${selected[0].summaryLabel ?? selected[0].label}`;
      return `${label}已选 ${selected.length} 项`;
    };
    // 管理员保留账户、用户、项目三项；成员端仅展示用户与项目，均按内容智能分配宽度。
    const accountSummary = summaryFor("账户", accountFilterOptions, selectedAccountIds);
    const userSummary = summaryFor("用户", relatedUserFilterOptions, relatedUserFilterIds);
    const fundSummary = shouldLockMemberFundFilter
      ? `项目${lockedRelatedFundName}`
      : summaryFor("项目", relatedFundFilterOptions, relatedFundFilterIds);
    const accountSpec = {
      summary: accountSummary,
      selectedCount: selectedAccountIds.length,
    };
    const userSpec = {
      summary: userSummary,
      selectedCount: topRelatedUserSelectionIsAll ? 0 : relatedUserFilterIds.length,
    };
    const fundSpec = {
      summary: fundSummary,
      // 只有一个项目时显示为固定默认值，但不应挤占成员端两栏的初始等宽布局。
      selectedCount: isMemberView && shouldLockMemberFundFilter ? 0 : relatedFundFilterIds.length,
    };
    // 成员端“用户”现在可从已授权订单来源中多选，用户/项目二栏按当前摘要智能分配宽度。
    if (isMemberView) return buildT0FilterGridTemplateColumns([userSpec, fundSpec]);
    return buildT0FilterGridTemplateColumns(isMemberView
      ? [userSpec, fundSpec]
      : [accountSpec, userSpec, fundSpec]);
  }, [accountFilterOptions, isMemberView, lockedRelatedFundName, memberRelatedUserName, relatedFundFilterOptions, relatedUserFilterOptions, relatedFundFilterIds, relatedUserFilterIds, selectedAccountIds, shouldLockMemberFundFilter, topRelatedUserSelectionIsAll]);
  const topInstrumentFilterSummary = getT0InstrumentFilterSummary(instrumentTypeFilterIds);
  const topExecutionFilterSummary = getT0ExecutionFilterSummary(executionFilter, hideLocked);
  const topTypeStatusGridTemplateColumns = useMemo(
    () => buildT0FilterGridTemplateColumns([
      // 管理端与用户端均以当前两项文字作为整体智能分配，保证“期权 + 全部状态”等组合不挤压类型。
      { summary: topInstrumentFilterSummary, selectedCount: 1 },
      { summary: topExecutionFilterSummary, selectedCount: 1 },
    ]),
    [topExecutionFilterSummary, topInstrumentFilterSummary],
  );
  const allJournalActionsSelected = availableJournalActions.length > 0
    && availableJournalActions.every((action) => journalActionFilters.has(action));
  const selectJournalActionFilter = (action: TradeAction) => {
    setRecentJournalPage(1);
    // 交易动作与订单／佣金／共享是两种查看维度：点动作时退出收入分类，避免开仓被收入列表隐藏。
    setHistoryIncomeKindFilterIds([]);
    setHistoryIncomeSourceFilterIds([]);
    // 历史动作标签采用单选语义，避免多个动作同时高亮而难以辨认当前口径。
    setJournalActionFilters(new Set([action]));
  };
  const entryRelatedFunds = useMemo(
    () => relatedFunds.filter((fund) => fund.relatedUserId === entryForm.relatedUserId),
    [relatedFunds, entryForm.relatedUserId],
  );
  // 关联用户弹层按“常用”排序：只计本账本真实关联订单，不让分佣、共享受益或筛选视图影响录单习惯。
  const entryRelatedUserUsageCountById = useMemo(() => {
    const counts = new Map<string, number>();
    for (const trade of rawJournalTrades) {
      const userId = String(trade.relatedUserId || "").trim();
      if (!userId || trade.relatedUserHidden) continue;
      counts.set(userId, (counts.get(userId) || 0) + 1);
    }
    return counts;
  }, [rawJournalTrades]);
  // 速记账本会定时同步历史关联用户；刚从全局搜索选中的用户尚未产生流水时，
  // 服务端列表不会立刻包含他。把当前表单选择单独补入下拉，避免移动端回跳成“暂不关联”。
  const entryRelatedUserOptions = useMemo<PreviewRelatedUser[]>(() => {
    const options = !entryForm.relatedUserId || recentRelatedUsers.some((user) => user.id === entryForm.relatedUserId)
      ? recentRelatedUsers
      : [{
        id: entryForm.relatedUserId,
        name: entryForm.relatedUserName || entryForm.relatedUsername || `用户#${entryForm.relatedUserId}`,
        username: entryForm.relatedUsername || undefined,
      }, ...recentRelatedUsers];
    return options.slice().sort((left, right) => {
      // 最终规则：常用用户优先；同等常用时，累计充值更多的优先。
      const usageDifference = (entryRelatedUserUsageCountById.get(right.id) || 0) - (entryRelatedUserUsageCountById.get(left.id) || 0);
      if (usageDifference !== 0) return usageDifference;
      const depositDifference = Number(payoutDepositAmountByRelatedUser.get(right.id) || 0) - Number(payoutDepositAmountByRelatedUser.get(left.id) || 0);
      if (Math.abs(depositDifference) > 0.000001) return depositDifference;
      const lastUsedDifference = String(right.lastUsedAt || "").localeCompare(String(left.lastUsedAt || ""));
      if (lastUsedDifference !== 0) return lastUsedDifference;
      return left.name.localeCompare(right.name, "zh-CN");
    });
  }, [entryForm.relatedUserId, entryForm.relatedUserName, entryForm.relatedUsername, entryRelatedUserUsageCountById, payoutDepositAmountByRelatedUser, recentRelatedUsers]);
  const profitShareRecipientCandidates = useMemo(
    () => entryRelatedUserOptions.filter((user) => !profitShareAllocations.some((allocation) => allocation.user.id === user.id)),
    [entryRelatedUserOptions, profitShareAllocations],
  );
  const directoryManagerItems = useMemo<Array<{ id: string; name: string; secondary?: string }>>(() => {
    if (directoryManagerKind === "account") {
      return accounts.map((account) => ({ id: account.id, name: account.name }));
    }
    if (directoryManagerKind === "relatedFund") {
      return entryRelatedFunds.map((fund) => ({ id: fund.id, name: fund.name }));
    }
    if (directoryManagerKind === "relatedUser") {
      return recentRelatedUsers.map((user) => ({
        id: user.id,
        name: user.name,
        secondary: user.username ? `@${user.username}` : undefined,
      }));
    }
    return [];
  }, [accounts, directoryManagerKind, entryRelatedFunds, recentRelatedUsers]);
  const directoryManagerTitle = directoryManagerKind === "account"
    ? "管理账户名称"
    : directoryManagerKind === "relatedFund"
      ? "管理项目名称"
      : "管理已关联用户";
  const quantityQuickOptions = useMemo(
    () => Array.from(new Set([lastSavedQuantity, ...DEFAULT_QUANTITY_QUICK_OPTIONS].filter(Boolean).map(normalizeEthQuantity))),
    [lastSavedQuantity],
  );
  const quantityFormatError = useMemo(() => {
    const value = entryForm.quantity.trim();
    if (!value) return null;
    if (!ETH_QUANTITY_PATTERN.test(value)) return "整数最多4位，小数最多2位";
    if (Number(value) <= 0) return "数量必须大于 0";
    return null;
  }, [entryForm.quantity]);
  const isGridOpeningEntry = ACTIONS[entryForm.action].opening && entryForm.instrumentType === "grid";
  // 只在新建普通开仓中启用：历史订单编辑、平仓、期权、网格均保留原始完整价格输入，避免误改成交事实。
  const smartOpeningPricePrefix = entryForm.priceInputPrefix ?? "";
  const isSmartOpeningPriceInput = ACTIONS[entryForm.action].opening
    && !entryForm.editingEntryId
    && (entryForm.instrumentType === "spot" || entryForm.instrumentType === "contract")
    && Boolean(smartOpeningPricePrefix);
  const smartOpeningPriceUsesPrefix = isSmartOpeningPriceInput
    && (entryForm.price === "" || entryForm.price.startsWith(smartOpeningPricePrefix));
  const smartOpeningPriceDisplayValue = smartOpeningPriceUsesPrefix
    ? (entryForm.price || smartOpeningPricePrefix)
    : entryForm.price;
  const smartOpeningPriceIsIncomplete = smartOpeningPriceUsesPrefix
    && entryForm.price !== ""
    && !/^\d{4}(?:\.\d*)?$/.test(entryForm.price);
  const gridReferencePrice = useMemo(() => {
    if (!isGridOpeningEntry) return null;
    const reference = entryForm.gridDirection === "long" ? entryForm.gridRangeMin : entryForm.gridRangeMax;
    const price = Number(reference);
    return Number.isFinite(price) && price > 0 ? price : null;
  }, [entryForm.gridDirection, entryForm.gridRangeMax, entryForm.gridRangeMin, isGridOpeningEntry]);
  const estimatedFeeUsdt = useMemo(() => {
    if (entryForm.instrumentType === "option") return 0;
    const quantity = Number(normalizeEthQuantity(entryForm.quantity));
    const price = gridReferencePrice ?? Number(entryForm.price);
    if (quantityFormatError || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price <= 0) return null;
    return Number((quantity * price * OKX_VIP2_TAKER_FEE_RATE).toFixed(8));
  }, [entryForm.instrumentType, entryForm.quantity, entryForm.price, gridReferencePrice, quantityFormatError]);
  const openingArchivePrice = useMemo(() => {
    const price = gridReferencePrice ?? Number(entryForm.price);
    if (!ACTIONS[entryForm.action].opening || !Number.isFinite(price) || price <= 0) return null;
    return archivePriceForSide(ACTIONS[entryForm.action].side, price);
  }, [entryForm.action, entryForm.price, gridReferencePrice]);
  // 资金、盈亏、手续费和 FIFO 仍仅使用实际成交单；挂单在成交前绝不参与这些财务口径。
  const buckets = useMemo(() => buildPositionBuckets(selectedFilledTrades), [selectedFilledTrades]);
  // “总仓位”则忠实反映顶部状态筛选：状态为全部时同时展示挂单与已成交数量，
  // 切换至“已成交”或“已挂单”后只统计对应状态的数量。
  const totalPositionBuckets = useMemo(() => buildPositionBuckets(selectedTrades), [selectedTrades]);
  const ladderOpeningClosingAllocations = useMemo(
    () => buildOpeningClosingAllocations(selectedFilledTrades),
    [selectedFilledTrades],
  );
  const integratedDisplayBuckets = useMemo(
    () => buildIntegratedDisplayBuckets(selectedTrades, ladderOpeningClosingAllocations, integratedArchiveStep),
    [selectedTrades, ladderOpeningClosingAllocations, integratedArchiveStep],
  );
  // 逐笔详情恒定按真实十美元档展开；整合详情沿用进入时选定的宽档。
  const isIndividualQuoteDetail = entrySheetLadderDisplayModeRef.current === "individual";
  const entryArchiveStep = isIndividualQuoteDetail || (!ACTIONS[entryForm.action].opening && closingSourceTrade)
    ? POSITION_ARCHIVE_STEP
    : entrySheetArchiveStepRef.current;
  // 已实现收益不随500ms行情更新变化；在交易集合改变时一次性完成FIFO，行情刷新仅重算浮盈。
  const selectedFilledRecentJournalDetails = useMemo(
    () => buildRecentJournalTradeDetails(selectedFilledTrades),
    [selectedFilledTrades],
  );
  const summary = useMemo(
    () => calculateSummary(buckets, markPrice, selectedFilledTrades, selectedFilledRecentJournalDetails),
    [buckets, markPrice, selectedFilledRecentJournalDetails, selectedFilledTrades],
  );
  // 首屏、分方向累计与历史逐笔明细统一使用已扣开仓、平仓手续费的净收益口径。
  const totalNetProfitDetails = useMemo(() => {
    const rawDetails = selectedFilledTrades
      .filter((trade) => trade.symbol === "ETH" && !ACTIONS[trade.action].opening)
      .map((trade) => {
        const detail = selectedFilledRecentJournalDetails.get(trade.id);
        return detail?.netPnl === undefined ? null : {
          trade,
          quantity: trade.quantity,
          netPnl: detail.netPnl,
        };
      })
      .filter((detail): detail is { trade: PreviewTrade; quantity: number; netPnl: number } => detail !== null)
      .sort((left, right) => right.trade.createdAt.localeCompare(left.trade.createdAt) || right.trade.id.localeCompare(left.trade.id));
    return rawDetails.map((item) => {
      const payout = resolveDisplayedPayout(item.trade, item.netPnl);
      return payout ? { ...item, netPnl: payout.netPnl } : item;
    });
  }, [isMemberView, profitShareSnapshots, resolveDisplayedPayout, selectedFilledRecentJournalDetails, selectedFilledTrades, trades, viewerProfitShareBeneficiaryUserId]);
  const totalNetProfit = totalNetProfitDetails.reduce((total, detail) => total + detail.netPnl, 0);
  const payoutSharedIncomeTransfers = useMemo(() => {
    const targetUserId = Number(payoutTargetRelatedUserId);
    return Number.isInteger(targetUserId) && targetUserId > 0
      ? sharedIncomeTransfers.filter((transfer) => transfer.recipientUserId === targetUserId)
      : [];
  }, [payoutTargetRelatedUserId, sharedIncomeTransfers]);
  const payoutSharedIncomeTotal = payoutSharedIncomeTransfers.reduce((total, transfer) => total + transfer.amount, 0);
  // 单一用户总收益统一由三部分构成：本人订单、原订单分佣、已到账共享收益。
  // 管理员全量视图没有单一收款人，因此共享收益已包含在原平仓净收益中，不能再次相加。
  const totalIncome = totalNetProfit + payoutSharedIncomeTotal;
  // 收益账本、顶部总收益、XIRR 与归因报告必须使用同一完整口径，避免共享收益只在局部页面可见。
  const payoutBookTotalIncome = totalIncome;
  const payoutBookTotalIncomeClass = payoutBookTotalIncome > 0 ? "text-rose-600" : payoutBookTotalIncome < 0 ? "text-emerald-600" : "text-slate-700";
  const payoutIncomeEntries = useMemo(() => {
    const tradeEntries = totalNetProfitDetails
      .filter((detail) => Number.isFinite(detail.netPnl) && Math.abs(detail.netPnl) > 0.000001)
      .map((detail) => ({ kind: "trade" as const, id: `trade-${detail.trade.id}`, createdAt: detail.trade.createdAt, detail }));
    const sharedEntries = payoutSharedIncomeTransfers
      .map((transfer) => {
        const sourceTrade = rawJournalTrades.find((trade) => (
          !ACTIONS[trade.action].opening && getStoredEntryId(trade) === transfer.closingEntryId
        ));
        return {
          kind: "shared" as const,
          id: `shared-${transfer.id}`,
          createdAt: sourceTrade?.createdAt || transfer.createdAt,
          transfer,
          sourceTrade,
        };
      });
    return [...tradeEntries, ...sharedEntries]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
  }, [payoutSharedIncomeTransfers, rawJournalTrades, totalNetProfitDetails]);
  const payoutIncomeTotalPages = Math.max(1, Math.ceil(payoutIncomeEntries.length / PAYOUT_INCOME_PAGE_SIZE));
  const pagedPayoutIncomeEntries = useMemo(() => {
    const start = (payoutIncomePage - 1) * PAYOUT_INCOME_PAGE_SIZE;
    return payoutIncomeEntries.slice(start, start + PAYOUT_INCOME_PAGE_SIZE);
  }, [payoutIncomeEntries, payoutIncomePage]);
  useEffect(() => {
    setPayoutIncomePage((current) => Math.min(current, payoutIncomeTotalPages));
  }, [payoutIncomeTotalPages]);
  useEffect(() => {
    setPayoutIncomePage(1);
  }, [payoutTargetRelatedUserId]);
  const globalLedgerRows = useMemo(() => {
    // 全局账本关闭时其重型历史分佣/FIFO汇总完全不可见；
    // 不应随着报价行情每500毫秒刷新而占用平仓分配页的主线程。
    if (!canManage || !showGlobalLedger) return [];
    const relatedUserById = new Map(recentRelatedUsers.map((user) => [user.id, user]));
    const tradesByUserId = new Map<string, PreviewTrade[]>();
    const knownUserNames = new Map<string, { name: string; username?: string }>();
    for (const trade of trades) {
      const userId = String(trade.relatedUserId || "").trim();
      if (!userId || trade.relatedUserHidden) continue;
      const rows = tradesByUserId.get(userId) || [];
      rows.push(trade);
      tradesByUserId.set(userId, rows);
      if (!knownUserNames.has(userId)) {
        knownUserNames.set(userId, {
          name: trade.relatedUserName || trade.relatedUsername || `用户#${userId}`,
          username: trade.relatedUsername,
        });
      }
    }
    const sharedIncomeByUserId = new Map<string, number>();
    const sharedIncomeExpenseByUserId = new Map<string, number>();
    for (const transfer of sharedIncomeTransfers) {
      const recipientUserId = String(transfer.recipientUserId);
      const sourceUserId = String(transfer.sourceUserId || "").trim();
      sharedIncomeByUserId.set(recipientUserId, (sharedIncomeByUserId.get(recipientUserId) || 0) + transfer.amount);
      // 共享支出归属来源订单人：这笔正向平仓收益中被优先划拨出去的部分，不与原分佣混算。
      if (sourceUserId) {
        sharedIncomeExpenseByUserId.set(sourceUserId, (sharedIncomeExpenseByUserId.get(sourceUserId) || 0) + transfer.amount);
        if (!knownUserNames.has(sourceUserId)) knownUserNames.set(sourceUserId, { name: transfer.sourceUserName });
      }
      if (!knownUserNames.has(recipientUserId)) knownUserNames.set(recipientUserId, { name: transfer.recipientUserName, username: transfer.recipientUsername });
    }
    // 普通交易收益按“共享先分配，剩余再按本单快照分佣”的同一口径归属。
    // 对每位用户分别保留：本人订单实际归属、来自他人订单的佣金收益、本人订单分给他人的佣金支出。
    // 共享收益是独立的优先分配，不计入佣金支出。
    const orderProfitByUserId = new Map<string, number>();
    const commissionIncomeByUserId = new Map<string, number>();
    const commissionExpenseByUserId = new Map<string, number>();
    const addIncome = (target: Map<string, number>, userId: string, amount: number) => {
      if (!userId || !Number.isFinite(amount)) return;
      target.set(userId, (target.get(userId) || 0) + amount);
    };
    const detailsByEntryId = buildRecentJournalTradeDetails(trades);
    for (const closing of trades) {
      if (closing.isPending || ACTIONS[closing.action].opening) continue;
      const netPnl = Number(detailsByEntryId.get(closing.id)?.netPnl);
      if (!Number.isFinite(netPnl)) continue;
      const sourceUserId = String(closing.relatedUserId || "").trim();
      const distributions = buildClosingProfitShareDistribution({
        trades,
        snapshots: profitShareSnapshots,
        closing,
        displayedNetPnl: netPnl,
        sharedIncomeReductions: sharedIncomeReductionsByClosingEntryId,
      });
      if (distributions.length === 0) {
        if (!sourceUserId) continue;
        const regularNetPnl = getRegularDistributableNetPnl(netPnl, getStoredEntryId(closing), sharedIncomeReductionsByClosingEntryId);
        addIncome(orderProfitByUserId, sourceUserId, regularNetPnl);
        continue;
      }
      for (const distribution of distributions) {
        const beneficiaryUserId = String(distribution.beneficiaryUserId);
        if (beneficiaryUserId === sourceUserId) {
          addIncome(orderProfitByUserId, beneficiaryUserId, distribution.netPnl);
        } else {
          addIncome(commissionIncomeByUserId, beneficiaryUserId, distribution.netPnl);
          // 佣金支出是这位下单人原订单上实际划给其他受益人的分佣；共享转账不计入此项。
          addIncome(commissionExpenseByUserId, sourceUserId, distribution.netPnl);
        }
        if (!knownUserNames.has(beneficiaryUserId)) knownUserNames.set(beneficiaryUserId, { name: distribution.beneficiaryUserName });
      }
    }
    const userIds = new Set([
      ...tradesByUserId.keys(),
      ...sharedIncomeByUserId.keys(),
      ...orderProfitByUserId.keys(),
      ...commissionIncomeByUserId.keys(),
      ...commissionExpenseByUserId.keys(),
      ...sharedIncomeExpenseByUserId.keys(),
    ]);
    return Array.from(userIds).map((userId) => {
      const userTrades = tradesByUserId.get(userId) || [];
      const relatedUser = relatedUserById.get(userId);
      const filledTrades = userTrades.filter((trade) => !trade.isPending);
      const buckets = buildPositionBuckets(filledTrades);
      const longOpeningCount = filledTrades.filter((trade) => trade.action === "openLong").length;
      const shortOpeningCount = filledTrades.filter((trade) => trade.action === "openShort").length;
      const longQuantity = buckets
        .filter((bucket) => bucket.side === "long" && bucket.remainingQuantity > 0.0000001)
        .reduce((total, bucket) => total + bucket.remainingQuantity, 0);
      const shortQuantity = buckets
        .filter((bucket) => bucket.side === "short" && bucket.remainingQuantity > 0.0000001)
        .reduce((total, bucket) => total + bucket.remainingQuantity, 0);
      const closedTrades = filledTrades.filter((trade) => !ACTIONS[trade.action].opening);
      const floatingPnl = markPrice === null ? null : calculateSummary(buckets, markPrice, filledTrades, detailsByEntryId).unrealized;
      const orderProfit = orderProfitByUserId.get(userId) || 0;
      const commissionIncome = commissionIncomeByUserId.get(userId) || 0;
      const commissionExpense = commissionExpenseByUserId.get(userId) || 0;
      const realizedTradeIncome = orderProfit + commissionIncome;
      const sharedIncome = sharedIncomeByUserId.get(userId) || 0;
      const sharedIncomeExpense = sharedIncomeExpenseByUserId.get(userId) || 0;
      const sharedActivityTimes = sharedIncomeTransfers
        .filter((transfer) => String(transfer.recipientUserId) === userId)
        .map((transfer) => transfer.createdAt);
      const lastActivityAt = [
        ...userTrades.map((trade) => getTradeActivityTime(trade)),
        ...sharedActivityTimes,
      ]
        .sort()
        .at(-1) || "";
      const fallbackTrade = userTrades[0];
      const fallbackUser = knownUserNames.get(userId);
      return {
        userId,
        name: relatedUser?.name || fallbackUser?.name || fallbackTrade?.relatedUserName || fallbackTrade?.relatedUsername || `用户#${userId}`,
        username: relatedUser?.username || fallbackUser?.username || fallbackTrade?.relatedUsername || "",
        longQuantity,
        shortQuantity,
        longOpeningCount,
        shortOpeningCount,
        openingCount: longOpeningCount + shortOpeningCount,
        closedCount: closedTrades.length,
        orderCount: userTrades.length,
        floatingPnl,
        orderProfit,
        commissionIncome,
        commissionExpense,
        realizedTradeIncome,
        sharedIncome,
        sharedIncomeExpense,
        totalIncome: realizedTradeIncome + sharedIncome,
        lastActivityAt,
      };
    }).sort((left, right) => (
      Number((right.longQuantity + right.shortQuantity) > 0.0000001) - Number((left.longQuantity + left.shortQuantity) > 0.0000001)
      || right.lastActivityAt.localeCompare(left.lastActivityAt)
      || left.name.localeCompare(right.name, "zh-CN")
    ));
  }, [canManage, markPrice, profitShareSnapshots, recentRelatedUsers, sharedIncomeReductionsByClosingEntryId, sharedIncomeTransfers, showGlobalLedger, trades]);
  // 用户视角名单只在弹窗打开时计算四项概要；绝不改变全局账本开关或任何真实流水。
  // “回款”严格读取已登记提现 ÷ 累计投入，不把未提现的订单、分佣或共享收益当作现金回款。
  const previewMemberCardMetricsById = useMemo(() => {
    const metricsById = new Map<number, T0PreviewMemberCardMetrics>();
    if (!canUseMemberPreview || !previewMemberPickerOpen || previewMembers.length === 0) return metricsById;
    // 只使用全体只读资金流水回包。回包尚未就绪时不能将“未知”显示为 0。
    const fundsLoaded = Array.isArray(t0GlobalPayoutLogsQuery.data);
    const cashFlowsByMemberId = new Map<number, T0JournalPayoutLog[]>();
    if (fundsLoaded) {
      for (const cashFlow of globalPayoutLogs) {
        if (!Number.isInteger(cashFlow.relatedUserId) || cashFlow.relatedUserId <= 0) continue;
        const memberCashFlows = cashFlowsByMemberId.get(cashFlow.relatedUserId);
        if (memberCashFlows) memberCashFlows.push(cashFlow);
        else cashFlowsByMemberId.set(cashFlow.relatedUserId, [cashFlow]);
      }
    }

    for (const member of previewMembers) {
      // 多空仅统计该用户本人实际下单的已成交剩余仓位；分佣受益人不会被误展示成持有整张来源订单。
      const ownFilledTrades = rawJournalTrades.filter((trade) => (
        !trade.isPending && Number(trade.relatedUserId || 0) === member.id
      ));
      const ownBuckets = buildPositionBuckets(ownFilledTrades);
      const longQuantity = ownBuckets
        .filter((bucket) => bucket.side === "long" && bucket.remainingQuantity > 0.0000001)
        .reduce((total, bucket) => total + bucket.remainingQuantity, 0);
      const shortQuantity = ownBuckets
        .filter((bucket) => bucket.side === "short" && bucket.remainingQuantity > 0.0000001)
        .reduce((total, bucket) => total + bucket.remainingQuantity, 0);
      const memberCashFlows = cashFlowsByMemberId.get(member.id) || [];
      const cumulativeDepositAmount = memberCashFlows
        .filter((cashFlow) => cashFlow.direction === "deposit")
        .reduce((total, cashFlow) => total + cashFlow.amount, 0);
      const cumulativeWithdrawalAmount = memberCashFlows
        .filter((cashFlow) => cashFlow.direction === "withdrawal")
        .reduce((total, cashFlow) => total + cashFlow.amount, 0);
      metricsById.set(member.id, {
        longQuantity,
        shortQuantity,
        fundsLoaded,
        cumulativeDepositAmount,
        cashReturnRate: fundsLoaded && cumulativeDepositAmount > 0 ? cumulativeWithdrawalAmount / cumulativeDepositAmount : null,
      });
    }
    return metricsById;
  }, [canUseMemberPreview, globalPayoutLogs, previewMemberPickerOpen, previewMembers, rawJournalTrades, t0GlobalPayoutLogsQuery.data]);
  const globalLedgerSummary = useMemo(() => {
    const summary = globalLedgerRows.reduce((total, row) => ({
      longQuantity: total.longQuantity + row.longQuantity,
      shortQuantity: total.shortQuantity + row.shortQuantity,
      floatingPnl: total.floatingPnl + (row.floatingPnl ?? 0),
    }), { longQuantity: 0, shortQuantity: 0, floatingPnl: 0 });
    const netPosition = summary.longQuantity - summary.shortQuantity;
    return {
      ...summary,
      netPosition,
      netPositionLabel: netPosition > 0.0000001 ? "多" : netPosition < -0.0000001 ? "空" : "平",
      netPositionClass: netPosition > 0.0000001 ? "text-rose-600" : netPosition < -0.0000001 ? "text-emerald-600" : "text-slate-500",
    };
  }, [globalLedgerRows]);
  const globalFundsRows = useMemo(() => {
    if (!canManage || !showGlobalLedger) return [];
    const relatedUserById = new Map(recentRelatedUsers.map((user) => [user.id, user]));
    const rowsByUserId = new Map<string, { userId: string; name: string; deposit: number; orderProfit: number; commissionProfit: number; sharedProfit: number; commissionExpense: number; sharedExpense: number; withdrawal: number }>();
    const ensureRow = (userId: string, fallbackName?: string) => {
      const existing = rowsByUserId.get(userId);
      if (existing) return existing;
      const user = relatedUserById.get(userId);
      const row = { userId, name: user?.name || fallbackName || `用户#${userId}`, deposit: 0, orderProfit: 0, commissionProfit: 0, sharedProfit: 0, commissionExpense: 0, sharedExpense: 0, withdrawal: 0 };
      rowsByUserId.set(userId, row);
      return row;
    };
    for (const row of globalLedgerRows) {
      const fundRow = ensureRow(row.userId, row.name);
      fundRow.orderProfit = row.orderProfit;
      fundRow.commissionProfit = row.commissionIncome;
      fundRow.sharedProfit = row.sharedIncome;
      fundRow.commissionExpense = row.commissionExpense;
      fundRow.sharedExpense = row.sharedIncomeExpense;
    }
    for (const transfer of sharedIncomeTransfers) {
      const userId = String(transfer.recipientUserId);
      if (!rowsByUserId.has(userId)) ensureRow(userId).sharedProfit += transfer.amount;
    }
    const payoutRows = Array.isArray(t0GlobalPayoutLogsQuery.data) ? t0GlobalPayoutLogsQuery.data : [];
    for (const log of payoutRows as any[]) {
      const userId = String(log.relatedUserId || "").trim();
      if (!userId) continue;
      const row = ensureRow(userId, String(log.relatedUserName || "").trim() || undefined);
      const amount = Number(log.amount || 0);
      if (!Number.isFinite(amount)) continue;
      if (String(log.direction) === "deposit") row.deposit += amount;
      else row.withdrawal += amount;
    }
    return Array.from(rowsByUserId.values()).sort((left, right) => (
      right.deposit - left.deposit
      || (right.orderProfit + right.commissionProfit + right.sharedProfit) - (left.orderProfit + left.commissionProfit + left.sharedProfit)
      || left.name.localeCompare(right.name, "zh-CN")
    ));
  }, [canManage, globalLedgerRows, recentRelatedUsers, sharedIncomeTransfers, showGlobalLedger, t0GlobalPayoutLogsQuery.data]);
  const globalFundsSummary = useMemo(() => globalFundsRows.reduce((total, row) => ({
    deposit: total.deposit + row.deposit,
    orderProfit: total.orderProfit + row.orderProfit,
    commissionProfit: total.commissionProfit + row.commissionProfit,
    sharedProfit: total.sharedProfit + row.sharedProfit,
    commissionExpense: total.commissionExpense + row.commissionExpense,
    sharedExpense: total.sharedExpense + row.sharedExpense,
    withdrawal: total.withdrawal + row.withdrawal,
  }), { deposit: 0, orderProfit: 0, commissionProfit: 0, sharedProfit: 0, commissionExpense: 0, sharedExpense: 0, withdrawal: 0 }), [globalFundsRows]);
  const sortedGlobalFundsRows = useMemo(() => {
    if (!globalFundsSort) return globalFundsRows;
    const getValue = (row: typeof globalFundsRows[number]) => {
      if (globalFundsSort.key === "deposit") return row.deposit;
      if (globalFundsSort.key === "withdrawal") return row.withdrawal;
      return row.deposit - row.withdrawal;
    };
    const direction = globalFundsSort.direction === "desc" ? -1 : 1;
    return globalFundsRows.slice().sort((left, right) => (
      (getValue(left) - getValue(right)) * direction
      || left.name.localeCompare(right.name, "zh-CN")
    ));
  }, [globalFundsRows, globalFundsSort]);
  const sortedGlobalIncomeRows = useMemo(() => {
    if (!globalIncomeSort) return globalFundsRows;
    const getValue = (row: typeof globalFundsRows[number]) => {
      if (globalIncomeSort.key === "order") return row.orderProfit;
      if (globalIncomeSort.key === "commission") return row.commissionProfit;
      if (globalIncomeSort.key === "shared") return row.sharedProfit;
      return row.orderProfit + row.commissionProfit + row.sharedProfit;
    };
    const direction = globalIncomeSort.direction === "desc" ? -1 : 1;
    return globalFundsRows.slice().sort((left, right) => (
      (getValue(left) - getValue(right)) * direction
      || left.name.localeCompare(right.name, "zh-CN")
    ));
  }, [globalFundsRows, globalIncomeSort]);
  const formatGlobalLedgerWhole = (value: number) => Math.round(Number(value) || 0).toLocaleString("zh-CN");
  /**
   * 管理员全局收益归因必须按同一笔平仓的最终去向拆分：
   * 共享收益先单独列示，余额才按原分佣快照归入订单收益或分佣收益。
   * 这样三项逐笔相加恰好等于全局净收益，既不遗漏共享，也不会重复计算。
   */
  const globalProfitAttribution = useMemo(() => {
    let ownTradingNetProfit = 0;
    let commissionShareNetProfit = 0;
    let sharedIncomeNetProfit = 0;
    const ownClosingIds = new Set<string>();
    const commissionClosingIds = new Set<string>();
    const includedClosingIds = new Set<string>();

    for (const detail of totalNetProfitDetails) {
      const netPnl = Number(detail.netPnl);
      if (!Number.isFinite(netPnl)) continue;
      const closing = detail.trade;
      const closingEntryId = getStoredEntryId(closing);
      includedClosingIds.add(closingEntryId);
      const regularPool = getRegularDistributableNetPnl(netPnl, closingEntryId, sharedIncomeReductionsByClosingEntryId);
      // 共享只可能来自正向净收益；以“原净收益 − 共享后剩余池”反算，可兼容历史记录与小数尾差。
      const sharedAmount = netPnl > 0 ? Math.max(0, netPnl - regularPool) : 0;
      sharedIncomeNetProfit += sharedAmount;

      const distributions = buildClosingProfitShareDistribution({
        trades,
        snapshots: profitShareSnapshots,
        closing,
        displayedNetPnl: netPnl,
        sharedIncomeReductions: sharedIncomeReductionsByClosingEntryId,
      });
      if (distributions.length === 0) {
        ownTradingNetProfit += regularPool;
        ownClosingIds.add(closingEntryId);
        continue;
      }

      const sourceUserId = Number(closing.relatedUserId || 0);
      let distributedRegularTotal = 0;
      for (const distribution of distributions) {
        const amount = Number(distribution.netPnl);
        if (!Number.isFinite(amount)) continue;
        distributedRegularTotal += amount;
        if (sourceUserId > 0 && distribution.beneficiaryUserId === sourceUserId) {
          ownTradingNetProfit += amount;
          ownClosingIds.add(closingEntryId);
        } else {
          commissionShareNetProfit += amount;
          commissionClosingIds.add(closingEntryId);
        }
      }
      // 快照缺项或历史迁移数据不完整时，任何未拆出的常规收益仍归下单用户，不能形成无归属差额。
      const regularGap = regularPool - distributedRegularTotal;
      if (Math.abs(regularGap) > 0.000001) {
        ownTradingNetProfit += regularGap;
        ownClosingIds.add(closingEntryId);
      }
    }

    return {
      ownTradingNetProfit,
      commissionShareNetProfit,
      sharedIncomeNetProfit,
      ownTradingCount: ownClosingIds.size,
      commissionShareCount: commissionClosingIds.size,
      sharedIncomeCount: sharedIncomeTransfers.filter((transfer) => includedClosingIds.has(transfer.closingEntryId)).length,
    };
  }, [profitShareSnapshots, sharedIncomeReductionsByClosingEntryId, sharedIncomeTransfers, totalNetProfitDetails, trades]);
  const totalProfitAttribution = useMemo(() => {
    const targetUserId = payoutTargetRelatedUserId;
    const hasIndividualScope = Number.isInteger(targetUserId) && targetUserId > 0;
    const ownTradingDetails = hasIndividualScope
      ? totalNetProfitDetails.filter((detail) => Number(detail.trade.relatedUserId || 0) === targetUserId)
      : totalNetProfitDetails;
    const commissionShareDetails = hasIndividualScope
      ? totalNetProfitDetails.filter((detail) => Number(detail.trade.relatedUserId || 0) !== targetUserId)
      : [];
    const ownTradingNetProfit = hasIndividualScope
      ? ownTradingDetails.reduce((total, detail) => total + detail.netPnl, 0)
      : globalProfitAttribution.ownTradingNetProfit;
    const commissionShareNetProfit = hasIndividualScope
      ? commissionShareDetails.reduce((total, detail) => total + detail.netPnl, 0)
      : globalProfitAttribution.commissionShareNetProfit;
    const sharedIncomeNetProfit = hasIndividualScope
      ? payoutSharedIncomeTotal
      : globalProfitAttribution.sharedIncomeNetProfit;
    const contributionBase = Math.abs(ownTradingNetProfit) + Math.abs(commissionShareNetProfit) + Math.abs(sharedIncomeNetProfit);
    const ownTradingRatio = contributionBase > 0.000001 ? Math.abs(ownTradingNetProfit) / contributionBase : 0;
    return {
      hasIndividualScope,
      ownTradingNetProfit,
      commissionShareNetProfit,
      sharedIncomeNetProfit,
      ownTradingCount: hasIndividualScope ? ownTradingDetails.length : globalProfitAttribution.ownTradingCount,
      commissionShareCount: hasIndividualScope ? commissionShareDetails.length : globalProfitAttribution.commissionShareCount,
      sharedIncomeCount: hasIndividualScope ? payoutSharedIncomeTransfers.length : globalProfitAttribution.sharedIncomeCount,
      ownTradingRatio,
      commissionShareRatio: contributionBase > 0.000001 ? Math.abs(commissionShareNetProfit) / contributionBase : 0,
      sharedIncomeRatio: contributionBase > 0.000001 ? Math.abs(sharedIncomeNetProfit) / contributionBase : 0,
      // 总数始终直接复用页面顶部“总收益”的同一汇总值，展示与归因两处绝不因浮点累加顺序出现尾差。
      total: totalIncome,
      targetLabel: hasIndividualScope ? payoutTargetUserIdentity.name : "全部用户",
    };
  }, [globalProfitAttribution, payoutSharedIncomeTotal, payoutSharedIncomeTransfers.length, payoutTargetRelatedUserId, payoutTargetUserIdentity.name, totalIncome, totalNetProfitDetails]);
  const activeTotalProfitDetailTab = totalProfitDetailTab;
  // 与结算页统一：颜色只表达收益类别，订单蓝、分佣黄、共享绿；金额正负继续由金额本身的符号表达。
  const totalProfitCompositionItems = useMemo(() => [
    { key: "order", label: "订单", value: totalProfitAttribution.ownTradingNetProfit, ratio: totalProfitAttribution.ownTradingRatio, color: "#2563eb", trackColor: "#dbeafe", gradient: "linear-gradient(90deg, #2563eb 0%, #38bdf8 100%)" },
    { key: "commission", label: "分佣", value: totalProfitAttribution.commissionShareNetProfit, ratio: totalProfitAttribution.commissionShareRatio, color: "#f59e0b", trackColor: "#fef3c7", gradient: "linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)" },
    { key: "shared", label: "共享", value: totalProfitAttribution.sharedIncomeNetProfit, ratio: totalProfitAttribution.sharedIncomeRatio, color: "#16a34a", trackColor: "#dcfce7", gradient: "linear-gradient(90deg, #16a34a 0%, #4ade80 100%)" },
  ], [totalProfitAttribution.commissionShareNetProfit, totalProfitAttribution.commissionShareRatio, totalProfitAttribution.ownTradingNetProfit, totalProfitAttribution.ownTradingRatio, totalProfitAttribution.sharedIncomeNetProfit, totalProfitAttribution.sharedIncomeRatio]);
  const totalProfitCompositionGradient = useMemo(() => {
    const orderEnd = totalProfitCompositionItems[0].ratio * 100;
    const commissionEnd = orderEnd + totalProfitCompositionItems[1].ratio * 100;
    return orderEnd > 0 || commissionEnd > 0 || totalProfitCompositionItems[2].ratio > 0
      ? `conic-gradient(#2563eb 0 ${orderEnd.toFixed(3)}%, #f59e0b ${orderEnd.toFixed(3)}% ${commissionEnd.toFixed(3)}%, #16a34a ${commissionEnd.toFixed(3)}% 100%)`
      : "#cbd5e1";
  }, [totalProfitCompositionItems]);
  const [totalProfitCompositionWhole, totalProfitCompositionFraction] = formatPrice(totalProfitAttribution.total).split(".");
  // 圆环中心预留至六位整数（千分位后最多 999,999）的完整宽度；绝不省略或缩写金额。
  const totalProfitCompositionWholeFontSize = totalProfitCompositionWhole.length >= 8
    ? 12
    : totalProfitCompositionWhole.length >= 7
      ? 13
      : 15;
  // 复用37号账本AI股票“高于首日开盘价”色条的入场节奏：先归零，延迟后从左向右展开。
  useEffect(() => {
    const shouldAnimate = isTotalProfitReportVisible && totalProfitPageTab === "income";
    setIsTotalProfitCompositionAnimated(false);
    if (!shouldAnimate) return undefined;
    const timer = window.setTimeout(() => setIsTotalProfitCompositionAnimated(true), 80);
    return () => window.clearTimeout(timer);
  }, [activeTotalProfitDetailTab, isTotalProfitReportVisible, totalProfitAttribution.commissionShareRatio, totalProfitAttribution.ownTradingRatio, totalProfitAttribution.sharedIncomeRatio, totalProfitPageTab]);
  // 资金账本只对账，不回写或扣减订单收益：投入、提现为两条独立方向；仅提现受当前正向总收益上限约束。
  const withdrawalLogs = payoutLogs.filter((log) => log.direction === "withdrawal");
  const depositLogs = payoutLogs.filter((log) => log.direction === "deposit");
  const payoutLedgerCashflowLogs = useMemo(() => {
    if (payoutLedgerTab === "income") return [];
    const source = payoutLedgerTab === "withdrawal" ? withdrawalLogs : depositLogs;
    return source.slice().sort((left, right) => (
      String(right.occurredOn || "").localeCompare(String(left.occurredOn || ""))
      || String(right.createdAt || "").localeCompare(String(left.createdAt || ""))
      || String(right.id).localeCompare(String(left.id))
    ));
  }, [depositLogs, payoutLedgerTab, withdrawalLogs]);
  // 总收益报告在单用户时读取该用户流水；管理员全局范围则读取全体流水，并在记录内保留用户名称。
  const isTotalProfitActivityTab = activeTotalProfitDetailTab === "income"
    || activeTotalProfitDetailTab === "order"
    || activeTotalProfitDetailTab === "commission"
    || activeTotalProfitDetailTab === "shared";
  const totalProfitDetailCashflowLogs = useMemo(() => {
    if (isTotalProfitActivityTab) return [];
    const scopedLogs = totalProfitAttribution.hasIndividualScope ? payoutLogs : globalPayoutLogs;
    const source = scopedLogs.filter((log) => log.direction === (activeTotalProfitDetailTab === "withdrawal" ? "withdrawal" : "deposit"));
    return source.slice().sort((left, right) => (
      String(right.occurredOn || "").localeCompare(String(left.occurredOn || ""))
      || String(right.createdAt || "").localeCompare(String(left.createdAt || ""))
      || String(right.id).localeCompare(String(left.id))
    ));
  }, [activeTotalProfitDetailTab, globalPayoutLogs, isTotalProfitActivityTab, payoutLogs, totalProfitAttribution.hasIndividualScope]);
  const latestWithdrawalLog = useMemo(() => withdrawalLogs
    .slice()
    .sort((left, right) => (
      String(right.createdAt || "").localeCompare(String(left.createdAt || ""))
      || String(right.id).localeCompare(String(left.id))
    ))[0] ?? null, [withdrawalLogs]);
  const cumulativePayoutAmount = withdrawalLogs.reduce((total, log) => total + (Number.isFinite(log.amount) ? log.amount : 0), 0);
  const cumulativeDepositAmount = depositLogs.reduce((total, log) => total + (Number.isFinite(log.amount) ? log.amount : 0), 0);
  const payoutProfitCap = Math.max(0, payoutBookTotalIncome);
  const payoutXirrSummary = useMemo(() => {
    const asOfDate = getBeijingDateInputValue();
    // 收益账本的“当前总收益”不因提现回写扣减，因此期末账面净值须减去已提现收益，避免在 XIRR 中重复计入。
    const currentNetValue = cumulativeDepositAmount + payoutBookTotalIncome - cumulativePayoutAmount;
    const cashFlows: T0XirrCashFlow[] = [
      ...depositLogs.map((log) => ({ occurredOn: log.occurredOn, amount: -log.amount })),
      ...withdrawalLogs.map((log) => ({ occurredOn: log.occurredOn, amount: log.amount })),
      { occurredOn: asOfDate, amount: currentNetValue, atEndOfBeijingDay: true },
    ];
    const investmentDates = depositLogs
      .map((log) => getT0CalendarDateUtc(log.occurredOn))
      .filter((timestamp): timestamp is number => timestamp !== null);
    const firstInvestmentTimestamp = investmentDates.length > 0 ? Math.min(...investmentDates) : null;
    const firstInvestmentDate = depositLogs
      .map((log) => String(log.occurredOn || "").slice(0, 10))
      .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
      .sort()[0] || null;
    const asOfTimestamp = getT0CalendarDateUtc(asOfDate);
    const daysHeld = firstInvestmentTimestamp !== null && asOfTimestamp !== null
      ? Math.max(1, Math.floor((asOfTimestamp - firstInvestmentTimestamp) / (24 * 60 * 60 * 1000)) + 1)
      : 0;
    return {
      asOfDate,
      currentNetValue,
      daysHeld,
      firstInvestmentDate,
      rate: calculateT0Xirr(cashFlows),
    };
  }, [cumulativeDepositAmount, cumulativePayoutAmount, depositLogs, payoutBookTotalIncome, withdrawalLogs]);
  const payoutFormWithdrawalLimit = Math.max(
    0,
    payoutProfitCap - (cumulativePayoutAmount - (editingPayoutLog?.direction === "withdrawal" ? editingPayoutLog.amount : 0)),
  );
  // 个人结算页面严格复用同页“总收益”的逐笔归因：订单、分佣和共享每周相加后，
  // 必须回加为该用户的总收益。先由页面已加载明细即时构造，再以后台周报补充冻结状态。
  const memberSettlementIncomeByWeek = useMemo(() => {
    const targetUserId = Number(payoutTargetRelatedUserId);
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) return null;
    const incomeByWeek = new Map<string, T0WeeklySettlementIncome>();
    const incomeByDay = new Map<string, T0WeeklySettlementIncome>();
    const ensureIncome = (collection: Map<string, T0WeeklySettlementIncome>, key: string) => {
      const existing = collection.get(key);
      if (existing) return existing;
      const created: T0WeeklySettlementIncome = { order: 0, commission: 0, shared: 0, total: 0, orderCount: 0, commissionCount: 0, sharedCount: 0 };
      collection.set(key, created);
      return created;
    };
    const addToIncome = (income: T0WeeklySettlementIncome, kind: "order" | "commission" | "shared", amount: number) => {
      income[kind] += amount;
      if (kind === "order") income.orderCount += 1;
      if (kind === "commission") income.commissionCount += 1;
      if (kind === "shared") income.sharedCount += 1;
      income.total += amount;
    };
    const addIncome = (occurredAt: string | null | undefined, kind: "order" | "commission" | "shared", amount: number) => {
      if (!Number.isFinite(amount)) return;
      const instant = new Date(String(occurredAt || ""));
      if (Number.isNaN(instant.getTime())) return;
      const weekStartBjt = getT0WeeklySettlementWeekStart(instant.toISOString());
      const dayBjt = getBeijingDateInputValue(instant);
      if (weekStartBjt) addToIncome(ensureIncome(incomeByWeek, weekStartBjt), kind, amount);
      if (/^\d{4}-\d{2}-\d{2}$/.test(dayBjt)) addToIncome(ensureIncome(incomeByDay, dayBjt), kind, amount);
    };
    for (const detail of totalNetProfitDetails) {
      const kind = Number(detail.trade.relatedUserId || 0) === targetUserId ? "order" : "commission";
      addIncome(detail.trade.filledAt || detail.trade.createdAt, kind, Number(detail.netPnl));
    }
    const closingTimeById = new Map(rawJournalTrades
      .filter((trade) => !ACTIONS[trade.action].opening)
      .map((trade) => [getStoredEntryId(trade), trade.filledAt || trade.createdAt] as const));
    for (const transfer of payoutSharedIncomeTransfers) {
      addIncome(closingTimeById.get(transfer.closingEntryId) || transfer.createdAt, "shared", Number(transfer.amount));
    }
    return { targetUserId, incomeByWeek, incomeByDay };
  }, [payoutSharedIncomeTransfers, payoutTargetRelatedUserId, rawJournalTrades, totalNetProfitDetails]);
  const settlementTodayBjt = getBeijingDateInputValue(liveClock);
  const memberInstantWeeklySettlementCenter = useMemo<T0WeeklySettlementCenter | undefined>(() => {
    if (!memberSettlementIncomeByWeek || !hasIndividualSettlementScope) return undefined;
    const currentWeekStartBjt = getT0WeeklySettlementWeekStart(`${settlementTodayBjt}T12:00:00+08:00`);
    const currentPeriod = getT0WeeklySettlementPeriodFromWeekStart(currentWeekStartBjt);
    if (!currentWeekStartBjt || !currentPeriod) return undefined;
    const targetName = String(totalProfitAttribution.targetLabel || `用户#${memberSettlementIncomeByWeek.targetUserId}`);
    const emptyIncome = (): T0WeeklySettlementIncome => ({ order: 0, commission: 0, shared: 0, total: 0, orderCount: 0, commissionCount: 0, sharedCount: 0 });
    const createReport = (weekStartBjt: string, status: T0WeeklySettlementReport["status"]): T0WeeklySettlementReport | null => {
      const period = getT0WeeklySettlementPeriodFromWeekStart(weekStartBjt);
      if (!period) return null;
      const income = { ...(memberSettlementIncomeByWeek.incomeByWeek.get(weekStartBjt) || emptyIncome()) };
      return {
        calculationVersion: "client-total-profit-v1",
        generatedAt: new Date().toISOString(),
        status,
        period,
        sourceCutoffAt: period.periodEndUtc,
        sourceCounts: { entries: income.orderCount + income.commissionCount, closings: income.orderCount, sharedTransfers: income.sharedCount },
        summary: { participantCount: 1, income },
        members: [{ userId: memberSettlementIncomeByWeek.targetUserId, name: targetName, income }],
      };
    };
    const current = createReport(currentWeekStartBjt, "realtime");
    if (!current) return undefined;
    const history = Array.from(memberSettlementIncomeByWeek.incomeByWeek.keys())
      .filter((weekStartBjt) => weekStartBjt < currentWeekStartBjt)
      .sort((left, right) => right.localeCompare(left))
      .flatMap((weekStartBjt) => {
        const report = createReport(weekStartBjt, "backfill");
        return report ? [{ id: `client:${weekStartBjt}`, kind: "backfill" as const, report }] : [];
      });
    return {
      timezone: "Asia/Shanghai",
      view: "member",
      current,
      history,
      definition: {
        income: "订单收益按实际平仓成交时间归周，分佣和共享跟随来源平仓；已扣开仓与平仓手续费。",
        freeze: "本金与充值、提现由独立资金流水管理，不进入本周收益结算。",
      },
    };
  }, [hasIndividualSettlementScope, memberSettlementIncomeByWeek, settlementTodayBjt, totalProfitAttribution.targetLabel]);
  const hasCurrentMemberWeeklySettlement = useMemo(() => {
    if (weeklySettlementCenter?.view !== "member") return false;
    const targetUserId = Number(payoutTargetRelatedUserId);
    return Number.isInteger(targetUserId)
      && targetUserId > 0
      && weeklySettlementCenter.current.members.some((member) => member.userId === targetUserId);
  }, [payoutTargetRelatedUserId, weeklySettlementCenter]);
  // 个人、代入用户与管理员单选用户统一只认服务端权威成员周报。
  // 等待期间显示加载态，绝不以浏览器本地即时模型临时替换，避免同一周出现两套金额。
  const memberSettlementPresentation = hasCurrentMemberWeeklySettlement
    ? weeklySettlementCenter
    : undefined;
  const displayedWeeklySettlementCenter = hasIndividualSettlementScope
    ? memberSettlementPresentation
    : weeklySettlementCenter;
  const memberSettlementReports = useMemo(() => {
    if (displayedWeeklySettlementCenter?.view !== "member" || !displayedWeeklySettlementCenter.current) return [] as Array<{ id: string; report: T0WeeklySettlementReport }>;
    return [
      ...displayedWeeklySettlementCenter.history.map((item) => ({ id: item.id, report: item.report })),
      { id: "current", report: displayedWeeklySettlementCenter.current },
    ].sort((left, right) => left.report.period.weekStartBjt.localeCompare(right.report.period.weekStartBjt));
  }, [displayedWeeklySettlementCenter]);
  const selectedMemberSettlementReport = useMemo(() => {
    const current = displayedWeeklySettlementCenter?.view === "member" ? displayedWeeklySettlementCenter.current : undefined;
    if (!current) return undefined;
    return memberSettlementReports.find((item) => item.report.period.weekStartBjt === memberSettlementSelectedWeekStart)?.report || current;
  }, [displayedWeeklySettlementCenter, memberSettlementReports, memberSettlementSelectedWeekStart]);
  const selectedMemberSettlementIsRealtime = Boolean(
    selectedMemberSettlementReport
    && displayedWeeklySettlementCenter?.view === "member"
    && selectedMemberSettlementReport.period.weekStartBjt === displayedWeeklySettlementCenter.current.period.weekStartBjt,
  );
  const selectMemberSettlementWeek = useCallback((weekStartBjt: string) => {
    const currentWeekStartBjt = displayedWeeklySettlementCenter?.view === "member"
      ? displayedWeeklySettlementCenter.current.period.weekStartBjt
      : null;
    setMemberSettlementSelectedWeekStart(weekStartBjt === currentWeekStartBjt ? null : weekStartBjt);
  }, [displayedWeeklySettlementCenter]);
  useEffect(() => {
    if (!memberSettlementSelectedWeekStart) return;
    if (!memberSettlementReports.some((item) => item.report.period.weekStartBjt === memberSettlementSelectedWeekStart)) {
      setMemberSettlementSelectedWeekStart(null);
    }
  }, [memberSettlementReports, memberSettlementSelectedWeekStart]);
  const adminSettlementReports = useMemo(() => {
    if (displayedWeeklySettlementCenter?.view !== "admin" || !displayedWeeklySettlementCenter.current) return [] as Array<{ id: string; report: T0WeeklySettlementReport }>;
    return [
      ...displayedWeeklySettlementCenter.history.map((item) => ({ id: item.id, report: item.report })),
      { id: "current", report: displayedWeeklySettlementCenter.current },
    ].sort((left, right) => left.report.period.weekStartBjt.localeCompare(right.report.period.weekStartBjt));
  }, [displayedWeeklySettlementCenter]);
  const selectedAdminSettlementReport = useMemo(() => {
    const current = displayedWeeklySettlementCenter?.view === "admin" ? displayedWeeklySettlementCenter.current : undefined;
    if (!current) return undefined;
    return adminSettlementReports.find((item) => item.report.period.weekStartBjt === selectedSettlementReconciliationWeekStart)?.report || current;
  }, [adminSettlementReports, displayedWeeklySettlementCenter, selectedSettlementReconciliationWeekStart]);
  const selectedAdminSettlementIsRealtime = Boolean(
    selectedAdminSettlementReport
    && displayedWeeklySettlementCenter?.view === "admin"
    && selectedAdminSettlementReport.period.weekStartBjt === displayedWeeklySettlementCenter.current.period.weekStartBjt,
  );
  const selectedAdminSettlementWeekIndex = Math.max(0, adminSettlementReports.findIndex((item) => item.report.period.weekStartBjt === selectedAdminSettlementReport?.period.weekStartBjt));
  const previousAdminSettlementReport = adminSettlementReports[selectedAdminSettlementWeekIndex - 1];
  const nextAdminSettlementReport = adminSettlementReports[selectedAdminSettlementWeekIndex + 1];
  const selectAdminSettlementWeek = useCallback((weekStartBjt: string) => {
    const currentWeekStartBjt = displayedWeeklySettlementCenter?.view === "admin"
      ? displayedWeeklySettlementCenter.current.period.weekStartBjt
      : null;
    setSelectedSettlementReconciliationWeekStart(weekStartBjt === currentWeekStartBjt ? null : weekStartBjt);
    setExpandedSettlementMemberId(null);
    setExpandedSettlementAccountId(null);
    setExpandedSettlementDestinationUserId(null);
  }, [displayedWeeklySettlementCenter]);
  useEffect(() => {
    if (isMemberView || !selectedSettlementReconciliationWeekStart) return;
    if (!adminSettlementReports.some((item) => item.report.period.weekStartBjt === selectedSettlementReconciliationWeekStart)) {
      setSelectedSettlementReconciliationWeekStart(null);
    }
  }, [adminSettlementReports, isMemberView, selectedSettlementReconciliationWeekStart]);
  useEffect(() => {
    if (totalProfitPageTab !== "settlement" || !isMemberView || !canViewTeamOverview || isPreviewSwitching) {
      setMemberSettlementCardPage("self");
      setTeamSettlementSelectedWeekStart(null);
    }
  }, [canViewTeamOverview, isMemberView, isPreviewSwitching, totalProfitPageTab]);
  const currentSettlementCountdown = useMemo(() => {
    const periodEnd = displayedWeeklySettlementCenter?.current?.period?.periodEndUtc;
    const periodEndTimestamp = periodEnd ? new Date(periodEnd).getTime() : NaN;
    if (!Number.isFinite(periodEndTimestamp)) return null;
    return Math.max(0, Math.ceil((periodEndTimestamp - liveClock.getTime()) / 1_000));
  }, [displayedWeeklySettlementCenter?.current?.period?.periodEndUtc, liveClock]);
  useEffect(() => {
    if (isMemberView) return;
    const currentPeriod = displayedWeeklySettlementCenter?.current?.period;
    if (!currentPeriod || currentSettlementCountdown === null || currentSettlementCountdown > 0) return;
    // 同一周期越界后只补拉一次；查询返回下一北京周后该标记自然失效。
    if (settlementPeriodRefreshRef.current === currentPeriod.weekStartBjt) return;
    settlementPeriodRefreshRef.current = currentPeriod.weekStartBjt;
    void t0WeeklySettlementQuery.refetch();
  }, [currentSettlementCountdown, displayedWeeklySettlementCenter?.current?.period, isMemberView, t0WeeklySettlementQuery]);
  const renderPayoutLogRow = (log: T0JournalPayoutLog) => {
    const isDeposit = log.direction === "deposit";
    const hasFixedEthPrincipal = isDeposit && Boolean(log.ethQuantity);
    const isEthDepositInput = isDeposit && log.depositInputMode === "eth";
    return <div key={log.id} className="px-3 py-2.5 text-xs">
      <div className="flex items-start justify-between gap-2">
        <span className="flex shrink-0 items-center gap-1.5 pt-0.5 font-medium text-slate-700"><span className="whitespace-nowrap">{log.occurredOn.replaceAll("-", "/")}</span><span className={`rounded px-1.5 py-0.5 text-[10px] ${isDeposit ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-600"}`}>{isDeposit ? "存入" : "提取"}</span></span>
        <span className="flex shrink-0 items-start gap-1"><span className={`whitespace-nowrap text-right font-bold tabular-nums ${isDeposit ? "text-sky-700" : "text-slate-800"}`}>{isDeposit ? "+" : "−"}{formatPrice(log.amount)} U</span>{canManage && isPayoutListEditing && deletePayoutLogId !== log.id && <><button type="button" onClick={() => { setEditingPayoutLog(log); setIsPayoutListEditing(false); setPayoutOccurredOn(log.occurredOn); setPayoutAmount(log.amount.toFixed(2)); setPayoutDepositInputMode(log.depositInputMode === "eth" ? "eth" : "u"); setPayoutEthQuantity(log.ethQuantity || ""); setPayoutEthReferencePrice(log.ethReferencePrice || ""); setPayoutEthReferencePriceIsManual(Boolean(log.ethReferencePrice)); setPayoutNote(log.note || ""); }} className="flex h-7 w-7 items-center justify-center rounded text-slate-500 active:bg-slate-100" aria-label="编辑资金流水" title="编辑"><Pencil className="h-3.5 w-3.5" /></button><button type="button" onClick={() => setDeletePayoutLogId(log.id)} className="flex h-7 w-7 items-center justify-center rounded text-rose-500 active:bg-rose-50" aria-label="删除资金流水" title="删除"><Trash2 className="h-3.5 w-3.5" /></button></>}</span>
      </div>
      {(log.note || isDeposit) && <div className="mt-1 flex items-baseline gap-2 text-[10px] leading-4 text-slate-500"><span className="min-w-0 flex-1 break-words">{log.note ? <>备注：{log.note}</> : null}</span>{isDeposit && <span className="flex shrink-0 items-baseline gap-3 whitespace-nowrap font-medium tabular-nums"><span><span className={isEthDepositInput ? "text-sky-700" : "text-slate-400"}>币本位</span> {hasFixedEthPrincipal ? <>{formatPayoutEthQuantity(log.ethQuantity)} ETH</> : "—"}</span>{log.ethReferencePrice && <span>参考价 {formatPrice(Number(log.ethReferencePrice))} U</span>}</span>}</div>}
      {canManage && isPayoutListEditing && deletePayoutLogId === log.id && <div className="mt-2 flex items-center justify-end gap-2 text-[11px]"><span className="mr-auto text-rose-600">确认删除这笔记录？</span><button type="button" onClick={() => setDeletePayoutLogId(null)} className="h-7 rounded border border-slate-300 bg-white px-2 font-medium text-slate-600">保留</button><button type="button" disabled={deletePayoutLogMutation.isPending} onClick={() => deletePayoutLogMutation.mutate({ ledgerId: 52, relatedUserId: payoutTargetRelatedUserId, id: log.id })} className="h-7 rounded bg-rose-600 px-2 font-semibold text-white disabled:opacity-45">{deletePayoutLogMutation.isPending ? "删除中" : "确认删除"}</button></div>}
    </div>;
  };
  // 总览展开后的多/空累计收益必须与顶部“总收益”使用相同的当前用户实际可得口径。
  // 原 summary 的 realized 是订单原始净额；筛选某位用户时会混入其他受益人的分成。
  const overviewSummary = useMemo(() => {
    const realizedBySide = totalNetProfitDetails.reduce<Record<PositionSide, number>>((totals, detail) => {
      totals[ACTIONS[detail.trade.action].side] += detail.netPnl;
      return totals;
    }, { long: 0, short: 0 });
    return {
      ...summary,
      long: { ...summary.long, realized: realizedBySide.long },
      short: { ...summary.short, realized: realizedBySide.short },
      realized: realizedBySide.long + realizedBySide.short,
    };
  }, [summary, totalNetProfitDetails]);
  /**
   * 报告底部明细必须与上方三项归因逐笔相同：单一用户展示其订单/分佣和实际收到的共享；
   * 管理员全量范围则从每笔平仓拆出共享、剩余订单收益和剩余分佣收益，不能再把共享藏在原订单净收益里。
   */
  const totalProfitAttributionDetailEntries = useMemo<TotalProfitAttributionDetailEntry[]>(() => {
    const targetUserId = Number(payoutTargetRelatedUserId);
    const hasIndividualScope = Number.isInteger(targetUserId) && targetUserId > 0;
    const sourceTradeByClosingId = new Map(
      rawJournalTrades
        .filter((trade) => !ACTIONS[trade.action].opening)
        .map((trade) => [getStoredEntryId(trade), trade]),
    );
    const selectedClosingIds = new Set(totalNetProfitDetails.map((detail) => getStoredEntryId(detail.trade)));
    const sortByActivity = (entries: TotalProfitAttributionDetailEntry[]) => entries.sort((left, right) => (
      right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id)
    ));
    const sharedTransfers = hasIndividualScope
      ? payoutSharedIncomeTransfers
      : sharedIncomeTransfers.filter((transfer) => selectedClosingIds.has(transfer.closingEntryId));
    const sharedEntries = sharedTransfers
      .filter((transfer) => Number.isFinite(transfer.amount) && Math.abs(transfer.amount) > 0.000001)
      .map<TotalProfitAttributionDetailEntry>((transfer) => {
        const sourceTrade = sourceTradeByClosingId.get(transfer.closingEntryId);
        return {
          id: `shared-${transfer.id}`,
          kind: "shared",
          createdAt: sourceTrade?.createdAt || transfer.createdAt,
          amount: transfer.amount,
          transfer,
          sourceTrade,
          quantity: sourceTrade?.quantity,
          recipientName: transfer.recipientUserName,
        };
      });

    // 成员 / 单用户筛选下，totalNetProfitDetails 已经是“共享之外”的本人实际可得，直接标注其来源即可。
    if (hasIndividualScope) {
      const regularEntries = totalNetProfitDetails
        .filter((detail) => Number.isFinite(detail.netPnl) && Math.abs(detail.netPnl) > 0.000001)
        .map<TotalProfitAttributionDetailEntry>((detail) => ({
          id: `regular-${detail.trade.id}`,
          kind: Number(detail.trade.relatedUserId || 0) === targetUserId ? "order" : "commission",
          createdAt: detail.trade.createdAt,
          amount: detail.netPnl,
          trade: detail.trade,
          quantity: detail.quantity,
        }));
      return sortByActivity([...regularEntries, ...sharedEntries]);
    }

    const regularEntries: TotalProfitAttributionDetailEntry[] = [];
    for (const detail of totalNetProfitDetails) {
      const netPnl = Number(detail.netPnl);
      if (!Number.isFinite(netPnl)) continue;
      const closing = detail.trade;
      const closingEntryId = getStoredEntryId(closing);
      const regularPool = getRegularDistributableNetPnl(netPnl, closingEntryId, sharedIncomeReductionsByClosingEntryId);
      const distributions = buildClosingProfitShareDistribution({
        trades,
        snapshots: profitShareSnapshots,
        closing,
        displayedNetPnl: netPnl,
        sharedIncomeReductions: sharedIncomeReductionsByClosingEntryId,
      });
      if (distributions.length === 0) {
        if (Math.abs(regularPool) > 0.000001) {
          regularEntries.push({
            id: `order-${closing.id}`,
            kind: "order",
            createdAt: closing.createdAt,
            amount: regularPool,
            trade: closing,
            quantity: detail.quantity,
          });
        }
        continue;
      }
      const sourceUserId = Number(closing.relatedUserId || 0);
      let distributedRegularTotal = 0;
      for (const distribution of distributions) {
        const amount = Number(distribution.netPnl);
        if (!Number.isFinite(amount)) continue;
        distributedRegularTotal += amount;
        if (Math.abs(amount) <= 0.000001) continue;
        regularEntries.push({
          id: `${distribution.beneficiaryUserId === sourceUserId ? "order" : "commission"}-${closing.id}-${distribution.beneficiaryUserId}`,
          kind: distribution.beneficiaryUserId === sourceUserId ? "order" : "commission",
          createdAt: closing.createdAt,
          amount,
          trade: closing,
          quantity: detail.quantity,
          recipientName: distribution.beneficiaryUserName,
        });
      }
      const regularGap = regularPool - distributedRegularTotal;
      if (Math.abs(regularGap) > 0.000001) {
        regularEntries.push({
          id: `order-gap-${closing.id}`,
          kind: "order",
          createdAt: closing.createdAt,
          amount: regularGap,
          trade: closing,
          quantity: detail.quantity,
        });
      }
    }
    return sortByActivity([...regularEntries, ...sharedEntries]);
  }, [payoutSharedIncomeTransfers, payoutTargetRelatedUserId, profitShareSnapshots, rawJournalTrades, sharedIncomeReductionsByClosingEntryId, sharedIncomeTransfers, totalNetProfitDetails, trades]);
  const activeTotalProfitAttributionDetailEntries = useMemo(() => {
    if (activeTotalProfitDetailTab === "income") return totalProfitAttributionDetailEntries;
    if (activeTotalProfitDetailTab === "order" || activeTotalProfitDetailTab === "commission" || activeTotalProfitDetailTab === "shared") {
      return totalProfitAttributionDetailEntries.filter((entry) => entry.kind === activeTotalProfitDetailTab);
    }
    return [];
  }, [activeTotalProfitDetailTab, totalProfitAttributionDetailEntries]);
  /** 顶部摘要与下方Tab严格复用同一范围、同一归因行和同一资金流水；只做展示聚合，不重算或改写账本。 */
  const totalProfitTabContextSummary = useMemo<T0TotalProfitContextSummary | null>(() => {
    const scopedPayoutLogs = (totalProfitAttribution.hasIndividualScope ? payoutLogs : globalPayoutLogs)
      .filter((log) => Number.isFinite(Number(log.amount)));
    const deposits = scopedPayoutLogs.filter((log) => log.direction === "deposit");
    const withdrawals = scopedPayoutLogs.filter((log) => log.direction === "withdrawal");
    const sumAmounts = (rows: Array<{ amount: number }>) => rows.reduce((total, row) => total + Number(row.amount || 0), 0);
    const makeSplitRing = (firstRatio: number, firstColor: string, secondColor: string, fallback: string) => {
      if (!Number.isFinite(firstRatio)) return fallback;
      const bounded = Math.max(0, Math.min(1, firstRatio));
      return `conic-gradient(${firstColor} 0 ${(bounded * 100).toFixed(3)}%, ${secondColor} ${(bounded * 100).toFixed(3)}% 100%)`;
    };
    const incomeTone = (amount: number) => amount > 0 ? "text-rose-600" : amount < 0 ? "text-emerald-600" : "text-slate-700";

    if (activeTotalProfitDetailTab === "deposit") {
      const uDeposits = deposits.filter((log) => log.depositInputMode !== "eth");
      const uTotal = sumAmounts(uDeposits);
      const total = sumAmounts(deposits);
      const uRatio = total > 0 ? uTotal / total : 0;
      const sumEthQuantity = (rows: typeof deposits) => rows.reduce((sum, log) => {
        const quantity = Number(log.ethQuantity);
        return Number.isFinite(quantity) ? sum + quantity : sum;
      }, 0);
      const fixedEthQuantity = sumEthQuantity(deposits);
      const fixedEthCount = deposits.filter((log) => Number.isFinite(Number(log.ethQuantity)) && Number(log.ethQuantity) > 0).length;
      // 每笔充值保存时已固定ETH数量和参考价；只有每笔都具备快照时，才展示全口径ETH和加权均价。
      const hasCompleteFixedEthSnapshot = deposits.length > 0 && fixedEthCount === deposits.length && fixedEthQuantity > 0;
      const weightedAverageReferencePrice = hasCompleteFixedEthSnapshot ? total / fixedEthQuantity : null;
      return {
        title: "充值摘要",
        subtitle: "按逐笔固定参考价汇总",
        centerLabel: "累计充值",
        totalText: formatPrice(total),
        centerUnit: "U",
        totalToneClass: "text-sky-700",
        ringBackground: total > 0 ? makeSplitRing(uRatio, "#0284c7", "#4f46e5", "#e0f2fe") : "#e0f2fe",
        items: [
          {
            id: "fixed-total",
            label: "累计充值",
            value: formatPrice(total),
            unit: "U",
            detail: hasCompleteFixedEthSnapshot ? `${formatPayoutEthQuantity(String(fixedEthQuantity))} ETH` : deposits.length === 0 ? "暂无充值" : "部分历史ETH快照缺失",
            color: "#0284c7",
            trackColor: "#e0f2fe",
            gradient: "linear-gradient(90deg, #0284c7 0%, #38bdf8 100%)",
            progress: total > 0 ? 1 : 0,
          },
          {
            id: "fixed-average-price",
            label: "固定均价",
            value: weightedAverageReferencePrice === null ? "—" : formatPrice(weightedAverageReferencePrice),
            unit: "U/ETH",
            detail: weightedAverageReferencePrice === null ? "需补齐逐笔ETH快照" : `按 ${deposits.length} 笔充值加权`,
            color: "#4f46e5",
            trackColor: "#e0e7ff",
            gradient: "linear-gradient(90deg, #4f46e5 0%, #818cf8 100%)",
          },
        ],
      };
    }

    if (activeTotalProfitDetailTab === "withdrawal") {
      const total = sumAmounts(withdrawals);
      const depositTotal = sumAmounts(deposits);
      const withdrawalRatio = depositTotal > 0 ? total / depositTotal : 0;
      const average = withdrawals.length > 0 ? total / withdrawals.length : 0;
      return {
        title: "提现摘要",
        subtitle: "按当前明细范围汇总",
        centerLabel: "累计提现",
        totalText: formatPrice(total),
        totalToneClass: "text-slate-800",
        ringBackground: total > 0 ? "conic-gradient(#334155 0 100%)" : "#e2e8f0",
        items: [
          { id: "count", label: "提现笔数", value: String(withdrawals.length), unit: "笔", detail: "已登记", color: "#334155", trackColor: "#e2e8f0", gradient: "linear-gradient(90deg, #334155 0%, #64748b 100%)" },
          { id: "average", label: "单笔均额", value: formatPrice(average), unit: "U", detail: withdrawals.length > 0 ? "按已登记笔数" : "暂无记录", color: "#475569", trackColor: "#e2e8f0", gradient: "linear-gradient(90deg, #475569 0%, #94a3b8 100%)" },
          { id: "deposit-ratio", label: "提现/充值", value: `${(withdrawalRatio * 100).toFixed(2)}%`, detail: `累计充值 ${formatPrice(depositTotal)} U`, color: "#0f766e", trackColor: "#ccfbf1", gradient: "linear-gradient(90deg, #0f766e 0%, #2dd4bf 100%)", progress: withdrawalRatio },
        ],
      };
    }

    if (activeTotalProfitDetailTab === "team") {
      const memberCount = teamOverviewMembers.length;
      const teamDepositFromMembers = teamOverviewMembers.reduce((sum, member) => sum + (Number(member.cumulativeDepositAmount) || 0), 0);
      const reportedTeamDeposit = Number(teamOverview?.summary?.cumulativeDepositAmount);
      const teamDeposit = Number.isFinite(reportedTeamDeposit) ? reportedTeamDeposit : teamDepositFromMembers;
      const reportedTeamIncome = teamOverview?.summary?.currentCumulativeIncome;
      const teamIncomeKnown = reportedTeamIncome !== null && reportedTeamIncome !== undefined && Number.isFinite(Number(reportedTeamIncome));
      const teamIncome = teamIncomeKnown ? Number(reportedTeamIncome) : 0;
      const isTeamIncomeComplete = Boolean(teamOverview) && teamOverview?.dataCompleteness?.isComplete !== false;
      const incomeMemberCount = teamOverviewMembers.filter((member) => member.currentCumulativeIncome !== null && Math.abs(Number(member.currentCumulativeIncome)) > 0.000001).length;
      const directCount = Number(teamOverview?.relation?.directMemberCount || 0);
      const recursiveCount = Number(teamOverview?.relation?.recursiveMemberCount || memberCount);
      return {
        title: "团队摘要",
        subtitle: !teamOverview ? "团队数据加载中" : isTeamIncomeComplete ? "已授权团队 T+0 汇总" : "团队收益核算中",
        centerLabel: "团队成员",
        totalText: teamOverview ? String(memberCount) : "—",
        centerUnit: "人",
        totalToneClass: "text-indigo-700",
        ringBackground: teamOverview ? "conic-gradient(#4338ca 0 100%)" : "#e2e8f0",
        items: [
          { id: "deposit", label: "团队总金额", value: teamOverview ? formatPrice(teamDeposit) : "—", unit: "U", detail: `${memberCount} 人`, color: "#2563eb", trackColor: "#dbeafe", gradient: "linear-gradient(90deg, #2563eb 0%, #60a5fa 100%)" },
          { id: "income", label: "团队总收益", value: isTeamIncomeComplete && teamIncomeKnown ? formatPrice(teamIncome) : "—", unit: "U", detail: isTeamIncomeComplete ? `${incomeMemberCount} 人有收益` : "核算中", color: teamIncome >= 0 ? "#e11d48" : "#16a34a", trackColor: teamIncome >= 0 ? "#ffe4e6" : "#dcfce7", gradient: teamIncome >= 0 ? "linear-gradient(90deg, #e11d48 0%, #fb7185 100%)" : "linear-gradient(90deg, #16a34a 0%, #4ade80 100%)" },
          { id: "members", label: "团队关系", value: String(recursiveCount), unit: "人", detail: `直属 ${directCount} 人`, color: "#4f46e5", trackColor: "#e0e7ff", gradient: "linear-gradient(90deg, #4f46e5 0%, #818cf8 100%)" },
        ],
      };
    }

    const entries = totalProfitAttributionDetailEntries.filter((entry) => entry.kind === activeTotalProfitDetailTab);
    const total = entries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    if (activeTotalProfitDetailTab === "order") {
      const longEntries = entries.filter((entry) => {
        const trade = entry.trade ?? entry.sourceTrade;
        return trade ? ACTIONS[trade.action].side === "long" : false;
      });
      const shortEntries = entries.filter((entry) => {
        const trade = entry.trade ?? entry.sourceTrade;
        return trade ? ACTIONS[trade.action].side === "short" : false;
      });
      const longTotal = longEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
      const shortTotal = shortEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
      const directionBase = Math.abs(longTotal) + Math.abs(shortTotal);
      const longRatio = directionBase > 0 ? Math.abs(longTotal) / directionBase : 0;
      const countTradeIds = (rows: TotalProfitAttributionDetailEntry[]) => new Set(rows.map((entry) => {
        const trade = entry.trade ?? entry.sourceTrade;
        return trade ? getStoredEntryId(trade) : entry.id;
      })).size;
      const longCount = countTradeIds(longEntries);
      const shortCount = countTradeIds(shortEntries);
      return {
        title: "已平仓摘要",
        subtitle: "仅统计实际归属收益",
        centerLabel: "订单收益",
        totalText: formatPrice(total),
        totalToneClass: incomeTone(total),
        ringBackground: directionBase > 0 ? makeSplitRing(longRatio, "#e11d48", "#16a34a", "#e2e8f0") : "#e2e8f0",
        items: [
          { id: "long", label: "平多收益", value: formatPrice(longTotal), unit: "U", detail: `${longCount} 笔`, color: "#e11d48", trackColor: "#ffe4e6", gradient: "linear-gradient(90deg, #e11d48 0%, #fb7185 100%)", progress: longRatio },
          { id: "short", label: "平空收益", value: formatPrice(shortTotal), unit: "U", detail: `${shortCount} 笔`, color: "#16a34a", trackColor: "#dcfce7", gradient: "linear-gradient(90deg, #16a34a 0%, #4ade80 100%)", progress: directionBase > 0 ? Math.abs(shortTotal) / directionBase : 0 },
          { id: "count", label: "已平仓", value: String(longCount + shortCount), unit: "笔", detail: `平多 ${longCount} · 平空 ${shortCount}`, color: "#475569", trackColor: "#e2e8f0", gradient: "linear-gradient(90deg, #475569 0%, #94a3b8 100%)" },
        ],
      };
    }

    if (activeTotalProfitDetailTab === "commission" || activeTotalProfitDetailTab === "shared") {
      const isCommission = activeTotalProfitDetailTab === "commission";
      const accent = isCommission ? "#f59e0b" : "#16a34a";
      const track = isCommission ? "#fef3c7" : "#dcfce7";
      const gradient = isCommission ? "linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)" : "linear-gradient(90deg, #16a34a 0%, #4ade80 100%)";
      const ratio = isCommission ? totalProfitAttribution.commissionShareRatio : totalProfitAttribution.sharedIncomeRatio;
      const average = entries.length > 0 ? total / entries.length : 0;
      return {
        title: isCommission ? "分佣摘要" : "共享摘要",
        subtitle: isCommission ? "按冻结分佣快照实际归属" : "仅统计实际到账共享收益",
        centerLabel: isCommission ? "累计分佣" : "累计共享",
        totalText: formatPrice(total),
        totalToneClass: incomeTone(total),
        ringBackground: Math.abs(total) > 0.000001 ? `conic-gradient(${accent} 0 100%)` : track,
        items: [
          { id: "count", label: isCommission ? "分佣笔数" : "到账笔数", value: String(entries.length), unit: "笔", detail: "实际归属", color: accent, trackColor: track, gradient },
          { id: "average", label: "单笔均额", value: formatPrice(average), unit: "U", detail: entries.length > 0 ? "按实际到账计算" : "暂无记录", color: accent, trackColor: track, gradient },
          { id: "ratio", label: "占总收益", value: `${(ratio * 100).toFixed(2)}%`, detail: "按收益绝对值", color: accent, trackColor: track, gradient, progress: ratio },
        ],
      };
    }

    return null;
  }, [activeTotalProfitDetailTab, globalPayoutLogs, payoutLogs, teamOverview, teamOverviewMembers, totalProfitAttribution.commissionShareRatio, totalProfitAttribution.hasIndividualScope, totalProfitAttribution.sharedIncomeRatio, totalProfitAttributionDetailEntries]);
  /**
   * 管理员全部用户的收入模式直接读取全局归因明细：订单为下单人实际归属，佣金为冻结快照/FIFO分配，
   * 共享为真实到账转账。动作与关联模式则继续使用下方的原始开平仓流水，两个模式不混行。
   */
  const isGlobalHistoryIncomeView = hasGlobalHistoryIncomeCategories
    && !historyIncomeKindsAllSelected
    && historyIncomeKindFilterIds.length > 0
    && !showLinkedJournalGroups;
  const globalHistoryIncomeEntries = useMemo(() => {
    if (!isGlobalHistoryIncomeView) return [] as TotalProfitAttributionDetailEntry[];
    const selectedKinds = new Set(historyIncomeKindFilterIds);
    return totalProfitAttributionDetailEntries.filter((entry) => selectedKinds.has(entry.kind));
  }, [historyIncomeKindFilterIds, isGlobalHistoryIncomeView, totalProfitAttributionDetailEntries]);
  // “盈利”仅保留给旧兼容视图；收入分类视图一律显示各类别真实归因行。
  const profitableRecentJournalTrades = useMemo(() => historyDisplayTrades.filter((trade) => {
    if (ACTIONS[trade.action].opening) return false;
    const detail = getHistoricalTradeDetail(trade);
    const displayedNetPnl = resolveHistoryViewerPayout(trade, detail)?.netPnl ?? detail?.netPnl;
    const normalizedNetPnl = Number(displayedNetPnl);
    return Number.isFinite(normalizedNetPnl) && normalizedNetPnl > 0;
  }), [historyDisplayTrades, getHistoricalTradeDetail, resolveHistoryViewerPayout]);
  const visibleRecentJournalTrades = showOnlyProfitableHistory
    ? profitableRecentJournalTrades
    : historyDisplayTrades;
  /** 用户收入筛选的汇总严格复用每条历史行的“本单可得”口径，不回算或改写任何收益流水。 */
  const historyMemberIncomeFilterSummary = useMemo(() => {
    if (!isHistoryMemberIncomeSourceFilterActive) return null;
    const incomeTrades = historyDisplayTrades.filter((trade) => !ACTIONS[trade.action].opening);
    const totalNetPnl = incomeTrades.reduce((total, trade) => {
      const detail = getHistoricalTradeDetail(trade);
      const displayedNetPnl = resolveHistoryViewerPayout(trade, detail)?.netPnl ?? detail?.netPnl;
      return total + (Number.isFinite(Number(displayedNetPnl)) ? Number(displayedNetPnl) : 0);
    }, 0);
    return { count: incomeTrades.length, totalNetPnl };
  }, [getHistoricalTradeDetail, historyDisplayTrades, isHistoryMemberIncomeSourceFilterActive, resolveHistoryViewerPayout]);
  const historyListItemCount = showLinkedJournalGroups
    ? linkedJournalGroups.length
    : isGlobalHistoryIncomeView
      ? globalHistoryIncomeEntries.length
      : visibleRecentJournalTrades.length;
  const recentJournalTotalPages = Math.max(1, Math.ceil(
    historyListItemCount / RECENT_JOURNAL_PAGE_SIZE,
  ));
  const pagedGlobalHistoryIncomeEntries = useMemo(() => {
    const start = (recentJournalPage - 1) * RECENT_JOURNAL_PAGE_SIZE;
    return globalHistoryIncomeEntries.slice(start, start + RECENT_JOURNAL_PAGE_SIZE);
  }, [globalHistoryIncomeEntries, recentJournalPage]);
  const pagedRecentJournalTrades = useMemo(() => {
    const newestFirst = [...visibleRecentJournalTrades]
      .sort((a, b) => {
        const timeOrder = getTradeActivityTime(b).localeCompare(getTradeActivityTime(a));
        if (timeOrder !== 0) return timeOrder;
        const sourceOrder = getStoredEntryId(b).localeCompare(getStoredEntryId(a));
        if (sourceOrder !== 0) return sourceOrder;
        const incomeKindOrder = (trade: PreviewTrade) => trade.historyIncomeKind === "commission" ? 0 : trade.historyIncomeKind === "shared" ? 1 : 0;
        return incomeKindOrder(a) - incomeKindOrder(b);
      });
    const start = (recentJournalPage - 1) * RECENT_JOURNAL_PAGE_SIZE;
    return newestFirst.slice(start, start + RECENT_JOURNAL_PAGE_SIZE);
  }, [visibleRecentJournalTrades, recentJournalPage]);
  const pagedLinkedJournalGroups = useMemo(() => {
    const start = (recentJournalPage - 1) * RECENT_JOURNAL_PAGE_SIZE;
    return linkedJournalGroups.slice(start, start + RECENT_JOURNAL_PAGE_SIZE);
  }, [linkedJournalGroups, recentJournalPage]);
  useEffect(() => {
    setRecentJournalPage((current) => Math.min(current, recentJournalTotalPages));
  }, [recentJournalTotalPages]);
  const totalRevenueDetailTotalPages = Math.max(1, Math.ceil(
    activeTotalProfitAttributionDetailEntries.length / TOTAL_REVENUE_DETAIL_PAGE_SIZE,
  ));
  const pagedTotalProfitAttributionDetailEntries = useMemo(() => {
    const start = (totalRevenueDetailPage - 1) * TOTAL_REVENUE_DETAIL_PAGE_SIZE;
    return activeTotalProfitAttributionDetailEntries.slice(start, start + TOTAL_REVENUE_DETAIL_PAGE_SIZE);
  }, [activeTotalProfitAttributionDetailEntries, totalRevenueDetailPage]);
  useEffect(() => {
    setTotalRevenueDetailPage((current) => Math.min(current, totalRevenueDetailTotalPages));
  }, [totalRevenueDetailTotalPages]);
  const totalPositionQuantity = useMemo(() => {
    const longQuantity = totalPositionBuckets
      .filter((bucket) => bucket.side === "long" && bucket.remainingQuantity > 0.0000001)
      .reduce((total, bucket) => total + bucket.remainingQuantity, 0);
    const shortQuantity = totalPositionBuckets
      .filter((bucket) => bucket.side === "short" && bucket.remainingQuantity > 0.0000001)
      .reduce((total, bucket) => total + bucket.remainingQuantity, 0);
    return longQuantity - shortQuantity;
  }, [totalPositionBuckets]);
  const totalNetProfitClass = totalIncome > 0 ? "text-rose-600" : totalIncome < 0 ? "text-emerald-600" : "text-slate-700";
  const netPositionClass = "text-slate-800";
  const roundedNetPositionText = (() => {
    const rounded = Math.round(totalPositionQuantity);
    return `${rounded < 0 ? "−" : ""}${Math.abs(rounded).toLocaleString("en-US")}`;
  })();
  const totalNetProfitText = formatSigned(totalIncome);
  const netPositionBreakdown = useMemo(() => {
    const buildSide = (side: PositionSide) => {
      const levels = totalPositionBuckets
        .filter((bucket) => bucket.side === side && bucket.remainingQuantity > 0.0000001)
        .sort((a, b) => b.price - a.price);
      return {
        levels,
        quantity: levels.reduce((total, bucket) => total + bucket.remainingQuantity, 0),
      };
    };
    return { long: buildSide("long"), short: buildSide("short") };
  }, [totalPositionBuckets]);
  const netPositionDetailText = `${totalPositionQuantity < 0 ? "−" : ""}${formatQuantity(Math.abs(totalPositionQuantity))}`;
  // 从某个T型档位进入时，详情仅展示该方向、该归属档位的订单和汇总；
  // 从底部通用开平按钮进入时没有指定档位，才保留方向总览。
  const entryScopedTrades = useMemo(() => {
    const matchingSide = (trade: PreviewTrade) => ACTIONS[trade.action].side === entrySide;
    const matchesClosingSourceScope = (trade: PreviewTrade) => !closingSourceTrade || (
      trade.accountId === closingSourceTrade.accountId
      && (trade.relatedUserId ?? "") === (closingSourceTrade.relatedUserId ?? "")
      && (trade.relatedFundId ?? "") === (closingSourceTrade.relatedFundId ?? "")
    );
    // 逐笔报价点进来的平仓只展示被点中的那张开仓单。其历史平仓按全局FIFO已经
    // 分配出的实际片段带入本地详情，不能再把同一十美元归档档的其他订单混进来。
    if (isIndividualQuoteDetail && closingSourceTrade) {
      const sourceOpeningId = getStoredEntryId(closingSourceTrade);
      const sourceClosingSlices = (ladderOpeningClosingAllocations.get(closingSourceTrade.id) ?? []).map(({ trade, quantity }) => ({
        ...trade,
        id: `individual-source-${trade.id}-${closingSourceTrade.id}`,
        quantity,
        fee: trade.quantity > 0 ? trade.fee * (quantity / trade.quantity) : 0,
        targetOpeningEntryId: sourceOpeningId,
      }));
      return [closingSourceTrade, ...sourceClosingSlices];
    }
    const targetPrice = entryForm.targetPrice;
    if (targetPrice === undefined) return selectedTrades.filter((trade) => matchingSide(trade) && matchesClosingSourceScope(trade));

    if (entryArchiveStep === POSITION_ARCHIVE_STEP) {
      return selectedTrades.filter((trade) => matchingSide(trade) && matchesClosingSourceScope(trade)
        && priceKey(archivePriceForTrade(trade)) === priceKey(targetPrice));
    }

    // 宽档详情按每张开仓主单的实际成交价归类，并投影其真实 FIFO 平仓分配。
    // 这样 25/50/100U 的展示合并不会误把已经平掉的十美元档重新显示为未平仓。
    const openings = selectedTrades.filter((trade) => matchingSide(trade) && matchesClosingSourceScope(trade)
      && ACTIONS[trade.action].opening
      && !trade.isPending
      && priceKey(archivePriceForTrade(trade, entryArchiveStep)) === priceKey(targetPrice));
    const scopedClosings = openings.flatMap((opening) => (
      (ladderOpeningClosingAllocations.get(opening.id) ?? []).map(({ trade, quantity }) => ({
        ...trade,
        id: `display-${entryArchiveStep}-${trade.id}-${opening.id}`,
        quantity,
        fee: trade.quantity > 0 ? trade.fee * (quantity / trade.quantity) : 0,
      }))
    ));
    return [...openings, ...scopedClosings]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }, [selectedTrades, entrySide, entryForm.targetPrice, entryArchiveStep, ladderOpeningClosingAllocations, closingSourceTrade, isIndividualQuoteDetail]);
  const entryScopedBuckets = useMemo(() => {
    if (isIndividualQuoteDetail && closingSourceTrade) {
      return buildPositionBuckets(entryScopedTrades.filter((trade) => !trade.isPending));
    }
    const source = entryArchiveStep === POSITION_ARCHIVE_STEP ? buckets : integratedDisplayBuckets;
    return source.filter((bucket) => bucket.side === entrySide && (
      entryForm.targetPrice === undefined || priceKey(bucket.price) === priceKey(entryForm.targetPrice)
    ));
  }, [buckets, integratedDisplayBuckets, entryArchiveStep, entrySide, entryForm.targetPrice, entryScopedTrades, isIndividualQuoteDetail, closingSourceTrade]);
  const entryScopedFilledTrades = useMemo(
    () => entryScopedTrades.filter((trade) => !trade.isPending),
    [entryScopedTrades],
  );
  const entryScopedRecentJournalDetails = useMemo(
    () => buildRecentJournalTradeDetails(entryScopedFilledTrades),
    [entryScopedFilledTrades],
  );
  const entryScopedSummary = useMemo(
    () => calculateSummary(entryScopedBuckets, markPrice, entryScopedFilledTrades, entryScopedRecentJournalDetails),
    [entryScopedBuckets, entryScopedFilledTrades, entryScopedRecentJournalDetails, markPrice],
  );
  const entrySideSummary = entrySide === "long" ? entryScopedSummary.long : entryScopedSummary.short;
  const isOptionEntryContext = ACTIONS[entryForm.action].opening && entryForm.instrumentType === "option";
  // 档位详情已由用户刚点击的价格格定位，无需在标题重复显示档位，避免移动端换行。
  // 顶部始终明确为当前档位或当前方向范围的汇总，逐笔订单在下方直接展示。
  const entryScopeTitle = isOptionEntryContext ? "期权汇总" : isGridOpeningEntry ? "网格汇总" : `${entrySide === "long" ? "多仓" : "空仓"}汇总`;
  const openingClosingAllocations = useMemo(
    () => buildOpeningClosingAllocations(entryScopedTrades.filter((trade) => !trade.isPending)),
    [entryScopedTrades],
  );
  const openedTradeList = useMemo(
    () => entryScopedTrades
      .filter((trade) => ACTIONS[trade.action].opening)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [entryScopedTrades],
  );
  const { activeOpenedTradeList, settledOpenedTradeList } = useMemo(() => {
    const active: PreviewTrade[] = [];
    const settled: PreviewTrade[] = [];
    for (const trade of openedTradeList) {
      const linkedClosings = openingClosingAllocations.get(trade.id) ?? [];
      const closedQuantity = linkedClosings.reduce((total, item) => total + item.quantity, 0);
      if (trade.quantity - closedQuantity > 0.0000001) active.push(trade);
      else settled.push(trade);
    }
    return { activeOpenedTradeList: active, settledOpenedTradeList: settled };
  }, [openedTradeList, openingClosingAllocations]);
  const settledOpenedTradeSummary = useMemo(() => {
    const realizedNet = settledOpenedTradeList.reduce((total, openingTrade) => {
      const isLongPosition = ACTIONS[openingTrade.action].side === "long";
      const linkedClosings = openingClosingAllocations.get(openingTrade.id) ?? [];
      const openingNet = linkedClosings.reduce((openingTotal, { trade: closingTrade, quantity }) => {
        const financialQuantity = getTradeFinancialQuantity(closingTrade, quantity);
        const grossPnl = isLongPosition
          ? (closingTrade.price - openingTrade.price) * financialQuantity
          : (openingTrade.price - closingTrade.price) * financialQuantity;
        const allocatedOpeningFee = openingTrade.quantity > 0
          ? openingTrade.fee * (quantity / openingTrade.quantity)
          : 0;
        const allocatedClosingFee = closingTrade.quantity > 0
          ? closingTrade.fee * (quantity / closingTrade.quantity)
          : 0;
        return openingTotal + grossPnl - allocatedOpeningFee - allocatedClosingFee;
      }, 0);
      return total + openingNet;
    }, 0);
    return { count: settledOpenedTradeList.length, realizedNet };
  }, [settledOpenedTradeList, openingClosingAllocations]);
  const activeOpenedTradeRows = useMemo(
    () => activeOpenedTradeList.map((trade) => ({ kind: "active" as const, trade })),
    [activeOpenedTradeList],
  );
  const settledOpenedTradeRows = useMemo(
    () => showSettledOpeningHistory
      ? settledOpenedTradeList.map((trade) => ({ kind: "history" as const, trade }))
      : [],
    [settledOpenedTradeList, showSettledOpeningHistory],
  );
  const isEditingEntry = Boolean(entryForm.editingEntryId);
  /** 既有挂单在编辑时保留时钟按钮；取消选中后，点击保存才确认成交。 */
  const isEditingOriginalPendingOpening = Boolean(isEditingEntry && editingOriginalTrade?.isPending);
  const isEditingPendingOpening = Boolean(isEditingOriginalPendingOpening && entryForm.isPending);
  const isPendingFillConfirmationQueued = Boolean(isEditingOriginalPendingOpening && !entryForm.isPending);
  const isClosingEntry = !ACTIONS[entryForm.action].opening;
  /**
   * 管理员在录入或编辑开仓时，项目下方直接说明“谁分多少”。
   * 原项目的既有开仓优先展示本单冻结快照；若切换到另一项目，则展示该项目当前规则，
   * 只做可见性提示，不参与任何保存载荷，也不改写历史分配。
   */
  const selectedProjectProfitSharePreview = useMemo(() => {
    const relatedFundId = Number(entryForm.relatedFundId);
    if (!canManage || !Number.isInteger(relatedFundId) || relatedFundId <= 0) return null;
    const selectedFund = entryRelatedFunds.find((fund) => Number(fund.id) === relatedFundId);
    const isOriginalProject = Boolean(
      isEditingEntry
      && editingOriginalTrade
      && Number(editingOriginalTrade.relatedFundId) === relatedFundId,
    );
    const frozenAllocations = isOriginalProject && editingOriginalTrade && !editingOriginalTrade.isPending
      ? getOpeningProfitShareSnapshotAllocations(profitShareSnapshots, getStoredEntryId(editingOriginalTrade))
      : [];
    const rows = frozenAllocations.length > 0
      ? frozenAllocations.map((allocation) => ({
        beneficiaryUserId: allocation.beneficiaryUserId,
        beneficiaryUserName: allocation.beneficiaryUserName || `用户#${allocation.beneficiaryUserId}`,
        percentage: allocation.percentage,
      }))
      : profitShareRules
        .filter((rule) => rule.relatedFundId === relatedFundId)
        .map((rule) => ({
          beneficiaryUserId: rule.beneficiaryUserId,
          beneficiaryUserName: rule.beneficiaryUserName,
          percentage: rule.percentage,
        }));
    return {
      projectName: selectedFund?.name || entryForm.relatedFundName.trim() || `项目#${relatedFundId}`,
      sourceLabel: frozenAllocations.length > 0 ? "本单已固化" : "项目当前规则",
      rows: rows.slice().sort((left, right) => right.percentage - left.percentage || left.beneficiaryUserName.localeCompare(right.beneficiaryUserName, "zh-CN")),
      totalPercentage: rows.reduce((total, row) => total + row.percentage, 0),
    };
  }, [canManage, editingOriginalTrade, entryForm.relatedFundId, entryForm.relatedFundName, entryRelatedFunds, isEditingEntry, profitShareRules, profitShareSnapshots]);
  const selectOpeningInstrumentType = (instrument: (typeof T0_INSTRUMENT_TYPES)[number]) => {
    if (instrument.value === "option" && !entryForm.editingEntryId) {
      setEntrySide(getOptionLadderSide(entryForm.optionDirection));
    }
    if (instrument.value === "grid" && !entryForm.editingEntryId) {
      setEntrySide(entryForm.gridDirection === "long" ? "long" : "short");
    }
    setEntryForm((current) => {
      if (instrument.value === "option") {
        const isNewOption = current.instrumentType !== "option";
        return {
          ...current,
          action: current.editingEntryId ? current.action : getOptionOpeningAction(current.optionDirection),
          instrumentType: "option",
          isPending: false,
          isTakeProfit: false,
          takeProfitPrice: "",
          takeProfitQuantity: "",
          takeProfitPlans: [],
          optionExpiryDate: isNewOption ? "" : current.optionExpiryDate,
          optionPremium: isNewOption ? "" : current.optionPremium,
          price: isNewOption ? "" : current.price,
        };
      }
      if (instrument.value === "grid") {
        return {
          ...current,
          action: current.editingEntryId ? current.action : current.gridDirection === "long" ? "openLong" : "openShort",
          instrumentType: "grid",
          isPending: false,
          isTakeProfit: false,
          takeProfitPrice: "",
          takeProfitQuantity: "",
          takeProfitPlans: [],
          price: "",
        };
      }
      return { ...current, instrumentType: instrument.value };
    });
  };
  const renderOpeningExecutionControls = () => ACTIONS[entryForm.action].opening ? (
    <div className="inline-flex items-center gap-0.5" aria-label="订单执行设置">
      <button
        type="button"
        disabled={isCloseReview || !canToggleOpeningPendingStatus || entryForm.instrumentType === "option" || entryForm.instrumentType === "grid"}
        aria-pressed={entryForm.isPending}
        aria-label={entryForm.instrumentType === "grid" ? "网格参数仅作策略记录，不支持挂单自动成交" : entryForm.instrumentType === "option" ? "期权订单仅支持直接成交" : entryForm.isPending ? isEditingOriginalPendingOpening ? "取消挂单选择，保存时确认成交" : isEditingEntry ? "取消回挂单，恢复已成交" : "取消本笔开仓挂单，改为直接成交" : isEditingOriginalPendingOpening ? "恢复挂单选择" : isEditingEntry ? "将本笔已成交订单改回挂单" : "设为本笔开仓挂单"}
        title={entryForm.instrumentType === "grid" ? "网格参数仅作策略记录，不支持挂单自动成交" : entryForm.instrumentType === "option" ? "期权订单仅支持直接成交" : entryForm.isPending ? isEditingOriginalPendingOpening ? "挂单已选中；取消后需点击保存修改才确认成交" : isEditingEntry ? "当前准备改回挂单；再次点击可恢复已成交" : "挂单中，点击改为直接成交" : isEditingOriginalPendingOpening ? "已取消挂单选择；点击可恢复挂单" : isEditingEntry ? "将已成交订单改回挂单；保存后退出仓位与收益计算" : "直接成交，点击改为挂单"}
        onClick={() => setEntryForm((current) => ({
          ...current,
          isPending: !current.isPending,
          // 挂单成交前不允许锁定；改为挂单时立即解除已有锁定标记。
          isLocked: current.isPending ? current.isLocked : false,
        }))}
        className={`flex h-8 w-8 items-center justify-center rounded border transition active:scale-[0.94] disabled:cursor-not-allowed disabled:opacity-40 ${entryForm.isPending ? "border-sky-500/75 bg-sky-50 text-sky-600" : "border-slate-300 bg-slate-50 text-slate-500"}`}
      >
        <Clock3 className="h-4 w-4" strokeWidth={2.3} />
      </button>
      <button
        type="button"
        disabled={isCloseReview || entryForm.isPending || isFullyClosedOpeningEdit}
        aria-pressed={entryForm.isLocked}
        aria-label={entryForm.isPending ? "挂单不可锁定" : entryForm.isLocked ? "解除本笔开仓锁定" : "锁定本笔开仓"}
        title={entryForm.isPending ? "挂单不可锁定；成交后才可设为锁定" : entryForm.isLocked ? "已锁定，点击解除" : "未锁定，点击锁定"}
        onClick={() => setEntryForm((current) => ({ ...current, isLocked: !current.isLocked }))}
        className={`flex h-8 w-8 items-center justify-center rounded border transition active:scale-[0.94] disabled:cursor-not-allowed disabled:opacity-40 ${entryForm.isLocked ? "border-[#c9a84c]/75 bg-[#141414] text-[#f5d78e] shadow-[inset_0_1px_0_rgba(245,215,142,0.16),inset_0_-1px_0_rgba(0,0,0,0.7)]" : "border-slate-300 bg-slate-50 text-slate-500"}`}
      >
        {entryForm.isLocked ? <Lock className="h-4 w-4" strokeWidth={2.3} /> : <LockOpen className="h-4 w-4" strokeWidth={2.3} />}
      </button>
      <button
        type="button"
        disabled={isCloseReview || !isTakeProfitAvailable || isFullyClosedOpeningEdit}
        aria-pressed={entryForm.isTakeProfit}
        aria-label={isTakeProfitAvailable ? (entryForm.isTakeProfit ? "关闭本笔开仓止盈" : "设置本笔开仓止盈") : "当前订单类型不支持止盈设置"}
        title={isTakeProfitAvailable ? (entryForm.isTakeProfit ? "止盈已开启，点击关闭" : "设置止盈价与止盈数量") : "当前订单类型不支持止盈设置"}
        onClick={() => setEntryForm((current) => ({
          ...current,
          isTakeProfit: !current.isTakeProfit,
          takeProfitPrice: current.isTakeProfit ? "" : current.takeProfitPrice,
          takeProfitQuantity: current.isTakeProfit ? "" : (current.takeProfitQuantity || normalizeEthQuantity(current.quantity)),
          takeProfitPlans: current.isTakeProfit ? [] : (current.takeProfitPlans.length > 0
            ? current.takeProfitPlans
            : [{ price: current.takeProfitPrice, quantity: normalizeEthQuantity(current.quantity) }]),
        }))}
        className={`flex h-8 w-8 items-center justify-center rounded border transition active:scale-[0.94] disabled:cursor-not-allowed disabled:opacity-40 ${entryForm.isTakeProfit ? "border-amber-500/80 bg-amber-500 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]" : "border-slate-300 bg-slate-50 text-slate-500"}`}
      >
        <Target className="h-4 w-4" strokeWidth={2.3} />
      </button>
      <button
        type="button"
        disabled={isCloseReview || hasDependentCloseOpeningEdit}
        aria-pressed={entryForm.isCounterparty}
        aria-label={entryForm.isCounterparty ? "关闭管理员反向展示" : "开启管理员反向展示"}
        title={entryForm.isCounterparty ? "管理员反向展示已开启，点击关闭" : "用户与管理员使用相反多空和损益展示"}
        onClick={() => setEntryForm((current) => ({ ...current, isCounterparty: !current.isCounterparty }))}
        className={`flex h-8 w-8 items-center justify-center rounded border transition active:scale-[0.94] disabled:cursor-not-allowed disabled:opacity-40 ${entryForm.isCounterparty ? "border-violet-500/80 bg-violet-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]" : "border-slate-300 bg-slate-50 text-slate-500"}`}
      >
        <Repeat2 className="h-4 w-4" strokeWidth={2.35} />
      </button>
      <button
        type="button"
        disabled={pauseReopenReminderMutation.isPending}
        aria-pressed={entryForm.keepReopenReminder}
        aria-label={entryForm.keepReopenReminder ? "关闭持续提醒" : "开启持续提醒"}
        title={entryForm.reminderTemplateId
          ? entryForm.keepReopenReminder
            ? "持续提醒已开启；关闭后需保存才会取消"
            : "已选择取消持续提醒；保存后生效"
          : entryForm.keepReopenReminder
            ? "持续提醒已开启：每次平仓后保留待补开"
            : "开启持续提醒：每次平仓后保留待补开"}
        onClick={() => {
          // 从蓝色占位进入时，关闭只形成取消草稿；保存后才会暂停该段待补开。
          setEntryForm((current) => ({ ...current, keepReopenReminder: !current.keepReopenReminder }));
        }}
        className={`flex h-8 w-8 items-center justify-center rounded border transition active:scale-[0.94] disabled:cursor-wait disabled:opacity-60 ${entryForm.keepReopenReminder ? "border-sky-500/80 bg-sky-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]" : "border-slate-300 bg-slate-50 text-slate-500"}`}
      >
        <BellRing className="h-4 w-4" strokeWidth={2.3} />
      </button>
    </div>
  ) : undefined;
  // 平仓选择后仅调整当前界面顺序：已选主单沉到列表最下方，紧贴下方平仓编辑区；绝不改订单或FIFO排序。
  const closingOrderedOpenedTradeRows = useMemo(() => {
    if (!isClosingEntry || !closingSourceTrade) return activeOpenedTradeRows;
    const selectedEntryId = getStoredEntryId(closingSourceTrade);
    const unselectedRows = activeOpenedTradeRows.filter((row) => getStoredEntryId(row.trade) !== selectedEntryId);
    const selectedRows = activeOpenedTradeRows.filter((row) => getStoredEntryId(row.trade) === selectedEntryId);
    return selectedRows.length > 0 ? [...unselectedRows, ...selectedRows] : activeOpenedTradeRows;
  }, [activeOpenedTradeRows, closingSourceTrade, isClosingEntry]);
  // 编辑一张已部分平仓的主单时，锁定只标识尚未平掉的余额；已实现的平仓记录仍保持独立审计。
  const editingRemainingQuantity = useMemo(() => {
    if (!isEditingEntry || !editingOriginalTrade) return null;
    const linkedClosings = openingClosingAllocations.get(editingOriginalTrade.id) ?? [];
    const closedQuantity = linkedClosings.reduce((total, item) => total + item.quantity, 0);
    return Math.max(0, editingOriginalTrade.quantity - closedQuantity);
  }, [editingOriginalTrade, isEditingEntry, openingClosingAllocations]);
  // 一旦发生关联平仓，原始开仓字段都要保留审计；仅有剩余仓位时才允许切换锁定状态。
  const hasDependentCloseOpeningEdit = Boolean(
    isEditingEntry
    && editingOriginalTrade
    && editingRemainingQuantity !== null
    && editingRemainingQuantity < editingOriginalTrade.quantity - 0.0000001,
  );
  const isPartiallyClosedOpeningEdit = Boolean(
    hasDependentCloseOpeningEdit
    && editingRemainingQuantity !== null
    && editingRemainingQuantity > 0.0000001,
  );
  const isFullyClosedOpeningEdit = Boolean(
    hasDependentCloseOpeningEdit
    && editingRemainingQuantity !== null
    && editingRemainingQuantity <= 0.0000001,
  );
  // 未被任何后续平仓使用的开仓单，可在“已成交”和“挂单”间双向校正；
  // 服务端会在提交时以行锁再次复核，已有平仓链路绝不允许回切挂单。
  const canToggleOpeningPendingStatus = Boolean(!isEditingEntry || !hasDependentCloseOpeningEdit);
  const hasPartialOpeningMarkerChange = Boolean(
    isPartiallyClosedOpeningEdit
    && editingOriginalTrade
    && entryForm.isLocked !== Boolean(editingOriginalTrade.isLocked),
  );
  const hasPartialTakeProfitChange = Boolean(
    isPartiallyClosedOpeningEdit
    && editingOriginalTrade
    && (
      entryForm.isTakeProfit !== Boolean(editingOriginalTrade.takeProfitEnabled)
      || (entryForm.isTakeProfit && (
        JSON.stringify(normalizeTakeProfitPlanDrafts(entryForm.takeProfitPlans))
          !== JSON.stringify(normalizeTakeProfitPlanDrafts(getTradeTakeProfitPlanDrafts(editingOriginalTrade)))
      ))
    ),
  );
  // 原开仓历史字段仍只读；此标记仅用于启用“后续归属”的独立保存路径。
  const hasPartialAttributionDraftChange = Boolean(
    isPartiallyClosedOpeningEdit
    && editingOriginalTrade
    && (
      entryForm.accountId !== editingOriginalTrade.accountId
      || (!entryForm.accountId && entryForm.accountName.trim() !== (editingOriginalTrade.accountName ?? getTradeAccountName(editingOriginalTrade)).trim())
      || (entryForm.relatedUserId || "") !== (editingOriginalTrade.relatedUserId || "")
      || (entryForm.relatedFundId === "legacy" ? "" : entryForm.relatedFundId || "") !== (editingOriginalTrade.relatedFundId || "")
      || (!entryForm.relatedFundId && entryForm.relatedFundName.trim() !== (editingOriginalTrade.relatedFundName ?? "").trim())
    ),
  );
  // 已发生平仓时，用户名变更只能作用于承接剩余仓位，绝不改写已平历史。
  const partialAttributionChangesRelatedUser = Boolean(
    partialOpeningAttributionDraft
    && editingOriginalTrade
    && Number(partialOpeningAttributionDraft.relatedUserId || 0) !== Number(editingOriginalTrade.relatedUserId || 0),
  );
  const isOptionOpeningEntry = isOptionEntryContext;
  const isTakeProfitAvailable = ACTIONS[entryForm.action].opening
    && (entryForm.instrumentType === "spot" || entryForm.instrumentType === "contract");
  // T+0 期权固定为 ETH 标的：复用融资付息订单已接入的 Deribit 缓存。
  // 到期日与行权价均从市场合约列表选择，避免手填出不存在的合约组合。
  const t0OptionExpiriesQuery = (trpc.ledger as any).deribitGetExpiries.useQuery(
    { currency: "ETH" as const },
    {
      enabled: canManage && showEntrySheet && isOptionOpeningEntry,
      staleTime: 5 * 60 * 1000,
    },
  );
  const t0OptionExpiries = ((t0OptionExpiriesQuery.data as any)?.expiries ?? []) as Array<{
    deribitLabel: string;
    ts: number;
    diffDays: number;
    dateStr?: string;
  }>;
  const t0SelectedOptionExpiry = t0OptionExpiries.find(
    (expiry) => new Date(expiry.ts).toISOString().slice(0, 10) === entryForm.optionExpiryDate,
  );
  const t0OptionDeribitLabel = t0SelectedOptionExpiry?.deribitLabel ?? "";
  const t0OptionStrikesQuery = (trpc.ledger as any).deribitGetStrikes.useQuery(
    { currency: "ETH" as const, deribitLabel: t0OptionDeribitLabel },
    {
      enabled: canManage && showEntrySheet && isOptionOpeningEntry && Boolean(t0OptionDeribitLabel),
      staleTime: 5 * 60 * 1000,
    },
  );
  const t0OptionStrikeRows = (((t0OptionStrikesQuery.data as any)?.strikes ?? []) as unknown[]);
  const t0OptionStrikes = t0OptionStrikeRows
    .map((strike) => Number(strike))
    .filter((strike: number) => Number.isFinite(strike) && strike > 0);
  // 期权不是只有数量和行权价：方向、Deribit 到期日、行权价、权利金及计价币任缺其一，都不能提交。
  // 与服务端 resolveOptionParameters 双重校验，避免移动端在字段未完整时误触保存。
  const optionFormValidationMessage = useMemo(() => {
    if (!isOptionOpeningEntry) return null;
    const quantity = Number(normalizeEthQuantity(entryForm.quantity));
    const strikePrice = Number(entryForm.price);
    const premium = Number(entryForm.optionPremium);
    if (quantityFormatError || !Number.isFinite(quantity) || quantity <= 0) return "请填写大于 0 的期权数量";
    if (!T0_OPTION_DIRECTIONS.some((option) => option.value === entryForm.optionDirection)) return "请选择期权方向";
    if (!entryForm.optionExpiryDate) return "请选择期权到期日";
    if (!entryForm.editingEntryId && !t0OptionDeribitLabel) return "请从 Deribit 可用到期日中选择期权到期日";
    if (!Number.isFinite(strikePrice) || strikePrice <= 0) return "请选择期权行权价";
    if (t0OptionDeribitLabel && t0OptionStrikesQuery.isLoading) return "行权价列表加载中，请稍候";
    if (t0OptionDeribitLabel && !t0OptionStrikes.some((strike) => Math.abs(strike - strikePrice) < 0.0000001)) return "请选择所选到期日对应的 Deribit 行权价";
    if (!entryForm.optionPremium.trim() || !Number.isFinite(premium) || premium <= 0) return "请输入大于 0 的权利金";
    if (!(["USDT", "ETH"] as T0OptionPremiumCurrency[]).includes(entryForm.optionPremiumCurrency)) return "请选择权利金计价币种";
    return null;
  }, [entryForm.editingEntryId, entryForm.optionDirection, entryForm.optionExpiryDate, entryForm.optionPremium, entryForm.optionPremiumCurrency, entryForm.price, entryForm.quantity, isOptionOpeningEntry, quantityFormatError, t0OptionDeribitLabel, t0OptionStrikes, t0OptionStrikesQuery.isLoading]);
  const gridFormValidationMessage = useMemo(() => {
    if (!isGridOpeningEntry) return null;
    const lower = Number(entryForm.gridRangeMin);
    const upper = Number(entryForm.gridRangeMax);
    const leverage = Number(entryForm.gridLeverage);
    const count = Number(entryForm.gridCount);
    if (!(entryForm.gridDirection === "long" || entryForm.gridDirection === "short")) return "请选择做多或做空网格";
    if (entryForm.gridDirection === "long") {
      if (!Number.isFinite(lower) || lower <= 0) return "请输入大于 0 的网格下限";
      if (!Number.isFinite(upper) || upper <= 0) return "请输入大于 0 的网格上限";
    } else {
      if (!Number.isFinite(upper) || upper <= 0) return "请输入大于 0 的网格上限";
      if (!Number.isFinite(lower) || lower <= 0) return "请输入大于 0 的网格下限";
    }
    if (upper <= lower) return "网格上限必须大于下限";
    if (!Number.isFinite(leverage) || leverage <= 0) return "请输入大于 0 的网格杠杆倍数";
    if (!Number.isSafeInteger(count) || count < 1 || count > 10000) return "网格数量须为 1 至 10000 的整数";
    return null;
  }, [entryForm.gridCount, entryForm.gridDirection, entryForm.gridLeverage, entryForm.gridRangeMax, entryForm.gridRangeMin, isGridOpeningEntry]);
  const isCloseReview = isClosingEntry && closeConfirmationStep === "review";
  // 平仓必须继承所选开仓单的账户、用户与项目归属，首次输入和二次确认均不可改。
  // 开仓编辑受后端 FIFO 依赖校验保护；未发生后续平仓时，管理员必须能改到既有账户。
  const isAccountSelectionLocked = isClosingEntry || (isCloseReview && !isEditingEntry);
  const isCloseAssociationLocked = isClosingEntry || isCloseReview;
  // 从蓝色待补开位进入时，关闭持续提醒只先形成“待取消”草稿；
  // 必须再点底部保存，才允许服务端暂停该非财务提醒位。
  const isReminderCancellationPending = Boolean(
    ACTIONS[entryForm.action].opening
    && entryForm.reminderTemplateId
    && !entryForm.keepReopenReminder,
  );
  // 逐笔报价的订单继续按分位精确排布；实时价仅为档间标记，不能再伪装成订单价格行。
  const individualMarkLadderPrice = markPrice && Number.isFinite(markPrice) && markPrice > 0
    ? Number(markPrice.toFixed(2))
    : null;
  const integratedLiveReferenceBand = getLadderReferenceBand(individualMarkLadderPrice, integratedArchiveStep);
  const integratedMarkAnchorPrice = integratedLiveReferenceBand?.anchorPrice ?? null;
  const individualLiveReferenceBand = getLadderReferenceBand(individualMarkLadderPrice, POSITION_ARCHIVE_STEP);
  // 平仓百分比快捷键以“本张开仓主单尚未平掉的数量”和当前价档可平数量两者较小者为基数。
  // 因此同价位存在多张订单或已有部分平仓时，快捷键也不会超过本次实际可平上限。
  const closingAvailableQuantity = useMemo(() => {
    if (!isClosingEntry || !closingSourceTrade) return 0;
    const side = ACTIONS[closingSourceTrade.action].side;
    const relatedUserKey = closingSourceTrade.relatedUserId ?? "";
    const relatedFundKey = closingSourceTrade.relatedFundId ?? "";
    const sourceClosingAllocations = ladderOpeningClosingAllocations.get(closingSourceTrade.id) ?? [];
    const sourceClosedQuantity = sourceClosingAllocations.reduce((total, allocation) => total + allocation.quantity, 0);
    const sourceRemainingQuantity = Math.max(0, closingSourceTrade.quantity - sourceClosedQuantity);
    const targetPrice = entryForm.targetPrice ?? archivePriceForTrade(closingSourceTrade);
    const scopeBuckets = buildPositionBuckets(selectedFilledTrades.filter((trade) => (
      trade.accountId === closingSourceTrade.accountId
      && (trade.relatedUserId ?? "") === relatedUserKey
      && (trade.relatedFundId ?? "") === relatedFundKey
    )));
    const targetBucket = scopeBuckets.find((bucket) => bucket.side === side && priceKey(bucket.price) === priceKey(targetPrice));
    return Math.max(0, Math.min(sourceRemainingQuantity, targetBucket?.remainingQuantity ?? 0));
  }, [closingSourceTrade, entryForm.targetPrice, isClosingEntry, ladderOpeningClosingAllocations, selectedFilledTrades]);
  // 整合报价只按真实订单价位汇总；逐笔报价则按开仓主单逐笔显示。
  // 持续提醒不是挂单或仓位，因此只在管理员逐笔报价中作为待补位入口出现，
  // 不显示在整合报价，也不参与任何价位的数量、成本或盈亏汇总。
  const ladderIntegratedDisplayBuckets = integratedDisplayBuckets;
  const priceRows = useMemo<LadderPriceRow[]>(() => {
    const activePositionPrices = ladderIntegratedDisplayBuckets
      .filter((bucket) => bucket.remainingQuantity > 0.0000001)
      .map((bucket) => bucket.price);
    const actualRows = buildAdaptiveLadderLevels(integratedMarkAnchorPrice, activePositionPrices, integratedArchiveStep).map((price) => ({
      key: `integrated-${priceKey(price)}`,
      price,
      long: ladderIntegratedDisplayBuckets.find((bucket) => bucket.side === "long" && priceKey(bucket.price) === priceKey(price)),
      short: ladderIntegratedDisplayBuckets.find((bucket) => bucket.side === "short" && priceKey(bucket.price) === priceKey(price)),
    }));
    const sortedRows = actualRows.sort((left, right) => right.price - left.price || left.key.localeCompare(right.key));
    return applyLadderLivePriceMarker(
      sortedRows,
      resolveLadderLivePriceMarker(individualMarkLadderPrice, sortedRows.map((row) => row.price)),
    );
  }, [ladderIntegratedDisplayBuckets, integratedMarkAnchorPrice, integratedArchiveStep, individualMarkLadderPrice]);
  const individualPriceRows = useMemo<LadderPriceRow[]>(() => {
    const individualBuckets: Array<{ trade: PreviewTrade; bucket: PositionBucket }> = [];
    for (const trade of selectedTrades) {
      if (!ACTIONS[trade.action].opening) continue;
      const linkedClosings = ladderOpeningClosingAllocations.get(trade.id) ?? [];
      const closedQuantity = linkedClosings.reduce((total, item) => total + item.quantity, 0);
      const remainingQuantity = Math.max(0, trade.quantity - closedQuantity);
      if (remainingQuantity <= 0.0000001) continue;
      const side = ACTIONS[trade.action].side;
      const isPending = Boolean(trade.isPending);
      // 逐笔报价以成交价精确到 0.01 U 作为配对键：只有分位完全相同的左右订单才同一行。
      // 原始成交价仍用于成本、盈亏和 FIFO，十美元归档价仅服务于整合报价和可用量校验。
      const price = Number(trade.price.toFixed(2));
      const remainingRatio = trade.quantity > 0 ? remainingQuantity / trade.quantity : 0;
      individualBuckets.push({
        trade,
        bucket: {
          key: `entry:${trade.id}`,
          side,
          instrumentType: trade.instrumentType,
          price,
          originalQuantity: trade.quantity,
          remainingQuantity,
          costBasis: trade.price * remainingQuantity,
          financialQuantity: isPending ? 0 : getTradeFinancialQuantity(trade, remainingQuantity),
          financialCostBasis: isPending ? 0 : trade.price * getTradeFinancialQuantity(trade, remainingQuantity),
          openingFeeBasis: isPending ? 0 : trade.fee * remainingRatio,
          realizedGrossPnl: 0,
          realizedOpeningFee: 0,
          realizedClosingFee: 0,
          realizedPnl: 0,
          closedQuantity,
          closedCostBasis: trade.price * closedQuantity,
          closedNotional: 0,
          openedAt: trade.createdAt,
        },
      });
    }
    const rowsByPrice = new Map<string, Array<{ trade: PreviewTrade; bucket: PositionBucket }>>();
    for (const item of individualBuckets) {
      const key = priceKey(item.bucket.price);
      const rows = rowsByPrice.get(key) ?? [];
      rows.push(item);
      rowsByPrice.set(key, rows);
    }
    // 逐笔报价只展示每笔未平仓订单的实际成交价位。实时价不再插入为独立精确价位；
    // 若其位于所有现有行之外，才补一对十美元参考档，以保留可见的上下价格刻度。
    const individualLevels = new Set<number>(individualBuckets.map((item) => item.bucket.price));
    for (const reminder of visibleReopenReminders) individualLevels.add(reminder.anchorPrice);
    const existingIndividualMarker = resolveLadderLivePriceMarker(individualMarkLadderPrice, Array.from(individualLevels));
    if (!existingIndividualMarker && individualLiveReferenceBand) {
      individualLevels.add(individualLiveReferenceBand.lowerPrice);
      individualLevels.add(individualLiveReferenceBand.upperPrice);
    }
    const individualLevelPrices = Array.from(individualLevels).sort((a, b) => b - a);
    const rows = individualLevelPrices.flatMap((price) => {
      const rowsAtPrice = [...(rowsByPrice.get(priceKey(price)) ?? [])]
        .sort((a, b) => b.trade.createdAt.localeCompare(a.trade.createdAt) || b.trade.id.localeCompare(a.trade.id));
      const reminders = visibleReopenReminders.filter((item) => priceKey(item.anchorPrice) === priceKey(price));
      if (rowsAtPrice.length === 0) {
        if (reminders.length > 0) return reminders.map((reminder) => ({
          key: `individual-reopen-reminder-${reminder.id}`,
          price,
          ...(reminder.side === 'long' ? { longReminder: reminder } : { shortReminder: reminder }),
        }));
        return [{
          key: `individual-empty-${priceKey(price)}`,
          price,
        }];
      }
      // 同一显示价格的左右订单应在同一行视觉配对；每一笔仍独立保留自己的 bucket、标记及操作入口。
      // 若同侧有多笔，按开仓时间逐笔向下延展，而不是合并数量或改写 FIFO。
      const longRows = rowsAtPrice.filter(({ bucket }) => bucket.side === "long");
      const shortRows = rowsAtPrice.filter(({ bucket }) => bucket.side === "short");
      const pairedRowCount = Math.max(longRows.length, shortRows.length);
      const actualRows = Array.from({ length: pairedRowCount }, (_, index) => {
        const longRow = longRows[index];
        const shortRow = shortRows[index];
        return {
          key: `individual-pair-${priceKey(price)}-${longRow?.trade.id ?? "empty"}-${shortRow?.trade.id ?? "empty"}`,
          price,
          long: longRow?.bucket,
          short: shortRow?.bucket,
          longOpeningTrade: longRow?.trade,
          shortOpeningTrade: shortRow?.trade,
        };
      });
      // 部分平仓后，原开仓单的真实剩余仓位必须继续显示；同时把本次已平数量
      // 作为同一原价位的一行蓝色待补开占位紧随其后，二者绝不相互覆盖或抵扣。
      return [...actualRows, ...reminders.map((reminder) => ({
        key: `individual-reopen-reminder-${reminder.id}`,
        price,
        ...(reminder.side === 'long' ? { longReminder: reminder } : { shortReminder: reminder }),
      }))];
    });
    return applyLadderLivePriceMarker(
      rows,
      resolveLadderLivePriceMarker(individualMarkLadderPrice, individualLevelPrices),
    );
  }, [selectedTrades, ladderOpeningClosingAllocations, individualLiveReferenceBand, individualMarkLadderPrice, visibleReopenReminders]);
  const isIndividualLadderView = adminLadderDisplayMode === "individual";
  const displayedPriceRows = isIndividualLadderView ? individualPriceRows : priceRows;

  const openEntrySheet = (
    action: TradeAction = "openLong",
    targetPrice?: number,
    sourceLadderDisplayMode?: AdminLadderDisplayMode,
  ) => {
    // 从报价单元格直接进入时显式携带来源模式，避免 React 状态批处理期间误回退到整合报价。
    const sourceMode = sourceLadderDisplayMode ?? adminLadderDisplayMode;
    entrySheetLadderDisplayModeRef.current = sourceMode;
    entrySheetArchiveStepRef.current = sourceMode === "integrated"
      ? integratedArchiveStep
      : POSITION_ARCHIVE_STEP;
    // 现货/合约保留左多右空；期权虽可选四个组合，但空档入口仍必须继承所点左右侧。
    // 左侧默认买入看涨，右侧默认买入看跌，确保同价位另一侧的订单绝不被带入详情。
    const initialInstrumentType = ACTIONS[action].opening ? lastOpeningInstrumentType : undefined;
    const initialOptionDirection: T0OptionDirection = action === "openShort" ? "long_put" : "long_call";
    const initialGridDirection: T0GridDirection = action === "openShort" ? "short" : "long";
    const initialAction = initialInstrumentType === "option"
      ? getOptionOpeningAction(initialOptionDirection)
      : action;
    setEntrySide(ACTIONS[initialAction].side);
    setCloseConfirmationStep("input");
    setClosingSourceTrade(null);
    setEditingOriginalTrade(null);
    const rememberedAccount = getRememberedAccountForRelatedUser(lastRelatedUser?.id);
    const defaultRelatedFund = getRememberedFundForRelatedUser(lastRelatedUser?.id);
    setEntryForm({
      action: initialAction,
      accountId: rememberedAccount?.id ?? "",
      accountName: rememberedAccount?.name ?? "",
      relatedUserId: lastRelatedUser?.id ?? "",
      relatedUserName: lastRelatedUser?.name ?? "",
      relatedUsername: lastRelatedUser?.username ?? "",
      relatedFundId: defaultRelatedFund?.id ?? "",
      relatedFundName: defaultRelatedFund?.name ?? "",
      instrumentType: initialInstrumentType,
      optionDirection: initialOptionDirection,
      optionExpiryDate: "",
      optionPremium: "",
      optionPremiumCurrency: "USDT",
      gridDirection: initialGridDirection,
      gridRangeMin: "",
      gridRangeMax: "",
      gridLeverage: "",
      gridCount: "",
      isLocked: false,
      isCounterparty: false,
      isPending: false,
      isTakeProfit: false,
      takeProfitPrice: "",
      takeProfitQuantity: "",
      takeProfitPlans: [],
      quantity: "",
      // 开仓成交价由管理员实际录入；保留浅色 0.00 占位，避免误把参考价写入流水。
      price: "",
      // 仅本次新建普通开仓固定实时价前两位；行情之后变动也不改写正在录入的价格。
      priceInputPrefix: getT0EthPriceInputPrefix(markPrice),
      note: "",
      targetPrice,
    });
    setShowEntrySheet(true);
  };

  const openReopenReminderEntrySheet = (reminder: T0ReopenReminder, sourceLadderDisplayMode?: AdminLadderDisplayMode) => {
    const sourceMode = sourceLadderDisplayMode ?? adminLadderDisplayMode;
    entrySheetLadderDisplayModeRef.current = sourceMode;
    entrySheetArchiveStepRef.current = sourceMode === 'integrated' ? integratedArchiveStep : POSITION_ARCHIVE_STEP;
    const action: TradeAction = reminder.side === 'long' ? 'openLong' : 'openShort';
    setEntrySide(reminder.side);
    setCloseConfirmationStep('input');
    setClosingSourceTrade(null);
    setEditingOriginalTrade(null);
    setEntryForm({
      action,
      accountId: reminder.accountId,
      accountName: reminder.accountName,
      relatedUserId: reminder.relatedUserId ?? '',
      relatedUserName: reminder.relatedUserName ?? '',
      relatedUsername: reminder.relatedUsername ?? '',
      relatedFundId: reminder.relatedFundId ?? '',
      relatedFundName: reminder.relatedFundName ?? '',
      instrumentType: reminder.instrumentType,
      optionDirection: reminder.side === 'long' ? 'long_call' : 'long_put',
      optionExpiryDate: '', optionPremium: '', optionPremiumCurrency: 'USDT',
      gridDirection: reminder.side, gridRangeMin: '', gridRangeMax: '', gridLeverage: '', gridCount: '',
      isLocked: false, isCounterparty: false,
      // 原价待补开位须直接带入原成交价；管理员仍可改价或改为挂单。
      isPending: false,
      keepReopenReminder: true,
      reminderTemplateId: reminder.id,
      isTakeProfit: false, takeProfitPrice: '', takeProfitQuantity: '', takeProfitPlans: [],
      quantity: normalizeEthQuantity(String(reminder.defaultQuantity)),
      price: String(reminder.anchorPrice), note: '', targetPrice: archivePriceForSide(reminder.side, reminder.anchorPrice),
    });
    setShowEntrySheet(true);
  };

  const openQuickCloseSheet = (trade: PreviewTrade) => {
    // 锁定是剩余仓位的操作保护：必须先通过“编辑”解除锁定，才允许创建新的平仓流水。
    // 服务端也会按 FIFO 实际匹配结果复核，避免已打开的表单绕过此处的前端提示。
    if (trade.isLocked) {
      t0Toast.error("该笔剩余仓位已锁定，请先点击“编辑”解除锁定后再平仓");
      return;
    }
    // 在报价详情内切换至平仓表单时，沿用最初进入详情页的报价模式；
    // 从历史记录直接打开时才以当前管理员模式为来源。
    if (!showEntrySheet) entrySheetLadderDisplayModeRef.current = adminLadderDisplayMode;
    setRelatedUserQuickPickerOpen(false);
    setRelatedUserPickerOpen(false);
    setRelatedUserSearch("");
    const side = ACTIONS[trade.action].side;
    // 未关联用户的订单也可独立平仓；空关联值会稳定归到同一“未关联”仓位池，
    // 不会和任何已关联用户的订单互相抵扣。
    const relatedUserKey = trade.relatedUserId ?? "";
    const relatedFundKey = trade.relatedFundId ?? "";
    const tradeUserBuckets = buildPositionBuckets(selectedFilledTrades.filter((item) => (
      item.accountId === trade.accountId
      && (item.relatedUserId ?? "") === relatedUserKey
      && (item.relatedFundId ?? "") === relatedFundKey
    )));
    const target = tradeUserBuckets.find((bucket) => bucket.side === side && priceKey(bucket.price) === priceKey(archivePriceForTrade(trade)));
    if (!target || target.remainingQuantity <= 0.0000001) {
      t0Toast.error("该笔仓位已无可平数量");
      return;
    }
    // 数量预填必须取这张主单本身尚未关联平仓的剩余量，不能误用同价位汇总仓量。
    const sourceClosingAllocations = ladderOpeningClosingAllocations.get(trade.id) ?? [];
    const sourceClosedQuantity = sourceClosingAllocations.reduce((total, allocation) => total + allocation.quantity, 0);
    const sourceRemainingQuantity = Math.max(0, trade.quantity - sourceClosedQuantity);
    const closableQuantity = Math.min(target.remainingQuantity, sourceRemainingQuantity);
    if (closableQuantity <= 0.0000001) {
      t0Toast.error("该笔订单已无可平数量");
      return;
    }
    const action: TradeAction = side === "long" ? "closeLong" : "closeShort";
    setEntrySide(side);
    setCloseConfirmationStep("input");
    setClosingSourceTrade(trade);
    setEditingOriginalTrade(null);
    setEntryForm({
      action,
      accountId: trade.accountId,
      accountName: getTradeAccountName(trade),
      relatedUserId: trade.relatedUserId ?? "",
      relatedUserName: trade.relatedUserName ?? trade.relatedUsername ?? "",
      relatedUsername: trade.relatedUsername ?? "",
      relatedFundId: trade.relatedFundId ?? "legacy",
      relatedFundName: trade.relatedFundName ?? "",
      instrumentType: trade.instrumentType,
      optionDirection: trade.optionDirection ?? "long_call",
      optionExpiryDate: trade.optionExpiryDate ?? "",
      optionPremium: trade.optionPremium === undefined ? "" : String(trade.optionPremium),
      optionPremiumCurrency: trade.optionPremiumCurrency ?? "USDT",
      gridDirection: trade.gridDirection ?? (side === "long" ? "long" : "short"),
      gridRangeMin: trade.gridRangeMin === undefined ? "" : String(trade.gridRangeMin),
      gridRangeMax: trade.gridRangeMax === undefined ? "" : String(trade.gridRangeMax),
      gridLeverage: trade.gridLeverage === undefined ? "" : String(trade.gridLeverage),
      gridCount: trade.gridCount === undefined ? "" : String(trade.gridCount),
      isLocked: false,
      isCounterparty: false,
      isPending: false,
      isTakeProfit: false,
      takeProfitPrice: "",
      takeProfitQuantity: "",
      // 表单值不能带千分位逗号，否则超过千位的数量会无法通过数值校验。
      quantity: normalizeEthQuantity(String(closableQuantity)),
      price: markPrice ? markPrice.toFixed(2) : "",
      note: "",
      targetPrice: target.price,
      targetOpeningEntryId: getStoredEntryId(trade),
    });
    setShowEntrySheet(true);
  };

  useEffect(() => {
    if (!isCloseDistributionPreviewLink) {
      closeDistributionPreviewLinkInitializedRef.current = false;
      return;
    }
    if (closeDistributionPreviewLinkInitializedRef.current || !canManage || trades.length === 0) return;
    const simulatedClosePrice = 2385.65;
    const allocationsByOpening = buildOpeningClosingAllocations(trades);
    const previewSource = trades
      .filter((trade) => (
        !trade.isPending
        && !trade.isLocked
        && !trade.isCounterpartyView
        && trade.action === "openShort"
        && (trade.instrumentType === "spot" || trade.instrumentType === "contract")
        && trade.price > simulatedClosePrice
        && Math.abs(trade.price - 2450) <= 75
      ))
      .map((trade) => {
        const closedQuantity = (allocationsByOpening.get(trade.id) ?? [])
          .reduce((total, allocation) => total + allocation.quantity, 0);
        return { trade, remainingQuantity: Math.max(0, trade.quantity - closedQuantity) };
      })
      .filter(({ remainingQuantity }) => remainingQuantity >= 5 - 0.0000001)
      // 优先使用开仓价2,450附近、剩余正好50 ETH的空单；没有时才选择最接近的可平空单。
      .sort((left, right) => (
        Math.abs(left.remainingQuantity - 50) - Math.abs(right.remainingQuantity - 50)
        || Math.abs(left.trade.price - 2450) - Math.abs(right.trade.price - 2450)
        || left.trade.createdAt.localeCompare(right.trade.createdAt)
      ))[0]?.trade;
    if (!previewSource) return;

    closeDistributionPreviewLinkInitializedRef.current = true;
    const targetPrice = archivePriceForTrade(previewSource);
    entrySheetLadderDisplayModeRef.current = "individual";
    entrySheetArchiveStepRef.current = POSITION_ARCHIVE_STEP;
    setEntrySide("short");
    setClosingSourceTrade(previewSource);
    setEditingOriginalTrade(null);
    setEntryForm({
      action: "closeShort",
      accountId: previewSource.accountId,
      accountName: getTradeAccountName(previewSource),
      relatedUserId: previewSource.relatedUserId ?? "",
      relatedUserName: previewSource.relatedUserName ?? previewSource.relatedUsername ?? "",
      relatedUsername: previewSource.relatedUsername ?? "",
      relatedFundId: previewSource.relatedFundId ?? "legacy",
      relatedFundName: previewSource.relatedFundName ?? "",
      instrumentType: previewSource.instrumentType,
      optionDirection: previewSource.optionDirection ?? "long_call",
      optionExpiryDate: previewSource.optionExpiryDate ?? "",
      optionPremium: previewSource.optionPremium === undefined ? "" : String(previewSource.optionPremium),
      optionPremiumCurrency: previewSource.optionPremiumCurrency ?? "USDT",
      gridDirection: previewSource.gridDirection ?? "short",
      gridRangeMin: previewSource.gridRangeMin === undefined ? "" : String(previewSource.gridRangeMin),
      gridRangeMax: previewSource.gridRangeMax === undefined ? "" : String(previewSource.gridRangeMax),
      gridLeverage: previewSource.gridLeverage === undefined ? "" : String(previewSource.gridLeverage),
      gridCount: previewSource.gridCount === undefined ? "" : String(previewSource.gridCount),
      isLocked: false,
      isCounterparty: false,
      isPending: false,
      isTakeProfit: false,
      takeProfitPrice: "",
      takeProfitQuantity: "",
      takeProfitPlans: [],
      quantity: "5",
      price: simulatedClosePrice.toFixed(2),
      note: "",
      targetPrice,
      targetOpeningEntryId: getStoredEntryId(previewSource),
    });
    setSharedIncomePreviewMarkPrice(simulatedClosePrice);
    setShowEntrySheet(true);
    setCloseConfirmationStep("review");
  }, [canManage, isCloseDistributionPreviewLink, trades]);

  const openEditOpeningTrade = (trade: PreviewTrade) => {
    if (!ACTIONS[trade.action].opening) {
      t0Toast.error("当前仅支持编辑开仓记录");
      return;
    }
    // 同上：详情页中的“编辑”不得覆盖其原始逐笔/整合报价来源。
    if (!showEntrySheet) entrySheetLadderDisplayModeRef.current = adminLadderDisplayMode;
    // 反向订单在管理员端显示为相反方向，但编辑表单必须回到真实流水方向，
    // 否则保存后会错误改变下一笔开仓的默认方向。
    setEntrySide(ACTIONS[getStoredAction(trade)].side);
    setCloseConfirmationStep("input");
    setOpeningEditSaveSafetyReview(null);
    setClosingSourceTrade(null);
    setEditingOriginalTrade(trade);
    setEntryProfitShareEditTarget(null);
    setPartialOpeningAttributionDraft(null);
    setPartialOpeningAttributionScope(null);
    setPartialOpeningAttributionError(null);
    residualReassignRequestIdRef.current = null;
    residualReassignRequestFingerprintRef.current = null;
    // 已关联平仓的主单保留原始数量供 FIFO 与审计使用；编辑视图仅展示剩余余额。
    const linkedClosings = openingClosingAllocations.get(trade.id) ?? [];
    const closedQuantity = linkedClosings.reduce((total, allocation) => total + allocation.quantity, 0);
    const remainingQuantity = Math.max(0, trade.quantity - closedQuantity);
    const editableQuantity = closedQuantity > 0.0000001 && remainingQuantity > 0.0000001
      ? remainingQuantity
      : trade.quantity;
    setEntryForm({
      action: getStoredAction(trade),
      accountId: trade.accountId,
      accountName: accounts.find((account) => account.id === trade.accountId)?.name ?? "",
      relatedUserId: trade.relatedUserId ?? "",
      relatedUserName: trade.relatedUserName ?? trade.relatedUsername ?? "",
      relatedUsername: trade.relatedUsername ?? "",
      relatedFundId: trade.relatedFundId ?? "legacy",
      relatedFundName: trade.relatedFundName ?? "",
      instrumentType: trade.instrumentType,
      optionDirection: getStoredOptionDirection(trade) ?? "long_call",
      optionExpiryDate: trade.optionExpiryDate ?? "",
      optionPremium: trade.optionPremium === undefined ? "" : String(trade.optionPremium),
      optionPremiumCurrency: trade.optionPremiumCurrency ?? "USDT",
      gridDirection: getStoredGridDirection(trade) ?? (ACTIONS[getStoredAction(trade)].side === "long" ? "long" : "short"),
      gridRangeMin: trade.gridRangeMin === undefined ? "" : String(trade.gridRangeMin),
      gridRangeMax: trade.gridRangeMax === undefined ? "" : String(trade.gridRangeMax),
      gridLeverage: trade.gridLeverage === undefined ? "" : String(trade.gridLeverage),
      gridCount: trade.gridCount === undefined ? "" : String(trade.gridCount),
      isLocked: Boolean(trade.isLocked),
      isCounterparty: Boolean(trade.isCounterparty),
      isPending: Boolean(trade.isPending),
      keepReopenReminder: Boolean(trade.keepReopenReminder),
      isTakeProfit: Boolean(trade.takeProfitEnabled),
      takeProfitPrice: trade.takeProfitPrice === undefined ? "" : String(trade.takeProfitPrice),
      takeProfitQuantity: trade.takeProfitQuantity === undefined ? "" : normalizeEthQuantity(String(trade.takeProfitQuantity)),
      takeProfitPlans: getTradeTakeProfitPlanDrafts(trade),
      // 部分平仓时表单只展示剩余可操作量；服务端 lockOnly 分支只更新标记，不改写原始订单数量。
      quantity: normalizeEthQuantity(String(editableQuantity)),
      price: trade.price.toFixed(2),
      priceInputPrefix: "",
      note: trade.note ?? "",
      editingEntryId: getStoredEntryId(trade),
    });
    setShowEntrySheet(true);
  };

  const selectAccountMutation = trpc.ledger.t0SelectAccount.useMutation({
    onSuccess: (data: any) => {
      const account: PreviewAccount = {
        id: String(data.account.id),
        name: String(data.account.name),
        lastUsedAt: data.account.lastUsedAt ?? null,
      };
      setAccounts((current) => [account, ...current.filter((item) => item.id !== account.id)]);
    },
    onError: (error) => t0Toast.error(error.message || "下单账户选择未保存"),
  });

  const pauseReopenReminderMutation = trpc.ledger.t0PauseReopenReminder.useMutation({
    onSuccess: () => {
      // 仅移除蓝色待补开占位；真实订单、历史流水和任何收益数据均不受影响。
      setShowEntrySheet(false);
      setCloseConfirmationStep('input');
      setClosingSourceTrade(null);
      setEditingOriginalTrade(null);
      void t0JournalQuery.refetch();
      t0Toast.success('持续提醒已取消');
    },
    onError: (error) => {
      const message = error.message || '持续提醒取消失败';
      setOpeningSaveError(message);
      t0Toast.error(message);
    },
  });

  const renameAccountMutation = trpc.ledger.t0RenameAccount.useMutation({
    onSuccess: (data: any) => {
      const account: PreviewAccount = {
        id: String(data.account.id),
        name: String(data.account.name),
        lastUsedAt: data.account.lastUsedAt ?? null,
      };
      setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, name: account.name } : item));
      setTrades((current) => current.map((trade) => trade.accountId === account.id ? { ...trade, accountName: account.name } : trade));
      setEntryForm((current) => current.accountId === account.id ? { ...current, accountName: account.name } : current);
      setDirectoryRenameTarget(null);
      setDirectoryDeleteTarget(null);
      void t0JournalQuery.refetch();
      t0Toast.success("账户名称已更新，历史记录已同步显示新名称");
    },
    onError: (error) => t0Toast.error(error.message || "账户名称修改失败"),
  });

  const renameRelatedFundMutation = trpc.ledger.t0RenameRelatedFund.useMutation({
    onSuccess: (data: any) => {
      const fund: PreviewRelatedFund = {
        id: String(data.relatedFund.id),
        relatedUserId: data.relatedFund.relatedUserId === undefined ? undefined : String(data.relatedFund.relatedUserId),
        name: String(data.relatedFund.name),
        lastUsedAt: data.relatedFund.lastUsedAt ?? null,
      };
      setRelatedFunds((current) => current.map((item) => item.id === fund.id ? { ...item, name: fund.name } : item));
      setTrades((current) => current.map((trade) => trade.relatedFundId === fund.id ? { ...trade, relatedFundName: fund.name } : trade));
      setEntryForm((current) => current.relatedFundId === fund.id ? { ...current, relatedFundName: fund.name } : current);
      setDirectoryRenameTarget(null);
      setDirectoryDeleteTarget(null);
      void t0JournalQuery.refetch();
      t0Toast.success("项目名称已更新，历史记录已同步显示新名称");
    },
    onError: (error) => t0Toast.error(error.message || "项目名称修改失败"),
  });

  const deleteDirectoryItemMutation = trpc.ledger.t0DeleteDirectoryItem.useMutation({
    onSuccess: (data: any, variables: any) => {
      const target = directoryDeleteTarget;
      if (variables.dimension === "account") {
        const deletedId = String(variables.dimensionId);
        setAccounts((current) => current.filter((item) => item.id !== deletedId));
        setEntryForm((current) => current.accountId === deletedId
          ? { ...current, accountId: "", accountName: "" }
          : current);
        setSelectedAccountIds((current) => current.filter((id) => id !== deletedId));
      } else if (variables.dimension === "related_fund") {
        const deletedId = String(variables.dimensionId);
        setRelatedFunds((current) => current.filter((item) => item.id !== deletedId));
        setEntryForm((current) => current.relatedFundId === deletedId
          ? { ...current, relatedFundId: "", relatedFundName: "" }
          : current);
        setRelatedFundFilterIds((current) => current.filter((id) => id !== deletedId));
      } else {
        const deletedId = String(variables.dimensionId);
        setRecentRelatedUsers((current) => current.filter((item) => item.id !== deletedId));
        setEntryForm((current) => current.relatedUserId === deletedId
          ? { ...current, relatedUserId: "", relatedUserName: "", relatedUsername: "", relatedFundId: "", relatedFundName: "" }
          : current);
        setRelatedUserFilterIds((current) => current.filter((id) => id !== deletedId));
      }
      setDirectoryDeleteTarget(null);
      void t0JournalQuery.refetch();
      t0Toast.success(target?.kind === "relatedUser"
        ? `关联用户已从当前T+0账本移除；${Number(data?.impact?.affectedEntryCount || 0)} 条历史记录现显示为未关联`
        : `${target?.kind === "account" ? "账户" : "项目"}已删除；${Number(data?.impact?.affectedEntryCount || 0)} 条历史记录现显示为未关联`);
    },
    onError: (error) => t0Toast.error(error.message || "目录删除失败"),
  });

  const setProfitShareRuleMutation = trpc.ledger.t0SetProfitShareRule.useMutation({
    onSuccess: (data: any) => {
      const savedFund = Array.isArray(data?.rules) ? data.rules[0] : null;
      if (savedFund?.relatedFundId && profitShareSource && !profitShareSource.id) {
        const id = String(savedFund.relatedFundId);
        const name = String(savedFund.relatedFundName || profitShareSource.name);
        const fund: PreviewRelatedFund = { id, name, relatedUserId: profitShareSource.relatedUserId };
        setRelatedFunds((current) => [fund, ...current.filter((item) => item.id !== id)]);
        setEntryForm((current) => current.relatedFundId
          ? current
          : { ...current, relatedFundId: id, relatedFundName: name });
      }
      setProfitShareSaveError(null);
      setProfitShareSource(null);
      setProfitShareAllocations([]);
      setProfitShareRecipientSearch("");
      void t0JournalQuery.refetch();
      const syncedActiveOpeningCount = Number(data?.syncedActiveOpeningCount || 0);
      t0Toast.success(syncedActiveOpeningCount > 0
        ? `收益分配已保存，已同步${syncedActiveOpeningCount}笔进行中订单与后续新订单`
        : "收益分配已保存；后续新订单将采用新清单，已平历史保持不变");
    },
    onError: (error) => {
      const message = error.message || "收益分配保存失败";
      setProfitShareSaveError(message);
      t0Toast.error(message);
    },
  });

  const updateOpeningProfitShareMutation = trpc.ledger.t0UpdateOpeningProfitShare.useMutation({
    onSuccess: () => {
      setProfitShareSaveError(null);
      setProfitShareSource(null);
      setEntryProfitShareEditTarget(null);
      setProfitShareAllocations([]);
      setProfitShareRecipientSearch("");
      void t0JournalQuery.refetch();
      t0Toast.success("本单剩余仓位与后续新订单的收益分配已保存；已平历史保持不变");
    },
    onError: (error) => {
      const message = error.message || "本单收益分配保存失败";
      setProfitShareSaveError(message);
      t0Toast.error(message);
    },
  });

  const setSharedIncomeEligibilityMutation = trpc.ledger.t0SetSharedIncomeEligibility.useMutation({
    onSuccess: () => {
      void t0JournalQuery.refetch();
    },
  });
  const setSharedIncomePrincipalRuleMutation = trpc.ledger.t0SetSharedIncomePrincipalRule.useMutation({
    onSuccess: (data: any) => {
      const rawInfluencePercentage = Number(data?.influencePercentage);
      const savedRule: SharedIncomePrincipalRule = {
        curve: data?.curve === "balanced" || data?.curve === "strong" ? data.curve : "linear",
        influencePercentage: Math.min(100, Math.max(0, Math.trunc(Number.isFinite(rawInfluencePercentage) ? rawInfluencePercentage : 100))),
      };
      setSharedIncomePrincipalRule(savedRule);
      setShowSharedIncomePrincipalRuleSettings(false);
      void t0SharedIncomePrincipalRuleQuery.refetch();
      t0Toast.success(`本金规则已保存为第${Math.max(1, Number(data?.version) || 1)}版；仅影响之后打开的AI分配建议`);
    },
    onError: (error) => t0Toast.error(error.message || "本金规则保存失败，请稍后重试"),
  });
  const changeSharedIncomeCandidateEligibility = useCallback((candidate: SharedIncomeCandidate, enabled: boolean) => {
    if (isCloseDistributionPreviewLink) {
      setSharedIncomeAllocationPlanError("这是直达模拟预览，资格开关不会保存");
      return;
    }
    const sourceUserId = Number(entryForm.relatedUserId);
    const recipientUserId = Number(candidate.userId);
    if (!Number.isInteger(sourceUserId) || sourceUserId <= 0 || !Number.isInteger(recipientUserId) || recipientUserId <= 0) {
      setSharedIncomeAllocationPlanError("当前订单使用者或分配人无效，请返回修改后重试");
      return;
    }
    const key = `${sourceUserId}:${recipientUserId}`;
    const previousEnabled = sharedIncomeEligibilityOverrides[key]
      ?? sharedIncomeEligibilityByPair.get(key)
      ?? true;
    setSharedIncomeAllocationPlanError(null);
    setSharedIncomeEligibilityOverrides((current) => ({ ...current, [key]: enabled }));
    if (!enabled) {
      setSharedIncomeDrafts((current) => {
        const { [candidate.userId]: _removed, ...rest } = current;
        return rest;
      });
      setSharedIncomeTargetSelections((current) => {
        const { [candidate.userId]: _removed, ...rest } = current;
        return rest;
      });
    }
    setSharedIncomeEligibilityMutation.mutate({ ledgerId: 52, sourceUserId, recipientUserId, enabled }, {
      onError: (error) => {
        setSharedIncomeEligibilityOverrides((current) => ({ ...current, [key]: previousEnabled }));
        setSharedIncomeAllocationPlanError(error.message || "共享资格保存失败，请重新操作");
      },
    });
  }, [entryForm.relatedUserId, isCloseDistributionPreviewLink, setSharedIncomeEligibilityMutation, sharedIncomeEligibilityByPair, sharedIncomeEligibilityOverrides]);

  const saveEntryMutation = trpc.ledger.t0CreateEntry.useMutation({
    onSuccess: (data: any, variables: any) => {
      saveEntryCommitLockRef.current = false;
      closeCommitRequestIdRef.current = null;
      const account: PreviewAccount = {
        id: String(data.account.id),
        name: String(data.account.name),
        lastUsedAt: data.account.lastUsedAt ?? null,
      };
      const entry: PreviewTrade = {
        id: String(data.entry.id),
        accountId: String(data.entry.accountId),
        accountName: data.entry.accountName ? String(data.entry.accountName) : account.name,
        relatedUserId: data.entry.relatedUserId === undefined || data.entry.relatedUserId === null ? undefined : String(data.entry.relatedUserId),
        relatedUserName: data.entry.relatedUserName ? String(data.entry.relatedUserName) : undefined,
        relatedUsername: data.entry.relatedUsername ? String(data.entry.relatedUsername) : undefined,
        relatedUserAvatar: data.entry.relatedUserAvatar ? String(data.entry.relatedUserAvatar) : undefined,
        relatedFundId: data.entry.relatedFundId === undefined || data.entry.relatedFundId === null ? undefined : String(data.entry.relatedFundId),
        relatedFundName: data.entry.relatedFundName ? String(data.entry.relatedFundName) : undefined,
        symbol: String(data.entry.symbol || "ETH"),
        action: data.entry.action as TradeAction,
        instrumentType: data.entry.instrumentType === "spot" || data.entry.instrumentType === "contract" || data.entry.instrumentType === "option" || data.entry.instrumentType === "grid"
          ? data.entry.instrumentType
          : undefined,
        optionDirection: data.entry.optionDirection === "long_call" || data.entry.optionDirection === "long_put" || data.entry.optionDirection === "short_call" || data.entry.optionDirection === "short_put"
          ? data.entry.optionDirection
          : undefined,
        optionExpiryDate: data.entry.optionExpiryDate ? String(data.entry.optionExpiryDate) : undefined,
        optionPremium: data.entry.optionPremium === undefined || data.entry.optionPremium === null ? undefined : Number(data.entry.optionPremium),
        optionPremiumCurrency: data.entry.optionPremiumCurrency === "USDT" || data.entry.optionPremiumCurrency === "ETH"
          ? data.entry.optionPremiumCurrency
          : undefined,
        gridDirection: data.entry.gridDirection === "long" || data.entry.gridDirection === "short" ? data.entry.gridDirection : undefined,
        gridRangeMin: data.entry.gridRangeMin === undefined || data.entry.gridRangeMin === null ? undefined : Number(data.entry.gridRangeMin),
        gridRangeMax: data.entry.gridRangeMax === undefined || data.entry.gridRangeMax === null ? undefined : Number(data.entry.gridRangeMax),
        gridLeverage: data.entry.gridLeverage === undefined || data.entry.gridLeverage === null ? undefined : Number(data.entry.gridLeverage),
        gridCount: data.entry.gridCount === undefined || data.entry.gridCount === null ? undefined : Number(data.entry.gridCount),
        isLocked: Boolean(data.entry.isLocked),
        isCounterparty: Boolean(data.entry.isCounterparty),
        isPending: Boolean(data.entry.isPending),
        filledAt: data.entry.filledAt ? String(data.entry.filledAt) : undefined,
        filledPrice: data.entry.filledPrice === undefined || data.entry.filledPrice === null ? undefined : Number(data.entry.filledPrice),
        takeProfitEnabled: Boolean(data.entry.takeProfitEnabled),
        takeProfitPrice: data.entry.takeProfitPrice === undefined || data.entry.takeProfitPrice === null ? undefined : Number(data.entry.takeProfitPrice),
        takeProfitQuantity: data.entry.takeProfitQuantity === undefined || data.entry.takeProfitQuantity === null ? undefined : Number(data.entry.takeProfitQuantity),
        takeProfitTriggeredAt: data.entry.takeProfitTriggeredAt ? String(data.entry.takeProfitTriggeredAt) : undefined,
        takeProfitTriggeredPrice: data.entry.takeProfitTriggeredPrice === undefined || data.entry.takeProfitTriggeredPrice === null ? undefined : Number(data.entry.takeProfitTriggeredPrice),
        takeProfitTriggeredQuantity: data.entry.takeProfitTriggeredQuantity === undefined || data.entry.takeProfitTriggeredQuantity === null ? undefined : Number(data.entry.takeProfitTriggeredQuantity),
        takeProfitPlans: Array.isArray(data.entry.takeProfitPlans) ? data.entry.takeProfitPlans.map((plan: any) => ({ id: String(plan.id || ''), triggerPrice: Number(plan.triggerPrice), quantity: Number(plan.quantity), status: plan.status === 'triggered' || plan.status === 'cancelled' ? plan.status : 'pending', triggeredAt: plan.triggeredAt ? String(plan.triggeredAt) : undefined, triggeredPrice: plan.triggeredPrice === undefined || plan.triggeredPrice === null ? undefined : Number(plan.triggeredPrice), triggeredQuantity: plan.triggeredQuantity === undefined || plan.triggeredQuantity === null ? undefined : Number(plan.triggeredQuantity), closingEntryId: plan.closingEntryId === undefined || plan.closingEntryId === null ? undefined : String(plan.closingEntryId) })) : undefined,
        quantity: Number(data.entry.quantity),
        price: Number(data.entry.price),
        fee: Number(data.entry.fee || 0),
        createdAt: String(data.entry.createdAt),
        recordedAt: data.entry.recordedAt ? String(data.entry.recordedAt) : undefined,
        targetPrice: data.entry.targetPrice === undefined || data.entry.targetPrice === null ? undefined : Number(data.entry.targetPrice),
        targetOpeningEntryId: data.entry.targetOpeningEntryId === undefined || data.entry.targetOpeningEntryId === null
          ? undefined
          : String(data.entry.targetOpeningEntryId),
        note: data.entry.note || undefined,
        clientRequestId: variables.clientRequestId,
      };
      setAccounts((current) => [account, ...current.filter((item) => item.id !== account.id && item.name !== account.name)]);
      setLastAccountIdByRelatedUser((current) => ({
        ...current,
        [relatedUserAccountMemoryKey(entry.relatedUserId)]: account.id,
      }));
      if (entry.relatedUserId) {
        const relatedUser: PreviewRelatedUser = {
          id: entry.relatedUserId,
          name: entry.relatedUserName || entry.relatedUsername || `用户#${entry.relatedUserId}`,
          username: entry.relatedUsername,
          avatar: entry.relatedUserAvatar,
          lastUsedAt: new Date().toISOString(),
        };
        setLastRelatedUserId(relatedUser.id);
        setRecentRelatedUsers((current) => [relatedUser, ...current.filter((item) => item.id !== relatedUser.id)]);
      }
      if (entry.relatedFundId && entry.relatedFundName && entry.relatedUserId) {
        const fund: PreviewRelatedFund = {
          id: entry.relatedFundId,
          relatedUserId: entry.relatedUserId,
          name: entry.relatedFundName,
          lastUsedAt: new Date().toISOString(),
        };
        setRelatedFunds((current) => [fund, ...current.filter((item) => item.id !== fund.id)]);
        setLastFundIdByRelatedUser((current) => ({ ...current, [entry.relatedUserId!]: fund.id }));
      }
      setTrades((current) => current.map((trade) => {
        if (trade.clientRequestId !== variables.clientRequestId) return trade;
        return canManage && (entry.isCounterparty || trade.isCounterpartyView)
          ? asAdminCounterpartyTrade(entry)
          : entry;
      }));
      setSelectedAccountIds((current) => current.length === 0 ? current : Array.from(new Set([...current, account.id])));
      const savedQuantity = String(variables.quantity || "").trim();
      if (savedQuantity) {
        setLastSavedQuantity(savedQuantity);
      }
      if (entry.instrumentType) setLastOpeningInstrumentType(entry.instrumentType);
      const isClosingEntry = !ACTIONS[entry.action].opening;
      if (isClosingEntry) {
        setCloseSaveError(null);
        setShowEntrySheet(false);
        setCloseConfirmationStep("input");
        if (canManage) setAdminLadderDisplayMode(entrySheetLadderDisplayModeRef.current);
      } else {
        // 开仓也以实际落库为准：确认成功后才收起表单，杜绝“看起来已保存”却没有流水。
        setOpeningSaveError(null);
        setShowEntrySheet(false);
        if (canManage) setAdminLadderDisplayMode(entrySheetLadderDisplayModeRef.current);
        void t0JournalQuery.refetch();
      }
      t0Toast.success(isClosingEntry
        ? `已确认${ACTIONS[entry.action].label} ${formatQuantity(entry.quantity)} ETH`
        : entry.isPending
          ? "挂单已保存，等待统一参考价触发成交"
          : entry.isLocked
            ? "速记已保存，逐笔报价将显示黑金锁标"
            : "速记已保存");
    },
    onError: (error, variables: any) => {
      // 失败后允许修正或重试；平仓的 request ID 刻意保留，避免“服务端已写入但响应丢失”时生成第二笔流水。
      saveEntryCommitLockRef.current = false;
      setTrades((current) => current.filter((trade) => trade.clientRequestId !== variables.clientRequestId));
      if (!variables.accountId) {
        setAccounts((current) => current.filter((account) => account.id !== `pending-account-${variables.clientRequestId}`));
      }
      const message = error.message || "速记保存失败，已撤回本地显示";
      const isClosingEntry = variables.action === "closeLong" || variables.action === "closeShort";
      if (isClosingEntry) {
        setCloseSaveError(message);
        setShowEntrySheet(true);
        setCloseConfirmationStep("review");
      } else {
        setOpeningSaveError(message);
        setShowEntrySheet(true);
        setCloseConfirmationStep("input");
      }
      t0Toast.error(isClosingEntry ? `平仓未确认：${message}` : message);
    },
  });

  const updateOpeningEntryMutation = trpc.ledger.t0UpdateOpeningEntry.useMutation({
    onSuccess: (data: any, variables: any) => {
      const entry: PreviewTrade = {
        id: String(data.entry.id),
        accountId: String(data.entry.accountId),
        accountName: data.entry.accountName
          ? String(data.entry.accountName)
          : accounts.find((account) => account.id === String(data.entry.accountId))?.name,
        relatedUserId: data.entry.relatedUserId === undefined || data.entry.relatedUserId === null ? undefined : String(data.entry.relatedUserId),
        relatedUserName: data.entry.relatedUserName ? String(data.entry.relatedUserName) : undefined,
        relatedUsername: data.entry.relatedUsername ? String(data.entry.relatedUsername) : undefined,
        relatedUserAvatar: data.entry.relatedUserAvatar ? String(data.entry.relatedUserAvatar) : undefined,
        relatedFundId: data.entry.relatedFundId === undefined || data.entry.relatedFundId === null ? undefined : String(data.entry.relatedFundId),
        relatedFundName: data.entry.relatedFundName ? String(data.entry.relatedFundName) : undefined,
        symbol: String(data.entry.symbol || "ETH"),
        action: data.entry.action as TradeAction,
        instrumentType: data.entry.instrumentType === "spot" || data.entry.instrumentType === "contract" || data.entry.instrumentType === "option" || data.entry.instrumentType === "grid"
          ? data.entry.instrumentType
          : undefined,
        optionDirection: data.entry.optionDirection === "long_call" || data.entry.optionDirection === "long_put" || data.entry.optionDirection === "short_call" || data.entry.optionDirection === "short_put"
          ? data.entry.optionDirection
          : undefined,
        optionExpiryDate: data.entry.optionExpiryDate ? String(data.entry.optionExpiryDate) : undefined,
        optionPremium: data.entry.optionPremium === undefined || data.entry.optionPremium === null ? undefined : Number(data.entry.optionPremium),
        optionPremiumCurrency: data.entry.optionPremiumCurrency === "USDT" || data.entry.optionPremiumCurrency === "ETH"
          ? data.entry.optionPremiumCurrency
          : undefined,
        gridDirection: data.entry.gridDirection === "long" || data.entry.gridDirection === "short" ? data.entry.gridDirection : undefined,
        gridRangeMin: data.entry.gridRangeMin === undefined || data.entry.gridRangeMin === null ? undefined : Number(data.entry.gridRangeMin),
        gridRangeMax: data.entry.gridRangeMax === undefined || data.entry.gridRangeMax === null ? undefined : Number(data.entry.gridRangeMax),
        gridLeverage: data.entry.gridLeverage === undefined || data.entry.gridLeverage === null ? undefined : Number(data.entry.gridLeverage),
        gridCount: data.entry.gridCount === undefined || data.entry.gridCount === null ? undefined : Number(data.entry.gridCount),
        isLocked: Boolean(data.entry.isLocked),
        isCounterparty: Boolean(data.entry.isCounterparty),
        isPending: Boolean(data.entry.isPending),
        keepReopenReminder: Boolean(data.entry.keepReopenReminder),
        filledAt: data.entry.filledAt ? String(data.entry.filledAt) : undefined,
        filledPrice: data.entry.filledPrice === undefined || data.entry.filledPrice === null ? undefined : Number(data.entry.filledPrice),
        takeProfitEnabled: Boolean(data.entry.takeProfitEnabled),
        takeProfitPrice: data.entry.takeProfitPrice === undefined || data.entry.takeProfitPrice === null ? undefined : Number(data.entry.takeProfitPrice),
        takeProfitQuantity: data.entry.takeProfitQuantity === undefined || data.entry.takeProfitQuantity === null ? undefined : Number(data.entry.takeProfitQuantity),
        takeProfitTriggeredAt: data.entry.takeProfitTriggeredAt ? String(data.entry.takeProfitTriggeredAt) : undefined,
        takeProfitTriggeredPrice: data.entry.takeProfitTriggeredPrice === undefined || data.entry.takeProfitTriggeredPrice === null ? undefined : Number(data.entry.takeProfitTriggeredPrice),
        takeProfitTriggeredQuantity: data.entry.takeProfitTriggeredQuantity === undefined || data.entry.takeProfitTriggeredQuantity === null ? undefined : Number(data.entry.takeProfitTriggeredQuantity),
        takeProfitPlans: Array.isArray(data.entry.takeProfitPlans) ? data.entry.takeProfitPlans.map((plan: any) => ({ id: String(plan.id || ''), triggerPrice: Number(plan.triggerPrice), quantity: Number(plan.quantity), status: plan.status === 'triggered' || plan.status === 'cancelled' ? plan.status : 'pending', triggeredAt: plan.triggeredAt ? String(plan.triggeredAt) : undefined, triggeredPrice: plan.triggeredPrice === undefined || plan.triggeredPrice === null ? undefined : Number(plan.triggeredPrice), triggeredQuantity: plan.triggeredQuantity === undefined || plan.triggeredQuantity === null ? undefined : Number(plan.triggeredQuantity), closingEntryId: plan.closingEntryId === undefined || plan.closingEntryId === null ? undefined : String(plan.closingEntryId) })) : undefined,
        quantity: Number(data.entry.quantity),
        price: Number(data.entry.price),
        fee: Number(data.entry.fee || 0),
        createdAt: String(data.entry.createdAt),
        recordedAt: data.entry.recordedAt ? String(data.entry.recordedAt) : undefined,
        targetPrice: data.entry.targetPrice === undefined || data.entry.targetPrice === null ? undefined : Number(data.entry.targetPrice),
        note: data.entry.note || undefined,
      };
      const account: PreviewAccount = {
        id: String(data.account?.id ?? entry.accountId),
        name: String(data.account?.name ?? entry.accountName ?? ""),
        lastUsedAt: data.account?.lastUsedAt ?? new Date().toISOString(),
      };
      setAccounts((current) => [account, ...current.filter((item) => item.id !== account.id && item.name !== account.name)]);
      setLastAccountIdByRelatedUser((current) => ({
        ...current,
        [relatedUserAccountMemoryKey(entry.relatedUserId)]: account.id,
      }));
      setTrades((current) => current.map((trade) => getStoredEntryId(trade) === entry.id
        ? (canManage && entry.isCounterparty ? asAdminCounterpartyTrade(entry) : entry)
        : trade));
      if (entry.relatedFundId && entry.relatedFundName && entry.relatedUserId) {
        const fund: PreviewRelatedFund = {
          id: entry.relatedFundId,
          relatedUserId: entry.relatedUserId,
          name: entry.relatedFundName,
          lastUsedAt: new Date().toISOString(),
        };
        setRelatedFunds((current) => [fund, ...current.filter((item) => item.id !== fund.id)]);
        setLastFundIdByRelatedUser((current) => ({ ...current, [entry.relatedUserId!]: fund.id }));
      }
      setCloseConfirmationStep("input");
      setOpeningEditSaveSafetyReview(null);
      if (entry.instrumentType) setLastOpeningInstrumentType(entry.instrumentType);
      // 编辑保存是单步操作：服务端确认落库后直接回到原提醒报价表，
      // 不再打开空白的“速记一笔”表单，避免管理员误以为还要再次保存。
      setClosingSourceTrade(null);
      setEditingOriginalTrade(null);
      setEntryProfitShareEditTarget(null);
      setShowEntrySheet(false);
      if (canManage) setAdminLadderDisplayMode(entrySheetLadderDisplayModeRef.current);
      // 重新读取服务端已落库的数据，保障持续提醒等后台字段在报价单上即时同步。
      void t0JournalQuery.refetch();
      t0Toast.success(variables?.manualConfirmPendingFill
        ? `挂单已手动确认成交，成交价 ${formatPrice(entry.price)}`
        : entry.isPending
          ? "挂单已保存，等待统一参考价触发成交"
          : entry.isLocked
            ? "开仓已锁定，逐笔报价将显示黑金锁标"
            : "开仓记录已修改");
    },
    onError: (error) => {
      const message = error.message || "开仓记录修改失败";
      setOpeningSaveError(message);
      t0Toast.error(message);
    },
  });

  const reassignOpeningRemainingMutation = trpc.ledger.t0ReassignOpeningRemaining.useMutation({
    onSuccess: (data: any) => {
      residualReassignCommitLockRef.current = false;
      residualReassignRequestIdRef.current = null;
      residualReassignRequestFingerprintRef.current = null;
      setPartialOpeningAttributionDraft(null);
      setPartialOpeningAttributionScope(null);
      setPartialOpeningAttributionError(null);
      setClosingSourceTrade(null);
      setEditingOriginalTrade(null);
      setEntryProfitShareEditTarget(null);
      setShowEntrySheet(false);
      if (canManage) setAdminLadderDisplayMode(entrySheetLadderDisplayModeRef.current);
      void t0JournalQuery.refetch();
      t0Toast.success(`剩余 ${formatQuantity(Number(data.reassignedQuantity || 0))} ETH 已转入新订单；已平历史保持不变`);
    },
    onError: (error) => {
      residualReassignCommitLockRef.current = false;
      setPartialOpeningAttributionError(error.message || "剩余仓位转入失败，请检查后重新确认");
      t0Toast.error(error.message || "剩余仓位转入失败，请检查后重新确认");
    },
  });

  const updatePartialOpeningHistoricalAttributionMutation = trpc.ledger.t0UpdatePartialOpeningHistoricalAttribution.useMutation({
    onSuccess: (data: any) => {
      residualReassignCommitLockRef.current = false;
      residualReassignRequestIdRef.current = null;
      residualReassignRequestFingerprintRef.current = null;
      setPartialOpeningAttributionDraft(null);
      setPartialOpeningAttributionScope(null);
      setPartialOpeningAttributionError(null);
      setClosingSourceTrade(null);
      setEditingOriginalTrade(null);
      setEntryProfitShareEditTarget(null);
      setShowEntrySheet(false);
      if (canManage) setAdminLadderDisplayMode(entrySheetLadderDisplayModeRef.current);
      void t0JournalQuery.refetch();
      t0Toast.success(`已同步更正原开仓和 ${Number(data.affectedClosingCount || 0)} 笔关联平仓的账户与项目；所有平仓数值和收益保持不变`);
    },
    onError: (error) => {
      residualReassignCommitLockRef.current = false;
      setPartialOpeningAttributionError(error.message || "历史账户与项目更正失败，请检查后重试");
      t0Toast.error(error.message || "历史账户与项目更正失败，请检查后重试");
    },
  });

  const deleteOpeningEntryMutation = trpc.ledger.t0DeleteOpeningEntry.useMutation({
    onSuccess: (data: any) => {
      const entryId = String(data.entryId);
      setTrades((current) => current.filter((trade) => getStoredEntryId(trade) !== entryId));
      setExpandedOpenedTradeIds((current) => {
        const next = new Set(current);
        next.delete(entryId);
        return next;
      });
      setDeleteCandidate(null);
      if (data.auditId && data.entry) {
        setRecoverableEntries((current) => [{
          auditId: String(data.auditId),
          operation: "delete",
          revertedAt: new Date().toISOString(),
          trade: previewTradeFromEntry(data.entry),
        }, ...current.filter((item) => item.auditId !== String(data.auditId))]);
      }
      t0Toast.success("开仓记录已删除，可在最近撤回中恢复");
    },
    onError: (error) => t0Toast.error(error.message || "开仓记录删除失败"),
  });

  const revertEntryMutation = trpc.ledger.t0RevertEntry.useMutation({
    onSuccess: (data: any) => {
      const entryId = String(data.entryId);
      setTrades((current) => current.filter((trade) => getStoredEntryId(trade) !== entryId));
		  // 先同步移除原始活动来源，令共享到账即刻退出本页总收益；随后以服务端权威回包完整重建。
		  setRawJournalTrades((current) => current.filter((trade) => getStoredEntryId(trade) !== entryId));
      setExpandedOpenedTradeIds((current) => {
        const next = new Set(current);
        next.delete(entryId);
        return next;
      });
      if (data.auditId && data.entry) {
        setRecoverableEntries((current) => [{
          auditId: String(data.auditId),
          operation: "revert",
          revertedAt: new Date().toISOString(),
          trade: previewTradeFromEntry(data.entry),
        }, ...current.filter((item) => item.auditId !== String(data.auditId))]);
      }
      setRevertCandidate(null);
		  void t0JournalQuery.refetch();
      t0Toast.success("速记已回撤，可在最近撤回中恢复");
    },
    onError: (error) => t0Toast.error(error.message || "速记回撤失败"),
  });

  const restoreEntryMutation = trpc.ledger.t0RestoreEntry.useMutation({
    onSuccess: (data: any, variables: any) => {
      const entry = previewTradeFromEntry(data.entry);
      const visibleEntry = canManage && entry.isCounterparty ? asAdminCounterpartyTrade(entry) : entry;
      setTrades((current) => [...current.filter((trade) => getStoredEntryId(trade) !== entry.id), visibleEntry]);
      setRecoverableEntries((current) => current.filter((item) => item.auditId !== String(variables.auditId)));
      setRestoreCandidate(null);
		  // 共享转账始终由服务端按“来源平仓仍有效”下发；恢复后不可在客户端臆造或重算金额。
		  void t0JournalQuery.refetch();
      t0Toast.success("速记已恢复");
    },
    onError: (error) => t0Toast.error(error.message || "速记恢复失败"),
  });

  const openProfitShareManager = (source: PreviewRelatedFund) => {
    const currentRules = profitShareRules.filter((rule) => rule.relatedFundId === Number(source.id));
    setRelatedUserPickerOpen(false);
    setRelatedUserQuickPickerOpen(false);
    setDirectoryManagerKind(null);
    setDirectoryRenameTarget(null);
    setDirectoryDeleteTarget(null);
    setEntryProfitShareEditTarget(null);
    setProfitShareSaveError(null);
    setProfitShareRecipientPickerOpen(false);
    setProfitShareSource(source);
    setProfitShareAllocations(currentRules.length > 0
      ? currentRules.map((rule) => ({
        user: { id: String(rule.beneficiaryUserId), name: rule.beneficiaryUserName },
        percentage: String(rule.percentage),
      }))
      : (() => {
        const owner = recentRelatedUsers.find((user) => user.id === source.relatedUserId);
        return owner ? [{ user: owner, percentage: "100" }] : [];
      })());
    setProfitShareRecipientSearch("");
  };

  const openEntryProfitShareManager = () => {
    const opening = editingOriginalTrade;
    if (!opening || opening.isPending || !opening.relatedFundId || !opening.relatedUserId) {
      t0Toast.error("仅已成交且已关联项目的持仓单可以编辑收益分配");
      return;
    }
    const source = relatedFunds.find((fund) => fund.id === opening.relatedFundId) ?? {
      id: opening.relatedFundId,
      name: opening.relatedFundName || "当前项目",
      relatedUserId: opening.relatedUserId,
    };
    const openingAllocations = getOpeningProfitShareSnapshotAllocations(profitShareSnapshots, getStoredEntryId(opening));
    const draft = openingAllocations.map((allocation) => ({
      user: { id: String(allocation.beneficiaryUserId), name: allocation.beneficiaryUserName },
      percentage: String(allocation.percentage),
    }));
    if (draft.length === 0) {
      t0Toast.error("该持仓单尚未固化收益分配，无法直接编辑");
      return;
    }
    setRelatedUserPickerOpen(false);
    setRelatedUserQuickPickerOpen(false);
    setDirectoryManagerKind(null);
    setDirectoryRenameTarget(null);
    setDirectoryDeleteTarget(null);
    setEntryProfitShareEditTarget(opening);
    setProfitShareSaveError(null);
    setProfitShareRecipientPickerOpen(false);
    setProfitShareSource(source);
    setProfitShareAllocations(draft);
    setProfitShareRecipientSearch("");
  };

  const closeProfitShareManager = () => {
    if (setProfitShareRuleMutation.isPending || updateOpeningProfitShareMutation.isPending) return;
    setProfitShareSaveError(null);
    setProfitShareSource(null);
    setEntryProfitShareEditTarget(null);
    setProfitShareAllocations([]);
    setProfitShareRecipientPickerOpen(false);
    setProfitShareRecipientSearch("");
  };

  const submitProfitShareRule = () => {
    const showProfitShareSaveError = (message: string) => {
      setProfitShareSaveError(message);
      t0Toast.error(message);
    };
    setProfitShareSaveError(null);
    if (!profitShareSource || profitShareAllocations.length === 0) {
      showProfitShareSaveError("请设置完整的收益分配清单");
      return;
    }
    const allocations = profitShareAllocations.map((allocation) => ({
      beneficiaryUserId: Number(allocation.user.id),
      percentage: Number(allocation.percentage),
    }));
    if (allocations.some((allocation) => !Number.isInteger(allocation.beneficiaryUserId) || !Number.isInteger(allocation.percentage) || allocation.percentage <= 0 || allocation.percentage > 100)) {
      showProfitShareSaveError("每位分配人的比例必须为1–100的整数");
      return;
    }
    const totalPercentage = allocations.reduce((total, allocation) => total + allocation.percentage, 0);
    if (Math.abs(totalPercentage - 100) > 0.00001) {
      showProfitShareSaveError(`分配合计必须为100%，当前为${totalPercentage.toFixed(2)}%`);
      return;
    }
    if (entryProfitShareEditTarget) {
      const entryId = Number(getStoredEntryId(entryProfitShareEditTarget));
      if (!Number.isInteger(entryId) || entryId <= 0) {
        showProfitShareSaveError("未能识别当前持仓单，请关闭后重新打开编辑");
        return;
      }
      updateOpeningProfitShareMutation.mutate({ ledgerId: 52, entryId, allocations });
      return;
    }
    setProfitShareRuleMutation.mutate({
      ledgerId: 52,
      relatedFundId: profitShareSource.id ? Number(profitShareSource.id) : undefined,
      relatedUserId: profitShareSource.id ? undefined : Number(profitShareSource.relatedUserId),
      relatedFundName: profitShareSource.id ? undefined : profitShareSource.name,
      allocations,
    });
  };

  const openDirectoryManager = (kind: JournalDirectoryKind) => {
    if (kind === "relatedFund" && !entryForm.relatedUserId) {
      t0Toast.error("请先选择关联用户，再管理该用户的项目名称");
      return;
    }
    setRelatedUserPickerOpen(false);
    setRelatedUserQuickPickerOpen(false);
    setRelatedUserSearch("");
    setDirectoryRenameTarget(null);
    setDirectoryDeleteTarget(null);
    setDirectoryRenameDraft("");
    setDirectoryManagerKind(kind);
  };

  const openDirectoryRename = (target: JournalDirectoryRenameTarget) => {
    setDirectoryRenameTarget(target);
    setDirectoryRenameDraft(target.name);
  };

  const openDirectoryDelete = (target: JournalDirectoryTarget) => {
    setDirectoryRenameTarget(null);
    setDirectoryDeleteTarget(target);
  };

  const closeDirectoryManager = () => {
    setDirectoryRenameTarget(null);
    setDirectoryDeleteTarget(null);
    setDirectoryRenameDraft("");
    setDirectoryManagerKind(null);
  };

  const submitDirectoryRename = () => {
    if (!directoryRenameTarget) return;
    const name = directoryRenameDraft.trim();
    if (!name) {
      t0Toast.error("请输入新名称");
      return;
    }
    if (name === directoryRenameTarget.name) {
      setDirectoryRenameTarget(null);
      return;
    }
    if (directoryRenameTarget.kind === "account") {
      renameAccountMutation.mutate({ ledgerId: 52, accountId: Number(directoryRenameTarget.id), name });
      return;
    }
    if (directoryRenameTarget.kind === "relatedFund") {
      renameRelatedFundMutation.mutate({ ledgerId: 52, relatedFundId: Number(directoryRenameTarget.id), name });
    }
  };

  const isDirectoryRenamePending = renameAccountMutation.isPending
    || renameRelatedFundMutation.isPending;
  const isDirectoryDeletePending = deleteDirectoryItemMutation.isPending;

  const selectOrderAccount = (accountId: string) => {
    const account = accounts.find((item) => item.id === accountId);
    setEntryForm((current) => ({ ...current, accountId, accountName: account?.name ?? "" }));
    if (account) {
      const memoryKey = relatedUserAccountMemoryKey(entryForm.relatedUserId);
      setLastAccountIdByRelatedUser((current) => ({ ...current, [memoryKey]: account.id }));
    }
    if (!account) return;
    selectAccountMutation.mutate({ ledgerId: 52, accountId: Number(account.id) });
  };

  const selectRelatedUser = (user: PreviewRelatedUser) => {
    const rememberedAccount = getRememberedAccountForRelatedUser(user.id);
    const defaultFund = getRememberedFundForRelatedUser(user.id);
    setEntryForm((current) => ({
      ...current,
      // 已有记忆账户时优先带入；新用户没有记忆时保留管理员刚填写的新账户。
      accountId: rememberedAccount?.id ?? current.accountId,
      accountName: rememberedAccount?.name ?? current.accountName,
      relatedUserId: user.id,
      relatedUserName: user.name,
      relatedUsername: user.username ?? "",
      relatedFundId: defaultFund?.id ?? "",
      relatedFundName: defaultFund?.name ?? "",
    }));
    setLastRelatedUserId(user.id);
    setRecentRelatedUsers((current) => [{ ...user, lastUsedAt: new Date().toISOString() }, ...current.filter((item) => item.id !== user.id)]);
    setRelatedUserSearch("");
    setRelatedUserPickerOpen(false);
    setRelatedUserQuickPickerOpen(false);
  };

  const addProfitShareRecipient = (user: PreviewRelatedUser) => {
    if (profitShareAllocations.some((allocation) => allocation.user.id === user.id)) return;
    if (profitShareAllocations.length >= 20) {
      t0Toast.error("收益分配人最多添加20位");
      return;
    }
    setProfitShareSaveError(null);
    setProfitShareAllocations((current) => [...current, { user, percentage: "1" }]);
    setProfitShareRecipientSearch("");
    setProfitShareRecipientPickerOpen(false);
  };

  const selectRelatedFund = (fundId: string) => {
    if (fundId === "legacy") {
      setEntryForm((current) => ({ ...current, relatedFundId: "legacy", relatedFundName: "" }));
      return;
    }
    const fund = entryRelatedFunds.find((item) => item.id === fundId);
    setEntryForm((current) => ({
      ...current,
      relatedFundId: fundId,
      relatedFundName: fund?.name ?? "",
    }));
    if (fund && entryForm.relatedUserId) {
      setLastFundIdByRelatedUser((current) => ({ ...current, [entryForm.relatedUserId]: fund.id }));
    }
  };

  const clearRelatedUser = () => {
    const rememberedAccount = getRememberedAccountForRelatedUser();
    setEntryForm((current) => ({
      ...current,
      // 取消关联同样不能意外清空尚未保存的新账户。
      accountId: rememberedAccount?.id ?? current.accountId,
      accountName: rememberedAccount?.name ?? current.accountName,
      relatedUserId: "",
      relatedUserName: "",
      relatedUsername: "",
      relatedFundId: "",
      relatedFundName: "",
    }));
    setRelatedUserSearch("");
    setRelatedUserPickerOpen(false);
    setRelatedUserQuickPickerOpen(false);
  };

  const handleSaveEntry = (manualConfirmPendingFill = false, bypassOpeningEditSafetyReview = false) => {
    if (isCloseDistributionPreviewLink) {
      setCloseSaveError("这是直达模拟预览，不会写入平仓、共享或任何账本记录");
      return;
    }
    const normalizedQuantity = normalizeEthQuantity(entryForm.quantity);
    const quantity = Number(normalizedQuantity);
    const selectedAction = ACTIONS[entryForm.action];
    const showSaveValidationError = (message: string) => {
      if (selectedAction.opening) setOpeningSaveError(message);
      else setCloseSaveError(message);
      t0Toast.error(message);
    };
    if (selectedAction.opening) setOpeningSaveError(null);
    else setCloseSaveError(null);
    // 蓝色待补开位的“取消持续提醒”是一个独立的、非财务修改：
    // 点击开关仅形成草稿；只有点击底部“保存取消提醒”才真正暂停占位。
    // 这条分支必须先于数量、价格等开仓校验，避免管理员只想取消提醒时被录单字段拦住。
    if (isReminderCancellationPending) {
      const reminderId = Number(entryForm.reminderTemplateId);
      if (!Number.isInteger(reminderId) || reminderId <= 0) {
        showSaveValidationError("持续提醒标识无效，请关闭后重新打开该蓝色待补开位");
        return;
      }
      pauseReopenReminderMutation.mutate({ ledgerId: 52, reminderId });
      return;
    }
    const isCounterpartyClosing = !selectedAction.opening && Boolean(closingSourceTrade?.isCounterpartyView);
    // 管理员反向投影下的“平空/平多”仅是展示方向；写库仍沿用用户端原始方向，确保 FIFO 永远以真实流水核算。
    const storedAction = isCounterpartyClosing ? invertTradeAction(entryForm.action) : entryForm.action;
    const isOptionOpening = selectedAction.opening && entryForm.instrumentType === "option";
    const isGridOpening = selectedAction.opening && entryForm.instrumentType === "grid";
    if (smartOpeningPriceIsIncomplete) {
      showSaveValidationError(`请在实时价前缀 ${smartOpeningPricePrefix} 后补齐成交价后两位`);
      return;
    }
    const effectivePriceInput = isGridOpening && gridReferencePrice !== null
      ? String(gridReferencePrice)
      : entryForm.price.trim();
    const price = Number(effectivePriceInput);
    const fee = estimatedFeeUsdt ?? 0;
    const normalizedAccountName = entryForm.accountName.trim();
    const hasPersistedAccountId = /^\d+$/.test(entryForm.accountId);
    const relatedUserId = Number(entryForm.relatedUserId);
    const normalizedRelatedUserId = Number.isInteger(relatedUserId) && relatedUserId > 0
      ? relatedUserId
      : undefined;
    const relatedFundId = Number(entryForm.relatedFundId);
    const normalizedRelatedFundId = Number.isInteger(relatedFundId) && relatedFundId > 0
      ? relatedFundId
      : undefined;
    const normalizedRelatedFundName = entryForm.relatedFundName.trim();

    if (quantityFormatError) {
      showSaveValidationError(quantityFormatError);
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      showSaveValidationError("请输入大于 0 的 ETH 数量");
      return;
    }
    if (selectedAction.opening && !entryForm.instrumentType) {
      showSaveValidationError("请选择现货、合约、期权或网格");
      return;
    }
    if (isOptionOpening) {
      if (optionFormValidationMessage) {
        showSaveValidationError(optionFormValidationMessage);
        return;
      }
    }
    if (isGridOpening && gridFormValidationMessage) {
      showSaveValidationError(gridFormValidationMessage);
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      showSaveValidationError(isOptionOpening ? "请输入行权价" : isGridOpening ? "请先填写网格区间" : "请输入成交价格");
      return;
    }
    const takeProfitPlans = entryForm.isTakeProfit ? normalizeTakeProfitPlanDrafts(entryForm.takeProfitPlans) : [];
    const isTakeProfitEligible = selectedAction.opening
      && (entryForm.instrumentType === "spot" || entryForm.instrumentType === "contract");
    if (entryForm.isTakeProfit) {
      if (!isTakeProfitEligible) {
        showSaveValidationError("止盈仅支持现货和合约开仓");
        return;
      }
      if (takeProfitPlans.length === 0) {
        showSaveValidationError("请至少添加一段止盈计划");
        return;
      }
      let takeProfitTotalQuantity = 0;
      for (let index = 0; index < takeProfitPlans.length; index += 1) {
        const plan = takeProfitPlans[index];
        const takeProfitPrice = Number(plan.price);
        const takeProfitQuantity = Number(plan.quantity);
        if (!Number.isFinite(takeProfitPrice) || takeProfitPrice <= 0) {
          showSaveValidationError(`第 ${index + 1} 段止盈价格无效`);
          return;
        }
        if (!Number.isFinite(takeProfitQuantity) || takeProfitQuantity <= 0) {
          showSaveValidationError(`第 ${index + 1} 段止盈数量无效`);
          return;
        }
        if (selectedAction.side === "long" && takeProfitPrice <= price) {
          showSaveValidationError(`第 ${index + 1} 段多单止盈价须高于开仓价`);
          return;
        }
        if (selectedAction.side === "short" && takeProfitPrice >= price) {
          showSaveValidationError(`第 ${index + 1} 段空单止盈价须低于开仓价`);
          return;
        }
        takeProfitTotalQuantity += takeProfitQuantity;
      }
      if (takeProfitTotalQuantity > quantity + 0.0000001) {
        showSaveValidationError("全部止盈数量合计不得超过本笔可用数量");
        return;
      }
    }
    const archiveTargetPrice = selectedAction.opening
      ? archivePriceForSide(selectedAction.side, price)
      : entryForm.targetPrice === undefined
        ? undefined
        : archivePriceForSide(selectedAction.side, entryForm.targetPrice);
    const targetOpeningEntryId = !selectedAction.opening && /^\d+$/.test(entryForm.targetOpeningEntryId ?? "")
      ? Number(entryForm.targetOpeningEntryId)
      : undefined;
    if (!selectedAction.opening && entryForm.targetOpeningEntryId && !targetOpeningEntryId) {
      showSaveValidationError("所选开仓订单无效，请返回报价卡后重新平仓");
      return;
    }
    if (!hasPersistedAccountId && !normalizedAccountName) {
      showSaveValidationError("请在最后选择或新建下单账户");
      return;
    }
    if (entryForm.relatedUserId && !normalizedRelatedUserId) {
      showSaveValidationError("关联用户信息无效，请重新选择或暂不关联");
      return;
    }
    if (entryForm.relatedFundId && entryForm.relatedFundId !== "legacy" && !normalizedRelatedFundId) {
      showSaveValidationError("专项款信息无效，请重新选择或新建");
      return;
    }
    if (!normalizedRelatedUserId && (normalizedRelatedFundId || normalizedRelatedFundName)) {
      showSaveValidationError("请先选择关联用户，再选择专项款");
      return;
    }
    if (selectedAction.opening && !entryForm.editingEntryId && normalizedRelatedUserId && !normalizedRelatedFundId && !normalizedRelatedFundName) {
      showSaveValidationError("关联用户开仓时，请选择或新建专项款");
      return;
    }
    if (selectedAction.opening && !entryForm.editingEntryId && normalizedRelatedUserId
      && ((normalizedRelatedFundId && !profitShareRules.some((rule) => rule.relatedFundId === normalizedRelatedFundId))
        || (!normalizedRelatedFundId && Boolean(normalizedRelatedFundName)))) {
      showSaveValidationError("请先点击项目右侧的“收益分配”，完成合计100%的用户分配设置");
      return;
    }

    if (entryForm.editingEntryId) {
      const entryId = Number(entryForm.editingEntryId);
      if (!selectedAction.opening || !Number.isInteger(entryId) || entryId <= 0) {
        t0Toast.error("仅可编辑有效的开仓记录");
        return;
      }
      const editingInstrumentType = entryForm.instrumentType;
      if (!editingInstrumentType) {
        t0Toast.error("请选择现货、合约、期权或网格");
        return;
      }
      // 仅普通现货/合约的可编辑开仓价格可与实时ETH标记价比较；
      // 期权行权价和网格参考价具有不同业务含义，不能误触此提示。
      const shouldReviewEditedOpening = !hasDependentCloseOpeningEdit
        && (editingInstrumentType === "spot" || editingInstrumentType === "contract");
      if (shouldReviewEditedOpening && !bypassOpeningEditSafetyReview) {
        const safetySignal = getOpeningEditSaveSafetySignal({
          quantity,
          price,
          markPrice,
          originalQuantity: editingOriginalTrade?.quantity,
          originalPrice: editingOriginalTrade?.price,
        });
        if (safetySignal) {
          setOpeningEditSaveSafetyReview({
            ...safetySignal,
            manualConfirmPendingFill,
          });
          return;
        }
      }
      const partialAttributionChange = Boolean(
        isPartiallyClosedOpeningEdit
        && editingOriginalTrade
        && (
          (hasPersistedAccountId ? Number(entryForm.accountId) : 0) !== Number(editingOriginalTrade.accountId)
          || (!hasPersistedAccountId && normalizedAccountName !== (editingOriginalTrade.accountName ?? getTradeAccountName(editingOriginalTrade)).trim())
          || Number(normalizedRelatedUserId || 0) !== Number(editingOriginalTrade.relatedUserId || 0)
          || Number(normalizedRelatedFundId || 0) !== Number(editingOriginalTrade.relatedFundId || 0)
          || (!normalizedRelatedFundId && Boolean(normalizedRelatedFundName) && normalizedRelatedFundName !== (editingOriginalTrade.relatedFundName ?? "").trim())
        ),
      );
      if (partialAttributionChange && editingOriginalTrade && editingRemainingQuantity !== null) {
        if (hasPartialOpeningMarkerChange || hasPartialTakeProfitChange) {
          showSaveValidationError("请先单独保存锁定或止盈设置，再调整账户、用户或项目归属");
          return;
        }
        if (normalizedRelatedUserId !== Number(editingOriginalTrade.relatedUserId || 0) && !normalizedRelatedFundId && !normalizedRelatedFundName) {
          showSaveValidationError("切换关联用户后，请为新用户选择或新建项目，再保存剩余仓位");
          return;
        }
        setPartialOpeningAttributionScope(null);
        setPartialOpeningAttributionError(null);
        setPartialOpeningAttributionDraft({
          entryId,
          remainingQuantity: normalizeEthQuantity(String(editingRemainingQuantity)),
          accountId: hasPersistedAccountId ? Number(entryForm.accountId) : undefined,
          accountName: hasPersistedAccountId ? undefined : normalizedAccountName,
          relatedUserId: normalizedRelatedUserId,
          relatedFundId: Number(normalizedRelatedFundId || 0) || undefined,
          relatedFundName: normalizedRelatedFundName || undefined,
        });
        return;
      }
      const safeDependentEdit = getSafeDependentOpeningEdit({
        form: entryForm,
        original: editingOriginalTrade,
        normalizedQuantity,
        effectivePrice: effectivePriceInput,
        editableQuantity: isPartiallyClosedOpeningEdit ? editingRemainingQuantity ?? undefined : undefined,
      });
      // 部分平仓表单已冻结所有业务字段，唯一可操作项就是锁定/解锁。
      // 直接按该界面状态发送 lockOnly，避免格式化后的历史字段（如项目/备注）影响受限更新判定。
      const partialLockOnlyUpdate = Boolean(
        isPartiallyClosedOpeningEdit
        && editingOriginalTrade
        && entryForm.isLocked !== Boolean(editingOriginalTrade.isLocked),
      );
      updateOpeningEntryMutation.mutate({
        ledgerId: 52,
        entryId,
        accountId: hasPersistedAccountId ? Number(entryForm.accountId) : undefined,
        accountName: hasPersistedAccountId ? undefined : normalizedAccountName,
        relatedUserId: normalizedRelatedUserId,
        relatedFundId: normalizedRelatedFundId,
        relatedFundName: normalizedRelatedFundName || undefined,
        instrumentType: editingInstrumentType,
        isLocked: entryForm.isLocked,
        isCounterparty: entryForm.isCounterparty,
        counterpartyOnly: !partialLockOnlyUpdate && safeDependentEdit === "counterparty",
        lockOnly: partialLockOnlyUpdate || safeDependentEdit === "lock",
        // 编辑挂单时，先取消时钟“挂单”选中状态，再点击“保存修改”才确认成交。
        isPending: manualConfirmPendingFill ? false : entryForm.isPending,
        manualConfirmPendingFill: manualConfirmPendingFill || undefined,
        keepReopenReminder: Boolean(entryForm.keepReopenReminder),
        takeProfitEnabled: isTakeProfitEligible ? entryForm.isTakeProfit : false,
        takeProfitPrice: isTakeProfitEligible && entryForm.isTakeProfit ? takeProfitPlans[0]?.price : undefined,
        takeProfitQuantity: isTakeProfitEligible && entryForm.isTakeProfit ? takeProfitPlans[0]?.quantity : undefined,
        takeProfitPlans: isTakeProfitEligible && entryForm.isTakeProfit ? takeProfitPlans : undefined,
        takeProfitOnly: isPartiallyClosedOpeningEdit && hasPartialTakeProfitChange,
        optionDirection: isOptionOpening ? entryForm.optionDirection : undefined,
        optionExpiryDate: isOptionOpening ? entryForm.optionExpiryDate : undefined,
        optionPremium: isOptionOpening ? entryForm.optionPremium.trim() : undefined,
        optionPremiumCurrency: isOptionOpening ? entryForm.optionPremiumCurrency : undefined,
        gridDirection: isGridOpening ? entryForm.gridDirection : undefined,
        gridRangeMin: isGridOpening ? entryForm.gridRangeMin.trim() : undefined,
        gridRangeMax: isGridOpening ? entryForm.gridRangeMax.trim() : undefined,
        gridLeverage: isGridOpening ? entryForm.gridLeverage.trim() : undefined,
        gridCount: isGridOpening ? Number(entryForm.gridCount) : undefined,
        quantity: normalizedQuantity,
        price: effectivePriceInput,
        note: entryForm.note.trim() || undefined,
      });
      return;
    }

    if (!selectedAction.opening) {
      if (archiveTargetPrice === undefined) {
        t0Toast.error("请先在价格簿中点选要平的价格档位");
        return;
      }
      const side = selectedAction.side;
      const closeScopeTrades = trades.filter((trade) => !trade.isPending && (
        trade.accountId === entryForm.accountId
        && trade.symbol === "ETH"
        && (trade.relatedUserId ?? "") === (entryForm.relatedUserId ?? "")
        && (trade.relatedFundId ?? "") === (normalizedRelatedFundId ? String(normalizedRelatedFundId) : "")
      ));
      const closeScopeBuckets = buildPositionBuckets(closeScopeTrades);
      const target = closeScopeBuckets.find((bucket) => bucket.side === side && priceKey(bucket.price) === priceKey(archiveTargetPrice));
      if (!target || target.remainingQuantity <= 0) {
        showSaveValidationError("该价格档位已无可平数量");
        return;
      }
      if (quantity - target.remainingQuantity > 0.0000001) {
        showSaveValidationError(`该价格档位最多可平 ${formatQuantity(target.remainingQuantity)} ETH`);
        return;
      }
      if (targetOpeningEntryId) {
        const targetOpening = closeScopeTrades.find((trade) => (
          ACTIONS[trade.action].opening
          && getStoredEntryId(trade) === String(targetOpeningEntryId)
          && ACTIONS[trade.action].side === side
          && priceKey(archivePriceForTrade(trade)) === priceKey(archiveTargetPrice)
        ));
        if (!targetOpening) {
          showSaveValidationError("所选开仓订单已变化，请刷新后重新平仓");
          return;
        }
        const sourceAllocations = buildOpeningClosingAllocations(closeScopeTrades).get(targetOpening.id) ?? [];
        const sourceClosedQuantity = sourceAllocations.reduce((total, allocation) => total + allocation.quantity, 0);
        const sourceRemainingQuantity = Math.max(0, targetOpening.quantity - sourceClosedQuantity);
        if (quantity - sourceRemainingQuantity > 0.0000001) {
          showSaveValidationError(`该笔订单最多可平 ${formatQuantity(sourceRemainingQuantity)} ETH`);
          return;
        }
      }
      if (closeConfirmationStep === "input") {
        closeCommitRequestIdRef.current = null;
        setCloseSaveError(null);
        setSharedIncomePreviewMarkPrice(markPrice);
        setCloseConfirmationStep("review");
        return;
      }
    }

    if (saveEntryCommitLockRef.current) return;
    saveEntryCommitLockRef.current = true;
    const createClientRequestId = () => (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `t0-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`);
    // 只有二次确认后的平仓会保留同一 ID 以支持不确定网络错误后的安全重试；开仓仍为每次新的明确操作生成 ID。
    const clientRequestId = !selectedAction.opening && closeConfirmationStep === "review"
      ? (closeCommitRequestIdRef.current ?? createClientRequestId())
      : createClientRequestId();
    if (!selectedAction.opening && closeConfirmationStep === "review") {
      closeCommitRequestIdRef.current = clientRequestId;
    }
    const accountId = entryForm.accountId || `pending-account-${clientRequestId}`;
    if (!entryForm.accountId) {
      setAccounts((current) => [{ id: accountId, name: normalizedAccountName }, ...current]);
    }
    setSelectedAccountIds((current) => current.length === 0 ? current : Array.from(new Set([...current, accountId])));
    const trade: PreviewTrade = {
      id: `pending-entry-${clientRequestId}`,
      accountId,
      accountName: normalizedAccountName || entryForm.accountName,
      relatedUserId: entryForm.relatedUserId || undefined,
      relatedUserName: entryForm.relatedUserName || undefined,
      relatedUsername: entryForm.relatedUsername || undefined,
      relatedFundId: normalizedRelatedFundId ? String(normalizedRelatedFundId) : undefined,
      relatedFundName: normalizedRelatedFundId || !normalizedRelatedFundName ? undefined : normalizedRelatedFundName,
      symbol: "ETH",
      action: entryForm.action,
      instrumentType: selectedAction.opening ? entryForm.instrumentType : undefined,
      optionDirection: isOptionOpening ? entryForm.optionDirection : undefined,
      optionExpiryDate: isOptionOpening ? entryForm.optionExpiryDate : undefined,
      optionPremium: isOptionOpening ? Number(entryForm.optionPremium) : undefined,
      optionPremiumCurrency: isOptionOpening ? entryForm.optionPremiumCurrency : undefined,
      gridDirection: isGridOpening ? entryForm.gridDirection : undefined,
      gridRangeMin: isGridOpening ? Number(entryForm.gridRangeMin) : undefined,
      gridRangeMax: isGridOpening ? Number(entryForm.gridRangeMax) : undefined,
      gridLeverage: isGridOpening ? Number(entryForm.gridLeverage) : undefined,
      gridCount: isGridOpening ? Number(entryForm.gridCount) : undefined,
      isLocked: selectedAction.opening ? entryForm.isLocked : false,
      isCounterparty: selectedAction.opening ? entryForm.isCounterparty : false,
      isPending: selectedAction.opening ? entryForm.isPending : false,
      keepReopenReminder: selectedAction.opening ? Boolean(entryForm.keepReopenReminder) : false,
      reminderTemplateId: selectedAction.opening && entryForm.reminderTemplateId ? Number(entryForm.reminderTemplateId) : undefined,
      takeProfitEnabled: selectedAction.opening && isTakeProfitAvailable ? entryForm.isTakeProfit : false,
      takeProfitPrice: selectedAction.opening && isTakeProfitAvailable && entryForm.isTakeProfit ? Number(takeProfitPlans[0]?.price) : undefined,
      takeProfitQuantity: selectedAction.opening && isTakeProfitAvailable && entryForm.isTakeProfit ? Number(takeProfitPlans[0]?.quantity) : undefined,
      takeProfitPlans: selectedAction.opening && isTakeProfitAvailable && entryForm.isTakeProfit ? takeProfitPlans.map((plan) => ({
        triggerPrice: Number(plan.price),
        quantity: Number(plan.quantity),
        status: "pending" as const,
        sharedIncomeAllocations: (plan.sharedIncomeAllocations ?? []).map((allocation) => ({
          recipientUserId: allocation.recipientUserId,
          amount: Number(allocation.amount),
        })).filter((allocation) => Number.isFinite(allocation.amount) && allocation.amount > 0),
      })) : undefined,
      quantity,
      price,
      fee,
      createdAt: new Date().toISOString(),
      targetPrice: archiveTargetPrice,
      targetOpeningEntryId: selectedAction.opening ? undefined : entryForm.targetOpeningEntryId,
      note: entryForm.note.trim() || undefined,
      clientRequestId,
      isSyncing: true,
    };
    const visibleTrade = canManage && (Boolean(trade.isCounterparty) || isCounterpartyClosing)
      ? asAdminCounterpartyTrade(trade)
      : trade;
    const awaitsClosingCommit = !selectedAction.opening && closeConfirmationStep === "review";
    setTrades((current) => [...current, visibleTrade]);
    if (awaitsClosingCommit) {
      setCloseSaveError(null);
      t0Toast.message("正在确认平仓，等待账本写入");
    } else {
      // 开仓不再乐观收起：服务端提交完成前保留当前表单并禁用保存按钮。
      setOpeningSaveError(null);
      t0Toast.message("正在保存，等待账本写入");
    }
    saveEntryMutation.mutate({
      ledgerId: 52,
      accountId: hasPersistedAccountId ? Number(entryForm.accountId) : undefined,
      accountName: hasPersistedAccountId ? undefined : normalizedAccountName,
      relatedUserId: normalizedRelatedUserId,
      relatedFundId: normalizedRelatedFundId,
      relatedFundName: normalizedRelatedFundName || undefined,
      symbol: "ETH",
      action: storedAction,
      instrumentType: selectedAction.opening ? entryForm.instrumentType : undefined,
      isLocked: selectedAction.opening ? entryForm.isLocked : undefined,
      isCounterparty: selectedAction.opening ? entryForm.isCounterparty : undefined,
      isPending: selectedAction.opening ? entryForm.isPending : undefined,
      keepReopenReminder: selectedAction.opening ? Boolean(entryForm.keepReopenReminder) : undefined,
      reminderTemplateId: selectedAction.opening && entryForm.reminderTemplateId ? Number(entryForm.reminderTemplateId) : undefined,
      takeProfitEnabled: selectedAction.opening && isTakeProfitAvailable ? entryForm.isTakeProfit : undefined,
      takeProfitPrice: selectedAction.opening && isTakeProfitAvailable && entryForm.isTakeProfit ? takeProfitPlans[0]?.price : undefined,
      takeProfitQuantity: selectedAction.opening && isTakeProfitAvailable && entryForm.isTakeProfit ? takeProfitPlans[0]?.quantity : undefined,
      takeProfitPlans: selectedAction.opening && isTakeProfitAvailable && entryForm.isTakeProfit ? takeProfitPlans : undefined,
      optionDirection: isOptionOpening ? entryForm.optionDirection : undefined,
      optionExpiryDate: isOptionOpening ? entryForm.optionExpiryDate : undefined,
      optionPremium: isOptionOpening ? entryForm.optionPremium.trim() : undefined,
      optionPremiumCurrency: isOptionOpening ? entryForm.optionPremiumCurrency : undefined,
      gridDirection: isGridOpening ? entryForm.gridDirection : undefined,
      gridRangeMin: isGridOpening ? entryForm.gridRangeMin.trim() : undefined,
      gridRangeMax: isGridOpening ? entryForm.gridRangeMax.trim() : undefined,
      gridLeverage: isGridOpening ? entryForm.gridLeverage.trim() : undefined,
      gridCount: isGridOpening ? Number(entryForm.gridCount) : undefined,
      quantity: normalizedQuantity,
      price: effectivePriceInput,
      targetPrice: archiveTargetPrice === undefined ? undefined : String(archiveTargetPrice),
      targetOpeningEntryId,
      note: entryForm.note.trim() || undefined,
      sharedIncomeAllocations: !selectedAction.opening && sharedIncomeSaveAllocations.length > 0 ? sharedIncomeSaveAllocations : undefined,
      clientRequestId,
    });
  };

  const submitPartialOpeningAttribution = (scope: "history" | "future") => {
    const draft = partialOpeningAttributionDraft;
    if (!draft || residualReassignCommitLockRef.current) return;
    setPartialOpeningAttributionError(null);
    residualReassignCommitLockRef.current = true;
    const requestFingerprint = [
      scope,
      draft.entryId,
      draft.remainingQuantity,
      draft.accountId ?? draft.accountName ?? "",
      draft.relatedUserId ?? "",
      draft.relatedFundId ?? draft.relatedFundName ?? "",
    ].join("|");
    if (residualReassignRequestFingerprintRef.current !== requestFingerprint) {
      residualReassignRequestFingerprintRef.current = requestFingerprint;
      residualReassignRequestIdRef.current = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `t0a-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    }
    const clientRequestId = residualReassignRequestIdRef.current;
    if (!clientRequestId) {
      residualReassignCommitLockRef.current = false;
      t0Toast.error("归属更正请求创建失败，请重新选择");
      return;
    }
    if (scope === "history" && partialAttributionChangesRelatedUser) {
      residualReassignCommitLockRef.current = false;
      setPartialOpeningAttributionError("已平历史的用户名不能修改；更换用户名请仅转入之后的剩余仓位");
      return;
    }
    if (scope === "history") {
      updatePartialOpeningHistoricalAttributionMutation.mutate({
        ledgerId: 52,
        entryId: draft.entryId,
        expectedRemainingQuantity: draft.remainingQuantity,
        accountId: draft.accountId,
        accountName: draft.accountName,
        relatedFundId: draft.relatedFundId,
        relatedFundName: draft.relatedFundName,
        clientRequestId,
      });
      return;
    }
    reassignOpeningRemainingMutation.mutate({
      ledgerId: 52,
      entryId: draft.entryId,
      expectedRemainingQuantity: draft.remainingQuantity,
      accountId: draft.accountId,
      accountName: draft.accountName,
      relatedUserId: draft.relatedUserId,
      relatedFundId: draft.relatedFundId,
      relatedFundName: draft.relatedFundName,
      clientRequestId,
    });
  };

  const forceRefreshJournal = () => {
    // 立即落盘，保证用户刚选完筛选条件便点击“刷新”时也不会丢失。
    persistT0TopFilters(topFilterStorageKey, {
      accountIds: selectedAccountIds,
      relatedUserIds: relatedUserFilterIds,
      memberRelatedUserFilterTouched,
      memberSourceUserFilterV2: true,
      relatedFundIds: relatedFundFilterIds,
      instrumentTypeIds: instrumentTypeFilterIds,
      executionFilter,
      hideLocked,
    });
    window.location.reload();
  };

  const backToLedger = () => {
    if (!embedded) setLocation(`/ledger/${ledgerId}`);
  };
  const totalProfitPagePath = `/ledger/${ledgerId}/t0-journal/total-profit${isUserPreview && previewUserId ? `?previewUserId=${previewUserId}` : ""}`;
  const memberT0JournalPath = `/ledger/${ledgerId}/t0-journal${isUserPreview && previewUserId ? `?previewUserId=${previewUserId}` : ""}`;
  const openTotalProfitReport = () => {
    setTotalRevenueDetailPage(1);
    setTotalProfitDetailTab("order");
    setTotalProfitPageTab("income");
    setMemberSettlementSelectedWeekStart(null);
    setTeamSettlementSelectedWeekStart(null);
    setShowPayoutXirrHelp(false);
    if (isMemberView || canManage) {
      setLocation(totalProfitPagePath);
      return;
    }
    setShowTotalNetProfitDetail(true);
  };
  const closeTotalProfitReport = () => {
    setShowPayoutXirrHelp(false);
    setMemberSettlementSelectedWeekStart(null);
    setTeamSettlementSelectedWeekStart(null);
    if (isTotalProfitPage) {
      setTotalProfitPageTab("income");
      setLocation(memberT0JournalPath);
      return;
    }
    setShowTotalNetProfitDetail(false);
  };
  const backToLadder = () => {
    setCloseConfirmationStep("input");
    setOpeningEditSaveSafetyReview(null);
    setClosingSourceTrade(null);
    setEditingOriginalTrade(null);
    setShowEntrySheet(false);
    if (canManage) setAdminLadderDisplayMode(entrySheetLadderDisplayModeRef.current);
  };
  const backToOrderList = () => {
    if (!isClosingEntry) return;
    setCloseConfirmationStep("input");
    setClosingSourceTrade(null);
    setEditingOriginalTrade(null);
    setEntryForm((current) => ({
      ...current,
      action: entrySide === "long" ? "openLong" : "openShort",
      instrumentType: lastOpeningInstrumentType,
      isLocked: false,
      isCounterparty: false,
      isPending: false,
      quantity: "",
      price: "",
      note: "",
      editingEntryId: undefined,
    }));
  };

  const renderHistoryActionMenuButton = (trade: PreviewTrade, memberPresentation = false) => {
    if (!canManage || memberPresentation) return null;
    const isOpen = historyActionMenuTradeId === trade.id;
    return (
      <button
        type="button"
        data-card-export-hide="true"
        disabled={Boolean(trade.isSyncing)}
        onClick={() => setHistoryActionMenuTradeId((current) => current === trade.id ? null : trade.id)}
        aria-label="打开历史记录管理操作"
        aria-expanded={isOpen}
        className="ml-auto flex h-5 w-6 shrink-0 items-center justify-center rounded text-slate-500 transition active:scale-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <MoreHorizontal className="h-4 w-4" strokeWidth={2.25} />
      </button>
    );
  };

  const renderHistoryActionMenu = (trade: PreviewTrade, memberPresentation = false) => {
    if (!canManage || memberPresentation || historyActionMenuTradeId !== trade.id) return null;
    const isOpening = ACTIONS[trade.action].opening;
    return (
      <div data-card-export-hide="true" className="mt-1 flex justify-end gap-1.5" aria-label="历史记录管理操作">
        {isOpening && <button
          type="button"
          disabled={Boolean(trade.isSyncing)}
          onClick={() => {
            setHistoryActionMenuTradeId(null);
            openEditOpeningTrade(trade);
          }}
          className="h-6 rounded border border-slate-200 bg-white px-2 text-[10px] font-semibold text-slate-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          编辑
        </button>}
        <button
          type="button"
          disabled={Boolean(trade.isSyncing) || revertEntryMutation.isPending}
          onClick={() => {
            setHistoryActionMenuTradeId(null);
            setRevertCandidate(trade);
          }}
          className="h-6 rounded border border-amber-200 bg-amber-50 px-2 text-[10px] font-semibold text-amber-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          回撤
        </button>
        {isOpening && <button
          type="button"
          disabled={Boolean(trade.isSyncing) || deleteOpeningEntryMutation.isPending}
          onClick={() => {
            setHistoryActionMenuTradeId(null);
            setDeleteCandidate(trade);
          }}
          className="h-6 rounded border border-rose-200 bg-rose-50 px-2 text-[10px] font-semibold text-rose-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          删除
        </button>}
      </div>
    );
  };

  const renderLinkedJournalGroup = (group: LinkedJournalGroup) => {
    if (!group.opening) {
      const allocation = group.closings[0];
      if (!allocation) return null;
        const closing = allocation.trade;
        const detail = getHistoricalTradeDetail(closing);
        const isLong = ACTIONS[closing.action].side === "long";
        const showFullClosingContext = hasSystemGeneratedSettlementNote(closing.note);
        const viewerPayout = resolveHistoryViewerPayout(closing, detail);
        const hideRepeatedSettlementPrices = historyIsMemberPresentation && Boolean(viewerPayout);
        const isSharedIncomePerspective = Number(closing.sharedIncomeAmount || 0) > 0;
        const displayedSharedIncome = viewerPayout?.netPnl ?? Number(closing.sharedIncomeAmount || 0);
        if (isSharedIncomePerspective) {
          const sharedDetail = detail ?? { netPnl: displayedSharedIncome };
          return (
            <div key={group.id} className="mx-3 my-2 rounded border border-l-[3px] bg-blue-50/35 px-3 py-2.5" style={{ borderColor: "#bfdbfe", borderLeftColor: "#2563eb", borderLeftWidth: "3px" }}>
              <div className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap text-xs tabular-nums">
                <div className="flex min-w-0 items-baseline gap-x-1.5 overflow-hidden">
                  <span className="shrink-0 font-semibold" style={{ color: "#2563eb" }}>共享</span>
                  <span className="shrink-0 text-[10px] font-medium text-slate-400">来源平仓</span>
                  <span className={`shrink-0 font-semibold ${isLong ? "text-rose-600" : "text-emerald-600"}`}>{ACTIONS[closing.action].label}</span>
                  <span className="shrink-0 font-medium text-slate-800">{formatQuantity(closing.quantity)}E</span>
                  <span className="shrink-0 text-slate-600">{formatPrice(closing.price)}</span>
                </div>
                <span aria-hidden="true" className="min-w-2 flex-1 translate-y-[-1px] border-t border-dotted border-slate-400/80" />
                <button
                  type="button"
                  onClick={() => setNetProfitDetail({
                    trade: closing,
                    detail: sharedDetail,
                    presentation: "member",
                    viewerUserId: isHistoryUserPerspective ? historyPerspectiveTargetUserId : viewerProfitShareBeneficiaryUserId,
                  })}
                  className={`shrink-0 border-b border-dotted pb-0.5 font-semibold outline-none ${displayedSharedIncome >= 0 ? "border-rose-500 text-rose-600" : "border-emerald-500 text-emerald-600"}`}
                  aria-label="查看共享收益明细"
                >
                  {formatSigned(displayedSharedIncome)}<span className="ml-0.5 text-slate-500">u</span>
                </button>
              </div>
            </div>
          );
        }
        return (
          <div key={group.id} className="mx-3 my-2 rounded border border-dashed border-amber-200 bg-amber-50/35 px-3 py-2.5">
          <div className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap text-xs tabular-nums">
              <span className="shrink-0 text-[10px] font-medium text-amber-700">未匹配开仓</span>
              <span className={`shrink-0 font-semibold ${isLong ? "text-rose-600" : "text-emerald-600"}`}>{ACTIONS[closing.action].label}</span>
              <span className="shrink-0 font-medium text-slate-800">{formatQuantity(closing.quantity)}E</span>
              {!hideRepeatedSettlementPrices && detail?.buyPrice !== undefined && <span className="shrink-0 text-slate-600">买{detail.buyQuote ?? formatPrice(detail.buyPrice)}</span>}
              {!hideRepeatedSettlementPrices && detail?.sellPrice !== undefined && <span className="shrink-0 text-slate-600">卖{detail.sellQuote ?? formatPrice(detail.sellPrice)}</span>}
            {!hideRepeatedSettlementPrices && detail?.isOptionQuote && <span className="shrink-0 text-violet-700">行权{formatPrice(closing.price)}</span>}
            {!detail && <span className="shrink-0 text-slate-600">{isLong ? "卖" : "买"}{formatPrice(closing.price)}</span>}
          </div>
          <div className={getHistoryContextLayoutClass(showFullClosingContext)}>
            {!historyIsMemberPresentation && <>
              <span className={getHistoryContextValueClass(showFullClosingContext)} title={getTradeAccountName(closing)}>{getTradeAccountName(closing)}</span>
              <span className="text-slate-300">·</span>
            </>}
            <span className={getHistoryContextValueClass(showFullClosingContext)} title={getTradeRelatedUserName(closing)}>{getTradeRelatedUserName(closing)}</span>
            <span className="text-slate-300">·</span>
            <span className={getHistoryContextValueClass(showFullClosingContext)} title={getTradeRelatedFundName(closing)}>{getTradeRelatedFundName(closing)}</span>
            <span className="text-slate-300">·</span>
            <span className="shrink-0">{formatBeijingMonthDayTime(closing.createdAt)}</span>
            {renderHistoryActionMenuButton(closing, historyIsMemberPresentation)}
          </div>
          {renderHistoryActionMenu(closing, historyIsMemberPresentation)}
          {closing.note?.trim() && <div className="mt-1 truncate text-[11px] text-slate-500"><span>备注：</span>{closing.note.trim()}</div>}
        </div>
      );
    }

    const opening = group.opening;
    const isLong = ACTIONS[opening.action].side === "long";
    const showFullOpeningContext = hasSystemGeneratedSettlementNote(opening.note);
    const closedQuantity = group.closings.reduce((total, allocation) => total + allocation.quantity, 0);
    const remainingQuantity = Math.max(0, opening.quantity - closedQuantity);
    // 转入后原单的 quantity 仅保留已平部分，以保证 FIFO 不会回补；历史卡仍展示当时的初始数量。
    const historicalOpeningQuantity = opening.originalQuantityBeforeReassignment ?? opening.quantity;
    const reassignedQuantity = opening.reassignedQuantity ?? 0;
    const groupTone = isLong
      ? "border-rose-200 border-l-rose-500"
      : "border-emerald-200 border-l-emerald-500";
    const openingSurface = isLong ? "bg-rose-50/35" : "bg-emerald-50/35";

    return (
      <div key={group.id} className={`mx-3 my-2 overflow-hidden rounded border border-l-[3px] ${groupTone}`}>
        <div className={`px-3 py-2.5 ${openingSurface}`}>
          <div className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap text-xs tabular-nums">
            <div className="flex min-w-0 items-baseline gap-x-1.5 overflow-hidden">
              <span className={`shrink-0 font-semibold ${isLong ? "text-rose-600" : "text-emerald-600"}`}>{ACTIONS[opening.action].label}</span>
              <span className="shrink-0 font-medium text-slate-800">{formatQuantity(historicalOpeningQuantity)}E</span>
              {opening.isPending && <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-sky-700"><Clock3 className="h-3 w-3" />挂单</span>}
              {opening.isCounterpartyView && <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-violet-700"><Repeat2 className="h-3 w-3" strokeWidth={2.4} />反向</span>}
              <span className="shrink-0 text-slate-600">{isLong ? "买" : "卖"}{opening.instrumentType === "option" && opening.optionPremium !== undefined && opening.optionPremiumCurrency ? formatOptionQuote(opening.optionPremium, opening.optionPremiumCurrency) : formatPrice(opening.price)}</span>
              {opening.instrumentType === "option" && <span className="shrink-0 text-violet-700">行权{formatPrice(opening.price)}</span>}
            </div>
            <span className="ml-auto shrink-0 text-[10px] font-medium text-slate-500">
              {reassignedQuantity > 0
                ? `已平 ${formatQuantity(closedQuantity)} · 已转入 ${formatQuantity(reassignedQuantity)}`
                : closedQuantity > 0 ? `已平 ${formatQuantity(closedQuantity)} · 剩 ${formatQuantity(remainingQuantity)}` : "未平"}
            </span>
            </div>
          <div className={getHistoryContextLayoutClass(showFullOpeningContext)}>
            {!historyIsMemberPresentation && <>
              <span className={getHistoryContextValueClass(showFullOpeningContext)} title={getTradeAccountName(opening)}>{getTradeAccountName(opening)}</span>
              <span className="text-slate-300">·</span>
            </>}
            <span className={getHistoryContextValueClass(showFullOpeningContext)} title={getTradeRelatedUserName(opening)}>{getTradeRelatedUserName(opening)}</span>
            <span className="text-slate-300">·</span>
            <span className={getHistoryContextValueClass(showFullOpeningContext)} title={getTradeRelatedFundName(opening)}>{getTradeRelatedFundName(opening)}</span>
            <span className="text-slate-300">·</span>
            <span className="shrink-0">{formatT0TradeTimeline(opening)}</span>
            {renderHistoryActionMenuButton(opening, historyIsMemberPresentation)}
          </div>
          {renderHistoryActionMenu(opening, historyIsMemberPresentation)}
          {opening.note?.trim() && <div className="mt-1 truncate text-[11px] text-slate-500"><span>备注：</span>{opening.note.trim()}</div>}
        </div>
        {group.closings.map((allocation, index) => {
          const closing = allocation.trade;
          const detail = buildLinkedClosingDetail(opening, allocation);
          const allocatedClosing = { ...closing, quantity: allocation.quantity, fee: detail.closingFee ?? closing.fee };
          const isLastClosing = index === group.closings.length - 1;
          const viewerPayout = resolveHistoryViewerPayout(allocatedClosing, detail);
          const displayedNetPnl = viewerPayout?.netPnl ?? detail.netPnl;
          const hideRepeatedSettlementPrices = historyIsMemberPresentation && Boolean(viewerPayout);
          return (
            <div key={`${closing.id}-${index}`} className="relative border-t border-[#c7d0d7]/60 bg-white/28 px-3 py-2.5 pl-8">
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute left-3 top-0 border-l border-dashed border-slate-300 ${isLastClosing ? "h-1/2" : "bottom-0"}`}
              />
              <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 w-3 border-t border-dashed border-slate-300" />
              <div className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap text-xs tabular-nums">
                <div className="flex min-w-0 items-baseline gap-x-1.5 overflow-hidden">
                  <span className={`shrink-0 font-semibold ${isLong ? "text-rose-600" : "text-emerald-600"}`}>{ACTIONS[closing.action].label}</span>
                  <span className="shrink-0 font-medium text-slate-800">{formatQuantity(allocation.quantity)}E</span>
                  {!hideRepeatedSettlementPrices && detail.isOptionQuote ? <>
                    <span className="shrink-0 text-slate-600">买{detail.buyQuote ?? formatPrice(detail.buyPrice)}</span>
                    <span className="shrink-0 text-slate-600">卖{detail.sellQuote ?? formatPrice(detail.sellPrice)}</span>
                    <span className="shrink-0 text-violet-700">行权{formatPrice(closing.price)}</span>
                  </> : !hideRepeatedSettlementPrices && <span className="shrink-0 text-slate-600">{isLong ? "卖" : "买"}{formatPrice(closing.price)}</span>}
                </div>
                <span aria-hidden="true" className="min-w-2 flex-1 translate-y-[-1px] border-t border-dotted border-slate-400/80" />
                <button
                  type="button"
                  onClick={() => setNetProfitDetail({
                    trade: allocatedClosing,
                    detail,
                    presentation: historyIsMemberPresentation ? "member" : "admin",
                    viewerUserId: historyIsMemberPresentation ? (isHistoryUserPerspective ? historyPerspectiveTargetUserId : viewerProfitShareBeneficiaryUserId) : undefined,
                  })}
                  className={`shrink-0 border-b border-dotted pb-0.5 font-semibold outline-none ${displayedNetPnl! >= 0 ? "border-rose-500 text-rose-600" : "border-emerald-500 text-emerald-600"}`}
                  aria-label={viewerPayout ? (historyIsMemberPresentation ? "查看关联平仓本单可得明细" : "查看关联平仓本单分成与全体分佣明细") : "查看关联平仓净利润计算明细"}
                >
                  {formatSigned(displayedNetPnl!)}<span className="ml-0.5 text-slate-500">u</span>
                </button>
              </div>
              <div className="mt-1 flex min-w-0 items-center gap-x-1.5 whitespace-nowrap text-[11px] text-slate-500">
                <span className="text-[10px] text-slate-400">关联平仓</span>
                <span className="text-slate-300">·</span>
                <span className="text-slate-400">{formatBeijingMonthDayTime(closing.createdAt)}</span>
                {canManage && !historyIsMemberPresentation ? renderHistoryActionMenuButton(closing) : <span className="ml-auto shrink-0 text-[10px] text-slate-500">{viewerPayout ? "本单可得" : "净利润"}</span>}
              </div>
              {renderHistoryActionMenu(closing, historyIsMemberPresentation)}
              {closing.note?.trim() && <div className="mt-1 truncate text-[11px] text-slate-500"><span>备注：</span>{closing.note.trim()}</div>}
            </div>
          );
        })}
      </div>
    );
  };

  const renderOpenedTradeRow = (row: { kind: "active" | "history"; trade: PreviewTrade }) => {
  const trade = row.trade;
  const linkedClosings = openingClosingAllocations.get(trade.id) ?? [];
  const linkedClosedQuantity = linkedClosings.reduce((total, item) => total + item.quantity, 0);
  const remainingQuantity = Math.max(0, trade.quantity - linkedClosedQuantity);
  const historicalOpeningQuantity = trade.originalQuantityBeforeReassignment ?? trade.quantity;
  const historicalOpeningValue = historicalOpeningQuantity * trade.price;
  const financialRemainingQuantity = getTradeFinancialQuantity(trade, remainingQuantity);
  const floatingPnl = trade.isPending || trade.instrumentType === "option" ? null : calculateEstimatedUnrealizedNetPnl(
    ACTIONS[trade.action].side,
    markPrice,
    financialRemainingQuantity,
    trade.price * financialRemainingQuantity,
  );
  const openingValue = trade.quantity * trade.price;
  const closeAction: TradeAction = ACTIONS[trade.action].side === "long" ? "closeLong" : "closeShort";
  // 锁定不改变已成交/已平仓流水，只保护尚余可平数量；解锁后立即恢复平仓能力。
  const canQuickClose = remainingQuantity > 0.0000001 && !trade.isLocked;
  const showsQuickCloseAction = row.kind === "active";
  const takeProfitPlans = getTradeTakeProfitPlans(trade);
  const pendingTakeProfitQuantity = getPendingTakeProfitQuantity(trade);
  const takeProfitMarkerLabel = getTakeProfitMarkerLabel(trade.takeProfitEnabled, pendingTakeProfitQuantity, remainingQuantity);
  const openingProfitShareAllocations = getOpeningProfitShareSnapshotAllocations(profitShareSnapshots, getStoredEntryId(trade));
  const visibleProfitShareAllocations = isMemberView
    ? openingProfitShareAllocations.filter((allocation) => allocation.beneficiaryUserId === viewerProfitShareBeneficiaryUserId)
    : openingProfitShareAllocations;
  const isSelectedClosingSource = Boolean(
    isClosingEntry
    && closingSourceTrade
    && getStoredEntryId(trade) === getStoredEntryId(closingSourceTrade),
  );
  const isExpanded = expandedOpenedTradeIds.has(trade.id);
  return (
    <div key={trade.id} className={`rounded border px-3 py-2 ${isSelectedClosingSource ? "border-indigo-400 bg-indigo-50/80 ring-1 ring-indigo-200/70" : "border-slate-200 bg-slate-50/80"}`}>
      <div className={`grid min-w-0 items-center gap-x-0 ${isMemberView ? "grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" : "grid-cols-[repeat(3,minmax(0,1fr))_auto]"}`}>
        {!isMemberView && <div className="flex min-w-0 items-baseline gap-1">
          <span className="shrink-0 text-[10px] font-medium text-slate-400">账户</span>
          <span title={getTradeAccountName(trade)} className="min-w-0 truncate text-xs font-semibold text-slate-800">{getTradeAccountName(trade)}</span>
        </div>}
        <div className={`flex min-w-0 items-baseline gap-1 ${isMemberView ? "" : "justify-center"}`}>
          <span className="shrink-0 text-[10px] font-medium text-slate-400">用户</span>
          <span title={getTradeRelatedUserName(trade)} className="min-w-0 truncate text-xs font-semibold text-slate-800">{getTradeRelatedUserName(trade)}</span>
        </div>
        <div className="flex min-w-0 items-baseline justify-end gap-1 text-right">
          <span className="shrink-0 text-[10px] font-medium text-slate-400">项目</span>
          <span title={getTradeRelatedFundName(trade)} className="min-w-0 truncate text-xs font-semibold text-slate-800">{getTradeRelatedFundName(trade)}</span>
        </div>
        <button
          type="button"
          aria-label={isExpanded ? "收起本笔开仓详情" : "展开本笔开仓详情"}
          onClick={() => setExpandedOpenedTradeIds((current) => {
            const next = new Set(current);
            if (next.has(trade.id)) next.delete(trade.id);
            else next.add(trade.id);
            return next;
          })}
          className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center text-slate-400 active:scale-95"
        >
          <ChevronRight className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
        </button>
      </div>
      <div className={`mt-1.5 w-full border-y border-slate-200/85 py-1.5 ${canManage && showsQuickCloseAction ? "grid grid-cols-[minmax(0,1fr)_3.25rem] items-stretch gap-x-2" : ""}`}>
        <button
          type="button"
          aria-expanded={isExpanded}
          onClick={() => setExpandedOpenedTradeIds((current) => {
            const next = new Set(current);
            if (next.has(trade.id)) next.delete(trade.id);
            else next.add(trade.id);
            return next;
          })}
          className="min-w-0 text-left"
        >
          <span className="block min-w-0 text-[11px] leading-4 tabular-nums">
            <span className="grid grid-cols-3 gap-x-0">
              <span className="flex min-w-0 items-baseline justify-start gap-1 whitespace-nowrap">
                <span className={`font-semibold ${ACTIONS[trade.action].side === "long" ? "text-rose-600" : "text-emerald-600"}`}>{ACTIONS[trade.action].side === "long" ? "多单" : "空单"}</span>
                <span className="text-sm font-semibold text-slate-900">{formatQuantity(historicalOpeningQuantity)} E</span>
              </span>
              <span className="flex min-w-0 items-baseline justify-center gap-1 whitespace-nowrap">
                <span className="font-semibold text-sky-600">已平</span>
                <span className="text-sm font-semibold text-slate-700">{formatQuantity(linkedClosedQuantity)} E</span>
              </span>
              <span className="flex min-w-0 items-baseline justify-end gap-1 whitespace-nowrap">
                <span className="font-semibold text-slate-600">剩余</span>
                <span className="text-sm font-semibold text-slate-800">{formatQuantity(remainingQuantity)} E</span>
                {trade.isLocked && <span title="已锁定" aria-label="已锁定" className="inline-flex shrink-0 text-amber-700"><Lock className="h-3.5 w-3.5" /></span>}
                {takeProfitMarkerLabel && <span title={takeProfitMarkerLabel} aria-label={takeProfitMarkerLabel} className="inline-flex shrink-0 text-amber-700"><Target className="h-3.5 w-3.5" strokeWidth={2.4} /></span>}
              </span>
            </span>
            <span className="mt-1 grid grid-cols-2 items-baseline gap-x-3 border-t border-slate-200/80 pt-1">
              <span className="min-w-0 whitespace-nowrap text-slate-600">开仓价 <span className="font-semibold text-slate-800">{formatPrice(trade.price)}</span></span>
              {trade.isPending ? <span className="inline-flex justify-end whitespace-nowrap items-center gap-1 text-sky-700"><span className="text-slate-500">当前状态</span><Clock3 className="h-3 w-3" />待成交</span>
                : trade.instrumentType === "option" ? <span className="flex min-w-0 items-baseline justify-end gap-1 whitespace-nowrap"><span className="shrink-0 text-slate-500">实时盈亏</span><OptionUnrealizedPnlText trade={trade} remainingQuantity={remainingQuantity} ethMarkPrice={markPrice} className="shrink-0 font-semibold tabular-nums" /></span>
                : <span className={`justify-self-end whitespace-nowrap font-semibold ${floatingPnl === null ? "text-slate-400" : floatingPnl >= 0 ? "text-rose-600" : "text-emerald-600"}`}><span className="mr-1 font-normal text-slate-500">实时盈亏</span>{floatingPnl === null ? "--" : `${formatSigned(floatingPnl)} U`}</span>}
            </span>
          </span>
        </button>
        {canManage && showsQuickCloseAction && <button
          type="button"
          disabled={!canQuickClose || Boolean(trade.isSyncing) || isCloseReview || trade.isPending || trade.instrumentType === "option"}
          onClick={() => isSelectedClosingSource ? backToOrderList() : openQuickCloseSheet(trade)}
          title={isSelectedClosingSource ? `取消本笔${ACTIONS[closeAction].label}选择，恢复新开仓编辑` : trade.isPending ? "挂单成交后才能平仓" : trade.instrumentType === "option" ? "期权订单请在编辑页处理" : trade.isLocked ? "本笔剩余仓位已锁定，请先点击“编辑”解除锁定后再平仓" : undefined}
          className={`min-h-[52px] rounded border px-1 text-xs font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${closeAction === "closeLong" ? "border-rose-300 bg-rose-50 text-rose-700" : "border-emerald-300 bg-emerald-50 text-emerald-700"}`}
        >
          {isSelectedClosingSource ? `取消${ACTIONS[closeAction].label}` : ACTIONS[closeAction].label}
        </button>}
      </div>
      {isExpanded && (
        <>
          {canManage && <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={isCloseReview || Boolean(trade.isSyncing)}
              onClick={() => setDeleteCandidate(trade)}
              className="h-9 rounded border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              删除
            </button>
            <button
              type="button"
              disabled={isCloseReview || Boolean(trade.isSyncing)}
              onClick={() => openEditOpeningTrade(trade)}
              className="h-9 rounded border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              编辑
            </button>
          </div>}
          <div className="mt-2 grid grid-cols-3 gap-x-2 border-t border-slate-200 pt-2 tabular-nums">
            <div className="min-w-0">
              <div className="text-[10px] text-slate-400">{trade.isPending ? "挂单状态" : trade.instrumentType === "option" ? "行权价" : "开仓价值"}</div>
              <div className={`mt-0.5 whitespace-nowrap text-[11px] font-medium ${trade.isPending ? "text-sky-700" : "text-slate-700"}`}>{trade.isPending ? "等待触发" : trade.instrumentType === "option" ? `${formatPrice(trade.price)} U` : `${formatPrice(trade.originalQuantityBeforeReassignment !== undefined ? historicalOpeningValue : openingValue)} U`}</div>
            </div>
            <div className="min-w-0 text-center">
              <div className="text-[10px] text-slate-400">{trade.isPending ? "盈亏" : trade.instrumentType === "option" ? "实时盈亏" : "当前盈亏"}</div>
              {trade.instrumentType === "option" && !trade.isPending ? (
                <OptionUnrealizedPnlText trade={trade} remainingQuantity={remainingQuantity} ethMarkPrice={markPrice} emptyLabel="期权报价加载中" className="mt-0.5 whitespace-nowrap text-[11px] font-semibold tabular-nums" />
              ) : (
                <div className={`mt-0.5 whitespace-nowrap text-[11px] font-semibold ${floatingPnl === null ? "text-slate-400" : floatingPnl >= 0 ? "text-rose-600" : "text-emerald-600"}`}>
                  {floatingPnl === null ? "--" : `${formatSigned(floatingPnl)} U`}
                </div>
              )}
            </div>
            <div className="min-w-0 text-right">
              <div className="text-[10px] text-slate-400">{trade.filledAt ? "挂单时间" : "开仓时间"}</div>
              <div className="mt-0.5 whitespace-nowrap text-[11px] font-medium text-slate-700">{trade.isSyncing ? "后台保存中" : formatBeijingMonthDayTime(trade.createdAt)}</div>
            </div>
            {visibleProfitShareAllocations.length > 0 && <div className="col-span-3 border-t border-indigo-100 pt-2">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-800"><UserRound className="h-3 w-3 text-indigo-600" />{isMemberView ? "本单分配" : "收益分配"}</span>
                <span className="shrink-0 text-[10px] text-indigo-600">开仓快照 · {visibleProfitShareAllocations.length} 人</span>
              </div>
              <div className="mt-1.5 overflow-hidden rounded border border-indigo-100 bg-indigo-50/40">
                {visibleProfitShareAllocations.map((allocation, allocationIndex) => <div key={allocation.beneficiaryUserId} className={`flex items-center justify-between gap-3 px-2.5 py-1.5 text-[11px] tabular-nums ${allocationIndex > 0 ? "border-t border-indigo-100/80" : ""}`}>
                  <span className="min-w-0 truncate font-medium text-slate-700">{allocation.beneficiaryUserName}</span>
                  <span className="shrink-0 font-semibold text-indigo-700">{formatProfitSharePercentage(allocation.percentage)}</span>
                </div>)}
              </div>
              <div className="mt-1.5 text-[10px] leading-4 text-slate-500">已平流水按当时比例永久固定；管理员可在“编辑”中调整本单剩余仓位，并同步此项目之后新开的订单。</div>
            </div>}
            {trade.instrumentType === "option" && <div className="col-span-3 grid grid-cols-3 gap-x-2 border-t border-slate-200 pt-2">
              <div className="min-w-0">
                <div className="text-[10px] text-slate-400">期权方向</div>
                <div className="mt-0.5 truncate text-[11px] font-medium text-violet-700">{getOptionDirectionLabel(trade.optionDirection) ?? "未标注"}</div>
              </div>
              <div className="min-w-0 text-center">
                <div className="text-[10px] text-slate-400">到期日</div>
                <div className="mt-0.5 whitespace-nowrap text-[11px] font-medium text-slate-700">{trade.optionExpiryDate || "未设置"}</div>
              </div>
              <div className="min-w-0 text-right">
                <div className="text-[10px] text-slate-400">权利金</div>
                <div className="mt-0.5 whitespace-nowrap text-[11px] font-medium text-slate-700">{trade.optionPremium === undefined ? "未设置" : `${formatPrice(trade.optionPremium)} ${trade.optionPremiumCurrency ?? "USDT"}`}</div>
              </div>
            </div>}
            {canManage && trade.instrumentType === "grid" && <div className="col-span-3 grid grid-cols-3 gap-x-2 border-t border-cyan-200 pt-2">
              <div className="min-w-0">
                <div className="text-[10px] text-slate-400">网格方向</div>
                <div className="mt-0.5 truncate text-[11px] font-medium text-cyan-800">{trade.gridDirection === "long" ? "做多网格" : trade.gridDirection === "short" ? "做空网格" : "未设置"}</div>
              </div>
              <div className="min-w-0 text-center">
                <div className="text-[10px] text-slate-400">网格范围</div>
                <div className="mt-0.5 whitespace-nowrap text-[11px] font-medium tabular-nums text-slate-700">{trade.gridRangeMin === undefined || trade.gridRangeMax === undefined ? "未设置" : trade.gridDirection === "short" ? `${formatPrice(trade.gridRangeMax)}–${formatPrice(trade.gridRangeMin)}` : `${formatPrice(trade.gridRangeMin)}–${formatPrice(trade.gridRangeMax)}`}</div>
              </div>
              <div className="min-w-0 text-right">
                <div className="text-[10px] text-slate-400">杠杆 · 格数</div>
                <div className="mt-0.5 whitespace-nowrap text-[11px] font-medium tabular-nums text-slate-700">{trade.gridLeverage === undefined || trade.gridCount === undefined ? "未设置" : `${formatPrice(trade.gridLeverage)}× · ${trade.gridCount}格`}</div>
              </div>
            </div>}
            {ACTIONS[trade.action].opening && (trade.instrumentType === "spot" || trade.instrumentType === "contract") && takeProfitPlans.length > 0 && <div className="col-span-3 border-t border-amber-200 pt-2">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 text-[10px] text-slate-500"><Target className="h-3 w-3 text-amber-600" />止盈计划</span>
                <span className="text-[10px] font-medium text-amber-700">待触发 {formatQuantity(pendingTakeProfitQuantity)} ETH · {takeProfitPlans.filter((plan) => plan.status === "pending").length} 段</span>
              </div>
              <div className="space-y-1">
                {takeProfitPlans.map((plan, planIndex) => (
                  <div key={`${plan.id || "take-profit"}-${planIndex}`} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded border border-amber-100 bg-amber-50/45 px-2 py-1 text-[10px] tabular-nums">
                    <span className={`font-semibold ${plan.status === "pending" ? "text-amber-700" : plan.status === "triggered" ? "text-slate-500" : "text-slate-400"}`}>第{planIndex + 1}段</span>
                    <span className="min-w-0 truncate text-slate-700">{formatPrice(plan.triggerPrice)} U · {formatQuantity(plan.quantity)} ETH</span>
                    <span className={`whitespace-nowrap ${plan.status === "pending" ? "text-amber-700" : "text-slate-500"}`}>{plan.status === "pending" ? (ACTIONS[trade.action].side === "long" ? "向上触发" : "向下触发") : plan.status === "triggered" ? "已触发" : "已取消"}</span>
                  </div>
                ))}
              </div>
            </div>}
            {trade.note?.trim() && (
              <div className="col-span-3 border-t border-slate-200 pt-2">
                <div className="text-[10px] text-slate-400">备注</div>
                <div className="mt-0.5 whitespace-pre-wrap break-words text-[11px] leading-4 text-slate-600">{trade.note}</div>
              </div>
            )}
          </div>
          {trade.filledAt && <div className="mt-2 flex items-center gap-1.5 border-t border-slate-200 pt-2 text-[10px] font-medium text-slate-500">
            <Clock3 className="h-3 w-3 shrink-0 text-sky-600" />
            成交时间：{formatBeijingMonthDayTime(trade.filledAt)} · 参考价触发 {formatPrice(trade.filledPrice ?? trade.price)} U
          </div>}
          {linkedClosings.length > 0 && (
            <div className="mt-2 border-t border-slate-200 pt-2">
              <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
                <span className="font-medium text-slate-600">关联平仓记录</span>
                <span className="whitespace-nowrap tabular-nums">已平 {formatQuantity(linkedClosedQuantity)} · 剩 {formatQuantity(remainingQuantity)} ETH</span>
              </div>
              <div className="mt-1.5 space-y-1">
                {linkedClosings.map(({ trade: closingTrade, quantity }, index) => {
                  const isLongPosition = ACTIONS[trade.action].side === "long";
                  return (
                    <div key={`${closingTrade.id}-${index}`} className="flex items-center justify-between gap-2 border-l-2 border-slate-200 bg-white/70 px-2 py-1.5 text-[11px] tabular-nums">
                      <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
                        <span className={`font-semibold ${isLongPosition ? "text-rose-600" : "text-emerald-600"}`}>{ACTIONS[closingTrade.action].label}</span>
                        <span className="font-medium text-slate-700">{formatQuantity(quantity)} ETH</span>
                        <span className="text-slate-500">{isLongPosition ? "卖" : "买"} {formatPrice(closingTrade.price)}</span>
                      </div>
                      <span className="shrink-0 whitespace-nowrap text-slate-400">{formatBeijingMonthDayTime(closingTrade.createdAt)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
  };

  if (meLoading || ledgerLoading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-500">正在核验访问权限…</div>;
  }

  if (!canAccess) {
    return (
      <div className={`${embedded ? "min-h-0 w-full" : "min-h-screen max-w-md mx-auto"} bg-slate-50 flex flex-col`}>
        <div className="flex items-center gap-3 px-4 py-4 bg-white border-b border-slate-100">
          {!embedded && <button onClick={backToLedger} aria-label="返回52号账本" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
            <ArrowLeft className="w-5 h-5 text-slate-700" />
          </button>}
          <div className="min-w-0">
            <div className="font-semibold text-slate-900">T+0 速记账本</div>
            <div className="text-xs text-slate-500 mt-0.5">52 号账本内部工具</div>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-7 text-center">
          <div className="w-12 h-12 rounded bg-slate-200 flex items-center justify-center mb-4">
            <ShieldCheck className="w-6 h-6 text-slate-500" />
          </div>
          <div className="text-base font-semibold text-slate-800">当前身份不可访问</div>
          <p className="mt-2 text-sm leading-6 text-slate-500">仅 52 号账本成员可访问。管理员可管理全部关联用户数据；成员只可查看本人关联的仓位与流水，代入成员视角不会开放。</p>
        </div>
      </div>
    );
  }

  if (payoutEntryDirection) {
    const isDepositEntry = payoutEntryDirection === "deposit";
    const entryLogs = isDepositEntry ? depositLogs : withdrawalLogs;
    const entryTotal = isDepositEntry ? cumulativeDepositAmount : cumulativePayoutAmount;
    const entryFixedEthQuantity = isDepositEntry
      ? entryLogs.reduce((total, log) => total + (log.ethQuantity && Number.isFinite(Number(log.ethQuantity)) ? Number(log.ethQuantity) : 0), 0)
      : 0;
    const entryFixedEthCount = isDepositEntry ? entryLogs.filter((log) => Boolean(log.ethQuantity)).length : 0;
    const entryTitle = isDepositEntry ? "登记投入" : "登记提现";
    const entryFlowTitle = isDepositEntry ? "存入流水" : "提取流水";
    const entryTone = isDepositEntry ? "text-sky-700" : "text-slate-800";
    const entryButtonTone = isDepositEntry ? "bg-sky-600" : "bg-slate-800";
    const isEthDepositInput = isDepositEntry && payoutDepositInputMode === "eth";
    const payoutEthReferencePriceValue = Number(payoutEthReferencePrice);
    const payoutEthQuantityPreview = isDepositEntry
      && !isEthDepositInput
      && Number(payoutAmount) > 0
      && Number.isFinite(payoutEthReferencePriceValue)
      && payoutEthReferencePriceValue > 0
      ? Number(payoutAmount) / payoutEthReferencePriceValue
      : null;
    const payoutUAmountPreview = isEthDepositInput
      && Number(payoutEthQuantity) > 0
      && Number.isFinite(payoutEthReferencePriceValue)
      && payoutEthReferencePriceValue > 0
      ? Number(payoutEthQuantity) * payoutEthReferencePriceValue
      : null;
    const isFixedCoinPrincipalEditing = isDepositEntry && Boolean(editingPayoutLog?.ethQuantity);
    const isLegacyDepositEditing = isDepositEntry && Boolean(editingPayoutLog) && !isFixedCoinPrincipalEditing;
    const requiresEthReferencePrice = isDepositEntry && (isEthDepositInput || !editingPayoutLog || isFixedCoinPrincipalEditing);
    const closePayoutEntryPage = () => {
      resetPayoutLogForm();
      setIsPayoutListEditing(false);
      setDeletePayoutLogId(null);
      setLocation(`/ledger/${ledgerId}/t0-journal`);
    };
    const submitPayoutEntry = () => {
      const reportValidationError = (message: string) => {
        setPayoutSubmitNotice({ tone: "error", message });
        t0Toast.error(message);
      };
      const amount = Number(payoutAmount);
      if (!payoutOccurredOn) { reportValidationError("请选择登记日期"); return; }
      const ethReferencePrice = payoutEthReferencePrice.trim();
      const ethQuantity = payoutEthQuantity.trim();
      if (isEthDepositInput) {
        if (!/^(?:0|[1-9]\d{0,14})(?:\.\d{1,18})?$/.test(ethQuantity) || !Number.isFinite(Number(ethQuantity)) || Number(ethQuantity) <= 0) {
          reportValidationError("请输入有效的 ETH 数量");
          return;
        }
      } else if (!Number.isFinite(amount) || amount <= 0) { reportValidationError("请输入有效的登记金额"); return; }
      if (isDepositEntry && (requiresEthReferencePrice || ethReferencePrice) && (!/^(?:0|[1-9]\d{0,14})(?:\.\d{1,8})?$/.test(ethReferencePrice) || !Number.isFinite(Number(ethReferencePrice)) || Number(ethReferencePrice) <= 0)) {
        reportValidationError("请确认有效的 ETH 参考价");
        return;
      }
      if (!isDepositEntry && amount > payoutFormWithdrawalLimit + 0.005) { reportValidationError(`本次提现不能超过可提现的 ${formatPrice(payoutFormWithdrawalLimit)} U`); return; }
      const payload = {
        ledgerId: 52 as const,
        relatedUserId: payoutTargetRelatedUserId,
        occurredOn: payoutOccurredOn,
        amount: isEthDepositInput ? undefined : amount.toFixed(2),
        direction: payoutEntryDirection,
        note: payoutNote.trim() || undefined,
        maximumTotalAmount: payoutProfitCap.toFixed(2),
      };
      setPayoutSubmitNotice({ tone: "pending", message: "正在提交，请勿重复点击。" });
      if (editingPayoutLog) updatePayoutLogMutation.mutate({ ...payload, id: editingPayoutLog.id, ethReferencePrice: isDepositEntry ? ethReferencePrice || undefined : undefined, ethQuantity: isEthDepositInput ? ethQuantity : undefined });
      else createPayoutLogMutation.mutate({ ...payload, ethReferencePrice: isDepositEntry ? ethReferencePrice : undefined, ethQuantity: isEthDepositInput ? ethQuantity : undefined });
    };

    if (!canManage || payoutTargetRelatedUserId <= 0) {
      return <div className="min-h-screen max-w-md mx-auto bg-slate-50">
        <header className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4">
          <button type="button" onClick={() => setLocation(`/ledger/${ledgerId}/t0-journal`)} aria-label="返回T+0速记账本" className="flex h-8 w-8 items-center justify-center rounded border border-slate-200 bg-white active:scale-95"><ArrowLeft className="h-4 w-4 text-slate-700" /></button>
          <h1 className="font-semibold text-slate-900">{entryTitle}</h1>
        </header>
        <div className="px-5 py-12 text-center text-sm leading-6 text-slate-500">请先在 T+0 速记账本中单选一位用户，再进行资金登记。</div>
      </div>;
    }

    return <div className="min-h-screen max-w-md mx-auto bg-slate-50 pb-8">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 shadow-[0_1px_3px_rgba(15,23,42,0.05)] backdrop-blur">
        <button type="button" onClick={closePayoutEntryPage} aria-label="返回T+0收益账本" className="flex h-8 w-8 items-center justify-center rounded border border-slate-200 bg-white active:scale-95"><ArrowLeft className="h-4 w-4 text-slate-700" /></button>
        <div className="min-w-0 flex-1"><h1 className="font-semibold text-slate-900">{entryTitle}</h1><div className="truncate text-[11px] text-slate-500">{payoutTargetUserIdentity.name}{payoutTargetUserIdentity.username ? ` · @${payoutTargetUserIdentity.username}` : ""}</div></div>
        {entryLogs.length > 0 && <button type="button" onClick={() => { setIsPayoutListEditing((current) => !current); setDeletePayoutLogId(null); }} className={`h-8 rounded px-2 text-xs font-medium ${isPayoutListEditing ? "bg-slate-800 text-white" : "text-slate-600 active:bg-slate-100"}`}>{isPayoutListEditing ? "完成" : "编辑"}</button>}
      </header>

      <main className="space-y-3 px-3 py-4">
        <section className="border-y border-slate-200 bg-white px-3 py-3">
          <div className={`flex items-center justify-between gap-2 tabular-nums ${entryTone}`}><span className="flex min-w-0 items-baseline gap-1.5"><span className="shrink-0 text-xs font-medium text-slate-500">{entryFlowTitle}</span><span className="truncate text-base font-semibold">{entryTotal > 0 ? (isDepositEntry ? "+" : "−") : ""}{entryTotal === 0 ? "0" : formatPrice(entryTotal)} <span className="text-[10px] font-medium opacity-75">U</span></span></span>{isDepositEntry && entryFixedEthCount > 0 && <span className="flex shrink-0 items-baseline gap-1.5 border-l border-slate-200 pl-3"><span className="text-xs font-medium text-slate-500">ETH折算</span><span className="text-base font-semibold">{formatPayoutEthQuantity(String(entryFixedEthQuantity))} <span className="text-[10px] font-medium opacity-75">ETH</span></span></span>}</div>
        </section>

        <section className="border-y border-slate-200 bg-white px-3 py-3">
          {editingPayoutLog && <div className="mb-3 flex items-center justify-between text-xs"><span className="font-medium text-slate-600">编辑本笔{isDepositEntry ? "存入" : "提取"}</span><button type="button" onClick={resetPayoutLogForm} className="text-slate-400 active:text-slate-700">取消编辑</button></div>}
          {isDepositEntry && <div className="mb-3 flex items-center justify-between gap-3 rounded border border-sky-100 bg-sky-50/60 px-2.5 py-2"><span className="text-[11px] font-medium text-slate-600">当前按 <span className={isEthDepositInput ? "text-sky-700" : "text-slate-500"}>{isEthDepositInput ? "ETH" : "U"}</span> 录入</span><button type="button" onClick={() => { setPayoutDepositInputMode((current) => current === "u" ? "eth" : "u"); setPayoutAmount(""); setPayoutEthQuantity(""); }} className="inline-flex h-7 items-center gap-1 rounded border border-sky-200 bg-white px-2 text-[11px] font-semibold text-sky-700 active:scale-95"><Repeat2 className="h-3.5 w-3.5" />{isEthDepositInput ? "改为 U 金额" : "改为 ETH 数量"}</button></div>}
          <div className="grid grid-cols-2 gap-2">
            <label className="min-w-0 text-[11px] font-medium text-slate-600">日期
              <input type="date" value={payoutOccurredOn} onChange={(event) => setPayoutOccurredOn(event.target.value)} className="t0-journal-date-input mt-1 block h-10 min-h-0 w-full appearance-none rounded border border-slate-300 bg-white px-2 py-0 font-sans text-sm leading-5 text-slate-800" style={{ WebkitAppearance: "none", appearance: "none" }} />
            </label>
            <label className="min-w-0 text-[11px] font-medium text-slate-600">{isEthDepositInput ? "币本位数量（ETH）" : "金额（U）"}
              <input inputMode="decimal" placeholder="0.00" value={isEthDepositInput ? payoutEthQuantity : payoutAmount} onChange={(event) => isEthDepositInput ? setPayoutEthQuantity(event.target.value) : setPayoutAmount(event.target.value)} className={`mt-1 block h-10 min-h-0 w-full rounded px-2 py-0 font-sans text-sm leading-5 tabular-nums text-slate-800 ${isEthDepositInput ? "border border-sky-200 bg-sky-50/40" : "border border-slate-300 bg-white"}`} />
            </label>
          </div>
          {isDepositEntry && <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="min-w-0 text-[11px] font-medium text-slate-600">ETH 参考价（U）
              <input
                inputMode="decimal"
                placeholder={isLegacyDepositEditing ? "可补录参考价" : payoutLiveEthPrice ? payoutLiveEthPrice.toFixed(2) : "行情加载中"}
                value={payoutEthReferencePrice}
                onChange={(event) => {
                  setPayoutEthReferencePrice(event.target.value);
                  setPayoutEthReferencePriceIsManual(true);
                }}
                className="mt-1 block h-10 min-h-0 w-full rounded border border-sky-200 bg-sky-50/40 px-2 py-0 font-sans text-sm leading-5 tabular-nums text-slate-800"
              />
              <span className="mt-1 block text-[10px] font-normal text-sky-700">{isEthDepositInput ? "按 ETH × 参考价折算U入账" : isLegacyDepositEditing ? "可选补录参考价并生成币本位数量" : editingPayoutLog ? "修改后将重新计算本笔数量" : payoutEthReferencePriceIsManual ? "已手动输入" : payoutLiveEthPrice ? "实时价预填，可修改" : "等待实时行情"}</span>
            </label>
            <div className="min-w-0 text-[11px] font-medium text-slate-600">{isEthDepositInput ? "折算金额（U）" : "币本位数量"}
              <div className="mt-1 flex h-10 items-center rounded border border-slate-200 bg-slate-50 px-2 text-sm font-semibold tabular-nums text-slate-800">{isEthDepositInput ? (payoutUAmountPreview === null ? "—" : formatPrice(payoutUAmountPreview)) : (payoutEthQuantityPreview === null ? "—" : formatPayoutEthQuantity(String(payoutEthQuantityPreview)))} <span className="ml-1 text-[10px] font-medium text-slate-500">{isEthDepositInput ? "U" : "ETH"}</span></div>
              <span className="mt-1 block text-[10px] font-normal text-slate-500">{isEthDepositInput ? "保存时以服务端定点折算为准" : editingPayoutLog ? "保存后按本次金额和价格更新" : "确认后固定，不跟随行情变化"}</span>
            </div>
          </div>}
          <label className="mt-3 block text-[11px] font-medium text-slate-600">备注（可选）
            <input value={payoutNote} onChange={(event) => setPayoutNote(event.target.value)} maxLength={300} placeholder="" className="mt-1 block h-10 min-h-0 w-full rounded border border-slate-300 bg-white px-2 py-0 font-sans text-sm leading-5 text-slate-800" />
          </label>
          {!isDepositEntry && <div className="mt-2 flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] tabular-nums"><span className="font-medium text-slate-500">当前可提余额</span><span className={`font-bold ${payoutFormWithdrawalLimit > 0 ? "text-rose-600" : "text-slate-700"}`}>{formatPrice(payoutFormWithdrawalLimit)} <span className="text-[9px] font-medium">U</span></span></div>}
          <button type="button" disabled={createPayoutLogMutation.isPending || updatePayoutLogMutation.isPending} onClick={submitPayoutEntry} className={`mt-4 h-10 w-full rounded text-sm font-semibold text-white active:scale-[0.99] disabled:opacity-45 ${entryButtonTone}`}>{createPayoutLogMutation.isPending || updatePayoutLogMutation.isPending ? "保存中" : editingPayoutLog ? "保存修改" : `保存${isDepositEntry ? "投入" : "提现"}`}</button>
          {payoutSubmitNotice && <div role="status" aria-live="polite" className={`mt-2 rounded border px-2.5 py-2 text-[11px] leading-4 ${payoutSubmitNotice.tone === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : payoutSubmitNotice.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-sky-200 bg-sky-50 text-sky-700"}`}>{payoutSubmitNotice.tone === "error" ? "未保存：" : payoutSubmitNotice.tone === "success" ? "保存成功：" : "提交状态："}{payoutSubmitNotice.message}</div>}
        </section>

        <section className="border-y border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5 text-xs"><span className={`font-semibold ${entryTone}`}>{entryFlowTitle}</span><span className="text-slate-400">{entryLogs.length} 笔</span></div>
          {t0PayoutLogsQuery.isLoading ? <div className="py-6 text-center text-xs text-slate-400">加载中…</div> : entryLogs.length > 0 ? <div className="divide-y divide-slate-100">{entryLogs.map(renderPayoutLogRow)}</div> : <div className="px-3 py-6 text-center text-xs text-slate-400">暂无{entryFlowTitle}记录</div>}
        </section>
      </main>
    </div>;
  }

  return (
    <div className={`${embedded ? "min-h-0 w-full" : "min-h-screen max-w-md mx-auto"} bg-slate-50 pb-8`}>
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 shadow-[0_1px_3px_rgba(15,23,42,0.05)] backdrop-blur">
          <div className="h-14 px-4 flex items-center gap-3">
            {!embedded && <button onClick={backToLedger} aria-label="返回52号账本" className="flex h-8 w-8 items-center justify-center rounded border border-slate-200 bg-white active:scale-95">
              <ArrowLeft className="w-4 h-4 text-slate-700" />
            </button>}
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <h1 className="shrink-0 font-semibold tracking-[0.01em] text-slate-900">T+0 速记账本</h1>
              {canManage && <button
                type="button"
                onClick={() => setShowGlobalLedger(true)}
                aria-haspopup="dialog"
                aria-label="查看全局账本"
                title="全局账本"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-slate-300 bg-slate-50 text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] transition active:scale-95 active:bg-slate-100"
              >
                <BookOpen className="h-[15px] w-[15px]" strokeWidth={2.1} />
              </button>}
            </div>
            <button
              onClick={forceRefreshJournal}
              aria-label="强制刷新整个页面"
              title="强制刷新整个页面"
              className="h-8 rounded border border-slate-200 bg-slate-900 px-3 text-xs font-semibold text-white active:scale-95"
            >
              刷新
            </button>
          </div>
          {canUseMemberPreview && <div className={`flex min-h-10 items-center justify-between gap-2 border-t px-4 py-1.5 text-[11px] ${isUserPreview ? "border-indigo-200 bg-indigo-50/80" : "border-slate-100 bg-slate-50/80"}`} aria-live="polite">
            {isUserPreview ? <>
              <div className="min-w-0 leading-4 text-indigo-900">
                <span className="font-semibold">正在预览：</span>
                <span className="font-semibold">{selectedPreviewMember?.name || `用户#${previewUserId}`}</span>
                {selectedPreviewMember?.username && <span className="ml-1 text-indigo-600">· {selectedPreviewMember.username}</span>}
                <span className="ml-1.5 text-indigo-700">用户视角 · 只读{isPreviewSwitching ? "（切换中…）" : ""}</span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => openAdminMemberPicker("preview")}
                  className="h-7 rounded border border-indigo-200 bg-white px-2 text-[11px] font-semibold text-indigo-700 active:scale-95"
                >
                  换用户
                </button>
                <button
                  type="button"
                  onClick={returnToAdminFromPreview}
                  className="h-7 rounded bg-indigo-700 px-2 text-[11px] font-semibold text-white active:scale-95"
                >
                  返回管理员
                </button>
              </div>
            </> : <>
              <div className="min-w-0 text-slate-500"><span className="font-semibold text-slate-700">管理员视角</span><span className="ml-1.5">可核对成员实际可见的整页数据与展示规则</span></div>
              <button
                type="button"
                onClick={() => openAdminMemberPicker("preview")}
                className="h-7 shrink-0 rounded border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-700 active:scale-95"
              >
                选择用户
              </button>
            </>}
          </div>}
        </header>

      <main className="space-y-4 px-4 pt-4">
        <section
          className="relative rounded"
          style={{
            background: [
              "linear-gradient(135deg, rgba(255,255,255,0.86) 0%, rgba(255,255,255,0.32) 25%, rgba(255,255,255,0) 50%, rgba(0,0,0,0) 65%, rgba(0,0,0,0.19) 100%)",
              "linear-gradient(90deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.06) 40%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.12) 100%)",
              "linear-gradient(180deg, rgba(0,0,0,0.07) 0%, rgba(255,255,255,0.20) 36%, rgba(255,255,255,0.28) 52%, rgba(255,255,255,0.09) 70%, rgba(0,0,0,0.10) 100%)",
              "linear-gradient(160deg, #e4e7eb 0%, #c9cfd6 20%, #dde1e6 45%, #bec6cf 65%, #d7dce2 80%, #e2e6ea 100%)",
            ].join(", "),
            border: "1.5px solid rgba(178,187,198,0.96)",
            boxShadow: "0 7px 18px rgba(15,23,42,0.16), 0 2px 4px rgba(15,23,42,0.10), inset 0 2px 0 rgba(255,255,255,0.94), inset 0 -2px 0 rgba(71,85,105,0.44), inset 1.5px 0 rgba(255,255,255,0.50), inset -1.5px 0 rgba(71,85,105,0.14)",
          }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0 rounded"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75 0.02' numOctaves='4' seed='5'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.30'/%3E%3C/svg%3E")`,
              backgroundSize: "160px 160px",
              mixBlendMode: "overlay",
              filter: "contrast(1.16)",
            }}
          />
          <div
            className="relative z-[1] flex min-w-0 items-center p-2"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.14), rgba(203,213,225,0.14))",
              borderTop: "1px solid rgba(100,116,139,0.20)",
              borderBottom: "1px solid rgba(255,255,255,0.62)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.42), inset 0 -1px 0 rgba(71,85,105,0.10)",
            }}
          >
            <button
              type="button"
              onClick={openTotalProfitReport}
              aria-haspopup={isMemberView ? undefined : "dialog"}
              aria-label={isMemberView ? "打开总收益页面" : "查看总收益归因报告"}
              className="flex min-w-0 flex-1 items-center gap-1.5 border-r px-2.5 py-3 text-left transition-opacity active:opacity-60"
              style={{
                borderColor: "rgba(100,116,139,0.26)",
                boxShadow: "inset -1px 0 0 rgba(255,255,255,0.70)",
              }}
            >
              <div className="shrink-0 whitespace-nowrap text-[11px] font-semibold text-slate-500" style={{ textShadow: "-0.6px -0.6px 0 rgba(255,255,255,0.94), 0.8px 0.8px 0 rgba(71,85,105,0.28)" }}>总收益</div>
              <div className={`flex shrink-0 items-baseline gap-0.5 whitespace-nowrap text-[clamp(18px,5vw,22px)] font-bold leading-none tabular-nums ${totalNetProfitClass}`} style={{ textShadow: "-0.9px -0.9px 0 rgba(255,255,255,0.88), 1.15px 1.15px 1px rgba(15,23,42,0.22)" }}>
                <span>{totalNetProfitText}</span>
                <span className="text-[12px] font-semibold opacity-65">U</span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setShowNetPositionDetail(true)}
              aria-haspopup="dialog"
              aria-label="查看总仓位对冲明细"
              className="flex shrink-0 items-center gap-1.5 px-2.5 py-3 text-left transition-opacity active:opacity-60"
            >
              <div className="shrink-0 whitespace-nowrap text-[11px] font-semibold text-slate-500" style={{ textShadow: "-0.6px -0.6px 0 rgba(255,255,255,0.94), 0.8px 0.8px 0 rgba(71,85,105,0.28)" }}>总仓位</div>
              <div className={`flex shrink-0 items-baseline gap-0.5 whitespace-nowrap text-[clamp(18px,5vw,22px)] font-bold leading-none tabular-nums ${netPositionClass}`} style={{ textShadow: "-0.9px -0.9px 0 rgba(255,255,255,0.88), 1.15px 1.15px 1px rgba(15,23,42,0.22)" }}>
                <span>{roundedNetPositionText}</span>
                <span className="text-[12px] font-semibold opacity-65">ETH</span>
              </div>
            </button>
          </div>

          <div className="relative z-[1]">
            <AccountOverview
              summary={overviewSummary}
              positionStats={{
                long: {
                  quantity: netPositionBreakdown.long.quantity,
                  activeLevels: netPositionBreakdown.long.levels.length,
                },
                short: {
                  quantity: netPositionBreakdown.short.quantity,
                  activeLevels: netPositionBreakdown.short.levels.length,
                },
              }}
              showCumulativeData={showCumulativeData}
              onToggleCumulativeData={() => setShowCumulativeData((current) => !current)}
              showCommission={!isMemberView}
              isMemberView={isMemberView}
              onExplainGrossProfit={(side, data) => setGrossProfitDetail({
                side,
                gross: data.realizedGross,
                openingFee: data.realizedOpeningFee,
                closingFee: data.realizedClosingFee,
                net: data.realized,
              })}
            />
          </div>
        </section>

        <section
          className="relative overflow-visible rounded border border-[#b9c2ca] bg-[#eef1f3]"
          style={{
            background: "linear-gradient(145deg, rgba(249,250,251,0.96), rgba(218,224,229,0.88))",
            boxShadow: "0 5px 12px rgba(15,23,42,0.10), inset 0 1px 0 rgba(255,255,255,0.94), inset 0 -1px 0 rgba(71,85,105,0.20)",
          }}
        >
          <div
            className="relative z-40 border-b px-3 py-2.5"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.84), rgba(218,224,229,0.66))",
              borderColor: "rgba(109,121,137,0.24)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.94), inset 0 -1px 0 rgba(71,85,105,0.10)",
            }}
          >
            <div
              data-t0-filter-row
              className={`grid gap-1.5 transition-[grid-template-columns] duration-200 ${isMemberView ? "grid-cols-2" : "grid-cols-3"}`}
              style={{
                gridTemplateColumns: topFilterGridTemplateColumns,
              }}
            >
              {!isMemberView && (
                <T0MultiSelect
                  label="账户"
                  options={accountFilterOptions}
                  selectedIds={selectedAccountIds}
                  emptyLabel="暂无账户"
                  onChange={(ids) => {
                    setSelectedAccountIds(ids);
                    setRecentJournalPage(1);
                  }}
                />
              )}
              {canManage ? <button
                type="button"
                onClick={() => openAdminMemberPicker("filter")}
                aria-haspopup="dialog"
                aria-expanded={previewMemberPickerOpen && isAdminFilterMemberPicker}
                aria-label={`筛选用户：${adminFilterSummary}`}
                title={`筛选用户：${adminFilterSummary}`}
                className="flex h-10 w-full min-w-0 items-center gap-1.5 rounded border border-slate-300 bg-white/70 px-2.5 text-[13px] font-medium text-slate-700 outline-none transition-colors focus:border-[#1a56db] active:bg-white"
                style={{
                  textShadow: "-0.35px -0.35px 0 rgba(255,255,255,0.86), 0.6px 0.6px 0 rgba(71,85,105,0.20)",
                  boxShadow: "inset 0 1px 1px rgba(255,255,255,0.96), inset 0 -1px 0 rgba(100,116,139,0.20)",
                }}
              >
                <span className="shrink-0 text-[12px] font-semibold tracking-wide text-slate-500">用户</span>
                <span className={`min-w-0 flex-1 truncate ${adminFilterSummary === "全部" ? "text-left" : "text-center"}`}>{adminFilterSummary}</span>
                <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${previewMemberPickerOpen && isAdminFilterMemberPicker ? "rotate-180" : ""}`} />
              </button> : <T0MultiSelect
                label="用户"
                options={relatedUserFilterOptions}
                selectedIds={relatedUserFilterIds}
                emptyLabel={isMemberView ? "暂无已授权订单来源" : "暂无用户"}
                constrainRightToFilterRow
                treatSelectionAsAll={topRelatedUserSelectionIsAll}
                onChange={(ids) => {
                  setRelatedUserFilterIds(ids);
                  if (isMemberView) {
                    setMemberRelatedUserFilterTouched(true);
                    setHistoryRelatedUserFilterIds(ids);
                  }
                  // 项目只属于用户；改动用户范围后重置项目，避免保留不可见的跨用户项目条件。
                  setRelatedFundFilterIds([]);
                  setRecentJournalPage(1);
                }}
              />}
              {shouldLockMemberFundFilter ? <LockedFilterValue label="项目" value={lockedRelatedFundName} /> : (
                <T0MultiSelect
                  label="项目"
                  options={relatedFundFilterOptions}
                  selectedIds={relatedFundFilterIds}
                  emptyLabel="暂无项目"
                  align="right"
                  onChange={(ids) => {
                    setRelatedFundFilterIds(ids);
                    setRecentJournalPage(1);
                  }}
                />
              )}
            </div>
            {(canManage || isMemberView) && <div className="mt-2 grid grid-cols-2 gap-1.5 transition-[grid-template-columns] duration-200" style={{ gridTemplateColumns: topTypeStatusGridTemplateColumns }}>
              <T0MultiSelect
                label="类型"
                options={T0_INSTRUMENT_FILTER_OPTIONS}
                selectedIds={instrumentTypeFilterIds}
                emptyLabel="暂无类型"
                showSelectedLabels
                onChange={(ids) => {
                  setInstrumentTypeFilterIds(normalizeT0InstrumentTypeFilterIds(ids));
                  setRecentJournalPage(1);
                }}
              />
              <T0MultiSelect
                label="状态"
                options={T0_EXECUTION_FILTER_OPTIONS}
                selectedIds={executionFilter === "all" ? [] : [executionFilter]}
                emptyLabel="暂无状态"
                align="right"
                singleSelect
                summarySuffix={hideLocked ? "隐藏已锁定" : undefined}
                additionalToggle={{
                  label: "隐藏已锁定",
                  checked: hideLocked,
                  onCheckedChange: (checked) => {
                    setHideLocked(checked);
                    setRecentJournalPage(1);
                  },
                }}
                onChange={(ids) => {
                  const value = ids[0];
                  setExecutionFilter(value === "filled" || value === "pending" ? value : "all");
                  setRecentJournalPage(1);
                }}
              />
            </div>}
          </div>
          {(canManage || isMemberView) && <div
            className="flex h-9 items-center justify-center gap-1.5 border-b border-[#aeb8c1]/50 px-3"
            aria-label="T形交割表报价模式"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.82), rgba(218,224,229,0.60))",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.94), inset 0 -1px 0 rgba(71,85,105,0.10)",
            }}
          >
            <button
              type="button"
              aria-pressed={adminLadderDisplayMode === "individual"}
              aria-label={`当前${adminLadderDisplayMode === "individual" ? "逐笔报价" : "整合报价"}，点击切换至${adminLadderDisplayMode === "individual" ? "整合报价" : "逐笔报价"}`}
              title={`切换至${adminLadderDisplayMode === "individual" ? "整合报价" : "逐笔报价"}`}
              onClick={() => setAdminLadderDisplayMode((current) => current === "individual" ? "integrated" : "individual")}
              className="h-6 rounded border border-rose-600 bg-rose-600 px-3 text-[11px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition active:scale-[0.98]"
            >
              {adminLadderDisplayMode === "individual" ? "逐笔报价" : "整合报价"}
            </button>
            {adminLadderDisplayMode === "integrated" && (
              <select
                value={integratedArchiveStep}
                onChange={(event) => setIntegratedArchiveStep(Number(event.target.value) as IntegratedArchiveStep)}
                aria-label="整合报价归档宽度"
                title="仅合并整合报价的显示档位；真实成交、FIFO 与可平数量仍按十美元档核算"
                className="h-6 rounded border border-slate-300 bg-white/80 px-1.5 text-[11px] font-semibold text-slate-700 outline-none focus:border-rose-500"
              >
                {INTEGRATED_ARCHIVE_STEPS.map((step) => (
                  <option key={step} value={step}>归档 {step}U</option>
                ))}
              </select>
            )}
          </div>}
          <div
            className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center border-b border-[#aeb8c1]/50 px-3 py-2.5"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.72), rgba(208,215,221,0.56))",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.92), inset 0 -1px 0 rgba(71,85,105,0.14)",
            }}
          >
            <time className="min-w-0 truncate whitespace-nowrap text-[10px] font-medium tabular-nums text-slate-500" style={{ textShadow: "-0.35px -0.35px 0 rgba(255,255,255,0.86), 0.6px 0.6px 0 rgba(71,85,105,0.20)" }} dateTime={liveClock.toISOString()}>
              {liveBeijingTime}
            </time>
            <span className="text-[13px] font-semibold tracking-[0.08em] text-slate-800" style={{ textShadow: "-0.55px -0.55px 0 rgba(255,255,255,0.94), 0.8px 0.8px 0 rgba(71,85,105,0.28)" }}>T形交割表</span>
            <div className={`flex min-w-0 justify-self-end items-center justify-end gap-0.5 whitespace-nowrap text-[10px] font-medium tabular-nums ${priceTrendClass}`} style={{ textShadow: "-0.35px -0.35px 0 rgba(255,255,255,0.86), 0.6px 0.6px 0 rgba(71,85,105,0.20)" }}>
              <span className="text-slate-500">实时参考价</span>
              {priceTrend === "up" && <span role="img" aria-label="价格上涨" className="inline-block h-0 w-0 border-x-[3px] border-b-[5px] border-x-transparent border-b-current" />}
              {priceTrend === "down" && <span role="img" aria-label="价格下跌" className="inline-block h-0 w-0 border-x-[3px] border-t-[5px] border-x-transparent border-t-current" />}
            </div>
          </div>
          <div
            style={{
              background: [
                "linear-gradient(135deg, rgba(255,255,255,0.62) 0%, rgba(255,255,255,0.18) 24%, rgba(255,255,255,0) 48%, rgba(0,0,0,0) 64%, rgba(71,85,105,0.08) 100%)",
                "linear-gradient(180deg, rgba(71,85,105,0.04) 0%, rgba(255,255,255,0.18) 42%, rgba(255,255,255,0.12) 62%, rgba(71,85,105,0.05) 100%)",
                "linear-gradient(160deg, #eef1f3 0%, #e3e8ec 44%, #f1f3f5 100%)",
              ].join(", "),
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.86), inset 0 -1px 0 rgba(71,85,105,0.10)",
            }}
          >
            {displayedPriceRows.map((row) => {
              const getIndividualMetadata = (openingTrade?: PreviewTrade) => isIndividualLadderView && openingTrade
                ? {
                  // 成员只收到本人或被明确授予收益分配的订单；对这些已授权订单，
                  // 报价格底部应与管理员一致，完整显示账户、订单人及专项款。
                  accountName: getTradeAccountName(openingTrade),
                  relatedUserName: getTradeRelatedUserName(openingTrade),
                  relatedFundName: getTradeRelatedFundName(openingTrade),
                  instrumentShortLabel: getInstrumentShortLabel(openingTrade.instrumentType, openingTrade.optionExpiryDate),
                  option: openingTrade.instrumentType === "option"
                    ? {
                      direction: openingTrade.optionDirection,
                      expiryDate: openingTrade.optionExpiryDate,
                      strikePrice: openingTrade.price,
                      premium: openingTrade.optionPremium,
                      premiumCurrency: openingTrade.optionPremiumCurrency,
                      cachedMarkPrice: openingTrade.optionMarkPrice,
                    }
                    : undefined,
                }
                : undefined;
              const individualLongMetadata = getIndividualMetadata(row.longOpeningTrade);
              const individualShortMetadata = getIndividualMetadata(row.shortOpeningTrade);
              const resolveLockedDisplay = (bucket?: PositionBucket, openingTrade?: PreviewTrade) => {
                const lockedQuantity = openingTrade?.isLocked
                  ? bucket?.remainingQuantity ?? 0
                  : bucket?.lockedRemainingQuantity ?? 0;
                const hasLockedPosition = lockedQuantity > 0.0000001;
                return {
                  hasLockedPosition,
                  isFullyLocked: hasLockedPosition && Boolean(bucket) && lockedQuantity >= (bucket?.remainingQuantity ?? 0) - 0.0000001,
                };
              };
              const longLockDisplay = resolveLockedDisplay(row.long, row.longOpeningTrade);
              const shortLockDisplay = resolveLockedDisplay(row.short, row.shortOpeningTrade);
              // 逐笔报价按这张主单的固化分配快照判断；整合报价则同一档内含任一共享订单即提示。
              const hasProfitSharingAtSlot = (bucket: PositionBucket | undefined, side: PositionSide, openingTrade?: PreviewTrade) => {
                if (openingTrade) return hasOpeningProfitSharingWithOthers(profitShareSnapshots, getStoredEntryId(openingTrade));
                if (!bucket) return false;
                const archiveStep = isIndividualLadderView ? POSITION_ARCHIVE_STEP : integratedArchiveStep;
                return selectedTrades.some((trade) => (
                  ACTIONS[trade.action].opening
                  && ACTIONS[trade.action].side === side
                  && priceKey(archivePriceForTrade(trade, archiveStep)) === priceKey(bucket.price)
                  && hasOpeningProfitSharingWithOthers(profitShareSnapshots, getStoredEntryId(trade))
                ));
              };
              const longHasProfitSharing = hasProfitSharingAtSlot(row.long, "long", row.longOpeningTrade);
              const shortHasProfitSharing = hasProfitSharingAtSlot(row.short, "short", row.shortOpeningTrade);
              const isExactLivePrice = row.livePriceMarkerPlacement === "center";
              const isFloatingLivePrice = Boolean(
                markPrice
                && row.livePriceMarkerPlacement
                && row.livePriceMarkerPlacement !== "center",
              );
              const floatingMarkerStyle = row.livePriceMarkerPlacement === "above"
                ? { top: 0, transform: "translate(-50%, -50%)" }
                : { bottom: 0, transform: "translate(-50%, 50%)" };
              return (
                <div
                  key={row.key}
                  data-ladder-price={row.price}
                  className="grid grid-cols-[minmax(0,1fr)_64px_minmax(0,1fr)] min-h-[52px] border-b border-[#c7d0d7]/60 last:border-b-0"
                >
                {row.longReminder ? <ReminderPlaceholderCell reminder={row.longReminder} side="long" readOnly={!canManage} onActivate={() => openReopenReminderEntrySheet(row.longReminder!, isIndividualLadderView ? 'individual' : 'integrated')} /> : <LadderCell
                  bucket={row.long}
                  side="long"
                  markPrice={markPrice}
                  metadata={individualLongMetadata}
                  isLocked={longLockDisplay.isFullyLocked}
                  hasLockedPosition={longLockDisplay.hasLockedPosition}
                  isCounterparty={Boolean(row.long && row.longOpeningTrade?.isCounterpartyView)}
                  isPending={Boolean(row.long && row.longOpeningTrade?.isPending)}
                  keepReopenReminder={Boolean(row.long && row.longOpeningTrade?.keepReopenReminder)}
                  hasProfitSharing={longHasProfitSharing}
                  takeProfitEnabled={Boolean(row.long && row.longOpeningTrade?.takeProfitEnabled)}
                  takeProfitQuantity={row.longOpeningTrade ? getPendingTakeProfitQuantity(row.longOpeningTrade) : undefined}
                  readOnly={isMemberView}
                  onClose={() => {
                    if (!row.long) return;
                    // 不论整合或逐笔报价，已有多仓均进入同一报价详情页：
                    // 可新增多仓，并可对该价档内的老单逐笔编辑或卖出平仓。
                    // 逐笔行展示真实成交价的四舍五入整数，详情页/FIFO 则仍按十美元归档价定位。
                    openEntrySheet(
                      "openLong",
                      row.longOpeningTrade ? archivePriceForTrade(row.longOpeningTrade) : row.long.price,
                      isIndividualLadderView ? "individual" : "integrated",
                    );
                  }}
                  // 空档位新建订单也保留当前十美元档位作为“查看范围”；
                  // 最终归档仍只按实际录入成交价计算，绝不按点击格写入。
                  onOpen={() => openEntrySheet("openLong", row.price, isIndividualLadderView ? "individual" : "integrated")}
                />}
                <div
                  className="relative flex items-center justify-center overflow-visible border-x border-[#b9c2ca] px-0.5"
                  style={{
                    background: isExactLivePrice
                      ? priceTrend === "down"
                        ? [
                          "linear-gradient(135deg, rgba(255,255,255,0.50) 0%, rgba(255,255,255,0.15) 22%, rgba(255,255,255,0) 45%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.20) 100%)",
                          "linear-gradient(90deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.05) 38%, rgba(0,0,0,0) 58%, rgba(0,0,0,0.12) 100%)",
                          "linear-gradient(180deg, rgba(0,0,0,0.06) 0%, rgba(255,255,255,0.14) 35%, rgba(255,255,255,0.20) 50%, rgba(255,255,255,0.06) 70%, rgba(0,0,0,0.08) 100%)",
                          "linear-gradient(160deg, #064e3b 0%, #065f46 18%, #047857 40%, #059669 62%, #047857 80%, #064e3b 100%)",
                        ].join(", ")
                        : [
                          "linear-gradient(135deg, rgba(255,255,255,0.50) 0%, rgba(255,255,255,0.15) 22%, rgba(255,255,255,0) 45%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.20) 100%)",
                          "linear-gradient(90deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.05) 38%, rgba(0,0,0,0) 58%, rgba(0,0,0,0.12) 100%)",
                          "linear-gradient(180deg, rgba(0,0,0,0.06) 0%, rgba(255,255,255,0.14) 35%, rgba(255,255,255,0.20) 50%, rgba(255,255,255,0.06) 70%, rgba(0,0,0,0.08) 100%)",
                          "linear-gradient(160deg, #7f1d1d 0%, #991b1b 18%, #b91c1c 40%, #dc2626 62%, #b91c1c 80%, #7f1d1d 100%)",
                        ].join(", ")
                      : "linear-gradient(90deg, rgba(210,217,224,0.94), rgba(244,247,249,0.98) 48%, rgba(205,213,220,0.94))",
                    boxShadow: isExactLivePrice
                      ? priceTrend === "down"
                        ? "inset 0 1.5px 0 rgba(167,243,208,0.88), inset 0 -1.5px 0 rgba(2,44,34,0.62), inset 1.5px 0 rgba(110,231,183,0.28), inset -1.5px 0 rgba(0,0,0,0.16)"
                        : "inset 0 1.5px 0 rgba(254,202,202,0.88), inset 0 -1.5px 0 rgba(69,10,10,0.62), inset 1.5px 0 rgba(252,165,165,0.28), inset -1.5px 0 rgba(0,0,0,0.16)"
                      : "inset 1px 0 0 rgba(255,255,255,0.84), inset -1px 0 0 rgba(71,85,105,0.22), inset 0 1px 0 rgba(255,255,255,0.76)",
                  }}
                >
                  <span className={`text-[13px] tabular-nums font-bold ${isExactLivePrice ? (priceTrend === "down" ? "text-emerald-50" : "text-rose-50") : "text-slate-800"}`} style={{ textShadow: isExactLivePrice ? "0 1px 2px rgba(0,0,0,0.60), 0 -0.5px 1px rgba(255,255,255,0.22)" : "-0.55px -0.55px 0 rgba(255,255,255,0.92), 0.75px 0.75px 0 rgba(71,85,105,0.28)" }}>
                    {isExactLivePrice && markPrice ? (() => {
                      const { integerPart, fractionalPart } = splitLadderMarkPrice(markPrice);
                      return (
                        <span className="inline-flex items-baseline whitespace-nowrap" aria-label={`${integerPart}.${fractionalPart}`}>
                          <span>{integerPart}</span>
                          <span className="-ml-px text-[8px] font-semibold leading-none tracking-tight opacity-95">.{fractionalPart}</span>
                        </span>
                      );
                    })() : isIndividualLadderView ? (() => {
                      const { integerPart, fractionalPart } = splitLadderMarkPrice(row.price);
                      return (
                        <span className="inline-flex items-baseline whitespace-nowrap" aria-label={`${integerPart}.${fractionalPart}`}>
                          <span>{integerPart}</span>
                          <span className="-ml-px text-[8px] font-semibold leading-none tracking-tight opacity-80">.{fractionalPart}</span>
                        </span>
                      );
                    })() : formatLadderPrice(row.price)}
                  </span>
                  {isFloatingLivePrice && markPrice && (() => {
                    const { integerPart, fractionalPart } = splitLadderMarkPrice(markPrice);
                    const isDown = priceTrend === "down";
                    return (
                      <span
                        aria-label={`实时参考价 ${integerPart}.${fractionalPart}`}
                        className={`pointer-events-none absolute left-1/2 z-10 inline-flex items-baseline whitespace-nowrap rounded-[3px] border px-1 py-px text-[10px] font-bold tabular-nums ${isDown ? "border-emerald-900 bg-emerald-700 text-emerald-50" : "border-rose-900 bg-rose-700 text-rose-50"}`}
                        style={{
                          ...floatingMarkerStyle,
                          boxShadow: isDown
                            ? "0 1px 2px rgba(2,44,34,0.48), inset 0 1px 0 rgba(167,243,208,0.34)"
                            : "0 1px 2px rgba(69,10,10,0.48), inset 0 1px 0 rgba(254,202,202,0.34)",
                          textShadow: "0 1px 1px rgba(0,0,0,0.42)",
                        }}
                      >
                        <span>{integerPart}</span>
                        <span className="-ml-px text-[8px] font-semibold leading-none tracking-tight opacity-95">.{fractionalPart}</span>
                      </span>
                    );
                  })()}
                </div>
                {row.shortReminder ? <ReminderPlaceholderCell reminder={row.shortReminder} side="short" readOnly={!canManage} onActivate={() => openReopenReminderEntrySheet(row.shortReminder!, isIndividualLadderView ? "individual" : "integrated")} /> : <LadderCell
                  bucket={row.short}
                  side="short"
                  markPrice={markPrice}
                  metadata={individualShortMetadata}
                  isLocked={shortLockDisplay.isFullyLocked}
                  hasLockedPosition={shortLockDisplay.hasLockedPosition}
                  isCounterparty={Boolean(row.short && row.shortOpeningTrade?.isCounterpartyView)}
                  isPending={Boolean(row.short && row.shortOpeningTrade?.isPending)}
                  keepReopenReminder={Boolean(row.short && row.shortOpeningTrade?.keepReopenReminder)}
                  hasProfitSharing={shortHasProfitSharing}
                  takeProfitEnabled={Boolean(row.short && row.shortOpeningTrade?.takeProfitEnabled)}
                  takeProfitQuantity={row.shortOpeningTrade ? getPendingTakeProfitQuantity(row.shortOpeningTrade) : undefined}
                  readOnly={isMemberView}
                  onClose={() => {
                    if (!row.short) return;
                    // 不论整合或逐笔报价，已有空仓均进入同一报价详情页：
                    // 可新增空仓，并可对该价档内的老单逐笔编辑或买入平仓。
                    // 逐笔行展示真实成交价的四舍五入整数，详情页/FIFO 则仍按十美元归档价定位。
                    openEntrySheet(
                      "openShort",
                      row.shortOpeningTrade ? archivePriceForTrade(row.shortOpeningTrade) : row.short.price,
                      isIndividualLadderView ? "individual" : "integrated",
                    );
                  }}
                  // 同上：从空仓空档位开单时，详情只展示当前空仓价格档的订单。
                  onOpen={() => openEntrySheet("openShort", row.price, isIndividualLadderView ? "individual" : "integrated")}
                />}
                </div>
              );
            })}
          </div>
        </section>

        <section
          ref={profitableHistoryExportRef}
          className="overflow-hidden rounded border border-[#b9c2ca] shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
          style={{
            background: [
              "linear-gradient(135deg, rgba(255,255,255,0.52) 0%, rgba(255,255,255,0.12) 24%, rgba(255,255,255,0) 48%, rgba(0,0,0,0) 64%, rgba(71,85,105,0.07) 100%)",
              "linear-gradient(180deg, rgba(71,85,105,0.04) 0%, rgba(255,255,255,0.14) 42%, rgba(255,255,255,0.10) 62%, rgba(71,85,105,0.05) 100%)",
              "linear-gradient(160deg, #edf0f2 0%, #e1e6ea 48%, #eff2f4 100%)",
            ].join(", "),
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.88), inset 0 -1px 0 rgba(71,85,105,0.12)",
          }}
        >
          <div
            className="relative flex items-center justify-center border-b border-[#c7d0d7]/80 px-4 py-2.5"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.58), rgba(208,215,221,0.34))",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.78), inset 0 -1px 0 rgba(71,85,105,0.10)",
            }}
          >
            <span className="inline-flex items-baseline gap-1.5 text-[13px] font-semibold tracking-[0.08em] text-slate-700" style={{ textShadow: "-0.4px -0.4px 0 rgba(255,255,255,0.88), 0.55px 0.55px 0 rgba(71,85,105,0.18)" }}>
              历史记录
              <span className="text-[11px] font-medium tracking-normal text-slate-500">{historyListItemCount} 笔</span>
            </span>
            {canManage && historyPerspectiveTargetUserId > 0 && <button
              type="button"
              data-card-export-hide="true"
              aria-pressed={isHistoryUserPerspective}
              aria-label={isHistoryUserPerspective ? "切换为管理员视角" : "切换为用户视角"}
              title={isHistoryUserPerspective ? "切换为管理员视角" : "切换为用户视角"}
              onClick={() => {
                const nextPresentation = historyPresentation === "admin" ? "member" : "admin";
                setHistoryPresentation(nextPresentation);
                if (nextPresentation === "member") {
                  setHistoryIncomeKindFilterIds(historyMemberIncomeKindFilterOptions.map((option) => option.id));
                  setHistoryIncomeSourceFilterIds([]);
                  setShowOnlyProfitableHistory(false);
                  setShowOnlySharedIncomeHistory(false);
                  setShowLinkedJournalGroups(false);
                }
                setHistoryActionMenuTradeId(null);
                setNetProfitDetail(null);
                setShowHistoryFilters(false);
                setRecentJournalPage(1);
                focusHistoryOnMobile();
              }}
              className={`absolute right-4 h-6 rounded-[3px] border px-2 text-[11px] font-medium transition-colors active:scale-95 ${isHistoryUserPerspective ? "border-[#1a56db] bg-[#1a56db] text-white" : "border-[#c7d0d7] bg-white/40 text-slate-600"}`}
            >
              {isHistoryUserPerspective ? "用户视角" : "管理员视角"}
            </button>}
          </div>
          <div>
              <div
                data-card-export-hide="true"
                className="border-b border-[#c7d0d7]/70 px-2 py-1.5 sm:px-3 sm:py-2"
                style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.30), rgba(208,215,221,0.16))" }}
              >
                <div className="flex flex-nowrap items-center gap-0.5 overflow-x-auto [scrollbar-width:none] sm:gap-1" role="group" aria-label="历史记录动作筛选">
                  {historyHasIncomeCategoryToolbar ? <>
                    {historyMemberIncomeKindFilterOptions.length > 0 && <>
                      <button
                        type="button"
                        aria-pressed={historyIncomeSourceFilterIds.length === 0 && historyMemberIncomeKindFilterOptions.every((option) => historyIncomeKindFilterIds.includes(option.id))}
                        onClick={() => {
                          setHistoryIncomeKindFilterIds(historyMemberIncomeKindFilterOptions.map((option) => option.id));
                          setHistoryIncomeSourceFilterIds([]);
                          setShowOnlyProfitableHistory(false);
                          setShowOnlySharedIncomeHistory(false);
                          setShowLinkedJournalGroups(false);
                          setJournalActionFilters(new Set(availableJournalActions));
                          setRecentJournalPage(1);
                          focusHistoryOnMobile();
                        }}
                        className={`h-[22px] shrink-0 whitespace-nowrap rounded-[3px] border px-1 text-[10px] font-medium leading-none transition-colors active:scale-95 ${historyIncomeSourceFilterIds.length === 0 && historyMemberIncomeKindFilterOptions.every((option) => historyIncomeKindFilterIds.includes(option.id)) ? "border-[#75818c] bg-[#75818c] text-white" : "border-[#c7d0d7] bg-white/28 text-slate-600"}`}
                      >
                        全部
                      </button>
                      {historyMemberIncomeKindFilterOptions.map((option) => {
                        const selected = historyIncomeKindFilterIds.length === 1 && historyIncomeKindFilterIds[0] === option.id && historyIncomeSourceFilterIds.length === 0;
                        const activeClass = option.id === "order"
                          ? "border-blue-600 bg-blue-600 text-white"
                          : option.id === "commission"
                            ? "border-amber-500 bg-amber-500 text-white"
                            : "border-emerald-600 bg-emerald-600 text-white";
                        return <button
                          key={option.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => {
                            setHistoryIncomeKindFilterIds([option.id]);
                            setHistoryIncomeSourceFilterIds([]);
                            setShowOnlyProfitableHistory(false);
                            setShowOnlySharedIncomeHistory(false);
                            setShowLinkedJournalGroups(false);
                            setJournalActionFilters(new Set(availableJournalActions));
                            setRecentJournalPage(1);
                            focusHistoryOnMobile();
                          }}
                          className={`h-[22px] shrink-0 whitespace-nowrap rounded-[3px] border px-1 text-[10px] font-medium leading-none transition-colors active:scale-95 ${selected ? activeClass : "border-[#c7d0d7] bg-white/28 text-slate-600"}`}
                        >
                          {option.label}
                        </button>;
                      })}
                    </>}
                    {RECENT_JOURNAL_ACTIONS.map((action) => {
                      const available = availableJournalActions.includes(action);
                      const selected = !showLinkedJournalGroups
                        && historyIncomeKindFilterIds.length === 0
                        && historyIncomeSourceFilterIds.length === 0
                        && journalActionFilters.size === 1
                        && journalActionFilters.has(action);
                      return <button
                        key={`income-history-${action}`}
                        type="button"
                        disabled={!available}
                        aria-pressed={selected}
                        title={available ? `仅看${ACTIONS[action].label}记录` : `暂无${ACTIONS[action].label}记录`}
                        onClick={() => {
                          setShowOnlyProfitableHistory(false);
                          setShowOnlySharedIncomeHistory(false);
                          setShowLinkedJournalGroups(false);
                          selectJournalActionFilter(action);
                          focusHistoryOnMobile();
                        }}
                        className={`h-[22px] shrink-0 whitespace-nowrap rounded-[3px] border px-1 text-[10px] font-medium leading-none transition-colors active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 ${selected ? ACTIONS[action].activeClass : "border-[#c7d0d7] bg-white/28 text-slate-600"}`}
                      >
                        {ACTIONS[action].label}
                      </button>;
                    })}
                    <button
                      type="button"
                      disabled={!hasLinkedJournalPairs}
                      aria-pressed={showLinkedJournalGroups}
                      title={hasLinkedJournalPairs ? "查看开平仓关联链路" : "暂无可关联的开平仓记录"}
                      onClick={() => {
                        setHistoryIncomeKindFilterIds([]);
                        setHistoryIncomeSourceFilterIds([]);
                        setShowOnlyProfitableHistory(false);
                        setShowOnlySharedIncomeHistory(false);
                        setJournalActionFilters(new Set(availableJournalActions));
                        setShowLinkedJournalGroups((current) => !current);
                        setRecentJournalPage(1);
                        focusHistoryOnMobile();
                      }}
                      className={`h-[22px] shrink-0 whitespace-nowrap rounded-[3px] border px-1 text-[10px] font-medium leading-none transition-colors active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 ${showLinkedJournalGroups ? "border-[#75818c] bg-[#75818c] text-white" : "border-[#c7d0d7] bg-white/28 text-slate-600"}`}
                    >
                      关联
                    </button>
                  </> : <>
                  {availableJournalActions.length > 1 && <button
                    type="button"
                    aria-pressed={allJournalActionsSelected && !showOnlyProfitableHistory && !showOnlySharedIncomeHistory && !showLinkedJournalGroups}
                    onClick={() => {
                      setShowOnlyProfitableHistory(false);
                      setShowOnlySharedIncomeHistory(false);
                      setShowLinkedJournalGroups(false);
                      setJournalActionFilters(new Set(availableJournalActions));
                      setRecentJournalPage(1);
                      focusHistoryOnMobile();
                    }}
                    className={`h-[22px] shrink-0 whitespace-nowrap rounded-[3px] border px-1 text-[10px] font-medium leading-none transition-colors active:scale-95 ${allJournalActionsSelected && !showOnlyProfitableHistory && !showOnlySharedIncomeHistory && !showLinkedJournalGroups ? "border-[#75818c] bg-[#75818c] text-white" : "border-[#c7d0d7] bg-white/28 text-slate-600"}`}
                  >
                    全部
                  </button>}
                  <button
                    type="button"
                    aria-pressed={showOnlyProfitableHistory}
                    aria-label="仅显示盈利的平多与平空记录"
                    title="仅显示净收益大于 0 的平多与平空记录"
                    onClick={() => {
                      setShowOnlyProfitableHistory((current) => !current);
                      setShowOnlySharedIncomeHistory(false);
                      setShowLinkedJournalGroups(false);
                      // 进入“盈利”时必须同时覆盖平多和平空，不能继承此前单一动作的筛选。
                      setJournalActionFilters(new Set(availableJournalActions));
                      setRecentJournalPage(1);
                      focusHistoryOnMobile();
                    }}
                    className={`h-[22px] shrink-0 whitespace-nowrap rounded-[3px] border px-1 text-[10px] font-medium leading-none transition-colors active:scale-95 ${showOnlyProfitableHistory ? "border-rose-600 bg-rose-700 text-white" : "border-[#c7d0d7] bg-white/28 text-slate-600"}`}
                  >
                    盈利
                  </button>
                  {hasSharedIncomeHistory && <button
                    type="button"
                    aria-pressed={showOnlySharedIncomeHistory}
                    aria-label="仅显示共享收益记录"
                    title="仅显示当前用户获得过共享收益的记录"
                    onClick={() => {
                      setShowOnlyProfitableHistory(false);
                      setShowLinkedJournalGroups(false);
                      setJournalActionFilters(new Set(availableJournalActions));
                      setShowOnlySharedIncomeHistory((current) => !current);
                      setRecentJournalPage(1);
                      focusHistoryOnMobile();
                    }}
                    className={`h-[22px] shrink-0 whitespace-nowrap rounded-[3px] border px-1 text-[10px] font-medium leading-none transition-colors active:scale-95 ${showOnlySharedIncomeHistory ? "border-blue-600 bg-blue-600 text-white" : "border-[#c7d0d7] bg-white/28 text-slate-600"}`}
                  >
                    共享
                  </button>}
                  {availableJournalActions.map((action) => {
                    const selected = !showOnlyProfitableHistory
                      && !showOnlySharedIncomeHistory
                      && !showLinkedJournalGroups
                      && !allJournalActionsSelected
                      && journalActionFilters.has(action);
                    return (
                      <button
                        key={action}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          setShowOnlyProfitableHistory(false);
                          setShowOnlySharedIncomeHistory(false);
                          setShowLinkedJournalGroups(false);
                          selectJournalActionFilter(action);
                          focusHistoryOnMobile();
                        }}
                        className={`h-[22px] shrink-0 whitespace-nowrap rounded-[3px] border px-1 text-[10px] font-medium leading-none transition-colors active:scale-95 ${selected ? ACTIONS[action].activeClass : "border-[#c7d0d7] bg-white/28 text-slate-600"}`}
                      >
                        {ACTIONS[action].label}
                      </button>
                    );
                  })}
                  {hasLinkedJournalPairs && <button
                    type="button"
                    aria-pressed={showLinkedJournalGroups}
                    onClick={() => {
                      setShowOnlyProfitableHistory(false);
                      setShowOnlySharedIncomeHistory(false);
                      setJournalActionFilters(new Set(availableJournalActions));
                      setShowLinkedJournalGroups((current) => !current);
                      setRecentJournalPage(1);
                      focusHistoryOnMobile();
                    }}
                    className={`h-[22px] shrink-0 whitespace-nowrap rounded-[3px] border px-1 text-[10px] font-medium leading-none transition-colors active:scale-95 ${showLinkedJournalGroups ? "border-[#75818c] bg-[#75818c] text-white" : "border-[#c7d0d7] bg-white/28 text-slate-600"}`}
                    >
                      关联
                    </button>}
                  </>}
                  {((canManage && !isHistoryUserPerspective) || canFilterMemberHistoryIncome) && <button
                    type="button"
                    aria-label={showHistoryFilters ? "收起并清空历史筛选" : historyUsesIncomeCategories ? "筛选收益类别和名字" : "筛选历史记录"}
                    aria-expanded={showHistoryFilters}
                    title={showHistoryFilters ? "收起并恢复全部" : historyUsesIncomeCategories ? "筛选收益类别和名字" : "筛选历史记录"}
                    onClick={() => {
                      if (showHistoryFilters) {
                        if (historyUsesIncomeCategories) {
                          // 单选用户时恢复“全部收益”，不能回到混入开仓、挂单的旧操作流水。
                          setHistoryIncomeKindFilterIds(historyMemberIncomeKindFilterOptions.map((option) => option.id));
                          setHistoryIncomeSourceFilterIds([]);
                        } else {
                          // 第二次点击在收起面板的同时清空五项条件，快速回到全部历史记录。
                          setHistoryAccountFilterIds([]);
                          setHistoryRelatedUserFilterIds([]);
                          setHistoryRelatedFundFilterIds([]);
                          setHistoryInstrumentTypeFilterIds([]);
                          setHistoryExecutionFilter("all");
                          setHistoryHideLocked(false);
                        }
                        setRecentJournalPage(1);
                        setShowHistoryFilters(false);
                        focusHistoryOnMobile();
                        return;
                      }
                      setShowHistoryFilters(true);
                      focusHistoryOnMobile();
                    }}
                    className={`ml-0.5 flex shrink-0 items-center justify-center rounded-[3px] border font-medium leading-none transition-colors active:scale-95 ${historyUsesIncomeCategories ? "h-[22px] px-1 text-[10px]" : "h-6 w-7"} ${showHistoryFilters || hasActiveHistoryDetailFilters ? "border-[#1a56db] bg-[#1a56db] text-white" : "border-[#c7d0d7] bg-white/28 text-slate-600"}`}
                  >
                    {historyUsesIncomeCategories ? "筛选" : <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={2.25} />}
                  </button>}
                  {(showOnlyProfitableHistory || showOnlySharedIncomeHistory || showLinkedJournalGroups) && <div data-card-export-hide="true" className="ml-auto flex shrink-0 items-center">
                    <OrderCardImageDownload
                      targetRef={profitableHistoryExportRef}
                      currentUser={me as any}
                      orderNo={showLinkedJournalGroups ? "关联历史" : showOnlySharedIncomeHistory ? "共享收益历史" : "盈利历史"}
                      filenamePrefix={showLinkedJournalGroups ? "52号账本T0关联" : showOnlySharedIncomeHistory ? "52号账本T0共享收益" : "52号账本T0盈利"}
                      previewTitle={showLinkedJournalGroups ? "T+0关联历史记录图片预览" : showOnlySharedIncomeHistory ? "T+0共享收益记录图片预览" : "T+0盈利历史记录图片预览"}
                      previewHint={showLinkedJournalGroups
                        ? "仅包含当前关联历史记录；筛选菜单与管理控件已隐藏"
                        : showOnlySharedIncomeHistory
                          ? "仅包含当前用户获得的共享收益记录；筛选菜单与管理控件已隐藏"
                        : "仅包含当前筛选结果的历史记录；筛选菜单与管理控件已隐藏"}
                      color="#111827"
                      outerPadding={12}
                      captureFullContent
                      exportBackground="#F8FAFC"
                      variant="bare"
                      watermarkOpacity={0.045}
                    />
                  </div>}
                </div>
              </div>
              {showHistoryFilters && ((canManage && !isHistoryUserPerspective) || canFilterMemberHistoryIncome) && <div
                data-card-export-hide="true"
                className="relative z-20 border-b border-[#c7d0d7]/70 px-4 py-2.5"
                style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.52), rgba(208,215,221,0.28))" }}
              >
                {historyUsesIncomeCategories ? <div className="space-y-1.5">
                  <div className="grid grid-cols-2 gap-1.5">
                    <T0MultiSelect
                      label="收益"
                      options={historyMemberIncomeKindFilterOptions}
                      selectedIds={historyIncomeKindFilterIds}
                      emptyLabel="暂无收益类别"
                      toolbar
                      onChange={(ids) => {
                        setHistoryIncomeKindFilterIds(ids.length > 0 ? ids : historyMemberIncomeKindFilterOptions.map((option) => option.id));
                        setRecentJournalPage(1);
                        focusHistoryOnMobile();
                      }}
                    />
                    <T0MultiSelect
                      label="名字"
                      options={historyMemberIncomeSourceFilterOptions}
                      selectedIds={historyIncomeSourceFilterIds}
                      emptyLabel="暂无具名分佣"
                      toolbar
                      align="right"
                      onChange={(ids) => {
                        setHistoryIncomeSourceFilterIds(ids);
                        setRecentJournalPage(1);
                        focusHistoryOnMobile();
                      }}
                    />
                  </div>
                  {historyMemberIncomeFilterSummary && <p className="px-0.5 text-[10px] leading-4 text-slate-500">
                    加总 <b className="font-semibold tabular-nums text-slate-700">{historyMemberIncomeFilterSummary.count} 笔</b>
                    <span className="mx-1 text-slate-300">|</span>
                    <b className={`font-semibold tabular-nums ${historyMemberIncomeFilterSummary.totalNetPnl >= 0 ? "text-rose-600" : "text-emerald-600"}`}>
                      {formatSigned(historyMemberIncomeFilterSummary.totalNetPnl)} u
                    </b>
                  </p>}
                </div> : <>
                <div
                  data-t0-filter-row
                  className={`grid gap-1.5 transition-[grid-template-columns] duration-200 ${isMemberView ? "grid-cols-2" : "grid-cols-3"}`}
                  style={{ gridTemplateColumns: historyFilterGridTemplateColumns }}
                >
                  {!isMemberView && <T0MultiSelect
                    label="账户"
                    options={accountFilterOptions}
                    selectedIds={historyAccountFilterIds}
                    emptyLabel="暂无账户"
                    onChange={(ids) => {
                      setHistoryAccountFilterIds(ids);
                      setRecentJournalPage(1);
                    }}
                  />}
                  <T0MultiSelect
                    label="用户"
                    options={relatedUserFilterOptions}
                    selectedIds={historyRelatedUserFilterIds}
                    emptyLabel="暂无用户"
                    constrainRightToFilterRow
                    treatSelectionAsAll={historyRelatedUserSelectionIsAll}
                    onChange={(ids) => {
                      setHistoryRelatedUserFilterIds(ids);
                      // 项目只属于用户，切换用户范围时同步清空旧项目条件。
                      setHistoryRelatedFundFilterIds([]);
                      setRecentJournalPage(1);
                    }}
                  />
                  <T0MultiSelect
                    label="项目"
                    options={historyRelatedFundFilterOptions}
                    selectedIds={historyRelatedFundFilterIds}
                    emptyLabel="暂无项目"
                    align="right"
                    onChange={(ids) => {
                      setHistoryRelatedFundFilterIds(ids);
                      setRecentJournalPage(1);
                    }}
                  />
                </div>
                <div
                  className="mt-2 grid grid-cols-2 gap-2 transition-[grid-template-columns] duration-200"
                  style={{ gridTemplateColumns: historyTypeStatusGridTemplateColumns }}
                >
                  <T0MultiSelect
                    label="类型"
                    options={T0_INSTRUMENT_FILTER_OPTIONS}
                    selectedIds={historyInstrumentTypeFilterIds}
                    emptyLabel="暂无类型"
                    compact
                    showSelectedLabels
                    onChange={(ids) => {
                        setHistoryInstrumentTypeFilterIds(normalizeT0InstrumentTypeFilterIds(ids));
                        setRecentJournalPage(1);
                    }}
                  />
                  <T0MultiSelect
                    label="状态"
                    options={T0_EXECUTION_FILTER_OPTIONS}
                    selectedIds={historyExecutionFilter === "all" ? [] : [historyExecutionFilter]}
                    emptyLabel="暂无状态"
                    compact
                    align="right"
                    singleSelect
                    summarySuffix={historyHideLocked ? "隐藏已锁定" : undefined}
                    additionalToggle={{
                      label: "隐藏已锁定",
                      checked: historyHideLocked,
                      onCheckedChange: (checked) => {
                        setHistoryHideLocked(checked);
                        setRecentJournalPage(1);
                      },
                    }}
                    onChange={(ids) => {
                      const value = ids[0];
                      setHistoryExecutionFilter(value === "filled" || value === "pending" ? value : "all");
                      setRecentJournalPage(1);
                    }}
                  />
                </div>
                </>}
              </div>}
              {historyListItemCount === 0 ? (
                <div className="px-4 py-5 text-center text-xs text-slate-500">当前筛选范围还没有历史记录</div>
              ) : showLinkedJournalGroups ? (
                pagedLinkedJournalGroups.map((group) => renderLinkedJournalGroup(group))
              ) : isGlobalHistoryIncomeView ? (
                pagedGlobalHistoryIncomeEntries.map((entry) => {
                  const referenceTrade = entry.trade ?? entry.sourceTrade;
                  const isLong = referenceTrade ? ACTIONS[referenceTrade.action].side === "long" : true;
                  const typeLabel = entry.kind === "shared" ? "共享" : entry.kind === "commission" ? "佣金" : "订单";
                  const typeClass = entry.kind === "shared"
                    ? "text-blue-600"
                    : entry.kind === "commission"
                      ? "text-indigo-600"
                      : isLong ? "text-rose-600" : "text-emerald-600";
                  const displayQuantity = entry.quantity ?? referenceTrade?.quantity;
                  const recipientLabel = entry.recipientName
                    || (referenceTrade ? getTradeRelatedUserName(referenceTrade) : "未关联用户");
                  return <div key={entry.id} className="border-b border-[#c7d0d7]/60 px-4 py-2.5 last:border-b-0">
                    <div className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap text-xs tabular-nums">
                      <div className="flex min-w-0 items-baseline gap-x-1.5 overflow-hidden">
                        <span className={`shrink-0 font-semibold ${typeClass}`} title={recipientLabel}>{typeLabel}</span>
                        <span className="shrink-0 font-medium text-slate-800">{displayQuantity === undefined ? "—" : `${formatQuantity(displayQuantity)}E`}</span>
                        {referenceTrade && <span className="shrink-0 text-slate-600">{isLong ? "卖" : "买"}{formatPrice(referenceTrade.price)}</span>}
                      </div>
                      <span aria-hidden="true" className="min-w-2 flex-1 translate-y-[-1px] border-t border-dotted border-slate-400/80" />
                      <span className={`shrink-0 border-b border-dotted pb-0.5 font-semibold ${entry.amount >= 0 ? "border-rose-500 text-rose-600" : "border-emerald-500 text-emerald-600"}`}>{formatSigned(entry.amount)}<span className="ml-0.5 text-slate-500">u</span></span>
                    </div>
                    <div className="mt-1 flex min-w-0 items-center gap-1 overflow-hidden text-[10px] leading-4 text-slate-500">
                      {referenceTrade && <><span className="min-w-0 truncate" title={getTradeAccountName(referenceTrade)}>{getTradeAccountName(referenceTrade)}</span><span className="text-slate-300">·</span></>}
                      <span className="min-w-0 truncate" title={recipientLabel}>{entry.kind === "order" ? `订单归属 · ${recipientLabel}` : entry.kind === "commission" ? `佣金归属 · ${recipientLabel}` : `共享到账 · ${recipientLabel}`}</span>
                      <span className="text-slate-300">·</span>
                      <span className="ml-auto shrink-0">{formatBeijingMonthDayTime(entry.createdAt)}</span>
                    </div>
                  </div>;
                })
              ) : pagedRecentJournalTrades.map((trade) => {
                const detail = getHistoricalTradeDetail(trade);
                const isOpening = ACTIONS[trade.action].opening;
                const isLong = ACTIONS[trade.action].side === "long";
                const historyIncomeKind = trade.historyIncomeKind;
                const isSharedIncomeOnly = trade.isSharedIncomeOnly === true;
                const sharedIncomeAmount = Math.max(0, Number(trade.sharedIncomeAmount || 0));
                const isSharedIncomePerspective = historyIncomeKind === "shared" || sharedIncomeAmount > 0;
                const displayDetail = detail ?? (isSharedIncomePerspective ? { netPnl: 0 } : undefined);
                const showFullHistoryContext = hasSystemGeneratedSettlementNote(trade.note);
                const isAutomaticTakeProfit = trade.note?.includes("[系统自动止盈]") ?? false;
                const viewerPayout = resolveHistoryViewerPayout(trade, detail);
                const displayedNetPnl = viewerPayout?.netPnl ?? detail?.netPnl;
                const isSingleUserIncomePresentation = historyIsMemberPresentation || selectedAdminHistoryUserId > 0;
                const payoutPresentation = isSingleUserIncomePresentation || isSharedIncomeOnly ? "member" : "admin";
                const payoutViewerUserId = historyIsMemberPresentation
                  ? (isHistoryUserPerspective ? historyPerspectiveTargetUserId : viewerProfitShareBeneficiaryUserId)
                  : (selectedAdminHistoryUserId || undefined);
                const hideRepeatedSettlementPrices = isSingleUserIncomePresentation && Boolean(viewerPayout);
                const sharedClosingPriceLabel = isLong ? "卖" : "买";
                const historyActionLabel = isSharedIncomeOnly
                  ? "共享到账"
                  : historyIncomeKind === "commission"
                  ? "分佣"
                  : historyIncomeKind === "shared"
                    ? "共享"
                    : ACTIONS[trade.action].label;
                const isSplitIncomeDisplay = Boolean(historyIncomeKind);
                return (
                <div key={trade.id} className="border-b border-[#c7d0d7]/60 px-4 py-2.5 last:border-b-0">
                    <div className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap text-xs tabular-nums">
                      <div className="flex min-w-0 items-baseline gap-x-1.5 overflow-hidden">
                        <span className={`shrink-0 font-semibold ${isSplitIncomeDisplay ? "text-blue-600" : isLong ? "text-rose-600" : "text-emerald-600"}`}>{historyActionLabel}</span>
                        {isAutomaticTakeProfit && <Target className="h-3.5 w-3.5 shrink-0 text-emerald-600" strokeWidth={2.5} aria-label="系统自动止盈" />}
                        {isSharedIncomeOnly ? <span className="shrink-0 text-[10px] font-medium text-slate-400">来源平仓记录缺失</span> : <>
                          <span className="shrink-0 font-medium text-slate-800">{formatQuantity(trade.quantity)}E</span>
                          {(isSplitIncomeDisplay || isSharedIncomePerspective) && !isOpening && <span className="shrink-0 text-slate-600">{sharedClosingPriceLabel}{formatPrice(trade.price)}</span>}
                        </>}
                        {trade.isPending && <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-sky-700"><Clock3 className="h-3 w-3" />挂单</span>}
                        {!hideRepeatedSettlementPrices && detail?.buyPrice !== undefined && <span className="shrink-0 text-slate-600">买{detail.buyQuote ?? formatPrice(detail.buyPrice)}</span>}
                        {!hideRepeatedSettlementPrices && detail?.sellPrice !== undefined && <span className="shrink-0 text-slate-600">卖{detail.sellQuote ?? formatPrice(detail.sellPrice)}</span>}
                        {!hideRepeatedSettlementPrices && detail?.isOptionQuote && <span className="shrink-0 text-violet-700">行权{formatPrice(trade.price)}</span>}
                        {!detail && !isSharedIncomePerspective && <span className="shrink-0 text-slate-600">{isLong ? "买" : "卖"}{formatPrice(trade.price)}</span>}
                        {trade.isSyncing && <span className="shrink-0 text-amber-600">保存中</span>}
                      </div>
                      {!isOpening && displayDetail && displayedNetPnl !== undefined && <>
                        <span aria-hidden="true" className="min-w-2 flex-1 translate-y-[-1px] border-t border-dotted border-slate-400/80" />
                        <button
                          type="button"
                          onClick={() => setNetProfitDetail({
                            trade,
                            detail: displayDetail,
                            presentation: payoutPresentation,
                            viewerUserId: payoutPresentation === "member" ? payoutViewerUserId : undefined,
                          })}
                          className={`shrink-0 border-b border-dotted pb-0.5 font-semibold outline-none ${displayedNetPnl >= 0 ? "border-rose-500 text-rose-600" : "border-emerald-500 text-emerald-600"}`}
                          aria-label={viewerPayout ? (isSingleUserIncomePresentation ? "查看本单可得明细" : "查看本单分成与全体分佣明细") : "查看净利润计算明细"}
                        >
                          {formatSigned(displayedNetPnl)}<span className="ml-0.5 text-slate-500">u</span>
                        </button>
                      </>}
                    </div>
                    <div className={getHistoryContextLayoutClass(showFullHistoryContext)}>
                      {!historyIsMemberPresentation && <>
                        <span className={getHistoryContextValueClass(showFullHistoryContext)} title={getTradeAccountName(trade)}>{getTradeAccountName(trade)}</span>
                        <span className="text-slate-300">·</span>
                      </>}
                      {isSharedIncomeOnly ? <>
                        <span className={getHistoryContextValueClass(showFullHistoryContext)}>共享到账</span>
                        <span className="text-slate-300">·</span>
                      </> : historyIncomeKind === "commission" ? <>
                        <span className={getHistoryContextValueClass(showFullHistoryContext)} title={getTradeRelatedUserName(trade)}>{getTradeRelatedUserName(trade)}</span>
                        <span className="text-slate-300">·</span>
                        <span className={getHistoryContextValueClass(showFullHistoryContext)} title={getTradeRelatedFundName(trade)}>{getTradeRelatedFundName(trade)}</span>
                        <span className="text-slate-300">·</span>
                      </> : historyIncomeKind === "shared" ? <>
                        <span className={getHistoryContextValueClass(showFullHistoryContext)}>共享收益</span>
                        <span className="text-slate-300">·</span>
                      </> : isSharedIncomePerspective ? <>
                        <span className={getHistoryContextValueClass(showFullHistoryContext)}>共享收益</span>
                        <span className="text-slate-300">·</span>
                      </> : <>
                        <span className={getHistoryContextValueClass(showFullHistoryContext)} title={getTradeRelatedUserName(trade)}>{getTradeRelatedUserName(trade)}</span>
                        <span className="text-slate-300">·</span>
                        <span className={getHistoryContextValueClass(showFullHistoryContext)} title={getTradeRelatedFundName(trade)}>{getTradeRelatedFundName(trade)}</span>
                        <span className="text-slate-300">·</span>
                      </>}
                      <span className="shrink-0">{formatT0TradeTimeline(trade)}</span>
                      {canManage && !historyIsMemberPresentation && !isSplitIncomeDisplay && !isSharedIncomeOnly ? renderHistoryActionMenuButton(trade) : !isOpening && displayDetail && displayedNetPnl !== undefined && <>
                        <span className="text-slate-300">·</span>
                        <span className="ml-auto shrink-0 text-[10px] text-slate-500">{isSharedIncomeOnly ? "实际到账" : viewerPayout ? "本单可得" : "净利润"}</span>
                      </>}
                    </div>
                    {!isSplitIncomeDisplay && !isSharedIncomeOnly && renderHistoryActionMenu(trade, historyIsMemberPresentation)}
                    {!isSharedIncomePerspective && !isSplitIncomeDisplay && trade.note?.trim() && <div className="mt-1 truncate text-[11px] text-slate-500"><span>备注：</span>{trade.note.trim()}</div>}
                  </div>
                );
              })}
              {historyListItemCount > 0 && recentJournalTotalPages > 1 && (
                <div
                  className="flex items-center justify-between gap-3 border-t border-[#c7d0d7]/80 px-4 py-2.5 text-[11px] tabular-nums"
                  style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.42), rgba(208,215,221,0.34))", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.72)" }}
                >
                  <button
                  type="button"
                  disabled={recentJournalPage <= 1}
                  onClick={() => setRecentJournalPage((current) => Math.max(1, current - 1))}
                  className="h-7 rounded-[3px] border border-[#b9c2ca] bg-white/38 px-2.5 font-medium text-slate-600 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    上一页
                  </button>
                  <span className="whitespace-nowrap text-slate-500">第 {recentJournalPage} 页 / 共 {recentJournalTotalPages} 页</span>
                  <button
                  type="button"
                  disabled={recentJournalPage >= recentJournalTotalPages}
                  onClick={() => setRecentJournalPage((current) => Math.min(recentJournalTotalPages, current + 1))}
                  className="h-7 rounded-[3px] border border-[#b9c2ca] bg-white/38 px-2.5 font-medium text-slate-600 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    下一页
                  </button>
                </div>
              )}
              {canManage && !isHistoryUserPerspective && recoverableEntries.length > 0 && (
                <div data-card-export-hide="true" className="border-t border-slate-200 bg-amber-50/45">
                  <button
                    type="button"
                    onClick={() => setShowRecoverableRecords((value) => !value)}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left"
                  >
                    <span className="text-xs font-semibold text-amber-800">最近撤回 · 可恢复 {recoverableEntries.length} 笔</span>
                    <ChevronRight className={`h-4 w-4 text-amber-600 transition-transform ${showRecoverableRecords ? "rotate-90" : ""}`} />
                  </button>
                  {showRecoverableRecords && (
                    <div className="border-t border-amber-100 bg-white/75">
                      {recoverableEntries.map((item) => (
                        <div key={item.auditId} className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-amber-100 last:border-b-0">
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-700">{ACTIONS[item.trade.action].label} {formatQuantity(item.trade.quantity)} ETH @ {formatPrice(item.trade.price)}</div>
                            <div className="mt-0.5 text-[10px] text-slate-500">账户 {getTradeAccountName(item.trade)} · 用户 {getTradeRelatedUserName(item.trade)} · {item.operation === "delete" ? "删除" : "回撤"}于 {formatBeijingMonthDayTime(item.revertedAt)}</div>
                          </div>
                          <button
                            type="button"
                            disabled={restoreEntryMutation.isPending}
                            onClick={() => setRestoreCandidate(item)}
                            className="h-7 shrink-0 rounded border border-indigo-200 bg-white px-2 text-[11px] font-semibold text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            恢复
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
          </div>
        </section>

        {!isMemberView && (
          <footer className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-slate-200 px-1 pt-2 text-[10px] leading-4 text-slate-400">
            <span>内部速记账本 · 不触发交易所下单</span>
            <span>下单账户与管理流水仅当前管理员可见</span>
          </footer>
        )}
      </main>

      {canUseMemberPreview && previewMemberPickerOpen && (
        <div className="fixed inset-0 z-[70] flex items-end bg-slate-950/45 sm:items-center sm:justify-center sm:px-5" role="dialog" aria-modal="true" aria-label={isAdminFilterMemberPicker ? "筛选用户" : "选择用户视角"}>
          <div className="w-full max-h-[82vh] overflow-y-auto rounded-t-xl bg-white p-4 shadow-2xl sm:max-w-md sm:rounded-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">{isAdminFilterMemberPicker ? "筛选用户" : "选择用户视角"}</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">{isAdminFilterMemberPicker
                  ? "直接点击用户筛选管理员账本；选择会与用户视角保持同一对象。"
                  : "最近点入的用户优先；直接点击用户名进入该用户视角。当前对象会与管理员筛选同步，全部编辑入口保持只读。"}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewMemberPickerOpen(false)}
                aria-label={isAdminFilterMemberPicker ? "关闭用户筛选" : "关闭用户选择"}
                className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 active:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <input
              value={previewMemberSearch}
              onChange={(event) => setPreviewMemberSearch(event.target.value)}
              autoFocus
              placeholder="搜索姓名、账号或用户编号"
              aria-label={isAdminFilterMemberPicker ? "搜索可筛选用户" : "搜索可预览用户"}
              className="mt-4 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white"
            />
            {isAdminFilterMemberPicker && <button
              type="button"
              onClick={() => selectAdminMemberFilter(null)}
              aria-pressed={activeAdminMemberPickerId === null}
              className={`mt-3 flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border px-3 text-left text-xs transition active:scale-[0.99] ${activeAdminMemberPickerId === null ? "border-indigo-400 bg-indigo-50 text-indigo-800" : "border-slate-200 bg-slate-50 text-slate-700 active:bg-white"}`}
            >
              <span className="font-semibold">全部用户</span>
              <span className="text-[11px] font-medium opacity-75">恢复管理员全量账本</span>
            </button>}
            <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200">
              {t0PreviewMembersQuery.isLoading ? <div className="col-span-2 px-3 py-8 text-center text-sm text-slate-400">正在读取可预览成员…</div>
                : t0PreviewMembersQuery.isError ? <div className="col-span-2 px-3 py-8 text-center text-sm text-rose-600">成员名单加载失败，请关闭后重试</div>
                  : visiblePreviewMembers.length === 0 ? <div className="col-span-2 px-3 py-8 text-center text-sm text-slate-400">没有匹配的可预览成员</div>
                    : visiblePreviewMembers.map((member) => {
                      const metrics = previewMemberCardMetricsById.get(member.id);
                      const fundsLoaded = Boolean(metrics?.fundsLoaded);
                      const cashReturnRate = fundsLoaded ? metrics?.cashReturnRate ?? null : null;
                      const cashReturnRateClass = cashReturnRate === null
                        ? "text-slate-400"
                        : "text-slate-700";
                      const isSelected = activeAdminMemberPickerId === member.id;
                      return <button
                        key={member.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => isAdminFilterMemberPicker ? selectAdminMemberFilter(member) : openPreviewMember(member)}
                        className={`flex min-h-[86px] min-w-0 flex-col justify-center px-3 py-2.5 text-left transition-colors active:bg-indigo-50 ${isSelected ? "bg-indigo-50 ring-1 ring-inset ring-indigo-400" : "bg-white"}`}
                      >
                        <span className="block truncate text-sm font-semibold text-slate-800">{member.name}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-slate-500">{member.username ? member.username : `用户编号 ${member.id}`}</span>
                        <span className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1 border-t border-slate-100 pt-1.5 text-[10px] leading-none tabular-nums">
                          <span title="该用户本人已成交且未平的多仓" className="flex min-w-0 items-center justify-between gap-1"><span className="text-slate-400">多</span><strong className="truncate font-semibold text-rose-600">{metrics ? formatQuantity(metrics.longQuantity) : "--"}</strong></span>
                          <span title="该用户本人已成交且未平的空仓" className="flex min-w-0 items-center justify-between gap-1"><span className="text-slate-400">空</span><strong className="truncate font-semibold text-emerald-600">{metrics ? formatQuantity(metrics.shortQuantity) : "--"}</strong></span>
                          <span title="该用户T+0累计存款" className="flex min-w-0 items-center justify-between gap-1"><span className="text-slate-400">存</span><strong className={`truncate font-semibold ${fundsLoaded ? "text-slate-700" : "text-slate-400"}`}>{fundsLoaded ? metrics!.cumulativeDepositAmount.toLocaleString("zh-CN", { maximumFractionDigits: 0 }) : "--"}</strong></span>
                          <span title="累计提现除以累计存款；仅统计已登记的提现流水" className="flex min-w-0 items-center justify-between gap-1"><span className="text-slate-400">回</span><strong className={`truncate font-semibold ${cashReturnRateClass}`}>{cashReturnRate === null ? "--" : formatSignedPercent(cashReturnRate)}</strong></span>
                        </span>
                      </button>;
                    })}
            </div>
          </div>
        </div>
      )}

      {showEntrySheet && (
        <div
          className={isMemberView ? "fixed inset-0 z-40 overflow-y-auto bg-slate-50" : "fixed inset-0 z-40 bg-white"}
          role="dialog"
          aria-modal="true"
          aria-label={isMemberView ? "仓位明细" : "速记一笔"}
        >
          <div className={isMemberView ? "min-h-full w-full bg-slate-50" : "h-full w-full overflow-y-auto bg-white"}>
            {isMemberView ? (
              <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur">
                <button
                  type="button"
                  onClick={backToLadder}
                  aria-label="返回T加零价格簿"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700 active:scale-95"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <h1 className="min-w-0 flex-1 text-base font-semibold text-slate-900">仓位明细</h1>
                <button
                  type="button"
                  onClick={backToLadder}
                  aria-label="关闭并返回T加零价格簿"
                  title="关闭"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition active:scale-95"
                >
                  <X className="h-6 w-6" strokeWidth={2.25} />
                </button>
              </header>
            ) : (
              <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-4 pb-2 pt-3">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                  <div className="text-base font-semibold text-slate-900">{isEditingEntry ? "编辑开仓记录" : isClosingEntry ? `${ACTIONS[entryForm.action].label}设置` : "速记一笔"}</div>
                  </div>
                  <button
                    type="button"
                    onClick={backToLadder}
                    aria-label="关闭并返回T型报价"
                    title="关闭"
                    className="-mr-1 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition active:scale-95"
                  >
                    <X className="h-6 w-6" strokeWidth={2.25} />
                  </button>
                </div>
              </div>
            )}

            <div className={`p-4 space-y-4 ${canManage && !isMemberView ? "pb-24" : ""}`}>
              <div className={`overflow-hidden rounded border ${isOptionEntryContext ? "border-violet-200" : isGridOpeningEntry ? "border-cyan-200" : entrySide === "long" ? "border-rose-200" : "border-emerald-200"}`}>
                <div className={isOptionEntryContext ? "bg-violet-50/70" : isGridOpeningEntry ? "bg-cyan-50/70" : entrySide === "long" ? "bg-rose-50/70" : "bg-emerald-50/70"}>
                <div className="px-3 py-2.5">
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 text-left">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className={`text-base font-semibold ${isOptionEntryContext ? "text-violet-700" : isGridOpeningEntry ? "text-cyan-800" : entrySide === "long" ? "text-rose-600" : "text-emerald-600"}`}>{entryScopeTitle}</span>
                    <span className="text-base font-semibold tabular-nums text-slate-900">{formatQuantity(entrySideSummary.quantity)} ETH</span>
                  </div>
                  <span className="shrink-0 text-base font-medium tabular-nums text-slate-500">{isOptionEntryContext ? "行权价" : isGridOpeningEntry ? "参考价" : "均价"} {entrySideSummary.quantity > 0 ? formatPrice(entrySideSummary.average) : "--"}</span>
                </div>
                </div>
                <div className={`mx-3 flex min-w-0 items-center justify-between gap-2 border-t pt-2 pb-2.5 text-[10px] tabular-nums ${isOptionEntryContext ? "border-violet-200/80" : isGridOpeningEntry ? "border-cyan-200/80" : entrySide === "long" ? "border-rose-200/80" : "border-emerald-200/80"}`}>
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`shrink-0 ${entrySideSummary.unrealized === null ? "text-slate-400" : entrySideSummary.unrealized >= 0 ? "text-rose-600" : "text-emerald-600"}`}>
                      当前盈亏 {entrySideSummary.unrealized === null ? "--" : `${formatSigned(entrySideSummary.unrealized)} U`}
                    </span>
                    <span className="shrink-0 text-slate-500">当前 {activeOpenedTradeList.length} 笔</span>
                  </div>
                  {settledOpenedTradeSummary.count > 0 && <button
                    type="button"
                    onClick={() => setShowSettledOpeningHistory((current) => !current)}
                    aria-expanded={showSettledOpeningHistory}
                    className="flex shrink-0 items-center gap-1 whitespace-nowrap text-slate-500 transition active:opacity-60"
                  >
                    <span>历史平仓 {settledOpenedTradeSummary.count} 笔</span>
                    <span className={`font-semibold ${settledOpenedTradeSummary.realizedNet > 0 ? "text-rose-600" : settledOpenedTradeSummary.realizedNet < 0 ? "text-emerald-600" : "text-slate-600"}`}>
                      {formatSigned(settledOpenedTradeSummary.realizedNet)} U
                    </span>
                    <ChevronRight className={`h-3.5 w-3.5 transition-transform ${showSettledOpeningHistory ? "rotate-90" : ""}`} />
                  </button>}
                </div>
                </div>
                {!isEditingEntry && settledOpenedTradeRows.length > 0 && (
                  <div className="space-y-1.5 border-t border-slate-200 bg-white/70 px-3 py-3">
                    {settledOpenedTradeRows.map(renderOpenedTradeRow)}
                  </div>
                )}

                {!isEditingEntry && isClosingEntry && (
                  <section className="space-y-1.5 rounded border border-slate-200 bg-slate-50/70 p-2.5">
                    <div className="flex items-center justify-between gap-2 px-0.5">
                      <span className="text-xs font-semibold text-slate-800">本档逐笔订单</span>
                      <span className="text-[10px] text-slate-500">点哪张的{ACTIONS[entryForm.action].label}，只平哪张</span>
                    </div>
                    <div className="space-y-1.5">
                      {closingOrderedOpenedTradeRows.map(renderOpenedTradeRow)}
                    </div>
                  </section>
                )}
              </div>

              {!isEditingEntry && !isClosingEntry && <div className="space-y-1.5">
                  {activeOpenedTradeRows.length === 0 && (
                    <div className="rounded border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">当前档位没有未平仓主单</div>
                  )}
                  {activeOpenedTradeRows.map(renderOpenedTradeRow)}
              </div>}

              {canManage && <>
              <div className="grid grid-cols-1 gap-3">
                {isEditingEntry && (
                  <div className="rounded border border-indigo-200 bg-indigo-50/70 px-3 py-2.5">
                    <div className="text-xs font-semibold text-indigo-800">{isFullyClosedOpeningEdit ? "本笔开仓已全部平仓" : isPartiallyClosedOpeningEdit ? "正在编辑本笔剩余仓位" : "正在编辑本笔开仓"}</div>
                    <div className="mt-1 text-sm font-semibold tabular-nums text-slate-800">
                      {ACTIONS[entryForm.action].label} {formatQuantity(Number(entryForm.quantity))} ETH @ {formatPrice(Number(entryForm.price))}
                    </div>
                    <div className="mt-1 text-[11px] leading-4 text-indigo-700/80">
                      {isFullyClosedOpeningEdit && editingOriginalTrade
                        ? `原始 ${formatQuantity(editingOriginalTrade.originalQuantityBeforeReassignment ?? editingOriginalTrade.quantity)} ETH 已全部平仓或已完成剩余仓位转入；关联历史不可编辑。`
                        : isPartiallyClosedOpeningEdit && editingOriginalTrade && editingRemainingQuantity !== null
                        ? `原始 ${formatQuantity(editingOriginalTrade.originalQuantityBeforeReassignment ?? editingOriginalTrade.quantity)} ETH，已平 ${formatQuantity(editingOriginalTrade.quantity - editingRemainingQuantity)} ETH；可管理剩余 ${formatQuantity(editingRemainingQuantity)} ETH 的锁定、止盈、收益分配，或调整账户和项目归属。`
                        : isEditingPendingOpening
                          ? "挂单按钮已选中；取消选中后，点击底部“保存修改”才会按当前成交价确认成交。"
                          : isPendingFillConfirmationQueued
                            ? "已取消挂单选择；点击底部“保存修改”后，将按当前成交价确认成交并计入仓位。"
                            : entryForm.isPending
                              ? "已改为挂单状态；保存修改后将退出持仓、收益和 FIFO 计算，锁定会自动解除。"
                          : "请直接修改下方字段，完成后点击底部“保存修改”。"}
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <Field
                    label={<span className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-semibold text-slate-800">{isFullyClosedOpeningEdit ? "已平 E" : isPartiallyClosedOpeningEdit ? "剩余 E" : "数量 E"}{isOptionOpeningEntry && <span className="text-rose-500">*</span>}{ACTIONS[entryForm.action].opening && entryForm.isPending && <span className="text-[10px] font-bold text-sky-600">挂单</span>}</span>}
                    labelFor="t0-entry-quantity"
                    horizontal
                    labelAction={ACTIONS[entryForm.action].opening ? (
                      <div className="inline-flex items-center gap-0.5" aria-label="订单类型">
                        {T0_INSTRUMENT_TYPES.map((instrument) => {
                          const isActive = entryForm.instrumentType === instrument.value;
                          return (
                            <button
                              key={instrument.value}
                              type="button"
                              title={instrument.label}
                              aria-label={instrument.label}
                              aria-pressed={isActive}
                              disabled={isCloseReview || hasDependentCloseOpeningEdit}
                              onClick={() => selectOpeningInstrumentType(instrument)}
                              className={`flex h-8 w-8 items-center justify-center rounded border text-[11px] font-bold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${isActive ? "border-indigo-500 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-600"}`}
                            >
                              {instrument.shortLabel}
                            </button>
                          );
                        })}
                      </div>
                    ) : undefined}
                  >
                    <div>
                      <input
                        id="t0-entry-quantity"
                        inputMode="decimal"
                        maxLength={6}
                        disabled={isCloseReview || hasDependentCloseOpeningEdit}
                        aria-invalid={Boolean(quantityFormatError)}
                        value={entryForm.quantity}
                        onChange={(event) => setEntryForm((current) => ({ ...current, quantity: limitT0EthQuantityInput(event.target.value) }))}
                        onBlur={() => setEntryForm((current) => ({ ...current, quantity: normalizeEthQuantity(current.quantity) }))}
                        placeholder="0.00"
                        className={`h-14 w-full rounded border px-3 text-xl font-semibold tabular-nums text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 ${quantityFormatError ? "border-rose-400 bg-rose-50 focus:border-rose-500" : "border-slate-200 focus:border-indigo-500"}`}
                      />
                    </div>
                  </Field>

                  <Field label={
                    <span className="inline-flex whitespace-nowrap text-sm font-semibold text-slate-800">
                      {ACTIONS[entryForm.action].opening ? isOptionOpeningEntry ? "行权价" : isGridOpeningEntry ? "网格参考价" : "成交价" : "平仓价"}{(isOptionOpeningEntry || isGridOpeningEntry) && <span className="text-rose-500">*</span>}
                    </span>
                  } labelFor="t0-entry-price" horizontal labelAction={renderOpeningExecutionControls()}>
                    {isOptionOpeningEntry ? (
                      <select
                        id="t0-entry-price"
                        disabled={isCloseReview || hasDependentCloseOpeningEdit || !t0OptionDeribitLabel || t0OptionStrikesQuery.isLoading}
                        value={entryForm.price}
                        onChange={(event) => setEntryForm((current) => ({ ...current, price: event.target.value }))}
                        className="h-14 w-full rounded border border-violet-200 bg-white px-3 text-base font-semibold tabular-nums text-slate-900 outline-none focus:border-violet-500 disabled:cursor-not-allowed disabled:bg-slate-50"
                      >
                        <option value="">
                          {!t0OptionDeribitLabel
                            ? "请先选择到期日"
                            : t0OptionStrikesQuery.isLoading
                              ? "Deribit 行权价加载中…"
                              : "请选择行权价"}
                        </option>
                        {!t0OptionDeribitLabel && entryForm.price && <option value={entryForm.price}>当前：{formatPrice(Number(entryForm.price))}</option>}
                        {t0OptionStrikes.map((strike) => <option key={strike} value={String(strike)}>{strike.toLocaleString()}</option>)}
                      </select>
                    ) : isGridOpeningEntry ? <input
                      id="t0-entry-price"
                      readOnly
                      value={gridReferencePrice === null ? "" : formatPrice(gridReferencePrice)}
                      placeholder={entryForm.gridDirection === "long" ? "填写网格下限后生成" : "填写网格上限后生成"}
                      className="h-14 w-full rounded border border-cyan-200 bg-cyan-50/70 px-3 text-xl font-semibold tabular-nums text-cyan-950 outline-none placeholder:text-cyan-500/65"
                    /> : <input
                      id="t0-entry-price"
                      inputMode="decimal"
                      disabled={isCloseReview || hasDependentCloseOpeningEdit}
                      aria-label={ACTIONS[entryForm.action].opening ? "成交价" : "平仓价"}
                      value={isSmartOpeningPriceInput ? smartOpeningPriceDisplayValue : entryForm.price}
                      onKeyDown={(event) => {
                        smartOpeningPriceBackspaceRef.current = event.key === "Backspace";
                      }}
                      onKeyUp={() => {
                        smartOpeningPriceBackspaceRef.current = false;
                      }}
                      onBlur={() => {
                        smartOpeningPriceBackspaceRef.current = false;
                      }}
                      onChange={(event) => setEntryForm((current) => {
                        if (!isSmartOpeningPriceInput) return { ...current, price: limitT0ManualDecimalInput(event.target.value, 2) };
                        const prefix = current.priceInputPrefix ?? "";
                        const rawValue = event.target.value;
                        const rawIntegerLength = rawValue.replace(/,/g, ".").split(".")[0].replace(/\D/g, "").length;
                        const autoAppendDecimal = !smartOpeningPriceBackspaceRef.current;
                        // 前缀在视觉上与正常数字完全一致，但不足四位时不允许误删成独立价格。
                        const nextPrice = !rawValue
                          ? ""
                          : rawValue.startsWith(prefix)
                            ? normalizeT0MarketPriceInput(rawValue.slice(prefix.length), prefix, autoAppendDecimal)
                            : rawIntegerLength >= 4
                              ? normalizeT0MarketPriceInput(rawValue, "", autoAppendDecimal)
                              : "";
                        smartOpeningPriceBackspaceRef.current = false;
                        return { ...current, price: nextPrice };
                      })}
                      placeholder={isSmartOpeningPriceInput ? undefined : "0.00"}
                      className="min-w-0 w-full h-14 rounded border border-slate-200 px-2.5 text-[19px] font-semibold tabular-nums text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-500"
                    />}
                    {!isOptionOpeningEntry && openingArchivePrice !== null && (
                      <div className={`mt-1.5 text-[10px] tabular-nums ${ACTIONS[entryForm.action].side === "long" ? "text-rose-600" : "text-emerald-600"}`}>
                        {isGridOpeningEntry
                          ? `${entryForm.gridDirection === "long" ? "做多下限" : "做空上限"}自动归档至 ${formatPrice(openingArchivePrice)} 档`
                          : `${ACTIONS[entryForm.action].side === "long" ? "向上归档" : "向下归档"}至 ${formatPrice(openingArchivePrice)} 档`}
                      </div>
                    )}
                  </Field>
                  {ACTIONS[entryForm.action].opening && entryForm.isCounterparty && <div className="flex items-start gap-1.5 text-[10px] font-medium leading-4 text-violet-700"><Repeat2 className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2.4} /><span>反向展示已开启：用户保持本单原始多空与损益；管理员按相反数字展示。关闭后订单保留并立即恢复普通展示。</span></div>}
                  {isPartiallyClosedOpeningEdit && editingOriginalTrade && editingRemainingQuantity !== null && !entryForm.isPending && (
                    <div className="flex items-start gap-1.5 text-[10px] font-medium leading-4 text-amber-700">
                      <Lock className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2.4} />
                      <span>本单已平 {formatQuantity(editingOriginalTrade.quantity - editingRemainingQuantity)} ETH；数量与成交数据固定。账户、项目可选同步已平历史；如更换用户名，只会转入之后的剩余仓位。</span>
                    </div>
                  )}
                  {quantityFormatError && <div className="text-[10px] font-medium leading-4 text-rose-600">{quantityFormatError}</div>}
                </div>

                {isClosingEntry && <div className="-mt-1 grid grid-cols-8 gap-1" aria-label="按可平数量选择百分比">
                  {[10, 20, 25, 30, 33, 50, 75, 100].map((percentage) => {
                    const amount = percentage === 100
                      ? closingAvailableQuantity
                      : Number((closingAvailableQuantity * percentage / 100).toFixed(2));
                    const isActive = amount > 0 && Math.abs(Number(entryForm.quantity) - amount) < 0.0000001;
                    return (
                      <button
                        key={percentage}
                        type="button"
                        disabled={isCloseReview || amount <= 0}
                        onClick={() => setEntryForm((current) => ({ ...current, quantity: normalizeEthQuantity(String(amount)) }))}
                        className={`h-7 min-w-0 rounded border px-0.5 text-[10px] font-semibold tabular-nums transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${isActive ? "border-indigo-500 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-600"}`}
                        aria-label={`平仓可用数量的 ${percentage}%`}
                      >
                        {percentage}%
                      </button>
                    );
                  })}
                </div>}

                {!isClosingEntry && <div className="-mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="mr-0.5 text-[11px] text-slate-400">数量快选</span>
                  {quantityQuickOptions.map((value) => {
                    const isActive = entryForm.quantity === value;
                    const displayValue = isActive ? value : formatQuantityQuickOption(value);
                    return (
                      <button
                        key={value}
                        type="button"
                        disabled={isCloseReview || hasDependentCloseOpeningEdit}
                        onClick={() => setEntryForm((current) => ({ ...current, quantity: normalizeEthQuantity(value) }))}
                        className={`h-7 rounded border px-2 text-[11px] font-medium tabular-nums transition active:scale-95 ${isActive ? "border-indigo-500 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-600"}`}
                      >
                        {displayValue}
                      </button>
                    );
                  })}
                </div>}

                {isReminderCancellationPending && <div role="status" className="-mt-0.5 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-800">
                  已选择取消这张蓝色待补开位，尚未保存。点击底部“保存取消提醒”后才会隐藏；直接关闭本页不会改变提醒。
                </div>}
                {isTakeProfitAvailable && entryForm.isTakeProfit && <div className="-mt-0.5 rounded border border-amber-200 bg-amber-50/65 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-900"><Target className="h-3.5 w-3.5" strokeWidth={2.4} />分段止盈</span>
                    <span className="text-[10px] font-medium text-amber-700">{entryForm.isPending ? "先成交后触发" : "统一标记价触发"}</span>
                  </div>
                  <div className="space-y-2">
                    {entryForm.takeProfitPlans.map((plan, index) => {
                      const planPrice = Number(plan.price);
                      const planQuantity = Number(plan.quantity);
                      const openingPrice = Number(entryForm.price);
                      const planNetPnl = Number.isFinite(planPrice) && planPrice > 0 && Number.isFinite(planQuantity) && planQuantity > 0 && Number.isFinite(openingPrice) && openingPrice > 0
                        ? ((ACTIONS[entryForm.action].side === "long" ? planPrice - openingPrice : openingPrice - planPrice) * planQuantity) - ((openingPrice + planPrice) * planQuantity * OKX_VIP2_TAKER_FEE_RATE)
                        : 0;
                      const planShareableAmount = Math.floor((Math.max(0, planNetPnl) + 1e-9) * 100) / 100;
                      const plannedSharedAmount = (plan.sharedIncomeAllocations ?? []).reduce((total, allocation) => total + (Number(allocation.amount) || 0), 0);
                      return <div key={`take-profit-plan-${index}`} className="rounded border border-amber-200/80 bg-white/75 p-2">
                      <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                        <Field label={<span>止盈价 <span className="text-rose-500">*</span></span>}>
                          <input
                            inputMode="decimal"
                            disabled={isCloseReview || isFullyClosedOpeningEdit}
                            value={plan.price}
                            onChange={(event) => setEntryForm((current) => ({ ...current, takeProfitPlans: current.takeProfitPlans.map((item, planIndex) => planIndex === index ? { ...item, price: event.target.value } : item) }))}
                            placeholder={ACTIONS[entryForm.action].side === "long" ? "高于成交价" : "低于成交价"}
                            className="h-10 w-full rounded border border-amber-200 bg-white px-2.5 text-sm font-semibold tabular-nums text-slate-900 outline-none placeholder:text-amber-600/50 focus:border-amber-500 disabled:cursor-not-allowed disabled:bg-slate-50"
                          />
                        </Field>
                        <Field label={<span>数量（ETH） <span className="text-rose-500">*</span></span>}>
                          <input
                            inputMode="decimal"
                            maxLength={6}
                            disabled={isCloseReview || isFullyClosedOpeningEdit}
                            value={plan.quantity}
                            onChange={(event) => setEntryForm((current) => ({ ...current, takeProfitPlans: current.takeProfitPlans.map((item, planIndex) => planIndex === index ? { ...item, quantity: limitT0EthQuantityInput(event.target.value) } : item) }))}
                            onBlur={() => setEntryForm((current) => ({ ...current, takeProfitPlans: current.takeProfitPlans.map((item, planIndex) => planIndex === index ? { ...item, quantity: normalizeEthQuantity(item.quantity) } : item) }))}
                            placeholder="部分数量"
                            className="h-10 w-full rounded border border-amber-200 bg-white px-2.5 text-sm font-semibold tabular-nums text-slate-900 outline-none placeholder:text-amber-600/50 focus:border-amber-500 disabled:cursor-not-allowed disabled:bg-slate-50"
                          />
                        </Field>
                        <button
                          type="button"
                          disabled={isCloseReview || isFullyClosedOpeningEdit || entryForm.takeProfitPlans.length <= 1}
                          onClick={() => setEntryForm((current) => ({ ...current, takeProfitPlans: current.takeProfitPlans.filter((_, planIndex) => planIndex !== index) }))}
                          className="mb-px flex h-10 w-10 items-center justify-center rounded border border-amber-200 bg-amber-50 text-amber-700 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
                          aria-label={`删除第 ${index + 1} 段止盈`}
                          title="删除本段止盈"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2 border-t border-amber-100 pt-1.5">
                        <span className="min-w-0 truncate text-[10px] font-medium text-slate-600">预计净收益 <span className={planNetPnl > 0 ? "text-rose-600" : "text-emerald-600"}>{planNetPnl >= 0 ? "+" : ""}{planNetPnl.toFixed(2)} u</span></span>
                        <button
                          type="button"
                          disabled={isCloseReview || isFullyClosedOpeningEdit || !canManage || !entryForm.relatedUserId}
                          onClick={() => openTakeProfitAllocationPanel(index)}
                          className="inline-flex h-7 shrink-0 items-center rounded border border-blue-200 bg-white px-2 text-[10px] font-semibold text-blue-700 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          预分配{plannedSharedAmount > 0 ? ` ${plannedSharedAmount.toFixed(2)}u` : ""}
                        </button>
                      </div>
                      {planShareableAmount <= 0 && <p className="mt-1 text-[10px] text-slate-400">预计无正向净收益，本段不会产生共享收益。</p>}
                    </div>;
                    })}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      disabled={isCloseReview || isFullyClosedOpeningEdit || entryForm.takeProfitPlans.length >= 20}
                      onClick={() => setEntryForm((current) => ({ ...current, takeProfitPlans: [...current.takeProfitPlans, { price: "", quantity: "" }] }))}
                      className="inline-flex h-8 items-center gap-1 rounded border border-amber-300 bg-white px-2.5 text-[11px] font-semibold text-amber-800 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />添加一段
                    </button>
                    <span className="text-right text-[10px] leading-4 text-amber-800">合计 {formatQuantity(entryForm.takeProfitPlans.reduce((total, plan) => total + (Number(plan.quantity) || 0), 0))} / {formatQuantity(Number(entryForm.quantity) || 0)} ETH</span>
                  </div>
                  <div className="mt-2 text-[10px] leading-4 text-amber-800">
                    {ACTIONS[entryForm.action].side === "long" ? "多单在标记价达到或高于对应止盈价时，按该段数量自动平仓。" : "空单在标记价达到或低于对应止盈价时，按该段数量自动平仓。"} 可设置多段；所有未触发段落合计不得超过本笔可用数量，锁定状态下会等待解锁后触发。
                  </div>
                </div>}

                {isOptionOpeningEntry && <fieldset disabled={isCloseReview || hasDependentCloseOpeningEdit} className="contents">
                  <div className="-mt-0.5 rounded border border-violet-200 bg-violet-50/60 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-violet-800">期权参数</span>
                    <span className="text-[10px] font-medium text-violet-600">标的固定 ETH · Deribit</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={<span>方向 <span className="text-rose-500">*</span></span>}>
                      <div className="grid grid-cols-2 gap-1.5">
                        {T0_OPTION_DIRECTIONS.map((option) => {
                          const active = entryForm.optionDirection === option.value;
                          return <button
                            key={option.value}
                            type="button"
                            disabled={isCloseReview}
                            onClick={() => {
                              if (!entryForm.editingEntryId) setEntrySide(getOptionLadderSide(option.value));
                              setEntryForm((current) => ({
                                ...current,
                                action: current.editingEntryId ? current.action : getOptionOpeningAction(option.value),
                                optionDirection: option.value,
                              }));
                            }}
                            className={`h-11 rounded border px-1 text-[11px] font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${active ? "border-violet-600 bg-violet-600 text-white" : "border-violet-200 bg-white text-slate-600"}`}
                            aria-pressed={active}
                          >{option.label}</button>;
                        })}
                      </div>
                    </Field>
                    <Field label={<span>到期日 <span className="text-rose-500">*</span></span>}>
                      <select
                        disabled={isCloseReview || t0OptionExpiriesQuery.isLoading}
                        value={t0OptionDeribitLabel}
                        onChange={(event) => {
                          const nextExpiry = t0OptionExpiries.find((expiry) => expiry.deribitLabel === event.target.value);
                          if (!nextExpiry) return;
                          setEntryForm((current) => ({
                            ...current,
                            optionExpiryDate: new Date(nextExpiry.ts).toISOString().slice(0, 10),
                            price: "",
                          }));
                        }}
                        className="h-11 w-full rounded border border-violet-200 bg-white px-2 text-xs font-medium tabular-nums text-slate-800 outline-none focus:border-violet-500 disabled:cursor-not-allowed disabled:bg-slate-50"
                      >
                        <option value="">
                          {t0OptionExpiriesQuery.isLoading
                            ? "Deribit 到期日加载中…"
                            : entryForm.optionExpiryDate
                              ? `当前：${entryForm.optionExpiryDate}`
                              : "请选择到期日"}
                        </option>
                        {t0OptionExpiries.map((expiry) => (
                          <option key={expiry.deribitLabel} value={expiry.deribitLabel}>
                            {expiry.dateStr || expiry.deribitLabel}（{expiry.diffDays > 0 ? `余${expiry.diffDays}天` : "即将到期"}）
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label={<span>权利金 <span className="text-rose-500">*</span></span>}>
                      <input
                        inputMode="decimal"
                        disabled={isCloseReview}
                        value={entryForm.optionPremium}
                        onChange={(event) => setEntryForm((current) => ({ ...current, optionPremium: event.target.value }))}
                        placeholder="0.00"
                        className="h-11 w-full rounded border border-violet-200 bg-white px-3 text-base font-semibold tabular-nums text-slate-900 outline-none placeholder:text-slate-400 focus:border-violet-500 disabled:cursor-not-allowed disabled:bg-slate-50"
                      />
                    </Field>
                    <Field label={<span>权利金计价 <span className="text-rose-500">*</span></span>}>
                      <div className="grid h-11 grid-cols-2 overflow-hidden rounded border border-violet-200 bg-white">
                        {(["USDT", "ETH"] as T0OptionPremiumCurrency[]).map((currency) => {
                          const active = entryForm.optionPremiumCurrency === currency;
                          return <button
                            key={currency}
                            type="button"
                            disabled={isCloseReview}
                            onClick={() => setEntryForm((current) => ({ ...current, optionPremiumCurrency: currency }))}
                            className={`text-xs font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${active ? "bg-violet-600 text-white" : "text-slate-600"}`}
                          >{currency}</button>;
                        })}
                      </div>
                    </Field>
                  </div>
                  <div className={`mt-2 text-[10px] font-medium leading-4 ${optionFormValidationMessage ? "text-rose-600" : "text-violet-700"}`}>
                    {optionFormValidationMessage ?? "期权参数已完整，可保存。"}
                  </div>
                  </div>
                </fieldset>}

                {isGridOpeningEntry && <fieldset disabled={isCloseReview || hasDependentCloseOpeningEdit} className="contents">
                  <div className="-mt-0.5 rounded border border-cyan-200 bg-cyan-50/70 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-cyan-900">网格参数</span>
                    <span className="text-[10px] font-medium text-cyan-700">做多取下限归左 · 做空取上限归右</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={<span>方向 <span className="text-rose-500">*</span></span>}>
                      <div className="grid h-11 grid-cols-2 overflow-hidden rounded border border-cyan-200 bg-white">
                        {T0_GRID_DIRECTIONS.map((direction) => {
                          const active = entryForm.gridDirection === direction.value;
                          const wouldChangeSide = entryForm.editingEntryId && entryForm.action !== (direction.value === "long" ? "openLong" : "openShort");
                          return <button
                            key={direction.value}
                            type="button"
                            disabled={Boolean(isCloseReview || wouldChangeSide)}
                            title={wouldChangeSide ? "编辑时不能跨越报价侧，请新建该方向网格" : undefined}
                            onClick={() => {
                              if (!entryForm.editingEntryId) setEntrySide(direction.value === "long" ? "long" : "short");
                              setEntryForm((current) => ({
                                ...current,
                                action: current.editingEntryId ? current.action : direction.value === "long" ? "openLong" : "openShort",
                                gridDirection: direction.value,
                                isPending: false,
                              }));
                            }}
                            className={`text-[11px] font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${active ? "bg-cyan-700 text-white" : "text-slate-600"}`}
                            aria-pressed={active}
                          >{direction.label}</button>;
                        })}
                      </div>
                    </Field>
                    <Field label={<span>杠杆倍数 <span className="text-rose-500">*</span></span>}>
                      <input
                        inputMode="decimal"
                        disabled={isCloseReview}
                        value={entryForm.gridLeverage}
                        onChange={(event) => setEntryForm((current) => ({ ...current, gridLeverage: event.target.value }))}
                        placeholder="例如 3"
                        className="h-11 w-full rounded border border-cyan-200 bg-white px-3 text-base font-semibold tabular-nums text-slate-900 outline-none placeholder:text-slate-400 focus:border-cyan-600 disabled:cursor-not-allowed disabled:bg-slate-50"
                      />
                    </Field>
                    <Field label={<span>{entryForm.gridDirection === "long" ? "区间下限" : "区间上限"} <span className="text-rose-500">*</span></span>}>
                      <input
                        inputMode="decimal"
                        disabled={isCloseReview}
                        value={entryForm.gridDirection === "long" ? entryForm.gridRangeMin : entryForm.gridRangeMax}
                        onChange={(event) => setEntryForm((current) => entryForm.gridDirection === "long"
                          ? { ...current, gridRangeMin: event.target.value }
                          : { ...current, gridRangeMax: event.target.value })}
                        placeholder={entryForm.gridDirection === "long" ? "例如 2200" : "例如 2900"}
                        className="h-11 w-full rounded border border-cyan-200 bg-white px-3 text-base font-semibold tabular-nums text-slate-900 outline-none placeholder:text-slate-400 focus:border-cyan-600 disabled:cursor-not-allowed disabled:bg-slate-50"
                      />
                    </Field>
                    <Field label={<span>{entryForm.gridDirection === "long" ? "区间上限" : "区间下限"} <span className="text-rose-500">*</span></span>}>
                      <input
                        inputMode="decimal"
                        disabled={isCloseReview}
                        value={entryForm.gridDirection === "long" ? entryForm.gridRangeMax : entryForm.gridRangeMin}
                        onChange={(event) => setEntryForm((current) => entryForm.gridDirection === "long"
                          ? { ...current, gridRangeMax: event.target.value }
                          : { ...current, gridRangeMin: event.target.value })}
                        placeholder={entryForm.gridDirection === "long" ? "例如 2700" : "例如 2400"}
                        className="h-11 w-full rounded border border-cyan-200 bg-white px-3 text-base font-semibold tabular-nums text-slate-900 outline-none placeholder:text-slate-400 focus:border-cyan-600 disabled:cursor-not-allowed disabled:bg-slate-50"
                      />
                    </Field>
                    <Field label={<span>网格数量 <span className="text-rose-500">*</span></span>}>
                      <input
                        inputMode="numeric"
                        disabled={isCloseReview}
                        value={entryForm.gridCount}
                        onChange={(event) => setEntryForm((current) => ({ ...current, gridCount: event.target.value.replace(/[^0-9]/g, "") }))}
                        placeholder="例如 20"
                        className="h-11 w-full rounded border border-cyan-200 bg-white px-3 text-base font-semibold tabular-nums text-slate-900 outline-none placeholder:text-slate-400 focus:border-cyan-600 disabled:cursor-not-allowed disabled:bg-slate-50"
                      />
                    </Field>
                  </div>
                  <div className={`mt-2 text-[10px] font-medium leading-4 ${gridFormValidationMessage ? "text-rose-600" : "text-cyan-800"}`}>
                    {gridFormValidationMessage ?? (entryForm.gridDirection === "long" ? "做多网格将按区间下限放入左侧报价。" : "做空网格将按区间上限放入右侧报价。")}
                  </div>
                  </div>
                </fieldset>}

                {isClosingEntry ? (
                  <>
                    <div className="grid grid-cols-3 gap-2" aria-label="继承自开仓单的账户用户和项目">
                      <div title={entryForm.accountName || "未关联账户"} className="flex h-10 min-w-0 items-center truncate rounded border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-600">
                        {entryForm.accountName || "未关联账户"}
                      </div>
                      <div title={entryForm.relatedUserName || entryForm.relatedUsername || "未关联用户"} className="flex h-10 min-w-0 items-center truncate rounded border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-600">
                        {entryForm.relatedUserName || entryForm.relatedUsername || "未关联用户"}
                      </div>
                      <div title={entryForm.relatedFundName || (entryForm.relatedFundId === "legacy" ? "未区分项目" : "未关联项目")} className="flex h-10 min-w-0 items-center truncate rounded border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-600">
                        {entryForm.relatedFundName || (entryForm.relatedFundId === "legacy" ? "未区分项目" : "未关联项目")}
                      </div>
                    </div>
                    <Field label="备注（可选）">
                      <input
                        disabled={isCloseReview}
                        value={entryForm.note}
                        onChange={(event) => setEntryForm((current) => ({ ...current, note: event.target.value }))}
                        placeholder="不填则不生成默认备注"
                        className="w-full h-11 rounded border border-slate-200 px-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-indigo-500"
                      />
                    </Field>
                  </>
                ) : <>
                <div className="grid grid-cols-[minmax(6.75rem,0.7fr)_minmax(0,1.3fr)] items-start gap-3">
                  <Field label={<span className="flex items-center justify-between gap-1"><span>下单账户 <span className="text-rose-500">*</span></span>{accounts.length > 0 && !isClosingEntry && (!hasDependentCloseOpeningEdit || isPartiallyClosedOpeningEdit) && <button type="button" onClick={() => openDirectoryManager("account")} className="shrink-0 text-[11px] font-semibold text-indigo-600 active:opacity-70">管理</button>}</span>}>
                    {accounts.length > 0 ? (
                      <select
                        disabled={isAccountSelectionLocked || (hasDependentCloseOpeningEdit && !isPartiallyClosedOpeningEdit)}
                        value={entryForm.accountId}
                        onChange={(event) => {
                          if (event.target.value === "__manage_accounts__") {
                            openDirectoryManager("account");
                            return;
                          }
                          selectOrderAccount(event.target.value);
                        }}
                        className="h-11 w-full rounded border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
                      >
                        <option value="">新建账户</option>
                        <option value="__manage_accounts__">编辑 / 删除账户…</option>
                        {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                      </select>
                    ) : null}
                    {!entryForm.accountId && (
                      <input
                        disabled={isAccountSelectionLocked || (hasDependentCloseOpeningEdit && !isPartiallyClosedOpeningEdit)}
                        value={entryForm.accountName}
                        onChange={(event) => setEntryForm((current) => ({ ...current, accountName: event.target.value }))}
                        placeholder="新账户名称"
                        className="mt-2 h-11 w-full rounded border border-slate-200 px-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-indigo-500"
                      />
                    )}
                  </Field>

	                  <Field label={<span className="flex items-center justify-between gap-1"><span>关联用户</span><span className="flex shrink-0 items-center gap-2">{recentRelatedUsers.length > 0 && !isClosingEntry && (!hasDependentCloseOpeningEdit || isPartiallyClosedOpeningEdit) && <button type="button" onClick={() => openDirectoryManager("relatedUser")} className="text-[11px] font-semibold text-indigo-600 active:opacity-70">管理</button>}</span></span>}>
	                    <button
	                      type="button"
	                      disabled={isCloseAssociationLocked || (hasDependentCloseOpeningEdit && !isPartiallyClosedOpeningEdit)}
	                      aria-haspopup="dialog"
	                      aria-expanded={relatedUserPickerOpen}
	                      aria-label="选择关联用户"
	                      onClick={() => {
	                        setRelatedUserQuickPickerOpen(false);
	                        setRelatedUserSearch("");
	                        setRelatedUserPickerOpen(true);
	                      }}
	                      className={`flex h-11 w-full items-center gap-2 rounded border px-3 text-left text-sm outline-none transition active:scale-[0.99] disabled:cursor-not-allowed disabled:active:scale-100 ${isCloseAssociationLocked || (hasDependentCloseOpeningEdit && !isPartiallyClosedOpeningEdit) ? "border-slate-200 bg-slate-50 text-slate-500" : entryForm.relatedUserId ? "border-indigo-200 bg-indigo-50/60 text-slate-800" : "border-slate-200 bg-white text-slate-400"}`}
	                    >
	                      <span className={`min-w-0 flex-1 truncate font-medium ${entryForm.relatedUserId ? "text-slate-800" : "text-slate-400"}`}>{entryForm.relatedUserId ? (entryForm.relatedUserName || entryForm.relatedUsername || `用户#${entryForm.relatedUserId}`) : "暂不关联"}</span>
	                      {entryForm.relatedUserId && entryForm.relatedUsername && entryForm.relatedUsername !== entryForm.relatedUserName && <span className="max-w-[32%] truncate text-xs text-slate-400">@{entryForm.relatedUsername}</span>}
	                      <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2.2} />
	                    </button>
	                  </Field>
	                </div>

	                {relatedUserPickerOpen && <div className="fixed inset-0 z-[68] flex items-center justify-center bg-slate-950/45 px-4 py-6" role="dialog" aria-modal="true" aria-label="选择关联用户" onMouseDown={() => { setRelatedUserPickerOpen(false); setRelatedUserSearch(""); }}>
	                  <section className="flex max-h-[78dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
	                    <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
	                      <div className="min-w-0 flex-1"><h3 className="text-base font-semibold text-slate-900">选择关联用户</h3><p className="mt-0.5 text-[11px] text-slate-400">点击用户即可关联</p></div>
	                      {recentRelatedUsers.length > 0 && <button type="button" onClick={() => openDirectoryManager("relatedUser")} className="shrink-0 text-xs font-semibold text-indigo-600">管理</button>}
	                      <button type="button" onClick={() => { setRelatedUserPickerOpen(false); setRelatedUserSearch(""); }} aria-label="关闭关联用户选择" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 active:bg-slate-100"><X className="h-4 w-4" /></button>
	                    </header>
	                    <div className="border-b border-slate-100 px-4 py-2.5">
	                      <div className="flex h-10 items-center gap-2 rounded-lg bg-slate-100 px-3">
	                        <Search className="h-4 w-4 shrink-0 text-slate-400" />
	                        <input autoFocus value={relatedUserSearch} onChange={(event) => setRelatedUserSearch(event.target.value)} placeholder="搜索全局用户并添加" className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400" />
	                        {relatedUserSearch && <button type="button" onClick={() => setRelatedUserSearch("")} aria-label="清空用户搜索" className="text-slate-400 active:scale-90"><X className="h-4 w-4" /></button>}
	                      </div>
	                    </div>
	                    <div className="min-h-0 overflow-y-auto px-4 py-3">
	                      {relatedUserSearch.trim().length === 0 ? <>
	                        <button type="button" onClick={clearRelatedUser} aria-pressed={!entryForm.relatedUserId} className={`mb-3 flex h-9 w-full items-center justify-center rounded-lg border text-xs font-semibold transition active:scale-[0.99] ${!entryForm.relatedUserId ? "border-slate-400 bg-slate-100 text-slate-800" : "border-slate-200 bg-white text-slate-500"}`}>暂不关联</button>
	                        {entryRelatedUserOptions.length > 0 ? <div className="grid grid-cols-2 border-y border-slate-200" aria-label="已关联用户列表">
	                          {entryRelatedUserOptions.map((user, index) => {
	                            const selected = entryForm.relatedUserId === user.id;
	                            return <button key={user.id} type="button" aria-pressed={selected} onClick={() => selectRelatedUser(user)} title={user.name} className={`flex h-10 min-w-0 items-center justify-center gap-1 px-2 text-center text-xs transition active:bg-indigo-50 ${index % 2 === 0 ? "border-r border-slate-200" : ""} ${index + 2 < entryRelatedUserOptions.length ? "border-b border-slate-200" : ""} ${selected ? "bg-indigo-50 font-semibold text-indigo-800" : "bg-white font-medium text-slate-700"}`}>
	                              <span className="max-w-[58%] truncate">{user.name}</span>
	                              {user.username && <span className={`max-w-[38%] truncate text-[10px] ${selected ? "text-indigo-500" : "text-slate-400"}`}>@{user.username}</span>}
	                            </button>;
	                          })}
	                        </div> : <div className="py-10 text-center text-sm text-slate-400">暂无已关联用户，请搜索添加</div>}
	                      </> : Array.isArray(relatedUserSearchQuery.data) && relatedUserSearchQuery.data.length > 0 ? <div className="grid grid-cols-2 border-y border-slate-200" aria-busy={relatedUserSearchUpdating} aria-label="全局用户搜索结果">
	                        {(relatedUserSearchQuery.data as any[]).map((candidate, index, candidates) => {
	                          const user: PreviewRelatedUser = { id: String(candidate.id), name: String(candidate.name || candidate.username || `用户#${candidate.id}`), username: candidate.username ? String(candidate.username) : undefined, avatar: candidate.avatar ? String(candidate.avatar) : undefined };
	                          const selected = entryForm.relatedUserId === user.id;
	                          return <button key={user.id} type="button" disabled={relatedUserSearchDataMayNotMatch} aria-pressed={selected} onClick={() => selectRelatedUser(user)} title={user.name} className={`flex h-10 min-w-0 items-center justify-center gap-1 px-2 text-center text-xs transition active:bg-indigo-50 disabled:opacity-55 ${index % 2 === 0 ? "border-r border-slate-200" : ""} ${index + 2 < candidates.length ? "border-b border-slate-200" : ""} ${selected ? "bg-indigo-50 font-semibold text-indigo-800" : "bg-white font-medium text-slate-700"}`}>
	                            <span className="max-w-[58%] truncate">{user.name}</span>
	                            {user.username && <span className={`max-w-[38%] truncate text-[10px] ${selected ? "text-indigo-500" : "text-slate-400"}`}>@{user.username}</span>}
	                          </button>;
	                        })}
	                      </div> : relatedUserSearchUpdating ? <div role="status" className="py-10 text-center text-sm text-slate-400">正在搜索全局用户…</div> : <div className="py-10 text-center text-sm text-slate-400">未找到匹配的全局用户</div>}
	                    </div>
	                  </section>
	                </div>}

                <div className="-mt-1 grid grid-cols-[minmax(6.75rem,0.7fr)_minmax(0,1.3fr)] gap-3 text-[10px] leading-4 text-slate-400">
                  <span>{isPartiallyClosedOpeningEdit ? "已平历史的用户名与成交数据固定；可改账户、用户、项目。换用户名时，只会为剩余仓位生成承接订单。" : hasDependentCloseOpeningEdit ? "已有平仓流水；账户、用户、项目、数量、价格、类型、备注与反向展示均保留审计，不可修改。" : isEditingEntry ? "可选择、新建或管理账户；保存前校验后续平仓并保留审计。" : "优先按关联用户记忆账户；无记录则保留当前账户。"}</span>
                  <span>仅搜索并引用全局已有用户；关联后按项目区分资金。</span>
                </div>

                <Field label={<span className="flex items-center justify-between gap-1"><span>项目 {entryForm.relatedUserId && <span className="text-rose-500">*</span>} {!entryForm.relatedUserId && <span className="text-slate-400">（请先选关联用户）</span>}</span><span className="flex shrink-0 items-center gap-2">{(entryForm.relatedFundId || entryForm.relatedFundName.trim()) && entryForm.relatedFundId !== "legacy" && !isClosingEntry && (!isEditingEntry || isPartiallyClosedOpeningEdit) && <button type="button" onClick={() => { const fund = entryRelatedFunds.find((item) => item.id === entryForm.relatedFundId) ?? { id: "", name: entryForm.relatedFundName.trim(), relatedUserId: entryForm.relatedUserId || undefined }; if (fund.name) openProfitShareManager(fund); }} className="text-[11px] font-semibold text-indigo-600 active:opacity-70">收益分配</button>}{isEditingEntry && !isPartiallyClosedOpeningEdit && !isClosingEntry && !entryForm.isPending && entryForm.relatedFundId && entryForm.relatedFundId !== "legacy" && <button type="button" onClick={openEntryProfitShareManager} className="text-[11px] font-semibold text-indigo-600 active:opacity-70">本单分配</button>}{entryRelatedFunds.length > 0 && !isClosingEntry && (!hasDependentCloseOpeningEdit || isPartiallyClosedOpeningEdit) && <button type="button" onClick={() => openDirectoryManager("relatedFund")} className="text-[11px] font-semibold text-indigo-600 active:opacity-70">管理</button>}</span></span>}>
                  <select
                    disabled={!entryForm.relatedUserId || isCloseReview || isClosingEntry || (hasDependentCloseOpeningEdit && !isPartiallyClosedOpeningEdit)}
                    value={entryForm.relatedFundId}
                    onChange={(event) => {
                      if (event.target.value === "__manage_related_funds__") {
                        openDirectoryManager("relatedFund");
                        return;
                      }
                      selectRelatedFund(event.target.value);
                    }}
                    className="h-11 w-full rounded border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    <option value="">新建专项款</option>
                    {entryRelatedFunds.length > 0 && <option value="__manage_related_funds__">编辑 / 删除项目…</option>}
                    {(isEditingEntry || isClosingEntry) && entryForm.relatedFundId === "legacy" && <option value="legacy">未区分专项款（历史）</option>}
                    {entryRelatedFunds.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
                  </select>
                  {entryForm.relatedUserId && entryForm.relatedFundId === "" && (
                    <input
                      disabled={isCloseReview || isClosingEntry || (hasDependentCloseOpeningEdit && !isPartiallyClosedOpeningEdit)}
                      value={entryForm.relatedFundName}
                      onChange={(event) => setEntryForm((current) => ({ ...current, relatedFundName: event.target.value }))}
                      placeholder="新专项款名称，例如：10月拼单"
                      className="mt-2 h-11 w-full rounded border border-slate-200 px-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-50"
                    />
                  )}
                  {entryForm.relatedFundId === "legacy" && (
                    <div className="mt-1.5 text-[10px] leading-4 text-amber-700">这是功能上线前的未区分专项款记录；编辑时可改为该用户的专项款。</div>
                  )}
                  {canManage && selectedProjectProfitSharePreview && (
                    <div className={`mt-2 rounded border px-2.5 py-2 ${selectedProjectProfitSharePreview.rows.length > 0 ? "border-indigo-100 bg-indigo-50/60" : "border-amber-200 bg-amber-50/70"}`} aria-label={`${selectedProjectProfitSharePreview.projectName}收益分配摘要`}>
                      <div className="flex items-center justify-between gap-2 text-[10px] leading-4">
                        <span className={`font-semibold ${selectedProjectProfitSharePreview.rows.length > 0 ? "text-indigo-800" : "text-amber-800"}`}>项目分配</span>
                        <span className="min-w-0 truncate text-slate-500">{selectedProjectProfitSharePreview.sourceLabel}</span>
                        {selectedProjectProfitSharePreview.rows.length > 0 && <span className={`shrink-0 font-semibold tabular-nums ${selectedProjectProfitSharePreview.totalPercentage === 100 ? "text-emerald-700" : "text-rose-600"}`}>合计 {selectedProjectProfitSharePreview.totalPercentage}%</span>}
                      </div>
                      {selectedProjectProfitSharePreview.rows.length > 0 ? (
                        <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 text-[11px] leading-4 text-slate-700">
                          {selectedProjectProfitSharePreview.rows.map((allocation) => (
                            <span key={allocation.beneficiaryUserId} className="inline-flex max-w-full items-baseline gap-1 rounded bg-white/85 px-1.5 py-0.5 shadow-[0_1px_1px_rgba(15,23,42,0.04)]">
                              <span className="max-w-[9.5rem] truncate font-medium">{allocation.beneficiaryUserName}</span>
                              <span className="shrink-0 font-bold tabular-nums text-indigo-700">{allocation.percentage}%</span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-1 text-[10px] leading-4 text-amber-800">该项目尚未设置收益分配。请点击上方“收益分配”完成配置后再保存订单。</div>
                      )}
                    </div>
                  )}
                </Field>

                <Field label="备注（可选）">
                  <input
                    disabled={isCloseReview || hasDependentCloseOpeningEdit}
                    value={entryForm.note}
                    onChange={(event) => setEntryForm((current) => ({ ...current, note: event.target.value }))}
                    placeholder="不填则不生成默认备注"
                    className="w-full h-11 rounded border border-slate-200 px-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-indigo-500"
                  />
                </Field>
                </>}
              </div>
              </>}

            </div>
            {canManage && <div className={isMemberView
              ? "sticky bottom-0 border-t border-slate-100 bg-white/95 px-4 py-3 backdrop-blur"
              : "fixed inset-x-0 bottom-0 z-20 border-t border-slate-100 bg-white/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur"
            }>
              {!isCloseReview && openingSaveError && <div role="alert" className="mb-2 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
                <span className="font-semibold">未保存：</span>{openingSaveError}。请保留当前内容修改后重新保存。
              </div>}
              {!isCloseReview && (
                <button
                  disabled={isReminderCancellationPending
                    ? pauseReopenReminderMutation.isPending
                    : (isEditingEntry ? updateOpeningEntryMutation.isPending || reassignOpeningRemainingMutation.isPending || updatePartialOpeningHistoricalAttributionMutation.isPending || (hasDependentCloseOpeningEdit && (!isPartiallyClosedOpeningEdit || (!hasPartialOpeningMarkerChange && !hasPartialTakeProfitChange && !hasPartialAttributionDraftChange))) : saveEntryMutation.isPending || (isClosingEntry && entryForm.targetPrice === undefined)) || Boolean(optionFormValidationMessage)}
                  onClick={() => handleSaveEntry(isPendingFillConfirmationQueued)}
                  className="w-full h-12 rounded bg-indigo-600 text-sm font-semibold text-white shadow-sm disabled:opacity-40 active:scale-[0.99]"
                >
                  {isReminderCancellationPending
                    ? (pauseReopenReminderMutation.isPending ? "正在保存取消…" : "保存取消提醒")
                    : isEditingEntry
                    ? (updateOpeningEntryMutation.isPending ? "正在保存…" : "保存修改")
                    : isClosingEntry
                      ? `确认${ACTIONS[entryForm.action].label}参数`
                      : (saveEntryMutation.isPending ? "正在保存…" : "快速保存并记账")}
                </button>
              )}
            </div>}
          </div>
        </div>
      )}

      {canManage && openingEditSaveSafetyReview && (
        <div className="fixed inset-0 z-[75] flex items-end bg-slate-950/55 sm:items-center sm:justify-center sm:px-5" role="dialog" aria-modal="true" aria-label="异常开仓修改确认">
          <div className="w-full max-w-md rounded-t-2xl bg-white px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-5 shadow-2xl sm:rounded-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700">
                <AlertTriangle className="h-5 w-5" strokeWidth={2.4} />
              </div>
              <div className="min-w-0">
                <div className="text-lg font-semibold text-slate-900">请再次确认开仓数据</div>
                <p className="mt-1 text-xs leading-5 text-slate-600">为避免将数量和成交价写反，本次保存修改需要二次确认。未确认前不会修改订单。</p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-3">
              <div className="text-[11px] font-semibold text-rose-800">本次填写</div>
              <div className="mt-1 text-base font-bold tabular-nums text-rose-900">
                {formatQuantity(openingEditSaveSafetyReview.quantity)} ETH @ {formatPrice(openingEditSaveSafetyReview.price)} U
              </div>
              <div className="mt-3 space-y-2 text-xs leading-5 text-rose-800">
                {openingEditSaveSafetyReview.quantityExceeded && (
                  <div className="rounded-lg border border-rose-200 bg-white/75 px-3 py-2">
                    <span className="font-semibold">数量异常：</span>
                    当前 {formatQuantity(openingEditSaveSafetyReview.quantity)} ETH，超过单笔复核阈值 {T0_OPENING_EDIT_QUANTITY_REVIEW_LIMIT} ETH。
                  </div>
                )}
                {openingEditSaveSafetyReview.priceDeviationExceeded && openingEditSaveSafetyReview.markPrice !== null && openingEditSaveSafetyReview.priceDeviation !== null && (
                  <div className="rounded-lg border border-rose-200 bg-white/75 px-3 py-2">
                    <div><span className="font-semibold">成交价偏离：</span>当前成交价与实时参考价相差 {formatPrice(openingEditSaveSafetyReview.priceDeviation)} U，超过复核阈值 {T0_OPENING_EDIT_PRICE_DEVIATION_REVIEW_LIMIT} U。</div>
                    <div className="mt-0.5 font-medium tabular-nums text-rose-700">实时参考价 {formatPrice(openingEditSaveSafetyReview.markPrice)} U</div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={updateOpeningEntryMutation.isPending}
                onClick={() => setOpeningEditSaveSafetyReview(null)}
                className="h-12 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 active:bg-slate-50 disabled:opacity-45"
              >
                返回检查
              </button>
              <button
                type="button"
                disabled={updateOpeningEntryMutation.isPending}
                onClick={() => {
                  const review = openingEditSaveSafetyReview;
                  setOpeningEditSaveSafetyReview(null);
                  handleSaveEntry(review.manualConfirmPendingFill, true);
                }}
                className="h-12 rounded-xl bg-rose-600 text-sm font-semibold text-white shadow-sm active:scale-[0.99] disabled:opacity-45"
              >
                {updateOpeningEntryMutation.isPending ? "正在保存…" : "确认保存修改"}
              </button>
            </div>
          </div>
        </div>
      )}

      {canManage && partialOpeningAttributionDraft && (
        <div className="fixed inset-0 z-[72] flex items-end bg-slate-950/50 sm:items-center sm:justify-center sm:px-5" role="dialog" aria-modal="true" aria-label="选择账户和项目的生效范围">
          <div className="w-full max-w-md rounded-t-2xl bg-white px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-5 shadow-2xl sm:rounded-2xl">
            <div className="text-lg font-semibold text-slate-900">本次归属怎么生效？</div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {partialAttributionChangesRelatedUser
                ? "用户名已变更：已平历史的用户名、成交和收益固定不动；新用户名只用于承接剩余仓位。"
                : "关联用户名固定不变。请选择是否同步修改已平部分的账户和项目。"}
            </p>
            {partialOpeningAttributionError && (
              <div role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
                <span className="font-semibold">未执行：</span>{partialOpeningAttributionError}
              </div>
            )}
            <div className="mt-4 space-y-2.5">
              {!partialAttributionChangesRelatedUser && <button
                  type="button"
                  disabled={reassignOpeningRemainingMutation.isPending || updatePartialOpeningHistoricalAttributionMutation.isPending}
                  onClick={() => {
                    setPartialOpeningAttributionError(null);
                    setPartialOpeningAttributionScope("history");
                  }}
                  aria-pressed={partialOpeningAttributionScope === "history"}
                  className={`w-full rounded-xl border-2 px-4 py-3 text-left transition active:scale-[0.99] disabled:opacity-45 ${partialOpeningAttributionScope === "history" ? "border-indigo-500 bg-indigo-50/70 shadow-sm" : "border-slate-200 bg-white"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-indigo-900">同步修改已平历史</span>
                    <span className="shrink-0 text-xs font-semibold text-indigo-600">推荐用于归属录错</span>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-5 text-indigo-800/85">原开仓和已关联平仓的账户、项目一并更新。用户名、数量、成交价、手续费、订单收益、共享和分佣全部保持原样。</p>
                </button>}
              <button
                type="button"
                disabled={reassignOpeningRemainingMutation.isPending || updatePartialOpeningHistoricalAttributionMutation.isPending}
                onClick={() => {
                  setPartialOpeningAttributionError(null);
                  setPartialOpeningAttributionScope("future");
                }}
                aria-pressed={partialOpeningAttributionScope === "future"}
                className={`w-full rounded-xl border-2 px-4 py-3 text-left transition active:scale-[0.99] disabled:opacity-45 ${partialOpeningAttributionScope === "future" ? "border-indigo-500 bg-indigo-50/70 shadow-sm" : "border-slate-200 bg-white"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-800">仅影响之后的剩余仓位</span>
                  <span className="shrink-0 text-xs font-semibold text-slate-500">{formatQuantity(Number(partialOpeningAttributionDraft.remainingQuantity))} ETH</span>
                </div>
                <p className="mt-1.5 text-[11px] leading-5 text-slate-600">已平历史完全不动；剩余仓位会生成一张继承原成本价的新订单，并使用当前选择的账户、用户和项目。</p>
              </button>
            </div>
            <div className="mt-4 flex gap-2.5">
              <button
                type="button"
                disabled={reassignOpeningRemainingMutation.isPending || updatePartialOpeningHistoricalAttributionMutation.isPending}
                onClick={() => {
                  setPartialOpeningAttributionError(null);
                  setPartialOpeningAttributionScope(null);
                  setPartialOpeningAttributionDraft(null);
                }}
                className="h-12 flex-1 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 active:bg-slate-50 disabled:opacity-45"
              >
                取消
              </button>
              <button
                type="button"
                disabled={!partialOpeningAttributionScope || reassignOpeningRemainingMutation.isPending || updatePartialOpeningHistoricalAttributionMutation.isPending}
                onClick={() => partialOpeningAttributionScope && submitPartialOpeningAttribution(partialOpeningAttributionScope)}
                className="h-12 flex-[1.45] rounded-xl bg-indigo-600 text-sm font-semibold text-white shadow-sm active:scale-[0.99] disabled:bg-slate-200 disabled:text-slate-500"
              >
                {reassignOpeningRemainingMutation.isPending || updatePartialOpeningHistoricalAttributionMutation.isPending
                  ? "正在执行…"
                  : partialOpeningAttributionScope === "history"
                    ? "确定同步历史"
                    : partialOpeningAttributionScope === "future"
                      ? "确定仅影响后续"
                      : "请选择一项"}
              </button>
            </div>
          </div>
        </div>
      )}

      {canManage && showEntrySheet && takeProfitAllocationPlanIndex !== null && (
        <div className="fixed inset-0 z-[65] flex items-end bg-slate-950/45 sm:items-center sm:justify-center sm:px-5" role="dialog" aria-modal="true" aria-label="止盈预分配">
          <div className="max-h-[90vh] w-full overflow-y-auto rounded-t bg-white shadow-2xl sm:max-w-md sm:rounded">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">第 {takeProfitAllocationPlanIndex + 1} 段预分配</h3>
                <p className="mt-0.5 text-[11px] text-slate-500">触发时按实际成交、手续费与可用仓位重新结算</p>
              </div>
              <button type="button" onClick={closeTakeProfitAllocationPanel} className="flex h-8 w-8 items-center justify-center rounded border border-slate-200 text-slate-500"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3 px-4 py-3 pb-24">
              <div className="grid grid-cols-3 overflow-hidden rounded border border-slate-200 bg-white text-center">
                <div className="border-r border-slate-100 px-2 py-2">
                  <p className="text-[10px] text-slate-500">止盈价</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">{Number(entryForm.takeProfitPlans[takeProfitAllocationPlanIndex]?.price || 0).toFixed(2)}</p>
                </div>
                <div className="border-r border-slate-100 px-2 py-2">
                  <p className="text-[10px] text-slate-500">数量</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">{formatQuantity(Number(entryForm.takeProfitPlans[takeProfitAllocationPlanIndex]?.quantity || 0))} E</p>
                </div>
                <div className="px-2 py-2">
                  <p className="text-[10px] text-slate-500">预计净收益</p>
                  <p className={`mt-0.5 text-sm font-semibold tabular-nums ${sharedIncomeClosePreview.sourceNetPnl >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatSigned(sharedIncomeClosePreview.sourceNetPnl)} u</p>
                </div>
              </div>
              <div className="flex items-baseline justify-between border-b border-slate-100 pb-2 text-xs">
                <span className="font-medium text-slate-700">预计可共享</span>
                <span className="font-semibold tabular-nums text-slate-900">{sharedIncomeClosePreview.shareableAmount.toFixed(2)} u</span>
              </div>
              {sharedIncomeClosePreview.shareableAmount <= 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">此止盈价预计没有正向净收益，无需设置预分配。</p>
              ) : (
                renderSharedIncomeAllocationCandidates({
                  drafts: takeProfitSharedIncomeDrafts,
                  setDrafts: setTakeProfitSharedIncomeDrafts,
                  targetSelections: takeProfitSharedIncomeTargetSelections,
                  setTargetSelections: setTakeProfitSharedIncomeTargetSelections,
                  allocatedTotal: takeProfitSharedIncomeAllocatedTotal,
                  emptyMessage: "当前没有符合条件的其他未平仓关联用户；无需设置预分配。",
                })
              )}
            </div>
            <div className="sticky bottom-0 flex items-center gap-2 border-t border-slate-100 bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              <button type="button" onClick={() => { setTakeProfitSharedIncomeDrafts({}); setTakeProfitSharedIncomeTargetSelections({}); }} className="h-11 rounded border border-slate-200 px-4 text-sm font-semibold text-slate-600">清空</button>
              <div className="min-w-0 flex-1 text-right text-[11px] text-slate-500">已分 <span className={takeProfitSharedIncomeAllocatedTotal - sharedIncomeClosePreview.shareableAmount > 0.00001 ? "font-semibold text-rose-600" : "font-semibold text-slate-800"}>{takeProfitSharedIncomeAllocatedTotal.toFixed(2)} u</span></div>
              <button type="button" disabled={takeProfitSharedIncomeAllocatedTotal - sharedIncomeClosePreview.shareableAmount > 0.00001} onClick={saveTakeProfitAllocationPlan} className="h-11 rounded bg-blue-600 px-5 text-sm font-semibold text-white disabled:opacity-40">保存方案</button>
            </div>
          </div>
        </div>
      )}

	      {canManage && showEntrySheet && isClosingEntry && isCloseReview && (
	        <div className="fixed inset-0 z-[80] bg-white" role="dialog" aria-modal="true" aria-label={`${ACTIONS[entryForm.action].label}收益分配`}>
	          <div className="mx-auto flex h-full w-full max-w-2xl flex-col overflow-hidden bg-white">
	            <header className="flex h-12 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
	              <button type="button" disabled={saveEntryMutation.isPending} onClick={() => isCloseDistributionPreviewLink ? setLocation(`/ledger/${ledgerId}/t0-journal`) : setCloseConfirmationStep("input")} aria-label={isCloseDistributionPreviewLink ? "退出模拟预览" : "返回平仓参数"} className="flex h-8 w-8 items-center justify-center rounded border border-slate-200 bg-white text-slate-700 active:scale-95 disabled:opacity-40">{isCloseDistributionPreviewLink ? <X className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}</button>
              <div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><h2 className="truncate text-base font-semibold text-slate-900">平仓收益分配</h2>{isCloseDistributionPreviewLink && <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">模拟预览</span>}</div></div>
	            </header>
	            <main className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-3 py-2 pb-28 sm:px-5">
	              <section className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
	                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm font-semibold tabular-nums"><span className="text-slate-900">{ACTIONS[entryForm.action].label} {formatQuantity(Number(entryForm.quantity))} ETH</span><span className="text-slate-700">开 {closingSourceTrade ? formatPrice(closingSourceTrade.price) : entryForm.targetPrice === undefined ? "--" : formatPrice(entryForm.targetPrice)}</span><span className="text-slate-700">平 {formatPrice(Number(entryForm.price))}</span></div>
	                <div className="mt-2 flex overflow-hidden rounded border border-slate-200 text-center tabular-nums"><div className="min-w-0 flex-auto border-r border-slate-100 px-2 py-2"><div className="text-[10px] text-slate-500">本次利润分配</div><div className="mt-0.5 whitespace-nowrap text-base font-bold text-rose-600">{sharedIncomeBudget.maximum.toFixed(2)} <span className="text-[10px] font-medium">u</span></div></div><div className="min-w-0 flex-auto px-2 py-2"><div className="text-[10px] text-slate-500">本次计划分配</div><div className="mt-0.5 whitespace-nowrap text-base font-bold" style={{ color: "#2563EB" }}>{sharedIncomeBudget.allocationLimit.toFixed(2)} <span className="text-[10px] font-medium">u</span><span className="ml-1 text-base font-bold" style={{ color: "#111827" }}>{sharedIncomeBudgetPercentage.toFixed(2)}%</span></div></div></div>
	                {sharedIncomeClosePreview.shareableAmount > 0 && sharedIncomeClosePreview.sourceNetPnl > 0 && (
	                  <div className="mt-2">
	                    <div className="flex items-center justify-between gap-2">
	                      <div className="text-xs font-semibold text-slate-700">本次拿出多少分配</div>
	                      <div className="flex overflow-hidden rounded border border-slate-200 text-[11px] font-semibold">
	                        <button
	                          type="button"
	                          onClick={() => {
	                            const percentage = sharedIncomeBudget.maximum > 0
	                              ? Math.min(99, Math.max(1, Math.round(sharedIncomeBudgetPercentage)))
	                              : 1;
	                            setSharedIncomeAllocationBudgetMode("percentage");
	                            setSharedIncomeAllocationBudgetValue(String(percentage));
	                            setSharedIncomeAllocationPlanError(null);
	                          }}
	                          className={`h-8 px-3 ${sharedIncomeAllocationBudgetMode === "percentage" ? "bg-blue-600 text-white" : "bg-white text-slate-600"}`}
	                        >按比例</button>
	                        <button
	                          type="button"
	                          onClick={() => {
	                            setSharedIncomeAllocationBudgetMode("amount");
	                            setSharedIncomeAllocationBudgetValue(sharedIncomeBudget.allocationLimit.toFixed(2));
	                            setSharedIncomeAllocationPlanError(null);
	                          }}
	                          className={`h-8 border-l border-slate-200 px-3 ${sharedIncomeAllocationBudgetMode === "amount" ? "bg-blue-600 text-white" : "bg-white text-slate-600"}`}
	                        >填金额</button>
	                      </div>
	                    </div>
	                    <div className="mt-2">
	                      {sharedIncomeAllocationBudgetMode === "percentage" ? (
	                        <div className="rounded border border-slate-200 bg-white px-3 py-2">
	                          <div className="flex items-center gap-2 text-[10px] font-medium tabular-nums text-slate-500">
	                            <span>1%</span>
	                            <input
	                              type="range"
	                              min="1"
	                              max="99"
	                              step="1"
	                              value={sharedIncomeBudgetSliderPercentage}
	                              aria-label="本次共享分配比例，1%至99%"
	                              onChange={(event) => { setSharedIncomeAllocationBudgetValue(event.target.value); setSharedIncomeAllocationPlanError(null); }}
	                              className="h-3 min-w-0 flex-1 cursor-pointer accent-blue-600"
	                            />
	                            <span>99%</span>
	                          </div>
	                          <div className="mt-2 grid grid-cols-4 gap-1.5">
	                            {[10, 25, 30, 50].map((value) => <button key={value} type="button" onClick={() => { setSharedIncomeAllocationBudgetValue(String(value)); setSharedIncomeAllocationPlanError(null); }} className={`h-7 min-w-0 rounded border px-0.5 text-[10px] font-semibold tabular-nums active:scale-[0.98] ${sharedIncomeAllocationBudgetValue === String(value) ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600"}`}>{value}%</button>)}
	                          </div>
	                        </div>
	                      ) : (
	                        <div className="relative">
	                          <input
	                            aria-label="本次共享分配金额"
	                            value={sharedIncomeAllocationBudgetValue}
	                            onChange={(event) => { setSharedIncomeAllocationBudgetValue(event.target.value.replace(/[^0-9.]/g, "")); setSharedIncomeAllocationPlanError(null); }}
	                            inputMode="decimal"
                            className="h-8 w-full rounded border border-slate-300 bg-white px-3 pr-8 text-right text-[16px] font-semibold tabular-nums text-slate-900 outline-none focus:border-blue-500"
	                          />
	                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500">u</span>
	                        </div>
	                      )}
	                    </div>
	                  </div>
	                )}
	              </section>
	              {sharedIncomeClosePreview.shareableAmount > 0 && sharedIncomeClosePreview.sourceNetPnl > 0 ? <>
	                <section className="mt-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
	                  <div className="flex items-center justify-between gap-2"><div className="text-sm font-semibold text-slate-900">AI 智能分配方案</div><div className="flex shrink-0 items-center gap-1.5"><button type="button" onClick={() => setShowSharedIncomeAllocationGuide(true)} className="inline-flex h-8 items-center gap-1 rounded border border-indigo-100 bg-indigo-50 px-2 text-[11px] font-semibold text-indigo-700 active:scale-[0.98]"><BookOpen className="h-3.5 w-3.5" />方案说明</button><button type="button" onClick={() => { setSharedIncomeAllocationMetrics([]); setSharedIncomeTargetSelections({}); setSharedIncomeAllocationPlanError(null); }} className={`h-8 rounded border px-2.5 text-[11px] font-semibold ${sharedIncomeAllocationMetrics.length === 0 ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 bg-white text-slate-600"}`}>手动</button></div></div>
	                  <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
	                    {sharedIncomeAvailableAllocationDimensions.map((dimension) => {
	                      const isSelected = sharedIncomeAllocationMetrics.includes(dimension.id);
	                      return <button key={dimension.id} type="button" aria-pressed={isSelected} onClick={() => toggleSharedIncomeAllocationMetric(dimension.id)} className={`flex min-h-11 flex-col items-center justify-center rounded border px-1 leading-tight ${isSelected ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700"}`}><span className="flex items-center gap-1 text-[11px] font-semibold">{isSelected && <Check className="h-3 w-3 shrink-0" strokeWidth={2.5} />}{dimension.label}</span><span className={`mt-0.5 text-[9px] font-medium ${isSelected ? "text-blue-500" : "text-slate-400"}`}>{dimension.category}</span></button>;
	                    })}
	                  </div>
	                  {sharedIncomeAllocationMetrics.includes("openingOrderCount") && <div className="mt-2.5 rounded-md border border-indigo-100 bg-indigo-50/55 px-2.5 py-2"><div className="flex items-baseline justify-between gap-2"><div className="text-[11px] font-semibold text-indigo-900">挂单数量倾斜度</div><div className="text-xs font-bold tabular-nums text-indigo-700">{sharedIncomeOpeningOrderCountIntensity}%</div></div><input type="range" min="0" max="100" step="1" value={sharedIncomeOpeningOrderCountIntensity} aria-label="挂单数量倾斜度，0%为全员均分，100%为完全按挂单数量" onChange={(event) => setSharedIncomeOpeningOrderCountIntensity(Math.min(100, Math.max(0, Number(event.target.value) || 0)))} className="mt-1.5 h-3 w-full cursor-pointer accent-indigo-600" /><div className="mt-1 flex justify-between text-[9px] font-medium text-indigo-500"><span>0% 全员均分</span><span>100% 挂单比例</span></div><div className="mt-1.5 text-[10px] leading-4 text-indigo-700/80">当前：{100 - sharedIncomeOpeningOrderCountIntensity}% 均分保障 + {sharedIncomeOpeningOrderCountIntensity}% 按累计挂单数量倾斜。</div></div>}
	                  {sharedIncomeSelectedDimensions.length > 0 && <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] leading-4 text-slate-500"><span>已选 {sharedIncomeSelectedDimensions.length} 个维度：</span>{sharedIncomeSelectedDimensions.map((dimension, index) => <span key={dimension.id} className="whitespace-nowrap font-medium text-blue-700">{index > 0 && <span className="mr-1.5 text-slate-300">·</span>}{dimension.compactLabel} {sharedIncomeDimensionWeightPercentage.toFixed(2)}%</span>)}</div>}
	                </section>
	                <section className="mt-3"><div className="mb-2 flex items-center justify-between gap-3 px-0.5"><div className="text-sm font-semibold text-slate-800">{sharedIncomeAllocationMetrics.length === 0 ? "共享分配人" : "共享分配清单"}</div><div className="text-[11px] tabular-nums text-slate-500">已分 <b className={sharedIncomeAllocatedTotal - sharedIncomeBudget.allocationLimit > 0.00001 ? "text-rose-600" : "text-slate-800"}>{sharedIncomeAllocatedTotal.toFixed(2)} u</b> · 剩余 <b className="text-slate-800">{Math.max(0, sharedIncomeBudget.allocationLimit - sharedIncomeAllocatedTotal).toFixed(2)} u</b></div></div>{renderSharedIncomeAllocationCandidates({
	                  drafts: sharedIncomeDrafts,
	                  setDrafts: setSharedIncomeDrafts,
	                  targetSelections: sharedIncomeTargetSelections,
	                  setTargetSelections: setSharedIncomeTargetSelections,
	                  allocatedTotal: sharedIncomeAllocatedTotal,
	                  allocationLimit: sharedIncomeBudget.allocationLimit,
	                  compactAllocationMetric: sharedIncomeSelectedDimensions.length === 0 ? undefined : sharedIncomeSelectedDimensions.length === 1 ? sharedIncomeSelectedDimensions[0].id : "combined",
	                  showEligibilityControls: true,
	                  eligibilityPendingUserId: isCloseDistributionPreviewLink || setSharedIncomeEligibilityMutation.isPending ? "pending" : null,
	                  onEligibilityChange: changeSharedIncomeCandidateEligibility,
	                  emptyMessage: "当前没有符合条件的其他关联用户；可直接确认平仓。",
	                  footerText: "资格开关按本单订单使用者分别保存。关闭不会改动历史共享、项目分佣或任何开平仓流水。",
	                })}</section>
	              </> : <section className="mt-3 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-5 text-center text-xs leading-5 text-slate-500">本单没有可共享的正向净收益，可直接确认平仓；收益为负或未关联用户的订单不会触发共享分配。</section>}
	              {(sharedIncomeBudget.error || sharedIncomeAllocationPlanError || closeSaveError) && <div role="alert" className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">{closeSaveError ? <><span className="font-semibold">平仓未确认：</span>{closeSaveError}</> : sharedIncomeAllocationPlanError || sharedIncomeBudget.error}</div>}
	            </main>
	            <footer className="shrink-0 border-t border-slate-200 bg-white px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-2px_12px_rgba(15,23,42,0.06)] sm:px-5">
	              <div className="mx-auto w-full max-w-2xl">
	                {closeSaveError && <div role="alert" className="mb-2 rounded border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-medium leading-5 text-rose-700"><span className="font-semibold">平仓未确认：</span>{closeSaveError}</div>}
	                <div className="flex gap-2">
	                  <button type="button" disabled={saveEntryMutation.isPending || setSharedIncomeEligibilityMutation.isPending} onClick={() => { setSharedIncomeDrafts({}); setSharedIncomeTargetSelections({}); setSharedIncomeAllocationMetrics([]); setSharedIncomeAllocationBudgetMode("amount"); setSharedIncomeAllocationBudgetValue("0"); setSharedIncomeAllocationPlanError(null); }} className="h-11 shrink-0 rounded border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 active:scale-[0.99] disabled:opacity-40">不分配</button>
	                  <button disabled={isCloseDistributionPreviewLink || saveEntryMutation.isPending || setSharedIncomeEligibilityMutation.isPending || Boolean(sharedIncomeBudget.error) || sharedIncomeAllocatedTotal - sharedIncomeBudget.allocationLimit > 0.00001} onClick={() => handleSaveEntry()} className="h-11 min-w-0 flex-1 rounded bg-amber-600 px-4 text-sm font-semibold text-white shadow-sm active:scale-[0.99] disabled:opacity-40">{isCloseDistributionPreviewLink ? "模拟预览，不提交" : saveEntryMutation.isPending ? "正在确认…" : `确认${ACTIONS[entryForm.action].label} ${formatQuantity(Number(entryForm.quantity))} ETH`}</button>
	                </div>
	              </div>
	            </footer>
	          </div>
	        </div>
	      )}

      {((showEntrySheet && showSharedIncomeAllocationGuide) || isSharedIncomeAllocationGuideRoute) && <SharedIncomeAllocationGuidePage
        exportRef={sharedIncomeAllocationGuideExportRef}
        currentUser={me as any}
        principalRule={sharedIncomePrincipalRule}
        canManage={canManage}
        onConfigurePrincipal={() => {
          setSharedIncomePrincipalRule(savedSharedIncomePrincipalRule);
          setShowSharedIncomePrincipalRuleSettings(true);
        }}
        onClose={() => {
          setShowSharedIncomePrincipalRuleSettings(false);
          if (isSharedIncomeAllocationGuideRoute) setLocation(closeSharedIncomeAllocationGuideRoute);
          else setShowSharedIncomeAllocationGuide(false);
        }}
      />}
      {showSharedIncomePrincipalRuleSettings && <SharedIncomePrincipalRuleSettingsPage
        rule={sharedIncomePrincipalRule}
        onChange={setSharedIncomePrincipalRule}
        isSaving={setSharedIncomePrincipalRuleMutation.isPending}
        onSaveAndExit={() => setSharedIncomePrincipalRuleMutation.mutate({
          ledgerId: 52,
          curve: sharedIncomePrincipalRule.curve,
          influencePercentage: sharedIncomePrincipalRule.influencePercentage,
        })}
        onClose={() => {
          setSharedIncomePrincipalRule(savedSharedIncomePrincipalRule);
          setShowSharedIncomePrincipalRuleSettings(false);
        }}
      />}

      {canManage && profitShareSource && (
        <div className="fixed inset-0 z-[60] flex items-end bg-slate-950/40 sm:items-center sm:justify-center sm:px-5" role="dialog" aria-modal="true" aria-label={entryProfitShareEditTarget ? "编辑本单收益分配" : "管理收益分配"}>
          <div className="max-h-[88vh] w-full max-w-sm overflow-y-auto rounded-t bg-white p-5 shadow-2xl sm:rounded">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-base font-semibold text-slate-900">{entryProfitShareEditTarget ? "编辑本单收益分配" : "收益分配"}</div>
                <p className="mt-1 text-xs leading-5 text-slate-500">{entryProfitShareEditTarget ? `调整持仓单的剩余仓位，并同步项目 ${profitShareSource.name} 之后新开的订单` : `为项目 ${profitShareSource.name} 设置用户收益分配清单`}</p>
              </div>
              <button type="button" onClick={closeProfitShareManager} aria-label="关闭收益分配" className="rounded p-1 text-slate-400 active:scale-90">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 rounded border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] leading-5 text-slate-600">
              {entryProfitShareEditTarget
                ? "保存到本单后，已平仓流水与其收益分配永久不变；本单尚未平掉的数量，以及本项目之后新开的订单，均采用此清单。"
                : "项目是下单归属，受益人只能选择全局用户。每位比例为1–100的整数，所有用户合计必须恰好100%。仅之后新开的订单会固化本清单；平仓沿用对应开仓当时比例，并按同一比例承担开、平交易成本。"}
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-semibold text-slate-700">收益分配人（全局用户）</div>
                <div className={`text-xs font-semibold tabular-nums ${profitShareDraftTotal === 100 ? "text-emerald-600" : "text-rose-600"}`}>合计 {profitShareDraftTotal}% / 100%</div>
              </div>
              {profitShareDraftTotal !== 100 && <div role="status" aria-live="polite" className="mt-1 text-[11px] leading-5 text-rose-600">当前合计 {profitShareDraftTotal}%；请调整或移除分配人，使合计恰好为 100% 后再保存。</div>}
              <div className="mt-2 overflow-hidden rounded border border-slate-200">
                {profitShareAllocations.map((allocation, index) => {
                  return <div key={allocation.user.id} className={`flex items-center gap-2 px-3 py-2.5 ${index > 0 ? "border-t border-slate-100" : ""}`}>
                    <UserRound className="h-4 w-4 shrink-0 text-indigo-500" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-800">{allocation.user.name}</div>
                      <div className="text-[10px] text-slate-400">{allocation.user.username ? `@${allocation.user.username}` : "收益分配人"}</div>
                    </div>
                    <div className="flex w-[76px] items-center rounded border border-slate-200 px-2 focus-within:border-indigo-500">
                      <input type="number" inputMode="numeric" min={1} max={100} step={1} value={allocation.percentage} onChange={(event) => { setProfitShareSaveError(null); setProfitShareAllocations((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, percentage: event.target.value } : item)); }} className="h-9 min-w-0 flex-1 text-right text-sm font-semibold tabular-nums text-slate-800 outline-none" />
                      <span className="text-xs text-slate-500">%</span>
                    </div>
                    <button type="button" onClick={() => { setProfitShareSaveError(null); setProfitShareAllocations((current) => current.filter((_, itemIndex) => itemIndex !== index)); }} className="text-xs font-semibold text-rose-600">移除</button>
                  </div>;
                })}
              </div>
            </div>

            <div className="mt-4">
              <button type="button" disabled={profitShareAllocations.length >= 20} aria-haspopup="dialog" aria-expanded={profitShareRecipientPickerOpen} onClick={() => { setProfitShareRecipientSearch(""); setProfitShareRecipientPickerOpen(true); }} className="flex h-11 w-full items-center gap-2 rounded border border-slate-200 bg-white px-3 text-left text-sm text-slate-500 transition active:bg-indigo-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400">
                <Search className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1">点击搜索并添加收益分配人</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2.2} />
              </button>
              <p className="mt-1.5 text-[11px] leading-5 text-slate-400">仅可引用全局已有用户；添加后请在上方调整整数比例。</p>
            </div>

            {entryProfitShareEditTarget ? <div className="mt-3 text-[11px] leading-5 text-indigo-700">点击下方“保存本单与后续新单”即刻生效，无需再点击持仓编辑页底部“保存修改”。</div> : activeProfitShareRules.length > 0 && <div className="mt-3 text-[11px] leading-5 text-slate-500">保存后，本项目仍有剩余仓位的订单与后续新订单都会采用新清单；已全部平仓的历史订单保持原快照。</div>}
            {profitShareSaveError && <div role="alert" className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] leading-5 text-rose-700"><span className="font-semibold">尚未保存：</span>{profitShareSaveError}</div>}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" onClick={closeProfitShareManager} className="h-11 rounded border border-slate-200 bg-white text-sm font-semibold text-slate-700">取消</button>
              <button type="button" disabled={setProfitShareRuleMutation.isPending || updateOpeningProfitShareMutation.isPending} onClick={submitProfitShareRule} className="h-11 rounded bg-indigo-600 text-sm font-semibold text-white disabled:opacity-40">{setProfitShareRuleMutation.isPending || updateOpeningProfitShareMutation.isPending ? "正在保存…" : entryProfitShareEditTarget ? "保存本单与后续新单" : "保存并返回订单"}</button>
            </div>
          </div>
          {profitShareRecipientPickerOpen && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 px-4 py-6" role="dialog" aria-modal="true" aria-label="添加收益分配人" onMouseDown={() => { setProfitShareRecipientPickerOpen(false); setProfitShareRecipientSearch(""); }}>
            <section className="flex max-h-[78dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
              <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
                <div className="min-w-0 flex-1"><h3 className="text-base font-semibold text-slate-900">添加收益分配人</h3><p className="mt-0.5 text-[11px] text-slate-400">点击用户即可加入分配清单</p></div>
                <button type="button" onClick={() => { setProfitShareRecipientPickerOpen(false); setProfitShareRecipientSearch(""); }} aria-label="关闭收益分配人选择" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 active:bg-slate-100"><X className="h-4 w-4" /></button>
              </header>
              <div className="border-b border-slate-100 px-4 py-2.5">
                <div className="flex h-10 items-center gap-2 rounded-lg bg-slate-100 px-3">
                  <Search className="h-4 w-4 shrink-0 text-slate-400" />
                  <input autoFocus value={profitShareRecipientSearch} onChange={(event) => setProfitShareRecipientSearch(event.target.value)} placeholder="搜索全局用户" className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400" />
                  {profitShareRecipientSearch && <button type="button" onClick={() => setProfitShareRecipientSearch("")} aria-label="清空分配人搜索" className="text-slate-400 active:scale-90"><X className="h-4 w-4" /></button>}
                </div>
              </div>
              <div className="min-h-0 overflow-y-auto px-4 py-3">
                {profitShareAllocations.length >= 20 ? <div className="py-10 text-center text-sm text-slate-400">收益分配人最多20位</div>
                  : profitShareRecipientSearch.trim().length === 0 ? profitShareRecipientCandidates.length > 0 ? <div className="grid grid-cols-2 border-y border-slate-200" aria-label="常用收益分配人">
                    {profitShareRecipientCandidates.map((user, index) => <button key={user.id} type="button" onClick={() => addProfitShareRecipient(user)} title={user.name} className={`flex h-10 min-w-0 items-center justify-center gap-1 px-2 text-center text-xs font-medium text-slate-700 transition active:bg-indigo-50 ${index % 2 === 0 ? "border-r border-slate-200" : ""} ${index + 2 < profitShareRecipientCandidates.length ? "border-b border-slate-200" : ""}`}><span className="max-w-[58%] truncate">{user.name}</span>{user.username && <span className="max-w-[38%] truncate text-[10px] text-slate-400">@{user.username}</span>}</button>)}
                  </div> : <div className="py-10 text-center text-sm text-slate-400">常用用户均已加入分配清单</div>
                    : Array.isArray(profitShareRecipientSearchQuery.data) && profitShareRecipientSearchQuery.data.length > 0 ? (() => {
                      const candidates = (profitShareRecipientSearchQuery.data as any[])
                        .map((candidate) => ({ id: String(candidate.id), name: String(candidate.name || candidate.username || `用户#${candidate.id}`), username: candidate.username ? String(candidate.username) : undefined }))
                        .filter((user) => !profitShareAllocations.some((allocation) => allocation.user.id === user.id));
                      return candidates.length > 0 ? <div className="grid grid-cols-2 border-y border-slate-200" aria-busy={profitShareRecipientSearchUpdating} aria-label="全局收益分配人搜索结果">
                        {candidates.map((user, index) => <button key={user.id} type="button" disabled={profitShareRecipientSearchDataMayNotMatch} onClick={() => addProfitShareRecipient(user)} title={user.name} className={`flex h-10 min-w-0 items-center justify-center gap-1 px-2 text-center text-xs font-medium text-slate-700 transition active:bg-indigo-50 disabled:opacity-55 ${index % 2 === 0 ? "border-r border-slate-200" : ""} ${index + 2 < candidates.length ? "border-b border-slate-200" : ""}`}><span className="max-w-[58%] truncate">{user.name}</span>{user.username && <span className="max-w-[38%] truncate text-[10px] text-slate-400">@{user.username}</span>}</button>)}
                      </div> : <div className="py-10 text-center text-sm text-slate-400">匹配用户均已加入分配清单</div>;
                    })() : profitShareRecipientSearchUpdating ? <div role="status" className="py-10 text-center text-sm text-slate-400">正在搜索全局用户…</div> : <div className="py-10 text-center text-sm text-slate-400">未找到匹配用户</div>}
              </div>
            </section>
          </div>}
        </div>
      )}

      {canManage && directoryManagerKind && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-5" role="dialog" aria-modal="true" aria-label={directoryManagerTitle}>
          <div className="max-h-[84vh] w-full max-w-sm overflow-y-auto rounded bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-base font-semibold text-slate-900">{directoryManagerTitle}</div>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {directoryManagerKind === "relatedUser"
                    ? "关联用户仅引用全局已有用户，本页不能创建或改名；移除只在当前T+0账本隐藏该关联，不会更改全局用户资料。"
                    : "改名会同步历史展示；删除后不再用于新订单，历史字段显示为未关联。"}
                </p>
              </div>
              <button type="button" onClick={closeDirectoryManager} aria-label="关闭名称管理" className="rounded p-1 text-slate-400 active:scale-90">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 overflow-hidden rounded border border-slate-200">
              {directoryManagerItems.length > 0 ? directoryManagerItems.map((item, index) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 px-3 py-3 ${index > 0 ? "border-t border-slate-100" : ""}`}
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{item.name}</span>
                  {item.secondary && <span className="max-w-[34%] truncate text-xs text-slate-400">{item.secondary}</span>}
                  <div className="flex shrink-0 items-center gap-2">
                    {directoryManagerKind !== "relatedUser" && (
                      <button
                        type="button"
                        onClick={() => openDirectoryRename({ kind: directoryManagerKind, id: item.id, name: item.name, username: item.secondary })}
                        className="text-xs font-semibold text-indigo-600"
                      >
                        编辑
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openDirectoryDelete({ kind: directoryManagerKind, id: item.id, name: item.name, username: item.secondary })}
                      className="text-xs font-semibold text-rose-600"
                    >
                      {directoryManagerKind === "relatedUser" ? "移除" : "删除"}
                    </button>
                  </div>
                </div>
              )) : (
                <div className="px-4 py-8 text-center text-sm text-slate-400">
                  {directoryManagerKind === "relatedFund" ? "该用户暂未保存项目" : "暂未保存可管理的名称"}
                </div>
              )}
            </div>

            <button type="button" onClick={closeDirectoryManager} className="mt-4 h-10 w-full rounded border border-slate-200 bg-white text-sm font-semibold text-slate-700 active:bg-slate-50">
              完成
            </button>
          </div>
        </div>
      )}

      {canManage && directoryRenameTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 px-5" role="dialog" aria-modal="true" aria-label="确认修改名称">
          <div className="w-full max-w-sm rounded bg-white p-5 shadow-2xl">
            <div className="text-base font-semibold text-slate-900">
              修改{directoryRenameTarget.kind === "account" ? "账户" : "项目"}名称
            </div>
            {directoryImpactQuery.isLoading ? (
              <div className="mt-3 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">正在核对历史流水影响范围…</div>
            ) : directoryImpactQuery.data ? (
              <div className="mt-3 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                <div className="font-semibold text-slate-700">改名会同步更新 {(directoryImpactQuery.data as any).affectedEntryCount} 条历史记录</div>
                {(directoryImpactQuery.data as any).accounts?.length > 0 && (
                  <div className="mt-1 truncate">涉及账户：{(directoryImpactQuery.data as any).accounts.map((item: any) => `${item.name}（${item.count}条）`).join("、")}</div>
                )}
              </div>
            ) : null}
            <input
              autoFocus
              value={directoryRenameDraft}
              maxLength={80}
              onChange={(event) => setDirectoryRenameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitDirectoryRename();
              }}
              className="mt-4 h-11 w-full rounded border border-slate-300 px-3 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-500"
            />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={isDirectoryRenamePending}
                onClick={() => setDirectoryRenameTarget(null)}
                className="h-11 rounded border border-slate-200 bg-white text-sm font-semibold text-slate-700 active:bg-slate-50 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={isDirectoryRenamePending || !directoryRenameDraft.trim()}
                onClick={submitDirectoryRename}
                className="h-11 rounded bg-indigo-600 text-sm font-semibold text-white active:bg-indigo-700 disabled:opacity-50"
              >
                {isDirectoryRenamePending ? "保存中…" : "确认改名"}
              </button>
            </div>
          </div>
        </div>
      )}

      {canManage && directoryDeleteTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 px-5" role="dialog" aria-modal="true" aria-label="确认删除目录项">
          <div className="max-h-[86vh] w-full max-w-sm overflow-y-auto rounded bg-white p-5 shadow-2xl">
            <div className="text-base font-semibold text-slate-900">
              {directoryDeleteTarget.kind === "relatedUser" ? "移除关联用户？" : `删除${directoryDeleteTarget.kind === "account" ? "账户" : "项目"}？`}
            </div>
            <div className="mt-1 truncate text-sm font-semibold text-slate-700">{directoryDeleteTarget.name}</div>
            {directoryImpactQuery.isLoading ? (
              <div className="mt-4 rounded border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">正在核对历史流水与未平仓数量…</div>
            ) : directoryImpactQuery.data ? (() => {
              const impact: any = directoryImpactQuery.data;
              const hasOutstandingPosition = Number(impact.outstandingQuantity || 0) > 0;
              const summaryRows = [
                ["账户", impact.accounts],
                ["用户", impact.users],
                ["项目", impact.funds],
              ].filter(([, items]: any) => Array.isArray(items) && items.length > 0) as Array<[string, Array<{ id: number; name: string; count: number }>]>;
              return <>
                <div className="mt-4 rounded border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-900">
                  <div className="font-semibold">将影响 {impact.affectedEntryCount} 条已保存历史记录</div>
                  <div className="mt-1">{directoryDeleteTarget.kind === "relatedUser"
                    ? "移除后，该用户仅从当前T+0账本的新订单选择与筛选中隐藏；不会创建、修改或删除全局用户资料。相关历史字段会显示为“未关联”。"
                    : "删除后，该项不再出现在新订单选择与筛选中；相关历史字段会显示为“未关联”。"} 稳定关联键仍保留在审计与仓位核对中，不会破坏既有开平匹配。</div>
                </div>
                <div className="mt-3 overflow-hidden rounded border border-slate-200 text-xs leading-5">
                  {summaryRows.map(([label, items], index) => (
                    <div key={label} className={`px-3 py-2 ${index > 0 ? "border-t border-slate-100" : ""}`}>
                      <span className="font-semibold text-slate-700">涉及{label}：</span>
                      <span className="text-slate-600">{items.map((item) => `${item.name}（${item.count}条）`).join("、")}</span>
                    </div>
                  ))}
                </div>
                {hasOutstandingPosition && (
                  <div className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800">
                    当前仍有 {Number(impact.outstandingQuantity).toFixed(2)} ETH 未平仓。删除后不会影响这部分旧仓继续平仓与FIFO核对，但其历史字段会立即显示为“未关联”。
                  </div>
                )}
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={isDirectoryDeletePending}
                    onClick={() => setDirectoryDeleteTarget(null)}
                    className="h-11 rounded border border-slate-200 bg-white text-sm font-semibold text-slate-700 active:bg-slate-50 disabled:opacity-50"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={isDirectoryDeletePending}
                    onClick={() => deleteDirectoryItemMutation.mutate({
                      ledgerId: 52,
                      dimension: directoryDeleteTarget.kind === "account" ? "account" : directoryDeleteTarget.kind === "relatedFund" ? "related_fund" : "related_user",
                      dimensionId: Number(directoryDeleteTarget.id),
                      expectedAffectedEntryCount: Number(impact.affectedEntryCount || 0),
                    })}
                    className="h-11 rounded bg-rose-600 text-sm font-semibold text-white active:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isDirectoryDeletePending ? "处理中…" : directoryDeleteTarget.kind === "relatedUser" ? "确认移除关联" : "确认删除"}
                  </button>
                </div>
              </>;
            })() : (
              <div className="mt-4 rounded border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">无法读取影响范围，请关闭后重试。</div>
            )}
          </div>
        </div>
      )}

      {showGlobalLedger && canManage && (
        <div className="fixed inset-0 z-[58] bg-slate-50" role="dialog" aria-modal="true" aria-label="T加零全局账本">
          <div className="mx-auto flex h-full w-full max-w-md flex-col overflow-hidden bg-slate-50">
            <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 shadow-[0_1px_3px_rgba(15,23,42,0.05)] backdrop-blur">
              <button type="button" onClick={() => setShowGlobalLedger(false)} aria-label="关闭全局账本" className="flex h-8 w-8 items-center justify-center rounded border border-slate-200 bg-white active:scale-95"><ArrowLeft className="h-4 w-4 text-slate-700" /></button>
              <div className="min-w-0 flex-1"><h2 className="font-semibold text-slate-900">T+0 全局账本</h2><div className="truncate text-[11px] text-slate-500">按用户查看订单与资金概览</div></div>
            </header>
            <div className="grid shrink-0 grid-cols-4 border-b border-slate-200 bg-white px-3 pt-1">
              <button type="button" onClick={() => setGlobalLedgerTab("positions")} className={`h-8 border-b-2 text-[12px] font-semibold transition ${globalLedgerTab === "positions" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400"}`}>持币量</button>
              <button type="button" onClick={() => setGlobalLedgerTab("funds")} className={`h-8 border-b-2 text-[12px] font-semibold transition ${globalLedgerTab === "funds" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400"}`}>充提现</button>
              <button type="button" onClick={() => setGlobalLedgerTab("income")} className={`h-8 border-b-2 text-[12px] font-semibold transition ${globalLedgerTab === "income" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400"}`}>收入</button>
              <button type="button" onClick={() => setGlobalLedgerTab("system")} className={`h-8 border-b-2 text-[12px] font-semibold transition ${globalLedgerTab === "system" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400"}`}>动态</button>
            </div>
            <main className="min-h-0 flex-1 overflow-y-auto">
              {globalLedgerTab === "positions" && <>
              {globalLedgerRows.length > 0 ? <div className="divide-y divide-slate-200 border-y border-slate-200 bg-white">
                <div className="grid grid-cols-[72px_repeat(4,minmax(0,1fr))] divide-x divide-slate-200 items-center border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-medium text-slate-500"><span className="pr-1">用户</span><span className="px-1 text-right">多</span><span className="px-1 text-right">空</span><span className="px-1 text-right">差额</span><span className="pl-1 text-right">浮盈</span></div>
                {globalLedgerRows.map((row) => {
                const netPosition = row.longQuantity - row.shortQuantity;
                const netPositionLabel = netPosition > 0.0000001 ? "多" : netPosition < -0.0000001 ? "空" : "平";
                const netPositionClass = netPosition > 0.0000001 ? "text-rose-600" : netPosition < -0.0000001 ? "text-emerald-600" : "text-slate-500";
                const floatingPnlClass = row.floatingPnl === null ? "text-slate-400" : row.floatingPnl >= 0 ? "text-rose-600" : "text-emerald-600";
                return <button key={row.userId} type="button" onClick={() => {
                  setRelatedUserFilterIds([row.userId]);
                  setSelectedAccountIds([]);
                  setRelatedFundFilterIds([]);
                  setShowGlobalLedger(false);
                }} className="grid min-h-11 w-full grid-cols-[72px_repeat(4,minmax(0,1fr))] divide-x divide-slate-200 items-center px-3 py-1 text-left tabular-nums transition active:bg-slate-50">
                  <span className="min-w-0 truncate pr-1 text-[13px] font-semibold text-slate-800">{row.name}</span>
                  <span className="whitespace-nowrap px-1 text-right text-[13px] font-semibold text-rose-600">{formatQuantity(row.longQuantity)}</span>
                  <span className="whitespace-nowrap px-1 text-right text-[13px] font-semibold text-emerald-600">{formatQuantity(row.shortQuantity)}</span>
                  <span className={`whitespace-nowrap px-1 text-right text-[13px] font-semibold ${netPositionClass}`}>{formatQuantity(Math.abs(netPosition))}</span>
                  <span className={`whitespace-nowrap pl-1 text-right text-[13px] font-semibold ${floatingPnlClass}`}>{row.floatingPnl === null ? "--" : formatGlobalLedgerWhole(row.floatingPnl)}</span>
                </button>;
              })}</div> : <div className="px-5 py-14 text-center text-sm text-slate-400">当前还没有关联用户订单。</div>}
              </>}
              {globalLedgerTab === "funds" && <>
                {globalFundsRows.length > 0 ? <div className="divide-y divide-slate-200 border-y border-slate-200 bg-white">
                  <div className="grid grid-cols-[72px_repeat(3,minmax(0,1fr))] divide-x divide-slate-200 items-center border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-medium text-slate-500"><span className="pr-1">用户</span><button type="button" onClick={() => setGlobalFundsSort((current) => current?.key === "deposit" ? { key: "deposit", direction: current.direction === "desc" ? "asc" : "desc" } : { key: "deposit", direction: "desc" })} className="whitespace-nowrap px-1 text-right active:text-slate-900" title="点击按充值金额排序">充值{globalFundsSort?.key === "deposit" ? (globalFundsSort.direction === "desc" ? " ↓" : " ↑") : ""}</button><button type="button" onClick={() => setGlobalFundsSort((current) => current?.key === "withdrawal" ? { key: "withdrawal", direction: current.direction === "desc" ? "asc" : "desc" } : { key: "withdrawal", direction: "desc" })} className="whitespace-nowrap px-1 text-right active:text-slate-900" title="点击按提现金额排序">提现{globalFundsSort?.key === "withdrawal" ? (globalFundsSort.direction === "desc" ? " ↓" : " ↑") : ""}</button><button type="button" onClick={() => setGlobalFundsSort((current) => current?.key === "net" ? { key: "net", direction: current.direction === "desc" ? "asc" : "desc" } : { key: "net", direction: "desc" })} className="whitespace-nowrap pl-1 text-right active:text-slate-900" title="点击按净入金额排序">净入{globalFundsSort?.key === "net" ? (globalFundsSort.direction === "desc" ? " ↓" : " ↑") : ""}</button></div>
                  {sortedGlobalFundsRows.map((row) => <div key={row.userId} className="grid min-h-11 grid-cols-[72px_repeat(3,minmax(0,1fr))] divide-x divide-slate-200 items-center px-3 py-1 text-[12px] tabular-nums">
                    <button type="button" onClick={() => { setRelatedUserFilterIds([row.userId]); setSelectedAccountIds([]); setRelatedFundFilterIds([]); setShowGlobalLedger(false); }} className="min-w-0 truncate pr-1 text-left text-[13px] font-semibold text-slate-800 active:text-slate-500" title={`查看 ${row.name} 的订单`}>{row.name}</button>
                    <button type="button" onClick={() => { setRelatedUserFilterIds([row.userId]); setSelectedAccountIds([]); setRelatedFundFilterIds([]); openPayoutEntryPage("deposit"); }} className="whitespace-nowrap px-1 text-right font-semibold text-rose-600 active:bg-rose-50" aria-label={`为 ${row.name} 登记充值`}>{formatPrice(row.deposit)}</button>
                    <button type="button" onClick={() => { setRelatedUserFilterIds([row.userId]); setSelectedAccountIds([]); setRelatedFundFilterIds([]); openPayoutEntryPage("withdrawal"); }} className="whitespace-nowrap px-1 text-right font-semibold text-emerald-600 active:bg-emerald-50" aria-label={`为 ${row.name} 登记提现`}>{formatPrice(row.withdrawal)}</button>
                    <span className={`whitespace-nowrap pl-1 text-right font-semibold ${(row.deposit - row.withdrawal) > 0 ? "text-rose-600" : (row.deposit - row.withdrawal) < 0 ? "text-emerald-600" : "text-slate-600"}`}>{formatPrice(row.deposit - row.withdrawal)}</span>
                  </div>)}
                  <div className="grid min-h-11 grid-cols-[72px_repeat(3,minmax(0,1fr))] divide-x divide-slate-200 items-center border-t-2 border-slate-300 bg-slate-50 px-3 py-1 text-[12px] font-semibold tabular-nums"><span className="pr-1 text-[13px] text-slate-900">汇总</span><span className="px-1 text-right text-rose-600">{formatPrice(globalFundsSummary.deposit)}</span><span className="px-1 text-right text-emerald-600">{formatPrice(globalFundsSummary.withdrawal)}</span><span className={`whitespace-nowrap pl-1 text-right ${(globalFundsSummary.deposit - globalFundsSummary.withdrawal) > 0 ? "text-rose-600" : (globalFundsSummary.deposit - globalFundsSummary.withdrawal) < 0 ? "text-emerald-600" : "text-slate-600"}`}>{formatPrice(globalFundsSummary.deposit - globalFundsSummary.withdrawal)}</span></div>
                </div> : <div className="px-5 py-14 text-center text-sm text-slate-400">暂无用户资金记录。</div>}
              </>}
              {globalLedgerTab === "income" && <>
                {globalFundsRows.length > 0 ? <div className="divide-y divide-slate-200 border-y border-slate-200 bg-white">
                  <div className="grid grid-cols-[72px_repeat(4,minmax(0,1fr))] divide-x divide-slate-200 items-center border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-medium text-slate-500"><span className="pr-1">用户</span><button type="button" onClick={() => setGlobalIncomeSort((current) => current?.key === "order" ? { key: "order", direction: current.direction === "desc" ? "asc" : "desc" } : { key: "order", direction: "desc" })} className="whitespace-nowrap px-1 text-right active:text-slate-900" title="点击按订单收入排序">订单{globalIncomeSort?.key === "order" ? (globalIncomeSort.direction === "desc" ? " ↓" : " ↑") : ""}</button><button type="button" onClick={() => setGlobalIncomeSort((current) => current?.key === "commission" ? { key: "commission", direction: current.direction === "desc" ? "asc" : "desc" } : { key: "commission", direction: "desc" })} className="whitespace-nowrap px-1 text-right active:text-slate-900" title="点击按分佣收入排序">分佣{globalIncomeSort?.key === "commission" ? (globalIncomeSort.direction === "desc" ? " ↓" : " ↑") : ""}</button><button type="button" onClick={() => setGlobalIncomeSort((current) => current?.key === "shared" ? { key: "shared", direction: current.direction === "desc" ? "asc" : "desc" } : { key: "shared", direction: "desc" })} className="whitespace-nowrap px-1 text-right active:text-slate-900" title="点击按共享收入排序">共享{globalIncomeSort?.key === "shared" ? (globalIncomeSort.direction === "desc" ? " ↓" : " ↑") : ""}</button><button type="button" onClick={() => setGlobalIncomeSort((current) => current?.key === "total" ? { key: "total", direction: current.direction === "desc" ? "asc" : "desc" } : { key: "total", direction: "desc" })} className="whitespace-nowrap pl-1 text-right active:text-slate-900" title="点击按总收入排序">总收入{globalIncomeSort?.key === "total" ? (globalIncomeSort.direction === "desc" ? " ↓" : " ↑") : ""}</button></div>
                  {sortedGlobalIncomeRows.map((row) => {
                    const totalIncome = row.orderProfit + row.commissionProfit + row.sharedProfit;
                    const incomeClass = (value: number) => value > 0 ? "text-rose-600" : value < 0 ? "text-emerald-600" : "text-slate-700";
                    return <button key={row.userId} type="button" onClick={() => { setRelatedUserFilterIds([row.userId]); setSelectedAccountIds([]); setRelatedFundFilterIds([]); setShowGlobalLedger(false); }} className="grid min-h-11 w-full grid-cols-[72px_repeat(4,minmax(0,1fr))] divide-x divide-slate-200 items-center px-3 py-1 text-left tabular-nums active:bg-slate-50">
                      <span className="min-w-0 truncate pr-1 text-[13px] font-semibold text-slate-800">{row.name}</span>
                      <span className={`whitespace-nowrap px-1 text-right text-[13px] font-semibold ${incomeClass(row.orderProfit)}`}>{formatGlobalLedgerWhole(row.orderProfit)}</span>
                      <span className={`whitespace-nowrap px-1 text-right text-[13px] font-semibold ${incomeClass(row.commissionProfit)}`}>{formatGlobalLedgerWhole(row.commissionProfit)}</span>
                      <span className="whitespace-nowrap px-1 text-right text-[13px] font-semibold text-rose-600">{formatGlobalLedgerWhole(row.sharedProfit)}</span>
                      <span className={`whitespace-nowrap pl-1 text-right text-[13px] font-semibold ${incomeClass(totalIncome)}`}>{formatGlobalLedgerWhole(totalIncome)}</span>
                    </button>;
                  })}
                  <div className="grid min-h-11 grid-cols-[72px_repeat(4,minmax(0,1fr))] divide-x divide-slate-200 items-center border-t-2 border-slate-300 bg-slate-50 px-3 py-1 text-[13px] font-semibold tabular-nums">
                    <span className="pr-1 text-slate-900">汇总</span>
                    <span className={`${globalFundsSummary.orderProfit >= 0 ? "text-rose-600" : "text-emerald-600"} whitespace-nowrap px-1 text-right`}>{formatGlobalLedgerWhole(globalFundsSummary.orderProfit)}</span>
                    <span className={`${globalFundsSummary.commissionProfit >= 0 ? "text-rose-600" : "text-emerald-600"} whitespace-nowrap px-1 text-right`}>{formatGlobalLedgerWhole(globalFundsSummary.commissionProfit)}</span>
                    <span className="whitespace-nowrap px-1 text-right text-rose-600">{formatGlobalLedgerWhole(globalFundsSummary.sharedProfit)}</span>
                    <span className={`${(globalFundsSummary.orderProfit + globalFundsSummary.commissionProfit + globalFundsSummary.sharedProfit) >= 0 ? "text-rose-600" : "text-emerald-600"} whitespace-nowrap pl-1 text-right`}>{formatGlobalLedgerWhole(globalFundsSummary.orderProfit + globalFundsSummary.commissionProfit + globalFundsSummary.sharedProfit)}</span>
                  </div>
                </div> : <div className="px-5 py-14 text-center text-sm text-slate-400">暂无用户收入记录。</div>}
              </>}
              {globalLedgerTab === "system" && <>
                <div className="border-b border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-500">后台自动成交、历史区间补扫、自动止盈与期权到期结算都会在这里留痕 · 共 {systemActivityLogs.length} 条</div>
                {systemActivityLogs.length > 0 ? <div className="divide-y divide-slate-200 border-y border-slate-200 bg-white">
                  {systemActivityLogs.map((item) => {
                    const presentation = item.type === "recovery_fill"
                      ? { label: "补扫成交", className: "border-blue-200 bg-blue-50 text-blue-700" }
                      : item.type === "take_profit"
                        ? { label: "自动止盈", className: "border-emerald-200 bg-emerald-50 text-emerald-700" }
                        : item.type === "expiry_settlement"
                          ? { label: "到期结算", className: "border-violet-200 bg-violet-50 text-violet-700" }
                          : { label: "自动成交", className: "border-sky-200 bg-sky-50 text-sky-700" };
                    const subject = [item.accountName, item.relatedUserName].filter((value): value is string => Boolean(value && value.trim())).join(" · ");
                    const hasQuantity = Number.isFinite(item.quantity) && item.quantity > 0;
                    const hasPrice = Number.isFinite(item.price) && item.price > 0;
                    return <article key={item.id} className="border-l-4 border-l-slate-300 px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-semibold ${presentation.className}`}>{presentation.label}</span>
                          <span className="min-w-0 truncate text-sm font-semibold text-slate-800">{subject || `订单 #${item.entryId}`}</span>
                        </div>
                        <time className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-slate-400">{item.occurredAtLabel ? item.occurredAtLabel.replace(/^(\d{4})\/(\d{2})\/(\d{2})/, (_match, _year, month, day) => `${Number(month)}/${Number(day)}`) : formatBeijingMonthDayTime(item.occurredAt)}</time>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-600 tabular-nums">
                        <span>订单 #{item.entryId}</span>
                        <span className="text-slate-300">·</span>
                        <span className="font-semibold text-slate-700">{item.action}</span>
                        {hasQuantity && <><span className="text-slate-300">·</span><span>{formatQuantity(item.quantity)} ETH</span></>}
                        {hasPrice && <><span className="text-slate-300">·</span><span>{formatPrice(item.price)} u</span></>}
                      </div>
                      {item.note && <p className="mt-1.5 break-words text-[11px] leading-relaxed text-slate-500">{item.note}</p>}
                    </article>;
                  })}
                </div> : <div className="px-5 py-14 text-center text-sm text-slate-400">暂时没有后台自动处理的订单动态。</div>}
              </>}
            </main>
            {globalLedgerTab === "positions" && globalLedgerRows.length > 0 && <footer className="grid min-h-11 shrink-0 grid-cols-[72px_repeat(4,minmax(0,1fr))] divide-x divide-slate-200 items-center border-t-2 border-slate-300 bg-slate-50 px-3 py-1 text-[12px] font-semibold tabular-nums shadow-[0_-2px_8px_rgba(15,23,42,0.08)]">
              <span className="pr-1 text-[13px] text-slate-900">汇总</span>
              <span className="whitespace-nowrap px-1 text-right text-rose-600">{formatQuantity(globalLedgerSummary.longQuantity)}</span>
              <span className="whitespace-nowrap px-1 text-right text-emerald-600">{formatQuantity(globalLedgerSummary.shortQuantity)}</span>
              <span className={`whitespace-nowrap px-1 text-right ${globalLedgerSummary.netPositionClass}`}>{formatQuantity(Math.abs(globalLedgerSummary.netPosition))}</span>
              <span className={`whitespace-nowrap pl-1 text-right text-[12px] ${globalLedgerSummary.floatingPnl >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatGlobalLedgerWhole(globalLedgerSummary.floatingPnl)}</span>
            </footer>}
          </div>
        </div>
      )}

      {showPayoutLog && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-label="T+0收益账本">
          <div className="flex max-h-[88vh] w-full max-w-sm flex-col overflow-y-auto rounded-xl bg-white p-4 shadow-2xl">
            {canManage && (
              <>
                <div data-html2canvas-ignore="true" className="order-1 border-b border-slate-200">
                  <div className="flex items-center justify-between bg-white px-3 py-2 text-[11px] text-slate-500"><span>操作面板</span><OrderCardImageDownload targetRef={payoutSharedContentRef} currentUser={me as any} orderNo={payoutTargetUserIdentity.name} filenamePrefix="T+0收益账本" previewTitle="T+0收益账本图片预览" previewHint="包含昵称、用户名与收益统计" color="#475569" outerPadding={12} captureFullContent exportBackground="#F8FAFC" variant="bare" buttonLabel="下载" /></div>
                </div>
                <div data-html2canvas-ignore="true" className="order-4 mt-3 border-t border-slate-200 pt-3">
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => openPayoutEntryPage("deposit")} className="flex h-10 items-center justify-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 text-sm font-semibold text-sky-700 shadow-sm active:scale-[0.99]">
                      <ArrowDownLeft className="h-4 w-4" /> 登记投入
                    </button>
                    <button type="button" onClick={() => openPayoutEntryPage("withdrawal")} className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-slate-800 text-sm font-semibold text-white shadow-sm active:scale-[0.99]">
                      <ArrowUpRight className="h-4 w-4" /> 登记提现
                    </button>
                  </div>
                </div>
              </>
            )}

            <div ref={payoutSharedContentRef} className="order-3 mt-3 border-y border-slate-200 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-base font-semibold text-slate-900">T+0收益账本</div>
                  <div className="mt-0.5 truncate text-xs text-slate-500">
                    昵称：{payoutTargetUserIdentity.name}{payoutTargetUserIdentity.username ? ` · 用户名：@${payoutTargetUserIdentity.username}` : ""}
                  </div>
                </div>
                <button type="button" data-card-export-hide="true" onClick={() => setShowPayoutLog(false)} className="shrink-0 rounded p-1 text-slate-400 active:scale-90" aria-label="关闭T+0收益账本">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="mt-3 border-y border-slate-300 tabular-nums">
                <button type="button" onClick={openTotalProfitReport} aria-haspopup={isMemberView ? undefined : "dialog"} aria-label={isMemberView ? "打开总收益页面" : "查看总收益归因报告"} className="w-full px-3 py-3 text-left transition active:bg-slate-50">
                  <div className="text-xs font-semibold text-slate-600">当前总收益</div>
                  <div className={`mt-1 truncate whitespace-nowrap text-[clamp(23px,6.8vw,29px)] font-bold leading-none ${payoutBookTotalIncomeClass}`}>{formatSigned(payoutBookTotalIncome)}<span className="ml-1 text-xs font-semibold opacity-75">U</span></div>
                  <div className="mt-1 truncate text-[10px] text-slate-400">{payoutXirrSummary.firstInvestmentDate ? `${Number(payoutXirrSummary.firstInvestmentDate.slice(5, 7))}月${Number(payoutXirrSummary.firstInvestmentDate.slice(8, 10))}日 至 ${Number(payoutXirrSummary.asOfDate.slice(5, 7))}月${Number(payoutXirrSummary.asOfDate.slice(8, 10))}日 · ${payoutXirrSummary.daysHeld} 天` : "尚无投入期间"}</div>
                </button>
                <div className="flex min-w-0 items-center justify-between gap-[clamp(12px,4vw,20px)] border-t border-slate-300 px-[clamp(12px,3.5vw,16px)] py-[clamp(10px,2.8vw,13px)] text-left tabular-nums">
                  <div className="flex shrink-0 items-center gap-[clamp(6px,1.8vw,10px)] whitespace-nowrap"><span className="text-[clamp(11px,3vw,13px)] font-medium text-slate-500">累计投入</span><span className="text-[clamp(12px,3.4vw,14px)] font-semibold leading-none text-slate-800">{cumulativeDepositAmount > 0 ? "+" : ""}{cumulativeDepositAmount === 0 ? "0" : formatPrice(cumulativeDepositAmount)}<span className="ml-0.5 text-[10px] font-medium opacity-70">U</span></span></div>
                  <span aria-hidden="true" className="h-4 shrink-0 border-l border-slate-300" />
                  <div className="flex shrink-0 items-center gap-[clamp(6px,1.8vw,10px)] whitespace-nowrap"><button type="button" onClick={() => setShowPayoutXirrHelp(true)} aria-haspopup="dialog" aria-label="查看实际年化计算说明" className="border-b border-dotted border-slate-400 pb-px text-[clamp(11px,3vw,13px)] font-medium text-slate-500 active:opacity-60">实际年化</button><span className={`text-[clamp(12px,3.4vw,14px)] font-semibold leading-none ${payoutXirrSummary.rate === null ? "text-slate-400" : "text-slate-800"}`}>{formatT0AnnualizedReturn(payoutXirrSummary.rate)}</span></div>
                </div>
              </div>

              <section className="mt-3 border-y border-slate-200">
                <div className="flex min-w-0 items-center justify-between gap-2 border-b border-slate-200 px-3 py-1.5 text-[11px]">
                  <div className="flex min-w-0 items-center gap-1" role="tablist" aria-label="个人账本明细切换">
                    {([
                      { id: "income" as const, label: "已实现收益" },
                      { id: "withdrawal" as const, label: "提现记录" },
                      { id: "deposit" as const, label: "充值记录" },
                    ]).map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={payoutLedgerTab === tab.id} onClick={() => {
                      setPayoutLedgerTab(tab.id);
                      if (tab.id === "income") setPayoutIncomePage(1);
                    }} className={`shrink-0 rounded px-1.5 py-1 font-semibold transition active:scale-95 ${payoutLedgerTab === tab.id ? "bg-slate-800 text-white shadow-sm" : "text-slate-500 active:bg-slate-100"}`}>{tab.label}</button>)}
                  </div>
                  <span className="shrink-0 text-slate-400">共 {payoutLedgerTab === "income" ? payoutIncomeEntries.length : payoutLedgerCashflowLogs.length} 笔</span>
                </div>
                {payoutLedgerTab === "income" ? <>
                  <div className="grid grid-cols-[60px_34px_52px_68px_minmax(0,1fr)] gap-x-1 border-b border-slate-100 px-3 py-1.5 text-[10px] font-medium text-slate-400 tabular-nums"><span className="text-center">时间</span><span className="text-center">类型</span><span className="text-center">数量</span><span className="text-right">价格/来源</span><span className="text-right">收益</span></div>
                  {payoutIncomeEntries.length > 0 ? <div className="divide-y divide-slate-100">{pagedPayoutIncomeEntries.map((entry) => {
                  if (entry.kind === "shared") {
                    const sourceTrade = entry.sourceTrade;
                    return <div key={entry.id} className="grid grid-cols-[60px_34px_52px_68px_minmax(0,1fr)] items-center gap-x-1 px-3 py-2 text-[10px] tabular-nums">
                      <span className="whitespace-nowrap text-center font-mono tracking-[-0.04em] text-slate-400">{formatBeijingMonthDayTime(entry.createdAt)}</span>
                      <span className="whitespace-nowrap text-center font-semibold" style={{ color: "#2563eb" }} title="共享收益">共享</span>
                      <span className="whitespace-nowrap text-center font-medium text-slate-700">{sourceTrade ? `${formatQuantity(sourceTrade.quantity)} ETH` : "—"}</span>
                      <span className="whitespace-nowrap text-right text-slate-500" title={sourceTrade ? `来源平仓价 ${formatPrice(sourceTrade.price)}` : `来源平仓订单 #${entry.transfer.closingEntryId}`}>{sourceTrade ? formatPrice(sourceTrade.price) : `#${entry.transfer.closingEntryId}`}</span>
                      <span className="whitespace-nowrap text-right font-semibold text-rose-600">{formatSigned(entry.transfer.amount)} U</span>
                    </div>;
                  }
                  const { detail } = entry;
                  const isLong = ACTIONS[detail.trade.action].side === "long";
                  return <div key={entry.id} className="grid grid-cols-[60px_34px_52px_68px_minmax(0,1fr)] items-center gap-x-1 px-3 py-2 text-[10px] tabular-nums">
                    <span className="whitespace-nowrap text-center font-mono tracking-[-0.04em] text-slate-400">{formatBeijingMonthDayTime(detail.trade.createdAt)}</span>
                    <span className={`whitespace-nowrap text-center font-semibold ${isLong ? "text-rose-600" : "text-emerald-600"}`}>{ACTIONS[detail.trade.action].label}</span>
                    <span className="whitespace-nowrap text-center font-medium text-slate-700">{formatQuantity(detail.quantity)} ETH</span>
                    <span className="whitespace-nowrap text-right text-slate-500">{formatPrice(detail.trade.price)}</span>
                    <span className={`whitespace-nowrap text-right font-semibold ${detail.netPnl >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatSigned(detail.netPnl)} U</span>
                  </div>;
                  })}</div> : <div className="px-3 py-5 text-center text-xs text-slate-400">暂无已实现收益记录</div>}
                  {payoutIncomeEntries.length > 0 && payoutIncomeTotalPages > 1 && <div data-card-export-hide="true" className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-3 py-2 text-[11px] tabular-nums">
                  <button type="button" disabled={payoutIncomePage <= 1} onClick={() => setPayoutIncomePage((current) => Math.max(1, current - 1))} className="h-7 rounded border border-slate-200 bg-white px-2.5 font-medium text-slate-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35">上一页</button>
                  <span className="whitespace-nowrap text-slate-500">第 {payoutIncomePage} 页 / 共 {payoutIncomeTotalPages} 页</span>
                  <button type="button" disabled={payoutIncomePage >= payoutIncomeTotalPages} onClick={() => setPayoutIncomePage((current) => Math.min(payoutIncomeTotalPages, current + 1))} className="h-7 rounded border border-slate-200 bg-white px-2.5 font-medium text-slate-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35">下一页</button>
                  </div>}
                </> : <>
                  <div className="grid grid-cols-[74px_minmax(0,1fr)_auto] items-center gap-x-2 border-b border-slate-100 px-3 py-1.5 text-[10px] font-medium text-slate-400 tabular-nums"><span>日期</span><span>备注</span><span className="text-right">金额</span></div>
                  {payoutLedgerCashflowLogs.length > 0 ? <div className="divide-y divide-slate-100">{payoutLedgerCashflowLogs.map((log) => <div key={log.id} className="grid grid-cols-[74px_minmax(0,1fr)_auto] items-center gap-x-2 px-3 py-2 text-[11px] tabular-nums">
                    <span className="whitespace-nowrap text-slate-500">{log.occurredOn.replaceAll("-", "/")}</span>
                    <span className="min-w-0 truncate text-slate-600">{log.note}</span>
                    <span className={`whitespace-nowrap text-right font-semibold ${payoutLedgerTab === "withdrawal" ? "text-slate-800" : "text-sky-700"}`}><span>{formatPrice(log.amount)} <span className="text-[9px] font-medium opacity-75">U</span></span>{payoutLedgerTab === "deposit" && <span className="mt-0.5 block text-[9px] font-medium tabular-nums text-slate-500"><span className={log.depositInputMode === "eth" ? "text-sky-700" : "text-slate-400"}>币本位</span> {log.ethQuantity ? `${formatPayoutEthQuantity(log.ethQuantity)} ETH` : "—"}{log.ethReferencePrice && <span className="ml-1.5">参考价 {formatPrice(Number(log.ethReferencePrice))} U</span>}</span>}</span>
                  </div>)}</div> : <div className="px-3 py-5 text-center text-xs text-slate-400">暂无{payoutLedgerTab === "withdrawal" ? "提现" : "充值"}记录</div>}
                </>}
              </section>

            </div>
          </div>
        </div>
      )}

      {isTotalProfitReportVisible && totalProfitAttribution.hasIndividualScope && showPayoutXirrHelp && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 px-5" role="dialog" aria-modal="true" aria-label="实际年化计算说明">
          <div className="max-h-[86vh] w-full max-w-sm overflow-y-auto rounded-xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-base font-semibold text-slate-900">实际年化说明</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">采用 XIRR 方法，按每笔资金在北京时间的实际占用日数计算，适用于分批投入、分批提现。</div>
                <div className="mt-2 flex items-baseline gap-2 text-xs tabular-nums"><span className="font-medium text-slate-500">实际年化</span><span className={`font-semibold ${payoutXirrSummary.rate === null ? "text-slate-400" : "text-indigo-700"}`}>{formatT0AnnualizedReturn(payoutXirrSummary.rate)}</span>{payoutXirrSummary.firstInvestmentDate && <span className="text-slate-400">持有 {payoutXirrSummary.daysHeld} 天</span>}</div>
              </div>
              <button type="button" onClick={() => setShowPayoutXirrHelp(false)} className="rounded p-1 text-slate-400 active:scale-90" aria-label="关闭实际年化计算说明">
                <X className="h-5 w-5" />
              </button>
            </div>

            <section className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50/55 p-3">
              <div className="text-xs font-semibold text-indigo-900">实际年化如何计算</div>
              <div className="mt-2 space-y-1.5 text-[11px] leading-5 text-slate-600">
                <div className="flex gap-2"><span className="shrink-0 font-semibold text-sky-700">投入（负）</span><span>每笔登记投入，按实际发生日记为投资人现金流出。</span></div>
                <div className="flex gap-2"><span className="shrink-0 font-semibold text-slate-700">提现（正）</span><span>每笔登记提现，按实际发生日记为投资人现金流入。</span></div>
                <div className="flex gap-2"><span className="shrink-0 font-semibold text-indigo-700">期末净值（正）</span><span>当前仍留在账本中的资金价值，按北京时间今天收盘时作为期末现金流。</span></div>
              </div>
            </section>

            <section className="mt-3 overflow-hidden rounded-lg border border-slate-200">
              <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">期末净值与公式</div>
              <div className="space-y-3 px-3 py-3 text-[11px] leading-5 text-slate-600">
                <div>
                  <div className="text-slate-400">期末账面净值</div>
                  <div className="mt-0.5 font-semibold tabular-nums text-slate-800">累计投入 + 当前总收益 − 累计提现</div>
                  <div className="mt-1 font-semibold tabular-nums text-indigo-700">当前期末净值：{formatSigned(payoutXirrSummary.currentNetValue)} U</div>
                </div>
                <div>
                  <div className="text-slate-400">什么是 XIRR</div>
                  <div className="mt-0.5 break-words font-mono text-[10px] text-slate-800">Σ [ CFᵢ ÷ (1 + r)^(dᵢ ÷ 365) ] = 0</div>
                  <div className="mt-1 text-[10px] leading-4 text-slate-500">XIRR 会为每笔不同日期的投入、提现与期末净值寻找同一个年化回报率。CFᵢ 为每笔现金流；dᵢ 为该笔现金流距首笔投入的北京时间计算天数；首日与截至日均计入持有期；r 为求得的实际年化回报率。</div>
                </div>
              </div>
            </section>

            <section className="mt-3 grid grid-cols-3 divide-x divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-center tabular-nums">
              <div className="px-2 py-2"><div className="text-[10px] text-slate-500">投入笔数</div><div className="mt-0.5 text-sm font-semibold text-sky-700">{depositLogs.length}</div></div>
              <div className="px-2 py-2"><div className="text-[10px] text-slate-500">提现笔数</div><div className="mt-0.5 text-sm font-semibold text-slate-700">{withdrawalLogs.length}</div></div>
              <div className="px-2 py-2"><div className="text-[10px] text-slate-500">持有期</div><div className="mt-0.5 text-sm font-semibold text-indigo-700">{payoutXirrSummary.daysHeld} 天</div></div>
            </section>

            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] leading-4 text-amber-800">短期持有时，少量收益会因按全年复利折算而显著放大年化读数；XIRR 反映截至当前的历史资金效率，不代表未来收益预期。</div>
            <button type="button" onClick={() => setShowPayoutXirrHelp(false)} className="mt-5 h-11 w-full rounded bg-indigo-700 text-sm font-semibold text-white active:scale-[0.99]">知道了</button>
          </div>
        </div>
      )}

      {isTotalProfitReportVisible && (
        <div className={isTotalProfitPage ? "fixed inset-0 z-[65] overflow-y-auto bg-slate-50" : "fixed inset-0 z-[65] flex items-center justify-center bg-slate-950/40 px-5"} role={isTotalProfitPage ? undefined : "dialog"} aria-modal={isTotalProfitPage ? undefined : true} aria-label="总收益归因报告">
          <div className={isTotalProfitPage ? "min-h-full w-full max-w-md mx-auto bg-white px-4 pb-8" : "max-h-[88vh] w-full max-w-sm overflow-y-auto rounded bg-white p-5 shadow-2xl"}>
            <div className={isTotalProfitPage ? "-mx-4 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4" : "flex justify-end"}>
              {isTotalProfitPage && <>
                <button type="button" onClick={closeTotalProfitReport} aria-label="返回T+0速记账本" className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-slate-200 bg-white active:scale-95"><ArrowLeft className="h-4 w-4 text-slate-700" /></button>
                <h1 className="min-w-0 flex-1 truncate font-semibold text-slate-900">{hasIndividualSettlementScope ? "总收益" : "全局总收益"}</h1>
              </>}
              <div data-html2canvas-ignore="true" className="ml-auto flex shrink-0 items-center gap-1">
                {totalProfitPageTab === "income" && <OrderCardImageDownload
                  targetRef={totalProfitAttributionExportRef}
                  currentUser={me as any}
                  orderNo={totalProfitAttribution.targetLabel}
                  filenamePrefix="T+0总收益归因"
                  previewTitle="总收益归因报告图片预览"
                  previewHint="包含收益构成、已实现收益与最近提现"
                  color="#F37021"
                  outerPadding={6}
                  captureFullContent
                  fullContentHorizontalBleed={0}
                  exportBackground="#FFFFFF"
                  variant="bare"
                  buttonLabel="下载"
                />}
                {totalProfitPageTab === "settlement" && memberSettlementCardPage === "self" && displayedWeeklySettlementCenter?.view === "member" && displayedWeeklySettlementCenter.current && <OrderCardImageDownload
                  targetRef={weeklySettlementExportRef}
                  currentUser={me as any}
                  orderNo={payoutTargetUserIdentity.name}
                  filenamePrefix="T+0周收益结算"
                  previewTitle="周收益结算图片预览"
                  previewHint="包含选中结算周期、收益与七日明细"
                  color="#F37021"
                  outerPadding={8}
                  captureFullContent
                  fullContentHorizontalBleed={0}
                  fullContentBottomPadding={0}
                  exportBackground="#FFFFFF"
                  variant="bare"
                  buttonLabel="下载"
                />}
                {!isTotalProfitPage && <button type="button" onClick={closeTotalProfitReport} className="rounded p-1 text-slate-400 active:scale-90" aria-label="关闭总收益归因报告">
                  <X className="h-5 w-5" />
                </button>}
              </div>
            </div>

            {isTotalProfitPage && <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1" role="tablist" aria-label="总收益与结算切换">
              {[{ id: "income" as const, label: "总收益" }, { id: "settlement" as const, label: "结算" }].map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={totalProfitPageTab === tab.id} onClick={() => { setTotalProfitPageTab(tab.id); setMemberSettlementCardPage("self"); setMemberSettlementSelectedWeekStart(null); setTeamSettlementSelectedWeekStart(null); if (tab.id === "settlement") setAdminSettlementTab("overview"); }} className={`h-9 rounded-md text-sm font-semibold transition active:scale-[0.99] ${totalProfitPageTab === tab.id ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 active:bg-white"}`}>{tab.label}</button>)}
            </div>}

            {totalProfitPageTab === "settlement" ? (
              <section ref={weeklySettlementExportRef} className="mt-3" aria-label="周结算中心">
                {!displayedWeeklySettlementCenter?.current && t0WeeklySettlementQuery.isLoading ? <div className="border-y border-slate-200 px-3 py-10 text-center text-xs text-slate-400">结算数据加载中…</div> : !displayedWeeklySettlementCenter?.current && t0WeeklySettlementQuery.error ? <div className="border border-rose-200 bg-rose-50 px-3 py-3 text-xs leading-5 text-rose-700">结算数据暂时无法读取，请稍后刷新。</div> : displayedWeeklySettlementCenter?.current ? <>
                  {displayedWeeklySettlementCenter.view === "member" && isMemberView && canViewTeamOverview && <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1" role="tablist" aria-label="个人与团队结算切换">
                    {[{ id: "self" as const, label: "个人" }, { id: "team" as const, label: "团队" }].map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={memberSettlementCardPage === tab.id} onClick={() => { setMemberSettlementCardPage(tab.id); if (tab.id === "team") setTeamSettlementSelectedWeekStart(memberSettlementSelectedWeekStart); }} className={`h-8 rounded-md text-xs font-semibold transition active:scale-[0.99] ${memberSettlementCardPage === tab.id ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 active:bg-white"}`}>{tab.label}</button>)}
                  </div>}
                  {displayedWeeklySettlementCenter.view === "member" ? memberSettlementCardPage === "team" && isMemberView && canViewTeamOverview ? <T0TeamWeeklySettlementCard teamSettlement={displayedTeamWeeklySettlement} isLoading={isTeamSettlementWeekLoading} hasError={Boolean(t0TeamWeeklySettlementQuery.error)} countdown={currentSettlementCountdown} hasPreviousWeek={Boolean(previousTeamSettlementWeekStart)} hasNextWeek={Boolean(nextTeamSettlementWeekStart)} onPreviousWeek={() => previousTeamSettlementWeekStart && selectTeamSettlementWeek(previousTeamSettlementWeekStart)} onNextWeek={() => nextTeamSettlementWeekStart && selectTeamSettlementWeek(nextTeamSettlementWeekStart)} /> : <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><T0MemberWeeklySettlementCurrentCard
                    report={selectedMemberSettlementReport || displayedWeeklySettlementCenter.current}
                    displayName={payoutTargetUserIdentity.name}
                    avatar={payoutTargetUserIdentity.avatar}
                    countdown={selectedMemberSettlementIsRealtime ? currentSettlementCountdown : null}
                    isRealtimeWeek={selectedMemberSettlementIsRealtime}
                  /></div> : <T0AdminWeeklySettlementOverviewCard
                    report={selectedAdminSettlementReport || displayedWeeklySettlementCenter.current}
                    isRealtimeWeek={selectedAdminSettlementIsRealtime}
                    hasPreviousWeek={Boolean(previousAdminSettlementReport)}
                    hasNextWeek={Boolean(nextAdminSettlementReport)}
                    memberAvatarByUserId={previewMemberAvatarById}
                    onPreviousWeek={() => previousAdminSettlementReport && selectAdminSettlementWeek(previousAdminSettlementReport.report.period.weekStartBjt)}
                    onNextWeek={() => nextAdminSettlementReport && selectAdminSettlementWeek(nextAdminSettlementReport.report.period.weekStartBjt)}
                  />}
                  {displayedWeeklySettlementCenter.view === "admin" && <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1" role="tablist" aria-label="全局结算视图切换">
                    {[{ id: "overview" as const, label: "概览" }, { id: "reconciliation" as const, label: "账户对账" }].map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={adminSettlementTab === tab.id} onClick={() => { setAdminSettlementTab(tab.id); setExpandedSettlementAccountId(null); setExpandedSettlementDestinationUserId(null); if (tab.id === "overview") void t0WeeklySettlementQuery.refetch(); }} className={`h-8 rounded-md text-xs font-semibold transition active:scale-[0.99] ${adminSettlementTab === tab.id ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 active:bg-white"}`}>{tab.label}</button>)}
                  </div>}
                  {displayedWeeklySettlementCenter.view === "admin" && adminSettlementTab === "reconciliation" && <T0WeeklySettlementAccountReconciliationPanel
                    reconciliation={weeklySettlementAccountReconciliation}
                    isLoading={t0WeeklySettlementAccountReconciliationQuery.isLoading || Boolean(effectiveSettlementReconciliationWeekStart && weeklySettlementAccountReconciliationRaw?.period.weekStartBjt !== effectiveSettlementReconciliationWeekStart)}
                    hasError={Boolean(t0WeeklySettlementAccountReconciliationQuery.error)}
                    weeks={reconciliationWeekOptions}
                    selectedWeekStart={effectiveSettlementReconciliationWeekStart || displayedWeeklySettlementCenter.current.period.weekStartBjt}
                    onSelectedWeekStartChange={selectAdminSettlementWeek}
                    expandedAccountId={expandedSettlementAccountId}
                    onExpandedAccountChange={setExpandedSettlementAccountId}
                    expandedDestinationUserId={expandedSettlementDestinationUserId}
                    onExpandedDestinationUserChange={setExpandedSettlementDestinationUserId}
                  />}
                  {displayedWeeklySettlementCenter.view === "admin" && adminSettlementTab === "overview" && <T0AdminWeeklySettlementMemberList
                    report={selectedAdminSettlementReport || displayedWeeklySettlementCenter.current}
                    expandedMemberId={expandedSettlementMemberId}
                    onExpandedMemberChange={setExpandedSettlementMemberId}
                  />}
                  {displayedWeeklySettlementCenter.view === "member" ? memberSettlementCardPage === "self" ? <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white"><T0HistoricalSettlementWeekCalendar reports={memberSettlementReports} dailyIncomeByDate={memberSettlementIncomeByWeek?.incomeByDay} targetUserId={payoutTargetRelatedUserId} selectedWeekStart={memberSettlementSelectedWeekStart} onSelectedWeekStartChange={selectMemberSettlementWeek} /></div> : null : adminSettlementTab === "overview" ? <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5"><span className="text-sm font-semibold text-slate-800">历史收益结算</span><span className="text-[11px] text-slate-400">{displayedWeeklySettlementCenter.history.some((item) => item.kind === "backfill") ? "含回溯核算" : "已冻结周报"}</span></div>{displayedWeeklySettlementCenter.history.length > 0 ? <div className="divide-y divide-slate-100">{displayedWeeklySettlementCenter.history.map((item) => { const expanded = expandedSettlementReportId === item.id; return <div key={item.id}><button type="button" onClick={() => setExpandedSettlementReportId(expanded ? null : item.id)} className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left active:bg-slate-50"><div><div className="text-sm font-semibold text-slate-800">{formatT0WeeklySettlementPeriod(item.report.period.weekStartBjt, item.report.period.weekEndExclusiveBjt)}</div><div className="mt-1 text-[10px] text-slate-400">{item.kind === "frozen" ? "已冻结 · 北京时间周结" : "回溯核算 · 未冻结"}</div></div><div className={`shrink-0 text-right text-sm font-bold tabular-nums ${item.report.summary.income.total >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatT0SettlementAmount(item.report.summary.income.total)} <span className="text-[9px] font-medium">U</span></div></button>{expanded && <div className="grid grid-cols-3 divide-x divide-slate-200 border-t border-slate-100 bg-slate-50/70 text-center tabular-nums"><div className="min-w-0 px-1 py-2"><div className="text-[10px] text-slate-400">订单</div><div className={`mt-1 whitespace-nowrap text-xs font-semibold ${item.report.summary.income.order >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatT0SettlementAmount(item.report.summary.income.order)}</div></div><div className="min-w-0 px-1 py-2"><div className="text-[10px] text-slate-400">分佣</div><div className={`mt-1 whitespace-nowrap text-xs font-semibold ${item.report.summary.income.commission >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatT0SettlementAmount(item.report.summary.income.commission)}</div></div><div className="min-w-0 px-1 py-2"><div className="text-[10px] text-slate-400">共享</div><div className={`mt-1 whitespace-nowrap text-xs font-semibold ${item.report.summary.income.shared >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatT0SettlementAmount(item.report.summary.income.shared)}</div></div></div>}</div>; })}</div> : <div className="px-3 py-7 text-center text-xs text-slate-400">暂无已结束周的收益结算记录</div>}</div> : null}
                  <p data-card-export-hide="true" className="mt-3 px-1 text-[10px] leading-5 text-slate-400">{displayedWeeklySettlementCenter.view === "member" && memberSettlementCardPage === "team" ? (teamWeeklySettlement?.definition || "团队结算仅展示已授权下属的本周收益汇总。") : `${displayedWeeklySettlementCenter.definition.income} ${displayedWeeklySettlementCenter.definition.freeze}`}</p>
                </> : <div className="border-y border-slate-200 px-3 py-10 text-center text-xs text-slate-400">暂无结算数据</div>}
              </section>
            ) : (
            <div ref={totalProfitAttributionExportRef} className={isTotalProfitPage ? "mt-4" : "mt-1.5"}>
            <section className="overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-hidden bg-gradient-to-br from-slate-50 via-white to-rose-50/45 text-left">
                <div className={`grid ${totalProfitAttribution.hasIndividualScope && latestWithdrawalLog ? "grid-cols-[minmax(0,1fr)_132px]" : "grid-cols-1"} items-stretch`}>
                  <div className="min-w-0 px-4 py-3.5">
                    <div className="flex min-w-0 items-baseline gap-1.5 text-[11px] font-semibold text-slate-500"><span className="shrink-0">总收益</span>{totalProfitAttribution.hasIndividualScope && <span className="min-w-0 truncate font-medium text-slate-400">· {totalProfitAttribution.targetLabel}</span>}</div>
                    <div className="mt-1.5 flex items-center gap-2"><>{totalProfitAttribution.hasIndividualScope && <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-800 text-[10px] font-bold text-white">{payoutTargetUserIdentity.avatar ? <img src={payoutTargetUserIdentity.avatar} alt={`${payoutTargetUserIdentity.name}头像`} className="h-full w-full object-cover" /> : <span>{payoutTargetUserIdentity.name.slice(0, 1)}</span>}</div>}</><div className={`whitespace-nowrap text-[clamp(21px,6.5vw,26px)] font-bold leading-none tabular-nums ${totalNetProfitClass}`}>{formatPrice(totalProfitAttribution.total)} <span className="text-xs font-semibold opacity-70">U</span></div></div>
                    {totalProfitAttribution.hasIndividualScope && <button type="button" onClick={() => setShowPayoutXirrHelp(true)} aria-haspopup="dialog" className="mt-2 border-b border-dotted border-slate-300 pb-px text-left text-[10px] leading-none text-slate-500 active:opacity-60" aria-label="查看实际年化计算说明">实际年化</button>}
                  </div>
                  {totalProfitAttribution.hasIndividualScope && latestWithdrawalLog && <aside className="min-w-0 border-l border-[#DC6218] bg-[#F37021] px-2.5 py-2.5 text-left tabular-nums">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 whitespace-nowrap text-[11px] font-bold leading-none tracking-[0.02em] text-slate-950"><span>最近一笔提现</span><span aria-hidden="true" className="text-[14px] leading-none">🎉</span></div>
                      <div className="mt-1.5 flex h-7 items-baseline rounded-[3px] bg-white px-1.5 pt-[5px] shadow-[0_1px_0_rgba(255,255,255,0.45)]">
                        <span className="text-[clamp(18px,5.25vw,22px)] font-extrabold leading-none tracking-[-0.045em] text-slate-950">{formatPrice(latestWithdrawalLog.amount)}</span>
                        <span className="ml-1 text-[9px] font-bold leading-none text-slate-700">u</span>
                      </div>
                      <div className="mt-1.5 whitespace-nowrap text-[10px] font-semibold leading-none text-slate-950/70">{formatPayoutRecordedBeijingTime(latestWithdrawalLog.createdAt)}</div>
                    </div>
                  </aside>}
                </div>
              </div>
              <div className="grid grid-cols-3 divide-x divide-slate-200 border-t border-slate-100 bg-white text-center tabular-nums">
                <div className="min-w-0 overflow-hidden px-[clamp(5px,1.8vw,9px)] py-3">
                  <div className="whitespace-nowrap text-[11px] font-medium text-slate-500">订单收益</div>
                  <div className={`mt-1 whitespace-nowrap tracking-[-0.055em] text-[clamp(10px,3.2vw,16px)] font-bold leading-none ${totalProfitAttribution.ownTradingNetProfit >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatPrice(totalProfitAttribution.ownTradingNetProfit)} <span className="text-[9px] font-medium tracking-normal">U</span></div>
                  <div className="mt-1 whitespace-nowrap text-[10px] text-slate-400">{totalProfitAttribution.ownTradingCount} 笔已平仓</div>
                </div>
                <div className="min-w-0 overflow-hidden px-[clamp(5px,1.8vw,9px)] py-3">
                  <div className="whitespace-nowrap text-[11px] font-medium text-slate-500">分佣收益</div>
                  <div className={`mt-1 whitespace-nowrap tracking-[-0.055em] text-[clamp(10px,3.2vw,16px)] font-bold leading-none ${totalProfitAttribution.commissionShareNetProfit >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{Math.abs(totalProfitAttribution.commissionShareNetProfit) < 0.000001 ? "0.00" : formatPrice(totalProfitAttribution.commissionShareNetProfit)} <span className="text-[9px] font-medium tracking-normal">U</span></div>
                  <div className="mt-1 whitespace-nowrap text-[10px] text-slate-400">{totalProfitAttribution.commissionShareCount} 笔分佣收益</div>
                </div>
                <div className="min-w-0 overflow-hidden px-[clamp(5px,1.8vw,9px)] py-3">
                  <div className="whitespace-nowrap text-[11px] font-medium text-slate-500">共享收益</div>
                  <div className={`mt-1 whitespace-nowrap tracking-[-0.055em] text-[clamp(10px,3.2vw,16px)] font-bold leading-none ${totalProfitAttribution.sharedIncomeNetProfit >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatPrice(totalProfitAttribution.sharedIncomeNetProfit)} <span className="text-[9px] font-medium tracking-normal">U</span></div>
                  <div className="mt-1 whitespace-nowrap text-[10px] text-slate-400">{totalProfitAttribution.sharedIncomeCount} 笔共享收益</div>
                </div>
              </div>
            </section>

            {totalProfitTabContextSummary ? <T0TotalProfitContextSummaryCard summary={totalProfitTabContextSummary} animated={isTotalProfitCompositionAnimated} /> : <section className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-semibold text-slate-800">收益构成</div>
                <div className="shrink-0 text-[10px] text-slate-400">订单、分佣、共享 · 按绝对值</div>
              </div>
              <div className="mt-2 grid grid-cols-[88px_minmax(0,1fr)] items-center gap-2.5">
                <div className="relative h-[88px] w-[88px] shrink-0 rounded-full shadow-sm" style={{ background: totalProfitCompositionGradient }}>
                  <div className="absolute inset-[8px] flex min-w-0 flex-col items-center justify-center rounded-full bg-white px-1 shadow-[inset_0_1px_2px_rgba(15,23,42,0.05)]"><span className="text-[9px] font-medium text-slate-400">总收益</span><span title={`${formatPrice(totalProfitAttribution.total)} U`} className={`mt-1 max-w-full whitespace-nowrap font-bold leading-none tracking-[-0.055em] tabular-nums ${totalNetProfitClass}`} style={{ fontSize: `${totalProfitCompositionWholeFontSize}px` }}>{totalProfitCompositionWhole}</span><span className="mt-1 whitespace-nowrap text-[9px] font-semibold leading-none tabular-nums text-slate-400">{totalProfitCompositionFraction ? `.${totalProfitCompositionFraction}` : ""}<span className="ml-0.5 text-[8px]">U</span></span></div>
                </div>
                <div className="min-w-0 overflow-hidden rounded-lg border border-slate-100 bg-white/90 shadow-[0_1px_2px_rgba(15,23,42,0.03)] divide-y divide-slate-100">
                  {totalProfitCompositionItems.map((item, index) => <div key={item.key} className="px-2.5 py-1">
                    <div className="flex min-w-0 items-center gap-1.5 text-[10px] leading-none"><span className="flex min-w-0 items-center gap-1 font-medium text-slate-600"><i className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} /><span className="shrink-0">{item.label}收益</span><span className="min-w-0 truncate font-bold tracking-[-0.035em] tabular-nums" style={{ color: item.color }}>{formatPrice(item.value)}<span className="ml-0.5 text-[8px] font-medium text-slate-400">U</span></span></span><span className="ml-auto shrink-0 font-bold tabular-nums" style={{ color: item.color }}>{(item.ratio * 100).toFixed(2)}%</span></div>
                    <div className="mt-1 h-[4px] overflow-hidden rounded-full" style={{ backgroundColor: item.trackColor }}><div className="h-full rounded-full" style={{ width: isTotalProfitCompositionAnimated ? `${item.ratio * 100}%` : "0%", background: item.gradient, boxShadow: "inset 0 -1px 2px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.24)", transition: `width 0.85s cubic-bezier(0.4,0,0.2,1) ${index * 70}ms` }} /></div>
                  </div>)}
                </div>
              </div>
            </section>}

            <div className="mt-3 overflow-hidden rounded border border-slate-200">
              <div className="border-b border-slate-100 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-500">
                <div className={`grid min-w-0 gap-1 ${canViewTeamOverview ? "grid-cols-6" : "grid-cols-5"}`} role="tablist" aria-label="总收益报告明细切换">
                  {[
                    { id: "order" as const, label: "已平仓" },
                    { id: "deposit" as const, label: "充值" },
                    { id: "withdrawal" as const, label: "提现" },
                    { id: "commission" as const, label: "分佣" },
                    { id: "shared" as const, label: "共享" },
                    ...(canViewTeamOverview ? [{ id: "team" as const, label: "团队" }] : []),
                  ].map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={activeTotalProfitDetailTab === tab.id} onClick={() => {
                    setTotalProfitDetailTab(tab.id);
                    setTotalRevenueDetailPage(1);
                  }} className={`min-w-0 rounded border px-1 py-1.5 text-[11px] font-semibold leading-none whitespace-nowrap transition active:scale-95 ${activeTotalProfitDetailTab === tab.id ? "border-slate-800 bg-slate-800 text-white shadow-sm" : "border-slate-200 bg-white text-slate-500 active:bg-slate-100"}`}>{tab.label}</button>)}
                </div>
                <div className="mt-1 pr-0.5 text-right text-[10px] tabular-nums text-slate-400">{activeTotalProfitDetailTab === "team" ? `共 ${teamOverviewMembers.length} 人` : `共 ${isTotalProfitActivityTab ? activeTotalProfitAttributionDetailEntries.length : totalProfitDetailCashflowLogs.length} 笔`}</div>
              </div>
              {activeTotalProfitDetailTab === "team" ? <>
                {t0TeamOverviewQuery.isLoading ? <div className="px-3 py-10 text-center text-xs text-slate-400">团队数据加载中…</div> : canViewTeamOverview ? <div className="bg-white">
                  {!teamOverview?.dataCompleteness?.isComplete && <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">{teamOverview?.dataCompleteness?.reason || "团队累计收益正在核算中"}</div>}
                  <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5"><span className="text-xs font-semibold text-slate-800">成员概览</span><span className="text-[11px] text-slate-400">总金额 · 总收益 · 年化回报</span></div>
                  {teamOverviewMembers.length > 0 ? <div className="divide-y divide-slate-100">{teamOverviewMembers.map((member) => {
                    const memberStartDate = formatT0TeamMemberStartDate(member.firstActivityOn);
                    return <div key={member.userId} className="px-3 py-3">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 leading-none"><span className="min-w-0 truncate text-[15px] font-semibold text-slate-800">{member.name}</span>{memberStartDate && <span className="shrink-0 text-[11px] font-medium tabular-nums text-slate-400">{memberStartDate}</span>}</div>
                    <div className="mt-2.5 grid grid-cols-3 divide-x divide-slate-200 border-y border-slate-100 tabular-nums"><div className="min-w-0 px-1.5 py-1"><div className="text-[11px] text-slate-400">总金额</div><div className="mt-1 whitespace-nowrap tracking-[-0.035em] text-[clamp(12px,3.4vw,14px)] font-bold leading-none text-slate-900">{member.cumulativeDepositAmount.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}</div></div><div className="min-w-0 px-1.5 py-1"><div className="text-[11px] text-slate-400">总收益</div><div className={`mt-1 whitespace-nowrap tracking-[-0.035em] text-[clamp(12px,3.4vw,14px)] font-bold leading-none ${Number(member.currentCumulativeIncome || 0) >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{member.currentCumulativeIncome === null ? "--" : member.currentCumulativeIncome.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}</div></div><div className="min-w-0 px-1.5 py-1"><div className="text-[11px] text-slate-400">年化回报</div><div className={`mt-1 whitespace-nowrap tracking-[-0.035em] text-[clamp(12px,3.4vw,14px)] font-bold leading-none ${member.annualizedReturn === null ? "text-slate-400" : Number(member.annualizedReturn) >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatT0AnnualizedReturn(member.annualizedReturn)}</div></div></div>
                  </div>;})}</div> : <div className="px-3 py-10 text-center text-xs text-slate-400">暂无团队成员</div>}
                  <p className="border-t border-slate-100 px-3 py-2 text-[10px] leading-4 text-slate-400">仅包含52号账本成员，且至少有非期权T+0下单、入金/提现、收到分佣或收到共享记录。期权订单及其分佣、共享不纳入本总览；收益按已实现订单归属、收到分佣及已到账共享汇总，不含未平仓浮盈亏、提现和钱包余额。年化回报按逐笔入金、提现及当前非期权已实现净值计算。</p>
                </div> : <div className="px-3 py-10 text-center text-xs text-slate-400">暂无团队查看权限</div>}
              </> : isTotalProfitActivityTab ? <>
                {activeTotalProfitAttributionDetailEntries.length > 0 ? (
                  <div className="divide-y divide-slate-100">
                    {pagedTotalProfitAttributionDetailEntries.map((entry) => {
                      const referenceTrade = entry.trade ?? entry.sourceTrade;
                      const isLong = referenceTrade ? ACTIONS[referenceTrade.action].side === "long" : true;
                      const typeLabel = entry.kind === "shared"
                        ? "共享"
                        : entry.kind === "commission"
                          ? "分佣"
                          : (referenceTrade ? ACTIONS[referenceTrade.action].label : "订单");
                      const typeClass = entry.kind === "shared"
                        ? "text-blue-600"
                        : entry.kind === "commission"
                          ? "text-indigo-600"
                          : (isLong ? "text-rose-600" : "text-emerald-600");
                      const displayQuantity = entry.quantity ?? referenceTrade?.quantity;
                      return (
                        <div key={entry.id} className="grid min-w-0 grid-cols-[61px_32px_48px_minmax(0,1fr)_auto] items-center gap-x-1 px-3 py-2 text-[10px] tabular-nums whitespace-nowrap">
                          <span className="shrink-0 text-slate-400">{formatBeijingMonthDayTime(entry.createdAt)}</span>
                          <span className={`shrink-0 font-semibold ${typeClass}`} title={entry.recipientName}>{typeLabel}</span>
                          <span className="shrink-0 font-medium text-slate-700">{displayQuantity === undefined ? "—" : `${formatQuantity(displayQuantity)}E`}</span>
                          <span className="min-w-0 truncate text-right text-slate-500">{referenceTrade ? formatPrice(referenceTrade.price) : "—"}</span>
                          <span className={`shrink-0 text-right font-semibold ${entry.amount >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatSigned(entry.amount)} U</span>
                        </div>
                      );
                    })}
                  </div>
                ) : <div className="px-3 py-5 text-center text-xs text-slate-400">暂无{activeTotalProfitDetailTab === "order" ? "已平仓" : activeTotalProfitDetailTab === "commission" ? "分佣" : activeTotalProfitDetailTab === "shared" ? "共享" : "已实现收益"}记录</div>}
                {activeTotalProfitAttributionDetailEntries.length > 0 && totalRevenueDetailTotalPages > 1 && (
                  <div data-html2canvas-ignore="true" className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-3 py-2 text-[11px] tabular-nums">
                    <button
                    type="button"
                    disabled={totalRevenueDetailPage <= 1}
                    onClick={() => setTotalRevenueDetailPage((current) => Math.max(1, current - 1))}
                      className="h-7 rounded border border-slate-200 bg-white px-2.5 font-medium text-slate-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      上一页
                    </button>
                    <span className="whitespace-nowrap text-slate-500">第 {totalRevenueDetailPage} 页 / 共 {totalRevenueDetailTotalPages} 页</span>
                    <button
                    type="button"
                    disabled={totalRevenueDetailPage >= totalRevenueDetailTotalPages}
                    onClick={() => setTotalRevenueDetailPage((current) => Math.min(totalRevenueDetailTotalPages, current + 1))}
                      className="h-7 rounded border border-slate-200 bg-white px-2.5 font-medium text-slate-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      下一页
                    </button>
                  </div>
                )}
              </> : <>
                <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5 text-[10px] font-medium text-slate-400 tabular-nums"><span>日期</span><span>金额</span></div>
                {totalProfitDetailCashflowLogs.length > 0 ? <div className="divide-y divide-slate-100">{totalProfitDetailCashflowLogs.map((log) => {
                  const isDeposit = activeTotalProfitDetailTab === "deposit";
                  const isEthInput = isDeposit && log.depositInputMode === "eth" && Boolean(log.ethQuantity);
                  const primaryAmount = isEthInput
                    ? <>{formatPayoutEthQuantity(log.ethQuantity)} <span className="text-[9px] font-medium opacity-75">ETH</span></>
                    : <>{formatPrice(log.amount)} <span className="text-[9px] font-medium opacity-75">U</span></>;
                  return <div key={log.id} className="px-3 py-2 tabular-nums">
                    <div className="flex items-center justify-between gap-3 text-[11px]"><span className="whitespace-nowrap text-slate-500">{log.occurredOn.replaceAll("-", "/")}</span><span className={`whitespace-nowrap text-right font-semibold ${activeTotalProfitDetailTab === "withdrawal" ? "text-slate-800" : isEthInput ? "text-indigo-700" : "text-sky-700"}`}>{primaryAmount}</span></div>
                    {(!totalProfitAttribution.hasIndividualScope || log.note || isDeposit) && <div className="mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[10px] leading-4 text-slate-400">{!totalProfitAttribution.hasIndividualScope && <span className="shrink-0 text-slate-500">{log.relatedUserName}</span>}{log.note && <span className="min-w-0 break-words">备注：{log.note}</span>}{isDeposit && <span className="shrink-0 tabular-nums">{isEthInput ? <><span className="font-medium text-indigo-600">= {formatPrice(log.amount)} U</span>{log.ethReferencePrice && <span className="ml-1.5">参考价 {formatPrice(Number(log.ethReferencePrice))} U</span>}</> : <>{log.ethQuantity ? <span className="font-medium text-sky-700">≈ {formatPayoutEthQuantity(log.ethQuantity)} ETH</span> : <span>未填写参考币数</span>}{log.ethReferencePrice && <span className="ml-1.5">参考价 {formatPrice(Number(log.ethReferencePrice))} U</span>}</>}</span>}</div>}
                  </div>;
                })}</div> : <div className="px-3 py-5 text-center text-xs text-slate-400">暂无{activeTotalProfitDetailTab === "withdrawal" ? "提现" : "充值"}记录</div>}
              </>}
            </div>
            </div>
            )}

            {!isTotalProfitPage && <button data-html2canvas-ignore="true" type="button" onClick={closeTotalProfitReport} className="mt-5 h-11 w-full rounded bg-[#1a56db] text-sm font-semibold text-white active:scale-[0.99]">知道了</button>}
          </div>
        </div>
      )}

      {showNetPositionDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-5" role="dialog" aria-modal="true" aria-label="总仓位对冲明细">
          <div className="max-h-[88vh] w-full max-w-sm overflow-y-auto rounded bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-base font-semibold text-slate-900">总仓位明细</div>
                <div className="mt-1 text-xs text-slate-500">当前筛选范围内的未平仓档位</div>
              </div>
              <button type="button" onClick={() => setShowNetPositionDetail(false)} className="rounded p-1 text-slate-400 active:scale-90" aria-label="关闭总仓位明细">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 tabular-nums">
              <section className="overflow-hidden rounded border border-rose-200">
                <div className="flex items-center justify-between gap-3 bg-rose-50/70 px-3 py-2">
                  <span
                    className="min-w-0 truncate text-sm font-semibold text-rose-600"
                    title={netPositionBreakdown.long.levels.length > 0 ? `多仓 · ${netPositionBreakdown.long.levels.length}档（${netPositionBreakdown.long.levels.map((bucket) => `${formatLadderPrice(bucket.price)}档`).join("、")}）` : "多仓 · 0档"}
                  >
                    多仓 · {netPositionBreakdown.long.levels.length}档{netPositionBreakdown.long.levels.length > 0 ? `（${netPositionBreakdown.long.levels.map((bucket) => formatLadderPrice(bucket.price)).join("、")}）` : ""}
                  </span>
                  <span className="whitespace-nowrap text-xs font-semibold text-slate-700">合计 {formatQuantity(netPositionBreakdown.long.quantity)} ETH</span>
                </div>
                {netPositionBreakdown.long.levels.length > 0 ? (
                  <div className="divide-y divide-rose-100">
                    {netPositionBreakdown.long.levels.map((bucket) => (
                      <div key={bucket.key} className="flex items-center justify-between gap-4 px-3 py-2 text-xs">
                        <span className="text-slate-500">{formatLadderPrice(bucket.price)} 档</span>
                        <span className="font-medium text-slate-800">{formatQuantity(bucket.remainingQuantity)} ETH</span>
                      </div>
                    ))}
                  </div>
                ) : <div className="px-3 py-3 text-center text-xs text-slate-400">暂无多仓</div>}
              </section>

              <section className="overflow-hidden rounded border border-emerald-200">
                <div className="flex items-center justify-between gap-3 bg-emerald-50/70 px-3 py-2">
                  <span
                    className="min-w-0 truncate text-sm font-semibold text-emerald-600"
                    title={netPositionBreakdown.short.levels.length > 0 ? `空仓 · ${netPositionBreakdown.short.levels.length}档（${netPositionBreakdown.short.levels.map((bucket) => `${formatLadderPrice(bucket.price)}档`).join("、")}）` : "空仓 · 0档"}
                  >
                    空仓 · {netPositionBreakdown.short.levels.length}档{netPositionBreakdown.short.levels.length > 0 ? `（${netPositionBreakdown.short.levels.map((bucket) => formatLadderPrice(bucket.price)).join("、")}）` : ""}
                  </span>
                  <span className="whitespace-nowrap text-xs font-semibold text-slate-700">合计 {formatQuantity(netPositionBreakdown.short.quantity)} ETH</span>
                </div>
                {netPositionBreakdown.short.levels.length > 0 ? (
                  <div className="divide-y divide-emerald-100">
                    {netPositionBreakdown.short.levels.map((bucket) => (
                      <div key={bucket.key} className="flex items-center justify-between gap-4 px-3 py-2 text-xs">
                        <span className="text-slate-500">{formatLadderPrice(bucket.price)} 档</span>
                        <span className="font-medium text-slate-800">{formatQuantity(bucket.remainingQuantity)} ETH</span>
                      </div>
                    ))}
                  </div>
                ) : <div className="px-3 py-3 text-center text-xs text-slate-400">暂无空仓</div>}
              </section>

              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-sm font-semibold text-slate-700">合计总仓位</span>
                  <span className="whitespace-nowrap text-lg font-bold text-slate-900">{netPositionDetailText} <span className="text-xs font-semibold text-slate-500">ETH</span></span>
                </div>
                <div className="mt-1 text-[11px] text-slate-500">多 {formatQuantity(netPositionBreakdown.long.quantity)} ETH − 空 {formatQuantity(netPositionBreakdown.short.quantity)} ETH</div>
              </div>
            </div>

            <button type="button" onClick={() => setShowNetPositionDetail(false)} className="mt-5 h-11 w-full rounded bg-[#1a56db] text-sm font-semibold text-white active:scale-[0.99]">知道了</button>
          </div>
        </div>
      )}

      {grossProfitDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-5" role="dialog" aria-modal="true" aria-label="累计净收益说明">
          <div className="w-full max-w-sm rounded bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-base font-semibold text-slate-900">{isMemberView ? "累计净收益说明" : `${grossProfitDetail.side === "long" ? "多仓" : "空仓"}累计净收益明细`}</div>
                {!isMemberView && <div className="mt-1 text-xs text-slate-500">已平仓部分按实际成交价汇总</div>}
              </div>
              <button type="button" onClick={() => setGrossProfitDetail(null)} className="rounded p-1 text-slate-400 active:scale-90" aria-label="关闭累计净收益说明">
                <X className="h-5 w-5" />
              </button>
            </div>
            {isMemberView ? (
              <div className="mt-5 rounded bg-slate-50 px-4 py-4 text-center text-sm leading-6 text-slate-600">累计净收益已扣除开仓与平仓交易手续费。</div>
            ) : <>
              <div className="mt-4 space-y-2 text-sm tabular-nums">
                <div className="flex items-center justify-between gap-4"><span className="text-slate-500">毛收益</span><span className={`font-medium ${grossProfitDetail.gross >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatSigned(grossProfitDetail.gross)} U</span></div>
                <div className="flex items-center justify-between gap-4"><span className="text-slate-500">开仓手续费分摊</span><span className="font-medium text-slate-700">−{formatFee(grossProfitDetail.openingFee)} U</span></div>
                <div className="flex items-center justify-between gap-4"><span className="text-slate-500">平仓手续费</span><span className="font-medium text-slate-700">−{formatFee(grossProfitDetail.closingFee)} U</span></div>
                <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-2"><span className="font-semibold text-slate-800">累计净收益</span><span className={`font-semibold ${grossProfitDetail.net >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatSigned(grossProfitDetail.net)} U</span></div>
              </div>
              <div className="mt-3 rounded bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-500">累计净收益已扣除已平部分的开仓手续费分摊及平仓手续费。</div>
            </>}
            <button type="button" onClick={() => setGrossProfitDetail(null)} className="mt-5 h-11 w-full rounded bg-slate-800 text-sm font-semibold text-white active:scale-[0.99]">知道了</button>
          </div>
        </div>
      )}

      {netProfitDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-5" role="dialog" aria-modal="true" aria-label="净利润计算明细">
          <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-base font-semibold text-slate-900">{netProfitDetailUsesMemberPresentation && memberProfitShareDetail
                  ? netProfitDetail.trade.historyIncomeKind === "commission"
                    ? "分佣收益"
                    : netProfitDetail.trade.historyIncomeKind === "shared"
                      ? "共享收益"
                      : "本单收益"
                  : netProfitDetailUsesMemberPresentation ? "净利润说明" : "净利润计算明细"}</div>
                {!netProfitDetailUsesMemberPresentation && <div className="mt-1 text-xs text-slate-500">已扣除开仓与平仓两次实际手续费</div>}
              </div>
              <button type="button" onClick={() => setNetProfitDetail(null)} className="rounded p-1 text-slate-400 active:scale-90" aria-label="关闭净利润说明">
                <X className="h-5 w-5" />
              </button>
            </div>
            {netProfitDetailUsesMemberPresentation ? (
              memberProfitShareDetail ? <>
                <div className="mt-4 overflow-hidden rounded border border-indigo-100 bg-indigo-50/45 text-sm tabular-nums">
                  <div className="flex items-center justify-between gap-4 px-3 py-3.5">
                    <span className="font-semibold text-slate-800">{netProfitDetail.trade.historyIncomeKind === "commission" ? "本次分佣" : netProfitDetail.trade.historyIncomeKind === "shared" ? "本次共享" : "本单可得"}</span>
                    <span className={`text-lg font-semibold ${memberProfitShareDetail.netPnl >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatSigned(memberProfitShareDetail.netPnl)}<span className="ml-0.5 font-normal text-slate-900">u</span></span>
                  </div>
                </div>
                <div className="mt-3 px-1 text-[11px] leading-5 text-slate-400">{netProfitDetail.trade.historyIncomeKind === "commission"
                  ? "本行仅展示该来源平仓的分佣收益。"
                  : netProfitDetail.trade.historyIncomeKind === "shared"
                    ? "本行仅展示该来源平仓的共享收益。"
                    : Number(netProfitDetail.trade.sharedIncomeAmount || 0) > 0 ? "本单共享收益已计入本单可得。" : "已按本单实际归属计算。"}</div>
              </> : <>
                <div className="mt-5 rounded bg-slate-50 px-4 py-4 text-center text-sm text-slate-600">已扣除交易成本后的净利润。</div>
                {(netProfitDetail.detail.buyPrice !== undefined || netProfitDetail.detail.sellPrice !== undefined) && <div className="mt-3 px-1 text-[11px] tabular-nums text-slate-400">
                  成交参考：{netProfitDetail.detail.buyPrice !== undefined && <>买 {netProfitDetail.detail.buyQuote ?? formatPrice(netProfitDetail.detail.buyPrice)}</>}{netProfitDetail.detail.buyPrice !== undefined && netProfitDetail.detail.sellPrice !== undefined && <span className="px-1.5 text-slate-300">·</span>}{netProfitDetail.detail.sellPrice !== undefined && <>卖 {netProfitDetail.detail.sellQuote ?? formatPrice(netProfitDetail.detail.sellPrice)}</>}
                </div>}
              </>
            ) : <>
              <section className="mt-3 overflow-hidden rounded border border-slate-200 bg-slate-50/60 text-xs tabular-nums">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white/70 px-2.5 py-1.5"><span className="font-semibold text-slate-800">{ACTIONS[netProfitDetail.trade.action].label} {formatQuantity(netProfitDetail.trade.quantity)} ETH</span><span className={(netProfitDetail.detail.grossPnl ?? 0) >= 0 ? "font-semibold text-rose-600" : "font-semibold text-emerald-600"}>{formatSigned(netProfitDetail.detail.grossPnl ?? 0)}<span className="ml-0.5 font-normal text-slate-900">u</span></span></div>
                <div className="flex items-center justify-between gap-3 px-2.5 py-1.5 text-slate-600"><span>手续费</span><span className="font-medium text-emerald-600">−{formatFee((netProfitDetail.detail.allocatedOpeningFee ?? 0) + (netProfitDetail.detail.closingFee ?? 0))}<span className="ml-0.5 font-normal text-slate-900">u</span></span></div>
                <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white/70 px-2.5 py-1.5"><span className="font-semibold text-slate-700">净收益</span><span className={`font-semibold ${(netProfitDetail.detail.netPnl ?? 0) >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatSigned(netProfitDetail.detail.netPnl ?? 0)}<span className="ml-0.5 font-normal text-slate-900">u</span></span></div>
              </section>
              {netProfitAllocationSummary?.sharedRows.length ? <section className="mt-2 overflow-hidden rounded border border-indigo-100 bg-indigo-50/35 text-xs tabular-nums">
                <div className="flex items-center justify-between gap-3 border-b border-indigo-100 bg-white/70 px-2.5 py-1.5"><span className="font-semibold text-slate-900">最大可分配共享收益</span><span className="font-semibold text-slate-900">{formatSigned(netProfitAllocationSummary.netPnl)}<span className="ml-0.5 font-normal text-slate-900">u</span></span></div>
                <div className="divide-y divide-indigo-100/90 bg-white/55">
                  {netProfitAllocationSummary.sharedRows.map((transfer) => <div key={transfer.id} className="flex items-center justify-between gap-3 px-2.5 py-1.5 tabular-nums"><span className="min-w-0 truncate font-medium text-slate-800">{transfer.recipientUserName}</span><span className={`shrink-0 font-semibold ${transfer.amount >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatSigned(transfer.amount)}<span className="ml-0.5 font-normal text-slate-900">u</span></span></div>)}
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-indigo-100 bg-white/70 px-2.5 py-1.5 tabular-nums"><span className="font-semibold text-slate-700">剩余</span><span className="font-semibold text-slate-900">{formatSigned(netProfitAllocationSummary.netPnl - netProfitAllocationSummary.sharedTotal)}<span className="ml-0.5 font-normal text-slate-900">u</span></span></div>
              </section> : null}
              {netProfitAllocationSummary?.regularRows.length ? <section className="mt-2 overflow-hidden rounded border border-slate-200 bg-slate-50/60 text-xs tabular-nums">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white/70 px-2.5 py-1.5"><span className="font-semibold text-slate-900">利润分配</span><span className="font-semibold text-slate-900">{formatSigned(netProfitAllocationSummary.regularTotal)}<span className="ml-0.5 font-normal text-slate-900">u</span></span></div>
                <div className="divide-y divide-slate-100 bg-white/55">
                  {netProfitAllocationSummary.regularRows.map((allocation, index) => <div key={`${allocation.beneficiaryUserId}-${index}`} className="flex items-center justify-between gap-3 px-2.5 py-1.5 tabular-nums"><span className="min-w-0 truncate font-medium text-slate-800">{allocation.beneficiaryUserName}<small className="ml-1 text-[10px] font-normal text-slate-500">{allocation.percentageLabel}</small></span><span className={`shrink-0 font-semibold ${allocation.netPnl >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatSigned(allocation.netPnl)}<span className="ml-0.5 font-normal text-slate-900">u</span></span></div>)}
                </div>
              </section> : null}
            </>}
            <button type="button" onClick={() => setNetProfitDetail(null)} className="mt-5 h-11 w-full rounded bg-slate-800 text-sm font-semibold text-white active:scale-[0.99]">知道了</button>
          </div>
        </div>
      )}

      {canManage && deleteCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-5" role="dialog" aria-modal="true" aria-label="删除开仓记录">
          <div className="w-full max-w-sm rounded bg-white p-5 shadow-2xl">
            <div className="text-base font-semibold text-slate-900">删除这笔开仓记录？</div>
            <div className="mt-2 text-sm tabular-nums text-slate-700">
              {ACTIONS[deleteCandidate.action].label} {formatQuantity(deleteCandidate.quantity)} ETH @ {formatPrice(deleteCandidate.price)}
            </div>
            <div className="mt-2 text-[11px] leading-5 text-slate-500">删除后该开仓不再计入价格簿、仓位和盈亏，删除前记录、操作时间与操作人会保留在审计记录中。若此开仓已有对应平仓记录，系统会拒绝删除，须先回撤对应平仓流水。</div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={deleteOpeningEntryMutation.isPending}
                onClick={() => setDeleteCandidate(null)}
                className="h-11 rounded border border-slate-200 bg-white text-sm font-semibold text-slate-700 disabled:opacity-40"
              >
                取消
              </button>
              <button
                disabled={deleteOpeningEntryMutation.isPending}
                onClick={() => deleteOpeningEntryMutation.mutate({ ledgerId: 52, entryId: Number(getStoredEntryId(deleteCandidate)) })}
                className="h-11 rounded bg-rose-600 text-sm font-semibold text-white shadow-sm disabled:opacity-40"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {canManage && revertCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-5" role="dialog" aria-modal="true" aria-label="回撤速记流水">
          <div className="w-full max-w-sm rounded bg-white p-5 shadow-2xl">
            <div className="text-base font-semibold text-slate-900">回撤这笔速记？</div>
            <div className="mt-2 text-sm tabular-nums text-slate-700">
              {ACTIONS[revertCandidate.action].label} {formatQuantity(revertCandidate.quantity)} ETH @ {formatPrice(revertCandidate.price)}
            </div>
            <div className="mt-2 text-[11px] leading-5 text-slate-500">
              回撤后，该笔不会再影响价格簿、多空仓位和盈亏；原始流水会保留在“最近撤回”中，可随时恢复。
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={revertEntryMutation.isPending}
                onClick={() => setRevertCandidate(null)}
                className="h-11 rounded border border-slate-200 bg-white text-sm font-semibold text-slate-700 disabled:opacity-40"
              >
                取消
              </button>
              <button
                disabled={revertEntryMutation.isPending}
                onClick={() => revertEntryMutation.mutate({ ledgerId: 52, entryId: Number(getStoredEntryId(revertCandidate)) })}
                className="h-11 rounded bg-amber-600 text-sm font-semibold text-white shadow-sm disabled:opacity-40"
              >
                确认回撤
              </button>
            </div>
          </div>
        </div>
      )}

      {canManage && restoreCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-5" role="dialog" aria-modal="true" aria-label="恢复速记流水">
          <div className="w-full max-w-sm rounded bg-white p-5 shadow-2xl">
            <div className="text-base font-semibold text-slate-900">恢复这笔速记？</div>
            <div className="mt-2 text-sm tabular-nums text-slate-700">
              {ACTIONS[restoreCandidate.trade.action].label} {formatQuantity(restoreCandidate.trade.quantity)} ETH @ {formatPrice(restoreCandidate.trade.price)}
            </div>
            <div className="mt-2 text-[11px] leading-5 text-slate-500">
              恢复后将重新计入价格簿、仓位和盈亏。若其为平仓记录，系统会先复核对应档位的可平数量。
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={restoreEntryMutation.isPending}
                onClick={() => setRestoreCandidate(null)}
                className="h-11 rounded border border-slate-200 bg-white text-sm font-semibold text-slate-700 disabled:opacity-40"
              >
                取消
              </button>
              <button
                disabled={restoreEntryMutation.isPending}
                onClick={() => restoreEntryMutation.mutate({ ledgerId: 52, auditId: Number(restoreCandidate.auditId) })}
                className="h-11 rounded bg-indigo-600 text-sm font-semibold text-white shadow-sm disabled:opacity-40"
              >
                确认恢复
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children, labelAction, labelFor, horizontal = false }: { label: ReactNode; children: ReactNode; labelAction?: ReactNode; labelFor?: string; horizontal?: boolean }) {
  if (horizontal) {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.58fr)] items-center gap-x-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <label htmlFor={labelFor} className="w-12 shrink-0 text-xs font-medium text-slate-600">{label}</label>
          {labelAction && <div className="min-w-0 shrink-0">{labelAction}</div>}
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    );
  }
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-600 mb-2">{label}</span>
      {children}
    </label>
  );
}

function LockedFilterValue({ label, value }: { label?: string; value: string }) {
  return (
    <div
      title={value}
      className="flex h-10 w-full items-center gap-1.5 truncate rounded border border-slate-300 bg-white/60 px-2.5 text-[13px] font-medium text-slate-700"
      style={{
        textShadow: "-0.35px -0.35px 0 rgba(255,255,255,0.86), 0.6px 0.6px 0 rgba(71,85,105,0.20)",
        boxShadow: "inset 0 1px 1px rgba(255,255,255,0.96), inset 0 -1px 0 rgba(100,116,139,0.20)",
      }}
    >
      {label && <span className="shrink-0 text-[11px] font-semibold tracking-wide text-slate-500" style={{ textShadow: "-0.6px -0.6px 0 rgba(255,255,255,0.94), 0.8px 0.8px 0 rgba(71,85,105,0.28)" }}>{label}</span>}
      <span className="truncate">{value}</span>
    </div>
  );
}

type T0MultiSelectOption = {
  id: string;
  label: string;
  /** 下拉选项可展示完整识别信息；顶部已选摘要可使用更短文案。 */
  summaryLabel?: string;
  /** 推荐总项用靛蓝色区分；推荐子用户与总项同级缩进，明确其为子分类。 */
  kind?: "referral-descendants" | "referral-member";
};

/** 三项多选框按内容保留统一左右留白，初始状态则均分整行宽度。 */
function buildT0FilterGridTemplateColumns(filterSpecs: Array<{ summary: string; selectedCount: number }>) {
  if (filterSpecs.every((spec) => spec.selectedCount === 0)) return undefined;
  const visualUnits = (text: string) => Array.from(text).reduce(
    (total, character) => total + (/^[\x00-\xff]$/.test(character) ? 1 : 2),
    0,
  );
  const widestIndex = filterSpecs.reduce(
    (widest, spec, index) => visualUnits(spec.summary) >= visualUnits(filterSpecs[widest].summary) ? index : widest,
    0,
  );
  if (filterSpecs.every((spec) => spec.selectedCount > 0)) {
    return filterSpecs
      .map((spec) => `minmax(44px, ${Math.max(7, Math.min(24, visualUnits(spec.summary) + 8))}fr)`)
      .join(" ");
  }
  return filterSpecs
    .map((spec, index) => {
      const units = visualUnits(spec.summary);
      if (spec.selectedCount > 0 && index !== widestIndex) {
        return `${Math.max(44, Math.min(148, 20 + units * 7))}px`;
      }
      return `minmax(${spec.selectedCount > 0 ? 52 : 78}px, ${Math.max(5, Math.min(16, units))}fr)`;
    })
    .join(" ");
}

/**
 * T+0 顶部筛选专用：不选任一项即代表全部；勾选多项时在同一维度按并集筛选。
 * 使用普通按钮与小方框勾选，避免移动端原生 multiple select 的长按交互。
 */
function T0MultiSelect({
  label,
  options,
  selectedIds,
  onChange,
  emptyLabel,
  align = "left",
  constrainRightToFilterRow = false,
  compact = false,
  toolbar = false,
  showSelectedLabels = false,
  singleSelect = false,
  treatSelectionAsAll = false,
  summarySuffix,
  additionalToggle,
}: {
  label: string;
  options: T0MultiSelectOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  emptyLabel: string;
  align?: "left" | "right";
  /** 菜单右缘固定对齐同一筛选行最右侧的项目框。 */
  constrainRightToFilterRow?: boolean;
  /** 历史筛选栏使用与同行状态控件一致的紧凑高度。 */
  compact?: boolean;
  /** 历史记录工具栏使用22px按钮高度；仅用于不承载整行筛选栅格的轻量入口。 */
  toolbar?: boolean;
  /** 对类型等短枚举项，直接展示已选名称，而非“已选 N 项”。 */
  showSelectedLabels?: boolean;
  /** 状态等枚举条件只允许选择一个值；“全部”仍通过清空选择表达。 */
  singleSelect?: boolean;
  /** 组合的本人和推荐已覆盖全部可筛选用户时，按“全部”展示但保留可恢复的选择令牌。 */
  treatSelectionAsAll?: boolean;
  /** 独立附加条件的当前摘要，例如“隐藏已锁定”。 */
  summarySuffix?: string;
  /** 在枚举项末尾追加不与主筛选互斥的勾选条件。 */
  additionalToggle?: {
    label: string;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
  };
}) {
  const [open, setOpen] = useState(false);
  const [constrainedMenuWidth, setConstrainedMenuWidth] = useState<number | null>(null);
  const [constrainedMenuRightOffset, setConstrainedMenuRightOffset] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollHapticTimerRef = useRef<number | null>(null);
  const selectedSet = new Set(selectedIds);
  const selectedOptions = options.filter((option) => selectedSet.has(option.id));
  const selectionRepresentsAll = selectedIds.length === 0 || treatSelectionAsAll;
  const baseSummary = selectionRepresentsAll
    ? "全部"
    : selectedOptions.length === 1
      ? selectedOptions[0].summaryLabel ?? selectedOptions[0].label
      : showSelectedLabels
        ? selectedOptions.map((option) => option.summaryLabel ?? option.label).join("、")
        : `已选 ${selectedOptions.length} 项`;
  const summary = summarySuffix ? `${baseSummary} · ${summarySuffix}` : baseSummary;
  const baseSelectedTitle = selectionRepresentsAll
    ? `${label}：全部`
    : `${label}：${selectedOptions.map((option) => option.label).join("、")}`;
  const selectedTitle = summarySuffix ? `${baseSelectedTitle}；${summarySuffix}` : baseSelectedTitle;

  useLayoutEffect(() => {
    if (!open || !constrainRightToFilterRow || !rootRef.current) return;
    const filterRow = rootRef.current.closest("[data-t0-filter-row]");
    if (!(filterRow instanceof HTMLElement)) return;
    const syncMenuRightEdge = () => {
      const triggerBounds = rootRef.current?.getBoundingClientRect();
      const rowBounds = filterRow.getBoundingClientRect();
      if (!triggerBounds) return;
      setConstrainedMenuWidth(Math.min(260, Math.floor(rowBounds.width)));
      setConstrainedMenuRightOffset(Math.floor(triggerBounds.right - rowBounds.right));
    };
    syncMenuRightEdge();
    // 选中单个用户会触发三栏宽度动画；跟随用户框尺寸变化持续重算，
    // 使菜单在动画过程中和结束后都严格对齐项目框右缘。
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(syncMenuRightEdge);
    resizeObserver?.observe(rootRef.current);
    resizeObserver?.observe(filterRow);
    window.addEventListener("resize", syncMenuRightEdge);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", syncMenuRightEdge);
    };
  }, [constrainRightToFilterRow, open, selectedIds.join("|")]);

  useEffect(() => {
    const closeWhenOutside = (event: PointerEvent) => {
      if (rootRef.current && event.target instanceof Node && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const closeWhenEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", closeWhenOutside);
    window.addEventListener("keydown", closeWhenEscape);
    return () => {
      window.removeEventListener("pointerdown", closeWhenOutside);
      window.removeEventListener("keydown", closeWhenEscape);
    };
  }, []);

  useEffect(() => () => {
    if (scrollHapticTimerRef.current !== null) window.clearTimeout(scrollHapticTimerRef.current);
  }, []);

  const toggleOption = (id: string) => {
    if (singleSelect) {
      onChange([id]);
      return;
    }
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onChange(options.filter((option) => next.has(option.id)).map((option) => option.id));
  };

  const handleMenuScroll = () => {
    // 卡点由 scroll-snap 提供；支持 Vibration API 的手机在滚动停下时补一记极短触感。
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    if (scrollHapticTimerRef.current !== null) window.clearTimeout(scrollHapticTimerRef.current);
    scrollHapticTimerRef.current = window.setTimeout(() => {
      navigator.vibrate(7);
      scrollHapticTimerRef.current = null;
    }, 90);
  };

  const renderCheck = (checked: boolean) => (
    <span
      aria-hidden="true"
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border ${checked ? "border-[#1a56db] bg-[#1a56db] text-white" : "border-slate-300 bg-white text-transparent"}`}
    >
      <Check className="h-3.5 w-3.5 stroke-[3]" />
    </span>
  );

  if (options.length === 0) {
    return <LockedFilterValue label={label} value={emptyLabel} />;
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => {
          const nextOpen = !open;
          if (nextOpen && constrainRightToFilterRow && rootRef.current) {
            const filterRow = rootRef.current.closest("[data-t0-filter-row]");
            if (filterRow instanceof HTMLElement) {
              const triggerBounds = rootRef.current.getBoundingClientRect();
              const rowBounds = filterRow.getBoundingClientRect();
              // 无论用户框在智能栅格中被压缩到多窄，菜单右缘都要与项目框右缘重合；
              // 宽度同时不得超过整行，避免窄屏向任一侧越界。
              setConstrainedMenuWidth(Math.min(260, Math.floor(rowBounds.width)));
              setConstrainedMenuRightOffset(Math.floor(triggerBounds.right - rowBounds.right));
            }
          } else if (!nextOpen) {
            setConstrainedMenuWidth(null);
            setConstrainedMenuRightOffset(null);
          }
          setOpen(nextOpen);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={selectedTitle}
        className={`flex w-full min-w-0 items-center gap-1.5 rounded border border-slate-300 bg-white/70 font-medium text-slate-700 outline-none transition-colors focus:border-[#1a56db] active:bg-white ${toolbar ? "h-[22px] px-1 text-[10px]" : compact ? "h-8 px-2 text-[12px]" : "h-10 px-2.5 text-[13px]"}`}
        style={{
          textShadow: "-0.35px -0.35px 0 rgba(255,255,255,0.86), 0.6px 0.6px 0 rgba(71,85,105,0.20)",
          boxShadow: "inset 0 1px 1px rgba(255,255,255,0.96), inset 0 -1px 0 rgba(100,116,139,0.20)",
        }}
      >
        {selectedIds.length === 0 && <span className={`${toolbar ? "text-[10px]" : compact ? "text-[11px]" : "text-[12px]"} shrink-0 font-semibold tracking-wide text-slate-500`}>{label}</span>}
        <span className={`min-w-0 flex-1 truncate ${selectedIds.length === 0 ? "text-left" : "text-center"}`}>{summary}</span>
        {selectedIds.length === 0 && <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />}
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={`${label}多选`}
          onScroll={handleMenuScroll}
          className={`absolute top-[calc(100%+4px)] z-40 max-h-80 w-[min(260px,calc(100vw-32px))] snap-y snap-proximity overscroll-contain overflow-y-auto rounded border py-0 shadow-xl ${constrainedMenuRightOffset !== null ? "" : align === "right" ? "right-0" : "left-0"}`}
          style={{
            width: constrainedMenuWidth ? `${constrainedMenuWidth}px` : undefined,
            right: constrainedMenuRightOffset === null ? undefined : `${constrainedMenuRightOffset}px`,
            background: [
              "linear-gradient(135deg, rgba(255,255,255,0.86) 0%, rgba(255,255,255,0.32) 25%, rgba(255,255,255,0) 50%, rgba(0,0,0,0) 65%, rgba(0,0,0,0.19) 100%)",
              "linear-gradient(90deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.06) 40%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.12) 100%)",
              "linear-gradient(180deg, rgba(0,0,0,0.07) 0%, rgba(255,255,255,0.20) 36%, rgba(255,255,255,0.28) 52%, rgba(255,255,255,0.09) 70%, rgba(0,0,0,0.10) 100%)",
              "linear-gradient(160deg, #e4e7eb 0%, #c9cfd6 20%, #dde1e6 45%, #bec6cf 65%, #d7dce2 80%, #e2e6ea 100%)",
            ].join(", "),
            borderColor: "rgba(153,164,177,0.96)",
            boxShadow: "0 12px 22px rgba(15,23,42,0.20), 0 3px 7px rgba(15,23,42,0.12), inset 0 1.5px 0 rgba(255,255,255,0.92), inset 0 -1.5px 0 rgba(71,85,105,0.28)",
          }}
        >
          <div
            role="option"
            aria-selected={selectionRepresentsAll}
            className={`flex min-h-12 w-full snap-start items-center gap-2 border-b border-slate-500/25 px-3.5 py-2 text-[15px] font-bold shadow-[inset_0_-1px_0_rgba(255,255,255,0.58)] ${selectionRepresentsAll ? "bg-white/68 text-[#1a56db]" : "bg-white/30 text-slate-700"}`}
          >
            <button
              type="button"
              onClick={() => onChange([])}
              className="flex min-h-8 min-w-0 flex-1 items-center gap-3 text-left active:opacity-70"
            >
              {renderCheck(selectionRepresentsAll)}
              <span>全部</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setConstrainedMenuWidth(null);
                setConstrainedMenuRightOffset(null);
              }}
              aria-label={`确认${label}筛选`}
              className="h-8 shrink-0 rounded border border-slate-400/70 bg-white/78 px-3 text-[12px] font-bold text-[#1a56db] shadow-[inset_0_1px_0_rgba(255,255,255,0.96),inset_0_-1px_0_rgba(71,85,105,0.24),0_1px_1px_rgba(15,23,42,0.12)] transition active:scale-95 active:bg-white"
            >
              确定
            </button>
          </div>
          {options.map((option) => {
            const checked = selectedSet.has(option.id);
            const isReferralChild = option.kind === "referral-descendants" || option.kind === "referral-member";
            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={checked}
                onClick={() => toggleOption(option.id)}
                className={`flex min-h-12 w-full snap-start items-center gap-3 border-b border-slate-500/20 py-3 text-left text-[15px] font-bold shadow-[inset_0_-1px_0_rgba(255,255,255,0.5)] last:border-b-0 last:shadow-none ${isReferralChild ? "pl-8 pr-3.5" : "px-3.5"} ${checked ? "bg-white/55 text-[#1a56db]" : option.kind === "referral-descendants" ? "text-indigo-700 active:bg-indigo-50/60" : "text-slate-700 active:bg-white/55"}`}
              >
                {renderCheck(checked)}
                <span className="min-w-0 flex-1 truncate" title={option.label}>{option.label}</span>
              </button>
            );
          })}
          {additionalToggle && <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={additionalToggle.checked}
            onClick={() => additionalToggle.onCheckedChange(!additionalToggle.checked)}
            className={`flex min-h-12 w-full snap-start items-center gap-3 border-t border-slate-500/30 px-3.5 py-3 text-left text-[15px] font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.58)] ${additionalToggle.checked ? "bg-white/55 text-[#1a56db]" : "text-slate-700 active:bg-white/55"}`}
          >
            {renderCheck(additionalToggle.checked)}
            <span className="min-w-0 flex-1 truncate">{additionalToggle.label}</span>
          </button>}
        </div>
      )}
    </div>
  );
}

function AccountOverview({
  summary,
  positionStats,
  showCumulativeData,
  onToggleCumulativeData,
  showCommission = true,
  isMemberView = false,
  onExplainGrossProfit,
}: {
  summary: {
    long: { quantity: number; average: number; unrealized: number | null; realizedGross: number; realizedOpeningFee: number; realizedClosingFee: number; realized: number; turnover: number; commission: number; closedQuantity: number; closedAverageCost: number; closedAveragePrice: number; activeLevels: number };
    short: { quantity: number; average: number; unrealized: number | null; realizedGross: number; realizedOpeningFee: number; realizedClosingFee: number; realized: number; turnover: number; commission: number; closedQuantity: number; closedAverageCost: number; closedAveragePrice: number; activeLevels: number };
  };
  /** 顶行仓位严格按状态筛选范围统计；下方财务数据仍仅来自实际成交单。 */
  positionStats?: Record<PositionSide, { quantity: number; activeLevels: number }>;
  showCumulativeData: boolean;
  onToggleCumulativeData: () => void;
  showCommission?: boolean;
  isMemberView?: boolean;
  onExplainGrossProfit: (side: PositionSide, data: { realizedGross: number; realizedOpeningFee: number; realizedClosingFee: number; realized: number }) => void;
}) {
  const pnlColor = (value: number | null) => value === null ? "text-slate-400" : value >= 0 ? "text-rose-600" : "text-emerald-600";
  const sides: Array<{ side: PositionSide; data: typeof summary.long }> = [
    { side: "long", data: summary.long },
    { side: "short", data: summary.short },
  ];

  if (isMemberView) return null;

  return (
    <div className="border-t border-slate-100 bg-slate-50 p-2">
      <div className="overflow-hidden rounded border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.035)]">
        <div className="grid grid-cols-2">
          {sides.map(({ side, data }) => {
            const isLong = side === "long";
            const positionData = positionStats?.[side] ?? data;
            return (
              <div
                key={side}
                className={`min-w-0 px-3 py-2.5 text-left ${isLong ? "border-r border-slate-100" : ""}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="flex min-w-0 items-baseline gap-1.5">
                    <span className={`shrink-0 text-xs font-semibold ${isLong ? "text-rose-600" : "text-emerald-600"}`}>{isLong ? "多" : "空"}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-slate-400">{positionData.activeLevels}档</span>
                  </div>
                  <div className="flex shrink-0 items-baseline gap-1">
                    <span className="text-sm tabular-nums font-semibold text-slate-900">{formatQuantity(positionData.quantity)}</span>
                    <span className="text-[11px] text-slate-500">ETH</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {!isMemberView && showCumulativeData && (
          <div className="grid grid-cols-2 border-t border-slate-100 text-[11px] tabular-nums">
            {sides.map(({ side, data }) => {
              const isLong = side === "long";
              const profitTone = data.realized >= 0 ? "text-rose-600 border-rose-500" : "text-emerald-600 border-emerald-500";
              return (
                <section key={side} className={`min-w-0 ${isLong ? "border-r border-slate-100" : ""}`}>
                  <div className="space-y-0">
                    <div className="flex h-9 items-center justify-between gap-1 border-t border-slate-100 px-3">
                      <span className="whitespace-nowrap text-slate-500">累计净收益</span>
                      <button
                        type="button"
                        onClick={() => onExplainGrossProfit(side, data)}
                        className={`whitespace-nowrap border-b border-dotted pb-0.5 text-[11px] font-semibold outline-none ${profitTone}`}
                        aria-label={`查看${isLong ? "多仓" : "空仓"}累计净收益说明`}
                      >
                        {formatSigned(data.realized)} U
                      </button>
                    </div>
                    <div className="flex h-9 items-center justify-between gap-1 border-t border-slate-100 px-3">
                      <span className="whitespace-nowrap text-slate-500">持仓均价</span>
                      <span className="whitespace-nowrap text-[11px] font-semibold text-slate-700">{data.quantity > 0 ? formatPrice(data.average) : formatAmount(0)} U</span>
                    </div>
                    <div className="flex h-9 items-center justify-between gap-1 border-t border-slate-100 px-3">
                      <span className="whitespace-nowrap text-slate-500">累计平仓</span>
                      <span className="whitespace-nowrap text-[11px] font-semibold text-slate-700">{formatQuantity(data.closedQuantity)} ETH</span>
                    </div>
                    <div className="flex h-9 items-center justify-between gap-1 border-t border-slate-100 px-3">
                      <span className="whitespace-nowrap text-slate-500">原始平均成本</span>
                      <span className="whitespace-nowrap text-[11px] font-semibold text-slate-700">{data.closedQuantity > 0 ? formatPrice(data.closedAverageCost) : formatAmount(0)} U</span>
                    </div>
                    <div className="flex h-9 items-center justify-between gap-1 border-t border-slate-100 px-3">
                      <span className="whitespace-nowrap text-slate-500">平均平仓价</span>
                      <span className="whitespace-nowrap text-[11px] font-semibold text-slate-700">{data.closedQuantity > 0 ? formatPrice(data.closedAveragePrice) : formatAmount(0)} U</span>
                    </div>
                    <div className="flex h-9 items-center justify-between gap-1 border-t border-slate-100 px-3">
                      <span className="whitespace-nowrap text-slate-500">累计交易额</span>
                      <span className="whitespace-nowrap text-[11px] font-semibold text-slate-700">{formatAmount(data.turnover)} U</span>
                    </div>
                    {showCommission && <div className="flex h-9 items-center justify-between gap-1 border-t border-slate-100 px-3">
                      <span className="whitespace-nowrap text-slate-500">累计佣金</span>
                      <span className="whitespace-nowrap text-[11px] font-semibold text-slate-700">{formatAmount(data.commission)} U</span>
                    </div>}
                  </div>
                </section>
              );
            })}
          </div>
        )}
        {!isMemberView && <button
          type="button"
          onClick={onToggleCumulativeData}
          aria-label={showCumulativeData ? "收起持仓与累计数据" : "展开持仓与累计数据"}
          aria-expanded={showCumulativeData}
          className="flex w-full items-center justify-between border-t border-slate-100 bg-slate-50 px-3 py-2 text-left text-slate-600 transition-colors active:bg-slate-100"
        >
          <span className="text-[11px] font-medium">{showCumulativeData ? "收起" : "详情"}</span>
          <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${showCumulativeData ? "-rotate-90" : "rotate-90"}`} />
        </button>}
      </div>
    </div>
  );
}

/**
 * 期权在仓位详情中也必须显示与报价格相同的实时收益。
 * 成员端仅将收益按分配比例折算，订单数量仍展示完整的原始数量。
 */
function OptionUnrealizedPnlText({
  trade,
  remainingQuantity,
  ethMarkPrice,
  emptyLabel = "--",
  className = "",
}: {
  trade: PreviewTrade;
  remainingQuantity: number;
  ethMarkPrice: number | null;
  emptyLabel?: string;
  className?: string;
}) {
  const optionGreeks = useOptionGreeks({
    currency: "ETH",
    exerciseDate: trade.optionExpiryDate ?? "",
    strikePrice: Number(trade.price) || 0,
    direction: trade.optionDirection ?? "long_call",
    enabled: trade.instrumentType === "option" && !trade.isPending && Boolean(trade.optionExpiryDate) && Number(trade.price) > 0,
  });
  const optionPnl = calculateOptionUnrealizedPnl({
    quantity: getTradeFinancialQuantity(trade, remainingQuantity),
    optionMarkPrice: resolveUsableOptionMarkPrice(optionGreeks.data?.markPrice, trade.optionMarkPrice),
    premium: trade.optionPremium,
    premiumCurrency: trade.optionPremiumCurrency,
    ethMarkPrice,
    direction: trade.optionDirection,
  })?.pnl ?? null;
  const tone = optionPnl === null
    ? "text-slate-400"
    : optionPnl >= 0
      ? "text-rose-600"
      : "text-emerald-600";
  return <span className={`${className} ${tone}`}>{optionPnl === null ? emptyLabel : `${formatSigned(optionPnl)} U`}</span>;
}

function useReliableDoubleTap(onActivate: () => void) {
  // 统一用于所有 T 型报价格：单击仅停留，双击才进入订单详情或新开仓表单。
  // pointer 事件比移动 Safari 的 click/dblclick 更早、更稳定，也能明确排除滚动与长按。
  const pointerStartRef = useRef<{ pointerId: number; x: number; y: number; startedAt: number } | null>(null);
  const previousTapAtRef = useRef(0);
  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointerStartRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startedAt: Date.now(),
    };
  };
  const resetDoubleTap = () => {
    pointerStartRef.current = null;
    previousTapAtRef.current = 0;
  };
  const handlePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const pointerStart = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!pointerStart || pointerStart.pointerId !== event.pointerId) return;
    const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
    const heldMs = Date.now() - pointerStart.startedAt;
    // 移动即滚动；长按不承担点击语义，以便之后可安全扩展为拖拽。
    if (moved > 16 || heldMs > 700) {
      previousTapAtRef.current = 0;
      return;
    }
    const now = Date.now();
    if (previousTapAtRef.current > 0 && now - previousTapAtRef.current <= 1200) {
      previousTapAtRef.current = 0;
      onActivate();
      return;
    }
    previousTapAtRef.current = now;
  };
  const suppressSingleClick = (event: ReactMouseEvent<HTMLButtonElement>) => event.preventDefault();
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onActivate();
    }
  };
  return {
    onClick: suppressSingleClick,
    onPointerDown: handlePointerDown,
    onPointerUp: handlePointerUp,
    onPointerCancel: resetDoubleTap,
    onKeyDown: handleKeyDown,
  };
}

function PositionCell({ bucket, side, markPrice, onClick, readOnly = false, metadata, isLocked = false, hasLockedPosition = false, isCounterparty = false, isPending = false, keepReopenReminder = false, hasProfitSharing = false, takeProfitEnabled = false, takeProfitQuantity }: {
  bucket: PositionBucket;
  side: PositionSide;
  markPrice: number | null;
  onClick: () => void;
  readOnly?: boolean;
  metadata?: LadderCellMetadata;
  /** 仅管理员逐笔报价使用的黑金锁定外观。 */
  isLocked?: boolean;
  /** 整合报价档位中含有锁定仓位时展示黑金锁标；仅全部锁定时整格切换黑金底。 */
  hasLockedPosition?: boolean;
  /** 管理端反向展示订单，使用紫色双向图标与普通多空区分。 */
  isCounterparty?: boolean;
  /** 仅管理员逐笔报价使用：挂单未成交，采用浅蓝状态底并不展示盈亏。 */
  isPending?: boolean;
  /** 每次平仓后仍保留待补开提醒的订单，在右下角类型标识旁显示眼睛。 */
  keepReopenReminder?: boolean;
  /** 本单开仓时已固化对外收益分配，在右下角类型标识旁显示牵手标记。 */
  hasProfitSharing?: boolean;
  /** 已设止盈在挂单成交后继续保留；部分止盈同时显示计划数量。 */
  takeProfitEnabled?: boolean;
  takeProfitQuantity?: number;
}) {
  const doubleTapProps = useReliableDoubleTap(onClick);
  const isLong = side === "long";
  /** 右侧空单列按中轴与左侧多单列镜像：数量靠右、盈亏靠左，归属字段与图标也反向。 */
  const isShort = side === "short";
  const isOption = bucket.instrumentType === "option";
  const isGrid = bucket.instrumentType === "grid";
  // 有订单元数据即逐笔报价；整合报价只用灰字摘要表达挂/锁，始终保留基础多红空绿底色。
  const isIndividualQuote = Boolean(metadata);
  const pendingQuantity = Math.min(bucket.remainingQuantity, Math.max(0, bucket.pendingQuantity ?? 0));
  const hasPendingQuantity = pendingQuantity > 0.0000001;
  const isPendingOnly = isPending || (hasPendingQuantity && pendingQuantity >= bucket.remainingQuantity - 0.0000001);
  const hasMixedPending = hasPendingQuantity && !isPendingOnly;
  const lockedQuantity = Math.min(
    bucket.remainingQuantity,
    Math.max(0, bucket.lockedRemainingQuantity ?? (isLocked ? bucket.remainingQuantity : 0)),
  );
  const hasLockedQuantity = lockedQuantity > 0.0000001;
  const takeProfitMarkerLabel = getTakeProfitMarkerLabel(takeProfitEnabled, takeProfitQuantity, bucket.remainingQuantity);
  // T 型报价中，全数止盈仅保留目标图标；部分止盈才紧跟计划数量，避免与“合/期”类型字抢占空间。
  const takeProfitMarkerQuantity = takeProfitMarkerLabel?.replace(/^止盈/, "") || null;
  // 整合报价用第二行摘要呈现挂单/锁定数量，避免与第一行的数量和盈亏金额抢占横向空间。
  const integratedStatusSummary = !isIndividualQuote
    ? [
      hasPendingQuantity ? `挂 ${formatIntegratedStatusQuantity(pendingQuantity)}` : null,
      hasLockedQuantity ? `锁 ${formatIntegratedStatusQuantity(lockedQuantity)}` : null,
    ].filter((item): item is string => Boolean(item)).join(" · ")
    : "";
  const usePendingStatusSkin = isIndividualQuote && isPendingOnly;
  const useLockedStatusSkin = isIndividualQuote && isLocked;
  const optionMetadata = metadata?.option;
  const optionGreeks = useOptionGreeks({
    currency: "ETH",
    exerciseDate: optionMetadata?.expiryDate ?? "",
    strikePrice: Number(optionMetadata?.strikePrice) || 0,
    direction: optionMetadata?.direction ?? "long_call",
    enabled: isOption && !isPendingOnly && Boolean(optionMetadata?.expiryDate) && Number(optionMetadata?.strikePrice) > 0,
  });
  const optionPnlResult = isOption && !isPendingOnly
    ? calculateOptionUnrealizedPnl({
      // 成员收益投影视图保留原始 ETH 数量展示，但收益必须按其分配比例折算。
      quantity: bucket.financialQuantity,
      optionMarkPrice: resolveUsableOptionMarkPrice(optionGreeks.data?.markPrice, optionMetadata?.cachedMarkPrice),
      premium: optionMetadata?.premium,
      premiumCurrency: optionMetadata?.premiumCurrency,
      ethMarkPrice: markPrice,
      direction: optionMetadata?.direction,
    })
    : null;
  const tone = usePendingStatusSkin
    ? `text-slate-700${readOnly ? "" : " hover:brightness-[0.98]"}`
    : useLockedStatusSkin
    ? `text-[#f5d78e]${readOnly ? "" : " hover:brightness-110"}`
    : isOption
    ? `text-[#f5e9ff]${readOnly ? "" : " hover:brightness-110"}`
    : isGrid
    ? `text-cyan-950${readOnly ? "" : " hover:brightness-105"}`
    : isLong
    ? `text-rose-600${readOnly ? "" : " hover:brightness-105"}`
    : `text-emerald-800${readOnly ? "" : " hover:brightness-105"}`;
  const sideSurfaceStyle = isLong
    ? {
      background: "linear-gradient(90deg, rgba(255,255,255,0.56), rgba(255,228,230,0.70) 58%, rgba(254,205,211,0.54))",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.88), inset 0 -1px 0 rgba(159,18,57,0.11)",
    }
    : {
      background: "linear-gradient(90deg, rgba(209,250,229,0.54), rgba(236,253,245,0.70) 42%, rgba(255,255,255,0.56))",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.88), inset 0 -1px 0 rgba(6,95,70,0.11)",
    };
  const lockedSurfaceStyle = {
    background: [
      "linear-gradient(115deg, rgba(245,215,142,0.18) 0%, rgba(245,215,142,0.04) 23%, transparent 46%, rgba(201,168,76,0.12) 100%)",
      "repeating-linear-gradient(170deg, rgba(255,255,255,0.045) 0px, rgba(255,255,255,0.045) 1px, transparent 1px, transparent 4px)",
      "linear-gradient(135deg, #090909 0%, #19150e 48%, #11100d 100%)",
    ].join(", "),
    boxShadow: "inset 0 1px 0 rgba(245,215,142,0.24), inset 0 -1px 0 rgba(0,0,0,0.82), inset 1px 0 0 rgba(201,168,76,0.22), inset -1px 0 0 rgba(201,168,76,0.16)",
  };
  const pendingSurfaceStyle = {
    background: "linear-gradient(90deg, rgba(239,246,255,0.96), rgba(219,234,254,0.78) 58%, rgba(224,242,254,0.64))",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.92), inset 0 -1px 0 rgba(2,132,199,0.14), inset 1px 0 0 rgba(56,189,248,0.10)",
  };
  const gridSurfaceStyle = {
    background: "linear-gradient(112deg, rgba(236,254,255,0.96), rgba(207,250,254,0.78) 52%, rgba(165,243,252,0.60))",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.94), inset 0 -1px 0 rgba(8,145,178,0.18), inset 1px 0 0 rgba(34,211,238,0.16)",
  };
  const surfaceStyle = usePendingStatusSkin
    ? pendingSurfaceStyle
    : useLockedStatusSkin
    ? lockedSurfaceStyle
    : isOption
    ? T0_OPTION_METAL_SURFACE_STYLE
    : isGrid
    ? gridSurfaceStyle
    : sideSurfaceStyle;
  const quantityTextStyle = usePendingStatusSkin
    ? { textShadow: "-0.55px -0.55px 0 rgba(255,255,255,0.92), 0.75px 0.75px 0 rgba(2,132,199,0.18)" }
    : useLockedStatusSkin
    ? {
      background: "linear-gradient(180deg, #fff1bd 0%, #f5d78e 38%, #c9a84c 72%, #f5d78e 100%)",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      backgroundClip: "text",
      filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.92))",
    }
    : isOption
    ? { textShadow: "0 1px 1.5px rgba(46,16,101,0.88), 0 -0.5px 1px rgba(255,255,255,0.30)" }
    : isGrid
    ? { textShadow: "-0.55px -0.55px 0 rgba(255,255,255,0.94), 0.75px 0.75px 0 rgba(8,145,178,0.22)" }
    : { textShadow: "-0.55px -0.55px 0 rgba(255,255,255,0.88), 0.75px 0.75px 0 rgba(71,85,105,0.20)" };
  const floatingPnl = isPendingOnly
    ? null
    : isOption
    ? optionPnlResult?.pnl ?? null
    : calculateEstimatedUnrealizedNetPnl(side, markPrice, bucket.financialQuantity, bucket.financialCostBasis);
  // 期权收益率以开仓权利金总成本为基数，普通仓位继续使用剩余成交成本；两者均不计资金费。
  const floatingReturnBase = isOption ? optionPnlResult?.premiumTotal ?? null : bucket.financialCostBasis;
  const floatingReturnRate = floatingPnl === null || floatingReturnBase === null || floatingReturnBase <= 0
    ? null
    : floatingPnl / floatingReturnBase;
  const pnlTone = floatingPnl !== null && floatingPnl >= 0
    ? (isOption ? "text-rose-200" : "text-rose-600")
    : (isOption ? "text-emerald-200" : "text-emerald-600");
  // 全局盈亏颜色口径：盈利红、亏损绿。紫色金属底采用高饱和亮红/亮绿，避免浅粉在手机屏上显成金色。
  const optionPnlColor = floatingPnl !== null && floatingPnl >= 0 ? "#ff4d4f" : "#4ade80";
  // 精确沿用黑金锁定格金额的细白高光与单侧灰影；不再使用厚重的四向描边。
  const pnlTextStyle = { textShadow: "-0.35px -0.35px 0 rgba(255,255,255,0.84), 0.55px 0.55px 0 rgba(71,85,105,0.18)" };
  const content = (
    <div className="w-full min-w-0">
      {/* 固定报价卡上半区高度：即使某一侧没有浮动盈亏，下面的账户/用户/项目也与对侧同价位严格齐平。 */}
      <div className={`flex w-full min-w-0 justify-between gap-2 tabular-nums ${metadata ? "min-h-[30px] items-center" : "items-start"} ${isShort ? "flex-row-reverse" : ""}`}>
        <div className={metadata
          // 数量容器占满盈亏双行带，并在其中垂直居中；左右两侧的数量基线始终一致。
          ? `flex min-h-[30px] min-w-0 self-stretch items-center gap-1.5 ${isShort ? "flex-row-reverse justify-start text-right" : ""}`
          : `flex min-h-[30px] min-w-0 flex-col justify-between ${isShort ? "items-end text-right" : "items-start"}`
        }>
          <span className={`shrink-0 font-bold leading-none tracking-tight ${metadata ? "text-xl" : "text-lg"} ${usePendingStatusSkin ? "text-sky-700" : ""}`} style={quantityTextStyle}>{formatLadderQuantity(bucket.remainingQuantity)}</span>
          {!metadata && integratedStatusSummary && <span className="shrink-0 whitespace-nowrap text-[9px] font-medium leading-none text-slate-400" title={`本档${integratedStatusSummary}`} aria-label={`本档${integratedStatusSummary}`}>{integratedStatusSummary}</span>}
          {hasMixedPending && metadata && <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-semibold leading-none text-sky-700" title={`含挂单 ${formatLadderQuantity(pendingQuantity)} ETH`} aria-label={`含挂单 ${formatLadderQuantity(pendingQuantity)} ETH`}><Clock3 className="h-3 w-3" strokeWidth={2.35} /><span>挂{formatLadderQuantity(pendingQuantity)}</span></span>}
        </div>
        {floatingPnl !== null && (
          <span className={`flex h-[30px] shrink-0 flex-col justify-center gap-[2px] ${isShort ? "items-start text-left" : "items-end text-right"} ${pnlTone}`} style={isOption ? { color: optionPnlColor, textShadow: "none" } : undefined}>
            <span className={`whitespace-nowrap font-semibold leading-none ${metadata ? "text-[10px]" : "text-[11px]"}`} style={pnlTextStyle}>{formatSigned(floatingPnl)}</span>
            {floatingReturnRate !== null && (
              <span className={`${metadata ? "text-[9px]" : "text-[10px]"} font-medium leading-none opacity-85`}>{formatSignedPercent(floatingReturnRate)}</span>
            )}
          </span>
        )}
      </div>
      {metadata && <div className={`mt-1 flex min-w-0 items-center text-[9px] font-medium leading-none ${isShort ? "flex-row-reverse text-right" : "text-left"} ${isLocked && !isPendingOnly ? "text-[#c9a84c]/85" : isOption ? "text-violet-100/90" : isGrid ? "text-cyan-800/90" : "text-slate-500"}`} aria-label={`${metadata.accountName ? `账户 ${metadata.accountName}，` : ""}用户 ${metadata.relatedUserName}，项目 ${metadata.relatedFundName}${metadata.instrumentShortLabel ? `，类型 ${metadata.instrumentShortLabel}` : ""}${isPendingOnly ? "，挂单待成交" : ""}`}>
        <div className={`flex min-w-0 flex-1 items-center overflow-hidden ${isShort ? "flex-row-reverse justify-start" : ""}`}>
          {metadata.accountName && <>
            <span className="min-w-0 shrink truncate" title={`账户：${metadata.accountName}`}>{metadata.accountName}</span>
            <span className="shrink-0">·</span>
          </>}
          <span className="min-w-0 shrink truncate" title={`用户：${metadata.relatedUserName}`}>{metadata.relatedUserName}</span>
          <span className="shrink-0">·</span>
          <span className="min-w-0 shrink truncate" title={`项目：${metadata.relatedFundName}`}>{metadata.relatedFundName}</span>
        </div>
        {(isLocked || isCounterparty || isPendingOnly || keepReopenReminder || hasProfitSharing || takeProfitMarkerLabel || metadata.instrumentShortLabel) && <div className={`${isShort ? "mr-1" : "ml-1"} flex shrink-0 items-center gap-0.5`}>
          {isLocked && <Lock className="h-2 w-2 shrink-0 -translate-y-px text-[#f5d78e]/85" strokeWidth={2.5} aria-label="已锁定" />}
          {isCounterparty && <Repeat2 className="h-2.5 w-2.5 shrink-0 -translate-y-px text-violet-700" strokeWidth={2.7} aria-label="管理员反向展示" />}
          {isPendingOnly && <Clock3 className="h-[9px] w-[9px] shrink-0 -translate-y-px text-sky-600" strokeWidth={2.5} aria-label="挂单待成交" />}
          {keepReopenReminder && <Eye className={`h-[9px] w-[9px] shrink-0 -translate-y-px ${isLocked && !isPendingOnly ? "text-sky-200" : "text-sky-600"}`} strokeWidth={2.6} title="持续提醒：每次平仓的数量都会以原价位待补开占位保留" aria-label="持续提醒订单" />}
          {hasProfitSharing && <Handshake className={`h-[9px] w-[9px] shrink-0 -translate-y-px ${isLocked && !isPendingOnly ? "text-[#f5d78e]/85" : "text-[#d32f2f]"}`} strokeWidth={2.65} title="本单已设置收益分配" aria-label="收益共享订单" />}
          {takeProfitMarkerLabel && <span className={`inline-flex shrink-0 items-center gap-px font-semibold ${isLocked && !isPendingOnly ? "text-[#f5d78e]/85" : "text-amber-600"}`} title={takeProfitMarkerLabel} aria-label={takeProfitMarkerLabel}><Target className="h-[9px] w-[9px] -translate-y-px" strokeWidth={2.5} />{takeProfitMarkerQuantity && <span>{takeProfitMarkerQuantity}</span>}</span>}
          {metadata.instrumentShortLabel && <span className={isLocked && !isPendingOnly ? "text-[#f5d78e]/85" : isOption ? "text-violet-100" : isGrid ? "text-cyan-800" : "text-slate-500"} title={metadata.instrumentShortLabel}>{metadata.instrumentShortLabel}</span>}
        </div>}
      </div>}
    </div>
  );
  const minHeightClass = metadata ? "min-h-[58px]" : "min-h-[52px]";
  if (readOnly) {
    return <div className={`flex ${minHeightClass} w-full min-w-0 items-center px-1.5 py-1.5 ${tone}`} style={surfaceStyle}>{content}</div>;
  }
  return (
    <button
      type="button"
      {...doubleTapProps}
      aria-label="双击查看该价格档订单详情"
      title="双击查看详情"
      className={`flex ${minHeightClass} w-full min-w-0 items-center px-1.5 py-1.5 text-left transition-[filter] active:brightness-95 ${tone}`}
      style={{ ...surfaceStyle, touchAction: "manipulation" }}
    >
      {content}
    </button>
  );
}

function ReminderPlaceholderCell({
  reminder,
  side,
  readOnly = false,
  onActivate,
}: {
  reminder: T0ReopenReminder;
  side: PositionSide;
  readOnly?: boolean;
  onActivate: () => void;
}) {
  const content = (
    <div className="min-w-0">
      <div className="text-xs font-bold text-sky-700">持续提醒</div>
      <div className="mt-0.5 truncate text-[10px] font-medium text-slate-600">
        {reminder.relatedUserName || "未关联用户"} · {formatQuantity(reminder.defaultQuantity)} E
      </div>
      <div className="mt-0.5 text-[9px] text-slate-500">待补位 · 点击录入</div>
    </div>
  );
  const sideClass = side === "long" ? "border-l-4 border-l-sky-500" : "border-r-4 border-r-sky-500";
  // 服务端不会把占位返回给客户端；此处再做一层防护，避免任何边界状态下向用户露出管理提醒。
  if (readOnly) {
    return null;
  }
  return (
    <button
      type="button"
      // 待补开位只打开预填的开仓表单，不会直接创建订单或写入账本，因此移动端单击直达。
      onClick={onActivate}
      title="点击录入新的开仓订单；保存后本提醒自动转为正常订单"
      aria-label="点击录入持续提醒订单"
      className={`min-h-[52px] w-full border border-dashed border-sky-400 bg-sky-50/70 px-2 py-1.5 text-left transition active:brightness-95 ${sideClass}`}
      style={{ touchAction: "manipulation" }}
    >
      {content}
    </button>
  );
}

function LadderCell({
  bucket,
  side,
  markPrice,
  onClose,
  onOpen,
  readOnly = false,
  metadata,
  isLocked = false,
  hasLockedPosition = false,
  isCounterparty = false,
  isPending = false,
  keepReopenReminder = false,
  hasProfitSharing = false,
  takeProfitEnabled = false,
  takeProfitQuantity,
}: {
  bucket?: PositionBucket;
  side: PositionSide;
  markPrice: number | null;
  onClose: () => void;
  onOpen: () => void;
  readOnly?: boolean;
  metadata?: LadderCellMetadata;
  isLocked?: boolean;
  hasLockedPosition?: boolean;
  isCounterparty?: boolean;
  isPending?: boolean;
  keepReopenReminder?: boolean;
  hasProfitSharing?: boolean;
  takeProfitEnabled?: boolean;
  takeProfitQuantity?: number;
}) {
  // 空白报价格与已有订单格共用同一套双击手势：区别只在双击后的页面内容。
  const openDoubleTapProps = useReliableDoubleTap(onOpen);
  if (bucket && bucket.remainingQuantity > 0.0000001) {
    // 已有订单卡必须双击才进入详情；单击只保留，不会打开、创建、平仓或删除任何订单。
    // 双击识别由 PositionCell 在触摸抬起时处理，以避开 Safari click 手势延迟。
    return <PositionCell bucket={bucket} side={side} markPrice={markPrice} onClick={onClose} readOnly={readOnly} metadata={metadata} isLocked={isLocked} hasLockedPosition={hasLockedPosition} isCounterparty={isCounterparty} isPending={isPending} keepReopenReminder={keepReopenReminder} hasProfitSharing={hasProfitSharing} takeProfitEnabled={takeProfitEnabled} takeProfitQuantity={takeProfitQuantity} />;
  }

  const isLong = side === "long";
  if (readOnly) {
    return <div className="min-h-[52px] w-full" />;
  }
  return (
    <button
      type="button"
      {...openDoubleTapProps}
      aria-label={isLong ? "双击在该价格档位开多" : "双击在该价格档位开空"}
      title={isLong ? "双击开多" : "双击开空"}
      className="min-h-[52px] w-full transition-colors hover:bg-white/25 active:brightness-95"
      style={{ touchAction: "manipulation" }}
    />
  );
}

/** 独立路由继续使用无参数组件，避免影响 wouter 的路由组件签名。 */
export default function T0Journal() {
  return <T0JournalView />;
}
