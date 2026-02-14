import React, { useState } from 'react';
import { FileText, CheckCircle, AlertCircle, Download } from 'lucide-react';

interface Agreement {
  id: string;
  title: string;
  description: string;
  status: 'signed' | 'unsigned';
  signedAt?: string;
  hashValue?: string;
  blockchainTxId?: string;
  pdfUrl?: string;
}

interface LegalAgreementCardProps {
  agreements: Agreement[];
  onSign: (agreementId: string) => void;
  onDownload: (agreementId: string) => void;
}

/**
 * 在线签署卡片 - 红白风格版本
 * 对标第一层和第二层的视觉风格
 */
export default function LegalAgreementCard({
  agreements,
  onSign,
  onDownload,
}: LegalAgreementCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // 统计签署状态
  const signedCount = agreements.filter(a => a.status === 'signed').length;
  const totalCount = agreements.length;
  const signedPercentage = totalCount > 0 ? (signedCount / totalCount) * 100 : 0;

  return (
    <div className="space-y-0">
      {/* 红色顶盖 */}
      <div 
        className="bg-gradient-to-br from-[#A80000] to-[#8a0000] text-white p-5 rounded-t-2xl rounded-b-none shadow-none border-none cursor-pointer transition-all"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm opacity-90">在线签署</span>
          <div className="flex items-center space-x-2">
            <FileText className="w-5 h-5 opacity-90" />
            <svg
              className={`w-5 h-5 opacity-90 transition-transform ${
                isExpanded ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        
        <div className="flex items-baseline space-x-2">
          <span className="text-5xl font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {signedCount}
          </span>
          <span className="text-2xl opacity-90">/ {totalCount}</span>
        </div>
        
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs opacity-60">已签署协议数</span>
          <span className="text-xs opacity-60 bg-white/10 px-2 py-0.5 rounded-full">
            {signedPercentage.toFixed(0)}% 完成
          </span>
        </div>

        {/* 展开后的详细内容 */}
        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-white/20 space-y-3">
            {/* 协议列表 */}
            {agreements.map((agreement) => (
              <div key={agreement.id} className="bg-white/10 rounded-xl p-3">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="text-sm font-semibold mb-1">{agreement.title}</div>
                    <div className="text-xs opacity-70">{agreement.description}</div>
                  </div>
                  {agreement.status === 'signed' ? (
                    <div className="flex items-center gap-1 bg-green-500/20 px-2 py-1 rounded-full flex-shrink-0 ml-2">
                      <CheckCircle className="w-3 h-3 text-green-300" />
                      <span className="text-xs text-green-300">已签署</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 bg-orange-500/20 px-2 py-1 rounded-full flex-shrink-0 ml-2">
                      <AlertCircle className="w-3 h-3 text-orange-300" />
                      <span className="text-xs text-orange-300">待签署</span>
                    </div>
                  )}
                </div>
                {agreement.status === 'signed' && agreement.signedAt && (
                  <div className="text-xs opacity-60">
                    签署时间：{new Date(agreement.signedAt).toLocaleString('zh-CN')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 白色/浅灰容器 */}
      <div className="bg-gray-50 rounded-t-none rounded-b-3xl shadow-sm border-none p-5">
        {/* 左右双列：签署进度 vs 法律效力 */}
        <div className="grid grid-cols-2 gap-6 mb-5 relative">
          {/* 左侧：签署进度 */}
          <div>
            <div className="text-xs text-gray-500 mb-1 flex items-center">
              <FileText className="w-3 h-3 mr-1" />
              签署进度
            </div>
            <div className="flex items-baseline space-x-1">
              <span className="text-2xl font-bold text-gray-900">{signedPercentage.toFixed(0)}</span>
              <span className="text-sm text-gray-600">%</span>
            </div>
            <div className="mt-1 text-xs text-gray-400">
              {signedCount}/{totalCount} 份协议
            </div>
          </div>
          
          {/* 中间分割线 */}
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-300" style={{transform: 'translateX(-50%)'}}></div>
          
          {/* 右侧：法律效力 */}
          <div className="text-right">
            <div className="text-xs text-gray-500 mb-1 flex items-center justify-end">
              <CheckCircle className="w-3 h-3 mr-1" />
              法律效力
            </div>
            <div className="text-2xl font-bold text-green-600">
              {signedCount > 0 ? '已生效' : '待生效'}
            </div>
            <div className="mt-1 text-xs text-gray-400">
              {signedCount > 0 ? '受法律保护' : '等待签署'}
            </div>
          </div>
        </div>
        
        {/* 虚线分割 */}
        <div className="border-t border-dashed border-gray-300 my-4"></div>
        
        {/* 底部操作 */}
        <div className="space-y-2">
          {agreements.map((agreement) => (
            <div key={agreement.id} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  agreement.status === 'signed' ? 'bg-green-500' : 'bg-orange-500'
                }`} />
                <span className="text-gray-700">{agreement.title}</span>
              </div>
              {agreement.status === 'signed' ? (
                <button
                  onClick={() => onDownload(agreement.id)}
                  className="flex items-center gap-1 text-blue-600 hover:text-blue-700"
                >
                  <Download className="w-3 h-3" />
                  <span>下载</span>
                </button>
              ) : (
                <button
                  onClick={() => onSign(agreement.id)}
                  className="px-3 py-1 bg-orange-500 text-white rounded-full hover:bg-orange-600 transition-colors"
                >
                  立即签署
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
