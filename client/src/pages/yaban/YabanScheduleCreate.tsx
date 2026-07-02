/**
 * 牙伴齿科管理 - 新建预约页（P323）
 * 路由：/yaban/schedule/create
 *
 * 三步固定框架：
 *   第1步：选顾客 + 热力日历选日期 + 排班甘特图选医生时段
 *   第2步：选角色成员（按角色分组，来自 yabanRole.listRoles + yabanAppointment.listMembers）
 *   第3步：诊疗信息（项目、来源、备注等）
 */
import React, { useState, useMemo, useEffect, useRef, useCallback, memo } from "react";
import { useLocation } from "wouter";
import {
  ChevronRight, ChevronLeft, User, Stethoscope, FileText,
  Check, Search, Clock, Users,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { avatarSrc, ageToBucket, avatarBg, type AvatarKey } from "@/lib/yaban-avatar";
import { useYabanClinic } from "./useYabanClinic";
import YabanClinicHeader from "./YabanClinicHeader";
import { loadApptRoleConfig, BUILTIN_ROLE_PRESETS } from "./YabanApptConfig";
import YabanHeatCalendar from "./YabanHeatCalendar";
import YabanGanttBar from "./YabanGanttBar";
import ChargeProductPicker from "./ChargeProductPicker";

// ── 共享样式常量（与 A314 联动，修改 yabanSharedStyles.ts 即可同步） ──
import {
  HEAT, heatColor as freeRateColor_, heatTextColor as freeRateTextColor_,
  getRoleBarColor, getRoleBarBgColor,
  SKY, SKY_D, SKY_L, INK, GRAY, GRAY_L, LINE, BORDER, BG, REQ, LABEL,
  WK, toDateStr as toDateStr_, timeToMin as timeToMin_, hm as hm_,
} from "./yabanSharedStyles";

// 静态选项（已替换为动态加载，保留空数组兜底）
const ROOMS: string[] = [];
const DEPARTMENTS: string[] = [];
const SOURCES: string[] = [];
const PROJECTS: string[] = [];
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
  patientName: string; patientId: string; patientMobile: string;
  date: string; startTime: string; endTime: string;
  doctor: string;
  // 角色成员选择（key = role_key, value = 成员名）
  roleSelections: Record<string, string>;
  // 角色成员选中的时段（key = role_key, value = 开始时间如 "09:00"）
  roleSlots: Record<string, string>;
  project: string; room: string; department: string; source: string; remark: string;
  consultant: string; assistant: string; visitType: string;
  selectedProjects: string[]; // 多选项目
}

// ── 独立轮盘组件（memo 隔离，RAF 节流，避免父组件重渲染导致卡顿）──
interface WheelPickerProps {
  options: { min: number; label: string; occupied?: boolean }[];
  selectedMin: number;
  onSelect: (min: number, lbl: string) => void;
  label: string;
  itemH: number;
}
const WheelPickerMemo = memo(function WheelPicker({ options, selectedMin, onSelect, label, itemH }: WheelPickerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  // 初始定位：仅在 options 或 selectedMin 变化时执行一次
  const prevSelectedRef = useRef<number>(-1);
  // 原理：
  // - 容器高度 5*itemH，蓝框在中间第3行 top:itemH*2
  // - 前占位 2 行 + 后占位 2 行（让首尾项能滚到中间）
  // - scrollSnapAlign: start → snap 后该项顶部对齐容器顶部
  // - 前占位高度 2*itemH，所以内容项顶部对齐容器顶部时，实际显示在第3行
  // - scrollTop = idx*itemH 时第 idx 项在中间（前占位已被滚动到容器外）
  // - handleScroll: idx = round(scrollTop/itemH)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = options.findIndex(o => o.min === selectedMin);
    if (idx >= 0 && prevSelectedRef.current !== selectedMin) {
      // scrollTop = idx*itemH 时，前占位(2*itemH)已在容器上方，第 idx 项在第3行
      el.scrollTop = idx * itemH;
      prevSelectedRef.current = selectedMin;
    }
  }, [options, selectedMin, itemH]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const idx = Math.round(scrollTop / itemH);
      if (idx >= 0 && idx < options.length) {
        const opt = options[idx];
        if (opt) onSelect(opt.min, opt.label);
      }
      rafRef.current = null;
    });
  }, [options, onSelect, itemH]);

  return (
    <div style={{ flex: 1 }}>
      <div style={{ textAlign: "center", fontSize: 11, color: GRAY_L, marginBottom: 4, fontWeight: 600, letterSpacing: 1 }}>{label}</div>
      <div style={{ position: "relative", height: itemH * 5, overflow: "hidden", borderRadius: 12, border: `1px solid ${LINE}`, background: "#F8FAFC" }}>
        {/* 蓝框在中间第3行 */}
        <div style={{ position: "absolute", top: itemH * 2, left: 4, right: 4, height: itemH, background: "rgba(30,136,214,.08)", border: `2px solid ${SKY_D}`, borderRadius: 8, pointerEvents: "none", zIndex: 2 }} />
        {/* 上下渐变遮罩 */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: itemH * 2, background: "linear-gradient(to bottom, rgba(248,250,252,1), rgba(248,250,252,0))", pointerEvents: "none", zIndex: 3 }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: itemH * 2, background: "linear-gradient(to top, rgba(248,250,252,1), rgba(248,250,252,0))", pointerEvents: "none", zIndex: 3 }} />
        <div
          ref={scrollRef}
          style={{
            overflowY: "scroll",
            height: "100%",
            scrollSnapType: "y mandatory",
            WebkitOverflowScrolling: "touch",
          } as React.CSSProperties}
          onScroll={handleScroll}
        >
          {/* 前占位 2 行：让第一项能滚到中间蓝框 */}
          <div style={{ height: itemH * 2, flexShrink: 0 }} />
          {options.map((opt) => (
            <div
              key={opt.min}
              style={{
                height: itemH,
                display: "flex", alignItems: "center", justifyContent: "center",
                scrollSnapAlign: "center",
                fontSize: selectedMin === opt.min ? 20 : 14,
                fontWeight: selectedMin === opt.min ? 800 : 500,
                letterSpacing: selectedMin === opt.min ? "0.04em" : "0.02em",
                fontFamily: "'Oswald', 'Anton', 'Impact', 'Arial Black', sans-serif",
                fontVariantNumeric: "tabular-nums",
                transform: selectedMin === opt.min ? "scaleY(0.88)" : "scaleY(0.82)",
                color: opt.occupied ? "#CBD5E1" : (selectedMin === opt.min ? SKY_D : "#374151"),
                textDecoration: opt.occupied ? "line-through" : "none",
                cursor: "pointer",
                transition: "font-size .15s ease, color .15s ease, font-weight .15s ease",
                flexShrink: 0,
              } as React.CSSProperties}
              onClick={() => { onSelect(opt.min, opt.label); }}
            >
              {opt.label}{opt.occupied ? " 已占" : ""}
            </div>
          ))}
          {/* 后占位 2 行：让最后一项能滚到中间蓝框 */}
          <div style={{ height: itemH * 2, flexShrink: 0 }} />
        </div>
      </div>
    </div>
  );
});

export default function YabanScheduleCreate() {
  const [, setLocation] = useLocation();
  const prefill = useMemo(() => readPrefill(), []);
  const [showPicker, setShowPicker] = useState<string | null>(null);
  const [docSearch, setDocSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  // 顾客内嵌搜索
  const [patientSearch, setPatientSearch] = useState("");
  const [patientSearchFocus, setPatientSearchFocus] = useState(false);
  const patientSearchRef = useRef<HTMLInputElement>(null);

  // 第一步三个折叠面板展开状态：'patient' | 'date' | 'doctor' | null
  const [step1Open, setStep1Open] = useState<'patient' | 'date' | 'doctor' | null>(null);
  // 兼容旧逻辑：step1Mode 指向同一状态
  const step1Mode = step1Open;
  // 日期条翻页偏移（0=今天起，7=下一周，14=再下一周……）
  const [dateOffset, setDateOffset] = useState(0);
  const [timePickerOpen, setTimePickerOpen] = useState(true);
  // 时间轮盘临时选中（未点确定前不写入 form）
  const [pendingStart, setPendingStart] = useState("");
  const [pendingEnd, setPendingEnd] = useState("");
  // 轮盘回调（useCallback 稳定引用，防止 memo 失效）
  // 保留上次设定的时长（pendingEnd - pendingStart），如果无效则默认 30min
  const pendingStartRef = useRef("");
  const pendingEndRef = useRef("");
  const handleStartSelect = useCallback((min: number, lbl: string) => {
    const prevStart = pendingStartRef.current ? timeToMin(pendingStartRef.current) : -1;
    const prevEnd = pendingEndRef.current ? timeToMin(pendingEndRef.current) : -1;
    const duration = (prevStart > 0 && prevEnd > prevStart) ? (prevEnd - prevStart) : 30;
    const newEnd = hm(Math.min(min + duration, 18 * 60)); // 防止超过 workEnd，粗略用 18:00
    setPendingStart(lbl);
    setPendingEnd(newEnd);
    pendingStartRef.current = lbl;
    pendingEndRef.current = newEnd;
  }, []);
  const handleEndSelect = useCallback((_min: number, lbl: string) => {
    setPendingEnd(lbl);
    pendingEndRef.current = lbl;
  }, []);

  const { currentTenantId, current } = useYabanClinic();
  const clinicName = current?.name?.trim() || current?.shortName?.trim() || "";
  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);

  const [form, setForm] = useState<FormData>({
    patientName: "", patientId: "", patientMobile: "",
    date: prefill.date || toDateStr(today),
    startTime: isTime(prefill.start) ? prefill.start : "09:00",
    endTime: isTime(prefill.end) ? prefill.end : "09:30",
    doctor: prefill.doctor || "",
    roleSelections: {},
    roleSlots: {},
    project: "", room: "", department: "", source: "", remark: "",
    consultant: "", assistant: "", visitType: "复诊",
    selectedProjects: [],
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
  const { data: rolesData = [] } = trpc.yabanRole.listRolesSimple.useQuery(
    { tenantId: currentTenantId ?? undefined }
  );
  // 诊室列表
  const { data: roomsData = [] } = trpc.yabanRoom.list.useQuery(
    { tenantId: currentTenantId ?? undefined }
  );
  // 科室列表
  const { data: deptsData = [] } = trpc.yabanDept.list.useQuery(
    { tenantId: currentTenantId ?? undefined }
  );
  // 顾客来源列表
  const { data: sourcesData = [] } = trpc.yabanCustomer.listCustomerSources.useQuery(
    undefined, { refetchOnWindowFocus: false }
  );
  // 收费项目列表
  const [showProjectPicker, setShowProjectPicker] = useState(false);

  // 医生列表（role_key = doctor）
  const DOCTORS = useMemo(() =>
    (membersData as any[]).filter((m: any) => m.roleKey === "doctor").map((m: any) => ({ userId: m.userId, name: m.name, color: m.color, avatar: m.avatar, phone: m.phone, roleName: m.roleName })).filter((m: any) => m.name),
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
    // 其他角色（visible=true，排除 doctor，所有角色都显示，无成员时显示空列表）
    const otherTabs = roleConfig.roles.filter(r =>
      r.visible &&
      r.role_key !== "doctor"
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

  // 顾客搜索（内嵌，不跳转）
  const { data: patientResults = [] } = trpc.yabanCustomer.searchCustomerOnly.useQuery(
    { query: patientSearch },
    { enabled: patientSearchFocus }
  );
  // 选中后拉取完整档案
  const { data: patientDetail } = trpc.yabanCustomer.detail.useQuery(
    { id: Number(form.patientId) },
    { enabled: !!form.patientId && !isNaN(Number(form.patientId)) }
  );
  const handleSelectPatientInline = (p: { id: number; name: string; mobile: string }) => {
    setForm(prev => ({ ...prev, patientName: p.name, patientId: String(p.id), patientMobile: p.mobile || "" }));
    setPatientSearch("");
    setPatientSearchFocus(false);
    setStep1Open(null); // 选完顾客后自动收起面板
  };
  const handleClearPatient = () => {
    setForm(prev => ({ ...prev, patientName: "", patientId: "", patientMobile: "" }));
    setPatientSearch("");
    setStep1Open('patient');
    setTimeout(() => patientSearchRef.current?.focus(), 50);
  };

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
    if (form.selectedProjects.length === 0 && !form.project) { alert("请选择项目"); return; }
    if (!form.visitType) { alert("请选择就诊类型"); return; }
    if (submitting) return;
    setSubmitting(true);
    createAppointment.mutate({
      tenantId: currentTenantId ?? undefined,
      patientName: form.patientName,
      appointDate: form.date,
      appointTime: form.startTime,
      endTime: form.endTime,
      doctor: form.doctor,
      project: form.selectedProjects.length > 0 ? form.selectedProjects.join("、") : (form.project || undefined),
      room: form.room || undefined,
      department: form.department || undefined,
      source: form.source || undefined,
      consultant: form.consultant || undefined,
      assistant: form.assistant || undefined,
      visitType: form.visitType || undefined,
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

  // 动态选项（诊室/科室/来源 均来自后端）
  const DYNAMIC_ROOMS = useMemo(() => (roomsData as any[]).map((r: any) => r.name), [roomsData]);
  const DYNAMIC_DEPTS = useMemo(() => (deptsData as any[]).map((d: any) => d.name), [deptsData]);
  const DYNAMIC_SOURCES = useMemo(() => {
    const list: string[] = [];
    for (const s of (sourcesData as any[])) {
      if (s.label) list.push(s.label);
      if (s.children) for (const c of s.children) { if (c.label) list.push(c.label); }
    }
    return list;
  }, [sourcesData]);
  // 咨询师和助理列表
  const CONSULTANTS = useMemo(() => (membersData as any[]).filter((m: any) => m.roleKey === "consultant").map((m: any) => m.name).filter(Boolean), [membersData]);
  const ASSISTANTS = useMemo(() => (membersData as any[]).filter((m: any) => m.roleKey === "assistant").map((m: any) => m.name).filter(Boolean), [membersData]);

  // Picker 选项
  const getPickerOptions = (): string[] => {
    switch (showPicker) {
      case "doctor": return DOCTORS.map((m: any) => m.name);
      case "room": return DYNAMIC_ROOMS;
      case "department": return DYNAMIC_DEPTS;
      case "source": return DYNAMIC_SOURCES;
      case "consultant": return CONSULTANTS;
      case "assistant": return ASSISTANTS;
      default: return [];
    }
  };
  const getPickerTitle = (): string => {
    switch (showPicker) {
      case "doctor": return "选择主治医生";
      case "room": return "选择诊室";
      case "department": return "选择科室";
      case "source": return "选择预约来源";
      case "consultant": return "选择咨询师";
      case "assistant": return "选择助理";
      default: return "";
    }
  };
  const pickerOptions = useMemo(() => getPickerOptions(), [showPicker, DOCTORS, DYNAMIC_ROOMS, DYNAMIC_DEPTS, DYNAMIC_SOURCES, CONSULTANTS, ASSISTANTS]);

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

      </div>

      {/* ══════════════════════════════════════════
          第1步：选顾客 + 热力日历 + 排班时段
      ══════════════════════════════════════════ */}
      {currentStep === 0 && (
        <>
          {/* ── 1. 选顾客 ── */}
          <div style={{ ...cardStyle, marginTop: 10, overflow: "visible", position: "relative" }}>
            {form.patientName ? (
              /* 已选顾客：整个卡片显示档案，右上角“更换”按鈕 */
              (() => {
                const r = patientDetail as any;
                const age = r?.age ? Number(r.age) : 0;
                const genderKey = r?.gender === "女" ? "female" : "male";
                const avatarKey = (r?.avatar as AvatarKey) || (`${genderKey}_${ageToBucket(age)}` as AvatarKey);
                function GF({ label, value, full }: { label: string; value?: string | null; full?: boolean }) {
                  if (!value) return null;
                  return (
                    <div style={{ gridColumn: full ? "1 / -1" : undefined, borderBottom: `1px dashed ${LINE}`, borderRight: `1px dashed ${LINE}`, padding: "5px 10px", display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 10, color: GRAY_L, flexShrink: 0, whiteSpace: "nowrap" }}>{label}</span>
                      <span style={{ fontSize: 12.5, color: INK, wordBreak: "break-all" }}>{value}</span>
                    </div>
                  );
                }
                return (
                  <div>
                    {/* 档案标题条：左侧标题，右上角更换按鈕 */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: `linear-gradient(90deg,${SKY_D},${SKY})`, padding: "8px 12px", borderRadius: "14px 14px 0 0" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#fff", letterSpacing: 1 }}>顾客档案</span>
                        {r?.medical_no && <span style={{ fontSize: 11, color: "rgba(255,255,255,.75)" }}>编号：{r.medical_no}</span>}
                      </div>
                      <button
                        onClick={handleClearPatient}
                        style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: SKY_D, border: "none", borderRadius: 4, padding: "3px 10px", cursor: "pointer" }}
                      >更换</button>
                    </div>
                    {/* 姓名年龄行（含虚拟头像） */}
                    <div style={{ display: "flex", alignItems: "center", borderBottom: `1px dashed ${LINE}`, padding: "8px 12px", gap: 10 }}>
                      <div style={{ width: 44, height: 44, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: avatarBg[avatarKey] || SKY_L }}>
                        <img src={avatarSrc(avatarKey)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: INK }}>{form.patientName}</div>
                        {age > 0 && <div style={{ fontSize: 12, color: GRAY_L, marginTop: 2 }}>{age}岁</div>}
                      </div>
                    </div>
                    {/* 字段网格 */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                      <GF label="手机" value={r?.mobile || form.patientMobile} />
                      <GF label="来源" value={r?.source} />
                      <GF label="咨询师" value={r?.consultant || r?.net_consultant} />
                      <GF label="主治医生" value={r?.last_doctor} />
                      <GF label="上次就诊" value={r?.last_visit} full />
                      {r?.address && <GF label="地址" value={r.address} full />}
                      {r?.remark && <GF label="备注" value={r.remark} full />}
                    </div>
                  </div>
                );
              })()
            ) : (
              /* 未选顾客：整个卡片就是搜索框，直接可输入 */
              <div style={{ position: "relative" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 14px", minHeight: 75 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: SKY_L, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <User size={19} color={SKY_D} />
                  </div>
                  <input
                    ref={patientSearchRef}
                    value={patientSearch}
                    onChange={e => setPatientSearch(e.target.value)}
                    onFocus={() => setPatientSearchFocus(true)}
                    onBlur={() => setTimeout(() => setPatientSearchFocus(false), 180)}
                    placeholder="搜索顾客姓名 / 手机号"
                    style={{ flex: 1, fontSize: 16, color: INK, background: "transparent", border: "none", outline: "none", padding: 0 }}
                  />
                  <Search size={19} color={GRAY_L} strokeWidth={2} style={{ flexShrink: 0 }} />
                </div>
                {patientSearchFocus && (
                  <div style={{ position: "absolute", left: 0, right: 0, top: "100%", zIndex: 200, background: "#fff", borderRadius: "0 0 14px 14px", boxShadow: "0 8px 24px rgba(38,48,60,.13)", maxHeight: 240, overflowY: "auto", borderTop: `1px solid ${LINE}` }}>
                    {(patientResults as any[]).length === 0 ? (
                      <div style={{ padding: "18px 16px", textAlign: "center", color: GRAY_L, fontSize: 13 }}>
                        {patientSearch ? "未找到匹配顾客" : "输入姓名或手机号搜索"}
                      </div>
                    ) : (
                      (patientResults as any[]).map((p: any) => (
                        <button key={p.id} onMouseDown={() => handleSelectPatientInline(p)}
                          style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "none", border: "none", borderBottom: `1px solid ${LINE}`, cursor: "pointer", textAlign: "left" }}>
                          <div style={{ width: 34, height: 34, borderRadius: "50%", background: SKY_L, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 14, fontWeight: 700, color: SKY_D }}>
                            {p.name?.charAt(0) || "?"}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 600, color: INK }}>{p.name}</div>
                            {p.mobile && <div style={{ fontSize: 12, color: GRAY_L, marginTop: 1 }}>{p.mobile}</div>}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── 2. 选医生 ── */}
          {(() => {
            const selectedDoc = DOCTORS.find((m: any) => m.name === form.doctor);
            if (selectedDoc) {
              // 已选医生：显示医生信息卡
              const avatarBgColor = selectedDoc.color || SKY_D;
              return (
                <div style={{ ...cardStyle, marginTop: 8 }}>
                  {/* 标题条 */}
                  <div style={{ background: `linear-gradient(90deg,${SKY_D},${SKY})`, padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: "14px 14px 0 0" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#fff", letterSpacing: 1 }}>主治医生</span>
                    <button
                      onClick={() => setForm(prev => ({ ...prev, doctor: "" }))}
                      style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: SKY_D, border: "none", borderRadius: 4, padding: "3px 10px", cursor: "pointer" }}
                    >更换</button>
                  </div>
                  {/* 医生信息 */}
                  <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                    {selectedDoc.avatar
                      ? <img src={selectedDoc.avatar} alt={selectedDoc.name} style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                      : (
                        <div style={{ width: 48, height: 48, borderRadius: "50%", flexShrink: 0, background: avatarBgColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: "#fff" }}>
                          {selectedDoc.name.charAt(0)}
                        </div>
                      )
                    }
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 17, fontWeight: 700, color: INK }}>{selectedDoc.name}</div>
                      <div style={{ fontSize: 12, color: GRAY_L, marginTop: 2 }}>{selectedDoc.roleName || "医生"}{selectedDoc.phone ? 　` · ${selectedDoc.phone}` : ""}</div>
                    </div>
                  </div>
                </div>
              );
            }
            // 未选医生：显示选择行 + 内联下拉
            return (
              <div style={{ ...cardStyle, marginTop: 8, overflow: "visible", position: "relative" }}>
                <button
                  onClick={() => setShowPicker(showPicker === "doctor" ? null : "doctor")}
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px", minHeight: 75, background: "none", border: "none", cursor: "pointer", textAlign: "left", borderBottom: showPicker === "doctor" ? `1px solid ${LINE}` : "none" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: "#FFF7ED", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Users size={19} color="#EA580C" />
                    </div>
                    <div style={{ textAlign: "left" }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: LABEL }}>选医生</div>
                      <div style={{ fontSize: 12, color: GRAY_L, marginTop: 1 }}>点击选择主治医生</div>
                    </div>
                  </div>
                  <ChevronRight size={16} color={GRAY_L} style={{ transform: showPicker === "doctor" ? "rotate(90deg)" : "none", transition: "transform .2s" }} />
                </button>
                {showPicker === "doctor" && (
                  <div style={{ position: "absolute", left: 0, right: 0, top: "100%", zIndex: 200, background: "#fff", borderRadius: "0 0 14px 14px", boxShadow: "0 8px 24px rgba(38,48,60,.13)", overflow: "hidden" }}>
                    {DOCTORS.length === 0 && (
                      <div style={{ padding: "20px 0", textAlign: "center", color: GRAY_L, fontSize: 13 }}>暂无医生数据</div>
                    )}
                    {DOCTORS.map((member: any, idx: number) => (
                      <button
                        key={member.userId}
                        onClick={() => { setForm(prev => ({ ...prev, doctor: member.name })); setShowPicker(null); }}
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "#fff", border: "none", borderBottom: idx < DOCTORS.length - 1 ? `1px solid ${LINE}` : "none", cursor: "pointer", textAlign: "left" }}
                      >
                        {member.avatar
                          ? <img src={member.avatar} alt={member.name} style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                          : (
                            <div style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0, background: member.color || SKY_L, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: member.color ? "#fff" : SKY_D }}>
                              {member.name.charAt(0)}
                            </div>
                          )
                        }
                        <span style={{ fontSize: 15, fontWeight: 600, color: INK, flex: 1 }}>{member.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── 3. 选时间 —— 7天日期条 + 时段格子 ── */}
          {(() => {
            const selDoc = DOCTORS.find((m: any) => m.name === form.doctor);
            // 28天日期数组（今天起，可左右滑动）
            const next28: Date[] = Array.from({ length: 28 }, (_, i) => {
              const d = new Date(today); d.setDate(today.getDate() + i); return d;
            });
            const DOW_CN = ['日', '一', '二', '三', '四', '五', '六'];
            // 当前选中日期
            const selDateStr = form.date || toDateStr(today);
            // 计算某天某医生的可用时段
            function getDaySlots(dStr: string): { start: number; end: number; occupied: boolean }[] {
              if (!selDoc) return [];
              const shift = getEffectiveShift(selDoc.userId, dStr);
              if (!shift) return [];
              const slots: { start: number; end: number; occupied: boolean }[] = [];
              for (const [segStart, segEnd] of shift.segments) {
                for (let t = segStart; t < segEnd; t += 30) {
                  const slotEnd = Math.min(t + 30, segEnd);
                  const occupied = (dayAppointments as any[]).some((a: any) => {
                    if (!a.appointTime) return false;
                    const as_ = timeToMin(a.appointTime);
                    const ae = a.endTime ? timeToMin(a.endTime) : as_ + (a.duration || 30);
                    return as_ < slotEnd && ae > t;
                  });
                  slots.push({ start: t, end: slotEnd, occupied });
                }
              }
              return slots;
            }
            const selDaySlots = getDaySlots(selDateStr);
            const hasTimeSelected = !!(form.date && form.startTime);

            // 已确定时间且轮盘已收起：显示蓝色标题栏 + 摘要行（与主治医生卡片一致）
            if (hasTimeSelected && !timePickerOpen) {
              const durMin = timeToMin(form.endTime) - timeToMin(form.startTime);
              return (
                <div style={{ ...cardStyle, marginTop: 8 }}>
                  <div style={{ background: `linear-gradient(90deg,${SKY_D},${SKY})`, padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: "14px 14px 0 0" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#fff", letterSpacing: 1 }}>预约时段</span>
                    <button
                      onClick={() => setTimePickerOpen(true)}
                      style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: SKY_D, border: "none", borderRadius: 4, padding: "3px 10px", cursor: "pointer" }}
                    >重选</button>
                  </div>
                  <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 10, background: "#F0FDF4", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Clock size={22} color="#16A34A" />
                    </div>
                    <div>
                      <div style={{ fontSize: 17, fontWeight: 700, color: INK }}>{form.startTime} – {form.endTime}</div>
                      <div style={{ fontSize: 12, color: GRAY_L, marginTop: 3 }}>{form.date} &nbsp;·&nbsp; 共 {durMin} 分钟</div>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div style={{ ...cardStyle, marginTop: 8 }}>
                {/* 标题行 */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px", minHeight: 52, borderBottom: `1px solid ${LINE}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: "#F0FDF4", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Clock size={19} color="#16A34A" />
                    </div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: LABEL }}>选时间</div>
                      <div style={{ fontSize: 12, color: GRAY_L, marginTop: 1 }}>{selDoc ? "选择日期和时段" : "请先选医生"}</div>
                    </div>
                  </div>
                </div>

                {/* 28天日期条（scroll-snap 吸附，嘎嗒嘎嗒） */}
                <div style={{ display: "flex", overflowX: "auto", padding: "10px 10px 6px", gap: 6, borderBottom: `1px solid ${LINE}`, scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
                  {next28.map((d) => {
                    const dStr = toDateStr(d);
                    const isToday = dStr === toDateStr(today);
                    const isSel = dStr === selDateStr;
                    const docShift = selDoc ? getEffectiveShift(selDoc.userId, dStr) : null;
                    const hasShift = !!docShift;
                    return (
                      <button
                        key={dStr}
                        onClick={() => {
                          setCalSelDate(d);
                          setForm(prev => ({ ...prev, date: dStr, startTime: "", endTime: "" }));
                          setTimePickerOpen(true);
                        }}
                        style={{
                          flexShrink: 0, width: 46, padding: "6px 0",
                          display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                          background: isSel ? SKY_D : (hasShift ? "#F0FDF4" : "#F5F7FA"),
                          border: isSel ? `2px solid ${SKY_D}` : `1px solid ${hasShift ? "#BBF7D0" : LINE}`,
                          borderRadius: 10, cursor: "pointer",
                          scrollSnapAlign: "center",
                        } as React.CSSProperties}
                      >
                        <span style={{ fontSize: 10, color: isSel ? "#fff" : (isToday ? SKY_D : GRAY_L), fontWeight: isToday ? 700 : 400 }}>
                          {isToday ? "今" : DOW_CN[d.getDay()]}
                        </span>
                        <span style={{ fontSize: 15, fontWeight: 700, color: isSel ? "#fff" : (hasShift ? "#16A34A" : GRAY_L) }}>
                          {d.getDate()}
                        </span>
                        <span style={{ fontSize: 9, color: isSel ? "rgba(255,255,255,.8)" : (hasShift ? "#16A34A" : GRAY_L) }}>
                          {hasShift ? "可约" : (selDoc ? "休" : "–")}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div style={{ padding: "10px 12px" }}>
                  {!selDoc && (
                    <div style={{ textAlign: "center", color: GRAY_L, fontSize: 13, padding: "12px 0" }}>请先选择医生</div>
                  )}
                  {selDoc && selDaySlots.length === 0 && (
                    <div style={{ textAlign: "center", color: GRAY_L, fontSize: 13, padding: "12px 0" }}>{selDoc.name}当日休息，请选其他日期</div>
                  )}
                  {selDoc && selDaySlots.length > 0 && (() => {
                    const shift = getEffectiveShift(selDoc.userId, selDateStr);
                    const workStart = shift ? shift.segments[0][0] : selDaySlots[0].start;
                    const workEnd = shift ? shift.segments[shift.segments.length - 1][1] : selDaySlots[selDaySlots.length - 1].end;

                    // 开始时间选项：5分钟精度
                    const startOptions: { min: number; label: string; occupied: boolean }[] = [];
                    for (let t = workStart; t < workEnd; t += 5) {
                      const occupied = (dayAppointments as any[]).some((a: any) => {
                        if (!a.appointTime) return false;
                        const as_ = timeToMin(a.appointTime);
                        const ae = a.endTime ? timeToMin(a.endTime) : as_ + (a.duration || 30);
                        return as_ <= t && ae > t;
                      });
                      startOptions.push({ min: t, label: hm(t), occupied });
                    }

                    // 当前轮盘选中值
                    const curStartMin = pendingStart ? timeToMin(pendingStart) : (form.startTime ? timeToMin(form.startTime) : workStart);
                    const curPendStart = pendingStart || form.startTime || hm(workStart);
                    const selStartMin = timeToMin(curPendStart);

                    // 结束时间选项：严格大于开始时间，至 workEnd，5分钟精度
                    const endOptions: { min: number; label: string }[] = [];
                    for (let t = curStartMin + 5; t <= workEnd; t += 5) {
                      endOptions.push({ min: t, label: hm(t) });
                    }

                    // 结束时间选中值：若当前 pendingEnd/form.endTime <= 开始时间，自动顺延 +30min
                    const rawEndMin = pendingEnd ? timeToMin(pendingEnd) : (form.endTime ? timeToMin(form.endTime) : curStartMin + 30);
                    const safeEndMin = rawEndMin > curStartMin ? rawEndMin : curStartMin + 30;
                    // 确保不超过 workEnd
                    const clampedEndMin = Math.min(safeEndMin, workEnd);
                    const selEndMin = endOptions.find(o => o.min === clampedEndMin) ? clampedEndMin : (endOptions[0]?.min ?? clampedEndMin);

                    const ITEM_H = 38;

                    // 是否已确定（form 中有有效时间）
                    const isConfirmed = !!(form.startTime && form.endTime && form.date === selDateStr);

                    return (
                      <div>
                        <div style={{ fontSize: 12, color: GRAY_L, marginBottom: 8 }}>
                          工作时间：{hm(workStart)} – {hm(workEnd)}，滚动选择开始和结束时间
                        </div>
                        {/* 双轮盘 */}
                        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                          <WheelPickerMemo
                            label="开始时间"
                            options={startOptions}
                            selectedMin={selStartMin}
                            itemH={ITEM_H}
                            onSelect={handleStartSelect}
                          />
                          {/* 中间分隔符 */}
                          <div style={{ display: "flex", alignItems: "center", paddingTop: ITEM_H * 2.5 + 20, fontSize: 18, color: GRAY_L, fontWeight: 300 }}>–</div>
                          <WheelPickerMemo
                            label="结束时间"
                            options={endOptions}
                            selectedMin={selEndMin}
                            itemH={ITEM_H}
                            onSelect={handleEndSelect}
                          />
                        </div>
                        {/* 确定按钮 */}
                        <button
                          onClick={() => {
                            const s = hm(selStartMin);
                            const e = hm(selEndMin);
                            setForm(prev => ({ ...prev, date: selDateStr, startTime: s, endTime: e }));
                            setPendingStart(s);
                            setPendingEnd(e);
                            setTimePickerOpen(false); // 确定后收起轮盘
                            setStep1Open(null);
                          }}
                          style={{
                            marginTop: 12, width: "100%", padding: "11px 0",
                            background: `linear-gradient(90deg,${SKY_D},${SKY})`,
                            color: "#fff", fontWeight: 700, fontSize: 15,
                            border: "none", borderRadius: 10, cursor: "pointer",
                            boxShadow: `0 3px 10px rgba(30,136,214,.25)`,
                          }}
                        >
                          确定时间：{hm(selStartMin)} – {hm(selEndMin)}
                          <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 500, opacity: 0.85 }}>共{selEndMin - selStartMin}分钟</span>
                        </button>
                        {isConfirmed && (
                          <div style={{ marginTop: 6, textAlign: "center", fontSize: 12, color: "#16A34A" }}>
                            ✓ 已选：{form.startTime} – {form.endTime}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })()}

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
            {/* 咨询师 */}
            <SelectRow label="咨询师" value={form.consultant} placeholder="请选择咨询师" onClick={() => setShowPicker("consultant")} />
            {/* 助理 */}
            <SelectRow label="助理" value={form.assistant} placeholder="请选择助理" onClick={() => setShowPicker("assistant")} />
            {/* 就诊类型 */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px", minHeight: 46, borderBottom: `1px solid ${LINE}` }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: LABEL }}>就诊类型<span style={{ color: REQ, marginLeft: 2 }}>*</span></span>
              <div style={{ display: "flex", gap: 8 }}>
                {["初诊", "复诊"].map(t => (
                  <button key={t} onClick={() => setForm(prev => ({ ...prev, visitType: t }))}
                    style={{ padding: "5px 16px", borderRadius: 20, fontSize: 14, fontWeight: form.visitType === t ? 700 : 400, border: `1.5px solid ${form.visitType === t ? SKY_D : BORDER}`, background: form.visitType === t ? SKY_L : "#fff", color: form.visitType === t ? SKY_D : GRAY, cursor: "pointer" }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            {/* 项目（多选） */}
            <div style={{ padding: "10px 14px", borderBottom: `1px solid ${LINE}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: form.selectedProjects.length > 0 ? 8 : 0 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: LABEL }}>项目<span style={{ color: REQ, marginLeft: 2 }}>*</span></span>
                <button onClick={() => setShowProjectPicker(true)} style={{ fontSize: 13, color: SKY_D, background: "none", border: `1px solid ${SKY_D}`, borderRadius: 14, padding: "3px 12px", cursor: "pointer" }}>添加项目</button>
              </div>
              {form.selectedProjects.length === 0 && (
                <span style={{ fontSize: 14, color: GRAY_L }}>请添加项目</span>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {form.selectedProjects.map((p, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", background: SKY_L, borderRadius: 16, fontSize: 13, color: SKY_D, fontWeight: 600 }}>
                    <span>{p}</span>
                    <button onClick={() => setForm(prev => ({ ...prev, selectedProjects: prev.selectedProjects.filter((_, j) => j !== i) }))} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1, color: SKY_D, fontSize: 14 }}>×</button>
                  </div>
                ))}
              </div>
            </div>
            {/* 诊室 */}
            <SelectRow label="诊室" value={form.room} placeholder="请选择诊室" onClick={() => setShowPicker("room")} />
            {/* 科室 */}
            <SelectRow label="科室" value={form.department} placeholder="请选择科室" onClick={() => setShowPicker("department")} />
            {/* 预约来源 */}
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

      {/* 项目多选弹窗 */}
      <ChargeProductPicker
        open={showProjectPicker}
        onClose={() => setShowProjectPicker(false)}
        onPick={(item) => {
          setForm(prev => ({
            ...prev,
            selectedProjects: prev.selectedProjects.includes(item.name)
              ? prev.selectedProjects
              : [...prev.selectedProjects, item.name],
          }));
          // 不关闭，允许继续添加
        }}
      />

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
