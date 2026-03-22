/**
 * 素材展示分享页面（公开，无需登录）
 * 路径: /beauty/showcase/share?token=xxx&type=photo|ppt
 */
import { trpc } from "@/lib/trpc";
import { Loader2, ImageIcon, Presentation, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";

// ===== 照片分享页 =====
function PhotoSharePage({ token }: { token: string }) {
  const { data: group, isLoading, error } = trpc.beauty.showcase.getByShareToken.useQuery({ token });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen" style={{ backgroundColor: "#FFF5F7" }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#E91E63" }} />
        <p className="mt-3 text-sm text-gray-500">加载中...</p>
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen" style={{ backgroundColor: "#FFF5F7" }}>
        <div className="w-16 h-16 rounded-full bg-pink-100 flex items-center justify-center mb-4">
          <ImageIcon className="w-7 h-7" style={{ color: "#E91E63" }} />
        </div>
        <p className="text-base font-medium text-gray-700">链接无效或已过期</p>
        <p className="text-sm text-gray-400 mt-1">请联系分享者重新获取链接</p>
      </div>
    );
  }

  const photos = group.photos || [];

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#FFF5F7" }}>
      {/* 顶部标题栏 */}
      <div
        className="sticky top-0 z-50 px-4 pt-3 pb-3"
        style={{ background: "linear-gradient(135deg, #E91E63 0%, #F48FB1 100%)" }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
            <ImageIcon className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-lg font-bold text-white tracking-wide flex-1">
            {group.title || "照片展示"}
          </h1>
          <span className="text-white/70 text-xs">{photos.length}张</span>
        </div>
      </div>

      {/* 照片展示 - 上下排列满屏大图 */}
      <div className="pt-0 pb-4">
        {photos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="text-sm text-gray-400">暂无照片</p>
          </div>
        ) : (
          <div>
            {photos.map((photo, index) => (
              <div key={photo.id} className="w-full">
                <img
                  src={photo.imageUrl}
                  alt=""
                  className="w-full block"
                  style={{ display: 'block', maxWidth: '100%' }}
                  loading={index === 0 ? 'eager' : 'lazy'}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部品牌水印 */}
      <div className="fixed bottom-0 left-0 right-0 py-3 text-center bg-white/80 backdrop-blur-sm border-t border-pink-100">
        <p className="text-xs text-gray-400">由 <span style={{ color: "#E91E63" }}>奢贝美容院</span> 分享</p>
      </div>
    </div>
  );
}

// ===== PPT分享页 =====
function PptSharePage({ token }: { token: string }) {
  const { data: group, isLoading, error } = trpc.beauty.pptCompare.getByShareToken.useQuery({ token });
  const [currentPage, setCurrentPage] = useState(0);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen" style={{ backgroundColor: "#FFF5F7" }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#E91E63" }} />
        <p className="mt-3 text-sm text-gray-500">加载中...</p>
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen" style={{ backgroundColor: "#FFF5F7" }}>
        <div className="w-16 h-16 rounded-full bg-pink-100 flex items-center justify-center mb-4">
          <Presentation className="w-7 h-7" style={{ color: "#E91E63" }} />
        </div>
        <p className="text-base font-medium text-gray-700">链接无效或已过期</p>
        <p className="text-sm text-gray-400 mt-1">请联系分享者重新获取链接</p>
      </div>
    );
  }

  const pagesA = group.pagesA || [];
  const pagesB = group.pagesB || [];
  const totalPages = Math.max(pagesA.length, pagesB.length);
  const pageA = pagesA[currentPage];
  const pageB = pagesB[currentPage];

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#FFF5F7" }}>
      {/* 顶部标题栏 */}
      <div
        className="sticky top-0 z-50 px-4 pt-3 pb-3"
        style={{ background: "linear-gradient(135deg, #E91E63 0%, #F48FB1 100%)" }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
            <Presentation className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-lg font-bold text-white tracking-wide flex-1">
            {group.title || "PPT对比"}
          </h1>
          {totalPages > 0 && (
            <span className="text-white/70 text-xs">{currentPage + 1}/{totalPages}</span>
          )}
        </div>
      </div>

      {/* PPT对比展示 */}
      <div className="pt-4 pb-20 px-4">
        {totalPages === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="text-sm text-gray-400">暂无内容</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* PPT-A */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                  style={{ background: "linear-gradient(135deg, #E91E63 0%, #F48FB1 100%)" }}
                >
                  {group.titleA || "PPT-A"}
                </span>
              </div>
              {pageA ? (
                <div className="rounded-xl overflow-hidden bg-gray-100 w-full" style={{ aspectRatio: "16/9" }}>
                  <img src={pageA.imageUrl} alt="" className="w-full h-full object-contain" />
                </div>
              ) : (
                <div className="rounded-xl bg-gray-100 w-full flex items-center justify-center" style={{ aspectRatio: "16/9" }}>
                  <p className="text-xs text-gray-400">此页无内容</p>
                </div>
              )}
            </div>

            {/* PPT-B */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                  style={{ background: "linear-gradient(135deg, #9C27B0 0%, #CE93D8 100%)" }}
                >
                  {group.titleB || "PPT-B"}
                </span>
              </div>
              {pageB ? (
                <div className="rounded-xl overflow-hidden bg-gray-100 w-full" style={{ aspectRatio: "16/9" }}>
                  <img src={pageB.imageUrl} alt="" className="w-full h-full object-contain" />
                </div>
              ) : (
                <div className="rounded-xl bg-gray-100 w-full flex items-center justify-center" style={{ aspectRatio: "16/9" }}>
                  <p className="text-xs text-gray-400">此页无内容</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 底部翻页控制 */}
      {totalPages > 1 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-sm border-t border-pink-100 px-4 py-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
              disabled={currentPage === 0}
              className="w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-30"
              style={{ background: "linear-gradient(135deg, #E91E63 0%, #F48FB1 100%)" }}
            >
              <ChevronLeft className="w-5 h-5 text-white" />
            </button>
            <div className="flex gap-1.5">
              {Array.from({ length: Math.min(totalPages, 10) }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentPage(i)}
                  className="w-2 h-2 rounded-full transition-all"
                  style={{
                    background: i === currentPage ? "#E91E63" : "#F8BBD0",
                    transform: i === currentPage ? "scale(1.3)" : "scale(1)",
                  }}
                />
              ))}
              {totalPages > 10 && (
                <span className="text-xs text-gray-400 self-center ml-1">...</span>
              )}
            </div>
            <button
              onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
              disabled={currentPage === totalPages - 1}
              className="w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-30"
              style={{ background: "linear-gradient(135deg, #E91E63 0%, #F48FB1 100%)" }}
            >
              <ChevronRight className="w-5 h-5 text-white" />
            </button>
          </div>
          <p className="text-center text-xs text-gray-400 mt-1">由 <span style={{ color: "#E91E63" }}>奢贝美容院</span> 分享</p>
        </div>
      )}
    </div>
  );
}

// ===== 主入口 =====
export default function BeautyShowcaseSharePage() {
  // wouter的useLocation只返回pathname，不包含query string
  // 必须用window.location.search获取参数
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") || "";
  const type = params.get("type") || "photo";

  if (!token) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen" style={{ backgroundColor: "#FFF5F7" }}>
        <p className="text-base font-medium text-gray-700">链接无效</p>
      </div>
    );
  }

  if (type === "ppt") {
    return <PptSharePage token={token} />;
  }
  return <PhotoSharePage token={token} />;
}
