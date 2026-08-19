import { useState, useMemo, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { setSmartAccountingLastPage } from "@/lib/smartAccountingNavigation";
import { toast } from "sonner";
import PolicyLoanManagement from "./PolicyLoanManagement";
import { UserAvatar } from "@/components/UserAvatar";
import {
  ChevronLeft, Plus, CreditCard, Pencil, Trash2, Copy,
  X, Check, Users, User, Search, ChevronDown, Lightbulb, ToggleLeft, ToggleRight,
  Eye, EyeOff, ShieldCheck, PhoneCall, RefreshCw, SlidersHorizontal, Loader2, CalendarDays,
} from "lucide-react";
import { LoanServiceContactSheet } from "@/components/LoanServiceContactSheet";
import { getCreditCardServiceContact, type LoanServiceContact } from "@/lib/loanServiceContacts";
import { getBankBrand, normalizeDisplayBankName } from "@/lib/bankBranding";

const BANK_OPTIONS = [
  // 六大国有銀行（规模最大）
  "工商銀行", "建设銀行", "中国銀行", "农业銀行", "交通銀行", "邮储銀行",
  // 全国性股份制銀行（热门信用卡发行行）
  "招商銀行", "平安銀行", "兴业銀行", "中信銀行", "浦发銀行", "民生銀行",
  "光大銀行", "华夏銀行", "广发銀行", "浙商銀行",
  // 城商行（常用）
  "上海銀行", "北京銀行", "宁波銀行", "南京銀行", "江苏銀行",
  "广州銀行", "长沙銀行", "成都銀行", "汉口銀行", "中原銀行",
  // 外资行
  "汇丰銀行", "微众銀行", "渐丰銀行", "花旗銀行",
  "其他銀行",
];

const CARD_NETWORKS = ["银联", "Visa", "Mastercard", "AMEX", "JCB", "Discover"];
const CURRENCIES = ["CNY", "USD", "HKD", "EUR", "JPY", "SGD", "GBP", "AUD"];

type LoanCategory = 'creditCard' | 'policyLoan' | 'huabei' | 'housingFund';
const LOAN_CATEGORY_OPTIONS: Array<{ value: LoanCategory; label: string }> = [
  { value: 'creditCard', label: '信用卡' },
  { value: 'policyLoan', label: '保单贷款' },
  { value: 'huabei', label: '花呗' },
  { value: 'housingFund', label: '公积金贷款' },
];

const LOAN_TYPE_FILTER_STORAGE_KEY = 'haoyouji:loan-management:type-filters';
const ADMIN_LOAN_USER_FILTER_STORAGE_KEY = 'haoyouji:loan-management:admin-user-filter';
type AdminLoanUserFilter = { id: number; name: string };

function readRememberedAdminLoanUserFilter(): AdminLoanUserFilter | null {
  if (typeof window === 'undefined') return null;
  try {
    const rawValue = window.localStorage.getItem(ADMIN_LOAN_USER_FILTER_STORAGE_KEY);
    const parsedValue: unknown = rawValue ? JSON.parse(rawValue) : null;
    if (!parsedValue || typeof parsedValue !== 'object') return null;
    const candidate = parsedValue as { id?: unknown; name?: unknown };
    const id = Number(candidate.id);
    const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
    return Number.isInteger(id) && id > 0 && name ? { id, name } : null;
  } catch {
    return null;
  }
}

function readRememberedLoanTypeFilters(): LoanCategory[] {
  if (typeof window === 'undefined') return [];
  try {
    const rawValue = window.localStorage.getItem(LOAN_TYPE_FILTER_STORAGE_KEY);
    const parsedValue: unknown = rawValue ? JSON.parse(rawValue) : [];
    if (!Array.isArray(parsedValue)) return [];
    const allowedTypes = new Set<LoanCategory>(LOAN_CATEGORY_OPTIONS.map((option) => option.value));
    const validTypes = Array.from(new Set(parsedValue.filter((value): value is LoanCategory => typeof value === 'string' && allowedTypes.has(value as LoanCategory))));
    return validTypes.length === 0 || validTypes.length === LOAN_CATEGORY_OPTIONS.length ? [] : validTypes;
  } catch {
    return [];
  }
}

// 计算最优刷卡建议
// 正确逻辑：最优刷卡日 = 账单日 + 1天
// 原因：账单日后一天刷卡 → 不进入刚出的账单 → 进入下个账期 → 等到下个账单日出账 → 再到下个还款日还款 → 免息期最长
function calcBestSwipeDay(billingDay: number, dueDay: number): {
  bestDay: number; maxFreeDays: number; description: string;
  todayStatus: 'best' | 'good' | 'ok' | 'avoid';
  todayFreeDays: number;
} {
  const today = new Date();
  const todayDate = today.getDate();

  // 最优刷卡日 = 账单日的后一天
  // 如果账单日是月尾，则后一天是下个月 1 日
  const bestDay = billingDay >= 28 ? 1 : billingDay + 1;

  // 计算某天刷卡的免息天数
  // 账期划分：账单日后一天 到 下个账单日（含）为一个账期
  //   - 属于最优账期 [bestDay, billingDay]：还款日为下个周期的 dueDay（免息期最长）
  //   - 属于次优账期 [billingDay+1, dueDay]：还款日为本周期的 dueDay（免息期较短）
  function calcFreeDays(swipeDay: number): number {
    // 判断刷卡日是否属于最优账期 [bestDay, billingDay]
    let inBestPeriod: boolean;
    if (bestDay <= billingDay) {
      // 正常情况：账单日 < 28（如账单日 18日，最优刷卡日 19日）
      // 最优账期：[19日, 18日]→跨月，即 19日到月尾 + 下月 1日到 18日
      inBestPeriod = swipeDay >= bestDay || swipeDay <= billingDay;
    } else {
      // 账单日在月尾（如账单日 28日，最优刷卡日是下月 1日）
      // 最优账期：[1日, 28日]
      inBestPeriod = swipeDay >= bestDay && swipeDay <= billingDay;
    }

    let days: number;
    if (inBestPeriod) {
      // 最优账期：免息天数 = 刷卡日 → 下个账单日 → 下个还款日
      // 第一段：刷卡日到下个账单日
      const daysToNextBilling = swipeDay <= billingDay
        ? billingDay - swipeDay          // 同月
        : 30 - swipeDay + billingDay;    // 跨月
      // 第二段：账单日到下个还款日
      const daysFromBillingToDue = dueDay > billingDay
        ? dueDay - billingDay            // 还款日在账单日后（同月内）
        : 30 - billingDay + dueDay;      // 还款日在下个月
      days = daysToNextBilling + daysFromBillingToDue;
    } else {
      // 次优账期：免息天数 = 刷卡日 → 本周期还款日
      days = dueDay > swipeDay
        ? dueDay - swipeDay
        : 30 - swipeDay + dueDay;
    }
    return Math.max(1, Math.round(days));
  }

  const maxFreeDays = calcFreeDays(bestDay);
  const todayFreeDays = calcFreeDays(todayDate);

  let todayStatus: 'best' | 'good' | 'ok' | 'avoid';
  if (todayDate === bestDay) {
    todayStatus = 'best';
  } else if (todayFreeDays >= maxFreeDays * 0.8) {
    todayStatus = 'good';
  } else if (todayDate === billingDay) {
    todayStatus = 'avoid'; // 账单日当天免息期最短
  } else {
    todayStatus = 'ok';
  }

  return {
    bestDay,
    maxFreeDays,
    todayFreeDays,
    todayStatus,
    description: `最优：每月 ${bestDay} 日刷（账单日后一天），免息最长 ${maxFreeDays} 天`,
  };
}

// 使用北京时间计算下一次每月固定日期：当天仍显示本期，次日零点起切换至下期。
function getNextMonthlyDate(day: number): { label: string; days: number } {
  const nowBj = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const year = nowBj.getUTCFullYear();
  const currentMonth = nowBj.getUTCMonth();
  const today = nowBj.getUTCDate();
  const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

  let targetYear = year;
  let targetMonth = currentMonth;
  let targetDay = Math.min(Math.max(1, day), daysInMonth(targetYear, targetMonth));
  if (today > targetDay) {
    targetMonth += 1;
    if (targetMonth > 11) {
      targetMonth = 0;
      targetYear += 1;
    }
    targetDay = Math.min(Math.max(1, day), daysInMonth(targetYear, targetMonth));
  }

  const todayStart = Date.UTC(year, currentMonth, today);
  const targetStart = Date.UTC(targetYear, targetMonth, targetDay);
  return {
    label: `${targetMonth + 1}月${targetDay}日`,
    days: Math.max(0, Math.round((targetStart - todayStart) / (1000 * 60 * 60 * 24))),
  };
}

// 返回北京时间从今天起最近一次发生的每月固定日期；当天仍归入今天。
function getUpcomingMonthlyDateKey(day: number): string {
  const nowBj = new Date(Date.now() + 8 * 60 * 60 * 1000);
  let year = nowBj.getUTCFullYear();
  let month = nowBj.getUTCMonth();
  const today = nowBj.getUTCDate();
  const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  let targetDay = Math.min(Math.max(1, day), daysInMonth(year, month));
  if (today > targetDay) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
    targetDay = Math.min(Math.max(1, day), daysInMonth(year, month));
  }
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
}

// 返回北京时间最近一次已经到达的账单日，作为手动录入“本期还款账单数”的默认账期。
function getLatestBillingDateValue(day: number): string {
  const nowBj = new Date(Date.now() + 8 * 60 * 60 * 1000);
  let year = nowBj.getUTCFullYear();
  let month = nowBj.getUTCMonth();
  const today = nowBj.getUTCDate();
  const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  let targetDay = Math.min(Math.max(1, day), daysInMonth(year, month));

  if (today < targetDay) {
    month -= 1;
    if (month < 0) {
      month = 11;
      year -= 1;
    }
    targetDay = Math.min(Math.max(1, day), daysInMonth(year, month));
  }
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
}

// 返回下一期尚未到达的账单日及距离其北京时间零点的自然日倒计时。
function getNextBillingDateInfo(day: number) {
  const nowBj = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const currentYear = nowBj.getUTCFullYear();
  const currentMonth = nowBj.getUTCMonth();
  const today = nowBj.getUTCDate();
  const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const currentMonthDay = Math.min(Math.max(1, day), daysInMonth(currentYear, currentMonth));
  const targetMonth = today >= currentMonthDay ? currentMonth + 1 : currentMonth;
  const targetDate = new Date(Date.UTC(currentYear, targetMonth, 1));
  const year = targetDate.getUTCFullYear();
  const month = targetDate.getUTCMonth();
  const targetDay = Math.min(Math.max(1, day), daysInMonth(year, month));
  const targetStart = Date.UTC(year, month, targetDay);
  const todayStart = Date.UTC(currentYear, currentMonth, today);
  return {
    billingDate: `${year}-${String(month + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`,
    days: Math.max(0, Math.round((targetStart - todayStart) / (24 * 60 * 60 * 1000))),
  };
}

function toBillingDateValue(value: string | Date | null | undefined): string {
  // tRPC 会把 MySQL DATE 反序列化为 Date；String(Date) 以星期开头，无法直接用 YYYY-MM-DD 正则匹配。
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const match = String(value || '').match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] || '';
}

function formatBillingPeriodDate(value: string | Date | null | undefined): string {
  const dateValue = toBillingDateValue(value);
  if (!dateValue) return '未设置账期';
  const [year, month, day] = dateValue.split('-').map(Number);
  return `${year}年${month}月${day}日`;
}

// 账单日状态圆点只看本月账期：未到本月账单日时不显示，到了当天零点后才显示。
function getCurrentMonthBillingPeriod(day: number) {
  const nowBj = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const year = nowBj.getUTCFullYear();
  const month = nowBj.getUTCMonth();
  const today = nowBj.getUTCDate();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const billingDay = Math.min(Math.max(1, day), daysInMonth);
  return {
    billingDate: `${year}-${String(month + 1).padStart(2, '0')}-${String(billingDay).padStart(2, '0')}`,
    hasReached: today >= billingDay,
  };
}

// 将一个账单日映射到该账期对应的最后还款日，供还款金额弹窗引用。
function getDueDateForBillingPeriod(billingDateValue: string, dueDay: number): string {
  const [billingYear, billingMonth, billingDay] = billingDateValue.split('-').map(Number);
  const dueInNextMonth = dueDay <= billingDay;
  const dueBase = new Date(Date.UTC(billingYear, billingMonth - 1 + (dueInNextMonth ? 1 : 0), 1));
  const dueYear = dueBase.getUTCFullYear();
  const dueMonth = dueBase.getUTCMonth();
  const daysInDueMonth = new Date(Date.UTC(dueYear, dueMonth + 1, 0)).getUTCDate();
  const resolvedDueDay = Math.min(Math.max(1, dueDay), daysInDueMonth);
  return `${dueYear}-${String(dueMonth + 1).padStart(2, '0')}-${String(resolvedDueDay).padStart(2, '0')}`;
}

// 兼容列表排序等既有调用，统一使用北京时间下一期日期。
function daysUntil(day: number): number {
  return getNextMonthlyDate(day).days;
}

// 判断临时额度是否在有效期内
function isTempLimitActive(startStr: string | Date | null | undefined, endStr: string | Date | null | undefined): boolean {
  if (!endStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // 将任意类型转为本地日期（支持 Date 对象和字符串）
  const parseLocal = (s: string | Date) => {
    if (s instanceof Date) return new Date(s.getFullYear(), s.getMonth(), s.getDate());
    const str = String(s).slice(0, 10);
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const end = parseLocal(endStr);
  if (startStr) {
    const start = parseLocal(startStr);
    return today >= start && today <= end;
  }
  return today <= end;
}

// 格式化日期为 M月D日
function formatDateLabel(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '';
  if (dateStr instanceof Date) {
    return `${dateStr.getMonth() + 1}月${dateStr.getDate()}日`;
  }
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

interface CardForm {
  bankName: string; cardHolder: string; cardLast4: string;
  creditLimit: string; billingDay: string; dueDay: string;
  currencies: string[];
  isMultiCurrency: boolean;
  cardNetworks: string[];
  expiryMonth: string; note: string;
  // 临时额度
  hasTempLimit: boolean;
  tempLimit: string;
  tempLimitStart: string;
  tempLimitEnd: string;
}
const emptyForm: CardForm = {
  bankName: "", cardHolder: "", cardLast4: "", creditLimit: "",
  billingDay: "", dueDay: "",
  currencies: ["CNY"], isMultiCurrency: false,
  cardNetworks: [], expiryMonth: "", note: "",
  hasTempLimit: false, tempLimit: "", tempLimitStart: "", tempLimitEnd: "",
};

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

// 生成有效期月份选项（从当前月延伸至 2050 年 12 月）
function genMonthOptions() {
  const opts: { label: string; value: string }[] = [];
  const now = new Date();
  const firstYear = now.getFullYear();
  const lastYear = Math.max(2050, firstYear);
  for (let year = firstYear; year <= lastYear; year++) {
    const firstMonth = year === firstYear ? now.getMonth() : 0;
    for (let month = firstMonth; month < 12; month++) {
      const m = String(month + 1).padStart(2, '0');
      opts.push({ label: `${year}年${m}月`, value: `${year}-${m}-01` });
    }
  }
  return opts;
}
const MONTH_OPTIONS = genMonthOptions();

function getCreditCardCapacity(card: any) {
  const baseLimit = Number(card.credit_limit || 0);
  const hasTempLimit = card.temp_limit != null && Number(card.temp_limit) > 0;
  const tempLimit = hasTempLimit ? Number(card.temp_limit) : null;
  const tempActive = hasTempLimit && isTempLimitActive(card.temp_limit_start, card.temp_limit_end);
  const rawAvailable = card.available_limit != null ? Number(card.available_limit) : null;

  if (tempActive && tempLimit != null) {
    const availableLimit = rawAvailable == null ? tempLimit : Math.max(0, Math.min(tempLimit, rawAvailable));
    const usedLimit = Math.max(0, tempLimit - availableLimit);
    return { baseLimit, tempLimit, tempActive, tempExpired: false, totalLimit: tempLimit, availableLimit, usedLimit, overBaseLimit: Math.max(0, usedLimit - baseLimit) };
  }

  if (hasTempLimit && tempLimit != null && rawAvailable != null) {
    // 到期后仍用原临时额度与当时记录的可用额度，保留临时额度期间的真实已用金额。
    const usedLimit = Math.max(0, tempLimit - rawAvailable);
    const availableLimit = Math.max(0, baseLimit - usedLimit);
    return { baseLimit, tempLimit, tempActive: false, tempExpired: true, totalLimit: baseLimit, availableLimit, usedLimit, overBaseLimit: Math.max(0, usedLimit - baseLimit) };
  }

  const availableLimit = rawAvailable == null ? baseLimit : Math.max(0, Math.min(baseLimit, rawAvailable));
  const usedLimit = Math.max(0, baseLimit - availableLimit);
  return { baseLimit, tempLimit, tempActive: false, tempExpired: false, totalLimit: baseLimit, availableLimit, usedLimit, overBaseLimit: 0 };
}

function LoanCapacitySummary({
  viewMode,
  cards,
  registrationCards,
  adminUserFilter,
  isCardsLoading,
  showLoanControls,
  onToggleLoanControls,
  activeLoanTypeFilterCount,
  hasAdminDueFilter,
}: {
  viewMode: 'self' | 'admin';
  cards: any[];
  registrationCards: any[];
  adminUserFilter: { id: number; name: string } | null;
  isCardsLoading: boolean;
  showLoanControls: boolean;
  onToggleLoanControls: () => void;
  activeLoanTypeFilterCount: number;
  hasAdminDueFilter: boolean;
}) {
  const { user } = useAuth();
  const adminMode = viewMode === 'admin';
  const hasActiveLoanTypeFilter = activeLoanTypeFilterCount > 0;
  const hasAdminUserFilter = adminMode && !!adminUserFilter;
  const activeFilterCount = activeLoanTypeFilterCount + (hasAdminUserFilter ? 1 : 0) + (hasAdminDueFilter ? 1 : 0);
  const hasActiveFilter = activeFilterCount > 0;
  const collapsedFilterLabel = hasAdminUserFilter && activeFilterCount === 1 ? '已选用户' : `已筛选 ${activeFilterCount}`;
  const targetUsageUserId = adminMode ? (adminUserFilter?.id ?? null) : Number((user as any)?.id || 0);
  const billingStatementEntriesQuery = trpc.creditCard.billingStatementEntries.useQuery(
    adminMode && adminUserFilter ? { userId: adminUserFilter.id } : undefined
  );
  const [showUsageSheet, setShowUsageSheet] = useState(false);
  const [editingUsageRecordId, setEditingUsageRecordId] = useState<number | null>(null);
  const [usageDraft, setUsageDraft] = useState({ amount: '', description: '' });
  const { data: usageRecordsData = [], refetch: refetchUsageRecords, isFetching: isFetchingUsageRecords } = trpc.creditCard.usageRecords.useQuery(
    targetUsageUserId ? { userId: targetUsageUserId } : undefined,
    { enabled: !!targetUsageUserId }
  );
  const usageRecords = usageRecordsData as any[];
  const clearUsageDraft = () => {
    setEditingUsageRecordId(null);
    setUsageDraft({ amount: '', description: '' });
  };
  const createUsageRecordMutation = trpc.creditCard.createUsageRecord.useMutation({
    onSuccess: () => {
      clearUsageDraft();
      void refetchUsageRecords();
      toast.success('已用额度用途已记录');
    },
    onError: (error) => toast.error(error.message || '用途记录保存失败'),
  });
  const updateUsageRecordMutation = trpc.creditCard.updateUsageRecord.useMutation({
    onSuccess: () => {
      clearUsageDraft();
      void refetchUsageRecords();
      toast.success('已用额度用途已更新');
    },
    onError: (error) => toast.error(error.message || '用途记录更新失败'),
  });
  const deleteUsageRecordMutation = trpc.creditCard.deleteUsageRecord.useMutation({
    onSuccess: () => {
      clearUsageDraft();
      void refetchUsageRecords();
      toast.success('已用额度用途已删除');
    },
    onError: (error) => toast.error(error.message || '用途记录删除失败'),
  });
  const { data: myPolicyLoans = [], isFetching: isFetchingMyPolicy } = trpc.policyLoan.list.useQuery({ loanType: 'policy' }, { enabled: !adminMode });
  const { data: myHuabeiLoans = [], isFetching: isFetchingMyHuabei } = trpc.policyLoan.list.useQuery({ loanType: 'huabei' }, { enabled: !adminMode });
  const { data: myHousingFundLoans = [], isFetching: isFetchingMyHousingFund } = trpc.policyLoan.list.useQuery({ loanType: 'housing_fund' }, { enabled: !adminMode });
  const { data: allPolicyLoans = [], isFetching: isFetchingAllPolicy } = trpc.policyLoan.adminListAll.useQuery({ loanType: 'policy' }, { enabled: adminMode });
  const { data: allHuabeiLoans = [], isFetching: isFetchingAllHuabei } = trpc.policyLoan.adminListAll.useQuery({ loanType: 'huabei' }, { enabled: adminMode });
  const { data: allHousingFundLoans = [], isFetching: isFetchingAllHousingFund } = trpc.policyLoan.adminListAll.useQuery({ loanType: 'housing_fund' }, { enabled: adminMode });

  const [scheduleDayMarker, setScheduleDayMarker] = useState(() => Date.now());
  const billingTimelineRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const nowBj = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const nextBeijingMidnight = Date.UTC(nowBj.getUTCFullYear(), nowBj.getUTCMonth(), nowBj.getUTCDate() + 1);
    const delay = Math.max(1000, nextBeijingMidnight - (Date.now() + 8 * 60 * 60 * 1000) + 250);
    const timer = window.setTimeout(() => setScheduleDayMarker(Date.now()), delay);
    return () => window.clearTimeout(timer);
  }, [scheduleDayMarker]);

  const scopedCreditCards = useMemo(
    () => adminMode && adminUserFilter
      ? (cards as any[]).filter((card) => Number(card.user_id) === adminUserFilter.id)
      : (cards as any[]),
    [adminMode, adminUserFilter, cards]
  );

  const latestBillingRegistrationSummary = useMemo(() => {
    const issuedCards = registrationCards.filter((card: any) => Number(card.billing_day || 0) > 0);
    const statementByKey = new Map(
      ((billingStatementEntriesQuery.data || []) as any[]).map((statement) => [`${Number(statement.credit_card_id)}:${toBillingDateValue(statement.billing_date)}`, statement])
    );
    let registeredCount = 0;
    let paidOffCount = 0;
    let partiallyPaidCount = 0;
    let unpaidCount = 0;
    issuedCards.forEach((card: any) => {
      const statement = statementByKey.get(`${Number(card.id)}:${getLatestBillingDateValue(Number(card.billing_day))}`);
      if (!statement) return;
      registeredCount += 1;
      const statementAmount = Math.max(0, Number(statement.statement_amount || 0));
      const paidAmount = Math.max(0, Number(statement.paid_amount || 0));
      // 本期账单登记为 0 表示无消费，不需要再录入还款，直接视为已还清。
      if (statementAmount <= 0) paidOffCount += 1;
      else if (paidAmount >= statementAmount) paidOffCount += 1;
      else if (paidAmount > 0) partiallyPaidCount += 1;
      else unpaidCount += 1;
    });
    return {
      issuedCount: issuedCards.length,
      registeredCount,
      pendingCount: Math.max(0, issuedCards.length - registeredCount),
      paidOffCount,
      partiallyPaidCount,
      unpaidCount,
    };
  }, [registrationCards, billingStatementEntriesQuery.data, scheduleDayMarker]);

  const upcomingBillingReminders = useMemo(() => {
    const nowBj = new Date(scheduleDayMarker + 8 * 60 * 60 * 1000);
    const startYear = nowBj.getUTCFullYear();
    const startMonth = nowBj.getUTCMonth();
    const startDay = nowBj.getUTCDate();
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    // 以今天为锚点：左侧过去30天，右侧未来30天，首次打开自动将今天对齐到第一格。
    const dates = Array.from({ length: 61 }, (_, index) => {
      const offset = index - 30;
      const date = new Date(Date.UTC(startYear, startMonth, startDay + offset));
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth();
      const day = date.getUTCDate();
      return {
        key: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        year,
        month,
        day,
        dateLabel: `${month + 1}/${day}`,
        weekday: offset === 0 ? '今日' : weekdays[date.getUTCDay()],
        isToday: offset === 0,
        billingCount: 0,
        dueCount: 0,
        billingBanks: [] as string[],
        dueBanks: [] as string[],
      };
    });
    const markMonthlyDate = (dayOfMonth: number, kind: 'billing' | 'due', bankName: string) => {
      dates.forEach((date) => {
        const lastDay = new Date(Date.UTC(date.year, date.month + 1, 0)).getUTCDate();
        if (date.day !== Math.min(Math.max(1, dayOfMonth), lastDay)) return;
        if (kind === 'billing') {
          date.billingCount += 1;
          date.billingBanks.push(bankName);
        } else {
          date.dueCount += 1;
          date.dueBanks.push(bankName);
        }
      });
    };
    scopedCreditCards.forEach((card: any) => {
      const bankName = normalizeDisplayBankName(card.bank_name);
      const billingDay = Number(card.billing_day || 0);
      if (billingDay > 0) markMonthlyDate(billingDay, 'billing', bankName);
      const dueDay = Number(card.due_day || 0);
      if (dueDay > 0) markMonthlyDate(dueDay, 'due', bankName);
    });
    return dates;
  }, [scopedCreditCards, scheduleDayMarker]);

  useEffect(() => {
    const timeline = billingTimelineRef.current;
    if (!timeline) return;
    const timer = window.requestAnimationFrame(() => {
      const today = timeline.querySelector<HTMLElement>('[data-billing-today="true"]');
      if (today) timeline.scrollLeft = today.offsetLeft;
    });
    return () => window.cancelAnimationFrame(timer);
  }, [scheduleDayMarker, upcomingBillingReminders]);

  const summary = useMemo(() => {
    const matchesSelectedAdminUser = (loan: any) => !adminMode || !adminUserFilter || Number(loan.user_id) === adminUserFilter.id;
    const scopedPolicyLoans = ((adminMode ? allPolicyLoans : myPolicyLoans) as any[]).filter(matchesSelectedAdminUser);
    const scopedHuabeiLoans = ((adminMode ? allHuabeiLoans : myHuabeiLoans) as any[]).filter(matchesSelectedAdminUser);
    const scopedHousingFundLoans = ((adminMode ? allHousingFundLoans : myHousingFundLoans) as any[]).filter(matchesSelectedAdminUser);

    let totalLimit = 0;
    let usedLimit = 0;
    let availableLimit = 0;

    scopedCreditCards.forEach((card: any) => {
      const capacity = getCreditCardCapacity(card);
      totalLimit += capacity.totalLimit;
      availableLimit += capacity.availableLimit;
      usedLimit += capacity.usedLimit;
    });

    [...scopedPolicyLoans, ...scopedHuabeiLoans, ...scopedHousingFundLoans].forEach((loan: any) => {
      const limit = Number(loan.loan_amount || 0);
      const used = loan.outstanding_balance != null ? Math.max(0, Number(loan.outstanding_balance)) : limit;
      const safeUsed = Math.min(limit, used);
      totalLimit += limit;
      usedLimit += safeUsed;
      availableLimit += Math.max(0, limit - safeUsed);
    });

    return {
      totalLimit,
      usedLimit,
      availableLimit,
      cardCount: scopedCreditCards.length,
      policyCount: scopedPolicyLoans.length,
      huabeiCount: scopedHuabeiLoans.length,
      housingFundCount: scopedHousingFundLoans.length,
    };
  }, [adminMode, adminUserFilter, scopedCreditCards, myPolicyLoans, myHuabeiLoans, myHousingFundLoans, allPolicyLoans, allHuabeiLoans, allHousingFundLoans]);

  const formatAmount = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  const totalForRatio = Math.max(0, summary.totalLimit);
  const usedPercent = totalForRatio > 0
    ? Math.min(100, Math.max(0, (summary.usedLimit / totalForRatio) * 100))
    : 0;
  const availablePercent = totalForRatio > 0
    ? Math.min(100 - usedPercent, Math.max(0, (summary.availableLimit / totalForRatio) * 100))
    : 0;
  const isLoading = isCardsLoading || (adminMode ? isFetchingAllPolicy || isFetchingAllHuabei || isFetchingAllHousingFund : isFetchingMyPolicy || isFetchingMyHuabei || isFetchingMyHousingFund);
  const listedUsageAmount = useMemo(
    () => usageRecords.reduce((total, record) => total + Math.max(0, Number(record.amount || 0)), 0),
    [usageRecords]
  );
  const unlistedUsageAmount = Math.max(0, summary.usedLimit - listedUsageAmount);
  const overListedUsageAmount = Math.max(0, listedUsageAmount - summary.usedLimit);
  const listedUsagePercent = summary.usedLimit > 0 ? (listedUsageAmount / summary.usedLimit) * 100 : 0;
  const listedUsageWidth = Math.min(100, Math.max(0, listedUsagePercent));
  const isSavingUsageRecord = createUsageRecordMutation.isPending || updateUsageRecordMutation.isPending;
  const openUsageSheet = () => {
    if (!targetUsageUserId) {
      toast.error(adminMode ? '请先筛选一位用户后再查看其已用额度用途' : '用户信息尚未加载完成');
      return;
    }
    clearUsageDraft();
    setShowUsageSheet(true);
  };
  const saveUsageRecord = async () => {
    const amount = Number(usageDraft.amount);
    const description = usageDraft.description.trim();
    if (!usageDraft.amount.trim() || Number.isNaN(amount) || amount <= 0) {
      toast.error('请输入大于 0 的用途金额');
      return;
    }
    if (!description) {
      toast.error('请填写该金额的用途');
      return;
    }
    const otherRecordedAmount = usageRecords.reduce(
      (total, record) => total + (Number(record.id) === editingUsageRecordId ? 0 : Math.max(0, Number(record.amount || 0))),
      0
    );
    if (amount + otherRecordedAmount > summary.usedLimit + 0.0001) {
      toast.error(`已列明金额不能超过当前已用额度 ${formatAmount(summary.usedLimit)}`);
      return;
    }
    if (editingUsageRecordId) {
      await updateUsageRecordMutation.mutateAsync({ id: editingUsageRecordId, amount, description });
      return;
    }
    await createUsageRecordMutation.mutateAsync({ userId: targetUsageUserId ?? undefined, amount, description });
  };
  const startEditingUsageRecord = (record: any) => {
    setEditingUsageRecordId(Number(record.id));
    setUsageDraft({ amount: String(Number(record.amount || 0)), description: String(record.description || '') });
  };
  const removeUsageRecord = async (record: any) => {
    if (!window.confirm(`确认删除“${record.description}”这条用途记录吗？`)) return;
    await deleteUsageRecordMutation.mutateAsync({ id: Number(record.id) });
  };
  return (
    <div className="border-b border-slate-100 bg-white px-4 py-2">
      {isLoading ? (
        <div className="flex h-[88px] items-center justify-center gap-2 rounded-md border border-[#DCE8F6] bg-white text-xs text-slate-400 shadow-[0_6px_16px_rgba(26,43,74,0.04)]">
          <Loader2 className="h-4 w-4 animate-spin text-[#1A2B4A]" />
          正在加载{adminMode ? '所有用户' : '我的'}贷款数据...
        </div>
      ) : (
        <div className="rounded-md border border-[#DCE8F6] bg-white p-2.5 shadow-[0_6px_16px_rgba(26,43,74,0.04)]">
          <div className="flex items-end justify-between gap-2">
            <div className="flex min-w-0 items-baseline gap-1.5">
              <p className="shrink-0 text-[10px] font-medium text-slate-500">总额度</p>
              <p className="truncate text-[24px] font-bold leading-6 tracking-tight text-[#1A2B4A]">{formatAmount(summary.totalLimit)}</p>
            </div>
            <button type="button" onClick={onToggleLoanControls} className={`mb-0.5 flex h-6 shrink-0 items-center gap-1 rounded-sm px-1.5 text-[10px] font-semibold transition-colors ${showLoanControls ? 'bg-[#1A2B4A] text-white' : hasActiveFilter ? 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-300 active:bg-amber-100' : 'bg-slate-100 text-slate-600 active:bg-slate-200'}`} aria-label={showLoanControls ? '收起筛选和排序' : hasActiveFilter ? `已应用 ${activeFilterCount} 个筛选条件${hasAdminUserFilter ? `，用户：${adminUserFilter?.name}` : ''}` : '展开筛选和排序'}>
              {showLoanControls ? <ChevronDown className="h-3 w-3 rotate-180 transition-transform" /> : <SlidersHorizontal className="h-3 w-3" />}
              <span>{showLoanControls ? '收起' : hasActiveFilter ? collapsedFilterLabel : '筛选'}</span>
            </button>
          </div>

          <div
            className="relative mt-1.5 h-2.5 overflow-hidden rounded-sm bg-slate-100 ring-1 ring-inset ring-slate-200/80"
            aria-label={`额度使用情况：已用 ${Math.round(usedPercent)}%，剩余可用 ${Math.round(availablePercent)}%`}
          >
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-rose-400 to-rose-500 transition-[width] duration-500"
              style={{ width: `${usedPercent}%` }}
            />
            <div
              className="absolute inset-y-0 right-0 bg-gradient-to-r from-emerald-400 to-emerald-500 transition-[width] duration-500"
              style={{ width: `${availablePercent}%` }}
            />
          </div>

          <div className="mt-2 grid grid-cols-2 divide-x divide-[#E4ECF5] text-[10px] font-medium">
            <button type="button" onClick={openUsageSheet} className="flex min-w-0 items-baseline gap-1.5 pr-2 text-left text-slate-500 transition-opacity active:opacity-60" aria-label="查看并记录已用额度用途">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
              <span className="inline-block border-b border-dashed border-[#1A2B4A]/55 pb-px">已用</span>
              <span className="text-sm font-bold text-rose-500">{formatAmount(summary.usedLimit)}</span>
              <span className="text-[10px] font-semibold text-rose-500">{Math.round(usedPercent)}%</span>
            </button>
            <p className="flex min-w-0 items-baseline justify-end gap-1.5 pl-2 text-slate-500">
              <span>可用</span>
              <span className="text-sm font-bold text-emerald-600">{formatAmount(summary.availableLimit)}</span>
              <span className="text-[10px] font-semibold text-emerald-600">{Math.round(availablePercent)}%</span>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
            </p>
          </div>

          <section className="mt-1.5 border-t border-[#E4ECF5] pt-1.5" aria-label="前后30日账期提醒，默认从今日开始，可横向双向滑动查看">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="flex items-center gap-0.5 text-[9px] font-semibold leading-3 text-slate-600"><CalendarDays className="h-3 w-3 text-[#1A2B4A]" />前后30日账期</p>
              <p className="flex items-center gap-1.5 text-[8px] font-medium leading-3 text-slate-400"><span className="flex items-center gap-0.5"><i className="h-1 w-1 rounded-full" style={{ backgroundColor: '#FACC15' }} />账单日</span><span className="flex items-center gap-0.5"><i className="h-1 w-1 rounded-full" style={{ backgroundColor: '#0066FF' }} />还款日</span></p>
            </div>
            <div ref={billingTimelineRef} className="-mx-0.5 touch-pan-x overflow-x-auto px-0.5 pb-0.5 scroll-smooth snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="横向滑动查看过去30天和未来30天账期">
              <div className="flex w-max gap-0.5 pr-0.5">
              {upcomingBillingReminders.map((day) => {
                const hasReminder = day.billingCount > 0 || day.dueCount > 0;
                const tooltip = [
                  day.billingCount > 0 ? `账单日：${day.billingBanks.join('、')}` : '',
                  day.dueCount > 0 ? `最后还款日：${day.dueBanks.join('、')}` : '',
                ].filter(Boolean).join('\n');
                return (
                  <div key={day.key} data-billing-today={day.isToday ? 'true' : undefined} title={tooltip || `${day.weekday}${day.day}日无账期提醒`} className={`w-[calc((100vw-42px)/7)] max-w-[62px] shrink-0 snap-start rounded-sm px-0.5 py-0.5 text-center ${day.weekday === '今日' ? 'bg-[#1A2B4A] text-white' : hasReminder ? 'bg-slate-50 ring-1 ring-inset ring-slate-200' : 'bg-slate-50/50 text-slate-400'}`}>
                    <p className={`flex items-baseline justify-center gap-0.5 text-[7px] leading-3 ${day.weekday === '今日' ? 'text-white/70' : 'text-slate-400'}`}><span>{day.weekday}</span><span className={`font-bold ${day.weekday === '今日' ? 'text-white' : 'text-slate-700'}`}>{day.dateLabel}</span></p>
                    <div className="mt-px flex min-h-2 items-center justify-center gap-px overflow-hidden" aria-label={tooltip || '无账期提醒'}>
                      {Array.from({ length: day.billingCount }, (_, index) => <span key={`billing-${index}`} className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: '#FACC15' }} />)}
                      {Array.from({ length: day.dueCount }, (_, index) => <span key={`due-${index}`} className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: '#0066FF' }} />)}
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
            <div className="mt-1 grid grid-cols-2 divide-x divide-slate-100 border-t border-slate-100 pt-1 text-[9px]">
              <div className="min-w-0 pr-2"><p className="text-slate-400">本期已出账单</p>{billingStatementEntriesQuery.isFetching ? <p className="mt-0.5 flex items-center gap-1 text-slate-400"><Loader2 className="h-2.5 w-2.5 animate-spin" />读取中</p> : latestBillingRegistrationSummary.issuedCount === 0 ? <p className="mt-0.5 text-slate-400">暂无账单日卡</p> : <p className="mt-0.5 whitespace-nowrap font-medium"><span className="text-emerald-600">已登记 {latestBillingRegistrationSummary.registeredCount}</span><span className="text-slate-300"> · </span><span className="text-rose-500">待 {latestBillingRegistrationSummary.pendingCount}</span></p>}</div>
              <div className="min-w-0 pl-2 text-right"><p className="text-slate-400">本期还款完成情况</p>{billingStatementEntriesQuery.isFetching ? <p className="mt-0.5 text-slate-400">读取中</p> : latestBillingRegistrationSummary.registeredCount === 0 ? <p className="mt-0.5 text-slate-400">暂无已登记账单</p> : <p className="mt-0.5 whitespace-nowrap font-medium"><span className="text-emerald-600">还清 {latestBillingRegistrationSummary.paidOffCount}</span><span className="text-slate-300"> · </span><span className="text-amber-600">部分 {latestBillingRegistrationSummary.partiallyPaidCount}</span><span className="text-slate-300"> · </span><span className="text-rose-500">未还 {latestBillingRegistrationSummary.unpaidCount}</span></p>}</div>
            </div>
          </section>
        </div>
            )}
      {showUsageSheet && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="flex max-h-[86vh] w-full max-w-[480px] flex-col rounded-t-2xl bg-white px-5 pb-6 pt-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-900">已用额度用途</p>
                <p className="mt-0.5 text-xs text-slate-400">逐条记录已用金额及其用途</p>
              </div>
              <button type="button" onClick={() => { setShowUsageSheet(false); clearUsageDraft(); }} className="rounded-full p-1 text-slate-400 active:bg-slate-100 active:text-slate-700" aria-label="关闭已用额度用途明细"><X className="h-5 w-5" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
              <section className="rounded-2xl border border-slate-100 bg-slate-50 p-3.5">
                <div className="flex items-baseline justify-between gap-3">
                  <div><p className="text-[11px] text-slate-400">当前已用额度</p><p className="mt-1 text-xl font-bold text-rose-500">{formatAmount(summary.usedLimit)}</p></div>
                  <div className="text-right"><p className="text-[11px] text-slate-400">已列明</p><p className="mt-1 text-base font-bold text-[#1A2B4A]">{formatAmount(listedUsageAmount)} <span className="text-xs font-medium text-slate-400">{Math.round(listedUsagePercent)}%</span></p></div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-[#1A2B4A] transition-[width] duration-500" style={{ width: `${listedUsageWidth}%` }} /></div>
                <p className={`mt-2 text-xs font-medium ${overListedUsageAmount > 0 ? 'text-rose-500' : 'text-amber-600'}`}>{overListedUsageAmount > 0 ? `已列明金额超出当前已用 ${formatAmount(overListedUsageAmount)}` : `尚未列明 ${formatAmount(unlistedUsageAmount)}`}</p>
              </section>
              <section className="mt-4 rounded-2xl border border-slate-100 p-3.5">
                <div className="mb-3 flex items-center justify-between"><p className="text-sm font-semibold text-slate-800">{editingUsageRecordId ? '编辑用途记录' : '新增用途记录'}</p>{editingUsageRecordId && <button type="button" onClick={clearUsageDraft} className="text-xs font-medium text-slate-400 active:text-slate-700">取消编辑</button>}</div>
                <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-2">
                  <input type="number" min="0" step="0.01" inputMode="decimal" value={usageDraft.amount} onChange={(event) => setUsageDraft((previous) => ({ ...previous, amount: event.target.value }))} placeholder="金额" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-right text-sm font-semibold text-slate-900 outline-none focus:border-[#1A2B4A] focus:bg-white" />
                  <input type="text" maxLength={200} value={usageDraft.description} onChange={(event) => setUsageDraft((previous) => ({ ...previous, description: event.target.value }))} placeholder="填写用途，例如：日常采购" className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-[#1A2B4A] focus:bg-white" />
                </div>
                <button type="button" disabled={isSavingUsageRecord || !usageDraft.amount.trim() || !usageDraft.description.trim()} onClick={() => void saveUsageRecord()} className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#1A2B4A] py-2.5 text-sm font-semibold text-white active:opacity-80 disabled:opacity-40"><Check className="h-4 w-4" />{isSavingUsageRecord ? '保存中' : editingUsageRecordId ? '更新记录' : '保存记录'}</button>
              </section>
              <section className="mt-4 pb-1">
                <div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold text-slate-800">已记录明细</p><span className="text-xs text-slate-400">{usageRecords.length} 条</span></div>
                {isFetchingUsageRecords ? (
                  <div className="flex items-center justify-center py-8 text-xs text-slate-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在加载记录...</div>
                ) : usageRecords.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 py-7 text-center text-xs text-slate-400">尚未记录用途；可从上方开始逐条列明。</div>
                ) : (
                  <div className="space-y-2">{usageRecords.map((record) => <div key={record.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2.5 shadow-[0_3px_10px_rgba(26,43,74,0.03)]"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-800">{record.description}</p><p className="mt-0.5 text-xs text-slate-400">{Number(record.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p></div><button type="button" onClick={() => startEditingUsageRecord(record)} className="rounded-lg p-2 text-slate-400 active:bg-slate-100 active:text-[#1A2B4A]" aria-label={`编辑${record.description}`}><Pencil className="h-4 w-4" /></button><button type="button" disabled={deleteUsageRecordMutation.isPending} onClick={() => void removeUsageRecord(record)} className="rounded-lg p-2 text-slate-400 active:bg-rose-50 active:text-rose-500 disabled:opacity-40" aria-label={`删除${record.description}`}><Trash2 className="h-4 w-4" /></button></div>)}</div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default function CreditCardManagement() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const isAdmin = !!user && (user as any).role === "super_admin";

  const [viewMode, setViewMode] = useState<'self' | 'admin'>('self');
  // targetUser 仅用于管理员通过右上角“+”为他人新增；adminUserFilter 仅用于管理员列表筛选。
  const [targetUser, setTargetUser] = useState<{ id: number; name: string } | null>(null);
  const [adminUserFilter, setAdminUserFilter] = useState<AdminLoanUserFilter | null>(readRememberedAdminLoanUserFilter);
  const hasRestoredAdminUserFilterView = useRef(false);
  const [userSearchText, setUserSearchText] = useState('');
  const [userPickerMode, setUserPickerMode] = useState<'add' | 'filter' | null>(null);
  const [showUserPicker, setShowUserPicker] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [showAddTypePicker, setShowAddTypePicker] = useState(false);
  const [showLoanHeaderMenu, setShowLoanHeaderMenu] = useState(false);
  const [showLoanControls, setShowLoanControls] = useState(false);
  // 空数组代表默认“全部”；筛选面板中显示为四类均已勾选。
  const [loanTypeFilters, setLoanTypeFilters] = useState<LoanCategory[]>(readRememberedLoanTypeFilters);
  const [loanDueFilter, setLoanDueFilter] = useState<'all' | 'dueSoon' | 'overdue' | 'unset'>('all');
  const [loanSort, setLoanSort] = useState<'default' | 'dueDate' | 'rate' | 'amount'>('default');
  const [policyAddRequestId, setPolicyAddRequestId] = useState(0);
  const [huabeiAddRequestId, setHuabeiAddRequestId] = useState(0);
  const [housingFundAddRequestId, setHousingFundAddRequestId] = useState(0);
  const isAllLoanTypes = loanTypeFilters.length === 0 || loanTypeFilters.length === LOAN_CATEGORY_OPTIONS.length;
  const isLoanTypeVisible = (loanType: LoanCategory) => isAllLoanTypes || loanTypeFilters.includes(loanType);
  const isOnlyLoanTypeVisible = (loanType: LoanCategory) => loanTypeFilters.length === 1 && loanTypeFilters[0] === loanType;
  const updateLoanTypeFilter = (loanType: LoanCategory, checked: boolean) => {
    const currentTypes = isAllLoanTypes ? LOAN_CATEGORY_OPTIONS.map(option => option.value) : loanTypeFilters;
    const nextTypes = checked ? Array.from(new Set([...currentTypes, loanType])) : currentTypes.filter(value => value !== loanType);
    // 全部勾选和没有单独筛选均统一为“全部”状态；不允许出现没有任何类别的空白筛选。
    setLoanTypeFilters(nextTypes.length === 0 || nextTypes.length === LOAN_CATEGORY_OPTIONS.length ? [] : nextTypes);
  };
  useEffect(() => {
    try {
      window.localStorage.setItem(LOAN_TYPE_FILTER_STORAGE_KEY, JSON.stringify(loanTypeFilters));
    } catch {
      // 本地存储不可用时保持默认全部筛选，不影响贷款管理使用。
    }
  }, [loanTypeFilters]);
  const [loanRefreshRequestId, setLoanRefreshRequestId] = useState(0);
  const [isRefreshingLoans, setIsRefreshingLoans] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CardForm>(emptyForm);
  const [hasDraft, setHasDraft] = useState(false);
  const draftKey = 'credit_card_draft';
  const isFirstMount = useRef(true);

  // 检测是否有未完成的草稿
  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.bankName || parsed.cardHolder || parsed.cardLast4) {
          setHasDraft(true);
        }
      }
    } catch {}
  }, []);

  // 表单变化时自动保存草稿（仅新增模式）
  useEffect(() => {
    if (!showForm || editingId) return;
    if (isFirstMount.current) { isFirstMount.current = false; return; }
    const isEmpty = !form.bankName && !form.cardHolder && !form.cardLast4 && !form.creditLimit;
    if (isEmpty) {
      localStorage.removeItem(draftKey);
      setHasDraft(false);
    } else {
      localStorage.setItem(draftKey, JSON.stringify(form));
      setHasDraft(true);
    }
  }, [form, showForm, editingId]);

  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleteConfirmStep, setDeleteConfirmStep] = useState<1 | 2>(1);
  const [bankSearchText, setBankSearchText] = useState('');
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [showNetworkPicker, setShowNetworkPicker] = useState(false);

  const { data: myCards = [], refetch: refetchMy, isFetching: isFetchingMyCards } = trpc.creditCard.list.useQuery(
    undefined, { enabled: viewMode === 'self' }
  );
  const { data: allCards = [], refetch: refetchAll, isFetching: isFetchingAllCards } = trpc.creditCard.adminListAll.useQuery(
    undefined, { enabled: isAdmin && viewMode === 'admin' }
  );
  const { data: userSearchResults = [] } = trpc.sharing.searchUsers.useQuery(
    { query: userSearchText },
    { enabled: isAdmin && showUserPicker && userSearchText.trim().length > 0 }
  );

  const openUserPicker = (mode: 'add' | 'filter') => {
    setUserPickerMode(mode);
    setUserSearchText('');
    setShowUserPicker(true);
  };

  const closeUserPicker = () => {
    setShowUserPicker(false);
    setUserPickerMode(null);
    setUserSearchText('');
  };

  const selectPickerUser = (selected: { id: number; name: string }) => {
    if (userPickerMode === 'add') {
      setTargetUser(selected);
      // 通用贷款子表单需处于管理员模式，才能调用管理员新增接口。
      setViewMode('admin');
    }
    if (userPickerMode === 'filter') setAdminUserFilter(selected);
    closeUserPicker();
  };

  const refetch = () => { refetchMy(); refetchAll(); };

  useEffect(() => {
    if (!isAdmin || hasRestoredAdminUserFilterView.current) return;
    hasRestoredAdminUserFilterView.current = true;
    if (adminUserFilter) setViewMode('admin');
  }, [isAdmin, adminUserFilter]);

  useEffect(() => {
    if (!isAdmin) return;
    try {
      if (adminUserFilter) {
        window.localStorage.setItem(ADMIN_LOAN_USER_FILTER_STORAGE_KEY, JSON.stringify(adminUserFilter));
      } else {
        window.localStorage.removeItem(ADMIN_LOAN_USER_FILTER_STORAGE_KEY);
      }
    } catch {
      // 本地存储不可用时不阻断管理员筛选功能。
    }
  }, [isAdmin, adminUserFilter]);

  useEffect(() => {
    if (viewMode === 'admin' && isAdmin) {
      // 顶部多人图标切换后主动刷新所有人信用卡、保单贷款和花呗真实数据。
      void refetchAll();
      setLoanRefreshRequestId((value) => value + 1);
    }
  }, [viewMode, isAdmin, refetchAll]);

  const handleForceRefresh = () => {
    if (isRefreshingLoans) return;
    // 使用整页重载重新初始化当前账户、贷款列表、管理员筛选和子组件查询，不显示额外提示框。
    setIsRefreshingLoans(true);
    window.setTimeout(() => window.location.reload(), 80);
  };

  const createMutation = trpc.creditCard.create.useMutation({
    onSuccess: () => {
      toast.success("信用卡已添加");
      refetch();
      setShowForm(false);
      setForm(emptyForm);
      localStorage.removeItem(draftKey);
      setHasDraft(false);
    },
    onError: (e) => toast.error("添加失败: " + (e.message || '')),
  });
  const updateMutation = trpc.creditCard.update.useMutation({
    onSuccess: () => { toast.success("已更新"); refetch(); setShowForm(false); setEditingId(null); setForm(emptyForm); },
    onError: () => toast.error("更新失败"),
  });
  const deleteMutation = trpc.creditCard.delete.useMutation({
    onSuccess: () => { toast.success("已删除"); refetch(); setDeleteConfirmId(null); },
    onError: () => toast.error("删除失败"),
  });
  const adminCreateMutation = trpc.creditCard.adminCreate.useMutation({
    onSuccess: () => { toast.success("已为该用户添加信用卡"); refetch(); setShowForm(false); setForm(emptyForm); },
    onError: () => toast.error("添加失败"),
  });
  const adminDeleteMutation = trpc.creditCard.adminDelete.useMutation({
    onSuccess: () => { toast.success("已删除"); refetch(); setDeleteConfirmId(null); },
    onError: () => toast.error("删除失败"),
  });

  const handleEdit = (card: any) => {
    setEditingId(card.id);
    const hasTemp = !!(card.temp_limit && card.temp_limit_end) && isTempLimitActive(card.temp_limit_start, card.temp_limit_end);
    setForm({
      bankName: card.bank_name || "", cardHolder: card.card_holder || "",
      cardLast4: card.card_last4 || "", creditLimit: card.credit_limit ? String(card.credit_limit) : "",
      billingDay: card.billing_day ? String(card.billing_day) : "",
      dueDay: card.due_day ? String(card.due_day) : "",
      currencies: card.currency ? card.currency.split(',') : ['CNY'],
      isMultiCurrency: card.currency ? card.currency.includes(',') : false,
      cardNetworks: card.card_network ? card.card_network.split(',') : [],
      expiryMonth: card.expiry_month || "", note: card.note || "",
      hasTempLimit: hasTemp,
      tempLimit: card.temp_limit ? String(card.temp_limit) : "",
      tempLimitStart: "",
      tempLimitEnd: card.temp_limit_end ? String(card.temp_limit_end).slice(0, 10) : "",
    });
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!form.bankName.trim()) { toast.error("请选择银行"); return; }
    const hasCompleteTempLimit = form.hasTempLimit && Number(form.tempLimit) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(form.tempLimitEnd);
    if (form.hasTempLimit && !hasCompleteTempLimit) {
      toast.error("请完整填写临时额度金额和到期日");
      return;
    }
    // 新增信用卡不传未启用的临时额度字段；编辑时可清空有效临时额度。
    // 已到期的临时额度则保留为历史快照，用于展示当时形成的真实已用金额。
    const editingExpiredTemp = editingId && form.tempLimit && form.tempLimitEnd && !isTempLimitActive(undefined, form.tempLimitEnd);
    const clearedTempLimit = editingId && !editingExpiredTemp ? null : undefined;
    const payload = {
      bankName: form.bankName,
      cardHolder: form.cardHolder || undefined,
      cardNetwork: form.cardNetworks.length > 0 ? form.cardNetworks.join(',') : undefined,
      expiryMonth: form.expiryMonth || undefined,
      cardLast4: form.cardLast4 || undefined,
      creditLimit: form.creditLimit ? parseFloat(form.creditLimit) : undefined,
      billingDay: form.billingDay ? parseInt(form.billingDay) : undefined,
      dueDay: form.dueDay ? parseInt(form.dueDay) : undefined,
      currency: form.currencies.join(','),
      note: form.note || undefined,
      // 临时额度启用时开始日固定为当天；关闭时新增不传字段，编辑则显式清空数据库值。
      tempLimit: hasCompleteTempLimit ? parseFloat(form.tempLimit) : clearedTempLimit,
      tempLimitStart: hasCompleteTempLimit ? new Date().toISOString().slice(0, 10) : clearedTempLimit,
      tempLimitEnd: hasCompleteTempLimit ? form.tempLimitEnd : clearedTempLimit,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, ...payload });
    } else if (isAdmin && targetUser) {
      adminCreateMutation.mutate({ targetUserId: targetUser.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleDelete = (id: number) => {
    if (viewMode === 'admin' && isAdmin) adminDeleteMutation.mutate({ id });
    else deleteMutation.mutate({ id });
  };

  // 最优刷卡建议（表单实时预览）
  const bestSwipe = useMemo(() => {
    const b = parseInt(form.billingDay);
    const d = parseInt(form.dueDay);
    if (!b || !d || b < 1 || b > 31 || d < 1 || d > 31) return null;
    return calcBestSwipeDay(b, d);
  }, [form.billingDay, form.dueDay]);

  // 管理员视角：按用户分组
  const sortedMyCards = useMemo(() => [...(myCards as any[])].sort((a, b) => {
    // 默认与“按到期日”均把下一次还款日最近的信用卡排在前面；未设还款日的排在最后。
    if (loanSort === 'default' || loanSort === 'dueDate') {
      const aDays = a.due_day ? daysUntil(Number(a.due_day)) : Number.MAX_SAFE_INTEGER;
      const bDays = b.due_day ? daysUntil(Number(b.due_day)) : Number.MAX_SAFE_INTEGER;
      return aDays === bDays ? Number(b.id || 0) - Number(a.id || 0) : aDays - bDays;
    }
    return Number(b.id || 0) - Number(a.id || 0);
  }), [myCards, loanSort]);

  const cardMatchesDueFilter = (card: any) => {
    if (loanDueFilter === 'all') return true;
    if (!card.due_day) return loanDueFilter === 'unset';
    const dueDays = daysUntil(Number(card.due_day));
    if (loanDueFilter === 'dueSoon') return dueDays <= 7;
    // 信用卡的最后还款日为循环日期，已自动滚动至下一期，不产生“已逾期”状态。
    return false;
  };

  const groupedCards = useMemo(() => {
    if (viewMode !== 'admin') return {};
    const groups: Record<number, { userName: string; cards: any[] }> = {};
    const filteredCards = (allCards as any[]).filter((card) =>
      (!adminUserFilter || Number(card.user_id) === adminUserFilter.id) && cardMatchesDueFilter(card)
    );
    for (const card of filteredCards) {
      if (!groups[card.user_id]) {
        groups[card.user_id] = {
          userName: card.user_name || card.user_username || `用户${card.user_id}`,
          cards: [],
        };
      }
      groups[card.user_id].cards.push(card);
    }
    Object.values(groups).forEach((group) => {
      group.cards.sort((a, b) => {
        if (loanSort === 'default' || loanSort === 'dueDate') {
          const aDays = a.due_day ? daysUntil(Number(a.due_day)) : Number.MAX_SAFE_INTEGER;
          const bDays = b.due_day ? daysUntil(Number(b.due_day)) : Number.MAX_SAFE_INTEGER;
          return aDays === bDays ? Number(b.id || 0) - Number(a.id || 0) : aDays - bDays;
        }
        if (loanSort === 'amount') return Number(b.credit_limit || 0) - Number(a.credit_limit || 0);
        return Number(b.id || 0) - Number(a.id || 0);
      });
    });
    return groups;
  }, [allCards, viewMode, adminUserFilter, loanDueFilter, loanSort]);

  const CardItem = ({ card }: { card: any }) => {
    const brand = getBankBrand(card.bank_name);
    const nextBilling = card.billing_day ? getNextMonthlyDate(Number(card.billing_day)) : null;
    const nextDue = card.due_day ? getNextMonthlyDate(Number(card.due_day)) : null;
    const swipe = card.billing_day && card.due_day ? calcBestSwipeDay(card.billing_day, card.due_day) : null;
    const capacity = getCreditCardCapacity(card);
    const { baseLimit: regularLimit, tempLimit: tempLimitValue, tempActive, tempExpired, totalLimit: activeLimit, availableLimit: currentAvailableLimit, usedLimit: currentUsedLimit, overBaseLimit } = capacity;
    const tempEndLabel = card.temp_limit_end ? formatDateLabel(card.temp_limit_end) : '';
    const currencyLabel = String(card.currency || 'CNY').split(',').map((currency: string) => currency.trim() === 'CNY' ? '元' : currency.trim()).join(' / ');
    const formatCardAmount = (value: number) => Math.round(value).toLocaleString();
    const [showFullCard, setShowFullCard] = useState(false);
    const [copiedCardDetails, setCopiedCardDetails] = useState<string | null>(null);
    const [showMenu, setShowMenu] = useState(false);
    const [showAvailableInput, setShowAvailableInput] = useState(false);
    const [availableInputVal, setAvailableInputVal] = useState('');
    const [serviceContact, setServiceContact] = useState<LoanServiceContact | null>(null);
    const [showBillingStatementSheet, setShowBillingStatementSheet] = useState(false);
    const [billingStatementDrafts, setBillingStatementDrafts] = useState<Record<string, string>>({});
    const [locallySavedBillingDates, setLocallySavedBillingDates] = useState<Record<string, true>>({});
    const [editingBillingStatementDate, setEditingBillingStatementDate] = useState<string | null>(null);
    const [showBillingPaymentSheet, setShowBillingPaymentSheet] = useState(false);
    const [paidAmountInput, setPaidAmountInput] = useState('');
    // 卡片本身也需要读取真实账期记录，用于在“账单日”旁展示已录入/待录入状态。
    const billingStatementsQuery = trpc.creditCard.billingStatements.useQuery(
      { creditCardId: Number(card.id) },
      { enabled: Number(card.id) > 0 }
    );
    // 弹窗只保留当前最近已到达账期；此前历史账期与未来账期均不显示。
    const billingPeriods = useMemo(
      () => card.billing_day ? [getLatestBillingDateValue(Number(card.billing_day))] : [],
      [card.billing_day]
    );
    const billingStatementByDate = useMemo(() => new Map(
      (billingStatementsQuery.data || []).map((statement: any) => [toBillingDateValue(statement.billing_date), statement])
    ), [billingStatementsQuery.data]);
    // 圆点仅对应本月账期；账单日当天零点前不显示任何状态。
    const currentMonthBilling = card.billing_day ? getCurrentMonthBillingPeriod(Number(card.billing_day)) : null;
    const shouldShowBillingStatus = !!currentMonthBilling?.hasReached;
    const hasSavedCurrentMonthBilling = shouldShowBillingStatus && !!currentMonthBilling && billingStatementByDate.has(currentMonthBilling.billingDate);
    const latestReachedBillingDate = billingPeriods[0] || '';
    const nextBillingInfo = card.billing_day ? getNextBillingDateInfo(Number(card.billing_day)) : null;
    const latestReachedStatement = latestReachedBillingDate ? billingStatementByDate.get(latestReachedBillingDate) : null;
    const latestStatementAmount = Number(latestReachedStatement?.statement_amount || 0);
    const latestPaidAmount = Number(latestReachedStatement?.paid_amount || 0);
    const latestRemainingAmount = Math.max(0, latestStatementAmount - latestPaidAmount);
    // 最后还款日状态仅在本期账单已真实录入后显示：未还（红）、部分已还（橙）、已还清（绿）。
    const latestBillingPaymentStatus = !latestReachedStatement ? null : (
      latestRemainingAmount <= 0
        ? { className: 'bg-emerald-500', label: '本期已还清' }
        : latestPaidAmount > 0
          ? { className: 'bg-amber-500', label: '本期部分已还' }
          : { className: 'bg-rose-500', label: '本期未还' }
    );
    const latestDueDate = latestReachedBillingDate && card.due_day
      ? getDueDateForBillingPeriod(latestReachedBillingDate, Number(card.due_day))
      : '';
    const saveBillingStatementMutation = trpc.creditCard.upsertBillingStatement.useMutation({
      onSuccess: (_data, variables) => {
        setLocallySavedBillingDates((previous) => ({ ...previous, [variables.billingDate]: true }));
        setEditingBillingStatementDate(null);
        void billingStatementsQuery.refetch();
        void utils.creditCard.billingStatementEntries.invalidate();
        toast.success(Number(variables.statementAmount) === 0 ? '本期无消费账单已保存' : '本期还款账单已保存');
      },
      onError: (error) => toast.error(error.message || '账单保存失败'),
    });

    const saveBillingPaymentMutation = trpc.creditCard.upsertBillingPayment.useMutation({
      onSuccess: () => {
        void billingStatementsQuery.refetch();
        void utils.creditCard.billingStatementEntries.invalidate();
        setShowBillingPaymentSheet(false);
        toast.success('本期已还金额已保存');
      },
      onError: (error) => toast.error(error.message || '已还金额保存失败'),
    });

    useEffect(() => {
      if (!showBillingStatementSheet) return;
      setBillingStatementDrafts((previous) => {
        const next = { ...previous };
        billingPeriods.forEach((billingDate) => {
          const saved = billingStatementByDate.get(billingDate);
          if (saved && (next[billingDate] === undefined || next[billingDate] === '')) {
            next[billingDate] = String(Number(saved.statement_amount));
          }
          if (!saved && next[billingDate] === undefined) next[billingDate] = '';
        });
        return next;
      });
    }, [showBillingStatementSheet, billingPeriods, billingStatementByDate]);

    const openBillingStatementSheet = () => {
      if (!card.billing_day) {
        toast.error('请先在信用卡编辑页设置账单日');
        return;
      }
      setBillingStatementDrafts({});
      setLocallySavedBillingDates({});
      setEditingBillingStatementDate(null);
      setShowBillingStatementSheet(true);
    };

    const saveBillingStatement = async (billingDate: string) => {
      const rawAmount = billingStatementDrafts[billingDate] ?? '';
      const statementAmount = Number(rawAmount);
      if (!rawAmount.trim() || Number.isNaN(statementAmount) || statementAmount < 0) {
        toast.error('请输入不小于 0 的本期还款账单数');
        return;
      }
      await saveBillingStatementMutation.mutateAsync({
        creditCardId: Number(card.id),
        billingDate,
        statementAmount,
      });
    };

    const openBillingPaymentSheet = () => {
      if (!card.billing_day || !card.due_day) {
        toast.error('请先在信用卡编辑页设置账单日和最后还款日');
        return;
      }
      if (!latestReachedBillingDate || !latestReachedStatement) {
        toast.error('请先在账单日录入本期账单金额');
        return;
      }
      // 每次录入均从空白开始，账期汇总区保留真实已还金额供对照，避免误以为未再次保存。
      setPaidAmountInput('');
      setShowBillingPaymentSheet(true);
    };

    const saveBillingPayment = async () => {
      const paidAmount = Number(paidAmountInput);
      if (!paidAmountInput.trim() || Number.isNaN(paidAmount) || paidAmount < 0) {
        toast.error('请输入不小于 0 的本期已还金额');
        return;
      }
      await saveBillingPaymentMutation.mutateAsync({
        creditCardId: Number(card.id),
        billingDate: latestReachedBillingDate,
        paidAmount,
      });
    };

    const openCopyCardDetailsPreview = () => {
      const digits = String(card.card_last4 || '').replace(/\D/g, '');
      if (!digits) {
        toast.error('暂无可复制的完整卡号');
        return;
      }
      setCopiedCardDetails([
        `银行：${normalizeDisplayBankName(card.bank_name)}`,
        `姓名：${card.card_holder || card.card_name || '未填写'}`,
        `卡号：${digits.replace(/(\d{4})(?=\d)/g, '$1 ')}`,
      ].join('\n'));
    };

    const confirmCopyCardDetails = async () => {
      if (!copiedCardDetails) return;
      try {
        if (navigator.clipboard?.writeText && window.isSecureContext) {
          await navigator.clipboard.writeText(copiedCardDetails);
        } else {
          const textArea = document.createElement('textarea');
          textArea.value = copiedCardDetails;
          textArea.setAttribute('readonly', '');
          textArea.style.position = 'fixed';
          textArea.style.opacity = '0';
          document.body.appendChild(textArea);
          textArea.select();
          const copied = document.execCommand('copy');
          document.body.removeChild(textArea);
          if (!copied) throw new Error('copy_failed');
        }
        setCopiedCardDetails(null);
      } catch {
        toast.error('复制失败，请检查浏览器剪贴板权限');
      }
    };

    return (
      <div className="overflow-hidden rounded-2xl border shadow-md" style={{ borderColor: brand.line, boxShadow: `0 8px 20px ${brand.border}24` }}>
        {/* 卡片主体：每家银行使用自身主色的渐变，而非统一深色。 */}
        <div className="relative px-3.5 pt-3 pb-9" style={{ background: `linear-gradient(135deg, ${brand.start} 0%, ${brand.end} 100%)` }}>
          <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full border border-white/10 bg-white/5" />
          <div className="pointer-events-none absolute right-7 top-10 h-16 w-16 rounded-full border border-white/10" />

          <div className="relative z-10">
            <div className="flex items-start justify-between">
              <div className="min-w-0 pr-2">
                {/* 银行、类型与卡组织集中在首行；持卡人姓名随卡号展示 */}
                <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/95 p-1 shadow-sm" title={`${normalizeDisplayBankName(card.bank_name)}标识`}>
                    {brand.logo ? <img src={brand.logo} alt="" className="h-full w-full object-contain" /> : <span className="text-xs font-black" style={{ color: brand.start }}>{brand.mark}</span>}
                  </span>
                  <p className="text-sm font-bold text-white">{normalizeDisplayBankName(card.bank_name)}</p>
                  <span className="rounded border border-white/30 bg-white/10 px-1.5 text-[10px] font-semibold leading-4 text-white/85">信用卡</span>
                  {card.card_network && card.card_network.split(',').map((net: string) => (
                    <span key={net} className="rounded border border-white/25 px-1 text-[10px] leading-4 text-white/70">{net.trim()}</span>
                  ))}
                  <button onClick={() => setServiceContact(getCreditCardServiceContact(card.bank_name))} className="flex h-4 w-4 shrink-0 items-center justify-center text-white/80 active:text-white" aria-label="查看官方客服电话"><PhoneCall className="h-3.5 w-3.5" /></button>
                </div>
                <div className="mt-0.5 flex min-w-0 items-center gap-x-2 overflow-hidden whitespace-nowrap">
                  {(card.card_holder || card.card_name) && <span className="max-w-16 shrink-0 truncate text-xs font-semibold text-white/85">{card.card_holder || card.card_name}</span>}
                  {card.card_last4 && (() => {
                    const digits = card.card_last4.replace(/\D/g, '');
                    const first4 = digits.slice(0, 4);
                    const last4 = digits.slice(-4);
                    const middleCount = digits.length - 8;
                    const middleMask = middleCount > 0 ? ' ' + '*'.repeat(middleCount).replace(/(....)/g, '$1 ').trim() + ' ' : ' **** ';
                    const masked = digits.length >= 8
                      ? first4 + middleMask + last4
                      : digits.length > 4
                        ? first4 + ' **** ' + last4
                        : digits;
                    const formatted = digits.replace(/(\d{4})(?=\d)/g, '$1 ');
                    return (
                      <div className="flex min-w-0 flex-1 items-center gap-1">
                        <span className="min-w-0 truncate text-xs tracking-wide font-mono text-white/70">
                          {showFullCard ? formatted : masked}
                        </span>
                        <button
                          onClick={() => setShowFullCard(v => !v)}
                          className="h-5 w-5 shrink-0 flex items-center justify-center opacity-60 active:opacity-100"
                          aria-label={showFullCard ? '隐藏完整卡号' : '显示完整卡号'}
                        >
                          {showFullCard
                            ? <EyeOff className="w-3.5 h-3.5 text-white" />
                            : <Eye className="w-3.5 h-3.5 text-white" />}
                        </button>
                        <button
                          type="button"
                          onClick={openCopyCardDetailsPreview}
                          className="h-5 w-5 shrink-0 flex items-center justify-center rounded opacity-70 active:bg-white/15 active:opacity-100"
                          aria-label="复制银行、姓名和完整卡号"
                        >
                          <Copy className="w-3.5 h-3.5 text-white" />
                        </button>
                      </div>
                    );
                  })()}
                  {card.expiry_month && <span className="shrink-0 text-[11px] text-white/50">{card.expiry_month}</span>}
                </div>
              </div>
              {/* ··· 更多菜单 */}
              <div className="relative">
                <button
                  onClick={() => setShowMenu(v => !v)}
                  className="w-7 h-7 flex items-center justify-center active:opacity-60"
                >
                  <span className="text-white font-bold text-base leading-none tracking-widest">···</span>
                </button>
                {showMenu && (
                  <>
                    {/* 遥控覆盖层 */}
                    <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                    <div className="absolute right-0 top-9 z-50 bg-white rounded-xl shadow-xl overflow-hidden min-w-[100px]">
                      {viewMode === 'self' && (
                        <button
                          onClick={() => { handleEdit(card); setShowMenu(false); }}
                          className="w-full flex items-center space-x-2 px-4 py-3 text-sm text-gray-700 active:bg-gray-50"
                        >
                          <Pencil className="w-4 h-4 text-gray-400" />
                          <span>编辑</span>
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setAvailableInputVal(String(currentAvailableLimit));
                          setShowAvailableInput(true);
                          setShowMenu(false);
                        }}
                        className="w-full flex items-center space-x-2 px-4 py-3 text-sm text-gray-700 active:bg-gray-50"
                      >
                        <CreditCard className="w-4 h-4 text-gray-400" />
                        <span>更新可用额度</span>
                      </button>
                      <button
                        onClick={() => { setDeleteConfirmId(card.id); setDeleteConfirmStep(1); setShowMenu(false); }}
                        className="w-full flex items-center space-x-2 px-4 py-3 text-sm text-red-500 active:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                        <span>删除</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
            {/* 额度信息：第一行基础/临时额度，第二行可用/已用额度。 */}
            {regularLimit > 0 && (() => {
              const usedPct = activeLimit > 0 ? Math.round((currentUsedLimit / activeLimit) * 100) : 0;
              return (
                <div className="mt-2 space-y-1.5 text-xs">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-white/70">额度 <span className="font-semibold text-white">{formatCardAmount(regularLimit)}</span></span>
                    {currencyLabel !== '元' && <span className="text-white/60">{currencyLabel}</span>}
                    {tempLimitValue != null && (
                      <span className={`rounded-full px-2 py-0.5 font-medium ${tempActive ? 'bg-amber-300 text-amber-950' : 'bg-white/15 text-white/70'}`}>
                        {tempActive ? `临时额度 ${formatCardAmount(tempLimitValue)} · 至${tempEndLabel}` : `临时额度已到期 · ${tempEndLabel}`}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-white/75">可用 <span className="font-semibold text-white">{formatCardAmount(currentAvailableLimit)}</span></span>
                    <span className="text-white/75">已用 <span className="font-semibold text-white">{formatCardAmount(currentUsedLimit)}</span> · {usedPct}%</span>
                    <div className="h-1 w-14 overflow-hidden rounded-full bg-white/20">
                      <div className={`h-full rounded-full ${usedPct >= 100 ? 'bg-rose-400' : usedPct >= 90 ? 'bg-red-400' : usedPct >= 70 ? 'bg-amber-300' : 'bg-emerald-300'}`} style={{ width: `${Math.min(100, usedPct)}%` }} />
                    </div>
                    {tempExpired && overBaseLimit > 0 && <span className="rounded bg-rose-400/20 px-1.5 py-0.5 text-[10px] font-medium text-rose-100">超基础额度 {formatCardAmount(overBaseLimit)}</span>}
                  </div>
                </div>
              );
            })()}

          </div>
        </div>

        {/* 可用额度输入弹出 */}
        {showAvailableInput && (
          <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
            <div className="bg-white rounded-t-2xl w-full max-w-[480px] px-5 pt-5 pb-8">
              <div className="flex items-center justify-between mb-4">
                <p className="text-gray-900 font-semibold">更新可用额度</p>
                <button onClick={() => setShowAvailableInput(false)} className="text-gray-400 active:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              {card.credit_limit && (
                <p className="text-gray-400 text-xs mb-3">当前总额度 {activeLimit.toLocaleString()} {currencyLabel}{tempActive && tempLimitValue != null ? '（临时额度有效）' : tempExpired ? '（临时额度已到期，已用金额已保留）' : ''}</p>
              )}
              <input
                type="number"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-lg font-semibold text-gray-900 mb-2 focus:outline-none focus:border-[#1A2B4A]"
                placeholder="输入当前可用额度"
                value={availableInputVal}
                onChange={e => setAvailableInputVal(e.target.value)}
                autoFocus
              />
              {availableInputVal && regularLimit > 0 && (() => {
                const previewUsed = tempExpired && tempLimitValue != null
                  ? Math.max(0, tempLimitValue - Number(availableInputVal))
                  : Math.max(0, activeLimit - Number(availableInputVal));
                return (
                  <p className="text-gray-400 text-xs mb-4">
                    已用额度：<span className="text-gray-700 font-medium">{previewUsed.toLocaleString()}</span>
                    {' · '}
                    <span className="text-gray-700 font-medium">{Math.round((previewUsed / activeLimit) * 100)}%</span>
                    {tempActive && tempLimitValue != null && <span className="text-amber-600">（按临时额度计算）</span>}
                    {tempExpired && <span className="text-rose-500">（临时额度已到期，保留临时额度期间已用金额）</span>}
                  </p>
                );
              })()}
              <button
                onClick={async () => {
                  const val = Number(availableInputVal);
                  if (isNaN(val) || val < 0) return;
                  try {
                    // 保留到期临时额度快照，用于持续展示该期间形成的真实已用金额。
                    await updateMutation.mutateAsync({ id: card.id, availableLimit: val } as any);
                    await refetch();
                    setShowAvailableInput(false);
                    toast.success('可用额度已更新');
                  } catch (e: any) {
                    toast.error('更新失败: ' + (e?.message || ''));
                  }
                }}
                className="w-full py-3 rounded-xl bg-[#1A2B4A] text-white font-semibold text-sm active:opacity-80"
              >
                确认更新
              </button>
            </div>
          </div>
        )}

        {showBillingStatementSheet && (
          <div className="fixed inset-0 z-[60] flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
            <div className="flex w-full max-w-[480px] flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <p className="text-base font-semibold text-slate-900">账单日</p>
                  <p className="mt-0.5 text-xs text-slate-400">本期账单录入与下一期提醒</p>
                </div>
                <button onClick={() => setShowBillingStatementSheet(false)} className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-50 text-slate-400 active:bg-slate-100 active:text-slate-600" aria-label="关闭账期还款录入">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
                <div className="space-y-3">
                  {billingPeriods.map((billingDate) => {
                    const savedStatement = billingStatementByDate.get(billingDate);
                    const draftAmount = billingStatementDrafts[billingDate] ?? '';
                    const hasSavedStatement = !!savedStatement || !!locallySavedBillingDates[billingDate];
                    const isEditingStatement = editingBillingStatementDate === billingDate;
                    const savedAmount = savedStatement ? Number(savedStatement.statement_amount || 0) : Number(draftAmount || 0);
                    return (
                      <section key={billingDate} className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
                        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                          <div>
                            <p className="text-[11px] font-medium text-slate-400">本期账单日</p>
                            <p className="mt-1 text-base font-semibold text-slate-800">{formatBillingPeriodDate(billingDate)}</p>
                          </div>
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${hasSavedStatement ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>{hasSavedStatement ? '已记录' : '待录入'}</span>
                        </div>
                        {hasSavedStatement && !isEditingStatement ? (
                          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-3">
                            <div>
                              <p className="text-[11px] font-medium text-emerald-700/70">本期账单金额</p>
                              <p className="mt-1 text-lg font-bold leading-5 text-emerald-700">{savedAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                              {savedAmount === 0 && <p className="mt-1 text-[11px] font-medium text-emerald-600/80">本期无消费</p>}
                            </div>
                            <button
                              type="button"
                              onClick={() => setEditingBillingStatementDate(billingDate)}
                              className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 active:bg-emerald-100"
                            >
                              编辑
                            </button>
                          </div>
                        ) : (
                          <div className="mt-3 flex items-end gap-2.5">
                            <label className="min-w-0 flex-1">
                              <span className="mb-1.5 block text-[11px] font-medium text-slate-400">本期账单金额</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                inputMode="decimal"
                                value={draftAmount}
                                onChange={(event) => setBillingStatementDrafts((previous) => ({ ...previous, [billingDate]: event.target.value }))}
                                aria-label={`${formatBillingPeriodDate(billingDate)}账单金额`}
                                placeholder="输入金额（无消费可填0）"
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-right text-base font-semibold text-slate-900 outline-none focus:border-[#1A2B4A] focus:bg-white"
                              />
                            </label>
                            <button
                              type="button"
                              disabled={saveBillingStatementMutation.isPending || draftAmount.trim() === ''}
                              onClick={() => void saveBillingStatement(billingDate)}
                              className="shrink-0 rounded-xl bg-[#1A2B4A] px-4 py-2.5 text-sm font-semibold text-white active:opacity-80 disabled:opacity-40"
                            >
                              {saveBillingStatementMutation.isPending ? '保存中' : (hasSavedStatement ? '更新' : '保存')}
                            </button>
                          </div>
                        )}
                      </section>
                    );
                  })}

                  {nextBillingInfo && (
                    <section className="rounded-2xl border border-dashed border-sky-200 bg-sky-50/70 p-3.5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-medium text-sky-600/70">下一期账单日</p>
                          <p className="mt-1 text-base font-semibold text-slate-800">{formatBillingPeriodDate(nextBillingInfo.billingDate)}</p>
                        </div>
                        <span className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-sky-600 shadow-sm">{nextBillingInfo.days}天后</span>
                      </div>
                      <p className="mt-3 border-t border-sky-100 pt-2.5 text-[11px] leading-4 text-slate-400">到达该账单日当天零点后，将自动开放本期账单金额录入。</p>
                    </section>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {showBillingPaymentSheet && latestReachedStatement && (
          <div className="fixed inset-0 z-[60] flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
            <div className="w-full max-w-[480px] rounded-t-2xl bg-white px-5 pb-7 pt-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-base font-semibold text-slate-900">本期还款</p>
                  <p className="mt-0.5 text-xs text-slate-400">账单日 {formatBillingPeriodDate(latestReachedBillingDate)}{latestDueDate ? ` · 最后还款日 ${formatBillingPeriodDate(latestDueDate)}` : ''}</p>
                </div>
                <button onClick={() => setShowBillingPaymentSheet(false)} className="text-gray-400 active:text-gray-600" aria-label="关闭本期还款录入"><X className="h-5 w-5" /></button>
              </div>
              <div className="grid grid-cols-3 divide-x divide-slate-100 rounded-xl border border-slate-100 bg-slate-50 py-3 text-center">
                <div className="px-1"><p className="text-[11px] text-slate-400">账单应还</p><p className="mt-1 text-sm font-bold text-slate-800">{latestStatementAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p></div>
                <div className="px-1"><p className="text-[11px] text-slate-400">已还</p><p className="mt-1 text-sm font-bold text-emerald-600">{latestPaidAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p></div>
                <div className="px-1"><p className="text-[11px] text-slate-400">剩余应还</p><p className="mt-1 text-sm font-bold text-rose-500">{latestRemainingAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p></div>
              </div>
              <label className="mt-5 block text-xs font-medium text-slate-600">目前已还金额</label>
              <input type="number" min="0" max={latestStatementAmount} step="0.01" inputMode="decimal" value={paidAmountInput} onChange={(event) => setPaidAmountInput(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-center text-lg font-semibold text-slate-900 outline-none focus:border-[#1A2B4A]" placeholder="输入本期累计已还金额" autoFocus />
              <p className="mt-2 text-xs text-slate-400">保存后自动计算剩余应还金额；已还金额不得超过本期账单应还金额。</p>
              <button type="button" disabled={saveBillingPaymentMutation.isPending || !paidAmountInput.trim()} onClick={() => void saveBillingPayment()} className="mt-5 w-full rounded-xl bg-[#1A2B4A] py-3 text-sm font-semibold text-white active:opacity-80 disabled:opacity-40">{saveBillingPaymentMutation.isPending ? '保存中' : '保存已还金额'}</button>
            </div>
          </div>
        )}

        {/* 账单信息：使用银行主色对应的浅色账单区，保持数据区高可读性。 */}
        <div className="grid grid-cols-4 divide-x divide-slate-200/70 py-2" style={{ backgroundColor: brand.surface, borderTop: `1px solid ${brand.line}` }}>
          <div className="contents">
            <button
              type="button"
              onClick={openBillingStatementSheet}
              className="grid min-w-0 grid-rows-[16px_20px_16px] px-2 py-1 text-left transition-colors active:bg-black/[0.03]"
              aria-label="打开本期还款账单录入"
            >
              <p className="flex items-center gap-1 text-[11px] leading-4 text-gray-400"><span className="inline-block border-b border-dashed border-[#1A2B4A]/55 pb-px">账单日</span>{shouldShowBillingStatus && <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${hasSavedCurrentMonthBilling ? 'bg-emerald-500' : 'border border-amber-500 bg-transparent'}`} title={hasSavedCurrentMonthBilling ? '本月账单已录入' : '本月账单待录入'} aria-label={hasSavedCurrentMonthBilling ? '本月账单已录入' : '本月账单待录入'} />}</p>
              {nextBilling ? (
                <>
                  <p className="truncate text-sm font-bold leading-5 text-gray-900">{nextBilling.label}</p>
                  <span className={`text-[10px] leading-4 ${
                    nextBilling.days <= 3 ? 'text-red-500' :
                    nextBilling.days <= 7 ? 'text-orange-500' : 'text-gray-400'
                  }`}>{nextBilling.days === 0 ? '今天' : `${nextBilling.days}天后`}</span>
                </>
              ) : <><p className="text-sm leading-5 text-gray-300">未设置</p><span /></>}
            </button>
            <button type="button" onClick={openBillingPaymentSheet} className="grid min-w-0 grid-rows-[16px_20px_16px] px-2 py-1 text-left transition-colors active:bg-black/[0.03]" aria-label="打开本期已还金额录入">
              <p className="flex items-center gap-1 text-[11px] leading-4 text-gray-400"><span className="inline-block border-b border-dashed border-[#1A2B4A]/55 pb-px">最后还款日</span>{latestBillingPaymentStatus && <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${latestBillingPaymentStatus.className}`} title={latestBillingPaymentStatus.label} aria-label={latestBillingPaymentStatus.label} />}</p>
              {nextDue ? (
                <>
                  <p className="truncate text-sm font-bold leading-5 text-gray-900">{nextDue.label}</p>
                  <span className={`text-[10px] leading-4 ${
                    nextDue.days <= 3 ? 'text-red-500' :
                    nextDue.days <= 7 ? 'text-orange-500' : 'text-gray-400'
                  }`}>{nextDue.days === 0 ? '今天' : `${nextDue.days}天后`}</span>
                </>
              ) : <><p className="text-sm leading-5 text-gray-300">未设置</p><span /></>}
            </button>
          </div>
          {/* 四列单行布局不再需要独立分隔线 */}
          <div className="hidden" />
          {/* 最优刷卡建议 */}
          {swipe && (() => {
            const now = new Date();
            const todayNum = now.getDate();
            const todayMonth = now.getMonth(); // 0-indexed
            const todayYear = now.getFullYear();

            // 计算某天刷卡对应的账单日和还款日具体日期
            function getSwipeDates(swipeDay: number, swipeMonth: number, swipeYear: number) {
              const billing = card.billing_day as number;
              const due = card.due_day as number;
              const bestDay = billing >= 28 ? 1 : billing + 1;

              // 判断属于哪个账期
              let inBestPeriod: boolean;
              if (bestDay <= billing) {
                inBestPeriod = swipeDay >= bestDay || swipeDay <= billing;
              } else {
                inBestPeriod = swipeDay >= bestDay && swipeDay <= billing;
              }

              let billingDate: Date;
              let dueDate: Date;

              if (inBestPeriod) {
                // 最优账期：下个账单日和下个还款日
                if (swipeDay <= billing) {
                  // 刷卡日在账单日前（同月）
                  billingDate = new Date(swipeYear, swipeMonth, billing);
                } else {
                  // 刷卡日在账单日后（跨月）
                  billingDate = new Date(swipeYear, swipeMonth + 1, billing);
                }
                // 还款日在账单日之后
                if (due > billing) {
                  dueDate = new Date(billingDate.getFullYear(), billingDate.getMonth(), due);
                } else {
                  dueDate = new Date(billingDate.getFullYear(), billingDate.getMonth() + 1, due);
                }
              } else {
                // 次优账期：本周期还款日
                billingDate = new Date(swipeYear, swipeMonth, billing);
                if (billingDate <= new Date(swipeYear, swipeMonth, swipeDay)) {
                  billingDate = new Date(swipeYear, swipeMonth + 1, billing);
                }
                if (due > billing) {
                  dueDate = new Date(billingDate.getFullYear(), billingDate.getMonth(), due);
                } else {
                  dueDate = new Date(billingDate.getFullYear(), billingDate.getMonth() + 1, due);
                }
              }

              const swipeDateObj = new Date(swipeYear, swipeMonth, swipeDay);
              const freeDays = Math.round((dueDate.getTime() - swipeDateObj.getTime()) / (1000 * 60 * 60 * 24));
              return {
                billingLabel: `${billingDate.getMonth() + 1}月${billingDate.getDate()}日`,
                dueLabel: `${dueDate.getMonth() + 1}月${dueDate.getDate()}日`,
                freeDays: Math.max(1, freeDays),
              };
            }

            const todayDates = getSwipeDates(todayNum, todayMonth, todayYear);

            // 最优刷卡日：下个账单日的后一天
            const billing = card.billing_day as number;
            const bestDay = billing >= 28 ? 1 : billing + 1;
            // 找到下个账单日
            let nextBillingDate = new Date(todayYear, todayMonth, billing);
            if (nextBillingDate <= now) nextBillingDate = new Date(todayYear, todayMonth + 1, billing);
            // 最优刷卡日 = 下个账单日的后一天
            const bestSwipeDate = new Date(nextBillingDate.getFullYear(), nextBillingDate.getMonth(), nextBillingDate.getDate() + 1);
            if (bestSwipeDate.getDate() === 1 && nextBillingDate.getDate() >= 28) {
              bestSwipeDate.setMonth(bestSwipeDate.getMonth());
            }
            const bestDates = getSwipeDates(bestSwipeDate.getDate(), bestSwipeDate.getMonth(), bestSwipeDate.getFullYear());
            const bestLabel = `${bestSwipeDate.getMonth() + 1}月${bestSwipeDate.getDate()}日`;

            const bjNow = new Date(new Date().getTime() + 8 * 60 * 60 * 1000);
            const todayLabel = `${bjNow.getUTCMonth() + 1}月${bjNow.getUTCDate()}日`;

            return (
              <div className="contents">
                <p className="hidden">免息期建议</p>
                <div className="contents">
                  {/* 今日刷卡：标题、日期、免息期三行 */}
                  <div className="grid min-w-0 grid-rows-[16px_20px_16px] px-2 py-1">
                    <p className="text-[11px] leading-4 text-gray-400">今日刷卡</p>
                    <p className="truncate text-sm font-bold leading-5 text-gray-900">{todayLabel}</p>
                    <p className="truncate text-[10px] leading-4 text-gray-400">{todayDates.freeDays}天免息期</p>
                  </div>

                  {/* 最优刷卡日：账单日后一天 */}
                  <div className="grid min-w-0 grid-rows-[16px_20px_16px] px-2 py-1">
                    <p className="text-[11px] leading-4 text-gray-400">最优刷卡日</p>
                    <p className="truncate text-sm font-bold leading-5 text-gray-900">{bestLabel}</p>
                    <p className="truncate text-[10px] leading-4 text-red-500">{bestDates.freeDays}天免息期</p>
                  </div>
                </div>
              </div>
            );
          })()}
          {card.note && <p className="col-span-4 px-2 pt-1 text-xs text-gray-500">{card.note}</p>}
        </div>
        {serviceContact && <LoanServiceContactSheet contact={serviceContact} open={true} onClose={() => setServiceContact(null)} />}
        {copiedCardDetails && (
          <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 px-4 pb-4" role="dialog" aria-modal="true" aria-label="已复制的信用卡信息">
            <div className="w-full max-w-[448px] rounded-2xl bg-white p-4 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-slate-900">已复制卡片信息</p>
                  <p className="mt-1 text-xs text-slate-400">确认内容无误后，再点击下方一键复制</p>
                </div>
                <button type="button" onClick={() => setCopiedCardDetails(null)} className="rounded-full p-1 text-slate-400 active:bg-slate-100" aria-label="关闭复制内容预览"><X className="h-5 w-5" /></button>
              </div>
              <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm font-medium leading-6 text-slate-700">{copiedCardDetails}</pre>
              <button type="button" onClick={() => void confirmCopyCardDetails()} className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#1A2B4A] py-2.5 text-sm font-semibold text-white active:opacity-80"><Copy className="h-4 w-4" />一键复制</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-[#1A2B4A] max-w-[480px] mx-auto">
      {/* 顶部导航 */}
      <div className="bg-[#1A2B4A] text-white p-3 flex items-center justify-between flex-shrink-0">
        <button
          onClick={() => {
            setSmartAccountingLastPage((user as any)?.id, 'loans');
            setLocation('/');
          }}
          aria-label="返回首页"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="relative mx-2 flex min-w-0 flex-1 items-center gap-2">
          <UserAvatar
            username={(user as any)?.username}
            nickname={(user as any)?.nickname || (user as any)?.name}
            avatar={(user as any)?.avatar}
            size="sm"
            className="!w-8 !h-8 !text-xs !border-white/30 shrink-0"
          />
          <div className="min-w-0 max-w-[68px] leading-tight">
            <p className="truncate text-xs font-semibold text-white">{(user as any)?.name || (user as any)?.nickname || (user as any)?.username || '我的账户'}</p>
            <p className="truncate text-[10px] text-white/60">{(user as any)?.nickname || ((user as any)?.username ? `@${(user as any).username}` : '当前账户')}</p>
          </div>
          <span className="h-7 w-px shrink-0 bg-white/25" />
          <button onClick={() => setShowLoanHeaderMenu(v => !v)} className="flex min-w-0 items-center gap-0.5 whitespace-nowrap text-left text-sm font-semibold" aria-label="切换管理页面">
            <span className="truncate">贷款管理</span>
            <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${showLoanHeaderMenu ? 'rotate-180' : ''}`} />
          </button>
          {showLoanHeaderMenu && (
            <div className="absolute top-full right-0 z-50 mt-2 w-36 overflow-hidden rounded-xl bg-white text-gray-700 shadow-xl">
              <button onClick={() => setShowLoanHeaderMenu(false)} className="w-full bg-blue-50 px-4 py-3 text-left text-sm font-semibold text-[#1A2B4A]">贷款管理</button>
              <button
                onClick={() => {
                  setSmartAccountingLastPage((user as any)?.id, 'reimbursement');
                  setShowLoanHeaderMenu(false);
                  setLocation('/ledger/76/add?from=home');
                }}
                className="w-full border-t border-gray-100 px-4 py-3 text-left text-sm"
              >
                报销申请单
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {isAdmin && (
            <div className="flex items-center gap-0.5 rounded-full bg-white/10 p-0.5">
              <button
                onClick={() => setViewMode('self')}
                className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors ${viewMode === 'self' ? 'bg-white/30 text-white shadow-sm' : 'text-white/60 active:bg-white/15 active:text-white'}`}
                aria-label="查看我的贷款"
                title="我的贷款"
              >
                <User className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('admin')}
                className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors ${viewMode === 'admin' ? 'bg-white/30 text-white shadow-sm' : 'text-white/60 active:bg-white/15 active:text-white'}`}
                aria-label="查看所有人贷款"
                title="所有人贷款"
              >
                <Users className="w-4 h-4" />
              </button>
            </div>
          )}
          <button
            onClick={handleForceRefresh}
            disabled={isRefreshingLoans}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-white/20 active:bg-white/30 disabled:opacity-60"
            aria-label="强制刷新贷款数据"
            title="刷新贷款数据">
            <RefreshCw className={`w-4 h-4 ${isRefreshingLoans ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => { setTargetUser(null); setShowAddTypePicker(true); }}
            className="relative w-7 h-7 flex items-center justify-center rounded-full bg-white/20 active:bg-white/30"
            aria-label="新增贷款工具">
            <Plus className="w-4 h-4" />
            {hasDraft && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-400 rounded-full" />
            )}
          </button>
        </div>
      </div>

      {/* 右上角 + ：选择新增的金融工具类型 */}
      {showAddTypePicker && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white w-full max-w-[480px] mx-auto rounded-t-2xl px-4 pt-4 pb-8">
            <div className="flex items-center justify-between mb-4">
              <div><p className="text-gray-900 font-semibold">新增贷款工具</p><p className="text-xs text-gray-400 mt-0.5">选择信用卡、保单贷款、花呗或公积金贷款</p></div>
              <button onClick={() => setShowAddTypePicker(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            {isAdmin && (
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                <p className="text-xs font-semibold text-amber-800">新增对象</p>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={() => openUserPicker('add')}
                    className="flex min-w-0 flex-1 items-center justify-between rounded-lg border border-amber-200 bg-white px-3 py-2 text-left text-sm active:bg-amber-50"
                  >
                    <span className={targetUser ? 'truncate text-gray-800' : 'text-gray-500'}>{targetUser ? `为 ${targetUser.name} 新增` : '本人（点击可为其他用户新增）'}</span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-amber-500" />
                  </button>
                  {targetUser && <button onClick={() => setTargetUser(null)} className="shrink-0 px-2 py-2 text-xs text-amber-700">本人</button>}
                </div>
                {showUserPicker && userPickerMode === 'add' && (
                  <div className="mt-2 overflow-hidden rounded-lg border border-amber-200 bg-white shadow-sm">
                    <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-2 py-2">
                      <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="输入用户名或昵称搜索..." value={userSearchText} onChange={(e) => setUserSearchText(e.target.value)} autoFocus />
                      <button onClick={closeUserPicker}><X className="h-4 w-4 text-gray-400" /></button>
                    </div>
                    {userSearchText.trim().length === 0 && <p className="px-3 py-3 text-xs text-gray-400">输入关键词后选择新增对象</p>}
                    {userSearchText.trim().length > 0 && (userSearchResults as any[]).length === 0 && <p className="px-3 py-3 text-xs text-gray-400">未找到用户</p>}
                    {(userSearchResults as any[]).map((u: any) => <button key={u.id} onClick={() => selectPickerUser({ id: u.id, name: u.name || u.username })} className="flex w-full items-center gap-2 px-3 py-2.5 text-left active:bg-amber-50"><User className="h-4 w-4 text-gray-400" /><span className="truncate text-sm text-gray-800">{u.name || u.username}</span>{u.name && u.username && <span className="truncate text-xs text-gray-400">@{u.username}</span>}</button>)}
                  </div>
                )}
              </div>
            )}
            <div className="space-y-3">
              <button
                onClick={() => {
                  setShowAddTypePicker(false);
                  setLoanTypeFilters(['creditCard']);
                  setEditingId(null);
                  isFirstMount.current = true;
                  try {
                    const saved = localStorage.getItem(draftKey);
                    if (saved) {
                      const parsed = JSON.parse(saved);
                      if (parsed.bankName || parsed.cardHolder || parsed.cardLast4) {
                        setForm({ ...emptyForm, ...parsed });
                        setShowForm(true);
                        toast.info('已恢复上次未完成的草稿');
                        return;
                      }
                    }
                  } catch {}
                  setForm(emptyForm);
                  setShowForm(true);
                }}
                className="w-full flex items-center gap-3 rounded-xl border border-slate-200 p-3.5 text-left active:bg-slate-50">
                <span className="w-10 h-10 rounded-xl bg-[#1A2B4A] flex items-center justify-center"><CreditCard className="w-5 h-5 text-white" /></span>
                <span><span className="block text-sm font-semibold text-gray-800">信用卡</span><span className="block text-xs text-gray-400 mt-0.5">额度、账单日、还款日及免息期建议</span></span>
              </button>
              <button
                onClick={() => { setShowAddTypePicker(false); setLoanTypeFilters(['policyLoan']); setPolicyAddRequestId(v => v + 1); }}
                className="w-full flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/40 p-3.5 text-left active:bg-amber-50">
                <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#17345E] to-[#27507D] flex items-center justify-center"><ShieldCheck className="w-5 h-5 text-amber-300" /></span>
                <span><span className="block text-sm font-semibold text-gray-800">保单贷款</span><span className="block text-xs text-gray-400 mt-0.5">保单、贷款余额、利率、还款方式及到期日</span></span>
              </button>
              <button
                onClick={() => { setShowAddTypePicker(false); setLoanTypeFilters(['huabei']); setHuabeiAddRequestId(v => v + 1); }}
                className="w-full flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50/50 p-3.5 text-left active:bg-sky-50">
                <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1677FF] to-[#2B4E9A] flex items-center justify-center"><CreditCard className="w-5 h-5 text-white" /></span>
                <span><span className="block text-sm font-semibold text-gray-800">花呗</span><span className="block text-xs text-gray-400 mt-0.5">额度、待还余额、费率、还款方式及到期日</span></span>
              </button>
              <button
                onClick={() => { setShowAddTypePicker(false); setLoanTypeFilters(['housingFund']); setHousingFundAddRequestId(v => v + 1); }}
                className="w-full flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 text-left active:bg-emerald-50">
                <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-700 to-teal-700 flex items-center justify-center"><Landmark className="w-5 h-5 text-emerald-50" /></span>
                <span><span className="block text-sm font-semibold text-gray-800">公积金贷款</span><span className="block text-xs text-gray-400 mt-0.5">等额本息或等额本金，按贷款期限还款</span></span>
              </button>
            </div>
          </div>
        </div>
      )}

      <LoanCapacitySummary
        viewMode={viewMode}
        cards={(viewMode === 'admin' ? allCards : myCards) as any[]}
        registrationCards={(isLoanTypeVisible('creditCard')
          ? (viewMode === 'admin'
            ? Object.values(groupedCards).flatMap((group: any) => group.cards)
            : sortedMyCards)
          : []) as any[]}
        adminUserFilter={adminUserFilter}
        isCardsLoading={viewMode === 'admin' ? isFetchingAllCards : isFetchingMyCards}
        showLoanControls={showLoanControls}
        onToggleLoanControls={() => setShowLoanControls((open) => !open)}
        activeLoanTypeFilterCount={loanTypeFilters.length}
        hasAdminDueFilter={viewMode === 'admin' && loanDueFilter !== 'all'}
      />

      {/* 管理员的新增对象选择已迁移至右上角“+”的新增流程。 */}

      {/* 筛选入口收进额度汇总卡片；仅在展开时保留原有下拉筛选面板。 */}
      {showLoanControls && (
        <div className="border-b border-gray-100 bg-white px-4 pb-2.5">
          <div className="mt-2.5 space-y-2.5 rounded-md border border-slate-200 bg-slate-50/70 p-2.5">
            <div className="flex items-start gap-2 text-xs">
              <span className="shrink-0 pt-1 text-gray-400">类型</span>
              <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5">
                {LOAN_CATEGORY_OPTIONS.map(({ value, label }) => (
                  <label key={value} className="flex min-w-0 items-center gap-1.5 rounded-md bg-white px-2 py-1.5 text-slate-600 shadow-sm">
                    <input type="checkbox" checked={isLoanTypeVisible(value)} onChange={(event) => updateLoanTypeFilter(value, event.target.checked)} className="h-3.5 w-3.5 shrink-0 accent-[#1A2B4A]" />
                    <span className="truncate">{label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="shrink-0 text-gray-400">排序</span>
              <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                {([
                  ['default', '默认'],
                  ['dueDate', '到期日'],
                  ['rate', '利率'],
                  ['amount', '金额'],
                ] as const).map(([value, label]) => (
                  <button key={value} onClick={() => setLoanSort(value)} className={`rounded-md px-2.5 py-1 ${loanSort === value ? 'bg-white font-semibold text-[#1A2B4A] shadow-sm' : 'text-gray-500'}`}>{label}</button>
                ))}
              </div>
            </div>
            {isAdmin && viewMode === 'admin' && (
              <>
                <div className="flex items-center gap-2 text-xs">
                  <span className="shrink-0 text-gray-400">用户</span>
                  <button onClick={() => setAdminUserFilter(null)} className={`rounded-md px-2.5 py-1 ${!adminUserFilter ? 'bg-white font-semibold text-[#1A2B4A] shadow-sm' : 'text-gray-500'}`}>全部用户</button>
                  <button onClick={() => openUserPicker('filter')} className={`flex min-w-0 items-center gap-1 rounded-md px-2.5 py-1 ${adminUserFilter ? 'bg-[#1A2B4A] font-semibold text-white' : 'bg-white text-slate-600 shadow-sm'}`}><span className="max-w-24 truncate">{adminUserFilter?.name || '指定用户'}</span><Search className="h-3 w-3" /></button>
                  {adminUserFilter && <button onClick={() => setAdminUserFilter(null)} className="text-gray-400">清除</button>}
                </div>
                {showUserPicker && userPickerMode === 'filter' && (
                  <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                    <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-2 py-2"><Search className="h-3.5 w-3.5 shrink-0 text-gray-400" /><input className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="输入用户名或昵称搜索..." value={userSearchText} onChange={(e) => setUserSearchText(e.target.value)} autoFocus /><button onClick={closeUserPicker}><X className="h-4 w-4 text-gray-400" /></button></div>
                    {userSearchText.trim().length === 0 && <p className="px-3 py-3 text-xs text-gray-400">输入关键词后筛选用户贷款</p>}
                    {userSearchText.trim().length > 0 && (userSearchResults as any[]).length === 0 && <p className="px-3 py-3 text-xs text-gray-400">未找到用户</p>}
                    {(userSearchResults as any[]).map((u: any) => <button key={u.id} onClick={() => selectPickerUser({ id: u.id, name: u.name || u.username })} className="flex w-full items-center gap-2 px-3 py-2.5 text-left active:bg-slate-50"><User className="h-4 w-4 text-gray-400" /><span className="truncate text-sm text-gray-800">{u.name || u.username}</span>{u.name && u.username && <span className="truncate text-xs text-gray-400">@{u.username}</span>}</button>)}
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs">
                  <span className="shrink-0 text-gray-400">到期</span>
                  {([['all', '全部'], ['dueSoon', '7天内'], ['overdue', '已逾期'], ['unset', '未设置']] as const).map(([value, label]) => <button key={value} onClick={() => setLoanDueFilter(value)} className={`rounded-md px-2.5 py-1 ${loanDueFilter === value ? 'bg-white font-semibold text-[#1A2B4A] shadow-sm' : 'text-gray-500'}`}>{label}</button>)}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 统一贷款卡片列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#F6F7FB]" onClick={() => showUserPicker && closeUserPicker()}>
        {viewMode === 'self' && (
          <>
            {isLoanTypeVisible('creditCard') && sortedMyCards.map((card: any) => <CardItem key={card.id} card={card} />)}
            {isLoanTypeVisible('policyLoan') && <PolicyLoanManagement embedded sortBy={loanSort} addRequestId={policyAddRequestId} refreshRequestId={loanRefreshRequestId} loanType="policy" showEmpty={isOnlyLoanTypeVisible('policyLoan')} />}
            {isLoanTypeVisible('huabei') && <PolicyLoanManagement embedded sortBy={loanSort} addRequestId={huabeiAddRequestId} refreshRequestId={loanRefreshRequestId} loanType="huabei" showEmpty={isOnlyLoanTypeVisible('huabei')} />}
            {isLoanTypeVisible('housingFund') && <PolicyLoanManagement embedded sortBy={loanSort} addRequestId={housingFundAddRequestId} refreshRequestId={loanRefreshRequestId} loanType="housing_fund" showEmpty={isOnlyLoanTypeVisible('housingFund')} />}
            {isLoanTypeVisible('creditCard') && sortedMyCards.length === 0 && isOnlyLoanTypeVisible('creditCard') && (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400"><CreditCard className="w-12 h-12 mb-3 opacity-30" /><p className="text-sm">暂无信用卡</p><p className="text-xs mt-1">点击右上角 + 添加</p></div>
            )}
          </>
        )}
        {viewMode === 'admin' && (
          <>
            {isLoanTypeVisible('creditCard') && Object.keys(groupedCards).length === 0 && isOnlyLoanTypeVisible('creditCard') && (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <Users className="w-12 h-12 mb-3 opacity-30" />
                <p className="text-sm">暂无用户信用卡数据</p>
              </div>
            )}
            {isLoanTypeVisible('creditCard') && Object.entries(groupedCards).map(([userId, group]) => (
              <div key={userId}>
                <div className="flex items-center space-x-2 mb-2 px-1">
                  <User className="w-3.5 h-3.5 text-gray-400" />
                  <p className="text-gray-500 text-xs font-medium">{(group as any).userName}</p>
                  <span className="text-gray-300 text-xs">({(group as any).cards.length}张)</span>
                </div>
                <div className="space-y-2">
                  {(group as any).cards.map((card: any) => <CardItem key={card.id} card={card} />)}
                </div>
              </div>
            ))}
            {isLoanTypeVisible('policyLoan') && <PolicyLoanManagement embedded sortBy={loanSort} adminMode targetUser={targetUser} filterUserId={adminUserFilter?.id} dueFilter={loanDueFilter} addRequestId={policyAddRequestId} refreshRequestId={loanRefreshRequestId} loanType="policy" showEmpty={isOnlyLoanTypeVisible('policyLoan')} />}
            {isLoanTypeVisible('huabei') && <PolicyLoanManagement embedded sortBy={loanSort} adminMode targetUser={targetUser} filterUserId={adminUserFilter?.id} dueFilter={loanDueFilter} addRequestId={huabeiAddRequestId} refreshRequestId={loanRefreshRequestId} loanType="huabei" showEmpty={isOnlyLoanTypeVisible('huabei')} />}
            {isLoanTypeVisible('housingFund') && <PolicyLoanManagement embedded sortBy={loanSort} adminMode targetUser={targetUser} filterUserId={adminUserFilter?.id} dueFilter={loanDueFilter} addRequestId={housingFundAddRequestId} refreshRequestId={loanRefreshRequestId} loanType="housing_fund" showEmpty={isOnlyLoanTypeVisible('housingFund')} />}
          </>
        )}
      </div>

      {/* 添加/编辑表单（底部弹出） */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" style={{ background: 'rgba(0,0,0,0.5)' }}>
          {/* bg-white 底部填充层，消除圆角处的黑色空隙 */}
          <div className="bg-white">
          <div className="bg-white rounded-t-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div>
                <h2 className="font-semibold text-gray-800">{editingId ? "编辑信用卡" : "添加信用卡"}</h2>
                {isAdmin && !editingId && targetUser && (
                  <p className="text-xs text-amber-600 mt-0.5">为 {targetUser.name} 添加</p>
                )}
                {!editingId && hasDraft && (
                  <div className="flex items-center space-x-1.5 mt-0.5">
                    <span className="w-1.5 h-1.5 bg-amber-400 rounded-full" />
                    <span className="text-xs text-amber-600">已恢复草稿</span>
                    <button
                      onClick={() => { localStorage.removeItem(draftKey); setHasDraft(false); setForm(emptyForm); }}
                      className="text-xs text-gray-400 underline ml-1">
                      清除
                    </button>
                  </div>
                )}
              </div>
              <button onClick={() => { setShowForm(false); setEditingId(null); }}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* 1. 所属銀行 */}
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">所属銀行 *</label>
                <div className="relative">
                  <button onClick={() => { setShowBankPicker(v => !v); setBankSearchText(''); }}
                    className={`w-full flex items-center justify-between border rounded-lg px-3 py-2.5 text-sm transition-all ${form.bankName ? 'border-blue-400 bg-blue-50 text-blue-700 font-medium' : 'border-gray-200 text-gray-400 bg-white'}`}>
                    <span>{form.bankName || '点击选择銀行...'}</span>
                    <ChevronDown className="w-4 h-4 flex-shrink-0" />
                  </button>
                  {showBankPicker && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-30 max-h-72 overflow-y-auto">
                      <div className="p-2 border-b border-gray-100 sticky top-0 bg-white">
                        <div className="flex items-center space-x-2 bg-gray-50 rounded-lg px-2 py-1.5">
                          <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <input className="flex-1 bg-transparent text-sm outline-none" placeholder="搜索銀行..."
                            value={bankSearchText} onChange={e => setBankSearchText(e.target.value)} autoFocus />
                          {bankSearchText && <button onClick={() => setBankSearchText('')}><X className="w-3.5 h-3.5 text-gray-400" /></button>}
                        </div>
                      </div>
                      <div className="p-2">
                        {(() => {
                          const filtered = bankSearchText.trim()
                            ? BANK_OPTIONS.filter(b => b.includes(bankSearchText.trim()))
                            : BANK_OPTIONS;
                          if (filtered.length === 0) {
                            return (
                              <div className="py-4 text-center">
                                <p className="text-gray-400 text-sm mb-2">未找到匹配銀行</p>
                                <button onClick={() => {
                                  const custom = bankSearchText.trim();
                                  if (custom) { setForm(f => ({ ...f, bankName: custom })); setShowBankPicker(false); }
                                }} className="text-blue-600 text-sm underline">直接使用"{bankSearchText.trim()}"</button>
                              </div>
                            );
                          }
                          return (
                            <div className="grid grid-cols-3 gap-1.5">
                              {filtered.map(bank => (
                                <button key={bank} onClick={() => { setForm(f => ({ ...f, bankName: bank })); setShowBankPicker(false); setBankSearchText(''); }}
                                  className={`py-2 px-1 rounded-lg text-xs font-medium border transition-all text-center ${form.bankName === bank ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-100 text-gray-600 bg-gray-50 active:bg-gray-100'}`}>
                                  {bank}
                                </button>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 2. 持卡人姓名 */}
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">持卡人姓名</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm"
                  placeholder="如：张三" value={form.cardHolder}
                  onChange={e => setForm(f => ({ ...f, cardHolder: e.target.value }))} />
              </div>

              {/* 3. 卡号 */}
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">卡号</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm tracking-widest"
                  placeholder="1234 5678 9012 3456" maxLength={23} value={form.cardLast4}
                  onChange={e => {
                    let v = e.target.value.replace(/\D/g, '').slice(0, 19);
                    v = v.replace(/(\d{4})(?=\d)/g, '$1 ');
                    setForm(f => ({ ...f, cardLast4: v }));
                  }} />
              </div>

              {/* 4. 有效期 */}
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">有效期</label>
                <div className="grid grid-cols-2 gap-2">
                  <select className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white"
                    value={form.expiryMonth ? form.expiryMonth.split('/')[0] : ''}
                    onChange={e => {
                      const yr = form.expiryMonth ? form.expiryMonth.split('/')[1] || '' : '';
                      setForm(f => ({ ...f, expiryMonth: e.target.value ? `${e.target.value}/${yr}` : '' }));
                    }}>
                    <option value="">月份</option>
                    {['01','02','03','04','05','06','07','08','09','10','11','12'].map(m => (
                      <option key={m} value={m}>{m} 月</option>
                    ))}
                  </select>
                  <select className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white"
                    value={form.expiryMonth ? form.expiryMonth.split('/')[1] || '' : ''}
                    onChange={e => {
                      const mo = form.expiryMonth ? form.expiryMonth.split('/')[0] || '' : '';
                      setForm(f => ({ ...f, expiryMonth: e.target.value ? `${mo}/${e.target.value}` : '' }));
                    }}>
                    <option value="">年份</option>
                    {Array.from({ length: Math.max(1, 2050 - new Date().getFullYear() + 1) }, (_, i) => {
                      const fullYear = new Date().getFullYear() + i;
                      const yr = String(fullYear).slice(-2);
                      return <option key={yr} value={yr}>{fullYear} 年</option>;
                    })}
                  </select>
                </div>
              </div>

              {/* 5. 信用额度 + 币种类型 */}
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">信用额度</label>
                <div className="flex items-center space-x-2">
                  <input className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm"
                    placeholder="50000" type="number" value={form.creditLimit}
                    onChange={e => setForm(f => ({ ...f, creditLimit: e.target.value }))} />
                  <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs flex-shrink-0">
                    <button onClick={() => setForm(f => ({ ...f, isMultiCurrency: false, currencies: f.currencies.slice(0,1) }))}
                      className={`px-3 py-2.5 font-medium transition-all ${!form.isMultiCurrency ? 'bg-blue-500 text-white' : 'bg-white text-gray-600'}`}>
                      单币种
                    </button>
                    <button onClick={() => setForm(f => ({ ...f, isMultiCurrency: true }))}
                      className={`px-3 py-2.5 font-medium transition-all ${form.isMultiCurrency ? 'bg-blue-500 text-white' : 'bg-white text-gray-600'}`}>
                      多币种
                    </button>
                  </div>
                </div>
              </div>

              {/* 6. 账单日 & 还款日 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1.5 block">账单日</label>
                  <select className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white"
                    value={form.billingDay} onChange={e => setForm(f => ({ ...f, billingDay: e.target.value }))}>
                    <option value="">选择日期</option>
                    {DAYS.map(d => <option key={d} value={d}>每月 {d} 日</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1.5 block">最后还款日</label>
                  <select className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white"
                    value={form.dueDay} onChange={e => setForm(f => ({ ...f, dueDay: e.target.value }))}>
                    <option value="">选择日期</option>
                    {DAYS.map(d => <option key={d} value={d}>每月 {d} 日</option>)}
                  </select>
                </div>
              </div>

              {/* 最优刷卡建议（实时预览） */}
              {bestSwipe && (
                <div className="flex items-start space-x-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
                  <Lightbulb className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-amber-700 text-xs font-medium">最优刷卡建议</p>
                    <p className="text-amber-600 text-xs mt-0.5">{bestSwipe.description}</p>
                  </div>
                </div>
              )}

              {/* 7. 卡组织（下拉面板） */}
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">卡组织（可多选）</label>
                <div className="relative">
                  <button onClick={() => setShowNetworkPicker(v => !v)}
                    className={`w-full flex items-center justify-between border rounded-lg px-3 py-2.5 text-sm transition-all ${form.cardNetworks.length > 0 ? 'border-blue-400 bg-blue-50 text-blue-700 font-medium' : 'border-gray-200 text-gray-400 bg-white'}`}>
                    <span>{form.cardNetworks.length > 0 ? form.cardNetworks.join(' · ') : '点击选择卡组织...'}</span>
                    <ChevronDown className="w-4 h-4 flex-shrink-0" />
                  </button>
                  {showNetworkPicker && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-30 p-3">
                      <div className="flex flex-wrap gap-2">
                        {CARD_NETWORKS.map(net => {
                          const selected = form.cardNetworks.includes(net);
                          return (
                            <button key={net} onClick={() => setForm(f => ({
                              ...f,
                              cardNetworks: selected
                                ? f.cardNetworks.filter(n => n !== net)
                                : [...f.cardNetworks, net]
                            }))}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${selected ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 bg-white'}`}>
                              {net}
                            </button>
                          );
                        })}
                      </div>
                      <button onClick={() => setShowNetworkPicker(false)}
                        className="mt-3 w-full py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-medium">
                        确定
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* 8. 临时额度 */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                {/* 开关行 */}
                <button
                  onClick={() => setForm(f => ({ ...f, hasTempLimit: !f.hasTempLimit }))}
                  className="w-full flex items-center justify-between px-3 py-3 bg-white active:bg-gray-50"
                >
                  <div className="flex items-center space-x-2">
                    <CreditCard className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-medium text-gray-700">临时额度</span>
                    {form.hasTempLimit && (
                      <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">已启用</span>
                    )}
                  </div>
                  {form.hasTempLimit
                    ? <ToggleRight className="w-6 h-6 text-amber-500" />
                    : <ToggleLeft className="w-6 h-6 text-gray-300" />
                  }
                </button>

                {/* 展开内容 */}
                {form.hasTempLimit && (
                  <div className="px-3 pb-3 pt-1 bg-amber-50 border-t border-amber-100 space-y-3">
                    {/* 临时额度金额 */}
                    <div>
                      <label className="text-xs text-amber-700 mb-1 block">临时提升至（金额）</label>
                      <input
                        className="w-full border border-amber-200 rounded-lg px-3 py-2.5 text-sm bg-white"
                        placeholder="如：80000"
                        type="number"
                        value={form.tempLimit}
                        onChange={e => setForm(f => ({ ...f, tempLimit: e.target.value }))}
                      />
                    </div>
                    {/* 临时额度到期日（月和日） */}
                    <div>
                      <label className="text-xs text-amber-700 mb-1 block">临时额度到期日</label>
                      <div className="grid grid-cols-2 gap-2">
                        {/* 月 */}
                        <select
                          className="w-full border border-amber-200 rounded-lg px-3 py-2.5 text-sm bg-white"
                          value={(() => {
                            if (!form.tempLimitEnd) return '';
                            const parts = form.tempLimitEnd.split('-');
                            return parts.length >= 2 ? parts[1] : '';
                          })()}
                          onChange={e => {
                            const m = e.target.value;
                            const parts = form.tempLimitEnd ? form.tempLimitEnd.split('-') : [];
                            const y = new Date().getFullYear();
                            const d = parts.length >= 3 ? parts[2] : '';
                            setForm(f => ({ ...f, tempLimitEnd: m && d ? `${y}-${m}-${d}` : m ? `${y}-${m}-` : '' }));
                          }}
                        >
                          <option value="">选月份</option>
                          {['01','02','03','04','05','06','07','08','09','10','11','12'].map(m => (
                            <option key={m} value={m}>{parseInt(m)}月</option>
                          ))}
                        </select>
                        {/* 日 */}
                        <select
                          className="w-full border border-amber-200 rounded-lg px-3 py-2.5 text-sm bg-white"
                          value={(() => {
                            if (!form.tempLimitEnd) return '';
                            const parts = form.tempLimitEnd.split('-');
                            return parts.length >= 3 ? parts[2] : '';
                          })()}
                          onChange={e => {
                            const d = e.target.value;
                            const parts = form.tempLimitEnd ? form.tempLimitEnd.split('-') : [];
                            const y = new Date().getFullYear();
                            const m = parts.length >= 2 ? parts[1] : '';
                            setForm(f => ({ ...f, tempLimitEnd: m && d ? `${y}-${m}-${d}` : '' }));
                          }}
                        >
                          <option value="">选日期</option>
                          {Array.from({ length: 31 }, (_, i) => {
                            const d = String(i + 1).padStart(2, '0');
                            return <option key={d} value={d}>{i + 1}日</option>;
                          })}
                        </select>
                      </div>
                    </div>
                    {/* 实时预览 */}
                    {form.tempLimit && form.tempLimitEnd && /^\d{4}-\d{2}-\d{2}$/.test(form.tempLimitEnd) && (() => {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      // 用本地时间解析，避免 UTC 日期字符串被解析为 UTC+0 导致时区偏差
                      const [ey, em, ed] = form.tempLimitEnd.split('-').map(Number);
                      const end = new Date(ey, em - 1, ed);
                      const msLeft = end.getTime() - today.getTime();
                      const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
                      const monthsLeft = end.getFullYear() * 12 + end.getMonth() - (today.getFullYear() * 12 + today.getMonth());
                      const endLabel = `${em}月${ed}日`;
                      let statusText = '';
                      let statusColor = 'text-amber-600';
                      if (daysLeft < 0) {
                        statusText = '已过期';
                        statusColor = 'text-gray-400';
                      } else if (daysLeft <= 7) {
                        statusText = daysLeft <= 1 ? '即将到期（还剩1天）' : `即将到期（还剩${daysLeft}天）`;
                        statusColor = 'text-red-500';
                      } else if (monthsLeft < 1) {
                        statusText = `还剩${daysLeft}天`;
                        statusColor = 'text-orange-500';
                      } else {
                        statusText = `还剩${monthsLeft}个月`;
                      }
                      return (
                        <div className="flex items-start space-x-2 bg-white rounded-lg px-3 py-2 border border-amber-200">
                          <Lightbulb className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs text-amber-700">
                              临时额度 <span className="font-semibold">{Number(form.tempLimit).toLocaleString()}</span>，到期 {endLabel}
                            </p>
                            <p className={`text-xs font-semibold mt-0.5 ${statusColor}`}>{statusText}</p>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* 9. 备注 */}
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">备注（可选）</label>
                <textarea className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm resize-none"
                  rows={2} placeholder="如：主要消费卡、有积分..." value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
              </div>

              <button onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending || adminCreateMutation.isPending}
                className="w-full py-3 rounded-xl text-white font-semibold text-sm flex items-center justify-center space-x-2"
                style={{ background: 'linear-gradient(135deg, #1A2B4A 0%, #2d4a7a 100%)' }}>
                <Check className="w-4 h-4" />
                <span>{editingId ? "保存修改" : "添加信用卡"}</span>
              </button>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* 删除确认 */}
      {deleteConfirmId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-2xl p-6 mx-6 w-full max-w-xs">
            {deleteConfirmStep === 1 ? (
              <>
                <p className="text-gray-800 font-semibold text-center mb-2">删除信用卡</p>
                <p className="text-gray-500 text-sm text-center mb-5">确定要删除这张信用卡吗？</p>
                <div className="flex space-x-3">
                  <button onClick={() => setDeleteConfirmId(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">取消</button>
                  <button onClick={() => setDeleteConfirmStep(2)} className="flex-1 py-2.5 rounded-xl bg-gray-800 text-white text-sm font-medium">继续</button>
                </div>
              </>
            ) : (
              <>
                <p className="text-red-500 font-semibold text-center mb-2">再次确认删除</p>
                <p className="text-gray-500 text-sm text-center mb-5">删除后数据不可恢复，请确认操作</p>
                <div className="flex space-x-3">
                  <button onClick={() => { setDeleteConfirmId(null); setDeleteConfirmStep(1); }} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">取消</button>
                  <button onClick={() => handleDelete(deleteConfirmId)} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-medium">确认删除</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
