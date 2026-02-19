import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { MoreVertical, Share2 } from 'lucide-react';

// 计算资本加速系数的函数
// 公式：系数 = 1.0 + (3.0 - 1.0) × √(1 - 排名/660)
function calculateMultiplier(rank: number): number {
  if (rank < 1 || rank > 666) return 1.0;
  const normalized = 1 - rank / 660;
  const multiplier = 1.0 + (3.0 - 1.0) * Math.sqrt(normalized);
  return multiplier;
}

// 生成所有排名的系数数据
function generateMultiplierData(): Array<{ rank: number; multiplier: string }> {
  const data: Array<{ rank: number; multiplier: string }> = [];
  for (let rank = 1; rank <= 666; rank++) {
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

      {/* 说明文字 */}
      <div className="px-4 py-4">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="text-base font-bold text-[#A80000] mb-2">系数计算说明</h2>
          <div className="text-sm text-gray-700 space-y-1.5 leading-relaxed">
            <p>资本加速系数采用<span className="font-semibold text-[#A80000]">曲线衰减</span>算法，范围从 <span className="font-semibold">3.0x</span> 递减至 <span className="font-semibold">1.0x</span>。</p>
            <p className="text-xs text-gray-600 bg-gray-50 p-2 rounded font-mono">
              系数 = 1.0 + (3.0 - 1.0) × √(1 - 排名/660)
            </p>
            <p className="text-xs text-gray-600">
              • 前100名系数均在 <span className="font-semibold text-[#A80000]">2.8x</span> 以上，形成"核心圈"<br/>
              • 500名开外系数快速向 <span className="font-semibold">1.0x</span> 靠拢，体现公平性
            </p>
          </div>
        </div>
      </div>

      {/* 对照表 */}
      <div className="px-4">
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {/* 表头 */}
          <div className="bg-gradient-to-r from-[#A80000] to-[#8B0000] text-white px-4 py-3 grid grid-cols-3 gap-2 text-center font-semibold text-sm">
            <div>排名</div>
            <div>系数</div>
            <div>排名</div>
          </div>
          
          {/* 表格内容 - 三列布局 */}
          <div className="divide-y divide-gray-100">
            {Array.from({ length: Math.ceil(multiplierData.length / 3) }, (_, rowIndex) => {
              const startIndex = rowIndex * 3;
              const rowData = multiplierData.slice(startIndex, startIndex + 3);
              
              return (
                <div key={rowIndex} className="grid grid-cols-3 gap-2 px-4 py-2.5 hover:bg-gray-50 transition-colors">
                  {rowData.map((item, colIndex) => (
                    <div key={colIndex} className="flex items-center justify-between text-xs">
                      <span className="text-gray-600 font-medium">No.{item.rank}</span>
                      <span className="font-bold text-[#C5B358] font-mono">{item.multiplier}x</span>
                    </div>
                  ))}
                  {/* 填充空白列 */}
                  {rowData.length < 3 && Array.from({ length: 3 - rowData.length }, (_, i) => (
                    <div key={`empty-${i}`} />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 底部说明 */}
      <div className="px-4 py-4 text-center text-xs text-gray-500">
        <p>共 666 个席位 · 系数永久锁定</p>
      </div>
    </div>
  );
};

export default CapitalMultiplierTable;
