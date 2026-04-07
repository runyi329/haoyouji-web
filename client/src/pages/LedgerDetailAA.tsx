/**
 * LedgerDetailAA.tsx - 定制账本(AA) 专用 UI
 * 配色系统：红白金13色
 *   主色   #D32F2F  顶部/高亮
 *   浅红   #FFEBEE  日历有记录格背景
 *   杏白   #FAF3ED  页面背景
 *   白     #FFFFFF  卡片背景
 *   金     #CBA471  装饰
 *   黑     #222222  主文字
 *   灰     #757575  辅助文字
 *   分割   #E0E0E0  边框/网格
 *   绿     #4CAF50  正收益
 *   橙     #FFA000  警告
 *
 * 标签 = 被记录者（账本一级分类）
 * - 管理员通过账本设置创建/管理分类（标签）
 * - 普通用户在头像右侧通过下拉选择标签
 * - 选中标签后，日历和曲线只显示该标签下的账目
 *
 * transactionsData 格式（来自 ledger.getTransactions）：
 *   Array<{ date: string; records: any[]; income: number; expense: number; balance: number }>
 *   注意：balance 是当天 income - expense，不是累计余额
 */
import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { UserAvatar } from "@/components/UserAvatar";
import { ChevronLeft, ChevronRight, Settings, Search, BarChart3, Plus, ChevronDown, CircleDollarSign, Users, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface DayGroup {
  date: string;       // "YYYY-MM-DD"
  records: any[];
  income: number;
  expense: number;
  balance: number;    // 当天 income - expense（非累计）
}

interface Props {
  ledgerId: number;
  ledgerData: any;
  membersData: any[];
  transactionsData: DayGroup[];
  refetchTransactions: () => void;
  user: any;
}

export default function LedgerDetailAA({
  ledgerId,
  ledgerData,
  transactionsData,
  user,
  membersData,
}: Props) {
  const [, setLocation] = useLocation();

  // 日历当前月份
  const [calendarDate, setCalendarDate] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  // 日历视图模  // 权限判断：owner 或 admin 才能操作
  const userRole = (ledgerData as any)?.userRole;
  const canEdit = userRole === 'owner' || userRole === 'admin';
  // 隐藏悬浮+按钮：账本 ID=37（"2026 AA"私人定制账本）对所有人隐藏，仅保留点击日历格子添加记录
  const hideFloatingAddButton = ledgerId === 37;

  const [calendarMode, setCalendarMode] = useState<"balance" | "daily" | "monthly" | "yearly">("balance");
  // 标签（被记录者）选择
  // 用 sessionStorage 持久化选中的标签，返回时恢复；页面首次加载时清除
  const sessionKey = `ledger_${ledgerId}_selectedTagId`;
  const [selectedTagId, setSelectedTagId] = useState<number | null>(() => {
    const saved = sessionStorage.getItem(sessionKey);
    return saved ? parseInt(saved) : null;
  });
  const [showTagDropdown, setShowTagDropdown] = useState(false);

  // ── 视角切换（管理员/创建者可切换到其他成员视角）──
  const [viewAsUserId, setViewAsUserId] = useState<number | null>(null);
  const [showViewAsPicker, setShowViewAsPicker] = useState(false);
  const [viewAsSearch, setViewAsSearch] = useState('');
  const trpcUtils = trpc.useUtils();

  const handleSwitchView = (userId: number | null) => {
    setViewAsUserId(userId);
    setShowViewAsPicker(false);
    setViewAsSearch('');
    trpcUtils.ledger.getMyInitialBalances.invalidate();
  };

  // selectedTagId 变化时同步到 sessionStorage
  useEffect(() => {
    if (selectedTagId !== null) {
      sessionStorage.setItem(sessionKey, String(selectedTagId));
    }
  }, [selectedTagId, sessionKey]);


  // 获取账本一级分类（标签）
  const { data: rawCategories } = trpc.ledger.getCategories.useQuery(
    { ledgerId, parentId: null },
    { enabled: !!ledgerId }
  );
  // 获取初始金额（支持视角切换：管理员可查他人数据）
  const { data: initialBalancesData } = trpc.ledger.getMyInitialBalances.useQuery(
    { ledgerId, viewAsUserId: viewAsUserId ?? undefined },
    { enabled: !!ledgerId }
  );
  // 过滤掉全局默认分类（如「购物」），只保留手动创建的标签
  const allCategories = useMemo(() => {
    if (!rawCategories) return [];
    return rawCategories.filter((c: any) => !c.isDefault);
  }, [rawCategories]);

  // 根据 initialBalancesData 中的 visible 字段，过滤掉对当前用户隐藏的标签
  // 注意：initialBalancesData 未加载完成时返回空数组，防止隐藏标签在加载期间闪现在下拉框中
  const categories = useMemo(() => {
    if (!initialBalancesData) return []; // 数据未加载完，先返回空，防止隐藏标签闪现
    const balances = initialBalancesData.balances ?? {};
    // 检查是否有任何 visible 配置；若完全没有配置则全部显示
    const hasVisibleConfig = allCategories.some(
      (c: any) => balances[`${c.name}__visible`] !== undefined && balances[`${c.name}__visible`] !== null
    );
    if (!hasVisibleConfig) return allCategories; // 该用户没有配置，全部显示
    return allCategories.filter((c: any) => {
      const visibleVal = balances[`${c.name}__visible`];
      // 未设置时默认显示；设置为 0 则隐藏
      if (visibleVal === undefined || visibleVal === null) return true;
      return Number(visibleVal) !== 0;
    });
  }, [allCategories, initialBalancesData]);

  // categories加载后默认选中第1个可见标签
  useEffect(() => {
    if (categories && categories.length > 0 && selectedTagId === null) {
      setSelectedTagId(categories[0].id);
    }
    // 若当前选中标签已被隐藏，切换到第一个可见标签
    if (selectedTagId !== null && categories.length > 0) {
      const stillVisible = categories.find((c: any) => c.id === selectedTagId);
      if (!stillVisible) setSelectedTagId(categories[0].id);
    }
  }, [categories]);

  // 当前选中的标签名
  const selectedTag = useMemo(() => {
    if (!selectedTagId || !categories) return null;
    return categories.find((c: any) => c.id === selectedTagId) || null;
  }, [selectedTagId, categories]);;

  // 当前用户的交易数据
  const activeMemberTransactions = useMemo(() => {
    // 过滤掉 income=0 且 expense=0 的无效记录（误输入空值/0值后删除导致）
    return (transactionsData || []).filter((d) => {
      const total = (d.income || 0) + (d.expense || 0);
      return total > 0;
    });
  }, [transactionsData]);

  // ─── 按标签筛选 activeMemberTransactions ────────────────────────────────────────
  const filteredTransactions = useMemo(() => {
    if (!selectedTagId || !categories) return activeMemberTransactions;
    const tagName = selectedTag?.name;
    if (!tagName) return activeMemberTransactions;

    return (activeMemberTransactions || []).map((day) => {
      // 筛选该标签下的记录（category 字段包含标签名）
      const filtered = day.records.filter((r: any) =>
        r.category && r.category.includes(tagName)
      );
      if (filtered.length === 0) return null;

      let income = 0, expense = 0;
      filtered.forEach((r: any) => {
        if (r.type === 'income') income += r.amount;
        else expense += r.amount;
      });

      // 过滤掉 income+expense=0 的无效天（误输入空值/0值导致）
      if (income === 0 && expense === 0) return null;

      return {
        ...day,
        records: filtered,
        income,
        expense,
        balance: income - expense,
      };
    }).filter(Boolean) as DayGroup[];
  }, [activeMemberTransactions, selectedTagId, selectedTag, categories]);

  // ─── 将分组数据转换为按日期索引的 Map ────────────────────────────────────
  const dayMap = useMemo(() => {
    const map = new Map<string, DayGroup>();
    filteredTransactions.forEach((d) => {
      if (d.date) map.set(d.date, d);
    });
    return map;
  }, [filteredTransactions]);

    // ─── 每天余额快照（直接存当天的余额绝对值，不累加）──────────────────────────
  const cumulativeMap = useMemo(() => {
    const cum = new Map<string, number>();
    filteredTransactions.forEach((d) => {
      // 每天的记录是当天余额快照，取 income 和 expense 中的主要金额
      // income 和 expense 只会有一个有值，取其绝对值作为当天余额
      const dayBalance = d.income > 0 ? d.income : d.expense;
      cum.set(d.date, dayBalance);
    });
    return cum;
  }, [filteredTransactions]);

  // ─── 全部模式：计算所有标签的保证金总和和盈亏总和 ────────────────────────
  const allTagsStats = useMemo(() => {
    if (!initialBalancesData?.balances || !categories || categories.length === 0) {
      return { totalMargin: 0, totalPnl: 0, diff: 0 };
    }
    let totalMargin = 0;
    let totalPnl = 0;
    categories.forEach((cat: any) => {
      const tagName = cat.name;
      // 保证金
      const margin = initialBalancesData.balances[`${tagName}__margin`];
      if (margin !== undefined && margin !== null) totalMargin += Number(margin);
      // 盈亏：需要计算每个标签的 initialBalance - latestBalance
      const initialBalance = Number(initialBalancesData.balances[tagName] ?? 0);
      const ratio = Number(initialBalancesData.balances[`${tagName}__ratio`] ?? 100) / 100;
      // 找该标签最新的余额记录
      const tagTransactions = (activeMemberTransactions || []).flatMap((day: any) =>
        (day.records || []).filter((r: any) => r.category && r.category.includes(tagName))
          .map((r: any) => ({ date: day.date, amount: r.amount, type: r.type }))
      ).sort((a: any, b: any) => a.date.localeCompare(b.date));
      if (tagTransactions.length > 0) {
        const last = tagTransactions[tagTransactions.length - 1];
        const latestBalance = last.amount;
        if (initialBalance > 0) {
          totalPnl += (initialBalance - latestBalance) * ratio;
        }
      }
    });
    return { totalMargin, totalPnl, diff: totalMargin + totalPnl };
  }, [initialBalancesData, categories, activeMemberTransactions]);

  // ─── 统计数据 ─────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!filteredTransactions || filteredTransactions.length === 0) {
      return { latestBalance: 0, returnRate: 0, recordDays: 0, totalPnl: 0, initialBalance: 0 };
    }

    const sorted = [...filteredTransactions].sort((a, b) => a.date.localeCompare(b.date));
    const lastRecord = sorted[sorted.length - 1];
    // 最新余额 = 最后一天的余额快照（income 和 expense 只有一个有值）
    const latestBalance = lastRecord.income > 0 ? lastRecord.income : lastRecord.expense;
    const latestDate = lastRecord.date; // 最新余额登记日期
    const recordDays = filteredTransactions.length;
    // 初始金额：从 initialBalancesData 接口数据读取（当前选中标签对应的初始金额）
    let initialBalance = 0;
    if (selectedTag?.name && initialBalancesData?.balances) {
      const val = initialBalancesData.balances[selectedTag.name];
      if (val !== undefined && val !== null) {
        initialBalance = Number(val);
      }
    }
    // 初始比例权重（存在 balances[标签名__ratio]）
    let ratio = 1;
    if (selectedTag?.name && initialBalancesData?.balances) {
      const ratioVal = initialBalancesData.balances[`${selectedTag.name}__ratio`];
      if (ratioVal !== undefined && ratioVal !== null) {
        ratio = Number(ratioVal) / 100;
      }
    }
    // 开始日期（从 initialBalancesData 读取 tagName__startDate）
    let startDate = "";
    if (selectedTag?.name && initialBalancesData?.balances) {
      const sd = initialBalancesData.balances[`${selectedTag.name}__startDate`];
      if (sd) startDate = String(sd);
    }
    // 负债视角：最新余额变大表示亏损（-），变小表示盈利（+），乘以权重
    const rawPnl = initialBalance - latestBalance;
    const totalPnl = rawPnl * ratio;
    const returnRate = initialBalance > 0 ? (rawPnl / initialBalance) * 100 : 0;
    return { latestBalance, latestDate, returnRate, recordDays, totalPnl, initialBalance, startDate };
  }, [filteredTransactions, cumulativeMap, ledgerData, initialBalancesData, selectedTag]);

  // ─── 余额曲线数据（根据日历模式生成对应时间范围内所有日期点） ─────────
  const chartData = useMemo(() => {
    const { year, month } = calendarDate;
    const sorted = [...filteredTransactions].sort((a, b) => a.date.localeCompare(b.date));

    if (calendarMode === "balance" || calendarMode === "daily") {
      // 余额/日模式：只保留当月有数据的交易日，去除空白间隔，折线图连续显示
      const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
      // 只取当月有数据的日期，按日期升序排列
      const monthDays = sorted
        .filter((d) => d.date.startsWith(monthPrefix))
        .sort((a, b) => a.date.localeCompare(b.date));
      return monthDays.map((d) => {
        const day = parseInt(d.date.slice(8), 10);
        return {
          date: `${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
          balance: cumulativeMap.get(d.date) ?? null,
          pnl: d.income - d.expense,
        };
      });
    } else if (calendarMode === "monthly") {
      // 月模式：取当月最后一天的余额快照作为该月余额
      return Array.from({ length: 12 }, (_, i) => {
        const m = i + 1;
        const prefix = `${year}-${String(m).padStart(2, "0")}`;
        const monthData = sorted.filter((d) => d.date.startsWith(prefix));
        if (monthData.length === 0) return { date: `${m}月`, balance: null, pnl: null };
        // 取当月最后一天的余额快照
        const lastDay = monthData[monthData.length - 1];
        const lastBalance = lastDay.income > 0 ? lastDay.income : lastDay.expense;
        return {
          date: `${m}月`,
          balance: lastBalance,
          pnl: lastBalance,
        };
      });
    }
    // 年模式：显示全部数据，每天直接取余额快照
    return sorted.map((d) => ({
      date: d.date.slice(5),
      balance: d.income > 0 ? d.income : d.expense,
      pnl: d.income - d.expense,
    }));
  }, [filteredTransactions, cumulativeMap, calendarMode, calendarDate, dayMap]);

  // ─── 当前月日历格子 ────────────────────────────────────────────────────────
  const calendarCells = useMemo(() => {
    const { year, month } = calendarDate;
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }, [calendarDate]);

  // ─── 辅助函数 ──────────────────────────────────────────────────────────────
  const formatMoney = (v: number) => {
    // 日历格子：超过1万用「万」缩写，保留2位小数
    const abs = Math.abs(v);
    if (abs >= 100000000) return (abs / 100000000).toFixed(2) + '亿';
    if (abs >= 10000) return (abs / 10000).toFixed(2) + '万';
    return abs.toFixed(2);
  };

  const getDateStr = (day: number) => {
    const { year, month } = calendarDate;
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };

  // 获取某天相对上一个有数据日期的差値
  const getDailyDiff = (dateStr: string): number | null => {
    if (!cumulativeMap.has(dateStr)) return null;
    const currentVal = cumulativeMap.get(dateStr)!;
    // 按日期升序排列所有有数据的日期
    const allDates = Array.from(cumulativeMap.keys()).sort();
    const idx = allDates.indexOf(dateStr);
    if (idx <= 0) return null; // 第一条数据无差値
    const prevDate = allDates[idx - 1];
    const prevVal = cumulativeMap.get(prevDate)!;
    return currentVal - prevVal;
  };

  const getCellValue = (day: number): string | null => {
    const dateStr = getDateStr(day);
    const data = dayMap.get(dateStr);
    if (!data) return null;

    if (calendarMode === "balance") {
      // 显示当天绝对金额（当天支出+收入的绝对值之和）
      const dayData = dayMap.get(dateStr);
      if (!dayData) return null;
      const dayTotal = dayData.expense + dayData.income;
      return dayTotal > 0 ? formatMoney(dayTotal) : null;
    }
    if (calendarMode === "daily") {
      // 当天绝对金额 - 前一天绝对金额的差值
      const todayData = dayMap.get(dateStr);
      if (!todayData) return null;
      const todayTotal = todayData.expense + todayData.income;
      // 找前一个有数据的日期
      const allDates = Array.from(dayMap.keys()).sort();
      const idx = allDates.indexOf(dateStr);
      if (idx <= 0) return formatMoney(todayTotal); // 第一条数据直接显示当天金额
      const prevDate = allDates[idx - 1];
      const prevData = dayMap.get(prevDate)!;
      const prevTotal = prevData.expense + prevData.income;
      const diff = todayTotal - prevTotal;
      const sign = diff > 0 ? "+" : diff < 0 ? "-" : "";
      return sign + formatMoney(Math.abs(diff));
    }
    if (calendarMode === "monthly") {
      const { year, month } = calendarDate;
      const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
      let total = 0;
      dayMap.forEach((v, k) => {
        if (k.startsWith(prefix)) total += v.income - v.expense;
      });
      return formatMoney(total);
    }
    if (calendarMode === "yearly") {
      const { year } = calendarDate;
      let total = 0;
      dayMap.forEach((v, k) => {
        if (k.startsWith(String(year))) total += v.income - v.expense;
      });
      return formatMoney(total);
    }
    return null;
  };

  const getCellPnl = (day: number): number | null => {
    const data = dayMap.get(getDateStr(day));
    if (!data) return null;
    return data.income - data.expense;
  };

  const today = new Date();
  const isToday = (day: number) =>
    today.getFullYear() === calendarDate.year &&
    today.getMonth() === calendarDate.month &&
    today.getDate() === day;

  // ─── A股非交易日判断 ───────────────────────────────────────────────────────
  // 2026年法定节假日休市日（不含周末）
  const HOLIDAY_MAP_2026: Record<string, string> = {
    // 元旦 1/1-1/3
    '2026-01-01': '元旦', '2026-01-02': '元旦', '2026-01-03': '元旦',
    // 春节 2/15-2/23
    '2026-02-15': '春节', '2026-02-16': '春节', '2026-02-17': '春节',
    '2026-02-18': '春节', '2026-02-19': '春节', '2026-02-20': '春节',
    '2026-02-21': '春节', '2026-02-22': '春节', '2026-02-23': '春节',
    // 清明节 4/4-4/6
    '2026-04-04': '清明节', '2026-04-05': '清明节', '2026-04-06': '清明节',
    // 劳动节 5/1-5/5
    '2026-05-01': '劳动节', '2026-05-02': '劳动节', '2026-05-03': '劳动节',
    '2026-05-04': '劳动节', '2026-05-05': '劳动节',
    // 端午节 6/19-6/21
    '2026-06-19': '端午节', '2026-06-20': '端午节', '2026-06-21': '端午节',
    // 中秋节 9/25-9/27
    '2026-09-25': '中秋节', '2026-09-26': '中秋节', '2026-09-27': '中秋节',
    // 国庆节 10/1-10/7
    '2026-10-01': '国庆节', '2026-10-02': '国庆节', '2026-10-03': '国庆节',
    '2026-10-04': '国庆节', '2026-10-05': '国庆节', '2026-10-06': '国庆节',
    '2026-10-07': '国庆节',
  };
  // 上交所官方通知确认：A股周六、周日一律休市，无例外。
  // 调休上班日虽然居民要上班，但上交所均明确标注「周末休市」，不开盘。
  // 故此列表为空。
  const MAKEUP_WORKDAYS_2026 = new Set<string>([]);

  // 判断某天是否为A股非交易日，返回标注文字或null
  const getNonTradingLabel = (day: number): string | null => {
    const { year, month } = calendarDate;
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    // 先检查调休上班日（周末但开盘，不标注）
    if (MAKEUP_WORKDAYS_2026.has(dateStr)) return null;
    // 检查法定节假日
    if (HOLIDAY_MAP_2026[dateStr]) return HOLIDAY_MAP_2026[dateStr];
    // 检查周末
    const d = new Date(year, month, day);
    const dow = d.getDay();
    if (dow === 0) return '周日';
    if (dow === 6) return '周六';
    return null;
  };

  // 点击日历格子：已有记录则跳转编辑，否则跳转新增
  const handleDayClick = (day: number) => {
    if (!canEdit) return; // 普通用户不可操作
    const dateStr = getDateStr(day);
    const existing = dayMap.get(dateStr);
    if (existing && existing.records.length > 0) {
      // 已有记录：跳转编辑第一条记录
      const recordId = existing.records[0].id;
      setLocation(`/ledger/${ledgerId}/add?edit=${recordId}`);
    } else {
      // 无记录：跳转新增
      let url = `/ledger/${ledgerId}/add?date=${dateStr}`;
      if (selectedTagId) url += `&categoryId=${selectedTagId}`;
      setLocation(url);
    }
  };

  // ─── 渲染 ──────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: "#FAF3ED" }}>
      {/* ── 顶部红色区域 ── */}
      <div style={{ backgroundColor: "#D32F2F", color: "#FFFFFF" }}>
        {/* 用户信息行 + 标签下拉（直接顶部，无返回栏） */}
        <div className="px-4 pt-3 pb-2 flex items-center gap-3">
          {/* 头像（管理员可点击切换视角） */}
          <div
            className="flex-shrink-0 relative"
            onClick={() => { if (canEdit) { setViewAsSearch(''); setShowViewAsPicker(true); } }}
            style={{ cursor: canEdit ? 'pointer' : 'default' }}
          >
            {(() => {
              const viewTarget = viewAsUserId ? (membersData || []).find((m: any) => m.userId === viewAsUserId) : null;
              return viewTarget ? (
                <UserAvatar username={viewTarget.username} avatar={viewTarget.avatar} nickname={viewTarget.nickname} size="lg" />
              ) : user ? (
                <UserAvatar username={user.username} avatar={user.avatar} nickname={user.nickname} size="lg" />
              ) : (
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold" style={{ backgroundColor: "rgba(255,255,255,0.3)" }}>?</div>
              );
            })()}
            {canEdit && !viewAsUserId && (
              <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-white/90 flex items-center justify-center">
                <Users className="w-2.5 h-2.5" style={{ color: '#D32F2F' }} />
              </div>
            )}
          </div>

          {/* 用户名 + 操作按鈕 + 标签下拉（同行） */}
          <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
            <div className="flex flex-col min-w-0">
            <div className="text-base font-semibold truncate">
              {(() => {
                const viewTarget = viewAsUserId ? (membersData || []).find((m: any) => m.userId === viewAsUserId) : null;
                return viewTarget ? (viewTarget.nickname || viewTarget.username) : (user?.nickname || user?.username || "用户");
              })()}
            </div>
            {viewAsUserId && (
              <div className="text-xs opacity-70 flex items-center gap-1">
                <span>查看视角</span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleSwitchView(null); }}
                  className="ml-1 px-1.5 py-0.5 rounded-full text-xs"
                  style={{ backgroundColor: 'rgba(255,255,255,0.25)', color: '#fff' }}
                >返回自己</button>
              </div>
            )}
            </div>

            {/* 右侧：操作按鈕 + 返回按鈕 + 标签下拉 */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {canEdit && (
                <button
                  onClick={() => setLocation(`/ledger/${ledgerId}/filter`)}
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
                >
                  <Search className="w-3.5 h-3.5 text-white" />
                </button>
              )}
              {canEdit && (
                <button
                  onClick={() => setLocation(`/ledger/${ledgerId}/report`)}
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
                >
                  <BarChart3 className="w-3.5 h-3.5 text-white" />
                </button>
              )}
              {canEdit && (
                <button
                  onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
                >
                  <Settings className="w-3.5 h-3.5 text-white" />
                </button>
              )}
              {/* 返回按钮：椭圆形，点击返回账本首页 */}
              <button
                onClick={() => setLocation("/ledger")}
                className="flex items-center justify-center px-3 h-7 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: "rgba(255,255,255,0.9)",
                  color: "#D32F2F",
                  border: "1px solid rgba(255,255,255,0.4)",
                  minWidth: "44px",
                }}
              >
                返回
              </button>

            {/* 标签下拉选择器 */}
            {categories && categories.length > 0 && (
              <div className="relative flex-shrink-0">
                <button
                  onClick={() => setShowTagDropdown(!showTagDropdown)}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium transition-all"
                  style={{
                    backgroundColor: selectedTag ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.2)",
                    color: selectedTag ? "#D32F2F" : "#FFFFFF",
                    border: "1px solid rgba(255,255,255,0.4)",
                  }}
                >
                  <span>{selectedTag?.name || "标签"}</span>
                  <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
                </button>

                {showTagDropdown && (
                  <>
                    {/* 遮罩 */}
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowTagDropdown(false)}
                    />
                    {/* 下拉菜单 */}
                    <div
                      className="absolute right-0 top-full mt-1 rounded-xl shadow-lg z-50 overflow-hidden"
                      style={{
                        backgroundColor: "#FFFFFF",
                        border: "1px solid #E0E0E0",
                        minWidth: "140px",
                      }}
                    >
                      {/* 全部（不筛选） */}
                      <button
                        onClick={() => { setSelectedTagId(null); setShowTagDropdown(false); }}
                        className="w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-[#FFEBEE]"
                        style={{
                          color: selectedTagId === null ? "#D32F2F" : "#222222",
                          fontWeight: selectedTagId === null ? 600 : 400,
                          borderBottom: "1px solid #F5F5F5",
                        }}
                      >
                        全部
                      </button>
                      {categories.map((cat: any) => (
                        <button
                          key={cat.id}
                          onClick={() => { setSelectedTagId(cat.id); setShowTagDropdown(false); }}
                          className="w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-[#FFEBEE]"
                          style={{
                            color: selectedTagId === cat.id ? "#D32F2F" : "#222222",
                            fontWeight: selectedTagId === cat.id ? 600 : 400,
                            borderBottom: "1px solid #F5F5F5",
                          }}
                        >
                          {cat.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            </div>{/* end: 操作按钮+标签容器 */}
          </div>
        </div>

        {/* 4个统计卡片 */}
        <div className="px-4 pb-3 grid grid-cols-2 gap-2">
          {selectedTagId === null ? (
            /* ─── 全部模式：保证金总和 + 盈亏总和 + 差値 ─── */
            <>
              <div className="rounded-xl p-2" style={{ backgroundColor: "rgba(255,255,255,0.12)" }}>
                <div className="text-xs opacity-75 mb-0.5">保证金总计</div>
                <div className="text-base font-bold">
                  ¥{allTagsStats.totalMargin.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-xs opacity-60 mt-0.5">全部标签保证金之和</div>
              </div>
              <div className="rounded-xl p-2" style={{ backgroundColor: "rgba(255,255,255,0.12)" }}>
                <div className="text-xs opacity-75 mb-0.5">盈亏总计</div>
                <div className="text-base font-bold">
                  {allTagsStats.totalPnl > 0 ? '+' : ''}¥{allTagsStats.totalPnl.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-xs opacity-60 mt-0.5">全部标签盈亏之和</div>
              </div>
              <div className="col-span-2 rounded-xl p-2" style={{ backgroundColor: "rgba(255,255,255,0.12)" }}>
                <div className="text-xs opacity-75 mb-0.5">差値（保证金 + 盈亏）</div>
                <div className="text-base font-bold">
                  {allTagsStats.diff > 0 ? '+' : ''}¥{allTagsStats.diff.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-xs opacity-60 mt-0.5">当前实际保证金余额</div>
              </div>
            </>
          ) : (
            /* ─── 单标签模式：最新余额 + 保证金 + 初始金额 + 累计盈亏 ─── */
            <>
          {/* 最新余额 */}
          <div className="rounded-xl p-2" style={{ backgroundColor: "rgba(255,255,255,0.12)" }}>
            <div className="text-xs opacity-75 mb-0.5">最新余额</div>
            <div className="text-base font-bold">
              ¥{stats.latestBalance.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            {stats.latestDate && (
              <div className="text-xs opacity-60 mt-0.5">
                {(() => {
                  const [y, m, d] = stats.latestDate.split("-");
                  return `${y}年${m}月${d}日`;
                })()}
              </div>
            )}
          </div>

          {/* 保证金 + 比例 */}
          <div className="rounded-xl p-2" style={{ backgroundColor: "rgba(255,255,255,0.12)" }}>
            <div className="text-xs opacity-75 mb-0.5">保证金</div>
            <div className="text-base font-bold">
              {(() => {
                const tagName = selectedTag?.name;
                if (!tagName || !initialBalancesData?.balances) return '未设置';
                const val = initialBalancesData.balances[`${tagName}__margin`];
                if (val === undefined || val === null) return '未设置';
                return '¥' + Number(val).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              })()}
            </div>
            <div className="text-xs opacity-60 mt-0.5">
              {(() => {
                const tagName = selectedTag?.name;
                if (!tagName || !initialBalancesData?.balances) return '';
                const val = initialBalancesData.balances[`${tagName}__ratio`];
                if (val === undefined || val === null) return '';
                return `比例 ${Number(val).toFixed(0)}%`;
              })()}
            </div>
          </div>

          {/* 初始金额 */}
          <div className="rounded-xl p-2" style={{ backgroundColor: "rgba(255,255,255,0.12)" }}>
            <div className="text-xs opacity-75 mb-0.5">初始金额</div>
            <div className="text-base font-bold">
              {(() => {
                const tagName = selectedTag?.name;
                if (!tagName || !initialBalancesData?.balances) return '未设置';
                const val = initialBalancesData.balances[tagName];
                if (val === undefined || val === null) return '未设置';
                return '¥' + Number(val).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              })()}
            </div>
            {stats.startDate && (
              <div className="text-xs opacity-60 mt-0.5">
                {(() => {
                  const [y, m, d] = stats.startDate.split("-");
                  return `${y}年${m}月${d}日`;
                })()}
              </div>
            )}
          </div>

          {/* 累计盈亏 */}
          <div className="rounded-xl p-2" style={{ backgroundColor: "rgba(255,255,255,0.12)" }}>
            <div className="text-xs opacity-75 mb-0.5">累计盈亏</div>
            <div
              className="text-base font-bold"
              style={{ color: "#FFFFFF" }}
            >
              {stats.totalPnl > 0 ? "+" : stats.totalPnl < 0 ? "-" : ""}¥{Math.abs(stats.totalPnl).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-xs opacity-60 mt-0.5">
              收益率 {stats.returnRate >= 0 ? "+" : ""}{stats.returnRate.toFixed(2)}%
            </div>
          </div>
            </>
          )}
        </div>
      </div>

      {/* ── 可滚动内容区域（全部模式下隐藏） ── */}
      <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch', display: selectedTagId === null ? 'none' : undefined }}>

      {/* ── 日历视图 ── */}
      <div className="mx-3 mt-2 rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: "#FFFFFF" }}>
        <div className="px-3 pt-3 pb-2">
          {/* 月份导航 + 视图切换 */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setCalendarDate((prev) => {
                    let m = prev.month - 1, y = prev.year;
                    if (m < 0) { m = 11; y--; }
                    return { year: y, month: m };
                  })
                }
                className="w-6 h-6 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "#FFEBEE" }}
              >
                <ChevronLeft className="w-3.5 h-3.5" style={{ color: "#D32F2F" }} />
              </button>
              <span
                className="text-sm font-semibold whitespace-nowrap"
                style={{ color: "#222222", minWidth: "72px", textAlign: "center" }}
              >
                {calendarDate.year}年{calendarDate.month + 1}月
              </span>
              <button
                onClick={() =>
                  setCalendarDate((prev) => {
                    let m = prev.month + 1, y = prev.year;
                    if (m > 11) { m = 0; y++; }
                    return { year: y, month: m };
                  })
                }
                className="w-6 h-6 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "#FFEBEE" }}
              >
                <ChevronRight className="w-3.5 h-3.5" style={{ color: "#D32F2F" }} />
              </button>
            </div>

            {/* 视图切换 */}
            <div className="flex items-center gap-1 flex-nowrap justify-end">
              {(["balance", "daily", "monthly", "yearly"] as const).map((mode) => {
                const active = calendarMode === mode;
                return (
                  <button
                    key={mode}
                    onClick={() => setCalendarMode(mode)}
                    className="px-2 py-1 rounded-lg text-xs font-medium transition-all flex items-center justify-center"
                    style={{
                      backgroundColor: active ? "#D32F2F" : "#F5F5F5",
                      color: active ? "#FFFFFF" : "#757575",
                    }}
                  >
                    {mode === "balance" ? (
                      <CircleDollarSign className="w-3.5 h-3.5" />
                    ) : (
                      { daily: "日", monthly: "月", yearly: "年" }[mode]
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 日视图 / 月视图 / 年视图 */}
          {(calendarMode === "balance" || calendarMode === "daily") && (
            <>
              {/* 星期标题 */}
              <div className="grid grid-cols-7 mb-0.5">
                {["日", "一", "二", "三", "四", "五", "六"].map((d) => (
                  <div key={d} className="text-center text-xs py-1" style={{ color: "#757575" }}>
                    {d}
                  </div>
                ))}
              </div>
              {/* 日历格子 */}
              <div className="grid grid-cols-7 gap-0.5" style={{ gridAutoRows: '1fr' }}>
                {calendarCells.map((day, idx) => {
                  if (day === null) return <div key={`empty-${idx}`} style={{ height: '44px' }} />;
                  const nonTradingLabel = getNonTradingLabel(day);
                  const isNonTrading = nonTradingLabel !== null;
                  const cellValue = getCellValue(day);
                  const hasRecord = cellValue !== null;
                  const todayMark = isToday(day);
                  // 字体颜色逻辑
                  let valueColor = "#D32F2F";
                  if (hasRecord) {
                    const dateStr = getDateStr(day);
                    if (calendarMode === "daily") {
                      // 日模式：当天金额与前一天差値的正负
                      const todayData = dayMap.get(dateStr);
                      const allDates = Array.from(dayMap.keys()).sort();
                      const idx2 = allDates.indexOf(dateStr);
                      if (todayData && idx2 > 0) {
                        const prevData = dayMap.get(allDates[idx2 - 1])!;
                        const diff = (todayData.expense + todayData.income) - (prevData.expense + prevData.income);
                        valueColor = diff > 0 ? "#D32F2F" : diff < 0 ? "#4CAF50" : "#9E9E9E";
                      } else {
                        valueColor = "#9E9E9E";
                      }
                    } else {
                      // 余额模式：初始日黑色，之后每天与前一天比较
                      const allDates = Array.from(dayMap.keys()).sort();
                      const idx2 = allDates.indexOf(dateStr);
                      // 判断是否为初始日：该标签的 startDate，或者是第一条数据
                      const tagStartDate = selectedTag?.name && initialBalancesData?.balances
                        ? String(initialBalancesData.balances[`${selectedTag.name}__startDate`] ?? '')
                        : '';
                      const isFirstRecord = idx2 === 0;
                      const isStartDate = tagStartDate && dateStr === tagStartDate;
                      if (isFirstRecord || isStartDate) {
                        valueColor = "#222222"; // 初始日黑色
                      } else if (idx2 > 0) {
                        const todayData = dayMap.get(dateStr)!;
                        const prevData = dayMap.get(allDates[idx2 - 1])!;
                        const todayTotal = todayData.expense + todayData.income;
                        const prevTotal = prevData.expense + prevData.income;
                        const diff = todayTotal - prevTotal;
                        valueColor = diff > 0 ? "#D32F2F" : diff < 0 ? "#4CAF50" : "#9E9E9E";
                      }
                    }
                  }
                  // 非交易日样式
                  const cellBg = isNonTrading
                    ? '#F0F0F0'
                    : todayMark ? '#FFF3E0' : '#F9F9F9';
                  const cellBorder = isNonTrading
                    ? '1px solid #E0E0E0'
                    : todayMark ? '1.5px solid #D32F2F' : '1px solid #F0F0F0';
                  const dayNumColor = isNonTrading
                    ? '#BDBDBD'
                    : todayMark ? '#D32F2F' : '#222222';

                  return (
                    <button
                      key={day}
                      onClick={() => isNonTrading ? undefined : handleDayClick(day)}
                      disabled={isNonTrading}
                      className="rounded-lg flex flex-col items-center justify-center transition-all active:scale-95"
                      style={{
                        height: '36px',
                        backgroundColor: cellBg,
                        border: cellBorder,
                        padding: '2px 1px',
                        cursor: isNonTrading ? 'default' : 'pointer',
                      }}
                    >
                      <span style={{ fontSize: '10px', fontWeight: 500, lineHeight: 1, marginBottom: '1px', color: dayNumColor }}>{day}</span>
                      {isNonTrading ? (
                        <span style={{ fontSize: '7px', fontWeight: 400, lineHeight: 1.1, color: '#BDBDBD', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', textAlign: 'center' }}>
                          {nonTradingLabel}
                        </span>
                      ) : hasRecord ? (
                        <span style={{ fontSize: '8px', fontWeight: 600, lineHeight: 1.1, color: valueColor, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', textAlign: 'center' }}>
                          {cellValue}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* 月视图：12个月份格 - 显示该月最后一条与上一个有数据月的最后一条的差値 */}
          {calendarMode === "monthly" && (() => {
            const { year } = calendarDate;
            const months = Array.from({ length: 12 }, (_, i) => i + 1);
            // 按日期升序排列所有数据
            const sorted = [...filteredTransactions].sort((a, b) => a.date.localeCompare(b.date));
            // 整个账本只有一条数据时，所有月都不显示差値
            const totalCount = sorted.length;
            // 每个月的最后一条数据的累计余额
            const monthLastCum = new Map<string, number>();
            sorted.forEach((d) => {
              const ym = d.date.slice(0, 7);
              monthLastCum.set(ym, cumulativeMap.get(d.date) ?? 0);
            });
            // 所有有数据的月份（升序）
            const allMonths = Array.from(monthLastCum.keys()).sort();
            return (
              <div className="grid grid-cols-4 gap-1.5">
                {months.map((m) => {
                  const ym = `${year}-${String(m).padStart(2, "0")}`;
                  const hasData = monthLastCum.has(ym);
                  const nowM = new Date().getMonth() + 1;
                  const nowY = new Date().getFullYear();
                  const isCurrent = year === nowY && m === nowM;
                  // 计算差値：该月最后一条 - 上一个有数据月的最后一条
                  let diff: number | null = null;
                  if (hasData && totalCount > 1) {
                    const idx = allMonths.indexOf(ym);
                    if (idx > 0) {
                      const prevYm = allMonths[idx - 1];
                      diff = (monthLastCum.get(ym) ?? 0) - (monthLastCum.get(prevYm) ?? 0);
                    }
                    // idx === 0 表示是第一个月，但如果还有后续月也不显示（无前序可比）
                  }
                  const sign = diff !== null ? (diff > 0 ? "+" : diff < 0 ? "-" : "") : "";
                  const color = diff !== null ? (diff > 0 ? "#4CAF50" : diff < 0 ? "#F44336" : "#9E9E9E") : "#9E9E9E";
                  return (
                    <div
                      key={m}
                      className="rounded-lg flex flex-col items-center justify-center py-2"
                      style={{
                        height: '52px',
                        backgroundColor: hasData ? "#FFEBEE" : "#F9F9F9",
                        border: isCurrent ? "1.5px solid #D32F2F" : "1px solid #F0F0F0",
                      }}
                    >
                      <span className="text-xs font-medium" style={{ color: isCurrent ? "#D32F2F" : "#222222" }}>{m}月</span>
                      {diff !== null && (
                        <span className="font-semibold mt-0.5" style={{ fontSize: "9px", color }}>
                          {sign}{String(Math.floor(Math.abs(diff)))}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* 年视图：显示所有有数据的年份，显示该年所有记录的净盈亏总和 */}
          {calendarMode === "yearly" && (() => {
            const sorted = [...filteredTransactions].sort((a, b) => a.date.localeCompare(b.date));
            // 按年汇总每年的净盈亏（income - expense）
            const yearNetMap = new Map<string, number>();
            sorted.forEach((d) => {
              const y = d.date.slice(0, 4);
              yearNetMap.set(y, (yearNetMap.get(y) ?? 0) + (d.income - d.expense));
            });
            const allYears = Array.from(yearNetMap.keys()).sort();
            if (allYears.length === 0) return <div className="text-xs text-gray-400 py-4 text-center">暂无数据</div>;
            const nowY = String(new Date().getFullYear());
            return (
              <div className="grid grid-cols-3 gap-1.5">
                {allYears.map((y) => {
                  const net = yearNetMap.get(y) ?? 0;
                  const sign = net > 0 ? "+" : net < 0 ? "-" : "";
                  const color = net > 0 ? "#D32F2F" : net < 0 ? "#4CAF50" : "#9E9E9E";
                  return (
                    <div
                      key={y}
                      className="rounded-lg flex flex-col items-center justify-center py-2"
                      style={{
                        height: '52px',
                        backgroundColor: "#F9F9F9",
                        border: y === nowY ? "1.5px solid #D32F2F" : "1px solid #F0F0F0",
                      }}
                    >
                      <span className="text-xs font-medium" style={{ color: y === nowY ? "#D32F2F" : "#222222" }}>{y}年</span>
                      <span className="font-semibold mt-0.5" style={{ fontSize: "9px", color }}>
                        {sign}{formatMoney(Math.abs(net))}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>

      {/* ── 余额变化曲线 ── */}
      <div
        className="mx-3 mt-2 rounded-2xl shadow-sm mb-4"
        style={{ backgroundColor: "#FFFFFF" }}
      >
        {/* 头部：标题 + 最新余额展示 */}
        <div className="px-4 pt-4 pb-2 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold" style={{ color: "#1A1A1A" }}>余额走势</span>
              {selectedTag && (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: "#FFEBEE", color: "#D32F2F" }}>
                  {selectedTag.name}
                </span>
              )}
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: "#9E9E9E" }}>
              {calendarMode === 'balance' ? '当月日度余额变化' : calendarMode === 'daily' ? '当月日盈亏走势' : calendarMode === 'monthly' ? '全年月度盈亏' : '全部记录余额走势'}
            </div>
          </div>
          {/* 日盈亏模式：显示当月所有交易日盈亏累加总和；月/年模式：显示区间变化；余额模式：不显示数字 */}
          {calendarMode === 'daily' && (() => {
            // 日盈亏模式：当月所有交易日的 pnl 累加总和
            const { year, month } = calendarDate;
            const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
            const totalPnl = filteredTransactions
              .filter((d) => d.date.startsWith(monthPrefix))
              .reduce((sum, d) => sum + (d.income - d.expense), 0);
            const isUp = totalPnl >= 0;
            return (
              <div className="text-right">
                <div className="text-base font-bold" style={{ color: isUp ? "#D32F2F" : "#4CAF50" }}>
                  {isUp ? '+' : ''}¥{totalPnl.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[10px]" style={{ color: "#9E9E9E" }}>当月盈亏合计</div>
              </div>
            );
          })()}
          {(calendarMode === 'monthly' || calendarMode === 'yearly') && chartData.filter((d: any) => d.balance !== null).length > 0 && (() => {
            const validPoints = chartData.filter((d: any) => d.balance !== null);
            const latest = validPoints[validPoints.length - 1];
            const first = validPoints[0];
            const diff = latest.balance - first.balance;
            const isUp = diff >= 0;
            return (
              <div className="text-right">
                <div className="text-base font-bold" style={{ color: isUp ? "#D32F2F" : "#4CAF50" }}>
                  {isUp ? '+' : ''}¥{diff.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[10px]" style={{ color: "#9E9E9E" }}>区间变化</div>
              </div>
            );
          })()}
        </div>

        {chartData.filter((d: any) => d.balance !== null).length === 0 ? (
          <div
            className="flex items-center justify-center py-12 text-sm"
            style={{ color: "#BDBDBD" }}
          >
            {selectedTag ? `「${selectedTag.name}」暂无记录` : "暂无数据，点击日历格子添加记录"}
          </div>
        ) : (
          <div className="px-1 pb-4">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData} margin={{ top: 12, right: 16, left: 0, bottom: 4 }}>
                <defs>
                  <linearGradient id="aaBalanceGradientUp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#D32F2F" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#D32F2F" stopOpacity={0.01} />
                  </linearGradient>
                  <linearGradient id="aaBalanceGradientDown" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4CAF50" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#4CAF50" stopOpacity={0.01} />
                  </linearGradient>
                  <filter id="chartGlow">
                    <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                    <feMerge>
                      <feMergeNode in="coloredBlur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="#F0F0F0" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 9, fill: "#BDBDBD", fontWeight: 400 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  padding={{ left: 8, right: 8 }}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: "#BDBDBD", fontWeight: 400 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) =>
                    Math.abs(v) >= 10000 ? `${(v / 10000).toFixed(1)}万` : String(v)
                  }
                  width={42}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1A1A1A",
                    border: "none",
                    borderRadius: "10px",
                    fontSize: "12px",
                    color: "#FFFFFF",
                    padding: "8px 12px",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
                  }}
                  labelStyle={{ color: "#9E9E9E", fontSize: "10px", marginBottom: 2 }}
                  itemStyle={{ color: "#FFFFFF", fontWeight: 600 }}
                  formatter={(value: number) => [
                    `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`,
                    "余额",
                  ]}
                  cursor={{ stroke: "rgba(211,47,47,0.3)", strokeWidth: 1, strokeDasharray: "4 2" }}
                />
                <Area
                  type="monotone"
                  dataKey="balance"
                  stroke="#D32F2F"
                  strokeWidth={2.5}
                  fill="url(#aaBalanceGradientUp)"
                  connectNulls={false}
                  dot={false}
                  activeDot={{
                    r: 5,
                    fill: "#FFFFFF",
                    stroke: "#D32F2F",
                    strokeWidth: 2.5,
                    filter: "url(#chartGlow)",
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      </div>{/* end 可滚动内容区域 */}

      {/* ── 视角切换弹窗（管理员/创建者点击头像弹出） ── */}
      {showViewAsPicker && canEdit && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={() => setShowViewAsPicker(false)}>
          <div
            className="w-full rounded-t-2xl overflow-hidden"
            style={{ backgroundColor: '#FFFFFF', maxHeight: '70vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* 弹窗标题 */}
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: '#F0F0F0' }}>
              <span className="text-base font-semibold" style={{ color: '#222' }}>切换视角</span>
              <button onClick={() => setShowViewAsPicker(false)}><X className="w-5 h-5" style={{ color: '#757575' }} /></button>
            </div>
            {/* 搜索框 */}
            <div className="px-4 py-2">
              <input
                type="text"
                placeholder="搜索成员..."
                value={viewAsSearch}
                onChange={e => setViewAsSearch(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ backgroundColor: '#F5F5F5', color: '#222', border: '1px solid #E0E0E0' }}
              />
            </div>
            {/* 成员列表 */}
            <div className="overflow-y-auto px-4 pb-6" style={{ maxHeight: '50vh' }}>
              {/* 返回自己视角 */}
              <button
                onClick={() => handleSwitchView(null)}
                className="w-full flex items-center gap-3 py-3 border-b"
                style={{ borderColor: '#F5F5F5' }}
              >
                <UserAvatar username={user?.username} avatar={user?.avatar} nickname={user?.nickname} size="md" />
                <div className="flex-1 text-left">
                  <div className="text-sm font-medium" style={{ color: '#222' }}>{user?.nickname || user?.username || '我自己'}</div>
                  <div className="text-xs" style={{ color: '#757575' }}>自己的视角</div>
                </div>
                {!viewAsUserId && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#D32F2F' }} />}
              </button>
              {/* 其他成员 */}
              {(membersData || [])
                .filter((m: any) => m.userId !== user?.id)
                .filter((m: any) => {
                  if (!viewAsSearch) return true;
                  const name = (m.nickname || m.username || '').toLowerCase();
                  return name.includes(viewAsSearch.toLowerCase());
                })
                .map((m: any) => (
                  <button
                    key={m.userId}
                    onClick={() => handleSwitchView(m.userId)}
                    className="w-full flex items-center gap-3 py-3 border-b"
                    style={{ borderColor: '#F5F5F5' }}
                  >
                    <UserAvatar username={m.username} avatar={m.avatar} nickname={m.nickname} size="md" />
                    <div className="flex-1 text-left">
                      <div className="text-sm font-medium" style={{ color: '#222' }}>{m.nickname || m.username}</div>
                      <div className="text-xs" style={{ color: '#757575' }}>{m.role === 'owner' ? '创建者' : m.role === 'admin' ? '管理员' : '成员'}</div>
                    </div>
                    {viewAsUserId === m.userId && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#D32F2F' }} />}
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 视角切换黄色横幅提示条（切换后底部显示） ── */}
      {viewAsUserId && canEdit && (
        <div
          className="fixed bottom-0 left-0 right-0 z-[60] flex items-center justify-between px-4 py-3"
          style={{ backgroundColor: '#F59E0B', color: '#1A2340' }}
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <Users className="w-4 h-4" />
            <span>正在以 {(() => {
              const t = (membersData || []).find((m: any) => m.userId === viewAsUserId);
              return t ? (t.nickname || t.username) : '未知用户';
            })()} 的视角查看</span>
          </div>
          <button
            onClick={() => handleSwitchView(null)}
            className="px-3 py-1 rounded-full text-xs font-medium"
            style={{ backgroundColor: 'rgba(255,255,255,0.9)', color: '#333' }}
          >
            切回我的视角
          </button>
        </div>
      )}

      {/* ── 悬浮加号按鈕（仅管理员/创建者可见，且「2026 AA」账本除外） ── */}
      {canEdit && !hideFloatingAddButton && (
        <button
          onClick={() => {
            let url = `/ledger/${ledgerId}/add`;
            if (selectedTagId) url += `?categoryId=${selectedTagId}`;
            setLocation(url);
          }}
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all inline-flex items-center justify-center"
          style={{ backgroundColor: "#D32F2F", color: "#FFFFFF" }}
        >
          <Plus className="w-6 h-6 text-white" />
        </button>
      )}
    </div>
  );
}
