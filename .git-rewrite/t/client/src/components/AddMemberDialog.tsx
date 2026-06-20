import { useState } from 'react';
import { X, Search, Check, UserPlus } from 'lucide-react';
import { trpc } from '../lib/trpc';

interface AddMemberDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  partnershipId: number;
}

export default function AddMemberDialog({ isOpen, onClose, onSuccess, partnershipId }: AddMemberDialogProps) {
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedWorkGroups, setSelectedWorkGroups] = useState<number[]>([]);

  // 获取工作群列表
  const { data: workGroups = [] } = trpc.partnership.getWorkGroups.useQuery(
    { partnershipId },
    { enabled: isOpen }
  );

  // 直接复用 sharing.searchUsers API（和账本邀请一样的接口）
  const { data: searchResults } = trpc.sharing.searchUsers.useQuery(
    { query: searchKeyword },
    { enabled: searchKeyword.length > 0 }
  );

  // 添加成员mutation
  const addMemberMutation = trpc.partnership.addMember.useMutation({
    onSuccess: () => {
      alert('添加成员成功！');
      onSuccess();
      handleClose();
    },
    onError: (error) => {
      alert(`添加失败：${error.message}`);
    },
  });

  if (!isOpen) return null;

  // 切换工作群选择
  const toggleWorkGroup = (groupId: number) => {
    if (selectedWorkGroups.includes(groupId)) {
      setSelectedWorkGroups(selectedWorkGroups.filter(id => id !== groupId));
    } else {
      setSelectedWorkGroups([...selectedWorkGroups, groupId]);
    }
  };

  // 确认添加
  const handleConfirm = () => {
    if (!selectedUserId) {
      alert('请选择要添加的用户');
      return;
    }
    if (selectedWorkGroups.length === 0) {
      alert('请至少选择一个工作群');
      return;
    }

    addMemberMutation.mutate({
      partnershipId,
      userId: selectedUserId,
      workGroupIds: selectedWorkGroups,
    });
  };

  // 关闭并重置状态
  const handleClose = () => {
    setSearchKeyword('');
    setSelectedUserId(null);
    setSelectedWorkGroups([]);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-[#222222]">添加企业成员</h2>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-[#757575]" />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* 搜索用户 - 和账本邀请一样的搜索框 */}
          <div>
            <label className="block text-sm font-semibold text-[#222222] mb-2">搜索用户</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="搜索用户名"
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#D32F2F]"
              />
            </div>
          </div>

          {/* 搜索结果 - 和账本邀请一样的显示逻辑 */}
          {searchKeyword && (
            <div>
              <label className="block text-sm font-semibold text-[#222222] mb-2">选择用户</label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {searchResults && searchResults.length > 0 ? (
                  searchResults.map((user: any) => (
                    <div
                      key={user.id}
                      onClick={() => setSelectedUserId(user.id)}
                      className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        selectedUserId === user.id
                          ? 'border-[#D32F2F] bg-[#FFEBEE]'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-[#D32F2F] flex items-center justify-center text-white font-bold">
                        {(user.username || user.name || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-[#222222]">{user.username}</div>
                        {user.name && (
                          <div className="text-xs text-[#757575]">{user.name}</div>
                        )}
                      </div>
                      {selectedUserId === user.id && (
                        <Check className="w-5 h-5 text-[#D32F2F]" />
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 text-[#757575]">未找到用户</div>
                )}
              </div>
            </div>
          )}

          {/* 选择工作群 */}
          <div>
            <label className="block text-sm font-semibold text-[#222222] mb-2">选择工作群（可多选）</label>
            <div className="space-y-2">
              {workGroups.length === 0 ? (
                <div className="text-center py-4 text-[#757575]">暂无工作群</div>
              ) : (
                workGroups.map((group) => (
                  <div
                    key={group.id}
                    onClick={() => toggleWorkGroup(group.id)}
                    className={`flex items-center justify-between p-3 rounded-lg border-2 cursor-pointer transition-all ${
                      selectedWorkGroups.includes(group.id)
                        ? 'border-[#D32F2F] bg-[#FFEBEE]'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className="font-semibold text-[#222222]">{group.name}</span>
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                      selectedWorkGroups.includes(group.id)
                        ? 'border-[#D32F2F] bg-[#D32F2F]'
                        : 'border-gray-300'
                    }`}>
                      {selectedWorkGroups.includes(group.id) && (
                        <Check className="w-4 h-4 text-white" />
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="p-4 border-t border-gray-200 flex gap-3">
          <button
            onClick={handleClose}
            disabled={addMemberMutation.isPending}
            className="flex-1 px-4 py-2 border-2 border-gray-300 text-[#757575] rounded-lg hover:bg-gray-50 transition-colors font-semibold disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={addMemberMutation.isPending}
            className="flex-1 px-4 py-2 bg-[#D32F2F] text-white rounded-lg hover:bg-[#C62828] transition-colors font-semibold disabled:opacity-50"
          >
            {addMemberMutation.isPending ? '添加中...' : '确认添加'}
          </button>
        </div>
      </div>
    </div>
  );
}
