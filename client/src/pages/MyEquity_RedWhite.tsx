import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Loader2, TrendingUp, Trophy, Sparkles, DollarSign } from "lucide-react";
import { useState } from "react";
import EquityEnergyRing from "@/components/EquityEnergyRing";
import NodeAchievementBadgeRedWhite from "@/components/NodeAchievementBadge_RedWhite";
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
      color: '#FF6B6B',
      upgradeLabel: '贡献加成（邀请）',
      description: `已邀请 ${equity.details?.inviteCount || 0} 人`
    },
    {
      label: '人脉贡献',
      value: equity.referralNetworkEquity || 0,
      color: '#F59E0B',
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
                  <div className="text-2xl font-bold text-yellow-300">
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
            {/* 1. 权重拆解 */}
            <div>
              <div className="flex items-center justify-between text-sm mb-2">
                <div className="flex items-center space-x-1.5">
                  <div className="w-2 h-2 rounded-full bg-white border-2 border-[#A80000]" />
                  <span className="text-gray-600">资本权证</span>
                  <span className="font-bold text-gray-900">{baseEquity.toFixed(4)}%</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <div className="w-2 h-2 rounded-full bg-[#C5B358]" />
                  <span className="text-gray-600">贡献加成</span>
                  <span className="font-bold text-[#C5B358]">+{contribEquity.toFixed(4)}%</span>
                </div>
              </div>
              {/* 双色进度条 */}
              <div className="h-2 rounded-full overflow-hidden bg-gray-200 flex">
                <div
                  className="h-full bg-[#A80000] transition-all duration-700"
                  style={{ width: `${Math.max(basePct, 2)}%` }}
                />
                <div
                  className="h-full bg-[#C5B358] transition-all duration-700"
                  style={{ width: `${Math.max(contribPct, contribEquity > 0 ? 2 : 0)}%` }}
                />
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[10px] text-gray-500">
                <span>资本权证</span>
                <span>贡献加成</span>
              </div>
            </div>

            {/* 2. 资产仪表盘（左右双列布局） */}
            <div className="grid grid-cols-2 gap-4 relative">
              {/* 左侧：我的股权估值 */}
              <div>
                <div className="text-xs text-gray-500 mb-1 flex items-center">
                  <Sparkles className="w-3 h-3 mr-1" />
                  我的股权估值
                </div>
                <div className="flex items-baseline space-x-1">
                  <span className="text-2xl font-bold text-orange-600">
                    ¥{(equity.estimatedValue / 10000).toFixed(2)}
                  </span>
                  <span className="text-sm text-gray-600">万</span>
                </div>
                <div className="mt-1 text-xs text-gray-400">
                  基于估值 ¥{(equity.companyValuation / 10000).toFixed(0)}万
                </div>
              </div>

              {/* 中间分割线 */}
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-300" style={{ transform: 'translateX(-50%)' }}></div>

              {/* 右侧：当前持股排名 */}
              <div className="text-right">
                <div className="text-xs text-gray-500 mb-1 flex items-center justify-end">
                  <Trophy className="w-3 h-3 mr-1" />
                  当前持股排名
                </div>
                {equity.ranking ? (
                  <>
                    <div className="text-2xl font-bold text-gray-900">No.{equity.ranking.rank}</div>
                    <div className="mt-1 text-xs text-gray-400">
                      共{equity.ranking.total}位股东
                    </div>
                  </>
                ) : (
                  <div className="text-2xl font-bold text-gray-400">--</div>
                )}
              </div>
            </div>

            {/* 虚线分割 */}
            <div className="border-t border-dashed border-gray-300"></div>

            {/* 3. 实时股权资产图谱 */}
            <div>
              <div className="text-xs font-light text-gray-600 mb-3 flex items-center" style={{ letterSpacing: '0.5px' }}>
                <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="#C5B358" viewBox="0 0 24 24" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <span style={{ fontFamily: 'system-ui, -apple-system, sans-serif', fontWeight: 300 }}>个人资产结构图</span>
              </div>
              <EquityEnergyRing
                parts={equityParts}
                othersValue={othersValue}
                totalEquity={equity.totalEquity}
              />
            </div>

            {/* 虚线分割 */}
            <div className="border-t border-dashed border-gray-300"></div>

            {/* 4. 动态杠杆系数 */}
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
                        background: 'linear-gradient(90deg, #F59E0B, #EF4444)',
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
                <div className="mt-3 pt-3 border-t border-yellow-200">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] text-gray-500 mb-0.5">当前价值</div>
                      <div className="text-sm font-bold text-green-600">
                        {(equity.details.userInvestment / 10000).toFixed(0)}万 → {((equity.details.userInvestment * equity.dynamicLeverage.leverage) / 10000).toFixed(2)}万
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-gray-500 mb-0.5">犹豫成本</div>
                      <div className="text-sm font-bold text-red-600">
                        -{((equity.details.userInvestment * equity.dynamicLeverage.hesitationCost) / 10000).toFixed(2)}万
                      </div>
                    </div>
                  </div>
                  <div className="text-[10px] text-red-500 mt-1.5 text-right">
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
          <NodeAchievementBadgeRedWhite
            level={equity.details?.inviteCount >= 1 ? 'standard' : 'none'}
            equityBonus={0.009}
            contributionScore={equity.details?.inviteCount * 2 || 0}
            marketShare={0.06}
            isQualified={equity.details?.inviteCount >= 1}
            estimatedEquityBonus={0.0015}
            contactCount={overviewStats?.totalContacts || 0}
            tagAverage={overviewStats?.averageTagCount || 0}
            contactFrequency={overviewStats?.dailyContactFrequency || 0}
            standardNodeCount={0}
            advancedNodeCount={0}
            totalEquity={equity.totalEquity || 0}
            investmentEquity={equity.investmentEquity || 0}
            contribEquity={(equity.inviteEquity || 0) + (equity.referralNetworkEquity || 0)}
            inviteEquity={equity.inviteEquity || 0}
            referralNetworkEquity={equity.referralNetworkEquity || 0}
            inviteCount={equity.details?.inviteCount || 0}
            referralNetworkCount={equity.details?.referralNetworkCount || 0}
            dynamicLeverage={equity.dynamicLeverage || null}
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
                  <span className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded">待签署</span>
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
              <div className="text-xs text-gray-500 mb-3">3个核心问题解答</div>
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
              </div>
            </div>
          </div>
        </div>
        {/* 第三层结束 */}

      </div>
    </div>
  );
}
