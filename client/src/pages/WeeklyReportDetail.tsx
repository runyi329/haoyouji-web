import React, { useState, useRef } from 'react';
import { ArrowLeft, Shield, Award, Loader2, HelpCircle } from 'lucide-react';
import { useLocation, useRoute } from 'wouter';
import { trpc } from '@/lib/trpc';
import Tooltip from '../components/Tooltip';

interface WeeklyReport {
  weekNumber: string;
  dateRange: string;
  status: 'confirmed' | 'idle';
  weightGain: number;
  equityGain: number;
  totalEquity: number; // 累计定格股权
  blockchainHash: string;
  certificateNumber: number; // 第几张确权证书
  capitalAcceleration: number; // 资本加速（实际）
  capitalAccelerationDetail: {
    originalAcceleration: number; // 原始加速
    investmentAmount: number; // 实际投资额（元）
    actualAcceleration: number; // 实际加速
  };
  resourceAcceleration: number; // 资源加速
  resourceAccelerationDetail?: {
    contactCount: number; // 人脉累计
    tagCount: number; // 标签累计
    interactionCount: number; // 30日联络数
    currentLevel: string; // 当前等级
    levelName: string; // 等级名称
    hasInvestment: boolean; // 是否有投资
    resourceAcceleration: number; // 资源加速倍数
  };
  marketContribution: number; // 市场贡献
  personalContribution: {
    networkSize: number;
    tagCompleteness: number;
    contactFrequency: number;
  };
  sharedContribution: {
    seniorNodes: number;
    advancedNodes: number;
    superNodes: number;
  };
  nationalRank: number;
}

// 模拟数据（实际应从路由参数或API获取）
const mockReport: WeeklyReport = {
  weekNumber: '2026-W08',
  dateRange: '2026年2月16日 - 2026年2月22日',
  status: 'confirmed',
  weightGain: 0.0000,
  equityGain: 0,
  totalEquity: 0, // 累计定格股权
  blockchainHash: '0x40166ed******',
  certificateNumber: 6, // 第6张确权证书
  capitalAcceleration: 3.00,
  capitalAccelerationDetail: {
    originalAcceleration: 2.9909,
    investmentAmount: 10000,
    actualAcceleration: 3.00,
  },
  resourceAcceleration: 1.00,
  marketContribution: 0,
  personalContribution: {
    networkSize: 2109,
    tagCompleteness: 1.7,
    contactFrequency: 0,
  },
  sharedContribution: {
    seniorNodes: 0,
    advancedNodes: 0,
    superNodes: 0,
  },
  nationalRank: 2,
};

export default function WeeklyReportDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute('/parent/equity-history/:weekNumber');
  
  // 原始加速的帮助提示状态
  const [showOriginalAccelerationHelp, setShowOriginalAccelerationHelp] = useState(false);
  const originalAccelerationHelpRef = useRef<HTMLButtonElement>(null);
  const originalAccelerationTitleRef = useRef<HTMLSpanElement>(null);
  
  // 实际加速的帮助提示状态
  const [showActualAccelerationHelp, setShowActualAccelerationHelp] = useState(false);
  const actualAccelerationHelpRef = useRef<HTMLButtonElement>(null);
  const actualAccelerationTitleRef = useRef<HTMLSpanElement>(null);
  
  // 资源加速明细的帮助提示状态
  const [showContactCountHelp, setShowContactCountHelp] = useState(false);
  const contactCountHelpRef = useRef<HTMLButtonElement>(null);
  const contactCountTitleRef = useRef<HTMLSpanElement>(null);
  
  const [showTagCountHelp, setShowTagCountHelp] = useState(false);
  const tagCountHelpRef = useRef<HTMLButtonElement>(null);
  const tagCountTitleRef = useRef<HTMLSpanElement>(null);
  
  const [showInteractionCountHelp, setShowInteractionCountHelp] = useState(false);
  const interactionCountHelpRef = useRef<HTMLButtonElement>(null);
  const interactionCountTitleRef = useRef<HTMLSpanElement>(null);
  
  const [showLevelNameHelp, setShowLevelNameHelp] = useState(false);
  const levelNameHelpRef = useRef<HTMLButtonElement>(null);
  const levelNameTitleRef = useRef<HTMLSpanElement>(null);
  
  // 从 API获取真实数据
  const { data: equityData, isLoading } = trpc.equity.getMyEquity.useQuery();
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#A80000]" />
      </div>
    );
  }
  
  // 合并API数据和模拟数据
  const report: WeeklyReport = {
    ...mockReport,
    capitalAccelerationDetail: equityData?.capitalAccelerationDetail || mockReport.capitalAccelerationDetail,
    // 红色区域的资本加速应该显示实际加速，而不是原始加速
    capitalAcceleration: equityData?.capitalAccelerationDetail?.actualAcceleration || mockReport.capitalAcceleration,
    // 资源加速明细使用API返回的数据
    resourceAccelerationDetail: equityData?.resourceAccelerationDetail,
    resourceAcceleration: equityData?.resourceAccelerationDetail?.resourceAcceleration || mockReport.resourceAcceleration,
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      {/* 顶部导航 */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="flex items-center px-4 py-3">
          <button
            onClick={() => setLocation('/parent/equity-history')}
            className="p-2 -ml-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900 ml-2">
            历史确权周报
          </h1>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="p-4">
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          {/* 证书头部 */}
          <div className="text-center mb-6 relative">
            {/* 背景水印 */}
            <div className="absolute inset-0 flex items-center justify-center opacity-5">
              <Shield className="w-32 h-32 text-[#A80000]" />
            </div>

            {/* 内容 */}
            <div className="relative">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#C5B358]/10 mb-3">
                <Award className="w-8 h-8 text-[#C5B358]" />
              </div>
              <div className="text-2xl font-bold text-gray-900 mb-1">
                {report.weekNumber}
              </div>
              <div className="text-sm text-gray-500 mb-1">
                {report.dateRange}
              </div>
              <div className="text-xs text-[#C5B358] font-medium">
                第 {report.certificateNumber} 张确权证书
              </div>
            </div>
          </div>

          {/* 核心数据 */}
          <div className="bg-gradient-to-br from-[#A80000] to-[#8a0000] rounded-xl p-5 mb-6">
            {/* 上层：本周定格股权 */}
            <div className="text-center mb-4">
              <div className="text-white/70 text-xs mb-1">本周定格股权</div>
              <div className="text-[#C5B358] text-3xl font-bold">
                {report.equityGain} 张
              </div>
            </div>

            {/* 分隔线 */}
            <div className="border-t border-white/20 my-4"></div>

            {/* 下层：三个基数 */}
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="text-center">
                <div className="text-white/60 text-[10px] mb-1">资本加速</div>
                <div className="text-white text-sm font-bold">
                  {report.capitalAcceleration.toFixed(4)}x
                </div>
              </div>
              <div className="text-center">
                <div className="text-white/60 text-[10px] mb-1">资源加速</div>
                <div className="text-white text-sm font-bold">
                  {report.resourceAcceleration.toFixed(2)}x
                </div>
              </div>
              <div className="text-center">
                <div className="text-white/60 text-[10px] mb-1">市场贡献</div>
                <div className="text-white text-sm font-bold">
                  {report.marketContribution}
                </div>
              </div>
            </div>

            {/* 计算公式 */}
            <div className="bg-white/10 rounded-lg px-3 py-2 text-center">
              <div className="text-white/80 text-[11px] leading-relaxed">
                ({report.capitalAcceleration.toFixed(4)}x + {report.resourceAcceleration.toFixed(2)}x) × {report.marketContribution} = {report.equityGain} 张
              </div>
            </div>
          </div>

          {/* 资本加速明细 */}
          <div className="mb-6">
            <div className="text-sm font-semibold text-gray-900 mb-3">
              资本加速明细
            </div>
            <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-4 border border-gray-100">
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center space-x-1.5">
                    <span ref={originalAccelerationTitleRef} className="text-sm text-gray-600">原始加速</span>
                    <button
                      ref={originalAccelerationHelpRef}
                      onClick={() => setShowOriginalAccelerationHelp(!showOriginalAccelerationHelp)}
                      className="text-gray-400 hover:text-[#C5B358] transition-colors"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <span className="text-base font-bold text-[#A80000]">
                    {report.capitalAccelerationDetail.originalAcceleration.toFixed(4)}x
                  </span>
                </div>
                
                {/* 原始加速帮助弹窗 */}
                <Tooltip
                  isOpen={showOriginalAccelerationHelp}
                  onClose={() => setShowOriginalAccelerationHelp(false)}
                  triggerRef={originalAccelerationTitleRef}
                  content={
                    <div className="space-y-1.5">
                      <div className="font-bold text-[#A80000] text-base pb-1.5 border-b border-gray-200">原始加速说明</div>
                      <div className="text-sm text-gray-800 leading-snug space-y-1">
                        <div className="py-1.5 border-b border-gray-100">
                          <span className="font-semibold text-[#A80000]">计算依据</span>
                          <span className="text-gray-700"> — 根据您的席位编号（投资时机）确定</span>
                        </div>
                        <div className="py-1.5 border-b border-gray-100">
                          <span className="font-semibold text-[#A80000]">风险补偿</span>
                          <span className="text-gray-700"> — 早期投资者承担更大风险，享受更高加速倍数</span>
                        </div>
                        <div className="py-1.5">
                          <span className="font-semibold text-[#A80000]">示例</span>
                          <span className="text-gray-700"> — 第7名投资者的原始加速为2.9909x</span>
                        </div>
                      </div>
                    </div>
                  }
                />
                <div className="border-t border-gray-100"></div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-gray-600">实际投资额</span>
                  <span className="text-base font-bold text-gray-900">
                    ¥{report.capitalAccelerationDetail.investmentAmount.toLocaleString()}
                  </span>
                </div>
                <div className="border-t border-gray-100"></div>
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center space-x-1.5">
                    <span ref={actualAccelerationTitleRef} className="text-sm text-gray-600">实际加速</span>
                    <button
                      ref={actualAccelerationHelpRef}
                      onClick={() => setShowActualAccelerationHelp(!showActualAccelerationHelp)}
                      className="text-gray-400 hover:text-[#C5B358] transition-colors"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <span className="text-base font-bold text-[#C5B358]">
                    {report.capitalAccelerationDetail.actualAcceleration.toFixed(4)}x
                  </span>
                </div>
                
                {/* 实际加速帮助弹窗 */}
                <Tooltip
                  isOpen={showActualAccelerationHelp}
                  onClose={() => setShowActualAccelerationHelp(false)}
                  triggerRef={actualAccelerationTitleRef}
                  content={
                      <div className="space-y-1.5">
                      <div className="font-bold text-[#A80000] text-base pb-1.5 border-b border-gray-200">实际加速说明</div>
                      <div className="text-sm text-gray-800 leading-snug space-y-1">
                        <div className="py-1.5 border-b border-gray-100">
                          <span className="font-semibold text-[#A80000]">计算公式</span>
                          <span className="text-gray-700"> — 实际加速 = 原始加速 × (投资万数 / 10)</span>
                        </div>
                        <div className="py-1.5 border-b border-gray-100">
                          <span className="font-semibold text-[#A80000]">关键特性</span>
                          <span className="text-gray-700"> — 投资10万元时，实际加速 = 原始加速</span>
                        </div>
                        <div className="py-1.5 border-b border-gray-100">
                          <span className="font-semibold text-[#A80000]">示例（原始加速2.99x）</span>
                          <span className="text-gray-700"> — 1万元：2.99 × (1/10) = 0.299x</span>
                        </div>
                        <div className="py-1.5 border-b border-gray-100">
                          <span className="text-gray-700"> — 5万元：2.99 × (5/10) = 1.495x</span>
                        </div>
                        <div className="py-1.5">
                          <span className="text-gray-700"> — 10万元：2.99 × (10/10) = 2.99x</span>
                        </div>
                      </div>
                    </div>
                  }
                />
              </div>
            </div>
          </div>

          {/* 资源加速明细 */}
          <div className="mb-6">
            <div className="text-sm font-semibold text-gray-900 mb-3">
              资源加速明细
            </div>
            <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-4 border border-gray-100">
              <div className="space-y-3">
                {/* 人脉累计 */}
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center space-x-1.5">
                    <span ref={contactCountTitleRef} className="text-sm text-gray-600">人脉累计</span>
                    <button
                      ref={contactCountHelpRef}
                      onClick={() => setShowContactCountHelp(!showContactCountHelp)}
                      className="text-gray-400 hover:text-[#C5B358] transition-colors"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <span className="text-base font-bold text-gray-900">
                    {report.resourceAccelerationDetail?.contactCount || report.personalContribution.networkSize} 人
                  </span>
                </div>
                
                {/* 人脉累计帮助弹窗 */}
                <Tooltip
                  isOpen={showContactCountHelp}
                  onClose={() => setShowContactCountHelp(false)}
                  triggerRef={contactCountTitleRef}
                  content={
                    <div className="space-y-1.5">
                      <div className="font-bold text-[#A80000] text-base pb-1.5 border-b border-gray-200">人脉累计说明</div>
                      <div className="text-sm text-gray-800 leading-snug space-y-1">
                        <div className="py-1.5 border-b border-gray-100">
                          <span className="font-semibold text-[#A80000]">计算依据</span>
                          <span className="text-gray-700"> — 账户内添加的联系人数量</span>
                        </div>
                        <div className="py-1.5 border-b border-gray-100">
                          <span className="font-semibold text-[#A80000]">统计范围</span>
                          <span className="text-gray-700"> — 使用至今的累计数据</span>
                        </div>
                        <div className="py-1.5">
                          <span className="font-semibold text-[#A80000]">说明</span>
                          <span className="text-gray-700"> — 不考虑信息完整度，只统计数量</span>
                        </div>
                      </div>
                    </div>
                  }
                />
                
                <div className="border-t border-gray-100"></div>
                
                {/* 标签累计 */}
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center space-x-1.5">
                    <span ref={tagCountTitleRef} className="text-sm text-gray-600">标签累计</span>
                    <button
                      ref={tagCountHelpRef}
                      onClick={() => setShowTagCountHelp(!showTagCountHelp)}
                      className="text-gray-400 hover:text-[#C5B358] transition-colors"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <span className="text-base font-bold text-gray-900">
                    {report.resourceAccelerationDetail?.tagCount || Math.round(report.personalContribution.tagCompleteness * report.personalContribution.networkSize)} 个
                  </span>
                </div>
                
                {/* 标签累计帮助弹窗 */}
                <Tooltip
                  isOpen={showTagCountHelp}
                  onClose={() => setShowTagCountHelp(false)}
                  triggerRef={tagCountTitleRef}
                  content={
                    <div className="space-y-1.5">
                      <div className="font-bold text-[#A80000] text-base pb-1.5 border-b border-gray-200">标签累计说明</div>
                      <div className="text-sm text-gray-800 leading-snug space-y-1">
                        <div className="py-1.5 border-b border-gray-100">
                          <span className="font-semibold text-[#A80000]">计算依据</span>
                          <span className="text-gray-700"> — 所有好友的标签总和</span>
                        </div>
                        <div className="py-1.5 border-b border-gray-100">
                          <span className="font-semibold text-[#A80000]">统计范围</span>
                          <span className="text-gray-700"> — 包含全局标签和个人标签</span>
                        </div>
                        <div className="py-1.5">
                          <span className="font-semibold text-[#A80000]">说明</span>
                          <span className="text-gray-700"> — 标签越多，说明人脉信息越完整</span>
                        </div>
                      </div>
                    </div>
                  }
                />
                
                <div className="border-t border-gray-100"></div>
                
                {/* 30日联络数 */}
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center space-x-1.5">
                    <span ref={interactionCountTitleRef} className="text-sm text-gray-600">30日联络数</span>
                    <button
                      ref={interactionCountHelpRef}
                      onClick={() => setShowInteractionCountHelp(!showInteractionCountHelp)}
                      className="text-gray-400 hover:text-[#C5B358] transition-colors"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <span className="text-base font-bold text-gray-900">
                    {report.resourceAccelerationDetail?.interactionCount || report.personalContribution.contactFrequency} 次
                  </span>
                </div>
                
                {/* 30日联络数帮助弹窗 */}
                <Tooltip
                  isOpen={showInteractionCountHelp}
                  onClose={() => setShowInteractionCountHelp(false)}
                  triggerRef={interactionCountTitleRef}
                  content={
                    <div className="space-y-1.5">
                      <div className="font-bold text-[#A80000] text-base pb-1.5 border-b border-gray-200">30日联络数说明</div>
                      <div className="text-sm text-gray-800 leading-snug space-y-1">
                        <div className="py-1.5 border-b border-gray-100">
                          <span className="font-semibold text-[#A80000]">统计节点</span>
                          <span className="text-gray-700"> — 每周日晚上12点</span>
                        </div>
                        <div className="py-1.5 border-b border-gray-100">
                          <span className="font-semibold text-[#A80000]">统计范围</span>
                          <span className="text-gray-700"> — 从统计节点往前推30天</span>
                        </div>
                        <div className="py-1.5 border-b border-gray-100">
                          <span className="font-semibold text-[#A80000]">计算方式</span>
                          <span className="text-gray-700"> — 累计联络次数（同一人可多次计算）</span>
                        </div>
                        <div className="py-1.5">
                          <span className="font-semibold text-[#A80000]">等级保持</span>
                          <span className="text-gray-700"> — 符合条件则接下来一周保持该级别，下周日再次统计</span>
                        </div>
                      </div>
                    </div>
                  }
                />
                
                <div className="border-t border-gray-100"></div>
                
                {/* 本周等级 */}
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center space-x-1.5">
                    <span ref={levelNameTitleRef} className="text-sm text-gray-600">本周等级</span>
                    <button
                      ref={levelNameHelpRef}
                      onClick={() => setShowLevelNameHelp(!showLevelNameHelp)}
                      className="text-gray-400 hover:text-[#C5B358] transition-colors"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <span className="text-base font-bold text-gray-900">
                    {report.resourceAccelerationDetail?.levelName || '用户'}
                  </span>
                </div>
                
                {/* 本周等级帮助弹窗 */}
                <Tooltip
                  isOpen={showLevelNameHelp}
                  onClose={() => setShowLevelNameHelp(false)}
                  triggerRef={levelNameTitleRef}
                  content={
                    <div className="space-y-1.5">
                      <div className="font-bold text-[#A80000] text-base pb-1.5 border-b border-gray-200">准节点说明</div>
                      <div className="text-sm text-gray-800 leading-snug space-y-1">
                        <div className="py-1.5 border-b border-gray-100">
                          <span className="font-semibold text-[#A80000]">准节点定义</span>
                          <span className="text-gray-700"> — 尚未进行投资储值的用户</span>
                        </div>
                        <div className="py-1.5 border-b border-gray-100">
                          <span className="font-semibold text-[#A80000]">晋升要求</span>
                          <span className="text-gray-700"> — 与正式节点完全相同</span>
                        </div>
                        <div className="py-1.5 border-b border-gray-100">
                          <span className="font-semibold text-[#A80000]">资源加速</span>
                          <span className="text-gray-700"> — 与正式节点完全相同</span>
                        </div>
                        <div className="py-1.5">
                          <span className="font-semibold text-[#A80000]">转正条件</span>
                          <span className="text-gray-700"> — 完成投资储值后自动转为正式节点</span>
                        </div>
                      </div>
                    </div>
                  }
                />
                
                <div className="border-t border-gray-100"></div>
                
                {/* 资源加速 */}
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-gray-600">资源加速</span>
                  <span className="text-base font-bold text-[#C5B358]">
                    {report.resourceAcceleration.toFixed(4)}x
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 个人贡献明细 */}
          <div className="mb-6">
            <div className="text-sm font-semibold text-gray-900 mb-3">
              个人贡献明细
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-sm text-gray-600">人脉网络规模</span>
                <span className="text-sm font-medium text-gray-900">
                  {report.personalContribution.networkSize} 人
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-sm text-gray-600">标签完整度</span>
                <span className="text-sm font-medium text-gray-900">
                  {report.personalContribution.tagCompleteness.toFixed(1)}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-sm text-gray-600">联络频次</span>
                <span className="text-sm font-medium text-gray-900">
                  {report.personalContribution.contactFrequency} 次
                </span>
              </div>
            </div>
          </div>

          {/* 共享贡献明细 */}
          <div className="mb-6">
            <div className="text-sm font-semibold text-gray-900 mb-3">
              共享贡献明细
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-sm text-gray-600">已培育高级节点</span>
                <span className="text-sm font-medium text-gray-900">
                  {report.sharedContribution.seniorNodes} 名
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-sm text-gray-600">已培育高端节点</span>
                <span className="text-sm font-medium text-gray-900">
                  {report.sharedContribution.advancedNodes} 名
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-sm text-gray-600">已培育超端节点</span>
                <span className="text-sm font-medium text-gray-900">
                  {report.sharedContribution.superNodes} 名
                </span>
              </div>
            </div>
          </div>

          {/* 区块链存证信息 */}
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-start space-x-2">
              <Shield className="w-4 h-4 text-[#C5B358] mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-600 mb-1">区块链存证哈希</div>
                <div className="text-[10px] text-gray-500 break-all font-mono">
                  {report.blockchainHash}
                </div>
                <div className="text-xs text-gray-400 mt-2">
                  ✓ 数据已加密保护，实时同步至 2026/02/19
                </div>
              </div>
            </div>
          </div>

          {/* 底部说明 */}
          <div className="mt-6 text-center text-xs text-gray-400">
            本证书由系统自动生成，具有法律效力
          </div>
        </div>
      </div>
    </div>
  );
}
