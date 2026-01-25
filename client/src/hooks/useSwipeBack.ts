import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';

interface SwipeBackOptions {
  /**
   * 返回的目标路径
   */
  backPath: string;
  /**
   * 触发返回的最小滑动距离（像素）
   * @default 100
   */
  threshold?: number;
  /**
   * 是否启用手势
   * @default true
   */
  enabled?: boolean;
}

/**
 * 右划返回手势 Hook
 * 在屏幕任意位置向右滑动时返回到指定页面
 */
export function useSwipeBack(options: SwipeBackOptions) {
  const {
    backPath,
    threshold = 100,
    enabled = true,
  } = options;

  const [, navigate] = useLocation();
  const [swipeProgress, setSwipeProgress] = useState(0);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isSwiping = useRef(false);
  const isEdgeSwipe = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      touchStartX.current = touch.clientX;
      touchStartY.current = touch.clientY;
      // 允许在屏幕任意位置开始触摸
      isEdgeSwipe.current = true;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isEdgeSwipe.current) return;

      const touch = e.touches[0];
      const deltaX = touch.clientX - touchStartX.current;
      const deltaY = touch.clientY - touchStartY.current;

      // 只有当水平滑动距离大于垂直滑动距离时才认为是横向滑动
      if (Math.abs(deltaX) > Math.abs(deltaY) && deltaX > 0) {
        isSwiping.current = true;
        
        // 计算滑动进度（0-1）
        const progress = Math.min(deltaX / threshold, 1);
        setSwipeProgress(progress);

        // 立即阻止默认行为，确保手势优先
        e.preventDefault();
      }
    };

    const handleTouchEnd = () => {
      if (isSwiping.current && swipeProgress >= 1) {
        // 达到阈值，执行返回
        navigate(backPath);
      }

      // 重置状态
      isSwiping.current = false;
      isEdgeSwipe.current = false;
      setSwipeProgress(0);
    };

    // 添加事件监听
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    document.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [enabled, backPath, threshold, navigate, swipeProgress]);

  return {
    /**
     * 当前滑动进度（0-1）
     */
    swipeProgress,
    /**
     * 是否正在滑动
     */
    isSwiping: isSwiping.current,
  };
}
