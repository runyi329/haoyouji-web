/**
 * 牙伴共享样式常量
 * A314（YabanSchedule）和 A316（YabanScheduleCreate）共用，保持视觉一致性。
 * 修改此文件，两个页面同步生效。
 */

// ── 主色卡 ──
export const SKY   = "#3D9FD6";
export const SKY_D = "#1E88D6";
export const SKY_L = "#EBF5FB";
export const INK   = "#26303C";
export const GRAY  = "#647386";
export const GRAY_L = "#9AA7B5";
export const LINE  = "#ECEFF3";
export const BORDER = "#DBE1E8";
export const BG    = "#F6F8FA";
export const REQ   = "#D9534F";
export const LABEL = "#3A4654";

// ── 热力图 10 档色阶（空闲→约满） ──
export const HEAT = [
  "#D2E9F6","#A6D2EE","#6FB6E2","#3D9FD6","#1E88D6",
  "#F0E2DD","#E6BDB4","#D89589","#C66E61","#A8463C",
];

/** 根据占用率 r（0~1）返回热力背景色 */
export function heatColor(r: number): string {
  if (r <= 0) return "#F0F4F8";
  return HEAT[Math.min(9, Math.max(0, Math.ceil(r * 10) - 1))];
}

/** 根据占用率 r（0~1）返回热力文字色（深色背景用白字） */
export function heatTextColor(r: number): string {
  const i = Math.ceil(r * 10) - 1;
  return (i >= 3 && i <= 4) || i >= 7 ? "#fff" : "#26303C";
}

// ── 角色颜色映射（与员工排班页 YabanClinicShift 完全一致，修改此处三页同步） ──
export const ROLE_COLOR_MAP: Record<string, { fg: string; bg: string; bar: string }> = {
  founder:      { fg: "#37449A", bg: "#E6E8F6", bar: "#5566C8" },  // 深靖蓝
  co_founder:   { fg: "#3A4FB0", bg: "#E7EAF8", bar: "#6072D8" },  // 靖蓝2
  owner:        { fg: "#3749A4", bg: "#E7EAF8", bar: "#5E72D4" },  // 靖蓝/紫
  shareholder:  { fg: "#5147A4", bg: "#ECE7F8", bar: "#7A5ED4" },  // 蓝紫
  doctor:       { fg: "#3777A4", bg: "#E7F1F8", bar: "#5EA3D4" },  // 蓝
  nurse:        { fg: "#379BA4", bg: "#E7F7F8", bar: "#5ECAD4" },  // 青
  assistant:    { fg: "#37A477", bg: "#E7F8F1", bar: "#5ED4A3" },  // 薄荷绿
  receptionist: { fg: "#6537A4", bg: "#EEE7F8", bar: "#8F5ED4" },  // 薰衣草紫
  finance:      { fg: "#A47737", bg: "#F8F1E7", bar: "#D4A35E" },  // 金橙
};
const ROLE_COLOR_FALLBACK = { fg: "#647386", bg: "#ECEFF3", bar: "#A8CCE8" };

/** 获取角色完整颜色（fg/bg/bar） */
export function getRoleColor(roleKey?: string) {
  return ROLE_COLOR_MAP[roleKey || ""] || ROLE_COLOR_FALLBACK;
}

/** 角色进度条主色（bar），未匹配返回默认蓝灰 */
export function getRoleBarColor(roleKey?: string): string {
  return getRoleColor(roleKey).bar;
}

/** 角色进度条浅底色（20% 透明度） */
export function getRoleBarBgColor(roleKey?: string): string {
  return getRoleBarColor(roleKey) + "33";
}

// ── 预约状态色 ──
export const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  booked:     { label: "已预约",   color: "#3D9FD6", bg: "#EBF5FB" },
  confirmed:  { label: "已确认",   color: "#1E88D6", bg: "#EBF5FB" },
  treating:   { label: "治疗中",   color: "#1567AE", bg: "#E0EDF7" },
  done:       { label: "已完成",   color: "#3D7A53", bg: "#EAF2EC" },
  missed:     { label: "失约",     color: "#9A6E1F", bg: "#F5EEDD" },
  cancelled:  { label: "已取消",   color: "#A8463C", bg: "#F7E9E7" },
  consulting: { label: "咨询中",   color: "#1B6FA8", bg: "#E9F1F8" },
  registered: { label: "已挂号",   color: "#1972B8", bg: "#E0EDF7" },
  treated:    { label: "治疗完成", color: "#3D7A53", bg: "#EAF2EC" },
  paid:       { label: "已结账",   color: "#3D7A53", bg: "#EAF2EC" },
  left:       { label: "已离开",   color: "#647386", bg: "#EEF1F4" },
};

/**
 * 从自定义进度条颜色（bar hex）推导匹配的标签背景色（bg）和文字色（fg）
 * bg = bar 色在 HSL 中亮度提高到 93%、饱和度降低到 55%
 * fg = bar 色在 HSL 中亮度降低到 30%、饱和度降低到 60%
 */
export function deriveColorsFromBar(barHex: string): { fg: string; bg: string; bar: string } {
  // 解析 hex -> r,g,b
  const r = parseInt(barHex.slice(1, 3), 16) / 255;
  const g = parseInt(barHex.slice(3, 5), 16) / 255;
  const b = parseInt(barHex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = h / 6;
  }
  // 转换回 hex
  function hslToHex(hh: number, ss: number, ll: number): string {
    const a = ss * Math.min(ll, 1 - ll);
    const f = (n: number) => {
      const k = (n + hh * 12) % 12;
      const c = ll - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return Math.round(255 * c).toString(16).padStart(2, "0");
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  }
  return {
    bar: barHex,
    bg: hslToHex(h, 0.55, 0.93),   // 极浅色背景
    fg: hslToHex(h, 0.60, 0.30),   // 深色文字
  };
}

// ── 日历甘特轨道参数 ──
/** 轨道开始时间（分钟），默认 9:00 */
export const TRACK_START = 9 * 60;
/** 轨道结束时间（分钟），默认 18:00 */
export const TRACK_END   = 18 * 60;
/** 轨道总分钟数 */
export const TRACK_MIN   = TRACK_END - TRACK_START;

/** 将分钟数换算为轨道百分比位置（0~100） */
export function pct(min: number): number {
  return Math.max(0, Math.min(100, (min - TRACK_START) / TRACK_MIN * 100));
}

// ── 日期工具 ──
export const WK = ["日","一","二","三","四","五","六"];

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}

export function hm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}

export function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
