import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface DatePickerProps {
  value: string; // YYYY-MM-DD格式
  onChange: (date: string) => void;
  onClose: () => void;
  onClear?: () => void; // 可选：提供时底部显示“清除”按钮
}

type View = "day" | "month" | "year";

export function DatePicker({ value, onChange, onClose, onClear }: DatePickerProps) {
  const [currentDate, setCurrentDate] = useState(() => {
    if (value) {
      return new Date(value);
    }
    return new Date();
  });
  // 当前视图：日 / 月 / 年
  const [view, setView] = useState<View>("day");
  // 年份网格的起始年（12 年一页）
  const [yearPageStart, setYearPageStart] = useState(() => {
    const y = value ? new Date(value).getFullYear() : new Date().getFullYear();
    return y - (y % 12);
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // 获取当月的天数
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // 获取当月第一天是星期几（0-6，0是周日）
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  // 生成日历数据
  const calendarDays = useMemo(() => {
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDayOfMonth; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  }, [firstDayOfMonth, daysInMonth]);

  // 选中的日期
  const selectedDay = value ? new Date(value).getDate() : null;
  const selectedMonth = value ? new Date(value).getMonth() : null;
  const selectedYear = value ? new Date(value).getFullYear() : null;

  const isSelectedDate = (day: number | null) => {
    if (!day || !value) return false;
    return day === selectedDay && month === selectedMonth && year === selectedYear;
  };

  const handleDayClick = (day: number | null) => {
    if (!day) return;
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    onChange(dateStr);
    onClose();
  };

  const goToPreviousMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const goToNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const monthNames = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
  const weekDays = ["日", "一", "二", "三", "四", "五", "六"];

  // 年份网格（12 年一页）
  const yearGrid = useMemo(() => {
    const arr: number[] = [];
    for (let i = 0; i < 12; i++) arr.push(yearPageStart + i);
    return arr;
  }, [yearPageStart]);

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-[280px] p-3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部导航：左右翻 + 中间年/月可点切换视图 */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => {
              if (view === "day") goToPreviousMonth();
              else if (view === "month") setCurrentDate(new Date(year - 1, month, 1));
              else setYearPageStart((s) => s - 12);
            }}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>

          <div className="flex items-center gap-1 text-sm font-medium text-gray-800">
            {view === "year" ? (
              <span>{yearGrid[0]} - {yearGrid[11]}</span>
            ) : (
              <>
                <button
                  onClick={() => {
                    setYearPageStart(year - (year % 12));
                    setView("year");
                  }}
                  className="px-1.5 py-0.5 rounded hover:bg-gray-100 active:bg-gray-200 transition-colors"
                >
                  {year}年
                </button>
                {view === "day" && (
                  <button
                    onClick={() => setView("month")}
                    className="px-1.5 py-0.5 rounded hover:bg-gray-100 active:bg-gray-200 transition-colors"
                  >
                    {monthNames[month]}
                  </button>
                )}
              </>
            )}
          </div>

          <button
            onClick={() => {
              if (view === "day") goToNextMonth();
              else if (view === "month") setCurrentDate(new Date(year + 1, month, 1));
              else setYearPageStart((s) => s + 12);
            }}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {/* 视图：日 */}
        {view === "day" && (
          <>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {weekDays.map((d) => (
                <div key={d} className="text-center text-[10px] text-gray-500 font-medium py-1">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day, index) => (
                <button
                  key={index}
                  onClick={() => handleDayClick(day)}
                  disabled={!day}
                  className={`
                    aspect-square flex items-center justify-center text-xs rounded
                    ${!day ? "invisible" : ""}
                    ${isSelectedDate(day)
                      ? "bg-[var(--status-link)] text-white font-semibold"
                      : "hover:bg-gray-100 text-gray-700 transition-colors"}
                  `}
                >
                  {day}
                </button>
              ))}
            </div>
          </>
        )}

        {/* 视图：月 */}
        {view === "month" && (
          <div className="grid grid-cols-3 gap-2 py-1">
            {monthNames.map((mn, idx) => (
              <button
                key={mn}
                onClick={() => {
                  setCurrentDate(new Date(year, idx, 1));
                  setView("day");
                }}
                className={`
                  py-2.5 text-sm rounded-lg transition-colors
                  ${idx === month
                    ? "bg-[var(--status-link)] text-white font-semibold"
                    : "hover:bg-gray-100 text-gray-700"}
                `}
              >
                {mn}
              </button>
            ))}
          </div>
        )}

        {/* 视图：年 */}
        {view === "year" && (
          <div className="grid grid-cols-3 gap-2 py-1">
            {yearGrid.map((y) => (
              <button
                key={y}
                onClick={() => {
                  setCurrentDate(new Date(y, month, 1));
                  setView("month");
                }}
                className={`
                  py-2.5 text-sm rounded-lg transition-colors
                  ${y === year
                    ? "bg-[var(--status-link)] text-white font-semibold"
                    : "hover:bg-gray-100 text-gray-700"}
                `}
              >
                {y}
              </button>
            ))}
          </div>
        )}

        {/* 底部按钮 */}
        <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
          <button
            onClick={() => {
              const today = new Date();
              const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
              onChange(todayStr);
              onClose();
            }}
            className="flex-1 py-1.5 text-xs text-[var(--status-link)] hover:bg-gray-50 rounded transition-colors"
          >
            今天
          </button>
          {onClear && (
            <button
              onClick={() => {
                onClear();
                onClose();
              }}
              className="flex-1 py-1.5 text-xs text-red-500 hover:bg-gray-50 rounded transition-colors"
            >
              清除
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 py-1.5 text-xs text-gray-600 hover:bg-gray-50 rounded transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
