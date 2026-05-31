import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeft, Check, X, Building2, User, Clock, FileText, History, Coins } from "lucide-react";
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
import { PageTag } from "@/components/PageTag";

export default function LedgerPendingApprovals() {
  const [, params] = useRoute("/ledger/:id/pending-approvals");
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 0;

  const [activeTab, setActiveTab] = useState<'pending' | 'history' | 'changes'>('pending');
  const [showChangeReviewDialog, setShowChangeReviewDialog] = useState(false);
  const [selectedChangeRequest, setSelectedChangeRequest] = useState<any>(null);
  const [changeReviewAction, setChangeReviewAction] = useState<'approved' | 'rejected'>('approved');
  const [changeReviewComment, setChangeReviewComment] = useState('');
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [selectedApproval, setSelectedApproval] = useState<any>(null);
  const [approvalAction, setApprovalAction] = useState<'approved' | 'rejected'>('approved');
  const [comment, setComment] = useState('');

  // 获取待审批列表
  const { data: pendingApprovals = [], refetch, isLoading, error } = trpc.ledger.getPendingApprovals.useQuery(
    { ledgerId },
    { enabled: !!ledgerId }
  );

  // 获取已审批历史
  const { data: historyData, isLoading: historyLoading, refetch: refetchHistory } = trpc.ledger.getApprovalHistory.useQuery(
    { ledgerId, page: 1, pageSize: 50 },
    { enabled: !!ledgerId && activeTab === 'history' }
  );
  const historyList = historyData?.list ?? [];

  // 获取变更申请列表
  const { data: changeRequests = [], refetch: refetchChangeRequests, isLoading: changeRequestsLoading } = trpc.ledger.getChangeRequests.useQuery(
    { ledgerId, status: 'pending' },
    { enabled: !!ledgerId }
  );

  // 审批变更申请
  const reviewChangeRequestMutation = trpc.ledger.reviewChangeRequest.useMutation({
    onSuccess: (data: any) => {
      if (changeReviewAction === 'approved') {
        if (selectedChangeRequest?.requestType === 'delete' && data?.rewardClawbackAmount) {
          toast.success(`变更申请已通过，已扣回 ${data.rewardClawbackAmount} USDT 奖励`);
        } else {
          toast.success('变更申请已通过');
        }
      } else {
        toast.success('变更申请已拒绝');
      }
      setShowChangeReviewDialog(false);
      setSelectedChangeRequest(null);
      setChangeReviewComment('');
      refetchChangeRequests();
    },
    onError: (error) => {
      toast.error(error.message || '操作失败');
    },
  });

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
      refetchHistory();
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
      <PageTag code="P129" />
      {/* 顶部导航 */}
      <div className="bg-[#D32F2F] text-white p-4 flex items-center sticky top-0 z-10">
        <button
          onClick={() => setLocation(`/ledger/${ledgerId}`)}
          className="mr-3"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <h1 className="text-lg font-medium">发票申请审批</h1>
        {!isLoading && (pendingApprovals as any[]).length > 0 && activeTab === 'pending' && (
          <span className="ml-2 bg-white text-[#D32F2F] text-xs font-bold px-2 py-0.5 rounded-full">
            {(pendingApprovals as any[]).length}
          </span>
        )}
      </div>

      {/* Tab 切换 */}
      <div className="bg-white border-b border-gray-200 flex sticky top-[60px] z-10">
        <button
          onClick={() => setActiveTab('pending')}
          className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
            activeTab === 'pending'
              ? 'border-[#D32F2F] text-[#D32F2F]'
              : 'border-transparent text-gray-500'
          }`}
        >
          <Clock className="h-4 w-4" />
          待审批
          {(pendingApprovals as any[]).length > 0 && (
            <span className="bg-[#D32F2F] text-white text-xs px-1.5 py-0.5 rounded-full leading-none">
              {(pendingApprovals as any[]).length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
            activeTab === 'history'
              ? 'border-[#D32F2F] text-[#D32F2F]'
              : 'border-transparent text-gray-500'
          }`}
        >
          <History className="h-4 w-4" />
          已审批历史
        </button>
        <button
          onClick={() => setActiveTab('changes')}
          className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
            activeTab === 'changes'
              ? 'border-[#D32F2F] text-[#D32F2F]'
              : 'border-transparent text-gray-500'
          }`}
        >
          <FileText className="h-4 w-4" />
          变更申请
          {(changeRequests as any[]).length > 0 && (
            <span className="bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded-full leading-none">
              {(changeRequests as any[]).length}
            </span>
          )}
        </button>
      </div>

      {/* 内容区域 */}
      <div className="p-4 max-w-lg mx-auto">

        {/* ===== 待审批 Tab ===== */}
        {activeTab === 'pending' && (
          <>
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
                        <span className="flex items-center gap-1 text-xs text-amber-600">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block"></span>
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
          </>
        )}

        {/* ===== 变更申请 Tab ===== */}
        {activeTab === 'changes' && (
          <>
            {changeRequestsLoading ? (
              <div className="text-center py-12 text-gray-400">加载中...</div>
            ) : (changeRequests as any[]).length === 0 ? (
              <Card className="bg-white p-10 text-center shadow-sm">
                <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">暂无待审批的变更申请</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {(changeRequests as any[]).map((req: any) => (
                  <Card key={req.id} className="bg-white shadow-sm overflow-hidden">
                    <div className="bg-amber-50 px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          req.requestType === 'delete' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {req.requestType === 'delete' ? '删除申请' : '修改申请'}
                        </span>
                        {req.recordAmount && (
                          <span className="text-sm font-bold text-gray-800">¥{parseFloat(req.recordAmount).toFixed(2)}</span>
                        )}
                      </div>
                      <span className="text-xs text-amber-600">待审批</span>
                    </div>
                    <div className="px-4 py-3 space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <User className="h-4 w-4 text-gray-400" />
                        <span className="text-gray-500">申请人</span>
                        <span className="text-gray-800">{req.requesterName}</span>
                      </div>
                      {req.recordDesc && (
                        <div className="flex items-center gap-2 text-sm">
                          <FileText className="h-4 w-4 text-gray-400" />
                          <span className="text-gray-500">账目备注</span>
                          <span className="text-gray-600 truncate">{req.recordDesc}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="h-4 w-4 text-gray-400" />
                        <span className="text-gray-500">申请时间</span>
                        <span className="text-gray-600">{req.requestedAt ? new Date(req.requestedAt).toLocaleString('zh-CN') : '-'}</span>
                      </div>
                      {req.requestType === 'delete' && (
                        <div className="bg-red-50 rounded-lg p-2 text-xs text-red-700">
                          ⚠️ 审批通过删除后，将自动扣回该账目对应的 USDT 奖励
                        </div>
                      )}
                    </div>
                    <div className="px-4 pb-3 flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 border-red-200 text-red-600 hover:bg-red-50"
                        onClick={() => { setSelectedChangeRequest(req); setChangeReviewAction('rejected'); setShowChangeReviewDialog(true); }}
                      >
                        <X className="h-3.5 w-3.5 mr-1" />拒绝
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 bg-[#4CAF50] hover:bg-[#43A047] text-white"
                        onClick={() => { setSelectedChangeRequest(req); setChangeReviewAction('approved'); setShowChangeReviewDialog(true); }}
                      >
                        <Check className="h-3.5 w-3.5 mr-1" />通过
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {/* ===== 已审批历史 Tab ===== */}
        {activeTab === 'history' && (
          <>
            {historyLoading ? (
              <div className="text-center py-12 text-gray-400">加载中...</div>
            ) : historyList.length === 0 ? (
              <Card className="bg-white p-10 text-center shadow-sm">
                <History className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">暂无已审批记录</p>
              </Card>
            ) : (
              <>
                {/* 汇总：已通过总额 + 已发放USDT */}
                {(() => {
                  const approved = historyList.filter((r: any) => r.ajStatus === 'approved');
                  const totalCny = approved.reduce((s: number, r: any) => s + (r.reimbursementAmount ?? r.amount ?? 0), 0);
                  const totalUsdt = approved.reduce((s: number, r: any) => s + (r.usdtRewarded ?? 0), 0);
                  return approved.length > 0 ? (
                    <div className="bg-gradient-to-r from-[#D32F2F] to-[#E53935] rounded-xl p-4 mb-4 text-white">
                      <div className="text-xs opacity-80 mb-1">已通过审批汇总</div>
                      <div className="flex items-end justify-between">
                        <div>
                          <div className="text-2xl font-bold">¥{totalCny.toFixed(2)}</div>
                          <div className="text-xs opacity-70 mt-0.5">报销总额（{approved.length} 笔）</div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold text-amber-200">{totalUsdt.toFixed(6)} USDT</div>
                          <div className="text-xs opacity-70 mt-0.5">累计发放奖励</div>
                        </div>
                      </div>
                    </div>
                  ) : null;
                })()}

                <div className="space-y-3">
                  {historyList.map((record: any) => (
                    <Card key={record.id} className="bg-white shadow-sm overflow-hidden">
                      {/* 卡片头部 */}
                      <div className={`px-4 py-3 flex items-center justify-between ${
                        record.ajStatus === 'approved' ? 'bg-green-50' : 'bg-gray-50'
                      }`}>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold text-gray-800">
                            ¥{formatAmount(record.reimbursementAmount ?? record.amount)}
                          </span>
                        </div>
                        <span className={`flex items-center gap-1 text-xs font-medium ${
                          record.ajStatus === 'approved' ? 'text-green-600' : 'text-gray-500'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full inline-block ${
                            record.ajStatus === 'approved' ? 'bg-green-500' : 'bg-gray-400'
                          }`}></span>
                          {record.ajStatus === 'approved' ? '已通过' : '已拒绝'}
                        </span>
                      </div>

                      {/* 卡片主体 */}
                      <div className="px-4 py-3 space-y-2">
                        {/* 开票单位 */}
                        {record.ajCompanyName && (
                          <div className="flex items-center gap-2 text-sm">
                            <Building2 className="h-4 w-4 text-gray-400 flex-shrink-0" />
                            <span className="text-gray-500 flex-shrink-0">开票单位</span>
                            <span className="text-gray-800 font-medium truncate">{record.ajCompanyName}</span>
                          </div>
                        )}

                        {/* 提交人 */}
                        {record.submitter && (
                          <div className="flex items-center gap-2 text-sm">
                            <User className="h-4 w-4 text-gray-400 flex-shrink-0" />
                            <span className="text-gray-500 flex-shrink-0">提交人</span>
                            <span className="text-gray-800">{record.submitter.username}</span>
                          </div>
                        )}

                        {/* 审批时间 */}
                        {record.ajApprovedAt && (
                          <div className="flex items-center gap-2 text-sm">
                            <Clock className="h-4 w-4 text-gray-400 flex-shrink-0" />
                            <span className="text-gray-500 flex-shrink-0">审批时间</span>
                            <span className="text-gray-800">{formatDateTime(record.ajApprovedAt)}</span>
                          </div>
                        )}

                        {/* 审批备注 */}
                        {record.ajApproveComment && (
                          <div className="flex items-start gap-2 text-sm">
                            <FileText className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                            <span className="text-gray-500 flex-shrink-0">审批备注</span>
                            <span className="text-gray-600">{record.ajApproveComment}</span>
                          </div>
                        )}

                        {/* USDT 奖励（仅已通过） */}
                        {record.ajStatus === 'approved' && record.usdtRewarded > 0 && (
                          <div className="flex items-center gap-2 text-sm pt-1 border-t border-gray-100 mt-1">
                            <Coins className="h-4 w-4 text-amber-500 flex-shrink-0" />
                            <span className="text-gray-500 flex-shrink-0">发放奖励</span>
                            <span className="font-semibold text-amber-600">
                              {record.usdtRewarded.toFixed(6)} USDT
                            </span>
                            <span className="text-gray-400 text-xs">
                              （¥{formatAmount(record.reimbursementAmount ?? record.amount)} × 1%）
                            </span>
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* 审批确认对话框 */}
      {/* 变更申请审批对话框 */}
      <Dialog open={showChangeReviewDialog} onOpenChange={setShowChangeReviewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {changeReviewAction === 'approved'
                ? (selectedChangeRequest?.requestType === 'delete' ? '确认删除账目' : '确认修改账目')
                : '拒绝变更申请'}
            </DialogTitle>
            <DialogDescription>
              {changeReviewAction === 'approved' && selectedChangeRequest?.requestType === 'delete'
                ? '审批通过后将删除账目并自动扣回对应的 USDT 奖励。'
                : changeReviewAction === 'approved'
                ? '审批通过后将按申请内容修改账目。'
                : '拒绝后账目保持不变。'}
            </DialogDescription>
          </DialogHeader>
          {selectedChangeRequest && (
            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">申请类型</span>
                <span className={selectedChangeRequest.requestType === 'delete' ? 'text-red-600 font-medium' : 'text-blue-600 font-medium'}>
                  {selectedChangeRequest.requestType === 'delete' ? '删除账目' : '修改账目'}
                </span>
              </div>
              {selectedChangeRequest.recordAmount && (
                <div className="flex justify-between">
                  <span className="text-gray-500">账目金额</span>
                  <span className="font-semibold text-[#D32F2F]">¥{parseFloat(selectedChangeRequest.recordAmount).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">申请人</span>
                <span className="text-gray-700">{selectedChangeRequest.requesterName}</span>
              </div>
            </div>
          )}
          <div className="py-2">
            <label className="text-sm font-medium text-gray-700 mb-2 block">审批备注（可选）</label>
            <Textarea
              value={changeReviewComment}
              onChange={(e) => setChangeReviewComment(e.target.value)}
              placeholder={changeReviewAction === 'approved' ? '添加审批意见...' : '请说明拒绝原因...'}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowChangeReviewDialog(false)}>取消</Button>
            <Button
              onClick={() => {
                if (selectedChangeRequest) {
                  reviewChangeRequestMutation.mutate({
                    requestId: selectedChangeRequest.id,
                    action: changeReviewAction,
                    comment: changeReviewComment || undefined,
                  });
                }
              }}
              disabled={reviewChangeRequestMutation.isPending}
              className={changeReviewAction === 'approved' ? 'bg-[#4CAF50] hover:bg-[#43A047] text-white' : 'bg-[#D32F2F] hover:bg-[#C62828] text-white'}
            >
              {reviewChangeRequestMutation.isPending ? '处理中...' : '确认'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
