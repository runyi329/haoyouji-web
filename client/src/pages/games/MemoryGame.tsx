import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowLeft, RotateCcw, Trophy, Clock, Sparkles } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { StarRewardPopup } from "@/components/StarRewardPopup";

const emojis = ["🐶", "🐱", "🐰", "🦊", "🐻", "🐼", "🐨", "🦁", "🐯", "🐸", "🐵", "🦄"];

interface CardItem {
  id: number;
  emoji: string;
  isFlipped: boolean;
  isMatched: boolean;
}

export default function MemoryGame() {
  const { isAuthenticated } = useAuth();
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
  const { data: rewardRules } = trpc.starRules.list.useQuery();
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
        activityType: "memory_win",
        description: "记忆翻牌获胜",
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

  const saveRecord = trpc.games.saveRecord.useMutation({
    onSuccess: (data) => {
      if (data.pointsEarned > 0) {
        toast.success(`恭喜获得 ${data.pointsEarned} 积分！`);
      }
    },
  });

  const pairCount = useMemo(() => {
    return level === 1 ? 6 : level === 2 ? 8 : 12;
  }, [level]);

  const initializeGame = () => {
    const selectedEmojis = emojis.slice(0, pairCount);
    const cardPairs = [...selectedEmojis, ...selectedEmojis];
    const shuffled = cardPairs
      .sort(() => Math.random() - 0.5)
      .map((emoji, index) => ({
        id: index,
        emoji,
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

      if (firstCard && secondCard && firstCard.emoji === secondCard.emoji) {
        // 匹配成功
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
        // 匹配失败
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
      const score = Math.max(1000 - moves * 10 - elapsedTime * 2, 100);
      
      if (isAuthenticated) {
        saveRecord.mutate({
          gameType: "memory",
          score,
          level,
          duration: elapsedTime,
        });
      }
      
      // 发放奖励
      setTimeout(() => grantReward(), 500);
    }
  }, [matches, pairCount, gameStarted, moves, elapsedTime, level, isAuthenticated]);

  const handleCardClick = (id: number) => {
    if (flippedCards.length >= 2) return;
    const card = cards.find((c) => c.id === id);
    if (!card || card.isFlipped || card.isMatched) return;

    setCards((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isFlipped: true } : c))
    );
    setFlippedCards((prev) => [...prev, id]);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const score = Math.max(1000 - moves * 10 - elapsedTime * 2, 100);

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* 顶部导航 */}
      <header className="z-50 glass border-b border-border/50">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center">
            <Link href="/games">
              <Button variant="ghost" size="icon" className="mr-2">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h1 className="font-bold text-lg">记忆翻牌</h1>
          </div>
          {gameStarted && (
            <Button variant="ghost" size="icon" onClick={initializeGame}>
              <RotateCcw className="w-5 h-5" />
            </Button>
          )}
        </div>
      </header>

      <main className="container py-3 px-3">
        {!gameStarted ? (
          /* 开始界面 */
          <div className="text-center py-12">
            <div className="w-24 h-24 mx-auto mb-3 rounded-3xl bg-gradient-to-br from-[#A80000] to-[#d44] flex items-center justify-center animate-float">
              <span className="text-5xl">🧠</span>
            </div>
            <h2 className="text-2xl font-bold mb-2">记忆翻牌</h2>
            <p className="text-muted-foreground mb-4">翻开卡片，找到相同的图案！</p>
            
            {/* 难度选择 */}
            <div className="mb-4">
              <p className="text-sm text-muted-foreground mb-3">选择难度</p>
              <div className="flex justify-center gap-3">
                {[1, 2, 3].map((l) => (
                  <Button
                    key={l}
                    variant={level === l ? "default" : "outline"}
                    onClick={() => setLevel(l)}
                    className={level === l ? "bg-gradient-to-r from-red-500 to-pink-500 border-0" : ""}
                  >
                    {l === 1 ? "简单" : l === 2 ? "中等" : "困难"}
                  </Button>
                ))}
              </div>
            </div>

            <Button
              size="lg"
              className="btn-gradient"
              onClick={initializeGame}
            >
              开始游戏
            </Button>
          </div>
        ) : gameOver ? (
          /* 结束界面 */
          <div className="text-center py-12">
            <div className="w-24 h-24 mx-auto mb-3 rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
              <Trophy className="w-12 h-12 text-white" />
            </div>
            <h2 className="text-2xl font-bold mb-2">太棒了！</h2>
            <p className="text-muted-foreground mb-3">你完成了游戏！</p>
            
            <Card className="p-6 mb-4 bg-gradient-to-br from-red-50 to-pink-50 border-0 max-w-sm mx-auto">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-brand-red">{score}</div>
                  <div className="text-xs text-muted-foreground">得分</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-blue-600">{moves}</div>
                  <div className="text-xs text-muted-foreground">步数</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">{formatTime(elapsedTime)}</div>
                  <div className="text-xs text-muted-foreground">用时</div>
                </div>
              </div>
            </Card>

            <div className="flex justify-center gap-4">
              <Button variant="outline" onClick={() => setLevel((l) => Math.min(l + 1, 3))}>
                下一关
              </Button>
              <Button className="btn-gradient" onClick={initializeGame}>
                再玩一次
              </Button>
            </div>
          </div>
        ) : (
          /* 游戏界面 */
          <>
            {/* 状态栏 */}
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-100">
                  <Sparkles className="w-4 h-4 text-brand-red" />
                  <span className="text-sm font-medium text-brand-red">{score}</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-100">
                  <Clock className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-600">{formatTime(elapsedTime)}</span>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                {matches}/{pairCount} 对
              </div>
            </div>

            {/* 卡片网格 */}
            <div className={`grid gap-3 ${pairCount <= 6 ? "grid-cols-3" : pairCount <= 8 ? "grid-cols-4" : "grid-cols-4"}`}>
              {cards.map((card) => (
                <button
                  key={card.id}
                  onClick={() => handleCardClick(card.id)}
                  disabled={card.isFlipped || card.isMatched}
                  className={`aspect-square rounded-2xl text-3xl sm:text-4xl transition-all duration-300 transform ${
                    card.isFlipped || card.isMatched
                      ? "bg-white shadow-lg scale-100 rotate-0"
                      : "bg-gradient-to-br from-[#A80000] to-[#d44] shadow-md hover:scale-105"
                  } ${card.isMatched ? "opacity-50" : ""}`}
                >
                  {card.isFlipped || card.isMatched ? card.emoji : "?"}
                </button>
              ))}
            </div>
          </>
        )}
      </main>

      {/* 五角星奖励弹窗 */}
      {showReward && (
        <StarRewardPopup
          open={showReward}
          kidName={rewardKidName}
          stars={rewardStars}
          activityName="记忆翻牌获胜"
          onClose={() => setShowReward(false)}
        />
      )}
    </div>
  );
}
