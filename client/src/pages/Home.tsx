import { trpc } from "@/lib/trpc";
import Lottie from "lottie-react";
import { useAuth } from "@/_core/hooks/useAuth";
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
  Bell,
  Globe,
  BarChart2,
  FileText,
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
      <span className="font-medium" style={{ fontSize: digitSize * 0.38 + 'px', color: 'rgba(203,164,113,0.85)', marginLeft: '3px', alignSelf: 'flex-end', marginBottom: '2px', whiteSpace: 'nowrap' }}>{unit ?? '点'}</span>
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

// ── 金色钱包 Lottie 动画组件（懒加载，避免影响首屏渲染）────────────────────
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
  const { data: goldPrice } = trpc.stock.getGoldPrice.useQuery(undefined, { refetchInterval: 3000, staleTime: 1000 });
  const { data: oilPrice } = trpc.stock.getOilPrice.useQuery(undefined, { refetchInterval: 3000, staleTime: 1000 });
  const { data: dollarIndex } = trpc.stock.getDollarIndex.useQuery(undefined, { refetchInterval: 3000, staleTime: 1000 });
  const { data: usdCnh } = trpc.stock.getUsdCnh.useQuery(undefined, { refetchInterval: 3000, staleTime: 1000 });

  const [globalMarketStatus, setGlobalMarketStatus] = useState<'open' | 'closed'>(() => getGlobalMarketStatusOuter(new Date()));
  const [globalCountdown, setGlobalCountdown] = useState('');
  const [globalScrollPaused, setGlobalScrollPaused] = useState(false);

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

  const items = [
    { key: 'gold', label: '黄金 XAU/USD', data: goldPrice, unit: '/盎司', decimals: 1 },
    { key: 'oil',  label: '原油 WTI',      data: oilPrice,  unit: '/桶',   decimals: 2 },
    { key: 'dxy',  label: '美元指数 DXY',  data: dollarIndex, unit: '',    decimals: 3 },
    { key: 'cnh',  label: 'USD/CNH',       data: usdCnh,    unit: '',      decimals: 4 },
  ];

  return (
    <div className="mx-3 mt-1.5 flex-shrink-0" style={{ overflow: 'hidden', borderRadius: '12px', position: 'relative',
      border: '1px solid rgba(203,164,113,0.35)',
      boxShadow: '0 3px 10px rgba(107,74,16,0.18), inset 0 1px 0 rgba(255,255,255,1)',
      background: 'rgba(255,255,255,0.82)' }}>
      <style>{`
        @keyframes global-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .global-scroll-track {
          animation: global-scroll 20s linear infinite;
        }
        .global-scroll-track.paused {
          animation-play-state: paused;
        }
      `}</style>
      <div
        className={`global-scroll-track${globalScrollPaused ? ' paused' : ''}`}
        style={{ display: 'flex', gap: 0, width: 'max-content' }}
        onTouchStart={() => setGlobalScrollPaused(true)}
        onTouchEnd={() => setGlobalScrollPaused(false)}
      >
        {[...Array(2)].map((_, copyIdx) =>
          items.map((item) => (
            <div
              key={`${item.key}-${copyIdx}`}
              style={{ width: '160px', flexShrink: 0, boxSizing: 'border-box',
                background: 'transparent', borderRadius: 0,
                padding: '6px 10px', borderRight: '1px solid rgba(203,164,113,0.25)' }}
            >
              <div className="flex items-center space-x-1 mb-1" style={{ whiteSpace: 'nowrap' }}>
                <Globe className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#A80000' }} />
                <span className="text-xs font-semibold" style={{ color: '#222222', letterSpacing: '0.05em' }}>{item.label}</span>
              </div>
              <div className="flex items-baseline">
                {!item.data?.success ? (
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#CBA471' }} />
                ) : (
                  <GoldFlipCounter total={Math.round((item.data.price ?? 0) * Math.pow(10, item.decimals))} unit={item.unit} decimals={item.decimals} fixedSize={26} />
                )}
              </div>
              <div className="flex items-center justify-between mt-1" style={{ gap: '4px' }}>
                {globalMarketStatus === 'open' ? (
                  <>
                    <div style={{ fontSize: '0.6rem', flexShrink: 0, whiteSpace: 'nowrap', color: '#A80000' }}>开市中</div>
                    {item.data?.success && (
                      <span style={{ fontSize: '0.65rem', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
                        color: (item.data.change ?? 0) >= 0 ? '#A80000' : '#16a34a' }}>
                        {(item.data.change ?? 0) >= 0 ? '+' : ''}{(item.data.change ?? 0).toFixed(item.decimals)}
                        ({(item.data.change ?? 0) >= 0 ? '+' : ''}{(item.data.changePercent ?? 0).toFixed(2)}%)
                      </span>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: '0.6rem', flexShrink: 0, whiteSpace: 'nowrap', color: '#888' }}>
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
          ))
        )}
      </div>
    </div>
  );
});

export default function Home() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const isLiulifan = user?.username === 'liulifan';
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
      const ds = `${candidateBjDate.getUTCFullYear()}${String(candidateBjDate.getUTCMonth()+1).padStart(2,'0')}${String(candidateBjDate.getUTCDate()).padStart(2,'0')}`;
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
      {/* 上半区：AI 社交（占位）+ 刷新/资产工具栏 */}
      {/* ═══════════════════════════════════════════ */}
      <div className="px-4 pt-3 flex-shrink-0" style={{ height: "42%" }}>
        <div className="w-full h-full rounded-2xl overflow-hidden relative bg-white shadow-sm flex flex-col">
          {/* 卡片头部：标题 + 工具栏 */}
          <div className="flex items-center justify-between px-3 pt-3 pb-2 flex-shrink-0">
            <span className="text-xs font-semibold text-[#A80000] tracking-wide">AI 社交</span>
            <div className="flex items-center space-x-2">
              <div
                onClick={() => navigate("/parent/asset-report")}
                className="flex flex-col items-center cursor-pointer"
              >
                <div className="w-7 h-7 rounded-full bg-red-50 flex items-center justify-center hover:bg-red-100 transition-colors">
                  <Coins className="w-3.5 h-3.5 text-[#A80000]" />
                </div>
                <span className="text-gray-400 mt-0.5" style={{ fontSize: '0.55rem' }}>资产</span>
              </div>
              <div
                onClick={handleRefresh}
                className="flex flex-col items-center cursor-pointer"
              >
                <div className={`w-7 h-7 rounded-full bg-red-50 flex items-center justify-center hover:bg-red-100 transition-colors ${isFetching ? 'animate-spin' : ''}`}>
                  <RefreshCw className="w-3.5 h-3.5 text-[#A80000]" />
                </div>
                <span className="text-gray-400 mt-0.5" style={{ fontSize: '0.55rem' }}>刷新</span>
              </div>
            </div>
          </div>
          {/* 占位内容 */}
          <div className="flex-1 flex flex-col items-center justify-center px-4 pb-4">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#A80000] to-[#d44] flex items-center justify-center mb-2 shadow-sm">
              <span className="text-white text-base">✦</span>
            </div>
            <p className="text-gray-300 text-xs text-center">升级装修</p>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* 下半区：左 AI 人脉 + 右 AI 錢脉 */}
      {/* ═══════════════════════════════════════════ */}
      <div className="px-4 mt-2 pb-20 grid grid-cols-2 gap-2 flex-1 min-h-0">

        {/* ── 左：AI 人脉 ── */}
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
          <div className="flex items-center px-3 pt-3 pb-2">
            <span className="text-xs font-semibold tracking-wide" style={{ color: '#F5D78E' }}>AI 人脉</span>
          </div>



          {/* 我的人脉 - 红色容器 */}
          <div
            className="mx-3 rounded-xl bg-gradient-to-br from-[#A80000] to-[#d44] px-3 py-2 cursor-pointer"
            style={{ boxShadow: '0 3px 10px rgba(168,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.18)' }}
            onClick={() => navigate('/parent/contacts/list?_t=' + Date.now())}
          >
            <div className="flex items-center space-x-1 opacity-80 mb-0.5">
              <Users className="w-3.5 h-3.5 text-white" style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.3))' }} />
              <span className="text-white text-xs" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.25)' }}>我的人脉</span>
            </div>
            <div className="flex items-baseline">
              {isLoading ? (
                <Loader2 className="w-6 h-6 animate-spin text-white/60" />
              ) : (
                <RedFlipCounter total={stats?.totalContacts ?? 0} />
              )}
            </div>
          </div>

          {/* 全网人脉 - 深色金边容器 */}
          <div className="mx-3 mt-1.5 rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(201,168,76,0.35)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)' }}>
            <div className="flex items-center space-x-1 opacity-80 mb-0.5">
              <Globe className="w-3.5 h-3.5" style={{ color: '#C9A84C' }} />
              <span className="text-xs" style={{ color: '#F5D78E' }}>全网人脉</span>
            </div>
            <div className="flex items-baseline">
              <RedFlipCounter total={networkTotal?.total ?? 0} unitColor="#A80000" />
            </div>
          </div>

          {/* 四格小数据：公司数 / 标签数 / 累计联络 / 使用天数 */}
          <div className="grid grid-cols-2 gap-1 px-3 mt-1.5">
            {[
              { name: "公司总数", value: stats?.companyCount ?? 0, unit: "家", path: "/parent/contacts/list" },
              { name: "标签总数", value: totalTagCount ?? 0, unit: "个", path: "/parent/contacts/tags" },
              { name: "累计联络", value: totalInteractionCount ?? 0, unit: "次", path: "/parent/contacts/interaction-stats" },
              { name: "使用天数", value: totalUsageDays ?? 0, unit: "天", path: "" },
            ].map((item) => (
              <div
                key={item.name}
                onClick={() => item.path && navigate(item.path)}
                className={`rounded-lg py-1.5 flex flex-col items-center transition-colors ${item.path ? 'cursor-pointer' : ''}`}
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(201,168,76,0.25)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }}
              >
                <span className="text-center leading-tight" style={{ fontSize: '0.6rem', color: 'rgba(245,215,142,0.6)' }}>{item.name}</span>
                <div className="flex items-baseline space-x-0.5 mt-0.5">
                  <span className="font-bold" style={{ fontSize: 'clamp(0.85rem, 3.5vw, 1.1rem)', color: '#F5D78E' }}>
                    {formatNumber(item.value)}
                  </span>
                  <span className="text-gray-400" style={{ fontSize: '0.6rem' }}>{item.unit}</span>
                </div>
              </div>
            ))}
          </div>

          {/* 底部两个大图标：人脉共享 + 个人中心 */}
          <div className="grid grid-cols-2 gap-2 px-3 mt-1.5 mb-3">
            {/* 人脉共享 */}
            <div
              onClick={() => navigate("/parent/contacts/sharing")}
              className="relative flex flex-col items-center justify-center py-3 rounded-xl cursor-pointer active:scale-[0.98] transition-all"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(201,168,76,0.35)' }}
            >
              <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%)', border: '1px solid rgba(201,168,76,0.6)', boxShadow: '0 3px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)' }}>
                <Handshake className="w-5 h-5" style={{ color: '#C9A84C', filter: 'drop-shadow(0 1px 2px rgba(201,168,76,0.5))' }} />
              </div>
              <span className="text-xs mt-1 font-medium" style={{ color: '#F5D78E' }}>人脉共享</span>
              {hasUnreadSharing && (
                <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-[#D32F2F] rounded-full border border-white animate-pulse" />
              )}
            </div>
            {/* 个人中心 */}
            <DropdownMenu open={profileMenuOpen} onOpenChange={setProfileMenuOpen}>
              <DropdownMenuTrigger asChild>
                <div className="flex flex-col items-center justify-center py-3 rounded-xl cursor-pointer active:scale-[0.98] transition-all" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(201,168,76,0.35)' }}>
                  <div className="w-11 h-11 rounded-full flex items-center justify-center overflow-hidden" style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%)', border: '1px solid rgba(201,168,76,0.6)', boxShadow: '0 3px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)' }}>
                    {user?.avatar ? (
                      <img src={user.avatar} alt="用户头像" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-5 h-5 text-white" />
                    )}
                  </div>
                  <span className="text-xs mt-1 font-medium" style={{ color: '#F5D78E' }}>个人中心</span>
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
            className="mx-3 overflow-hidden rounded-xl flex-shrink-0"
            style={{ touchAction: 'pan-y', position: 'relative' }}
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
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(201,168,76,0.45)',
                  boxShadow: '0 3px 10px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)',
                  borderRadius: '12px',
                  padding: '8px 12px',
                }}
                onClick={() => navigate('/stock-tracker')}
              >
                <div className="flex items-center space-x-1 mb-1" style={{ whiteSpace: 'nowrap' }}>
                  <Coins className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#C9A84C' }} />
                  <span className="text-xs font-semibold" style={{ color: '#F5D78E', letterSpacing: '0.05em' }}>我的A股</span>
                </div>
                <div className="flex items-baseline">
                  {!shanghaiIndex?.success ? (
                    <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#CBA471' }} />
                  ) : (
                    <GoldFlipCounter total={Math.round((shanghaiIndex.price ?? 0) * 100)} unit="点" decimals={2} />
                  )}
                </div>
                <div className="flex items-center justify-between mt-1" style={{ gap: '4px' }}>
                  {marketStatus === 'open' ? (
                    <>
                      <div style={{ fontSize: '0.6rem', flexShrink: 0, whiteSpace: 'nowrap', color: '#A80000' }}>开市中</div>
                      {shanghaiIndex?.success && (
                        <span style={{ fontSize: '0.65rem', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
                          color: (shanghaiIndex.change ?? 0) >= 0 ? '#A80000' : '#16a34a' }}>
                          {(shanghaiIndex.change ?? 0) >= 0 ? '+' : ''}{(shanghaiIndex.change ?? 0).toFixed(2)}
                          ({(shanghaiIndex.change ?? 0) >= 0 ? '+' : ''}{(shanghaiIndex.changePercent ?? 0).toFixed(2)}%)
                        </span>
                      )}
                    </>
                  ) : (
                    <div style={{ fontSize: '0.6rem', flexShrink: 0, whiteSpace: 'nowrap', color: '#888' }}>
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
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(201,168,76,0.45)',
                  boxShadow: '0 3px 10px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)',
                  borderRadius: '12px',
                  padding: '8px 12px',
                }}
              >
                <div className="flex items-center space-x-1 mb-1" style={{ whiteSpace: 'nowrap' }}>
                  <Coins className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#C9A84C' }} />
                  <span className="text-xs font-semibold" style={{ color: '#F5D78E', letterSpacing: '0.05em' }}>我的港股</span>
                </div>
                <div className="flex items-baseline">
                  {!hangSengIndex?.success ? (
                    <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#CBA471' }} />
                  ) : (
                    <GoldFlipCounter total={Math.round((hangSengIndex.price ?? 0) * 100)} unit="点" decimals={2} />
                  )}
                </div>
                <div className="flex items-center justify-between mt-1" style={{ gap: '4px' }}>
                  {hkMarketStatus === 'open' ? (
                    <>
                      <div style={{ fontSize: '0.6rem', flexShrink: 0, whiteSpace: 'nowrap', color: '#A80000' }}>开市中</div>
                      {hangSengIndex?.success && (
                        <span style={{ fontSize: '0.65rem', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
                          color: (hangSengIndex.change ?? 0) >= 0 ? '#A80000' : '#16a34a' }}>
                          {(hangSengIndex.change ?? 0) >= 0 ? '+' : ''}{(hangSengIndex.change ?? 0).toFixed(2)}
                          ({(hangSengIndex.change ?? 0) >= 0 ? '+' : ''}{(hangSengIndex.changePercent ?? 0).toFixed(2)}%)
                        </span>
                      )}
                    </>
                  ) : (
                    <div style={{ fontSize: '0.6rem', flexShrink: 0, whiteSpace: 'nowrap', color: '#888' }}>
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
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(201,168,76,0.45)',
                  boxShadow: '0 3px 10px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)',
                  borderRadius: '12px',
                  padding: '8px 12px',
                }}

              >
                <div className="flex items-center space-x-1 mb-1" style={{ whiteSpace: 'nowrap' }}>
                  <Coins className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#C9A84C' }} />
                  <span className="text-xs font-semibold" style={{ color: '#F5D78E', letterSpacing: '0.05em' }}>我的美股</span>
                </div>
                <div className="flex items-baseline">
                  {!sp500Index?.success ? (
                    <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#CBA471' }} />
                  ) : (
                    <GoldFlipCounter total={Math.round((sp500Index.price ?? 0) * 100)} unit="点" decimals={2} />
                  )}
                </div>
                <div className="flex items-center justify-between mt-1" style={{ gap: '4px' }}>
                  {usMarketStatus === 'open' ? (
                    <>
                      <div style={{ fontSize: '0.6rem', flexShrink: 0, whiteSpace: 'nowrap', color: '#A80000' }}>开市中</div>
                      {sp500Index?.success && (
                        <span style={{ fontSize: '0.65rem', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
                          color: (sp500Index.change ?? 0) >= 0 ? '#A80000' : '#16a34a' }}>
                          {(sp500Index.change ?? 0) >= 0 ? '+' : ''}{(sp500Index.change ?? 0).toFixed(2)}
                          ({(sp500Index.change ?? 0) >= 0 ? '+' : ''}{(sp500Index.changePercent ?? 0).toFixed(2)}%)
                        </span>
                      )}
                    </>
                  ) : (
                    <div style={{ fontSize: '0.6rem', flexShrink: 0, whiteSpace: 'nowrap', color: '#888' }}>
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
          </div>

          {/* 圆点指示器 */}
          <div className="flex items-center justify-center mt-1.5 mb-1" style={{ gap: '5px' }}>
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

          {/* 全球市场跑马灯卡片（独立组件，避免Home重渲染导致闪烁） */}
          <GlobalMarketStrip />

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
                  padding: '8px 12px',
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
                  padding: '8px 12px',
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
            {/* 第二行：智能钱包（横向宽条）- 黑白金立体风格 */}
            <div
              className="flex flex-col rounded-xl cursor-pointer active:scale-[0.98] flex-1 relative overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, #111111 0%, #2a2a2a 45%, #1a1a1a 100%)',
                boxShadow: '0 6px 20px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
                border: '1px solid rgba(201,168,76,0.6)',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                padding: '8px 12px',
              }}
            >
              {/* 顶部金色高光线 */}
              <div className="absolute inset-x-0 top-0 h-px" style={{ background: 'linear-gradient(90deg, transparent 5%, #F5D78E 40%, #C9A84C 60%, transparent 95%)' }} />
              {/* 底部暗影线 */}
              <div className="absolute inset-x-0 bottom-0 h-px" style={{ background: 'rgba(0,0,0,0.4)' }} />
              {/* 标题行：保持 items-center，文字位置不变；图标用负 margin-top 向上溢出，不影响行高 */}
              <div className="flex items-center space-x-1 mb-1" style={{ whiteSpace: 'nowrap' }}>
                {/* Lottie 图标：容器 14px（与文字行高一致），内部用 overflow:visible + 负 margin-top 让图案向上溢出 */}
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
              {/* 下方留空 */}
              <div className="flex-1" />
            </div>
          </div>
        </div>

      </div>

      {/* Bottom Navigation - fixed定位，不在flex流里 */}
      <BottomNav />
    </div>
  );
}
