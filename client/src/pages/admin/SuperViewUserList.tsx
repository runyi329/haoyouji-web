import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Search, User, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function SuperViewUserList() {
  const [, navigate] = useLocation();
  const [keyword, setKeyword] = useState("");
  const [switching, setSwitching] = useState<number | null>(null);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: users, isLoading } = trpc.admin.getUsers.useQuery();

  const filtered = (users || []).filter((u: any) => {
    if (!keyword) return true;
    const kw = keyword.toLowerCase();
    return (
      (u.name && u.name.toLowerCase().includes(kw)) ||
      (u.username && u.username.toLowerCase().includes(kw))
    );
  });

  const switchUserMutation = trpc.auth.quickLogin.useMutation({
    onSuccess: (data) => {
      try {
        if (data.sessionToken) {
          localStorage.setItem("auth-token", data.sessionToken);
        }
        localStorage.removeItem("manus-runtime-user-info");
      } catch {}
      queryClient.clear();
      // 跳转到首页
      window.location.href = "/";
    },
    onError: (error) => {
      setSwitching(null);
      toast.error(error.message || "切换失败");
    },
  });

  const handleSwitchUser = (targetUser: any) => {
    if (!user) return;
    setSwitching(targetUser.id);

    // 保存当前超管信息到 localStorage，供 SuperViewBanner 使用
    try {
      localStorage.setItem(
        "super_admin_original_user",
        JSON.stringify({ id: user.id, name: user.name, username: user.username })
      );
    } catch {}

    switchUserMutation.mutate({ targetUserId: targetUser.id });
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#F5F5F5]">
      {/* 顶部导航 */}
      <div className="bg-[#D32F2F] text-white px-4 pt-12 pb-4 flex items-center gap-3">
        <button onClick={() => navigate("/")} className="p-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="text-base font-bold">超级视角</div>
          <div className="text-xs text-red-200">选择用户，以其身份进入账户</div>
        </div>
      </div>

      {/* 搜索框 */}
      <div className="px-4 py-3 bg-white shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索用户名或姓名..."
            className="pl-9 bg-[#F5F5F5] border-0 rounded-full text-sm"
          />
        </div>
      </div>

      {/* 用户列表 */}
      <div className="flex-1 px-4 py-3 space-y-2">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-[#D32F2F] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <User className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">没有找到用户</p>
          </div>
        ) : (
          filtered.map((u: any) => (
            <div
              key={u.id}
              onClick={() => !switching && handleSwitchUser(u)}
              className="bg-white rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm cursor-pointer active:bg-gray-50"
              style={{ opacity: switching && switching !== u.id ? 0.5 : 1 }}
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#A80000] to-[#d44] flex items-center justify-center flex-shrink-0 overflow-hidden">
                {u.avatar ? (
                  <img src={u.avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-5 h-5 text-white" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-gray-900">{u.name || u.username}</div>
                <div className="text-xs text-gray-400">@{u.username} &nbsp;<span className="text-gray-300">|</span>&nbsp; ID: {u.id}</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  u.role === 'super_admin' ? 'bg-red-100 text-red-600' :
                  u.role === 'parent' ? 'bg-blue-50 text-blue-500' : 'bg-gray-100 text-gray-500'
                }`}>
                  {u.role === 'super_admin' ? '超管' : u.role === 'parent' ? '家长' : '宝宝'}
                </span>
                {switching === u.id ? (
                  <div className="w-4 h-4 border-2 border-[#D32F2F] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
