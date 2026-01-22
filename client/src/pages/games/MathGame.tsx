import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowLeft, RotateCcw, Trophy, Clock, Sparkles, Check, X } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { StarRewardPopup } from "@/components/StarRewardPopup";
import { useState, useCallback, useEffect } from "react";

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

const playFailVoice = () => {
  const audio = new Audio('/sounds/fail-voice.wav');
  audio.play().catch(() => {
    // 如果音频文件不存在，忽略错误
  });
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
  operator: "+" | "-";
  answer: number;
  options: number[];
}

// 难度等级定义
const DIFFICULTY_LEVELS = [
  { id: 1, name: "10以内加法", description: "1-10的加法", maxNum: 10, operators: ["+"] as const },
  { id: 2, name: "10以内加减法", description: "1-10的加减法", maxNum: 10, operators: ["+", "-"] as const },
  { id: 3, name: "20以内加法", description: "1-20的加法", maxNum: 20, operators: ["+"] as const },
  { id: 4, name: "20以内加减法", description: "1-20的加减法", maxNum: 20, operators: ["+", "-"] as const },
  { id: 5, name: "100以内加法", description: "1-100的加法", maxNum: 100, operators: ["+"] as const },
  { id: 6, name: "100以内加减法", description: "1-100的加减法", maxNum: 100, operators: ["+", "-"] as const },
];

export default function MathGame() {
  const { isAuthenticated } = useAuth();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [startTime, setStartTime] = useState<number>(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [selectedDifficulty, setSelectedDifficulty] = useState(1);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [gameFailed, setGameFailed] = useState(false); // 游戏是否失败
  
  // 五角星奖励系统
  const [selectedKidId, setSelectedKidId] = useState<number | null>(null);
  const [showReward, setShowReward] = useState(false);
  const [rewardStars, setRewardStars] = useState(0);
  const [rewardKidName, setRewardKidName] = useState("");
  
  const { data: specialKids } = trpc.specialKids.list.useQuery();
  const { data: rewardRules } = trpc.starRules.list.useQuery();
  const awardStarsMutation = trpc.starRewards.award.useMutation();
  const addWrongQuestion = trpc.wrongQuestions.add.useMutation();
  const utils = trpc.useUtils();

  // 从localStorage读取选择的孩子
  useEffect(() => {
    const savedKidId = localStorage.getItem("selectedKidId");
    if (savedKidId) {
      setSelectedKidId(parseInt(savedKidId));
    }
  }, []);

  // 游戏失败时播放AI语音
  useEffect(() => {
    if (gameFailed && gameOver) {
      playFailVoice();
    }
  }, [gameFailed, gameOver]);

  // 游戏成功时播放胜利音效
  useEffect(() => {
    if (!gameFailed && gameOver) {
      playVictorySound();
    }
  }, [gameFailed, gameOver]);

  // 获取当前选择的孩子
  const currentKid = specialKids?.find(k => k.id === selectedKidId);

  // 发放奖励
  const grantReward = async () => {
    if (!selectedKidId || !currentKid) return;
    
    try {
      const result = await awardStarsMutation.mutateAsync({
        kidId: selectedKidId,
        activityType: "math_win",
        description: "数学问答获胜",
      });
      
      if (result.success && result.starsEarned > 0) {
        setRewardStars(result.starsEarned);
        setRewardKidName(currentKid.name);
        setShowReward(true);
        // 立即失效缓存，强制重新获取
        await utils.specialKids.list.invalidate();
      }
    } catch (error) {
      console.error("发放奖励失败", error);
    }
  };

  const saveRecord = trpc.games.saveRecord.useMutation({
    onSuccess: (data) => {
      if (data.pointsEarned > 0) {
        toast.success(`恭喜获得 ${data.pointsEarned} 积分！`);
      }
    },
  });

  const totalQuestions = 10;
  const difficulty = DIFFICULTY_LEVELS.find(d => d.id === selectedDifficulty)!;

  const generateQuestion = useCallback((): Question => {
    const operator = difficulty.operators[Math.floor(Math.random() * difficulty.operators.length)];
    let num1 = Math.floor(Math.random() * difficulty.maxNum) + 1;
    let num2 = Math.floor(Math.random() * difficulty.maxNum) + 1;
    
    // 确保减法不会出现负数
    if (operator === "-" && num2 > num1) {
      [num1, num2] = [num2, num1];
    }
    
    const answer = operator === "+" ? num1 + num2 : num1 - num2;
    const options = new Set([answer]);
    
    while (options.size < 4) {
      const offset = Math.floor(Math.random() * 10) - 5;
      const option = answer + offset;
      if (option > 0 && option !== answer) {
        options.add(option);
      }
    }
    
    return {
      num1,
      num2,
      operator,
      answer,
      options: Array.from(options).sort(() => Math.random() - 0.5),
    };
  }, [difficulty]);

  const initializeGame = useCallback(() => {
    const newQuestions = Array.from({ length: totalQuestions }, () => generateQuestion());
    setQuestions(newQuestions);
    setCurrentIndex(0);
    setCorrectCount(0);
    setGameStarted(true);
    setGameOver(false);
    setGameFailed(false);
    setStartTime(Date.now());
    setElapsedTime(0);
    setSelectedAnswer(null);
    setIsCorrect(null);
  }, [generateQuestion]);

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

  const handleAnswer = (option: number) => {
    if (!currentQuestion) return;

    const correct = option === currentQuestion.answer;
    setSelectedAnswer(option);
    setIsCorrect(correct);

    if (correct) {
      setCorrectCount((c) => c + 1);
      playCorrectSound(); // 答对音效
    } else {
      // 答错即失败
      setGameFailed(true);
      playWrongSound(); // 答错音效
      
      // 记录错题到错题本
      if (selectedKidId) {
        addWrongQuestion.mutate({
          kidId: selectedKidId,
          gameType: "math",
          questionData: JSON.stringify({
            num1: currentQuestion.num1,
            num2: currentQuestion.num2,
            operator: currentQuestion.operator,
            difficulty: selectedDifficulty,
          }),
          userAnswer: option.toString(),
          correctAnswer: currentQuestion.answer.toString(),
        });
      }
    }

    setTimeout(() => {
      if (!correct) {
        // 答错，游戏结束
        setGameOver(true);
        if (isAuthenticated) {
          saveRecord.mutate({
            gameType: "math",
            score: correctCount,
            level: selectedDifficulty,
            duration: elapsedTime,
          });
        }
      } else if (currentIndex < totalQuestions - 1) {
        setCurrentIndex((i) => i + 1);
        setSelectedAnswer(null);
        setIsCorrect(null);
      } else {
        // 完成10题，游戏结束
        setGameOver(true);
        
        if (isAuthenticated) {
          saveRecord.mutate({
            gameType: "math",
            score: correctCount + 1,
            level: selectedDifficulty,
            duration: elapsedTime,
          });
        }
        
        // 完成10题，发放奖励
        setTimeout(() => grantReward(), 500);
      }
    }, 1000);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const currentQuestion = questions[currentIndex];

  return (
    <div className="min-h-screen bg-background pb-20">
      <style>{`
        @keyframes spin {
          from { transform: rotateZ(0deg); }
          to { transform: rotateZ(360deg); }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-20px); }
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
            <h1 className="font-bold text-lg">数学问答</h1>
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
          <div className="text-center py-12">
            <div className="w-24 h-24 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center animate-float">
              <span className="text-5xl">🔢</span>
            </div>
            <h2 className="text-2xl font-bold mb-2">数学问答</h2>
            <p className="text-muted-foreground mb-8">完成10题获得1颗五角星！</p>

            {/* 孩子选择 */}
            {specialKids && specialKids.length > 0 && (
              <div className="mb-8">
                <p className="text-sm text-muted-foreground mb-3">谁在玩游戏？</p>
                <div className="flex gap-4 justify-center">
                  {specialKids.map((kid) => (
                    <button
                      key={kid.id}
                      onClick={() => {
                        setSelectedKidId(kid.id);
                        localStorage.setItem("selectedKidId", kid.id.toString());
                      }}
                      className={`flex flex-col items-center gap-2 p-3 rounded-xl transition-all ${
                        selectedKidId === kid.id
                          ? "ring-2 ring-primary bg-primary/10"
                          : "hover:bg-muted"
                      }`}
                    >
                      <img
                        src={kid.avatar || ""}
                        alt={kid.name}
                        className="w-16 h-16 rounded-full object-cover"
                      />
                      <span className="text-sm font-medium">{kid.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 难度选择 */}
            <div className="mb-8">
              <p className="text-sm text-muted-foreground mb-3">选择难度</p>
              <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
                {DIFFICULTY_LEVELS.map((level) => (
                  <Button
                    key={level.id}
                    variant={selectedDifficulty === level.id ? "default" : "outline"}
                    onClick={() => setSelectedDifficulty(level.id)}
                    className={selectedDifficulty === level.id ? "bg-gradient-to-r from-green-500 to-emerald-500 border-0" : ""}
                  >
                    <div className="text-left">
                      <div className="font-semibold">{level.name}</div>
                      <div className="text-xs opacity-75">{level.description}</div>
                    </div>
                  </Button>
                ))}
              </div>
            </div>

            <Button
              size="lg"
              className="bg-gradient-to-r from-green-500 to-emerald-500 text-white border-0"
              onClick={initializeGame}
              disabled={!selectedKidId}
            >
              开始挑战
            </Button>
            {!selectedKidId && (
              <p className="text-sm text-muted-foreground mt-2">请先选择谁在玩游戏</p>
            )}
          </div>
        ) : gameOver ? (
          /* 结束界面 */
          <div className="text-center py-4 px-4">
            {gameFailed ? (
              /* 失败界面 */
              <>
                <div className="relative w-full h-40 mb-4 flex items-center justify-center">
                  <div className="text-7xl opacity-20">❌</div>
                </div>
                <div className="mb-3">
                  <h2 className="text-2xl font-bold mb-1 text-red-600">挑战失败！</h2>
                  <p className="text-sm text-muted-foreground">答错了，再来一局吧！</p>
                </div>
                <Card className="p-4 mb-4 bg-gradient-to-br from-red-50 to-orange-50 border-0 max-w-sm mx-auto">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-xl font-bold text-green-600">{correctCount}</div>
                      <div className="text-xs text-muted-foreground">正确答案</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-red-600">{totalQuestions - correctCount}</div>
                      <div className="text-xs text-muted-foreground">错误答案</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-muted-foreground">{formatTime(elapsedTime)}</div>
                      <div className="text-xs text-muted-foreground">用时</div>
                    </div>
                  </div>
                </Card>
                <Button
                  size="sm"
                  className="bg-gradient-to-r from-orange-500 to-red-500 text-white border-0"
                  onClick={initializeGame}
                >
                  再来一局
                </Button>
              </>
            ) : (
              /* 成功界面 */
              <>
                {/* 五角星游子效幕 */}
                <div className="relative w-full h-36 mb-3 flex items-center justify-center">
                  {/* 背景五角星 */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-6xl opacity-10 animate-pulse">⭐</div>
                  </div>
                  
                  {/* 游子五角星 */}
                  <div className="relative z-10 flex items-center justify-center gap-2">
                    {Array.from({ length: rewardStars || 1 }).map((_, i) => (
                      <div
                        key={i}
                        className="text-5xl animate-bounce"
                        style={{
                          animationDelay: `${i * 0.1}s`,
                          animation: `bounce 1s ease-in-out infinite, spin 2s linear infinite`,
                        }}
                      >
                        ⭐
                      </div>
                    ))}
                  </div>
                </div>

                {/* 获得五角星提示 */}
                <div className="mb-3">
                  <h2 className="text-2xl font-bold mb-1">挑战完成！</h2>
                  <p className="text-base text-yellow-600 font-semibold">获得 {rewardStars || 1} 个五角星！</p>
                </div>

                <Card className="p-4 mb-4 bg-gradient-to-br from-green-50 to-emerald-50 border-0 max-w-sm mx-auto">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-xl font-bold text-green-600">{correctCount}</div>
                      <div className="text-xs text-muted-foreground">正确答案</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-green-600">{totalQuestions - correctCount}</div>
                      <div className="text-xs text-muted-foreground">错误答案</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-green-600">{formatTime(elapsedTime)}</div>
                      <div className="text-xs text-muted-foreground">用时</div>
                    </div>
                  </div>
                </Card>

                <Button
                  size="sm"
                  className="bg-gradient-to-r from-green-500 to-emerald-500 text-white border-0"
                  onClick={() => setGameStarted(false)}
                >
                  返回难度选择
                </Button>
              </>
            )}
          </div>
        ) : (
          /* 游戏进行中 */
          <>
            {/* 进度条 */}
            <div className="mb-6">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-semibold">第 {currentIndex + 1} / {totalQuestions} 题</span>
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {formatTime(elapsedTime)}
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-green-500 to-emerald-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${((currentIndex + 1) / totalQuestions) * 100}%` }}
                />
              </div>
            </div>

            {/* 题目 */}
            {currentQuestion && (
              <Card className="p-8 mb-8 bg-gradient-to-br from-blue-50 to-cyan-50 border-0 max-w-md mx-auto">
                <div className="text-center">
                  <div className="text-5xl font-bold text-blue-600 mb-4">
                    {currentQuestion.num1} {currentQuestion.operator} {currentQuestion.num2}
                  </div>
                  <div className="text-3xl font-bold text-muted-foreground">= ?</div>
                </div>
              </Card>
            )}

            {/* 选项 */}
            {currentQuestion && (
              <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                {currentQuestion.options.map((option, index) => {
                  const isSelected = selectedAnswer === option;
                  const isAnswer = option === currentQuestion.answer;
                  const showResult = selectedAnswer !== null;

                  return (
                    <button
                      key={index}
                      onClick={() => handleAnswer(option)}
                      disabled={selectedAnswer !== null}
                      className={`p-6 rounded-2xl text-2xl font-bold transition-all duration-300 ${
                        showResult
                          ? isAnswer
                            ? "bg-green-500 text-white scale-105"
                            : isSelected
                            ? "bg-red-500 text-white"
                            : "bg-muted text-muted-foreground"
                          : "bg-white shadow-md hover:shadow-lg hover:scale-105 active:scale-95"
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      <StarRewardPopup
        open={showReward}
        onClose={() => setShowReward(false)}
        stars={rewardStars}
        activityName="数学问答获胜"
        kidName={rewardKidName}
      />
    </div>
  );
}
