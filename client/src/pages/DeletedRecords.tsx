import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "../lib/trpc";
import { UserAvatar } from "../components/UserAvatar";
import { Receipt, Hourglass } from "lucide-react";
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
                  {/* 日期分组头 - 与账本中的日期行风格一致 */}
                  <div
                    className="flex items-center justify-between px-3 py-1"
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
                        color: isExpiringSoon ? "#D32F2F" : "#FF8F00",
                        fontWeight: isExpiringSoon ? "bold" : "normal",
                      }}
                    >
                      剩余{remaining}天
                    </span>
                  </div>

                  {/* 该日期下的账目列表 - 与LedgerDetail完全相同的行样式 */}
                  <div className="space-y-2 px-3 py-2">
                    {items.map((record: any) => {
                      const isRestoring = restoringId === record.id;
                      const amount = parseFloat(record.amount || "0");

                      return (
                        <div
                          key={record.id}
                          className="bg-white rounded-lg p-2 flex items-center gap-2.5"
                          style={{ opacity: isRestoring ? 0.5 : 1 }}
                        >
                          {/* 成员头像 - 与账本中完全一致 */}
                          <div className="flex-shrink-0">
                            <UserAvatar
                              username={record.createdByName}
                              avatar={record.createdByAvatar}
                              size="sm"
                            />
                          </div>

                          {/* 分类信息 - 与账本中完全一致 */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <span
                                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                style={{
                                  backgroundColor:
                                    record.type === "expense" ? "#D32F2F" : "#4CAF50",
                                }}
                              />
                              <span className="text-xs text-[#222222] font-normal">
                                {record.categoryName || "未分类"}
                              </span>
                              {/* 图片图标 */}
                              {record.imageUrl && (
                                <svg
                                  className="w-3.5 h-3.5 ml-0.5 flex-shrink-0"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="#1976D2"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                  <circle cx="8.5" cy="8.5" r="1.5" />
                                  <polyline points="21 15 16 10 5 21" />
                                </svg>
                              )}
                              {/* 报销状态图标 */}
                              {record.reimbursementStatus === "pending" && (
                                <Receipt className="w-3.5 h-3.5 ml-0.5 text-[#1976D2] flex-shrink-0" />
                              )}
                              {/* 待结状态图标 */}
                              {record.pendingType && (
                                <Hourglass
                                  className="w-3.5 h-3.5 ml-0.5 text-[#1976D2] flex-shrink-0"
                                  title={record.pendingType === "receivable" ? "代收" : "代付"}
                                />
                              )}
                            </div>
                            {record.description && (
                              <div className="text-xs text-gray-500 mt-0.5 ml-2.5 font-light">
                                {record.description}
                              </div>
                            )}
                          </div>

                          {/* 金额 - 与账本中完全一致 */}
                          <div
                            className="text-sm font-normal flex-shrink-0"
                            style={{
                              color:
                                record.pendingType && record.pendingIncludeStats === 0
                                  ? "#9E9E9E"
                                  : record.type === "expense"
                                  ? "#D32F2F"
                                  : "#4CAF50",
                            }}
                          >
                            {record.type === "expense" ? "-" : "+"}
                            {amount.toFixed(2)}
                          </div>

                          {/* 恢复按钮 - 新增 */}
                          <button
                            onClick={() => handleRestore(record.id)}
                            disabled={isRestoring}
                            className="flex-shrink-0 px-2 py-1 rounded text-xs text-white"
                            style={{
                              backgroundColor: isRestoring ? "#ccc" : "#D32F2F",
                              fontSize: "11px",
                              cursor: isRestoring ? "not-allowed" : "pointer",
                              minWidth: "36px",
                            }}
                          >
                            {isRestoring ? "中..." : "恢复"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
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
              style={{ backgroundColor: "#D32F2F" }}
            >
              确认恢复
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
