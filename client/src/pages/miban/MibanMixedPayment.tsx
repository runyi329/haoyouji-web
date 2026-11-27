import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import { MibanWalletUserAvatar } from "./MibanWalletUserAvatar";
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
  /** @deprecated 仅兼容旧调用，不再是付款资格或审核门槛。 */
  reviewed: boolean;
  /** @deprecated 不会批准报价；false 仅取消旧的待确认快照。 */
  confirmPaymentReview: (confirmed: boolean) => void;
  statusMessage: string;
  /** 首次点击核验新签名报价；币量变化时返回 null，下一次点击确认仍有效的新报价。 */
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
  const [, setSnapshotVersion] = useState(0);
  const [requestMode, setRequestMode] = useState<"refresh" | "confirm" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [requestError, setRequestError] = useState(false);
  const lastQuote = useRef<MibanWalletPaymentQuote | null>(null);
  const lastPlan = useRef<MibanPaymentPlan | null>(null);
  const defaultDigitalCode = useRef<string | null>(null);
  const stagedConfirmation = useRef<string | null>(null);
  const blocked = useRef(false);
  const inputVersion = useRef(0);
  const busy = useRef(false);
  const mounted = useRef(true);
  const totalCny = Number.isFinite(totalCnyInput) && totalCnyInput > 0 ? totalCnyInput : 0;
  const scope = useRef({ enabled, totalCny });
  if (scope.current.enabled !== enabled || scope.current.totalCny !== totalCny) {
    inputVersion.current++;
    stagedConfirmation.current = null;
    scope.current = { enabled, totalCny };
  }
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; inputVersion.current++; stagedConfirmation.current = null; };
  }, []);
  if (!enabled) {
    lastQuote.current = null;
    lastPlan.current = null;
    defaultDigitalCode.current = null;
    stagedConfirmation.current = null;
  }
  const validQuote = (candidate: MibanWalletPaymentQuote | undefined | null, at: number) => Boolean(
    candidate?.quoteToken && Array.isArray(candidate.assets) &&
    Number.isFinite(Date.parse(candidate.quotedAt)) && Date.parse(candidate.quotedAt) <= at + 5_000 &&
    Number.isFinite(Date.parse(candidate.expiresAt)) && at < Date.parse(candidate.expiresAt) &&
    positiveUnits(candidate.usdtCnyRate) > 0n
  );
  const liveQuote = quoteQuery.data as MibanWalletPaymentQuote | undefined;
  // 首次只采纳有效真实响应；共享 query 缓存后续变化不能替换页面快照。
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
  const confirmationKey = `${quote?.quoteToken ?? ""}:${totalCny}:${JSON.stringify(plan.paymentAssets)}`;
  const quoteExpired = Boolean(quote && Date.now() >= Date.parse(quote.expiresAt));
  const canPay = ready && plan.canPay;
  const statusMessage = !enabled ? "请登录后读取真实钱包报价" : refreshing ? requestMode === "confirm" ? "正在核验最新报价与余额，请稍候" : "正在读取钱包报价，请稍候" : notice ?? (!ready ? "钱包报价读取失败，请主动刷新重试" : !plan.canPay ? "所选币种可用价值不足，请调整币种或充值" : "页面报价已固定，确认付款时核验最新报价");
  const latest = useRef({ ready, confirmationKey, plan, priorityCodes, requestedCny, totalCny });
  latest.current = { ready, confirmationKey, plan, priorityCodes, requestedCny, totalCny };
  const clearReview = useCallback(() => {
    inputVersion.current++;
    stagedConfirmation.current = null;
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
    if (mode === "confirm" && (!current.ready || !current.plan.canPay || blocked.current)) return null;
    const version = inputVersion.current;
    const displayedAssets = JSON.stringify(current.plan.paymentAssets);
    busy.current = true;
    setRequestMode(mode); setNotice(null); setRequestError(false);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const stagedQuote = lastQuote.current;
      // 首次核验已经固定新方案；第二次明确点击仅确认仍有效的同一签名快照，不循环刷新。
      if (mode === "confirm" && stagedConfirmation.current === current.confirmationKey && validQuote(stagedQuote, Date.now())) {
        const at = Date.now();
        const stagedPlan = buildMibanPaymentPlan(current.totalCny, {
          ...stagedQuote!, assets: stagedQuote!.assets.map(row => ({ ...row, unavailableReason: assetReason(row, at) })),
        }, current.priorityCodes, current.requestedCny, at);
        if (stagedPlan.canPay && JSON.stringify(stagedPlan.paymentAssets) === displayedAssets) {
          stagedConfirmation.current = null;
          // 保持本次点击的互斥锁直到微任务结束，也允许取消/卸载阻断快速确认路径。
          await Promise.resolve();
          if (!mounted.current || !scope.current.enabled || version !== inputVersion.current || blocked.current ||
            !validQuote(stagedQuote, Date.now()) || stagedPlan.deductions.some(item => {
              const row = stagedQuote!.assets.find(asset => asset.assetCode === item.assetCode);
              return !row || Boolean(assetReason(row, Date.now()));
            })) return null;
          return { cnyAmount: Number(stagedPlan.deductions.find(row => row.assetCode === "CNY")?.amount ?? 0), paymentAssets: stagedPlan.paymentAssets, paymentQuoteToken: stagedQuote!.quoteToken };
        }
      }
      stagedConfirmation.current = null;
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
      blocked.current = false;
      if (mode === "confirm" && next.canPay && JSON.stringify(next.paymentAssets) === displayedAssets) {
        return { cnyAmount: Number(next.deductions.find(row => row.assetCode === "CNY")?.amount ?? 0), paymentAssets: next.paymentAssets, paymentQuoteToken: fresh!.quoteToken };
      }
      stagedConfirmation.current = mode === "confirm" && next.canPay ? freshKey : null;
      setNotice(mode === "confirm"
        ? `报价已更新，请确认本次付款金额${next.canPay ? "" : "；最新可用余额或行情不足，请返回确认订单页调整币种或充值"}`
        : next.canPay ? "报价已主动更新，确认付款时核验最新报价" : "最新可用余额或行情不足，请调整币种或充值");
      return null;
    } catch {
      if (mounted.current && scope.current.enabled && version === inputVersion.current) {
        stagedConfirmation.current = null; blocked.current = true; setRequestError(true);
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
  const renderedVersion = inputVersion.current;
  const preparePayment = useCallback(() => renderedVersion === inputVersion.current ? fetchLatest("confirm") : Promise.resolve(null), [fetchLatest, renderedVersion]);
  const cancelPendingPayment = useCallback(() => {
    // 作废旧闭包、异步响应和待确认报价，但取消不是余额/行情失败。
    // 新一次确认仍必须 preparePayment 取最新签名报价；真实请求错误的阻断不被清除。
    clearReview();
  }, [clearReview]);
  const availableValueCny = paymentUnitsText(heldRows.reduce((sum, row) => sum + value(row), 0n));
  return {
    cnyBalance, usdtBalance, usdtCnyRate: quote ? Number(quote.usdtCnyRate) : NaN,
    cnyInput, cnyAmount, usdtAmount,
    // 这仅允许发起核验；所有订单入口只提交 preparePayment 返回的新签名 DTO。
    get canPay() { return canPay && renderedVersion === inputVersion.current && !busy.current && !blocked.current && mounted.current && scope.current.enabled; },
    paymentSummary: deductions.length ? formatMibanPaymentSummary(deductions) : "尚未分配扣币",
    setCnyInput, normalizeCnyInput,
    useAllCny: () => { if (!ready || busy.current) return; prioritizeAsset("CNY"); setCnyInputValue(null); },
    useUsdtFirst: () => prioritizeAsset("USDT"), resetToCnyFirst,
    paymentAssets: plan.paymentAssets,
    paymentQuoteToken: ready && quote && Date.now() < Date.parse(quote.expiresAt) ? quote.quoteToken : "",
    deductions, assetRows, allAssetRows, ready, refreshing, refresh, preparePayment, cancelPendingPayment,
    quoteExpiresAt: quote?.expiresAt ?? null, quoteExpired,
    quoteSecondsLeft: quote ? Math.max(0, Math.ceil((Date.parse(quote.expiresAt) - Date.now()) / 1_000)) : 0,
    quotedAt: quote?.quotedAt ?? null,
    remainingCny: plan.remainingCny, remainingUsdt: equivalentUsdt(plan.remainingCny, quote?.usdtCnyRate),
    availableValueCny, availableValueUsdt: equivalentUsdt(availableValueCny, quote?.usdtCnyRate), totalValueCny: plan.totalValueCny,
    selectedCodes, priorityCode, selectedDigitalCode, useCombinedAssets, toggleAsset, useOnlyAsset, prioritizeAsset,
    reviewed: false, confirmPaymentReview: confirmed => { if (!confirmed && !busy.current) clearReview(); },
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
  if (payment.statusMessage.includes("报价已更新")) return payment.statusMessage;
  if (!payment.ready) return "钱包报价暂不可用，请刷新";
  if (Number(payment.remainingCny) > 0) return "可用价值不足，请调整币种";
  return "页面报价已固定，付款时核验";
}

function usablePaymentRows(payment: MibanMixedPayment): MibanPaymentAssetRow[] {
  return payment.assetRows.filter(row => !row.disabledReason && positiveUnits(row.available) > 0n && positiveUnits(row.availableValueCny) > 0n);
}
function combinationHint(payment: MibanMixedPayment): string {
  const rows = usablePaymentRows(payment);
  if (!payment.quotedAt) return "正在读取真实可用余额";
  if (positiveUnits(payment.remainingCny) === 0n) return payment.selectedCodes.length > 1 ? "已按所选币种联合分配，确认付款时核验最新报价。" : "当前币种可覆盖本次订单，也可切换其他可用币种。";
  return rows.some(row => !payment.selectedCodes.includes(row.assetCode))
    ? `当前币种不足，还差 ¥${displayCny(payment.remainingCny)}，可用多币种联合支付。`
    : `可用余额不足，还差 ¥${displayCny(payment.remainingCny)}，请充值或调整购买数量。`;
}

/** 统一紧凑付款区：余额在前、可用币种在后；只显示真实可用数量。 */
export function MibanWalletAvailableSummary({ payment, disabled = false, accent = "#FF6900" }: { payment: MibanMixedPayment; disabled?: boolean; accent?: string }) {
  const jointMode = payment.selectedCodes.length > 1;
  const [secondaryCode, setSecondaryCode] = useState<string | null>(null);
  const locked = disabled || !payment.ready || payment.refreshing;
  // 新挂载Hook自行查询；已有快照的长期挂载Hook在进入确认区时只刷新一次。
  const entryQuote = useRef({ initialQuotedAt: payment.quotedAt, checked: false });
  useEffect(() => {
    if (entryQuote.current.checked) return;
    if (!entryQuote.current.initialQuotedAt) {
      if (payment.quotedAt) entryQuote.current.checked = true;
      return;
    }
    if (disabled || payment.refreshing || !payment.ready) return;
    entryQuote.current.checked = true;
    payment.refresh();
  }, [payment.quotedAt, payment.ready, payment.refreshing, payment.refresh, disabled]);
  const hasBalance = Boolean(payment.quotedAt);
  const usableRows = usablePaymentRows(payment);
  const primary = usableRows.find(row => row.assetCode === "CNY") ?? usableRows.find(row => row.assetCode === "USDT") ?? usableRows[0];
  const alternatives = usableRows.filter(row => row.assetCode !== primary?.assetCode);
  const rows = primary ? [primary, ...alternatives] : [];
  const secondary = alternatives.find(row => row.assetCode === secondaryCode)
    ?? alternatives.find(row => row.assetCode === payment.selectedDigitalCode)
    ?? alternatives.find(row => row.selected)
    ?? alternatives[0];
  const visibleRows = rows.length > 2 ? [primary, secondary].filter((row): row is MibanPaymentAssetRow => Boolean(row)) : rows;
  const assetLabel = (code: string) => code === "CNY" ? "人民币" : code === "USDT" ? "U / USDT" : code;
  const assetAmount = (row: MibanPaymentAssetRow) => row.assetCode === "CNY"
    ? `¥${displayCny(row.available)}`
    : `${displayCoinAmount(row.assetCode, row.available)} ${row.assetCode === "USDT" ? "U" : row.assetCode}`;
  const chooseAsset = (code: string) => {
    if (locked) return;
    if (jointMode) payment.toggleAsset(code);
    else payment.useOnlyAsset(code);
  };
  const chooseSecondary = (code: string) => {
    if (locked || !alternatives.some(row => row.assetCode === code)) return;
    setSecondaryCode(code);
    if (jointMode) {
      // 两项陈列中的切换是替换第二项，不把已隐藏的旧第二币继续用于扣款。
      payment.useOnlyAsset(primary.assetCode);
      payment.prioritizeAsset(code);
    }
    else payment.useOnlyAsset(code);
  };
  const toggleJoint = () => {
    if (locked || visibleRows.length < 2) return;
    if (!jointMode) {
      // 仅加入明确陈列的两项；其他币种只有用户主动选下拉时才加入。
      payment.useOnlyAsset(visibleRows[0].assetCode);
      payment.prioritizeAsset(visibleRows[1].assetCode);
    }
    else payment.useOnlyAsset(secondary?.selected ? secondary.assetCode : visibleRows[0].assetCode);
  };
  return <div data-payment-summary aria-busy={payment.refreshing} className="min-w-0 space-y-3 text-[11px]">
    <div data-payment-wallet-total data-balance-quoted-at={payment.quotedAt ?? ""} aria-live="polite" className="flex min-w-0 items-center gap-2 border-b border-gray-100 pb-3">
      <span data-payment-wallet-avatar aria-label="当前用户头像" className="flex h-7 w-7 shrink-0 items-center justify-center"><MibanWalletUserAvatar /></span>
      <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
        <h3 className="shrink-0 text-[12px] font-semibold text-gray-800">钱包可用余额</h3>
        <div className="min-w-0 text-right tabular-nums">
          <p data-payment-wallet-total-usdt className="break-all text-[14px] font-bold leading-5" style={{ color: accent }}>≈ {hasBalance ? displayUsdt(payment.availableValueUsdt) : "--"} U</p>
          <p data-payment-wallet-total-cny className="break-all text-[10px] leading-4 text-gray-400">≈ ¥{hasBalance ? displayCny(payment.availableValueCny) : "--"}</p>
        </div>
      </div>
      <button type="button" aria-label="刷新钱包可用余额" title="刷新余额" disabled={disabled || payment.refreshing} onClick={() => { if (!disabled && !payment.refreshing) payment.refresh(); }} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-400 disabled:opacity-40"><RefreshCw size={12} aria-hidden="true" /></button>
      <span data-payment-balance-status role="status" className="sr-only">{payment.refreshing ? "正在更新可用余额" : hasBalance ? "钱包可用余额已更新" : "余额待查询"}</span>
    </div>
    <h3 data-payment-selection-heading className="text-[12px] font-semibold leading-5 text-gray-800">选择币种</h3>
    {visibleRows.length ? <div data-payment-categories className="space-y-2">
      {visibleRows.map((row, index) => <div key={row.assetCode} data-payment-category={row.assetCode === "CNY" ? "CNY" : "digital"} data-payment-asset={row.assetCode} data-payment-selected={row.selected} className="flex min-w-0 items-center gap-2 rounded-lg border bg-white px-2.5 py-2" style={{ borderColor: row.selected ? accent : "#e5e7eb" }}>
        {jointMode && <input type="checkbox" aria-label={`参与支付 ${row.assetCode}`} checked={row.selected} disabled={locked} onChange={() => { if (!locked) payment.toggleAsset(row.assetCode); }} className="h-3.5 w-3.5 shrink-0" style={{ accentColor: accent }} />}
        {rows.length > 2 && index === 1
          ? <select aria-label="选择支付币种" value={row.assetCode} disabled={locked} onChange={event => chooseSecondary(event.target.value)} className="h-7 w-[112px] min-w-0 max-w-[45%] shrink-0 rounded-md border-0 bg-transparent pl-0 pr-1 text-[12px] font-semibold" style={{ color: accent }}>
              {alternatives.map(asset => <option key={asset.assetCode} value={asset.assetCode}>{assetLabel(asset.assetCode)} · {assetAmount(asset)}</option>)}
            </select>
          : null}
        <button type="button" aria-label={`使用${row.assetCode === "CNY" ? "人民币" : row.assetCode}支付`} aria-pressed={row.selected} disabled={locked} onClick={() => chooseAsset(row.assetCode)} className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded text-right outline-none focus-visible:ring-2 focus-visible:ring-gray-300">
          {!(rows.length > 2 && index === 1) && <span className="shrink-0 text-[12px] font-semibold text-gray-700">{assetLabel(row.assetCode)}</span>}
          <span className="ml-auto flex min-w-0 items-center justify-end gap-1.5"><span className="min-w-0 break-all text-[12px] font-semibold tabular-nums text-gray-800">{assetAmount(row)}</span>{row.selected && <Check size={12} aria-hidden="true" className="shrink-0" style={{ color: accent }} />}</span>
        </button>
      </div>)}
    </div> : <p data-payment-empty className="text-[11px] leading-5 text-gray-500">{hasBalance ? "暂无可用币种" : payment.refreshing ? "正在读取可用币种…" : "币种待查询"}</p>}
    {rows.length > 1 && <button type="button" data-payment-joint-toggle aria-pressed={jointMode} disabled={locked} onClick={toggleJoint} className="rounded-md border px-2.5 py-1.5 text-[11px] font-semibold disabled:text-gray-400" style={{ color: accent, borderColor: jointMode ? accent : "#e5e7eb" }}>{jointMode ? "关闭联合支付" : "多币种联合支付"}</button>}
    <p data-payment-summary-status role="status" title={payment.statusMessage} className="h-4 truncate text-[11px] leading-4 text-gray-500">{compactPaymentStatus(payment)}</p>
    <p data-payment-combination-hint className="min-h-10 break-words text-[11px] leading-5 text-gray-500">{combinationHint(payment)}</p>
  </div>;
}

/** 钱包付款弹窗只读确认区：直接显示已选币种及原生扣币量，不挂载选币组件或主动刷新。 */
export function MibanPaymentConfirmation({ payment, disabled = false, accent = "#FF6900" }: {
  payment: MibanMixedPayment; disabled?: boolean; accent?: string;
}) {
  const deductions = payment.deductions.filter(row => positiveUnits(row.amount) > BigInt(0));
  const hasNotice = payment.refreshing || !payment.ready || Number(payment.remainingCny) > 0 ||
    /报价已更新|核验失败|读取失败|不足/.test(payment.statusMessage);
  const totalUsdt = equivalentUsdt(payment.totalValueCny, String(payment.usdtCnyRate));
  return <section aria-label="付款构成" data-payment-section data-payment-allocation data-payment-confirmation aria-busy={payment.refreshing || disabled} className="mt-3 min-w-0 space-y-1 text-[12px] leading-5">
    <div data-payment-deduction-details className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 tabular-nums text-gray-700">
      {deductions.length ? deductions.map((row, index) => <span key={row.assetCode} data-payment-deduction-asset={row.assetCode} className="min-w-0 break-all">
        {index > 0 && <span aria-hidden="true" className="mr-1.5 text-gray-400">+</span>}
        {row.amount} {row.assetCode === "CNY" ? "人民币" : row.assetCode}
      </span>) : <span className="text-gray-500">付款信息待核验</span>}
    </div>
    <p data-payment-total-cny className="break-words text-[11px] tabular-nums" style={{ color: accent }}>合计 ≈ {displayUsdt(totalUsdt)} U · ¥{displayCny(payment.totalValueCny)}</p>
    <p data-payment-allocation-status role="status" aria-live="polite" className="break-words text-[11px] leading-5 text-gray-500 empty:hidden">{hasNotice ? payment.statusMessage : null}</p>
  </section>;
}

/** 兼容既有付款弹窗调用名；与 MibanPaymentConfirmation 一致，始终只读。 */
export function MibanMixedPaymentAllocation(props: { payment: MibanMixedPayment; disabled?: boolean; accent?: string }) {
  return MibanPaymentConfirmation(props);
}
