import { trpc } from "@/lib/trpc";
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
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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

function GoldFlipCounter({ total, unit, decimals }: { total: number; unit?: string; decimals?: number }) {
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

  useEffect(() => {
    const calcSize = () => {
      if (!containerRef.current) return;
      const containerW = containerRef.current.clientWidth - 8;
      const rawNum = displayTotal || total;
      const numDigits = decimals ? String(rawNum).replace(/[^0-9]/g, '').length : rawNum.toLocaleString('zh-CN').replace(/[^0-9]/g, '').length;
      const numCommas = decimals ? Math.floor((numDigits - decimals - 1) / 3) : Math.floor((numDigits - 1) / 3);
      const dotUnits = decimals ? 0.3 : 0;
      const totalUnits = numDigits * 0.72 + numCommas * 0.3 + dotUnits + 0.5;
      const s = Math.floor((containerW - (numDigits + numCommas + (decimals ? 1 : 0)) * 2) / totalUnits);
      setDigitSize(Math.max(20, Math.min(36, s)));
    };
    calcSize();
    window.addEventListener('resize', calcSize);
    return () => window.removeEventListener('resize', calcSize);
  }, [displayTotal, total, decimals]);

  const buildDigitSeq = (num: number): string[] => {
    if (!decimals) return num.toLocaleString('zh-CN').split('');
    const s = String(num).padStart(decimals + 1, '0');
    const intPart = s.slice(0, s.length - decimals);
    const decPart = s.slice(s.length - decimals);
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
      <span className="font-medium" style={{ fontSize: digitSize * 0.38 + 'px', color: 'rgba(203,164,113,0.85)', marginLeft: '3px', alignSelf: 'flex-end', marginBottom: '2px' }}>{unit ?? '点'}</span>
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
      const numDigits = decimals ? String(rawNum).replace(/[^0-9]/g, '').length : rawNum.toLocaleString('zh-CN').replace(/[^0-9]/g, '').length;
      const numCommas = decimals ? Math.floor((numDigits - decimals - 1) / 3) : Math.floor((numDigits - 1) / 3);
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

  // 判断是否为A股开市时间（工作日 9:30-15:00 北京时间）
  const isMarketOpen = () => {
    const now = new Date();
    // 转为北京时间
    const bjNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const day = bjNow.getUTCDay(); // 0=周日, 6=周六
    if (day === 0 || day === 6) return false;
    const h = bjNow.getUTCHours();
    const m = bjNow.getUTCMinutes();
    const minutes = h * 60 + m;
    return (minutes >= 9 * 60 + 30 && minutes < 15 * 60);
  };

  // 获取上证指数实时数据
  const { data: shanghaiIndex } = trpc.stock.getShanghaiIndex.useQuery(undefined, {
    refetchInterval: isMarketOpen() ? 3000 : false,
    staleTime: 3000,
  });

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
        <div className="bg-white rounded-2xl flex flex-col" style={{
          height: '100%',
          overflow: 'hidden',
          boxShadow: '0 4px 16px rgba(168,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9)',
          border: '1px solid rgba(255,255,255,0.8)',
          transform: 'translateY(-1px)'
        }}>
          {/* 卡片头部：标题 */}
          <div className="flex items-center px-3 pt-3 pb-2">
            <span className="text-xs font-semibold text-[#A80000] tracking-wide">AI 人脉</span>
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

          {/* 全网人脉 - 白底红边容器，格式与我的人脉一致 */}
          <div className="mx-3 mt-1.5 rounded-xl border border-red-200 bg-white px-3 py-2" style={{ boxShadow: '0 2px 6px rgba(168,0,0,0.08), inset 0 1px 0 rgba(255,255,255,1)' }}>
            <div className="flex items-center space-x-1 opacity-70 mb-0.5">
              <Globe className="w-3.5 h-3.5 text-[#A80000]" />
              <span className="text-[#A80000] text-xs">全网人脉</span>
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
                className={`bg-[#FAF3ED] rounded-lg py-1.5 flex flex-col items-center transition-colors ${item.path ? 'cursor-pointer hover:bg-red-50' : ''}`}
                style={{ boxShadow: '0 1px 4px rgba(168,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.8)' }}
              >
                <span className="text-gray-400 text-center leading-tight" style={{ fontSize: '0.6rem' }}>{item.name}</span>
                <div className="flex items-baseline space-x-0.5 mt-0.5">
                  <span className="font-bold text-[#222222]" style={{ fontSize: 'clamp(0.85rem, 3.5vw, 1.1rem)' }}>
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
              className="relative flex flex-col items-center justify-center py-3 rounded-xl bg-[#FAF3ED] cursor-pointer hover:bg-red-50 transition-colors"
            >
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#A80000] to-[#d44] flex items-center justify-center" style={{ boxShadow: '0 3px 8px rgba(168,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.2)' }}>
                <Handshake className="w-5 h-5 text-white" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }} />
              </div>
              <span className="text-[#A80000] text-xs mt-1 font-medium">人脉共享</span>
              {hasUnreadSharing && (
                <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-[#D32F2F] rounded-full border border-white animate-pulse" />
              )}
            </div>
            {/* 个人中心 */}
            <DropdownMenu open={profileMenuOpen} onOpenChange={setProfileMenuOpen}>
              <DropdownMenuTrigger asChild>
                <div className="flex flex-col items-center justify-center py-3 rounded-xl bg-[#FAF3ED] cursor-pointer hover:bg-red-50 transition-colors">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#A80000] to-[#d44] flex items-center justify-center overflow-hidden border-2 border-red-100" style={{ boxShadow: '0 3px 8px rgba(168,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.2)' }}>
                    {user?.avatar ? (
                      <img src={user.avatar} alt="用户头像" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-5 h-5 text-white" />
                    )}
                  </div>
                  <span className="text-[#A80000] text-xs mt-1 font-medium">个人中心</span>
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
        <div className="rounded-2xl flex flex-col" style={{
          height: '100%',
          overflow: 'hidden',
          background: 'linear-gradient(160deg, #F5E6C0 0%, #E8C97A 40%, #CBA471 100%)',
          boxShadow: '0 4px 16px rgba(203,164,113,0.35), 0 1px 4px rgba(107,74,16,0.15), inset 0 1px 0 rgba(255,255,255,0.6)',
          border: '1px solid rgba(255,255,255,0.5)',
          transform: 'translateY(-1px)'
        }}>
          {/* 卡片头部：标题 */}
          <div className="flex items-center justify-between px-3 pt-3 pb-2 flex-shrink-0">
            <span className="text-xs font-semibold tracking-wide" style={{ color: '#6B1A1A' }}>AI 錢脉</span>
          </div>

          {/* 我的股票 - 上证指数，白色卡片内嵌 */}
          <div className="mx-3 rounded-xl px-3 py-2" style={{
            background: 'rgba(255,255,255,0.82)',
            border: '1px solid rgba(203,164,113,0.35)',
            boxShadow: '0 3px 10px rgba(107,74,16,0.18), inset 0 1px 0 rgba(255,255,255,1)'
          }}>
            {/* 标题行：我的股票（不换行） */}
            <div className="flex items-center space-x-1 mb-1" style={{ whiteSpace: 'nowrap' }}>
              <Coins className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#A80000' }} />
              <span className="text-xs font-semibold" style={{ color: '#222222', letterSpacing: '0.05em' }}>我的股票</span>
            </div>
            {/* 指数数字：金色翻牌 */}
            <div className="flex items-baseline">
              {!shanghaiIndex?.success ? (
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#CBA471' }} />
              ) : (
                <GoldFlipCounter total={Math.round((shanghaiIndex.price ?? 0) * 100)} unit="点" decimals={2} />
              )}
            </div>
            {/* 涌跌信息 + 开市状态 */}
            <div className="flex items-center justify-between mt-1" style={{ gap: '4px' }}>
              <div style={{ fontSize: '0.6rem', color: '#888', flexShrink: 0, whiteSpace: 'nowrap' }}>{isMarketOpen() ? '开市中' : '已收盘'}</div>
              {shanghaiIndex?.success && (
                <span style={{ fontSize: '0.65rem', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
                  color: (shanghaiIndex.change ?? 0) >= 0 ? '#A80000' : '#16a34a' }}>
                  {(shanghaiIndex.change ?? 0) >= 0 ? '+' : ''}{(shanghaiIndex.change ?? 0).toFixed(2)}
                  ({(shanghaiIndex.change ?? 0) >= 0 ? '+' : ''}{(shanghaiIndex.changePercent ?? 0).toFixed(2)}%)
                </span>
              )}
            </div>
          </div>

          {/* 占位内容 */}
          <div className="flex-1 flex flex-col items-center justify-center px-4 pb-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center mb-2 shadow-sm" style={{ background: 'rgba(168,0,0,0.12)', border: '1px solid rgba(168,0,0,0.2)' }}>
              <Wallet className="w-5 h-5" style={{ color: '#A80000' }} />
            </div>
            <p className="text-xs text-center" style={{ color: '#7A5020' }}>智能财务功能</p>
            <p className="text-xs text-center" style={{ color: '#CBA471' }}>升级装修</p>
          </div>
        </div>

      </div>

      {/* Bottom Navigation - fixed定位，不在flex流里 */}
      <BottomNav />
    </div>
  );
}
