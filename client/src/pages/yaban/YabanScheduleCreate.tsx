/**
 * 牙伴齿科管理 - 新建预约页（P323）
 * 路由：/yaban/schedule/create
 *
 * 三步固定框架：
 *   第1步：选顾客 + 热力日历选日期 + 排班甘特图选医生时段
 *   第2步：选角色成员（按角色分组，来自 yabanRole.listRoles + yabanAppointment.listMembers）
 *   第3步：诊疗信息（项目、来源、备注等）
 */
import React, { useState, useMemo, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  ChevronRight, ChevronLeft, User, Stethoscope, FileText,
  Check, Search, Clock, Users,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useYabanClinic } from "./useYabanClinic";
import YabanClinicHeader from "./YabanClinicHeader";
import { loadApptRoleConfig, BUILTIN_ROLE_PRESETS } from "./YabanApptConfig";
import YabanHeatCalendar from "./YabanHeatCalendar";
import YabanGanttBar from "./YabanGanttBar";

// ── 共享样式常量（与 A314 联动，修改 yabanSharedStyles.ts 即可同步） ──
import {
  HEAT, heatColor as freeRateColor_, heatTextColor as freeRateTextColor_,
  getRoleBarColor, getRoleBarBgColor,
  SKY, SKY_D, SKY_L, INK, GRAY, GRAY_L, LINE, BORDER, BG, REQ, LABEL,
  WK, toDateStr as toDateStr_, timeToMin as timeToMin_, hm as hm_,
} from "./yabanSharedStyles";

// 静态选项
const ROOMS     = ["1号诊室", "2号诊室", "3号诊室", "VIP诊室"];
const DEPARTMENTS = ["口腔综合科", "正畸科", "种植科", "牙周科"];
const SOURCES   = ["电话预约", "微信预约", "到店预约", "转介绍", "网络预约"];
const PROJECTS  = ["洁牙", "补牙", "拔牙", "种植", "正畸", "根管治疗", "美白", "贴面", "牙冠"];
// 两步配置（选时段+选成员 合并为第1步）
const STEPS = [
  { key: "datetime", title: "选时段" },
  { key: "info",     title: "诊疗信息" },
];

// 时间工具（从共享模块 import，这里仅做别名转发）
const toDateStr = toDateStr_;
const timeToMin = timeToMin_;
const hm = hm_;
function readPrefill() {
  if (typeof window === "undefined") return {} as Record<string, string>;
  const sp = new URLSearchParams(window.location.search);
  const r: Record<string, string> = {};
  ["date","doctor","start","end"].forEach(k => { const v = sp.get(k); if (v) r[k] = v; });
  return r;
}
const isTime = (s?: string) => !!s && /^\d{2}:\d{2}$/.test(s);

interface FormData {
  patientName: string; patientId: string;
  date: string; startTime: string; endTime: string;
  doctor: string;
  // 角色成员选择（key = role_key, value = 成员名）
  roleSelections: Record<string, string>;
  // 角色成员选中的时段（key = role_key, value = 开始时间如 "09:00"）
  roleSlots: Record<string, string>;
  project: string; room: string; department: string; source: string; remark: string;
}

export default function YabanScheduleCreate() {
  const [, setLocation] = useLocation();
  const prefill = useMemo(() => readPrefill(), []);
  const [showPicker, setShowPicker] = useState<string | null>(null);
  const [docSearch, setDocSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const { currentTenantId, current } = useYabanClinic();
  const clinicName = current?.name?.trim() || current?.shortName?.trim() || "";
  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);

  const [form, setForm] = useState<FormData>({
    patientName: "", patientId: "",
    date: prefill.date || toDateStr(today),
    startTime: isTime(prefill.start) ? prefill.start : "09:00",
    endTime: isTime(prefill.end) ? prefill.end : "09:30",
    doctor: prefill.doctor || "",
    roleSelections: {},
    roleSlots: {},
    project: "", room: "", department: "", source: "", remark: "",
  });

  // 日历选中日期
  const [calSelDate, setCalSelDate] = useState<Date>(() => {
    if (prefill.date) {
      const [y,m,d] = prefill.date.split("-").map(Number);
      const dt = new Date(y, m-1, d); dt.setHours(0,0,0,0); return dt;
    }
    return today;
  });
  const [monthCursor, setMonthCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  // 回填顾客
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("selectedPatient");
      if (raw) {
        const p = JSON.parse(raw) as { id?: number; name?: string };
        if (p?.name) setForm(prev => ({ ...prev, patientName: p.name || "", patientId: p.id != null ? String(p.id) : "" }));
        sessionStorage.removeItem("selectedPatient");
      }
    } catch {}
  }, []);

  // ── API 数据 ──
  // 成员列表（含 roleKey）
  const { data: membersData = [] } = trpc.yabanAppointment.listMembers.useQuery(
    { tenantId: currentTenantId ?? undefined }
  );
  // 角色列表（含自定义角色名）
  const { data: rolesData = [] } = trpc.yabanRole.listRoles.useQuery(
    { tenantId: currentTenantId ?? undefined }
  );

  // 医生列表（role_key = doctor）
  const DOCTORS = useMemo(() =>
    (membersData as any[]).filter((m: any) => m.roleKey === "doctor").map((m: any) => ({ userId: m.userId, name: m.name })).filter((m: any) => m.name),
    [membersData]
  );

  // 角色显示配置：直接用后端 rolesData（已按 sort 排序），不依赖 localStorage
  const allRolesForConfig = useMemo(() => {
    if ((rolesData as any[]).length > 0) return (rolesData as any[]).map((r: any) => ({ role_key: r.role_key, name: r.name }));
    return BUILTIN_ROLE_PRESETS;
  }, [rolesData]);

  const roleConfig = useMemo(
    () => ({ roles: allRolesForConfig.map((r) => ({ role_key: r.role_key, name: r.name, visible: true })) }),
    [allRolesForConfig]
  );

  // 按角色分组的成员（必须先于 step2Roles 声明）
  const membersByRole = useMemo(() => {
    const map: Record<string, { userId: number; name: string }[]> = {};
    for (const m of (membersData as any[])) {
      if (!map[m.roleKey]) map[m.roleKey] = [];
      map[m.roleKey].push({ userId: m.userId, name: m.name });
    }
    return map;
  }, [membersData]);

  // 第1步下半部分的成员 Tab：第一个是医生（含甘特图），后面是其他角色（只显示有成员的）
  const memberTabs = useMemo(() => {
    // 医生 Tab 始终在第一个
    const doctorTab = { role_key: "doctor", name: "医生" };
    // 其他角色（visible=true，排除 doctor，且后端有成员）
    const otherTabs = roleConfig.roles.filter(r =>
      r.visible &&
      r.role_key !== "doctor" &&
      (membersByRole[r.role_key]?.length ?? 0) > 0
    );
    return [doctorTab, ...otherTabs];
  }, [roleConfig, membersByRole]);

  // 当前选中的成员 Tab（默认选医生）
  const [memberTab, setMemberTab] = useState<string>("doctor");
  // 当 memberTabs 变化时，如果当前 Tab 不存在则重置为第一个
  useEffect(() => {
    if (memberTabs.length > 0 && !memberTabs.find(r => r.role_key === memberTab)) {
      setMemberTab(memberTabs[0].role_key);
    }
  }, [memberTabs]);

  // 兼容旧变量名（不影响其他逻辑）
  const step2Roles = useMemo(() => memberTabs.filter(r => r.role_key !== "doctor"), [memberTabs]);
  const step2Tab = memberTab;
  const setStep2Tab = setMemberTab;

  // 热力日历数据
  const { data: monthStats0 = {} } = trpc.yabanAppointment.monthStats.useQuery({
    year: monthCursor.getFullYear(), month: monthCursor.getMonth() + 1,
    tenantId: currentTenantId ?? undefined,
  });
  const nextMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1);
  const { data: monthStats1 = {} } = trpc.yabanAppointment.monthStats.useQuery({
    year: nextMonth.getFullYear(), month: nextMonth.getMonth() + 1,
    tenantId: currentTenantId ?? undefined,
  });
  const monthStats = { ...(monthStats0 as any), ...(monthStats1 as any) } as Record<string, { cnt: number; minutes: number }>;

  // 排班数据
  const weekStart = useMemo(() => {
    const d = new Date(calSelDate);
    const dow = d.getDay();
    d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
    d.setHours(0,0,0,0);
    return toDateStr(d);
  }, [calSelDate]);

  const { data: weekSched } = trpc.yabanShift.weekSchedule.useQuery(
    { weekStart, tenantId: currentTenantId ?? undefined }, { enabled: !!weekStart }
  );
  const shiftTemplates = (weekSched?.templates ?? []) as any[];
  const shiftOverrides = (weekSched?.overrides ?? []) as any[];

  // 某天全院可排总时长
  function getDayCapacity(dStr: string): { capacity: number; hasShift: boolean } {
    let capacity = 0, hasShift = false;
    const dow = new Date(dStr).getDay();
    for (const tpl of shiftTemplates) {
      const ov = shiftOverrides.find((o: any) => o.staffUserId === tpl.staffUserId && o.overrideDate === dStr);
      if (ov) {
        if (ov.shiftType === "rest" || ov.shiftType === "leave") continue;
        if (ov.workStart && ov.workEnd) {
          const ws = timeToMin(ov.workStart), we = timeToMin(ov.workEnd);
          let mins = we - ws;
          if (ov.breakStart && ov.breakEnd) { const bs = timeToMin(ov.breakStart), be = timeToMin(ov.breakEnd); if (bs > ws && be < we) mins -= (be - bs); }
          if (mins > 0) { capacity += mins; hasShift = true; }
          continue;
        }
      }
      const days: number[] = tpl.workDays || [];
      if (days.length > 0 && !days.includes(dow)) continue;
      const ws = timeToMin(tpl.workStart || "09:00"), we = timeToMin(tpl.workEnd || "18:00");
      let mins = we - ws;
      if (tpl.breakStart && tpl.breakEnd) { const bs = timeToMin(tpl.breakStart), be = timeToMin(tpl.breakEnd); if (bs > ws && be < we) mins -= (be - bs); }
      if (mins > 0) { capacity += mins; hasShift = true; }
    }
    return { capacity, hasShift };
  }

  function freeRateColor(dStr: string): string {
    const stat = monthStats[dStr] as { minutes?: number } | undefined;
    const { capacity, hasShift } = getDayCapacity(dStr);
    if (!hasShift) return "#ECEFF3";
    if (capacity <= 0) return HEAT[9];
    const booked = stat?.minutes ?? 0;
    const rate = Math.min(1, Math.max(0, (capacity - booked) / capacity));
    if (rate >= 1) return HEAT[0];
    const idx = Math.min(9, Math.floor((1 - rate) * 10));
    return HEAT[idx];
  }
  function freeRateTextColor(dStr: string): string {
    const stat = monthStats[dStr] as { minutes?: number } | undefined;
    const { capacity, hasShift } = getDayCapacity(dStr);
    if (!hasShift) return GRAY_L;
    if (capacity <= 0) return "#fff";
    const booked = stat?.minutes ?? 0;
    const rate = Math.min(1, Math.max(0, (capacity - booked) / capacity));
    const idx = Math.min(9, Math.floor((1 - rate) * 10));
    return (idx <= 1 || idx >= 8) ? "#fff" : "#2a3340";
  }
  // 返回 0~1 的占用率（供 YabanHeatCalendar 共享组件使用）
  function freeRateRaw(dStr: string): number {
    const stat = monthStats[dStr] as { minutes?: number } | undefined;
    const { capacity, hasShift } = getDayCapacity(dStr);
    if (!hasShift || capacity <= 0) return 0;
    const booked = stat?.minutes ?? 0;
    return Math.min(1, Math.max(0, booked / capacity));
  }

  // 月历格子
  function getMonthCells(): (Date | null)[] {
    const y = monthCursor.getFullYear(), m = monthCursor.getMonth();
    const first = new Date(y, m, 1), last = new Date(y, m + 1, 0);
    const lead = first.getDay();
    const cells: (Date | null)[] = Array(lead).fill(null);
    for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(y, m, d));
    return cells;
  }

  // 有效班次
  type EffShift = { workStart: number; workEnd: number; segments: [number, number][] } | null;
  function buildShift(ws: number, we: number, bs?: number|null, be?: number|null): EffShift {
    if (we <= ws) return null;
    let segments: [number,number][] = [[ws, we]];
    if (bs != null && be != null && be > bs && bs > ws && be < we) segments = [[ws, bs], [be, we]];
    return { workStart: ws, workEnd: we, segments };
  }
  const toMin = (t?: string|null) => t ? timeToMin(t) : null;

  // 用 userId 匹配排班模板（比 staffName 字符串更可靠）
  function getEffectiveShift(userId: number, dStr: string): EffShift {
    const tpl = shiftTemplates.find((t: any) => t.staffUserId === userId);
    const ov = shiftOverrides.find((o: any) => o.staffUserId === userId && o.overrideDate === dStr);
    if (ov) {
      if (ov.shiftType === "rest" || ov.shiftType === "leave") return null;
      if (ov.workStart && ov.workEnd) return buildShift(timeToMin(ov.workStart), timeToMin(ov.workEnd), toMin(ov.breakStart), toMin(ov.breakEnd));
    }
    if (tpl) {
      const dow = new Date(dStr).getDay();
      const days: number[] = tpl.workDays || [];
      if (days.length > 0 && !days.includes(dow)) return null;
      if (tpl.workStart && tpl.workEnd) return buildShift(timeToMin(tpl.workStart), timeToMin(tpl.workEnd), toMin(tpl.breakStart), toMin(tpl.breakEnd));
    }
    return null;
  }

  const dateStr = toDateStr(calSelDate);
  const docShiftList = useMemo(() =>
    DOCTORS.map((doc: any) => ({ userId: doc.userId, name: doc.name, shift: getEffectiveShift(doc.userId, dateStr) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [DOCTORS, dateStr, shiftTemplates, shiftOverrides]
  );

  const { data: dayAppointments = [] } = trpc.yabanAppointment.listByDate.useQuery(
    { date: dateStr, tenantId: currentTenantId ?? undefined }
  );

  // 创建预约
  const createAppointment = trpc.yabanAppointment.create.useMutation({
    onSuccess: () => { setSubmitting(false); setLocation("/yaban/schedule"); },
    onError: (err) => { setSubmitting(false); alert(err.message || "创建失败，请重试"); },
  });

  const handleSelectPatient = () => setLocation("/yaban/followup/patient-select?from=schedule");

  // 顾客回填后自动跳到第1步（已在第1步，不跳）
  useEffect(() => {
    if (form.patientName && currentStep === 0) {
      // 顾客选好了，但还需要选日期时段，不自动跳
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.patientName]);

  // 排班甘特图区域 ref（选中日期后自动滚动到此处）
  const shiftSectionRef = useRef<HTMLDivElement>(null);

  // 点击日期
  const handleSelectDate = (d: Date) => {
    setCalSelDate(d);
    setForm(prev => ({ ...prev, date: toDateStr(d), doctor: "", startTime: "09:00", endTime: "09:30" }));
    // 自动滚动到排班甘特图区域
    setTimeout(() => {
      shiftSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  // 点击医生时段 → 选中医生和时段（不自动跳步，用户可继续选其他工种）
  const handleSelectSlot = (docName: string, startMin: number, endMin: number) => {
    setForm(prev => ({
      ...prev,
      doctor: docName,
      startTime: hm(startMin),
      endTime: hm(Math.min(endMin, startMin + 60)),
    }));
  };

  // 第2步选角色成员
  const handleSelectRoleMember = (roleKey: string, memberName: string) => {
    setForm(prev => ({
      ...prev,
      roleSelections: { ...prev.roleSelections, [roleKey]: memberName },
    }));
  };

  // 第2步完成判断（至少有一个角色被选中，或直接跳过）
  const step2HasAnySelection = Object.values(form.roleSelections).some(v => !!v);

  const handleSave = () => {
    if (!form.patientName) { alert("请选择顾客"); return; }
    if (!form.doctor) { alert("请在第1步选择医生时段"); return; }
    if (!form.project) { alert("请选择项目"); return; }
    if (submitting) return;
    setSubmitting(true);
    createAppointment.mutate({
      tenantId: currentTenantId ?? undefined,
      patientName: form.patientName,
      appointDate: form.date,
      appointTime: form.startTime,
      endTime: form.endTime,
      doctor: form.doctor,
      project: form.project,
      room: form.room || undefined,
      remark: [
        form.remark,
        ...Object.entries(form.roleSelections)
          .filter(([, v]) => !!v)
          .map(([k, v]) => {
            const role = allRolesForConfig.find(r => r.role_key === k);
            return `${role?.name || k}：${v}`;
          }),
      ].filter(Boolean).join("\n") || undefined,
    });
  };

  const handlePickerSelect = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setShowPicker(null); setDocSearch("");
  };

  // Picker 选项
  const getPickerOptions = (): string[] => {
    switch (showPicker) {
      case "room": return ROOMS;
      case "department": return DEPARTMENTS;
      case "source": return SOURCES;
      case "project": return PROJECTS;
      default: return [];
    }
  };
  const getPickerTitle = (): string => {
    switch (showPicker) {
      case "room": return "选择诊室";
      case "department": return "选择科室";
      case "source": return "选择预约来源";
      case "project": return "选择项目";
      default: return "";
    }
  };
  const pickerOptions = useMemo(() => getPickerOptions(), [showPicker]);

  // 甘特条工具
  const TRACK_START = 9 * 60, TRACK_END = 18 * 60, TRACK_MIN = TRACK_END - TRACK_START;
  function pct(min: number) { return Math.max(0, Math.min(100, (min - TRACK_START) / TRACK_MIN * 100)); }

  const monthCells = getMonthCells();

  // 样式工具
  const cardStyle: React.CSSProperties = { background: "#fff", margin: "0 10px", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 3px rgba(38,48,60,.04)" };
  const SelectRow = ({ label, value, placeholder, required, onClick }: {
    label: string; value: string; placeholder: string; required?: boolean; onClick: () => void;
  }) => (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px", minHeight: 46, borderBottom: `1px solid ${LINE}`, cursor: "pointer" }}>
      <span style={{ fontSize: 15, fontWeight: 600, color: LABEL, flexShrink: 0 }}>
        {label}{required && <span style={{ color: REQ, marginLeft: 3 }}>*</span>}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 16, minWidth: 0 }}>
        <span style={{ fontSize: 15, color: value ? INK : GRAY_L, fontWeight: value ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value || placeholder}</span>
        <ChevronRight size={17} color={GRAY_L} style={{ flexShrink: 0 }} />
      </div>
    </div>
  );
  const GroupTitle = ({ icon, text }: { icon: React.ReactNode; text: string }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "12px 14px 6px" }}>
      {icon}
      <span style={{ fontSize: 13, fontWeight: 700, color: LABEL, letterSpacing: ".3px" }}>{text}</span>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: BG, paddingBottom: 96 }}>

      {/* ── 顶部导航栏 ── */}
      <div style={{ background: `linear-gradient(90deg,${SKY},#3BA9E0)`, color: "#fff", padding: "12px 16px", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", position: "relative", minHeight: 32 }}>
          <button
            onClick={() => { if (currentStep > 0) setCurrentStep(0); else setLocation("/yaban/schedule"); }}
            style={{ background: "none", border: "none", color: "#fff", fontSize: 22, lineHeight: 1, cursor: "pointer", padding: "0 4px", flexShrink: 0, zIndex: 1 }}
          >‹</button>
          <span style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", fontSize: 17, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", pointerEvents: "none" }}>
            新建预约
          </span>
          <div style={{ marginLeft: "auto", zIndex: 1 }}><YabanClinicHeader compact /></div>
        </div>
        {/* 步骤指示器 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, paddingTop: 8 }}>
          {STEPS.map((s, i) => (
            <button
              key={s.key}
              onClick={() => i < currentStep && setCurrentStep(0)}
              style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: i < currentStep ? "pointer" : "default", opacity: i > currentStep ? 0.45 : 1 }}
            >
              <div style={{
                width: 20, height: 20, borderRadius: "50%",
                background: i < currentStep ? "rgba(255,255,255,0.9)" : i === currentStep ? "#fff" : "rgba(255,255,255,0.35)",
                color: i <= currentStep ? SKY_D : "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, flexShrink: 0,
              }}>
                {i < currentStep ? <Check size={11} color={SKY_D} /> : i + 1}
              </div>
              <span style={{ fontSize: 11, color: i === currentStep ? "#fff" : "rgba(255,255,255,0.7)", fontWeight: i === currentStep ? 700 : 400, whiteSpace: "nowrap" }}>{s.title}</span>
              {i < STEPS.length - 1 && <div style={{ width: 14, height: 1, background: "rgba(255,255,255,0.4)", marginLeft: 2 }} />}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════
          第1步：选顾客 + 热力日历 + 排班时段
      ══════════════════════════════════════════ */}
      {currentStep === 0 && (
        <>
          {/* 顾客 */}
          <div style={{ ...cardStyle, marginTop: 10 }}>
            <div onClick={handleSelectPatient} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", cursor: "pointer" }}>
              <div style={{ width: 42, height: 42, borderRadius: "50%", background: SKY_L, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <User size={21} color={SKY_D} strokeWidth={1.8} />
              </div>
              {form.patientName ? (
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: INK }}>{form.patientName}</span>
                  {form.patientId && <span style={{ fontSize: 12, color: GRAY_L, marginLeft: 8 }}>{form.patientId}</span>}
                </div>
              ) : (
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 16, color: INK, fontWeight: 700 }}>选择顾客</span>
                  <span style={{ color: REQ, marginLeft: 3 }}>*</span>
                  <div style={{ fontSize: 12, color: GRAY_L, marginTop: 1 }}>点击从顾客库中选择</div>
                </div>
              )}
              <ChevronRight size={18} color={GRAY_L} style={{ flexShrink: 0 }} />
            </div>
          </div>

          {/* 热力日历 — 使用共享组件 YabanHeatCalendar（与 A314 联动） */}
          <GroupTitle icon={<Clock size={14} color={SKY_D} />} text="选择预约日期" />
          <YabanHeatCalendar
            selDate={calSelDate}
            onSelectDate={(d) => handleSelectDate(d)}
            getCellLoad={(d) => {
              const dStr = toDateStr(d);
              const r = freeRateRaw(dStr);
              return r;
            }}
            monthCursor={monthCursor}
            onMonthChange={setMonthCursor}
            disablePast={true}
            showToggle={false}
          />

          {/* ── 成员选择 Tab 区域（医生甘特图 + 其他角色成员） ── */}
          <div ref={shiftSectionRef} />
          <GroupTitle icon={<Users size={14} color={SKY_D} />} text={`${calSelDate.getMonth()+1}月${calSelDate.getDate()}日 · 选择成员`} />
          <div style={{ ...cardStyle, overflow: "visible" }}>
            {/* Tab 栏：医生在第一个，后面是其他工种 */}
            <div style={{ display: "flex", borderBottom: `1px solid ${LINE}`, background: "#FAFBFC", overflowX: "auto" }}>
              {memberTabs.map(role => {
                const isActive = memberTab === role.role_key;
                const badge = role.role_key === "doctor"
                  ? (form.doctor || "")
                  : (form.roleSelections[role.role_key] || "");
                return (
                  <button
                    key={role.role_key}
                    onClick={() => setMemberTab(role.role_key)}
                    style={{
                      flexShrink: 0, padding: "10px 16px", fontSize: 13,
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? SKY_D : GRAY,
                      background: "none", border: "none",
                      borderBottom: isActive ? `2px solid ${SKY_D}` : "2px solid transparent",
                      cursor: "pointer", whiteSpace: "nowrap", transition: "all .15s",
                    }}
                  >
                    {role.name}
                    {badge && (
                      <span style={{ marginLeft: 4, fontSize: 10, color: "#fff", background: SKY_D, borderRadius: 8, padding: "1px 5px" }}>
                        {role.role_key === "doctor" ? badge.charAt(0) : badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* 每个 Tab 的内容：统一显示该角色所有成员的排班甘特条 */}
            {(() => {
              const role = memberTabs.find(r => r.role_key === memberTab);
              if (!role) return null;
              const isDoctor = role.role_key === "doctor";
              const members = isDoctor ? DOCTORS : (membersByRole[role.role_key] || []);
              const selectedName = isDoctor ? form.doctor : (form.roleSelections[role.role_key] || "");

              if (members.length === 0) {
                return <div style={{ padding: "20px 0", textAlign: "center", color: GRAY_L, fontSize: 13 }}>暂无排班数据</div>;
              }

              return (
                <div>
                  {members.map((member: any, idx: number) => {
                    const shift = getEffectiveShift(member.userId, dateStr);
                    const isSelected = selectedName === member.name;
                    // 医生 Tab：还需要显示当天预约占用情况
                    const memberAppts = isDoctor
                      ? (dayAppointments as any[]).filter((a: any) => a.doctor === member.name)
                      : [];

                    return (
                      <div key={member.userId}
                        style={{ borderBottom: idx < members.length - 1 ? `1px solid ${LINE}` : "none", padding: "10px 14px",
                          background: isSelected ? SKY_L : "transparent",
                          transition: "background .15s",
                        }}
                      >
                        {/* 成员头部信息 */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: shift ? 8 : 0 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                            background: (member.color && member.color !== "#1E88D6") ? member.color : (isSelected ? SKY_D : SKY_L),
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 13, fontWeight: 700,
                            color: (member.color && member.color !== "#1E88D6") ? "#fff" : (isSelected ? "#fff" : SKY_D),
                          }}>
                            {member.name.charAt(0)}
                          </div>
                          <span style={{ fontSize: 14, fontWeight: 600, color: isSelected ? SKY_D : INK }}>{member.name}</span>
                          {isSelected && <span style={{ fontSize: 11, color: SKY_D, background: "#D0EAFB", borderRadius: 6, padding: "2px 7px", fontWeight: 600 }}>已选</span>}
                          {!shift && <span style={{ fontSize: 11, color: GRAY_L, background: "#F0F2F5", borderRadius: 6, padding: "2px 7px" }}>今日休息</span>}
                          {shift && <span style={{ fontSize: 11, color: GRAY, marginLeft: "auto" }}>{hm(shift.workStart)}–{hm(shift.workEnd)}</span>}
                        </div>

                        {/* 甘特条 — 共享组件 YabanGanttBar（与 A314 联动） */}
                        <YabanGanttBar
                          shift={shift}
                          roleKey={role.role_key}
                          customColor={member.color && member.color !== "#1E88D6" ? member.color : undefined}
                          appointments={memberAppts}
                          isSelected={isSelected}
                          showSlots={true}
                          slotDuration={30}
                          selectedSlot={isDoctor
                            ? (form.doctor === member.name && form.startTime ? [timeToMin(form.startTime), timeToMin(form.startTime) + 30] as [number,number] : null)
                            : (form.roleSelections[role.role_key] === member.name && form.roleSlots?.[role.role_key] ? [timeToMin(form.roleSlots[role.role_key]), timeToMin(form.roleSlots[role.role_key]) + 30] as [number,number] : null)
                          }
                          onSlotClick={(t, slotEnd) => {
                            if (isDoctor) {
                              handleSelectSlot(member.name, t, slotEnd);
                            } else {
                              const curSel = form.roleSelections[role.role_key] === member.name && form.roleSlots?.[role.role_key] === hm(t);
                              handleSelectRoleMember(role.role_key, curSel ? "" : member.name);
                              setForm(prev => ({ ...prev, roleSlots: { ...(prev.roleSlots||{}), [role.role_key]: curSel ? "" : hm(t) } }));
                            }
                          }}
                        />
                        {shift && <div style={{ height: 14 }} />}
                      </div>
                    );
                  })}

                  {/* 医生 Tab：已选时段摘要条 */}
                  {isDoctor && form.doctor && (
                    <div style={{ padding: "10px 14px", background: SKY_L, borderTop: `1px solid ${LINE}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Check size={15} color={SKY_D} />
                        <span style={{ fontSize: 13, color: SKY_D, fontWeight: 600 }}>
                          已选：{form.doctor} · {form.startTime}–{form.endTime}
                        </span>
                        <button onClick={() => setForm(prev => ({ ...prev, doctor: "", startTime: "09:00", endTime: "09:30" }))}
                          style={{ marginLeft: "auto", fontSize: 11, color: GRAY_L, background: "none", border: "none", cursor: "pointer" }}>清除</button>
                      </div>
                    </div>
                  )}
                  {/* 非医生 Tab：显示暂不选按鈕 */}
                  {!isDoctor && (
                    <div style={{ padding: "8px 14px", borderTop: `1px solid ${LINE}` }}>
                      <button
                        onClick={() => handleSelectRoleMember(role.role_key, "")}
                        style={{
                          padding: "5px 14px", borderRadius: 16, fontSize: 12, cursor: "pointer",
                          background: !selectedName ? SKY_D : "#F0F4F8",
                          color: !selectedName ? "#fff" : GRAY,
                          border: !selectedName ? "none" : `1px solid ${BORDER}`,
                          fontWeight: 500,
                        }}
                      >
                        暂不选
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* 第1步底部：下一步按钮 */}
          <div style={{ margin: "16px 10px 0" }}>
            <button
              onClick={() => {
                if (!form.patientName) { alert("请先选择顾客"); return; }
                if (!form.doctor) { alert("请先在医生 Tab 中选择时段"); return; }
                setCurrentStep(1);
              }}
              style={{
                width: "100%", padding: "13px 0", textAlign: "center", fontSize: 15, color: "#fff", fontWeight: 600,
                background: (form.patientName && form.doctor) ? `linear-gradient(90deg,${SKY_D},${SKY})` : GRAY_L,
                border: "none", borderRadius: 12, cursor: "pointer",
                boxShadow: (form.patientName && form.doctor) ? `0 4px 12px rgba(30,136,214,.28)` : "none",
              }}
            >
              下一步：填写诊疗信息
            </button>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════
          第2步：诊疗信息
      ══════════════════════════════════════════ */}
      {currentStep === 1 && (
        <>
          {/* 摘要 */}
          <div style={{ ...cardStyle, marginTop: 10, padding: "10px 14px", background: SKY_L }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Check size={15} color={SKY_D} />
              <span style={{ fontSize: 13, color: SKY_D, fontWeight: 600 }}>
                {form.patientName} · {form.doctor} · {form.date} {form.startTime}–{form.endTime}
              </span>
              <button onClick={() => setCurrentStep(0)} style={{ marginLeft: "auto", fontSize: 11, color: SKY_D, background: "none", border: "none", cursor: "pointer" }}>修改</button>
            </div>
            {Object.entries(form.roleSelections).filter(([, v]) => !!v).map(([k, v]) => {
              const role = allRolesForConfig.find(r => r.role_key === k);
              return (
                <div key={k} style={{ fontSize: 12, color: SKY_D, marginTop: 4 }}>
                  {role?.name || k}：{v}
                </div>
              );
            })}
          </div>

          <GroupTitle icon={<Stethoscope size={14} color={SKY_D} />} text="诊疗信息" />
          <div style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px", minHeight: 46, borderBottom: `1px solid ${LINE}` }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: LABEL }}>诊所</span>
              <span style={{ fontSize: 15, color: INK, fontWeight: 600 }}>{clinicName || "当前所属医院"}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px", minHeight: 46, borderBottom: `1px solid ${LINE}` }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: LABEL }}>医生</span>
              <span style={{ fontSize: 15, color: form.doctor ? INK : GRAY_L, fontWeight: form.doctor ? 600 : 400 }}>{form.doctor || "待选择"}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px", minHeight: 46, borderBottom: `1px solid ${LINE}` }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: LABEL }}>预约时段</span>
              <span style={{ fontSize: 15, color: INK, fontWeight: 600 }}>{form.date} {form.startTime}–{form.endTime}</span>
            </div>
            <SelectRow label="项目" value={form.project} placeholder="请选择项目" required onClick={() => setShowPicker("project")} />
            <SelectRow label="诊室" value={form.room} placeholder="请选择诊室" onClick={() => setShowPicker("room")} />
            <SelectRow label="科室" value={form.department} placeholder="请选择科室" onClick={() => setShowPicker("department")} />
            <SelectRow label="预约来源" value={form.source} placeholder="请选择来源" onClick={() => setShowPicker("source")} />
          </div>

          <GroupTitle icon={<FileText size={14} color={SKY_D} />} text="备注" />
          <div style={{ ...cardStyle, padding: "12px 16px" }}>
            <textarea
              value={form.remark}
              onChange={(e) => setForm(prev => ({ ...prev, remark: e.target.value }))}
              placeholder="输入备注信息（选填）"
              rows={3}
              style={{ width: "100%", fontSize: 14, color: INK, background: "transparent", outline: "none", border: "none", resize: "none" }}
            />
          </div>
        </>
      )}

      {/* 保存按鈕（仅第2步显示） */}
      {currentStep === 1 && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: "#fff", padding: "10px 16px calc(10px + env(safe-area-inset-bottom))", borderTop: `1px solid ${LINE}`, maxWidth: 480, margin: "0 auto" }}>
          <button
            onClick={handleSave}
            disabled={submitting}
            style={{ width: "100%", padding: "13px 0", textAlign: "center", fontSize: 15, color: "#fff", fontWeight: 600, background: submitting ? GRAY_L : `linear-gradient(90deg,${SKY_D},${SKY})`, border: "none", borderRadius: 12, cursor: submitting ? "default" : "pointer", boxShadow: `0 4px 12px rgba(30,136,214,.28)` }}
          >
            {submitting ? "保存中..." : "保存预约"}
          </button>
        </div>
      )}

      {/* Picker 弹窗 */}
      {showPicker && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div style={{ flex: 1, background: "rgba(38,48,60,.35)" }} onClick={() => { setShowPicker(null); setDocSearch(""); }} />
          <div style={{ background: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "64vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${LINE}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <button style={{ fontSize: 14, color: GRAY_L, background: "transparent", border: "none", cursor: "pointer" }} onClick={() => { setShowPicker(null); setDocSearch(""); }}>取消</button>
              <span style={{ fontSize: 15, fontWeight: 600, color: INK }}>{getPickerTitle()}</span>
              <div style={{ width: 32 }} />
            </div>
            <div style={{ overflowY: "auto" }}>
              {pickerOptions.length === 0 && <div style={{ textAlign: "center", padding: "28px 0", color: GRAY_L, fontSize: 13 }}>无匹配结果</div>}
              {pickerOptions.map(option => {
                const selected = form[showPicker as keyof FormData] === option;
                return (
                  <button key={option} onClick={() => handlePickerSelect(showPicker, option)}
                    style={{ width: "100%", padding: "0 16px", minHeight: 52, display: "flex", alignItems: "center", justifyContent: "space-between", textAlign: "left", fontSize: 15, borderBottom: `1px solid ${LINE}`, background: (selected as any) ? SKY_L : "#fff", color: (selected as any) ? SKY_D : INK, fontWeight: (selected as any) ? 600 : 400, border: "none", cursor: "pointer" }}>
                    <span>{option}</span>
                    {(selected as any) && <Check size={18} color={SKY_D} />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
