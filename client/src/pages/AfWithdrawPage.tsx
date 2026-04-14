import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  pending: { text: "待处理", color: "#f59e0b" },
  processing: { text: "处理中", color: "#3b82f6" },
  completed: { text: "已完成", color: "#10b981" },
  rejected: { text: "已拒绝", color: "#ef4444" },
  cancelled: { text: "已取消", color: "#6b7280" },
};

export default function AfWithdrawPage() {
  const { id: ledgerIdStr } = useParams<{ id: string }>();
  const ledgerId = Number(ledgerIdStr) || 52;
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  // 从 URL 参数获取 viewAs
  const searchParams = new URLSearchParams(window.location.search);
  const viewAsUserId = searchParams.get("viewAs") ? Number(searchParams.get("viewAs")) : undefined;
  const targetUserId = viewAsUserId || user?.id;

  const [amount, setAmount] = useState("");
  const [selectedWalletId, setSelectedWalletId] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 获取数字钱包列表
  const { data: wallets = [] } = trpc.paymentAccounts.getDigitalWallets.useQuery(undefined, {
    enabled: !!user,
  });

  // 获取账本余额（通过账本数据）
  const { data: ledgerData } = trpc.ledger.getById.useQuery(
    { ledgerId },
    { enabled: !!ledgerId }
  );

  // 获取当前用户在该账本的余额
  const { data: balance = 0 } = trpc.recharge.getBalance.useQuery(
    { viewAsUserId: viewAsUserId, ledgerId },
    { enabled: !!ledgerId }
  );

  // 获取手续费预览
  const amountNum = parseFloat(amount) || 0;
  const { data: feePreview } = trpc.recharge.getWithdrawFeePreview.useQuery(
    { sntAmount: amountNum, ledgerId },
    { enabled: amountNum >= 10 }
  );

  // 获取提现历史 - 使用直接 fetch 调用来绕过 tRPC batch 问题
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [withdrawalsStatus, setWithdrawalsStatus] = useState('idle');
  const [withdrawalsError, setWithdrawalsError] = useState<any>(null);
  const [withdrawalsLoading, setWithdrawalsLoading] = useState(false);

  const refetchWithdrawals = async () => {
    if (!user) return;
    setWithdrawalsLoading(true);
    setWithdrawalsStatus('loading');
    try {
      const input = encodeURIComponent(JSON.stringify({ json: { ledgerId, limit: 20 } }));
      const url = `/api/trpc/recharge.getMySntWithdrawals?input=${input}`;
      const res = await fetch(url, { credentials: 'include' });
      const text = await res.text();
      console.log('[withdrawals fetch] status=', res.status, 'body=', text);
      // 把完整响应存到 error 里显示
      setWithdrawalsError(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      if (!res.ok) {
        setWithdrawalsStatus('error');
        return;
      }
      try {
        const data = JSON.parse(text);
        if (data?.result?.data?.json) {
          setWithdrawals(data.result.data.json);
          setWithdrawalsStatus('success');
        } else {
          setWithdrawals([]);
          setWithdrawalsStatus('error');
        }
      } catch (parseErr: any) {
        setWithdrawalsError(`Parse error: ${parseErr.message} | body: ${text.slice(0, 200)}`);
        setWithdrawalsStatus('error');
      }
    } catch (err: any) {
      setWithdrawalsError(`Fetch error: ${err.message}`);
      setWithdrawalsStatus('error');
    } finally {
      setWithdrawalsLoading(false);
    }
  };

  useEffect(() => {
    if (user) refetchWithdrawals();
  }, [user, ledgerId]);

  // 提交提现申请
  const withdrawMutation = trpc.recharge.requestSntWithdraw.useMutation({
    onSuccess: () => {
      setSuccessMsg("提现申请已提交，等待管理员处理");
      setAmount("");
      setSubmitting(false);
      refetchWithdrawals();
    },
    onError: (err) => {
      setErrorMsg(err.message || "提现申请失败，请重试");
      setSubmitting(false);
    },
  });

  // 自动选择默认钱包
  useEffect(() => {
    if (wallets.length > 0 && !selectedWalletId) {
      const defaultWallet = wallets.find((w: any) => w.isDefault) || wallets[0];
      if (defaultWallet) setSelectedWalletId(defaultWallet.id);
    }
  }, [wallets, selectedWalletId]);

  const selectedWallet = wallets.find((w: any) => w.id === selectedWalletId);
  const feeAmount = feePreview?.feeAmount ?? 0;
  const actualAmount = Math.max(0, amountNum - feeAmount);

  const handleSubmit = () => {
    setErrorMsg("");
    setSuccessMsg("");
    if (!amount || amountNum < 10) {
      setErrorMsg("最低提现金额为 10 USDT");
      return;
    }
    if (amountNum > balance) {
      setErrorMsg(`余额不足，当前可提现余额 ${balance.toFixed(2)} USDT`);
      return;
    }
    if (!selectedWallet?.walletAddress) {
      setErrorMsg("请先在个人中心添加提现钱包地址");
      return;
    }
    setSubmitting(true);
    withdrawMutation.mutate({
      sntAmount: amountNum,
      bscAddress: selectedWallet.walletAddress,
      ledgerId,
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-10 max-w-md mx-auto overflow-x-hidden" style={{ maxWidth: '100vw' }}>
      {/* 顶部导航 */}
      <div
        className="sticky top-0 z-10 flex items-center px-4 py-3"
        style={{ background: "linear-gradient(135deg, #A80000 0%, #7a0000 100%)" }}
      >
        <button
          onClick={() => setLocation(`/ledger/${ledgerId}`)}
          className="flex items-center text-white/90 hover:text-white text-sm font-medium mr-3"
        >
          <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          返回账本
        </button>
        <span className="text-white font-semibold text-base flex-1 text-center pr-16">申请提现</span>
      </div>

      {/* 余额卡片 */}
      <div className="mx-4 mt-4 rounded-2xl p-5 text-white overflow-hidden" style={{ background: "linear-gradient(135deg, #A80000 0%, #7a0000 100%)" }}>
        <div className="text-sm text-white/70 mb-1">可提现余额</div>
        <div className="text-3xl font-bold">
          {balance.toFixed(2)} <span className="text-lg font-normal">USDT</span>
        </div>
        {ledgerData && (
          <div className="text-xs text-white/60 mt-1">{ledgerData.name}</div>
        )}
      </div>

      {/* 提现表单 */}
      <div className="mx-4 mt-4 bg-white rounded-2xl p-5 shadow-sm overflow-hidden">
        <div className="text-sm font-semibold text-gray-700 mb-3">提现金额</div>
        <div className="flex items-center border border-gray-200 rounded-xl px-4 py-3 focus-within:border-red-400 overflow-hidden w-full box-border">
          <input
            type="number"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setErrorMsg("");
              setSuccessMsg("");
            }}
            placeholder="最低 10 USDT"
            className="flex-1 min-w-0 text-lg font-semibold outline-none bg-transparent"
            min={10}
            max={balance}
          />
          <span className="text-gray-400 text-sm ml-2 flex-shrink-0">USDT</span>
          <button
            onClick={() => setAmount(balance.toFixed(2))}
            className="ml-2 text-xs text-red-600 font-medium border border-red-200 rounded-lg px-2 py-1 flex-shrink-0 whitespace-nowrap"
          >
            全部
          </button>
        </div>

        {/* 手续费预览 */}
        {amountNum >= 10 && (
          <div className="mt-3 bg-amber-50 rounded-xl p-3 text-xs text-amber-700 space-y-1">
            <div className="flex justify-between">
              <span>提现金额</span>
              <span className="font-medium">{amountNum.toFixed(2)} USDT</span>
            </div>
            <div className="flex justify-between">
              <span>手续费 {feePreview?.ruleDesc ? `(${feePreview.ruleDesc})` : ""}</span>
              <span className="font-medium text-amber-600">-{feeAmount.toFixed(2)} USDT</span>
            </div>
            <div className="flex justify-between border-t border-amber-200 pt-1 mt-1">
              <span className="font-semibold">实际到账</span>
              <span className="font-bold text-green-700">{actualAmount.toFixed(2)} USDT</span>
            </div>
          </div>
        )}

        {/* 提现地址 */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-700">提现地址</span>
            <button
              onClick={() => setLocation("/profile/wallets")}
              className="text-xs text-red-600"
            >
              管理钱包
            </button>
          </div>

          {wallets.length === 0 ? (
            <div
              onClick={() => setLocation("/profile/wallets")}
              className="border border-dashed border-gray-300 rounded-xl p-4 text-center text-sm text-gray-400 cursor-pointer hover:border-red-300"
            >
              暂无提现地址，点击前往个人中心添加
            </div>
          ) : (
            <div className="space-y-2">
              {wallets.map((w: any) => (
                <div
                  key={w.id}
                  onClick={() => setSelectedWalletId(w.id)}
                  className={`border rounded-xl p-3 cursor-pointer transition-colors ${
                    selectedWalletId === w.id
                      ? "border-red-400 bg-red-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          selectedWalletId === w.id ? "border-red-500" : "border-gray-300"
                        }`}
                      >
                        {selectedWalletId === w.id && (
                          <div className="w-2 h-2 rounded-full bg-red-500" />
                        )}
                      </div>
                      <span className="text-xs font-medium text-gray-700">
                        {w.network || w.walletType || "区块链钱包"}
                      </span>
                      {w.isDefault && (
                        <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded">默认</span>
                      )}
                    </div>
                    {w.currency && (
                      <span className="text-xs text-gray-400">{w.currency}</span>
                    )}
                  </div>
                  <div className="mt-1.5 text-xs text-gray-500 font-mono break-all pl-6 overflow-hidden">
                    {w.walletAddress || w.account || "—"}
                  </div>
                  {w.notes && (
                    <div className="mt-1 text-xs text-gray-400 pl-6 break-all overflow-hidden">{w.notes}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 错误/成功提示 */}
        {errorMsg && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="mt-3 bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-600">
            {successMsg}
          </div>
        )}

        {/* 提交按钮 */}
        <button
          onClick={handleSubmit}
          disabled={submitting || !amount || amountNum < 10}
          className="mt-5 w-full py-3.5 rounded-2xl text-white font-semibold text-base disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #A80000 0%, #7a0000 100%)" }}
        >
          {submitting ? "提交中..." : "确认提现"}
        </button>

        <p className="mt-3 text-xs text-gray-400 text-center">
          提现申请提交后，管理员将手动处理并转账，请耐心等待
        </p>
      </div>

      {/* 提现记录 */}
      <div className="mx-4 mt-4 bg-white rounded-2xl shadow-sm overflow-hidden" style={{ wordBreak: 'break-all' }}>
        <div className="px-5 py-3 border-b border-gray-100">
          <span className="text-sm font-semibold text-gray-700">提现记录</span>
        </div>
        {/* 调试信息 - 上线后删除 */}
        <div className="px-5 py-2 text-xs text-blue-500 bg-blue-50">
          [DEBUG] status={withdrawalsStatus} | user={user?.id} | ledgerId={ledgerId} | count={withdrawals.length} | loading={String(withdrawalsLoading)} | error={withdrawalsError?.message || 'none'}
        </div>
        {withdrawals.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">暂无提现记录</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {withdrawals.map((w: any) => {
              const status = STATUS_LABEL[w.status] || { text: w.status, color: "#6b7280" };
              return (
                <div key={w.id} className="px-5 py-3.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-base font-bold text-gray-800">
                        -{parseFloat(w.sntAmount).toFixed(2)} USDT
                      </span>
                      {w.adminNote && (
                        <div className="text-xs text-gray-400 mt-0.5">{w.adminNote}</div>
                      )}
                    </div>
                    <span
                      className="text-xs font-medium px-2 py-1 rounded-full"
                      style={{ color: status.color, backgroundColor: `${status.color}18` }}
                    >
                      {status.text}
                    </span>
                  </div>
                  <div className="mt-1.5 text-xs text-gray-400 font-mono">
                    {w.bscAddress?.slice(0, 12)}...{w.bscAddress?.slice(-8)}
                  </div>
                  <div className="text-xs text-gray-300 mt-0.5">
                    {w.createdAt ? new Date(w.createdAt).toLocaleString("zh-CN") : ""}
                  </div>
                  {w.txnHash && (
                    <div className="text-xs text-blue-400 mt-0.5 font-mono">
                      TxHash: {w.txnHash.slice(0, 16)}...
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
