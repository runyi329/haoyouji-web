import { useState } from "react";
import { useLocation } from "wouter";
import { Eye, EyeOff, Lock, User, ArrowLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function Login() {
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failCount, setFailCount] = useState(0);
  const [showCaptcha, setShowCaptcha] = useState(false);
  const [captchaInput, setCaptchaInput] = useState("");
  const [captchaCode] = useState(() => String(Math.floor(1000 + Math.random() * 9000)));

  const utils = trpc.useUtils();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (showCaptcha && captchaInput !== captchaCode) {
      toast.error("验证码错误，请重新输入");
      setCaptchaInput("");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/haoyouji-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        credentials: "include",
      });

      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(`欢迎回来，${data.user.name || data.user.username}`);
        await utils.auth.me.invalidate();
        setLocation("/");
      } else {
        const newFailCount = failCount + 1;
        setFailCount(newFailCount);

        if (data.locked) {
          toast.error("账号已被锁定，请联系管理员解锁");
        } else if (data.remaining !== undefined) {
          const remaining = data.remaining;
          if (remaining <= 0) {
            toast.error("账号已被锁定，请联系管理员解锁");
          } else {
            toast.error(`${data.error}，还剩 ${remaining} 次机会`);
          }
          if (newFailCount >= 3) {
            setShowCaptcha(true);
          }
        } else {
          toast.error(data.error || "登录失败");
        }
      }
    } catch {
      toast.error("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center px-4">
      {/* 返回按钮 */}
      <div className="w-full max-w-sm mb-4">
        <button
          onClick={() => setLocation("/")}
          className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          返回首页
        </button>
      </div>

      {/* 登录卡片 */}
      <div className="w-full max-w-sm bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-8 shadow-2xl">
        {/* 标题 */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-7 h-7 text-blue-400" />
          </div>
          <h1 className="text-xl font-bold text-white">奖金制度研究平台</h1>
          <p className="text-slate-400 text-sm mt-1">使用脉动网账号登录</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          {/* 用户名 */}
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">用户名</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="输入脉动网用户名"
                required
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:bg-white/8 transition-all text-sm"
              />
            </div>
          </div>

          {/* 密码 */}
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">密码</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="输入密码"
                required
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-10 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:bg-white/8 transition-all text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* 验证码（3次失败后显示） */}
          {showCaptcha && (
            <div>
              <label className="block text-sm text-slate-300 mb-1.5">验证码</label>
              <div className="flex gap-3 items-center">
                <input
                  type="text"
                  value={captchaInput}
                  onChange={e => setCaptchaInput(e.target.value)}
                  placeholder="输入验证码"
                  maxLength={4}
                  required
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 transition-all text-sm tracking-widest"
                />
                <div className="bg-slate-700 border border-white/10 rounded-lg px-4 py-2.5 font-mono text-lg font-bold text-yellow-400 tracking-widest select-none min-w-[80px] text-center">
                  {captchaCode}
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-1">连续输错3次需要验证码，输错10次账号将被锁定</p>
            </div>
          )}

          {/* 登录按钮 */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-all active:scale-[0.98] mt-2"
          >
            {loading ? "登录中..." : "登录"}
          </button>
        </form>

        {/* 提示 */}
        <p className="text-center text-slate-500 text-xs mt-6">
          没有账号？请先在
          <a
            href="https://jiangyuchen.cn"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 mx-1"
          >
            脉动网
          </a>
          注册
        </p>
      </div>
    </div>
  );
}
