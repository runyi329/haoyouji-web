/**
 * 牙伴齿科管理 - 新建预约页（P323）
 * 路由：/yaban/schedule/create
 * 表单：患者、时间、诊所、医生、咨询师、助理、项目、诊室、科室、预约来源、备注
 *
 * 设计规范（移动端前台高频操作，单手拇指友好）：
 * - 牙伴标准色卡：主色#1E88D6 / 渐变亮端#3D9FD6 / 浅底#EBF5FB
 *   主字#26303C / 次字#647386 / 弱字#9AA7B5 / 分隔线#ECEFF3 / 页面底#F6F8FA / 边框#DBE1E8
 * - 字段分组成卡片：顾客 / 时间 / 诊疗信息 / 备注；必填打红色 *
 * - 时间用底部滚轮 Picker，并提供快捷时长，自动算结束时间
 * - 点击热区加大到约 52px 高；保存按钮固定底部安全区
 * - 禁止 Emoji
 */
import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { ChevronRight, User, Clock, Stethoscope, FileText, Check, Search, Calendar } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useYabanClinic } from "./useYabanClinic";
import { YabanTopBar } from "./YabanTopBar";

// 牙伴标准色卡
const SKY = "#3D9FD6", SKY_D = "#1E88D6", SKY_L = "#EBF5FB";
const INK = "#26303C", GRAY = "#647386", GRAY_L = "#9AA7B5";
const LINE = "#ECEFF3", BORDER = "#DBE1E8", BG = "#F6F8FA";
const REQ = "#D9534F"; // 必填星号（低饱和红，与状态色体系一致）
const LABEL = "#3A4654"; // 字段标签（比次字更深，加粗后清晰）

// 静态选项（医生从API动态获取）
const DOCTORS_FALLBACK = ["郑莹", "易家宝", "李华超", "鲁毅", "梅刚"];
const CONSULTANTS = ["洪紫钥", "杨文利", "侯睿"];
const ASSISTANTS = ["张助理", "李助理"];
const ROOMS = ["1号诊室", "2号诊室", "3号诊室", "VIP诊室"];
const DEPARTMENTS = ["口腔综合科", "正畸科", "种植科", "牙周科"];
const SOURCES = ["电话预约", "微信预约", "到店预约", "转介绍", "网络预约"];
const PROJECTS = ["洁牙", "补牙", "拔牙", "种植", "正畸", "根管治疗", "美白", "贴面", "牙冠"];

// 时间滚轮选项
const HOURS = Array.from({ length: 15 }, (_, i) => String(i + 8).padStart(2, "0")); // 08-22
const MINUTES = ["00", "10", "15", "20", "30", "40", "45", "50"];

interface FormData {
  patientName: string;
  patientId: string;
  date: string;
  startTime: string;
  endTime: string;
  clinic: string;
  doctor: string;
  consultant: string;
  assistant: string;
  project: string;
  room: string;
  department: string;
  source: string;
  remark: string;
}

// 从 URL 读取预填参数（由预约列表页加号 / 进度条跳转带入）
function readPrefill() {
  if (typeof window === "undefined") return {} as Record<string, string>;
  const sp = new URLSearchParams(window.location.search);
  const r: Record<string, string> = {};
  ["date", "doctor", "start", "end"].forEach((k) => { const v = sp.get(k); if (v) r[k] = v; });
  return r;
}
const isTime = (s?: string) => !!s && /^\d{2}:\d{2}$/.test(s);

export default function YabanScheduleCreate() {
  const [, setLocation] = useLocation();
  const prefill = useMemo(() => readPrefill(), []);
  const [showPicker, setShowPicker] = useState<string | null>(null);
  const [showTimeSheet, setShowTimeSheet] = useState(false); // 预约时段弹层
  const [timeTab, setTimeTab] = useState<"start" | "end">("start"); // 弹层内当前编辑开始/结束
  const [docSearch, setDocSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { currentTenantId, current } = useYabanClinic();
  const clinicName = current?.name?.trim() || current?.shortName?.trim() || "";

  // 从API获取员工（医生）列表
  const { data: membersData } = trpc.yabanAppointment.listMembers.useQuery({ tenantId: currentTenantId ?? undefined });
  const DOCTORS = (membersData?.map((m: any) => m.name).filter(Boolean) as string[]) || DOCTORS_FALLBACK;

  // 创建预约 mutation
  const createAppointment = trpc.yabanAppointment.create.useMutation({
    onSuccess: () => { setSubmitting(false); setLocation("/yaban/schedule"); },
    onError: (err) => { setSubmitting(false); alert(err.message || "创建失败，请重试"); },
  });

  const [form, setForm] = useState<FormData>({
    patientName: "",
    patientId: "",
    date: prefill.date || new Date().toISOString().split("T")[0],
    startTime: isTime(prefill.start) ? prefill.start : "09:00",
    endTime: isTime(prefill.end) ? prefill.end : "09:30",
    clinic: "",
    doctor: prefill.doctor || "",
    consultant: "",
    assistant: "",
    project: "",
    room: "",
    department: "",
    source: "",
    remark: "",
  });

  // 临时时间选择状态（开始/结束各一组，弹层确定时一次性写回）
  const initStart = isTime(prefill.start) ? prefill.start.split(":") : ["09", "00"];
  const initEnd = isTime(prefill.end) ? prefill.end.split(":") : ["09", "30"];
  const [tmpStartH, setTmpStartH] = useState(initStart[0]);
  const [tmpStartM, setTmpStartM] = useState(initStart[1]);
  const [tmpEndH, setTmpEndH] = useState(initEnd[0]);
  const [tmpEndM, setTmpEndM] = useState(initEnd[1]);

  const handleSelectPatient = () => {
    setLocation("/yaban/followup/patient-select");
  };

  // 挂载时回填选中的顾客（来自顾客选择页或“保存并立即预约”）
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("selectedPatient");
      if (raw) {
        const p = JSON.parse(raw) as { id?: number; name?: string; mobile?: string };
        if (p && p.name) {
          setForm((prev) => ({
            ...prev,
            patientName: p.name || "",
            patientId: p.id != null ? String(p.id) : "",
          }));
        }
        sessionStorage.removeItem("selectedPatient");
      }
    } catch {
      /* ignore */
    }
  }, []);

  const handleSave = () => {
    if (!form.patientName) { alert("请选择顾客"); return; }
    if (!form.doctor) { alert("请选择医生"); return; }
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
      remark: form.remark || undefined,
    });
  };

  const handlePickerSelect = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setShowPicker(null);
    setDocSearch("");
  };

  // 打开预约时段弹层，用当前 form 值初始化两组临时滚轮
  const openTimeSheet = () => {
    const [sh, sm] = (form.startTime || "09:00").split(":");
    const [eh, em] = (form.endTime || "09:30").split(":");
    setTmpStartH(sh);
    setTmpStartM(MINUTES.includes(sm) ? sm : "00");
    setTmpEndH(eh);
    setTmpEndM(MINUTES.includes(em) ? em : "00");
    setTimeTab("start");
    setShowTimeSheet(true);
  };

  // 确认时段：一次性写回开始与结束
  const confirmTimeSheet = () => {
    const start = `${tmpStartH}:${tmpStartM}`;
    const end = `${tmpEndH}:${tmpEndM}`;
    setForm((prev) => ({ ...prev, startTime: start, endTime: end }));
    setShowTimeSheet(false);
  };

  // 获取picker选项
  const getPickerOptions = (): string[] => {
    switch (showPicker) {
      case "doctor": return DOCTORS;
      case "consultant": return CONSULTANTS;
      case "assistant": return ASSISTANTS;
      case "room": return ROOMS;
      case "department": return DEPARTMENTS;
      case "source": return SOURCES;
      case "project": return PROJECTS;
      default: return [];
    }
  };

  const getPickerTitle = (): string => {
    switch (showPicker) {
      case "doctor": return "选择医生";
      case "consultant": return "选择咨询师";
      case "assistant": return "选择助理";
      case "room": return "选择诊室";
      case "department": return "选择科室";
      case "source": return "选择预约来源";
      case "project": return "选择项目";
      default: return "";
    }
  };

  // 医生列表可搜索过滤
  const pickerOptions = useMemo(() => {
    const opts = getPickerOptions();
    if (showPicker === "doctor" && docSearch.trim()) {
      return opts.filter((o) => o.includes(docSearch.trim()));
    }
    return opts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPicker, docSearch, DOCTORS]);

  // ====== 复用行组件 ======
  // 选择行（点击弹 Picker）
  const SelectRow = ({ label, value, placeholder, required, onClick }: {
    label: string; value: string; placeholder: string; required?: boolean; onClick: () => void;
  }) => (
    <div
      onClick={onClick}
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px", minHeight: 46, borderBottom: `1px solid ${LINE}`, cursor: "pointer" }}
    >
      <span style={{ fontSize: 15, fontWeight: 600, color: LABEL, flexShrink: 0 }}>
        {label}{required && <span style={{ color: REQ, marginLeft: 3 }}>*</span>}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 16, minWidth: 0 }}>
        <span style={{ fontSize: 15, color: value ? INK : GRAY_L, fontWeight: value ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value || placeholder}
        </span>
        <ChevronRight size={17} color={GRAY_L} style={{ flexShrink: 0 }} />
      </div>
    </div>
  );

  // 文本输入行
  const InputRow = ({ label, value, placeholder, field, required }: {
    label: string; value: string; placeholder: string; field: keyof FormData; required?: boolean;
  }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px", minHeight: 46, borderBottom: `1px solid ${LINE}` }}>
      <span style={{ fontSize: 15, fontWeight: 600, color: LABEL, flexShrink: 0 }}>
        {label}{required && <span style={{ color: REQ, marginLeft: 3 }}>*</span>}
      </span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))}
        style={{ fontSize: 15, fontWeight: 600, color: INK, textAlign: "right", background: "transparent", outline: "none", border: "none", flex: 1, marginLeft: 16 }}
      />
    </div>
  );

  // 分组标题
  const GroupTitle = ({ icon, text }: { icon: React.ReactNode; text: string }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "12px 14px 6px" }}>
      {icon}
      <span style={{ fontSize: 13, fontWeight: 700, color: LABEL, letterSpacing: ".3px" }}>{text}</span>
    </div>
  );

  const cardStyle: React.CSSProperties = { background: "#fff", margin: "0 10px", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 3px rgba(38,48,60,.04)" };

  return (
    <div style={{ minHeight: "100vh", background: BG, paddingBottom: 96 }}>
      {/* 顶部导航栏 —— 全站统一组件 */}
      <YabanTopBar title="新建预约" back="/yaban/schedule" clinicName={clinicName} />

      {/* 顾客（必填，强引导） */}
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

      {/* 时间信息 */}
      <GroupTitle icon={<Clock size={14} color={SKY_D} />} text="预约时间" />
      <div style={cardStyle}>
        {/* 日期 —— 点击触发隐藏的原生 date（移动端日期选择器体验尚可，保留但热区加大） */}
        <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px", minHeight: 46, borderBottom: `1px solid ${LINE}`, cursor: "pointer", position: "relative" }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: LABEL }}>日期<span style={{ color: REQ, marginLeft: 3 }}>*</span></span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 15, color: INK, fontWeight: 600 }}>{form.date}</span>
            <Calendar size={16} color={GRAY_L} />
          </div>
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
            style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer" }}
          />
        </label>
        {/* 预约时段 —— 一行，点开同一弹层选开始+结束 */}
        <SelectRow
          label="预约时段"
          value={form.startTime && form.endTime ? `${form.startTime} — ${form.endTime}` : ""}
          placeholder="请选择时段"
          required
          onClick={openTimeSheet}
        />
      </div>

      {/* 诊疗信息 */}
      <GroupTitle icon={<Stethoscope size={14} color={SKY_D} />} text="诊疗信息" />
      <div style={cardStyle}>
        <InputRow label="诊所" value={form.clinic || clinicName} placeholder="当前所属医院" field="clinic" />
        <SelectRow label="医生" value={form.doctor} placeholder="请选择医生" required onClick={() => setShowPicker("doctor")} />
        <SelectRow label="项目" value={form.project} placeholder="请选择项目" required onClick={() => setShowPicker("project")} />
        <SelectRow label="咨询师" value={form.consultant} placeholder="请选择咨询师" onClick={() => setShowPicker("consultant")} />
        <SelectRow label="助理" value={form.assistant} placeholder="请选择助理" onClick={() => setShowPicker("assistant")} />
        <SelectRow label="诊室" value={form.room} placeholder="请选择诊室" onClick={() => setShowPicker("room")} />
        <SelectRow label="科室" value={form.department} placeholder="请选择科室" onClick={() => setShowPicker("department")} />
        <SelectRow label="预约来源" value={form.source} placeholder="请选择来源" onClick={() => setShowPicker("source")} />
      </div>

      {/* 备注 */}
      <GroupTitle icon={<FileText size={14} color={SKY_D} />} text="备注" />
      <div style={{ ...cardStyle, padding: "12px 16px" }}>
        <textarea
          value={form.remark}
          onChange={(e) => setForm((prev) => ({ ...prev, remark: e.target.value }))}
          placeholder="输入备注信息（选填）"
          rows={3}
          style={{ width: "100%", fontSize: 14, color: INK, background: "transparent", outline: "none", border: "none", resize: "none" }}
        />
      </div>

      {/* 保存按钮 —— 固定底部安全区 */}
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: "#fff", padding: "10px 16px calc(10px + env(safe-area-inset-bottom))", borderTop: `1px solid ${LINE}`, maxWidth: 480, margin: "0 auto" }}>
        <button
          onClick={handleSave}
          disabled={submitting}
          style={{ width: "100%", padding: "13px 0", textAlign: "center", fontSize: 15, color: "#fff", fontWeight: 600, background: submitting ? GRAY_L : `linear-gradient(90deg, ${SKY_D}, ${SKY})`, border: "none", borderRadius: 12, cursor: submitting ? "default" : "pointer", boxShadow: `0 4px 12px rgba(30,136,214,.28)` }}
        >
          {submitting ? "保存中..." : "保存预约"}
        </button>
      </div>

      {/* 选项 Picker 弹窗 */}
      {showPicker && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div style={{ flex: 1, background: "rgba(38,48,60,.35)" }} onClick={() => { setShowPicker(null); setDocSearch(""); }} />
          <div style={{ background: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "64vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${LINE}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <button style={{ fontSize: 14, color: GRAY_L, background: "transparent", border: "none", cursor: "pointer" }} onClick={() => { setShowPicker(null); setDocSearch(""); }}>取消</button>
              <span style={{ fontSize: 15, fontWeight: 600, color: INK }}>{getPickerTitle()}</span>
              <div style={{ width: 32 }} />
            </div>
            {/* 医生列表加搜索框 */}
            {showPicker === "doctor" && (
              <div style={{ padding: "10px 16px 4px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: BG, borderRadius: 10, padding: "8px 12px" }}>
                  <Search size={16} color={GRAY_L} />
                  <input
                    value={docSearch}
                    onChange={(e) => setDocSearch(e.target.value)}
                    placeholder="搜索医生姓名"
                    style={{ flex: 1, fontSize: 14, color: INK, background: "transparent", outline: "none", border: "none" }}
                  />
                </div>
              </div>
            )}
            <div style={{ overflowY: "auto" }}>
              {pickerOptions.length === 0 && (
                <div style={{ textAlign: "center", padding: "28px 0", color: GRAY_L, fontSize: 13 }}>无匹配结果</div>
              )}
              {pickerOptions.map((option) => {
                const selected = form[showPicker as keyof FormData] === option;
                return (
                  <button
                    key={option}
                    onClick={() => handlePickerSelect(showPicker, option)}
                    style={{ width: "100%", padding: "0 16px", minHeight: 52, display: "flex", alignItems: "center", justifyContent: "space-between", textAlign: "left", fontSize: 15, borderBottom: `1px solid ${LINE}`, background: selected ? SKY_L : "#fff", color: selected ? SKY_D : INK, fontWeight: selected ? 600 : 400, border: "none", cursor: "pointer" }}
                  >
                    <span>{option}</span>
                    {selected && <Check size={18} color={SKY_D} />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 预约时段弹层 —— 同一弹层内切 「开始 / 结束」 Tab，一次定完整时段 */}
      {showTimeSheet && (() => {
        const curH = timeTab === "start" ? tmpStartH : tmpEndH;
        const curM = timeTab === "start" ? tmpStartM : tmpEndM;
        const setH = (h: string) => (timeTab === "start" ? setTmpStartH(h) : setTmpEndH(h));
        const setM = (m: string) => (timeTab === "start" ? setTmpStartM(m) : setTmpEndM(m));
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            <div style={{ flex: 1, background: "rgba(38,48,60,.35)" }} onClick={() => setShowTimeSheet(false)} />
            <div style={{ background: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: "hidden" }}>
              {/* 顶部：取消 / 标题 / 确定 */}
              <div style={{ padding: "14px 16px", borderBottom: `1px solid ${LINE}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <button style={{ fontSize: 14, color: GRAY_L, background: "transparent", border: "none", cursor: "pointer" }} onClick={() => setShowTimeSheet(false)}>取消</button>
                <span style={{ fontSize: 15, fontWeight: 600, color: INK }}>预约时段</span>
                <button style={{ fontSize: 14, color: SKY_D, fontWeight: 600, background: "transparent", border: "none", cursor: "pointer" }} onClick={confirmTimeSheet}>确定</button>
              </div>
              {/* 开始 / 结束 切换（同时展示当前选值） */}
              <div style={{ display: "flex", padding: "12px 16px 4px", gap: 10 }}>
                {(["start", "end"] as const).map((tab) => {
                  const active = timeTab === tab;
                  const val = tab === "start" ? `${tmpStartH}:${tmpStartM}` : `${tmpEndH}:${tmpEndM}`;
                  return (
                    <div
                      key={tab}
                      onClick={() => setTimeTab(tab)}
                      style={{ flex: 1, padding: "10px 0", borderRadius: 10, textAlign: "center", cursor: "pointer", background: active ? SKY_L : BG, border: active ? `1px solid ${SKY_D}` : `1px solid ${BORDER}` }}
                    >
                      <div style={{ fontSize: 12, color: active ? SKY_D : GRAY }}>{tab === "start" ? "开始时间" : "结束时间"}</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: active ? SKY_D : INK, marginTop: 2 }}>{val}</div>
                    </div>
                  );
                })}
              </div>
              {/* 小时 + 分钟 滚轮（作用于当前 Tab） */}
              <div style={{ display: "flex", padding: "4px 0 16px" }}>
                <div style={{ flex: 1, height: 200, overflowY: "auto", borderRight: `1px solid ${LINE}` }}>
                  {HOURS.map((h) => (
                    <div
                      key={h}
                      onClick={() => setH(h)}
                      style={{ textAlign: "center", padding: "12px 0", fontSize: 18, cursor: "pointer", color: curH === h ? SKY_D : GRAY, fontWeight: curH === h ? 700 : 400, background: curH === h ? SKY_L : "transparent" }}
                    >
                      {h} 时
                    </div>
                  ))}
                </div>
                <div style={{ flex: 1, height: 200, overflowY: "auto" }}>
                  {MINUTES.map((m) => (
                    <div
                      key={m}
                      onClick={() => setM(m)}
                      style={{ textAlign: "center", padding: "12px 0", fontSize: 18, cursor: "pointer", color: curM === m ? SKY_D : GRAY, fontWeight: curM === m ? 700 : 400, background: curM === m ? SKY_L : "transparent" }}
                    >
                      {m} 分
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
