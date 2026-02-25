import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ArrowDownCircle, ArrowUpCircle, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { trpc } from "../lib/trpc";

type TransactionType = "recharge" | "withdraw" | "all";

export default function WalletTransactions() {
  const [, setLocation] = useLocation();
  const [activeType, setActiveType] = useState<TransactionType>("all");
  
  // 获取充值记录
  const rechargeQuery = trpc.recharge.getMyOrders.useQuery({ limit: 100 });
  
  // 获取余额变动记录（包括提现）
  const balanceHistoryQuery = trpc.recharge.getBalanceHistory.useQuery({ limit: 100 });

  // 格式化日期
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      return `今天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (days === 1) {
      return `昨天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (days < 7) {
      return `${days}天前`;
    } else {
      return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    }
  };

  // 获取区块链浏览器链接
  const getBlockchainExplorerUrl = (network: string, txnHash: string) => {
    const baseUrls: Record<string, string> = {
      'TRC20': 'https://tronscan.org/#/transaction/',
      'ERC20': 'https://etherscan.io/tx/',
      'BEP20': 'https://bscscan.com/tx/',
      'APTOS': 'https://explorer.aptoslabs.com/txn/',
      'SOLANA': 'https://solscan.io/tx/',
    };
    return baseUrls[network] ? baseUrls[network] + txnHash : null;
  };

  // 获取状态配置
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'completed':
        return { icon: CheckCircle2, label: '已完成', color: 'text-green-600', bgColor: 'bg-green-50' };
      case 'pending':
        return { icon: Clock, label: '待确认', color: 'text-yellow-600', bgColor: 'bg-yellow-50' };
      case 'expired':
        return { icon: XCircle, label: '已过期', color: 'text-gray-600', bgColor: 'bg-gray-50' };
      default:
        return { icon: Clock, label: '处理中', color: 'text-blue-600', bgColor: 'bg-blue-50' };
    }
  };

  // 合并并排序所有交易记录
  const getAllTransactions = () => {
    const transactions: any[] = [];
    
    // 添加充值记录
    if (rechargeQuery.data) {
      rechargeQuery.data.forEach((order: any) => {
        transactions.push({
          id: `recharge-${order.id}`,
          type: 'recharge',
          amount: order.amount,
          status: order.status,
          network: order.network,
          orderNo: order.orderNo,
          txnHash: order.txnHash,
          createdAt: order.createdAt,
          completedAt: order.completedAt,
        });
      });
    }
    
    // 添加余额变动记录（提现等）
    if (balanceHistoryQuery.data) {
      balanceHistoryQuery.data.forEach((history: any) => {
        if (history.type === 'withdraw') {
          transactions.push({
            id: `balance-${history.id}`,
            type: 'withdraw',
            amount: Math.abs(history.amount),
            status: 'completed',
            description: history.description,
            createdAt: history.createdAt,
          });
        }
      });
    }
    
    // 按时间倒序排序
    return transactions.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  };

  // 过滤交易记录
  const getFilteredTransactions = () => {
    const allTransactions = getAllTransactions();
    if (activeType === "all") return allTransactions;
    return allTransactions.filter(t => t.type === activeType);
  };

  const filteredTransactions = getFilteredTransactions();
  const isLoading = rechargeQuery.isLoading || balanceHistoryQuery.isLoading;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="flex items-center px-4 py-3">
          <button onClick={() => setLocation("/wallet")} className="mr-3">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-semibold">交易明细</h1>
        </div>
      </div>

      {/* 类型筛选 */}
      <div className="bg-white border-b sticky top-[57px] z-10">
        <div className="flex px-4">
          <button
            onClick={() => setActiveType("all")}
            className={`flex-1 py-3 text-center font-medium transition-colors ${
              activeType === "all"
                ? "text-[#D32F2F] border-b-2 border-[#D32F2F]"
                : "text-gray-500"
            }`}
          >
            全部
          </button>
          <button
            onClick={() => setActiveType("recharge")}
            className={`flex-1 py-3 text-center font-medium transition-colors ${
              activeType === "recharge"
                ? "text-[#D32F2F] border-b-2 border-[#D32F2F]"
                : "text-gray-500"
            }`}
          >
            充值
          </button>
          <button
            onClick={() => setActiveType("withdraw")}
            className={`flex-1 py-3 text-center font-medium transition-colors ${
              activeType === "withdraw"
                ? "text-[#D32F2F] border-b-2 border-[#D32F2F]"
                : "text-gray-500"
            }`}
          >
            提现
          </button>
        </div>
      </div>

      {/* 交易列表 */}
      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[#D32F2F]" />
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            暂无交易记录
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTransactions.map((transaction) => {
              const statusConfig = getStatusConfig(transaction.status);
              const StatusIcon = statusConfig.icon;
              const isRecharge = transaction.type === 'recharge';
              
              return (
                <div key={transaction.id} className="bg-white rounded-lg p-4 shadow-sm">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center">
                      {isRecharge ? (
                        <ArrowDownCircle className="w-5 h-5 text-green-600 mr-2" />
                      ) : (
                        <ArrowUpCircle className="w-5 h-5 text-red-600 mr-2" />
                      )}
                      <div>
                        <div className="font-medium text-gray-900">
                          {isRecharge ? '充值' : '提现'}
                          {transaction.network && (
                            <span className="text-xs text-gray-400 ml-2">{transaction.network}</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {formatDate(transaction.createdAt)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-bold ${isRecharge ? 'text-green-600' : 'text-red-600'}`}>
                        {isRecharge ? '+' : '-'}{transaction.amount} USDT
                      </div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.bgColor} ${statusConfig.color} mt-1`}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {statusConfig.label}
                      </span>
                    </div>
                  </div>
                  
                  {transaction.orderNo && (
                    <div className="text-xs text-gray-400 mt-2">
                      订单号: {transaction.orderNo}
                    </div>
                  )}
                  
                  {transaction.txnHash && transaction.network && (
                    <div className="text-xs mt-1">
                      <span className="text-gray-400">交易哈希: </span>
                      {getBlockchainExplorerUrl(transaction.network, transaction.txnHash) ? (
                        <a
                          href={getBlockchainExplorerUrl(transaction.network, transaction.txnHash)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#D32F2F] hover:underline"
                        >
                          {transaction.txnHash.slice(0, 10)}...{transaction.txnHash.slice(-8)}
                        </a>
                      ) : (
                        <span className="text-gray-600">
                          {transaction.txnHash.slice(0, 10)}...{transaction.txnHash.slice(-8)}
                        </span>
                      )}
                    </div>
                  )}
                  
                  {transaction.description && (
                    <div className="text-xs text-gray-500 mt-1">
                      {transaction.description}
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
