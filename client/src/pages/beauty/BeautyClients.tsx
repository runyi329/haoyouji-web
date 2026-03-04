/**
 * 奢贝美容院 - 我的客户
 * 显示邀请的客户列表，可管理积分（加/减/记录）、消费卡（增删改）、消费次数（增删改），优惠券功能预留
 * 路径: /beauty/clients
 */
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, Minus, History, Gift, Search, Star, Share2, Copy,
  CreditCard, CheckCircle, Calendar, Edit2, Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import BottomNav from "@/components/BottomNav";

// 卡类型配置
const CARD_TYPES = [
  { value: 'monthly', label: '月卡', days: 30 },
  { value: 'quarterly', label: '季卡', days: 90 },
  { value: 'semiannual', label: '半年卡', days: 180 },
  { value: 'annual', label: '年卡', days: 365 },
] as const;

type CardType = typeof CARD_TYPES[number]['value'];
type CardDialogMode = 'add' | 'edit' | 'manage';

// 积分管理弹窗的三个tab
type PointsTab = 'add' | 'subtract' | 'log';

// 消费次数管理弹窗的两个tab
type VisitTab = 'add' | 'log';

function getDaysUntilExpiry(endDate: string): number {
  const end = new Date(endDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getCardLabel(cardType: string): string {
  return CARD_TYPES.find(c => c.value === cardType)?.label ?? cardType;
}

export default function BeautyClients() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");

  // ===== 积分管理弹窗（三tab合一） =====
  const [pointsDialog, setPointsDialog] = useState(false);
  const [pointsTab, setPointsTab] = useState<PointsTab>('add');
  const [pointsUserId, setPointsUserId] = useState<number | null>(null);
  const [pointsUserName, setPointsUserName] = useState("");
  const [pointsAmount, setPointsAmount] = useState("");
  const [pointsRemark, setPointsRemark] = useState("");

  // ===== 消费卡管理弹窗 =====
  const [cardDialog, setCardDialog] = useState(false);
  const [cardDialogMode, setCardDialogMode] = useState<CardDialogMode>('add');
  const [cardUserId, setCardUserId] = useState<number | null>(null);
  const [cardUserName, setCardUserName] = useState("");
  const [editCardId, setEditCardId] = useState<number | null>(null);
  const [selectedCardType, setSelectedCardType] = useState<CardType>('monthly');
  const [cardStartDate, setCardStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [cardRemark, setCardRemark] = useState("");
  const [deleteCardConfirmDialog, setDeleteCardConfirmDialog] = useState(false);
  const [deleteCardId, setDeleteCardId] = useState<number | null>(null);

  // ===== 消费次数管理弹窗（两tab合一） =====
  const [visitDialog, setVisitDialog] = useState(false);
  const [visitTab, setVisitTab] = useState<VisitTab>('add');
  const [visitUserId, setVisitUserId] = useState<number | null>(null);
  const [visitUserName, setVisitUserName] = useState("");
  const [visitDate, setVisitDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [visitRemark, setVisitRemark] = useState("");
  // 编辑消费记录
  const [editVisitId, setEditVisitId] = useState<number | null>(null);
  const [editVisitDate, setEditVisitDate] = useState("");
  const [editVisitRemark, setEditVisitRemark] = useState("");
  const [editVisitDialog, setEditVisitDialog] = useState(false);
  const [deleteVisitConfirmDialog, setDeleteVisitConfirmDialog] = useState(false);
  const [deleteVisitId, setDeleteVisitId] = useState<number | null>(null);

  // ===== 分享弹窗 =====
  const [shareDialog, setShareDialog] = useState(false);

  // ===== 查询 =====
  const clientsQuery = trpc.beauty.points.getMyClients.useQuery(undefined, {
    refetchOnMount: 'always',
  });

  const clientIds = useMemo(() => (clientsQuery.data ?? []).map(c => c.id), [clientsQuery.data]);

  const cardsQuery = trpc.beauty.card.getClientsCards.useQuery(
    { userIds: clientIds },
    { enabled: clientIds.length > 0, refetchOnMount: 'always' }
  );

  const visitCountQuery = trpc.beauty.visit.getClientsVisitCount.useQuery(
    { userIds: clientIds },
    { enabled: clientIds.length > 0, refetchOnMount: 'always' }
  );

  // 积分日志（在积分管理弹窗的记录tab中使用）
  const logQuery = trpc.beauty.points.getPointsLog.useQuery(
    { userId: pointsUserId! },
    { enabled: pointsDialog && pointsTab === 'log' && !!pointsUserId }
  );

  // 消费次数日志（在消费次数管理弹窗的记录tab中使用）
  const visitLogQuery = trpc.beauty.visit.getVisitLog.useQuery(
    { userId: visitUserId! },
    { enabled: visitDialog && visitTab === 'log' && !!visitUserId }
  );

  // 邀请信息
  const inviteInfoQuery = trpc.invite.getMyInviteInfo.useQuery(undefined, {
    enabled: shareDialog,
  });
  const qrCodeQuery = trpc.invite.generateQRCode.useQuery(
    { inviteCode: inviteInfoQuery.data?.inviteCode || "" },
    { enabled: shareDialog && !!inviteInfoQuery.data?.inviteCode }
  );

  // ===== Mutations =====
  const adjustMutation = trpc.beauty.points.adjustPoints.useMutation({
    onSuccess: (data) => {
      const type = pointsTab === 'add' ? '增加' : '扣减';
      toast.success(`积分${type}成功，当前余额: ${data.newBalance}`);
      setPointsAmount("");
      setPointsRemark("");
      clientsQuery.refetch();
      // 切换到记录tab查看
      setPointsTab('log');
    },
    onError: (err) => toast.error(err.message),
  });

  const addCardMutation = trpc.beauty.card.addCard.useMutation({
    onSuccess: (data) => {
      toast.success(`消费卡添加成功，到期日: ${data.endDate}`);
      setCardDialog(false);
      setCardRemark("");
      cardsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateCardMutation = trpc.beauty.card.updateCard.useMutation({
    onSuccess: (data) => {
      toast.success(`消费卡已更新，到期日: ${data.endDate}`);
      setCardDialog(false);
      setCardRemark("");
      cardsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteCardMutation = trpc.beauty.card.deleteCard.useMutation({
    onSuccess: () => {
      toast.success("消费卡已删除");
      setDeleteCardConfirmDialog(false);
      setCardDialog(false);
      cardsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const addVisitMutation = trpc.beauty.visit.addVisit.useMutation({
    onSuccess: () => {
      toast.success("消费记录已添加");
      setVisitDate(new Date().toISOString().split('T')[0]);
      setVisitRemark("");
      visitCountQuery.refetch();
      // 切换到记录tab
      setVisitTab('log');
    },
    onError: (err) => toast.error(err.message),
  });

  const updateVisitMutation = trpc.beauty.visit.updateVisit.useMutation({
    onSuccess: () => {
      toast.success("消费记录已更新");
      setEditVisitDialog(false);
      visitLogQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteVisitMutation = trpc.beauty.visit.deleteVisit.useMutation({
    onSuccess: () => {
      toast.success("消费记录已删除");
      setDeleteVisitConfirmDialog(false);
      visitCountQuery.refetch();
      visitLogQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  // ===== 映射 =====
  const cardMap = useMemo(() => {
    const map: Record<number, typeof cardsQuery.data extends (infer T)[] ? T : never> = {};
    (cardsQuery.data ?? []).forEach(card => {
      if (!map[card.userId]) map[card.userId] = card;
    });
    return map;
  }, [cardsQuery.data]);

  const visitCountMap = useMemo(() => {
    const map: Record<number, number> = {};
    (visitCountQuery.data ?? []).forEach(row => {
      map[row.userId] = Number(row.count);
    });
    return map;
  }, [visitCountQuery.data]);

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => {
      toast.success(`${label}已复制`);
    }).catch(() => {
      toast.error("复制失败");
    });
  }

  const clients = clientsQuery.data ?? [];
  const filteredClients = searchTerm
    ? clients.filter((c) =>
        (c.name || c.username || "").toLowerCase().includes(searchTerm.toLowerCase())
      )
    : clients;

  // ===== 积分管理 =====
  function openPoints(userId: number, userName: string, tab: PointsTab = 'add') {
    setPointsUserId(userId);
    setPointsUserName(userName);
    setPointsTab(tab);
    setPointsAmount("");
    setPointsRemark("");
    setPointsDialog(true);
  }

  function handlePointsSubmit() {
    if (!pointsUserId || !pointsAmount) return;
    const num = parseInt(pointsAmount);
    if (isNaN(num) || num <= 0) {
      toast.error("请输入有效的正整数");
      return;
    }
    adjustMutation.mutate({
      userId: pointsUserId,
      amount: pointsTab === 'add' ? num : -num,
      remark: pointsRemark || undefined,
    });
  }

  // ===== 消费卡管理 =====
  function openCardManage(userId: number, userName: string) {
    setCardUserId(userId);
    setCardUserName(userName);
    const existingCard = cardMap[userId];
    if (existingCard) {
      setCardDialogMode('manage');
      setEditCardId(existingCard.id);
      setSelectedCardType(existingCard.cardType as CardType);
      setCardStartDate(existingCard.startDate);
      setCardRemark(existingCard.remark || "");
    } else {
      setCardDialogMode('add');
      setEditCardId(null);
      setSelectedCardType('monthly');
      setCardStartDate(new Date().toISOString().split('T')[0]);
      setCardRemark("");
    }
    setCardDialog(true);
  }

  function handleCardSubmit() {
    if (!cardUserId) return;
    if (cardDialogMode === 'add') {
      addCardMutation.mutate({
        userId: cardUserId,
        cardType: selectedCardType,
        startDate: cardStartDate,
        remark: cardRemark || undefined,
      });
    } else if (cardDialogMode === 'edit' && editCardId) {
      updateCardMutation.mutate({
        cardId: editCardId,
        cardType: selectedCardType,
        startDate: cardStartDate,
        remark: cardRemark || undefined,
      });
    }
  }

  // ===== 消费次数管理 =====
  function openVisitManage(userId: number, userName: string, tab: VisitTab = 'add') {
    setVisitUserId(userId);
    setVisitUserName(userName);
    setVisitTab(tab);
    setVisitDate(new Date().toISOString().split('T')[0]);
    setVisitRemark("");
    setVisitDialog(true);
  }

  function handleAddVisit() {
    if (!visitUserId) return;
    addVisitMutation.mutate({
      userId: visitUserId,
      visitDate: visitDate || undefined,
      remark: visitRemark || undefined,
    });
  }

  function openEditVisit(visitId: number, currentDate: string, currentRemark: string) {
    setEditVisitId(visitId);
    setEditVisitDate(currentDate || new Date().toISOString().split('T')[0]);
    setEditVisitRemark(currentRemark || "");
    setEditVisitDialog(true);
  }

  function handleUpdateVisit() {
    if (!editVisitId) return;
    updateVisitMutation.mutate({
      visitId: editVisitId,
      visitDate: editVisitDate,
      remark: editVisitRemark || undefined,
    });
  }

  function confirmDeleteVisit(visitId: number) {
    setDeleteVisitId(visitId);
    setDeleteVisitConfirmDialog(true);
  }

  function handleDeleteVisit() {
    if (!deleteVisitId) return;
    deleteVisitMutation.mutate({ visitId: deleteVisitId });
  }

  // ===== 渲染卡状态标签 =====
  function renderCardBadge(userId: number) {
    const card = cardMap[userId];
    if (!card) return null;
    const days = getDaysUntilExpiry(card.endDate);
    if (days < 0) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] bg-gray-100 text-gray-400 rounded-full px-2 py-0.5">
          <CreditCard className="w-2.5 h-2.5" />
          {getCardLabel(card.cardType)} · 已过期
        </span>
      );
    }
    const color = days <= 7 ? "text-orange-500 bg-orange-50" : "text-emerald-600 bg-emerald-50";
    return (
      <span className={`inline-flex items-center gap-1 text-[10px] rounded-full px-2 py-0.5 ${color}`}>
        <CreditCard className="w-2.5 h-2.5" />
        {getCardLabel(card.cardType)} · 还有{days}天
      </span>
    );
  }

  function calcEndDate(startDate: string, cardType: CardType): string {
    const days = CARD_TYPES.find(c => c.value === cardType)?.days ?? 30;
    const end = new Date(startDate);
    end.setDate(end.getDate() + days);
    return end.toLocaleDateString('zh-CN');
  }

  const logs = logQuery.data ?? [];
  const visitLogs = visitLogQuery.data ?? [];

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* 顶部 */}
      <div className="bg-gradient-to-r from-rose-500 to-red-400 text-white px-5 pt-12 pb-6">
        <button
          onClick={() => setLocation('/beauty/profile')}
          className="flex items-center gap-1 text-white/80 text-sm mb-4 active:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          返回个人中心
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">我的客户</h1>
            <p className="text-white/60 text-xs mt-1">管理客户积分与消费记录</p>
          </div>
          <button
            onClick={() => setShareDialog(true)}
            className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm rounded-full px-4 py-2 text-white text-xs font-medium active:bg-white/30 transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" />
            分享邀请
          </button>
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="px-4 -mt-3">
        <div className="bg-white rounded-2xl shadow-sm flex items-center gap-2 px-4 py-3">
          <Search className="w-4 h-4 text-gray-300 flex-shrink-0" />
          <input
            type="text"
            placeholder="搜索客户姓名..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 text-sm outline-none bg-transparent text-gray-700 placeholder:text-gray-300"
          />
        </div>
      </div>

      {/* 客户列表 */}
      <div className="px-4 mt-4 space-y-3">
        {clientsQuery.isLoading ? (
          <div className="text-center text-gray-400 py-12 text-sm">加载中...</div>
        ) : filteredClients.length === 0 ? (
          <div className="text-center text-gray-400 py-12 text-sm">
            {searchTerm ? "未找到匹配的客户" : "暂无客户"}
          </div>
        ) : (
          filteredClients.map((client) => {
            const clientName = client.name || client.username || `用户${client.id}`;
            const visitCount = visitCountMap[client.id] ?? 0;
            const hasCard = !!cardMap[client.id];
            return (
              <div key={client.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {/* 客户信息行 */}
                <div className="px-4 py-4 flex items-start gap-3">
                  <div className="w-11 h-11 rounded-full bg-rose-50 overflow-hidden flex items-center justify-center flex-shrink-0 mt-0.5">
                    {client.avatar ? (
                      <img src={client.avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-rose-400 font-bold text-sm">
                        {clientName.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{clientName}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      加入: {client.invitedAt ? new Date(client.invitedAt).toLocaleDateString('zh-CN') : '-'}
                    </p>
                    <div className="mt-1.5">
                      {renderCardBadge(client.id)}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-base font-bold text-amber-500">{client.pointsBalance}</p>
                      <p className="text-[10px] text-gray-400">积分</p>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-bold text-rose-400">{visitCount}</p>
                      <p className="text-[10px] text-gray-400">消费次</p>
                    </div>
                  </div>
                </div>

                {/* 第一行：积分管理 + 优惠券 */}
                <div className="border-t border-gray-50 px-4 py-2.5 flex items-center gap-2">
                  <button
                    onClick={() => openPoints(client.id, clientName, 'add')}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-rose-50 text-rose-500 text-xs font-medium active:bg-rose-100 transition-colors"
                  >
                    <Star className="w-3.5 h-3.5" />
                    积分管理
                  </button>
                  <button
                    onClick={() => toast.info("优惠券功能即将上线")}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-amber-50 text-amber-500 text-xs font-medium active:bg-amber-100 transition-colors"
                  >
                    <Gift className="w-3.5 h-3.5" />
                    优惠券
                  </button>
                </div>

                {/* 第二行：消费卡管理 + 消费次数管理 */}
                <div className="border-t border-gray-50 px-4 py-2.5 flex items-center gap-2">
                  <button
                    onClick={() => openCardManage(client.id, clientName)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium transition-colors ${
                      hasCard
                        ? 'bg-indigo-500 text-white active:bg-indigo-600'
                        : 'bg-indigo-50 text-indigo-500 active:bg-indigo-100'
                    }`}
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    消费卡管理
                  </button>
                  <button
                    onClick={() => openVisitManage(client.id, clientName, 'add')}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-50 text-emerald-600 text-xs font-medium active:bg-emerald-100 transition-colors"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    消费次数管理
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ===== 积分管理弹窗（三tab：加积分 / 减积分 / 记录） ===== */}
      <Dialog open={pointsDialog} onOpenChange={setPointsDialog}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="text-base">积分管理 - {pointsUserName}</DialogTitle>
            <DialogDescription className="sr-only">管理客户积分</DialogDescription>
          </DialogHeader>

          {/* Tab 切换 */}
          <div className="flex rounded-xl overflow-hidden border border-gray-100">
            <button
              onClick={() => setPointsTab('add')}
              className={`flex-1 flex items-center justify-center gap-1 py-2.5 text-xs font-medium transition-colors ${
                pointsTab === 'add' ? 'bg-rose-500 text-white' : 'bg-gray-50 text-gray-500 active:bg-gray-100'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              加积分
            </button>
            <button
              onClick={() => setPointsTab('subtract')}
              className={`flex-1 flex items-center justify-center gap-1 py-2.5 text-xs font-medium transition-colors ${
                pointsTab === 'subtract' ? 'bg-gray-600 text-white' : 'bg-gray-50 text-gray-500 active:bg-gray-100'
              }`}
            >
              <Minus className="w-3.5 h-3.5" />
              减积分
            </button>
            <button
              onClick={() => setPointsTab('log')}
              className={`flex-1 flex items-center justify-center gap-1 py-2.5 text-xs font-medium transition-colors ${
                pointsTab === 'log' ? 'bg-indigo-500 text-white' : 'bg-gray-50 text-gray-500 active:bg-gray-100'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              记录
            </button>
          </div>

          {/* 加积分 / 减积分 表单 */}
          {(pointsTab === 'add' || pointsTab === 'subtract') && (
            <>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label className="text-sm">积分数量</Label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="请输入积分数量"
                    value={pointsAmount}
                    onChange={(e) => setPointsAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">备注（选填）</Label>
                  <Input
                    placeholder="如：消费赠送、活动奖励等"
                    value={pointsRemark}
                    onChange={(e) => setPointsRemark(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPointsDialog(false)} className="flex-1">
                  取消
                </Button>
                <Button
                  onClick={handlePointsSubmit}
                  disabled={adjustMutation.isPending || !pointsAmount}
                  className={`flex-1 ${pointsTab === 'add' ? 'bg-rose-500 hover:bg-rose-600' : 'bg-gray-600 hover:bg-gray-700'}`}
                >
                  {adjustMutation.isPending ? "处理中..." : "确认"}
                </Button>
              </DialogFooter>
            </>
          )}

          {/* 积分记录 */}
          {pointsTab === 'log' && (
            <div className="max-h-[50vh] overflow-y-auto space-y-1 py-1">
              {logQuery.isLoading ? (
                <p className="text-center text-gray-400 text-sm py-6">加载中...</p>
              ) : logs.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-6">暂无积分记录</p>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${log.amount > 0 ? "text-rose-500" : "text-gray-500"}`}>
                          {log.amount > 0 ? `+${log.amount}` : log.amount}
                        </span>
                        <Star className="w-3 h-3 text-amber-400" />
                      </div>
                      {log.remark && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{log.remark}</p>
                      )}
                      <p className="text-[10px] text-gray-300 mt-0.5">
                        {new Date(log.createdAt).toLocaleString('zh-CN')}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-gray-400">余额</p>
                      <p className="text-sm font-medium text-gray-700">{log.balanceAfter}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== 消费卡管理弹窗 ===== */}
      <Dialog open={cardDialog} onOpenChange={setCardDialog}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              {cardDialogMode === 'manage' ? '消费卡管理' : cardDialogMode === 'edit' ? '编辑消费卡' : '添加消费卡'}
              {' '}- {cardUserName}
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-400">
              {cardDialogMode === 'manage'
                ? '当前客户已有消费卡，可编辑或删除'
                : cardDialogMode === 'edit'
                ? '修改卡类型和开始日期，系统自动重新计算到期日'
                : '选择卡类型和开始日期，系统自动计算到期日'}
            </DialogDescription>
          </DialogHeader>

          {cardDialogMode === 'manage' && cardUserId && cardMap[cardUserId] && (
            <div className="py-2 space-y-4">
              <div className="bg-indigo-50 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-indigo-400">卡类型</span>
                  <span className="text-sm font-semibold text-indigo-700">{getCardLabel(cardMap[cardUserId].cardType)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-indigo-400">开始日期</span>
                  <span className="text-sm text-indigo-700">{cardMap[cardUserId].startDate}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-indigo-400">到期日期</span>
                  <span className="text-sm text-indigo-700">{cardMap[cardUserId].endDate}</span>
                </div>
                {(() => {
                  const days = getDaysUntilExpiry(cardMap[cardUserId].endDate);
                  return (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-indigo-400">状态</span>
                      <span className={`text-sm font-medium ${days < 0 ? 'text-gray-400' : days <= 7 ? 'text-orange-500' : 'text-emerald-600'}`}>
                        {days < 0 ? '已过期' : `还有 ${days} 天`}
                      </span>
                    </div>
                  );
                })()}
                {cardMap[cardUserId].remark && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-indigo-400">备注</span>
                    <span className="text-xs text-indigo-600">{cardMap[cardUserId].remark}</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCardDialogMode('edit')}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-indigo-50 text-indigo-600 text-sm font-medium active:bg-indigo-100 transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                  编辑
                </button>
                <button
                  onClick={() => { setDeleteCardId(cardMap[cardUserId!]!.id); setDeleteCardConfirmDialog(true); }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-50 text-red-500 text-sm font-medium active:bg-red-100 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  删除
                </button>
              </div>
            </div>
          )}

          {(cardDialogMode === 'add' || cardDialogMode === 'edit') && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label className="text-sm">卡类型</Label>
                <div className="grid grid-cols-4 gap-2">
                  {CARD_TYPES.map((ct) => (
                    <button
                      key={ct.value}
                      onClick={() => setSelectedCardType(ct.value)}
                      className={`py-2.5 rounded-xl text-xs font-medium transition-colors ${
                        selectedCardType === ct.value
                          ? 'bg-indigo-500 text-white shadow-sm'
                          : 'bg-gray-50 text-gray-600 active:bg-gray-100'
                      }`}
                    >
                      {ct.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  开始日期
                </Label>
                <Input
                  type="date"
                  value={cardStartDate}
                  onChange={(e) => setCardStartDate(e.target.value)}
                />
              </div>
              {cardStartDate && (
                <div className="bg-indigo-50 rounded-xl px-4 py-3">
                  <p className="text-xs text-indigo-400">预计到期日</p>
                  <p className="text-sm font-medium text-indigo-700 mt-0.5">
                    {calcEndDate(cardStartDate, selectedCardType)}
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-sm">备注（选填）</Label>
                <Input
                  placeholder="如：首次办卡、续卡等"
                  value={cardRemark}
                  onChange={(e) => setCardRemark(e.target.value)}
                />
              </div>
            </div>
          )}

          {cardDialogMode === 'manage' ? (
            <DialogFooter>
              <Button variant="outline" onClick={() => setCardDialog(false)} className="w-full">关闭</Button>
            </DialogFooter>
          ) : (
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => cardDialogMode === 'edit' ? setCardDialogMode('manage') : setCardDialog(false)}
                className="flex-1"
              >
                {cardDialogMode === 'edit' ? '返回' : '取消'}
              </Button>
              <Button
                onClick={handleCardSubmit}
                disabled={addCardMutation.isPending || updateCardMutation.isPending}
                className="flex-1 bg-indigo-500 hover:bg-indigo-600"
              >
                {(addCardMutation.isPending || updateCardMutation.isPending) ? "处理中..." : cardDialogMode === 'edit' ? "保存修改" : "确认添加"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* 删除消费卡确认 */}
      <Dialog open={deleteCardConfirmDialog} onOpenChange={setDeleteCardConfirmDialog}>
        <DialogContent className="max-w-xs mx-auto">
          <DialogHeader>
            <DialogTitle className="text-base">确认删除</DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              确定要删除 {cardUserName} 的消费卡吗？删除后不可恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteCardConfirmDialog(false)} className="flex-1">取消</Button>
            <Button
              onClick={() => deleteCardId && deleteCardMutation.mutate({ cardId: deleteCardId })}
              disabled={deleteCardMutation.isPending}
              className="flex-1 bg-red-500 hover:bg-red-600"
            >
              {deleteCardMutation.isPending ? "删除中..." : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== 消费次数管理弹窗（两tab：添加 / 记录） ===== */}
      <Dialog open={visitDialog} onOpenChange={setVisitDialog}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="text-base">消费次数管理 - {visitUserName}</DialogTitle>
            <DialogDescription className="sr-only">管理客户消费次数</DialogDescription>
          </DialogHeader>

          {/* Tab 切换 */}
          <div className="flex rounded-xl overflow-hidden border border-gray-100">
            <button
              onClick={() => setVisitTab('add')}
              className={`flex-1 flex items-center justify-center gap-1 py-2.5 text-xs font-medium transition-colors ${
                visitTab === 'add' ? 'bg-emerald-500 text-white' : 'bg-gray-50 text-gray-500 active:bg-gray-100'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              添加记录
            </button>
            <button
              onClick={() => setVisitTab('log')}
              className={`flex-1 flex items-center justify-center gap-1 py-2.5 text-xs font-medium transition-colors ${
                visitTab === 'log' ? 'bg-emerald-500 text-white' : 'bg-gray-50 text-gray-500 active:bg-gray-100'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              历史记录
            </button>
          </div>

          {/* 添加记录 */}
          {visitTab === 'add' && (
            <>
              <div className="space-y-4 py-2">
                <div className="bg-emerald-50 rounded-xl px-4 py-3 flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-emerald-700">确认本次到店消费</p>
                    <p className="text-xs text-emerald-500 mt-0.5">
                      当前消费次数: {visitCountMap[visitUserId ?? 0] ?? 0} 次
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    消费日期
                    <span className="text-gray-400 text-xs font-normal">（默认今天，可修改）</span>
                  </Label>
                  <Input
                    type="date"
                    value={visitDate}
                    onChange={(e) => setVisitDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">备注（选填）</Label>
                  <Input
                    placeholder="如：红光养护、经络疏通等"
                    value={visitRemark}
                    onChange={(e) => setVisitRemark(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setVisitDialog(false)} className="flex-1">取消</Button>
                <Button
                  onClick={handleAddVisit}
                  disabled={addVisitMutation.isPending}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-600"
                >
                  {addVisitMutation.isPending ? "处理中..." : "确认记录"}
                </Button>
              </DialogFooter>
            </>
          )}

          {/* 历史记录 */}
          {visitTab === 'log' && (
            <div className="max-h-[50vh] overflow-y-auto space-y-1 py-1">
              {visitLogQuery.isLoading ? (
                <p className="text-center text-gray-400 text-sm py-6">加载中...</p>
              ) : visitLogs.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-6">暂无消费记录</p>
              ) : (
                visitLogs.map((log, index) => (
                  <div key={log.id} className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5">
                          第 {visitLogs.length - index} 次
                        </span>
                        <span className="text-xs text-gray-500">
                          {log.visitDate || new Date(log.createdAt).toLocaleDateString('zh-CN')}
                        </span>
                      </div>
                      {log.remark && (
                        <p className="text-xs text-gray-400 mt-1 truncate">{log.remark}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                      <button
                        onClick={() => openEditVisit(log.id, log.visitDate || new Date(log.createdAt).toISOString().split('T')[0], log.remark || "")}
                        className="p-1.5 rounded-lg bg-gray-50 text-gray-400 active:bg-gray-100 transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => confirmDeleteVisit(log.id)}
                        className="p-1.5 rounded-lg bg-red-50 text-red-400 active:bg-red-100 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 编辑消费记录弹窗 */}
      <Dialog open={editVisitDialog} onOpenChange={setEditVisitDialog}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="text-base">编辑消费记录</DialogTitle>
            <DialogDescription className="text-xs text-gray-400">修改消费日期和备注</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                消费日期
              </Label>
              <Input
                type="date"
                value={editVisitDate}
                onChange={(e) => setEditVisitDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">备注（选填）</Label>
              <Input
                placeholder="如：红光养护、经络疏通等"
                value={editVisitRemark}
                onChange={(e) => setEditVisitRemark(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditVisitDialog(false)} className="flex-1">取消</Button>
            <Button
              onClick={handleUpdateVisit}
              disabled={updateVisitMutation.isPending}
              className="flex-1 bg-emerald-500 hover:bg-emerald-600"
            >
              {updateVisitMutation.isPending ? "保存中..." : "保存修改"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除消费记录确认 */}
      <Dialog open={deleteVisitConfirmDialog} onOpenChange={setDeleteVisitConfirmDialog}>
        <DialogContent className="max-w-xs mx-auto">
          <DialogHeader>
            <DialogTitle className="text-base">确认删除</DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              确定要删除这条消费记录吗？删除后消费次数将减少1次。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteVisitConfirmDialog(false)} className="flex-1">取消</Button>
            <Button
              onClick={handleDeleteVisit}
              disabled={deleteVisitMutation.isPending}
              className="flex-1 bg-red-500 hover:bg-red-600"
            >
              {deleteVisitMutation.isPending ? "删除中..." : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== 分享邀请弹窗 ===== */}
      <Dialog open={shareDialog} onOpenChange={setShareDialog}>
        <DialogContent className="max-w-sm mx-auto p-0 overflow-hidden rounded-2xl border-0">
          <div className="bg-gradient-to-br from-rose-500 via-red-400 to-rose-400 px-6 pt-6 pb-5 text-white relative overflow-hidden">
            <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-amber-300/15" />
            <div className="absolute bottom-2 left-4 w-12 h-12 rounded-full bg-amber-200/10" />
            <DialogHeader className="relative">
              <DialogTitle className="text-lg font-bold text-white">分享邀请</DialogTitle>
              <DialogDescription className="text-white/60 text-xs mt-1">
                通过以下方式邀请新客户加入
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="px-5 py-5 space-y-4">
            <div className="bg-gradient-to-r from-rose-50 to-amber-50 rounded-xl p-4 border border-rose-100/50">
              <p className="text-xs text-rose-400 font-medium">我的邀请码</p>
              <div className="flex items-center justify-between mt-2">
                <p className="text-2xl font-bold text-gray-800 tracking-[0.2em]">
                  {inviteInfoQuery.data?.inviteCode || "------"}
                </p>
                <button
                  onClick={() => inviteInfoQuery.data?.inviteCode && copyToClipboard(inviteInfoQuery.data.inviteCode, "邀请码")}
                  className="flex items-center gap-1.5 bg-rose-500 text-white rounded-full px-4 py-2 text-xs font-medium active:bg-rose-600 shadow-sm"
                >
                  <Copy className="w-3 h-3" />
                  复制
                </button>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-400 font-medium">邀请链接</p>
              <div className="flex items-center gap-2 mt-2">
                <p className="flex-1 text-xs text-gray-600 truncate bg-white rounded-lg px-3 py-2 border border-gray-100">
                  {inviteInfoQuery.data?.inviteLink || "------"}
                </p>
                <button
                  onClick={() => inviteInfoQuery.data?.inviteLink && copyToClipboard(inviteInfoQuery.data.inviteLink, "邀请链接")}
                  className="flex items-center gap-1.5 bg-gray-200 text-gray-600 rounded-full px-4 py-2 text-xs font-medium active:bg-gray-300 flex-shrink-0"
                >
                  <Copy className="w-3 h-3" />
                  复制
                </button>
              </div>
            </div>

            <div className="flex flex-col items-center pt-1">
              <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
                {qrCodeQuery.isLoading ? (
                  <div className="w-36 h-36 flex items-center justify-center">
                    <p className="text-xs text-gray-400">加载中...</p>
                  </div>
                ) : qrCodeQuery.data?.qrCodeDataUrl ? (
                  <img src={qrCodeQuery.data.qrCodeDataUrl} alt="邀请二维码" className="w-36 h-36" />
                ) : (
                  <div className="w-36 h-36 flex items-center justify-center bg-gray-50 rounded">
                    <p className="text-xs text-gray-400">暂无二维码</p>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-3">扫码注册加入</p>
              <p className="text-[10px] text-gray-300 mt-1">长按保存二维码</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
}
