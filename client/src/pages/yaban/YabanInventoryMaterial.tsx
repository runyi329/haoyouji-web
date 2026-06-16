/**
 * 牙伴齿科管理 - 物品详情
 * 路由：/yaban/inventory/material/:id
 * 展示库存总量、批次明细（含效期红绿灯）、编辑/删除入口
 */
import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { PageTag } from "@/components/PageTag";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ChevronLeft,
  Loader2,
  Pencil,
  Trash2,
  Layers,
  ArrowDownToLine,
  ArrowUpFromLine,
  X,
} from "lucide-react";

const BLUE_GRAD = "linear-gradient(135deg, #2196C8 0%, #4DB8E8 100%)";

const EXP_TAG: Record<string, { label: string; cls: string } | null> = {
  expired: { label: "已过期", cls: "bg-red-50 text-red-500" },
  near: { label: "近效期", cls: "bg-orange-50 text-orange-500" },
  normal: null,
  none: null,
};

export default function YabanInventoryMaterial() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/yaban/inventory/material/:id");
  const id = Number(params?.id);

  const detailQuery = trpc.yabanInventory.detail.useQuery({ id }, { enabled: !!id });
  const catsQuery = trpc.yabanInventory.categories.useQuery();
  const utils = trpc.useUtils();
  const [showEdit, setShowEdit] = useState(false);

  const del = trpc.yabanInventory.deleteMaterial.useMutation({
    onSuccess: () => { toast.success("已删除"); utils.yabanInventory.invalidate(); navigate("/yaban/inventory/list"); },
    onError: (e) => toast.error(e.message || "删除失败"),
  });

  const d = detailQuery.data;

  return (
    <div className="min-h-screen bg-[#F0F4F8] pb-24">
      <PageTag code="INV05" />
      <div className="text-white sticky top-0 z-20" style={{ background: BLUE_GRAD }}>
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => navigate("/yaban/inventory/list")} className="p-1"><ChevronLeft className="w-6 h-6" /></button>
          <span className="text-lg font-bold">物品详情</span>
          <button onClick={() => setShowEdit(true)} className="p-1"><Pencil className="w-5 h-5" /></button>
        </div>
      </div>

      {detailQuery.isLoading || !d ? (
        <div className="flex justify-center py-20 text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : (
        <>
          {/* 概览卡 */}
          <div className="px-4 pt-4">
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="text-lg font-bold text-gray-800">{d.name}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {d.categoryName}{d.spec ? ` · ${d.spec}` : ""}{d.brand ? ` · ${d.brand}` : ""}
                  </div>
                  {d.barcode && <div className="text-xs text-gray-400 mt-0.5">条码 {d.barcode}</div>}
                </div>
                <div className="text-right shrink-0 ml-3">
                  <div className={`text-2xl font-bold leading-none ${d.safetyStock > 0 && d.stock <= d.safetyStock ? "text-red-500" : "text-gray-800"}`}>{d.stock}</div>
                  <div className="text-[11px] text-gray-400 mt-1">{d.unit}</div>
                </div>
              </div>
              {d.safetyStock > 0 && (
                <div className="mt-3 text-xs text-gray-400">安全库存 {d.safetyStock}{d.unit}{d.stock <= d.safetyStock && <span className="text-red-400 ml-2">需补货</span>}</div>
              )}
            </div>
          </div>

          {/* 快捷出入库 */}
          <div className="px-4 pt-3 grid grid-cols-2 gap-3">
            <button onClick={() => navigate("/yaban/inventory/inbound")} className="bg-white rounded-2xl shadow-sm py-3 flex items-center justify-center gap-2 text-green-600">
              <ArrowDownToLine className="w-5 h-5" /><span className="text-sm font-medium">入库</span>
            </button>
            <button onClick={() => navigate("/yaban/inventory/outbound")} className="bg-white rounded-2xl shadow-sm py-3 flex items-center justify-center gap-2 text-orange-600">
              <ArrowUpFromLine className="w-5 h-5" /><span className="text-sm font-medium">出库</span>
            </button>
          </div>

          {/* 批次明细 */}
          <div className="px-4 pt-4">
            <div className="text-sm font-bold text-gray-700 mb-2 px-1 flex items-center gap-1.5"><Layers className="w-4 h-4 text-sky-500" />批次明细</div>
            {d.batches.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm py-10 text-center text-sm text-gray-400">暂无库存批次</div>
            ) : (
              <div className="space-y-2.5">
                {d.batches.map((b) => {
                  const tag = EXP_TAG[b.expiryState];
                  return (
                    <div key={b.id} className="bg-white rounded-2xl shadow-sm p-3.5 flex items-center justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-800">批号 {b.batchNo || "无"}</span>
                          {tag && <span className={`text-[10px] px-1.5 py-0.5 rounded ${tag.cls}`}>{tag.label}</span>}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {b.expiryDate ? `效期至 ${b.expiryDate}` : "未跟踪效期"}{b.costPrice > 0 ? ` · 单价 ¥${b.costPrice}` : ""}
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <span className="text-base font-bold text-gray-800">{b.qty}</span>
                        <span className="text-xs text-gray-400 ml-0.5">{d.unit}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 删除 */}
          <div className="px-4 pt-6">
            <button onClick={() => { if (confirm("确认删除该物品？历史流水将保留。")) del.mutate({ id }); }}
              className="w-full py-3 rounded-xl bg-white text-red-500 text-sm font-medium flex items-center justify-center gap-1.5 shadow-sm">
              <Trash2 className="w-4 h-4" />删除物品
            </button>
          </div>
        </>
      )}

      {showEdit && d && (
        <EditMaterial detail={d} categories={catsQuery.data || []} onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); detailQuery.refetch(); }} />
      )}
    </div>
  );
}

function EditMaterial({
  detail,
  categories,
  onClose,
  onSaved,
}: {
  detail: any;
  categories: { id: number; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(detail.name);
  const [categoryId, setCategoryId] = useState<number | undefined>(detail.categoryId ?? undefined);
  const [spec, setSpec] = useState(detail.spec || "");
  const [unit, setUnit] = useState(detail.unit || "个");
  const [brand, setBrand] = useState(detail.brand || "");
  const [barcode, setBarcode] = useState(detail.barcode || "");
  const [safetyStock, setSafetyStock] = useState(String(detail.safetyStock || ""));

  const save = trpc.yabanInventory.saveMaterial.useMutation({
    onSuccess: () => { toast.success("已保存"); onSaved(); },
    onError: (e) => toast.error(e.message || "保存失败"),
  });

  const submit = () => {
    if (!name.trim()) { toast.error("请填写名称"); return; }
    save.mutate({
      id: detail.id, name: name.trim(), categoryId: categoryId ?? null, spec: spec.trim() || undefined,
      unit: unit.trim() || "个", brand: brand.trim() || undefined, barcode: barcode.trim() || undefined,
      safetyStock: safetyStock || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end" onClick={onClose}>
      <div className="w-full bg-white rounded-t-3xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white px-5 py-4 flex items-center justify-between border-b border-gray-100">
          <span className="text-base font-bold text-gray-800">编辑物品</span>
          <X className="w-5 h-5 text-gray-400" onClick={onClose} />
        </div>
        <div className="px-5 py-4 space-y-4">
          <div><div className="text-xs text-gray-500 mb-1.5">名称</div><input value={name} onChange={(e) => setName(e.target.value)} className="eInp" /></div>
          <div>
            <div className="text-xs text-gray-500 mb-1.5">分类</div>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <button key={c.id} onClick={() => setCategoryId(c.id)}
                  className={`px-3 py-1.5 rounded-full text-xs ${categoryId === c.id ? "bg-sky-500 text-white" : "bg-gray-100 text-gray-500"}`}>{c.name}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><div className="text-xs text-gray-500 mb-1.5">规格</div><input value={spec} onChange={(e) => setSpec(e.target.value)} className="eInp" /></div>
            <div><div className="text-xs text-gray-500 mb-1.5">单位</div><input value={unit} onChange={(e) => setUnit(e.target.value)} className="eInp" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><div className="text-xs text-gray-500 mb-1.5">品牌</div><input value={brand} onChange={(e) => setBrand(e.target.value)} className="eInp" /></div>
            <div><div className="text-xs text-gray-500 mb-1.5">安全库存</div><input value={safetyStock} onChange={(e) => setSafetyStock(e.target.value)} inputMode="decimal" className="eInp" /></div>
          </div>
          <div><div className="text-xs text-gray-500 mb-1.5">条码 / UDI</div><input value={barcode} onChange={(e) => setBarcode(e.target.value)} className="eInp" /></div>
        </div>
        <div className="sticky bottom-0 bg-white px-5 py-3 border-t border-gray-100">
          <button onClick={submit} disabled={save.isPending} className="w-full py-3 rounded-xl text-white font-medium flex items-center justify-center" style={{ background: BLUE_GRAD }}>
            {save.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "保存"}
          </button>
        </div>
      </div>
      <style>{`.eInp{width:100%;border:1px solid #E5E7EB;border-radius:12px;padding:10px 12px;font-size:14px;outline:none}.eInp:focus{border-color:#2196C8}`}</style>
    </div>
  );
}
