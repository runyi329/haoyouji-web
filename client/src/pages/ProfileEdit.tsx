import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, CreditCard, User, Phone, Building2, Briefcase, Mail, Save, Edit3, X } from "lucide-react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";

export default function ProfileEdit() {
  const [isEditing, setIsEditing] = useState(false);
  const [, navigate] = useLocation();

  // 表单数据
  const [formData, setFormData] = useState({
    username: "",
    nickname: "",
    email: "",
    phone: "",
    company: "",
    business: "",
  });

  // 使用tRPC获取用户信息（禁用缓存，每次进入页面都从数据库读取最新数据）
  const { data: user, isLoading, refetch } = trpc.auth.me.useQuery(undefined, { staleTime: 0, refetchOnMount: 'always' });

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
        username: (user as any).username || "",
        nickname: (user as any).name || "",
        email: (user as any).email || "",
        phone: (user as any).phone || "",
        company: (user as any).company || "",
        business: (user as any).business || "",
      });
    }
  }, [user]);

  // 进入编辑模式
  const handleEdit = () => {
    setIsEditing(true);
  };

  // 取消编辑
  const handleCancel = () => {
    if (user) {
      setFormData({
        username: (user as any).username || "",
        nickname: (user as any).name || "",
        email: (user as any).email || "",
        phone: (user as any).phone || "",
        company: (user as any).company || "",
        business: (user as any).business || "",
      });
    }
    setIsEditing(false);
  };

  // 保存修改
  const handleSave = async () => {
    try {
      await updateProfileMutation.mutateAsync({
        name: formData.nickname,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        company: formData.company || undefined,
        business: formData.business || undefined,
      });
    } catch (error) {
      console.error("保存失败:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#D32F2F] border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-500 text-sm">加载中...</span>
        </div>
      </div>
    );
  }

  const fields = [
    {
      key: "username",
      label: "用户名",
      icon: User,
      iconBg: "bg-blue-50",
      iconColor: "text-blue-500",
      editable: false,
      hint: "用户名不可修改",
      type: "text",
    },
    {
      key: "nickname",
      label: "姓名",
      icon: User,
      iconBg: "bg-[#FFF3E0]",
      iconColor: "text-[#FF9800]",
      editable: true,
      placeholder: "请输入真实姓名",
      type: "text",
    },
    {
      key: "phone",
      label: "手机",
      icon: Phone,
      iconBg: "bg-green-50",
      iconColor: "text-green-500",
      editable: true,
      placeholder: "请输入手机号码",
      type: "tel",
    },
    {
      key: "company",
      label: "公司",
      icon: Building2,
      iconBg: "bg-purple-50",
      iconColor: "text-purple-500",
      editable: true,
      placeholder: "请输入公司名称",
      type: "text",
    },
    {
      key: "business",
      label: "主营业务",
      icon: Briefcase,
      iconBg: "bg-indigo-50",
      iconColor: "text-indigo-500",
      editable: true,
      placeholder: "请输入主营业务",
      type: "text",
    },
    {
      key: "email",
      label: "邮箱",
      icon: Mail,
      iconBg: "bg-red-50",
      iconColor: "text-red-400",
      editable: true,
      placeholder: "请输入邮箱地址",
      type: "email",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* 顶部导航栏 */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-50 shadow-sm">
        <div className="max-w-lg mx-auto px-4 py-3.5 flex items-center">
          <button
            onClick={() => navigate("/profile")}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-base font-semibold text-gray-900 flex-1 text-center">基本信息</h1>
          {isEditing ? (
            <button
              onClick={handleCancel}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          ) : (
            <button
              onClick={handleEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FFF3E0] text-[#D32F2F] text-sm font-medium hover:bg-[#FFE0B2] transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
              编辑
            </button>
          )}
        </div>
      </div>

      {/* 用户头像区域 */}
      <div className="bg-white mx-4 mt-4 rounded-2xl p-5 shadow-sm flex items-center gap-4">
        <div className="relative">
          {(user as any)?.avatar ? (
            <img
              src={(user as any).avatar}
              alt="头像"
              className="w-16 h-16 rounded-full object-cover"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#D32F2F] to-[#FF5722] flex items-center justify-center">
              <span className="text-white text-xl font-bold">
                {(formData.nickname || formData.username || "?").charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>
        <div>
          <div className="text-base font-semibold text-gray-900">
            {formData.nickname || formData.username || "未设置姓名"}
          </div>
          <div className="text-sm text-gray-400 mt-0.5">
            {formData.company || "未填写公司"}
          </div>
          {formData.business && (
            <div className="text-xs text-gray-400 mt-0.5">{formData.business}</div>
          )}
        </div>
      </div>

      {/* 信息字段列表 */}
      <div className="bg-white mx-4 mt-3 rounded-2xl shadow-sm overflow-hidden">
        {fields.map((field, index) => {
          const Icon = field.icon;
          const value = formData[field.key as keyof typeof formData];
          return (
            <div key={field.key}>
              {index > 0 && <div className="mx-4 h-px bg-gray-50" />}
              <div className="px-4 py-3.5 flex items-center gap-3">
                {/* 图标 */}
                <div className={`w-9 h-9 rounded-xl ${field.iconBg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-4.5 h-4.5 ${field.iconColor}`} style={{ width: '18px', height: '18px' }} />
                </div>

                {/* 标签 + 输入 */}
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-400 mb-0.5">{field.label}</div>
                  {isEditing && field.editable ? (
                    <input
                      type={field.type}
                      value={value}
                      onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                      className="w-full text-sm text-gray-900 bg-transparent border-none outline-none placeholder-gray-300 py-0"
                      placeholder={field.placeholder}
                    />
                  ) : (
                    <div className={`text-sm ${value ? "text-gray-900" : "text-gray-300"}`}>
                      {value || (field.editable ? (field.placeholder || "未设置") : "未设置")}
                    </div>
                  )}
                </div>

                {/* 不可编辑提示 */}
                {!field.editable && (
                  <span className="text-xs text-gray-300 flex-shrink-0">不可修改</span>
                )}
              </div>
              {/* 底部提示 */}
              {field.key === "email" && !value && !isEditing && (
                <div className="px-4 pb-2 -mt-1">
                  <span className="text-xs text-[#D32F2F]">建议填写邮箱，用于接收账本备份</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 收款账户入口 */}
      <div className="bg-white mx-4 mt-3 rounded-2xl shadow-sm overflow-hidden">
        <button
          onClick={() => navigate("/payment-accounts")}
          className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors"
        >
          <div className="w-9 h-9 rounded-xl bg-[#FFF3E0] flex items-center justify-center flex-shrink-0">
            <CreditCard className="w-4.5 h-4.5 text-[#FF9800]" style={{ width: '18px', height: '18px' }} />
          </div>
          <div className="flex-1 text-left">
            <div className="text-xs text-gray-400 mb-0.5">账户</div>
            <div className="text-sm text-gray-900">收款账户</div>
          </div>
          <ArrowLeft className="w-4 h-4 text-gray-300 transform rotate-180 flex-shrink-0" />
        </button>
      </div>

      {/* 保存按钮（编辑模式下显示） */}
      {isEditing && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-4 shadow-lg">
          <button
            onClick={handleSave}
            disabled={updateProfileMutation.isPending}
            className="w-full bg-[#D32F2F] text-white py-3.5 rounded-2xl font-medium text-base hover:bg-[#B71C1C] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {updateProfileMutation.isPending ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                保存修改
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
