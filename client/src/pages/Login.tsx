import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { User, Lock, Eye, EyeOff } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { saveToken, saveCredentials, getSavedCredentials, clearCredentials } from "@/lib/tokenStorage";
import { clearTransientIdentityState } from "@/lib/authIdentity";

/**
 * 多版本登录页：账号密码登录/注册逻辑完全通用，仅登录页 UI 外观按版本切换。
 * 版本来源：URL 参数 ?ui=yaban（或 ?v=yaban），默认 maidong（脉动版红色）。
 * 预留扩展：未来新增行业版本只需在 THEMES 中追加一项。
 */
type LoginUi = "maidong" | "yaban";

interface LoginTheme {
  // 页面背景
  pageStyle: React.CSSProperties;
  pageClassName: string;
  // 顶部品牌区（可选）
  renderHero?: () => React.ReactNode;
  // 主按钮（登录/注册）激活态颜色类
  primaryActiveClass: string;
  // tab 选中下划线/文字色
  tabActiveText: string;
  tabUnderline: string;
  // 勾选圆点选中色
  checkAgreeClass: string;
  checkRememberClass: string;
  // 卡片样式
  cardClassName: string;
}

const THEMES: Record<LoginUi, LoginTheme> = {
  // 脉动版：保持原有红底白卡
  maidong: {
    pageStyle: { backgroundColor: "#A80000" },
    pageClassName: "fixed inset-0 flex flex-col",
    primaryActiveClass: "bg-[#D32F2F] text-white hover:opacity-90",
    tabActiveText: "text-gray-800",
    tabUnderline: "bg-gray-800",
    checkAgreeClass: "bg-[#4CAF50] border-[#4CAF50]",
    checkRememberClass: "bg-[#D32F2F] border-[#D32F2F]",
    cardClassName: "bg-white rounded-3xl p-6 shadow-2xl",
  },
  // 牙伴版：手机竖屏蓝白医疗清爽风
  yaban: {
    pageStyle: {
      background: "linear-gradient(180deg, #2E8BE6 0%, #5BA8F0 38%, #E8F4FD 100%)",
    },
    pageClassName: "fixed inset-0 flex flex-col",
    primaryActiveClass: "bg-[#1E7FE0] text-white hover:opacity-90",
    tabActiveText: "text-[#1565C0]",
    tabUnderline: "bg-[#1E7FE0]",
    checkAgreeClass: "bg-[#1E7FE0] border-[#1E7FE0]",
    checkRememberClass: "bg-[#1E7FE0] border-[#1E7FE0]",
    cardClassName: "bg-white rounded-3xl p-6 shadow-2xl",
    renderHero: () => (
      <div className="w-full flex flex-col items-center pt-2 pb-5">
        <div className="w-44 h-44 rounded-full bg-white/25 backdrop-blur-sm flex items-center justify-center shadow-lg">
          <img
            src="/yaban-login-hero.png"
            alt="牙伴"
            className="w-40 h-40 object-contain rounded-full"
          />
        </div>
        <h1 className="mt-4 text-2xl font-bold text-white tracking-wide">牙伴</h1>
        <p className="mt-1 text-sm text-white/90">口腔诊所智慧管理</p>
      </div>
    ),
  },
};

export default function Login() {
  const [, setLocation] = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // 当前登录页 UI 版本（仅影响外观，登录逻辑通用）
  const [ui, setUi] = useState<LoginUi>("maidong");

  // 登录表单
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // 注册表单
  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");
  const [regName, setRegName] = useState("");
  const [regInviteCode, setRegInviteCode] = useState("");

  // 从 URL 参数读取邀请码与 UI 版本
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inviteCode = params.get("invite");
    if (inviteCode) {
      setRegInviteCode(inviteCode);
      setActiveTab("register");
    }
    // 皮肤优先级：URL 参数 > localStorage 记忆（上次登录的版本）> 默认脉动
    const uiParam = (params.get("ui") || params.get("v") || "").toLowerCase();
    if (uiParam === "yaban") {
      setUi("yaban");
    } else if (uiParam === "maidong") {
      setUi("maidong");
    } else {
      // 无 URL 参数时（如微信搜索进入），读取上次登录记住的版本
      try {
        const remembered = (localStorage.getItem("_login_ui") || "").toLowerCase();
        if (remembered === "yaban") setUi("yaban");
        else if (remembered === "maidong") setUi("maidong");
      } catch (e) {
        // localStorage 不可用时忽略，保持默认脉动
      }
    }
  }, []);

  // 长按计时器
  const [pressTimer, setPressTimer] = useState<NodeJS.Timeout | null>(null);

  const queryClient = useQueryClient();
  const utils = trpc.useUtils();

  // 新真实账号登录成功后，旧账号缓存和账本代看状态都不能继续保留。
  const clearAllCacheAndNavigate = async (token?: string) => {
    clearTransientIdentityState();
    queryClient.clear();

    if (token) {
      await saveToken(token);
    }

    // 在跳转前主动写入新账号的 auth.me，避免个人中心短暂或持续显示上一位用户。
    try {
      await utils.auth.me.fetch();
    } catch {
      // 登录接口已经成功；若当前用户信息刷新偶发失败，目标页仍会按正常查询流程重试。
    }

    // 登录成功后跳回原页面；真实登录不能恢复旧的 viewAs URL 参数。
    const fromParam = new URLSearchParams(window.location.search).get('from');
    let redirectTo = '/';
    if (fromParam && fromParam.startsWith('/')) {
      const fromUrl = new URL(fromParam, window.location.origin);
      fromUrl.searchParams.delete('viewAs');
      redirectTo = `${fromUrl.pathname}${fromUrl.search}${fromUrl.hash}`;
    }
    setTimeout(() => {
      setLocation(redirectTo);
    }, 200);
  };

  // 过滤错误消息，避免将 SQL 原始错误暴露给用户
  const safeErrorMsg = (msg: string): string => {
    const sqlKeywords = ["Failed query", "select ", "SELECT ", "from `", "FROM `", "where ", "WHERE ", "ER_", "ECONNREFUSED", "ETIMEDOUT", "Access denied"];
    if (sqlKeywords.some((k) => msg.includes(k))) {
      return "服务器异常，请稍后重试";
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
      // 记住该账号生效版本的登录页皮肤，供下次（即使从微信搜索进入、网址不带参数）自动还原
      try {
        if (data.loginUi === "yaban" || data.loginUi === "maidong") {
          localStorage.setItem("_login_ui", data.loginUi);
        }
      } catch (e) {}
      toast.success("登录成功！");
      await clearAllCacheAndNavigate(data.token);
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
      }
    });
  }, []);

  // 游客模式：自动登录到游客账户
  const guestLoginMutation = trpc.auth.loginWithPassword.useMutation({
    onSuccess: async (data) => {
      toast.success("已以游客身份登录！");
      await clearAllCacheAndNavigate(data.token);
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
    onSuccess: async (data) => {
      toast.success("注册成功！");
      await clearAllCacheAndNavigate(data.token);
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
    registerMutation.mutate(
      {
        username: regUsername,
        password: regPassword,
        name: regName || undefined,
        inviteCode: regInviteCode || undefined,
      },
      {
        onSettled: () => {
          setTimeout(() => {
            registerSubmittingRef.current = false;
          }, 3000);
        },
      }
    );
  };

  const preventEnterSubmit = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const theme = THEMES[ui];

  return (
    <div className={theme.pageClassName} style={theme.pageStyle}>
      {/* 主内容区域 */}
      <main className="flex-1 flex flex-col items-center px-6 pt-8 overflow-y-auto touch-pan-y">
        <div className="w-full max-w-md">
          {/* 顶部品牌区（牙伴版等含 hero 的版本显示） */}
          {theme.renderHero && theme.renderHero()}

          {/* 登录/注册卡片 */}
          <div className={theme.cardClassName}>
            {/* Tab切换 */}
            <div className="flex mb-6">
              <button
                type="button"
                onClick={() => setActiveTab("login")}
                className={`flex-1 pb-3 text-base font-medium transition-colors relative ${
                  activeTab === "login" ? theme.tabActiveText : "text-gray-400"
                }`}
              >
                登录
                {activeTab === "login" && <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${theme.tabUnderline}`}></div>}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("register")}
                className={`flex-1 pb-3 text-base font-medium transition-colors relative ${
                  activeTab === "register" ? theme.tabActiveText : "text-gray-400"
                }`}
              >
                注册
                {activeTab === "register" && <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${theme.tabUnderline}`}></div>}
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

                {/* 登录按钮（长按2秒游客登录） */}
                <button
                  type="button"
                  onClick={handleLogin}
                  onMouseDown={handlePressStart}
                  onMouseUp={handlePressEnd}
                  onMouseLeave={handlePressEnd}
                  onTouchStart={handlePressStart}
                  onTouchEnd={handlePressEnd}
                  disabled={loginMutation.isPending}
                  className={`w-full py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 ${
                    loginUsername && loginPassword && agreedToTerms ? theme.primaryActiveClass : "bg-gray-200 text-gray-700 hover:bg-gray-300"
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
                      agreedToTerms ? theme.checkAgreeClass : "border-gray-300"
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
                      rememberMe ? theme.checkRememberClass : "border-gray-300"
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
                    regUsername && regPassword && regConfirmPassword && regName && agreedToTerms ? theme.primaryActiveClass : "bg-gray-200 text-gray-700 hover:bg-gray-300"
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
                      agreedToTerms ? theme.checkAgreeClass : "border-gray-300"
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
