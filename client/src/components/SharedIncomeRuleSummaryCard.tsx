import type { ReactNode } from "react";

export type SharedIncomeRuleSummaryCardProps = {
  number: number;
  category: string;
  title: string;
  introduction?: ReactNode;
  steps: Array<{ label: string; content: ReactNode }>;
  footer?: ReactNode;
  canManage: boolean;
  onConfigure: () => void;
};

/** 规则入口统一：外部三步简明说明，管理员进入设置后再查看公式及滑条。 */
export function SharedIncomeRuleSummaryCard({
  number, category, title, introduction, steps, footer, canManage, onConfigure,
}: SharedIncomeRuleSummaryCardProps) {
  return <article className="t0-income-guide t0-rule-summary rounded-[4px] border border-slate-200 bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]" data-rule-tone={number === 2 ? "market" : number === 3 ? "annualized" : number === 4 ? "contribution" : number === 5 ? "market-growth" : "principal"} aria-label={`${title}说明`}>
    <div className="flex items-start justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="t0-rule-number flex h-6 w-6 shrink-0 items-center justify-center text-[13px] font-bold">{number}</span>
        <div className="min-w-0">
          <div className="t0-rule-category text-[9px] font-semibold">{category}</div>
          <h3 className="text-[13px] font-bold text-slate-900">{title}</h3>
        </div>
      </div>
      {canManage && <button type="button" data-html2canvas-ignore="true" onClick={onConfigure} className="t0-weight-button inline-flex h-7 shrink-0 items-center gap-1 rounded-[4px] border border-slate-200 px-2 text-[10px] font-bold active:scale-[0.98]">
        权重
      </button>}
    </div>
    {introduction && <p className="mt-2 text-[10px] leading-4 text-slate-500">{introduction}</p>}
    <div className="mt-1.5 divide-y divide-slate-100 border-y border-slate-100">
      {steps.map((step) => <div key={step.label} className="py-1.5">
        <p className="text-[13px] font-medium leading-4 text-slate-700"><b className="font-semibold text-slate-900">{step.label}：</b>{step.content}</p>
      </div>)}
    </div>
    {footer && <div className="mt-2 text-center text-[8px] leading-4 text-slate-400">{footer}</div>}
  </article>;
}
