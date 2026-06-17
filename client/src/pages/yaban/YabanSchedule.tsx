/**
 * 牙伴齿科管理 - 预约日程页
 * 路由：/yaban/schedule
 * 部署链路测试 deploy-probe-1
 * UI：1:1 还原 yaban-schedule-proto/index.html 原型（顾客预约 Tab）
 * 数据：真实 API（yabanAppointment.listByDate / monthStats / listMembers）
 * 无模拟数据，无 emoji
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useYabanClinic } from "./useYabanClinic";
import YabanClinicHeader from "./YabanClinicHeader";

// 热力图 10 档色阶
const HEAT = ["#3FA0D6","#74BAE2","#A6D2ED","#CFE6F4","#E8F1F6","#F6E3E0","#F2C2BB","#EC9A8F","#E47166","#DC4B3B"];
function heatColor(r: number) {
  if (r <= 0) return "#f3f6f9";
  return HEAT[Math.min(9, Math.max(0, Math.ceil(r * 10) - 1))];
}
function heatTextColor(r: number) {
  const i = Math.ceil(r * 10) - 1;
  return (i <= 1 || i >= 8) ? "#fff" : "#2a3340";
}

// 状态配置（颜色与原型完全一致）
const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  booked:    { label: "已预约", color: "#5AA0D8", bg: "#EAF4FE" },
  confirmed: { label: "已确认", color: "#1E88D6", bg: "#EAF4FE" },
  treating:  { label: "治疗中", color: "#1567AE", bg: "#E3EFFA" },
  done:      { label: "已完成", color: "#8593A0", bg: "#F1F3F5" },
  missed:    { label: "失约",   color: "#E8973A", bg: "#FDF4E6" },
  cancelled: { label: "已取消", color: "#9aa6b2", bg: "#f4f6f9" },
  consulting:{ label: "咨询中", color: "#7C3AED", bg: "#EDE9FE" },
  registered:{ label: "已挂号", color: "#4338CA", bg: "#EEF2FF" },
  treated:   { label: "治疗完成",color: "#059669", bg: "#D1FAE5" },
  paid:      { label: "已结账", color: "#16A34A", bg: "#DCFCE7" },
  left:      { label: "已离开", color: "#15803D", bg: "#DCFCE7" },
};

const WK = ["日","一","二","三","四","五","六"];
const SKY = "#2196C8", SKY_D = "#1E88D6", SKY_L = "#EAF4FE";
const INK = "#1f2937", GRAY = "#6b7785", GRAY_L = "#9aa6b2";
const LINE = "#eef1f5", BG = "#F0F4F8";

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function isSameDay(a: Date, b: Date) {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}
function hm(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}
function timeToMin(t: string) {
  const [h,m] = t.split(":").map(Number);
  return h * 60 + m;
}
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
  const today = new Date();
  const [selDate, setSelDate] = useState(today);
  const [calMode, setCalMode] = useState<"week"|"month">("week");
  const [monthCursor, setMonthCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [apptView, setApptView] = useState<"doc"|"time">("doc");
  const [selectedDocIdx, setSelectedDocIdx] = useState<number|null>(null);
  const [detailModal, setDetailModal] = useState<{ open: boolean; apptId?: number }>({ open: false });
  const [newModal, setNewModal] = useState<{ open: boolean; prefillDocName?: string; prefillStart?: number; prefillEnd?: number }>({ open: false });

  const dateStr = toDateStr(selDate);

  const { currentTenantId } = useYabanClinic();

  const { data: appointments = [], refetch: refetchAppts } = trpc.yabanAppointment.listByDate.useQuery({ date: dateStr, tenantId: currentTenantId ?? undefined });
  const { data: monthStats = {} } = trpc.yabanAppointment.monthStats.useQuery({
    year: calMode === "month" ? monthCursor.getFullYear() : selDate.getFullYear(),
    month: calMode === "month" ? monthCursor.getMonth() + 1 : selDate.getMonth() + 1,
    tenantId: currentTenantId ?? undefined,
  });
  const { data: members = [] } = trpc.yabanAppointment.listMembers.useQuery({ tenantId: currentTenantId ?? undefined });

  // 按医生分组
  const docMap = new Map<string, { name: string; appts: typeof appointments }>();
  members.forEach(m => { if (!docMap.has(m.name)) docMap.set(m.name, { name: m.name, appts: [] }); });
  appointments.forEach(a => {
    if (!docMap.has(a.doctor)) docMap.set(a.doctor, { name: a.doctor, appts: [] });
    docMap.get(a.doctor)!.appts.push(a);
  });
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
    return `conic-gradient(${lv.col} ${deg}deg, #e6ebf0 ${deg}deg 360deg)`;
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

  function cellLoad(d: Date): number {
    const cnt = ((monthStats as Record<string, number>)[toDateStr(d)]) || 0;
    return Math.min(1, cnt / 8);
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

      {/* 顶栏 */}
      <div style={{ background: `linear-gradient(90deg,${SKY},#3BA9E0)`, color: "#fff", padding: "14px 16px 12px", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ flex: 1, display: "flex", justifyContent: "flex-start" }}>
            <div style={{ fontSize: 22, width: 28, cursor: "pointer" }} onClick={() => setLocation("/yaban")}>‹</div>
          </div>
          <div style={{ display: "flex", gap: 6, background: "rgba(255,255,255,.18)", borderRadius: 12, padding: 4, flexShrink: 0 }}>
            <div style={{ padding: "7px 14px", borderRadius: 9, fontSize: 14, fontWeight: 600, background: "#fff", color: SKY_D, boxShadow: "0 1px 3px rgba(0,0,0,.1)", whiteSpace: "nowrap" }}>顾客预约</div>
            <div onClick={() => setLocation("/yaban/clinic-shift")} style={{ padding: "7px 14px", borderRadius: 9, fontSize: 14, fontWeight: 600, color: "#eaf6ff", whiteSpace: "nowrap", cursor: "pointer" }}>医生排班</div>
          </div>
          <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
            <button onClick={() => setNewModal({ open: true })} aria-label="新建预约" style={{ width: 32, height: 32, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.12)", border: "none", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", cursor: "pointer" }}>
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

      {/* 周历 / 月历 */}
      <div style={{ background: "#fff", padding: "10px 16px 2px", borderBottom: `1px solid ${LINE}` }}>
        {calMode === "month" && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 10 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: INK }}>{monthCursor.getFullYear()}年{monthCursor.getMonth() + 1}月</span>
            <div style={{ display: "flex", gap: 6 }}>
              <div onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))} style={{ width: 30, height: 30, borderRadius: 9, background: "#f3f6f9", color: "#5b6b7a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, cursor: "pointer" }}>‹</div>
              <div onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))} style={{ width: 30, height: 30, borderRadius: 9, background: "#f3f6f9", color: "#5b6b7a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, cursor: "pointer" }}>›</div>
            </div>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: 2 }}>
          {headDays.map((w, i) => <span key={i} style={{ textAlign: "center", fontSize: 10, fontWeight: 600, color: "#aab4be", padding: "3px 0", letterSpacing: ".5px" }}>{w}</span>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
          {calDates.map((d, i) => {
            if (!d) return <div key={i} />;
            const isToday = isSameDay(d as Date, today), isSel = isSameDay(d as Date, selDate);
            const isPast = (d as Date) < today && !isToday;
            const r = cellLoad(d as Date);
            const bg = r > 0 ? heatColor(r) : "#f3f6f9";
            const tc = r > 0 ? heatTextColor(r) : "#2a3340";
            return (
              <div key={i} onClick={() => setSelDate(d as Date)} style={{
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                height: calMode === "month" ? 42 : 48, borderRadius: 10, background: bg, cursor: "pointer",
                position: "relative", outline: isSel ? `2.5px solid ${SKY_D}` : "none", outlineOffset: 1,
                transform: isSel ? "scale(1.04)" : "none", opacity: isPast ? 0.72 : 1, transition: "all .18s", zIndex: isSel ? 2 : 1,
              }}>
                <span style={{ fontSize: 16, fontWeight: isSel || isToday ? 700 : 600, color: isToday ? SKY_D : tc, fontFamily: "'SF Pro Display','PingFang SC',-apple-system,sans-serif" }}>
                  {String((d as Date).getDate()).padStart(2, "0")}
                </span>
                {isToday && <span style={{ position: "absolute", bottom: 5, width: 5, height: 5, borderRadius: "50%", background: SKY }} />}
              </div>
            );
          })}
        </div>
        {/* 热力图图例 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "9px 0 3px", fontSize: 10, color: "#9aa6b2" }}>
          <span>空闲</span>
          <div style={{ display: "flex" }}>
            {HEAT.map((c, i) => <div key={i} style={{ width: 14, height: 11, background: c, borderRadius: i === 0 ? "3px 0 0 3px" : i === 9 ? "0 3px 3px 0" : 0 }} />)}
          </div>
          <span>约满</span>
        </div>
        <div onClick={() => { if (calMode === "week") { setCalMode("month"); setMonthCursor(new Date(selDate.getFullYear(), selDate.getMonth(), 1)); } else setCalMode("week"); }}
          style={{ textAlign: "center", color: "#c4ccd4", fontSize: 16, lineHeight: 1, padding: "4px 0 7px", cursor: "pointer" }}>
          {calMode === "week" ? "⌄" : "⌃"}
        </div>
      </div>

      {/* 忙闲速览 */}
      <div style={{ background: "#fff", padding: "6px 14px 10px", borderBottom: `8px solid ${BG}` }}>
        <div style={{ display: "flex", gap: 14, overflowX: "auto", padding: "10px 4px" }}>
          {/* 全员 */}
          <div onClick={() => setSelectedDocIdx(null)} style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 46, cursor: "pointer", opacity: selectedDocIdx !== null ? 0.38 : 1, transform: selectedDocIdx !== null ? "scale(.88)" : "none", transition: ".22s" }}>
            <div style={{ width: 46, height: 46, borderRadius: "50%", padding: 3, background: selectedDocIdx === null ? SKY_D : "#eef3f8" }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: selectedDocIdx === null ? "#fff" : "#7c93a8", background: selectedDocIdx === null ? SKY_D : "#eef3f8" }}>全部</div>
            </div>
            <div style={{ fontSize: 11, color: selectedDocIdx === null ? SKY_D : "#4b5563", marginTop: 5, fontWeight: selectedDocIdx === null ? 600 : 400 }}>全员</div>
            <div style={{ fontSize: 9, color: "#9aa6b2", marginTop: 1 }}>{docList.length}人</div>
          </div>
          {docList.map((doc, idx) => {
            const lv = loadLevel(doc.appts);
            const sel = selectedDocIdx === idx;
            const dimmed = selectedDocIdx !== null && !sel;
            return (
              <div key={doc.name} onClick={() => setSelectedDocIdx(sel ? null : idx)} style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 46, cursor: "pointer", opacity: dimmed ? 0.38 : 1, transform: sel ? "scale(1.05)" : dimmed ? "scale(.88)" : "none", filter: dimmed ? "grayscale(.4)" : "none", transition: ".22s" }}>
                <div style={{ width: 46, height: 46, borderRadius: "50%", padding: 3, background: ringBg(lv) }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 600, color: "#fff", background: doc.appts.length > 0 ? "#5aa9dd" : "#cbd3da" }}>{doc.name.charAt(0)}</div>
                </div>
                <div style={{ fontSize: 11, color: sel ? SKY_D : "#4b5563", marginTop: 5, fontWeight: sel ? 700 : 400 }}>{doc.name}</div>
                <div style={{ fontSize: 9, color: lv.col, marginTop: 1 }}>{lv.t}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 视图切换 */}
      <div style={{ background: "#fff", padding: "8px 14px", display: "flex", gap: 8, alignItems: "center", borderBottom: `1px solid ${LINE}` }}>
        {(["doc","time"] as const).map(v => (
          <div key={v} onClick={() => setApptView(v)} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 20, fontWeight: 500, cursor: "pointer", background: apptView === v ? SKY : "#f0f3f6", color: apptView === v ? "#fff" : "#6b7280" }}>
            {v === "doc" ? "按医生" : "按时段"}
          </div>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 11, color: GRAY }}>{appointments.length} 个预约</span>
      </div>

      {/* 内容区 */}
      <div style={{ paddingBottom: 90 }}>
        {apptView === "doc" ? (
          selectedDocIdx !== null && docList[selectedDocIdx]
            ? <SoloView doc={docList[selectedDocIdx]} onBack={() => setSelectedDocIdx(null)} onApptClick={id => setDetailModal({ open: true, apptId: id })} onNewAppt={(docName, start, end) => setNewModal({ open: true, prefillDocName: docName, prefillStart: start, prefillEnd: end })} trkStart={trkStart} trkEnd={trkEnd} pctM={pctM} OPEN_START={OPEN_START} OPEN_END={OPEN_END} />
            : <DocRows docList={docList} onDocClick={idx => setSelectedDocIdx(idx)} onApptClick={id => setDetailModal({ open: true, apptId: id })} trkStart={trkStart} trkEnd={trkEnd} pctM={pctM} />
        ) : (
          <TimeView docList={selectedDocIdx !== null && docList[selectedDocIdx] ? [docList[selectedDocIdx]] : docList} onApptClick={id => setDetailModal({ open: true, apptId: id })} onNewAppt={(docName, start, end) => setNewModal({ open: true, prefillDocName: docName, prefillStart: start, prefillEnd: end })} trkStart={trkStart} trkEnd={trkEnd} />
        )}
      </div>

      {/* 预约详情弹窗 */}
      {detailModal.open && detailAppt && (
        <BottomSheet onClose={() => setDetailModal({ open: false })}>
          <h3 style={{ fontSize: 17, marginBottom: 4 }}>{detailAppt.patientName}</h3>
          <div style={{ fontSize: 12, color: GRAY, marginBottom: 6 }}>门店预约</div>
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
                : <span style={{ color: "#374151", fontWeight: 500 }}>{v as string}</span>
              }
            </div>
          ))}
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <div onClick={() => deleteApptMut.mutate({ id: detailAppt.id, tenantId: currentTenantId ?? undefined })} style={{ flex: "0 0 auto", padding: "13px 20px", borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: "pointer", background: "#FDECEC", color: "#D64545", textAlign: "center" }}>删除</div>
            <div onClick={() => setDetailModal({ open: false })} style={{ flex: 1, padding: 13, borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: "pointer", background: "#f1f4f7", color: "#5b6675", textAlign: "center" }}>关闭</div>
            <div onClick={() => { setDetailModal({ open: false }); setNewModal({ open: true }); }} style={{ flex: 1, padding: 13, borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: "pointer", background: SKY, color: "#fff", textAlign: "center" }}>编辑预约</div>
          </div>
        </BottomSheet>
      )}

      {/* 新建预约弹窗 */}
      {newModal.open && (
        <BottomSheet onClose={() => setNewModal({ open: false })} fullscreen>
          <NewApptForm
            date={dateStr}
            tenantId={currentTenantId ?? undefined}
            prefillDocName={newModal.prefillDocName}
            prefillStart={newModal.prefillStart}
            prefillEnd={newModal.prefillEnd}
            members={members}
            onClose={() => setNewModal({ open: false })}
            onSaved={() => { setNewModal({ open: false }); refetchAppts(); }}
          />
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
function DocRows({ docList, onDocClick, onApptClick, trkStart, trkEnd, pctM }: {
  docList: { name: string; appts: any[] }[];
  onDocClick: (idx: number) => void;
  onApptClick: (id: number) => void;
  trkStart: () => number; trkEnd: () => number; pctM: (m: number) => number;
}) {
  const a = trkStart(), b = trkEnd(), span = Math.max(1, b - a);
  const marks = Array.from({ length: 4 }, (_, i) => hm(Math.round(a + span * i / 3)));
  return (
    <div>
      <div style={{ background: "#fff", padding: "12px 14px 6px", borderBottom: `1px solid ${LINE}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: GRAY, paddingLeft: 62 }}>
          {marks.map((m, i) => <span key={i}>{m}</span>)}
        </div>
      </div>
      {docList.map((doc, idx) => (
        <div key={doc.name} style={{ background: "#fff", padding: "11px 14px", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${LINE}`, cursor: "pointer" }} onClick={() => onDocClick(idx)}>
          <div style={{ width: 54, flexShrink: 0, textAlign: "center" }}>
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: SKY_L, color: SKY_D, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, margin: "0 auto 3px" }}>{doc.name.charAt(0)}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{doc.name}</div>
            <div style={{ fontSize: 9, color: GRAY, marginTop: 1 }}>{doc.appts.length > 0 ? `${doc.appts.length}个预约` : "暂无"}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ position: "relative", height: 28, borderRadius: 8, overflow: "hidden", background: "#E2E8EF" }}>
              <div style={{ position: "absolute", inset: 0, background: "#A8CCE8" }} />
              {doc.appts.map((a2, i) => {
                if (!a2.appointTime) return null;
                const s = timeToMin(a2.appointTime);
                const e2 = a2.endTime ? timeToMin(a2.endTime) : s + (a2.duration || 30);
                const l = pctM(s), w = Math.max(pctM(e2) - pctM(s), 2);
                const st = STATUS[a2.status] || STATUS.booked;
                return (
                  <div key={i} onClick={ev => { ev.stopPropagation(); onApptClick(a2.id); }} style={{ position: "absolute", left: `${l}%`, width: `${w}%`, top: 3, height: 22, borderRadius: 6, background: st.color, boxShadow: "0 1px 2px rgba(30,90,160,.12)", display: "flex", alignItems: "center", padding: "0 4px", overflow: "hidden", cursor: "pointer" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden" }}>{a2.patientName.slice(0, 2)}</span>
                  </div>
                );
              })}
            </div>
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
  doc: { name: string; appts: any[] };
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
  const dS = OPEN_START, dE = OPEN_END;
  const span = Math.max(1, dE - dS);
  const sp = (m: number) => Math.max(0, Math.min(100, ((m - dS) / span) * 100));

  return (
    <div>
      <div style={{ background: "#fff" }}>
        <div style={{ padding: "14px 14px 4px", display: "flex", alignItems: "center", gap: 10 }}>
          <div onClick={onBack} style={{ fontSize: 20, color: GRAY, cursor: "pointer", marginRight: 4 }}>‹</div>
          <div style={{ width: 42, height: 42, borderRadius: "50%", background: SKY_L, color: SKY_D, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 600, flexShrink: 0 }}>{doc.name.charAt(0)}</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#374151" }}>{doc.name}</div>
            <div style={{ fontSize: 12, color: GRAY, marginTop: 2 }}>在岗 {hm(dS)}–{hm(dE)} · 已约 {doc.appts.length} 个</div>
          </div>
        </div>
        <div style={{ padding: "6px 14px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: GRAY, marginBottom: 3 }}>
            <span>{hm(dS)}</span><span>{hm((dS + dE) / 2)}</span><span>{hm(dE)}</span>
          </div>
          <div style={{ position: "relative", height: 46, background: "#E6ECF2", borderRadius: 9, overflow: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, background: "#A8CCE8" }} />
            {sorted.map((a, i) => {
              if (!a.appointTime) return null;
              const s = timeToMin(a.appointTime);
              const e = a.endTime ? timeToMin(a.endTime) : s + (a.duration || 30);
              const st = STATUS[a.status] || STATUS.booked;
              return (
                <div key={i} onClick={() => onApptClick(a.id)} style={{ position: "absolute", left: `${sp(s)}%`, width: `${Math.max(sp(e) - sp(s), 2)}%`, top: 4, height: 38, borderRadius: 7, background: st.color, display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "center", padding: "0 7px", overflow: "hidden", cursor: "pointer" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", width: "100%" }}>{a.patientName}</span>
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,.8)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%" }}>{a.project}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div style={{ borderTop: `8px solid ${BG}` }}>
        {sorted.length === 0 && <div style={{ textAlign: "center", padding: "24px 0 30px", color: "#bcc6d0", fontSize: 13 }}>今日暂无预约</div>}
        {sorted.map((a, i) => {
          const st = STATUS[a.status] || STATUS.booked;
          const s = a.appointTime ? timeToMin(a.appointTime) : 0;
          const e = a.endTime ? timeToMin(a.endTime) : s + (a.duration || 30);
          return (
            <div key={i} onClick={() => onApptClick(a.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 14px", borderBottom: `1px solid ${LINE}`, cursor: "pointer" }}>
              <div style={{ width: 78, flexShrink: 0, fontSize: 12, color: "#6b7280", fontWeight: 600, lineHeight: 1.5 }}>{hm(s)}<br />{hm(e)}</div>
              <div style={{ width: 4, alignSelf: "stretch", borderRadius: 2, flexShrink: 0, background: st.color }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#374151" }}>{a.patientName}</div>
                <div style={{ fontSize: 12, color: "#8a96a3", marginTop: 2 }}>{a.project}{a.remark ? " · " + a.remark : ""}</div>
              </div>
              <span style={{ fontSize: 10, padding: "3px 9px", borderRadius: 20, color: st.color, background: st.bg, flexShrink: 0 }}>{st.label}</span>
            </div>
          );
        })}
        <div onClick={() => onNewAppt(doc.name, OPEN_END, OPEN_END + 60)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 14px", borderBottom: `1px solid ${LINE}`, cursor: "pointer" }}>
          <div style={{ width: 78, flexShrink: 0, fontSize: 12, color: "#bcc6d0", fontWeight: 600, lineHeight: 1.5 }}>{hm(OPEN_END)}</div>
          <div style={{ width: 4, alignSelf: "stretch", borderRadius: 2, flexShrink: 0, background: "#e3e8ed" }} />
          <div style={{ flex: 1 }}><div style={{ fontSize: 13, color: "#bcc6d0", fontWeight: 500 }}>空档 · 可约 · 点击新增</div></div>
        </div>
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
                <div style={{ width: 44, fontSize: 13, color: "#6b7280", flexShrink: 0 }}>{doc.name}</div>
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={() => onApptClick(ap.id)}>
                  <div style={{ width: 6, height: 34, borderRadius: 3, flexShrink: 0, background: st.color }} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>{ap.patientName}</div>
                    <div style={{ fontSize: 11, color: "#8a96a3", marginTop: 2 }}>{ap.appointTime}–{ap.endTime || "—"} · {ap.project}</div>
                  </div>
                  <span style={{ marginLeft: "auto", fontSize: 10, padding: "3px 8px", borderRadius: 20, color: st.color, background: st.bg, flexShrink: 0 }}>{st.label}</span>
                </div>
              </div>
            );
          } else {
            lines.push(
              <div key={di} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: `1px solid ${LINE}` }}>
                <div style={{ width: 44, fontSize: 13, color: "#6b7280", flexShrink: 0 }}>{doc.name}</div>
                <div style={{ flex: 1, fontSize: 12, color: "#bcc6d0", cursor: "pointer" }} onClick={() => onNewAppt(doc.name, s * 60, e * 60)}>空档 · 可约 · 点击新增</div>
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
      {slots.length === 0 && <div style={{ textAlign: "center", color: "#9aa6b2", fontSize: 12, padding: "30px 0" }}>当日暂无排班数据</div>}
    </div>
  );
}

// ── 新建预约表单 ──
function NewApptForm({ date, tenantId, prefillDocName, prefillStart, prefillEnd, members, onClose, onSaved }: {
  date: string; tenantId?: number; prefillDocName?: string; prefillStart?: number; prefillEnd?: number;
  members: { userId: number; name: string; roleKey: string }[];
  onClose: () => void; onSaved: () => void;
}) {
  const [patientName, setPatientName] = useState("");
  const [doctor, setDoctor] = useState(prefillDocName || "");
  const [startTime, setStartTime] = useState(prefillStart !== undefined ? hm(prefillStart) : "09:00");
  const [endTime, setEndTime] = useState(prefillEnd !== undefined ? hm(prefillEnd) : "10:00");
  const [project, setProject] = useState("");
  const [remark, setRemark] = useState("");
  const [saving, setSaving] = useState(false);

  const createMut = trpc.yabanAppointment.create.useMutation({
    onSuccess: onSaved,
    onError: (e) => { toast.error(e.message); setSaving(false); },
  });

  const PROJECTS = ["全口洁治","补牙","拔牙","戴牙","复诊","拆线","备牙取模","种植牙","正畸","漂白"];

  function handleSave() {
    if (!patientName.trim()) { toast.error("请填写患者姓名"); return; }
    if (!doctor) { toast.error("请选择就诊医生"); return; }
    setSaving(true);
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    const dur = (eh * 60 + em) - (sh * 60 + sm);
    createMut.mutate({ patientName: patientName.trim(), doctor, appointDate: date, appointTime: startTime, endTime, duration: dur > 0 ? dur : 30, project, remark, status: "booked", tenantId });
  }

  return (
    <div>
      <h3 style={{ fontSize: 17, marginBottom: 4 }}>新建预约</h3>
      <div style={{ fontSize: 12, color: GRAY, marginBottom: 12 }}>填写预约信息</div>
      {/* 患者姓名 */}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "11px 0", borderBottom: `1px solid ${LINE}`, fontSize: 14 }}>
        <span style={{ color: GRAY }}>患者姓名</span>
        <input value={patientName} onChange={e => setPatientName(e.target.value)} placeholder="请输入姓名" style={{ border: "none", outline: "none", textAlign: "right", fontSize: 14, color: "#374151", background: "transparent", width: 160 }} />
      </div>
      {/* 就诊医生 */}
      <div style={{ padding: "11px 0 8px", borderBottom: `1px solid ${LINE}`, fontSize: 14 }}>
        <div style={{ color: GRAY, marginBottom: 8 }}>就诊医生 <span style={{ fontSize: 11, color: "#aab4be", fontWeight: 400 }}>· 仅显示在岗</span></div>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "2px 0 4px" }}>
          {members.map(m => (
            <div key={m.userId} onClick={() => setDoctor(m.name)} style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "8px 4px", width: 58, borderRadius: 10, border: `1px solid ${doctor === m.name ? SKY_D : LINE}`, background: doctor === m.name ? SKY_L : "#fafbfc", cursor: "pointer" }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: doctor === m.name ? SKY_D : SKY_L, color: doctor === m.name ? "#fff" : SKY_D, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14 }}>{m.name.charAt(0)}</div>
              <div style={{ fontSize: 11, color: "#51606e", fontWeight: 600 }}>{m.name}</div>
            </div>
          ))}
        </div>
      </div>
      {/* 时间 */}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "11px 0", borderBottom: `1px solid ${LINE}`, fontSize: 14, alignItems: "center" }}>
        <span style={{ color: GRAY }}>预约时间</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={{ width: 84, fontSize: 14, fontWeight: 600, color: "#2a3340", border: `1px solid ${LINE}`, borderRadius: 8, padding: "6px 8px", background: "#fafbfc", fontFamily: "inherit", textAlign: "center" }} />
          <span style={{ color: "#c4ccd4" }}>–</span>
          <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={{ width: 84, fontSize: 14, fontWeight: 600, color: "#2a3340", border: `1px solid ${LINE}`, borderRadius: 8, padding: "6px 8px", background: "#fafbfc", fontFamily: "inherit", textAlign: "center" }} />
        </div>
      </div>
      {/* 诊疗项目 */}
      <div style={{ padding: "11px 0 8px", borderBottom: `1px solid ${LINE}`, fontSize: 14 }}>
        <div style={{ color: GRAY, marginBottom: 8 }}>诊疗项目</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {PROJECTS.map(p => (
            <div key={p} onClick={() => setProject(project === p ? "" : p)} style={{ fontSize: 12.5, fontWeight: 600, padding: "6px 12px", borderRadius: 8, cursor: "pointer", color: project === p ? SKY_D : "#51606e", background: project === p ? SKY_L : "#fafbfc", border: `1px solid ${project === p ? SKY_D : LINE}` }}>{p}</div>
          ))}
        </div>
      </div>
      {/* 备注 */}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "11px 0", fontSize: 14, borderBottom: `1px solid ${LINE}` }}>
        <span style={{ color: GRAY }}>备注</span>
        <input value={remark} onChange={e => setRemark(e.target.value)} placeholder="可选" style={{ border: "none", outline: "none", textAlign: "right", fontSize: 14, color: "#374151", background: "transparent", width: 160 }} />
      </div>
      {/* 操作 */}
      <div style={{ display: "flex", gap: 10, marginTop: 16, position: "sticky", bottom: 0, background: "#fff", paddingTop: 12, paddingBottom: 2, boxShadow: "0 -8px 12px -6px rgba(15,23,42,.08)" }}>
        <div onClick={onClose} style={{ flex: 1, textAlign: "center", padding: 13, borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: "pointer", background: "#f1f4f7", color: "#5b6675" }}>取消</div>
        <div onClick={handleSave} style={{ flex: 1, textAlign: "center", padding: 13, borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: "pointer", background: saving ? "#cdd5dd" : SKY_D, color: "#fff", pointerEvents: saving ? "none" : "auto" }}>{saving ? "保存中..." : "保存预约"}</div>
      </div>
    </div>
  );
}
