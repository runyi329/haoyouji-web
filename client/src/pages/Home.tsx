import { trpc } from "@/lib/trpc";
import Lottie from "lottie-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";
import { 
  Users, 
  Handshake, 
  RefreshCw, 
  Plus,
  Wallet,
  Coins,
  Loader2,
  User,
  LogOut,
  UserCircle,
  Globe,
  BarChart2,
  FileText,
  UserPlus,
  Gift,
  ShoppingBag,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import "@/styles/level-text.css";
import BottomNav from "@/components/BottomNav";

// 翻牌卡片单个数字组件
// 原理：数字元素高度固定为 h，用 overflow:hidden 裁切上半 / 下半
// 上半容器：高度 h/2，数字元素绝对定位 top:0，显示上半
// 下半容器：高度 h/2，数字元素绝对定位 top:-(h/2)，显示下半
function FlipDigit({ digit, prevDigit, flip, size }: { digit: string; prevDigit: string; flip: boolean; size: number }) {
  const w = Math.round(size * 0.62);
  const h = size;
  const fs = Math.round(size * 0.82);

  // 数字元素：完整高度 h，居中显示
  const numStyle = (top: number): React.CSSProperties => ({
    position: 'absolute',
    top: top + 'px',
    left: 0,
    right: 0,
    height: h + 'px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: fs + 'px',
    fontWeight: 900,
    color: '#D32F2F',
    lineHeight: 1,
    userSelect: 'none',
  });

  return (
    <div style={{ position: 'relative', display: 'inline-block', width: w + 'px', height: h + 'px', perspective: '600px' }}>
      <style>{`
        @keyframes fd-flipTop {
          0%   { transform: rotateX(0deg); }
          100% { transform: rotateX(-90deg); }
        }
        @keyframes fd-flipBottom {
          0%   { transform: rotateX(90deg); }
          100% { transform: rotateX(0deg); }
        }
        .fd-anim-top    { animation: fd-flipTop    0.22s ease-in  forwards; }
        .fd-anim-bottom { animation: fd-flipBottom 0.22s ease-out 0.22s forwards; }
      `}</style>

      {/* 静态上半：当前数字 */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: h / 2 + 'px',
        background: '#fff', borderRadius: '6px 6px 0 0', overflow: 'hidden',
        boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.07)' }}>
        <div style={numStyle(0)}>{digit}</div>
      </div>

      {/* 静态下半：当前数字 */}
      <div style={{ position: 'absolute', top: h / 2 + 'px', left: 0, right: 0, height: h / 2 + 'px',
        background: '#f4f4f4', borderRadius: '0 0 6px 6px', overflow: 'hidden' }}>
        <div style={numStyle(-(h / 2))}>{digit}</div>
      </div>

      {/* 动画上半：旧数字翻走 */}
      {flip && (
        <div className="fd-anim-top" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: h / 2 + 'px',
          background: '#fff', borderRadius: '6px 6px 0 0', overflow: 'hidden',
          transformOrigin: 'bottom center', zIndex: 10,
          boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.07)' }}>
          <div style={numStyle(0)}>{prevDigit}</div>
        </div>
      )}

      {/* 动画下半：新数字翻入 */}
      {flip && (
        <div className="fd-anim-bottom" style={{ position: 'absolute', top: h / 2 + 'px', left: 0, right: 0, height: h / 2 + 'px',
          background: '#f4f4f4', borderRadius: '0 0 6px 6px', overflow: 'hidden',
          transformOrigin: 'top center', zIndex: 10 }}>
          <div style={numStyle(-(h / 2))}>{digit}</div>
        </div>
      )}
    </div>
  );
}

function FlipCounterCard({ total }: { total: number }) {
  const [displayTotal, setDisplayTotal] = useState(0);
  const [prevTotal, setPrevTotal] = useState(0);
  const [flipKey, setFlipKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [digitSize, setDigitSize] = useState(64);

  useEffect(() => {
    if (total > 0 && total !== displayTotal) {
      setPrevTotal(displayTotal);
      setDisplayTotal(total);
      setFlipKey(k => k + 1);
    }
  }, [total]);

  // 根据容器宽度和数字个数动态计算单个翻牌大小
  useEffect(() => {
    const calcSize = () => {
      if (!containerRef.current) return;
      const containerW = containerRef.current.clientWidth - 40; // 减去 padding
      const digits = displayTotal.toLocaleString('zh-CN').split('');
      const numDigits = digits.filter(d => d !== ',' && d !== '\uff0c').length;
      const numCommas = digits.length - numDigits;
      // 每个数字占 0.65 * size，逗号占 0.3 * size，单位占 1.5 * size，间距 2px
      // containerW = numDigits * 0.65 * size + numCommas * 0.3 * size + 1.5 * size + (digits.length) * 2
      const totalUnits = numDigits * 0.65 + numCommas * 0.3 + 1.5;
      const s = Math.min(80, Math.floor((containerW - digits.length * 2) / totalUnits));
      setDigitSize(Math.max(48, s));
    };
    calcSize();
    window.addEventListener('resize', calcSize);
    return () => window.removeEventListener('resize', calcSize);
  }, [displayTotal]);

  const toDigits = (num: number) => num.toLocaleString('zh-CN').split('');
  const curDigits = toDigits(displayTotal);
  const prevDigits = toDigits(prevTotal);
  const maxLen = Math.max(curDigits.length, prevDigits.length);
  const pad = (arr: string[]) => Array(maxLen - arr.length).fill('\u00a0').concat(arr);
  const cur = pad(curDigits);
  const prev = pad(prevDigits);

  return (
    <div className="px-4 mt-4" ref={containerRef}>
      <div className="bg-white rounded-2xl px-5 py-4" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
        <div className="flex items-center mb-3">
          <span className="text-xs text-gray-400 tracking-wide">全网人脉总数</span>
        </div>
        <div className="flex items-end justify-end">
          <div className="flex items-center" style={{ gap: '2px' }}>
            {cur.map((digit, i) => (
              digit === ',' || digit === '\uff0c' ? (
                <span key={i} className="text-gray-300 font-bold" style={{ fontSize: digitSize * 0.5 + 'px', alignSelf: 'center', lineHeight: digitSize + 'px', width: digitSize * 0.3 + 'px', textAlign: 'center' }}>,</span>
              ) : (
                <FlipDigit
                  key={`${i}-${flipKey}`}
                  digit={digit === '\u00a0' ? '' : digit}
                  prevDigit={prev[i] === '\u00a0' ? '' : (prev[i] ?? '')}
                  flip={digit !== prev[i] && flipKey > 0}
                  size={digitSize}
                />
              )
            ))}
          </div>
          <span className="font-medium text-gray-400 ml-2" style={{ fontSize: digitSize * 0.35 + 'px' }}>人</span>
        </div>
      </div>
    </div>
  );
}

// 小尺寸翻牌组件，用于 AI 人脉卡片底部
function MiniFlipCounter({ total }: { total: number }) {
  const [displayTotal, setDisplayTotal] = useState(0);
  const [prevTotal, setPrevTotal] = useState(0);
  const [flipKey, setFlipKey] = useState(0);
  const DIGIT_SIZE = 22; // 固定小尺寸

  useEffect(() => {
    if (total > 0 && total !== displayTotal) {
      setPrevTotal(displayTotal);
      setDisplayTotal(total);
      setFlipKey(k => k + 1);
    }
  }, [total]);

  const toDigits = (num: number) => num.toLocaleString('zh-CN').split('');
  const curDigits = toDigits(displayTotal);
  const prevDigits = toDigits(prevTotal);
  const maxLen = Math.max(curDigits.length, prevDigits.length);
  const pad = (arr: string[]) => Array(maxLen - arr.length).fill('\u00a0').concat(arr);
  const cur = pad(curDigits);
  const prev = pad(prevDigits);

  return (
    <div className="flex flex-col items-center cursor-default" style={{ minWidth: 0, flex: 1, paddingLeft: '6px', paddingRight: '6px' }}>
      {/* 全网人脉文字已移至外层容器，此处不显示 */}
      <div className="flex items-center justify-center" style={{ gap: '1px' }}>
        {cur.map((digit, i) => (
          digit === ',' || digit === '\u002c' || digit === '\uff0c' ? (
            <span key={i} className="text-gray-300 font-bold" style={{ fontSize: DIGIT_SIZE * 0.5 + 'px', alignSelf: 'center', lineHeight: DIGIT_SIZE + 'px', width: DIGIT_SIZE * 0.3 + 'px', textAlign: 'center' }}>,</span>
          ) : (
            <FlipDigit
              key={`mini-${i}-${flipKey}`}
              digit={digit === '\u00a0' ? '' : digit}
              prevDigit={prev[i] === '\u00a0' ? '' : (prev[i] ?? '')}
              flip={digit !== prev[i] && flipKey > 0}
              size={DIGIT_SIZE}
            />
          )
        ))}
        <span className="font-medium text-gray-400 ml-0.5" style={{ fontSize: DIGIT_SIZE * 0.45 + 'px' }}>人</span>
      </div>
    </div>
  );
}

// 红色背景翻牌组件：白色格子 + 红色数字，用于红色大卡片内
function RedFlipDigit({ digit, prevDigit, flip, size }: { digit: string; prevDigit: string; flip: boolean; size: number }) {
  const w = Math.round(size * 0.72);
  const h = size;
  const fs = Math.round(size * 0.82);

  const numStyle = (top: number): React.CSSProperties => ({
    position: 'absolute',
    top: top + 'px',
    left: 0,
    right: 0,
    height: h + 'px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: fs + 'px',
    fontWeight: 900,
    color: '#A80000',
    lineHeight: 1,
    userSelect: 'none',
  });

  return (
    <div style={{ position: 'relative', display: 'inline-block', width: w + 'px', height: h + 'px', perspective: '600px' }}>
      <style>{`
        @keyframes rfd-flipTop {
          0%   { transform: rotateX(0deg); }
          100% { transform: rotateX(-90deg); }
        }
        @keyframes rfd-flipBottom {
          0%   { transform: rotateX(90deg); }
          100% { transform: rotateX(0deg); }
        }
        .rfd-anim-top    { animation: rfd-flipTop    0.22s ease-in  forwards; transform-style: preserve-3d; backface-visibility: hidden; }
        .rfd-anim-bottom { animation: rfd-flipBottom 0.22s ease-out 0.22s forwards; transform-style: preserve-3d; backface-visibility: hidden; }
      `}</style>
      {/* 静态上半：白色背景 */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: h / 2 + 'px',
        background: '#fff', borderRadius: '4px 4px 0 0', overflow: 'hidden',
        boxShadow: 'inset 0 -1px 0 rgba(168,0,0,0.15)' }}>
        <div style={numStyle(0)}>{digit}</div>
      </div>
      {/* 静态下半：浅红色背景 */}
      <div style={{ position: 'absolute', top: h / 2 + 'px', left: 0, right: 0, height: h / 2 + 'px',
        background: '#ffe0e0', borderRadius: '0 0 4px 4px', overflow: 'hidden' }}>
        <div style={numStyle(-(h / 2))}>{digit}</div>
      </div>
      {/* 动画上半：旧数字翻走 */}
      {flip && (
        <div className="rfd-anim-top" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: h / 2 + 'px',
          background: '#fff', borderRadius: '4px 4px 0 0', overflow: 'hidden',
          transformOrigin: 'bottom center', zIndex: 10,
          boxShadow: 'inset 0 -1px 0 rgba(168,0,0,0.15)' }}>
          <div style={numStyle(0)}>{prevDigit}</div>
        </div>
      )}
      {/* 动画下半：新数字翻入 */}
      {flip && (
        <div className="rfd-anim-bottom" style={{ position: 'absolute', top: h / 2 + 'px', left: 0, right: 0, height: h / 2 + 'px',
          background: '#ffe0e0', borderRadius: '0 0 4px 4px', overflow: 'hidden',
          transformOrigin: 'top center', zIndex: 10 }}>
          <div style={numStyle(-(h / 2))}>{digit}</div>
        </div>
      )}
    </div>
  );
}

// 金色质感翻牌单个数字组件
function GoldFlipDigit({ digit, prevDigit, flip, size }: { digit: string; prevDigit: string; flip: boolean; size: number }) {
  const w = Math.round(size * 0.72);
  const h = size;
  const fs = Math.round(size * 0.82);

  const numStyle = (top: number): React.CSSProperties => ({
    position: 'absolute',
    top: top + 'px',
    left: 0,
    right: 0,
    height: h + 'px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: fs + 'px',
    fontWeight: 900,
    color: '#6B4A10',
    lineHeight: 1,
    userSelect: 'none',
  });

  return (
    <div style={{ position: 'relative', display: 'inline-block', width: w + 'px', height: h + 'px', perspective: '600px' }}>
      <style>{`
        @keyframes gfd-flipTop {
          0%   { transform: rotateX(0deg); }
          100% { transform: rotateX(-90deg); }
        }
        @keyframes gfd-flipBottom {
          0%   { transform: rotateX(90deg); }
          100% { transform: rotateX(0deg); }
        }
        .gfd-anim-top    { animation: gfd-flipTop    0.22s ease-in  forwards; transform-style: preserve-3d; backface-visibility: hidden; }
        .gfd-anim-bottom { animation: gfd-flipBottom 0.22s ease-out 0.22s forwards; transform-style: preserve-3d; backface-visibility: hidden; }
      `}</style>
      {/* 静态上半：奶白背景 */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: h / 2 + 'px',
        background: '#FFFDF5', borderRadius: '4px 4px 0 0', overflow: 'hidden',
        boxShadow: 'inset 0 -1px 0 rgba(203,164,113,0.4)' }}>
        <div style={numStyle(0)}>{digit}</div>
      </div>
      {/* 静态下半：浅金背景 */}
      <div style={{ position: 'absolute', top: h / 2 + 'px', left: 0, right: 0, height: h / 2 + 'px',
        background: '#F5E6C0', borderRadius: '0 0 4px 4px', overflow: 'hidden' }}>
        <div style={numStyle(-(h / 2))}>{digit}</div>
      </div>
      {/* 动画上半：旧数字翻走 */}
      {flip && (
        <div className="gfd-anim-top" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: h / 2 + 'px',
          background: '#FFFDF5', borderRadius: '4px 4px 0 0', overflow: 'hidden',
          transformOrigin: 'bottom center', zIndex: 10,
          boxShadow: 'inset 0 -1px 0 rgba(203,164,113,0.4)' }}>
          <div style={numStyle(0)}>{prevDigit}</div>
        </div>
      )}
      {/* 动画下半：新数字翻入 */}
      {flip && (
        <div className="gfd-anim-bottom" style={{ position: 'absolute', top: h / 2 + 'px', left: 0, right: 0, height: h / 2 + 'px',
          background: '#F5E6C0', borderRadius: '0 0 4px 4px', overflow: 'hidden',
          transformOrigin: 'top center', zIndex: 10 }}>
          <div style={numStyle(-(h / 2))}>{digit}</div>
        </div>
      )}
    </div>
  );
}

function GoldFlipCounter({ total, unit, decimals, fixedSize }: { total: number; unit?: string; decimals?: number; fixedSize?: number }) {
  const [displayTotal, setDisplayTotal] = useState(0);
  const [prevTotal, setPrevTotal] = useState(0);
  const [flipKey, setFlipKey] = useState(0);
  const [digitSize, setDigitSize] = useState(fixedSize ?? 32);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (total > 0 && total !== displayTotal) {
      setPrevTotal(displayTotal);
      setDisplayTotal(total);
      setFlipKey(k => k + 1);
    }
  }, [total]);

  useEffect(() => {
    // 如果传入了固定尺寸，不计算自适应大小
    if (fixedSize) { setDigitSize(fixedSize); return; }
    const calcSize = () => {
      if (!containerRef.current) return;
      const containerW = containerRef.current.clientWidth - 8;
      const rawNum = displayTotal || total;
      const numDigits = String(rawNum).replace(/[^0-9]/g, '').length;
      const numCommas = 0; // 不显示千分位逗号
      const dotUnits = decimals ? 0.3 : 0;
      const totalUnits = numDigits * 0.72 + numCommas * 0.3 + dotUnits + 0.5;
      const s = Math.floor((containerW - (numDigits + numCommas + (decimals ? 1 : 0)) * 2) / totalUnits);
      setDigitSize(Math.max(20, Math.min(36, s)));
    };
    calcSize();
    window.addEventListener('resize', calcSize);
    return () => window.removeEventListener('resize', calcSize);
  }, [displayTotal, total, decimals, fixedSize]);

  const buildDigitSeq = (num: number): string[] => {
    if (!decimals) return String(num).split('');
    const s = String(num).padStart(decimals + 1, '0');
    const intPart = s.slice(0, s.length - decimals);
    const decPart = s.slice(s.length - decimals);
    return [...intPart.split(''), '.', ...decPart.split('')];
  };

  const curDigits = buildDigitSeq(displayTotal);
  const prevDigits = buildDigitSeq(prevTotal);
  const maxLen = Math.max(curDigits.length, prevDigits.length);
  const pad = (arr: string[]) => Array(maxLen - arr.length).fill('\u00a0').concat(arr);
  const cur = pad(curDigits);
  const prev = pad(prevDigits);

  return (
    <div ref={containerRef} className="flex items-end w-full justify-end" style={{ gap: '2px' }}>
      {cur.map((digit, i) => (
        digit === ',' || digit === '\u002c' || digit === '\uff0c' ? (
          <span key={i} className="font-bold" style={{ fontSize: digitSize * 0.5 + 'px', alignSelf: 'center', color: 'rgba(203,164,113,0.9)', lineHeight: digitSize + 'px', width: digitSize * 0.3 + 'px', textAlign: 'center' }}>,</span>
        ) : digit === '.' ? (
          <span key={i} className="font-black" style={{ fontSize: digitSize * 0.65 + 'px', alignSelf: 'flex-end', color: 'rgba(203,164,113,1)', lineHeight: 1, paddingBottom: '2px', width: digitSize * 0.3 + 'px', textAlign: 'center' }}>.</span>
        ) : (
          <GoldFlipDigit
            key={`gold-${i}-${flipKey}`}
            digit={digit === '\u00a0' ? '' : digit}
            prevDigit={prev[i] === '\u00a0' ? '' : (prev[i] ?? '')}
            flip={digit !== prev[i] && flipKey > 0}
            size={digitSize}
          />
        )
      ))}
      {unit && <span className="font-medium" style={{ fontSize: digitSize * 0.38 + 'px', color: '#333333', marginLeft: '3px', alignSelf: 'flex-end', marginBottom: '2px', whiteSpace: 'nowrap' }}>{unit}</span>}
    </div>
  );
}

function RedFlipCounter({ total, unitColor, unit, decimals }: { total: number; unitColor?: string; unit?: string; decimals?: number }) {
  const [displayTotal, setDisplayTotal] = useState(0);
  const [prevTotal, setPrevTotal] = useState(0);
  const [flipKey, setFlipKey] = useState(0);
  const [digitSize, setDigitSize] = useState(32);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (total > 0 && total !== displayTotal) {
      setPrevTotal(displayTotal);
      setDisplayTotal(total);
      setFlipKey(k => k + 1);
    }
  }, [total]);

  // 动态计算单个翻牌尺寸，根据容器宽度和数字位数自动缩放
  useEffect(() => {
    const calcSize = () => {
      if (!containerRef.current) return;
      const containerW = containerRef.current.clientWidth - 8;
      const rawNum = displayTotal || total;
      // 如果有小数位，计算实际数字位数（不含千分位逗号）
      const numDigits = String(rawNum).replace(/[^0-9]/g, '').length;
      const numCommas = 0; // 不显示千分位逗号
      // 小数点占 0.3 * size
      const dotUnits = decimals ? 0.3 : 0;
      const totalUnits = numDigits * 0.72 + numCommas * 0.3 + dotUnits + 0.5;
      const s = Math.floor((containerW - (numDigits + numCommas + (decimals ? 1 : 0)) * 2) / totalUnits);
      setDigitSize(Math.max(20, Math.min(36, s)));
    };
    calcSize();
    window.addEventListener('resize', calcSize);
    return () => window.removeEventListener('resize', calcSize);
  }, [displayTotal, total, decimals]);

  // 构建带小数点的数字序列
  // decimals=2 时：410285 → ['4','1','0','2','.','8','5']
  const buildDigitSeq = (num: number): string[] => {
    if (!decimals) return num.toLocaleString('zh-CN').split('');
    const s = String(num).padStart(decimals + 1, '0');
    const intPart = s.slice(0, s.length - decimals);
    const decPart = s.slice(s.length - decimals);
    // 整数部分加千分位
    const intFormatted = parseInt(intPart, 10).toLocaleString('zh-CN');
    return [...intFormatted.split(''), '.', ...decPart.split('')];
  };

  const curDigits = buildDigitSeq(displayTotal);
  const prevDigits = buildDigitSeq(prevTotal);
  const maxLen = Math.max(curDigits.length, prevDigits.length);
  const pad = (arr: string[]) => Array(maxLen - arr.length).fill('\u00a0').concat(arr);
  const cur = pad(curDigits);
  const prev = pad(prevDigits);

  return (
    <div ref={containerRef} className="flex items-end w-full justify-end" style={{ gap: '2px' }}>
      {cur.map((digit, i) => (
        digit === ',' || digit === '\u002c' || digit === '\uff0c' ? (
          <span key={i} className="font-bold" style={{ fontSize: digitSize * 0.5 + 'px', alignSelf: 'center', color: unitColor ?? 'rgba(255,255,255,0.7)', lineHeight: digitSize + 'px', width: digitSize * 0.3 + 'px', textAlign: 'center' }}>,</span>
        ) : digit === '.' ? (
          <span key={i} className="font-black" style={{ fontSize: digitSize * 0.65 + 'px', alignSelf: 'flex-end', color: unitColor ?? 'rgba(255,255,255,0.9)', lineHeight: 1, paddingBottom: '2px', width: digitSize * 0.3 + 'px', textAlign: 'center' }}>.</span>
        ) : (
          <RedFlipDigit
            key={`red-${i}-${flipKey}`}
            digit={digit === '\u00a0' ? '' : digit}
            prevDigit={prev[i] === '\u00a0' ? '' : (prev[i] ?? '')}
            flip={digit !== prev[i] && flipKey > 0}
            size={digitSize}
          />
        )
      ))}
      <span className="font-medium" style={{ fontSize: digitSize * 0.38 + 'px', color: unitColor ?? 'rgba(255,255,255,0.7)', marginLeft: '3px', alignSelf: 'flex-end', marginBottom: '2px' }}>{unit ?? '人'}</span>
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + "万";
  }
  return num.toLocaleString("zh-CN");
}

function formatCurrency(num: number): string {
  if (num >= 10000) {
    return "¥" + (num / 10000).toFixed(1) + "万";
  }
  return "¥" + num.toLocaleString("zh-CN");
}

// 根据等级返回显示文字
function getLevelText(level?: string): string {
  if (!level) return "我的";
  
  switch (level) {
    case 'standard_user':
      return "标准用户";
    case 'advanced_user':
      return "高级用户";
    case 'super_user':
      return "超级用户";
    case 'standard':
      return "标准节点";
    case 'advanced':
      return "高级节点";
    case 'super':
      return "超级节点";
    default:
      return "我的";
  }
}

// 根据等级返回样式类名
function getLevelClassName(level?: string): string {
  if (!level) return "text-[#757575]";
  
  switch (level) {
    case 'standard_user':
    case 'standard':
      return "level-text-standard";
    case 'advanced_user':
    case 'advanced':
      return "level-text-advanced";
    case 'super_user':
    case 'super':
      return "level-text-super";
    default:
      return "text-[#757575]";
  }
}


// ── 全球市场节假日（组件外部，避免每次渲染重建）──────────────────────────
const GLOBAL_MARKET_HOLIDAYS_OUTER = new Set([
  '2025-01-01','2025-01-20','2025-02-17','2025-04-18','2025-05-26',
  '2025-06-19','2025-07-04','2025-09-01','2025-11-27','2025-12-25',
  '2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25',
  '2026-06-19','2026-07-04','2026-09-07','2026-11-26','2026-12-25',
]);

function getBjDateStrOuter(d: Date): string {
  const bj = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return `${bj.getUTCFullYear()}-${String(bj.getUTCMonth()+1).padStart(2,'0')}-${String(bj.getUTCDate()).padStart(2,'0')}`;
}

function getGlobalMarketStatusOuter(now: Date): 'open' | 'closed' {
  const bj = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const day = bj.getUTCDay();
  const dateStr = getBjDateStrOuter(now);
  if (day === 6) return 'closed';
  if (day === 0) {
    const h = bj.getUTCHours(), m = bj.getUTCMinutes();
    return (h * 60 + m) >= 6 * 60 ? 'open' : 'closed';
  }
  if (GLOBAL_MARKET_HOLIDAYS_OUTER.has(dateStr)) return 'closed';
  if (day === 5) {
    const h = bj.getUTCHours(), m = bj.getUTCMinutes();
    return (h * 60 + m) < 23 * 60 ? 'open' : 'closed';
  }
  return 'open';
}

function getGlobalNextOpenTimeOuter(now: Date): number {
  const BJ_OFFSET = 8 * 60 * 60 * 1000;
  const nowMs = now.getTime();
  const bjDate = new Date(nowMs + BJ_OFFSET);
  const day = bjDate.getUTCDay();
  if (day === 6) {
    const todayBjMidnight = Date.UTC(bjDate.getUTCFullYear(), bjDate.getUTCMonth(), bjDate.getUTCDate()) - BJ_OFFSET;
    return todayBjMidnight + 24 * 3600 * 1000 + 6 * 3600 * 1000;
  }
  if (day === 0) {
    const todayBjMidnight = Date.UTC(bjDate.getUTCFullYear(), bjDate.getUTCMonth(), bjDate.getUTCDate()) - BJ_OFFSET;
    return todayBjMidnight + 6 * 3600 * 1000;
  }
  if (day === 5) {
    const h = bjDate.getUTCHours(), m = bjDate.getUTCMinutes();
    if (h * 60 + m >= 23 * 60) {
      for (let i = 1; i <= 7; i++) {
        const cMs = nowMs + i * 24 * 3600 * 1000;
        const cBj = new Date(cMs + BJ_OFFSET);
        const cDay = cBj.getUTCDay();
        const cStr = getBjDateStrOuter(new Date(cMs));
        if (cDay === 0) return Date.UTC(cBj.getUTCFullYear(), cBj.getUTCMonth(), cBj.getUTCDate()) - BJ_OFFSET + 6 * 3600 * 1000;
        if (cDay !== 6 && !GLOBAL_MARKET_HOLIDAYS_OUTER.has(cStr)) return Date.UTC(cBj.getUTCFullYear(), cBj.getUTCMonth(), cBj.getUTCDate()) - BJ_OFFSET;
      }
    }
  }
  if (GLOBAL_MARKET_HOLIDAYS_OUTER.has(getBjDateStrOuter(now))) {
    for (let i = 1; i <= 7; i++) {
      const cMs = nowMs + i * 24 * 3600 * 1000;
      const cBj = new Date(cMs + BJ_OFFSET);
      const cDay = cBj.getUTCDay();
      const cStr = getBjDateStrOuter(new Date(cMs));
      if (cDay !== 0 && cDay !== 6 && !GLOBAL_MARKET_HOLIDAYS_OUTER.has(cStr)) {
        return Date.UTC(cBj.getUTCFullYear(), cBj.getUTCMonth(), cBj.getUTCDate()) - BJ_OFFSET;
      }
    }
  }
  return nowMs + 3600 * 1000;
}

// ── 装修升级中 Lottie 动画组件（懒加载）────────────────────────────────────
const UnderConstructionLottie = React.memo(function UnderConstructionLottie() {
  const [animData, setAnimData] = React.useState<object | null>(null);
  React.useEffect(() => {
    import('@/assets/under-construction.json')
      .then(m => setAnimData(m.default))
      .catch(() => {});
  }, []);
  if (!animData) return <div style={{ width: 80, height: 80 }} />;
  return <Lottie animationData={animData} loop={true} style={{ width: '100%', height: '100%' }} />;
});

// ── 蓄水池 Lottie 动画组件（懒加载）──────────────────────────────────
const XushuchiLottie = React.memo(function XushuchiLottie() {
  const [animData, setAnimData] = React.useState<object | null>(null);
  React.useEffect(() => {
    fetch('/xushuchi.json')
      .then(r => r.json())
      .then(setAnimData)
      .catch(() => {});
  }, []);
  // 原始尺寸 1024×768，比例 4:3
  // 手机容器宽度约 330-390px，高度约 42% 屏幕高（去掉圆点指示器）
  // 最大清晰尺寸：宽度 100%，高度自适应（保持比例）
  if (!animData) return <div style={{ width: '100%', height: '100%' }} />;
  return (
    <Lottie
      animationData={animData}
      loop={true}
      style={{ width: '100%', height: '100%' }}
    />
  );
});

// ── 金色钉包 Lottie 动画组件（懒加载，避免影响首屏渲染）────────────────────
const WalletLottie = React.memo(function WalletLottie() {
  const [animData, setAnimData] = React.useState<object | null>(null);
  React.useEffect(() => {
    fetch('/wallet_gold.json')
      .then(r => r.json())
      .then(setAnimData)
      .catch(() => {});
  }, []);
  if (!animData) return <div className="w-12 h-12" />;
  return <Lottie animationData={animData} loop={true} style={{ width: '100%', height: '100%' }} />;
});

// ── 全球市场跑马灯卡片（独立组件，避免Home重渲染导致闪烁）────────────────────
const GlobalMarketStrip= React.memo(function GlobalMarketStrip() {
  const [, setLocation] = useLocation();
  const { data: goldPrice } = trpc.stock.getGoldPrice.useQuery(undefined, { refetchInterval: 3000, staleTime: 1000 });
  const { data: oilPrice } = trpc.stock.getOilPrice.useQuery(undefined, { refetchInterval: 3000, staleTime: 1000 });
  const { data: dollarIndex } = trpc.stock.getDollarIndex.useQuery(undefined, { refetchInterval: 3000, staleTime: 1000 });
  const { data: usdCnh } = trpc.stock.getUsdCnh.useQuery(undefined, { refetchInterval: 3000, staleTime: 1000 });
  const { data: btcPrice } = trpc.stock.getBtcPrice.useQuery(undefined, { refetchInterval: 5000, staleTime: 2000 });

  const [globalMarketStatus, setGlobalMarketStatus] = useState<'open' | 'closed'>(() => getGlobalMarketStatusOuter(new Date()));
  const [globalCountdown, setGlobalCountdown] = useState('');
  // 无缝循环轮播：内部索引从1开始（对应真实第1张），0和5是克隆卡片
  const [globalRealIndex, setGlobalRealIndex] = useState(1); // 1-4 对应真实卡片
  const [globalTransition, setGlobalTransition] = useState(true);
  const globalTouchStartX = useRef(0);
  const globalTouchStartY = useRef(0);
  const globalContainerRef = useRef<HTMLDivElement>(null);
  const [globalContainerWidth, setGlobalContainerWidth] = useState(0);
  const globalIsTransitioning = useRef(false);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const status = getGlobalMarketStatusOuter(now);
      setGlobalMarketStatus(status);
      if (status !== 'open') {
        const nextMs = getGlobalNextOpenTimeOuter(now);
        const diff = Math.max(0, nextMs - now.getTime());
        const totalSec = Math.floor(diff / 1000);
        const hh = Math.floor(totalSec / 3600);
        const mm = Math.floor((totalSec % 3600) / 60);
        const ss = totalSec % 60;
        setGlobalCountdown(`${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`);
      } else {
        setGlobalCountdown('');
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  // 自动轮播（无缝循环）
  useEffect(() => {
    const autoPlay = setInterval(() => {
      if (globalIsTransitioning.current) return;
      setGlobalTransition(true);
      setGlobalRealIndex(prev => prev + 1);
    }, 3000);
    return () => clearInterval(autoPlay);
  }, []);

  // 无缝循环：当滚到克隆卡片时，无动画跳回真实卡片
  // items 共 5 张，克隆后共 7 张 (index 0-6)，真实卡片 index 1-5
  useEffect(() => {
    if (globalRealIndex === 6) {  // 尾部克隆（第1张的克隆）
      // 滚到尾部克隆，延迟后无动画跳回真实第1张
      globalIsTransitioning.current = true;
      const t = setTimeout(() => {
        setGlobalTransition(false);
        setGlobalRealIndex(1);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setGlobalTransition(true);
            globalIsTransitioning.current = false;
          });
        });
      }, 320);
      return () => clearTimeout(t);
    } else if (globalRealIndex === 0) {
      // 滚到头部克隆（第5张的克隆），延迟后无动画跳回真实第5张
      globalIsTransitioning.current = true;
      const t = setTimeout(() => {
        setGlobalTransition(false);
        setGlobalRealIndex(5);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setGlobalTransition(true);
            globalIsTransitioning.current = false;
          });
        });
      }, 320);
      return () => clearTimeout(t);
    }
  }, [globalRealIndex]);

  // 监听容器宽度
  useEffect(() => {
    if (!globalContainerRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) setGlobalContainerWidth(entry.contentRect.width);
    });
    ro.observe(globalContainerRef.current);
    setGlobalContainerWidth(globalContainerRef.current.offsetWidth);
    return () => ro.disconnect();
  }, []);

  const CDN_ICONS = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK';
  // 内联 SVG 图标组件，无需外部 CDN
  const GoldIcon = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <circle cx="7" cy="7" r="7" fill="url(#goldGrad)"/>
      <defs>
        <radialGradient id="goldGrad" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#FFE066"/>
          <stop offset="45%" stopColor="#D4A017"/>
          <stop offset="100%" stopColor="#8B6914"/>
        </radialGradient>
      </defs>
      <text x="7" y="7" textAnchor="middle" dominantBaseline="central" fontSize="7" fontWeight="bold" fill="#fff" fontFamily="serif">Au</text>
    </svg>
  );
  const DxyIcon = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <defs>
        <radialGradient id="dxyBgGrad" cx="38%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#2a5aad"/>
          <stop offset="60%" stopColor="#1a3a6e"/>
          <stop offset="100%" stopColor="#0d1f3c"/>
        </radialGradient>
        <radialGradient id="dxyHighlight" cx="35%" cy="22%" r="45%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.45)"/>
          <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
        </radialGradient>
      </defs>
      <circle cx="7" cy="7" r="7" fill="url(#dxyBgGrad)"/>
      <circle cx="7" cy="7" r="7" fill="url(#dxyHighlight)"/>
      <text x="7" y="7" textAnchor="middle" dominantBaseline="central" fontSize="8" fontWeight="bold" fill="#FFD700" fontFamily="Arial,sans-serif" style={{ filter: 'drop-shadow(0px 1px 1px rgba(0,0,0,0.5))' }}>$</text>
    </svg>
  );
  const CnhIcon = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <defs>
        <radialGradient id="cnhBgGrad" cx="38%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#e82020"/>
          <stop offset="60%" stopColor="#cc0001"/>
          <stop offset="100%" stopColor="#7a0000"/>
        </radialGradient>
        <radialGradient id="cnhHighlight" cx="35%" cy="22%" r="45%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.45)"/>
          <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
        </radialGradient>
      </defs>
      <rect width="14" height="14" rx="7" fill="url(#cnhBgGrad)"/>
      <rect width="14" height="14" rx="7" fill="url(#cnhHighlight)"/>
      <text x="7" y="7" textAnchor="middle" dominantBaseline="central" fontSize="7.5" fontWeight="bold" fill="#FFD700" fontFamily="Arial,sans-serif" style={{ filter: 'drop-shadow(0px 1px 1px rgba(0,0,0,0.5))' }}>¥</text>
    </svg>
  );
  const BtcIcon = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <defs>
        <radialGradient id="btcBgGrad" cx="38%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#ff9500"/>
          <stop offset="55%" stopColor="#f7931a"/>
          <stop offset="100%" stopColor="#c05000"/>
        </radialGradient>
        <radialGradient id="btcHighlight" cx="35%" cy="22%" r="45%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.50)"/>
          <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
        </radialGradient>
      </defs>
      <circle cx="7" cy="7" r="7" fill="url(#btcBgGrad)"/>
      <circle cx="7" cy="7" r="7" fill="url(#btcHighlight)"/>
      <text x="7.2" y="7" textAnchor="middle" dominantBaseline="central" fontSize="7.5" fontWeight="bold" fill="white" fontFamily="Arial,sans-serif" style={{ filter: 'drop-shadow(0px 1px 1px rgba(0,0,0,0.4))' }}>₿</text>
    </svg>
  );
  const OilIcon = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <defs>
        <radialGradient id="oilCircleGrad" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#f8f8f8"/>
          <stop offset="100%" stopColor="#d0d0d0"/>
        </radialGradient>
        <radialGradient id="oilDropGrad" cx="38%" cy="28%" r="70%">
          <stop offset="0%" stopColor="#555555"/>
          <stop offset="40%" stopColor="#1a1a1a"/>
          <stop offset="100%" stopColor="#000000"/>
        </radialGradient>
        <radialGradient id="oilHighlight" cx="35%" cy="25%" r="40%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.55)"/>
          <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
        </radialGradient>
      </defs>
      {/* 白色圆形背景（带轻微灰色渐变增加立体感） */}
      <circle cx="7" cy="7" r="7" fill="url(#oilCircleGrad)" stroke="#c8c8c8" strokeWidth="0.4"/>
      {/* 黑色油滴（水滴形状：圆底+尖顶） */}
      <path d="M7 2.2 C7 2.2 4.2 6.0 4.2 8.0 C4.2 9.77 5.46 11.2 7 11.2 C8.54 11.2 9.8 9.77 9.8 8.0 C9.8 6.0 7 2.2 7 2.2 Z" fill="url(#oilDropGrad)"/>
      {/* 高光反射 */}
      <path d="M7 2.2 C7 2.2 4.2 6.0 4.2 8.0 C4.2 9.77 5.46 11.2 7 11.2 C8.54 11.2 9.8 9.77 9.8 8.0 C9.8 6.0 7 2.2 7 2.2 Z" fill="url(#oilHighlight)"/>
    </svg>
  );
  const items = [
    { key: 'gold', label: '黄金 XAU/USD', data: goldPrice,   unit: '/盎司', decimals: 1,
      iconType: 'svg' as const, IconComp: GoldIcon, link: '/gold-ai' },
    { key: 'oil',  label: '原油 WTI',      data: oilPrice,   unit: '/桶',   decimals: 2,
      iconType: 'svg' as const, IconComp: OilIcon },
    { key: 'dxy',  label: '美元指数 DXY',  data: dollarIndex, unit: '',    decimals: 3,
      iconType: 'svg' as const, IconComp: DxyIcon },
    { key: 'cnh',  label: 'USD/CNH',       data: usdCnh,     unit: '',      decimals: 4,
      iconType: 'svg' as const, IconComp: CnhIcon },
    { key: 'btc',  label: 'BTC/USDT',      data: btcPrice,   unit: '',
      decimals: (btcPrice?.success && (btcPrice.price ?? 0) >= 100000) ? 0 : 1,
      iconType: 'svg' as const, IconComp: BtcIcon, link: '/ledger/52/be-data?filter=crypto' },
  ];

  return (
    <div className="mx-3 flex-shrink-0" style={{ borderRadius: '12px', position: 'relative', marginTop: '2px',
      border: '1.5px solid rgba(180,185,195,0.8)',
      boxShadow: '0 4px 14px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(140,145,155,0.5)',
      background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, transparent 1px, transparent 2px), linear-gradient(160deg, #e2e4e8 0%, #c8cace 20%, #d8dadd 40%, #bfc1c6 60%, #d2d4d8 80%, #e0e2e6 100%)' }}>
      {/* 四角铆钉 */}
      {[{top:'4px',right:'5px'},{bottom:'4px',left:'5px'},{bottom:'4px',right:'5px'}].map((pos, i) => (
        <div key={i} style={{ position:'absolute', width:'5px', height:'5px', borderRadius:'50%', zIndex:10, ...pos,
          background: 'radial-gradient(circle at 35% 35%, #ffffff 0%, #d8dadd 35%, #a0a4aa 65%, #707478 100%)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.8)' }} />
      ))}
      {/* 可滑动卡片区域 */}
      <div
        ref={globalContainerRef}
        style={{ overflow: 'hidden', borderRadius: '12px', touchAction: 'pan-y' }}
        onTouchStart={(e) => {
          globalTouchStartX.current = e.touches[0].clientX;
          globalTouchStartY.current = e.touches[0].clientY;
        }}
        onTouchEnd={(e) => {
          const dx = e.changedTouches[0].clientX - globalTouchStartX.current;
          const dy = e.changedTouches[0].clientY - globalTouchStartY.current;
          if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30) {
            // 判断为横向滑动，切换卡片
            if (!globalIsTransitioning.current) {
              setGlobalTransition(true);
              if (dx < 0) setGlobalRealIndex(prev => prev + 1);
              if (dx > 0) setGlobalRealIndex(prev => prev - 1);
            }
          } else if (Math.abs(dx) <= 10 && Math.abs(dy) <= 10) {
            // 判断为点击（几乎没有移动），执行当前卡片的跳转
            // globalRealIndex: 0=克隆第5张, 1-5=真实卡片(items[0]-items[4]), 6=克隆第1张
            let realIdx: number;
            if (globalRealIndex === 0) realIdx = 4; // 克隆的第5张
            else if (globalRealIndex === 6) realIdx = 0; // 克隆的第1张
            else realIdx = globalRealIndex - 1; // 正常情况
            const currentItem = items[realIdx];
            if (currentItem && (currentItem as any).link) {
              setLocation((currentItem as any).link);
            }
          }
        }}
      >
        <div
          style={{
            display: 'flex',
            transform: `translateX(${globalRealIndex * -(globalContainerWidth || 0)}px)`,
            transition: globalTransition ? 'transform 0.3s cubic-bezier(0.4,0,0.2,1)' : 'none',
            willChange: 'transform',
          }}
        >
          {/* 克隆尾部卡片（第4张）放在最前，实现无缝向左循环 */}
          {[items[3], ...items, items[0]].map((item, idx) => (
            <div
              key={`${item.key}-${idx}`}
              style={{
                minWidth: globalContainerWidth > 0 ? `${globalContainerWidth}px` : '100%',
                maxWidth: globalContainerWidth > 0 ? `${globalContainerWidth}px` : '100%',
                boxSizing: 'border-box',
                padding: '6px 10px',
                cursor: (item as any).link ? 'pointer' : 'default',
              }}
            >
              <div className="flex items-center space-x-1 mb-1" style={{ whiteSpace: 'nowrap' }}>
                {item.iconType === 'img' ? (
                  <img src={(item as any).iconUrl} alt={item.key} style={{ width: '14px', height: '14px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                ) : item.iconType === 'svg' ? (
                  (() => { const IC = (item as any).IconComp; return <IC />; })()
                ) : (
                  <Globe className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#A80000' }} />
                )}
                <span className="text-xs font-semibold" style={{ color: '#222222', letterSpacing: '0.05em' }}>{item.label}</span>
              </div>
              <div className="flex items-baseline">
                {!item.data?.success ? (
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#A80000' }} />
                ) : (
                  <GoldFlipCounter total={Math.round((item.data.price ?? 0) * Math.pow(10, item.decimals))} unit={item.unit} decimals={item.decimals} fixedSize={26} />
                )}
              </div>
              <div className="flex items-center justify-between mt-1" style={{ gap: '4px' }}>
                {globalMarketStatus === 'open' ? (
                  <>
                    <div style={{ fontSize: '0.6rem', flexShrink: 0, whiteSpace: 'nowrap', color: '#333333' }}>开市中</div>
                    {item.data?.success && (
                      <span style={{ fontSize: '0.65rem', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
                        color: (item.data.change ?? 0) >= 0 ? '#A80000' : '#16a34a' }}>
                        {(item.data.change ?? 0) >= 0 ? '+' : ''}{(item.data.change ?? 0).toFixed(item.decimals)}
                        ({(item.data.change ?? 0) >= 0 ? '+' : ''}{(item.data.changePercent ?? 0).toFixed(2)}%)
                      </span>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: '0.6rem', flexShrink: 0, whiteSpace: 'nowrap', color: '#333333' }}>
                    休市中，离开市
                    {globalCountdown && (
                      <span style={{ marginLeft: '3px', color: '#B8860B', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                        {globalCountdown}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* 圆点指示器 - 映射到真实索引（1-5） */}
      <div className="flex items-center justify-center py-1" style={{ gap: '5px' }}>
        {[0, 1, 2, 3, 4].map((i) => {
          // globalRealIndex: 0=克隆第5张, 1-5=真实卡片, 6=克隆第1张
          const dotActive = globalRealIndex === 6 ? i === 0 : globalRealIndex === 0 ? i === 4 : i === globalRealIndex - 1;
          return (
            <div
              key={i}
              onClick={() => { setGlobalTransition(true); setGlobalRealIndex(i + 1); }}
              style={{
                width: dotActive ? '14px' : '5px',
                height: '5px',
                borderRadius: '3px',
                background: dotActive ? 'rgba(201,168,76,0.9)' : 'rgba(201,168,76,0.3)',
                transition: 'all 0.3s ease',
                cursor: 'pointer',
              }}
            />
          );
        })}
      </div>
    </div>
  );
});

// ─── 七巨头行情横向滑动条 ────────────────────────────────────────────────────
const MEGA_SEVEN_HOME = [
  { symbol: "AAPL.US", name: "苹果",   code: "AAPL",  emoji: "🍎" },
  { symbol: "MSFT.US", name: "微软",   code: "MSFT",  emoji: "🪟" },
  { symbol: "NVDA.US", name: "英伟达", code: "NVDA",  emoji: "🎮" },
  { symbol: "GOOGL.US",name: "谷歌",  code: "GOOGL", emoji: "🔍" },
  { symbol: "AMZN.US", name: "亚马逊", code: "AMZN", emoji: "📦" },
  { symbol: "META.US", name: "Meta",  code: "META",  emoji: "👓" },
  { symbol: "TSLA.US", name: "特斯拉", code: "TSLA", emoji: "⚡" },
];

const MegaSevenStrip = React.memo(function MegaSevenStrip() {
  const [, setLocation] = useLocation();
  const { data: latestPrices } = trpc.cryptoData.getLatestPrices.useQuery(
    undefined,
    { refetchInterval: 30000, staleTime: 15000 }
  );

  return (
    <div className="px-3 py-1.5" style={{ background: 'transparent' }}>
      {/* 标题行 */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold" style={{ color: 'rgba(201,168,76,0.9)', letterSpacing: '0.05em' }}>美股七巨头</span>
        <button
          onClick={() => setLocation('/us-stock-tracker')}
          className="text-xs"
          style={{ color: 'rgba(201,168,76,0.7)' }}
        >查看全部 ›</button>
      </div>
      {/* 横向滑动卡片 */}
      <div
        className="flex gap-2 overflow-x-auto"
        style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch', paddingBottom: '2px' }}
      >
        {MEGA_SEVEN_HOME.map((stock) => {
          const pd = latestPrices?.[stock.symbol];
          const isUp = (pd?.changePct ?? 0) >= 0;
          const color = isUp ? '#A80000' : '#16a34a';
          return (
            <div
              key={stock.symbol}
              className="flex-shrink-0 rounded-xl cursor-pointer active:opacity-80"
              style={{
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(201,168,76,0.2)',
                padding: '6px 10px',
                minWidth: '80px',
              }}
              onClick={() => setLocation(`/ledger/52/be-data?filter=stocks&symbol=${stock.symbol}`)}
            >
              <div className="flex items-center gap-1 mb-0.5">
                <span style={{ fontSize: 12 }}>{stock.emoji}</span>
                <span className="text-xs font-semibold" style={{ color: '#F5D78E', fontSize: 11 }}>{stock.code}</span>
              </div>
              {pd ? (
                <>
                  <div className="text-xs font-bold" style={{ color: '#FFFFFF', fontSize: 12 }}>
                    ${pd.close.toFixed(2)}
                  </div>
                  <div className="text-xs font-medium" style={{ color, fontSize: 10 }}>
                    {isUp ? '+' : ''}{(pd.changePct ?? 0).toFixed(2)}%
                  </div>
                </>
              ) : (
                <div className="text-xs" style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>--</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default function Home() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const isLiulifan = user?.username === 'liulifan';
  // 积分商城商品详情 - 跳转独立页面

  // 未登录时弹出登录提示，已登录则执行回调
  const requireLogin = useCallback((action?: () => void) => {
    if (!user) {
      toast('请先登录后使用此功能', {
        description: '登录后可查看个人人脉和账本数据',
        action: { label: '去登录', onClick: () => navigate('/login') },
        duration: 3000,
      });
      return false;
    }
    action?.();
    return true;
  }, [user, navigate]);
  const isJiang = user?.username === 'jiang';


  // 获取基础统计数据
  const { data: stats, isLoading, refetch, isFetching } = trpc.contacts.stats.useQuery(undefined, {
    refetchInterval: 60000,
    staleTime: 30000,
  });

  // 获取累计联络次数
  const { data: totalInteractionCount } = trpc.contacts.totalInteractionCount.useQuery();
  
  // 获取标签总数
  const { data: totalTagCount } = trpc.contacts.totalTagCount.useQuery();
  
  // 获取累计使用天数
  const { data: totalUsageDays } = trpc.contacts.getTotalUsageDays.useQuery();
  
  // 获取邀请统计
  const { data: inviteInfo } = trpc.invite.getMyInviteInfo.useQuery();

  // 获取全网人脉总数
  const { data: networkTotal } = trpc.stats.getNetworkTotal.useQuery(undefined, {
    staleTime: 60000,
    refetchInterval: 120000,
  });
  
  // 获取未读共享通知数量
  const { data: unreadSharingData } = trpc.sharing.getUnreadCount.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 30000,
  });
  const hasUnreadSharing = (unreadSharingData?.addedCount || 0) > 0 || (unreadSharingData?.removedCount || 0) > 0;
  
  // 获取晋升数据（用于显礼等级）
  const { data: promotionStats } = trpc.equity.getPromotionStats.useQuery();

  // 仅liulifan用户：获取需要关注的人数
  const { data: overviewStats } = trpc.contacts.overviewStats.useQuery(undefined, {
    enabled: isLiulifan,
    staleTime: 30000,
  });

  // 积分商城：获取平台共享商品列表（公开接口，无需登录）
  const { data: pointsShopProducts, isLoading: isLoadingShopProducts } = trpc.merchant.getPointsShopProducts.useQuery(
    { limit: 20 },
    { staleTime: 60000, refetchInterval: false }
  );
  // 积分商城：获取用户积分（登录后才请求）
  const { data: userPointsData, refetch: refetchPoints } = trpc.rewards.getPoints.useQuery(undefined, {
    enabled: !!user,
    staleTime: 30000,
  });
  // 全局钱包余额（不按账本隔离）
  const { data: walletBalance } = trpc.recharge.getBalance.useQuery(undefined, {
    staleTime: 30000,
    refetchInterval: 60000,
  });

  // 商品分类页：分类列表 + 选中分类 + 底部弹出状态
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  const { data: productCategories } = trpc.merchant.getCategories.useQuery(undefined, {
    staleTime: 300000,
  });
  // 取所有活跃分类，按sortOrder排序，最多15个
  const mainCategories = (productCategories || []).filter(c => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder).slice(0, 15);
  const { data: categoryProducts, isLoading: isLoadingCategoryProducts } = trpc.merchant.getProductsByCategory.useQuery(
    selectedCategoryId ? { categoryId: selectedCategoryId, limit: 50 } : undefined,
    { enabled: categorySheetOpen && selectedCategoryId !== null, staleTime: 60000 }
  );

  // 积分商城：兑换操作
  const redeemRewardMutation = trpc.rewards.redeemReward.useMutation({
    onSuccess: () => {
      toast.success('兑换成功！请到个人中心查看兑换记录');
      refetchPoints();
    },
    onError: (err) => {
      toast.error(err.message || '兑换失败，请稍后重试');
    },
  });

  // ── A股市场状态逻辑 ──────────────────────────────────────────
  // 2025-2026年A股法定节假日（不开市）
  const A_SHARE_HOLIDAYS = new Set([
    // 2025年
    '2025-01-01','2025-01-28','2025-01-29','2025-01-30','2025-01-31',
    '2025-02-03','2025-02-04',
    '2025-04-04','2025-04-05','2025-04-06',
    '2025-05-01','2025-05-02','2025-05-03','2025-05-04','2025-05-05',
    '2025-05-31','2025-06-02',
    '2025-10-01','2025-10-02','2025-10-03','2025-10-04','2025-10-05','2025-10-06','2025-10-07','2025-10-08',
    // 2026年
    '2026-01-01','2026-01-02',
    '2026-02-17','2026-02-18','2026-02-19','2026-02-20','2026-02-23','2026-02-24',
    '2026-04-06',
    '2026-05-01','2026-05-04','2026-05-05',
    '2026-06-19',
    '2026-10-01','2026-10-02','2026-10-05','2026-10-06','2026-10-07','2026-10-08',
  ]);
  // 全球市场（黄金/原油/外汇）美国联邦节假日 + 耶稣受难日（2025-2026年）
  // 这些日子全球大宗商品和外汇市场休市
  const GLOBAL_MARKET_HOLIDAYS = new Set([
    // 2025年
    '2025-01-01', // 元旦
    '2025-01-20', // 马丁路德金日
    '2025-02-17', // 总统日
    '2025-04-18', // 耶稣受难日（Good Friday，黄金/外汇特有）
    '2025-05-26', // 阵亡将士纪念日
    '2025-06-19', // 六月节（Juneteenth）
    '2025-07-04', // 独立日
    '2025-09-01', // 劳动节
    '2025-11-27', // 感恩节
    '2025-12-25', // 圣诞节
    // 2026年
    '2026-01-01', // 元旦
    '2026-01-19', // 马丁路德金日
    '2026-02-16', // 总统日
    '2026-04-03', // 耶稣受难日
    '2026-05-25', // 阵亡将士纪念日
    '2026-06-19', // 六月节
    '2026-07-04', // 独立日（周六，补休7月3日）
    '2026-09-07', // 劳动节
    '2026-11-26', // 感恩节
    '2026-12-25', // 圣诞节
  ]);

  // 全球市场开市状态：周一至周五非节假日 = 开市（几乎24小时）
  // 黄金/原油/外汇：周五 23:00 BJ 收盘，周一 06:00 BJ 开盘（近似）
  // 实际上外汇市场：周一 06:00 BJ - 周六 06:00 BJ，几乎不间断
  const getGlobalMarketStatus = (now: Date): 'open' | 'closed' => {
    const bj = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const day = bj.getUTCDay(); // 0=周日, 6=周六
    const dateStr = getBjDateStr(now);
    // 周六全天休市
    if (day === 6) return 'closed';
    // 周日：06:00 BJ 后开市（外汇市场周一亚洲开盘）
    if (day === 0) {
      const h = bj.getUTCHours();
      const m = bj.getUTCMinutes();
      return (h * 60 + m) >= 6 * 60 ? 'open' : 'closed';
    }
    // 周一至周五：检查节假日
    if (GLOBAL_MARKET_HOLIDAYS.has(dateStr)) return 'closed';
    // 周五：23:00 BJ 后收盘
    if (day === 5) {
      const h = bj.getUTCHours();
      const m = bj.getUTCMinutes();
      return (h * 60 + m) < 23 * 60 ? 'open' : 'closed';
    }
    // 周一至周四：全天开市
    return 'open';
  };

  // 全球市场下一个开市时间（返回 UTC ms）
  const getGlobalNextOpenTime = (now: Date): number => {
    const BJ_OFFSET = 8 * 60 * 60 * 1000;
    const nowMs = now.getTime();
    const bjDate = new Date(nowMs + BJ_OFFSET);
    const day = bjDate.getUTCDay();
    // 周六：等到周日 06:00 BJ
    if (day === 6) {
      const todayBjMidnight = Date.UTC(bjDate.getUTCFullYear(), bjDate.getUTCMonth(), bjDate.getUTCDate()) - BJ_OFFSET;
      return todayBjMidnight + 24 * 3600 * 1000 + 6 * 3600 * 1000; // 周日 06:00 BJ
    }
    // 周日 06:00 BJ 前：等到周日 06:00 BJ
    if (day === 0) {
      const todayBjMidnight = Date.UTC(bjDate.getUTCFullYear(), bjDate.getUTCMonth(), bjDate.getUTCDate()) - BJ_OFFSET;
      return todayBjMidnight + 6 * 3600 * 1000;
    }
    // 周五 23:00 BJ 后：等到下周一 00:00 BJ（实际是周日 06:00 BJ）
    if (day === 5) {
      const h = bjDate.getUTCHours();
      const m = bjDate.getUTCMinutes();
      if (h * 60 + m >= 23 * 60) {
        // 找下周一（跳过节假日）
        for (let i = 1; i <= 7; i++) {
          const cMs = nowMs + i * 24 * 3600 * 1000;
          const cBj = new Date(cMs + BJ_OFFSET);
          const cDay = cBj.getUTCDay();
          const cStr = `${cBj.getUTCFullYear()}-${String(cBj.getUTCMonth()+1).padStart(2,'0')}-${String(cBj.getUTCDate()).padStart(2,'0')}`;
          if (cDay === 0) return Date.UTC(cBj.getUTCFullYear(), cBj.getUTCMonth(), cBj.getUTCDate()) - BJ_OFFSET + 6 * 3600 * 1000;
          if (cDay !== 6 && !GLOBAL_MARKET_HOLIDAYS.has(cStr)) return Date.UTC(cBj.getUTCFullYear(), cBj.getUTCMonth(), cBj.getUTCDate()) - BJ_OFFSET;
        }
      }
    }
    // 节假日：找下一个工作日
    if (GLOBAL_MARKET_HOLIDAYS.has(getBjDateStr(now))) {
      for (let i = 1; i <= 7; i++) {
        const cMs = nowMs + i * 24 * 3600 * 1000;
        const cBj = new Date(cMs + BJ_OFFSET);
        const cDay = cBj.getUTCDay();
        const cStr = `${cBj.getUTCFullYear()}-${String(cBj.getUTCMonth()+1).padStart(2,'0')}-${String(cBj.getUTCDate()).padStart(2,'0')}`;
        if (cDay !== 0 && cDay !== 6 && !GLOBAL_MARKET_HOLIDAYS.has(cStr)) {
          return Date.UTC(cBj.getUTCFullYear(), cBj.getUTCMonth(), cBj.getUTCDate()) - BJ_OFFSET;
        }
      }
    }
    return nowMs + 3600 * 1000;
  };

  // 补班日（周末也开市）
  const A_SHARE_EXTRA_OPEN = new Set([
    '2025-01-26','2025-02-08','2025-04-27','2025-09-28','2025-10-11',
    '2026-02-15','2026-04-12','2026-09-27','2026-10-10',
  ]);

  const getBjDateStr = (d: Date) => {
    const bj = new Date(d.getTime() + 8 * 60 * 60 * 1000);
    const y = bj.getUTCFullYear();
    const mo = String(bj.getUTCMonth() + 1).padStart(2, '0');
    const da = String(bj.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${da}`;
  };

  // 返回市场状态: 'open' | 'lunch' | 'closed'
  const getMarketStatus = (now: Date): 'open' | 'lunch' | 'closed' => {
    const bj = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const dateStr = getBjDateStr(now);
    const day = bj.getUTCDay();
    const isWeekend = day === 0 || day === 6;
    const isHoliday = A_SHARE_HOLIDAYS.has(dateStr);
    const isExtraOpen = A_SHARE_EXTRA_OPEN.has(dateStr);
    if ((isWeekend || isHoliday) && !isExtraOpen) return 'closed';
    const h = bj.getUTCHours();
    const m = bj.getUTCMinutes();
    const mins = h * 60 + m;
    if (mins >= 9 * 60 + 30 && mins < 11 * 60 + 30) return 'open';
    if (mins >= 11 * 60 + 30 && mins < 13 * 60) return 'lunch';
    if (mins >= 13 * 60 && mins < 15 * 60) return 'open';
    return 'closed';
  };

  const isMarketOpen = () => getMarketStatus(new Date()) === 'open';

  // 计算下一个开市时间点（返回 UTC ms）
  // 注意：全程基于真实 UTC 时间戳计算，避免 BJ 偏移混用导致少 8 小时
  const getNextOpenTime = (now: Date): number => {
    const BJ_OFFSET = 8 * 60 * 60 * 1000;
    const nowMs = now.getTime();
    // 用 UTC 方法读取北京时间字段（bj 仅用于读取小时/分钟/星期，不用于计算 ms）
    const bjDate = new Date(nowMs + BJ_OFFSET);
    const h = bjDate.getUTCHours();
    const m = bjDate.getUTCMinutes();
    const mins = h * 60 + m;
    const status = getMarketStatus(now);

    // 当天 BJ 日期的 UTC midnight（即 BJ 当天 00:00 对应的 UTC 时间戳）
    const todayBjUtcMidnight = Date.UTC(
      bjDate.getUTCFullYear(), bjDate.getUTCMonth(), bjDate.getUTCDate()
    ) - BJ_OFFSET; // BJ midnight = UTC midnight - 8h

    // 如果是午休，下一个开市时间是当天 BJ 13:00
    if (status === 'lunch') {
      return todayBjUtcMidnight + (13 * 60) * 60 * 1000; // BJ 13:00
    }

    // 当天未开市（早于 BJ 9:30）
    const dateStr = getBjDateStr(now);
    const day = bjDate.getUTCDay();
    const isWeekend = day === 0 || day === 6;
    const isHoliday = A_SHARE_HOLIDAYS.has(dateStr);
    const isExtraOpen = A_SHARE_EXTRA_OPEN.has(dateStr);
    const todayIsOpen = (!isWeekend && !isHoliday) || isExtraOpen;
    if (todayIsOpen && mins < 9 * 60 + 30) {
      return todayBjUtcMidnight + (9 * 60 + 30) * 60 * 1000; // BJ 9:30
    }

    // 否则找下一个开市日
    for (let i = 1; i <= 10; i++) {
      // 候选日期：BJ 当天 + i 天的 UTC midnight
      const candidateBjUtcMidnight = todayBjUtcMidnight + i * 24 * 60 * 60 * 1000;
      const candidateBjDate = new Date(candidateBjUtcMidnight + BJ_OFFSET);
      const ds = `${candidateBjDate.getUTCFullYear()}-${String(candidateBjDate.getUTCMonth()+1).padStart(2,'0')}-${String(candidateBjDate.getUTCDate()).padStart(2,'0')}`;
      const cd = candidateBjDate.getUTCDay();
      const cIsWeekend = cd === 0 || cd === 6;
      const cIsHoliday = A_SHARE_HOLIDAYS.has(ds);
      const cIsExtra = A_SHARE_EXTRA_OPEN.has(ds);
      if ((!cIsWeekend && !cIsHoliday) || cIsExtra) {
        return candidateBjUtcMidnight + (9 * 60 + 30) * 60 * 1000; // BJ 9:30
      }
    }
    return nowMs + 24 * 60 * 60 * 1000;
  };

  // 港股市场状态判断（HKT = 北京时间，开市时间 9:30-12:00, 13:00-16:00）
  const getHKMarketStatus = (now: Date): 'open' | 'lunch' | 'closed' => {
    const bj = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const day = bj.getUTCDay();
    if (day === 0 || day === 6) return 'closed'; // 港股周末不开市
    const h = bj.getUTCHours();
    const m = bj.getUTCMinutes();
    const mins = h * 60 + m;
    if (mins >= 9 * 60 + 30 && mins < 12 * 60) return 'open';
    if (mins >= 12 * 60 && mins < 13 * 60) return 'lunch';
    if (mins >= 13 * 60 && mins < 16 * 60) return 'open';
    return 'closed';
  };

  // 港股下一个开市时间（返回 UTC ms）
  const getHKNextOpenTime = (now: Date): number => {
    const BJ_OFFSET = 8 * 60 * 60 * 1000;
    const nowMs = now.getTime();
    const bjDate = new Date(nowMs + BJ_OFFSET);
    const h = bjDate.getUTCHours();
    const m = bjDate.getUTCMinutes();
    const mins = h * 60 + m;
    const status = getHKMarketStatus(now);
    const todayBjUtcMidnight = Date.UTC(
      bjDate.getUTCFullYear(), bjDate.getUTCMonth(), bjDate.getUTCDate()
    ) - BJ_OFFSET;
    if (status === 'lunch') {
      return todayBjUtcMidnight + (13 * 60) * 60 * 1000; // BJ 13:00
    }
    const day = bjDate.getUTCDay();
    const todayIsOpen = day !== 0 && day !== 6;
    if (todayIsOpen && mins < 9 * 60 + 30) {
      return todayBjUtcMidnight + (9 * 60 + 30) * 60 * 1000; // BJ 9:30
    }
    // 找下一个工作日
    for (let i = 1; i <= 7; i++) {
      const candidateBjUtcMidnight = todayBjUtcMidnight + i * 24 * 60 * 60 * 1000;
      const candidateBjDate = new Date(candidateBjUtcMidnight + BJ_OFFSET);
      const cd = candidateBjDate.getUTCDay();
      if (cd !== 0 && cd !== 6) {
        return candidateBjUtcMidnight + (9 * 60 + 30) * 60 * 1000;
      }
    }
    return nowMs + 24 * 60 * 60 * 1000;
  };

  // 美股市场状态判断（美东时间 9:30-16:00，夏令时 BJ 21:30-04:00，冬令时 BJ 22:30-05:00）
  const getUSMarketStatus = (now: Date): 'open' | 'closed' => {
    const BJ_OFFSET = 8 * 60 * 60 * 1000;
    const bj = new Date(now.getTime() + BJ_OFFSET);
    const day = bj.getUTCDay();
    // 周六周日不开市
    if (day === 0 || day === 6) return 'closed';
    const h = bj.getUTCHours();
    const m = bj.getUTCMinutes();
    const mins = h * 60 + m;
    // 判断是否夏令时（美国夏令时为 3月4日 - 11月1日）
    const month = bj.getUTCMonth() + 1; // 1-12
    const date = bj.getUTCDate();
    // 简化判断：3月第二个周日后到11月第一个周日前为夏令时
    const isDST = (month > 3 || (month === 3 && date >= 8)) && (month < 11 || (month === 11 && date < 1));
    // 夏令时：BJ 21:30-04:00（次日）；冬令时：BJ 22:30-05:00（次日）
    const openMins = isDST ? 21 * 60 + 30 : 22 * 60 + 30;
    const closeMins = isDST ? 24 * 60 + 0 + 4 * 60 : 24 * 60 + 0 + 5 * 60; // 跨日
    // 当天 21:30+ 或次日 0:00-04:00
    if (mins >= openMins) return 'open';
    if (mins < (isDST ? 4 * 60 : 5 * 60)) {
      // 需要判断前一天是否周五（周五晚上开始到周六凌晨结束）
      const prevDay = day === 0 ? 6 : day - 1;
      if (prevDay !== 0) return 'open'; // 周一到周五的凌晨都算开市
    }
    return 'closed';
  };

  // 美股下一个开市时间（返回 UTC ms）
  const getUSNextOpenTime = (now: Date): number => {
    const BJ_OFFSET = 8 * 60 * 60 * 1000;
    const nowMs = now.getTime();
    const bjDate = new Date(nowMs + BJ_OFFSET);
    const month = bjDate.getUTCMonth() + 1;
    const date = bjDate.getUTCDate();
    const isDST = (month > 3 || (month === 3 && date >= 8)) && (month < 11 || (month === 11 && date < 1));
    const openHour = isDST ? 21 : 22;
    const openMin = 30;
    const todayBjUtcMidnight = Date.UTC(
      bjDate.getUTCFullYear(), bjDate.getUTCMonth(), bjDate.getUTCDate()
    ) - BJ_OFFSET;
    const h = bjDate.getUTCHours();
    const m = bjDate.getUTCMinutes();
    const mins = h * 60 + m;
    const day = bjDate.getUTCDay();
    // 当天未到开市时间且是工作日
    if (day !== 0 && day !== 6 && mins < openHour * 60 + openMin) {
      return todayBjUtcMidnight + (openHour * 60 + openMin) * 60 * 1000;
    }
    // 找下一个工作日
    for (let i = 1; i <= 7; i++) {
      const candidateBjUtcMidnight = todayBjUtcMidnight + i * 24 * 60 * 60 * 1000;
      const candidateBjDate = new Date(candidateBjUtcMidnight + BJ_OFFSET);
      const cd = candidateBjDate.getUTCDay();
      if (cd !== 0 && cd !== 6) {
        const cm = candidateBjDate.getUTCMonth() + 1;
        const cdate = candidateBjDate.getUTCDate();
        const cIsDST = (cm > 3 || (cm === 3 && cdate >= 8)) && (cm < 11 || (cm === 11 && cdate < 1));
        const cOpenHour = cIsDST ? 21 : 22;
        return candidateBjUtcMidnight + (cOpenHour * 60 + 30) * 60 * 1000;
      }
    }
    return nowMs + 24 * 60 * 60 * 1000;
  };

  // 市场状态和倒计时 state
  const [marketStatus, setMarketStatus] = useState<'open' | 'lunch' | 'closed'>(() => getMarketStatus(new Date()));
  const [hkMarketStatus, setHkMarketStatus] = useState<'open' | 'lunch' | 'closed'>(() => getHKMarketStatus(new Date()));
  const [usMarketStatus, setUsMarketStatus] = useState<'open' | 'closed'>(() => getUSMarketStatus(new Date()));
  const [countdown, setCountdown] = useState('');
  const [hkCountdown, setHkCountdown] = useState('');
  const [usCountdown, setUsCountdown] = useState('');

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const status = getMarketStatus(now);
      setMarketStatus(status);
      if (status !== 'open') {
        const nextMs = getNextOpenTime(now);
        const diff = Math.max(0, nextMs - now.getTime());
        const totalSec = Math.floor(diff / 1000);
        const hh = Math.floor(totalSec / 3600);
        const mm = Math.floor((totalSec % 3600) / 60);
        const ss = totalSec % 60;
        setCountdown(`${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`);
      } else {
        setCountdown('');
      }
      // 港股市场状态
      const hkStatus = getHKMarketStatus(now);
      setHkMarketStatus(hkStatus);
      if (hkStatus !== 'open') {
        const hkNextMs = getHKNextOpenTime(now);
        const hkDiff = Math.max(0, hkNextMs - now.getTime());
        const hkTotalSec = Math.floor(hkDiff / 1000);
        const hkHH = Math.floor(hkTotalSec / 3600);
        const hkMM = Math.floor((hkTotalSec % 3600) / 60);
        const hkSS = hkTotalSec % 60;
        setHkCountdown(`${String(hkHH).padStart(2,'0')}:${String(hkMM).padStart(2,'0')}:${String(hkSS).padStart(2,'0')}`);
      } else {
        setHkCountdown('');
      }
      // 美股市场状态
      const usStatus = getUSMarketStatus(now);
      setUsMarketStatus(usStatus);
      if (usStatus !== 'open') {
        const usNextMs = getUSNextOpenTime(now);
        const usDiff = Math.max(0, usNextMs - now.getTime());
        const usTotalSec = Math.floor(usDiff / 1000);
        const usHH = Math.floor(usTotalSec / 3600);
        const usMM = Math.floor((usTotalSec % 3600) / 60);
        const usSS = usTotalSec % 60;
        setUsCountdown(`${String(usHH).padStart(2,'0')}:${String(usMM).padStart(2,'0')}:${String(usSS).padStart(2,'0')}`);
      } else {
        setUsCountdown('');
      }
      // 全球市场状态已移至 GlobalMarketStrip 组件内部管理
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  // 获取上证指数实时数据
  // 注意：必须用 marketStatus state（每秒更新）来驱动 refetchInterval，
  // 不能用 isMarketOpen()（只在组件初始化时求值一次，之后不会随时间变化）
  const { data: shanghaiIndex } = trpc.stock.getShanghaiIndex.useQuery(undefined, {
    refetchInterval: marketStatus === 'open' ? 3000 : false,
    staleTime: 3000,
  });

  // 获取恒生指数实时数据（港股市场时间：9:30-12:00, 13:00-16:00 HKT）
  const { data: hangSengIndex } = trpc.stock.getHangSengIndex.useQuery(undefined, {
    refetchInterval: 5000, // 港股市场状态判断复杂，简化为定时刷新
    staleTime: 5000,
  });

  // 获取标普500实时数据（美股）
  const { data: sp500Index } = trpc.stock.getSP500Index.useQuery(undefined, {
    refetchInterval: usMarketStatus === 'open' ? 5000 : 60000,
    staleTime: 5000,
  });

  // 全球市场卡片已移至独立的 GlobalMarketStrip 组件
  // 股票卡片滑动状态（保留）
  // 股票卡片滑动状态
  const [stockCardIndex, setStockCardIndex] = useState(0);
  const [stockContainerWidth, setStockContainerWidth] = useState(0);
  const stockSwipeRef = useRef<HTMLDivElement>(null);
  const stockTouchStartX = useRef(0);
  const stockTouchStartY = useRef(0);
  useEffect(() => {
    if (!stockSwipeRef.current) return;
    const ro = new ResizeObserver(entries => {
      setStockContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(stockSwipeRef.current);
    setStockContainerWidth(stockSwipeRef.current.offsetWidth);
    return () => ro.disconnect();
  }, []);

  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  // AI 社交容器轮播 state
  const SOCIAL_PAGES = 3;
  const [socialPageIndex, setSocialPageIndex] = useState(1);
  const [socialTransition, setSocialTransition] = useState(true);
  const socialContainerRef = useRef<HTMLDivElement>(null);
  const [socialWidth, setSocialWidth] = useState(0);
  const socialTouchStartX = useRef(0);
  const socialTouchStartY = useRef(0);
  const socialIsTransitioning = useRef(false);
  const socialAutoTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const needsAttentionCount = overviewStats?.needsAttentionCount ?? 0;

  // 解决Safari PWA模式中点×/右滑返回时显示旧缓存数据的问题
  // 策略：记录当前用户ID，页面变为可见时检查用户是否变化，如果变化则强制导航到带时间戳的新URL
  const utils = trpc.useUtils();
  useEffect(() => {
    let hiddenTime = 0;
    
    // 记录当前页面加载时的用户token
    const currentToken = localStorage.getItem('auth-token') || '';
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenTime = Date.now();
      } else if (document.visibilityState === 'visible') {
        // 检查token是否变化（用户切换了）
        const newToken = localStorage.getItem('auth-token') || '';
        const tokenChanged = newToken !== currentToken;
        const wasHiddenLong = hiddenTime > 0 && (Date.now() - hiddenTime) > 2000;
        
        if (tokenChanged || wasHiddenLong) {
          // 强制同步Cookie
          if (newToken) {
            document.cookie = `app_session_id=${newToken}; path=/; max-age=${365 * 24 * 60 * 60}`;
          }
          // 用带时间戳的URL强制导航，彻底绕过Safari的所有缓存
          const baseUrl = window.location.pathname;
          window.location.replace(baseUrl + '?_t=' + Date.now());
          return;
        }
        hiddenTime = 0;
      }
    };
    
    // pageshow: 处理bfcache恢复场景
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        const newToken = localStorage.getItem('auth-token') || '';
        if (newToken) {
          document.cookie = `app_session_id=${newToken}; path=/; max-age=${365 * 24 * 60 * 60}`;
        }
        window.location.replace(window.location.pathname + '?_t=' + Date.now());
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, []);

  // 禁用右滑返回手势，避免用户滑动返回时看到旧缓存页面
  useEffect(() => {
    let startX = 0;
    const handleTouchStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
    };
    const handleTouchMove = (e: TouchEvent) => {
      const deltaX = e.touches[0].clientX - startX;
      // 如果从屏幕左侧边缘开始向右滑动，阻止默认行为
      if (startX < 30 && deltaX > 10) {
        e.preventDefault();
      }
    };
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
    };
  }, []);

  // 跳动动画：页面加载后如果有需要关注的人，启动跳动动画
  useEffect(() => {
    if (isLiulifan && needsAttentionCount > 0) {
      const timer = setTimeout(() => {
        setIsAnimating(true);
        // 跳动动画持续5秒后停止（但角标始终显示）
        setTimeout(() => setIsAnimating(false), 5000);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isLiulifan, needsAttentionCount]);


  // AI 社交轮播：ResizeObserver
  useEffect(() => {
    if (!socialContainerRef.current) return;
    const ro = new ResizeObserver(() => {
      if (socialContainerRef.current) setSocialWidth(socialContainerRef.current.offsetWidth);
    });
    ro.observe(socialContainerRef.current);
    setSocialWidth(socialContainerRef.current.offsetWidth);
    return () => ro.disconnect();
  }, []);

  // AI 社交轮播：无缝循环
  useEffect(() => {
    if (socialIsTransitioning.current) return;
    if (socialPageIndex === SOCIAL_PAGES + 1) {
      socialIsTransitioning.current = true;
      setSocialTransition(false);
      setTimeout(() => {
        setSocialPageIndex(1);
        setTimeout(() => { setSocialTransition(true); socialIsTransitioning.current = false; }, 20);
      }, 320);
    } else if (socialPageIndex === 0) {
      socialIsTransitioning.current = true;
      setSocialTransition(false);
      setTimeout(() => {
        setSocialPageIndex(SOCIAL_PAGES);
        setTimeout(() => { setSocialTransition(true); socialIsTransitioning.current = false; }, 20);
      }, 320);
    }
  }, [socialPageIndex]);

  // AI 社交轮播：自动轮播
  // AI 社交不自动轮播，只支持手动滑动

  const handleLogout = async () => {
    // 清除三层存储（localStorage + Cookie + IndexedDB）
    const { clearToken } = await import('@/lib/tokenStorage');
    await clearToken();
    navigate("/login");
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="bg-[#FAF3ED] max-w-md mx-auto relative shadow-2xl flex flex-col" style={{ height: '100dvh', overflow: 'hidden' }}>
      {/* 跳动动画的CSS */}
      <style>{`
        @keyframes bellShake {
          0% { transform: rotate(0deg); }
          10% { transform: rotate(14deg); }
          20% { transform: rotate(-12deg); }
          30% { transform: rotate(10deg); }
          40% { transform: rotate(-8deg); }
          50% { transform: rotate(6deg); }
          60% { transform: rotate(-4deg); }
          70% { transform: rotate(2deg); }
          80% { transform: rotate(-1deg); }
          90% { transform: rotate(1deg); }
          100% { transform: rotate(0deg); }
        }
        @keyframes badgePulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.2); }
        }
        .bell-shake {
          animation: bellShake 0.8s ease-in-out infinite;
        }
        .badge-pulse {
          animation: badgePulse 1s ease-in-out infinite;
        }
      `}</style>

      {/* ═══════════════════════════════════════════ */}
      {/* 上半区：AI 社交（静态）*/}
      {/* ═══════════════════════════════════════════ */}
      {/* AI 社交：手动滑动翻页 + 圆点指示器（无自动轮播）*/}
      {(() => {
        const realDotIndex = ((socialPageIndex - 1 + SOCIAL_PAGES) % SOCIAL_PAGES);
        const socialPages = [
          // 页1：功能入口
          <div key="p1" className="w-full h-full flex flex-col px-3 py-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-[#A80000] tracking-wide">AI 社交</span>
              <div onClick={handleRefresh} className="flex flex-col items-center cursor-pointer">
                <div className={`w-7 h-7 rounded-full bg-red-50 flex items-center justify-center hover:bg-red-100 transition-colors ${isFetching ? 'animate-spin' : ''}`}>
                  <RefreshCw className="w-3.5 h-3.5 text-[#A80000]" />
                </div>
                <span className="text-gray-400 mt-0.5" style={{ fontSize: '0.55rem' }}>刷新</span>
              </div>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center">
              <div style={{ width: 80, height: 80 }}>
                <UnderConstructionLottie />
              </div>
              <span className="text-xs text-gray-300 mt-1">装修升级中</span>
            </div>
          </div>,
          // 页2：蓄水池动画（原版全屏）
          <div key="p2" className="w-full h-full flex items-center justify-center">
            <div style={{ width: '100%', aspectRatio: '4/3' }}>
              <XushuchiLottie />
            </div>
          </div>,
          // 页3：积分商城（商品分类入口）
          <div key="p3" className="w-full h-full flex flex-col overflow-hidden">
            {/* 顶部标题 */}
            <div className="flex items-center justify-between px-3 pt-2 pb-1.5 flex-shrink-0">
              <div className="flex items-center space-x-1.5">
                <Gift className="w-3.5 h-3.5 text-[#A80000]" />
                <span className="text-xs font-semibold text-[#A80000]">积分商城</span>
              </div>
              <div className="flex items-center space-x-1">
                <Coins className="w-3 h-3 text-amber-500" />
                <span className="text-[10px] text-amber-600 font-medium">{userPointsData?.points ?? 0} 积分</span>
              </div>
            </div>
            {/* 15个分类入口 - 5列×3行 */}
            <div className="flex-1 overflow-hidden px-2 pb-1">
              <div className="grid grid-cols-5 h-full" style={{ gridTemplateRows: 'repeat(3, 1fr)' }}>
                {mainCategories.map((cat) => (
                  <button
                    key={cat.id}
                    className="flex flex-col items-center justify-center space-y-0.5 active:scale-90 transition-transform px-0.5"
                    onClick={() => {
                      setSelectedCategoryId(cat.id);
                      setCategorySheetOpen(true);
                    }}
                  >
                    {cat.iconUrl ? (
                      <img
                        src={cat.iconUrl}
                        alt={cat.name}
                        className="w-10 h-10 object-contain drop-shadow-sm"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                        <ShoppingBag className="w-5 h-5 text-gray-400" />
                      </div>
                    )}
                    <span className="text-[10px] text-gray-600 font-medium leading-tight text-center line-clamp-1">{cat.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>,
        ];
        const clonedPages = [socialPages[SOCIAL_PAGES - 1], ...socialPages, socialPages[0]];
        return (
          <div className="px-4 pt-3 flex-shrink-0" style={{ height: "42%" }}>
            <div className="w-full h-full rounded-2xl overflow-hidden relative bg-white shadow-sm flex flex-col">
              <div
                ref={socialContainerRef}
                className="flex-1 overflow-hidden"
                style={{ touchAction: 'pan-y' }}
                onTouchStart={e => {
                  socialTouchStartX.current = e.touches[0].clientX;
                  socialTouchStartY.current = e.touches[0].clientY;
                }}
                onTouchEnd={e => {
                  const dx = e.changedTouches[0].clientX - socialTouchStartX.current;
                  const dy = e.changedTouches[0].clientY - socialTouchStartY.current;
                  if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30) {
                    if (!socialIsTransitioning.current) {
                      setSocialTransition(true);
                      if (dx < 0) setSocialPageIndex(prev => prev + 1);
                      if (dx > 0) setSocialPageIndex(prev => prev - 1);
                    }
                  }
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    height: '100%',
                    transform: `translateX(${socialPageIndex * -(socialWidth || 0)}px)`,
                    transition: socialTransition ? 'transform 0.3s cubic-bezier(0.4,0,0.2,1)' : 'none',
                    willChange: 'transform',
                  }}
                >
                  {clonedPages.map((page, idx) => (
                    <div
                      key={idx}
                      style={{
                        minWidth: socialWidth > 0 ? `${socialWidth}px` : '100%',
                        maxWidth: socialWidth > 0 ? `${socialWidth}px` : '100%',
                        height: '100%',
                        boxSizing: 'border-box',
                        flexShrink: 0,
                      }}
                    >
                      {page}
                    </div>
                  ))}
                </div>
              </div>
              {/* 圆点指示器 */}
              <div className="flex justify-center items-center space-x-1.5 py-1.5 flex-shrink-0">
                {Array.from({ length: SOCIAL_PAGES }).map((_, i) => (
                  <div
                    key={i}
                    onClick={() => { setSocialTransition(true); setSocialPageIndex(i + 1); }}
                    style={{
                      width: realDotIndex === i ? '14px' : '6px',
                      height: '6px',
                      borderRadius: '3px',
                      background: realDotIndex === i ? '#A80000' : 'rgba(168,0,0,0.25)',
                      transition: 'all 0.3s ease',
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 备用占位符 */}


      {/* ═══════════════════════════════════════════ */}
      {/* 下半区：左 AI 人脉 + 右 AI 錢脉 */}
      {/* ═══════════════════════════════════════════ */}
      <div className="px-4 mt-2 pb-20 grid grid-cols-2 gap-2 flex-1 min-h-0">

        {/* ── 左：AI 人脉 ── */}
        <div className="rounded-2xl flex flex-col relative overflow-hidden" style={{
          height: '100%',
          overflow: 'hidden',
          background: 'linear-gradient(160deg, #FFFFFF 0%, #FAF3ED 60%, #F5EDE3 100%)',
          boxShadow: '0 4px 14px rgba(211,47,47,0.12), 0 1px 4px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,1)',
          border: '1px solid #E0E0E0',
          transform: 'translateY(-1px)'
        }}>
          {/* 顶部脏动红渐变高光线（与右侧金色线对称） */}
          <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: 'linear-gradient(90deg, transparent 5%, #D32F2F 30%, #CBA471 55%, #D32F2F 75%, transparent 95%)', borderRadius: '2px 2px 0 0' }} />
          {/* 背景淡红暖光晓装饰 */}
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at 15% 15%, rgba(211,47,47,0.04) 0%, transparent 55%), radial-gradient(circle at 85% 80%, rgba(203,164,113,0.05) 0%, transparent 50%)' }} />
          {/* 卡片头部：标题 */}
          <div className="flex items-center px-3 pt-3 pb-2 relative z-10">
            <span className="text-xs font-semibold" style={{ color: '#D32F2F', letterSpacing: '0.08em' }}>AI 人脉</span>
          </div>



          {/* 我的人脉 - 深红渐变容器，增强立体感 */}
          <div
            className="mx-3 rounded-xl px-3 py-2 cursor-pointer relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #8B0000 0%, #C0392B 45%, #A80000 100%)',
              boxShadow: '0 4px 14px rgba(168,0,0,0.45), 0 1px 3px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(0,0,0,0.15)'
            }}
            onClick={() => requireLogin(() => navigate('/parent/contacts/list?_t=' + Date.now()))}
          >
            {/* 内部高光 */}
            <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.15) 0%, transparent 60%)' }} />
            <div className="flex items-center space-x-1 mb-0.5 relative z-10" style={{ opacity: 0.9 }}>
              {/* 我的人脉 - 3D 人形圆形图标 */}
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 32 32" style={{ filter: 'drop-shadow(0px 1px 3px rgba(0,0,0,0.4))' }}>
                <defs>
                  <radialGradient id="my-contact-bg" cx="38%" cy="30%" r="65%">
                    <stop offset="0%" stopColor="#FF8A80"/>
                    <stop offset="45%" stopColor="#E53935"/>
                    <stop offset="100%" stopColor="#8B0000"/>
                  </radialGradient>
                  <radialGradient id="my-contact-shine" cx="35%" cy="25%" r="50%">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.55)"/>
                    <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
                  </radialGradient>
                  <clipPath id="my-contact-clip"><circle cx="16" cy="16" r="15"/></clipPath>
                </defs>
                {/* 圆形背景 */}
                <circle cx="16" cy="16" r="15" fill="url(#my-contact-bg)"/>
                {/* 人形图标 - 白色 */}
                <g clipPath="url(#my-contact-clip)" fill="rgba(255,255,255,0.92)">
                  {/* 头部 */}
                  <circle cx="16" cy="11" r="4.5"/>
                  {/* 身体 */}
                  <path d="M8 26c0-4.4 3.6-8 8-8s8 3.6 8 8H8z"/>
                </g>
                {/* 球面高光 */}
                <circle cx="16" cy="16" r="15" fill="url(#my-contact-shine)"/>
                {/* 圆形边框 */}
                <circle cx="16" cy="16" r="15" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8"/>
              </svg>
              <span className="text-white text-xs font-medium" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)', letterSpacing: '0.05em' }}>我的人脉</span>
            </div>
            <div className="flex items-baseline relative z-10">
              {isLoading ? (
                <Loader2 className="w-6 h-6 animate-spin text-white/60" />
              ) : (
                <RedFlipCounter total={stats?.totalContacts ?? 0} />
              )}
            </div>
          </div>

          {/* 全网人脉 - 淡金渐变容器，轻微凹陷内陷效果 */}
          <div className="mx-3 mt-1.5 rounded-xl px-3 py-2 relative overflow-hidden" style={{
            background: 'linear-gradient(135deg, #FFF8F0 0%, #FAF3ED 100%)',
            border: '1px solid rgba(203,164,113,0.4)',
            boxShadow: '0 2px 6px rgba(203,164,113,0.15), inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(203,164,113,0.1)'
          }}>
            <div className="flex items-center space-x-1 mb-0.5">
              {/* 全网人脉 - 3D 地球圆形图标 */}
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 32 32" style={{ filter: 'drop-shadow(0px 1px 3px rgba(0,0,0,0.25))' }}>
                <defs>
                  <radialGradient id="globe-bg" cx="38%" cy="30%" r="65%">
                    <stop offset="0%" stopColor="#FFF3D6"/>
                    <stop offset="45%" stopColor="#CBA471"/>
                    <stop offset="100%" stopColor="#8B6914"/>
                  </radialGradient>
                  <radialGradient id="globe-shine" cx="35%" cy="25%" r="50%">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.6)"/>
                    <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
                  </radialGradient>
                  <clipPath id="globe-clip"><circle cx="16" cy="16" r="15"/></clipPath>
                </defs>
                {/* 圆形背景 */}
                <circle cx="16" cy="16" r="15" fill="url(#globe-bg)"/>
                {/* 地球线条 - 白色半透明 */}
                <g clipPath="url(#globe-clip)" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="1.2">
                  {/* 赤道 */}
                  <ellipse cx="16" cy="16" rx="15" ry="15"/>
                  {/* 经线 */}
                  <ellipse cx="16" cy="16" rx="7" ry="15"/>
                  {/* 纬线 */}
                  <line x1="1" y1="16" x2="31" y2="16"/>
                  <ellipse cx="16" cy="16" rx="15" ry="6"/>
                </g>
                {/* 球面高光 */}
                <circle cx="16" cy="16" r="15" fill="url(#globe-shine)"/>
                {/* 圆形边框 */}
                <circle cx="16" cy="16" r="15" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8"/>
              </svg>
              <span className="text-xs font-medium" style={{ color: '#8B6914', letterSpacing: '0.04em' }}>全网人脉</span>
            </div>
            <div className="flex items-baseline">
              <RedFlipCounter total={networkTotal?.total ?? 0} unitColor="#CBA471" />
            </div>
          </div>

          {/* 四格小数据：公司数 / 标签数 / 累计联络 / 使用天数 */}
          <div className="grid grid-cols-2 gap-1 px-3 mt-1.5 relative z-10">
            {[
              { name: "公司总数", value: stats?.companyCount ?? 0, unit: "家", path: "/parent/contacts/list" },
              { name: "标签总数", value: totalTagCount ?? 0, unit: "个", path: "/parent/contacts/tags" },
              { name: "累计联络", value: totalInteractionCount ?? 0, unit: "次", path: "/parent/contacts/interaction-stats" },
              { name: "使用天数", value: totalUsageDays ?? 0, unit: "天", path: "" },
            ].map((item) => (
              <div
                key={item.name}
                onClick={() => item.path && requireLogin(() => navigate(item.path))}
                className={`rounded-lg py-1.5 flex flex-col items-center transition-all ${item.path ? 'cursor-pointer' : ''}`}
                style={{
                  background: 'linear-gradient(180deg, #FFFFFF 0%, #FAF3ED 100%)',
                  border: '1px solid #E0E0E0',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,1), inset 0 -1px 0 rgba(0,0,0,0.04)'
                }}
              >
                <span className="text-center leading-tight" style={{ fontSize: '0.6rem', color: '#757575' }}>{item.name}</span>
                <div className="flex items-baseline space-x-0.5 mt-0.5">
                  <span className="font-bold" style={{ fontSize: 'clamp(0.85rem, 3.5vw, 1.1rem)', color: '#222222' }}>
                    {formatNumber(item.value)}
                  </span>
                  <span style={{ fontSize: '0.6rem', color: '#757575' }}>{item.unit}</span>
                </div>
              </div>
            ))}
          </div>

          {/* 底部两个大图标：人脉共享 + 个人中心 */}
          <div className="grid grid-cols-2 gap-2 px-3 mt-1.5 mb-3 relative z-10">
            {/* 人脉共享 */}
            <div
              onClick={() => requireLogin(() => navigate("/parent/contacts/sharing"))}
              className="relative flex flex-col items-center justify-center py-3 rounded-xl cursor-pointer transition-all"
              style={{
                background: 'linear-gradient(180deg, #FFFFFF 0%, #FAF3ED 100%)',
                border: '1px solid #E0E0E0',
                boxShadow: '0 3px 8px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,1), inset 0 -1px 0 rgba(0,0,0,0.04)'
              }}
            >
              <div className="w-11 h-11 rounded-full flex items-center justify-center relative" style={{
                background: 'linear-gradient(145deg, #E53935 0%, #D32F2F 50%, #B71C1C 100%)',
                boxShadow: '0 4px 10px rgba(211,47,47,0.4), 0 1px 3px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.28)'
              }}>
                {/* 圆球高光 */}
                <div className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle at 35% 28%, rgba(255,255,255,0.32) 0%, transparent 55%)' }} />
                <Handshake className="w-5 h-5 text-white relative z-10" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.25))' }} />
              </div>
              <span className="text-xs mt-1 font-medium" style={{ color: '#D32F2F' }}>人脉共享</span>
              {hasUnreadSharing && user && (
                <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-[#F44336] rounded-full border border-white animate-pulse" style={{ boxShadow: '0 0 5px rgba(244,67,54,0.5)' }} />
              )}
            </div>
            {/* 个人中心 / 未登录时显示登录按钮 */}
            {user ? (
              <DropdownMenu open={profileMenuOpen} onOpenChange={setProfileMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <div className="flex flex-col items-center justify-center py-3 rounded-xl cursor-pointer transition-all" style={{
                    background: 'linear-gradient(180deg, #FFFFFF 0%, #FAF3ED 100%)',
                    border: '1px solid #E0E0E0',
                    boxShadow: '0 3px 8px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,1), inset 0 -1px 0 rgba(0,0,0,0.04)'
                  }}>
                    <div className="w-11 h-11 rounded-full flex items-center justify-center overflow-hidden relative" style={{
                      background: 'linear-gradient(145deg, #E53935 0%, #D32F2F 50%, #B71C1C 100%)',
                      boxShadow: '0 4px 10px rgba(211,47,47,0.4), 0 1px 3px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.28)',
                      border: '2px solid rgba(211,47,47,0.2)'
                    }}>
                      {/* 圆球高光 */}
                      {!user.avatar && <div className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle at 35% 28%, rgba(255,255,255,0.32) 0%, transparent 55%)' }} />}
                      {user.avatar ? (
                        <img src={user.avatar} alt="用户头像" className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-5 h-5 text-white relative z-10" />
                      )}
                    </div>
                    <span className="text-xs mt-1 font-medium" style={{ color: '#D32F2F' }}>个人中心</span>
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="center" className="w-full bg-[#FFF8F0] border-[#A80000]/20">
                  <DropdownMenuItem
                    onClick={() => { setProfileMenuOpen(false); navigate("/parent/profile"); }}
                    className="flex items-center cursor-pointer"
                  >
                    <UserCircle className="w-4 h-4 mr-2" />
                    <span>个人中心</span>
                  </DropdownMenuItem>
                  {isJiang && (
                    <DropdownMenuItem
                      onClick={() => { setProfileMenuOpen(false); navigate("/admin/super-view"); }}
                      className="flex items-center cursor-pointer"
                    >
                      <span className="w-4 h-4 mr-2 flex items-center justify-center text-xs font-bold text-[#D32F2F] bg-red-50 rounded-sm">润</span>
                      <span>全局视角</span>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={handleLogout} className="flex items-center cursor-pointer text-[#D32F2F]">
                    <LogOut className="w-4 h-4 mr-2" />
                    <span>退出登录</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              /* 未登录：显示登录按钮 */
              <div
                onClick={() => navigate('/login')}
                className="flex flex-col items-center justify-center py-3 rounded-xl cursor-pointer transition-all"
                style={{
                  background: 'linear-gradient(180deg, #FFFFFF 0%, #FAF3ED 100%)',
                  border: '1px solid #E0E0E0',
                  boxShadow: '0 3px 8px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,1), inset 0 -1px 0 rgba(0,0,0,0.04)'
                }}
              >
                <div className="w-11 h-11 rounded-full flex items-center justify-center relative" style={{
                  background: 'linear-gradient(145deg, #E53935 0%, #D32F2F 50%, #B71C1C 100%)',
                  boxShadow: '0 4px 10px rgba(211,47,47,0.4), 0 1px 3px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.28)'
                }}>
                  <div className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle at 35% 28%, rgba(255,255,255,0.32) 0%, transparent 55%)' }} />
                  <User className="w-5 h-5 text-white relative z-10" />
                </div>
                <span className="text-xs mt-1 font-medium" style={{ color: '#D32F2F' }}>点击登录</span>
              </div>
            )}
          </div>

        </div>

        {/* ── 右：AI 錢脉 ── */}
        <div className="rounded-2xl flex flex-col relative overflow-hidden" style={{
          height: '100%',
          overflow: 'hidden',
          background: 'linear-gradient(135deg, #111111 0%, #2a2a2a 45%, #1a1a1a 100%)',
          boxShadow: '0 6px 20px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
          border: '1px solid rgba(201,168,76,0.6)',
          transform: 'translateY(-1px)'
        }}>
          {/* 顶部金色高光线 */}
          <div className="absolute inset-x-0 top-0 h-px" style={{ background: 'linear-gradient(90deg, transparent 5%, #F5D78E 40%, #C9A84C 60%, transparent 95%)' }} />
          {/* 卡片头部：标题 */}
          <div className="flex items-center justify-between px-3 pt-3 pb-2 flex-shrink-0">
            <span className="text-xs font-semibold tracking-wide" style={{ color: '#F5D78E' }}>AI 錢脉</span>
          </div>

          {/* 可左右滑动的股票卡片区域：A股 + 港股 + 美股 */}
          <div
            ref={stockSwipeRef}
            className="mx-3 flex-shrink-0"
            style={{
              touchAction: 'pan-y',
              position: 'relative',
              borderRadius: '12px',
              border: '1.5px solid rgba(180,185,195,0.8)',
              boxShadow: '0 4px 14px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(140,145,155,0.5)',
              background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, transparent 1px, transparent 2px), linear-gradient(160deg, #e2e4e8 0%, #c8cace 20%, #d8dadd 40%, #bfc1c6 60%, #d2d4d8 80%, #e0e2e6 100%)',
              overflow: 'hidden',
              marginBottom: '6px',
            }}
            onTouchStart={(e) => {
              stockTouchStartX.current = e.touches[0].clientX;
              stockTouchStartY.current = e.touches[0].clientY;
            }}
            onTouchEnd={(e) => {
              const dx = e.changedTouches[0].clientX - stockTouchStartX.current;
              const dy = e.changedTouches[0].clientY - stockTouchStartY.current;
              if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30) {
                if (dx < 0) setStockCardIndex(prev => Math.min(prev + 1, 2));
                if (dx > 0) setStockCardIndex(prev => Math.max(prev - 1, 0));
              }
            }}
          >
            {/* 四角铆钉 */}
            {[{top:'4px',right:'5px'},{bottom:'4px',left:'5px'},{bottom:'4px',right:'5px'}].map((pos, i) => (
              <div key={i} style={{ position:'absolute', width:'5px', height:'5px', borderRadius:'50%', zIndex:10, ...pos,
                background: 'radial-gradient(circle at 35% 35%, #ffffff 0%, #d8dadd 35%, #a0a4aa 65%, #707478 100%)',
                boxShadow: '0 1px 2px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.8)' }} />
            ))}
            <div
              className="flex"
              style={{
                transform: `translateX(${stockCardIndex * -stockContainerWidth}px)`,
                transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
                willChange: 'transform',
              }}
            >
              {/* 卡片1：我的A股 */}
              <div
                className="flex-shrink-0 cursor-pointer"
                style={{
                  minWidth: stockContainerWidth > 0 ? `${stockContainerWidth}px` : '100%',
                  maxWidth: stockContainerWidth > 0 ? `${stockContainerWidth}px` : '100%',
                  boxSizing: 'border-box',
                  padding: '6px 10px',
                }}
                onClick={() => navigate('/stock-tracker')}
              >
                <div className="flex items-center space-x-1 mb-1" style={{ whiteSpace: 'nowrap' }}>
                  {/* 中国国旗圆形图标 - circle-flags 风格 */}
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 512 512" className="flex-shrink-0" style={{ filter: 'drop-shadow(0px 1px 2px rgba(0,0,0,0.35))' }}>
                    <defs>
                      <mask id="cn-mask"><circle cx="256" cy="256" r="256" fill="#fff"/></mask>
                      <radialGradient id="cn-shine" cx="38%" cy="28%" r="55%">
                        <stop offset="0%" stopColor="rgba(255,255,255,0.40)"/>
                        <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
                      </radialGradient>
                    </defs>
                    <g mask="url(#cn-mask)">
                      <path fill="#d80027" d="M0 0h512v512H0z"/>
                      <path fill="#ffda44" d="m140.1 155.8 22.1 68h71.5l-57.8 42.1 22.1 68-57.9-42-57.9 42 22.2-68-57.9-42.1H118zm163.4 240.7-16.9-20.8-25 9.7 14.5-22.5-16.9-20.9 25.9 6.9 14.6-22.5 1.4 26.8 26 6.9-25.1 9.6zm33.6-61 8-25.6-21.9-15.5 26.8-.4 7.9-25.6 8.7 25.4 26.8-.3-21.5 16 8.6 25.4-21.9-15.5zm45.3-147.6L370.6 212l19.2 18.7-26.5-3.8-11.8 24-4.6-26.4-26.6-3.8 23.8-12.5-4.6-26.5 19.2 18.7zm-78.2-73-2 26.7 24.9 10.1-26.1 6.4-1.9 26.8-14.1-22.8-26.1 6.4 17.3-20.5-14.2-22.7 24.9 10.1z"/>
                      <circle cx="256" cy="256" r="256" fill="url(#cn-shine)"/>
                    </g>
                  </svg>
                  <span className="text-xs font-semibold" style={{ color: '#333333', letterSpacing: '0.05em' }}>我的A股</span>
                </div>
                <div className="flex items-baseline">
                  {!shanghaiIndex?.success ? (
                    <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#A80000' }} />
                  ) : (
                    <GoldFlipCounter total={Math.round((shanghaiIndex.price ?? 0) * 100)} decimals={2} fixedSize={26} />
                  )}
                </div>
                <div className="flex items-center justify-between mt-1" style={{ gap: '4px' }}>
                  {marketStatus === 'open' ? (
                    <>
                      <div style={{ fontSize: '0.6rem', flexShrink: 0, whiteSpace: 'nowrap', color: '#333333' }}>开市中</div>
                      {shanghaiIndex?.success && (
                        <span style={{ fontSize: '0.65rem', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
                          color: (shanghaiIndex.change ?? 0) >= 0 ? '#A80000' : '#16a34a' }}>
                          {(shanghaiIndex.change ?? 0) >= 0 ? '+' : ''}{(shanghaiIndex.change ?? 0).toFixed(2)}
                          ({(shanghaiIndex.change ?? 0) >= 0 ? '+' : ''}{(shanghaiIndex.changePercent ?? 0).toFixed(2)}%)
                        </span>
                      )}
                    </>
                  ) : (
                    <div style={{ fontSize: '0.6rem', flexShrink: 0, whiteSpace: 'nowrap', color: '#333333' }}>
                      {marketStatus === 'lunch' ? '午休中' : '休市中'}，离开市
                      {countdown && (
                        <span style={{ marginLeft: '3px', color: '#B8860B', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                          {countdown}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* 卡片2：我的港股 */}
              <div
                className="flex-shrink-0 cursor-pointer"
                onClick={() => navigate('/hk-stock-tracker')}
                style={{
                  minWidth: stockContainerWidth > 0 ? `${stockContainerWidth}px` : '100%',
                  maxWidth: stockContainerWidth > 0 ? `${stockContainerWidth}px` : '100%',
                  boxSizing: 'border-box',
                  padding: '6px 10px',
                }}
              >
                <div className="flex items-center space-x-1 mb-1" style={{ whiteSpace: 'nowrap' }}>
                  {/* 香港区旗圆形图标 - circle-flags 风格 */}
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 512 512" className="flex-shrink-0" style={{ filter: 'drop-shadow(0px 1px 2px rgba(0,0,0,0.35))' }}>
                    <defs>
                      <mask id="hk-mask"><circle cx="256" cy="256" r="256" fill="#fff"/></mask>
                      <radialGradient id="hk-shine" cx="38%" cy="28%" r="55%">
                        <stop offset="0%" stopColor="rgba(255,255,255,0.40)"/>
                        <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
                      </radialGradient>
                    </defs>
                    <g mask="url(#hk-mask)">
                      <path fill="#d80027" d="M0 0h512v512H0z"/>
                      <path fill="#eee" d="M282.4 193.7c-5.8 24.2-16.1 19.6-21.2 40.7a55.7 55.7 0 0 1 26-108.3c-10.1 42.2.4 46-4.8 67.6zM205 211.6c21.2 13 13.6 21.4 32.1 32.8a55.7 55.7 0 0 1-94.9-58.2c37 22.7 43.8 13.8 62.8 25.4zm-7 79.3c19-16.2 24.7-6.4 41.2-20.4a55.7 55.7 0 0 1-84.7 72.2c33-28.2 26.6-37.4 43.6-51.8zm73.4 31c-9.6-23 1.5-25.3-6.8-45.3a55.7 55.7 0 0 1 42.6 102.8c-16.6-40-27.3-36.9-35.8-57.4zm52.2-60c-24.9 2-23.7-9.3-45.3-7.6a55.7 55.7 0 0 1 111-8.7c-43.3 3.4-43.6 14.5-65.7 16.3z"/>
                      <circle cx="256" cy="256" r="256" fill="url(#hk-shine)"/>
                    </g>
                  </svg>
                  <span className="text-xs font-semibold" style={{ color: '#333333', letterSpacing: '0.05em' }}>我的港股</span>
                </div>
                <div className="flex items-baseline">
                  {!hangSengIndex?.success ? (
                    <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#A80000' }} />
                  ) : (
                    <GoldFlipCounter total={Math.round((hangSengIndex.price ?? 0) * 100)} decimals={2} fixedSize={26} />
                  )}
                </div>
                <div className="flex items-center justify-between mt-1" style={{ gap: '4px' }}>
                  {hkMarketStatus === 'open' ? (
                    <>
                      <div style={{ fontSize: '0.6rem', flexShrink: 0, whiteSpace: 'nowrap', color: '#333333' }}>开市中</div>
                      {hangSengIndex?.success && (
                        <span style={{ fontSize: '0.65rem', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
                          color: (hangSengIndex.change ?? 0) >= 0 ? '#A80000' : '#16a34a' }}>
                          {(hangSengIndex.change ?? 0) >= 0 ? '+' : ''}{(hangSengIndex.change ?? 0).toFixed(2)}
                          ({(hangSengIndex.change ?? 0) >= 0 ? '+' : ''}{(hangSengIndex.changePercent ?? 0).toFixed(2)}%)
                        </span>
                      )}
                    </>
                  ) : (
                    <div style={{ fontSize: '0.6rem', flexShrink: 0, whiteSpace: 'nowrap', color: '#333333' }}>
                      {hkMarketStatus === 'lunch' ? '午休中' : '休市中'}，离开市
                      {hkCountdown && (
                        <span style={{ marginLeft: '3px', color: '#B8860B', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                          {hkCountdown}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* 卡片3：我的美股 */}
              <div
                className="flex-shrink-0"
                onClick={() => navigate('/us-stock-tracker')}
                style={{
                  cursor: 'pointer',
                  minWidth: stockContainerWidth > 0 ? `${stockContainerWidth}px` : '100%',
                  maxWidth: stockContainerWidth > 0 ? `${stockContainerWidth}px` : '100%',
                  boxSizing: 'border-box',
                  padding: '6px 10px',
                }}
              >
                <div className="flex items-center space-x-1 mb-1" style={{ whiteSpace: 'nowrap' }}>
                  {/* 美国国旗圆形图标 - circle-flags 风格 */}
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 512 512" className="flex-shrink-0" style={{ filter: 'drop-shadow(0px 1px 2px rgba(0,0,0,0.35))' }}>
                    <defs>
                      <mask id="us-mask"><circle cx="256" cy="256" r="256" fill="#fff"/></mask>
                      <radialGradient id="us-shine" cx="38%" cy="28%" r="55%">
                        <stop offset="0%" stopColor="rgba(255,255,255,0.40)"/>
                        <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
                      </radialGradient>
                    </defs>
                    <g mask="url(#us-mask)">
                      <path fill="#eee" d="M256 0h256v64l-32 32 32 32v64l-32 32 32 32v64l-32 32 32 32v64l-256 32L0 448v-64l32-32-32-32v-64z"/>
                      <path fill="#d80027" d="M224 64h288v64H224Zm0 128h288v64H256ZM0 320h512v64H0Zm0 128h512v64H0Z"/>
                      <path fill="#0052b4" d="M0 0h256v256H0Z"/>
                      <path fill="#eee" d="m187 243 57-41h-70l57 41-22-67zm-81 0 57-41H93l57 41-22-67zm-81 0 57-41H12l57 41-22-67zm162-81 57-41h-70l57 41-22-67zm-81 0 57-41H93l57 41-22-67zm-81 0 57-41H12l57 41-22-67Zm162-82 57-41h-70l57 41-22-67Zm-81 0 57-41H93l57 41-22-67zm-81 0 57-41H12l57 41-22-67Z"/>
                      <circle cx="256" cy="256" r="256" fill="url(#us-shine)"/>
                    </g>
                  </svg>
                  <span className="text-xs font-semibold" style={{ color: '#333333', letterSpacing: '0.05em' }}>我的美股</span>
                </div>
                <div className="flex items-baseline">
                  {!sp500Index?.success ? (
                    <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#A80000' }} />
                  ) : (
                    <GoldFlipCounter total={Math.round((sp500Index.price ?? 0) * 100)} decimals={2} fixedSize={26} />
                  )}
                </div>
                <div className="flex items-center justify-between mt-1" style={{ gap: '4px' }}>
                  {usMarketStatus === 'open' ? (
                    <>
                      <div style={{ fontSize: '0.6rem', flexShrink: 0, whiteSpace: 'nowrap', color: '#333333' }}>开市中</div>
                      {sp500Index?.success && (
                        <span style={{ fontSize: '0.65rem', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
                          color: (sp500Index.change ?? 0) >= 0 ? '#A80000' : '#16a34a' }}>
                          {(sp500Index.change ?? 0) >= 0 ? '+' : ''}{(sp500Index.change ?? 0).toFixed(2)}
                          ({(sp500Index.change ?? 0) >= 0 ? '+' : ''}{(sp500Index.changePercent ?? 0).toFixed(2)}%)
                        </span>
                      )}
                    </>
                  ) : (
                    <div style={{ fontSize: '0.6rem', flexShrink: 0, whiteSpace: 'nowrap', color: '#333333' }}>
                      休市中，离开市
                      {usCountdown && (
                        <span style={{ marginLeft: '3px', color: '#B8860B', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                          {usCountdown}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            {/* 圆点指示器 - 在容器内部 */}
            <div className="flex items-center justify-center py-1" style={{ gap: '5px' }}>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  onClick={() => setStockCardIndex(i)}
                  style={{
                    width: stockCardIndex === i ? '14px' : '5px',
                    height: '5px',
                    borderRadius: '3px',
                    background: stockCardIndex === i ? 'rgba(201,168,76,0.9)' : 'rgba(201,168,76,0.3)',
                    transition: 'all 0.3s ease',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
          </div>

          {/* 全球市场跑马灯卡片（独立组件，避免Home重渲染导致闪烁） */}
          <GlobalMarketStrip />

          {/* 美股七巨头行情横向滑动条 */}
          <MegaSevenStrip />

          {/* 三个功能入口 - flex-1撑满剩余空间 */}
          <div className="px-3 pt-1.5 pb-2 flex flex-col flex-1 min-h-0 gap-1.5">
            {/* 第一行：智能财务 + 智能会计 */}
            <div className="grid grid-cols-2 gap-2 flex-1">
              {/* 智能财务 - 黑白金立体风格 */}
              <div
                className="flex flex-col rounded-xl cursor-pointer active:scale-[0.98] relative overflow-hidden"
                style={{
                  background: 'linear-gradient(135deg, #111111 0%, #2a2a2a 45%, #1a1a1a 100%)',
                  boxShadow: '0 6px 20px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
                  border: '1px solid rgba(201,168,76,0.6)',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  padding: '6px 10px',
                }}
              >
                {/* 顶部金色高光线 */}
                <div className="absolute inset-x-0 top-0 h-px" style={{ background: 'linear-gradient(90deg, transparent 5%, #F5D78E 40%, #C9A84C 60%, transparent 95%)' }} />
                {/* 底部暗影线 */}
                <div className="absolute inset-x-0 bottom-0 h-px" style={{ background: 'rgba(0,0,0,0.4)' }} />
                <div className="flex items-center space-x-1 mb-1">
                  <BarChart2 className="w-3.5 h-3.5" style={{ color: '#C9A84C', filter: 'drop-shadow(0 1px 2px rgba(201,168,76,0.5))' }} />
                  <span className="text-xs font-semibold" style={{ color: '#F5D78E', letterSpacing: '0.05em' }}>智能财务</span>
                </div>
                <div className="flex-1" />
              </div>
              {/* 智能会计 - 黑白金立体风格 */}
              <div
                className="flex flex-col rounded-xl cursor-pointer active:scale-[0.98] relative overflow-hidden"
                style={{
                  background: 'linear-gradient(135deg, #111111 0%, #2a2a2a 45%, #1a1a1a 100%)',
                  boxShadow: '0 6px 20px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
                  border: '1px solid rgba(201,168,76,0.6)',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  padding: '6px 10px',
                }}
              >
                {/* 顶部金色高光线 */}
                <div className="absolute inset-x-0 top-0 h-px" style={{ background: 'linear-gradient(90deg, transparent 5%, #F5D78E 40%, #C9A84C 60%, transparent 95%)' }} />
                {/* 底部暗影线 */}
                <div className="absolute inset-x-0 bottom-0 h-px" style={{ background: 'rgba(0,0,0,0.4)' }} />
                <div className="flex items-center space-x-1 mb-1">
                  <FileText className="w-3.5 h-3.5" style={{ color: '#C9A84C', filter: 'drop-shadow(0 1px 2px rgba(201,168,76,0.5))' }} />
                  <span className="text-xs font-semibold" style={{ color: '#F5D78E', letterSpacing: '0.05em' }}>智能会计</span>
                </div>
                <div className="flex-1" />
              </div>
            </div>
            {/* 第二行：智能钱包（横向宽条）- 黑白金立体风格，点击跳转全局钱包 */}
            <div
              className="flex flex-col rounded-xl cursor-pointer active:scale-[0.98] flex-1 relative overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, #111111 0%, #2a2a2a 45%, #1a1a1a 100%)',
                boxShadow: '0 6px 20px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
                border: '1px solid rgba(201,168,76,0.6)',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                padding: '6px 10px',
              }}
              onClick={() => requireLogin(() => navigate('/wallet'))}
            >
              {/* 顶部金色高光线 */}
              <div className="absolute inset-x-0 top-0 h-px" style={{ background: 'linear-gradient(90deg, transparent 5%, #F5D78E 40%, #C9A84C 60%, transparent 95%)' }} />
              {/* 底部暗影线 */}
              <div className="absolute inset-x-0 bottom-0 h-px" style={{ background: 'rgba(0,0,0,0.4)' }} />
              {/* 标题行 */}
              <div className="flex items-center space-x-1 mb-1" style={{ whiteSpace: 'nowrap' }}>
                <div style={{ width: 14, height: 14, overflow: 'visible', position: 'relative', flexShrink: 0, marginLeft: -16 }}>
                  <div style={{
                    width: 400,
                    height: 400,
                    transform: 'scale(0.07)',
                    transformOrigin: 'bottom left',
                    position: 'absolute',
                    bottom: -3,
                    left: 0,
                  }}>
                    <WalletLottie />
                  </div>
                </div>
                <span className="text-xs font-semibold" style={{ color: '#F5D78E', letterSpacing: '0.05em', marginLeft: 12 }}>智能钱包</span>
              </div>
              {/* 余额展示 */}
              <div className="flex items-baseline space-x-1 relative z-10">
                <span className="font-bold tabular-nums" style={{ color: '#F5D78E', fontSize: '15px', lineHeight: 1.2 }}>
                  {typeof walletBalance === 'number' ? walletBalance.toFixed(2) : '--'}
                </span>
                <span className="text-xs" style={{ color: 'rgba(245,215,142,0.6)' }}>USDT</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* 商品分类底部弹出层 */}
      {categorySheetOpen && (
        <>
          {/* 遮罩 */}
          <div
            className="fixed inset-0 z-50 bg-black/40"
            onClick={() => setCategorySheetOpen(false)}
          />
          {/* 底部弹出面板 */}
          <div
            className="fixed left-0 right-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-2xl flex flex-col"
            style={{ height: '67vh', maxWidth: 480, margin: '0 auto' }}
          >
            {/* 拉条 */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-4 pb-3 flex-shrink-0 border-b border-gray-100">
              <div className="flex items-center space-x-2">
                {(() => {
                  const selCat = (productCategories || []).find(c => c.id === selectedCategoryId);
                  return (
                    <>
                      {selCat?.iconUrl && (
                        <img src={selCat.iconUrl} alt={selCat.name} className="w-7 h-7 object-contain" />
                      )}
                      <span className="text-base font-bold text-gray-800">{selCat?.name ?? ''}</span>
                      {selCat?.description && <span className="text-xs text-gray-400">{selCat.description}</span>}
                    </>
                  );
                })()}
              </div>
              <button
                className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
                onClick={() => setCategorySheetOpen(false)}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {/* 商品列表 */}
            <div className="flex-1 overflow-y-auto px-4 py-3" style={{ WebkitOverflowScrolling: 'touch' }}>
              {isLoadingCategoryProducts ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
                </div>
              ) : !categoryProducts || categoryProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-300">
                  <ShoppingBag className="w-10 h-10 mb-3 opacity-40" />
                  <span className="text-sm">暂无商品，敲请期待</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {categoryProducts.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 bg-gray-50 rounded-2xl p-3 active:bg-gray-100 transition-colors cursor-pointer"
                      onClick={() => {
                        setCategorySheetOpen(false);
                        navigate('/merchant-product/' + item.id);
                      }}
                    >
                      {/* 商品图片：优先使用 thumbnailUrl（列表预览图），没有则降级用 mainImageUrl */}
                      <div className="relative flex-shrink-0 w-20 h-20">
                        {(item.thumbnailUrl || item.mainImageUrl) ? (
                          <img
                            src={item.thumbnailUrl || item.mainImageUrl}
                            alt={item.name}
                            className="w-20 h-20 object-cover rounded-xl"
                          />
                        ) : (
                          <div className="w-20 h-20 bg-red-50 rounded-xl flex items-center justify-center">
                            <ShoppingBag className="w-8 h-8 text-[#A80000] opacity-40" />
                          </div>
                        )}
                        {/* 蓝白角标：紧贴左下角，双段文字，无间距 */}
                        {(item as any).badgeEnabled === 1 && ((item as any).badgeLeftText || (item as any).badgeText) && (
                          <div
                            className="absolute bottom-0 left-0 flex items-stretch overflow-hidden shadow-sm"
                            style={{ borderRadius: '0 4px 0 8px', fontSize: '9px', lineHeight: '16px', height: '16px' }}
                          >
                            {(item as any).badgeLeftText && (
                              <span
                                className="bg-blue-600 text-white flex items-center px-1.5 font-semibold"
                                style={{ whiteSpace: 'nowrap' }}
                              >
                                {(item as any).badgeLeftText}
                              </span>
                            )}
                            {(item as any).badgeText && (
                              <span
                                className="bg-white text-blue-600 flex items-center px-1.5 font-semibold"
                                style={{ whiteSpace: 'nowrap', borderLeft: (item as any).badgeLeftText ? '1px solid #bfdbfe' : 'none' }}
                              >
                                {(item as any).badgeText}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      {/* 商品信息 */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between h-20">
                        <div>
                          <p className="text-sm font-semibold text-gray-900 line-clamp-2 leading-tight">{item.name}</p>
                          {item.subtitle && (
                            <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{item.subtitle}</p>
                          )}
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <div className="flex items-baseline space-x-1">
                            {(item as any).inPointsShop === 1 && ((item as any).pointsPrice ?? 0) > 0 ? (
                              <>
                                <span className="text-base font-bold text-[#A80000]">{(item as any).pointsPrice}</span>
                                <span className="text-xs font-medium text-[#A80000]">积分</span>
                              </>
                            ) : (
                              <span className="text-base font-bold text-[#A80000]">¥{parseFloat(item.basePrice || '0').toFixed(2)}</span>
                            )}
                          </div>
                          {(item.salesCount ?? 0) > 0 && (
                            <span className="text-[10px] text-gray-400">已售 {item.salesCount}</span>
                          )}
                        </div>
                      </div>
                      {/* 购买按钮 */}
                      <button
                        className="flex-shrink-0 w-8 h-8 bg-[#A80000] rounded-full flex items-center justify-center shadow-sm active:bg-[#8a0000] transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCategorySheetOpen(false);
                          navigate('/merchant-product/' + item.id);
                        }}
                      >
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* 底部安全区 */}
            <div style={{ height: 'env(safe-area-inset-bottom, 16px)' }} className="flex-shrink-0" />
          </div>
        </>
      )}

      {/* Bottom Navigation - fixed定位，不在flex流里 */}
      <BottomNav />

    </div>
  );
}