import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { OrderCardImageDownload } from "@/components/OrderCardImageDownload";

export type T0TeamAnnualizedDetail = {
  userId: number;
  name: string;
  asOfDate: string;
  cumulativeDepositAmount: number;
  cumulativeWithdrawalAmount: number;
  currentCumulativeIncome: number;
  currentNetValue: number;
  annualizedReturn: number | null;
  firstInvestmentDate: string | null;
  daysHeld: number;
  orderIncome: number;
  commissionIncome: number;
  sharedIncome: number;
  cashFlows: Array<{
    kind: "deposit" | "withdrawal" | "terminal";
    occurredOn: string;
    amount: number;
    daysFromStart: number;
    atEndOfBeijingDay: boolean;
  }>;
  groupedCashFlows: Array<{
    occurredOn: string;
    amount: number;
    daysFromStart: number;
    atEndOfBeijingDay: boolean;
  }>;
  unavailableReason: string | null;
};

const amountText = (amount: number, signed = false) => `${signed && amount > 0 ? "+" : ""}${amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
const incomeText = (amount: number, signed = false) => `${signed && amount > 0 ? "+" : ""}${amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateText = (value: string | null) => {
  if (!value) return "—";
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return parts ? `${parts[1]}年${Number(parts[2])}月${Number(parts[3])}日` : value;
};
const amountColor = (amount: number) => amount < 0 ? "text-emerald-600" : "text-rose-600";

export function T0TeamAnnualizedDialog({ detail, memberName, loading, error, onClose, onRetry, formatRate }: {
  detail?: T0TeamAnnualizedDetail;
  memberName: string;
  loading: boolean;
  error?: string;
  onClose: () => void;
  onRetry: () => void;
  formatRate: (rate: number | null) => string;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const annualizedReportRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      const sourceDialog = closeButton.current?.closest('[role="dialog"]');
      if (event.target instanceof Node && sourceDialog && !sourceDialog.contains(event.target)) return;
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const dialog = closeButton.current?.closest('[role="dialog"]');
        const focusable = Array.from(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), summary, [tabindex="0"]') || []);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); previousFocus?.focus(); };
  }, [onClose]);

  const rate = detail?.annualizedReturn ?? null;
  const canDiscount = rate !== null && Number.isFinite(rate) && rate > -1;
  const presentValues = detail?.groupedCashFlows.map((flow) => canDiscount ? flow.amount / Math.pow(1 + rate!, flow.daysFromStart / 365) : null) || [];
  const residual = canDiscount ? presentValues.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;
  const transactions = detail?.cashFlows.filter((flow) => flow.kind !== "terminal") || [];

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 px-3 py-4" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={annualizedReportRef} role="dialog" aria-modal="true" aria-labelledby="t0-team-annualized-title" className="flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <h2 id="t0-team-annualized-title" className="text-base font-semibold text-slate-900">{detail?.name || memberName} · 年化回报怎么算</h2>
            <p className="mt-1 text-[11px] text-slate-500">先核对金额，再看资金日期，最后得出结果</p>
          </div>
          <div data-card-export-hide="true" className="flex shrink-0 items-center gap-1">
            {detail && <div className="flex h-9 w-9 items-center justify-center [&_button]:h-9 [&_button]:w-9 [&_svg]:h-5 [&_svg]:w-5"><OrderCardImageDownload
              targetRef={annualizedReportRef}
              orderNo={`${detail.name}-${detail.asOfDate}`}
              filenamePrefix="T+0年化回报说明"
              previewTitle="年化回报说明图片预览"
              previewHint="包含此人的全部资金记录、留存结余、XIRR计算及年化结果"
              captureFullContent
              outerPadding={8}
              fullContentHorizontalBleed={0}
              fullContentBottomPadding={0}
              exportBackground="#ffffff"
              color="#4338ca"
              variant="bare"
            /></div>}
            <button ref={closeButton} type="button" onClick={onClose} aria-label="关闭团队年化回报说明" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 active:scale-95"><X className="h-5 w-5" /></button>
          </div>
        </header>
        <div data-card-export-expand="true" className="min-h-0 overflow-y-auto overscroll-contain px-4 pb-4" aria-busy={loading}>
          {!detail ? <div className="py-10 text-center text-xs text-slate-500">
            {error ? <><p className="leading-5 text-rose-600">{error}</p><button type="button" onClick={onRetry} className="mt-3 rounded border border-slate-200 px-5 py-2 text-indigo-700">重新读取</button></> : <p>正在读取此成员用于年化计算的真实资金明细…</p>}
          </div> : <>
            <section className="mt-3">
              <h3 className="text-xs font-semibold text-slate-800">① 先核对金额</h3>
              <div className="mt-2 grid grid-cols-3 divide-x divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-center tabular-nums">
                {[
                  { label: "累计投入 · U", value: detail.cumulativeDepositAmount },
                  { label: "累计提现 · U", value: detail.cumulativeWithdrawalAmount },
                  { label: "已实现收益 · U", value: detail.currentCumulativeIncome },
                ].map((row) => <div key={row.label} className="min-w-0 px-1.5 py-2"><div className="text-[10px] text-slate-500">{row.label}</div><div className="mt-1 break-all text-[12px] font-semibold leading-4 text-slate-800">{row.label === "已实现收益 · U" ? incomeText(row.value) : amountText(row.value)}</div></div>)}
              </div>
              <details data-card-export-expand="true" className="mt-1.5 text-[10px] leading-5 text-slate-500">
                <summary className="cursor-pointer">收益组成</summary>
                <div className="mt-1 break-words tabular-nums">本人订单 {incomeText(detail.orderIncome)}＋收到分佣 {incomeText(detail.commissionIncome)}＋已到账共享 {incomeText(detail.sharedIncome)}＝{incomeText(detail.currentCumulativeIncome)} U</div>
                <p>只统计非期权已实现收益，不含未平仓浮盈亏、期权相关收益或钱包余额。</p>
              </details>
            </section>

            <section className="mt-3">
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1"><h3 className="text-xs font-semibold text-slate-800">② 资金明细与年化计算</h3><span className="text-[10px] tabular-nums text-slate-400">截至 {detail.asOfDate} · 北京时间</span></div>
              <div className="mt-1.5 overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full whitespace-nowrap text-[11px] leading-4 tabular-nums">
                  <thead className="bg-slate-50 text-[10px] text-slate-500"><tr><th scope="col" className="px-2 py-1.5 text-left font-medium">日期</th><th scope="col" className="px-1 py-1.5 text-center font-medium">存／取</th><th scope="col" className="px-2 py-1.5 text-right font-medium">金额（U）</th></tr></thead>
                  <tbody>
                    {transactions.length === 0 && <tr><td colSpan={3} className="border-t border-slate-100 px-2 py-2 text-slate-400">暂无有效存取记录</td></tr>}
                    {transactions.map((flow, index) => <tr key={index} className="border-t border-slate-100">
                      <td className="px-2 py-1.5 text-slate-600">{flow.occurredOn}</td>
                      <td className={`px-1 py-1.5 text-center ${amountColor(flow.amount)}`}>{flow.kind === "deposit" ? "存入" : "取出"}</td>
                      <td className={`px-2 py-1.5 text-right font-semibold ${amountColor(flow.amount)}`}>{amountText(flow.amount, true)}</td>
                    </tr>)}
                  </tbody>
                  <tfoot className="border-t border-slate-200 bg-indigo-50/50">
                    <tr><th colSpan={2} scope="row" className="px-2 py-2 text-left text-xs font-semibold text-slate-700">留存（结余）</th><td className={`px-2 py-2 text-right text-xs font-extrabold ${amountColor(detail.currentNetValue)}`}>{incomeText(detail.currentNetValue, true)}</td></tr>
                    <tr><td colSpan={3} className="whitespace-normal px-2 pb-2 text-[10px] leading-4 text-slate-500">结余＝累计投入＋已实现收益－累计提现<br />{amountText(detail.cumulativeDepositAmount)}＋（{incomeText(detail.currentCumulativeIncome, true)}）－{amountText(detail.cumulativeWithdrawalAmount)}＝{incomeText(detail.currentNetValue)} U</td></tr>
                  </tfoot>
                </table>
              </div>
              <p className="mt-1 text-[10px] leading-4 text-slate-400"><span className="text-emerald-600">存入为负</span>，<span className="text-rose-600">取出为正</span>；每笔按实际日期计算。</p>
              <p className="mt-0.5 text-[10px] leading-4 text-slate-400">结余是截至当天的账本净值，不是新增存取记录。</p>

              <div className="mt-3 border-t border-slate-200 pt-2.5">
                <h3 className="text-xs font-semibold text-slate-800">把上面的金额和天数，代入 XIRR</h3>
                <p className="mt-1 text-[10px] leading-5 text-slate-500">r 是要求出的年化率。每笔钱按日期折算，找出让下面各项相加等于0的 r。</p>
                <div className="mt-1 rounded bg-slate-50 px-2 py-2 text-[11px] leading-5 text-slate-700">每笔现金流 ÷（1＋r）<sup>（天数÷365）</sup>，全部相加＝0</div>
                <p className="mt-1 text-[10px] leading-4 text-slate-400">天数从第一笔有效现金流算起，结余按截至日结束计入；同一时点先合并。</p>
                <div className="mt-2 divide-y divide-slate-100 text-[10px] leading-5 tabular-nums">
                  {detail.groupedCashFlows.map((flow, index) => <div key={index} className="flex flex-wrap items-baseline gap-x-2 py-1">
                    <span className="shrink-0 text-slate-400">{flow.occurredOn}{flow.atEndOfBeijingDay ? " 结余" : ""}</span>
                    <span className="min-w-0 break-words text-slate-600">（<b className={`font-semibold ${amountColor(flow.amount)}`}>{flow.atEndOfBeijingDay ? incomeText(flow.amount, true) : amountText(flow.amount, true)}</b>）÷（1＋r）<sup>（{flow.daysFromStart}÷365）</sup></span>
                  </div>)}
                  <div className="pt-1.5 font-semibold text-slate-700">以上各项相加＝0 → 求出年化率 r</div>
                </div>
              </div>
              <div className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50/60 p-3">
                {canDiscount && <div className="mb-1 text-[10px] tabular-nums text-slate-500">求得 r＝{rate!.toPrecision(10)}</div>}
                <div className="text-xs font-medium text-slate-600">年化回报＝r × 100%</div>
                <strong className={`mt-2 block break-all text-2xl tabular-nums ${rate === null ? "text-slate-400" : amountColor(rate)}`}>{formatRate(rate)}</strong>
                {detail.unavailableReason && <p className="mt-2 text-[11px] leading-5 text-amber-700">{detail.unavailableReason}</p>}
              </div>
              <p className="mt-2 text-[10px] leading-5 text-slate-500">这是截至核算日的历史表现折算，不是承诺未来一年能获得这个收益。投入时间很短时，年化数字可能被明显放大。</p>

              <details data-card-export-expand="true" className="mt-3 rounded-lg border border-slate-200 p-3">
                <summary className="cursor-pointer text-[11px] font-medium text-slate-500">查看求得年化率后的折现核对</summary>
                <div className="mt-2 break-words font-mono text-[11px] leading-6 text-indigo-900">Σ [ CFᵢ ÷ (1＋r)^(dᵢ÷365) ]＝0</div>
                <p className="mt-1 text-[10px] leading-5 text-slate-500">投入记负数，提现记正数，期末净值按实际值计入。CFᵢ 为各笔现金流，dᵢ 为距第一笔有效合并现金流的天数，r 为年化回报率，结果显示为 r×100%。同一有效时点的现金流先合并，相抵为零的项不参与求解；普通资金按发生日开始计，期末净值按核算日结束计。</p>
                {canDiscount && <>
                  <div className="mt-2 text-[10px] tabular-nums text-indigo-800">求得 r＝{rate!.toPrecision(12)}</div>
                  <div className="mt-2 divide-y divide-slate-100">
                    {detail.groupedCashFlows.map((flow, index) => <div key={index} className="py-2 text-[10px] leading-5 tabular-nums text-slate-600">
                      <div>{dateText(flow.occurredOn)}{flow.atEndOfBeijingDay ? " · 当日结束" : ""} · d＝{flow.daysFromStart} 天</div>
                      <div className="break-words">{amountText(flow.amount, true)} ÷（1＋r）^（{flow.daysFromStart}÷365）</div>
                      <div className="font-medium text-indigo-700">＝{amountText(presentValues[index]!, true)} U</div>
                    </div>)}
                    <div className="pt-2 text-[10px] font-medium text-indigo-800">各项折现合计 ≈ {amountText(residual!)} U（求解目标为0）</div>
                  </div>
                </>}
                <p className="mt-2 text-[10px] leading-5 text-slate-500">实际使用未四舍五入的金额和r求解，不按屏幕近似百分比倒算。姓名旁的活动开始日不一定是首笔投入日；多次现金流变号时可能存在多个数学解，沿用当前系统求解口径。</p>
              </details>
            </section>
          </>}
        </div>
        <footer data-card-export-hide="true" className="shrink-0 border-t border-slate-100 px-4 py-3"><button type="button" onClick={onClose} className="h-11 w-full rounded-lg bg-indigo-700 text-sm font-semibold text-white active:scale-[0.99]">知道了</button></footer>
      </div>
    </div>
  );
}
