import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, Hourglass } from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";

export default function PendingOverview() {
  const [, setLocation] = useLocation();

  const { data, isLoading } = trpc.ledger.getAllPending.useQuery();

  // 计算汇总统计
  const stats = (() => {
    if (!data) return { collectCount: 0, collectAmount: 0, payCount: 0, payAmount: 0 };
    let collectCount = 0;
    let collectAmount = 0;
    let payCount = 0;
    let payAmount = 0;
    for (const ledger of data) {
      for (const t of ledger.transactions) {
        if (t.pendingType === "collect") {
          collectCount++;
          collectAmount += Math.abs(t.amount);
        } else if (t.pendingType === "pay") {
          payCount++;
          payAmount += Math.abs(t.amount);
        }
      }
    }
    return { collectCount, collectAmount, payCount, payAmount };
  })();

  const totalCount = stats.collectCount + stats.payCount;
  const netAmount = stats.collectAmount - stats.payAmount;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FFF8F5] flex items-center justify-center">
        <p className="text-gray-400">加载中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFF8F5]">
      {/* 顶部导航 */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <button onClick={() => setLocation("/ledger")} className="p-1">
          <ChevronLeft className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="text-base font-semibold text-gray-900">待结算总览</h1>
        <span className="text-xs text-red-500 font-medium">共 {totalCount} 笔</span>
      </div>

      {/* 汇总统计卡片 */}
      <div className="mx-4 mt-4 bg-white rounded-xl p-4 shadow-sm border border-gray-50">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-xs text-gray-500 mb-1">代收</p>
            <p className="text-base font-bold text-green-600">+{stats.collectAmount.toFixed(2)}</p>
            <p className="text-[10px] text-gray-400">{stats.collectCount} 笔</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">代付</p>
            <p className="text-base font-bold text-orange-500">-{stats.payAmount.toFixed(2)}</p>
            <p className="text-[10px] text-gray-400">{stats.payCount} 笔</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">净额</p>
            <p className={`text-base font-bold ${netAmount >= 0 ? "text-green-600" : "text-orange-500"}`}>
              {netAmount >= 0 ? "+" : ""}{netAmount.toFixed(2)}
            </p>
            <p className="text-[10px] text-gray-400">{netAmount >= 0 ? "应收" : "应付"}</p>
          </div>
        </div>
      </div>

      {/* 按账本分组列表 */}
      <div className="px-4 mt-4 pb-20 space-y-4">
        {(!data || data.length === 0) ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Hourglass className="w-12 h-12 text-gray-300 mb-3" />
            <p className="text-gray-400 text-sm">暂无待结算账目</p>
          </div>
        ) : (
          data.map((ledger) => (
            <div key={ledger.ledgerId} className="bg-white rounded-xl shadow-sm border border-gray-50 overflow-hidden">
              {/* 账本标题 */}
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800 truncate">{ledger.ledgerName}</h3>
                <span className="text-xs text-gray-500 ml-2 shrink-0">{ledger.transactions.length} 笔待结</span>
              </div>

              {/* 账目列表 */}
              <div className="divide-y divide-gray-50">
                {ledger.transactions.map((t) => (
                  <div
                    key={t.id}
                    className="px-4 py-3 flex items-center gap-3 active:bg-gray-50 cursor-pointer"
                    onClick={() => setLocation(`/ledger/${ledger.ledgerId}/transaction/${t.id}`)}
                  >
                    {/* 左侧：分类图标或头像 */}
                    <div className="shrink-0">
                      {t.categoryIcon ? (
                        <span className="text-xl">{t.categoryIcon}</span>
                      ) : (
                        <UserAvatar
                          username={t.creatorName || "?"}
                          avatar={t.creatorAvatar}
                          size="sm"
                        />
                      )}
                    </div>

                    {/* 中间：描述和日期 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm text-gray-800 truncate">
                          {t.categoryName || t.description || "未分类"}
                        </span>
                        <Hourglass className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                        <span className={`text-[10px] px-1 py-0.5 rounded ${
                          t.pendingType === "collect"
                            ? "bg-green-50 text-green-600"
                            : "bg-orange-50 text-orange-500"
                        }`}>
                          {t.pendingType === "collect" ? "代收" : "代付"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-gray-400">
                          {new Date(t.recordDate).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })}
                        </span>
                        {t.creatorName && (
                          <span className="text-[11px] text-gray-400">
                            {t.creatorName}
                          </span>
                        )}
                        {t.pendingIncludeStats === 0 && (
                          <span className="text-[10px] text-gray-400">(不计入统计)</span>
                        )}
                      </div>
                    </div>

                    {/* 右侧：金额 */}
                    <div className="shrink-0 text-right">
                      <span className={`text-sm font-medium ${
                        t.pendingIncludeStats === 0
                          ? "text-gray-400"
                          : t.type === "income"
                            ? "text-green-600"
                            : "text-red-500"
                      }`}>
                        {t.type === "income" ? "+" : "-"}{Math.abs(t.amount).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
