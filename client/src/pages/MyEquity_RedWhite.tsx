import React from "react";
import { trpc } from "@/lib/trpc";
import { Loader2, TrendingUp, Trophy, Sparkles, DollarSign, ArrowLeft, HelpCircle } from "lucide-react";
import { useLocation } from "wouter";
import { useState, useRef } from "react";
import { toast } from "sonner";
import EquityEnergyRing from "@/components/EquityEnergyRing";
import DualEngineAccelerator from "@/components/DualEngineAccelerator";
import FAQAccordion from "@/components/FAQAccordion";
import Tooltip from "@/components/Tooltip";
import CompanyEquityPieChart from "@/components/CompanyEquityPieChart";

export default function MyEquityRedWhite() {
  const [, setLocation] = useLocation();
  const { data: enhanced, isLoading, error, refetch } = trpc.equity.getMyEquityEnhanced.useQuery(undefined, {
    retry: 3,
    retryDelay: 1000,
    staleTime: 5 * 60 * 1000, // 5分钟缓存
    cacheTime: 10 * 60 * 1000, // 10分钟缓存
  });
  const { data: overviewStats } = trpc.contacts.overviewStats.useQuery(undefined, {
    retry: 2,
    staleTime: 5 * 60 * 1000,
  });
  const { data: promotionStats } = trpc.equity.getPromotionStats.useQuery(undefined, {
    retry: 2,
    staleTime: 5 * 60 * 1000,
  });
  const { data: invitedUsersStats } = trpc.equity.getMyInvitedUsersStats.useQuery(undefined, {
    retry: 2,
    staleTime: 5 * 60 * 1000,
  });
  
  // 当前股权加速的帮助提示状态
  const [showMultiplierHelp, setShowMultiplierHelp] = useState(false);
  const multiplierHelpRef = useRef<HTMLButtonElement>(null);
  const multiplierTitleRef = useRef<HTMLSpanElement>(null);
  
  // 综合股权的帮助提示状态
  const [showEquityHelp, setShowEquityHelp] = useState(false);
  const equityHelpRef = useRef<HTMLButtonElement>(null);
  const equityTitleRef = useRef<HTMLSpanElement>(null);
  
  // 公司股权分配的帮助提示状态
  const [showCompanyEquityHelp, setShowCompanyEquityHelp] = useState(false);
  const companyEquityHelpRef = useRef<HTMLButtonElement>(null);
  const companyEquityTitleRef = useRef<HTMLSpanElement>(null);
  
  // 资金股的帮助提示状态
  const [showCapitalStockHelp, setShowCapitalStockHelp] = useState(false);
  const capitalStockHelpRef = useRef<HTMLButtonElement>(null);
  const capitalStockTitleRef = useRef<HTMLSpanElement>(null);
  
  // 资本杠杆系数的帮助提示状态
  const [showLeverageHelp, setShowLeverageHelp] = useState(false);
  const leverageHelpRef = useRef<HTMLButtonElement>(null);
  const leverageTitleRef = useRef<HTMLSpanElement>(null);
  
  // 资源股的帮助提示状态
  const [showResourceStockHelp, setShowResourceStockHelp] = useState(false);
  const resourceStockHelpRef = useRef<HTMLButtonElement>(null);
  const resourceStockTitleRef = useRef<HTMLSpanElement>(null);
  
  // 节点级别的帮助提示状态
  const [showNodeLevelHelp, setShowNodeLevelHelp] = useState(false);
  const nodeLevelHelpRef = useRef<HTMLButtonElement>(null);
  const nodeLevelTitleRef = useRef<HTMLSpanElement>(null);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#A80000]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">加载失败，请稍后重试</p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-[#A80000] text-white rounded-lg hover:opacity-90"
          >
            重新加载
          </button>
        </div>
      </div>
    );
  }

  if (!enhanced) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500">暂无股权数据</p>
        </div>
      </div>
    );
  }

  const equity = enhanced;

  // 确保所有必需字段都有默认值
  if (!equity.details) {
    equity.details = {
      inviteCount: 0,
      userInvestment: 0,
      totalInvestment: 1,
      referralNetworkCount: 0,
    };
  }
  if (!equity.ranking) {
    equity.ranking = null;
  }

  const now = new Date();
  const timestampStr = `${now.getFullYear()}年${String(now.getMonth() + 1).padStart(2, '0')}月${String(now.getDate()).padStart(2, '0')}日 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  // 个人股份构成数据
  const equityParts = [
    {
      label: '投资股份',
      value: equity.investmentEquity || 0,
      color: '#A80000',
      upgradeLabel: '资本权证',
      description: '稳健底仓，由投资转化'
    },
    {
      label: '邀请贡献',
      value: equity.inviteEquity || 0,
      color: '#C5B358',
      upgradeLabel: '贡献加成（邀请）',
      description: `已邀请 ${equity.details?.inviteCount || 0} 人`
    },
    {
      label: '人脉贡献',
      value: equity.referralNetworkEquity || 0,
      color: '#C5B358',
      upgradeLabel: '贡献加成（人脉）',
      description: `人脉网络 ${equity.details?.referralNetworkCount || 0} 人`
    },
  ];
  const othersValue = Math.max(0, 100 - (equity.totalEquity || 0));

  // 公司股权分配数据（根据后台股份池配置）
  // 使用与第一部分饼图相同的配色方案：深红色和金色
  const companyEquityParts = [
    {
      label: '天使投资人',
      value: 30.00,
      color: '#A80000',
      description: '30.00%'
    },
    {
      label: '创始团队/创始人',
      value: 40.00,
      color: '#A80000',
      description: '40.00%'
    },
    {
      label: '员工持股平台',
      value: 15.00,
      color: '#C5B358',
      description: '15.00%'
    },
    {
      label: '市场贡献池',
      value: 12.50,
      color: '#C5B358',
      description: '12.50%'
    },
    {
      label: '联合创始人',
      value: 2.50,
      color: '#C5B358',
      description: '2.50%'
    },
    {
      label: '战略投资股东',
      value: 0.00,
      color: '#C5B358',
      description: '0.00%'
    },
  ];

  // 计算当前股权加速的数据
  const getIdentityMultiplier = () => {
    const level = promotionStats?.currentLevel;
    if (level === 'standard' || level === 'standard_user') return 0.25;
    if (level === 'advanced' || level === 'advanced_user') return 0.50;
    if (level === 'super' || level === 'super_user') return 1.00;
    return 0.0; // 准合伙人
  };
  
  const capitalLeverage = equity.dynamicLeverage?.leverage || 1.0;
  const contributionAcceleration = getIdentityMultiplier();
  const totalMultiplier = capitalLeverage + contributionAcceleration;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="max-w-md mx-auto py-4 space-y-4">
        
        {/* ============ 第一部分：综合股权概览 ============ */}
        <div className="space-y-0">
          {/* 红色区域 */}
          <div className="bg-gradient-to-br from-[#A80000] to-[#8a0000] text-white px-4 py-4">
            {/* 标题行 */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-1">
                <span ref={equityTitleRef} className="text-sm font-medium opacity-90">综合股权</span>
                <button
                  ref={equityHelpRef}
                  onClick={() => setShowEquityHelp(!showEquityHelp)}
                  className="text-white/60 hover:text-white/90 transition-colors"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center space-x-2">
                {equity.dynamicLeverage && (
                  <span className="text-[10px] font-mono tracking-wider opacity-60 bg-white/10 px-2 py-0.5 rounded">
                    编号 {String(equity.dynamicLeverage.seatNumber).padStart(4, '0')}
                  </span>
                )}
              </div>
            </div>

            {/* 核心数据（左右双列布局） */}
            <div className="grid grid-cols-2 gap-4">
              {/* 左侧：总占比 */}
              <div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-5xl font-bold">{equity.totalEquity.toFixed(4)}</span>
                  <span className="text-2xl opacity-90">%</span>
                </div>
              </div>

              {/* 右侧：估值 + 排名 */}
              <div className="text-right space-y-2">
                {/* 估值 */}
                <div>
                  <div className="text-xs opacity-70 mb-0.5">我的股权估值</div>
                  <div className="text-2xl font-bold" style={{ color: '#C5B358' }}>
                    ¥{(equity.estimatedValue / 10000).toFixed(2)}万
                  </div>
                </div>
                {/* 排名 */}
                <div>
                  <div className="text-xs opacity-70 mb-0.5">当前持股排名</div>
                  {equity.ranking ? (
                    <div className="text-xl font-bold">No.{equity.ranking.rank}</div>
                  ) : (
                    <div className="text-xl font-bold opacity-50">--</div>
                  )}
                </div>
              </div>
            </div>

            {/* 综合股权帮助弹窗 */}
            <Tooltip
              isOpen={showEquityHelp}
              onClose={() => setShowEquityHelp(false)}
              triggerRef={equityTitleRef}
              content={
                <div className="space-y-3">
                  <div className="font-bold text-gray-900 text-base">综合股权是怎么来的？</div>
                  <div className="text-sm text-gray-700 leading-relaxed space-y-2">
                    <p>您的综合股权由两部分组成：</p>
                    <div className="bg-amber-50 border-l-4 border-amber-400 p-3 rounded">
                      <p className="font-medium text-amber-900">1. 天使股东池（30%）的静态权重</p>
                      <p className="text-sm text-amber-800 mt-1">根据您的投资额度和入场早晚计算，一旦锁定终身受益，不与劳动挂钩。</p>
                    </div>
                    <div className="bg-green-50 border-l-4 border-green-400 p-3 rounded">
                      <p className="font-medium text-green-900">2. 市场贡献池（12.5%）的动态收益</p>
                      <p className="text-sm text-green-800 mt-1">根据您每周的真实行为贡献（邀约、标签、分享）结算，多劳多得，上不封顶。</p>
                    </div>
                    <p className="text-gray-600 mt-2">这两个池子总计占公司 <strong>42.5%</strong> 的股权，通过算法确保公平分配。如果您既投资又参与经营，将同时横跨两个池子，获得"双重复利"。</p>
                  </div>
                </div>
              }
            />
            
            {/* 底部：返回按钮 + 时间戳 */}
            <div className="mt-3 flex items-center justify-between">
              <button 
                onClick={() => setLocation('/')}
                className="flex items-center space-x-1 text-sm opacity-90 font-medium hover:opacity-100 transition-opacity"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>返回</span>
              </button>
              <div className="text-[10px] opacity-50">
                截止 {timestampStr}
              </div>
            </div>
          </div>
          {/* 白色区域 */}
          <div className="bg-white px-4 py-4 rounded-b-2xl shadow-sm mx-4">
            {/* 1. 当前股权加速（从原第二部分移上来） */}
            <div>
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
                            <span className="font-medium">● 资本杠杆：</span>根据您的投资金额和入场顺序一次性锁定，体现资本贡献。
                          </div>
                          <div>
                            <span className="font-medium">● 贡献加速：</span>根据您当前达成的节点等级（标准/高级/超级）计算，体现人脉贡献。
                          </div>
                          <div>
                            <span className="font-medium">● 总收益公式：</span>市场贡献收益 × (资本杠杆 + 贡献加速) = 最终结算收益。
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
                    {/* 资本加速 */}
                    <div className="bg-white rounded-lg px-2.5 py-2 border border-gray-200 flex-1">
                      <div className="text-[10px] text-gray-500 mb-0.5">资本加速</div>
                      <div className="flex items-baseline">
                        <div className="text-lg font-bold text-[#C5B358] leading-tight">
                          +{((capitalLeverage - 1) * 100).toFixed(0)}%
                        </div>
                        <div className="text-[#C5B358] text-sm ml-0.5">↑</div>
                      </div>
                      <div className="text-[9px] text-gray-400 mt-0.5">
                        {capitalLeverage.toFixed(4)}x
                      </div>
                    </div>
                    
                    {/* 加号 */}
                    <div className="text-[#C5B358] text-base font-bold flex-shrink-0">+</div>
                    
                    {/* 资源加速 */}
                    <div className="bg-white rounded-lg px-2.5 py-2 border border-gray-200 flex-1">
                      <div className="text-[10px] text-gray-500 mb-0.5">资源加速</div>
                      <div className="flex items-baseline">
                        <div className="text-lg font-bold text-[#C5B358] leading-tight">
                          +{(contributionAcceleration * 100).toFixed(0)}%
                        </div>
                        <div className="text-[#C5B358] text-sm ml-0.5">↑</div>
                      </div>
                      <div className="text-[9px] text-gray-400 mt-0.5">
                        {promotionStats?.levelName || '准合伙人'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. 个人资产结构图 */}
            <div>
              <EquityEnergyRing
                parts={equityParts}
                othersValue={othersValue}
                totalEquity={equity.totalEquity}
              />
            </div>

            {/* 数据加密保护提示 */}
            <div className="text-center text-[10px] text-gray-400 pt-2">
              <span className="inline-flex items-center">
                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                数据已加密保护，实时同步至 {timestampStr.split(' ')[0]}
              </span>
            </div>
          </div>
        </div>
        {/* 第一部分结束 */}

        {/* ============ 第三部分：当前股权加速 ============ */}
        <div className="space-y-0">
          {/* 红色区域 */}
          <div className="bg-gradient-to-br from-[#A80000] to-[#8a0000] text-white px-4 py-4">
            {/* 标题行 */}
            <div className="flex items-center justify-between mb-3">
              <div>
                <span ref={capitalStockTitleRef} className="text-sm font-medium opacity-90">资金股</span>
                <div className="text-xs opacity-60 mt-0.5">资本杠杆驱动</div>
              </div>
              {/* 问号按钮 */}
              <button
                ref={capitalStockHelpRef}
                onClick={() => setShowCapitalStockHelp(!showCapitalStockHelp)}
                className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <span className="text-xs">?</span>
              </button>
            </div>
            
            {/* 资金股帮助弹窗 */}
            <Tooltip
              isOpen={showCapitalStockHelp}
              onClose={() => setShowCapitalStockHelp(false)}
              triggerRef={capitalStockTitleRef}
              content={
                <div className="space-y-3">
                  <div className="font-bold text-gray-900 text-base">天使股东池（30%）：给“眼光”以终身尊严</div>
                  <div className="text-sm text-gray-700 leading-relaxed space-y-2">
                    <p>这是为早期投入资金的天使合伙人设立的专属池。</p>
                    <div className="bg-amber-50 border-l-4 border-amber-400 p-3 rounded">
                      <p className="font-medium text-amber-900">分配逻辑：</p>
                      <p className="text-sm text-amber-800 mt-1">根据“入场早晚”与“投资额度”双重加权。入场越早，静态权重越高（从 2.0 依次递减至 1.0）。</p>
                    </div>
                    <div className="bg-green-50 border-l-4 border-green-400 p-3 rounded">
                      <p className="font-medium text-green-900">核心好处：一旦锁定，终身受益。</p>
                      <p className="text-sm text-green-800 mt-1">只要您进入了天使池，无论您后期是否参与经营，您持有的这部分静态权重都将永久锁定在 30% 的总额内。这不仅是投资，更是您在脉动生态中的底气。</p>
                    </div>
                  </div>
                </div>
              }
            />
            
            {/* 投资金额 + 持股排名 */}
            <div className="flex items-start justify-between mb-2">
              <div className="text-2xl font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {(equity.details?.userInvestment || 0).toLocaleString()}元
              </div>
              {equity.ranking && (
                <div className="text-right">
                  <div className="text-xs opacity-70 mb-0.5">当前持股排名</div>
                  <div className="text-xl font-bold">No.{equity.ranking.rank}</div>
                </div>
              )}
            </div>
            
            {/* 底部信息 */}
            <div className="text-xs opacity-60">
              转化为 {(equity.investmentEquity || 0).toFixed(4)}% 资本权证
            </div>
          </div>

          {/* 白色区域 */}
          <div className="bg-[#F9F9F9] px-4 py-4 rounded-b-3xl space-y-4 mx-4">
            {/* 1. 资本杠杆系数 */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="flex items-center space-x-1">
                    <span ref={leverageTitleRef} className="text-xs text-gray-600 mb-1">资本杠杆系数</span>
                    <button
                      ref={leverageHelpRef}
                      onClick={() => setShowLeverageHelp(!showLeverageHelp)}
                      className="text-gray-400 hover:text-[#C5B358] transition-colors"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="text-3xl font-bold text-[#C5B358] font-mono">
                    {equity.dynamicLeverage ? `${equity.dynamicLeverage.leverage.toFixed(4)}x` : '1.0000x'}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-0.5">已锁定 · 永久有效</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-600">
                    编号 {equity.dynamicLeverage ? String(equity.dynamicLeverage.seatNumber).padStart(4, '0') : '0000'}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {equity.details?.userInvestment ? `${(equity.details.userInvestment / 10000).toFixed(0)}万级别` : '未投资'}
                  </div>
                </div>
              </div>

              {/* 红利余量进度条 */}
              {equity.dynamicLeverage?.currentRound && (
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-gray-600">
                      {equity.dynamicLeverage.currentRound.name}（{equity.dynamicLeverage.currentRound.maxLeverage}x → {equity.dynamicLeverage.currentRound.minLeverage}x）
                    </span>
                    <span className="text-[10px] text-[#C5B358] font-bold">
                      剩余 {Math.round((1 - equity.dynamicLeverage.currentRound.progress) * 100)}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden bg-gray-200">
                    <div
                      className="h-full rounded-full transition-all duration-1000"
                      style={{
                        width: `${equity.dynamicLeverage.currentRound.progress * 100}%`,
                        background: '#800000',
                      }}
                    />
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1.5">
                    本轮高倍红利席位即将收官
                    {equity.dynamicLeverage.nextRound && (
                      <span>，下一轮杠杆将下调至 {equity.dynamicLeverage.nextRound.maxLeverage}x</span>
                    )}
                  </div>
                </div>
              )}

              {/* 犹豫成本计费器 */}
              {equity.dynamicLeverage && equity.details?.userInvestment ? (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] text-gray-500 mb-0.5">当前价值</div>
                      <div className="text-sm font-bold" style={{ color: '#C5B358' }}>
                        {(equity.details.userInvestment / 10000).toFixed(0)}万 → {((equity.details.userInvestment * equity.dynamicLeverage.leverage) / 10000).toFixed(2)}万
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-gray-500 mb-0.5">犹豫成本</div>
                      <div className="text-sm font-bold" style={{ color: '#800000' }}>
                        -{((equity.details.userInvestment * equity.dynamicLeverage.hesitationCost) / 10000).toFixed(2)}万
                      </div>
                    </div>
                  </div>
                  <div className="text-[10px] text-gray-600 mt-1.5 text-right">
                    若错过本轮，资产将缩水 {(equity.dynamicLeverage.hesitationCost * 10000).toFixed(0)} 权证点
                  </div>
                </div>
              ) : null}
              
              {/* 资本杠杆系数帮助弹窗 */}
              <Tooltip
                isOpen={showLeverageHelp}
                onClose={() => setShowLeverageHelp(false)}
                triggerRef={leverageTitleRef}
                content={
                  <div className="space-y-3">
                    <div className="font-bold text-gray-900 text-base">资本加速机制</div>
                    <div className="text-sm text-gray-700 leading-relaxed space-y-2">
                      <p>入场越早，静态权重越高（从 2.0 依次递减至 1.0）。</p>
                      <div className="bg-amber-50 border-l-4 border-amber-400 p-3 rounded">
                        <p className="font-medium text-amber-900">什么是资本加速？</p>
                        <p className="text-sm text-amber-800 mt-1">您的投资额度会乘以资本加速系数，转化为在 30% 天使池中的权重。例如，您投资 10 万，资本加速为 2.0x，则您的权重相当于 20 万。</p>
                      </div>
                      <div className="bg-green-50 border-l-4 border-green-400 p-3 rounded">
                        <p className="font-medium text-green-900">为什么递减？</p>
                        <p className="text-sm text-green-800 mt-1">越早加入，风险越大，回报也应越高。随着平台逐步成熟，后续投资者的风险降低，因此资本加速也相应递减。这确保了早期投资者的公平回报。</p>
                      </div>
                    </div>
                  </div>
                }
              />
            </div>

          </div>
        </div>
        {/* 第二部分结束 */}

        {/* ============ 第三部分：资源股 ============ */}
        <div id="resource-equity-section">
          <DualEngineAccelerator
            // 红色区域相关
            nodeLevel={equity.details?.inviteCount >= 1 ? 'standard' : 'none'}
            contribEquity={equity.contribEquity || 0}
            
            // 底部基座相关
            contactCount={overviewStats?.totalContacts || 0}
            
            // 股权加成相关（使用实际的资本杠杆系数）
            equityMultiplier={equity.dynamicLeverage?.leverage || 1.0}
            investmentEquity={equity.investmentEquity || 0}
            
            // 身份加成相关
            identityMultiplier={equity.details?.inviteCount >= 1 ? 1.0 : 0.0}
            
            // 已达成资产（向下兼容统计）
            standardNodes={equity.details?.inviteCount || 0}
            advancedNodes={Math.floor((equity.details?.inviteCount || 0) * 0.25)}
            superNodes={Math.floor((equity.details?.inviteCount || 0) * 0.04)}
            
            // 正在培育（潜力向上折算）
            potentialStandard={Math.floor((equity.details?.referralNetworkCount || 0) * 0.88)}
            potentialAdvanced={Math.floor((equity.details?.referralNetworkCount || 0) * 0.09)}
            potentialSuper={Math.floor((equity.details?.referralNetworkCount || 0) * 0.02)}
            
            // 总培育数
            totalCultivating={equity.details?.referralNetworkCount || 0}
            
            // 晋升数据统计
            promotionStats={promotionStats}
            
            // 邮请用户统计
            invitedUsersStats={invitedUsersStats}
            
            // 排名
            ranking={equity.ranking?.rank}
          />
        </div>

        {/* ============ 第二部分：公司股东中心 ============ */}
        <div className="space-y-0">
          {/* 红色区域 */}
          <div className="bg-gradient-to-br from-[#A80000] to-[#8a0000] text-white px-4 py-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm opacity-90 font-medium">股东保障中心</span>
                <div className="text-xs opacity-70 mt-1">契约、背书与底层逻辑</div>
              </div>
              <svg className="w-5 h-5 opacity-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
          </div>

          {/* 白色区域 */}
          <div className="bg-[#F9F9F9] px-4 py-4 rounded-b-3xl space-y-3 mx-4">
            {/* 1. 公司股权分配 */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-center space-x-1 mb-3">
                <svg className="w-4 h-4 text-[#A80000] mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                </svg>
                <span ref={companyEquityTitleRef} className="text-sm font-semibold text-gray-700">公司股权分配</span>
                <button
                  ref={companyEquityHelpRef}
                  onClick={() => setShowCompanyEquityHelp(!showCompanyEquityHelp)}
                  className="text-gray-400 hover:text-[#C5B358] transition-colors"
                >
                  <HelpCircle className="w-4 h-4" />
                </button>
              </div>
              <CompanyEquityPieChart parts={companyEquityParts} />
              
              {/* 公司股权分配帮助弹窗 */}
              <Tooltip
                isOpen={showCompanyEquityHelp}
                onClose={() => setShowCompanyEquityHelp(false)}
                triggerRef={companyEquityTitleRef}
                content={
                  <div className="space-y-3">
                    <div className="font-bold text-gray-900 text-base">为什么要设置 30% 天使池和 12.5% 市场池？</div>
                    <div className="text-sm text-gray-700 leading-relaxed space-y-3">
                      <div>
                        <p className="font-medium text-gray-800">1. 资产安全性（保底）：</p>
                        <p className="ml-4 text-gray-600 mt-1">传统的股权模式中，如果你不干活，股份可能会被收回或强制稀释。在脉动，30% 的天使池是您的资产避风港，不与劳动挂钩。这保证了您的投资安全，即使您只做一名纯粹的财务投资者。</p>
                      </div>
                      <div>
                        <p className="font-medium text-gray-800">2. 收益爆发力（增益）：</p>
                        <p className="ml-4 text-gray-600 mt-1">12.5% 的市场池是核动力引擎。它保证了平台永远有新鲜血液，永远在产出社交数据。当平台因为这 12.5% 的激励而估值翻倍时，您手里那 30% 的静态资产价值也会同步翻倍。</p>
                      </div>
                      <div>
                        <p className="font-medium text-gray-800">3. 防止“大户吸血”：</p>
                        <p className="ml-4 text-gray-600 mt-1">如果 42.5% 混在一起，不干活的大户会分走绝大部分劳动者的奖励，导致平台死亡。现在，劳动者在 12.5% 的池子里享有绝对的统治权，这确保了平台能够持续良性扩张。</p>
                      </div>
                    </div>
                  </div>
                }
              />
            </div>

            {/* 2. 在线签署 */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-center space-x-1 mb-3">
                <svg className="w-4 h-4 text-[#A80000] mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-sm font-semibold text-gray-700">在线签署</span>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">签署进度</span>
                  <span className="font-bold text-gray-900">0%</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">0/1 份协议</span>
                  <span className="text-xs px-2 py-1 bg-[#C5B358]/10 text-[#C5B358] rounded">待签署</span>
                </div>
                <div className="pt-2 border-t border-gray-200">
                  <div className="text-xs text-gray-600 mb-1">电子股权投资协议</div>
                  <div className="text-[10px] text-gray-400 mb-2">
                    明确股东权益、义务及退出机制
                  </div>
                  <button onClick={() => toast.info('没有需要签署的新合同')} className="w-full py-2 bg-[#A80000] text-white rounded-lg text-sm font-medium hover:bg-[#8a0000] transition-colors">
                    立即签署
                  </button>
                </div>
              </div>
            </div>

            {/* 3. 常见问题 */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-center space-x-1 mb-3">
                <svg className="w-4 h-4 text-[#A80000] mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-semibold text-gray-700">常见问题</span>
              </div>

              <div className="space-y-2">
                <button className="w-full text-left px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm text-gray-700 transition-colors flex items-center justify-between">
                  <span>1. 我投这点钱到底占多少股？</span>
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <button className="w-full text-left px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm text-gray-700 transition-colors flex items-center justify-between">
                  <span>2. 别人投的多了，我会被稀释吗？</span>
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <button className="w-full text-left px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm text-gray-700 transition-colors flex items-center justify-between">
                  <span>3. 比例动态在变，如何保证合规又不乱？</span>
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <button className="w-full text-left px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm text-gray-700 transition-colors flex items-center justify-between">
                  <span>4. 为什么我们的股价是锦定“全国熟人关系”数据？</span>
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
        {/* 第四部分结束 */}

      </div>
    </div>
  );
}
