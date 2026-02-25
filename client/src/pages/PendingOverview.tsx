import { useLocation } from "wouter";
import { ArrowLeft, Hourglass, User } from "lucide-react";
import { trpc } from "@/lib/trpc";

const PendingOverview = () => {
  const [, setLocation] = useLocation();

  // 获取所有待结账目
  const { data: pendingData, isLoading } = trpc.ledger.getAllPending.useQuery();

  // 计算汇总统计
  const stats = pendingData?.reduce(
    (acc, ledger) => {
      ledger.transactions.forEach((t) => {
        if (t.pendingType === "receivable") {
          acc.receivableAmount += t.amount;
          acc.receivableCount += 1;
        } else if (t.pendingType === "payable") {
          acc.payableAmount += t.amount;
          acc.payableCount += 1;
        }
      });
      return acc;
    },
    { receivableAmount: 0, receivableCount: 0, payableAmount: 0, payableCount: 0 }
  ) || { receivableAmount: 0, receivableCount: 0, payableAmount: 0, payableCount: 0 };

  const netAmount = stats.receivableAmount - stats.payableAmount;
  const totalCount = stats.receivableCount + stats.payableCount;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="bg-white p-4 flex items-center justify-between border-b sticky top-0 z-10">
        <button onClick={() => setLocation("/ledgers")}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold">待结算总览</h1>
        <div className="bg-blue-100 text-blue-700 text-xs font-medium px-2.5 py-1 rounded-full">
          共 {totalCount} 笔
        </div>
      </div>

      {/* 汇总统计卡片 */}
      <div className="p-4">
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <div className="grid grid-cols-3 gap-4">
            {/* 代收 */}
            <div className="text-center">
              <div className="text-xs text-gray-500 mb-1">代收</div>
              <div className="text-lg font-semibold text-green-600">
                +{stats.receivableAmount.toFixed(2)}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">{stats.receivableCount} 笔</div>
            </div>

            {/* 代付 */}
            <div className="text-center">
              <div className="text-xs text-gray-500 mb-1">代付</div>
              <div className="text-lg font-semibold text-orange-600">
                -{stats.payableAmount.toFixed(2)}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">{stats.payableCount} 笔</div>
            </div>

            {/* 净额 */}
            <div className="text-center">
              <div className="text-xs text-gray-500 mb-1">净额</div>
              <div
                className={`text-lg font-semibold ${
                  netAmount >= 0 ? "text-green-600" : "text-orange-600"
                }`}
              >
                {netAmount >= 0 ? "+" : ""}
                {netAmount.toFixed(2)}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {netAmount >= 0 ? "应收" : "应付"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 按账本分组的待结账目列表 */}
      <div className="px-4 pb-4 space-y-3">
        {pendingData && pendingData.length > 0 ? (
          pendingData.map((ledger) => (
            <div key={ledger.ledgerId} className="bg-white rounded-lg shadow-sm overflow-hidden">
              {/* 账本头部 */}
              <div className="bg-gray-50 px-4 py-2.5 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{ledger.ledgerName}</span>
                  <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">
                    {ledger.transactions.length} 笔
                  </span>
                </div>
              </div>

              {/* 账目列表 */}
              <div className="divide-y">
                {ledger.transactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() =>
                      setLocation(`/ledger/${ledger.ledgerId}/transaction/${transaction.id}`)
                    }
                  >
                    <div className="flex items-start justify-between">
                      {/* 左侧：分类图标 + 描述 + 日期 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {transaction.categoryIcon && (
                            <span className="text-lg">{transaction.categoryIcon}</span>
                          )}
                          <span className="font-medium text-gray-900 truncate">
                            {transaction.description || transaction.categoryName || "未分类"}
                          </span>
                          <Hourglass className="w-4 h-4 text-blue-600 flex-shrink-0" />
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span>
                            {new Date(transaction.recordDate).toLocaleDateString("zh-CN", {
                              month: "numeric",
                              day: "numeric",
                            })}
                          </span>
                          <span>•</span>
                          <div className="flex items-center gap-1">
                            {transaction.creatorAvatar ? (
                              <img
                                src={transaction.creatorAvatar}
                                alt={transaction.creatorName || ""}
                                className="w-4 h-4 rounded-full"
                              />
                            ) : (
                              <User className="w-4 h-4" />
                            )}
                            <span>{transaction.creatorName || "未知"}</span>
                          </div>
                          {transaction.pendingIncludeStats === 0 && (
                            <>
                              <span>•</span>
                              <span className="text-gray-400">不计入统计</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* 右侧：金额 */}
                      <div className="ml-4 text-right flex-shrink-0">
                        <div
                          className={`text-lg font-semibold ${
                            transaction.pendingType === "receivable"
                              ? transaction.pendingIncludeStats === 0
                                ? "text-gray-400"
                                : "text-green-600"
                              : transaction.pendingIncludeStats === 0
                              ? "text-gray-400"
                              : "text-orange-600"
                          }`}
                        >
                          {transaction.pendingType === "receivable" ? "+" : "-"}
                          {transaction.amount.toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {transaction.pendingType === "receivable" ? "代收" : "代付"}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="bg-white rounded-lg p-8 text-center">
            <Hourglass className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">暂无待结算账目</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PendingOverview;
