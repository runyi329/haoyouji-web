import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mtrpc } from "./mibanTrpc";
import {
  MIBAN_PAYMENT_ASSETS,
  PAYMENT_SCALE,
  buildMibanPaymentPlan,
  formatMibanPaymentSummary,
  formatMibanUsdtAmount,
  paymentDecimalUnits,
  paymentUnitsText,
  type MibanPaymentAsset,
  type MibanPaymentAssetInput,
  type MibanPaymentDeduction,
  type MibanPaymentPlan,
  type MibanWalletPaymentQuote,
} from "../../../../shared/miban-wallet-payment";

export type MibanPaymentAssetRow = MibanPaymentAsset & {
  selected: boolean;
  disabledReason?: string;
  deductionAmount: string;
  availableValueCny: string | null;
};

export type MibanMixedPayment = {
  // 保留原有字段及回调，兼容所有既有米伴购买入口。
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
  paymentAssets: MibanPaymentAssetInput[];
  paymentQuoteToken: string;
  deductions: MibanPaymentDeduction[];
  assetRows: MibanPaymentAssetRow[];
  allAssetRows: MibanPaymentAssetRow[];
  ready: boolean;
  refreshing: boolean;
  refresh: () => void;
  quoteExpiresAt: string | null;
  quoteExpired: boolean;
  quoteSecondsLeft: number;
  quotedAt: string | null;
  remainingCny: string;
  remainingUsdt: string | null;
  availableValueCny: string;
  availableValueUsdt: string | null;
  totalValueCny: string;
  selectedCodes: string[];
  priorityCode: string | null;
  toggleAsset: (code: string) => void;
  useOnlyAsset: (code: string) => void;
  prioritizeAsset: (code: string) => void;
  reviewed: boolean;
  confirmPaymentReview: (confirmed: boolean) => void;
  statusMessage: string;
};

const supportedCodes: readonly string[] = MIBAN_PAYMENT_ASSETS;
function unitsOrZero(value: string | null | undefined): bigint {
  try { return value == null ? 0n : paymentDecimalUnits(value); } catch { return 0n; }
}
function positiveUnits(value: string | null | undefined): bigint {
  const units = unitsOrZero(value);
  return units > 0n ? units : 0n;
}
function assetReason(row: MibanPaymentAsset): string | undefined {
  if (row.unavailableReason) return row.unavailableReason;
  if (positiveUnits(row.available) === 0n) {
    return positiveUnits(row.frozen) > 0n ? "全部冻结，冻结数量不参与支付" : "暂无可用数量";
  }
  if (!row.priceCny || !row.priceUsdt || positiveUnits(row.priceCny) === 0n || positiveUnits(row.priceUsdt) === 0n) {
    return "实时人民币/U价格暂不可用";
  }
  if (!row.priceUpdatedAt || !Number.isFinite(Date.parse(row.priceUpdatedAt))) return "行情更新时间不可用";
  const age = Date.now() - Date.parse(row.priceUpdatedAt);
  if (row.assetCode !== "CNY" && row.assetCode !== "USDT" && (age > 120_000 || age < -5_000)) return "行情已过时或更新时间异常，请刷新报价";
  return undefined;
}
function valueCny(row: MibanPaymentAsset): bigint {
  return assetReason(row) ? 0n : positiveUnits(row.available) * positiveUnits(row.priceCny) / PAYMENT_SCALE;
}
function equivalentUsdt(cny: string, rate: string | undefined): string | null {
  const divisor = positiveUnits(rate);
  return divisor > 0n ? paymentUnitsText(unitsOrZero(cny) * PAYMENT_SCALE / divisor) : null;
}

/** 只消费真实、已签名的订单钱包报价；所有金额分配复用共享原生精度工具。 */
export function useMibanMixedPayment(totalCnyInput: number, enabled = true): MibanMixedPayment {
  const quoteQuery = mtrpc.order.walletPaymentQuote.useQuery(undefined, {
    enabled,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [enabled]);
  const [cnyInputOverride, setCnyInputValue] = useState<string | null>(null);
  const [selection, setSelection] = useState<string[] | null>(null);
  const [priorityCode, setPriorityCode] = useState<string | null>(null);
  const [reviewedKey, setReviewedKey] = useState<string | null>(null);
  useEffect(() => {
    if (quoteQuery.isFetching || !enabled) setReviewedKey(null);
  }, [quoteQuery.isFetching, enabled]);
  const lastQuote = useRef<MibanWalletPaymentQuote | null>(null);
  const lastPlan = useRef<MibanPaymentPlan | null>(null);
  if (!enabled) { lastQuote.current = null; lastPlan.current = null; }
  const liveQuote = quoteQuery.data as MibanWalletPaymentQuote | undefined;
  const expires = liveQuote ? Date.parse(liveQuote.expiresAt) : NaN;
  const quoteValid = Boolean(liveQuote?.quoteToken && Number.isFinite(expires) && Date.now() < expires && now < expires && positiveUnits(liveQuote.usdtCnyRate) > 0n);
  const ready = enabled && quoteQuery.isSuccess && !quoteQuery.isError && !quoteQuery.isFetching && quoteValid;
  // 请求错误/刷新/过期保留上一真实快照供核对，但绝不允许按旧快照提交。
  if (ready && liveQuote) lastQuote.current = liveQuote;
  const quote = enabled ? lastQuote.current ?? liveQuote : undefined;
  const totalCny = Number.isFinite(totalCnyInput) && totalCnyInput > 0 ? totalCnyInput : 0;
  const eligibilityKey = (quote?.assets ?? []).map(row => `${row.assetCode}:${assetReason(row) ?? "ready"}`).join("|");
  const heldRows = useMemo(() => (quote?.assets ?? [])
    .filter(row => supportedCodes.includes(row.assetCode) &&
      (row.assetCode === "CNY" || row.assetCode === "USDT" || unitsOrZero(row.available) !== 0n || unitsOrZero(row.frozen) !== 0n))
    .sort((a, b) => {
      const rank = (code: string) => code === "CNY" ? 0 : code === "USDT" ? 1 : 2;
      const fundingRank = rank(a.assetCode) - rank(b.assetCode);
      if (fundingRank) return fundingRank;
      const difference = valueCny(b) - valueCny(a);
      return difference > 0n ? 1 : difference < 0n ? -1 : a.assetCode.localeCompare(b.assetCode);
    }), [quote, eligibilityKey]);
  const selectedCodes = useMemo(() => selection ?? heldRows.filter(row => !assetReason(row)).map(row => row.assetCode), [selection, heldRows]);
  const priorityCodes = useMemo(() => {
    const ordered = heldRows.filter(row => selectedCodes.includes(row.assetCode)).map(row => row.assetCode);
    return priorityCode && ordered.includes(priorityCode) ? [priorityCode, ...ordered.filter(code => code !== priorityCode)] : ordered;
  }, [heldRows, selectedCodes, priorityCode]);
  const requestedCny = cnyInputOverride === null ? undefined : cnyInputOverride || "0";
  const plan = useMemo(() => {
    if (ready && quote) {
      try {
        const usableQuote = { ...quote, assets: quote.assets.map(row => ({ ...row, unavailableReason: assetReason(row) })) };
        const next = buildMibanPaymentPlan(totalCny, usableQuote, priorityCodes, requestedCny, Date.now());
        lastPlan.current = next;
        return next;
      } catch {
        return { deductions: [], paymentAssets: [], totalValueCny: "0", remainingCny: String(totalCny), canPay: false };
      }
    }
    return enabled && lastPlan.current ? lastPlan.current : { deductions: [], paymentAssets: [], totalValueCny: "0", remainingCny: String(totalCny), canPay: false };
  }, [ready, quote, totalCny, priorityCodes, requestedCny, enabled]);
  const deductions = plan.deductions;
  const allAssetRows = useMemo(() => (quote?.assets ?? []).filter(row => supportedCodes.includes(row.assetCode)).map(row => ({
    ...row,
    // 历史负人民币余额只按零可用显示，不妨碍其他数字币支付。
    available: row.assetCode === "CNY" ? paymentUnitsText(positiveUnits(row.available)) : row.available,
    selected: selectedCodes.includes(row.assetCode),
    disabledReason: assetReason(row),
    deductionAmount: deductions.find(item => item.assetCode === row.assetCode)?.amount ?? "0",
    availableValueCny: assetReason(row) ? null : paymentUnitsText(valueCny(row)),
  })), [quote, heldRows, selectedCodes, deductions]);
  const assetRows = heldRows.map(row => allAssetRows.find(item => item.assetCode === row.assetCode)!);
  const cnyBalance = Number(assetRows.find(row => row.assetCode === "CNY")?.available ?? 0);
  const usdtBalance = Number(assetRows.find(row => row.assetCode === "USDT")?.available ?? 0);
  const cnyAmount = Number(deductions.find(row => row.assetCode === "CNY")?.amount ?? 0);
  const usdtAmount = Number(deductions.find(row => row.assetCode === "USDT")?.amount ?? 0);
  const cnyInput = cnyInputOverride ?? cnyAmount.toFixed(2);
  const reviewKey = `${quote?.quoteToken ?? ""}:${totalCny}:${JSON.stringify(plan.paymentAssets)}`;
  const reviewed = reviewedKey === reviewKey;
  const quoteExpired = Boolean(quote && Date.now() >= Date.parse(quote.expiresAt));
  const canPay = ready && plan.canPay && reviewed;
  const statusMessage = !enabled ? "请登录后读取真实钱包报价" : quoteQuery.isFetching ? "正在刷新钱包与签名报价，请稍候" : quoteQuery.isError ? "钱包报价读取失败，请刷新重试" : quoteExpired ? "报价已过期，请刷新并重新核对扣币明细" : !ready ? "等待有效实时钱包报价" : !plan.canPay ? "所选币种可用价值不足，请调整币种或充值" : !reviewed ? "请核对并确认本次实际扣币明细" : "报价有效，可确认支付";
  const setCnyInput = useCallback((value: string) => {
    if (value !== "" && !/^\d*(?:\.\d{0,2})?$/.test(value)) return;
    setCnyInputValue(value);
    setReviewedKey(null);
  }, []);
  const normalizeCnyInput = useCallback(() => {
    if (!ready) return;
    const requested = Math.min(Math.max(Number(cnyInput) || 0, 0), cnyBalance, totalCny);
    setCnyInputValue(requested.toFixed(2));
  }, [ready, cnyInput, cnyBalance, totalCny]);
  const resetToCnyFirst = useCallback(() => {
    setSelection(null);
    setPriorityCode(null);
    setCnyInputValue(null);
    setReviewedKey(null);
  }, []);
  const prioritizeAsset = useCallback((code: string) => {
    if (!ready || !heldRows.some(row => row.assetCode === code && !assetReason(row))) return;
    setSelection(previous => Array.from(new Set([...(previous ?? selectedCodes), code])));
    setPriorityCode(code);
    if (code === "CNY") setCnyInputValue(null);
    setReviewedKey(null);
  }, [ready, heldRows, selectedCodes]);
  const toggleAsset = useCallback((code: string) => {
    if (!ready || !heldRows.some(row => row.assetCode === code && !assetReason(row))) return;
    setSelection(previous => {
      const current = previous ?? selectedCodes;
      return current.includes(code) ? current.filter(item => item !== code) : [...current, code];
    });
    setReviewedKey(null);
  }, [ready, heldRows, selectedCodes]);
  const useOnlyAsset = useCallback((code: string) => {
    if (!ready || !heldRows.some(row => row.assetCode === code && !assetReason(row))) return;
    setSelection([code]);
    setPriorityCode(code);
    setCnyInputValue(null);
    setReviewedKey(null);
  }, [ready, heldRows]);
  const refresh = useCallback(() => {
    setReviewedKey(null);
    void quoteQuery.refetch();
  }, [quoteQuery.refetch]);
  const availableValueCny = paymentUnitsText(heldRows.reduce((sum, row) => sum + valueCny(row), 0n));
  return {
    cnyBalance, usdtBalance, usdtCnyRate: quote ? Number(quote.usdtCnyRate) : NaN,
    cnyInput, cnyAmount, usdtAmount,
    get canPay() { return canPay && Date.now() < expires && deductions.every(item => {
      const row = quote?.assets.find(asset => asset.assetCode === item.assetCode);
      return row && !assetReason(row);
    }); },
    paymentSummary: deductions.length ? formatMibanPaymentSummary(deductions) : "尚未分配扣币",
    setCnyInput, normalizeCnyInput,
    useAllCny: () => { prioritizeAsset("CNY"); setCnyInputValue(null); },
    useUsdtFirst: () => prioritizeAsset("USDT"), resetToCnyFirst,
    paymentAssets: plan.paymentAssets,
    paymentQuoteToken: ready ? liveQuote!.quoteToken : "",
    deductions, assetRows, allAssetRows, ready, refreshing: Boolean(quoteQuery.isFetching), refresh,
    quoteExpiresAt: quote?.expiresAt ?? null, quoteExpired,
    quoteSecondsLeft: quote ? Math.max(0, Math.ceil((Date.parse(quote.expiresAt) - now) / 1_000)) : 0,
    quotedAt: quote?.quotedAt ?? null,
    remainingCny: plan.remainingCny,
    remainingUsdt: equivalentUsdt(plan.remainingCny, quote?.usdtCnyRate),
    availableValueCny, availableValueUsdt: equivalentUsdt(availableValueCny, quote?.usdtCnyRate),
    totalValueCny: plan.totalValueCny,
    selectedCodes, priorityCode, toggleAsset, useOnlyAsset, prioritizeAsset,
    reviewed, confirmPaymentReview: confirmed => setReviewedKey(confirmed && ready && plan.canPay ? reviewKey : null),
    statusMessage,
  };
}

function displayAmount(value: string, decimals: number): string {
  const rounded = Number(value).toFixed(decimals);
  return unitsOrZero(value) !== 0n && Number(rounded) === 0 ? value : rounded;
}
function displayCny(value: string): string { return displayAmount(value, 2); }
function displayUsdt(value: string | null): string { return formatMibanUsdtAmount(value); }
function displayCoinAmount(code: string, value: string): string { return code === "USDT" ? formatMibanUsdtAmount(value) : value; }

/** 只读钱包估值概览也列出全部持有数字币，不把冻结、股票或证券算进可支付余额。 */
export function MibanWalletAvailableSummary({ payment }: { payment: MibanMixedPayment }) {
  return <div className="min-w-0 space-y-2 text-[11px]">
    <p className="break-words font-bold text-gray-700">可用价值 ≈ ¥{payment.quotedAt ? displayCny(payment.availableValueCny) : "--"} / {displayUsdt(payment.availableValueUsdt)} U</p>
    {!payment.ready && <p role="status" className="text-gray-500">{payment.statusMessage}；下列为上次真实快照（如有）</p>}
    <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
      {payment.assetRows.map(row => <div key={row.assetCode} className="min-w-0 rounded-lg bg-white px-2.5 py-2">
        <div className="font-bold text-gray-700">{row.assetCode === "CNY" ? "人民币" : row.assetCode} · {row.assetName}</div>
        <div className="mt-1 break-all text-gray-600">可用 {displayCoinAmount(row.assetCode, row.available)} · 冻结 {displayCoinAmount(row.assetCode, row.frozen)}</div>
        <div className="mt-1 break-words text-gray-400">{row.disabledReason ?? `≈ ¥${displayCny(row.availableValueCny!)} / ${displayUsdt(equivalentUsdt(row.availableValueCny!, String(payment.usdtCnyRate)))} U`}</div>
      </div>)}
    </div>
    <p className="text-gray-400">冻结数量不参与支付；仅支持有有效实时人民币/U价的数字币。</p>
  </div>;
}

export function MibanMixedPaymentAllocation({ payment, disabled = false, accent = "#FF6900" }: {
  payment: MibanMixedPayment; disabled?: boolean; accent?: string;
}) {
  const locked = disabled || !payment.ready;
  const [showAllAssets, setShowAllAssets] = useState(false);
  const [digitalChoice, setDigitalChoice] = useState<string | null>(null);
  const digitalRows = payment.assetRows.filter(row => row.assetCode !== "CNY");
  const selectedDigitalCode = digitalRows.some(row => row.assetCode === payment.priorityCode) ? payment.priorityCode!
    : digitalRows.some(row => row.assetCode === digitalChoice) ? digitalChoice!
    : digitalRows.find(row => row.assetCode === "USDT")?.assetCode ?? digitalRows[0]?.assetCode ?? "";
  const visibleRows = showAllAssets ? payment.allAssetRows : payment.assetRows.filter(row =>
    row.assetCode === "CNY" || row.assetCode === selectedDigitalCode || positiveUnits(row.deductionAmount) > 0n);
  const changeDigitalAsset = (code: string) => {
    const row = digitalRows.find(asset => asset.assetCode === code);
    if (locked || !row || row.disabledReason) return;
    setDigitalChoice(code);
    payment.useOnlyAsset(code);
  };
  return <div className="mb-5 min-w-0 rounded-2xl border border-gray-100 bg-gray-50 p-3.5">
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold text-gray-900">钱包单币 / 组合支付</div>
        <div className="mt-1 text-[11px] leading-4 text-gray-500">数字币下拉框可切换为所选币购买；组合支付可展开选择，取消勾选即不扣该币。</div>
      </div>
      <button type="button" disabled={disabled || payment.refreshing} onClick={payment.refresh} className="shrink-0 rounded-lg bg-white px-2 py-1.5 text-[11px] font-bold disabled:opacity-40" style={{ color: accent }}>刷新报价</button>
    </div>
    <div role="status" className="mb-3 break-words text-[11px] leading-5 text-gray-500">
      {payment.statusMessage}<br />
      {Number.isFinite(payment.usdtCnyRate) ? `1 U ≈ ¥${payment.usdtCnyRate.toFixed(4)}` : "实时汇率待查询"}
      {payment.quoteExpiresAt && ` · 报价剩余 ${payment.quoteSecondsLeft} 秒`}
    </div>
    <button type="button" aria-expanded={showAllAssets} onClick={() => setShowAllAssets(value => !value)} className="mb-3 rounded-lg bg-white px-2.5 py-2 text-[11px] font-bold" style={{ color: accent }}>{showAllAssets ? "收起未持有币种" : "查看全部数字币"}</button>
    <div className="space-y-2.5">
      {visibleRows.map(row => <div key={row.assetCode} className={`min-w-0 rounded-xl border bg-white p-3 ${row.disabledReason ? "border-gray-100 text-gray-400" : "border-gray-200"}`}>
        <div className="flex min-w-0 items-start gap-2">
          <input type="checkbox" aria-label={`参与支付 ${row.assetCode}`} checked={row.selected && !row.disabledReason} disabled={locked || Boolean(row.disabledReason)} onChange={() => payment.toggleAsset(row.assetCode)} className="mt-1 h-4 w-4 shrink-0" style={{ accentColor: accent }} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 break-words text-[13px] font-bold">{row.assetCode === "CNY" ? "人民币" : row.assetCode === "USDT" ? "U / USDT" : row.assetCode} · {row.assetName}</div>
              {row.assetCode === selectedDigitalCode && <label className="flex min-w-0 items-center gap-1 text-[10px] font-semibold" style={{ color: accent }}>
                <span className="shrink-0">数字币</span>
                <select aria-label="选择支付数字币" value={selectedDigitalCode} disabled={locked} onChange={event => changeDigitalAsset(event.target.value)} className="max-w-[112px] min-w-0 rounded-lg border border-gray-200 bg-gray-50 px-1.5 py-1.5 text-[11px] outline-none disabled:opacity-40">
                  {digitalRows.map(asset => <option key={asset.assetCode} value={asset.assetCode} disabled={Boolean(asset.disabledReason)}>{asset.assetCode}{asset.disabledReason ? `（${asset.disabledReason}）` : ""}</option>)}
                </select>
              </label>}
            </div>
            <div className="mt-1 break-all text-[11px] leading-5 text-gray-500">可用 {displayCoinAmount(row.assetCode, row.available)} · 冻结 {displayCoinAmount(row.assetCode, row.frozen)}</div>
            <div className="break-all text-[10px] leading-4 text-gray-400">每币 ≈ ¥{row.priceCny ?? "--"} / {displayUsdt(row.priceUsdt)} U</div>
            {row.disabledReason && <div className="mt-1 break-words text-[10px] text-gray-400">{row.disabledReason}</div>}
            {row.priceUpdatedAt && <div className="mt-0.5 break-words text-[10px] text-gray-400">行情更新 {new Date(row.priceUpdatedAt).toLocaleTimeString("zh-CN", { hour12: false })}</div>}
          </div>
        </div>
        {!row.disabledReason && <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" disabled={locked} onClick={() => payment.prioritizeAsset(row.assetCode)} className="rounded-lg bg-gray-50 px-2 py-1.5 text-[10px] font-bold disabled:opacity-40" style={{ color: accent }}>{payment.priorityCode === row.assetCode ? "已优先" : "优先使用"}</button>
          <button type="button" disabled={locked} onClick={() => payment.useOnlyAsset(row.assetCode)} className="rounded-lg bg-gray-50 px-2 py-1.5 text-[10px] font-bold disabled:opacity-40" style={{ color: accent }}>仅用此币</button>
        </div>}
        {row.assetCode === "CNY" && <label className="mt-2 flex min-w-0 items-center gap-2 rounded-lg border border-gray-200 px-2">
          <span className="text-[11px] text-gray-500">本次人民币上限 ¥</span>
          <input aria-label="本次使用的人民币金额" value={payment.cnyInput} onChange={event => payment.setCnyInput(event.target.value)} onBlur={payment.normalizeCnyInput} inputMode="decimal" disabled={locked || !row.selected || Boolean(row.disabledReason)} className="h-9 min-w-0 flex-1 bg-transparent text-right text-[13px] font-bold outline-none disabled:opacity-40" />
        </label>}
        <div className="mt-2 break-all rounded-lg bg-gray-50 px-2 py-2 text-[12px] font-bold" style={{ color: row.disabledReason ? undefined : accent }}>本次扣币 {displayCoinAmount(row.assetCode, row.deductionAmount)} {row.assetCode === "USDT" ? "U" : row.assetCode}</div>
      </div>)}
    </div>
    <div className="mt-3 space-y-1 break-words text-[11px] leading-5 text-gray-600">
      <p>钱包可用价值 ≈ ¥{payment.quotedAt ? displayCny(payment.availableValueCny) : "--"} / {displayUsdt(payment.availableValueUsdt)} U</p>
      <p>本次已分配 ≈ ¥{displayCny(payment.totalValueCny)}；剩余待付 ¥{displayCny(payment.remainingCny)} / {displayUsdt(payment.remainingUsdt)} U</p>
      <p className="break-all font-bold" style={{ color: accent }}>实际付款：{payment.paymentSummary}</p>
    </div>
    <label className="mt-3 flex items-start gap-2 rounded-xl border border-gray-200 bg-white p-3 text-[11px] leading-5 text-gray-700">
      <input type="checkbox" aria-label="确认本次实际扣币明细" checked={payment.reviewed} disabled={locked || Number(payment.remainingCny) > 0 || payment.deductions.length === 0} onChange={event => payment.confirmPaymentReview(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" style={{ accentColor: accent }} />
      <span className="min-w-0 break-words">我已核对上述实际扣币数量，同意按已选币种支付。报价刷新后需重新核对。</span>
    </label>
    <p className="mt-2.5 text-[10px] leading-4 text-gray-400">冻结不参与支付；缺价、过时行情不可支付；不支持股票、证券或商品资产。提交仅携带币种、币量与签名token，服务端重新核验。</p>
  </div>;
}
