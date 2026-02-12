import { useState, useRef } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { ChevronLeft, ChevronRight, Edit, Image, PenTool, Check, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useColorTheme } from "@/contexts/ColorThemeContext";
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

  // 获取全局主题色
  const { currentTheme, customColors } = useColorTheme();
  const themeColors = customColors || currentTheme.colors;

  const ledgerId = params?.ledgerId ? parseInt(params.ledgerId) : 1;
  const transactionId = params?.transactionId ? parseInt(params.transactionId) : 1;
  
  console.log('[TransactionDetail] params:', params, 'ledgerId:', ledgerId, 'transactionId:', transactionId);

  // 获取记账详情
  const { data: transaction, isLoading, refetch, error } = trpc.ledger.getTransactionDetail.useQuery({
    ledgerId,
    transactionId,
  });
  
  // 获取账本详情（用于判断角色）
  const { data: ledgerData } = trpc.ledger.getById.useQuery({ ledgerId });

  // 获取审批规则（判断当前用户是否是审批人）
  const { data: approvalRules } = trpc.ledger.getApprovalRules.useQuery({
    ledgerId,
  });

  // 审批对话框状态
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [approvalAction, setApprovalAction] = useState<'approved' | 'rejected'>('approved');
  const [comment, setComment] = useState('');
  
  // 报销管理对话框状态
  const [showReimbursementDialog, setShowReimbursementDialog] = useState(false);
  const [reimbursementNotes, setReimbursementNotes] = useState('');
  const [voucherImage, setVoucherImage] = useState<string | null>(null);
  const voucherInputRef = useRef<HTMLInputElement>(null);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string>('');

  // 报销管理mutation
  const manageReimbursementMutation = trpc.ledger.manageReimbursement.useMutation({
    onSuccess: () => {
      toast.success("报销状态已更新");
      setShowReimbursementDialog(false);
      setReimbursementNotes('');
      setVoucherImage(null);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "操作失败");
    },
  });
  
  // 上传图片mutation
  const uploadImageMutation = trpc.ledger.uploadLedgerImage.useMutation();
  
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

  // 获取tRPC utils用于缓存失效
  const utils = trpc.useUtils();
  
  // 删除mutation
  const deleteMutation = trpc.ledger.deleteTransaction.useMutation({
    onSuccess: () => {
      toast.success("删除成功");
      // 使缓存失效，刷新账目列表
      utils.ledger.getTransactions.invalidate({ ledgerId });
      utils.ledger.getById.invalidate({ ledgerId });
      setLocation(`/ledger/${ledgerId}`);
    },
    onError: (error) => {
      toast.error(error.message || "删除失败");
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

  console.log('[TransactionDetail] isLoading:', isLoading, 'transaction:', transaction, 'error:', error);
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">加载中...</div>
      </div>
    );
  }

  if (!transaction) {
    let errorMsg = '';
    if (error) {
      try {
        errorMsg = typeof error === 'object' && error !== null && 'message' in error 
          ? String((error as any).message) 
          : JSON.stringify(error);
      } catch (e) {
        errorMsg = String(error);
      }
    }
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">账目不存在 {errorMsg ? `(错误: ${errorMsg})` : ''}</div>
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
      <div style={{ backgroundColor: `${themeColors.primary}30`, color: themeColors.text }}>
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
          <span>成员 {transaction.member?.nickname || transaction.member?.username || '未知'}</span>
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
                  {(transaction.member?.nickname || transaction.member?.username || 'U').charAt(0)}
                </div>
              )}
              <span className="text-gray-900">{transaction.member?.nickname || transaction.member?.username || '未知'}</span>
            </div>
          }
        />
        <DetailItem label="日期" value={transaction.date} />
        <DetailItem label="备注" value={transaction.description || "未填写"} />
        {/* 报销状态 */}
        {(ledgerData?.userRole === 'admin' || ledgerData?.userRole === 'owner') ? (
          <div 
            className="flex items-center justify-between py-3 px-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50"
            onClick={() => {
              // 加载已有的报销信息
              setReimbursementNotes(transaction.reimbursementNotes || '');
              setVoucherImage(transaction.reimbursementVoucherUrl || null);
              setShowReimbursementDialog(true);
            }}
          >
            <span className="text-sm text-gray-600">报销状态</span>
            <div className="flex items-center gap-2">
              {(transaction.reimbursementStatus === 'none' || transaction.reimbursementStatus === 'pending') && (
                <span className="text-sm text-gray-900">待报销</span>
              )}
              {transaction.reimbursementStatus === 'completed' && (
                <span className="text-sm text-gray-900">已报销</span>
              )}
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </div>
          </div>
        ) : (
          <DetailItem 
            label="报销状态" 
            value={
              transaction.reimbursementStatus === 'pending' ? '💰待报销' :
              transaction.reimbursementStatus === 'completed' ? '✅已报销' :
              '无需报销'
            }
          />
        )}
        {transaction.images && transaction.images.length > 0 ? (
          <div className="flex items-start justify-between py-3 px-4 border-b border-gray-100">
            <span className="text-xs text-gray-500">凭证图片</span>
            <div className="flex-1 flex flex-wrap justify-end gap-2">
              {transaction.images.map((imageUrl: string, index: number) => (
                <img
                  key={index}
                  src={imageUrl}
                  alt={`凭证图片${index + 1}`}
                  className="w-20 h-20 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => {
                    // 点击放大图片
                    const dialog = document.createElement('div');
                    dialog.className = 'fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-4';
                    dialog.onclick = () => dialog.remove();
                    const img = document.createElement('img');
                    img.src = imageUrl;
                    img.className = 'max-w-full max-h-full object-contain';
                    dialog.appendChild(img);
                    document.body.appendChild(dialog);
                  }}
                />
              ))}
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
                  {(transaction.member?.nickname || transaction.member?.username || 'U').charAt(0)}
                </div>
              )}
              <span className="text-gray-900">{transaction.member?.nickname || transaction.member?.username || '未知'}</span>
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
              {(transaction.member?.nickname || transaction.member?.username || 'U').charAt(0)}
            </div>
            <span className="text-gray-900">{transaction.member?.nickname || transaction.member?.username || '未知'}</span>
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
          <button 
            onClick={() => {
              // 跳转到添加账目页面，传递编辑参数
              setLocation(`/ledger/${ledgerId}/add?edit=${transactionId}`);
            }}
            className="w-full py-3 bg-white border border-gray-300 rounded-lg text-gray-900 font-medium text-base"
          >
            修改账目
          </button>
          <button 
            onClick={() => {
              if (confirm('确定要删除这条账目吗？')) {
                deleteMutation.mutate({ recordId: transactionId });
              }
            }}
            className="w-full py-3 text-white hover:opacity-90 rounded-lg font-medium text-base"
            style={{ backgroundColor: themeColors.primary }}
          >
            删除账目
          </button>
        </div>
      )}



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
      
      {/* 报销管理对话框 */}
      <Dialog open={showReimbursementDialog} onOpenChange={setShowReimbursementDialog}>
        <DialogContent className="max-w-md max-h-[70vh] overflow-y-auto top-[5%] translate-y-0">
          <DialogHeader>
            <DialogTitle>报销管理</DialogTitle>
            <DialogDescription>
              管理该账目的报销状态和凭证
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* 当前状态 */}
            <div>
              <label className="text-sm text-gray-600 mb-2 block">当前状态</label>
              <div className="flex items-center gap-2">
                {transaction?.reimbursementStatus === 'pending' && (
                  <span className="px-3 py-1.5 bg-orange-500 text-white text-sm rounded">💰待报销</span>
                )}
                {transaction?.reimbursementStatus === 'completed' && (
                  <span className="px-3 py-1.5 bg-green-500 text-white text-sm rounded">✅已报销</span>
                )}
                {transaction?.reimbursementStatus === 'none' && (
                  <span className="px-3 py-1.5 bg-gray-400 text-white text-sm rounded">无需报销</span>
                )}
              </div>
            </div>
            
            {/* 报销备注 */}
            <div>
              <label className="text-sm text-gray-600 mb-2 block">报销备注</label>
              <Textarea
                value={reimbursementNotes}
                onChange={(e) => setReimbursementNotes(e.target.value)}
                placeholder="输入报销备注..."
                className="min-h-[80px]"
              />
            </div>
            
            {/* 上传凭证 */}
            <div>
              <label className="text-sm text-gray-600 mb-2 block">报销凭证</label>
              <input
                ref={voucherInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    try {
                      toast.loading('正在上传图片...');
                      const { autoCompressImage } = await import('@/utils/imageUtils');
                      const { base64 } = await autoCompressImage(file, 'normal');
                      setVoucherImage(base64);
                      toast.dismiss();
                      toast.success('图片上传成功');
                    } catch (error) {
                      toast.dismiss();
                      toast.error('图片上传失败');
                    }
                  }
                }}
              />
              <div className="flex items-start gap-3">
                {voucherImage ? (
                  <>
                    {/* 小的正方形预览图 */}
                    <div 
                      className="relative w-20 h-20 bg-gray-100 rounded overflow-hidden cursor-pointer border border-gray-300 flex-shrink-0"
                      onClick={() => {
                        setPreviewImageUrl(voucherImage);
                        setShowImagePreview(true);
                      }}
                    >
                      <img 
                        src={voucherImage} 
                        alt="报销凭证" 
                        className="w-full h-full object-cover"
                      />
                    </div>
                    {/* 按钮组 */}
                    <div className="flex-1 flex flex-col gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setPreviewImageUrl(voucherImage);
                          setShowImagePreview(true);
                        }}
                        className="w-full"
                      >
                        查看大图
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => voucherInputRef.current?.click()}
                        className="w-full"
                      >
                        重新上传
                      </Button>
                    </div>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => voucherInputRef.current?.click()}
                    className="w-full"
                  >
                    上传凭证
                  </Button>
                )}
              </div>
            </div>
            
            {/* 历史记录链接 */}            {transaction?.reimbursementStatus === 'completed' && (
              <div className="text-sm text-gray-500">
                已有报销记录，修改将被记录在历史中
              </div>
            )}
          </div>
          
          <DialogFooter className="flex flex-row gap-2">
            {/* 取消按钮 - 最左 */}
            <Button 
              variant="outline" 
              onClick={() => setShowReimbursementDialog(false)}
              className="flex-1"
            >
              取消
            </Button>
            
            {/* 删除按钮 - 中间 */}
            <Button 
              variant="destructive"
              onClick={() => {
                if (confirm('确定要删除这条账目吗？删除后无法恢复！')) {
                  deleteMutation.mutate(transactionId);
                }
              }}
              disabled={deleteMutation.isPending}
              className="flex-1"
            >
              {deleteMutation.isPending ? '删除中...' : '删除'}
            </Button>
            
            {/* 保存按钮 - 最右 */}
            <Button 
              onClick={() => {
                const currentStatus = transaction?.reimbursementStatus || 'none';
                manageReimbursementMutation.mutate({
                  recordId: transactionId,
                  status: currentStatus as 'none' | 'pending' | 'completed',
                  notes: reimbursementNotes || undefined,
                  voucherImage: voucherImage || undefined,
                });
              }}
              disabled={manageReimbursementMutation.isPending}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {manageReimbursementMutation.isPending ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* 图片预览对话框 */}
      <Dialog open={showImagePreview} onOpenChange={setShowImagePreview}>
        <DialogContent className="max-w-4xl w-full p-0 bg-transparent border-none">
          <div className="relative">
            <img 
              src={previewImageUrl} 
              alt="预览" 
              className="w-full h-auto max-h-[90vh] object-contain rounded-lg"
            />
            <Button
              variant="outline"
              size="icon"
              className="absolute top-4 right-4 bg-white hover:bg-gray-100"
              onClick={() => setShowImagePreview(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
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
