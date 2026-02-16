import { ReactNode, useEffect, useRef, useState } from "react";

interface TooltipProps {
  content: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement>;
}

export default function Tooltip({ content, isOpen, onClose, triggerRef }: TooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<'top' | 'bottom'>('top');

  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    // 智能判断弹出方向
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const triggerMiddle = triggerRect.top + triggerRect.height / 2;

    // 如果小问号在屏幕上半部分，弹窗在下方；否则在上方
    if (triggerMiddle < viewportHeight / 2) {
      setPosition('bottom');
    } else {
      setPosition('top');
    }

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
      className={`absolute z-50 ${
        position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
      } left-1/2 transform -translate-x-1/2 w-64 bg-white border border-gray-200 rounded-lg shadow-xl p-3 text-xs text-gray-700`}
      style={{ maxWidth: 'calc(100vw - 40px)' }}
    >
      {/* 小三角箭头 */}
      <div
        className={`absolute left-1/2 transform -translate-x-1/2 w-0 h-0 ${
          position === 'top'
            ? 'top-full border-l-6 border-r-6 border-t-6 border-l-transparent border-r-transparent border-t-white'
            : 'bottom-full border-l-6 border-r-6 border-b-6 border-l-transparent border-r-transparent border-b-white'
        }`}
        style={{
          borderLeftWidth: '6px',
          borderRightWidth: '6px',
          borderTopWidth: position === 'top' ? '6px' : '0',
          borderBottomWidth: position === 'bottom' ? '6px' : '0',
        }}
      ></div>
      {content}
    </div>
  );
}
