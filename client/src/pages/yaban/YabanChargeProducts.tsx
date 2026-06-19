/**
 * 牙伴齿科管理 - 收费项目库
 * 路由：/yaban/settings/charge-products
 * 风格：蓝白风、移动端优先、lucide-react 图标、严禁 Emoji
 * 功能：分类管理（增删改）+ 项目管理（增删改、启用/禁用、常用切换）
 * 权限：写操作需 finance 权限（后端收口），无权限时只读
 */
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  ChevronLeft,
  Plus,
  X,
  Loader2,
  Pencil,
  Trash2,
  Star,
  Layers,
  Check,
} from "lucide-react";
import { useYabanClinic } from "./useYabanClinic";

const ACCENT = "#1E88D6";

interface ProdItem {
  id: number;
  categoryId: number | null;
  name: string;
  unit: string;
  price: number;
  isCommon: boolean;
  enabled: boolean;
  sort: number;
}
interface CatGroup {
  id: number;
  name: string;
  sort: number;
  enabled: boolean;
  items: ProdItem[];
}

function money(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

export default function YabanChargeProducts() {
  const [, navigate] = useLocation();
  const { current, currentTenantId } = useYabanClinic();
  const clinicName = current?.name?.trim() || current?.shortName?.trim() || "";
  const { user } = useAuth();
  const { data: membership } = trpc.yabanRole.myMembership.useQuery({ tenantId: currentTenantId ?? undefined });
  const perms: string[] = membership?.permissions || [];
  const isSuper = user?.role === "super_admin" || !!membership?.isFounder;
  const canManage = isSuper || perms.includes("finance");

  const utils = trpc.useUtils();
  const listQuery = trpc.yabanCustomer.listChargeProducts.useQuery(
    { includeDisabled: true },
    { refetchOnWindowFocus: false }
  );
  const categories: CatGroup[] = (listQuery.data?.categories as CatGroup[]) || [];

  const saveCat = trpc.yabanCustomer.saveChargeCategory.useMutation();
  const delCat = trpc.yabanCustomer.deleteChargeCategory.useMutation();
  const saveProd = trpc.yabanCustomer.saveChargeProduct.useMutation();
  const delProd = trpc.yabanCustomer.deleteChargeProduct.useMutation();
  const toggleCommon = trpc.yabanCustomer.toggleProductCommon.useMutation();

  const refresh = () => utils.yabanCustomer.listChargeProducts.invalidate();

  // ===== 分类编辑弹层 =====
  const [catSheet, setCatSheet] = useState<{ id?: number; name: string } | null>(null);
  const handleSaveCat = async () => {
    if (!catSheet) return;
    if (!catSheet.name.trim()) {
      toast.error("请输入分类名称");
      return;
    }
    try {
      await saveCat.mutateAsync({
        id: catSheet.id,
        name: catSheet.name.trim(),
        sort: categories.length,
        enabled: true,
      });
      toast.success(catSheet.id ? "已保存" : "分类已添加");
      setCatSheet(null);
      refresh();
    } catch (e: any) {
      toast.error(e.message || "保存失败");
    }
  };
  const handleDelCat = async (cat: CatGroup) => {
    if (!window.confirm(`确定删除分类「${cat.name}」吗？`)) return;
    try {
      await delCat.mutateAsync({ id: cat.id });
      toast.success("已删除");
      refresh();
    } catch (e: any) {
      toast.error(e.message || "删除失败");
    }
  };

  // ===== 项目编辑弹层 =====
  const [prodSheet, setProdSheet] = useState<{
    id?: number;
    categoryId: number;
    name: string;
    unit: string;
    price: string;
    isCommon: boolean;
    enabled: boolean;
  } | null>(null);

  const openNewProd = (categoryId: number) =>
    setProdSheet({ categoryId, name: "", unit: "次", price: "", isCommon: false, enabled: true });
  const openEditProd = (it: ProdItem) =>
    setProdSheet({
      id: it.id,
      categoryId: it.categoryId || 0,
      name: it.name,
      unit: it.unit,
      price: String(it.price),
      isCommon: it.isCommon,
      enabled: it.enabled,
    });

  const handleSaveProd = async () => {
    if (!prodSheet) return;
    if (!prodSheet.name.trim()) {
      toast.error("请输入项目名称");
      return;
    }
    try {
      await saveProd.mutateAsync({
        id: prodSheet.id,
        categoryId: prodSheet.categoryId,
        name: prodSheet.name.trim(),
        unit: prodSheet.unit.trim() || "次",
        price: parseFloat(prodSheet.price) || 0,
        isCommon: prodSheet.isCommon,
        enabled: prodSheet.enabled,
        sort: 0,
      });
      toast.success(prodSheet.id ? "已保存" : "项目已添加");
      setProdSheet(null);
      refresh();
    } catch (e: any) {
      toast.error(e.message || "保存失败");
    }
  };
  const handleDelProd = async (it: ProdItem) => {
    if (!window.confirm(`确定删除项目「${it.name}」吗？`)) return;
    try {
      await delProd.mutateAsync({ id: it.id });
      toast.success("已删除");
      refresh();
    } catch (e: any) {
      toast.error(e.message || "删除失败");
    }
  };
  const handleToggleCommon = async (it: ProdItem) => {
    try {
      await toggleCommon.mutateAsync({ id: it.id, isCommon: !it.isCommon });
      refresh();
    } catch (e: any) {
      toast.error(e.message || "操作失败");
    }
  };

  const totalCount = useMemo(
    () => categories.reduce((s, c) => s + c.items.length, 0),
    [categories]
  );

  return (
    <div className="min-h-screen bg-[#F0F4F8] pb-24">

      {/* 头部 */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white">
        <div className="flex items-center gap-2 px-4 py-3">
          <button onClick={() => navigate("/yaban/profile")} aria-label="返回">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex flex-col">
            <span className="text-base font-bold leading-tight">收费项目库</span>
            {clinicName && <span className="text-[11px] font-normal text-white/80 leading-tight mt-0.5">所属：{clinicName}</span>}
          </div>
          <span className="ml-auto text-xs text-white/80">{totalCount} 个项目</span>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-3">
        {!canManage && (
          <div className="bg-amber-50 text-amber-700 text-xs rounded-xl px-3 py-2">
            您当前为只读权限，如需编辑请联系院长开通财务权限。
          </div>
        )}

        {listQuery.isLoading ? (
          <div className="py-16 text-center text-gray-400 text-sm">
            <Loader2 className="w-5 h-5 animate-spin inline-block mr-1" />
            加载中…
          </div>
        ) : (
          categories.map((cat) => (
            <div key={cat.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {/* 分类头 */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-50">
                <Layers className="w-4 h-4 text-[#1E88D6] shrink-0" />
                <span className="text-sm font-bold text-gray-800 flex-1">{cat.name}</span>
                {canManage && (
                  <>
                    <button
                      onClick={() => setCatSheet({ id: cat.id, name: cat.name })}
                      className="text-gray-300 active:text-gray-500 p-1"
                      aria-label="编辑分类"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelCat(cat)}
                      className="text-gray-300 active:text-red-400 p-1"
                      aria-label="删除分类"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>

              {/* 项目列表 */}
              <div className="divide-y divide-gray-50">
                {cat.items.length === 0 && (
                  <div className="px-4 py-4 text-xs text-gray-300">该分类暂无项目</div>
                )}
                {cat.items.map((it) => (
                  <div
                    key={it.id}
                    className={`flex items-center gap-2 px-4 py-3 ${it.enabled ? "" : "opacity-50"}`}
                  >
                    {canManage && (
                      <button
                        onClick={() => handleToggleCommon(it)}
                        className="shrink-0 p-1"
                        aria-label="常用"
                      >
                        <Star
                          className="w-4 h-4"
                          style={it.isCommon ? { color: "#F5A623", fill: "#F5A623" } : { color: "#D1D5DB" }}
                        />
                      </button>
                    )}
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-gray-800 truncate">
                        {it.name}
                        {!it.enabled && <span className="text-[11px] text-gray-400 ml-1">已停用</span>}
                      </span>
                      <span className="block text-xs text-gray-400 mt-0.5">
                        {it.price > 0 ? `¥${money(it.price)}` : "面议"} / {it.unit}
                      </span>
                    </span>
                    {canManage && (
                      <>
                        <button
                          onClick={() => openEditProd(it)}
                          className="text-gray-300 active:text-gray-500 p-1"
                          aria-label="编辑"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelProd(it)}
                          className="text-gray-300 active:text-red-400 p-1"
                          aria-label="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {canManage && (
                <button
                  onClick={() => openNewProd(cat.id)}
                  className="w-full flex items-center justify-center gap-1 py-2.5 text-sm text-[#1E88D6] active:bg-[#F0F7FD]"
                >
                  <Plus className="w-4 h-4" />
                  添加项目
                </button>
              )}
            </div>
          ))
        )}

        {canManage && !listQuery.isLoading && (
          <button
            onClick={() => setCatSheet({ name: "" })}
            className="w-full flex items-center justify-center gap-1 py-3 rounded-2xl bg-white text-sm font-medium text-[#1E88D6] shadow-sm active:bg-[#F0F7FD]"
          >
            <Plus className="w-4 h-4" />
            新增分类
          </button>
        )}
      </div>

      {/* 分类编辑弹层 */}
      {catSheet && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/40" onClick={() => setCatSheet(null)}>
          <div
            className="mt-auto bg-white rounded-t-3xl px-4 pt-4 pb-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-base font-bold text-gray-800">
                {catSheet.id ? "编辑分类" : "新增分类"}
              </span>
              <button onClick={() => setCatSheet(null)} className="text-gray-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              value={catSheet.name}
              onChange={(e) => setCatSheet({ ...catSheet, name: e.target.value })}
              placeholder="分类名称，如 补牙修复"
              className="w-full bg-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none mb-4"
            />
            <button
              onClick={handleSaveCat}
              disabled={saveCat.isPending}
              className="w-full py-3 rounded-xl text-white text-sm font-medium flex items-center justify-center gap-1 disabled:opacity-60"
              style={{ backgroundColor: ACCENT }}
            >
              {saveCat.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              保存
            </button>
          </div>
        </div>
      )}

      {/* 项目编辑弹层 */}
      {prodSheet && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/40" onClick={() => setProdSheet(null)}>
          <div
            className="mt-auto bg-white rounded-t-3xl px-4 pt-4 pb-6 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="text-base font-bold text-gray-800">
                {prodSheet.id ? "编辑项目" : "新增项目"}
              </span>
              <button onClick={() => setProdSheet(null)} className="text-gray-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">项目名称</label>
              <input
                value={prodSheet.name}
                onChange={(e) => setProdSheet({ ...prodSheet, name: e.target.value })}
                placeholder="如 树脂补牙"
                className="w-full bg-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none"
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">单价（元）</label>
                <input
                  value={prodSheet.price}
                  onChange={(e) => setProdSheet({ ...prodSheet, price: e.target.value })}
                  inputMode="decimal"
                  placeholder="0"
                  className="w-full bg-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none"
                />
              </div>
              <div className="w-24">
                <label className="block text-xs text-gray-500 mb-1">单位</label>
                <input
                  value={prodSheet.unit}
                  onChange={(e) => setProdSheet({ ...prodSheet, unit: e.target.value })}
                  placeholder="次"
                  className="w-full bg-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-4 pt-1">
              <button
                onClick={() => setProdSheet({ ...prodSheet, isCommon: !prodSheet.isCommon })}
                className="flex items-center gap-1.5 text-sm"
              >
                <span
                  className={`w-5 h-5 rounded-md flex items-center justify-center border ${
                    prodSheet.isCommon ? "border-transparent" : "border-gray-300"
                  }`}
                  style={prodSheet.isCommon ? { backgroundColor: ACCENT } : undefined}
                >
                  {prodSheet.isCommon && <Check className="w-3.5 h-3.5 text-white" />}
                </span>
                <span className="text-gray-600">设为常用</span>
              </button>
              <button
                onClick={() => setProdSheet({ ...prodSheet, enabled: !prodSheet.enabled })}
                className="flex items-center gap-1.5 text-sm"
              >
                <span
                  className={`w-5 h-5 rounded-md flex items-center justify-center border ${
                    prodSheet.enabled ? "border-transparent" : "border-gray-300"
                  }`}
                  style={prodSheet.enabled ? { backgroundColor: ACCENT } : undefined}
                >
                  {prodSheet.enabled && <Check className="w-3.5 h-3.5 text-white" />}
                </span>
                <span className="text-gray-600">启用</span>
              </button>
            </div>

            <button
              onClick={handleSaveProd}
              disabled={saveProd.isPending}
              className="w-full py-3 rounded-xl text-white text-sm font-medium flex items-center justify-center gap-1 disabled:opacity-60"
              style={{ backgroundColor: ACCENT }}
            >
              {saveProd.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              保存
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
