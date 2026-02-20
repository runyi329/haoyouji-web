import React from 'react';
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
 * 在线签署 - 内容组件（无外壳）
 * 用于嵌入 ShareholderSection 手风琴中
 */
export default function LegalAgreementCard({
  agreements,
  onSign,
  onDownload,
}: LegalAgreementCardProps) {
  const signedCount = agreements.filter(a => a.status === 'signed').length;
  const totalCount = agreements.length;
  const signedPercentage = totalCount > 0 ? (signedCount / totalCount) * 100 : 0;

  return (
    <div>
      {/* 签署状态概览 */}
      <div className="grid grid-cols-2 gap-4 mb-4 relative">
        {/* 左侧：签署进度 */}
        <div className="bg-white rounded-xl p-3 border border-[#E0E0E0]">
          <div className="text-xs text-[#757575] mb-1 flex items-center">
            <FileText className="w-3 h-3 mr-1" />
            签署进度
          </div>
          <div className="flex items-baseline space-x-1">
            <span className="text-2xl font-bold text-[#424242]">{signedPercentage.toFixed(0)}</span>
            <span className="text-sm text-[#757575]">%</span>
          </div>
          <div className="mt-1 text-xs text-[#757575]">
            {signedCount}/{totalCount} 份协议
          </div>
        </div>
        
        {/* 右侧：法律效力 */}
        <div className="bg-white rounded-xl p-3 border border-[#E0E0E0]">
          <div className="text-xs text-[#757575] mb-1 flex items-center justify-end">
            <CheckCircle className="w-3 h-3 mr-1" />
            法律效力
          </div>
          <div className="text-2xl font-bold text-right" style={{ color: signedCount > 0 ? '#059669' : '#9CA3AF' }}>
            {signedCount > 0 ? '已生效' : '待生效'}
          </div>
          <div className="mt-1 text-xs text-[#757575] text-right">
            {signedCount > 0 ? '受法律保护' : '等待签署'}
          </div>
        </div>
      </div>

      {/* 虚线分割 */}
      <div className="border-t border-dashed border-[#E0E0E0] my-3"></div>
      
      {/* 协议列表 */}
      <div className="space-y-2">
        {agreements.map((agreement) => (
          <div key={agreement.id} className="bg-white rounded-xl p-3 border border-[#E0E0E0]">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <div className="text-sm font-semibold text-[#424242] mb-0.5">{agreement.title}</div>
                <div className="text-xs text-[#757575]">{agreement.description}</div>
              </div>
              {agreement.status === 'signed' ? (
                <div className="flex items-center gap-1 bg-[#E8F5E9] px-2 py-1 rounded-full flex-shrink-0 ml-2">
                  <CheckCircle className="w-3 h-3 text-[#4CAF50]" />
                  <span className="text-xs text-[#4CAF50]">已签署</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-full flex-shrink-0 ml-2">
                  <AlertCircle className="w-3 h-3 text-[#FFA726]" />
                  <span className="text-xs text-[#FFA726]">待签署</span>
                </div>
              )}
            </div>

            {agreement.status === 'signed' && agreement.signedAt && (
              <div className="text-xs text-[#757575] mb-2">
                签署时间：{new Date(agreement.signedAt).toLocaleString('zh-CN')}
              </div>
            )}

            {/* Hash 信息 */}
            {agreement.hashValue && (
              <div className="text-xs text-[#757575] font-mono truncate mb-2">
                Hash: {agreement.hashValue.substring(0, 20)}...
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex justify-end">
              {agreement.status === 'signed' ? (
                <button
                  onClick={() => onDownload(agreement.id)}
                  className="flex items-center gap-1 text-xs text-[#1976D2] hover:text-[#1976D2]"
                >
                  <Download className="w-3 h-3" />
                  <span>下载协议</span>
                </button>
              ) : (
                <button
                  onClick={() => onSign(agreement.id)}
                  className="px-4 py-1.5 text-xs font-semibold text-white rounded-full hover:opacity-90 transition-colors"
                  style={{ backgroundColor: '#A80000' }}
                >
                  立即签署
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
