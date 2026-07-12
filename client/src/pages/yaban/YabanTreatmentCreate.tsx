/**
 * 牙伴齿科管理 - 新建 / 编辑 / 查看诊疗记录
 * 路由：
 *   /yaban/patient/:id/treatment/create   — 新建
 *   /yaban/patient/:id/treatment/:tid     — 查看/编辑
 * 功能：主诉、诊断、治疗方案、治疗备注、牙位选择、下次复诊计划、医生/助手/科室/诊室。
 * 移动端优先，蓝白风格，严禁 Emoji，图标统一用 lucide-react。
 */
import React, { useState, useEffect, useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { useYabanClinic } from "./useYabanClinic";
import { useSmartBack } from "@/hooks/useSmartBack";
import { toast } from "sonner";
import ToothPicker, { parseTeeth, serializeTeeth } from "./ToothPicker";
import {
  ChevronLeft,
  Save,
  Stethoscope,
  FileText,
  Loader2,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const ACCENT = "#1E88D6";
const ACCENT_D = "#1565C0";

// 牙位状态标签（常见口腔诊断条件）
const TOOTH_CONDITIONS = [
  { code: "caries", label: "龋齿" },
  { code: "pulpitis", label: "牙髓炎" },
  { code: "periapical", label: "根尖炎" },
  { code: "periodontitis", label: "牙周炎" },
  { code: "fracture", label: "牙折" },
  { code: "missing", label: "缺失" },
  { code: "implant", label: "种植体" },
  { code: "crown", label: "冠修复" },
  { code: "filling", label: "充填体" },
  { code: "other", label: "其他" },
];

// 常见治疗项目
const COMMON_TREATMENTS = [
  "龋齿充填",
  "根管治疗",
  "牙周洁治",
  "牙周刮治",
  "拔牙",
  "种植手术",
  "冠修复",
  "贴面修复",
  "正畸复诊",
  "洁牙",
  "脱敏治疗",
  "口腔检查",
];

interface ToothEntry {
  toothNo: string;
  conditionCode: string;
  conditionLabel: string;
  treatmentItem: string;
  note: string;
}

interface TreatmentForm {
  visitAt: string;
  doctor: string;
  assistant: string;
  dept: string;
  room: string;
  chiefComplaint: string;
  diagnosis: string;
  treatmentPlan: string;
  treatmentNote: string;
  nextVisitPlan: string;
  status: "completed" | "ongoing" | "cancelled";
  teeth: ToothEntry[];
}

function nowDatetimeLocal(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function datetimeLocalToSQL(val: string): string {
  return val.replace("T", " ") + ":00";
}

const EMPTY_FORM: TreatmentForm = {
  visitAt: nowDatetimeLocal(),
  doctor: "",
  assistant: "",
  dept: "",
  room: "",
  chiefComplaint: "",
  diagnosis: "",
  treatmentPlan: "",
  treatmentNote: "",
  nextVisitPlan: "",
  status: "completed",
  teeth: [],
};

export default function YabanTreatmentCreate() {
  const [, navigate] = useLocation();
  // 路由匹配：新建 or 编辑/查看
  const [, createParams] = useRoute("/yaban/patient/:id/treatment/create");
  const [, editParams] = useRoute("/yaban/patient/:id/treatment/:tid");

  const customerId = Number(createParams?.id || editParams?.id || 0);
  const treatmentId = editParams?.tid && editParams.tid !== "create" ? Number(editParams.tid) : null;
  const isEdit = treatmentId != null;

  const { current, currentTenantId } = useYabanClinic();
  const clinicName = current?.name?.trim() || current?.shortName?.trim() || "";
  const goBack = useSmartBack(`/yaban/patient/${customerId}/treatment`);

  const [form, setForm] = useState<TreatmentForm>({ ...EMPTY_FORM });
  const [readOnly, setReadOnly] = useState(isEdit); // 查看模式 vs 编辑模式
  const [showToothPicker, setShowToothPicker] = useState(false);
  const [showTeethSection, setShowTeethSection] = useState(true);

  // 加载详情（编辑模式）
  const detailQuery = trpc.yabanTreatment.detail.useQuery(
    { id: treatmentId! },
    { enabled: isEdit, refetchOnWindowFocus: false }
  );

  useEffect(() => {
    if (!detailQuery.data) return;
    const d = detailQuery.data as any;
    const formatDt = (val: any) => {
      if (!val) return nowDatetimeLocal();
      const s = String(val).slice(0, 16).replace(" ", "T");
      return s;
    };
    setForm({
      visitAt: formatDt(d.visit_at),
      doctor: d.doctor || "",
      assistant: d.assistant || "",
      dept: d.dept || "",
      room: d.room || "",
      chiefComplaint: d.chief_complaint || "",
      diagnosis: d.diagnosis || "",
      treatmentPlan: d.treatment_plan || "",
      treatmentNote: d.treatment_note || "",
      nextVisitPlan: d.next_visit_plan || "",
      status: d.status || "completed",
      teeth: (d.teeth || []).map((t: any) => ({
        toothNo: t.tooth_no || "",
        conditionCode: t.condition_code || "",
        conditionLabel: t.condition_label || "",
        treatmentItem: t.treatment_item || "",
        note: t.note || "",
      })),
    });
  }, [detailQuery.data]);

  // 医生/助手列表
  const { data: membersData = [] } = trpc.yabanAppointment.listMembers.useQuery(
    { tenantId: currentTenantId ?? undefined },
    { refetchOnWindowFocus: false }
  );
  const doctors = useMemo(
    () =>
      (membersData as any[])
        .filter((m: any) => (m.roleKeys || []).includes("doctor") || m.roleKey === "doctor")
        .map((m: any) => m.name)
        .filter(Boolean),
    [membersData]
  );
  const assistants = useMemo(
    () =>
      (membersData as any[])
        .filter((m: any) => (m.roleKeys || []).includes("assistant") || m.roleKey === "assistant")
        .map((m: any) => m.name)
        .filter(Boolean),
    [membersData]
  );

  // 科室/诊室列表
  const { data: deptsData = [] } = trpc.yabanDept.list.useQuery(
    { tenantId: currentTenantId ?? undefined },
    { refetchOnWindowFocus: false }
  );
  const { data: roomsData = [] } = trpc.yabanRoom.list.useQuery(
    { tenantId: currentTenantId ?? undefined },
    { refetchOnWindowFocus: false }
  );

  const utils = trpc.useUtils();

  const createMutation = trpc.yabanTreatment.create.useMutation({
    onSuccess: (data) => {
      toast.success(`诊疗记录已保存，单号：${data.treatmentNo}`);
      utils.yabanTreatment.list.invalidate({ customerId });
      navigate(`/yaban/patient/${customerId}/treatment`);
    },
    onError: (err) => toast.error(err.message || "保存失败"),
  });

  const updateMutation = trpc.yabanTreatment.update.useMutation({
    onSuccess: () => {
      toast.success("诊疗记录已更新");
      utils.yabanTreatment.list.invalidate({ customerId });
      utils.yabanTreatment.detail.invalidate({ id: treatmentId! });
      setReadOnly(true);
    },
    onError: (err) => toast.error(err.message || "更新失败"),
  });

  const deleteMutation = trpc.yabanTreatment.delete.useMutation({
    onSuccess: () => {
      toast.success("诊疗记录已删除");
      utils.yabanTreatment.list.invalidate({ customerId });
      navigate(`/yaban/patient/${customerId}/treatment`);
    },
    onError: (err) => toast.error(err.message || "删除失败"),
  });

  const submitting = createMutation.isPending || updateMutation.isPending;

  function handleSave() {
    if (!form.visitAt) {
      toast.error("请填写就诊时间");
      return;
    }
    const payload = {
      customerId,
      tenantId: currentTenantId ?? undefined,
      visitAt: datetimeLocalToSQL(form.visitAt),
      doctor: form.doctor || undefined,
      assistant: form.assistant || undefined,
      dept: form.dept || undefined,
      room: form.room || undefined,
      chiefComplaint: form.chiefComplaint || undefined,
      diagnosis: form.diagnosis || undefined,
      treatmentPlan: form.treatmentPlan || undefined,
      treatmentNote: form.treatmentNote || undefined,
      nextVisitPlan: form.nextVisitPlan || undefined,
      status: form.status,
      teeth: form.teeth.filter((t) => t.toothNo).map((t) => ({
        toothNo: t.toothNo,
        conditionCode: t.conditionCode || undefined,
        conditionLabel: t.conditionLabel || undefined,
        treatmentItem: t.treatmentItem || undefined,
        note: t.note || undefined,
      })),
    };
    if (isEdit && treatmentId) {
      updateMutation.mutate({ id: treatmentId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function handleDelete() {
    if (!treatmentId) return;
    if (!confirm("确认删除此诊疗记录？此操作不可撤销。")) return;
    deleteMutation.mutate({ id: treatmentId });
  }

  // 牙位选择确认：将选中牙位合并到 teeth 列表
  function handleToothConfirm(toothCode: string) {
    const selected = parseTeeth(toothCode);
    setForm((prev) => {
      const existingNos = new Set(prev.teeth.map((t) => t.toothNo));
      const newEntries: ToothEntry[] = selected
        .filter((no) => !existingNos.has(no))
        .map((no) => ({
          toothNo: no,
          conditionCode: "",
          conditionLabel: "",
          treatmentItem: "",
          note: "",
        }));
      return { ...prev, teeth: [...prev.teeth, ...newEntries] };
    });
    setShowToothPicker(false);
  }

  function updateTooth(idx: number, field: keyof ToothEntry, value: string) {
    setForm((prev) => {
      const teeth = [...prev.teeth];
      teeth[idx] = { ...teeth[idx], [field]: value };
      // 同步 conditionLabel
      if (field === "conditionCode") {
        const found = TOOTH_CONDITIONS.find((c) => c.code === value);
        teeth[idx].conditionLabel = found?.label || value;
      }
      return { ...prev, teeth };
    });
  }

  function removeTooth(idx: number) {
    setForm((prev) => ({ ...prev, teeth: prev.teeth.filter((_, i) => i !== idx) }));
  }

  const set = <K extends keyof TreatmentForm>(k: K, v: TreatmentForm[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  if (isEdit && detailQuery.isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-sky-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col pb-6">
      {/* 顶部导航 */}
      <div className="bg-gradient-to-r from-sky-500 to-sky-400 text-white sticky top-0 z-20">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={goBack} className="p-1" aria-label="返回">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex flex-col items-center">
            <span className="text-lg font-bold leading-tight">
              {isEdit ? (readOnly ? "诊疗详情" : "编辑诊疗") : "新建诊疗"}
            </span>
            {clinicName && (
              <span className="text-[11px] font-normal text-white/80 leading-tight mt-0.5">
                {clinicName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {isEdit && readOnly && (
              <>
                <button onClick={() => setReadOnly(false)} className="p-1" aria-label="编辑">
                  <Pencil className="w-5 h-5" />
                </button>
                <button onClick={handleDelete} className="p-1" aria-label="删除">
                  <Trash2 className="w-5 h-5" />
                </button>
              </>
            )}
            {!readOnly && (
              <button onClick={handleSave} disabled={submitting} className="p-1" aria-label="保存">
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              </button>
            )}
            {isEdit && !readOnly && (
              <button onClick={() => setReadOnly(true)} className="p-1 ml-1" aria-label="取消编辑">
                <ChevronLeft className="w-5 h-5 rotate-90" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-lg w-full mx-auto px-4 py-4 space-y-3">
        {/* 基本信息 */}
        <Section title="基本信息" icon={<Calendar className="w-4 h-4" />}>
          <Row label="就诊时间" required>
            {readOnly ? (
              <span className="text-[15px] text-gray-800">{form.visitAt.replace("T", " ")}</span>
            ) : (
              <input
                type="datetime-local"
                value={form.visitAt}
                onChange={(e) => set("visitAt", e.target.value)}
                className="form-input"
              />
            )}
          </Row>
          <Row label="状态">
            {readOnly ? (
              <span className="text-[15px] text-gray-800">
                {form.status === "completed" ? "已完成" : form.status === "ongoing" ? "进行中" : "已取消"}
              </span>
            ) : (
              <div className="flex gap-2">
                {(["completed", "ongoing", "cancelled"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => set("status", s)}
                    className="px-3 py-1.5 rounded-md text-[13px] transition-colors"
                    style={
                      form.status === s
                        ? { background: ACCENT, color: "#fff" }
                        : { background: "#F1F5F9", color: "#64748B" }
                    }
                  >
                    {s === "completed" ? "已完成" : s === "ongoing" ? "进行中" : "已取消"}
                  </button>
                ))}
              </div>
            )}
          </Row>
          <Row label="主治医生">
            {readOnly ? (
              <span className="text-[15px] text-gray-800">{form.doctor || "-"}</span>
            ) : (
              <div className="flex flex-col gap-1.5">
                <input
                  list="doctor-list"
                  value={form.doctor}
                  onChange={(e) => set("doctor", e.target.value)}
                  placeholder="请输入或选择医生"
                  className="form-input"
                />
                <datalist id="doctor-list">
                  {doctors.map((d) => <option key={d} value={d} />)}
                </datalist>
              </div>
            )}
          </Row>
          <Row label="助手">
            {readOnly ? (
              <span className="text-[15px] text-gray-800">{form.assistant || "-"}</span>
            ) : (
              <div className="flex flex-col gap-1.5">
                <input
                  list="assistant-list"
                  value={form.assistant}
                  onChange={(e) => set("assistant", e.target.value)}
                  placeholder="请输入或选择助手"
                  className="form-input"
                />
                <datalist id="assistant-list">
                  {assistants.map((a) => <option key={a} value={a} />)}
                </datalist>
              </div>
            )}
          </Row>
          <Row label="科室">
            {readOnly ? (
              <span className="text-[15px] text-gray-800">{form.dept || "-"}</span>
            ) : (
              <select
                value={form.dept}
                onChange={(e) => set("dept", e.target.value)}
                className="form-input"
              >
                <option value="">请选择科室</option>
                {(deptsData as any[]).map((d: any) => (
                  <option key={d.id} value={d.name}>{d.name}</option>
                ))}
              </select>
            )}
          </Row>
          <Row label="诊室" last>
            {readOnly ? (
              <span className="text-[15px] text-gray-800">{form.room || "-"}</span>
            ) : (
              <select
                value={form.room}
                onChange={(e) => set("room", e.target.value)}
                className="form-input"
              >
                <option value="">请选择诊室</option>
                {(roomsData as any[]).map((r: any) => (
                  <option key={r.id} value={r.name}>{r.name}</option>
                ))}
              </select>
            )}
          </Row>
        </Section>

        {/* 主诉与诊断 */}
        <Section title="主诉与诊断" icon={<Stethoscope className="w-4 h-4" />}>
          <Row label="主诉">
            {readOnly ? (
              <p className="text-[15px] text-gray-800 whitespace-pre-wrap">{form.chiefComplaint || "-"}</p>
            ) : (
              <textarea
                value={form.chiefComplaint}
                onChange={(e) => set("chiefComplaint", e.target.value)}
                placeholder="患者主要不适症状，如：左上后牙疼痛3天"
                rows={3}
                className="form-input resize-none"
              />
            )}
          </Row>
          <Row label="诊断" last>
            {readOnly ? (
              <p className="text-[15px] text-gray-800 whitespace-pre-wrap">{form.diagnosis || "-"}</p>
            ) : (
              <textarea
                value={form.diagnosis}
                onChange={(e) => set("diagnosis", e.target.value)}
                placeholder="临床诊断，如：26 急性牙髓炎"
                rows={3}
                className="form-input resize-none"
              />
            )}
          </Row>
        </Section>

        {/* 牙位记录 */}
        <div className="bg-white rounded-md border border-gray-100 overflow-hidden">
          <button
            className="w-full px-4 pt-3 pb-2 flex items-center justify-between"
            onClick={() => setShowTeethSection((v) => !v)}
          >
            <div className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: ACCENT }}>
              <span>牙位记录</span>
              {form.teeth.length > 0 && (
                <span className="text-[11px] bg-sky-50 text-sky-600 px-1.5 py-0.5 rounded">
                  {form.teeth.length} 颗
                </span>
              )}
            </div>
            {showTeethSection ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>
          {showTeethSection && (
            <div className="px-4 pb-4">
              {/* 牙位列表 */}
              {form.teeth.length > 0 && (
                <div className="space-y-2 mb-3">
                  {form.teeth.map((t, idx) => (
                    <div key={idx} className="bg-gray-50 rounded-md p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span
                          className="text-[13px] font-semibold px-2 py-0.5 rounded text-white"
                          style={{ background: ACCENT }}
                        >
                          {t.toothNo}
                        </span>
                        {!readOnly && (
                          <button
                            onClick={() => removeTooth(idx)}
                            className="text-gray-400 hover:text-red-400"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      {readOnly ? (
                        <div className="text-[13px] text-gray-600 space-y-0.5">
                          {t.conditionLabel && <div>诊断：{t.conditionLabel}</div>}
                          {t.treatmentItem && <div>治疗：{t.treatmentItem}</div>}
                          {t.note && <div>备注：{t.note}</div>}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div>
                            <div className="text-[11px] text-gray-400 mb-1">牙位状态</div>
                            <div className="flex flex-wrap gap-1.5">
                              {TOOTH_CONDITIONS.map((c) => (
                                <button
                                  key={c.code}
                                  onClick={() => updateTooth(idx, "conditionCode", c.code)}
                                  className="px-2.5 py-1 rounded text-[12px] transition-colors"
                                  style={
                                    t.conditionCode === c.code
                                      ? { background: ACCENT, color: "#fff" }
                                      : { background: "#F1F5F9", color: "#64748B" }
                                  }
                                >
                                  {c.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] text-gray-400 mb-1">治疗项目</div>
                            <div className="flex flex-wrap gap-1.5 mb-1.5">
                              {COMMON_TREATMENTS.map((item) => (
                                <button
                                  key={item}
                                  onClick={() => updateTooth(idx, "treatmentItem", item)}
                                  className="px-2.5 py-1 rounded text-[12px] transition-colors"
                                  style={
                                    t.treatmentItem === item
                                      ? { background: ACCENT_D, color: "#fff" }
                                      : { background: "#F1F5F9", color: "#64748B" }
                                  }
                                >
                                  {item}
                                </button>
                              ))}
                            </div>
                            <input
                              value={t.treatmentItem}
                              onChange={(e) => updateTooth(idx, "treatmentItem", e.target.value)}
                              placeholder="或手动输入治疗项目"
                              className="form-input text-[13px]"
                            />
                          </div>
                          <div>
                            <div className="text-[11px] text-gray-400 mb-1">备注</div>
                            <input
                              value={t.note}
                              onChange={(e) => updateTooth(idx, "note", e.target.value)}
                              placeholder="如：已开髓引流，下次根充"
                              className="form-input text-[13px]"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {/* 添加牙位按钮 */}
              {!readOnly && (
                <button
                  onClick={() => setShowToothPicker(true)}
                  className="w-full py-2.5 rounded-md border border-dashed border-sky-300 text-sky-500 text-[13px] flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  选择牙位
                </button>
              )}
              {readOnly && form.teeth.length === 0 && (
                <p className="text-[13px] text-gray-400 text-center py-2">暂无牙位记录</p>
              )}
            </div>
          )}
        </div>

        {/* 治疗方案与备注 */}
        <Section title="治疗方案" icon={<FileText className="w-4 h-4" />}>
          <Row label="治疗方案">
            {readOnly ? (
              <p className="text-[15px] text-gray-800 whitespace-pre-wrap">{form.treatmentPlan || "-"}</p>
            ) : (
              <textarea
                value={form.treatmentPlan}
                onChange={(e) => set("treatmentPlan", e.target.value)}
                placeholder="本次治疗方案说明"
                rows={3}
                className="form-input resize-none"
              />
            )}
          </Row>
          <Row label="治疗备注">
            {readOnly ? (
              <p className="text-[15px] text-gray-800 whitespace-pre-wrap">{form.treatmentNote || "-"}</p>
            ) : (
              <textarea
                value={form.treatmentNote}
                onChange={(e) => set("treatmentNote", e.target.value)}
                placeholder="治疗过程中的注意事项、特殊情况等"
                rows={3}
                className="form-input resize-none"
              />
            )}
          </Row>
          <Row label="下次复诊计划" last>
            {readOnly ? (
              <p className="text-[15px] text-gray-800 whitespace-pre-wrap">{form.nextVisitPlan || "-"}</p>
            ) : (
              <input
                value={form.nextVisitPlan}
                onChange={(e) => set("nextVisitPlan", e.target.value)}
                placeholder="如：2周后复诊，根管充填"
                className="form-input"
              />
            )}
          </Row>
        </Section>

        {/* 保存按钮（非只读模式） */}
        {!readOnly && (
          <button
            onClick={handleSave}
            disabled={submitting}
            className="w-full py-3 rounded-md text-white text-[16px] font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60"
            style={{ background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT_D} 100%)` }}
          >
            {submitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Save className="w-5 h-5" />
            )}
            {submitting ? "保存中..." : isEdit ? "保存修改" : "保存诊疗记录"}
          </button>
        )}
      </div>

      {/* 牙位选择器弹窗 */}
      <ToothPicker
        open={showToothPicker}
        value={serializeTeeth(form.teeth.map((t) => t.toothNo))}
        onClose={() => setShowToothPicker(false)}
        onConfirm={handleToothConfirm}
      />

      <style>{`
        .form-input {
          width: 100%;
          background: transparent;
          outline: none;
          font-size: 15px;
          color: #1f2937;
        }
        .form-input::placeholder { color: #cbd5e1; }
      `}</style>
    </div>
  );
}

// ============ 子组件 ============
function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-md border border-gray-100 overflow-hidden">
      <div className="px-4 pt-3 pb-1 flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: ACCENT }}>
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({
  label,
  children,
  required,
  last,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  last?: boolean;
}) {
  return (
    <div className={`px-4 py-3 ${last ? "" : "border-b border-gray-100"}`}>
      <div className="text-[12px] text-gray-400 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </div>
      {children}
    </div>
  );
}

// Plus icon（lucide 没有直接导出，用内联）
function Plus({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
