import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useLocation } from "wouter";
import { ArrowLeft, User, Lock, Eye, EyeOff } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Login() {
  const [, setLocation] = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [activeTab, setActiveTab] = useState("login");
  
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
      // 自动切换到注册标签页
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
    // 使用游客账户登录
    guestLoginMutation.mutate({
      username: "guest_dev",
      password: "guest123",
    });
  };
  
  // 处理长按开始
  const handlePressStart = () => {
    const timer = setTimeout(() => {
      handleGuestLogin();
    }, 2000); // 2秒
    setPressTimer(timer);
  };
  
  // 处理长按结束
  const handlePressEnd = () => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      setPressTimer(null);
    }
  };

  const loginMutation = trpc.auth.loginWithPassword.useMutation({
    onSuccess: (data) => {
      toast.success("登录成功！");
      // 先刷新认证状态
      utils.auth.me.invalidate();
      // 给浏览器200ms时间处理cookie，特别是安卓浏览器
      // 使用href而不是replace，确保cookie被正确携带
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
      // 先刷新认证状态
      utils.auth.me.invalidate();
      // 给浏览器200ms时间处理cookie，特别是安卓浏览器
      // 使用href而不是replace，确保cookie被正确携带
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
    registerMutation.mutate({
      username: regUsername,
      password: regPassword,
      name: regName || undefined,
      inviteCode: regInviteCode || undefined,
    });
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* 顶部导航 - 固定在顶部 */}
      <header className="absolute top-0 left-0 right-0 p-4 z-10">
        <Link href="/">
          <Button variant="ghost" size="icon" className="hover:bg-gray-100">
            <ArrowLeft className="w-6 h-6 text-gray-700" />
          </Button>
        </Link>
      </header>

      {/* 主内容区域 - 扩大到整个屏幕 */}
      <main className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="w-full max-w-md">
          {/* Logo区域 - 使用新图标，点击进入游客模式 */}
          <div className="text-center mb-8">
            <div 
              className="w-24 h-24 mx-auto mb-4 rounded-3xl overflow-hidden shadow-lg cursor-pointer hover:shadow-xl transition-shadow active:scale-95"
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
                className="w-full h-full object-cover"
              />
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              脉动
            </h1>
            <p className="text-lg text-gray-600">让人脉动起来</p>
          </div>

          {/* 登录/注册卡片 */}
          <Card className="w-full p-8 shadow-xl border-2 border-gray-200 bg-white">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              {/* 登录表单 */}
              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-6">
                  <div className="space-y-3">
                    <Label htmlFor="login-username" className="text-base font-medium text-gray-700">
                      用户名
                    </Label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <Input
                        id="login-username"
                        placeholder="请输入用户名"
                        value={loginUsername}
                        onChange={(e) => setLoginUsername(e.target.value)}
                        className="pl-12 h-14 text-lg border-2 border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="login-password" className="text-base font-medium text-gray-700">
                      密码
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <Input
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="请输入密码"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="pl-12 pr-12 h-14 text-lg border-2 border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-14 text-lg font-semibold text-white border-0 rounded-lg shadow-md"
                    style={{
                      backgroundColor: 'var(--color-primary)',
                    }}
                    disabled={loginMutation.isPending}
                  >
                    {loginMutation.isPending ? "登录中..." : "登录"}
                  </Button>

                  {/* 登录/注册切换按钮 */}
                  <TabsList className="grid w-full grid-cols-2 h-12 bg-gray-100 mt-6">
                    <TabsTrigger 
                      value="login" 
                      className="text-base font-medium data-[state=active]:bg-white"
                      style={{
                        '--tw-text-opacity': '1'
                      }}
                      data-active-color="var(--color-primary)"
                    >
                      登录
                    </TabsTrigger>
                    <TabsTrigger 
                      value="register"
                      className="text-base font-medium data-[state=active]:bg-white"
                      style={{
                        '--tw-text-opacity': '1'
                      }}
                      data-active-color="var(--color-primary)"
                    >
                      注册
                    </TabsTrigger>
                  </TabsList>
                </form>
              </TabsContent>

              {/* 注册表单 */}
              <TabsContent value="register">
                <form onSubmit={handleRegister} className="space-y-6">
                  <div className="space-y-3">
                    <Label htmlFor="reg-username" className="text-base font-medium text-gray-700">
                      用户名
                    </Label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <Input
                        id="reg-username"
                        placeholder="3-20个字符，字母数字下划线"
                        value={regUsername}
                        onChange={(e) => setRegUsername(e.target.value)}
                        className="pl-12 h-14 text-lg border-2 border-gray-300 focus:border-green-500 focus:ring-green-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="reg-name" className="text-base font-medium text-gray-700">
                      昵称（可选）
                    </Label>
                    <Input
                      id="reg-name"
                      placeholder="显示名称"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      className="h-14 text-lg border-2 border-gray-300 focus:border-green-500 focus:ring-green-500"
                    />
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="reg-invite" className="text-base font-medium text-gray-700">
                      邀请码（可选）
                    </Label>
                    <Input
                      id="reg-invite"
                      placeholder="6位邀请码"
                      value={regInviteCode}
                      onChange={(e) => setRegInviteCode(e.target.value.toUpperCase())}
                      maxLength={6}
                      className="h-14 text-lg border-2 border-gray-300 focus:border-green-500 focus:ring-green-500 font-mono"
                    />
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="reg-password" className="text-base font-medium text-gray-700">
                      密码
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <Input
                        id="reg-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="至少6个字符"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        className="pl-12 pr-12 h-14 text-lg border-2 border-gray-300 focus:border-green-500 focus:ring-green-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="reg-confirm" className="text-base font-medium text-gray-700">
                      确认密码
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <Input
                        id="reg-confirm"
                        type={showPassword ? "text" : "password"}
                        placeholder="再次输入密码"
                        value={regConfirmPassword}
                        onChange={(e) => setRegConfirmPassword(e.target.value)}
                        className="pl-12 h-14 text-lg border-2 border-gray-300 focus:border-green-500 focus:ring-green-500"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-14 text-lg font-semibold bg-green-600 hover:bg-green-700 text-white border-0 rounded-lg shadow-md"
                    disabled={registerMutation.isPending}
                  >
                    {registerMutation.isPending ? "注册中..." : "注册"}
                  </Button>

                  {/* 登录/注册切换按钮 */}
                  <TabsList className="grid w-full grid-cols-2 h-12 bg-gray-100 mt-6">
                    <TabsTrigger 
                      value="login" 
                      className="text-base font-medium data-[state=active]:bg-white"
                      style={{
                        '--tw-text-opacity': '1'
                      }}
                      data-active-color="var(--color-primary)"
                    >
                      登录
                    </TabsTrigger>
                    <TabsTrigger 
                      value="register"
                      className="text-base font-medium data-[state=active]:bg-white"
                      style={{
                        '--tw-text-opacity': '1'
                      }}
                      data-active-color="var(--color-primary)"
                    >
                      注册
                    </TabsTrigger>
                  </TabsList>
                </form>
              </TabsContent>
            </Tabs>
          </Card>
        </div>
      </main>
    </div>
  );
}
