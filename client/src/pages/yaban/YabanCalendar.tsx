/**
 * 牙伴 - 3D立体风格月历组件
 * 3个Tab：预约+随访 | 已收费+实收业绩 | 新增患者
 * 支持左右滑动切换月份
 */
import { useState, useRef, TouchEvent } from "react";
import { ChevronLeft, ChevronRight, Eye, EyeOff } from "lucide-react";

// Tab 配置
const TABS = [
  { id: "appointments", label: "预约/随访", fields: ["预约", "随访"], colors: ["#FF8C00", "#00B4D8"] },
  { id: "revenue", label: "收费/业绩", fields: ["已收费", "实收"], colors: ["#4CAF50", "#FF6B35"] },
  { id: "patients", label: "新增患者", fields: ["新增"], colors: ["#9C27B0"] },
];

// 模拟数据生成
function generateMockData(year: number, month: number, tabId: string): Record<number, number[]> {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const data: Record<number, number[]> = {};
  for (let d = 1; d <= daysInMonth; d++) {
    if (tabId === "appointments") {
      data[d] = [Math.floor(Math.random() * 8), Math.floor(Math.random() * 12)];
    } else if (tabId === "revenue") {
      data[d] = [Math.floor(Math.random() * 5), Math.floor(Math.random() * 3000)];
    } else {
      data[d] = [Math.floor(Math.random() * 4)];
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
  const monthTotal = Object.values(mockData).reduce(
    (acc, vals) => vals.map((v, i) => (acc[i] || 0) + v),
    [] as number[]
  );

  const weekDays = ["日", "一", "二", "三", "四", "五", "六"];

  return (
    <div className="bg-white mx-3 mt-2 rounded-2xl overflow-hidden"
      style={{ boxShadow: "0 8px 32px rgba(255, 140, 0, 0.08), 0 2px 8px rgba(0,0,0,0.04)" }}
    >
      {/* 月份选择器 - 3D立体风格 */}
      <div
        className="relative px-4 pt-4 pb-3"
        style={{
          background: "linear-gradient(135deg, #FFF8F0 0%, #FFF3E8 50%, #FFECD9 100%)",
        }}
      >
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={prevMonth}
            className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform"
            style={{
              background: "linear-gradient(145deg, #FFFFFF, #F0F0F0)",
              boxShadow: "3px 3px 6px rgba(0,0,0,0.08), -2px -2px 4px rgba(255,255,255,0.9)",
            }}
          >
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>

          <div
            className="px-5 py-2 rounded-full text-center"
            style={{
              background: "linear-gradient(145deg, #FF9A2E, #FF7A00)",
              boxShadow: "0 4px 12px rgba(255, 140, 0, 0.35), inset 0 1px 2px rgba(255,255,255,0.3)",
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
              background: "linear-gradient(145deg, #FFFFFF, #F0F0F0)",
              boxShadow: "3px 3px 6px rgba(0,0,0,0.08), -2px -2px 4px rgba(255,255,255,0.9)",
            }}
          >
            <ChevronRight className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>

      {/* 星期标题行 - 立体渐变 */}
      <div
        className="grid grid-cols-7 px-2 py-2"
        style={{
          background: "linear-gradient(180deg, #FF9A2E 0%, #FFA940 100%)",
          boxShadow: "0 3px 8px rgba(255, 140, 0, 0.2)",
        }}
      >
        {weekDays.map((day) => (
          <div key={day} className="text-center text-[11px] font-bold text-white">
            {day}
          </div>
        ))}
      </div>

      {/* 日历网格 - 3D格子 */}
      <div
        className="px-1.5 py-2"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{ background: "linear-gradient(180deg, #FAFBFD 0%, #F5F6FA 100%)" }}
      >
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1 mb-1">
            {week.map((day, di) => {
              if (day === null) return <div key={di} />;
              const dayData = mockData[day] || [];
              const hasData = dayData.some((v) => v > 0);
              const todayMark = isToday(day);

              return (
                <div
                  key={di}
                  className="relative rounded-lg p-0.5 flex flex-col items-center justify-start min-h-[52px]"
                  style={{
                    background: todayMark
                      ? "linear-gradient(145deg, #FFF3E0, #FFE0B2)"
                      : hasData
                      ? "linear-gradient(145deg, #FFFFFF, #F8F9FC)"
                      : "linear-gradient(145deg, #FAFAFA, #F2F3F5)",
                    boxShadow: todayMark
                      ? "0 3px 8px rgba(255, 140, 0, 0.2), inset 0 1px 2px rgba(255,255,255,0.8)"
                      : hasData
                      ? "2px 2px 4px rgba(0,0,0,0.05), -1px -1px 3px rgba(255,255,255,0.8)"
                      : "1px 1px 2px rgba(0,0,0,0.03)",
                    border: todayMark ? "1.5px solid #FF8C00" : "1px solid rgba(0,0,0,0.03)",
                  }}
                >
                  {/* 日期数字 */}
                  <span
                    className={`text-[10px] font-bold leading-none mt-0.5 ${
                      todayMark ? "text-[#FF6B00]" : "text-gray-700"
                    }`}
                  >
                    {day}
                  </span>

                  {/* 数据显示 */}
                  {hasData && (
                    <div className="flex flex-col items-center gap-0 mt-0.5 w-full">
                      {dayData.map((val, vi) => {
                        if (val === 0) return null;
                        const color = tab.colors[vi] || tab.colors[0];
                        // 收费Tab的第二个字段是金额，需要特殊处理
                        const displayVal =
                          tab.id === "revenue" && vi === 1
                            ? showRevenue
                              ? val >= 1000
                                ? `${(val / 1000).toFixed(1)}k`
                                : val
                              : "*"
                            : val;
                        return (
                          <div
                            key={vi}
                            className="rounded-full px-1 py-0 text-center leading-tight"
                            style={{
                              background: `${color}18`,
                              fontSize: "8px",
                              fontWeight: 700,
                              color: color,
                              minWidth: "16px",
                              marginTop: "1px",
                            }}
                          >
                            {displayVal}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* 月度汇总 - 立体卡片 */}
      <div
        className="mx-3 mb-3 rounded-xl p-3 flex items-center justify-around"
        style={{
          background: "linear-gradient(145deg, #FFFFFF, #F8F9FC)",
          boxShadow: "inset 0 2px 4px rgba(0,0,0,0.03), 0 2px 8px rgba(0,0,0,0.04)",
        }}
      >
        {tab.fields.map((field, fi) => (
          <div key={field} className="text-center">
            <div
              className="text-lg font-bold"
              style={{ color: tab.colors[fi] }}
            >
              {tab.id === "revenue" && fi === 1
                ? showRevenue
                  ? `\u00A5${monthTotal[fi]?.toLocaleString() || 0}`
                  : "****"
                : monthTotal[fi] || 0}
            </div>
            <div className="text-[10px] text-gray-500 flex items-center justify-center gap-0.5">
              {field}
              {tab.id === "revenue" && fi === 1 && (
                <button onClick={() => setShowRevenue(!showRevenue)} className="ml-0.5">
                  {showRevenue ? (
                    <Eye className="w-3 h-3 text-gray-400" />
                  ) : (
                    <EyeOff className="w-3 h-3 text-gray-400" />
                  )}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Tab 切换栏 - 3D胶囊按钮 */}
      <div className="px-4 pb-4">
        <div
          className="flex rounded-full p-1"
          style={{
            background: "linear-gradient(145deg, #F0F1F5, #E8E9ED)",
            boxShadow: "inset 2px 2px 4px rgba(0,0,0,0.06), inset -1px -1px 3px rgba(255,255,255,0.7)",
          }}
        >
          {TABS.map((t, i) => (
            <button
              key={t.id}
              className={`flex-1 py-2 rounded-full text-[11px] font-bold transition-all duration-200 ${
                activeTab === i ? "text-white" : "text-gray-500"
              }`}
              style={
                activeTab === i
                  ? {
                      background: "linear-gradient(145deg, #FF9A2E, #FF7A00)",
                      boxShadow: "0 3px 8px rgba(255, 140, 0, 0.3), inset 0 1px 2px rgba(255,255,255,0.2)",
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
