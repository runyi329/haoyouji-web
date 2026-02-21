import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { ChevronLeft, X } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function LedgerImages() {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  const ledgerId = parseInt(id || "0");
  
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);

  // 获取账本所有图片
  const { data: imagesData, isLoading } = trpc.ledger.getImages.useQuery({
    ledgerId,
  });

  const images = imagesData || [];

  // 打开图片查看器
  const openImageViewer = (index: number) => {
    setSelectedImageIndex(index);
  };

  // 关闭图片查看器
  const closeImageViewer = () => {
    setSelectedImageIndex(null);
  };

  // 上一张图片
  const previousImage = () => {
    if (selectedImageIndex !== null && selectedImageIndex > 0) {
      setSelectedImageIndex(selectedImageIndex - 1);
    }
  };

  // 下一张图片
  const nextImage = () => {
    if (selectedImageIndex !== null && selectedImageIndex < images.length - 1) {
      setSelectedImageIndex(selectedImageIndex + 1);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="bg-gradient-to-r from-[#A80000] to-[#d44] text-white p-3 flex items-center">
        <button onClick={() => setLocation(`/ledger/${id}/settings`)}>
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="flex-1 text-center text-base font-semibold pr-5">
          账本图片查看
        </h1>
      </div>

      {/* 图片网格 */}
      <div className="p-4">
        {isLoading ? (
          <div className="text-center py-12 text-gray-500">加载中...</div>
        ) : images.length === 0 ? (
          <div className="text-center py-12 text-gray-500">暂无图片</div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {images.map((image, index) => (
              <div
                key={image.id}
                className="aspect-square bg-gray-200 rounded-lg overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => openImageViewer(index)}
              >
                <img
                  src={image.imageUrl}
                  alt={`账单图片 ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 图片查看器 */}
      {selectedImageIndex !== null && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
          {/* 顶部工具栏 */}
          <div className="flex items-center justify-between p-4 text-white">
            <span className="text-sm">
              {selectedImageIndex + 1} / {images.length}
            </span>
            <button onClick={closeImageViewer}>
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* 图片显示区域 */}
          <div className="flex-1 flex items-center justify-center relative">
            <img
              src={images[selectedImageIndex].imageUrl}
              alt={`账单图片 ${selectedImageIndex + 1}`}
              className="max-w-full max-h-full object-contain"
            />

            {/* 左右切换按钮 */}
            {selectedImageIndex > 0 && (
              <button
                onClick={previousImage}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}
            {selectedImageIndex < images.length - 1 && (
              <button
                onClick={nextImage}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            )}
          </div>

          {/* 图片信息 */}
          <div className="p-4 text-white text-sm">
            <div>金额：{images[selectedImageIndex].amount}</div>
            <div>分类：{images[selectedImageIndex].category}</div>
            <div>日期：{images[selectedImageIndex].date}</div>
            {images[selectedImageIndex].description && (
              <div>备注：{images[selectedImageIndex].description}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
