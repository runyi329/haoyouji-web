/**
 * 商品上架页面 - 参照京东/拼多多/淘宝商家后台标准设计
 * 路由：/admin/product/new（新增）、/admin/product/:id/edit（编辑）
 * 仅 super_admin 可访问
 */
import { useState, useEffect, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  ChevronLeft,
  Plus,
  X,
  ImagePlus,
  Package,
  DollarSign,
  Tag,
  Truck,
  Star,
  Settings,
  Loader2,
  AlertCircle,
  CheckCircle2,
  GripVertical,
} from "lucide-react";

// ===== 类型定义 =====
interface ProductFormData {
  // 基本信息
  name: string;
  subtitle: string;
  categoryId: string;
  brand: string;
  // 图片
  mainImageUrl: string;
  thumbnailUrl: string; // 列表预览图（建议800x800正方形）
  imageUrls: string[]; // 多图列表（含主图）
  // 价格与库存
  basePrice: string;
  originalPrice: string;
  stock: string;
  unit: string;
  // 规格
  specs: SpecItem[];
  // 积分商城
  inPointsShop: boolean;
  pointsPrice: string;
  // 蓝色角标
  badgeEnabled: boolean;
  badgeText: string;
  // 商品详情
  description: string;
  // 物流
  shippingNote: string;
  // 状态
  status: "active" | "inactive" | "draft";
  // 来源
  sourceType: "platform" | "merchant" | "shared";
  ownerMerchantId: string;
  // 扩展字段
  extendedFields: string;
}

interface SpecItem {
  id: string;
  specName: string;
  specValue: string;
  priceAdjustment: string;
  stock: string;
}

// ===== 区块标题组件 =====
function SectionTitle({ icon, title, required }: { icon: React.ReactNode; title: string; required?: boolean }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="w-1 h-5 bg-red-600 rounded-full" />
      <span className="text-gray-700 font-semibold text-base flex items-center gap-1.5">
        {icon}
        {title}
        {required && <span className="text-red-500 text-xs ml-1">*必填</span>}
      </span>
    </div>
  );
}

// ===== 图片上传卡片 =====
function ImageUploadCard({
  url,
  onUpload,
  onRemove,
  isMain,
  isLoading,
  inputId,
}: {
  url?: string;
  onUpload: (file: File) => void;
  onRemove?: () => void;
  isMain?: boolean;
  isLoading?: boolean;
  inputId: string;
}) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("请选择图片文件"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("图片大小不能超过 10MB"); return; }
    onUpload(file);
    e.target.value = "";
  };

  return (
    <div className="relative">
      <div
        className={`relative border-2 rounded-xl overflow-hidden cursor-pointer transition-all
          ${url ? "border-gray-200" : "border-dashed border-gray-300 hover:border-red-400"}
          ${isMain ? "aspect-square" : "aspect-square"}
        `}
        style={{ minHeight: "80px" }}
        onClick={() => !url && document.getElementById(inputId)?.click()}
      >
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80">
            <Loader2 className="w-6 h-6 text-red-500 animate-spin" />
          </div>
        ) : url ? (
          <>
            <img src={url} alt="商品图" className="w-full h-full object-cover" />
            {isMain && (
              <div className="absolute top-1 left-1 bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded font-medium">
                主图
              </div>
            )}
            <button
              type="button"
              className="absolute top-1 right-1 w-5 h-5 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors"
              onClick={(e) => { e.stopPropagation(); onRemove?.(); }}
            >
              <X className="w-3 h-3" />
            </button>
            <div
              className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 hover:opacity-100"
              onClick={() => document.getElementById(inputId)?.click()}
            >
              <span className="text-white text-xs font-medium bg-black/50 px-2 py-1 rounded">更换</span>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-gray-400">
            <ImagePlus className="w-6 h-6" />
            <span className="text-xs">{isMain ? "上传主图" : "添加图片"}</span>
          </div>
        )}
      </div>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}

// ===== 主组件 =====
export default function ProductPublish() {
  const [, setLocation] = useLocation();
  const goBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      setLocation("/admin");
    }
  };
  const params = useParams<{ id?: string }>();
  const productId = params?.id ? Number(params.id) : null;
  const isEdit = !!productId;

  const uploadImageMutation = trpc.merchant.uploadProductImage.useMutation();
  const createProductMutation = trpc.merchant.createProduct.useMutation();
  const updateProductMutation = trpc.merchant.updateProduct.useMutation();
  const togglePointsMutation = trpc.merchant.toggleProductInPointsShop.useMutation();

  const categoriesQuery = trpc.merchant.getCategories.useQuery();
  const merchantsQuery = trpc.merchant.getMerchants.useQuery();
  const productDetailQuery = trpc.merchant.getProductDetail.useQuery(
    { id: productId! },
    { enabled: isEdit && !!productId }
  );

  const categories = (categoriesQuery.data || []) as any[];
  const merchantsList = (merchantsQuery.data || []) as any[];

  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [form, setForm] = useState<ProductFormData>({
    name: "",
    subtitle: "",
    categoryId: "",
    brand: "",
    mainImageUrl: "",
    thumbnailUrl: "",
    imageUrls: [],
    basePrice: "",
    originalPrice: "",
    stock: "999",
    unit: "件",
    specs: [],
    inPointsShop: false,
    pointsPrice: "",
    badgeEnabled: false,
    badgeText: "",
    description: "",
    shippingNote: "",
    status: "active",
    sourceType: "platform",
    ownerMerchantId: "",
    extendedFields: "",
  });

  // 编辑模式：加载商品数据
  useEffect(() => {
    if (isEdit && productDetailQuery.data) {
      const p = productDetailQuery.data as any;
      let parsedImageUrls: string[] = [];
      if (p.imageUrls) {
        try { parsedImageUrls = JSON.parse(p.imageUrls); } catch { parsedImageUrls = []; }
      }
      // 确保主图在列表中
      if (p.mainImageUrl && !parsedImageUrls.includes(p.mainImageUrl)) {
        parsedImageUrls = [p.mainImageUrl, ...parsedImageUrls];
      }
      const specs: SpecItem[] = (p.specs || []).map((s: any) => ({
        id: String(s.id),
        specName: s.specName || "",
        specValue: s.specValue || "",
        priceAdjustment: String(s.priceAdjustment || "0"),
        stock: String(s.stock || "999"),
      }));
      setForm({
        name: p.name || "",
        subtitle: p.subtitle || "",
        categoryId: p.categoryId ? String(p.categoryId) : "",
        brand: "",
        mainImageUrl: p.mainImageUrl || "",
        thumbnailUrl: p.thumbnailUrl || "",
        imageUrls: parsedImageUrls,
        basePrice: p.basePrice || "",
        originalPrice: p.originalPrice || "",
        stock: String(p.stock || "999"),
        unit: p.unit || "件",
        specs,
        inPointsShop: !!p.inPointsShop,
        pointsPrice: p.pointsPrice ? String(p.pointsPrice) : "",
        badgeEnabled: !!p.badgeEnabled,
        badgeText: p.badgeText || "",
        description: p.description || "",
        shippingNote: "",
        status: p.status || "active",
        sourceType: p.sourceType || "platform",
        ownerMerchantId: p.ownerMerchantId ? String(p.ownerMerchantId) : "",
        extendedFields: p.extendedFields || "",
      });
    }
  }, [isEdit, productDetailQuery.data]);

  // ===== 图片上传 =====
  const handleUploadImage = async (file: File, index: number) => {
    setUploadingIndex(index);
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = ev.target?.result as string;
        const result = await uploadImageMutation.mutateAsync({
          imageData: base64,
          folder: "merchant-products",
        });
        const newUrls = [...form.imageUrls];
        if (index < newUrls.length) {
          newUrls[index] = result.url;
        } else {
          newUrls.push(result.url);
        }
        setForm(prev => ({
          ...prev,
          imageUrls: newUrls,
          mainImageUrl: newUrls[0] || "",
        }));
        toast.success("图片上传成功");
        setUploadingIndex(null);
      };
      reader.onerror = () => { toast.error("图片读取失败"); setUploadingIndex(null); };
      reader.readAsDataURL(file);
    } catch (err: any) {
      toast.error("上传失败: " + (err?.message || ""));
      setUploadingIndex(null);
    }
  };

  const handleRemoveImage = (index: number) => {
    const newUrls = form.imageUrls.filter((_, i) => i !== index);
    setForm(prev => ({
      ...prev,
      imageUrls: newUrls,
      mainImageUrl: newUrls[0] || "",
    }));
  };

  // ===== 规格管理 =====
  const addSpec = () => {
    setForm(prev => ({
      ...prev,
      specs: [...prev.specs, {
        id: Date.now().toString(),
        specName: "",
        specValue: "",
        priceAdjustment: "0",
        stock: "999",
      }],
    }));
  };

  const removeSpec = (id: string) => {
    setForm(prev => ({ ...prev, specs: prev.specs.filter(s => s.id !== id) }));
  };

  const updateSpec = (id: string, field: keyof SpecItem, value: string) => {
    setForm(prev => ({
      ...prev,
      specs: prev.specs.map(s => s.id === id ? { ...s, [field]: value } : s),
    }));
  };

  // ===== 表单验证 =====
  const validate = () => {
    if (!form.name.trim()) { toast.error("请填写商品标题"); return false; }
    if (!form.basePrice || isNaN(Number(form.basePrice)) || Number(form.basePrice) <= 0) {
      toast.error("请填写有效的售价"); return false;
    }
    if (form.inPointsShop && (!form.pointsPrice || Number(form.pointsPrice) <= 0)) {
      toast.error("已开启积分商城，请填写积分价格"); return false;
    }
    return true;
  };

  // ===== 保存商品 =====
  const handleSave = async (saveStatus?: "active" | "inactive" | "draft") => {
    if (!validate()) return;
    setIsSaving(true);
    try {
      const finalStatus = saveStatus || form.status;
      const imageUrlsJson = form.imageUrls.length > 0 ? JSON.stringify(form.imageUrls) : undefined;
      const mainImageUrl = form.imageUrls[0] || form.mainImageUrl || undefined;

      if (isEdit && productId) {
        // 更新商品
        await updateProductMutation.mutateAsync({
          id: productId,
          name: form.name,
          subtitle: form.subtitle || undefined,
          basePrice: form.basePrice,
          originalPrice: form.originalPrice || undefined,
          mainImageUrl: mainImageUrl || undefined,
          thumbnailUrl: form.thumbnailUrl || undefined,
          imageUrls: imageUrlsJson,
          categoryId: form.categoryId ? Number(form.categoryId) : undefined,
          status: finalStatus,
          stock: Number(form.stock) || 999,
          description: form.description || undefined,
          extendedFields: form.extendedFields || undefined,
          badgeEnabled: form.badgeEnabled ? 1 : 0,
          badgeText: form.badgeText || null,
        } as any);
        // 积分商城设置
        if (form.inPointsShop) {
          await togglePointsMutation.mutateAsync({
            id: productId,
            inPointsShop: 1,
            pointsPrice: Number(form.pointsPrice) || 0,
          });
        } else {
          await togglePointsMutation.mutateAsync({ id: productId, inPointsShop: 0 });
        }
        toast.success("商品更新成功");
      } else {
        // 新建商品
        const result = await createProductMutation.mutateAsync({
          name: form.name,
          subtitle: form.subtitle || undefined,
          basePrice: form.basePrice,
          originalPrice: form.originalPrice || undefined,
          mainImageUrl: mainImageUrl || undefined,
          thumbnailUrl: form.thumbnailUrl || undefined,
          imageUrls: imageUrlsJson,
          categoryId: form.categoryId ? Number(form.categoryId) : undefined,
          status: finalStatus,
          sourceType: form.sourceType,
          isShareable: 1,
          stock: Number(form.stock) || 999,
          ownerMerchantId: form.ownerMerchantId ? Number(form.ownerMerchantId) : undefined,
          description: form.description || undefined,
          extendedFields: form.extendedFields || undefined,
        } as any);
        // 积分商城设置
        if (form.inPointsShop && result.productId) {
          await togglePointsMutation.mutateAsync({
            id: result.productId,
            inPointsShop: 1,
            pointsPrice: Number(form.pointsPrice) || 0,
          });
        }
        toast.success(finalStatus === "draft" ? "已保存为草稿" : "商品发布成功！");
      }
      goBack();
    } catch (err: any) {
      toast.error("保存失败: " + (err?.message || ""));
    } finally {
      setIsSaving(false);
    }
  };

  if (isEdit && productDetailQuery.isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
          <p className="text-gray-500 text-sm">加载商品信息...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* 顶部导航栏 */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center h-14 px-4 gap-3">
          <button
            onClick={goBack}
            className="p-1.5 -ml-1 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="flex-1 text-base font-semibold text-gray-900">
            {isEdit ? "编辑商品" : "发布商品"}
          </h1>
          <button
            onClick={() => handleSave("draft")}
            disabled={isSaving}
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            存草稿
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">

        {/* ===== 区块1：基本信息 ===== */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <SectionTitle icon={<Package className="w-4 h-4 text-red-600" />} title="基本信息" required />

          {/* 商品标题 */}
          <div className="mb-4">
            <Label className="text-xs text-gray-500 mb-1.5 block">
              商品标题 <span className="text-red-500">*</span>
              <span className="text-gray-300 ml-1">（{form.name.length}/60）</span>
            </Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value.slice(0, 60) })}
              placeholder="填写商品名称，建议包含品牌、规格、特点等关键词"
              className="h-11 text-sm"
              maxLength={60}
            />
          </div>

          {/* 副标题/卖点 */}
          <div className="mb-4">
            <Label className="text-xs text-gray-500 mb-1.5 block">
              副标题/卖点
              <span className="text-gray-300 ml-1">（{form.subtitle.length}/100）</span>
            </Label>
            <Input
              value={form.subtitle}
              onChange={(e) => setForm({ ...form, subtitle: e.target.value.slice(0, 100) })}
              placeholder="如：产地直发 · 限量珍藏版 · 买二送一"
              className="h-11 text-sm"
              maxLength={100}
            />
          </div>

          {/* 分类 + 品牌 */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <Label className="text-xs text-gray-500 mb-1.5 block">商品分类</Label>
              <Select value={form.categoryId} onValueChange={(v) => setForm({ ...form, categoryId: v })}>
                <SelectTrigger className="h-11 text-sm">
                  <SelectValue placeholder="选择分类" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1.5 block">品牌</Label>
              <Input
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                placeholder="品牌名称（选填）"
                className="h-11 text-sm"
              />
            </div>
          </div>

          {/* 归属商家 */}
          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">归属商家</Label>
            <Select
              value={form.ownerMerchantId}
              onValueChange={(v) => setForm({ ...form, ownerMerchantId: v })}
            >
              <SelectTrigger className="h-11 text-sm">
                <SelectValue placeholder="选择商家（不选则为平台自有）" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__platform__">平台自有</SelectItem>
                {merchantsList.map((m: any) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.shopName} ({m.merchantCode})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ===== 区块2：商品图片 ===== */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <SectionTitle icon={<ImagePlus className="w-4 h-4 text-red-600" />} title="商品图片" />
          <p className="text-xs text-gray-400 mb-3">
            最多上传 9 张图片，第一张为主图。建议尺寸 800×800px，支持 JPG/PNG/WebP，单张最大 10MB。
          </p>

          <div className="grid grid-cols-3 gap-2.5">
            {/* 已有图片 */}
            {form.imageUrls.map((url, index) => (
              <ImageUploadCard
                key={index}
                url={url}
                onUpload={(file) => handleUploadImage(file, index)}
                onRemove={() => handleRemoveImage(index)}
                isMain={index === 0}
                isLoading={uploadingIndex === index}
                inputId={`img-upload-${index}`}
              />
            ))}
            {/* 添加新图片按钮（最多9张） */}
            {form.imageUrls.length < 9 && (
              <ImageUploadCard
                onUpload={(file) => handleUploadImage(file, form.imageUrls.length)}
                isLoading={uploadingIndex === form.imageUrls.length}
                inputId={`img-upload-new`}
              />
            )}
          </div>
          {form.imageUrls.length === 0 && (
            <p className="text-xs text-amber-500 mt-2 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              建议至少上传一张商品图片
            </p>
          )}

          {/* 列表预览图 */}
          <div className="mt-4 p-3 bg-amber-50 rounded-xl border border-amber-100">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-semibold text-amber-800">列表预览图（积分商城封面图）</span>
              <span className="text-xs text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">建议 800×800px 正方形</span>
            </div>
            <p className="text-xs text-amber-500 mb-2">不上传则自动使用主图，上传后在积分商城列表中显示完美方形预览图。</p>
            <div className="flex items-center gap-3">
              <div
                className="relative w-20 h-20 rounded-xl overflow-hidden border-2 border-dashed border-amber-300 flex-shrink-0 cursor-pointer"
                onClick={() => document.getElementById('thumbnail-upload')?.click()}
              >
                {form.thumbnailUrl ? (
                  <>
                    <img src={form.thumbnailUrl} alt="预览图" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70"
                      onClick={(e) => { e.stopPropagation(); setForm(prev => ({ ...prev, thumbnailUrl: '' })); }}
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-amber-400">
                    <ImagePlus className="w-5 h-5" />
                    <span className="text-[10px]">上传</span>
                  </div>
                )}
              </div>
              <div className="text-xs text-gray-500 leading-relaxed">
                <p>• 上传一张方形封面图</p>
                <p>• 建议尺寸：800×800px</p>
                <p>• 主要产品居中，背景简洁</p>
                <p>• 支持 JPG/PNG/WebP</p>
              </div>
            </div>
            <input
              id="thumbnail-upload"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (!file.type.startsWith('image/')) { toast.error('请选择图片文件'); return; }
                if (file.size > 10 * 1024 * 1024) { toast.error('图片大小不能超过 10MB'); return; }
                try {
                  const reader = new FileReader();
                  reader.onload = async (ev) => {
                    const base64 = ev.target?.result as string;
                    const result = await uploadImageMutation.mutateAsync({
                      imageData: base64,
                      folder: 'merchant-products/thumbnails',
                    });
                    setForm(prev => ({ ...prev, thumbnailUrl: result.url }));
                    toast.success('预览图上传成功');
                  };
                  reader.readAsDataURL(file);
                } catch (err: any) {
                  toast.error('上传失败: ' + (err?.message || ''));
                }
                e.target.value = '';
              }}
            />
          </div>
        </div>

        {/* ===== 区块3：价格与库存 ===== */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <SectionTitle icon={<DollarSign className="w-4 h-4 text-red-600" />} title="价格与库存" required />

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <Label className="text-xs text-gray-500 mb-1.5 block">
                售价（元）<span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">¥</span>
                <Input
                  type="number"
                  value={form.basePrice}
                  onChange={(e) => setForm({ ...form, basePrice: e.target.value })}
                  placeholder="0.00"
                  className="h-11 pl-7 text-sm"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1.5 block">划线原价（元）</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">¥</span>
                <Input
                  type="number"
                  value={form.originalPrice}
                  onChange={(e) => setForm({ ...form, originalPrice: e.target.value })}
                  placeholder="可选"
                  className="h-11 pl-7 text-sm"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-500 mb-1.5 block">库存数量</Label>
              <Input
                type="number"
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: e.target.value })}
                placeholder="999"
                className="h-11 text-sm"
                min="0"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1.5 block">计量单位</Label>
              <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                <SelectTrigger className="h-11 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["件", "瓶", "箱", "盒", "套", "个", "袋", "包", "克", "千克", "升", "毫升"].map(u => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* ===== 区块4：商品规格（SKU）===== */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <SectionTitle icon={<Tag className="w-4 h-4 text-red-600" />} title="商品规格（SKU）" />
          <p className="text-xs text-gray-400 mb-3">
            如有多规格（颜色/尺码/容量等），可在此添加。每个规格可单独设置价格调整和库存。
          </p>

          {form.specs.length === 0 ? (
            <div className="text-center py-6 border-2 border-dashed border-gray-200 rounded-xl">
              <Tag className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">暂无规格，点击下方按钮添加</p>
            </div>
          ) : (
            <div className="space-y-3 mb-3">
              {form.specs.map((spec) => (
                <div key={spec.id} className="bg-gray-50 rounded-xl p-3 relative">
                  <button
                    type="button"
                    onClick={() => removeSpec(spec.id)}
                    className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div>
                      <Label className="text-xs text-gray-400 mb-1 block">规格名</Label>
                      <Input
                        value={spec.specName}
                        onChange={(e) => updateSpec(spec.id, "specName", e.target.value)}
                        placeholder="如：颜色、容量"
                        className="h-9 text-sm bg-white"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-400 mb-1 block">规格值</Label>
                      <Input
                        value={spec.specValue}
                        onChange={(e) => updateSpec(spec.id, "specValue", e.target.value)}
                        placeholder="如：红色、750ml"
                        className="h-9 text-sm bg-white"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-gray-400 mb-1 block">价格调整（元）</Label>
                      <Input
                        type="number"
                        value={spec.priceAdjustment}
                        onChange={(e) => updateSpec(spec.id, "priceAdjustment", e.target.value)}
                        placeholder="0.00"
                        className="h-9 text-sm bg-white"
                        step="0.01"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-400 mb-1 block">规格库存</Label>
                      <Input
                        type="number"
                        value={spec.stock}
                        onChange={(e) => updateSpec(spec.id, "stock", e.target.value)}
                        placeholder="999"
                        className="h-9 text-sm bg-white"
                        min="0"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={addSpec}
            className="w-full h-10 flex items-center justify-center gap-2 text-sm text-red-600 border border-dashed border-red-300 rounded-xl hover:bg-red-50 active:bg-red-100 transition-colors mt-2"
          >
            <Plus className="w-4 h-4" />
            添加规格
          </button>
        </div>

        {/* ===== 区块5：积分商城 ===== */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <SectionTitle icon={<Star className="w-4 h-4 text-red-600" />} title="积分商城" />

          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-medium text-gray-700">上架到积分商城</p>
              <p className="text-xs text-gray-400 mt-0.5">开启后用户可用积分兑换此商品</p>
            </div>
            <Switch
              checked={form.inPointsShop}
              onCheckedChange={(checked) => setForm({ ...form, inPointsShop: checked })}
            />
          </div>

          {form.inPointsShop && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <Label className="text-xs text-amber-700 mb-1.5 block font-medium">
                积分兑换价格 <span className="text-red-500">*</span>
              </Label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    type="number"
                    value={form.pointsPrice}
                    onChange={(e) => setForm({ ...form, pointsPrice: e.target.value })}
                    placeholder="填写所需积分数量"
                    className="h-11 text-sm bg-white pr-12"
                    min="1"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-600 text-sm font-medium">积分</span>
                </div>
              </div>
              {form.pointsPrice && Number(form.pointsPrice) > 0 && (
                <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  用户需 {form.pointsPrice} 积分可兑换此商品
                </p>
              )}
            </div>
          )}
        </div>

        {/* ===== 区块：蓝色角标 ===== */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <SectionTitle icon={<Tag className="w-4 h-4 text-blue-600" />} title="图片角标" />

          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-medium text-gray-700">显示蓝色角标</p>
              <p className="text-xs text-gray-400 mt-0.5">开启后商品图片左下角显示胶囊形角标</p>
            </div>
            <Switch
              checked={form.badgeEnabled}
              onCheckedChange={(checked) => setForm({ ...form, badgeEnabled: checked })}
            />
          </div>

          {form.badgeEnabled && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
              <Label className="text-xs text-blue-700 mb-1.5 block font-medium">
                角标文字 <span className="text-gray-400">(建议 2-8 字)</span>
              </Label>
              <Input
                type="text"
                value={form.badgeText}
                onChange={(e) => {
                  const val = e.target.value.slice(0, 8);
                  setForm({ ...form, badgeText: val });
                }}
                placeholder="如：看讲解、限时特惠、新品上架..."
                className="h-11 text-sm bg-white"
                maxLength={8}
              />
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-gray-400">{form.badgeText.length}/8 字</p>
                {form.badgeText && (
                  <div className="flex items-center gap-0 rounded-full overflow-hidden text-xs shadow-sm">
                    <span className="bg-blue-600 text-white px-2 py-0.5 flex items-center gap-1">
                      <span>▶</span>
                    </span>
                    <span className="bg-white text-blue-600 border border-blue-200 px-2 py-0.5 font-medium border-l-0">{form.badgeText}</span>
                  </div>
                )}
              </div>
              {form.badgeText && (
                <p className="text-xs text-blue-600 mt-1.5 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  角标将显示在商品图片左下角
                </p>
              )}
            </div>
          )}
        </div>

        {/* ===== 区块6：商品详情 ===== */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <SectionTitle icon={<Settings className="w-4 h-4 text-red-600" />} title="商品详情" />
          <p className="text-xs text-gray-400 mb-3">
            填写商品的详细介绍，包括产品特点、使用方法、注意事项等。
          </p>
          <Textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="请填写商品详细描述，如：产品特点、成分、使用方法、注意事项、储存条件等..."
            className="min-h-[140px] text-sm resize-none"
          />
          <p className="text-xs text-gray-300 mt-1 text-right">{form.description.length} 字</p>
        </div>

        {/* ===== 区块7：物流设置 ===== */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <SectionTitle icon={<Truck className="w-4 h-4 text-red-600" />} title="物流设置" />

          <div className="grid grid-cols-3 gap-2 mb-4">
            {["包邮", "到付", "运费模板"].map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setForm({ ...form, shippingNote: opt === "包邮" ? "包邮" : opt === "到付" ? "到付" : form.shippingNote })}
                className={`h-10 rounded-xl text-sm font-medium border transition-all
                  ${form.shippingNote === opt || (opt === "包邮" && form.shippingNote === "包邮")
                    ? "bg-red-600 text-white border-red-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-red-300"
                  }`}
              >
                {opt}
              </button>
            ))}
          </div>

          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">物流备注</Label>
            <Input
              value={form.shippingNote}
              onChange={(e) => setForm({ ...form, shippingNote: e.target.value })}
              placeholder="如：包邮 / 顺丰到付 / 偏远地区加收运费"
              className="h-11 text-sm"
            />
          </div>
        </div>

        {/* ===== 区块8：扩展字段 ===== */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <SectionTitle icon={<Settings className="w-4 h-4 text-red-600" />} title="扩展属性（高级）" />
          <p className="text-xs text-gray-400 mb-3">
            用于存储特定品类的专属属性，如红酒的年份/产区/酒庄，以 JSON 格式填写。
          </p>
          <Input
            value={form.extendedFields}
            onChange={(e) => setForm({ ...form, extendedFields: e.target.value })}
            placeholder='{"vintage":"2018","region":"波尔多","winery":"拉菲古堡"}'
            className="h-11 text-xs font-mono"
          />
        </div>

        {/* ===== 区块9：发布状态 ===== */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <SectionTitle icon={<CheckCircle2 className="w-4 h-4 text-red-600" />} title="发布状态" />

          <div className="grid grid-cols-3 gap-2">
            {[
              { value: "active", label: "立即上架", desc: "发布后即可购买", color: "text-green-600 border-green-500 bg-green-50" },
              { value: "inactive", label: "暂不上架", desc: "保存但不展示", color: "text-gray-600 border-gray-300 bg-gray-50" },
              { value: "draft", label: "存为草稿", desc: "继续完善信息", color: "text-blue-600 border-blue-400 bg-blue-50" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm({ ...form, status: opt.value as any })}
                className={`p-3 rounded-xl border-2 text-left transition-all
                  ${form.status === opt.value
                    ? opt.color + " border-current"
                    : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                  }`}
              >
                <p className="text-xs font-semibold">{opt.label}</p>
                <p className="text-[10px] mt-0.5 opacity-70">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* ===== 底部操作栏 ===== */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 shadow-lg z-50">
        <div className="max-w-lg mx-auto flex gap-3">
          <Button
            variant="outline"
            onClick={goBack}
            className="flex-none px-5 h-12 text-gray-600 border-gray-300"
            disabled={isSaving}
          >
            取消
          </Button>
          <Button
            onClick={() => handleSave()}
            disabled={isSaving}
            className="flex-1 h-12 bg-red-600 hover:bg-red-700 text-white font-semibold text-base"
          >
            {isSaving ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                保存中...
              </span>
            ) : (
              isEdit ? "保存修改" : (form.status === "active" ? "发布商品" : form.status === "draft" ? "保存草稿" : "保存商品")
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
