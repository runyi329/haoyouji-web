import { ChevronDown, Eye, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import StockQuoteUpdateIndicator from '@/components/StockQuoteUpdateIndicator';

type ObservationHolding = {
  lotId: number;
  stockName: string;
  symbol: string;
  currency: 'CNY' | 'USD';
  quantity: number;
  entryPrice: number;
  marketPrice: number | null;
  marketQuoteUpdatedAt?: string | null;
  marketQuoteDate?: string | null;
  totalPnl: number | null;
  floatingPnl?: number | null;
  costValue: number;
  status: string;
};

const formatAmount = (value: number | null | undefined, signed = false) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '暂未估值';
  return `${signed && value >= 0 ? '+' : ''}${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const tone = (value: number | null | undefined) => value === null || value === undefined ? 'text-gray-400' : value >= 0 ? 'text-[#D32F2F]' : 'text-[#2E7D32]';
const quoteTime = (value: string | null | undefined) => {
  if (!value) return '暂无报价时间';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '暂无报价时间' : new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
};

export default function StockObservationPortfolio({ categoryId, usdCnyRate }: { categoryId: number; usdCnyRate: number }) {
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
  const holdings = ((query.data as any)?.holdings ?? []) as ObservationHolding[];
  if (holdings.length === 0) return null;
  const asCny = (value: number | null, currency: string) => value === null || !Number.isFinite(value) || (currency === 'USD' && (!Number.isFinite(usdCnyRate) || usdCnyRate <= 0)) ? null : value * (currency === 'USD' ? usdCnyRate : 1);
  const effectiveHoldings = holdings.filter(row => row.status !== 'pending');
  const valued = effectiveHoldings.map(row => asCny(row.totalPnl, row.currency));
  const totalPnl = valued.every(value => value !== null) ? valued.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;
  const costValues = effectiveHoldings.map(row => asCny(row.costValue, row.currency));
  const totalCost = costValues.every(value => value !== null) ? costValues.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;
  const percent = totalPnl !== null && totalCost !== null && totalCost > 0 ? totalPnl / totalCost * 100 : null;
  return <details className="group/observation overflow-hidden rounded-xl border border-[#DDD3ED] bg-[#FBF9FE] text-[11px]">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-3 [&::-webkit-details-marker]:hidden">
      <span className="flex min-w-0 items-center gap-1.5"><Eye size={15} className="shrink-0 text-[#8462A8]" /><span className="font-semibold text-[#644484]">观察账户</span><span className="shrink-0 rounded bg-[#EEE7F5] px-1.5 py-0.5 text-[9px] text-[#8462A8]">不结算</span></span>
      <span className="flex shrink-0 items-center gap-2"><span className="text-right"><span className={`block text-[13px] font-semibold tabular-nums ${tone(totalPnl)}`}>{formatAmount(totalPnl, true)}<span className="ml-0.5 text-[9px] font-normal text-gray-400">元</span></span><span className="block text-[9px] text-[#A28AB6]">观察盈亏 · {holdings.length} 笔</span></span><ChevronDown size={14} className="text-[#A28AB6] transition-transform group-open/observation:rotate-180" /></span>
    </summary>
    <div className="border-t border-[#E9E0F0]">
      <div className="bg-[#F4EFF9] px-3 py-2 text-[10px] leading-4 text-[#9276A9]">仅观察行情与模拟盈亏，不占实际份额，不计入真实总盈利、分红、所需保证金或钱包。</div>
      <div className="grid grid-cols-2 divide-x divide-[#E9E0F0] border-b border-[#E9E0F0] text-center">
        <div className="px-2 py-2.5"><div className="text-[10px] text-[#A28AB6]">观察初始市值（元）</div><div className="mt-1 font-semibold tabular-nums text-[#644484]">{formatAmount(totalCost)}</div></div>
        <div className="px-2 py-2.5"><div className="text-[10px] text-[#A28AB6]">观察盈亏幅度</div><div className={`mt-1 font-semibold tabular-nums ${tone(percent)}`}>{percent === null ? '—' : `${formatAmount(percent, true)}%`}</div></div>
      </div>
      <div className="divide-y divide-[#E9E0F0]">
        {holdings.map(holding => <div key={holding.lotId} className="px-3 py-2.5">
          <div className="flex items-center justify-between gap-2"><div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5"><span className="font-semibold text-[#644484]">{holding.stockName}</span><span className="text-[10px] text-gray-400">{holding.symbol.replace(/\.(SH|SZ|BJ)$/i, '')}</span><span className="text-[9px] text-[#A28AB6]">{holding.status === 'closed' ? '观察已结束' : holding.status === 'paused' ? '观察已暂停' : holding.status === 'pending' ? '待开始' : '观察中'}</span></div><span className="shrink-0 font-semibold tabular-nums text-[#644484]">{holding.quantity.toLocaleString('zh-CN', { maximumFractionDigits: 8 })}<span className="ml-0.5 text-[9px] font-normal">股</span></span></div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center"><div><div className="font-semibold tabular-nums text-gray-700">{formatAmount(holding.entryPrice)}</div><div className="mt-0.5 text-[9px] text-[#A28AB6]">观察买入价（{holding.currency === 'USD' ? '美元' : '元'}）</div></div><div><div className="font-semibold tabular-nums text-gray-700">{formatAmount(holding.marketPrice)}</div><div className="mt-0.5 text-[9px] text-[#A28AB6]">{holding.status === 'closed' ? '结束价' : holding.status === 'paused' ? '暂停参考价' : '最新价'}（{holding.currency === 'USD' ? '美元' : '元'}）</div></div><div><div className={`font-semibold tabular-nums ${tone(holding.totalPnl)}`}>{formatAmount(holding.totalPnl, true)}</div><div className="mt-0.5 text-[9px] text-[#A28AB6]">观察盈亏（{holding.currency === 'USD' ? '美元' : '元'}）</div></div></div>
          <div className="mt-2 flex items-center justify-end">{holding.status === 'closed' || holding.status === 'paused' ? <span className="text-[9px] text-gray-400">{holding.status === 'closed' ? '已结束，停止更新' : `已暂停，停止更新 · ${quoteTime(holding.marketQuoteUpdatedAt)}`}</span> : <StockQuoteUpdateIndicator updatedAt={holding.marketQuoteUpdatedAt} currency={holding.currency} text={quoteTime(holding.marketQuoteUpdatedAt)} title={`观察行情报价时间：${quoteTime(holding.marketQuoteUpdatedAt)}`} />}</div>
        </div>)}
      </div>
      <div className="border-t border-[#E9E0F0] px-3 py-2 text-[9px] leading-4 text-[#A28AB6]">观察盈亏沿用客户口径：买入价高、最新价低时为盈利；已结束部分只作模拟展示，不产生真实结算。</div>
    </div>
  </details>;
}
