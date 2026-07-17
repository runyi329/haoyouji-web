import { useCallback, useRef } from "react";

interface FlyParticle {
  id: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  color: string;
}

let particleId = 0;

/**
 * 米粒飞入小碗抛物线动画 Hook
 * 用法：
 *   const { flyToTarget, FlyLayer } = useRiceFlyAnimation();
 *   // 点击时调用：
 *   flyToTarget(event, targetRef, color);
 *   // 在 JSX 中渲染：<FlyLayer />
 */
export function useRiceFlyAnimation() {
  const particlesRef = useRef<FlyParticle[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const flyToTarget = useCallback(
    (
      sourceEvent: React.MouseEvent | { clientX: number; clientY: number },
      targetRef: React.RefObject<HTMLElement | null>,
      color = "#C8A87A"
    ) => {
      if (!containerRef.current || !targetRef.current) return;

      const target = targetRef.current.getBoundingClientRect();
      const endX = target.left + target.width / 2;
      const endY = target.top + target.height / 2;

      const startX = sourceEvent.clientX;
      const startY = sourceEvent.clientY;

      const id = ++particleId;
      const particle: FlyParticle = { id, startX, startY, endX, endY, color };

      // 动态创建 DOM 元素执行动画（不走 React re-render，避免性能问题）
      const el = document.createElement("div");
      el.style.cssText = `
        position: fixed;
        width: 10px;
        height: 14px;
        border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
        background: ${color};
        pointer-events: none;
        z-index: 9999;
        left: ${startX - 5}px;
        top: ${startY - 7}px;
        transform-origin: center center;
        will-change: transform, opacity;
      `;
      document.body.appendChild(el);

      const dx = endX - startX;
      const dy = endY - startY;
      const duration = 500; // ms
      const startTime = performance.now();

      // 抛物线：控制点在起点和终点中间偏上
      const cpX = startX + dx * 0.5;
      const cpY = startY - Math.abs(dx) * 0.35 - 60;

      function animate(now: number) {
        const t = Math.min((now - startTime) / duration, 1);
        // 二次贝塞尔曲线
        const bx = (1 - t) * (1 - t) * startX + 2 * (1 - t) * t * cpX + t * t * endX;
        const by = (1 - t) * (1 - t) * startY + 2 * (1 - t) * t * cpY + t * t * endY;

        const scale = 1 - t * 0.5; // 越飞越小
        const opacity = t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2;

        el.style.left = `${bx - 5}px`;
        el.style.top = `${by - 7}px`;
        el.style.transform = `scale(${scale}) rotate(${t * 360}deg)`;
        el.style.opacity = String(opacity);

        if (t < 1) {
          requestAnimationFrame(animate);
        } else {
          el.remove();
        }
      }

      requestAnimationFrame(animate);
    },
    []
  );

  return { flyToTarget, containerRef };
}
