import { useState, useMemo } from "react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import { Loader2, AlertCircle, ArrowLeft, CheckCircle2, Clock, XCircle, ArrowUpCircle, ChevronRight } from "lucide-react";
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

  const [tab, setTab] = useState<"withdraw" | "records">("withdraw");
  const [amount, setAmount] = useState("");
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);

  const balanceQuery = trpc.recharge.getBalance.useQuery({
    ...(viewAsUserId ? { viewAsUserId: Number(viewAsUserId) } : {}),
    ...(fromLedgerId ? { ledgerId: Number(fromLedgerId) } : {}),
  });

  const walletsQuery = trpc.paymentAccounts.getDigitalWallets.useQuery();

  const withdrawalsQuery = trpc.recharge.getMySntWithdrawals.useQuery({
    limit: 50,
    ...(fromLedgerId ? { ledgerId: Number(fromLedgerId) } : {}),
  });

  const balance = useMemo(() => parseFloat(String(balanceQuery.data || 0)), [balanceQuery.data]);

  const blockchainWallets = useMemo(() => {
    if (!walletsQuery.data) return [];
    return (walletsQuery.data as any[]).filter((w: any) => w.walletAddress);
  }, [walletsQuery.data]);

  const selectedWallet = useMemo(() => {
    if (!selectedWalletId) {
      return blockchainWallets.length > 0 ? blockchainWallets[0] : null;
    }
    return blockchainWallets.find((w: any) => w.id === selectedWalletId) || null;
  }, [selectedWalletId, blockchainWallets]);

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
    if (isNaN(amountNum) || amountNum <= 0) { toast.error("请输入有效的提现金额"); return; }
    if (amountNum < 10) { toast.error("最低提现金额为 10 USDT"); return; }
    if (amountNum > balance) { toast.error("提现金额不能大于账户余额"); return; }
    if (!selectedWallet) { toast.error("请先在个人中心绑定收款地址"); return; }
    withdrawMutation.mutate({
      sntAmount: amountNum,
      bscAddress: selectedWallet.walletAddress,
      ...(fromLedgerId ? { ledgerId: Number(fromLedgerId) } : {}),
    });
  };

  const formatDate = (dateStr: string | Date) => {
    const date = new Date(dateStr);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${month}-${day} ${hours}:${minutes}`;
  };

  const statusConfig: Record<string, { label: string; color: string; bgColor: string; borderColor: string; icon: any }> = {
    pending:    { label: '待审核', color: 'text-amber-300',  bgColor: 'bg-amber-900/30',  borderColor: 'border-amber-700/40',  icon: Clock },
    processing: { label: '处理中', color: 'text-blue-300',   bgColor: 'bg-blue-900/30',   borderColor: 'border-blue-700/40',   icon: Loader2 },
    completed:  { label: '已完成', color: 'text-green-300',  bgColor: 'bg-green-900/30',  borderColor: 'border-green-700/40',  icon: CheckCircle2 },
    rejected:   { label: '已拒绝', color: 'text-red-400',    bgColor: 'bg-red-900/30',    borderColor: 'border-red-700/40',    icon: XCircle },
  };

  const withdrawals = (withdrawalsQuery.data || []) as any[];

  const handleBack = () => {
    if (fromLedgerId) {
      setLocation(`/recharge?from=ledger&ledgerId=${fromLedgerId}${viewAsParam}`);
    } else {
      window.history.back();
    }
  };

  const quickAmounts = [50, 100, 500, 1000];

  return (
    <div className="min-h-screen pb-20" style={{ background: 'linear-gradient(160deg,#111111 0%,#1a1a1a 100%)' }}>
      {/* 顶部导航 */}
      {!hideHeader && (
        <div className="sticky top-0 z-10 border-b border-[#2a2a2a]" style={{ background: '#111111' }}>
          <div style={{ height: '2px', background: 'linear-gradient(90deg,transparent,#CBA471,#e8c98a,#CBA471,transparent)' }} />
          <div className="flex items-center px-4 py-3">
            <button onClick={handleBack} className="mr-3">
              <ArrowLeft className="w-6 h-6 text-[#CBA471]" />
            </button>
            <h1 className="text-lg font-semibold text-[#CBA471] tracking-widest">提现</h1>
          </div>
        </div>
      )}

      {/* Tab 切换 */}
      <div className="sticky top-[57px] z-10 border-b border-[#2a2a2a]" style={{ background: '#111111' }}>
        <div className="flex px-4">
          {(['withdraw', 'records'] as const).map(t => {
            const labels = { withdraw: '申请提现', records: '提现记录' };
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex-1 py-3 text-center font-medium transition-colors text-sm"
                style={tab === t
                  ? { color: '#CBA471', borderBottom: '2px solid #CBA471' }
                  : { color: '#666', borderBottom: '2px solid transparent' }
                }
              >
                {labels[t]}
              </button>
            );
          })}
        </div>
      </div>

      {/* ========== 申请提现 Tab ========== */}
      {tab === "withdraw" && (
        <div className="p-4 space-y-4">
          {/* 余额卡 */}
          <div className="rounded-2xl p-5 relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#1a1a1a 0%,#222222 50%,#1a1a1a 100%)', border: '1px solid #2a2a2a', boxShadow: '0 8px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(203,164,113,0.15)' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg,transparent,#CBA471,#e8c98a,#CBA471,transparent)' }} />
            <div className="text-gray-400 text-sm mb-1">可提现余额</div>
            <div className="text-3xl font-bold text-[#CBA471]" style={{ textShadow: '0 0 20px rgba(203,164,113,0.4)' }}>
              {balance.toFixed(2)}
              <span className="text-base font-normal text-gray-400 ml-2">USDT</span>
            </div>
          </div>

          {/* 收款地址选择 */}
          <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(135deg,#1e1e1e,#252525)', border: '1px solid #2a2a2a', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
            <div className="text-sm text-gray-400 mb-3">收款地址</div>
            {walletsQuery.isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-[#CBA471]" />
              </div>
            ) : blockchainWallets.length === 0 ? (
              <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(244,67,54,0.08)', border: '1px solid rgba(244,67,54,0.2)' }}>
                <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                <p className="text-sm text-red-300 mb-3">您尚未绑定收款地址</p>
                <button
                  onClick={() => { sessionStorage.setItem('payment_accounts_back', '/withdraw'); setLocation('/payment-accounts'); }}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-black"
                  style={{ background: 'linear-gradient(135deg,#CBA471,#e8c98a)' }}
                >
                  前往绑定
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {blockchainWallets.map((wallet: any) => {
                  const isSelected = selectedWallet?.id === wallet.id;
                  return (
                    <button
                      key={wallet.id}
                      onClick={() => setSelectedWalletId(wallet.id)}
                      className="w-full flex items-center justify-between p-3 rounded-xl transition-all text-left"
                      style={isSelected
                        ? { background: 'rgba(203,164,113,0.15)', border: '1px solid #CBA471' }
                        : { background: 'rgba(255,255,255,0.04)', border: '1px solid #333' }
                      }
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white">{wallet.walletType || wallet.network || '区块链钱包'}</div>
                        <div className="text-xs text-gray-500 font-mono truncate mt-0.5">
                          {wallet.walletAddress?.slice(0, 12)}...{wallet.walletAddress?.slice(-8)}
                        </div>
                      </div>
                      {isSelected && (
                        <CheckCircle2 className="w-5 h-5 text-[#CBA471] ml-3 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
                <button
                  onClick={() => { sessionStorage.setItem('payment_accounts_back', '/withdraw'); setLocation('/payment-accounts'); }}
                  className="w-full flex items-center justify-center py-2 text-sm text-gray-500"
                >
                  <span>管理收款地址</span>
                  <ChevronRight className="w-4 h-4 ml-1" />
                </button>
              </div>
            )}
          </div>

          {/* 输入金额 */}
          <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(135deg,#1e1e1e,#252525)', border: '1px solid #2a2a2a', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
            <div className="text-sm text-gray-400 mb-3">提现金额</div>
            <div className="flex items-center rounded-xl px-4 py-3 mb-3" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid #333' }}>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="请输入提现金额"
                className="flex-1 min-w-0 text-xl font-bold outline-none bg-transparent text-white placeholder-gray-600"
                step="0.01"
                min="10"
              />
              <span className="text-[#CBA471] text-sm font-medium ml-2">USDT</span>
            </div>
            {/* 快捷金额 */}
            <div className="flex gap-2 mb-2">
              {quickAmounts.map(q => (
                <button
                  key={q}
                  onClick={() => setAmount(String(q))}
                  className="flex-1 py-2 rounded-lg text-xs font-medium transition-all"
                  style={amount === String(q)
                    ? { background: 'rgba(203,164,113,0.2)', color: '#CBA471', border: '1px solid #CBA471' }
                    : { background: 'rgba(255,255,255,0.05)', color: '#888', border: '1px solid #333' }
                  }
                >
                  {q}
                </button>
              ))}
              <button
                onClick={() => setAmount(balance.toFixed(2))}
                className="flex-1 py-2 rounded-lg text-xs font-medium transition-all"
                style={amount === balance.toFixed(2)
                  ? { background: 'rgba(203,164,113,0.2)', color: '#CBA471', border: '1px solid #CBA471' }
                  : { background: 'rgba(255,255,255,0.05)', color: '#888', border: '1px solid #333' }
                }
              >
                全部
              </button>
            </div>
            <p className="text-xs text-gray-600">最低提现：10 USDT</p>
          </div>

          {/* 提交按钮 */}
          <button
            onClick={handleSubmit}
            disabled={withdrawMutation.isPending || !amount || !selectedWallet}
            className="w-full py-4 rounded-xl font-semibold text-black tracking-widest disabled:opacity-50 flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#CBA471,#e8c98a,#CBA471)', boxShadow: '0 4px 20px rgba(203,164,113,0.4)' }}
          >
            {withdrawMutation.isPending ? (
              <><Loader2 className="w-5 h-5 mr-2 animate-spin" />提交中...</>
            ) : (
              <><ArrowUpCircle className="w-5 h-5 mr-2" />提交提现申请</>
            )}
          </button>

          {/* 安全提示 */}
          <div className="rounded-2xl p-4" style={{ background: 'rgba(203,164,113,0.06)', border: '1px solid rgba(203,164,113,0.15)' }}>
            <div className="text-sm font-medium text-[#CBA471] mb-2">提现说明</div>
            <ul className="text-xs text-gray-500 space-y-1.5">
              <li>• 最低提现金额为 10 USDT</li>
              <li>• 提现将发送到您选择的区块链钱包地址</li>
              <li>• 提现申请提交后需要管理员审核</li>
              <li>• 审核通过后将在 1-3 个工作日内到账</li>
              <li>• 请确保收款钱包地址准确无误，转错地址无法找回</li>
            </ul>
          </div>
        </div>
      )}

      {/* ========== 提现记录 Tab ========== */}
      {tab === "records" && (
        <div className="p-4">
          <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg,#1e1e1e,#252525)', border: '1px solid #2a2a2a', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
            <div className="px-4 py-3 border-b border-[#2a2a2a]">
              <h2 className="font-semibold text-[#CBA471]">提现记录</h2>
            </div>
            {withdrawalsQuery.isLoading ? (
              <div className="p-8 text-center">
                <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin text-[#CBA471]" />
                <span className="text-gray-500 text-sm">加载中...</span>
              </div>
            ) : withdrawals.length === 0 ? (
              <div className="p-8 text-center">
                <AlertCircle className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">暂无提现记录</p>
              </div>
            ) : (
              <div className="divide-y divide-[#2a2a2a]">
                {withdrawals.map((item: any) => {
                  const config = statusConfig[item.status] || statusConfig.pending;
                  const StatusIcon = config.icon;
                  return (
                    <div key={item.id} className="px-4 py-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-semibold text-red-400">
                          -{parseFloat(item.sntAmount).toFixed(2)} USDT
                        </span>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.bgColor} ${config.color} ${config.borderColor}`}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {config.label}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600 space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="font-mono truncate max-w-[200px]">
                            → {item.bscAddress?.slice(0, 10)}...{item.bscAddress?.slice(-8)}
                          </span>
                          <span>{formatDate(item.createdAt)}</span>
                        </div>
                        {item.txnHash && (
                          <div className="truncate text-gray-700">TxHash: {item.txnHash}</div>
                        )}
                        {item.adminNote && item.status === 'rejected' && (
                          <div className="text-red-400 mt-1">拒绝原因：{item.adminNote}</div>
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
