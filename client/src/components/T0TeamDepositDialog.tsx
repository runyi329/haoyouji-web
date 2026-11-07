import { useEffect, useRef } from "react";
import { Plus, X } from "lucide-react";

export type T0TeamDepositLog = {
  id: string;
  relatedUserId: number;
  direction: "deposit" | "withdrawal";
  occurredOn: string;
  amount: number;
  note?: string;
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

export function formatT0TeamDepositDate(value: string) {
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return parts ? `${Number(parts[2])}月${Number(parts[3])}日` : value || "日期未提供";
}

const amountText = (value: number) => value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });

export function T0TeamDepositDialog({ member, logs, loading, error, onClose, onRetry, onRegister }: {
  member: { userId: number; name: string; cumulativeDepositAmount: number };
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
  const invalidAmount = summary?.total === null || !Number.isFinite(member.cumulativeDepositAmount);
  const canShowDetails = !error && !invalidAmount && Boolean(summary);
  // 累计金额与逐笔合计按显示口径核对；容差仅消除浮点误差，不重算任何本金。
  const reconciled = canShowDetails && Math.abs(summary!.total! - member.cumulativeDepositAmount) < 0.005;

  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 px-3 py-4" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="t0-team-deposit-title" className="flex max-h-[80dvh] w-full max-w-sm flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
      <header className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          <h2 id="t0-team-deposit-title" className="truncate text-sm font-semibold text-slate-900">{member.name} · 充值明细</h2>
          <p className="mt-1 text-[11px] tabular-nums text-slate-500">总金额 {Number.isFinite(member.cumulativeDepositAmount) ? amountText(member.cumulativeDepositAmount) : "--"} U · 不含提现</p>
        </div>
        <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="关闭团队充值明细" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 active:scale-95"><X className="h-4 w-4" /></button>
      </header>
      <div className="min-h-0 overflow-y-auto overscroll-contain px-4" aria-busy={loading}>
        {error || invalidAmount ? <div className="py-6 text-center text-xs leading-5 text-rose-600" role="alert">{invalidAmount ? "充值金额异常，暂无法核对。" : "充值明细读取失败，请重试。"}<button type="button" onClick={onRetry} className="mt-2 block w-full py-2 font-medium underline">重新读取</button></div> : !canShowDetails ? <p className="py-6 text-center text-xs text-slate-400">正在读取此成员的充值记录…</p> : <>
          {summary!.deposits.length > 0 ? <ul className="divide-y divide-slate-100">{summary!.deposits.map((log) => <li key={log.id} className="flex min-w-0 items-baseline gap-2 py-2 text-[11px] leading-4 tabular-nums">
            <time dateTime={log.occurredOn} title={log.occurredOn} className="w-[62px] shrink-0 whitespace-nowrap text-slate-500">{formatT0TeamDepositDate(log.occurredOn)}</time>
            <span title={log.note?.trim() || undefined} className="min-w-0 flex-1 truncate text-slate-400">{log.note?.trim() || ""}</span>
            <span className="shrink-0 whitespace-nowrap font-semibold text-sky-700">{amountText(log.amount)} <span className="text-[9px] font-medium">U</span></span>
          </li>)}</ul> : <p className="py-5 text-center text-xs text-slate-400">暂无充值记录</p>}
        </>}
      </div>
      <footer className="shrink-0 border-t border-slate-100 px-4 py-3">
        {canShowDetails && <div className="mb-2 text-[11px] tabular-nums">
          <div className="flex items-center justify-between gap-2 font-medium text-slate-700"><span>共 {summary!.deposits.length} 笔充值</span><span>合计 {amountText(summary!.total!)} U</span></div>
          <p className={`mt-1 text-[10px] ${reconciled ? "text-slate-400" : "text-amber-700"}`}>{reconciled ? "与总金额一致（U口径）" : "明细合计与概览总金额不一致，请刷新核对。"}{!reconciled && <button type="button" onClick={onRetry} className="ml-1 underline">重新核对</button>}</p>
        </div>}
        <button type="button" onClick={onRegister} className="flex h-10 w-full items-center justify-center gap-1 rounded-lg bg-sky-600 text-sm font-semibold text-white active:scale-[0.99]"><Plus className="h-4 w-4" />登记充值</button>
      </footer>
    </div>
  </div>;
}
