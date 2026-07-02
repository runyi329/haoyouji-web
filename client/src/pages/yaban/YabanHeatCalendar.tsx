/**
 * YabanHeatCalendar — 牙伴热力日历共享组件
 *
 * A314（YabanSchedule）和 A316（YabanScheduleCreate）共用同一套日历渲染。
 * 修改此文件，两个页面同步生效。
 *
 * Props:
 *   selDate        — 当前选中日期
 *   onSelectDate   — 点击格子回调
 *   getCellLoad    — 返回某天的热力占用率（0~1），无数据返回 0
 *   monthCursor    — 当前月份游标
 *   onMonthChange  — 切换月份回调
 *   disablePast    — 是否禁止点击过去日期（A316 用，A314 不用）
 *   showToggle     — 是否显示周/月切换按钮（A314 用）
 *   calMode        — "week" | "month"（A314 用）
 *   onToggleMode   — 切换周/月回调（A314 用）
 *   weekDates      — 周视图的7天日期（A314 用）
 */
import {
  HEAT, heatColor, heatTextColor,
  SKY, SKY_D, GRAY_L, LINE,
  WK, isSameDay, toDateStr,
} from "./yabanSharedStyles";

export interface YabanHeatCalendarProps {
  selDate: Date;
  onSelectDate: (d: Date) => void;
  getCellLoad: (d: Date) => number;
  monthCursor: Date;
  onMonthChange: (d: Date) => void;
  disablePast?: boolean;
  showToggle?: boolean;
  calMode?: "week" | "month";
  onToggleMode?: () => void;
  weekDates?: (Date | null)[];
}

function getMonthCells(cursor: Date): (Date | null)[] {
  const y = cursor.getFullYear(), m = cursor.getMonth();
  const first = new Date(y, m, 1), last = new Date(y, m + 1, 0);
  const lead = first.getDay();
  const cells: (Date | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(y, m, d));
  return cells;
}

export default function YabanHeatCalendar({
  selDate,
  onSelectDate,
  getCellLoad,
  monthCursor,
  onMonthChange,
  disablePast = false,
  showToggle = false,
  calMode = "month",
  onToggleMode,
  weekDates,
}: YabanHeatCalendarProps) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const calDates = calMode === "week" && weekDates ? weekDates : getMonthCells(monthCursor);
  const cellH = calMode === "month" ? 42 : 48;

  return (
    <div style={{ background: "#fff", padding: "10px 14px 2px", borderBottom: `1px solid ${LINE}` }}>
      {/* 月份导航（月视图才显示） */}
      {calMode === "month" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#26303C" }}>
            {monthCursor.getFullYear()}年{monthCursor.getMonth() + 1}月
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <div
              onClick={() => onMonthChange(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}
              style={{ width: 28, height: 28, borderRadius: 4, background: "#F6F8FA", color: "#647386", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, cursor: "pointer" }}
            >‹</div>
            <div
              onClick={() => onMonthChange(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}
              style={{ width: 28, height: 28, borderRadius: 4, background: "#F6F8FA", color: "#647386", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, cursor: "pointer" }}
            >›</div>
          </div>
        </div>
      )}

      {/* 星期头 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: 3 }}>
        {WK.map((w, i) => (
          <span key={i} style={{ textAlign: "center", fontSize: 10, fontWeight: 600, color: "#9AA7B5", padding: "2px 0", letterSpacing: ".5px" }}>{w}</span>
        ))}
      </div>

      {/* 日历格子 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
        {calDates.map((d, i) => {
          if (!d) return <div key={i} />;
          const isToday = isSameDay(d, today);
          const isSel = isSameDay(d, selDate);
          const isPast = d.getTime() < today.getTime() && !isToday;
          const r = getCellLoad(d);
          const bg = isPast ? "#F0F2F5" : (r > 0 ? heatColor(r) : "#F6F8FA");
          const tc = isPast ? GRAY_L : (r > 0 ? heatTextColor(r) : "#26303C");
          const clickable = !disablePast || !isPast;
          return (
            <div
              key={i}
              onClick={() => clickable && onSelectDate(d)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                height: cellH, borderRadius: 5, background: bg,
                cursor: clickable ? "pointer" : "default",
                position: "relative",
                border: isSel ? `2px solid ${SKY_D}` : "2px solid transparent",
                opacity: isPast ? (disablePast ? 0.45 : 0.72) : 1,
                transition: "all .18s",
                zIndex: isSel ? 2 : 1,
              }}
            >
              <span style={{
                fontSize: isSel ? 16 : 14,
                fontWeight: isSel ? 800 : (isToday ? 700 : 600),
                color: isSel ? "#1A2A3A" : (isToday ? SKY_D : tc),
                fontFamily: "'SF Pro Display','PingFang SC',-apple-system,sans-serif",
                transition: "all .15s",
              }}>
                {String(d.getDate()).padStart(2, "0")}
              </span>
              {isToday && (
                <div style={{ width: 4, height: 4, borderRadius: "50%", background: isSel ? "#1A2A3A" : SKY_D, position: "absolute", bottom: 4 }} />
              )}
            </div>
          );
        })}
      </div>

      {/* 热力图图例 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "8px 0 3px", fontSize: 10, color: "#9AA7B5" }}>
        <span>空闲</span>
        <div style={{ display: "flex" }}>
          {HEAT.map((c, i) => (
            <div key={i} style={{ width: 14, height: 11, background: c, borderRadius: i === 0 ? "3px 0 0 3px" : i === 9 ? "0 3px 3px 0" : 0 }} />
          ))}
        </div>
        <span>约满</span>
      </div>

      {/* 周/月切换按钮（A314 用） */}
      {showToggle && onToggleMode && (
        <div
          onClick={onToggleMode}
          style={{ textAlign: "center", color: "#DBE1E8", fontSize: 16, lineHeight: 1, padding: "4px 0 7px", cursor: "pointer" }}
        >
          {calMode === "week" ? "⌄" : "⌃"}
        </div>
      )}
    </div>
  );
}
