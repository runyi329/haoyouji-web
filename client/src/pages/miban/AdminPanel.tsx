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
  const { data: riceList, isLoading, refetch } = mtrpc.rice.adminList.useQuery();
  const upsertMutation = mtrpc.rice.upsert.useMutation({ onSuccess: () => { toast.success("已保存"); refetch(); setShowForm(false); setFormData(emptyForm); }, onError: (e: any) => toast.error(e.message) });
  const deleteMutation = mtrpc.rice.delete.useMutation({ onSuccess: () => { toast.success("已删除"); refetch(); }, onError: (e: any) => toast.error(e.message) });
  const toggleMutation = mtrpc.rice.toggleActive.useMutation({ onSuccess: () => refetch(), onError: (e: any) => toast.error(e.message) });
  const uploadImgMutation = mtrpc.rice.uploadImg.useMutation({ onSuccess: (d: any) => { toast.success("图片已上传"); refetch(); }, onError: (e: any) => toast.error(e.message) });

  const emptyForm = { id: undefined as number | undefined, name: "", category: "山田米", description: "", pricePerJin: "", colorHex: "#C8A87A", img: "" };
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(emptyForm);

  function openEdit(rice: any) {
    setFormData({ id: rice.id, name: rice.name, category: rice.category ?? "山田米", description: rice.description ?? "", pricePerJin: Number(rice.pricePerJin).toFixed(1), colorHex: rice.colorHex ?? "#C8A87A", img: rice.img ?? "" });
    setShowForm(true);
  }

  function handleImgUpload(id: number, file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      uploadImgMutation.mutate({ id, base64, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  }

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-muted-foreground">共 {riceList?.length ?? 0} 种米</span>
        <Button size="sm" onClick={() => { setFormData(emptyForm); setShowForm(true); }} className="gap-1.5 text-xs">
          + 添加米种
        </Button>
      </div>

      {/* 表单弹层 */}
      {showForm && (
        <div className="washi-card p-5 mb-4 space-y-3">
          <h3 className="font-semibold text-sm">{formData.id ? "编辑米种" : "添加米种"}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">名称 *</label>
              <input value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} className="w-full mt-1 text-sm border border-border/60 rounded-lg px-3 py-2 bg-background focus:outline-none" placeholder="如：黑米" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">单价（元/斤） *</label>
              <input type="number" value={formData.pricePerJin} onChange={e => setFormData(p => ({ ...p, pricePerJin: e.target.value }))} className="w-full mt-1 text-sm border border-border/60 rounded-lg px-3 py-2 bg-background focus:outline-none" placeholder="8.5" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">颜色（HEX）</label>
              <div className="flex items-center gap-2 mt-1">
                <input type="color" value={formData.colorHex} onChange={e => setFormData(p => ({ ...p, colorHex: e.target.value }))} className="w-8 h-8 rounded border border-border/60 cursor-pointer" />
                <input value={formData.colorHex} onChange={e => setFormData(p => ({ ...p, colorHex: e.target.value }))} className="flex-1 text-sm border border-border/60 rounded-lg px-3 py-2 bg-background focus:outline-none" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">分类</label>
              <input value={formData.category} onChange={e => setFormData(p => ({ ...p, category: e.target.value }))} className="w-full mt-1 text-sm border border-border/60 rounded-lg px-3 py-2 bg-background focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">简介</label>
            <textarea value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} rows={2} className="w-full mt-1 text-sm border border-border/60 rounded-lg px-3 py-2 bg-background focus:outline-none resize-none" placeholder="米种特点介绍" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={() => upsertMutation.mutate({ id: formData.id, name: formData.name, category: formData.category, description: formData.description, pricePerJin: parseFloat(formData.pricePerJin) || 0, colorHex: formData.colorHex })} disabled={!formData.name || !formData.pricePerJin || upsertMutation.isPending} className="flex-1 text-xs">
              {upsertMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "保存"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setShowForm(false); setFormData(emptyForm); }} className="text-xs">取消</Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {(riceList ?? []).map((rice: any) => (
          <div key={rice.id} className={`washi-card p-4 flex items-center gap-3 transition-opacity ${rice.isActive ? "" : "opacity-50"}`}>
            {/* 图片 + 上传 */}
            <label className="relative flex-shrink-0 cursor-pointer group">
              {rice.img
                ? <img src={rice.img} alt={rice.name} className="w-12 h-12 rounded-xl object-cover" />
                : <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: rice.colorHex ?? "#C8A87A" }}>{rice.name[0]}</div>
              }
              <div className="absolute inset-0 rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="text-white text-[9px]">换图</span>
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleImgUpload(rice.id, f); }} />
            </label>
            {/* 信息 */}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm text-foreground">{rice.name}</div>
              <div className="text-xs text-muted-foreground truncate">{rice.description}</div>
            </div>
            {/* 价格 */}
            <span className="text-sm font-semibold text-[#FF6900] flex-shrink-0">¥{Number(rice.pricePerJin).toFixed(1)}/斤</span>
            {/* 操作 */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button onClick={() => toggleMutation.mutate({ id: rice.id, isActive: !rice.isActive })} className={`text-xs px-2 py-1 rounded-lg font-medium transition-colors ${rice.isActive ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400"}`}>
                {rice.isActive ? "上架" : "下架"}
              </button>
              <button onClick={() => openEdit(rice)} className="text-xs px-2 py-1 rounded-lg bg-blue-50 text-blue-600 font-medium">编辑</button>
              <button onClick={() => { if (confirm(`确认删除「${rice.name}」？`)) deleteMutation.mutate({ id: rice.id }); }} className="text-xs px-2 py-1 rounded-lg bg-red-50 text-red-500 font-medium">删除</button>
            </div>
          </div>
        ))}
      </div>
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
