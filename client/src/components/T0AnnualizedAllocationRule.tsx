import { useCallback, useEffect, useId, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { SharedIncomeRuleSummaryCard } from "@/components/SharedIncomeRuleSummaryCard";
import {
  DEFAULT_T0_ANNUALIZED_ALLOCATION_RULE,
  type T0AnnualizedAllocationRule,
} from "@shared/t0-annualized-allocation-rule";

export type T0AnnualizedAllocationRuleSummaryProps = {
  canManage: boolean;
  onConfigure: () => void;
};

export type AnnualizedAllocationRow = {
  userId: string;
  name: string;
  /** 已实现年化，使用小数（0.52 表示 52%）。 */
  annualizedReturn: number | null;
  /** 本次同源试算的有效目标年化，同样使用小数。 */
  targetAnnualizedReturn: number | null;
  hasPersonalTarget: boolean;
  /** 达到有效目标所需的实际补差金额，单位 U。 */
  topUp: number | null;
  /** 本维度权重占比，范围 0–100。 */
  weightPercentage: number;
};

export type T0AnnualizedAllocationRuleDetailsPageProps = {
  onClose: () => void;
  averageAnnualizedReturn: number | null;
  rows: AnnualizedAllocationRow[];
  loading?: boolean;
  rule: T0AnnualizedAllocationRule;
  onChange: (rule: T0AnnualizedAllocationRule) => void;
  onSaveAndExit: () => void;
  isSaving?: boolean;
  error?: string | null;
  isPreview?: boolean;
};

const numberFormatter = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const isFiniteNumber = (value: number | null): value is number =>
  value !== null && Number.isFinite(value);
const formatAnnualizedReturn = (value: number | null) =>
  isFiniteNumber(value)
    ? `${value > 0 ? "+" : ""}${numberFormatter.format(value * 100)}%`
    : "无法计算";
const annualizedColor = (value: number | null) =>
  !isFiniteNumber(value) || value === 0
    ? "text-slate-600"
    : value > 0
      ? "text-rose-600"
      : "text-emerald-600";
const cardClass = "min-w-0 rounded-sm border border-slate-200 bg-white px-3 py-3 text-[10px] leading-4 text-slate-700";
const headingClass = "text-[13px] font-bold text-slate-900";
const targetInputHint = "请输入 0–10000%，最多两位小数；空白沿用平均值，0% 是明确目标。";

function isValidTarget(value: number) {
  return Number.isFinite(value)
    && value >= 0
    && value <= 10000
    && Math.abs(value * 100 - Math.round(value * 100)) < 0.0000001;
}

function parseTargetText(text: string): { valid: boolean; value: number | undefined } {
  if (text === "") return { valid: true, value: undefined };
  // 保留 0.、0.00 等输入中的文本；不将单独的小数点或非法值写入父级。
  if (!/^(?:\d{1,5}(?:\.\d{0,2})?|\.\d{1,2})$/.test(text)) {
    return { valid: false, value: undefined };
  }
  const value = Number(text);
  return { valid: isValidTarget(value), value };
}

function PersonalTargetInput({
  userId,
  name,
  value,
  resetKey,
  disabled,
  onChange,
  onValidityChange,
}: {
  userId: string;
  name: string;
  value: number | undefined;
  resetKey: number;
  disabled: boolean;
  onChange: (userId: string, value: number | undefined) => void;
  onValidityChange: (userId: string, valid: boolean) => void;
}) {
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const [text, setText] = useState(() => value === undefined ? "" : String(value));
  const parsed = parseTargetText(text);

  useEffect(() => {
    setText((current) => {
      const currentValue = parseTargetText(current);
      // 父级回传相同数值时，保留尾随小数点和零，避免每次敲键都重置输入。
      if (currentValue.valid && currentValue.value === value) return current;
      return value === undefined ? "" : String(value);
    });
  }, [value]);

  useEffect(() => {
    setText(value === undefined ? "" : String(value));
    // 恢复默认必须也清掉尚未写入父级的非法或中间态文本。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(() => {
    onValidityChange(userId, parsed.valid);
  }, [userId, parsed.valid, onValidityChange]);

  return (
    <div className="w-[136px] shrink-0">
      <label htmlFor={inputId} className="sr-only">{name}的个人目标年化（百分数）</label>
      <div className="flex h-8 items-center border border-slate-300 bg-white focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          maxLength={9}
          value={text}
          placeholder="沿用平均值"
          disabled={disabled}
          aria-invalid={!parsed.valid}
          aria-describedby={hintId}
          className="min-w-0 flex-1 bg-transparent px-2 text-right text-[12px] tabular-nums outline-none disabled:text-slate-400"
          onChange={(event) => {
            const nextText = event.target.value;
            const next = parseTargetText(nextText);
            setText(nextText);
            onValidityChange(userId, next.valid);
            if (next.valid) onChange(userId, next.value);
          }}
        />
        <span className="pr-2 text-[11px] text-slate-500" aria-hidden="true">%</span>
      </div>
      <div className="mt-1 flex justify-end">
        <button
          type="button"
          disabled={disabled || text === ""}
          className="text-[10px] text-blue-700 disabled:text-slate-300"
          aria-label={`清除${name}的个人目标，沿用平均值`}
          onClick={() => {
            setText("");
            onValidityChange(userId, true);
            onChange(userId, undefined);
          }}
        >清除</button>
      </div>
      <p id={hintId} className={parsed.valid ? "sr-only" : "mt-1 text-[10px] text-rose-600"}>
        {targetInputHint}
      </p>
    </div>
  );
}

/** 公共摘要不展示管理员参数、个人目标或个人名单。 */
export function T0AnnualizedAllocationRuleSummary({
  canManage,
  onConfigure,
}: T0AnnualizedAllocationRuleSummaryProps) {
  return (
    <SharedIncomeRuleSummaryCard
      number={3}
      category="收益平衡"
      title="已实现年化对共享收益的影响"
      steps={[
        { label: "年化对比", content: "按已实现年化衡量收益水平。" },
        { label: "补差权重", content: "收益差距越大，补差权重越高。" },
        { label: "预算分配", content: "按权重占比分配本次共享额度。" },
      ]}
      canManage={canManage}
      onConfigure={onConfigure}
    />
  );
}

/** 仅供管理员配置；私有规则草稿、同源试算及保存/取消均由父级控制。 */
export function T0AnnualizedAllocationRuleDetailsPage({
  onClose,
  averageAnnualizedReturn,
  rows,
  loading = false,
  rule,
  onChange,
  onSaveAndExit,
  isSaving = false,
  error = null,
  isPreview = false,
}: T0AnnualizedAllocationRuleDetailsPageProps) {
  const [inputValidity, setInputValidity] = useState<Record<string, boolean>>({});
  const [inputResetKey, setInputResetKey] = useState(0);
  const busy = loading || isSaving;
  const influenceValid = Number.isFinite(rule.influence) && rule.influence >= 0 && rule.influence <= 1;
  const invalidRuleTarget = Object.values(rule.targets).some((value) => !isValidTarget(value));
  const invalidText = rows.some((row) => inputValidity[row.userId] === false);
  const validationError = !influenceValid
    ? "分配参与度必须为 0–1 的有限数值。"
    : invalidRuleTarget || invalidText
      ? targetInputHint
      : null;
  const hasAverage = isFiniteNumber(averageAnnualizedReturn);
  const hasPositiveGap = rows.some((row) =>
    isFiniteNumber(row.annualizedReturn)
    && isFiniteNumber(row.targetAnnualizedReturn)
    && row.annualizedReturn < row.targetAnnualizedReturn
    && isFiniteNumber(row.topUp)
    && row.topUp > 0,
  );

  const handleValidityChange = useCallback((userId: string, valid: boolean) => {
    setInputValidity((current) => current[userId] === valid ? current : { ...current, [userId]: valid });
  }, []);

  const handleTargetChange = (userId: string, value: number | undefined) => {
    if (busy || !rows.some((row) => row.userId === userId)) return;
    if (value !== undefined && !isValidTarget(value)) return;
    const targets = { ...rule.targets };
    if (value === undefined) delete targets[userId];
    else targets[userId] = value;
    onChange({ ...rule, targets });
  };

  const restoreDefaults = () => {
    if (busy) return;
    setInputValidity({});
    setInputResetKey((current) => current + 1);
    onChange({
      ...DEFAULT_T0_ANNUALIZED_ALLOCATION_RULE,
      targets: { ...DEFAULT_T0_ANNUALIZED_ALLOCATION_RULE.targets },
      version: rule.version,
    });
  };

  const saveAndExit = () => {
    // 不调用关闭、不直接持久化；父级仍须校验草稿、版本和服务端结果。
    if (busy || validationError) return;
    onSaveAndExit();
  };

  return (
    <div className="fixed inset-0 z-[160] flex flex-col bg-slate-100 t0-income-guide t0-income-guide-settings t0-annualized-rule" role="dialog" aria-modal="true" aria-label="已实现年化权重设置">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4">
        <button type="button" onClick={onClose} disabled={isSaving} aria-label="取消并返回方案说明" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-slate-700 active:bg-slate-100 disabled:opacity-50">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-900">已实现年化 · 权重</div>
          <div className="truncate text-[10px] text-slate-400">仅管理员参数</div>
        </div>
        <button type="button" onClick={restoreDefaults} disabled={busy} className="shrink-0 rounded-sm border border-slate-300 px-2 py-1.5 text-[10px] text-slate-600 active:bg-slate-50 disabled:opacity-50">恢复默认</button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <main className="mx-auto w-full max-w-md space-y-3">
          <section className={`${cardClass} space-y-2`}>
            <h2 className={headingClass}>分配参与度</h2>
            <p>只调整本维度的分配权重，不改变客观已实现收益或年化计算结果。</p>
            <label htmlFor="t0-annualized-influence" className="sr-only">分配参与度，0 到 1</label>
            <div className="text-center text-[20px] font-semibold tabular-nums text-blue-700" aria-live="polite">
              {influenceValid ? rule.influence.toFixed(2) : "无效"}
            </div>
            <input
              id="t0-annualized-influence"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={influenceValid ? rule.influence : 0}
              disabled={busy}
              aria-invalid={!influenceValid}
              aria-valuetext={influenceValid ? rule.influence.toFixed(2) : "参与度无效"}
              className="block w-full accent-blue-700 disabled:opacity-50"
              onChange={(event) => {
                const influence = Number(event.target.value);
                if (!busy && Number.isFinite(influence) && influence >= 0 && influence <= 1) {
                  onChange({ ...rule, influence });
                }
              }}
            />
            <div className="flex justify-between gap-3 text-[10px] text-slate-500">
              <span>0 · 未达标者均分</span>
              <span className="text-right">1 · 完全按实际补差</span>
            </div>
            <p>0 时仅未达标且有正补差额的参与人均分；1 时完全按实际补差额加权，中间值混合两者。已达标者始终不参与该维度。</p>
          </section>

          <section className={`${cardClass} space-y-2`} aria-busy={loading}>
            <div className="flex items-center justify-between gap-2"><h2 className={headingClass}>个人目标年化（仅管理员）</h2><span className="shrink-0 text-[10px] text-slate-500">{loading ? "加载完整名单…" : `共 ${rows.length} 人`}</span></div>
            <p className="text-slate-500">未设置沿用当前有效参与人的平均值；个人目标不在普通前端展示。</p>
            <p className="text-slate-500">名单包含本账本全部历史订单及资金用户，挂单、已平仓、当前无持仓均可预设目标；实际分配仍按有效资格计算。</p>
            <div className="flex items-baseline justify-between gap-3 border-y border-slate-100 py-2">
              <span className="text-[10px] text-slate-500">当前有效人平均年化</span>
              <span className={`text-[14px] font-semibold tabular-nums ${loading ? "text-slate-500" : annualizedColor(averageAnnualizedReturn)}`}>
                {loading ? "加载中" : formatAnnualizedReturn(averageAnnualizedReturn)}
              </span>
            </div>
            <p className="text-slate-500">{targetInputHint}</p>
            {loading && <p role="status" className="py-2 text-center text-slate-500">正在加载已授权参与人的同源试算…</p>}
            {!loading && !hasAverage && <p className="border border-slate-200 bg-slate-50 px-2 py-2 text-slate-500">暂无可计算的有效平均年化；未设个人目标者暂无法确定有效目标，不将缺失数据按零处理。</p>}
            {rows.length > 0 ? (
              <ul className="divide-y divide-slate-200 border border-slate-200 bg-white" aria-label="已授权参与人的个人目标与同源补差试算">
                {rows.map((row) => {
                  const currentValid = isFiniteNumber(row.annualizedReturn);
                  const targetValid = isFiniteNumber(row.targetAnnualizedReturn);
                  const reached = currentValid && targetValid && row.annualizedReturn >= row.targetAnnualizedReturn;
                  const belowTarget = currentValid && targetValid && row.annualizedReturn < row.targetAnnualizedReturn;
                  const positiveGap = isFiniteNumber(row.topUp) && row.topUp > 0;
                  const weightValid = Number.isFinite(row.weightPercentage) && row.weightPercentage >= 0 && row.weightPercentage <= 100;
                  return (
                    <li key={row.userId} className="px-2.5 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12px] font-semibold text-slate-800" title={row.name}>{row.name}</div>
                          <p className="mt-1 text-[10px] text-slate-500">已实现年化</p>
                          <div className={`break-all text-[12px] font-semibold tabular-nums ${loading ? "text-slate-400" : annualizedColor(row.annualizedReturn)}`}>
                            {loading ? "加载中" : formatAnnualizedReturn(row.annualizedReturn)}
                          </div>
                        </div>
                        <PersonalTargetInput
                          userId={row.userId}
                          name={row.name}
                          value={rule.targets[row.userId]}
                          resetKey={inputResetKey}
                          disabled={busy}
                          onChange={handleTargetChange}
                          onValidityChange={handleValidityChange}
                        />
                      </div>
                      {!loading && (
                        <div className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-[10px]">
                          <p className="text-slate-500">本次试算有效目标：<span className="tabular-nums">{formatAnnualizedReturn(row.targetAnnualizedReturn)}</span>（{row.hasPersonalTarget ? "管理员个人目标" : "沿用平均值"}）</p>
                          {reached ? (
                            <p className="text-slate-500">已达标，本维度不参与分配。</p>
                          ) : belowTarget && positiveGap ? (
                            <>
                              <div className="flex flex-wrap justify-between gap-1 text-slate-700">
                                <span>补差金额：<span className="font-semibold tabular-nums">{numberFormatter.format(row.topUp!)} U</span></span>
                                <span>权重占比：<span className="font-semibold tabular-nums text-blue-700">{weightValid ? `${numberFormatter.format(row.weightPercentage)}%` : "无法计算"}</span></span>
                              </div>
                              {weightValid && <div className="h-1.5 overflow-hidden bg-blue-100" aria-hidden="true"><div className="h-full bg-blue-600" style={{ width: `${row.weightPercentage}%` }} /></div>}
                            </>
                          ) : belowTarget && isFiniteNumber(row.topUp) && row.topUp === 0 ? (
                            <p className="text-slate-500">当前无正补差金额，本维度不参与分配。</p>
                          ) : (
                            <p className="text-slate-500">当前年化、有效目标或补差金额无法计算，暂不参与本维度，不按零处理。</p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : !loading ? (
              <p className="py-2 text-center text-slate-500">当前没有已授权的参与人数据。</p>
            ) : null}
            {!loading && rows.length > 0 && !hasPositiveGap && <p className="text-slate-500">当前没有可计算的正补差，本维度额度保留，不改为全员均分。</p>}
            <p className="text-slate-500">上方年化、有效目标、补差金额与占比均展示父级提供的本次同源试算；这里不自行重算或执行分配。</p>
          </section>

          <section className={`${cardClass} space-y-2`}>
            <h3 className={headingClass}>年化口径与分配公式</h3>
            <p>仅纳入已登记本金、开启共享资格且年化有效的参与人。平均年化为有效参与人的已实现年化算术平均值；缺失或无法计算的年化不纳入均值，也不按零处理。</p>
            <div className="space-y-1.5 border border-slate-200 bg-slate-50 px-2 py-2 text-slate-700">
              <p>target_i = 管理员个人目标（未设置时沿用当前有效人平均年化）</p>
              <p>个人补足额 = 同源 XIRR 现金流达到 target_i 所需的期末增补金额</p>
              <p className="break-words">W_i = (1 − λ) / 未达标人数 + λ × 个人补差额 / 总补差额</p>
              <p>λ = 分配参与度；仅对未达标且有正补差额的参与人计算 W_i。</p>
            </div>
            <p>XIRR 使用逐笔现金流的真实发生日期及同源的当前已实现净收益，不是将总收益除以本金后简单放大。相同年化差距的实际补差金额也可能不同。</p>
          </section>

          <section className={`${cardClass} space-y-2`}>
            <h3 className={headingClass}>分配边界</h3>
            <p>本维度有效预算按权重占比分配，单人获配不超过其未达标目标补差额；达到补差上限后不再增加，超出可补差总额的剩余预算保留，不强行分完。</p>
            <p>已达到个人有效目标者只停止本维度分配，不反向扣钱，也不影响其他维度。这不是总年化收益上限承诺，自行交易收益和其他规则分配仍可能使年化继续上升。</p>
            <p className="text-slate-500">{isPreview ? "仅保留本次试算设置，不写入真实数据库。" : "保存只影响后续分配，不修改历史分配或已到账收益。"}</p>
          </section>
        </main>
      </div>

      <footer className="shrink-0 border-t border-slate-200 bg-white px-3 py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-md space-y-2">
          {(validationError || error) && <div role="alert" className="space-y-1 border border-rose-200 bg-rose-50 px-2 py-2 text-[11px] text-rose-700">{validationError && <p>{validationError}</p>}{error && <p>{error}</p>}</div>}
          <p className="text-[10px] text-slate-500">{isPreview ? "仅保留本次试算，不写入真实数据库。" : "仅影响后续分配，不改历史。"}</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={isSaving} className="h-10 min-w-0 flex-1 rounded-sm border border-blue-700 bg-white px-3 text-[12px] font-semibold text-blue-700 active:bg-blue-50 disabled:opacity-50">取消</button>
            <button type="button" onClick={saveAndExit} disabled={busy || !!validationError} className="h-10 min-w-0 flex-1 rounded-sm bg-blue-700 px-3 text-[12px] font-semibold text-white active:bg-blue-800 disabled:opacity-50">{isSaving ? "保存中…" : "保存并退出"}</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
