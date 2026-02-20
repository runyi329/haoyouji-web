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
 * 多维度增值模拟器
 * 从"单一滑块"升级为"三维操作台"
 */
export default function MultiDimensionSimulator({
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
    
    // PU转股权的简化公式（实际应从后端获取）
    // 假设：1000 PU ≈ 0.01% 股权
    const equityIncrease = (totalPU / 1000) * 0.01;
    
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
    <div className="space-y-4">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">合伙人资产增值引擎</h3>
        {showLeverageEffect && (
          <div className="flex items-center space-x-1 text-xs text-orange-600 animate-pulse">
            <Zap className="w-3 h-3" />
            <span>杠杆放大中 ×{leverageMultiplier.toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* 三个模拟维度 */}
      <div className="space-y-4">
        {/* 维度1：邀请裂变 */}
        <div className="bg-gradient-to-r from-red-50 to-pink-50 rounded-xl p-4">
          <div className="flex items-center space-x-2 mb-2">
            <Users className="w-4 h-4 text-[#D32F2F]" />
            <span className="text-sm font-semibold text-gray-900">邀请裂变</span>
          </div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-gray-600">预期邀请新股东</label>
            <div className="text-right">
              <span className="text-lg font-bold text-[#D32F2F]">{simInvites}</span>
              <span className="text-xs text-gray-500 ml-1">人</span>
            </div>
          </div>
          <input
            type="range"
            min="0"
            max="50"
            value={simInvites}
            onChange={(e) => setSimInvites(Number(e.target.value))}
            className="w-full h-2 bg-red-200 rounded-lg appearance-none cursor-pointer slider-red"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>0人</span>
            <span className="text-[#D32F2F] font-semibold">+{simInvites * 100} PU</span>
            <span>50人</span>
          </div>
        </div>

        {/* 维度2：人脉连接 */}
        <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-4">
          <div className="flex items-center space-x-2 mb-2">
            <Network className="w-4 h-4 text-[#1976D2]" />
            <span className="text-sm font-semibold text-gray-900">人脉连接</span>
          </div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-gray-600">预期新增人脉</label>
            <div className="text-right">
              <span className="text-lg font-bold text-[#1976D2]">{simNetworkConnections}</span>
              <span className="text-xs text-gray-500 ml-1">人</span>
            </div>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={simNetworkConnections}
            onChange={(e) => setSimNetworkConnections(Number(e.target.value))}
            className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer slider-blue"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>0人</span>
            <span className="text-[#1976D2] font-semibold">+{Math.min(simNetworkConnections * 5, 500)} PU</span>
            <span>100人 (上限500 PU)</span>
          </div>
        </div>

        {/* 维度3：平台参与 */}
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4">
          <div className="flex items-center space-x-2 mb-2">
            <TrendingUp className="w-4 h-4 text-[#4CAF50]" />
            <span className="text-sm font-semibold text-gray-900">平台参与</span>
          </div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-gray-600">预期活跃天数</label>
            <div className="text-right">
              <span className="text-lg font-bold text-[#4CAF50]">{simActiveDays}</span>
              <span className="text-xs text-gray-500 ml-1">天</span>
            </div>
          </div>
          <input
            type="range"
            min="0"
            max="90"
            step="7"
            value={simActiveDays}
            onChange={(e) => setSimActiveDays(Number(e.target.value))}
            className="w-full h-2 bg-green-200 rounded-lg appearance-none cursor-pointer slider-green"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>0天</span>
            <span className="text-[#4CAF50] font-semibold">
              +{Math.floor(simActiveDays / 7) * 50 + Math.floor(simActiveDays / 30) * 200} PU
            </span>
            <span>90天</span>
          </div>
        </div>
      </div>

      {/* 综合预测结果 */}
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-4 text-white">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs opacity-80">预期市场贡献规模</span>
          <div className="flex items-center space-x-1">
            <span className="text-xs opacity-60">总积分</span>
            <span className="text-2xl font-bold text-yellow-400">{simulation.totalPU}</span>
            <span className="text-xs opacity-80">PU</span>
          </div>
        </div>
        
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="opacity-80">基础股权增值</span>
            <span className="font-semibold">+{simulation.equityIncrease.toFixed(4)}%</span>
          </div>
          
          {showLeverageEffect && (
            <div className="flex items-center justify-between border-t border-white/20 pt-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="flex items-center space-x-1">
                <Zap className="w-3 h-3 text-yellow-400" />
                <span className="opacity-80">杠杆放大后</span>
              </div>
              <span className="text-xl font-bold text-yellow-400">
                +{simulation.leveragedEquityIncrease.toFixed(4)}%
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
