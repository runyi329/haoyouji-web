import { useRef, useState, useEffect, useCallback } from "react";

interface SignaturePadProps {
  onSignatureChange: (dataUrl: string | null) => void;
  width?: number;
  height?: number;
  disabled?: boolean;
}

export default function SignaturePad({ onSignatureChange, width = 320, height = 160, disabled = false }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // 设置高清画布
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#1A2B4A";
  }, [width, height]);

  const getPosition = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  }, []);

  const startDraw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    const pos = getPosition(e);
    lastPointRef.current = pos;
    setIsDrawing(true);
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    }
  }, [disabled, getPosition]);

  const draw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawing || disabled) return;
    e.preventDefault();
    const pos = getPosition(e);
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx && lastPointRef.current) {
      ctx.beginPath();
      ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      lastPointRef.current = pos;
      if (!hasSignature) setHasSignature(true);
    }
  }, [isDrawing, disabled, getPosition, hasSignature]);

  const endDraw = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    lastPointRef.current = null;
    // 导出签名
    const canvas = canvasRef.current;
    if (canvas && hasSignature) {
      onSignatureChange(canvas.toDataURL("image/png"));
    }
  }, [isDrawing, hasSignature, onSignatureChange]);

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    setHasSignature(false);
    onSignatureChange(null);
  };

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: "#666" }}>
          手写签名 <span style={{ color: "#E53E3E", marginLeft: 2 }}>*</span>
        </span>
        {hasSignature && !disabled && (
          <button
            onClick={clearSignature}
            style={{
              background: "none",
              border: "none",
              fontSize: 12,
              color: "#E53E3E",
              cursor: "pointer",
              padding: "2px 8px",
            }}
          >
            清除重签
          </button>
        )}
      </div>
      <div
        style={{
          border: `2px dashed ${hasSignature ? "#1A2B4A" : "#CBD5E0"}`,
          borderRadius: 8,
          background: disabled ? "#F0F0F0" : "#FAFAFA",
          position: "relative",
          overflow: "hidden",
          touchAction: "none",
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            display: "block",
            width: "100%",
            height: `${height}px`,
            cursor: disabled ? "default" : "crosshair",
          }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        {!hasSignature && !disabled && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              fontSize: 13,
              color: "#BBB",
              pointerEvents: "none",
              userSelect: "none",
            }}
          >
            请在此处手写签名
          </div>
        )}
      </div>
      <p style={{ fontSize: 11, color: "#999", marginTop: 4 }}>
        请用手指或鼠标在上方区域内签名
      </p>
    </div>
  );
}
