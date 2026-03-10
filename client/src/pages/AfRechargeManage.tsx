import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { ChevronLeft, Plus, Pencil, Trash2, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { UserAvatar } from "@/components/UserAvatar";

export default function AfRechargeManage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 1;

  // 当前 tab：recharge=充值记录 | manual=手动调账
  const [tab, setTab] = useState<"recharge" | "manual">("recharge");

  // 手动调账弹窗状态
  // isEditing=true 表示编辑已有记录，false 表示新增
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editRecordId, setEditRecordId] = useState<number | undefined>(undefined);
  const [selectedUserId, setSelectedUserId] = useState<number | undefined>(undefined);
  const [editAmount, setEditAmount] = useState("");
  const [editDirection, setEditDirection] = useState<"add" | "sub">("add"); // 增加或减少
  const [editNote, setEditNote] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  // 获取账本成员列表
  const { data: members } = trpc.ledger.getMembers.useQuery({ ledgerId });

  // 获取手动调账记录
  const { data: manualRecords, refetch: refetchManual } =
    trpc.ledger.afGetManualBalances.useQuery({ ledgerId });

  // 新增/编辑手动调账
  const upsertMutation = trpc.ledger.afUpsertManualBalance.useMutation({
    onSuccess: () => {
      toast.success("保存成功");
      setShowEditDialog(false);
      setEditRecordId(undefined);
      setSelectedUserId(undefined);
      setEditAmount("");
      setEditNote("");
      refetchManual();
    },
    onError: (e) => toast.error(e.message || "保存失败"),
  });

  // 删除手动调账
  const deleteMutation = trpc.ledger.afDeleteManualBalance.useMutation({
    onSuccess: () => {
      toast.success("已删除");
      setDeleteTarget(null);
      refetchManual();
    },
    onError: (e) => toast.error(e.message || "删除失败"),
  });

  const openAdd = () => {
    setIsEditing(false);
    setEditRecordId(undefined);
    setSelectedUserId(undefined);
    setEditAmount("");
    setEditDirection("add");
    setEditNote("");
    setShowEditDialog(true);
  };

  const openEdit = (record: any) => {
    setIsEditing(true);
    setEditRecordId(record.id);
    setSelectedUserId(record.userId || record.user_id);
    const amt = Number(record.amount);
    setEditDirection(amt >= 0 ? "add" : "sub");
    setEditAmount(String(Math.abs(amt)));
    setEditNote(record.note || "");
    setShowEditDialog(true);
  };

  const handleSave = () => {
    const absAmount = parseFloat(editAmount);
    if (isNaN(absAmount) || absAmount <= 0) {
      toast.error("请输入大于 0 的数字");
      return;
    }
    if (!isEditing && !selectedUserId) {
      toast.error("请先选择成员");
      return;
    }
    const finalAmount = editDirection === "sub" ? -absAmount : absAmount;
    upsertMutation.mutate({
      ledgerId,
      id: isEditing ? editRecordId : undefined,
      userId: selectedUserId!,
      amount: finalAmount,
      note: editNote,
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 顶部导航 */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="flex items-center justify-between h-14 px-4">
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}
            className="p-2 -ml-2"
          >
            <ChevronLeft className="w-6 h-6 text-gray-700" />
          </button>
          <h1 className="text-lg font-medium text-gray-900">充值管理</h1>
          <div className="w-10" />
        </div>

        {/* Tab 切换 */}
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => setTab("recharge")}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              tab === "recharge"
                ? "text-red-600 border-b-2 border-red-600"
                : "text-gray-500"
            }`}
          >
            充值记录
          </button>
          <button
            onClick={() => setTab("manual")}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              tab === "manual"
                ? "text-red-600 border-b-2 border-red-600"
                : "text-gray-500"
            }`}
          >
            手动调账
          </button>
        </div>
      </div>

      {/* 充值记录 Tab */}
      {tab === "recharge" && (
        <div className="px-4 pt-4 space-y-3">
          <button
            onClick={() => setLocation("/admin/recharge/orders")}
            className="w-full bg-white rounded-2xl px-4 py-4 flex items-center justify-between shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                <span className="text-red-600 text-lg">💳</span>
              </div>
              <div className="text-left">
                <div className="text-sm font-medium text-gray-900">充值订单管理</div>
                <div className="text-xs text-gray-400 mt-0.5">查看所有用户的充值记录</div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>

          <button
            onClick={() => setLocation("/admin/recharge-monitor")}
            className="w-full bg-white rounded-2xl px-4 py-4 flex items-center justify-between shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
                <span className="text-orange-500 text-lg">📊</span>
              </div>
              <div className="text-left">
                <div className="text-sm font-medium text-gray-900">充值监控</div>
                <div className="text-xs text-gray-400 mt-0.5">实时监控充值到账情况</div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>

          <button
            onClick={() => setLocation("/admin/recharge/unmatched")}
            className="w-full bg-white rounded-2xl px-4 py-4 flex items-center justify-between shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-yellow-50 flex items-center justify-center">
                <span className="text-yellow-500 text-lg">⚠️</span>
              </div>
              <div className="text-left">
                <div className="text-sm font-medium text-gray-900">未匹配充值</div>
                <div className="text-xs text-gray-400 mt-0.5">处理未自动匹配的充值记录</div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      )}

      {/* 手动调账 Tab */}
      {tab === "manual" && (
        <div className="px-4 pt-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-400">为成员手动添加或修改市值（USDT）</p>
            <Button
              size="sm"
              onClick={openAdd}
              className="bg-red-600 hover:bg-red-700 text-white rounded-xl h-8 px-3 text-xs"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              新增
            </Button>
          </div>

          <div className="space-y-2">
            {(!manualRecords || manualRecords.length === 0) && (
              <div className="text-center text-gray-400 text-sm py-12">
                暂无手动调账记录
              </div>
            )}
            {manualRecords?.map((record: any) => {
              const uid = record.userId || record.user_id;
              const member = members?.find((m: any) => m.userId === uid);
              return (
                <div
                  key={record.id}
                  className="bg-white rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm"
                >
                  <UserAvatar
                    username={member?.username || ""}
                    avatar={member?.avatar}
                    nickname={member?.nickname}
                    size="sm"
                    className="w-10 h-10 rounded-xl flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {member?.nickname || member?.username || `用户 ${uid}`}
                    </div>
                    {record.note && (
                      <div className="text-xs text-gray-400 truncate">{record.note}</div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={`text-base font-bold ${Number(record.amount) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {Number(record.amount) >= 0 ? '+' : ''}{Number(record.amount).toFixed(2)}
                      <span className="text-xs text-gray-400 font-normal ml-1">USDT</span>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => openEdit(record)}
                      className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center"
                    >
                      <Pencil className="w-4 h-4 text-gray-500" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(record)}
                      className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 新增/编辑弹窗 */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="mx-4 rounded-2xl">
          <DialogTitle>{isEditing ? "编辑调账" : "新增调账"}</DialogTitle>

          {/* 选择用户（仅新增时显示） */}
          {!isEditing && (
            <div className="space-y-2">
              <label className="text-sm text-gray-600">选择成员</label>
              <div className="max-h-40 overflow-y-auto space-y-1 border border-gray-100 rounded-xl p-2">
                {members?.map((m: any) => (
                  <button
                    key={m.userId}
                    onClick={() => setSelectedUserId(m.userId)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left transition-colors ${
                      selectedUserId === m.userId
                        ? "bg-red-50 text-red-600"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <UserAvatar
                      username={m.username}
                      avatar={m.avatar}
                      nickname={m.nickname}
                      size="sm"
                      className="w-8 h-8 rounded-lg flex-shrink-0"
                    />
                    <span className="text-sm">{m.nickname || m.username}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3 mt-2">
            {/* 增/减切换 */}
            <div>
              <label className="text-sm text-gray-600 mb-1 block">调账方向</label>
              <div className="flex rounded-xl overflow-hidden border border-gray-200">
                <button
                  onClick={() => setEditDirection("add")}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    editDirection === "add"
                      ? "bg-green-500 text-white"
                      : "bg-white text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  + 增加
                </button>
                <button
                  onClick={() => setEditDirection("sub")}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    editDirection === "sub"
                      ? "bg-red-500 text-white"
                      : "bg-white text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  - 减少
                </button>
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">金额（USDT）</label>
              <Input
                type="number"
                placeholder="请输入正数金额"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                className="rounded-xl"
                min="0"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">备注（选填）</label>
              <Input
                placeholder="如：手动补录、初始市值等"
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                className="rounded-xl"
              />
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <Button
              variant="outline"
              className="flex-1 rounded-xl"
              onClick={() => setShowEditDialog(false)}
            >
              取消
            </Button>
            <Button
              className="flex-1 rounded-xl bg-red-600 hover:bg-red-700 text-white"
              onClick={handleSave}
              disabled={upsertMutation.isPending}
            >
              {upsertMutation.isPending ? "保存中..." : "保存"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent className="mx-4 rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              删除后该条手动调账记录将无法恢复，确认删除吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">取消</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-red-600 hover:bg-red-700"
              onClick={() =>
                deleteTarget &&
                deleteMutation.mutate({ ledgerId, id: deleteTarget.id })
              }
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
