/**
 * 牙伴齿科管理 - 诊所排班页
 * 路由：/yaban/clinic-shift
 * 功能：按周查看医生排班，支持调班/请假
 * 数据来源：真实 API（yabanShift.weekSchedule / yabanShift.saveOverride）
 */
import { useState } from "react";
import { PageTag } from "@/components/PageTag";
import { useLocation } from "wouter";
import { ChevronLeft, ChevronRight, Plus, X, Check } from "lucide-react";
import { trpc } from "@/lib/trpc";

const WEEK_DAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

// 班次类型（用于调班弹窗）
const SHIFT_OVERRIDE_TYPES = [
  { key: "normal",    label: "正常上班", color: "bg-sky-100 text-sky-700 border-sky-200" },
  { key: "overtime",  label: "加班",     color: "bg-amber-100 text-amber-700 border-amber-200" },
  { key: "halfday",   label: "半天班",   color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  { key: "off",       label: "休息",     color: "bg-gray-100 text-gray-400 border-gray-200" },
  { key: "leave",     label: "请假",     color: "bg-red-100 text-red-500 border-red-200" },
];

// 角色中文名
const ROLE_LABELS: Record<string, string> = {
  owner: "院长", doctor: "医生", nurse: "护士",
  assistant: "助理", receptionist: "前台", finance: "财务",
};

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
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function YabanClinicShift() {
  const [, setLocation] = useLocation();
  const [weekOffset, setWeekOffset] = useState(0);
  const [editModal, setEditModal] = useState<{
    staffUserId: number;
    staffName: string;
    date: string;
    currentOverride: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const weekStart = getWeekStart(weekOffset);
  const weekDates = getWeekDates(weekStart);
  const weekStartStr = toDateStr(weekStart);

  const utils = trpc.useUtils();

  // 获取本周排班数据（模板 + 单日覆盖）
  const { data: weekData, isLoading } = trpc.yabanShift.weekSchedule.useQuery({
    weekStart: weekStartStr,
  });

  // 保存单日覆盖（调班/请假）
  const saveOverride = trpc.yabanShift.saveOverride.useMutation({
    onSuccess: () => {
      utils.yabanShift.weekSchedule.invalidate();
      setEditModal(null);
      setSaving(false);
    },
    onError: () => setSaving(false),
  });

  const templates = weekData?.templates || [];
  const overrides = weekData?.overrides || [];

  // 查找某员工某天的覆盖记录
  const getOverride = (staffUserId: number, date: string) =>
    overrides.find((o: any) => o.staffUserId === staffUserId && o.overrideDate === date);

  // 判断某员工某天是否正常上班（根据模板 workDays）
  const isWorkDay = (tpl: any, date: Date) => {
    const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay(); // 1=周一 7=周日
    return tpl.workDays.includes(dayOfWeek);
  };

  const handleEditShift = (staffUserId: number, staffName: string, date: string, currentOverride: string) => {
    setEditModal({ staffUserId, staffName, date, currentOverride });
  };

  const handleSaveOverride = (shiftType: string) => {
    if (!editModal || saving) return;
    setSaving(true);
    saveOverride.mutate({
      staffUserId: editModal.staffUserId,
      overrideDate: editModal.date,
      shiftType,
    });
  };

  const today = new Date();
  const isCurrentWeek = weekOffset === 0;

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* 顶部 */}
      <div className="bg-white px-4 pt-10 pb-3 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setLocation("/yaban")} className="p-1 -ml-1">
            <ChevronLeft size={22} className="text-gray-600" />
          </button>
          <span className="text-base font-semibold text-gray-800">诊所排班</span>
          <div className="w-8" />
        </div>

        {/* 周切换 */}
        <div className="flex items-center justify-between">
          <button onClick={() => setWeekOffset(p => p - 1)} className="p-1.5 rounded-lg bg-gray-100">
            <ChevronLeft size={16} className="text-gray-600" />
          </button>
          <div className="text-center">
            <div className="text-sm font-medium text-gray-800">
              {weekDates[0].getMonth() + 1}月{weekDates[0].getDate()}日 – {weekDates[6].getMonth() + 1}月{weekDates[6].getDate()}日
            </div>
            {isCurrentWeek && <div className="text-[10px] text-sky-500 mt-0.5">本周</div>}
          </div>
          <button onClick={() => setWeekOffset(p => p + 1)} className="p-1.5 rounded-lg bg-gray-100">
            <ChevronRight size={16} className="text-gray-600" />
          </button>
        </div>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-gray-400 text-sm">加载中...</div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <div className="text-4xl mb-3">👨‍⚕️</div>
            <span className="text-sm">暂无员工排班数据</span>
            <span className="text-xs mt-1 text-gray-300">请先在员工档案中配置班次模板</span>
          </div>
        ) : (
          <div className="px-3 py-3">
            {/* 日期表头 */}
            <div className="flex mb-2">
              <div className="w-16 flex-shrink-0" />
              {weekDates.map((d, i) => {
                const isToday =
                  d.getFullYear() === today.getFullYear() &&
                  d.getMonth() === today.getMonth() &&
                  d.getDate() === today.getDate();
                return (
                  <div key={i} className={`flex-1 text-center py-1 rounded-lg mx-0.5 ${isToday ? "bg-sky-500" : "bg-white"}`}>
                    <div className={`text-[9px] ${isToday ? "text-sky-100" : "text-gray-400"}`}>{WEEK_DAYS[i]}</div>
                    <div className={`text-xs font-semibold ${isToday ? "text-white" : "text-gray-700"}`}>{d.getDate()}</div>
                  </div>
                );
              })}
            </div>

            {/* 员工行 */}
            <div className="space-y-2">
              {templates.map((tpl: any) => (
                <div key={tpl.staffUserId} className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <div className="flex items-center">
                    {/* 员工名 */}
                    <div className="w-16 flex-shrink-0 px-2 py-3 border-r border-gray-100">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center mx-auto mb-1"
                        style={{ backgroundColor: (tpl.color || "#1E88D6") + "20" }}
                      >
                        <span className="text-xs font-medium" style={{ color: tpl.color || "#1E88D6" }}>
                          {tpl.staffName?.slice(-1) || "?"}
                        </span>
                      </div>
                      <div className="text-[9px] text-gray-600 text-center truncate">{tpl.staffName}</div>
                      <div className="text-[8px] text-gray-400 text-center">{ROLE_LABELS[tpl.roleKey] || tpl.roleKey}</div>
                    </div>

                    {/* 班次格子 */}
                    <div className="flex flex-1">
                      {weekDates.map((d, i) => {
                        const dateStr = toDateStr(d);
                        const override = getOverride(tpl.staffUserId, dateStr);
                        const workDay = isWorkDay(tpl, d);

                        let cellLabel = "";
                        let cellSub = "";
                        let cellClass = "bg-gray-50 border-dashed border-gray-200";

                        if (override) {
                          const ot = SHIFT_OVERRIDE_TYPES.find(t => t.key === override.shiftType);
                          cellLabel = ot?.label || override.shiftType;
                          cellClass = ot?.color || "bg-gray-100 text-gray-500 border-gray-200";
                          if (override.workStart) cellSub = override.workStart;
                        } else if (workDay) {
                          cellLabel = "上班";
                          cellSub = tpl.workStart;
                          cellClass = "bg-sky-50 text-sky-700 border-sky-200";
                        } else {
                          cellLabel = "休";
                          cellClass = "bg-gray-100 text-gray-400 border-gray-200";
                        }

                        return (
                          <button
                            key={i}
                            className={`flex-1 mx-0.5 my-1.5 rounded-md border text-center py-1.5 min-h-[44px] flex flex-col items-center justify-center active:opacity-70 ${cellClass}`}
                            onClick={() => handleEditShift(tpl.staffUserId, tpl.staffName, dateStr, override?.shiftType || (workDay ? "normal" : "off"))}
                          >
                            <span className="text-[9px] font-medium leading-tight">{cellLabel}</span>
                            {cellSub && <span className="text-[8px] opacity-70 leading-tight mt-0.5">{cellSub}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* 图例 */}
            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              {SHIFT_OVERRIDE_TYPES.map(t => (
                <div key={t.key} className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] ${t.color}`}>
                  <span>{t.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 调班弹窗 */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div className="flex-1 h-full bg-black/30" onClick={() => setEditModal(null)} />
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-xl">
            <div className="px-4 pt-4 pb-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-gray-800">
                  {editModal.staffName} · {editModal.date.slice(5).replace("-", "月")}日
                </span>
                <button onClick={() => setEditModal(null)}>
                  <X size={18} className="text-gray-400" />
                </button>
              </div>
              <span className="text-xs text-gray-400">选择班次（点击保存覆盖）</span>
            </div>
            <div className="px-4 pb-6 grid grid-cols-2 gap-2 mt-2">
              {SHIFT_OVERRIDE_TYPES.map(t => (
                <button
                  key={t.key}
                  className={`flex items-center justify-between px-3 py-3 rounded-xl border ${t.color} active:opacity-70`}
                  onClick={() => handleSaveOverride(t.key)}
                  disabled={saving}
                >
                  <div className="text-left">
                    <div className="text-sm font-medium">{t.label}</div>
                  </div>
                  {editModal.currentOverride === t.key && (
                    <Check size={16} className="flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <PageTag code="P324" />
    </div>
  );
}
