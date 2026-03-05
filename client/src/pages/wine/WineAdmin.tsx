/**
 * 红酒文化商会 - 后台管理页面
 * 功能：商品库管理（增删改查）+ 产区管理 + 图片上传（含压缩）
 */
import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { ArrowLeft, Plus, Edit2, Trash2, Upload, X, Package, MapPin, Eye, EyeOff, Wine } from "lucide-react";

const MERCHANT_CODE = "cx8618";

// 产区选项（快速填充）
const PRESET_REGIONS = [
  { country: "法国", flagEmoji: "🇫🇷", subRegions: ["波尔多", "勃艮第", "罗讷河谷", "香槟区", "阿尔萨斯"] },
  { country: "意大利", flagEmoji: "🇮🇹", subRegions: ["托斯卡纳", "皮埃蒙特", "威尼托", "西西里"] },
  { country: "澳大利亚", flagEmoji: "🇦🇺", subRegions: ["南澳大利亚", "维多利亚", "新南威尔士"] },
  { country: "智利", flagEmoji: "🇨🇱", subRegions: ["迈坡谷", "卡萨布兰卡", "科尔查瓜"] },
  { country: "西班牙", flagEmoji: "🇪🇸", subRegions: ["里奥哈", "普里奥拉托", "赫雷斯"] },
  { country: "美国", flagEmoji: "🇺🇸", subRegions: ["纳帕谷", "索诺玛", "俄勒冈"] },
  { country: "德国", flagEmoji: "🇩🇪", subRegions: ["摩泽尔", "莱茵高", "法尔兹"] },
  { country: "阿根廷", flagEmoji: "🇦🇷", subRegions: ["门多萨", "萨尔塔"] },
];

type Tab = "products" | "regions";

export default function WineAdmin() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("products");

  // 商品管理状态
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);

  // 产区管理状态
  const [showRegionForm, setShowRegionForm] = useState(false);
  const [editingRegion, setEditingRegion] = useState<any>(null);

  // 获取商家信息
  const { data: merchant } = trpc.merchant.getMerchantByCode.useQuery({ merchantCode: MERCHANT_CODE });

  // 获取商品列表
  const { data: products = [], refetch: refetchProducts } = trpc.merchant.getMerchantProducts.useQuery(
    { merchantId: merchant?.id ?? 0, status: "all" },
    { enabled: !!merchant?.id }
  );

  // 获取产区列表
  const { data: regions = [], refetch: refetchRegions } = trpc.merchant.getWineRegions.useQuery(
    { merchantCode: MERCHANT_CODE }
  );

  // 商品操作
  const createProduct = trpc.merchant.createProduct.useMutation({
    onSuccess: () => { refetchProducts(); setShowProductForm(false); toast.success("商品已添加"); },
    onError: (e) => toast.error(e.message),
  });
  const updateProduct = trpc.merchant.updateProduct.useMutation({
    onSuccess: () => { refetchProducts(); setEditingProduct(null); toast.success("商品已更新"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteProduct = trpc.merchant.deleteProduct.useMutation({
    onSuccess: () => { refetchProducts(); toast.success("商品已下架"); },
    onError: (e) => toast.error(e.message),
  });

  // 产区操作
  const createRegion = trpc.merchant.createWineRegion.useMutation({
    onSuccess: () => { refetchRegions(); setShowRegionForm(false); toast.success("产区已添加"); },
    onError: (e) => toast.error(e.message),
  });
  const updateRegion = trpc.merchant.updateWineRegion.useMutation({
    onSuccess: () => { refetchRegions(); setEditingRegion(null); toast.success("产区已更新"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteRegion = trpc.merchant.deleteWineRegion.useMutation({
    onSuccess: () => { refetchRegions(); toast.success("产区已删除"); },
    onError: (e) => toast.error(e.message),
  });

  // 图片上传
  const uploadImage = trpc.merchant.uploadProductImage.useMutation();

  const statusLabel = (s: string) => {
    if (s === "active") return <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/50 text-green-300 border border-green-700">已上架</span>;
    if (s === "inactive") return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-600">已下架</span>;
    return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-900/50 text-yellow-300 border border-yellow-700">草稿</span>;
  };

  return (
    <div className="min-h-screen bg-[#1a0a0a] text-[#e8d5b7]">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 bg-[#2d0d0d] border-b border-[#5a1e1e] px-4 py-3 flex items-center gap-3">
        <button onClick={() => setLocation("/wine/profile")} className="text-[#C9A84C]">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <Wine className="w-5 h-5 text-[#C9A84C]" />
        <h1 className="font-bold text-base text-[#e8d5b7]">商品库管理</h1>
        <div className="ml-auto text-xs text-[#8a6a4a]">{merchant?.shopName || "红酒文化商会"}</div>
      </div>

      {/* Tab 切换 */}
      <div className="flex border-b border-[#5a1e1e] bg-[#2d0d0d]">
        <button
          onClick={() => setActiveTab("products")}
          className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${activeTab === "products" ? "text-[#C9A84C] border-b-2 border-[#C9A84C]" : "text-[#8a6a4a]"}`}
        >
          <Package className="w-4 h-4" /> 商品库 ({products.length})
        </button>
        <button
          onClick={() => setActiveTab("regions")}
          className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${activeTab === "regions" ? "text-[#C9A84C] border-b-2 border-[#C9A84C]" : "text-[#8a6a4a]"}`}
        >
          <MapPin className="w-4 h-4" /> 产区管理 ({regions.length})
        </button>
      </div>

      <div className="p-4 pb-24">
        {/* 商品库 Tab */}
        {activeTab === "products" && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <p className="text-xs text-[#8a6a4a]">管理您的红酒商品，设置上架/下架状态</p>
              <button
                onClick={() => { setEditingProduct(null); setShowProductForm(true); }}
                className="flex items-center gap-1 bg-[#722F37] text-[#e8d5b7] px-3 py-2 rounded-lg text-sm font-medium"
              >
                <Plus className="w-4 h-4" /> 添加商品
              </button>
            </div>

            {products.length === 0 ? (
              <div className="text-center py-16 text-[#8a6a4a]">
                <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">暂无商品，点击"添加商品"开始录入</p>
              </div>
            ) : (
              <div className="space-y-3">
                {products.map((p: any) => (
                  <div key={p.id} className="bg-[#2d0d0d] border border-[#5a1e1e] rounded-xl p-3 flex gap-3">
                    {/* 商品图片 */}
                    <div className="w-16 h-16 rounded-lg bg-[#1a0a0a] border border-[#5a1e1e] flex-shrink-0 overflow-hidden">
                      {p.mainImageUrl ? (
                        <img src={p.mainImageUrl} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Wine className="w-6 h-6 text-[#5a1e1e]" />
                        </div>
                      )}
                    </div>
                    {/* 商品信息 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-sm text-[#e8d5b7] truncate">{p.name}</p>
                        {statusLabel(p.status)}
                      </div>
                      <p className="text-xs text-[#8a6a4a] mt-0.5 truncate">{p.subtitle || "—"}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-[#C9A84C] font-bold text-sm">¥{p.basePrice}</span>
                        {p.originalPrice && <span className="text-[#8a6a4a] text-xs line-through">¥{p.originalPrice}</span>}
                        <span className="text-[#8a6a4a] text-xs">库存 {p.stock}</span>
                      </div>
                    </div>
                    {/* 操作按钮 */}
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => { setEditingProduct(p); setShowProductForm(true); }}
                        className="p-1.5 rounded-lg bg-[#1a0a0a] border border-[#5a1e1e] text-[#C9A84C]"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => updateProduct.mutate({ id: p.id, status: p.status === "active" ? "inactive" : "active" })}
                        className="p-1.5 rounded-lg bg-[#1a0a0a] border border-[#5a1e1e] text-[#8a6a4a]"
                      >
                        {p.status === "active" ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 产区管理 Tab */}
        {activeTab === "regions" && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <p className="text-xs text-[#8a6a4a]">管理红酒产区，用于商品分类筛选</p>
              <button
                onClick={() => { setEditingRegion(null); setShowRegionForm(true); }}
                className="flex items-center gap-1 bg-[#722F37] text-[#e8d5b7] px-3 py-2 rounded-lg text-sm font-medium"
              >
                <Plus className="w-4 h-4" /> 添加产区
              </button>
            </div>

            {regions.length === 0 ? (
              <div className="text-center py-16 text-[#8a6a4a]">
                <MapPin className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">暂无产区，点击"添加产区"开始配置</p>
              </div>
            ) : (
              <div className="space-y-2">
                {regions.map((r: any) => (
                  <div key={r.id} className="bg-[#2d0d0d] border border-[#5a1e1e] rounded-xl p-3 flex items-center gap-3">
                    <span className="text-2xl">{r.flagEmoji || "🍷"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-[#e8d5b7]">{r.name}</p>
                      <p className="text-xs text-[#8a6a4a]">{r.country}{r.subRegion ? ` · ${r.subRegion}` : ""}</p>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => { setEditingRegion(r); setShowRegionForm(true); }}
                        className="p-1.5 rounded-lg bg-[#1a0a0a] border border-[#5a1e1e] text-[#C9A84C]"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteRegion.mutate({ id: r.id })}
                        className="p-1.5 rounded-lg bg-[#1a0a0a] border border-[#5a1e1e] text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 商品表单弹窗 */}
      {showProductForm && (
        <ProductFormModal
          merchant={merchant}
          regions={regions}
          product={editingProduct}
          uploadImage={uploadImage}
          onSave={(data: any) => {
            if (editingProduct) {
              updateProduct.mutate({ id: editingProduct.id, ...data });
            } else {
              createProduct.mutate({ ownerMerchantId: merchant?.id ?? 0, ...data });
            }
          }}
          onClose={() => { setShowProductForm(false); setEditingProduct(null); }}
          saving={createProduct.isPending || updateProduct.isPending}
        />
      )}

      {/* 产区表单弹窗 */}
      {showRegionForm && (
        <RegionFormModal
          merchant={merchant}
          region={editingRegion}
          onSave={(data: any) => {
            if (editingRegion) {
              updateRegion.mutate({ id: editingRegion.id, ...data });
            } else {
              createRegion.mutate({ merchantId: merchant?.id ?? 0, ...data });
            }
          }}
          onClose={() => { setShowRegionForm(false); setEditingRegion(null); }}
          saving={createRegion.isPending || updateRegion.isPending}
        />
      )}
    </div>
  );
}

// ===== 商品表单弹窗 =====
function ProductFormModal({ merchant, regions, product, uploadImage, onSave, onClose, saving }: any) {
  const [form, setForm] = useState({
    name: product?.name || "",
    subtitle: product?.subtitle || "",
    basePrice: product?.basePrice || "",
    originalPrice: product?.originalPrice || "",
    stock: product?.stock ?? 999,
    status: product?.status || "inactive",
    mainImageUrl: product?.mainImageUrl || "",
    description: product?.description || "",
    extendedFields: product?.extendedFields ? JSON.parse(product.extendedFields) : {
      winery: "", vintage: "", region: "", grapeVariety: "", alcoholContent: "", volume: "750ml",
    },
  });
  const [imagePreview, setImagePreview] = useState<string>(product?.mainImageUrl || "");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("图片不能超过10MB"); return; }
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = ev.target?.result as string;
        setImagePreview(base64);
        const result = await uploadImage.mutateAsync({ base64, mimeType: file.type, filename: file.name });
        setForm(f => ({ ...f, mainImageUrl: result.url }));
        setImagePreview(result.url);
        toast.success("图片上传成功（已压缩）");
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (e: any) {
      toast.error("图片上传失败: " + e.message);
      setUploading(false);
    }
  };

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error("请填写商品名称"); return; }
    if (!form.basePrice) { toast.error("请填写销售价格"); return; }
    onSave({
      name: form.name,
      subtitle: form.subtitle || null,
      basePrice: String(form.basePrice),
      originalPrice: form.originalPrice ? String(form.originalPrice) : null,
      stock: Number(form.stock),
      status: form.status,
      mainImageUrl: form.mainImageUrl || null,
      description: form.description || null,
      extendedFields: JSON.stringify(form.extendedFields),
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end">
      <div className="w-full bg-[#1a0a0a] rounded-t-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-[#2d0d0d] border-b border-[#5a1e1e] px-4 py-3 flex items-center justify-between">
          <h2 className="font-bold text-[#e8d5b7]">{product ? "编辑商品" : "添加商品"}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-[#8a6a4a]" /></button>
        </div>
        <div className="p-4 space-y-4">
          {/* 图片上传 */}
          <div>
            <label className="text-xs text-[#8a6a4a] mb-2 block">商品主图（自动压缩至适合手机显示）</label>
            <div
              onClick={() => fileRef.current?.click()}
              className="w-full h-40 rounded-xl border-2 border-dashed border-[#5a1e1e] flex items-center justify-center cursor-pointer overflow-hidden bg-[#2d0d0d]"
            >
              {uploading ? (
                <div className="text-[#C9A84C] text-sm">上传中...</div>
              ) : imagePreview ? (
                <img src={imagePreview} alt="预览" className="w-full h-full object-contain" />
              ) : (
                <div className="text-center text-[#8a6a4a]">
                  <Upload className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-sm">点击上传图片</p>
                  <p className="text-xs mt-1">支持 JPG/PNG/WebP，最大10MB</p>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
          </div>

          {/* 基本信息 */}
          <div className="space-y-3">
            <div>
              <label className="text-xs text-[#8a6a4a] mb-1 block">商品名称 *</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="如：拉菲古堡 2018"
                className="w-full bg-[#2d0d0d] border border-[#5a1e1e] rounded-lg px-3 py-2.5 text-sm text-[#e8d5b7] placeholder-[#5a3a2a]"
              />
            </div>
            <div>
              <label className="text-xs text-[#8a6a4a] mb-1 block">副标题</label>
              <input
                value={form.subtitle}
                onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))}
                placeholder="如：法国·波尔多·梅多克"
                className="w-full bg-[#2d0d0d] border border-[#5a1e1e] rounded-lg px-3 py-2.5 text-sm text-[#e8d5b7] placeholder-[#5a3a2a]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#8a6a4a] mb-1 block">销售价格 *</label>
                <input
                  type="number"
                  value={form.basePrice}
                  onChange={e => setForm(f => ({ ...f, basePrice: e.target.value }))}
                  placeholder="0.00"
                  className="w-full bg-[#2d0d0d] border border-[#5a1e1e] rounded-lg px-3 py-2.5 text-sm text-[#e8d5b7] placeholder-[#5a3a2a]"
                />
              </div>
              <div>
                <label className="text-xs text-[#8a6a4a] mb-1 block">划线原价</label>
                <input
                  type="number"
                  value={form.originalPrice}
                  onChange={e => setForm(f => ({ ...f, originalPrice: e.target.value }))}
                  placeholder="0.00"
                  className="w-full bg-[#2d0d0d] border border-[#5a1e1e] rounded-lg px-3 py-2.5 text-sm text-[#e8d5b7] placeholder-[#5a3a2a]"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#8a6a4a] mb-1 block">库存数量</label>
                <input
                  type="number"
                  value={form.stock}
                  onChange={e => setForm(f => ({ ...f, stock: Number(e.target.value) }))}
                  className="w-full bg-[#2d0d0d] border border-[#5a1e1e] rounded-lg px-3 py-2.5 text-sm text-[#e8d5b7]"
                />
              </div>
              <div>
                <label className="text-xs text-[#8a6a4a] mb-1 block">上架状态</label>
                <select
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full bg-[#2d0d0d] border border-[#5a1e1e] rounded-lg px-3 py-2.5 text-sm text-[#e8d5b7]"
                >
                  <option value="active">已上架</option>
                  <option value="inactive">已下架</option>
                  <option value="draft">草稿</option>
                </select>
              </div>
            </div>
          </div>

          {/* 红酒专属字段 */}
          <div className="border-t border-[#5a1e1e] pt-4">
            <p className="text-xs text-[#C9A84C] mb-3 font-medium">红酒专属信息</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#8a6a4a] mb-1 block">酒庄</label>
                  <input
                    value={form.extendedFields.winery}
                    onChange={e => setForm(f => ({ ...f, extendedFields: { ...f.extendedFields, winery: e.target.value } }))}
                    placeholder="如：拉菲古堡"
                    className="w-full bg-[#2d0d0d] border border-[#5a1e1e] rounded-lg px-3 py-2.5 text-sm text-[#e8d5b7] placeholder-[#5a3a2a]"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#8a6a4a] mb-1 block">年份</label>
                  <input
                    value={form.extendedFields.vintage}
                    onChange={e => setForm(f => ({ ...f, extendedFields: { ...f.extendedFields, vintage: e.target.value } }))}
                    placeholder="如：2018"
                    className="w-full bg-[#2d0d0d] border border-[#5a1e1e] rounded-lg px-3 py-2.5 text-sm text-[#e8d5b7] placeholder-[#5a3a2a]"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-[#8a6a4a] mb-1 block">产区</label>
                <select
                  value={form.extendedFields.region}
                  onChange={e => setForm(f => ({ ...f, extendedFields: { ...f.extendedFields, region: e.target.value } }))}
                  className="w-full bg-[#2d0d0d] border border-[#5a1e1e] rounded-lg px-3 py-2.5 text-sm text-[#e8d5b7]"
                >
                  <option value="">选择产区</option>
                  {regions.map((r: any) => (
                    <option key={r.id} value={r.name}>{r.flagEmoji} {r.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#8a6a4a] mb-1 block">葡萄品种</label>
                  <input
                    value={form.extendedFields.grapeVariety}
                    onChange={e => setForm(f => ({ ...f, extendedFields: { ...f.extendedFields, grapeVariety: e.target.value } }))}
                    placeholder="如：赤霞珠"
                    className="w-full bg-[#2d0d0d] border border-[#5a1e1e] rounded-lg px-3 py-2.5 text-sm text-[#e8d5b7] placeholder-[#5a3a2a]"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#8a6a4a] mb-1 block">酒精度</label>
                  <input
                    value={form.extendedFields.alcoholContent}
                    onChange={e => setForm(f => ({ ...f, extendedFields: { ...f.extendedFields, alcoholContent: e.target.value } }))}
                    placeholder="如：13.5%"
                    className="w-full bg-[#2d0d0d] border border-[#5a1e1e] rounded-lg px-3 py-2.5 text-sm text-[#e8d5b7] placeholder-[#5a3a2a]"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 商品描述 */}
          <div>
            <label className="text-xs text-[#8a6a4a] mb-1 block">商品描述</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3}
              placeholder="描述这款酒的特点、口感、适饮场合..."
              className="w-full bg-[#2d0d0d] border border-[#5a1e1e] rounded-lg px-3 py-2.5 text-sm text-[#e8d5b7] placeholder-[#5a3a2a] resize-none"
            />
          </div>

          {/* 保存按钮 */}
          <button
            onClick={handleSubmit}
            disabled={saving || uploading}
            className="w-full bg-[#722F37] text-[#e8d5b7] py-3 rounded-xl font-bold text-base disabled:opacity-50"
          >
            {saving ? "保存中..." : product ? "保存修改" : "添加到商品库"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== 产区表单弹窗 =====
function RegionFormModal({ merchant, region, onSave, onClose, saving }: any) {
  const [form, setForm] = useState({
    name: region?.name || "",
    country: region?.country || "",
    subRegion: region?.subRegion || "",
    description: region?.description || "",
    flagEmoji: region?.flagEmoji || "",
    sortOrder: region?.sortOrder ?? 0,
  });
  const [selectedPreset, setSelectedPreset] = useState("");

  const handlePreset = (preset: typeof PRESET_REGIONS[0]) => {
    setForm(f => ({ ...f, country: preset.country, flagEmoji: preset.flagEmoji }));
    setSelectedPreset(preset.country);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error("请填写产区名称"); return; }
    if (!form.country.trim()) { toast.error("请填写国家"); return; }
    onSave(form);
  };

  const currentPreset = PRESET_REGIONS.find(p => p.country === form.country);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end">
      <div className="w-full bg-[#1a0a0a] rounded-t-2xl max-h-[80vh] overflow-y-auto">
        <div className="sticky top-0 bg-[#2d0d0d] border-b border-[#5a1e1e] px-4 py-3 flex items-center justify-between">
          <h2 className="font-bold text-[#e8d5b7]">{region ? "编辑产区" : "添加产区"}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-[#8a6a4a]" /></button>
        </div>
        <div className="p-4 space-y-4">
          {/* 快速选择国家 */}
          <div>
            <label className="text-xs text-[#8a6a4a] mb-2 block">快速选择国家</label>
            <div className="flex flex-wrap gap-2">
              {PRESET_REGIONS.map(p => (
                <button
                  key={p.country}
                  onClick={() => handlePreset(p)}
                  className={`px-3 py-1.5 rounded-full text-sm border ${form.country === p.country ? "bg-[#722F37] border-[#722F37] text-[#e8d5b7]" : "bg-[#2d0d0d] border-[#5a1e1e] text-[#8a6a4a]"}`}
                >
                  {p.flagEmoji} {p.country}
                </button>
              ))}
            </div>
          </div>

          {/* 子产区快速选择 */}
          {currentPreset && (
            <div>
              <label className="text-xs text-[#8a6a4a] mb-2 block">快速选择子产区</label>
              <div className="flex flex-wrap gap-2">
                {currentPreset.subRegions.map(s => (
                  <button
                    key={s}
                    onClick={() => {
                      setForm(f => ({
                        ...f,
                        subRegion: s,
                        name: `${form.country}·${s}`,
                      }));
                    }}
                    className={`px-3 py-1.5 rounded-full text-sm border ${form.subRegion === s ? "bg-[#722F37] border-[#722F37] text-[#e8d5b7]" : "bg-[#2d0d0d] border-[#5a1e1e] text-[#8a6a4a]"}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="text-xs text-[#8a6a4a] mb-1 block">产区名称 *</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="如：法国·波尔多"
                className="w-full bg-[#2d0d0d] border border-[#5a1e1e] rounded-lg px-3 py-2.5 text-sm text-[#e8d5b7] placeholder-[#5a3a2a]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#8a6a4a] mb-1 block">国家 *</label>
                <input
                  value={form.country}
                  onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                  placeholder="如：法国"
                  className="w-full bg-[#2d0d0d] border border-[#5a1e1e] rounded-lg px-3 py-2.5 text-sm text-[#e8d5b7] placeholder-[#5a3a2a]"
                />
              </div>
              <div>
                <label className="text-xs text-[#8a6a4a] mb-1 block">国旗Emoji</label>
                <input
                  value={form.flagEmoji}
                  onChange={e => setForm(f => ({ ...f, flagEmoji: e.target.value }))}
                  placeholder="🇫🇷"
                  className="w-full bg-[#2d0d0d] border border-[#5a1e1e] rounded-lg px-3 py-2.5 text-sm text-[#e8d5b7] placeholder-[#5a3a2a]"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-[#8a6a4a] mb-1 block">子产区</label>
              <input
                value={form.subRegion}
                onChange={e => setForm(f => ({ ...f, subRegion: e.target.value }))}
                placeholder="如：梅多克"
                className="w-full bg-[#2d0d0d] border border-[#5a1e1e] rounded-lg px-3 py-2.5 text-sm text-[#e8d5b7] placeholder-[#5a3a2a]"
              />
            </div>
            <div>
              <label className="text-xs text-[#8a6a4a] mb-1 block">产区描述</label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                placeholder="简单描述这个产区的特点..."
                className="w-full bg-[#2d0d0d] border border-[#5a1e1e] rounded-lg px-3 py-2.5 text-sm text-[#e8d5b7] placeholder-[#5a3a2a] resize-none"
              />
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full bg-[#722F37] text-[#e8d5b7] py-3 rounded-xl font-bold text-base disabled:opacity-50"
          >
            {saving ? "保存中..." : region ? "保存修改" : "添加产区"}
          </button>
        </div>
      </div>
    </div>
  );
}
