/**
 * 牙伴 - 3D立体风格月历组件
 * 5个Tab：预约 | 随访 | 已收费 | 实收业绩 | 新增患者
 * 淡蓝色系，日历格子上方小帽檐(1/5~1/6高度)显示日期，中间大黑色数字
 * 切换月份和月总结合并为一行（左切换月份，右月总结）
 * 支持左右滑动切换月份
 */
import { useState, useRef, TouchEvent } from "react";
import { ChevronLeft, ChevronRight, Eye, EyeOff } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";

// Tab 配置 - 5个独立Tab
const TABS = [
  { id: "yuyue", label: "预约", unit: "", prefix: "" },
  { id: "suifang", label: "随访", unit: "", prefix: "" },
  { id: "yishoufei", label: "已收费", unit: "", prefix: "" },
  { id: "shishou", label: "实收业绩", unit: "", prefix: "\u00A5", isRevenue: true },
  { id: "xinzeng", label: "新增顾客", unit: "", prefix: "" },
];

export default function YabanCalendar() {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [activeTab, setActiveTab] = useState(0);
  const [showRevenue, setShowRevenue] = useState(true);
  const touchStartX = useRef(0);
  const [, navigate] = useLocation();

  // 点击日期格子跳转：预约 Tab 跳转预约管理页，其他 Tab 暂不跳转
  const handleDayClick = (day: number) => {
    if (activeTab !== 0) return; // 只有预约 Tab 支持点击跳转
    const mm = String(currentMonth + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    navigate(`/yaban/schedule?date=${currentYear}-${mm}-${dd}`);
  };

  const tab = TABS[activeTab];

  // 真实月度统计数据（按天聚合5个维度）
  const { data: stats } = trpc.yabanComm.calendarStats.useQuery(
    { year: currentYear, month: currentMonth + 1 },
    { keepPreviousData: true }
  );
  const dayData: Record<number, number> = (stats?.[tab.id as keyof typeof stats] as Record<number, number>) || {};

  // 月份切换
  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentYear(currentYear - 1);
      setCurrentMonth(11);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentYear(currentYear + 1);
      setCurrentMonth(0);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  // 触摸滑动
  const handleTouchStart = (e: TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: TouchEvent) => {
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(diff) > 60) {
      if (diff > 0) prevMonth();
      else nextMonth();
    }
  };

  // 日历网格计算
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();
  const weeks: (number | null)[][] = [];
  let currentDay = 1;
  for (let w = 0; w < 6; w++) {
    const week: (number | null)[] = [];
    for (let d = 0; d < 7; d++) {
      if (w === 0 && d < firstDayOfWeek) {
        week.push(null);
      } else if (currentDay > daysInMonth) {
        week.push(null);
      } else {
        week.push(currentDay);
        currentDay++;
      }
    }
    weeks.push(week);
    if (currentDay > daysInMonth) break;
  }

  const isToday = (day: number) =>
    day === today.getDate() &&
    currentMonth === today.getMonth() &&
    currentYear === today.getFullYear();

  // 月度汇总
  const monthTotal = Object.values(dayData).reduce((acc, val) => acc + val, 0);

  const weekDays = ["日", "一", "二", "三", "四", "五", "六"];

  // 格式化数据值
  const formatValue = (val: number): string => {
    if (tab.isRevenue && !showRevenue) return "*";
    if (tab.isRevenue) {
      if (val >= 10000) return `${(val / 10000).toFixed(1)}w`;
      if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
      return val.toString();
    }
    return val.toString();
  };

  // 格式化月总结
  const formatMonthTotal = (): string => {
    if (tab.isRevenue) {
      if (!showRevenue) return "****";
      if (monthTotal >= 10000) return `\u00A5${(monthTotal / 10000).toFixed(1)}w`;
      return `\u00A5${monthTotal.toLocaleString()}`;
    }
    return monthTotal.toString();
  };

  return (
    <div
      className="bg-white mx-3 mt-2 rounded overflow-hidden"
      style={{
        boxShadow: "0 8px 32px rgba(0, 140, 210, 0.06), 0 2px 8px rgba(0,0,0,0.04)",
      }}
    >
      {/* 月份切换 + 月总结 合并一行 */}
      <div
        className="px-3 pt-3 pb-2 flex items-center justify-between"
        style={{
          background: "linear-gradient(135deg, #F0F8FF 0%, #E8F4FD 50%, #E0F0FA 100%)",
        }}
      >
        {/* 左侧：月份切换 */}
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="w-7 h-7 rounded-md flex items-center justify-center active:scale-90 transition-transform"
            style={{
              background: "linear-gradient(145deg, #FFFFFF, #F0F4F8)",
              boxShadow: "2px 2px 4px rgba(0,0,0,0.05), -1px -1px 3px rgba(255,255,255,0.9)",
            }}
          >
            <ChevronLeft className="w-3.5 h-3.5 text-gray-600" />
          </button>

          <div
            className="px-3 py-1.5 rounded-md text-center"
            style={{
              background: "linear-gradient(145deg, #4DB8E8, #2196C8)",
              boxShadow: "0 3px 8px rgba(33, 150, 200, 0.25), inset 0 1px 2px rgba(255,255,255,0.3)",
            }}
          >
            <span className="text-white font-bold text-xs tracking-wide">
              {currentYear}年{currentMonth + 1}月
            </span>
          </div>

          <button
            onClick={nextMonth}
            className="w-7 h-7 rounded-md flex items-center justify-center active:scale-90 transition-transform"
            style={{
              background: "linear-gradient(145deg, #FFFFFF, #F0F4F8)",
              boxShadow: "2px 2px 4px rgba(0,0,0,0.05), -1px -1px 3px rgba(255,255,255,0.9)",
            }}
          >
            <ChevronRight className="w-3.5 h-3.5 text-gray-600" />
          </button>
        </div>

        {/* 右侧：月总结 */}
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-gray-500">本月{tab.label}:</span>
          <span className="text-sm font-bold text-[#2196C8]">{formatMonthTotal()}</span>
          {tab.isRevenue && (
            <button onClick={() => setShowRevenue(!showRevenue)} className="ml-0.5">
              {showRevenue ? (
                <Eye className="w-3.5 h-3.5 text-gray-400" />
              ) : (
                <EyeOff className="w-3.5 h-3.5 text-gray-400" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* 星期标题行 - 淡蓝色渐变 */}
      <div
        className="grid grid-cols-7 px-2 py-1.5"
        style={{
          background: "linear-gradient(180deg, #4DB8E8 0%, #5CC4F0 100%)",
          boxShadow: "0 3px 8px rgba(33, 150, 200, 0.15)",
        }}
      >
        {weekDays.map((day) => (
          <div key={day} className="text-center text-[10px] font-bold text-white">
            {day}
          </div>
        ))}
      </div>

      {/* 日历网格 - 小帽檐(1/5~1/6) + 大数字 */}
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
                    background: todayMark
                      ? "linear-gradient(145deg, #E3F2FD, #BBDEFB)"
                      : "linear-gradient(145deg, #FFFFFF, #F5F8FC)",
                    boxShadow: todayMark
                      ? "0 3px 8px rgba(33, 150, 200, 0.2), inset 0 1px 2px rgba(255,255,255,0.8)"
                      : "2px 2px 4px rgba(0,0,0,0.04), -1px -1px 3px rgba(255,255,255,0.8)",
                    border: todayMark ? "1.5px solid #4DB8E8" : "1px solid rgba(0,0,0,0.03)",
                  }}
                  onClick={() => hasData && handleDayClick(day)}
                >
                  {/* 小帽檐 - 只占约1/6高度(8px) */}
                  <div
                    className="w-full text-center flex items-center justify-center"
                    style={{
                      height: "8px",
                      background: todayMark
                        ? "linear-gradient(180deg, #4DB8E8, #3AA8D8)"
                        : "linear-gradient(180deg, #E8F0F8, #DCE8F2)",
                    }}
                  >
                    <span
                      className={`text-[7px] font-bold leading-none ${
                        todayMark ? "text-white" : "text-gray-400"
                      }`}
                    >
                      {day}
                    </span>
                  </div>

                  {/* 中间大数字 - 占据剩余空间 */}
                  <div className="flex-1 flex flex-col items-center justify-center gap-0.5">
                    {hasData ? (
                      <span className={`text-[16px] font-bold leading-none ${activeTab === 0 ? "text-sky-600" : "text-gray-900"}`}>
                        {formatValue(val)}
                      </span>
                    ) : (
                      <span className="text-[11px] text-gray-300">-</span>
                    )}
                    {/* 预约 Tab 有数据时显示小点，提示可点击 */}
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

      {/* 5个Tab切换栏 - 淡蓝色3D胶囊 */}
      <div className="px-3 pb-3 pt-1">
        <div
          className="flex rounded-md p-1"
          style={{
            background: "linear-gradient(145deg, #EDF2F7, #E2E8F0)",
            boxShadow: "inset 2px 2px 4px rgba(0,0,0,0.05), inset -1px -1px 3px rgba(255,255,255,0.7)",
          }}
        >
          {TABS.map((t, i) => (
            <button
              key={t.id}
              className={`flex-1 py-2 rounded-md text-[10px] font-bold transition-all duration-200 ${
                activeTab === i ? "text-white" : "text-gray-500"
              }`}
              style={
                activeTab === i
                  ? {
                      background: "linear-gradient(145deg, #4DB8E8, #2196C8)",
                      boxShadow: "0 3px 8px rgba(33, 150, 200, 0.3), inset 0 1px 2px rgba(255,255,255,0.2)",
                      transform: "scale(1.02)",
                    }
                  : {}
              }
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
