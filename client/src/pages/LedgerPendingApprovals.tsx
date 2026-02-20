import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeft, Check, X } from "lucide-react";
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

export default function LedgerPendingApprovals() {
  const [, params] = useRoute("/ledger/:id/pending-approvals");
  const [, setLocation] = useLocation();
  // toast from sonner
  const ledgerId = params?.id ? parseInt(params.id) : 0;

  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [approvalAction, setApprovalAction] = useState<'approved' | 'rejected'>('approved');
  const [comment, setComment] = useState('');

  // 获取待审批列表
  const { data: pendingApprovals = [], refetch } = trpc.ledger.getPendingApprovals.useQuery({ ledgerId });

  // 审批mutation
  const approveMutation = trpc.ledger.approveTransaction.useMutation({
    onSuccess: () => {
      toast.success(approvalAction === 'approved' ? "审批已通过" : "审批已拒绝");
      setShowApprovalDialog(false);
      setSelectedTransaction(null);
      setComment('');
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "操作失败");
    },
  });

  // 处理审批
  const handleApprove = (transaction: any, action: 'approved' | 'rejected') => {
    setSelectedTransaction(transaction);
    setApprovalAction(action);
    setShowApprovalDialog(true);
  };

  // 确认审批
  const confirmApproval = () => {
    if (!selectedTransaction) return;

    approveMutation.mutate({
      transactionId: selectedTransaction.transactionId,
      action: approvalAction,
      comment: comment || undefined,
    });
  };

  // 格式化金额
  const formatAmount = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return num.toFixed(2);
  };

  // 格式化日期
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-400 to-blue-600">
      {/* 顶部导航 */}
      <div className="bg-[#1976D2] text-white p-4 flex items-center">
        <button
          onClick={() => setLocation(`/ledger/${ledgerId}`)}
          className="mr-4"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <h1 className="text-lg font-medium">待审批记账</h1>
      </div>

      {/* 内容区域 */}
      <div className="p-4">
        {pendingApprovals.length === 0 ? (
          <Card className="bg-white p-8 text-center">
            <p className="text-gray-500">暂无待审批的记账</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {pendingApprovals.map((approval: any) => {
              const transaction = approval.transaction;
              if (!transaction) return null;

              return (
                <Card key={approval.id} className="bg-white p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-lg font-semibold ${
                          transaction.type === 'income' ? 'text-[#4CAF50]' : 'text-[#D32F2F]'
                        }`}>
                          {transaction.type === 'income' ? '+' : '-'}¥{formatAmount(transaction.amount)}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          transaction.type === 'income' 
                            ? 'bg-[#E8F5E9] text-green-700' 
                            : 'bg-[#FFEBEE] text-[#D32F2F]'
                        }`}>
                          {transaction.type === 'income' ? '收入' : '支出'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">
                        {transaction.description || '无备注'}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {formatDate(transaction.date)}
                      </p>
                    </div>
                  </div>

                  {/* 审批按钮 */}
                  <div className="flex gap-2 mt-3 pt-3 border-t">
                    <Button
                      onClick={() => handleApprove(approval, 'approved')}
                      className="flex-1 bg-[#4CAF50] hover:bg-[#4CAF50] text-white"
                      disabled={approveMutation.isPending}
                    >
                      <Check className="h-4 w-4 mr-1" />
                      通过
                    </Button>
                    <Button
                      onClick={() => handleApprove(approval, 'rejected')}
                      className="flex-1 bg-[#D32F2F] hover:bg-[#D32F2F] text-white"
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
              {approvalAction === 'approved' ? '通过审批' : '拒绝审批'}
            </DialogTitle>
            <DialogDescription>
              {approvalAction === 'approved' 
                ? '确认通过这笔记账吗？' 
                : '确认拒绝这笔记账吗？'}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              备注（可选）
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
                ? 'bg-[#4CAF50] hover:bg-[#4CAF50]' 
                : 'bg-[#D32F2F] hover:bg-[#D32F2F]'}
            >
              {approveMutation.isPending ? '处理中...' : '确认'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
