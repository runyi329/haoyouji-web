import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { ChevronLeft, Plus, Pencil, Trash2, ChevronRight, Clock, CheckCircle2, XCircle, Loader2, ArrowUpCircle } from "lucide-react";
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

  // 当前 tab：recharge=充值记录 | manual=手动调账 | withdraw=提现管理
  const [tab, setTab] = useState<"recharge" | "manual" | "withdraw">("recharge");

  // 提现管理状态
  const [withdrawFilter, setWithdrawFilter] = useState<string>("");
  const [approveDialogId, setApproveDialogId] = useState<number | null>(null);
  const [rejectDialogId, setRejectDialogId] = useState<number | null>(null);
  const [approveTxnHash, setApproveTxnHash] = useState("");
  const [approveNote, setApproveNote] = useState("");
  const [rejectNote, setRejectNote] = useState("");

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
          <button
            onClick={() => setTab("withdraw")}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              tab === "withdraw"
                ? "text-red-600 border-b-2 border-red-600"
                : "text-gray-500"
            }`}
          >
            提现管理
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

      {/* 提现管理 Tab */}
      {tab === "withdraw" && <WithdrawManageTab
        ledgerId={ledgerId}
        withdrawFilter={withdrawFilter}
        setWithdrawFilter={setWithdrawFilter}
        approveDialogId={approveDialogId}
        setApproveDialogId={setApproveDialogId}
        rejectDialogId={rejectDialogId}
        setRejectDialogId={setRejectDialogId}
        approveTxnHash={approveTxnHash}
        setApproveTxnHash={setApproveTxnHash}
        approveNote={approveNote}
        setApproveNote={setApproveNote}
        rejectNote={rejectNote}
        setRejectNote={setRejectNote}
      />}
    </div>
  );
}

// 提现管理子组件
function WithdrawManageTab({
  ledgerId,
  withdrawFilter, setWithdrawFilter,
  approveDialogId, setApproveDialogId,
  rejectDialogId, setRejectDialogId,
  approveTxnHash, setApproveTxnHash,
  approveNote, setApproveNote,
  rejectNote, setRejectNote,
}: any) {
  // 查询提现申请列表（按账本隔离）
  const { data: withdrawals, refetch: refetchWithdrawals, isLoading } = trpc.recharge.adminGetAllSntWithdrawals.useQuery(
    { status: withdrawFilter || undefined, limit: 100, ledgerId: ledgerId || undefined }
  );

  // 审核通过
  const approveMutation = trpc.recharge.adminApproveSntWithdrawal.useMutation({
    onSuccess: (data) => {
      toast.success(data.message || "审核通过");
      setApproveDialogId(null);
      setApproveTxnHash("");
      setApproveNote("");
      refetchWithdrawals();
    },
    onError: (e) => toast.error(e.message || "操作失败"),
  });

  // 拒绝
  const rejectMutation = trpc.recharge.adminRejectSntWithdrawal.useMutation({
    onSuccess: (data) => {
      toast.success(data.message || "已拒绝");
      setRejectDialogId(null);
      setRejectNote("");
      refetchWithdrawals();
    },
    onError: (e) => toast.error(e.message || "操作失败"),
  });

  // 标记处理中
  const processingMutation = trpc.recharge.adminProcessingSntWithdrawal.useMutation({
    onSuccess: (data) => {
      toast.success(data.message || "已标记为处理中");
      refetchWithdrawals();
    },
    onError: (e) => toast.error(e.message || "操作失败"),
  });

  const statusConfig: Record<string, { label: string; color: string; bgColor: string; icon: any }> = {
    pending: { label: '待审核', color: 'text-orange-700', bgColor: 'bg-orange-100', icon: Clock },
    processing: { label: '处理中', color: 'text-blue-700', bgColor: 'bg-blue-100', icon: Loader2 },
    completed: { label: '已完成', color: 'text-green-700', bgColor: 'bg-green-100', icon: CheckCircle2 },
    rejected: { label: '已拒绝', color: 'text-red-600', bgColor: 'bg-red-100', icon: XCircle },
  };

  const formatDate = (dateStr: string | Date) => {
    const date = new Date(dateStr);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${month}-${day} ${hours}:${minutes}`;
  };

  const list = withdrawals || [];

  return (
    <div className="px-4 pt-4 space-y-3">
      {/* 状态筛选 */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { value: "", label: "全部" },
          { value: "pending", label: "待审核" },
          { value: "processing", label: "处理中" },
          { value: "completed", label: "已完成" },
          { value: "rejected", label: "已拒绝" },
        ].map((item) => (
          <button
            key={item.value}
            onClick={() => setWithdrawFilter(item.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              withdrawFilter === item.value
                ? "bg-red-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* 提现列表 */}
      {isLoading ? (
        <div className="py-12 text-center text-gray-400">
          <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
          加载中...
        </div>
      ) : list.length === 0 ? (
        <div className="py-12 text-center text-gray-400">
          <ArrowUpCircle className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p>暂无提现记录</p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((item: any) => {
            const config = statusConfig[item.status] || statusConfig.pending;
            const StatusIcon = config.icon;
            return (
              <div key={item.id} className="bg-white rounded-2xl p-4 shadow-sm">
                {/* 头部：用户信息 + 状态 */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
                      {(item.userName || item.username || '?').slice(0, 1)}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">{item.userName || item.username || `用户#${item.userId}`}</div>
                      <div className="text-xs text-gray-400">ID: {item.userId}</div>
                    </div>
                  </div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.bgColor} ${config.color}`}>
                    <StatusIcon className="w-3 h-3 mr-1" />
                    {config.label}
                  </span>
                </div>

                {/* 金额和地址 */}
                <div className="space-y-1.5 mb-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">提现金额</span>
                    <span className="text-sm font-bold text-red-600">-{parseFloat(item.sntAmount).toFixed(2)} USDT</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">BSC 地址</span>
                    <span className="text-xs font-mono text-gray-600 truncate max-w-[200px]">{item.bscAddress}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">申请时间</span>
                    <span className="text-xs text-gray-600">{formatDate(item.createdAt)}</span>
                  </div>
                  {item.txnHash && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">交易哈希</span>
                      <span className="text-xs font-mono text-gray-600 truncate max-w-[200px]">{item.txnHash}</span>
                    </div>
                  )}
                  {item.adminNote && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">备注</span>
                      <span className="text-xs text-gray-600">{item.adminNote}</span>
                    </div>
                  )}
                </div>

                {/* 操作按钮 */}
                {(item.status === 'pending' || item.status === 'processing') && (
                  <div className="flex gap-2 pt-2 border-t border-gray-100">
                    {item.status === 'pending' && (
                      <button
                        onClick={() => processingMutation.mutate({ withdrawalId: item.id })}
                        disabled={processingMutation.isPending}
                        className="flex-1 py-2 text-xs font-medium text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors"
                      >
                        标记处理中
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setApproveTxnHash("");
                        setApproveNote("");
                        setApproveDialogId(item.id);
                      }}
                      className="flex-1 py-2 text-xs font-medium text-green-600 bg-green-50 rounded-xl hover:bg-green-100 transition-colors"
                    >
                      ✅ 确认已转账
                    </button>
                    <button
                      onClick={() => {
                        setRejectNote("");
                        setRejectDialogId(item.id);
                      }}
                      className="flex-1 py-2 text-xs font-medium text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
                    >
                      ❌ 拒绝退回
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 审核通过弹窗 */}
      <Dialog open={approveDialogId !== null} onOpenChange={() => setApproveDialogId(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogTitle>确认审核通过</DialogTitle>
          <div className="space-y-4 pt-2">
            <div>
              <label className="block text-sm text-gray-600 mb-1">链上交易哈希（可选）</label>
              <Input
                value={approveTxnHash}
                onChange={(e) => setApproveTxnHash(e.target.value)}
                placeholder="0x..."
                className="font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">备注（可选）</label>
              <Input
                value={approveNote}
                onChange={(e) => setApproveNote(e.target.value)}
                placeholder="审核备注"
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setApproveDialogId(null)}>取消</Button>
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700"
                disabled={approveMutation.isPending}
                onClick={() => approveDialogId && approveMutation.mutate({
                  withdrawalId: approveDialogId,
                  txnHash: approveTxnHash || undefined,
                  adminNote: approveNote || undefined,
                })}
              >
                {approveMutation.isPending ? "处理中..." : "确认通过"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 拒绝弹窗 */}
      <Dialog open={rejectDialogId !== null} onOpenChange={() => setRejectDialogId(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogTitle>拒绝提现申请</DialogTitle>
          <div className="space-y-4 pt-2">
            <div>
              <label className="block text-sm text-gray-600 mb-1">拒绝原因 <span className="text-red-500">*</span></label>
              <Input
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="请输入拒绝原因"
              />
              <p className="text-xs text-gray-400 mt-1">拒绝后将自动退回用户余额</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setRejectDialogId(null)}>取消</Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700"
                disabled={rejectMutation.isPending || !rejectNote.trim()}
                onClick={() => rejectDialogId && rejectMutation.mutate({
                  withdrawalId: rejectDialogId,
                  adminNote: rejectNote.trim(),
                })}
              >
                {rejectMutation.isPending ? "处理中..." : "确认拒绝"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
