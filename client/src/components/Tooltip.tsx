import { ReactNode, useEffect, useRef, useState } from "react";

interface TooltipProps {
  content: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement>; // 标题元素的ref
}

export default function Tooltip({ content, isOpen, onClose, triggerRef }: TooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<'top' | 'bottom'>('top');
  const [arrowOffset, setArrowOffset] = useState<number>(0);

  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    // 智能判断弹出方向
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const triggerMiddle = triggerRect.top + triggerRect.height / 2;

    // 如果标题在屏幕上半部分，弹窗在下方；否则在上方
    if (triggerMiddle < viewportHeight / 2) {
      setPosition('bottom');
    } else {
      setPosition('top');
    }

    // 计算小箭头的偏移量（相对于屏幕中心）
    // 小箭头应该指向标题的中心
    const triggerCenter = triggerRect.left + triggerRect.width / 2;
    const screenCenter = window.innerWidth / 2;
    const offset = triggerCenter - screenCenter;
    
    // 限制箭头偏移量，确保箭头在容器内
    const maxOffset = 100; // 最大偏移量（像素）
    const clampedOffset = Math.max(-maxOffset, Math.min(maxOffset, offset));
    setArrowOffset(clampedOffset);

    const handleClickOutside = (event: MouseEvent) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    // 延迟添加事件监听，避免立即触发
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) return null;

  return (
    <div
      ref={tooltipRef}
      className={`fixed z-50 left-1/2 transform -translate-x-1/2 w-64 bg-white border border-gray-200 rounded-lg shadow-xl p-3 text-xs text-gray-700`}
      style={{
        maxWidth: 'calc(100vw - 40px)',
        [position === 'top' ? 'bottom' : 'top']: 
          position === 'top' 
            ? `${window.innerHeight - (triggerRef.current?.getBoundingClientRect().top || 0) + 8}px`
            : `${(triggerRef.current?.getBoundingClientRect().bottom || 0) + 8}px`
      }}
    >
      {/* 小三角箭头（像微信气泡，动态偏移，指向标题） */}
      <div
        className={`absolute w-0 h-0 ${
          position === 'top'
            ? 'top-full'
            : 'bottom-full'
        }`}
        style={{
          left: `calc(50% + ${arrowOffset}px)`,
          transform: 'translateX(-50%)',
          borderLeft: '8px solid transparent',
          borderRight: '8px solid transparent',
          [position === 'top' ? 'borderTop' : 'borderBottom']: '8px solid white',
        }}
      ></div>
      {/* 箭头的边框（与容器边框颜色一致） */}
      <div
        className={`absolute w-0 h-0 ${
          position === 'top'
            ? 'top-full'
            : 'bottom-full'
        }`}
        style={{
          left: `calc(50% + ${arrowOffset}px)`,
          transform: 'translateX(-50%)',
          borderLeft: '9px solid transparent',
          borderRight: '9px solid transparent',
          [position === 'top' ? 'borderTop' : 'borderBottom']: '9px solid #e5e7eb',
          [position === 'top' ? 'marginTop' : 'marginBottom']: '-1px',
        }}
      ></div>
      {content}
    </div>
  );
}
