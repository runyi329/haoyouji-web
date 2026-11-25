import { useState } from 'react';

export type ParticipantStockProfit = {
  stockName: string;
  pnl: number | null;
  status: 'active' | 'closed';
};

type ProfitScope = 'all' | ParticipantStockProfit['status'];
const scopes: { id: ProfitScope; label: string }[] = [
  { id: 'active', label: '进行中' },
  { id: 'closed', label: '已结束' },
  { id: 'all', label: '全部' },
];
const amount = (value: number | null) => value === null ? '暂未估值' : `${value > 0 ? '+' : value < 0 ? '−' : ''}¥${Math.abs(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** This participant's remaining holdings and frozen closed gains, grouped after filtering. */
export default function StockParticipantProfitChart({ rows }: { rows: ParticipantStockProfit[] }) {
  const [scope, setScope] = useState<ProfitScope>('active');
  const scopeCount = (filter: ProfitScope) => new Set(rows
    .filter(row => filter === 'all' || row.status === filter)
    .map(row => row.stockName.trim() || '股票')).size;
  const byName = new Map<string, (number | null)[]>();
  rows.filter(row => scope === 'all' || row.status === scope).forEach(row => {
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
  if (rows.length === 0) return null;

  const positiveMax = Math.max(0, ...groups.map(group => group.pnl === null ? 0 : group.pnl));
  const negativeMax = Math.max(0, ...groups.map(group => group.pnl === null ? 0 : -group.pnl));
  const range = positiveMax + negativeMax;
  const origin = range > 0 ? negativeMax / range * 100 : 0;
  const compositionTotal = groups.reduce((sum, group) => sum + Math.abs(group.pnl || 0), 0);
  const scopeLabel = scopes.find(item => item.id === scope)!.label;
  // 与当前可见的同名合并行一致；未知盈亏不当成0，也不借用其他标签的金额。
  const totals = groups.some(group => group.pnl === null) ? { profit: null, loss: null, net: null } : {
    profit: groups.reduce((sum, group) => sum + Math.max(0, group.pnl!), 0),
    loss: groups.reduce((sum, group) => sum + Math.min(0, group.pnl!), 0),
    net: groups.reduce((sum, group) => sum + group.pnl!, 0),
  };

  return <section aria-label="我的股票盈亏对比" className="mt-3 overflow-hidden rounded-xl border border-white/70 bg-white/95 px-3 py-2 shadow-[0_2px_8px_rgba(100,20,20,0.06)]">
    <div role="tablist" aria-label="股票盈亏状态" className="mb-2 grid grid-cols-3 gap-1 rounded-lg bg-[#F4EFEA] p-0.5">
      {scopes.map(item => <button key={item.id} type="button" role="tab" data-profit-scope={item.id} aria-selected={scope === item.id} onClick={() => setScope(item.id)} className={`min-h-9 whitespace-nowrap rounded-md px-2 text-[11px] font-medium transition-colors ${scope === item.id ? 'bg-white text-[#B42625] shadow-sm' : 'text-[#9A8980]'}`}>{item.label}<span data-profit-count className="text-[10px] tabular-nums">（{scopeCount(item.id)}）</span></button>)}
    </div>
    <div role="tabpanel" aria-label={`${scopeLabel}股票盈亏`}>
      <div role="list" className="space-y-1 py-0.5">
        {groups.map(group => {
          const value = group.pnl;
          const negative = value !== null && value < 0;
          const barWidth = value !== null && range > 0 ? Math.abs(value) / range * 100 : 0;
          const barLeft = negative ? origin - barWidth : origin;
          const share = value !== null && compositionTotal > 0 ? Math.abs(value) / compositionTotal * 100 : null;
          return <div key={group.name} role="listitem" aria-label={`${group.name} ${amount(value)}`} className="relative h-[18px] overflow-hidden rounded-sm bg-[#F4EFEA]">
            {value !== null && <div aria-hidden="true" className={`absolute top-0 h-full rounded-sm ${negative ? 'bg-gradient-to-r from-[#DFEEE2] to-[#AED2B5]' : 'bg-gradient-to-r from-[#F4DDD7] to-[#EDB5AC]'}`} style={{ left: `${barLeft}%`, width: `${barWidth}%` }} />}
            {negativeMax > 0 && <span aria-hidden="true" className="absolute inset-y-0 border-l border-[#B8A394]/60" style={{ left: `${origin}%` }} />}
            <div className="relative z-10 flex h-full items-center justify-between gap-2 px-2">
              <span className="min-w-0 truncate text-[10px] leading-4 text-[#5F4840]" title={group.name}>{group.name}</span>
              <span className={`shrink-0 whitespace-nowrap text-right text-[11px] leading-4 font-semibold tabular-nums ${value === null ? 'text-gray-400' : negative ? 'text-[#2E7D32]' : 'text-[#B42625]'}`} title={share === null ? undefined : `盈亏金额占比 ${share.toFixed(1)}%`}>{amount(value)}</span>
            </div>
          </div>;
        })}
      </div>
      {groups.length === 0 && <div className="py-3 text-center text-[11px] text-[#A8968B]">暂无{scopeLabel}股票</div>}
    </div>
    <div className="mt-1.5 border-t border-[#F2E8E2] pt-1.5 text-[9px] leading-4 text-[#A8968B]">{scopeLabel} · 同名合并 · 人民币盈亏 · 正红负绿{negativeMax > 0 ? ' · 竖线为零点' : ''}</div>
    <div aria-label={`${scopeLabel}盈亏总计`} aria-live="polite" className="mt-1.5 border-t border-[#F2E8E2] pt-2">
      {([
        { label: '合计', value: totals.net, tone: totals.net !== null && totals.net < 0 ? 'text-[#2E7D32]' : 'text-[#B42625]' },
      ]).map(item => <div key={item.label} aria-label={`${item.label} ${amount(item.value)}`} className="flex min-w-0 items-center justify-between gap-2">
        <div className="text-[9px] leading-4 text-[#A8968B]">{item.label}</div>
        <div className={`break-words text-[11px] leading-4 font-semibold tabular-nums ${item.value === null ? 'text-gray-400' : item.tone}`}>{amount(item.value)}</div>
      </div>)}
    </div>
  </section>;
}
