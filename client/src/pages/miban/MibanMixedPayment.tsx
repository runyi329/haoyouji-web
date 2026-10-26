import { useCallback, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useMibanUsdtCnyRate } from "./useMibanUsdtCnyRate";

const CNY_EPSILON = 0.001;
const USDT_EPSILON = 0.00000001;

export type MibanMixedPayment = {
  cnyBalance: number;
  usdtBalance: number;
  usdtCnyRate: number;
  cnyInput: string;
  cnyAmount: number;
  usdtAmount: number;
  canPay: boolean;
  paymentSummary: string;
  setCnyInput: (value: string) => void;
  normalizeCnyInput: () => void;
  useAllCny: () => void;
  useUsdtFirst: () => void;
  resetToCnyFirst: () => void;
};

/**
 * 米伴商城统一的 CNY + USDT 组合支付计算。
 * 用户输入本次使用的人民币，余额部分始终按服务端同源实时汇率换算为 U。
 * 最终订单创建时仍由服务端重新读取汇率和钱包余额进行校验。
 */
export function useMibanMixedPayment(
  totalCnyInput: number,
  enabled = true
): MibanMixedPayment {
  const totalCny = Math.max(0, Number(totalCnyInput) || 0);
  const { data: cnyBalanceData } = trpc.recharge.getCnyBalance.useQuery(
    undefined,
    {
      enabled,
      refetchInterval: 15_000,
      refetchOnWindowFocus: true,
    }
  );
  const { data: usdtBalanceData } = trpc.recharge.getBalance.useQuery(
    undefined,
    {
      enabled,
      refetchInterval: 15_000,
      refetchOnWindowFocus: true,
    }
  );
  const usdtCnyRate = useMibanUsdtCnyRate();
  const [cnyInput, setCnyInputValue] = useState("");

  const cnyBalance = Number(cnyBalanceData ?? 0);
  const usdtBalance = Number(usdtBalanceData ?? 0);
  const maxCnyAmount = Math.min(cnyBalance, totalCny);
  const requestedCnyAmount = Number(cnyInput);
  const cnyAmount = Number(
    Math.min(
      Math.max(Number.isFinite(requestedCnyAmount) ? requestedCnyAmount : 0, 0),
      maxCnyAmount
    ).toFixed(2)
  );
  const remainingCny = Number(Math.max(0, totalCny - cnyAmount).toFixed(2));
  const usdtAmount = Number((remainingCny / usdtCnyRate).toFixed(8));
  const canPay =
    cnyAmount <= cnyBalance + CNY_EPSILON &&
    usdtAmount <= usdtBalance + USDT_EPSILON;

  const paymentSummary = useMemo(() => {
    if (cnyAmount > 0 && usdtAmount > 0) {
      return `¥${cnyAmount.toFixed(2)} + ${usdtAmount.toFixed(2)} U`;
    }
    if (cnyAmount > 0) return `¥${cnyAmount.toFixed(2)}`;
    return `${usdtAmount.toFixed(2)} U`;
  }, [cnyAmount, usdtAmount]);

  const setCnyAmount = useCallback(
    (amount: number) => {
      const normalized = Math.min(Math.max(amount, 0), maxCnyAmount);
      setCnyInputValue(normalized.toFixed(2));
    },
    [maxCnyAmount]
  );

  const setCnyInput = useCallback(
    (value: string) => {
      if (value !== "" && !/^\d*(?:\.\d{0,2})?$/.test(value)) return;
      if (value === "") {
        setCnyInputValue("");
        return;
      }
      const amount = Number(value);
      if (!Number.isFinite(amount)) return;
      if (amount > maxCnyAmount) {
        setCnyAmount(maxCnyAmount);
        return;
      }
      setCnyInputValue(value);
    },
    [maxCnyAmount, setCnyAmount]
  );

  const useAllCny = useCallback(
    () => setCnyAmount(maxCnyAmount),
    [maxCnyAmount, setCnyAmount]
  );

  const useUsdtFirst = useCallback(() => {
    const cnyCoveredByUsdt = Math.min(totalCny, usdtBalance * usdtCnyRate);
    setCnyAmount(totalCny - cnyCoveredByUsdt);
  }, [setCnyAmount, totalCny, usdtBalance, usdtCnyRate]);

  const resetToCnyFirst = useCallback(
    () => setCnyAmount(maxCnyAmount),
    [maxCnyAmount, setCnyAmount]
  );

  return {
    cnyBalance,
    usdtBalance,
    usdtCnyRate,
    cnyInput,
    cnyAmount,
    usdtAmount,
    canPay,
    paymentSummary,
    setCnyInput,
    normalizeCnyInput: () => setCnyAmount(cnyAmount),
    useAllCny,
    useUsdtFirst,
    resetToCnyFirst,
  };
}

export function MibanMixedPaymentAllocation({
  payment,
  disabled = false,
  accent = "#FF6900",
}: {
  payment: MibanMixedPayment;
  disabled?: boolean;
  accent?: string;
}) {
  return (
    <div className="mb-5 rounded-2xl border border-gray-100 bg-gray-50 p-3.5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[13px] font-bold text-gray-900">组合支付</div>
          <div className="mt-0.5 text-[11px] text-gray-400">
            人民币与 U 可自由组合使用
          </div>
        </div>
        <span className="text-[11px] text-gray-400">
          1 U ≈ ¥{payment.usdtCnyRate.toFixed(4)}
        </span>
      </div>

      <div className="rounded-xl border border-orange-100 bg-white p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[13px] font-bold text-gray-900">
              人民币钱包
            </div>
            <div className="mt-0.5 text-[11px] text-gray-400">
              可用 ¥{payment.cnyBalance.toFixed(2)}
            </div>
          </div>
          <button
            type="button"
            onClick={payment.useAllCny}
            disabled={disabled}
            className="rounded-lg bg-orange-50 px-2.5 py-1.5 text-[11px] font-bold disabled:opacity-40"
            style={{ color: accent }}
          >
            全部使用
          </button>
        </div>
        <div className="mt-2.5 flex items-center rounded-lg border border-gray-200 px-2.5">
          <span className="text-[15px] font-bold text-gray-600">¥</span>
          <input
            value={payment.cnyInput}
            onChange={event => payment.setCnyInput(event.target.value)}
            onBlur={payment.normalizeCnyInput}
            inputMode="decimal"
            aria-label="本次使用的人民币金额"
            disabled={disabled}
            className="h-9 min-w-0 flex-1 bg-transparent px-2 text-right text-[15px] font-extrabold text-gray-900 outline-none disabled:opacity-40"
          />
          <span className="text-[11px] text-gray-400">本次使用</span>
        </div>
      </div>

      <div className="mt-2.5 rounded-xl border border-gray-200 bg-white p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[13px] font-bold text-gray-900">U 钱包</div>
            <div className="mt-0.5 text-[11px] text-gray-400">
              可用 {payment.usdtBalance.toFixed(4)} U
            </div>
          </div>
          <button
            type="button"
            onClick={payment.useUsdtFirst}
            disabled={disabled || payment.usdtBalance <= 0}
            className="rounded-lg bg-orange-50 px-2.5 py-1.5 text-[11px] font-bold disabled:opacity-40"
            style={{ color: accent }}
          >
            优先使用 U
          </button>
        </div>
        <div className="mt-2.5 flex h-9 items-center justify-between rounded-lg bg-gray-50 px-2.5">
          <span className="text-[11px] text-gray-500">本次使用</span>
          <span
            className="text-[15px] font-extrabold"
            style={{ color: accent }}
          >
            {payment.usdtAmount.toFixed(4)} U
          </span>
        </div>
      </div>

      <p className="mt-2.5 text-[10px] leading-4 text-gray-400">
        输入人民币金额后，剩余金额自动按实时汇率换算为
        U；提交时由服务端重新核验余额和汇率。
      </p>
    </div>
  );
}
