import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "../lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Button } from "../components/ui/button";

export default function DeletedRecords() {
  const params = useParams<{ id: string }>();
  const ledgerId = Number(params.id);
  const [, setLocation] = useLocation();
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [pendingRestoreId, setPendingRestoreId] = useState<number | null>(null);

  const { data: records, isPending, isError, error, refetch } = trpc.ledger.getDeletedTransactions.useQuery(
    { ledgerId },
    { enabled: !!ledgerId && !isNaN(ledgerId) && ledgerId > 0 }
  );

  const restoreMutation = trpc.ledger.restoreTransaction.useMutation({
    onSuccess: () => {
      setRestoringId(null);
      refetch();
    },
    onError: (err: any) => {
      setRestoringId(null);
      alert(err.message || "恢复失败");
    },
  });

  const handleRestore = (recordId: number) => {
    setPendingRestoreId(recordId);
    setShowRestoreDialog(true);
  };

  const confirmRestore = () => {
    if (pendingRestoreId !== null) {
      setShowRestoreDialog(false);
      setRestoringId(pendingRestoreId);
      restoreMutation.mutate({ recordId: pendingRestoreId });
      setPendingRestoreId(null);
    }
  };

  // 计算剩余天数（60天保留期）
  const getRemainingDays = (deletedAt: string | Date) => {
    if (!deletedAt) return 0;
    const deleted = new Date(deletedAt);
    const now = new Date();
    const diffMs = 60 * 24 * 60 * 60 * 1000 - (now.getTime() - deleted.getTime());
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return Math.max(0, days);
  };

  // 格式化金额
  const formatAmount = (amount: number | string) => {
    if (!amount) return "0.00";
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    return isNaN(num) ? "0.00" : num.toFixed(2);
  };

  // 按删除日期分组
  const groupByDeleteDate = (items: any[]) => {
    const groups: Record<string, any[]> = {};
    items.forEach((item) => {
      const key = item.deletedAt || "未知";
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
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
        className="px-4 py-2 text-xs"
        style={{
          backgroundColor: "#FFF5F5",
          color: "var(--text-gray)",
          borderBottom: "1px solid var(--border-gray)",
        }}
      >
        <span style={{ color: "var(--brand-red)" }}>提示：</span>
        删除的账目保留<strong>60天</strong>，超期自动永久删除。
        {records && records.length > 0 && (
          <span style={{ float: "right", color: "var(--brand-red)" }}>
            共{records.length}条
          </span>
        )}
      </div>

      {/* 记录列表 */}
      <div className="pb-8">
        {isPending ? (
          <div className="text-center py-12" style={{ color: "var(--text-gray)", fontSize: "13px" }}>
            加载中...
          </div>
        ) : isError ? (
          <div className="text-center py-12">
            <p style={{ color: "var(--brand-red)", fontSize: "13px" }}>加载失败</p>
            <p className="mt-1" style={{ color: "var(--text-gray)", fontSize: "12px" }}>
              {(error as any)?.message || "请稍后重试"}
            </p>
            <button
              onClick={() => refetch()}
              className="mt-3 px-4 py-1.5 rounded text-xs text-white"
              style={{ backgroundColor: "var(--brand-red)" }}
            >
              重新加载
            </button>
          </div>
        ) : !records || records.length === 0 ? (
          <div className="text-center py-16" style={{ color: "var(--text-gray)", fontSize: "13px" }}>
            <p>暂无已删除的账目</p>
            <p className="mt-1" style={{ fontSize: "12px", opacity: 0.6 }}>
              删除的账目将在此处保留60天
            </p>
          </div>
        ) : (
          <>
            {groupByDeleteDate(records).map(([dateKey, items]) => {
              const remaining = getRemainingDays(dateKey);
              const isExpiringSoon = remaining <= 3;

              return (
                <div key={dateKey}>
                  {/* 日期分组头 - 模仿账本中的日期行 */}
                  <div
                    className="flex items-center justify-between px-4 py-1.5"
                    style={{
                      backgroundColor: "var(--bg-cream)",
                      borderBottom: "1px solid var(--border-gray)",
                      fontSize: "11px",
                      color: "var(--text-gray)",
                    }}
                  >
                    <span>删除于 {dateKey}</span>
                    <span
                      style={{
                        color: isExpiringSoon ? "var(--status-error)" : "var(--status-warning)",
                        fontWeight: isExpiringSoon ? "bold" : "normal",
                      }}
                    >
                      剩余{remaining}天
                    </span>
                  </div>

                  {/* 该日期下的账目列表 */}
                  {items.map((record: any, idx: number) => {
                    const isRestoring = restoringId === record.id;
                    return (
                      <div
                        key={record.id}
                        className="flex items-center px-4"
                        style={{
                          backgroundColor: "var(--bg-white)",
                          borderBottom: idx < items.length - 1 ? "1px solid #f0f0f0" : "1px solid var(--border-gray)",
                          minHeight: "44px",
                          opacity: isRestoring ? 0.5 : 1,
                        }}
                      >
                        {/* 左侧：分类名 */}
                        <div className="flex-1 flex items-center gap-1.5 py-2 min-w-0">
                          <span
                            className="flex-shrink-0"
                            style={{
                              fontSize: "13px",
                              fontWeight: 500,
                              color: "var(--text-black)",
                            }}
                          >
                            {record.categoryName || "未分类"}
                          </span>
                          {record.description && (
                            <span
                              className="truncate"
                              style={{
                                fontSize: "11px",
                                color: "var(--text-gray)",
                                opacity: 0.7,
                              }}
                            >
                              {record.description}
                            </span>
                          )}
                        </div>

                        {/* 中间：金额 */}
                        <div
                          className="flex-shrink-0 text-right mr-3"
                          style={{
                            fontSize: "14px",
                            fontWeight: 600,
                            color: record.type === "income" ? "#4CAF50" : "var(--text-black)",
                          }}
                        >
                          {record.type === "income" ? "+" : "-"}
                          {formatAmount(record.amount)}
                        </div>

                        {/* 右侧：恢复按钮 */}
                        <button
                          onClick={() => handleRestore(record.id)}
                          disabled={isRestoring}
                          className="flex-shrink-0 px-2.5 py-1 rounded text-xs text-white"
                          style={{
                            backgroundColor: isRestoring ? "#ccc" : "var(--brand-red)",
                            fontSize: "11px",
                            cursor: isRestoring ? "not-allowed" : "pointer",
                          }}
                        >
                          {isRestoring ? "恢复中" : "恢复"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* 恢复确认对话框 */}
      <Dialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认恢复</DialogTitle>
            <DialogDescription>
              确认恢复这条账目记录？恢复后将重新出现在账本中。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setShowRestoreDialog(false)}>
              取消
            </Button>
            <Button
              onClick={confirmRestore}
              className="text-white"
              style={{ backgroundColor: "var(--brand-red)" }}
            >
              确认恢复
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
