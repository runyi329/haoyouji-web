import { useState, useMemo } from "react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import { Loader2, AlertCircle, Wallet, ArrowLeft, CheckCircle2, Clock, XCircle, ArrowUpCircle } from "lucide-react";
import { useLocation, useSearch } from "wouter";

interface WithdrawProps {
  hideHeader?: boolean;
}

export default function Withdraw({ hideHeader }: WithdrawProps) {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const fromLedgerId = searchParams.get('ledgerId');
  const viewAsUserId = searchParams.get('viewAs');
  const viewAsParam = viewAsUserId ? `&viewAs=${viewAsUserId}` : '';

  // 当前 tab
  const [tab, setTab] = useState<"withdraw" | "records">("withdraw");

  // 提现表单
  const [amount, setAmount] = useState("");
  const [bscAddress, setBscAddress] = useState("");
  const [showBindWallet, setShowBindWallet] = useState(false);

  // 查询
  const balanceQuery = trpc.recharge.getBalance.useQuery();
  const bscWalletQuery = trpc.recharge.getBscWallet.useQuery();
  const withdrawalsQuery = trpc.recharge.getMySntWithdrawals.useQuery({ limit: 50 });

  // 如果有 ledgerId，使用 AF 账本总资产
  const afLedgerId = fromLedgerId ? parseInt(fromLedgerId) : 0;
  const { data: afAssetData } = trpc.ledger.afGetMyTotalAsset.useQuery(
    { ledgerId: afLedgerId, ...(viewAsUserId ? { viewAsUserId: Number(viewAsUserId) } : {}) },
    { enabled: !!afLedgerId, staleTime: 30000 }
  );
  const displayBalance = afLedgerId && afAssetData != null
    ? (afAssetData as any).total
    : balanceQuery.data;

  const balance = useMemo(() => parseFloat(String(displayBalance || 0)), [displayBalance]);

  // 绑定钱包
  const upsertWalletMutation = trpc.recharge.upsertBscWallet.useMutation({
    onSuccess: () => {
      toast.success("钱包地址已保存");
      bscWalletQuery.refetch();
      setShowBindWallet(false);
    },
    onError: (error) => {
      toast.error(error.message || "保存失败");
    },
  });

  // 提现申请
  const withdrawMutation = trpc.recharge.requestSntWithdraw.useMutation({
    onSuccess: () => {
      toast.success("提现申请已提交，等待管理员审核");
      setAmount("");
      balanceQuery.refetch();
      withdrawalsQuery.refetch();
      setTab("records");
    },
    onError: (error) => {
      toast.error(error.message || "提现申请失败");
    },
  });

  const handleSubmit = () => {
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error("请输入有效的提现金额");
      return;
    }
    if (amountNum < 10) {
      toast.error("最低提现金额为 10 USDT");
      return;
    }
    if (amountNum > balance) {
      toast.error("提现金额不能大于账户余额");
      return;
    }

    const walletAddr = bscWalletQuery.data?.bscAddress;
    if (!walletAddr) {
      toast.error("请先绑定 BSC 钱包地址");
      setShowBindWallet(true);
      return;
    }

    withdrawMutation.mutate({
      sntAmount: amountNum,
      bscAddress: walletAddr,
    });
  };

  const handleBindWallet = () => {
    if (!bscAddress.trim()) {
      toast.error("请输入钱包地址");
      return;
    }
    upsertWalletMutation.mutate({ bscAddress: bscAddress.trim() });
  };

  // 格式化时间
  const formatDate = (dateStr: string | Date) => {
    const date = new Date(dateStr);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${month}-${day} ${hours}:${minutes}`;
  };

  // 状态配置
  const statusConfig: Record<string, { label: string; color: string; bgColor: string; icon: any }> = {
    pending: { label: '待审核', color: 'text-orange-700', bgColor: 'bg-orange-100', icon: Clock },
    processing: { label: '处理中', color: 'text-blue-700', bgColor: 'bg-blue-100', icon: Loader2 },
    completed: { label: '已完成', color: 'text-green-700', bgColor: 'bg-green-100', icon: CheckCircle2 },
    rejected: { label: '已拒绝', color: 'text-red-600', bgColor: 'bg-red-100', icon: XCircle },
  };

  const withdrawals = withdrawalsQuery.data || [];

  const handleBack = () => {
    if (fromLedgerId) {
      setLocation(`/recharge?from=ledger&ledgerId=${fromLedgerId}${viewAsParam}`);
    } else {
      window.history.back();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 顶部导航 */}
      {!hideHeader && (
        <div className="bg-white border-b sticky top-0 z-10">
          <div className="flex items-center px-4 py-3">
            <button onClick={handleBack} className="mr-3">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-lg font-semibold">提现</h1>
          </div>
        </div>
      )}

      {/* Tab 切换 */}
      <div className="bg-white border-b">
        <div className="flex">
          <button
            onClick={() => setTab("withdraw")}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              tab === "withdraw"
                ? "text-[#D32F2F] border-b-2 border-[#D32F2F]"
                : "text-gray-500"
            }`}
          >
            申请提现
          </button>
          <button
            onClick={() => setTab("records")}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              tab === "records"
                ? "text-[#D32F2F] border-b-2 border-[#D32F2F]"
                : "text-gray-500"
            }`}
          >
            提现记录
          </button>
        </div>
      </div>

      {/* ========== 申请提现 Tab ========== */}
      {tab === "withdraw" && (
        <div className="p-4 space-y-4">
          {/* 余额卡片 */}
          <div className="bg-gradient-to-r from-[#D32F2F] to-[#E57373] rounded-lg p-5 text-white">
            <div className="flex items-center mb-1">
              <Wallet className="w-4 h-4 mr-2" />
              <span className="text-sm opacity-90">可提现余额</span>
            </div>
            <div className="text-2xl font-bold">
              {balance.toFixed(2)} <span className="text-base opacity-80">USDT</span>
            </div>
          </div>

          {/* 收款钱包 */}
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-700">收款钱包 (BSC/BEP20)</label>
              <button
                onClick={() => {
                  setBscAddress(bscWalletQuery.data?.bscAddress || "");
                  setShowBindWallet(true);
                }}
                className="text-xs text-[#D32F2F] font-medium"
              >
                {bscWalletQuery.data ? "修改" : "绑定"}
              </button>
            </div>

            {bscWalletQuery.data ? (
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="font-mono text-sm text-gray-800 break-all">
                  {bscWalletQuery.data.bscAddress}
                </div>
                <div className="text-xs text-gray-500 mt-1">BNB Smart Chain (BEP20)</div>
              </div>
            ) : (
              <div className="text-center py-6 text-gray-400">
                <AlertCircle className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">尚未绑定收款钱包</p>
                <button
                  onClick={() => setShowBindWallet(true)}
                  className="mt-2 px-4 py-1.5 bg-[#D32F2F] text-white text-xs rounded-lg"
                >
                  立即绑定
                </button>
              </div>
            )}
          </div>

          {/* 绑定钱包弹窗 */}
          {showBindWallet && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={() => setShowBindWallet(false)}>
              <div className="bg-white w-full sm:w-[420px] rounded-t-2xl sm:rounded-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-semibold text-gray-900">绑定 BSC 钱包</h3>
                <div>
                  <label className="block text-sm text-gray-600 mb-1.5">BEP20 钱包地址</label>
                  <input
                    type="text"
                    value={bscAddress}
                    onChange={(e) => setBscAddress(e.target.value)}
                    placeholder="0x..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#D32F2F] focus:border-transparent font-mono text-sm"
                  />
                  <p className="text-xs text-gray-400 mt-1.5">请输入 BNB Smart Chain (BEP20) 网络的钱包地址</p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowBindWallet(false)}
                    className="flex-1 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleBindWallet}
                    disabled={upsertWalletMutation.isPending}
                    className="flex-1 py-3 bg-[#D32F2F] text-white rounded-lg font-medium disabled:opacity-50"
                  >
                    {upsertWalletMutation.isPending ? "保存中..." : "确认保存"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 提现金额 */}
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              提现金额
            </label>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="请输入提现金额"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#D32F2F] focus:border-transparent text-lg"
                step="0.01"
                min="10"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">
                USDT
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-gray-500">最低提现：10 USDT</span>
              <button
                onClick={() => setAmount(balance.toString())}
                className="text-[#D32F2F] font-medium"
              >
                全部提现
              </button>
            </div>
          </div>

          {/* 提交按钮 */}
          <button
            onClick={handleSubmit}
            disabled={withdrawMutation.isPending || !amount || !bscWalletQuery.data}
            className="w-full bg-[#D32F2F] text-white py-4 rounded-lg font-medium text-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#B71C1C] transition-colors flex items-center justify-center"
          >
            {withdrawMutation.isPending ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                提交中...
              </>
            ) : (
              <>
                <ArrowUpCircle className="w-5 h-5 mr-2" />
                提交提现申请
              </>
            )}
          </button>

          {/* 提示信息 */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start">
              <AlertCircle className="w-5 h-5 text-yellow-600 mr-2 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-800">
                <p className="font-medium mb-1">提现说明：</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>最低提现金额为 10 USDT</li>
                  <li>提现将通过 BSC (BEP20) 网络发送到您绑定的钱包地址</li>
                  <li>提现申请提交后需要管理员审核</li>
                  <li>审核通过后将在 1-3 个工作日内到账</li>
                  <li>请确保收款钱包地址准确无误，转错地址无法找回</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========== 提现记录 Tab ========== */}
      {tab === "records" && (
        <div className="p-4">
          <div className="bg-white rounded-lg overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b">
              <h2 className="font-semibold text-gray-900">提现记录</h2>
            </div>

            {withdrawalsQuery.isLoading ? (
              <div className="p-8 text-center text-gray-500">
                <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
                加载中...
              </div>
            ) : withdrawals.length === 0 ? (
              <div className="p-8 text-center">
                <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">暂无提现记录</p>
              </div>
            ) : (
              <div className="divide-y">
                {withdrawals.map((item: any) => {
                  const config = statusConfig[item.status] || statusConfig.pending;
                  const StatusIcon = config.icon;
                  return (
                    <div key={item.id} className="px-4 py-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center">
                          <span className="font-medium text-gray-900">
                            -{parseFloat(item.sntAmount).toFixed(2)} USDT
                          </span>
                        </div>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.bgColor} ${config.color}`}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {config.label}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="font-mono truncate max-w-[200px]">
                            → {item.bscAddress?.slice(0, 10)}...{item.bscAddress?.slice(-8)}
                          </span>
                          <span>{formatDate(item.createdAt)}</span>
                        </div>
                        {item.txnHash && (
                          <div className="truncate">
                            TxHash: {item.txnHash}
                          </div>
                        )}
                        {item.adminNote && item.status === 'rejected' && (
                          <div className="text-red-500 mt-1">
                            拒绝原因：{item.adminNote}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
