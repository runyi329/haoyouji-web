// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { mtrpc } from "./mibanTrpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Package, Wheat, Settings, Loader2, CheckCircle, Truck } from "lucide-react";

const ORDER_STATUS_OPTIONS = [
  { value: "pending", label: "待处理" },
  { value: "processing", label: "处理中" },
  { value: "shipped", label: "已发货" },
  { value: "delivered", label: "已送达" },
  { value: "cancelled", label: "已取消" },
];

const STATUS_COLORS: Record<string, string> = {
  pending: "text-gray-700 bg-gray-100",
  processing: "text-blue-600 bg-blue-50",
  shipped: "text-green-600 bg-green-50",
  delivered: "text-gray-600 bg-gray-100",
  cancelled: "text-red-600 bg-red-50",
};

function OrdersTab() {
  const { data: orders, isLoading, refetch } = mtrpc.order.allOrders.useQuery();
  const updateMutation = mtrpc.order.updateStatus.useMutation({ onSuccess: () => { toast.success("状态已更新"); refetch(); }, onError: (e: any) => toast.error(e.message) });
  const [trackingInputs, setTrackingInputs] = useState<Record<number, string>>({});

  if (isLoading) return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>;

  return (
    <div className="space-y-3">
      {(orders ?? []).map((order: any) => {
        const ingredients: any[] = (() => { try { return JSON.parse(order.ingredients as any ?? "[]"); } catch { return []; } })();
        const statusColor = STATUS_COLORS[order.status] ?? "text-gray-600 bg-gray-100";
        return (
          <div key={order.id} className="washi-card p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 className="font-semibold text-foreground text-sm">{order.recipeName}</h3>
                <p className="text-muted-foreground text-xs">#{order.id} · {order.receiverName} · {order.receiverPhone}</p>
                <p className="text-muted-foreground text-xs">{order.receiverAddress}</p>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0 ${statusColor}`}>{ORDER_STATUS_OPTIONS.find(o => o.value === order.status)?.label ?? order.status}</span>
            </div>
            {ingredients.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {ingredients.map((ing: any, i: number) => (
                  <span key={i} className="flex items-center gap-1 text-xs bg-muted/60 px-2 py-0.5 rounded-full">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ing.colorHex ?? "#C8A87A" }} />{ing.name} {ing.weightJin?.toFixed(1)}斤
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-primary font-semibold text-sm">¥{Number(order.totalPrice).toFixed(2)}</span>
              <span className="text-muted-foreground text-xs">· {order.totalWeightJin}斤</span>
              <div className="ml-auto flex items-center gap-2">
                <select value={order.status} onChange={(e) => updateMutation.mutate({ id: order.id, status: e.target.value as any, trackingNo: undefined })}
                  className="text-xs border border-border/60 rounded-lg px-2 py-1 bg-background focus:outline-none">
                  {ORDER_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {order.status === "processing" && (
                  <div className="flex items-center gap-1">
                    <input value={trackingInputs[order.id] ?? ""} onChange={(e) => setTrackingInputs(p => ({ ...p, [order.id]: e.target.value }))}
                      placeholder="快递单号" className="text-xs border border-border/60 rounded-lg px-2 py-1 bg-background w-28 focus:outline-none" />
                    <button onClick={() => updateMutation.mutate({ id: order.id, status: "shipped", trackingNo: trackingInputs[order.id] })}
                      className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded-lg flex items-center gap-1">
                      <Truck className="w-3 h-3" />发货
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RiceManageTab() {
  const { data: riceList, isLoading, refetch } = mtrpc.rice.list.useQuery({});
  const updateMutation = mtrpc.rice.upsert.useMutation({ onSuccess: () => { toast.success("已更新"); refetch(); }, onError: (e: any) => toast.error(e.message) });
  const [editing, setEditing] = useState<Record<number, { pricePerJin?: string; stock?: string }>>({});

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>;

  return (
    <div className="space-y-2">
      {riceList?.map((rice) => {
        const edit = editing[rice.id] ?? {};
        return (
          <div key={rice.id} className="washi-card p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: rice.colorHex ?? "#C8A87A" }} />
            <span className="text-sm font-medium text-foreground flex-1">{rice.name}</span>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">¥</span>
                <input type="number" value={edit.pricePerJin ?? Number(rice.pricePerJin).toFixed(1)} onChange={(e) => setEditing(p => ({ ...p, [rice.id]: { ...p[rice.id], pricePerJin: e.target.value } }))}
                  className="w-16 text-xs border border-border/60 rounded-lg px-2 py-1 bg-background focus:outline-none" />
                <span className="text-xs text-muted-foreground">/斤</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">库存</span>
                <input type="number" value={edit.stock ?? (rice.stock ?? "")} onChange={(e) => setEditing(p => ({ ...p, [rice.id]: { ...p[rice.id], stock: e.target.value } }))}
                  className="w-16 text-xs border border-border/60 rounded-lg px-2 py-1 bg-background focus:outline-none" />
                <span className="text-xs text-muted-foreground">斤</span>
              </div>
              <button onClick={() => { if (!edit.pricePerJin && !edit.stock) return; updateMutation.mutate({ id: rice.id, name: rice.name, category: rice.category, pricePerJin: edit.pricePerJin ? parseFloat(edit.pricePerJin) : Number(rice.pricePerJin), stock: edit.stock ? parseInt(edit.stock) : undefined }); setEditing(p => { const n = { ...p }; delete n[rice.id]; return n; }); }}
                className="text-primary hover:text-primary/80 transition-colors"><CheckCircle className="w-4 h-4" /></button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminPanel() {
  const { user } = useAuth();

  if (user?.role !== "super_admin") return (
    <div className="container py-16 text-center">
      <Settings className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
      <p className="text-muted-foreground">需要管理员权限</p>
    </div>
  );

  return (
    <main className="page-enter">
      <section className="bg-gradient-to-br from-slate-50/60 to-background border-b border-border/40">
        <div className="container py-8">
          <h1 className="font-serif text-3xl font-bold text-foreground mb-1">管理后台</h1>
          <p className="text-muted-foreground text-sm">米伴平台运营管理中心</p>
        </div>
      </section>
      <div className="container py-6">
        <Tabs defaultValue="orders">
          <TabsList className="mb-6 bg-muted/60 rounded-xl p-1">
            <TabsTrigger value="orders" className="rounded-lg gap-2 text-sm"><Package className="w-4 h-4" />订单管理</TabsTrigger>
            <TabsTrigger value="rice" className="rounded-lg gap-2 text-sm"><Wheat className="w-4 h-4" />米种管理</TabsTrigger>
          </TabsList>
          <TabsContent value="orders"><OrdersTab /></TabsContent>
          <TabsContent value="rice"><RiceManageTab /></TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
