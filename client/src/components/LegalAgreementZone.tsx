import { FileText, Shield, CheckCircle, AlertCircle, Download, ExternalLink, Lock } from 'lucide-react';

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

interface LegalAgreementZoneProps {
  agreements: Agreement[];
  onSign: (agreementId: string) => void;
  onDownload: (agreementId: string) => void;
}

/**
 * 法律契约区
 * 从"简单按钮"升级为"权证证书预览"
 */
export default function LegalAgreementZone({
  agreements,
  onSign,
  onDownload,
}: LegalAgreementZoneProps) {
  return (
    <div className="space-y-4">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#424242]">法律契约与权益保障</h3>
        <div className="flex items-center space-x-1 text-xs text-[#757575]">
          <Lock className="w-3 h-3" />
          <span>法律效力</span>
        </div>
      </div>

      {/* 协议列表 */}
      <div className="space-y-3">
        {agreements.map((agreement) => (
          <div
            key={agreement.id}
            className={`rounded-xl border-2 overflow-hidden transition-all ${
              agreement.status === 'signed'
                ? 'bg-gradient-to-br from-white to-white border-[#4CAF50] shadow-lg'
                : 'bg-gradient-to-br from-red-50 to-orange-50 border-[#D32F2F] shadow-md hover:shadow-lg'
            }`}
          >
            {/* 顶部：协议标题栏 */}
            <div className={`p-4 ${
              agreement.status === 'signed'
                ? 'bg-gradient-to-r from-green-600 to-emerald-600'
                : 'bg-gradient-to-r from-red-600 to-orange-600'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
                    <FileText className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">{agreement.title}</h4>
                    <p className="text-xs text-white/80 mt-0.5">{agreement.description}</p>
                  </div>
                </div>

                {/* 状态标识 */}
                {agreement.status === 'signed' ? (
                  <div className="flex items-center space-x-1.5 bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full">
                    <CheckCircle className="w-4 h-4 text-white" />
                    <span className="text-xs font-semibold text-white">已签署</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-1.5 bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full animate-pulse">
                    <AlertCircle className="w-4 h-4 text-white" />
                    <span className="text-xs font-semibold text-white">待签署</span>
                  </div>
                )}
              </div>
            </div>

            {/* 中部：证书内容 */}
            <div className="p-4">
              {agreement.status === 'signed' ? (
                // 已签署：显示证书信息
                <div className="space-y-3">
                  {/* 签署信息 */}
                  <div className="bg-white rounded-lg p-3 border border-[#4CAF50]">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[#757575]">签署时间</span>
                        <p className="font-semibold text-[#424242] mt-0.5">
                          {agreement.signedAt ? new Date(agreement.signedAt).toLocaleString('zh-CN') : '-'}
                        </p>
                      </div>
                      <div>
                        <span className="text-[#757575]">法律效力</span>
                        <p className="font-semibold text-[#4CAF50] mt-0.5 flex items-center">
                          <Shield className="w-3 h-3 mr-1" />
                          已生效
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 区块链存证信息 */}
                  {agreement.hashValue && (
                    <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-lg p-3 text-white">
                      <div className="flex items-center space-x-2 mb-2">
                        <Shield className="w-4 h-4 text-[#4CAF50]" />
                        <span className="text-xs font-semibold">区块链存证</span>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[#757575]">哈希值</span>
                          <span className="font-mono text-gray-300 text-[10px]">
                            {agreement.hashValue.substring(0, 20)}...
                          </span>
                        </div>
                        {agreement.blockchainTxId && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-[#757575]">存证编号</span>
                            <span className="font-mono text-[#4CAF50] text-[10px]">
                              {agreement.blockchainTxId}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 操作按钮 */}
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => onDownload(agreement.id)}
                      className="flex-1 flex items-center justify-center space-x-1.5 bg-white border border-[#4CAF50] text-[#4CAF50] px-4 py-2 rounded-lg text-xs font-semibold hover:bg-[#E8F5E9] transition-all"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>下载协议</span>
                    </button>
                    {agreement.blockchainTxId && (
                      <button
                        className="flex items-center justify-center space-x-1 bg-white border border-[#E0E0E0] text-[#424242] px-3 py-2 rounded-lg text-xs hover:bg-gray-50 transition-all"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>验证</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                // 未签署：显示火漆印 + 紧迫感提示
                <div className="space-y-3">
                  {/* 火漆印效果 */}
                  <div className="flex flex-col items-center py-6">
                    <div className="relative">
                      {/* 火漆印 */}
                      <div className="w-24 h-24 rounded-full bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center shadow-2xl animate-pulse">
                        <div className="w-20 h-20 rounded-full border-4 border-[#D32F2F]/30 flex items-center justify-center">
                          <Lock className="w-10 h-10 text-[#FFEBEE]" />
                        </div>
                      </div>
                      {/* 光晕效果 */}
                      <div className="absolute inset-0 rounded-full bg-[#D32F2F]/20 blur-xl animate-pulse"></div>
                    </div>
                    <p className="text-sm font-semibold text-[#424242] mt-4">待签署状态</p>
                    <p className="text-xs text-[#757575] mt-1 text-center">
                      签署后即可锁定您的股东权益
                    </p>
                  </div>

                  {/* 紧迫感提示 */}
                  <div className="bg-gradient-to-r from-orange-100 to-red-100 rounded-lg p-3 border border-[#FFA726]">
                    <div className="flex items-start space-x-2">
                      <AlertCircle className="w-4 h-4 text-[#FFA726] flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-[#FFA726] mb-1">重要提示</p>
                        <p className="text-xs text-[#FFA726] leading-relaxed">
                          未签署协议的股东，其股权权益暂处于"待确认"状态。
                          为保障您的合法权益，请尽快完成签署。
                          签署后协议哈希值将自动存入区块链，具备法律效力。
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 签署按钮 */}
                  <button
                    onClick={() => onSign(agreement.id)}
                    className="w-full bg-gradient-to-r from-red-600 to-orange-600 text-white px-6 py-3 rounded-lg font-semibold hover:from-red-700 hover:to-orange-700 transition-all shadow-lg hover:shadow-xl flex items-center justify-center space-x-2"
                  >
                    <FileText className="w-4 h-4" />
                    <span>立即签署以锁定权益</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 底部法律说明 */}
      <div className="bg-gray-100 rounded-lg p-3 border border-[#E0E0E0]">
        <div className="flex items-start space-x-2">
          <Shield className="w-4 h-4 text-[#757575] flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs text-[#424242] leading-relaxed">
              <span className="font-semibold text-[#424242]">法律保障：</span>
              所有电子协议均采用国家认可的电子签名技术，
              协议内容经专业律师审核，签署后具备与纸质合同同等的法律效力。
              协议哈希值已通过蚂蚁链/腾讯至信链进行存证，可作为法庭证据使用。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
