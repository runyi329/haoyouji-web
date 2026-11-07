import { useId, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import {
  DEFAULT_WEIGHTED_ORDER_RULE,
  normalizeWeightedOrderRule,
  type WeightedOrderRule,
} from "../../../shared/t0-weighted-order-rule";
import { SharedIncomeRuleSummaryCard } from "@/components/SharedIncomeRuleSummaryCard";

export type T0WeightedOrderRuleSummaryProps = {
  rule: WeightedOrderRule;
  canManage: boolean;
  onConfigure: () => void;
};

export type T0WeightedOrderRuleSettingsPageProps = {
  rule: WeightedOrderRule;
  onChange: (rule: WeightedOrderRule) => void;
  onSaveAndExit: () => void;
  onClose: () => void;
  previewContent?: ReactNode;
  isSaving?: boolean;
  saveError?: string | null;
  saveDisabled?: boolean;
};

export type T0WeightedOrderRuleControlsProps = {
  rule: WeightedOrderRule;
  onChange?: (rule: WeightedOrderRule) => void;
  compact?: boolean;
};

export type T0WeightedOrderRuleGuideProps = {
  rule: WeightedOrderRule;
  onChange?: (rule: WeightedOrderRule) => void;
};

const dimensions: Array<{
  key: keyof WeightedOrderRule;
  label: string;
  symbol: string;
  endpoint: string;
}> = [
  { key: "distanceInfluence", label: "距离影响", symbol: "α", endpoint: "0：半径内不区分远近；1：完整距离衰减" },
  { key: "statusInfluence", label: "成交优先", symbol: "β", endpoint: "0：挂单与成交同系数；1：挂单系数为成交的四分之一" },
  { key: "pnlInfluence", label: "盈亏平衡", symbol: "γ", endpoint: "0：不调整盈亏系数；1：完整用户净浮盈亏调整" },
];

const formatFactor = (value: number) => value.toFixed(2);
const pnlFactor = (rate: number, influence: number) =>
  1 - 0.5 * influence * Math.max(-1, Math.min(1, rate / 0.1));
const cardClass = "min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-3 text-[10px] leading-4 text-slate-700 shadow-sm";
const headingClass = "text-[13px] font-bold text-slate-900";

export function T0WeightedOrderRuleSummary({
  canManage,
  onConfigure,
}: T0WeightedOrderRuleSummaryProps) {
  return (
    <SharedIncomeRuleSummaryCard
      number={2}
      category="市场贡献"
      title="挂单对共享收益的影响"
      steps={[
        { label: "价格远近", content: "价格离本次平仓价越近，贡献值越高。" },
        { label: "成交状态", content: "已成交数量越多，共享收益权重越高。" },
        { label: "持仓浮亏", content: "持仓净浮亏越大，共享收益权重越高。" },
      ]}
      canManage={canManage}
      onConfigure={onConfigure}
    />
  );
}

export function T0WeightedOrderRuleSettingsPage({
  rule,
  onChange,
  onSaveAndExit,
  onClose,
  previewContent,
  isSaving = false,
  saveError = null,
  saveDisabled = false,
}: T0WeightedOrderRuleSettingsPageProps) {
  return (
    <div className="fixed inset-0 z-[160] flex flex-col bg-slate-100 t0-income-guide t0-income-guide-settings" role="dialog" aria-modal="true" aria-label="有效挂单量加权设置">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 shadow-sm">
        <button type="button" onClick={onClose} disabled={isSaving} aria-label="返回方案说明" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-700 active:bg-slate-100 disabled:opacity-40"><ArrowLeft className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-900">有效挂单量加权 · 设置</div>
          <div className="truncate text-[10px] text-slate-400">保存后用于之后的手动平仓共享分配；历史到账不变</div>
        </div>
        <button type="button" onClick={() => onChange({ ...DEFAULT_WEIGHTED_ORDER_RULE })} disabled={isSaving} className="text-[11px] font-semibold text-blue-700 active:opacity-60 disabled:opacity-40">恢复默认</button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <main className="mx-auto w-full max-w-md space-y-3">
          {previewContent}
          <fieldset disabled={isSaving} className="min-w-0 space-y-3">
            <T0WeightedOrderRuleGuide rule={rule} onChange={onChange} />
          </fieldset>
        </main>
      </div>
      <footer className="shrink-0 border-t border-slate-200 bg-white px-3 py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] shadow-[0_-2px_10px_rgba(15,23,42,0.06)]">
        <div className="mx-auto flex w-full max-w-md gap-2">
          {isSaving && <p className="flex-1 self-center text-[10px] text-slate-500">正在保存，请稍候…</p>}
          {saveError && <p role="alert" className="flex-1 self-center break-words text-[10px] text-rose-600">{saveError}</p>}
          <button type="button" onClick={onClose} disabled={isSaving} className="h-10 shrink-0 rounded-lg border border-slate-200 bg-white px-4 text-[12px] font-semibold text-slate-700 active:scale-[0.99] disabled:opacity-40">取消</button>
          <button type="button" onClick={onSaveAndExit} disabled={isSaving || saveDisabled} className="h-10 min-w-0 flex-1 rounded-lg bg-blue-700 px-4 text-[12px] font-semibold text-white shadow-sm active:scale-[0.99] disabled:opacity-40">{isSaving ? "保存中…" : "保存并退出"}</button>
        </div>
      </footer>
    </div>
  );
}

export function T0WeightedOrderRuleControls({
  rule,
  onChange,
}: T0WeightedOrderRuleControlsProps) {
  const id = useId();
  const normalized = normalizeWeightedOrderRule(rule);
  return (
    <>
      <div className="px-1">
        <h3 className={headingClass}>三个权重系数</h3>
        <p className="mt-0.5 text-[9px] leading-4 text-slate-500">{onChange ? "拖动即时试算，保存后应用" : "当前系数 · 只读"}。三项独立调节，不要求相加等于 1；0 为该维度中性，1 为完整影响。距离达到 20% 仍不计权重。</p>
      </div>
      {dimensions.map(({ key, label, symbol, endpoint }) => (
        <section key={key} className={cardClass} aria-label={`${label}系数`}>
          <div className="flex items-baseline justify-between gap-3">
            <label id={`${id}-${key}-label`} htmlFor={`${id}-${key}`} className={headingClass}>{label} · {symbol}</label>
            <output htmlFor={`${id}-${key}`} className="text-[14px] font-bold tabular-nums text-blue-700">{formatFactor(normalized[key])}</output>
          </div>
          {key === "distanceInfluence" && <p className="mt-1 text-slate-500">只调节 20% 半径内的远近差异，不改变固定距离门槛。</p>}
          {key === "statusInfluence" && <p className="mt-1 text-slate-500">当前挂单系数 <b className="text-blue-700">{formatFactor(1 - 0.75 * normalized.statusInfluence)}</b>，已成交系数始终为 <b className="text-blue-700">1.00</b>。</p>}
          {key === "pnlInfluence" && <p className="mt-1 text-slate-500">净盈利率达到 10%：<b className="text-blue-700">{formatFactor(pnlFactor(0.1, normalized.pnlInfluence))}</b>；净亏损率达到 10%：<b className="text-blue-700">{formatFactor(pnlFactor(-0.1, normalized.pnlInfluence))}</b>。挂单盈亏系数始终为 1.00。</p>}
          {onChange ? (
            <div className="mt-2 flex h-8 items-center">
              <input
                id={`${id}-${key}`}
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={normalized[key]}
                onChange={(event) => onChange(normalizeWeightedOrderRule({ ...normalized, [key]: Number(event.target.value) }))}
                aria-describedby={`${id}-${key}-help`}
                className="h-3 w-full cursor-pointer accent-blue-600"
              />
            </div>
          ) : (
            <div className="mt-2 flex h-8 items-center">
              <div role="meter" aria-labelledby={`${id}-${key}-label`} aria-valuemin={0} aria-valuemax={1} aria-valuenow={normalized[key]} className="h-2 w-full overflow-hidden rounded-full bg-blue-100">
                <div className="h-full rounded-full bg-blue-600" style={{ width: `${normalized[key] * 100}%` }} />
              </div>
            </div>
          )}
          <p id={`${id}-${key}-help`} className="text-[9px] font-medium leading-4 text-slate-400">{endpoint}</p>
        </section>
      ))}
    </>
  );
}

export function T0WeightedOrderRuleGuide({ rule, onChange }: T0WeightedOrderRuleGuideProps) {
  const normalized = normalizeWeightedOrderRule(rule);
  const alpha = normalized.distanceInfluence;
  const beta = normalized.statusInfluence;
  const gamma = normalized.pnlInfluence;
  return (
    <>
      <section className="rounded-xl border border-blue-100 bg-blue-50/50 px-2.5 py-2 text-[10px] leading-4 text-blue-800">
        <h2 className="text-[12px] font-bold text-blue-950">按有效数量，不按订单笔数</h2>
        <p className="mt-1 font-mono text-[9px]">剩余 ETH 数量 × 距离系数 × 成交系数 × 用户净盈亏系数 → 分配占比</p>
        <p className="mt-1 text-[9px]">外部三条说明表示其他条件相同时的权重趋势，不代表额外产生收益。数量按有效ETH计算；盈亏按同一用户净浮盈亏率计算，受系数上限约束。固定共享额度内，最终占比由三层权重共同决定。</p>
        <p className="mt-1 text-[8px] leading-3 text-blue-800/70">仅本次试算，公式系数随滑杆即时变化；不代表已发布规则或实际到账。下方表格与场景均为确定性公式示意，非真实用户或订单数据。</p>
      </section>
      <T0WeightedOrderRuleControls rule={normalized} onChange={onChange} compact />
      <section className={`${cardClass} space-y-2`}>
        <h3 className={headingClass}>口径与适用范围</h3>
        <p>仅适用于 ETH 现货与合约的开仓数量，首版不纳入期权、网格。挂单价格使用委托价，已成交价格使用实际开仓价，不使用档位价格。</p>
        <p>多头和空头都按同一个实际平仓价格衡量距离；基础量是 ETH 数量，多空数量相加，不用多空数量相抵。这项按有效数量加权，替代原有按订单笔数的方案。</p>
        <p>参与人仍需已登记本金、开启本单共享资格；本单订单使用者和管理员本人不进入收款清单。这里只调节分配权重，不改变参与资格。</p>
      </section>
      <section className={`${cardClass} space-y-2`}>
        <h3 className={headingClass}>一、距离影响：<span className="text-blue-700">α = {formatFactor(alpha)}</span></h3>
        <p>距离 d = |订单价格 − 实际平仓价格| ÷ 实际平仓价格。<b className="text-blue-700">d ≥ 20% 时直接不计权重</b>；该硬门槛不受任何滑杆影响，α = 0 也不会让远端订单取得资格。</p>
        <div className="rounded-lg border border-blue-100 bg-blue-50/50 px-2 py-1.5 text-blue-800">
          <p>半径内：D = (1 − d ÷ 0.20)²</p>
          <p>有效距离系数 = 1 − α + α × D</p>
        </div>
        <p className="text-[8px] text-slate-400">以下仅为公式演示，非真实用户或订单数据；使用当前距离影响系数。</p>
        <div className="overflow-hidden rounded-md border border-blue-100">
          <table className="w-full text-left text-[9px] leading-6">
            <caption className="sr-only">不同距离下的有效距离系数</caption>
            <thead><tr className="h-6 border-b border-blue-100 bg-blue-50/60 text-blue-800"><th scope="col" className="px-2 font-semibold">价格距离</th><th scope="col" className="px-2 text-right font-semibold">有效距离系数</th></tr></thead>
            <tbody>{[0, 0.05, 0.1, 0.15, 0.2].map((distance) => (
              <tr key={distance} className="h-6 border-b border-blue-50 last:border-b-0">
                <td className="px-2">{(distance * 100).toFixed(0)}%</td>
                <td className="px-2 text-right font-semibold tabular-nums text-blue-700">{distance >= 0.2 ? "0.00（硬门槛）" : formatFactor(1 - alpha + alpha * (1 - distance / 0.2) ** 2)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
      <section className={`${cardClass} space-y-2`}>
        <h3 className={headingClass}>二、成交优先：<span className="text-blue-700">β = {formatFactor(beta)}</span></h3>
        <p>已成交状态系数始终为 1；未成交挂单状态系数 = 1 − 0.75 × β，当前为 <b className="text-blue-700">{formatFactor(1 - 0.75 * beta)}</b>。提高 β 会降低挂单相对权重，不改变已成交系数。</p>
      </section>
      <section className={`${cardClass} space-y-2`}>
        <h3 className={headingClass}>三、盈亏平衡：<span className="text-blue-700">γ = {formatFactor(gamma)}</span></h3>
        <p>先将同一用户所有未平已成交持仓按同一实际平仓价格计算并合并净浮盈亏，再计算一个用户级系数；不逐单按盈利或亏损加权，也不让挂单参与浮盈亏。</p>
        <div className="space-y-1 rounded-lg border border-blue-100 bg-blue-50/50 px-2 py-1.5 text-blue-800">
          <p>r = 用户合并净浮盈亏 ÷ 用户未平已成交实际开仓价值合计</p>
          <p>已成交盈亏系数 G = 1 − 0.5 × γ × clamp(r ÷ 0.10, −1, 1)</p>
          <p>挂单盈亏系数 G = 1；无有效已成交开仓价值时按中性系数 1 处理。</p>
        </div>
        <p>净浮盈亏包含分摊开仓费用与预估平仓费用；正式接入时须沿用实际业务费用口径。多空按各自方向计算浮盈亏后合并，不能先抵消 ETH 数量再计算。</p>
        <div className="overflow-hidden rounded-md border border-blue-100">
          <table className="w-full text-left text-[9px] leading-6">
            <caption className="sr-only">当前盈亏影响下的用户级盈亏系数公式演示</caption>
            <thead><tr className="h-6 border-b border-blue-100 bg-blue-50/60 text-blue-800"><th scope="col" className="px-2 font-semibold">合并净浮盈亏率（公式示意）</th><th scope="col" className="px-2 text-right font-semibold">已成交系数</th></tr></thead>
            <tbody>{[
              { rate: -0.1, label: "净亏损 10% 及以上" },
              { rate: -0.05, label: "净亏损 5%" },
              { rate: 0, label: "净盈亏为零" },
              { rate: 0.05, label: "净盈利 5%" },
              { rate: 0.1, label: "净盈利 10% 及以上" },
            ].map(({ rate, label }) => (
              <tr key={rate} className="h-6 border-b border-blue-50 last:border-b-0"><td className="px-2">{label}</td><td className="px-2 text-right font-semibold tabular-nums text-blue-700">{formatFactor(pnlFactor(rate, gamma))}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <div className="space-y-1 rounded-lg border border-blue-100 bg-blue-50/50 px-2 py-1.5 text-blue-800">
          <p className="font-semibold">净盈亏场景 · 仅数学示意</p>
          <p>同用户一笔浮盈 <b className="text-rose-600">+100</b>、另一笔浮亏 <b className="text-emerald-600">−80</b>，先合并为净浮盈 <b className="text-rose-600">+20</b>，再统一计算系数；不能给亏损那一笔单独加分。</p>
          <p>两人场景：甲净盈 <b className="text-rose-600">+100</b>、乙净亏 <b className="text-emerald-600">−80</b>，分别按各自开仓价值计算净盈亏率，不把两人的盈亏相抵；其他条件相同时，净亏者系数更高、净盈者系数更低，γ = 0 时均为中性。</p>
        </div>
        <p>资金缺口、负余额或风险不足不等于这里的净浮亏，不会自动获得亏损系数优惠。</p>
      </section>
      <section className={`${cardClass} space-y-2`}>
        <h3 className={headingClass}>最终计算与分配边界</h3>
        <div className="rounded-lg border border-blue-100 bg-blue-50/50 px-2 py-1.5 text-blue-800">
          <p>合格订单权重 = 剩余 ETH 数量 × 有效距离系数 × 状态系数 × 用户盈亏系数</p>
          <p>用户加权开仓量 = 该用户所有合格订单权重之和</p>
          <p>有可分配量且总权重 &gt; 0 时：用户占比 = 用户权重 ÷ 总权重</p>
        </div>
        <ol className="list-decimal space-y-1.5 pl-4">
          <li>拆单不加分：相同价格、状态与用户条件下，拆成多笔仍按总 ETH 数量累计，不按订单笔数奖励。</li>
          <li>只计剩余存量：挂单只取尚未成交的剩余数量；已成交只取尚未平仓的数量，已撤销、已平仓或已使用数量不重复计算。</li>
          <li>同用户先净浮盈亏：合并所有未平已成交持仓后取得统一盈亏系数，再用于符合距离门槛的已成交数量。</li>
          <li>不默认均分：总权重为零时不分配，不自动改为按人数均分；三项影响均为零也仍受 20% 距离门槛约束。</li>
          <li>拖动即时试算：保存后用于之后的手动平仓共享分配；确认时系统按实际价格与数量复算并固化快照，不修改历史到账。</li>
        </ol>
      </section>
      <section className="rounded-xl border border-blue-200 bg-blue-50/50 px-3 py-3 text-[10px] leading-4 text-blue-800">
        <h3 className="text-[13px] font-bold text-blue-950">试算与实际到账分开</h3>
        <p className="mt-1">这是规则预览；正式确认时系统按实际价格与数量重算并固化审计快照。这里只读使用账本事实，不按人加减分，也不改写任何历史到账。</p>
      </section>
    </>
  );
}
