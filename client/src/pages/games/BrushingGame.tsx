import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Star, ArrowLeft, Play, Volume2 } from "lucide-react";

type GamePhase = "setup" | "ready" | "playing" | "finished";

type BrushingStep = {
  id: number;
  title: string;
  instruction: string;
  startPercent: number;
  endPercent: number;
};

const BRUSHING_STEPS: BrushingStep[] = [
  { id: 1, title: "上面的牙齿", instruction: "我们先刷上面的牙齿吧", startPercent: 0, endPercent: 25 },
  { id: 2, title: "下面的牙齿", instruction: "现在刷下面的牙齿吧", startPercent: 25, endPercent: 50 },
  { id: 3, title: "左边的牙齿", instruction: "我们来刷左边的牙齿", startPercent: 50, endPercent: 75 },
  { id: 4, title: "右边的牙齿", instruction: "最后刷右边的牙齿", startPercent: 75, endPercent: 100 },
];

export default function BrushingGame() {
  const [, setLocation] = useLocation();
  const [kidId] = useState(() => {
    const queryParams = new URLSearchParams(window.location.search);
    return parseInt(queryParams.get("kidId") || "0");
  });

  // 游戏状态
  const [phase, setPhase] = useState<GamePhase>("setup");
  const [duration, setDuration] = useState(180); // 默认3分钟
  const [remainingTime, setRemainingTime] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [starsEarned, setStarsEarned] = useState(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const hasSpokenRef = useRef<{ [key: number]: boolean }>({});
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);

  // 获取孩子信息
  const { data: kids } = trpc.specialKids.list.useQuery();
  const selectedKid = kids?.find((k) => k.id === kidId);

  // 创建刷牙记录
  const createSessionMutation = trpc.brushing.create.useMutation();
  const utils = trpc.useUtils();

  // 从localStorage读取上次的时间设置
  useEffect(() => {
    const savedDuration = localStorage.getItem(`brushing_duration_${kidId}`);
    if (savedDuration) {
      setDuration(parseInt(savedDuration));
    }
  }, [kidId]);

  // 保存时间设置到localStorage
  const handleDurationChange = (value: number[]) => {
    setDuration(value[0]);
    localStorage.setItem(`brushing_duration_${kidId}`, value[0].toString());
  };

  // 语音播报函数
  const speak = (text: string, pitch: number = 1.2, rate: number = 0.9) => {
    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "zh-CN";
      utterance.pitch = pitch;
      utterance.rate = rate;
      window.speechSynthesis.speak(utterance);
    }
  };

  // 开始游戏
  const handleStart = () => {
    setPhase("ready");
    speak("小朋友，又到了我们保护牙齿的时间喽！如果你挤好了牙膏，那我们就准备开始吧。");
  };

  // 开始倒计时
  const handleBeginBrushing = () => {
    setPhase("playing");
    setRemainingTime(duration);
    setCurrentStep(0);
    hasSpokenRef.current = {};
    
    // 播放背景音乐
    if (!bgMusicRef.current) {
      bgMusicRef.current = new Audio('/brushing-song.mp3');
      bgMusicRef.current.loop = true;
      bgMusicRef.current.volume = 0.5;
    }
    bgMusicRef.current.play().catch(err => console.log('音乐播放失败:', err));
    
    // 播报第一步
    setTimeout(() => {
      speak(BRUSHING_STEPS[0].instruction);
      hasSpokenRef.current[0] = true;
    }, 1000);
  };

  // 倒计时逻辑
  useEffect(() => {
    if (phase === "playing" && remainingTime > 0) {
      timerRef.current = setInterval(() => {
        setRemainingTime((prev) => {
          const newTime = prev - 1;
          
          // 计算进度百分比
          const progress = ((duration - newTime) / duration) * 100;
          
          // 检查是否需要切换步骤
          for (let i = 0; i < BRUSHING_STEPS.length; i++) {
            const step = BRUSHING_STEPS[i];
            if (progress >= step.startPercent && progress < step.endPercent) {
              if (currentStep !== i) {
                setCurrentStep(i);
              }
              // 播报语音提示（每个步骤只播报一次）
              if (!hasSpokenRef.current[i] && progress > step.startPercent + 1) {
                speak(step.instruction);
                hasSpokenRef.current[i] = true;
              }
              break;
            }
          }
          
          if (newTime <= 0) {
            handleComplete();
            return 0;
          }
          
          return newTime;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [phase, remainingTime, duration, currentStep]);

  // 完成刷牙
  const handleComplete = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    
    // 停止背景音乐
    if (bgMusicRef.current) {
      bgMusicRef.current.pause();
      bgMusicRef.current.currentTime = 0;
    }
    
    setPhase("finished");
    speak("太棒啦！我们今天又顺利完成了刷牙的任务，你会获得一颗小星星哦！");
    
    try {
      // 创建刷牙记录并发放奖励
      const result = await createSessionMutation.mutateAsync({
        kidId,
        duration,
        completed: true,
      });
      
      setStarsEarned(result.starsEarned);
      
      // 延迟刷新孩子数据，确保星星同步
      setTimeout(() => {
        utils.specialKids.list.invalidate();
      }, 100);
    } catch (error) {
      console.error("Failed to create brushing session:", error);
    }
  };

  // 组件卸载时清理音乐
  useEffect(() => {
    return () => {
      if (bgMusicRef.current) {
        bgMusicRef.current.pause();
        bgMusicRef.current = null;
      }
    };
  }, []);

  // 格式化时间显示
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // 计算进度百分比
  const progress = phase === "playing" ? ((duration - remainingTime) / duration) * 100 : 0;

  if (!selectedKid) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-cyan-50 to-blue-100 flex items-center justify-center p-4">
        <Card className="p-6">
          <p className="text-center text-gray-600">未找到孩子信息</p>
          <Button onClick={() => setLocation("/")} className="mt-4 w-full">
            返回首页
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-cyan-50 to-blue-100 py-4 px-4" style={{ fontFamily: "KaiTi, STKaiti, BiauKai, serif" }}>
      {/* 头部 */}
      <div className="max-w-2xl mx-auto mb-4 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => setLocation(`/games?kidId=${kidId}`)}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          返回
        </Button>
        <div className="flex items-center gap-2">
          <img src={selectedKid.avatar || ""} alt={selectedKid.name} className="w-8 h-8 rounded-full" />
          <span className="font-bold text-lg">{selectedKid.name}</span>
          <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
          <span className="font-bold text-lg">{selectedKid.stars}</span>
        </div>
      </div>

      {/* 游戏内容 */}
      <div className="max-w-2xl mx-auto">
        {/* 设置阶段 */}
        {phase === "setup" && (
          <Card className="p-8">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold text-blue-600 mb-2">🦷 牙齿保卫战</h1>
              <p className="text-gray-600">让我们一起保护牙齿健康！</p>
            </div>

            <div className="mb-8">
              <label className="block text-xl font-bold mb-4 text-center">
                选择刷牙时间：{Math.floor(duration / 60)} 分钟
              </label>
              <Slider
                value={[duration]}
                onValueChange={handleDurationChange}
                min={120}
                max={300}
                step={30}
                className="w-full"
              />
              <div className="flex justify-between text-sm text-gray-500 mt-2">
                <span>2分钟</span>
                <span>3分钟</span>
                <span>4分钟</span>
                <span>5分钟</span>
              </div>
            </div>

            <Button onClick={handleStart} size="lg" className="w-full text-xl py-6">
              <Play className="w-6 h-6 mr-2" />
              开始游戏
            </Button>
          </Card>
        )}

        {/* 准备阶段 */}
        {phase === "ready" && (
          <Card className="p-8 text-center">
            <div className="mb-8">
              <div className="text-6xl mb-4">🪥</div>
              <h2 className="text-3xl font-bold mb-4">准备好了吗？</h2>
              <p className="text-xl text-gray-600 mb-2">挤好牙膏后，点击下面的按钮开始刷牙</p>
              <p className="text-lg text-gray-500">刷牙时间：{Math.floor(duration / 60)} 分钟</p>
            </div>

            <Button onClick={handleBeginBrushing} size="lg" className="w-full text-2xl py-8 bg-green-500 hover:bg-green-600">
              <Play className="w-8 h-8 mr-2" />
              开始刷牙
            </Button>
          </Card>
        )}

        {/* 刷牙中 */}
        {phase === "playing" && (
          <Card className="p-8">
            <div className="text-center mb-8">
              {/* 牙齿3D动画 - 根据进度显示不同阶段 */}
              <div className="mb-6 flex justify-center">
                <img 
                  src={
                    progress < 33 ? "/tooth-dirty.webp" :
                    progress < 90 ? "/tooth-brushing.webp" :
                    "/tooth-clean.webp"
                  }
                  alt="tooth"
                  className="w-full max-w-md h-[50vh] object-contain transition-all duration-1000"
                  style={{
                    animation: 
                      progress < 33 ? "shake 0.6s ease-in-out infinite" :
                      progress < 90 ? "brushing 1.2s ease-in-out infinite" :
                      "celebrate 0.8s ease-in-out infinite"
                  }}
                />
              </div>
              <style>{`
                @keyframes shake {
                  0%, 100% { transform: translateX(0) rotate(0deg) scale(1); }
                  25% { transform: translateX(-8px) rotate(-3deg) scale(1.02); }
                  50% { transform: translateX(0) rotate(0deg) scale(0.98); }
                  75% { transform: translateX(8px) rotate(3deg) scale(1.02); }
                }
                @keyframes brushing {
                  0%, 100% { transform: translateX(0) rotate(0deg); }
                  15% { transform: translateX(-12px) rotate(-6deg); }
                  35% { transform: translateX(12px) rotate(6deg); }
                  50% { transform: translateX(-8px) rotate(-4deg); }
                  65% { transform: translateX(8px) rotate(4deg); }
                  85% { transform: translateX(-4px) rotate(-2deg); }
                }
                @keyframes celebrate {
                  0%, 100% { transform: translateY(0) scale(1) rotate(0deg); filter: brightness(1); }
                  25% { transform: translateY(-30px) scale(1.1) rotate(-5deg); filter: brightness(1.3); }
                  50% { transform: translateY(0) scale(1.05) rotate(5deg); filter: brightness(1.1); }
                  75% { transform: translateY(-15px) scale(1.08) rotate(-3deg); filter: brightness(1.2); }
                }
              `}</style>
              
              {/* 倒计时 */}
              <h2 className="text-6xl font-bold mb-6">{formatTime(remainingTime)}</h2>
              
              {/* 进度条 */}
              <div className="w-full bg-gray-200 rounded-full h-6 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-400 to-green-400 h-full transition-all duration-1000 flex items-center justify-end pr-2"
                  style={{ width: `${progress}%` }}
                >
                  <span className="text-white text-sm font-bold">{Math.round(progress)}%</span>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* 完成阶段 */}
        {phase === "finished" && (
          <Card className="p-8 text-center">
            <div className="mb-8">
              {/* 星星动画 */}
              <div className="mb-6">
                <Star className="w-32 h-32 text-yellow-500 fill-yellow-500 mx-auto animate-bounce" />
              </div>
              
              <h2 className="text-4xl font-bold text-green-600 mb-4">太棒啦！</h2>
              <p className="text-2xl text-gray-700 mb-6">你获得了 {starsEarned} 颗星星！</p>
              
              <div className="bg-green-50 rounded-lg p-6 mb-6">
                <p className="text-xl text-gray-700">
                  我们今天又顺利完成了刷牙任务！<br />
                  继续保持，牙齿会越来越健康哦！
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <Button onClick={() => setPhase("setup")} size="lg" className="flex-1 text-xl py-6">
                再刷一次
              </Button>
              <Button onClick={() => setLocation(`/games?kidId=${kidId}`)} variant="outline" size="lg" className="flex-1 text-xl py-6">
                返回游戏
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
