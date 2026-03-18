import { useState, useEffect, useRef, lazy, Suspense } from "react";
const LedgerDetailAA = lazy(() => import('./LedgerDetailAA'));
const LedgerDetailAG = lazy(() => import('./LedgerDetailAG'));
const MemoLedgerPage = lazy(() => import('./MemoLedgerPage'));
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
// 不再使用动态主题，固定红色配色
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  Building2,
  CalendarClock,
  PieChart,
} from "lucide-react";


// ========== 中国法定节假日数据（2025-2026年） ==========
// 法定节假日放假日期（这些日期是非工作日）
const CHINA_HOLIDAYS: Record<string, string> = {
  // 2025年
  '2025-01-01': '元旦',
  '2025-01-28': '春节', '2025-01-29': '春节', '2025-01-30': '春节', '2025-01-31': '春节',
  '2025-02-01': '春节', '2025-02-02': '春节', '2025-02-03': '春节', '2025-02-04': '春节',
  '2025-04-04': '清明节', '2025-04-05': '清明节', '2025-04-06': '清明节',
  '2025-05-01': '劳动节', '2025-05-02': '劳动节', '2025-05-03': '劳动节', '2025-05-04': '劳动节', '2025-05-05': '劳动节',
  '2025-05-31': '端午节', '2025-06-01': '端午节', '2025-06-02': '端午节',
  '2025-10-01': '国庆节', '2025-10-02': '国庆节', '2025-10-03': '国庆节', '2025-10-04': '国庆节',
  '2025-10-05': '国庆节', '2025-10-06': '国庆节', '2025-10-07': '国庆节', '2025-10-08': '国庆节',
  // 2026年
  '2026-01-01': '元旦', '2026-01-02': '元旦', '2026-01-03': '元旦',
  '2026-02-15': '春节', '2026-02-16': '春节', '2026-02-17': '春节', '2026-02-18': '春节',
  '2026-02-19': '春节', '2026-02-20': '春节', '2026-02-21': '春节', '2026-02-22': '春节', '2026-02-23': '春节',
  '2026-04-04': '清明节', '2026-04-05': '清明节', '2026-04-06': '清明节',
  '2026-05-01': '劳动节', '2026-05-02': '劳动节', '2026-05-03': '劳动节', '2026-05-04': '劳动节', '2026-05-05': '劳动节',
  '2026-06-19': '端午节', '2026-06-20': '端午节', '2026-06-21': '端午节',
  '2026-09-25': '中秋节', '2026-09-26': '中秋节', '2026-09-27': '中秋节',
  '2026-10-01': '国庆节', '2026-10-02': '国庆节', '2026-10-03': '国庆节', '2026-10-04': '国庆节',
  '2026-10-05': '国庆节', '2026-10-06': '国庆节', '2026-10-07': '国庆节',
};

// 调休上班日（这些周末日期是工作日）
const WORKDAY_OVERRIDES: Set<string> = new Set([
  // 2025年
  '2025-01-26', '2025-02-08', '2025-04-27', '2025-09-28', '2025-10-11',
  // 2026年
  '2026-01-04', '2026-02-14', '2026-02-28', '2026-05-09', '2026-09-20', '2026-10-10',
]);

// 获取北京时间（UTC+8）的当前日期信息
function getBeijingNow(): { year: number; month: number; day: number; hour: number; date: Date } {
  const now = new Date();
  // 使用 Intl 获取北京时间的各个部分
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value || '0';
  const year = parseInt(get('year'));
  const month = parseInt(get('month'));
  const day = parseInt(get('day'));
  const hour = parseInt(get('hour'));
  // 返回一个代表北京时间当天开始的Date对象（用于比较）
  const date = new Date(year, month - 1, day);
  return { year, month, day, hour, date };
}

// 格式化日期为 YYYY-MM-DD
function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 判断某天是否为工作日
function isWorkday(d: Date): boolean {
  const key = formatDateKey(d);
  // 如果是调休上班日（周末但要上班），则是工作日
  if (WORKDAY_OVERRIDES.has(key)) return true;
  // 如果是法定节假日，则不是工作日
  if (CHINA_HOLIDAYS[key]) return false;
  // 周六日不是工作日
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  return true;
}

// 2026年确定的报税截止日（用户提供）
const TAX_DEADLINES_2026: Record<number, number> = {
  1: 20, 2: 24, 3: 16, 4: 20, 5: 22, 6: 15,
  7: 15, 8: 17, 9: 15, 10: 26, 11: 16, 12: 15,
};

// 计算报税截止日（每月15号，遇节假日/周末顺延）
// 2026年使用确定日期，其他年份自动计算
function getTaxDeadline(year: number, month: number): { deadline: Date; originalDate: Date; postponed: boolean; reason: string } {
  const original = new Date(year, month - 1, 15); // month是1-12

  // 2026年使用确定的截止日期
  if (year === 2026 && TAX_DEADLINES_2026[month]) {
    const actualDay = TAX_DEADLINES_2026[month];
    const deadline = new Date(year, month - 1, actualDay);
    const postponed = actualDay !== 15;
    let reason = '';
    if (postponed) {
      // 生成顺延原因
      const reasons: string[] = [];
      let d = new Date(original);
      while (d < deadline) {
        const key = formatDateKey(d);
        const holidayName = CHINA_HOLIDAYS[key];
        const dow = d.getDay();
        if (holidayName && !reasons.includes(holidayName)) {
          reasons.push(holidayName);
        } else if (dow === 0 && !holidayName) {
          if (!reasons.includes('周日')) reasons.push('周日');
        } else if (dow === 6 && !holidayName) {
          if (!reasons.includes('周六')) reasons.push('周六');
        }
        d = new Date(d.getTime() + 86400000);
      }
      reason = `因${reasons.join('、')}顺延至${month}月${actualDay}日`;
    }
    return { deadline, originalDate: original, postponed, reason };
  }

  // 其他年份自动计算
  let current = new Date(original);
  const reasons: string[] = [];
  for (let i = 0; i < 30; i++) {
    if (isWorkday(current)) break;
    const key = formatDateKey(current);
    const holidayName = CHINA_HOLIDAYS[key];
    const dow = current.getDay();
    if (holidayName && !reasons.includes(holidayName)) {
      reasons.push(holidayName);
    } else if (dow === 0 && !holidayName) {
      if (!reasons.includes('周日')) reasons.push('周日');
    } else if (dow === 6 && !holidayName) {
      if (!reasons.includes('周六')) reasons.push('周六');
    }
    current = new Date(current.getTime() + 86400000);
  }
  const postponed = current.getTime() !== original.getTime();
  const reasonText = postponed
    ? `因${reasons.join('、')}顺延至${current.getMonth() + 1}月${current.getDate()}日`
    : '';
  return { deadline: current, originalDate: original, postponed, reason: reasonText };
}

// 获取下一个报税截止日信息（基于北京时间 UTC+8）
// 报税周期逻辑：
// - 每月截止日用于申报上个月的税务
// - 例如：3月16日截止日 → 申报的是2月的税务
// - 3月12日：距离3月16日还有4天，显示"申报2月税务"
// - 3月17日（过了3月截止日）：显示"申报3月税务"，截止日是4月20日
function getNextTaxDeadlineInfo(): { deadline: Date; originalDate: Date; postponed: boolean; reason: string; taxMonth: number; taxYear: number; daysLeft: number } {
  // 使用北京时间判断“今天”
  const bj = getBeijingNow();
  const currentYear = bj.year;
  const currentMonth = bj.month;
  const todayDate = bj.date; // 北京时间今天 00:00:00 的 Date 对象

  // 当月的截止日（用于申报上个月的税）
  const currentDeadline = getTaxDeadline(currentYear, currentMonth);
  // 截止日也转换为当天 00:00:00 进行比较（只比较日期，不比较时间）
  const deadlineDate = new Date(currentDeadline.deadline.getFullYear(), currentDeadline.deadline.getMonth(), currentDeadline.deadline.getDate());

  if (todayDate <= deadlineDate) {
    // 北京时间今天还没过截止日 → 正在申报上个月的税务
    // 计算剩余天数：截止日日期 - 今天日期 + 1（包含今天）
    // 例如：今天4月16日，截止日4月16日 → 剩余1天（今天是最后一天）
    const diffMs = deadlineDate.getTime() - todayDate.getTime();
    const daysLeft = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1; // +1因为截止日当天也算
    const taxMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const taxYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    return { ...currentDeadline, taxMonth, taxYear, daysLeft };
  } else {
    // 北京时间今天已过截止日 → 开始申报当月的税务，截止日是下个月
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;
    const nextDeadline = getTaxDeadline(nextYear, nextMonth);
    const nextDeadlineDate = new Date(nextDeadline.deadline.getFullYear(), nextDeadline.deadline.getMonth(), nextDeadline.deadline.getDate());
    const diffMs = nextDeadlineDate.getTime() - todayDate.getTime();
    const daysLeft = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
    return { ...nextDeadline, taxMonth: currentMonth, taxYear: currentYear, daysLeft };
  }
}

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
    limit: 2000, // 加大limit确保加载全部历史记录（原100会截断早期数据）
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
  // viewAsUserId 从 URL 参数读取，确保刷新和子页面跳转后保持视角
  const viewAsUserIdFromUrl = urlParams.get('viewAs') ? Number(urlParams.get('viewAs')) : null;
  const [viewAsUserId, setViewAsUserIdState] = useState<number | null>(viewAsUserIdFromUrl);
  const [showViewAsPicker, setShowViewAsPicker] = useState(false);
  const [viewAsSearch, setViewAsSearch] = useState('');
  const trpcUtils = trpc.useUtils();
  // 视角切换时同步写入 URL，确保刷新后保持视角
  const handleSwitchView = (userId: number | null) => {
    setViewAsUserIdState(userId);
    setShowViewAsPicker(false);
    // 更新 URL 参数
    const newParams = new URLSearchParams(window.location.search);
    if (userId) {
      newParams.set('viewAs', String(userId));
    } else {
      newParams.delete('viewAs');
    }
    const newUrl = `${window.location.pathname}?${newParams.toString()}`;
    window.history.replaceState(null, '', newUrl);
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
  const isCustomAH = (ledgerData as any)?.type === 'custom_ah';
  const isCustomAI = (ledgerData as any)?.type === 'custom_ai';



  // AI 账本日历 state
  const [aiCalMonth, setAiCalMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() }; // month: 0-indexed
  });
  const isOwner = (ledgerData as any)?.userRole === 'owner';
  const isAdmin = (ledgerData as any)?.userRole === 'admin';
  const isFunder = (ledgerData as any)?.userRole === 'funder';
  const isClient = (ledgerData as any)?.userRole === 'client';
  const isEmployee = (ledgerData as any)?.userRole === 'employee';
  // AH 账本角色名称映射
  const ahRoleName = isCustomAH ? (
    isOwner ? '创建者' : isAdmin ? '管理员' : (ledgerData as any)?.userRole === 'member' ? '普通用户' : isClient ? '客户' : isEmployee ? '企业员工' : '普通用户'
  ) : '';
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
  // AF 账本：管理员统计（订单数 + 管理费）——后端控制权限，无权限返回null
  const { data: afAdminStats } = trpc.ledger.afAdminGetStats.useQuery(
    { ledgerId: Number(ledgerId) },
    { enabled: isCustomAF }
  );
  // AF 账本：实时盈亏汇总（每60秒自动刷新）
  const { data: pnlData } = trpc.ledger.afGetPnlSummary.useQuery(
    { ledgerId: Number(ledgerId), ...(viewAsUserId ? { viewAsUserId } : {}) },
    { enabled: isCustomAF, refetchInterval: 60000 }
  );
  // 资方专属：资产汇总（仅 funder 角色查询）
  const { data: funderAssetSummary } = trpc.ledger.funderGetAssetSummary.useQuery(
    { ledgerId: Number(ledgerId) },
    { enabled: isCustomAF && isFunder }
  );
  // 资方专属：资产订单列表（仅 funder 角色查询）
  const { data: funderAssetOrders } = trpc.ledger.funderGetAssetOrders.useQuery(
    { ledgerId: Number(ledgerId) },
    { enabled: isCustomAF && isFunder }
  );
  // AH 账本：公司列表和报税授权
  const { data: ahCompanies, refetch: refetchAhCompanies } = trpc.ledger.ahListCompanies.useQuery(
    { ledgerId: Number(ledgerId) },
    { enabled: isCustomAH }
  );
  const { data: ahTaxAuths, refetch: refetchAhTaxAuths } = trpc.ledger.ahGetTaxAuthorizations.useQuery(
    { ledgerId: Number(ledgerId) },
    { enabled: isCustomAH }
  );
  // AH 账本：创建公司
  const ahCreateCompanyMutation = trpc.ledger.ahCreateCompany.useMutation({
    onSuccess: () => { refetchAhCompanies(); refetchAhTaxAuths(); },
  });
  // AH 账本：新建公司弹窗状态
  const [showAhCreateCompany, setShowAhCreateCompany] = useState(false);
  const [ahNewCompanyName, setAhNewCompanyName] = useState('');
  const [ahNewCompanyContact, setAhNewCompanyContact] = useState('');
  const [ahNewCompanyPhone, setAhNewCompanyPhone] = useState('');
  const [ahNewCompanyTaxId, setAhNewCompanyTaxId] = useState('');


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
      <div className="pb-4" style={{ backgroundColor: (isCustomAF || isCustomAH || isCustomAI) ? undefined : '#D32F2F', background: (isCustomAF || isCustomAH) ? 'linear-gradient(135deg, #1A56DB 0%, #3B82F6 100%)' : isCustomAI ? 'linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)' : undefined, color: '#FFFFFF' }}>
        {/* AF/AH 账本：顶部两行布局 */}
        {(isCustomAF || isCustomAH || isCustomAI) ? (
          <div className="px-4 pt-3 pb-2">
            {/* 第一行：头像 + 名字 + 设置齿轮 */}
            <div className="flex items-center justify-between">
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
              {effectiveIsManager && (
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer"
                  style={{ backgroundColor: 'rgba(255,255,255,0.18)' }}
                  onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}
                >
                  <Settings className="w-4 h-4 text-white" />
                </div>
              )}
            </div>
            {/* 第二行：操作按钮 */}
            <div className="flex items-center gap-2 mt-2">
              {isCustomAH && (
                <span className="text-xs text-white/70 mr-1 px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>{ahRoleName}</span>
              )}
              {isCustomAF && !isFunder && (
                <button
                  onClick={() => setLocation(`/recharge?from=ledger&ledgerId=${ledgerId}${viewAsUserId ? `&viewAs=${viewAsUserId}` : ''}`)}
                  className="flex-1 py-1.5 rounded-full text-sm font-medium border border-white/60 text-white text-center"
                  style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
                >
                  充值
                </button>
              )}
              {isCustomAF && !isFunder && (
                <button
                  onClick={() => setLocation(`/ledger/${ledgerId}/af-invite${viewAsUserId ? `?viewAs=${viewAsUserId}` : ''}`)}
                  className="flex-1 py-1.5 rounded-full text-sm font-medium border border-white/60 text-white text-center"
                  style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
                >
                  邀请
                </button>
              )}
              {isCustomAH && (isOwner || isAdmin) && (
                <button
                  onClick={() => setShowAhCreateCompany(v => !v)}
                  className="flex-1 py-1.5 rounded-full text-sm font-medium border border-white/60 text-white text-center"
                  style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
                >
                  新建
                </button>
              )}
              <button
                onClick={() => window.location.reload()}
                className="flex-1 py-1.5 rounded-full text-sm font-medium border border-white/60 text-white text-center"
                style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
              >
                刷新
              </button>
              <button
                onClick={() => setLocation('/ledger')}
                className="flex-1 py-1.5 rounded-full text-sm font-medium border border-white/60 text-white text-center"
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
                {!isCustomAE && !isDiet && !isCustomAF && !isCustomAH && !isCustomAI && (
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer shadow-sm"
                    style={{ backgroundColor: '#FFFFFF' }}
                    onClick={() => setLocation(`/ledger/${ledgerId}/filter`)}
                  >
                    <Search className="w-5 h-5" style={{ color: '#D32F2F' }} />
                  </div>
                )}
                {/* 普通账本：数据统计按鈕 */}
                {!isCustomAE && !isDiet && !isCustomAF && !isCustomAH && !isCustomAI && (
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
        {isCustomAF && !isCustomAH && (
          <div className="px-4 pt-2 pb-4">
            <div className="grid grid-cols-2 gap-3">
              {/* 卡片 1：资金方看“资产”，其他角色看“余额” */}
              {isFunder ? (
                <div className="col-span-2 rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
                  <div className="text-xs text-white/70 mb-1">资产</div>
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-xl font-bold text-white">
                      {funderAssetSummary ? funderAssetSummary.totalUsdt.toFixed(2) : '0.00'}
                    </span>
                    <span className="text-xs text-white/60">USDT</span>
                    {funderAssetSummary && funderAssetSummary.orderCount > 0 && (
                      <span className="text-[10px] text-white/40 ml-1">{funderAssetSummary.orderCount}笔订单</span>
                    )}
                  </div>
                  {/* 币种分布 */}
                  {funderAssetSummary && Object.keys(funderAssetSummary.coinBreakdown).length > 0 && (
                    <div className="flex items-baseline gap-3">
                      {Object.entries(funderAssetSummary.coinBreakdown).map(([coin, data]: [string, any]) => (
                        <div key={coin} className="flex items-baseline gap-1">
                          <span className="text-xs text-white/70 font-medium">{coin}</span>
                          <span className="text-sm font-bold text-white">{data.amount.toFixed(2)}</span>
                          <span className="text-[10px] text-white/40">U</span>
                          {data.quantity > 0 && (
                            <span className="text-[10px] text-white/40">({data.quantity.toFixed(coin === 'BTC' ? 6 : 4)})</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {(!funderAssetSummary || Object.keys(funderAssetSummary.coinBreakdown).length === 0) && (
                    <div className="text-xs text-white/40">暂无资产订单</div>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
                  <div className="text-xs text-white/70 mb-1">余额</div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-bold text-white">
                      {afTotalAsset ? Number(afTotalAsset.total).toFixed(2) : '0.00'}
                    </span>
                    <span className="text-xs text-white/60">USDT</span>
                  </div>
                </div>
              )}
              {/* 卡片 2：推荐人数（资金方不显示） */}
              {!isFunder && (
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
              )}
              {/* 卡片 3：仓位 & 累计盈亏（合并，占满整行）——资金方不显示 */}
              {!isFunder && (
              <div className="col-span-2 rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-xs text-white/70">权益</span>
                  {pnlData?.updatedAt && (
                    <span className="text-[10px] text-white/40">
                      更新时间 {new Date(pnlData.updatedAt).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                    </span>
                  )}
                </div>
                {/* 表头 */}
                <div className="flex items-baseline mb-1 text-[10px] text-white/40">
                  <span className="w-9">币种</span>
                  <span className="flex-1 text-right">权益</span>
                  <span className="w-10 text-right">订单</span>
                  <span className="flex-1 text-right">均价</span>
                  <span className="flex-1 text-right">收益</span>
                </div>
                {['BTC', 'ETH', 'SOL'].map(coin => {
                  const qty = (afTotalAsset as any)?.positions?.[coin] ?? 0;
                  const coinData = pnlData?.coins?.find((c: any) => c.coin === coin);
                  const orderCount = coinData?.orderCount ?? 0;
                  // 权益为0且无订单的币种不显示
                  if ((!qty || qty <= 0) && orderCount === 0) return null;
                  const displayPnl = Math.max(0, coinData?.pnl ?? 0);
                  const avgCost = coinData?.avgCost ?? 0;
                  // 智能去尾零
                  const fmtQty = (() => {
                    if (!qty || qty <= 0) return '0';
                    const maxDec = coin === 'BTC' ? 8 : 6;
                    const raw = qty.toFixed(maxDec);
                    const [intPart, decPart] = raw.split('.');
                    const trimmed = decPart.replace(/0+$/, '');
                    const finalDec = trimmed.length < 2 ? trimmed.padEnd(2, '0') : trimmed;
                    return `${intPart}.${finalDec}`;
                  })();
                  return (
                    <div key={coin} className="flex items-baseline py-0.5">
                      <span className="w-9 text-xs text-white/70 font-medium">{coin}</span>
                      <span className="flex-1 text-right text-xs font-bold text-white">{fmtQty}</span>
                      <span className="w-10 text-right text-[10px] text-white/50">{orderCount}笔</span>
                      <span className="flex-1 text-right text-[11px] text-white/60">{avgCost > 0 ? avgCost.toLocaleString() : '-'}</span>
                      <span className="flex-1 text-right text-xs font-medium text-green-400">+{displayPnl.toFixed(2)}</span>
                    </div>
                  );
                })}
                {/* 总计 */}
                <div className="border-t border-white/20 pt-1 mt-1 flex items-baseline">
                  <span className="w-9 text-xs text-white/80 font-medium">总计</span>
                  <span className="flex-1"></span>
                  <span className="w-10"></span>
                  <span className="flex-1"></span>
                  <span className="flex-1 text-right text-sm font-bold text-green-400">+{Math.max(0, pnlData?.total ?? 0).toFixed(2)} U</span>
                </div>
              </div>
              )}
              {/* 管理员统计：累计订单（后端控制权限，代看模式下隐藏，资金方不显示） */}
              {!isFunder && !viewAsUserId && afAdminStats && (afAdminStats as any).authorized === true && (afAdminStats as any).orders && (
                <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
                  <div className="text-xs text-white/70 mb-1">累计订单</div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-bold text-white">{afAdminStats.orders.totalCount}</span>
                    <span className="text-xs text-white/60">笔</span>
                  </div>
                  <div className="mt-1.5 space-y-0.5">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-white/60">普通</span>
                      <span className="text-xs font-medium text-white">{afAdminStats.orders.normalCount} 笔</span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-white/60">赠送</span>
                      <span className="text-xs font-medium text-amber-300">{afAdminStats.orders.giftCount} 笔</span>
                    </div>
                  </div>
                </div>
              )}
              {/* 管理员统计：管理费（后端控制权限，代看模式下隐藏） */}
              {!isFunder && !viewAsUserId && afAdminStats && (afAdminStats as any).authorized === true && (afAdminStats as any).fees && (
                <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
                  <div className="text-xs text-white/70 mb-1">管理费</div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-bold text-white">{afAdminStats.fees.totalFee.toFixed(2)}</span>
                    <span className="text-xs text-white/60">U</span>
                  </div>
                  <div className="mt-1.5 space-y-0.5">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-white/60">进行中</span>
                      <span className="text-xs font-medium text-amber-300">{afAdminStats.fees.ongoingFee.toFixed(2)} U</span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-white/60">已结清</span>
                      <span className="text-xs font-medium text-green-300">{afAdminStats.fees.settledFee.toFixed(2)} U</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {/* AI 账本：股权概览卡片 */}
        {isCustomAI && (
          <div className="px-4 pt-2 pb-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
                <div className="text-xs text-white/70 mb-1">股东人数</div>
                <div className="text-lg font-bold text-white">--</div>
                <div className="text-[10px] text-white/50 mt-1">待录入</div>
              </div>
              <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
                <div className="text-xs text-white/70 mb-1">总股本</div>
                <div className="text-lg font-bold text-white">--</div>
                <div className="text-[10px] text-white/50 mt-1">待录入</div>
              </div>
              <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
                <div className="text-xs text-white/70 mb-1">我的持股</div>
                <div className="text-lg font-bold text-white">--%</div>
                <div className="text-[10px] text-white/50 mt-1">待录入</div>
              </div>
              <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
                <div className="text-xs text-white/70 mb-1">分红记录</div>
                <div className="text-lg font-bold text-white">--</div>
                <div className="text-[10px] text-white/50 mt-1">待录入</div>
              </div>
            </div>
          </div>
        )}
        {/* AH 账本：数据占位符区域 */}
        {isCustomAH && (
          <div className="px-4 pt-2 pb-4">
            <div className="grid grid-cols-2 gap-3">
              {/* 财务概览卡片 */}
              <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
                <div className="text-xs text-white/70 mb-1">财务概览</div>
                <div className="text-lg font-bold text-white">--</div>
                <div className="text-[10px] text-white/50 mt-1">待配置</div>
              </div>
              {/* 当月收支 */}
              <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
                <div className="text-xs text-white/70 mb-1">当月收支</div>
                <div className="text-lg font-bold text-white">--</div>
                <div className="text-[10px] text-white/50 mt-1">待配置</div>
              </div>
              {/* 应收应付 */}
              <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
                <div className="text-xs text-white/70 mb-1">应收应付</div>
                <div className="text-lg font-bold text-white">--</div>
                <div className="text-[10px] text-white/50 mt-1">待配置</div>
              </div>
              {/* 税务申报 */}
              <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
                <div className="text-xs text-white/70 mb-1">税务申报</div>
                <div className="text-lg font-bold text-white">--</div>
                <div className="text-[10px] text-white/50 mt-1">待配置</div>
              </div>
            </div>
          </div>
        )}
        {/* 普通账本：统计面板（总收入/总结余/总支出）*/}
        {!isCustomAE && !isDiet && !isCustomAF && !isCustomAH && !isCustomAI && (
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

      {/* 加密货币竞猜入口 —— 仅 custom_af 账本非资金方 */}
      {isCustomAF && !isFunder && (
        <div className="flex-1 px-4 pb-20">
          <div className="mt-4 space-y-3">
            {/* BTC 入口 */}
            <button
              onClick={() => setLocation(`/ledger/${ledgerId}/crypto-prediction${viewAsUserId ? `?viewAs=${viewAsUserId}` : ''}`)}
              className="w-full rounded-2xl p-4 flex items-center gap-4 shadow-sm active:opacity-90"
              style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E8FF', boxShadow: '0 2px 8px rgba(26,86,219,0.08)' }}
            >
              <img src="https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/btc-official.png" alt="BTC" className="w-12 h-12 object-contain rounded-full" />
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
              <img src="https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/eth-official.png" alt="ETH" className="w-12 h-12 object-contain rounded-full" />
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
              <img src="https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/sol-official.png" alt="SOL" className="w-12 h-12 object-contain rounded-full" />
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

      {/* 资金方专属：资产订单列表 */}
      {isCustomAF && isFunder && (
        <div className="flex-1 px-4 pb-20">
          <div className="mt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold" style={{ color: '#1A2340' }}>资产订单</h3>
              <span className="text-xs text-gray-400">共 {(funderAssetOrders as any[])?.length ?? 0} 笔</span>
            </div>
            {(!funderAssetOrders || (funderAssetOrders as any[]).length === 0) ? (
              <div className="text-center py-12">
                <Receipt className="w-14 h-14 text-gray-200 mx-auto mb-3" />
                <div className="text-gray-400 text-base mb-1">暂无资产订单</div>
                <div className="text-gray-400 text-sm">管理员将为您配置资产订单</div>
              </div>
            ) : (
              <div className="space-y-3">
                {(funderAssetOrders as any[]).map((order: any) => {
                  const statusLabel = order.status === 'active' ? '进行中' : order.status === 'settled' ? '已结算' : '已取消';
                  const statusColor = order.status === 'active' ? '#22C55E' : order.status === 'settled' ? '#3B82F6' : '#9CA3AF';
                  return (
                    <div
                      key={order.id}
                      className="rounded-2xl p-4 shadow-sm"
                      style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E8FF', boxShadow: '0 2px 8px rgba(26,86,219,0.08)' }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-semibold" style={{ color: '#1A2340' }}>{order.coin}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: `${statusColor}20`, color: statusColor }}>{statusLabel}</span>
                        </div>
                        <span className="text-lg font-bold" style={{ color: '#1A2340' }}>{parseFloat(order.amount).toLocaleString()} U</span>
                      </div>
                      {order.quantity && (
                        <div className="text-xs text-gray-500 mb-1">数量: {order.quantity} {order.coin}</div>
                      )}
                      <div className="flex items-center gap-4 text-xs text-gray-400">
                        {order.start_at && (
                          <span>开始: {new Date(order.start_at).toLocaleDateString('zh-CN')}</span>
                        )}
                        {order.interest_rate && (
                          <span>利率: {order.interest_rate}%</span>
                        )}
                        {order.profit_share_rate && (
                          <span>分成: {order.profit_share_rate}%</span>
                        )}
                      </div>
                      {(order.interest_note || order.profit_share_note) && (
                        <div className="mt-2 text-xs text-gray-400 border-t border-gray-100 pt-2">
                          {order.interest_note && <div>利息协议: {order.interest_note}</div>}
                          {order.profit_share_note && <div>分成协议: {order.profit_share_note}</div>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* AH 账本：公司列表 + 报税授权管理 */}
      {isCustomAH && (
        <div className="flex-1 px-4 pb-20">
          <div className="mt-4">


            {/* 新建公司表单 */}
            {showAhCreateCompany && (isOwner || isAdmin) && (
              <div className="mb-4 p-4 rounded-xl border border-gray-200" style={{ backgroundColor: '#F8FAFF' }}>
                <div className="space-y-2">
                  <Input
                    placeholder="公司名称 *"
                    value={ahNewCompanyName}
                    onChange={(e: any) => setAhNewCompanyName(e.target.value)}
                    className="text-sm"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="联系人"
                      value={ahNewCompanyContact}
                      onChange={(e: any) => setAhNewCompanyContact(e.target.value)}
                      className="text-sm"
                    />
                    <Input
                      placeholder="联系电话"
                      value={ahNewCompanyPhone}
                      onChange={(e: any) => setAhNewCompanyPhone(e.target.value)}
                      className="text-sm"
                    />
                  </div>
                  <Input
                    placeholder="税号"
                    value={ahNewCompanyTaxId}
                    onChange={(e: any) => setAhNewCompanyTaxId(e.target.value)}
                    className="text-sm"
                  />
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      className="text-white"
                      style={{ backgroundColor: '#1A56DB' }}
                      disabled={ahCreateCompanyMutation.isPending || !ahNewCompanyName.trim()}
                      onClick={() => {
                        ahCreateCompanyMutation.mutate({
                          ledgerId: Number(ledgerId),
                          name: ahNewCompanyName.trim(),
                          contactName: ahNewCompanyContact.trim() || undefined,
                          contactPhone: ahNewCompanyPhone.trim() || undefined,
                          taxId: ahNewCompanyTaxId.trim() || undefined,
                        });
                        setAhNewCompanyName('');
                        setAhNewCompanyContact('');
                        setAhNewCompanyPhone('');
                        setAhNewCompanyTaxId('');
                        setShowAhCreateCompany(false);
                      }}
                    >
                      {ahCreateCompanyMutation.isPending ? '创建中...' : '确认创建'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowAhCreateCompany(false)}>取消</Button>
                  </div>
                </div>
              </div>
            )}

            {/* 公司卡片列表 */}
            {!ahCompanies || ahCompanies.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ backgroundColor: '#EBF0FF' }}>
                  <Building2 className="w-8 h-8" style={{ color: '#3B82F6' }} />
                </div>
                <div className="text-gray-500 text-base mb-1">暂无公司</div>
                <div className="text-gray-400 text-sm">{(isOwner || isAdmin) ? '点击上方「新建公司」添加第一家客户公司' : '管理员尚未添加您的公司'}</div>
              </div>
            ) : (
              <div className="space-y-3">
                {(ahCompanies as any[]).map((company: any) => {
                  // 找到该公司最新的报税授权记录
                  const companyAuths = (ahTaxAuths as any[] || []).filter((a: any) => a.companyId === company.id);
                  const latestAuth = companyAuths.length > 0 ? companyAuths[0] : null;
                  // 计算报税截止日（含节假日/周末顺延）
                  const taxInfo = getNextTaxDeadlineInfo();
                  const { deadline: nextDue, daysLeft, postponed: isPostponed, reason: postponeReason, taxMonth: reportTaxMonth, taxYear: reportTaxYear } = taxInfo;
                  const statusColor = latestAuth?.status === 'authorized' ? '#10B981' : latestAuth?.status === 'filed' ? '#6B7280' : latestAuth?.status === 'expired' ? '#EF4444' : '#F59E0B';
                  const statusText = latestAuth?.status === 'authorized' ? '客户已授权，可申报扣税' : latestAuth?.status === 'filed' ? '已申报' : latestAuth?.status === 'expired' ? '已过期' : '待客户授权';

                  return (
                    <div key={company.id} className="rounded-xl border border-gray-100 overflow-hidden" style={{ backgroundColor: '#FFFFFF' }}>
                      {/* 公司头部 */}
                      <div className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3 flex-1 cursor-pointer" onClick={() => setLocation(`/ledger/${ledgerId}/company/${company.id}`)}>
                            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#EBF0FF' }}>
                              <Building2 className="w-5 h-5" style={{ color: '#1A56DB' }} />
                            </div>
                            <div className="flex-1">
                              <div className="font-medium text-gray-900 text-sm">{company.name}</div>
                              {company.taxId && <div className="text-xs text-gray-400 mt-0.5">税号: {company.taxId}</div>}
                              {company.contactName && <div className="text-xs text-gray-400">联系人: {company.contactName} {company.contactPhone}</div>}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 单行预览条 */}
                      <div className="px-4 pb-3">
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: '#F8FAFF' }}>
                          {/* 报税标签 */}
                          <span className="text-xs text-gray-400">报税</span>
                          {/* 分隔符 */}
                          <span className="text-gray-200 text-xs">|</span>
                          {/* 申报月份 + 截止日 */}
                          <span className="text-xs text-gray-700 font-medium">{reportTaxMonth}月税务</span>
                          <span className="text-xs text-gray-400">{nextDue.getMonth() + 1}月{nextDue.getDate()}日截止</span>
                          {/* 倒计时 */}
                          <span className="text-xs font-bold ml-auto" style={{ color: daysLeft <= 3 ? '#EF4444' : daysLeft <= 7 ? '#F59E0B' : '#1A56DB' }}>还有{daysLeft}天</span>
                          {/* 分隔符 */}
                          <span className="text-gray-200 text-xs">|</span>
                          {/* 授权状态圆点 */}
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: statusColor }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI 账本：白色内容区 */}
      {isCustomAI && (
        <div className="flex-1 px-4 pb-20 space-y-4 pt-4">
          {/* 56号账本白色内容区 - 按需添加功能 */}
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            <img 
              src="https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/posters/fitline-activize-99.webp" 
              alt="FitLine Activize Oxyplus 限时特惠 ¥99" 
              className="w-full h-auto"
              loading="lazy"
            />
            <div className="p-4 text-center">
              <div className="text-lg font-bold text-gray-800">FitLine Activize Oxyplus</div>
              <div className="text-sm text-gray-500 mt-1">德国原装进口 · 运动营养食品 · 耐力类</div>
              <div className="mt-3 flex items-center justify-center gap-3">
                <span className="text-red-500 text-2xl font-bold">¥99</span>
                <span className="text-gray-400 line-through text-sm">¥199</span>
              </div>
              <button 
                className="mt-3 w-full bg-gradient-to-r from-red-500 to-orange-500 text-white py-3 rounded-xl text-base font-semibold shadow-lg"
                onClick={() => window.open('https://jiangyuchen.cn/api/alipay/quick-pay?amount=99&subject=FitLine%20Activize%20Oxyplus%20%E8%BF%90%E5%8A%A8%E8%90%A5%E5%85%BB%E9%A3%9F%E5%93%81', '_blank')}
              >
                立即购买
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 记账记录列表 —— 非 custom_ae / custom_af / custom_ah / custom_ai 账本显示 */}
      {!isCustomAE && !isCustomAF && !isCustomAH && !isCustomAI && <div className={`flex-1 px-4 pb-20 space-y-3`}>
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

      {/* 底部添加按鈕：非定制账本显示 */}
      {!isCustomAE && !isDiet && !isCustomAF && !isCustomAH && !isCustomAI && (
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

      {/* AF/AH 视角切换横幅 */}
      {(isCustomAF || isCustomAH) && viewAsUserId && (isOwner || isAdmin) && (
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

      {/* AF/AH 视角切换弹窗：成员列表 + 搜索 */}
      {showViewAsPicker && (isCustomAF || isCustomAH) && (isOwner || isAdmin) && (
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

