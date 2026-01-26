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
  const swipeStartRef = useRef({ x: 0, y: 0, time: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // 计算当前页面的基础偏移量
  const baseOffset = currentView === "list" ? 0 : -window.innerWidth;

  // 处理触摸开始
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    swipeStartRef.current = { 
      x: touch.clientX, 
      y: touch.clientY,
      time: Date.now()
    };
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
      // 只允许详情页向右滑动返回列表页
      // 列表页不允许滑动
      if (currentView === "detail" && deltaX > 0) {
        e.preventDefault();
        setSwipeOffset(Math.min(deltaX, window.innerWidth));
      }
    }
  };

  // 处理触摸结束
  const handleTouchEnd = () => {
    setIsDragging(false);

    // 计算滑动速度（像素/毫秒）
    const deltaTime = Date.now() - swipeStartRef.current.time;
    const velocity = swipeOffset / deltaTime;

    // 降低距离阈值到15%，或者快速滑动（速度>0.5px/ms）也能触发
    const distanceThreshold = window.innerWidth * 0.15;
    const velocityThreshold = 0.5;

    // 只处理详情页向右滑动返回列表页
    if (currentView === "detail" && 
        (swipeOffset > distanceThreshold || velocity > velocityThreshold)) {
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
