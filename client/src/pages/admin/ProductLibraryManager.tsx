import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Plus,
  Edit,
  Trash2,
  Package,
  Store,
  Tag,
  Share2,
  Search,
  Eye,
  EyeOff,
  ShoppingBag,
  ChevronRight,
  Gift,
} from "lucide-react";

// ===== 类型定义 =====
interface Product {
  id: number;
  name: string;
  subtitle?: string;
  basePrice: string;
  originalPrice?: string;
  mainImageUrl?: string;
  categoryId?: number;
  categoryName?: string;
  status: "active" | "inactive" | "draft";
  sourceType: "platform" | "merchant" | "shared";
  isShareable: number;
  inPointsShop: number;
  salesCount: number;
  stock: number;
  ownerMerchantId?: number;
  ownerShopName?: string;
  extendedFields?: string;
}

interface Category {
  id: number;
  name: string;
  description?: string;
  sortOrder: number;
  isActive: number;
}

interface Merchant {
  id: number;
  merchantCode: string;
  shopName: string;
  shopType?: string;
  status: string;
  themeColor: string;
}

// ===== 来源标签 =====
function sourceLabel(s: string) {
  if (s === "platform") return { label: "平台自有", color: "bg-blue-100 text-blue-700" };
  if (s === "merchant") return { label: "商家自录", color: "bg-green-100 text-green-700" };
  return { label: "共享商品", color: "bg-orange-100 text-orange-700" };
}

// ===== 商品列表组件 =====
function ProductList({
  products,
  categories,
  onEdit,
  onDelete,
  onToggleStatus,
  onTogglePointsShop,
}: {
  products: Product[];
  categories: Category[];
  onEdit: (p: Product) => void;
  onDelete: (id: number) => void;
  onToggleStatus: (id: number, status: string) => void;
  onTogglePointsShop: (id: number, inPointsShop: number) => void;
}) {
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterSource, setFilterSource] = useState("all");

  const filtered = products.filter((p) => {
    const matchSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.subtitle || "").toLowerCase().includes(search.toLowerCase());
    const matchCategory =
      filterCategory === "all" || String(p.categoryId) === filterCategory;
    const matchSource =
      filterSource === "all" || p.sourceType === filterSource;
    return matchSearch && matchCategory && matchSource;
  });

  return (
    <div className="space-y-3">
      {/* 搜索框 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="搜索商品名称..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-10 bg-gray-50 border-gray-200"
        />
      </div>

      {/* 筛选chip横向滚动 */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {/* 分类筛选 */}
        {[{ value: "all", label: "全部分类" }, ...categories.map(c => ({ value: String(c.id), label: c.name }))].map(opt => (
          <button
            key={opt.value}
            onClick={() => setFilterCategory(opt.value)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filterCategory === opt.value
                ? "bg-red-700 text-white"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {opt.label}
          </button>
        ))}
        <div className="w-px bg-gray-200 flex-shrink-0 mx-1" />
        {/* 来源筛选 */}
        {[
          { value: "all", label: "全部来源" },
          { value: "merchant", label: "商家自录" },
          { value: "shared", label: "共享商品" },
        ].map(opt => (
          <button
            key={opt.value}
            onClick={() => setFilterSource(opt.value)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filterSource === opt.value
                ? "bg-gray-800 text-white"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="text-xs text-gray-400 px-0.5">共 {filtered.length} 件商品</div>

      {/* 商品列表 */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">暂无商品</p>
          </div>
        ) : (
          filtered.map((product) => {
            const src = sourceLabel(product.sourceType);
            const isActive = product.status === "active";
            return (
              <div
                key={product.id}
                className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm"
              >
                <div className="flex items-stretch">
                  {/* 左侧图片 */}
                  <div className="w-20 h-20 flex-shrink-0 bg-gray-50">
                    {product.mainImageUrl ? (
                      <img
                        src={product.mainImageUrl}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ShoppingBag className="w-7 h-7 text-gray-200" />
                      </div>
                    )}
                  </div>

                  {/* 右侧内容 */}
                  <div className="flex-1 min-w-0 px-3 py-2.5">
                    {/* 商品名 + 状态标签 */}
                    <div className="flex items-start justify-between gap-1">
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold leading-tight truncate ${!isActive ? "text-gray-400" : "text-gray-900"}`}>
                          {product.name}
                        </p>
                        {product.subtitle && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate">{product.subtitle}</p>
                        )}
                      </div>
                      {!isActive && (
                        <span className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 ml-1">
                          {product.status === "draft" ? "草稿" : "下架"}
                        </span>
                      )}
                    </div>

                    {/* 来源标签 + 价格 */}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${src.color}`}>
                        {src.label}
                      </span>
                      <span className="text-red-600 font-bold text-sm">¥{product.basePrice}</span>
                      {product.originalPrice && (
                        <span className="text-gray-300 text-xs line-through">¥{product.originalPrice}</span>
                      )}
                    </div>

                    {/* 底部信息行 */}
                    <div className="flex items-center justify-between mt-1.5">
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <span>库存 {product.stock}</span>
                        <span>·</span>
                        <span>销量 {product.salesCount}</span>
                        {product.ownerShopName && (
                          <>
                            <span>·</span>
                            <span className="truncate max-w-[80px]">{product.ownerShopName}</span>
                          </>
                        )}
                      </div>
                      {/* 操作按钮 */}
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => onTogglePointsShop(product.id, product.inPointsShop ? 0 : 1)}
                          className={`p-1.5 rounded-lg active:bg-gray-200 ${product.inPointsShop ? 'text-amber-500 bg-amber-50' : 'text-gray-300 hover:bg-gray-100'}`}
                          title={product.inPointsShop ? "已上架到积分商城（点击下架）" : "上架到积分商城"}
                        >
                          <Gift className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onToggleStatus(product.id, isActive ? "inactive" : "active")}
                          className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 active:bg-gray-200"
                          title={isActive ? "下架" : "上架"}
                        >
                          {isActive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4 text-green-500" />}
                        </button>
                        <button
                          onClick={() => onEdit(product)}
                          className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 active:bg-gray-200"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDelete(product.id)}
                          className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 active:bg-red-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ===== 商品表单组件 =====
function ProductForm({
  product,
  categories,
  merchants,
  onSave,
  onClose,
}: {
  product?: Product | null;
  categories: Category[];
  merchants: Merchant[];
  onSave: (data: Partial<Product>) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: product?.name || "",
    subtitle: product?.subtitle || "",
    basePrice: product?.basePrice || "",
    originalPrice: product?.originalPrice || "",
    mainImageUrl: product?.mainImageUrl || "",
    categoryId: product?.categoryId ? String(product.categoryId) : "",
    status: product?.status || "active",
    sourceType: product?.sourceType || "merchant",
    isShareable: product?.isShareable !== undefined ? product.isShareable : 1,
    stock: product?.stock || 999,
    ownerMerchantId: product?.ownerMerchantId ? String(product.ownerMerchantId) : "",
    extendedFields: product?.extendedFields || "",
  });

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error("请输入商品名称"); return; }
    if (!form.basePrice || isNaN(Number(form.basePrice))) { toast.error("请输入有效的价格"); return; }
    onSave({
      ...form,
      basePrice: form.basePrice,
      categoryId: form.categoryId ? Number(form.categoryId) : undefined,
      ownerMerchantId: form.ownerMerchantId ? Number(form.ownerMerchantId) : undefined,
      stock: Number(form.stock),
    });
  };

  return (
    <div className="space-y-4 overflow-y-auto pb-6">
      {/* 商品名称 */}
      <div>
        <Label className="text-xs text-gray-500 mb-1 block">商品名称 *</Label>
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="如：拉菲古堡2018干红葡萄酒"
          className="h-11"
        />
      </div>

      {/* 副标题 */}
      <div>
        <Label className="text-xs text-gray-500 mb-1 block">副标题/简介</Label>
        <Input
          value={form.subtitle}
          onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
          placeholder="如：波尔多一级庄 · 750ml"
          className="h-11"
        />
      </div>

      {/* 价格行 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-gray-500 mb-1 block">售价 * (¥)</Label>
          <Input
            type="number"
            value={form.basePrice}
            onChange={(e) => setForm({ ...form, basePrice: e.target.value })}
            placeholder="0.00"
            className="h-11"
          />
        </div>
        <div>
          <Label className="text-xs text-gray-500 mb-1 block">划线原价 (¥)</Label>
          <Input
            type="number"
            value={form.originalPrice}
            onChange={(e) => setForm({ ...form, originalPrice: e.target.value })}
            placeholder="可选"
            className="h-11"
          />
        </div>
      </div>

      {/* 主图URL */}
      <div>
        <Label className="text-xs text-gray-500 mb-1 block">主图URL</Label>
        <Input
          value={form.mainImageUrl}
          onChange={(e) => setForm({ ...form, mainImageUrl: e.target.value })}
          placeholder="https://..."
          className="h-11"
        />
      </div>

      {/* 分类 + 库存 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-gray-500 mb-1 block">商品分类</Label>
          <Select value={form.categoryId} onValueChange={(v) => setForm({ ...form, categoryId: v })}>
            <SelectTrigger className="h-11">
              <SelectValue placeholder="选择分类" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-gray-500 mb-1 block">库存数量</Label>
          <Input
            type="number"
            value={form.stock}
            onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })}
            className="h-11"
          />
        </div>
      </div>

      {/* 来源 + 状态 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-gray-500 mb-1 block">商品来源</Label>
          <Select
            value={form.sourceType}
            onValueChange={(v) => setForm({ ...form, sourceType: v as "platform" | "merchant" | "shared" })}
          >
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="merchant">商家自录</SelectItem>
              <SelectItem value="shared">共享商品</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-gray-500 mb-1 block">状态</Label>
          <Select
            value={form.status}
            onValueChange={(v) => setForm({ ...form, status: v as "active" | "inactive" | "draft" })}
          >
            <SelectTrigger className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">上架</SelectItem>
              <SelectItem value="inactive">下架</SelectItem>
              <SelectItem value="draft">草稿</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 归属商家 */}
      <div>
        <Label className="text-xs text-gray-500 mb-1 block">归属商家 *</Label>
        <Select
          value={form.ownerMerchantId}
          onValueChange={(v) => setForm({ ...form, ownerMerchantId: v })}
        >
          <SelectTrigger className="h-11">
            <SelectValue placeholder="选择商家" />
          </SelectTrigger>
          <SelectContent>
            {merchants.map((m) => (
              <SelectItem key={m.id} value={String(m.id)}>
                {m.shopName} ({m.merchantCode})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 扩展字段 */}
      <div>
        <Label className="text-xs text-gray-500 mb-1 block">扩展字段（JSON）</Label>
        <Input
          value={form.extendedFields}
          onChange={(e) => setForm({ ...form, extendedFields: e.target.value })}
          placeholder='{"vintage":"2018","region":"波尔多"}'
          className="h-11 text-xs"
        />
      </div>

      {/* 提交按钮 */}
      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={onClose} className="flex-1 h-12">
          取消
        </Button>
        <Button onClick={handleSubmit} className="flex-1 h-12 bg-red-700 hover:bg-red-800 text-white">
          {product ? "保存修改" : "添加商品"}
        </Button>
      </div>
    </div>
  );
}

// ===== 主组件 =====
export default function ProductLibraryManager() {
  const [activeTab, setActiveTab] = useState("products");
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const productsQuery = trpc.merchant.getProducts.useQuery();
  const categoriesQuery = trpc.merchant.getCategories.useQuery();
  const merchantsQuery = trpc.merchant.getMerchants.useQuery();

  const createProductMutation = trpc.merchant.createProduct.useMutation({
    onSuccess: () => { toast.success("商品添加成功"); productsQuery.refetch(); setShowProductForm(false); },
    onError: (e) => toast.error(e.message),
  });

  const updateProductMutation = trpc.merchant.updateProduct.useMutation({
    onSuccess: () => { toast.success("商品更新成功"); productsQuery.refetch(); setShowProductForm(false); setEditingProduct(null); },
    onError: (e) => toast.error(e.message),
  });

  const deleteProductMutation = trpc.merchant.deleteProduct.useMutation({
    onSuccess: () => { toast.success("商品已删除"); productsQuery.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const products: Product[] = productsQuery.data || [];
  const categories: Category[] = categoriesQuery.data || [];
  const merchants: Merchant[] = merchantsQuery.data || [];

  const handleSaveProduct = (data: Partial<Product>) => {
    if (editingProduct) {
      updateProductMutation.mutate({ id: editingProduct.id, ...data } as any);
    } else {
      createProductMutation.mutate(data as any);
    }
  };

  const handleDeleteProduct = (id: number) => {
    if (confirm("确定要删除这个商品吗？")) {
      deleteProductMutation.mutate({ id });
    }
  };

  const handleToggleStatus = (id: number, status: string) => {
    updateProductMutation.mutate({ id, status: status as any });
  };

  const togglePointsShopMutation = trpc.merchant.toggleProductInPointsShop.useMutation({
    onSuccess: (_, vars) => {
      toast.success(vars.inPointsShop ? "已上架到积分商城" : "已从积分商城下架");
      productsQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleTogglePointsShop = (id: number, inPointsShop: number) => {
    togglePointsShopMutation.mutate({ id, inPointsShop });
  };

  const activeCount = products.filter((p) => p.status === "active").length;
  const sharedCount = products.filter((p) => p.sourceType === "shared").length;

  return (
    <div className="space-y-3">
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-1.5">
            <Package className="w-4 h-4 text-red-700" />
            脉动共享商盟 · 商品库
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">管理商家商品，配置共享关系</p>
        </div>
        <Button
          onClick={() => { setEditingProduct(null); setShowProductForm(true); }}
          className="bg-red-700 hover:bg-red-800 h-9 px-3 text-sm"
        >
          <Plus className="w-4 h-4 mr-1" />
          添加商品
        </Button>
      </div>

      {/* 统计数字条 */}
      <div className="bg-gray-50 rounded-xl px-4 py-3 grid grid-cols-4 divide-x divide-gray-200">
        {[
          { label: "总商品", value: products.length, color: "text-gray-900" },
          { label: "上架中", value: activeCount, color: "text-green-600" },
          { label: "共享中", value: sharedCount, color: "text-orange-500" },
          { label: "商家数", value: merchants.length, color: "text-blue-600" },
        ].map((stat) => (
          <div key={stat.label} className="text-center px-2">
            <div className={`text-xl font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-xs text-gray-400 mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* 主内容 Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-4 h-9">
          <TabsTrigger value="products" className="text-xs px-1">
            <Package className="w-3.5 h-3.5 mr-1" />
            商品库
          </TabsTrigger>
          <TabsTrigger value="categories" className="text-xs px-1">
            <Tag className="w-3.5 h-3.5 mr-1" />
            分类
          </TabsTrigger>
          <TabsTrigger value="merchants" className="text-xs px-1">
            <Store className="w-3.5 h-3.5 mr-1" />
            商家
          </TabsTrigger>
          <TabsTrigger value="sharing" className="text-xs px-1">
            <Share2 className="w-3.5 h-3.5 mr-1" />
            共享
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="mt-3">
          {productsQuery.isLoading ? (
            <div className="text-center py-12 text-gray-400 text-sm">加载中...</div>
          ) : (
            <ProductList
              products={products}
              categories={categories}
              onEdit={(p) => { setEditingProduct(p); setShowProductForm(true); }}
              onDelete={handleDeleteProduct}
              onToggleStatus={handleToggleStatus}
              onTogglePointsShop={handleTogglePointsShop}
            />
          )}
        </TabsContent>

        <TabsContent value="categories" className="mt-3">
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-gray-700">商品分类</h3>
            {categories.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">暂无分类</div>
            ) : (
              categories.map((cat) => (
                <div key={cat.id} className="flex items-center justify-between bg-white rounded-xl border border-gray-100 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Tag className="w-4 h-4 text-gray-300" />
                    <div>
                      <div className="text-sm font-medium">{cat.name}</div>
                      {cat.description && (
                        <div className="text-xs text-gray-400">{cat.description}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">排序 {cat.sortOrder}</span>
                    <ChevronRight className="w-4 h-4 text-gray-200" />
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="merchants" className="mt-3">
          <div className="space-y-2">
            {merchants.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Store className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">暂无商家</p>
              </div>
            ) : (
              merchants.map((m) => (
                <div key={m.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                      style={{ backgroundColor: m.themeColor || "#c0392b" }}
                    >
                      {m.shopName[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{m.shopName}</span>
                        <span className="text-xs text-gray-400">@{m.merchantCode}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${m.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {m.status === "active" ? "运营中" : "已停用"}
                        </span>
                        <span className="text-xs text-gray-400">{m.shopType || "通用"}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-semibold text-gray-900">
                        {products.filter((p) => p.ownerMerchantId === m.id).length}
                      </div>
                      <div className="text-xs text-gray-400">件商品</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="sharing" className="mt-3">
          <div className="bg-amber-50 rounded-xl p-4 text-sm text-amber-700 border border-amber-100">
            <p className="font-medium mb-1">共享商品配置（第三阶段功能）</p>
            <p className="text-xs leading-relaxed">
              商家A申请销售商家B的商品，B确认后，A可在自己店铺展示B的商品并赚取佣金。资金通过平台托管，自动分账。
            </p>
          </div>
          <div className="mt-4 text-center py-8 text-gray-400">
            <Share2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">暂无共享关系</p>
          </div>
        </TabsContent>
      </Tabs>

      {/* 商品表单底部抽屉 */}
      <Sheet
        open={showProductForm}
        onOpenChange={(open) => {
          if (!open) { setShowProductForm(false); setEditingProduct(null); }
        }}
      >
        <SheetContent side="bottom" className="h-[90vh] rounded-t-2xl px-4 pt-4">
          <SheetHeader className="mb-4">
            <SheetTitle className="text-base">
              {editingProduct ? "编辑商品" : "添加新商品"}
            </SheetTitle>
          </SheetHeader>
          <div className="overflow-y-auto h-[calc(90vh-80px)]">
            <ProductForm
              product={editingProduct}
              categories={categories}
              merchants={merchants}
              onSave={handleSaveProduct}
              onClose={() => { setShowProductForm(false); setEditingProduct(null); }}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
