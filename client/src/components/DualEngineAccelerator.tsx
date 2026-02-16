import { HelpCircle, TrendingUp, Shield, Award, ChevronRight, Clock, Check } from "lucide-react";
import { useState, useRef } from "react";
import { useLocation } from "wouter";
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
  
  // 晋升数据统计（可选）
  promotionStats?: {
    contactCount: number;
    tagCount: number;
    interactionCount: number;
    currentLevel?: string;
    levelName?: string;
    qualifiedPeriod?: string;
  };
  
  // 邀请用户统计（可选）
  invitedUsersStats?: {
    achievedStandard: number;
    achievedAdvanced: number;
    achievedSuper: number;
    potentialStandard: number;
    potentialAdvanced: number;
    potentialSuper: number;
  };
}

export default function DualEngineAccelerator(props: DualEngineAcceleratorProps) {
  const [, setLocation] = useLocation();
  const [showMultiplierHelp, setShowMultiplierHelp] = useState(false);
  const [showAchievedHelp, setShowAchievedHelp] = useState(false);
  const [showCultivatingHelp, setShowCultivatingHelp] = useState(false);
  const [showRules, setShowRules] = useState(false);
  
  // 小问号按钮的ref
  const multiplierHelpRef = useRef<HTMLButtonElement>(null);
  const achievedHelpRef = useRef<HTMLButtonElement>(null);
  const cultivatingHelpRef = useRef<HTMLButtonElement>(null);
  
  // 标题元素的ref（用于小箭头指向）
  const multiplierTitleRef = useRef<HTMLSpanElement>(null);
  const achievedTitleRef = useRef<HTMLSpanElement>(null);
  const cultivatingTitleRef = useRef<HTMLSpanElement>(null);
  
  // 根据promotionStats计算实际的等级加速
  const getIdentityMultiplier = () => {
    const level = props.promotionStats?.currentLevel;
    if (level === 'standard' || level === 'standard_user') return 0.25;
    if (level === 'advanced' || level === 'advanced_user') return 0.50;
    if (level === 'super' || level === 'super_user') return 1.00;
    return 0.0; // 准合伙人
  };
  
  const actualIdentityMultiplier = getIdentityMultiplier();
  
  // 计算总收益倍数
  const totalMultiplier = props.equityMultiplier + actualIdentityMultiplier;
  
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
            市场贡献价值
          </span>
          {/* 问号按钮 */}
          <button
            onClick={() => setShowRules(true)}
            className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <span className="text-xs">?</span>
          </button>
        </div>
        
        {/* 当前等级 */}
        <div className="text-2xl font-bold mb-2" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {config.name}
        </div>
        
        {/* 达标情况 + 达成时间 */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center space-x-3">
            <div className="flex items-center">
              <span className="text-[#C5B358] mr-1">✓</span>
              <span className={props.nodeLevel === 'none' ? 'text-gray-400' : 'opacity-80'}>人脉数</span>
            </div>
            <div className="flex items-center">
              <span className="text-[#C5B358] mr-1">✓</span>
              <span className={props.nodeLevel === 'none' ? 'text-gray-400' : 'opacity-80'}>标签数</span>
            </div>
            <div className="flex items-center">
              <span className="text-[#C5B358] mr-1">✓</span>
              <span className={props.nodeLevel === 'none' ? 'text-gray-400' : 'opacity-80'}>联络数</span>
            </div>
          </div>
          {props.promotionStats?.qualifiedPeriod && (
            <div className={`text-[10px] ${props.nodeLevel === 'none' ? 'text-gray-400' : 'opacity-60'}`}>
              达成时间：{props.promotionStats.qualifiedPeriod.split('-')[0]}
            </div>
          )}
        </div>
      </div>
      
      {/* ====== 白色区域（明细） ====== */}
      <div className="bg-[#F9F9F9] rounded-b-3xl p-4 space-y-5">
        
        {/* ============ 一、收益倍数计算器 ============ */}
        <div className="space-y-3">
          {/* 标题 */}
          <div className="flex items-center justify-between">
            <span ref={multiplierTitleRef} className="text-sm text-gray-700 font-semibold">当前股权加速</span>
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
                triggerRef={multiplierTitleRef}
                content={
                  <div className="space-y-2">
                    <div className="font-bold text-gray-900">收益加速计算规则</div>
                    <div>
                      <span className="font-medium">● 资产杠杆：</span>根据您的投资金额和入场顺序一次性锁定，体现资本贡献。
                    </div>
                    <div>
                      <span className="font-medium">● 等级加速：</span>根据您当前达成的节点等级（标准/高级/超级）计算，体现人脉贡献。
                    </div>
                    <div>
                      <span className="font-medium">● 总收益公式：</span>市场贡献收益 × (资产杠杆 + 等级加速) = 最终结算收益。
                    </div>
                  </div>
                }
              />
            </div>
          </div>
          
          {/* 一行布局：总倍数 = 资本杠杆 + 贡献加速 */}
          <div className="flex items-center gap-2">
            {/* 左侧：金色卡片显示总倍数 */}
            <div className="bg-gradient-to-r from-[#C5B358] to-[#D4AF37] rounded-lg px-3 py-2.5 shadow-lg flex-shrink-0">
              <div className="text-center">
                <div className="text-2xl font-bold text-white leading-tight">{totalMultiplier.toFixed(2)}</div>
                <div className="text-[10px] text-white/80 mt-0.5">倍</div>
              </div>
            </div>
            
            {/* 等号 */}
            <div className="text-gray-400 text-lg font-light flex-shrink-0">=</div>
            
            {/* 右侧：拆解公式 */}
            <div className="flex items-center gap-1.5 flex-1">
              {/* 资本杠杆 */}
              <div className="bg-white rounded-lg px-2.5 py-2 border border-gray-200 flex-1">
                <div className="text-[10px] text-gray-500 mb-0.5">资本杠杆</div>
                <div className="flex items-baseline">
                  <div className="text-lg font-bold text-[#C5B358] leading-tight">
                    +{((props.equityMultiplier - 1) * 100).toFixed(0)}%
                  </div>
                  <div className="text-[#C5B358] text-sm ml-0.5">↑</div>
                </div>
                <div className="text-[9px] text-gray-400 mt-0.5">
                  {props.equityMultiplier.toFixed(4)}x
                </div>
              </div>
              
              {/* 加号 */}
              <div className="text-[#C5B358] text-base font-bold flex-shrink-0">+</div>
              
              {/* 贡献加速 */}
              <div className="bg-white rounded-lg px-2.5 py-2 border border-gray-200 flex-1">
                <div className="text-[10px] text-gray-500 mb-0.5">贡献加速</div>
                <div className="flex items-baseline">
                  <div className="text-lg font-bold text-[#C5B358] leading-tight">
                    +{(actualIdentityMultiplier * 100).toFixed(0)}%
                  </div>
                  <div className="text-[#C5B358] text-sm ml-0.5">↑</div>
                </div>
                <div className="text-[9px] text-gray-400 mt-0.5">
                  {props.promotionStats?.levelName || '准合伙人'}
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* ============ 二、资产阶梯双翼（细线分隔） ============ */}
        <div className="flex items-stretch">
          
          {/* 左翼：已达成资产（金黄色成就感） */}
          <div className="flex-1 bg-transparent rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <span ref={achievedTitleRef} className="text-xs text-gray-600 font-medium">累计业务资产</span>
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
                  triggerRef={achievedTitleRef}
                  content={
                    <div className="space-y-2">
                      <div className="font-bold text-gray-900">统计规则</div>
                      <div className="space-y-1.5">
                        <div className="text-sm text-gray-600 italic">🌱 比喻：像种树一样，记录每棵树曾经达到的最高高度。</div>
                        
                        <div className="font-medium text-gray-700 mt-2">用户层面（使用行为）：</div>
                        <div>● <span className="font-medium">标准用户：</span>曾经达到过标准用户或更高的累计人数。</div>
                        <div>● <span className="font-medium">高级用户：</span>曾经达到过高级用户或更高的累计人数。</div>
                        <div>● <span className="font-medium">超级用户：</span>曾经达到过超级用户的累计人数。</div>
                        
                        <div className="font-medium text-gray-700 mt-2">节点层面（经营行为）：</div>
                        <div>● <span className="font-medium">标准节点：</span>曾经达到过标准用户或更高的累计人数。</div>
                        <div>● <span className="font-medium">高级节点：</span>曾经达到过高级用户或更高的累计人数。</div>
                        <div>● <span className="font-medium">超级节点：</span>曍经达到过超级用户的累计人数。</div>
                        
                        <div className="mt-2 text-xs text-gray-500 bg-amber-50 p-2 rounded">
                          💡 <span className="font-medium">理解要点：</span>用户层面和节点层面的统计规则相同，都是基于用户等级判定。即使掉级了，也会计入累计，体现您的历史贡献。
                        </div>
                      </div>
                    </div>
                  }
                />
              </div>
            </div>
            
            {/* 明细展示 */}
            <div className="space-y-1">
              {/* 用户层面 */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">标准用户</span>
                <span className="font-medium text-[#C5B358]">
                  {props.invitedUsersStats?.achieved?.standardUser || 0}
                </span>
              </div>
              
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">高级用户</span>
                <span className="font-medium text-[#C5B358]">
                  {props.invitedUsersStats?.achieved?.advancedUser || 0}
                </span>
              </div>
              
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">超级用户</span>
                <span className="font-medium text-[#C5B358]">
                  {props.invitedUsersStats?.achieved?.superUser || 0}
                </span>
              </div>
              
              {/* 分隔线：区分用户层面和节点层面 */}
              <div className="h-[3px] bg-gradient-to-r from-transparent via-[#C5B358]/20 to-transparent my-2"></div>
              
              {/* 节点层面 */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">标准节点</span>
                <span className="font-medium text-[#C5B358]">
                  {props.invitedUsersStats?.achieved?.standardNode || 0}
                </span>
              </div>
              
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">高级节点</span>
                <span className="font-medium text-[#C5B358]">
                  {props.invitedUsersStats?.achieved?.advancedNode || 0}
                </span>
              </div>
              
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">超级节点</span>
                <span className="font-medium text-[#C5B358]">
                  {props.invitedUsersStats?.achieved?.superNode || 0}
                </span>
              </div>
            </div>
            

          </div>
          
          {/* 中间分隔线 */}
          <div className="w-px bg-gray-300 mx-2"></div>
          
          {/* 右翼：资产培育中心（红白配色） */}
          <div className="flex-1 bg-transparent rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <span ref={cultivatingTitleRef} className="text-xs text-gray-600 font-medium">本周业务拓展</span>
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
                  triggerRef={cultivatingTitleRef}
                  content={
                    <div className="space-y-2">
                      <div className="font-bold text-gray-900">统计规则</div>
                      <div className="space-y-1.5">
                        <div className="text-sm text-gray-600 italic">🌱 比喻：像看果园一样，所有的树苗都是潜在的，长得越好的潜力越大。</div>
                        
                        <div className="font-medium text-gray-700 mt-2">用户层面（使用行为）：</div>
                        <div>● <span className="font-medium">潜在标准用户：</span>所有邀请的人（只要注册就算）。</div>
                        <div>● <span className="font-medium">潜在高级用户：</span>当前达到标准用户或更高的人数。</div>
                        <div>● <span className="font-medium">潜在超级用户：</span>当前达到高级用户或更高的人数。</div>
                        
                        <div className="font-medium text-gray-700 mt-2">节点层面（经营行为）：</div>
                        <div>● <span className="font-medium">潜在标准节点：</span>所有邀请的人（只要注册就算）。</div>
                        <div>● <span className="font-medium">潜在高级节点：</span>当前达到标准用户或更高的人数。</div>
                        <div>● <span className="font-medium">潜在超级节点：</span>当前达到高级用户或更高的人数。</div>
                        
                        <div className="mt-2 text-xs text-gray-500 bg-blue-50 p-2 rounded">
                          💡 <span className="font-medium">理解要点：</span>用户层面和节点层面的统计规则相同，都是基于用户等级判定。每个人同时拥有两重身份，体现您的当前业务拓展潜力。
                        </div>
                      </div>
                    </div>
                  }
                />
              </div>
            </div>
            
            {/* 明细展示 */}
            <div className="space-y-1">
              {/* 用户层面 */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">潜在标准用户</span>
                <span className="font-medium text-[#A80000]">
                  {props.invitedUsersStats?.potential?.standardUser || 0}
                </span>
              </div>
              
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">潜在高级用户</span>
                <span className="font-medium text-[#A80000]">
                  {props.invitedUsersStats?.potential?.advancedUser || 0}
                </span>
              </div>
              
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">潜在超级用户</span>
                <span className="font-medium text-[#A80000]">
                  {props.invitedUsersStats?.potential?.superUser || 0}
                </span>
              </div>
              
              {/* 分隔线：区分用户层面和节点层面 */}
              <div className="h-[3px] bg-gradient-to-r from-transparent via-[#A80000]/20 to-transparent my-2"></div>
              
              {/* 节点层面 */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">潜在标准节点</span>
                <span className="font-medium text-[#A80000]">
                  {props.invitedUsersStats?.potential?.standardNode || 0}
                </span>
              </div>
              
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">潜在高级节点</span>
                <span className="font-medium text-[#A80000]">
                  {props.invitedUsersStats?.potential?.advancedNode || 0}
                </span>
              </div>
              
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">潜在超级节点</span>
                <span className="font-medium text-[#A80000]">
                  {props.invitedUsersStats?.potential?.superNode || 0}
                </span>
              </div>

            </div>
            

          </div>
        </div>
        
        {/* ============ 三、功能入口（双栏平铺） ============ */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          {/* 查阅晋升准则 - 跳转到晋升规则页面 */}
          <button 
            onClick={() => setLocation('/parent/promotion-rules')}
            className="flex items-center justify-between bg-gradient-to-br from-blue-50/30 to-blue-100/20 hover:from-blue-50/50 hover:to-blue-100/30 rounded-xl px-4 py-3 transition-all duration-200 border border-blue-100/30">
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
          <div className="relative bg-gradient-to-r from-[#C5B358] to-[#D4AF37] rounded-full px-6 py-4 shadow-lg">
            {/* 外阴影效果 */}
            <div className="absolute -inset-0.5 bg-gradient-to-r from-[#C5B358] to-[#D4AF37] rounded-full blur opacity-30 -z-10"></div>
            
            {/* 内容：垂直居中 */}
            <div className="flex items-center justify-center space-x-2">
              <Award className="w-5 h-5 text-white" />
              <div className="text-center">
                {/* 第一行：当前等级 + 加速倍率 */}
                <div>
                  <span className="text-white text-sm font-bold">当前等级：</span>
                  <span className="text-white text-base font-bold ml-1">
                    {props.promotionStats?.levelName || config.name}
                  </span>
                  {(() => {
                    // 根据实际等级显示加速倍率
                    const level = props.promotionStats?.currentLevel;
                    let multiplier = '';
                    if (level === 'standard' || level === 'standard_user') multiplier = '+25%';
                    else if (level === 'advanced' || level === 'advanced_user') multiplier = '+50%';
                    else if (level === 'super' || level === 'super_user') multiplier = '+100%';
                    
                    return multiplier ? (
                      <span className="text-white/90 text-xs font-bold ml-2">
                        {multiplier}
                      </span>
                    ) : null;
                  })()}
                </div>
                {/* 第二行：符合周期 */}
                <div className="mt-0.5">
                  <span className="text-white/60 text-[9px]">
                    符合周期：{props.promotionStats?.qualifiedPeriod || '计算中...'}
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          {/* 辅助信息卡片（距离下一等级差距） */}
          <div className="mt-3 bg-gray-50/80 rounded-2xl px-4 py-3 border border-gray-200/50">
            {/* 晋升周期进度条 */}
            <div className="mb-3">
              <div className="text-[10px] text-gray-400 mb-2 text-center">本轮晋升周期</div>
              <div className="flex justify-between gap-1">
                {(() => {
                  const now = new Date();
                  const today = now.getDay();
                  const currentDate = now.getDate();
                  const monday = new Date(now);
                  monday.setDate(now.getDate() - (today === 0 ? 6 : today - 1));
                  
                  const weekDays = ['一', '二', '三', '四', '五', '六', '日'];
                  
                  return weekDays.map((day, index) => {
                    const date = new Date(monday);
                    date.setDate(monday.getDate() + index);
                    const dateNum = date.getDate();
                    const isPast = index < (today === 0 ? 6 : today - 1);
                    const isToday = index === (today === 0 ? 6 : today - 1);
                    
                    return (
                      <div
                        key={index}
                        className={`flex-1 flex flex-col items-center justify-center py-1.5 rounded text-[9px] ${
                          isPast
                            ? 'bg-gradient-to-b from-[#C5B358] to-[#D4AF37] text-white'
                            : isToday
                            ? 'bg-gradient-to-b from-[#B8A347] to-[#C5B358] text-white font-bold border-2 border-[#D4AF37]'
                            : 'bg-gray-100 text-gray-400'
                        }`}
                      >
                        <div className="font-medium">{dateNum}日</div>
                        <div className="text-[8px] opacity-80">{day}</div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
            
            <div className="text-[10px] text-gray-500 mb-2 text-center">
              距离{props.nodeLevel === 'standard' ? '高级节点' : props.nodeLevel === 'advanced' ? '超级节点' : '标准节点'}还需
            </div>
            
            {/* 三维度一行显示 */}
            <div className="flex items-center justify-between text-[10px] px-2">
              {(() => {
                // 获取真实数据
                const currentContact = props.promotionStats?.contactCount || props.contactCount;
                const currentTag = props.promotionStats?.tagCount || 0;
                const currentInteraction = props.promotionStats?.interactionCount || 0;
                
                // 根据当前等级计算下一等级的目标
                const targetContact = props.nodeLevel === 'standard' ? 100 : props.nodeLevel === 'advanced' ? 150 : 50;
                const targetTag = props.nodeLevel === 'standard' ? 300 : props.nodeLevel === 'advanced' ? 500 : 100;
                const targetInteraction = props.nodeLevel === 'standard' ? 200 : props.nodeLevel === 'advanced' ? 250 : 150;
                
                // 计算百分比
                const contactPct = Math.min(100, Math.round((currentContact / targetContact) * 100));
                const tagPct = Math.min(100, Math.round((currentTag / targetTag) * 100));
                const interactionPct = Math.min(100, Math.round((currentInteraction / targetInteraction) * 100));
                
                // 判断是否达标
                const contactAchieved = currentContact >= targetContact;
                const tagAchieved = currentTag >= targetTag;
                const interactionAchieved = currentInteraction >= targetInteraction;
                
                return (
                  <>
                    {/* 人脉 */}
                    <div className="flex flex-col items-center flex-1">
                      <span className="text-gray-600 mb-1">人脉</span>
                      <div>
                        {contactAchieved ? (
                          <Check className="w-5 h-5 text-[#C5B358]" />
                        ) : (
                          <>
                            <span className="font-bold text-gray-900">{contactPct}%</span>
                            <span className="ml-1 text-[9px] text-gray-400">({currentContact}/{targetContact})</span>
                          </>
                        )}
                      </div>
                    </div>
                    
                    {/* 标签 */}
                    <div className="flex flex-col items-center flex-1 border-l border-r border-gray-200 px-2">
                      <span className="text-gray-600 mb-1">标签</span>
                      <div>
                        {tagAchieved ? (
                          <Check className="w-5 h-5 text-[#C5B358]" />
                        ) : (
                          <>
                            <span className="font-bold text-gray-900">{tagPct}%</span>
                            <span className="ml-1 text-[9px] text-gray-400">({currentTag}/{targetTag})</span>
                          </>
                        )}
                      </div>
                    </div>
                    
                    {/* 联络 */}
                    <div className="flex flex-col items-center flex-1">
                      <span className="text-gray-600 mb-1">联络</span>
                      <div>
                        {interactionAchieved ? (
                          <Check className="w-5 h-5 text-[#C5B358]" />
                        ) : (
                          <>
                            <span className="font-bold text-gray-900">{interactionPct}%</span>
                            <span className="ml-1 text-[9px] text-gray-400">({currentInteraction}/{targetInteraction})</span>
                          </>
                        )}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
