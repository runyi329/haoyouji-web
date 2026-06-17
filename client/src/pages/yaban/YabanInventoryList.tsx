/**
 * 牙伴齿科管理 - 库存一览
 * 路由：/yaban/inventory/list
 * 支持搜索、分类切换、筛选(低库存/近效期/过期)、新增物品
 */
import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { PageTag } from "@/components/PageTag";
import { trpc } from "@/lib/trpc";
import { useYabanClinic } from "./useYabanClinic";
import YabanClinicTag from "./YabanClinicTag";
import { toast } from "sonner";
import {
  ChevronLeft,
  Search,
  Plus,
  X,
  Boxes,
  Loader2,
  PackageX,
} from "lucide-react";

const BLUE_GRAD = "linear-gradient(135deg, #2196C8 0%, #4DB8E8 100%)";

const FILTERS = [
  { key: "all", label: "全部" },
  { key: "low", label: "库存不足" },
  { key: "near", label: "近效期" },
  { key: "expired", label: "已过期" },
];

function useQueryParam(name: string) {
  const [location] = useLocation();
  return useMemo(() => {
    const qs = location.includes("?") ? location.split("?")[1] : (typeof window !== "undefined" ? window.location.search.replace(/^\?/, "") : "");
    return new URLSearchParams(qs).get(name);
  }, [location, name]);
}

export default function YabanInventoryList() {
  const [, navigate] = useLocation();
  const { current } = useYabanClinic();
  const clinicName = current?.name?.trim() || current?.shortName?.trim() || "";
  const initFilter = useQueryParam("filter") || "all";

  const [keyword, setKeyword] = useState("");
  const [filter, setFilter] = useState(initFilter);
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => { setFilter(initFilter); }, [initFilter]);

  const catsQuery = trpc.yabanInventory.categories.useQuery();
  const listQuery = trpc.yabanInventory.list.useQuery({ keyword: keyword.trim() || undefined, categoryId, filter });
  const items = listQuery.data?.items || [];

  return (
    <div className="min-h-screen bg-[#F0F4F8] pb-24">
      <PageTag code="INV02" />

      {/* 顶部栏 */}
      <div className="text-white sticky top-0 z-20" style={{ background: BLUE_GRAD }}>
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => navigate("/yaban/inventory")} className="p-1">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex flex-col items-center">
            <span className="text-lg font-bold leading-tight">库存一览</span>
            {clinicName && <span className="text-[11px] font-normal text-white/80 leading-tight mt-0.5">所属：{clinicName}</span>}
          </div>
          <div className="w-8" />
        </div>
        {/* 搜索框 */}
        <div className="px-4 pb-3">
          <div className="flex items-center bg-white/95 rounded-full px-3 py-2">
            <Search className="w-4 h-4 text-gray-400" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索名称 / 品牌 / 条码"
              className="flex-1 bg-transparent outline-none text-sm text-gray-700 px-2"
            />
            {keyword && <X className="w-4 h-4 text-gray-400" onClick={() => setKeyword("")} />}
          </div>
        </div>
      </div>

      {/* 筛选标签 */}
      <div className="px-4 pt-3 flex gap-2 overflow-x-auto no-scrollbar">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${
              filter === f.key ? "text-white" : "bg-white text-gray-500"
            }`}
            style={filter === f.key ? { background: BLUE_GRAD } : undefined}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 分类切换 */}
      <div className="px-4 pt-2 flex gap-2 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setCategoryId(undefined)}
          className={`shrink-0 px-3 py-1 rounded-full text-xs ${categoryId === undefined ? "bg-sky-100 text-sky-600 font-medium" : "bg-white text-gray-400"}`}
        >
          全部分类
        </button>
        {(catsQuery.data || []).map((c) => (
          <button
            key={c.id}
            onClick={() => setCategoryId(c.id)}
            className={`shrink-0 px-3 py-1 rounded-full text-xs ${categoryId === c.id ? "bg-sky-100 text-sky-600 font-medium" : "bg-white text-gray-400"}`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* 物品列表 */}
      <div className="px-4 pt-4">
        {listQuery.isLoading ? (
          <div className="flex justify-center py-16 text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <PackageX className="w-12 h-12 mb-3" />
            <p className="text-sm">暂无符合条件的物品</p>
            <button onClick={() => setShowCreate(true)} className="mt-4 px-5 py-2 text-white rounded-full text-sm font-medium" style={{ background: BLUE_GRAD }}>
              新增物品
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {items.map((it) => (
              <button
                key={it.id}
                onClick={() => navigate(`/yaban/inventory/material/${it.id}`)}
                className="w-full text-left bg-white rounded-2xl shadow-sm p-3.5 flex items-center gap-3 active:scale-[0.99] transition"
              >
                <div className="w-12 h-12 rounded-xl bg-sky-50 flex items-center justify-center shrink-0">
                  <Boxes className="w-6 h-6 text-sky-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-800 truncate">{it.name}</span>
                    {it.expiryState === "expired" && <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-500">已过期</span>}
                    {it.expiryState === "near" && <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-500">近效期</span>}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5 truncate">
                    {it.spec ? `${it.spec} · ` : ""}{it.categoryName}{it.brand ? ` · ${it.brand}` : ""}
                  </div>
                  {it.nearestExpiry && <div className="text-[11px] text-gray-400 mt-0.5">最近效期 {it.nearestExpiry}</div>}
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-lg font-bold leading-none ${it.isLow ? "text-red-500" : "text-gray-800"}`}>{it.stock}</div>
                  <div className="text-[11px] text-gray-400 mt-1">{it.unit}</div>
                  {it.isLow && <div className="text-[10px] text-red-400 mt-0.5">低于安全</div>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 悬浮新增按钮 */}
      <button
        onClick={() => setShowCreate(true)}
        className="fixed right-5 bottom-6 w-14 h-14 rounded-full text-white shadow-lg flex items-center justify-center z-30"
        style={{ background: BLUE_GRAD }}
      >
        <Plus className="w-7 h-7" />
      </button>

      {showCreate && (
        <MaterialEditor
          categories={catsQuery.data || []}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); listQuery.refetch(); }}
        />
      )}
    </div>
  );
}

// ============ 新增物品底部弹层 ============
function MaterialEditor({
  categories,
  onClose,
  onSaved,
}: {
  categories: { id: number; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<number | undefined>(categories[0]?.id);
  const [spec, setSpec] = useState("");
  const [unit, setUnit] = useState("个");
  const [brand, setBrand] = useState("");
  const [barcode, setBarcode] = useState("");
  const [safetyStock, setSafetyStock] = useState("");
  const [trackExpiry, setTrackExpiry] = useState(true);

  const save = trpc.yabanInventory.saveMaterial.useMutation({
    onSuccess: () => { toast.success("已保存"); onSaved(); },
    onError: (e) => toast.error(e.message || "保存失败"),
  });

  const submit = () => {
    if (!name.trim()) { toast.error("请填写物品名称"); return; }
    save.mutate({
      name: name.trim(), categoryId: categoryId ?? null, spec: spec.trim() || undefined,
      unit: unit.trim() || "个", brand: brand.trim() || undefined, barcode: barcode.trim() || undefined,
      safetyStock: safetyStock || undefined, trackExpiry,
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-t-3xl max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white px-5 py-4 flex items-center justify-between border-b border-gray-100">
          <div className="flex flex-col">
            <span className="text-base font-bold text-gray-800 leading-tight">新增物品</span>
            <YabanClinicTag style={{ marginTop: 2 }} />
          </div>
          <X className="w-5 h-5 text-gray-400" onClick={onClose} />
        </div>
        <div className="px-5 py-4 space-y-4">
          <Field label="物品名称" required>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如 树脂、根管锉、口镜" className="inp" />
          </Field>
          <Field label="分类">
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <button key={c.id} onClick={() => setCategoryId(c.id)}
                  className={`px-3 py-1.5 rounded-full text-xs ${categoryId === c.id ? "bg-sky-500 text-white" : "bg-gray-100 text-gray-500"}`}>
                  {c.name}
                </button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="规格"><input value={spec} onChange={(e) => setSpec(e.target.value)} placeholder="如 A2 / 25mm" className="inp" /></Field>
            <Field label="单位"><input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="个/盒/支" className="inp" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="品牌"><input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="选填" className="inp" /></Field>
            <Field label="安全库存"><input value={safetyStock} onChange={(e) => setSafetyStock(e.target.value)} placeholder="低于则预警" inputMode="decimal" className="inp" /></Field>
          </div>
          <Field label="条码 / UDI">
            <input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="扫码入库可自动匹配" className="inp" />
          </Field>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">跟踪保质期（按批次管理效期）</span>
            <button onClick={() => setTrackExpiry((v) => !v)}
              className={`w-12 h-6 rounded-full transition relative ${trackExpiry ? "bg-sky-500" : "bg-gray-300"}`}>
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition ${trackExpiry ? "left-6.5 translate-x-px" : "left-0.5"}`} style={{ left: trackExpiry ? "26px" : "2px" }} />
            </button>
          </div>
        </div>
        <div className="sticky bottom-0 bg-white px-5 py-3 border-t border-gray-100">
          <button onClick={submit} disabled={save.isPending}
            className="w-full py-3 rounded-xl text-white font-medium flex items-center justify-center" style={{ background: BLUE_GRAD }}>
            {save.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "保存"}
          </button>
        </div>
      </div>
      <style>{`.inp{width:100%;border:1px solid #E5E7EB;border-radius:12px;padding:10px 12px;font-size:14px;outline:none}.inp:focus{border-color:#2196C8}.no-scrollbar::-webkit-scrollbar{display:none}`}</style>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-gray-500 mb-1.5">{label}{required && <span className="text-red-400 ml-0.5">*</span>}</div>
      {children}
    </div>
  );
}
