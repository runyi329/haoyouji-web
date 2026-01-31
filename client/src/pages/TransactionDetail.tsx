import { useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { ChevronLeft, ChevronRight, Edit, Image, PenTool, Check, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/_core/hooks/useAuth";

export default function TransactionDetail() {
  const [, params] = useRoute("/ledger/:ledgerId/transaction/:transactionId");
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const ledgerId = params?.ledgerId ? parseInt(params.ledgerId) : 1;
  const transactionId = params?.transactionId ? parseInt(params.transactionId) : 1;

  // 获取记账详情
  const { data: transaction, isLoading, refetch } = trpc.ledger.getTransactionDetail.useQuery({
    ledgerId,
    transactionId,
  });

  // 获取审批规则（判断当前用户是否是审批人）
  const { data: approvalRules } = trpc.ledger.getApprovalRules.useQuery({
    ledgerId,
  });

  // 审批对话框状态
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [approvalAction, setApprovalAction] = useState<'approved' | 'rejected'>('approved');
  const [comment, setComment] = useState('');

  // 审批mutation
  const approveMutation = trpc.ledger.approveTransaction.useMutation({
    onSuccess: () => {
      toast.success(approvalAction === 'approved' ? "审批已通过" : "审批已拒绝");
      setShowApprovalDialog(false);
      setComment('');
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "操作失败");
    },
  });

  // 处理审批
  const handleApprove = (action: 'approved' | 'rejected') => {
    setApprovalAction(action);
    setShowApprovalDialog(true);
  };

  const confirmApproval = () => {
    approveMutation.mutate({
      ledgerId,
      recordId: transactionId,
      action: approvalAction,
      comment: comment || undefined,
    });
  };

  // 判断当前用户是否是审批人
  const isApprover = () => {
    if (!user || !transaction || !approvalRules) return false;
    
    // 查找记账人的审批规则
    const rule = approvalRules.find(r => r.recorderId === transaction.createdBy);
    if (rule) {
      // 检查当前用户是否在审批人列表中
      return rule.approverIds.includes(user.id);
    }
    
    // 如果没有特殊规则，检查全体成员规则
    const defaultRule = approvalRules.find(r => r.recorderId === null);
    if (defaultRule) {
      return defaultRule.approverIds.includes(user.id);
    }
    
    return false;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">加载中...</div>
      </div>
    );
  }

  if (!transaction) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">账目不存在</div>
      </div>
    );
  }

  // 获取审批状态文本
  const getApprovalStatusText = () => {
    switch (transaction.approvalStatus) {
      case 'pending':
        return '未计入收支，等待审批';
      case 'approved':
        return '计入收支';
      case 'rejected':
        return '已拒绝，未计入收支';
      case 'not_required':
      default:
        return '计入收支';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部导航栏 */}
      <div className="bg-[#bde4f4] text-[#404969]">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}`)}
            className="p-1"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-medium">账目详细</h1>
          <div className="w-6"></div>
        </div>
      </div>

      {/* 第一行信息 */}
      <div className="bg-white px-4 py-3 flex items-center justify-between border-b border-gray-200">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>日志</span>
          <span>成员 {transaction.member?.nickname || '未知'}</span>
          <span>添加</span>
          <span>账目</span>
        </div>
        <ChevronRight className="w-5 h-5 text-gray-400" />
      </div>

      {/* 分类信息卡片 */}
      <div className="bg-white px-4 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-3 h-3 rounded-full ${transaction.type === 'expense' ? 'bg-red-500' : 'bg-green-500'}`}></span>
          <span className="text-lg text-gray-900">
            {transaction.category}
            {transaction.subcategory && `–${transaction.subcategory}`}
          </span>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500 mb-1">
            {transaction.type === "expense" ? "支出" : "收入"}
          </div>
          <div className="text-3xl font-medium text-gray-900">
            {transaction.amount}
          </div>
        </div>
      </div>

      {/* 详细信息列表 */}
      <div className="bg-white mt-3">
        <DetailItem label="账户" value="现金" />
        <DetailItem
          label={transaction.type === 'expense' ? "支出人" : "收入人"}
          rightContent={
            <div className="flex items-center gap-2">
              {transaction.member?.avatar ? (
                <img
                  src={transaction.member.avatar}
                  alt={transaction.member.nickname || '未知'}
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-blue-400 flex items-center justify-center text-white text-sm">
                  {transaction.member?.nickname ? transaction.member.nickname.charAt(0) : 'U'}
                </div>
              )}
              <span className="text-gray-900">{transaction.member?.nickname || '未知'}</span>
            </div>
          }
        />
        <DetailItem label="日期" value={transaction.date} />
        <DetailItem label="备注" value={transaction.description || "未填写"} />
        {transaction.imageUrl ? (
          <div className="flex items-center justify-between py-3 px-4 border-b border-gray-100">
            <span className="text-xs text-gray-500">凭证图片</span>
            <div className="flex-1 flex justify-end">
              <img
                src={transaction.imageUrl}
                alt="凭证图片"
                className="w-20 h-20 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => {
                  // 点击放大图片
                  const dialog = document.createElement('div');
                  dialog.className = 'fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-4';
                  dialog.onclick = () => dialog.remove();
                  const img = document.createElement('img');
                  img.src = transaction.imageUrl;
                  img.className = 'max-w-full max-h-full object-contain';
                  dialog.appendChild(img);
                  document.body.appendChild(dialog);
                }}
              />
            </div>
          </div>
        ) : (
          <DetailItem label="凭证图片" value="未上传" />
        )}
      </div>

      {/* 添加信息 */}
      <div className="bg-white mt-3">
        <DetailItem
          label="添加人"
          rightContent={
            <div className="flex items-center gap-2">
              {transaction.member?.avatar ? (
                <img
                  src={transaction.member.avatar}
                  alt={transaction.member.nickname || '未知'}
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-blue-400 flex items-center justify-center text-white text-sm">
                  {transaction.member?.nickname ? transaction.member.nickname.charAt(0) : 'U'}
                </div>
              )}
              <span className="text-gray-900">{transaction.member?.nickname || '未知'}</span>
            </div>
          }
        />
        <DetailItem label="添加时间" value={transaction.createdAt} />
        <DetailItem label="添加来源" value="手动记账" />
        <DetailItem 
          label="入账状态" 
          value={getApprovalStatusText()}
          highlight={transaction.approvalStatus === 'pending'}
        />
      </div>

      {/* 审批信息（待审批状态显示） */}
      {transaction.approvalStatus === 'pending' && isApprover() && (
        <div className="bg-white mt-3 px-4 py-3">
          <div className="text-sm font-medium text-gray-900 mb-3">审批信息</div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-white text-sm">
              {transaction.member?.nickname ? transaction.member.nickname.charAt(0) : 'U'}
            </div>
            <span className="text-gray-900">{transaction.member?.nickname || '未知'}</span>
          </div>
        </div>
      )}

      {/* 底部按钮区域 */}
      <div className="flex-1"></div>
      
      {/* 审批按钮（待审批状态且当前用户是审批人时显示） */}
      {transaction.approvalStatus === 'pending' && isApprover() && (
        <div className="bg-white px-4 py-3">
          <button 
            onClick={() => handleApprove('approved')}
            className="w-full py-3 bg-[#5b8ff9] hover:bg-[#4a7dd9] text-white rounded-lg font-medium text-base"
          >
            通过审批
          </button>
        </div>
      )}

      {/* 修改/删除按钮（非待审批状态或不是审批人时显示） */}
      {(transaction.approvalStatus !== 'pending' || !isApprover()) && (
        <div className="bg-white px-4 py-3 space-y-3">
          <button className="w-full py-3 bg-white border border-gray-300 rounded-lg text-gray-900 font-medium text-base">
            修改账目
          </button>
          <button className="w-full py-3 bg-[#ff7f50] hover:bg-[#bde4f4] text-white hover:text-[#404969] rounded-lg font-medium text-base">
            删除账目
          </button>
        </div>
      )}

      {/* 底部工具栏 */}
      <div className="bg-white border-t border-gray-200 px-4 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2 flex-1">
          <Edit className="w-5 h-5 text-gray-600" />
          <span className="text-sm text-gray-600">给账目写文字评论</span>
          <span className="text-xs text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded ml-auto">
            VIP
          </span>
        </div>
        <button className="p-2">
          <Image className="w-5 h-5 text-gray-600" />
        </button>
        <button className="flex items-center gap-1 text-sm text-gray-900">
          <PenTool className="w-4 h-4" />
          <span>手写签字</span>
        </button>
      </div>

      {/* 审批对话框 */}
      <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {approvalAction === 'approved' ? '通过审批' : '拒绝审批'}
            </DialogTitle>
            <DialogDescription>
              {approvalAction === 'approved' 
                ? '确认通过这笔记账吗？通过后将计入收支统计。'
                : '确认拒绝这笔记账吗？拒绝后将不计入收支统计。'
              }
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm text-gray-600 mb-2 block">审批意见（可选）</label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="输入审批意见..."
              className="min-h-[100px]"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowApprovalDialog(false)}>
              取消
            </Button>
            <Button 
              onClick={confirmApproval}
              disabled={approveMutation.isPending}
              className={approvalAction === 'approved' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
            >
              {approveMutation.isPending ? '处理中...' : '确认'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// 详细信息项组件
interface DetailItemProps {
  label: string;
  value?: string;
  rightContent?: React.ReactNode;
  highlight?: boolean;
}

function DetailItem({ label, value, rightContent, highlight }: DetailItemProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 last:border-b-0">
      <span className="text-sm text-gray-600">{label}</span>
      {rightContent ? (
        rightContent
      ) : (
        <span className={`text-sm ${highlight ? 'text-orange-600 font-medium' : 'text-gray-900'}`}>
          {value}
        </span>
      )}
    </div>
  );
}
