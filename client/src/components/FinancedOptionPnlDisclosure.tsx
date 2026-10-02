import { useState } from "react";

type FinancedOptionPnlDisclosureProps = {
  optionMarkPrice: number | null;
  quantity: number;
  currentValue: number;
  premiumTotal: number;
  floatPnl: number;
  isShort?: boolean;
  collateralValue: number | null;
  accruedInterest: number;
  settledInterest: number;
  color?: string;
  textShadow?: string;
  className?: string;
  maximumFractionDigits?: number;
  unit?: string;
};

/**
 * 52号账本融资付息期权的浮盈与利息口径披露。
 *
 * 浮动盈亏仅衡量期权的实时市值相对购买权利金成本的变动；
 * 待结/已结利息和担保物会在下方的融资订单风险敞口中一并计算，避免重复扣减。
 */
export function FinancedOptionPnlDisclosure({
  optionMarkPrice,
  quantity,
  currentValue,
  premiumTotal,
  floatPnl,
  isShort = false,
  collateralValue,
  accruedInterest,
  settledInterest,
  color,
  textShadow,
  className = "font-medium tabular-nums whitespace-nowrap",
  maximumFractionDigits = 2,
  unit = "U",
}: FinancedOptionPnlDisclosureProps) {
  const [open, setOpen] = useState(false);
  const pnlColor = color ?? (floatPnl >= 0 ? "#DC2626" : "#16A34A");
  const format = (value: number, digits = maximumFractionDigits) =>
    value.toLocaleString(undefined, {
      maximumFractionDigits: digits,
      minimumFractionDigits: 0,
    });
  const markPriceText =
    optionMarkPrice === null ? "--" : `${format(optionMarkPrice)} ${unit}/张`;
  const quantityText =
    Number.isFinite(quantity) && quantity > 0 ? format(quantity) : "--";
  const sign = floatPnl >= 0 ? "+" : "";
  const collateralKnown =
    collateralValue !== null && Number.isFinite(collateralValue);
  const riskExposure = collateralKnown
    ? collateralValue + floatPnl - accruedInterest + settledInterest
    : null;
  const riskColor =
    riskExposure === null || riskExposure >= 0 ? "#DC2626" : "#16A34A";
  const pnlFormula = isShort
    ? "权利金总成本 − 期权当前市值"
    : "期权当前市值 − 权利金总成本";

  return (
    <>
      <button
        type="button"
        onClick={event => {
          event.stopPropagation();
          setOpen(true);
        }}
        className={`${className} inline-flex cursor-pointer flex-col items-end bg-transparent p-0 text-right`}
        style={{ color: pnlColor, textShadow, lineHeight: 1.2 }}
        title="查看融资付息期权浮盈与利息说明"
        aria-label="查看融资付息期权浮盈与利息说明"
      >
        <span>
          {sign}
          {format(floatPnl)} {unit}
        </span>
        <span
          aria-hidden="true"
          className="mt-0.5 block w-full"
          style={{ borderTop: "1px dashed currentColor", opacity: 0.78 }}
        />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[260] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.46)" }}
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5"
            style={{ boxShadow: "0 12px 36px rgba(0,0,0,0.22)" }}
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-bold" style={{ color: "#1A2340" }}>
                  融资付息期权 · 浮盈说明
                </div>
                <div
                  className="mt-0.5 text-[11px]"
                  style={{ color: "#6B7280" }}
                >
                  虚线数值可点开查看购买成本、利息与担保口径
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-lg leading-none"
                style={{ color: "#9CA3AF" }}
                aria-label="关闭说明"
              >
                ×
              </button>
            </div>

            <div
              className="mt-4 space-y-3 text-xs"
              style={{ color: "#4B5563" }}
            >
              <div
                className="rounded-xl p-3"
                style={{ background: "#F0F4FF", border: "1px solid #DCE6FF" }}
              >
                <div className="font-semibold" style={{ color: "#1A2340" }}>
                  ① 浮动盈亏：先扣购买成本
                </div>
                <div className="mt-1 leading-5">{pnlFormula}</div>
                <div
                  className="mt-2 rounded-lg px-2.5 py-2 font-mono text-[11px]"
                  style={{ background: "#FFFFFF", color: "#2563EB" }}
                >
                  {markPriceText} × {quantityText} 张 = {format(currentValue)}{" "}
                  {unit}
                  <br />
                  {isShort
                    ? `${format(premiumTotal)} − ${format(currentValue)}`
                    : `${format(currentValue)} − ${format(premiumTotal)}`}{" "}
                  ={" "}
                  <strong style={{ color: pnlColor }}>
                    {sign}
                    {format(floatPnl)} {unit}
                  </strong>
                </div>
                <div className="mt-2 leading-5" style={{ color: "#6B7280" }}>
                  权利金总成本{" "}
                  <strong>
                    {format(premiumTotal)} {unit}
                  </strong>{" "}
                  是本笔融资购买期权的成本，已在浮动盈亏中扣除。
                </div>
              </div>

              <div
                className="rounded-xl p-3"
                style={{ background: "#F8FAFC", border: "1px solid #E2E8F0" }}
              >
                <div className="font-semibold" style={{ color: "#1A2340" }}>
                  ② 融资订单净风险：再合并利息与担保物
                </div>
                <div className="mt-1 leading-5">
                  担保物 + 浮动盈亏 − 待结利息 + 已结利息
                </div>
                <div
                  className="mt-2 rounded-lg px-2.5 py-2 font-mono text-[11px]"
                  style={{ background: "#FFFFFF", color: "#2563EB" }}
                >
                  {collateralKnown
                    ? `${format(collateralValue!)} + (${sign}${format(floatPnl)}) − ${format(accruedInterest)} + ${format(settledInterest)}`
                    : `担保物暂不可估值 + (${sign}${format(floatPnl)}) − ${format(accruedInterest)} + ${format(settledInterest)}`}
                  {riskExposure !== null && (
                    <>
                      {" "}
                      ={" "}
                      <strong style={{ color: riskColor }}>
                        {riskExposure >= 0 ? "+" : ""}
                        {format(riskExposure)} {unit}
                      </strong>
                    </>
                  )}
                </div>
              </div>

              <div
                className="rounded-xl p-3 leading-5"
                style={{
                  background: "#FFFBEB",
                  border: "1px solid #FDE68A",
                  color: "#92400E",
                }}
              >
                <strong>利息处理：</strong>待结利息{" "}
                <strong>
                  {format(accruedInterest)} {unit}
                </strong>{" "}
                尚未结清，因此在风险敞口中扣除；已结利息{" "}
                <strong>
                  {format(settledInterest)} {unit}
                </strong>{" "}
                已完成结算，作为已覆盖金额加回。它们不会再重复写入“浮动盈亏”一行，但会完整影响本笔融资订单的净风险。
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
