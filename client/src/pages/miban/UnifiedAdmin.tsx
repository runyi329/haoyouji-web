// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { mtrpc } from "./mibanTrpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Package, Wheat, Users, BarChart3, Truck, Loader2,
  ChevronLeft, Settings, TrendingUp, Warehouse, Copy,
  ShieldCheck, UserCog, Percent, Building2
} from "lucide-react";

// ─── 订单管理 ─────────────────────────────────────────────────────────────────
const ORDER_STATUS_OPTIONS = [
  { value: "pending",    label: "待处理" },
  { value: "confirmed",  label: "已确认" },
  { value: "packing",    label: "打包中" },
  { value: "shipped",    label: "已发货" },
  { value: "delivered",  label: "已送达" },
  { value: "cancelled",  label: "已取消" },
];
const STATUS_COLORS: Record<string, string> = {
  pending:    "text-amber-600 bg-amber-50",
  confirmed:  "text-blue-600 bg-blue-50",
  packing:    "text-purple-600 bg-purple-50",
  shipped:    "text-green-600 bg-green-50",
  delivered:  "text-gray-500 bg-gray-100",
  cancelled:  "text-red-500 bg-red-50",
};

function OrdersPanel() {
  const { data: orders, isLoading, refetch } = mtrpc.order.allOrders.useQuery();
  const updateMutation = mtrpc.order.updateStatus.useMutation({
    onSuccess: () => { toast.success("状态已更新"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const [trackingInputs, setTrackingInputs] = useState<Record<number, string>>({});

  if (isLoading) return (
    <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
  );

  if (!orders?.length) return (
    <div className="text-center py-16 text-gray-300 text-[13px]">暂无订单</div>
  );

  return (
    <div className="space-y-3">
      {(orders ?? []).map((order: any) => {
        const ingredients: any[] = (() => { try { return JSON.parse(order.ingredients ?? "[]"); } catch { return []; } })();
        const statusColor = STATUS_COLORS[order.status] ?? "text-gray-500 bg-gray-100";
        return (
          <div key={order.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <h3 className="text-[14px] font-bold text-black">{order.recipeName || "定制米"}</h3>
                <p className="text-[11px] text-gray-400">#{order.id} · {order.receiverName} · {order.receiverPhone}</p>
                <p className="text-[11px] text-gray-400 truncate">{order.receiverAddress}</p>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium flex-shrink-0 ${statusColor}`}>
                {ORDER_STATUS_OPTIONS.find(o => o.value === order.status)?.label ?? order.status}
              </span>
            </div>
            {ingredients.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {ingredients.map((ing: any, i: number) => (
                  <span key={i} className="flex items-center gap-1 text-[11px] bg-gray-50 px-2 py-0.5 rounded-full text-gray-500">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ing.colorHex ?? "#C8A87A" }} />
                    {ing.name} {ing.weightJin?.toFixed(1)}斤
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[14px] font-bold" style={{ color: "#FF6900" }}>¥{Number(order.totalPrice).toFixed(2)}</span>
              <span className="text-[11px] text-gray-400">· {order.totalWeightJin}斤</span>
              <div className="ml-auto flex items-center gap-2">
                <select
                  value={order.status}
                  onChange={(e) => updateMutation.mutate({ id: order.id, status: e.target.value as any })}
                  className="text-[11px] border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none"
                >
                  {ORDER_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {order.status === "confirmed" && (
                  <div className="flex items-center gap-1">
                    <input
                      value={trackingInputs[order.id] ?? ""}
                      onChange={(e) => setTrackingInputs(p => ({ ...p, [order.id]: e.target.value }))}
                      placeholder="快递单号"
                      className="text-[11px] border border-gray-200 rounded-lg px-2 py-1 bg-white w-24 focus:outline-none"
                    />
                    <button
                      onClick={() => updateMutation.mutate({ id: order.id, status: "shipped", trackingNo: trackingInputs[order.id] })}
                      className="text-[11px] px-2 py-1 rounded-lg flex items-center gap-1 text-white"
                      style={{ background: "#FF6900" }}
                    >
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

// ─── 米库管理 ─────────────────────────────────────────────────────────────────
const RICE_CATEGORIES = ['粳米', '籼米', '糯米', '特种米', '杂粮'];

function CatalogPanel() {
  const { data: catalog, isLoading, refetch } = mtrpc.rice.catalogList.useQuery({ onlyActive: false });
  const upsertMutation = mtrpc.rice.catalogUpsert.useMutation({
    onSuccess: () => { toast.success('已保存'); refetch(); setShowForm(false); setFormData(emptyCatalogForm); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteMutation = mtrpc.rice.catalogDelete.useMutation({
    onSuccess: () => { toast.success('已删除'); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const uploadImgMutation = mtrpc.rice.catalogUploadImg.useMutation({
    onSuccess: () => { toast.success('图片已上传'); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const addToStoreMutation = mtrpc.rice.catalogAddToStore.useMutation({
    onSuccess: (r: any) => toast.success(`「${r.name}」已添加到本店米库`),
    onError: (e: any) => toast.error(e.message),
  });
  const emptyCatalogForm = { id: undefined as number | undefined, stdName: '', category: '粳米', subCategory: '', origin: '', gbStandard: '', colorHex: '#C8A87A', description: '', sortOrder: 0 };
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(emptyCatalogForm);
  const [filterCat, setFilterCat] = useState<string>('全部');
  const [addPriceId, setAddPriceId] = useState<number | null>(null);
  const [addPrice, setAddPrice] = useState('');

  function handleImgUpload(id: number, file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string).split(',')[1];
      uploadImgMutation.mutate({ id, base64, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  }

  const filtered = (catalog ?? []).filter((c: any) => filterCat === '全部' || c.category === filterCat);

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>;

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-1 mb-3" style={{ scrollbarWidth: 'none' }}>
        {['全部', ...RICE_CATEGORIES].map(cat => (
          <button key={cat} onClick={() => setFilterCat(cat)}
            className={`flex-shrink-0 text-[11px] px-3 py-1.5 rounded-full font-medium transition-colors ${
              filterCat === cat ? 'text-white' : 'bg-gray-100 text-gray-500'
            }`}
            style={filterCat === cat ? { background: '#FF6900' } : {}}>
            {cat}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[12px] text-gray-400">仓库共 {filtered.length} 种</span>
        <button onClick={() => { setFormData(emptyCatalogForm); setShowForm(true); }}
          className="text-[12px] px-3 py-1.5 rounded-xl text-white font-semibold active:scale-95"
          style={{ background: '#FF6900' }}>+ 新增米种</button>
      </div>
      {showForm && (
        <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 mb-4 space-y-3">
          <h3 className="text-[13px] font-bold">{formData.id ? '编辑仓库条目' : '新增标准米种'}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[11px] text-gray-500">标准名称 *</label>
              <input value={formData.stdName} onChange={e => setFormData(p => ({ ...p, stdName: e.target.value }))} className="w-full mt-1 text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none" placeholder="如：五常大米" /></div>
            <div><label className="text-[11px] text-gray-500">大类 *</label>
              <select value={formData.category} onChange={e => setFormData(p => ({ ...p, category: e.target.value }))} className="w-full mt-1 text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none">
                {RICE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select></div>
            <div><label className="text-[11px] text-gray-500">小类</label>
              <input value={formData.subCategory} onChange={e => setFormData(p => ({ ...p, subCategory: e.target.value }))} className="w-full mt-1 text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none" placeholder="地理标志粳米" /></div>
            <div><label className="text-[11px] text-gray-500">主要产地</label>
              <input value={formData.origin} onChange={e => setFormData(p => ({ ...p, origin: e.target.value }))} className="w-full mt-1 text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none" placeholder="五常/盘锦" /></div>
            <div><label className="text-[11px] text-gray-500">国标编号</label>
              <input value={formData.gbStandard} onChange={e => setFormData(p => ({ ...p, gbStandard: e.target.value }))} className="w-full mt-1 text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none" placeholder="GB/T 1354" /></div>
            <div><label className="text-[11px] text-gray-500">代表色</label>
              <div className="flex items-center gap-2 mt-1">
                <input type="color" value={formData.colorHex} onChange={e => setFormData(p => ({ ...p, colorHex: e.target.value }))} className="w-8 h-8 rounded-lg border border-gray-200 cursor-pointer" />
                <input value={formData.colorHex} onChange={e => setFormData(p => ({ ...p, colorHex: e.target.value }))} className="flex-1 text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none" />
              </div></div>
          </div>
          <div><label className="text-[11px] text-gray-500">简介</label>
            <textarea value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} rows={2} className="w-full mt-1 text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none resize-none" /></div>
          <div className="flex gap-2">
            <button onClick={() => upsertMutation.mutate({ id: formData.id, stdName: formData.stdName, category: formData.category, subCategory: formData.subCategory || undefined, origin: formData.origin || undefined, gbStandard: formData.gbStandard || undefined, colorHex: formData.colorHex, description: formData.description || undefined, sortOrder: formData.sortOrder })}
              disabled={!formData.stdName || upsertMutation.isPending}
              className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: '#FF6900' }}>
              {upsertMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : '保存'}
            </button>
            <button onClick={() => { setShowForm(false); setFormData(emptyCatalogForm); }} className="px-5 py-2.5 rounded-xl text-[13px] text-gray-500 bg-gray-100">取消</button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {filtered.map((item: any) => (
          <div key={item.id} className="bg-white border border-gray-100 rounded-2xl p-3 shadow-sm">
            <div className="flex items-center gap-3">
              <label className="relative flex-shrink-0 cursor-pointer group">
                {item.img
                  ? <img src={item.img} alt={item.stdName} className="w-12 h-12 rounded-xl object-cover" />
                  : <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-[11px] font-bold" style={{ backgroundColor: item.colorHex ?? '#C8A87A' }}>{item.stdName[0]}</div>
                }
                <div className="absolute inset-0 rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-white text-[9px]">换图</span>
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleImgUpload(item.id, f); }} />
              </label>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[13px] font-bold text-black">{item.stdName}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-500">{item.category}</span>
                  {item.gbStandard && <span className="text-[10px] text-gray-400">{item.gbStandard}</span>}
                </div>
                {item.origin && <div className="text-[11px] text-gray-400">产地：{item.origin}</div>}
              </div>
              <div className="flex flex-col gap-1 flex-shrink-0">
                <button onClick={() => { setFormData({ id: item.id, stdName: item.stdName, category: item.category, subCategory: item.subCategory ?? '', origin: item.origin ?? '', gbStandard: item.gbStandard ?? '', colorHex: item.colorHex ?? '#C8A87A', description: item.description ?? '', sortOrder: item.sortOrder ?? 0 }); setShowForm(true); }}
                  className="text-[11px] px-2 py-1 rounded-lg bg-blue-50 text-blue-600 font-medium">编辑</button>
                <button onClick={() => { if (confirm(`确认删除「${item.stdName}」？`)) deleteMutation.mutate({ id: item.id }); }}
                  className="text-[11px] px-2 py-1 rounded-lg bg-red-50 text-red-500 font-medium">删除</button>
              </div>
            </div>
            {addPriceId === item.id ? (
              <div className="mt-2 flex items-center gap-2 pt-2 border-t border-gray-50">
                <input type="number" value={addPrice} onChange={e => setAddPrice(e.target.value)} placeholder="定价（元/斤）" className="flex-1 text-[12px] border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none" />
                <button onClick={() => { addToStoreMutation.mutate({ catalogId: item.id, pricePerJin: parseFloat(addPrice) || 0 }); setAddPriceId(null); setAddPrice(''); }}
                  disabled={!addPrice || addToStoreMutation.isPending}
                  className="text-[11px] px-3 py-1.5 rounded-lg text-white font-medium disabled:opacity-50" style={{ background: '#FF6900' }}>确认入库</button>
                <button onClick={() => { setAddPriceId(null); setAddPrice(''); }} className="text-[11px] px-2 py-1.5 rounded-lg bg-gray-100 text-gray-500">取消</button>
              </div>
            ) : (
              <button onClick={() => { setAddPriceId(item.id); setAddPrice(''); }}
                className="mt-2 w-full text-[11px] py-1.5 rounded-xl border border-dashed border-orange-200 text-orange-400 hover:bg-orange-50 transition-colors">
                + 入店米库（设定定价）
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function RicePanel() {
  const [subTab, setSubTab] = useState<'store' | 'catalog'>('store');
  const { data: riceList, isLoading, refetch } = mtrpc.rice.adminList.useQuery();
  const upsertMutation = mtrpc.rice.upsert.useMutation({
    onSuccess: () => { toast.success("已保存"); refetch(); setShowForm(false); setFormData(emptyForm); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteMutation = mtrpc.rice.delete.useMutation({
    onSuccess: () => { toast.success("已删除"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const toggleMutation = mtrpc.rice.toggleActive.useMutation({
    onSuccess: () => refetch(),
    onError: (e: any) => toast.error(e.message),
  });
  const uploadImgMutation = mtrpc.rice.uploadImg.useMutation({
    onSuccess: () => { toast.success("图片已上传"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const emptyForm = { id: undefined as number | undefined, name: "", category: "粳米", description: "", pricePerJin: "", colorHex: "#C8A87A", img: "" };
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(emptyForm);

  function openEdit(rice: any) {
    setFormData({ id: rice.id, name: rice.name, category: rice.category ?? "粳米", description: rice.description ?? "", pricePerJin: Number(rice.pricePerJin).toFixed(1), colorHex: rice.colorHex ?? "#C8A87A", img: rice.img ?? "" });
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

  return (
    <div>
      {/* 子 Tab */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => setSubTab('store')}
          className={`flex-1 py-2 rounded-xl text-[12px] font-semibold transition-colors ${
            subTab === 'store' ? 'text-white' : 'bg-gray-100 text-gray-500'
          }`} style={subTab === 'store' ? { background: '#FF6900' } : {}}>
          本店米库
        </button>
        <button onClick={() => setSubTab('catalog')}
          className={`flex-1 py-2 rounded-xl text-[12px] font-semibold transition-colors ${
            subTab === 'catalog' ? 'text-white' : 'bg-gray-100 text-gray-500'
          }`} style={subTab === 'catalog' ? { background: '#FF6900' } : {}}>
          标准仓库
        </button>
      </div>
      {subTab === 'catalog' && <CatalogPanel />}
      {subTab === 'store' && (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-[12px] text-gray-400">共 {riceList?.length ?? 0} 种米</span>
        <button
          onClick={() => { setFormData(emptyForm); setShowForm(true); }}
          className="text-[12px] px-4 py-2 rounded-xl text-white font-semibold active:scale-95 transition-transform"
          style={{ background: "#FF6900" }}
        >
          + 手动添加
        </button>
      </div>

      {showForm && (
        <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 mb-4 space-y-3">
          <h3 className="text-[13px] font-bold text-gray-800">{formData.id ? "编辑米种" : "添加米种"}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-gray-500">名称 *</label>
              <input value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} className="w-full mt-1 text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-orange-300" placeholder="如：黑米" />
            </div>
            <div>
              <label className="text-[11px] text-gray-500">单价（元/斤） *</label>
              <input type="number" value={formData.pricePerJin} onChange={e => setFormData(p => ({ ...p, pricePerJin: e.target.value }))} className="w-full mt-1 text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-orange-300" placeholder="8.5" />
            </div>
            <div>
              <label className="text-[11px] text-gray-500">颜色</label>
              <div className="flex items-center gap-2 mt-1">
                <input type="color" value={formData.colorHex} onChange={e => setFormData(p => ({ ...p, colorHex: e.target.value }))} className="w-8 h-8 rounded-lg border border-gray-200 cursor-pointer" />
                <input value={formData.colorHex} onChange={e => setFormData(p => ({ ...p, colorHex: e.target.value }))} className="flex-1 text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none" />
              </div>
            </div>
            <div>
              <label className="text-[11px] text-gray-500">分类</label>
              <select value={formData.category} onChange={e => setFormData(p => ({ ...p, category: e.target.value }))} className="w-full mt-1 text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none">
                {RICE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[11px] text-gray-500">简介</label>
            <textarea value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} rows={2} className="w-full mt-1 text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none resize-none" placeholder="米种特点介绍" />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => upsertMutation.mutate({ id: formData.id, name: formData.name, category: formData.category, description: formData.description, pricePerJin: parseFloat(formData.pricePerJin) || 0, colorHex: formData.colorHex })}
              disabled={!formData.name || !formData.pricePerJin || upsertMutation.isPending}
              className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-50 active:scale-95 transition-transform"
              style={{ background: "#FF6900" }}
            >
              {upsertMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "保存"}
            </button>
            <button onClick={() => { setShowForm(false); setFormData(emptyForm); }} className="px-5 py-2.5 rounded-xl text-[13px] font-semibold text-gray-500 bg-gray-100 active:scale-95 transition-transform">
              取消
            </button>
          </div>
        </div>
      )}

      {isLoading && <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>}
      <div className="space-y-2">
        {(riceList ?? []).map((rice: any) => (
          <div key={rice.id} className={`bg-white border border-gray-100 rounded-2xl p-3 flex items-center gap-3 shadow-sm transition-opacity ${rice.isActive ? "" : "opacity-50"}`}>
            <label className="relative flex-shrink-0 cursor-pointer group">
              {rice.img
                ? <img src={rice.img} alt={rice.name} className="w-12 h-12 rounded-xl object-cover" />
                : <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: rice.colorHex ?? "#C8A87A" }}>{rice.name[0]}</div>
              }
              <div className="absolute inset-0 rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="text-white text-[9px]">换图</span>
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleImgUpload(rice.id, f); }} />
            </label>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold text-black">{rice.name}</div>
              <div className="text-[11px] text-gray-400 truncate">{rice.description}</div>
            </div>
            <span className="text-[13px] font-bold flex-shrink-0" style={{ color: "#FF6900" }}>¥{Number(rice.pricePerJin).toFixed(1)}/斤</span>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button onClick={() => toggleMutation.mutate({ id: rice.id, isActive: !rice.isActive })} className={`text-[11px] px-2 py-1 rounded-lg font-medium transition-colors ${rice.isActive ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400"}`}>
                {rice.isActive ? "上架" : "下架"}
              </button>
              <button onClick={() => openEdit(rice)} className="text-[11px] px-2 py-1 rounded-lg bg-blue-50 text-blue-600 font-medium">编辑</button>
              <button onClick={() => { if (confirm(`确认删除「${rice.name}」？`)) deleteMutation.mutate({ id: rice.id }); }} className="text-[11px] px-2 py-1 rounded-lg bg-red-50 text-red-500 font-medium">删除</button>
            </div>
          </div>
        ))}
      </div>
    </div>
      )}
    </div>
  );
}

// ─── 集散中心（占位架构）─────────────────────────────────────────────────────
const DISTRIBUTION_CENTERS = [
  { id: 1, name: "华东仓", location: "上海", status: "active" },
  { id: 2, name: "华南仓", location: "广州", status: "active" },
  { id: 3, name: "华北仓", location: "北京", status: "active" },
  { id: 4, name: "西南仓", location: "成都", status: "planned" },
  { id: 5, name: "华中仓", location: "武汉", status: "planned" },
];

function WarehousePanel() {
  return (
    <div className="space-y-3">
      <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 mb-2">
        <p className="text-[12px] text-orange-600 font-medium">架构预留 · 功能开发中</p>
        <p className="text-[11px] text-orange-400 mt-1">集散中心库存管理系统正在建设，以下为规划节点</p>
      </div>
      {DISTRIBUTION_CENTERS.map((center) => (
        <div key={center.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: center.status === "active" ? "#FF6900" : "#E5E7EB" }}>
              <Warehouse className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-[14px] font-bold text-black">{center.name}</h3>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${center.status === "active" ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400"}`}>
                  {center.status === "active" ? "运营中" : "规划中"}
                </span>
              </div>
              <p className="text-[11px] text-gray-400">{center.location}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-[11px] text-gray-400">库存</p>
              <p className="text-[16px] font-bold text-gray-300">—</p>
            </div>
          </div>
          {center.status === "active" && (
            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-50">
              <div className="text-center">
                <p className="text-[10px] text-gray-400">今日出库</p>
                <p className="text-[14px] font-bold text-gray-300">—</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-gray-400">本月订单</p>
                <p className="text-[14px] font-bold text-gray-300">—</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-gray-400">剩余库存</p>
                <p className="text-[14px] font-bold text-gray-300">—</p>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── 用户管理 ─────────────────────────────────────────────────────────────────
const ROLE_LABELS: Record<string, string> = {
  baby: "顾客",
  parent: "米商/经销商",
};
const ROLE_COLORS: Record<string, string> = {
  baby: "bg-gray-100 text-gray-500",
  parent: "bg-blue-50 text-blue-600",
};

function UsersPanel() {
  const utils = mtrpc.useUtils();
  const { data: users, isLoading } = mtrpc.adminUser.list.useQuery();
  const setRoleMutation = mtrpc.adminUser.setRole.useMutation({
    onSuccess: () => { utils.adminUser.list.invalidate(); toast.success("角色已更新"); },
    onError: (e: any) => toast.error(e.message),
  });
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"createdAt" | "usdtBalance" | "cnyBalance" | "orderCount" | "inviteCount">("createdAt");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const handleSort = (key: typeof sortBy) => {
    if (sortBy === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortBy(key); setSortDir("desc"); }
  };

  const filtered = (users ?? [])
    .filter((u: any) => !search || (u.name ?? "").includes(search) || (u.username ?? "").includes(search))
    .sort((a: any, b: any) => {
      let av = 0, bv = 0;
      if (sortBy === "usdtBalance") { av = a.usdtBalance ?? parseFloat(a.balance ?? "0"); bv = b.usdtBalance ?? parseFloat(b.balance ?? "0"); }
      else if (sortBy === "cnyBalance") { av = a.cnyBalance ?? 0; bv = b.cnyBalance ?? 0; }
      else if (sortBy === "orderCount") { av = a.orderCount ?? 0; bv = b.orderCount ?? 0; }
      else if (sortBy === "inviteCount") { av = a.inviteCount ?? 0; bv = b.inviteCount ?? 0; }
      else { av = new Date(a.createdAt ?? 0).getTime(); bv = new Date(b.createdAt ?? 0).getTime(); }
      return sortDir === "desc" ? bv - av : av - bv;
    });

  return (
    <div className="space-y-4">
      <input
        placeholder="搜索昵称或用户名…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full text-[13px] border border-gray-200 rounded-xl px-4 py-2.5 bg-white focus:outline-none focus:border-orange-300"
      />
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-gray-400">排序：</span>
        {([
          { key: "createdAt", label: "注册时间" },
          { key: "usdtBalance", label: "USDT" },
          { key: "cnyBalance", label: "人民币" },
          { key: "orderCount", label: "订单数" },
          { key: "inviteCount", label: "推荐数" },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => handleSort(key)}
            className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${
              sortBy === key
                ? "border-orange-400 text-orange-500 bg-orange-50 font-medium"
                : "border-gray-200 text-gray-400 hover:border-orange-300 hover:text-orange-400"
            }`}
          >
            {label}{sortBy === key ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-gray-300">{filtered.length} 人</span>
      </div>
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : !filtered.length ? (
        <div className="text-center py-12 text-gray-300 text-[13px]">暂无用户</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((u: any) => (
            <div key={u.id} className="bg-white border border-gray-100 rounded-2xl px-4 py-3 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white text-sm font-bold" style={{ background: "#FF6900" }}>
                  {(u.name ?? "用").slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-black truncate">{u.name ?? "匿名用户"}</p>
                  <p className="text-[11px] text-gray-400 truncate">@{u.username}</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${ROLE_COLORS[u.mibanRole] ?? "bg-gray-100 text-gray-500"}`}>
                  {ROLE_LABELS[u.mibanRole] ?? u.mibanRole}
                </span>
              </div>
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-gray-400">USDT</span>
                  <span className="text-[12px] font-bold text-orange-500">{(u.usdtBalance ?? parseFloat(u.balance ?? '0')).toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-gray-400">人民币</span>
                  <span className="text-[12px] font-bold text-green-600">¥{(u.cnyBalance ?? 0).toFixed(2)}</span>
                </div>
                <span className="text-[11px] text-gray-300 ml-auto">积分 {u.points ?? 0}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] text-gray-400">设为：</span>
                {(["baby", "parent"] as const).map(role => (
                  <button
                    key={role}
                    disabled={u.mibanRole === role || setRoleMutation.isPending}
                    onClick={() => setRoleMutation.mutate({ userId: u.id, role })}
                    className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${
                      u.mibanRole === role
                        ? "border-gray-100 text-gray-300 cursor-default"
                        : "border-gray-200 text-gray-500 hover:border-orange-300 hover:text-orange-500 cursor-pointer"
                    }`}
                  >
                    {ROLE_LABELS[role]}
                  </button>
                ))}
                <span className="ml-auto text-[11px] text-gray-300">
                  订单 {u.orderCount ?? 0} | 推荐 {u.inviteCount} 人
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 销售团队（佣金配置）─────────────────────────────────────────────────────
function SalesPanel() {
  const utils = mtrpc.useUtils();
  const { data: configs, isLoading } = mtrpc.adminCommission.configs.useQuery();
  const { data: agentStats } = mtrpc.adminCommission.agentStats.useQuery();
  const setConfigMutation = mtrpc.adminCommission.setConfig.useMutation({
    onSuccess: () => { utils.adminCommission.configs.invalidate(); toast.success("佣金配置已保存"); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteConfigMutation = mtrpc.adminCommission.deleteConfig.useMutation({
    onSuccess: () => { utils.adminCommission.configs.invalidate(); toast.success("已删除"); },
    onError: (e: any) => toast.error(e.message),
  });

  const [globalRate, setGlobalRate] = useState("");
  const [globalNote, setGlobalNote] = useState("");
  const [agentId, setAgentId] = useState("");
  const [agentRate, setAgentRate] = useState("");
  const [agentNote, setAgentNote] = useState("");

  const globalConfig = configs?.find((c: any) => c.agentId === null);

  function saveGlobal() {
    const rate = parseFloat(globalRate) / 100;
    if (isNaN(rate) || rate < 0 || rate > 1) { toast.error("请输入0-100之间的百分比"); return; }
    setConfigMutation.mutate({ agentId: null, rate, note: globalNote || undefined });
    setGlobalRate(""); setGlobalNote("");
  }

  function saveAgent() {
    const id = parseInt(agentId);
    const rate = parseFloat(agentRate) / 100;
    if (isNaN(id) || id <= 0) { toast.error("请输入有效的业务员用户ID"); return; }
    if (isNaN(rate) || rate < 0 || rate > 1) { toast.error("请输入0-100之间的百分比"); return; }
    setConfigMutation.mutate({ agentId: id, rate, note: agentNote || undefined });
    setAgentId(""); setAgentRate(""); setAgentNote("");
  }

  return (
    <div className="space-y-4">
      {/* 全局默认比例 */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-bold text-black">全局默认佣金比例</h3>
          {globalConfig && (
            <span className="text-[14px] font-bold" style={{ color: "#FF6900" }}>
              当前：{(Number(globalConfig.commissionRate) * 100).toFixed(1)}%
            </span>
          )}
        </div>
        <p className="text-[11px] text-gray-400">未单独设置的业务员均适用此比例</p>
        <div className="flex gap-2">
          <input placeholder="比例 % (如 5)" value={globalRate} onChange={e => setGlobalRate(e.target.value)} className="flex-1 text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-orange-300" />
          <input placeholder="备注（选填）" value={globalNote} onChange={e => setGlobalNote(e.target.value)} className="flex-1 text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-orange-300" />
          <button onClick={saveGlobal} disabled={setConfigMutation.isPending} className="px-4 py-2 rounded-xl text-[13px] font-semibold text-white disabled:opacity-50 flex-shrink-0 active:scale-95 transition-transform" style={{ background: "#FF6900" }}>
            保存
          </button>
        </div>
      </div>

      {/* 个人专属比例 */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-3">
        <h3 className="text-[13px] font-bold text-black">单独设置业务员比例</h3>
        <p className="text-[11px] text-gray-400">为特定业务员设置专属佣金比例，优先级高于全局</p>
        <div className="grid grid-cols-2 gap-2">
          <input placeholder="业务员用户ID" value={agentId} onChange={e => setAgentId(e.target.value)} className="text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-orange-300" />
          <input placeholder="比例 % (如 8)" value={agentRate} onChange={e => setAgentRate(e.target.value)} className="text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-orange-300" />
        </div>
        <div className="flex gap-2">
          <input placeholder="备注（选填）" value={agentNote} onChange={e => setAgentNote(e.target.value)} className="flex-1 text-[13px] border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-orange-300" />
          <button onClick={saveAgent} disabled={setConfigMutation.isPending} className="px-4 py-2 rounded-xl text-[13px] font-semibold text-white disabled:opacity-50 flex-shrink-0 active:scale-95 transition-transform" style={{ background: "#FF6900" }}>
            保存
          </button>
        </div>
      </div>

      {/* 已有配置 */}
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : configs && configs.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[11px] text-gray-400 uppercase tracking-wider">已有配置</p>
          {configs.map((c: any) => (
            <div key={c.id} className="bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm">
              <div className="flex-1">
                <p className="text-[13px] font-medium text-black">
                  {c.agentId === null ? "全局默认" : `业务员 ID: ${c.agentId}`}
                </p>
                {c.note && <p className="text-[11px] text-gray-400 mt-0.5">{c.note}</p>}
              </div>
              <span className="text-[16px] font-bold flex-shrink-0" style={{ color: "#FF6900" }}>
                {(Number(c.commissionRate) * 100).toFixed(1)}%
              </span>
              <button onClick={() => deleteConfigMutation.mutate({ id: c.id })} disabled={deleteConfigMutation.isPending} className="text-gray-300 hover:text-red-400 transition-colors text-[12px] ml-1">
                删除
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {/* 业务员业绩汇总 */}
      {agentStats && agentStats.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] text-gray-400 uppercase tracking-wider">业务员业绩汇总</p>
          {agentStats.map((a: any) => (
            <div key={a.id} className="bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-black truncate">{a.name ?? "匿名"}</p>
                <p className="text-[11px] text-gray-400">ID: {a.id} · 推荐 {a.inviteCount} 人 · {a.orderCount} 单</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-[15px] font-bold" style={{ color: "#FF6900" }}>¥{Number(a.totalCommission).toFixed(2)}</p>
                <p className="text-[11px] text-amber-500">待结算 ¥{Number(a.pendingCommission).toFixed(2)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 团队长视图：我的团队业绩 ─────────────────────────────────────────────────
function AgentTeamPanel() {
  const { data: stats, isLoading: statsLoading } = mtrpc.agent.myMonthlyStats.useQuery();
  const { data: referrals, isLoading: referralsLoading } = mtrpc.agent.myReferrals.useQuery();
  const { data: commissions, isLoading: commissionsLoading } = mtrpc.agent.myCommissions.useQuery();
  const { data: inviteInfo } = mtrpc.agent.myInviteInfo.useQuery();
  const inviteLink = inviteInfo?.inviteCode ? `${window.location.origin}/join?ref=${inviteInfo.inviteCode}` : "";

  return (
    <div className="space-y-4">
      {/* 统计卡片 */}
      {statsLoading ? (
        <div className="grid grid-cols-2 gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl p-4 text-white" style={{ background: "#FF6900" }}>
            <p className="text-[11px] text-white/70 mb-1">本月总佣金</p>
            <p className="text-[22px] font-bold">¥{Number(stats?.totalCommission ?? 0).toFixed(2)}</p>
          </div>
          <div className="rounded-2xl p-4 bg-white border border-gray-100 shadow-sm">
            <p className="text-[11px] text-gray-400 mb-1">待结算</p>
            <p className="text-[22px] font-bold text-amber-500">¥{Number(stats?.pendingCommission ?? 0).toFixed(2)}</p>
          </div>
          <div className="rounded-2xl p-4 bg-white border border-gray-100 shadow-sm">
            <p className="text-[11px] text-gray-400 mb-1">已结算</p>
            <p className="text-[22px] font-bold text-green-500">¥{Number(stats?.settledCommission ?? 0).toFixed(2)}</p>
          </div>
          <div className="rounded-2xl p-4 bg-white border border-gray-100 shadow-sm">
            <p className="text-[11px] text-gray-400 mb-1">本月订单数</p>
            <p className="text-[22px] font-bold text-gray-800">{stats?.orderCount ?? 0}<span className="text-[12px] font-normal text-gray-400 ml-1">单</span></p>
          </div>
        </div>
      )}

      {/* 邀请码 */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[11px] text-gray-400 mb-1">我的邀请码</p>
            <p className="text-[28px] font-mono font-bold tracking-[0.2em]" style={{ color: "#FF6900" }}>
              {inviteInfo?.inviteCode ?? "——"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-gray-400 mb-1">已推荐</p>
            <p className="text-[24px] font-bold text-gray-800">{inviteInfo?.inviteCount ?? 0}<span className="text-[12px] font-normal text-gray-400 ml-1">人</span></p>
          </div>
        </div>
        <div className="bg-gray-50 rounded-xl px-3 py-2 flex items-center gap-2">
          <p className="text-[11px] text-gray-400 flex-1 truncate">{inviteLink || "生成中…"}</p>
          <button
            onClick={() => { if (inviteLink) navigator.clipboard.writeText(inviteLink).then(() => toast.success("邀请链接已复制")); }}
            className="flex items-center gap-1 text-[12px] font-semibold flex-shrink-0 active:scale-95 transition-transform"
            style={{ color: "#FF6900" }}
          >
            <Copy className="w-3.5 h-3.5" />复制
          </button>
        </div>
      </div>

      {/* 推荐用户 */}
      <div>
        <h3 className="text-[13px] font-bold text-black mb-3">推荐用户 {referrals ? `(${referrals.length})` : ""}</h3>
        {referralsLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
        ) : !referrals?.length ? (
          <div className="text-center py-8 text-gray-300 text-[12px]">暂无推荐用户</div>
        ) : (
          <div className="space-y-2">
            {referrals.map((u: any) => (
              <div key={u.id} className="bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm">
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white text-sm font-bold" style={{ background: "#FF6900" }}>
                  {(u.name ?? "用").slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-black truncate">{u.name ?? "匿名用户"}</p>
                  <p className="text-[11px] text-gray-400">{u.createdAt ? new Date(u.createdAt).toLocaleDateString("zh-CN") : ""} 加入</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[11px] text-gray-400">推荐</p>
                  <p className="text-[13px] font-medium text-gray-600">{u.inviteCount} 人</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 佣金明细 */}
      <div>
        <h3 className="text-[13px] font-bold text-black mb-3">佣金明细 {commissions ? `(${commissions.length})` : ""}</h3>
        {commissionsLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        ) : !commissions?.length ? (
          <div className="text-center py-8 text-gray-300 text-[12px]">暂无佣金记录</div>
        ) : (
          <div className="space-y-2">
            {commissions.map((c: any) => (
              <div key={c.id} className="bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[11px] text-gray-400 font-mono">{c.orderNo}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${c.status === "settled" ? "bg-green-50 text-green-600" : c.status === "cancelled" ? "bg-red-50 text-red-500" : "bg-amber-50 text-amber-600"}`}>
                    {c.status === "settled" ? "已结算" : c.status === "cancelled" ? "已取消" : "待结算"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-gray-400">订单 ¥{Number(c.orderAmount).toFixed(2)} · 比例 {(Number(c.commissionRate) * 100).toFixed(1)}%</p>
                  <p className="text-[15px] font-bold" style={{ color: "#FF6900" }}>+¥{Number(c.commissionAmount).toFixed(2)}</p>
                </div>
                <p className="text-[10px] text-gray-300 mt-1">{new Date(c.createdAt).toLocaleDateString("zh-CN")}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 主页面 ───────────────────────────────────────────────────────────────────
type AdminTabKey = "orders" | "rice" | "warehouse" | "users" | "sales" | "team" | "commission" | "referrals";

export default function UnifiedAdmin() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const username = (user as any)?.username as string ?? "";
  const mibanRole = (user as any)?.mibanRole as string ?? "baby";
  const isMibanAdmin = username === "jiang";
  const isMibanAgent = mibanRole === "parent";

  // 权限检查
  if (!isAuthenticated) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <div className="text-center px-6">
          <ShieldCheck className="w-12 h-12 mx-auto mb-4 text-gray-200" />
          <p className="text-[14px] text-gray-400 mb-4">请先登录</p>
          <button onClick={() => setLocation("/p/proj_hzxm2t")} className="text-[13px] font-semibold" style={{ color: "#FF6900" }}>返回首页</button>
        </div>
      </div>
    );
  }

  if (!isMibanAdmin && !isMibanAgent) {
    return (
      <div className="bg-white min-h-screen flex items-center justify-center">
        <div className="text-center px-6">
          <ShieldCheck className="w-12 h-12 mx-auto mb-4 text-gray-200" />
          <p className="text-[14px] text-gray-400 mb-4">此页面仅限管理员或销售团队访问</p>
          <button onClick={() => setLocation("/p/proj_hzxm2t")} className="text-[13px] font-semibold" style={{ color: "#FF6900" }}>返回首页</button>
        </div>
      </div>
    );
  }

  const isAdmin = isMibanAdmin;

  // 管理员标签
  const adminTabs: Array<{ key: AdminTabKey; label: string }> = isAdmin ? [
    { key: "orders",    label: "订单管理" },
    { key: "rice",      label: "米库管理" },
    { key: "warehouse", label: "集散中心" },
    { key: "users",     label: "用户管理" },
    { key: "sales",     label: "销售团队" },
  ] : [
    // 业务员/团队长标签
    { key: "team",       label: "团队业绩" },
    { key: "commission", label: "我的佣金" },
    { key: "referrals",  label: "我的推荐" },
  ];

  const defaultTab = adminTabs[0].key;
  const [activeTab, setActiveTab] = useState<AdminTabKey>(defaultTab);

  return (
    <div className="bg-[#F8F6F3] min-h-screen">
      {/* 顶部导航 */}
      <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-0">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => setLocation("/p/proj_hzxm2t")} className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100 text-gray-500 active:scale-95 transition-transform flex-shrink-0">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-[17px] font-bold text-black">
              {isAdmin ? "管理中心" : "销售中心"}
            </h1>
            <p className="text-[11px] text-gray-400">
              {isAdmin ? "米伴平台运营管理" : "我的销售数据"}
            </p>
          </div>
          <span className={`text-[10px] px-2.5 py-1 rounded-full font-semibold flex-shrink-0 ${isAdmin ? "bg-orange-50 text-orange-600" : "bg-blue-50 text-blue-600"}`}>
            {isAdmin ? "管理员" : "销售"}
          </span>
        </div>

        {/* 横向滚动标签栏 */}
        <div className="flex gap-1 overflow-x-auto pb-0 scrollbar-hide -mx-4 px-4">
          {adminTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex items-center px-4 py-2.5 text-[12px] font-semibold whitespace-nowrap transition-all flex-shrink-0 border-b-2"
              style={{
                color: activeTab === tab.key ? "#FF6900" : "#888",
                borderBottomColor: activeTab === tab.key ? "#FF6900" : "transparent",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 内容区域 */}
      <div className="px-4 py-4 pb-24">
        {activeTab === "orders"    && <OrdersPanel />}
        {activeTab === "rice"      && <RicePanel />}
        {activeTab === "warehouse" && <WarehousePanel />}
        {activeTab === "users"     && <UsersPanel />}
        {activeTab === "sales"     && <SalesPanel />}
        {/* 业务员视图 */}
        {(activeTab === "team" || activeTab === "commission" || activeTab === "referrals") && <AgentTeamPanel />}
      </div>
    </div>
  );
}
