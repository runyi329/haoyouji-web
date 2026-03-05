import { useState } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Ticket, Plus, ChevronLeft } from 'lucide-react';

export default function MyCoupons() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<'received' | 'sent' | 'products'>('received');

  // 获取收到的卡券
  const { data: receivedCoupons, isLoading: receivedLoading } = trpc.coupon.getReceived.useQuery(
    undefined,
    { enabled: activeTab === 'received' }
  );

  // 获取发出的卡券
  const { data: sentCoupons, isLoading: sentLoading } = trpc.coupon.getSent.useQuery(
    undefined,
    { enabled: activeTab === 'sent' }
  );

  const isLoading = activeTab === 'received' ? receivedLoading : sentLoading;
  const coupons = activeTab === 'received' ? receivedCoupons : sentCoupons;

  // 格式化日期
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  // 检查卡券是否过期
  const isExpired = (validUntil: string) => {
    return new Date(validUntil) < new Date();
  };

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
      <div className="bg-white border-b">
        <div className="flex">
          <button
            onClick={() => setActiveTab('received')}
            className={`flex-1 py-3 text-center font-medium transition-colors ${
              activeTab === 'received'
                ? 'text-[#D32F2F] border-b-2 border-[#D32F2F]'
                : 'text-gray-500'
            }`}
          >
            我收到的
          </button>
          <button
            onClick={() => setActiveTab('sent')}
            className={`flex-1 py-3 text-center font-medium transition-colors ${
              activeTab === 'sent'
                ? 'text-[#D32F2F] border-b-2 border-[#D32F2F]'
                : 'text-gray-500'
            }`}
          >
            我发出的
          </button>
          <button
            onClick={() => setActiveTab('products')}
            className={`flex-1 py-3 text-center font-medium transition-colors ${
              activeTab === 'products'
                ? 'text-[#D32F2F] border-b-2 border-[#D32F2F]'
                : 'text-gray-500'
            }`}
          >
            我的商品
          </button>
        </div>
      </div>

      {/* 我的商品内容 */}
      {activeTab === 'products' && (
        <div className="p-4">
          <button
            onClick={() => setLocation('/products')}
            className="w-full bg-[#D32F2F] text-white py-3 rounded-lg flex items-center justify-center gap-2 font-medium"
          >
            <Plus size={20} />
            查看会员产品
          </button>
        </div>
      )}

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
              {/* 卡券标题 */}
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-lg font-semibold text-gray-800 flex-1">
                  {coupon.title}
                </h3>
                {activeTab === 'received' && (
                  <span
                    className={`text-xs px-2 py-1 rounded ${
                      coupon.status === 'used'
                        ? 'bg-gray-200 text-gray-600'
                        : isExpired(coupon.validUntil)
                        ? 'bg-red-100 text-red-600'
                        : 'bg-green-100 text-green-600'
                    }`}
                  >
                    {coupon.status === 'used'
                      ? '已使用'
                      : isExpired(coupon.validUntil)
                      ? '已过期'
                      : '未使用'}
                  </span>
                )}
              </div>

              {/* 卡券描述 */}
              {coupon.description && (
                <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                  {coupon.description}
                </p>
              )}

              {/* 卡券信息 */}
              <div className="flex items-center justify-between text-xs text-gray-500">
                <div>
                  {activeTab === 'received' ? (
                    <span>来自: {coupon.creatorName || '未知'}</span>
                  ) : (
                    <span>
                      发送: {coupon.totalRecipients || 0}人 | 已使用:{' '}
                      {coupon.usedCount || 0}人
                    </span>
                  )}
                </div>
                <div>
                  有效期至: {formatDate(coupon.validUntil)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

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
