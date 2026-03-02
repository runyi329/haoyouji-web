/**
 * 奢贝美容院 - 我的预约
 * 路径: /beauty/appointments
 */
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Link } from "wouter";
import { ChevronLeft, Calendar, Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import BeautyTabBar from "./BeautyTabBar";
import BottomNav from "@/components/BottomNav";

const STATUS_MAP: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: "待确认", color: "text-amber-500 bg-amber-50", icon: <AlertCircle className="w-3.5 h-3.5" /> },
  confirmed: { label: "已确认", color: "text-blue-500 bg-blue-50", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  completed: { label: "已完成", color: "text-green-500 bg-green-50", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  cancelled: { label: "已取消", color: "text-gray-400 bg-gray-100", icon: <XCircle className="w-3.5 h-3.5" /> },
};

export default function BeautyAppointments() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const utils = trpc.useUtils();

  const { data: appointments, isLoading } = trpc.beauty.appointment.myList.useQuery();

  const cancelMutation = trpc.beauty.appointment.cancel.useMutation({
    onSuccess: () => {
      toast.success("预约已取消");
      utils.beauty.appointment.myList.invalidate();
    },
    onError: (err) => toast.error("取消失败", { description: err.message }),
  });

  const formatDate = (d: Date | string) => {
    const date = new Date(d);
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      <div className="sticky top-0 z-10">
        <div className="bg-white border-b border-gray-100">
          <div className="flex items-center gap-3 px-4 py-3">
            <Link href="/beauty">
              <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
            </Link>
            <h1 className="font-semibold text-gray-800">我的预约</h1>
          </div>
        </div>
        <BeautyTabBar />
      </div>

      <div className="px-4 py-4 space-y-3 max-w-lg mx-auto">
        {isLoading ? (
          <div className="text-center py-12 text-gray-400 text-sm">加载中...</div>
        ) : !appointments || appointments.length === 0 ? (
          <div className="text-center py-16">
            <Calendar className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">暂无预约记录</p>
            <Link href="/beauty/booking">
              <Button className="mt-4 bg-rose-500 hover:bg-rose-600 text-white text-sm">立即预约</Button>
            </Link>
          </div>
        ) : (
          appointments.map((apt) => {
            const status = STATUS_MAP[apt.status] ?? STATUS_MAP.pending;
            return (
              <Card key={apt.id} className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-gray-800 text-sm">{apt.serviceName ?? "美容服务"}</h3>
                      <p className="text-xs text-rose-500 mt-0.5">¥{apt.servicePrice}</p>
                    </div>
                    <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${status.color}`}>
                      {status.icon}
                      {status.label}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-xs text-gray-500">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      <span>{formatDate(apt.appointmentDate)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-gray-400" />
                      <span>{apt.timeSlot}</span>
                    </div>
                    {apt.notes && (
                      <p className="text-gray-400 pl-5">{apt.notes}</p>
                    )}
                  </div>
                  {(apt.status === "pending" || apt.status === "confirmed") && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs text-gray-500 border-gray-200"
                        onClick={() => cancelMutation.mutate({ id: apt.id })}
                        disabled={cancelMutation.isPending}
                      >
                        取消预约
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
      <BottomNav />
    </div>
  );
}
