import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, User, Lock, Eye, EyeOff } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function Login() {
  const [, setLocation] = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  
  // 登录表单
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  
  // 注册表单
  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");
  const [regName, setRegName] = useState("");
  const [regInviteCode, setRegInviteCode] = useState("");
  
  // 从 URL 参数读取邀请码
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inviteCode = params.get('invite');
    if (inviteCode) {
      setRegInviteCode(inviteCode);
      setActiveTab("register");
    }
  }, []);
  
  // 长按计时器
  const [pressTimer, setPressTimer] = useState<NodeJS.Timeout | null>(null);

  const utils = trpc.useUtils();

  // 游客模式：自动登录到游客账户
  const guestLoginMutation = trpc.auth.loginWithPassword.useMutation({
    onSuccess: (data) => {
      toast.success("已以游客身份登录！");
      utils.auth.me.invalidate();
      setTimeout(() => {
        window.location.href = "/";
      }, 200);
    },
    onError: (error) => {
      toast.error("游客登录失败: " + error.message);
    },
  });

  const handleGuestLogin = () => {
    guestLoginMutation.mutate({
      username: "guest_dev",
      password: "guest123",
    });
  };
  
  const handlePressStart = () => {
    const timer = setTimeout(() => {
      handleGuestLogin();
    }, 2000);
    setPressTimer(timer);
  };
  
  const handlePressEnd = () => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      setPressTimer(null);
    }
  };

  const loginMutation = trpc.auth.loginWithPassword.useMutation({
    onSuccess: (data) => {
      toast.success("登录成功！");
      utils.auth.me.invalidate();
      setTimeout(() => {
        window.location.href = "/";
      }, 200);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const registerMutation = trpc.auth.registerWithPassword.useMutation({
    onSuccess: (data) => {
      toast.success("注册成功！");
      utils.auth.me.invalidate();
      setTimeout(() => {
        window.location.href = "/";
      }, 200);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername || !loginPassword) {
      toast.error("请填写用户名和密码");
      return;
    }
    if (!agreedToTerms) {
      toast.error("请先阅读并同意隐私条款和用户协议");
      return;
    }
    loginMutation.mutate({
      username: loginUsername,
      password: loginPassword,
    });
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regUsername || !regPassword) {
      toast.error("请填写用户名和密码");
      return;
    }
    if (regUsername.length < 2 || regUsername.length > 20) {
      toast.error("用户名长度必须在2-20个字符之间");
      return;
    }
    if (regPassword !== regConfirmPassword) {
      toast.error("两次输入的密码不一致");
      return;
    }
    if (regPassword.length < 6) {
      toast.error("密码长度至少6个字符");
      return;
    }
    if (!agreedToTerms) {
      toast.error("请先阅读并同意隐私条款和用户协议");
      return;
    }
    registerMutation.mutate({
      username: regUsername,
      password: regPassword,
      name: regName || undefined,
      inviteCode: regInviteCode || undefined,
    });
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#A80000' }}>
      {/* 顶部返回按钮 */}
      <header className="absolute top-0 left-0 right-0 p-4 z-10">
        <Link href="/">
          <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors">
            <ArrowLeft className="w-6 h-6 text-white" />
          </button>
        </Link>
      </header>

      {/* 主内容区域 */}
      <main className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="w-full max-w-md">
          {/* 登录/注册卡片 */}
          <div className="bg-white rounded-3xl p-6 shadow-2xl">
            {/* Tab切换 */}
            <div className="flex mb-6">
              <button
                onClick={() => setActiveTab("login")}
                className={`flex-1 pb-3 text-base font-medium transition-colors relative ${
                  activeTab === "login" ? "text-gray-800" : "text-gray-400"
                }`}
              >
                登录
                {activeTab === "login" && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-800"></div>
                )}
              </button>
              <button
                onClick={() => setActiveTab("register")}
                className={`flex-1 pb-3 text-base font-medium transition-colors relative ${
                  activeTab === "register" ? "text-gray-800" : "text-gray-400"
                }`}
              >
                注册
                {activeTab === "register" && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-800"></div>
                )}
              </button>
            </div>

            {/* 登录表单 */}
            {activeTab === "login" && (
              <form onSubmit={handleLogin} className="space-y-4">
                {/* 用户名输入框 */}
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2">
                    <User className="w-5 h-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    placeholder="请输入用户名"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-gray-400 transition-colors"
                  />
                </div>

                {/* 密码输入框 */}
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2">
                    <Lock className="w-5 h-5 text-gray-400" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="请输入密码"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full pl-12 pr-12 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-gray-400 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>

                {/* 登录按钮 */}
                <button
                  type="submit"
                  disabled={loginMutation.isPending}
                  className="w-full py-3 bg-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-300 transition-colors disabled:opacity-50"
                >
                  {loginMutation.isPending ? "登录中..." : "登录"}
                </button>

                {/* 协议勾选 */}
                <div className="flex items-start gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setAgreedToTerms(!agreedToTerms)}
                    className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                      agreedToTerms ? "bg-green-500 border-green-500" : "border-gray-300"
                    }`}
                  >
                    {agreedToTerms && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    我已阅读、理解并同意
                    <a href="#" className="text-gray-800 underline mx-1">《隐私条款》</a>
                    、
                    <a href="#" className="text-gray-800 underline mx-1">《用户协议》</a>
                  </p>
                </div>
              </form>
            )}

            {/* 注册表单 */}
            {activeTab === "register" && (
              <form onSubmit={handleRegister} className="space-y-4">
                {/* 用户名输入框 */}
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2">
                    <User className="w-5 h-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    placeholder="请输入用户名"
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-gray-400 transition-colors"
                  />
                </div>

                {/* 昵称输入框 */}
                <div className="relative">
                  <input
                    type="text"
                    placeholder="昵称（可选）"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-gray-400 transition-colors"
                  />
                </div>

                {/* 邀请码输入框 */}
                <div className="relative">
                  <input
                    type="text"
                    placeholder="邀请码（可选）"
                    value={regInviteCode}
                    onChange={(e) => setRegInviteCode(e.target.value.toUpperCase())}
                    maxLength={6}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-gray-400 transition-colors font-mono"
                  />
                </div>

                {/* 密码输入框 */}
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2">
                    <Lock className="w-5 h-5 text-gray-400" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="请输入密码"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    className="w-full pl-12 pr-12 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-gray-400 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>

                {/* 确认密码输入框 */}
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2">
                    <Lock className="w-5 h-5 text-gray-400" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="确认密码"
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-gray-400 transition-colors"
                  />
                </div>

                {/* 注册按钮 */}
                <button
                  type="submit"
                  disabled={registerMutation.isPending}
                  className="w-full py-3 bg-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-300 transition-colors disabled:opacity-50"
                >
                  {registerMutation.isPending ? "注册中..." : "注册"}
                </button>

                {/* 协议勾选 */}
                <div className="flex items-start gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setAgreedToTerms(!agreedToTerms)}
                    className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                      agreedToTerms ? "bg-green-500 border-green-500" : "border-gray-300"
                    }`}
                  >
                    {agreedToTerms && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    我已阅读、理解并同意
                    <a href="#" className="text-gray-800 underline mx-1">《隐私条款》</a>
                    、
                    <a href="#" className="text-gray-800 underline mx-1">《用户协议》</a>
                  </p>
                </div>
              </form>
            )}
          </div>

          {/* 底部Logo */}
          <div className="mt-12 text-center">
            <div 
              className="inline-block cursor-pointer"
              onMouseDown={handlePressStart}
              onMouseUp={handlePressEnd}
              onMouseLeave={handlePressEnd}
              onTouchStart={handlePressStart}
              onTouchEnd={handlePressEnd}
              onTouchCancel={handlePressEnd}
              title="长按2秒以游客身份登录"
            >
              <img 
                src="/maidong-hyy.png" 
                alt="脉动" 
                className="h-16 opacity-80 hover:opacity-100 transition-opacity"
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
