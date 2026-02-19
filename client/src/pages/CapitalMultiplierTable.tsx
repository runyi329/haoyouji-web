import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { MoreVertical, Share2 } from 'lucide-react';
import { trpc } from "@/lib/trpc";

// 计算资本加速系数的函数（修正版）
// 公式：系数 = 1.0 + 2.0 × √(1 - 排名/660)
// 确保第1名=3.0，第660名=1.0
function calculateMultiplier(rank: number): number {
  if (rank < 1) return 3.0;
  if (rank > 660) return 1.0;
  const normalized = 1 - rank / 660;
  const multiplier = 1.0 + 2.0 * Math.sqrt(normalized);
  return multiplier;
}

// 生成每10名的系数数据（共66个）
function generateMultiplierData(): Array<{ rank: number; multiplier: string }> {
  const data: Array<{ rank: number; multiplier: string }> = [];
  
  // 第1名
  data.push({
    rank: 1,
    multiplier: calculateMultiplier(1).toFixed(4)
  });
  
  // 第10, 20, 30...660名
  for (let rank = 10; rank <= 660; rank += 10) {
    const multiplier = calculateMultiplier(rank);
    data.push({
      rank,
      multiplier: multiplier.toFixed(4)
    });
  }
  
  return data;
}

const CapitalMultiplierTable: React.FC = () => {
  const [, setLocation] = useLocation();
  const [showMenu, setShowMenu] = useState(false);
  const multiplierData = generateMultiplierData();
  
  // 获取当前用户的股权信息
  const { data: enhanced } = trpc.equity.getMyEquityEnhanced.useQuery(undefined, {
    retry: 2,
    staleTime: 5 * 60 * 1000,
  });
  
  // 计算当前用户的排名和系数
  const currentRank = enhanced?.ranking?.rank || 661; // 如果没有排名，默认为661（未投资）
  const currentMultiplier = calculateMultiplier(currentRank);

  // 分享链接
  const handleShareLink = () => {
    const url = window.location.href;
    
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        toast.success('链接已复制到剪贴板!', { duration: 500 });
        setShowMenu(false);
      }).catch(() => {
        toast.error('复制失败,请手动复制');
      });
    } else {
      toast.error('您的浏览器不支持自动复制');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 pb-20">
      {/* 顶部导航栏 */}
      <div className="bg-gradient-to-r from-[#A80000] to-[#8B0000] text-white p-4 flex items-center justify-between shadow-lg sticky top-0 z-10">
        <div className="flex items-center">
          <button onClick={() => setLocation('/parent/my-equity')} className="mr-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold">资本加速系数对照表</h1>
        </div>
        
        {/* 右上角菜单按钮 */}
        <div className="relative">
          <button 
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 hover:bg-white/10 rounded-lg transition-colors"
          >
            <MoreVertical className="w-6 h-6" />
          </button>
          
          {showMenu && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute right-0 top-full mt-2 bg-white rounded-lg shadow-xl py-2 min-w-[140px] z-50">
                <button
                  onClick={handleShareLink}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                >
                  <Share2 className="w-4 h-4" />
                  <span>分享链接</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 当前系数提示 */}
      <div className="px-4 py-4">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-2">
              {currentRank <= 660 ? `您当前排名第 ${currentRank} 位` : '如果您现在成为股东'}
            </p>
            <div className="text-4xl font-bold text-[#C5B358] font-mono">
              {currentMultiplier.toFixed(4)}x
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {currentRank <= 660 ? '已锁定 · 永久有效' : '系数将在投资后锁定'}
            </p>
          </div>
        </div>
      </div>

      {/* 曲线图 */}
      <div className="px-4 pb-4">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="text-sm font-bold text-[#A80000] mb-3">系数曲线图</h3>
          <div className="relative" style={{ height: '200px' }}>
            <svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid meet">
              {/* Y轴 */}
              <line x1="40" y1="20" x2="40" y2="170" stroke="#666" strokeWidth="1" />
              {/* X轴 */}
              <line x1="40" y1="170" x2="380" y2="170" stroke="#666" strokeWidth="1" />
              
              {/* Y轴刻度和标签 */}
              <text x="25" y="25" fontSize="10" fill="#666" textAnchor="end">3.0</text>
              <line x1="35" y1="20" x2="40" y2="20" stroke="#666" strokeWidth="1" />
              
              <text x="25" y="95" fontSize="10" fill="#666" textAnchor="end">2.0</text>
              <line x1="35" y1="95" x2="40" y2="95" stroke="#666" strokeWidth="1" />
              
              <text x="25" y="170" fontSize="10" fill="#666" textAnchor="end">1.0</text>
              <line x1="35" y1="170" x2="40" y2="170" stroke="#666" strokeWidth="1" />
              
              {/* X轴刻度和标签 */}
              <text x="40" y="185" fontSize="10" fill="#666" textAnchor="middle">1</text>
              <line x1="40" y1="170" x2="40" y2="175" stroke="#666" strokeWidth="1" />
              
              <text x="210" y="185" fontSize="10" fill="#666" textAnchor="middle">330</text>
              <line x1="210" y1="170" x2="210" y2="175" stroke="#666" strokeWidth="1" />
              
              <text x="380" y="185" fontSize="10" fill="#666" textAnchor="middle">660</text>
              <line x1="380" y1="170" x2="380" y2="175" stroke="#666" strokeWidth="1" />
              
              {/* 绘制曲线 */}
              <path
                d={(() => {
                  const points: string[] = [];
                  for (let rank = 1; rank <= 660; rank += 5) {
                    const x = 40 + (rank - 1) * (340 / 659);
                    const multiplier = calculateMultiplier(rank);
                    const y = 170 - ((multiplier - 1.0) / 2.0) * 150;
                    points.push(`${rank === 1 ? 'M' : 'L'} ${x} ${y}`);
                  }
                  return points.join(' ');
                })()}
                fill="none"
                stroke="#A80000"
                strokeWidth="2"
              />
              
              {/* 标注当前用户位置 */}
              {currentRank <= 660 && (
                <>
                  <circle
                    cx={40 + (currentRank - 1) * (340 / 659)}
                    cy={170 - ((currentMultiplier - 1.0) / 2.0) * 150}
                    r="4"
                    fill="#FF0000"
                    stroke="#FFF"
                    strokeWidth="2"
                  />
                  <text
                    x={40 + (currentRank - 1) * (340 / 659)}
                    y={170 - ((currentMultiplier - 1.0) / 2.0) * 150 - 10}
                    fontSize="10"
                    fill="#FF0000"
                    textAnchor="middle"
                    fontWeight="bold"
                  >
                    您
                  </text>
                </>
              )}
            </svg>
          </div>
        </div>
      </div>

      {/* 对照表 */}
      <div className="px-4">
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {/* 表头 */}
          <div className="bg-gradient-to-r from-[#A80000] to-[#8B0000] text-white px-4 py-3 flex justify-between items-center">
            <span className="font-semibold text-sm">排名</span>
            <span className="font-semibold text-sm">系数</span>
          </div>
          
          {/* 表格内容 */}
          <div className="divide-y divide-gray-100">
            {multiplierData.map((item) => (
              <div 
                key={item.rank} 
                className={`px-4 py-3 flex justify-between items-center hover:bg-gray-50 transition-colors ${
                  item.rank === currentRank ? 'bg-red-50' : ''
                }`}
              >
                <span className="text-sm text-gray-700 font-medium">
                  第 {item.rank} 名
                  {item.rank === currentRank && (
                    <span className="ml-2 text-xs text-red-600 font-bold">← 您的位置</span>
                  )}
                </span>
                <span className="text-base font-bold text-[#C5B358] font-mono">
                  {item.multiplier}x
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 底部说明 */}
      <div className="px-4 py-4 text-center text-xs text-gray-500">
        <p>共 660 个席位 · 系数永久锁定</p>
      </div>
    </div>
  );
};

export default CapitalMultiplierTable;
