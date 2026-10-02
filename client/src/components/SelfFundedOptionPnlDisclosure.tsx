import { useState } from "react";

type SelfFundedOptionPnlDisclosureProps = {
  optionMarkPrice: number | null;
  quantity: number;
  currentValue: number;
  color?: string;
  textShadow?: string;
  className?: string;
  maximumFractionDigits?: number;
  unit?: string;
};

/**
 * 52号账本自有资产期权的浮盈披露。
 *
 * 自有资产的浮盈按当前期权市值展示，不能再扣除已投入的自有权利金；
 * 权利金总投入仍在订单的“总投入”字段中保留，以免丢失成本信息。
 */
export function SelfFundedOptionPnlDisclosure({
  optionMarkPrice,
  quantity,
  currentValue,
  color = "#DC2626",
  textShadow,
  className = "font-medium tabular-nums whitespace-nowrap",
  maximumFractionDigits = 2,
  unit = "u",
}: SelfFundedOptionPnlDisclosureProps) {
  const [open, setOpen] = useState(false);
  const format = (value: number, digits = maximumFractionDigits) => value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
  const markPriceText = optionMarkPrice === null ? "--" : `${format(optionMarkPrice)} ${unit}/张`;
  const quantityText = Number.isFinite(quantity) && quantity > 0 ? format(quantity) : "--";

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        className={`${className} inline-flex cursor-pointer flex-col items-end bg-transparent p-0 text-right`}
        style={{ color, textShadow, lineHeight: 1.2 }}
        title="查看自有资产期权浮盈计算说明"
        aria-label="查看自有资产期权浮盈计算说明"
      >
        <span>+{format(currentValue)} {unit}</span>
        <span aria-hidden="true" className="mt-0.5 block w-full" style={{ borderTop: "1px dashed currentColor", opacity: 0.78 }} />
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
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-bold" style={{ color: "#1A2340" }}>自有资产期权 · 浮盈说明</div>
                <div className="mt-0.5 text-[11px]" style={{ color: "#6B7280" }}>虚线数值可点开查看本笔计算口径</div>
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

            <div className="mt-4 space-y-3 text-xs" style={{ color: "#4B5563" }}>
              <div className="rounded-xl p-3" style={{ background: "#F0F4FF", border: "1px solid #DCE6FF" }}>
                <div className="font-semibold" style={{ color: "#1A2340" }}>① 本笔为什么不扣权利金</div>
                <p className="mt-1 leading-5">
                  该订单已标记为<strong>自有资产</strong>。权利金属于已投入的自有本金，不是本笔需要偿还的融资负债；因此本栏展示当前持有期权的实时价值，而不会重复扣除历史权利金。
                </p>
              </div>

              <div className="rounded-xl p-3" style={{ background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
                <div className="font-semibold" style={{ color: "#1A2340" }}>② 浮动盈亏计算</div>
                <div className="mt-1 leading-5">期权标记价 × 持有张数 = 自有资产期权的实时价值</div>
                <div className="mt-2 rounded-lg px-2.5 py-2 font-mono text-[11px]" style={{ background: "#FFFFFF", color: "#2563EB" }}>
                  {markPriceText} × {quantityText} 张 = <strong style={{ color }}>{`+${format(currentValue)} ${unit}`}</strong>
                </div>
              </div>

              <div className="rounded-xl p-3 leading-5" style={{ background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E" }}>
                权利金总投入仍保留在订单的“总投入”字段中；待结/已结利息和担保物不参与这项自有资产浮盈。只有<strong>融资付息</strong>订单，才按“实时价值 − 权利金总成本”计算浮盈，并在风险敞口中叠加利息与担保物。
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
