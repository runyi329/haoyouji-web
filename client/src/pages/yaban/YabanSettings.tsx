/**
 * 牙伴齿科管理 - 设置子页
 * 路由：/yaban/settings
 * 风格：蓝色系，沿用牙伴整体清爽蓝白风
 * 功能：账号资料编辑（昵称/手机号/头像）、权限管理入口、关于、退出登录
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  User,
  Camera,
  ShieldCheck,
  Info,
  LogOut,
  Loader2,
  Database,
  ReceiptText,
} from "lucide-react";
import { PageTag } from "@/components/PageTag";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

export default function YabanSettings() {
  const [, navigate] = useLocation();
  const { logout } = useAuth();
  const utils = trpc.useUtils();
  const { data: user } = trpc.auth.me.useQuery();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (user) {
      setName((user as any).name || (user as any).username || "");
      setPhone((user as any).phone || "");
    }
  }, [user]);

  const avatar = (user as any)?.avatar as string | undefined;

  const updateProfile = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("资料已保存");
      setEditing(false);
      utils.auth.me.invalidate();
    },
    onError: (e) => toast.error(e.message || "保存失败"),
  });

  const uploadAvatar = trpc.auth.uploadAvatar.useMutation({
    onSuccess: () => {
      toast.success("头像已更新");
      utils.auth.me.invalidate();
    },
    onError: (e) => toast.error(e.message || "头像上传失败"),
  });

  const onPickAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result || "");
      if (base64) uploadAvatar.mutate({ imageData: base64 });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const onSave = () => {
    if (!name.trim()) {
      toast.error("昵称不能为空");
      return;
    }
    updateProfile.mutate({ name: name.trim(), phone: phone.trim() });
  };

  const onLogout = async () => {
    if (!window.confirm("确认退出登录？")) return;
    try {
      await logout();
      navigate("/login");
    } catch {
      toast.error("退出失败，请重试");
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F4F8] pb-10">
      <PageTag code="P316" />

      {/* 头部 */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white">
        <div className="flex items-center gap-2 px-4 py-3">
          <button onClick={() => navigate("/yaban/profile")} aria-label="返回">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-base font-bold">设置</span>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-3">
        {/* 账号资料卡片 */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-bold text-gray-800">账号资料</span>
            {editing ? (
              <button
                onClick={onSave}
                disabled={updateProfile.isPending}
                className="text-xs font-medium text-white bg-[#1E88D6] rounded-full px-3 py-1 active:opacity-80 disabled:opacity-60 flex items-center gap-1"
              >
                {updateProfile.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                保存
              </button>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="text-xs font-medium text-[#1E88D6] active:opacity-70"
              >
                编辑
              </button>
            )}
          </div>

          {/* 头像 */}
          <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
            <label className="relative w-16 h-16 shrink-0 cursor-pointer">
              <span className="block w-16 h-16 rounded-full bg-[#EAF4FE] ring-1 ring-gray-100 overflow-hidden flex items-center justify-center">
                {avatar ? (
                  <img src={avatar} alt="头像" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-8 h-8 text-[#9CC8EC]" />
                )}
              </span>
              <span className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-[#1E88D6] flex items-center justify-center ring-2 ring-white shadow-md">
                {uploadAvatar.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                ) : (
                  <Camera className="w-3.5 h-3.5 text-white" strokeWidth={2.2} />
                )}
              </span>
              <input type="file" accept="image/*" className="hidden" onChange={onPickAvatar} />
            </label>
          </div>

          {/* 昵称 */}
          <div className="flex items-center justify-between py-3 border-b border-gray-100">
            <span className="text-sm text-gray-600 shrink-0 w-20">昵称</span>
            {editing ? (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={20}
                className="flex-1 text-sm text-right text-gray-800 bg-transparent outline-none"
                placeholder="请输入昵称"
              />
            ) : (
              <span className="text-sm text-gray-800">{name || "未设置"}</span>
            )}
          </div>

          {/* 手机号 */}
          <div className="flex items-center justify-between py-3">
            <span className="text-sm text-gray-600 shrink-0 w-20">手机号</span>
            {editing ? (
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={20}
                inputMode="tel"
                className="flex-1 text-sm text-right text-gray-800 bg-transparent outline-none"
                placeholder="请输入手机号"
              />
            ) : (
              <span className="text-sm text-gray-800">{phone || "未绑定"}</span>
            )}
          </div>
        </div>

        {/* 门诊与权限 */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <button
            onClick={() => navigate("/yaban/settings/roles")}
            className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-[#F0F7FD] transition-colors"
          >
            <span className="w-9 h-9 rounded-xl bg-[#EAF4FE] flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-[#1E88D6]" />
            </span>
            <span className="flex-1 text-left">
              <span className="block text-sm font-medium text-gray-800">权限管理</span>
              <span className="block text-xs text-gray-400 mt-0.5">为员工与顾客逐项设置权限</span>
            </span>
            <ChevronRight className="w-5 h-5 text-gray-300 shrink-0" />
          </button>
        </div>

        {/* 收费项目库 */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <button
            onClick={() => navigate("/yaban/settings/charge-products")}
            className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-[#F0F7FD] transition-colors"
          >
            <span className="w-9 h-9 rounded-xl bg-[#EAF4FE] flex items-center justify-center shrink-0">
              <ReceiptText className="w-5 h-5 text-[#1E88D6]" />
            </span>
            <span className="flex-1 text-left">
              <span className="block text-sm font-medium text-gray-800">收费项目库</span>
              <span className="block text-xs text-gray-400 mt-0.5">维护收费项目分类、单价与常用</span>
            </span>
            <ChevronRight className="w-5 h-5 text-gray-300 shrink-0" />
          </button>
        </div>

        {/* 数据管理 */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <button
            onClick={() => navigate("/yaban/settings/data")}
            className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-[#F0F7FD] transition-colors"
          >
            <span className="w-9 h-9 rounded-xl bg-[#EAF4FE] flex items-center justify-center shrink-0">
              <Database className="w-5 h-5 text-[#1E88D6]" />
            </span>
            <span className="flex-1 text-left">
              <span className="block text-sm font-medium text-gray-800">数据管理</span>
              <span className="block text-xs text-gray-400 mt-0.5">数据导出备份与导入存档</span>
            </span>
            <ChevronRight className="w-5 h-5 text-gray-300 shrink-0" />
          </button>
        </div>

        {/* 关于 */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <button
            onClick={() => toast.info("牙伴齿科管理系统")}
            className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-[#F0F7FD] transition-colors"
          >
            <span className="w-9 h-9 rounded-xl bg-[#EAF4FE] flex items-center justify-center shrink-0">
              <Info className="w-5 h-5 text-[#1E88D6]" />
            </span>
            <span className="flex-1 text-left text-sm font-medium text-gray-800">关于牙伴</span>
            <ChevronRight className="w-5 h-5 text-gray-300 shrink-0" />
          </button>
        </div>

        {/* 退出登录 */}
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 bg-white rounded-2xl shadow-sm py-3.5 text-sm font-medium text-[#E2553C] active:bg-red-50 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          退出登录
        </button>
      </div>
    </div>
  );
}
