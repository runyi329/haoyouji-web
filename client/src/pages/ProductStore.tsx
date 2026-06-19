import { useState } from 'react';
import { useLocation } from 'wouter';
import { ChevronLeft, ChevronRight, Users, BookOpen, Cpu, Zap, Star } from 'lucide-react';

// ============================================================
// 商品数据
// ============================================================

const CATEGORIES = [
  {
    id: 'compute',
    name: '算力中心',
    icon: Cpu,
    color: '#0D47A1',
    bgGradient: 'from-[#0D47A1] to-[#1565C0]',
    image: 'https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/product-compute-pack-WtVSRTePjVQ8okgiDZTLxC.webp',
    desc: 'AI算力驱动智能分析，永不过期，随买随用',
    products: [
      { id: 'compute-99', name: '体验算力包（100点）', price: 9.9, unit: '一次性', tag: '入门体验', tagColor: '#0277BD' },
      { id: 'compute-500', name: '基础算力包（500点）', price: 39, unit: '一次性', tag: '省¥10.5', tagColor: '#FF6B35' },
      { id: 'compute-2000', name: '标准算力包（2000点）', price: 128, unit: '一次性', tag: '最划算', tagColor: '#D32F2F' },
      { id: 'compute-10000', name: '企业算力包（10000点）', price: 499, unit: '一次性', tag: '企业首选', tagColor: '#4A148C' },
    ],
  },
  {
    id: 'contacts',
    name: '人脉管理软件',
    icon: Users,
    color: '#1A237E',
    bgGradient: 'from-[#1A237E] to-[#283593]',
    image: 'https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/product-contacts-crm-GyKiajFycpxw8PBo8pfRUS.webp',
    desc: '专业人脉CRM系统，系统化管理每一段关系',
    products: [
      { id: 'contacts-yearly', name: '人脉管理年度版', price: 198, unit: '/年', tag: '最受欢迎', tagColor: '#D32F2F' },
      { id: 'contacts-lifetime', name: '人脉管理终身版', price: 498, unit: '一次性', tag: '最划算', tagColor: '#7B1FA2' },
    ],
  },
  {
    id: 'ledger',
    name: '定制账本',
    icon: BookOpen,
    color: '#1B5E20',
    bgGradient: 'from-[#1B5E20] to-[#2E7D32]',
    image: 'https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/product-ledger-custom-RA4QS7aUex96Wu6jMDhoST.webp',
    desc: '量身定制专属账本，3-7天交付，满足各类记账需求',
    products: [
      { id: 'ledger-basic', name: '定制账本基础版', price: 299, unit: '一次性', tag: '入门首选', tagColor: '#2E7D32' },
      { id: 'ledger-standard', name: '定制账本标准版', price: 799, unit: '一次性', tag: '团队推荐', tagColor: '#1565C0' },
    ],
  },
  {
    id: 'homepage',
    name: '主页定制',
    icon: Zap,
    color: '#B71C1C',
    bgGradient: 'from-[#B71C1C] to-[#D32F2F]',
    image: 'https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/product-homepage-custom-6zUitHprMjFVkZZFYrSuQD.webp',
    desc: 'AI全程参与，快速交付专属商家主页，含商城/预约/会员',
    products: [
      { id: 'homepage-basic', name: '商家主页基础版', price: 1299, unit: '一次性', tag: '快速交付', tagColor: '#2E7D32' },
      { id: 'enterprise-full', name: '企业数字化全套', price: 39999, unit: '一次性', tag: '旗舰定制', tagColor: '#B8860B' },
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
