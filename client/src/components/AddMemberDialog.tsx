import { useState } from 'react';
import { X, Search, Check } from 'lucide-react';

interface AddMemberDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (userId: number, workGroupIds: number[]) => void;
}

// 模拟用户数据
const mockUsers = [
  { id: 1, name: "测试用户1", username: "test1", email: "test1@example.com", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=test1" },
  { id: 2, name: "测试用户2", username: "test2", email: "test2@example.com", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=test2" },
  { id: 3, name: "测试用户3", username: "test3", email: "test3@example.com", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=test3" },
  { id: 4, name: "测试用户4", username: "test4", email: "test4@example.com", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=test4" },
  { id: 5, name: "测试用户5", username: "test5", email: "test5@example.com", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=test5" },
];

// 工作群选项
const workGroupOptions = [
  { id: 1, name: "工作群1" },
  { id: 2, name: "工作群2" },
  { id: 3, name: "工作群3" },
];

export default function AddMemberDialog({ isOpen, onClose, onAdd }: AddMemberDialogProps) {
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedWorkGroups, setSelectedWorkGroups] = useState<number[]>([]);
  const [searchResults, setSearchResults] = useState(mockUsers);

  if (!isOpen) return null;

  // 搜索用户
  const handleSearch = () => {
    if (!searchKeyword.trim()) {
      setSearchResults(mockUsers);
      return;
    }

    const keyword = searchKeyword.toLowerCase();
    const results = mockUsers.filter(user =>
      user.name.toLowerCase().includes(keyword) ||
      user.username.toLowerCase().includes(keyword) ||
      user.email.toLowerCase().includes(keyword)
    );
    setSearchResults(results);
  };

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

    onAdd(selectedUserId, selectedWorkGroups);
    
    // 重置状态
    setSearchKeyword('');
    setSelectedUserId(null);
    setSelectedWorkGroups([]);
    setSearchResults(mockUsers);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-[#222222]">添加企业成员</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-[#757575]" />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* 搜索用户 */}
          <div>
            <label className="block text-sm font-semibold text-[#222222] mb-2">搜索用户</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="输入用户名、邮箱搜索..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#D32F2F]"
              />
              <button
                onClick={handleSearch}
                className="px-4 py-2 bg-[#D32F2F] text-white rounded-lg hover:bg-[#C62828] transition-colors flex items-center gap-1"
              >
                <Search className="w-4 h-4" />
                搜索
              </button>
            </div>
          </div>

          {/* 搜索结果 */}
          <div>
            <label className="block text-sm font-semibold text-[#222222] mb-2">选择用户</label>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {searchResults.length === 0 ? (
                <div className="text-center py-8 text-[#757575]">未找到匹配的用户</div>
              ) : (
                searchResults.map((user) => (
                  <div
                    key={user.id}
                    onClick={() => setSelectedUserId(user.id)}
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                      selectedUserId === user.id
                        ? 'border-[#D32F2F] bg-[#FFEBEE]'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <img
                      src={user.avatar}
                      alt={user.name}
                      className="w-10 h-10 rounded-full"
                    />
                    <div className="flex-1">
                      <div className="font-semibold text-[#222222]">{user.name}</div>
                      <div className="text-xs text-[#757575]">{user.email}</div>
                    </div>
                    {selectedUserId === user.id && (
                      <Check className="w-5 h-5 text-[#D32F2F]" />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 选择工作群 */}
          <div>
            <label className="block text-sm font-semibold text-[#222222] mb-2">选择工作群（可多选）</label>
            <div className="space-y-2">
              {workGroupOptions.map((group) => (
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
              ))}
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="p-4 border-t border-gray-200 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border-2 border-gray-300 text-[#757575] rounded-lg hover:bg-gray-50 transition-colors font-semibold"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 px-4 py-2 bg-[#D32F2F] text-white rounded-lg hover:bg-[#C62828] transition-colors font-semibold"
          >
            确认添加
          </button>
        </div>
      </div>
    </div>
  );
}
