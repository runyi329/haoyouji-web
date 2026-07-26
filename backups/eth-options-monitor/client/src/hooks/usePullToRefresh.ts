import { useRef, useState, useCallback, useEffect } from "react";

interface UsePullToRefreshOptions {
  onRefresh: () => void | Promise<void>;
  threshold?: number;      // 触发刷新所需的下拉距离（px），默认 64
  maxPull?: number;        // 最大下拉距离（px），默认 100
  disabled?: boolean;      // 是否禁用
}

export type PullState = "idle" | "pulling" | "ready" | "refreshing";

interface UsePullToRefreshReturn {
  pullState: PullState;
  pullDistance: number;    // 0 ~ maxPull，用于驱动指示器动画
  progress: number;        // 0 ~ 1，pullDistance / threshold
}

export function usePullToRefresh({
  onRefresh,
  threshold = 64,
  maxPull = 100,
  disabled = false,
}: UsePullToRefreshOptions): UsePullToRefreshReturn {
  const [pullState, setPullState] = useState<PullState>("idle");
  const [pullDistance, setPullDistance] = useState(0);

  const startYRef = useRef<number | null>(null);
  const isRefreshingRef = useRef(false);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (disabled || isRefreshingRef.current) return;
    // 只有页面在顶部时才启动下拉检测
    if (window.scrollY > 0) return;
    startYRef.current = e.touches[0].clientY;
  }, [disabled]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (disabled || isRefreshingRef.current || startYRef.current === null) return;
    const dy = e.touches[0].clientY - startYRef.current;
    if (dy <= 0) {
      // 向上滑，重置
      startYRef.current = null;
      setPullState("idle");
      setPullDistance(0);
      return;
    }
    // 阻止原生滚动（仅在下拉时）
    if (window.scrollY === 0 && dy > 0) {
      e.preventDefault();
    }
    // 阻尼：越拉越难
    const damped = Math.min(dy * 0.5, maxPull);
    setPullDistance(damped);
    setPullState(damped >= threshold ? "ready" : "pulling");
  }, [disabled, threshold, maxPull]);

  const handleTouchEnd = useCallback(async () => {
    if (disabled || startYRef.current === null) return;
    startYRef.current = null;

    if (pullState === "ready" && !isRefreshingRef.current) {
      isRefreshingRef.current = true;
      setPullState("refreshing");
      setPullDistance(threshold * 0.6); // 保持一个小的指示高度
      try {
        await onRefresh();
      } finally {
        // 稍作停留让用户感知到刷新完成
        setTimeout(() => {
          isRefreshingRef.current = false;
          setPullState("idle");
          setPullDistance(0);
        }, 600);
      }
    } else {
      setPullState("idle");
      setPullDistance(0);
    }
  }, [disabled, pullState, threshold, onRefresh]);

  useEffect(() => {
    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  const progress = Math.min(pullDistance / threshold, 1);
  return { pullState, pullDistance, progress };
}
