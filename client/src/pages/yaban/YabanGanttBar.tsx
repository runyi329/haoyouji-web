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
 *   height         — 甘特条高度，默认 44
 *   isSelected     — 是否选中（加深底色）
 *   showSlots      — 是否显示可点击时段格子（A316 用）
 *   slotDuration   — 时段格子间隔分钟，默认 30
 *   selectedSlot   — 当前选中的时段 [start, end]（分钟）
 *   onSlotClick    — 点击时段格子回调 (start, end) => void
 *   onApptClick    — 点击预约块回调 (apptId) => void（A314 用）
 *   onBarClick     — 点击进度条空白处回调（A314 用，按位置换算时间）
 */
import React, { useRef, useState, useEffect } from "react";
import { getRoleBarColor, timeToMin, hm } from "./yabanSharedStyles";

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

// 暖色+绿+橙系色盘（10色），与蓝紫系排班底色形成明显对比
// 根据预约ID哈希取色，同一预约永远是同一颜色
const WARM_PALETTE = [
  "#FF7043", // 珊瑚橙
  "#FFA726", // 琥珀金
  "#26A69A", // 翠绿
  "#EC407A", // 玫瑰红
  "#66BB6A", // 草绿
  "#FF5722", // 橙红
  "#FF8F00", // 深琥珀
  "#26C6DA", // 薄荷青
  "#F06292", // 玫瑰粉
  "#8D6E63", // 棕橙
];

function getApptColor(apptId: number): string {
  return WARM_PALETTE[Math.abs(apptId) % WARM_PALETTE.length];
}

export default function YabanGanttBar({
  shift,
  roleKey,
  customColor,
  appointments = [],
  trackStart = 9 * 60,
  trackEnd = 18 * 60,
  height = 44,
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

  // 获取容器实际像素宽度，用于判断预约块是否宽到可以显示文字
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerW(el.offsetWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const barColor = customColor || getRoleBarColor(roleKey);

  if (!shift) {
    return (
      <div style={{
        position: "relative", height, borderRadius: 6, overflow: "hidden",
        background: "repeating-linear-gradient(45deg,#ECEFF3,#ECEFF3 4px,#F6F8FA 4px,#F6F8FA 8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: 11, color: "#bcc6d0", letterSpacing: 1 }}>今日休息</span>
      </div>
    );
  }

  // 预约块铺满全高，四角与排班底色对齐

  return (
    <div
      ref={containerRef}
      onClick={onBarClick}
      style={{
        position: "relative", height, borderRadius: 6, overflow: "hidden",
        background: "#E2E8EF",
        cursor: onBarClick ? "pointer" : "default",
      }}
    >
      {/* 工作时段底色（按角色着色）+ 45°斜向白色细条纹覆盖 */}
      {shift.segments.map(([s, e], si) => (
        <div
          key={si}
          style={{
            position: "absolute", top: 0, bottom: 0,
            left: `${pct(s)}%`, width: `${Math.max(pct(e) - pct(s), 0)}%`,
            background: barColor,
          }}
        >
          {/* 斜纹叠加层：排班底色有纹理，预约块纯色，一眼可区分 */}
          <div style={{
            position: "absolute", inset: 0,
            background: "repeating-linear-gradient(45deg, rgba(255,255,255,0.18) 0px, rgba(255,255,255,0.18) 2px, transparent 2px, transparent 12px)",
          }} />
        </div>
      ))}

      {/* 预约占用块：暖色系纯色，上下留边距，圆角胶囊 */}
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
        const apptColor = getApptColor(a.id);
        // 圆角跟排班底色走：
        // 左圆角 = 预约贴着排班段左端 AND 排班段左端贴着容器左端（trackStart）
        // 右圆角 = 预约贴着排班段右端 AND 排班段右端贴着容器右端（trackEnd）
        const hostSeg = segs.find(([s0, e0]) => s >= s0 && e <= e0) || host;
        const R = 6, THRESH = 5;
        const segAtContainerLeft = hostSeg && hostSeg[0] <= trackStart + THRESH;
        const segAtContainerRight = hostSeg && hostSeg[1] >= trackEnd - THRESH;
        const rL = hostSeg && s <= hostSeg[0] + THRESH && segAtContainerLeft ? R : 0;
        const rR = hostSeg && e >= hostSeg[1] - THRESH && segAtContainerRight ? R : 0;
        return (
          <div
            key={ai}
            onClick={ev => { ev.stopPropagation(); onApptClick && onApptClick(a.id); }}
            style={{
              position: "absolute",
              left: `${l}%`, width: `${w}%`,
              top: 0, bottom: 0,
              borderRadius: `${rL}px ${rR}px ${rR}px ${rL}px`,
              background: apptColor,
              boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
              display: "flex", flexDirection: "column",
              alignItems: "flex-start", justifyContent: "center",
              padding: "0 6px", overflow: "hidden", cursor: "pointer",
              zIndex: 2,
            }}
            title={a.patientName || ""}
          >
            {/* 实际像素宽度 >= 28px 才显示文字，否则纯色块 */}
            {containerW > 0 && (w / 100) * containerW >= 28 && (
              <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", maxWidth: "100%" }}>
                {(a.patientName || "").slice(0, 3)}
              </span>
            )}
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
                position: "absolute", top: 3, bottom: 3,
                left: `${l}%`, width: `calc(${w}% - 2px)`,
                borderRadius: 4,
                background: isSelSlot ? barColor : "transparent",
                border: isOccupied ? "none" : `1.5px dashed ${barColor}99`,
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
