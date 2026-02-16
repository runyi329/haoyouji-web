import { HelpCircle, TrendingUp, Shield, Award, ChevronRight, Clock } from "lucide-react";
import { useState, useRef } from "react";
import Tooltip from "./Tooltip";

interface DualEngineAcceleratorProps {
  // 红色区域相关
  nodeLevel: 'none' | 'standard' | 'advanced' | 'super'; // 当前节点等级
  contribEquity: number; // 市场权重（贡献加成）
  
  // 底部基座相关
  contactCount: number; // 当前人脉规模
  
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
  
  // 小问号按钮的ref
  const multiplierHelpRef = useRef<HTMLButtonElement>(null);
  const achievedHelpRef = useRef<HTMLButtonElement>(null);
  const cultivatingHelpRef = useRef<HTMLButtonElement>(null);
  
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
  
  // 获取目标人数（根据节点等级）
  const getTargetCount = () => {
    switch (props.nodeLevel) {
      case 'standard': return 50;
      case 'advanced': return 150;
      case 'super': return 200;
      default: return 50;
    }
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
            <span className="text-xs text-gray-600 font-medium">当前股权加速</span>
            <div className="relative">
              <button
                ref={multiplierHelpRef}
                onClick={() => setShowMultiplierHelp(!showMultiplierHelp)}
                className="text-gray-400 hover:text-[#C5B358] transition-colors"
              >
                <HelpCircle className="w-4 h-4" />
              </button>
              <Tooltip
                isOpen={showMultiplierHelp}
                onClose={() => setShowMultiplierHelp(false)}
                triggerRef={multiplierHelpRef}
                content={
                  <div className="space-y-2">
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
                }
              />
            </div>
          </div>
          
          {/* 公式化布局 */}
          <div className="flex items-center justify-center space-x-3">
            {/* 总倍数（大圆环） */}
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#A80000] to-[#8a0000] flex items-center justify-center shadow-lg">
                <div className="flex items-baseline justify-center">
                  <div className="text-2xl font-bold text-white">{totalMultiplier.toFixed(1)}</div>
                  <div className="text-[10px] text-white/70 ml-0.5">倍</div>
                </div>
              </div>
              {/* 微弱金属反光动效 */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-transparent via-white/20 to-transparent animate-pulse"></div>
            </div>
            
            {/* 等号 */}
            <div className="text-gray-400 text-xl font-light">=</div>
            
            {/* 拆解公式（垂直布局） */}
            <div className="flex items-center space-x-1.5">
              {/* 股权加成 */}
              <div className="bg-[#A80000]/10 border border-[#A80000]/30 rounded-lg px-2 py-1.5 flex flex-col items-center min-w-[60px]">
                <div className="flex items-center space-x-0.5 mb-0.5">
                  <span className="text-[9px] text-gray-600">资产</span>
                </div>
                <div className="text-base font-bold text-[#C5B358]" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>+{props.equityMultiplier.toFixed(1)}</div>
              </div>
              
              {/* 加号 */}
              <div className="text-[#C5B358] text-lg font-bold">+</div>
              
              {/* 身份加成 */}
              <div className="bg-[#C5B358]/10 border border-[#C5B358]/30 rounded-lg px-2 py-1.5 flex flex-col items-center min-w-[60px]">
                <div className="flex items-center space-x-0.5 mb-0.5">
                  <span className="text-[9px] text-gray-600">等级</span>
                </div>
                <div className="text-base font-bold text-[#C5B358]" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>+{props.identityMultiplier.toFixed(1)}</div>
              </div>
            </div>
          </div>
          

        </div>
        
        {/* ============ 二、资产阶梯双翼（细线分隔） ============ */}
        <div className="flex items-stretch">
          
          {/* 左翼：已达成资产（金黄色成就感） */}
          <div className="flex-1 bg-transparent rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-600 font-medium">已成功分享人脉节点</span>
              <div className="relative">
                <button
                  ref={achievedHelpRef}
                  onClick={() => setShowAchievedHelp(!showAchievedHelp)}
                  className="text-gray-400 hover:text-[#C5B358] transition-colors"
                >
                  <HelpCircle className="w-3 h-3" />
                </button>
                <Tooltip
                  isOpen={showAchievedHelp}
                  onClose={() => setShowAchievedHelp(false)}
                  triggerRef={achievedHelpRef}
                  content={
                    <div>
                      <div className="font-bold text-gray-900 mb-1">向下兼容统计原则</div>
                      <div>若您培育出一个【超级节点】，由于其天然符合【高级】与【标准】的要求，系统将同步为您增加三级资产池的权数，助您数据最大化。</div>
                    </div>
                  }
                />
              </div>
            </div>
            
            {/* 核心数值（金黄色） */}
            <div className="text-3xl font-bold text-[#C5B358] mb-3">{props.standardNodes}</div>
            
            {/* 明细展示（字号递减） */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">标准节点</span>
                <span className="font-medium text-[#C5B358]">{props.standardNodes}</span>
              </div>

              
              <div className="flex items-center justify-between text-xs mt-2">
                <span className="text-gray-600">高级节点</span>
                <span className="font-medium text-[#C5B358]">{props.advancedNodes}</span>
              </div>

              
              <div className="flex items-center justify-between text-xs mt-2">
                <span className="text-gray-600">超级节点</span>
                <span className="font-medium text-[#C5B358]">{props.superNodes}</span>
              </div>
            </div>
            

          </div>
          
          {/* 中间分隔线 */}
          <div className="w-px bg-gray-300 mx-2"></div>
          
          {/* 右翼：资产培育中心（红白配色） */}
          <div className="flex-1 bg-transparent rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-600 font-medium">分享中人脉节点</span>
              <div className="relative">
                <button
                  ref={cultivatingHelpRef}
                  onClick={() => setShowCultivatingHelp(!showCultivatingHelp)}
                  className="text-gray-400 hover:text-[#A80000] transition-colors"
                >
                  <HelpCircle className="w-3 h-3" />
                </button>
                <Tooltip
                  isOpen={showCultivatingHelp}
                  onClose={() => setShowCultivatingHelp(false)}
                  triggerRef={cultivatingHelpRef}
                  content={
                    <div>
                      <div className="font-bold text-gray-900 mb-1">潜力向上折算</div>
                      <div className="space-y-1">
                        <div>● 尚未达标的受邀人视为【潜在标准】。</div>
                        <div>● 已达标节点将根据其活跃度，自动被系统识别为更高级别的【潜在对象】，提醒您重点辅导。</div>
                      </div>
                    </div>
                  }
                />
              </div>
            </div>
            
            {/* 核心数值（红色） */}
            <div className="text-3xl font-bold text-[#A80000] mb-3">{props.totalCultivating}</div>
            
            {/* 明细展示 */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">潜在标准节点</span>
                <span className="font-medium text-[#A80000]">{props.potentialStandard}</span>
              </div>

              
              <div className="flex items-center justify-between text-xs mt-2">
                <span className="text-gray-600">潜在高级节点</span>
                <span className="font-medium text-[#A80000]">{props.potentialAdvanced}</span>
              </div>

              
              <div className="flex items-center justify-between text-xs mt-2">
                <span className="text-gray-600">潜在超级节点</span>
                <span className="font-medium text-[#A80000]">{props.potentialSuper}</span>
              </div>

            </div>
            

          </div>
        </div>
        
        {/* ============ 三、功能入口（双栏平铺） ============ */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          {/* 查阅晋升准则 */}
          <button className="flex items-center justify-between bg-gradient-to-br from-blue-50/30 to-blue-100/20 hover:from-blue-50/50 hover:to-blue-100/30 rounded-xl px-4 py-3 transition-all duration-200 border border-blue-100/30">
            <div className="flex items-center space-x-2">
              <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span className="text-xs font-medium text-gray-700">查阅晋升准则</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-blue-400" />
          </button>
          
          {/* 查阅历史周报 */}
          <button className="flex items-center justify-between bg-gradient-to-br from-amber-50/30 to-amber-100/20 hover:from-amber-50/50 hover:to-amber-100/30 rounded-xl px-4 py-3 transition-all duration-200 border border-amber-100/30">
            <div className="flex items-center space-x-2">
              <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-xs font-medium text-gray-700">查阅历史周报</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-amber-400" />
          </button>
        </div>
        
        {/* ====== 四、底部状态胶囊（结算感） ====== */}
        <div className="mt-5 w-[95%] mx-auto">
          {/* 胶囊形主卡片（当前等级） */}
          <div className="relative bg-gradient-to-r from-[#C5B358] to-[#D4AF37] rounded-full px-6 py-3.5 shadow-lg">
            {/* 外阴影效果 */}
            <div className="absolute -inset-0.5 bg-gradient-to-r from-[#C5B358] to-[#D4AF37] rounded-full blur opacity-30 -z-10"></div>
            
            {/* 内容：水平垂直居中 */}
            <div className="flex items-center justify-center space-x-3">
              <Shield className="w-5 h-5 text-white" />
              <div className="text-center">
                <span className="text-white text-sm font-bold">当前等级：</span>
                <span className="text-white text-base font-bold ml-1">{config.name}</span>
              </div>
              <Award className="w-5 h-5 text-white" />
            </div>
          </div>
          
          {/* 辅助信息卡片（规模与状态） */}
          <div className="mt-3 bg-gray-50/80 rounded-2xl px-4 py-3 border border-gray-200/50">
            <div className="grid grid-cols-2 gap-4">
              
              {/* 左侧：规模实时进度 */}
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-4 h-4 text-[#C5B358]" />
                <div>
                  <div className="text-[9px] text-gray-400">规模</div>
                  <div className="text-xs">
                    <span className="font-bold text-gray-900">{props.contactCount}</span>
                    <span className="text-gray-400">/{getTargetCount()}</span>
                    {props.contactCount >= getTargetCount() && (
                      <span className="ml-1 text-[9px] text-[#C5B358]">（已超额）</span>
                    )}
                  </div>
                </div>
              </div>
              
              {/* 右侧：确权状态 */}
              <div className="flex items-center justify-end space-x-2">
                <div className="text-right">
                  <div className="flex items-center justify-end space-x-2 text-[10px]">
                    <span className="flex items-center space-x-1">
                      <span className="text-green-500">✓</span>
                      <span className="text-gray-600">标签</span>
                    </span>
                    <span className="text-gray-300">|</span>
                    <span className="flex items-center space-x-1">
                      <span className="text-green-500">✓</span>
                      <span className="text-gray-600">频率</span>
                    </span>
                  </div>
                  <div className="text-[9px] text-gray-400 mt-0.5">状态：本周生效中</div>
                </div>
              </div>
              
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
