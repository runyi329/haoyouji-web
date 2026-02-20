import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Save, Settings, Info } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import ChallengeDialog from "@/components/ChallengeDialog";

type Difficulty = "easy" | "hard";
type AnswerMode = "choice" | "input";

const DIFFICULTY_OPTIONS: { value: Difficulty; label: string; description: string }[] = [
  {
    value: "easy",
    label: "简单",
    description: "A+B=C   1个个位数A + 1个介于(10-20)的两位数B",
  },
  {
    value: "hard",
    label: "困难",
    description: "A+B=C   A和B都是介于(10-20)的两位数",
  },
];

const QUESTION_COUNT_MARKS = [10, 20, 30, 40, 50];

export default function Addition20Config() {
  const { user, isAuthenticated } = useAuth();
  const authLoading = false; // useAuth doesn't provide isLoading
  const [, navigate] = useLocation();
  
  // 从URL获取kidId
  const urlParams = new URLSearchParams(window.location.search);
  const kidIdParam = urlParams.get("kidId");
  const kidId = kidIdParam ? parseInt(kidIdParam) : null;
  
  // 配置状态
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [questionCount, setQuestionCount] = useState(10);
  const [answerMode, setAnswerMode] = useState<AnswerMode>("choice");
  const [hasChanges, setHasChanges] = useState(false);
  const [showChallengeDialog, setShowChallengeDialog] = useState(false);
  
  // 获取当前登录用户的小孩列表
  const { data: specialKids } = trpc.specialKids.list.useQuery();
  
  // 获取当前小孩信息（只显示当前登录的小孩）
  const currentKid = specialKids?.find(k => k.id === kidId);
  
  // 获取当前配置
  const { data: config, isLoading: configLoading } = trpc.addition20.getConfig.useQuery(
    { kidId: kidId! },
    { enabled: !!kidId && !!currentKid }
  );
  
  // 保存配置
  const saveConfigMutation = trpc.addition20.saveConfig.useMutation({
    onSuccess: () => {
      toast.success("配置已保存");
      setHasChanges(false);
    },
    onError: (error) => {
      toast.error(error.message || "保存失败");
    },
  });
  
  // 加载配置
  useEffect(() => {
    if (config) {
      setDifficulty(config.difficulty as Difficulty);
      setQuestionCount(config.questionCount);
      setAnswerMode(config.answerMode as AnswerMode);
    }
  }, [config]);
  
  // 权限检查
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/login");
    }
  }, [authLoading, isAuthenticated, navigate]);
  
  // 检查是否有权限
  const canEdit = user?.role === "super_admin" || user?.role === "parent";
  
  const handleSave = () => {
    if (!kidId || !currentKid) {
      toast.error("请从游戏页面进入设置");
      return;
    }
    
    saveConfigMutation.mutate({
      kidId,
      difficulty,
      questionCount,
      answerMode,
    });
  };
  
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }
  
  if (!kidId || !currentKid) {
    return (
      <div className="min-h-screen bg-background">
        <header className="z-50 glass border-b border-border/50">
          <div className="container flex items-center h-14">
            <Link href="/games">
              <Button variant="ghost" size="icon" className="mr-2">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h1 className="font-bold text-lg">20加法设置</h1>
          </div>
        </header>
        <main className="container py-6">
          <Card className="p-6 text-center">
            <p className="text-muted-foreground">请从游戏页面进入设置</p>
            <Link href="/games">
              <Button className="mt-4">返回游戏列表</Button>
            </Link>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* 顶部导航 */}
      <header className="z-50 glass border-b border-border/50">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center">
            <Link href={`/games/addition20?kidId=${kidId}`}>
              <Button variant="ghost" size="icon" className="mr-2">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h1 className="font-bold text-lg">20加法设置</h1>
          </div>
          {canEdit && (
            <Button 
              onClick={handleSave} 
              disabled={!hasChanges || saveConfigMutation.isPending}
              size="sm"
            >
              <Save className="w-4 h-4 mr-2" />
              保存
            </Button>
          )}
        </div>
      </header>

      <main className="container py-6 space-y-6">
        {/* 难度设置 */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-lg">题型难度</h3>
          </div>
          
          <RadioGroup
            value={difficulty}
            onValueChange={(value) => {
              setDifficulty(value as Difficulty);
              setHasChanges(true);
            }}
            className="space-y-3"
            disabled={!canEdit}
          >
            {DIFFICULTY_OPTIONS.map((option) => (
              <div
                key={option.value}
                className={`flex items-start space-x-3 p-4 rounded-lg border transition-colors ${
                  difficulty === option.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <RadioGroupItem value={option.value} id={option.value} className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor={option.value} className="font-medium cursor-pointer">
                    {option.label}
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">{option.description}</p>
                </div>
              </div>
            ))}
          </RadioGroup>
        </Card>

        {/* 题目数量设置 */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Info className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-lg">题目数量</h3>
          </div>
          
          <div className="space-y-6">
            <div className="text-center">
              <span className="text-4xl font-bold text-primary">{questionCount}</span>
              <span className="text-lg text-muted-foreground ml-2">题</span>
            </div>
            
            <Slider
              value={[questionCount]}
              onValueChange={(value) => {
                setQuestionCount(value[0]);
                setHasChanges(true);
              }}
              min={10}
              max={50}
              step={10}
              disabled={!canEdit}
              className="w-full"
            />
            
            <div className="flex justify-between text-sm text-muted-foreground">
              {QUESTION_COUNT_MARKS.map((mark) => (
                <span key={mark} className={questionCount === mark ? "text-primary font-medium" : ""}>
                  {mark}
                </span>
              ))}
            </div>
          </div>
        </Card>

        {/* 答题方式设置 */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-lg">答题方式</h3>
          </div>
          
          <RadioGroup
            value={answerMode}
            onValueChange={(value) => {
              setAnswerMode(value as AnswerMode);
              setHasChanges(true);
            }}
            className="grid grid-cols-3 gap-4"
          >
            <div
              className={`flex flex-col items-center p-6 rounded-lg border transition-colors ${canEdit ? 'cursor-pointer' : ''} ${
                answerMode === "choice"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
              onClick={() => {
                if (canEdit) {
                  setAnswerMode("choice");
                  setHasChanges(true);
                }
              }}
            >
              <RadioGroupItem value="choice" id="choice" className="sr-only" />
              <div className="text-4xl mb-3">🔘</div>
              <Label htmlFor="choice" className="font-medium cursor-pointer">选择题</Label>
              <p className="text-xs text-muted-foreground mt-1 text-center">4选1，适合初学者</p>
            </div>
            
            <div
              className={`flex flex-col items-center p-6 rounded-lg border transition-colors ${canEdit ? 'cursor-pointer' : ''} ${
                answerMode === "input"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
              onClick={() => {
                if (canEdit) {
                  setAnswerMode("input");
                  setHasChanges(true);
                }
              }}
            >
              <RadioGroupItem value="input" id="input" className="sr-only" />
              <div className="text-4xl mb-3">✒️</div>
              <Label htmlFor="input" className="font-medium cursor-pointer">手写输入</Label>
              <p className="text-xs text-muted-foreground mt-1 text-center">输入答案，更有挑战</p>
            </div>
            
            <div
              className={`flex flex-col items-center p-6 rounded-lg border transition-colors ${canEdit ? 'cursor-pointer' : ''} border-[#FFA726] hover:border-[#FFA726] bg-gradient-to-br from-amber-50 to-orange-50`}
              onClick={() => {
                if (canEdit) {
                  setShowChallengeDialog(true);
                }
              }}
            >
              <div className="text-4xl mb-3">🏆</div>
              <Label className="font-medium cursor-pointer text-[#CBA471]">有奖挑战</Label>
              <p className="text-xs text-[#CBA471] mt-1 text-center">设置奖品和目标</p>
            </div>
          </RadioGroup>
        </Card>

        {/* 保存按钮（移动端底部固定） */}
        {canEdit && (
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border md:hidden">
            <Button 
              onClick={handleSave} 
              disabled={!hasChanges || saveConfigMutation.isPending}
              className="w-full"
              size="lg"
            >
              <Save className="w-5 h-5 mr-2" />
              保存设置
            </Button>
          </div>
        )}
        
        {!canEdit && (
          <Card className="p-4 bg-[#FAF3ED] border-[#FFA726]">
            <p className="text-sm text-[#CBA471] text-center">
              只有家长可以修改游戏设置
            </p>
          </Card>
        )}
        
        {configLoading && (
          <div className="flex justify-center py-8">
            <div className="animate-spin w-6 h-6 border-3 border-primary border-t-transparent rounded-full" />
          </div>
        )}
      </main>

      {/* 有奖挑战设置对话框 */}
      {kidId && currentKid && (
        <ChallengeDialog
          open={showChallengeDialog}
          onOpenChange={setShowChallengeDialog}
          kidId={kidId}
          kidName={currentKid.name}
          onSuccess={() => {
            toast.success("挑战创建成功！");
          }}
        />
      )}
    </div>
  );
}
