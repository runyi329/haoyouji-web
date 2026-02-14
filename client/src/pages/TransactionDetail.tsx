import { useState, useRef, useEffect } from "react";
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
import ReimbursementForm from "@/components/ReimbursementForm";

export default function TransactionDetail() {
  const [, params] = useRoute("/ledger/:ledgerId/transaction/:transactionId");
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  // 获取全局主题色
  const { currentTheme, customColors } = useColorTheme();
  const themeColors = customColors || currentTheme.colors;

  const ledgerId = params?.ledgerId ? parseInt(params.ledgerId) : 1;
  const transactionId = params?.transactionId ? parseInt(params.transactionId) : 1;

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
  
  // ========== 报销功能状态（全新实现）==========
  const [showReimbursementForm, setShowReimbursementForm] = useState(false);
  const [rbDialogOpen, setRbDialogOpen] = useState(false);
  const [rbNote, setRbNote] = useState('');
  const [rbVoucher, setRbVoucher] = useState<string | null>(null);
  // 本地状态：用于在保存成功后立即更新UI
  const [rbLocalStatus, setRbLocalStatus] = useState<string | null>(null);
  const rbFileRef = useRef<HTMLInputElement>(null);
  const [rbPreviewOpen, setRbPreviewOpen] = useState(false);
  const [rbPreviewUrl, setRbPreviewUrl] = useState('');

  // 当transaction数据加载/更新后，同步本地状态
  useEffect(() => {
    if (transaction) {
      setRbLocalStatus(transaction.reimbursementStatus || 'none');
    }
  }, [transaction]);

  // 当前显示的报销状态（优先使用本地状态）
  const displayStatus = rbLocalStatus || transaction?.reimbursementStatus || 'none';

  // 获取报销历史记录
  const { data: rbHistory, refetch: refetchRbHistory } = trpc.ledger.getReimbursementHistory.useQuery(
    { recordId: transactionId },
    { enabled: rbDialogOpen } // 只在对话框打开时查询
  );

  // tRPC mutation
  const rbMutation = trpc.ledger.manageReimbursement.useMutation({
    onSuccess: (data) => {
      console.log('[rbMutation] onSuccess:', data);
      setRbLocalStatus('completed');
      toast.success('报销处理成功');
      setRbDialogOpen(false);
      // 清空输入
      setRbNote('');
      setRbVoucher(null);
      refetch();
      refetchRbHistory();
    },
    onError: (err) => {
      console.error('[rbMutation] onError:', err);
      toast.error(err.message || '操作失败');
    },
  });

  // 申请报销mutation
  const applyReimbursementMutation = trpc.ledger.updateTransaction.useMutation({
    onSuccess: () => {
      setRbLocalStatus('pending');
      toast.success('报销申请已提交');
      setShowReimbursementForm(false);
      refetch();
    },
    onError: (err) => {
      toast.error(err.message || '提交失败');
    },
  });

  // 处理报销申请提交
  const handleReimbursementSubmit = (data: {
    content: string;
    amount: number;
    receiptCount: number;
    notes: string;
    voucherImage?: string;
  }) => {
    applyReimbursementMutation.mutate({
      recordId: transactionId,
      description: `[报销] ${data.content}${data.notes ? ' | 备注: ' + data.notes : ''} | 单据${data.receiptCount}张`,
      reimbursementStatus: 'pending' as const,
    });
  };

  // 打开报销对话框
  const openRbDialog = () => {
    // 新增记录时清空输入框（不加载旧数据）
    setRbNote('');
    setRbVoucher(null);
    setRbDialogOpen(true);
  };

  // 保存报销（新增一条处理记录）
  const handleRbSave = () => {
    if (!rbNote && !rbVoucher) {
      toast.error('请填写备注或上传凭证');
      return;
    }
    console.log('[handleRbSave] 调用mutation', {
      recordId: transactionId,
      status: 'completed',
      notes: rbNote,
      hasVoucher: !!rbVoucher,
    });
    rbMutation.mutate({
      recordId: transactionId,
      status: 'completed' as const,
      notes: rbNote || undefined,
      voucherImage: rbVoucher || undefined,
    });
  };

  // 处理凭证图片上传
  const handleRbVoucherUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      toast.loading('正在上传图片...');
      const { autoCompressImage } = await import('@/utils/imageUtils');
      const { base64 } = await autoCompressImage(file, 'normal');
      setRbVoucher(base64);
      toast.dismiss();
      toast.success('图片上传成功');
    } catch (error) {
      toast.dismiss();
      toast.error('图片上传失败');
    }
  };

  // 格式化时间
  const formatTime = (timeStr: string | null) => {
    if (!timeStr) return '未知时间';
    try {
      const d = new Date(timeStr);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    } catch {
      return timeStr;
    }
  };
  // ========== 报销功能状态结束 ==========

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
    const rule = approvalRules.find(r => r.recorderId === transaction.createdBy);
    if (rule) {
      return rule.approverIds.includes(user.id);
    }
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

  // 是否是管理员/所有者
  const isAdminOrOwner = ledgerData?.userRole === 'admin' || ledgerData?.userRole === 'owner';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部导航栏 */}
      <div style={{ backgroundColor: `${themeColors.primary}30`, color: themeColors.text }}>
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => setLocation(`/ledger/${ledgerId}`)} className="p-1">
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
                <img src={transaction.member.avatar} alt={transaction.member.nickname || '未知'} className="w-8 h-8 rounded-full object-cover" />
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

        {/* ========== 报销状态显示（全新实现）========== */}
        {displayStatus !== 'none' && (
          isAdminOrOwner ? (
            <div 
              className="flex items-center justify-between py-3 px-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 active:bg-gray-100"
              onClick={openRbDialog}
            >
              <span className="text-sm text-gray-600">报销状态</span>
              {displayStatus === 'completed' ? (
                <span className="text-sm font-medium text-green-600">已经处理</span>
              ) : (
                <span className="text-sm font-medium text-blue-600">等待报销</span>
              )}
            </div>
          ) : (
            <DetailItem 
              label="报销状态" 
              value={displayStatus === 'pending' ? '待报销' : displayStatus === 'completed' ? '已报销' : ''}
            />
          )
        )}
        {/* ========== 报销状态显示结束 ========== */}

        {transaction.images && transaction.images.length > 0 ? (
          <div className="flex items-start justify-between py-3 px-4 border-b border-gray-100">
            <span className="text-xs text-gray-500">凭证图片</span>
            <div className="flex-1 flex flex-wrap justify-end gap-2">
              {transaction.images.map((imageUrl: string, index: number) => (
                <img
                  key={index}
                  src={imageUrl}
                  alt={`凭证图片${index + 1}`}
                  className="w-16 h-16 object-cover rounded cursor-pointer border border-gray-200"
                  onClick={() => {
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
                <img src={transaction.member.avatar} alt={transaction.member.nickname || '未知'} className="w-8 h-8 rounded-full object-cover" />
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

      {(transaction.approvalStatus !== 'pending' || !isApprover()) && (
        <div className="bg-white px-4 py-3 space-y-3">
          {/* 申请报销按钮 - 只在未报销状态显示 */}
          {displayStatus === 'none' && transaction.type === 'expense' && (
            <button 
              onClick={() => setShowReimbursementForm(true)}
              className="w-full py-3 bg-[#A80000] hover:bg-[#8a0000] text-white rounded-lg font-medium text-base transition-colors"
            >
              申请报销
            </button>
          )}
          <button 
            onClick={() => setLocation(`/ledger/${ledgerId}/add?edit=${transactionId}`)}
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
            <DialogTitle>{approvalAction === 'approved' ? '通过审批' : '拒绝审批'}</DialogTitle>
            <DialogDescription>
              {approvalAction === 'approved' 
                ? '确认通过这笔记账吗？通过后将计入收支统计。'
                : '确认拒绝这笔记账吗？拒绝后将不计入收支统计。'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm text-gray-600 mb-2 block">审批意见（可选）</label>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="输入审批意见..." className="min-h-[100px]" />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowApprovalDialog(false)}>取消</Button>
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
      
      {/* ========== 报销管理对话框（全新实现）========== */}
      <Dialog open={rbDialogOpen} onOpenChange={setRbDialogOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto top-[5%] translate-y-0">
          <DialogHeader>
            <DialogTitle>报销管理</DialogTitle>
            <DialogDescription>
              {displayStatus === 'completed' 
                ? '查看处理记录，可新增处理记录' 
                : '处理该账目的报销申请'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            {/* ===== 历史处理记录 ===== */}
            {rbHistory && rbHistory.length > 0 && (
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">处理记录</label>
                <div className="space-y-3">
                  {rbHistory.map((record: any, idx: number) => (
                    <div key={record.id || idx} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-800">{record.operatedBy}</span>
                        <span className="text-xs text-gray-400">{formatTime(record.createdAt)}</span>
                      </div>
                      {record.notes && (
                        <p className="text-sm text-gray-600 mt-1">{record.notes}</p>
                      )}
                      {record.voucherUrl && (
                        <img 
                          src={record.voucherUrl} 
                          alt="凭证" 
                          className="mt-2 w-16 h-16 object-cover rounded border border-gray-300 cursor-pointer"
                          onClick={() => { setRbPreviewUrl(record.voucherUrl); setRbPreviewOpen(true); }}
                        />
                      )}
                      {!record.notes && !record.voucherUrl && (
                        <p className="text-xs text-gray-400 mt-1">标记为已处理（无备注）</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ===== 分割线 ===== */}
            {rbHistory && rbHistory.length > 0 && (
              <div className="border-t border-gray-200 pt-3">
                <label className="text-sm font-medium text-gray-700 mb-2 block">新增处理记录</label>
              </div>
            )}

            {/* ===== 新增处理记录输入区 ===== */}
            <div>
              {!(rbHistory && rbHistory.length > 0) && (
                <label className="text-sm text-gray-600 mb-2 block">报销备注</label>
              )}
              <Textarea
                value={rbNote}
                onChange={(e) => setRbNote(e.target.value)}
                placeholder="输入报销备注..."
                className="min-h-[70px]"
              />
            </div>
            
            {/* 上传凭证 */}
            <div>
              <input
                ref={rbFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleRbVoucherUpload}
              />
              <div className="flex items-start gap-3">
                {rbVoucher ? (
                  <>
                    <div 
                      className="relative w-16 h-16 bg-gray-100 rounded overflow-hidden cursor-pointer border border-gray-300 flex-shrink-0"
                      onClick={() => { setRbPreviewUrl(rbVoucher); setRbPreviewOpen(true); }}
                    >
                      <img src={rbVoucher} alt="报销凭证" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 flex flex-col gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => rbFileRef.current?.click()} className="w-full text-xs">
                        重新上传凭证
                      </Button>
                    </div>
                  </>
                ) : (
                  <Button type="button" variant="outline" size="sm" onClick={() => rbFileRef.current?.click()} className="w-full text-xs">
                    上传凭证（可选）
                  </Button>
                )}
              </div>
            </div>
          </div>
          
          <DialogFooter className="flex flex-row gap-2">
            <Button variant="outline" onClick={() => setRbDialogOpen(false)} className="flex-1">
              取消
            </Button>
            <Button 
              onClick={handleRbSave}
              disabled={rbMutation.isPending}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {rbMutation.isPending ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* 图片预览对话框 */}
      <Dialog open={rbPreviewOpen} onOpenChange={setRbPreviewOpen}>
        <DialogContent className="max-w-4xl w-full p-0 bg-transparent border-none">
          <div className="relative">
            <img src={rbPreviewUrl} alt="预览" className="w-full h-auto max-h-[90vh] object-contain rounded-lg" />
            <Button variant="outline" size="icon" className="absolute top-4 right-4 bg-white hover:bg-gray-100" onClick={() => setRbPreviewOpen(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 电子报销单申请表 */}
      <ReimbursementForm
        open={showReimbursementForm}
        onOpenChange={setShowReimbursementForm}
        transactionDate={transaction?.date}
        transactionCategory={transaction?.category}
        transactionSubcategory={transaction?.subcategory}
        transactionAmount={transaction?.amount}
        transactionDescription={transaction?.description}
        transactionType={transaction?.type}
        onSubmit={handleReimbursementSubmit}
        isPending={applyReimbursementMutation.isPending}
      />
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
