import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, Hourglass } from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";

export default function PendingOverview() {
  const [, setLocation] = useLocation();

  const { data, isLoading } = trpc.ledger.getAllPending.useQuery();

  // 计算汇总统计
  const stats = (() => {
    if (!data || data.length === 0) return { collectCount: 0, collectAmount: 0, payCount: 0, payAmount: 0 };
    let collectCount = 0;
    let collectAmount = 0;
    let payCount = 0;
    let payAmount = 0;
    for (const ledger of data) {
      for (const t of ledger.transactions) {
        const amt = Number(t.amount) || 0;
        if (t.pendingType === "collect") {
          collectCount++;
          collectAmount += Math.abs(amt);
        } else if (t.pendingType === "pay") {
          payCount++;
          payAmount += Math.abs(amt);
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
        <p className="text-gray-400 text-sm">加载中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFF8F5]">
      {/* 顶部导航 */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <button onClick={() => setLocation("/ledger")} className="p-1">
          <ChevronLeft className="w-5 h-5 text-[#222222]" />
        </button>
        <h1 className="text-base font-semibold text-[#222222]">待结算总览</h1>
        <span className="text-xs text-[#D32F2F] font-medium">共 {totalCount} 笔</span>
      </div>

      {/* 汇总统计卡片 */}
      <div className="mx-4 mt-4 bg-white rounded-xl p-4 shadow-sm">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-xs text-[#999999] mb-1">代收</p>
            <p className="text-base font-bold text-[#4CAF50]">+{stats.collectAmount.toFixed(2)}</p>
            <p className="text-[10px] text-[#BBBBBB]">{stats.collectCount} 笔</p>
          </div>
          <div className="border-l border-r border-gray-100">
            <p className="text-xs text-[#999999] mb-1">代付</p>
            <p className="text-base font-bold text-[#D32F2F]">-{stats.payAmount.toFixed(2)}</p>
            <p className="text-[10px] text-[#BBBBBB]">{stats.payCount} 笔</p>
          </div>
          <div>
            <p className="text-xs text-[#999999] mb-1">净额</p>
            <p className={`text-base font-bold ${netAmount >= 0 ? "text-[#4CAF50]" : "text-[#D32F2F]"}`}>
              {netAmount >= 0 ? "+" : ""}{netAmount.toFixed(2)}
            </p>
            <p className="text-[10px] text-[#BBBBBB]">{netAmount >= 0 ? "应收" : "应付"}</p>
          </div>
        </div>
      </div>

      {/* 按账本分组列表 */}
      <div className="px-4 mt-4 pb-20 space-y-3">
        {(!data || data.length === 0) ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Hourglass className="w-10 h-10 text-gray-300 mb-3" />
            <p className="text-[#999999] text-sm">暂无待结算账目</p>
          </div>
        ) : (
          data.map((ledger) => (
            <div key={ledger.ledgerId} className="bg-white rounded-xl shadow-sm overflow-hidden">
              {/* 账本标题 */}
              <div className="px-4 py-2.5 border-b border-gray-50 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#222222] truncate">{ledger.ledgerName}</h3>
                <span className="text-[11px] text-[#999999] ml-2 shrink-0">{ledger.transactions.length} 笔待结</span>
              </div>

              {/* 账目列表 */}
              <div className="divide-y divide-gray-50">
                {ledger.transactions.map((t) => {
                  const amt = Number(t.amount) || 0;
                  return (
                    <div
                      key={t.id}
                      className="px-4 py-2.5 flex items-center gap-2.5 active:bg-gray-50 cursor-pointer"
                      onClick={() => setLocation(`/ledger/${ledger.ledgerId}/transaction/${t.id}`)}
                    >
                      {/* 左侧：成员头像 */}
                      <div className="flex-shrink-0">
                        <UserAvatar
                          username={t.creatorName || "?"}
                          avatar={t.creatorAvatar}
                          size="sm"
                        />
                      </div>

                      {/* 中间：分类和日期 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${t.type === 'expense' ? 'bg-[#D32F2F]' : 'bg-[#4CAF50]'}`}></span>
                          <span className="text-xs text-[#222222] font-normal truncate">
                            {t.categoryName || t.description || "未分类"}
                          </span>
                          <Hourglass className="w-3.5 h-3.5 text-[#1976D2] flex-shrink-0" />
                          <span className={`text-[10px] px-1 py-0.5 rounded flex-shrink-0 ${
                            t.pendingType === "collect"
                              ? "bg-[#E8F5E9] text-[#4CAF50]"
                              : "bg-[#FFF3E0] text-[#FF9800]"
                          }`}>
                            {t.pendingType === "collect" ? "代收" : "代付"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 ml-2.5">
                          <span className="text-[11px] text-[#BBBBBB]">
                            {new Date(t.recordDate).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })}
                          </span>
                          {t.creatorName && (
                            <span className="text-[11px] text-[#BBBBBB]">
                              {t.creatorName}
                            </span>
                          )}
                          {t.pendingIncludeStats === 0 && (
                            <span className="text-[10px] text-[#BBBBBB]">(不计入统计)</span>
                          )}
                        </div>
                      </div>

                      {/* 右侧：金额 */}
                      <div className="flex-shrink-0 text-right">
                        <span className={`text-sm font-normal ${
                          t.pendingIncludeStats === 0
                            ? "text-gray-400"
                            : t.type === "income"
                              ? "text-[#4CAF50]"
                              : "text-[#D32F2F]"
                        }`}>
                          {t.type === "income" ? "+" : "-"}{Math.abs(amt).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
