import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { User, Lock, Eye, EyeOff } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { saveToken, saveCredentials, getSavedCredentials, clearCredentials } from "@/lib/tokenStorage";

export default function Login() {
  const [, setLocation] = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

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
  const queryClient = useQueryClient();

  // 切换用户时清空所有缓存，防止旧用户数据残留
  const clearAllCacheAndNavigate = (token?: string) => {
    if (token) {
      saveToken(token);
    }
    queryClient.clear();
    setTimeout(() => {
      setLocation("/");
    }, 200);
  };

  // 过滤错误消息，避免将 SQL 原始错误暴露给用户
  const safeErrorMsg = (msg: string): string => {
    const sqlKeywords = ['Failed query', 'select ', 'SELECT ', 'from `', 'FROM `', 'where ', 'WHERE ', 'ER_', 'ECONNREFUSED', 'ETIMEDOUT', 'Access denied'];
    if (sqlKeywords.some(k => msg.includes(k))) {
      return '服务器异常，请稍后重试';
    }
    return msg;
  };

  const loginMutation = trpc.auth.loginWithPassword.useMutation({
    onSuccess: async (data) => {
      if (rememberMe) {
        await saveCredentials(loginUsername, loginPassword);
      } else {
        await clearCredentials();
      }
      toast.success("登录成功！");
      clearAllCacheAndNavigate(data.token);
    },
    onError: (error) => {
      toast.error(safeErrorMsg(error.message));
    },
  });

  // 自动填写：页面加载时检查是否有保存的凭据，只自动填写用户名密码，不自动提交
  const autoLoginAttempted = useRef(false);
  useEffect(() => {
    if (autoLoginAttempted.current) return;
    autoLoginAttempted.current = true;

    getSavedCredentials().then((creds) => {
      if (creds && creds.username && creds.password) {
        setLoginUsername(creds.username);
        setLoginPassword(creds.password);
        setRememberMe(true);
        setAgreedToTerms(true);
        // 不自动调用 loginMutation，让用户手动点击登录按鈕
      }
    });
  }, []);

  // 游客模式：自动登录到游客账户
  const guestLoginMutation = trpc.auth.loginWithPassword.useMutation({
    onSuccess: (data) => {
      toast.success("已以游客身份登录！");
      clearAllCacheAndNavigate(data.token);
    },
    onError: (error) => {
      toast.error("游客登录失败: " + safeErrorMsg(error.message));
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

  const registerMutation = trpc.auth.registerWithPassword.useMutation({
    onSuccess: (data) => {
      toast.success("注册成功！");
      clearAllCacheAndNavigate(data.token);
    },
    onError: (error) => {
      toast.error(safeErrorMsg(error.message));
    },
  });

  // 登录处理 - 只通过按钮点击触发
  const handleLogin = () => {
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

  // 注册提交锁
  const registerSubmittingRef = useRef(false);

  const handleRegister = () => {
    if (registerSubmittingRef.current || registerMutation.isPending) return;
    if (!regUsername || !regPassword) {
      toast.error("请填写用户名和密码");
      return;
    }
    if (regUsername.length < 1 || regUsername.length > 20) {
      toast.error("用户名长度必须在1-20个字符之间");
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
    registerSubmittingRef.current = true;
    registerMutation.mutate({
      username: regUsername,
      password: regPassword,
      name: regName || undefined,
      inviteCode: regInviteCode || undefined,
    }, {
      onSettled: () => {
        setTimeout(() => {
          registerSubmittingRef.current = false;
        }, 3000);
      },
    });
  };

  const preventEnterSubmit = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <div className="fixed inset-0 flex flex-col" style={{ backgroundColor: '#A80000' }}>
      {/* 主内容区域 */}
      <main className="flex-1 flex flex-col items-center px-6 pt-8 overflow-y-auto touch-pan-y">
        <div className="w-full max-w-md">
          {/* 登录/注册卡片 */}
          <div className="bg-white rounded-3xl p-6 shadow-2xl">
            {/* Tab切换 */}
            <div className="flex mb-6">
              <button
                type="button"
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
                type="button"
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

            {/* 登录区域 */}
            {activeTab === "login" && (
              <div className="space-y-4">
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
                    onKeyDown={preventEnterSubmit}
                    autoComplete="off"
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
                    onKeyDown={preventEnterSubmit}
                    autoComplete="off"
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
                  type="button"
                  onClick={handleLogin}
                  disabled={loginMutation.isPending}
                  className={`w-full py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 ${
                    loginUsername && loginPassword && agreedToTerms
                      ? 'bg-[#D32F2F] text-white hover:bg-[#D32F2F]-dark'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {loginMutation.isPending ? "登录中..." : "登录"}
                </button>

                {/* 协议勾选 */}
                <div className="flex items-start gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setAgreedToTerms(!agreedToTerms)}
                    className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                      agreedToTerms ? "bg-[#4CAF50] border-[#4CAF50]" : "border-gray-300"
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
                    <Link href="/privacy-policy">
                      <a className="text-gray-800 underline mx-1">《隐私条款》</a>
                    </Link>
                    、
                    <Link href="/user-agreement">
                      <a className="text-gray-800 underline mx-1">《用户协议》</a>
                    </Link>
                  </p>
                </div>

                {/* 保存登录信息勾选 */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRememberMe(!rememberMe)}
                    className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                      rememberMe ? "bg-[#D32F2F] border-[#D32F2F]" : "border-gray-300"
                    }`}
                  >
                    {rememberMe && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                  <p className="text-xs text-gray-500">保存登录信息，下次直接登录</p>
                </div>
              </div>
            )}

            {/* 注册区域 */}
            {activeTab === "register" && (
              <div className="space-y-4">
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
                    onKeyDown={preventEnterSubmit}
                    autoComplete="off"
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
                    onKeyDown={preventEnterSubmit}
                    autoComplete="off"
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
                    onKeyDown={preventEnterSubmit}
                    autoComplete="off"
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
                    onKeyDown={preventEnterSubmit}
                    autoComplete="off"
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
                    onKeyDown={preventEnterSubmit}
                    autoComplete="off"
                    className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-gray-400 transition-colors"
                  />
                </div>

                {/* 注册按钮 */}
                <button
                  type="button"
                  onClick={handleRegister}
                  disabled={registerMutation.isPending}
                  className={`w-full py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 ${
                    regUsername && regPassword && regConfirmPassword && regName && agreedToTerms
                      ? 'bg-[#D32F2F] text-white hover:bg-[#D32F2F]-dark'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {registerMutation.isPending ? "注册中..." : "注册"}
                </button>

                {/* 协议勾选 */}
                <div className="flex items-start gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setAgreedToTerms(!agreedToTerms)}
                    className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                      agreedToTerms ? "bg-[#4CAF50] border-[#4CAF50]" : "border-gray-300"
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
                    <Link href="/privacy-policy">
                      <a className="text-gray-800 underline mx-1">《隐私条款》</a>
                    </Link>
                    、
                    <Link href="/user-agreement">
                      <a className="text-gray-800 underline mx-1">《用户协议》</a>
                    </Link>
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
