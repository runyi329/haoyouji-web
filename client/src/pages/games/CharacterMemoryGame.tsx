import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowLeft, RotateCcw, Trophy, Clock } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { StarRewardPopup } from "@/components/StarRewardPopup";

interface CardItem {
  id: number;
  character: string;
  isFlipped: boolean;
  isMatched: boolean;
}

// 音效播放函数
const playClickSound = () => {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(1200, audioContext.currentTime + 0.1);
  
  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
  
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.15);
};

const playStartSound = () => {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  
  // 播放三个音符的上升音效
  const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
  
  notes.forEach((freq, index) => {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(freq, audioContext.currentTime + index * 0.1);
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime + index * 0.1);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + index * 0.1 + 0.2);
    
    oscillator.start(audioContext.currentTime + index * 0.1);
    oscillator.stop(audioContext.currentTime + index * 0.1 + 0.2);
  });
};

// 游戏设置界面组件 - 使用效果图作为背景，在其上放置真实HTML按钮
interface GameSetupScreenProps {
  level: number;
  onLevelSelect: (level: number) => void;
  onStartGame: () => void;
}

// 播放难度语音播报
const playDifficultyVoice = (difficulty: number) => {
  const voiceFiles: Record<number, string> = {
    1: '/sounds/voice-easy.wav',
    2: '/sounds/voice-medium.wav',
    3: '/sounds/voice-hard.wav'
  };
  const audio = new Audio(voiceFiles[difficulty]);
  audio.volume = 0.8;
  audio.play().catch(e => console.log('语音播放失败:', e));
};

function GameSetupScreen({ level, onLevelSelect, onStartGame }: GameSetupScreenProps) {
  const difficultyButtons = [
    { id: 1, label: '简单', description: '6对卡片', stars: 1, color: 'bg-[#4CAF50] hover:bg-[#4CAF50]' },
    { id: 2, label: '中等', description: '8对卡片', stars: 2, color: 'bg-[#CBA471] hover:bg-[#CBA471]' },
    { id: 3, label: '困难', description: '12对卡片', stars: 3, color: 'bg-[#D32F2F] hover:bg-[#D32F2F]' },
  ];
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-pink-50 to-blue-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 space-y-6 shadow-xl">
        {/* 标题 */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-gray-800">翻牌记字</h1>
          <p className="text-gray-600">选择难度开始游戏</p>
        </div>

        {/* 难度选择 */}
        <div className="space-y-3">
          <label className="text-sm font-medium text-gray-700">游戏难度</label>
          <div className="grid grid-cols-1 gap-3">
            {difficultyButtons.map((btn) => (
              <button
                key={btn.id}
                onClick={() => {
                  playDifficultyVoice(btn.id);
                  onLevelSelect(btn.id);
                }}
                className={`
                  w-full p-4 rounded-lg text-white font-medium
                  transition-all duration-200
                  ${btn.color}
                  ${level === btn.id ? 'ring-4 ring-offset-2 ring-[#A80000] scale-105' : ''}
                  active:scale-95
                `}
              >
                <div className="flex items-center justify-between">
                  <div className="text-left">
                    <div className="text-lg font-bold">{btn.label}</div>
                    <div className="text-sm opacity-90">{btn.description}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: btn.stars }).map((_, i) => (
                      <span key={i} className="text-yellow-300 text-xl">★</span>
                    ))}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 开始按钮 */}
        <Button
          onClick={() => {
            playStartSound();
            onStartGame();
          }}
          className="w-full h-14 text-lg font-bold bg-gradient-to-r from-red-500 to-pink-500 hover:from-[#A80000] hover:to-pink-600"
          disabled={!level}
        >
          开始游戏
        </Button>

        {/* 返回按钮 */}
        <Link href="/games">
          <Button variant="outline" className="w-full">
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回游戏列表
          </Button>
        </Link>
      </Card>
    </div>
  );
}

export default function CharacterMemoryGame() {
  const [cards, setCards] = useState<CardItem[]>([]);
  const [flippedCards, setFlippedCards] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [matches, setMatches] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [startTime, setStartTime] = useState<number>(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [level, setLevel] = useState(1);
  
  // 五角星奖励系统
  const [selectedKidId, setSelectedKidId] = useState<number | null>(null);
  const [showReward, setShowReward] = useState(false);
  const [rewardStars, setRewardStars] = useState(0);
  const [rewardKidName, setRewardKidName] = useState("");
  
  const { data: specialKids } = trpc.specialKids.list.useQuery();
  const { data: allCharacters } = trpc.character.getAll.useQuery({});
  const characters = allCharacters || [];
  const awardStarsMutation = trpc.starRewards.award.useMutation();
  const utils = trpc.useUtils();

  // 从localStorage读取选择的孩子
  useEffect(() => {
    const savedKidId = localStorage.getItem("selectedKidId");
    if (savedKidId) {
      setSelectedKidId(parseInt(savedKidId));
    }
  }, []);

  // 获取当前选择的孩子
  const currentKid = specialKids?.find(k => k.id === selectedKidId);

  // 发放奖励
  const grantReward = async () => {
    if (!selectedKidId || !currentKid) return;
    
    try {
      const result = await awardStarsMutation.mutateAsync({
        kidId: selectedKidId,
        activityType: "character_memory_win",
        description: "翻牌记字游戏获胜",
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

  const pairCount = useMemo(() => {
    return level === 1 ? 6 : level === 2 ? 8 : 12;
  }, [level]);

  // 语音朗读汉字
  const speakCharacter = (character: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(character);
      utterance.lang = 'zh-CN';
      utterance.rate = 0.8;
      utterance.pitch = 1.2;
      window.speechSynthesis.speak(utterance);
    }
  };

  const initializeGame = () => {
    if (!characters || characters.length < pairCount) {
      console.error("识字库汉字不足");
      return;
    }
    
    playStartSound();
    
    const shuffledChars = [...characters].sort(() => Math.random() - 0.5);
    const selectedChars = shuffledChars.slice(0, pairCount).map(c => c.character);
    const cardPairs = [...selectedChars, ...selectedChars];
    const shuffled = cardPairs
      .sort(() => Math.random() - 0.5)
      .map((character, index) => ({
        id: index,
        character,
        isFlipped: false,
        isMatched: false,
      }));
    setCards(shuffled);
    setFlippedCards([]);
    setMoves(0);
    setMatches(0);
    setGameStarted(true);
    setGameOver(false);
    setStartTime(Date.now());
    setElapsedTime(0);
  };

  // 处理难度选择
  const handleLevelSelect = (newLevel: number) => {
    playClickSound();
    setLevel(newLevel);
  };

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

  // 检查匹配
  useEffect(() => {
    if (flippedCards.length === 2) {
      const [first, second] = flippedCards;
      const firstCard = cards.find((c) => c.id === first);
      const secondCard = cards.find((c) => c.id === second);

      if (firstCard && secondCard && firstCard.character === secondCard.character) {
        setTimeout(() => {
          setCards((prev) =>
            prev.map((card) =>
              card.id === first || card.id === second
                ? { ...card, isMatched: true }
                : card
            )
          );
          setMatches((m) => m + 1);
          setFlippedCards([]);
        }, 500);
      } else {
        setTimeout(() => {
          setCards((prev) =>
            prev.map((card) =>
              card.id === first || card.id === second
                ? { ...card, isFlipped: false }
                : card
            )
          );
          setFlippedCards([]);
        }, 1000);
      }
      setMoves((m) => m + 1);
    }
  }, [flippedCards, cards]);

  // 检查游戏结束
  useEffect(() => {
    if (matches === pairCount && gameStarted) {
      setGameOver(true);
      setTimeout(() => grantReward(), 500);
    }
  }, [matches, pairCount, gameStarted]);

  const handleCardClick = (id: number) => {
    if (flippedCards.length >= 2) return;
    const card = cards.find((c) => c.id === id);
    if (!card || card.isFlipped || card.isMatched) return;

    setCards((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isFlipped: true } : c))
    );
    setFlippedCards((prev) => [...prev, id]);
    speakCharacter(card.character);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen pb-20" style={{ background: 'transparent' }}>
      {/* 游戏未开始 - 使用背景图+按钮锁定在图片实际渲染区域上 */}
      {!gameStarted && (
        <GameSetupScreen 
          level={level}
          onLevelSelect={handleLevelSelect}
          onStartGame={() => {
            if (characters && characters.length >= pairCount) {
              initializeGame();
            }
          }}
        />
      )}

      {/* 游戏进行中 */}
      <div className="container max-w-4xl mx-auto px-4 py-6">
        {gameStarted && !gameOver && (
          <div className="space-y-6">
            {/* 游戏信息 */}
            <div className="flex gap-4 justify-center flex-wrap">
              <Card className="px-6 py-3 flex items-center gap-2">
                <Clock size={20} className="text-[#1976D2]" />
                <span className="font-mono font-bold">{formatTime(elapsedTime)}</span>
              </Card>
              <Card className="px-6 py-3 flex items-center gap-2">
                <Trophy size={20} className="text-yellow-500" />
                <span className="font-bold">{matches} / {pairCount}</span>
              </Card>
              <Card className="px-6 py-3 flex items-center gap-2">
                <span className="text-gray-600">步数:</span>
                <span className="font-bold">{moves}</span>
              </Card>
            </div>

            {/* 卡片网格 */}
            <div className={`grid gap-4 ${
              pairCount === 6 ? 'grid-cols-4' : 
              pairCount === 8 ? 'grid-cols-4' : 
              'grid-cols-6'
            }`}>
              {cards.map((card) => (
                <button
                  key={card.id}
                  onClick={() => handleCardClick(card.id)}
                  disabled={card.isFlipped || card.isMatched}
                  className={`aspect-square rounded-xl transition-all duration-300 transform ${
                    card.isFlipped || card.isMatched
                      ? 'bg-white shadow-lg'
                      : 'bg-gradient-to-br from-[#A80000] to-[#d44] hover:scale-105 hover:shadow-xl'
                  } ${
                    card.isMatched ? 'opacity-50 scale-95' : ''
                  }`}
                >
                  {(card.isFlipped || card.isMatched) && (
                    <div className="w-full h-full flex items-center justify-center text-4xl md:text-5xl font-bold text-gray-800">
                      {card.character}
                    </div>
                  )}
                  {!card.isFlipped && !card.isMatched && (
                    <div className="w-full h-full flex items-center justify-center text-white text-2xl">
                      ?
                    </div>
                  )}
                </button>
              ))}
            </div>

            <div className="flex justify-center">
              <Button
                onClick={() => {
                  setGameStarted(false);
                  setCards([]);
                }}
                variant="outline"
                className="gap-2"
              >
                <RotateCcw size={16} />
                重新开始
              </Button>
            </div>
          </div>
        )}

        {/* 游戏结束 */}
        {gameOver && (
          <Card className="p-8 text-center space-y-6">
            <div className="space-y-2">
              <div className="text-6xl mb-4">🎉</div>
              <h2 className="text-3xl font-bold text-gray-800">恭喜完成！</h2>
            </div>

            <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
              <div className="p-4 bg-[#F5F5F5] rounded-lg">
                <div className="text-sm text-gray-600">用时</div>
                <div className="text-2xl font-bold text-[#1976D2]">{formatTime(elapsedTime)}</div>
              </div>
              <div className="p-4 bg-[#FFEBEE] rounded-lg">
                <div className="text-sm text-gray-600">步数</div>
                <div className="text-2xl font-bold text-[#D32F2F]">{moves}</div>
              </div>
            </div>

            <div className="flex gap-4 justify-center">
              <Button
                onClick={() => {
                  setGameStarted(false);
                  setGameOver(false);
                  setCards([]);
                }}
                variant="outline"
                className="gap-2"
              >
                <RotateCcw size={16} />
                再玩一次
              </Button>
              <Link href="/games/character-hub">
                <Button className="gap-2 bg-gradient-to-r from-red-500 to-pink-500">
                  返回识字游戏
                </Button>
              </Link>
            </div>
          </Card>
        )}
      </div>

      {/* 奖励弹窗 */}
      <StarRewardPopup
        open={showReward}
        stars={rewardStars}
        kidName={rewardKidName}
        activityName="翻牌记字"
        onClose={() => setShowReward(false)}
      />
    </div>
  );
}
