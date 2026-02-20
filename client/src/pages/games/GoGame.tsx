import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "wouter";
import { ArrowLeft, RotateCcw, Play, Trophy, Circle, Undo2, Users, Bot, Star } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { StarRewardPopup } from "@/components/StarRewardPopup";

// 棋盘大小选项
type BoardSize = 9 | 13 | 19;

// 棋子类型
type Stone = "black" | "white" | null;

// 游戏模式
type GameMode = "ai" | "pvp";

// 游戏状态
interface GameState {
  board: Stone[][];
  currentPlayer: "black" | "white";
  blackCaptures: number;
  whiteCaptures: number;
  lastMove: { row: number; col: number } | null;
  history: Stone[][][];
  passes: number;
  gameOver: boolean;
  winner: "black" | "white" | "draw" | null;
}

export default function GoGame() {
  const [boardSize, setBoardSize] = useState<BoardSize>(9);
  const [gameMode, setGameMode] = useState<GameMode>("ai");
  const [gameStarted, setGameStarted] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [thinking, setThinking] = useState(false);

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

  // 获取围棋获胜奖励规则
  const getWinReward = () => {
    const rule = rewardRules?.find((r: { activityType: string; isActive: boolean; starsReward: number }) => r.activityType === "go_win" && r.isActive);
    return rule?.starsReward || 5; // 默认5星
  };

  // 发放奖励
  const grantReward = async () => {
    if (!selectedKidId || !currentKid) return;
    
    try {
      const result = await awardStarsMutation.mutateAsync({
        kidId: selectedKidId,
        activityType: "go_win",
        description: "围棋获胜",
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
  const initGame = useCallback((size: BoardSize = boardSize) => {
    const board: Stone[][] = Array(size).fill(null).map(() => Array(size).fill(null));
    setGameState({
      board,
      currentPlayer: "black",
      blackCaptures: 0,
      whiteCaptures: 0,
      lastMove: null,
      history: [board.map(row => [...row])],
      passes: 0,
      gameOver: false,
      winner: null,
    });
    setBoardSize(size);
    setGameStarted(true);
  }, [boardSize]);

  // 检查是否有气
  const hasLiberty = useCallback((board: Stone[][], row: number, col: number, visited: Set<string> = new Set()): boolean => {
    const size = board.length;
    const stone = board[row][col];
    if (!stone) return true;
    
    const key = `${row},${col}`;
    if (visited.has(key)) return false;
    visited.add(key);
    
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    
    for (const [dr, dc] of directions) {
      const newRow = row + dr;
      const newCol = col + dc;
      
      if (newRow < 0 || newRow >= size || newCol < 0 || newCol >= size) continue;
      
      const neighbor = board[newRow][newCol];
      if (neighbor === null) return true;
      if (neighbor === stone && hasLiberty(board, newRow, newCol, visited)) return true;
    }
    
    return false;
  }, []);

  // 移除死子
  const removeDeadStones = useCallback((board: Stone[][], targetColor: Stone): { newBoard: Stone[][]; captured: number } => {
    const size = board.length;
    const newBoard = board.map(row => [...row]);
    let captured = 0;
    
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        if (newBoard[row][col] === targetColor) {
          if (!hasLiberty(newBoard, row, col)) {
            const toRemove: { row: number; col: number }[] = [];
            const visited = new Set<string>();
            const stack = [{ row, col }];
            
            while (stack.length > 0) {
              const { row: r, col: c } = stack.pop()!;
              const key = `${r},${c}`;
              if (visited.has(key)) continue;
              if (newBoard[r][c] !== targetColor) continue;
              
              visited.add(key);
              toRemove.push({ row: r, col: c });
              
              const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
              for (const [dr, dc] of directions) {
                const nr = r + dr;
                const nc = c + dc;
                if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
                  stack.push({ row: nr, col: nc });
                }
              }
            }
            
            for (const { row: r, col: c } of toRemove) {
              newBoard[r][c] = null;
              captured++;
            }
          }
        }
      }
    }
    
    return { newBoard, captured };
  }, [hasLiberty]);

  // 检查是否是有效落子
  const isValidMove = useCallback((board: Stone[][], row: number, col: number, color: Stone, history: Stone[][][]): boolean => {
    if (board[row][col] !== null) return false;
    
    const testBoard = board.map(r => [...r]);
    testBoard[row][col] = color;
    
    const opponent = color === "black" ? "white" : "black";
    const { newBoard: afterCapture } = removeDeadStones(testBoard, opponent);
    
    if (!hasLiberty(afterCapture, row, col)) {
      return false;
    }
    
    const boardStr = afterCapture.map(r => r.join(",")).join(";");
    for (const h of history) {
      const hStr = h.map(r => r.join(",")).join(";");
      if (boardStr === hStr) return false;
    }
    
    return true;
  }, [hasLiberty, removeDeadStones]);

  // 落子
  const placeStone = useCallback((row: number, col: number) => {
    if (!gameState || gameState.gameOver || thinking) return;
    
    // AI模式下，玩家只能下黑棋
    if (gameMode === "ai" && gameState.currentPlayer !== "black") return;
    
    if (!isValidMove(gameState.board, row, col, gameState.currentPlayer, gameState.history)) {
      toast.error("无效的落子位置");
      return;
    }
    
    const currentColor = gameState.currentPlayer;
    const newBoard = gameState.board.map(r => [...r]);
    newBoard[row][col] = currentColor;
    
    const opponent = currentColor === "black" ? "white" : "black";
    const { newBoard: afterCapture, captured } = removeDeadStones(newBoard, opponent);
    
    const newCaptures = currentColor === "black" 
      ? { blackCaptures: gameState.blackCaptures + captured, whiteCaptures: gameState.whiteCaptures }
      : { blackCaptures: gameState.blackCaptures, whiteCaptures: gameState.whiteCaptures + captured };
    
    const newState: GameState = {
      ...gameState,
      board: afterCapture,
      currentPlayer: opponent,
      ...newCaptures,
      lastMove: { row, col },
      history: [...gameState.history, afterCapture.map(r => [...r])],
      passes: 0,
    };
    
    setGameState(newState);
    
    // AI模式下，轮到AI
    if (gameMode === "ai" && opponent === "white") {
      setTimeout(() => aiMove(newState), 500);
    }
  }, [gameState, thinking, gameMode, isValidMove, removeDeadStones]);

  // AI落子
  const aiMove = useCallback((state: GameState) => {
    if (state.gameOver) return;
    
    setThinking(true);
    
    setTimeout(() => {
      const size = state.board.length;
      const validMoves: { row: number; col: number; score: number }[] = [];
      
      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          if (isValidMove(state.board, row, col, "white", state.history)) {
            let score = 0;
            
            const testBoard = state.board.map(r => [...r]);
            testBoard[row][col] = "white";
            const { captured } = removeDeadStones(testBoard, "black");
            score += captured * 10;
            
            const center = Math.floor(size / 2);
            const distToCenter = Math.abs(row - center) + Math.abs(col - center);
            score += (size - distToCenter);
            
            const directions = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
            for (const [dr, dc] of directions) {
              const nr = row + dr;
              const nc = col + dc;
              if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
                if (state.board[nr][nc] === "white") score += 2;
                if (state.board[nr][nc] === "black") score += 1;
              }
            }
            
            const starPoints = getStarPoints(size);
            if (starPoints.some(p => p.row === row && p.col === col)) {
              score += 3;
            }
            
            score += Math.random() * 2;
            
            validMoves.push({ row, col, score });
          }
        }
      }
      
      if (validMoves.length === 0) {
        const newPasses = state.passes + 1;
        if (newPasses >= 2) {
          endGame(state);
        } else {
          setGameState({
            ...state,
            currentPlayer: "black",
            passes: newPasses,
          });
          toast.info("白方跳过");
        }
        setThinking(false);
        return;
      }
      
      validMoves.sort((a, b) => b.score - a.score);
      const bestMove = validMoves[0];
      
      const newBoard = state.board.map(r => [...r]);
      newBoard[bestMove.row][bestMove.col] = "white";
      
      const { newBoard: afterCapture, captured } = removeDeadStones(newBoard, "black");
      
      setGameState({
        ...state,
        board: afterCapture,
        currentPlayer: "black",
        whiteCaptures: state.whiteCaptures + captured,
        lastMove: { row: bestMove.row, col: bestMove.col },
        history: [...state.history, afterCapture.map(r => [...r])],
        passes: 0,
      });
      
      setThinking(false);
    }, 300);
  }, [isValidMove, removeDeadStones]);

  // 获取星位
  const getStarPoints = (size: number): { row: number; col: number }[] => {
    if (size === 9) {
      return [
        { row: 2, col: 2 }, { row: 2, col: 6 },
        { row: 4, col: 4 },
        { row: 6, col: 2 }, { row: 6, col: 6 },
      ];
    } else if (size === 13) {
      return [
        { row: 3, col: 3 }, { row: 3, col: 9 },
        { row: 6, col: 6 },
        { row: 9, col: 3 }, { row: 9, col: 9 },
      ];
    } else {
      return [
        { row: 3, col: 3 }, { row: 3, col: 9 }, { row: 3, col: 15 },
        { row: 9, col: 3 }, { row: 9, col: 9 }, { row: 9, col: 15 },
        { row: 15, col: 3 }, { row: 15, col: 9 }, { row: 15, col: 15 },
      ];
    }
  };

  // 玩家跳过
  const pass = useCallback(() => {
    if (!gameState || gameState.gameOver || thinking) return;
    
    // AI模式下只有黑棋可以跳过
    if (gameMode === "ai" && gameState.currentPlayer !== "black") return;
    
    const newPasses = gameState.passes + 1;
    if (newPasses >= 2) {
      endGame(gameState);
      return;
    }
    
    const opponent = gameState.currentPlayer === "black" ? "white" : "black";
    const newState: GameState = {
      ...gameState,
      currentPlayer: opponent,
      passes: newPasses,
    };
    
    setGameState(newState);
    toast.info(`${gameState.currentPlayer === "black" ? "黑方" : "白方"}跳过`);
    
    // AI模式下，轮到AI
    if (gameMode === "ai" && opponent === "white") {
      setTimeout(() => aiMove(newState), 500);
    }
  }, [gameState, thinking, gameMode, aiMove]);

  // 结束游戏
  const endGame = useCallback((state: GameState) => {
    const blackScore = state.blackCaptures;
    const whiteScore = state.whiteCaptures + 6.5;
    
    let winner: "black" | "white" | "draw";
    if (blackScore > whiteScore) {
      winner = "black";
    } else if (whiteScore > blackScore) {
      winner = "white";
    } else {
      winner = "draw";
    }
    
    setGameState({
      ...state,
      gameOver: true,
      winner,
    });

    // 人机模式下玩家获胜，发放奖励
    if (gameMode === "ai" && winner === "black" && selectedKidId) {
      setTimeout(() => grantReward(), 500);
    }
  }, [gameMode, selectedKidId]);

  // 悔棋
  const undo = useCallback(() => {
    if (!gameState || thinking) return;
    
    // AI模式需要悔两步，双人模式悔一步
    const stepsBack = gameMode === "ai" ? 2 : 1;
    
    if (gameState.history.length < stepsBack + 1) return;
    
    const newHistory = gameState.history.slice(0, -stepsBack);
    const prevBoard = newHistory[newHistory.length - 1];
    
    // 计算回退后的当前玩家
    const currentPlayer = gameMode === "ai" ? "black" : 
      (gameState.currentPlayer === "black" ? "white" : "black");
    
    setGameState({
      ...gameState,
      board: prevBoard.map(row => [...row]),
      currentPlayer,
      lastMove: null,
      history: newHistory,
      gameOver: false,
      winner: null,
    });
    
    toast.info("已悔棋");
  }, [gameState, thinking, gameMode]);

  // 渲染棋盘
  const renderBoard = () => {
    if (!gameState) return null;
    
    const size = gameState.board.length;
    const starPoints = getStarPoints(size);
    
    const getCellSize = () => {
      if (size === 9) return { cell: 'min(10vw, 10vh, 56px)', stone: 'min(9vw, 9vh, 50px)', star: 'min(2vw, 2vh, 10px)' };
      if (size === 13) return { cell: 'min(7vw, 7vh, 44px)', stone: 'min(6.2vw, 6.2vh, 38px)', star: 'min(1.5vw, 1.5vh, 8px)' };
      return { cell: 'min(4.5vw, 4.5vh, 32px)', stone: 'min(4vw, 4vh, 28px)', star: 'min(1vw, 1vh, 6px)' };
    };
    
    const sizes = getCellSize();
    
    return (
      <div 
        className="inline-grid bg-cream p-3 md:p-4 rounded-lg shadow-lg"
        style={{ 
          gridTemplateColumns: `repeat(${size}, ${sizes.cell})`,
          gap: '0px'
        }}
      >
        {gameState.board.map((row, rowIndex) =>
          row.map((cell, colIndex) => {
            const isStarPoint = starPoints.some(p => p.row === rowIndex && p.col === colIndex);
            const isLastMove = gameState.lastMove?.row === rowIndex && gameState.lastMove?.col === colIndex;
            
            return (
              <div
                key={`${rowIndex}-${colIndex}`}
                className="relative flex items-center justify-center cursor-pointer"
                style={{ width: sizes.cell, height: sizes.cell }}
                onClick={() => placeStone(rowIndex, colIndex)}
              >
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="absolute bg-brand-gold/60 w-full h-px" />
                  <div className="absolute bg-brand-gold/60 w-px h-full" />
                </div>
                
                {isStarPoint && !cell && (
                  <div 
                    className="absolute bg-brand-gold/80 rounded-full z-10" 
                    style={{ width: sizes.star, height: sizes.star }}
                  />
                )}
                
                {cell && (
                  <div 
                    className={`rounded-full z-20 shadow-md transition-transform
                      ${cell === "black" 
                        ? "bg-gradient-to-br from-gray-700 to-black" 
                        : "bg-gradient-to-br from-white to-gray-200 border border-gray-300"
                      }
                      ${isLastMove ? "ring-2 ring-red-500" : ""}
                    `}
                    style={{ width: sizes.stone, height: sizes.stone }}
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="z-50 glass border-b border-border/50">
        <div className="container flex items-center justify-between h-14">
          <Link href="/games">
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="w-4 h-4" />
              返回
            </Button>
          </Link>
          <h1 className="font-bold text-lg">围棋</h1>
          <Button variant="ghost" size="sm" onClick={() => { setGameStarted(false); setGameState(null); }}>
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <main className="container py-4 pb-24">
        {!gameStarted ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2">围棋</h2>
              <p className="text-muted-foreground">古老的智慧游戏</p>
            </div>
            
            {/* 当前选择的孩子 */}
            {currentKid && (
              <Card className="p-4 max-w-sm w-full bg-gradient-to-r from-amber-50 to-amber-100 border-amber-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-amber-300">
                    {currentKid.avatar ? (
                      <img src={currentKid.avatar} alt={currentKid.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center text-white font-bold">
                        {currentKid.name[0]}
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{currentKid.name} 正在玩</p>
                    <div className="flex items-center gap-1 text-sm text-brand-gold">
                      <Star className="w-4 h-4 fill-current" />
                      <span>获胜可得 {getWinReward()} 颗星星</span>
                    </div>
                  </div>
                </div>
              </Card>
            )}
            
            {/* 游戏模式选择 */}
            <Card className="p-6 max-w-sm w-full">
              <h3 className="font-semibold mb-4">选择游戏模式</h3>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant={gameMode === "ai" ? "default" : "outline"}
                  onClick={() => setGameMode("ai")}
                  className={`flex flex-col h-auto py-4 ${gameMode === "ai" ? "btn-gradient" : ""}`}
                >
                  <Bot className="w-6 h-6 mb-2" />
                  <span>人机对战</span>
                  <span className="text-xs opacity-70">与电脑对战</span>
                </Button>
                <Button
                  variant={gameMode === "pvp" ? "default" : "outline"}
                  onClick={() => setGameMode("pvp")}
                  className={`flex flex-col h-auto py-4 ${gameMode === "pvp" ? "btn-gradient" : ""}`}
                >
                  <Users className="w-6 h-6 mb-2" />
                  <span>双人对战</span>
                  <span className="text-xs opacity-70">本地轮流下棋</span>
                </Button>
              </div>
            </Card>
            
            <Card className="p-6 max-w-sm w-full">
              <h3 className="font-semibold mb-4">选择棋盘大小</h3>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {([9, 13, 19] as BoardSize[]).map((size) => (
                  <Button
                    key={size}
                    variant={boardSize === size ? "default" : "outline"}
                    onClick={() => setBoardSize(size)}
                    className={boardSize === size ? "btn-gradient" : ""}
                  >
                    {size}×{size}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground text-center">
                {boardSize === 9 ? "适合初学者" : boardSize === 13 ? "中级难度" : "标准棋盘"}
              </p>
            </Card>

            <Card className="p-6 max-w-sm w-full">
              <h3 className="font-semibold mb-4">游戏规则</h3>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li>• 黑棋先行，轮流落子</li>
                <li>• 围住对方棋子可以吃掉</li>
                <li>• 不能自杀（落子后无气）</li>
                <li>• 双方连续跳过则游戏结束</li>
              </ul>
            </Card>
            
            <Button onClick={() => initGame()} className="btn-gradient gap-2">
              <Play className="w-5 h-5" />
              开始游戏
            </Button>
          </div>
        ) : gameState?.gameOver ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
            <div className="text-center">
              <Trophy className={`w-20 h-20 mx-auto mb-4 ${
                gameState.winner === "black" ? "text-gray-800" : 
                gameState.winner === "white" ? "text-gray-400" : "text-amber-500"
              }`} />
              <h2 className="text-2xl font-bold mb-2">
                {gameState.winner === "black" ? "🎉 黑棋获胜！" : 
                 gameState.winner === "white" ? "白棋获胜！" : "平局"}
              </h2>
              <p className="text-muted-foreground">
                黑棋吃子: {gameState.blackCaptures} | 白棋吃子: {gameState.whiteCaptures}
              </p>
            </div>
            <Button onClick={() => { setGameStarted(false); setGameState(null); }} className="btn-gradient gap-2">
              <RotateCcw className="w-5 h-5" />
              再玩一局
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <Card className="p-4 w-full max-w-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full ${
                    gameState?.currentPlayer === "black" 
                      ? "bg-gradient-to-br from-gray-700 to-black" 
                      : "bg-gradient-to-br from-white to-gray-200 border border-gray-300"
                  }`} />
                  <div>
                    <p className="font-semibold">
                      {gameMode === "ai" 
                        ? (gameState?.currentPlayer === "black" ? "你的回合" : "电脑思考中...")
                        : (gameState?.currentPlayer === "black" ? "黑棋回合" : "白棋回合")
                      }
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {thinking ? "请稍候..." : "点击棋盘落子"}
                    </p>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={undo}
                    disabled={thinking || !gameState || gameState.history.length < (gameMode === "ai" ? 3 : 2)}
                  >
                    <Undo2 className="w-4 h-4 mr-1" />
                    悔棋
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={pass}
                    disabled={thinking || (gameMode === "ai" && gameState?.currentPlayer !== "black")}
                  >
                    跳过
                  </Button>
                </div>
              </div>
            </Card>

            <div className="flex gap-2 text-sm">
              <div className="flex items-center gap-2">
                <Circle className="w-4 h-4 fill-black text-black" />
                <span>吃子: {gameState?.blackCaptures || 0}</span>
              </div>
              <div className="flex items-center gap-2">
                <Circle className="w-4 h-4 fill-white text-gray-400" />
                <span>吃子: {gameState?.whiteCaptures || 0}</span>
              </div>
            </div>

            <div className="overflow-auto max-w-full flex justify-center">
              {renderBoard()}
            </div>
          </div>
        )}
      </main>

      {/* 奖励弹窗 */}
      <StarRewardPopup
        open={showReward}
        onClose={() => setShowReward(false)}
        stars={rewardStars}
        activityName="围棋获胜"
        kidName={rewardKidName}
      />
    </div>
  );
}
