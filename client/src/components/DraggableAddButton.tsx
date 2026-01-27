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
  const [isLongPressing, setIsLongPressing] = useState(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 }); // 手指相对于按钮左上角的偏移
  const currentPosRef = useRef(position);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout>();
  const hasMoved = useRef(false);
  const startPosRef = useRef({ x: 0, y: 0 }); // 记录开始触摸的位置

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

  // 清除长按定时器
  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = undefined;
    }
  }, []);

  // 处理触摸开始
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    
    const touch = e.touches[0];
    hasMoved.current = false;
    startPosRef.current = { x: touch.clientX, y: touch.clientY };
    
    // 计算手指相对于按钮左上角的偏移
    dragOffsetRef.current = {
      x: touch.clientX - currentPosRef.current.x,
      y: touch.clientY - currentPosRef.current.y,
    };

    // 启动长按定时器（300ms后进入拖动模式）
    longPressTimerRef.current = setTimeout(() => {
      setIsLongPressing(true);
      setIsDragging(true);
      // 添加触觉反馈（如果支持）
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, 300);
  }, []);

  // 处理触摸移动
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    
    // 检查是否移动了
    const moveDistance = Math.sqrt(
      Math.pow(touch.clientX - startPosRef.current.x, 2) +
      Math.pow(touch.clientY - startPosRef.current.y, 2)
    );

    if (moveDistance > 10) {
      hasMoved.current = true;
    }

    // 只有在长按模式下才允许拖动
    if (!isLongPressing) {
      // 如果移动了但还没进入长按模式，清除定时器
      if (hasMoved.current) {
        clearLongPressTimer();
      }
      return;
    }

    // 进入拖动模式后立即阻止默认行为
    e.preventDefault();
    e.stopPropagation();

    // 计算新位置：手指位置 - 偏移量 = 按钮左上角位置
    const newX = touch.clientX - dragOffsetRef.current.x;
    const newY = touch.clientY - dragOffsetRef.current.y;
    
    // 约束位置在屏幕范围内
    const constrained = constrainPosition(newX, newY);
    currentPosRef.current = constrained;
    
    // 直接更新 transform，不触发 React 重渲染
    if (buttonRef.current) {
      buttonRef.current.style.transform = `translate(${constrained.x}px, ${constrained.y}px)`;
    }
  }, [isLongPressing, constrainPosition, clearLongPressTimer]);

  // 处理触摸结束
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    
    clearLongPressTimer();

    // 如果是拖动模式，保存位置
    if (isDragging) {
      e.preventDefault();
      setIsDragging(false);
      setIsLongPressing(false);
      setPosition(currentPosRef.current);
    } else if (!hasMoved.current) {
      // 如果没有移动且不是拖动模式，触发点击事件
      onClick();
    }

    hasMoved.current = false;
  }, [isDragging, onClick, clearLongPressTimer]);

  // 处理鼠标开始（PC端）
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    
    hasMoved.current = false;
    startPosRef.current = { x: e.clientX, y: e.clientY };
    
    // 计算鼠标相对于按钮左上角的偏移
    dragOffsetRef.current = {
      x: e.clientX - currentPosRef.current.x,
      y: e.clientY - currentPosRef.current.y,
    };

    // 启动长按定时器（300ms后进入拖动模式）
    longPressTimerRef.current = setTimeout(() => {
      setIsLongPressing(true);
      setIsDragging(true);
    }, 300);
  }, []);

  // 处理鼠标移动（PC端）
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // 检查是否移动了
      const moveDistance = Math.sqrt(
        Math.pow(e.clientX - startPosRef.current.x, 2) +
        Math.pow(e.clientY - startPosRef.current.y, 2)
      );

      if (moveDistance > 10) {
        hasMoved.current = true;
      }

      // 只有在长按模式下才允许拖动
      if (!isLongPressing) {
        if (hasMoved.current) {
          clearLongPressTimer();
        }
        return;
      }

      e.preventDefault();

      // 计算新位置：鼠标位置 - 偏移量 = 按钮左上角位置
      const newX = e.clientX - dragOffsetRef.current.x;
      const newY = e.clientY - dragOffsetRef.current.y;
      
      // 约束位置在屏幕范围内
      const constrained = constrainPosition(newX, newY);
      currentPosRef.current = constrained;
      
      if (buttonRef.current) {
        buttonRef.current.style.transform = `translate(${constrained.x}px, ${constrained.y}px)`;
      }
    };

    const handleMouseUp = () => {
      clearLongPressTimer();

      if (isDragging) {
        setIsDragging(false);
        setIsLongPressing(false);
        setPosition(currentPosRef.current);
      } else if (!hasMoved.current) {
        // 如果没有移动且不是拖动模式，触发点击事件
        onClick();
      }

      hasMoved.current = false;
    };

    if (isDragging || longPressTimerRef.current) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, isLongPressing, onClick, constrainPosition, clearLongPressTimer]);

  return (
    <Button
      ref={buttonRef}
      size="icon"
      className={`fixed w-14 h-14 rounded-full bg-[#ff7f50] hover:bg-[#ff6a3d] text-white shadow-lg z-50 select-none transition-transform ${
        isLongPressing ? "scale-110" : ""
      }`}
      style={{
        left: 0,
        top: 0,
        transform: `translate(${position.x}px, ${position.y}px)`,
        touchAction: "none",
        willChange: "transform",
        cursor: isDragging ? "grabbing" : "pointer",
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
    >
      <Plus className="w-7 h-7" />
    </Button>
  );
}
