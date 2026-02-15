import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Loader2, TrendingUp, Trophy, Sparkles, DollarSign } from "lucide-react";
import { useState } from "react";
import EquityEnergyRing from "@/components/EquityEnergyRing";
import DualEngineAccelerator from "@/components/DualEngineAccelerator";
import FAQAccordion from "@/components/FAQAccordion";

export default function MyEquityRedWhite() {
  const { data: enhanced, isLoading } = trpc.equity.getMyEquityEnhanced.useQuery();
  const { data: overviewStats } = trpc.contacts.overviewStats.useQuery();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#A80000]" />
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

  const baseEquity = equity.investmentEquity || 0;
  const contribEquity = (equity.inviteEquity || 0) + (equity.referralNetworkEquity || 0);
  const totalEq = baseEquity + contribEquity;
  const basePct = totalEq > 0 ? (baseEquity / totalEq) * 100 : 100;
  const contribPct = totalEq > 0 ? (contribEquity / totalEq) * 100 : 0;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="max-w-md mx-auto px-4 py-4 space-y-4">
        
        {/* ============ 第一层：资本权证中心（红白双引擎） ============ */}
        <div className="space-y-0">
          {/* 红色区域（汇总） */}
          <div className="bg-gradient-to-br from-[#A80000] to-[#8a0000] text-white p-4 rounded-t-2xl">
            {/* 标题行 */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm opacity-90 font-medium">综合权重</span>
              <div className="flex items-center space-x-2">
                {equity.dynamicLeverage && (
                  <span className="text-[10px] font-mono tracking-wider opacity-60 bg-white/10 px-2 py-0.5 rounded">
                    编号 {String(equity.dynamicLeverage.seatNumber).padStart(4, '0')}
                  </span>
                )}
                <TrendingUp className="w-5 h-5 opacity-90" />
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
                <div className="mt-1 text-xs opacity-60">综合权重</div>
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

            {/* 时间戳 */}
            <div className="mt-3 text-[10px] opacity-50 text-right">
              截止 {timestampStr}
            </div>
          </div>

          {/* 白色区域（明细） */}
          <div className="bg-[#F9F9F9] p-4 rounded-b-3xl space-y-4">
            {/* 1. 个人资产结构图（左图右数布局） */}
            <div>
              <EquityEnergyRing
                parts={equityParts}
                othersValue={othersValue}
                totalEquity={equity.totalEquity}
              />
            </div>

            {/* 2. 动态杠杆系数 */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-xs text-gray-600 mb-1">资本杠杆系数</div>
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
            </div>

            {/* 5. 资本底仓（静态确权） */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold text-gray-700">资本权证</div>
                <div className="text-xs text-gray-500">我的投资</div>
              </div>
              <div className="flex items-baseline space-x-1">
                <span className="text-2xl font-bold text-gray-900">
                  {(equity.details?.userInvestment || 0).toLocaleString()}
                </span>
                <span className="text-sm text-gray-600">元</span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                转化为 {(equity.investmentEquity || 0).toFixed(4)}% 资本权证
              </div>
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
        {/* 第一层结束 */}

        {/* ============ 第二层：贡献加成中心（红白双引擎） ============ */}
        <div id="market-contribution-section">
          <DualEngineAccelerator
            // 红色区域相关
            nodeLevel={equity.details?.inviteCount >= 1 ? 'standard' : 'none'}
            contribEquity={equity.contribEquity || 0}
            
            // 股权加成相关
            equityMultiplier={1.2}
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
          />
        </div>

        {/* ============ 第三层：股东保障中心（红白双引擎） ============ */}
        <div className="space-y-0">
          {/* 红色区域（汇总） */}
          <div className="bg-gradient-to-br from-[#A80000] to-[#8a0000] text-white p-4 rounded-t-2xl">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm opacity-90 font-medium">股东保障中心</span>
              <svg className="w-5 h-5 opacity-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div className="text-xs opacity-70 mb-2">契约、背书与底层逻辑</div>
            
            {/* 核心数据（左右双列布局） */}
            <div className="grid grid-cols-2 gap-4 mt-3">
              <div>
                <div className="text-xs opacity-70 mb-1">保障状态</div>
                <div className="text-2xl font-bold text-[#C5B358]">100%</div>
                <div className="text-[10px] opacity-60 mt-0.5">确权</div>
              </div>
              <div className="text-right">
                <div className="text-xs opacity-70 mb-1">已签署协议</div>
                <div className="text-2xl font-bold">0/1</div>
                <div className="text-[10px] opacity-60 mt-0.5">份</div>
              </div>
            </div>

            <div className="mt-3 text-[10px] opacity-50 text-center">
              为660位创始股东构建信任基石
            </div>
          </div>

          {/* 白色区域（明细） */}
          <div className="bg-[#F9F9F9] p-4 rounded-b-3xl space-y-4">
            {/* 1. 确权状态（从第一层移动过来） */}
            <div className="p-4">
              <div className="text-sm font-semibold text-gray-700 mb-3">确权状态</div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">电子股权协议</span>
                  <span className="font-bold text-[#C5B358]">待签署</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">权证下发状态</span>
                  <span className="font-bold text-[#C5B358]">已确权</span>
                </div>
              </div>
            </div>

            {/* 2. 股权分配池明细 */}
            <div className="p-4">
              <div className="text-sm font-semibold text-gray-700 mb-3">公司股权分配</div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-gray-500 mb-0.5">创始股东</div>
                  <div className="text-xl font-bold text-gray-900">660人</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500 mb-0.5">当前估值</div>
                  <div className="text-xl font-bold text-gray-900">6600万</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-0.5">期权池余额</div>
                  <div className="text-xl font-bold text-gray-900">25%</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500 mb-0.5">总股本</div>
                  <div className="text-xl font-bold text-gray-900">100%</div>
                </div>
              </div>
            </div>

            {/* 3. 法律协议 */}
            <div className="p-4">
              <div className="text-sm font-semibold text-gray-700 mb-3">在线签署</div>
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
                  <button className="w-full py-2 bg-[#A80000] text-white rounded-lg text-sm font-medium hover:bg-[#8a0000] transition-colors">
                    立即签署
                  </button>
                </div>
              </div>
            </div>

            {/* 4. 常见问题（FAQ） */}
            <div className="p-4">
              <div className="text-sm font-semibold text-gray-700 mb-3">常见问题</div>
              <div className="text-xs text-gray-500 mb-3">4个核心问题解答</div>
              <div className="space-y-2">
                <button className="w-full text-left px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm text-gray-700 transition-colors">
                  1. 我投这点钱到底占多少股？
                </button>
                <button className="w-full text-left px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm text-gray-700 transition-colors">
                  2. 别人投的多了，我会被稀释吗？
                </button>
                <button className="w-full text-left px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm text-gray-700 transition-colors">
                  3. 比例动态在变，如何保证合规又不乱？
                </button>
                <button className="w-full text-left px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm text-gray-700 transition-colors">
                  4. 为什么我们的股价是锚定"全国熟人关系"数据？
                </button>
              </div>
            </div>
          </div>
        </div>
        {/* 第三层结束 */}

      </div>
    </div>
  );
}
