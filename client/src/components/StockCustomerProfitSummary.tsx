import { ChevronDown } from 'lucide-react';
import { useRef } from 'react';
import { StockSummaryImageDownload } from './StockSummaryImageDownload';

type CustomerProfit = {
  userId: number;
  name: string;
  totalCustomerPnl: number | null;
  totalFloatingPnl: number | null;
  totalRealizedPnl: number | null;
};

const palette = ['#C62828', '#E89838', '#426AB3', '#35A18B', '#9A67B4', '#E77984', '#5EAAC8', '#A3A047', '#BE7951', '#7685B4', '#8AAE9C', '#CC9CAB'];
const amount = (value: number) => `¥${Math.abs(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The chart reads the same customer totals as the member cards, not account gains. */
export default function StockCustomerProfitSummary({ customers }: { customers: CustomerProfit[] }) {
  const summaryRef = useRef<HTMLDetailsElement>(null);
  const ordered = [...customers].sort((a, b) => (b.totalCustomerPnl ?? -Infinity) - (a.totalCustomerPnl ?? -Infinity));
  const priced = ordered.filter((customer) => customer.totalCustomerPnl !== null && Number.isFinite(customer.totalCustomerPnl));
  const winners = priced.filter((customer) => customer.totalCustomerPnl! > 0);
  const winningTotal = winners.reduce((total, customer) => total + customer.totalCustomerPnl!, 0);
  const losingTotal = priced.reduce((total, customer) => total + Math.min(customer.totalCustomerPnl!, 0), 0);
  const unpricedCount = customers.length - priced.length;
  const floatingTotal = customers.some(customer => customer.totalFloatingPnl === null)
    ? null : customers.reduce((total, customer) => total + customer.totalFloatingPnl!, 0);
  const realizedTotal = customers.some(customer => customer.totalRealizedPnl === null)
    ? null : customers.reduce((total, customer) => total + customer.totalRealizedPnl!, 0);
  const signedAmount = (value: number | null) => value === null ? '暂未估值' : `${value < 0 ? '−' : '+'}${amount(value)}`;
  const compositionBase = floatingTotal === null || realizedTotal === null ? null : Math.abs(floatingTotal) + Math.abs(realizedTotal);
  const floatingShare = compositionBase === null || compositionBase === 0 ? null : Math.abs(floatingTotal!) / compositionBase * 100;
  const realizedShare = compositionBase === null || compositionBase === 0 ? null : Math.abs(realizedTotal!) / compositionBase * 100;
  const hasNegativeComponent = (floatingTotal !== null && floatingTotal < 0) || (realizedTotal !== null && realizedTotal < 0);
  const colorById = new Map(winners.map((customer, index) => [customer.userId, palette[index % palette.length]]));
  let cursor = 0;
  const stops = winners.map((customer) => {
    const start = cursor;
    cursor += customer.totalCustomerPnl! / winningTotal * 100;
    return `${colorById.get(customer.userId)} ${start}% ${cursor}%`;
  });

  return <details ref={summaryRef} aria-label="客户盈利汇总" className="group overflow-hidden rounded-2xl border border-[#EADFD8] bg-white shadow-[0_4px_18px_rgba(110,55,30,0.06)]">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3 [&::-webkit-details-marker]:hidden">
      <span className="flex min-w-0 items-center gap-1"><span className="text-sm font-semibold text-[#302522]">客户盈利汇总</span><StockSummaryImageDownload targetRef={summaryRef} title="客户盈利汇总" /></span>
      <span className="flex min-w-0 items-center gap-2"><span className="min-w-0 break-all text-lg font-semibold tabular-nums text-[#C62828]">{amount(winningTotal)}</span><ChevronDown size={16} className="shrink-0 text-[#B09B8D] transition-transform group-open:rotate-180" /></span>
    </summary>
    <div className="border-t border-[#F1E8E1]">
    <div className="px-3.5 pt-2.5 text-[10px] text-[#A39288]">{customers.length} 位客户 · 人民币{unpricedCount > 0 ? ' · 合计仅含已估值客户' : ''}</div>
    <div className="flex items-center gap-4 px-3.5 py-3">
      <div className="relative h-[116px] w-[116px] shrink-0 rounded-full border-[5px] border-white shadow-[0_3px_12px_rgba(90,45,30,0.12)]" role="img" aria-label={winningTotal > 0 ? `盈利分布：${winners.map(customer => `${customer.name} ${amount(customer.totalCustomerPnl!)}`).join('，')}` : '暂无已估值的客户盈利'} style={{ background: stops.length ? `conic-gradient(from -90deg, ${stops.join(', ')})` : '#EEE9E5' }}>
        <div className="absolute inset-[17px] flex flex-col items-center justify-center rounded-full bg-white shadow-[inset_0_1px_5px_rgba(70,35,20,0.07)]">
          <span className="text-[10px] text-[#AD9A8E]">盈利客户</span>
          <span className="mt-0.5 text-xl font-semibold tabular-nums text-[#44302A]">{winners.length}<span className="ml-0.5 text-[10px] font-normal text-[#AD9A8E]">人</span></span>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-[#A08E82]">{unpricedCount ? '已估值客户累计盈利' : '客户累计盈利'}</div>
        <div className="mt-1 break-all text-[23px] leading-7 font-semibold tracking-tight tabular-nums text-[#C62828]">{amount(winningTotal)}</div>
        <div className="mt-2 space-y-1 text-[10px] leading-4 text-[#A39288]">
          <div><div className="flex items-center gap-1"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#D45A55]" /><span>当前浮盈</span>{floatingShare !== null && <span className="ml-auto text-[9px] tabular-nums text-[#B0A198]">{floatingShare.toFixed(1)}%</span>}</div><div className={`pl-2.5 font-medium tabular-nums ${floatingTotal === null ? 'text-[#B0A198]' : floatingTotal >= 0 ? 'text-[#C62828]' : 'text-[#2E7D32]'}`}>{signedAmount(floatingTotal)}</div></div>
          <div><div className="flex items-center gap-1"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#D7AB5F]" /><span>已平仓收益</span>{realizedShare !== null && <span className="ml-auto text-[9px] tabular-nums text-[#B0A198]">{realizedShare.toFixed(1)}%</span>}</div><div className={`pl-2.5 font-medium tabular-nums ${realizedTotal === null ? 'text-[#B0A198]' : realizedTotal >= 0 ? 'text-[#C62828]' : 'text-[#2E7D32]'}`}>{signedAmount(realizedTotal)}</div></div>
        </div>
        <div role="img" aria-label={floatingShare === null ? '收益构成暂不可用' : `当前浮盈占${floatingShare.toFixed(1)}%，已平仓收益占${realizedShare!.toFixed(1)}%${hasNegativeComponent ? '，按金额绝对值计算' : ''}`} className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-[#EEE8E2] shadow-[inset_0_1px_2px_rgba(85,50,25,0.05)]">
          {floatingShare !== null && <><span className="h-full bg-gradient-to-r from-[#E9867E] to-[#CB4542] transition-[width] duration-300" style={{ width: `${floatingShare}%` }} /><span className="h-full bg-gradient-to-r from-[#E3C489] to-[#CCA052] transition-[width] duration-300" style={{ width: `${realizedShare}%` }} /></>}
        </div>
        {hasNegativeComponent && <div className="mt-1 text-[8px] text-[#AA9C93]">占比按金额绝对值；盈亏以正负号为准</div>}
        {losingTotal < 0 && <div className="mt-1 text-[10px] leading-4"><span className="text-[#A39288]">客户亏损 </span><span className="font-medium text-[#2E7D32]">−{amount(losingTotal)}</span><div className="mt-0.5 text-[#A39288]">净盈亏 <span className={winningTotal + losingTotal >= 0 ? 'text-[#C62828]' : 'text-[#2E7D32]'}>{winningTotal + losingTotal >= 0 ? '+' : '−'}{amount(winningTotal + losingTotal)}</span></div></div>}
      </div>
    </div>
    <div className="mx-3.5 mb-3 rounded-lg bg-[#FAF6F2] px-2.5 py-2 text-[10px] leading-4 text-[#A18C7C]">客户与账户为对手盘，盈亏方向相反；账户已平仓净盈亏另扣双边手续费。</div>
    <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-[#F2ECE7] px-3.5 py-3">
      {ordered.map((customer) => <div key={customer.userId} className="min-w-0">
        <div className="flex items-center gap-1.5"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colorById.get(customer.userId) || (customer.totalCustomerPnl === null ? '#C9C1BB' : customer.totalCustomerPnl < 0 ? '#2E7D32' : '#B9ADA3') }} /><span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[#584A43]">{customer.name}</span>{customer.totalCustomerPnl !== null && customer.totalCustomerPnl > 0 && winningTotal > 0 && <span className="shrink-0 text-[9px] tabular-nums text-[#B0A198]">{(customer.totalCustomerPnl / winningTotal * 100).toFixed(1)}%</span>}</div>
        <div className={`mt-0.5 pl-3.5 text-[11px] font-semibold tabular-nums ${customer.totalCustomerPnl === null ? 'text-[#B0A198]' : customer.totalCustomerPnl < 0 ? 'text-[#2E7D32]' : 'text-[#C62828]'}`}>{customer.totalCustomerPnl === null ? '暂未估值' : `${customer.totalCustomerPnl < 0 ? '亏损' : '盈利'} ${amount(customer.totalCustomerPnl)}`}</div>
      </div>)}
    </div>
    {unpricedCount > 0 && <div className="border-t border-[#F2ECE7] px-3.5 py-2 text-[10px] text-[#B49A78]">{unpricedCount} 位客户暂未估值，未计入饼图及盈利合计。</div>}
    {losingTotal < 0 && <div className="px-3.5 pb-2 text-[9px] text-[#AA9C93]">饼图仅展示盈利分布；亏损单独列出，不作为盈利占比。</div>}
    </div>
  </details>;
}
