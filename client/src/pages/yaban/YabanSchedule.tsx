/**
 * 牙伴齿科管理 - 日程/预约列表页
 * 路由：/yaban/schedule
 * 数据来源：真实 API（yabanAppointment.listByDate + monthStats）
 * 已删除全部模拟数据
 */
import { useState, useRef, TouchEvent } from "react";
import { PageTag } from "@/components/PageTag";
import { useLocation } from "wouter";
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Plus, SlidersHorizontal, X, LayoutList,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  booked:    { label: "已预约",   color: "text-sky-600",     bg: "bg-sky-50"    },
  confirmed: { label: "已确认",   color: "text-blue-600",    bg: "bg-blue-50"   },
  consulting:{ label: "咨询中",   color: "text-purple-600",  bg: "bg-purple-50" },
  registered:{ label: "已挂号",   color: "text-indigo-600",  bg: "bg-indigo-50" },
  treating:  { label: "治疗中",   color: "text-amber-600",   bg: "bg-amber-50"  },
  treated:   { label: "治疗完成", color: "text-emerald-600", bg: "bg-emerald-50"},
  paid:      { label: "已结账",   color: "text-green-600",   bg: "bg-green-50"  },
  left:      { label: "已离开",   color: "text-green-700",   bg: "bg-green-50"  },
  missed:    { label: "失约",     color: "text-gray-500",    bg: "bg-gray-100"  },
  cancelled: { label: "已取消",   color: "text-gray-400",    bg: "bg-gray-50"   },
};

const DOCTOR_COLORS = [
  { bg: "bg-sky-100",     border: "border-sky-300",     text: "text-sky-800"     },
  { bg: "bg-emerald-100", border: "border-emerald-300", text: "text-emerald-800" },
  { bg: "bg-amber-100",   border: "border-amber-300",   text: "text-amber-800"   },
  { bg: "bg-purple-100",  border: "border-purple-300",  text: "text-purple-800"  },
  { bg: "bg-rose-100",    border: "border-rose-300",    text: "text-rose-800"    },
  { bg: "bg-indigo-100",  border: "border-indigo-300",  text: "text-indigo-800"  },
];

const STATUS_OPTIONS = [
  "全部状态","已预约","已确认","咨询中","已挂号","治疗中","治疗完成","已结账","已离开","失约",
];

function getWeekDay(date: Date) {
  return ["日","一","二","三","四","五","六"][date.getDay()];
}
function getWeekDates(base: Date): Date[] {
  const day = base.getDay();
  const mon = new Date(base);
  mon.setDate(base.getDate() - (day === 0 ? 6 : day - 1));
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d; });
}
function getMonthCalendar(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  const offset = first.getDay() === 0 ? 6 : first.getDay() - 1;
  const weeks: (Date | null)[][] = [];
  let week: (Date | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= last.getDate(); d++) {
    week.push(new Date(year, month, d));
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length) { while (week.length < 7) week.push(null); weeks.push(week); }
  return weeks;
}
function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export default function YabanSchedule() {
  const [, setLocation] = useLocation();
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState(today);
  const [calendarExpanded, setCalendarExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<"list"|"timeline">("list");
  const [showFilter, setShowFilter] = useState(false);
  const [filterDoctor, setFilterDoctor] = useState("全部医生");
  const [filterRoom, setFilterRoom] = useState("全部诊室");
  const [filterStatus, setFilterStatus] = useState("全部状态");
  const touchStartX = useRef(0);
  const [weekOffset, setWeekOffset] = useState(0);

  const baseDate = new Date(today);
  baseDate.setDate(today.getDate() + weekOffset * 7);
  const weekDates = getWeekDates(baseDate);
  const selectedDateStr = toDateStr(selectedDate);

  // 真实数据
  const { data: appointments = [], isLoading } = trpc.yabanAppointment.listByDate.useQuery({
    date: selectedDateStr,
    doctor: filterDoctor !== "全部医生" ? filterDoctor : undefined,
  });
  const { data: monthStats = {} } = trpc.yabanAppointment.monthStats.useQuery({
    year: selectedDate.getFullYear(),
    month: selectedDate.getMonth() + 1,
  });

  const doctorSet = new Set((appointments as any[]).map((a: any) => a.doctor).filter(Boolean));
  const roomSet   = new Set((appointments as any[]).map((a: any) => a.room).filter(Boolean));
  const DOCTORS = ["全部医生", ...Array.from(doctorSet) as string[]];
  const ROOMS   = ["全部诊室", ...Array.from(roomSet) as string[]];

  const filteredAppointments = (appointments as any[]).filter((a: any) => {
    if (filterRoom !== "全部诊室" && a.room !== filterRoom) return false;
    if (filterStatus !== "全部状态") {
      const entry = Object.entries(STATUS_CONFIG).find(([, v]) => v.label === filterStatus);
      if (entry && a.status !== entry[0]) return false;
    }
    return true;
  });

  const handleTouchStart = (e: TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e: TouchEvent) => {
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(diff) > 60) setWeekOffset(p => diff < 0 ? p + 1 : p - 1);
  };

  const renderTimeline = () => {
    const hours = Array.from({ length: 13 }, (_, i) => i + 8);
    const doctorMap = new Map<string, any[]>();
    filteredAppointments.forEach((a: any) => {
      const key = a.doctor || "未分配";
      if (!doctorMap.has(key)) doctorMap.set(key, []);
      doctorMap.get(key)!.push(a);
    });
    const doctorList = Array.from(doctorMap.keys());
    return (
      <div className="flex-1 overflow-auto px-2 pb-4">
        <div className="relative" style={{ minHeight: `${hours.length * 60}px` }}>
          {hours.map(h => (
            <div key={h} className="absolute left-0 w-full" style={{ top: `${(h-8)*60}px` }}>
              <div className="flex items-start">
                <span className="text-[10px] text-gray-400 w-10 text-right pr-1 -mt-1.5">{h.toString().padStart(2,"0")}:00</span>
                <div className="flex-1 border-t border-gray-100" />
              </div>
              <div className="flex items-start" style={{ marginTop: "28px" }}>
                <span className="w-10" /><div className="flex-1 border-t border-dashed border-gray-50" />
              </div>
            </div>
          ))}
          <div className="ml-11 relative">
            {doctorList.map((doctor, dIdx) => {
              const cs = DOCTOR_COLORS[dIdx % DOCTOR_COLORS.length];
              return (doctorMap.get(doctor) || []).map((a: any) => {
                const [sh, sm] = (a.appointTime || "09:00").split(":").map(Number);
                const endStr = a.endTime || `${sh+1}:${String(sm).padStart(2,"0")}`;
                const [eh, em] = endStr.split(":").map(Number);
                const top = (sh-8)*60+sm;
                const height = Math.max((eh-sh)*60+(em-sm), 30);
                const left = dIdx * (100/Math.max(doctorList.length,1));
                const width = 100/Math.max(doctorList.length,1) - 2;
                return (
                  <div key={a.id}
                    className={`absolute rounded-md border ${cs.bg} ${cs.border} p-1 overflow-hidden cursor-pointer active:opacity-80`}
                    style={{ top:`${top}px`, height:`${height}px`, left:`${left}%`, width:`${width}%` }}
                    onClick={() => setLocation(`/yaban/schedule/detail/${a.id}`)}
                  >
                    <div className={`text-[10px] font-medium ${cs.text} truncate`}>{a.patientName}</div>
                    <div className={`text-[9px] ${cs.text} opacity-70 truncate`}>{a.project}</div>
                    {height > 40 && <div className={`text-[9px] ${cs.text} opacity-60 truncate`}>{doctor}</div>}
                  </div>
                );
              });
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* 顶部 */}
      <div className="bg-white px-4 pt-10 pb-2 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setLocation("/yaban")} className="p-1 -ml-1">
            <ChevronLeft size={22} className="text-gray-600" />
          </button>
          <span className="text-base font-semibold text-gray-800">预约日程</span>
          <div className="flex items-center gap-2">
            <button
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-50 text-sky-600 text-xs font-medium border border-sky-200 active:bg-sky-100"
              onClick={() => setLocation("/yaban/clinic-shift")}
            >
              <LayoutList size={13} />排班
            </button>
            <button onClick={() => setShowFilter(true)} className="p-1">
              <SlidersHorizontal size={20} className="text-gray-600" />
            </button>
          </div>
        </div>

        {/* 周历 */}
        <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          <div className="flex items-center justify-between mb-1">
            <button onClick={() => setWeekOffset(p => p-1)} className="p-1">
              <ChevronLeft size={16} className="text-gray-400" />
            </button>
            <button className="text-xs text-gray-500 flex items-center gap-0.5"
              onClick={() => setCalendarExpanded(v => !v)}>
              {selectedDate.getFullYear()}年{selectedDate.getMonth()+1}月
              {calendarExpanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
            </button>
            <button onClick={() => setWeekOffset(p => p+1)} className="p-1">
              <ChevronRight size={16} className="text-gray-400" />
            </button>
          </div>

          {!calendarExpanded ? (
            <div className="grid grid-cols-7 gap-0.5">
              {["一","二","三","四","五","六","日"].map(d => (
                <div key={d} className="text-center text-[10px] text-gray-400 pb-0.5">{d}</div>
              ))}
              {weekDates.map((d, i) => {
                const isToday = isSameDay(d, today);
                const isSel = isSameDay(d, selectedDate);
                const cnt = ((monthStats as any)[toDateStr(d)]) || 0;
                return (
                  <button key={i}
                    className={`flex flex-col items-center py-1 rounded-lg ${isSel?"bg-sky-500":isToday?"bg-sky-50":""}`}
                    onClick={() => setSelectedDate(d)}>
                    <span className={`text-sm font-medium ${isSel?"text-white":isToday?"text-sky-600":"text-gray-700"}`}>{d.getDate()}</span>
                    <span className={`text-[9px] ${isSel?"text-sky-100":"text-gray-400"}`}>{cnt>0?cnt:""}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-7 gap-0.5 mb-1">
                {["一","二","三","四","五","六","日"].map(d => (
                  <div key={d} className="text-center text-[10px] text-gray-400">{d}</div>
                ))}
              </div>
              {getMonthCalendar(selectedDate.getFullYear(), selectedDate.getMonth()).map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 gap-0.5">
                  {week.map((d, di) => {
                    if (!d) return <div key={di}/>;
                    const isToday = isSameDay(d, today);
                    const isSel = isSameDay(d, selectedDate);
                    const cnt = ((monthStats as any)[toDateStr(d)]) || 0;
                    return (
                      <button key={di}
                        className={`flex flex-col items-center py-1 rounded-lg ${isSel?"bg-sky-500":isToday?"bg-sky-50":""}`}
                        onClick={() => { setSelectedDate(d); setCalendarExpanded(false); }}>
                        <span className={`text-xs font-medium ${isSel?"text-white":isToday?"text-sky-600":"text-gray-700"}`}>{d.getDate()}</span>
                        {cnt>0 && <span className={`text-[8px] ${isSel?"text-sky-100":"text-sky-400"}`}>{cnt}</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 日期标题 + 视图切换 */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
          <span className="text-sm text-gray-700 font-medium">
            {selectedDate.getMonth()+1}月{selectedDate.getDate()}日 周{getWeekDay(selectedDate)}
            {isLoading
              ? <span className="text-xs text-gray-400 ml-2">加载中...</span>
              : <span className="text-xs text-gray-400 ml-1">共{filteredAppointments.length}条</span>
            }
          </span>
          <div className="flex gap-1">
            {(["list","timeline"] as const).map(mode => (
              <button key={mode}
                className={`px-2.5 py-1 rounded-md text-xs ${viewMode===mode?"bg-sky-500 text-white":"bg-gray-100 text-gray-600"}`}
                onClick={() => setViewMode(mode)}>
                {mode==="list"?"列表":"时间轴"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 内容区 */}
      {viewMode === "list" ? (
        <div className="flex-1 overflow-auto px-3 py-3 pb-24">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-gray-400 text-sm">加载中...</div>
          ) : filteredAppointments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <span className="text-4xl mb-3">📅</span>
              <span className="text-sm">当日暂无预约</span>
              <button className="mt-4 px-4 py-2 bg-sky-500 text-white rounded-lg text-sm"
                onClick={() => setLocation("/yaban/schedule/create")}>新建预约</button>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredAppointments.map((a: any) => {
                const sc = STATUS_CONFIG[a.status] || STATUS_CONFIG.booked;
                return (
                  <div key={a.id}
                    className="bg-white rounded-xl shadow-sm p-3 active:bg-gray-50 cursor-pointer"
                    onClick={() => setLocation(`/yaban/schedule/detail/${a.id}`)}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-10 rounded-full bg-sky-400 flex-shrink-0" />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold text-gray-800">{a.patientName}</span>
                            {a.patientGender && (
                              <span className={`text-[10px] px-1 rounded ${a.patientGender==="男"?"bg-blue-50 text-blue-500":a.patientGender==="女"?"bg-pink-50 text-pink-500":"bg-gray-50 text-gray-400"}`}>
                                {a.patientGender}
                              </span>
                            )}
                            {a.patientAge && <span className="text-[10px] text-gray-400">{a.patientAge}岁</span>}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {a.appointTime}{a.endTime?`–${a.endTime}`:""} · {a.doctor||"未分配"} · {a.room||""}
                          </div>
                        </div>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${sc.color} ${sc.bg}`}>
                        {sc.label}
                      </span>
                    </div>
                    {(a.project || a.remark) && (
                      <div className="mt-1.5 ml-3 text-xs text-gray-500 truncate">
                        {a.project}{a.remark?` · ${a.remark}`:""}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : renderTimeline()}

      {/* 新建预约悬浮按钮 */}
      <button
        className="fixed bottom-20 right-4 w-12 h-12 bg-sky-500 text-white rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-transform z-30"
        onClick={() => setLocation("/yaban/schedule/create")}
      >
        <Plus size={24} />
      </button>

      {/* 筛选抽屉 */}
      {showFilter && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={() => setShowFilter(false)} />
          <div className="w-72 bg-white h-full shadow-xl overflow-auto">
            <div className="px-4 pt-12 pb-4">
              <div className="flex items-center justify-between mb-6">
                <span className="text-base font-medium text-gray-800">筛选</span>
                <button onClick={() => setShowFilter(false)}><X size={20} className="text-gray-500" /></button>
              </div>
              <div className="mb-5">
                <span className="text-xs text-gray-500 mb-2 block">视图模式</span>
                <div className="flex gap-2">
                  {(["list","timeline"] as const).map(mode => (
                    <button key={mode}
                      className={`px-3 py-1.5 rounded-md text-xs ${viewMode===mode?"bg-sky-500 text-white":"bg-gray-100 text-gray-600"}`}
                      onClick={() => setViewMode(mode)}>
                      {mode==="list"?"列表视图":"时间轴"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mb-5">
                <span className="text-xs text-gray-500 mb-2 block">医生</span>
                <div className="flex flex-wrap gap-2">
                  {DOCTORS.map(d => (
                    <button key={d}
                      className={`px-3 py-1.5 rounded-md text-xs ${filterDoctor===d?"bg-sky-500 text-white":"bg-gray-100 text-gray-600"}`}
                      onClick={() => setFilterDoctor(d)}>{d}</button>
                  ))}
                </div>
              </div>
              <div className="mb-5">
                <span className="text-xs text-gray-500 mb-2 block">诊室</span>
                <div className="flex flex-wrap gap-2">
                  {ROOMS.map(r => (
                    <button key={r}
                      className={`px-3 py-1.5 rounded-md text-xs ${filterRoom===r?"bg-sky-500 text-white":"bg-gray-100 text-gray-600"}`}
                      onClick={() => setFilterRoom(r)}>{r}</button>
                  ))}
                </div>
              </div>
              <div className="mb-5">
                <span className="text-xs text-gray-500 mb-2 block">预约状态</span>
                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTIONS.map(s => (
                    <button key={s}
                      className={`px-3 py-1.5 rounded-md text-xs ${filterStatus===s?"bg-sky-500 text-white":"bg-gray-100 text-gray-600"}`}
                      onClick={() => setFilterStatus(s)}>{s}</button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 mt-8">
                <button className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600"
                  onClick={() => { setFilterDoctor("全部医生"); setFilterRoom("全部诊室"); setFilterStatus("全部状态"); }}>
                  重置
                </button>
                <button className="flex-1 py-2 rounded-lg bg-sky-500 text-white text-sm"
                  onClick={() => setShowFilter(false)}>确认</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <PageTag code="P322" />
    </div>
  );
}
