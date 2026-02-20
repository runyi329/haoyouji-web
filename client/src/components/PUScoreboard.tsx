import { Trophy, TrendingUp, Target, Sparkles } from 'lucide-react';

interface ScoreboardProps {
  currentPU: number;
  currentRank: number;
  totalShareholders: number;
  nextLevelPU: number;
  nextLevelName: string;
}

/**
 * PU积分实时看板
 * 显示当前积分、排名、下一等级进度
 */
export default function PUScoreboard({
  currentPU,
  currentRank,
  totalShareholders,
  nextLevelPU,
  nextLevelName,
}: ScoreboardProps) {
  const progress = (currentPU / nextLevelPU) * 100;
  const remainingPU = nextLevelPU - currentPU;

  // 根据排名确定勋章颜色
  const getRankColor = (rank: number) => {
    if (rank === 1) return 'from-yellow-400 to-orange-500';
    if (rank <= 3) return 'from-gray-300 to-gray-400';
    if (rank <= 10) return 'from-amber-600 to-yellow-700';
    return 'from-blue-500 to-cyan-600';
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return '👑';
    if (rank <= 3) return '🥈';
    if (rank <= 10) return '🥉';
    return '🎖️';
  };

  return (
    <div className="space-y-3">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">贡献积分（PU）实时看板</h3>
        <div className="flex items-center space-x-1 text-xs text-gray-400">
          <div className="w-1.5 h-1.5 rounded-full bg-[#4CAF50] animate-pulse" />
          <span>实时同步</span>
        </div>
      </div>

      {/* 主看板 */}
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-4 text-white">
        <div className="grid grid-cols-3 gap-4">
          {/* 当前总积分 */}
          <div className="text-center">
            <div className="flex items-center justify-center space-x-1 mb-1">
              <Sparkles className="w-3 h-3 text-yellow-400" />
              <span className="text-xs opacity-70">总积分</span>
            </div>
            <div className="text-2xl font-bold text-yellow-400">{currentPU.toLocaleString()}</div>
            <div className="text-[10px] opacity-60 mt-0.5">PU</div>
          </div>

          {/* 当前排名 */}
          <div className="text-center border-l border-r border-white/20">
            <div className="flex items-center justify-center space-x-1 mb-1">
              <Trophy className="w-3 h-3 text-orange-400" />
              <span className="text-xs opacity-70">当前排名</span>
            </div>
            <div className="flex items-center justify-center space-x-1">
              <span className="text-xl">{getRankIcon(currentRank)}</span>
              <span className="text-2xl font-bold">#{currentRank}</span>
            </div>
            <div className="text-[10px] opacity-60 mt-0.5">共{totalShareholders}位股东</div>
          </div>

          {/* 距离下一等级 */}
          <div className="text-center">
            <div className="flex items-center justify-center space-x-1 mb-1">
              <Target className="w-3 h-3 text-green-400" />
              <span className="text-xs opacity-70">距下一级</span>
            </div>
            <div className="text-2xl font-bold text-green-400">{remainingPU}</div>
            <div className="text-[10px] opacity-60 mt-0.5">PU</div>
          </div>
        </div>

        {/* 等级进度条 */}
        <div className="mt-4 pt-4 border-t border-white/20">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="opacity-70">升级进度</span>
            <div className="flex items-center space-x-1">
              <span className="font-semibold">{nextLevelName}</span>
              <span className="opacity-60">({progress.toFixed(1)}%)</span>
            </div>
          </div>
          <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full transition-all duration-500 relative"
              style={{ width: `${Math.min(progress, 100)}%` }}
            >
              <div className="absolute inset-0 bg-white/30 animate-pulse" />
            </div>
          </div>
          <div className="flex justify-between text-[10px] opacity-60 mt-1">
            <span>{currentPU} PU</span>
            <span>{nextLevelPU} PU</span>
          </div>
        </div>
      </div>

      {/* 等级权益说明 */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg p-3 border border-amber-200">
        <div className="flex items-start space-x-2">
          <TrendingUp className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-xs font-semibold text-gray-900 mb-1">升级至"{nextLevelName}"后可获得</h4>
            <ul className="text-xs text-gray-600 space-y-0.5">
              <li className="flex items-center space-x-1">
                <span className="text-orange-600">•</span>
                <span>额外股权加成 +0.05%</span>
              </li>
              <li className="flex items-center space-x-1">
                <span className="text-orange-600">•</span>
                <span>专属勋章与身份标识</span>
              </li>
              <li className="flex items-center space-x-1">
                <span className="text-orange-600">•</span>
                <span>优先参与公司重大决策</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* 排名变化趋势（模拟数据） */}
      <div className="bg-white rounded-lg p-3 border border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-gray-700">近7日排名趋势</span>
          <span className="text-xs text-[#4CAF50] font-semibold flex items-center space-x-1">
            <TrendingUp className="w-3 h-3" />
            <span>↑ 上升3位</span>
          </span>
        </div>
        <div className="flex items-end justify-between h-12 space-x-1">
          {[15, 18, 14, 12, 10, 8, currentRank].map((rank, index) => {
            const height = ((20 - rank) / 20) * 100;
            return (
              <div key={index} className="flex-1 flex flex-col items-center">
                <div 
                  className={`w-full rounded-t transition-all ${
                    index === 6 ? 'bg-gradient-to-t from-orange-500 to-yellow-400' : 'bg-gray-300'
                  }`}
                  style={{ height: `${height}%` }}
                />
                <span className="text-[9px] text-gray-400 mt-1">
                  {index === 0 ? '7天前' : index === 6 ? '今天' : ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
