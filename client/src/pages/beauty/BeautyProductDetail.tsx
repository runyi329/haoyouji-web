/**
 * 奢贝美容院 - 商品详情
 * 路径: /beauty/product/:id
 * 支持两种模式：
 *   - /beauty/product/123       → 从数据库读取
 *   - /beauty/product/fallback-1 → 使用前端兜底数据
 */
import { trpc } from "@/lib/trpc";
import { Link, useParams, useLocation } from "wouter";
import { ChevronLeft, ShoppingCart, Gift, Shield, Zap, Wind, Thermometer, Wifi, Clock, Volume2, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { FALLBACK_PRODUCTS } from "./beauty-fallback-data";

// 红立方产品亮点图标映射
const FEATURE_ICONS = [
  { icon: Zap, label: "精准黄金波长", desc: "630-680nm生物活性光" },
  { icon: Gauge, label: "超大能量密度", desc: "深层穿透皮下8-10mm" },
  { icon: Wifi, label: "网络远程监控", desc: "随时掌握设备状态" },
  { icon: Thermometer, label: "智能恒温保护", desc: "安全舒适体验" },
  { icon: Clock, label: "定时时间控制", desc: "精准把控每次使用" },
  { icon: Wind, label: "两档速度选择", desc: "灵活适配需求" },
  { icon: Volume2, label: "智能语音提示", desc: "贴心操作引导" },
  { icon: Shield, label: "独立新风系统", desc: "清新空气循环" },
];

const BENEFITS = [
  { title: "焕活身体活力", subtitle: "提升精气神", desc: "温和唤醒身体能量，让人更有精神、不易疲惫" },
  { title: "促进身体循环", subtitle: "周身舒畅", desc: "助力气血顺畅运行，改善身体发沉、手脚易凉的状态" },
  { title: "温和排浊", subtitle: "身体更轻松", desc: "微微出汗，帮助代谢多余湿气与浊物，体感轻盈舒适" },
  { title: "舒缓身心", subtitle: "提升睡眠质量", desc: "放松神经，帮助睡得更安稳，晨起更有活力" },
  { title: "焕亮肌肤状态", subtitle: "透出好气色", desc: "温和养护肌肤，让肤色更透亮、肤质更细腻" },
  { title: "调理身体状态", subtitle: "体质更稳定", desc: "长期坚持，帮助身体保持良好状态，日常更有活力" },
];

export default function BeautyProductDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: currentUser } = trpc.auth.me.useQuery();

  // 判断是否使用兜底数据
  const isFallback = id.startsWith("fallback-");
  const fallbackId = isFallback ? parseInt(id.replace("fallback-", "")) : null;
  const fallbackProduct = isFallback ? FALLBACK_PRODUCTS.find(p => p.id === fallbackId) : null;

  const { data: dbProduct, isLoading } = trpc.beauty.shop.getProduct.useQuery(
    { id: parseInt(id) },
    { enabled: !isFallback }
  );

  const product = isFallback ? fallbackProduct : dbProduct;

  const addToCart = trpc.beauty.shop.addToCart.useMutation({
    onSuccess: () => {
      utils.beauty.shop.getCart.invalidate();
      toast.success("已加入购物车");
    },
    onError: (err) => toast.error("操作失败", { description: err.message }),
  });

  if (!isFallback && isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">加载中...</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3">
        <p className="text-gray-400 text-sm">商品不存在</p>
        <Link href="/beauty/shop">
          <Button variant="outline" size="sm">返回商城</Button>
        </Link>
      </div>
    );
  }

  // 判断是否是红立方产品（显示高端详情页）
  const isRedCube = product.name.includes("红立方") || product.name.includes("光焕能舱");

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* 顶部导航 */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/beauty/shop")} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="font-semibold text-gray-800">商品详情</h1>
          </div>
          {currentUser?.username && (
            <span className="text-xs text-gray-300 pr-1 select-none">{currentUser.username}</span>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto">
        {/* 商品主图 */}
        <div className="h-72 bg-gradient-to-br from-rose-50 to-pink-50 flex items-center justify-center overflow-hidden">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
          ) : (
            <Gift className="w-16 h-16 text-rose-200" />
          )}
        </div>

        <div className="px-4 py-4 space-y-5">
          {/* 基本信息 */}
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <h1 className="text-xl font-bold text-gray-800">{product.name}</h1>
            {isRedCube && (
              <p className="text-sm text-gray-500 mt-1">给身体充能 · 促循环 · 排浊物 · 提活力 · 助好眠 · 养状态</p>
            )}
            <div className="flex items-baseline gap-2 mt-3">
              <span className="text-rose-500 font-bold text-2xl">¥{Number(product.price).toLocaleString()}</span>
              {isRedCube && (
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">元气焕活年度私定养护</span>
              )}
            </div>
          </div>

          {/* 红立方专属：产品亮点 */}
          {isRedCube && (
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <h3 className="font-bold text-gray-800 text-sm mb-3">产品亮点</h3>
              <div className="grid grid-cols-2 gap-3">
                {FEATURE_ICONS.map((f, i) => (
                  <div key={i} className="flex items-start gap-2.5 p-2 rounded-lg bg-rose-50/50">
                    <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <f.icon className="w-4 h-4 text-rose-500" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-700">{f.label}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 红立方专属：六大核心功效 */}
          {isRedCube && (
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <h3 className="font-bold text-gray-800 text-sm mb-3">六大核心功效</h3>
              <div className="space-y-3">
                {BENEFITS.map((b, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-rose-400 to-pink-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-white text-xs font-bold">{i + 1}</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">
                        {b.title}，<span className="text-rose-500">{b.subtitle}</span>
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{b.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 红立方专属：科学原理 */}
          {isRedCube && (
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-4 shadow-sm">
              <h3 className="font-bold text-white text-sm mb-2">科学原理</h3>
              <p className="text-xs text-gray-300 leading-relaxed">
                红光波长630–680nm，属于生物活性光，可安全穿透皮下8–10mm，激活细胞线粒体产生ATP（细胞能量），促进一氧化氮（NO）释放，改善微循环。
              </p>
              <div className="mt-3 pt-3 border-t border-gray-700">
                <h4 className="text-xs font-semibold text-gray-400 mb-1.5">产品规格</h4>
                <div className="grid grid-cols-2 gap-y-1.5 text-xs">
                  <div><span className="text-gray-500">型号：</span><span className="text-gray-300">RQ-22</span></div>
                  <div><span className="text-gray-500">品牌：</span><span className="text-gray-300">IDEALIGHT</span></div>
                  <div><span className="text-gray-500">生产商：</span><span className="text-gray-300">上海佰时特</span></div>
                  <div><span className="text-gray-500">检测标准：</span><span className="text-gray-300">GB 4706.1</span></div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-700">
                <h4 className="text-xs font-semibold text-gray-400 mb-1.5">认证资质</h4>
                <div className="flex gap-2">
                  <span className="text-[10px] bg-gray-700 text-gray-300 px-2 py-0.5 rounded">CMA计量认证</span>
                  <span className="text-[10px] bg-gray-700 text-gray-300 px-2 py-0.5 rounded">CNAS实验室认证</span>
                  <span className="text-[10px] bg-gray-700 text-gray-300 px-2 py-0.5 rounded">国际互认</span>
                </div>
              </div>
            </div>
          )}

          {/* 通用商品描述（非红立方商品显示） */}
          {!isRedCube && product.description && (
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <h3 className="font-semibold text-gray-700 text-sm mb-2">商品介绍</h3>
              <p className="text-sm text-gray-500 leading-relaxed whitespace-pre-line">{product.description}</p>
            </div>
          )}
        </div>
      </div>

      {/* 底部操作栏 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3 flex gap-3">
        <Link href="/beauty/cart" className="flex-1">
          <Button variant="outline" className="w-full border-rose-300 text-rose-500">
            <ShoppingCart className="w-4 h-4 mr-1" />
            查看购物车
          </Button>
        </Link>
        {!isFallback ? (
          <Button
            className="flex-1 bg-rose-500 hover:bg-rose-600 text-white"
            onClick={() => addToCart.mutate({ productId: product.id, quantity: 1 })}
            disabled={addToCart.isPending}
          >
            加入购物车
          </Button>
        ) : (
          <Button
            className="flex-1 bg-rose-500 hover:bg-rose-600 text-white"
            onClick={() => toast.info("请联系客服咨询购买")}
          >
            咨询购买
          </Button>
        )}
      </div>
    </div>
  );
}
