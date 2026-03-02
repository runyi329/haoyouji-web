/**
 * 奢贝美容院 - 预约页面
 * 路径: /beauty/booking
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import {
  ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, CheckCircle2, Sparkles, MapPin
} from "lucide-react";
import { Link, useLocation, useSearch } from "wouter";
import { useState } from "react";
import { toast } from "sonner";
import BeautyTabBar from "./BeautyTabBar";

const BUSINESS_HOURS = { start: 11, end: 20 };
const MAX_BOOKING_DAYS = 10;
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export default function BeautyBooking() {
  const { user, isAuthenticated } = useAuth({ redirectOnUnauthenticated: true });
  const search = useSearch();
  const [, navigate] = useLocation();

  const urlParams = new URLSearchParams(search);
  const preselectedServiceId = urlParams.get("service");

  const [selectedService, setSelectedService] = useState<number | null>(
    preselectedServiceId ? parseInt(preselectedServiceId) : null
  );
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [step, setStep] = useState(1);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const servicesQuery = trpc.beauty.service.list.useQuery();
  const services = servicesQuery.data ?? [];

  const { data: availableSlots, isLoading: slotsLoading } = trpc.beauty.appointment.getAvailableSlots.useQuery(
    { date: selectedDate?.toISOString() || new Date().toISOString(), serviceId: selectedService || undefined },
    { enabled: !!selectedDate }
  );

  const createAppointment = trpc.beauty.appointment.create.useMutation({
    onSuccess: () => {
      toast.success("预约成功！", { description: "我们会尽快与您确认预约详情" });
      navigate("/beauty/appointments");
    },
    onError: (error) => {
      toast.error("预约失败", { description: error.message });
    },
  });

  const selectedServiceInfo = services.find((s) => s.id === selectedService);

  // 日历相关
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = new Date(today);
  maxDate.setDate(today.getDate() + MAX_BOOKING_DAYS);

  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const calendarDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const days: (Date | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(new Date(year, month, d));
    return days;
  };

  const isDateSelectable = (date: Date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d >= today && d <= maxDate;
  };

  const formatSelectedDate = (date: Date) => {
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日（${WEEKDAYS[date.getDay()]}）`;
  };

  const handleSubmit = () => {
    if (!selectedService || !selectedDate || !selectedSlot) return;
    createAppointment.mutate({
      serviceId: selectedService,
      appointmentDate: selectedDate.toISOString(),
      timeSlot: selectedSlot,
      notes: notes || undefined,
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 顶部 */}
      <div className="sticky top-0 z-10">
        <div className="bg-white border-b border-gray-100">
          <div className="flex items-center gap-3 px-4 py-3">
            <Link href="/beauty">
              <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
            </Link>
            <h1 className="font-semibold text-gray-800">预约服务</h1>
          </div>
        </div>
        <BeautyTabBar />
      </div>

      <main className="px-4 py-4 space-y-4 max-w-lg mx-auto">
        {/* 步骤1: 选择服务 */}
        <Card className={`border-border/50 ${step > 1 ? "opacity-70" : ""}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-rose-500 text-white text-xs flex items-center justify-center">1</span>
                选择服务项目
              </h2>
              {step > 1 && (
                <button onClick={() => setStep(1)} className="text-xs text-rose-500">修改</button>
              )}
            </div>
            {step === 1 && (
              <div className="space-y-2">
                {servicesQuery.isLoading ? (
                  <p className="text-sm text-gray-400 text-center py-4">加载中...</p>
                ) : services.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">暂无服务项目</p>
                ) : (
                  services.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => { setSelectedService(s.id); setStep(2); }}
                      className={`w-full text-left p-3 rounded-xl border transition-all ${
                        selectedService === s.id
                          ? "border-rose-400 bg-rose-50"
                          : "border-gray-200 bg-white hover:border-rose-200"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-800 text-sm">{s.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{s.description}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-rose-500 font-bold text-sm">¥{s.price}</span>
                            <span className="text-xs text-gray-400 flex items-center gap-0.5">
                              <Clock className="w-3 h-3" />{s.duration}分钟
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300" />
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
            {step > 1 && selectedServiceInfo && (
              <div className="flex items-center gap-3 p-3 bg-rose-50 rounded-xl">
                <Sparkles className="w-5 h-5 text-rose-400" />
                <div>
                  <p className="font-medium text-sm text-gray-800">{selectedServiceInfo.name}</p>
                  <p className="text-xs text-rose-500">¥{selectedServiceInfo.price} · {selectedServiceInfo.duration}分钟</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 步骤2: 选择日期 */}
        {step >= 2 && (
          <Card className={`border-border/50 ${step > 2 ? "opacity-70" : ""}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-rose-500 text-white text-xs flex items-center justify-center">2</span>
                  选择日期
                </h2>
                {step > 2 && (
                  <button onClick={() => setStep(2)} className="text-xs text-rose-500">修改</button>
                )}
              </div>
              {step === 2 && (
                <>
                  {/* 月份切换 */}
                  <div className="flex items-center justify-between mb-3">
                    <button
                      onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                      className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-medium text-gray-700">
                      {currentMonth.getFullYear()}年{currentMonth.getMonth() + 1}月
                    </span>
                    <button
                      onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                      className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                  {/* 星期头 */}
                  <div className="grid grid-cols-7 mb-1">
                    {WEEKDAYS.map((d) => (
                      <div key={d} className="text-center text-xs text-gray-400 py-1">{d}</div>
                    ))}
                  </div>
                  {/* 日历格子 */}
                  <div className="grid grid-cols-7 gap-1">
                    {calendarDays().map((date, i) => {
                      if (!date) return <div key={i} />;
                      const selectable = isDateSelectable(date);
                      const isSelected = selectedDate?.toDateString() === date.toDateString();
                      const isToday = date.toDateString() === today.toDateString();
                      return (
                        <button
                          key={i}
                          onClick={() => { if (selectable) { setSelectedDate(date); setStep(3); } }}
                          disabled={!selectable}
                          className={`aspect-square rounded-lg text-sm font-medium transition-all ${
                            isSelected
                              ? "bg-rose-500 text-white"
                              : isToday
                              ? "border border-rose-300 text-rose-500"
                              : selectable
                              ? "hover:bg-rose-50 text-gray-700"
                              : "text-gray-300 cursor-not-allowed"
                          }`}
                        >
                          {date.getDate()}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              {step > 2 && selectedDate && (
                <div className="flex items-center gap-2 p-3 bg-rose-50 rounded-xl">
                  <CalendarIcon className="w-4 h-4 text-rose-400" />
                  <span className="text-sm text-gray-700">{formatSelectedDate(selectedDate)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* 步骤3: 选择时段 */}
        {step >= 3 && (
          <Card className={`border-border/50 ${step > 3 ? "opacity-70" : ""}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-rose-500 text-white text-xs flex items-center justify-center">3</span>
                  选择时段
                </h2>
                {step > 3 && (
                  <button onClick={() => setStep(3)} className="text-xs text-rose-500">修改</button>
                )}
              </div>
              {step === 3 && (
                <>
                  {slotsLoading ? (
                    <p className="text-sm text-gray-400 text-center py-4">加载时段...</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {(availableSlots ?? []).map(({ slot, available }) => {
                        const isSelected = selectedSlot === slot;
                        return (
                          <button
                            key={slot}
                            onClick={() => available && setSelectedSlot(slot)}
                            disabled={!available}
                            className={`py-2.5 rounded-lg text-xs font-medium border transition-all ${
                              isSelected
                                ? "bg-rose-500 text-white border-rose-500"
                                : available
                                ? "bg-white border-gray-200 text-gray-700 hover:border-rose-300"
                                : "bg-gray-50 text-gray-300 border-transparent cursor-not-allowed"
                            }`}
                          >
                            {available ? slot.split("-")[0] : "客满"}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {selectedSlot && (
                    <Button className="w-full mt-3 bg-rose-500 hover:bg-rose-600 text-white" onClick={() => setStep(4)}>
                      下一步：确认预约
                    </Button>
                  )}
                </>
              )}
              {step > 3 && selectedSlot && (
                <div className="flex items-center gap-2 p-3 bg-rose-50 rounded-xl">
                  <Clock className="w-4 h-4 text-rose-400" />
                  <span className="text-sm text-gray-700">{selectedSlot}</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* 步骤4: 确认预约 */}
        {step === 4 && selectedServiceInfo && selectedDate && selectedSlot && (
          <Card className="border-border/50">
            <CardContent className="p-4 space-y-4">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-rose-500 text-white text-xs flex items-center justify-center">4</span>
                确认预约信息
              </h2>
              <div className="space-y-2.5">
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-500">服务项目</span>
                  <span className="text-sm font-medium text-gray-800">{selectedServiceInfo.name}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-500">预约日期</span>
                  <span className="text-sm font-medium text-gray-800">{formatSelectedDate(selectedDate)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-500">到店时间</span>
                  <span className="text-sm font-medium text-gray-800">{selectedSlot}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-500">服务时长</span>
                  <span className="text-sm font-medium text-gray-800">{selectedServiceInfo.duration}分钟</span>
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-500 mb-1.5 block">备注（选填）</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="如有特殊需求请在此说明..."
                  className="w-full p-3 rounded-xl border border-gray-200 bg-white text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-rose-300"
                />
              </div>
              <div className="p-3 bg-gray-50 rounded-xl">
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-rose-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">奢贝美容院</p>
                    <p className="text-xs text-gray-500">曹安公路1877号曹安国际商城936室</p>
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setStep(3)}>返回修改</Button>
                <Button
                  className="flex-1 bg-rose-500 hover:bg-rose-600 text-white"
                  onClick={handleSubmit}
                  disabled={createAppointment.isPending}
                >
                  {createAppointment.isPending ? "提交中..." : "确认预约"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
