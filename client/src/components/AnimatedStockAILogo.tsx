import { memo, useEffect, useRef, useState } from "react";
import Lottie from "lottie-react";
import { BrainCircuit } from "lucide-react";
import { aiStockSearchAnimation } from "@/lib/ai-stock-animation";

/** 同一青白 AI 动图；列表屏幕外不运行 Lottie，避免大量逐股图标拖慢手机。 */
const AnimatedStockAILogo = memo(function AnimatedStockAILogo() {
  const containerRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting);
    }, { rootMargin: "32px 0px", threshold: 0 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <span ref={containerRef} aria-hidden="true" className="pointer-events-none block h-full w-full">
      {visible ? (
        <Lottie animationData={aiStockSearchAnimation} loop autoplay style={{ width: "100%", height: "100%" }} />
      ) : (
        <BrainCircuit className="h-full w-full p-1.5 text-[#2ECEE0]" strokeWidth={1.5} />
      )}
    </span>
  );
});

export default AnimatedStockAILogo;
