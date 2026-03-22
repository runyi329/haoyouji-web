/**
 * 素材分享页面（公开，无需登录）
 * 路径: /beauty/material/share?token=xxx
 */
import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Loader2, ImageIcon } from "lucide-react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";

// ===== 自适应比例的照片卡片（带文字说明） =====
function AutoAspectPhotoWithCaption({
  src,
  caption,
  fixedHeight = 260,
}: {
  src: string;
  caption?: string | null;
  fixedHeight?: number;
}) {
  const [photoDims, setPhotoDims] = useState<{ w: number; h: number } | null>(null);

  const onLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setPhotoDims({ w: img.naturalWidth, h: img.naturalHeight });
  }, []);

  const computedWidth = photoDims
    ? Math.round((photoDims.w / photoDims.h) * fixedHeight)
    : fixedHeight * 0.75;

  return (
    <div className="flex flex-col flex-shrink-0" style={{ width: `${computedWidth}px` }}>
      <div
        className="rounded-xl overflow-hidden bg-gray-100"
        style={{ width: `${computedWidth}px`, height: `${fixedHeight}px` }}
      >
        <img
          src={src}
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
          decoding="async"
          onLoad={onLoad}
        />
      </div>
      {caption && (
        <p className="text-xs text-gray-600 mt-1.5 px-0.5 leading-snug line-clamp-2">
          {caption}
        </p>
      )}
    </div>
  );
}

// ===== 照片分享页 =====
function MaterialSharePage({ token }: { token: string }) {
  const { data: group, isLoading, error } = trpc.beauty.material.getByShareToken.useQuery({ token });

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
            {group.title || "素材展示"}
          </h1>
          <span className="text-white/70 text-xs">{photos.length}张</span>
        </div>
      </div>

      {/* 照片展示 */}
      <div className="pt-4 pb-20">
        {photos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-full bg-pink-100 flex items-center justify-center mb-4">
              <ImageIcon className="w-7 h-7" style={{ color: "#E91E63" }} />
            </div>
            <p className="text-sm text-gray-400">暂无照片</p>
          </div>
        ) : (
          <div className="px-4">
            <Carousel opts={{ align: "start", dragFree: true }}>
              <CarouselContent className="-ml-3">
                {photos.map((photo) => (
                  <CarouselItem key={photo.id} className="pl-3 basis-auto">
                    <AutoAspectPhotoWithCaption
                      src={photo.imageUrl}
                      caption={photo.caption}
                      fixedHeight={260}
                    />
                  </CarouselItem>
                ))}
              </CarouselContent>
            </Carousel>
            {photos.length > 1 && (
              <p className="text-xs text-gray-400 text-center mt-3">
                左右滑动查看全部照片（共{photos.length}张）
              </p>
            )}
          </div>
        )}
      </div>

      {/* 底部署名 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-sm border-t border-pink-100 px-4 py-3 text-center">
        <p className="text-xs text-gray-400">
          由 <span style={{ color: "#E91E63" }}>奢贝美容院</span> 分享
        </p>
      </div>
    </div>
  );
}

// ===== 主入口 =====
export default function BeautyMaterialSharePage() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") || "";

  if (!token) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen" style={{ backgroundColor: "#FFF5F7" }}>
        <p className="text-base font-medium text-gray-700">链接无效</p>
      </div>
    );
  }

  return <MaterialSharePage token={token} />;
}
