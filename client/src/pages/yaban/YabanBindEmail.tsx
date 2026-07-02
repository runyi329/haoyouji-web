import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, Mail, Check, AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// P317 牙伴端·邮箱绑定（统一牙伴蓝白风格，复用脉动网用户邮箱字段）
export default function YabanBindEmail() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: me } = trpc.auth.me.useQuery();

  const [email, setEmail] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (me && !loaded) {
      setEmail(((me as any).email as string) || "");
      setLoaded(true);
    }
  }, [me, loaded]);

  const backTo = sessionStorage.getItem("yaban_back") || "/yaban/settings/data";
  const goBack = () => {
    sessionStorage.removeItem("yaban_back");
    navigate(backTo);
  };

  const save = trpc.auth.updateProfile.useMutation({
    onSuccess: async () => {
      toast.success("邮箱已绑定");
      await utils.auth.me.invalidate();
      goBack();
    },
    onError: (e) => toast.error(e.message || "保存失败"),
  });

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleSave = () => {
    if (!emailValid) {
      toast.error("请输入正确的邮箱地址");
      return;
    }
    save.mutate({
      name: ((me as any)?.name as string) || undefined,
      email: email.trim(),
    });
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      {/* 头部：牙伴蓝渐变 */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white">
        <div className="flex items-center gap-2 px-4 py-3">
          <button onClick={goBack} aria-label="返回">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-base font-semibold">绑定邮箱</h1>
        </div>
      </div>

      <div className="px-4 py-5 space-y-4">
        {/* 说明卡 */}
        <div className="bg-white rounded p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-8 h-8 rounded-md bg-[#E8F4FB] flex items-center justify-center">
              <Mail className="w-4.5 h-4.5 text-[#1E88D6]" />
            </div>
            <span className="text-sm font-medium text-gray-800">接收备份的邮箱</span>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            该邮箱用于接收医院资料的导出与定时备份。此邮箱与您的账号绑定，修改后将同步到个人中心。
          </p>
        </div>

        {/* 输入卡 */}
        <div className="bg-white rounded p-4 shadow-sm">
          <label className="block text-xs text-gray-400 mb-1.5">邮箱地址</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="请输入邮箱地址"
            className="w-full px-3.5 py-2.5 rounded-md border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-[#1E88D6] focus:ring-1 focus:ring-[#1E88D6]"
          />
          {email.trim() && !emailValid && (
            <p className="text-xs text-amber-500 mt-2 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> 邮箱格式不正确
            </p>
          )}
        </div>

        {/* 保存 */}
        <button
          onClick={handleSave}
          disabled={save.isPending}
          className="w-full bg-[#1E88D6] text-white py-3 rounded font-medium text-sm active:opacity-80 disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {save.isPending ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-md animate-spin" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          保存并返回
        </button>
      </div>
    </div>
  );
}
