import { createElement } from 'react';
import { Trophy, Users, DollarSign, Award, Crown, Gem, Medal, Sparkles } from 'lucide-react';

interface AchievementLevel {
  name: string;
  threshold: number;
  color: string;
  icon: any;
  equityBonus: number; // 该成就解锁的额外分红权重
}

interface Achievement {
  category: string;
  icon: any;
  current: number;
  levels: AchievementLevel[];
  description: string;
}

interface AchievementWallProps {
  inviteCount: number;
  investmentAmount: number;
  networkSize: number;
}

/**
 * 成就勋章墙
 * 从"简单方块"升级为"金属质感荣耀墙"
 */
export default function AchievementWall({
  inviteCount,
  investmentAmount,
  networkSize,
}: AchievementWallProps) {
  const achievements: Achievement[] = [
    {
      category: '邀请成就',
      icon: Users,
      current: inviteCount,
      description: '成功邀请新股东加入',
      levels: [
        { name: '铜牌邀请人', threshold: 5, color: '#CD7F32', icon: Medal, equityBonus: 0.001 },
        { name: '银牌邀请人', threshold: 20, color: '#C0C0C0', icon: Award, equityBonus: 0.003 },
        { name: '金牌邀请人', threshold: 50, color: '#FFD700', icon: Crown, equityBonus: 0.008 },
        { name: '钻石邀请人', threshold: 100, color: '#B9F2FF', icon: Gem, equityBonus: 0.020 },
      ],
    },
    {
      category: '投资成就',
      icon: DollarSign,
      current: investmentAmount,
      description: '累计投资金额',
      levels: [
        { name: '铜牌投资人', threshold: 10000, color: '#CD7F32', icon: Medal, equityBonus: 0.002 },
        { name: '银牌投资人', threshold: 50000, color: '#C0C0C0', icon: Award, equityBonus: 0.005 },
        { name: '金牌投资人', threshold: 100000, color: '#FFD700', icon: Crown, equityBonus: 0.015 },
        { name: '钻石投资人', threshold: 500000, color: '#B9F2FF', icon: Gem, equityBonus: 0.050 },
      ],
    },
    {
      category: '人脉成就',
      icon: Sparkles,
      current: networkSize,
      description: '累计人脉网络规模',
      levels: [
        { name: '铜牌人脉王', threshold: 50, color: '#CD7F32', icon: Medal, equityBonus: 0.001 },
        { name: '银牌人脉王', threshold: 200, color: '#C0C0C0', icon: Award, equityBonus: 0.003 },
        { name: '金牌人脉王', threshold: 500, color: '#FFD700', icon: Crown, equityBonus: 0.010 },
        { name: '钻石人脉王', threshold: 1000, color: '#B9F2FF', icon: Gem, equityBonus: 0.030 },
      ],
    },
  ];

  return (
    <div className="space-y-3">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">成就勋章墙</h3>
        <span className="text-xs text-gray-400">荣耀即权益</span>
      </div>

      {/* 勋章列表 */}
      <div className="space-y-3">
        {achievements.map((achievement, idx) => {
          const currentLevel = achievement.levels.filter(l => achievement.current >= l.threshold).pop();
          const nextLevel = achievement.levels.find(l => achievement.current < l.threshold);
          const Icon = achievement.icon;
          
          // 判断是否是高等级勋章（金牌、钻石）
          const isHighLevel = currentLevel && (currentLevel.name.includes('金牌') || currentLevel.name.includes('钻石'));
          
          // 计算进度百分比
          const progress = nextLevel 
            ? Math.min(100, (achievement.current / nextLevel.threshold) * 100)
            : 100;

          return (
            <div 
              key={idx} 
              className={`rounded-xl p-4 transition-all ${
                isHighLevel 
                  ? 'bg-gradient-to-br from-yellow-50 via-amber-50 to-orange-50 border-2 border-yellow-400 shadow-lg' 
                  : 'bg-white border border-gray-200'
              }`}
            >
              {/* 顶部：类别 + 当前勋章 */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    isHighLevel ? 'bg-gradient-to-br from-yellow-400 to-orange-500' : 'bg-gray-100'
                  }`}>
                    <Icon className={`w-4 h-4 ${isHighLevel ? 'text-white' : 'text-gray-600'}`} />
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-gray-900">{achievement.category}</span>
                    <p className="text-xs text-gray-500">{achievement.description}</p>
                  </div>
                </div>
                
                {currentLevel && (
                  <div className={`flex items-center space-x-1.5 ${
                    isHighLevel ? 'animate-pulse' : ''
                  }`}>
                    {createElement(currentLevel.icon, {
                      className: `w-6 h-6 ${
                        isHighLevel ? 'drop-shadow-lg' : ''
                      }`,
                      style: { color: currentLevel.color },
                    })}
                    <span 
                      className={`text-sm font-bold ${
                        isHighLevel ? 'drop-shadow-sm' : ''
                      }`} 
                      style={{ color: currentLevel.color }}
                    >
                      {currentLevel.name}
                    </span>
                  </div>
                )}
              </div>

              {/* 中部：权益说明 */}
              {currentLevel && (
                <div className={`mb-3 p-2.5 rounded-lg ${
                  isHighLevel 
                    ? 'bg-gradient-to-r from-yellow-100 to-amber-100 border border-yellow-300' 
                    : 'bg-gray-50 border border-gray-200'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">该成就已为你解锁</span>
                    <div className="flex items-center space-x-1">
                      <span className="text-sm font-bold text-orange-600">
                        +{(currentLevel.equityBonus * 100).toFixed(3)}%
                      </span>
                      <span className="text-xs text-gray-500">分红权重</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 底部：下一级进度 */}
              {nextLevel ? (
                <div>
                  <div className="flex items-center justify-between text-xs text-gray-600 mb-1.5">
                    <div className="flex items-center space-x-1">
                      <span>下一级：</span>
                      <span className="font-semibold" style={{ color: nextLevel.color }}>
                        {nextLevel.name}
                      </span>
                    </div>
                    <span className="font-mono">
                      {achievement.current.toLocaleString()} / {nextLevel.threshold.toLocaleString()}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500 relative"
                      style={{
                        width: `${progress}%`,
                        backgroundColor: nextLevel.color,
                      }}
                    >
                      {/* 光泽效果 */}
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-30 animate-shimmer"></div>
                    </div>
                  </div>
                  
                  {/* 下一级权益预告 */}
                  <div className="mt-2 text-xs text-gray-500 flex items-center justify-between">
                    <span>升级后可额外获得</span>
                    <span className="font-semibold text-orange-600">
                      +{(nextLevel.equityBonus * 100).toFixed(3)}% 分红权重
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center py-2 bg-gradient-to-r from-yellow-100 to-amber-100 rounded-lg">
                  <Crown className="w-4 h-4 text-yellow-600 mr-1.5" />
                  <span className="text-xs font-semibold text-yellow-700">已达最高等级</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 底部汇总 */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-xl p-4 text-white">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs opacity-80">当前成就累计解锁</span>
          <Trophy className="w-4 h-4 text-yellow-400" />
        </div>
        <div className="flex items-baseline space-x-2">
          <span className="text-3xl font-bold text-yellow-400">
            {(achievements.reduce((sum, a) => {
              const currentLevel = a.levels.filter(l => a.current >= l.threshold).pop();
              return sum + (currentLevel?.equityBonus || 0);
            }, 0) * 100).toFixed(3)}%
          </span>
          <span className="text-xs opacity-70">额外分红权重</span>
        </div>
        <p className="text-xs opacity-60 mt-2">
          继续努力，解锁更多成就可持续提升您的股东权益
        </p>
      </div>
    </div>
  );
}
