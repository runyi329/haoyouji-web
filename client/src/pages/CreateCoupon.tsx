import { useState } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { ChevronLeft, Users, Check } from 'lucide-react';

export default function CreateCoupon() {
  const [, setLocation] = useLocation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [sendToAll, setSendToAll] = useState(true);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  // 获取可发送的用户列表
  const { data: availableUsers } = trpc.coupon.getAvailableRecipients.useQuery();

  // 创建卡券mutation
  const createMutation = trpc.coupon.create.useMutation({
    onSuccess: () => {
      alert('卡券创建成功！');
      setLocation('/coupons');
    },
    onError: (error) => {
      alert(`创建失败: ${error.message}`);
    },
  });

  // 切换用户选择
  const toggleUser = (userId: string) => {
    setSelectedUsers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  // 提交表单
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      alert('请输入卡券标题');
      return;
    }

    if (!validFrom || !validUntil) {
      alert('请选择有效期');
      return;
    }

    if (new Date(validFrom) >= new Date(validUntil)) {
      alert('有效期结束时间必须晚于开始时间');
      return;
    }

    if (!sendToAll && selectedUsers.length === 0) {
      alert('请至少选择一个接收用户');
      return;
    }

    createMutation.mutate({
      title,
      description,
      validFrom,
      validUntil,
      recipientIds: sendToAll ? 'all' : selectedUsers,
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航栏 */}
      <div className="bg-[#D32F2F] text-white p-4 flex items-center">
        <button onClick={() => setLocation('/coupons')} className="mr-3">
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-xl font-semibold">制作卡券</h1>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        {/* 卡券标题 */}
        <div className="bg-white rounded-lg p-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            卡券标题 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：新年优惠券"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D32F2F]"
            maxLength={200}
          />
        </div>

        {/* 卡券描述 */}
        <div className="bg-white rounded-lg p-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            卡券描述
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="详细描述卡券的用途和使用规则"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D32F2F] resize-none"
            rows={4}
          />
        </div>

        {/* 有效期 */}
        <div className="bg-white rounded-lg p-4 space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            有效期 <span className="text-red-500">*</span>
          </label>
          <div>
            <label className="block text-xs text-gray-500 mb-1">开始时间</label>
            <input
              type="date"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D32F2F]"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">结束时间</label>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D32F2F]"
            />
          </div>
        </div>

        {/* 接收用户选择 */}
        <div className="bg-white rounded-lg p-4">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            发送给 <span className="text-red-500">*</span>
          </label>

          {/* 全部/部分切换 */}
          <div className="flex gap-3 mb-4">
            <button
              type="button"
              onClick={() => setSendToAll(true)}
              className={`flex-1 py-2 rounded-lg border transition-colors ${
                sendToAll
                  ? 'bg-[#D32F2F] text-white border-[#D32F2F]'
                  : 'bg-white text-gray-700 border-gray-300'
              }`}
            >
              全部用户
            </button>
            <button
              type="button"
              onClick={() => setSendToAll(false)}
              className={`flex-1 py-2 rounded-lg border transition-colors ${
                !sendToAll
                  ? 'bg-[#D32F2F] text-white border-[#D32F2F]'
                  : 'bg-white text-gray-700 border-gray-300'
              }`}
            >
              选择用户
            </button>
          </div>

          {/* 用户列表（仅在选择用户模式显示） */}
          {!sendToAll && (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {!availableUsers || availableUsers.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  暂无可发送的用户
                </p>
              ) : (
                availableUsers.map((user: any) => (
                  <div
                    key={user.userId}
                    onClick={() => toggleUser(user.userId)}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedUsers.includes(user.userId)
                        ? 'bg-red-50 border-[#D32F2F]'
                        : 'bg-white border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-[#D32F2F] text-white flex items-center justify-center font-semibold">
                      {user.username?.[0] || '?'}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-800">
                        {user.username || '未知用户'}
                      </p>
                    </div>
                    {selectedUsers.includes(user.userId) && (
                      <Check size={20} className="text-[#D32F2F]" />
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* 已选择数量提示 */}
          {!sendToAll && selectedUsers.length > 0 && (
            <p className="text-sm text-gray-600 mt-3">
              已选择 {selectedUsers.length} 人
            </p>
          )}
        </div>

        {/* 提示信息 */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
          <p className="font-medium mb-1">📌 发送规则</p>
          <p>• 您只能发送卡券给已共享人脉的用户</p>
          <p>• 接收者可以在"我收到的卡券"中查看和使用</p>
        </div>

        {/* 提交按钮 */}
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="w-full bg-[#D32F2F] text-white py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {createMutation.isPending ? '创建中...' : '创建并发送'}
        </button>
      </form>
    </div>
  );
}
