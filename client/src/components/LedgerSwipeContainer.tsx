import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";

interface LedgerSwipeContainerProps {
  listPage: React.ReactNode;
  detailPage: React.ReactNode;
  currentView: "list" | "detail";
  onViewChange: (view: "list" | "detail") => void;
}

export default function LedgerSwipeContainer({
  listPage,
  detailPage,
  currentView,
  onViewChange,
}: LedgerSwipeContainerProps) {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const swipeStartRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // 计算当前页面的基础偏移量
  const baseOffset = currentView === "list" ? 0 : -window.innerWidth;

  // 处理触摸开始
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
    setIsDragging(true);
  };

  // 处理触摸移动
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - swipeStartRef.current.x;
    const deltaY = touch.clientY - swipeStartRef.current.y;

    // 只处理横向滑动
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      e.preventDefault();

      // 列表页：只允许向左滑动（deltaX < 0）
      // 详情页：只允许向右滑动（deltaX > 0）
      if (currentView === "list" && deltaX < 0) {
        setSwipeOffset(Math.max(deltaX, -window.innerWidth));
      } else if (currentView === "detail" && deltaX > 0) {
        setSwipeOffset(Math.min(deltaX, window.innerWidth));
      }
    }
  };

  // 处理触摸结束
  const handleTouchEnd = () => {
    setIsDragging(false);

    // 如果滑动距离超过屏幕宽度的30%，切换页面
    const threshold = window.innerWidth * 0.3;

    if (currentView === "list" && Math.abs(swipeOffset) > threshold) {
      // 列表页向左滑动，进入详情页
      onViewChange("detail");
    } else if (currentView === "detail" && swipeOffset > threshold) {
      // 详情页向右滑动，返回列表页
      onViewChange("list");
    }

    // 重置滑动偏移
    setSwipeOffset(0);
  };

  // 当视图切换时，重置滑动状态
  useEffect(() => {
    setSwipeOffset(0);
    setIsDragging(false);
  }, [currentView]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* 列表页 */}
      <div
        className="absolute inset-0 w-full h-full"
        style={{
          transform: `translateX(${baseOffset + swipeOffset}px)`,
          transition: isDragging ? "none" : "transform 0.3s ease-out",
          zIndex: currentView === "list" ? 10 : 5,
        }}
      >
        {listPage}
      </div>

      {/* 详情页 */}
      <div
        className="absolute inset-0 w-full h-full"
        style={{
          transform: `translateX(${baseOffset + window.innerWidth + swipeOffset}px)`,
          transition: isDragging ? "none" : "transform 0.3s ease-out",
          zIndex: currentView === "detail" ? 10 : 5,
        }}
      >
        {detailPage}
      </div>
    </div>
  );
}
