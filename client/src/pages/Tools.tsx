import { useLocation } from "wouter";
import { ArrowLeft, Wrench, TrendingUp, Calculator, Clock } from "lucide-react";

interface Tool {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  bgColor: string;
  link: string;
  available: boolean;
}

const tools: Tool[] = [
  {
    id: "contract",
    icon: TrendingUp,
    title: "合约工具",
    subtitle: "动态风控计算",
    bgColor: "bg-gradient-to-br from-blue-500 to-blue-700",
    link: "/tools/contract",
    available: true,
  },
  {
    id: "calculator",
    icon: Calculator,
    title: "计算器",
    subtitle: "即将上线",
    bgColor: "bg-gradient-to-br from-gray-400 to-gray-500",
    link: "",
    available: false,
  },
  {
    id: "timer",
    icon: Clock,
    title: "计时工具",
    subtitle: "即将上线",
    bgColor: "bg-gradient-to-br from-gray-400 to-gray-500",
    link: "",
    available: false,
  },
];

export default function Tools() {
  const [, setLocation] = useLocation();

  const handleToolClick = (tool: Tool) => {
    if (tool.available && tool.link) {
      setLocation(tool.link);
    }
  };

  return (
    <div className="min-h-screen bg-[#F2F2F7]">
      {/* 顶部导航 */}
      <div className="bg-gradient-to-br from-red-600 to-red-800 rounded-b-3xl pb-6 relative">
        <div className="px-4 pt-4 flex items-center gap-3">
          <button
            onClick={() => setLocation("/parent/academy")}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-white" />
          </button>
          <div className="flex items-center gap-2">
            <Wrench className="h-7 w-7 text-white" />
            <h1 className="text-2xl font-bold text-white">脉动工具</h1>
          </div>
        </div>
        <p className="text-white/70 text-sm px-6 mt-2">实用小工具，助力日常决策</p>
      </div>

      {/* 工具网格 - 苹果风格 */}
      <div className="px-4 pt-6">
        <div className="grid grid-cols-4 gap-4">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                onClick={() => handleToolClick(tool)}
                className={`flex flex-col items-center gap-2 active:scale-95 transition-transform ${
                  !tool.available ? "opacity-50" : ""
                }`}
                disabled={!tool.available}
              >
                {/* 苹果风格圆角方形图标 */}
                <div
                  className={`w-16 h-16 ${tool.bgColor} rounded-[18px] flex items-center justify-center shadow-md`}
                >
                  <Icon className="w-8 h-8 text-white" />
                </div>
                <span className="text-xs text-gray-700 text-center leading-tight font-medium">
                  {tool.title}
                </span>
                <span className="text-[10px] text-gray-400 text-center leading-tight -mt-1">
                  {tool.subtitle}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 底部提示 */}
      <div className="mx-4 mt-8 bg-white rounded-2xl p-4 shadow-sm">
        <p className="text-sm text-gray-500 text-center">
          💡 更多实用工具持续开发中，敬请期待
        </p>
      </div>
    </div>
  );
}
