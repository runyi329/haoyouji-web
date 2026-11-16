import React from 'react';
import { Plus, X } from 'lucide-react';

export type TagMarginStockSaleEdit = { quantity: string; price: string };
export type TagMarginStockSaleEditPatch = { purchasePrice?: string; sales?: TagMarginStockSaleEdit[] };

type Props = {
  quantity: string;
  purchasePrice: string;
  sales: TagMarginStockSaleEdit[];
  onChange: (patch: TagMarginStockSaleEditPatch) => void;
};

/** Registration only: edits the current guarantee draft, never submits a broker order. */
export function TagMarginStockSaleEditor({ quantity, purchasePrice, sales, onChange }: Props) {
  const originalQuantity = Number(quantity);
  const soldQuantity = sales.reduce((sum, sale) => {
    const value = Number(sale.quantity);
    return sum + (Number.isFinite(value) && value > 0 ? value : 0);
  }, 0);
  const remainingQuantity = Number.isFinite(originalQuantity) ? originalQuantity - soldQuantity : 0;
  const updateSale = (index: number, patch: Partial<TagMarginStockSaleEdit>) => {
    onChange({ sales: sales.map((sale, i) => i === index ? { ...sale, ...patch } : sale) });
  };
  const fillRemaining = (index: number) => {
    const others = sales.reduce((sum, sale, i) => {
      const value = Number(sale.quantity);
      return sum + (i !== index && Number.isFinite(value) && value > 0 ? value : 0);
    }, 0);
    if (Number.isFinite(originalQuantity) && originalQuantity > others) updateSale(index, { quantity: String(originalQuantity - others) });
  };
  const fieldStyle = { borderColor: '#BFDBFE', backgroundColor: '#FFFFFF' };
  return (
    <div className="mt-2 space-y-2" data-tag-margin-stock-sale-editor>
      <label className="block">
        <span className="mb-1 block text-[11px] text-blue-800">买入价（保留）</span>
        <input aria-label="买入价（保留）" type="number" inputMode="decimal" min="0" step="any"
          value={purchasePrice} onChange={(event) => onChange({ purchasePrice: event.target.value })}
          placeholder="未登记，可补填实际买入价" className="w-full min-w-0 rounded-lg border px-2 py-1.5 text-xs outline-none" style={fieldStyle} />
      </label>
      {sales.map((sale, index) => (
        <div key={index} className="rounded-lg border border-blue-200 bg-white/70 p-2" data-stock-sale-row={index}>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-blue-800">第{index + 1}笔卖出</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => fillRemaining(index)} disabled={!Number.isFinite(originalQuantity) || originalQuantity <= 0}
                className="text-[11px] font-medium text-blue-600 disabled:opacity-40" title="填写除其他卖出记录以外的全部剩余股数">剩余全卖</button>
              <button type="button" aria-label={`移除第${index + 1}笔卖出`} onClick={() => onChange({ sales: sales.filter((_, i) => i !== index) })}
                className="flex h-5 w-5 items-center justify-center rounded-full text-red-400"><X className="h-3 w-3" /></button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="min-w-0">
              <span className="mb-1 block text-[10px] text-slate-500">卖出股数</span>
              <input aria-label={`第${index + 1}笔卖出股数`} type="number" inputMode="numeric" min="1" step="1"
                value={sale.quantity} onChange={(event) => updateSale(index, { quantity: event.target.value })}
                placeholder="部分 / 全部股数" className="w-full min-w-0 rounded-lg border px-2 py-1.5 text-xs outline-none" style={fieldStyle} />
            </label>
            <label className="min-w-0">
              <span className="mb-1 block text-[10px] text-slate-500">卖出价格（元 / 股）</span>
              <input aria-label={`第${index + 1}笔卖出价格`} type="number" inputMode="decimal" min="0" step="any"
                value={sale.price} onChange={(event) => updateSale(index, { price: event.target.value })}
                placeholder="实际成交价" className="w-full min-w-0 rounded-lg border px-2 py-1.5 text-xs outline-none" style={fieldStyle} />
            </label>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => onChange({ sales: [...sales, { quantity: '', price: '' }] })}
          disabled={!Number.isFinite(originalQuantity) || originalQuantity <= 0 || remainingQuantity <= 0}
          className="flex items-center gap-1 text-[11px] font-medium text-blue-600 disabled:opacity-40"><Plus className="h-3 w-3" />登记卖出</button>
        {sales.length > 0 && <span className="text-[10px] text-slate-500">已卖 {soldQuantity.toLocaleString('zh-CN')} 股 · 剩余 {Math.max(0, remainingQuantity).toLocaleString('zh-CN')} 股</span>}
      </div>
      {sales.length > 0 && <div className="text-[10px] leading-4 text-blue-700">已卖部分按成交价保留价值，剩余股票按参考价估值；全部卖出后不再随行情变动。这里只登记，不发起实际交易。</div>}
    </div>
  );
}
