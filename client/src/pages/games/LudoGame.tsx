import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "wouter";
import { ArrowLeft, RotateCcw, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6, Play, Trophy } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { StarRewardPopup } from "@/components/StarRewardPopup";

// 玩家颜色配置
const PLAYER_COLORS = {
  red: { bg: "bg-red-500", text: "text-red-500", light: "bg-red-100", name: "红方" },
  blue: { bg: "bg-blue-500", text: "text-blue-500", light: "bg-blue-100", name: "蓝方" },
  green: { bg: "bg-green-500", text: "text-green-500", light: "bg-green-100", name: "绿方" },
  yellow: { bg: "bg-[#CBA471]", text: "text-yellow-500", light: "bg-[#FAF3ED]", name: "黄方" },
};

type PlayerColor = keyof typeof PLAYER_COLORS;

// 棋子状态
interface Piece {
  id: number;
  color: PlayerColor;
  position: number; // -1: 基地, 0-51: 主路径, 52-56: 终点路径
  isHome: boolean; // 是否到达终点
}

// 骰子图标
const DiceIcons = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];

// 简化的飞行棋棋盘路径 - 每个玩家有自己的起点
const START_POSITIONS: Record<PlayerColor, number> = {
  red: 0,
  blue: 13,
  green: 26,
  yellow: 39,
};

// 终点入口位置
const HOME_ENTRY: Record<PlayerColor, number> = {
  red: 50,
  blue: 11,
  green: 24,
  yellow: 37,
};

export default function LudoGame() {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<PlayerColor>("red");
  const [diceValue, setDiceValue] = useState<number>(0);
  const [isRolling, setIsRolling] = useState(false);
  const [hasRolled, setHasRolled] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [winner, setWinner] = useState<PlayerColor | null>(null);
  const [selectedPiece, setSelectedPiece] = useState<number | null>(null);
  
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

  // 获取飞行棋获胜奖励规则
  const getWinReward = () => {
    const rule = rewardRules?.find((r: { activityType: string; isActive: boolean; starsReward: number }) => r.activityType === "ludo_win" && r.isActive);
    return rule?.starsReward || 2; // 默认2星
  };

  // 发放奖励
  const grantReward = async () => {
    if (!selectedKidId || !currentKid) return;
    
    try {
      const result = await awardStarsMutation.mutateAsync({
        kidId: selectedKidId,
        activityType: "ludo_win",
        description: "飞行棋获胜",
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

  // 初始化游戏
  const initGame = useCallback(() => {
    const initialPieces: Piece[] = [];
    const colors: PlayerColor[] = ["red", "blue", "green", "yellow"];
    
    colors.forEach((color) => {
      for (let i = 0; i < 4; i++) {
        initialPieces.push({
          id: initialPieces.length,
          color,
          position: -1, // 在基地
          isHome: false,
        });
      }
    });
    
    setPieces(initialPieces);
    setCurrentPlayer("red");
    setDiceValue(0);
    setHasRolled(false);
    setGameStarted(true);
    setWinner(null);
    setSelectedPiece(null);
  }, []);

  // 掷骰子
  const rollDice = useCallback(() => {
    if (isRolling || hasRolled) return;
    
    setIsRolling(true);
    setSelectedPiece(null);
    
    // 动画效果
    let count = 0;
    const interval = setInterval(() => {
      setDiceValue(Math.floor(Math.random() * 6) + 1);
      count++;
      if (count >= 10) {
        clearInterval(interval);
        const finalValue = Math.floor(Math.random() * 6) + 1;
        setDiceValue(finalValue);
        setIsRolling(false);
        setHasRolled(true);
        
        // 检查是否有可移动的棋子
        const movablePieces = getMovablePieces(finalValue);
        if (movablePieces.length === 0) {
          toast.info(`${PLAYER_COLORS[currentPlayer].name}没有可移动的棋子`);
          setTimeout(() => nextTurn(finalValue), 1000);
        }
      }
    }, 100);
  }, [isRolling, hasRolled, currentPlayer, pieces]);

  // 获取可移动的棋子
  const getMovablePieces = useCallback((dice: number) => {
    return pieces.filter(p => {
      if (p.color !== currentPlayer || p.isHome) return false;
      
      // 在基地的棋子需要掷出6才能出发
      if (p.position === -1) {
        return dice === 6;
      }
      
      // 计算目标位置
      const targetPos = calculateTargetPosition(p, dice);
      return targetPos !== null;
    });
  }, [pieces, currentPlayer]);

  // 计算目标位置
  const calculateTargetPosition = (piece: Piece, dice: number): number | null => {
    if (piece.position === -1) {
      // 从基地出发
      return dice === 6 ? START_POSITIONS[piece.color] : null;
    }
    
    let newPos = piece.position + dice;
    
    // 检查是否进入终点路径
    const homeEntry = HOME_ENTRY[piece.color];
    if (piece.position <= homeEntry && newPos > homeEntry) {
      const stepsIntoHome = newPos - homeEntry - 1;
      if (stepsIntoHome <= 5) {
        return 52 + stepsIntoHome; // 终点路径
      }
      return null; // 超出终点
    }
    
    // 主路径循环
    if (newPos > 51 && piece.position < 52) {
      newPos = newPos - 52;
    }
    
    // 终点路径
    if (piece.position >= 52) {
      newPos = piece.position + dice;
      if (newPos > 56) return null; // 超出终点
    }
    
    return newPos;
  };

  // 移动棋子
  const movePiece = useCallback((pieceId: number) => {
    if (!hasRolled || winner) return;
    
    const piece = pieces.find(p => p.id === pieceId);
    if (!piece || piece.color !== currentPlayer) return;
    
    const targetPos = calculateTargetPosition(piece, diceValue);
    if (targetPos === null) {
      toast.error("无法移动到该位置");
      return;
    }
    
    setPieces(prev => {
      const newPieces = [...prev];
      const pieceIndex = newPieces.findIndex(p => p.id === pieceId);
      
      // 检查是否撞到其他棋子（主路径上）
      if (targetPos < 52) {
        const hitPiece = newPieces.find(p => 
          p.id !== pieceId && 
          p.position === targetPos && 
          p.position >= 0 && 
          p.position < 52
        );
        if (hitPiece && hitPiece.color !== piece.color) {
          // 把对方棋子送回基地
          const hitIndex = newPieces.findIndex(p => p.id === hitPiece.id);
          newPieces[hitIndex] = { ...hitPiece, position: -1 };
          toast.success(`${PLAYER_COLORS[piece.color].name}吃掉了${PLAYER_COLORS[hitPiece.color].name}的棋子！`);
        }
      }
      
      // 移动棋子
      newPieces[pieceIndex] = {
        ...piece,
        position: targetPos,
        isHome: targetPos === 56,
      };
      
      // 检查是否获胜
      const playerPieces = newPieces.filter(p => p.color === piece.color);
      if (playerPieces.every(p => p.isHome)) {
        setWinner(piece.color);
        toast.success(`🎉 ${PLAYER_COLORS[piece.color].name}获胜！`);
        // 如果红方（玩家）获胜，发放奖励
        if (piece.color === "red") {
          setTimeout(() => grantReward(), 500);
        }
      }
      
      return newPieces;
    });
    
    // 掷出6可以再掷一次
    if (diceValue === 6) {
      setHasRolled(false);
      toast.info("掷出6，可以再掷一次！");
    } else {
      setTimeout(() => nextTurn(diceValue), 500);
    }
  }, [hasRolled, pieces, currentPlayer, diceValue, winner]);

  // 下一回合
  const nextTurn = useCallback((lastDice: number) => {
    const players: PlayerColor[] = ["red", "blue", "green", "yellow"];
    const currentIndex = players.indexOf(currentPlayer);
    const nextPlayer = players[(currentIndex + 1) % 4];
    
    setCurrentPlayer(nextPlayer);
    setHasRolled(false);
    setDiceValue(0);
    setSelectedPiece(null);
    
    // AI自动掷骰子
    if (nextPlayer !== "red") {
      setTimeout(() => {
        aiTurn(nextPlayer);
      }, 800);
    }
  }, [currentPlayer]);

  // AI回合
  const aiTurn = useCallback((player: PlayerColor) => {
    // 掷骰子
    setIsRolling(true);
    let count = 0;
    const interval = setInterval(() => {
      setDiceValue(Math.floor(Math.random() * 6) + 1);
      count++;
      if (count >= 8) {
        clearInterval(interval);
        const dice = Math.floor(Math.random() * 6) + 1;
        setDiceValue(dice);
        setIsRolling(false);
        setHasRolled(true);
        
        // AI选择移动
        setTimeout(() => {
          const movable = pieces.filter(p => {
            if (p.color !== player || p.isHome) return false;
            if (p.position === -1) return dice === 6;
            return calculateTargetPosition(p, dice) !== null;
          });
          
          if (movable.length > 0) {
            // 优先选择可以吃子的棋子
            let chosen = movable[0];
            for (const p of movable) {
              const target = calculateTargetPosition(p, dice);
              if (target !== null && target < 52) {
                const canEat = pieces.some(other => 
                  other.color !== player && 
                  other.position === target &&
                  other.position >= 0
                );
                if (canEat) {
                  chosen = p;
                  break;
                }
              }
              // 优先移动快到终点的棋子
              if (p.position >= 0 && p.position > chosen.position) {
                chosen = p;
              }
            }
            
            // 执行移动
            setPieces(prev => {
              const newPieces = [...prev];
              const pieceIndex = newPieces.findIndex(pi => pi.id === chosen.id);
              const targetPos = calculateTargetPosition(chosen, dice)!;
              
              // 检查吃子
              if (targetPos < 52) {
                const hitPiece = newPieces.find(pi => 
                  pi.id !== chosen.id && 
                  pi.position === targetPos && 
                  pi.position >= 0 && 
                  pi.position < 52
                );
                if (hitPiece && hitPiece.color !== player) {
                  const hitIndex = newPieces.findIndex(pi => pi.id === hitPiece.id);
                  newPieces[hitIndex] = { ...hitPiece, position: -1 };
                  toast.info(`${PLAYER_COLORS[player].name}吃掉了${PLAYER_COLORS[hitPiece.color].name}的棋子！`);
                }
              }
              
              newPieces[pieceIndex] = {
                ...chosen,
                position: targetPos,
                isHome: targetPos === 56,
              };
              
              // 检查获胜
              const playerPieces = newPieces.filter(pi => pi.color === player);
              if (playerPieces.every(pi => pi.isHome)) {
                setWinner(player);
                toast.success(`🎉 ${PLAYER_COLORS[player].name}获胜！`);
              }
              
              return newPieces;
            });
            
            // 掷出6再掷
            if (dice === 6 && !winner) {
              setTimeout(() => aiTurn(player), 1000);
            } else {
              setTimeout(() => nextTurn(dice), 800);
            }
          } else {
            // 没有可移动的棋子
            setTimeout(() => nextTurn(dice), 500);
          }
        }, 600);
      }
    }, 80);
  }, [pieces, winner, nextTurn]);

  // 渲染棋盘格子
  const renderBoard = () => {
    const cells = [];
    const size = 11;
    
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const cellType = getCellType(row, col);
        cells.push(
          <div
            key={`${row}-${col}`}
            className={`aspect-square border border-gray-200 flex items-center justify-center text-xs ${cellType.bg}`}
          >
            {renderPiecesInCell(row, col)}
          </div>
        );
      }
    }
    
    return cells;
  };

  // 获取格子类型
  const getCellType = (row: number, col: number) => {
    // 四个角落的基地
    if (row < 4 && col < 4) return { bg: "bg-red-200", type: "base-red" };
    if (row < 4 && col > 6) return { bg: "bg-blue-200", type: "base-blue" };
    if (row > 6 && col < 4) return { bg: "bg-yellow-200", type: "base-yellow" };
    if (row > 6 && col > 6) return { bg: "bg-green-200", type: "base-green" };
    
    // 中心终点区域
    if (row >= 4 && row <= 6 && col >= 4 && col <= 6) {
      if (row === 5 && col === 5) return { bg: "bg-[#d44]", type: "center" };
      if (row === 5 && col < 5) return { bg: "bg-red-100", type: "home-red" };
      if (col === 5 && row < 5) return { bg: "bg-blue-100", type: "home-blue" };
      if (row === 5 && col > 5) return { bg: "bg-green-100", type: "home-green" };
      if (col === 5 && row > 5) return { bg: "bg-[#FAF3ED]", type: "home-yellow" };
      return { bg: "bg-gray-100", type: "empty" };
    }
    
    // 主路径
    if ((row === 4 || row === 6) && (col < 4 || col > 6)) return { bg: "bg-white", type: "path" };
    if ((col === 4 || col === 6) && (row < 4 || row > 6)) return { bg: "bg-white", type: "path" };
    if (row === 5 && (col < 4 || col > 6)) return { bg: "bg-white", type: "path" };
    if (col === 5 && (row < 4 || row > 6)) return { bg: "bg-white", type: "path" };
    
    return { bg: "bg-gray-50", type: "empty" };
  };

  // 渲染格子中的棋子
  const renderPiecesInCell = (row: number, col: number) => {
    const cellPieces = pieces.filter(p => {
      const pos = getPiecePosition(p);
      return pos.row === row && pos.col === col;
    });
    
    if (cellPieces.length === 0) return null;
    
    return (
      <div className="flex flex-wrap gap-0.5 justify-center">
        {cellPieces.map(p => {
          const isMovable = hasRolled && 
            p.color === currentPlayer && 
            !p.isHome && 
            calculateTargetPosition(p, diceValue) !== null;
          
          return (
            <button
              key={p.id}
              onClick={() => isMovable && movePiece(p.id)}
              className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full ${PLAYER_COLORS[p.color].bg} 
                ${isMovable ? "ring-2 ring-white animate-pulse cursor-pointer" : "cursor-default"}
                ${selectedPiece === p.id ? "ring-2 ring-black" : ""}
                shadow-md transition-all`}
              disabled={!isMovable}
            />
          );
        })}
      </div>
    );
  };

  // 获取棋子在棋盘上的位置
  const getPiecePosition = (piece: Piece): { row: number; col: number } => {
    // 基地位置
    if (piece.position === -1) {
      const basePositions: Record<PlayerColor, { row: number; col: number }[]> = {
        red: [{ row: 1, col: 1 }, { row: 1, col: 2 }, { row: 2, col: 1 }, { row: 2, col: 2 }],
        blue: [{ row: 1, col: 8 }, { row: 1, col: 9 }, { row: 2, col: 8 }, { row: 2, col: 9 }],
        yellow: [{ row: 8, col: 1 }, { row: 8, col: 2 }, { row: 9, col: 1 }, { row: 9, col: 2 }],
        green: [{ row: 8, col: 8 }, { row: 8, col: 9 }, { row: 9, col: 8 }, { row: 9, col: 9 }],
      };
      const sameColorPieces = pieces.filter(p => p.color === piece.color && p.position === -1);
      const index = sameColorPieces.findIndex(p => p.id === piece.id);
      return basePositions[piece.color][index] || { row: 0, col: 0 };
    }
    
    // 终点路径
    if (piece.position >= 52) {
      const homeStep = piece.position - 52;
      const homePositions: Record<PlayerColor, { row: number; col: number }[]> = {
        red: [{ row: 5, col: 1 }, { row: 5, col: 2 }, { row: 5, col: 3 }, { row: 5, col: 4 }, { row: 5, col: 5 }],
        blue: [{ row: 1, col: 5 }, { row: 2, col: 5 }, { row: 3, col: 5 }, { row: 4, col: 5 }, { row: 5, col: 5 }],
        green: [{ row: 5, col: 9 }, { row: 5, col: 8 }, { row: 5, col: 7 }, { row: 5, col: 6 }, { row: 5, col: 5 }],
        yellow: [{ row: 9, col: 5 }, { row: 8, col: 5 }, { row: 7, col: 5 }, { row: 6, col: 5 }, { row: 5, col: 5 }],
      };
      return homePositions[piece.color][homeStep] || { row: 5, col: 5 };
    }
    
    // 主路径位置映射（简化版52格）
    const pathPositions: { row: number; col: number }[] = [
      // 红方起点开始，顺时针
      { row: 5, col: 0 }, { row: 5, col: 1 }, { row: 5, col: 2 }, { row: 5, col: 3 },
      { row: 4, col: 4 }, { row: 3, col: 4 }, { row: 2, col: 4 }, { row: 1, col: 4 }, { row: 0, col: 4 },
      { row: 0, col: 5 }, { row: 0, col: 6 },
      { row: 1, col: 6 }, { row: 2, col: 6 }, // 蓝方起点
      { row: 3, col: 6 }, { row: 4, col: 6 },
      { row: 4, col: 7 }, { row: 4, col: 8 }, { row: 4, col: 9 }, { row: 4, col: 10 },
      { row: 5, col: 10 }, { row: 6, col: 10 },
      { row: 6, col: 9 }, { row: 6, col: 8 }, { row: 6, col: 7 }, { row: 6, col: 6 },
      { row: 7, col: 6 }, // 绿方起点
      { row: 8, col: 6 }, { row: 9, col: 6 }, { row: 10, col: 6 },
      { row: 10, col: 5 }, { row: 10, col: 4 },
      { row: 9, col: 4 }, { row: 8, col: 4 }, { row: 7, col: 4 }, { row: 6, col: 4 },
      { row: 6, col: 3 }, { row: 6, col: 2 }, // 黄方起点
      { row: 6, col: 1 }, { row: 6, col: 0 },
      { row: 5, col: 0 }, // 循环回起点
    ];
    
    // 简化：直接用position对应位置
    const pos = piece.position % pathPositions.length;
    return pathPositions[pos] || { row: 5, col: 5 };
  };

  const DiceIcon = diceValue > 0 ? DiceIcons[diceValue - 1] : Dice1;

  return (
    <div className="min-h-screen bg-background">
      {/* 顶部导航 */}
      <header className="z-50 glass border-b border-border/50">
        <div className="container flex items-center justify-between h-14">
          <Link href="/games">
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="w-4 h-4" />
              返回
            </Button>
          </Link>
          <h1 className="font-bold text-lg">飞行棋</h1>
          <Button variant="ghost" size="sm" onClick={initGame}>
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <main className="container py-4 pb-24">
        {!gameStarted ? (
          // 开始界面
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2">飞行棋</h2>
              <p className="text-muted-foreground">经典四人飞行棋，与电脑对战</p>
            </div>
            
            <Card className="p-6 max-w-sm w-full">
              <h3 className="font-semibold mb-4">游戏规则</h3>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li>• 掷出6才能让棋子从基地出发</li>
                <li>• 掷出6可以再掷一次</li>
                <li>• 走到对方棋子位置可以吃掉对方</li>
                <li>• 先把4个棋子都送到终点获胜</li>
              </ul>
            </Card>
            
            <Button onClick={initGame} className="btn-gradient gap-2">
              <Play className="w-5 h-5" />
              开始游戏
            </Button>
          </div>
        ) : winner ? (
          // 胜利界面
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
            <div className="text-center">
              <Trophy className={`w-20 h-20 mx-auto mb-4 ${PLAYER_COLORS[winner].text}`} />
              <h2 className="text-2xl font-bold mb-2">
                🎉 {PLAYER_COLORS[winner].name}获胜！
              </h2>
              <p className="text-muted-foreground">
                {winner === "red" ? "恭喜你赢得了比赛！" : "电脑获胜，再接再厉！"}
              </p>
            </div>
            <Button onClick={initGame} className="btn-gradient gap-2">
              <RotateCcw className="w-5 h-5" />
              再玩一局
            </Button>
          </div>
        ) : (
          // 游戏界面
          <div className="flex flex-col items-center gap-4">
            {/* 当前玩家和骰子 */}
            <Card className="p-4 w-full max-w-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full ${PLAYER_COLORS[currentPlayer].bg}`} />
                  <div>
                    <p className="font-semibold">{PLAYER_COLORS[currentPlayer].name}回合</p>
                    <p className="text-xs text-muted-foreground">
                      {currentPlayer === "red" ? "你的回合" : "电脑思考中..."}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-xl ${isRolling ? "animate-bounce" : ""} bg-white shadow-lg`}>
                    <DiceIcon className="w-8 h-8 text-primary" />
                  </div>
                  
                  {currentPlayer === "red" && !hasRolled && (
                    <Button 
                      onClick={rollDice} 
                      disabled={isRolling}
                      className="btn-gradient"
                    >
                      掷骰子
                    </Button>
                  )}
                </div>
              </div>
              
              {hasRolled && currentPlayer === "red" && (
                <p className="text-sm text-center mt-3 text-muted-foreground">
                  点击闪烁的棋子移动
                </p>
              )}
            </Card>

            {/* 棋盘 */}
            <div className="w-full max-w-md aspect-square">
              <div className="grid grid-cols-11 gap-0.5 bg-gray-300 p-1 rounded-xl">
                {renderBoard()}
              </div>
            </div>

            {/* 玩家状态 */}
            <div className="grid grid-cols-4 gap-2 w-full max-w-md">
              {(["red", "blue", "green", "yellow"] as PlayerColor[]).map(color => {
                const playerPieces = pieces.filter(p => p.color === color);
                const homePieces = playerPieces.filter(p => p.isHome).length;
                const isActive = currentPlayer === color;
                
                return (
                  <Card 
                    key={color} 
                    className={`p-2 text-center ${isActive ? "ring-2 ring-primary" : ""}`}
                  >
                    <div className={`w-6 h-6 rounded-full ${PLAYER_COLORS[color].bg} mx-auto mb-1`} />
                    <p className="text-xs font-medium">{PLAYER_COLORS[color].name}</p>
                    <p className="text-xs text-muted-foreground">{homePieces}/4 到达</p>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* 五角星奖励弹窗 */}
      {showReward && (
        <StarRewardPopup
          open={showReward}
          kidName={rewardKidName}
          stars={rewardStars}
          activityName="飞行棋获胜"
          onClose={() => setShowReward(false)}
        />
      )}
    </div>
  );
}
