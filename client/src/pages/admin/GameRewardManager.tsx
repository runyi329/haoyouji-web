import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Star, Save, ChevronDown, ChevronUp, Loader2, Settings } from "lucide-react";

// 游戏配置定义 - 每个游戏一个独立入口
interface GameConfig {
  id: string;
  name: string;
  icon: string;
  color: string;
  // 匹配该游戏的activityType前缀
  activityPrefix: string[];
  // 是否有难度等级
  hasDifficulty?: boolean;
  // 是否有段位
  hasDan?: boolean;
}

const GAMES: GameConfig[] = [
  // 棋类游戏
  { id: "chess", name: "国际象棋", icon: "♟️", color: "bg-gray-100", activityPrefix: ["chess_"] },
  { id: "go", name: "围棋", icon: "⚫", color: "bg-gray-100", activityPrefix: ["go_"] },
  { id: "gomoku", name: "五子棋", icon: "⭕", color: "bg-red-100", activityPrefix: ["gomoku_"], hasDan: true },
  { id: "ludo", name: "飞行棋", icon: "🎲", color: "bg-blue-100", activityPrefix: ["ludo_"] },
  
  // 识字游戏 - 4个独立入口
  { id: "character_picture", name: "看图识字", icon: "🖼️", color: "bg-cyan-100", activityPrefix: ["character_picture_"], hasDifficulty: true },
  { id: "character_flashcard", name: "快闪识字", icon: "⚡", color: "bg-cream", activityPrefix: ["character_flashcard_"], hasDifficulty: true },
  { id: "character_listening", name: "听音识字", icon: "🎧", color: "bg-green-100", activityPrefix: ["character_listening_"], hasDifficulty: true },
  { id: "character_memory", name: "翻牌记字", icon: "🃏", color: "bg-pink-100", activityPrefix: ["character_memory_"], hasDifficulty: true },
  
  // 其他游戏
  { id: "memory", name: "记忆翻牌", icon: "🎴", color: "bg-indigo-100", activityPrefix: ["memory_"] },
  { id: "puzzle", name: "拼图游戏", icon: "🧩", color: "bg-teal-100", activityPrefix: ["puzzle_"] },
  { id: "math", name: "数学问答", icon: "🔢", color: "bg-cream", activityPrefix: ["math_"] },
  { id: "antonym", name: "反义词", icon: "🔄", color: "bg-emerald-100", activityPrefix: ["antonym_"] },
  { id: "addition20", name: "20加法", icon: "➕", color: "bg-cream", activityPrefix: ["addition20_"], hasDifficulty: true },
  
  // 日常任务
  { id: "brushing", name: "刷牙任务", icon: "🪥", color: "bg-sky-100", activityPrefix: ["brushing_"] },
  { id: "knowledge", name: "知识阅读", icon: "📚", color: "bg-cream", activityPrefix: ["knowledge_"] },
];

// 难度等级配置
const DIFFICULTY_CONFIG = {
  easy: { name: "简单", color: "bg-green-100 text-green-700 border-green-300" },
  medium: { name: "中等", color: "bg-cream text-brand-gold border-yellow-300" },
  hard: { name: "困难", color: "bg-red-100 text-red-700 border-red-300" },
};

// 20加法难度配置
const ADDITION20_DIFFICULTY_CONFIG = {
  easy: { name: "简单", color: "bg-green-100 text-green-700 border-green-300" },
  hard: { name: "困难", color: "bg-red-100 text-red-700 border-red-300" },
};

// 五子棋段位配置
const DAN_CONFIG: Record<number, { name: string; color: string }> = {
  1: { name: "1段·入门", color: "bg-green-100 text-green-700 border-green-300" },
  2: { name: "2段·初学", color: "bg-green-100 text-green-600 border-green-300" },
  3: { name: "3段·业余", color: "bg-blue-100 text-blue-700 border-blue-300" },
  4: { name: "4段·进阶", color: "bg-blue-100 text-blue-600 border-blue-300" },
  5: { name: "5段·熟练", color: "bg-red-100 text-brand-red-dark border-red-300" },
  6: { name: "6段·高手", color: "bg-red-100 text-brand-red border-red-300" },
  7: { name: "7段·专家", color: "bg-cream text-orange-700 border-orange-300" },
  8: { name: "8段·大师", color: "bg-red-100 text-red-600 border-red-300" },
  9: { name: "9段·棋圣", color: "bg-cream text-brand-gold border-yellow-300" },
};

interface RewardRule {
  id: number;
  activityType: string;
  activityName: string;
  starsReward: number;
  description: string | null;
  isActive: boolean;
}

// 从activityType解析信息
function parseActivityType(activityType: string): { 
  difficulty?: string; 
  dan?: number; 
  activity?: string;
} {
  // 五子棋段位: gomoku_dan1_win
  const danMatch = activityType.match(/^gomoku_dan(\d)_(\w+)$/);
  if (danMatch) {
    return { dan: parseInt(danMatch[1]), activity: danMatch[2] };
  }
  
  // 难度等级: character_picture_easy 或 addition20_easy
  const difficultyMatch = activityType.match(/_(easy|medium|hard)$/);
  if (difficultyMatch) {
    return { difficulty: difficultyMatch[1] };
  }
  
  // 20加法难度: addition20_easy
  const addition20Match = activityType.match(/^addition20_(easy|hard)$/);
  if (addition20Match) {
    return { difficulty: addition20Match[1] };
  }
  
  // 普通活动: chess_win
  const parts = activityType.split("_");
  return { activity: parts[parts.length - 1] };
}

export default function GameRewardManager() {
  const [expandedGame, setExpandedGame] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState<number>(0);
  
  const { data: rules, refetch, isLoading } = trpc.starRules.list.useQuery();
  
  const updateMutation = trpc.starRules.update.useMutation({
    onSuccess: () => {
      toast.success("奖励配置已更新");
      setEditingId(null);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // 获取某个游戏的所有奖励规则
  const getGameRules = (game: GameConfig): RewardRule[] => {
    if (!rules) return [];
    return rules.filter(rule => 
      game.activityPrefix.some(prefix => rule.activityType.startsWith(prefix))
    ).sort((a, b) => {
      // 按难度或段位排序
      const parsedA = parseActivityType(a.activityType);
      const parsedB = parseActivityType(b.activityType);
      
      if (parsedA.dan !== undefined && parsedB.dan !== undefined) {
        return parsedA.dan - parsedB.dan;
      }
      
      const difficultyOrder = { easy: 1, medium: 2, hard: 3 };
      if (parsedA.difficulty && parsedB.difficulty) {
        return (difficultyOrder[parsedA.difficulty as keyof typeof difficultyOrder] || 0) - 
               (difficultyOrder[parsedB.difficulty as keyof typeof difficultyOrder] || 0);
      }
      
      return 0;
    });
  };

  const handleEdit = (rule: RewardRule) => {
    setEditingId(rule.id);
    setEditValue(rule.starsReward);
  };

  const handleSave = (id: number) => {
    updateMutation.mutate({ id, starsReward: editValue });
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditValue(0);
  };

  const handleToggleActive = (rule: RewardRule) => {
    updateMutation.mutate({ id: rule.id, starsReward: rule.starsReward, isActive: !rule.isActive });
  };

  const toggleExpand = (gameId: string) => {
    setExpandedGame(expandedGame === gameId ? null : gameId);
    setEditingId(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-brand-red" />
      </div>
    );
  }

  // 渲染单个奖励规则行
  const renderRuleRow = (rule: RewardRule, game: GameConfig) => {
    const isEditing = editingId === rule.id;
    const parsed = parseActivityType(rule.activityType);
    
    // 获取显示标签
    let label = "";
    let labelStyle = "";
    
    if (parsed.dan !== undefined && DAN_CONFIG[parsed.dan]) {
      label = DAN_CONFIG[parsed.dan].name;
      labelStyle = DAN_CONFIG[parsed.dan].color;
    } else if (parsed.difficulty) {
      // 为20加法使用特殊的难度配置
      const difficultyConfig = game.id === "addition20" ? ADDITION20_DIFFICULTY_CONFIG : DIFFICULTY_CONFIG;
      const config = difficultyConfig[parsed.difficulty as keyof typeof difficultyConfig];
      if (config) {
        label = config.name;
        labelStyle = config.color;
      } else {
        label = rule.description || rule.activityType;
      }
    } else {
      label = rule.description || rule.activityType;
    }
    
    return (
      <div
        key={rule.id}
        className={`flex items-center justify-between p-3 rounded-lg border ${
          rule.isActive ? "bg-white border-gray-200" : "bg-gray-50 border-gray-100 opacity-60"
        }`}
      >
        <div className="flex items-center gap-3">
          <Switch
            checked={rule.isActive}
            onCheckedChange={() => handleToggleActive(rule)}
            disabled={updateMutation.isPending}
          />
          <div>
            {(game.hasDifficulty || game.hasDan) ? (
              <span className={`px-3 py-1 rounded-full text-sm font-medium border ${labelStyle}`}>
                {label}
              </span>
            ) : (
              <span className="font-medium text-gray-700">{label}</span>
            )}
            {rule.description && !game.hasDifficulty && !game.hasDan && (
              <div className="text-xs text-gray-500 mt-1">{rule.description}</div>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={editValue}
                  onChange={(e) => setEditValue(parseInt(e.target.value) || 0)}
                  className="w-16 h-8 text-center"
                />
                <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleSave(rule.id)}
                disabled={updateMutation.isPending}
                className="text-green-600 hover:text-green-700"
              >
                {updateMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCancel}
                className="text-gray-400 hover:text-gray-600"
              >
                取消
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1 px-3 py-1 bg-cream rounded-full border border-yellow-200">
                <span className="font-bold text-brand-gold">{rule.starsReward}</span>
                <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleEdit(rule)}
                disabled={!rule.isActive}
                className="text-brand-red border-red-200 hover:bg-red-50"
              >
                编辑
              </Button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-800">游戏奖励配置</h2>
        <p className="text-sm text-gray-500 mt-1">
          点击每个游戏的编辑按钮，配置奖励星星数和难度设置
        </p>
      </div>

      <div className="grid gap-3">
        {GAMES.map((game) => {
          const gameRules = getGameRules(game);
          const isExpanded = expandedGame === game.id;
          const hasRules = gameRules.length > 0;
          
          // 计算该游戏的总星星数范围
          const minStars = hasRules ? Math.min(...gameRules.map(r => r.starsReward)) : 0;
          const maxStars = hasRules ? Math.max(...gameRules.map(r => r.starsReward)) : 0;
          const starsDisplay = minStars === maxStars ? `${minStars}` : `${minStars}-${maxStars}`;
          
          return (
            <Card key={game.id} className={`overflow-hidden ${isExpanded ? "ring-2 ring-red-300" : ""}`}>
              {/* 游戏标题行 - 点击展开/收起 */}
              <div
                className={`flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors ${game.color}`}
                onClick={() => toggleExpand(game.id)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{game.icon}</span>
                  <div>
                    <h3 className="font-semibold text-gray-800">{game.name}</h3>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      {game.hasDifficulty && <span className="px-2 py-0.5 bg-white/50 rounded">3个难度</span>}
                      {game.hasDan && <span className="px-2 py-0.5 bg-white/50 rounded">9个段位</span>}
                      {!game.hasDifficulty && !game.hasDan && hasRules && (
                        <span className="px-2 py-0.5 bg-white/50 rounded">{gameRules.length}个配置</span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  {hasRules && (
                    <div className="flex items-center gap-1 px-3 py-1 bg-white rounded-full shadow-sm">
                      <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                      <span className="font-medium text-gray-700">{starsDisplay}</span>
                    </div>
                  )}
                  <Button
                    size="sm"
                    variant={isExpanded ? "default" : "outline"}
                    className={isExpanded ? "bg-brand-red hover:bg-brand-red-dark" : ""}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpand(game.id);
                    }}
                  >
                    <Settings className="w-4 h-4 mr-1" />
                    {isExpanded ? "收起" : "编辑"}
                    {isExpanded ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
                  </Button>
                </div>
              </div>
              
              {/* 展开的配置面板 */}
              {isExpanded && (
                <div className="border-t bg-gray-50 p-4">
                  {hasRules ? (
                    <div className="space-y-2">
                      {gameRules.map((rule) => renderRuleRow(rule, game))}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-gray-500">
                      <Star className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                      <p>暂无奖励配置</p>
                      <p className="text-xs mt-1">该游戏还没有设置奖励规则</p>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
