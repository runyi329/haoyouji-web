import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface DraggableAddButtonProps {
  onClick: () => void;
}

export default function DraggableAddButton({ onClick }: DraggableAddButtonProps) {
  // 从localStorage读取保存的位置，默认右下角
  const getInitialPosition = () => {
    const saved = localStorage.getItem("addButtonPosition");
    if (saved) {
      return JSON.parse(saved);
    }
    // 默认位置：右下角，距离边缘20px
    return {
      x: window.innerWidth - 70,
      y: window.innerHeight - 90,
    };
  };

  const [position, setPosition] = useState(getInitialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const currentPosRef = useRef(position);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rafRef = useRef<number>();

  // 同步position到ref
  useEffect(() => {
    currentPosRef.current = position;
  }, [position]);

  // 保存位置到localStorage（防抖）
  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem("addButtonPosition", JSON.stringify(position));
    }, 300);
    return () => clearTimeout(timer);
  }, [position]);

  // 限制位置在屏幕范围内
  const constrainPosition = useCallback((x: number, y: number) => {
    const maxX = window.innerWidth - 56;
    const maxY = window.innerHeight - 56;
    return {
      x: Math.max(0, Math.min(x, maxX)),
      y: Math.max(0, Math.min(y, maxY)),
    };
  }, []);

  // 处理触摸开始
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const touch = e.touches[0];
    setIsDragging(true);
    dragStartRef.current = {
      x: touch.clientX - currentPosRef.current.x,
      y: touch.clientY - currentPosRef.current.y,
    };
  }, []);

  // 处理触摸移动
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isDragging) return;

    const touch = e.touches[0];
    const newX = touch.clientX - dragStartRef.current.x;
    const newY = touch.clientY - dragStartRef.current.y;

    // 使用 requestAnimationFrame 优化性能
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = requestAnimationFrame(() => {
      const constrained = constrainPosition(newX, newY);
      currentPosRef.current = constrained;
      
      // 直接更新 transform，不触发 React 重渲染
      if (buttonRef.current) {
        buttonRef.current.style.transform = `translate(${constrained.x}px, ${constrained.y}px)`;
      }
    });
  }, [isDragging, constrainPosition]);

  // 处理触摸结束
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsDragging(false);
    // 触摸结束后更新 state，保存位置
    setPosition(currentPosRef.current);
  }, []);

  // 处理鼠标开始（PC端）
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - currentPosRef.current.x,
      y: e.clientY - currentPosRef.current.y,
    };
  }, []);

  // 处理鼠标移动（PC端）
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      e.preventDefault();

      const newX = e.clientX - dragStartRef.current.x;
      const newY = e.clientY - dragStartRef.current.y;

      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }

      rafRef.current = requestAnimationFrame(() => {
        const constrained = constrainPosition(newX, newY);
        currentPosRef.current = constrained;
        
        if (buttonRef.current) {
          buttonRef.current.style.transform = `translate(${constrained.x}px, ${constrained.y}px)`;
        }
      });
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        setPosition(currentPosRef.current);
      }
    };

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isDragging, constrainPosition]);

  // 处理点击事件
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onClick();
  }, [onClick]);

  return (
    <Button
      ref={buttonRef}
      size="icon"
      className="fixed w-14 h-14 rounded-full bg-[#ff7f50] hover:bg-[#bde4f4] text-white hover:text-[#404969] shadow-lg z-50 select-none"
      style={{
        left: 0,
        top: 0,
        transform: `translate(${position.x}px, ${position.y}px)`,
        touchAction: "none",
        willChange: "transform",
        cursor: isDragging ? "grabbing" : "grab",
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      <Plus className="w-7 h-7" />
    </Button>
  );
}
