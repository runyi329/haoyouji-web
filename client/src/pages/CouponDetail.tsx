import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { trpc } from '../trpc';
import { ChevronLeft, Calendar, User, CheckCircle } from 'lucide-react';

export default function CouponDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [useNotes, setUseNotes] = useState('');

  // 获取卡券详情
  const { data: coupon, isLoading, refetch } = trpc.coupon.getDetail.useQuery(
    { couponId: id! },
    { enabled: !!id }
  );

  // 获取核销记录（仅创建者可见）
  const { data: usageRecords } = trpc.coupon.getUsageRecords.useQuery(
    { couponId: id! },
    { enabled: !!id && coupon?.isCreator }
  );

  // 使用卡券mutation
  const useMutation = trpc.coupon.use.useMutation({
    onSuccess: () => {
      alert('卡券使用成功！');
      refetch();
    },
    onError: (error) => {
      alert(`使用失败: ${error.message}`);
    },
  });

  // 格式化日期时间
  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  // 格式化日期
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  // 检查卡券是否过期
  const isExpired = () => {
    return coupon && new Date(coupon.validUntil) < new Date();
  };

  // 使用卡券
  const handleUse = () => {
    if (!coupon?.recipientRecord) return;

    if (confirm('确认使用此卡券吗？使用后将无法撤销。')) {
      useMutation.mutate({
        recipientRecordId: coupon.recipientRecord.id,
        notes: useNotes || undefined,
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  if (!coupon) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">卡券不存在</div>
      </div>
    );
  }

  const canUse =
    !coupon.isCreator &&
    coupon.recipientRecord &&
    coupon.recipientRecord.status === 'unused' &&
    !isExpired();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航栏 */}
      <div className="bg-[#D32F2F] text-white p-4 flex items-center">
        <button onClick={() => navigate(-1)} className="mr-3">
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-xl font-semibold">卡券详情</h1>
      </div>

      <div className="p-4 space-y-4">
        {/* 卡券信息卡片 */}
        <div className="bg-white rounded-lg p-6 shadow-sm">
          {/* 状态标签 */}
          {!coupon.isCreator && coupon.recipientRecord && (
            <div className="mb-4">
              <span
                className={`inline-block text-xs px-3 py-1 rounded-full ${
                  coupon.recipientRecord.status === 'used'
                    ? 'bg-gray-200 text-gray-600'
                    : isExpired()
                    ? 'bg-red-100 text-red-600'
                    : 'bg-green-100 text-green-600'
                }`}
              >
                {coupon.recipientRecord.status === 'used'
                  ? '已使用'
                  : isExpired()
                  ? '已过期'
                  : '未使用'}
              </span>
            </div>
          )}

          {/* 卡券标题 */}
          <h2 className="text-2xl font-bold text-gray-800 mb-4">
            {coupon.title}
          </h2>

          {/* 卡券描述 */}
          {coupon.description && (
            <p className="text-gray-600 mb-6 whitespace-pre-wrap">
              {coupon.description}
            </p>
          )}

          {/* 卡券信息 */}
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center gap-3 text-sm">
              <User size={18} className="text-gray-400" />
              <span className="text-gray-600">
                {coupon.isCreator ? '您创建的卡券' : `来自: ${coupon.creator?.username || '未知'}`}
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Calendar size={18} className="text-gray-400" />
              <span className="text-gray-600">
                有效期: {formatDate(coupon.validFrom)} 至 {formatDate(coupon.validUntil)}
              </span>
            </div>
          </div>
        </div>

        {/* 使用卡券区域（仅接收者且未使用可见） */}
        {canUse && (
          <div className="bg-white rounded-lg p-4 space-y-3">
            <label className="block text-sm font-medium text-gray-700">
              使用备注（可选）
            </label>
            <textarea
              value={useNotes}
              onChange={(e) => setUseNotes(e.target.value)}
              placeholder="记录使用场景或备注信息"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D32F2F] resize-none"
              rows={3}
            />
            <button
              onClick={handleUse}
              disabled={useMutation.isPending}
              className="w-full bg-[#D32F2F] text-white py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {useMutation.isPending ? '使用中...' : '使用卡券'}
            </button>
          </div>
        )}

        {/* 核销记录（仅创建者可见） */}
        {coupon.isCreator && usageRecords && (
          <div className="bg-white rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <CheckCircle size={20} />
              核销记录
            </h3>
            {usageRecords.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                暂无核销记录
              </p>
            ) : (
              <div className="space-y-3">
                {usageRecords.map((record: any) => (
                  <div
                    key={record.id}
                    className="border border-gray-200 rounded-lg p-3"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-full bg-[#D32F2F] text-white flex items-center justify-center text-sm font-semibold">
                        {record.username?.[0] || '?'}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-gray-800">
                          {record.username || '未知用户'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatDateTime(record.usedAt)}
                        </p>
                      </div>
                    </div>
                    {record.notes && (
                      <p className="text-sm text-gray-600 mt-2 pl-11">
                        备注: {record.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
