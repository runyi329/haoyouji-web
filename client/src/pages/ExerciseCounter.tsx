import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Lock, Plus, Minus, Save } from "lucide-react";

export default function ExerciseCounter() {
  // const { toast } = useToast(); // 已改用sonner的toast
  const [, params] = useRoute("/exercise/counter/:id");
  const [, setLocation] = useLocation();
  
  const exerciseTypeId = params?.id ? parseInt(params.id) : 0;
  
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(true);
  const [password, setPassword] = useState("");
  const [isVerified, setIsVerified] = useState(false);
  const [count, setCount] = useState(0);
  const [todayDate] = useState(() => new Date().toISOString().split('T')[0]);

  // 获取锻炼项目信息
  const { data: exerciseTypes = [] } = trpc.exercise.getTypes.useQuery();
  const exerciseType = exerciseTypes.find(t => t.id === exerciseTypeId);

  // 获取今天的记录
  const { data: todayRecords = [] } = trpc.exercise.getRecords.useQuery(
    {
      exerciseTypeId,
      startDate: todayDate,
      endDate: todayDate,
    },
    { enabled: isVerified }
  );

  // 验证密码
  const verifyMutation = trpc.exercise.verifyPassword.useMutation({
    onSuccess: (data) => {
      if (data.isValid) {
        setIsVerified(true);
        setIsPasswordDialogOpen(false);
        toast.success("验证成功，欢迎使用锻炼计数器");
      } else {
        toast.error("密码错误，请重新输入");
      }
    },
    onError: (error) => {
      toast.error(`验证失败: ${error.message}`);
    },
  });

  // 保存记录
  const saveMutation = trpc.exercise.saveRecord.useMutation({
    onSuccess: () => {
      toast.success(`已保存今天的锻炼记录：${count}次`);
      setLocation("/exercise/types");
    },
    onError: (error) => {
      toast.error(`保存失败: ${error.message}`);
    },
  });

  // 加载今天的记录
  useEffect(() => {
    if (todayRecords.length > 0) {
      setCount(todayRecords[0].count);
    }
  }, [todayRecords]);

  const handleVerify = () => {
    if (!password) {
      toast.error("请输入密码");
      return;
    }
    verifyMutation.mutate({ password });
  };

  const handleIncrement = () => {
    setCount(prev => prev + 1);
  };

  const handleDecrement = () => {
    setCount(prev => Math.max(0, prev - 1));
  };

  const handleSave = () => {
    saveMutation.mutate({
      exerciseTypeId,
      count,
      recordDate: todayDate,
    });
  };

  if (!exerciseType) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-lg mb-4">找不到该锻炼项目</p>
            <Button onClick={() => setLocation("/exercise/types")}>返回</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-100 p-4">
      {/* 密码验证对话框 */}
      <Dialog open={isPasswordDialogOpen} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <DialogTitle className="text-center">家长验证</DialogTitle>
            <DialogDescription className="text-center">
              请输入家长密码以继续
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                placeholder="请输入密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleVerify();
                  }
                }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setLocation("/exercise/types")} className="w-full sm:w-auto">
              取消
            </Button>
            <Button onClick={handleVerify} disabled={verifyMutation.isPending} className="w-full sm:w-auto">
              {verifyMutation.isPending ? "验证中..." : "确认"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 计数器界面 */}
      {isVerified && (
        <div className="container max-w-2xl mx-auto py-8">
          <Card className="shadow-xl">
            <CardHeader className="text-center pb-4">
              <div className="text-6xl mb-4">{exerciseType.icon}</div>
              <CardTitle className="text-3xl">{exerciseType.name}</CardTitle>
              <CardDescription className="text-lg">
                {new Date(todayDate).toLocaleDateString('zh-CN', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              {/* 计数显示 */}
              <div className="text-center">
                <div className="text-8xl font-bold text-primary mb-4">
                  {count}
                </div>
                <p className="text-xl text-muted-foreground">次</p>
              </div>

              {/* 操作按钮 */}
              <div className="grid grid-cols-2 gap-4">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-24 text-2xl"
                  onClick={handleDecrement}
                  disabled={count === 0}
                >
                  <Minus className="mr-2 h-8 w-8" />
                  减少
                </Button>
                <Button
                  size="lg"
                  className="h-24 text-2xl"
                  onClick={handleIncrement}
                >
                  <Plus className="mr-2 h-8 w-8" />
                  增加
                </Button>
              </div>

              {/* 保存按钮 */}
              <Button
                size="lg"
                className="w-full h-16 text-xl"
                onClick={handleSave}
                disabled={saveMutation.isPending}
              >
                <Save className="mr-2 h-6 w-6" />
                {saveMutation.isPending ? "保存中..." : "保存记录"}
              </Button>

              {/* 返回按钮 */}
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => setLocation("/exercise/types")}
              >
                返回项目列表
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
