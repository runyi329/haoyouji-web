import React from 'react';
import { ArrowLeft, Shield, Award } from 'lucide-react';
import { useLocation, useRoute } from 'wouter';

interface WeeklyReport {
  weekNumber: string;
  dateRange: string;
  status: 'confirmed' | 'idle';
  weightGain: number;
  equityGain: number;
  blockchainHash: string;
  certificateNumber: number; // 第几张确权证书
  capitalAcceleration: number; // 资本加速
  resourceAcceleration: number; // 资源加速
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
  blockchainHash: '0x40166ed******',
  certificateNumber: 6, // 第6张确权证书
  capitalAcceleration: 3.00,
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

const WeeklyReportDetailPage: React.FC = () => {
  const [, setLocation] = useLocation();
  const [, params] = useRoute('/parent/equity-history/:weekNumber');
  
  // TODO: 根据 params.weekNumber 从API获取真实数据
  const report = mockReport;

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
                  {report.capitalAcceleration.toFixed(2)}x
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
                ({report.capitalAcceleration.toFixed(2)}x + {report.resourceAcceleration.toFixed(2)}x) × {report.marketContribution} = {report.equityGain} 张
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
};

export default WeeklyReportDetailPage;
