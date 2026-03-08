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

  // 抽奖活动列表（全量，前端按子Tab过滤）
  const { data: lotteryActivities, isLoading: lotteryLoading } = trpc.lottery.listByLedger.useQuery(
    { ledgerId: Number(ledgerId) }
  );
  // 减肥账本：快捷操作弹窗

  // 减肥账本数据
  const isDiet = (ledgerData as any)?.type === 'diet' || (ledgerData as any)?.type === 'custom_ac';
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
  const activeActivities = allLotteryActivities.filter((a: any) => ['draft', 'open', 'drawing'].includes(a.status));
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

      {/* 抽奖活动列表（双 Tab：正在进行中 / 往期回顾） */}
      {!isDiet && (
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

          {/* 活动列表 */}
          <div className="px-4 space-y-3">
            {lotteryLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader className="w-6 h-6 text-[#D32F2F] animate-spin" />
              </div>
            ) : displayLotteryList.length === 0 ? (
              <div className="text-center py-12">
                <Gift className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                {lotteryTab === 'active' ? (
                  <>
                    <div className="text-gray-400 text-base mb-1">暂无进行中的活动</div>
                    <div className="text-gray-400 text-sm">账本管理员可在设置中创建抽奖活动</div>
                  </>
                ) : (
                  <>
                    <div className="text-gray-400 text-base mb-1">还没有历史活动</div>
                    <div className="text-gray-400 text-sm">已结束或已取消的活动将在这里展示</div>
                  </>
                )}
              </div>
            ) : (
              displayLotteryList.map((activity: any) => {
                const status = lotteryStatusMap[activity.status] ?? lotteryStatusMap.draft;
                const StatusIcon = status.icon;
                const drawTime = activity.draw_at ? new Date(activity.draw_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;
                return (
                  <div
                    key={activity.id}
                    className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 cursor-pointer active:bg-[#FFF5F5] transition-colors"
                    onClick={() => setLocation(`/lottery/${activity.id}`)}
                  >
                    {/* 标题行 */}
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Gift className="w-5 h-5 text-[#D32F2F] flex-shrink-0" />
                        <span className="text-base font-semibold text-[#222222] truncate">{activity.title}</span>
                      </div>
                      <span className={`ml-2 flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
                        {StatusIcon && <StatusIcon className="w-3 h-3" />}
                        {status.label}
                      </span>
                    </div>
                    {/* 描述 */}
                    {activity.description && (
                      <div className="text-xs text-gray-500 mb-2 line-clamp-2">{activity.description}</div>
                    )}
                    {/* 信息网格 */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
                      <div className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        <span>{activity.participantCount ?? 0} 人已报名</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Gift className="w-3.5 h-3.5" />
                        <span>{lotteryModeMap[activity.mode] ?? activity.mode}</span>
                      </div>
                      {drawTime && (
                        <div className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          <span>开奖 {drawTime}</span>
                        </div>
                      )}
                      {activity.registration_mode && (
                        <div className="flex items-center gap-1">
                          <span>📋</span>
                          <span>{lotteryRegMap[activity.registration_mode] ?? activity.registration_mode}</span>
                        </div>
                      )}
                      {activity.external_seed_type && (
                        <div className="flex items-center gap-1 col-span-2">
                          <span>🎲</span>
                          <span>种子源：{lotterySeedMap[activity.external_seed_type] ?? activity.external_seed_type}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 记账记录列表 */}
      {/* 记账明细列表已隐藏（此账本仅用于抽奖） */}
      <div className={`flex-1 px-4 pb-20 space-y-3 hidden`}>
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
      </div>

      {/* 底部添加按钮已移除（此账本仅用于抽奖，参与者通过活动详情页报名） */}
      {/* 减肥账本仍保留打卡按钮 */}
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
