import { useState, useMemo, useEffect, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, ChevronDown, Plus, Pencil, Trash2, TrendingUp, ChevronLeft as CalLeft, ChevronRight as CalRight } from "lucide-react";
import { toast } from "sonner";
import { PageTag } from "@/components/PageTag";

const COIN_OPTIONS = ['BTC', 'ETH', 'SOL', 'AAVE', 'SUI', 'ONDO', 'ASTER', 'LDO', 'ENA', 'ARKM', 'USDT', 'CNY', 'TSLA', 'NVDA', 'AAPL', 'MSFT', 'GOOGL', 'META', 'AMZN', 'SPY', 'QQQ', 'NFLX', 'ORCL', 'TSM', 'AMD', 'CL', 'NG'] as const;
type CoinType = typeof COIN_OPTIONS[number];

// 整数型币种（单价较低，通常以整数计量）
const INTEGER_COINS = new Set(['SUI', 'ONDO', 'LDO', 'ENA', 'ARKM', 'AAVE']);

// 根据币种格式化数量：整数型去掉小数，BTC/ETH/SOL 保留最多6位有效小数
function formatCoinQty(qty: string | number | null | undefined, coin: string): string {
  if (qty === null || qty === undefined || qty === '') return '0';
  const num = typeof qty === 'string' ? parseFloat(qty) : qty;
  if (num === 0) return '0';
  if (isNaN(num)) return String(qty);
  if (INTEGER_COINS.has(coin)) return Math.round(num).toLocaleString('en-US');
  // 去掉末尾多余的0，最多6位小数
  return parseFloat(num.toFixed(6)).toString();
}

// 担保价值实时显示小组件
function CollateralValueDisplay({ coin, qty, ledgerId }: { coin: string; qty: string; ledgerId: number }) {
  const { data: summary } = trpc.ledger.financeGetAssetSummary.useQuery(
    { ledgerId },
    { enabled: !!ledgerId && !!qty && parseFloat(qty) > 0, staleTime: 60000, refetchInterval: 60000 }
  );
  const livePrices: Record<string, number> = (summary as any)?.livePrices ?? {};
  const price = livePrices[coin];
  const qtyNum = parseFloat(qty);
  if (!qty || isNaN(qtyNum) || qtyNum <= 0) return null;
  return (
    <div className="px-4 py-3 border-t border-gray-100 bg-blue-50">
      <div className="flex items-center justify-between">
        <span className="text-xs text-blue-500">实时担保价值</span>
        {price ? (
          <span className="text-sm font-bold text-blue-700">
            ≈ ${(price * qtyNum).toLocaleString('en-US', { maximumFractionDigits: 0 })} USDT
          </span>
        ) : (
          <span className="text-xs text-gray-400">获取中...</span>
        )}
      </div>
      {price && (
        <div className="text-xs text-blue-400 mt-0.5">
          {coin} 单价 ${price.toLocaleString('en-US', { maximumFractionDigits: 2 })} × {qtyNum}
        </div>
      )}
    </div>
  );
}

function CollateralMarginRateDisplay({ assets, interestBase, ledgerId }: {
  assets: { coin: string; qty: string }[];
  interestBase: string | number;
  ledgerId: number;
}) {
  const { data: summary } = trpc.ledger.financeGetAssetSummary.useQuery(
    { ledgerId },
    { enabled: !!ledgerId && assets.length > 0, staleTime: 30000, refetchInterval: 30000 }
  );
  const livePrices: Record<string, number> = (summary as any)?.livePrices ?? {};

  const base = parseFloat(String(interestBase));
  if (!base || base <= 0 || assets.length === 0) return null;

  let totalCollateral = 0;
  let allPricesAvailable = true;
  for (const a of assets) {
    const p = livePrices[a.coin];
    const q = parseFloat(a.qty);
    if (!p || !q) { allPricesAvailable = false; break; }
    totalCollateral += p * q;
  }

  if (!allPricesAvailable) return null;

  const ratio = totalCollateral / base;
  const color = ratio >= 1 ? '#16A34A' : ratio >= 0.5 ? '#D97706' : '#DC2626';

  return (
    <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100">
      <span className="text-xs text-gray-500">保证金率</span>
      <span className="text-xs font-bold" style={{ color }}>
        {(ratio * 100).toFixed(1)}%
      </span>
    </div>
  );
}

// 精确到秒的利息计数器 Hook——已结清订单使用 settledAt 作为截止时间
function useAccruedInterest(interestBase: string | null, interestRateAnnual: string | null, interestStartDate: string | null, settledAt?: string | null) {
  const [accrued, setAccrued] = useState<number>(0);
  const computeAccrued = useCallback(() => {
    const base = parseFloat(interestBase || '0');
    const rate = Math.abs(parseFloat(interestRateAnnual || '0'));
    if (!base || !rate || !interestStartDate) return 0;
    const startTs = new Date(interestStartDate + 'T00:00:00').getTime();
    if (isNaN(startTs)) return 0;
    const endTs = settledAt ? new Date(settledAt).getTime() : Date.now();
    const elapsedSeconds = Math.max(0, (endTs - startTs) / 1000);
    const perSecond = (base * rate / 100) / (365 * 24 * 3600);
    return perSecond * elapsedSeconds;
  }, [interestBase, interestRateAnnual, interestStartDate, settledAt]);
  useEffect(() => {
    setAccrued(computeAccrued());
    // 已结清的订单不需要实时更新
    if (settledAt) return;
    const timer = setInterval(() => setAccrued(computeAccrued()), 1000);
    return () => clearInterval(timer);
  }, [computeAccrued, settledAt]);
  return accrued;
}

const STATUS_OPTIONS = [
  { value: 'active', label: '持有中' },
  { value: 'settled', label: '已结算' },
  { value: 'cancelled', label: '已取消' },
];

const COIN_COLORS: Record<CoinType, string> = {
  BTC: '#F7931A',
  ETH: '#627EEA',
  SOL: '#9945FF',
  AAVE: '#B6509E',
  SUI: '#4DA2FF',
  ONDO: '#1A1A2E',
  ASTER: '#E84142',
  LDO: '#00C896',
  ENA: '#1A1A1A',
  ARKM: '#FF6B35',
  USDT: '#26A17B',
  CNY: '#DE2910',
  TSLA: '#CC0000',
  NVDA: '#76B900',
  AAPL: '#555555',
  MSFT: '#00A4EF',
  GOOGL: '#4285F4',
  META: '#0866FF',
  AMZN: '#FF9900',
  SPY: '#1A56DB',
  QQQ: '#7C3AED',
  NFLX: '#E50914',
  ORCL: '#F80000',
  TSM: '#0070C0',
  AMD: '#ED1C24',
  CL: '#8B4513',
  NG: '#4A90D9',
};

// ===== FinanceOrderCard 子组件（左右两栏布局，与 LedgerDetail FunderOrderCard 一致）=====
interface FinanceOrderCardProps {
  order: any;
  livePrices: Record<string, number>;
  cnyRate: number;
  totalPaid: number;
  openedPaymentList: any[];
  currentUser: any;
  isAdmin: boolean;
  realMembers: any[];
  ledgerId: number;
  showPaymentPanel: number | null;
  setShowPaymentPanel: (v: number | null) => void;
  paymentForm: { amount: string; payDate: string; note: string };
  setPaymentForm: (fn: (f: any) => any) => void;
  showPaymentDatePicker: boolean;
  setShowPaymentDatePicker: (v: boolean | ((v: boolean) => boolean)) => void;
  handleAddPayment: (orderId: number) => void;
  deletePaymentMutation: any;
  addPaymentMutation: any;
  updateMutation: any;
  openEdit: (order: any) => void;
  setConfirmDeleteId: (id: number | null) => void;
  getPaymentLabel: (val: string) => string;
  // 参与方相关
  showParticipantsPanel: number | null;
  handleOpenParticipants: (orderId: number) => void;
  handleAddParticipant: (role: 'funder' | 'borrower' | 'broker') => void;
  handleSaveParticipants: (orderId: number) => void;
  handleRemoveSaved: (orderId: number, userId: number) => void;
  savedParticipants: { userId: number; displayName: string; role: 'funder' | 'borrower' | 'broker'; sortOrder: number }[];
  participantsList: { userId: number; displayName: string; role: 'funder' | 'borrower' | 'broker'; sortOrder: number }[];
  setParticipantsList: (fn: (list: any[]) => any[]) => void;
  ledgerMembers: { userId: number; displayName: string; memberRole: string }[];
  participantsLoading: boolean;
  saveParticipantsMutation: any;
  ROLE_OPTIONS: { value: 'funder' | 'borrower' | 'broker'; label: string; color: string }[];
  activeUserTab: number | 'all';
}

function FinanceOrderCard({
  order,
  livePrices,
  cnyRate,
  totalPaid,
  openedPaymentList,
  currentUser,
  isAdmin,
  realMembers,
  ledgerId,
  showPaymentPanel,
  setShowPaymentPanel,
  paymentForm,
  setPaymentForm,
  showPaymentDatePicker,
  setShowPaymentDatePicker,
  handleAddPayment,
  deletePaymentMutation,
  addPaymentMutation,
  updateMutation,
  openEdit,
  setConfirmDeleteId,
  getPaymentLabel,
  showParticipantsPanel,
  handleOpenParticipants,
  handleAddParticipant,
  handleSaveParticipants,
  handleRemoveSaved,
  savedParticipants,
  activeUserTab,
  participantsList,
  setParticipantsList,
  ledgerMembers,
  participantsLoading,
  saveParticipantsMutation,
  ROLE_OPTIONS,
}: FinanceOrderCardProps) {
  const [showStatusSheet, setShowStatusSheet] = useState(false);
  const [showCollateralInfo, setShowCollateralInfo] = useState(false);
  const [showMarginInfo, setShowMarginInfo] = useState(false);
  // 每张卡片独立调用 useAccruedInterest（Hook 必须在组件顶层）
  const accrued = useAccruedInterest(
    (order.status === 'active' || order.settled_at) ? order.interest_base : null,
    (order.status === 'active' || order.settled_at) ? order.interest_rate_annual : null,
    (order.status === 'active' || order.settled_at) ? order.interest_start_date : null,
    order.settled_at
  );

  const rateStr = String(order.interest_rate_annual || '');
  const isNegRate = rateStr.startsWith('-');
  const rateAbs = isNegRate ? parseFloat(rateStr.slice(1)).toFixed(0) : (rateStr ? parseFloat(rateStr).toFixed(0) : '');
  const rateSign = isNegRate ? '-' : '+';
  const isSettled = order.status === 'settled';
  const coinColor = COIN_COLORS[order.coin as CoinType] || '#6B7280';

  // 解析 display_config
  const orderDc: Record<string, boolean | number> = (() => {
    try {
      if (!order.display_config) return {};
      return typeof order.display_config === 'string' ? JSON.parse(order.display_config) : order.display_config;
    } catch(e) { return {}; }
  })();

  // 计算担保物数组
  let collateralAssets: { coin: string; qty: string }[] = [];
  try {
    const rawCA = order.collateral_assets;
    if (rawCA) {
      const parsed = typeof rawCA === 'string' ? JSON.parse(rawCA) : rawCA;
      if (Array.isArray(parsed)) collateralAssets = parsed;
    }
  } catch {}
  if (collateralAssets.length === 0 && order.collateral_coin && order.collateral_qty) {
    collateralAssets = [{ coin: order.collateral_coin, qty: String(parseFloat(order.collateral_qty)) }];
  }

  // 左栏数值计算
  const qty = parseFloat(order.buy_quantity || '0');
  const price = parseFloat(order.buy_price || '0');
  const totalU = qty > 0 && price > 0 ? qty * price : parseFloat(order.amount || '0');
  const isGreenOrder = !!(order._fromFunder || order._isParticipant);
  const baseCur = order.interest_base_currency || 'USDT';
  // 绿色订单使用 interest_rate_currency（与 FunderManagement 一致）
  const rateCur = isGreenOrder ? (order.interest_rate_currency || 'USDT') : baseCur;
  const interestUnit = rateCur === 'CNY' ? '元' : 'U';
  const altUnit = rateCur === 'CNY' ? 'U' : '元';
  // 折算逻辑：绿色订单支持跨货币折算
  const convertAccrued = (val: number): number => {
    if (baseCur === rateCur) return val;
    if (baseCur === 'USDT' && rateCur === 'CNY') return val * cnyRate;
    if (baseCur === 'CNY' && rateCur === 'USDT') return val / cnyRate;
    return val;
  };
  const convertAlt = (val: number): number => rateCur === 'CNY' ? val / cnyRate : val * cnyRate;
  const displayAccrued = convertAccrued(accrued);
  const displayPaid = convertAccrued(totalPaid);
  const altAccrued = convertAlt(displayAccrued);
  const altPaid = convertAlt(displayPaid);

  // 持有时长——已结清订单冻结在 settled_at 时刻
  const holdDurationLabel = (() => {
    if (!order.buy_date) return null;
    if (order.status !== 'active' && !order.settled_at) return null;
    const endTs = order.settled_at ? new Date(order.settled_at).getTime() : Date.now();
    const elapsed = endTs - new Date(order.buy_date + 'T00:00:00').getTime();
    if (elapsed < 0) return null;
    const totalHours = Math.floor(elapsed / (1000 * 60 * 60));
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    return days > 0 ? `${days}天 ${hours}小时` : `${hours}小时`;
  })();

  // 担保价值计算（使用 livePrices）
  let collateralValue = 0;
  let collateralValueKnown = true;
  const collateralItemValues: (number | null)[] = [];
  for (const item of collateralAssets) {
    const iq = parseFloat(item.qty);
    if (!item.coin || isNaN(iq)) { collateralItemValues.push(null); collateralValueKnown = false; continue; }
    if (item.coin === 'USDT') { collateralValue += iq; collateralItemValues.push(iq); }
    else if (item.coin === 'CNY') { const cv = iq / cnyRate; collateralValue += cv; collateralItemValues.push(cv); }
    else {
      const p = livePrices[item.coin];
      if (p) { collateralValue += iq * p; collateralItemValues.push(iq * p); }
      else { collateralItemValues.push(null); collateralValueKnown = false; }
    }
  }

  // 解析外借资金
  let lentOutAssets: { coin: string; qty: string }[] = [];
  try {
    const rawLA = order.lent_out_assets;
    if (rawLA) {
      const parsed = typeof rawLA === 'string' ? JSON.parse(rawLA) : rawLA;
      if (Array.isArray(parsed)) lentOutAssets = parsed;
    }
  } catch {}

  // 计算外借资金折算U值
  let lentOutValueU = 0;
  for (const la of lentOutAssets) {
    const lq = parseFloat(la.qty);
    if (!la.coin || isNaN(lq) || lq <= 0) continue;
    if (la.coin === 'USDT') { lentOutValueU += lq; }
    else if (la.coin === 'CNY') { lentOutValueU += lq / cnyRate; }
    else {
      const lp = livePrices[la.coin];
      if (lp) { lentOutValueU += lq * lp; }
    }
  }

  // 风险敞口计算（计息基数统一折算为U）
  const interestBaseRaw = order.interest_base ? Number(order.interest_base) : totalU;
  const interestBaseNum = baseCur === 'CNY' ? interestBaseRaw / cnyRate : interestBaseRaw;
  const liveP = livePrices[order.coin] ?? null;
  const currentValue = liveP !== null ? (order.coin === 'CNY' ? qty / cnyRate : liveP * qty) : null;
  // 浮动盈亏 = 当前持仓市值(U) - 计息基数(U)
  const floatPnl = currentValue !== null ? currentValue - interestBaseNum : null;
  // 将利息统一折算为U（accrued单位跟interest_base一致，totalPaid单位也interest_base一致）
  const accruedInU = baseCur === 'CNY' ? accrued / cnyRate : accrued;
  const totalPaidInU = baseCur === 'CNY' ? totalPaid / cnyRate : totalPaid;
  const exposure = floatPnl !== null
    ? collateralValue + floatPnl - accruedInU + totalPaidInU - lentOutValueU
    : collateralValue - accruedInU + totalPaidInU - lentOutValueU;
  const isSufficient = exposure >= 0;

  return (
    <div
      className="bg-white rounded-2xl overflow-hidden relative"
      style={(order._fromFunder || order._isParticipant)
        ? { border: '1px solid #86EFAC', boxShadow: '0 1px 6px rgba(34,197,94,0.08)' }
        : { border: '1px solid #E8EDFF', boxShadow: '0 1px 4px rgba(26,35,64,0.05)' }}
    >
      {isSettled && (
        <div className="absolute inset-0 pointer-events-none select-none flex items-center justify-center" style={{ backgroundColor: 'rgba(220,38,38,0.06)', zIndex: 10 }}>
          <div style={{ border: '3px solid rgba(220,38,38,0.35)', color: 'rgba(220,38,38,0.35)', borderRadius: '8px', padding: '8px 24px', fontSize: '28px', fontWeight: 800, letterSpacing: '6px', lineHeight: '1.4', whiteSpace: 'nowrap', transform: 'rotate(-15deg)' }}>
            已结清
          </div>
        </div>
      )}

      {/* 卡片顶部：标签行 + 操作按钮 */}
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid #F3F4F6', backgroundColor: (order._fromFunder || order._isParticipant) ? '#F0FDF4' : '#FAFBFF' }}>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: coinColor }}>
            {order.coin}
          </span>
          {isAdmin ? (
            <button
              onClick={() => setShowStatusSheet(true)}
              className="text-xs px-1.5 py-0.5 rounded-full font-medium transition-opacity hover:opacity-70"
              style={
                order.status === 'active'
                  ? { backgroundColor: '#EEF4FF', color: '#1A56DB' }
                  : order.status === 'settled'
                  ? { backgroundColor: '#F0FDF4', color: '#16A34A' }
                  : { backgroundColor: '#F9FAFB', color: '#9CA3AF' }
              }
            >
              {STATUS_OPTIONS.find(s => s.value === order.status)?.label || order.status}
            </button>
          ) : (
            <span
              className="text-xs px-1.5 py-0.5 rounded-full font-medium"
              style={
                order.status === 'active'
                  ? { backgroundColor: '#EEF4FF', color: '#1A56DB' }
                  : order.status === 'settled'
                  ? { backgroundColor: '#F0FDF4', color: '#16A34A' }
                  : { backgroundColor: '#F9FAFB', color: '#9CA3AF' }
              }
            >
              {STATUS_OPTIONS.find(s => s.value === order.status)?.label || order.status}
            </span>
          )}
          {(() => {
            const m = (realMembers as any[])?.find((m: any) => m.userId === order.user_id);
            const name = m ? (m.username + (m.realName && m.realName !== m.username ? ` (${m.realName})` : '')) : null;
            if (!name) return null;
            return (
              <span className="text-xs font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#F3F4F6', color: '#374151' }}>
                {name}
              </span>
            );
          })()}
          {order.asset_type && (
            <span className="text-[10px] px-1.5 py-0.5 font-medium" style={{ border: '1px solid #D1D5DB', borderRadius: '3px', color: '#1A1A1A', backgroundColor: 'transparent' }}>
              {order.asset_type === 'stock' ? '股票' : '数字币'}
            </span>
          )}
          {order.owner_label && (
            <span className="text-[10px] px-1.5 py-0.5 font-medium" style={{ border: '1px solid #D1D5DB', borderRadius: '3px', color: '#1A1A1A', backgroundColor: 'transparent' }}>
              {order.owner_label}
            </span>
          )}
          {(() => {
            try {
              const t = (order as any).tags;
              const tags: string[] = Array.isArray(t) ? t : (typeof t === 'string' && t ? JSON.parse(t) : []);
              return tags.map((tag, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 font-medium" style={{ border: '1px solid #D1D5DB', borderRadius: '3px', color: '#1A1A1A', backgroundColor: 'transparent' }}>
                  {tag}
                </span>
              ));
            } catch { return null; }
          })()}
        </div>
        <div className="flex items-center gap-0.5">
          {isAdmin && !order._isParticipant && !order._fromFunder && (
            <button
              onClick={() => handleOpenParticipants(order.id)}
              className="flex items-center gap-0.5 px-1.5 py-1 ml-0.5 rounded-full transition-colors"
              style={{
                background: showParticipantsPanel === order.id ? '#1A56DB' : (order._participantCount > 0 ? '#DCFCE7' : '#E0E7FF'),
                color: showParticipantsPanel === order.id ? '#fff' : (order._participantCount > 0 ? '#16A34A' : '#1A56DB'),
              }}
              title="参与方设置"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              {(order._participantCount ?? 0) > 0 && (
                <span className="text-[10px] font-bold leading-none">×{order._participantCount}</span>
              )}
            </button>
          )}
          {!order._isParticipant && !order._fromFunder && (activeUserTab === 'all' || Number(order.user_id) === Number(activeUserTab)) && (
            <button
              onClick={() => openEdit(order)}
              className="p-1.5 ml-1 text-gray-300 hover:text-blue-500 rounded-lg hover:bg-blue-50 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 主体：左右两栏布局 */}
      <div className="flex">

        {/* 左栏：持有资产 */}
        <div className="flex-1 p-4 pr-3">
          <div className="flex items-center gap-0.5 mb-0.5">
            <span className="text-[10px] font-medium" style={{ color: isGreenOrder ? '#16A34A' : '#3B82F6' }}>{isGreenOrder ? '持有资产' : '融资资产'}</span>
            {!isGreenOrder && <span className="text-[10px] text-gray-400">({order.finance_type === '自负盈亏' ? '自负盈亏 100%部分' : '保本分成 50%部分'})</span>}
          </div>
          {/* 持币量大数字 */}
          <div className="min-h-9 flex flex-col justify-center">
            <div className="flex items-baseline gap-1 flex-wrap">
              <span className="text-2xl font-bold tabular-nums leading-tight" style={{ color: '#1A2340' }}>
                {isGreenOrder && order.asset_type === 'stock'
                  ? (order.amount !== null && order.amount !== undefined && order.amount !== '' ? totalU.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '0')
                  : (order.buy_quantity !== null && order.buy_quantity !== undefined && order.buy_quantity !== '' ? formatCoinQty(qty, order.coin) : '0')}
              </span>
              <span className="text-xs font-semibold" style={{ color: '#1A2340' }}>{order.coin}</span>
            </div>
            {isGreenOrder && order.asset_type === 'stock' ? (
              totalU > 0 && order.coin === 'CNY' && (
                <div className="text-xs font-medium leading-tight" style={{ color: '#4B5563' }}>≈{(totalU / 7).toLocaleString(undefined, { maximumFractionDigits: 0 })} U</div>
              )
            ) : (
              liveP && qty > 0 && (
                <div className="text-xs font-medium leading-tight" style={{ color: '#4B5563' }}>≈{(order.coin === 'CNY' ? (qty / cnyRate) : (qty * liveP)).toLocaleString(undefined, { maximumFractionDigits: order.coin === 'CNY' ? 0 : 2 })} U</div>
              )
            )}
          </div>
          {/* 订单信息列表 */}
          <div className="space-y-0.5 text-xs">
            {orderDc.buyPrice !== false && price > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">买入币价</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>{price.toLocaleString()} U</span>
              </div>
            )}
            {orderDc.buyValue !== false && totalU > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">买入价值</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>{totalU.toLocaleString(undefined, { maximumFractionDigits: 2 })} U</span>
              </div>
            )}
            {orderDc.interestBase !== false && order.interest_base && parseFloat(order.interest_base) > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">计息基数</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>
                  {parseFloat(order.interest_base).toLocaleString(undefined, { maximumFractionDigits: 2 })} {interestUnit}
                </span>
              </div>
            )}
            {orderDc.todayPrice !== false && order.coin !== 'CNY' && order.coin !== 'USDT' && liveP && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">当前币价</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>{liveP.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} U</span>
              </div>
            )}
            {orderDc.buyDate !== false && order.buy_date && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">开仓时间</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>{order.buy_date}</span>
              </div>
            )}
            {orderDc.holdDuration !== false && holdDurationLabel && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">持有时长</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>{holdDurationLabel}</span>
              </div>
            )}
            {orderDc.orderNo !== false && order.order_no && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">订单编号</span>
                <span className="font-mono" style={{ color: '#9CA3AF', letterSpacing: '0.05em' }}>{order.order_no}</span>
              </div>
            )}
            {orderDc.interestPaymentType !== false && order.interest_payment_type && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">付息方式</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>{getPaymentLabel(order.interest_payment_type)}</span>
              </div>
            )}
            {order.storage_account && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">存放账号</span>
                <span className="font-medium truncate ml-2" style={{ color: '#4B5563' }}>{order.storage_account}</span>
              </div>
            )}
          </div>
        </div>

        {/* 中间分隔线 */}
        <div className="w-px my-3" style={{ backgroundColor: '#E8EFFF' }} />

        {/* 右栏：待结利息 */}
        <div className="p-4 pl-3 flex flex-col shrink-0" style={{ width: 'auto', minWidth: '160px', maxWidth: '200px' }}>
          {/* 标题 */}
          {orderDc.accruedInterest !== false ? (
            <>
              <div className="flex items-center gap-1 mb-0.5" style={{ height: '16px' }}>
                <span className="text-[10px]" style={{ color: '#3B82F6' }}>{isGreenOrder ? '待结利息' : '待付利息'}</span>
                {rateAbs && <span className="text-[10px] text-gray-400">(年化 {isGreenOrder ? '' : (isNegRate ? '-' : '')}{rateAbs}%)</span>}
              </div>
              {/* 待结利息大数字 */}
              <div className="min-h-9 flex flex-col justify-center">
                <div className="flex items-baseline gap-0.5">
                  <span className="text-2xl font-bold tabular-nums leading-tight" style={{ color: displayAccrued === 0 ? '#1A2340' : '#059669', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                    {isGreenOrder
                      ? (displayAccrued === 0 ? '' : (isNegRate ? '-' : '+'))
                      : (displayAccrued > 0 ? '-' : '')}{displayAccrued.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-xs font-semibold" style={{ color: '#1A2340' }}>{interestUnit}</span>
                </div>
                <div className="text-xs font-medium leading-tight" style={{ color: '#4B5563' }}>≈{isGreenOrder ? (displayAccrued === 0 ? '' : (isNegRate ? '-' : '+')) : (altAccrued > 0 ? '-' : '')}{altAccrued.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {altUnit}</div>
              </div>
            </>
          ) : <div style={{ height: '16px' }} />}
          {/* 明细行 */}
          <div className="space-y-0.5 text-xs">
            {orderDc.paidInterest !== false && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 whitespace-nowrap">{isGreenOrder ? '已结利息' : '已付利息'}</span>
                  <span className="font-medium" style={{ color: '#4B5563' }}>
                    {displayPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {interestUnit}
                  </span>
                </div>
                {displayPaid > 0 && (
                  <div className="flex justify-end">
                    <span className="text-gray-400">≈{altPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {altUnit}</span>
                  </div>
                )}
              </>
            )}
            {orderDc.interestStartDate !== false && order.interest_start_date && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400">计息日期</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>
                  {String(order.interest_start_date).slice(0, 10).replace(/^\d{4}-(\d{2})-(\d{2})$/, (_: string, m: string, d: string) => `${parseInt(m)}月${parseInt(d)}日`)}
                </span>
              </div>
            )}
            {/* 计息时长（绿色订单显示，与 FunderManagement 一致） */}
            {isGreenOrder && order.interest_start_date && (order.status === 'active' || order.settled_at) && (() => {
              const endTs = order.settled_at ? new Date(order.settled_at).getTime() : Date.now();
              const elapsed = endTs - new Date(String(order.interest_start_date).slice(0, 10) + 'T00:00:00').getTime();
              if (elapsed < 0) return null;
              const totalHours = Math.floor(elapsed / (1000 * 60 * 60));
              const days = Math.floor(totalHours / 24);
              const hours = totalHours % 24;
              const label = days > 0 ? `${days}天 ${hours}小时` : `${hours}小时`;
              return (
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">计息时长</span>
                  <span className="font-medium" style={{ color: '#4B5563' }}>{label}</span>
                </div>
              );
            })()}
            {/* 担保货币 */}
            {orderDc.collateralCoin !== false && collateralAssets.map((a, idx) => (
              <div key={idx}>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-gray-400">{collateralAssets.length > 1 ? `担保货币${idx + 1}` : '担保货币'}</span>
                  <span className="font-medium" style={{ color: '#4B5563' }}>{a.qty} {a.coin}</span>
                </div>
                {collateralItemValues[idx] !== null && collateralItemValues[idx] !== undefined && (
                  <div className="flex items-center justify-between mt-0.5">
                    <span></span>
                    <span className="font-medium" style={{ color: '#4B5563' }}>≈ {(collateralItemValues[idx] as number).toLocaleString(undefined, { maximumFractionDigits: 2 })} U</span>
                  </div>
                )}
              </div>
            ))}
            {orderDc.collateralValue !== false && collateralAssets.length > 0 && collateralValueKnown && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400">{collateralAssets.length > 1 ? '担保总值' : '担保价值'}</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>{collateralValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} U</span>
              </div>
            )}
            {/* 担保缺口 */}
            {orderDc.collateral !== false && collateralAssets.length > 0 && order.status === 'active' && (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span className="text-gray-400">担保缺口</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowCollateralInfo(true);
                      }}
                      className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-white text-[9px] font-bold flex-shrink-0"
                      style={{ background: '#9CA3AF', lineHeight: 1 }}
                    >
                      ?
                    </button>
                  </div>
                  <span className="font-medium" style={{ color: isSufficient ? '#4B5563' : '#EF4444' }}>
                    {isSufficient ? '超过100%' : `${exposure.toLocaleString(undefined, { maximumFractionDigits: 0 })} U`}
                  </span>
                </div>
                {/* 担保缺口计算弹窗（与资方担保缺口弹窗居中弹窗风格一致） */}
                {/* 保证金率：担保物当前价値 ÷ 计息基数 x 100% */}
                {orderDc.marginRate !== false && collateralValueKnown && collateralAssets.length > 0 && interestBaseNum > 0 && (() => {
                   // 新公式：(担保物市值 + 浮动盈亏 - 应付利息 + 已付利息 - 外借资金) ÷ 计息基数（全部折算为U）
                   const effectiveCollateral = floatPnl !== null
                     ? collateralValue + floatPnl - accruedInU + totalPaidInU - lentOutValueU
                     : collateralValue - accruedInU + totalPaidInU - lentOutValueU;
                   const marginRatio = effectiveCollateral / interestBaseNum;
                  const marginColor = marginRatio >= 1 ? '#16A34A' : marginRatio >= 0.5 ? '#D97706' : '#DC2626';
                  // 预警阈值判断
                  const alertThreshold = typeof orderDc.marginAlertThreshold === 'number' ? orderDc.marginAlertThreshold : null;
                  const isAlerting = alertThreshold !== null && (marginRatio * 100) < alertThreshold;
                  return (
                    <>
                      <div className="flex items-center justify-between mt-0.5">
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400">保证金率</span>
                          {isAlerting && (
                            <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-white text-[8px] font-bold flex-shrink-0 animate-pulse" style={{ background: '#EF4444', lineHeight: 1 }}>❗</span>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); setShowMarginInfo(true); }}
                            className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-white text-[9px] font-bold flex-shrink-0"
                            style={{ background: '#9CA3AF', lineHeight: 1 }}
                          >?</button>
                        </div>
                        <span className="font-bold" style={{ color: isAlerting ? '#EF4444' : marginColor }}>{(marginRatio * 100).toFixed(1)}%{isAlerting ? ' ⚠' : ''}</span>
                      </div>
                      {showMarginInfo && (
                        <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setShowMarginInfo(false)}>
                          <div className="rounded-2xl p-5 mx-4 w-full max-w-xs" style={{ background: '#fff', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-sm font-bold" style={{ color: '#1A2340' }}>保证金率计算说明</span>
                              <button onClick={() => setShowMarginInfo(false)} className="text-gray-400 text-lg leading-none">×</button>
                            </div>
                            <div className="text-xs space-y-2.5" style={{ color: '#4B5563' }}>
                              {/* 公式说明 */}
                              <div className="p-2.5 rounded-lg" style={{ background: '#F0F4FF' }}>
                              <div className="font-semibold mb-1" style={{ color: '#1A2340' }}>① 公式</div>
                                <div>保证金率 = (担保物市值 + 浮动盈亏 - 应付利息 + 已付利息{lentOutValueU > 0 ? ' - 外借资金' : ''}) ÷ 计息基数 × 100%</div>
                                <div className="mt-1 font-mono text-[10px]">
                                   <span style={{ color: '#3B82F6' }}>= ({collateralValue.toFixed(2)}{floatPnl !== null ? ` + (${floatPnl >= 0 ? '+' : ''}${floatPnl.toFixed(2)})` : ''} − {accruedInU.toFixed(2)} + {totalPaidInU.toFixed(2)}{lentOutValueU > 0 ? ` − ${lentOutValueU.toFixed(2)}` : ''}) ÷ {interestBaseNum.toFixed(2)} × 100% = </span>
                                   <strong style={{ color: marginColor }}>{(marginRatio * 100).toFixed(1)}%</strong>
                                </div>
                              </div>
                              {/* 担保物明细 */}
                              <div className="p-2.5 rounded-lg" style={{ background: '#F0F4FF' }}>
                                <div className="font-semibold mb-1" style={{ color: '#1A2340' }}>② 担保物当前市值</div>
                                {collateralAssets.map((a, idx) => {
                                  const itemVal = collateralItemValues[idx];
                                  return (
                                    <div key={idx} className="mt-1 flex justify-between">
                                      <span className="font-mono" style={{ color: '#6B7280' }}>{a.qty} {a.coin}</span>
                                      {itemVal !== null
                                        ? <span className="font-mono font-semibold" style={{ color: '#3B82F6' }}>{(itemVal as number).toFixed(2)} U</span>
                                        : <span className="font-mono" style={{ color: '#D1D5DB' }}>暂无实时价</span>
                                      }
                                    </div>
                                  );
                                })}
                                {collateralAssets.length > 1 && (
                                  <div className="font-mono mt-1 pt-1 font-semibold" style={{ borderTop: '1px solid #D1D5DB', color: '#1A2340' }}>
                                    合计 {collateralValue.toFixed(2)} U
                                  </div>
                                )}
                              </div>
                              {/* 评估标准 */}
                              <div className="p-2.5 rounded-lg" style={{ background: marginRatio >= 1 ? '#F0FDF4' : marginRatio >= 0.5 ? '#FFFBEB' : '#FFF1F1' }}>
                                <div className="font-semibold mb-1" style={{ color: marginRatio >= 1 ? '#16A34A' : marginRatio >= 0.5 ? '#D97706' : '#DC2626' }}>③ 风险评估</div>
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5">
                                    <span style={{ color: '#16A34A' }}>≥ 100%</span>
                                    <span>担保充足，风险可控</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span style={{ color: '#D97706' }}>50% ~ 100%</span>
                                    <span>担保偏低，建议补充</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span style={{ color: '#DC2626' }}>&lt; 50%</span>
                                    <span>担保严重不足，高风险</span>
                                  </div>
                                </div>
                                <div className="mt-2 font-semibold" style={{ color: marginRatio >= 1 ? '#16A34A' : marginRatio >= 0.5 ? '#D97706' : '#DC2626' }}>
                                  当前状态：{marginRatio >= 1 ? '担保充足' : marginRatio >= 0.5 ? '担保偏低，建议补充' : '担保严重不足，高风险'}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
                {showCollateralInfo && (
                  <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setShowCollateralInfo(false)}>
                    <div className="rounded-2xl p-5 mx-4 w-full max-w-xs" style={{ background: '#fff', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-bold" style={{ color: '#1A2340' }}>担保缺口计算说明</span>
                        <button onClick={() => setShowCollateralInfo(false)} className="text-gray-400 text-lg leading-none">×</button>
                      </div>
                      <div className="text-xs space-y-2.5" style={{ color: '#4B5563' }}>
                        {/* ① 浮动盈亏 */}
                        <div className="p-2.5 rounded-lg" style={{ background: '#F0F4FF' }}>
                          <div className="font-semibold mb-1" style={{ color: '#1A2340' }}>① 浮动盈亏</div>
                          <div>= 当前市値 - 计息基数（正数为浮盈，负数为亏损）</div>
                          <div className="mt-1 font-mono">
                            {floatPnl !== null
                              ? <><span style={{ color: '#3B82F6' }}>= {currentValue!.toFixed(2)} - {interestBaseNum.toFixed(2)} = </span><strong style={{ color: floatPnl >= 0 ? '#DC2626' : '#16A34A' }}>{floatPnl >= 0 ? '+' : ''}{floatPnl.toFixed(2)} U{floatPnl >= 0 ? '（浮盈）' : '（亏损）'}</strong></>
                              : <span className="text-gray-400">当前市値暂无实时价格，暂无法计算浮动盈亏</span>
                            }
                          </div>
                        </div>
                        {/* ② 担保价値 */}
                        <div className="p-2.5 rounded-lg" style={{ background: '#F0F4FF' }}>
                          <div className="font-semibold mb-1" style={{ color: '#1A2340' }}>② 担保价値</div>
                          {collateralAssets.length === 0
                            ? <div className="font-mono mt-1" style={{ color: '#9CA3AF' }}>0.00 U（无担保物）</div>
                            : <>
                                {collateralAssets.map((a, idx) => {
                                  const itemVal = collateralItemValues[idx];
                                  return (
                                    <div key={idx} className="mt-1 flex justify-between">
                                      <span className="font-mono" style={{ color: '#6B7280' }}>{a.qty} {a.coin}</span>
                                      {itemVal !== null
                                        ? <span className="font-mono font-semibold" style={{ color: '#3B82F6' }}>{itemVal.toFixed(2)} U</span>
                                        : <span className="font-mono" style={{ color: '#D1D5DB' }}>暂无实时价</span>
                                      }
                                    </div>
                                  );
                                })}
                                {collateralAssets.length > 1 && (
                                  <div className="font-mono mt-1 pt-1 font-semibold" style={{ borderTop: '1px solid #D1D5DB', color: '#1A2340' }}>
                                    合计 {collateralValue.toFixed(2)} U
                                  </div>
                                )}
                              </>
                          }
                        </div>
                        {/* ③ 外借资金 */}
                        {lentOutValueU > 0 && (
                          <div className="p-2.5 rounded-lg" style={{ background: '#FFF7ED' }}>
                            <div className="font-semibold mb-1" style={{ color: '#EA580C' }}>③ 外借资金</div>
                            {lentOutAssets.map((la, idx) => {
                              const lq = parseFloat(la.qty);
                              let laVal = 0;
                              if (la.coin === 'USDT') laVal = lq;
                              else if (la.coin === 'CNY') laVal = lq / cnyRate;
                              else { const lp = livePrices[la.coin]; if (lp) laVal = lq * lp; }
                              return (
                                <div key={idx} className="mt-1 flex justify-between">
                                  <span className="font-mono" style={{ color: '#6B7280' }}>{la.qty} {la.coin}</span>
                                  <span className="font-mono font-semibold" style={{ color: '#EA580C' }}>{laVal.toFixed(2)} U</span>
                                </div>
                              );
                            })}
                            {lentOutAssets.length > 1 && (
                              <div className="font-mono mt-1 pt-1 font-semibold" style={{ borderTop: '1px solid #FED7AA', color: '#EA580C' }}>
                                合计 {lentOutValueU.toFixed(2)} U
                              </div>
                            )}
                          </div>
                        )}
                        {/* ④ 风险敞口 */}
                        <div className="p-2.5 rounded-lg" style={{ background: isSufficient ? '#FFF1F1' : '#F0FDF4' }}>
                          <div className="font-semibold mb-1" style={{ color: isSufficient ? '#DC2626' : '#16A34A' }}>{lentOutValueU > 0 ? '④' : '③'} 风险敞口</div>
                          <div>担保物 + 浮动盈亏 − 待付利息 + 已付利息{lentOutValueU > 0 ? ' − 外借资金' : ''}（正数充足，负数缺口）</div>
                          <div className="mt-1 font-mono">
                            {floatPnl !== null
                              ? <span style={{ color: '#3B82F6' }}>= {collateralValue.toFixed(2)} + ({floatPnl >= 0 ? '+' : ''}{floatPnl.toFixed(2)}) − {accruedInU.toFixed(2)} + {totalPaidInU.toFixed(2)}{lentOutValueU > 0 ? ` − ${lentOutValueU.toFixed(2)}` : ''} = <strong style={{ color: isSufficient ? '#DC2626' : '#16A34A' }}>{exposure >= 0 ? '+' : ''}{exposure.toFixed(2)} U</strong></span>
                              : <span style={{ color: '#3B82F6' }}>= {collateralValue.toFixed(2)} + ---（暂无实时价） − {accruedInU.toFixed(2)} + {totalPaidInU.toFixed(2)}{lentOutValueU > 0 ? ` − ${lentOutValueU.toFixed(2)}` : ''} = <strong style={{ color: isSufficient ? '#DC2626' : '#16A34A' }}>{exposure >= 0 ? '+' : ''}{exposure.toFixed(2)} U</strong></span>
                            }
                          </div>
                          <div className="mt-1.5" style={{ color: isSufficient ? '#DC2626' : '#16A34A' }}>
                            {isSufficient
                              ? `担保物充足，还有 ${exposure.toFixed(2)} U 的余量空间`
                              : `担保物不足，还需补充 ${Math.abs(exposure).toFixed(2)} U 才能覆盖风险`
                            }
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            {/* 收益分成（右栏下半） */}
            {orderDc.profitShare !== false && order.show_profit_share !== 0 && order.show_profit_share !== false && order.show_profit_share !== null && (
              <>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-gray-400">收益分成</span>
                  <span className="font-medium" style={{ color: '#3B82F6' }}>已开启</span>
                </div>
                {order.commission_share && orderDc.commissionShare !== false && (
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-gray-400">佣金分成</span>
                    <span className="font-medium" style={{ color: '#4B5563' }}>{order.commission_share}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>



      {/* 内部备注 */}
      {order.admin_note && (
        <div className="px-4 pb-2 text-xs text-gray-400 border-t border-gray-100 pt-2">
          内部备注：{order.admin_note}
        </div>
      )}

      {/* 结息面板 + 备注区 */}
      <div className="px-4 pt-3 pb-3 border-t border-blue-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium" style={{ color: '#1A2340' }}>
            {isGreenOrder ? '已结利息' : '已付利息'}：<span style={{ color: '#16A34A' }}>{displayPaid.toFixed(2)} {interestUnit}</span>
          </span>
          <button
            onClick={() => { setShowPaymentPanel(showPaymentPanel === order.id ? null : order.id); setPaymentForm(() => ({ amount: '', payDate: new Date().toISOString().slice(0, 10), note: '' })); }}
            className="text-xs px-3 py-1 rounded-full font-medium"
            style={{ backgroundColor: '#EEF4FF', color: '#1A56DB' }}
          >
            {showPaymentPanel === order.id ? '收起' : '+ 记录结息'}
          </button>
        </div>

        {showPaymentPanel === order.id && (
          <div className="bg-blue-50 rounded-xl p-3 mb-3 space-y-2">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">结息金额 ({interestUnit})</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={paymentForm.amount}
                  onChange={e => setPaymentForm((f: any) => ({ ...f, amount: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="如：500"
                  style={{ display: 'block', boxSizing: 'border-box' }}
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">结息日期</label>
                <div className="relative">
                  <button
                    onClick={() => setShowPaymentDatePicker((v: boolean) => !v)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-left focus:outline-none"
                    style={{ backgroundColor: '#fff', color: paymentForm.payDate ? '#1A2340' : '#9CA3AF', display: 'block', boxSizing: 'border-box' }}
                  >
                    {paymentForm.payDate || '选择日期'}
                  </button>
                  {showPaymentDatePicker && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }} onClick={() => setShowPaymentDatePicker(false)}>
                      <div className="bg-white rounded-xl shadow-2xl mx-4 w-full" style={{ maxWidth: 320 }} onClick={e => e.stopPropagation()}>
                        <DatePicker value={paymentForm.payDate} onChange={v => { setPaymentForm((f: any) => ({ ...f, payDate: v })); setShowPaymentDatePicker(false); }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">备注（可选）</label>
              <input
                type="text"
                value={paymentForm.note}
                onChange={e => setPaymentForm((f: any) => ({ ...f, note: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="结息说明"
                style={{ display: 'block', boxSizing: 'border-box' }}
              />
            </div>
            <button
              onClick={() => handleAddPayment(order.id)}
              disabled={addPaymentMutation.isPending}
              className="w-full py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #1A56DB, #3B82F6)' }}
            >
              {addPaymentMutation.isPending ? '提交中...' : '确认记录'}
            </button>
          </div>
        )}

        {showPaymentPanel === order.id && openedPaymentList.length > 0 && (
          <div className="space-y-1.5">
            {openedPaymentList.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2">
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <span className="font-medium" style={{ color: '#16A34A' }}>+{parseFloat(p.amount).toFixed(2)} {interestUnit}</span>
                  {p.note && <span className="text-gray-400 ml-1 truncate">{p.note}</span>}
                </div>
                <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                  <span className="text-gray-400">{p.payment_date}</span>
                  <button
                    onClick={() => {
                      if (window.confirm('确认删除这条结息记录？')) {
                        deletePaymentMutation.mutate({ ledgerId, paymentId: p.id });
                      }
                    }}
                    className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
                    title="删除"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 公开备注区域 */}
        <FinanceNoteRow
          orderId={order.id}
          ledgerId={ledgerId}
          initialNote={order.public_note || ''}
          onSaved={(raw) => { order.public_note = raw; }}
          currentUser={currentUser ? { id: (currentUser as any).id, name: (currentUser as any).name, username: (currentUser as any).username, avatar: (currentUser as any).avatar || (realMembers as any[])?.find((m: any) => m.userId === (currentUser as any).id)?.avatar || undefined } : undefined}
          isAdmin={isAdmin}
          membersData={realMembers as any[]}
        />
      </div>

      {/* 参与方配置面板 */}
      {showParticipantsPanel === order.id && (
        <div className="mx-4 mb-3 rounded-2xl border border-blue-100 bg-blue-50 p-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold" style={{ color: '#1A56DB' }}>参与方设置</span>
            <button onClick={() => handleOpenParticipants(order.id)} className="text-gray-400 hover:text-gray-600 text-xs">关闭</button>
          </div>
          {participantsLoading ? (
            <div className="text-xs text-gray-400 py-2 text-center">加载中...</div>
          ) : (
            <>
              {/* 已保存的参与方列表（只读展示） */}
              {savedParticipants.length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] text-gray-400 mb-1.5">已添加</div>
                  <div className="space-y-1.5">
                    {savedParticipants.map((p) => {
                      const roleOpt = ROLE_OPTIONS.find(r => r.value === p.role);
                      return (
                        <div key={p.userId} className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-white border border-gray-100">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-700">{p.displayName}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${roleOpt?.color}18`, color: roleOpt?.color }}>{roleOpt?.label}</span>
                          </div>
                          <button
                            onClick={() => handleRemoveSaved(order.id, p.userId)}
                            disabled={saveParticipantsMutation.isPending}
                            className="text-gray-300 hover:text-red-400 transition-colors text-sm leading-none px-1"
                          >×</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* 新增行（空白输入框） */}
              {participantsList.length > 0 && (
                <div className="mb-2">
                  <div className="text-[10px] text-gray-400 mb-1.5">新增</div>
                  <div className="space-y-1.5">
                    {participantsList.map((p, idx) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        <select
                          value={p.userId || ''}
                          onChange={e => setParticipantsList(list => list.map((item, i) => i === idx ? { ...item, userId: parseInt(e.target.value), displayName: ledgerMembers.find(m => m.userId === parseInt(e.target.value))?.displayName || '' } : item))}
                          className="flex-1 text-xs px-2 py-1.5 rounded-lg border border-gray-200 bg-white"
                        >
                          <option value="">选择成员...</option>
                          {ledgerMembers
                            .filter(m => !savedParticipants.some(s => s.userId === m.userId) && !participantsList.some((q, qi) => qi !== idx && q.userId === m.userId))
                            .map(m => (
                              <option key={m.userId} value={m.userId}>{m.displayName}</option>
                            ))}
                        </select>
                        <select
                          value={p.role}
                          onChange={e => setParticipantsList(list => list.map((item, i) => i === idx ? { ...item, role: e.target.value as any } : item))}
                          className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 bg-white"
                        >
                          {ROLE_OPTIONS.map(r => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                        <button onClick={() => setParticipantsList(list => list.filter((_, i) => i !== idx))} className="text-gray-300 hover:text-red-400 text-sm px-1">×</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* 添加按鈕 */}
              <div className="flex gap-1.5 mb-2.5">
                {ROLE_OPTIONS.map(r => (
                  <button
                    key={r.value}
                    onClick={() => handleAddParticipant(r.value)}
                    className="text-xs px-2.5 py-1 rounded-lg border font-medium"
                    style={{ borderColor: r.color, color: r.color, backgroundColor: `${r.color}10` }}
                  >
                    + {r.label}
                  </button>
                ))}
              </div>
              {/* 仅有新增行时才显示保存按鈕 */}
              {participantsList.length > 0 && (
                <button
                  onClick={() => handleSaveParticipants(order.id)}
                  disabled={saveParticipantsMutation.isPending}
                  className="w-full py-2 rounded-xl text-xs font-semibold text-white"
                  style={{ background: 'linear-gradient(135deg, #1A56DB, #3B82F6)' }}
                >
                  {saveParticipantsMutation.isPending ? '保存中...' : '保存参与方'}
                </button>
              )}
              {savedParticipants.length === 0 && participantsList.length === 0 && (
                <div className="text-xs text-gray-400 py-1 text-center">暂无参与方，点击上方按鈕添加</div>
              )}
            </>
          )}
        </div>
      )}

      {/* 状态操作底部弹窗 */}
      {showStatusSheet && (
        <div className="fixed inset-0 z-[300] flex items-end justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={() => setShowStatusSheet(false)}>
          <div className="bg-white rounded-t-2xl w-full max-w-md px-5 pt-5 pb-8" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
            <div className="text-sm font-semibold text-gray-700 mb-4 text-center">订单操作</div>
            <div className="space-y-2">
              <button
                onClick={() => {
                  updateMutation.mutate({ id: order.id, ledgerId, status: 'active' });
                  setShowStatusSheet(false);
                }}
                className="w-full py-3 rounded-xl text-sm font-medium transition-colors"
                style={{ backgroundColor: order.status === 'active' ? '#DBEAFE' : '#F3F4F6', color: order.status === 'active' ? '#1D4ED8' : '#374151' }}
              >
                持有中{order.status === 'active' ? '（当前）' : ''}
              </button>
              <button
                onClick={() => {
                  updateMutation.mutate({ id: order.id, ledgerId, status: 'settled' });
                  setShowStatusSheet(false);
                }}
                className="w-full py-3 rounded-xl text-sm font-medium transition-colors"
                style={{ backgroundColor: order.status === 'settled' ? '#DCFCE7' : '#F3F4F6', color: order.status === 'settled' ? '#16A34A' : '#374151' }}
              >
                已结清{order.status === 'settled' ? '（当前）' : ''}（利息停止计算）
              </button>
              <button
                onClick={() => {
                  if (window.confirm('确认永久删除这张订单？此操作不可恢复。')) {
                    setConfirmDeleteId(order.id);
                    setShowStatusSheet(false);
                  }
                }}
                className="w-full py-3 rounded-xl text-sm font-medium"
                style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}
              >
                删除订单（不可恢复）
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// ===== END FinanceOrderCard =====

const INTEREST_PAYMENT_OPTIONS = [
  { value: 'monthly_pre', label: '月付先付' },
  { value: 'monthly_post', label: '月付后付' },
  { value: 'semi_pre', label: '半年付先付' },
  { value: 'semi_post', label: '半年付后付' },
  { value: 'annual_pre', label: '年付先付' },
  { value: 'annual_post', label: '年付后付' },
  { value: 'end_post', label: '结束后付' },
];


function DatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const selected = value ? new Date(value + 'T00:00:00') : null;
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); };
  const handleDay = (d: number) => { const mm = String(viewMonth + 1).padStart(2, '0'); const dd = String(d).padStart(2, '0'); onChange(`${viewYear}-${mm}-${dd}`); };
  const isSelected = (d: number) => selected && selected.getFullYear() === viewYear && selected.getMonth() === viewMonth && selected.getDate() === d;
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden" style={{ backgroundColor: '#FAFBFF' }}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <button onClick={prevMonth} className="p-1 rounded-lg hover:bg-gray-100">
          <CalLeft className="w-4 h-4 text-gray-400" />
        </button>
        <span className="text-sm font-semibold" style={{ color: '#1A2340' }}>{viewYear}年 {monthNames[viewMonth]}</span>
        <button onClick={nextMonth} className="p-1 rounded-lg hover:bg-gray-100">
          <CalRight className="w-4 h-4 text-gray-400" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center py-1">
        {['日','一','二','三','四','五','六'].map(d => (
          <div key={d} className="text-[10px] text-gray-400 py-0.5">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 text-center pb-2 px-1">
        {cells.map((d, i) => (
          <div key={i} className="py-0.5">
            {d !== null ? (
              <button
                onClick={() => handleDay(d)}
                className="w-7 h-7 mx-auto flex items-center justify-center rounded-full text-xs font-medium"
                style={isSelected(d) ? { background: 'linear-gradient(135deg, #1A56DB, #3B82F6)', color: '#fff' } : { color: '#374151' }}
              >
                {d}
              </button>
            ) : <div className="w-7 h-7" />}
          </div>
        ))}
      </div>
      {value && (
        <div className="px-3 pb-2 text-center text-xs text-blue-500 font-medium">已选：{value}</div>
      )}
    </div>
  );
}

const emptyForm = {
  coin: 'BTC' as CoinType,
  amount: '',
  buyPrice: '',
  buyDate: '',
  buyQuantity: '',
  storageAccount: '',
  counterparty: '',
  interestBase: '',
  interestBaseCurrency: 'USDT' as 'USDT' | 'CNY',
  interestStartDate: '',
  interestRateAnnual: '',
  interestRateSign: '+' as '+' | '-',
  interestPaymentType: '',
  publicNote: '',
  adminNote: '',
  status: 'active',
  collateralCoin: 'BTC' as CoinType,
  collateralQty: '',
  collateralAssets: [] as { coin: string; qty: string }[],
  lentOutAssets: [] as { coin: string; qty: string }[],
  financeType: '保本分成' as '保本分成' | '自负盈亏',
  showProfitShare: true,
  commissionShare: '',
  assetType: '' as '' | 'stock' | 'crypto',
  ownerLabel: '',
  interestRateCurrency: 'USDT' as 'USDT' | 'CNY',
  tags: [] as string[],
};

// ===== 订单公开备注组件 =====
interface FNoteItem { text: string; time: string; userId?: number; userName?: string; userAvatar?: string; }
function parseFNotes(raw: string): FNoteItem[] {
  if (!raw) return [];
  try { const p = JSON.parse(raw); if (Array.isArray(p)) return p as FNoteItem[]; } catch {}
  return [{ text: raw, time: '' }];
}
function formatFNoteTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth()+1}月${d.getDate()}日 ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function FNoteAvatar({ name, avatar }: { name?: string; avatar?: string }) {
  if (avatar) return <img src={avatar} alt={name || ''} className="w-5 h-5 rounded-full object-cover shrink-0" style={{ border: '1px solid #E0E7FF' }} />;
  if (!name) return <div className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center" style={{ backgroundColor: '#E5E7EB' }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>;
  const initials = name.slice(0, 1).toUpperCase();
  const colors = ['#6366F1','#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6'];
  const color = colors[name.charCodeAt(0) % colors.length] || '#6366F1';
  return <div className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: color }}>{initials}</div>;
}
function FinanceNoteRow({ orderId, ledgerId, initialNote, onSaved, currentUser, isAdmin, membersData }: { orderId: number; ledgerId: number; initialNote: string; onSaved: (note: string) => void; currentUser?: { id: number; name?: string; username?: string; avatar?: string }; isAdmin?: boolean; membersData?: any[] }) {
  const [notes, setNotes] = useState<FNoteItem[]>(() => parseFNotes(initialNote));
  const [expanded, setExpanded] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const updateNote = trpc.ledger.financeUpdatePublicNote.useMutation();
  const canEdit = (note: FNoteItem) => isAdmin || (currentUser && note.userId && note.userId === currentUser.id);
  const saveNotes = async (newNotes: FNoteItem[]) => {
    setSaving(true);
    try {
      const raw = JSON.stringify(newNotes);
      await updateNote.mutateAsync({ id: orderId, ledgerId, publicNote: raw });
      setNotes(newNotes);
      onSaved(raw);
    } finally { setSaving(false); }
  };
  const handleSaveEdit = async (idx: number) => {
    if (!editValue.trim()) return;
    await saveNotes(notes.map((n, i) => i === idx ? { ...n, text: editValue.trim(), time: new Date().toISOString() } : n));
    setEditingIdx(null);
  };
  const handleAddNote = () => {
    const newNotes = [...notes, { text: '', time: new Date().toISOString(), userId: currentUser?.id, userName: currentUser?.name || currentUser?.username, userAvatar: currentUser?.avatar || undefined }];
    setNotes(newNotes); setEditingIdx(newNotes.length - 1); setEditValue(''); setExpanded(true);
  };
  const handleSaveNew = async (idx: number) => {
    if (!editValue.trim()) { setNotes(notes.filter((_, i) => i !== idx)); setEditingIdx(null); return; }
    await saveNotes(notes.map((n, i) => i === idx ? { ...n, text: editValue.trim(), time: new Date().toISOString() } : n));
    setEditingIdx(null);
  };
  const handleDelete = async (idx: number) => {
    await saveNotes(notes.filter((_, i) => i !== idx));
  };
  return (
    <div className="px-3 py-2 text-xs mt-2 rounded-xl" style={{ backgroundColor: '#F8FBFF', border: '1px solid #DBEAFE' }} onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => setExpanded(v => !v)}>
        <div className="flex items-center gap-1.5">
          <span className="shrink-0 text-xs font-bold" style={{ color: '#6B7280' }}>公开备注</span>
          {notes.length > 0 && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#EEF2FF', color: '#6366F1' }}>{notes.length}</span>}
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}><polyline points="6 9 12 15 18 9" /></svg>
      </div>
      {expanded && (
        <div className="mt-1.5">
          {notes.length === 0 && <div style={{ color: '#C0C8D8' }} className="py-1">暂无备注</div>}
          {notes.map((note, idx) => (
            <div key={idx}>
              {idx > 0 && <div style={{ borderTop: '1px solid #E8EFFF' }} className="my-1" />}
              {editingIdx === idx ? (
                <div className="flex items-center gap-1 py-0.5">
                  <input autoFocus className="flex-1 text-xs border rounded px-1.5 py-0.5 outline-none" style={{ borderColor: '#C7D7FF', color: '#1A2340', minWidth: 0 }} value={editValue} onChange={e => setEditValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { note.text ? handleSaveEdit(idx) : handleSaveNew(idx); } if (e.key === 'Escape') { setEditingIdx(null); if (!note.text) setNotes(notes.filter((_, i) => i !== idx)); } }} placeholder="输入备注..." maxLength={200} />
                  <button onClick={() => note.text ? handleSaveEdit(idx) : handleSaveNew(idx)} disabled={saving} className="shrink-0 text-xs px-2 py-0.5 rounded" style={{ background: '#3B82F6', color: '#fff' }}>{saving ? '...' : '保存'}</button>
                  <button onClick={() => { setEditingIdx(null); if (!note.text) setNotes(notes.filter((_, i) => i !== idx)); }} className="shrink-0 text-xs px-1.5 py-0.5 rounded" style={{ background: '#F3F4F6', color: '#6B7280' }}>取消</button>
                </div>
              ) : (
                <div className="py-0.5">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <FNoteAvatar name={note.userName || (!note.userId ? ((membersData as any[])?.find((m: any) => m.role === 'owner')?.nickname || (membersData as any[])?.find((m: any) => m.role === 'owner')?.username || '') : '')} avatar={note.userAvatar || (note.userId ? (membersData as any[])?.find((m: any) => m.userId === note.userId)?.avatar || undefined : ((membersData as any[])?.find((m: any) => m.role === 'owner')?.avatar || currentUser?.avatar || undefined))} />
                    {note.userName && <span className="text-[10px] font-medium" style={{ color: '#6B7280' }}>{note.userName}</span>}
                    {note.time && <span className="text-[10px]" style={{ color: '#C0C8D8' }}>{formatFNoteTime(note.time)}</span>}
                    {canEdit(note) && (
                      <div className="ml-auto flex items-center gap-1">
                        <button onClick={() => { setEditingIdx(idx); setEditValue(note.text); }} className="p-0.5" title="编辑">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button onClick={() => handleDelete(idx)} className="p-0.5" title="删除">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="pl-6 break-all" style={{ color: '#4B5563' }}>{note.text}</div>
                </div>
              )}
            </div>
          ))}
          <div style={{ borderTop: notes.length > 0 ? '1px solid #E8EFFF' : 'none' }} className="mt-1 pt-1">
            <button type="button" onClick={handleAddNote} className="flex items-center gap-1" style={{ color: '#9CA3AF' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              <span style={{ fontSize: '11px' }}>添加备注</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
// ===== END FinanceNoteRow =====

interface FinanceManagementProps {
  ledgerIdProp?: number;
  hideHeader?: boolean;
}

export default function FinanceManagement({ ledgerIdProp, hideHeader }: FinanceManagementProps = {}) {
  const [, params] = useRoute("/ledger/:id/finance-management");
  const [, routeParams2] = useRoute("/ledger/:id/finance-unified");
  const [, setLocation] = useLocation();
  const ledgerId = ledgerIdProp || (params?.id ? parseInt(params.id) : (routeParams2?.id ? parseInt(routeParams2.id) : 0));
  // 观察视角：从 URL ?viewAs=xxx 读取
  const urlSearchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const viewAsUserId = urlSearchParams.get('viewAs') ? parseInt(urlSearchParams.get('viewAs')!) : undefined;

  const DEFAULT_DISPLAY_CONFIG: Record<string, boolean | number> = {
    buyPrice: true,
    buyValue: true,
    interestBase: true,
    buyDate: true,
    todayPrice: true,
    holdDuration: true,
    orderNo: true,
    accruedInterest: true,
    paidInterest: true,
    interestStartDate: true,
    collateralCoin: true,
    collateralValue: true,
    collateral: true,
    marginRate: true,
    profitShare: true,
    commissionShare: true,
    aiIcon: false,
    assetType: true,
    showOwnerName: true,
    interestPaymentType: true,
  };
  const [displayConfig, setDisplayConfig] = useState<Record<string, boolean | number>>(DEFAULT_DISPLAY_CONFIG);
  const [marginAlertThreshold, setMarginAlertThreshold] = useState<string>(''); // 保证金率预警阈值（%）

  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [formData, setFormData] = useState({ ...emptyForm });

  // 用户选择
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [userSearchText, setUserSearchText] = useState('');
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [tagInput, setTagInput] = useState('');
  // 列表筛选下拉框
  const [showListDropdown, setShowListDropdown] = useState(false);

  // 日期选择器
  const [showBuyDatePicker, setShowBuyDatePicker] = useState(false);
  const [showInterestDatePicker, setShowInterestDatePicker] = useState(false);

  // 结息记录
  const [showPaymentPanel, setShowPaymentPanel] = useState<number | null>(null);
  // 用户 Tab 筛选（管理员可切换，普通成员固定看自己）
  const [activeUserTab, setActiveUserTab] = useState<number | 'all'>('all');
  const [paymentForm, setPaymentForm] = useState({ amount: '', payDate: new Date().toISOString().slice(0, 10), note: '' });
  const [showPaymentDatePicker, setShowPaymentDatePicker] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const trpcUtils = trpc.useUtils();

  // 参与方相关 state
  const [showParticipantsPanel, setShowParticipantsPanel] = useState<number | null>(null);
  type ParticipantRole = 'funder' | 'borrower' | 'broker';
  type ParticipantItem = { userId: number; displayName: string; role: ParticipantRole; sortOrder: number };
  type LedgerMember = { userId: number; displayName: string; memberRole: string };
  // savedParticipants: 从数据库加载的已保存参与方（只读展示）
  const [savedParticipants, setSavedParticipants] = useState<ParticipantItem[]>([]);
  // participantsList: 当前编辑中的新增行（空白输入框）
  const [participantsList, setParticipantsList] = useState<ParticipantItem[]>([]);
  const [ledgerMembers, setLedgerMembers] = useState<LedgerMember[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const ROLE_OPTIONS: { value: ParticipantRole; label: string; color: string }[] = [
    { value: 'funder', label: '资金方', color: '#1A56DB' },
    { value: 'borrower', label: '借款人', color: '#D97706' },
    { value: 'broker', label: '中间人', color: '#059669' },
  ];
  const saveParticipantsMutation = trpc.ledger.financeSaveOrderParticipants.useMutation({
    onSuccess: async (_, variables) => {
      toast.success('参与方配置已保存');
      setShowParticipantsPanel(null);
      setSavedParticipants([]);
      setParticipantsList([]);
      trpcUtils.ledger.financeGetOrderParticipants.invalidate({ orderId: variables.orderId, ledgerId });
      trpcUtils.ledger.financeGetOrders.invalidate({ ledgerId });
    },
    onError: (err) => toast.error(err.message),
  });
  const handleOpenParticipants = async (orderId: number) => {
    if (showParticipantsPanel === orderId) { setShowParticipantsPanel(null); return; }
    setShowParticipantsPanel(orderId);
    setSavedParticipants([]);
    setParticipantsList([]); // 新增行清空
    setParticipantsLoading(true);
    try {
      await trpcUtils.ledger.financeGetOrderParticipants.invalidate({ orderId, ledgerId });
      const result = await trpcUtils.ledger.financeGetOrderParticipants.fetch({ orderId, ledgerId });
      const mapped = (result.participants || []).map((p: any) => ({
        userId: p.user_id,
        displayName: (p.username || p.userName || '') + (p.realName && p.realName !== (p.username || p.userName) ? ` (${p.realName})` : '') || `用户${p.user_id}`,
        role: p.role as ParticipantRole,
        sortOrder: p.sort_order || 0,
      }));
      setSavedParticipants(mapped); // 已保存的只读展示
      setParticipantsList([]);      // 新增行始终保持空白
      const mappedMembers = (result.members || []).map((m: any) => ({
        userId: m.userId,
        displayName: (m.username || m.userName || '') + (m.realName && m.realName !== (m.username || m.userName) ? ` (${m.realName})` : '') || `用户${m.userId}`,
        memberRole: m.memberRole,
      }));
      setLedgerMembers(mappedMembers);
    } catch (e) {
      toast.error('加载参与方失败');
      setSavedParticipants([]);
      setParticipantsList([]);
    } finally {
      setParticipantsLoading(false);
    }
  };
  const handleAddParticipant = (role: ParticipantRole) => {
    setParticipantsList(list => {
      const usedIds = [...savedParticipants.map(p => p.userId), ...list.map(p => p.userId)];
      const firstAvail = ledgerMembers.find(m => !usedIds.includes(m.userId));
      return [...list, { userId: firstAvail?.userId ?? 0, displayName: firstAvail?.displayName ?? '', role, sortOrder: list.length }];
    });
  };
  const handleRemoveSaved = (orderId: number, userId: number) => {
    // 从已保存列表中删除一个，立即保存剩余的
    const remaining = savedParticipants.filter(p => p.userId !== userId);
    saveParticipantsMutation.mutate({
      orderId,
      ledgerId,
      participants: remaining.map((p, i) => ({ userId: p.userId, role: p.role, sortOrder: i })),
    });
  };
  const handleSaveParticipants = (orderId: number) => {
    // 已保存的 + 新增的，合并保存
    const newValid = participantsList.filter(p => p.userId > 0);
    const all = [
      ...savedParticipants.map((p, i) => ({ userId: p.userId, role: p.role, sortOrder: i })),
      ...newValid.map((p, i) => ({ userId: p.userId, role: p.role, sortOrder: savedParticipants.length + i })),
    ];
    saveParticipantsMutation.mutate({ orderId, ledgerId, participants: all });
  };

  // 当前登录用户信息（用于备注权限控制）
  const { data: currentUser } = trpc.auth.me.useQuery();
  const { data: ledgerData } = trpc.ledger.getLedger.useQuery({ id: ledgerId }, { enabled: !!ledgerId });
  const isAdminUser = (ledgerData as any)?.userRole === 'owner' || (ledgerData as any)?.userRole === 'admin';

  // 查询
  const { data: ordersData, isLoading: ordersLoading, refetch: refetchOrders } = trpc.ledger.financeGetOrders.useQuery(
    { ledgerId, ...(viewAsUserId ? { viewAsUserId } : {}) },
    { enabled: !!ledgerId }
  );
  const orders = Array.isArray((ordersData as any)?.orders) ? (ordersData as any).orders : (Array.isArray(ordersData) ? ordersData : []);
  const { data: members } = trpc.ledger.getMembers.useQuery(
    { ledgerId },
    { enabled: !!ledgerId }
  );
  const orderIds = orders.map((o: any) => o.id).filter(Boolean);
  const { data: interestPaymentSummary } = trpc.ledger.financeGetInterestPaymentSummary.useQuery(
    { ledgerId, orderIds },
    { enabled: !!ledgerId && orderIds.length > 0 }
  );
  // 实时 USD/CNY 汇率（3秒刷新，用于 CNY 订单折算 U 值）
  const { data: cnyRateData } = trpc.exchange.getRate.useQuery(
    { fromcoin: 'USD', tocoin: 'CNY', money: 1 },
    { staleTime: 1000, refetchInterval: 3000 }
  );
  const cnyRate = (cnyRateData?.success && cnyRateData?.money) ? parseFloat(cnyRateData.money) : 7.2;

  const createMutation = trpc.ledger.financeCreateOrder.useMutation({
    onSuccess: () => { toast.success('订单已创建'); refetchOrders(); closeForm(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.ledger.financeUpdateOrder.useMutation({
    onSuccess: () => { toast.success('订单已更新'); refetchOrders(); closeForm(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.ledger.financeDeleteOrder.useMutation({
    onSuccess: () => { toast.success('订单已删除'); refetchOrders(); },
    onError: (e) => toast.error(e.message),
  });
  const addPaymentMutation = trpc.ledger.financeAddInterestPayment.useMutation({
    onSuccess: () => { toast.success('结息记录已添加'); refetchOrders(); setShowPaymentPanel(null); },
    onError: (e) => toast.error(e.message),
  });
  const deletePaymentMutation = trpc.ledger.financeDeleteInterestPayment.useMutation({
    onSuccess: () => { toast.success('结息记录已删除'); refetchOrders(); },
    onError: (e) => toast.error(e.message),
  });

  // 实时价格（常驻，用于订单列表卡片和表单预览）
  const { data: assetSummaryData } = trpc.ledger.financeGetAssetSummary.useQuery(
    { ledgerId },
    { enabled: !!ledgerId, staleTime: 10000, refetchInterval: 10000 }
  );
  const livePrices: Record<string, number> = (assetSummaryData as any)?.livePrices ?? {};
  // 表单预览复用同一份 livePrices
  const { data: assetSummaryForm } = trpc.ledger.financeGetAssetSummary.useQuery(
    { ledgerId },
    { enabled: !!ledgerId && showForm, staleTime: 10000, refetchInterval: 10000 }
  );
  const formLivePrices: Record<string, number> = (assetSummaryForm as any)?.livePrices ?? livePrices;

  // 表单中担保物的实时总价值
  const formComputedCollateralValue = useMemo(() => {
    const validAssets = formData.collateralAssets.filter(a => a.coin && a.qty !== '' && parseFloat(a.qty) > 0);
    if (validAssets.length === 0) return null;
    let total = 0;
    for (const a of validAssets) {
      const p = formLivePrices[a.coin];
      if (!p) return null;
      total += p * parseFloat(a.qty);
    }
    return total;
  }, [formData.collateralAssets, formLivePrices]);

  // 表单中外借资金的实时总价值（折算U）
  const formComputedLentOutValue = useMemo(() => {
    const validAssets = formData.lentOutAssets.filter(a => a.coin && a.qty !== '' && parseFloat(a.qty) > 0);
    if (validAssets.length === 0) return 0;
    let total = 0;
    for (const a of validAssets) {
      if (a.coin === 'USDT') { total += parseFloat(a.qty); }
      else if (a.coin === 'CNY') { const cnyR = formLivePrices['CNY'] || 7.2; total += parseFloat(a.qty) / cnyR; }
      else {
        const p = formLivePrices[a.coin];
        if (p) { total += p * parseFloat(a.qty); }
      }
    }
    return total;
  }, [formData.lentOutAssets, formLivePrices]);

  // 表单中融资本金（计息基数）
  const formComputedAmount = formData.interestBase ? parseFloat(formData.interestBase) : null;

  const realMembers = (members as any[] || []).filter((m: any) => !m.isAiClone);
  // 当前登录用户在账本中的角色（通过 orders 返回的 user_id 推断：管理员能看到多个用户的订单）
  // 更可靠的方式：检查 members 列表中是否有多于一个用户的订单
  const uniqueOrderUserIds = Array.from(new Set(orders.map((o: any) => o.user_id)));
  // 如果 orders 中有多个不同 user_id，说明当前用户是管理员
  const amIManager = uniqueOrderUserIds.length > 1 || (realMembers.length > 0 && (() => {
    // 备用：通过 members 中找到当前用户的 role
    // 由于前端没有直接的 currentUserId，通过 orders 中自己的 user_id 来判断
    // 如果 orders 为空但有成员列表，无法判断，默认显示全部
    return false;
  })());
  // 按 activeUserTab 筛选订单
  const displayOrders = activeUserTab === 'all'
    ? orders
    : orders.filter((o: any) => {
        const isOwner = Number(o.user_id) === Number(activeUserTab);
        const isParticipant = o._participantUserIds && o._participantUserIds.map(Number).includes(Number(activeUserTab));
        // 跨角色订单（资方订单在借方页面）：只在参与方的Tab下显示，不在订单所有者的Tab下显示
        if (o._isParticipant && o.order_role && o.order_role !== 'finance') {
          return isParticipant;
        }
        return isOwner || isParticipant;
      })
      .map((o: any) => {
        if (Number(o.user_id) !== Number(activeUserTab) && o._participantUserIds && o._participantUserIds.map(Number).includes(Number(activeUserTab))) {
          return { ...o, _isParticipant: true };
        }
        return o;
      });
  // 获取有订单的用户列表（用于 Tab 展示）
  // 跨角色订单（_isParticipant 且 order_role != 'finance'）只让参与方出现在Tab，不让订单所有者出现
  const usersWithOrders = realMembers.filter((m: any) =>
    orders.some((o: any) => {
      // 如果是跨角色订单（资方订单出现在借方页面），只通过参与方关系匹配
      if (o._isParticipant && o.order_role && o.order_role !== 'finance') {
        return o._participantUserIds && o._participantUserIds.map(Number).includes(Number(m.userId));
      }
      // 普通 finance 订单：订单所有者或参与方都可以出现
      return Number(o.user_id) === Number(m.userId) || (o._participantUserIds && o._participantUserIds.map(Number).includes(Number(m.userId)));
    })
  );

  const filteredMembers = realMembers.filter((m: any) => {
    // 右侧借方页面不显示资方(funder)角色的用户
    if (m.role === 'funder') return false;
    const searchStr = ((m.username || '') + ' ' + (m.realName || '') + ' ' + (m.nickname || '')).toLowerCase();
    return searchStr.includes(userSearchText.toLowerCase());
  });

  const selectedUser = realMembers.find((m: any) => m.userId === selectedUserId);

  function closeForm() {
    setShowForm(false);
    setEditingOrder(null);
    setFormData({ ...emptyForm });
    setSelectedUserId(null);
    setUserSearchText('');
    setShowBuyDatePicker(false);
    setShowInterestDatePicker(false);
  }

  function openCreate() {
    setEditingOrder(null);
    setFormData({ ...emptyForm });
    setSelectedUserId(null);
    setUserSearchText('');
    setShowForm(true);
  }

  function openEdit(order: any) {
    const rateStr = String(order.interest_rate_annual || '');
    const isNeg = rateStr.startsWith('-');
    setFormData({
      coin: order.coin || 'BTC',
      amount: order.amount || '',
      buyPrice: order.buy_price || '',
      buyDate: order.buy_date || '',
      buyQuantity: order.buy_quantity || '',
      storageAccount: order.storage_account || '',
      counterparty: order.counterparty || '',
      interestBase: order.interest_base || '',
      interestBaseCurrency: (order.interest_base_currency || 'USDT') as 'USDT' | 'CNY',
      interestStartDate: order.interest_start_date || '',
      interestRateAnnual: isNeg ? rateStr.slice(1) : rateStr,
      interestRateSign: isNeg ? '-' : '+',
      interestPaymentType: order.interest_payment_type || '',
      publicNote: order.public_note || '',
      adminNote: order.admin_note || '',
      status: order.status || 'active',
      collateralCoin: (order.collateral_coin || 'BTC') as CoinType,
      collateralQty: order.collateral_qty ? String(parseFloat(order.collateral_qty)) : '',
      collateralAssets: (() => {
        try {
          const rawCA = order.collateral_assets;
          if (rawCA) {
            const parsed = typeof rawCA === 'string' ? JSON.parse(rawCA) : rawCA;
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
          }
        } catch {}
        // 兼容旧数据：将单笔 collateral_coin/qty 转为数组
        if (order.collateral_coin && order.collateral_qty) {
          return [{ coin: order.collateral_coin, qty: String(parseFloat(order.collateral_qty)) }];
        }
        return [];
      })(),
      lentOutAssets: (() => {
        try {
          const rawLA = order.lent_out_assets;
          if (rawLA) {
            const parsed = typeof rawLA === 'string' ? JSON.parse(rawLA) : rawLA;
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
          }
        } catch {}
        return [];
      })(),
      financeType: (order.finance_type || '保本分成') as '保本分成' | '自负盈亏',
      showProfitShare: order.show_profit_share !== 0 && order.show_profit_share !== false,
      commissionShare: order.commission_share || '',
      assetType: (order.asset_type || '') as '' | 'stock' | 'crypto',
      ownerLabel: '',
      interestRateCurrency: (order.interest_rate_currency || 'USDT') as 'USDT' | 'CNY',
      tags: (() => {
        try {
          const t = order.tags;
          const parsed: string[] = Array.isArray(t) ? t : (typeof t === 'string' && t ? JSON.parse(t) : []);
          // 兼容旧数据：如果有owner_label且不在tags中，将其加入tags
          if (order.owner_label && !parsed.includes(order.owner_label)) {
            return [order.owner_label, ...parsed];
          }
          return parsed;
        } catch { return order.owner_label ? [order.owner_label] : []; }
      })(),
    });
    // 加载字段展示配置
    if (order.display_config) {
      try {
        const dc = typeof order.display_config === 'string' ? JSON.parse(order.display_config) : order.display_config;
        setDisplayConfig(prev => ({ ...prev, ...dc }));
        // 加载保证金率预警阈值
        if (dc.marginAlertThreshold !== undefined && dc.marginAlertThreshold !== null) {
          setMarginAlertThreshold(String(dc.marginAlertThreshold));
        } else {
          setMarginAlertThreshold('');
        }
      } catch(e) { setMarginAlertThreshold(''); }
    } else {
      setMarginAlertThreshold('');
    }
    setSelectedUserId(order.user_id || null);
    const u = realMembers.find((m: any) => m.userId === order.user_id);
    setUserSearchText(u ? (u.username || '') : '');
    setEditingOrder(order);
    setShowForm(true);
  }

  function handleSubmit() {
    if (!selectedUserId) { toast.error('请先选择要为哪位用户添加订单'); return; }
    if (!formData.coin) { toast.error('请选择币种'); return; }
    if (!formData.amount) { toast.error('请填写融资金额'); return; }
    const rateVal = formData.interestRateAnnual
      ? (formData.interestRateSign === '-' ? '-' : '') + formData.interestRateAnnual
      : '';
    if (editingOrder) {
      // 所有订单统一使用 financeUpdateOrder 路由
      updateMutation.mutate({
        id: editingOrder.id,
        ledgerId,
        userId: selectedUserId,
        coin: formData.coin,
        amount: formData.amount,
        buyPrice: formData.buyPrice,
        buyDate: formData.buyDate,
        buyQuantity: formData.buyQuantity,
        storageAccount: formData.storageAccount,
        interestBase: formData.interestBase,
        interestBaseCurrency: formData.interestBaseCurrency,
        interestStartDate: formData.interestStartDate,
        interestRateAnnual: rateVal,
        interestPaymentType: formData.interestPaymentType,
        publicNote: formData.publicNote,
        adminNote: formData.adminNote,
        status: formData.status,
        collateralCoin: formData.collateralCoin || undefined,
        collateralQty: formData.collateralQty || undefined,
        collateralAssets: formData.collateralAssets,
        lentOutAssets: formData.lentOutAssets.length > 0 ? formData.lentOutAssets : [],
        financeType: formData.financeType,
        showProfitShare: formData.showProfitShare,
        commissionShare: formData.commissionShare || undefined,
        assetType: formData.assetType || undefined,
        ownerLabel: '',
        interestRateCurrency: formData.interestRateCurrency,
        tags: formData.tags.length > 0 ? formData.tags : [],
        counterparty: formData.counterparty,
        displayConfig: {
          ...Object.fromEntries(Object.entries(displayConfig).filter(([, v]) => typeof v === 'boolean')),
          ...(marginAlertThreshold && parseFloat(marginAlertThreshold) > 0 ? { marginAlertThreshold: parseFloat(marginAlertThreshold) } : {}),
        } as Record<string, boolean>,
      } as any);
    } else {
      createMutation.mutate({
        ledgerId,
        userId: selectedUserId,
        coin: formData.coin,
        amount: formData.amount,
        buyPrice: formData.buyPrice,
        buyDate: formData.buyDate,
        buyQuantity: formData.buyQuantity,
        storageAccount: formData.storageAccount,
        counterparty: formData.counterparty,
        interestBase: formData.interestBase,
        interestBaseCurrency: formData.interestBaseCurrency,
        interestStartDate: formData.interestStartDate,
        interestRateAnnual: rateVal,
        interestPaymentType: formData.interestPaymentType,
        publicNote: formData.publicNote,
        adminNote: formData.adminNote,
        collateralCoin: formData.collateralCoin || undefined,
        collateralQty: formData.collateralQty || undefined,
        collateralAssets: formData.collateralAssets.length > 0 ? formData.collateralAssets : undefined,
        lentOutAssets: formData.lentOutAssets.length > 0 ? formData.lentOutAssets : undefined,
        financeType: formData.financeType,
        showProfitShare: formData.showProfitShare,
        commissionShare: formData.commissionShare || undefined,
        assetType: formData.assetType || undefined,
        ownerLabel: undefined,
        interestRateCurrency: formData.interestRateCurrency,
        tags: formData.tags.length > 0 ? formData.tags : undefined,
        displayConfig: {
          ...Object.fromEntries(Object.entries(displayConfig).filter(([, v]) => typeof v === 'boolean')),
          ...(marginAlertThreshold && parseFloat(marginAlertThreshold) > 0 ? { marginAlertThreshold: parseFloat(marginAlertThreshold) } : {}),
        } as Record<string, boolean>,
      });
    }
  }

  function handleAddPayment(orderId: number) {
    if (!paymentForm.amount) { toast.error('请填写结息金额'); return; }
    addPaymentMutation.mutate({
      orderId,
      ledgerId,
      amount: parseFloat(paymentForm.amount),
      payDate: paymentForm.payDate,
      note: paymentForm.note,
    });
  }

  // 展开结息记录时，按orderId单独查询
  const { data: openedPayments } = trpc.ledger.financeGetInterestPayments.useQuery(
    { ledgerId, orderId: showPaymentPanel! },
    { enabled: !!showPaymentPanel && !!ledgerId }
  );
  const openedPaymentList = Array.isArray(openedPayments) ? openedPayments : [];

  const getPaymentLabel = (val: string) => INTEREST_PAYMENT_OPTIONS.find(o => o.value === val)?.label || val;

  return (
    <div className={hideHeader ? '' : 'min-h-screen'} style={{ backgroundColor: '#F0F4FF' }}>
      {!hideHeader && <PageTag code="P095" />}
      {!hideHeader && (
      <div
        className="sticky top-0 z-10 px-4 py-3 flex items-center gap-3"
        style={{ background: 'linear-gradient(135deg, #1A56DB 0%, #3B82F6 100%)' }}
      >
        <button onClick={() => setLocation(`/ledger/${ledgerId}/settings${viewAsUserId ? `?viewAs=${viewAsUserId}` : ''}`)} className="p-1 -ml-2">
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>
        <h1 className="text-lg font-semibold text-white">融资付息订单管理</h1>
      </div>
      )}

      <div className="px-4 py-4">
        {/* 用户选择下拉框 + 添加订单按钮（同一行） */}
        <div className="flex items-center gap-2 mb-4">
          {/* 下拉框 */}
          <div className="relative flex-1">
            <button
              onClick={() => setShowListDropdown(!showListDropdown)}
              className="w-full flex items-center justify-between px-4 py-2.5 rounded-full text-sm font-medium bg-white border border-gray-200 shadow-sm"
              style={{ color: '#374151' }}
            >
              <span>
                {activeUserTab === 'all'
                  ? `全部借方${orders.length > 0 ? ` (${orders.length})` : ''}`
                  : (() => {
                      const m = realMembers.find((m: any) => m.userId === activeUserTab);
                      const name = m ? (m.username + (m.realName && m.realName !== m.username ? ` (${m.realName})` : '')) || `用户${activeUserTab}` : `用户${activeUserTab}`;
                      return `${name} (${displayOrders.length})`;
                    })()}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400 ml-1 shrink-0" />
            </button>
            {showListDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-2xl shadow-lg border border-gray-100 z-50 overflow-hidden">
                <div className="max-h-52 overflow-y-auto">
                  <button
                    onClick={() => { setActiveUserTab('all'); setShowListDropdown(false); }}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors"
                    style={{ color: activeUserTab === 'all' ? '#1A56DB' : '#374151', fontWeight: activeUserTab === 'all' ? 600 : 400 }}
                  >全部借方 {orders.length > 0 ? `(${orders.length})` : ''}</button>
                  {usersWithOrders.map((m: any) => {
                    const name = (m.username + (m.realName && m.realName !== m.username ? ` (${m.realName})` : '')) || `用户${m.userId}`;
                    const count = orders.filter((o: any) => o.user_id === m.userId).length;
                    return (
                      <button
                        key={m.userId}
                        onClick={() => { setActiveUserTab(m.userId); setShowListDropdown(false); }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors"
                        style={{ color: activeUserTab === m.userId ? '#1A56DB' : '#374151', fontWeight: activeUserTab === m.userId ? 600 : 400 }}
                      >{name} ({count})</button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          {/* 添加订单按钮 */}
          <button
            onClick={openCreate}
            className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-full text-white text-sm font-medium shadow-md"
            style={{ background: 'linear-gradient(135deg, #1A56DB, #3B82F6)' }}
          >
            <Plus className="w-4 h-4" />
            添加订单
          </button>
        </div>

        <div>
          <h2 className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">
            订单列表 {displayOrders.length > 0 ? `· ${displayOrders.length} 笔` : ''}
          </h2>
          {ordersLoading ? (
            <div className="text-center py-4 text-gray-400 text-sm">加载中...</div>
          ) : displayOrders.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-2xl shadow-sm">
              <TrendingUp className="w-10 h-10 text-gray-200 mx-auto mb-2" />
              <div className="text-gray-400 text-sm">暂无融资订单</div>
            </div>
          ) : (
            <div className="space-y-3">
              {displayOrders.map((order: any) => {
                const totalPaid = (interestPaymentSummary as any)?.[order.id] ?? 0;
                return (
                  <FinanceOrderCard
                    key={order.id}
                    order={order}
                    livePrices={livePrices}
                cnyRate={cnyRate}
                    totalPaid={totalPaid}
                    openedPaymentList={showPaymentPanel === order.id ? openedPaymentList : []}
                    currentUser={currentUser}
                    isAdmin={isAdminUser}
                    realMembers={realMembers}
                    ledgerId={ledgerId}
                    activeUserTab={activeUserTab}
                    showPaymentPanel={showPaymentPanel}
                    setShowPaymentPanel={setShowPaymentPanel}
                    paymentForm={paymentForm}
                    setPaymentForm={setPaymentForm}
                    showPaymentDatePicker={showPaymentDatePicker}
                    setShowPaymentDatePicker={setShowPaymentDatePicker}
                    handleAddPayment={handleAddPayment}
                    deletePaymentMutation={deletePaymentMutation}
                    addPaymentMutation={addPaymentMutation}
                    updateMutation={updateMutation}
                    openEdit={openEdit}
                    setConfirmDeleteId={setConfirmDeleteId}
                    getPaymentLabel={getPaymentLabel}
                    showParticipantsPanel={showParticipantsPanel}
                    handleOpenParticipants={handleOpenParticipants}
                    handleAddParticipant={handleAddParticipant}
                    handleSaveParticipants={handleSaveParticipants}
                    handleRemoveSaved={handleRemoveSaved}
                    savedParticipants={savedParticipants}
                    participantsList={participantsList}
                    setParticipantsList={setParticipantsList}
                    ledgerMembers={ledgerMembers}
                    participantsLoading={participantsLoading}
                    saveParticipantsMutation={saveParticipantsMutation}
                    ROLE_OPTIONS={ROLE_OPTIONS}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <div className="bg-white w-full max-w-lg rounded-t-3xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="flex-shrink-0 bg-white px-5 py-4 border-b border-gray-100 flex items-center justify-between rounded-t-3xl">
              <h3 className="text-base font-semibold" style={{ color: '#1A2340' }}>
                {editingOrder ? '编辑融资订单' : '添加融资订单'}
              </h3>
              <button
                onClick={closeForm}
                className="p-2 rounded-full hover:bg-gray-100 text-gray-400 text-lg leading-none"
              >
                ×
              </button>
            </div>

            <div className="px-5 py-4 space-y-5 overflow-y-auto overflow-x-hidden flex-1">

              {/* 资产类型 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">类型<span className="ml-1.5 text-xs text-gray-400 font-normal">可选，单选</span></label>
                <div className="flex gap-2">
                  {([{ value: 'stock', label: '股票' }, { value: 'crypto', label: '数字币' }] as const).map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFormData(d => ({ ...d, assetType: d.assetType === opt.value ? '' : opt.value }))}
                      className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
                      style={
                        formData.assetType === opt.value
                          ? { background: 'linear-gradient(135deg, #1A56DB, #3B82F6)', color: '#fff' }
                          : { backgroundColor: '#F3F4F6', color: '#6B7280' }
                      }
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 帽檐标签（可添加多个） */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">帽檐标签<span className="ml-1.5 text-xs text-gray-400 font-normal">可选，可添加多个</span></label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {formData.tags.map((tag, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium" style={{ backgroundColor: '#E8F0FE', color: '#1A56DB' }}>
                      {tag}
                      <button type="button" onClick={() => setFormData(d => ({ ...d, tags: d.tags.filter((_, i) => i !== idx) }))} className="text-blue-400 hover:text-red-500 text-sm leading-none">&times;</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && tagInput.trim()) {
                        e.preventDefault();
                        if (!formData.tags.includes(tagInput.trim())) {
                          setFormData(d => ({ ...d, tags: [...d.tags, tagInput.trim()] }));
                        }
                        setTagInput('');
                      }
                    }}
                    placeholder="输入标签名称，按回车添加"
                    className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
                        setFormData(d => ({ ...d, tags: [...d.tags, tagInput.trim()] }));
                      }
                      setTagInput('');
                    }}
                    className="px-4 py-2.5 rounded-xl text-sm font-medium text-white"
                    style={{ background: 'linear-gradient(135deg, #1A56DB, #3B82F6)' }}
                  >
                    添加
                  </button>
                </div>
              </div>

              {/* 用户 + 币种 同一行 */}
              <div className="flex gap-3 items-start">
              {/* 选择用户 */}
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-600 mb-2">
                  用户 <span className="text-red-400 ml-0.5">*</span>
                </label>
                <div className="relative">
                  {selectedUser ? (
                    <div
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-blue-300 bg-blue-50 cursor-pointer"
                      onClick={() => { setShowUserDropdown(true); setUserSearchText(''); }}
                    >
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, #1A56DB, #3B82F6)' }}
                      >
                        {(selectedUser.nickname || selectedUser.username || '?')[0].toUpperCase()}
                      </div>
                      <span className="text-sm font-medium flex-1" style={{ color: '#1A2340' }}>
                        {selectedUser.username}{selectedUser.realName && selectedUser.realName !== selectedUser.username ? ` (${selectedUser.realName})` : ''}
                      </span>
                      <button
                        onClick={e => { e.stopPropagation(); setSelectedUserId(null); setUserSearchText(''); }}
                        className="text-gray-400 hover:text-gray-600 text-base leading-none px-1"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={userSearchText}
                      onChange={e => { setUserSearchText(e.target.value); setShowUserDropdown(true); }}
                      onFocus={() => setShowUserDropdown(true)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                      placeholder="搜索或选择用户..."
                      style={{ display: 'block', boxSizing: 'border-box' }}
                    />
                  )}
                  {showUserDropdown && !selectedUser && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setShowUserDropdown(false)}
                      />
                      <div
                        className="absolute top-full left-0 right-0 z-20 mt-1 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden"
                        style={{ maxHeight: 200, overflowY: 'auto' }}
                      >
                        {filteredMembers.length === 0 ? (
                          <div className="px-4 py-3 text-sm text-gray-400 text-center">无匹配用户</div>
                        ) : filteredMembers.map((m: any) => (
                          <button
                            key={m.userId}
                            onClick={() => { setSelectedUserId(m.userId); setUserSearchText(m.username || ''); setShowUserDropdown(false); }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 text-left"
                          >
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                              style={{ background: 'linear-gradient(135deg, #1A56DB, #3B82F6)' }}
                            >
                              {(m.nickname || m.username || '?')[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate" style={{ color: '#1A2340' }}>
                                {m.username}{m.realName && m.realName !== m.username ? ` (${m.realName})` : ''}
                              </div>
                              <div className="text-xs text-gray-400">{m.role}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* 币种下拉 */}
              <div style={{ width: '120px' }}>
                <label className="block text-sm font-medium text-gray-600 mb-2">币种 <span className="text-red-400 ml-0.5">*</span></label>
                <select
                  value={formData.coin}
                  onChange={e => setFormData(d => ({ ...d, coin: e.target.value as typeof d.coin }))}
                  className="w-full px-3 py-3 rounded-xl border border-gray-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-200 appearance-none"
                  style={{ backgroundColor: '#fff', color: COIN_COLORS[formData.coin as keyof typeof COIN_COLORS] || '#1A2340' }}
                >
                  {['CNY', ...COIN_OPTIONS.filter(c => c !== 'CNY')].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              </div>

              {/* 融资金额 / 买入价格 / 买入数量 三字段联动 */}
              <div className="rounded-2xl border border-gray-200" style={{ overflow: 'visible' }}>
                <div className="px-4 pt-3 pb-1">
                  <span className="text-xs text-gray-400">输入任意两个，第三个自动计算 · 融资金额 = 买入价格 × 币数</span>
                </div>
                {/* 融资金额 */}
                <div className="px-4 py-3 border-b border-gray-100">
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">融资金额 ({formData.coin || 'USDT'})</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={formData.amount}
                    onChange={e => setFormData(d => ({ ...d, amount: e.target.value }))}
                    onBlur={e => {
                      const amount = e.target.value;
                      setFormData(d => {
                        const price = parseFloat(d.buyPrice);
                        const qty = parseFloat(d.buyQuantity);
                        const amt = parseFloat(amount);
                        if (!amount || isNaN(amt) || amt <= 0) return d;
                        // 如果买入价已有，自动计算币数
                        if (!isNaN(price) && price > 0 && !d.buyQuantity) {
                          const calcQty = amt / price;
                          return { ...d, buyQuantity: INTEGER_COINS.has(d.coin) ? String(Math.round(calcQty)) : parseFloat(calcQty.toFixed(6)).toString() };
                        }
                        // 如果币数已有，自动计算买入价
                        if (!isNaN(qty) && qty > 0 && !d.buyPrice) {
                          return { ...d, buyPrice: (amt / qty).toFixed(2) };
                        }
                        return d;
                      });
                    }}
                    className="w-full bg-transparent text-base focus:outline-none"
                    placeholder="如：100000"
                  />
                </div>
                {/* 买入价格 */}
                <div className="px-4 py-3 border-b border-gray-100">
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">买入价格 (USD/枚)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={formData.buyPrice}
                    onChange={e => setFormData(d => ({ ...d, buyPrice: e.target.value }))}
                    onBlur={e => {
                      const price = e.target.value;
                      setFormData(d => {
                        const qty = parseFloat(d.buyQuantity);
                        const amt = parseFloat(d.amount);
                        const p = parseFloat(price);
                        if (!price || isNaN(p) || p <= 0) return d;
                        // 如果币数已有，自动计算融资金额
                        if (!isNaN(qty) && qty > 0 && !d.amount) {
                          return { ...d, amount: (p * qty).toFixed(2) };
                        }
                        // 如果融资金额已有，自动计算币数
                        if (!isNaN(amt) && amt > 0 && !d.buyQuantity) {
                          const calcQty = amt / p;
                          return { ...d, buyQuantity: INTEGER_COINS.has(d.coin) ? String(Math.round(calcQty)) : parseFloat(calcQty.toFixed(6)).toString() };
                        }
                        return d;
                      });
                    }}
                    className="w-full bg-transparent text-base focus:outline-none"
                    placeholder="如：95000"
                    step="any"
                  />
                </div>

                {/* 币数 */}
                <div className="px-4 py-3">
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">币数 ({formData.coin})</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={formData.buyQuantity}
                    onChange={e => setFormData(d => ({ ...d, buyQuantity: e.target.value }))}
                    onBlur={e => {
                      const qty = e.target.value;
                      setFormData(d => {
                        const price = parseFloat(d.buyPrice);
                        const amt = parseFloat(d.amount);
                        const q = parseFloat(qty);
                        if (!qty || isNaN(q) || q <= 0) return d;
                        // 如果买入价已有，自动计算融资金额
                        if (!isNaN(price) && price > 0 && !d.amount) {
                          return { ...d, amount: (price * q).toFixed(2) };
                        }
                        // 如果融资金额已有，自动计算买入价（保留 6 位小数减少精度丢失）
                        if (!isNaN(amt) && amt > 0 && !d.buyPrice) {
                          return { ...d, buyPrice: (amt / q).toFixed(6) };
                        }
                        return d;
                      });
                    }}
                    className="w-full bg-transparent text-base focus:outline-none"
                    placeholder="如：1.05"
                  />
                </div>
              </div>

              {/* 买入日期 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">买入日期</label>
                <button
                  onClick={() => setShowBuyDatePicker(v => !v)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base text-left focus:outline-none"
                  style={{ backgroundColor: '#fff', color: formData.buyDate ? '#1A2340' : '#9CA3AF', display: 'block', boxSizing: 'border-box' }}
                >
                  {formData.buyDate || '点击选择买入日期'}
                </button>
                {showBuyDatePicker && (
                  <div className="mt-2">
                    <DatePicker value={formData.buyDate} onChange={v => { setFormData(d => ({ ...d, buyDate: v })); setShowBuyDatePicker(false); }} />
                  </div>
                )}
              </div>



              {/* 存放账号 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">存放账号</label>
                <input
                  type="text"
                  value={formData.storageAccount}
                  onChange={e => setFormData(d => ({ ...d, storageAccount: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="填写存放的交易所或钱包账号"
                  style={{ display: 'block', boxSizing: 'border-box' }}
                />
              </div>

              {/* 融资类型 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">融资类型</label>
                <div className="flex gap-3">
                  {(['保本分成', '自负盈亏'] as const).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setFormData(d => ({ ...d, financeType: type }))}
                      className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition-colors ${
                        formData.financeType === type
                          ? type === '保本分成'
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'bg-orange-500 border-orange-500 text-white'
                          : 'bg-white border-gray-200 text-gray-500'
                      }`}
                    >
                      {type === '保本分成' ? '保本分成（50%）' : '自负盈亏（100%）'}
                    </button>
                  ))}
                </div>
              </div>

              {/* 担保物（多笔） */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-600">担保物</label>
                  <button
                    type="button"
                    onClick={() => setFormData(d => ({ ...d, collateralAssets: [...d.collateralAssets, { coin: 'BTC', qty: '' }] }))}
                    className="flex items-center gap-1 text-xs text-blue-600 font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" /> 添加担保物
                  </button>
                </div>
                {formData.collateralAssets.length === 0 && (
                  <div className="text-xs text-gray-400 py-2 text-center border border-dashed border-gray-200 rounded-xl">暂无担保物，点击上方添加</div>
                )}
                <div className="space-y-2">
                  {formData.collateralAssets.map((item, idx) => (
                    <div key={idx} className="rounded-xl border border-gray-200 overflow-hidden">
                      <div className="px-4 pt-3 pb-2">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-gray-400">担保币种 #{idx + 1}</span>
                          <button
                            type="button"
                            onClick={() => setFormData(d => ({ ...d, collateralAssets: d.collateralAssets.filter((_, i) => i !== idx) }))}
                            className="text-red-400 text-xs"
                          >删除</button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {COIN_OPTIONS.map(c => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setFormData(d => {
                                const arr = [...d.collateralAssets];
                                arr[idx] = { ...arr[idx], coin: c };
                                return { ...d, collateralAssets: arr };
                              })}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                                item.coin === c ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                              }`}
                            >{c}</button>
                          ))}
                        </div>
                      </div>
                      <div className="px-4 py-3 border-t border-gray-100">
                        <span className="text-xs text-gray-400 block mb-1.5">担保数量 ({item.coin})</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={item.qty}
                          onChange={e => setFormData(d => {
                            const arr = [...d.collateralAssets];
                            arr[idx] = { ...arr[idx], qty: e.target.value };
                            return { ...d, collateralAssets: arr };
                          })}
                          className="w-full bg-transparent text-base focus:outline-none"
                          placeholder="如：12"
                        />
                      </div>
                      <CollateralValueDisplay coin={item.coin} qty={item.qty} ledgerId={ledgerId} />
                    </div>
                  ))}
                </div>
              </div>

              {/* 外借资金 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-600">外借资金</label>
                  {formData.lentOutAssets.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => setFormData(d => ({ ...d, lentOutAssets: [{ coin: 'USDT', qty: '' }] }))}
                      className="flex items-center gap-1 text-xs text-orange-600 font-medium"
                    >
                      <Plus className="w-3.5 h-3.5" /> 添加外借资金
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setFormData(d => ({ ...d, lentOutAssets: [...d.lentOutAssets, { coin: 'USDT', qty: '' }] }))}
                      className="flex items-center gap-1 text-xs text-orange-600 font-medium"
                    >
                      <Plus className="w-3.5 h-3.5" /> 添加
                    </button>
                  )}
                </div>
                {formData.lentOutAssets.length === 0 && (
                  <div className="text-xs text-gray-400 py-2 text-center border border-dashed border-orange-200 rounded-xl">无外借资金（如有借出资金请添加）</div>
                )}
                <div className="space-y-2">
                  {formData.lentOutAssets.map((item, idx) => (
                    <div key={idx} className="rounded-xl border border-orange-200 overflow-hidden">
                      <div className="px-4 pt-3 pb-2">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-orange-500">外借币种 #{idx + 1}</span>
                          <button
                            type="button"
                            onClick={() => setFormData(d => ({ ...d, lentOutAssets: d.lentOutAssets.filter((_, i) => i !== idx) }))}
                            className="text-red-400 text-xs"
                          >删除</button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {COIN_OPTIONS.map(c => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setFormData(d => {
                                const arr = [...d.lentOutAssets];
                                arr[idx] = { ...arr[idx], coin: c };
                                return { ...d, lentOutAssets: arr };
                              })}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                                item.coin === c ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'
                              }`}
                            >{c}</button>
                          ))}
                        </div>
                      </div>
                      <div className="px-4 py-3 border-t border-orange-100">
                        <span className="text-xs text-orange-400 block mb-1.5">外借金额 ({item.coin})</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={item.qty}
                          onChange={e => setFormData(d => {
                            const arr = [...d.lentOutAssets];
                            arr[idx] = { ...arr[idx], qty: e.target.value };
                            return { ...d, lentOutAssets: arr };
                          })}
                          className="w-full bg-transparent text-base focus:outline-none"
                          placeholder="如：50000"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-xs text-gray-400 shrink-0">利息约定</span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>

              {/* 计息基数 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  计息基数
                  <span className="ml-1.5 text-xs text-gray-400 font-normal">利息计算的本金基数</span>
                </label>
                <div className="flex gap-2">
                  <div className="flex rounded-xl border border-gray-200 overflow-hidden shrink-0">
                    <button
                      type="button"
                      onClick={() => setFormData(d => ({ ...d, interestBaseCurrency: 'USDT' }))}
                      className={`px-3 py-3 text-sm font-medium transition-colors ${
                        formData.interestBaseCurrency === 'USDT'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-500'
                      }`}
                    >USDT</button>
                    <button
                      type="button"
                      onClick={() => setFormData(d => ({ ...d, interestBaseCurrency: 'CNY' }))}
                      className={`px-3 py-3 text-sm font-medium transition-colors ${
                        formData.interestBaseCurrency === 'CNY'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-500'
                      }`}
                    >人民币</button>
                  </div>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={formData.interestBase}
                    onChange={e => setFormData(d => ({ ...d, interestBase: e.target.value }))}
                    className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-200"
                    placeholder={formData.interestBaseCurrency === 'CNY' ? '如：800000' : '如：120000'}
                    style={{ display: 'block', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* 计息开始日期 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">
                  计息开始日期
                  <span className="ml-1.5 text-xs text-gray-400 font-normal">利息从此日开始累计</span>
                </label>
                <button
                  onClick={() => setShowInterestDatePicker(v => !v)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base text-left focus:outline-none"
                  style={{ backgroundColor: '#fff', color: formData.interestStartDate ? '#1A2340' : '#9CA3AF', display: 'block', boxSizing: 'border-box' }}
                >
                  {formData.interestStartDate || '点击选择开始日期'}
                </button>
                {showInterestDatePicker && (
                  <div className="mt-2">
                    <DatePicker value={formData.interestStartDate} onChange={v => { setFormData(d => ({ ...d, interestStartDate: v })); setShowInterestDatePicker(false); }} />
                  </div>
                )}
              </div>

              {/* 约定年化利息 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">约定年化利息（%）</label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setFormData(d => ({ ...d, interestRateSign: d.interestRateSign === '+' ? '-' : '+' }))}
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold flex-shrink-0 transition-all"
                    style={
                      formData.interestRateSign === '-'
                        ? { backgroundColor: '#FEE2E2', color: '#EF4444', border: '2px solid #EF4444' }
                        : { backgroundColor: '#DCFCE7', color: '#16A34A', border: '2px solid #16A34A' }
                    }
                  >
                    {formData.interestRateSign}
                  </button>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={formData.interestRateAnnual}
                    onChange={e => setFormData(d => ({ ...d, interestRateAnnual: e.target.value }))}
                    className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-200"
                    placeholder="如：8.5"
                    style={{ display: 'block', boxSizing: 'border-box' }}
                  />
                </div>
                <div
                  className="mt-1.5 text-xs"
                  style={{ color: formData.interestRateSign === '-' ? '#EF4444' : '#16A34A' }}
                >
                  {formData.interestRateSign === '-' ? '负值：用户需付出利息（融资成本）' : '正值：用户可收取利息（融资收益）'}
                </div>
              </div>

              {/* 利息支付方式 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">利息支付方式</label>
                <div className="grid grid-cols-2 gap-2">
                  {INTEREST_PAYMENT_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setFormData(d => ({ ...d, interestPaymentType: d.interestPaymentType === opt.value ? '' : opt.value }))}
                      className="py-2.5 rounded-xl text-sm font-medium transition-all"
                      style={
                        formData.interestPaymentType === opt.value
                          ? { background: 'linear-gradient(135deg, #1A56DB, #3B82F6)', color: '#fff' }
                          : { backgroundColor: '#F3F4F6', color: '#6B7280' }
                      }
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 收益分成开关 */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-600">收益分成</label>
                  <button
                    type="button"
                    onClick={() => setFormData(d => ({ ...d, showProfitShare: !d.showProfitShare }))}
                    className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                      formData.showProfitShare ? 'bg-blue-500' : 'bg-gray-200'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                      formData.showProfitShare ? 'translate-x-5' : 'translate-x-1'
                    }`} />
                  </button>
                </div>
                {formData.showProfitShare && (
                  <div className="mt-3">
                    <label className="block text-sm font-medium text-gray-600 mb-1">佣金分成说明</label>
                    <input
                      type="text"
                      value={formData.commissionShare}
                      onChange={e => setFormData(d => ({ ...d, commissionShare: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                      placeholder="例如：年化收益的20%"
                      style={{ display: 'block', boxSizing: 'border-box' }}
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-xs text-gray-400 shrink-0">备注</span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>

              {/* 公开备注 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  公开备注
                  <span className="ml-1.5 text-xs text-green-500 font-normal">对外可见</span>
                </label>
                <textarea
                  value={formData.publicNote}
                  onChange={e => setFormData(d => ({ ...d, publicNote: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  rows={2}
                  placeholder="填写对外可见的说明或备注"
                  style={{ display: 'block', boxSizing: 'border-box', resize: 'none' }}
                />
              </div>

              {/* 内部备注 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  内部备注
                  <span className="ml-1.5 text-xs text-gray-400 font-normal">仅管理员可见</span>
                </label>
                <textarea
                  value={formData.adminNote}
                  onChange={e => setFormData(d => ({ ...d, adminNote: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  rows={2}
                  placeholder="内部管理备注"
                  style={{ display: 'block', boxSizing: 'border-box', resize: 'none' }}
                />
              </div>

              {/* 字段开关面板 */}
              {showForm && (
                <div className="px-5 pt-4">
                  <div className="rounded-xl border border-gray-100 overflow-hidden" style={{ backgroundColor: '#FAFBFF' }}>
                    {/* 左栏字段 */}
                    <div className="px-4 pt-3 pb-1">
                      <div className="text-xs font-medium text-blue-500 mb-2">左栏：融资资产</div>
                      <div className="space-y-2">
                        {[
                          { key: 'buyPrice', label: '买入币价' },
                          { key: 'buyValue', label: '买入价值' },
                          { key: 'interestBase', label: '计息基数' },
                          { key: 'buyDate', label: '开仓时间' },
                          { key: 'todayPrice', label: '今日币价' },
                          { key: 'holdDuration', label: '持有时长' },
                          { key: 'orderNo', label: '订单编号' },
                          { key: 'interestPaymentType', label: '付息方式' },
                          { key: 'aiIcon', label: 'AI图标（融资资产右上角）' },
                          { key: 'assetType', label: '资产类型（股票/数字币）' },
                          { key: 'showOwnerName', label: '显示帽檐标签' },
                        ].map(({ key, label }) => (
                          <div key={key} className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">{label}</span>
                            <button
                              type="button"
                              onClick={() => setDisplayConfig(c => ({ ...c, [key]: !c[key] }))}
                              className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                                displayConfig[key] ? 'bg-blue-500' : 'bg-gray-200'
                              }`}
                            >
                              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                                displayConfig[key] ? 'translate-x-5' : 'translate-x-1'
                              }`} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="mx-4 h-px bg-gray-100 my-2" />
                    {/* 右栏上半：待付利息区 */}
                    <div className="px-4 pb-2">
                      <div className="text-xs font-medium text-blue-500 mb-2">右栏：待付利息区</div>
                      <div className="space-y-2">
                        {[
                          { key: 'accruedInterest', label: '待付利息（标题+大数字）' },
                          { key: 'paidInterest', label: '已付利息' },
                          { key: 'interestStartDate', label: '计息日期' },
                          { key: 'collateralCoin', label: '担保货币' },
                          { key: 'collateralValue', label: '担保价值' },
                          { key: 'collateral', label: '担保缺口' },
                          { key: 'marginRate', label: '保证金率' },
                        ].map(({ key, label }) => (
                          <div key={key}>
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-600">{label}</span>
                              <button
                                type="button"
                                onClick={() => setDisplayConfig(c => ({ ...c, [key]: !c[key] }))}
                                className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                                  displayConfig[key] ? 'bg-blue-500' : 'bg-gray-200'
                                }`}
                              >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                                  displayConfig[key] ? 'translate-x-5' : 'translate-x-1'
                                }`} />
                              </button>
                            </div>
                            {/* 保证金率预警阈值输入框（仅在保证金率开关打开时显示） */}
                            {key === 'marginRate' && displayConfig.marginRate && (
                              <div className="mt-1.5 flex items-center gap-2 pl-1">
                                <span className="text-xs text-gray-400 shrink-0">低于</span>
                                <input
                                  type="number"
                                  min="0"
                                  max="200"
                                  step="1"
                                  value={marginAlertThreshold}
                                  onChange={e => setMarginAlertThreshold(e.target.value)}
                                  placeholder="如：80"
                                  className="w-16 text-xs text-center border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-orange-400"
                                  style={{ color: '#D97706' }}
                                />
                                <span className="text-xs text-gray-400 shrink-0">% 时预警</span>
                                {marginAlertThreshold && parseFloat(marginAlertThreshold) > 0 && (
                                  <span className="text-xs text-orange-500 font-medium">已设置</span>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mx-4 h-px bg-gray-100 my-2" />
                  {/* 右栏下半：收益分成区 */}
                  <div className="px-4 pb-3">
                    <div className="text-xs font-medium text-blue-500 mb-2">右栏下半：收益分成区</div>
                    <div className="space-y-2">
                      {[
                        { key: 'profitShare', label: '收益分成（开启后显示下半区）' },
                        { key: 'commissionShare', label: '佣金分成' },
                      ].map(({ key, label }) => (
                        <div key={key} className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">{label}</span>
                          <button
                            type="button"
                            onClick={() => setDisplayConfig(c => ({ ...c, [key]: !c[key] }))}
                            className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                              displayConfig[key] ? 'bg-blue-500' : 'bg-gray-200'
                            }`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                              displayConfig[key] ? 'translate-x-5' : 'translate-x-1'
                            }`} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 实时预览卡片 - 两栏大数字样式（与前端订单卡片一致） */}
              {showForm && (
                <div>
                  <div className="text-xs font-medium text-gray-400 mb-2">实时预览</div>
                  <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#E8EFFF', background: '#FFFFFF' }}>
                  {/* 顶部色条 */}
                  <div className="h-1" style={{ background: `linear-gradient(90deg, ${COIN_COLORS[formData.coin] || '#3B82F6'}, ${(COIN_COLORS[formData.coin] || '#3B82F6')}55)` }} />
                  {/* 帽檐区域：始终显示 */}
                  <div className="flex items-center gap-1.5 px-4 py-1.5 flex-wrap" style={{ borderBottom: '1px solid #F3F4F6', minHeight: '28px', backgroundColor: '#FAFBFF' }}>
                    {displayConfig.assetType && formData.assetType && (
                      <span className="text-[10px] px-1.5 py-0.5 font-medium" style={{ border: '1px solid #D1D5DB', borderRadius: '3px', color: '#1A1A1A' }}>
                        {formData.assetType === 'stock' ? '股票' : formData.assetType === 'crypto' ? '数字币' : formData.assetType}
                      </span>
                    )}
                    {formData.tags.map((tag, idx) => (
                      <span key={idx} className="text-[10px] px-1.5 py-0.5 font-medium" style={{ border: '1px solid #D1D5DB', borderRadius: '3px', color: '#1A1A1A' }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                   {/* 两栏主体 */}
                   <div className="flex">
                    {/* 左栏：融资资产 */}
                    <div className="flex-1 p-4 pr-3">
                      <div className="flex items-center gap-0.5 mb-0.5">
                        <span className="text-[10px] font-medium" style={{ color: '#3B82F6' }}>融资资产</span>
                        <span className="text-[10px] text-gray-400">({formData.financeType === '自负盈亏' ? '自负盈亏 100%部分' : '保本分成 50%部分'})</span>
                        {displayConfig.aiIcon && <span className="text-[10px] px-1 rounded" style={{ backgroundColor: '#EEF2FF', color: '#6366F1' }}>AI</span>}
                      </div>
                      <div className="min-h-7 flex flex-col justify-center mt-0.5">
                        <div className="flex items-baseline gap-1 flex-wrap">
                          <span className="text-xl font-bold tabular-nums leading-tight" style={{ color: '#1A2340' }}>
                            {formData.buyQuantity !== '' && formData.buyQuantity !== undefined ? parseFloat(parseFloat(formData.buyQuantity).toFixed(6)).toString() : '0'}
                          </span>
                          <span className="text-xs font-semibold" style={{ color: '#1A2340' }}>{formData.coin}</span>
                        </div>
                        {formLivePrices[formData.coin] && formData.buyQuantity && (
                          <div className="text-xs font-medium leading-tight" style={{ color: '#4B5563' }}>
                            ≈{(formLivePrices[formData.coin] * parseFloat(formData.buyQuantity)).toLocaleString(undefined, { maximumFractionDigits: 2 })} U
                          </div>
                        )}
                      </div>
                      <div className="space-y-0.5 text-xs mt-1">
                        {displayConfig.buyPrice && formData.buyPrice && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 shrink-0">买入币价</span>
                            <span className="font-medium" style={{ color: '#4B5563' }}>{parseFloat(formData.buyPrice).toLocaleString()} U</span>
                          </div>
                        )}
                        {displayConfig.buyValue && formData.buyPrice && formData.buyQuantity && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 shrink-0">买入价值</span>
                            <span className="font-medium" style={{ color: '#4B5563' }}>{(parseFloat(formData.buyPrice) * parseFloat(formData.buyQuantity)).toLocaleString(undefined, { maximumFractionDigits: 2 })} U</span>
                          </div>
                        )}
                        {displayConfig.interestBase && formData.interestBase && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 shrink-0">计息基数</span>
                            <span className="font-medium" style={{ color: '#4B5563' }}>{parseFloat(formData.interestBase).toLocaleString(undefined, { maximumFractionDigits: 2 })} {formData.interestBaseCurrency === 'CNY' ? '元' : 'U'}</span>
                          </div>
                        )}
                        {displayConfig.todayPrice && formData.coin !== 'CNY' && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400 shrink-0">当前币价</span>
                          <span className="font-medium" style={{ color: (() => { const lp = formLivePrices[formData.coin]; const bp = formData.buyPrice ? parseFloat(formData.buyPrice) : null; if (lp && bp) { return lp > bp ? '#DC2626' : lp < bp ? '#16A34A' : '#4B5563'; } return '#4B5563'; })() }}>
                            {formLivePrices[formData.coin] ? formLivePrices[formData.coin].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' U' : '获取中...'}
                          </span>
                        </div>
                        )}
                        {displayConfig.buyDate && formData.buyDate && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 shrink-0">开仓时间</span>
                            <span className="font-medium" style={{ color: '#4B5563' }}>{formData.buyDate}</span>
                          </div>
                        )}

                        {displayConfig.orderNo && editingOrder?.order_no && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 shrink-0">订单编号</span>
                            <span className="font-medium" style={{ color: '#4B5563' }}>{editingOrder.order_no}</span>
                          </div>
                        )}
                        {displayConfig.interestPaymentType && formData.interestPaymentType && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 shrink-0">付息方式</span>
                            <span className="font-medium" style={{ color: '#4B5563' }}>{formData.interestPaymentType === 'monthly_prepaid' ? '月付先付' : formData.interestPaymentType === 'monthly_postpaid' ? '月付后付' : formData.interestPaymentType === 'end_postpaid' ? '结束后付' : formData.interestPaymentType === 'quarterly' ? '季付' : formData.interestPaymentType === 'maturity' ? '到期付' : formData.interestPaymentType}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {/* 中间分隔线 */}
                    <div className="w-px my-3" style={{ backgroundColor: '#E8EFFF' }} />
                     {/* 右栏：待结利息 */}
                     <div className="p-4 pl-3 flex flex-col shrink-0" style={{ width: 'auto', minWidth: '160px', maxWidth: '200px' }}>
                      {(() => {
                        const hasInterestData = formData.interestRateAnnual && formData.interestBase && formData.interestStartDate;
                        const hasCollateralData = formData.collateralAssets.filter(a => a.coin && a.qty !== '').length > 0;
                        const hasAnyRightContent = (displayConfig.accruedInterest && hasInterestData) || (displayConfig.collateralCoin && hasCollateralData) || (displayConfig.collateralValue && hasCollateralData) || (displayConfig.profitShare && formData.showProfitShare);
                        if (!hasAnyRightContent) {
                          return (
                            <div className="flex items-center justify-center h-full">
                              <span className="text-gray-300 text-xs">填写利息信息后显示</span>
                            </div>
                          );
                        }
                        return (
                          <div>
                            {displayConfig.accruedInterest && hasInterestData && (
                              <>
                                <div className="flex items-center gap-1 mb-0.5" style={{ height: '16px' }}>
                                  <span className="text-[10px]" style={{ color: '#3B82F6' }}>
                                    {parseFloat(formData.interestRateAnnual) < 0 ? '待收利息' : '待付利息'}
                                  </span>
                                  <span className="text-[10px] text-gray-400">(年化 {Math.abs(parseFloat(formData.interestRateAnnual)).toFixed(0)}%)</span>
                                </div>
                                <div className="min-h-7 flex flex-col justify-center mt-0.5">
                                  <div className="flex items-baseline gap-0.5 flex-wrap">
                                    <span className="text-xl font-bold tabular-nums leading-tight" style={{ color: '#1A2340', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                                      {(() => {
                                        const base = parseFloat(formData.interestBase);
                                        const rate = Math.abs(parseFloat(formData.interestRateAnnual)) / 100;
                                        const start = new Date(formData.interestStartDate + 'T00:00:00');
                                        const elapsed = Math.max(0, (Date.now() - start.getTime()) / 1000);
                                        const interest = base * rate / (365 * 24 * 3600) * elapsed;
                                        return (interest > 0 ? '-' : '') + interest.toLocaleString(undefined, { maximumFractionDigits: 2 });
                                      })()}
                                    </span>
                                    <span className="text-sm font-semibold" style={{ color: '#1A2340' }}>USDT</span>
                                  </div>
                                </div>
                              </>
                            )}
                            <div className="space-y-0.5 text-xs mt-1">
                            {displayConfig.paidInterest && hasInterestData && (() => {
                              const totalPaid = editingOrder ? ((interestPaymentSummary as any)?.[editingOrder.id] ?? 0) : 0;
                              return (
                                <div className="flex items-center justify-between">
                                  <span className="text-gray-400 shrink-0">已付利息</span>
                                  <span className="font-medium" style={{ color: '#4B5563' }}>{totalPaid.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT</span>
                                </div>
                              );
                            })()}
                            {displayConfig.interestStartDate && formData.interestStartDate && (
                              <div className="flex items-center justify-between">
                                <span className="text-gray-400 shrink-0">计息日期</span>
                                <span className="font-medium" style={{ color: '#4B5563' }}>
                                  {formData.interestStartDate.replace(/^\d{4}-(\d{2})-(\d{2})$/, (_: string, m: string, d: string) => `${parseInt(m)}月${parseInt(d)}日`)}
                                </span>
                              </div>
                            )}
                            {displayConfig.holdDuration && formData.buyDate && (
                              <div className="flex items-center justify-between mt-0.5">
                                <span className="text-gray-400 shrink-0">持有时长</span>
                                <span className="font-medium" style={{ color: '#4B5563' }}>
                                  {(() => {
                                    const elapsed = Date.now() - new Date(formData.buyDate + 'T00:00:00').getTime();
                                    if (elapsed < 0) return '---';
                                    const totalHours = Math.floor(elapsed / (1000 * 60 * 60));
                                    const days = Math.floor(totalHours / 24);
                                    const hours = totalHours % 24;
                                    return days > 0 ? `${days}天 ${hours}小时` : `${hours}小时`;
                                  })()}
                                </span>
                              </div>
                            )}
                            {displayConfig.collateralCoin && (() => {
                              const validAssets = formData.collateralAssets.filter(a => a.coin && a.qty !== '');
                              if (validAssets.length === 0) return null;
                              return (
                                <>
                                  {validAssets.map((a, i) => {
                                    const qty = parseFloat(a.qty || '0');
                                    const price = formLivePrices[a.coin] || 0;
                                    const value = qty * price;
                                    return (
                                      <div key={i}>
                                        <div className="flex items-center justify-between mt-0.5">
                                          <span className="text-gray-400 shrink-0">{validAssets.length > 1 ? `担保物${i+1}` : '担保物'}</span>
                                          <span className="font-medium" style={{ color: '#4B5563' }}>
                                            {qty % 1 === 0 ? qty.toFixed(0) : qty} {a.coin}
                                          </span>
                                        </div>
                                        {price > 0 && (
                                          <div className="flex items-center justify-between">
                                            <span></span>
                                            <span className="font-medium" style={{ color: '#4B5563' }}>
                                              ≈ {value.toLocaleString(undefined, { maximumFractionDigits: 0 })} U
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </>
                              );
                            })()}
                            {displayConfig.collateralValue && formComputedCollateralValue !== null && formData.collateralAssets.filter(a => a.coin && a.qty !== '').length > 0 && (
                              <div className="flex items-center justify-between mt-0.5">
                                <span className="text-gray-400 shrink-0">担保价值{formData.collateralAssets.filter(a => a.coin && a.qty !== '').length > 1 ? '(合计)' : ''}</span>
                                <span className="font-medium" style={{ color: '#4B5563' }}>{formComputedCollateralValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} U</span>
                              </div>
                            )}
                            {displayConfig.collateral && formComputedCollateralValue !== null && formComputedAmount && formComputedAmount > 0 && hasInterestData && (() => {
                              const base = parseFloat(formData.interestBase);
                              const rate = Math.abs(parseFloat(formData.interestRateAnnual)) / 100;
                              const start = new Date(formData.interestStartDate + 'T00:00:00');
                              const elapsed = Math.max(0, (Date.now() - start.getTime()) / 1000);
                              const unpaidInterest = base * rate / (365 * 24 * 3600) * elapsed;
                              const totalPaid = editingOrder ? ((interestPaymentSummary as any)?.[editingOrder.id] ?? 0) : 0;
                              const buyValue = parseFloat(formData.amount || '0');
                              const coinQty = parseFloat(formData.buyQuantity || '0');
                              const coinPrice = formLivePrices[formData.coin] || 0;
                              const marketValue = coinQty * coinPrice;
                              let gap: number | null = null;
                              if (formData.coin === 'USDT') {
                                gap = formComputedCollateralValue - buyValue - unpaidInterest + totalPaid - formComputedLentOutValue;
                              } else if (coinPrice > 0) {
                                gap = marketValue + formComputedCollateralValue - buyValue - unpaidInterest + totalPaid - formComputedLentOutValue;
                              }
                              return gap !== null ? (
                                <div className="flex items-center justify-between mt-0.5">
                                  <span className="text-gray-400 shrink-0">担保缺口</span>
                                  <span className="font-medium" style={{ color: gap >= 0 ? '#4B5563' : '#EF4444' }}>
                                    {gap >= 0 ? '超过100%' : `${gap.toLocaleString(undefined, { maximumFractionDigits: 0 })} U`}
                                  </span>
                                </div>
                              ) : null;
                            })()}
                            {/* 保证金率：担保物当前价値 ÷ 计息基数 x 100% */}
                            {displayConfig.marginRate && formComputedCollateralValue !== null && formComputedCollateralValue > 0 && formData.interestBase && parseFloat(formData.interestBase) > 0 && (() => {
                              const base = parseFloat(formData.interestBase);
                              const previewRate = Math.abs(parseFloat(formData.interestRateAnnual)) / 100;
                              const previewStart = new Date(formData.interestStartDate + 'T00:00:00');
                              const previewElapsed = Math.max(0, (Date.now() - previewStart.getTime()) / 1000);
                              const previewAccrued = base * previewRate / (365 * 24 * 3600) * previewElapsed;
                              const previewTotalPaid = editingOrder ? ((interestPaymentSummary as any)?.[editingOrder.id] ?? 0) : 0;
                              const previewCoinQty = parseFloat(formData.buyQuantity || '0');
                              const previewCoinPrice = formLivePrices[formData.coin] || 0;
                              const previewMarketValue = previewCoinQty * previewCoinPrice;
                              const previewBuyPrice = parseFloat(formData.buyPrice || '0');
                              const previewBuyValue = previewCoinQty > 0 && previewBuyPrice > 0
                                ? previewCoinQty * previewBuyPrice
                                : parseFloat(formData.amount || '0');
                              const previewFloatPnl = formData.coin === 'USDT' ? 0 : (previewCoinPrice > 0 ? previewMarketValue - previewBuyValue : null);
                              const previewEffective = previewFloatPnl !== null
                                ? formComputedCollateralValue + previewFloatPnl - previewAccrued + previewTotalPaid - formComputedLentOutValue
                                : formComputedCollateralValue - previewAccrued + previewTotalPaid - formComputedLentOutValue;
                              const marginRatio = previewEffective / base;
                              const marginColor = marginRatio >= 1 ? '#16A34A' : marginRatio >= 0.5 ? '#D97706' : '#DC2626';
                              const previewAlertThreshold = marginAlertThreshold && parseFloat(marginAlertThreshold) > 0 ? parseFloat(marginAlertThreshold) : null;
                              const previewIsAlerting = previewAlertThreshold !== null && (marginRatio * 100) < previewAlertThreshold;
                              return (
                                <div className="flex items-center justify-between mt-0.5">
                                  <div className="flex items-center gap-1">
                                    <span className="text-gray-400 shrink-0">保证金率</span>
                                    {previewIsAlerting && (
                                      <span className="inline-flex items-center justify-center w-3 h-3 rounded-full text-white text-[7px] font-bold flex-shrink-0" style={{ background: '#EF4444', lineHeight: 1 }}>❗</span>
                                    )}
                                  </div>
                                  <span className="font-bold" style={{ color: previewIsAlerting ? '#EF4444' : marginColor }}>{(marginRatio * 100).toFixed(1)}%{previewIsAlerting ? ' ⚠' : ''}</span>
                                </div>
                              );
                            })()}
                          {/* 收益分成区（右栏下半） */}
                          {displayConfig.profitShare && formData.showProfitShare && (
                            <>
                              <div className="border-t mt-1 pt-1" style={{ borderColor: '#E8EFFF' }}>
                                <div className="h-4 flex items-center" style={{ color: '#3B82F6' }}>
                                  <span className="text-xs font-medium">收益分成</span>
                                </div>
                                {displayConfig.commissionShare && formData.commissionShare && (
                                  <div className="flex items-center justify-between mt-0.5">
                                    <span className="text-gray-400 shrink-0">佣金分成</span>
                                    <span className="font-medium" style={{ color: '#4B5563' }}>{formData.commissionShare}</span>
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                          </div>
                        </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            )}

            </div>

            <div className="sticky bottom-0 bg-white px-5 py-4 border-t border-gray-100">
              <button
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="w-full py-3.5 rounded-xl text-white font-semibold text-base disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #1A56DB, #3B82F6)' }}
              >
                {(createMutation.isPending || updateMutation.isPending) ? '提交中...' : (editingOrder ? '保存修改' : '确认添加')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除二次确认弹窗 */}
      {confirmDeleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={() => setConfirmDeleteId(null)}>
          <div className="bg-white rounded-t-2xl w-full max-w-md px-5 pt-5 pb-8" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
            <div className="text-center mb-5">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
                <Trash2 className="w-6 h-6 text-red-400" />
              </div>
              <div className="text-base font-semibold text-gray-800 mb-1">确认删除订单？</div>
              <div className="text-sm text-gray-400">删除后无法恢复，请谨慎操作</div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 py-3 rounded-xl text-sm font-medium"
                style={{ backgroundColor: '#F3F4F6', color: '#374151' }}
              >
                取消
              </button>
              <button
                onClick={() => { deleteMutation.mutate({ id: confirmDeleteId, ledgerId }); setConfirmDeleteId(null); }}
                disabled={deleteMutation.isPending}
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: '#EF4444' }}
              >
                {deleteMutation.isPending ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
