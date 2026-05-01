import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
  pointsPrice?: number;
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
  const [, navigate] = useLocation();
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
  onTogglePointsShop: (id: number, inPointsShop: number, product?: Product) => void;
}) {
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterSource, setFilterSource] = useState("all");
  // 商品详情 - 跳转独立页面

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
                className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm cursor-pointer active:bg-gray-50"
                onClick={() => navigate('/merchant-product/' + product.id)}
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
                      <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => onTogglePointsShop(product.id, product.inPointsShop ? 0 : 1, product)}
                          className={`p-1.5 rounded-lg active:bg-gray-200 ${product.inPointsShop ? 'text-amber-500 bg-amber-50' : 'text-gray-300 hover:bg-gray-100'}`}
                          title={product.inPointsShop ? `已上架到积分商城（积分：${product.pointsPrice ?? 0}）点击下架` : "上架到积分商城"}
                        >
                          <Gift className="w-4 h-4" />
                          {product.inPointsShop && product.pointsPrice ? (
                            <span className="absolute -top-1 -right-1 text-[9px] bg-amber-500 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold leading-none">已
                            </span>
                          ) : null}
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