/**
 * 牙伴 - 首页日历区（日 / 周 / 月 三视角）
 * 日视角：今日预约列表 + 随访列表（默认）
 * 周视角：本周7天概览，每天显示预约数+随访数
 * 月视角：原有3D立体月历图（完整保留）
 */
import { useState, useRef, TouchEvent } from "react";
import { ChevronLeft, ChevronRight, Eye, EyeOff, Clock, Phone, ChevronRight as ArrowRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";

// ── 月视角 Tab 配置 ──────────────────────────────────────────────
const MONTH_TABS = [
  { id: "yuyue", label: "预约", unit: "", prefix: "" },
  { id: "suifang", label: "随访", unit: "", prefix: "" },
  { id: "yishoufei", label: "已收费", unit: "", prefix: "" },
  { id: "shishou", label: "实收业绩", unit: "", prefix: "\u00A5", isRevenue: true },
  { id: "xinzeng", label: "新增顾客", unit: "", prefix: "" },
];

// ── 工具函数 ─────────────────────────────────────────────────────
const WEEK_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

/** 获取某日期所在周的周一（ISO 周，周一为第一天） */
function getWeekMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=日 1=一 ... 6=六
  const diff = day === 0 ? -6 : 1 - day; // 调整到周一
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

// 预约状态中文
const APPT_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending:   { label: "待确认", color: "text-amber-500" },
  confirmed: { label: "已确认", color: "text-blue-500" },
  arrived:   { label: "已到诊", color: "text-green-600" },
  completed: { label: "已完成", color: "text-gray-400" },
  cancelled: { label: "已取消", color: "text-gray-300" },
};

// 随访状态中文
const FOLLOW_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending:   { label: "待随访", color: "text-amber-500" },
  done:      { label: "已完成", color: "text-green-600" },
  cancelled: { label: "已取消", color: "text-gray-300" },
};

// ── 视角类型 ─────────────────────────────────────────────────────
type ViewMode = "day" | "week" | "month";

// ══════════════════════════════════════════════════════════════════
// 日视角组件：驾驶舱工作台（点击卡片跳转详情）
// ══════════════════════════════════════════════════════════════════
function DayView({ viewDate, tenantId }: { viewDate: string; tenantId: number }) {
  const [, navigate] = useLocation();

  const { data, isLoading } = trpc.yabanComm.todayOverview.useQuery(
    { date: viewDate },
    { keepPreviousData: true }
  );

  const s = data?.stats;

  // 卡片配置（暂只显示今日预约）
  const cards = [
    {
      key: "appt",
      label: "今日预约",
      total: s?.apptTotal ?? 0,
      subs: [
        { label: "已到诊", val: s?.apptArrived ?? 0, color: "text-gray-600" },
        { label: "已确认", val: s?.apptConfirmed ?? 0, color: "text-gray-600" },
        { label: "待确认", val: s?.apptPending ?? 0, color: "text-gray-600" },
      ],
      gradient: "linear-gradient(135deg, #4DB8E8 0%, #2196C8 100%)",
      onClick: () => navigate(`/yaban/schedule?date=${viewDate}`),
    },
  ];

  return (
    <div
      className="px-3 pb-3 pt-2"
      style={{ background: "linear-gradient(180deg, #F8FBFF 0%, #F2F6FA 100%)" }}
    >
      <div className="grid grid-cols-3 gap-2">
        {cards.map((card) => (
          <button
            key={card.key}
            className="flex flex-col rounded-xl p-3 text-left active:opacity-80 transition-opacity"
            style={{
              background: "#fff",
              boxShadow: "0 2px 10px rgba(33,150,200,0.10), 0 1px 3px rgba(0,0,0,0.04)",
              borderTop: `3px solid transparent`,
              borderImage: `${card.gradient} 1`,
            }}
            onClick={card.onClick}
          >
            {/* 标题行 */}
            <div className="flex items-center justify-between w-full mb-1.5">
              <span className="text-[11px] text-gray-500 font-medium">{card.label}</span>
              <ArrowRight className="w-3 h-3 text-gray-300" />
            </div>
            {/* 主数字：加载中时显示占位符 */}
            <div
              className="text-2xl font-bold leading-none mb-2"
              style={{ background: card.gradient, WebkitBackgroundClip: "text", WebkitTextFillColor: isLoading ? "transparent" : "transparent" }}
            >
              {isLoading
                ? <span style={{ WebkitTextFillColor: "#ccc", background: "none" }}>—</span>
                : <>{card.total}{card.totalSuffix || ""}</>}
            </div>
            {/* 细分状态 */}
            <div className="space-y-0.5 w-full">
              {card.subs.map((sub) => (
                <div key={sub.label} className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">{sub.label}</span>
                  <span className={`text-[10px] font-semibold ${sub.color}`}>
                    {isLoading ? "—" : `${sub.prefix || ""}${sub.isAmount ? sub.val.toLocaleString() : sub.val}`}
                  </span>
                </div>
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// 周视角组件（接收 weekStart 由主组件控制）
// ══════════════════════════════════════════════════════════════════
function WeekView({ weekStart, tenantId }: { weekStart: string; tenantId: number }) {
  const today = new Date();
  const [, navigate] = useLocation();

  const { data } = trpc.yabanComm.weekOverview.useQuery(
    { weekStart },
    { keepPreviousData: true, enabled: tenantId > 0 }
  );

  const days = data?.days || [];
  const todayStr = toDateStr(today);

  return (
    <div>

      {/* 星期标题行 */}
      <div
        className="grid grid-cols-7 px-2 py-1.5"
        style={{
          background: "linear-gradient(180deg, #4DB8E8 0%, #5CC4F0 100%)",
          boxShadow: "0 3px 8px rgba(33, 150, 200, 0.15)",
        }}
      >
        {WEEK_LABELS.map((d) => (
          <div key={d} className="text-center text-[10px] font-bold text-white">{d}</div>
        ))}
      </div>

      {/* 7天格子 */}
      <div
        className="px-2 py-2"
        style={{ background: "linear-gradient(180deg, #F8FBFF 0%, #F2F6FA 100%)" }}
      >
        <div className="grid grid-cols-7 gap-1.5">
          {days.length === 0
            ? Array.from({ length: 7 }).map((_, i) => <div key={i} className="h-16 rounded bg-gray-100 animate-pulse" />)
            : days.map((day) => {
                const isToday = day.date === todayStr;
                const dateObj = new Date(day.date + "T00:00:00");
                const dateNum = dateObj.getDate();
                const hasAppt = day.appt > 0;
                const hasFollow = day.follow > 0;

                return (
                  <button
                    key={day.date}
                    className="flex flex-col items-center rounded-md overflow-hidden active:opacity-70 transition-opacity"
                    style={{
                      background: isToday
                        ? "linear-gradient(145deg, #E3F2FD, #BBDEFB)"
                        : "linear-gradient(145deg, #FFFFFF, #F5F8FC)",
                      boxShadow: isToday
                        ? "0 3px 8px rgba(33, 150, 200, 0.2), inset 0 1px 2px rgba(255,255,255,0.8)"
                        : "2px 2px 4px rgba(0,0,0,0.04), -1px -1px 3px rgba(255,255,255,0.8)",
                      border: isToday ? "1.5px solid #4DB8E8" : "1px solid rgba(0,0,0,0.03)",
                    }}
                    onClick={() => navigate(`/yaban/schedule?date=${day.date}`)}
                  >
                    {/* 帽檐：日期数字 */}
                    <div
                      className="w-full text-center py-1"
                      style={{
                        background: isToday
                          ? "linear-gradient(180deg, #4DB8E8, #3AA8D8)"
                          : "linear-gradient(180deg, #E8F0F8, #DCE8F2)",
                      }}
                    >
                      <span className={`text-[10px] font-bold ${isToday ? "text-white" : "text-gray-500"}`}>
                        {dateNum}
                      </span>
                    </div>

                    {/* 数据区 */}
                    <div className="flex-1 w-full flex flex-col items-center justify-center gap-0.5 py-1.5 px-0.5">
                      {hasAppt ? (
                        <div className="flex items-center gap-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
                          <span className="text-[10px] font-bold text-sky-600">{day.appt}</span>
                        </div>
                      ) : (
                        <div className="h-3.5" />
                      )}
                      {hasFollow ? (
                        <div className="flex items-center gap-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                          <span className="text-[10px] font-bold text-emerald-600">{day.follow}</span>
                        </div>
                      ) : (
                        <div className="h-3.5" />
                      )}
                    </div>
                  </button>
                );
              })}
        </div>

        {/* 图例 */}
        <div className="flex items-center gap-3 mt-2 px-1">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-sky-400" />
            <span className="text-[10px] text-gray-400">预约</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-[10px] text-gray-400">随访</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// 月视角组件（原有逻辑完整保留）
// ══════════════════════════════════════════════════════════════════
function MonthView({ currentYear, currentMonth, prevMonth, nextMonth, showRevenue, setShowRevenue }: {
  currentYear: number; currentMonth: number;
  prevMonth: () => void; nextMonth: () => void;
  showRevenue: boolean; setShowRevenue: (v: boolean) => void;
  tenantId: number;
}) {
  const today = new Date();
  const [activeTab, setActiveTab] = useState(0);
  const touchStartX = useRef(0);
  const [, navigate] = useLocation();

  const handleDayClick = (day: number) => {
    if (activeTab !== 0) return;
    const mm = String(currentMonth + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    navigate(`/yaban/schedule?date=${currentYear}-${mm}-${dd}`);
  };

  const tab = MONTH_TABS[activeTab];

  const { data: stats } = trpc.yabanComm.calendarStats.useQuery(
    { year: currentYear, month: currentMonth + 1 },
    { keepPreviousData: true, enabled: tenantId > 0 }
  );
  const dayData: Record<number, number> = (stats?.[tab.id as keyof typeof stats] as Record<number, number>) || {};

  const handleTouchStart = (e: TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e: TouchEvent) => {
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(diff) > 60) { if (diff > 0) prevMonth(); else nextMonth(); }
  };

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();
  const weeks: (number | null)[][] = [];
  let currentDay = 1;
  for (let w = 0; w < 6; w++) {
    const week: (number | null)[] = [];
    for (let d = 0; d < 7; d++) {
      if (w === 0 && d < firstDayOfWeek) week.push(null);
      else if (currentDay > daysInMonth) week.push(null);
      else { week.push(currentDay); currentDay++; }
    }
    weeks.push(week);
    if (currentDay > daysInMonth) break;
  }

  const isToday = (day: number) =>
    day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();

  const monthTotal = Object.values(dayData).reduce((acc, val) => acc + val, 0);

  const formatValue = (val: number): string => {
    if (tab.isRevenue && !showRevenue) return "*";
    if (tab.isRevenue) {
      if (val >= 10000) return `${(val / 10000).toFixed(1)}w`;
      if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
      return val.toString();
    }
    return val.toString();
  };

  const formatMonthTotal = (): string => {
    if (tab.isRevenue) {
      if (!showRevenue) return "****";
      if (monthTotal >= 10000) return `\u00A5${(monthTotal / 10000).toFixed(1)}w`;
      return `\u00A5${monthTotal.toLocaleString()}`;
    }
    return monthTotal.toString();
  };

  return (
    <div>
      {/* 月总结（月份导航已提升到主组件顶部导航栏，此处只保留本月统计） */}
      <div
        className="px-3 pt-2 pb-2 flex items-center justify-end"
        style={{ background: "linear-gradient(135deg, #F0F8FF 0%, #E8F4FD 50%, #E0F0FA 100%)" }}
      >
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-gray-500">本月{tab.label}:</span>
          <span className="text-sm font-bold text-[#2196C8]">{formatMonthTotal()}</span>
          {tab.isRevenue && (
            <button onClick={() => setShowRevenue(!showRevenue)} className="ml-0.5">
              {showRevenue ? <Eye className="w-3.5 h-3.5 text-gray-400" /> : <EyeOff className="w-3.5 h-3.5 text-gray-400" />}
            </button>
          )}
        </div>
      </div>

      {/* 星期标题行 */}
      <div
        className="grid grid-cols-7 px-2 py-1.5"
        style={{ background: "linear-gradient(180deg, #4DB8E8 0%, #5CC4F0 100%)", boxShadow: "0 3px 8px rgba(33, 150, 200, 0.15)" }}
      >
        {WEEK_LABELS.map((day) => (
          <div key={day} className="text-center text-[10px] font-bold text-white">{day}</div>
        ))}
      </div>

      {/* 日历网格 */}
      <div
        className="px-1.5 py-1.5"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{ background: "linear-gradient(180deg, #F8FBFF 0%, #F2F6FA 100%)" }}
      >
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1 mb-1">
            {week.map((day, di) => {
              if (day === null) return <div key={di} />;
              const val = dayData[day] || 0;
              const hasData = val > 0;
              const todayMark = isToday(day);
              return (
                <div
                  key={di}
                  className={`relative rounded overflow-hidden flex flex-col items-center${activeTab === 0 && hasData ? " cursor-pointer active:opacity-70" : ""}`}
                  style={{
                    height: "48px",
                    background: todayMark ? "linear-gradient(145deg, #E3F2FD, #BBDEFB)" : "linear-gradient(145deg, #FFFFFF, #F5F8FC)",
                    boxShadow: todayMark ? "0 3px 8px rgba(33, 150, 200, 0.2), inset 0 1px 2px rgba(255,255,255,0.8)" : "2px 2px 4px rgba(0,0,0,0.04), -1px -1px 3px rgba(255,255,255,0.8)",
                    border: todayMark ? "1.5px solid #4DB8E8" : "1px solid rgba(0,0,0,0.03)",
                  }}
                  onClick={() => hasData && handleDayClick(day)}
                >
                  <div
                    className="w-full text-center flex items-center justify-center"
                    style={{ height: "8px", background: todayMark ? "linear-gradient(180deg, #4DB8E8, #3AA8D8)" : "linear-gradient(180deg, #E8F0F8, #DCE8F2)" }}
                  >
                    <span className={`text-[7px] font-bold leading-none ${todayMark ? "text-white" : "text-gray-400"}`}>{day}</span>
                  </div>
                  <div className="flex-1 flex flex-col items-center justify-center gap-0.5">
                    {hasData ? (
                      <span className={`text-[16px] font-bold leading-none ${activeTab === 0 ? "text-sky-600" : "text-gray-900"}`}>{formatValue(val)}</span>
                    ) : (
                      <span className="text-[11px] text-gray-300">-</span>
                    )}
                    {activeTab === 0 && hasData && (
                      <span className="w-1 h-1 rounded-full bg-sky-400 flex-shrink-0" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* 5个Tab切换栏 */}
      <div className="px-3 pb-3 pt-1">
        <div
          className="flex rounded-md p-1"
          style={{ background: "linear-gradient(145deg, #EDF2F7, #E2E8F0)", boxShadow: "inset 2px 2px 4px rgba(0,0,0,0.05), inset -1px -1px 3px rgba(255,255,255,0.7)" }}
        >
          {MONTH_TABS.map((t, i) => (
            <button
              key={t.id}
              className={`flex-1 py-2 rounded-md text-[10px] font-bold transition-all duration-200 ${activeTab === i ? "text-white" : "text-gray-500"}`}
              style={activeTab === i ? { background: "linear-gradient(145deg, #4DB8E8, #2196C8)", boxShadow: "0 3px 8px rgba(33, 150, 200, 0.3), inset 0 1px 2px rgba(255,255,255,0.2)", transform: "scale(1.02)" } : {}}
              onClick={() => setActiveTab(i)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// 主组件：三视角容器（日期导航 + 视角切换合并为一行）
// ══════════════════════════════════════════════════════════════════
export default function YabanCalendar({ tenantId = 0 }: { tenantId?: number }) {
  const todayObj = new Date();
  const todayStr = toDateStr(todayObj);

  const [viewMode, setViewMode] = useState<ViewMode>("day");
  // 日视角日期
  const [viewDate, setViewDate] = useState(todayStr);
  // 周视角周一
  const [weekStart, setWeekStart] = useState(() => toDateStr(getWeekMonday(todayObj)));

  // 日视角前后翻日
  const prevDay = () => {
    const d = new Date(viewDate + "T00:00:00"); d.setDate(d.getDate() - 1);
    setViewDate(toDateStr(d));
  };
  const nextDay = () => {
    const d = new Date(viewDate + "T00:00:00"); d.setDate(d.getDate() + 1);
    setViewDate(toDateStr(d));
  };

  // 周视角前后翻周
  const prevWeek = () => {
    const d = new Date(weekStart + "T00:00:00"); d.setDate(d.getDate() - 7);
    setWeekStart(toDateStr(d));
  };
  const nextWeek = () => {
    const d = new Date(weekStart + "T00:00:00"); d.setDate(d.getDate() + 7);
    setWeekStart(toDateStr(d));
  };

  // 月视角年月状态
  const [monthYear, setMonthYear] = useState(todayObj.getFullYear());
  const [monthMonth, setMonthMonth] = useState(todayObj.getMonth());
  const [monthShowRevenue, setMonthShowRevenue] = useState(true);
  const prevMonth = () => {
    if (monthMonth === 0) { setMonthYear(monthYear - 1); setMonthMonth(11); }
    else setMonthMonth(monthMonth - 1);
  };
  const nextMonth = () => {
    if (monthMonth === 11) { setMonthYear(monthYear + 1); setMonthMonth(0); }
    else setMonthMonth(monthMonth + 1);
  };

  // 导航栏显示内容（三视角共用同一行）
  const isViewDateToday = viewDate === todayStr;
  const viewDateObj = new Date(viewDate + "T00:00:00");
  const weekLabelChar = WEEK_LABELS[viewDateObj.getDay()];

  const weekEndObj = new Date(weekStart + "T00:00:00");
  weekEndObj.setDate(weekEndObj.getDate() + 6);
  const weekRangeLabel = `${formatDateLabel(weekStart)}—${weekEndObj.getMonth() + 1}月${weekEndObj.getDate()}日`;

  const showNav = true;
  const onPrev = viewMode === "day" ? prevDay : viewMode === "week" ? prevWeek : prevMonth;
  const onNext = viewMode === "day" ? nextDay : viewMode === "week" ? nextWeek : nextMonth;
  const navLabel = viewMode === "day"
    ? `${formatDateLabel(viewDate)} 周${weekLabelChar}${isViewDateToday ? " · 今天" : ""}`
    : viewMode === "week"
    ? weekRangeLabel
    : `${monthYear}年${monthMonth + 1}月`;

  return (
    <div
      className="bg-white mx-3 mt-2 rounded overflow-hidden"
      style={{ boxShadow: "0 8px 32px rgba(0, 140, 210, 0.06), 0 2px 8px rgba(0,0,0,0.04)" }}
    >
      {/* 导航栏：左 3/5 = 日期容器（内嵌箭头），右 2/5 = 日/周/月切换 */}
      <div
        className="px-3 py-2.5 flex items-center gap-2"
        style={{ background: "linear-gradient(135deg, #F0F8FF 0%, #E8F4FD 50%, #E0F0FA 100%)", borderBottom: "1px solid rgba(33,150,200,0.08)" }}
      >
        {/* 左 ~60%：日期框（内嵌左右箭头 + 中间日期） */}
        <div
          className="flex items-center rounded-xl flex-1"
          style={{
            background: showNav
              ? (viewMode === "day" && isViewDateToday
                  ? "linear-gradient(145deg, #4DB8E8, #2196C8)"
                  : "linear-gradient(145deg, #FFFFFF, #EEF4FA)")
              : "transparent",
            boxShadow: showNav ? "0 2px 8px rgba(33,150,200,0.12)" : "none",
          }}
        >
          {/* 左箭头 */}
          {showNav && (
            <button
              onPointerDown={(e) => { e.stopPropagation(); onPrev(); }}
              className="h-10 w-10 flex items-center justify-center shrink-0 active:opacity-60"
            >
              <ChevronLeft className={`w-5 h-5 ${
                viewMode === "day" && isViewDateToday ? "text-white" : "text-gray-400"
              }`} />
            </button>
          )}

          {/* 日期文字（点击跳回今天/本周） */}
          <button
            className="flex-1 h-10 flex items-center justify-center min-w-0"
            onPointerDown={(e) => {
              e.stopPropagation();
              if (viewMode === "day") setViewDate(todayStr);
              else if (viewMode === "week") setWeekStart(toDateStr(getWeekMonday(todayObj)));
            }}
          >
            <span className={`text-sm font-bold whitespace-nowrap ${
              viewMode === "day" && isViewDateToday ? "text-white" : "text-gray-700"
            }`}>
              {showNav ? navLabel : ""}
            </span>
          </button>

          {/* 右箭头 */}
          {showNav && (
            <button
              onPointerDown={(e) => { e.stopPropagation(); onNext(); }}
              className="h-10 w-10 flex items-center justify-center shrink-0 active:opacity-60"
            >
              <ChevronRight className={`w-5 h-5 ${
                viewMode === "day" && isViewDateToday ? "text-white" : "text-gray-400"
              }`} />
            </button>
          )}
        </div>

        {/* 日/周/月切换胶囊 */}
        <div
          className="flex rounded-lg p-0.5 shrink-0"
          style={{
            background: "linear-gradient(145deg, #E8F0F8, #DCE8F2)",
            boxShadow: "inset 1px 1px 3px rgba(0,0,0,0.06), inset -1px -1px 2px rgba(255,255,255,0.8)",
          }}
        >
          {(["day", "week", "month"] as ViewMode[]).map((mode) => {
            const labels: Record<ViewMode, string> = { day: "日", week: "周", month: "月" };
            const active = viewMode === mode;
            return (
              <button
                key={mode}
                className={`px-4 py-2 rounded-md text-[13px] font-bold transition-all whitespace-nowrap ${
                  active ? "text-white" : "text-gray-400"
                }`}
                style={active ? { background: "linear-gradient(145deg, #4DB8E8, #2196C8)", boxShadow: "0 2px 6px rgba(33,150,200,0.3)" } : {}}
                onPointerDown={(e) => { e.stopPropagation(); setViewMode(mode); }}
              >
                {labels[mode]}
              </button>
            );
          })}
        </div>
      </div>

      {/* 视角内容 */}
      {viewMode === "day"   && <DayView viewDate={viewDate} tenantId={tenantId} />}
      {viewMode === "week"  && <WeekView weekStart={weekStart} tenantId={tenantId} />}
      {viewMode === "month" && <MonthView
        currentYear={monthYear}
        currentMonth={monthMonth}
        prevMonth={prevMonth}
        nextMonth={nextMonth}
        showRevenue={monthShowRevenue}
        setShowRevenue={setMonthShowRevenue}
        tenantId={tenantId}
      />}
    </div>
  );
}
