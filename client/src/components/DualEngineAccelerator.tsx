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
  
  // 邮请用户统计（可选）
  invitedUsersStats?: {
    achievedStandard: number;
    achievedAdvanced: number;
    achievedSuper: number;
    potentialStandard: number;
    potentialAdvanced: number;
    potentialSuper: number;
  };
  
  // 排名（可选）
  ranking?: number;
}

export default function DualEngineAccelerator(props: DualEngineAcceleratorProps) {
  const [, setLocation] = useLocation();
  const [showMultiplierHelp, setShowMultiplierHelp] = useState(false);
  const [showNodeLevelHelp, setShowNodeLevelHelp] = useState(false); // 节点级别问号
  const [showAchievedHelp, setShowAchievedHelp] = useState(false); // 累计业务资产问号
  const [showCultivatingHelp, setShowCultivatingHelp] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showContactHelp, setShowContactHelp] = useState(false);
  const [showTagHelp, setShowTagHelp] = useState(false);
  const [showInteractionHelp, setShowInteractionHelp] = useState(false);
  
  // 小问号按钮的ref
  const multiplierHelpRef = useRef<HTMLButtonElement>(null);
  const nodeLevelHelpRef = useRef<HTMLButtonElement>(null); // 节点级别问号
  const achievedHelpRef = useRef<HTMLButtonElement>(null); // 累计业务资产问号
  const cultivatingHelpRef = useRef<HTMLButtonElement>(null);
  
  // 红色区域三个指标的ref
  const contactIndicatorRef = useRef<HTMLDivElement>(null);
  const tagIndicatorRef = useRef<HTMLDivElement>(null);
  const interactionIndicatorRef = useRef<HTMLDivElement>(null);
  
  // 标题元素的ref（用于小箭头指向）
  const multiplierTitleRef = useRef<HTMLSpanElement>(null);
  const nodeLevelTitleRef = useRef<HTMLSpanElement>(null); // 节点级别标题
  const achievedTitleRef = useRef<HTMLSpanElement>(null); // 累计业务资产标题
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
      <div className={`relative overflow-hidden p-4 ${getTopCardStyle()}`}>
        {/* 标题行 */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <span ref={multiplierTitleRef} className={`text-sm font-medium ${props.nodeLevel === 'none' ? 'text-gray-500' : 'opacity-90'}`}>
              资源股
            </span>
            <div className="text-xs opacity-60 mt-0.5">贡献加速驱动</div>
          </div>
          {/* 问号按钮 */}
          <button
            ref={multiplierHelpRef}
            onClick={() => setShowMultiplierHelp(!showMultiplierHelp)}
            className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <span className="text-xs">?</span>
          </button>
        </div>
        
        {/* 资源股帮助弹窗 */}
        <Tooltip
          isOpen={showMultiplierHelp}
          onClose={() => setShowMultiplierHelp(false)}
          triggerRef={multiplierTitleRef}
          content={
            <div className="space-y-1.5">
              <div className="font-bold text-[#A80000] text-base pb-1.5 border-b border-gray-200">市场贡献池（12.5%）</div>
              <div className="text-sm text-gray-800 leading-snug space-y-1">
                <div className="py-1.5 border-b border-gray-100">
                  <span className="font-semibold text-[#A80000]">分配逻辑</span>
                  <span className="text-gray-700"> — 根据每周真实行为贡献（邀约、标签、分享）结算</span>
                </div>
                <div className="py-1.5 border-b border-gray-100">
                  <span className="font-semibold text-[#A80000]">杠杆效应</span>
                  <span className="text-gray-700"> — 资本加速2.0x，市场池劳动产出也×2</span>
                </div>
                <div className="py-1.5 text-gray-700">
                  <span className="font-semibold text-[#A80000]">核心好处</span> — 多劳多得，上不封顶。资本加速+资源加速+积极经营=三重复利
                </div>
              </div>
            </div>
          }
        />
        
        {/* 当前等级 + 当前贡献排名 */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center space-x-1">
            <span ref={nodeLevelTitleRef} className="text-2xl font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {config.name}
            </span>
            <button
              ref={nodeLevelHelpRef}
              onClick={() => setShowNodeLevelHelp(!showNodeLevelHelp)}
              className="text-white/60 hover:text-white/90 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          </div>
          {props.ranking && (
            <div className="text-right">
              <div className="text-xs opacity-70 mb-0.5">当前贡献排名</div>
              <div className="text-xl font-bold">No.{props.ranking}</div>
            </div>
          )}
        </div>
        
        {/* 达标情况 + 达成时间 */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center space-x-3">
            <div 
              ref={contactIndicatorRef}
              onClick={() => setShowContactHelp(!showContactHelp)}
              className="flex items-center cursor-pointer hover:opacity-70 transition-opacity"
            >
              {(() => {
                const currentContact = props.promotionStats?.contactCount || props.contactCount;
                const targetContact = props.nodeLevel === 'standard' ? 100 : props.nodeLevel === 'advanced' ? 150 : 50;
                const contactAchieved = currentContact >= targetContact;
                return <span className={contactAchieved ? 'text-[#C5B358] mr-1' : 'text-red-500 mr-1'}>{contactAchieved ? '✓' : '✗'}</span>;
              })()}
              <span className={props.nodeLevel === 'none' ? 'text-gray-400' : 'opacity-80'}>人脉数</span>
            </div>
            <div 
              ref={tagIndicatorRef}
              onClick={() => setShowTagHelp(!showTagHelp)}
              className="flex items-center cursor-pointer hover:opacity-70 transition-opacity"
            >
              {(() => {
                const currentTag = props.promotionStats?.tagCount || 0;
                const targetTag = props.nodeLevel === 'standard' ? 300 : props.nodeLevel === 'advanced' ? 500 : 100;
                const tagAchieved = currentTag >= targetTag;
                return <span className={tagAchieved ? 'text-[#C5B358] mr-1' : 'text-red-500 mr-1'}>{tagAchieved ? '✓' : '✗'}</span>;
              })()}
              <span className={props.nodeLevel === 'none' ? 'text-gray-400' : 'opacity-80'}>标签数</span>
            </div>
            <div 
              ref={interactionIndicatorRef}
              onClick={() => setShowInteractionHelp(!showInteractionHelp)}
              className="flex items-center cursor-pointer hover:opacity-70 transition-opacity"
            >
              {(() => {
                const currentInteraction = props.promotionStats?.interactionCount || 0;
                const targetInteraction = props.nodeLevel === 'standard' ? 200 : props.nodeLevel === 'advanced' ? 250 : 150;
                const interactionAchieved = currentInteraction >= targetInteraction;
                return <span className={interactionAchieved ? 'text-[#C5B358] mr-1' : 'text-red-500 mr-1'}>{interactionAchieved ? '✓' : '✗'}</span>;
              })()}
              <span className={props.nodeLevel === 'none' ? 'text-gray-400' : 'opacity-80'}>联络数</span>
            </div>
          </div>
          {props.promotionStats?.qualifiedPeriod && (
            <div className={`text-[10px] ${props.nodeLevel === 'none' ? 'text-gray-400' : 'opacity-60'}`}>
              达成时间：{props.promotionStats.qualifiedPeriod.split('-')[0]}
            </div>
          )}
        </div>
        
        {/* 节点级别帮助弹窗 */}
        <Tooltip
          isOpen={showNodeLevelHelp}
          onClose={() => setShowNodeLevelHelp(false)}
          triggerRef={nodeLevelTitleRef}
          content={
            <div className="space-y-1.5">
              <div className="font-bold text-[#A80000] text-base pb-1.5 border-b border-gray-200">资源加速机制</div>
              <div className="text-sm text-gray-800 leading-snug space-y-1">
                <div className="py-1.5 border-b border-gray-100">
                  <span className="font-semibold text-[#A80000]">标准节点</span>
                  <span className="text-gray-700"> — +25%资源加速，市场贡献×1.25</span>
                </div>
                <div className="py-1.5 border-b border-gray-100">
                  <span className="font-semibold text-[#A80000]">高级节点</span>
                  <span className="text-gray-700"> — +50%资源加速，市场贡献×1.50</span>
                </div>
                <div className="py-1.5 border-b border-gray-100">
                  <span className="font-semibold text-[#A80000]">超级节点</span>
                  <span className="text-gray-700"> — +100%资源加速，市场贡献×2.00</span>
                </div>
                <div className="py-1.5 text-gray-700">
                  资源加速与资本加速叠加，形成三重复利
                </div>
              </div>
            </div>
          }
        />
        
        {/* 人脉数弹窗 */}
        <Tooltip
          isOpen={showContactHelp}
          onClose={() => setShowContactHelp(false)}
          triggerRef={contactIndicatorRef}
          content={
            <div className="space-y-3">
              <div className="font-bold text-gray-900">人脉数进度</div>
              
              {/* 本轮晋升周期 */}
              <div>
                <div className="text-xs text-gray-500 mb-2">本轮晋升周期</div>
                <div className="text-sm font-medium text-gray-900">
                  {props.promotionStats?.qualifiedPeriod || '计算中...'}
                </div>
              </div>
              
              {/* 进度详情 */}
              <div>
                <div className="text-xs text-gray-500 mb-2">距离{props.nodeLevel === 'standard' ? '高级节点' : props.nodeLevel === 'advanced' ? '超级节点' : '标准节点'}进度</div>
                {(() => {
                  const currentContact = props.promotionStats?.contactCount || props.contactCount;
                  const targetContact = props.nodeLevel === 'standard' ? 100 : props.nodeLevel === 'advanced' ? 150 : 50;
                  const contactPct = Math.min(100, Math.round((currentContact / targetContact) * 100));
                  const contactAchieved = currentContact >= targetContact;
                  
                  return (
                    <div className="text-sm">
                      {contactAchieved ? (
                        <span className="text-[#C5B358] font-bold">✓ 已达标</span>
                      ) : (
                        <>
                          <span className="font-bold text-gray-900">{contactPct}%</span>
                          <span className="ml-2 text-gray-600">({currentContact}/{targetContact})</span>
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          }
        />
        
        {/* 标签数弹窗 */}
        <Tooltip
          isOpen={showTagHelp}
          onClose={() => setShowTagHelp(false)}
          triggerRef={tagIndicatorRef}
          content={
            <div className="space-y-3">
              <div className="font-bold text-gray-900">标签数进度</div>
              
              {/* 本轮晋升周期 */}
              <div>
                <div className="text-xs text-gray-500 mb-2">本轮晋升周期</div>
                <div className="text-sm font-medium text-gray-900">
                  {props.promotionStats?.qualifiedPeriod || '计算中...'}
                </div>
              </div>
              
              {/* 进度详情 */}
              <div>
                <div className="text-xs text-gray-500 mb-2">距离{props.nodeLevel === 'standard' ? '高级节点' : props.nodeLevel === 'advanced' ? '超级节点' : '标准节点'}进度</div>
                {(() => {
                  const currentTag = props.promotionStats?.tagCount || 0;
                  const targetTag = props.nodeLevel === 'standard' ? 300 : props.nodeLevel === 'advanced' ? 500 : 100;
                  const tagPct = Math.min(100, Math.round((currentTag / targetTag) * 100));
                  const tagAchieved = currentTag >= targetTag;
                  
                  return (
                    <div className="text-sm">
                      {tagAchieved ? (
                        <span className="text-[#C5B358] font-bold">✓ 已达标</span>
                      ) : (
                        <>
                          <span className="font-bold text-gray-900">{tagPct}%</span>
                          <span className="ml-2 text-gray-600">({currentTag}/{targetTag})</span>
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          }
        />
        
        {/* 联络数弹窗 */}
        <Tooltip
          isOpen={showInteractionHelp}
          onClose={() => setShowInteractionHelp(false)}
          triggerRef={interactionIndicatorRef}
          content={
            <div className="space-y-3">
              <div className="font-bold text-gray-900">联络数进度</div>
              
              {/* 本轮晋升周期 */}
              <div>
                <div className="text-xs text-gray-500 mb-2">本轮晋升周期</div>
                <div className="text-sm font-medium text-gray-900">
                  {props.promotionStats?.qualifiedPeriod || '计算中...'}
                </div>
              </div>
              
              {/* 进度详情 */}
              <div>
                <div className="text-xs text-gray-500 mb-2">距离{props.nodeLevel === 'standard' ? '高级节点' : props.nodeLevel === 'advanced' ? '超级节点' : '标准节点'}进度</div>
                {(() => {
                  const currentInteraction = props.promotionStats?.interactionCount || 0;
                  const targetInteraction = props.nodeLevel === 'standard' ? 200 : props.nodeLevel === 'advanced' ? 250 : 150;
                  const interactionPct = Math.min(100, Math.round((currentInteraction / targetInteraction) * 100));
                  const interactionAchieved = currentInteraction >= targetInteraction;
                  
                  return (
                    <div className="text-sm">
                      {interactionAchieved ? (
                        <span className="text-[#C5B358] font-bold">✓ 已达标</span>
                      ) : (
                        <>
                          <span className="font-bold text-gray-900">{interactionPct}%</span>
                          <span className="ml-2 text-gray-600">({currentInteraction}/{targetInteraction})</span>
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          }
        />
      </div>
      
      {/* ====== 白色区域（明细） ====== */}
      <div className="bg-[#F9F9F9] rounded-b-3xl p-4 space-y-5">
        
        {/* ============ 一、资产阶梯双翼（细线分隔） ============ */}
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
                    <div className="space-y-1.5">
                      <div className="font-bold text-[#A80000] text-base pb-1.5 border-b border-gray-200">统计规则</div>
                      <div className="text-sm text-gray-800 leading-snug space-y-1">
                        <div className="py-1.5 border-b border-gray-100">
                          <span className="font-semibold text-[#A80000]">用户层面</span>
                          <span className="text-gray-700"> — 标准/高级/超级用户，统计历史最高等级的累计人数</span>
                        </div>
                        <div className="py-1.5 border-b border-gray-100">
                          <span className="font-semibold text-[#A80000]">节点层面</span>
                          <span className="text-gray-700"> — 标准/高级/超级节点，统计规则与用户层面相同</span>
                        </div>
                        <div className="py-1.5 text-gray-700">
                          <span className="font-semibold text-[#A80000]">理解要点</span> — 即使掉级，也计入累计，体现历史贡献
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
                    <div className="space-y-1.5">
                      <div className="font-bold text-[#A80000] text-base pb-1.5 border-b border-gray-200">统计规则</div>
                      <div className="text-sm text-gray-800 leading-snug space-y-1">
                        <div className="py-1.5 border-b border-gray-100">
                          <span className="font-semibold text-[#A80000]">用户层面</span>
                          <span className="text-gray-700"> — 潜在标准（所有邀请），潜在高级（当前≥标准），潜在超级（当前≥高级）</span>
                        </div>
                        <div className="py-1.5 border-b border-gray-100">
                          <span className="font-semibold text-[#A80000]">节点层面</span>
                          <span className="text-gray-700"> — 统计规则与用户层面相同</span>
                        </div>
                        <div className="py-1.5 text-gray-700">
                          <span className="font-semibold text-[#A80000]">理解要点</span> — 体现当前业务拓展潜力
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
        
        {/* ============ 二、功能入口（双栏平铺） ============ */}
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
          <button 
            onClick={() => setLocation('/parent/equity-history')}
            className="flex items-center justify-between bg-gradient-to-br from-amber-50/30 to-amber-100/20 hover:from-amber-50/50 hover:to-amber-100/30 rounded-xl px-4 py-3 transition-all duration-200 border border-amber-100/30">
            <div className="flex items-center space-x-2">
              <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-xs font-medium text-gray-700">查阅历史周报</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-amber-400" />
          </button>
        </div>
      </div>
    </div>
  );
}
