import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "../lib/trpc";

export default function DeletedRecords() {
  const params = useParams<{ id: string }>();
  const ledgerId = Number(params.id);
  const [, setLocation] = useLocation();
  const [restoringId, setRestoringId] = useState<number | null>(null);

  const { data: records, isPending, refetch } = trpc.ledger.getDeletedTransactions.useQuery(
    { ledgerId },
    { enabled: !!ledgerId }
  );

  const restoreMutation = trpc.ledger.restoreTransaction.useMutation({
    onSuccess: () => {
      setRestoringId(null);
      refetch();
    },
    onError: (error: any) => {
      setRestoringId(null);
      alert(error.message || "恢复失败");
    },
  });

  const handleRestore = (recordId: number) => {
    if (confirm("确认恢复这条账目记录？恢复后将重新出现在账本中。")) {
      setRestoringId(recordId);
      restoreMutation.mutate({ recordId });
    }
  };

  // 计算剩余天数
  const getRemainingDays = (deletedAt: string | Date) => {
    const deleted = new Date(deletedAt);
    const now = new Date();
    const diffMs = 30 * 24 * 60 * 60 * 1000 - (now.getTime() - deleted.getTime());
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return Math.max(0, days);
  };

  // 格式化金额
  const formatAmount = (amount: number | string) => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    return num.toFixed(2);
  };

  // 格式化日期
  const formatDate = (date: string | Date) => {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--bg-cream)" }}>
      {/* 顶部导航栏 */}
      <div
        className="sticky top-0 z-10 flex items-center justify-between px-4 py-3"
        style={{ backgroundColor: "var(--brand-red)" }}
      >
        <button
          onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}
          className="text-white text-xl"
        >
          ←
        </button>
        <h1 className="text-white text-lg font-bold">删除账单找回</h1>
        <div className="w-8" />
      </div>

      {/* 提示信息 */}
      <div
        className="mx-4 mt-4 p-3 rounded-lg text-sm"
        style={{
          backgroundColor: "var(--brand-red-light)",
          color: "var(--text-gray)",
          border: "1px solid var(--border-gray)",
        }}
      >
        <p>
          <span style={{ color: "var(--brand-red)", fontWeight: "bold" }}>提示：</span>
          删除的账目将保留 <strong>30天</strong>，超过30天将自动永久删除，无法恢复。
        </p>
      </div>

      {/* 记录列表 */}
      <div className="px-4 mt-4 pb-8">
        {isPending ? (
          <div className="text-center py-12" style={{ color: "var(--text-gray)" }}>
            加载中...
          </div>
        ) : !records || records.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">📋</div>
            <p style={{ color: "var(--text-gray)" }}>暂无已删除的账目记录</p>
            <p className="text-sm mt-1" style={{ color: "var(--text-gray)", opacity: 0.7 }}>
              删除的账目将在此处保留30天
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* 统计信息 */}
            <div
              className="p-3 rounded-lg text-sm text-center"
              style={{
                backgroundColor: "var(--bg-white)",
                color: "var(--text-gray)",
                border: "1px solid var(--border-gray)",
              }}
            >
              共 <strong style={{ color: "var(--brand-red)" }}>{records.length}</strong> 条已删除记录
            </div>

            {/* 记录卡片 */}
            {records.map((record: any) => {
              const remaining = getRemainingDays(record.deletedAt);
              const isExpiringSoon = remaining <= 3;
              const isRestoring = restoringId === record.id;

              return (
                <div
                  key={record.id}
                  className="rounded-xl p-4"
                  style={{
                    backgroundColor: "var(--bg-white)",
                    border: "1px solid var(--border-gray)",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                  }}
                >
                  {/* 第一行：类型 + 分类 + 金额 */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="px-2 py-0.5 rounded text-xs font-bold text-white"
                        style={{
                          backgroundColor:
                            record.type === "income"
                              ? "var(--status-success)"
                              : "var(--brand-red)",
                        }}
                      >
                        {record.type === "income" ? "收入" : "支出"}
                      </span>
                      <span
                        className="text-sm font-medium"
                        style={{ color: "var(--text-black)" }}
                      >
                        {record.categoryName}
                      </span>
                    </div>
                    <span
                      className="text-lg font-bold"
                      style={{
                        color:
                          record.type === "income"
                            ? "var(--status-success)"
                            : "var(--brand-red)",
                      }}
                    >
                      {record.type === "income" ? "+" : "-"}
                      {formatAmount(record.amount)}
                    </span>
                  </div>

                  {/* 第二行：备注 */}
                  {record.description && (
                    <div
                      className="text-sm mb-2 truncate"
                      style={{ color: "var(--text-gray)" }}
                    >
                      {record.description}
                    </div>
                  )}

                  {/* 第三行：日期信息 */}
                  <div
                    className="flex items-center justify-between text-xs mb-3"
                    style={{ color: "var(--text-gray)" }}
                  >
                    <div className="flex items-center gap-3">
                      <span>记账日期：{record.date}</span>
                      <span>记录人：{record.createdByName}</span>
                    </div>
                  </div>

                  {/* 第四行：删除信息 + 恢复按钮 */}
                  <div
                    className="flex items-center justify-between pt-2"
                    style={{ borderTop: "1px solid var(--border-gray)" }}
                  >
                    <div className="text-xs" style={{ color: "var(--text-gray)" }}>
                      <span>删除人：{record.deletedByName}</span>
                      <span className="mx-2">·</span>
                      <span>删除于：{formatDate(record.deletedAt)}</span>
                      <span className="mx-2">·</span>
                      <span
                        style={{
                          color: isExpiringSoon
                            ? "var(--status-error)"
                            : "var(--status-warning)",
                          fontWeight: isExpiringSoon ? "bold" : "normal",
                        }}
                      >
                        剩余 {remaining} 天
                      </span>
                    </div>
                    <button
                      onClick={() => handleRestore(record.id)}
                      disabled={isRestoring}
                      className="px-4 py-1.5 rounded-lg text-sm font-bold text-white transition-opacity"
                      style={{
                        backgroundColor: isRestoring
                          ? "var(--text-gray)"
                          : "var(--status-success)",
                        opacity: isRestoring ? 0.6 : 1,
                        cursor: isRestoring ? "not-allowed" : "pointer",
                      }}
                    >
                      {isRestoring ? "恢复中..." : "恢复"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
