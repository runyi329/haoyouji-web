/**
 * 奢贝美容院 - 我的客户
 * 显示邀请的客户列表，可加减积分、添加消费卡、记录消费次数，优惠券功能预留
 * 路径: /beauty/clients
 */
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, Minus, History, Gift, Search, Star, Share2, Copy,
  CreditCard, CheckCircle, Calendar
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

// 计算距离到期天数
function getDaysUntilExpiry(endDate: string): number {
  const end = new Date(endDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// 卡类型中文名
function getCardLabel(cardType: string): string {
  return CARD_TYPES.find(c => c.value === cardType)?.label ?? cardType;
}

export default function BeautyClients() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");

  // 积分操作弹窗状态
  const [adjustDialog, setAdjustDialog] = useState(false);
  const [adjustType, setAdjustType] = useState<"add" | "subtract">("add");
  const [adjustUserId, setAdjustUserId] = useState<number | null>(null);
  const [adjustUserName, setAdjustUserName] = useState("");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustRemark, setAdjustRemark] = useState("");

  // 日志弹窗状态
  const [logDialog, setLogDialog] = useState(false);
  const [logUserId, setLogUserId] = useState<number | null>(null);
  const [logUserName, setLogUserName] = useState("");

  // 消费卡弹窗状态
  const [cardDialog, setCardDialog] = useState(false);
  const [cardUserId, setCardUserId] = useState<number | null>(null);
  const [cardUserName, setCardUserName] = useState("");
  const [selectedCardType, setSelectedCardType] = useState<CardType>('monthly');
  const [cardStartDate, setCardStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [cardRemark, setCardRemark] = useState("");

  // 消费次数弹窗状态
  const [visitDialog, setVisitDialog] = useState(false);
  const [visitUserId, setVisitUserId] = useState<number | null>(null);
  const [visitUserName, setVisitUserName] = useState("");
  const [visitRemark, setVisitRemark] = useState("");

  // 分享弹窗状态
  const [shareDialog, setShareDialog] = useState(false);

  // 查询客户列表
  const clientsQuery = trpc.beauty.points.getMyClients.useQuery(undefined, {
    refetchOnMount: 'always',
  });

  // 获取所有客户的消费卡信息（批量）
  const clientIds = useMemo(() => (clientsQuery.data ?? []).map(c => c.id), [clientsQuery.data]);
  const cardsQuery = trpc.beauty.card.getClientsCards.useQuery(
    { userIds: clientIds },
    { enabled: clientIds.length > 0, refetchOnMount: 'always' }
  );

  // 获取所有客户的消费次数（批量）
  const visitCountQuery = trpc.beauty.visit.getClientsVisitCount.useQuery(
    { userIds: clientIds },
    { enabled: clientIds.length > 0, refetchOnMount: 'always' }
  );

  // 积分日志
  const logQuery = trpc.beauty.points.getPointsLog.useQuery(
    { userId: logUserId! },
    { enabled: logDialog && !!logUserId }
  );

  // 邀请信息
  const inviteInfoQuery = trpc.invite.getMyInviteInfo.useQuery(undefined, {
    enabled: shareDialog,
  });
  const qrCodeQuery = trpc.invite.generateQRCode.useQuery(
    { inviteCode: inviteInfoQuery.data?.inviteCode || "" },
    { enabled: shareDialog && !!inviteInfoQuery.data?.inviteCode }
  );

  // Mutations
  const adjustMutation = trpc.beauty.points.adjustPoints.useMutation({
    onSuccess: (data) => {
      toast.success(`积分${adjustType === "add" ? "增加" : "扣减"}成功，当前余额: ${data.newBalance}`);
      setAdjustDialog(false);
      setAdjustAmount("");
      setAdjustRemark("");
      clientsQuery.refetch();
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

  const addVisitMutation = trpc.beauty.visit.addVisit.useMutation({
    onSuccess: () => {
      toast.success("消费记录已添加");
      setVisitDialog(false);
      setVisitRemark("");
      visitCountQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  // 构建客户ID -> 卡信息的映射
  const cardMap = useMemo(() => {
    const map: Record<number, typeof cardsQuery.data extends (infer T)[] ? T : never> = {};
    (cardsQuery.data ?? []).forEach(card => {
      if (!map[card.userId]) map[card.userId] = card;
    });
    return map;
  }, [cardsQuery.data]);

  // 构建客户ID -> 消费次数的映射
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

  function openAdjust(userId: number, userName: string, type: "add" | "subtract") {
    setAdjustUserId(userId);
    setAdjustUserName(userName);
    setAdjustType(type);
    setAdjustAmount("");
    setAdjustRemark("");
    setAdjustDialog(true);
  }

  function handleAdjustSubmit() {
    if (!adjustUserId || !adjustAmount) return;
    const num = parseInt(adjustAmount);
    if (isNaN(num) || num <= 0) {
      toast.error("请输入有效的正整数");
      return;
    }
    adjustMutation.mutate({
      userId: adjustUserId,
      amount: adjustType === "add" ? num : -num,
      remark: adjustRemark || undefined,
    });
  }

  function openLog(userId: number, userName: string) {
    setLogUserId(userId);
    setLogUserName(userName);
    setLogDialog(true);
  }

  function openCard(userId: number, userName: string) {
    setCardUserId(userId);
    setCardUserName(userName);
    setSelectedCardType('monthly');
    setCardStartDate(new Date().toISOString().split('T')[0]);
    setCardRemark("");
    setCardDialog(true);
  }

  function handleAddCard() {
    if (!cardUserId) return;
    addCardMutation.mutate({
      userId: cardUserId,
      cardType: selectedCardType,
      startDate: cardStartDate,
      remark: cardRemark || undefined,
    });
  }

  function openVisit(userId: number, userName: string) {
    setVisitUserId(userId);
    setVisitUserName(userName);
    setVisitRemark("");
    setVisitDialog(true);
  }

  function handleAddVisit() {
    if (!visitUserId) return;
    addVisitMutation.mutate({
      userId: visitUserId,
      remark: visitRemark || undefined,
    });
  }

  const logs = logQuery.data ?? [];

  // 渲染卡状态标签
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
            <p className="text-white/60 text-xs mt-1">管理客户积分与优惠券</p>
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
                    {/* 卡状态标签 */}
                    <div className="mt-1.5">
                      {renderCardBadge(client.id)}
                    </div>
                  </div>
                  {/* 右侧数据 */}
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

                {/* 第一行操作按钮：积分操作 */}
                <div className="border-t border-gray-50 px-4 py-2.5 flex items-center gap-2">
                  <button
                    onClick={() => openAdjust(client.id, clientName, "add")}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-rose-50 text-rose-500 text-xs font-medium active:bg-rose-100 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    加积分
                  </button>
                  <button
                    onClick={() => openAdjust(client.id, clientName, "subtract")}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-gray-50 text-gray-500 text-xs font-medium active:bg-gray-100 transition-colors"
                  >
                    <Minus className="w-3.5 h-3.5" />
                    减积分
                  </button>
                  <button
                    onClick={() => openLog(client.id, clientName)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-gray-50 text-gray-500 text-xs font-medium active:bg-gray-100 transition-colors"
                  >
                    <History className="w-3.5 h-3.5" />
                    记录
                  </button>
                  <button
                    onClick={() => toast.info("优惠券功能即将上线")}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-amber-50 text-amber-500 text-xs font-medium active:bg-amber-100 transition-colors"
                  >
                    <Gift className="w-3.5 h-3.5" />
                    优惠券
                  </button>
                </div>

                {/* 第二行操作按钮：消费卡 & 消费次数 */}
                <div className="border-t border-gray-50 px-4 py-2.5 flex items-center gap-2">
                  <button
                    onClick={() => openCard(client.id, clientName)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-indigo-50 text-indigo-500 text-xs font-medium active:bg-indigo-100 transition-colors"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    添加消费卡
                  </button>
                  <button
                    onClick={() => openVisit(client.id, clientName)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-50 text-emerald-600 text-xs font-medium active:bg-emerald-100 transition-colors"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    添加消费次数
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 积分加减弹窗 */}
      <Dialog open={adjustDialog} onOpenChange={setAdjustDialog}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              {adjustType === "add" ? "增加积分" : "扣减积分"} - {adjustUserName}
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-400">
              {adjustType === "add" ? "为客户增加奢贝积分" : "扣减客户的奢贝积分"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm">积分数量</Label>
              <Input
                type="number"
                min="1"
                placeholder="请输入积分数量"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">备注（选填）</Label>
              <Input
                placeholder="如：消费赠送、活动奖励等"
                value={adjustRemark}
                onChange={(e) => setAdjustRemark(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustDialog(false)} className="flex-1">
              取消
            </Button>
            <Button
              onClick={handleAdjustSubmit}
              disabled={adjustMutation.isPending || !adjustAmount}
              className={`flex-1 ${adjustType === "add" ? "bg-rose-500 hover:bg-rose-600" : "bg-gray-600 hover:bg-gray-700"}`}
            >
              {adjustMutation.isPending ? "处理中..." : "确认"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 积分日志弹窗 */}
      <Dialog open={logDialog} onOpenChange={setLogDialog}>
        <DialogContent className="max-w-sm mx-auto max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">积分记录 - {logUserName}</DialogTitle>
            <DialogDescription className="text-xs text-gray-400">
              查看该客户的积分变动历史
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
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
        </DialogContent>
      </Dialog>

      {/* 添加消费卡弹窗 */}
      <Dialog open={cardDialog} onOpenChange={setCardDialog}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="text-base">添加消费卡 - {cardUserName}</DialogTitle>
            <DialogDescription className="text-xs text-gray-400">
              选择卡类型和开始日期，系统自动计算到期日
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* 卡类型选择 */}
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
            {/* 开始日期 */}
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
            {/* 预览到期日 */}
            {cardStartDate && (
              <div className="bg-indigo-50 rounded-xl px-4 py-3">
                <p className="text-xs text-indigo-400">预计到期日</p>
                <p className="text-sm font-medium text-indigo-700 mt-0.5">
                  {(() => {
                    const days = CARD_TYPES.find(c => c.value === selectedCardType)?.days ?? 30;
                    const end = new Date(cardStartDate);
                    end.setDate(end.getDate() + days);
                    return end.toLocaleDateString('zh-CN');
                  })()}
                </p>
              </div>
            )}
            {/* 备注 */}
            <div className="space-y-2">
              <Label className="text-sm">备注（选填）</Label>
              <Input
                placeholder="如：首次办卡、续卡等"
                value={cardRemark}
                onChange={(e) => setCardRemark(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCardDialog(false)} className="flex-1">
              取消
            </Button>
            <Button
              onClick={handleAddCard}
              disabled={addCardMutation.isPending}
              className="flex-1 bg-indigo-500 hover:bg-indigo-600"
            >
              {addCardMutation.isPending ? "处理中..." : "确认添加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 添加消费次数弹窗 */}
      <Dialog open={visitDialog} onOpenChange={setVisitDialog}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="text-base">添加消费记录 - {visitUserName}</DialogTitle>
            <DialogDescription className="text-xs text-gray-400">
              记录客户本次到店消费，累计消费次数加1
            </DialogDescription>
          </DialogHeader>
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
              <Label className="text-sm">备注（选填）</Label>
              <Input
                placeholder="如：红光养护、经络疏通等"
                value={visitRemark}
                onChange={(e) => setVisitRemark(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVisitDialog(false)} className="flex-1">
              取消
            </Button>
            <Button
              onClick={handleAddVisit}
              disabled={addVisitMutation.isPending}
              className="flex-1 bg-emerald-500 hover:bg-emerald-600"
            >
              {addVisitMutation.isPending ? "处理中..." : "确认记录"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 分享邀请弹窗 */}
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
            {/* 邀请码 */}
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

            {/* 邀请链接 */}
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

            {/* 二维码 */}
            <div className="flex flex-col items-center pt-1">
              <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
                {qrCodeQuery.isLoading ? (
                  <div className="w-36 h-36 flex items-center justify-center">
                    <p className="text-xs text-gray-400">加载中...</p>
                  </div>
                ) : qrCodeQuery.data?.qrCodeDataUrl ? (
                  <img
                    src={qrCodeQuery.data.qrCodeDataUrl}
                    alt="邀请二维码"
                    className="w-36 h-36"
                  />
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
