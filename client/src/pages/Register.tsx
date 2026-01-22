import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { UserPlus, CheckCircle, XCircle, ArrowLeft, Home } from "lucide-react";
import { Link } from "wouter";

export default function Register() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const inviteCode = searchParams.get("code") || "";
  
  const [code, setCode] = useState(inviteCode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"validate" | "register" | "success">(inviteCode ? "validate" : "validate");

  // 验证邀请码
  const { data: validation, isLoading: validating, refetch: revalidate } = trpc.invitations.validate.useQuery(
    { code },
    { enabled: code.length >= 6 }
  );

  // 注册mutation
  const registerMutation = trpc.invitations.register.useMutation({
    onSuccess: () => {
      setStep("success");
      toast.success("注册成功！");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // 当URL中有邀请码时，自动验证
  useEffect(() => {
    if (inviteCode && validation?.valid) {
      setStep("register");
    }
  }, [inviteCode, validation]);

  const handleValidateCode = () => {
    if (code.length < 6) {
      toast.error("请输入有效的邀请码");
      return;
    }
    revalidate();
    if (validation?.valid) {
      setStep("register");
    }
  };

  const handleRegister = () => {
    if (!username || username.length < 3) {
      toast.error("用户名至少3个字符");
      return;
    }
    if (!password || password.length < 6) {
      toast.error("密码至少6个字符");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("两次输入的密码不一致");
      return;
    }

    registerMutation.mutate({
      code,
      username,
      password,
      name: name || undefined,
      email: email || undefined,
    });
  };

  // 成功页面
  if (step === "success") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-2xl">注册成功！</CardTitle>
            <CardDescription>
              欢迎加入旺旺喵喵的秘密基地
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-center text-muted-foreground">
              您的家长账户已创建成功，现在可以开始使用了。
            </p>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => setLocation("/")}>
                <Home className="w-4 h-4 mr-2" />
                进入首页
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2 mb-2">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <CardTitle className="text-xl">家长注册</CardTitle>
          </div>
          <CardDescription>
            {step === "validate" 
              ? "请输入管理员提供的邀请码" 
              : "填写您的账户信息完成注册"
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === "validate" ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">邀请码</Label>
                <Input
                  id="code"
                  placeholder="请输入8位邀请码"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="font-mono text-lg text-center tracking-widest"
                  maxLength={8}
                />
              </div>
              
              {code.length >= 6 && validation && (
                <div className={`p-3 rounded-lg ${
                  validation.valid 
                    ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800" 
                    : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
                }`}>
                  {validation.valid ? (
                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                      <CheckCircle className="w-4 h-4" />
                      <span>邀请码有效</span>
                      {validation.familyName && (
                        <span className="text-sm">（{validation.familyName}）</span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                      <XCircle className="w-4 h-4" />
                      <span>{validation.error}</span>
                    </div>
                  )}
                </div>
              )}
              
              <Button 
                className="w-full" 
                onClick={handleValidateCode}
                disabled={code.length < 6 || validating || !validation?.valid}
              >
                {validating ? "验证中..." : "下一步"}
              </Button>
              
              <p className="text-xs text-center text-muted-foreground">
                没有邀请码？请联系管理员获取
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {validation?.familyName && (
                <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                  <p className="text-sm text-purple-600 dark:text-purple-400">
                    您将加入：<strong>{validation.familyName}</strong>
                  </p>
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="username">用户名 *</Label>
                <Input
                  id="username"
                  placeholder="3-20个字符"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password">密码 *</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="至少6个字符"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">确认密码 *</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="再次输入密码"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="name">昵称（可选）</Label>
                <Input
                  id="name"
                  placeholder="显示名称"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="email">邮箱（可选）</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="用于找回密码"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setStep("validate")}
                >
                  返回
                </Button>
                <Button 
                  className="flex-1"
                  onClick={handleRegister}
                  disabled={registerMutation.isPending}
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  {registerMutation.isPending ? "注册中..." : "完成注册"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
