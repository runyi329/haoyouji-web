import { useId } from "react";
import { ArrowLeft } from "lucide-react";
import { SharedIncomeRuleSummaryCard } from "@/components/SharedIncomeRuleSummaryCard";
import { DEFAULT_MARKET_CONTRIBUTION_RULE } from "@shared/t0-market-contribution-rule";
import type { MarketContributionRule, MarketContributionPreviewRow } from "@shared/t0-market-contribution-rule";

export type { MarketContributionRule, MarketContributionPreviewRow } from "@shared/t0-market-contribution-rule";
export { DEFAULT_MARKET_CONTRIBUTION_RULE } from "@shared/t0-market-contribution-rule";

export type T0MarketContributionRuleSummaryProps = {
  canManage: boolean;
  onConfigure: () => void;
};

export type T0MarketContributionRuleSettingsPageProps = {
  rule: MarketContributionRule;
  onChange: (rule: MarketContributionRule) => void;
  onSaveAndExit: () => void;
  onClose: () => void;
  rows: MarketContributionPreviewRow[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  limitations: string[];
  asOf: string | null;
  isSaving?: boolean;
  saveError?: string | null;
  saveDisabled?: boolean;
};

type DimensionKey = "referrals" | "capital" | "trading" | "output";
type FactorKey = DimensionKey | "indirectDecay" | "retentionInfluence";

const dimensions: Array<{ key: DimensionKey; label: string; description: string }> = [
  {
    key: "referrals",
    label: "推荐参与",
    description: "仅按推荐用户的实际 T+0 参与计权；直推、间推原始人数与递减后的加权人数分别展示，不把注册人数当作实际参与。",
  },
  {
    key: "capital",
    label: "入金贡献",
    description: "结合推荐用户的净外部投入代理与近 N 天平均留存；资金留存归入本维度，不另增第五个内部维度，也不增加本金。",
  },
  {
    key: "trading",
    label: "成交贡献",
    description: "仅统计 ETH 现货、合约实际成交的开仓数量；开仓和平仓不双计，不按订单笔数计权，期权与网格不混入 ETH 成交量。",
  },
  {
    key: "output",
    label: "收益输出",
    description: "仅统计真实已结算的共享及分佣对团队外的正分配；须有来源订单归属和具体接收人，没有正净来源输出不计。",
  },
];

const cardClass = "min-w-0 rounded-[4px] border border-slate-200 bg-white px-3 py-3 text-[10px] leading-4 text-slate-700";
const headingClass = "text-[13px] font-bold text-slate-900";
const amountFormatter = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const countFormatter = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });
const ethFormatter = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 6 });
const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** 只格式化父级数值；缺失或无效值不冒充真实的 0。 */
function displayNumber(value: number, formatter = amountFormatter) {
  return Number.isFinite(value) ? formatter.format(value) : "暂缺";
}

function displayPercentage(value: number) {
  return Number.isFinite(value) ? `${value.toFixed(2)}%` : "暂缺";
}

function displayAsOf(value: string | null) {
  if (!value) return "统计时间待接口返回";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "统计时间待确认" : `截至 ${dateFormatter.format(date)}（北京时间）`;
}

export function T0MarketContributionRuleSummary({
  canManage,
  onConfigure,
}: T0MarketContributionRuleSummaryProps) {
  return (
    <SharedIncomeRuleSummaryCard
      number={5}
      category="市场拓展"
      title="市场拓展对共享收益的影响"
      steps={[
        { label: "推荐参与", content: "按推荐用户的实际T+0参与计权。" },
        { label: "入金贡献", content: "结合推荐用户的净投入与资金留存。" },
        { label: "成交贡献", content: "按推荐用户的有效成交量计权。" },
        { label: "收益输出", content: "按推荐用户向团队外分配的收益计权。" },
      ]}
      canManage={canManage}
      onConfigure={onConfigure}
    />
  );
}

function FactorControl({
  id,
  field,
  label,
  description,
  endpoints,
  rule,
  onChange,
}: {
  id: string;
  field: FactorKey;
  label: string;
  description: string;
  endpoints: [string, string];
  rule: MarketContributionRule;
  onChange: (rule: MarketContributionRule) => void;
}) {
  const inputId = `${id}-${field}`;
  return (
    <section className={cardClass} aria-label={`${label}系数`}>
      <label htmlFor={inputId} className={headingClass}>{label}</label>
      <p id={`${inputId}-help`} className="mt-1 text-slate-500">{description}</p>
      <output htmlFor={inputId} className="my-2 block text-center text-[20px] font-semibold tabular-nums text-blue-700">
        {rule[field].toFixed(2)}
      </output>
      <input
        id={inputId}
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={rule[field]}
        onChange={(event) => onChange({ ...rule, [field]: Number(event.target.value) })}
        aria-describedby={`${inputId}-help`}
        aria-valuetext={rule[field].toFixed(2)}
        className="block h-3 w-full cursor-pointer accent-blue-700"
      />
      <div className="mt-2 flex justify-between gap-3 text-[9px] text-slate-400">
        <span>{endpoints[0]}</span>
        <span className="text-right">{endpoints[1]}</span>
      </div>
    </section>
  );
}

/** 草稿、请求、资格、推荐链及全部业务试算均由父级负责；这里不发请求、不计算权重。 */
export function T0MarketContributionRuleSettingsPage({
  rule,
  onChange,
  onSaveAndExit,
  onClose,
  rows,
  loading,
  error,
  onRetry,
  limitations,
  asOf,
  isSaving = false,
  saveError = null,
  saveDisabled = false,
}: T0MarketContributionRuleSettingsPageProps) {
  const id = useId();
  const disabled = dimensions.every(({ key }) => rule[key] === 0);

  return (
    <div
      className="fixed inset-0 z-[160] flex min-w-0 flex-col bg-slate-100 t0-income-guide t0-income-guide-settings t0-market-rule"
      role="dialog"
      aria-modal="true"
      aria-label="市场贡献权重设置"
    >
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4">
          <button type="button" onClick={onClose} disabled={isSaving} aria-label="取消并返回方案说明" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] text-slate-700 active:bg-slate-100 disabled:opacity-40">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-900">市场贡献 · 权重</div>
          <div className="truncate text-[10px] text-slate-400">保存后用于之后的手动平仓共享分配</div>
        </div>
        <button type="button" onClick={() => onChange({ ...DEFAULT_MARKET_CONTRIBUTION_RULE })} disabled={isSaving} className="shrink-0 rounded-[4px] border border-slate-300 px-2 py-1.5 text-[10px] text-slate-600 active:bg-slate-50 disabled:opacity-40">
          恢复默认
        </button>
      </header>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-3 py-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <main className="mx-auto w-full min-w-0 max-w-md space-y-3">
          <section className={`${cardClass} bg-slate-50`}>
            <h2 className={headingClass}>一项市场贡献，四个内部维度</h2>
            <p className="mt-1">四项影响系数独立调节，不要求相加等于 1。全为 1.00 表示同等相对影响；全为 0.00 则本项停用，分数全为 0，不产生试算，也不均分给没有市场贡献的人。</p>
            <p className="mt-1">没有有效市场贡献的人不分市场子池；缺失数据不能当成没有贡献，也不能用 0 冒充。</p>
            <p className="mt-1 font-medium text-slate-800">拖动即时试算；保存后用于之后的手动平仓共享分配。确认时系统按实际价格与数量复算并固化快照，不改变历史到账或登记本金。</p>
          </section>

          <fieldset disabled={isSaving} className="space-y-3">
          {dimensions.map(({ key, label, description }) => (
            <FactorControl
              key={key}
              id={id}
              field={key}
              label={label}
              description={description}
              endpoints={["0 · 关闭该维度", "1 · 完整相对强度"]}
              rule={rule}
              onChange={onChange}
            />
          ))}

          <FactorControl
            id={id}
            field="indirectDecay"
            label="间接推荐递减"
            description="默认 0.50；每向上一层按此系数递减。0 仅计直推，1 表示所有层级等强。同一推荐业务的总贡献，在完整祖先链按递减份额归一化，不在每层满额累计。"
            endpoints={["0 · 仅直推", "1 · 所有层级等强"]}
            rule={rule}
            onChange={onChange}
          />

          <FactorControl
            id={id}
            field="retentionInfluence"
            label="入金维度 · 资金留存影响"
            description="默认 0.50；0 仅使用净外部投入代理，1 仅使用近 N 天平均留存，中间值结合两者。留存只是入金贡献的内部因素，不新增本金或独立子池；缺失留存数据由父级按接口限制处理，不补成 0。"
            endpoints={["0 · 仅净外部投入", "1 · 仅近 N 天平均留存"]}
            rule={rule}
            onChange={onChange}
          />

          <section className={cardClass}>
            <label htmlFor={`${id}-retentionDays`} className={headingClass}>资金留存观察天数</label>
            <p id={`${id}-retentionDays-help`} className="mt-1 text-slate-500">默认 30 天，可设 1–365 天。近 N 天平均留存 = 近 N 天净投入余额积分 ÷ N；这是净投入代理的时间平均，不是实际账户余额或精准本金。</p>
            <div className="mt-2 flex items-center justify-center gap-2">
              <input
                id={`${id}-retentionDays`}
                type="number"
                inputMode="numeric"
                min={1}
                max={365}
                step={1}
                value={rule.retentionDays}
                onChange={(event) => {
                  const value = event.target.valueAsNumber;
                  if (Number.isInteger(value) && value >= 1 && value <= 365) {
                    onChange({ ...rule, retentionDays: value });
                  }
                }}
                aria-describedby={`${id}-retentionDays-help`}
                className="h-9 w-24 rounded-[4px] border border-slate-300 bg-white px-2 text-center text-[14px] font-semibold tabular-nums text-slate-800"
              />
              <span className="text-slate-500">天</span>
            </div>
          </section>

          </fieldset>

          <section className={`${cardClass} bg-slate-50`} aria-busy={loading}>
            <h2 className={headingClass}>真实业务用户试算</h2>
            <p className="mt-1 text-[9px] text-slate-500">展示父级提供的真实推荐上级名单及同源预览结果。名单、推荐链、团队内收发排除及试算数值均由父级提供，本页不另算、不调整结果；预览不代表正式确认或实际分配。</p>
            <p className="mt-1 text-[9px] text-slate-400">{displayAsOf(asOf)}</p>
            {disabled && <p role="status" className="mt-2 rounded-[4px] border border-slate-200 bg-white px-2.5 py-2 text-slate-600">本项未启用：四个影响系数全为 0，分数全为 0，不产生市场贡献试算或均分。下方若有名单，仅展示真实业务数据。</p>}
            {loading && <p role="status" aria-live="polite" className="mt-2 rounded-[4px] border border-slate-200 bg-white px-3 py-3 text-center text-slate-500">正在加载真实业务用户与试算数据，请稍候；加载中不代表没有市场贡献。</p>}
            {error !== null && (
              <div role="alert" className="mt-2 rounded-[4px] border border-slate-200 bg-white px-3 py-3">
                <p className="font-medium text-slate-800">真实业务数据加载失败</p>
                <p className="mt-1 break-words text-slate-500">{error || "接口暂未返回可用结果，请重试。"}</p>
                <p className="mt-1 text-[9px] text-slate-400">失败不代表没有贡献，未用模拟数据或全 0 结果代替。</p>
                <button type="button" onClick={onRetry} disabled={loading} className="mt-2 rounded-[4px] border border-slate-300 px-3 py-1.5 text-[10px] font-semibold text-slate-700 disabled:opacity-40">重试加载</button>
              </div>
            )}
            {!loading && error === null && (rows.length > 0 ? (
              <div className="mt-2 w-full min-w-0 max-w-full overflow-x-auto rounded-[4px] border border-slate-200 bg-white">
                <table className="w-full min-w-[680px] text-[9px] tabular-nums">
                  <caption className="sr-only">真实业务用户的推荐人数、净入金贡献、ETH 成交、对外输出与父级市场贡献试算占比</caption>
                  <thead className="border-b border-slate-200 bg-slate-100 text-slate-600">
                    <tr>
                      <th scope="col" className="px-2 py-2 text-left font-semibold">用户</th>
                      <th scope="col" className="px-2 py-2 text-center font-semibold">推荐人数<span className="block font-normal">原数 / 加权人数</span></th>
                      <th scope="col" className="px-2 py-2 text-right font-semibold">净入金贡献<span className="block font-normal">U · 加权</span></th>
                      <th scope="col" className="px-2 py-2 text-right font-semibold">成交贡献<span className="block font-normal">E（ETH）</span></th>
                      <th scope="col" className="px-2 py-2 text-right font-semibold">对外输出<span className="block font-normal">U</span></th>
                      <th scope="col" className="px-2 py-2 text-right font-semibold">试算占比</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.userId} className="border-b border-slate-100 last:border-b-0">
                        <th scope="row" className="max-w-[110px] break-words px-2 py-2 text-left font-medium text-slate-800">{row.name}</th>
                        <td className="whitespace-nowrap px-2 py-2 text-center">
                          <span className="block text-slate-500">直推 {displayNumber(row.directParticipants, countFormatter)} / 间推 {displayNumber(row.indirectParticipants, countFormatter)}</span>
                          <span className="block font-medium text-slate-800">加权 {displayNumber(row.weightedParticipants, countFormatter)} 人</span>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-right">
                          <span className="block font-medium text-slate-800">{displayNumber(row.weightedCapital)} U</span>
                          <span className="block text-[8px] text-slate-400">累计入金 {displayNumber(row.teamDeposit)} U</span>
                          <span className="block text-[8px] text-slate-400">累计提现 {displayNumber(row.teamWithdrawal)} U</span>
                          <span className="block text-[8px] text-slate-400">留存积分 {displayNumber(row.retainedCapitalDays)} U·日</span>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-right">{displayNumber(row.weightedTradingEth, ethFormatter)} E</td>
                        <td className="whitespace-nowrap px-2 py-2 text-right">{displayNumber(row.externalOutput)} U</td>
                        <td className="whitespace-nowrap px-2 py-2 text-right font-semibold text-blue-700">{disabled ? "未启用" : displayPercentage(row.weightPercentage)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-2 rounded-[4px] border border-slate-200 bg-white px-3 py-3 text-center">
                <p className="text-slate-500">父级暂未提供可展示的真实业务用户名单。</p>
                <p className="mt-1 text-[9px] text-slate-400">无名单不等于没有市场贡献，也不要求先选择平仓；本页不生成模拟用户或试算数据。</p>
                <button type="button" onClick={onRetry} className="mt-2 rounded-[4px] border border-slate-300 px-3 py-1.5 text-[10px] font-semibold text-slate-700">重试加载</button>
              </div>
            ))}
            {limitations.length > 0 && (
              <div className="mt-2 text-[9px] leading-4 text-slate-400">
                <h3 className="font-medium">接口数据范围与限制</h3>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {limitations.map((limitation, index) => <li key={`${index}-${limitation}`} className="break-words">{limitation}</li>)}
                </ul>
              </div>
            )}
            <p className="mt-2 text-[9px] text-slate-400">数据覆盖及缺失说明以 API 返回的 limitations 为准，不把有限数据解释为完整财务事实。</p>
          </section>

          <section className={`${cardClass} space-y-2`}>
            <h2 className={headingClass}>计算方法与固定口径</h2>
            <div className="space-y-1 rounded-[4px] border border-slate-200 bg-slate-50 px-2.5 py-2 text-[9px] text-slate-600">
              <p>标准化分 = 该用户在本维度的有效贡献 ÷ 本维度有效贡献总和</p>
              <p>最终权重 = Σ（启用强度 × 标准化分）÷ Σ启用强度</p>
              <p>仅纳入强度大于 0 且存在非零有效贡献的维度；全部强度为 0 或没有可评分贡献时，不产生本项试算，不改为均分。</p>
            </div>
            <p>推荐人数、入金金额、ETH 成交数量、对外输出金额先分别归一化，再按启用强度归一化综合；不能直接相加不同量纲。零贡献维度不作为均分维度，无市场贡献者不取得市场子池份额。</p>
            <p>资金贡献中的净外部投入代理 = max（累计入金 − 累计提现，0）。提现可能包含本金和收益，目前无法拆分，所以不能称为实际账户余额或精准本金。净投入与留存都不含共享收益或普通钱包充值，不因此增加登记本金。</p>
            <p>留存按近 N 天净投入余额积分 ÷ N 统计；缺失历史不以 0 冒充。净投入、留存的有效数据判断、内部标准化与组合，以及完整祖先链的递减份额归一化，均由父级完成。</p>
            <p>成交只取 ETH 现货、合约实际成交的开仓数量；开平仓不重复累计、不按笔数，期权及网格不混入 ETH。统计范围与历史覆盖以 API 的限制说明为准。</p>
            <p>收益输出只计真实已结算的共享及分佣对外正分配，依据来源订单归属和具体收款人。排除推荐上级本人，以及其团队内的收发，不因内部互转加分；撤回、未结算及没有正净来源输出的不计。</p>
            <p className="text-slate-500">推荐上级候选名单、参与资格、团队边界和收支排除均由父级处理。本页只展示传入的原始核对数值与最终占比，不重算、不调整参数、不发起任何分配。</p>
          </section>

          <section className={`${cardClass} bg-slate-50`}>
            <h2 className={headingClass}>试算与实际分配分开</h2>
            <p className="mt-1">拖动即时试算；保存后用于之后的手动平仓共享分配。确认时系统按实际价格与数量复算并固化快照，不改共享总额、登记本金或历史账目。旧止盈预分配仍按原手动确认保护，不由本方案自动执行。</p>
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
