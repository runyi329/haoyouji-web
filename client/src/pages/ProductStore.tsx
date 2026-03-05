import { useState } from 'react';
import { useLocation } from 'wouter';
import { ChevronLeft, ChevronRight, Users, BookOpen, Cpu, Zap, Star } from 'lucide-react';

// ============================================================
// 商品数据
// ============================================================

const CATEGORIES = [
  {
    id: 'contacts',
    name: '人脉管理软件',
    icon: Users,
    color: '#1A237E',
    bgGradient: 'from-[#1A237E] to-[#283593]',
    image: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-contacts-4fLDcpWoC7ZCAT35ypvu8N.webp',
    desc: '专业人脉关系管理，让每一段关系都产生价值',
    products: [
      { id: 'contacts-monthly', name: '月度会员', price: 28, unit: '/月', tag: '', tagColor: '' },
      { id: 'contacts-quarterly', name: '季度会员', price: 68, unit: '/季', tag: '省¥46', tagColor: '#FF6B35' },
      { id: 'contacts-yearly', name: '年度会员', price: 198, unit: '/年', tag: '最受欢迎', tagColor: '#D32F2F' },
      { id: 'contacts-lifetime', name: '终身会员', price: 498, unit: '一次', tag: '最划算', tagColor: '#7B1FA2' },
    ],
  },
  {
    id: 'ledger',
    name: '共享账本定制',
    icon: BookOpen,
    color: '#1B5E20',
    bgGradient: 'from-[#1B5E20] to-[#2E7D32]',
    image: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-ledger-NQcVJ5YtbWDun8Aoa4XYAe.webp',
    desc: '多人共享记账，团队财务一目了然',
    products: [
      { id: 'ledger-basic', name: '基础定制版', price: 299, unit: '一次性', tag: '入门首选', tagColor: '#2E7D32' },
      { id: 'ledger-standard', name: '标准定制版', price: 599, unit: '一次性', tag: '团队推荐', tagColor: '#1565C0' },
      { id: 'ledger-premium', name: '高级定制版', price: 1299, unit: '一次性', tag: '企业首选', tagColor: '#D32F2F' },
      { id: 'ledger-enterprise', name: '企业定制版', price: 3999, unit: '一次性', tag: '私有化部署', tagColor: '#4A148C' },
    ],
  },
  {
    id: 'compute',
    name: '算力购买',
    icon: Cpu,
    color: '#0D47A1',
    bgGradient: 'from-[#0D47A1] to-[#1565C0]',
    image: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-compute-2bXPVJV4rgCSkDNJEdtAFQ.webp',
    desc: 'AI算力驱动智能分析，让数据为你工作',
    products: [
      { id: 'compute-100', name: '100算力包', price: 9.9, unit: '一次性', tag: '体验装', tagColor: '#0277BD' },
      { id: 'compute-500', name: '500算力包', price: 39, unit: '一次性', tag: '省¥10.5', tagColor: '#FF6B35' },
      { id: 'compute-2000', name: '2000算力包', price: 128, unit: '一次性', tag: '最划算', tagColor: '#D32F2F' },
      { id: 'compute-5000', name: '5000算力包', price: 299, unit: '一次性', tag: '企业级', tagColor: '#4A148C' },
    ],
  },
];

export default function ProductStore() {
  const [, setLocation] = useLocation();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const formatPrice = (price: number) => {
    return price % 1 === 0 ? price.toString() : price.toFixed(1);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="bg-[#D32F2F] text-white sticky top-0 z-10">
        <div className="flex items-center p-4">
          <button onClick={() => setLocation('/coupons')} className="mr-3">
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-lg font-semibold">会员产品</h1>
        </div>

        {/* 分类 Tab */}
        <div className="flex border-t border-red-400/30">
          <button
            onClick={() => setActiveCategory(null)}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              activeCategory === null
                ? 'text-white border-b-2 border-white'
                : 'text-red-200'
            }`}
          >
            全部
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                activeCategory === cat.id
                  ? 'text-white border-b-2 border-white'
                  : 'text-red-200'
              }`}
            >
              {cat.name.replace('软件', '').replace('购买', '').replace('定制', '')}
            </button>
          ))}
        </div>
      </div>

      {/* 内容区 */}
      <div className="pb-8">
        {CATEGORIES.filter((cat) => activeCategory === null || cat.id === activeCategory).map((cat) => (
          <div key={cat.id} className="mb-6">
            {/* 类别 Banner */}
            <div className="relative h-36 overflow-hidden">
              <img src={cat.image} alt={cat.name} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/70 to-black/20 flex items-center px-5">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <cat.icon size={18} className="text-white" />
                    <span className="text-white font-bold text-lg">{cat.name}</span>
                  </div>
                  <p className="text-white/80 text-xs leading-relaxed max-w-[220px]">{cat.desc}</p>
                </div>
              </div>
            </div>

            {/* 商品卡片列表 */}
            <div className="px-4 pt-3 space-y-3">
              {cat.products.map((product) => (
                <button
                  key={product.id}
                  onClick={() => setLocation(`/products/${product.id}`)}
                  className="w-full bg-white rounded-xl p-4 flex items-center shadow-sm active:shadow-none transition-shadow text-left"
                >
                  {/* 左侧信息 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900">{product.name}</span>
                      {product.tag && (
                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
                          style={{ backgroundColor: product.tagColor }}
                        >
                          {product.tag}
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xl font-bold text-[#D32F2F]">
                        ¥{formatPrice(product.price)}
                      </span>
                      <span className="text-xs text-gray-400">{product.unit}</span>
                    </div>
                  </div>

                  {/* 右侧按钮 */}
                  <div className="flex items-center gap-2 ml-3">
                    <span className="bg-[#D32F2F] text-white text-sm font-medium px-4 py-1.5 rounded-full">
                      购买
                    </span>
                    <ChevronRight size={16} className="text-gray-400" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* 底部说明 */}
        <div className="mx-4 mt-4 bg-white rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Star size={16} className="text-[#D32F2F]" />
            <span className="text-sm font-semibold text-gray-800">购买须知</span>
          </div>
          <div className="space-y-2 text-xs text-gray-500 leading-relaxed">
            <p>• 所有商品均为虚拟服务，购买后即时生效，不支持退款</p>
            <p>• 会员订阅到期后自动停止，不会自动续费扣款</p>
            <p>• 算力包永不过期，可随时使用</p>
            <p>• 共享账本定制版购买后，工作人员将在1-3个工作日内联系您完成配置</p>
            <p>• 如有疑问请联系客服：service@jiangyuchen.cn</p>
          </div>
        </div>
      </div>
    </div>
  );
}
