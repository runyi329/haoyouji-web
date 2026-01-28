import { useEffect, useRef } from 'react';

interface SwipeGestureOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number; // 触发滑动的最小距离(px)
  velocityThreshold?: number; // 触发滑动的最小速度(px/ms)
}

export function useSwipeGesture(options: SwipeGestureOptions) {
  const {
    onSwipeLeft,
    onSwipeRight,
    threshold = 100,
    velocityThreshold = 0.3,
  } = options;

  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const touchStartTime = useRef<number>(0);
  const isSwiping = useRef<boolean>(false);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      touchStartTime.current = Date.now();
      isSwiping.current = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchStartX.current) return;

      const touchCurrentX = e.touches[0].clientX;
      const touchCurrentY = e.touches[0].clientY;
      
      const deltaX = touchCurrentX - touchStartX.current;
      const deltaY = touchCurrentY - touchStartY.current;

      // 判断是否为水平滑动(水平距离大于垂直距离)
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
        isSwiping.current = true;
        // 阻止垂直滚动
        e.preventDefault();
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStartX.current || !isSwiping.current) {
        touchStartX.current = 0;
        touchStartY.current = 0;
        return;
      }

      const touchEndX = e.changedTouches[0].clientX;
      const touchEndTime = Date.now();
      
      const deltaX = touchEndX - touchStartX.current;
      const deltaTime = touchEndTime - touchStartTime.current;
      const velocity = Math.abs(deltaX) / deltaTime;

      // 判断滑动方向和距离
      if (Math.abs(deltaX) > threshold || velocity > velocityThreshold) {
        if (deltaX > 0 && onSwipeRight) {
          // 向右滑动
          onSwipeRight();
        } else if (deltaX < 0 && onSwipeLeft) {
          // 向左滑动
          onSwipeLeft();
        }
      }

      // 重置
      touchStartX.current = 0;
      touchStartY.current = 0;
      isSwiping.current = false;
    };

    // 添加事件监听器,使用passive: false以允许preventDefault
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [onSwipeLeft, onSwipeRight, threshold, velocityThreshold]);
}
