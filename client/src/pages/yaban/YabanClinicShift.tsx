/**
 * 牙伴齿科管理 - 诊所排班页
 * 路由：/yaban/clinic-shift
 * UI：1:1 还原 yaban-schedule-proto/index.html 原型（医生排班 Tab）
 * 数据：真实 API（yabanShift.weekSchedule / saveTemplate / saveOverride / listTemplates）
 * 无模拟数据，无 emoji
 *
 * 设计色彩体系（对齐原型）：
 *   --sky:#2196C8  --sky-d:#1E88D6  --sky-l:#EAF4FE
 *   --warn:#E8973A  --warn-l:#FDF4E6  --warn-line:#F2D9AE
 *   --bg:#F0F4F8  --line:#eef1f5
 */
import { useState, useMemo, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useYabanClinic } from "./useYabanClinic";
import YabanClinicHeader from "./YabanClinicHeader";
import { getRoleColor, deriveColorsFromBar } from "./yabanSharedStyles";
import YabanHeatCalendar from "./YabanHeatCalendar";

// ── 颜色常量 ──
// 牙伴标准色卡：主色#1E88D6 / 渐变亮端#3D9FD6 / 浅底#EBF5FB
const SKY = "#3D9FD6", SKY_D = "#1E88D6", SKY_L = "#EBF5FB";
const WARN = "#9A6E1F", WARN_L = "#F5EEDD", WARN_LINE = "#E6D5AE";
const BG = "#F6F8FA", LINE = "#ECEFF3", GRAY = "#647386", INK = "#26303C";
const FREE_COLOR = "#A6D2EE";

// ── 角色字典（标签 / 配色 / 分组排序），与 YabanRoles 保持一致 ──
const ROLE_LABEL: Record<string, string> = {
  founder: "创始人", co_founder: "创始股东", owner: "院长", shareholder: "股东", doctor: "医生", nurse: "护士", assistant: "助理", receptionist: "前台", finance: "财务",
};
// 角色颜色从 yabanSharedStyles 共享模块读取，与 A314/A316 完全一致
const ROLE_ORDER = ["founder", "co_founder", "owner", "shareholder", "doctor", "nurse", "assistant", "receptionist", "finance"];
function roleLabel(k: string) { return ROLE_LABEL[k] || "员工"; }
function roleColor(k: string) { return getRoleColor(k); }
function roleRank(k: string) { const i = ROLE_ORDER.indexOf(k); return i < 0 ? 99 : i; }

// ── 工具函数 ──
function toMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function hm(min: number) {
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function addMin(t: string, m: number) {
  let tot = toMin(t) + m;
  tot = Math.min(tot, 23 * 60 + 59);
  return hm(tot);
}
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function getWeekStart(offset: number): Date {
  const today = new Date();
  const day = today.getDay();
  const mon = new Date(today);
  mon.setDate(today.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
  mon.setHours(0, 0, 0, 0);
  return mon;
}
function getWeekDates(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
}
const WK_FULL = ["日", "一", "二", "三", "四", "五", "六"];
const WK_SHORT = ["一", "二", "三", "四", "五", "六", "日"];

// ── 班次段类型 ──
interface Seg { start: string; end: string; isOT: boolean; }

// ── 重复模式 ──
const REPS = [
  { k: "none", t: "不重复" },
  { k: "daily", t: "每天" },
  { k: "weekly", t: "每周固定" },
  { k: "workday", t: "工作日" },
];

// ── 校验时段 ──
interface SegFlag { bad: boolean; overlap: boolean; over: boolean; msg: string; }
function validateSegs(segs: Seg[], bizOpen: string, bizClose: string): SegFlag[] {
  const flags: SegFlag[] = segs.map(() => ({ bad: false, overlap: false, over: false, msg: "" }));
  const bizO = toMin(bizOpen), bizC = toMin(bizClose);
  segs.forEach((s, i) => {
    const a = toMin(s.start), b = toMin(s.end);
    if (b <= a) { flags[i].bad = true; flags[i].msg = "结束时间需晚于开始"; }
    if (!s.isOT && (b > bizC || a < bizO)) { flags[i].over = true; if (!flags[i].msg) flags[i].msg = "超出营业时间，建议标为加班"; }
  });
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const a1 = toMin(segs[i].start), b1 = toMin(segs[i].end);
      const a2 = toMin(segs[j].start), b2 = toMin(segs[j].end);
      if (a1 < b2 && a2 < b1) {
        flags[i].overlap = true; flags[j].overlap = true;
        if (!flags[i].msg) flags[i].msg = "与其他时段重叠";
        if (!flags[j].msg) flags[j].msg = "与其他时段重叠";
      }
    }
  }
  return flags;
}

// ── 从模板生成 segs（含午休拆两段）──
function templateToSegs(tpl: {
  workStart: string; workEnd: string;
  breakStart?: string | null; breakEnd?: string | null;
  overtimeStart?: string | null; overtimeEnd?: string | null;
}): Seg[] {
  const segs: Seg[] = [];
  if (tpl.breakStart && tpl.breakEnd && toMin(tpl.breakStart) > toMin(tpl.workStart) && toMin(tpl.breakEnd) < toMin(tpl.workEnd)) {
    segs.push({ start: tpl.workStart, end: tpl.breakStart, isOT: false });
    segs.push({ start: tpl.breakEnd, end: tpl.workEnd, isOT: false });
  } else {
    segs.push({ start: tpl.workStart, end: tpl.workEnd, isOT: false });
  }
  if (tpl.overtimeStart && tpl.overtimeEnd) {
    segs.push({ start: tpl.overtimeStart, end: tpl.overtimeEnd, isOT: true });
  }
  return segs;
}

export default function YabanClinicShift() {
  const [, setLocation] = useLocation();
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  // 北京时间判断今天是否周末：周六或周日显示7天，周一到周五只显示5天
  const todayIsWeekend = useMemo(() => {
    const bjDateStr = new Date().toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\//g, "-");
    const [y, m, d] = bjDateStr.split("-").map(Number);
    const bjDay = new Date(y, m - 1, d).getDay();
    return bjDay === 0 || bjDay === 6;
  }, []);
  // 从顾客预约页带过来的选中日期（sessionStorage），否则默认今天
  const initDate = useMemo(() => {
    try {
      const s = sessionStorage.getItem("yaban_shift_date");
      if (s) { const [y, m, dd] = s.split("-").map(Number); if (y && m && dd) { const d = new Date(y, m - 1, dd); d.setHours(0, 0, 0, 0); return d; } }
    } catch {}
    return today;
  }, [today]);
  // 计算初始周偏移，使带过来的日期落在可见周内
  const initWeekOffset = useMemo(() => {
    const ms = initDate.getTime() - getWeekStart(0).getTime();
    return Math.floor(ms / (7 * 24 * 3600 * 1000));
  }, [initDate]);
  const [weekOffset, setWeekOffset] = useState(initWeekOffset);
  const [selDate, setSelDate] = useState(initDate);
  // 周/月视图切换
  const [calMode, setCalMode] = useState<"week"|"month">("week");
  const [monthCursor, setMonthCursor] = useState(() => new Date(initDate.getFullYear(), initDate.getMonth(), 1));
  // 顶栏固定吸顶：实测高度给主体留等高占位
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerH, setHeaderH] = useState(96);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () => setHeaderH(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => { ro.disconnect(); window.removeEventListener("resize", update); };
  }, []);
  const weekStart = useMemo(() => getWeekStart(weekOffset), [weekOffset]);
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const weekStartStr = toDateStr(weekStart);

  // 批量模式
  const [batchMode, setBatchMode] = useState(false);
  const [batchSel, setBatchSel] = useState<Set<number>>(new Set());

  // 排班抽屉
  const [schDrawer, setSchDrawer] = useState<{
    open: boolean;
    staffUserId: number;
    staffName: string;
    roleKey: string;
    date: string;
    segs: Seg[];
  } | null>(null);

  // 班次模板弹窗
  const [bizOpen, setBizOpen] = useState("09:00");
  const [bizClose, setBizClose] = useState("18:00");

  // 当前医院（多医院隔离）
  const { currentTenantId, current } = useYabanClinic();
  const clinicName = current?.name || current?.shortName || "";

  // API（按当前医院 tenantId 隔离）
  const { data: schedData, refetch } = trpc.yabanShift.weekSchedule.useQuery(
    { weekStart: weekStartStr, tenantId: currentTenantId ?? undefined },
    { enabled: currentTenantId != null }
  );
  const { data: allTemplates = [], refetch: refetchTpl } = trpc.yabanShift.listTemplates.useQuery(
    { tenantId: currentTenantId ?? undefined },
    { enabled: currentTenantId != null }
  );
  // 门店全体在职成员（含未建排班模板者）
  const { data: allMembers = [] } = trpc.yabanAppointment.listMembers.useQuery(
    { tenantId: currentTenantId ?? undefined },
    { enabled: currentTenantId != null }
  );
  // 角色筛选（null=全部）
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const saveOverrideMut = trpc.yabanShift.saveOverride.useMutation({
    onSuccess: () => { refetch(); toast.success("排班已保存"); },
    onError: (e) => toast.error(e.message),
  });
  const saveTemplateMut = trpc.yabanShift.saveTemplate.useMutation({
    onSuccess: () => { refetchTpl(); refetch(); toast.success("模板已更新"); },
    onError: (e) => toast.error(e.message),
  });
  const clearOverridesMut = trpc.yabanShift.clearOverrides.useMutation({
    onSuccess: () => { refetch(); toast.success("排班已清空"); },
    onError: (e) => toast.error(e.message),
  });
  const saveDaySegsMut = trpc.yabanShift.saveDaySegs.useMutation({
    onSuccess: () => { refetchTpl(); refetch(); toast.success("周模板已保存"); },
    onError: (e) => toast.error(e.message),
  });
  const clearDaySegsMut = trpc.yabanShift.clearDaySegs.useMutation({
    onSuccess: () => { refetchTpl(); refetch(); toast.success("周模板已清空"); },
    onError: (e) => toast.error(e.message),
  });

  // 月统计数据（用于月视图热力日历）
  const { data: monthStats = {} } = trpc.yabanAppointment.monthStats.useQuery({
    year: calMode === "month" ? monthCursor.getFullYear() : selDate.getFullYear(),
    month: calMode === "month" ? monthCursor.getMonth() + 1 : selDate.getMonth() + 1,
    tenantId: currentTenantId ?? undefined,
  }, { enabled: currentTenantId != null });

  // 门店营业时间（后端持久化，按医院隔离）
  const { data: bizHours, refetch: refetchBiz } = trpc.yabanShift.getBusinessHours.useQuery(
    { tenantId: currentTenantId ?? undefined },
    { enabled: currentTenantId != null }
  );
  useEffect(() => {
    if (bizHours) { setBizOpen(bizHours.open); setBizClose(bizHours.close); }
  }, [bizHours]);
  const saveBizMut = trpc.yabanShift.saveBusinessHours.useMutation({
    onSuccess: () => { refetchBiz(); },
    onError: (e) => toast.error(e.message),
  });

  const templates = schedData?.templates ?? [];
  const overrides = schedData?.overrides ?? [];
  const shiftDaySegs = schedData?.daySegs ?? [];  // 每员工每天独立时段（新周模板）

  // dow 计算：本地时间，0=周一...6=周日（与数据库存储一致，避免 UTC 偏移）
  function dateToDow(date: Date): number {
    return (date.getDay() + 6) % 7;
  }

  // 全员排班清单：以门店全体在职成员为准，合并已有模板（未建模板者也可排班）
  // 行结构 { staffUserId, staffName, roleKey, hasTemplate }
  const roster = useMemo(() => {
    const tplMap = new Map<number, any>();
    (templates as any[]).forEach((t) => tplMap.set(t.staffUserId, t));
    const list: { staffUserId: number; staffName: string; roleKey: string; roleKeys: string[]; hasTemplate: boolean; color?: string }[] = [];
    const seen = new Set<number>();
    (allMembers as any[]).forEach((m) => {
      seen.add(m.userId);
      const tpl = tplMap.get(m.userId);
      list.push({
        staffUserId: m.userId,
        staffName: m.name || tpl?.staffName || "",
        roleKey: m.roleKey || tpl?.roleKey || "doctor",
        roleKeys: (m.roleKeys as string[] | undefined) || [m.roleKey || tpl?.roleKey || "doctor"],
        hasTemplate: !!tpl,
        color: tpl?.color,  // 自定义进度条颜色
      });
    });
    // 尺底：有模板但名册查不到的人（历史数据），也纳入
    (templates as any[]).forEach((t) => {
      if (!seen.has(t.staffUserId)) {
        list.push({ staffUserId: t.staffUserId, staffName: t.staffName, roleKey: t.roleKey || "doctor", roleKeys: [t.roleKey || "doctor"], hasTemplate: true, color: t.color });
      }
    });
    list.sort((a, b) => roleRank(a.roleKey) - roleRank(b.roleKey) || a.staffUserId - b.staffUserId);
    return list;
  }, [templates, allMembers]);

  // 经角色筛选后的清单
  const filteredRoster = useMemo(
    () => (roleFilter ? roster.filter((r) => (r.roleKeys || [r.roleKey]).includes(roleFilter)) : roster),
    [roster, roleFilter]
  );

  // 出现过的角色（用于筛选 chips，保持固定顺序）
  const presentRoles = useMemo(() => {
    const s = new Set(roster.flatMap((r) => r.roleKeys || [r.roleKey]));
    return ROLE_ORDER.filter((k) => s.has(k));
  }, [roster]);

  // 计算某员工某日的实际排班 segs
  function getStaffDaySegs(staffUserId: number, date: Date): Seg[] {
    const dateStr = toDateStr(date);
    const ov = overrides.find((o: any) => o.staffUserId === staffUserId && o.overrideDate === dateStr);
    if (ov) {
      if (ov.shiftType === "rest" || ov.shiftType === "leave") return [];
      if (ov.workStart && ov.workEnd) {
        const segs: Seg[] = [];
        if (ov.breakStart && ov.breakEnd && toMin(ov.breakStart) > toMin(ov.workStart) && toMin(ov.breakEnd) < toMin(ov.workEnd)) {
          segs.push({ start: ov.workStart, end: ov.breakStart, isOT: false });
          segs.push({ start: ov.breakEnd, end: ov.workEnd, isOT: false });
        } else {
          segs.push({ start: ov.workStart, end: ov.workEnd, isOT: false });
        }
        if (ov.overtimeStart && ov.overtimeEnd) segs.push({ start: ov.overtimeStart, end: ov.overtimeEnd, isOT: true });
        return segs;
      }
    }
    // 2) 新 daySegs（与 YabanSchedule getEffectiveShift 口径一致）
    const dow = dateToDow(date); // 0=周一...6=周日
    const dsEntry = shiftDaySegs.find((s: any) => Number(s.staffUserId) === staffUserId);
    if (dsEntry && Array.isArray(dsEntry.segs)) {
      const seg = dsEntry.segs.find((x: any) => Number(x.dow) === dow);
      if (!seg) return [];       // 该天无记录
      if (seg.isRest) return []; // 休息日
      return templateToSegs({ workStart: seg.workStart, workEnd: seg.workEnd, breakStart: seg.breakStart, breakEnd: seg.breakEnd });
    }
    // 3) 回退旧 template（兼容未迁移员工，workDays 强制转 Number）
    const tpl = templates.find((t: any) => t.staffUserId === staffUserId);
    if (!tpl) return [];
    const days: number[] = (tpl.workDays || []).map(Number);
    if (days.length > 0 && !days.includes(dow)) return [];
    return templateToSegs(tpl);
  }

  // 动态时间轴范围
  const trackRange = useMemo(() => {
    let mn = toMin(bizOpen), mx = toMin(bizClose);
    templates.forEach((t: any) => {
      mn = Math.min(mn, toMin(t.workStart));
      mx = Math.max(mx, toMin(t.workEnd));
      if (t.overtimeStart) mn = Math.min(mn, toMin(t.overtimeStart));
      if (t.overtimeEnd) mx = Math.max(mx, toMin(t.overtimeEnd));
    });
    return { start: mn, end: mx };
  }, [templates, bizOpen, bizClose]);

  function pctM(min: number) {
    const { start, end } = trackRange;
    if (end <= start) return 0;
    return Math.max(0, Math.min(100, ((min - start) / (end - start)) * 100));
  }

  // 标尺四等分
  const rulerMarks = useMemo(() => {
    const { start, end } = trackRange;
    return Array.from({ length: 4 }, (_, i) => hm(Math.round(start + (end - start) * i / 3)));
  }, [trackRange]);

  // 统计（基于当前筛选后的成员）
  const stats = useMemo(() => {
    let onCnt = 0, totMin = 0, otMin = 0;
    filteredRoster.forEach((r) => {
      const segs = getStaffDaySegs(r.staffUserId, selDate);
      if (segs.length > 0) {
        onCnt++;
        segs.forEach((s: Seg) => { const d = toMin(s.end) - toMin(s.start); totMin += d; if (s.isOT) otMin += d; });
      }
    });
    return { onCnt, totMin, otMin };
  }, [filteredRoster, overrides, selDate]);

  // 本周每天在岗人数（用于格子底部小标签）
  const weekDayOnCnt = useMemo(() => {
    return weekDates.map((d) => {
      let cnt = 0;
      filteredRoster.forEach((r) => { if (getStaffDaySegs(r.staffUserId, d).length > 0) cnt++; });
      return cnt;
    });
  }, [filteredRoster, overrides, weekDates]);

  // 月视图热力占用率：当天在岗人数 / 全员人数
  const memberCount = filteredRoster.length || 1;
  function cellLoad(d: Date): number {
    const stat = (monthStats as Record<string, { cnt: number; minutes: number; doctors: number }>)[toDateStr(d)];
    if (!stat || stat.minutes <= 0) return 0;
    const OPEN_MIN = 9 * 60; // 默认营业时长 540 分钟
    const docs = Math.max(memberCount, stat.doctors || 0, 1);
    const raw = stat.minutes / (docs * OPEN_MIN);
    return Math.pow(Math.max(0, Math.min(1, raw)), 0.5);
  }

  // 打开排班抽屉
  function openSch(staffUserId: number, staffName: string, date: Date) {
    const segs = getStaffDaySegs(staffUserId, date);
    const initSegs = segs.length > 0 ? segs : templateToSegs({ workStart: bizOpen, workEnd: bizClose });
    const roleKey = roster.find((r) => r.staffUserId === staffUserId)?.roleKey || "doctor";
    setSchDrawer({ open: true, staffUserId, staffName, roleKey, date: toDateStr(date), segs: initSegs });
  }

  // 批量操作
  function toggleBatch() { setBatchMode(!batchMode); setBatchSel(new Set()); }
  function toggleBatchSel(id: number) {
    if (!batchMode) return;
    const next = new Set(batchSel);
    if (next.has(id)) next.delete(id); else next.add(id);
    setBatchSel(next);
  }
  function batchSelectAll() {
    if (batchSel.size === filteredRoster.length) setBatchSel(new Set());
    else setBatchSel(new Set(filteredRoster.map((r) => r.staffUserId)));
  }
  function batchApplyRest() {
    if (!batchSel.size) { toast.error("请先勾选员工"); return; }
    const dateStr = toDateStr(selDate);
    Promise.all(Array.from(batchSel).map(id =>
      saveOverrideMut.mutateAsync({ staffUserId: id, overrideDate: dateStr, shiftType: "rest", tenantId: currentTenantId ?? undefined })
    )).then(() => { setBatchMode(false); setBatchSel(new Set()); });
  }
  function batchCopyTemplate() {
    if (!batchSel.size) { toast.error("请先勾选员工"); return; }
    const dateStr = toDateStr(selDate);
    Promise.all(Array.from(batchSel).map(id => {
      const tpl = allTemplates.find((t: any) => t.staffUserId === id);
      // 未建模板者回退使用门店营业时间作为默认班次
      return saveOverrideMut.mutateAsync({
        staffUserId: id, overrideDate: dateStr, shiftType: "custom",
        workStart: tpl?.workStart ?? bizOpen, workEnd: tpl?.workEnd ?? bizClose,
        breakStart: tpl?.breakStart ?? undefined, breakEnd: tpl?.breakEnd ?? undefined,
        overtimeStart: tpl?.overtimeStart ?? undefined, overtimeEnd: tpl?.overtimeEnd ?? undefined,
        tenantId: currentTenantId ?? undefined,
      });
    })).then(() => { setBatchMode(false); setBatchSel(new Set()); });
  }

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: "-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif", color: INK, paddingBottom: batchMode ? 120 : 40 }}>

      {/* 顶栏（固定吸顶） */}
      <div ref={headerRef} style={{ background: `linear-gradient(90deg,${SKY},#3D9FD6)`, color: "#fff", padding: "14px 16px 12px", position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ flex: 1, display: "flex", justifyContent: "flex-start" }}>
            <div style={{ fontSize: 22, width: 28, cursor: "pointer" }} onClick={() => setLocation("/yaban/schedule")}>‹</div>
          </div>
          <div style={{ display: "flex", gap: 6, background: "rgba(255,255,255,.18)", borderRadius: 6, padding: 4, flexShrink: 0 }}>
            <div onClick={() => { try { sessionStorage.setItem("yaban_sched_date", toDateStr(selDate)); } catch {} setLocation("/yaban/schedule"); }} style={{ padding: "7px 14px", borderRadius: 4, fontSize: 14, fontWeight: 600, color: "#EBF5FB", whiteSpace: "nowrap", cursor: "pointer" }}>顾客预约</div>
            <div style={{ padding: "7px 14px", borderRadius: 4, fontSize: 14, fontWeight: 600, background: "#fff", color: SKY_D, boxShadow: "0 1px 3px rgba(0,0,0,.1)", whiteSpace: "nowrap" }}>员工排班</div>
          </div>
          <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
            <button onClick={() => setLocation("/yaban/schedule/create")} aria-label="新建预约" style={{ width: 32, height: 32, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.12)", border: "none", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", cursor: "pointer" }}>
              <img src="/icon-add.webp" alt="" style={{ width: 32, height: 32, objectFit: "cover", borderRadius: "50%" }} />
            </button>
          </div>
        </div>
        <YabanClinicHeader
          asBar
          compact
          rightSlot={
            <span style={{ whiteSpace: "nowrap" }}>
              {weekDates[0].getMonth() + 1}月{weekDates[0].getDate()}日 – {weekDates[6].getMonth() + 1}月{weekDates[6].getDate()}日 · 在岗 {stats.onCnt} 人
            </span>
          }
        />
      </div>
      {/* 等高占位，避免被固定顶栏遮挡 */}
      <div style={{ height: headerH }} aria-hidden />

      {/* 周/月日历：周视图为自定义格子，月视图为 YabanHeatCalendar 热力日历 */}
      {calMode === "week" ? (
        <div style={{ background: "#fff", padding: "10px 16px 0", borderBottom: `1px solid ${LINE}` }}>
          {/* 周导航 */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div onClick={() => setWeekOffset(w => w - 1)} style={{ width: 30, height: 30, borderRadius: 4, background: "#F6F8FA", color: GRAY, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, cursor: "pointer" }}>‹</div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: INK }}>
                {weekDates[0].getMonth() + 1}月{weekDates[0].getDate()}日 – {weekDates[6].getMonth() + 1}月{weekDates[6].getDate()}日
              </div>
              <div style={{ fontSize: 11, color: weekOffset === 0 ? SKY_D : GRAY, marginTop: 2, fontWeight: weekOffset === 0 ? 600 : 400 }}>
                {weekOffset === 0 ? "本周" : weekOffset < 0 ? `前${-weekOffset}周` : `后${weekOffset}周`}
              </div>
            </div>
            <div onClick={() => setWeekOffset(w => w + 1)} style={{ width: 30, height: 30, borderRadius: 4, background: "#F6F8FA", color: GRAY, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, cursor: "pointer" }}>›</div>
          </div>
          {/* 格子行：周末显示7天铺满，周一到周五只显示5天（周六日隐藏在屏幕外） */}
          <div style={todayIsWeekend
            ? { overflowX: "auto", margin: "0 -16px", padding: "0 16px 2px", WebkitOverflowScrolling: "touch", scrollbarWidth: "none", msOverflowStyle: "none" }
            : { overflow: "hidden", margin: "0 -16px", padding: "0 16px 2px" }}>
            <div style={{ display: "flex", gap: 3 }}>
              {["一","二","三","四","五","六","日"].map((label, i) => {
                const d = weekDates[i];
                const isSelected = toDateStr(d) === toDateStr(selDate);
                const isToday = toDateStr(d) === toDateStr(today);
                const isWeekend = i >= 5;
                const cellW = todayIsWeekend ? "calc((100vw - 50px) / 7)" : "calc((100vw - 44px) / 5)";
                const onCnt = weekDayOnCnt[i] ?? 0;
                const bg = isSelected ? SKY_D : isToday ? SKY_L : "#F6F8FA";
                const bd = isSelected ? SKY_D : isToday ? SKY : LINE;
                const tc = isSelected ? "#fff" : INK;
                const gc = isSelected ? "rgba(255,255,255,.75)" : GRAY;
                return (
                  <div key={i}
                    onClick={() => setSelDate(d)}
                    style={{ width: cellW, flexShrink: 0,
                      marginLeft: (!todayIsWeekend && i === 5) ? 16 : 0,
                      height: 72, borderRadius: 10, display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center", gap: 2,
                      cursor: "pointer", transition: "all .18s",
                      background: bg, border: `2px solid ${bd}`,
                      boxShadow: isSelected ? "0 2px 8px rgba(30,136,214,.25)" : "none" }}>
                    <span style={{ fontSize: todayIsWeekend ? 10 : 11, color: gc, fontWeight: 500 }}>周{label}</span>
                    <span style={{ fontSize: todayIsWeekend ? 16 : 20, fontWeight: 700, color: tc, lineHeight: 1.1 }}>{d.getDate()}</span>
                    <span style={{ fontSize: 10, color: isSelected ? "rgba(255,255,255,.8)" : (onCnt > 0 ? SKY_D : "transparent"), fontWeight: 600, lineHeight: 1 }}>{onCnt > 0 ? `${onCnt}人` : "·"}</span>
                  </div>
                );
              })}
            </div>
          </div>
          {/* 展开按鈕：点击切换到月视图 */}
          <div
            onClick={() => { setCalMode("month"); setMonthCursor(new Date(selDate.getFullYear(), selDate.getMonth(), 1)); }}
            style={{ textAlign: "center", color: "#DBE1E8", fontSize: 18, lineHeight: 1, padding: "5px 0 8px", cursor: "pointer" }}
          >⌄</div>
        </div>
      ) : (
        <YabanHeatCalendar
          selDate={selDate}
          onSelectDate={(d) => { setSelDate(d); setWeekOffset(Math.round((d.getTime() - today.getTime()) / (7 * 86400000))); }}
          getCellLoad={cellLoad}
          monthCursor={monthCursor}
          onMonthChange={setMonthCursor}
          disablePast={false}
          showToggle={true}
          calMode="month"
          onToggleMode={() => setCalMode("week")}
          weekDates={weekDates}
        />
      )}

      {/* 操作条 */}
      <div style={{ background: "#fff", padding: "8px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${LINE}` }}>
        <div onClick={toggleBatch} style={{
          fontSize: 13, fontWeight: 600, padding: "5px 13px", borderRadius: 4, cursor: "pointer", transition: ".16s",
          background: batchMode ? SKY_D : SKY_L, color: batchMode ? "#fff" : SKY_D,
          border: `1px solid ${batchMode ? SKY_D : SKY}`,
        }}>{batchMode ? "退出批量" : "批量排班"}</div>
        <span style={{ fontSize: 11, color: GRAY }}>
          在岗 {stats.onCnt}/{filteredRoster.length} 人 · 工时 {(stats.totMin / 60).toFixed(1)}h
          {stats.otMin > 0 ? ` · 加班 ${(stats.otMin / 60).toFixed(1)}h` : ""}
        </span>
      </div>

      {/* 角色筛选 chips */}
      {presentRoles.length > 1 && (
        <div style={{ background: "#fff", padding: "8px 14px", display: "flex", gap: 7, overflowX: "auto", borderBottom: `1px solid ${LINE}`, WebkitOverflowScrolling: "touch" }}>
          {[null, ...presentRoles].map((rk) => {
            const active = roleFilter === rk;
            const label = rk === null ? "全部" : roleLabel(rk);
            const cnt = rk === null ? roster.length : roster.filter((r) => r.roleKey === rk).length;
            return (
              <div key={rk ?? "all"} onClick={() => setRoleFilter(rk)} style={{
                flexShrink: 0, fontSize: 12.5, fontWeight: 600, padding: "5px 12px", borderRadius: 8, cursor: "pointer", transition: ".16s",
                background: active ? SKY_D : "#F6F8FA", color: active ? "#fff" : "#647386",
                border: `1px solid ${active ? SKY_D : "#e3e9ef"}`, whiteSpace: "nowrap",
              }}>{label} {cnt}</div>
            );
          })}
        </div>
      )}

      {/* 时间标尺 */}
      {filteredRoster.length > 0 && (
        <div style={{ background: "#fff", padding: "12px 14px 6px", borderBottom: `1px solid ${LINE}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: GRAY, paddingLeft: 116 }}>
            {rulerMarks.map((m, i) => <span key={i}>{m}</span>)}
          </div>
        </div>
      )}

      {/* 员工排班行（按角色分组） */}
      {filteredRoster.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: GRAY }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={GRAY} strokeWidth="1.5" style={{ margin: "0 auto 12px", display: "block" }}>
            <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
          </svg>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#26303C", marginBottom: 4 }}>暂无可排班的员工</div>
          <div style={{ fontSize: 12, color: GRAY }}>请先在员工管理中添加成员</div>
        </div>
      ) : (
        filteredRoster.map((r) => {
          const segs = getStaffDaySegs(r.staffUserId, selDate);
          const hasShift = segs.length > 0;
          const isBatchSel = batchSel.has(r.staffUserId);
          const rcBase = roleColor(r.roleKey);
          // 自定义颜色：优先用模板中保存的颜色，头像和标签与进度条保持同一风格：有色底+白字
          const hasCustomColor = !!(r.color && r.color !== "#1E88D6");
          const rc = hasCustomColor
            ? { bar: r.color!, bg: r.color!, fg: "#ffffff" }
            : rcBase;
          const barColor = rc.bar;

          let subText = "休息";
          if (hasShift) {
            const work = segs.filter((s: Seg) => !s.isOT).map((s: Seg) => `${s.start}–${s.end}`).join("、");
            const ot = segs.filter((s: Seg) => s.isOT);
            subText = work + (ot.length ? ` · 加班${ot.map((s: Seg) => `${s.start}–${s.end}`).join("、")}` : "");
          }

          return (
            <div
              key={r.staffUserId}
              onClick={() => { if (batchMode) { toggleBatchSel(r.staffUserId); } else { openSch(r.staffUserId, r.staffName, selDate); } }}
              style={{ background: "#fff", padding: "11px 14px", display: "flex", alignItems: "center", gap: 9, borderBottom: `1px solid ${LINE}`, cursor: batchMode ? "pointer" : "default", userSelect: "none" }}
            >
              {batchMode && (
                <div style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${isBatchSel ? SKY_D : "#DBE1E8"}`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: isBatchSel ? SKY_D : "transparent", transition: ".16s" }}>
                  {isBatchSel && <svg width="10" height="10" viewBox="0 0 10 10"><polyline points="1.5,5 4,8 8.5,2" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </div>
              )}
              {/* 列一：头像 */}
              <div style={{ width: 38, height: 38, flexShrink: 0, borderRadius: "50%", background: hasShift ? rc.bg : "#e8ecf0", color: hasShift ? rc.fg : "#9AA7B5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 600, filter: hasShift ? "none" : "grayscale(1)", opacity: hasShift ? 1 : 0.7 }}>{r.staffName.charAt(0)}</div>
              {/* 列二：名字(上) 职称(下) */}
              <div style={{ width: 60, flexShrink: 0, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#26303C", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.staffName}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 2, marginTop: 2 }}>
                  {(r.roleKeys || [r.roleKey]).map((rk: string) => {
                    const tagRc = roleColor(rk);
                    const tagBg = hasCustomColor ? rc.bg : tagRc.bg;
                    const tagFg = hasCustomColor ? rc.fg : tagRc.fg;
                    return <span key={rk} style={{ display: "inline-block", fontSize: 10, fontWeight: 600, lineHeight: 1.5, padding: "0 5px", borderRadius: 4, color: tagFg, background: tagBg }}>{roleLabel(rk)}</span>;
                  })}
                </div>
              </div>
              {/* 列三：进度条(色块内显示时长) + 工时文字与色块左对齐 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {!hasShift ? (
                  <div style={{ position: "relative", height: 24, borderRadius: 4, overflow: "hidden", background: "repeating-linear-gradient(45deg,#ECEFF3,#ECEFF3 4px,#F6F8FA 4px,#F6F8FA 8px)", cursor: batchMode ? "inherit" : "pointer" }}>
                    <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#bcc6d0" }}>{r.hasTemplate ? "今日休息 · 点击排班" : "未排班 · 点击排班"}</span>
                  </div>
                ) : (
                  <>
                    <div title="点击编辑排班" style={{ position: "relative", height: 24, borderRadius: 4, overflow: "hidden", background: "#E2E8EF", cursor: batchMode ? "inherit" : "pointer" }}>
                      {segs.map((s: Seg, si: number) => {
                        const L = pctM(toMin(s.start)), W = pctM(toMin(s.end)) - L;
                        const durH = (toMin(s.end) - toMin(s.start)) / 60;
                        const durTxt = Number.isInteger(durH) ? `${durH}h` : `${durH.toFixed(1)}h`;
                        return (
                          <div key={si} style={{
                            position: "absolute", left: `${L}%`, width: `${Math.max(W, 1)}%`, top: 0, height: "100%",
                            background: s.isOT ? WARN : barColor,
                            display: "flex", alignItems: "center", justifyContent: "center", padding: "0 2px", overflow: "hidden",
                          }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", textShadow: "0 1px 1px rgba(0,0,0,.15)" }}>{s.isOT ? `加班${durTxt}` : durTxt}</span>
                          </div>
                        );
                      })}
                    </div>
                    {/* 工时文字：按段定位在色块正下方，与色块对齐 */}
                    <div style={{ position: "relative", height: 14, marginTop: 3 }}>
                      {segs.map((s: Seg, si: number) => {
                        const L = pctM(toMin(s.start)), W = pctM(toMin(s.end)) - L;
                        return (
                          <div key={si} style={{ position: "absolute", left: `${L}%`, width: `${Math.max(W, 1)}%`, top: 0, textAlign: "center", fontSize: 10, color: GRAY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.start}–{s.end}</div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })
      )}

      <div style={{ textAlign: "center", fontSize: 11, color: "#9AA7B5", padding: "18px 14px" }}>排班后，对应时段将在「预约」视图变为可约</div>

      {/* 批量操作底栏 */}
      {batchMode && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: "#fff", borderTop: `1px solid ${LINE}`, padding: "12px 16px 20px", boxShadow: "0 -4px 16px rgba(20,40,60,.08)", zIndex: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13, color: "#26303C", fontWeight: 600, marginBottom: 10 }}>
            <span>已选 {batchSel.size} 人</span>
            <span onClick={batchSelectAll} style={{ color: SKY_D, fontWeight: 500, cursor: "pointer" }}>{batchSel.size === templates.length ? "取消全选" : "全选"}</span>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div onClick={batchCopyTemplate} style={{ flex: 1, textAlign: "center", fontSize: 13, fontWeight: 600, padding: 10, borderRadius: 4, cursor: "pointer", background: SKY_L, color: SKY_D, border: `1px solid ${SKY}` }}>复制模板班次</div>
            <div onClick={batchApplyRest} style={{ flex: 1, textAlign: "center", fontSize: 13, fontWeight: 600, padding: 10, borderRadius: 4, cursor: "pointer", background: "#f1f3f5", color: "#647386", border: "1px solid #dde3e8" }}>设为休息</div>
          </div>
        </div>
      )}

      {/* 排班抽屉 */}
      {schDrawer?.open && (
        <SchDrawer
          staffUserId={schDrawer.staffUserId}
          staffName={schDrawer.staffName}
          roleKey={schDrawer.roleKey}
          clinicName={clinicName}
          date={schDrawer.date}
          initSegs={schDrawer.segs}
          bizOpen={bizOpen}
          bizClose={bizClose}
          onSaveBiz={(open, close) => saveBizMut.mutate({ open, close, tenantId: currentTenantId ?? undefined })}
          templates={allTemplates}
          tenantId={currentTenantId ?? undefined}
          onSaveDaySegs={(days, color) => {
            saveDaySegsMut.mutate({
              staffUserId: schDrawer.staffUserId,
              tenantId: currentTenantId ?? undefined,
              days,
            });
            // 同步保存颜色到模板
            const tpl = allTemplates.find((t: any) => t.staffUserId === schDrawer.staffUserId);
            if (tpl) {
              saveTemplateMut.mutate({
                id: tpl.id, staffUserId: schDrawer.staffUserId,
                workStart: tpl.workStart, workEnd: tpl.workEnd,
                workDays: tpl.workDays, color,
                tenantId: currentTenantId ?? undefined,
              });
            }
            setSchDrawer(null);
          }}
          onClearDaySegs={() => {
            clearDaySegsMut.mutate({
              staffUserId: schDrawer.staffUserId,
              tenantId: currentTenantId ?? undefined,
            });
            // 清空后留在编辑页面，不关闭抽屉
          }}
          onClose={() => setSchDrawer(null)}
          onClear={(fromDate, toDate) => {
            clearOverridesMut.mutate({
              staffUserId: schDrawer.staffUserId,
              fromDate,
              toDate,
              tenantId: currentTenantId ?? undefined,
            });
            setSchDrawer(null);
          }}
          onSave={(segs, rep, wdays, repEndDate, color) => {
            const hasErr = validateSegs(segs, bizOpen, bizClose).some(f => f.bad || f.overlap);
            if (hasErr) { toast.error("时段有误，请调整后保存"); return; }
            const shiftType = segs.length === 0 ? "rest" : "custom";
            const workSegs = segs.filter(s => !s.isOT).slice().sort((a, b) => toMin(a.start) - toMin(b.start));
            const otSegs = segs.filter(s => s.isOT);
            const workStart = workSegs[0]?.start ?? null;
            const workEnd = workSegs[workSegs.length - 1]?.end ?? null;
            // 两段工作时段间的空档作为午休（break）存入，以便预约页/本页回读时恢复为两段。
            // （当前表结构仅支持单个 break，多于两段时取第一个空档）
            let breakStart: string | null = null, breakEnd: string | null = null;
            for (let k = 0; k < workSegs.length - 1; k++) {
              if (toMin(workSegs[k + 1].start) > toMin(workSegs[k].end)) {
                breakStart = workSegs[k].end; breakEnd = workSegs[k + 1].start; break;
              }
            }
            const otStart = otSegs[0]?.start ?? null;
            const otEnd = otSegs[0]?.end ?? null;
            const dates: string[] = [];
            if (rep === "none") {
              dates.push(schDrawer.date);
            } else {
              const end = new Date(repEndDate);
              // 修复 Bug：每周固定模式下，从当天所在周的周一开始循环，确保所有选中的星期几都能被包含
              // 而不是从点击的那天开始（那天可能不在选中的星期几里）
              let startDate: Date;
              if (rep === "weekly") {
                // 找到当天所在周的周一（不跨周）
                const clickedDate = new Date(schDrawer.date);
                const clickedDow = clickedDate.getDay(); // 0=周日
                const daysToMon = clickedDow === 0 ? 6 : clickedDow - 1;
                startDate = new Date(clickedDate);
                startDate.setDate(clickedDate.getDate() - daysToMon);
              } else {
                startDate = new Date(schDrawer.date);
              }
              const cur = new Date(startDate);
              while (cur <= end) {
                const dow = cur.getDay();
                if (rep === "daily") dates.push(toDateStr(cur));
                else if (rep === "workday" && dow >= 1 && dow <= 5) dates.push(toDateStr(cur));
                else if (rep === "weekly" && wdays.includes(dow)) dates.push(toDateStr(cur));
                cur.setDate(cur.getDate() + 1);
              }
            }
            // 将颜色保存到模板（无论是单日覆盖还是模板，颜色始终存在模板中）
            const tpl = allTemplates.find((t: any) => t.staffUserId === schDrawer.staffUserId);
            if (tpl) {
              saveTemplateMut.mutate({
                id: tpl.id, staffUserId: schDrawer.staffUserId,
                workStart: tpl.workStart, workEnd: tpl.workEnd,
                workDays: tpl.workDays,
                color: color,
                tenantId: currentTenantId ?? undefined,
              });
            } else if (workStart && workEnd) {
              // 还没有模板时新建一个
              saveTemplateMut.mutate({
                staffUserId: schDrawer.staffUserId,
                staffName: schDrawer.staffName,
                roleKey: schDrawer.roleKey,
                workStart, workEnd,
                workDays: wdays,
                color: color,
                tenantId: currentTenantId ?? undefined,
              });
            }
            Promise.all(dates.map(d =>
              saveOverrideMut.mutateAsync({
                staffUserId: schDrawer.staffUserId, overrideDate: d, shiftType,
                workStart: workStart ?? undefined, workEnd: workEnd ?? undefined,
                breakStart: breakStart ?? undefined, breakEnd: breakEnd ?? undefined,
                overtimeStart: otStart ?? undefined, overtimeEnd: otEnd ?? undefined,
                tenantId: currentTenantId ?? undefined,
              })
            )).then(() => setSchDrawer(null));
          }}
        />
      )}


    </div>
  );
}

// ── 排班抽屉（全屏页面式）──
// 将 HSL 色相（0-360）转为 hex 颜色
function hueToHex(h: number): string {
  const s = 0.62, l = 0.58;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
// 将 hex 颜色近似还原为色相（0-360）
function hexToHue(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return Math.round(h * 360);
}

// 周模板天数据类型
type DayTpl = {
  dow: number; // 0=周一 ... 6=周日
  isRest: boolean;
  workStart: string;
  workEnd: string;
  breakStart: string | null;
  breakEnd: string | null;
};

const DOW_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

function defaultDayTpl(dow: number, bizOpen: string, bizClose: string): DayTpl {
  return { dow, isRest: dow >= 5, workStart: bizOpen, workEnd: bizClose, breakStart: "12:00", breakEnd: "13:00" };
}

function SchDrawer({ staffUserId, staffName, roleKey, clinicName, date, initSegs, bizOpen, bizClose, onSaveBiz, templates, tenantId, onClose, onSave, onSaveDaySegs, onClearDaySegs, onClear }: {
  staffUserId: number; staffName: string; roleKey: string; clinicName: string; date: string; initSegs: Seg[];
  bizOpen: string; bizClose: string; onSaveBiz: (open: string, close: string) => void; templates: any[];
  tenantId?: number;
  onClose: () => void;
  onSave: (segs: Seg[], rep: string, wdays: number[], repEndDate: string, color: string) => void;
  onSaveDaySegs: (days: { dow: number; workStart: string; workEnd: string; breakStart?: string | null; breakEnd?: string | null; isRest: boolean }[], color: string) => void;
  onClearDaySegs: () => void;
  onClear: (fromDate: string, toDate: string) => void;
}) {
  // 每天独立时间段：key=dow(0=周一..6=周日)
  // status: 'pending'=待设置 | 'rest'=休息日 | 'work'=已设时间
  type DaySetting = { workStart: string; workEnd: string; breakStart: string | null; breakEnd: string | null; isRest: boolean; status: 'pending' | 'rest' | 'work' };
  const defaultDay = (): DaySetting => ({ workStart: bizOpen || "09:00", workEnd: bizClose || "18:00", breakStart: "12:00", breakEnd: "13:00", isRest: false, status: 'pending' });
  const [daySettings, setDaySettings] = useState<Record<number, DaySetting>>(() => {
    const r: Record<number, DaySetting> = {};
    for (let i = 0; i < 7; i++) r[i] = defaultDay();
    return r;
  });
  // 当前选中查看的天（null=未选）
  const [activeDow, setActiveDow] = useState<number | null>(null);
  // 选中的工作日（status=work 的天）
  const selDows = Object.entries(daySettings).filter(([, v]) => v.status === 'work').map(([k]) => Number(k));

  // 当前天的时间设置（快捷访问）
  const curDay = activeDow !== null ? daySettings[activeDow] : null;
  function setCurDay(patch: Partial<DaySetting>) {
    if (activeDow === null) return;
    setDaySettings(prev => ({ ...prev, [activeDow]: { ...prev[activeDow], ...patch } }));
  }

  // 从后端加载已有周模板
  const { data: savedDaySegs } = trpc.yabanShift.getDaySegs.useQuery(
    { staffUserId, tenantId },
    { enabled: !!staffUserId }
  );
  useEffect(() => {
    if (savedDaySegs && savedDaySegs.length > 0) {
      const newSettings: Record<number, DaySetting> = {};
      for (let i = 0; i < 7; i++) {
        const saved = savedDaySegs.find((r: any) => r.dow === i);
        // 只加载明确是工作日的记录，其余保持 pending 状态
        if (saved && !saved.isRest) {
          newSettings[i] = { workStart: saved.workStart, workEnd: saved.workEnd, breakStart: saved.breakStart || null, breakEnd: saved.breakEnd || null, isRest: false, status: 'work' };
        } else if (saved && saved.isRest) {
          // 后端存的休息日也显示为待设置，让用户重新确认
          newSettings[i] = defaultDay();
        } else {
          newSettings[i] = defaultDay();
        }
      }
      setDaySettings(newSettings);
      // 默认选中第一个已设置工作日
      const firstWork = Object.entries(newSettings).find(([, v]) => v.status === 'work');
      if (firstWork) setActiveDow(Number(firstWork[0]));
    }
  }, [savedDaySegs]);

  // 周模板编辑模式：有已保存数据时默认只读
  const hasSavedWork = savedDaySegs && savedDaySegs.some((r: any) => !r.isRest);
  const [tplEditing, setTplEditing] = useState(false);
  // 清空周模板确认弹窗
  const [showClearTplConfirm, setShowClearTplConfirm] = useState(false);
  // 清空 override 确认弹窗
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearEndDate, setClearEndDate] = useState("2026-12-31");
  // 门店营业时间编辑
  const [bizEditOpen, setBizEditOpen] = useState(false);
  // 进度条颜色
  const initColor = (() => {
    const tpl = templates.find((t: any) => t.staffUserId === staffUserId);
    return tpl?.color && tpl.color !== "#1E88D6" ? tpl.color : getRoleColor(roleKey).bar;
  })();
  const [barColor, setBarColor] = useState<string>(initColor);
  const [hue, setHue] = useState<number>(hexToHue(initColor));
  // 节假日处理方式：true=跳过节假日, false=不管
  const [skipHoliday, setSkipHoliday] = useState(true);
  // 其他个性设置展开
  const [showPersonal, setShowPersonal] = useState(false);
  // 个性设置编辑模式
  const [personalEditing, setPersonalEditing] = useState(false);

  function toggleDow(d: number) {
    setActiveDow(d);
    // 待设置状态点击后直接设为工作日
    if (daySettings[d].status === 'pending') {
      // 找最近一个已设好时间的工作日，复制其时间作为默认值
      const lastWork = Object.entries(daySettings)
        .filter(([k, v]) => Number(k) < d && v.status === 'work')
        .sort((a, b) => Number(b[0]) - Number(a[0]))[0];
      const base = lastWork ? lastWork[1] : daySettings[d];
      setDaySettings(prev => ({
        ...prev,
        [d]: { ...prev[d], status: 'work', isRest: false, workStart: base.workStart, workEnd: base.workEnd, breakStart: base.breakStart, breakEnd: base.breakEnd }
      }));
    }
  }

  // 时间框展示组件
  function TimeBox({ val, onChange, isErr, min, max }: { val: string; onChange: (v: string) => void; isErr?: boolean; min?: string; max?: string }) {
    const [h, m] = val.split(":").map(Number);
    return (
      <label style={{ flex: 1, minWidth: 0, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", gap: 3, border: `1px solid ${isErr ? "#E6BDB4" : LINE}`, borderRadius: 6, padding: "10px 6px", background: isErr ? "#F7E9E7" : "#F6F8FA", cursor: "pointer" }}>
        <span style={{ fontSize: 20, fontWeight: 900, color: isErr ? "#A8463C" : "#26303C", fontFamily: "system-ui,-apple-system,sans-serif", letterSpacing: 0.5 }}>
          {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}
        </span>
        <input type="time" value={val} step={300} min={min} max={max} onChange={e => onChange(e.target.value)}
          style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer" }} />
      </label>
    );
  }

  const isTimeErr = curDay && !curDay.isRest ? (
    toMin(curDay.breakStart || "12:00") <= toMin(curDay.workStart) ||
    toMin(curDay.breakEnd || "13:00") < toMin(curDay.breakStart || "12:00") ||
    toMin(curDay.workEnd) <= toMin(curDay.breakEnd || "13:00")
  ) : false;

  return (
    <div onClick={(e) => { e.stopPropagation(); onClose(); }} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "stretch", justifyContent: "center", zIndex: 200 }}>
      <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
      <div onClick={(e) => e.stopPropagation()} style={{ background: BG, width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", animation: "slideUp .25s" }}>

        {/* 顶栏 */}
        <div style={{ background: `linear-gradient(90deg,${SKY},#3D9FD6)`, color: "#fff", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <span onClick={onClose} style={{ fontSize: 14, color: "#EBF5FB", cursor: "pointer", flex: 1 }}>取消</span>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.25 }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>员工排班</span>
            {clinicName && (
              <span style={{ fontSize: 11, color: "#EBF5FB", display: "flex", alignItems: "center", gap: 3, marginTop: 1, whiteSpace: "nowrap" }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#EBF5FB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-3"/></svg>
                {clinicName}
              </span>
            )}
          </div>
          <span style={{ flex: 1 }} />
        </div>

        {/* 清空确认弹窗 */}
        {showClearConfirm && (
          <div onClick={() => setShowClearConfirm(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, padding: "22px 20px 18px", width: "88%", maxWidth: 340 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: INK, marginBottom: 6 }}>清空 {staffName} 的排班</div>
              <div style={{ fontSize: 13, color: GRAY, marginBottom: 16 }}>将删除从今天到以下日期的所有排班记录，不可恢复。</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                <span style={{ fontSize: 13, color: "#26303C", flexShrink: 0 }}>清空到</span>
                <input type="date" value={clearEndDate} onChange={e => setClearEndDate(e.target.value)}
                  style={{ flex: 1, fontSize: 14, fontWeight: 600, color: SKY_D, border: `1px solid ${LINE}`, borderRadius: 6, padding: "8px 10px", fontFamily: "inherit" }} />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <div onClick={() => setShowClearConfirm(false)} style={{ flex: 1, textAlign: "center", padding: "11px 0", borderRadius: 6, border: `1px solid ${LINE}`, fontSize: 14, color: GRAY, cursor: "pointer" }}>取消</div>
                <div onClick={() => { onClear(toDateStr(new Date()), clearEndDate); setShowClearConfirm(false); }}
                  style={{ flex: 1, textAlign: "center", padding: "11px 0", borderRadius: 6, background: "#E53935", fontSize: 14, fontWeight: 600, color: "#fff", cursor: "pointer" }}>确认清空</div>
              </div>
            </div>
          </div>
        )}

        {/* 清空周模板确认弹窗 */}
        {showClearTplConfirm && (
          <div onClick={() => setShowClearTplConfirm(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, padding: "22px 20px 18px", width: "88%", maxWidth: 340 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: INK, marginBottom: 6 }}>清空当前编辑内容</div>
              <div style={{ fontSize: 13, color: GRAY, marginBottom: 20 }}>将清空当前页面所有格子的编辑内容，方便重新设置。已保存的模板数据不受影响，如需删除已保存数据请使用下方「清空排班」功能。</div>
              <div style={{ display: "flex", gap: 10 }}>
                <div onClick={() => setShowClearTplConfirm(false)} style={{ flex: 1, textAlign: "center", padding: "11px 0", borderRadius: 6, border: `1px solid ${LINE}`, fontSize: 14, color: GRAY, cursor: "pointer" }}>取消</div>
                <div onClick={() => {
                  // 仅重置页面格子为待设置状态，不操作数据库
                  const r: Record<number, any> = {};
                  for (let i = 0; i < 7; i++) r[i] = defaultDay();
                  setDaySettings(r);
                  setActiveDow(null);
                  setTplEditing(true);
                  setShowClearTplConfirm(false);
                }}
                  style={{ flex: 1, textAlign: "center", padding: "11px 0", borderRadius: 6, background: "#E53935", fontSize: 14, fontWeight: 600, color: "#fff", cursor: "pointer" }}>确认清空</div>
              </div>
            </div>
          </div>
        )}

        {/* 主体滚动区 */}
        <div style={{ overflowY: "auto", flex: 1 }}>

          {/* 成员信息 */}
          <div style={{ background: "#fff", marginTop: 10, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: roleColor(roleKey).bg, color: roleColor(roleKey).fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, flexShrink: 0 }}>{staffName.charAt(0)}</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: INK }}>{staffName}</div>
              <div style={{ fontSize: 12, color: GRAY, marginTop: 2 }}>{roleLabel(roleKey)}</div>
            </div>
          </div>

          {/* ── 上半区：通用周模板 ── */}
          <div style={{ background: "#fff", marginTop: 10, padding: "14px 16px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: INK }}>长期周模板</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {(hasSavedWork || tplEditing) && (
                  <span onClick={() => setShowClearTplConfirm(true)}
                    style={{ fontSize: 12, color: "#B0BEC5", cursor: "pointer", padding: "4px 8px", border: "1px solid #DBE1E8", borderRadius: 14, background: "#F6F8FA", display: "flex", alignItems: "center", gap: 3 }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#B0BEC5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                    清空模板
                  </span>
                )}
                <div style={{ fontSize: 12, color: "#9AA7B5" }}>点格子设时段 · 7天均可设置</div>
              </div>
            </div>

            {/* 两行星期格子：第一行周一~周四，第二行周五~周日 */}
            {(() => {
              // 渲染单个格子的函数
              const renderCell = (i: number, cellW: string | number) => {
                const label = DOW_LABELS[i];
                const ds = daySettings[i];
                const configured = ds.status === 'work';
                const isRest = ds.status === 'rest';
                const isActive = activeDow === i;
                const bg = isActive ? SKY_D : configured ? "#EBF5FF" : isRest ? "#EEF2F6" : "#F0F4F8";
                const bd = isActive ? SKY_D : configured ? "#90CAF9" : isRest ? "#C5CDD8" : LINE;
                const tc = isActive ? "#fff" : "#1565C0";
                const tc2 = isActive ? "rgba(255,255,255,.55)" : "#90CAF9";
                const hd = isActive ? "rgba(255,255,255,.7)" : configured ? "#5BA4CF" : "#9AA7B5";
                const fmt = (t: string) => t.replace(/^0/, "");
                const am1 = fmt(ds.workStart); const am2 = fmt(ds.breakStart || "12:00");
                const pm1 = fmt(ds.breakEnd || "13:00"); const pm2 = fmt(ds.workEnd);
                return (
                  <div key={i} onClick={() => { if (!hasSavedWork || tplEditing) toggleDow(i); }}
                    style={{ width: cellW, flexShrink: 0,
                      height: 100, borderRadius: 10, display: "flex",
                      flexDirection: "column", alignItems: "center", justifyContent: "center",
                      gap: 0, cursor: "pointer", transition: "all .2s", padding: "8px 3px",
                      background: isRest ? "repeating-linear-gradient(45deg,#D8DDE4,#D8DDE4 3px,#EEF1F5 3px,#EEF1F5 7px)" : bg,
                      border: `2px solid ${bd}`,
                      boxShadow: isActive ? "0 2px 8px rgba(30,136,214,.25)" : "none",
                      overflow: "hidden", position: "relative" }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: isRest ? "#5A6878" : hd, lineHeight: 1, marginBottom: 5, fontFamily: "system-ui,-apple-system,sans-serif" }}>周{label}</span>
                    {configured ? (
                      <div style={{ display: "flex", gap: 0, alignItems: "stretch", width: "100%", height: 56, overflow: "hidden", padding: "0 1px" }}>
                        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-evenly", padding: "2px 2px 2px 0" }}>
                          <span style={{ fontSize: 8, fontWeight: 800, color: tc, lineHeight: 1, fontFamily: "system-ui,-apple-system,sans-serif", whiteSpace: "nowrap" }}>{am1}</span>
                          <span style={{ fontSize: 7, color: tc2, lineHeight: 1 }}>–</span>
                          <span style={{ fontSize: 8, fontWeight: 800, color: tc, lineHeight: 1, fontFamily: "system-ui,-apple-system,sans-serif", whiteSpace: "nowrap" }}>{am2}</span>
                        </div>
                        <div style={{ width: 1, background: isActive ? "rgba(255,255,255,.25)" : "#C5D8EA", flexShrink: 0, margin: "4px 0" }} />
                        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-evenly", padding: "2px 0 2px 2px" }}>
                          <span style={{ fontSize: 8, fontWeight: 800, color: tc, lineHeight: 1, fontFamily: "system-ui,-apple-system,sans-serif", whiteSpace: "nowrap" }}>{pm1}</span>
                          <span style={{ fontSize: 7, color: tc2, lineHeight: 1 }}>–</span>
                          <span style={{ fontSize: 8, fontWeight: 800, color: tc, lineHeight: 1, fontFamily: "system-ui,-apple-system,sans-serif", whiteSpace: "nowrap" }}>{pm2}</span>
                        </div>
                      </div>
                    ) : isRest ? (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, marginTop: 2 }}>
                        <span style={{ fontSize: 16, color: "#7A8898", fontWeight: 700 }}>✕</span>
                        <span style={{ fontSize: 10, color: "#5A6878", fontWeight: 600, textAlign: "center", lineHeight: 1.3 }}>休息</span>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, marginTop: 2,
                        border: "1.5px dashed #C5D0DB", borderRadius: 6, padding: "5px 8px", width: "70%" }}>
                        <span style={{ fontSize: 14, color: "#C5D0DB", lineHeight: 1 }}>+</span>
                        <span style={{ fontSize: 9, color: "#C5D0DB", textAlign: "center", lineHeight: 1.2 }}>待设置</span>
                      </div>
                    )}
                  </div>
                );
              };
              // 第一行：周一(0)~周四(3)，4格等宽 = (100vw - 32px - 3*4px) / 4
              const row1W = "calc((100vw - 44px) / 4)";
              // 第二行：周五(4)~周日(6)，3格等宽 = (100vw - 32px - 2*4px) / 3
              const row2W = "calc((100vw - 40px) / 3)";
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", gap: 4 }}>
                    {[0,1,2,3].map(i => renderCell(i, row1W))}
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {[4,5,6].map(i => renderCell(i, row2W))}
                  </div>
                </div>
              );
            })()}

            {/* 时间设置区：选中某天后显示 */}
            {activeDow === null ? (
              <div style={{ marginTop: 18, padding: "20px 0", textAlign: "center", color: "#9AA7B5", fontSize: 13 }}>
                点击上方星期格子设置该天时间
              </div>
            ) : (
              <>
                {/* 当前选中天标题 */}
                <div style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>周{DOW_LABELS[activeDow]} 时间设置</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {(!hasSavedWork || tplEditing) && (
                      <span onClick={() => setShowClearTplConfirm(true)}
                        style={{ fontSize: 12, color: "#B0BEC5", cursor: "pointer", padding: "4px 10px", border: "1px solid #DBE1E8", borderRadius: 14, background: "#F6F8FA" }}>清空模板</span>
                    )}
                    {curDay && curDay.status !== 'rest' ? (
                      <span onClick={() => setCurDay({ isRest: true, status: 'rest' })} style={{ fontSize: 13, color: "#9AA7B5", cursor: "pointer", padding: "4px 10px", border: "1px solid #DBE1E8", borderRadius: 14, background: "#F6F8FA" }}>休息日</span>
                    ) : (
                      <span onClick={() => setCurDay({ isRest: false, status: 'work' })} style={{ fontSize: 13, color: SKY_D, fontWeight: 600, cursor: "pointer", padding: "4px 10px", border: `1px solid ${SKY_D}`, borderRadius: 14 }}>上班</span>
                    )}
                  </div>
                </div>

                {curDay && curDay.status === 'rest' ? (
                  <div style={{ marginTop: 12, padding: "16px 0", textAlign: "center", color: "#9AA7B5", fontSize: 13, background: "#F6F8FA", borderRadius: 8 }}>
                    休息日 · 点击「上班」开启该天
                  </div>
                ) : curDay && (curDay.status === 'work' || curDay.status === 'pending') ? (
                  <>
                    {/* 上午时段：06:00 开始，到中午结束 */}
                    <div style={{ marginTop: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 9, color: "#9AA7B5", flexShrink: 0, width: 18, textAlign: "right" }}>上午</span>
                        <TimeBox val={curDay!.workStart} onChange={v => setCurDay({ workStart: v, status: 'work', isRest: false })} isErr={isTimeErr} min="06:00" max="12:00" />
                        <span style={{ color: "#9AA7B5", fontSize: 18, flexShrink: 0 }}>—</span>
                        <TimeBox val={curDay!.breakStart || "12:00"} onChange={v => setCurDay({ breakStart: v, status: 'work', isRest: false })} min="06:00" max="13:00" />
                      </div>
                      {isTimeErr && <div style={{ fontSize: 12, color: "#E53935", marginTop: 5, display: "flex", alignItems: "center", gap: 4 }}><span>⚠</span>上午结束时间须晚于开始时间</div>}
                    </div>

                    {/* 下午时段：中午开始，18:00 结束 */}
                    <div style={{ marginTop: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 9, color: "#9AA7B5", flexShrink: 0, width: 18, textAlign: "right" }}>下午</span>
                        <TimeBox val={curDay!.breakEnd || "13:00"} onChange={v => setCurDay({ breakEnd: v, status: 'work', isRest: false })} min={curDay!.breakStart || "12:00"} max="18:00" />
                        <span style={{ color: "#9AA7B5", fontSize: 18, flexShrink: 0 }}>—</span>
                        <TimeBox val={curDay!.workEnd} onChange={v => setCurDay({ workEnd: v, status: 'work', isRest: false })} min={curDay!.breakEnd || "13:00"} max="18:00" />
                      </div>
                    </div>
                  </>
                ) : null}
              </>
            )}

          </div>

          {/* 保存按钮 */}
          <div style={{ background: "#fff", padding: "12px 16px 16px", marginTop: 10 }}>
            <div style={{ fontSize: 12, color: GRAY, textAlign: "center", marginBottom: 10 }}>
              共 {selDows.length} 天工作日 · 每周自动重复
            </div>
            {hasSavedWork && !tplEditing ? (
              <div onClick={() => setTplEditing(true)} style={{
                width: "100%", background: "#F0F4F8", color: INK,
                padding: 13, borderRadius: 5, fontSize: 15, fontWeight: 600, textAlign: "center",
                cursor: "pointer", border: `1.5px solid ${LINE}`,
              }}>编辑长期模板</div>
            ) : (
              <div onClick={() => {
                if (selDows.length === 0) { toast.error("请至少设置一天工作日"); return; }
                if (isTimeErr) { toast.error("请先修正时间错误"); return; }
                try {
                  const prev: string[] = JSON.parse(localStorage.getItem("yaban_recent_colors") || "[]");
                  const next = [barColor, ...prev.filter(c => c !== barColor)].slice(0, 5);
                  localStorage.setItem("yaban_recent_colors", JSON.stringify(next));
                } catch {}
                const allDays = Array.from({ length: 7 }, (_, i) => ({
                  dow: i,
                  workStart: daySettings[i].workStart,
                  workEnd: daySettings[i].workEnd,
                  breakStart: daySettings[i].breakStart || null,
                  breakEnd: daySettings[i].breakEnd || null,
                  isRest: daySettings[i].status !== 'work',
                }));
                onSaveDaySegs(allDays, barColor);
                setTplEditing(false);
              }} style={{
                width: "100%",
                background: selDows.length === 0 ? "#D8DDE4" : isTimeErr ? "#ccc" : SKY_D,
                color: selDows.length === 0 ? "#9AA7B5" : "#fff",
                padding: 13, borderRadius: 5, fontSize: 15, fontWeight: 600, textAlign: "center",
                cursor: selDows.length === 0 ? "not-allowed" : isTimeErr ? "not-allowed" : "pointer",
              }}>保存为长期周模板</div>
            )}
          </div>

          {/* ── 下半区：其他个性设置 ── */}
          <div style={{ background: "#fff", marginTop: 10 }}>
            <div onClick={() => setShowPersonal(v => !v)}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", cursor: "pointer" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>其他个性设置</div>
                <div style={{ fontSize: 11, color: GRAY, marginTop: 2 }}>进度条颜色、节假日、营业时间</div>
              </div>
              <span style={{ fontSize: 13, color: "#9AA7B5" }}>{showPersonal ? "▲" : "▼"}</span>
            </div>
            {showPersonal && (
              <div style={{ borderTop: `1px solid ${LINE}` }}>

                {/* 进度条颜色 */}
                <div style={{ display: "flex", alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${LINE}`, gap: 10 }}>
                  <div style={{ flexShrink: 0, width: 56 }}>
                    <div style={{ fontSize: 11, color: GRAY }}>颜色</div>
                  </div>
                  <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: barColor, flexShrink: 0, boxShadow: "0 1px 4px rgba(0,0,0,.15)" }} />
                    <div style={{ flex: 1, position: "relative", pointerEvents: personalEditing ? "auto" : "none", opacity: personalEditing ? 1 : 0.5 }}>
                      <div style={{ height: 22, borderRadius: 6, background: "linear-gradient(to right, #e05555, #e08855, #e0d455, #55e055, #55e0d4, #5588e0, #8855e0, #d455e0, #e05555)" }} />
                      <input type="range" min={0} max={360} value={hue}
                        onChange={e => { const h = Number(e.target.value); setHue(h); setBarColor(hueToHex(h)); }}
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: personalEditing ? "pointer" : "default", margin: 0 }} />
                      <div style={{ position: "absolute", top: "50%", left: `${(hue / 360) * 100}%`, transform: "translate(-50%, -50%)", width: 24, height: 24, borderRadius: "50%", background: barColor, border: "3px solid #fff", boxShadow: "0 1px 5px rgba(0,0,0,.3)", pointerEvents: "none" }} />
                    </div>
                    {personalEditing && (
                      <span onClick={() => { const c = getRoleColor(roleKey).bar; setBarColor(c); setHue(hexToHue(c)); }}
                        style={{ fontSize: 11, color: SKY_D, fontWeight: 600, cursor: "pointer", padding: "4px 8px", borderRadius: 6, background: SKY_L, flexShrink: 0 }}>重置</span>
                    )}
                  </div>
                </div>

                {/* 节假日处理 */}
                <div style={{ display: "flex", alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${LINE}`, gap: 10 }}>
                  <div style={{ flexShrink: 0, width: 56 }}>
                    <div style={{ fontSize: 11, color: GRAY }}>节假日</div>
                  </div>
                  <div style={{ flex: 1, display: "flex", gap: 8, pointerEvents: personalEditing ? "auto" : "none", opacity: personalEditing ? 1 : 0.7 }}>
                    <div onClick={() => personalEditing && setSkipHoliday(true)}
                      style={{ flex: 1, padding: "9px 0", borderRadius: 8, cursor: personalEditing ? "pointer" : "default", fontSize: 13, fontWeight: skipHoliday ? 700 : 400,
                        textAlign: "center", background: skipHoliday ? SKY_D : "#F0F4F8", color: skipHoliday ? "#fff" : "#647386",
                        border: `1.5px solid ${skipHoliday ? SKY_D : LINE}`, transition: "all .15s" }}>节假日自动休息</div>
                    <div onClick={() => personalEditing && setSkipHoliday(false)}
                      style={{ flex: 1, padding: "9px 0", borderRadius: 8, cursor: personalEditing ? "pointer" : "default", fontSize: 13, fontWeight: !skipHoliday ? 700 : 400,
                        textAlign: "center", background: !skipHoliday ? SKY_D : "#F0F4F8", color: !skipHoliday ? "#fff" : "#647386",
                        border: `1.5px solid ${!skipHoliday ? SKY_D : LINE}`, transition: "all .15s" }}>节假日仍然排班</div>
                  </div>
                </div>

                {/* 门店营业时间 */}
                <div style={{ display: "flex", alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${LINE}`, gap: 10 }}>
                  <div style={{ flexShrink: 0, width: 56 }}>
                    <div style={{ fontSize: 11, color: GRAY }}>营业时间</div>
                  </div>
                  <div style={{ flex: 1, display: "flex", gap: 0, opacity: personalEditing ? 1 : 0.7,
                    border: `1.5px solid ${LINE}`, borderRadius: 8, overflow: "hidden", background: "#F0F4F8" }}>
                    <input type="time" defaultValue={bizOpen} step={300} id="biz-open-input" disabled={!personalEditing}
                      style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "#26303C", border: "none", padding: "9px 0",
                        background: "transparent", fontFamily: "inherit", textAlign: "center", outline: "none",
                        cursor: personalEditing ? "pointer" : "default" }} />
                    <div style={{ width: 1, background: LINE, flexShrink: 0, margin: "6px 0" }} />
                    <input type="time" defaultValue={bizClose} step={300} id="biz-close-input" disabled={!personalEditing}
                      style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "#26303C", border: "none", padding: "9px 0",
                        background: "transparent", fontFamily: "inherit", textAlign: "center", outline: "none",
                        cursor: personalEditing ? "pointer" : "default" }} />
                  </div>
                </div>

                {/* 清空排班 */}
                <div style={{ display: "flex", alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${LINE}`, gap: 10 }}>
                  <div style={{ flexShrink: 0, width: 56 }}>
                    <div style={{ fontSize: 11, color: GRAY }}>清空排班</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div onClick={() => setShowClearConfirm(true)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 600, color: "#B0BEC5", cursor: "pointer", padding: "8px 14px", borderRadius: 8, border: "1.5px solid #DBE1E8", background: "#F6F8FA" }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#B0BEC5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      清空该员工排班
                    </div>
                  </div>
                </div>

                {/* 底部按钮：查看模式显示「编辑个性设置」，编辑模式显示「保存个性设置」 */}
                <div style={{ padding: "14px 16px" }}>
                  {!personalEditing ? (
                    <div onClick={() => setPersonalEditing(true)}
                      style={{ width: "100%", padding: 13, borderRadius: 5, fontSize: 15, fontWeight: 600, textAlign: "center",
                        background: "#F0F4F8", color: INK, cursor: "pointer", border: `1.5px solid ${LINE}` }}>编辑个性设置</div>
                  ) : (
                    <div onClick={() => {
                      const o = (document.getElementById("biz-open-input") as HTMLInputElement)?.value || bizOpen;
                      const c = (document.getElementById("biz-close-input") as HTMLInputElement)?.value || bizClose;
                      if (toMin(c) <= toMin(o)) { toast.error("闭店时间须晚于开门时间"); return; }
                      onSaveBiz(o, c);
                      setPersonalEditing(false);
                      toast.success("个性设置已保存");
                    }}
                      style={{ width: "100%", padding: 13, borderRadius: 5, fontSize: 15, fontWeight: 600, textAlign: "center",
                        background: SKY_D, color: "#fff", cursor: "pointer" }}>保存个性设置</div>
                  )}
                </div>

              </div>
            )}
          </div>

          <div style={{ height: 20 }} />
        </div>

      </div>
    </div>
  );
}

function TplModal({ bizOpen, bizClose, templates, onClose, onSave, saveTemplateMut, tenantId }: {
  bizOpen: string; bizClose: string; templates: any[];
  onClose: () => void;
  onSave: (open: string, close: string) => void;
  saveTemplateMut: any;
  tenantId?: number;
}) {
  const [open, setOpen] = useState(bizOpen);
  const [close, setClose] = useState(bizClose);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }}>
      <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", width: "100%", maxWidth: 420, borderRadius: "18px 18px 0 0", padding: "18px 18px 30px", animation: "slideUp .25s", maxHeight: "88vh", overflowY: "auto" }}>
        <h3 style={{ fontSize: 17, marginBottom: 4, fontWeight: 700, color: INK }}>班次模板</h3>
        <div style={{ fontSize: 12, color: GRAY, marginBottom: 12 }}>营业时间与班次均可自定义，排班时直接调用</div>
        <div style={{ background: "#f7f9fb", border: `1px solid ${LINE}`, borderRadius: 6, padding: "12px 14px", marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: "#9AA7B5", marginBottom: 8 }}>门店营业时间（时间轴基准）</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#26303C", fontWeight: 600 }}>
            <span>开门</span>
            <input type="time" value={open} step={300} onChange={e => setOpen(e.target.value)} style={{ width: 90, fontSize: 14, fontWeight: 600, color: "#26303C", border: `1px solid ${LINE}`, borderRadius: 4, padding: "6px 8px", background: "#fff", fontFamily: "inherit", textAlign: "center" }} />
            <span style={{ color: "#DBE1E8" }}>–</span>
            <span>闭店</span>
            <input type="time" value={close} step={300} onChange={e => setClose(e.target.value)} style={{ width: 90, fontSize: 14, fontWeight: 600, color: "#26303C", border: `1px solid ${LINE}`, borderRadius: 4, padding: "6px 8px", background: "#fff", fontFamily: "inherit", textAlign: "center" }} />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {templates.map((tpl: any) => (
            <div key={tpl.id} style={{ display: "flex", flexDirection: "column", gap: 9, padding: "10px 12px", background: "#fff", border: `1px solid ${LINE}`, borderRadius: 5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: SKY_L, color: SKY_D, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600 }}>{tpl.staffName.charAt(0)}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#26303C", flex: 1 }}>{tpl.staffName}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="time" defaultValue={tpl.workStart} step={300} onBlur={e => saveTemplateMut.mutate({ id: tpl.id, staffUserId: tpl.staffUserId, workStart: e.target.value, workEnd: tpl.workEnd, workDays: tpl.workDays, tenantId })} style={{ width: 78, fontSize: 13, fontWeight: 600, color: "#26303C", border: `1px solid ${LINE}`, borderRadius: 4, padding: "6px 4px", background: "#F6F8FA", fontFamily: "inherit", textAlign: "center" }} />
                  <span style={{ color: "#DBE1E8" }}>–</span>
                  <input type="time" defaultValue={tpl.workEnd} step={300} onBlur={e => saveTemplateMut.mutate({ id: tpl.id, staffUserId: tpl.staffUserId, workStart: tpl.workStart, workEnd: e.target.value, workDays: tpl.workDays, tenantId })} style={{ width: 78, fontSize: 13, fontWeight: 600, color: "#26303C", border: `1px solid ${LINE}`, borderRadius: 4, padding: "6px 4px", background: "#F6F8FA", fontFamily: "inherit", textAlign: "center" }} />
                </div>
              </div>
              <div style={{ fontSize: 11, color: GRAY, paddingLeft: 2 }}>
                工作日：{tpl.workDays.map((d: number) => "周" + WK_FULL[d]).join("、")}
                {tpl.overtimeStart && tpl.overtimeEnd ? ` · 加班 ${tpl.overtimeStart}–${tpl.overtimeEnd}` : ""}
              </div>
            </div>
          ))}
          {templates.length === 0 && <div style={{ fontSize: 13, color: "#9AA7B5", textAlign: "center", padding: "20px 0" }}>暂无员工班次模板</div>}
        </div>
        <div onClick={() => onSave(open, close)} style={{ marginTop: 16, background: SKY, color: "#fff", textAlign: "center", padding: 13, borderRadius: 6, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>完成</div>
      </div>
    </div>
  );
}
