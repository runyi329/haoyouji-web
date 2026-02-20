import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Image, Zap, Headphones, Layers } from "lucide-react";

interface LiteracyGame {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  gradient: string;
  bgColor: string;
  path: string;
}

// 不在这里拼接kidId，由组件内部处理
const literacyGames: LiteracyGame[] = [
  {
    id: "character",
    title: "看图识字",
    description: "看图片学汉字，快乐认字！",
    icon: Image,
    gradient: "from-blue-400 to-cyan-600",
    bgColor: "bg-blue-50",
    path: "/games/character",
  },
  {
    id: "flashcard",
    title: "快闪识字",
    description: "快速闪现学汉字，提升反应！",
    icon: Zap,
    gradient: "from-orange-400 to-red-600",
    bgColor: "bg-cream",
    path: "/games/character",
  },
  {
    id: "listening",
    title: "听音识字",
    description: "听声音找汉字，锻炼听力！",
    icon: Headphones,
    gradient: "from-green-400 to-emerald-600",
    bgColor: "bg-green-50",
    path: "/games/listening",
  },
  {
    id: "memory",
    title: "翻牌记字",
    description: "翻牌配对记汉字，训练记忆！",
    icon: Layers,
    gradient: "from-[#A80000] to-[#d44]",
    bgColor: "bg-red-50",
    path: "/games/character-memory",
  },
];

export default function CharacterGamesHub() {
  // 从URL获取kidId
  const urlParams = new URLSearchParams(window.location.search);
  const kidId = urlParams.get('kidId');

  return (
    <div className="min-h-screen bg-gradient-to-b from-yellow-50 to-amber-100 pb-20">
      {/* 顶部导航 */}
      <header className="z-50 bg-white/80 backdrop-blur-sm border-b border-gray-200">
        <div className="container flex items-center justify-between h-14">
          <Link href={`/games?kidId=${kidId}`} className="flex items-center gap-2 text-brand-gold hover:text-brand-gold">
            <ArrowLeft size={20} />
            <span className="font-medium">返回游戏乐园</span>
          </Link>
          <h1 className="text-xl font-bold bg-gradient-to-r from-yellow-600 to-amber-600 bg-clip-text text-transparent">
            识字游戏
          </h1>
          <div className="w-24" />
        </div>
      </header>

      <div className="container max-w-4xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-800 mb-2">快乐学汉字</h2>
          <p className="text-gray-600">选择一个游戏开始学习吧！</p>
        </div>

        {/* 2×2 游戏网格 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {literacyGames.map((game) => (
            <Card key={game.id} className={`${game.bgColor} border-0 overflow-hidden hover:shadow-xl transition-shadow`}>
              <div className="p-6 space-y-4">
                {/* 游戏图标 */}
                <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${game.gradient} flex items-center justify-center shadow-lg mx-auto`}>
                  <game.icon className="w-10 h-10 text-white" />
                </div>

                {/* 游戏信息 */}
                <div className="text-center space-y-2">
                  <h3 className="text-xl font-bold text-gray-800">{game.title}</h3>
                  <p className="text-sm text-gray-600">{game.description}</p>
                </div>

                {/* 开始按钮 */}
                <Link href={game.id === 'character' ? `${game.path}?mode=picture&kidId=${kidId}` : game.id === 'flashcard' ? `${game.path}?mode=flashcard&kidId=${kidId}` : `${game.path}?kidId=${kidId}`}>
                  <Button 
                    className={`w-full bg-gradient-to-r ${game.gradient} text-white border-0 hover:opacity-90`}
                    size="lg"
                  >
                    开始游戏
                  </Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
