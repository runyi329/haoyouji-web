import { useEffect, useRef } from 'react';

interface QuoteRefreshDotProps {
  refreshKey: string | null;
  enabled?: boolean;
}

/** 行情成功更新的轻反馈；不跟随请求开始/结束反复闪烁，也不表示价格涨跌。 */
export function QuoteRefreshDot({ refreshKey, enabled = true }: QuoteRefreshDotProps) {
  const dotRef = useRef<HTMLSpanElement>(null);
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      lastKeyRef.current = null;
      return;
    }
    if (!refreshKey || refreshKey === lastKeyRef.current) return;
    lastKeyRef.current = refreshKey;
    const dot = dotRef.current;
    if (!dot || typeof dot.animate !== 'function') return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    try {
      const animation = dot.animate([
        { opacity: 0.45, boxShadow: '0 0 0 0 rgba(34, 160, 107, 0)' },
        { opacity: 1, boxShadow: '0 0 5px 2px rgba(34, 160, 107, 0.28)', offset: 0.45 },
        { opacity: 0.45, boxShadow: '0 0 0 0 rgba(34, 160, 107, 0)' },
      ], { duration: 2600, easing: 'ease-in-out', iterations: 1 });
      return () => animation.cancel();
    } catch {
      // 老版本 WebView 不支持动画时仍保留静态小点，不影响报价与卡片。
    }
  }, [enabled, refreshKey]);

  if (!enabled) return null;
  return (
    <span
      ref={dotRef}
      role="img"
      aria-label="行情更新提示"
      title={refreshKey ? '行情成功更新时轻亮一次' : '等待有效行情更新'}
      data-quote-refresh-dot="true"
      style={{
        display: 'inline-block', width: 6, height: 6, flexShrink: 0, borderRadius: '50%',
        backgroundColor: refreshKey ? '#22A06B' : '#A8B2C1', opacity: 0.45,
      }}
    />
  );
}
