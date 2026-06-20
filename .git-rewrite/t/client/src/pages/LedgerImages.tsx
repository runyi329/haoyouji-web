import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

export default function LedgerImages() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const ledgerId = Number(id);
  
  // 直接复用 getTransactions API，它已经能正确返回 imageUrl
  const { data: transactionsData, isLoading } = trpc.ledger.getTransactions.useQuery({
    ledgerId,
    limit: 500,
  });
  
  // 从所有交易记录中提取有图片的记录
  const imagesData = (() => {
    if (!transactionsData) return [];
    const images: Array<{
      id: number;
      imageUrl: string;
      amount: number;
      type: string;
      category: string;
      date: string;
      description?: string;
    }> = [];
    
    transactionsData.forEach((dayGroup: any) => {
      dayGroup.records.forEach((record: any) => {
        if (record.imageUrl && String(record.imageUrl).trim() !== '') {
          images.push({
            id: record.id,
            imageUrl: record.imageUrl,
            amount: record.amount,
            type: record.type,
            category: record.category,
            date: dayGroup.date,
            description: record.description,
          });
        }
      });
    });
    
    return images;
  })();
  
  // 放大查看状态
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  
  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      {/* 顶部导航 */}
      <div className="bg-white px-4 py-3 flex items-center border-b border-gray-100 sticky top-0 z-10">
        <button onClick={() => setLocation(`/ledger/${ledgerId}/settings`)} className="mr-3">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="text-base font-medium">账本图片查看</h1>
        <span className="ml-2 text-xs text-gray-400">共 {imagesData.length} 张</span>
      </div>
      
      {/* 内容区 */}
      <div className="p-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-sm text-gray-400">加载中...</div>
          </div>
        ) : imagesData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <svg className="w-16 h-16 text-gray-300 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <div className="text-sm text-gray-400">暂无图片</div>
          </div>
        ) : (
          /* 图片网格 - 3列 */
          <div className="grid grid-cols-3 gap-1.5">
            {imagesData.map((item, index) => (
              <div
                key={item.id}
                className="relative aspect-square bg-white rounded overflow-hidden cursor-pointer"
                onClick={() => setSelectedIndex(index)}
              >
                <img
                  src={item.imageUrl}
                  alt={item.category}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                {/* 底部金额标签 */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent px-1.5 py-1">
                  <span className={`text-xs font-medium ${item.type === 'income' ? 'text-green-300' : 'text-white'}`}>
                    {item.type === 'income' ? '+' : '-'}{item.amount.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* 全屏图片查看器 */}
      {selectedIndex !== null && imagesData[selectedIndex] && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
          {/* 顶部栏 */}
          <div className="flex items-center justify-between px-4 py-3">
            <button onClick={() => setSelectedIndex(null)} className="text-white">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
            <span className="text-white text-sm">{selectedIndex + 1} / {imagesData.length}</span>
            <div className="w-6" />
          </div>
          
          {/* 图片区域 */}
          <div className="flex-1 flex items-center justify-center relative px-2">
            {/* 左箭头 */}
            {selectedIndex > 0 && (
              <button
                onClick={() => setSelectedIndex(selectedIndex - 1)}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center bg-white/20 rounded-full z-10"
              >
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
            )}
            
            <img
              src={imagesData[selectedIndex].imageUrl}
              alt="查看图片"
              className="max-w-full max-h-full object-contain"
            />
            
            {/* 右箭头 */}
            {selectedIndex < imagesData.length - 1 && (
              <button
                onClick={() => setSelectedIndex(selectedIndex + 1)}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center bg-white/20 rounded-full z-10"
              >
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            )}
          </div>
          
          {/* 底部信息 */}
          <div className="px-4 py-4 bg-black/80">
            <div className="flex items-center justify-between mb-1">
              <span className="text-white text-sm">{imagesData[selectedIndex].category}</span>
              <span className={`text-sm font-medium ${imagesData[selectedIndex].type === 'income' ? 'text-green-400' : 'text-red-400'}`}>
                {imagesData[selectedIndex].type === 'income' ? '+' : '-'}{imagesData[selectedIndex].amount.toFixed(2)}
              </span>
            </div>
            <div className="text-gray-400 text-xs">{imagesData[selectedIndex].date}</div>
            {imagesData[selectedIndex].description && (
              <div className="text-gray-300 text-xs mt-1">{imagesData[selectedIndex].description}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
