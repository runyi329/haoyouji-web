import { trpc } from "@/lib/trpc";
import { mtrpc } from "./mibanTrpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, User } from "lucide-react";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: "待处理", color: "text-gray-700 bg-gray-100" },
  processing: { label: "处理中", color: "text-blue-600 bg-blue-50" },
  shipped: { label: "已发货", color: "text-green-600 bg-green-50" },
  delivered: { label: "已送达", color: "text-gray-600 bg-gray-100" },
  cancelled: { label: "已取消", color: "text-red-600 bg-red-50" },
};

export default function MyOrders() {
  const { isAuthenticated } = useAuth();
  const { data: orders, isLoading } = mtrpc.order.myOrders.useQuery(undefined, { enabled: isAuthenticated });

  if (!isAuthenticated) return (
    <main className="page-enter">
      <div className="container py-16 max-w-md mx-auto text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-50 mb-6"><Package className="w-8 h-8 text-blue-600" /></div>
        <h1 className="font-serif text-2xl font-bold text-foreground mb-3">我的订单</h1>
        <p className="text-muted-foreground text-sm mb-6">登录后查看您的历史订单</p>
        <Button onClick={() => window.location.href = "/login"} className="bg-primary text-primary-foreground rounded-xl px-8"><User className="w-4 h-4 mr-2" />登录后查看</Button>
      </div>
    </main>
  );

  return (
    <main className="page-enter">
      <section className="bg-gradient-to-br from-blue-50/30 to-background border-b border-border/40">
        <div className="container py-10">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-3">
            <Link href="/" className="hover:text-foreground transition-colors">首页</Link>
            <span>/</span><span className="text-foreground">我的订单</span>
          </div>
          <h1 className="font-serif text-3xl font-bold text-foreground mb-2">我的订单</h1>
          <p className="text-muted-foreground text-sm">查看您的定制大米订单状态</p>
        </div>
      </section>
      <div className="container py-8">
        {isLoading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>
        ) : !orders?.length ? (
          <div className="text-center py-16">
            <Package className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground mb-4">还没有订单记录</p>
            <Link href="/diy"><Button className="bg-primary text-primary-foreground rounded-xl">去 DIY 工坊下单</Button></Link>
          </div>
        ) : (
          <div className="space-y-3">
            {(orders ?? []).map((order: any) => {
              const status = STATUS_MAP[order.status] ?? { label: order.status, color: "text-gray-600 bg-gray-100" };
              const ingredients: any[] = (() => { try { return JSON.parse(order.ingredients as any ?? "[]"); } catch { return []; } })();
              return (
                <div key={order.id} className="washi-card p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <h3 className="font-serif font-semibold text-foreground">{order.recipeName}</h3>
                      <p className="text-muted-foreground text-xs mt-0.5">订单号：{order.id} · {new Date(order.createdAt).toLocaleDateString("zh-CN")}</p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${status.color}`}>{status.label}</span>
                  </div>
                  {ingredients.length > 0 && (
                    <div className="h-2.5 rounded-full overflow-hidden flex mb-2">
                      {ingredients.map((ing: any, i: number) => <div key={i} style={{ width: `${(ing.weightJin / order.totalWeightJin) * 100}%`, backgroundColor: ing.colorHex ?? "#C8A87A" }} />)}
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/40">
                    <span className="text-muted-foreground text-xs">{order.totalWeightJin} 斤</span>
                    <span className="text-primary font-semibold">¥{Number(order.totalPrice).toFixed(2)}</span>
                  </div>
                  {order.trackingNumber && <p className="text-muted-foreground text-xs mt-2">快递单号：{order.trackingNumber}</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
