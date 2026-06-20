import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface DatePickerProps {
  value: string; // YYYY-MM-DD格式
  onChange: (date: string) => void;
  onClose: () => void;
}

export function DatePicker({ value, onChange, onClose }: DatePickerProps) {
  const [currentDate, setCurrentDate] = useState(() => {
    if (value) {
      return new Date(value);
    }
    return new Date();
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // 获取当月的天数
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  // 获取当月第一天是星期几（0-6，0是周日）
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  // 生成日历数据
  const calendarDays = useMemo(() => {
    const days = [];
    
    // 填充前面的空白
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(null);
    }
    
    // 填充当月的日期
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    
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
    
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onChange(dateStr);
    onClose();
  };

  const goToPreviousMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const monthNames = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
  const weekDays = ["日", "一", "二", "三", "四", "五", "六"];

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-white rounded-lg shadow-xl w-[280px] p-3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 月份导航 */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={goToPreviousMonth}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>
          <div className="text-sm font-medium text-gray-800">
            {year}年 {monthNames[month]}
          </div>
          <button
            onClick={goToNextMonth}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {/* 星期标题 */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {weekDays.map((day) => (
            <div key={day} className="text-center text-[10px] text-gray-500 font-medium py-1">
              {day}
            </div>
          ))}
        </div>

        {/* 日期网格 */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((day, index) => (
            <button
              key={index}
              onClick={() => handleDayClick(day)}
              disabled={!day}
              className={`
                aspect-square flex items-center justify-center text-xs rounded
                ${!day ? 'invisible' : ''}
                ${isSelectedDate(day) 
                  ? 'bg-[var(--status-link)] text-white font-semibold' 
                  : 'hover:bg-gray-100 text-gray-700'
                }
                ${day && !isSelectedDate(day) ? 'transition-colors' : ''}
              `}
            >
              {day}
            </button>
          ))}
        </div>

        {/* 底部按钮 */}
        <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
          <button
            onClick={() => {
              const today = new Date();
              const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
              onChange(todayStr);
              onClose();
            }}
            className="flex-1 py-1.5 text-xs text-[var(--status-link)] hover:bg-gray-50 rounded transition-colors"
          >
            今天
          </button>
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
