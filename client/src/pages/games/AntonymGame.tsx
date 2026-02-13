import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { ChevronLeft } from "lucide-react";
import { StarRewardPopup } from "@/components/StarRewardPopup";
import { CartoonStar } from "@/components/CartoonStar";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { Mic, MicOff } from "lucide-react";

interface AntonymPair {
  id: number;
  word: string;
  antonym: string;
  category: string;
  difficulty: "easy" | "medium" | "hard";
}

interface GameState {
  currentQuestion: number;
  correctCount: number;
  wrongCount: number;
  startTime: number;
  pairs: AntonymPair[];
  selectedAnswer: string | null;
  showResult: boolean;
  gameOver: boolean;
  gameFailed: boolean;
  selectedQuestionCount: number | null;
  difficulty: 'beginner' | 'advanced'; // 初级/高级
  gameMode: 'choice' | 'voice'; // 选择题/语音回答
}

export default function AntonymGame() {
  const [gameState, setGameState] = useState<GameState>({
    currentQuestion: 0,
    correctCount: 0,
    wrongCount: 0,
    startTime: 0,
    pairs: [],
    selectedAnswer: null,
    showResult: false,
    gameOver: false,
    gameFailed: false,
    selectedQuestionCount: null,
    difficulty: (localStorage.getItem('antonymDifficulty') as 'beginner' | 'advanced') || 'beginner', // 从 localStorage 读取，默认初级
    gameMode: (localStorage.getItem('antonymGameMode') as 'choice' | 'voice') || 'choice', // 从 localStorage 读取，默认选择题
  });

  const [elapsedTime, setElapsedTime] = useState(0);
  const [options, setOptions] = useState<string[]>([]);
  const [selectedKidId, setSelectedKidId] = useState<number | null>(null);
  const [rewardGranted, setRewardGranted] = useState(false); // 防止重复发放奖励
  
  // 语音识别相关状态
  const { 
    isListening, 
    transcript, 
    confidence, 
    error: speechError, 
    isSupported, 
    isPermissionGranted,
    startListening, 
    stopListening, 
    resetTranscript,
    requestPermission 
  } = useSpeechRecognition();
  const [voiceAnswer, setVoiceAnswer] = useState<string>(''); // 语音识别的答案
  const [permissionRequested, setPermissionRequested] = useState(false); // 权限是否已请求
  
  // 奖励弹窗状态
  const [showReward, setShowReward] = useState(false);
  const [rewardStars, setRewardStars] = useState(0);
  const [rewardKidName, setRewardKidName] = useState("");

  const awardStarsMutation = trpc.starRewards.award.useMutation();
  const addWrongQuestion = trpc.wrongQuestions.add.useMutation();
  const utils = trpc.useUtils();
  const { data: specialKids } = trpc.specialKids.list.useQuery();
  
  // 从 localStorage 读取选择的孩子ID（与 MathGame 保持一致）
  useEffect(() => {
    const savedKidId = localStorage.getItem("selectedKidId");
    if (savedKidId) {
      setSelectedKidId(parseInt(savedKidId));
    }
  }, []);
  
  const currentKid = specialKids?.find(k => k.id === selectedKidId);

  const { data: randomPairs } = trpc.antonym.getRandomPairs.useQuery(
    { 
      count: gameState.selectedQuestionCount || 10,
      difficulty: gameState.difficulty // 传递难度参数
    },
    { enabled: gameState.selectedQuestionCount !== null && gameState.pairs.length === 0 }
  );

  // 初始化游戏
  useEffect(() => {
    if (randomPairs && gameState.pairs.length === 0 && gameState.selectedQuestionCount) {
      setGameState((prev) => ({
        ...prev,
        pairs: randomPairs,
        startTime: Date.now(),
      }));
    }
  }, [randomPairs, gameState.pairs.length, gameState.selectedQuestionCount]);

  // 计时器
  useEffect(() => {
    if (!gameState.gameOver && gameState.startTime > 0) {
      const interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - gameState.startTime) / 1000));
      }, 100);
      return () => clearInterval(interval);
    }
  }, [gameState.gameOver, gameState.startTime]);
  
  // 游戏开始时请求麦克风权限（语音模式）- 自动尝试开始录音来触发权限请求
  useEffect(() => {
    if (gameState.selectedQuestionCount && gameState.gameMode === 'voice' && !permissionRequested && gameState.pairs.length > 0) {
      setPermissionRequested(true);
      // 直接尝试开始录音，这会自动触发权限请求
      setTimeout(() => {
        console.log('尝试自动开始录音...');
        startListening();
      }, 1000);
    }
  }, [gameState.selectedQuestionCount, gameState.gameMode, permissionRequested, gameState.pairs.length]);
  
  // 语音模式下，每道题自动开始录音（仅在权限已授予后）
  useEffect(() => {
    if (gameState.gameMode === 'voice' && 
        !gameState.gameOver && 
        !gameState.showResult && 
        gameState.pairs.length > 0 &&
        !isListening &&
        gameState.currentQuestion >= 0) {
      // 短暂延迟后自动开始录音，让用户有时间看清题目
      const timer = setTimeout(() => {
        console.log('自动开始录音...');
        startListening();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [gameState.gameMode, gameState.gameOver, gameState.showResult, gameState.currentQuestion, isListening, gameState.pairs.length]);
  
  // 语音识别结果处理
  useEffect(() => {
    if (transcript && gameState.gameMode === 'voice' && !gameState.showResult) {
      // 语音识别完成，自动提交答案
      console.log('识别到语音:', transcript);
      setVoiceAnswer(transcript);
      handleSelectAnswer(transcript);
      resetTranscript();
      stopListening(); // 确保停止录音
    }
  }, [transcript, gameState.gameMode, gameState.showResult]);

  // 生成选项（优先保证字数一致）
  useEffect(() => {
    if (gameState.pairs.length > 0 && gameState.currentQuestion < gameState.pairs.length) {
      const currentPair = gameState.pairs[gameState.currentQuestion];
      const correctAnswer = currentPair.antonym;
      const answerLength = correctAnswer.length;

      // 第1步：优先选择与答案字数相同的反义词
      let wrongOptions = gameState.pairs
        .filter((_, idx) => idx !== gameState.currentQuestion)
        .filter((p) => p.antonym.length === answerLength)
        .map((p) => p.antonym)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);

      // 第2步：如果不足，使用与答案字数相同的题目词
      if (wrongOptions.length < 3) {
        const sameLengthWords = gameState.pairs
          .filter((_, idx) => idx !== gameState.currentQuestion)
          .filter((p) => p.word.length === answerLength)
          .map((p) => p.word)
          .filter((w) => w !== currentPair.word && !wrongOptions.includes(w))
          .sort(() => Math.random() - 0.5)
          .slice(0, 3 - wrongOptions.length);
        wrongOptions = [...wrongOptions, ...sameLengthWords];
      }

      // 第3步：如果还是不足3个，说明数据不够，保持现有选项（不补充其他字数的词）
      // 这样可以确保字数100%一致，即使选项少于4个也没关系

      const allOptions = [correctAnswer, ...wrongOptions].sort(() => Math.random() - 0.5);
      setOptions(allOptions);
    }
  }, [gameState.currentQuestion, gameState.pairs]);

  const handleSelectQuestionCount = (count: number) => {
    setGameState((prev) => ({
      ...prev,
      selectedQuestionCount: count,
    }));
  };

  const handleSelectAnswer = (answer: string) => {
    if (gameState.showResult) return;

    const currentPair = gameState.pairs[gameState.currentQuestion];
    const isCorrect = answer === currentPair.antonym;

    setGameState((prev) => ({
      ...prev,
      selectedAnswer: answer,
      showResult: true,
      correctCount: isCorrect ? prev.correctCount + 1 : prev.correctCount,
      wrongCount: isCorrect ? prev.wrongCount : prev.wrongCount + 1,
      gameOver: !isCorrect, // 答错即结束游戏
      gameFailed: !isCorrect, // 答错即失败
    }));

    // 播放音效
    if (isCorrect) {
      playCorrectSound();
    } else {
      playWrongSound();
      
      // 记录错题到错题本
      if (selectedKidId) {
        addWrongQuestion.mutate({
          kidId: selectedKidId,
          gameType: "antonym",
          questionData: JSON.stringify({
            word: currentPair.word,
            antonym: currentPair.antonym,
            category: currentPair.category,
            difficulty: currentPair.difficulty,
          }),
          userAnswer: answer,
          correctAnswer: currentPair.antonym,
        });
      }
    }
  };

  const handleNextQuestion = () => {
    if (gameState.currentQuestion + 1 < gameState.pairs.length) {
      setGameState((prev) => ({
        ...prev,
        currentQuestion: prev.currentQuestion + 1,
        selectedAnswer: null,
        showResult: false,
      }));
    } else {
      // 游戏结束
      setGameState((prev) => ({
        ...prev,
        gameOver: true,
      }));
    }
  };

  const grantReward = async () => {
    // 防止重复发放奖励
    if (rewardGranted) {
      console.log("奖励已发放，跳过");
      return;
    }
    
    if (!selectedKidId || !currentKid) {
      console.error("缺少必要信息", { selectedKidId, currentKid });
      return;
    }
    
    // 立即标记为已发放，防止并发调用
    setRewardGranted(true);
    
    // 根据题目数量计算星星数：10题=1星，20题=2星，30题=3星，40题=4星，50题=5星
    const starsToAward = Math.floor((gameState.selectedQuestionCount || 10) / 10);
    
    try {
      console.log("开始发放奖励", { selectedKidId, activityType: "antonym_win", stars: starsToAward });
      const result = await awardStarsMutation.mutateAsync({
        kidId: selectedKidId,
        activityType: "antonym_win",
        description: `反义词游戏完成${gameState.selectedQuestionCount}题`,
        customStars: starsToAward,
      });
      
      console.log("奖励发放结果", result);
      
      if (result.success && result.starsEarned > 0) {
        console.log("奖励成功，开始失效缓存");
        // 设置奖励弹窗信息
        setRewardStars(result.starsEarned);
        setRewardKidName(currentKid.name);
        setShowReward(true);
        // 失效缓存
        await utils.specialKids.list.invalidate();
        console.log("缓存已失效");
      } else {
        console.warn("奖励发放失败", result);
      }
    } catch (error) {
      console.error("发放奖励异常", error);
    }
  };

  const handleRestart = () => {
    setGameState({
      currentQuestion: 0,
      correctCount: 0,
      wrongCount: 0,
      startTime: 0,
      pairs: [],
      selectedAnswer: null,
      showResult: false,
      gameOver: false,
      gameFailed: false,
      selectedQuestionCount: null,
      difficulty: (localStorage.getItem('antonymDifficulty') as 'beginner' | 'advanced') || 'beginner',
      gameMode: (localStorage.getItem('antonymGameMode') as 'choice' | 'voice') || 'choice',
    });
    setOptions([]);
    setRewardGranted(false); // 重置奖励状态，允许下一局再次获得奖励
    setVoiceAnswer(''); // 清空语音答案
    setPermissionRequested(false); // 重置权限请求状态
    resetTranscript(); // 清空语音识别结果
    stopListening(); // 确保停止录音
  };

  // 自动跳转下一题（1秒后）
  useEffect(() => {
    if (gameState.showResult && gameState.selectedAnswer !== null) {
      const timer = setTimeout(() => {
        handleNextQuestion();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [gameState.showResult, gameState.selectedAnswer]);

  // 游戏失败时播放AI语音
  useEffect(() => {
    if (gameState.gameFailed && gameState.gameOver) {
      playFailVoice();
    }
  }, [gameState.gameFailed, gameState.gameOver]);

  // 游戏成功时播放胜利音效
  useEffect(() => {
    if (!gameState.gameFailed && gameState.gameOver && gameState.correctCount === gameState.selectedQuestionCount) {
      playVictorySound();
    }
  }, [gameState.gameFailed, gameState.gameOver, gameState.correctCount, gameState.selectedQuestionCount]);

  // 游戏成功时发放奖励（只触发一次）
  useEffect(() => {
    if (gameState.gameOver && gameState.correctCount === gameState.selectedQuestionCount && !rewardGranted) {
      grantReward();
    }
  }, [gameState.gameOver, gameState.correctCount, gameState.selectedQuestionCount, rewardGranted]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // 音效函数（与 MathGame 保持一致）
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

  // 胜利音效（与 MathGame 保持一致）
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

  // 失败音效（与 MathGame 保持一致）
  const playFailVoice = () => {
    const audio = new Audio('/sounds/fail-voice.wav');
    audio.play().catch(() => {
      // 如果音频文件不存在，忽略错误
    });
  };

  // 游戏未开始
  if (!gameState.selectedQuestionCount) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-cyan-100 to-blue-200 p-4">
        <div className="max-w-md mx-auto">
          <Link href="/games" className="inline-flex items-center gap-2 text-blue-600 font-medium mb-6 px-4 py-2 bg-white/80 rounded-lg hover:bg-white transition-colors">
            <ChevronLeft size={20} />
            返回
          </Link>

          <div className="space-y-6">
            <h1 className="text-5xl font-black text-center bg-gradient-to-r from-[#A80000] to-pink-600 bg-clip-text text-transparent drop-shadow-sm">
              反义词游戏
            </h1>
            
            {/* 难度选择 */}
            <div className="space-y-3">
              <h2 className="text-xl font-bold text-center text-gray-700">
                选择难度
              </h2>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => {
                    setGameState(prev => ({ ...prev, difficulty: 'beginner' }));
                    localStorage.setItem('antonymDifficulty', 'beginner');
                  }}
                  className={`px-8 py-3 rounded-full text-lg font-bold transition-all ${
                    gameState.difficulty === 'beginner'
                      ? 'bg-green-500 text-white shadow-lg scale-105'
                      : 'bg-white text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  初级 (1字)
                </button>
                <button
                  onClick={() => {
                    setGameState(prev => ({ ...prev, difficulty: 'advanced' }));
                    localStorage.setItem('antonymDifficulty', 'advanced');
                  }}
                  className={`px-8 py-3 rounded-full text-lg font-bold transition-all ${
                    gameState.difficulty === 'advanced'
                      ? 'bg-orange-500 text-white shadow-lg scale-105'
                      : 'bg-white text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  高级 (2字)
                </button>
              </div>
            </div>
            
            {/* 模式选择 */}
            <div className="space-y-3">
              <h2 className="text-xl font-bold text-center text-gray-700">
                选择模式
              </h2>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => {
                    setGameState(prev => ({ ...prev, gameMode: 'choice' }));
                    localStorage.setItem('antonymGameMode', 'choice');
                  }}
                  className={`px-8 py-3 rounded-full text-lg font-bold transition-all ${
                    gameState.gameMode === 'choice'
                      ? 'bg-blue-500 text-white shadow-lg scale-105'
                      : 'bg-white text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  📝 选择题
                </button>
                <button
                  onClick={() => {
                    setGameState(prev => ({ ...prev, gameMode: 'voice' }));
                    localStorage.setItem('antonymGameMode', 'voice');
                  }}
                  className={`px-8 py-3 rounded-full text-lg font-bold transition-all ${
                    gameState.gameMode === 'voice'
                      ? 'bg-red-500 text-white shadow-lg scale-105'
                      : 'bg-white text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  🎤 语音回答
                </button>
              </div>
            </div>
            
            <h2 className="text-2xl font-bold text-center text-gray-800">
              选择题目数量
            </h2>
            
            <div className="space-y-4">
              {[10, 20, 30, 40, 50].map((count, index) => {
                const stars = Math.floor(count / 10);
                return (
                  <button
                    key={count}
                    onClick={() => handleSelectQuestionCount(count)}
                    className="w-full relative group transition-transform hover:scale-[1.02]"
                  >
                    <div className="relative flex items-center">
                      {/* 卡通风格绿色按钮图片 */}
                      <div className="flex-1 relative h-20">
                        <img 
                          src="/button-green.png" 
                          alt="绿色按钮" 
                          className="w-full h-full object-contain"
                        />
                        <span 
                          className="absolute inset-0 flex items-center justify-center text-white text-3xl font-black"
                          style={{
                            textShadow: '0 2px 4px rgba(0, 0, 0, 0.3), 0 1px 0 rgba(0, 0, 0, 0.5)',
                          }}
                        >
                          {count}题
                        </span>
                      </div>
                      
                      {/* 卡通风格金色徽章图片 */}
                      <div className="absolute -right-2 w-24 h-24">
                        <img 
                          src={`/badge-${stars}star.webp`}
                          alt={`${stars}星徽章`}
                          className="w-full h-full object-contain"
                        />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 游戏进行中
  if (!gameState.gameOver) {
    const currentPair = gameState.pairs[gameState.currentQuestion];
    if (!currentPair) {
      return (
        <div className="min-h-screen bg-gradient-to-b from-blue-100 to-rose-100 p-4 flex items-center justify-center">
          <div className="text-center">
            <p className="text-lg text-gray-600">加载中...</p>
          </div>
        </div>
      );
    }
    const isAnswered = gameState.selectedAnswer !== null;
    const isCorrect = isAnswered && gameState.selectedAnswer === currentPair.antonym;

    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-100 to-rose-100 p-4">
        <div className="max-w-md mx-auto">
          <Link href="/games" className="flex items-center gap-2 text-blue-600 mb-4">
            <ChevronLeft size={20} />
            返回
          </Link>

          <div className="bg-white rounded-lg shadow-lg p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h1 className="text-xl font-bold text-[#A80000]">反义词游戏</h1>
              <span className="text-blue-600 font-bold">{formatTime(elapsedTime)}</span>
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-2">
                第 {gameState.currentQuestion + 1} / {gameState.selectedQuestionCount} 题
              </p>
              <Progress 
                value={((gameState.currentQuestion + 1) / gameState.selectedQuestionCount) * 100} 
                className="h-2"
              />
            </div>

            <Card className="p-4 bg-blue-50 border-2 border-blue-200">
              <p className="text-center text-gray-600 mb-2">
                {gameState.gameMode === 'choice' ? `请选择“${currentPair.word}”的反义词` : `请说出“${currentPair.word}”的反义词`}
              </p>
              <p className="text-center text-3xl font-bold text-blue-600">{currentPair.word}</p>
            </Card>

            {/* 选择题模式 */}
            {gameState.gameMode === 'choice' && (
              <div className="grid grid-cols-2 gap-3">
                {options.map((option, idx) => (
                  <Button
                    key={idx}
                    onClick={() => handleSelectAnswer(option)}
                    disabled={isAnswered}
                    className={`py-6 text-lg font-bold transition-all ${
                      !isAnswered
                        ? "bg-yellow-400 hover:bg-yellow-500 text-gray-800"
                        : option === currentPair.antonym
                        ? "bg-green-500 text-white"
                        : option === gameState.selectedAnswer
                        ? "bg-red-500 text-white"
                        : "bg-gray-300 text-gray-600"
                    }`}
                  >
                    {option}
                  </Button>
                ))}
              </div>
            )}
            
            {/* 语音回答模式 */}
            {gameState.gameMode === 'voice' && (
              <div className="space-y-4">
                {!isSupported && (
                  <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                    您的浏览器不支持语音识别功能，请使用 Chrome 或 Edge 浏览器。
                  </div>
                )}
                
                {speechError && speechError.includes('权限') && (
                  <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded text-center">
                    <p className="font-bold">🎤 需要麦克风权限</p>
                    <p className="text-sm mt-1">请在浏览器弹窗中点击“允许”按钮</p>
                  </div>
                )}
                
                {speechError && !speechError.includes('权限') && (
                  <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
                    {speechError}
                  </div>
                )}
                
                <div className="flex flex-col items-center space-y-4">
                  {/* 麦克风按钮和动画 */}
                  <div className="relative">
                    {/* 录音中的波纹动画 */}
                    {isListening && (
                      <>
                        <div className="absolute inset-0 rounded-full bg-[#A80000] opacity-75 animate-ping" />
                        <div className="absolute inset-0 rounded-full bg-[#d44] opacity-50 animate-pulse" style={{ animationDelay: '0.15s' }} />
                      </>
                    )}
                    
                    <div
                      className={`relative w-32 h-32 rounded-full flex items-center justify-center text-white font-bold text-lg transition-all ${
                        isListening
                          ? "bg-gradient-to-br from-red-500 to-pink-500 shadow-lg shadow-red-300"
                          : "bg-gradient-to-br from-red-500 to-indigo-500 shadow-lg"
                      }`}
                    >
                      {isListening ? (
                        <div className="flex flex-col items-center">
                          <Mic size={48} className="animate-bounce" />
                          <span className="text-sm mt-2">正在听...</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center">
                          <Mic size={48} />
                          <span className="text-xs mt-2">自动录音中</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {isListening && (
                    <div className="text-center animate-pulse">
                      <p className="text-[#A80000] font-bold text-lg">🎤 请说出反义词...</p>
                      <p className="text-gray-500 text-sm mt-1">系统正在认真听哦！</p>
                    </div>
                  )}
                  
                  {!isListening && !voiceAnswer && (
                    <p className="text-gray-500 text-sm">✨ 稍等，马上开始录音...</p>
                  )}
                  
                  {voiceAnswer && (
                    <div className="bg-gradient-to-r from-blue-100 to-rose-100 px-6 py-3 rounded-lg shadow-md">
                      <p className="text-gray-600 text-sm">你说的是：</p>
                      <p className="text-blue-600 font-bold text-2xl">{voiceAnswer}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {isAnswered && (
              <div className="text-center">
                {isCorrect ? (
                  <p className="text-green-600 font-bold text-lg">✅ 正确!</p>
                ) : (
                  <div>
                    <p className="text-red-600 font-bold text-lg">❌ 错误!</p>
                    <p className="text-gray-600 text-sm mt-1">正确答案是: {currentPair.antonym}</p>
                  </div>
                )}
              </div>
            )}

            {isAnswered && gameState.currentQuestion + 1 < gameState.pairs.length && (
              <Button 
                onClick={handleNextQuestion}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3"
              >
                下一题
              </Button>
            )}
            {isAnswered && gameState.currentQuestion + 1 === gameState.pairs.length && (
              <Button 
                onClick={handleNextQuestion}
                className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3"
              >
                完成
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 游戏结束
  const starsEarned = gameState.correctCount === gameState.selectedQuestionCount 
    ? Math.floor((gameState.selectedQuestionCount || 10) / 10)
    : 0;

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto">
        <Link href="/games" className="flex items-center gap-2 text-blue-600 mb-4">
          <ChevronLeft size={20} />
          返回
        </Link>

        <div className="bg-white rounded-lg shadow-lg p-6 space-y-6">
          <div className="text-center py-4 px-4">
            {gameState.gameFailed ? (
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
                      <div className="text-xl font-bold text-green-600">{gameState.correctCount}</div>
                      <div className="text-xs text-muted-foreground">正确答案</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-red-600">{gameState.wrongCount}</div>
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
                  onClick={handleRestart}
                >
                  再来一局
                </Button>
              </>
            ) : (
              /* 成功界面 */
              <>
                {/* 五角星动画效果 */}
                <div className="relative w-full h-36 mb-3 flex items-center justify-center">
                  {/* 背景五角星 */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-6xl opacity-10 animate-pulse">⭐</div>
                  </div>
                  
                  {/* 动画五角星 */}
                  <div className="relative z-10 flex items-center justify-center gap-2">
                    {Array.from({ length: starsEarned }).map((_, i) => (
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
                  <p className="text-base text-yellow-600 font-semibold">获得 {starsEarned} 个五角星！</p>
                </div>

                <Card className="p-4 mb-4 bg-gradient-to-br from-green-50 to-emerald-50 border-0 max-w-sm mx-auto">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-xl font-bold text-green-600">{gameState.correctCount}</div>
                      <div className="text-xs text-muted-foreground">正确答案</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-green-600">{gameState.wrongCount}</div>
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
                  onClick={handleRestart}
                >
                  再来一局
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
      
      <StarRewardPopup
        open={showReward}
        onClose={() => setShowReward(false)}
        stars={rewardStars}
        activityName="反义词游戏获胜"
        kidName={rewardKidName}
      />
    </div>
  );
}
