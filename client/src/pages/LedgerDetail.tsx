import { useState, useEffect, useRef, lazy, Suspense } from "react";
const LedgerDetailAA = lazy(() => import('./LedgerDetailAA'));
const LedgerDetailAG = lazy(() => import('./LedgerDetailAG'));
const MemoLedgerPage = lazy(() => import('./MemoLedgerPage'));
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
// 不再使用动态主题，固定红色配色
import { Button } from "@/components/ui/button";

import MembersDialog from "@/components/MembersDialog";
import { UserAvatar } from "@/components/UserAvatar";

import {
  ChevronLeft,
  ChevronRight,
  Settings,
  BarChart3,
  Plus,
  Search,
  Receipt,
  Hourglass,
  Users,
  TrendingDown,
  Gift,
  Clock,
  CheckCircle,
  XCircle,
  Loader,
  Timer,
  Trophy,
  Flame,
} from "lucide-react";


export default function LedgerDetail() {
  const [, params] = useRoute("/ledger/:id");
  const [, setLocation] = useLocation();
  
  // 使用全局CSS变量，确保所有用户配色统一

  const ledgerId = params?.id ? parseInt(params.id) : 1;
  console.log('[LedgerDetail] params:', params, 'ledgerId:', ledgerId);
  
  // 读取URL查询参数
  const urlParams = new URLSearchParams(window.location.search);
  const filters: any = {
    ledgerId: Number(ledgerId),
    limit: 100,
  };
  
  // 从 URL 参数中读取筛选条件
  if (urlParams.has('startDate')) filters.startDate = urlParams.get('startDate')!;
  if (urlParams.has('endDate')) filters.endDate = urlParams.get('endDate')!;
  if (urlParams.has('type')) filters.type = urlParams.get('type') as 'income' | 'expense';
  if (urlParams.has('amountMin')) filters.amountMin = urlParams.get('amountMin')!;
  if (urlParams.has('amountMax')) filters.amountMax = urlParams.get('amountMax')!;
  
  // 处理分类 ID（只使用第一个）
  if (urlParams.has('categoryIds')) {
    const categoryIds = urlParams.get('categoryIds')!.split(',').map(Number);
    if (categoryIds.length > 0) {
      filters.categoryId = categoryIds[0];
    }
  }
  
  // 处理成员 ID（只使用第一个）
  if (urlParams.has('memberIds')) {
    const memberIds = urlParams.get('memberIds')!.split(',').map(Number);
    if (memberIds.length > 0) {
      filters.memberId = memberIds[0];
    }
  }
  
  console.log('[LedgerDetail] filters:', filters);
  
  // 使用 tRPC
  const { data: ledgerData, isLoading, error } = trpc.ledger.getById.useQuery({
    ledgerId: Number(ledgerId),
  });

  // 获取成员列表
  const { data: membersData } = trpc.ledger.getMembers.useQuery({
    ledgerId: Number(ledgerId),
  });

  // 获取记账记录列表（应用筛选条件）
  const { data: transactionsData, refetch: refetchTransactions } = trpc.ledger.getTransactions.useQuery(filters, {
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  // 获取待审批记账数量
  const { data: pendingApprovals = [] } = trpc.ledger.getPendingApprovals.useQuery({
    ledgerId: Number(ledgerId),
  });

  // 成员弹窗状态
  const [showMembersDialog, setShowMembersDialog] = useState(false);
  // 视角切换（AF 账本管理员专属）
  const [viewAsUserId, setViewAsUserId] = useState<number | null>(null);
  const [showViewAsPicker, setShowViewAsPicker] = useState(false);
  const [viewAsSearch, setViewAsSearch] = useState('');
  const trpcUtils = trpc.useUtils();
  // 视角切换时手动 invalidate 所有 AF 查询
  const handleSwitchView = (userId: number | null) => {
    setViewAsUserId(userId);
    setShowViewAsPicker(false);
    trpcUtils.ledger.afGetMyTotalAsset.invalidate();
    trpcUtils.ledger.afGetMyRechargeHistory.invalidate();
  };
  // 抽奖子 Tab：正在进行中 / 往期回顾
  const [lotteryTab, setLotteryTab] = useState<'active' | 'past'>('active');
  // 倒计时刻度（每秒更新）
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // 抽奖活动列表（全量，前端按子Tab过滤）
  const { data: lotteryActivities, isLoading: lotteryLoading } = trpc.lottery.listByLedger.useQuery(
    { ledgerId: Number(ledgerId) }
  );
  // ============================================================
  // ⚠️  账本类型隔离保护区 ⚠️
  // ------------------------------------------------------------
  // 账本类型一览：
  //   普通账本   type = null / 'default'  ← 绝对不能被任何定制逻辑影响
  //   减肥账本   type = 'diet' | 'custom_ac'   → isDiet
  //   AE 抽奖箱  type = 'custom_ae'            → isCustomAE
  //   AA 建议箱  type = 'custom_aa'            → isCustomAA（独立组件，早期 return）
  //   AD 永忆    type = 'custom_ad'            → isCustomAD（独立组件，早期 return）
  //
  // 修改规则（必须遵守）：
  //   1. 所有定制逻辑必须包在对应的 isXxx 条件里
  //   2. 普通账本的统计面板、记账列表、底部+按钮等，
  //      必须用 !isCustomAE && !isDiet && !isCustomAA && !isCustomAD 保护
  //   3. 每次新增定制功能，先问自己：「普通账本会受影响吗？」
  // ============================================================

  // 减肥账本数据
  const isDiet = (ledgerData as any)?.type === 'diet' || (ledgerData as any)?.type === 'custom_ac';
  const isCustomAE = (ledgerData as any)?.type === 'custom_ae';
  const isCustomAF = (ledgerData as any)?.type === 'custom_af';
  const isOwner = (ledgerData as any)?.userRole === 'owner';
  const isAdmin = (ledgerData as any)?.userRole === 'admin';
  const isFunder = (ledgerData as any)?.userRole === 'funder';
  // 视角切换时，用目标用户的角色来控制 UI 显示
  const viewAsRole = viewAsUserId ? ((membersData as any[])?.find((m: any) => m.userId === viewAsUserId)?.role || 'member') : null;
  const effectiveIsOwner = viewAsUserId ? viewAsRole === 'owner' : isOwner;
  const effectiveIsAdmin = viewAsUserId ? viewAsRole === 'admin' : isAdmin;
  const effectiveIsManager = effectiveIsOwner || effectiveIsAdmin;
  const isDietCoach = isDiet && (isOwner || isAdmin);
  const isDietStudent = isDiet && !isDietCoach;
  const { data: user } = trpc.auth.me.useQuery();
  const { data: dietStats } = trpc.diet.getStats.useQuery(
    { ledgerId: Number(ledgerId) },
    { enabled: isDiet }
  );
  // AF 账本：总资产估值（充值到账 + 手动调账）
  const { data: afTotalAsset } = trpc.ledger.afGetMyTotalAsset.useQuery(
    { ledgerId: Number(ledgerId), ...(viewAsUserId ? { viewAsUserId } : {}) },
    { enabled: isCustomAF }
  );
  const dietConfig = (dietStats as any)?.config;
  const dietInitialWeight = dietConfig ? Number(dietConfig.initialWeight) : null;
  const dietTargetWeight = dietConfig ? Number(dietConfig.targetWeight) : null;
  const dietCurrentWeight = (dietStats as any)?.currentWeight ?? dietInitialWeight;
  const dietLostWeight = (dietInitialWeight && dietCurrentWeight) ? Math.max(0, dietInitialWeight - dietCurrentWeight) : 0;
  const dietNeedToLose = (dietInitialWeight && dietTargetWeight) ? (dietInitialWeight - dietTargetWeight) : 0;
  const dietProgress = dietNeedToLose > 0 ? Math.min(100, Math.round((dietLostWeight / dietNeedToLose) * 100)) : 0;
  const dietTotalCalories = Number((dietStats as any)?.totalCaloriesBurned ?? 0);
  
  // 统计周期状态（从 localStorage 读取上次的选择，默认为 'month'）
  const [statsPeriod, setStatsPeriod] = useState<'day' | 'week' | 'month' | 'year'>(() => {
    const saved = localStorage.getItem('statsPeriod');
    return (saved as 'day' | 'week' | 'month' | 'year') || 'month';
  });
  const [showPeriodMenu, setShowPeriodMenu] = useState(false);
  
  // 保存统计周期选择到 localStorage
  useEffect(() => {
    localStorage.setItem('statsPeriod', statsPeriod);
  }, [statsPeriod]);

  // 记录最后访问的账本ID到localStorage
  useEffect(() => {
    if (ledgerId) {
      localStorage.setItem('lastVisitedLedgerId', String(ledgerId));
    }
  }, [ledgerId]);

  // 定制账本(AD)：永忆
  const isCustomAD = (ledgerData as any)?.type === 'custom_ad';
  if (!isLoading && !error && isCustomAD && ledgerData) {
    return (
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-gray-500">加载中...</div></div>}>
        <MemoLedgerPage ledgerId={ledgerId} ledgerData={ledgerData} user={user} />
      </Suspense>
    );
  }

  // 定制账本(AA)：使用专用UI
  const isCustomAA = (ledgerData as any)?.type === 'custom_aa';
  if (!isLoading && !error && isCustomAA && ledgerData) {
    return (
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFEBEE' }}><div style={{ color: '#222222' }}>加载中...</div></div>}>
        <LedgerDetailAA
          ledgerId={ledgerId}
          ledgerData={ledgerData}
          membersData={membersData || []}
          transactionsData={transactionsData || []}
          refetchTransactions={refetchTransactions}
          user={user}
        />
      </Suspense>
    );
  }

  // 定制账本(AG)：共享图片助记词
  const isCustomAG = (ledgerData as any)?.type === 'custom_ag';
  if (!isLoading && !error && isCustomAG && ledgerData) {
    return (
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FAF3ED' }}><div style={{ color: '#222222' }}>加载中...</div></div>}>
        <LedgerDetailAG
          ledgerId={ledgerId}
          ledgerData={ledgerData}
          membersData={membersData || []}
          user={user}
        />
      </Suspense>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFEBEE' }}>
        <div style={{ color: '#222222' }} className="text-lg">加载中...</div>
      </div>
    );
  }
  
  if (error || !ledgerData) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FFEBEE' }}>
        <div style={{ color: '#222222' }} className="text-lg">账本不存在或您没有权限访问</div>
      </div>
    );
  }
  
  // 使用真实数据
  const hasRecords = transactionsData && transactionsData.length > 0;

  // 根据选择的周期计算统计数据
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const currentYear = `${now.getFullYear()}`;
  
  // 计算本周的开始日期（周一）
  const getWeekStart = (date: Date) => {
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // 周日调整为上周最后一天
    const weekStart = new Date(date);
    weekStart.setDate(diff);
    return `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
  };
  const weekStart = getWeekStart(now);
  
  const monthlyStats = {
    income: 0,
    expense: 0,
    balance: 0,
  };
  
  // 判断是否有日期筛选：如果有则使用筛选范围，否则使用statsPeriod
  const hasDateFilter = filters.startDate || filters.endDate;
  
  if (transactionsData) {
    transactionsData.forEach((day: any) => {
      let shouldInclude = false;
      
      if (hasDateFilter) {
        // 有日期筛选时，统计所有返回的数据（后端已经按筛选范围过滤）
        shouldInclude = true;
      } else {
        // 没有日期筛选时，按statsPeriod统计
        switch (statsPeriod) {
          case 'day':
            shouldInclude = day.date === today;
            break;
          case 'week':
            shouldInclude = day.date >= weekStart && day.date <= today;
            break;
          case 'month':
            shouldInclude = day.date.startsWith(currentMonth);
            break;
          case 'year':
            shouldInclude = day.date.startsWith(currentYear);
            break;
        }
      }
      
      if (shouldInclude) {
        monthlyStats.income += day.income || 0;
        monthlyStats.expense += day.expense || 0;
      }
    });
    monthlyStats.balance = monthlyStats.income - monthlyStats.expense;
  }



  // 抽奖活动分组（在 return 前计算，避免 JSX 中使用 IIFE）
  const allLotteryActivities = (lotteryActivities as any[]) ?? [];
  // 普通用户不显示草稿状态；管理员/创建者可看到草稿
  const isManager = (ledgerData as any)?.userRole === 'owner' || (ledgerData as any)?.userRole === 'admin';
  const activeActivities = allLotteryActivities.filter((a: any) => {
    if (a.status === 'draft') return isManager; // 草稿只对管理员可见
    return ['open', 'drawing'].includes(a.status);
  });
  const pastActivities = allLotteryActivities.filter((a: any) => ['completed', 'cancelled'].includes(a.status));
  const displayLotteryList = lotteryTab === 'active' ? activeActivities : pastActivities;

  const lotteryStatusMap: Record<string, { label: string; color: string; icon: any }> = {
    draft: { label: '草稿', color: 'text-gray-500 bg-gray-100', icon: null },
    open: { label: '报名中', color: 'text-green-700 bg-green-100', icon: CheckCircle },
    drawing: { label: '开奖中', color: 'text-orange-700 bg-orange-100', icon: Loader },
    completed: { label: '已结束', color: 'text-gray-500 bg-gray-100', icon: CheckCircle },
    cancelled: { label: '已取消', color: 'text-red-700 bg-red-100', icon: XCircle },
  };
  const lotteryModeMap: Record<string, string> = {
    instant: '即时抽奖',
    scheduled: '定时开奖',
    milestone: '里程碑触发',
  };
  const lotterySeedMap: Record<string, string> = {
    sh_index: '上证指数',
    sz_index: '深证成指',
    ssq: '双色球',
    dlt: '超级大乐透',
  };
  const lotteryRegMap: Record<string, string> = {
    open: '自由报名',
    invite: '邀请制',
    organizer_add: '主办方添加',
  };

  // 倒计时辅助函数（tick 参数确保每秒重新计算）
  const formatCountdown = (targetTime: string | null | undefined): string => {
    void tick; // 依赖 tick 以触发每秒重渲染
    if (!targetTime) return '';
    const diff = new Date(targetTime).getTime() - Date.now();
    if (diff <= 0) return '即将开奖';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    if (h > 24) {
      const d = Math.floor(h / 24);
      return `还有 ${d} 天`;
    }
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  };

  // 参与进度百分比（基于 max_participants）
  const getProgressPct = (activity: any): number => {
    const max = activity.max_participants;
    const cur = activity.participantCount ?? 0;
    if (!max || max <= 0) return 0;
    return Math.min(100, Math.round((cur / max) * 100));
  };

  // 奖品占位图（如果没有图片，用渐变色占位）
  const PRIZE_PLACEHOLDER_COLORS = [
    'from-[#D32F2F] to-[#B71C1C]',
    'from-[#C62828] to-[#880E4F]',
    'from-[#AD1457] to-[#6A1B9A]',
    'from-[#4527A0] to-[#1565C0]',
    'from-[#0277BD] to-[#00695C]',
  ];

  return (
    <div className="min-h-screen bg-[var(--bg-cream)]">
      {/* 顶部区域 */}
      <div className="pb-4" style={{ backgroundColor: isCustomAF ? undefined : '#D32F2F', background: isCustomAF ? 'linear-gradient(135deg, #1A56DB 0%, #3B82F6 100%)' : undefined, color: '#FFFFFF' }}>
        {/* AF 账本：顶部一行（头像+名字 左，图标+返回 右）*/}
        {isCustomAF ? (
          <div className="px-4 pt-3 pb-2 flex items-center justify-between">
            {/* 左侧：头像 + 账本名 */}
            <div className="flex items-center gap-2">
              {(() => {
                const viewTarget = viewAsUserId ? (membersData as any[])?.find((m: any) => m.userId === viewAsUserId) : null;
                return (
                  <div
                    className={(!viewAsUserId && (isOwner || isAdmin)) ? 'cursor-pointer relative' : 'relative'}
                    onClick={() => { if (!viewAsUserId && (isOwner || isAdmin)) { setViewAsSearch(''); setShowViewAsPicker(true); } }}
                  >
                    {viewTarget ? (
                      <UserAvatar username={viewTarget.username} avatar={viewTarget.avatar} nickname={viewTarget.nickname} size="md" />
                    ) : user ? (
                      <UserAvatar username={user.username} avatar={user.avatar} nickname={user.nickname} size="md" />
                    ) : null}
                    {!viewAsUserId && (isOwner || isAdmin) && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-white/90 flex items-center justify-center">
                        <Users className="w-2.5 h-2.5 text-blue-600" />
                      </div>
                    )}
                  </div>
                );
              })()}
              <div className="flex flex-col">
                <span className="text-base font-semibold">{ledgerData.name}</span>
                {viewAsUserId && (() => {
                  const viewTarget = (membersData as any[])?.find((m: any) => m.userId === viewAsUserId);
                  return viewTarget ? <span className="text-xs text-white/70">查看: {viewTarget.nickname || viewTarget.username}</span> : null;
                })()}
              </div>
            </div>
            {/* 右侧：设置图标 + 返回按钮 */}
            <div className="flex items-center gap-2">
              {effectiveIsManager && (
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer"
                  style={{ backgroundColor: 'rgba(255,255,255,0.18)' }}
                  onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}
                >
                  <Settings className="w-4 h-4 text-white" />
                </div>
              )}
              <button
                onClick={() => setLocation(`/recharge?from=ledger&ledgerId=${ledgerId}${viewAsUserId ? `&viewAs=${viewAsUserId}` : ''}`)}
                className="px-3 py-1 rounded-full text-sm font-medium border border-white/60 text-white"
                style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
              >
                充値
              </button>
              <button
                onClick={() => setLocation(`/ledger/${ledgerId}/af-invite${viewAsUserId ? `?viewAs=${viewAsUserId}` : ''}`)}
                className="px-3 py-1 rounded-full text-sm font-medium border border-white/60 text-white"
                style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
              >
                邀请
              </button>
              <button
                onClick={() => setLocation('/ledger')}
                className="px-3 py-1 rounded-full text-sm font-medium border border-white/60 text-white"
                style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
              >
                返回
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* 标题栏 */}
            <div className="px-4 pt-3 pb-2 flex items-center justify-between">
              <button
                onClick={() => setLocation("/ledger")}
                className="p-1 -ml-2"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <div className="flex items-center flex-1">
                <h1 className="text-lg font-medium">{ledgerData.name}</h1>
              </div>
            </div>

            {/* 成员头像和功能按鈕 */}
            <div className="px-4 py-2 flex items-center justify-between">
              {/* 左侧：普通账本显示所有共享成员头像；定制账本只显示当前用户 */}
              <div className="flex items-center gap-1">
                {!isCustomAE ? (
                  // 普通账本 / 减肥账本：显示所有成员头像
                  (membersData && membersData.length > 0 ? membersData : (user ? [{ username: user.username, avatar: user.avatar, nickname: user.nickname }] : [])).slice(0, 6).map((m: any, i: number) => (
                    <UserAvatar
                      key={i}
                      username={m.username || m.user?.username}
                      avatar={m.avatar || m.user?.avatar}
                      nickname={m.nickname || m.user?.nickname}
                      size="md"
                    />
                  ))
                ) : (
                  // AE 抽奖箱：只显示当前用户
                  user && (
                    <UserAvatar
                      username={user.username}
                      avatar={user.avatar}
                      nickname={user.nickname}
                      size="md"
                    />
                  )
                )}
              </div>

              {/* 功能按鈕（靠右） */}
              <div className="flex items-center gap-2">
                {/* 减肥账本教练：学员管理按鈕 */}
                {isDietCoach && (
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer shadow-sm"
                    style={{ backgroundColor: '#FFFFFF' }}
                    onClick={() => setLocation(`/ledger/${ledgerId}/diet-members`)}
                  >
                    <Users className="w-5 h-5" style={{ color: '#D32F2F' }} />
                  </div>
                )}
                {/* 普通账本：查找按鈕 */}
                {!isCustomAE && !isDiet && !isCustomAF && (
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer shadow-sm"
                    style={{ backgroundColor: '#FFFFFF' }}
                    onClick={() => setLocation(`/ledger/${ledgerId}/filter`)}
                  >
                    <Search className="w-5 h-5" style={{ color: '#D32F2F' }} />
                  </div>
                )}
                {/* 普通账本：数据统计按鈕 */}
                {!isCustomAE && !isDiet && !isCustomAF && (
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer shadow-sm"
                    style={{ backgroundColor: '#FFFFFF' }}
                    onClick={() => setLocation(`/ledger/${ledgerId}/report`)}
                  >
                    <BarChart3 className="w-5 h-5" style={{ color: '#D32F2F' }} />
                  </div>
                )}
                {/* 管理员或创建者：设置按鈕（视角切换时按目标角色显示） */}
                {effectiveIsManager && (
                  <div 
                    className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer shadow-sm"
                    style={{ backgroundColor: '#FFFFFF' }}
                    onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}
                  >
                    <Settings className="w-5 h-5" style={{ color: '#D32F2F' }} />
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* 减肥账本：保留进度面板 */}
        {isDiet && (
          <div className="px-4 pt-2 pb-3">
            {dietConfig ? (
              <>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-center">
                    <div className="text-xs opacity-80">初始体重</div>
                    <div className="text-base font-semibold">{dietInitialWeight ?? '--'}<span className="text-xs font-normal ml-0.5">斤</span></div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs opacity-80">当前体重</div>
                    <div className="text-xl font-bold">{dietCurrentWeight ?? '--'}<span className="text-xs font-normal ml-0.5">斤</span></div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs opacity-80">目标体重</div>
                    <div className="text-base font-semibold">{dietTargetWeight ?? '--'}<span className="text-xs font-normal ml-0.5">斤</span></div>
                  </div>
                </div>
                <div className="bg-white/30 rounded-full h-2 mb-1">
                  <div className="bg-white rounded-full h-2 transition-all" style={{ width: `${dietProgress}%` }} />
                </div>
                <div className="flex justify-between text-xs opacity-80">
                  <span>已减 {dietLostWeight > 0 ? dietLostWeight.toFixed(1) : 0} 斤</span>
                  <span>{dietProgress}%</span>
                  <span>消耗 {dietTotalCalories.toLocaleString()} kcal</span>
                </div>
              </>
            ) : (
              <div className="text-center py-2 opacity-80">
                <div className="text-sm">{isDietCoach ? '在学员管理中为成员设置减肥档案' : '等待教练设置你的减肥档案'}</div>
              </div>
            )}
          </div>
        )}
        {/* AF 账本：2×2 数据容器 */}
        {isCustomAF && (
          <div className="px-4 pt-2 pb-4">
            <div className="grid grid-cols-2 gap-3">
              {/* 卡片 1：总资产估值 */}
              <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
                <div className="text-xs text-white/70 mb-1">余额</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-bold text-white">
                    {afTotalAsset ? Number(afTotalAsset.total).toFixed(2) : '0.00'}
                  </span>
                  <span className="text-xs text-white/60">USDT</span>
                </div>
              </div>
              {/* 卡片 2：推荐人数（YJH 显示直推+间推，其他用户显示总推荐） */}
              <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
                <div className="text-xs text-white/70 mb-1">推荐</div>
                {((afTotalAsset as any)?.directReferralCount > 0 || (afTotalAsset as any)?.indirectReferralCount > 0) ? (
                  <div className="space-y-0.5">
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm font-bold text-white">直接伙伴</span>
                      <span className="text-lg font-bold text-white">{(afTotalAsset as any)?.directReferralCount ?? 0}</span>
                      <span className="text-xs text-white/60">人</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm font-bold text-white">延伸伙伴</span>
                      <span className="text-lg font-bold text-white">{(afTotalAsset as any)?.indirectReferralCount ?? 0}</span>
                      <span className="text-xs text-white/60">人</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-bold text-white">{(afTotalAsset as any)?.inviteCount ?? 0}</span>
                    <span className="text-xs text-white/60">人</span>
                  </div>
                )}
              </div>
              {/* 卡片 3：仓位 */}
              <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
                <div className="text-xs text-white/70 mb-1">仓位</div>
                {(afTotalAsset as any)?.positions ? (
                  <div className="space-y-1">
                    {['BTC', 'ETH', 'SOL'].map(coin => {
                      const qty = (afTotalAsset as any).positions[coin] ?? 0;
                      return (
                        <div key={coin} className="flex items-baseline justify-between">
                          <span className="text-xs text-white/70">{coin}</span>
                          <span className="text-sm font-bold text-white">
                            {qty > 0 ? (() => {
                              const maxDecimals = coin === 'BTC' ? 8 : 6;
                              const raw = qty.toFixed(maxDecimals);
                              // 智能去除末尾零，但至少保留2位小数
                              const [intPart, decPart] = raw.split('.');
                              const trimmed = decPart.replace(/0+$/, '');
                              const finalDec = trimmed.length < 2 ? trimmed.padEnd(2, '0') : trimmed;
                              return `${intPart}.${finalDec}`;
                            })() : '0'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-lg font-bold text-white">--</div>
                )}
              </div>
              {/* 卡片 4 */}
              <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
                <div className="text-xs text-white/70 mb-1">累计盈亏</div>
                <div className="text-lg font-bold text-white">--</div>
                <div className="text-xs text-white/60 mt-1">待接入数据</div>
              </div>
            </div>
          </div>
        )}
        {/* 普通账本：统计面板（总收入/总结余/总支出）*/}
        {!isCustomAE && !isDiet && !isCustomAF && (
          <div className="px-4 pt-2 pb-1 relative">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="relative">
                <div className="text-xs opacity-90 flex items-center justify-center gap-1">
                  <span>
                    {!hasDateFilter && statsPeriod === 'day' && '今日'}
                    {!hasDateFilter && statsPeriod === 'week' && '本周'}
                    {!hasDateFilter && statsPeriod === 'month' && `${now.getMonth() + 1}月`}
                    {!hasDateFilter && statsPeriod === 'year' && '今年'}
                    总收入
                  </span>
                  <button
                    onClick={() => setShowPeriodMenu(!showPeriodMenu)}
                    className="inline-flex items-center justify-center w-4 h-4"
                  >
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 12 12">
                      <path d="M6 8L2 4h8z" />
                    </svg>
                  </button>
                </div>
                <div className="text-lg font-medium">{monthlyStats.income.toFixed(2)}</div>
                {showPeriodMenu && (
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden z-50 w-[5.5rem]">
                    {(['day', 'week', 'month', 'year'] as const).map((p, i) => (
                      <button
                        key={p}
                        onClick={() => { setStatsPeriod(p); setShowPeriodMenu(false); }}
                        className="w-full px-2 py-2.5 text-sm text-[#222222] active:bg-gray-100 text-center border-b border-gray-100 last:border-b-0"
                      >
                        {['按天', '按自然周', '按自然月', '按自然年'][i]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div className="text-xs opacity-90">
                  {!hasDateFilter && statsPeriod === 'day' && '今日'}
                  {!hasDateFilter && statsPeriod === 'week' && '本周'}
                  {!hasDateFilter && statsPeriod === 'month' && `${now.getMonth() + 1}月`}
                  {!hasDateFilter && statsPeriod === 'year' && '今年'}
                  总结余
                </div>
                <div className="text-lg font-medium">{monthlyStats.balance.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs opacity-90">
                  {!hasDateFilter && statsPeriod === 'day' && '今日'}
                  {!hasDateFilter && statsPeriod === 'week' && '本周'}
                  {!hasDateFilter && statsPeriod === 'month' && `${now.getMonth() + 1}月`}
                  {!hasDateFilter && statsPeriod === 'year' && '今年'}
                  总支出
                </div>
                <div className="text-lg font-medium">{monthlyStats.expense.toFixed(2)}</div>
              </div>
            </div>
          </div>
        )}
      </div>



      {/* 待审批提示 */}
      {pendingApprovals.length > 0 && (
        <div 
          className="mx-4 mt-3 mb-2 bg-[#FFEBEE] border border-orange-200 rounded-lg p-3 flex items-center gap-2 cursor-pointer hover:bg-[#FFEBEE] transition-colors"
          onClick={() => setLocation(`/ledger/${ledgerId}/pending-approvals`)}
        >
          <Search className="w-4 h-4 text-[#CBA471] flex-shrink-0" />
          <span className="text-sm text-orange-800">
            你有 <span className="font-semibold">{pendingApprovals.length}</span> 个待审批账目
          </span>
          <ChevronRight className="w-4 h-4 text-[#CBA471] ml-auto" />
        </div>
      )}

      {/* 抽奖活动列表（双 Tab：正在进行中 / 往期回顾）—— 仅 custom_ae 账本 */}
      {isCustomAE && (
        <div className="flex-1 pb-20">
          {/* 子 Tab 切换栏 */}
          <div className="flex mx-4 mt-3 mb-3 rounded-xl overflow-hidden" style={{ backgroundColor: '#F5F5F5' }}>
            <button
              className={`flex-1 py-2.5 text-sm font-medium transition-colors rounded-xl ${
                lotteryTab === 'active'
                  ? 'bg-[#D32F2F] text-white shadow-sm'
                  : 'text-gray-500'
              }`}
              onClick={() => setLotteryTab('active')}
            >
              正在进行中
              {activeActivities.length > 0 && (
                <span className={`ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-xs ${
                  lotteryTab === 'active' ? 'bg-white/30 text-white' : 'bg-[#D32F2F] text-white'
                }`}>
                  {activeActivities.length}
                </span>
              )}
            </button>
            <button
              className={`flex-1 py-2.5 text-sm font-medium transition-colors rounded-xl ${
                lotteryTab === 'past'
                  ? 'bg-[#D32F2F] text-white shadow-sm'
                  : 'text-gray-500'
              }`}
              onClick={() => setLotteryTab('past')}
            >
              往期回顾
              {pastActivities.length > 0 && (
                <span className={`ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-xs ${
                  lotteryTab === 'past' ? 'bg-white/30 text-white' : 'bg-gray-400 text-white'
                }`}>
                  {pastActivities.length}
                </span>
              )}
            </button>
          </div>

          {/* 大图卡片流列表 */}
          <div className="px-4 space-y-3">
            {lotteryLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader className="w-6 h-6 text-[#D32F2F] animate-spin" />
              </div>
            ) : displayLotteryList.length === 0 ? (
              <div className="text-center py-12">
                <Gift className="w-14 h-14 text-gray-200 mx-auto mb-3" />
                {lotteryTab === 'active' ? (
                  <>
                    <div className="text-gray-400 text-base mb-1 font-medium">暂无进行中的活动</div>
                    <div className="text-gray-400 text-sm">账本管理员可在设置中创建抽奖活动</div>
                  </>
                ) : (
                  <>
                    <div className="text-gray-400 text-base mb-1 font-medium">还没有历史活动</div>
                    <div className="text-gray-400 text-sm">已结束或已取消的活动将在这里展示</div>
                  </>
                )}
              </div>
            ) : (
              displayLotteryList.map((activity: any, idx: number) => {
                const isActive = ['draft', 'open', 'drawing'].includes(activity.status);
                const isCompleted = activity.status === 'completed';
                const isCancelled = activity.status === 'cancelled';
                const placeholderGrad = PRIZE_PLACEHOLDER_COLORS[idx % PRIZE_PLACEHOLDER_COLORS.length];
                const firstWinnerName = activity.firstWinnerName || null;
                const recentParticipants: any[] = activity.recentParticipants ?? [];
                const participantCount = Number(activity.participantCount ?? 0);

                // 计算报名倒计时（依赖 tick 每秒刷新）
                void tick;
                const now = Date.now();
                const signupEndMs = activity.signup_end_at ? new Date(activity.signup_end_at).getTime() : null;
                const drawAtMs = activity.draw_at ? new Date(activity.draw_at).getTime() : null;
                const signupDiff = signupEndMs ? signupEndMs - now : null;
                const drawDiff = drawAtMs ? drawAtMs - now : null;

                // 格式化倒计时为 { d, h, m, s } 对象
                const parseDiff = (diff: number | null) => {
                  if (diff === null) return null;
                  if (diff <= 0) return { ended: true, d: 0, h: 0, m: 0, s: 0 };
                  const totalSec = Math.floor(diff / 1000);
                  const d = Math.floor(totalSec / 86400);
                  const h = Math.floor((totalSec % 86400) / 3600);
                  const m = Math.floor((totalSec % 3600) / 60);
                  const s = totalSec % 60;
                  return { ended: false, d, h, m, s };
                };
                const signupCd = parseDiff(signupDiff);
                const drawCd = parseDiff(drawDiff);

                // 格式化已过去时间（显示结束时间）
                const fmtDate = (ts: number) => {
                  const d = new Date(ts);
                  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
                };

                // 翻牌数字组件（内联）
                const FlipDigit = ({ val, label }: { val: number; label: string }) => (
                  <div className="flex flex-col items-center">
                    <div
                      className="flex items-center justify-center rounded-md text-white font-bold text-[18px] leading-none"
                      style={{
                        width: '36px', height: '40px',
                        background: 'linear-gradient(180deg, #C62828 0%, #B71C1C 50%, #8B0000 50%, #7B0000 100%)',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
                        fontVariantNumeric: 'tabular-nums',
                        letterSpacing: '-0.02em',
                      }}
                    >
                      {String(val).padStart(2, '0')}
                    </div>
                    <span className="text-[9px] text-gray-400 mt-0.5">{label}</span>
                  </div>
                );

                // 倒计时显示组件
                const CountdownBlock = ({ cd, label, endedText, endedDate }: {
                  cd: ReturnType<typeof parseDiff>;
                  label: string;
                  endedText: string;
                  endedDate?: string; // 已结束时显示的日期文字（与翻牌块等高）
                }) => (
                  <div className="flex flex-col items-center">
                    <span className="text-[9px] text-gray-400 mb-1">{label}</span>
                    {!cd || cd.ended ? (
                      // 已结束：用类似翻牌块的容器显示，保持视觉高度一致
                      <div className="flex items-center gap-1">
                        <div
                          className="px-3 py-2 rounded-lg flex items-center justify-center"
                          style={{ background: '#EEEEEE', minWidth: '80px' }}
                        >
                          <span className="text-[11px] font-semibold text-center" style={{ color: '#9E9E9E' }}>
                            {endedDate ?? endedText}
                          </span>
                        </div>
                      </div>
                    ) : cd.d > 0 ? (
                      <div className="flex items-end gap-0.5">
                        <FlipDigit val={cd.d} label="天" />
                        <FlipDigit val={cd.h} label="时" />
                        <FlipDigit val={cd.m} label="分" />
                      </div>
                    ) : (
                      <div className="flex items-end gap-0.5">
                        <FlipDigit val={cd.h} label="时" />
                        <FlipDigit val={cd.m} label="分" />
                        <FlipDigit val={cd.s} label="秒" />
                      </div>
                    )}
                  </div>
                );

                return (
                  <div
                    key={activity.id}
                    className="relative rounded-2xl overflow-hidden cursor-pointer"
                    style={{
                      background: '#fff',
                      boxShadow: isActive
                        ? '0 4px 24px rgba(211,47,47,0.13)'
                        : '0 2px 10px rgba(0,0,0,0.07)',
                      opacity: isCancelled ? 0.6 : 1,
                      transition: 'transform 0.15s ease',
                    }}
                    onClick={() => setLocation(`/lottery/${activity.id}`)}
                    onTouchStart={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.98)'; }}
                    onTouchEnd={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
                  >
                    {/* 已结束蒙层 */}
                    {!isActive && (
                      <div className="absolute inset-0 bg-white/40 z-10 pointer-events-none" />
                    )}

                    {/* Ribbon 标签 */}
                    {isCompleted && (
                      <div
                        className="absolute top-5 right-[-22px] z-20 text-white text-[9px] font-bold px-8 py-0.5 rotate-45"
                        style={{ background: '#757575', letterSpacing: '0.08em' }}
                      >
                        已开奖
                      </div>
                    )}
                    {isCancelled && (
                      <div
                        className="absolute top-5 right-[-22px] z-20 text-white text-[9px] font-bold px-8 py-0.5 rotate-45"
                        style={{ background: '#EF5350', letterSpacing: '0.08em' }}
                      >
                        已取消
                      </div>
                    )}
                    {activity.status === 'draft' && (
                      <div
                        className="absolute top-5 right-[-22px] z-20 text-white text-[9px] font-bold px-8 py-0.5 rotate-45"
                        style={{ background: '#BDBDBD', letterSpacing: '0.08em' }}
                      >
                        草稿
                      </div>
                    )}

                    {/* ── 顶部：横幅图片区（16:9） ── */}
                    <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
                      {activity.banner_image_url || activity.cover_image_url ? (
                        <img
                          src={activity.banner_image_url || activity.cover_image_url}
                          alt={activity.title}
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      ) : (
                        <div
                          className={`absolute inset-0 w-full h-full bg-gradient-to-br ${placeholderGrad} flex flex-col items-center justify-center gap-2`}
                        >
                          <Gift className="w-12 h-12 text-white/70" />
                          <span className="text-white/50 text-[11px] tracking-wide">奖品图片</span>
                        </div>
                      )}
                      {/* 图片底部渐变遮罩 + 标题叠加 */}
                      <div
                        className="absolute bottom-0 left-0 right-0 px-3 pt-8 pb-2.5"
                        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, transparent 100%)' }}
                      >
                        <span className="text-white text-[15px] font-bold line-clamp-1 block" style={{ lineHeight: '1.4', textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
                          {activity.title}
                        </span>
                      </div>
                      {/* 右上角浮层已移除，倒计时改为状态条显示 */}
                      {/* 开奖中火焰标（左上角） */}
                      {activity.status === 'drawing' && (
                        <div className="absolute top-2 left-2 bg-orange-500 rounded-full p-1 z-10"
                          style={{ boxShadow: '0 2px 6px rgba(255,109,0,0.5)' }}>
                          <Flame className="w-3.5 h-3.5 text-white" />
                        </div>
                      )}
                    </div>
                    {/* ── 通栏状态条：图片下方，左边距开奖倒计时，右边报名截止时间 ── */}
                    {isActive && (
                      <div
                        className="flex items-center px-3 py-2"
                        style={{ background: 'rgba(28,18,18,0.05)', borderBottom: '1px solid rgba(0,0,0,0.05)' }}
                      >
                        {/* ─── 左1/3：距开奖 ─── */}
                        <div className="flex items-center justify-center gap-1 overflow-hidden" style={{ flex: 1 }}>
                          {drawAtMs ? (
                            <>
                              <span className="text-[10px] font-medium flex-shrink-0" style={{ color: '#B71C1C' }}>距开奖</span>
                              {drawCd && !drawCd.ended ? (
                                <span className="text-[12px] font-bold tabular-nums flex-shrink-0" style={{ color: '#B71C1C', letterSpacing: '-0.02em' }}>
                                  {drawCd.d > 0
                                    ? `${String(drawCd.d).padStart(2,'0')}天${String(drawCd.h).padStart(2,'0')}时`
                                    : `${String(drawCd.h).padStart(2,'0')}:${String(drawCd.m).padStart(2,'0')}:${String(drawCd.s).padStart(2,'0')}`
                                  }
                                </span>
                              ) : (
                                <span className="text-[10px] font-semibold flex-shrink-0" style={{ color: '#9E9E9E' }}>即将开奖</span>
                              )}
                            </>
                          ) : activity.status === 'drawing' ? (
                            <span className="text-[10px] font-bold" style={{ color: '#E65100' }}>开奖中</span>
                          ) : activity.status === 'draft' ? (
                            <span className="text-[10px] font-bold" style={{ color: '#9E9E9E' }}>草稿</span>
                          ) : <span className="text-[10px]" style={{ color: '#BDBDBD' }}>—</span>}
                        </div>

                        {/* 细竖线1 */}
                        <div className="flex-shrink-0" style={{ width: '0.5px', height: 14, background: 'rgba(0,0,0,0.13)' }} />

                        {/* ─── 中1/3：报名截止 ─── */}
                        <div className="flex items-center justify-center overflow-hidden" style={{ flex: 1 }}>
                          {signupEndMs ? (
                            <span className="text-[10px] truncate" style={{ color: signupCd?.ended ? '#9E9E9E' : '#5a5a5a' }}>
                              {signupCd?.ended ? `截止 ${fmtDate(signupEndMs)}` : `截止 ${fmtDate(signupEndMs)}`}
                            </span>
                          ) : (
                            <span className="text-[10px]" style={{ color: '#BDBDBD' }}>—</span>
                          )}
                        </div>

                        {/* 细竖线2 */}
                        <div className="flex-shrink-0" style={{ width: '0.5px', height: 14, background: 'rgba(0,0,0,0.13)' }} />

                        {/* ─── 右1/3：中奖者 ─── */}
                        <div className="flex items-center justify-center gap-1.5 overflow-hidden" style={{ flex: 1 }}>
                          {activity.firstWinnerName ? (
                            <>
                              <div className="rounded-full overflow-hidden flex-shrink-0" style={{ width: 16, height: 16 }}>
                                {activity.firstWinnerAvatar ? (
                                  <img src={activity.firstWinnerAvatar} alt={activity.firstWinnerName} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-white font-bold" style={{ background: '#B71C1C', fontSize: 7 }}>
                                    {(activity.firstWinnerName || '?')[0]}
                                  </div>
                                )}
                              </div>
                              <span className="text-[10px] truncate" style={{ color: '#5a5a5a' }}>{activity.firstWinnerName}</span>
                            </>
                          ) : (
                            <>
                              <div className="rounded-full flex-shrink-0" style={{ width: 16, height: 16, background: 'rgba(0,0,0,0.06)', border: '1px dashed rgba(0,0,0,0.15)' }} />
                              <span className="text-[10px]" style={{ color: '#BDBDBD' }}>待开奖</span>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ── 底部：参与人数 + 头像 ── */}
                    <div className="px-3 py-2.5 flex items-center gap-2 overflow-hidden">
                      {isActive ? (
                        <>
                          {/* 左侧：参与人数，不压缩 */}
                          <span className="text-[11px] text-gray-400 flex-shrink-0">{participantCount} 人已参与</span>
                          {/* 头像堆叠：紧跟在文字后，从左开始排列，不靠右 */}
                          {recentParticipants.length > 0 && (() => {
                            const MAX_SHOW = 7;
                            const shown = recentParticipants.slice(0, MAX_SHOW);
                            const extra = participantCount - shown.length;
                            const avatarSize = 30;
                            const overlapPx = 9;
                            return (
                              <div className="flex items-center">
                                {shown.map((p: any, pi: number) => (
                                  <div
                                    key={pi}
                                    className="rounded-full border-2 border-white overflow-hidden flex-shrink-0"
                                    style={{
                                      width: avatarSize,
                                      height: avatarSize,
                                      marginLeft: pi === 0 ? 0 : -overlapPx,
                                      zIndex: MAX_SHOW - pi,
                                      position: 'relative',
                                    }}
                                  >
                                    {p.avatar_url ? (
                                      <img src={p.avatar_url} alt={p.display_name} className="w-full h-full object-cover" />
                                    ) : (
                                      <div
                                        className="w-full h-full flex items-center justify-center font-bold text-white"
                                        style={{ background: '#D32F2F', fontSize: 11 }}
                                      >
                                        {(p.display_name || '?')[0]}
                                      </div>
                                    )}
                                  </div>
                                ))}
                                {extra > 0 && (
                                  <div
                                    className="rounded-full border-2 border-white flex items-center justify-center flex-shrink-0 font-bold text-white"
                                    style={{
                                      width: avatarSize,
                                      height: avatarSize,
                                      marginLeft: -overlapPx,
                                      background: '#BDBDBD',
                                      zIndex: 0,
                                      position: 'relative',
                                      fontSize: 8,
                                    }}
                                  >+{extra}</div>
                                )}
                              </div>
                            );
                          })()}
                        </>
                      ) : (
                        <>
                          {/* 已结束：中奖者或参与人数 */}
                          <div className="flex items-center gap-1">
                            {firstWinnerName ? (
                              <>
                                <Trophy className="w-3.5 h-3.5 text-[#CBA471]" />
                                <span className="text-[11px] text-gray-500 truncate max-w-[140px]">中奖：{firstWinnerName}</span>
                              </>
                            ) : (
                              <>
                                <Users className="w-3.5 h-3.5 text-gray-400" />
                                <span className="text-[11px] text-gray-400">{participantCount} 人参与</span>
                              </>
                            )}
                            {/* 已结束时间说明 */}
                            {isCompleted && drawAtMs && (
                              <span className="text-[10px] text-gray-300 ml-1">· {fmtDate(drawAtMs)} 开奖</span>
                            )}
                          </div>
                          <button
                            className="text-[11px] font-medium text-gray-400 border border-gray-200 px-3.5 py-1.5 rounded-full bg-white flex-shrink-0"
                            onClick={e => { e.stopPropagation(); setLocation(`/lottery/${activity.id}`); }}
                          >
                            查看名单
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 加密货币竞猜入口 —— 仅 custom_af 账本 */}
      {isCustomAF && (
        <div className="flex-1 px-4 pb-20">
          <div className="mt-4 space-y-3">
            {/* BTC 入口 */}
            <button
              onClick={() => setLocation(`/ledger/${ledgerId}/crypto-prediction${viewAsUserId ? `?viewAs=${viewAsUserId}` : ''}`)}
              className="w-full rounded-2xl p-4 flex items-center gap-4 shadow-sm active:opacity-90"
              style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E8FF', boxShadow: '0 2px 8px rgba(26,86,219,0.08)' }}
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden" style={{ backgroundColor: 'rgba(247,147,26,0.10)' }}>
                <img src="https://assets.coingecko.com/coins/images/1/large/bitcoin.png" alt="BTC" className="w-9 h-9 object-contain" />
              </div>
              <div className="text-left flex-1">
                <div className="font-semibold text-base" style={{ color: '#1A2340' }}>比特币 (BTC)</div>
              </div>
              <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: '#3B5BDB' }}>
                <ChevronRight className="w-4 h-4 text-white" />
              </div>
            </button>
            {/* ETH 入口 */}
            <button
              onClick={() => setLocation(`/ledger/${ledgerId}/crypto-prediction?coin=ETH${viewAsUserId ? `&viewAs=${viewAsUserId}` : ''}`)}
              className="w-full rounded-2xl p-4 flex items-center gap-4 shadow-sm active:opacity-90"
              style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E8FF', boxShadow: '0 2px 8px rgba(26,86,219,0.08)' }}
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden" style={{ backgroundColor: 'rgba(98,126,234,0.10)' }}>
                <img src="https://assets.coingecko.com/coins/images/279/large/ethereum.png" alt="ETH" className="w-9 h-9 object-contain" />
              </div>
              <div className="text-left flex-1">
                <div className="font-semibold text-base" style={{ color: '#1A2340' }}>以太坊 (ETH)</div>
              </div>
              <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: '#3B5BDB' }}>
                <ChevronRight className="w-4 h-4 text-white" />
              </div>
            </button>
            {/* SOL 入口 */}
            <button
              onClick={() => setLocation(`/ledger/${ledgerId}/crypto-prediction?coin=SOL${viewAsUserId ? `&viewAs=${viewAsUserId}` : ''}`)}
              className="w-full rounded-2xl p-4 flex items-center gap-4 shadow-sm active:opacity-90"
              style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E8FF', boxShadow: '0 2px 8px rgba(26,86,219,0.08)' }}
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden" style={{ backgroundColor: 'rgba(0,210,150,0.10)' }}>
                <img src="https://assets.coingecko.com/coins/images/4128/large/solana.png" alt="SOL" className="w-9 h-9 object-contain" />
              </div>
              <div className="text-left flex-1">
                <div className="font-semibold text-base" style={{ color: '#1A2340' }}>索拉纳 (SOL)</div>
              </div>
              <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: '#3B5BDB' }}>
                <ChevronRight className="w-4 h-4 text-white" />
              </div>
            </button>
          </div>
        </div>
      )}

      {/* 记账记录列表 —— 非 custom_ae / custom_af 账本显示 */}
      {!isCustomAE && !isCustomAF && <div className={`flex-1 px-4 pb-20 space-y-3`}>
        {!hasRecords ? (
          <div className="text-center py-12">
            <div className="text-gray-400 text-base mb-1">{ledgerData?.type === 'diet' ? '还没有减肥记录' : '还没有记账记录'}</div>
            <div className="text-gray-400 text-sm">{ledgerData?.type === 'diet' ? '点击下方按钮，添加减肥记录' : '点击下方"+"按钮开始记账'}</div>
          </div>
        ) : (
          transactionsData.map((dayRecord: any) => {
            // 计算星期
            const date = new Date(dayRecord.date);
            const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
            const dayOfWeek = weekDays[date.getDay()];
            
            return (
              <div key={dayRecord.date}>
                {/* 日期标题 */}
                <div className="flex items-center justify-between text-xs text-gray-500" style={{ marginTop: '3px', marginBottom: '3px' }}>
                  <span>
                    {dayRecord.date} {dayOfWeek}
                  </span>
                  {!isDiet && (
                    <span className="text-xs">
                      收:{dayRecord.income.toFixed(2)}, 支:{dayRecord.expense.toFixed(2)}, 余:{dayRecord.balance.toFixed(2)}
                    </span>
                  )}
                </div>

                {/* 当天的记录 */}
                <div className="space-y-2">
                  {dayRecord.records.map((record: any) => (
                    <div
                      key={record.id}
                      className="bg-white rounded-lg p-2 flex items-center gap-2.5 cursor-pointer hover:bg-[#FFEBEE] transition-colors"
                      onClick={() => setLocation(`/ledger/${ledgerId}/transaction/${record.id}`)}
                    >
                      {/* 成员头像 */}
                      <div className="flex-shrink-0">
                        <UserAvatar
                          username={record.member?.username}
                          avatar={record.member?.avatar}
                          nickname={record.member?.nickname}
                          size="sm"
                        />
                      </div>

                      {/* 分类信息 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${record.type === 'expense' ? 'bg-[#D32F2F]-light0' : 'bg-[#4CAF50]'}`}></span>
                          <span className="text-xs text-[#222222] font-normal">
                            {isDiet && record.description?.startsWith('[diet:') ? (() => {
                              // 对 diet 分类名做前端清洗：去掉 emoji，并根据 description 标签补充单位
                              const desc = record.description || '';
                              const m = desc.match(/^\[diet:(\w+):([^\]]+)/);
                              const type = m ? m[1] : '';
                              const unit = m ? m[2].split(':')[0] : '';
                              // 去掉分类名中的 emoji（Unicode 范围）
                              const cleanName = (record.category || '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\s]+/gu, '').trim();
                              // 如果分类名已包含单位则直接显示，否则补充
                              if (cleanName.includes('/')) return cleanName;
                              // 根据类型补充单位
                              const unitMap: Record<string, string> = { weight: '斤', bmi: '', calorie: 'kcal', measurement: 'cm' };
                              const u = unit || unitMap[type] || '';
                              return u ? `${cleanName}/${u}` : cleanName;
                            })() : record.category}
                          </span>
                          {/* 图片图标 */}
                          {record.imageUrl && (
                            <svg className="w-3.5 h-3.5 ml-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="#1976D2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                              <circle cx="8.5" cy="8.5" r="1.5"/>
                              <polyline points="21 15 16 10 5 21"/>
                            </svg>
                          )}
                          {/* 待审批图标 */}
                          {record.approvalStatus === 'pending' && (
                            <span className="ml-1 text-[#D32F2F] text-xs flex items-center gap-0.5">
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                                <circle cx="12" cy="12" r="10" opacity="0.2" />
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" opacity="0.3" />
                                <text x="12" y="16" textAnchor="middle" fontSize="10" fill="currentColor" fontWeight="bold">审</text>
                              </svg>
                            </span>
                          )}
                          {/* 报销状态图标 */}
                          {record.reimbursementStatus === 'pending' && (
                            <Receipt className="w-3.5 h-3.5 ml-0.5 text-[#1976D2] flex-shrink-0" />
                          )}
                          {/* 待结状态图标 */}
                          {record.pendingType && (
                            <Hourglass className="w-3.5 h-3.5 ml-0.5 text-[#1976D2] flex-shrink-0" title={record.pendingType === 'receivable' ? '代收' : '代付'} />
                          )}
                        </div>
                        {record.description && !record.description.startsWith('[diet:') && (
                          <div className="text-xs text-gray-500 mt-0.5 ml-2.5 font-light">{record.description}</div>
                        )}
                      </div>

                      {/* 金额 / 减肥数据 */}
                      {isDiet && record.description?.startsWith('[diet:') ? (
                        (() => {
                          // 分类名已包含单位（如“体重/斤”、“BMI”、“胸围/cm”），右侧只显示纯数字
                          const val = record.amount;
                          return (
                            <div className="text-sm font-semibold flex-shrink-0 text-[#D32F2F]">
                              {val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)}
                            </div>
                          );
                        })()
                      ) : (
                        <div className={`text-sm font-normal flex-shrink-0 ${
                          record.pendingType && record.pendingIncludeStats === 0
                            ? 'text-gray-400'
                            : record.type === 'expense' ? 'text-[#D32F2F]' : 'text-[#4CAF50]'
                        }`}>
                          {record.type === 'expense' ? '-' : '+'}{record.amount.toFixed(2)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>}

      {/* 底部添加按钮：非 custom_ae 账本显示 */}
      {!isCustomAE && !isDiet && !isCustomAF && (
        <button
          onClick={() => setLocation(`/ledger/${ledgerId}/add`)}
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all inline-flex items-center justify-center"
          style={{ backgroundColor: '#D32F2F', color: '#FFFFFF' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
      )}
      {/* 减肥账本打卡按钮 */}
      {isDiet && (
        <button
          onClick={() => setLocation(`/ledger/${ledgerId}/diet-checkin`)}
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all inline-flex items-center justify-center"
          style={{ backgroundColor: '#D32F2F', color: '#FFFFFF' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
      )}

      {/* 成员列表弹窗 */}
      {membersData && (
        <MembersDialog
          open={showMembersDialog}
          onOpenChange={setShowMembersDialog}
          members={membersData}
        />
      )}

      {/* AF 视角切换横幅 */}
      {isCustomAF && viewAsUserId && (isOwner || isAdmin) && (
        <div className="fixed bottom-0 left-0 right-0 z-[60] flex items-center justify-between px-4 py-3 safe-area-bottom" style={{ backgroundColor: '#F59E0B', color: '#1A2340' }}>
          <div className="flex items-center gap-2 text-sm font-medium">
            <Users className="w-4 h-4" />
            <span>正在以 {(() => {
              const t = (membersData as any[])?.find((m: any) => m.userId === viewAsUserId);
              return t ? (t.nickname || t.username) : '未知用户';
            })()} 的视角查看</span>
          </div>
          <button
            onClick={() => handleSwitchView(null)}
            className="px-3 py-1 rounded-full text-xs font-medium bg-white/90 text-gray-800"
          >
            切回我的视角
          </button>
        </div>
      )}

      {/* AF 视角切换弹窗：成员列表 + 搜索 */}
      {showViewAsPicker && isCustomAF && (isOwner || isAdmin) && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center" onClick={() => setShowViewAsPicker(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full max-w-md bg-white rounded-t-2xl max-h-[70vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* 头部 */}
            <div className="px-4 pt-4 pb-2 border-b border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-900">切换查看视角</h3>
                <button onClick={() => setShowViewAsPicker(false)} className="text-gray-400 text-xl">×</button>
              </div>
              {/* 搜索框 */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="搜索成员名称..."
                  value={viewAsSearch}
                  onChange={e => setViewAsSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>
            {/* 成员列表 */}
            <div className="flex-1 overflow-y-auto px-4 py-2">
              {/* 切回自己 */}
              {viewAsUserId && (
                <button
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl mb-1 bg-blue-50"
                  onClick={() => handleSwitchView(null)}
                >
                  {user && <UserAvatar username={user.username} avatar={user.avatar} nickname={user.nickname} size="sm" />}
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium text-blue-700">我自己</div>
                    <div className="text-xs text-blue-500">{user?.nickname || user?.username}</div>
                  </div>
                  <span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">当前</span>
                </button>
              )}
              {/* 成员列表 */}
              {((membersData as any[]) || []).filter((m: any) => {
                if (m.userId === user?.id) return false; // 排除自己
                if (!viewAsSearch) return true;
                const keyword = viewAsSearch.toLowerCase();
                return (m.nickname || '').toLowerCase().includes(keyword) || (m.username || '').toLowerCase().includes(keyword);
              }).map((m: any) => (
                <button
                  key={m.userId}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl mb-1 transition-colors ${
                    viewAsUserId === m.userId ? 'bg-amber-50' : 'hover:bg-gray-50'
                  }`}
                  onClick={() => handleSwitchView(m.userId)}
                >
                  <UserAvatar username={m.username} avatar={m.avatar} nickname={m.nickname} size="sm" />
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium text-gray-900">{m.nickname || m.username}</div>
                    <div className="text-xs text-gray-500">
                      {m.role === 'owner' ? '创始人' : m.role === 'admin' ? '管理员' : m.role === 'funder' ? '资金方' : '普通成员'}
                    </div>
                  </div>
                  {viewAsUserId === m.userId && (
                    <span className="text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">查看中</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
