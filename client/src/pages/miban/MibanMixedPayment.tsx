import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
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
  selectedDigitalCode: string | null;
  useCombinedAssets: () => void;
  toggleAsset: (code: string) => void;
  useOnlyAsset: (code: string) => void;
  prioritizeAsset: (code: string) => void;
  reviewed: boolean;
  confirmPaymentReview: (confirmed: boolean) => void;
  statusMessage: string;
  /** 只有此方法返回的新签名 DTO 才允许提交订单。 */
  preparePayment: () => Promise<MibanPreparedPayment | null>;
  cancelPendingPayment: () => void;
};

export type MibanPreparedPayment = {
  cnyAmount: number;
  paymentAssets: MibanPaymentAssetInput[];
  paymentQuoteToken: string;
};

const supportedCodes: readonly string[] = MIBAN_PAYMENT_ASSETS;
function unitsOrZero(value: string | null | undefined): bigint {
  try { return value == null ? 0n : paymentDecimalUnits(value); } catch { return 0n; }
}
function positiveUnits(value: string | null | undefined): bigint {
  const units = unitsOrZero(value);
  return units > 0n ? units : 0n;
}
function assetReason(row: MibanPaymentAsset, at = Date.now()): string | undefined {
  if (row.unavailableReason) return row.unavailableReason;
  if (positiveUnits(row.available) === 0n) {
    return positiveUnits(row.frozen) > 0n ? "全部冻结，冻结数量不参与支付" : "暂无可用数量";
  }
  if (!row.priceCny || !row.priceUsdt || positiveUnits(row.priceCny) === 0n || positiveUnits(row.priceUsdt) === 0n) {
    return "实时人民币/U价格暂不可用";
  }
  if (!row.priceUpdatedAt || !Number.isFinite(Date.parse(row.priceUpdatedAt))) return "行情更新时间不可用";
  const age = at - Date.parse(row.priceUpdatedAt);
  if (row.assetCode !== "CNY" && row.assetCode !== "USDT" && (age > 120_000 || age < -5_000)) return "行情已过时或更新时间异常，请刷新报价";
  return undefined;
}
function valueCny(row: MibanPaymentAsset, at = Date.now()): bigint {
  return assetReason(row, at) ? 0n : positiveUnits(row.available) * positiveUnits(row.priceCny) / PAYMENT_SCALE;
}
function equivalentUsdt(cny: string, rate: string | undefined): string | null {
  const divisor = positiveUnits(rate);
  return divisor > 0n ? paymentUnitsText(unitsOrZero(cny) * PAYMENT_SCALE / divisor) : null;
}

/** 展示固定真实快照；只在主动刷新/确认付款时获取新报价，不轮询或倒计时。 */
export function useMibanMixedPayment(totalCnyInput: number, enabled = true): MibanMixedPayment {
  const quoteQuery = mtrpc.order.walletPaymentQuote.useQuery(undefined, {
    enabled,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: "always",
    retry: false,
  });
  const [cnyInputOverride, setCnyInputValue] = useState<string | null>(null);
  const [selection, setSelection] = useState<string[] | null>(null);
  const [priorityCode, setPriorityCode] = useState<string | null>(null);
  const [reviewedKey, setReviewedKey] = useState<string | null>(null);
  const [, setSnapshotVersion] = useState(0);
  const [requestMode, setRequestMode] = useState<"refresh" | "confirm" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [requestError, setRequestError] = useState(false);
  const lastQuote = useRef<MibanWalletPaymentQuote | null>(null);
  const lastPlan = useRef<MibanPaymentPlan | null>(null);
  const defaultDigitalCode = useRef<string | null>(null);
  const approval = useRef<string | null>(null);
  const stagedReview = useRef<string | null>(null);
  const inputVersion = useRef(0);
  const busy = useRef(false);
  const mounted = useRef(true);
  const totalCny = Number.isFinite(totalCnyInput) && totalCnyInput > 0 ? totalCnyInput : 0;
  const scope = useRef({ enabled, totalCny });
  if (scope.current.enabled !== enabled || scope.current.totalCny !== totalCny) {
    inputVersion.current++;
    approval.current = null;
    stagedReview.current = null;
    scope.current = { enabled, totalCny };
  }
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; inputVersion.current++; approval.current = null; };
  }, []);
  if (!enabled) {
    lastQuote.current = null;
    lastPlan.current = null;
    defaultDigitalCode.current = null;
    approval.current = null;
  }
  const validQuote = (candidate: MibanWalletPaymentQuote | undefined | null, at: number) => Boolean(
    candidate?.quoteToken && Array.isArray(candidate.assets) &&
    Number.isFinite(Date.parse(candidate.quotedAt)) && Date.parse(candidate.quotedAt) <= at + 5_000 &&
    Number.isFinite(Date.parse(candidate.expiresAt)) && at < Date.parse(candidate.expiresAt) &&
    positiveUnits(candidate.usdtCnyRate) > 0n
  );
  const liveQuote = quoteQuery.data as MibanWalletPaymentQuote | undefined;
  // 首次只采纳有效真实响应；共享 query 缓存后续变化不能替换页面快照或取消勾选。
  if (enabled && !lastQuote.current && quoteQuery.isSuccess && !quoteQuery.isError && !quoteQuery.isFetching && validQuote(liveQuote, Date.now())) {
    lastQuote.current = liveQuote!;
  }
  const quote = enabled ? lastQuote.current ?? undefined : undefined;
  const snapshotAt = quote ? Date.parse(quote.quotedAt) : Date.now();
  const reason = (row: MibanPaymentAsset) => assetReason(row, snapshotAt);
  const value = (row: MibanPaymentAsset) => valueCny(row, snapshotAt);
  const refreshing = Boolean(requestMode || busy.current || (!quote && quoteQuery.isFetching));
  // ready 是固定快照的操作资格，不是旧 token 的提交资格；提交必须经过 preparePayment。
  const ready = enabled && Boolean(quote) && !refreshing && !requestError;
  const eligibilityKey = (quote?.assets ?? []).map(row => `${row.assetCode}:${reason(row) ?? "ready"}`).join("|");
  const heldRows = useMemo(() => (quote?.assets ?? [])
    .filter(row => supportedCodes.includes(row.assetCode) &&
      (row.assetCode === "CNY" || row.assetCode === "USDT" || unitsOrZero(row.available) !== 0n || unitsOrZero(row.frozen) !== 0n))
    .sort((a, b) => {
      const rank = (code: string) => code === "CNY" ? 0 : code === "USDT" ? 1 : 2;
      const fundingRank = rank(a.assetCode) - rank(b.assetCode);
      if (fundingRank) return fundingRank;
      const difference = value(b) - value(a);
      return difference > 0n ? 1 : difference < 0n ? -1 : a.assetCode.localeCompare(b.assetCode);
    }), [quote, eligibilityKey]);
  const usableDigitalRows = useMemo(() => heldRows.filter(row => row.assetCode !== "CNY" && !reason(row) && value(row) > 0n)
    .sort((a, b) => { const difference = value(b) - value(a); return difference > 0n ? 1 : difference < 0n ? -1 : a.assetCode.localeCompare(b.assetCode); }), [heldRows]);
  if (quote && !usableDigitalRows.some(row => row.assetCode === defaultDigitalCode.current)) defaultDigitalCode.current = usableDigitalRows[0]?.assetCode ?? null;
  const selectedDigitalCode = usableDigitalRows.find(row => row.assetCode === priorityCode && (selection === null || selection.includes(row.assetCode)))?.assetCode
    ?? usableDigitalRows.find(row => selection?.includes(row.assetCode))?.assetCode
    ?? usableDigitalRows.find(row => row.assetCode === defaultDigitalCode.current)?.assetCode
    ?? usableDigitalRows[0]?.assetCode ?? null;
  // 只有用户明确开启联合支付才会增加其它数字币。
  const selectedCodes = useMemo(() => selection ?? heldRows.filter(row => !reason(row) && (row.assetCode === "CNY" || row.assetCode === selectedDigitalCode)).map(row => row.assetCode), [selection, heldRows, selectedDigitalCode]);
  const priorityCodes = useMemo(() => {
    const ordered = selectedCodes.filter(code => heldRows.some(row => row.assetCode === code));
    return priorityCode && ordered.includes(priorityCode) ? [priorityCode, ...ordered.filter(code => code !== priorityCode)] : ordered;
  }, [heldRows, selectedCodes, priorityCode]);
  const requestedCny = cnyInputOverride === null ? undefined : cnyInputOverride || "0";
  const plan = useMemo(() => {
    if (quote) {
      try {
        const usableQuote = { ...quote, assets: quote.assets.map(row => ({ ...row, unavailableReason: reason(row) })) };
        const next = buildMibanPaymentPlan(totalCny, usableQuote, priorityCodes, requestedCny, snapshotAt);
        lastPlan.current = next;
        return next;
      } catch { /* 无效报价绝不生成可支付的零金额兜底。 */ }
    }
    return enabled && lastPlan.current ? lastPlan.current : { deductions: [], paymentAssets: [], totalValueCny: "0", remainingCny: String(totalCny), canPay: false };
  }, [quote, totalCny, priorityCodes, requestedCny, enabled]);
  const deductions = plan.deductions;
  const allAssetRows = useMemo(() => (quote?.assets ?? []).filter(row => supportedCodes.includes(row.assetCode)).map(row => ({
    ...row,
    available: row.assetCode === "CNY" ? paymentUnitsText(positiveUnits(row.available)) : row.available,
    selected: selectedCodes.includes(row.assetCode),
    disabledReason: reason(row),
    deductionAmount: deductions.find(item => item.assetCode === row.assetCode)?.amount ?? "0",
    availableValueCny: reason(row) ? null : paymentUnitsText(value(row)),
  })), [quote, heldRows, selectedCodes, deductions]);
  const assetRows = heldRows.map(row => allAssetRows.find(item => item.assetCode === row.assetCode)!);
  const cnyBalance = Number(assetRows.find(row => row.assetCode === "CNY")?.available ?? 0);
  const usdtBalance = Number(assetRows.find(row => row.assetCode === "USDT")?.available ?? 0);
  const cnyAmount = Number(deductions.find(row => row.assetCode === "CNY")?.amount ?? 0);
  const usdtAmount = Number(deductions.find(row => row.assetCode === "USDT")?.amount ?? 0);
  const cnyInput = cnyInputOverride ?? cnyAmount.toFixed(2);
  const reviewKey = `${quote?.quoteToken ?? ""}:${totalCny}:${JSON.stringify(plan.paymentAssets)}`;
  const reviewed = ready && reviewedKey === reviewKey && approval.current === reviewKey;
  const quoteExpired = Boolean(quote && Date.now() >= Date.parse(quote.expiresAt));
  const canPay = ready && plan.canPay && reviewed;
  const statusMessage = !enabled ? "请登录后读取真实钱包报价" : refreshing ? requestMode === "confirm" ? "正在核验最新报价与余额，请稍候" : "正在读取钱包报价，请稍候" : notice ?? (!ready ? "钱包报价读取失败，请主动刷新重试" : !plan.canPay ? "所选币种可用价值不足，请调整币种或充值" : !reviewed ? "请核对扣币明细；确认付款时核验最新报价" : "页面报价已固定，确认付款时核验最新报价");
  const latest = useRef({ ready, reviewKey, plan, priorityCodes, requestedCny, totalCny });
  latest.current = { ready, reviewKey, plan, priorityCodes, requestedCny, totalCny };
  const clearReview = useCallback(() => {
    inputVersion.current++;
    approval.current = null;
    stagedReview.current = null;
    setReviewedKey(null);
    setNotice(null);
  }, []);
  const setCnyInput = useCallback((value: string) => {
    if (!ready || busy.current || (value !== "" && !/^\d*(?:\.\d{0,2})?$/.test(value))) return;
    clearReview();
    setCnyInputValue(value);
  }, [ready, clearReview]);
  const normalizeCnyInput = useCallback(() => {
    if (!ready || busy.current) return;
    const requested = Math.min(Math.max(Number(cnyInput) || 0, 0), cnyBalance, totalCny);
    const normalized = requested.toFixed(2);
    if (normalized !== cnyInput) clearReview();
    setCnyInputValue(normalized);
  }, [ready, cnyInput, cnyBalance, totalCny, clearReview]);
  const resetToCnyFirst = useCallback(() => {
    clearReview(); setSelection(null); setPriorityCode(null); setCnyInputValue(null);
  }, [clearReview]);
  const prioritizeAsset = useCallback((code: string) => {
    if (!ready || busy.current || !heldRows.some(row => row.assetCode === code && !reason(row))) return;
    clearReview(); setSelection(previous => Array.from(new Set([...(previous ?? selectedCodes), code])));
    setPriorityCode(code); if (code === "CNY") setCnyInputValue(null);
  }, [ready, heldRows, selectedCodes, clearReview]);
  const toggleAsset = useCallback((code: string) => {
    if (!ready || busy.current || !heldRows.some(row => row.assetCode === code && !reason(row))) return;
    const current = selection ?? selectedCodes;
    const next = current.includes(code) ? current.filter(item => item !== code) : [...current, code];
    clearReview(); setSelection(next);
    if (code === priorityCode && !next.includes(code)) setPriorityCode(usableDigitalRows.find(row => next.includes(row.assetCode))?.assetCode ?? null);
  }, [ready, heldRows, selectedCodes, selection, priorityCode, usableDigitalRows, clearReview]);
  const useOnlyAsset = useCallback((code: string) => {
    if (!ready || busy.current || !heldRows.some(row => row.assetCode === code && !reason(row))) return;
    clearReview(); setSelection([code]); setPriorityCode(code); setCnyInputValue(null);
  }, [ready, heldRows, clearReview]);
  const useCombinedAssets = useCallback(() => {
    if (!ready || busy.current) return;
    clearReview(); setSelection(heldRows.filter(row => !reason(row) && value(row) > 0n).map(row => row.assetCode));
    setPriorityCode(selectedDigitalCode); setCnyInputValue(null);
  }, [ready, heldRows, selectedDigitalCode, clearReview]);
  const fetchLatest = useCallback(async (mode: "refresh" | "confirm"): Promise<MibanPreparedPayment | null> => {
    const current = latest.current;
    if (!scope.current.enabled || !mounted.current || busy.current) return null;
    if (mode === "confirm" && (!current.ready || !current.plan.canPay || approval.current !== current.reviewKey)) return null;
    const stagedQuote = lastQuote.current;
    // 有变化时已显示的新报价，用户重新审核后直接提交仍有效的同一快照；不循环重报价。
    if (mode === "confirm" && stagedReview.current === current.reviewKey && validQuote(stagedQuote, Date.now()) &&
      current.plan.deductions.every(item => {
        const row = stagedQuote!.assets.find(asset => asset.assetCode === item.assetCode);
        return row && !assetReason(row, Date.now());
      })) {
      return { cnyAmount: Number(current.plan.deductions.find(row => row.assetCode === "CNY")?.amount ?? 0), paymentAssets: current.plan.paymentAssets, paymentQuoteToken: stagedQuote!.quoteToken };
    }
    const version = inputVersion.current;
    const approvedAssets = JSON.stringify(current.plan.paymentAssets);
    busy.current = true;
    setRequestMode(mode); setNotice(null); setRequestError(false);
    if (mode === "refresh") { approval.current = null; setReviewedKey(null); }
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        quoteQuery.refetch({ cancelRefetch: false }),
        new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("报价核验超时")), 15_000); }),
      ]);
      if (!mounted.current || !scope.current.enabled || version !== inputVersion.current) return null;
      const fresh = result.data as MibanWalletPaymentQuote | undefined;
      const at = Date.now();
      if (result.isError || !validQuote(fresh, at)) throw new Error("最新报价读取失败，请重试");
      const usable = { ...fresh!, assets: fresh!.assets.map(row => ({ ...row, unavailableReason: assetReason(row, at) })) };
      // 保留点击时选中的币种、优先顺序与人民币上限，不静默增加其它币种。
      const next = buildMibanPaymentPlan(current.totalCny, usable, current.priorityCodes, current.requestedCny, at);
      lastQuote.current = usable;
      lastPlan.current = next;
      // 显式固定原选择，避免余额变化导致默认数字币静默切换。
      setSelection([...current.priorityCodes]);
      setSnapshotVersion(value => value + 1);
      const freshKey = `${fresh!.quoteToken}:${current.totalCny}:${JSON.stringify(next.paymentAssets)}`;
      if (mode === "confirm" && next.canPay && JSON.stringify(next.paymentAssets) === approvedAssets && approval.current === current.reviewKey) {
        approval.current = freshKey; setReviewedKey(freshKey);
        return { cnyAmount: Number(next.deductions.find(row => row.assetCode === "CNY")?.amount ?? 0), paymentAssets: next.paymentAssets, paymentQuoteToken: fresh!.quoteToken };
      }
      approval.current = null; setReviewedKey(null);
      stagedReview.current = mode === "confirm" && next.canPay ? freshKey : null;
      setNotice(!next.canPay ? "最新可用余额或行情不足，请调整币种后重新核对" : mode === "confirm" ? "报价已更新，实际扣币有变化，请重新核对后确认付款" : "报价已主动更新，请重新核对实际扣币明细");
      return null;
    } catch {
      if (mounted.current && scope.current.enabled && version === inputVersion.current) {
        approval.current = null; setReviewedKey(null); setRequestError(true);
        setNotice("最新报价核验失败，未提交订单，请重试刷新报价");
      }
      return null;
    } finally {
      if (timeout) clearTimeout(timeout);
      busy.current = false;
      if (mounted.current) setRequestMode(null);
    }
  }, [quoteQuery.refetch]);
  const refresh = useCallback(() => { void fetchLatest("refresh"); }, [fetchLatest]);
  const preparePayment = useCallback(() => fetchLatest("confirm"), [fetchLatest]);
  const availableValueCny = paymentUnitsText(heldRows.reduce((sum, row) => sum + value(row), 0n));
  return {
    cnyBalance, usdtBalance, usdtCnyRate: quote ? Number(quote.usdtCnyRate) : NaN,
    cnyInput, cnyAmount, usdtAmount,
    // 这仅允许发起核验；所有订单入口只提交 preparePayment 返回的新签名 DTO。
    get canPay() { return canPay && !busy.current && mounted.current && scope.current.enabled && approval.current === reviewKey; },
    paymentSummary: deductions.length ? formatMibanPaymentSummary(deductions) : "尚未分配扣币",
    setCnyInput, normalizeCnyInput,
    useAllCny: () => { prioritizeAsset("CNY"); setCnyInputValue(null); },
    useUsdtFirst: () => prioritizeAsset("USDT"), resetToCnyFirst,
    paymentAssets: plan.paymentAssets,
    paymentQuoteToken: ready && quote && Date.now() < Date.parse(quote.expiresAt) ? quote.quoteToken : "",
    deductions, assetRows, allAssetRows, ready, refreshing, refresh, preparePayment, cancelPendingPayment: clearReview,
    quoteExpiresAt: quote?.expiresAt ?? null, quoteExpired,
    quoteSecondsLeft: quote ? Math.max(0, Math.ceil((Date.parse(quote.expiresAt) - Date.now()) / 1_000)) : 0,
    quotedAt: quote?.quotedAt ?? null,
    remainingCny: plan.remainingCny, remainingUsdt: equivalentUsdt(plan.remainingCny, quote?.usdtCnyRate),
    availableValueCny, availableValueUsdt: equivalentUsdt(availableValueCny, quote?.usdtCnyRate), totalValueCny: plan.totalValueCny,
    selectedCodes, priorityCode, selectedDigitalCode, useCombinedAssets, toggleAsset, useOnlyAsset, prioritizeAsset,
    reviewed, confirmPaymentReview: confirmed => {
      if (busy.current) return;
      inputVersion.current++;
      approval.current = confirmed && ready && plan.canPay ? reviewKey : null;
      setReviewedKey(approval.current); setNotice(null);
    },
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

// 展示固定快照与提交资格分开：只有点击付款时完成最新核验，才会提交新签名 DTO。
function compactPaymentStatus(payment: MibanMixedPayment): string {
  if (payment.refreshing) return "正在核验报价，暂不提交";
  if (payment.statusMessage.includes("核验失败")) return "报价核验失败，请刷新重试";
  if (payment.statusMessage.includes("扣币有变化")) return "扣币有变化，请重新核对确认";
  if (!payment.ready) return "钱包报价暂不可用，请刷新";
  if (Number(payment.remainingCny) > 0) return "可用价值不足，请调整币种";
  return payment.reviewed ? "页面报价已固定，付款时核验" : "请核对本次实际扣币明细";
}

function usablePaymentRows(payment: MibanMixedPayment): MibanPaymentAssetRow[] {
  return payment.assetRows.filter(row => !row.disabledReason && positiveUnits(row.available) > 0n && positiveUnits(row.availableValueCny) > 0n);
}
function combinationHint(payment: MibanMixedPayment): string {
  const rows = usablePaymentRows(payment);
  if (!payment.quotedAt) return "正在读取真实可用余额";
  if (positiveUnits(payment.remainingCny) === 0n) return payment.selectedCodes.length > 1 ? "已按所选币种联合分配，付款前请核对扣币明细。" : "当前币种可覆盖本次订单，也可切换其他可用币种。";
  return rows.some(row => !payment.selectedCodes.includes(row.assetCode))
    ? `当前币种不足，还差 ¥${displayCny(payment.remainingCny)}，可用多币种联合支付。`
    : `可用余额不足，还差 ¥${displayCny(payment.remainingCny)}，请充值或调整购买数量。`;
}

/** 确认页直接提供人民币与数字币两分类，冻结/无余额/缺价数字币不进入下拉。 */
export function MibanWalletAvailableSummary({ payment, disabled = false, accent = "#FF6900" }: { payment: MibanMixedPayment; disabled?: boolean; accent?: string }) {
  const locked = disabled || !payment.ready || payment.refreshing;
  const rows = usablePaymentRows(payment);
  const cny = rows.find(row => row.assetCode === "CNY");
  const digitalRows = rows.filter(row => row.assetCode !== "CNY");
  const digital = digitalRows.find(row => row.assetCode === payment.selectedDigitalCode) ?? digitalRows[0];
  const selectedRows = rows.filter(row => row.selected);
  const selectedStyle = (selected: boolean) => ({ borderColor: selected ? accent : "#e5e7eb", backgroundColor: selected ? `${accent}0D` : "#ffffff" });
  const selectionBadge = (selected: boolean) => <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold" style={{ color: selected ? accent : "#9ca3af" }}>{selected && <Check size={12} aria-hidden="true" />}{selected ? "已选" : "点选"}</span>;
  const chooseAsset = (code: string) => { if (!locked) payment.useOnlyAsset(code); };
  return <div data-payment-summary aria-busy={payment.refreshing} className="min-w-0 space-y-2 text-[11px]">
    <p className="break-words font-bold text-gray-700">可用价值 ≈ ¥{payment.quotedAt ? displayCny(payment.availableValueCny) : "--"} / {displayUsdt(payment.availableValueUsdt)} U</p>
    <p data-payment-summary-status role="status" title={payment.ready ? payment.statusMessage : `${payment.statusMessage}；下列为上次真实快照（如有）`} className="h-4 whitespace-nowrap text-gray-500 leading-4">
      {compactPaymentStatus(payment)}
    </p>
    {(cny || digital) ? <div data-payment-categories className={`grid gap-2 ${cny && digital ? "grid-cols-2" : "grid-cols-1"}`}>
      {cny && <div data-payment-asset="CNY" data-payment-selected={cny.selected} className="min-h-24 min-w-0 rounded-lg border px-2.5 py-2" style={selectedStyle(cny.selected)}>
        <button type="button" aria-label="使用人民币支付" aria-pressed={cny.selected} disabled={locked} onClick={() => chooseAsset("CNY")} className="block w-full rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-orange-300">
          <div className="flex h-8 items-center justify-between gap-1 font-bold text-gray-700"><span>人民币</span>{selectionBadge(cny.selected)}</div>
          <div className="mt-1 break-all font-semibold text-gray-600">可用 ¥{displayCny(cny.available)}</div>
          <div className="mt-1 break-words text-gray-400">≈ {displayUsdt(equivalentUsdt(cny.availableValueCny!, String(payment.usdtCnyRate)))} U</div>
        </button>
      </div>}
      {digital && <div data-payment-asset={digital.assetCode} data-payment-selected={digital.selected} className="min-h-24 min-w-0 rounded-lg border px-2.5 py-2" style={selectedStyle(digital.selected)}>
        <label className="flex min-h-8 min-w-0 flex-wrap items-center justify-between gap-1 font-bold text-gray-700">
          <span>数字币</span>
          <select aria-label="选择支付数字币" value={digital.assetCode} disabled={locked} onChange={event => chooseAsset(event.target.value)} className="h-8 min-w-0 max-w-full rounded-md border border-gray-200 bg-white px-1 text-[11px]" style={{ color: accent }}>
            {digitalRows.map(row => <option key={row.assetCode} value={row.assetCode}>{row.assetCode}</option>)}
          </select>
        </label>
        <button type="button" aria-label={`使用${digital.assetCode}支付`} aria-pressed={digital.selected} disabled={locked} onClick={() => chooseAsset(digital.assetCode)} className="mt-1 block w-full rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-orange-300">
          <div className="flex min-w-0 items-center justify-between gap-1 font-bold text-gray-700"><span>{digital.assetCode === "USDT" ? "U / USDT" : digital.assetCode}</span>{selectionBadge(digital.selected)}</div>
          <div className="mt-1 break-all font-semibold text-gray-600">可用 {displayCoinAmount(digital.assetCode, digital.available)} {digital.assetCode === "USDT" ? "U" : digital.assetCode}</div>
          <div className="mt-1 break-words text-gray-400">≈ ¥{displayCny(digital.availableValueCny!)}</div>
        </button>
      </div>}
    </div> : <p data-payment-empty className="min-h-10 leading-5 text-gray-500">{payment.quotedAt ? "暂无可用于本次付款的余额，请先充值。" : payment.refreshing ? "正在读取真实可用余额…" : "钱包报价暂不可用，请刷新后再选择。"}</p>}
    <div data-payment-selected-assets className="min-h-10 break-words leading-5">
      <p className="font-semibold text-gray-700">{selectedRows.length ? `已选币种：${selectedRows.map(row => row.assetCode === "CNY" ? "人民币" : row.assetCode).join(" + ")}` : "尚未选择付款币种"}</p>
      <p className="break-all font-bold" style={{ color: accent }}>本次付款：{payment.deductions.length ? payment.paymentSummary : "尚未分配扣币"}</p>
    </div>
    <div data-payment-combination-hint className="min-h-10 break-words leading-5 text-gray-500">{combinationHint(payment)}</div>
    <button type="button" aria-pressed={selectedRows.length > 1} disabled={locked || rows.length < 2} onClick={() => { if (!locked && rows.length >= 2) payment.useCombinedAssets(); }} className="rounded-lg border bg-white px-3 py-2 font-semibold disabled:text-gray-400" style={{ color: accent, borderColor: selectedRows.length > 1 ? accent : "#ffedd5" }}>多币种联合支付</button>
    <p className="text-gray-400">仅显示真实可用余额；冻结、无余额或无有效行情的数字币已过滤。</p>
  </div>;
}

export function MibanMixedPaymentAllocation({ payment, disabled = false, accent = "#FF6900" }: {
  payment: MibanMixedPayment; disabled?: boolean; accent?: string;
}) {
  const locked = disabled || !payment.ready;
  // 只有用户主动核验时短暂锁止，静置不轮询、不倒计时、不切换透明度。
  const dimmed = disabled || !payment.quotedAt || (!payment.ready && !payment.refreshing);
  const [showCombinedAssets, setShowCombinedAssets] = useState(false);
  const usableRows = usablePaymentRows(payment);
  const digitalRows = usableRows.filter(row => row.assetCode !== "CNY");
  const selectedDigitalCode = payment.selectedDigitalCode ?? "";
  const visibleRows = showCombinedAssets ? usableRows : usableRows.filter(row =>
    row.assetCode === "CNY" || row.assetCode === selectedDigitalCode || positiveUnits(row.deductionAmount) > 0n);
  const changeDigitalAsset = (code: string) => {
    const row = digitalRows.find(asset => asset.assetCode === code);
    if (locked || !row || row.disabledReason) return;
    payment.useOnlyAsset(code);
  };
  return <div data-payment-allocation aria-busy={payment.refreshing} className="mb-5 min-w-0 rounded-2xl border border-gray-100 bg-gray-50 p-3.5">
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold text-gray-900">钱包单币 / 组合支付</div>
        <div className="mt-1 text-[11px] leading-4 text-gray-500">仅列出有可用余额的币种；单币不足可选多币种联合支付，取消勾选即不扣该币。</div>
      </div>
      <button type="button" disabled={disabled || payment.refreshing} onClick={payment.refresh} className={`shrink-0 rounded-lg bg-white px-2 py-1.5 text-[11px] font-bold ${disabled ? "opacity-40" : ""}`} style={{ color: accent }}>刷新报价</button>
    </div>
    <div data-payment-allocation-status role="status" title={payment.statusMessage} className="mb-3 h-10 text-[11px] leading-5 text-gray-500">
      <p className="whitespace-nowrap">{compactPaymentStatus(payment)}</p>
      <p className="whitespace-nowrap tabular-nums">
        {Number.isFinite(payment.usdtCnyRate) ? `1 U ≈ ¥${payment.usdtCnyRate.toFixed(4)}` : "实时汇率待查询"}
        {payment.quotedAt && " · 付款时核验"}
      </p>
    </div>
    <div data-payment-combination-hint className="mb-2 min-h-10 break-words text-[11px] leading-5 text-gray-500">{combinationHint(payment)}</div>
    <button type="button" aria-expanded={showCombinedAssets} disabled={locked || usableRows.length < 2} onClick={() => { if (locked) return; if (!showCombinedAssets) payment.useCombinedAssets(); setShowCombinedAssets(value => !value); }} className="mb-3 rounded-lg bg-white px-2.5 py-2 text-[11px] font-bold disabled:text-gray-400" style={{ color: accent }}>{showCombinedAssets ? "收起联合币种" : "多币种联合支付"}</button>
    <div className="space-y-2.5">
      {visibleRows.map(row => <div key={row.assetCode} data-payment-asset={row.assetCode} data-payment-selected={row.selected} className={`min-w-0 rounded-xl border bg-white p-3 ${row.disabledReason ? "border-gray-100 text-gray-400" : "border-gray-200"}`} style={{ borderColor: row.selected ? accent : undefined }}>
        <div className="flex min-w-0 items-start gap-2">
          <input type="checkbox" aria-label={`参与支付 ${row.assetCode}`} checked={row.selected && !row.disabledReason} disabled={locked || Boolean(row.disabledReason)} onChange={() => payment.toggleAsset(row.assetCode)} className="mt-1 h-4 w-4 shrink-0" style={{ accentColor: accent }} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 break-words text-[13px] font-bold">{row.assetCode === "CNY" ? "人民币" : row.assetCode === "USDT" ? "U / USDT" : row.assetCode} · {row.assetName}{row.selected && <span className="ml-1.5 whitespace-nowrap text-[10px]" style={{ color: accent }}>已选</span>}</div>
              {row.assetCode === selectedDigitalCode && <label className="flex min-w-0 items-center gap-1 text-[10px] font-semibold" style={{ color: accent }}>
                <span className="shrink-0">数字币</span>
                <select aria-label="选择支付数字币" value={selectedDigitalCode} disabled={locked} onChange={event => changeDigitalAsset(event.target.value)} className={`max-w-[112px] min-w-0 rounded-lg border border-gray-200 bg-gray-50 px-1.5 py-1.5 text-[11px] outline-none ${dimmed ? "opacity-40" : ""}`}>
                  {digitalRows.map(asset => <option key={asset.assetCode} value={asset.assetCode}>{asset.assetCode}</option>)}
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
          <button type="button" disabled={locked} onClick={() => payment.prioritizeAsset(row.assetCode)} className={`rounded-lg bg-gray-50 px-2 py-1.5 text-[10px] font-bold ${dimmed ? "opacity-40" : ""}`} style={{ color: accent }}>{payment.priorityCode === row.assetCode ? "已优先" : "优先使用"}</button>
          <button type="button" disabled={locked} onClick={() => payment.useOnlyAsset(row.assetCode)} className={`rounded-lg bg-gray-50 px-2 py-1.5 text-[10px] font-bold ${dimmed ? "opacity-40" : ""}`} style={{ color: accent }}>仅用此币</button>
        </div>}
        {row.assetCode === "CNY" && <label className="mt-2 flex min-w-0 items-center gap-2 rounded-lg border border-gray-200 px-2">
          <span className="text-[11px] text-gray-500">本次人民币上限 ¥</span>
          <input aria-label="本次使用的人民币金额" value={payment.cnyInput} onChange={event => payment.setCnyInput(event.target.value)} onBlur={payment.normalizeCnyInput} inputMode="decimal" disabled={locked || !row.selected || Boolean(row.disabledReason)} className={`h-9 min-w-0 flex-1 bg-transparent text-right text-[13px] font-bold outline-none ${dimmed || !row.selected || row.disabledReason ? "opacity-40" : ""}`} />
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
      <span className="min-w-0 break-words">我已核对上述实际扣币数量，同意按已选币种支付。付款时核验最新报价；扣币变化需重新确认。</span>
    </label>
    <p className="mt-2.5 text-[10px] leading-4 text-gray-400">冻结不参与支付；缺价、过时行情不可支付；不支持股票、证券或商品资产。提交仅携带币种、币量与签名token，服务端重新核验。</p>
  </div>;
}
