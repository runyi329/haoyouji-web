import { useLocation } from "wouter";
import { ArrowLeft, AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { trpc } from "../../lib/trpc";

export default function RechargeUnmatched() {
  const [, setLocation] = useLocation();

  const unmatchedQuery = trpc.recharge.adminGetUnmatchedTransactions.useQuery(undefined, {
    refetchInterval: 30000,
  });

  const transactions = unmatchedQuery.data || [];

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${month}-${day} ${hours}:${minutes}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 顶部导航 */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center">
            <button onClick={() => setLocation("/admin/recharge-monitor")} className="mr-3">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-lg font-semibold">未匹配交易</h1>
          </div>
          <button
            onClick={() => unmatchedQuery.refetch()}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-5 h-5 ${unmatchedQuery.isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* 说明 */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
          <div className="flex items-start">
            <AlertTriangle className="w-4 h-4 mt-0.5 mr-2 flex-shrink-0" />
            <div>
              <p className="font-medium mb-1">什么是未匹配交易？</p>
              <p>区块链扫描器检测到收款地址收到了USDT，但无法自动匹配到任何订单。可能原因：</p>
              <ul className="list-disc list-inside mt-1 space-y-0.5">
                <li>用户转账金额与订单金额差异过大</li>
                <li>订单已过期或已取消</li>
                <li>用户未创建订单直接转账</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 交易列表 */}
        <div className="bg-white rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50">
            <h2 className="font-semibold text-gray-900">
              未匹配交易列表 ({transactions.length})
            </h2>
          </div>

          {transactions.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p>暂无未匹配交易</p>
            </div>
          ) : (
            <div className="divide-y">
              {transactions.map((tx: any) => (
                <div key={tx.id} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-lg font-semibold text-gray-900">
                      {tx.amount} USDT
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                      待处理
                    </span>
                  </div>

                  <div className="space-y-1 text-sm text-gray-600">
                    <div className="flex justify-between">
                      <span className="text-gray-500">交易哈希</span>
                      <a
                        href={`https://tronscan.org/#/transaction/${tx.txn_hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-blue-600 hover:underline flex items-center"
                      >
                        {tx.txn_hash.slice(0, 10)}...{tx.txn_hash.slice(-8)}
                        <ExternalLink className="w-3 h-3 ml-1" />
                      </a>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">发送方</span>
                      <span className="font-mono text-xs">
                        {tx.from_address.slice(0, 8)}...{tx.from_address.slice(-6)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">检测时间</span>
                      <span>{formatDate(tx.created_at)}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setLocation("/admin/recharge/manual-confirm")}
                    className="w-full mt-3 py-2 text-sm text-[#D32F2F] border border-[#D32F2F] rounded-lg hover:bg-red-50 transition-colors"
                  >
                    手动匹配订单
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 操作提示 */}
        {transactions.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
            <p className="font-medium mb-1">处理建议：</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>点击"手动匹配订单"查看待确认订单列表</li>
              <li>根据金额和时间找到对应订单</li>
              <li>填写交易哈希完成手动确认</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
