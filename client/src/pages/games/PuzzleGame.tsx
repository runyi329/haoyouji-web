import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowLeft, RotateCcw, Trophy, Clock, Sparkles } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { StarRewardPopup } from "@/components/StarRewardPopup";

interface Tile {
  id: number;
  currentPos: number;
  correctPos: number;
}

const images = [
  { id: 1, emoji: "🦁", name: "狮子" },
  { id: 2, emoji: "🐼", name: "熊猫" },
  { id: 3, emoji: "🦊", name: "狐狸" },
  { id: 4, emoji: "🐰", name: "兔子" },
  { id: 5, emoji: "🐻", name: "小熊" },
  { id: 6, emoji: "🦄", name: "独角兽" },
];

export default function PuzzleGame() {
  const { isAuthenticated } = useAuth();
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [moves, setMoves] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [startTime, setStartTime] = useState<number>(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [level, setLevel] = useState(1);
  const [selectedImage, setSelectedImage] = useState(images[0]);
  const [emptyPos, setEmptyPos] = useState(8);
  
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
        activityType: "puzzle_win",
        description: "拼图获胜",
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

  const gridSize = level === 1 ? 3 : level === 2 ? 4 : 5;
  const totalTiles = gridSize * gridSize;

  const initializeGame = useCallback(() => {
    // 创建有序的拼图块
    const orderedTiles: Tile[] = Array.from({ length: totalTiles - 1 }, (_, i) => ({
      id: i,
      currentPos: i,
      correctPos: i,
    }));

    // 打乱拼图（确保可解）
    const shuffled = [...orderedTiles];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i].currentPos, shuffled[j].currentPos] = [shuffled[j].currentPos, shuffled[i].currentPos];
    }

    setTiles(shuffled);
    setEmptyPos(totalTiles - 1);
    setMoves(0);
    setGameStarted(true);
    setGameOver(false);
    setStartTime(Date.now());
    setElapsedTime(0);
  }, [totalTiles]);

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

  // 检查是否完成
  useEffect(() => {
    if (gameStarted && tiles.length > 0) {
      const isSolved = tiles.every((tile) => tile.currentPos === tile.correctPos);
      if (isSolved) {
        setGameOver(true);
        const score = Math.max(1000 - moves * 5 - elapsedTime, 100);
        
      if (isAuthenticated) {
        saveRecord.mutate({
          gameType: "puzzle",
          score,
          level,
          duration: elapsedTime,
        });
      }
      
      // 发放奖励
      setTimeout(() => grantReward(), 500);
      }
    }
  }, [tiles, gameStarted, moves, elapsedTime, level, isAuthenticated]);

  const canMove = (pos: number) => {
    const row = Math.floor(pos / gridSize);
    const col = pos % gridSize;
    const emptyRow = Math.floor(emptyPos / gridSize);
    const emptyCol = emptyPos % gridSize;

    return (
      (Math.abs(row - emptyRow) === 1 && col === emptyCol) ||
      (Math.abs(col - emptyCol) === 1 && row === emptyRow)
    );
  };

  const handleTileClick = (clickedPos: number) => {
    if (!canMove(clickedPos)) return;

    setTiles((prev) =>
      prev.map((tile) => {
        if (tile.currentPos === clickedPos) {
          return { ...tile, currentPos: emptyPos };
        }
        return tile;
      })
    );
    setEmptyPos(clickedPos);
    setMoves((m) => m + 1);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const score = Math.max(1000 - moves * 5 - elapsedTime, 100);

  const getTileAtPosition = (pos: number) => {
    return tiles.find((t) => t.currentPos === pos);
  };

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
            <h1 className="font-bold text-lg">趣味拼图</h1>
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
          <div className="text-center py-8">
            <div className="w-24 h-24 mx-auto mb-3 rounded-3xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center animate-float">
              <span className="text-5xl">🧩</span>
            </div>
            <h2 className="text-2xl font-bold mb-2">趣味拼图</h2>
            <p className="text-muted-foreground mb-3">移动方块，完成拼图！</p>

            {/* 选择图案 */}
            <div className="mb-3">
              <p className="text-sm text-muted-foreground mb-3">选择图案</p>
              <div className="flex justify-center gap-3 flex-wrap">
                {images.map((img) => (
                  <button
                    key={img.id}
                    onClick={() => setSelectedImage(img)}
                    className={`w-14 h-14 rounded-xl text-3xl transition-all ${
                      selectedImage.id === img.id
                        ? "bg-blue-100 ring-2 ring-blue-500 scale-110"
                        : "bg-muted hover:bg-blue-50"
                    }`}
                  >
                    {img.emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* 难度选择 */}
            <div className="mb-4">
              <p className="text-sm text-muted-foreground mb-3">选择难度</p>
              <div className="flex justify-center gap-3">
                {[1, 2, 3].map((l) => (
                  <Button
                    key={l}
                    variant={level === l ? "default" : "outline"}
                    onClick={() => setLevel(l)}
                    className={level === l ? "bg-gradient-to-r from-blue-500 to-cyan-500 border-0" : ""}
                  >
                    {l === 1 ? "3×3" : l === 2 ? "4×4" : "5×5"}
                  </Button>
                ))}
              </div>
            </div>

            <Button
              size="lg"
              className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white border-0"
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
            <h2 className="text-2xl font-bold mb-2">完成了！</h2>
            <p className="text-muted-foreground mb-3">你成功拼好了{selectedImage.name}！</p>

            <Card className="p-6 mb-4 bg-gradient-to-br from-blue-50 to-cyan-50 border-0 max-w-sm mx-auto">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-blue-600">{score}</div>
                  <div className="text-xs text-muted-foreground">得分</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-[#D32F2F]">{moves}</div>
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
              <Button
                className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white border-0"
                onClick={initializeGame}
              >
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
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-100">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-600">{score}</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-100">
                  <Clock className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium text-green-600">{formatTime(elapsedTime)}</span>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">步数: {moves}</div>
            </div>

            {/* 目标图案 */}
            <div className="flex justify-center mb-4">
              <div className="px-4 py-2 rounded-full bg-blue-50 flex items-center gap-2">
                <span className="text-2xl">{selectedImage.emoji}</span>
                <span className="text-sm text-blue-600">拼出{selectedImage.name}</span>
              </div>
            </div>

            {/* 拼图网格 */}
            <div
              className="grid gap-1 mx-auto max-w-sm"
              style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}
            >
              {Array.from({ length: totalTiles }).map((_, pos) => {
                const tile = getTileAtPosition(pos);
                const isEmpty = pos === emptyPos;
                const isMovable = canMove(pos);

                return (
                  <button
                    key={pos}
                    onClick={() => !isEmpty && handleTileClick(pos)}
                    disabled={isEmpty}
                    className={`aspect-square rounded-xl text-2xl sm:text-3xl font-bold transition-all duration-200 ${
                      isEmpty
                        ? "bg-muted/30"
                        : isMovable
                        ? "bg-gradient-to-br from-blue-400 to-blue-600 text-white shadow-lg hover:scale-105 cursor-pointer"
                        : "bg-gradient-to-br from-blue-300 to-blue-500 text-white shadow-md"
                    }`}
                  >
                    {!isEmpty && tile && (
                      <span>{tile.id + 1}</span>
                    )}
                  </button>
                );
              })}
            </div>

            <p className="text-center text-sm text-muted-foreground mt-4">
              点击相邻的方块移动它
            </p>
          </>
        )}
      </main>

      {/* 五角星奖励弹窗 */}
      {showReward && (
        <StarRewardPopup
          open={showReward}
          kidName={rewardKidName}
          stars={rewardStars}
          activityName="拼图获胜"
          onClose={() => setShowReward(false)}
        />
      )}
    </div>
  );
}
