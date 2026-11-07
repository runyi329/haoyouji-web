import { useId } from "react";
import { ArrowLeft } from "lucide-react";
import { SharedIncomeRuleSummaryCard } from "@/components/SharedIncomeRuleSummaryCard";
import { DEFAULT_SHARED_CONTRIBUTION_RULE, type SharedContributionRule } from "@shared/t0-shared-contribution-rule";

export type { SharedContributionRule } from "@shared/t0-shared-contribution-rule";
export { DEFAULT_SHARED_CONTRIBUTION_RULE } from "@shared/t0-shared-contribution-rule";

export type SharedContributionPreviewRow = {
  userId: string;
  name: string;
  outgoingAmount: number;
  outgoingCount: number;
  incomingAmount: number;
  incomingCount: number;
  /** 父级同源试算返回的本项占比，范围 0–100；组件不重新计算。 */
  weightPercentage: number;
};

export type T0SharedContributionRuleSummaryProps = {
  canManage: boolean;
  onConfigure: () => void;
};

export type T0SharedContributionRuleSettingsPageProps = {
  rule: SharedContributionRule;
  onChange: (rule: SharedContributionRule) => void;
  onClose: () => void;
  onSaveAndExit: () => void;
  rows: SharedContributionPreviewRow[];
  isPreview?: boolean;
  isSaving?: boolean;
  saveError?: string | null;
  saveDisabled?: boolean;
};

const dimensions: Array<{
  key: keyof SharedContributionRule;
  label: string;
  description: string;
}> = [
  {
    key: "outgoing",
    label: "对外贡献",
    description: "共享支出金额与出单次数分别标准化后，对有有效数据的维度等份综合；合并后仍只占对外贡献这一个内部维度。",
  },
  {
    key: "incomingAmount",
    label: "收入金额",
    description: "按参与人中累计收到的最高金额减去个人累计收到金额计算补差，再标准化；累计收到越少，补差权重越高。",
  },
  {
    key: "incomingCount",
    label: "收入次数",
    description: "按参与人中累计收到的最高次数减去个人累计收到次数计算补差，再标准化；累计收到次数越少，补差权重越高。",
  },
];

const cardClass = "min-w-0 rounded-[4px] border border-blue-100 bg-white px-3 py-3 text-[10px] leading-4 text-slate-700";
const headingClass = "text-[13px] font-bold text-slate-900";
const amountFormatter = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const countFormatter = new Intl.NumberFormat("zh-CN");

export function T0SharedContributionRuleSummary({
  canManage,
  onConfigure,
}: T0SharedContributionRuleSummaryProps) {
  return (
    <SharedIncomeRuleSummaryCard
      number={4}
      category="共享平衡"
      title="共享收支对共享收益的影响"
      steps={[
        { label: "对外贡献", content: "结合共享支出金额与次数计权。" },
        { label: "收入金额", content: "累计收到越少，补差权重越高。" },
        { label: "收入次数", content: "累计收到次数越少，补差权重越高。" },
      ]}
      canManage={canManage}
      onConfigure={onConfigure}
    />
  );
}

/** 仅由已获管理权限的父级打开；草稿、保存、资格及全部试算均由父级管理。 */
export function T0SharedContributionRuleSettingsPage({
  rule,
  onChange,
  onClose,
  onSaveAndExit,
  rows,
  isPreview = false,
  isSaving = false,
  saveError = null,
  saveDisabled = false,
}: T0SharedContributionRuleSettingsPageProps) {
  const id = useId();

  return (
    <div
      className="fixed inset-0 z-[160] flex flex-col bg-slate-100 t0-income-guide t0-income-guide-settings t0-shared-contribution-rule"
      role="dialog"
      aria-modal="true"
      aria-label="共享收支贡献权重设置"
    >
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4">
          <button type="button" onClick={onClose} disabled={isSaving} aria-label="取消并返回方案说明" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] text-slate-700 active:bg-slate-100 disabled:opacity-40">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-900">共享收支贡献 · 权重</div>
          <div className="truncate text-[10px] text-slate-400">保存后用于之后的手动平仓共享分配</div>
        </div>
        <button type="button" onClick={() => onChange({ ...DEFAULT_SHARED_CONTRIBUTION_RULE })} disabled={isSaving} className="shrink-0 rounded-[4px] border border-slate-300 px-2 py-1.5 text-[10px] text-slate-600 active:bg-slate-50 disabled:opacity-40">
          恢复默认
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <main className="mx-auto w-full max-w-md space-y-3">
          <section className="rounded-[4px] border border-blue-200 bg-blue-50/50 px-3 py-2 text-[10px] leading-4 text-blue-800">
            <h2 className="text-[12px] font-bold text-blue-950">一项共享收支，三个内部维度</h2>
            <p className="mt-1">三条滑杆调节相对影响比重，不要求相加等于 1。默认 1.00 / 1.00 / 1.00 表示三维同等作用；全部为 0 时，本项由有效参与人全员均分。</p>
            <p className="mt-1">保留原共享三项的固定保障：20% 全员均分，80% 按综合分倾斜。均分保障不是第四条可调权重。</p>
            <p className="mt-1 text-[9px] text-blue-800/80">滑杆只向父级提交草稿，保存后才作用于试算；不改变实际历史共享支出、收到金额或次数。</p>
          </section>

          <fieldset disabled={isSaving} className="space-y-3">
          {dimensions.map(({ key, label, description }) => (
            <section key={key} className={cardClass} aria-label={`${label}内部权重`}>
              <label htmlFor={`${id}-${key}`} className={headingClass}>{label}</label>
              <p id={`${id}-${key}-help`} className="mt-1 text-slate-500">{description}</p>
              <output htmlFor={`${id}-${key}`} className="my-2 block text-center text-[20px] font-semibold tabular-nums text-blue-700">
                {rule[key].toFixed(2)}
              </output>
              <input
                id={`${id}-${key}`}
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={rule[key]}
                onChange={(event) => onChange({ ...rule, [key]: Number(event.target.value) })}
                aria-describedby={`${id}-${key}-help`}
                aria-valuetext={rule[key].toFixed(2)}
                className="block h-3 w-full cursor-pointer accent-blue-700"
              />
              <div className="mt-2 flex justify-between gap-3 text-[9px] text-slate-400">
                <span>0 · 关闭该维度</span>
                <span>1 · 完整相对强度</span>
              </div>
            </section>
          ))}
          </fieldset>

          <section className="rounded-[4px] border border-slate-200 bg-slate-50 px-2.5 py-2 text-[10px] leading-4 text-slate-700">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className={headingClass}>{isPreview ? "本次共享收支试算" : "共享收支实际试算"}</h2>
              <span className="shrink-0 text-[9px] text-slate-500">蓝条 = 本项新权重</span>
            </div>
            <p className="mt-1 text-[9px] text-slate-500">仅展示父级提供的真实参与人及同源预览结果，不在此重新计算，也不代表正式确认或实际进出账。</p>
            {rows.length > 0 ? (
              <div className="mt-2 overflow-x-auto rounded-[4px] border border-slate-200 bg-white">
                <table className="w-full table-fixed text-[9px] tabular-nums">
                  <caption className="sr-only">实际参与人的共享支出、累计收到及共享收支新权重</caption>
                  <thead className="border-b border-slate-200 bg-slate-100 text-slate-600">
                    <tr>
                      <th scope="col" className="w-[19%] px-1.5 py-2 text-left font-semibold">姓名</th>
                      <th scope="col" className="w-[29%] px-1 py-2 text-center font-semibold">共享支出<span className="block font-normal">金额 / 次数</span></th>
                      <th scope="col" className="w-[29%] px-1 py-2 text-center font-semibold">收到<span className="block font-normal">金额 / 次数</span></th>
                      <th scope="col" className="w-[23%] px-1.5 py-2 text-right font-semibold">新权重</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.userId} className="border-b border-slate-100 last:border-b-0">
                        <th scope="row" className="break-words px-1.5 py-2 text-left font-medium text-slate-800">{row.name}</th>
                        <td className="break-all px-1 py-2 text-center">
                          <span className="block">{amountFormatter.format(row.outgoingAmount)} U</span>
                          <span className="block text-slate-400">{countFormatter.format(row.outgoingCount)} 次</span>
                        </td>
                        <td className="break-all px-1 py-2 text-center">
                          <span className="block">{amountFormatter.format(row.incomingAmount)} U</span>
                          <span className="block text-slate-400">{countFormatter.format(row.incomingCount)} 次</span>
                        </td>
                        <td className="px-1.5 py-2 text-right">
                          <span className="font-semibold text-blue-700">{row.weightPercentage.toFixed(2)}%</span>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-[4px] bg-blue-100" aria-hidden="true">
                            <div className="h-full bg-blue-600" style={{ width: `${row.weightPercentage}%` }} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-2 rounded-[4px] border border-slate-200 bg-white px-3 py-3 text-center text-slate-500">请先打开平仓共享面板，才能查看实际试算。</p>
            )}
          </section>

          <section className={`${cardClass} space-y-2`}>
            <h2 className={headingClass}>计算方法与固定口径</h2>
            <div className="space-y-1 rounded-[4px] border border-blue-100 bg-blue-50/50 px-2 py-2 text-[9px] text-blue-800">
              <p>W = 20% / N + 80% × 三维综合分</p>
              <p>三维综合分 = Σ（启用维度强度 × 标准化个人分）/ Σ启用强度</p>
              <p>全部强度为 0：W = 1 / N；N 为本次有效参与人数。</p>
            </div>
            <p>先将每个维度的个人分除以该维度参与人的总分，再按强度综合；无可评分数据或总分为 0 的维度，所有有效参与人均取 1 / N，不遗漏任何人。</p>
            <p>收入金额补差 = 最高累计收到金额 − 个人累计收到金额；收入次数补差 = 最高累计收到次数 − 个人累计收到次数。基准是最高值，不是平均值。</p>
            <p>对外贡献沿用原共享支出历史口径，包含原净收益贡献；金额与出单次数各自标准化，仅有有效数据的外支出子维度等份综合。多个外支出子维度合并后只占一个内部维度，不另开子池、不重复计预算。</p>
            <p>共享收支只占一个总预算子池，金额与次数量纲不同，不能将原始 U 金额直接加次数，也不能以共享支出减收到金额的净额代替三维计权。</p>
            <p className="text-slate-500">真实 0 金额、0 次数按 0 展示及参与计算，不视为缺失。所有标准化、有效数据判断及权重计算由父级完成；这里只管理受控输入和展示。</p>
          </section>

          <section className="rounded-[4px] border border-blue-200 bg-blue-50/50 px-3 py-2 text-[10px] leading-4 text-blue-800">
            <h2 className="text-[12px] font-bold text-blue-950">试算与实际账目分开</h2>
            <p className="mt-1">拖动即时试算；保存后用于之后的手动平仓共享分配，确认时系统按实际价格与数量复算并固化快照。不改变历史到账；内部参数仅供管理员设置，公开规则摘要不展示具体参数。</p>
          </section>
        </main>
      </div>

      <footer className="shrink-0 border-t border-slate-200 bg-white px-3 py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto flex w-full max-w-md gap-2">
          {isSaving && <p className="flex-1 self-center text-[10px] text-slate-500">正在保存，请稍候…</p>}
          {saveError && <p role="alert" className="flex-1 self-center break-words text-[10px] text-rose-600">{saveError}</p>}
          <button type="button" onClick={onClose} disabled={isSaving} className="h-10 shrink-0 rounded-[4px] border border-slate-200 bg-white px-4 text-[12px] font-semibold text-slate-700 active:scale-[0.99] disabled:opacity-40">取消</button>
          <button type="button" onClick={onSaveAndExit} disabled={isSaving || saveDisabled} className="h-10 min-w-0 flex-1 rounded-[4px] bg-blue-700 px-4 text-[12px] font-semibold text-white active:scale-[0.99] disabled:opacity-40">{isSaving ? "保存中…" : "保存并退出"}</button>
        </div>
      </footer>
    </div>
  );
}
