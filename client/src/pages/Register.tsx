import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { UserPlus, CheckCircle, ArrowLeft, Home, Gift } from "lucide-react";
import { Link } from "wouter";

export default function Register() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  
  // 支持两种URL参数: ?invite=XXXXXX (新系统) 或 ?code=XXXXXXXX (旧系统)
  const inviteCodeFromUrl = searchParams.get("invite") || searchParams.get("code") || "";
  
  const [inviteCode, setInviteCode] = useState(inviteCodeFromUrl);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [showInviteInput, setShowInviteInput] = useState(false);

  // 验证邀请码(可选)
  const { data: inviteValidation } = trpc.invite.validateInviteCode.useQuery(
    { inviteCode },
    { enabled: inviteCode.length === 6 }
  );

  // 注册mutation
  const registerMutation = trpc.auth.registerWithPassword.useMutation({
    onSuccess: () => {
      toast.success("注册成功！");
      // 注册成功后自动跳转到首页(已自动登录)
      setTimeout(() => {
        setLocation("/parent");
      }, 1000);
    },
    onError: (error) => {
      toast.error(error.message || "注册失败");
    },
  });

  // 当URL中有邀请码时，自动显示邀请码信息
  useEffect(() => {
    if (inviteCodeFromUrl) {
      setShowInviteInput(true);
    }
  }, [inviteCodeFromUrl]);

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
      username,
      password,
      name: name || undefined,
      email: email || undefined,
      inviteCode: inviteCode || undefined, // 邀请码是可选的
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-rose-50 to-red-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2 mb-2">
            <Link href="/login">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <CardTitle className="text-2xl">注册账号</CardTitle>
          </div>
          <CardDescription>
            创建您的好友记账号,开始管理人脉关系
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 邀请码区域 */}
          {inviteCode && inviteValidation?.valid && (
            <div className="p-4 bg-[#E8F5E9] dark:bg-[#4CAF50]/20 rounded-lg border border-[#4CAF50] dark:border-[#4CAF50]">
              <div className="flex items-center gap-2 text-[#4CAF50] dark:text-[#4CAF50] mb-2">
                <Gift className="w-5 h-5" />
                <span className="font-semibold">使用邀请码注册</span>
              </div>
              <p className="text-sm text-[#757575] dark:text-[#757575]">
                邀请码: <span className="font-mono font-bold">{inviteCode}</span>
              </p>
              <p className="text-xs text-[#757575] dark:text-[#757575] mt-1">
                注册成功后将自动关联邀请人
              </p>
            </div>
          )}

          {/* 邀请码输入(可选) */}
          {!inviteCodeFromUrl && (
            <div className="space-y-2">
              {!showInviteInput ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowInviteInput(true)}
                  className="w-full text-[#1976D2] border-[#1976D2] hover:bg-white"
                >
                  <Gift className="w-4 h-4 mr-2" />
                  我有邀请码
                </Button>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="inviteCode">
                    邀请码(可选)
                    <span className="text-xs text-[#757575] ml-2">6位字母数字组合</span>
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="inviteCode"
                      placeholder="输入邀请码"
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                      className="font-mono text-center tracking-wider"
                      maxLength={6}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowInviteInput(false);
                        setInviteCode("");
                      }}
                    >
                      取消
                    </Button>
                  </div>
                  {inviteCode.length === 6 && inviteValidation && (
                    <p className={`text-xs ${inviteValidation.valid ? 'text-[#4CAF50]' : 'text-[#D32F2F]'}`}>
                      {inviteValidation.valid ? '✓ 邀请码有效' : '✗ 邀请码无效'}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 用户名 */}
          <div className="space-y-2">
            <Label htmlFor="username">用户名 *</Label>
            <Input
              id="username"
              placeholder="3-20个字符"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>
          
          {/* 密码 */}
          <div className="space-y-2">
            <Label htmlFor="password">密码 *</Label>
            <Input
              id="password"
              type="password"
              placeholder="至少6个字符"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          
          {/* 确认密码 */}
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">确认密码 *</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="再次输入密码"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          
          {/* 昵称(可选) */}
          <div className="space-y-2">
            <Label htmlFor="name">昵称(可选)</Label>
            <Input
              id="name"
              placeholder="显示名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </div>
          
          {/* 邮箱(可选) */}
          <div className="space-y-2">
            <Label htmlFor="email">邮箱(可选)</Label>
            <Input
              id="email"
              type="email"
              placeholder="用于找回密码"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          
          {/* 注册按钮 */}
          <Button 
            className="w-full bg-gradient-to-r from-indigo-600 to-[#d44] hover:from-indigo-700 hover:to-[#8a0000]"
            onClick={handleRegister}
            disabled={registerMutation.isPending}
          >
            <UserPlus className="w-4 h-4 mr-2" />
            {registerMutation.isPending ? "注册中..." : "立即注册"}
          </Button>

          {/* 登录链接 */}
          <div className="text-center text-sm text-[#757575] dark:text-[#757575]">
            已有账号？
            <Link href="/login">
              <Button variant="link" className="p-0 h-auto ml-1 text-[#1976D2]">
                立即登录
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
