/**
 * 牙伴齿科管理 - 预约日程页
 * 路由：/yaban/schedule
 * 部署链路测试 deploy-probe-1
 * UI：1:1 还原 yaban-schedule-proto/index.html 原型（顾客预约 Tab）
 * 数据：真实 API（yabanAppointment.listByDate / monthStats / listMembers）
 * 无模拟数据，无 emoji
 */
import { useState, useRef, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useYabanClinic } from "./useYabanClinic";
import YabanClinicHeader from "./YabanClinicHeader";
import YabanHeatCalendar from "./YabanHeatCalendar";
import YabanGanttBar, { YabanGanttTimeline } from "./YabanGanttBar";

// ── 共享样式常量（与 A316 联动，修改 yabanSharedStyles.ts 即可同步） ──
import {
  HEAT, heatColor, heatTextColor,
  STATUS, ROLE_COLOR_MAP, getRoleBarColor,
  SKY, SKY_D, SKY_L, INK, GRAY, GRAY_L, LINE, BG,
  WK, toDateStr, isSameDay, hm, timeToMin,
} from "./yabanSharedStyles";

// 预约时间格式化为区间：“日期 开始–结束（时长）”。
// 结束时间优先用 endTime；缺失时由 appointTime + duration(默认30分钟) 推算。
function fmtApptRange(a: any): string {
  const date = a.appointDate || "";
  const start = a.appointTime || "";
  if (!start) return date;
  const dur = Number(a.duration) > 0 ? Number(a.duration) : 30;
  let end = a.endTime as string | undefined;
  if (!end) {
    try { end = hm(timeToMin(start) + dur); } catch { end = ""; }
  }
  const durMin = end ? (timeToMin(end) - timeToMin(start)) : dur;
  const durTxt = durMin > 0 ? ` · ${durMin}分钟` : "";
  return `${date} ${start}${end ? "–" + end : ""}${durTxt}`;
}

export default function YabanSchedule() {
  const [, setLocation] = useLocation();
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  // 优先读 URL ?date= 参数，其次读排班页回传的选中日期（两页日期保持一致）
  const initSelDate = useMemo(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlDate = urlParams.get("date");
      if (urlDate) { const [y, m, dd] = urlDate.split("-").map(Number); if (y && m && dd) { const d = new Date(y, m - 1, dd); d.setHours(0, 0, 0, 0); return d; } }
      const s = sessionStorage.getItem("yaban_sched_date");
      if (s) { const [y, m, dd] = s.split("-").map(Number); if (y && m && dd) { const d = new Date(y, m - 1, dd); d.setHours(0, 0, 0, 0); return d; } }
    } catch {}
    return today;
  }, [today]);
  const [selDate, setSelDate] = useState(initSelDate);
  const [calMode, setCalMode] = useState<"week"|"month">("week");
  const [monthCursor, setMonthCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [apptView, setApptView] = useState<"doc"|"time">("doc");
  const [selectedDocIdx, setSelectedDocIdx] = useState<number|null>(null);
  const [detailModal, setDetailModal] = useState<{ open: boolean; apptId?: number }>({ open: false });
  // 单日覆盖编辑
  const [overrideModal, setOverrideModal] = useState<{ open: boolean; userId: number; name: string; color?: string } | null>(null);
  const [ovAmStart, setOvAmStart] = useState("09:00");
  const [ovAmEnd, setOvAmEnd] = useState("12:00");
  const [ovPmStart, setOvPmStart] = useState("13:00");
  const [ovPmEnd, setOvPmEnd] = useState("18:00");
  const [ovIsRest, setOvIsRest] = useState(false);
  const dateStr = toDateStr(selDate);

  // 新建预约统一跳转整页 P323（/yaban/schedule/create），支持带医生+时段预填
  const gotoCreate = (opts?: { docName?: string; start?: number; end?: number }) => {
    const params = new URLSearchParams();
    params.set("date", dateStr);
    if (opts?.docName) params.set("doctor", opts.docName);
    if (opts?.start != null) params.set("start", hm(opts.start));
    if (opts?.end != null) params.set("end", hm(opts.end));
    setLocation(`/yaban/schedule/create?${params.toString()}`);
  };

  // 顶栏高度测量：顶栏 fixed 冻结后，给下方主体留出等高留白避免遮挡（高度随 Tab 行/医院名变化）。
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

  const { currentTenantId, current } = useYabanClinic();

  const { data: appointments = [], refetch: refetchAppts } = trpc.yabanAppointment.listByDate.useQuery({ date: dateStr, tenantId: currentTenantId ?? undefined });
  const { data: monthStats = {} } = trpc.yabanAppointment.monthStats.useQuery({
    year: calMode === "month" ? monthCursor.getFullYear() : selDate.getFullYear(),
    month: calMode === "month" ? monthCursor.getMonth() + 1 : selDate.getMonth() + 1,
    tenantId: currentTenantId ?? undefined,
  });
  const { data: members = [] } = trpc.yabanAppointment.listMembers.useQuery({ tenantId: currentTenantId ?? undefined }, { staleTime: 0 });

  // 排班数据：拉取 selDate 所在周的「模板 + 单日覆盖」，用于联动顾客预约页的医生可约时段。
  // 注意：override（单日调班/请假）优先于周期模板，shiftType=rest 当天不可约。
  const weekStart = useMemo(() => {
    const d = new Date(selDate);
    const dow = d.getDay();           // 0=周日
    const diff = dow === 0 ? -6 : 1 - dow; // 回退到本周周一
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return toDateStr(d);
  }, [selDate]);
  const { data: weekSched, refetch: refetchWeekSched } = trpc.yabanShift.weekSchedule.useQuery(
    { weekStart, tenantId: currentTenantId ?? undefined },
    { enabled: !!weekStart }
  );
  const shiftTemplates = weekSched?.templates ?? [];
  const shiftOverrides = weekSched?.overrides ?? [];
  const shiftDaySegs = weekSched?.daySegs ?? [];  // 每员工每天独立时段（新周模板）

  // 计算某员工在指定日期的「有效班次」：override 优先，回退周期模板。
  // 返回 null 表示当天不可约（请假/休息，或模板未排该工作日，或全无排班）。
  // 一个有效班次：整体范围 workStart~workEnd，叠加「在岗分段 segments」。
  // 若含午休（break）且落在区间内，则拆为两段，午休时段不可约。
  type EffShift = { workStart: number; workEnd: number; segments: [number, number][] } | null;
  const buildShift = (ws: number, we: number, bs?: number | null, be?: number | null): EffShift => {
    if (we <= ws) return null;
    let segments: [number, number][] = [[ws, we]];
    // 午休落在在岗区间内，才拆分（容错：仅当区间有效时）
    if (bs != null && be != null && be > bs && bs > ws && be < we) {
      segments = [[ws, bs], [be, we]];
    }
    return { workStart: ws, workEnd: we, segments };
  };
  const getEffectiveShift = useMemo(() => {
    const toMin = (t?: string | null) => (t ? timeToMin(t) : null);
    return (userId: number, dStr: string): EffShift => {
      // 1) 单日覆盖优先
      const ov = userId != null
        ? shiftOverrides.find((o: any) => o.staffUserId === userId && o.overrideDate === dStr)
        : undefined;
      if (ov) {
        if (ov.shiftType === "rest" || ov.shiftType === "leave") return null;
        if (ov.workStart && ov.workEnd) return buildShift(timeToMin(ov.workStart), timeToMin(ov.workEnd), toMin(ov.breakStart), toMin(ov.breakEnd));
      }
      // 2) 优先用新的 daySegs（每天独立时段）
      // 注意：new Date("YYYY-MM-DD") 会解析为 UTC，UTC+8 下会少一天，必须用本地时间解析
      const [_y, _m, _d] = dStr.split("-").map(Number);
      const dow = (new Date(_y, _m - 1, _d).getDay() + 6) % 7; // 0=周一...6=周日
      const dsEntry = shiftDaySegs.find((s: any) => s.staffUserId === userId);
      if (dsEntry) {
        const daySeg = dsEntry.dows[dow] ?? dsEntry.dows[String(dow)]; // JSON key 可能是字符串
        if (!daySeg) return null;          // 该天无记录，不排班
        if (daySeg.isRest) return null;    // 该天是休息日
        return buildShift(timeToMin(daySeg.workStart), timeToMin(daySeg.workEnd), toMin(daySeg.breakStart), toMin(daySeg.breakEnd));
      }
      // 3) 回退旧的 yaban_shift_template（尚未迁移到新接口的员工）
      const tpl = shiftTemplates.find((t: any) => t.staffUserId === userId);
      if (tpl) {
        const days: number[] = tpl.workDays || [];
        if (days.length > 0 && !days.includes(dow)) return null;
        if (tpl.workStart && tpl.workEnd) return buildShift(timeToMin(tpl.workStart), timeToMin(tpl.workEnd), toMin(tpl.breakStart), toMin(tpl.breakEnd));
      }
      return null;
    };
  }, [shiftTemplates, shiftOverrides, shiftDaySegs]);

  // 按成员 userId 分组（附带当天有效班次 shift）
  // 角色色彩统一使用共享模块 getRoleColor，与员工排班页完全一致
  const docMap = new Map<number, { userId: number; name: string; roleKey: string; color?: string; appts: typeof appointments; shift: EffShift }>();
  (members as any[]).forEach((m: any) => {
    if (!docMap.has(m.userId)) docMap.set(m.userId, { userId: m.userId, name: m.name, roleKey: m.roleKey || "doctor", color: m.color, appts: [], shift: null });
  });
  appointments.forEach(a => {
    // 预约记录里只有 doctor 名字，尝试按名字找到对应 userId
    const matchedMember = (members as any[]).find((m: any) => m.name === a.doctor);
    const uid = matchedMember?.userId ?? -a.doctor.charCodeAt(0);
    if (!docMap.has(uid)) docMap.set(uid, { userId: uid, name: a.doctor, roleKey: matchedMember?.roleKey || "doctor", appts: [], shift: null });
    docMap.get(uid)!.appts.push(a);
  });
  docMap.forEach((v) => { v.shift = getEffectiveShift(v.userId, dateStr); });
  const docList = Array.from(docMap.values());

  // 时间范围（全院最早~最晚，默认 09:00~18:00）
  const OPEN_START = 9 * 60, OPEN_END = 18 * 60;
  function trkStart() {
    let mn = OPEN_START;
    appointments.forEach(a => { if (a.appointTime) mn = Math.min(mn, timeToMin(a.appointTime)); });
    return mn;
  }
  function trkEnd() {
    let mx = OPEN_END;
    appointments.forEach(a => { if (a.endTime) mx = Math.max(mx, timeToMin(a.endTime)); });
    return mx;
  }
  function pctM(min: number) {
    const a = trkStart(), b = trkEnd();
    if (b <= a) return 0;
    return Math.max(0, Math.min(100, ((min - a) / (b - a)) * 100));
  }

  // 忙闲速览
  function loadLevel(appts: typeof appointments) {
    const total = appts.reduce((s, a) => s + (a.duration || 30), 0);
    const r = Math.min(1, total / (OPEN_END - OPEN_START));
    let col = r === 0 ? "#9ec9e8" : r < 0.5 ? "#16A34A" : r < 0.85 ? "#E8973A" : "#E2554B";
    return { r, col, t: r === 0 ? "空" : r >= 1 ? "满" : Math.round(r * 100) + "%" };
  }
  function ringBg(lv: { r: number; col: string }) {
    const deg = Math.round(lv.r * 360);
    return `conic-gradient(${lv.col} ${deg}deg, #ECEFF3 ${deg}deg 360deg)`;
  }

  // 日历
  function getWeekDates(): Date[] {
    const day = today.getDay();
    const mon = new Date(today);
    mon.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d; });
  }
  function getMonthDates(): (Date | null)[] {
    const y = monthCursor.getFullYear(), m = monthCursor.getMonth();
    const first = new Date(y, m, 1), last = new Date(y, m + 1, 0);
    const lead = first.getDay();
    const cells: (Date | null)[] = Array(lead).fill(null);
    for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(y, m, d));
    return cells;
  }
  const weekDates = getWeekDates();

  // 热力图负荷：真实占用率，与医生进度环口径完全统一。
  // 占用率 = 当天全院总预约时长 ÷ 当天全院可排总时长（医生数 × 营业时长）。
  // 医生数取「当天有排班的医生数」与「门店在册医生数」的较大值，避免单医生当天就显示满院红。
  const OPEN_MIN = OPEN_END - OPEN_START; // 540 分钟
  const memberCount = members.length;
  function cellLoad(d: Date): number {
    const stat = (monthStats as Record<string, { cnt: number; minutes: number; doctors: number }>)[toDateStr(d)];
    if (!stat || stat.minutes <= 0) return 0;
    // 分母：当天可排总时长。医生数以在册医生数为准（与下方进度环按全员口径一致）；
    // 若在册数缺失则退回当天实际参与医生数，至少为 1。
    const docs = Math.max(memberCount || 0, stat.doctors || 0, 1);
    const capacity = docs * OPEN_MIN;
    const raw = capacity > 0 ? stat.minutes / capacity : 0;
    // 颜色敏感度放大：用 gamma<1 的幂函数抬升中低占用率的视觉强度，
    // 使 ~50% 占用率即呈现偏暖色；仍保持单调递增（越满越红）。
    const GAMMA = 0.5;
    const r = Math.pow(Math.max(0, Math.min(1, raw)), GAMMA);
    return Math.max(0, Math.min(1, r));
  }

  // 单日覆盖保存
  const saveOverrideMut = trpc.yabanShift.saveOverride.useMutation({
    onSuccess: () => { refetchWeekSched(); setOverrideModal(null); toast.success("当日排班已更新"); },
    onError: (e) => toast.error(e.message),
  });

  function openOverride(userId: number, name: string, color?: string) {
    // 预填当前有效班次时间
    const eff = getEffectiveShift(userId, dateStr);
    if (eff) {
      const segs = eff.segments;
      setOvAmStart(hm(segs[0]?.[0] ?? 9 * 60));
      setOvAmEnd(hm(segs[0]?.[1] ?? 12 * 60));
      setOvPmStart(hm(segs[1]?.[0] ?? 13 * 60));
      setOvPmEnd(hm(segs[1]?.[1] ?? 18 * 60));
      setOvIsRest(false);
    } else {
      setOvAmStart("09:00"); setOvAmEnd("12:00");
      setOvPmStart("13:00"); setOvPmEnd("18:00");
      setOvIsRest(true);
    }
    setOverrideModal({ open: true, userId, name, color });
  }

  // 详情预约
  const detailAppt = appointments.find(a => a.id === detailModal.apptId);
  const deleteApptMut = trpc.yabanAppointment.delete.useMutation({
    onSuccess: () => { refetchAppts(); setDetailModal({ open: false }); toast.success("预约已删除"); },
    onError: (e) => toast.error(e.message),
  });

  // ── 渲染 ──
  const calDates = calMode === "week" ? weekDates : getMonthDates();
  const headDays = calMode === "week" ? weekDates.map(d => WK[d.getDay()]) : ["日","一","二","三","四","五","六"];

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: "-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif", color: INK }}>

      {/* 顶栏（固定冻结在屏幕顶部，不随页面滚动） */}
      <div ref={headerRef} style={{ background: `linear-gradient(90deg,${SKY},#3BA9E0)`, color: "#fff", padding: "14px 16px 12px", position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ flex: 1, display: "flex", justifyContent: "flex-start" }}>
            <div style={{ fontSize: 22, width: 28, cursor: "pointer" }} onClick={() => setLocation("/yaban")}>‹</div>
          </div>
          <div style={{ display: "flex", gap: 6, background: "rgba(255,255,255,.18)", borderRadius: 6, padding: 4, flexShrink: 0 }}>
            <div style={{ padding: "7px 14px", borderRadius: 4, fontSize: 14, fontWeight: 600, background: "#fff", color: SKY_D, boxShadow: "0 1px 3px rgba(0,0,0,.1)", whiteSpace: "nowrap" }}>顾客预约</div>
            <div onClick={() => { try { sessionStorage.setItem("yaban_shift_date", toDateStr(selDate)); } catch {} setLocation("/yaban/clinic-shift"); }} style={{ padding: "7px 14px", borderRadius: 4, fontSize: 14, fontWeight: 600, color: "#EBF5FB", whiteSpace: "nowrap", cursor: "pointer" }}>员工排班</div>
          </div>
          <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
            <button onClick={() => gotoCreate()} aria-label="新建预约" style={{ width: 32, height: 32, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.12)", border: "none", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", cursor: "pointer" }}>
              <img src="/icon-add.webp" alt="" style={{ width: 32, height: 32, objectFit: "cover", borderRadius: "50%" }} />
            </button>
          </div>
        </div>
        <YabanClinicHeader
          asBar
          compact
          rightSlot={
            <span style={{ whiteSpace: "nowrap" }}>
              {selDate.getMonth() + 1}月{selDate.getDate()}日 · {appointments.length} 个预约
            </span>
          }
        />
      </div>
      {/* 顶栏占位：与 fixed 顶栏等高，防止主体被遮挡 */}
      <div style={{ height: headerH }} aria-hidden />

      {/* 周历 / 月历 — 使用共享组件 YabanHeatCalendar（与 A316 联动） */}
      <YabanHeatCalendar
        selDate={selDate}
        onSelectDate={(d) => setSelDate(d)}
        getCellLoad={cellLoad}
        monthCursor={monthCursor}
        onMonthChange={setMonthCursor}
        disablePast={false}
        showToggle={true}
        calMode={calMode}
        onToggleMode={() => {
          if (calMode === "week") { setCalMode("month"); setMonthCursor(new Date(selDate.getFullYear(), selDate.getMonth(), 1)); }
          else setCalMode("week");
        }}
        weekDates={calMode === "week" ? weekDates : undefined}
      />

      {/* 忙闲速览 */}
      <div style={{ background: "#fff", padding: "6px 14px 10px", borderBottom: `8px solid ${BG}` }}>
        <div style={{ display: "flex", gap: 14, overflowX: "auto", padding: "10px 4px" }}>
          {/* 全员 */}
          <div onClick={() => setSelectedDocIdx(null)} style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 46, cursor: "pointer", opacity: selectedDocIdx !== null ? 0.38 : 1, transform: selectedDocIdx !== null ? "scale(.88)" : "none", transition: ".22s" }}>
            <div style={{ width: 46, height: 46, borderRadius: "50%", padding: 3, background: selectedDocIdx === null ? SKY_D : "#EBF5FB" }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: selectedDocIdx === null ? "#fff" : "#7c93a8", background: selectedDocIdx === null ? SKY_D : "#EBF5FB" }}>全部</div>
            </div>
            <div style={{ fontSize: 11, color: selectedDocIdx === null ? SKY_D : "#647386", marginTop: 5, fontWeight: selectedDocIdx === null ? 600 : 400 }}>全员</div>
            <div style={{ fontSize: 9, color: "#9AA7B5", marginTop: 1 }}>{docList.length}人</div>
          </div>
          {docList.map((doc, idx) => {
            const lv = loadLevel(doc.appts);
            const sel = selectedDocIdx === idx;
            const dimmed = selectedDocIdx !== null && !sel;
            return (
              <div key={doc.name} onClick={() => setSelectedDocIdx(sel ? null : idx)} style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 46, cursor: "pointer", opacity: dimmed ? 0.38 : 1, transform: sel ? "scale(1.05)" : dimmed ? "scale(.88)" : "none", filter: dimmed ? "grayscale(.4)" : "none", transition: ".22s" }}>
                <div style={{ width: 46, height: 46, borderRadius: "50%", padding: 3, background: ringBg(lv) }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 600, color: "#fff", background: (doc.color && doc.color !== "#1E88D6") ? doc.color : (doc.appts.length > 0 ? "#5aa9dd" : "#DBE1E8") }}>{doc.name.charAt(0)}</div>
                </div>
                <div style={{ fontSize: 11, color: sel ? SKY_D : "#647386", marginTop: 5, fontWeight: sel ? 700 : 400 }}>{doc.name}</div>
                <div style={{ fontSize: 9, color: lv.col, marginTop: 1 }}>{lv.t}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 视图切换 */}
      <div style={{ background: "#fff", padding: "8px 14px", display: "flex", gap: 8, alignItems: "center", borderBottom: `1px solid ${LINE}` }}>
        {(["doc","time"] as const).map(v => (
          <div key={v} onClick={() => setApptView(v)} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 10, fontWeight: 500, cursor: "pointer", background: apptView === v ? SKY : "#F6F8FA", color: apptView === v ? "#fff" : "#647386" }}>
            {v === "doc" ? "按医生" : "按时段"}
          </div>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 11, color: GRAY }}>{appointments.length} 个预约</span>
      </div>

      {/* 内容区 */}
      <div style={{ paddingBottom: 90 }}>
        {apptView === "doc" ? (
          selectedDocIdx !== null && docList[selectedDocIdx]
            ? <SoloView doc={docList[selectedDocIdx]} onBack={() => setSelectedDocIdx(null)} onApptClick={id => setDetailModal({ open: true, apptId: id })} onNewAppt={(docName, start, end) => gotoCreate({ docName, start, end })} trkStart={trkStart} trkEnd={trkEnd} pctM={pctM} OPEN_START={OPEN_START} OPEN_END={OPEN_END} />
            : <DocRows docList={docList} onDocClick={idx => setSelectedDocIdx(idx)} onApptClick={id => setDetailModal({ open: true, apptId: id })} onNewAppt={(docName, start, end) => gotoCreate({ docName, start, end })} trkStart={trkStart} trkEnd={trkEnd} pctM={pctM} onEditShift={(userId, name, color) => openOverride(userId, name, color)} />
        ) : (
          <TimeView docList={selectedDocIdx !== null && docList[selectedDocIdx] ? [docList[selectedDocIdx]] : docList} onApptClick={id => setDetailModal({ open: true, apptId: id })} onNewAppt={(docName, start, end) => gotoCreate({ docName, start, end })} trkStart={trkStart} trkEnd={trkEnd} />
        )}
      </div>

      {/* 单日覆盖编辑弹层 */}
      {overrideModal?.open && (
        <BottomSheet onClose={() => setOverrideModal(null)}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: overrideModal.color || "#1E88D6", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700 }}>{overrideModal.name.charAt(0)}</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#26303C" }}>{overrideModal.name}</div>
                <div style={{ fontSize: 11, color: "#9AA7B5", marginTop: 1 }}>{dateStr} 当日排班</div>
              </div>
            </div>
            <div onClick={() => { setOvIsRest(!ovIsRest); }} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 16, border: `1.5px solid ${ovIsRest ? "#9AA7B5" : "#1E88D6"}`, color: ovIsRest ? "#9AA7B5" : "#1E88D6", cursor: "pointer", fontWeight: 600 }}>
              {ovIsRest ? "设为上班" : "休息日"}
            </div>
          </div>
          {!ovIsRest ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <OvTimeBox val={ovAmStart} onChange={setOvAmStart} min="06:00" max="12:00" />
                <span style={{ color: "#DBE1E8", fontSize: 18, flexShrink: 0 }}>—</span>
                <OvTimeBox val={ovAmEnd} onChange={setOvAmEnd} min="06:00" max="13:00" />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                <OvTimeBox val={ovPmStart} onChange={setOvPmStart} min={ovAmEnd} max="18:00" />
                <span style={{ color: "#DBE1E8", fontSize: 18, flexShrink: 0 }}>—</span>
                <OvTimeBox val={ovPmEnd} onChange={setOvPmEnd} min={ovPmStart} max="18:00" />
              </div>
            </>
          ) : (
            <div style={{ padding: "18px 0", textAlign: "center", color: "#9AA7B5", fontSize: 13, background: "#F6F8FA", borderRadius: 8, marginBottom: 18 }}>休息日 · 当日不可预约</div>
          )}
          <div onClick={() => {
            saveOverrideMut.mutate({
              staffUserId: overrideModal.userId,
              overrideDate: dateStr,
              shiftType: ovIsRest ? "rest" : "custom",
              workStart: ovIsRest ? undefined : ovAmStart,
              workEnd: ovIsRest ? undefined : ovPmEnd,
              breakStart: ovIsRest ? undefined : ovAmEnd,
              breakEnd: ovIsRest ? undefined : ovPmStart,
              tenantId: currentTenantId ?? undefined,
            });
          }} style={{ width: "100%", background: "#1E88D6", color: "#fff", padding: 13, borderRadius: 6, fontSize: 15, fontWeight: 600, textAlign: "center", cursor: "pointer" }}>
            保存当日排班
          </div>
        </BottomSheet>
      )}

      {/* 预约详情弹窗 */}
      {detailModal.open && detailAppt && (
        <BottomSheet onClose={() => setDetailModal({ open: false })}>
          <h3 style={{ fontSize: 17, marginBottom: 4 }}>{detailAppt.patientName}</h3>
          <div style={{ fontSize: 12, color: GRAY, marginBottom: 6 }}>所属：{current?.name?.trim() || current?.shortName?.trim() || "门店预约"}</div>
          {[
            { k: "就诊医生", v: detailAppt.doctor },
            { k: "时间", v: fmtApptRange(detailAppt) },
            { k: "诊疗项目", v: detailAppt.project },
            { k: "状态", v: null },
            { k: "备注", v: detailAppt.remark || "无" },
          ].map(({ k, v }, i, arr) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "11px 0", borderBottom: i < arr.length - 1 ? `1px solid ${LINE}` : "none", fontSize: 14 }}>
              <span style={{ color: GRAY }}>{k}</span>
              {k === "状态"
                ? <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 5, color: (STATUS[detailAppt.status] || STATUS.booked).color, background: (STATUS[detailAppt.status] || STATUS.booked).bg }}>{(STATUS[detailAppt.status] || STATUS.booked).label}</span>
                : <span style={{ color: "#26303C", fontWeight: 500 }}>{v as string}</span>
              }
            </div>
          ))}
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <div onClick={() => deleteApptMut.mutate({ id: detailAppt.id, tenantId: currentTenantId ?? undefined })} style={{ flex: "0 0 auto", padding: "13px 20px", borderRadius: 6, fontSize: 15, fontWeight: 600, cursor: "pointer", background: "#FDECEC", color: "#D64545", textAlign: "center" }}>删除</div>
            <div onClick={() => setDetailModal({ open: false })} style={{ flex: 1, padding: 13, borderRadius: 6, fontSize: 15, fontWeight: 600, cursor: "pointer", background: "#F6F8FA", color: "#5b6675", textAlign: "center" }}>关闭</div>
            <div onClick={() => { const id = detailAppt.id; setDetailModal({ open: false }); setLocation(`/yaban/schedule/create?id=${id}`); }} style={{ flex: 1, padding: 13, borderRadius: 6, fontSize: 15, fontWeight: 600, cursor: "pointer", background: SKY, color: "#fff", textAlign: "center" }}>编辑预约</div>
          </div>
        </BottomSheet>
      )}

    </div>
  );
}

// ── 底部弹层容器 ──
function BottomSheet({ children, onClose, fullscreen }: { children: React.ReactNode; onClose: () => void; fullscreen?: boolean }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }}>
      <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", width: "100%", maxWidth: 420, borderRadius: "18px 18px 0 0", padding: "18px 18px 30px", animation: "slideUp .25s", maxHeight: fullscreen ? "90vh" : "auto", overflowY: fullscreen ? "auto" : "visible" }}>
        {children}
      </div>
    </div>
  );
}

// ── 按医生进度条视图 ──
type EffShift = { workStart: number; workEnd: number; segments: [number, number][] } | null;
function DocRows({ docList, onDocClick, onApptClick, onNewAppt, trkStart, trkEnd, pctM, onEditShift }: {
  docList: { name: string; roleKey?: string; appts: any[]; shift?: EffShift; userId?: number; color?: string }[];
  onDocClick: (idx: number) => void;
  onApptClick: (id: number) => void;
  onNewAppt: (docName: string, start: number, end: number) => void;
  trkStart: () => number; trkEnd: () => number; pctM: (m: number) => number;
  onEditShift?: (userId: number, name: string, color?: string) => void;
}) {
  const a = trkStart(), b = trkEnd();
  return (
    <div>
      <div style={{ background: "#fff", padding: "12px 14px 6px", borderBottom: `1px solid ${LINE}` }}>
        <YabanGanttTimeline trackStart={a} trackEnd={b} paddingLeft={66} />
      </div>
      {docList.map((doc, idx) => (
        <div key={doc.name} style={{ background: "#fff", padding: "11px 14px", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${LINE}` }}>
          {/* 左侧头像/姓名：点击进入该医生放大日程；长按弹出当日排班编辑 */}
          <div
            onClick={() => onDocClick(idx)}
            onContextMenu={e => { e.preventDefault(); if (onEditShift && doc.userId != null) onEditShift(doc.userId, doc.name, doc.color); }}
            onTouchStart={e => {
              const t = setTimeout(() => { if (onEditShift && doc.userId != null) onEditShift(doc.userId, doc.name, doc.color); }, 600);
              const cancel = () => clearTimeout(t);
              e.currentTarget.addEventListener("touchend", cancel, { once: true });
              e.currentTarget.addEventListener("touchmove", cancel, { once: true });
            }}
            style={{ minWidth: 56, maxWidth: 72, flexShrink: 0, textAlign: "center", cursor: "pointer", overflow: "hidden" }}>
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: (doc.color && doc.color !== "#1E88D6") ? doc.color : SKY_L, color: (doc.color && doc.color !== "#1E88D6") ? "#fff" : SKY_D, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, margin: "0 auto 3px" }}>{doc.name.charAt(0)}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#26303C" }}>{doc.name}</div>
            <div style={{ fontSize: 9, color: GRAY, marginTop: 1 }}>{doc.appts.length > 0 ? `${doc.appts.length}个预约` : "暂无"}</div>
          </div>
          <div style={{ flex: 1 }}>
            {/* 甘特条—共享组件 YabanGanttBar（与 A316 联动） */}
            <YabanGanttBar
              shift={doc.shift ?? null}
              roleKey={doc.roleKey}
              customColor={doc.color && doc.color !== "#1E88D6" ? doc.color : undefined}
              appointments={doc.appts}
              trackStart={a}
              trackEnd={b}
              onApptClick={(id) => onApptClick(id)}
              onBarClick={doc.shift ? (ev) => {
                const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
                const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
                let mins = a + ratio * (b - a);
                mins = Math.round(mins / 30) * 30;
                const segs2 = doc.shift!.segments;
                const inSeg = segs2.find(([s0, e0]) => mins >= s0 && mins < e0);
                let seg = inSeg;
                if (!seg) {
                  seg = segs2.reduce((best, cur) => {
                    const d = mins < cur[0] ? cur[0] - mins : mins - cur[1];
                    const bd = mins < best[0] ? best[0] - mins : mins - best[1];
                    return d < bd ? cur : best;
                  }, segs2[0]);
                }
                if (!seg) return;
                const [segStart, segEnd] = seg;
                const start = Math.max(segStart, Math.min(mins, segEnd - 30));
                const end = Math.min(start + 60, segEnd);
                onNewAppt(doc.name, start, end);
              } : undefined}
            />
            {/* 进度条下方：工作时段文字标注 */}
            {doc.shift && doc.shift.segments.length > 0 && (
              <div style={{ position: "relative", marginTop: 4, height: 14 }}>
                {doc.shift.segments.map(([s0, e0], si) => {
                  const span2 = Math.max(1, b - a);
                  const l = Math.max(0, Math.min(100, (s0 - a) / span2 * 100));
                  const w = Math.max(0, Math.min(100, (e0 - a) / span2 * 100)) - l;
                  return (
                    <span key={si} style={{ position: "absolute", left: `${l}%`, width: `${w}%`, fontSize: 10, color: GRAY, textAlign: "center", whiteSpace: "nowrap", overflow: "visible" }}>
                      {hm(s0)}–{hm(e0)}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ))}
      {docList.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: GRAY_L, fontSize: 13 }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={GRAY_L} strokeWidth="1.5" style={{ margin: "0 auto 8px", display: "block" }}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          当日暂无预约
        </div>
      )}
    </div>
  );
}

// ── 单医生放大日程 ──
function SoloView({ doc, onBack, onApptClick, onNewAppt, trkStart, trkEnd, pctM, OPEN_START, OPEN_END }: {
  doc: { name: string; roleKey?: string; appts: any[]; shift?: EffShift };
  onBack: () => void;
  onApptClick: (id: number) => void;
  onNewAppt: (docName: string, start: number, end: number) => void;
  trkStart: () => number; trkEnd: () => number; pctM: (m: number) => number;
  OPEN_START: number; OPEN_END: number;
}) {
  const sorted = [...doc.appts].sort((a, b) => {
    const at = a.appointTime ? timeToMin(a.appointTime) : 0;
    const bt = b.appointTime ? timeToMin(b.appointTime) : 0;
    return at - bt;
  });
  // 放大轴范围：优先用该医生当天实际班次；休息时回退营业时间仅作占位。
  const dS = doc.shift ? doc.shift.workStart : OPEN_START, dE = doc.shift ? doc.shift.workEnd : OPEN_END;
  const span = Math.max(1, dE - dS);
  const sp = (m: number) => Math.max(0, Math.min(100, ((m - dS) / span) * 100));

  return (
    <div>
      <div style={{ background: "#fff" }}>
        <div style={{ padding: "14px 14px 4px", display: "flex", alignItems: "center", gap: 10 }}>
          <div onClick={onBack} style={{ fontSize: 20, color: GRAY, cursor: "pointer", marginRight: 4 }}>‹</div>
          <div style={{ width: 42, height: 42, borderRadius: "50%", background: (doc.color && doc.color !== "#1E88D6") ? doc.color : SKY_L, color: (doc.color && doc.color !== "#1E88D6") ? "#fff" : SKY_D, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 600, flexShrink: 0 }}>{doc.name.charAt(0)}</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#26303C" }}>{doc.name}</div>
            <div style={{ fontSize: 12, color: GRAY, marginTop: 2 }}>{doc.shift ? `在岗 ${hm(dS)}–${hm(dE)} · 已约 ${doc.appts.length} 个` : `今日休息 · 不可约`}</div>
          </div>
        </div>
        <div style={{ padding: "6px 14px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: GRAY, marginBottom: 3 }}>
            <span>{hm(dS)}</span><span>{hm((dS + dE) / 2)}</span><span>{hm(dE)}</span>
          </div>
          <div
            onClick={doc.shift ? (ev) => {
              // 点击进度条在岗轨道：按点击位置换算起始时间（取整到 30 分），售出新建预约。
              const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
              const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
              let mins = dS + ratio * (dE - dS);
              mins = Math.round(mins / 30) * 30;
              // 落到最近的在岗分段内（避免落在午休空档）
              const segs2 = doc.shift!.segments;
              const inSeg = segs2.find(([s0, e0]) => mins >= s0 && mins < e0);
              const start = inSeg ? mins : (segs2[0] ? segs2[0][0] : dS);
              const segEnd = (inSeg || segs2[0] || [dS, dE])[1];
              onNewAppt(doc.name, start, Math.min(start + 60, segEnd));
            } : undefined}
            style={{ position: "relative", height: 36, background: "#E2E8EF", borderRadius: 4, overflow: "hidden", cursor: doc.shift ? "pointer" : "default" }}
          >
            {/* 在岗底色按分段渲染，午休空档保持灰底；休息时用斜线纹底 */}
            {!doc.shift && <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(45deg,#ECEFF3,#ECEFF3 4px,#F6F8FA 4px,#F6F8FA 8px)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#bcc6d0" }}>今日休息</div>}
            {(doc.shift ? doc.shift.segments : []).map(([s0, e0], si) => (
              <div key={si} style={{ position: "absolute", top: 0, bottom: 0, left: `${sp(s0)}%`, width: `${Math.max(sp(e0) - sp(s0), 0)}%`, background: (doc.color && doc.color !== "#1E88D6") ? doc.color : getRoleBarColor(doc.roleKey) }} />
            ))}
            {sorted.map((a, i) => {
              if (!a.appointTime) return null;
              let s = timeToMin(a.appointTime);
              let e = a.endTime ? timeToMin(a.endTime) : s + (a.duration || 30);
              // 视觉裁剪：限制在所属在岗分段内，不越入灰区
              const segsR = doc.shift ? doc.shift.segments : ([[dS, dE]] as [number, number][]);
              const hostR = segsR.find(([s0, e0]) => s < e0 && e > s0);
              if (hostR) { s = Math.max(s, hostR[0]); e = Math.min(e, hostR[1]); }
              else { const ns = segsR.find(([s0]) => s0 >= s) || segsR[segsR.length - 1]; s = ns[0]; e = Math.min(s + (a.duration || 30), ns[1]); }
              if (e <= s) return null;
              const st = STATUS[a.status] || STATUS.booked;
              const rL = sp(s) <= 0.5 ? 9 : 0, rR = sp(e) >= 99.5 ? 9 : 0;
              return (
                <div key={i} onClick={() => onApptClick(a.id)} style={{ position: "absolute", left: `${sp(s)}%`, width: `${Math.max(sp(e) - sp(s), 2)}%`, top: 0, bottom: 0, borderRadius: `${rL}px ${rR}px ${rR}px ${rL}px`, background: st.color, display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "center", padding: "0 7px", overflow: "hidden", cursor: "pointer" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", width: "100%" }}>{a.patientName}</span>
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,.8)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%" }}>{a.project}</span>
                </div>
              );
            })}
          </div>
          {doc.shift && (
            <div style={{ marginTop: 8, fontSize: 12, color: SKY_D, display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 16, height: 16, borderRadius: "50%", background: SKY_L, color: SKY_D, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>+</span>
              点击上方在岗时段可新增预约
            </div>
          )}
        </div>
      </div>
      <div style={{ borderTop: `8px solid ${BG}` }}>
        {sorted.length === 0 && <div style={{ textAlign: "center", padding: "24px 0 30px", color: "#DBE1E8", fontSize: 13 }}>今日暂无预约</div>}
        {sorted.map((a, i) => {
          const st = STATUS[a.status] || STATUS.booked;
          const s = a.appointTime ? timeToMin(a.appointTime) : 0;
          const e = a.endTime ? timeToMin(a.endTime) : s + (a.duration || 30);
          return (
            <div key={i} onClick={() => onApptClick(a.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 14px", borderBottom: `1px solid ${LINE}`, cursor: "pointer" }}>
              <div style={{ width: 78, flexShrink: 0, fontSize: 12, color: "#647386", fontWeight: 600, lineHeight: 1.5 }}>{hm(s)}<br />{hm(e)}</div>
              <div style={{ width: 4, alignSelf: "stretch", borderRadius: 2, flexShrink: 0, background: st.color }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#26303C" }}>{a.patientName}</div>
                <div style={{ fontSize: 12, color: "#647386", marginTop: 2 }}>{a.project}{a.remark ? " · " + a.remark : ""}</div>
              </div>
              <span style={{ fontSize: 10, padding: "3px 9px", borderRadius: 10, color: st.color, background: st.bg, flexShrink: 0 }}>{st.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 按时段视图 ──
function TimeView({ docList, onApptClick, onNewAppt, trkStart, trkEnd }: {
  docList: { name: string; appts: any[] }[];
  onApptClick: (id: number) => void;
  onNewAppt: (docName: string, start: number, end: number) => void;
  trkStart: () => number; trkEnd: () => number;
}) {
  const t0 = Math.floor(trkStart() / 60), t1 = Math.ceil(trkEnd() / 60);
  const slots: [number, number][] = [];
  for (let s = t0; s < t1; s += 2) slots.push([s, Math.min(s + 2, t1)]);
  return (
    <div>
      {slots.map(([s, e]) => {
        const lines: React.ReactNode[] = [];
        docList.forEach((doc, di) => {
          const ap = doc.appts.find(a => {
            if (!a.appointTime) return false;
            const as_ = timeToMin(a.appointTime) / 60, ae = a.endTime ? timeToMin(a.endTime) / 60 : as_ + (a.duration || 30) / 60;
            return as_ < e && ae > s;
          });
          if (ap) {
            const st = STATUS[ap.status] || STATUS.booked;
            lines.push(
              <div key={di} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: `1px solid ${LINE}` }}>
                <div style={{ width: 44, fontSize: 13, color: "#647386", flexShrink: 0 }}>{doc.name}</div>
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={() => onApptClick(ap.id)}>
                  <div style={{ width: 6, height: 34, borderRadius: 3, flexShrink: 0, background: st.color }} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#26303C" }}>{ap.patientName}</div>
                    <div style={{ fontSize: 11, color: "#647386", marginTop: 2 }}>{ap.appointTime}–{ap.endTime || "—"} · {ap.project}</div>
                  </div>
                  <span style={{ marginLeft: "auto", fontSize: 10, padding: "3px 8px", borderRadius: 10, color: st.color, background: st.bg, flexShrink: 0 }}>{st.label}</span>
                </div>
              </div>
            );
          } else {
            lines.push(
              <div key={di} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: `1px solid ${LINE}` }}>
                <div style={{ width: 44, fontSize: 13, color: "#647386", flexShrink: 0 }}>{doc.name}</div>
                <div style={{ flex: 1, fontSize: 12, color: "#DBE1E8", cursor: "pointer" }} onClick={() => onNewAppt(doc.name, s * 60, e * 60)}>空档 · 可约 · 点击新增</div>
              </div>
            );
          }
        });
        if (lines.length === 0) return null;
        return (
          <div key={`${s}-${e}`} style={{ background: "#fff", marginBottom: 8 }}>
            <div style={{ padding: "8px 14px", fontSize: 12, fontWeight: 600, color: SKY_D, background: SKY_L }}>{hm(s * 60)} – {hm(e * 60)}</div>
            {lines}
          </div>
        );
      })}
      {slots.length === 0 && <div style={{ textAlign: "center", color: "#9AA7B5", fontSize: 12, padding: "30px 0" }}>当日暂无排班数据</div>}
    </div>
  );
}


// ── 单日覆盖时间选择框 ──
function OvTimeBox({ val, onChange, min, max }: { val: string; onChange: (v: string) => void; min?: string; max?: string }) {
  const [h, m] = val.split(":").map(Number);
  const h12 = h % 12 || 12;
  const ap = h < 12 ? "AM" : "PM";
  return (
    <label style={{ flex: 1, minWidth: 0, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", gap: 3, border: "1px solid #DBE1E8", borderRadius: 6, padding: "10px 6px", background: "#F6F8FA", cursor: "pointer" }}>
      <span style={{ fontSize: 20, fontWeight: 900, color: "#26303C", fontFamily: "system-ui,-apple-system,sans-serif", letterSpacing: 0.5 }}>
        {h12}:{String(m).padStart(2, "0")}
      </span>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#1E88D6" }}>{ap}</span>
      <input type="time" value={val} step={300} min={min} max={max} onChange={e => onChange(e.target.value)}
        style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer" }} />
    </label>
  );
}
