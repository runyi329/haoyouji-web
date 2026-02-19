import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { MoreVertical, Share2 } from 'lucide-react';
import { trpc } from "@/lib/trpc";

// 计算资本加速系数的函数（修正版）
// 公式：系数 = 1.0 + 2.0 × √((660 - 排名) / 659)
// 确保第1名=3.0，第660名=1.0
function calculateMultiplier(rank: number): number {
  if (rank < 1) return 0.0; // 没有编号时返回0
  if (rank > 660) return 1.0;
  // 使用 (660 - rank) / 659 代替 (1 - rank / 660)
  const multiplier = 1.0 + 2.0 * Math.sqrt((660 - rank) / 659);
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
  
  // 使用编号排名（seatNumber），而不是持股排名
  const currentSeatNumber = enhanced?.dynamicLeverage?.seatNumber || 0;
  const isInvestor = currentSeatNumber > 0;
  
  // 如果是股东，使用实际编号；如果不是，编号显示0000
  const displaySeatNumber = isInvestor ? currentSeatNumber : 0;
  const currentMultiplier = calculateMultiplier(displaySeatNumber);

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

  // 将数据分成2列，每行2个
  const rows: Array<[typeof multiplierData[0], typeof multiplierData[0] | undefined]> = [];
  for (let i = 0; i < multiplierData.length; i += 2) {
    rows.push([multiplierData[i], multiplierData[i + 1]]);
  }

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

      {/* 当前编号和系数提示 */}
      <div className="px-4 py-4">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-2">
              编号 {displaySeatNumber.toString().padStart(4, '0')}
            </p>
            <div className="text-4xl font-bold text-[#C5B358] font-mono">
              ×{currentMultiplier.toFixed(4)}
            </div>
          </div>
        </div>
      </div>

      {/* 系数对照表 - 极简风格，高信息密度 */}
      <div className="px-4 pb-4">
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <table className="w-full">
            <tbody>
              {rows.map((row, rowIndex) => {
                const [item1, item2] = row;
                
                return (
                  <tr 
                    key={rowIndex} 
                    className={rowIndex > 0 ? 'border-t border-gray-200' : ''}
                  >
                    {/* 第1列 - 左右排列：排名 系数 */}
                    <td className="py-0.5 px-2 border-r border-gray-200">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-600">第{item1.rank}名</span>
                        <span className="text-xs text-gray-700 font-mono ml-2">×{item1.multiplier}</span>
                      </div>
                    </td>
                    
                    {/* 第2列 - 左右排列：排名 系数 */}
                    {item2 ? (
                      <td className="py-0.5 px-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-600">第{item2.rank}名</span>
                          <span className="text-xs text-gray-700 font-mono ml-2">×{item2.multiplier}</span>
                        </div>
                      </td>
                    ) : (
                      <td className="py-0.5 px-2"></td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          
          {/* 底部说明 */}
          <div className="px-4 py-2 bg-gray-50/50 border-t border-gray-200">
            <p className="text-xs text-gray-500 text-center">
              编号按投资时间先后排序，系数永久锁定
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CapitalMultiplierTable;
