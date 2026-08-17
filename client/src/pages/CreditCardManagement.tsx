import { useState, useMemo, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { setSmartAccountingLastPage } from "@/lib/smartAccountingNavigation";
import { toast } from "sonner";
import PolicyLoanManagement from "./PolicyLoanManagement";
import { UserAvatar } from "@/components/UserAvatar";
import {
  ChevronLeft, Plus, CreditCard, Pencil, Trash2,
  X, Check, Users, User, Search, ChevronDown, Lightbulb, ToggleLeft, ToggleRight,
  Eye, EyeOff, ShieldCheck,
} from "lucide-react";

const BANK_COLORS: Record<string, { bg: string; border: string }> = {
  "招商银行": { bg: "#E8001D", border: "#C0001A" },
  "工商银行": { bg: "#D4000A", border: "#A80008" },
  "建设银行": { bg: "#003087", border: "#002060" },
  "农业银行": { bg: "#007A33", border: "#005A25" },
  "中国银行": { bg: "#CC0000", border: "#990000" },
  "交通银行": { bg: "#005BAC", border: "#004080" },
  "浦发银行": { bg: "#1B4F8A", border: "#123A6A" },
  "民生银行": { bg: "#0066CC", border: "#004A99" },
  "光大银行": { bg: "#E8001D", border: "#B00015" },
  "华夏银行": { bg: "#CC0000", border: "#990000" },
  "中信银行": { bg: "#CC0000", border: "#990000" },
  "兴业银行": { bg: "#006633", border: "#004D26" },
  "平安银行": { bg: "#FF6600", border: "#CC5200" },
  "广发银行": { bg: "#CC0000", border: "#990000" },
  "邮储银行": { bg: "#006633", border: "#004D26" },
};
const DEFAULT_COLOR = { bg: "#4A5568", border: "#2D3748" };

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

// 生成月份选项（当前月往后24个月）
function genMonthOptions() {
  const opts: { label: string; value: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const y = d.getFullYear();
    opts.push({ label: `${y}年${m}月`, value: `${y}-${m}-01` });
  }
  return opts;
}
const MONTH_OPTIONS = genMonthOptions();

export default function CreditCardManagement() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isAdmin = !!user && (user as any).role === "super_admin";

  const [viewMode, setViewMode] = useState<'self' | 'admin'>('self');
  const [targetUser, setTargetUser] = useState<{ id: number; name: string } | null>(null);
  const [userSearchText, setUserSearchText] = useState('');
  const [showUserPicker, setShowUserPicker] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [showAddTypePicker, setShowAddTypePicker] = useState(false);
  const [showLoanHeaderMenu, setShowLoanHeaderMenu] = useState(false);
  const [loanTypeFilter, setLoanTypeFilter] = useState<'all' | 'creditCard' | 'policyLoan'>('all');
  const [loanSort, setLoanSort] = useState<'default' | 'dueDate' | 'rate' | 'amount'>('default');
  const [policyAddRequestId, setPolicyAddRequestId] = useState(0);
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

  const { data: myCards = [], refetch: refetchMy } = trpc.creditCard.list.useQuery(
    undefined, { enabled: viewMode === 'self' }
  );
  const { data: allCards = [], refetch: refetchAll } = trpc.creditCard.adminListAll.useQuery(
    undefined, { enabled: isAdmin && viewMode === 'admin' }
  );
  const { data: userSearchResults = [] } = trpc.sharing.searchUsers.useQuery(
    { query: userSearchText },
    { enabled: isAdmin && userSearchText.trim().length > 0 }
  );

  const refetch = () => { refetchMy(); refetchAll(); };

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
    const hasTemp = !!(card.temp_limit && card.temp_limit_end);
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
    // 新增信用卡不传未启用的临时额度字段；编辑时显式传 null，确保可以清空既有临时额度。
    const clearedTempLimit = editingId ? null : undefined;
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
    } else if (isAdmin && viewMode === 'admin') {
      if (!targetUser) { toast.error("请先选择要为哪位用户添加"); return; }
      adminCreateMutation.mutate({ targetUserId: targetUser.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleDelete = (id: number) => {
    if (viewMode === 'admin' && isAdmin) adminDeleteMutation.mutate({ id });
    else deleteMutation.mutate({ id });
  };

  const bankColor = (name: string) => BANK_COLORS[name] || DEFAULT_COLOR;

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

  const groupedCards = useMemo(() => {
    if (viewMode !== 'admin') return {};
    const groups: Record<number, { userName: string; cards: any[] }> = {};
    for (const card of allCards as any[]) {
      if (!groups[card.user_id]) {
        groups[card.user_id] = {
          userName: card.user_name || card.user_username || `用户${card.user_id}`,
          cards: [],
        };
      }
      groups[card.user_id].cards.push(card);
    }
    return groups;
  }, [allCards, viewMode]);

  const CardItem = ({ card }: { card: any }) => {
    const color = bankColor(card.bank_name);
    const nextBilling = card.billing_day ? getNextMonthlyDate(Number(card.billing_day)) : null;
    const nextDue = card.due_day ? getNextMonthlyDate(Number(card.due_day)) : null;
    const swipe = card.billing_day && card.due_day ? calcBestSwipeDay(card.billing_day, card.due_day) : null;
    const tempActive = isTempLimitActive(card.temp_limit_start, card.temp_limit_end);
    const tempEndLabel = card.temp_limit_end ? formatDateLabel(card.temp_limit_end) : '';
    const currencyLabel = String(card.currency || 'CNY').split(',').map((currency: string) => currency.trim() === 'CNY' ? '人民币元' : currency.trim()).join(' / ');
    const [showFullCard, setShowFullCard] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [showAvailableInput, setShowAvailableInput] = useState(false);
    const [availableInputVal, setAvailableInputVal] = useState('');

    return (
      <div className="rounded-2xl overflow-hidden shadow-md">
        {/* 卡片主体 */}
        <div className="relative px-3.5 py-3" style={{ background: `linear-gradient(135deg, ${color.bg} 0%, ${color.border} 100%)` }}>

          <div className="relative z-10">
            <div className="flex items-start justify-between">
              <div className="min-w-0 pr-2">
                {/* 银行、类型与卡组织集中在首行；持卡人姓名随卡号展示 */}
                <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  {card.bank_name && <p className="text-sm font-bold text-white">{card.bank_name.replace(/銀/g, "银").replace(/購/g, "购").replace(/廣/g, "广")}</p>}
                  <span className="rounded border border-white/30 bg-white/10 px-1.5 text-[10px] font-semibold leading-4 text-white/85">信用卡</span>
                  {card.card_network && card.card_network.split(',').map((net: string) => (
                    <span key={net} className="rounded border border-white/25 px-1 text-[10px] leading-4 text-white/70">{net.trim()}</span>
                  ))}
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
                        >
                          {showFullCard
                            ? <EyeOff className="w-3.5 h-3.5 text-white" />
                            : <Eye className="w-3.5 h-3.5 text-white" />}
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
                          setAvailableInputVal(card.available_limit != null ? String(card.available_limit) : '');
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
            {/* 额度行：正常额度 + 临时额度标签 */}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {card.credit_limit && (() => {
                const limit = Number(card.credit_limit);
                const avail = card.available_limit != null ? Number(card.available_limit) : null;
                const used = avail != null ? limit - avail : null;
                const usedPct = avail != null ? Math.round((used! / limit) * 100) : null;
                return (
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
                    <span className="text-white/70">额度 <span className="font-semibold text-white">{limit.toLocaleString()}</span></span>
                    <span className="text-white/60">{currencyLabel}</span>
                    {avail != null && <span className="text-white/70">· 可用 <span className="font-semibold text-white">{avail.toLocaleString()}</span></span>}
                    {used != null && <span className="text-white/70">· 已用 <span className="font-semibold text-white">{used.toLocaleString()}</span> · {usedPct}%</span>}
                    {used != null && (
                      <div className="h-1 w-14 rounded-full bg-white/20 overflow-hidden">
                        <div className={`h-full rounded-full ${
                          usedPct! >= 90 ? 'bg-red-400' : usedPct! >= 70 ? 'bg-amber-400' : 'bg-green-400'
                        }`} style={{width: `${Math.min(100, usedPct!)}%`}} />
                      </div>
                    )}
                  </div>
                );
              })()}
              {/* 临时额度标签 */}
              {card.temp_limit && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  tempActive
                    ? 'bg-amber-400 text-amber-900'
                    : 'bg-white/20 text-white/60'
                }`}>
                  {tempActive
                    ? `临时额度 ${Number(card.temp_limit).toLocaleString()} · 至${tempEndLabel}`
                    : `临时额度（已过期）`}
                </span>
              )}
            </div>
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
                <p className="text-gray-400 text-xs mb-3">信用额度 {Number(card.credit_limit).toLocaleString()} {currencyLabel}</p>
              )}
              <input
                type="number"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-lg font-semibold text-gray-900 mb-2 focus:outline-none focus:border-[#1A2B4A]"
                placeholder="输入当前可用额度"
                value={availableInputVal}
                onChange={e => setAvailableInputVal(e.target.value)}
                autoFocus
              />
              {availableInputVal && card.credit_limit && (
                <p className="text-gray-400 text-xs mb-4">
                  已用额度：<span className="text-gray-700 font-medium">{(Number(card.credit_limit) - Number(availableInputVal)).toLocaleString()}</span>
                  {' · '}
                  <span className="text-gray-700 font-medium">{Math.round(((Number(card.credit_limit) - Number(availableInputVal)) / Number(card.credit_limit)) * 100)}%</span>
                </p>
              )}
              <button
                onClick={async () => {
                  const val = Number(availableInputVal);
                  if (isNaN(val) || val < 0) return;
                  try {
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

        {/* 账单信息 */}
        <div className="grid grid-cols-4 divide-x divide-gray-100 bg-white py-2">
          <div className="contents">
            <div className="grid min-w-0 grid-rows-[16px_20px_16px] px-2 py-1">
              <p className="text-[11px] leading-4 text-gray-400">账单日</p>
              {nextBilling ? (
                <>
                  <p className="truncate text-sm font-bold leading-5 text-gray-900">{nextBilling.label}</p>
                  <span className={`text-[10px] leading-4 ${
                    nextBilling.days <= 3 ? 'text-red-500' :
                    nextBilling.days <= 7 ? 'text-orange-500' : 'text-gray-400'
                  }`}>{nextBilling.days === 0 ? '今天' : `${nextBilling.days}天后`}</span>
                </>
              ) : <><p className="text-sm leading-5 text-gray-300">未设置</p><span /></>}
            </div>
            <div className="grid min-w-0 grid-rows-[16px_20px_16px] px-2 py-1">
              <p className="text-[11px] leading-4 text-gray-400">最后还款日</p>
              {nextDue ? (
                <>
                  <p className="truncate text-sm font-bold leading-5 text-gray-900">{nextDue.label}</p>
                  <span className={`text-[10px] leading-4 ${
                    nextDue.days <= 3 ? 'text-red-500' :
                    nextDue.days <= 7 ? 'text-orange-500' : 'text-gray-400'
                  }`}>{nextDue.days === 0 ? '今天' : `${nextDue.days}天后`}</span>
                </>
              ) : <><p className="text-sm leading-5 text-gray-300">未设置</p><span /></>}
            </div>
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
        <button
          onClick={() => setShowAddTypePicker(true)}
          className="relative w-7 h-7 flex items-center justify-center rounded-full bg-white/20 active:bg-white/30"
          aria-label="新增贷款工具">
          <Plus className="w-4 h-4" />
          {hasDraft && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-400 rounded-full" />
          )}
        </button>
      </div>

      {/* 右上角 + ：选择新增的金融工具类型 */}
      {showAddTypePicker && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white w-full max-w-[480px] mx-auto rounded-t-2xl px-4 pt-4 pb-8">
            <div className="flex items-center justify-between mb-4">
              <div><p className="text-gray-900 font-semibold">新增贷款工具</p><p className="text-xs text-gray-400 mt-0.5">选择信用卡或保单贷款</p></div>
              <button onClick={() => setShowAddTypePicker(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <button
                onClick={() => {
                  setShowAddTypePicker(false);
                  setLoanTypeFilter('creditCard');
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
                onClick={() => { setShowAddTypePicker(false); setLoanTypeFilter('policyLoan'); setPolicyAddRequestId(v => v + 1); }}
                className="w-full flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/40 p-3.5 text-left active:bg-amber-50">
                <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#17345E] to-[#27507D] flex items-center justify-center"><ShieldCheck className="w-5 h-5 text-amber-300" /></span>
                <span><span className="block text-sm font-semibold text-gray-800">保单贷款</span><span className="block text-xs text-gray-400 mt-0.5">保单、贷款余额、利率、还款方式及到期日</span></span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 管理员视角切换 */}
      {isAdmin && (
        <div className="bg-white border-b border-gray-100 px-4 py-2 flex space-x-2">
          <button onClick={() => setViewMode('self')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${viewMode === 'self' ? 'bg-[#1A2B4A] text-white' : 'bg-gray-100 text-gray-600'}`}>
            <User className="w-3.5 h-3.5" /><span>我的贷款</span>
          </button>
          <button onClick={() => setViewMode('admin')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${viewMode === 'admin' ? 'bg-[#1A2B4A] text-white' : 'bg-gray-100 text-gray-600'}`}>
            <Users className="w-3.5 h-3.5" /><span>所有人贷款</span>
          </button>
        </div>
      )}

      {/* 管理员视角：用户选择器 */}
      {isAdmin && viewMode === 'admin' && (
        <div className="bg-amber-50 border-b border-amber-100 px-4 py-2">
          <p className="text-amber-700 text-[11px] mb-1">为指定用户添加贷款工具：</p>
          <div className="relative">
            <button onClick={() => setShowUserPicker(v => !v)}
              className="w-full flex items-center justify-between bg-white border border-amber-200 rounded-lg px-3 py-2 text-sm">
              <span className={targetUser ? 'text-gray-800' : 'text-gray-400'}>
                {targetUser ? targetUser.name : "搜索并选择用户..."}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
            {showUserPicker && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 max-h-60 overflow-y-auto">
                <div className="p-2 border-b border-gray-100 sticky top-0 bg-white">
                  <div className="flex items-center space-x-2 bg-gray-50 rounded-lg px-2 py-1.5">
                    <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <input className="flex-1 bg-transparent text-sm outline-none" placeholder="输入姓名或用户名搜索..."
                      value={userSearchText} onChange={e => setUserSearchText(e.target.value)} autoFocus />
                    {userSearchText && <button onClick={() => setUserSearchText('')}><X className="w-3.5 h-3.5 text-gray-400" /></button>}
                  </div>
                </div>
                {userSearchText.trim().length === 0 && <div className="px-4 py-6 text-center text-gray-400 text-sm">输入关键词搜索用户</div>}
                {userSearchText.trim().length > 0 && (userSearchResults as any[]).length === 0 && <div className="px-4 py-6 text-center text-gray-400 text-sm">未找到用户</div>}
                {(userSearchResults as any[]).map((u: any) => (
                  <button key={u.id} onClick={() => { setTargetUser({ id: u.id, name: u.name || u.username }); setShowUserPicker(false); setUserSearchText(''); }}
                    className={`w-full px-3 py-2.5 text-left hover:bg-gray-50 flex items-center space-x-3 ${targetUser?.id === u.id ? 'bg-blue-50' : ''}`}>
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {u.avatar ? <img src={u.avatar} className="w-full h-full object-cover" alt="" /> : <User className="w-4 h-4 text-gray-400" />}
                    </div>
                    <div>
                      <p className={`text-sm font-medium ${targetUser?.id === u.id ? 'text-blue-700' : 'text-gray-800'}`}>{u.name || u.username}</p>
                      {u.name && u.username && <p className="text-xs text-gray-400">@{u.username}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 类别筛选与排序 */}
      <div className="bg-white border-b border-gray-100 px-4 py-2.5 space-y-2">
        <div className="flex gap-2">
          {([
            ['all', '全部'],
            ['creditCard', '信用卡'],
            ['policyLoan', '保单贷款'],
          ] as const).map(([value, label]) => (
            <button key={value} onClick={() => setLoanTypeFilter(value)} className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${loanTypeFilter === value ? 'bg-[#1A2B4A] text-white' : 'bg-slate-100 text-slate-600'}`}>{label}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-400 shrink-0">排序</span>
          {([
            ['default', '默认'],
            ['dueDate', '按到期日'],
            ['rate', '按利率'],
            ['amount', '按贷款金额'],
          ] as const).map(([value, label]) => (
            <button key={value} onClick={() => setLoanSort(value)} className={`px-2.5 py-1 rounded-md ${loanSort === value ? 'bg-blue-50 text-[#1A2B4A] font-semibold' : 'text-gray-500'}`}>{label}</button>
          ))}
        </div>
      </div>

      {/* 统一贷款卡片列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#F6F7FB]" onClick={() => showUserPicker && setShowUserPicker(false)}>
        {viewMode === 'self' && (
          <>
            {loanTypeFilter !== 'policyLoan' && sortedMyCards.map((card: any) => <CardItem key={card.id} card={card} />)}
            {loanTypeFilter !== 'creditCard' && <PolicyLoanManagement embedded sortBy={loanSort} addRequestId={policyAddRequestId} />}
            {loanTypeFilter !== 'policyLoan' && sortedMyCards.length === 0 && loanTypeFilter === 'creditCard' && (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400"><CreditCard className="w-12 h-12 mb-3 opacity-30" /><p className="text-sm">暂无信用卡</p><p className="text-xs mt-1">点击右上角 + 添加</p></div>
            )}
          </>
        )}
        {viewMode === 'admin' && (
          <>
            {loanTypeFilter !== 'policyLoan' && Object.keys(groupedCards).length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <Users className="w-12 h-12 mb-3 opacity-30" />
                <p className="text-sm">暂无用户信用卡数据</p>
              </div>
            )}
            {loanTypeFilter !== 'policyLoan' && Object.entries(groupedCards).map(([userId, group]) => (
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
            {loanTypeFilter !== 'creditCard' && <PolicyLoanManagement embedded sortBy={loanSort} adminMode targetUser={targetUser} addRequestId={policyAddRequestId} />}
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
                {viewMode === 'admin' && !editingId && targetUser && (
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
                    {Array.from({ length: 12 }, (_, i) => {
                      const yr = String(new Date().getFullYear() + i).slice(-2);
                      return <option key={yr} value={yr}>{20}{yr} 年</option>;
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
