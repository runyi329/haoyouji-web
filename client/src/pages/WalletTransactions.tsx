import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ArrowDownCircle, ArrowUpCircle, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { trpc } from "../lib/trpc";

type TransactionType = "recharge" | "withdraw" | "all";

export default function WalletTransactions() {
  const [, setLocation] = useLocation();
  const [activeType, setActiveType] = useState<TransactionType>("all");

  const rechargeQuery = trpc.recharge.getMyOrders.useQuery({ limit: 100 });
  const balanceHistoryQuery = trpc.recharge.getBalanceHistory.useQuery({ limit: 100 });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return `今天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    if (days === 1) return `昨天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    if (days < 7) return `${days}天前`;
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const getBlockchainExplorerUrl = (network: string, txnHash: string) => {
    const baseUrls: Record<string, string> = {
      TRC20: 'https://tronscan.org/#/transaction/',
      ERC20: 'https://etherscan.io/tx/',
      BEP20: 'https://bscscan.com/tx/',
      APTOS: 'https://explorer.aptoslabs.com/txn/',
      SOLANA: 'https://solscan.io/tx/',
    };
    return baseUrls[network] ? baseUrls[network] + txnHash : null;
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'completed': return { icon: CheckCircle2, label: '已完成', color: 'text-green-300',  bgColor: 'bg-green-900/30',  borderColor: 'border-green-700/40' };
      case 'pending':   return { icon: Clock,        label: '待确认', color: 'text-amber-300',  bgColor: 'bg-amber-900/30',  borderColor: 'border-amber-700/40' };
      case 'expired':   return { icon: XCircle,      label: '已过期', color: 'text-gray-400',   bgColor: 'bg-gray-800/40',   borderColor: 'border-gray-600/40' };
      default:          return { icon: Clock,        label: '处理中', color: 'text-blue-300',   bgColor: 'bg-blue-900/30',   borderColor: 'border-blue-700/40' };
    }
  };

  const getAllTransactions = () => {
    const transactions: any[] = [];
    if (rechargeQuery.data) {
      (rechargeQuery.data as any[]).forEach((order: any) => {
        transactions.push({
          id: `recharge-${order.id}`, type: 'recharge',
          amount: order.amount, status: order.status,
          network: order.network, orderNo: order.orderNo,
          txnHash: order.txnHash, createdAt: order.createdAt,
        });
      });
    }
    if (balanceHistoryQuery.data) {
      (balanceHistoryQuery.data as any[]).forEach((history: any) => {
        if (history.type === 'withdraw') {
          transactions.push({
            id: `balance-${history.id}`, type: 'withdraw',
            amount: Math.abs(history.amount), status: 'completed',
            description: history.description, createdAt: history.createdAt,
          });
        }
      });
    }
    return transactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  };

  const filteredTransactions = (() => {
    const all = getAllTransactions();
    if (activeType === "all") return all;
    return all.filter(t => t.type === activeType);
  })();
  const isLoading = rechargeQuery.isLoading || balanceHistoryQuery.isLoading;

  return (
    <div className="min-h-screen pb-20" style={{ background: 'linear-gradient(160deg,#111111 0%,#1a1a1a 100%)' }}>
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 border-b border-[#2a2a2a]" style={{ background: '#111111' }}>
        <div style={{ height: '2px', background: 'linear-gradient(90deg,transparent,#CBA471,#e8c98a,#CBA471,transparent)' }} />
        <div className="flex items-center px-4 py-3">
          <button onClick={() => setLocation("/wallet")} className="mr-3">
            <ArrowLeft className="w-6 h-6 text-[#CBA471]" />
          </button>
          <h1 className="text-lg font-semibold text-[#CBA471] tracking-widest">交易明细</h1>
        </div>
      </div>

      {/* 类型筛选 */}
      <div className="sticky top-[57px] z-10 border-b border-[#2a2a2a]" style={{ background: '#111111' }}>
        <div className="flex px-4">
          {(['all', 'recharge', 'withdraw'] as TransactionType[]).map(type => {
            const labels: Record<TransactionType, string> = { all: '全部', recharge: '充值', withdraw: '提现' };
            return (
              <button
                key={type}
                onClick={() => setActiveType(type)}
                className="flex-1 py-3 text-center font-medium transition-colors text-sm"
                style={activeType === type
                  ? { color: '#CBA471', borderBottom: '2px solid #CBA471' }
                  : { color: '#666', borderBottom: '2px solid transparent' }
                }
              >
                {labels[type]}
              </button>
            );
          })}
        </div>
      </div>

      {/* 交易列表 */}
      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[#CBA471]" />
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="text-center py-20 text-gray-500">暂无交易记录</div>
        ) : (
          <div className="space-y-3">
            {filteredTransactions.map((transaction) => {
              const statusConfig = getStatusConfig(transaction.status);
              const StatusIcon = statusConfig.icon;
              const isRecharge = transaction.type === 'recharge';
              return (
                <div
                  key={transaction.id}
                  className="rounded-2xl p-4"
                  style={{ background: 'linear-gradient(135deg,#1e1e1e,#252525)', border: '1px solid #2a2a2a', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center">
                      {isRecharge
                        ? <ArrowDownCircle className="w-5 h-5 text-green-400 mr-2" />
                        : <ArrowUpCircle className="w-5 h-5 text-red-400 mr-2" />
                      }
                      <div>
                        <div className="font-medium text-white text-sm">
                          {isRecharge ? '充值' : '提现'}
                          {transaction.network && (
                            <span className="text-xs text-gray-500 ml-2">{transaction.network}</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">{formatDate(transaction.createdAt)}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-bold ${isRecharge ? 'text-green-400' : 'text-red-400'}`}>
                        {isRecharge ? '+' : '-'}{transaction.amount} USDT
                      </div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border mt-1 ${statusConfig.bgColor} ${statusConfig.color} ${statusConfig.borderColor}`}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {statusConfig.label}
                      </span>
                    </div>
                  </div>

                  {transaction.orderNo && (
                    <div className="text-xs text-gray-600 mt-2 pt-2 border-t border-[#2a2a2a]">
                      订单号: {transaction.orderNo}
                    </div>
                  )}

                  {transaction.txnHash && transaction.network && (
                    <div className="text-xs mt-1">
                      <span className="text-gray-600">交易哈希: </span>
                      {getBlockchainExplorerUrl(transaction.network, transaction.txnHash) ? (
                        <a
                          href={getBlockchainExplorerUrl(transaction.network, transaction.txnHash)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#CBA471] hover:underline"
                        >
                          {transaction.txnHash.slice(0, 10)}...{transaction.txnHash.slice(-8)}
                        </a>
                      ) : (
                        <span className="text-gray-500">
                          {transaction.txnHash.slice(0, 10)}...{transaction.txnHash.slice(-8)}
                        </span>
                      )}
                    </div>
                  )}

                  {transaction.description && (
                    <div className="text-xs text-gray-500 mt-1">{transaction.description}</div>
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
