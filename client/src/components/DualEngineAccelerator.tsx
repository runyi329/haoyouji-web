import { HelpCircle, TrendingUp, Shield, Award, ChevronRight, Clock } from "lucide-react";
import { useState } from "react";

interface DualEngineAcceleratorProps {
  // 红色区域相关
  nodeLevel: 'none' | 'standard' | 'advanced' | 'super'; // 当前节点等级
  contribEquity: number; // 市场权重（贡献加成）
  
  // 股权加成相关
  equityMultiplier: number; // 股权加成倍数，如 1.2
  investmentEquity: number; // 投资股权
  
  // 身份加成相关
  identityMultiplier: number; // 身份加成倍数，如 1.0
  
  // 已达成资产（向下兼容统计）
  standardNodes: number; // 标准节点数（含高级/超级）
  advancedNodes: number; // 高级节点数（含超级）
  superNodes: number; // 超级节点数
  
  // 正在培育（潜力向上折算）
  potentialStandard: number; // 潜在标准节点数
  potentialAdvanced: number; // 潜在高级节点数
  potentialSuper: number; // 潜在超级节点数
  
  // 总培育数（带金色呼吸光晕）
  totalCultivating: number;
}

export default function DualEngineAccelerator(props: DualEngineAcceleratorProps) {
  const [showMultiplierHelp, setShowMultiplierHelp] = useState(false);
  const [showAchievedHelp, setShowAchievedHelp] = useState(false);
  const [showCultivatingHelp, setShowCultivatingHelp] = useState(false);
  const [showRules, setShowRules] = useState(false);
  
  // 计算总收益倍数
  const totalMultiplier = props.equityMultiplier + props.identityMultiplier;
  
  // 节点配置
  const nodeConfig: Record<string, { name: string; badge: string }> = {
    none: { name: '准合伙人', badge: 'L0' },
    standard: { name: '标准节点', badge: 'L1' },
    advanced: { name: '高级节点', badge: 'L2' },
    super: { name: '超级节点', badge: 'L3' },
  };
  const config = nodeConfig[props.nodeLevel];
  
  // 顶部卡片样式
  const getTopCardStyle = () => {
    switch (props.nodeLevel) {
      case 'none': return 'bg-[#F5F5F5] text-gray-600';
      case 'standard': return 'bg-gradient-to-br from-[#A80000] to-[#8a0000] text-white';
      case 'advanced': return 'bg-gradient-to-br from-[#0a1628] to-[#1a2744] text-white';
      case 'super': return 'bg-gradient-to-br from-[#1a1a2e] via-[#2d2d44] to-[#1a1a2e] text-white';
    }
  };
  
  // 计算倒计时（到本周日24:00）
  const getCountdown = () => {
    const now = new Date();
    const sunday = new Date(now);
    sunday.setDate(now.getDate() + (7 - now.getDay()));
    sunday.setHours(23, 59, 59, 999);
    const diff = sunday.getTime() - now.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return `${days}天${hours}小时`;
  };
  
  return (
    <div className="space-y-0">
      {/* ====== 红色区域（汇总） ====== */}
      <div className={`relative overflow-hidden p-4 rounded-t-2xl ${getTopCardStyle()}`}>
        {/* 标题行 */}
        <div className="flex items-center justify-between mb-3">
          <span className={`text-sm font-medium ${props.nodeLevel === 'none' ? 'text-gray-500' : 'opacity-90'}`}>
            市场贡献激励
          </span>
          <div className="flex items-center space-x-2">
            {/* 倒计时 */}
            <span className={`text-[10px] font-mono ${props.nodeLevel === 'none' ? 'text-gray-400' : 'opacity-60'} bg-white/10 px-2 py-0.5 rounded flex items-center space-x-1`}>
              <Clock className="w-3 h-3" style={{ color: '#C5B358' }} />
              <span>距离资产定格还剩 {getCountdown()}</span>
            </span>
            {/* 问号按钮 */}
            <button
              onClick={() => setShowRules(true)}
              className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <span className="text-xs">?</span>
            </button>
          </div>
        </div>
        {/* 左右布局：我的身份 | 市场权重 */}
        <div className="grid grid-cols-2 gap-4">
          {/* 左侧：我的身份 */}
          <div>
            <div className={`text-xs ${props.nodeLevel === 'none' ? 'text-gray-400' : 'opacity-70'} mb-1`}>我的身份</div>
            <div className="text-2xl font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {config.name}
            </div>
            <div className={`text-[10px] ${props.nodeLevel === 'none' ? 'text-gray-400' : 'opacity-60'} mt-0.5`}>
              由个人人脉贡献决定
            </div>
          </div>
          {/* 右侧：市场权重 */}
          <div className="text-right">
            <div className={`text-xs ${props.nodeLevel === 'none' ? 'text-gray-400' : 'opacity-70'} mb-1`}>市场权重</div>
            <div className="text-2xl font-bold text-[#C5B358]" style={{ fontVariantNumeric: 'tabular-nums' }}>
              +{(props.contribEquity).toFixed(4)}%
            </div>
            <div className={`text-[10px] ${props.nodeLevel === 'none' ? 'text-gray-400' : 'opacity-60'} mt-0.5`}>
              由共享人脉贡献决定
            </div>
          </div>
        </div>
      </div>
      
      {/* ====== 白色区域（明细） ====== */}
      <div className="bg-[#F9F9F9] rounded-b-3xl p-4 space-y-5">
        
        {/* ============ 一、收益倍数计算器 ============ */}
        <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4">
          {/* 标题 */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-600 font-medium">当前总收益倍数</span>
            <button
              onClick={() => setShowMultiplierHelp(!showMultiplierHelp)}
              className="text-gray-400 hover:text-[#C5B358] transition-colors"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
          
          {/* 公式化布局 */}
          <div className="flex items-center justify-center space-x-3">
            {/* 总倍数（大圆环） */}
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#A80000] to-[#8a0000] flex items-center justify-center shadow-lg">
                <div className="text-center">
                  <div className="text-2xl font-bold text-white">{totalMultiplier.toFixed(1)}</div>
                  <div className="text-[10px] text-white/70">倍</div>
                </div>
              </div>
              {/* 微弱金属反光动效 */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-transparent via-white/20 to-transparent animate-pulse"></div>
            </div>
            
            {/* 等号 */}
            <div className="text-gray-400 text-xl font-light">=</div>
            
            {/* 拆解公式 */}
            <div className="flex items-center space-x-2">
              {/* 股权加成 */}
              <div className="bg-[#A80000]/10 border border-[#A80000]/30 rounded-lg px-3 py-2 min-w-[80px]">
                <div className="flex items-center space-x-1 mb-1">
                  <Shield className="w-3 h-3 text-[#A80000]" />
                  <span className="text-[10px] text-gray-600">股权加成</span>
                </div>
                <div className="text-lg font-bold text-[#A80000]">{props.equityMultiplier.toFixed(1)}倍</div>
              </div>
              
              {/* 加号 */}
              <div className="text-[#C5B358] text-xl font-bold">+</div>
              
              {/* 身份加成 */}
              <div className="bg-[#C5B358]/10 border border-[#C5B358]/30 rounded-lg px-3 py-2 min-w-[80px]">
                <div className="flex items-center space-x-1 mb-1">
                  <Award className="w-3 h-3 text-[#C5B358]" />
                  <span className="text-[10px] text-gray-600">身份加成</span>
                </div>
                <div className="text-lg font-bold text-[#C5B358]">{props.identityMultiplier.toFixed(1)}倍</div>
              </div>
            </div>
          </div>
          
          {/* 说明文字 */}
          <div className="mt-3 text-center">
            <span className="text-[10px] text-gray-500">由股权资产包决定</span>
            <span className="text-[10px] text-gray-400 mx-2">+</span>
            <span className="text-[10px] text-gray-500">由当前个人等级决定</span>
          </div>
          
          {/* 问号弹窗 */}
          {showMultiplierHelp && (
            <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-gray-700 space-y-2">
              <div className="font-bold text-gray-900">收益加速计算规则</div>
              <div>
                <span className="font-medium">● 股权加成：</span>根据您持有的原始股权资产包额度及入场时间计算，体现您的资本贡献。
              </div>
              <div>
                <span className="font-medium">● 身份加成：</span>根据您当前达成的节点等级（标准/高级/超级）计算，体现您的人脉贡献。
              </div>
              <div>
                <span className="font-medium">● 总收益公式：</span>市场贡献收益 × (股权加成 + 身份加成) = 最终结算收益。
              </div>
            </div>
          )}
        </div>
        
        {/* ============ 二、资产阶梯双翼（40/60比例） ============ */}
        <div className="grid grid-cols-[40%_60%] gap-3">
          
          {/* 左翼：已达成资产（向下兼容统计） */}
          <div className="bg-gray-50 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-600 font-medium">已达成节点</span>
              <button
                onClick={() => setShowAchievedHelp(!showAchievedHelp)}
                className="text-gray-400 hover:text-[#C5B358] transition-colors"
              >
                <HelpCircle className="w-3 h-3" />
              </button>
            </div>
            
            {/* 核心数值 */}
            <div className="text-3xl font-bold text-[#A80000] mb-3">{props.standardNodes}</div>
            
            {/* 明细展示（字号递减） */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">标准权</span>
                <span className="font-medium text-gray-900">{props.standardNodes}</span>
              </div>
              <div className="text-[10px] text-gray-400 pl-2">（含高级/超级）</div>
              
              <div className="flex items-center justify-between text-xs mt-2">
                <span className="text-gray-600">高级权</span>
                <span className="font-medium text-gray-900">{props.advancedNodes}</span>
              </div>
              <div className="text-[10px] text-gray-400 pl-2">（含超级）</div>
              
              <div className="flex items-center justify-between text-xs mt-2">
                <span className="text-gray-600">超级权</span>
                <span className="font-medium text-[#C5B358]">{props.superNodes}</span>
              </div>
            </div>
            
            {/* 问号弹窗 */}
            {showAchievedHelp && (
              <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-2 text-[10px] text-gray-700">
                <div className="font-bold text-gray-900 mb-1">向下兼容统计原则</div>
                <div>若您培育出一个【超级节点】，由于其天然符合【高级】与【标准】的要求，系统将同步为您增加三级资产池的权数，助您数据最大化。</div>
              </div>
            )}
          </div>
          
          {/* 右翼：资产培育中心（潜力向上折算） */}
          <div className="bg-gradient-to-br from-[#C5B358]/5 to-[#C5B358]/10 rounded-xl p-3 border border-[#C5B358]/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-600 font-medium">正在培育</span>
              <button
                onClick={() => setShowCultivatingHelp(!showCultivatingHelp)}
                className="text-gray-400 hover:text-[#C5B358] transition-colors"
              >
                <HelpCircle className="w-3 h-3" />
              </button>
            </div>
            
            {/* 核心数值（带金色呼吸光晕） */}
            <div className="relative mb-3">
              <div className="text-3xl font-bold text-[#C5B358]">{props.totalCultivating}</div>
              {/* 金色呼吸光晕 */}
              <div className="absolute -inset-1 bg-[#C5B358]/20 rounded-lg blur-sm animate-pulse -z-10"></div>
            </div>
            
            {/* 明细展示 */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">潜在标准</span>
                <span className="font-medium text-gray-900">{props.potentialStandard}</span>
              </div>
              <div className="text-[10px] text-gray-400 pl-2">新邀约活跃者</div>
              
              <div className="flex items-center justify-between text-xs mt-2">
                <span className="text-gray-600">潜在高级</span>
                <span className="font-medium text-gray-900">{props.potentialAdvanced}</span>
              </div>
              <div className="text-[10px] text-gray-400 pl-2">由标准升级中</div>
              
              <div className="flex items-center justify-between text-xs mt-2">
                <span className="text-gray-600">潜在超级</span>
                <span className="font-medium text-[#C5B358]">{props.potentialSuper}</span>
              </div>
              <div className="text-[10px] text-gray-400 pl-2">由高级冲刺中</div>
            </div>
            
            {/* 问号弹窗 */}
            {showCultivatingHelp && (
              <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-2 text-[10px] text-gray-700">
                <div className="font-bold text-gray-900 mb-1">潜力向上折算</div>
                <div className="space-y-1">
                  <div>● 尚未达标的受邀人视为【潜在标准】。</div>
                  <div>● 已达标节点将根据其活跃度，自动被系统识别为更高级别的【潜在对象】，提醒您重点辅导。</div>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* ============ 三、联动操作与快捷入口 ============ */}
        <div className="grid grid-cols-2 gap-2 pt-2">
          <button className="flex items-center justify-between bg-gray-50 hover:bg-gray-100 rounded-lg px-3 py-2 text-xs text-gray-700 transition-colors">
            <span>查阅晋升准则</span>
            <ChevronRight className="w-3 h-3 text-gray-400" />
          </button>
          <button className="flex items-center justify-between bg-gray-50 hover:bg-gray-100 rounded-lg px-3 py-2 text-xs text-gray-700 transition-colors">
            <span>查阅历史周报</span>
            <ChevronRight className="w-3 h-3 text-gray-400" />
          </button>
        </div>
        
        {/* 底座状态条 */}
        <div className="flex items-center justify-center space-x-3 pt-2 text-[10px] text-gray-500">
          <span className="flex items-center space-x-1">
            <span className="text-green-500">✓</span>
            <span>规模</span>
          </span>
          <span className="text-gray-300">|</span>
          <span className="flex items-center space-x-1">
            <span className="text-green-500">✓</span>
            <span>标签</span>
          </span>
          <span className="text-gray-300">|</span>
          <span className="flex items-center space-x-1">
            <span className="text-green-500">✓</span>
            <span>频率</span>
          </span>
          <span className="text-gray-300">|</span>
          <span className="text-gray-600">个人确权：本周已生效</span>
        </div>
      </div>
    </div>
  );
}
