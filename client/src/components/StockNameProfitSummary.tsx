import { useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { StockSummaryImageDownload } from './StockSummaryImageDownload';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from './ui/dropdown-menu';
import { parsePortfolioInstrument, portfolioDisplaySymbol, portfolioQuantityUnit } from '@shared/portfolio-instruments';

type StockProfitRow = {
  stockName: string;
  symbol: string;
  lotId: number;
  state: 'holding' | 'closed';
  openingValue: number | null;
  pnl: number | null;
  /** The quantity belonging to this portion: remaining for holding, sold for closed. */
  quantity?: number | null;
};

const money = (value: number | null, signed = false) => value === null ? '暂未估值' : `${signed ? value < 0 ? '−' : '+' : ''}¥${Math.abs(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const tone = (value: number | null) => value === null ? 'text-gray-400' : value >= 0 ? 'text-[#C62828]' : 'text-[#2E7D32]';
const sum = (values: (number | null)[]) => values.some(value => value === null || !Number.isFinite(value)) ? null : values.reduce<number>((total, value) => total + value!, 0);
const chartColors = ['#426AB3', '#D89446', '#50A58F', '#A277B7', '#DC7D87', '#65A9C0', '#A3A85B', '#AF795D', '#788AAF', '#89B39C'];

/** Display only. Preserve security IDs and the original full-name grouping. */
const valueStockName = (name: string, symbols: string[]) => {
  const instruments = symbols.map(parsePortfolioInstrument);
  return instruments.length && instruments.every(instrument => instrument?.market === 'US')
    ? Array.from(new Set(instruments.map(instrument => instrument!.symbol))).join(' / ') : name;
};

const stockQuantityText = (orders: StockProfitRow[]) => {
  const bySymbol = new Map<string, { symbol: string; quantities: (number | null)[] }>();
  for (const order of orders) {
    const symbol = parsePortfolioInstrument(order.symbol)?.symbol ?? order.symbol;
    const group = bySymbol.get(symbol) ?? { symbol, quantities: [] };
    group.quantities.push(typeof order.quantity === 'number' && Number.isFinite(order.quantity) && order.quantity >= 0 ? order.quantity : null);
    bySymbol.set(symbol, group);
  }
  return Array.from(bySymbol.values(), group => {
    const quantity = sum(group.quantities);
    const unit = portfolioQuantityUnit(group.symbol);
    const label = quantity === null || !Number.isFinite(quantity) ? `${unit === '股' ? '股数' : '数量'}待更新`
      : `${quantity.toLocaleString('zh-CN', { maximumFractionDigits: 8 })} ${unit}`;
    // Never add unrelated instrument quantities, especially shares and coins.
    return bySymbol.size > 1 ? `${portfolioDisplaySymbol(group.symbol)} ${label}` : label;
  }).join(' / ');
};

/** Group by the displayed stock name exactly as the administrator requests. */
export default function StockNameProfitSummary({ rows }: { rows: StockProfitRow[] }) {
  const [dimension, setDimension] = useState<'value' | 'pnl' | 'ratio'>('value');
  const [scope, setScope] = useState<'holding' | 'closed' | 'all'>('holding');
  const summaryRef = useRef<HTMLDetailsElement>(null);
  const scopeLabel = scope === 'holding' ? '持仓中' : scope === 'closed' ? '已平仓' : '全部';
  // Filter once before grouping: header, chart and every metric must share the same range.
  // A partially sold lot has separate holding/closed rows, so each share is counted only once.
  const scopedRows = rows.filter(row => scope === 'all' || row.state === scope);
  const byName = new Map<string, StockProfitRow[]>();
  for (const row of scopedRows) {
    const name = row.stockName.trim() || row.symbol;
    const group = byName.get(name) || [];
    group.push(row);
    byName.set(name, group);
  }
  const groups = Array.from(byName, ([name, orders]) => {
    const holding = orders.filter(order => order.state === 'holding');
    const closed = orders.filter(order => order.state === 'closed');
    const floatingPnl = sum(holding.map(order => order.pnl));
    const realizedPnl = sum(closed.map(order => order.pnl));
    const totalPnl = floatingPnl === null || realizedPnl === null ? null : floatingPnl + realizedPnl;
    const openingValue = sum(orders.map(order => order.openingValue));
    const symbols = Array.from(new Set(orders.map(order => order.symbol)));
    return {
      name, symbols, valueName: valueStockName(name, symbols), quantityText: stockQuantityText(orders),
      orderCount: new Set(orders.map(order => order.lotId)).size,
      holdingCount: new Set(holding.map(order => order.lotId)).size,
      closedCount: new Set(closed.map(order => order.lotId)).size,
      floatingPnl, realizedPnl, totalPnl, openingValue,
      percent: totalPnl === null || openingValue === null || openingValue <= 0 ? null : totalPnl / openingValue * 100,
    };
  }).sort((a, b) => Math.abs(b.totalPnl || 0) - Math.abs(a.totalPnl || 0));
  const totalPnl = sum(groups.map(group => group.totalPnl));
  const totalOpeningValue = sum(groups.map(group => group.openingValue));
  const totalRatio = totalPnl === null || totalOpeningValue === null || totalOpeningValue <= 0 ? null : totalPnl / totalOpeningValue * 100;
  const ratioText = (value: number | null) => value === null ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  const compositionTotal = groups.reduce((total, group) => total + Math.abs(group.totalPnl || 0), 0);
  const chartGroups = groups.map((group, index) => ({
    ...group,
    color: chartColors[index % chartColors.length],
    share: group.totalPnl === null || compositionTotal <= 0 ? null : Math.abs(group.totalPnl) / compositionTotal * 100,
  }));
  let chartCursor = 0;
  const chartStops = chartGroups.filter(group => group.share !== null && group.share > 0).map(group => {
    const start = chartCursor;
    chartCursor += group.share!;
    return `${group.color} ${start}% ${chartCursor}%`;
  });
  const signedShare = (group: typeof chartGroups[number]) => group.share === null ? '—' : `${group.totalPnl! < 0 ? '−' : '+'}${group.share.toFixed(1)}%`;
  const metricValue = (group: typeof chartGroups[number]) => dimension === 'value' ? group.openingValue : dimension === 'ratio' ? group.percent : group.totalPnl;
  const metricText = (value: number | null) => dimension === 'ratio' ? ratioText(value) : money(value, dimension === 'pnl');
  const dimensionGroups = [...chartGroups].sort((a, b) => {
    const left = metricValue(a);
    const right = metricValue(b);
    if (left === null) return right === null ? 0 : 1;
    if (right === null) return -1;
    return Math.abs(right) - Math.abs(left);
  });
  const maxDimensionValue = Math.max(0, ...dimensionGroups.map(group => Math.abs(metricValue(group) || 0)));
  const valueExplanation = scope === 'holding'
    ? '开仓市值 = 同名持仓的买入价 × 当前剩余股数之和，不含已平仓部分；不是实时市值。'
    : scope === 'closed'
      ? '开仓市值 = 同名已平仓部分的买入价 × 已卖出股数之和，不是卖出金额。'
      : '开仓市值 = 同名各笔买入价 × 对应股数之和，包含持仓中及已平仓部分；不是实时市值。';
  const pnlExplanation = scope === 'holding'
    ? '盈亏 = 同名当前持仓浮盈，不含已平仓净盈亏，正红负绿。'
    : scope === 'closed'
      ? '盈亏 = 同名已平仓净盈亏，已扣双边手续费，正红负绿。'
      : '盈亏 = 同名持仓浮盈 + 已平仓净盈亏，正红负绿。';

  return <details ref={summaryRef} aria-label="按股票名称合并盈亏汇总" className="group overflow-hidden rounded-2xl border border-[#EADFD8] bg-white shadow-[0_4px_18px_rgba(110,55,30,0.06)]">
    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3.5 py-2 [&::-webkit-details-marker]:hidden">
      <span className="flex min-w-0 items-center gap-1">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="股票汇总统计范围"
              onClick={event => event.stopPropagation()}
              onKeyDown={event => event.stopPropagation()}
              className="inline-flex min-h-11 min-w-0 items-center gap-1.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-[#C62828]/30">
              <span className="whitespace-nowrap text-sm font-semibold text-[#302522]">股票盈亏汇总</span>
              <span className="whitespace-nowrap text-[10px] font-medium text-[#A39288]">{scopeLabel}</span>
              <ChevronDown size={13} data-summary-export-hide="true" className="shrink-0 text-[#AA9080]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" data-summary-export-hide="true"
            onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}
            className="border-[#EADFD8] bg-white text-[#58483F]">
            <DropdownMenuRadioGroup value={scope} onValueChange={nextScope => {
              if (nextScope === 'holding' || nextScope === 'closed' || nextScope === 'all') setScope(nextScope);
            }}>
              {([{ value: 'holding', label: '持仓中' }, { value: 'closed', label: '已平仓' }, { value: 'all', label: '全部' }] as const).map(option => (
                <DropdownMenuRadioItem key={option.value} value={option.value}
                  onSelect={() => { if (summaryRef.current) summaryRef.current.open = true; }}
                  className="min-h-11 text-xs focus:bg-[#FAF3ED] focus:text-[#9B322B]">
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <StockSummaryImageDownload targetRef={summaryRef} title={`股票盈亏汇总-${scopeLabel}`} />
      </span>
      <span className="ml-auto flex min-w-0 items-center gap-2">
        <span aria-live="polite" className={`min-w-0 break-all text-right text-lg font-semibold tabular-nums ${tone(totalPnl)}`}>{money(totalPnl, true)}</span>
        <ChevronDown size={16} className="shrink-0 text-[#B09B8D] transition-transform group-open:rotate-180" />
      </span>
    </summary>
    <div className="border-t border-[#F1E8E1]">
    <div className="px-3.5 pt-2.5 text-[10px] text-[#A39288]">{scopeLabel} · {groups.length} 只股票 · 同名合并 · 人民币</div>
    <div className="border-b border-[#F1E8E1] px-3.5 py-3">
      <div className="flex items-center gap-4">
        <div role="img" aria-label={`各股票盈亏金额构成：${chartGroups.map(group => `${group.name} ${signedShare(group)}`).join('，')}。扇区按绝对值，符号表示盈亏方向，不是涨跌幅。`} className="relative h-[110px] w-[110px] shrink-0 rounded-full border-[5px] border-white shadow-[0_3px_12px_rgba(70,55,35,0.12)]" style={{ background: chartStops.length ? `conic-gradient(from -90deg, ${chartStops.join(', ')})` : '#EEE9E5' }}>
          <div className="absolute inset-[17px] flex flex-col items-center justify-center rounded-full bg-white shadow-[inset_0_1px_5px_rgba(70,35,20,0.07)]"><span className="text-[9px] text-[#AD9A8E]">盈亏构成</span><span className="mt-0.5 text-xl font-semibold tabular-nums text-[#44302A]">{groups.length}<span className="ml-0.5 text-[9px] font-normal text-[#AD9A8E]">只</span></span></div>
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">{chartGroups.map(group => <div key={group.name} className="flex items-center gap-1.5 text-[10px]"><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: group.color }} /><span className="min-w-0 flex-1 truncate text-[#756258]" title={group.name}>{group.name}</span><span className={`shrink-0 font-medium tabular-nums ${tone(group.totalPnl)}`}>{signedShare(group)}</span></div>)}</div>
      </div>
      <div className="mt-2.5 text-[9px] leading-4 text-[#AA9C93]">扇区按盈亏金额绝对值占比；+ 红色表示盈利，− 绿色表示亏损。这里是盈亏构成占比，不是股票涨跌幅。</div>
    </div>
    <div className="px-3.5 pt-3">
      <div role="tablist" aria-label="股票比较维度" className="grid grid-cols-3 gap-1 rounded-lg bg-[#F3EDE7] p-1">
        {([{ key: 'value', label: '市值' }, { key: 'pnl', label: '盈亏' }, { key: 'ratio', label: '盈亏比' }] as const).map(tab => <button key={tab.key} type="button" role="tab" id={`stock-summary-${tab.key}-tab`} aria-selected={dimension === tab.key} aria-controls="stock-summary-dimension-panel" onClick={() => setDimension(tab.key)} className={`rounded-md py-1.5 text-xs font-medium transition-colors ${dimension === tab.key ? 'bg-white text-[#9B322B] shadow-sm' : 'text-[#A39288]'}`}>{tab.label}</button>)}
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-[10px]"><span className="text-[#A39288]">{dimension === 'value' ? '合计开仓市值' : dimension === 'ratio' ? '整体盈亏比' : '合计盈亏'}（{scopeLabel}）</span><span className={`text-xs font-semibold tabular-nums ${dimension === 'value' ? 'text-[#44342C]' : tone(dimension === 'ratio' ? totalRatio : totalPnl)}`}>{dimension === 'value' ? money(totalOpeningValue) : dimension === 'ratio' ? ratioText(totalRatio) : money(totalPnl, true)}</span></div>
    </div>
    <div role="tabpanel" id="stock-summary-dimension-panel" aria-labelledby={`stock-summary-${dimension}-tab`} className="divide-y divide-[#F2ECE7]">
    {dimensionGroups.length === 0 && <div className="px-3.5 py-6 text-center text-xs text-[#A39288]">{scope === 'all' ? '暂无股票记录' : `暂无${scopeLabel}股票`}</div>}
    {dimensionGroups.map(group => {
      const value = metricValue(group);
      const name = dimension === 'value' ? group.valueName : group.name;
      return <div key={group.name} className="px-3.5 py-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><span data-summary-stock-name="true" className="min-w-0 flex-1 break-words text-xs font-medium text-[#58483F]">{name}</span>{dimension === 'value' && <span data-summary-stock-quantity="true" className="text-right text-[10px] tabular-nums text-[#A39288]">{group.quantityText}</span>}<span data-summary-stock-metric="true" className={`shrink-0 text-xs font-semibold tabular-nums ${dimension === 'value' ? 'text-[#44342C]' : tone(value)}`}>{metricText(value)}</span></div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#F1EAE4]" role="img" aria-label={`${name}${dimension === 'value' ? '合计开仓市值' : dimension === 'ratio' ? '盈亏比' : '总盈亏'} ${metricText(value)}`}><div className={`h-full rounded-full transition-[width] duration-300 ${dimension !== 'value' ? value !== null && value < 0 ? 'bg-gradient-to-r from-[#B7D7BA] to-[#3E8B53]' : 'bg-gradient-to-r from-[#F0B0A7] to-[#CB4542]' : ''}`} style={{ width: `${maxDimensionValue > 0 && value !== null ? Math.abs(value) / maxDimensionValue * 100 : 0}%`, backgroundColor: dimension === 'value' ? group.color : undefined }} /></div>
      </div>;
    })}</div>
    <div className="border-t border-[#F2ECE7] bg-[#FFFCFA] px-3.5 py-2 text-[9px] leading-4 text-[#A39288]">{dimension === 'value' ? valueExplanation : dimension === 'ratio' ? `盈亏比 = 所选范围总盈亏 ÷ 对应合计开仓市值 × 100%，当前统计${scopeLabel}，正红负绿。整体按合计金额计算，不直接平均各股百分比。` : pnlExplanation} {dimension === 'ratio' ? '条长按盈亏比绝对值比较。' : '各页独立比例尺，同页条长与人民币金额成正比。'}</div>
    </div>
  </details>;
}
