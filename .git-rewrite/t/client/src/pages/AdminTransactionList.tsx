/**
 * AdminTransactionList.tsx
 * 账本管理员/创建人专用：传统账目明细列表页
 * 支持查看所有成员账目、按标签/成员筛选、编辑和删除
 */
import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { ChevronLeft, Trash2, Pencil, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";

const AdminTransactionList = () => {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  const ledgerId = parseInt(id || "0");
  const utils = trpc.useUtils();

  // 筛选状态
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | undefined>(undefined);
  const [selectedMemberId, setSelectedMemberId] = useState<number | undefined>(undefined);
  const [offset, setOffset] = useState(0);
  const PAGE_SIZE = 50;

  // 删除确认
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

  // 获取账本信息（权限校验）
  const { data: ledger } = trpc.ledger.getLedger.useQuery({ id: ledgerId });
  const isAdminOrOwner =
    (ledger as any)?.userRole === "owner" || (ledger as any)?.userRole === "admin";

  // 获取顶级分类（标签）
  const { data: topCategories = [] } = trpc.ledger.getCategories.useQuery({
    ledgerId,
    parentId: null,
  });

  // 获取成员列表
  const { data: members = [] } = trpc.ledger.getMembers.useQuery({ ledgerId });

  // 获取账目列表
  const { data: transactionGroups = [], isLoading, refetch } = trpc.ledger.getTransactions.useQuery({
    ledgerId,
    categoryId: selectedCategoryId,
    memberId: selectedMemberId,
    limit: PAGE_SIZE,
    offset,
  });

  // 删除 mutation
  const deleteMutation = trpc.ledger.deleteTransaction.useMutation({
    onSuccess: () => {
      toast.success("已删除");
      utils.ledger.getTransactions.invalidate({ ledgerId });
      refetch();
    },
    onError: (err) => {
      toast.error("删除失败：" + err.message);
    },
  });

  // 重置分页
  useEffect(() => {
    setOffset(0);
  }, [selectedCategoryId, selectedMemberId]);

  // 权限检查
  if (ledger && !isAdminOrOwner) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#FAF3ED]">
        <p className="text-gray-500 text-sm">无权限访问</p>
      </div>
    );
  }

  // 展平所有记录（带日期分组信息）
  const allGroups = transactionGroups as any[];

  // 统计总条数
  const totalCount = allGroups.reduce((sum: number, g: any) => sum + (g.records?.length || 0), 0);

  const handleDelete = (recordId: number) => {
    setDeleteTargetId(recordId);
  };

  const confirmDelete = () => {
    if (deleteTargetId !== null) {
      deleteMutation.mutate({ recordId: deleteTargetId });
      setDeleteTargetId(null);
    }
  };

  const handleEdit = (recordId: number) => {
    setLocation(`/ledger/${id}/add?edit=${recordId}`);
  };

  // custom_aa 账本过滤掉默认分类
  const isCustomAA = (ledger as any)?.type === "custom_aa";
  const filteredCategories = isCustomAA
    ? (topCategories as any[]).filter((c: any) => !c.isDefault && c.id > 10)
    : (topCategories as any[]);

  return (
    <div className="min-h-screen bg-[#FAF3ED] flex flex-col">
      {/* 顶部导航 */}
      <div className="bg-[#D32F2F] text-white px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <button onClick={() => setLocation(`/ledger/${id}/settings`)}>
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-semibold flex-1">账目明细</h1>
        <span className="text-xs opacity-80">{totalCount} 条</span>
      </div>

      {/* 筛选栏 */}
      <div className="bg-white border-b border-gray-100 px-4 py-2 flex gap-2 flex-shrink-0 overflow-x-auto">
        {/* 标签筛选 */}
        <div className="relative flex-shrink-0">
          <select
            value={selectedCategoryId ?? ""}
            onChange={(e) =>
              setSelectedCategoryId(e.target.value ? parseInt(e.target.value) : undefined)
            }
            className="appearance-none bg-gray-100 text-gray-700 text-xs rounded px-3 py-1.5 pr-6 outline-none cursor-pointer"
          >
            <option value="">全部标签</option>
            {filteredCategories.map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3 h-3 text-gray-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* 成员筛选 */}
        <div className="relative flex-shrink-0">
          <select
            value={selectedMemberId ?? ""}
            onChange={(e) =>
              setSelectedMemberId(e.target.value ? parseInt(e.target.value) : undefined)
            }
            className="appearance-none bg-gray-100 text-gray-700 text-xs rounded px-3 py-1.5 pr-6 outline-none cursor-pointer"
          >
            <option value="">全部成员</option>
            {(members as any[]).map((m: any) => (
              <option key={m.userId} value={m.userId}>
                {m.nickname || m.username}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3 h-3 text-gray-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {/* 列表内容 */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
            加载中...
          </div>
        ) : allGroups.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
            暂无账目记录
          </div>
        ) : (
          allGroups.map((group: any) => (
            <div key={group.date}>
              {/* 日期分组标题 */}
              <div className="bg-[#FAF3ED] px-4 py-2 flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500">{group.date}</span>
                <div className="flex gap-3 text-xs">
                  {group.income > 0 && (
                    <span className="text-[#D32F2F]">
                      +¥{group.income.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  )}
                  {group.expense > 0 && (
                    <span className="text-[#4CAF50]">
                      -¥{group.expense.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  )}
                </div>
              </div>

              {/* 当日账目条目 */}
              {group.records.map((record: any, idx: number) => (
                <div
                  key={record.id}
                  className={`bg-white px-4 py-3 flex items-center gap-3 ${
                    idx < group.records.length - 1 ? "border-b border-gray-50" : ""
                  }`}
                >
                  {/* 成员头像 */}
                  <div className="flex-shrink-0">
                    {record.member?.avatar ? (
                      <img
                        src={record.member.avatar}
                        alt={record.member.username}
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-500">
                        {(record.member?.username || "?")[0].toUpperCase()}
                      </div>
                    )}
                  </div>

                  {/* 主体信息 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-gray-800 truncate">
                        {record.category || "未分类"}
                      </span>
                      {record.member?.username && (
                        <span className="text-[10px] text-gray-400 flex-shrink-0">
                          · {record.member.username}
                        </span>
                      )}
                    </div>
                    {record.description && (
                      <p className="text-[11px] text-gray-400 mt-0.5 truncate">{record.description}</p>
                    )}
                  </div>

                  {/* 金额 */}
                  <div className="flex-shrink-0 text-right mr-2">
                    <span
                      className={`text-sm font-semibold ${
                        record.type === "income" ? "text-[#D32F2F]" : "text-[#4CAF50]"
                      }`}
                    >
                      {record.type === "income" ? "+" : "-"}¥
                      {Number(record.amount).toLocaleString("zh-CN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex-shrink-0 flex gap-2">
                    <button
                      onClick={() => handleEdit(record.id)}
                      className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 active:bg-gray-200"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(record.id)}
                      className="w-7 h-7 flex items-center justify-center rounded-full bg-red-50 text-[#D32F2F] active:bg-red-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}

        {/* 分页 */}
        {!isLoading && allGroups.length > 0 && (
          <div className="flex items-center justify-center gap-4 py-4">
            {offset > 0 && (
              <button
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                className="px-4 py-1.5 text-xs text-[#D32F2F] border border-[#D32F2F] rounded-full"
              >
                上一页
              </button>
            )}
            {totalCount >= PAGE_SIZE && (
              <button
                onClick={() => setOffset(offset + PAGE_SIZE)}
                className="px-4 py-1.5 text-xs text-[#D32F2F] border border-[#D32F2F] rounded-full"
              >
                下一页
              </button>
            )}
            {totalCount < PAGE_SIZE && offset === 0 && (
              <span className="text-xs text-gray-400">已显示全部</span>
            )}
          </div>
        )}
      </div>

      {/* 删除确认弹窗 */}
      <AlertDialog open={deleteTargetId !== null} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>删除后将移入回收站（30天内可恢复），确定要删除这条账目吗？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2">
            <AlertDialogCancel className="flex-1" onClick={() => setDeleteTargetId(null)}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              className="flex-1 bg-[#D32F2F] hover:bg-[#B71C1C]"
              onClick={confirmDelete}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminTransactionList;
