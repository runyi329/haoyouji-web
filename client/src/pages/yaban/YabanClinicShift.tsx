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
import { PageTag } from "@/components/PageTag";
import { useYabanClinic } from "./useYabanClinic";
import YabanClinicHeader from "./YabanClinicHeader";

// ── 颜色常量 ──
const SKY = "#2196C8", SKY_D = "#1E88D6", SKY_L = "#EAF4FE";
const WARN = "#E8973A", WARN_L = "#FDF4E6", WARN_LINE = "#F2D9AE";
const BG = "#F0F4F8", LINE = "#eef1f5", GRAY = "#6b7785", INK = "#1f2937";
const FREE_COLOR = "#A8CCE8";

// ── 角色字典（标签 / 配色 / 分组排序），与 YabanRoles 保持一致 ──
const ROLE_LABEL: Record<string, string> = {
  owner: "院长/股东", doctor: "医生", nurse: "护士", assistant: "助理", receptionist: "前台", finance: "财务",
};
// 一套协调色板：色相均匀分布，明度/饱和度统一控制，整排成套和谐
// fg 主色文字 S50%/L43% · bg 浅底 S55%/L94% · bar 进度条 S58%/L60%
const ROLE_COLOR: Record<string, { fg: string; bg: string; bar: string }> = {
  owner: { fg: "#3749A4", bg: "#E7EAF8", bar: "#5E72D4" },        // 靖蓝
  doctor: { fg: "#3777A4", bg: "#E7F1F8", bar: "#5EA3D4" },       // 蓝
  nurse: { fg: "#379BA4", bg: "#E7F7F8", bar: "#5ECAD4" },        // 青
  assistant: { fg: "#37A477", bg: "#E7F8F1", bar: "#5ED4A3" },    // 薄荷绿
  receptionist: { fg: "#6537A4", bg: "#EEE7F8", bar: "#8F5ED4" }, // 薰衣草紫
  finance: { fg: "#A47737", bg: "#F8F1E7", bar: "#D4A35E" },      // 暖琅珀
};
const ROLE_ORDER = ["owner", "doctor", "nurse", "assistant", "receptionist", "finance"];
function roleLabel(k: string) { return ROLE_LABEL[k] || "员工"; }
function roleColor(k: string) { return ROLE_COLOR[k] || { fg: "#5b6b7a", bg: "#eef1f5", bar: "#A8CCE8" }; }
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
  const [tplModal, setTplModal] = useState(false);
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

  // 门店营业时间（后端持久化，按医院隔离）
  const { data: bizHours, refetch: refetchBiz } = trpc.yabanShift.getBusinessHours.useQuery(
    { tenantId: currentTenantId ?? undefined },
    { enabled: currentTenantId != null }
  );
  useEffect(() => {
    if (bizHours) { setBizOpen(bizHours.open); setBizClose(bizHours.close); }
  }, [bizHours]);
  const saveBizMut = trpc.yabanShift.saveBusinessHours.useMutation({
    onSuccess: () => { refetchBiz(); toast.success("营业时间已保存"); },
    onError: (e) => toast.error(e.message),
  });

  const templates = schedData?.templates ?? [];
  const overrides = schedData?.overrides ?? [];

  // 全员排班清单：以门店全体在职成员为准，合并已有模板（未建模板者也可排班）
  // 行结构 { staffUserId, staffName, roleKey, hasTemplate }
  const roster = useMemo(() => {
    const tplMap = new Map<number, any>();
    (templates as any[]).forEach((t) => tplMap.set(t.staffUserId, t));
    const list: { staffUserId: number; staffName: string; roleKey: string; hasTemplate: boolean }[] = [];
    const seen = new Set<number>();
    (allMembers as any[]).forEach((m) => {
      seen.add(m.userId);
      const tpl = tplMap.get(m.userId);
      list.push({
        staffUserId: m.userId,
        staffName: m.name || tpl?.staffName || "",
        roleKey: m.roleKey || tpl?.roleKey || "doctor",
        hasTemplate: !!tpl,
      });
    });
    // 兜底：有模板但名册查不到的人（历史数据），也纳入
    (templates as any[]).forEach((t) => {
      if (!seen.has(t.staffUserId)) {
        list.push({ staffUserId: t.staffUserId, staffName: t.staffName, roleKey: t.roleKey || "doctor", hasTemplate: true });
      }
    });
    list.sort((a, b) => roleRank(a.roleKey) - roleRank(b.roleKey) || a.staffUserId - b.staffUserId);
    return list;
  }, [templates, allMembers]);

  // 经角色筛选后的清单
  const filteredRoster = useMemo(
    () => (roleFilter ? roster.filter((r) => r.roleKey === roleFilter) : roster),
    [roster, roleFilter]
  );

  // 出现过的角色（用于筛选 chips，保持固定顺序）
  const presentRoles = useMemo(() => {
    const s = new Set(roster.map((r) => r.roleKey));
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
    const tpl = templates.find((t: any) => t.staffUserId === staffUserId);
    if (!tpl) return [];
    const dow = date.getDay();
    if (!tpl.workDays.includes(dow)) return [];
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
      <div ref={headerRef} style={{ background: `linear-gradient(90deg,${SKY},#3BA9E0)`, color: "#fff", padding: "14px 16px 12px", position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ flex: 1, display: "flex", justifyContent: "flex-start" }}>
            <div style={{ fontSize: 22, width: 28, cursor: "pointer" }} onClick={() => setLocation("/yaban/schedule")}>‹</div>
          </div>
          <div style={{ display: "flex", gap: 6, background: "rgba(255,255,255,.18)", borderRadius: 12, padding: 4, flexShrink: 0 }}>
            <div onClick={() => { try { sessionStorage.setItem("yaban_sched_date", toDateStr(selDate)); } catch {} setLocation("/yaban/schedule"); }} style={{ padding: "7px 14px", borderRadius: 9, fontSize: 14, fontWeight: 600, color: "#eaf6ff", whiteSpace: "nowrap", cursor: "pointer" }}>顾客预约</div>
            <div style={{ padding: "7px 14px", borderRadius: 9, fontSize: 14, fontWeight: 600, background: "#fff", color: SKY_D, boxShadow: "0 1px 3px rgba(0,0,0,.1)", whiteSpace: "nowrap" }}>员工排班</div>
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

      {/* 周导航 */}
      <div style={{ background: "#fff", padding: "10px 16px 8px", borderBottom: `1px solid ${LINE}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div onClick={() => setWeekOffset(w => w - 1)} style={{ width: 30, height: 30, borderRadius: 9, background: "#f3f6f9", color: "#5b6b7a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, cursor: "pointer" }}>‹</div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: INK }}>
            {weekDates[0].getMonth() + 1}月{weekDates[0].getDate()}日 – {weekDates[6].getMonth() + 1}月{weekDates[6].getDate()}日
          </div>
          <div style={{ fontSize: 11, color: weekOffset === 0 ? SKY_D : GRAY, marginTop: 2, fontWeight: weekOffset === 0 ? 600 : 400 }}>
            {weekOffset === 0 ? "本周" : weekOffset < 0 ? `前${-weekOffset}周` : `后${weekOffset}周`}
          </div>
        </div>
        <div onClick={() => setWeekOffset(w => w + 1)} style={{ width: 30, height: 30, borderRadius: 9, background: "#f3f6f9", color: "#5b6b7a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, cursor: "pointer" }}>›</div>
      </div>

      {/* 日期选择条 */}
      <div style={{ background: "#fff", padding: "8px 16px 10px", borderBottom: `8px solid ${BG}`, display: "flex", gap: 4 }}>
        {weekDates.map((d, i) => {
          const isToday = toDateStr(d) === toDateStr(today);
          const isSel = toDateStr(d) === toDateStr(selDate);
          return (
            <div key={i} onClick={() => setSelDate(d)} style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "6px 0", borderRadius: 9, cursor: "pointer",
              background: isSel ? SKY_D : "transparent", transition: "all .15s",
            }}>
              <span style={{ fontSize: 10, color: isSel ? "rgba(255,255,255,.8)" : "#aab4be", fontWeight: 600, marginBottom: 2 }}>{WK_SHORT[i]}</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: isSel ? "#fff" : isToday ? SKY_D : INK }}>{d.getDate()}</span>
              {isToday && !isSel && <span style={{ width: 4, height: 4, borderRadius: "50%", background: SKY_D, marginTop: 2 }} />}
            </div>
          );
        })}
      </div>

      {/* 操作条 */}
      <div style={{ background: "#fff", padding: "8px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${LINE}` }}>
        <div onClick={toggleBatch} style={{
          fontSize: 13, fontWeight: 600, padding: "5px 13px", borderRadius: 8, cursor: "pointer", transition: ".16s",
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
                flexShrink: 0, fontSize: 12.5, fontWeight: 600, padding: "5px 12px", borderRadius: 16, cursor: "pointer", transition: ".16s",
                background: active ? SKY_D : "#f3f6f9", color: active ? "#fff" : "#5b6b7a",
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
          <div style={{ fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 4 }}>暂无可排班的员工</div>
          <div style={{ fontSize: 12, color: GRAY }}>请先在员工管理中添加成员</div>
        </div>
      ) : (
        filteredRoster.map((r) => {
          const segs = getStaffDaySegs(r.staffUserId, selDate);
          const hasShift = segs.length > 0;
          const isBatchSel = batchSel.has(r.staffUserId);
          const rc = roleColor(r.roleKey);

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
                <div style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${isBatchSel ? SKY_D : "#c7d0d8"}`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: isBatchSel ? SKY_D : "transparent", transition: ".16s" }}>
                  {isBatchSel && <svg width="10" height="10" viewBox="0 0 10 10"><polyline points="1.5,5 4,8 8.5,2" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </div>
              )}
              {/* 列一：头像 */}
              <div style={{ width: 38, height: 38, flexShrink: 0, borderRadius: "50%", background: hasShift ? rc.bg : "#e8ecf0", color: hasShift ? rc.fg : "#9aa6b2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 600, filter: hasShift ? "none" : "grayscale(1)", opacity: hasShift ? 1 : 0.7 }}>{r.staffName.charAt(0)}</div>
              {/* 列二：名字(上) 职称(下) */}
              <div style={{ width: 60, flexShrink: 0, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.staffName}</div>
                <div style={{ display: "inline-block", fontSize: 10, fontWeight: 600, lineHeight: 1.5, padding: "0 5px", borderRadius: 6, marginTop: 2, color: rc.fg, background: rc.bg }}>{roleLabel(r.roleKey)}</div>
              </div>
              {/* 列三：进度条(色块内显示时长) + 工时文字与色块左对齐 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {!hasShift ? (
                  <div style={{ position: "relative", height: 24, borderRadius: 7, overflow: "hidden", background: "repeating-linear-gradient(45deg,#e7ebef,#e7ebef 4px,#f1f4f7 4px,#f1f4f7 8px)", cursor: batchMode ? "inherit" : "pointer" }}>
                    <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#bcc6d0" }}>{r.hasTemplate ? "今日休息 · 点击排班" : "未排班 · 点击排班"}</span>
                  </div>
                ) : (
                  <>
                    <div title="点击编辑排班" style={{ position: "relative", height: 24, borderRadius: 7, overflow: "hidden", background: "#E2E8EF", cursor: batchMode ? "inherit" : "pointer" }}>
                      {segs.map((s: Seg, si: number) => {
                        const L = pctM(toMin(s.start)), W = pctM(toMin(s.end)) - L;
                        const durH = (toMin(s.end) - toMin(s.start)) / 60;
                        const durTxt = Number.isInteger(durH) ? `${durH}h` : `${durH.toFixed(1)}h`;
                        return (
                          <div key={si} style={{
                            position: "absolute", left: `${L}%`, width: `${Math.max(W, 1)}%`, top: 0, height: "100%",
                            background: s.isOT ? WARN : rc.bar,
                            display: "flex", alignItems: "center", justifyContent: "center", padding: "0 2px", overflow: "hidden",
                          }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", textShadow: "0 1px 1px rgba(0,0,0,.15)" }}>{s.isOT ? `加班${durTxt}` : durTxt}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ fontSize: 11, color: GRAY, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subText}</div>
                  </>
                )}
              </div>
            </div>
          );
        })
      )}

      {/* 班次模板入口 */}
      <div onClick={() => setTplModal(true)} style={{ background: "#fff", marginTop: 8, padding: "14px", display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}`, cursor: "pointer" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>营业时间 · 班次模板</div>
          <div style={{ fontSize: 11, color: GRAY, marginTop: 3 }}>营业 {bizOpen}–{bizClose} · {allTemplates.length} 位员工，点击自定义</div>
        </div>
        <div style={{ color: SKY, fontSize: 20 }}>›</div>
      </div>
      <div style={{ textAlign: "center", fontSize: 11, color: "#aab4be", padding: 14 }}>排班后，对应时段将在「预约」视图变为可约</div>

      {/* 批量操作底栏 */}
      {batchMode && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: "#fff", borderTop: `1px solid ${LINE}`, padding: "12px 16px 20px", boxShadow: "0 -4px 16px rgba(20,40,60,.08)", zIndex: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13, color: "#374151", fontWeight: 600, marginBottom: 10 }}>
            <span>已选 {batchSel.size} 人</span>
            <span onClick={batchSelectAll} style={{ color: SKY_D, fontWeight: 500, cursor: "pointer" }}>{batchSel.size === templates.length ? "取消全选" : "全选"}</span>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div onClick={batchCopyTemplate} style={{ flex: 1, textAlign: "center", fontSize: 13, fontWeight: 600, padding: 10, borderRadius: 9, cursor: "pointer", background: SKY_L, color: SKY_D, border: `1px solid ${SKY}` }}>复制模板班次</div>
            <div onClick={batchApplyRest} style={{ flex: 1, textAlign: "center", fontSize: 13, fontWeight: 600, padding: 10, borderRadius: 9, cursor: "pointer", background: "#f1f3f5", color: "#7a8794", border: "1px solid #dde3e8" }}>设为休息</div>
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
          onClose={() => setSchDrawer(null)}
          onSave={(segs, rep, wdays, repEndDate) => {
            const hasErr = validateSegs(segs, bizOpen, bizClose).some(f => f.bad || f.overlap);
            if (hasErr) { toast.error("时段有误，请调整后保存"); return; }
            const shiftType = segs.length === 0 ? "rest" : "custom";
            const workSegs = segs.filter(s => !s.isOT);
            const otSegs = segs.filter(s => s.isOT);
            const workStart = workSegs[0]?.start ?? null;
            const workEnd = workSegs[workSegs.length - 1]?.end ?? null;
            const otStart = otSegs[0]?.start ?? null;
            const otEnd = otSegs[0]?.end ?? null;
            const dates: string[] = [];
            if (rep === "none") {
              dates.push(schDrawer.date);
            } else {
              const end = new Date(repEndDate);
              const cur = new Date(schDrawer.date);
              while (cur <= end) {
                const dow = cur.getDay();
                if (rep === "daily") dates.push(toDateStr(cur));
                else if (rep === "workday" && dow >= 1 && dow <= 5) dates.push(toDateStr(cur));
                else if (rep === "weekly" && wdays.includes(dow)) dates.push(toDateStr(cur));
                cur.setDate(cur.getDate() + 1);
              }
            }
            Promise.all(dates.map(d =>
              saveOverrideMut.mutateAsync({
                staffUserId: schDrawer.staffUserId, overrideDate: d, shiftType,
                workStart: workStart ?? undefined, workEnd: workEnd ?? undefined,
                overtimeStart: otStart ?? undefined, overtimeEnd: otEnd ?? undefined,
                tenantId: currentTenantId ?? undefined,
              })
            )).then(() => setSchDrawer(null));
          }}
        />
      )}

      {/* 班次模板弹窗 */}
      {tplModal && (
        <TplModal
          bizOpen={bizOpen}
          bizClose={bizClose}
          templates={allTemplates}
          onClose={() => setTplModal(false)}
          onSave={(open, close) => { saveBizMut.mutate({ open, close, tenantId: currentTenantId ?? undefined }); setTplModal(false); }}
          saveTemplateMut={saveTemplateMut}
          tenantId={currentTenantId ?? undefined}
        />
      )}

      <PageTag code="P324" />
    </div>
  );
}

// ── 排班抽屉（全屏页面式）──
function SchDrawer({ staffUserId, staffName, roleKey, clinicName, date, initSegs, bizOpen, bizClose, onSaveBiz, templates, onClose, onSave }: {
  staffUserId: number; staffName: string; roleKey: string; clinicName: string; date: string; initSegs: Seg[];
  bizOpen: string; bizClose: string; onSaveBiz: (open: string, close: string) => void; templates: any[];
  onClose: () => void;
  onSave: (segs: Seg[], rep: string, wdays: number[], repEndDate: string) => void;
}) {
  const [segs, setSegs] = useState<Seg[]>(initSegs);
  const [rep, setRep] = useState("none");
  const [wdays, setWdays] = useState<number[]>([new Date(date).getDay()]);
  const [repEndDate, setRepEndDate] = useState("2026-12-31");
  // 门店营业时间（内置可编辑，改后即存）
  const [bizEditOpen, setBizEditOpen] = useState(false);

  const flags = validateSegs(segs, bizOpen, bizClose);
  const hasErr = flags.some(f => f.bad || f.overlap);

  const quickShifts = useMemo(() => {
    const tpl = templates.find((t: any) => t.staffUserId === staffUserId);
    if (!tpl) return [
      { label: "全天班", segs: [{ start: bizOpen, end: bizClose, isOT: false }] },
      { label: "上午班", segs: [{ start: bizOpen, end: "13:00", isOT: false }] },
      { label: "下午班", segs: [{ start: "13:00", end: bizClose, isOT: false }] },
    ];
    return [
      { label: "常规班", segs: templateToSegs(tpl) },
      { label: "上午班", segs: [{ start: tpl.workStart, end: "13:00", isOT: false }] },
      { label: "下午班", segs: [{ start: "13:00", end: tpl.workEnd, isOT: false }] },
    ];
  }, [templates, staffUserId, bizOpen, bizClose]);

  function addSeg(isOT: boolean) {
    const last = segs[segs.length - 1];
    const start = last ? last.end : bizOpen;
    const endT = isOT ? addMin(start, 150) : bizClose;
    setSegs([...segs, { start, end: toMin(endT) > toMin(start) ? endT : addMin(start, 180), isOT }]);
  }
  function delSeg(i: number) { setSegs(segs.filter((_, j) => j !== i)); }
  function setSeg(i: number, field: "start" | "end", v: string) {
    setSegs(segs.map((s, j) => j === i ? { ...s, [field]: v } : s));
  }

  let summaryText = "";
  let saveState: "normal" | "rest" | "disabled" = "normal";
  if (!segs.length) { summaryText = "今日休息"; saveState = "rest"; }
  else if (hasErr) {
    const m = flags.find(f => f.msg && (f.bad || f.overlap));
    summaryText = "时段有误：" + (m?.msg || "请检查") + "，请调整后保存";
    saveState = "disabled";
  } else {
    const tot = segs.reduce((a, s) => a + toMin(s.end) - toMin(s.start), 0);
    const otSegs = segs.filter(s => s.isOT);
    summaryText = `共 ${(tot / 60).toFixed(1)}h`;
    if (otSegs.length) summaryText += ` · 含加班 ${otSegs.length}段`;
    const overCnt = flags.filter(f => f.over).length;
    if (overCnt) summaryText += ` · ${overCnt}段超营业时间`;
    if (rep === "weekly") {
      const ds = [...wdays].sort().map(d => "周" + WK_FULL[d]).join("、");
      summaryText += ` · ${ds || "未选"}重复`;
    } else if (rep !== "none") {
      summaryText += ` · ${REPS.find(r => r.k === rep)?.t}`;
    }
  }

  const dateObj = new Date(date);
  const dateLabel = `${dateObj.getFullYear()}年${dateObj.getMonth() + 1}月${dateObj.getDate()}日 周${WK_FULL[dateObj.getDay()]}`;

  return (
    <div onClick={(e) => { e.stopPropagation(); onClose(); }} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "stretch", justifyContent: "center", zIndex: 200 }}>
      <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
      <div onClick={(e) => e.stopPropagation()} style={{ background: BG, width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", animation: "slideUp .25s" }}>
        <div style={{ background: `linear-gradient(90deg,${SKY},#3BA9E0)`, color: "#fff", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <span onClick={onClose} style={{ fontSize: 14, color: "#eaf6ff", cursor: "pointer", flex: 1 }}>取消</span>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.25 }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>员工排班</span>
            {clinicName && (
              <span style={{ fontSize: 11, color: "#dcf0fb", display: "flex", alignItems: "center", gap: 3, marginTop: 1, whiteSpace: "nowrap" }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#dcf0fb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-3"/></svg>
                {clinicName}
              </span>
            )}
          </div>
          <span style={{ flex: 1 }} />
        </div>
        <div style={{ overflowY: "auto", flex: 1, paddingBottom: 20 }}>
          {/* 成员信息 */}
          <div style={{ background: "#fff", marginTop: 10, padding: "15px 16px", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: "50%", background: roleColor(roleKey).bg, color: roleColor(roleKey).fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 600 }}>{staffName.charAt(0)}</div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: "#374151" }}>{staffName}</span>
                <span style={{ fontSize: 11, fontWeight: 600, padding: "1px 7px", borderRadius: 10, background: roleColor(roleKey).bg, color: roleColor(roleKey).fg }}>{roleLabel(roleKey)}</span>
              </div>
              <div style={{ fontSize: 12, color: GRAY, marginTop: 2 }}>{dateLabel}</div>
            </div>
          </div>

          {/* 门店营业时间（内置可编辑，作为时间轴/快捷班次基准） */}
          <div style={{ background: "#fff", marginTop: 10, padding: "13px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>门店营业时间</span>
                <span style={{ fontSize: 11, color: GRAY, marginTop: 2 }}>时间轴与全天/上下午班的基准 · 当前 {bizOpen}–{bizClose}</span>
              </div>
              {!bizEditOpen && (
                <span onClick={() => setBizEditOpen(true)} style={{ fontSize: 13, color: SKY, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>调整</span>
              )}
            </div>
            {bizEditOpen && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 11, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: "#51606e" }}>开门</span>
                <input type="time" defaultValue={bizOpen} step={300} id="biz-open-input" style={{ width: 92, fontSize: 14, fontWeight: 600, color: "#2a3340", border: `1px solid ${LINE}`, borderRadius: 8, padding: "6px 8px", background: "#fafbfc", fontFamily: "inherit", textAlign: "center" }} />
                <span style={{ color: "#c4ccd4" }}>–</span>
                <span style={{ fontSize: 13, color: "#51606e" }}>闭店</span>
                <input type="time" defaultValue={bizClose} step={300} id="biz-close-input" style={{ width: 92, fontSize: 14, fontWeight: 600, color: "#2a3340", border: `1px solid ${LINE}`, borderRadius: 8, padding: "6px 8px", background: "#fafbfc", fontFamily: "inherit", textAlign: "center" }} />
                <span
                  onClick={() => {
                    const o = (document.getElementById("biz-open-input") as HTMLInputElement)?.value || bizOpen;
                    const c = (document.getElementById("biz-close-input") as HTMLInputElement)?.value || bizClose;
                    if (toMin(c) <= toMin(o)) { toast.error("闭店时间须晚于开门时间"); return; }
                    onSaveBiz(o, c);
                    setBizEditOpen(false);
                  }}
                  style={{ fontSize: 13, color: "#fff", fontWeight: 600, cursor: "pointer", background: SKY, borderRadius: 8, padding: "6px 14px", marginLeft: "auto" }}
                >保存</span>
              </div>
            )}
          </div>

          {/* 快捷班次 */}
          <div style={{ background: "#fff", marginTop: 10 }}>
            <div style={{ fontSize: 12, color: "#9aa6b2", padding: "13px 16px 3px" }}>快捷班次</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "10px 16px 15px" }}>
              {quickShifts.map((qs, i) => {
                const on = JSON.stringify(segs) === JSON.stringify(qs.segs);
                return (
                  <div key={i} onClick={() => setSegs(qs.segs)} style={{ fontSize: 13, padding: "8px 15px", borderRadius: 8, fontWeight: on ? 600 : 500, cursor: "pointer", background: on ? SKY_L : "#f4f6f9", color: on ? SKY_D : "#51606e", border: `1px solid ${on ? SKY : "#eef1f5"}` }}>
                    {qs.label} <span style={{ fontSize: 11, opacity: .7 }}>{qs.segs[0]?.start}–{qs.segs[qs.segs.length - 1]?.end}</span>
                  </div>
                );
              })}
              <div onClick={() => setSegs([])} style={{ fontSize: 13, padding: "8px 15px", borderRadius: 8, fontWeight: !segs.length ? 600 : 500, cursor: "pointer", background: !segs.length ? "#eef1f4" : "#f4f6f9", color: !segs.length ? "#7a8794" : "#51606e", border: `1px solid ${!segs.length ? "#c7d0d8" : "#eef1f5"}` }}>休息</div>
            </div>
          </div>

          {/* 工作时段 */}
          <div style={{ background: "#fff", marginTop: 10 }}>
            <div style={{ fontSize: 12, color: "#9aa6b2", padding: "13px 16px 3px" }}>工作时段 · 可精确到分钟，支持多段 / 加班</div>
            {segs.length === 0 && <div style={{ fontSize: 13, color: "#9aa6b2", padding: "14px 16px" }}>今日休息，未排班</div>}
            {segs.map((s, i) => {
              const f = flags[i] || { bad: false, overlap: false, over: false, msg: "" };
              const isErr = f.bad || f.overlap;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 16px", borderBottom: `1px solid #f3f5f7`, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 14, color: "#374151", flexShrink: 0, display: "flex", alignItems: "center", gap: 7 }}>
                    {s.isOT ? "加班时段" : "工作时段"}
                    {s.isOT && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: WARN_L, color: WARN, fontWeight: 700 }}>加班</span>}
                    {!s.isOT && f.over && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: WARN_L, color: WARN, fontWeight: 700 }}>超时</span>}
                  </div>
                  <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <input type="time" value={s.start} step={300} onChange={e => setSeg(i, "start", e.target.value)} style={{ width: 84, fontSize: 14, fontWeight: 600, color: isErr ? "#c0392b" : "#2a3340", border: `1px solid ${isErr ? "#e9a39c" : LINE}`, borderRadius: 8, padding: "6px 8px", background: isErr ? "#fdf3f2" : "#fafbfc", fontFamily: "inherit", textAlign: "center" }} />
                    <span style={{ color: "#c4ccd4" }}>–</span>
                    <input type="time" value={s.end} step={300} onChange={e => setSeg(i, "end", e.target.value)} style={{ width: 84, fontSize: 14, fontWeight: 600, color: isErr ? "#c0392b" : "#2a3340", border: `1px solid ${isErr ? "#e9a39c" : LINE}`, borderRadius: 8, padding: "6px 8px", background: isErr ? "#fdf3f2" : "#fafbfc", fontFamily: "inherit", textAlign: "center" }} />
                    <span onClick={() => delSeg(i)} style={{ color: "#c4ccd4", fontSize: 18, paddingLeft: 4, cursor: "pointer" }}>×</span>
                  </div>
                  {f.msg && <div style={{ width: "100%", fontSize: 11, color: "#D9534F", marginTop: 6 }}>{f.msg}</div>}
                </div>
              );
            })}
            <div style={{ display: "flex", gap: 10, padding: "12px 16px" }}>
              <div onClick={() => addSeg(false)} style={{ flex: 1, textAlign: "center", fontSize: 13, fontWeight: 500, padding: 10, borderRadius: 8, border: "1px dashed #cdd7e0", color: SKY_D, background: "#fafdff", cursor: "pointer" }}>添加时段</div>
              <div onClick={() => addSeg(true)} style={{ flex: 1, textAlign: "center", fontSize: 13, fontWeight: 500, padding: 10, borderRadius: 8, border: `1px dashed ${WARN_LINE}`, color: WARN, background: WARN_L, cursor: "pointer" }}>添加加班</div>
            </div>
          </div>

          {/* 重复 */}
          <div style={{ background: "#fff", marginTop: 10 }}>
            <div style={{ fontSize: 12, color: "#9aa6b2", padding: "13px 16px 3px" }}>重复</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "10px 16px 14px" }}>
              {REPS.map(r => (
                <div key={r.k} onClick={() => setRep(r.k)} style={{ fontSize: 13, padding: "8px 15px", borderRadius: 8, fontWeight: rep === r.k ? 600 : 500, cursor: "pointer", background: rep === r.k ? SKY_L : "#f4f6f9", color: rep === r.k ? SKY_D : "#51606e", border: `1px solid ${rep === r.k ? SKY : "#eef1f5"}` }}>{r.t}</div>
              ))}
            </div>
            {rep === "weekly" && (
              <div style={{ display: "flex", gap: 7, padding: "0 16px 14px" }}>
                {[1, 2, 3, 4, 5, 6, 0].map(d => (
                  <div key={d} onClick={() => { const next = wdays.includes(d) ? wdays.filter(x => x !== d) : [...wdays, d]; setWdays(next); }} style={{ flex: 1, textAlign: "center", fontSize: 13, fontWeight: 500, padding: "9px 0", borderRadius: 8, cursor: "pointer", background: wdays.includes(d) ? SKY : "#f4f6f9", color: wdays.includes(d) ? "#fff" : "#6b7686", border: `1px solid ${wdays.includes(d) ? SKY : "#eef1f5"}` }}>{WK_FULL[d]}</div>
                ))}
              </div>
            )}
            {rep !== "none" && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderTop: `1px solid #f3f5f7`, fontSize: 14, color: "#374151" }}>
                <span>结束于</span>
                <input type="date" value={repEndDate} onChange={e => setRepEndDate(e.target.value)} style={{ fontSize: 14, border: "none", background: "transparent", fontFamily: "inherit", color: SKY_D, fontWeight: 600, textAlign: "right" }} />
              </div>
            )}
          </div>
        </div>

        {/* 底部保存 */}
        <div style={{ background: "#fff", padding: "12px 16px 20px", borderTop: `1px solid ${LINE}`, flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: saveState === "disabled" ? "#D9534F" : GRAY, textAlign: "center", marginBottom: 10, fontWeight: saveState === "disabled" ? 600 : 400 }}>{summaryText}</div>
          <div onClick={() => saveState !== "disabled" && onSave(segs, rep, wdays, repEndDate)} style={{
            width: "100%", background: saveState === "disabled" ? "#cdd5dd" : saveState === "rest" ? "#9aa7b4" : SKY_D,
            color: "#fff", padding: 13, borderRadius: 10, fontSize: 15, fontWeight: 600, textAlign: "center",
            cursor: saveState === "disabled" ? "not-allowed" : "pointer", transition: ".16s",
          }}>
            {saveState === "rest" ? "保存为休息" : "保存排班"}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 班次模板弹窗 ──
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
        <div style={{ background: "#f7f9fb", border: `1px solid ${LINE}`, borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: "#9aa6b2", marginBottom: 8 }}>门店营业时间（时间轴基准）</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#374151", fontWeight: 600 }}>
            <span>开门</span>
            <input type="time" value={open} step={300} onChange={e => setOpen(e.target.value)} style={{ width: 90, fontSize: 14, fontWeight: 600, color: "#2a3340", border: `1px solid ${LINE}`, borderRadius: 8, padding: "6px 8px", background: "#fff", fontFamily: "inherit", textAlign: "center" }} />
            <span style={{ color: "#c4ccd4" }}>–</span>
            <span>闭店</span>
            <input type="time" value={close} step={300} onChange={e => setClose(e.target.value)} style={{ width: 90, fontSize: 14, fontWeight: 600, color: "#2a3340", border: `1px solid ${LINE}`, borderRadius: 8, padding: "6px 8px", background: "#fff", fontFamily: "inherit", textAlign: "center" }} />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {templates.map((tpl: any) => (
            <div key={tpl.id} style={{ display: "flex", flexDirection: "column", gap: 9, padding: "10px 12px", background: "#fff", border: `1px solid ${LINE}`, borderRadius: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: SKY_L, color: SKY_D, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600 }}>{tpl.staffName.charAt(0)}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#2a3340", flex: 1 }}>{tpl.staffName}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="time" defaultValue={tpl.workStart} step={300} onBlur={e => saveTemplateMut.mutate({ id: tpl.id, staffUserId: tpl.staffUserId, workStart: e.target.value, workEnd: tpl.workEnd, workDays: tpl.workDays, tenantId })} style={{ width: 78, fontSize: 13, fontWeight: 600, color: "#2a3340", border: `1px solid ${LINE}`, borderRadius: 7, padding: "6px 4px", background: "#fafbfc", fontFamily: "inherit", textAlign: "center" }} />
                  <span style={{ color: "#c4ccd4" }}>–</span>
                  <input type="time" defaultValue={tpl.workEnd} step={300} onBlur={e => saveTemplateMut.mutate({ id: tpl.id, staffUserId: tpl.staffUserId, workStart: tpl.workStart, workEnd: e.target.value, workDays: tpl.workDays, tenantId })} style={{ width: 78, fontSize: 13, fontWeight: 600, color: "#2a3340", border: `1px solid ${LINE}`, borderRadius: 7, padding: "6px 4px", background: "#fafbfc", fontFamily: "inherit", textAlign: "center" }} />
                </div>
              </div>
              <div style={{ fontSize: 11, color: GRAY, paddingLeft: 2 }}>
                工作日：{tpl.workDays.map((d: number) => "周" + WK_FULL[d]).join("、")}
                {tpl.overtimeStart && tpl.overtimeEnd ? ` · 加班 ${tpl.overtimeStart}–${tpl.overtimeEnd}` : ""}
              </div>
            </div>
          ))}
          {templates.length === 0 && <div style={{ fontSize: 13, color: "#9aa6b2", textAlign: "center", padding: "20px 0" }}>暂无员工班次模板</div>}
        </div>
        <div onClick={() => onSave(open, close)} style={{ marginTop: 16, background: SKY, color: "#fff", textAlign: "center", padding: 13, borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>完成</div>
      </div>
    </div>
  );
}
