/**
 * 牙办齿科商城 - 商品管理后台（仅超级管理员）
 * 路由：/yaban/shop/admin/products
 * 风格：沿用牙办蓝白风，移动端优先。列表 + 状态筛选 + 上下架/改价 + 编辑/新增抽屉 + 传图(走COS压缩)
 */
import { useMemo, useState, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ChevronLeft,
  Loader2,
  X,
  Plus,
  Search,
  ImagePlus,
  Trash2,
  Tags,
  ArrowUp,
  ArrowDown,
  Check,
  Pencil,
  Layers,
} from "lucide-react";
import { PageTag } from "@/components/PageTag";
import { useYabanClinic } from "./useYabanClinic";

type StatusFilter = "all" | "on" | "off";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "on", label: "已上架" },
  { key: "off", label: "已下架" },
];

// 编辑/新增表单数据
type FormState = {
  id?: number;
  category_code: string;
  kind: "product" | "service";
  name: string;
  subtitle: string;
  price: string;
  original_price: string;
  image: string;
  sales: string;
  tags: string; // 逗号分隔
  description: string; // 换行分隔
  sort_order: string;
  stock: string;
  status: 0 | 1;
};

const EMPTY_FORM: FormState = {
  category_code: "care",
  kind: "product",
  name: "",
  subtitle: "",
  price: "",
  original_price: "",
  image: "",
  sales: "0",
  tags: "",
  description: "",
  sort_order: "0",
  stock: "0",
  status: 1,
};

export default function YabanShopAdminProducts() {
  const [, navigate] = useLocation();
  const { current } = useYabanClinic();
  const clinicName = current?.name?.trim() || current?.shortName?.trim() || "";
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [keyword, setKeyword] = useState("");
  const [editing, setEditing] = useState<FormState | null>(null);
  const [catManagerOpen, setCatManagerOpen] = useState(false);

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.yabanProduct.adminListProducts.useQuery({
    status: filter,
    keyword: keyword.trim() || undefined,
  });
  const { data: categories } = trpc.yabanProduct.adminListCategories.useQuery();

  const list = data?.list ?? [];
  const counts = data?.counts ?? { all: 0, on: 0, off: 0 };

  const catMap = useMemo(() => {
    const m = new Map<string, string>();
    (categories ?? []).forEach((c: any) => m.set(c.code, c.name));
    return m;
  }, [categories]);

  const refresh = () => {
    utils.yabanProduct.adminListProducts.invalidate();
    utils.yabanProduct.listProducts.invalidate();
    utils.yabanProduct.listCategories.invalidate();
    utils.yabanProduct.adminListCategories.invalidate();
  };

  const toggleStatus = trpc.yabanProduct.toggleProductStatus.useMutation({
    onSuccess: () => {
      refresh();
      toast.success("已更新上下架状态");
    },
    onError: (e) => toast.error(e.message || "操作失败"),
  });

  const deleteProduct = trpc.yabanProduct.deleteProduct.useMutation({
    onSuccess: () => {
      refresh();
      toast.success("商品已删除");
    },
    onError: (e) => toast.error(e.message || "删除失败"),
  });

  const openCreate = () => {
    const firstCat = (categories ?? []).find((c: any) => c.code !== "all");
    setEditing({ ...EMPTY_FORM, category_code: firstCat?.code || "care" });
  };

  const openEdit = (p: any) => {
    setEditing({
      id: p.dbId,
      category_code: p.categoryId,
      kind: p.kind,
      name: p.name,
      subtitle: p.subtitle || "",
      price: String(p.price),
      original_price: p.originalPrice != null ? String(p.originalPrice) : "",
      image: p.image || "",
      sales: String(p.sales || 0),
      tags: (p.tags || []).join(","),
      description: (p.description || []).join("\n"),
      sort_order: String(p.sortOrder || 0),
      stock: String(p.stock ?? 0),
      status: p.isActive ? 1 : 0,
    });
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA] pb-24">
      <PageTag code="P306" />

      {/* 顶部返回栏 */}
      <div className="bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-3 py-3 flex items-center justify-between">
          <button onClick={() => navigate("/yaban")} aria-label="返回">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex flex-col">
            <span className="text-base font-bold leading-tight">商品管理</span>
            {clinicName && <span className="text-[11px] font-normal text-white/80 leading-tight mt-0.5">所属：{clinicName}</span>}
          </div>
          <button onClick={openCreate} aria-label="新增商品">
            <Plus className="w-6 h-6" />
          </button>
        </div>
        {/* 搜索 */}
        <div className="max-w-lg mx-auto px-3 pb-3">
          <div className="flex items-center bg-white/95 rounded-full px-3 py-1.5">
            <Search className="w-4 h-4 text-gray-400 shrink-0" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索商品名称"
              className="flex-1 bg-transparent outline-none text-sm text-gray-700 px-2 placeholder:text-gray-400"
            />
          </div>
        </div>
      </div>

      {/* 状态筛选 */}
      <div className="max-w-lg mx-auto px-3 pt-3">
        <div className="flex gap-2 items-center">
          {STATUS_FILTERS.map((f) => {
            const active = filter === f.key;
            const n = f.key === "all" ? counts.all : f.key === "on" ? counts.on : counts.off;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 rounded-full text-[13px] transition-colors ${
                  active
                    ? "bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white"
                    : "bg-white text-gray-500"
                }`}
              >
                {f.label}
                <span className={active ? "text-white/90" : "text-gray-400"}> {n}</span>
              </button>
            );
          })}
          <button
            onClick={() => setCatManagerOpen(true)}
            className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-full text-[13px] bg-white text-[#2196C8] border border-[#2196C8]"
          >
            <Tags className="w-3.5 h-3.5" /> 分类管理
          </button>
        </div>
      </div>

      {/* 列表 */}
      <div className="max-w-lg mx-auto px-3 pt-3 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center pt-20 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中
          </div>
        ) : list.length === 0 ? (
          <div className="text-center text-sm text-gray-400 pt-20">暂无商品</div>
        ) : (
          list.map((p: any) => (
            <div key={p.dbId} className="bg-white rounded-xl p-3 flex gap-3">
              <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-[#EAF6FC] to-[#D6EEFB] shrink-0 overflow-hidden flex items-center justify-center">
                {p.image ? (
                  <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[#9DCCE6] text-[10px]">无图</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-[13px] font-medium text-gray-800 line-clamp-1 flex-1">{p.name}</p>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                      p.isActive ? "text-[#059669] bg-[#D1FAE5]" : "text-gray-500 bg-gray-100"
                    }`}
                  >
                    {p.isActive ? "上架中" : "已下架"}
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 line-clamp-1 mt-0.5">
                  {catMap.get(p.categoryId) || p.categoryId} · {p.kind === "service" ? "诊疗" : "实物"}
                </p>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[#FF5A5A] text-sm font-bold">¥{p.price}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleStatus.mutate({ id: p.dbId, status: p.isActive ? 0 : 1 })}
                      className="text-[12px] px-2.5 py-1 rounded-full border border-[#2196C8] text-[#2196C8] active:bg-[#EAF6FC]"
                    >
                      {p.isActive ? "下架" : "上架"}
                    </button>
                    <button
                      onClick={() => openEdit(p)}
                      className="text-[12px] px-2.5 py-1 rounded-full bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white"
                    >
                      编辑
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 编辑/新增抽屉 */}
      {editing && (
        <ProductEditor
          form={editing}
          categories={(categories ?? []).filter((c: any) => c.code !== "all")}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
          onDelete={
            editing.id
              ? () => {
                  if (confirm("确定删除该商品？删除后不可恢复。")) {
                    deleteProduct.mutate({ id: editing.id! });
                    setEditing(null);
                  }
                }
              : undefined
          }
        />
      )}

      {/* 分类管理弹层 */}
      {catManagerOpen && (
        <CategoryManager
          categories={categories ?? []}
          onClose={() => setCatManagerOpen(false)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

function CategoryManager({
  categories,
  onClose,
  onChanged,
}: {
  categories: any[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  const createMut = trpc.yabanProduct.createCategory.useMutation();
  const updateMut = trpc.yabanProduct.updateCategory.useMutation();
  const deleteMut = trpc.yabanProduct.deleteCategory.useMutation();

  // 只展示真实分类（排除可能存在的 all 占位）
  const list = (categories ?? []).filter((c: any) => c.code !== "all");
  const busy =
    createMut.isPending || updateMut.isPending || deleteMut.isPending;

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return toast.error("请填写分类名称");
    try {
      await createMut.mutateAsync({ name });
      setNewName("");
      toast.success("分类已添加");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "添加失败");
    }
  };

  const handleRename = async (id: number) => {
    const name = editName.trim();
    if (!name) return toast.error("请填写分类名称");
    try {
      await updateMut.mutateAsync({ id, name });
      setEditId(null);
      setEditName("");
      toast.success("已重命名");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "修改失败");
    }
  };

  // 上移/下移：与相邻项交换 sort_order
  const handleMove = async (index: number, dir: -1 | 1) => {
    const target = list[index];
    const swap = list[index + dir];
    if (!target || !swap) return;
    try {
      await Promise.all([
        updateMut.mutateAsync({ id: target.id, sort_order: swap.sort_order }),
        updateMut.mutateAsync({ id: swap.id, sort_order: target.sort_order }),
      ]);
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "排序失败");
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`确定删除分类「${name}」？`)) return;
    try {
      await deleteMut.mutateAsync({ id });
      toast.success("分类已删除");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "删除失败");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/40" onClick={onClose}>
      <div
        className="mt-auto bg-[#F5F7FA] rounded-t-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white rounded-t-2xl">
          <span className="text-base font-bold text-gray-800">分类管理</span>
          <button onClick={onClose} aria-label="关闭">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* 新增分类 */}
        <div className="px-4 py-3 bg-white border-b border-gray-100">
          <div className="flex items-center gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="新分类名称，如 儿童齿科"
              className={inputCls}
              maxLength={20}
            />
            <button
              onClick={handleAdd}
              disabled={busy}
              className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white text-sm disabled:opacity-60"
            >
              <Plus className="w-4 h-4" /> 添加
            </button>
          </div>
        </div>

        {/* 分类列表 */}
        <div
          className="flex-1 overflow-y-auto px-4 py-3 space-y-2"
          style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))" }}
        >
          {list.length === 0 ? (
            <div className="text-center text-sm text-gray-400 pt-10">暂无分类，先添加一个吧</div>
          ) : (
            list.map((c: any, i: number) => (
              <div key={c.id} className="bg-white rounded-xl px-3 py-2.5 flex items-center gap-2">
                {editId === c.id ? (
                  <>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className={inputCls}
                      maxLength={20}
                      autoFocus
                    />
                    <button
                      onClick={() => handleRename(c.id)}
                      disabled={busy}
                      className="shrink-0 p-2 rounded-lg bg-[#2196C8] text-white disabled:opacity-60"
                      aria-label="保存"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => { setEditId(null); setEditName(""); }}
                      className="shrink-0 p-2 rounded-lg bg-gray-100 text-gray-500"
                      aria-label="取消"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-gray-800 line-clamp-1">{c.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleMove(i, -1)}
                        disabled={busy || i === 0}
                        className="p-1.5 rounded-lg text-gray-400 disabled:opacity-30 active:bg-gray-100"
                        aria-label="上移"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleMove(i, 1)}
                        disabled={busy || i === list.length - 1}
                        className="p-1.5 rounded-lg text-gray-400 disabled:opacity-30 active:bg-gray-100"
                        aria-label="下移"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => { setEditId(c.id); setEditName(c.name); }}
                        className="p-1.5 rounded-lg text-[#2196C8] active:bg-[#EAF6FC]"
                        aria-label="重命名"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(c.id, c.name)}
                        disabled={busy}
                        className="p-1.5 rounded-lg text-[#FF5A5A] active:bg-red-50 disabled:opacity-60"
                        aria-label="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
          <p className="text-[11px] text-gray-400 px-1 pt-1">提示：分类下还有商品时无法删除，请先把商品改到其他分类或删除。</p>
        </div>
      </div>
    </div>
  );
}

function ProductEditor({
  form: initial,
  categories,
  onClose,
  onSaved,
  onDelete,
}: {
  form: FormState;
  categories: any[];
  onClose: () => void;
  onSaved: () => void;
  onDelete?: () => void;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [uploading, setUploading] = useState(false);
  const [skuOpen, setSkuOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const createMut = trpc.yabanProduct.createProduct.useMutation();
  const updateMut = trpc.yabanProduct.updateProduct.useMutation();
  const uploadMut = trpc.yabanProduct.uploadProductImage.useMutation();
  const setStockMut = trpc.yabanShopAdmin.adminSetStock.useMutation();

  const set = (k: keyof FormState, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const handlePickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("图片不要超过 10MB");
      return;
    }
    setUploading(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await uploadMut.mutateAsync({ imageData: dataUrl });
      set("image", res.url);
      toast.success("图片已上传");
    } catch (err: any) {
      toast.error(err?.message || "上传失败");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error("请填写商品名称");
    const price = Number(form.price);
    if (Number.isNaN(price) || price < 0) return toast.error("请填写正确的价格");
    const payload = {
      category_code: form.category_code,
      kind: form.kind,
      name: form.name.trim(),
      subtitle: form.subtitle.trim(),
      price,
      original_price: form.original_price.trim() ? Number(form.original_price) : null,
      image: form.image.trim(),
      sales: Number(form.sales) || 0,
      tags: form.tags.split(",").map((s) => s.trim()).filter(Boolean),
      description: form.description.split("\n").map((s) => s.trim()).filter(Boolean),
      sort_order: Number(form.sort_order) || 0,
      status: form.status,
    };
    try {
      if (form.id) {
        await updateMut.mutateAsync({ id: form.id, ...payload });
        // 库存单独保存（独立接口，不动商品主接口）
        await setStockMut.mutateAsync({ productId: form.id, stock: Number(form.stock) || 0 });
        toast.success("已保存");
      } else {
        await createMut.mutateAsync(payload);
        toast.success("已新增商品");
      }
      onSaved();
    } catch (err: any) {
      toast.error(err?.message || "保存失败");
    }
  };

  const saving = createMut.isPending || updateMut.isPending;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/40" onClick={onClose}>
      <div
        className="mt-auto bg-[#F5F7FA] rounded-t-2xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white rounded-t-2xl">
          <span className="text-base font-bold text-gray-800">
            {form.id ? "编辑商品" : "新增商品"}
          </span>
          <button onClick={onClose} aria-label="关闭">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* 表单 */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* 主图 */}
          <div className="bg-white rounded-xl p-3">
            <p className="text-sm text-gray-700 mb-2">商品主图</p>
            <div className="flex items-center gap-3">
              <div className="w-20 h-20 rounded-lg bg-gradient-to-br from-[#EAF6FC] to-[#D6EEFB] overflow-hidden flex items-center justify-center shrink-0">
                {form.image ? (
                  <img src={form.image} alt="主图" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[#9DCCE6] text-[10px]">无图</span>
                )}
              </div>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#2196C8] text-[#2196C8] text-sm disabled:opacity-60"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                {uploading ? "上传中" : "上传图片"}
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePickImage} />
            </div>
            <p className="text-[11px] text-gray-400 mt-2">图片会自动压缩后存储到云端，建议正方形。</p>
          </div>

          <Field label="商品名称">
            <input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="如：声波电动牙刷" />
          </Field>
          <Field label="副标题 / 卖点">
            <input className={inputCls} value={form.subtitle} onChange={(e) => set("subtitle", e.target.value)} placeholder="如：高频清洁 · 护龈软毛" />
          </Field>

          {/* 分类 + 类型 */}
          <div className="grid grid-cols-2 gap-2">
            <Field label="分类">
              <select className={inputCls} value={form.category_code} onChange={(e) => set("category_code", e.target.value)}>
                {categories.map((c) => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="类型">
              <select className={inputCls} value={form.kind} onChange={(e) => set("kind", e.target.value as any)}>
                <option value="product">实物商品</option>
                <option value="service">诊疗服务</option>
              </select>
            </Field>
          </div>

          {/* 价格 */}
          <div className="grid grid-cols-2 gap-2">
            <Field label="现价（元）">
              <input className={inputCls} type="number" value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="0" />
            </Field>
            <Field label="原价（划线价，选填）">
              <input className={inputCls} type="number" value={form.original_price} onChange={(e) => set("original_price", e.target.value)} placeholder="选填" />
            </Field>
          </div>

          {/* 销量 + 排序 */}
          <div className="grid grid-cols-2 gap-2">
            <Field label="销量（展示用）">
              <input className={inputCls} type="number" value={form.sales} onChange={(e) => set("sales", e.target.value)} />
            </Field>
            <Field label="排序（越小越靠前）">
              <input className={inputCls} type="number" value={form.sort_order} onChange={(e) => set("sort_order", e.target.value)} />
            </Field>
          </div>

          {/* 库存 */}
          <Field label="库存数量（为 0 自动下架）">
            <input className={inputCls} type="number" value={form.stock} onChange={(e) => set("stock", e.target.value)} placeholder="诊疗服务可填较大值或不限" />
          </Field>

          {/* 多规格管理入口（仅已保存商品） */}
          {form.id && (
            <button
              onClick={() => setSkuOpen(true)}
              className="w-full bg-white rounded-xl px-3 py-3 flex items-center gap-2 active:bg-gray-50"
            >
              <Layers className="w-4 h-4 text-[#2196C8]" />
              <span className="text-sm text-gray-700 flex-1 text-left">多规格管理（如不同型号/套餐）</span>
              <span className="text-xs text-gray-400">设置 ›</span>
            </button>
          )}

          <Field label="标签（逗号分隔，如 热销,定金）">
            <input className={inputCls} value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="热销,到院结算" />
          </Field>
          <Field label="商品详情（每行一段）">
            <textarea className={`${inputCls} h-24 resize-none`} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="每行一段描述" />
          </Field>

          {/* 上架开关 */}
          <div className="bg-white rounded-xl px-3 py-3 flex items-center justify-between">
            <span className="text-sm text-gray-700">立即上架</span>
            <button
              onClick={() => set("status", form.status === 1 ? 0 : 1)}
              className={`w-11 h-6 rounded-full transition-colors relative ${form.status === 1 ? "bg-[#2196C8]" : "bg-gray-300"}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${form.status === 1 ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>

          {onDelete && (
            <button onClick={onDelete} className="w-full py-2.5 rounded-xl text-[#FF5A5A] text-sm flex items-center justify-center gap-1.5">
              <Trash2 className="w-4 h-4" /> 删除该商品
            </button>
          )}
        </div>

        {/* 底部保存 */}
        <div className="px-4 py-3 border-t border-gray-100 bg-white">
          <button
            onClick={handleSave}
            disabled={saving || uploading}
            className="w-full py-2.5 rounded-full bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-60"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? "保存中" : "保存"}
          </button>
        </div>
      </div>
      {skuOpen && form.id && (
        <SkuManager productId={form.id} onClose={() => setSkuOpen(false)} />
      )}
    </div>
  );
}

function SkuManager({ productId, onClose }: { productId: number; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data: skus, isLoading } = trpc.yabanShopAdmin.adminListSku.useQuery({ productId });
  const saveMut = trpc.yabanShopAdmin.adminSaveSku.useMutation();
  const delMut = trpc.yabanShopAdmin.adminDeleteSku.useMutation();
  const [specName, setSpecName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("0");

  const refresh = () => utils.yabanShopAdmin.adminListSku.invalidate({ productId });

  const handleAdd = async () => {
    if (!specName.trim()) return toast.error("请填规格名称");
    const p = Number(price);
    if (Number.isNaN(p) || p < 0) return toast.error("请填正确价格");
    try {
      await saveMut.mutateAsync({ productId, specName: specName.trim(), price: p, stock: Number(stock) || 0 });
      setSpecName(""); setPrice(""); setStock("0");
      toast.success("规格已添加");
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "保存失败");
    }
  };

  const handleDel = async (id: number) => {
    if (!confirm("删除该规格？")) return;
    try {
      await delMut.mutateAsync({ id });
      toast.success("已删除");
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "删除失败");
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/40" onClick={onClose}>
      <div className="mt-auto bg-[#F5F7FA] rounded-t-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white rounded-t-2xl">
          <span className="text-base font-bold text-gray-800">多规格管理</span>
          <button onClick={onClose} aria-label="关闭"><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="px-4 py-3 bg-white border-b border-gray-100 space-y-2">
          <input className={inputCls} value={specName} onChange={(e) => setSpecName(e.target.value)} placeholder="规格名，如：标准装 / 豪华套餐" maxLength={128} />
          <div className="flex items-center gap-2">
            <input className={inputCls} type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="价格（元）" />
            <input className={inputCls} type="number" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="库存" />
            <button onClick={handleAdd} disabled={saveMut.isPending} className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white text-sm disabled:opacity-60">
              <Plus className="w-4 h-4" /> 添加
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2" style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))" }}>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 text-[#2196C8] animate-spin" /></div>
          ) : (skus ?? []).length === 0 ? (
            <p className="text-center text-sm text-gray-400 pt-8">暂无规格，添加后客人可选择不同型号</p>
          ) : (
            (skus ?? []).map((s: any) => (
              <div key={s.id} className="bg-white rounded-xl px-3 py-2.5 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 truncate">{s.spec_text}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">¥{Number(s.price).toFixed(2)} · 库存 {s.stock}</p>
                </div>
                <button onClick={() => handleDel(s.id)} className="p-1.5 rounded-lg text-[#FF5A5A] active:bg-red-50" aria-label="删除"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full bg-[#F5F7FA] rounded-lg px-3 py-2 text-sm text-gray-700 outline-none placeholder:text-gray-400 border border-transparent focus:border-[#2196C8]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl px-3 py-2.5">
      <p className="text-[12px] text-gray-500 mb-1.5">{label}</p>
      {children}
    </div>
  );
}
