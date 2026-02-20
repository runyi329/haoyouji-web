import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "wouter";
import { ArrowLeft, RotateCcw, Trophy, Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { useState, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { StarRewardPopup } from "@/components/StarRewardPopup";

// 棋子类型
type PieceType = "king" | "queen" | "rook" | "bishop" | "knight" | "pawn";
type PieceColor = "white" | "black";

interface Piece {
  type: PieceType;
  color: PieceColor;
}

type Board = (Piece | null)[][];
type Position = { row: number; col: number };

// 棋子Unicode符号
const pieceSymbols: Record<PieceColor, Record<PieceType, string>> = {
  white: {
    king: "♔",
    queen: "♕",
    rook: "♖",
    bishop: "♗",
    knight: "♘",
    pawn: "♙",
  },
  black: {
    king: "♚",
    queen: "♛",
    rook: "♜",
    bishop: "♝",
    knight: "♞",
    pawn: "♟",
  },
};

// 初始化棋盘
const initializeBoard = (): Board => {
  const board: Board = Array(8).fill(null).map(() => Array(8).fill(null));
  
  // 黑方棋子（顶部）
  board[0] = [
    { type: "rook", color: "black" },
    { type: "knight", color: "black" },
    { type: "bishop", color: "black" },
    { type: "queen", color: "black" },
    { type: "king", color: "black" },
    { type: "bishop", color: "black" },
    { type: "knight", color: "black" },
    { type: "rook", color: "black" },
  ];
  board[1] = Array(8).fill(null).map(() => ({ type: "pawn" as PieceType, color: "black" as PieceColor }));
  
  // 白方棋子（底部）
  board[6] = Array(8).fill(null).map(() => ({ type: "pawn" as PieceType, color: "white" as PieceColor }));
  board[7] = [
    { type: "rook", color: "white" },
    { type: "knight", color: "white" },
    { type: "bishop", color: "white" },
    { type: "queen", color: "white" },
    { type: "king", color: "white" },
    { type: "bishop", color: "white" },
    { type: "knight", color: "white" },
    { type: "rook", color: "white" },
  ];
  
  return board;
};

// 检查移动是否在棋盘内
const isInBoard = (row: number, col: number): boolean => {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
};

// 获取棋子可能的移动位置
const getPossibleMoves = (board: Board, pos: Position, piece: Piece): Position[] => {
  const moves: Position[] = [];
  const { row, col } = pos;
  const { type, color } = piece;
  
  const addMoveIfValid = (r: number, c: number, canCapture = true, mustCapture = false): boolean => {
    if (!isInBoard(r, c)) return false;
    const target = board[r][c];
    if (target === null) {
      if (!mustCapture) moves.push({ row: r, col: c });
      return true;
    } else if (target.color !== color && canCapture) {
      moves.push({ row: r, col: c });
      return false;
    }
    return false;
  };
  
  const addLineMoves = (dr: number, dc: number) => {
    for (let i = 1; i < 8; i++) {
      if (!addMoveIfValid(row + dr * i, col + dc * i)) break;
    }
  };
  
  switch (type) {
    case "pawn": {
      const direction = color === "white" ? -1 : 1;
      const startRow = color === "white" ? 6 : 1;
      
      // 前进一步
      if (isInBoard(row + direction, col) && board[row + direction][col] === null) {
        moves.push({ row: row + direction, col });
        
        // 初始位置可以前进两步
        if (row === startRow && board[row + 2 * direction][col] === null) {
          moves.push({ row: row + 2 * direction, col });
        }
      }
      
      // 吃子（斜向）
      for (const dc of [-1, 1]) {
        const r = row + direction;
        const c = col + dc;
        if (isInBoard(r, c) && board[r][c] && board[r][c]!.color !== color) {
          moves.push({ row: r, col: c });
        }
      }
      break;
    }
    
    case "rook":
      addLineMoves(0, 1);
      addLineMoves(0, -1);
      addLineMoves(1, 0);
      addLineMoves(-1, 0);
      break;
    
    case "bishop":
      addLineMoves(1, 1);
      addLineMoves(1, -1);
      addLineMoves(-1, 1);
      addLineMoves(-1, -1);
      break;
    
    case "queen":
      addLineMoves(0, 1);
      addLineMoves(0, -1);
      addLineMoves(1, 0);
      addLineMoves(-1, 0);
      addLineMoves(1, 1);
      addLineMoves(1, -1);
      addLineMoves(-1, 1);
      addLineMoves(-1, -1);
      break;
    
    case "knight": {
      const knightMoves = [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1]
      ];
      for (const [dr, dc] of knightMoves) {
        addMoveIfValid(row + dr, col + dc);
      }
      break;
    }
    
    case "king": {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr !== 0 || dc !== 0) {
            addMoveIfValid(row + dr, col + dc);
          }
        }
      }
      break;
    }
  }
  
  return moves;
};

// 检查是否被将军
const isInCheck = (board: Board, kingColor: PieceColor): boolean => {
  let kingPos: Position | null = null;
  
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && piece.type === "king" && piece.color === kingColor) {
        kingPos = { row: r, col: c };
        break;
      }
    }
    if (kingPos) break;
  }
  
  if (!kingPos) return false;
  
  // 检查对方是否能攻击国王
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && piece.color !== kingColor) {
        const moves = getPossibleMoves(board, { row: r, col: c }, piece);
        if (moves.some(m => m.row === kingPos!.row && m.col === kingPos!.col)) {
          return true;
        }
      }
    }
  }
  
  return false;
};

// 检查是否是将死
const isCheckmate = (board: Board, kingColor: PieceColor): boolean => {
  if (!isInCheck(board, kingColor)) return false;
  
  // 检查是否有任何合法移动可以解除将军
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && piece.color === kingColor) {
        const moves = getPossibleMoves(board, { row: r, col: c }, piece);
        for (const move of moves) {
          // 模拟移动
          const testBoard = board.map(row => [...row]);
          testBoard[move.row][move.col] = piece;
          testBoard[r][c] = null;
          
          if (!isInCheck(testBoard, kingColor)) {
            return false;
          }
        }
      }
    }
  }
  
  return true;
};

// 简单AI：随机选择一个合法移动
const getAIMove = (board: Board): { from: Position; to: Position } | null => {
  const allMoves: { from: Position; to: Position; score: number }[] = [];
  
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && piece.color === "black") {
        const moves = getPossibleMoves(board, { row: r, col: c }, piece);
        moves.forEach(to => {
          // 计算移动分数
          let score = Math.random() * 10;
          const targetPiece = board[to.row][to.col];
          if (targetPiece) {
            // 吃子加分
            const pieceValues: Record<PieceType, number> = {
              pawn: 10,
              knight: 30,
              bishop: 30,
              rook: 50,
              queen: 90,
              king: 900,
            };
            score += pieceValues[targetPiece.type];
          }
          // 控制中心加分
          if (to.row >= 3 && to.row <= 4 && to.col >= 3 && to.col <= 4) {
            score += 5;
          }
          allMoves.push({ from: { row: r, col: c }, to, score });
        });
      }
    }
  }
  
  if (allMoves.length === 0) return null;
  
  // 按分数排序，选择最高分的移动
  allMoves.sort((a, b) => b.score - a.score);
  return allMoves[0];
};

export default function ChessGame() {
  const [board, setBoard] = useState<Board>(initializeBoard);
  const [selectedPos, setSelectedPos] = useState<Position | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<Position[]>([]);
  const [currentTurn, setCurrentTurn] = useState<PieceColor>("white");
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState<PieceColor | null>(null);
  const [moveCount, setMoveCount] = useState(0);
  const [isThinking, setIsThinking] = useState(false);
  
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

  // 获取国际象棋获胜奖励规则
  const getWinReward = () => {
    const rule = rewardRules?.find((r: { activityType: string; isActive: boolean; starsReward: number }) => r.activityType === "chess_win" && r.isActive);
    return rule?.starsReward || 2; // 默认2星
  };

  // 发放奖励
  const grantReward = async () => {
    if (!selectedKidId || !currentKid) return;
    
    try {
      const result = await awardStarsMutation.mutateAsync({
        kidId: selectedKidId,
        activityType: "chess_win",
        description: "国际象棋获胜",
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

  // AI移动
  const makeAIMove = useCallback(() => {
    if (currentTurn !== "black" || gameOver) return;
    
    setIsThinking(true);
    
    // 延迟执行，让用户看到"思考中"状态
    setTimeout(() => {
      const aiMove = getAIMove(board);
      
      if (aiMove) {
        const newBoard = board.map(row => [...row]);
        const piece = newBoard[aiMove.from.row][aiMove.from.col];
        
        // 检查是否吃掉了国王
        const targetPiece = newBoard[aiMove.to.row][aiMove.to.col];
        if (targetPiece && targetPiece.type === "king") {
          setGameOver(true);
          setWinner("black");
          toast.error("电脑获胜！再接再厉！");
        }
        
        newBoard[aiMove.to.row][aiMove.to.col] = piece;
        newBoard[aiMove.from.row][aiMove.from.col] = null;
        
        // 兵升变
        if (piece?.type === "pawn" && aiMove.to.row === 7) {
          newBoard[aiMove.to.row][aiMove.to.col] = { type: "queen", color: "black" };
        }
        
        setBoard(newBoard);
        setCurrentTurn("white");
        setMoveCount(prev => prev + 1);
      } else {
        // AI无法移动，玩家获胜
        setGameOver(true);
        setWinner("white");
        toast.success("恭喜你获胜！🎉");
        // 发放奖励给赢家
        setTimeout(() => grantReward(), 500);
      }
      
      setIsThinking(false);
    }, 500);
  }, [board, currentTurn, gameOver]);

  // 监听轮到AI时自动移动
  useEffect(() => {
    if (currentTurn === "black" && !gameOver) {
      makeAIMove();
    }
  }, [currentTurn, gameOver, makeAIMove]);

  const handleCellClick = (row: number, col: number) => {
    if (gameOver || currentTurn !== "white" || isThinking) return;
    
    const clickedPiece = board[row][col];
    
    // 如果已选中棋子
    if (selectedPos) {
      // 检查是否是合法移动
      const isValidMove = possibleMoves.some(m => m.row === row && m.col === col);
      
      if (isValidMove) {
        const newBoard = board.map(r => [...r]);
        const piece = newBoard[selectedPos.row][selectedPos.col];
        
        // 检查是否吃掉了国王
        const targetPiece = newBoard[row][col];
        if (targetPiece && targetPiece.type === "king") {
          setGameOver(true);
          setWinner("white");
          toast.success("恭喜你获胜！🎉");
          // 发放奖励给赢家
          setTimeout(() => grantReward(), 500);
        }
        
        newBoard[row][col] = piece;
        newBoard[selectedPos.row][selectedPos.col] = null;
        
        // 兵升变
        if (piece?.type === "pawn" && row === 0) {
          newBoard[row][col] = { type: "queen", color: "white" };
          toast.success("兵升变为皇后！");
        }
        
        setBoard(newBoard);
        setSelectedPos(null);
        setPossibleMoves([]);
        setCurrentTurn("black");
        setMoveCount(prev => prev + 1);
      } else if (clickedPiece && clickedPiece.color === "white") {
        // 选择另一个己方棋子
        setSelectedPos({ row, col });
        setPossibleMoves(getPossibleMoves(board, { row, col }, clickedPiece));
      } else {
        // 取消选择
        setSelectedPos(null);
        setPossibleMoves([]);
      }
    } else if (clickedPiece && clickedPiece.color === "white") {
      // 选择己方棋子
      setSelectedPos({ row, col });
      setPossibleMoves(getPossibleMoves(board, { row, col }, clickedPiece));
    }
  };

  const resetGame = () => {
    setBoard(initializeBoard());
    setSelectedPos(null);
    setPossibleMoves([]);
    setCurrentTurn("white");
    setGameOver(false);
    setWinner(null);
    setMoveCount(0);
    setIsThinking(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-blue-50 pb-20">
      {/* 顶部导航 */}
      <header className="z-50 glass border-b border-border/50">
        <div className="container flex items-center justify-between h-16">
          <Link href="/games">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              返回
            </Button>
          </Link>
          <h1 className="font-bold text-lg">国际象棋</h1>
          <div className="w-10" />
        </div>
      </header>

      <main className="container py-3 px-3">
        <div className="max-w-2xl mx-auto">
          {/* 游戏信息 */}
          <Card className="mb-3 p-3 bg-white/80 backdrop-blur">
            <div className="flex items-center justify-between mb-2">
              <div className="text-center flex-1">
                <div className="text-xs text-muted-foreground">当前轮次</div>
                <div className="text-lg font-bold text-brand-red">
                  {currentTurn === "white" ? "你的回合" : "电脑思考中..."}
                </div>
              </div>
              <div className="text-center flex-1">
                <div className="text-xs text-muted-foreground">步数</div>
                <div className="text-lg font-bold">{moveCount}</div>
              </div>
            </div>
            
            {gameOver && (
              <div className={`text-center p-3 rounded-lg ${winner === "white" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                <div className="flex items-center justify-center gap-2">
                  <Trophy className="w-5 h-5" />
                  <span className="font-bold">
                    {winner === "white" ? "你获胜了！" : "电脑获胜了"}
                  </span>
                </div>
              </div>
            )}
          </Card>

          {/* 棋盘 */}
          <Card className="mb-3 p-3 bg-white/80 backdrop-blur">
            <div className="aspect-square bg-cream rounded-lg overflow-hidden border-4 border-amber-900">
              <div className="grid grid-cols-8 h-full">
                {board.map((row, r) =>
                  row.map((piece, c) => {
                    const isLight = (r + c) % 2 === 0;
                    const isSelected = selectedPos?.row === r && selectedPos?.col === c;
                    const isPossibleMove = possibleMoves.some(m => m.row === r && m.col === c);
                    
                    return (
                      <button
                        key={`${r}-${c}`}
                        onClick={() => handleCellClick(r, c)}
                        className={`flex items-center justify-center text-4xl font-bold transition-colors ${
                          isLight ? "bg-cream" : "bg-cream"
                        } ${isSelected ? "ring-4 ring-yellow-400" : ""} ${
                          isPossibleMove ? "ring-4 ring-green-400" : ""
                        } hover:opacity-80`}
                      >
                        {piece && pieceSymbols[piece.color][piece.type]}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </Card>

          {/* 控制按钮 */}
          <div className="flex gap-2 mb-3">
            <Button
              onClick={resetGame}
              variant="outline"
              className="flex-1 gap-2"
              disabled={isThinking}
            >
              <RotateCcw className="w-4 h-4" />
              重新开始
            </Button>
            <Link href="/games" className="flex-1">
              <Button variant="outline" className="w-full gap-2">
                <ArrowLeft className="w-4 h-4" />
                返回游戏列表
              </Button>
            </Link>
          </div>

          {/* 提示信息 */}
          <Card className="mt-2 p-3 bg-blue-50 border-blue-200">
            <div className="flex gap-2">
              <Lightbulb className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-700">
                <p className="font-semibold mb-1">游戏规则：</p>
                <p>点击棋子选择，再点击目标位置移动。吃掉对方国王即可获胜。</p>
              </div>
            </div>
          </Card>
        </div>
      </main>

      {/* 五角星奖励弹窗 */}
      {showReward && (
        <StarRewardPopup
          open={showReward}
          kidName={rewardKidName}
          stars={rewardStars}
          activityName="国际象棋获胜"
          onClose={() => setShowReward(false)}
        />
      )}
    </div>
  );
}
