import { useState } from 'react';
import { Eye, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import StockQuoteUpdateIndicator from '@/components/StockQuoteUpdateIndicator';
import type { StockObservationHolding } from '@shared/stock-observation-portfolio';

type PublicStockPosition = {
  symbol: string;
  lots?: readonly {
    id: number | string;
    unitCost?: number | string | null;
    openedAt?: string | null;
  }[];
};

type Props = {
  categoryId: number;
  usdCnyRate: number;
  /** 仅用于匹配公司批次的公开开仓价与日期，不参与观察或真实结算。 */
  publicPositions?: readonly PublicStockPosition[];
};

const finiteValue = (value: number | null | undefined) => value !== null && value !== undefined && Number.isFinite(value) ? value : null;
const formatAmount = (value: number | null | undefined, signed = false) => {
  const amount = finiteValue(value);
  if (amount === null) return '—';
  return `${signed && amount > 0 ? '+' : signed && amount < 0 ? '−' : ''}${(signed ? Math.abs(amount) : amount).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const tone = (value: number | null | undefined) => finiteValue(value) === null ? 'text-gray-400' : value! >= 0 ? 'text-[#D32F2F]' : 'text-[#2E7D32]';
const smallDecimals = (text: string) => {
  const index = text.lastIndexOf('.');
  return index < 0 ? text : <>{text.slice(0, index)}<span className="text-[9px] font-normal opacity-80">{text.slice(index)}</span></>;
};
const dateParts = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).reduce<Record<string, string>>((parts, part) => { parts[part.type] = part.value; return parts; }, {});
};
const quoteTime = (value: string | null | undefined) => {
  const parts = dateParts(value);
  return parts ? `${parts.month}-${parts.day} ${parts.hour}:${parts.minute}` : '待更新';
};
const dateLabel = (value: string | null | undefined) => {
  const parts = dateParts(value);
  if (!parts) return '—';
  const today = dateParts(new Date().toISOString())!;
  const dayStamp = (date: Record<string, string>) => Date.UTC(Number(date.year), Number(date.month) - 1, Number(date.day));
  const days = Math.max(0, Math.round((dayStamp(today) - dayStamp(parts)) / 86_400_000));
  return `${parts.month}-${parts.day} · ${days}天`;
};
const metricCellClass = 'flex min-w-0 flex-col items-center justify-center px-0.5 py-2.5 text-center';
const metricLabelClass = 'order-last mt-1 whitespace-nowrap text-[9px] leading-4 text-gray-400';
const metricValueClass = 'whitespace-nowrap text-[13px] leading-5 font-semibold tracking-tight tabular-nums';

export default function StockObservationPortfolio({ categoryId, usdCnyRate, publicPositions = [] }: Props) {
  const [showPnlFormula, setShowPnlFormula] = useState(false);
  let viewAsUserId: number | undefined;
  try {
    const raw = new URLSearchParams(window.location.search).get('viewAs') || sessionStorage.getItem('view-as-user-id');
    const target = raw && /^\d+$/.test(raw) ? Number(raw) : 0;
    if (Number.isSafeInteger(target) && target > 0) viewAsUserId = target;
  } catch {
    // 不可读取视角时按本人查询；身份授权始终由服务端真实认证上下文决定。
  }
  const query = trpc.ledger.getMyStockTagObservationPortfolio.useQuery(
    { ledgerId: 37, categoryId, viewAsUserId },
    { staleTime: 10_000, refetchInterval: 60_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true },
  );
  if (query.isLoading) return <div className="flex items-center gap-1.5 px-3 py-2 text-[11px] text-gray-400"><Loader2 size={12} className="animate-spin" />正在读取观察配额…</div>;
  if (query.error) return <div className="rounded-lg border border-purple-100 bg-purple-50/60 px-3 py-2 text-[11px] text-purple-700">观察配额暂不可用：{query.error.message}</div>;
  const holdings = ((query.data as any)?.holdings ?? []) as StockObservationHolding[];
  if (holdings.length === 0) return null;
  const asCny = (value: number | null | undefined, currency: string) => {
    const amount = finiteValue(value);
    return amount === null || (currency === 'USD' && (!Number.isFinite(usdCnyRate) || usdCnyRate <= 0)) ? null : finiteValue(amount * (currency === 'USD' ? usdCnyRate : 1));
  };
  const MoneyValue = ({ value, currency, signed = false }: { value: number | null | undefined; currency: 'CNY' | 'USD'; signed?: boolean }) => {
    const cny = asCny(value, currency);
    const color = signed ? tone(cny) : cny === null ? 'text-gray-400' : 'text-[#222222]';
    return <>
      <div className={`${metricValueClass} ${color}`}>{smallDecimals(formatAmount(cny, signed))}</div>
      {currency === 'USD' && <div className={`mt-0.5 whitespace-nowrap text-[9px] ${signed ? tone(value) : 'text-gray-400'}`}>{formatAmount(value, signed)}</div>}
    </>;
  };

  return <section className="space-y-2" aria-label="观察账户">
    {holdings.map(holding => {
      // 精确匹配同股票、同批次；观察入场价不能充当公司的真实开仓价。
      const publicPosition = publicPositions.find(position => position.symbol.trim().toUpperCase() === holding.symbol.trim().toUpperCase());
      const publicLot = publicPosition?.lots?.find(lot => Number(lot.id) === Number(holding.lotId));
      const rawUnitCost = publicLot?.unitCost;
      const unitCost = rawUnitCost === null || rawUnitCost === undefined || String(rawUnitCost).trim() === '' ? null : finiteValue(Number(rawUnitCost));
      // 所有行情展示沿用观察接口的估值（含暂停/结束冻结价），绝不借公开实时价覆盖。
      const marketPrice = finiteValue(holding.marketPrice);
      const priceChange = marketPrice === null || unitCost === null ? null : finiteValue(marketPrice - unitCost);
      const changePercent = priceChange === null || unitCost === null || unitCost <= 0 ? null : finiteValue(priceChange / unitCost * 100);
      const quantity = finiteValue(holding.currentQuantity);
      const marketValue = quantity === null ? null : quantity === 0 ? 0 : marketPrice === null ? null : finiteValue(quantity * marketPrice);
      const hasOpeningDate = dateParts(publicLot?.openedAt) !== null;
      const displayDate = hasOpeningDate ? publicLot?.openedAt : holding.startDate;
      const closed = holding.status === 'closed';
      const paused = holding.status === 'paused';
      const pending = holding.status === 'pending';
      const statusLabel = closed ? '已结束' : paused ? '已暂停' : pending ? '待开始' : null;
      const metricCurrencyLabel = <span className="ml-0.5 text-[8px] font-normal" title={holding.currency === 'USD' ? '上方为人民币，下方为美元' : '人民币'}>¥{holding.currency === 'USD' ? '/$' : ''}</span>;
      return <div key={`${holding.symbol}-${holding.lotId}`} className="relative overflow-hidden rounded-[3px] border border-[#D9D9D9] bg-[#FAF6FF] text-xs">
        <div className="border-b border-[#E6E6E6] bg-[#F3EDF9] px-2.5 py-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <Eye size={20} aria-label="观察配额" className="shrink-0 text-[#8462A8]" />
            <div className="flex min-w-0 flex-1 items-baseline gap-x-1.5">
              <span className="min-w-0 truncate font-semibold leading-5 text-[#222222]" title={holding.stockName}>{holding.stockName}</span>
              <span className="shrink-0 whitespace-nowrap font-normal text-gray-400">{holding.symbol.replace(/\.(SH|SZ|BJ)$/i, '')}</span>
              <span className="ml-auto shrink-0 whitespace-nowrap text-[9px] leading-4 text-gray-400" title={`${hasOpeningDate ? '公司开仓于' : '观察开始于'} ${displayDate || '—'}`}>{hasOpeningDate ? '' : '开始 '}{dateLabel(displayDate)}</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-4 bg-[#F3EDF9]">
          <div className={`${metricCellClass} border-r border-[#E6E6E6]`}><MoneyValue value={unitCost} currency={holding.currency} /><div className={metricLabelClass}>买入价{metricCurrencyLabel}</div></div>
          <div className={`${metricCellClass} border-r border-[#E6E6E6]`}><MoneyValue value={marketPrice} currency={holding.currency} /><div className={metricLabelClass}>当前价{metricCurrencyLabel}</div></div>
          <div className={`${metricCellClass} border-r border-[#E6E6E6]`}><MoneyValue value={priceChange} currency={holding.currency} signed /><div className={metricLabelClass}>当前涨跌{metricCurrencyLabel}</div></div>
          <div className={metricCellClass}><div className={`${metricValueClass} ${tone(changePercent)}`}>{smallDecimals(formatAmount(changePercent, true))}</div><div className={metricLabelClass}>涨跌幅<span className="ml-0.5 text-[8px] font-normal">%</span></div></div>
        </div>
        <div className="border-t border-[#D9D9D9] bg-[#FAF6FF]">
          <div className="flex items-center justify-between gap-3 border-b border-[#E6E6E6] px-2.5 py-2">
            <span className="flex min-w-0 flex-wrap items-center gap-1.5 font-semibold text-[#222222]"><span className="whitespace-nowrap">我的配额</span><span className="whitespace-nowrap rounded bg-[#EEE7F5] px-1.5 py-0.5 text-[9px] font-normal text-[#8462A8]">观察账户 · 不结算</span>{statusLabel && <span className={`rounded px-1 py-0.5 text-[9px] font-normal ${paused ? 'bg-[#FFF3D8] text-[#A47C28]' : 'bg-[#EEE7F5] text-gray-400'}`}>{statusLabel}</span>}</span>
            {closed || paused || pending ? <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[9px] leading-4 text-gray-400" title={pending ? `观察开始日期：${holding.startDate}` : `${closed ? '已结束' : '已暂停'}，估值冻结，不再实时更新`}><span className={`h-1.5 w-1.5 rounded-full ${paused ? 'bg-[#D5A038]' : 'bg-gray-400'}`} />{pending ? '尚未开始' : `冻结 · ${quoteTime(holding.marketQuoteUpdatedAt)}`}</span> : <StockQuoteUpdateIndicator updatedAt={holding.marketQuoteUpdatedAt} currency={holding.currency} text={quoteTime(holding.marketQuoteUpdatedAt)} title={`观察行情报价时间：${quoteTime(holding.marketQuoteUpdatedAt)}`} />}
          </div>
          <div className="grid grid-cols-4">
            <div className={`${metricCellClass} border-r border-[#E6E6E6]`}><MoneyValue value={holding.entryPrice} currency={holding.currency} /><div className={metricLabelClass}>我的买入价{metricCurrencyLabel}</div></div>
            <div className={`${metricCellClass} border-r border-[#E6E6E6]`}><div className={`${metricValueClass} ${quantity === null ? 'text-gray-400' : 'text-[#222222]'}`}>{quantity === null ? '—' : smallDecimals(quantity.toLocaleString('zh-CN', { maximumFractionDigits: 8 }))} <span className="text-[9px] font-normal text-gray-400">股</span></div><div className={metricLabelClass}>持仓数量</div></div>
            <div className={`${metricCellClass} border-r border-[#E6E6E6]`}><MoneyValue value={marketValue} currency={holding.currency} /><div className={metricLabelClass}>持仓价值{metricCurrencyLabel}</div></div>
            <div className={metricCellClass}><MoneyValue value={holding.floatingPnl} currency={holding.currency} signed /><button type="button" onClick={() => setShowPnlFormula(true)} className={`${metricLabelClass} border-b border-dashed border-gray-400 pb-px hover:border-[#8462A8] hover:text-[#8462A8]`} aria-label={`查看${holding.stockName}观察浮动盈亏计算公式`}>浮动盈亏{metricCurrencyLabel}</button></div>
          </div>
          {finiteValue(holding.closedQuantity) !== null && holding.closedQuantity > 0 && <div className="flex flex-wrap items-center justify-end gap-x-2 border-t border-[#E6E6E6] px-2.5 py-1.5 text-[9px] leading-4 text-gray-400"><span>已结束 {holding.closedQuantity.toLocaleString('zh-CN', { maximumFractionDigits: 8 })} 股</span><span>观察盈亏 ¥ {formatAmount(asCny(holding.closedPnl, holding.currency), true)}{holding.currency === 'USD' ? ` / $ ${formatAmount(holding.closedPnl, true)}` : ''}</span></div>}
        </div>
      </div>;
    })}
    <div className="py-1 text-[9px] leading-4 text-gray-400">观察配额独立展示，不计入真实账户或资金结算</div>
    <Dialog open={showPnlFormula} onOpenChange={setShowPnlFormula}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="flex items-center gap-1.5 text-sm"><Eye size={16} className="text-[#8462A8]" />观察浮动盈亏</DialogTitle></DialogHeader>
        <div className="space-y-2 text-xs leading-5 text-gray-500"><p>浮动盈亏 =（我的买入价 − 观察当前价）× 当前观察持仓数量。</p><p>暂停或结束沿用冻结估值；已结束部分单独展示，观察累计盈亏为浮动盈亏与已结束观察盈亏之和。美元金额折算人民币，原始美元值保留在下方。</p><p>仅展示观察计算结果，不产生真实配额、保证金或资金结算。</p></div>
      </DialogContent>
    </Dialog>
  </section>;
}
