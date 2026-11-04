type ParticipantStockProfit = {
  stockName: string;
  pnl: number | null;
};

const amount = (value: number | null) => value === null ? '暂未估值' : `${value > 0 ? '+' : value < 0 ? '−' : ''}¥${Math.abs(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** This participant's holdings and frozen closed gains, grouped on one CNY scale. */
export default function StockParticipantProfitChart({ rows }: { rows: ParticipantStockProfit[] }) {
  const byName = new Map<string, (number | null)[]>();
  rows.forEach(row => {
    const name = row.stockName.trim() || '股票';
    const values = byName.get(name) || [];
    values.push(row.pnl);
    byName.set(name, values);
  });
  const groups = Array.from(byName, ([name, values]) => ({
    name,
    pnl: values.some(value => value === null || !Number.isFinite(value)) ? null : values.reduce<number>((sum, value) => sum + value!, 0),
  })).sort((a, b) => {
    if (a.pnl === null) return b.pnl === null ? 0 : 1;
    if (b.pnl === null) return -1;
    return Math.abs(b.pnl) - Math.abs(a.pnl);
  });
  if (groups.length === 0) return null;

  const positiveMax = Math.max(0, ...groups.map(group => group.pnl === null ? 0 : group.pnl));
  const negativeMax = Math.max(0, ...groups.map(group => group.pnl === null ? 0 : -group.pnl));
  const range = positiveMax + negativeMax;
  const origin = range > 0 ? negativeMax / range * 100 : 0;
  const compositionTotal = groups.reduce((sum, group) => sum + Math.abs(group.pnl || 0), 0);

  return <section aria-label="我的股票盈亏对比" className="mt-3 overflow-hidden rounded-xl border border-white/70 bg-white/95 px-3 py-2 shadow-[0_2px_8px_rgba(100,20,20,0.06)]">
    <div role="list" className="space-y-1.5 py-1">
      {groups.map(group => {
        const value = group.pnl;
        const negative = value !== null && value < 0;
        const barWidth = value !== null && range > 0 ? Math.abs(value) / range * 100 : 0;
        const barLeft = negative ? origin - barWidth : origin;
        const share = value !== null && compositionTotal > 0 ? Math.abs(value) / compositionTotal * 100 : null;
        return <div key={group.name} role="listitem" aria-label={`${group.name} ${amount(value)}`} className="relative h-7 overflow-hidden rounded-lg bg-[#F4EFEA]">
          {value !== null && <div aria-hidden="true" className={`absolute top-0 h-full rounded-lg ${negative ? 'bg-gradient-to-r from-[#DFEEE2] to-[#AED2B5]' : 'bg-gradient-to-r from-[#F4DDD7] to-[#EDB5AC]'}`} style={{ left: `${barLeft}%`, width: `${barWidth}%` }} />}
          {negativeMax > 0 && <span aria-hidden="true" className="absolute inset-y-0 border-l border-[#B8A394]/60" style={{ left: `${origin}%` }} />}
          <div className="relative z-10 flex h-full items-center justify-between gap-2 px-2.5">
            <span className="min-w-0 truncate text-[10px] leading-4 text-[#5F4840]" title={group.name}>{group.name}</span>
            <span className={`shrink-0 whitespace-nowrap text-right text-[11px] leading-4 font-semibold tabular-nums ${value === null ? 'text-gray-400' : negative ? 'text-[#2E7D32]' : 'text-[#B42625]'}`} title={share === null ? undefined : `盈亏金额占比 ${share.toFixed(1)}%`}>{amount(value)}</span>
          </div>
        </div>;
      })}
    </div>
    <div className="mt-1.5 border-t border-[#F2E8E2] pt-2 text-[9px] leading-4 text-[#A8968B]">含已结束 · 同名合并；条长按人民币盈亏金额比较，正红负绿。{negativeMax > 0 ? ' 竖线为零点。' : ''}</div>
  </section>;
}
