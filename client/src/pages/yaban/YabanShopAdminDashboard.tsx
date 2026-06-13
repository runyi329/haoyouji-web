/**
 * 牙伴齿科商城 - 经营数据看板（后台）
 * 路由：/yaban/shop/admin/dashboard
 */
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, Loader2, TrendingUp, ShoppingBag, Wallet, CheckCircle2 } from "lucide-react";
import { PageTag } from "@/components/PageTag";

const STATUS_LABEL: Record<string, string> = {
  pending: "待付款",
  confirmed: "已付款",
  shipped: "已发货",
  completed: "已完成",
  cancelled: "已取消",
  refunding: "退款中",
  refunded: "已退款",
};

export default function YabanShopAdminDashboard() {
  const [, navigate] = useLocation();
  const { data, isLoading } = trpc.yabanShopAdmin.dashboard.useQuery();

  const maxAmt = Math.max(1, ...((data?.recentDays ?? []).map((d) => d.amount)));

  return (
    <div className="min-h-screen bg-[#F5F7FA] pb-10">
      <PageTag code="P312" />
      <div className="bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-3 py-3 flex items-center gap-2">
          <button onClick={() => navigate("/yaban/shop")} aria-label="返回">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-base font-bold">经营数据</span>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-[#2196C8] animate-spin" /></div>
      ) : (
        <div className="max-w-lg mx-auto px-3 pt-3 space-y-3">
          {/* 核心指标 */}
          <div className="grid grid-cols-2 gap-3">
            <MetricCard icon={<Wallet className="w-5 h-5" />} label="今日成交额" value={`¥${(data?.todayAmount ?? 0).toFixed(2)}`} accent="#2196C8" />
            <MetricCard icon={<ShoppingBag className="w-5 h-5" />} label="今日订单" value={`${data?.todayOrders ?? 0} 单`} accent="#10B981" />
            <MetricCard icon={<TrendingUp className="w-5 h-5" />} label="累计成交额" value={`¥${(data?.totalAmount ?? 0).toFixed(2)}`} accent="#F59E0B" />
            <MetricCard icon={<CheckCircle2 className="w-5 h-5" />} label="累计订单 / 已付款" value={`${data?.totalOrders ?? 0} / ${data?.paidOrders ?? 0}`} accent="#8B5CF6" />
          </div>

          {/* 近7天成交趋势 */}
          <div className="bg-white rounded-xl p-4">
            <p className="text-sm font-bold text-gray-800 mb-3">近 7 天成交趋势</p>
            {(data?.recentDays ?? []).length === 0 ? (
              <p className="text-xs text-gray-400 py-6 text-center">暂无成交数据</p>
            ) : (
              <div className="flex items-end justify-between gap-1.5 h-32">
                {(data?.recentDays ?? []).map((d) => (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] text-gray-400">{d.amount > 0 ? d.amount.toFixed(0) : ""}</span>
                    <div className="w-full rounded-t bg-gradient-to-t from-[#2196C8] to-[#3BA9E0]"
                      style={{ height: `${Math.max(4, (d.amount / maxAmt) * 96)}px` }} />
                    <span className="text-[10px] text-gray-400">{d.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 订单状态分布 */}
          <div className="bg-white rounded-xl p-4">
            <p className="text-sm font-bold text-gray-800 mb-3">订单状态分布</p>
            {(data?.statusDist ?? []).length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">暂无订单</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(data?.statusDist ?? []).map((s) => (
                  <div key={s.status} className="px-3 py-1.5 rounded-lg bg-[#F5F7FA] text-xs text-gray-600">
                    {STATUS_LABEL[s.status] || s.status} <span className="font-bold text-[#2196C8]">{s.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 热销 Top */}
          <div className="bg-white rounded-xl p-4">
            <p className="text-sm font-bold text-gray-800 mb-3">热销商品 Top10</p>
            {(data?.topProducts ?? []).length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">暂无销售数据</p>
            ) : (
              <div className="space-y-2">
                {(data?.topProducts ?? []).map((p, i) => (
                  <div key={p.name} className="flex items-center gap-2">
                    <span className={`w-5 h-5 rounded flex items-center justify-center text-[11px] font-bold shrink-0 ${i < 3 ? "bg-[#FFF0E5] text-[#E2452F]" : "bg-gray-100 text-gray-400"}`}>{i + 1}</span>
                    <span className="flex-1 text-sm text-gray-700 truncate">{p.name}</span>
                    <span className="text-xs text-gray-400">售{p.qty}</span>
                    <span className="text-sm text-[#E2452F] font-medium w-16 text-right">¥{p.amount.toFixed(0)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  return (
    <div className="bg-white rounded-xl p-3">
      <div className="flex items-center gap-2 mb-2" style={{ color: accent }}>
        <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: accent + "1A" }}>{icon}</span>
      </div>
      <p className="text-[11px] text-gray-400">{label}</p>
      <p className="text-base font-bold text-gray-800 mt-0.5">{value}</p>
    </div>
  );
}
