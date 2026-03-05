import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

// ===== 商品列表组件 =====
function ProductList({
  products,
  categories,
  onEdit,
  onDelete,
  onToggleStatus,
}: {
  products: Product[];
  categories: Category[];
  onEdit: (p: Product) => void;
  onDelete: (id: number) => void;
  onToggleStatus: (id: number, status: string) => void;
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
      filterCategory === "all" ||
      String(p.categoryId) === filterCategory;
    const matchSource =
      filterSource === "all" || p.sourceType === filterSource;
    return matchSearch && matchCategory && matchSource;
  });

  const sourceLabel = (s: string) => {
    if (s === "platform") return { label: "平台自有", color: "bg-blue-100 text-blue-700" };
    if (s === "merchant") return { label: "商家自录", color: "bg-green-100 text-green-700" };
    return { label: "共享商品", color: "bg-orange-100 text-orange-700" };
  };

  return (
    <div className="space-y-4">
      {/* 筛选栏 */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="搜索商品名称..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="全部分类" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部分类</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterSource} onValueChange={setFilterSource}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="全部来源" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部来源</SelectItem>
            <SelectItem value="platform">平台自有</SelectItem>
            <SelectItem value="merchant">商家自录</SelectItem>
            <SelectItem value="shared">共享商品</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="text-sm text-gray-500">共 {filtered.length} 件商品</div>

      {/* 商品列表 */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>暂无商品</p>
          </div>
        ) : (
          filtered.map((product) => {
            const src = sourceLabel(product.sourceType);
            return (
              <Card key={product.id} className="p-4">
                <div className="flex items-start gap-4">
                  {/* 商品图片 */}
                  <div className="w-16 h-16 rounded-lg bg-gray-100 flex-shrink-0 overflow-hidden">
                    {product.mainImageUrl ? (
                      <img
                        src={product.mainImageUrl}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ShoppingBag className="w-6 h-6 text-gray-300" />
                      </div>
                    )}
                  </div>

                  {/* 商品信息 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900 truncate">
                            {product.name}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${src.color}`}
                          >
                            {src.label}
                          </span>
                          {product.status === "inactive" && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                              已下架
                            </span>
                          )}
                          {product.status === "draft" && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-600">
                              草稿
                            </span>
                          )}
                        </div>
                        {product.subtitle && (
                          <p className="text-sm text-gray-500 mt-0.5 truncate">
                            {product.subtitle}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-red-600 font-semibold">
                            ¥{product.basePrice}
                          </span>
                          {product.originalPrice && (
                            <span className="text-gray-400 text-sm line-through">
                              ¥{product.originalPrice}
                            </span>
                          )}
                          {product.categoryName && (
                            <span className="text-xs text-gray-400">
                              {product.categoryName}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                          <span>库存: {product.stock}</span>
                          <span>销量: {product.salesCount}</span>
                          {product.ownerShopName && (
                            <span>来自: {product.ownerShopName}</span>
                          )}
                        </div>
                      </div>

                      {/* 操作按钮 */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            onToggleStatus(
                              product.id,
                              product.status === "active" ? "inactive" : "active"
                            )
                          }
                          title={
                            product.status === "active" ? "下架" : "上架"
                          }
                        >
                          {product.status === "active" ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onEdit(product)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-500 hover:text-red-700"
                          onClick={() => onDelete(product.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
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
    sourceType: product?.sourceType || "platform",
    isShareable: product?.isShareable !== undefined ? product.isShareable : 1,
    stock: product?.stock || 999,
    ownerMerchantId: product?.ownerMerchantId
      ? String(product.ownerMerchantId)
      : "",
    extendedFields: product?.extendedFields || "",
  });

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast.error("请输入商品名称");
      return;
    }
    if (!form.basePrice || isNaN(Number(form.basePrice))) {
      toast.error("请输入有效的价格");
      return;
    }
    onSave({
      ...form,
      basePrice: form.basePrice,
      categoryId: form.categoryId ? Number(form.categoryId) : undefined,
      ownerMerchantId: form.ownerMerchantId
        ? Number(form.ownerMerchantId)
        : undefined,
      stock: Number(form.stock),
    });
  };

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Label>商品名称 *</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="如：拉菲古堡2018干红葡萄酒"
          />
        </div>
        <div className="col-span-2">
          <Label>副标题/简介</Label>
          <Input
            value={form.subtitle}
            onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
            placeholder="如：波尔多一级庄 · 750ml"
          />
        </div>
        <div>
          <Label>售价 * (¥)</Label>
          <Input
            type="number"
            value={form.basePrice}
            onChange={(e) => setForm({ ...form, basePrice: e.target.value })}
            placeholder="0.00"
          />
        </div>
        <div>
          <Label>划线原价 (¥)</Label>
          <Input
            type="number"
            value={form.originalPrice}
            onChange={(e) =>
              setForm({ ...form, originalPrice: e.target.value })
            }
            placeholder="0.00（可选）"
          />
        </div>
        <div className="col-span-2">
          <Label>主图URL</Label>
          <Input
            value={form.mainImageUrl}
            onChange={(e) =>
              setForm({ ...form, mainImageUrl: e.target.value })
            }
            placeholder="https://..."
          />
        </div>
        <div>
          <Label>商品分类</Label>
          <Select
            value={form.categoryId}
            onValueChange={(v) => setForm({ ...form, categoryId: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="选择分类" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>库存数量</Label>
          <Input
            type="number"
            value={form.stock}
            onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label>商品来源</Label>
          <Select
            value={form.sourceType}
            onValueChange={(v) =>
              setForm({ ...form, sourceType: v as "platform" | "merchant" | "shared" })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="platform">平台自有</SelectItem>
              <SelectItem value="merchant">商家自录</SelectItem>
              <SelectItem value="shared">共享商品</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>状态</Label>
          <Select
            value={form.status}
            onValueChange={(v) =>
              setForm({ ...form, status: v as "active" | "inactive" | "draft" })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">上架</SelectItem>
              <SelectItem value="inactive">下架</SelectItem>
              <SelectItem value="draft">草稿</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {form.sourceType === "merchant" && (
          <div className="col-span-2">
            <Label>归属商家</Label>
            <Select
              value={form.ownerMerchantId}
              onValueChange={(v) =>
                setForm({ ...form, ownerMerchantId: v })
              }
            >
              <SelectTrigger>
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
        )}
        <div className="col-span-2">
          <Label>扩展字段（JSON，如红酒年份/产区/酒庄）</Label>
          <Input
            value={form.extendedFields}
            onChange={(e) =>
              setForm({ ...form, extendedFields: e.target.value })
            }
            placeholder='{"vintage":"2018","region":"波尔多","chateau":"拉菲古堡"}'
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button variant="outline" onClick={onClose}>
          取消
        </Button>
        <Button onClick={handleSubmit} className="bg-red-700 hover:bg-red-800">
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

  // 从后端获取数据
  const productsQuery = trpc.merchant.getProducts.useQuery();
  const categoriesQuery = trpc.merchant.getCategories.useQuery();
  const merchantsQuery = trpc.merchant.getMerchants.useQuery();

  const createProductMutation = trpc.merchant.createProduct.useMutation({
    onSuccess: () => {
      toast.success("商品添加成功");
      productsQuery.refetch();
      setShowProductForm(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateProductMutation = trpc.merchant.updateProduct.useMutation({
    onSuccess: () => {
      toast.success("商品更新成功");
      productsQuery.refetch();
      setShowProductForm(false);
      setEditingProduct(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteProductMutation = trpc.merchant.deleteProduct.useMutation({
    onSuccess: () => {
      toast.success("商品已删除");
      productsQuery.refetch();
    },
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

  return (
    <div className="space-y-4">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-red-700" />
            脉动共享商盟 · 商品库
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            管理平台商品库，配置商家商品共享关系
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingProduct(null);
            setShowProductForm(true);
          }}
          className="bg-red-700 hover:bg-red-800"
        >
          <Plus className="w-4 h-4 mr-1" />
          添加商品
        </Button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "商品总数",
            value: products.length,
            icon: <Package className="w-4 h-4" />,
            color: "text-blue-600",
          },
          {
            label: "上架中",
            value: products.filter((p) => p.status === "active").length,
            icon: <Eye className="w-4 h-4" />,
            color: "text-green-600",
          },
          {
            label: "共享商品",
            value: products.filter((p) => p.sourceType === "shared").length,
            icon: <Share2 className="w-4 h-4" />,
            color: "text-orange-600",
          },
          {
            label: "商家数量",
            value: merchants.length,
            icon: <Store className="w-4 h-4" />,
            color: "text-purple-600",
          },
        ].map((stat) => (
          <Card key={stat.label} className="p-3">
            <div className={`flex items-center gap-2 ${stat.color}`}>
              {stat.icon}
              <span className="text-sm font-medium">{stat.label}</span>
            </div>
            <div className="text-2xl font-bold mt-1">{stat.value}</div>
          </Card>
        ))}
      </div>

      {/* 主内容 Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="products">
            <Package className="w-4 h-4 mr-1" />
            商品库
          </TabsTrigger>
          <TabsTrigger value="categories">
            <Tag className="w-4 h-4 mr-1" />
            分类管理
          </TabsTrigger>
          <TabsTrigger value="merchants">
            <Store className="w-4 h-4 mr-1" />
            商家管理
          </TabsTrigger>
          <TabsTrigger value="sharing">
            <Share2 className="w-4 h-4 mr-1" />
            共享配置
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="mt-4">
          {productsQuery.isLoading ? (
            <div className="text-center py-8 text-gray-400">加载中...</div>
          ) : (
            <ProductList
              products={products}
              categories={categories}
              onEdit={(p) => {
                setEditingProduct(p);
                setShowProductForm(true);
              }}
              onDelete={handleDeleteProduct}
              onToggleStatus={handleToggleStatus}
            />
          )}
        </TabsContent>

        <TabsContent value="categories" className="mt-4">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <h3 className="font-medium">商品分类</h3>
            </div>
            {categories.map((cat) => (
              <Card key={cat.id} className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Tag className="w-4 h-4 text-gray-400" />
                  <div>
                    <div className="font-medium">{cat.name}</div>
                    {cat.description && (
                      <div className="text-sm text-gray-400">{cat.description}</div>
                    )}
                  </div>
                </div>
                <Badge variant="outline">排序: {cat.sortOrder}</Badge>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="merchants" className="mt-4">
          <div className="space-y-2">
            {merchants.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Store className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>暂无商家</p>
              </div>
            ) : (
              merchants.map((m) => (
                <Card key={m.id} className="p-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                      style={{ backgroundColor: m.themeColor }}
                    >
                      {m.shopName[0]}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{m.shopName}</span>
                        <span className="text-xs text-gray-400">
                          @{m.merchantCode}
                        </span>
                        <Badge
                          variant={m.status === "active" ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {m.status === "active" ? "运营中" : "已停用"}
                        </Badge>
                      </div>
                      <div className="text-sm text-gray-400">
                        类型: {m.shopType || "通用"}
                      </div>
                    </div>
                    <div className="text-sm text-gray-400">
                      {products.filter((p) => p.ownerMerchantId === m.id).length} 件商品
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="sharing" className="mt-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-700">
            <p className="font-medium mb-1">共享商品配置（第三阶段功能）</p>
            <p>
              此功能将在第三阶段开发：商家A申请销售商家B的商品，B确认后，A可以在自己的店铺展示B的商品并赚取佣金。
              资金通过平台托管，自动分账。
            </p>
          </div>
          <div className="mt-4 space-y-2">
            <h3 className="font-medium text-gray-700">当前共享关系</h3>
            <div className="text-center py-8 text-gray-400">
              <Share2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>暂无共享关系</p>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* 商品表单弹窗 */}
      <Dialog
        open={showProductForm}
        onOpenChange={(open) => {
          if (!open) {
            setShowProductForm(false);
            setEditingProduct(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? "编辑商品" : "添加新商品"}
            </DialogTitle>
          </DialogHeader>
          <ProductForm
            product={editingProduct}
            categories={categories}
            merchants={merchants}
            onSave={handleSaveProduct}
            onClose={() => {
              setShowProductForm(false);
              setEditingProduct(null);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
