import React, { useState } from 'react';
import { ArrowLeft, Shield, TrendingUp } from 'lucide-react';
import { useLocation } from 'wouter';
import AssetGrowthChart from '../components/equity/AssetGrowthChart';
import WeeklyReportDetail from '../components/equity/WeeklyReportDetail';

// 类型定义
interface WeeklyReport {
  weekNumber: string;
  dateRange: string;
  status: 'confirmed' | 'idle';
  weightGain: number;
  equityGain: number;
  blockchainHash: string;
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

interface ArchiveOverview {
  archiveId: string;
  totalWeeks: number;
  highestWeightGain: number;
  totalWeightGain: number;
}

// 模拟数据
const mockOverview: ArchiveOverview = {
  archiveId: '0001',
  totalWeeks: 24,
  highestWeightGain: 0.8850,
  totalWeightGain: 2.1500,
};

const mockReports: WeeklyReport[] = [
  {
    weekNumber: '2026-W07',
    dateRange: '2026年2月9日 - 2月15日',
    status: 'confirmed',
    weightGain: 0.5500,
    equityGain: 120,
    blockchainHash: '0x88f3a2d5c7b9e1f4a6d8c2e5f7a9b3c1d4e6f8a2',
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
  },
  {
    weekNumber: '2026-W06',
    dateRange: '2026年2月2日 - 2月8日',
    status: 'confirmed',
    weightGain: 0.4500,
    equityGain: 100,
    blockchainHash: '0x77e2b1c6a8d0f3e5b7c9d1e3f5a7b9c1d3e5f7a1',
    personalContribution: {
      networkSize: 2000,
      tagCompleteness: 1.5,
      contactFrequency: 3,
    },
    sharedContribution: {
      seniorNodes: 0,
      advancedNodes: 0,
      superNodes: 0,
    },
    nationalRank: 3,
  },
  {
    weekNumber: '2026-W05',
    dateRange: '2026年1月26日 - 2月1日',
    status: 'idle',
    weightGain: 0,
    equityGain: 0,
    blockchainHash: '',
    personalContribution: {
      networkSize: 1950,
      tagCompleteness: 1.4,
      contactFrequency: 0,
    },
    sharedContribution: {
      seniorNodes: 0,
      advancedNodes: 0,
      superNodes: 0,
    },
    nationalRank: 4,
  },
  {
    weekNumber: '2026-W04',
    dateRange: '2026年1月19日 - 1月25日',
    status: 'confirmed',
    weightGain: 0.6200,
    equityGain: 135,
    blockchainHash: '0x66d1a0b5c7e9f2d4a6b8c0d2e4f6a8b0c2d4e6f0',
    personalContribution: {
      networkSize: 1900,
      tagCompleteness: 1.6,
      contactFrequency: 5,
    },
    sharedContribution: {
      seniorNodes: 0,
      advancedNodes: 0,
      superNodes: 0,
    },
    nationalRank: 2,
  },
  {
    weekNumber: '2026-W03',
    dateRange: '2026年1月12日 - 1月18日',
    status: 'confirmed',
    weightGain: 0.3800,
    equityGain: 85,
    blockchainHash: '0x55c0b9a4d6e8f1c3a5b7c9d1e3f5a7b9c1d3e5f9',
    personalContribution: {
      networkSize: 1850,
      tagCompleteness: 1.3,
      contactFrequency: 4,
    },
    sharedContribution: {
      seniorNodes: 0,
      advancedNodes: 0,
      superNodes: 0,
    },
    nationalRank: 3,
  },
];

// 周报卡片组件
const WeeklyReportCard: React.FC<{ report: WeeklyReport; onClick: () => void }> = ({ report, onClick }) => {
  const isIdle = report.status === 'idle';

  return (
    <div
      onClick={onClick}
      className={`
        rounded-xl p-5 cursor-pointer transition-all duration-200
        ${isIdle
          ? 'bg-gray-100 opacity-60'
          : 'bg-white hover:shadow-md'
        }
        shadow-sm
      `}
    >
      {/* 顶部：周数 + 确权印章 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-base font-semibold text-gray-900">
            {report.weekNumber}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {report.dateRange}
          </div>
        </div>
        <div className={`
          w-12 h-12 rounded-full flex items-center justify-center
          ${isIdle ? 'bg-gray-300' : 'bg-[#C5B358]/10'}
        `}>
          <Shield className={`w-6 h-6 ${isIdle ? 'text-gray-400' : 'text-[#C5B358]'}`} />
        </div>
      </div>

      {/* 中间：定格数据 */}
      {isIdle ? (
        <div className="text-center py-4">
          <div className="text-sm text-gray-500">本周未进行确权</div>
          <div className="text-xs text-gray-400 mt-1">资产静止状态</div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <div className="text-xs text-gray-500 mb-1">定格权重</div>
            <div className="text-2xl font-bold text-[#C5B358]">
              +{report.weightGain.toFixed(4)}%
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500 mb-1">定格股权</div>
            <div className="text-lg font-medium text-gray-900">
              +{report.equityGain} 张
            </div>
          </div>
        </div>
      )}

      {/* 底部：区块链哈希 */}
      {!isIdle && (
        <>
          <div className="border-t border-gray-200 pt-3">
            <div className="text-[10px] text-gray-400 truncate">
              区块链存证哈希：{report.blockchainHash.slice(0, -6)}******
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// 主页面组件
const EquityHistoryArchive: React.FC = () => {
  const [, setLocation] = useLocation();
  const [selectedReport, setSelectedReport] = useState<WeeklyReport | null>(null);
  const [displayCount, setDisplayCount] = useState(10); // 每次显示10条
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // 加载更多
  const handleLoadMore = () => {
    setIsLoadingMore(true);
    setTimeout(() => {
      setDisplayCount(prev => prev + 10);
      setIsLoadingMore(false);
    }, 500);
  };

  // 显示的报告列表
  const displayedReports = mockReports.slice(0, displayCount);
  const hasMore = displayCount < mockReports.length;

  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      {/* 顶部导航 */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="flex items-center px-4 py-3">
          <button
            onClick={() => setLocation('/parent/my-equity')}
            className="p-2 -ml-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900 ml-2">
            历史确权周报
          </h1>
        </div>
      </div>

      {/* 顶部：资产概览 */}
      <div className="bg-gradient-to-br from-[#A80000] to-[#8a0000] p-6 relative overflow-hidden">
        {/* 背景水印 */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-10">
          <Shield className="w-32 h-32 text-white" />
        </div>

        {/* 内容 */}
        <div className="relative">
          <div className="flex items-center justify-between mb-4">
            <div className="text-white/80 text-sm">资产总档案</div>
            <div className="text-white/80 text-xs">
              档案编号 No.{mockOverview.archiveId}
            </div>
          </div>

          {/* 第一行：累计确权 */}
          <div className="mb-3">
            <div className="text-white/70 text-xs mb-1">累计确权</div>
            <div className="text-white text-3xl font-bold">
              {mockOverview.totalWeeks} <span className="text-lg font-normal">周</span>
            </div>
          </div>

          {/* 第二行：历史最高加成 + 总增长权重 */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="text-white/70 text-xs mb-1">历史最高加成</div>
              <div className="text-white text-xl font-bold">
                +{mockOverview.highestWeightGain.toFixed(4)}%
              </div>
            </div>
            <div>
              <div className="text-white/70 text-xs mb-1">总增长权重</div>
              <div className="text-[#C5B358] text-xl font-bold">
                +{mockOverview.totalWeightGain.toFixed(4)}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 中间：资产增长曲线图 */}
      <div className="bg-white m-4 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-gray-900">资产增长趋势</div>
          <TrendingUp className="w-4 h-4 text-[#C5B358]" />
        </div>
        <AssetGrowthChart
          data={mockReports
            .filter(r => r.status === 'confirmed')
            .reverse()
            .map(r => ({
              week: r.weekNumber.replace('2026-', ''),
              weight: r.weightGain,
            }))}
        />
      </div>

      {/* 股权统计区域 */}
      <div className="bg-white mx-4 mb-4 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-gray-900">股权统计</div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-xs text-gray-500 mb-1">累计股权</div>
            <div className="text-2xl font-bold text-[#C5B358]">
              {mockReports.filter(r => r.status === 'confirmed').reduce((sum, r) => sum + r.equityGain, 0)}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">张</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500 mb-1">本月股权</div>
            <div className="text-2xl font-bold text-gray-900">
              {mockReports.filter(r => r.status === 'confirmed' && r.weekNumber.includes('W07')).reduce((sum, r) => sum + r.equityGain, 0)}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">张</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500 mb-1">平均周股权</div>
            <div className="text-2xl font-bold text-gray-900">
              {Math.round(mockReports.filter(r => r.status === 'confirmed').reduce((sum, r) => sum + r.equityGain, 0) / mockReports.filter(r => r.status === 'confirmed').length)}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">张</div>
          </div>
        </div>
      </div>

      {/* 筛选功能 */}
      <div className="px-4 mb-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          <button className="px-4 py-2 rounded-lg bg-[#A80000] text-white text-sm font-medium whitespace-nowrap">
            全部
          </button>
          <button className="px-4 py-2 rounded-lg bg-white text-gray-700 text-sm font-medium whitespace-nowrap border border-gray-200">
            2026年
          </button>
          <button className="px-4 py-2 rounded-lg bg-white text-gray-700 text-sm font-medium whitespace-nowrap border border-gray-200">
            Q1
          </button>
          <button className="px-4 py-2 rounded-lg bg-white text-gray-700 text-sm font-medium whitespace-nowrap border border-gray-200">
            Q2
          </button>
          <button className="px-4 py-2 rounded-lg bg-white text-gray-700 text-sm font-medium whitespace-nowrap border border-gray-200">
            已确权
          </button>
          <button className="px-4 py-2 rounded-lg bg-white text-gray-700 text-sm font-medium whitespace-nowrap border border-gray-200">
            未确权
          </button>
        </div>
      </div>

      {/* 主体：确权周报卡片流 */}
      <div className="px-4 pb-6 space-y-4">
        {displayedReports.map((report) => (
          <WeeklyReportCard
            key={report.weekNumber}
            report={report}
            onClick={() => setSelectedReport(report)}
          />
        ))}

        {/* 加载更多按钮 */}
        {hasMore && (
          <div className="flex justify-center pt-4">
            <button
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              className="px-6 py-3 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoadingMore ? '加载中...' : `加载更多（还有 ${mockReports.length - displayCount} 周）`}
            </button>
          </div>
        )}

        {/* 已加载全部提示 */}
        {!hasMore && mockReports.length > 10 && (
          <div className="text-center text-sm text-gray-400 pt-4">
            已加载全部 {mockReports.length} 周的确权记录
          </div>
        )}
      </div>

      {/* 详情弹窗 */}
      {selectedReport && (
        <WeeklyReportDetail
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
        />
      )}
    </div>
  );
};

export default EquityHistoryArchive;
