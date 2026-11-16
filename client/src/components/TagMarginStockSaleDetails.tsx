import React from 'react';
import { getTagMarginStockSaleSummary, getTagMarginStockSaleAmounts, type TagMarginStockRecord } from '@shared/tag-margin-assets';

/** Both administrator and read-only member detail use the same sale text. */
export function TagMarginStockSaleDetails({ record }: { record: TagMarginStockRecord }) {
  const summary = getTagMarginStockSaleSummary(record);
  if (record.purchasePrice === undefined && !record.sales?.length && summary.valid) return null;
  const price = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 8 });
  const money = (value: number) => value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const hasFeeSales = Array.isArray(record.sales) && record.sales.some((sale) => sale && Object.prototype.hasOwnProperty.call(sale, 'feeRate'));
  return (
    <div className="mt-0.5 space-y-0.5 text-[10px] leading-4 text-slate-500" data-tag-margin-stock-sale-details>
      <div>买入价：{record.purchasePrice !== undefined && Number.isFinite(record.purchasePrice) && record.purchasePrice > 0 ? `¥${price(record.purchasePrice)}` : '未登记'}</div>
      {!summary.valid ? <div className="text-amber-700">卖出数据待纠正，估值暂不可用</div> : (
        <>
          {record.sales?.map((sale, index) => {
            const amounts = getTagMarginStockSaleAmounts(sale, record.purchasePrice);
            return <div key={index} data-stock-sale-detail={index}>
              <div className="text-blue-600">卖出日期：{sale.date || '未登记'}</div>
              <div>卖出 ¥{price(sale.price)} × {sale.quantity.toLocaleString('zh-CN')}股 = ¥{money(amounts.grossValue)}</div>
              {Object.prototype.hasOwnProperty.call(sale, 'feeRate') && <>
                {record.purchasePrice === undefined && <div>买入价未填，双边手续费按卖出金额计算</div>}
                <div>买入手续费（1‰）：¥{money(amounts.buyFee)} · 卖出手续费（1‰）：¥{money(amounts.sellFee)}</div>
                <div>手续费合计：¥{money(amounts.totalFee)} · 扣费后卖出价值：¥{money(amounts.netValue)}</div>
              </>}
            </div>;
          })}
          {summary.soldQuantity > 0 && (
            <>
              <div className="font-medium text-blue-700">已卖出价值：¥{money(summary.saleValue)}{hasFeeSales ? '（已扣登记手续费）' : ''}</div>
              <div>{summary.remainingQuantity === 0 ? '全部卖出，价值按成交价固定' : `剩余 ${summary.remainingQuantity.toLocaleString('zh-CN')}股按参考价估值`}</div>
            </>
          )}
        </>
      )}
    </div>
  );
}
