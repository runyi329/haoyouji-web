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
  
  // 使用编号排名（seatNumber），而不是持股排名
  const currentSeatNumber = enhanced?.dynamicLeverage?.seatNumber || null;
  const isInvestor = currentSeatNumber !== null && currentSeatNumber > 0;
  
  // 如果是股东，使用实际编号；如果不是，显示"当前加入"位置（假设为下一个编号）
  const displayRank = isInvestor ? currentSeatNumber : (enhanced?.ranking?.totalInvestors || 0) + 1;
  const currentMultiplier = calculateMultiplier(displayRank);

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
              {isInvestor 
                ? `您的编号：第 ${currentSeatNumber} 位` 
                : '如果您现在成为股东（当前加入）'}
            </p>
            <div className="text-4xl font-bold text-[#C5B358] font-mono">
              {currentMultiplier.toFixed(4)}x
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {isInvestor ? '已锁定 · 永久有效' : '系数将在投资后锁定'}
            </p>
          </div>
        </div>
      </div>

      {/* 专业投行风格曲线图 - 去掉内层容器框，Y轴拉长到2倍 */}
      <div className="px-4 pb-4">
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-[#A80000] mb-4">系数曲线图</h3>
          <div className="relative" style={{ height: '400px' }}>
            <svg width="100%" height="100%" viewBox="0 0 500 400" preserveAspectRatio="xMidYMid meet">
              <defs>
                {/* 渐变定义 - 曲线下方阴影 */}
                <linearGradient id="curveGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#A80000" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#A80000" stopOpacity="0.05" />
                </linearGradient>
                
                {/* 网格线图案 */}
                <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                  <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#E5E7EB" strokeWidth="0.5" strokeDasharray="2,2" />
                </pattern>
              </defs>
              
              {/* 背景网格 */}
              <rect x="50" y="20" width="430" height="300" fill="url(#grid)" />
              
              {/* Y轴 */}
              <line x1="50" y1="20" x2="50" y2="320" stroke="#374151" strokeWidth="2" />
              {/* X轴 */}
              <line x1="50" y1="320" x2="480" y2="320" stroke="#374151" strokeWidth="2" />
              
              {/* Y轴刻度、标签和网格线 - Y轴拉长到2倍（300px） */}
              <text x="35" y="25" fontSize="11" fill="#374151" textAnchor="end" fontWeight="600">3.0</text>
              <line x1="45" y1="20" x2="50" y2="20" stroke="#374151" strokeWidth="2" />
              <line x1="50" y1="20" x2="480" y2="20" stroke="#E5E7EB" strokeWidth="1" strokeDasharray="4,4" />
              
              <text x="35" y="95" fontSize="11" fill="#6B7280" textAnchor="end" fontWeight="500">2.5</text>
              <line x1="45" y1="95" x2="50" y2="95" stroke="#6B7280" strokeWidth="1" />
              <line x1="50" y1="95" x2="480" y2="95" stroke="#E5E7EB" strokeWidth="1" strokeDasharray="4,4" />
              
              <text x="35" y="170" fontSize="11" fill="#6B7280" textAnchor="end" fontWeight="500">2.0</text>
              <line x1="45" y1="170" x2="50" y2="170" stroke="#6B7280" strokeWidth="1" />
              <line x1="50" y1="170" x2="480" y2="170" stroke="#E5E7EB" strokeWidth="1" strokeDasharray="4,4" />
              
              <text x="35" y="245" fontSize="11" fill="#6B7280" textAnchor="end" fontWeight="500">1.5</text>
              <line x1="45" y1="245" x2="50" y2="245" stroke="#6B7280" strokeWidth="1" />
              <line x1="50" y1="245" x2="480" y2="245" stroke="#E5E7EB" strokeWidth="1" strokeDasharray="4,4" />
              
              <text x="35" y="320" fontSize="11" fill="#374151" textAnchor="end" fontWeight="600">1.0</text>
              <line x1="45" y1="320" x2="50" y2="320" stroke="#374151" strokeWidth="2" />
              
              {/* X轴刻度和标签 - 更细的颗粒度 */}
              {[1, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 660].map((rank, idx) => {
                const x = 50 + ((rank - 1) / 659) * 430;
                const isMainTick = rank === 1 || rank === 660 || rank % 100 === 0;
                return (
                  <g key={rank}>
                    <line 
                      x1={x} 
                      y1="320" 
                      x2={x} 
                      y2={isMainTick ? "325" : "322"} 
                      stroke={isMainTick ? "#374151" : "#6B7280"} 
                      strokeWidth={isMainTick ? "2" : "1"} 
                    />
                    {isMainTick && (
                      <text 
                        x={x} 
                        y="340" 
                        fontSize="11" 
                        fill="#374151" 
                        textAnchor="middle" 
                        fontWeight="600"
                      >
                        {rank}
                      </text>
                    )}
                    {!isMainTick && rank % 50 === 0 && (
                      <text 
                        x={x} 
                        y="340" 
                        fontSize="10" 
                        fill="#6B7280" 
                        textAnchor="middle" 
                        fontWeight="500"
                      >
                        {rank}
                      </text>
                    )}
                    {/* 垂直网格线 */}
                    {isMainTick && (
                      <line 
                        x1={x} 
                        y1="20" 
                        x2={x} 
                        y2="320" 
                        stroke="#E5E7EB" 
                        strokeWidth="1" 
                        strokeDasharray="4,4" 
                      />
                    )}
                  </g>
                );
              })}
              
              {/* 轴标签 */}
              <text x="265" y="365" fontSize="12" fill="#374151" textAnchor="middle" fontWeight="600">编号排名</text>
              <text x="15" y="170" fontSize="12" fill="#374151" textAnchor="middle" fontWeight="600" transform="rotate(-90 15 170)">系数倍数</text>
              
              {/* 绘制曲线下方的渐变填充 */}
              <path
                d={(() => {
                  const points: string[] = ['M 50 320']; // 从左下角开始
                  for (let rank = 1; rank <= 660; rank += 3) {
                    const x = 50 + ((rank - 1) / 659) * 430;
                    const multiplier = calculateMultiplier(rank);
                    const y = 320 - ((multiplier - 1.0) / 2.0) * 300;
                    points.push(`L ${x} ${y}`);
                  }
                  points.push('L 480 320'); // 到右下角
                  points.push('Z'); // 闭合路径
                  return points.join(' ');
                })()}
                fill="url(#curveGradient)"
              />
              
              {/* 绘制曲线 */}
              <path
                d={(() => {
                  const points: string[] = [];
                  for (let rank = 1; rank <= 660; rank += 3) {
                    const x = 50 + ((rank - 1) / 659) * 430;
                    const multiplier = calculateMultiplier(rank);
                    const y = 320 - ((multiplier - 1.0) / 2.0) * 300;
                    points.push(`${rank === 1 ? 'M' : 'L'} ${x} ${y}`);
                  }
                  return points.join(' ');
                })()}
                fill="none"
                stroke="#A80000"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              
              {/* 标注当前用户位置或当前加入位置 */}
              {displayRank <= 660 && (
                <>
                  {/* 垂直虚线 */}
                  <line
                    x1={50 + ((displayRank - 1) / 659) * 430}
                    y1="20"
                    x2={50 + ((displayRank - 1) / 659) * 430}
                    y2="320"
                    stroke="#FF0000"
                    strokeWidth="1.5"
                    strokeDasharray="5,3"
                  />
                  
                  {/* 红色圆点 */}
                  <circle
                    cx={50 + ((displayRank - 1) / 659) * 430}
                    cy={320 - ((currentMultiplier - 1.0) / 2.0) * 300}
                    r="5"
                    fill="#FF0000"
                    stroke="#FFF"
                    strokeWidth="2"
                  />
                  
                  {/* 标签背景 */}
                  <rect
                    x={50 + ((displayRank - 1) / 659) * 430 - 35}
                    y={320 - ((currentMultiplier - 1.0) / 2.0) * 300 - 25}
                    width={70}
                    height={18}
                    fill="#FF0000"
                    rx="3"
                  />
                  
                  {/* 标签文字 - 改为显示当前系数 */}
                  <text
                    x={50 + ((displayRank - 1) / 659) * 430}
                    y={320 - ((currentMultiplier - 1.0) / 2.0) * 300 - 13}
                    fontSize="10"
                    fill="#FFF"
                    textAnchor="middle"
                    fontWeight="bold"
                  >
                    {currentMultiplier.toFixed(4)}x
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
            <span className="font-semibold text-sm">编号排名</span>
            <span className="font-semibold text-sm">系数</span>
          </div>
          
          {/* 表格内容 */}
          <div className="divide-y divide-gray-100">
            {multiplierData.map((item) => (
              <div 
                key={item.rank} 
                className={`px-4 py-3 flex justify-between items-center hover:bg-gray-50 transition-colors ${
                  isInvestor && item.rank === currentSeatNumber ? 'bg-red-50' : ''
                }`}
              >
                <span className="text-sm text-gray-700 font-medium">
                  第 {item.rank} 名
                  {isInvestor && item.rank === currentSeatNumber && (
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
        <p>共 660 个席位 · 系数永久锁定 · 按投资时间先后排序</p>
      </div>
    </div>
  );
};

export default CapitalMultiplierTable;
