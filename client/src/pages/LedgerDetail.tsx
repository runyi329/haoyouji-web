import { useState, useEffect, useRef, lazy, Suspense } from "react";
const LedgerDetailAA = lazy(() => import('./LedgerDetailAA'));
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
  // 减肥账本：快捷操作弹窗

  // 减肥账本数据
  const isDiet = (ledgerData as any)?.type === 'diet' || (ledgerData as any)?.type === 'custom_ac';
  const isCustomAE = (ledgerData as any)?.type === 'custom_ae';
  const isOwner = (ledgerData as any)?.userRole === 'owner';
  const isAdmin = (ledgerData as any)?.userRole === 'admin';
  const isDietCoach = isDiet && (isOwner || isAdmin);
  const isDietStudent = isDiet && !isDietCoach;
  const { data: user } = trpc.auth.me.useQuery();
  const { data: dietStats } = trpc.diet.getStats.useQuery(
    { ledgerId: Number(ledgerId) },
    { enabled: isDiet }
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
      <div className="pb-4" style={{ backgroundColor: '#D32F2F', color: '#FFFFFF' }}>
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

        {/* 成员头像和功能按钮 */}
        <div className="px-4 py-2 flex items-center justify-between">
          {/* 当前登录用户头像（靠左，单个头像） */}
          <div className="flex items-center">
            {user && (
              <UserAvatar
                username={user.username}
                avatar={user.avatar}
                nickname={user.nickname}
                size="md"
              />
            )}
          </div>
          

          
          {/* 功能按钮（靠右）：管理员/创建者显示设置按钮，其他人全部隐藏 */}
          <div className="flex items-center gap-2">
            {/* 减肥账本教练：学员管理按钮 */}
            {isDietCoach && (
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer shadow-sm"
                style={{ backgroundColor: '#FFFFFF' }}
                onClick={() => setLocation(`/ledger/${ledgerId}/diet-members`)}
              >
                <Users className="w-5 h-5" style={{ color: '#D32F2F' }} />
              </div>
            )}
            {/* 只有管理员或创建者才显示设置按钮 */}
            {(isOwner || isAdmin) && (
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
                const progressPct = getProgressPct(activity);
                const countdown = formatCountdown(activity.draw_at);
                const placeholderGrad = PRIZE_PLACEHOLDER_COLORS[idx % PRIZE_PLACEHOLDER_COLORS.length];
                const firstWinnerName = activity.firstWinnerName || null;
                const recentParticipants: any[] = activity.recentParticipants ?? [];
                const participantCount = Number(activity.participantCount ?? 0);

                // 按钮样式
                const btnActive = {
                  background: activity.status === 'open'
                    ? 'linear-gradient(135deg,#D32F2F,#B71C1C)'
                    : activity.status === 'drawing'
                    ? 'linear-gradient(135deg,#FF6D00,#E65100)'
                    : '#9E9E9E',
                  boxShadow: (activity.status === 'open' || activity.status === 'drawing')
                    ? '0 3px 10px rgba(211,47,47,0.35)'
                    : 'none',
                };

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
                      <div className="absolute inset-0 bg-white/50 z-10 pointer-events-none" />
                    )}

                    {/* Ribbon 标签 */}
                    {isCompleted && (
                      <div
                        className="absolute top-4 right-[-20px] z-20 text-white text-[9px] font-bold px-7 py-0.5 rotate-45"
                        style={{ background: '#757575', letterSpacing: '0.08em' }}
                      >
                        已开奖
                      </div>
                    )}
                    {isCancelled && (
                      <div
                        className="absolute top-4 right-[-20px] z-20 text-white text-[9px] font-bold px-7 py-0.5 rotate-45"
                        style={{ background: '#EF5350', letterSpacing: '0.08em' }}
                      >
                        已取消
                      </div>
                    )}
                    {activity.status === 'draft' && (
                      <div
                        className="absolute top-4 right-[-20px] z-20 text-white text-[9px] font-bold px-7 py-0.5 rotate-45"
                        style={{ background: '#BDBDBD', letterSpacing: '0.08em' }}
                      >
                        草稿
                      </div>
                    )}

                    {/* 卡片主体：左图右文 */}
                    <div className="flex" style={{ minHeight: '130px' }}>
                      {/* 左侧奖品图区：1:1 正方形 */}
                      <div
                        className="flex-shrink-0 relative"
                        style={{ width: '130px', minHeight: '130px' }}
                      >
                        {activity.cover_image ? (
                          <img
                            src={activity.cover_image}
                            alt={activity.title}
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        ) : (
                          <div
                            className={`absolute inset-0 bg-gradient-to-br ${placeholderGrad} flex flex-col items-center justify-center gap-1.5`}
                          >
                            <Gift className="w-11 h-11 text-white/75" />
                            <span className="text-white/50 text-[10px] tracking-wide">奖品图片</span>
                          </div>
                        )}
                        {/* 开奖中火焰标 */}
                        {activity.status === 'drawing' && (
                          <div className="absolute top-2 left-2 bg-orange-500 rounded-full p-1 z-10"
                            style={{ boxShadow: '0 2px 6px rgba(255,109,0,0.5)' }}>
                            <Flame className="w-3.5 h-3.5 text-white" />
                          </div>
                        )}
                        {/* 参与人数浮层（左下角） */}
                        <div className="absolute bottom-0 left-0 right-0 px-2 py-1"
                          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 100%)' }}>
                          <span className="text-white text-[10px] font-medium">
                            {participantCount > 0 ? `${participantCount} 人参与` : '期待参与'}
                          </span>
                        </div>
                      </div>

                      {/* 右侧文字区 */}
                      <div className="flex-1 px-3 py-3 flex flex-col justify-between min-w-0">
                        {/* 第一行：标题 + 状态徽章 */}
                        <div>
                          <div className="flex items-start justify-between gap-1.5 mb-1">
                            <span
                              className="text-[16px] font-bold text-[#1A1A1A] line-clamp-2 flex-1"
                              style={{ lineHeight: '1.4' }}
                            >
                              {activity.title}
                            </span>
                            {/* 状态勋章 */}
                            <span
                              className="flex-shrink-0 ml-1 mt-0.5 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold"
                              style={{
                                background:
                                  activity.status === 'open' ? '#E8F5E9' :
                                  activity.status === 'drawing' ? '#FFF3E0' :
                                  activity.status === 'draft' ? '#F5F5F5' : '#F5F5F5',
                                color:
                                  activity.status === 'open' ? '#2E7D32' :
                                  activity.status === 'drawing' ? '#E65100' :
                                  activity.status === 'draft' ? '#9E9E9E' : '#9E9E9E',
                                border:
                                  activity.status === 'open' ? '1px solid #A5D6A7' :
                                  activity.status === 'drawing' ? '1px solid #FFCC80' :
                                  '1px solid #E0E0E0',
                              }}
                            >
                              {lotteryStatusMap[activity.status]?.label ?? '未知'}
                            </span>
                          </div>
                          {/* 描述 */}
                          {activity.description && (
                            <div className="text-[11px] text-gray-400 line-clamp-1 mb-2" style={{ lineHeight: '1.4' }}>
                              {activity.description}
                            </div>
                          )}
                        </div>

                        {/* 进度条（始终显示，无 max 时展示参与人数进度） */}
                        {isActive && (
                          <div className="mb-2">
                            {activity.max_participants > 0 ? (
                              <>
                                <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                                  <span>{participantCount} / {activity.max_participants} 人</span>
                                  <span
                                    className="font-semibold"
                                    style={{ color: progressPct >= 80 ? '#D32F2F' : '#9E9E9E' }}
                                  >{progressPct}%</span>
                                </div>
                                <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                  <div
                                    className="h-full rounded-full"
                                    style={{
                                      width: `${progressPct}%`,
                                      background: progressPct >= 80
                                        ? 'linear-gradient(90deg,#D32F2F,#FF5722)'
                                        : 'linear-gradient(90deg,#CBA471,#D32F2F)',
                                      transition: 'width 0.6s ease',
                                    }}
                                  />
                                </div>
                              </>
                            ) : (
                              /* 无人数上限：显示活跃度进度条（每人 +10%，最大 90%） */
                              <>
                                <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                                  <span>{participantCount} 人已参与</span>
                                  <span className="text-[#CBA471] font-medium">火热进行中</span>
                                </div>
                                <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                  <div
                                    className="h-full rounded-full"
                                    style={{
                                      width: `${Math.min(90, participantCount * 10)}%`,
                                      background: 'linear-gradient(90deg,#CBA471,#D32F2F)',
                                      transition: 'width 0.6s ease',
                                    }}
                                  />
                                </div>
                              </>
                            )}
                          </div>
                        )}

                        {/* 底部行：头像堆叠 + 倒计时 + 按钒 */}
                        <div className="flex items-center justify-between">
                          {isActive ? (
                            <>
                              {/* 头像堆叠 + 倒计时 */}
                              <div className="flex items-center gap-1.5">
                                {/* 头像堆叠 */}
                                {recentParticipants.length > 0 && (
                                  <div className="flex -space-x-1.5">
                                    {recentParticipants.slice(0, 3).map((p: any, pi: number) => (
                                      <div
                                        key={pi}
                                        className="w-5 h-5 rounded-full border-2 border-white overflow-hidden flex-shrink-0"
                                        style={{ zIndex: 3 - pi }}
                                      >
                                        {p.avatar_url ? (
                                          <img src={p.avatar_url} alt={p.display_name} className="w-full h-full object-cover" />
                                        ) : (
                                          <div
                                            className="w-full h-full flex items-center justify-center text-[8px] font-bold text-white"
                                            style={{ background: '#D32F2F' }}
                                          >
                                            {(p.display_name || '?')[0]}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {/* 倒计时 */}
                                {countdown ? (
                                  <div className="flex items-center gap-0.5">
                                    <Timer className="w-3 h-3 text-[#D32F2F]" />
                                    <span className="text-[11px] font-mono font-bold text-[#D32F2F]">{countdown}</span>
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-gray-400">即时开奖</span>
                                )}
                              </div>
                              {/* 胶囊按钒 */}
                              <button
                                className="text-[12px] font-bold text-white px-4 py-1.5 rounded-full flex-shrink-0"
                                style={btnActive}
                                onClick={e => { e.stopPropagation(); setLocation(`/lottery/${activity.id}`); }}
                              >
                                {activity.status === 'open' ? '去报名' : activity.status === 'drawing' ? '开奖中' : '查看'}
                              </button>
                            </>
                          ) : (
                            <>
                              {/* 已结束：中奖者或参与人数 */}
                              <div className="flex items-center gap-1">
                                {firstWinnerName ? (
                                  <>
                                    <Trophy className="w-3.5 h-3.5 text-[#CBA471]" />
                                    <span className="text-[11px] text-gray-500 truncate max-w-[100px]">中奖：{firstWinnerName}</span>
                                  </>
                                ) : (
                                  <>
                                    <Users className="w-3.5 h-3.5 text-gray-400" />
                                    <span className="text-[11px] text-gray-400">{participantCount} 人参与</span>
                                  </>
                                )}
                              </div>
                              {/* 查看名单按钒（置灰描边） */}
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
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 记账记录列表 —— 非 custom_ae 账本显示 */}
      {!isCustomAE && <div className={`flex-1 px-4 pb-20 space-y-3`}>
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
      {!isCustomAE && !isDiet && (
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
    </div>
  );
}
