import { useLocation } from "wouter";
import { ArrowLeft, AlertTriangle, ExternalLink, RefreshCw, ShieldCheck } from "lucide-react";
import { trpc } from "../../lib/trpc";

function explorerUrl(network: string, transactionId: string) {
  const id = encodeURIComponent(transactionId);
  switch (network) {
    case "TRC20": return `https://tronscan.org/#/transaction/${id}`;
    case "ERC20": return `https://etherscan.io/tx/${id}`;
    case "BEP20": return `https://bscscan.com/tx/${id}`;
    case "APTOS": return `https://explorer.aptoslabs.com/txn/${id}?network=mainnet`;
    case "SOLANA": return `https://solscan.io/tx/${id}`;
    default: return null;
  }
}

function short(value: unknown, head = 10, tail = 8) {
  const text = String(value ?? "");
  return text.length > head + tail ? `${text.slice(0, head)}…${text.slice(-tail)}` : text || "--";
}

function formatDate(value: unknown) {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "--";
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function RechargeUnmatched() {
  const [, setLocation] = useLocation();
  const unmatchedQuery = trpc.recharge.adminGetUnmatchedTransactions.useQuery(undefined, { refetchInterval: 15_000 });
  const transactions = (unmatchedQuery.data ?? []) as any[];

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="sticky top-0 z-10 border-b bg-white">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center">
            <button onClick={() => window.history.back()} className="mr-3" aria-label="返回"><ArrowLeft className="h-6 w-6" /></button>
            <div><h1 className="text-lg font-semibold">待核对链上到账</h1><p className="text-[11px] text-gray-400">每笔均为扫描器已保存的链上证据</p></div>
          </div>
          <button onClick={() => unmatchedQuery.refetch()} className="rounded-lg p-2 hover:bg-gray-100" aria-label="刷新"><RefreshCw className={`h-5 w-5 ${unmatchedQuery.isFetching ? "animate-spin" : ""}`} /></button>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          <div className="mb-1 flex items-center gap-1.5 font-semibold"><ShieldCheck className="h-4 w-4" />处理原则</div>
          <p className="leading-5">只能将本页展示的链上到账证据关联到网络和收款地址一致的订单。交易哈希和实际金额由链上证据锁定，不能手工填写。</p>
        </div>

        <section className="overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="border-b bg-gray-50 px-4 py-3"><h2 className="font-semibold text-gray-900">待核对记录（{transactions.length}）</h2></div>
          {transactions.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500"><AlertTriangle className="mx-auto mb-2 h-10 w-10 text-gray-300" />暂无待核对链上到账记录</div>
          ) : (
            <div className="divide-y">
              {transactions.map((tx) => {
                const transactionId = String(tx.transaction_id ?? tx.txn_hash ?? "");
                const url = explorerUrl(String(tx.network), transactionId);
                return (
                  <div key={tx.id} className="px-4 py-3">
                    <div className="mb-2 flex items-center justify-between gap-2"><span className="text-lg font-semibold tabular-nums text-gray-900">{Number(tx.amount).toFixed(4)} USDT</span><span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">{tx.network}</span></div>
                    <div className="space-y-1 text-xs text-gray-600">
                      <div className="flex justify-between gap-3"><span className="text-gray-400">链上事件</span><span>#{tx.id} · {formatDate(tx.block_timestamp ?? tx.first_seen_at)}</span></div>
                      <div className="flex justify-between gap-3"><span className="shrink-0 text-gray-400">收款地址</span><span className="truncate font-mono">{short(tx.wallet_address, 10, 8)}</span></div>
                      {tx.from_address && <div className="flex justify-between gap-3"><span className="shrink-0 text-gray-400">发送地址</span><span className="truncate font-mono">{short(tx.from_address, 10, 8)}</span></div>}
                      <div className="flex justify-between gap-3"><span className="shrink-0 text-gray-400">TxID</span>{url ? <a href={url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 truncate font-mono text-blue-600 hover:underline"><span className="truncate">{short(transactionId)}</span><ExternalLink className="h-3 w-3 shrink-0" /></a> : <span className="truncate font-mono">{short(transactionId)}</span>}</div>
                    </div>
                    <button onClick={() => setLocation(`/admin/recharge/manual-confirm?eventId=${tx.id}`)} className="mt-3 w-full rounded-lg border border-[#D32F2F] py-2 text-sm font-medium text-[#D32F2F] hover:bg-red-50">核对并匹配订单</button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
