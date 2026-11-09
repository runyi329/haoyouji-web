import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, LockKeyhole, RefreshCw, ShieldCheck, Unlock, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { AI_WALLET_CRYPTO_MARKET_ASSETS } from "@shared/ai-wallet-assets";

export type Ledger37MarginWalletActionsProps = {
  targetUserId: number;
  tagName: string;
  targetName?: string;
  paused?: boolean;
  requiredCny?: number | null;
  actualCny?: number;
  /** 每单位资产的人民币价格；缺价时不提供补足换算。 */
  prices?: Record<string, number>;
  onChanged?: () => void | Promise<void>;
};

type Mode = "freeze" | "release";
type Confirmation = {
  mode: Mode; targetUserId: number; tagName: string; targetName: string;
  assetCode: string; amount: string; holdId?: number;
};
type Balance = {
  available?: string | number; frozen?: string | number;
  availableBalance?: string | number; frozenBalance?: string | number;
};
const ASSETS = ["CNY", "USDT", ...AI_WALLET_CRYPTO_MARKET_ASSETS];
const SCALE = 10n ** 18n;
const AMOUNT_PATTERN = /^(?:0|[1-9]\d{0,17})(?:\.\d{1,18})?$/;
// 输入和请求保留原始十进制字符串；比较、百分比和参考换算不经过浮点数。
function units(value: unknown): bigint | null {
  const match = String(value ?? "").trim().match(/^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i);
  if (!match) return null;
  const exponent = Number(match[4] ?? 0);
  if (!Number.isInteger(exponent) || Math.abs(exponent) > 100) return null;
  const digits = BigInt(match[2] + (match[3] ?? ""));
  const shift = 18 + exponent - (match[3]?.length ?? 0);
  const result = shift >= 0 ? digits * 10n ** BigInt(shift) : digits / 10n ** BigInt(-shift);
  return match[1] ? -result : result;
}
function text(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  const fraction = (abs % SCALE).toString().padStart(18, "0").replace(/0+$/, "");
  return `${sign}${abs / SCALE}${fraction ? `.${fraction}` : ""}`;
}
const min = (a: bigint, b: bigint) => a < b ? a : b;
const control = "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm disabled:opacity-50";
const quick = "rounded-md border border-slate-200 bg-white px-2 py-1 text-xs disabled:opacity-40";

/** 只由父层按已登录操作者 id=870413 挂载；不使用被观察成员的角色判断权限。 */
export function Ledger37MarginWalletActions({
  targetUserId, tagName, targetName, paused = false, requiredCny, actualCny = 0, prices, onChanged,
}: Ledger37MarginWalletActionsProps) {
  const id = useId();
  const [mode, setMode] = useState<Mode | null>(null);
  const [assetCode, setAssetCode] = useState("CNY");
  const [holdId, setHoldId] = useState("");
  const [amount, setAmount] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [working, setWorking] = useState(false);
  const inFlight = useRef(false);
  const context = trpc.ledger.getLedger37WalletMarginContext.useQuery(
    { targetUserId },
    { enabled: mode !== null && targetUserId > 0, staleTime: 0, refetchOnWindowFocus: true },
  );
  const freeze = trpc.ledger.freezeLedger37MarginFromWallet.useMutation();
  const release = trpc.ledger.releaseLedger37MarginToWallet.useMutation();
  const busy = working || freeze.isPending || release.isPending;
  // 后台刷新继续使用当前已读取的数据，不让快捷键与下一步反复变灰；点击后仍重新读取并校验真实余额。
  const reset = () => { setMode(null); setAmount(""); setHoldId(""); setConfirmation(null); };
  useEffect(() => {
    setMode(null); setAmount(""); setHoldId(""); setConfirmation(null); setAssetCode("CNY");
  }, [targetUserId, tagName]);

  type Context = NonNullable<typeof context.data>;
  const eligibleHolds = (data?: Context) => (data?.holds ?? []).filter((hold) =>
    hold.userId === targetUserId && hold.tagName === tagName && hold.status === "active"
    && ASSETS.includes(hold.assetCode) && (units(hold.remainingAmount) ?? 0n) > 0n,
  );
  const holds = eligibleHolds(context.data);
  const selectedHold = holds.find((hold) => String(hold.id) === holdId);
  const selectedAsset = mode === "release" ? selectedHold?.assetCode ?? "" : assetCode;
  const balanceFor = (data: Context | undefined, code: string): Balance | null | undefined =>
    code === "CNY" ? data?.cny : code === "USDT" ? data?.usdt
      : data?.multiAssetBalances.find((balance) => balance.assetCode === code);
  const wallet = balanceFor(context.data, selectedAsset);
  const available = units(wallet?.availableBalance ?? wallet?.available) ?? 0n;
  const frozen = units(wallet?.frozenBalance ?? wallet?.frozen) ?? 0n;
  const remaining = units(selectedHold?.remainingAmount) ?? 0n;
  const limit = mode === "release" ? remaining : available;
  const parsed = AMOUNT_PATTERN.test(amount.trim()) ? units(amount.trim()) : null;
  const invalid = parsed === null || parsed <= 0n ? "请输入大于 0 的金额（整数及小数各最多 18 位）"
    : parsed > limit ? mode === "release" ? "金额不能超过该批次剩余冻结" : "金额不能超过钱包可用余额" : "";
  const required = requiredCny == null ? null : units(requiredCny);
  const actual = units(actualCny);
  const price = selectedAsset === "CNY" ? SCALE : units(prices?.[selectedAsset]);
  const gap = required !== null && actual !== null ? required - actual : null;
  const topUp = gap !== null && gap > 0n && price !== null && price > 0n
    ? min(gap * SCALE / price, available > 0n ? available : 0n) : null;
  const direction = (value: Mode) => value === "freeze" ? "钱包 → 标签押金（冻结）" : "标签押金 → 钱包（恢复可用）";
  const switchMode = (next: Mode) => {
    if (inFlight.current || busy || (next === "freeze" && paused)) return;
    setMode(mode === next ? null : next); setAmount(""); setHoldId(""); setConfirmation(null);
  };
  const validate = (draft: Confirmation, data: Context) => {
    if (draft.targetUserId !== targetUserId || draft.tagName !== tagName) throw new Error("目标已变化，请重新确认");
    if (draft.mode === "freeze" && paused) throw new Error("标签已暂停，不能存入；仍可解冻回钱包");
    const value = AMOUNT_PATTERN.test(draft.amount) ? units(draft.amount) : null;
    if (value === null || value <= 0n) throw new Error("金额须大于 0，整数及小数各最多 18 位");
    let maximum: bigint;
    if (draft.mode === "release") {
      const hold = eligibleHolds(data).find((item) => item.id === draft.holdId && item.assetCode === draft.assetCode);
      if (!hold) throw new Error("该冻结批次已变化或已解冻，请重新选择");
      maximum = units(hold.remainingAmount) ?? 0n;
    } else {
      if (!ASSETS.includes(draft.assetCode)) throw new Error("请选择受支持的数字币或 CNY / USDT");
      const source = balanceFor(data, draft.assetCode);
      maximum = units(source?.availableBalance ?? source?.available) ?? 0n;
    }
    if (value > maximum) throw new Error(draft.mode === "release" ? "金额超过该批次当前剩余冻结" : "金额超过当前钱包可用余额");
  };
  const prepare = async () => {
    if (!mode || inFlight.current || busy) return;
    if (invalid) { toast.error(invalid); return; }
    const draft: Confirmation = {
      mode, targetUserId, tagName, targetName: targetName || `成员 #${targetUserId}`,
      assetCode: selectedAsset, amount: amount.trim(), holdId: selectedHold?.id,
    };
    inFlight.current = true; setWorking(true);
    try {
      const fresh = await context.refetch();
      if (fresh.error || !fresh.data) throw new Error(fresh.error?.message || "无法读取最新钱包余额");
      validate(draft, fresh.data); setConfirmation(draft);
    } catch (error) { toast.error(error instanceof Error ? error.message : "预检失败，请刷新重试"); }
    finally { inFlight.current = false; setWorking(false); }
  };
  const execute = async () => {
    if (!confirmation || inFlight.current || busy) return;
    if (import.meta.env.DEV) {
      toast.info("开发热预览：未执行冻结或解冻，未改变余额，也未生成押金或钱包流水。");
      setConfirmation(null); return;
    }
    inFlight.current = true; setWorking(true);
    try {
      const fresh = await context.refetch();
      if (fresh.error || !fresh.data) throw new Error(fresh.error?.message || "无法读取最新钱包余额");
      validate(confirmation, fresh.data);
      if (confirmation.mode === "freeze") {
        await freeze.mutateAsync({ ledgerId: 37, targetUserId: confirmation.targetUserId,
          tagName: confirmation.tagName, assetCode: confirmation.assetCode, amount: confirmation.amount });
      } else {
        await release.mutateAsync({ ledgerId: 37, holdId: confirmation.holdId!, amount: confirmation.amount });
      }
      // 写入成功后即使刷新失败也清理草稿，避免把刷新错误当作资金失败重复提交。
      const refreshed = await Promise.allSettled([
        context.refetch().then((result) => { if (result.error) throw result.error; }),
        Promise.resolve().then(() => onChanged?.()),
      ]);
      reset();
      toast.success("操作已完成，已自动登记押金明细与钱包流水，原记录保留。");
      if (refreshed.some((result) => result.status === "rejected")) toast.warning("资金操作已完成，但明细刷新失败，请刷新查看，勿重复提交。");
    } catch (error) {
      setConfirmation(null);
      toast.error(error instanceof Error ? error.message : "操作失败，草稿已保留");
    } finally { inFlight.current = false; setWorking(false); }
  };

  return (
    <section className="space-y-2 text-slate-700" aria-label="钱包押金操作">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || paused} aria-expanded={mode === "freeze"} onClick={() => switchMode("freeze")}
          className="inline-flex items-center gap-1 rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 disabled:opacity-40">
          <LockKeyhole size={13} />存入押金
        </button>
        <button type="button" disabled={busy} aria-expanded={mode === "release"} onClick={() => switchMode("release")}
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 disabled:opacity-40">
          <Unlock size={13} />解冻回钱包
        </button>
      </div>
      {mode && (
        <div className={`space-y-2.5 rounded-xl border bg-white p-3 ${mode === "freeze" ? "border-blue-100" : "border-emerald-100"}`}>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="inline-flex items-center gap-1"><ArrowRight size={13} />{direction(mode)}</span>
            <div className="flex gap-2">
              <button type="button" aria-label="刷新真实钱包余额" disabled={busy || context.isFetching} onClick={() => {
                setConfirmation(null);
                void context.refetch().then((result) => { if (result.error) toast.error(result.error.message); });
              }}><RefreshCw size={14} className={context.isFetching ? "animate-spin" : ""} /></button>
              <button type="button" aria-label="关闭钱包押金操作" disabled={busy} onClick={reset}><X size={15} /></button>
            </div>
          </div>
          {context.isLoading && <p className="text-xs text-slate-500">正在读取真实钱包余额…</p>}
          {context.error && <p role="alert" className="text-xs text-red-600">{context.error.message}</p>}
          {paused && <p className="text-xs text-amber-700">标签已暂停：禁止存入，允许部分或全部解冻。</p>}
          {confirmation ? (
            <div className="space-y-2 rounded-lg bg-slate-50 p-2.5 text-xs" role="alert">
              <p className="flex items-center gap-1 font-semibold"><ShieldCheck size={14} />请再次核对</p>
              <p className="break-words">目标：{confirmation.targetName}（#{confirmation.targetUserId}） · 标签：{confirmation.tagName}</p>
              <p className="break-all font-semibold">{confirmation.amount} {confirmation.assetCode}</p>
              <p>{direction(confirmation.mode)}{confirmation.holdId ? ` · 批次 #${confirmation.holdId}` : ""}</p>
              <div className="flex gap-2 pt-1">
                <button type="button" className={quick} disabled={busy} onClick={() => setConfirmation(null)}>返回修改</button>
                <button type="button" disabled={busy || (confirmation.mode === "freeze" && paused)} onClick={() => void execute()}
                  className={`rounded-md px-3 py-1.5 font-medium text-white disabled:opacity-40 ${confirmation.mode === "freeze" ? "bg-blue-600" : "bg-emerald-600"}`}>
                  {busy ? "处理中…" : import.meta.env.DEV ? "确认（预览不执行）" : "确认执行"}
                </button>
              </div>
            </div>
          ) : (
            <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); void prepare(); }}>
              <label htmlFor={`${id}-asset`} className="block text-xs">{mode === "freeze" ? "存入币种" : "选择冻结批次"}</label>
              <select id={`${id}-asset`} className={control} disabled={busy || context.isLoading} value={mode === "freeze" ? assetCode : holdId}
                onChange={(event) => { mode === "freeze" ? setAssetCode(event.target.value) : setHoldId(event.target.value); setAmount(""); }}>
                {mode === "freeze" ? ASSETS.map((code) => <option key={code} value={code}>{code === "CNY" ? "人民币 CNY" : code}</option>) : <>
                  <option value="">{holds.length ? "请选择具体批次" : "暂无可解冻批次"}</option>
                  {holds.map((hold) => <option key={hold.id} value={String(hold.id)}>#{hold.id} · {hold.assetCode} · 剩余 {hold.remainingAmount}{hold.createdAt ? ` · ${hold.createdAt}` : ""}</option>)}
                </>}
              </select>
              <p className="break-all text-xs text-slate-500">{context.data ? `可用 ${text(available)} · 已冻 ${text(frozen)} ${selectedAsset}` : "余额尚未读取"}{mode === "release" && selectedHold ? ` · 本批剩余 ${selectedHold.remainingAmount}` : ""}</p>
              <label htmlFor={`${id}-amount`} className="block text-xs">{mode === "freeze" ? "存入金额" : "解冻金额（支持部分 / 全部）"}</label>
              <input id={`${id}-amount`} className={control} inputMode="decimal" autoComplete="off" placeholder="请输入金额，最多 18 位小数"
                value={amount} disabled={busy || (mode === "freeze" && paused)} onChange={(event) => setAmount(event.target.value)} />
              <div className="flex flex-wrap gap-1.5">
                {mode === "release" ? [25, 50, 100].map((percent) => <button type="button" key={percent} className={quick}
                  disabled={busy || !selectedHold} onClick={() => setAmount(text(remaining * BigInt(percent) / 100n))}>{percent === 100 ? "全部" : `${percent}%`}</button>) : <>
                  <button type="button" className={quick} disabled={busy || paused || available <= 0n} onClick={() => setAmount(text(available))}>可用余额</button>
                  <button type="button" className={quick} disabled={busy || paused || topUp === null || topUp <= 0n} onClick={() => topUp !== null && setAmount(text(topUp))}>补足参考</button>
                </>}
              </div>
              {mode === "freeze" && <p className="text-[11px] text-slate-400">{required === null ? "参考押金未确定，不设虚构存入上限。" : price === null || price <= 0n ? "缺少该币种人民币价格，无法换算补足参考。" : "补足仅为参考，按可用余额取较小值并向下截至 18 位；不限制手动存入。"}</p>}
              {amount && invalid && <p role="alert" className="text-xs text-red-600">{invalid}</p>}
              <button type="submit" disabled={busy || !!context.error || !context.data || !!invalid || (mode === "freeze" && paused)}
                className={`w-full rounded-lg py-2 text-xs font-medium text-white disabled:opacity-40 ${mode === "freeze" ? "bg-blue-600" : "bg-emerald-600"}`}>{busy ? "核对最新余额…" : "下一步：核对并确认"}</button>
            </form>
          )}
          <p className="text-[11px] text-slate-400">执行后自动保存真实操作日期、方向、押金与钱包流水；原冻结及解冻记录保留。</p>
        </div>
      )}
    </section>
  );
}

export default Ledger37MarginWalletActions;
