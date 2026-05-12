import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeft, Check, X, Building2, User, Clock, FileText } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { UserAvatar } from "@/components/UserAvatar";

export default function LedgerPendingApprovals() {
  const [, params] = useRoute("/ledger/:id/pending-approvals");
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 0;

  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [selectedApproval, setSelectedApproval] = useState<any>(null);
  const [approvalAction, setApprovalAction] = useState<'approved' | 'rejected'>('approved');
  const [comment, setComment] = useState('');

  // 获取待审批列表
  const { data: pendingApprovals = [], refetch, isLoading, error } = trpc.ledger.getPendingApprovals.useQuery(
    { ledgerId },
    { enabled: !!ledgerId }
  );

  // 审批mutation
  const approveMutation = trpc.ledger.approveTransaction.useMutation({
    onSuccess: (data: any) => {
      if (approvalAction === 'approved') {
        const usdt = data?.usdtRewarded;
        if (usdt && usdt > 0) {
          toast.success(`审批已通过，已向提交人发放 ${usdt} USDT 奖励`);
        } else {
          toast.success('审批已通过');
        }
      } else {
        toast.success('审批已拒绝');
      }
      setShowApprovalDialog(false);
      setSelectedApproval(null);
      setComment('');
      refetch();
    },
    onError: (err) => {
      toast.error(err.message || '操作失败');
    },
  });

  // 打开审批对话框
  const handleApprove = (approval: any, action: 'approved' | 'rejected') => {
    setSelectedApproval(approval);
    setApprovalAction(action);
    setShowApprovalDialog(true);
  };

  // 确认审批
  const confirmApproval = () => {
    if (!selectedApproval) return;
    approveMutation.mutate({
      transactionId: selectedApproval.transactionId,
      action: approvalAction,
      comment: comment || undefined,
    });
  };

  // 格式化金额
  const formatAmount = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return isNaN(num) ? '0.00' : num.toFixed(2);
  };

  // 格式化日期（完整时间）
  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 格式化日期（仅日期）
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="bg-[#D32F2F] text-white p-4 flex items-center sticky top-0 z-10">
        <button
          onClick={() => setLocation(`/ledger/${ledgerId}`)}
          className="mr-3"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <h1 className="text-lg font-medium">发票申请审批</h1>
        {!isLoading && (pendingApprovals as any[]).length > 0 && (
          <span className="ml-2 bg-white text-[#D32F2F] text-xs font-bold px-2 py-0.5 rounded-full">
            {(pendingApprovals as any[]).length}
          </span>
        )}
      </div>

      {/* 内容区域 */}
      <div className="p-4 max-w-lg mx-auto">
        {isLoading ? (
          <div className="text-center py-12 text-gray-400">加载中...</div>
        ) : error ? (
          <Card className="bg-white p-6 text-center">
            <p className="text-red-500 text-sm">{(error as any).message || '加载失败，请重试'}</p>
            <Button variant="outline" className="mt-3" onClick={() => refetch()}>重试</Button>
          </Card>
        ) : (pendingApprovals as any[]).length === 0 ? (
          <Card className="bg-white p-10 text-center shadow-sm">
            <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">暂无待审批的发票申请</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {(pendingApprovals as any[]).map((approval: any) => {
              const transaction = approval.transaction;
              if (!transaction) return null;

              return (
                <Card key={approval.id} className="bg-white shadow-sm overflow-hidden">
                  {/* 卡片头部：金额 + 类型 */}
                  <div className="bg-[#FFEBEE] px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-bold text-[#D32F2F]">
                        {transaction.type === 'income' ? '+' : '-'}¥{formatAmount(transaction.amount)}
                      </span>
                      <span className="text-xs bg-white text-[#D32F2F] border border-[#D32F2F]/30 px-2 py-0.5 rounded-full">
                        {transaction.type === 'income' ? '收入' : '支出'}
                      </span>
                    </div>
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                      申请中
                    </span>
                  </div>

                  {/* 卡片主体：详细信息 */}
                  <div className="px-4 py-3 space-y-2">
                    {/* 开票单位 */}
                    {transaction.ajCompanyName && (
                      <div className="flex items-center gap-2 text-sm">
                        <Building2 className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        <span className="text-gray-500 flex-shrink-0">开票单位</span>
                        <span className="text-gray-800 font-medium truncate">{transaction.ajCompanyName}</span>
                      </div>
                    )}

                    {/* 开票人 */}
                    {transaction.member && (
                      <div className="flex items-center gap-2 text-sm">
                        <UserAvatar
                          username={transaction.member.username}
                          avatar={transaction.member.avatar}
                          nickname={transaction.member.nickname}
                          size="sm"
                        />
                        <span className="text-gray-500 flex-shrink-0">开票人</span>
                        <span className="text-gray-800">
                          {transaction.member.nickname || transaction.member.username}
                        </span>
                      </div>
                    )}

                    {/* 开票时间 */}
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      <span className="text-gray-500 flex-shrink-0">开票时间</span>
                      <span className="text-gray-800">
                        {transaction.date ? formatDate(transaction.date) : ''}
                        {transaction.createdAt && (
                          <span className="text-gray-400 ml-1 text-xs">
                            {new Date(transaction.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </span>
                    </div>

                    {/* 备注 */}
                    {transaction.description && (
                      <div className="flex items-start gap-2 text-sm">
                        <FileText className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                        <span className="text-gray-500 flex-shrink-0">备注</span>
                        <span className="text-gray-600">{transaction.description}</span>
                      </div>
                    )}
                  </div>

                  {/* 审批按钮 */}
                  <div className="flex gap-2 px-4 py-3 border-t border-gray-100">
                    <Button
                      onClick={() => handleApprove(approval, 'approved')}
                      className="flex-1 bg-[#4CAF50] hover:bg-[#43A047] text-white"
                      disabled={approveMutation.isPending}
                    >
                      <Check className="h-4 w-4 mr-1" />
                      通过
                    </Button>
                    <Button
                      onClick={() => handleApprove(approval, 'rejected')}
                      className="flex-1 bg-[#D32F2F] hover:bg-[#C62828] text-white"
                      disabled={approveMutation.isPending}
                    >
                      <X className="h-4 w-4 mr-1" />
                      拒绝
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* 审批确认对话框 */}
      <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {approvalAction === 'approved' ? '通过发票申请' : '拒绝发票申请'}
            </DialogTitle>
            <DialogDescription>
              {approvalAction === 'approved'
                ? '确认通过这笔发票申请吗？'
                : '确认拒绝这笔发票申请吗？'}
            </DialogDescription>
          </DialogHeader>

          {selectedApproval?.transaction && (
            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">金额</span>
                <span className="font-semibold text-[#D32F2F]">
                  ¥{formatAmount(selectedApproval.transaction.amount)}
                </span>
              </div>
              {approvalAction === 'approved' && (
                <div className="flex justify-between items-center pt-1 border-t border-gray-200 mt-1">
                  <span className="text-gray-500">预计发放奖励</span>
                  <span className="font-semibold text-amber-600">
                    ≈ {(parseFloat(String(selectedApproval.transaction.reimbursementAmount || selectedApproval.transaction.amount || 0)) * 0.01 / 7.2).toFixed(6)} USDT
                    <span className="text-gray-400 font-normal ml-1">(金额×1%)</span>
                  </span>
                </div>
              )}
              {selectedApproval.transaction.ajCompanyName && (
                <div className="flex justify-between">
                  <span className="text-gray-500">开票单位</span>
                  <span className="text-gray-700">{selectedApproval.transaction.ajCompanyName}</span>
                </div>
              )}
              {selectedApproval.transaction.member && (
                <div className="flex justify-between">
                  <span className="text-gray-500">开票人</span>
                  <span className="text-gray-700">
                    {selectedApproval.transaction.member.nickname || selectedApproval.transaction.member.username}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="py-2">
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              审批备注（可选）
            </label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={approvalAction === 'approved' ? '添加审批意见...' : '请说明拒绝原因...'}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowApprovalDialog(false)}
            >
              取消
            </Button>
            <Button
              onClick={confirmApproval}
              disabled={approveMutation.isPending}
              className={approvalAction === 'approved'
                ? 'bg-[#4CAF50] hover:bg-[#43A047] text-white'
                : 'bg-[#D32F2F] hover:bg-[#C62828] text-white'}
            >
              {approveMutation.isPending ? '处理中...' : '确认'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
