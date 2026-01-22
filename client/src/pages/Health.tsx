import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { 
  ArrowLeft, 
  Activity,
  Utensils,
  Moon,
  Heart,
  Thermometer,
  Eye
} from "lucide-react";

const healthFeatures = [
  {
    id: "exercise",
    title: "锻炼计数",
    description: "记录每天的锻炼成果，养成运动好习惯！",
    icon: Activity,
    href: "/exercise",
    gradient: "from-orange-400 to-red-600",
    bgColor: "bg-orange-50",
  },
  {
    id: "diet",
    title: "饮食记录",
    description: "记录每日饮食，培养健康饮食习惯！",
    icon: Utensils,
    href: "/health/diet",
    gradient: "from-green-400 to-emerald-600",
    bgColor: "bg-green-50",
    comingSoon: true,
  },
  {
    id: "sleep",
    title: "睡眠管理",
    description: "记录睡眠时间，保证充足休息！",
    icon: Moon,
    href: "/health/sleep",
    gradient: "from-indigo-400 to-purple-600",
    bgColor: "bg-indigo-50",
    comingSoon: true,
  },
  {
    id: "health-check",
    title: "健康检查",
    description: "记录身高体重，关注成长变化！",
    icon: Thermometer,
    href: "/health/check",
    gradient: "from-pink-400 to-rose-600",
    bgColor: "bg-pink-50",
    comingSoon: true,
  },
  {
    id: "vision",
    title: "视力保护",
    description: "定时提醒休息，保护眼睛健康！",
    icon: Eye,
    href: "/health/vision",
    gradient: "from-cyan-400 to-blue-600",
    bgColor: "bg-cyan-50",
    comingSoon: true,
  },
];

export default function Health() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-orange-50 to-pink-50">
      {/* 顶部导航 */}
      <div className="bg-white/80 backdrop-blur-sm border-b sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回首页
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Heart className="h-6 w-6 text-red-500" />
            <h1 className="text-2xl font-bold">健康</h1>
          </div>
        </div>
      </div>

      {/* 主要内容 */}
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold mb-2">健康管理</h2>
          <p className="text-muted-foreground">养成健康好习惯，快乐成长每一天</p>
        </div>

        {/* 功能卡片网格 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {healthFeatures.map((feature) => {
            const Icon = feature.icon;
            const isComingSoon = feature.comingSoon;
            
            const cardContent = (
              <Card 
                className={`${feature.bgColor} border-2 hover:shadow-xl transition-all duration-300 ${
                  isComingSoon ? 'opacity-60 cursor-not-allowed' : 'hover:scale-105 cursor-pointer'
                }`}
              >
                <CardContent className="p-6">
                  <div className="flex flex-col items-center text-center gap-4">
                    {/* 图标 */}
                    <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center shadow-lg`}>
                      <Icon className="h-10 w-10 text-white" />
                    </div>
                    
                    {/* 标题 */}
                    <div>
                      <h3 className="text-xl font-bold mb-2 flex items-center justify-center gap-2">
                        {feature.title}
                        {isComingSoon && (
                          <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded-full">
                            即将推出
                          </span>
                        )}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );

            if (isComingSoon) {
              return (
                <div key={feature.id} onClick={() => {
                  // 即将推出的功能,点击不跳转
                }}>
                  {cardContent}
                </div>
              );
            }

            return (
              <Link key={feature.id} href={feature.href}>
                {cardContent}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
