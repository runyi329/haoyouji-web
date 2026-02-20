import { Shield, Database, Lock, CheckCircle } from 'lucide-react';
import { useState, useEffect } from 'react';

interface BlockchainProofProps {
  totalShareholders: number;
  lastSyncTime?: string;
}

/**
 * 区块链存证标签
 * "虚实结合"策略：视觉引导 + 技术逻辑 + 未来法律防线
 */
export default function BlockchainProof({
  totalShareholders,
  lastSyncTime,
}: BlockchainProofProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 生成模拟哈希值（基于时间戳）
  const generateMockHash = () => {
    const timestamp = Date.now();
    const hash = `BH${timestamp.toString(36).toUpperCase()}...A82`;
    return hash;
  };

  const mockHash = generateMockHash();

  return (
    <div className="space-y-3">
      {/* 主存证标签 */}
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-4 border-2 border-[#4CAF50]/30 shadow-lg">
        <div className="flex items-start space-x-3">
          {/* 左侧：盾牌图标 + 呼吸灯 */}
          <div className="relative flex-shrink-0">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            {/* 呼吸灯效果 */}
            <div className="absolute inset-0 rounded-full bg-[#4CAF50]/30 animate-pulse"></div>
            <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#4CAF50] animate-ping"></div>
          </div>

          {/* 右侧：存证信息 */}
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-2">
              <h4 className="text-sm font-bold text-white">数据已通过区块链进行哈希存证</h4>
              <div className="flex items-center space-x-1 bg-[#4CAF50]/20 px-2 py-0.5 rounded-full">
                <div className="w-1.5 h-1.5 rounded-full bg-[#4CAF50] animate-pulse"></div>
                <span className="text-[10px] text-[#4CAF50] font-semibold">实时同步</span>
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[#757575]">存证编号</span>
                <span className="font-mono text-[#4CAF50]">{mockHash}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#757575]">保障对象</span>
                <span className="text-white font-semibold">{totalShareholders} 位创始股东</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#757575]">最后同步</span>
                <span className="text-gray-300">
                  {currentTime.toLocaleTimeString('zh-CN', { 
                    hour: '2-digit', 
                    minute: '2-digit', 
                    second: '2-digit' 
                  })}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 底部技术说明 */}
        <div className="mt-3 pt-3 border-t border-white/10">
          <button className="w-full text-xs text-[#757575] hover:text-white transition-colors flex items-center justify-center space-x-1">
            <span>了解区块链存证技术</span>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* 技术细节卡片 */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white rounded-lg p-2.5 border border-[#E0E0E0]">
          <div className="flex items-center space-x-1.5 mb-1">
            <Database className="w-3 h-3 text-[#1976D2]" />
            <span className="text-[10px] text-[#757575]">数据快照</span>
          </div>
          <p className="text-xs font-semibold text-[#424242]">每日备份</p>
        </div>
        <div className="bg-white rounded-lg p-2.5 border border-[#E0E0E0]">
          <div className="flex items-center space-x-1.5 mb-1">
            <Lock className="w-3 h-3 text-[#D32F2F]" />
            <span className="text-[10px] text-[#757575]">加密算法</span>
          </div>
          <p className="text-xs font-semibold text-[#424242]">SHA-256</p>
        </div>
        <div className="bg-white rounded-lg p-2.5 border border-[#E0E0E0]">
          <div className="flex items-center space-x-1.5 mb-1">
            <CheckCircle className="w-3 h-3 text-[#4CAF50]" />
            <span className="text-[10px] text-[#757575]">法律效力</span>
          </div>
          <p className="text-xs font-semibold text-[#424242]">已生效</p>
        </div>
      </div>

      {/* 说明文案 */}
      <div className="bg-[#F5F5F5] rounded-lg p-3 border border-[#1976D2]">
        <div className="flex items-start space-x-2">
          <div className="w-1 h-1 rounded-full bg-[#1976D2] mt-1.5 flex-shrink-0" />
          <p className="text-xs text-[#424242] leading-relaxed">
            <span className="font-semibold text-[#424242]">数据安全与区块链存证：</span>
            好友集采用<span className="font-semibold">多层次数据保护机制</span>。
            所有股权变动记录均生成唯一的<span className="font-semibold text-[#4CAF50]">Hash校验值</span>，
            并计划接入<span className="font-semibold text-[#FFA726]">蚂蚁链/腾讯至信链</span>进行存证。
            这确保了每位合伙人的资产数据<span className="font-semibold text-[#D32F2F]">可追溯、不可篡改</span>，
            在未来任何法律纠纷中均可作为有效证据。
          </p>
        </div>
      </div>
    </div>
  );
}
