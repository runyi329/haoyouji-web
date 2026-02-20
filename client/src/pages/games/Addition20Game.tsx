import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Link } from "wouter";
import { ArrowLeft, RotateCcw, Trophy, Clock, Sparkles, Check, X, Settings } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { StarRewardPopup } from "@/components/StarRewardPopup";
import { useState, useCallback, useEffect, useRef } from "react";
import confetti from "canvas-confetti";

// 音效生成函数
const playCorrectSound = () => {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
  oscillator.frequency.setValueAtTime(1000, audioContext.currentTime + 0.1);
  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
  
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.2);
};

const playWrongSound = () => {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  oscillator.frequency.setValueAtTime(300, audioContext.currentTime);
  oscillator.frequency.setValueAtTime(200, audioContext.currentTime + 0.1);
  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
  
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.3);
};

const playVictorySound = () => {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const notes = [523, 659, 784];
  let time = audioContext.currentTime;
  
  notes.forEach((freq) => {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = freq;
    gainNode.gain.setValueAtTime(0.3, time);
    gainNode.gain.exponentialRampToValueAtTime(0.01, time + 0.3);
    
    oscillator.start(time);
    oscillator.stop(time + 0.3);
    time += 0.2;
  });
};

interface Question {
  num1: number;
  num2: number;
  answer: number;
  options: number[];
}

type Difficulty = "easy" | "hard";
type AnswerMode = "choice" | "input";

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "简单",
  hard: "困难",
};

const DIFFICULTY_DESCRIPTIONS: Record<Difficulty, string> = {
  easy: "A+B=C   1个个位数A + 1个介于(10-20)的两位数B",
  hard: "A+B=C   A和B都是介于(10-20)的两位数",
};

export default function Addition20Game() {
  const { isAuthenticated } = useAuth();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [startTime, setStartTime] = useState<number>(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [inputAnswer, setInputAnswer] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  
  // 游戏配置
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [questionCount, setQuestionCount] = useState(10);
  const [answerMode, setAnswerMode] = useState<AnswerMode>("choice");
  
  // 五角星奖励系统
  const [selectedKidId, setSelectedKidId] = useState<number | null>(null);
  const [showReward, setShowReward] = useState(false);
  const [rewardStars, setRewardStars] = useState(0);
  const [rewardKidName, setRewardKidName] = useState("");
  
  // 有奖挑战相关
  const [activeChallenge, setActiveChallenge] = useState<any>(null);
  const [showChallengeComplete, setShowChallengeComplete] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelPassword, setCancelPassword] = useState("");
  
  const { data: specialKids } = trpc.specialKids.list.useQuery();
  const awardStarsMutation = trpc.starRewards.award.useMutation();
  const saveRecordMutation = trpc.addition20.saveRecord.useMutation();
  const utils = trpc.useUtils();

  // 从URL获取kidId
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const kidIdParam = urlParams.get("kidId");
    if (kidIdParam) {
      setSelectedKidId(parseInt(kidIdParam));
    } else {
      const savedKidId = localStorage.getItem("selectedKidId");
      if (savedKidId) {
        setSelectedKidId(parseInt(savedKidId));
      }
    }
  }, []);

  // 获取孩子的游戏配置
  const { data: gameConfig } = trpc.addition20.getConfig.useQuery(
    { kidId: selectedKidId! },
    { enabled: !!selectedKidId }
  );
  
  // 获取活跃的有奖挑战
   const { data: challenge } = trpc.addition20.getActiveChallenge.useQuery(
    { kidId: selectedKidId! },
    { enabled: !!selectedKidId }
  );
  const updateChallengeMutation = trpc.addition20.updateChallengeProgress.useMutation();
  const completeChallengeMutation = trpc.addition20.completeChallenge.useMutation();
  const pauseChallengeMutation = trpc.addition20.pauseChallenge.useMutation();
  const cancelChallengeMutation = trpc.addition20.cancelChallenge.useMutation();

  // 当配置加载完成时更新状态
  useEffect(() => {
    if (gameConfig) {
      setDifficulty(gameConfig.difficulty as Difficulty);
      setQuestionCount(gameConfig.questionCount);
      setAnswerMode(gameConfig.answerMode as AnswerMode);
    }
  }, [gameConfig]);
    // 同步挑战状态
  useEffect(() => {
    if (challenge && challenge.status === "active") {
      setActiveChallenge(challenge);
    } else {
      setActiveChallenge(null);
    }
  }, [challenge]);

  // 获取当前选择的孩子
  const currentKid = specialKids?.find(k => k.id === selectedKidId);

  // 生成题目
  const generateQuestion = useCallback((): Question => {
    let num1: number, num2: number;
    
    switch (difficulty) {
      case "easy":
        // 简单: 1个个位数 + 1个介于(10-20)的两位数
        // 随机交换位置以使题目看起来更随机
        const singleDigit = Math.floor(Math.random() * 10); // 0-9
        const twoDigit = 10 + Math.floor(Math.random() * 11); // 10-20
        if (Math.random() < 0.5) {
          num1 = singleDigit;
          num2 = twoDigit;
        } else {
          num1 = twoDigit;
          num2 = singleDigit;
        }
        break;
      case "hard":
        // 困难: A和B都是介于(10-20)的两位数
        num1 = 10 + Math.floor(Math.random() * 11); // 10-20
        num2 = 10 + Math.floor(Math.random() * 11); // 10-20
        break;
      default:
        num1 = Math.floor(Math.random() * 10);
        num2 = 10 + Math.floor(Math.random() * 11);
    }
    
    const answer = num1 + num2;
    
    // 生成4个选项
    const options = new Set([answer]);
    while (options.size < 4) {
      const offset = Math.floor(Math.random() * 10) - 5;
      const option = answer + offset;
      if (option >= 0 && option !== answer) {
        options.add(option);
      }
    }
    
    return {
      num1,
      num2,
      answer,
      options: Array.from(options).sort(() => Math.random() - 0.5),
    };
  }, [difficulty]);

  // 初始化游戏
  const initializeGame = useCallback(() => {
    // 有奖挑战模式下，使用大量题目（实际上是无限模式）
    const actualQuestionCount = activeChallenge ? 999999 : questionCount;
    const newQuestions = Array.from({ length: actualQuestionCount }, () => generateQuestion());
    setQuestions(newQuestions);
    setCurrentIndex(0);
    setCorrectCount(0);
    setGameStarted(true);
    setGameOver(false);
    setStartTime(Date.now());
    setElapsedTime(0);
    setSelectedAnswer(null);
    setIsCorrect(null);
    setInputAnswer("");
  }, [generateQuestion, questionCount, activeChallenge]);

  // 计时器
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (gameStarted && !gameOver) {
      interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [gameStarted, gameOver, startTime]);

  // 自动聚焦输入框
  useEffect(() => {
    if (gameStarted && !gameOver && answerMode === "input" && inputRef.current) {
      inputRef.current.focus();
    }
  }, [gameStarted, gameOver, answerMode, currentIndex]);

  // 发放奖励
  const grantReward = async () => {
    if (!selectedKidId || !currentKid) return;
    
    try {
      const result = await awardStarsMutation.mutateAsync({
        kidId: selectedKidId,
        activityType: "addition20_complete",
        description: "20加法游戏完成",
      });
      
      if (result.success && result.starsEarned > 0) {
        setRewardStars(result.starsEarned);
        setRewardKidName(currentKid.name);
        setShowReward(true);
        await utils.specialKids.list.invalidate();
      }
    } catch (error) {
      console.error("发放奖励失败", error);
    }
  };

  // 处理答案
  const handleAnswer = (answer: number) => {
    if (!currentQuestion) return;

    const correct = answer === currentQuestion.answer;
    setSelectedAnswer(answer);
    setIsCorrect(correct);

    if (correct) {
      setCorrectCount((c) => c + 1);
      playCorrectSound();
      
      // 有奖挑战模式：更新进度
      if (activeChallenge) {
        const newCorrectCount = activeChallenge.currentCorrectCount + 1;
        
        // 立即更新本地状态
        setActiveChallenge({
          ...activeChallenge,
          currentCorrectCount: newCorrectCount,
          totalAttempted: activeChallenge.totalAttempted + 1,
          totalCorrect: activeChallenge.totalCorrect + 1,
        });
        
        // 同步到后端
        updateChallengeMutation.mutate({
          challengeId: activeChallenge.id,
          currentCorrectCount: newCorrectCount,
          totalAttempted: activeChallenge.totalAttempted + 1,
          totalCorrect: activeChallenge.totalCorrect + 1,
        });
        
        // 检查是否完成挑战
        if (newCorrectCount >= activeChallenge.targetCorrectCount) {
          completeChallengeMutation.mutate({ challengeId: activeChallenge.id });
          setGameOver(true);
          setShowChallengeComplete(true);
          playVictorySound();
          
          // 触发彩色纸片动画
          const duration = 3000;
          const end = Date.now() + duration;
          
          const frame = () => {
            confetti({
              particleCount: 5,
              angle: 60,
              spread: 55,
              origin: { x: 0 },
              colors: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8']
            });
            confetti({
              particleCount: 5,
              angle: 120,
              spread: 55,
              origin: { x: 1 },
              colors: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8']
            });
            
            if (Date.now() < end) {
              requestAnimationFrame(frame);
            }
          };
          frame();
          
          return;
        }
      }
    } else {
      playWrongSound();
      
      // 有奖挑战模式：答错扣减进度
      if (activeChallenge) {
        const newCorrectCount = Math.max(0, activeChallenge.currentCorrectCount - activeChallenge.penaltyPerWrong);
        
        // 立即更新本地状态
        setActiveChallenge({
          ...activeChallenge,
          currentCorrectCount: newCorrectCount,
          totalAttempted: activeChallenge.totalAttempted + 1,
          totalWrong: activeChallenge.totalWrong + 1,
        });
        
        // 同步到后端
        updateChallengeMutation.mutate({
          challengeId: activeChallenge.id,
          currentCorrectCount: newCorrectCount,
          totalAttempted: activeChallenge.totalAttempted + 1,
          totalWrong: activeChallenge.totalWrong + 1,
        });
      }
    }

    setTimeout(() => {
      if (!activeChallenge && currentIndex < questionCount - 1) {
        // 普通模式：继续下一题
        setCurrentIndex((i) => i + 1);
        setSelectedAnswer(null);
        setIsCorrect(null);
        setInputAnswer("");
      } else if (activeChallenge) {
        // 有奖挑战模式：生成新题
        const newQuestion = generateQuestion();
        setQuestions([newQuestion]);
        setCurrentIndex(0);
        setSelectedAnswer(null);
        setIsCorrect(null);
        setInputAnswer("");
      } else {
        // 游戏结束
        setGameOver(true);
        const finalCorrectCount = correct ? correctCount + 1 : correctCount;
        
        // 保存记录
        if (selectedKidId) {
          saveRecordMutation.mutate({
            kidId: selectedKidId,
            difficulty,
            questionCount,
            correctCount: finalCorrectCount,
            duration: elapsedTime,
            answerMode,
            starsEarned: finalCorrectCount === questionCount ? 1 : 0,
          });
        }
        
        // 全部答对才发放奖励
        if (finalCorrectCount === questionCount) {
          playVictorySound();
          setTimeout(() => grantReward(), 500);
        }
      }
    }, 1000);
  };

  // 处理输入提交
  const handleInputSubmit = () => {
    const answer = parseInt(inputAnswer);
    if (!isNaN(answer)) {
      handleAnswer(answer);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const currentQuestion = questions[currentIndex];
  const accuracy = questionCount > 0 ? Math.round((correctCount / (currentIndex + (gameOver ? 0 : 1))) * 100) : 0;

  return (
    <div className="min-h-screen bg-background pb-20">
      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-20px); }
        }
        .animate-float {
          animation: bounce 2s ease-in-out infinite;
        }
      `}</style>
      
      {/* 顶部导航 */}
      <header className="z-50 glass border-b border-border/50">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center">
            <Link href="/games">
              <Button variant="ghost" size="icon" className="mr-2">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h1 className="font-bold text-lg">20加法</h1>
          </div>
          {gameStarted && (
            <Button variant="ghost" size="icon" onClick={initializeGame}>
              <RotateCcw className="w-5 h-5" />
            </Button>
          )}
        </div>
      </header>

      <main className="container py-6">
        {!gameStarted ? (
          /* 开始界面 */
          <div className="text-center py-8">
            <div className="w-24 h-24 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-orange-400 to-red-600 flex items-center justify-center animate-float">
              <span className="text-5xl">➕</span>
            </div>
            <h2 className="text-2xl font-bold mb-2">20加法</h2>
            <p className="text-muted-foreground mb-6">完成全部题目获得1颗五角星！</p>

            {/* 移除孩子选择，只显示当前登录的孩子 */}

            {/* 有奖挑战提示 */}
            {activeChallenge && (
              <Card className="p-4 mb-6 max-w-md mx-auto bg-gradient-to-br from-amber-50 to-orange-50 border-[#FFA726]">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-[#CBA471]" />
                    <h3 className="font-semibold text-[#FFA726]">继续挑战</h3>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-[#D32F2F] hover:text-[#D32F2F] hover:bg-[#FFEBEE]"
                    onClick={() => setShowCancelDialog(true)}
                  >
                    放弃挑战
                  </Button>
                </div>
                {activeChallenge.rewardImageUrl && (
                  <div className="mb-3">
                    <img 
                      src={activeChallenge.rewardImageUrl} 
                      alt="奖品" 
                      className="w-20 h-20 mx-auto rounded-lg object-cover border-2 border-[#FFA726]"
                    />
                  </div>
                )}
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[#CBA471]">奖品：</span>
                    <span className="font-medium text-[#FFA726]">{activeChallenge.rewardTitle}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#CBA471]">当前进度：</span>
                    <span className="font-medium text-[#FFA726]">
                      {activeChallenge.currentCorrectCount} / {activeChallenge.targetCorrectCount} 题
                    </span>
                  </div>
                  <div className="w-full h-2 bg-[#FAF3ED] rounded-full overflow-hidden mt-2">
                    <div
                      className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all"
                      style={{ width: `${(activeChallenge.currentCorrectCount / activeChallenge.targetCorrectCount) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-[#CBA471] mt-2">
                    还差 {activeChallenge.targetCorrectCount - activeChallenge.currentCorrectCount} 题就可以获得奖品！
                  </p>
                </div>
              </Card>
            )}
            
            {/* 游戏配置显示 */}
            <Card className="p-4 mb-6 max-w-md mx-auto text-left">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  游戏设置
                </h3>
                <Link href={`/parent/addition20-config?kidId=${selectedKidId}`} onClick={() => {
                  if (currentKid) {
                    localStorage.setItem('selectedKid', JSON.stringify(currentKid));
                  }
                }}>
                  <Button variant="outline" size="sm" disabled={!selectedKidId}>
                    修改设置
                  </Button>
                </Link>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">难度：</span>
                  <span className="font-medium">{DIFFICULTY_LABELS[difficulty]}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">题目数量：</span>
                  <span className="font-medium">{questionCount} 题</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">答题方式：</span>
                  <span className="font-medium">{answerMode === "choice" ? "选择题" : "手写输入"}</span>
                </div>
              </div>
            </Card>

            <div className="flex gap-3 justify-center">
              {/* 普通模式按钮 */}
              <Button
                size="lg"
                className="bg-gradient-to-r from-orange-400 to-red-600 text-white px-12"
                onClick={() => {
                  // 普通模式：不使用挑战
                  setActiveChallenge(null);
                  initializeGame();
                }}
                disabled={!selectedKidId}
              >
                <Sparkles className="w-5 h-5 mr-2" />
                开始游戏
              </Button>
              
              {/* 挑战模式按钮 */}
              {activeChallenge && (
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-amber-400 to-orange-600 text-white px-12"
                  onClick={initializeGame}
                  disabled={!selectedKidId}
                >
                  <Trophy className="w-5 h-5 mr-2" />
                  继续挑战
                </Button>
              )}
            </div>
            
            {!selectedKidId && (
              <p className="text-sm text-muted-foreground mt-4">请先选择玩游戏的孩子</p>
            )}
          </div>
        ) : gameOver ? (
          /* 结束界面 */
          <div className="text-center py-12">
            {showChallengeComplete && activeChallenge ? (
              /* 挑战完成界面 */
              <>
                <div className="w-40 h-40 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-amber-400 to-orange-600 p-2 animate-bounce shadow-2xl">
                  {activeChallenge.rewardImageUrl ? (
                    <img 
                      src={activeChallenge.rewardImageUrl} 
                      alt="奖品" 
                      className="w-full h-full rounded-2xl object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Trophy className="w-20 h-20 text-white" />
                    </div>
                  )}
                </div>
                <h2 className="text-3xl font-bold mb-4 text-[#CBA471]">🎉 挑战完成！</h2>
                <Card className="max-w-md mx-auto p-6 mb-6 bg-gradient-to-br from-amber-50 to-orange-50 border-[#FFA726]">
                  <h3 className="text-2xl font-bold text-[#FFA726] mb-4">
                    你赢得了：{activeChallenge.rewardTitle}
                  </h3>
                  <div className="space-y-2 text-sm text-[#CBA471]">
                    <p>累计答对：{activeChallenge.targetCorrectCount} 题</p>
                    <p>总答题次数：{activeChallenge.totalAttempted} 次</p>
                    <p>正确率：{Math.round((activeChallenge.totalCorrect / activeChallenge.totalAttempted) * 100)}%</p>
                  </div>
                </Card>
                <p className="text-lg text-muted-foreground mb-6">
                  太棒了！快去找爸爸妈妈领取奖品吧！
                </p>
                <div className="flex gap-4 justify-center">
                  <Link href="/games">
                    <Button size="lg" className="bg-gradient-to-r from-amber-400 to-orange-600">
                      返回游戏列表
                    </Button>
                  </Link>
                </div>
              </>
            ) : (
              /* 普通游戏结束 */
              <>
                <div className="w-24 h-24 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center">
                  <Trophy className="w-12 h-12 text-white" />
                </div>
                <h2 className="text-2xl font-bold mb-2">游戏结束！</h2>
                <div className="space-y-2 mb-8">
                  <p className="text-lg">
                    答对 <span className="text-primary font-bold">{correctCount}</span> / {questionCount} 题
                  </p>
                  <p className="text-muted-foreground">
                    用时: {formatTime(elapsedTime)} · 正确率: {Math.round((correctCount / questionCount) * 100)}%
                  </p>
                  <p className="text-sm text-muted-foreground">
                    难度: {DIFFICULTY_LABELS[difficulty]} · 模式: {answerMode === "choice" ? "选择题" : "手写输入"}
                  </p>
                </div>
                <div className="flex gap-4 justify-center">
                  <Link href="/games">
                    <Button variant="outline">返回游戏列表</Button>
                  </Link>
                  <Button onClick={initializeGame}>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    再玩一次
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : (
          /* 游戏界面 */
          <div>
            {/* 有奖挑战模式提示 */}
            {activeChallenge && (
              <Card className="p-4 mb-4 bg-gradient-to-br from-amber-50 to-orange-50 border-[#FFA726]">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-[#CBA471]" />
                    <span className="font-semibold text-[#FFA726]">有奖挑战进行中</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      pauseChallengeMutation.mutate({ challengeId: activeChallenge.id });
                      toast.success("已保存进度，下次继续！");
                      window.location.href = `/games?kidId=${selectedKidId}`;
                    }}
                    className="border-[#FFA726] text-[#CBA471] hover:bg-[#FAF3ED]"
                  >
                    休息保存
                  </Button>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[#CBA471]">奖品：{activeChallenge.rewardTitle}</span>
                    <span className="font-semibold text-[#FFA726]">
                      {activeChallenge.currentCorrectCount} / {activeChallenge.targetCorrectCount} 题
                    </span>
                  </div>
                  <div className="w-full h-3 bg-[#FAF3ED] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-300"
                      style={{ width: `${(activeChallenge.currentCorrectCount / activeChallenge.targetCorrectCount) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-[#CBA471]">
                    还差 {activeChallenge.targetCorrectCount - activeChallenge.currentCorrectCount} 题就可以获得奖品啦！
                  </p>
                </div>
              </Card>
            )}
            
            {/* 进度条和状态 */}
            {!activeChallenge && (
              <>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="w-4 h-4" />
                      <span>{formatTime(elapsedTime)}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {currentIndex + 1} / {questionCount}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">正确: {correctCount}</span>
                    <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                      {DIFFICULTY_LABELS[difficulty]}
                    </span>
                  </div>
                </div>

                {/* 进度条 */}
                <div className="w-full h-2 bg-muted rounded-full mb-8 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-orange-400 to-red-600 transition-all duration-300"
                    style={{ width: `${((currentIndex + 1) / questionCount) * 100}%` }}
                  />
                </div>
              </>
            )}

            {/* 题目卡片 */}
            {currentQuestion && (
              <Card className="p-8 mb-6">
                <div className="text-center">
                  <div className="text-6xl font-bold mb-8 flex items-center justify-center gap-4">
                    <span className="text-primary">{currentQuestion.num1}</span>
                    <span className="text-[#CBA471]">+</span>
                    <span className="text-primary">{currentQuestion.num2}</span>
                    <span className="text-muted-foreground">=</span>
                    <span className="text-4xl text-muted-foreground">?</span>
                  </div>

                  {/* 选择题模式 */}
                  {answerMode === "choice" && (
                    <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                      {currentQuestion.options.map((option, index) => {
                        const isSelected = selectedAnswer === option;
                        const showResult = selectedAnswer !== null;
                        const isCorrectOption = option === currentQuestion.answer;
                        
                        let buttonClass = "p-6 text-2xl font-bold transition-all ";
                        if (showResult) {
                          if (isCorrectOption) {
                            buttonClass += "bg-[#4CAF50] text-white border-[#4CAF50]";
                          } else if (isSelected && !isCorrectOption) {
                            buttonClass += "bg-[#D32F2F] text-white border-[#D32F2F]";
                          } else {
                            buttonClass += "opacity-50";
                          }
                        } else {
                          buttonClass += "hover:bg-primary/10 hover:border-primary";
                        }
                        
                        return (
                          <Button
                            key={index}
                            variant="outline"
                            className={buttonClass}
                            onClick={() => handleAnswer(option)}
                            disabled={selectedAnswer !== null}
                          >
                            {option}
                            {showResult && isCorrectOption && (
                              <Check className="w-6 h-6 ml-2" />
                            )}
                            {showResult && isSelected && !isCorrectOption && (
                              <X className="w-6 h-6 ml-2" />
                            )}
                          </Button>
                        );
                      })}
                    </div>
                  )}

                  {/* 手写输入模式 */}
                  {answerMode === "input" && (
                    <div className="max-w-xs mx-auto">
                      <div className="flex gap-2">
                        <Input
                          ref={inputRef}
                          type="number"
                          value={inputAnswer}
                          onChange={(e) => setInputAnswer(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              handleInputSubmit();
                            }
                          }}
                          placeholder="输入答案"
                          className="text-center text-2xl h-14"
                          disabled={selectedAnswer !== null}
                        />
                        <Button
                          size="lg"
                          className="h-14 px-8"
                          onClick={handleInputSubmit}
                          disabled={selectedAnswer !== null || !inputAnswer}
                        >
                          确定
                        </Button>
                      </div>
                      {selectedAnswer !== null && (
                        <div className={`mt-4 p-3 rounded-lg ${isCorrect ? "bg-[#E8F5E9] text-[#4CAF50]" : "bg-[#FFEBEE] text-[#D32F2F]"}`}>
                          {isCorrect ? (
                            <div className="flex items-center justify-center gap-2">
                              <Check className="w-5 h-5" />
                              <span>回答正确！</span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-2">
                              <X className="w-5 h-5" />
                              <span>正确答案是 {currentQuestion.answer}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>
        )}
      </main>

      {/* 星星奖励弹窗 */}
      <StarRewardPopup
        open={showReward}
        onClose={() => setShowReward(false)}
        stars={rewardStars}
        activityName="20加法游戏"
        kidName={rewardKidName}
      />
      
      {/* 放弃挑战对话框 */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>放弃挑战</DialogTitle>
            <DialogDescription>
              确定要放弃当前的有奖挑战吗？请输入家长密码确认。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">家长密码</label>
              <Input
                type="password"
                value={cancelPassword}
                onChange={(e) => setCancelPassword(e.target.value)}
                placeholder="请输入密码"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => {
                setShowCancelDialog(false);
                setCancelPassword("");
              }}>
                取消
              </Button>
              <Button 
                variant="destructive"
                onClick={() => {
                  if (!activeChallenge) return;
                  
                  cancelChallengeMutation.mutate(
                    { 
                      challengeId: activeChallenge.id,
                      password: cancelPassword
                    },
                    {
                      onSuccess: () => {
                        toast.success("已放弃挑战");
                        setActiveChallenge(null);
                        setShowCancelDialog(false);
                        setCancelPassword("");
                        utils.addition20.getActiveChallenge.invalidate();
                      },
                      onError: (error) => {
                        toast.error(error.message || "放弃失败");
                      }
                    }
                  );
                }}
                disabled={!cancelPassword || cancelChallengeMutation.isPending}
              >
                {cancelChallengeMutation.isPending ? "处理中..." : "确认放弃"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
