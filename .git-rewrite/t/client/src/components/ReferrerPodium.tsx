import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";

interface ReferrerStat {
  contactId: number;
  contactName: string;
  directCount: number;
  indirectCount: number;
  totalScore: number;
}

interface ReferrerPodiumProps {
  topThree: ReferrerStat[];
}

export function ReferrerPodium({ topThree }: ReferrerPodiumProps) {
  const [, setLocation] = useLocation();

  if (topThree.length === 0) {
    return null;
  }

  // 准备领奖台数据：[第2名, 第1名, 第3名]
  const podiumData = [
    topThree[1] || null, // 第2名（左侧）
    topThree[0] || null, // 第1名（中间）
    topThree[2] || null, // 第3名（右侧）
  ];

  const medals = ["🥈", "🥇", "🥉"];
  const heights = ["h-32", "h-40", "h-32"];
  const gradients = [
    "from-gray-300 to-gray-400", // 银色
    "from-yellow-300 to-yellow-500", // 金色
    "from-orange-300 to-orange-400", // 铜色
  ];

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">🏆 介绍人贡献榜</h2>
        <button
          onClick={() => setLocation("/parent/contacts/referrer-leaderboard")}
          className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
        >
          查看完整排行榜 →
        </button>
      </div>

      <div className="flex items-end justify-center gap-4">
        {podiumData.map((person, index) => {
          if (!person) {
            return (
              <div
                key={index}
                className={`flex-1 max-w-[160px] ${heights[index]} opacity-30`}
              >
                <Card className="h-full flex flex-col items-center justify-center bg-gray-100">
                  <div className="text-4xl mb-2">{medals[index]}</div>
                  <div className="text-sm text-gray-400">暂无数据</div>
                </Card>
              </div>
            );
          }

          return (
            <div
              key={person.contactId}
              className={`flex-1 max-w-[160px] ${heights[index]} cursor-pointer transform transition-transform hover:scale-105`}
              onClick={() => setLocation("/parent/contacts/referrer-leaderboard")}
            >
              <Card
                className={`h-full flex flex-col items-center justify-center bg-gradient-to-br ${gradients[index]} text-white shadow-lg`}
              >
                <div className="text-4xl mb-2">{medals[index]}</div>
                <div className="text-lg font-bold mb-2 text-center px-2 truncate w-full">
                  {person.contactName}
                </div>
                <div className="text-xs space-y-1 text-center">
                  <div>直接: {person.directCount}人</div>
                  <div>间接: {person.indirectCount}人</div>
                  <div className="font-bold border-t border-white/30 pt-1 mt-1">
                    总计: {person.directCount + person.indirectCount}人
                  </div>
                </div>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}
