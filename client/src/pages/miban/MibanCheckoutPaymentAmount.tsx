import type { ReactNode } from "react";
import { formatMibanUsdtAmount } from "../../../../shared/miban-wallet-payment";

/** 只展示订单金额及其固定汇率折算，不读取钱包、不改变付款方案。 */
export function MibanCheckoutPaymentAmount({
  totalCny,
  usdtCnyRate,
  accent = "#FF6900",
  background,
  label = "本次应付",
  children,
}: {
  totalCny: number;
  usdtCnyRate: number;
  accent?: string;
  background?: string;
  label?: string;
  children?: ReactNode;
}) {
  const validTotal = Number.isFinite(totalCny) && totalCny > 0;
  const validRate = Number.isFinite(usdtCnyRate) && usdtCnyRate > 0;
  return (
    <section aria-label="付款金额" data-checkout-payment-amount className="mt-4 min-w-0 rounded-[4px] px-4 py-3" style={{ background: background ?? `${accent}0D` }}>
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className="mt-1 min-w-0 break-all text-[30px] font-black leading-tight tracking-tight tabular-nums" style={{ color: accent }}>
        {validTotal && validRate ? formatMibanUsdtAmount(totalCny / usdtCnyRate) : "--"}
        <span className="ml-1 text-[14px] font-bold">USDT</span>
      </p>
      <p className="mt-1 break-all text-[12px] tabular-nums text-gray-500">≈ ¥{validTotal ? totalCny.toFixed(2) : "--"}</p>
      {children}
    </section>
  );
}
