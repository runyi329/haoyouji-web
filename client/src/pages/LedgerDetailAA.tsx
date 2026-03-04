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
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { UserAvatar } from "@/components/UserAvatar";
import { ChevronLeft, ChevronRight, Settings, Search, BarChart3, Plus, ChevronDown } from "lucide-react";
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
}: Props) {
  const [, setLocation] = useLocation();

  // 日历当前月份
  const [calendarDate, setCalendarDate] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  // 日历视图模式
  const [calendarMode, setCalendarMode] = useState<"balance" | "daily" | "monthly" | "yearly">("balance");

  // 标签（被记录者）选择
  const [selectedTagId, setSelectedTagId] = useState<number | null>(null);
  const [showTagDropdown, setShowTagDropdown] = useState(false);

  // 获取账本一级分类（标签）
  const { data: categories } = trpc.ledger.getCategories.useQuery(
    { ledgerId, parentId: null },
    { enabled: !!ledgerId }
  );

  // 当前选中的标签名
  const selectedTag = useMemo(() => {
    if (!selectedTagId || !categories) return null;
    return categories.find((c: any) => c.id === selectedTagId) || null;
  }, [selectedTagId, categories]);

  // ─── 按标签筛选 transactionsData ────────────────────────────────────────
  const filteredTransactions = useMemo(() => {
    if (!selectedTagId || !categories) return transactionsData || [];
    const tagName = selectedTag?.name;
    if (!tagName) return transactionsData || [];

    return (transactionsData || []).map((day) => {
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

      return {
        ...day,
        records: filtered,
        income,
        expense,
        balance: income - expense,
      };
    }).filter(Boolean) as DayGroup[];
  }, [transactionsData, selectedTagId, selectedTag, categories]);

  // ─── 将分组数据转换为按日期索引的 Map ────────────────────────────────────
  const dayMap = useMemo(() => {
    const map = new Map<string, DayGroup>();
    filteredTransactions.forEach((d) => {
      if (d.date) map.set(d.date, d);
    });
    return map;
  }, [filteredTransactions]);

  // ─── 计算累计余额（按日期升序累加）────────────────────────────────────────
  const cumulativeMap = useMemo(() => {
    const sorted = [...filteredTransactions].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    let running = 0;
    const cum = new Map<string, number>();
    sorted.forEach((d) => {
      running += d.income - d.expense;
      cum.set(d.date, running);
    });
    return cum;
  }, [filteredTransactions]);

  // ─── 统计数据 ─────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!filteredTransactions || filteredTransactions.length === 0) {
      return { latestBalance: 0, returnRate: 0, recordDays: 0, totalPnl: 0, initialBalance: 0 };
    }

    const sorted = [...filteredTransactions].sort((a, b) => a.date.localeCompare(b.date));
    const lastDate = sorted[sorted.length - 1].date;
    const latestBalance = cumulativeMap.get(lastDate) ?? 0;
    const recordDays = filteredTransactions.length;

    // 初始金额：从 description 中解析 "起始金额:XXXXX"
    let initialBalance = 0;
    const descMatch = ledgerData?.description?.match(/起始[金额]*[:：]\s*([\d,.]+)/);
    if (descMatch) {
      initialBalance = parseFloat(descMatch[1].replace(/,/g, ""));
    }

    const totalPnl = latestBalance - initialBalance;
    const returnRate = initialBalance > 0 ? (totalPnl / initialBalance) * 100 : 0;

    return { latestBalance, returnRate, recordDays, totalPnl, initialBalance };
  }, [filteredTransactions, cumulativeMap, ledgerData]);

  // ─── 余额曲线数据 ──────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const sorted = [...filteredTransactions].sort((a, b) => a.date.localeCompare(b.date));
    return sorted.map((d) => ({
      date: d.date.slice(5), // MM-DD
      balance: cumulativeMap.get(d.date) ?? 0,
      pnl: d.income - d.expense,
    }));
  }, [filteredTransactions, cumulativeMap]);

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
    if (Math.abs(v) >= 10000) return `${(v / 10000).toFixed(2)}万`;
    return v.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  const getDateStr = (day: number) => {
    const { year, month } = calendarDate;
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };

  const getCellValue = (day: number): string | null => {
    const dateStr = getDateStr(day);
    const data = dayMap.get(dateStr);
    if (!data) return null;

    if (calendarMode === "balance") {
      const cum = cumulativeMap.get(dateStr);
      return cum !== undefined ? formatMoney(cum) : null;
    }
    if (calendarMode === "daily") {
      const pnl = data.income - data.expense;
      return (pnl >= 0 ? "+" : "") + formatMoney(pnl);
    }
    if (calendarMode === "monthly") {
      const { year, month } = calendarDate;
      const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
      let total = 0;
      dayMap.forEach((v, k) => {
        if (k.startsWith(prefix)) total += v.income - v.expense;
      });
      return (total >= 0 ? "+" : "") + formatMoney(total);
    }
    if (calendarMode === "yearly") {
      const { year } = calendarDate;
      let total = 0;
      dayMap.forEach((v, k) => {
        if (k.startsWith(String(year))) total += v.income - v.expense;
      });
      return (total >= 0 ? "+" : "") + formatMoney(total);
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

  // 点击日历格子跳转添加账目，带上日期和标签分类
  const handleDayClick = (day: number) => {
    const dateStr = getDateStr(day);
    let url = `/ledger/${ledgerId}/add?date=${dateStr}`;
    if (selectedTagId) url += `&categoryId=${selectedTagId}`;
    setLocation(url);
  };

  // ─── 渲染 ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#FAF3ED" }}>
      {/* ── 顶部红色区域 ── */}
      <div style={{ backgroundColor: "#D32F2F", color: "#FFFFFF" }}>
        {/* 导航栏 */}
        <div className="px-4 pt-3 pb-2 flex items-center justify-between">
          <button
            onClick={() => setLocation("/ledger")}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <h1 className="text-base font-semibold flex-1 text-center mx-2 truncate">
            {ledgerData?.name || "定制账本"}
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLocation(`/ledger/${ledgerId}/filter`)}
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
            >
              <Search className="w-4 h-4 text-white" />
            </button>
            <button
              onClick={() => setLocation(`/ledger/${ledgerId}/report`)}
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
            >
              <BarChart3 className="w-4 h-4 text-white" />
            </button>
            <button
              onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
            >
              <Settings className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* 用户信息行 + 标签下拉 */}
        <div className="px-4 pb-4 flex items-center gap-3">
          {/* 头像 */}
          <div className="flex-shrink-0">
            {user ? (
              <UserAvatar
                username={user.username}
                avatar={user.avatar}
                nickname={user.nickname}
                size="lg"
              />
            ) : (
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold"
                style={{ backgroundColor: "rgba(255,255,255,0.3)" }}
              >
                ?
              </div>
            )}
          </div>

          {/* 用户名 + 标签下拉（同行） */}
          <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
            <div className="text-base font-semibold truncate">
              {user?.nickname || user?.username || "用户"}
            </div>

            {/* 标签下拉选择器 - 靠右 */}
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
                  <span>{selectedTag ? selectedTag.name : "选择被记录者"}</span>
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
                      className="absolute left-0 top-full mt-1 rounded-xl shadow-lg z-50 overflow-hidden"
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
          </div>
        </div>

        {/* 4个统计卡片 */}
        <div className="px-4 pb-5 grid grid-cols-2 gap-2.5">
          {/* 最新余额 */}
          <div className="rounded-xl p-3" style={{ backgroundColor: "rgba(255,255,255,0.12)" }}>
            <div className="text-xs opacity-75 mb-1">最新余额</div>
            <div className="text-lg font-bold">
              ¥{stats.latestBalance.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          {/* 收益率 */}
          <div className="rounded-xl p-3" style={{ backgroundColor: "rgba(255,255,255,0.12)" }}>
            <div className="text-xs opacity-75 mb-1">收益率</div>
            <div
              className="text-lg font-bold"
              style={{
                color: stats.returnRate > 0 ? "#4CAF50" : stats.returnRate < 0 ? "#F44336" : "#FFFFFF",
              }}
            >
              {stats.returnRate >= 0 ? "+" : ""}
              {stats.returnRate.toFixed(2)}%
            </div>
          </div>

          {/* 记录天数 */}
          <div className="rounded-xl p-3" style={{ backgroundColor: "rgba(255,255,255,0.12)" }}>
            <div className="text-xs opacity-75 mb-1">记录天数</div>
            <div className="text-lg font-bold">{stats.recordDays} 天</div>
          </div>

          {/* 累计盈亏 */}
          <div className="rounded-xl p-3" style={{ backgroundColor: "rgba(255,255,255,0.12)" }}>
            <div className="text-xs opacity-75 mb-1">累计盈亏</div>
            <div
              className="text-lg font-bold"
              style={{
                color: stats.totalPnl > 0 ? "#4CAF50" : stats.totalPnl < 0 ? "#F44336" : "#FFFFFF",
              }}
            >
              {stats.totalPnl >= 0 ? "+" : ""}¥
              {Math.abs(stats.totalPnl).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>

      {/* ── 日历视图 ── */}
      <div className="mx-3 mt-3 rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: "#FFFFFF" }}>
        <div className="px-4 pt-4 pb-3">
          {/* 月份导航 + 视图切换 */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setCalendarDate((prev) => {
                    let m = prev.month - 1, y = prev.year;
                    if (m < 0) { m = 11; y--; }
                    return { year: y, month: m };
                  })
                }
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "#FFEBEE" }}
              >
                <ChevronLeft className="w-4 h-4" style={{ color: "#D32F2F" }} />
              </button>
              <span
                className="text-sm font-semibold"
                style={{ color: "#222222", minWidth: "80px", textAlign: "center" }}
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
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "#FFEBEE" }}
              >
                <ChevronRight className="w-4 h-4" style={{ color: "#D32F2F" }} />
              </button>
            </div>

            {/* 视图切换 */}
            <div className="flex items-center gap-1 flex-wrap justify-end">
              {(["balance", "daily", "monthly", "yearly"] as const).map((mode) => {
                const labels = { balance: "余额", daily: "日盈亏", monthly: "月盈亏", yearly: "年盈亏" };
                const active = calendarMode === mode;
                return (
                  <button
                    key={mode}
                    onClick={() => setCalendarMode(mode)}
                    className="px-2 py-1 rounded-lg text-xs font-medium transition-all"
                    style={{
                      backgroundColor: active ? "#D32F2F" : "#F5F5F5",
                      color: active ? "#FFFFFF" : "#757575",
                    }}
                  >
                    {labels[mode]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 星期标题 */}
          <div className="grid grid-cols-7 mb-1">
            {["日", "一", "二", "三", "四", "五", "六"].map((d) => (
              <div key={d} className="text-center text-xs py-1" style={{ color: "#757575" }}>
                {d}
              </div>
            ))}
          </div>

          {/* 日历格子 */}
          <div className="grid grid-cols-7 gap-0.5">
            {calendarCells.map((day, idx) => {
              if (day === null) return <div key={`empty-${idx}`} className="aspect-square" />;

              const cellValue = getCellValue(day);
              const pnl = getCellPnl(day);
              const hasRecord = cellValue !== null;
              const todayMark = isToday(day);

              let valueColor = "#D32F2F";
              if (calendarMode !== "balance" && pnl !== null) {
                valueColor = pnl >= 0 ? "#4CAF50" : "#F44336";
              }

              return (
                <button
                  key={day}
                  onClick={() => handleDayClick(day)}
                  className="aspect-square rounded-lg flex flex-col items-center justify-center transition-all active:scale-95"
                  style={{
                    backgroundColor: hasRecord ? "#FFEBEE" : todayMark ? "#FFF3E0" : "#F9F9F9",
                    border: todayMark ? "1.5px solid #D32F2F" : "1px solid #F0F0F0",
                  }}
                >
                  <span
                    className="text-xs font-medium leading-none mb-0.5"
                    style={{ color: todayMark ? "#D32F2F" : "#222222" }}
                  >
                    {day}
                  </span>
                  {hasRecord && (
                    <span
                      className="leading-none font-semibold"
                      style={{ fontSize: "9px", color: valueColor }}
                    >
                      {cellValue}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── 余额变化曲线 ── */}
      <div
        className="mx-3 mt-3 rounded-2xl overflow-hidden shadow-sm mb-24"
        style={{ backgroundColor: "#FFFFFF" }}
      >
        <div className="px-4 pt-4 pb-4">
          <div className="text-sm font-semibold mb-0.5" style={{ color: "#222222" }}>
            余额变化曲线
            {selectedTag && (
              <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-full" style={{ backgroundColor: "#FFEBEE", color: "#D32F2F" }}>
                {selectedTag.name}
              </span>
            )}
          </div>
          <div className="text-xs mb-4" style={{ color: "#757575" }}>
            展示账户余额随时间的变化趋势
          </div>

          {chartData.length === 0 ? (
            <div
              className="flex items-center justify-center h-32 text-sm"
              style={{ color: "#757575" }}
            >
              {selectedTag ? `「${selectedTag.name}」暂无记录` : "暂无数据，点击日历格子添加记录"}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="aaBalanceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#D32F2F" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#D32F2F" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E0E0E0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "#757575" }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#757575" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) =>
                    Math.abs(v) >= 10000 ? `${(v / 10000).toFixed(0)}万` : String(v)
                  }
                  width={45}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#FFFFFF",
                    border: "1px solid #E0E0E0",
                    borderRadius: "8px",
                    fontSize: "12px",
                    color: "#222222",
                  }}
                  formatter={(value: number) => [
                    `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`,
                    "余额",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="balance"
                  stroke="#D32F2F"
                  strokeWidth={2}
                  fill="url(#aaBalanceGradient)"
                  dot={{ r: 3, fill: "#D32F2F", strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: "#D32F2F" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── 悬浮加号按钮 ── */}
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
    </div>
  );
}
