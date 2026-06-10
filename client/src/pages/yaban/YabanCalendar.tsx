/**
 * 牙伴 - 3D立体风格月历组件
 * 5个Tab：预约 | 随访 | 已收费 | 实收业绩 | 新增患者
 * 淡蓝色系，日历格子上方帽檐显示日期，中间大黑色数字
 * 支持左右滑动切换月份
 */
import { useState, useRef, TouchEvent } from "react";
import { ChevronLeft, ChevronRight, Eye, EyeOff } from "lucide-react";

// Tab 配置 - 5个独立Tab
const TABS = [
  { id: "yuyue", label: "预约", unit: "", prefix: "" },
  { id: "suifang", label: "随访", unit: "", prefix: "" },
  { id: "yishoufei", label: "已收费", unit: "", prefix: "" },
  { id: "shishou", label: "实收业绩", unit: "", prefix: "\u00A5", isRevenue: true },
  { id: "xinzeng", label: "新增患者", unit: "", prefix: "" },
];

// 模拟数据生成
function generateMockData(year: number, month: number, tabId: string): Record<number, number> {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const data: Record<number, number> = {};
  for (let d = 1; d <= daysInMonth; d++) {
    if (tabId === "yuyue") {
      data[d] = Math.floor(Math.random() * 10);
    } else if (tabId === "suifang") {
      data[d] = Math.floor(Math.random() * 15);
    } else if (tabId === "yishoufei") {
      data[d] = Math.floor(Math.random() * 6);
    } else if (tabId === "shishou") {
      data[d] = Math.floor(Math.random() * 5000);
    } else {
      data[d] = Math.floor(Math.random() * 5);
    }
  }
  return data;
}

export default function YabanCalendar() {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [activeTab, setActiveTab] = useState(0);
  const [showRevenue, setShowRevenue] = useState(true);
  const touchStartX = useRef(0);

  const tab = TABS[activeTab];
  const mockData = generateMockData(currentYear, currentMonth, tab.id);

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
  const monthTotal = Object.values(mockData).reduce((acc, val) => acc + val, 0);

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

  return (
    <div
      className="bg-white mx-3 mt-2 rounded-2xl overflow-hidden"
      style={{
        boxShadow: "0 8px 32px rgba(0, 140, 210, 0.06), 0 2px 8px rgba(0,0,0,0.04)",
      }}
    >
      {/* 月份选择器 - 淡蓝色系 */}
      <div
        className="relative px-4 pt-4 pb-3"
        style={{
          background: "linear-gradient(135deg, #F0F8FF 0%, #E8F4FD 50%, #E0F0FA 100%)",
        }}
      >
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={prevMonth}
            className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform"
            style={{
              background: "linear-gradient(145deg, #FFFFFF, #F0F4F8)",
              boxShadow: "3px 3px 6px rgba(0,0,0,0.06), -2px -2px 4px rgba(255,255,255,0.9)",
            }}
          >
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>

          <div
            className="px-5 py-2 rounded-full text-center"
            style={{
              background: "linear-gradient(145deg, #4DB8E8, #2196C8)",
              boxShadow: "0 4px 12px rgba(33, 150, 200, 0.3), inset 0 1px 2px rgba(255,255,255,0.3)",
            }}
          >
            <span className="text-white font-bold text-sm tracking-wide">
              {currentYear}年{currentMonth + 1}月
            </span>
          </div>

          <button
            onClick={nextMonth}
            className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform"
            style={{
              background: "linear-gradient(145deg, #FFFFFF, #F0F4F8)",
              boxShadow: "3px 3px 6px rgba(0,0,0,0.06), -2px -2px 4px rgba(255,255,255,0.9)",
            }}
          >
            <ChevronRight className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>

      {/* 星期标题行 - 淡蓝色渐变 */}
      <div
        className="grid grid-cols-7 px-2 py-2"
        style={{
          background: "linear-gradient(180deg, #4DB8E8 0%, #5CC4F0 100%)",
          boxShadow: "0 3px 8px rgba(33, 150, 200, 0.15)",
        }}
      >
        {weekDays.map((day) => (
          <div key={day} className="text-center text-[11px] font-bold text-white">
            {day}
          </div>
        ))}
      </div>

      {/* 日历网格 - 帽檐日期 + 大数字 */}
      <div
        className="px-1.5 py-2"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{ background: "linear-gradient(180deg, #F8FBFF 0%, #F2F6FA 100%)" }}
      >
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1 mb-1">
            {week.map((day, di) => {
              if (day === null) return <div key={di} />;
              const val = mockData[day] || 0;
              const hasData = val > 0;
              const todayMark = isToday(day);

              return (
                <div
                  key={di}
                  className="relative rounded-lg overflow-hidden flex flex-col items-center min-h-[54px]"
                  style={{
                    background: todayMark
                      ? "linear-gradient(145deg, #E3F2FD, #BBDEFB)"
                      : "linear-gradient(145deg, #FFFFFF, #F5F8FC)",
                    boxShadow: todayMark
                      ? "0 3px 8px rgba(33, 150, 200, 0.2), inset 0 1px 2px rgba(255,255,255,0.8)"
                      : "2px 2px 4px rgba(0,0,0,0.04), -1px -1px 3px rgba(255,255,255,0.8)",
                    border: todayMark ? "1.5px solid #4DB8E8" : "1px solid rgba(0,0,0,0.03)",
                  }}
                >
                  {/* 帽檐 - 日期数字 */}
                  <div
                    className="w-full text-center py-[2px]"
                    style={{
                      background: todayMark
                        ? "linear-gradient(180deg, #4DB8E8, #3AA8D8)"
                        : "linear-gradient(180deg, #E8F0F8, #DCE8F2)",
                      borderBottom: todayMark ? "none" : "1px solid rgba(0,0,0,0.03)",
                    }}
                  >
                    <span
                      className={`text-[9px] font-bold leading-none ${
                        todayMark ? "text-white" : "text-gray-500"
                      }`}
                    >
                      {day}
                    </span>
                  </div>

                  {/* 中间大数字 */}
                  <div className="flex-1 flex items-center justify-center">
                    {hasData ? (
                      <span className="text-[15px] font-bold text-gray-900 leading-none">
                        {formatValue(val)}
                      </span>
                    ) : (
                      <span className="text-[11px] text-gray-300">-</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* 月度汇总 - 淡蓝色立体卡片 */}
      <div
        className="mx-3 mb-3 rounded-xl p-3 flex items-center justify-center gap-2"
        style={{
          background: "linear-gradient(145deg, #F0F8FF, #E8F4FD)",
          boxShadow: "inset 0 2px 4px rgba(0,0,0,0.02), 0 2px 8px rgba(33, 150, 200, 0.06)",
        }}
      >
        <span className="text-xs text-gray-500">本月{tab.label}：</span>
        <span className="text-lg font-bold text-[#2196C8]">
          {tab.isRevenue
            ? showRevenue
              ? `\u00A5${monthTotal.toLocaleString()}`
              : "****"
            : monthTotal}
        </span>
        {tab.isRevenue && (
          <button onClick={() => setShowRevenue(!showRevenue)} className="ml-1">
            {showRevenue ? (
              <Eye className="w-4 h-4 text-gray-400" />
            ) : (
              <EyeOff className="w-4 h-4 text-gray-400" />
            )}
          </button>
        )}
      </div>

      {/* 5个Tab切换栏 - 淡蓝色3D胶囊 */}
      <div className="px-3 pb-4">
        <div
          className="flex rounded-full p-1"
          style={{
            background: "linear-gradient(145deg, #EDF2F7, #E2E8F0)",
            boxShadow: "inset 2px 2px 4px rgba(0,0,0,0.05), inset -1px -1px 3px rgba(255,255,255,0.7)",
          }}
        >
          {TABS.map((t, i) => (
            <button
              key={t.id}
              className={`flex-1 py-2 rounded-full text-[10px] font-bold transition-all duration-200 ${
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
