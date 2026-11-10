import { Minus, Plus, X } from "lucide-react";
import { parseInlineRatioInput, stepInlineRatio } from "./ordinaryTagInlineAllocation";

export type OrdinaryTagAllocationFieldsProps = {
  name: string;
  observing: boolean;
  initialAmount: string;
  targetAmount: string;
  ratio: string;
  startDate: string;
  pauseDate: string;
  disabled?: boolean;
  pauseLocked?: boolean;
  onInitialAmountChange: (value: string) => void;
  onTargetAmountChange?: (value: string) => void;
  onRatioChange: (value: string) => void;
  onStartDateChange?: (value: string) => void;
  onPauseDateChange?: (value: string) => void;
  onOpenDateDetails?: () => void;
};

export const ordinaryCompactDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  ? `${value.slice(2, 4)}/${value.slice(5, 7)}/${value.slice(8, 10)}` : "";

/** 仅展示/转发草稿输入；真实日期、暂停确认与保存由页面原路径负责。 */
export default function OrdinaryTagAllocationFields(props: OrdinaryTagAllocationFieldsProps) {
  const { name, observing, initialAmount, targetAmount, ratio, startDate, pauseDate,
    disabled = false, pauseLocked = false } = props;
  const color = observing ? "#7C3AED" : disabled ? "#9CA3AF" : "#4B5563";
  const borderColor = disabled ? "#ECECEC" : "#D9E8EE";
  const fieldStyle = { color, borderColor };
  const fieldClass = "flex h-7 min-w-0 items-center overflow-hidden rounded-[3px] border bg-white";
  const inputClass = "h-full min-w-0 flex-1 bg-transparent px-1 text-right text-xs font-medium tabular-nums outline-none placeholder:text-gray-400 disabled:cursor-default";
  // 9位金额在最窄手机列内仍完整显示；不加千分位，不使用截断/省略号。
  const moneyFont = (value: string) => ({ fontSize: value.length >= 12 ? "9px" : value.length >= 9 ? "10px" : "12px", fontVariantNumeric: "tabular-nums" });
  const money = (value: string, label: string, placeholder: string, onChange?: (value: string) => void) => <label className={fieldClass} style={fieldStyle}>
    <span className="shrink-0 pl-1 text-[10px]" style={{ color: observing ? color : "#9CA3AF" }}>¥</span>
    <input type="text" inputMode="decimal" value={value} aria-label={label} title={`${placeholder}：${value || "未设置"}`} placeholder={placeholder}
      disabled={disabled} readOnly={!onChange} onChange={event => { if (/^\d*\.?\d*$/.test(event.target.value)) onChange?.(event.target.value); }}
      className={inputClass} style={moneyFont(value)} />
  </label>;
  const date = (value: string, label: string, placeholder: string, onChange?: (value: string) => void, locked = false) => {
    const compact = ordinaryCompactDate(value);
    const canEdit = Boolean(onChange) && !locked;
    return <div className={`relative ${fieldClass}`} style={fieldStyle} data-ordinary-date={placeholder}>
      <span className="pointer-events-none absolute inset-0 flex items-center justify-end px-1 text-xs font-medium tabular-nums" style={{ color: compact ? color : observing ? color : "#9CA3AF", paddingRight: compact && canEdit && !disabled ? "16px" : undefined }}>{compact || placeholder}</span>
      {canEdit ? <input type="date" value={value} min={observing && placeholder === "暂停日期" ? startDate || undefined : undefined} disabled={disabled}
        aria-label={label} onChange={event => onChange?.(event.target.value)}
        className={compact ? "absolute inset-y-0 left-0 right-4 h-full min-w-0 cursor-pointer opacity-0" : "absolute inset-0 h-full w-full min-w-0 cursor-pointer opacity-0"} /> :
        <button type="button" disabled={disabled || locked} onClick={props.onOpenDateDetails} aria-label={label}
          title={locked ? "标签全体暂停，成员不能单独修改" : "真实日期在详细设置中修改并保存"} className="absolute inset-0 h-full w-full min-w-0" />}
      {compact && canEdit && !disabled && <button type="button" aria-label={`清除${label}`} title={`清除${placeholder}`} onPointerDown={event => event.stopPropagation()}
        onClick={event => { event.stopPropagation(); onChange?.(""); }} className="absolute right-0 top-0 flex h-full w-4 items-center justify-center text-gray-400"><X size={11} /></button>}
    </div>;
  };
  return <div data-ordinary-allocation-fields data-mode={observing ? "observation" : "actual"} className="min-w-0 w-full">
    <div data-ordinary-allocation-row="reference-dates" className="ml-auto grid w-full max-w-[264px] gap-1.5" style={{ gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 1fr) minmax(0, 1fr)" }}>
      {money(initialAmount, `${name}的${observing ? "观察参考初始" : "真实初始"}金额`, "初始金额", props.onInitialAmountChange)}
      {date(startDate, `${name}的${observing ? "观察" : "真实"}开始日期`, "开始日期", props.onStartDateChange)}
      {date(pauseDate, `${name}的${observing ? "观察" : "真实"}暂停日期`, "暂停日期", props.onPauseDateChange, pauseLocked && !observing)}
    </div>
    <div data-ordinary-allocation-row="allocation-ratio" className="ml-auto mt-1 grid w-full max-w-[264px] items-center gap-1.5" style={{ gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 1fr) minmax(0, 1fr)" }}>
      {/* 普通标签没有股数或总比例上限：分配金额填满前两列，右侧比例与暂停日期同列对齐。 */}
      <div data-ordinary-allocation-span="2" className="col-span-2 min-w-0 w-full">
        {money(targetAmount, `${name}的${observing ? "观察" : "真实"}分配金额`, "分配金额", props.onTargetAmountChange)}
      </div>
      <div data-ordinary-ratio-control className={`${fieldClass} w-full`} style={fieldStyle}>
        <button type="button" aria-label={`${name}减少${observing ? "观察" : "真实"}比例`} disabled={disabled || Number(ratio) <= 0}
          onClick={() => props.onRatioChange(stepInlineRatio(ratio, -1))} className="flex h-full w-4 shrink-0 items-center justify-center border-r text-gray-400 disabled:opacity-30" style={{ borderColor, ...(observing ? { color } : {}) }}><Minus size={10} /></button>
        <input type="text" inputMode="decimal" aria-label={`${name}的${observing ? "观察" : "真实"}比例`} value={ratio} placeholder="0" disabled={disabled}
          onChange={event => { const value = parseInlineRatioInput(event.target.value); if (value !== null) props.onRatioChange(value); }}
          className="h-full min-w-0 flex-1 bg-transparent pl-0.5 text-right text-xs font-medium tabular-nums outline-none" style={{ color, fontSize: ratio.length >= 8 ? "8px" : ratio.length >= 5 ? "10px" : "12px" }} />
        <span className="shrink-0 pr-0.5 text-[10px]">%</span>
        <button type="button" aria-label={`${name}增加${observing ? "观察" : "真实"}比例`} disabled={disabled}
          onClick={() => props.onRatioChange(stepInlineRatio(ratio, 1))} className="flex h-full w-4 shrink-0 items-center justify-center border-l text-gray-400 disabled:opacity-30" style={{ borderColor, ...(observing ? { color } : {}) }}><Plus size={10} /></button>
      </div>
    </div>
  </div>;
}
