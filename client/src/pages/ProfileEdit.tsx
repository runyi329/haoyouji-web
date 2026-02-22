import { useState, useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";

export default function ProfileEdit() {
  const [isEditing, setIsEditing] = useState(false);
  
  // 表单数据
  const [formData, setFormData] = useState({
    username: "",
    nickname: "",
    email: "",
  });

  // 使用tRPC获取用户信息
  const { data: user, isLoading, refetch } = trpc.auth.me.useQuery();

  // 使用tRPC更新用户信息
  const updateProfileMutation = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("保存成功");
      setIsEditing(false);
      refetch();
    },
    onError: (error) => {
      console.error("保存失败:", error);
      toast.error("保存失败");
    },
  });

  // 当用户数据加载完成后，填充表单
  useEffect(() => {
    if (user) {
      setFormData({
        username: user.username || "",
        nickname: user.name || "",
        email: user.email || "",
      });
    }
  }, [user]);

  // 进入编辑模式
  const handleEdit = () => {
    setIsEditing(true);
  };

  // 取消编辑
  const handleCancel = () => {
    // 恢复原始数据
    if (user) {
      setFormData({
        username: user.username || "",
        nickname: user.name || "",
        email: user.email || "",
      });
    }
    setIsEditing(false);
  };

  // 保存修改
  const handleSave = async () => {
    try {
      await updateProfileMutation.mutateAsync({
        name: formData.nickname,
        email: formData.email,
      });
    } catch (error) {
      console.error("保存失败:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 顶部导航栏 */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center">
          <Link href="/profile">
            <a className="text-gray-600 hover:text-gray-900">
              <ArrowLeft className="w-6 h-6" />
            </a>
          </Link>
          <h1 className="text-lg font-bold text-gray-900 flex-1 text-center">基本信息</h1>
          <div className="w-6"></div>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="space-y-6">
            {/* 用户名 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                用户名
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={formData.username}
                  disabled
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
                />
              ) : (
                <div className="text-base text-gray-900">{formData.username || "未设置"}</div>
              )}
              {!isEditing && (
                <p className="text-xs text-gray-500 mt-1">用户名不可修改</p>
              )}
            </div>

            {/* 昵称 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                昵称
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={formData.nickname}
                  onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#D32F2F] focus:border-transparent"
                  placeholder="请输入昵称"
                />
              ) : (
                <div className="text-base text-gray-900">{formData.nickname || "未设置"}</div>
              )}
            </div>

            {/* 邮箱 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                邮箱
              </label>
              {isEditing ? (
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#D32F2F] focus:border-transparent"
                  placeholder="请输入邮箱"
                />
              ) : (
                <div className="text-base text-gray-900">{formData.email || "未设置"}</div>
              )}
              {!isEditing && !formData.email && (
                <p className="text-xs text-[#D32F2F] mt-1">建议填写邮箱，用于接收账本备份</p>
              )}
            </div>
          </div>

          {/* 按钮区域 */}
          <div className="mt-8">
            {isEditing ? (
              <div className="space-y-3">
                <button
                  onClick={handleSave}
                  disabled={updateProfileMutation.isPending}
                  className="w-full bg-[#D32F2F] text-white py-3 rounded-lg hover:bg-[#B71C1C] transition-colors disabled:bg-gray-400 font-medium"
                >
                  {updateProfileMutation.isPending ? "保存中..." : "保存"}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={updateProfileMutation.isPending}
                  className="w-full bg-white text-gray-700 py-3 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors disabled:bg-gray-100 font-medium"
                >
                  取消
                </button>
              </div>
            ) : (
              <button
                onClick={handleEdit}
                className="w-full bg-[#D32F2F] text-white py-3 rounded-lg hover:bg-[#B71C1C] transition-colors font-medium"
              >
                编辑
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
