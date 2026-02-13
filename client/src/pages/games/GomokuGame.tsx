import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Link } from "wouter";
import { ArrowLeft, RotateCcw, Play, Trophy, Undo2, Users, Bot, Star, Swords } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { StarRewardPopup } from "@/components/StarRewardPopup";

// 棋盘大小
const BOARD_SIZE = 15;

// 棋子类型
type Stone = "black" | "white" | null;

// 游戏模式
type GameMode = "ai" | "pvp";

// AI段位 (1-9段)
type AIDan = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

// 段位名称映射
const DAN_NAMES: Record<AIDan, string> = {
  1: "一段·入门",
  2: "二段·初学",
  3: "三段·业余",
  4: "四段·进阶",
  5: "五段·熟练",
  6: "六段·高手",
  7: "七段·专家",
  8: "八段·大师",
  9: "九段·棋圣",
};

// 段位颜色映射
const DAN_COLORS: Record<AIDan, string> = {
  1: "from-green-400 to-green-500",
  2: "from-green-500 to-green-600",
  3: "from-blue-400 to-blue-500",
  4: "from-blue-500 to-blue-600",
  5: "from-[#A80000] to-[#d44]",
  6: "from-red-500 to-[#d44]",
  7: "from-orange-400 to-orange-500",
  8: "from-red-400 to-red-500",
  9: "from-yellow-400 to-yellow-600",
};

// AI难度参数配置
interface AIConfig {
  randomTopN: number;        // 从前N个最优位置中随机选择
  mistakeRate: number;       // 失误概率 (0-1)
  ignoreThreats: number;     // 忽略威胁的概率 (0-1)
  searchDepth: number;       // 搜索深度 (1-3)
  aggressiveness: number;    // 进攻性 (0-1)
  defenseBonus: number;      // 防守加成
}

// 9段AI配置
const AI_CONFIGS: Record<AIDan, AIConfig> = {
  1: { randomTopN: 15, mistakeRate: 0.4, ignoreThreats: 0.5, searchDepth: 1, aggressiveness: 0.2, defenseBonus: 0.3 },
  2: { randomTopN: 12, mistakeRate: 0.3, ignoreThreats: 0.4, searchDepth: 1, aggressiveness: 0.3, defenseBonus: 0.4 },
  3: { randomTopN: 10, mistakeRate: 0.25, ignoreThreats: 0.3, searchDepth: 1, aggressiveness: 0.4, defenseBonus: 0.5 },
  4: { randomTopN: 8, mistakeRate: 0.2, ignoreThreats: 0.2, searchDepth: 1, aggressiveness: 0.5, defenseBonus: 0.6 },
  5: { randomTopN: 5, mistakeRate: 0.15, ignoreThreats: 0.1, searchDepth: 2, aggressiveness: 0.6, defenseBonus: 0.7 },
  6: { randomTopN: 4, mistakeRate: 0.1, ignoreThreats: 0.05, searchDepth: 2, aggressiveness: 0.7, defenseBonus: 0.8 },
  7: { randomTopN: 3, mistakeRate: 0.05, ignoreThreats: 0.02, searchDepth: 2, aggressiveness: 0.8, defenseBonus: 0.9 },
  8: { randomTopN: 2, mistakeRate: 0.02, ignoreThreats: 0.01, searchDepth: 3, aggressiveness: 0.9, defenseBonus: 0.95 },
  9: { randomTopN: 1, mistakeRate: 0, ignoreThreats: 0, searchDepth: 3, aggressiveness: 1.0, defenseBonus: 1.0 },
};

// 游戏状态
interface GameState {
  board: Stone[][];
  currentPlayer: "black" | "white";
  lastMove: { row: number; col: number } | null;
  history: { board: Stone[][]; lastMove: { row: number; col: number } | null }[];
  gameOver: boolean;
  winner: "black" | "white" | "draw" | null;
}

export default function GomokuGame() {
  const [gameMode, setGameMode] = useState<GameMode>("ai");
  const [aiDan, setAiDan] = useState<AIDan>(3);
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

  // 从localStorage读取选择的孩子和上次选择的段位
  useEffect(() => {
    const savedKidId = localStorage.getItem("selectedKidId");
    if (savedKidId) {
      setSelectedKidId(parseInt(savedKidId));
    }
    const savedDan = localStorage.getItem("gomokuAiDan");
    if (savedDan) {
      const dan = parseInt(savedDan) as AIDan;
      if (dan >= 1 && dan <= 9) {
        setAiDan(dan);
      }
    }
  }, []);

  // 保存段位选择
  useEffect(() => {
    localStorage.setItem("gomokuAiDan", aiDan.toString());
  }, [aiDan]);

  // 获取当前选择的孩子
  const currentKid = specialKids?.find(k => k.id === selectedKidId);

  // 获取五子棋获胜奖励规则（根据段位）
  const getWinReward = () => {
    const activityType = `gomoku_dan${aiDan}_win`;
    const rule = rewardRules?.find((r: { activityType: string; isActive: boolean; starsReward: number }) => 
      r.activityType === activityType && r.isActive
    );
    // 如果没有找到对应段位的规则，使用默认规则
    if (!rule) {
      const defaultRule = rewardRules?.find((r: { activityType: string; isActive: boolean; starsReward: number }) => 
        r.activityType === "gomoku_win" && r.isActive
      );
      return defaultRule?.starsReward || aiDan; // 默认奖励等于段位数
    }
    return rule.starsReward;
  };

  // 发放奖励
  const grantReward = async () => {
    if (!selectedKidId || !currentKid) return;
    
    try {
      const activityType = `gomoku_dan${aiDan}_win`;
      const result = await awardStarsMutation.mutateAsync({
        kidId: selectedKidId,
        activityType: activityType,
        description: `五子棋${aiDan}段获胜`,
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
    const board: Stone[][] = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
    setGameState({
      board,
      currentPlayer: "black",
      lastMove: null,
      history: [],
      gameOver: false,
      winner: null,
    });
    setGameStarted(true);
  }, []);

  // 检查五子连珠
  const checkWin = useCallback((board: Stone[][], row: number, col: number, color: Stone): boolean => {
    if (!color) return false;
    
    const directions = [
      [0, 1],   // 水平
      [1, 0],   // 垂直
      [1, 1],   // 对角线
      [1, -1],  // 反对角线
    ];
    
    for (const [dr, dc] of directions) {
      let count = 1;
      
      for (let i = 1; i < 5; i++) {
        const r = row + dr * i;
        const c = col + dc * i;
        if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) break;
        if (board[r][c] !== color) break;
        count++;
      }
      
      for (let i = 1; i < 5; i++) {
        const r = row - dr * i;
        const c = col - dc * i;
        if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) break;
        if (board[r][c] !== color) break;
        count++;
      }
      
      if (count >= 5) return true;
    }
    
    return false;
  }, []);

  // 检查是否平局
  const checkDraw = useCallback((board: Stone[][]): boolean => {
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board[row][col] === null) return false;
      }
    }
    return true;
  }, []);

  // 评估位置得分（用于AI）- 根据段位调整
  const evaluatePosition = useCallback((board: Stone[][], row: number, col: number, color: Stone, config: AIConfig): number => {
    if (!color || board[row][col] !== null) return 0;
    
    let score = 0;
    const opponent = color === "black" ? "white" : "black";
    
    const directions = [
      [0, 1], [1, 0], [1, 1], [1, -1],
    ];
    
    for (const [dr, dc] of directions) {
      let myCount = 0;
      let openEnds = 0;
      let oppCount = 0;
      let oppOpenEnds = 0;
      
      for (let dir = -1; dir <= 1; dir += 2) {
        let blocked = false;
        for (let i = 1; i <= 4; i++) {
          const r = row + dr * i * dir;
          const c = col + dc * i * dir;
          if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) {
            blocked = true;
            break;
          }
          if (board[r][c] === color) {
            myCount++;
          } else if (board[r][c] === opponent) {
            blocked = true;
            break;
          } else {
            break;
          }
        }
        if (!blocked) openEnds++;
      }
      
      for (let dir = -1; dir <= 1; dir += 2) {
        let blocked = false;
        for (let i = 1; i <= 4; i++) {
          const r = row + dr * i * dir;
          const c = col + dc * i * dir;
          if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) {
            blocked = true;
            break;
          }
          if (board[r][c] === opponent) {
            oppCount++;
          } else if (board[r][c] === color) {
            blocked = true;
            break;
          } else {
            break;
          }
        }
        if (!blocked) oppOpenEnds++;
      }
      
      // 进攻得分（根据进攻性调整）
      if (myCount >= 4) score += 100000 * config.aggressiveness;
      else if (myCount === 3 && openEnds >= 2) score += 10000 * config.aggressiveness;
      else if (myCount === 3 && openEnds === 1) score += 1000 * config.aggressiveness;
      else if (myCount === 2 && openEnds >= 2) score += 500 * config.aggressiveness;
      else if (myCount === 2 && openEnds === 1) score += 100 * config.aggressiveness;
      else if (myCount === 1 && openEnds >= 2) score += 50 * config.aggressiveness;
      
      // 防守得分（根据防守加成和忽略威胁概率调整）
      const shouldIgnoreThreat = Math.random() < config.ignoreThreats;
      if (!shouldIgnoreThreat) {
        if (oppCount >= 4) score += 90000 * config.defenseBonus;
        else if (oppCount === 3 && oppOpenEnds >= 2) score += 9000 * config.defenseBonus;
        else if (oppCount === 3 && oppOpenEnds === 1) score += 900 * config.defenseBonus;
        else if (oppCount === 2 && oppOpenEnds >= 2) score += 400 * config.defenseBonus;
      }
    }
    
    // 中心位置加分
    const center = Math.floor(BOARD_SIZE / 2);
    const distToCenter = Math.abs(row - center) + Math.abs(col - center);
    score += (BOARD_SIZE - distToCenter) * 2;
    
    return score;
  }, []);

  // Minimax搜索（用于高段位AI）
  const minimax = useCallback((
    board: Stone[][], 
    depth: number, 
    isMaximizing: boolean, 
    alpha: number, 
    beta: number,
    config: AIConfig
  ): number => {
    if (depth === 0) {
      // 评估整个棋盘
      let totalScore = 0;
      for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
          if (board[row][col] === null) {
            totalScore += evaluatePosition(board, row, col, "white", config);
            totalScore -= evaluatePosition(board, row, col, "black", config);
          }
        }
      }
      return totalScore;
    }
    
    const color = isMaximizing ? "white" : "black";
    let bestScore = isMaximizing ? -Infinity : Infinity;
    
    // 只考虑有棋子附近的位置
    const candidates: { row: number; col: number }[] = [];
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board[row][col] === null && hasNeighbor(board, row, col)) {
          candidates.push({ row, col });
        }
      }
    }
    
    // 限制候选数量
    const limitedCandidates = candidates.slice(0, 10);
    
    for (const { row, col } of limitedCandidates) {
      board[row][col] = color;
      
      // 检查是否获胜
      if (checkWin(board, row, col, color)) {
        board[row][col] = null;
        return isMaximizing ? 1000000 : -1000000;
      }
      
      const score = minimax(board, depth - 1, !isMaximizing, alpha, beta, config);
      board[row][col] = null;
      
      if (isMaximizing) {
        bestScore = Math.max(bestScore, score);
        alpha = Math.max(alpha, score);
      } else {
        bestScore = Math.min(bestScore, score);
        beta = Math.min(beta, score);
      }
      
      if (beta <= alpha) break;
    }
    
    return bestScore;
  }, [checkWin, evaluatePosition]);

  // 检查是否有邻居棋子
  const hasNeighbor = (board: Stone[][], row: number, col: number): boolean => {
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        if (dr === 0 && dc === 0) continue;
        const r = row + dr;
        const c = col + dc;
        if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] !== null) {
          return true;
        }
      }
    }
    return false;
  };

  // 落子（支持双人和AI模式）
  const placeStone = useCallback((row: number, col: number) => {
    if (!gameState || gameState.gameOver || thinking) return;
    
    // AI模式下，玩家只能下黑棋
    if (gameMode === "ai" && gameState.currentPlayer !== "black") return;
    
    if (gameState.board[row][col] !== null) {
      toast.error("此位置已有棋子");
      return;
    }
    
    const currentColor = gameState.currentPlayer;
    const newBoard = gameState.board.map(r => [...r]);
    newBoard[row][col] = currentColor;
    
    // 检查胜利
    if (checkWin(newBoard, row, col, currentColor)) {
      setGameState({
        ...gameState,
        board: newBoard,
        lastMove: { row, col },
        history: [...gameState.history, { board: gameState.board.map(r => [...r]), lastMove: gameState.lastMove }],
        gameOver: true,
        winner: currentColor,
      });
      
      // 人机模式下玩家获胜，发放奖励
      if (gameMode === "ai" && currentColor === "black" && selectedKidId) {
        setTimeout(() => grantReward(), 500);
      }
      return;
    }
    
    // 检查平局
    if (checkDraw(newBoard)) {
      setGameState({
        ...gameState,
        board: newBoard,
        lastMove: { row, col },
        history: [...gameState.history, { board: gameState.board.map(r => [...r]), lastMove: gameState.lastMove }],
        gameOver: true,
        winner: "draw",
      });
      return;
    }
    
    const opponent = currentColor === "black" ? "white" : "black";
    const newState: GameState = {
      ...gameState,
      board: newBoard,
      currentPlayer: opponent,
      lastMove: { row, col },
      history: [...gameState.history, { board: gameState.board.map(r => [...r]), lastMove: gameState.lastMove }],
    };
    
    setGameState(newState);
    
    // AI模式下，轮到AI
    if (gameMode === "ai" && opponent === "white") {
      setTimeout(() => aiMove(newState), 500);
    }
  }, [gameState, thinking, gameMode, checkWin, checkDraw, selectedKidId, aiDan]);

  // AI落子（根据段位调整策略）
  const aiMove = useCallback((state: GameState) => {
    if (state.gameOver) return;
    
    setThinking(true);
    const config = AI_CONFIGS[aiDan];
    
    setTimeout(() => {
      const validMoves: { row: number; col: number; score: number }[] = [];
      
      // 如果棋盘为空，下在中心附近
      const isEmpty = state.board.every(row => row.every(cell => cell === null));
      if (isEmpty) {
        const center = Math.floor(BOARD_SIZE / 2);
        const offset = Math.floor(Math.random() * 3) - 1;
        const bestMove = { row: center + offset, col: center + offset };
        
        const newBoard = state.board.map(r => [...r]);
        newBoard[bestMove.row][bestMove.col] = "white";
        
        setGameState({
          ...state,
          board: newBoard,
          currentPlayer: "black",
          lastMove: { row: bestMove.row, col: bestMove.col },
          history: [...state.history, { board: state.board.map(r => [...r]), lastMove: state.lastMove }],
        });
        setThinking(false);
        return;
      }
      
      // 评估所有可能的位置
      for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
          if (state.board[row][col] === null) {
            // 只考虑有邻居的位置（优化性能）
            if (!hasNeighbor(state.board, row, col)) continue;
            
            let score = evaluatePosition(state.board, row, col, "white", config);
            
            // 高段位使用minimax搜索
            if (config.searchDepth >= 2) {
              const boardCopy = state.board.map(r => [...r]);
              boardCopy[row][col] = "white";
              
              // 检查是否直接获胜
              if (checkWin(boardCopy, row, col, "white")) {
                score = 10000000;
              } else {
                const minimaxScore = minimax(boardCopy, config.searchDepth - 1, false, -Infinity, Infinity, config);
                score += minimaxScore * 0.5;
              }
            }
            
            validMoves.push({ row, col, score });
          }
        }
      }
      
      if (validMoves.length === 0) {
        setThinking(false);
        return;
      }
      
      validMoves.sort((a, b) => b.score - a.score);
      
      // 根据段位决定随机性
      let bestMove: { row: number; col: number; score: number };
      
      // 失误判定
      if (Math.random() < config.mistakeRate && validMoves.length > config.randomTopN) {
        // 故意选择一个较差的位置
        const worstMoves = validMoves.slice(config.randomTopN, config.randomTopN * 2);
        bestMove = worstMoves[Math.floor(Math.random() * worstMoves.length)] || validMoves[0];
      } else {
        // 从前N个最优位置中随机选择
        const topMoves = validMoves.slice(0, Math.min(config.randomTopN, validMoves.length));
        bestMove = topMoves[Math.floor(Math.random() * topMoves.length)];
      }
      
      const newBoard = state.board.map(r => [...r]);
      newBoard[bestMove.row][bestMove.col] = "white";
      
      // 检查胜利
      if (checkWin(newBoard, bestMove.row, bestMove.col, "white")) {
        setGameState({
          ...state,
          board: newBoard,
          lastMove: { row: bestMove.row, col: bestMove.col },
          history: [...state.history, { board: state.board.map(r => [...r]), lastMove: state.lastMove }],
          gameOver: true,
          winner: "white",
        });
        setThinking(false);
        return;
      }
      
      // 检查平局
      if (checkDraw(newBoard)) {
        setGameState({
          ...state,
          board: newBoard,
          lastMove: { row: bestMove.row, col: bestMove.col },
          history: [...state.history, { board: state.board.map(r => [...r]), lastMove: state.lastMove }],
          gameOver: true,
          winner: "draw",
        });
        setThinking(false);
        return;
      }
      
      setGameState({
        ...state,
        board: newBoard,
        currentPlayer: "black",
        lastMove: { row: bestMove.row, col: bestMove.col },
        history: [...state.history, { board: state.board.map(r => [...r]), lastMove: state.lastMove }],
      });
      
      setThinking(false);
    }, 300 + aiDan * 50); // 段位越高思考时间越长
  }, [aiDan, checkWin, checkDraw, evaluatePosition, minimax]);

  // 悔棋
  const undo = useCallback(() => {
    if (!gameState || thinking) return;
    
    // AI模式需要悔两步，双人模式悔一步
    const stepsBack = gameMode === "ai" ? 2 : 1;
    
    if (gameState.history.length < stepsBack) return;
    
    const newHistory = gameState.history.slice(0, -stepsBack);
    const prevState = newHistory.length > 0 
      ? newHistory[newHistory.length - 1] 
      : { board: Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null)), lastMove: null };
    
    // 计算回退后的当前玩家
    const currentPlayer = gameMode === "ai" ? "black" : 
      (gameState.currentPlayer === "black" ? "white" : "black");
    
    setGameState({
      ...gameState,
      board: prevState.board.map(r => [...r]),
      currentPlayer,
      lastMove: prevState.lastMove,
      history: newHistory,
      gameOver: false,
      winner: null,
    });
    
    toast.info("已悔棋");
  }, [gameState, thinking, gameMode]);

  // 判断是否是星位
  const isStarPoint = (row: number, col: number): boolean => {
    const starPositions = [3, 7, 11];
    return starPositions.includes(row) && starPositions.includes(col);
  };

  // 渲染棋盘
  const renderBoard = () => {
    if (!gameState) return null;
    
    const cellSize = 'min(5.5vw, 5.5vh, 36px)';
    const stoneSize = 'min(4.8vw, 4.8vh, 32px)';
    
    return (
      <div 
        className="inline-grid bg-amber-200 p-2 md:p-3 rounded-lg shadow-lg"
        style={{ 
          gridTemplateColumns: `repeat(${BOARD_SIZE}, ${cellSize})`,
          gap: '0px'
        }}
      >
        {gameState.board.map((row, rowIndex) =>
          row.map((cell, colIndex) => {
            const isLastMove = gameState.lastMove?.row === rowIndex && gameState.lastMove?.col === colIndex;
            
            return (
              <div
                key={`${rowIndex}-${colIndex}`}
                className="relative flex items-center justify-center cursor-pointer"
                style={{ width: cellSize, height: cellSize }}
                onClick={() => placeStone(rowIndex, colIndex)}
              >
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="absolute bg-amber-900/60 w-full h-px" />
                  <div className="absolute bg-amber-900/60 w-px h-full" />
                </div>
                
                {isStarPoint(rowIndex, colIndex) && !cell && (
                  <div className="absolute w-1.5 h-1.5 bg-amber-900/80 rounded-full z-10" />
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
                    style={{ width: stoneSize, height: stoneSize }}
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
          <h1 className="font-bold text-lg">五子棋</h1>
          <Button variant="ghost" size="sm" onClick={() => { setGameStarted(false); setGameState(null); }}>
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <main className="container py-4 pb-24">
        {!gameStarted ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2">五子棋</h2>
              <p className="text-muted-foreground">简单有趣的棋类游戏</p>
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
                    <div className="flex items-center gap-1 text-sm text-amber-600">
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
            
            {/* AI段位选择 - 仅在人机模式显示 */}
            {gameMode === "ai" && (
              <Card className="p-6 max-w-sm w-full">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Swords className="w-5 h-5" />
                  选择电脑段位
                </h3>
                
                {/* 段位显示 */}
                <div className="text-center mb-4">
                  <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r ${DAN_COLORS[aiDan]} text-white font-bold text-lg shadow-lg`}>
                    <span>{aiDan}段</span>
                    <span className="text-sm opacity-90">{DAN_NAMES[aiDan].split("·")[1]}</span>
                  </div>
                </div>
                
                {/* 段位滑动条 */}
                <div className="px-2">
                  <Slider
                    value={[aiDan]}
                    onValueChange={(value) => setAiDan(value[0] as AIDan)}
                    min={1}
                    max={9}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                    <span>1段</span>
                    <span>5段</span>
                    <span>9段</span>
                  </div>
                </div>
                
                {/* 段位说明 */}
                <div className="mt-4 p-3 bg-muted/50 rounded-lg text-sm">
                  <p className="font-medium mb-1">{DAN_NAMES[aiDan]}</p>
                  <p className="text-muted-foreground text-xs">
                    {aiDan <= 3 && "适合初学者，电脑会经常失误"}
                    {aiDan >= 4 && aiDan <= 6 && "适合有一定基础的玩家"}
                    {aiDan >= 7 && "高手级别，电脑几乎不会失误"}
                  </p>
                  <div className="flex items-center gap-1 mt-2 text-amber-600">
                    <Star className="w-4 h-4 fill-current" />
                    <span className="text-xs">获胜奖励: {getWinReward()} 颗星星</span>
                  </div>
                </div>
              </Card>
            )}
            
            <Card className="p-6 max-w-sm w-full">
              <h3 className="font-semibold mb-4">游戏规则</h3>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li>• 黑棋先行，轮流落子</li>
                <li>• 先连成五子者获胜</li>
                <li>• 横、竖、斜均可</li>
                <li>• 棋盘为15×15</li>
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
                {gameMode === "ai" 
                  ? (gameState.winner === "black" 
                      ? `恭喜你战胜了${aiDan}段电脑！` 
                      : gameState.winner === "white" 
                        ? `${aiDan}段电脑获胜，再接再厉！` 
                        : "势均力敌！")
                  : (gameState.winner === "black" ? "黑方玩家获胜！" : gameState.winner === "white" ? "白方玩家获胜！" : "势均力敌！")
                }
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
                        ? (gameState?.currentPlayer === "black" ? "你的回合" : `${aiDan}段电脑思考中...`)
                        : (gameState?.currentPlayer === "black" ? "黑棋回合" : "白棋回合")
                      }
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {thinking ? "请稍候..." : "点击棋盘落子"}
                    </p>
                  </div>
                </div>
                
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={undo}
                  disabled={thinking || !gameState || gameState.history.length < (gameMode === "ai" ? 2 : 1)}
                >
                  <Undo2 className="w-4 h-4 mr-1" />
                  悔棋
                </Button>
              </div>
            </Card>

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
        activityName={`五子棋${aiDan}段获胜`}
        kidName={rewardKidName}
      />
    </div>
  );
}
