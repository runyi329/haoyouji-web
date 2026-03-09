/**
 * LotteryDatePicker
 * 智能日历选择器：根据类型（sh_index/ssq/dlt）高亮有效日期，无效日期灰色禁用
 */
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// ─── 2025-2026 年 A 股法定节假日（非交易日）───────────────────────────────────
// 来源：上交所公告
const STOCK_HOLIDAYS = new Set([
  // 2025
  "2025-01-01",
  "2025-01-28","2025-01-29","2025-01-30","2025-01-31",
  "2025-02-03","2025-02-04",
  "2025-04-04",
  "2025-05-01","2025-05-02","2025-05-05",
  "2025-05-31",
  "2025-10-01","2025-10-02","2025-10-03","2025-10-06","2025-10-07","2025-10-08",
  // 2026
  "2026-01-01","2026-01-02",
  "2026-02-17","2026-02-18","2026-02-19","2026-02-20","2026-02-23",
  "2026-04-06",
  "2026-05-01","2026-05-04","2026-05-05",
  "2026-06-19",
  "2026-09-25",
  "2026-10-01","2026-10-02","2026-10-05","2026-10-06","2026-10-07","2026-10-08",
]);

// 调休补班（周末变交易日）
const STOCK_EXTRA_TRADING = new Set([
  "2025-01-26",
  "2025-02-08",
  "2025-04-27",
  "2025-09-28",
  "2025-10-11",
  "2026-02-14","2026-02-28",
  "2026-04-12",
  "2026-05-09",
  "2026-10-10",
]);

function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function isStockTradingDay(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00");
  const dow = d.getDay(); // 0=Sun,6=Sat
  if (STOCK_HOLIDAYS.has(dateStr)) return false;
  if (STOCK_EXTRA_TRADING.has(dateStr)) return true;
  return dow !== 0 && dow !== 6;
}

function isSSQDay(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00");
  const dow = d.getDay();
  return dow === 2 || dow === 4 || dow === 0; // 二、四、日
}

function isDLTDay(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00");
  const dow = d.getDay();
  return dow === 1 || dow === 3 || dow === 6; // 一、三、六
}

function isValidDate(dateStr: string, type: string): boolean {
  if (type === "sh_index" || type === "sz_index") return isStockTradingDay(dateStr);
  if (type === "ssq") return isSSQDay(dateStr);
  if (type === "dlt") return isDLTDay(dateStr);
  return true;
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const TYPE_LABELS: Record<string, string> = {
  sh_index: "上证指数交易日（周一至周五，排除节假日）",
  sz_index: "深证成指交易日（周一至周五，排除节假日）",
  ssq: "双色球开奖日（每周二、四、日）",
  dlt: "大乐透开奖日（每周一、三、六）",
};

interface Props {
  value: string; // "YYYY-MM-DD"
  onChange: (v: string) => void;
  seedType: string;
  maxDate?: string; // 最大可选日期，不传则不限制（允许选未来日期）
}

export function LotteryDatePicker({ value, onChange, seedType, maxDate }: Props) {
  const today = new Date();
  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());
  // maxDate 不传时不限制（允许选未来日期）
  const limitStr = maxDate ?? null;

  const initDate = value ? new Date(value + "T00:00:00") : today;
  const [viewYear, setViewYear] = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth()); // 0-indexed

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // 补齐到 6 行
  while (cells.length % 7 !== 0) cells.push(null);

  const label = TYPE_LABELS[seedType] || "";

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: "#E0E0E0", backgroundColor: "#FFFFFF" }}>
      {/* 提示说明 */}
      {label && (
        <div className="px-3 py-2 text-xs" style={{ backgroundColor: "#FFF8E1", color: "#F57F17", borderBottom: "1px solid #FFE082" }}>
          {label}
        </div>
      )}

      {/* 月份导航 */}
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid #F5F5F5" }}>
        <button
          type="button"
          onClick={prevMonth}
          className="p-1 rounded-lg active:bg-gray-100"
        >
          <ChevronLeft className="w-4 h-4" style={{ color: "#757575" }} />
        </button>
        <span className="text-sm font-semibold" style={{ color: "#222222" }}>
          {viewYear}年{viewMonth + 1}月
        </span>
        <button
          type="button"
          onClick={nextMonth}
          className="p-1 rounded-lg active:bg-gray-100"
        >
          <ChevronRight className="w-4 h-4" style={{ color: "#757575" }} />
        </button>
      </div>

      {/* 星期头 */}
      <div className="grid grid-cols-7 px-2 pt-1">
        {WEEKDAYS.map(w => (
          <div key={w} className="text-center text-xs py-1" style={{ color: "#9E9E9E" }}>{w}</div>
        ))}
      </div>

      {/* 日期格子 */}
      <div className="grid grid-cols-7 px-2 pb-2 gap-y-0.5">
        {cells.map((day, idx) => {
          if (!day) return <div key={idx} />;
          const dateStr = toDateStr(viewYear, viewMonth, day);
          const valid = isValidDate(dateStr, seedType);
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === value;
          const isFuture = limitStr ? dateStr > limitStr : false;
          const disabled = !valid || isFuture;

          return (
            <button
              key={idx}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && onChange(dateStr)}
              className="relative flex items-center justify-center rounded-full mx-auto"
              style={{
                width: 32,
                height: 32,
                fontSize: 13,
                fontWeight: isSelected ? 700 : isToday ? 600 : 400,
                color: disabled
                  ? "#CCCCCC"
                  : isSelected
                  ? "#FFFFFF"
                  : isToday
                  ? "#D32F2F"
                  : "#222222",
                backgroundColor: isSelected ? "#D32F2F" : "transparent",
                cursor: disabled ? "not-allowed" : "pointer",
                border: isToday && !isSelected ? "1.5px solid #D32F2F" : "none",
                opacity: disabled ? 0.5 : 1,
              }}
            >
              {day}
            </button>
          );
        })}
      </div>

      {/* 已选日期显示 */}
      {value && (
        <div className="px-3 py-2 text-xs text-center" style={{ borderTop: "1px solid #F5F5F5", color: "#D32F2F" }}>
          已选：{value}
          {seedType === "sh_index" || seedType === "sz_index"
            ? "（交易日收盘价）"
            : seedType === "ssq"
            ? "（双色球开奖日）"
            : seedType === "dlt"
            ? "（大乐透开奖日）"
            : ""}
        </div>
      )}
    </div>
  );
}
