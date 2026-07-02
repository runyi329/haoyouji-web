/**
 * YabanGanttBar — 牙伴排班甘特条共享组件
 *
 * A314（YabanSchedule）和 A316（YabanScheduleCreate）共用同一套甘特条渲染。
 * 修改此文件，两个页面同步生效。
 *
 * Props:
 *   shift          — 有效班次（null 表示今日休息）
 *   roleKey        — 角色 key，用于着色
 *   appointments   — 该成员当天的预约列表（可选，用于显示占用块）
 *   trackStart     — 轨道开始时间（分钟），默认 9*60
 *   trackEnd       — 轨道结束时间（分钟），默认 18*60
 *   height         — 甘特条高度，默认 24
 *   isSelected     — 是否选中（加深底色）
 *   showSlots      — 是否显示可点击时段格子（A316 用）
 *   slotDuration   — 时段格子间隔分钟，默认 30
 *   selectedSlot   — 当前选中的时段 [start, end]（分钟）
 *   onSlotClick    — 点击时段格子回调 (start, end) => void
 *   onApptClick    — 点击预约块回调 (apptId) => void（A314 用）
 *   onBarClick     — 点击进度条空白处回调（A314 用，按位置换算时间）
 */
import React from "react";
import { getRoleBarColor, STATUS, timeToMin, hm } from "./yabanSharedStyles";

export type EffShift = { workStart: number; workEnd: number; segments: [number, number][] } | null;

export interface YabanGanttBarProps {
  shift: EffShift;
  roleKey?: string;
  customColor?: string;  // 自定义进度条颜色，优先于角色默认色
  appointments?: any[];
  trackStart?: number;
  trackEnd?: number;
  height?: number;
  isSelected?: boolean;
  showSlots?: boolean;
  slotDuration?: number;
  selectedSlot?: [number, number] | null;
  onSlotClick?: (start: number, end: number) => void;
  onApptClick?: (apptId: number) => void;
  onBarClick?: (ev: React.MouseEvent<HTMLDivElement>) => void;
}

export default function YabanGanttBar({
  shift,
  roleKey,
  customColor,
  appointments = [],
  trackStart = 9 * 60,
  trackEnd = 18 * 60,
  height = 24,
  isSelected = false,
  showSlots = false,
  slotDuration = 30,
  selectedSlot = null,
  onSlotClick,
  onApptClick,
  onBarClick,
}: YabanGanttBarProps) {
  const span = Math.max(1, trackEnd - trackStart);
  function pct(min: number) { return Math.max(0, Math.min(100, (min - trackStart) / span * 100)); }

  const barColor = customColor || getRoleBarColor(roleKey);
  // 工作时段底色：完全实心色，与员工排班页A317完全一致，不加任何透明度
  const workBg = barColor;

  if (!shift) {
    return (
      <div style={{
        position: "relative", height, borderRadius: 4, overflow: "hidden",
        background: "repeating-linear-gradient(45deg,#ECEFF3,#ECEFF3 4px,#F6F8FA 4px,#F6F8FA 8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: 10, color: "#bcc6d0" }}>今日休息</span>
      </div>
    );
  }

  return (
    <div
      onClick={onBarClick}
      style={{ position: "relative", height, borderRadius: 4, overflow: "hidden", background: "#E2E8EF", cursor: onBarClick ? "pointer" : "default" }}
    >
      {/* 工作时段底色（按角色着色） */}
      {shift.segments.map(([s, e], si) => (
        <div key={si} style={{ position: "absolute", top: 0, bottom: 0, left: `${pct(s)}%`, width: `${pct(e) - pct(s)}%`, background: workBg, borderRadius: 4 }} />
      ))}

      {/* 预约占用块 */}
      {appointments.map((a, ai) => {
        if (!a.appointTime) return null;
        let s = timeToMin(a.appointTime);
        let e = a.endTime ? timeToMin(a.endTime) : s + (a.duration || 30);
        // 裁剪到在岗分段内
        const segs = shift.segments;
        const host = segs.find(([s0, e0]) => s < e0 && e > s0);
        if (host) { s = Math.max(s, host[0]); e = Math.min(e, host[1]); }
        else {
          const ns = segs.find(([s0]) => s0 >= s) || segs[segs.length - 1];
          if (!ns) return null;
          s = ns[0]; e = Math.min(s + (a.duration || 30), ns[1]);
        }
        if (e <= s) return null;
        const l = pct(s), w = Math.max(pct(e) - pct(s), 2);
        const st = STATUS[a.status] || STATUS.booked;
        const rL = l <= 0.5 ? 10 : 0, rR = pct(e) >= 99.5 ? 10 : 0;
        return (
          <div
            key={ai}
            onClick={ev => { ev.stopPropagation(); onApptClick && onApptClick(a.id); }}
            style={{
              position: "absolute", left: `${l}%`, width: `${w}%`, top: 0, bottom: 0,
              borderRadius: `${rL}px ${rR}px ${rR}px ${rL}px`,
              background: st.color, boxShadow: "0 1px 2px rgba(30,90,160,.12)",
              display: "flex", alignItems: "center", padding: "0 4px", overflow: "hidden", cursor: "pointer",
            }}
            title={a.patientName || ""}
          >
            <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden" }}>
              {(a.patientName || "").slice(0, 2)}
            </span>
          </div>
        );
      })}

      {/* 可点击时段格子（A316 用） */}
      {showSlots && shift.segments.map(([segStart, segEnd], si) => {
        const slots: React.ReactNode[] = [];
        for (let t = segStart; t < segEnd; t += slotDuration) {
          const slotEnd = Math.min(t + slotDuration, segEnd);
          const isOccupied = appointments.some(a => {
            if (!a.appointTime) return false;
            const as_ = timeToMin(a.appointTime);
            const ae = a.endTime ? timeToMin(a.endTime) : as_ + (a.duration || 30);
            return as_ < slotEnd && ae > t;
          });
          const isSelSlot = selectedSlot && selectedSlot[0] === t;
          const l = pct(t), w = Math.max(pct(slotEnd) - pct(t), 0.5);
          slots.push(
            <div
              key={t}
              onClick={ev => { ev.stopPropagation(); !isOccupied && onSlotClick && onSlotClick(t, slotEnd); }}
              title={`${hm(t)}–${hm(slotEnd)}`}
              style={{
                position: "absolute", top: 2, bottom: 2,
                left: `${l}%`, width: `calc(${w}% - 2px)`,
                borderRadius: 3,
                background: isSelSlot ? barColor : "transparent",
                border: isOccupied ? "none" : `1px dashed ${barColor}88`,
                cursor: isOccupied ? "default" : "pointer",
                opacity: isOccupied ? 0.3 : 1,
                transition: "background .12s",
                zIndex: 2,
              }}
            />
          );
        }
        return <React.Fragment key={si}>{slots}</React.Fragment>;
      })}
    </div>
  );
}

/**
 * YabanGanttTimeline — 甘特条时间刻度（顶部刻度行）
 */
export function YabanGanttTimeline({
  trackStart = 9 * 60,
  trackEnd = 18 * 60,
  paddingLeft = 62,
}: { trackStart?: number; trackEnd?: number; paddingLeft?: number }) {
  const span = Math.max(1, trackEnd - trackStart);
  const marks = Array.from({ length: 4 }, (_, i) => hm(Math.round(trackStart + span * i / 3)));
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#647386", paddingLeft }}>
      {marks.map((m, i) => <span key={i}>{m}</span>)}
    </div>
  );
}
