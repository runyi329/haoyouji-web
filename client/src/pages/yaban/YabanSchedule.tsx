/**
 * 牙伴齿科管理 - 日程/预约列表页
 * 路由：/yaban/schedule
 * 淡蓝色系，顶部周历（可展开月历）+ 列表视图/时间轴视图切换
 * 右侧筛选抽屉（医生/诊室/状态）
 */
import { useState, useRef, TouchEvent } from "react";
import { PageTag } from "@/components/PageTag";
import { useLocation } from "wouter";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Plus,
  SlidersHorizontal,
  X,
} from "lucide-react";

// 预约状态配置
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  booked: { label: "已预约", color: "text-sky-600", bg: "bg-sky-50" },
  confirmed: { label: "已确认", color: "text-blue-600", bg: "bg-blue-50" },
  consulting: { label: "咨询中", color: "text-purple-600", bg: "bg-purple-50" },
  registered: { label: "已挂号", color: "text-indigo-600", bg: "bg-indigo-50" },
  treating: { label: "治疗中", color: "text-amber-600", bg: "bg-amber-50" },
  treated: { label: "治疗完成", color: "text-emerald-600", bg: "bg-emerald-50" },
  paid: { label: "已结账", color: "text-green-600", bg: "bg-green-50" },
  left: { label: "已离开", color: "text-green-700", bg: "bg-green-50" },
  missed: { label: "失约", color: "text-gray-500", bg: "bg-gray-100" },
  cancelled: { label: "已取消", color: "text-gray-400", bg: "bg-gray-50" },
};

// 时间轴色块颜色（按医生分配）
const DOCTOR_COLORS = [
  { bg: "bg-sky-100", border: "border-sky-300", text: "text-sky-800" },
  { bg: "bg-emerald-100", border: "border-emerald-300", text: "text-emerald-800" },
  { bg: "bg-amber-100", border: "border-amber-300", text: "text-amber-800" },
  { bg: "bg-purple-100", border: "border-purple-300", text: "text-purple-800" },
  { bg: "bg-rose-100", border: "border-rose-300", text: "text-rose-800" },
  { bg: "bg-indigo-100", border: "border-indigo-300", text: "text-indigo-800" },
];

// 模拟医生数据
const DOCTORS = ["全部医生", "郑莹", "易家宝", "李华超", "鲁毅", "梅刚"];
const ROOMS = ["全部诊室", "1号诊室", "2号诊室", "儿牙诊室", "VIP诊室"];
const STATUS_OPTIONS = [
  "全部状态", "已预约", "已确认", "咨询中", "已挂号",
  "治疗中", "治疗完成", "已结账", "已离开", "失约",
];

// 模拟预约数据
interface Appointment {
  id: number;
  patientName: string;
  patientAge: number;
  gender: string;
  time: string;
  endTime: string;
  doctor: string;
  project: string;
  remark: string;
  status: string;
  room: string;
}

function generateMockData(date: Date): Appointment[] {
  const seed = date.getDate() + date.getMonth() * 31;
  const names = ["王瑛", "赵玲", "胡星民", "殷伟民", "王平华", "徐进", "喻永丽", "王雯婷", "张明", "李芳"];
  const projects = ["复诊", "洁牙", "补牙", "拔牙", "种植", "正畸复诊", "根管治疗", "美白"];
  const statuses = ["booked", "confirmed", "consulting", "treating", "treated", "paid", "left", "missed"];
  const doctors = ["郑莹", "易家宝", "李华超", "鲁毅", "梅刚"];
  const rooms = ["1号诊室", "2号诊室", "儿牙诊室", "VIP诊室"];
  const remarks = ["定期检查", "复查", "宁缺访邀约 IMP定检", "半年洁牙", "正畸调整", ""];

  const count = 3 + (seed % 6);
  const result: Appointment[] = [];
  for (let i = 0; i < count; i++) {
    const hour = 8 + Math.floor(((seed * (i + 1) * 7) % 20) / 2);
    const minute = (seed * (i + 1)) % 2 === 0 ? "00" : "30";
    const endHour = hour + ((seed * i) % 2 === 0 ? 1 : 0);
    const endMinute = minute === "00" ? "30" : "00";
    result.push({
      id: seed * 100 + i,
      patientName: names[(seed + i) % names.length],
      patientAge: 20 + ((seed + i * 3) % 50),
      gender: (seed + i) % 3 === 0 ? "female" : "male",
      time: `${hour.toString().padStart(2, "0")}:${minute}`,
      endTime: `${(endMinute === "00" ? endHour + 1 : endHour).toString().padStart(2, "0")}:${endMinute}`,
      doctor: doctors[(seed + i) % doctors.length],
      project: projects[(seed + i * 2) % projects.length],
      remark: remarks[(seed + i) % remarks.length],
      status: statuses[(seed + i * 3) % statuses.length],
      room: rooms[(seed + i) % rooms.length],
    });
  }
  return result.sort((a, b) => a.time.localeCompare(b.time));
}

// 获取星期几
function getWeekDay(date: Date): string {
  const days = ["日", "一", "二", "三", "四", "五", "六"];
  return days[date.getDay()];
}

// 获取一周的日期
function getWeekDates(baseDate: Date): Date[] {
  const day = baseDate.getDay();
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() - (day === 0 ? 6 : day - 1));
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d);
  }
  return dates;
}

// 获取月历数据
function getMonthDates(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDay = firstDay.getDay();
  const totalDays = lastDay.getDate();
  const weeks: (Date | null)[][] = [];
  let currentWeek: (Date | null)[] = [];
  for (let i = 0; i < startDay; i++) {
    currentWeek.push(null);
  }
  for (let d = 1; d <= totalDays; d++) {
    currentWeek.push(new Date(year, month, d));
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push(null);
    weeks.push(currentWeek);
  }
  return weeks;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function YabanSchedule() {
  const [, setLocation] = useLocation();
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState(today);
  const [calendarExpanded, setCalendarExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "timeline">("list");
  const [showFilter, setShowFilter] = useState(false);
  const [filterDoctor, setFilterDoctor] = useState("全部医生");
  const [filterRoom, setFilterRoom] = useState("全部诊室");
  const [filterStatus, setFilterStatus] = useState("全部状态");

  // 滑动切换周
  const touchStartX = useRef(0);
  const [weekOffset, setWeekOffset] = useState(0);

  const baseDate = new Date(today);
  baseDate.setDate(today.getDate() + weekOffset * 7);
  const weekDates = getWeekDates(baseDate);

  const appointments = generateMockData(selectedDate);

  // 筛选
  const filteredAppointments = appointments.filter((a) => {
    if (filterDoctor !== "全部医生" && a.doctor !== filterDoctor) return false;
    if (filterRoom !== "全部诊室" && a.room !== filterRoom) return false;
    if (filterStatus !== "全部状态") {
      const statusEntry = Object.entries(STATUS_CONFIG).find(([, v]) => v.label === filterStatus);
      if (statusEntry && a.status !== statusEntry[0]) return false;
    }
    return true;
  });

  const handleTouchStart = (e: TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: TouchEvent) => {
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(diff) > 60) {
      if (diff < 0) setWeekOffset((p) => p + 1);
      else setWeekOffset((p) => p - 1);
    }
  };

  // 时间轴渲染
  const renderTimeline = () => {
    const hours = Array.from({ length: 24 }, (_, i) => i + 8).filter((h) => h <= 20);
    const doctorMap = new Map<string, Appointment[]>();
    filteredAppointments.forEach((a) => {
      if (!doctorMap.has(a.doctor)) doctorMap.set(a.doctor, []);
      doctorMap.get(a.doctor)!.push(a);
    });
    const doctorList = Array.from(doctorMap.keys());

    return (
      <div className="flex-1 overflow-auto px-2 pb-4">
        <div className="relative" style={{ minHeight: `${hours.length * 60}px` }}>
          {/* 时间刻度 */}
          {hours.map((h) => (
            <div key={h} className="absolute left-0 w-full" style={{ top: `${(h - 8) * 60}px` }}>
              <div className="flex items-start">
                <span className="text-[10px] text-gray-400 w-10 text-right pr-1 -mt-1.5">
                  {h.toString().padStart(2, "0")}:00
                </span>
                <div className="flex-1 border-t border-gray-100" />
              </div>
              {/* 半小时线 */}
              <div className="flex items-start" style={{ marginTop: "28px" }}>
                <span className="w-10" />
                <div className="flex-1 border-t border-dashed border-gray-50" />
              </div>
            </div>
          ))}
          {/* 预约色块 */}
          <div className="ml-11 relative">
            {doctorList.map((doctor, dIdx) => {
              const colorSet = DOCTOR_COLORS[dIdx % DOCTOR_COLORS.length];
              const appts = doctorMap.get(doctor) || [];
              return appts.map((a) => {
                const [startH, startM] = a.time.split(":").map(Number);
                const [endH, endM] = a.endTime.split(":").map(Number);
                const top = (startH - 8) * 60 + startM;
                const height = Math.max((endH - startH) * 60 + (endM - startM), 30);
                const left = dIdx * (100 / Math.max(doctorList.length, 1));
                const width = 100 / Math.max(doctorList.length, 1) - 2;
                return (
                  <div
                    key={a.id}
                    className={`absolute rounded-md border ${colorSet.bg} ${colorSet.border} p-1 overflow-hidden cursor-pointer active:opacity-80`}
                    style={{ top: `${top}px`, height: `${height}px`, left: `${left}%`, width: `${width}%` }}
                    onClick={() => setLocation(`/yaban/schedule/${a.id}`)}
                  >
                    <div className={`text-[10px] font-medium ${colorSet.text} truncate`}>
                      {a.patientName}
                    </div>
                    <div className={`text-[9px] ${colorSet.text} opacity-70 truncate`}>
                      {a.project}
                    </div>
                    {height > 40 && (
                      <div className={`text-[9px] ${colorSet.text} opacity-60 truncate`}>
                        {a.doctor}
                      </div>
                    )}
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
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部导航栏 */}
      <div className="bg-gradient-to-r from-sky-500 to-sky-400 text-white px-4 pt-12 pb-3">
        <div className="flex items-center justify-between">
          <button onClick={() => setLocation("/yaban")} className="p-1">
            <ChevronLeft size={22} />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-base font-medium">预约/日程</span>
          </div>
          <button onClick={() => setShowFilter(true)} className="p-1">
            <SlidersHorizontal size={20} />
          </button>
        </div>
      </div>

      {/* 视图切换 */}
      <div className="bg-white px-4 py-2 flex items-center gap-3 border-b border-gray-100">
        <button
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            viewMode === "list" ? "bg-sky-500 text-white" : "bg-gray-100 text-gray-600"
          }`}
          onClick={() => setViewMode("list")}
        >
          列表
        </button>
        <button
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            viewMode === "timeline" ? "bg-sky-500 text-white" : "bg-gray-100 text-gray-600"
          }`}
          onClick={() => setViewMode("timeline")}
        >
          时间轴
        </button>
        <div className="flex-1" />
        <span className="text-xs text-gray-400">
          {filteredAppointments.length} 个预约
        </span>
      </div>

      {/* 周历/月历 */}
      <div
        className="bg-white border-b border-gray-100"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {!calendarExpanded ? (
          /* 周历 */
          <div className="px-2 py-2">
            <div className="grid grid-cols-7 gap-1">
              {weekDates.map((d, i) => {
                const isToday = isSameDay(d, today);
                const isSelected = isSameDay(d, selectedDate);
                return (
                  <button
                    key={i}
                    className="flex flex-col items-center py-1"
                    onClick={() => setSelectedDate(d)}
                  >
                    <span className="text-[10px] text-gray-400 mb-0.5">
                      {isToday ? "今" : `周${getWeekDay(d)}`}
                    </span>
                    <div
                      className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium transition-colors ${
                        isSelected
                          ? "bg-sky-500 text-white"
                          : isToday
                          ? "bg-sky-100 text-sky-600"
                          : "text-gray-700"
                      }`}
                    >
                      {d.getDate()}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          /* 月历展开 */
          <div className="px-3 py-2">
            <div className="flex items-center justify-center gap-4 mb-2">
              <button
                onClick={() => {
                  const d = new Date(selectedDate);
                  d.setMonth(d.getMonth() - 1);
                  setSelectedDate(d);
                }}
              >
                <ChevronLeft size={16} className="text-gray-500" />
              </button>
              <span className="text-sm font-medium text-gray-700">
                {selectedDate.getFullYear()}年{selectedDate.getMonth() + 1}月
              </span>
              <button
                onClick={() => {
                  const d = new Date(selectedDate);
                  d.setMonth(d.getMonth() + 1);
                  setSelectedDate(d);
                }}
              >
                <ChevronRight size={16} className="text-gray-500" />
              </button>
            </div>
            <div className="grid grid-cols-7 text-center mb-1">
              {["日", "一", "二", "三", "四", "五", "六"].map((d) => (
                <span key={d} className="text-[10px] text-gray-400">{d}</span>
              ))}
            </div>
            {getMonthDates(selectedDate.getFullYear(), selectedDate.getMonth()).map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 text-center">
                {week.map((d, di) => {
                  if (!d) return <div key={di} />;
                  const isToday = isSameDay(d, today);
                  const isSelected = isSameDay(d, selectedDate);
                  // 简单模拟：有些日期有预约（用小圆点表示）
                  const hasAppt = d.getDate() % 3 !== 0;
                  return (
                    <button
                      key={di}
                      className="flex flex-col items-center py-0.5"
                      onClick={() => setSelectedDate(d)}
                    >
                      <div
                        className={`w-7 h-7 flex items-center justify-center rounded-full text-xs ${
                          isSelected
                            ? "bg-sky-500 text-white"
                            : isToday
                            ? "bg-sky-100 text-sky-600"
                            : "text-gray-700"
                        }`}
                      >
                        {d.getDate()}
                      </div>
                      {hasAppt && (
                        <div className={`w-1 h-1 rounded-full mt-0.5 ${isSelected ? "bg-white" : "bg-sky-400"}`} />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
        {/* 展开/收起按钮 */}
        <button
          className="w-full py-1 flex justify-center"
          onClick={() => setCalendarExpanded(!calendarExpanded)}
        >
          {calendarExpanded ? (
            <ChevronUp size={16} className="text-gray-400" />
          ) : (
            <ChevronDown size={16} className="text-gray-400" />
          )}
        </button>
      </div>

      {/* 当前日期标题 */}
      <div className="px-4 py-2 bg-white border-b border-gray-50">
        <span className="text-xs text-gray-500">
          {selectedDate.getFullYear()}/{(selectedDate.getMonth() + 1).toString().padStart(2, "0")}/{selectedDate.getDate().toString().padStart(2, "0")} 周{getWeekDay(selectedDate)}
        </span>
      </div>

      {/* 内容区域 */}
      {viewMode === "list" ? (
        /* 列表视图 */
        <div className="flex-1 overflow-auto px-4 py-2 space-y-2 pb-20">
          {filteredAppointments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <span className="text-sm text-gray-400">暂无预约</span>
            </div>
          ) : (
            filteredAppointments.map((a) => {
              const statusInfo = STATUS_CONFIG[a.status] || STATUS_CONFIG.booked;
              return (
                <div
                  key={a.id}
                  className="bg-white rounded-lg p-3 shadow-sm border border-gray-50 active:bg-gray-50 transition-colors"
                  onClick={() => setLocation(`/yaban/schedule/${a.id}`)}
                >
                  <div className="flex items-start justify-between mb-1.5">
                    <span className="text-sm font-medium text-gray-800">{a.patientName}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded ${statusInfo.bg} ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{a.time}-{a.endTime}</span>
                      <span className="text-gray-300">|</span>
                      <span>{a.doctor}</span>
                    </div>
                    <div className="text-xs text-gray-500">
                      项目: {a.project}
                      {a.room && <span className="ml-2">诊室: {a.room}</span>}
                    </div>
                    {a.remark && (
                      <div className="text-xs text-gray-400 truncate">备注: {a.remark}</div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        renderTimeline()
      )}

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
          <div className="w-72 bg-white h-full shadow-xl overflow-auto animate-slide-in-right">
            <div className="px-4 pt-12 pb-4">
              <div className="flex items-center justify-between mb-6">
                <span className="text-base font-medium text-gray-800">筛选</span>
                <button onClick={() => setShowFilter(false)}>
                  <X size={20} className="text-gray-500" />
                </button>
              </div>

              {/* 视图切换 */}
              <div className="mb-5">
                <span className="text-xs text-gray-500 mb-2 block">视图模式</span>
                <div className="flex gap-2">
                  {(["list", "timeline"] as const).map((mode) => (
                    <button
                      key={mode}
                      className={`px-3 py-1.5 rounded-md text-xs ${
                        viewMode === mode
                          ? "bg-sky-500 text-white"
                          : "bg-gray-100 text-gray-600"
                      }`}
                      onClick={() => setViewMode(mode)}
                    >
                      {mode === "list" ? "列表视图" : "时间轴"}
                    </button>
                  ))}
                </div>
              </div>

              {/* 按医生筛选 */}
              <div className="mb-5">
                <span className="text-xs text-gray-500 mb-2 block">医生</span>
                <div className="flex flex-wrap gap-2">
                  {DOCTORS.map((d) => (
                    <button
                      key={d}
                      className={`px-3 py-1.5 rounded-md text-xs ${
                        filterDoctor === d
                          ? "bg-sky-500 text-white"
                          : "bg-gray-100 text-gray-600"
                      }`}
                      onClick={() => setFilterDoctor(d)}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* 按诊室筛选 */}
              <div className="mb-5">
                <span className="text-xs text-gray-500 mb-2 block">诊室</span>
                <div className="flex flex-wrap gap-2">
                  {ROOMS.map((r) => (
                    <button
                      key={r}
                      className={`px-3 py-1.5 rounded-md text-xs ${
                        filterRoom === r
                          ? "bg-sky-500 text-white"
                          : "bg-gray-100 text-gray-600"
                      }`}
                      onClick={() => setFilterRoom(r)}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* 按状态筛选 */}
              <div className="mb-5">
                <span className="text-xs text-gray-500 mb-2 block">预约状态</span>
                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTIONS.map((s) => (
                    <button
                      key={s}
                      className={`px-3 py-1.5 rounded-md text-xs ${
                        filterStatus === s
                          ? "bg-sky-500 text-white"
                          : "bg-gray-100 text-gray-600"
                      }`}
                      onClick={() => setFilterStatus(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* 底部按钮 */}
              <div className="flex gap-3 mt-8">
                <button
                  className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600"
                  onClick={() => {
                    setFilterDoctor("全部医生");
                    setFilterRoom("全部诊室");
                    setFilterStatus("全部状态");
                  }}
                >
                  重置
                </button>
                <button
                  className="flex-1 py-2 rounded-lg bg-sky-500 text-white text-sm"
                  onClick={() => setShowFilter(false)}
                >
                  确认
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <PageTag code="P322" />
    </div>
  );
}
