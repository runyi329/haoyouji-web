import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/_core/hooks/useAuth';
import { getLoginUrl } from '@/const';
import { trpc } from '@/lib/trpc';
import { Ticket, Plus, ChevronLeft, ChevronRight, Users, BookOpen, Cpu, Check, Shield, Clock, Headphones, Zap, X } from 'lucide-react';

// ============================================================
// 商品数据
// ============================================================
const CATEGORIES = [
  {
    id: 'contacts',
    name: '人脉管理软件',
    icon: Users,
    image: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-contacts-4fLDcpWoC7ZCAT35ypvu8N.webp',
    desc: '专业人脉关系管理，让每一段关系都产生价值',
    products: [
      { id: 'contacts-monthly', name: '月度会员', price: 28, unit: '/月', tag: '', tagColor: '' },
      { id: 'contacts-quarterly', name: '季度会员', price: 68, unit: '/季', tag: '省¥16', tagColor: '#FF6B35' },
      { id: 'contacts-yearly', name: '年度会员', price: 198, unit: '/年', tag: '最受欢迎', tagColor: '#D32F2F' },
      { id: 'contacts-lifetime', name: '终身会员', price: 498, unit: '一次', tag: '最划算', tagColor: '#7B1FA2' },
    ],
  },
  {
    id: 'ledger',
    name: '共享账本定制',
    icon: BookOpen,
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

const fmt = (price: number) => price % 1 === 0 ? price.toString() : price.toFixed(1);

// ============================================================
// 支付弹窗
// ============================================================
function PaymentModal({ product, onClose }: { product: any; onClose: () => void }) {
  const [selected, setSelected] = useState<'alipay' | 'wechat'>('alipay');
  const [confirming, setConfirming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { isAuthenticated } = useAuth();

  const handlePay = async () => {
    if (selected === 'wechat') {
      alert('微信支付暂未开通，请使用支付宝支付');
      return;
    }
    if (!isAuthenticated) {
      window.location.href = getLoginUrl() + '?returnUrl=' + encodeURIComponent(window.location.pathname);
      return;
    }
    setConfirming(true);
    setErrorMsg(null);
    try {
      const token = localStorage.getItem('auth-token');
      const res = await fetch('/api/alipay/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          productId: product.id,
          productName: product.name,
          amount: product.price,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '创建订单失败');
      }
      window.location.href = data.payUrl;
    } catch (err: any) {
      setConfirming(false);
      setErrorMsg(err?.message || '支付失败，请重试');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <div className="w-full bg-white rounded-t-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
          <div>
            <p className="text-sm text-gray-500">{product.name}</p>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-[#D32F2F]">¥{fmt(product.price)}</span>
              <span className="text-sm text-gray-400">{product.unit}</span>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100">
            <X size={16} className="text-gray-500" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm font-medium text-gray-700 mb-1">选择支付方式</p>
          <button onClick={() => setSelected('alipay')} className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition-colors ${selected === 'alipay' ? 'border-[#1677FF] bg-blue-50' : 'border-gray-200'}`}>
            <div className="w-9 h-9 bg-[#1677FF] rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm">支</span>
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-medium text-gray-900">支付宝</p>
              <p className="text-xs text-gray-400">推荐使用支付宝支付</p>
            </div>
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selected === 'alipay' ? 'border-[#1677FF] bg-[#1677FF]' : 'border-gray-300'}`}>
              {selected === 'alipay' && <Check size={12} className="text-white" />}
            </div>
          </button>
          <button onClick={() => setSelected('wechat')} className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition-colors ${selected === 'wechat' ? 'border-[#07C160] bg-green-50' : 'border-gray-200'}`}>
            <div className="w-9 h-9 bg-[#07C160] rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm">微</span>
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-medium text-gray-900">微信支付</p>
              <p className="text-xs text-gray-400">使用微信H5支付</p>
            </div>
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selected === 'wechat' ? 'border-[#07C160] bg-[#07C160]' : 'border-gray-300'}`}>
              {selected === 'wechat' && <Check size={12} className="text-white" />}
            </div>
          </button>
        </div>
        <div className="mx-5 mb-3 flex items-center gap-2 text-xs text-gray-400">
          <Shield size={12} /><span>支付安全由支付宝/微信保障，信息加密传输</span>
        </div>
        <div className="px-5 pb-8">
          <button onClick={handlePay} disabled={confirming} className="w-full py-4 bg-[#D32F2F] text-white font-semibold text-base rounded-xl disabled:opacity-60">
            {confirming ? '处理中...' : `确认支付 ¥${fmt(product.price)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 商品列表内嵌组件
// ============================================================
function ProductsTab() {
  const [, setLocation] = useLocation();
  const [payProduct, setPayProduct] = useState<any>(null);

  return (
    <div className="pb-6">
      {CATEGORIES.map((cat) => (
        <div key={cat.id} className="mb-4">
          {/* 类别 Banner */}
          <div className="relative h-28 overflow-hidden">
            <img src={cat.image} alt={cat.name} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 to-black/20 flex items-center px-4">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <cat.icon size={15} className="text-white" />
                  <span className="text-white font-bold text-base">{cat.name}</span>
                </div>
                <p className="text-white/75 text-xs max-w-[200px]">{cat.desc}</p>
              </div>
            </div>
          </div>

          {/* 商品卡片 */}
          <div className="px-3 pt-2 space-y-2">
            {cat.products.map((product) => (
              <div key={product.id} className="bg-white rounded-xl p-3.5 flex items-center shadow-sm">
                {/* 左侧信息 */}
                <div className="flex-1 min-w-0" onClick={() => setLocation(`/products/${product.id}`)}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-semibold text-gray-900 text-sm">{product.name}</span>
                    {product.tag && (
                      <span className="text-xs font-medium px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: product.tagColor }}>
                        {product.tag}
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-bold text-[#D32F2F]">¥{fmt(product.price)}</span>
                    <span className="text-xs text-gray-400">{product.unit}</span>
                  </div>
                </div>

                {/* 右侧按钮 */}
                <button
                  onClick={() => setPayProduct(product)}
                  className="ml-3 bg-[#D32F2F] text-white text-sm font-medium px-4 py-2 rounded-full flex-shrink-0"
                >
                  购买
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* 购买须知 */}
      <div className="mx-3 bg-white rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-700 mb-2">购买须知</p>
        <div className="space-y-1.5 text-xs text-gray-500">
          <p>• 所有商品均为虚拟服务，购买后即时生效，不支持退款</p>
          <p>• 会员订阅到期后自动停止，不会自动续费扣款</p>
          <p>• 算力包永不过期，可随时使用</p>
          <p>• 共享账本定制版购买后，1-3个工作日内联系您完成配置</p>
          <p>• 如有疑问请联系客服：service@jiangyuchen.cn</p>
        </div>
      </div>

      {/* 支付弹窗 */}
      {payProduct && <PaymentModal product={payProduct} onClose={() => setPayProduct(null)} />}
    </div>
  );
}

// ============================================================
// 主组件
// ============================================================
export default function MyCoupons() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<'received' | 'sent' | 'products'>('received');

  const { data: receivedCoupons, isLoading: receivedLoading } = trpc.coupon.getReceived.useQuery(
    undefined,
    { enabled: activeTab === 'received' }
  );
  const { data: sentCoupons, isLoading: sentLoading } = trpc.coupon.getSent.useQuery(
    undefined,
    { enabled: activeTab === 'sent' }
  );

  const isLoading = activeTab === 'received' ? receivedLoading : sentLoading;
  const coupons = activeTab === 'received' ? receivedCoupons : sentCoupons;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const isExpired = (validUntil: string) => new Date(validUntil) < new Date();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航栏 */}
      <div className="bg-[#D32F2F] text-white p-4 flex items-center">
        <button onClick={() => setLocation('/profile')} className="mr-3">
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Ticket size={24} />
          我的卡券
        </h1>
      </div>

      {/* Tab切换 */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="flex">
          {(['received', 'sent', 'products'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 text-center font-medium transition-colors ${
                activeTab === tab ? 'text-[#D32F2F] border-b-2 border-[#D32F2F]' : 'text-gray-500'
              }`}
            >
              {tab === 'received' ? '我收到的' : tab === 'sent' ? '我发出的' : '我的商品'}
            </button>
          ))}
        </div>
      </div>

      {/* 我的商品 - 直接内嵌 */}
      {activeTab === 'products' && <ProductsTab />}

      {/* 制作卡券按钮（仅在"我发出的"tab显示） */}
      {activeTab === 'sent' && (
        <div className="p-4">
          <button
            onClick={() => setLocation('/coupons/create')}
            className="w-full bg-[#D32F2F] text-white py-3 rounded-lg flex items-center justify-center gap-2 font-medium"
          >
            <Plus size={20} />
            制作卡券
          </button>
        </div>
      )}

      {/* 卡券列表 */}
      {activeTab !== 'products' && (
        <div className="p-4 space-y-3">
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">加载中...</div>
          ) : !coupons || coupons.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {activeTab === 'received' ? '暂无收到的卡券' : '暂无发出的卡券'}
            </div>
          ) : (
            coupons.map((coupon: any) => (
              <div
                key={coupon.id}
                onClick={() => setLocation(`/coupons/${coupon.id}`)}
                className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 cursor-pointer hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-lg font-semibold text-gray-800 flex-1">{coupon.title}</h3>
                  {activeTab === 'received' && (
                    <span className={`text-xs px-2 py-1 rounded ${
                      coupon.status === 'used' ? 'bg-gray-200 text-gray-600'
                      : isExpired(coupon.validUntil) ? 'bg-red-100 text-red-600'
                      : 'bg-green-100 text-green-600'
                    }`}>
                      {coupon.status === 'used' ? '已使用' : isExpired(coupon.validUntil) ? '已过期' : '未使用'}
                    </span>
                  )}
                </div>
                {coupon.description && (
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">{coupon.description}</p>
                )}
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <div>
                    {activeTab === 'received'
                      ? <span>来自: {coupon.creatorName || '未知'}</span>
                      : <span>发送: {coupon.totalRecipients || 0}人 | 已使用: {coupon.usedCount || 0}人</span>
                    }
                  </div>
                  <div>有效期至: {formatDate(coupon.validUntil)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 权限提示（仅在"我发出的"tab显示） */}
      {activeTab === 'sent' && (
        <div className="p-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
            <p className="font-medium mb-1">📌 发送规则</p>
            <p>您只能发送卡券给已共享人脉的用户</p>
          </div>
        </div>
      )}
    </div>
  );
}
