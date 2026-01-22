import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { 
  ArrowLeft, 
  Brain, 
  Puzzle, 
  Calculator,
  Trophy,
  Star,
  Sparkles,
  Crown,
  Plane,
  CircleDot,
  Grid3X3,
  BookOpen,
  GripVertical,
  Smile,
  Plus
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useFamilyFeatures } from "@/hooks/useFamilyFeatures";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { toast } from "sonner";

const defaultGames = [
  {
    id: "memory",
    title: "记忆翻牌",
    description: "翻开卡片，找到相同的图案，锻炼记忆力！",
    icon: Brain,
    gradient: "from-purple-400 to-purple-600",
    bgColor: "bg-purple-50",
    difficulty: "简单",
  },
  {
    id: "puzzle",
    title: "趣味拼图",
    description: "拖动碎片,拼出完整的图画，培养空间感！",
    icon: Puzzle,
    gradient: "from-blue-400 to-blue-600",
    bgColor: "bg-blue-50",
    difficulty: "中等",
  },
  {
    id: "math",
    title: "数学问答",
    description: "快速计算，挑战大脑，成为数学小天才！",
    icon: Calculator,
    gradient: "from-green-400 to-green-600",
    bgColor: "bg-green-50",
    difficulty: "进阶",
  },
  {
    id: "chess",
    title: "国际象棋",
    description: "与电脑对战，锻炼战略思维，成为棋艺大师！",
    icon: Crown,
    gradient: "from-amber-400 to-orange-600",
    bgColor: "bg-amber-50",
    difficulty: "挑战",
  },
  {
    id: "ludo",
    title: "飞行棋",
    description: "经典四人飞行棋，掌掘骰子，先到终点获胜！",
    icon: Plane,
    gradient: "from-cyan-400 to-teal-600",
    bgColor: "bg-cyan-50",
    difficulty: "中等",
  },
  {
    id: "go",
    title: "围棋",
    description: "古老的智慧游戏，黑白对弈，锻炼思维！",
    icon: CircleDot,
    gradient: "from-stone-500 to-stone-700",
    bgColor: "bg-stone-50",
    difficulty: "挑战",
  },
  {
    id: "sudoku",
    title: "数独",
    description: "填入数字，完成九宫格挑战，提升逻辑思维！",
    icon: Grid3X3,
    gradient: "from-indigo-400 to-purple-600",
    bgColor: "bg-indigo-50",
    difficulty: "进阶",
  },
  {
    id: "emoji",
    title: "表情猜猜",
    description: "根据表情组合猜词语，锻炼联想能力！",
    icon: Smile,
    gradient: "from-pink-400 to-rose-600",
    bgColor: "bg-pink-50",
    difficulty: "简单",
  },
  {
    id: "character",
    title: "看图识字",
    description: "看图片，选汉字，快乐学习！",
    icon: BookOpen,
    gradient: "from-emerald-400 to-green-600",
    bgColor: "bg-emerald-50",
    difficulty: "简单",
  },
  {
    id: "flashcard",
    title: "快闪识字",
    description: "田字格展示，快速记忆汉字！",
    icon: BookOpen,
    gradient: "from-amber-400 to-orange-600",
    bgColor: "bg-amber-50",
    difficulty: "中等",
  },
  {
    id: "listening",
    title: "听音识字",
    description: "听读音，选汉字，锻炼听力！",
    icon: BookOpen,
    gradient: "from-green-400 to-teal-600",
    bgColor: "bg-green-50",
    difficulty: "中等",
  },
  {
    id: "character-memory",
    title: "翻牌记字",
    description: "翻牌配对，记忆汉字！",
    icon: BookOpen,
    gradient: "from-pink-400 to-rose-600",
    bgColor: "bg-pink-50",
    difficulty: "简单",
  },
  {
    id: "addition20",
    title: "20加法",
    description: "练习20以内的加法运算，提升计算速度！",
    icon: Plus,
    gradient: "from-orange-400 to-red-600",
    bgColor: "bg-orange-50",
    difficulty: "简单",
  },
  {
    id: "reading",
    title: "阅读识字",
    description: "通过阅读故事学习生字，培养阅读兴趣！",
    icon: BookOpen,
    gradient: "from-violet-400 to-purple-600",
    bgColor: "bg-violet-50",
    difficulty: "中等",
  },
];

// 可拖拽的游戏卡片组件
function SortableGameCard({ game, highScore, isDragging, kidId }: { 
  game: typeof defaultGames[0]; 
  highScore: number;
  isDragging: boolean;
  kidId: number | null;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: game.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const Icon = game.icon;

  return (
    <div ref={setNodeRef} style={style} className="mb-4">
      <Card className={`${game.bgColor} border-0 overflow-hidden hover:shadow-lg transition-shadow`}>
        <div className="flex items-center gap-4 p-4">
          {/* 游戏图标和信息 */}
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${game.gradient} flex items-center justify-center flex-shrink-0`}>
              <Icon className="w-8 h-8 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-bold text-lg">{game.title}</h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-white/50">{game.difficulty}</span>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-1">{game.description}</p>
              {highScore > 0 && (
                <div className="flex items-center gap-1 mt-1">
                  <Trophy className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-medium">最高分: {highScore}</span>
                </div>
              )}
            </div>
          </div>

          {/* 开始游戏按钮 */}
          <div className="flex-shrink-0">
            <Link href={`/games/${game.id}?kidId=${kidId}`}>
              <Button size="sm" className={`bg-gradient-to-r ${game.gradient} text-white border-0`}>
                开始游戏
              </Button>
            </Link>
          </div>

          {/* 拖拽手柄 - 移到右侧 */}
          <div
            {...attributes}
            {...listeners}
            className="flex items-center justify-center w-8 h-16 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors"
          >
            <GripVertical className="w-5 h-5" />
          </div>
        </div>
      </Card>
    </div>
  );
}

export default function Games() {
  const { isAuthenticated, user } = useAuth();
  const [location] = useLocation();
  // toast已从sonner导入
  const { data: records } = trpc.games.getRecords.useQuery({}, { enabled: isAuthenticated });
  
  // 从 URL 获取 kidId
  const urlParams = new URLSearchParams(window.location.search);
  const kidIdFromUrl = urlParams.get('kidId');
  
  // 获取孩子列表（只在登录时查询）
  const { data: kids } = trpc.specialKids.list.useQuery(undefined, { enabled: isAuthenticated });
  const [selectedKidId, setSelectedKidId] = useState<number | null>(
    kidIdFromUrl ? parseInt(kidIdFromUrl) : null
  );

  // 获取游戏排序偏好
  const { data: orderPreference } = trpc.gameOrder.get.useQuery(
    { kidId: selectedKidId! },
    { enabled: !!selectedKidId }
  );

  // 保存游戏排序
  const saveOrderMutation = trpc.gameOrder.save.useMutation({
    onSuccess: () => {
      toast.success("游戏顺序已保存");
    },
  });

  // 获取功能权限
  const { isFeatureEnabled } = useFamilyFeatures();
  
  // 游戏列表状态
  const [games, setGames] = useState(defaultGames);
  const [activeId, setActiveId] = useState<string | null>(null);
  
  // 根据权限过滤游戏列表
  const filteredGames = user?.role === 'super_admin' 
    ? games 
    : games.filter(game => isFeatureEnabled("游戏", game.title));

  // 当获取到排序偏好时，更新游戏列表顺序
  useEffect(() => {
    if (orderPreference?.gameOrders) {
      const orderedGames = orderPreference.gameOrders
        .map((id: string) => defaultGames.find(g => g.id === id))
        .filter(Boolean) as typeof defaultGames;
      
      // 添加新游戏（如果有）
      const newGames = defaultGames.filter(g => !orderPreference.gameOrders.includes(g.id));
      setGames([...orderedGames, ...newGames]);
    } else {
      setGames(defaultGames);
    }
  }, [orderPreference]);

  // 当第一次加载时，如果URL没有kidId，自动选择第一个孩子
  useEffect(() => {
    if (kids && kids.length > 0 && !selectedKidId && !kidIdFromUrl) {
      setSelectedKidId(kids[0].id);
    }
  }, [kids, selectedKidId, kidIdFromUrl]);
  
  // 获取当前选中的孩子信息
  const selectedKid = kids?.find(k => k.id === selectedKidId);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 移动8px后才开始拖拽，避免误触
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: any) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      setGames((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        const newOrder = arrayMove(items, oldIndex, newIndex);

        // 保存新顺序到后端
        if (selectedKidId) {
          saveOrderMutation.mutate({
            kidId: selectedKidId,
            gameOrders: newOrder.map(g => g.id),
          });
        }

        return newOrder;
      });
    }
  };

  // 计算每个游戏的最高分
  const getHighScore = (gameType: string) => {
    if (!records) return 0;
    const gameRecords = records.filter(r => r.gameType === gameType);
    if (gameRecords.length === 0) return 0;
    return Math.max(...gameRecords.map(r => r.score));
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* 顶部导航 */}
      <header className="z-50 glass border-b border-border/50">
        <div className="container flex items-center h-14">
          <Link href="/">
            <Button variant="ghost" size="icon" className="mr-2">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <h1 className="font-bold text-lg">游戏乐园</h1>
          </div>
        </div>
      </header>

      <main className="container py-4">
        {/* 当前孩子信息 - 只在登录时显示 */}
        {isAuthenticated && selectedKid && (
          <section className="mb-6">
            <div className="flex items-center justify-center">
              <div className="flex items-end gap-4 p-3">
                <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-primary shadow-lg">
                  {selectedKid.avatar ? (
                    <img src={selectedKid.avatar} alt={selectedKid.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white font-bold text-4xl">
                      {selectedKid.name[0]}
                    </div>
                  )}
                </div>
                <div className="flex items-end gap-3 pb-1">
                  <div className="text-2xl font-bold">{selectedKid.name}</div>
                  <div className="flex items-center gap-1 text-amber-500">
                    <Star className="w-6 h-6 fill-current" />
                    <span className="text-xl font-bold">{selectedKid.stars}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 游戏卡片列表 - 可拖拽排序，只在登录时显示 */}
        {isAuthenticated && (
          <section>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={filteredGames.map(g => g.id)} strategy={verticalListSortingStrategy}>
                {filteredGames.map((game) => (
                  <SortableGameCard
                    key={game.id}
                    game={game}
                    highScore={getHighScore(game.id)}
                    isDragging={activeId === game.id}
                    kidId={selectedKidId}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </section>
        )}

        {/* 错题本入口 - 根据权限显示 */}
        {isAuthenticated && (user?.role === 'super_admin' || isFeatureEnabled("游戏", "错题本")) && (
          <section className="mt-8">
            <Link href="/wrong-questions">
              <Card className="p-4 bg-gradient-to-br from-red-50 to-orange-50 border-0 hover:shadow-lg transition-shadow">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
                    <BookOpen className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold">错题本</h3>
                    <p className="text-sm text-muted-foreground">复习答错的题目，巩固知识</p>
                  </div>
                  <Button size="sm" className="bg-gradient-to-r from-red-500 to-orange-500 text-white border-0">
                    查看
                  </Button>
                </div>
              </Card>
            </Link>
          </section>
        )}

        {/* 排行榜入口 - 根据权限显示 */}
        {isAuthenticated && (user?.role === 'super_admin' || isFeatureEnabled("游戏", "游戏排行榜")) && (
          <section className="mt-4">
            <Card className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 border-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                  <Trophy className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold">游戏排行榜</h3>
                  <p className="text-sm text-muted-foreground">查看你的排名</p>
                </div>
                <Button variant="outline" size="sm">
                  查看
                </Button>
              </div>
            </Card>
          </section>
        )}
      </main>
    </div>
  );
}
