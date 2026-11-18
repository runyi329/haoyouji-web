import { useEffect, useRef, useState } from "react";
import { ChevronDown, LockKeyhole, RefreshCw, UnlockKeyhole } from "lucide-react";
import { toast } from "sonner";
import { AI_WALLET_ASSET_CATALOG, type AiWalletAsset } from "@shared/ai-wallet-assets";
import { mtrpc } from "@/pages/miban/mibanTrpc";
import {
  compareManualFreezeAmounts,
  getManualFreezableAssets,
  getManualFrozenAssetCount,
  getManualFreezeRequest,
  normalizeManualFreezeAmount,
  validateManualRelease,
  type ManualWalletFreeze,
} from "@/lib/walletManualFreeze";

type Props = {
  ledgerId: 52;
  userId: number;
  defaultAssetCode: AiWalletAsset;
  onSaved: (userId: number, assetCode: AiWalletAsset) => void;
};
type FreezeVariables = { ledgerId: 52; userId: number; assetCode: AiWalletAsset; amount: string; note: string; requestId: string };
type ReleaseVariables = { ledgerId: 52; userId: number; freezeId: number; amount: string; note: string; requestId: string };

type ManualFreezeAction = { id: number; freezeId: number; direction: "freeze" | "release"; amount: string; note: string; createdAt: string };

export function WalletManualFreezePanel({ ledgerId, userId, defaultAssetCode, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [assetCode, setAssetCode] = useState<AiWalletAsset>(defaultAssetCode);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [releaseTarget, setReleaseTarget] = useState<ManualWalletFreeze | null>(null);
  const [releaseAmount, setReleaseAmount] = useState("");
  const [releaseNote, setReleaseNote] = useState("");
  const [page, setPage] = useState(1);
  const busyRef = useRef(false);
  const freezeRequestRef = useRef<{ key: string; id: string } | null>(null);
  const releaseRequestRef = useRef<{ key: string; id: string } | null>(null);
  const identityRef = useRef({ ledgerId, userId });
  identityRef.current = { ledgerId, userId };
  const utils = mtrpc.useUtils();
  const stateQuery = mtrpc.adminUser.walletManualFreezeState.useQuery(
    { ledgerId, userId },
    { enabled: ledgerId === 52 && Number.isSafeInteger(userId) && userId > 0, placeholderData: undefined, staleTime: 0, retry: 1, refetchInterval: 15_000 },
  );
  useEffect(() => { setAssetCode(defaultAssetCode); }, [defaultAssetCode]);
  const isCurrentUser = (submittedUserId: number) => identityRef.current.userId === submittedUserId && identityRef.current.ledgerId === ledgerId;
  const afterSaved = (submittedUserId: number, code: AiWalletAsset) => {
    void utils.adminUser.walletManualFreezeState.invalidate({ ledgerId, userId: submittedUserId }).catch(() => {
      toast.error("操作已保存，冻结记录更新失败，请点更新；不要重复提交");
    });
    try { onSaved(submittedUserId, code); } catch { toast.error("操作已保存，请更新钱包查看最新余额"); }
  };
  const freezeMutation = mtrpc.adminUser.walletManualFreeze.useMutation({
    onSuccess: (_result: unknown, variables: FreezeVariables) => {
      toast.success("手动冻结成功，总资产未扣除");
      if (isCurrentUser(variables.userId)) {
        setAmount(""); setNote(""); setPage(1); freezeRequestRef.current = null;
      }
      afterSaved(variables.userId, variables.assetCode);
    },
    onError: (error: any) => toast.error(error.message || "冻结结果尚未确认，请先更新记录，不要改金额重复提交"),
    onSettled: () => { busyRef.current = false; },
  });
  const releaseMutation = mtrpc.adminUser.walletManualRelease.useMutation({
    onSuccess: (_result: unknown, variables: ReleaseVariables) => {
      toast.success("手动解冻成功，已恢复可用余额");
      const code = releaseTarget?.assetCode;
      if (isCurrentUser(variables.userId)) {
        setReleaseTarget(null); setReleaseAmount(""); setReleaseNote(""); releaseRequestRef.current = null;
      }
      if (code) afterSaved(variables.userId, code);
      else void utils.adminUser.walletManualFreezeState.invalidate({ ledgerId, userId: variables.userId });
    },
    onError: (error: any) => toast.error(error.message || "解冻结果尚未确认，请先更新记录，不要重复提交"),
    onSettled: () => { busyRef.current = false; },
  });
  const pending = freezeMutation.isPending || releaseMutation.isPending;
  const availableReady = !stateQuery.isPending && !stateQuery.isError && Array.isArray(stateQuery.data?.availableAssets);
  const freezableAssets = availableReady ? getManualFreezableAssets(stateQuery.data.availableAssets) : [];
  const selectedFreezableAsset = freezableAssets.find(asset => asset.assetCode === assetCode);
  const displayedAssetCode = selectedFreezableAsset?.assetCode
    ?? freezableAssets.find(asset => asset.assetCode === defaultAssetCode)?.assetCode
    ?? freezableAssets[0]?.assetCode ?? "";
  useEffect(() => {
    if (!pending && availableReady && displayedAssetCode && displayedAssetCode !== assetCode) {
      setAssetCode(displayedAssetCode); setAmount(""); freezeRequestRef.current = null;
    }
  }, [pending, availableReady, displayedAssetCode, assetCode]);
  const records: ManualWalletFreeze[] = Array.isArray(stateQuery.data?.items) ? stateQuery.data.items : [];
  const actions: ManualFreezeAction[] = Array.isArray(stateQuery.data?.events) ? stateQuery.data.events : [];
  const frozenAssetCount = getManualFrozenAssetCount(stateQuery.data?.items);
  const totalPages = Math.max(1, Math.ceil(records.length / 20));
  const currentPage = Math.min(page, totalPages);
  const visibleRecords = records.slice((currentPage - 1) * 20, currentPage * 20);

  const submitFreeze = () => {
    if (busyRef.current || pending || ledgerId !== 52 || !Number.isSafeInteger(userId) || userId <= 0) return;
    try {
      if (!availableReady) throw new Error("请先更新本用户的可冻结余额再冻结");
      if (!selectedFreezableAsset) throw new Error("请选择有可冻结数量的资产");
      const payload = { ledgerId, userId, assetCode, amount: normalizeManualFreezeAmount(assetCode, amount), note: note.trim() };
      if (compareManualFreezeAmounts(payload.amount, selectedFreezableAsset.availableAmount) > 0) throw new Error(`本资产最多可冻结 ${selectedFreezableAsset.availableAmount} ${assetCode}`);
      if (payload.note.length > 500) throw new Error("备注最多500字");
      const request = getManualFreezeRequest(freezeRequestRef.current, payload);
      freezeRequestRef.current = request;
      busyRef.current = true;
      freezeMutation.mutate({ ...payload, requestId: request.id });
    } catch (error: any) { busyRef.current = false; toast.error(error.message || "冻结数量无效"); }
  };
  const fillMaximum = () => {
    if (busyRef.current || pending || !availableReady || !selectedFreezableAsset) return;
    setAmount(selectedFreezableAsset.availableAmount);
  };
  const startRelease = (record: ManualWalletFreeze) => {
    if (busyRef.current || pending || stateQuery.isFetching || stateQuery.isError) return;
    try {
      if (record.status !== "active" || compareManualFreezeAmounts(record.remainingAmount, "0") <= 0) return;
      setReleaseTarget(record); setReleaseAmount(record.remainingAmount); setReleaseNote("");
      releaseRequestRef.current = null;
    } catch (error: any) { toast.error(error.message || "冻结记录无效，请更新"); }
  };
  const submitRelease = () => {
    if (busyRef.current || pending || !releaseTarget || ledgerId !== 52 || !Number.isSafeInteger(userId) || userId <= 0) return;
    try {
      // 只能使用当前用户真实列表里的手动冻结id，不能从金额或订单id猜测来源。
      const currentRecord = records.find(record => record.id === releaseTarget.id);
      if (!currentRecord || stateQuery.isError || stateQuery.isFetching) throw new Error("请先更新本用户的手动冻结记录再解冻");
      const payload = { ledgerId, userId, freezeId: currentRecord.id, amount: validateManualRelease(currentRecord, releaseAmount), note: releaseNote.trim() };
      if (payload.note.length > 500) throw new Error("备注最多500字");
      const request = getManualFreezeRequest(releaseRequestRef.current, payload);
      releaseRequestRef.current = request;
      busyRef.current = true;
      releaseMutation.mutate({ ...payload, requestId: request.id });
    } catch (error: any) { busyRef.current = false; toast.error(error.message || "解冻数量无效"); }
  };
  const inputClass = "w-full min-w-0 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-[13px] focus:border-orange-400 focus:outline-none disabled:opacity-50";

  return (
    <section className="overflow-hidden rounded-2xl border border-orange-100 bg-white" data-wallet-manual-freeze>
      <button type="button" onClick={() => setOpen(value => !value)} className="flex w-full items-center justify-between gap-2 p-4 text-left" aria-expanded={open}>
        <span className="flex min-w-0 flex-wrap items-center gap-2 text-[13px] font-bold text-gray-800"><LockKeyhole className="h-4 w-4 text-orange-500" />手动冻结 / 解冻<span aria-label="已手动冻结币种数" className="rounded-md bg-orange-50 px-2 py-0.5 text-[11px] font-medium tabular-nums text-orange-600">已冻 {frozenAssetCount ?? "—"}</span></span>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="space-y-3 px-4 pb-4">
        <p className="text-[11px] leading-5 text-gray-500">无需开单。冻结只占用可用余额，不扣总资产；订单或项目冻结须在原订单或项目解除，不能在这里直接解冻。</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="min-w-0 text-[11px] text-gray-500">资产
            <select aria-label="手动冻结资产" value={displayedAssetCode} disabled={pending || !availableReady || freezableAssets.length === 0} onChange={event => { setAssetCode(event.target.value as AiWalletAsset); setAmount(""); freezeRequestRef.current = null; }} className={`${inputClass} mt-1`}>
              {freezableAssets.length === 0 && <option value="">{availableReady ? "暂无可冻结资产" : "可冻结余额待更新"}</option>}
              {freezableAssets.map(asset => <option key={asset.assetCode} value={asset.assetCode}>{asset.assetCode} · {AI_WALLET_ASSET_CATALOG.find(item => item.code === asset.assetCode)?.name || asset.assetCode}</option>)}
            </select>
          </label>
          <label className="min-w-0 text-[11px] text-gray-500">冻结数量（{displayedAssetCode || "—"}）
            <div className="relative mt-1">
              <input aria-label="手动冻结数量" inputMode="decimal" type="text" value={amount} disabled={pending || !availableReady || !selectedFreezableAsset} onChange={event => setAmount(event.target.value)} placeholder={selectedFreezableAsset ? `可冻结 ${selectedFreezableAsset.availableAmount}` : "暂无可冻结数量"} className={`${inputClass} pr-14`} />
              <button type="button" aria-label="填入最大可冻结数量" onClick={fillMaximum} disabled={pending || !availableReady || !selectedFreezableAsset} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-1.5 py-1 text-[11px] font-semibold text-orange-600 disabled:opacity-30">最大</button>
            </div>
          </label>
        </div>
        <input aria-label="手动冻结备注" type="text" maxLength={500} value={note} disabled={pending} onChange={event => setNote(event.target.value)} placeholder="冻结备注（选填）" className={inputClass} />
        <button type="button" disabled={pending || !availableReady || !selectedFreezableAsset || !amount.trim()} onClick={submitFreeze} className="w-full rounded-xl bg-orange-500 py-2.5 text-[13px] font-bold text-white disabled:opacity-40">{freezeMutation.isPending ? "冻结处理中…" : `确认冻结 ${displayedAssetCode || ""}`}</button>
        <div className="flex items-center justify-between border-t border-gray-100 pt-3">
          <p className="text-[12px] font-bold text-gray-700">本用户手动冻结记录</p>
          <button type="button" onClick={() => { void stateQuery.refetch(); }} disabled={pending || stateQuery.isFetching} className="flex items-center gap-1 text-[11px] text-orange-600 disabled:opacity-40"><RefreshCw className={`h-3 w-3 ${stateQuery.isFetching ? "animate-spin" : ""}`} />更新</button>
        </div>
        {stateQuery.isError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-[11px] text-red-600">手动冻结记录读取失败，暂不能解冻，请点更新重试。</p>}
        {stateQuery.isPending && <p className="py-2 text-[11px] text-gray-400">正在读取冻结记录…</p>}
        {!stateQuery.isPending && !stateQuery.isError && records.length === 0 && <p className="py-2 text-[11px] text-gray-400">暂无手动冻结记录。订单冻结不在本列表解冻。</p>}
        <div className="space-y-2">
          {visibleRecords.map(record => <div key={record.id} className="rounded-xl border border-gray-100 p-3" data-manual-freeze-id={record.id}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><p className="break-all text-[12px] font-bold text-gray-800">{record.assetCode} · {record.status === "released" ? "已解冻" : "手动冻结"}</p><p className="mt-1 break-all text-[10px] text-gray-400">{record.createdAt}</p></div>
              {record.status === "active" && <button type="button" onClick={() => startRelease(record)} disabled={pending || stateQuery.isFetching || stateQuery.isError} className="flex shrink-0 items-center gap-1 rounded-lg bg-green-50 px-2 py-1.5 text-[11px] font-bold text-green-700 disabled:opacity-40"><UnlockKeyhole className="h-3 w-3" />解冻</button>}
            </div>
            <p className="mt-2 break-all text-[11px] text-gray-600">冻结 {record.amount} · 已解冻 {record.releasedAmount}<br />剩余 <span className="font-bold text-orange-600">{record.remainingAmount} {record.assetCode}</span></p>
            {record.note && <p className="mt-1 whitespace-pre-wrap break-all text-[11px] text-gray-500">{record.note}</p>}
            {actions.some(action => action.freezeId === record.id) && <details className="mt-2 text-[11px] text-gray-500">
              <summary className="cursor-pointer text-orange-600">操作记录（最近20笔）</summary>
              <div className="mt-2 space-y-2">
                {actions.filter(action => action.freezeId === record.id).slice(0, 20).map(action => <div key={action.id} className="border-l-2 border-gray-100 pl-2">
                  <p className="break-all">{action.direction === "freeze" ? "冻结" : "解冻"} {action.amount} {record.assetCode} · {action.createdAt}</p>
                  {action.note && <p className="whitespace-pre-wrap break-all">{action.note}</p>}
                </div>)}
              </div>
            </details>}
            {releaseTarget?.id === record.id && <div className="mt-3 space-y-2 border-t border-gray-100 pt-3" data-manual-release-form>
              <p className="text-[11px] text-gray-500">默认填入本笔剩余全部数量，可改为部分解冻。</p>
              <input aria-label="手动解冻数量" type="text" inputMode="decimal" value={releaseAmount} disabled={pending} onChange={event => setReleaseAmount(event.target.value)} className={inputClass} />
              <input aria-label="手动解冻备注" type="text" maxLength={500} value={releaseNote} disabled={pending} onChange={event => setReleaseNote(event.target.value)} placeholder="解冻备注（选填）" className={inputClass} />
              <div className="flex gap-2"><button type="button" disabled={pending} onClick={() => setReleaseTarget(null)} className="flex-1 rounded-xl border border-gray-200 py-2 text-[12px] text-gray-600">取消</button><button type="button" disabled={pending || stateQuery.isError || stateQuery.isFetching || !releaseAmount.trim()} onClick={submitRelease} className="flex-1 rounded-xl bg-green-600 py-2 text-[12px] font-bold text-white disabled:opacity-40">{releaseMutation.isPending ? "解冻处理中…" : "确认解冻"}</button></div>
            </div>}
          </div>)}
        </div>
        {records.length > 0 && <div className="flex items-center justify-between text-[11px] text-gray-500"><button type="button" disabled={pending || currentPage <= 1} onClick={() => { setPage(currentPage - 1); setReleaseTarget(null); }} className="disabled:opacity-30">上一页</button><span>{currentPage} / {totalPages} 页 · 每页20条</span><button type="button" disabled={pending || currentPage >= totalPages} onClick={() => { setPage(currentPage + 1); setReleaseTarget(null); }} className="disabled:opacity-30">下一页</button></div>}
      </div>}
    </section>
  );
}
