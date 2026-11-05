import { Eye, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import StockParticipantProfitChart from '@/components/StockParticipantProfitChart';
import type { StockObservationHolding } from '@shared/stock-observation-portfolio';

export type StockActualDisplaySummary = {
  holdingCount: number;
  closedCount: number;
  currentCost: number | null;
  currentValue: number | null;
  closedCost: number | null;
  closedValue: number | null;
  totalPnl: number | null;
  positionNumbers: string[];
  profitRows: { stockName: string; pnl: number | null }[];
};

type Props = {
  categoryId: number;
  usdCnyRate: number;
  combined?: boolean;
  actual?: StockActualDisplaySummary;
};

type Amount = { cny: number | null; usd: number | null };

const EMPTY_ACTUAL: StockActualDisplaySummary = {
  holdingCount: 0,
  closedCount: 0,
  currentCost: 0,
  currentValue: 0,
  closedCost: 0,
  closedValue: 0,
  totalPnl: 0,
  positionNumbers: [],
  profitRows: [],
};

const finiteValue = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const sumAmounts = (values: (number | null)[]): number | null =>
  values.some(value => value === null)
    ? null
    : finiteValue(values.reduce<number>((sum, value) => sum + value!, 0));

// 零股数没有估值需求；非零股数缺少报价则保持未知，不以零或实时价补齐。
const quantityValue = (quantity: number, price: number | null): number | null => {
  const count = finiteValue(quantity);
  if (count === null || count < 0) return null;
  if (count === 0) return 0;
  const unitPrice = finiteValue(price);
  return unitPrice === null ? null : finiteValue(count * unitPrice);
};

const tone = (value: number | null, combined = false) =>
  value === null ? 'text-gray-400' : value > 0 ? 'text-[#D32F2F]' : value < 0 ? 'text-[#2E7D32]' : combined ? 'text-[#D32F2F]' : 'text-[#644484]';

const money = (value: number | null, currency: 'CNY' | 'USD', signed = false) => {
  if (value === null) return '—';
  const sign = signed && value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${currency === 'USD' ? 'US$' : '¥'}${Math.abs(value).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

function MoneyValue({ value, showUsd, signed = false, top = false, combined = false }: {
  value: Amount;
  showUsd: boolean;
  signed?: boolean;
  top?: boolean;
  combined?: boolean;
}) {
  return <>
    <div className={`${top ? 'mt-1 ' : ''}whitespace-nowrap text-[12px] leading-5 font-semibold tracking-tight tabular-nums ${signed ? tone(value.cny, combined) : value.cny === null ? 'text-gray-400' : combined ? 'text-[#44342E]' : 'text-[#44344E]'}`}>
      {money(value.cny, 'CNY', signed)}
    </div>
    {showUsd && <div className={`mt-0.5 whitespace-nowrap text-[9px] tabular-nums ${signed ? tone(value.usd, combined) : 'text-gray-400'}`}>
      {money(value.usd, 'USD', signed)}
    </div>}
  </>;
}

/** 只读取观察持仓；actual 仅作 CNY 展示合并，不触及真实配额、保证金或结算。背景由账户原 header 提供。 */
export default function StockObservationAccountSummary({ categoryId, usdCnyRate, combined = false, actual }: Props) {
  let viewAsUserId: number | undefined;
  try {
    const raw = new URLSearchParams(window.location.search).get('viewAs') || sessionStorage.getItem('view-as-user-id');
    const target = raw && /^\d+$/.test(raw) ? Number(raw) : 0;
    if (Number.isSafeInteger(target) && target > 0) viewAsUserId = target;
  } catch {
    // 与观察持仓组件使用同一查询键；身份授权仍完全由服务端校验。
  }
  const query = trpc.ledger.getMyStockTagObservationPortfolio.useQuery(
    { ledgerId: 37, categoryId, viewAsUserId },
    { staleTime: 10_000, refetchInterval: 60_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true },
  );

  const stateClass = 'mt-2 rounded-lg bg-white/95 px-3 py-2 text-[11px] text-gray-400';
  if (query.isLoading) return <div className={`${stateClass} flex items-center gap-1.5`}><Loader2 size={12} className="animate-spin" />正在读取观察汇总</div>;
  if (query.error) return <div className={stateClass}>观察汇总暂不可用：{query.error.message}</div>;
  if (!query.data || !Array.isArray(query.data.holdings)) return <div className={stateClass}>观察汇总暂不可用</div>;
  const holdings: StockObservationHolding[] = query.data.holdings;
  if (!combined && holdings.length === 0) return <div className={stateClass}>暂无观察配额</div>;

  const effectiveHoldings = holdings.filter(row => row.status !== 'pending');
  const currentHoldings = effectiveHoldings.filter(row => finiteValue(row.currentQuantity) !== null && row.currentQuantity > 0);
  const endedHoldings = effectiveHoldings.filter(row => finiteValue(row.closedQuantity) !== null && row.closedQuantity > 0);
  const pendingCount = holdings.filter(row => row.status === 'pending').length;
  const pausedCount = currentHoldings.filter(row => row.status === 'paused').length;
  const showUsd = !combined && effectiveHoldings.length > 0 && effectiveHoldings.every(row => row.currency === 'USD');
  const stockNames = Array.from(new Set(currentHoldings.map(row => row.stockName.trim() || row.symbol)));
  const asCny = (value: number | null, currency: StockObservationHolding['currency']): number | null => {
    const amount = finiteValue(value);
    if (amount === null) return null;
    if (currency === 'CNY') return amount;
    if (finiteValue(usdCnyRate) === null || usdCnyRate <= 0) return null;
    return finiteValue(amount * usdCnyRate);
  };
  const aggregate = (readValue: (row: StockObservationHolding) => number | null): Amount => {
    const values = effectiveHoldings.map(row => ({ currency: row.currency, value: readValue(row) }));
    return {
      cny: sumAmounts(values.map(row => asCny(row.value, row.currency))),
      // 原始美元独立保留，绝不从已折算人民币反推，也不将混币金额相加。
      usd: showUsd ? sumAmounts(values.map(row => row.value)) : null,
    };
  };
  const currentCost = aggregate(row => quantityValue(row.currentQuantity, row.entryPrice));
  const currentValue = aggregate(row => quantityValue(row.currentQuantity, row.marketPrice));
  const endedCost = aggregate(row => quantityValue(row.closedQuantity, row.entryPrice));
  const endedValue = aggregate(row => quantityValue(row.closedQuantity, row.frozenSalePrice));
  // 部分结束在两行分摊市值，但总盈亏每笔只取服务端 totalPnl 一次。
  const totalPnl = aggregate(row => finiteValue(row.totalPnl));
  const totalCost = aggregate(row => finiteValue(row.costValue));
  // 只有未传 actual 才代表无真实持仓；真实未知金额必须传播，不能用零补齐。
  const actualSummary = actual === undefined ? EMPTY_ACTUAL : actual;
  const mergeAmount = (observation: Amount, actualValue: number | null): Amount => ({
    cny: sumAmounts([observation.cny, finiteValue(actualValue)]),
    usd: null,
  });
  const merged = combined ? {
    currentCost: mergeAmount(currentCost, actualSummary.currentCost),
    currentValue: mergeAmount(currentValue, actualSummary.currentValue),
    endedCost: mergeAmount(endedCost, actualSummary.closedCost),
    endedValue: mergeAmount(endedValue, actualSummary.closedValue),
    totalPnl: mergeAmount(totalPnl, actualSummary.totalPnl),
    totalCost: mergeAmount(totalCost, sumAmounts([finiteValue(actualSummary.currentCost), finiteValue(actualSummary.closedCost)])),
    holdingCount: currentHoldings.length + actualSummary.holdingCount,
    closedCount: endedHoldings.length + actualSummary.closedCount,
  } : {
    currentCost, currentValue, endedCost, endedValue, totalPnl, totalCost,
    holdingCount: currentHoldings.length,
    closedCount: endedHoldings.length,
  };
  const pnlPercent = merged.totalPnl.cny === null || merged.totalCost.cny === null || merged.totalCost.cny === 0
    ? null : finiteValue(merged.totalPnl.cny / merged.totalCost.cny * 100);
  const groups = [
    { title: '进行中', count: merged.holdingCount, initialValue: merged.currentCost, latestValue: merged.currentValue },
    { title: '已结束', count: merged.closedCount, initialValue: merged.endedCost, latestValue: merged.endedValue },
  ];
  const observerProfitRows = effectiveHoldings.map(row => ({ stockName: row.stockName, pnl: asCny(finiteValue(row.totalPnl), row.currency) }));
  // 图表内部按同名合并；两组原始行各拼接一次，不把观察金额混入真实来源。
  const profitRows = combined ? [...actualSummary.profitRows, ...observerProfitRows] : observerProfitRows;
  const dividerClass = combined ? 'divide-[#F2E8E2] border-[#F2E8E2]' : 'divide-[#E9E0F0] border-[#E9E0F0]';
  const labelClass = combined ? 'text-[#9A8980]' : 'text-[#846F98]';

  return <div className="mt-2 border-t border-white/20 pt-2" aria-label={combined ? '实际与观察合并账户汇总' : '观察账户汇总'}>
    <div className="flex flex-col items-start gap-2 text-[11px]">
      <span className="shrink-0 text-white/70">{combined ? '当前持仓 · 含观察' : '当前观察股票'}</span>
      <div className="flex flex-wrap items-center justify-start gap-x-3 gap-y-2 text-white">
        {combined && actualSummary.positionNumbers.map(positionNumber => <span key={`actual-${positionNumber}`} aria-label={`真实持仓编号 ${positionNumber}`} className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/80 text-[10px] font-bold leading-none text-[#9F1D1D]" style={{ background: 'radial-gradient(circle at 31% 24%, #FFFFFF 0%, #FFFFFF 12%, #FFF7F7 13%, #FFD8D8 48%, #F09D9D 74%, #B71C1C 100%)', boxShadow: 'inset 1px 1px 2px rgba(255,255,255,.95), inset -2px -2px 3px rgba(125,20,20,.42), 0 2px 3px rgba(77,12,12,.30)' }}>{positionNumber}</span>)}
        {stockNames.map(name => <span key={`observation-${name}`} className="inline-flex min-w-0 max-w-full items-start gap-1.5"><Eye size={13} className="mt-0.5 shrink-0 text-white/70" /><span className="break-words font-semibold">{name}</span></span>)}
        {stockNames.length === 0 && (!combined || actualSummary.positionNumbers.length === 0) && <span className="font-semibold">—</span>}
      </div>
    </div>
    {(pausedCount > 0 || pendingCount > 0) && <div className="mt-1.5 flex flex-wrap gap-x-3 text-[9px] leading-4 text-white/70">
      {pausedCount > 0 && <span>{combined ? '观察已暂停' : '已暂停'} {pausedCount} 笔（含进行中）</span>}
      {pendingCount > 0 && <span>{combined ? '观察待开始' : '待开始'} {pendingCount} 笔（不计入金额）</span>}
    </div>}
    <div className={`mt-3 overflow-hidden rounded-xl border border-white/70 bg-white text-[10px] ${combined ? 'shadow-[0_2px_8px_rgba(100,20,20,0.06)]' : 'shadow-[0_2px_8px_rgba(100,68,132,0.06)]'}`}>
      <table className="w-full table-fixed border-collapse text-center">
        <colgroup><col className="w-[28%]" /><col className="w-[36%]" /><col className="w-[36%]" /></colgroup>
        <thead className={`${combined ? 'bg-[#FFF5F1]' : 'bg-[#F5F0FB]'} ${labelClass}`}><tr className={`divide-x ${dividerClass}`}><th className="px-1 py-2 font-normal">状态</th><th className="px-2 py-2 font-normal">初始市值</th><th className="px-2 py-2 font-normal">最新价值</th></tr></thead>
        <tbody>{groups.map(group => <tr key={group.title} className={`divide-x border-t ${dividerClass}`}>
          <th scope="row" className={`whitespace-nowrap px-1 py-2.5 font-semibold ${combined ? 'bg-[#FFFAF7] text-[#8F3028]' : 'bg-[#FAF7FD] text-[#644484]'}`}>{group.title}<span className={`text-[9px] font-normal tabular-nums ${combined ? 'text-[#A8968B]' : 'text-[#9B88AD]'}`} aria-label={`${group.count} 笔`}>（{group.count}）</span></th>
          <td className="px-2 py-2.5"><MoneyValue value={group.initialValue} showUsd={showUsd} combined={combined} /></td>
          <td className="px-2 py-2.5"><MoneyValue value={group.latestValue} showUsd={showUsd} combined={combined} /></td>
        </tr>)}</tbody>
      </table>
      <div className={`grid grid-cols-2 divide-x border-t ${dividerClass} ${combined ? 'bg-[#FFF9F5]' : 'bg-white'} text-center`}>
        <div className="min-w-0 px-2 py-2.5"><div className={labelClass}>{combined ? '合并盈亏（含观察）' : '总盈亏'}</div><MoneyValue value={merged.totalPnl} showUsd={showUsd} combined={combined} signed top /></div>
        <div className="min-w-0 px-2 py-2.5"><div className={labelClass}>盈亏幅度</div><div className={`mt-1 whitespace-nowrap text-[12px] leading-5 font-semibold tracking-tight tabular-nums ${tone(pnlPercent, combined)}`}>{pnlPercent === null ? '—' : `${pnlPercent > 0 ? '+' : ''}${pnlPercent.toFixed(2)}%`}</div></div>
      </div>
      {combined && <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-0.5 border-t border-[#F2E8E2] px-2 py-1.5 text-[9px] leading-4 text-[#9A8980]">
        <span>真实盈亏 <span className={`font-semibold tabular-nums ${tone(finiteValue(actualSummary.totalPnl), true)}`}>{money(finiteValue(actualSummary.totalPnl), 'CNY', true)}</span></span>
        <span>＋</span>
        <span>观察盈亏 <span className={`font-semibold tabular-nums ${tone(totalPnl.cny, true)}`}>{money(totalPnl.cny, 'CNY', true)}</span></span>
      </div>}
    </div>
    <StockParticipantProfitChart rows={profitRows} />
    <div className="mt-2 text-[9px] leading-4 text-white/70">{combined ? '实际＋观察仅合并展示，观察部分不参与真实结算、分红或钱包。' : '观察盈亏，不参与真实结算或押金冻结'}</div>
  </div>;
}
