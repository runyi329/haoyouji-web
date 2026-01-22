import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Lock } from "lucide-react";

export default function ParentPasswordSetup() {
  // const { toast } = useToast(); // 已改用sonner的toast
  const [, setLocation] = useLocation();
  
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // 检查是否已设置密码
  const { data: hasPassword, isLoading } = trpc.exercise.hasPassword.useQuery();

  // 设置密码
  const setPasswordMutation = trpc.exercise.setPassword.useMutation({
    onSuccess: () => {
      toast.success("家长密码已设置");
      setLocation("/exercise/types");
    },
    onError: (error) => {
      toast.error(`设置失败: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password.length < 4) {
      toast.error("密码至少需要4个字符");
      return;
    }
    
    if (password !== confirmPassword) {
      toast.error("两次输入的密码不一致");
      return;
    }
    
    setPasswordMutation.mutate({ password });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">
            {hasPassword ? "修改家长密码" : "设置家长密码"}
          </CardTitle>
          <CardDescription>
            {hasPassword 
              ? "修改用于进入锻炼计数页面的密码"
              : "设置一个密码用于进入锻炼计数页面，防止孩子自己操作"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                placeholder="至少4个字符"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">确认密码</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="再次输入密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <Button 
              type="submit" 
              className="w-full" 
              disabled={setPasswordMutation.isPending}
            >
              {setPasswordMutation.isPending ? "设置中..." : hasPassword ? "修改密码" : "设置密码"}
            </Button>
            {hasPassword && (
              <Button 
                type="button" 
                variant="outline" 
                className="w-full" 
                onClick={() => setLocation("/exercise/types")}
              >
                取消
              </Button>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
