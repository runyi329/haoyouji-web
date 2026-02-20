import { useState, useEffect } from 'react';
import { Users, Network, TrendingUp, Zap } from 'lucide-react';

interface SimulatorProps {
  currentInvites: number;
  currentNetworkSize: number;
  currentActiveDays: number;
  leverageMultiplier: number;
  onSimulationChange: (result: SimulationResult) => void;
}

export interface SimulationResult {
  invites: number;
  networkConnections: number;
  activeDays: number;
  totalPU: number;
  equityIncrease: number;
  leveragedEquityIncrease: number;
}

/**
 * 精密中控台模拟器
 * 从"玩具滑块"升级为"金融级操作台"
 * 
 * 核心设计：
 * 1. 深炭灰背景 #1A1A1A
 * 2. 1px细线轨道 + 金属质感白色圆点
 * 3. 呼吸灯边框（微微闪烁）
 * 4. 简化文案："市场覆盖模拟" + "+50人"
 */
export default function PrecisionSimulator({
  currentInvites,
  currentNetworkSize,
  currentActiveDays,
  leverageMultiplier,
  onSimulationChange,
}: SimulatorProps) {
  // 三个模拟维度
  const [simInvites, setSimInvites] = useState(0);
  const [simNetworkConnections, setSimNetworkConnections] = useState(0);
  const [simActiveDays, setSimActiveDays] = useState(0);
  
  // 是否显示杠杆放大动画
  const [showLeverageEffect, setShowLeverageEffect] = useState(false);

  // 根据积分表计算PU和股权增值
  const calculateSimulation = (): SimulationResult => {
    let totalPU = 0;
    
    // 维度1：邀请裂变
    // 成功邀请新用户注册：100 PU/人（无限制）
    totalPU += simInvites * 100;
    
    // 维度2：人脉连接
    // 添加一度人脉（基本信息输入）：5 PU/人（每日最多10次，总上限500）
    const networkPU = Math.min(simNetworkConnections * 5, 500);
    totalPU += networkPU;
    
    // 维度3：平台参与
    // 连续7天登录：50 PU（每周一次）
    // 连续30天登录：200 PU（每月一次）
    const weeks = Math.floor(simActiveDays / 7);
    const months = Math.floor(simActiveDays / 30);
    totalPU += weeks * 50 + months * 200;
    
    // 邀请直接转股权：每邀请1人 = +0.05% 股权
    const inviteEquity = simInvites * 0.05;
    
    // PU转股权的简化公式
    // 假设：1000 PU ≈ 0.01% 股权
    const puEquity = (totalPU / 1000) * 0.01;
    
    const equityIncrease = inviteEquity + puEquity;
    
    // 杠杆放大后的股权
    const leveragedEquityIncrease = equityIncrease * leverageMultiplier;
    
    return {
      invites: simInvites,
      networkConnections: simNetworkConnections,
      activeDays: simActiveDays,
      totalPU,
      equityIncrease,
      leveragedEquityIncrease,
    };
  };

  // 实时计算并通知父组件
  useEffect(() => {
    const result = calculateSimulation();
    onSimulationChange(result);
    
    // 当有任何模拟值时，显示杠杆效果
    if (simInvites > 0 || simNetworkConnections > 0 || simActiveDays > 0) {
      setShowLeverageEffect(true);
    } else {
      setShowLeverageEffect(false);
    }
  }, [simInvites, simNetworkConnections, simActiveDays]);

  const simulation = calculateSimulation();

  return (
    <div className="bg-[#1A1A1A] rounded-2xl p-5 shadow-2xl">
      {/* 标题 - 精简化 */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-sm font-semibold text-white/90">市场贡献模拟中控台</h3>
        {showLeverageEffect && (
          <div className="flex items-center space-x-1 px-2 py-1 rounded-full bg-white/10 border border-yellow-500/30 animate-pulse">
            <Zap className="w-3 h-3 text-[#FFA726]" />
            <span className="text-xs font-medium text-[#FFA726]">×{leverageMultiplier.toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* 三个模拟维度 - 精密化 */}
      <div className="space-y-5">
        {/* 维度1：邀请裂变 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded-lg bg-[#D32F2F]/10 flex items-center justify-center">
                <Users className="w-3.5 h-3.5 text-[#D32F2F]" />
              </div>
              <span className="text-xs font-medium text-white/70">邀请裂变</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-xl font-bold text-white tabular-nums">{simInvites}</span>
              <span className="text-xs text-white/50">人</span>
            </div>
          </div>
          
          {/* 精密滑块 - 1px细线轨道 */}
          <div className="relative">
            <input
              type="range"
              min="0"
              max="50"
              value={simInvites}
              onChange={(e) => setSimInvites(Number(e.target.value))}
              className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer precision-slider"
              style={{
                background: `linear-gradient(to right, #ef4444 0%, #ef4444 ${(simInvites / 50) * 100}%, rgba(255,255,255,0.1) ${(simInvites / 50) * 100}%, rgba(255,255,255,0.1) 100%)`
              }}
            />
          </div>
          
          <div className="flex justify-between items-center text-xs">
            <span className="text-white/40">0</span>
            <span className="text-[#D32F2F] font-semibold tabular-nums">+{simInvites * 100} PU</span>
            <span className="text-white/40">50</span>
          </div>
        </div>

        {/* 维度2：人脉连接 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded-lg bg-[#1976D2]/10 flex items-center justify-center">
                <Network className="w-3.5 h-3.5 text-[#1976D2]" />
              </div>
              <span className="text-xs font-medium text-white/70">人脉连接</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-xl font-bold text-white tabular-nums">{simNetworkConnections}</span>
              <span className="text-xs text-white/50">人</span>
            </div>
          </div>
          
          {/* 精密滑块 */}
          <div className="relative">
            <input
              type="range"
              min="0"
              max="100"
              value={simNetworkConnections}
              onChange={(e) => setSimNetworkConnections(Number(e.target.value))}
              className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer precision-slider"
              style={{
                background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(simNetworkConnections / 100) * 100}%, rgba(255,255,255,0.1) ${(simNetworkConnections / 100) * 100}%, rgba(255,255,255,0.1) 100%)`
              }}
            />
          </div>
          
          <div className="flex justify-between items-center text-xs">
            <span className="text-white/40">0</span>
            <span className="text-[#1976D2] font-semibold tabular-nums">+{Math.min(simNetworkConnections * 5, 500)} PU</span>
            <span className="text-white/40">100</span>
          </div>
        </div>

        {/* 维度3：平台参与 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded-lg bg-[#4CAF50]/10 flex items-center justify-center">
                <TrendingUp className="w-3.5 h-3.5 text-[#4CAF50]" />
              </div>
              <span className="text-xs font-medium text-white/70">平台参与</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-xl font-bold text-white tabular-nums">{simActiveDays}</span>
              <span className="text-xs text-white/50">天</span>
            </div>
          </div>
          
          {/* 精密滑块 */}
          <div className="relative">
            <input
              type="range"
              min="0"
              max="90"
              step="7"
              value={simActiveDays}
              onChange={(e) => setSimActiveDays(Number(e.target.value))}
              className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer precision-slider"
              style={{
                background: `linear-gradient(to right, #10b981 0%, #10b981 ${(simActiveDays / 90) * 100}%, rgba(255,255,255,0.1) ${(simActiveDays / 90) * 100}%, rgba(255,255,255,0.1) 100%)`
              }}
            />
          </div>
          
          <div className="flex justify-between items-center text-xs">
            <span className="text-white/40">0</span>
            <span className="text-[#4CAF50] font-semibold tabular-nums">
              +{Math.floor(simActiveDays / 7) * 50 + Math.floor(simActiveDays / 30) * 200} PU
            </span>
            <span className="text-white/40">90</span>
          </div>
        </div>
      </div>

      {/* 综合预测结果 - 呼吸灯边框 */}
      <div className={`mt-6 rounded-xl p-4 border transition-all duration-500 ${
        showLeverageEffect 
          ? 'bg-gradient-to-br from-yellow-500/5 to-orange-500/5 border-yellow-500/30 shadow-lg shadow-yellow-500/10' 
          : 'bg-white/5 border-white/10'
      }`}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-white/60">预期增值</span>
          <div className="flex items-center space-x-2">
            <span className="text-xs text-white/50">总积分</span>
            <span className="text-2xl font-bold text-[#FFA726] tabular-nums">{simulation.totalPU}</span>
            <span className="text-xs text-white/60">PU</span>
          </div>
        </div>
        
        <div className="space-y-2.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-white/60 text-xs">基础股权增值</span>
            <span className="font-semibold text-white tabular-nums">+{simulation.equityIncrease.toFixed(4)}%</span>
          </div>
          
          {showLeverageEffect && (
            <div className="flex items-center justify-between border-t border-white/10 pt-2.5 animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="flex items-center space-x-1.5">
                <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center animate-pulse">
                  <Zap className="w-3 h-3 text-[#FFA726]" />
                </div>
                <span className="text-white/80 text-xs font-medium">杠杆放大后</span>
              </div>
              <span className="text-2xl font-bold text-[#FFA726] tabular-nums">
                +{simulation.leveragedEquityIncrease.toFixed(4)}%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 添加精密滑块样式 */}
      <style>{`
        .precision-slider::-webkit-slider-thumb {
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: linear-gradient(135deg, #ffffff 0%, #e5e5e5 100%);
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3), inset 0 1px 2px rgba(255, 255, 255, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.2);
          transition: all 0.2s ease;
        }
        
        .precision-slider::-webkit-slider-thumb:hover {
          transform: scale(1.1);
          box-shadow: 0 3px 8px rgba(0, 0, 0, 0.4), inset 0 1px 2px rgba(255, 255, 255, 0.9);
        }
        
        .precision-slider::-webkit-slider-thumb:active {
          transform: scale(0.95);
        }
        
        .precision-slider::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: linear-gradient(135deg, #ffffff 0%, #e5e5e5 100%);
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3), inset 0 1px 2px rgba(255, 255, 255, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.2);
          transition: all 0.2s ease;
        }
        
        .precision-slider::-moz-range-thumb:hover {
          transform: scale(1.1);
          box-shadow: 0 3px 8px rgba(0, 0, 0, 0.4), inset 0 1px 2px rgba(255, 255, 255, 0.9);
        }
        
        .precision-slider::-moz-range-thumb:active {
          transform: scale(0.95);
        }
      `}</style>
    </div>
  );
}
