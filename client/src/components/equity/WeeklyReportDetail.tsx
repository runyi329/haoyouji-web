import React from 'react';
import { X, Shield, Award, Download } from 'lucide-react';

interface WeeklyReport {
  weekNumber: string;
  dateRange: string;
  status: 'confirmed' | 'idle';
  weightGain: number;
  pointsGain: number;
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

interface WeeklyReportDetailProps {
  report: WeeklyReport;
  onClose: () => void;
}

const WeeklyReportDetail: React.FC<WeeklyReportDetailProps> = ({ report, onClose }) => {
  const handleDownloadPDF = () => {
    // TODO: 实现PDF导出功能
    alert('PDF导出功能开发中...');
  };

  const handleShare = () => {
    // TODO: 实现分享功能
    alert('分享功能开发中...');
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部：关闭按钮 */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="text-lg font-bold text-gray-900">确权证书</div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="p-6">
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
              <div className="text-sm text-gray-500">
                {report.dateRange}
              </div>
            </div>
          </div>

          {/* 核心数据 */}
          <div className="bg-gradient-to-br from-[#A80000] to-[#8a0000] rounded-xl p-5 mb-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-white/70 text-xs mb-1">定格权重</div>
                <div className="text-[#C5B358] text-2xl font-bold">
                  +{report.weightGain.toFixed(4)}%
                </div>
              </div>
              <div className="text-center">
                <div className="text-white/70 text-xs mb-1">定格积分</div>
                <div className="text-white text-2xl font-bold">
                  +{report.pointsGain} PTS
                </div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-white/20 text-center">
              <div className="text-white/70 text-xs mb-1">全国排名</div>
              <div className="text-white text-xl font-bold">
                No.{report.nationalRank}
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
          <div className="bg-gray-50 rounded-xl p-4 mb-6">
            <div className="flex items-start space-x-2">
              <Shield className="w-4 h-4 text-[#C5B358] mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-600 mb-1">区块链存证哈希</div>
                <div className="text-[10px] text-gray-500 break-all font-mono">
                  {report.blockchainHash}
                </div>
                <div className="text-xs text-gray-400 mt-2">
                  ✓ 数据已加密保护，实时同步至 2026/02/15 17:25
                </div>
              </div>
            </div>
          </div>

          {/* 底部按钮 */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleDownloadPDF}
              className="flex items-center justify-center space-x-2 px-4 py-3 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>导出PDF</span>
            </button>
            <button
              onClick={handleShare}
              className="flex items-center justify-center px-4 py-3 bg-gradient-to-r from-[#A80000] to-[#8a0000] rounded-xl text-sm font-medium text-white hover:opacity-90 transition-opacity"
            >
              生成分享图
            </button>
          </div>

          {/* 底部说明 */}
          <div className="mt-4 text-center text-xs text-gray-400">
            本证书由系统自动生成，具有法律效力
          </div>
        </div>
      </div>
    </div>
  );
};

export default WeeklyReportDetail;
