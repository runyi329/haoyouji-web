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
  if (!qty) return '';
  const num = typeof qty === 'string' ? parseFloat(qty) : qty;
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

// 精确到秒的利息计数器 Hook
function useAccruedInterest(interestBase: string | null, interestRateAnnual: string | null, interestStartDate: string | null) {
  const [accrued, setAccrued] = useState<number>(0);
  const computeAccrued = useCallback(() => {
    const base = parseFloat(interestBase || '0');
    const rate = Math.abs(parseFloat(interestRateAnnual || '0'));
    if (!base || !rate || !interestStartDate) return 0;
    const startTs = new Date(interestStartDate + 'T00:00:00').getTime();
    if (isNaN(startTs)) return 0;
    const elapsedSeconds = Math.max(0, (Date.now() - startTs) / 1000);
    const perSecond = (base * rate / 100) / (365 * 24 * 3600);
    return perSecond * elapsedSeconds;
  }, [interestBase, interestRateAnnual, interestStartDate]);
  useEffect(() => {
    setAccrued(computeAccrued());
    const timer = setInterval(() => setAccrued(computeAccrued()), 1000);
    return () => clearInterval(timer);
  }, [computeAccrued]);
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
}

function FinanceOrderCard({
  order,
  livePrices,
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
}: FinanceOrderCardProps) {
  // 每张卡片独立调用 useAccruedInterest（Hook 必须在组件顶层）
  const accrued = useAccruedInterest(
    order.status === 'active' ? order.interest_base : null,
    order.status === 'active' ? order.interest_rate_annual : null,
    order.status === 'active' ? order.interest_start_date : null
  );

  const rateStr = String(order.interest_rate_annual || '');
  const isNegRate = rateStr.startsWith('-');
  const rateAbs = isNegRate ? rateStr.slice(1) : rateStr;
  const rateSign = isNegRate ? '-' : '+';
  const isSettled = String(order.admin_note || '').includes('[已结清]');
  const coinColor = COIN_COLORS[order.coin as CoinType] || '#6B7280';

  // 计算担保物数组
  let collateralAssets: { coin: string; qty: string }[] = [];
  try { if (order.collateral_assets) collateralAssets = JSON.parse(order.collateral_assets); } catch(e) {}
  if (collateralAssets.length === 0 && order.collateral_coin && order.collateral_qty) {
    collateralAssets = [{ coin: order.collateral_coin, qty: String(parseFloat(order.collateral_qty)) }];
  }

  // 左栏数值计算
  const qty = parseFloat(order.buy_quantity || '0');
  const price = parseFloat(order.buy_price || '0');
  const totalU = qty > 0 && price > 0 ? qty * price : parseFloat(order.amount || '0');
  const baseCur = order.interest_base_currency || 'USDT';
  const interestUnit = baseCur === 'CNY' ? '元' : 'U';
  // 利率货币（与计息基数货币一致）
  const rateCur = baseCur;
  const altUnit = rateCur === 'CNY' ? 'U' : '元';
  // 折算：CNY 基数 → U 显示，或 U 基数 → 元 显示（按 1U=7元）
  const convertAccrued = (val: number): number => val; // 同货币无需折算
  const convertAlt = (val: number): number => rateCur === 'CNY' ? val / 7 : val * 7;
  const displayAccrued = convertAccrued(accrued);
  const displayPaid = convertAccrued(totalPaid);
  const altAccrued = convertAlt(displayAccrued);
  const altPaid = convertAlt(displayPaid);

  // 持有时长
  const holdDurationLabel = (() => {
    if (!order.buy_date || order.status !== 'active') return null;
    const elapsed = Date.now() - new Date(order.buy_date + 'T00:00:00').getTime();
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
    else {
      const p = livePrices[item.coin];
      if (p) { collateralValue += iq * p; collateralItemValues.push(iq * p); }
      else { collateralItemValues.push(null); collateralValueKnown = false; }
    }
  }

  // 风险敞口计算
  const interestBaseNum = order.interest_base ? Number(order.interest_base) : totalU;
  const liveP = livePrices[order.coin] ?? null;
  const currentValue = liveP !== null ? liveP * qty : null;
  const floatPnl = currentValue !== null ? currentValue - interestBaseNum : null;
  const exposure = floatPnl !== null
    ? collateralValue + floatPnl - accrued + totalPaid
    : collateralValue - accrued + totalPaid;
  const isSufficient = exposure >= 0;

  return (
    <div
      className="bg-white rounded-2xl overflow-hidden relative"
      style={order._fromFunder
        ? { border: '1px solid #86EFAC', boxShadow: '0 1px 6px rgba(34,197,94,0.08)' }
        : { border: '1px solid #E8EDFF', boxShadow: '0 1px 4px rgba(26,35,64,0.05)' }}
    >
      {isSettled && (
        <div
          className="absolute bottom-4 left-4 pointer-events-none select-none"
          style={{ transform: 'rotate(-30deg)', zIndex: 10 }}
        >
          <div style={{ border: '2px solid rgba(220,38,38,0.5)', color: 'rgba(220,38,38,0.5)', borderRadius: '4px', padding: '2px 8px', fontSize: '13px', fontWeight: 700, letterSpacing: '3px', lineHeight: '1.4', whiteSpace: 'nowrap' }}>
            已结清
          </div>
        </div>
      )}

      {/* 卡片顶部：标签行 + 操作按钮 */}
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid #F3F4F6', backgroundColor: order._fromFunder ? '#F0FDF4' : '#FAFBFF' }}>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: coinColor }}>
            {order.coin}
          </span>
          <span className="text-xs text-gray-400">#{order.order_no}</span>
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
        </div>
        <div className="flex items-center gap-0.5">
          <button
            title={isSettled ? '取消已结清标记' : '标记已结清'}
            onClick={() => {
              const note = String(order.admin_note || '');
              const newNote = isSettled ? note.replace('[已结清]', '').trim() : (note ? note + ' [已结清]' : '[已结清]');
              updateMutation.mutate({ id: order.id, ledgerId, adminNote: newNote });
            }}
            className="px-2 py-1 text-xs rounded-lg font-medium transition-colors"
            style={{ backgroundColor: isSettled ? '#FEE2E2' : '#F3F4F6', color: isSettled ? '#DC2626' : '#9CA3AF' }}
          >
            结清
          </button>
          <button onClick={() => openEdit(order)} className="p-1.5 ml-1 text-gray-300 hover:text-blue-500 rounded-lg hover:bg-blue-50 transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setConfirmDeleteId(order.id)} className="p-1.5 ml-2 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 主体：左右两栏布局 */}
      <div className="flex" style={{ minHeight: '100px' }}>

        {/* 左栏：持有资产 */}
        <div className="flex-1 p-4 pr-3">
          <div className="h-5 flex items-center gap-1" style={{ color: '#3B82F6' }}>
            <span className="text-xs font-medium">持有资产</span>
          </div>
          {/* 持币量大数字 */}
          <div className="min-h-9 flex flex-col justify-center">
            <div className="flex items-baseline gap-1 flex-wrap">
              <span className="text-2xl font-bold tabular-nums leading-tight" style={{ color: '#1A2340' }}>
                {qty > 0 ? formatCoinQty(qty, order.coin) : '—'}
              </span>
              <span className="text-xs font-semibold" style={{ color: '#1A2340' }}>{order.coin}</span>
            </div>
            {liveP && qty > 0 && (
              <div className="text-xs font-medium leading-tight" style={{ color: '#4B5563' }}>≈{(qty * liveP).toLocaleString(undefined, { maximumFractionDigits: 2 })} U</div>
            )}
          </div>
          {/* 订单信息列表 */}
          <div className="space-y-0.5 text-xs">
            {price > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">买入币价</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>{price.toLocaleString()} U</span>
              </div>
            )}
            {totalU > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">买入价值</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>{totalU.toLocaleString(undefined, { maximumFractionDigits: 2 })} U</span>
              </div>
            )}
            {order.interest_base && parseFloat(order.interest_base) > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">计息基数</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>
                  {parseFloat(order.interest_base).toLocaleString(undefined, { maximumFractionDigits: 2 })} {interestUnit}
                </span>
              </div>
            )}
            {order.coin !== 'CNY' && order.coin !== 'USDT' && liveP && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">当前币价</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>{liveP.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} U</span>
              </div>
            )}
            {order.buy_date && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">开仓时间</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>{order.buy_date}</span>
              </div>
            )}
            {holdDurationLabel && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">持有时长</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>{holdDurationLabel}</span>
              </div>
            )}
            {order.order_no && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">订单编号</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>{order.order_no}</span>
              </div>
            )}
            {order.interest_payment_type && (
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
        <div className="w-44 p-4 pl-3 flex flex-col" style={{ alignSelf: 'stretch' }}>
          {/* 标题 */}
          <div className="h-5 flex items-center gap-1">
            <span className="text-xs font-medium" style={{ color: '#3B82F6' }}>待结利息</span>
            {rateAbs && <span className="text-xs text-gray-400">(年化 {rateSign}{rateAbs}%)</span>}
          </div>
          {/* 待结利息大数字 */}
          <div className="min-h-9 flex flex-col justify-center">
            <div className="flex items-baseline gap-0.5">
              <span className="text-2xl font-bold tabular-nums leading-tight" style={{ color: '#1A2340', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                {displayAccrued.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-xs font-semibold" style={{ color: '#1A2340' }}>{interestUnit}</span>
            </div>
            <div className="text-xs font-medium leading-tight" style={{ color: '#4B5563' }}>≈{altAccrued.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {altUnit}</div>
          </div>
          {/* 明细行 */}
          <div className="space-y-0.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-gray-400 whitespace-nowrap">已结利息</span>
              <span className="font-medium" style={{ color: '#4B5563' }}>
                {displayPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {interestUnit}
              </span>
            </div>
            {displayPaid > 0 && (
              <div className="flex justify-end">
                <span className="text-gray-400">≈{altPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {altUnit}</span>
              </div>
            )}
            {order.interest_start_date && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400">计息日期</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>
                  {String(order.interest_start_date).slice(0, 10).replace(/^\d{4}-(\d{2})-(\d{2})$/, (_: string, m: string, d: string) => `${parseInt(m)}月${parseInt(d)}日`)}
                </span>
              </div>
            )}
            {/* 担保货币 */}
            {collateralAssets.map((a, idx) => (
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
            {collateralAssets.length > 0 && collateralValueKnown && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400">{collateralAssets.length > 1 ? '担保总值' : '担保价值'}</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>{collateralValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} U</span>
              </div>
            )}
            {/* 风险敞口 */}
            {collateralAssets.length > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400">风险敞口</span>
                <span className="font-medium" style={{ color: isSufficient ? '#4B5563' : '#16A34A' }}>
                  {isSufficient ? '充足' : `-${(Math.abs(exposure)).toLocaleString(undefined, { maximumFractionDigits: 2 })} U`}
                </span>
              </div>
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
            已结利息：<span style={{ color: '#16A34A' }}>{displayPaid.toFixed(2)} {interestUnit}</span>
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
  financeType: '保本分成' as '保本分成' | '自负盈亏',
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
  const canEdit = (note: FNoteItem) => isAdmin || (currentUser && note.userId === currentUser.id) || !note.userId;
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
                    <FNoteAvatar name={note.userName} avatar={note.userAvatar || (note.userId ? (membersData as any[])?.find((m: any) => m.userId === note.userId)?.avatar || undefined : undefined)} />
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

  const DEFAULT_DISPLAY_CONFIG: Record<string, boolean> = {
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
  };
  const [displayConfig, setDisplayConfig] = useState<Record<string, boolean>>(DEFAULT_DISPLAY_CONFIG);

  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [formData, setFormData] = useState({ ...emptyForm });

  // 用户选择
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [userSearchText, setUserSearchText] = useState('');
  const [showUserDropdown, setShowUserDropdown] = useState(false);
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
    : orders.filter((o: any) => o.user_id === activeUserTab);
  // 获取有订单的用户列表（用于 Tab 展示）
  const usersWithOrders = realMembers.filter((m: any) =>
    orders.some((o: any) => o.user_id === m.userId)
  );

  const filteredMembers = realMembers.filter((m: any) => {
    const name = (m.nickname || m.username || '').toLowerCase();
    return name.includes(userSearchText.toLowerCase());
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
          if (order.collateral_assets) return JSON.parse(order.collateral_assets);
        } catch(e) {}
        // 兼容旧数据：将单笔 collateral_coin/qty 转为数组
        if (order.collateral_coin && order.collateral_qty) {
          return [{ coin: order.collateral_coin, qty: String(parseFloat(order.collateral_qty)) }];
        }
        return [];
      })(),
      financeType: (order.finance_type || '保本分成') as '保本分成' | '自负盈亏',
    });
    setSelectedUserId(order.user_id || null);
    const u = realMembers.find((m: any) => m.userId === order.user_id);
    setUserSearchText(u ? (u.nickname || u.username || '') : '');
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
        counterparty: formData.counterparty,
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
        // 编辑模式：始终传 collateralAssets（空数组表示用户明确清空）
        collateralAssets: formData.collateralAssets,
        financeType: formData.financeType,
      });
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
        financeType: formData.financeType,
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
                      const name = m ? (m.nickname || m.username || `用户${activeUserTab}`) : `用户${activeUserTab}`;
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
                    const name = m.nickname || m.username || `用户${m.userId}`;
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
                    totalPaid={totalPaid}
                    openedPaymentList={showPaymentPanel === order.id ? openedPaymentList : []}
                    currentUser={currentUser}
                    isAdmin={isAdminUser}
                    realMembers={realMembers}
                    ledgerId={ledgerId}
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

              {/* 用户 + 币种 同一行 */}
              <div className="flex gap-3 items-start">
              {/* 选择用户 */}
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-600 mb-2">
                  {editingOrder ? '归属用户' : '用户'} <span className="text-red-400 ml-0.5">*</span>
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
                        {selectedUser.nickname || selectedUser.username}
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
                            onClick={() => { setSelectedUserId(m.userId); setUserSearchText(m.nickname || m.username || ''); setShowUserDropdown(false); }}
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
                                {m.nickname || m.username}
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
                  onChange={e => setFormData(d => ({ ...d, coin: e.target.value }))}
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
              <div className="rounded-2xl border border-gray-200 overflow-hidden">
                <div className="px-4 pt-3 pb-1">
                  <span className="text-xs text-gray-400">输入任意两个，第三个自动计算 · 融资金额 = 买入价格 × 币数</span>
                </div>
                {/* 融资金额 */}
                <div className="px-4 py-3 border-b border-gray-100">
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">融资金额 (USDT)</label>
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

              {/* 状态（编辑时） */}
              {editingOrder && (
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">订单状态</label>
                  <div className="flex gap-2">
                    {STATUS_OPTIONS.map(s => (
                      <button
                        key={s.value}
                        onClick={() => setFormData(d => ({ ...d, status: s.value }))}
                        className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
                        style={
                          formData.status === s.value
                            ? { background: 'linear-gradient(135deg, #1A56DB, #3B82F6)', color: '#fff' }
                            : { backgroundColor: '#F3F4F6', color: '#6B7280' }
                        }
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

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
                          { key: 'paidInterest', label: '已结利息' },
                          { key: 'interestStartDate', label: '计息日期' },
                          { key: 'collateralCoin', label: '担保货币' },
                          { key: 'collateralValue', label: '担保价值' },
                          { key: 'collateral', label: '担保缺口' },
                          { key: 'marginRate', label: '保证金率' },
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
                </div>
              )}

              {/* 实时预览卡片 - 两栏大数字样式（与前端订单卡片一致） */}
              {showForm && (
                <div className="px-5 pb-4">
                  <div className="text-xs font-medium text-gray-400 mb-2">实时预览</div>
                  <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#E8EFFF', background: '#FFFFFF' }}>
                  {/* 顶部色条 */}
                  <div className="h-1" style={{ background: `linear-gradient(90deg, ${COIN_COLORS[formData.coin] || '#3B82F6'}, ${(COIN_COLORS[formData.coin] || '#3B82F6')}55)` }} />
                  {/* 两栏主体 */}
                  <div className="flex" style={{ minHeight: '100px' }}>
                    {/* 左栏：持有资产 */}
                    <div className="flex-1 p-3 pr-2">
                      <div className="h-4 flex items-center" style={{ color: '#3B82F6' }}>
                        <span className="text-xs font-medium">融资资产（自负盈亏 100%部分）</span>
                      </div>
                      <div className="min-h-7 flex flex-col justify-center mt-0.5">
                        <div className="flex items-baseline gap-1 flex-wrap">
                          <span className="text-xl font-bold tabular-nums leading-tight" style={{ color: '#1A2340' }}>
                            {formData.buyQuantity ? parseFloat(parseFloat(formData.buyQuantity).toFixed(6)).toString() : '—'}
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
                        {displayConfig.holdDuration && formData.buyDate && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 shrink-0">持有时长</span>
                            <span className="font-medium" style={{ color: '#4B5563' }}>
                              {(() => {
                                const elapsed = Date.now() - new Date(formData.buyDate + 'T00:00:00').getTime();
                                if (elapsed < 0) return '---';
                                const days = Math.floor(elapsed / (1000 * 60 * 60 * 24));
                                const hours = Math.floor((elapsed % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                                return days > 0 ? `${days}天 ${hours}小时` : `${hours}小时`;
                              })()}
                            </span>
                          </div>
                        )}
                        {displayConfig.orderNo && editingOrder?.order_no && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 shrink-0">订单编号</span>
                            <span className="font-medium" style={{ color: '#4B5563' }}>{editingOrder.order_no}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {/* 中间分隔线 */}
                    <div className="w-px my-3" style={{ backgroundColor: '#E8EFFF' }} />
                    {/* 右栏：待结利息 */}
                    <div className="w-44 p-3 pl-2 flex flex-col">
                      {displayConfig.accruedInterest && formData.interestRateAnnual && formData.interestBase && formData.interestStartDate ? (
                        <div>
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
                                  return interest.toLocaleString(undefined, { maximumFractionDigits: 2 });
                                })()}
                              </span>
                              <span className="text-sm font-semibold" style={{ color: '#1A2340' }}>USDT</span>
                            </div>
                          </div>
                          <div className="space-y-0.5 text-xs mt-1">
                            {displayConfig.paidInterest && (() => {
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
                            {displayConfig.collateral && formComputedCollateralValue !== null && formComputedAmount && formComputedAmount > 0 && (() => {
                              // 风险敞口计算与前端 P076-C 一致
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
                                gap = formComputedCollateralValue - buyValue - unpaidInterest + totalPaid;
                              } else if (coinPrice > 0) {
                                gap = marketValue + formComputedCollateralValue - buyValue - unpaidInterest + totalPaid;
                              }
                              return gap !== null ? (
                                <div className="flex items-center justify-between border-t pt-1 mt-0.5" style={{ borderColor: '#E8EFFF' }}>
                                  <span className="text-gray-400 shrink-0">担保缺口</span>
                                  <span className="font-medium" style={{ color: gap >= 0 ? '#4B5563' : '#EF4444' }}>
                                    {gap >= 0 ? '超过100%' : `${gap.toLocaleString(undefined, { maximumFractionDigits: 0 })} U`}
                                  </span>
                                </div>
                              ) : null;
                            })()}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <span className="text-gray-300 text-xs">填写利息信息后显示</span>
                        </div>
                      )}
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
