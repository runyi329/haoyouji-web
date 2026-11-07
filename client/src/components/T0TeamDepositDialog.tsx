import { useEffect, useRef } from "react";
import { Plus, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import T0TeamDepositImageDownload from "./T0TeamDepositImageDownload";

export type T0TeamDepositLog = {
  id: string;
  relatedUserId: number;
  direction: "deposit" | "withdrawal";
  occurredOn: string;
  amount: number;
  note?: string;
  ethQuantity?: string;
  ethReferencePrice?: string;
  depositInputMode?: "u" | "eth";
};

/** 直接累加账本的U金额：不使用ETH数量、不扣提现，也不逐笔取整。 */
export function getT0TeamDepositSummary(logs: T0TeamDepositLog[] | undefined, userId: number) {
  if (!logs) return undefined;
  const deposits = logs.filter((log) => log.direction === "deposit" && Number(log.relatedUserId) === userId);
  const total = deposits.every((log) => Number.isFinite(log.amount))
    ? deposits.reduce((sum, log) => sum + log.amount, 0)
    : null;
  return { deposits, total };
}

/** 只解析真实保存的非负十进制币数；缺失、空串或无效值不能视为0。 */
function parseRecordedEth(value: string | undefined) {
  const raw = value?.trim();
  if (!raw || !/^\d+(?:\.\d+)?$/.test(raw)) return null;
  const [whole, fraction = ""] = raw.split(".");
  return { units: BigInt(whole + fraction), scale: fraction.length };
}

/** 独立于U口径，以十进制定点精确累加已录入的ETH，不使用任何价格倒推。 */
export function getT0TeamDepositEthSummary(deposits: T0TeamDepositLog[]) {
  let units = 0n;
  let scale = 0;
  let recordedCount = 0;
  for (const log of deposits) {
    const quantity = parseRecordedEth(log.ethQuantity);
    if (!quantity) continue;
    const nextScale = Math.max(scale, quantity.scale);
    units = units * 10n ** BigInt(nextScale - scale)
      + quantity.units * 10n ** BigInt(nextScale - quantity.scale);
    scale = nextScale;
    recordedCount += 1;
  }
  const digits = units.toString().padStart(scale + 1, "0");
  const fraction = scale ? digits.slice(-scale).replace(/0+$/, "") : "";
  const total = `${scale ? digits.slice(0, -scale) : digits}${fraction ? `.${fraction}` : ""}`;
  return { total, recordedCount, missingCount: deposits.length - recordedCount };
}

/** ETH统一两位小数展示，舍入仍使用定点；极小的真实币数不误显示为0。 */
export function formatT0TeamDepositEthQuantity(value: string | undefined) {
  const quantity = parseRecordedEth(value);
  if (!quantity) return null;
  const divisor = 10n ** BigInt(Math.max(0, quantity.scale - 2));
  const rounded = quantity.scale > 2
    ? (quantity.units + divisor / 2n) / divisor
    : quantity.units * 10n ** BigInt(2 - quantity.scale);
  if (quantity.units > 0n && rounded === 0n) return "< 0.01";
  const digits = rounded.toString().padStart(3, "0");
  const whole = digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${whole}.${digits.slice(-2)}`;
}

export function formatT0TeamDepositDate(value: string) {
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return parts ? `${parts[2]}月${parts[3]}日` : value || "日期未提供";
}

const amountText = (value: number) => value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });

export function T0TeamDepositDialog({ member, logs, loading, error, onClose, onRetry, onRegister }: {
  member: { userId: number; name: string; avatar?: string; cumulativeDepositAmount: number };
  logs?: T0TeamDepositLog[];
  loading: boolean;
  error: boolean;
  onClose: () => void;
  onRetry: () => void;
  onRegister: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key !== "Tab") return;
      const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") || []);
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [onClose]);

  const summary = getT0TeamDepositSummary(logs, member.userId);
  const ethSummary = summary ? getT0TeamDepositEthSummary(summary.deposits) : undefined;
  const invalidAmount = summary?.total === null || !Number.isFinite(member.cumulativeDepositAmount);
  const canShowDetails = !error && !invalidAmount && Boolean(summary);
  // 累计金额与逐笔合计按显示口径核对；容差仅消除浮点误差，不重算任何本金。
  const reconciled = canShowDetails && Math.abs(summary!.total! - member.cumulativeDepositAmount) < 0.005;
  const ethTotalText = !ethSummary || !ethSummary.recordedCount
    ? `ETH 数量未录入${ethSummary?.missingCount ? ` · ${ethSummary.missingCount}笔未录入` : ""}`
    : ethSummary.missingCount
      ? `已记录 ${formatT0TeamDepositEthQuantity(ethSummary.total)} ETH · ${ethSummary.missingCount}笔未录入`
      : `合计 ${formatT0TeamDepositEthQuantity(ethSummary.total)} ETH`;

  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 px-3 py-4 backdrop-blur-sm" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="t0-team-deposit-title" className="flex max-h-[82dvh] w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar className="h-10 w-10 border border-slate-200">
            <AvatarImage src={member.avatar} alt={`${member.name}头像`} className="object-cover" />
            <AvatarFallback className="bg-slate-800 text-sm font-semibold text-white">{member.name.slice(0, 1)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h2 id="t0-team-deposit-title" className="truncate text-sm font-semibold text-slate-900">{member.name} · 充值明细</h2>
            <p className="mt-0.5 text-[11px] tabular-nums text-slate-500">总金额 {Number.isFinite(member.cumulativeDepositAmount) ? amountText(member.cumulativeDepositAmount) : "--"} U · 不含提现</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <T0TeamDepositImageDownload disabled={loading || !canShowDetails || !reconciled || !summary?.deposits.length} getSnapshot={() => {
            if (loading || !canShowDetails || !reconciled || !summary || summary.total === null || !summary.deposits.length) throw new Error("请等待充值明细读取并核对完成后下载");
            return {
              memberName: member.name,
              avatar: member.avatar,
              rows: summary.deposits.map((log) => {
                const ethQuantity = formatT0TeamDepositEthQuantity(log.ethQuantity);
                return { date: log.occurredOn || "日期未提供", eth: ethQuantity === null ? "未录入 ETH" : `${ethQuantity} ETH`, u: `${amountText(log.amount)} U`, note: log.note?.trim() || "无备注" };
              }),
              ethTotal: ethTotalText,
              uTotal: `合计 ${amountText(summary.total)} U`,
              reconciled: true,
            };
          }} />
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="关闭团队充值明细" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 active:scale-95"><X className="h-4 w-4" /></button>
        </div>
      </header>
      <div className="min-h-0 overflow-y-auto overscroll-contain px-4" aria-busy={loading}>
        {error || invalidAmount ? <div className="py-6 text-center text-xs leading-5 text-rose-600" role="alert">{invalidAmount ? "充值金额异常，暂无法核对。" : "充值明细读取失败，请重试。"}<button type="button" onClick={onRetry} className="mt-2 block w-full py-2 font-medium underline">重新读取</button></div> : !canShowDetails ? <p className="py-6 text-center text-xs text-slate-400">正在读取此成员的充值记录…</p> : <>
          {summary!.deposits.length > 0 ? <ul className="grid grid-cols-[58px_minmax(0,1fr)_max-content]">{summary!.deposits.map((log) => {
            const ethQuantity = formatT0TeamDepositEthQuantity(log.ethQuantity);
            return <li key={log.id} className="col-span-3 grid min-w-0 grid-cols-subgrid items-center gap-y-0.5 border-b border-slate-100 py-2 text-[11px] leading-4 tabular-nums last:border-b-0">
              <time dateTime={log.occurredOn} title={log.occurredOn} className="whitespace-nowrap text-center font-medium text-slate-700">{formatT0TeamDepositDate(log.occurredOn)}</time>
              <span title={ethQuantity === null ? undefined : `${log.ethQuantity} ETH`} className="min-w-0 whitespace-nowrap pr-2 text-right font-semibold text-sky-700 max-[360px]:pr-1 max-[360px]:tracking-[-0.3px]">{ethQuantity === null ? "未录入 ETH" : `${ethQuantity} ETH`}</span>
              <span className="min-w-0 whitespace-nowrap border-l border-slate-200 pl-2 text-right font-semibold text-sky-700 max-[360px]:pl-1 max-[360px]:tracking-[-0.3px]">{amountText(log.amount)} U</span>
              <p title={log.note?.trim() || undefined} className="col-span-3 min-w-0 truncate text-slate-400">{log.note?.trim() || "无备注"}</p>
            </li>;
          })}</ul> : <p className="py-5 text-center text-xs text-slate-400">暂无充值记录</p>}
        </>}
      </div>
      <footer className="shrink-0 border-t border-slate-100 bg-slate-50/70 px-4 py-3">
        {canShowDetails && <div className="mb-3 tabular-nums">
          <div className="flex items-start justify-between gap-2">
            <span className="shrink-0 pt-0.5 text-[11px] text-slate-500">共 {summary!.deposits.length} 笔充值</span>
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1 text-right text-[11px] font-semibold leading-4 text-slate-800">
              {summary!.deposits.length > 0 && <>
                <span title={ethSummary?.recordedCount ? `已记录精确合计 ${ethSummary.total} ETH` : undefined}>{ethTotalText}</span>
                <span aria-hidden="true" className="h-3 w-px shrink-0 bg-slate-300" />
              </>}
              <span className="whitespace-nowrap">合计 {amountText(summary!.total!)} U</span>
            </div>
          </div>
          <p className={`mt-1.5 text-[10px] leading-4 ${reconciled ? "text-slate-400" : "text-amber-700"}`}>{reconciled ? "与总金额一致（U口径）" : "明细合计与概览总金额不一致，请刷新核对。"}{!reconciled && <button type="button" onClick={onRetry} className="ml-1 underline">重新核对</button>}</p>
        </div>}
        <button type="button" onClick={onRegister} className="flex h-10 w-full items-center justify-center gap-1 rounded-xl bg-sky-600 text-sm font-semibold text-white shadow-sm active:scale-[0.99]"><Plus className="h-4 w-4" />登记充值</button>
      </footer>
    </div>
  </div>;
}
