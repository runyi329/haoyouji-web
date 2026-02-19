import React, { useMemo } from 'react';

interface GaugeChartProps {
  value: number;
  minValue: number;
  maxValue: number;
  label: string;
  color?: string;
}

export function GaugeChart({ value, minValue, maxValue, label, color = '#C5B358' }: GaugeChartProps) {
  // ========== 核心配置 ==========
  const W = 150;                    // SVG 宽度（紧凑，两个并排不超出手机屏幕）
  const H = 105;                    // SVG 高度（容纳下方标签）
  const cx = W / 2;                 // 圆心 X
  const cy = 78;                    // 圆心 Y（偏下，给上方刻度留空间）
  const R = 52;                     // 主弧半径
  const arcWidth = 7;               // 弧线宽度
  const range = maxValue - minValue;

  // 值归一化 [0,1]
  const pct = Math.max(0, Math.min((value - minValue) / range, 1));

  // 角度：从 180°（左，9点钟）到 360°（右，3点钟），跨 180° 的半圆
  // 这是标准的上半圆仪表盘
  const startDeg = 180;
  const endDeg = 360;
  const sweep = 180;

  const deg2rad = (d: number) => (d * Math.PI) / 180;

  // ========== 弧线路径 ==========
  const arcPath = useMemo(() => {
    const r1 = deg2rad(startDeg);
    const r2 = deg2rad(endDeg);
    const x1 = cx + R * Math.cos(r1);
    const y1 = cy + R * Math.sin(r1);
    const x2 = cx + R * Math.cos(r2);
    const y2 = cy + R * Math.sin(r2);
    // 上半圆：从左到右，sweepFlag=0（逆时针在SVG坐标系中是向上的半圆）
    return `M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}`;
  }, []);

  // 已填充弧线（从起点到当前值）
  const filledPath = useMemo(() => {
    const r1 = deg2rad(startDeg);
    const valueDeg = startDeg + pct * sweep;
    const r2 = deg2rad(valueDeg);
    const x1 = cx + R * Math.cos(r1);
    const y1 = cy + R * Math.sin(r1);
    const x2 = cx + R * Math.cos(r2);
    const y2 = cy + R * Math.sin(r2);
    return `M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}`;
  }, [pct]);

  // ========== 指针 ==========
  const needleDeg = startDeg + pct * sweep;
  const needleLen = R - 12;
  const needleRad = deg2rad(needleDeg);
  const needleTipX = cx + needleLen * Math.cos(needleRad);
  const needleTipY = cy + needleLen * Math.sin(needleRad);

  // 指针三角形（细长锥形）
  const needleBaseLen = 5;
  const perpRad = needleRad + Math.PI / 2;
  const bx1 = cx + needleBaseLen * Math.cos(perpRad);
  const by1 = cy + needleBaseLen * Math.sin(perpRad);
  const bx2 = cx - needleBaseLen * Math.cos(perpRad);
  const by2 = cy - needleBaseLen * Math.sin(perpRad);

  // ========== 刻度 ==========
  const majorValues = [1.0, 1.5, 2.0, 2.5, 3.0];
  const minorValues: number[] = [];
  for (let v = minValue; v <= maxValue + 0.001; v += 0.1) {
    const rounded = Math.round(v * 10) / 10;
    if (!majorValues.includes(rounded)) {
      minorValues.push(rounded);
    }
  }

  // 唯一 ID 前缀
  const uid = label.replace(/\s+/g, '_');

  return (
    <div className="flex flex-col items-center">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <defs>
          {/* 外圈阴影 - 立体感 */}
          <filter id={`shadow-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="#000" floodOpacity="0.15" />
          </filter>
          {/* 内阴影效果 - 弧线凹陷感 */}
          <filter id={`inset-${uid}`} x="-10%" y="-10%" width="120%" height="120%">
            <feFlood floodColor="#000" floodOpacity="0.08" result="flood" />
            <feComposite in="flood" in2="SourceGraphic" operator="in" result="shadow" />
            <feGaussianBlur in="shadow" stdDeviation="1" result="blur" />
            <feOffset dx="0" dy="1" result="offset" />
            <feMerge>
              <feMergeNode in="offset" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* 填充渐变 */}
          <linearGradient id={`fill-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={color} stopOpacity="0.5" />
            <stop offset="100%" stopColor={color} stopOpacity="1" />
          </linearGradient>
          {/* 中心金属旋钮 */}
          <radialGradient id={`knob-${uid}`} cx="35%" cy="30%" r="65%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="50%" stopColor="#e8e8e8" />
            <stop offset="100%" stopColor="#aaaaaa" />
          </radialGradient>
          {/* 弧线高光 */}
          <linearGradient id={`highlight-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* ===== 背景弧线（带阴影，凹陷感） ===== */}
        <path
          d={arcPath}
          fill="none"
          stroke="#E8E8E8"
          strokeWidth={arcWidth + 2}
          strokeLinecap="round"
          filter={`url(#shadow-${uid})`}
        />
        <path
          d={arcPath}
          fill="none"
          stroke="#F0F0F0"
          strokeWidth={arcWidth}
          strokeLinecap="round"
        />

        {/* ===== 已填充弧线 ===== */}
        {pct > 0.005 && (
          <path
            d={filledPath}
            fill="none"
            stroke={`url(#fill-${uid})`}
            strokeWidth={arcWidth}
            strokeLinecap="round"
          />
        )}

        {/* ===== 弧线高光（立体感） ===== */}
        <path
          d={arcPath}
          fill="none"
          stroke={`url(#highlight-${uid})`}
          strokeWidth={arcWidth - 3}
          strokeLinecap="round"
          opacity="0.5"
        />

        {/* ===== 次刻度线 ===== */}
        {minorValues.map((v, i) => {
          const p = (v - minValue) / range;
          const d = startDeg + p * sweep;
          const rad = deg2rad(d);
          const outerR = R + arcWidth / 2 + 2;
          const innerR = outerR - 4;
          return (
            <line
              key={`m-${i}`}
              x1={cx + outerR * Math.cos(rad)}
              y1={cy + outerR * Math.sin(rad)}
              x2={cx + innerR * Math.cos(rad)}
              y2={cy + innerR * Math.sin(rad)}
              stroke="#CCCCCC"
              strokeWidth="0.6"
            />
          );
        })}

        {/* ===== 主刻度线 + 标签 ===== */}
        {majorValues.map((v, i) => {
          const p = (v - minValue) / range;
          const d = startDeg + p * sweep;
          const rad = deg2rad(d);
          const outerR = R + arcWidth / 2 + 2;
          const innerR = outerR - 7;

          // 两端标签（1.0和3.0）特殊处理：放在弧线端点正下方
          const isLeftEnd = v === minValue;   // 1.0 在最左端
          const isRightEnd = v === maxValue;  // 3.0 在最右端

          let labelX: number;
          let labelY: number;
          let anchor: 'start' | 'middle' | 'end';

          if (isLeftEnd) {
            // 1.0：放在左端弧线端点的下方偏内
            labelX = cx - R + 2;
            labelY = cy + 10;
            anchor = 'start';
          } else if (isRightEnd) {
            // 3.0：放在右端弧线端点的下方偏内
            labelX = cx + R - 2;
            labelY = cy + 10;
            anchor = 'end';
          } else {
            // 中间标签：放在弧线外侧
            const labelR = R + arcWidth / 2 + 15;
            labelX = cx + labelR * Math.cos(rad);
            labelY = cy + labelR * Math.sin(rad);
            anchor = 'middle';
            if (d < 250) { anchor = 'end'; labelX += 2; }
            else if (d > 290) { anchor = 'start'; labelX -= 2; }
          }

          return (
            <g key={`M-${i}`}>
              <line
                x1={cx + outerR * Math.cos(rad)}
                y1={cy + outerR * Math.sin(rad)}
                x2={cx + innerR * Math.cos(rad)}
                y2={cy + innerR * Math.sin(rad)}
                stroke="#777"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
              <text
                x={labelX}
                y={labelY}
                textAnchor={anchor}
                dominantBaseline="central"
                fontSize="8"
                fill="#999"
                fontWeight="500"
                fontFamily="system-ui, -apple-system, sans-serif"
              >
                {v.toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* ===== 指针阴影 ===== */}
        <polygon
          points={`${needleTipX + 0.8},${needleTipY + 0.8} ${bx1 + 0.8},${by1 + 0.8} ${bx2 + 0.8},${by2 + 0.8}`}
          fill="#000"
          opacity="0.12"
        />

        {/* ===== 指针 ===== */}
        <polygon
          points={`${needleTipX},${needleTipY} ${bx1},${by1} ${bx2},${by2}`}
          fill={color}
        />

        {/* ===== 中心旋钮（金属质感） ===== */}
        <circle cx={cx} cy={cy} r="7" fill={`url(#knob-${uid})`} stroke="#bbb" strokeWidth="0.5" />
        <circle cx={cx} cy={cy} r="2.5" fill={color} />
      </svg>

      {/* ===== 数值 + 标签 ===== */}
      <div className="text-center -mt-1">
        <div className="text-lg font-bold font-mono tracking-tight" style={{ color }}>
          {value.toFixed(2)}x
        </div>
        <div className="text-[10px] text-gray-500 mt-0.5">{label}</div>
      </div>
    </div>
  );
}
