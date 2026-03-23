import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { History, Plus, RefreshCw, ClipboardList, X } from "lucide-react";

// 管理员（jiang）每月20万，yjh为1/5即4万
const PER_SECOND_FULL = 200000 / 30 / 24 / 3600;
const PER_SECOND_YJH  =  40000 / 30 / 24 / 3600;
const YJH_ID = 4957151;
const JIANG_ID = 870413;
const START_TIME = new Date('2026-03-23T00:00:00+08:00').getTime();
const LEDGER_ID = 52;

// ─── 配色系统（银行级深色商业报表风格）───
// 背景：深炭蓝 #0D1B2A
// 容器：#0F2236（深海军蓝半透明）
// 标签：#7A9BBF（冷蓝灰）
// 主数据：#E8F0FE（近白冷蓝）
// 强调金：#C9A84C
// 绿色：#3DD68C
// 红色：#F47068
// 分隔线：rgba(255,255,255,0.06)

const BG = 'linear-gradient(160deg, #0D1B2A 0%, #0A1628 60%, #0D1F35 100%)';
const CARD_BG = 'rgba(15,34,54,0.85)';
const CARD_BORDER = '1px solid rgba(255,255,255,0.07)';
const LABEL_COLOR = '#7A9BBF';
const DATA_COLOR = '#E8F0FE';
const GOLD_COLOR = '#C9A84C';
const GREEN_COLOR = '#3DD68C';
const RED_COLOR = '#F47068';

// QQ 全局渐变色函数（红→橙→黄→黄绿→绿）
function gradientColor(value: number, min: number, max: number): string {
  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
  const hue = ratio * 120;
  return `hsl(${hue}, 78%, 58%)`;
}

// σ等级配色和标签
function sigmaDisplay(level: string, betCount?: number, theoryPct?: number): { label: string; color: string } {
  if (level === 'insufficient') {
    // 计算正态近似所需最小样本: n*p>=5 且 n*(1-p)>=5
    const p = (theoryPct || 10) / 100;
    const minN = Math.ceil(Math.max(5 / p, 5 / (1 - p)));
    return { label: `<${minN}次`, color: '#5A6B7F' };
  }
  switch (level) {
    case 'normal':       return { label: '1σ 正常', color: '#3DD68C' };
    case 'watch':        return { label: '2σ 关注', color: '#E7E740' };
    case 'suspect':      return { label: '3σ 可疑', color: '#E78340' };
    case 'abnormal':     return { label: '3σ+ 异常', color: '#E74040' };
    default:             return { label: '--', color: '#5A6B7F' };
  }
}

function AIRiskControlPanel() {
  const { data: riskData, isLoading } = trpc.getAIRiskControl.useQuery(undefined, {
    refetchInterval: 5 * 60 * 1000,
  });

  const cardStyle = { backgroundColor: CARD_BG, border: CARD_BORDER, backdropFilter: 'blur(12px)' };

  return (
    <div className="px-4 pt-3">
      <div className="rounded-2xl px-3 py-3" style={cardStyle}>
        <div className="text-[11px] mb-2" style={{ color: LABEL_COLOR }}>AI监控</div>

        {isLoading && (
          <div className="text-center py-4 text-xs" style={{ color: LABEL_COLOR }}>加载中...</div>
        )}

        {!isLoading && (!riskData || riskData.length === 0) && (
          <div className="text-center py-4 text-xs" style={{ color: LABEL_COLOR }}>暂无投注数据</div>
        )}

        {!isLoading && riskData && riskData.length > 0 && (
          <>
            {/* \u8868\u5934 */}
            <div style={{ display: 'flex', width: '100%', paddingBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ flex: '2 1 0', minWidth: 0 }} className="text-[9px] font-medium" ><span style={{ color: LABEL_COLOR }}>号码</span></div>
              <div style={{ flex: '1.2 1 0', minWidth: 0 }} className="text-[9px] font-medium text-center"><span style={{ color: LABEL_COLOR }}>次数</span></div>
              <div style={{ flex: '1.5 1 0', minWidth: 0 }} className="text-[9px] font-medium text-center"><span style={{ color: LABEL_COLOR }}>实际</span></div>
              <div style={{ flex: '1.5 1 0', minWidth: 0 }} className="text-[9px] font-medium text-center"><span style={{ color: LABEL_COLOR }}>理论</span></div>
              <div style={{ flex: '1.8 1 0', minWidth: 0 }} className="text-[9px] font-medium text-center"><span style={{ color: LABEL_COLOR }}>偏离</span></div>
              <div style={{ flex: '2 1 0', minWidth: 0 }} className="text-[9px] font-medium text-right"><span style={{ color: LABEL_COLOR }}>正态分布</span></div>
            </div>

            {/* \u6570\u636e\u884c */}
            {riskData.map((item: any, idx: number) => {
              const sig = sigmaDisplay(item.sigmaLevel, item.betCount, item.theoryPct);
              // \u504f\u79bb\u5ea6\u989c\u8272\uff1a\u7edd\u5bf9\u503c\u8d8a\u5c0f\u8d8a\u7eff\uff0c\u8d8a\u5927\u8d8a\u7ea2
              const absDeviation = Math.abs(item.deviation);
              const devColor = absDeviation <= 5 ? '#3DD68C'
                : absDeviation <= 15 ? gradientColor(100 - absDeviation, 0, 100)
                : absDeviation <= 30 ? '#E78340'
                : '#E74040';

              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex', width: '100%', alignItems: 'center',
                    paddingTop: '5px', paddingBottom: '5px',
                    borderBottom: idx < riskData.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none'
                  }}
                >
                  <div style={{ flex: '2 1 0', minWidth: 0 }}>
                    <span className="text-[10px] font-mono" style={{ color: DATA_COLOR, wordBreak: 'break-all' }}>
                      {item.digits.join(',')}
                    </span>
                  </div>
                  <div style={{ flex: '1.2 1 0', minWidth: 0 }} className="text-center">
                    <span className="text-[10px] font-mono" style={{ color: DATA_COLOR }}>{item.betCount}</span>
                  </div>
                  <div style={{ flex: '1.5 1 0', minWidth: 0 }} className="text-center">
                    <span className="text-[10px] font-mono" style={{ color: DATA_COLOR }}>{Number(item.actualPct).toFixed(2)}%</span>
                  </div>
                  <div style={{ flex: '1.5 1 0', minWidth: 0 }} className="text-center">
                    <span className="text-[10px] font-mono" style={{ color: LABEL_COLOR }}>{Number(item.theoryPct).toFixed(2)}%</span>
                  </div>
                  <div style={{ flex: '1.8 1 0', minWidth: 0 }} className="text-center">
                    <span className="text-[10px] font-bold font-mono" style={{ color: devColor }}>
                      {item.deviation > 0 ? '+' : ''}{Number(item.deviation).toFixed(2)}%
                    </span>
                  </div>
                  <div style={{ flex: '2 1 0', minWidth: 0 }} className="text-right">
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                      style={{ color: sig.color, backgroundColor: `${sig.color}15` }}
                    >
                      {sig.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

function ShortCycleMonitorPanel() {
  const { data: monitorData, isLoading } = trpc.getShortCycleMonitor.useQuery(undefined, {
    refetchInterval: 60 * 1000,
  });

  const cardStyle = { backgroundColor: CARD_BG, border: CARD_BORDER, backdropFilter: 'blur(12px)' };

  // SVG仪表盘组件：大半圆形（240°弧），顶部圆弧底部平开口
  function GaugeMeter({ score, label, alertLevel, alertMsg, winRate, expectedRate, sigma }: {
    score: number; label: string; alertLevel: string; alertMsg: string;
    winRate: number; expectedRate: number; sigma: number;
  }) {
    const svgW = 110;
    const svgH = 90;
    const cx = svgW / 2;
    const cy = 62; // 圆心偏下，让弧顶部有空间
    const radius = 38;
    const strokeWidth = 8;
    // 240°弧：从150°到390°（0°=正上方，顺时针）
    // 即从左下方开始，经过顶部，到右下方结束
    const startAngle = 150;
    const endAngle = 390;
    const totalAngle = endAngle - startAngle; // 240°
    const needleAngle = startAngle + (Math.min(100, Math.max(0, score)) / 100) * totalAngle;

    function polar(cxP: number, cyP: number, r: number, deg: number) {
      const rad = ((deg - 90) * Math.PI) / 180;
      return { x: cxP + r * Math.cos(rad), y: cyP + r * Math.sin(rad) };
    }

    // 背景弧
    const bgS = polar(cx, cy, radius, startAngle);
    const bgE = polar(cx, cy, radius, endAngle);
    const bgArc = `M ${bgS.x} ${bgS.y} A ${radius} ${radius} 0 1 1 ${bgE.x} ${bgE.y}`;

    // 进度弧
    const pE = polar(cx, cy, radius, needleAngle);
    const sweep = needleAngle - startAngle;
    const largeArc = sweep > 180 ? 1 : 0;
    const progressArc = `M ${bgS.x} ${bgS.y} A ${radius} ${radius} 0 ${largeArc} 1 ${pE.x} ${pE.y}`;

    // 颜色
    let arcColor = '#3DD68C';
    let glowColor = 'rgba(61,214,140,0.3)';
    if (score >= 80) { arcColor = '#F47068'; glowColor = 'rgba(244,112,104,0.4)'; }
    else if (score >= 50) { arcColor = '#E78340'; glowColor = 'rgba(231,131,64,0.35)'; }
    else if (score >= 25) { arcColor = '#C9A84C'; glowColor = 'rgba(201,168,76,0.3)'; }

    // 指针
    const needleTip = polar(cx, cy, radius - 12, needleAngle);

    // 刻度：0 25 50 75 100
    const ticks = [0, 25, 50, 75, 100];
    const tickEls = ticks.map(t => {
      const angle = startAngle + (t / 100) * totalAngle;
      const inner = polar(cx, cy, radius + 2, angle);
      const outer = polar(cx, cy, radius + 7, angle);
      const txtP = polar(cx, cy, radius + 13, angle);
      return { t, inner, outer, txtP };
    });

    // 唯一ID防止多个仪表盘filter冲突
    const uid = label.replace(/[^a-zA-Z0-9]/g, '');

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '1 1 0', minWidth: 0 }}>
        <div className="text-[10px] font-medium mb-0.5" style={{ color: LABEL_COLOR }}>{label}</div>
        <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`}>
          <defs>
            <filter id={`gl-${uid}`}>
              <feGaussianBlur stdDeviation="2.5" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          {/* 背景弧 */}
          <path d={bgArc} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} strokeLinecap="round" />
          {/* 进度弧 */}
          {score > 0 && (
            <path d={progressArc} fill="none" stroke={arcColor} strokeWidth={strokeWidth} strokeLinecap="round"
              filter={`url(#gl-${uid})`} />
          )}
          {/* 刻度线 + 数字 */}
          {tickEls.map(({ t, inner, outer, txtP }) => (
            <g key={t}>
              <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
                stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
              <text x={txtP.x} y={txtP.y + 2} textAnchor="middle" fill={LABEL_COLOR}
                fontSize="7" fontFamily="monospace">{t}</text>
            </g>
          ))}
          {/* 指针 */}
          <line x1={cx} y1={cy} x2={needleTip.x} y2={needleTip.y}
            stroke={arcColor} strokeWidth="2" strokeLinecap="round"
            filter={`url(#gl-${uid})`} />
          <circle cx={cx} cy={cy} r="3.5" fill={arcColor} />
          <circle cx={cx} cy={cy} r="1.5" fill="#0D1B2A" />
          {/* 分数显示在圆心下方 */}
          <text x={cx} y={cy + 14} textAnchor="middle" fill={arcColor}
            fontSize="13" fontWeight="bold" fontFamily="monospace">{score}</text>
        </svg>
        {/* 状态标签 */}
        <div className="text-[8px] font-bold px-2 py-0.5 rounded-full"
          style={{
            color: arcColor,
            backgroundColor: `${arcColor}15`,
            border: `1px solid ${arcColor}30`,
            textShadow: `0 0 6px ${glowColor}`,
            marginTop: '-2px',
          }}>
          {alertMsg}
        </div>
        {/* 详细数据 */}
        <div className="mt-1 w-full px-0.5" style={{ fontSize: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: LABEL_COLOR }}>实际</span>
            <span className="font-mono font-bold" style={{ color: winRate > expectedRate * 1.5 ? '#F47068' : DATA_COLOR }}>{winRate.toFixed(1)}%</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: LABEL_COLOR }}>期望</span>
            <span className="font-mono" style={{ color: LABEL_COLOR }}>{expectedRate.toFixed(1)}%</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: LABEL_COLOR }}>Z</span>
            <span className="font-mono font-bold" style={{ color: Math.abs(sigma) > 2 ? '#F47068' : Math.abs(sigma) > 1 ? '#C9A84C' : '#3DD68C' }}>
              {sigma > 0 ? '+' : ''}{sigma.toFixed(2)}σ
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-3">
      <div className="rounded-2xl px-3 py-3" style={cardStyle}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px]" style={{ color: LABEL_COLOR }}>短周期监控</div>
          <div className="text-[8px] px-1.5 py-0.5 rounded" style={{ color: GOLD_COLOR, backgroundColor: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)' }}>加权胜率离群检测</div>
        </div>

        {isLoading && (
          <div className="text-center py-6 text-xs" style={{ color: LABEL_COLOR }}>加载中...</div>
        )}

        {!isLoading && (!monitorData?.windows || monitorData.windows.length === 0) && (
          <div className="text-center py-6 text-xs" style={{ color: LABEL_COLOR }}>暂无数据</div>
        )}

        {!isLoading && monitorData?.windows && monitorData.windows.length > 0 && (
          <>
            {/* 三个仪表盘横排 */}
            <div style={{ display: 'flex', gap: '4px', width: '100%' }}>
              {monitorData.windows.map((w: any) => (
                <GaugeMeter
                  key={w.size}
                  score={w.riskScore}
                  label={`近${w.actualSize}笔`}
                  alertLevel={w.alertLevel}
                  alertMsg={w.alertMsg}
                  winRate={w.overallWinRate}
                  expectedRate={w.expectedWinRate}
                  sigma={w.sigmaValue}
                />
              ))}
            </div>

            {/* 分组明细（可展开） */}
            <details className="mt-2">
              <summary className="text-[9px] cursor-pointer" style={{ color: LABEL_COLOR, opacity: 0.7 }}>
                展开分组明细
              </summary>
              <div className="mt-1">
                {monitorData.windows.map((w: any) => (
                  <div key={w.size} className="mb-2">
                    <div className="text-[9px] font-medium mb-1" style={{ color: GOLD_COLOR }}>近{w.actualSize}笔 ({w.groups?.length || 0}组)</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                      {(w.groups || []).map((g: any) => {
                        const bgC = g.isOutlier ? 'rgba(244,112,104,0.15)' : 'rgba(61,214,140,0.08)';
                        const borderC = g.isOutlier ? 'rgba(244,112,104,0.4)' : 'rgba(255,255,255,0.06)';
                        return (
                          <div key={g.index} className="rounded px-1.5 py-1" style={{ backgroundColor: bgC, border: `1px solid ${borderC}`, minWidth: '52px' }}>
                            <div className="text-[7px]" style={{ color: LABEL_COLOR }}>#{g.index}</div>
                            <div className="text-[9px] font-mono font-bold" style={{ color: g.isOutlier ? '#F47068' : DATA_COLOR }}>
                              {g.won}/{g.total}
                            </div>
                            <div className="text-[7px] font-mono" style={{ color: LABEL_COLOR }}>
                              期望{g.expectedWon} | {g.sigmaValue > 0 ? '+' : ''}{g.sigmaValue}σ
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          </>
        )}
      </div>
    </div>
  );
}

function AmountAnalysisPanel() {
  const { data: amountData, isLoading } = trpc.getAmountAnalysis.useQuery(undefined, {
    refetchInterval: 5 * 60 * 1000,
  });

  const cardStyle = { backgroundColor: CARD_BG, border: CARD_BORDER, backdropFilter: 'blur(12px)' };

  // 计算汇总
  const summary = amountData && amountData.length > 0 ? {
    totalBets: amountData.reduce((s: number, r: any) => s + r.betCount, 0),
    totalWins: amountData.reduce((s: number, r: any) => s + r.winCount, 0),
    totalProfit: amountData.reduce((s: number, r: any) => s + r.profit, 0),
  } : null;

  return (
    <div className="px-4 pt-3">
      <div className="rounded-2xl px-3 py-3" style={cardStyle}>
        <div className="text-[11px] mb-2" style={{ color: LABEL_COLOR }}>AI监控 - 投注金额</div>

        {isLoading && (
          <div className="text-center py-4 text-xs" style={{ color: LABEL_COLOR }}>加载中...</div>
        )}

        {!isLoading && (!amountData || amountData.length === 0) && (
          <div className="text-center py-4 text-xs" style={{ color: LABEL_COLOR }}>暂无投注数据</div>
        )}

        {!isLoading && amountData && amountData.length > 0 && (
          <>
            {/* 汇总概览 */}
            {summary && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ flex: '1 1 0' }} className="text-center">
                  <div className="text-[9px]" style={{ color: LABEL_COLOR }}>金额档位</div>
                  <div className="text-[12px] font-bold font-mono" style={{ color: DATA_COLOR }}>{amountData.length}</div>
                </div>
                <div style={{ flex: '1 1 0' }} className="text-center">
                  <div className="text-[9px]" style={{ color: LABEL_COLOR }}>总投注</div>
                  <div className="text-[12px] font-bold font-mono" style={{ color: DATA_COLOR }}>{summary.totalBets}</div>
                </div>
                <div style={{ flex: '1 1 0' }} className="text-center">
                  <div className="text-[9px]" style={{ color: LABEL_COLOR }}>总中奖</div>
                  <div className="text-[12px] font-bold font-mono" style={{ color: GREEN_COLOR }}>{summary.totalWins}</div>
                </div>
                <div style={{ flex: '1 1 0' }} className="text-center">
                  <div className="text-[9px]" style={{ color: LABEL_COLOR }}>净获利</div>
                  <div className="text-[12px] font-bold font-mono" style={{ color: summary.totalProfit >= 0 ? GREEN_COLOR : RED_COLOR }}>
                    {summary.totalProfit >= 0 ? '+' : ''}{summary.totalProfit.toFixed(2)}元
                  </div>
                </div>
              </div>
            )}

            {/* 表头 */}
            <div style={{ display: 'flex', width: '100%', paddingBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ flex: '1.5 1 0', minWidth: 0 }} className="text-[9px] font-medium"><span style={{ color: LABEL_COLOR }}>金额</span></div>
              <div style={{ flex: '1 1 0', minWidth: 0 }} className="text-[9px] font-medium text-center"><span style={{ color: LABEL_COLOR }}>次数</span></div>
              <div style={{ flex: '1.3 1 0', minWidth: 0 }} className="text-[9px] font-medium text-center"><span style={{ color: LABEL_COLOR }}>实际</span></div>
              <div style={{ flex: '1.3 1 0', minWidth: 0 }} className="text-[9px] font-medium text-center"><span style={{ color: LABEL_COLOR }}>理论</span></div>
              <div style={{ flex: '1.5 1 0', minWidth: 0 }} className="text-[9px] font-medium text-center"><span style={{ color: LABEL_COLOR }}>偏离</span></div>
              <div style={{ flex: '1.5 1 0', minWidth: 0 }} className="text-[9px] font-medium text-center"><span style={{ color: LABEL_COLOR }}>获利</span></div>
              <div style={{ flex: '2 1 0', minWidth: 0 }} className="text-[9px] font-medium text-right"><span style={{ color: LABEL_COLOR }}>正态</span></div>
            </div>

            {/* 数据行 */}
            {amountData.map((item: any, idx: number) => {
              const sig = sigmaDisplay(item.sigmaLevel, item.betCount, item.theoryPct);
              const absDeviation = Math.abs(item.deviation);
              const devColor = absDeviation <= 5 ? '#3DD68C'
                : absDeviation <= 15 ? gradientColor(100 - absDeviation, 0, 100)
                : absDeviation <= 30 ? '#E78340'
                : '#E74040';
              const profitColor = item.profit >= 0 ? GREEN_COLOR : RED_COLOR;

              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex', width: '100%', alignItems: 'center',
                    paddingTop: '5px', paddingBottom: '5px',
                    borderBottom: idx < amountData.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none'
                  }}
                >
                  <div style={{ flex: '1.5 1 0', minWidth: 0 }}>
                    <span className="text-[10px] font-bold font-mono" style={{ color: GOLD_COLOR }}>
                      {item.amountYuan.toFixed(2)}元
                    </span>
                  </div>
                  <div style={{ flex: '1 1 0', minWidth: 0 }} className="text-center">
                    <span className="text-[10px] font-mono" style={{ color: DATA_COLOR }}>{item.betCount}</span>
                  </div>
                  <div style={{ flex: '1.3 1 0', minWidth: 0 }} className="text-center">
                    <span className="text-[10px] font-mono" style={{ color: DATA_COLOR }}>{Number(item.actualPct).toFixed(2)}%</span>
                  </div>
                  <div style={{ flex: '1.3 1 0', minWidth: 0 }} className="text-center">
                    <span className="text-[10px] font-mono" style={{ color: LABEL_COLOR }}>{Number(item.theoryPct).toFixed(2)}%</span>
                  </div>
                  <div style={{ flex: '1.5 1 0', minWidth: 0 }} className="text-center">
                    <span className="text-[10px] font-bold font-mono" style={{ color: devColor }}>
                      {item.deviation > 0 ? '+' : ''}{Number(item.deviation).toFixed(2)}%
                    </span>
                  </div>
                  <div style={{ flex: '1.5 1 0', minWidth: 0 }} className="text-center">
                    <span className="text-[10px] font-bold font-mono" style={{ color: profitColor }}>
                      {item.profit >= 0 ? '+' : ''}{item.profit.toFixed(2)}
                    </span>
                  </div>
                  <div style={{ flex: '2 1 0', minWidth: 0 }} className="text-right">
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                      style={{ color: sig.color, backgroundColor: `${sig.color}15` }}
                    >
                      {sig.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

export default function QQOnlinePage() {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();

  const { data: meData } = trpc.auth.me.useQuery();
  const currentUserId = (meData as any)?.id;
  const perSecond = currentUserId === YJH_ID ? PER_SECOND_YJH : PER_SECOND_FULL;
  const startAmount = currentUserId === YJH_ID ? '40万元整' : '200万元整';
  const deposit = currentUserId === YJH_ID ? '4万元' : '20万元';

  const { data: tradeStats } = trpc.getQQTradeStats.useQuery(undefined, {
    enabled: currentUserId === JIANG_ID,
    refetchInterval: 60 * 1000,
  });

  const { data: settlementData } = trpc.getInterestSettlements.useQuery(
    { ledgerId: LEDGER_ID },
    { enabled: currentUserId === JIANG_ID, refetchInterval: 5 * 60 * 1000 }
  );
  const settledTotal = currentUserId === JIANG_ID ? (settlementData?.total || 0) : 0;

  // 盈利结算数据
  const { data: profitData } = trpc.getProfitSettlements.useQuery(
    { ledgerId: LEDGER_ID },
    { enabled: currentUserId === JIANG_ID || currentUserId === YJH_ID, refetchInterval: 5 * 60 * 1000 }
  );
  const profitTotal = profitData?.total || 0;
  const profitSettled = profitData?.settled || 0;
  const profitLast = profitData?.lastSettle || null;

  const { data, refetch } = trpc.getQQOnlineRecords.useQuery(
    { page: 1, pageSize: 1 },
    { refetchInterval: 60 * 1000 }
  );
  const latest = data?.list?.[0];

  const [showMenu, setShowMenu] = useState(false);
  const [countdown, setCountdown] = useState(0);
  useEffect(() => {
    function calcCountdown() {
      const sec = new Date().getSeconds();
      const remaining = sec === 0 ? 1 : 61 - sec;
      setCountdown(remaining > 60 ? 0 : remaining);
    }
    calcCountdown();
    const timer = setInterval(calcCountdown, 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => { if (countdown === 0) refetch(); }, [countdown, refetch]);

  const [runHours, setRunHours] = useState(1);
  useEffect(() => {
    function calc() {
      const hours = Math.ceil((Date.now() - START_TIME) / (1000 * 60 * 60));
      setRunHours(hours > 0 ? hours : 1);
    }
    calc();
    const timer = setInterval(calc, 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const [interest, setInterest] = useState(0);
  useEffect(() => {
    function calcInterest() {
      const elapsed = Math.max(0, Date.now() - START_TIME) / 1000;
      setInterest(elapsed * perSecond);
    }
    calcInterest();
    const timer = setInterval(calcInterest, 1000);
    return () => clearInterval(timer);
  }, [perSecond]);

  function formatNum(n: number): string { return n.toLocaleString("zh-CN"); }
  function fmt(v: number | null | undefined, prefix = '¥'): string {
    if (v == null) return '--';
    return `${prefix}${v.toFixed(2)}`;
  }
  function pct(part: number, total: number): string {
    if (!total) return '--';
    return `(${((part / total) * 100).toFixed(2)}%)`;
  }

  const interestCNY = interest.toFixed(2);
  const interestUSDT = (interest / 7).toFixed(2);
  const pendingInterest = Math.max(0, interest - settledTotal);
  const pendingCNY = pendingInterest.toFixed(2);
  const pendingUSDT = (pendingInterest / 7).toFixed(2);
  const settledCNY = settledTotal.toFixed(2);
  const settledUSDT = (settledTotal / 7).toFixed(2);

  // 共用卡片样式
  const cardStyle = { backgroundColor: CARD_BG, border: CARD_BORDER, backdropFilter: 'blur(12px)' };

  return (
    <div className="min-h-screen" style={{ background: BG }}>

      {/* ── 主在线数据卡片 ── */}
      <div className="px-4 pt-4">
        <div className="rounded-2xl px-5 py-3" style={cardStyle}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-xs" style={{ color: LABEL_COLOR }}>当前在线</span>
                <span className="text-[11px]" style={{ color: LABEL_COLOR, opacity: 0.6 }}>{latest ? latest.online_time : ''}</span>
              </div>
              <div className="text-3xl font-bold font-mono tracking-wide leading-tight" style={{ color: DATA_COLOR }}>
                {latest ? formatNum(latest.online_num) : '加载中...'}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div
                className="rounded-xl flex items-center justify-center"
                style={{ backgroundColor: 'rgba(200,168,76,0.15)', border: '1px solid rgba(200,168,76,0.3)', width: '40px', height: '40px' }}
              >
                <span className="text-base font-bold font-mono" style={{ color: GOLD_COLOR }}>{countdown}</span>
              </div>
              <button
                onClick={() => setLocation(`/ledger/${id}/qq/history`)}
                className="rounded-xl flex items-center justify-center active:opacity-70"
                style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: CARD_BORDER, width: '40px', height: '40px' }}
              >
                <History className="w-4 h-4" style={{ color: LABEL_COLOR }} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── 数据卡片网格 ── */}
      <div className="px-4 pt-3">
        <div className="grid grid-cols-2 gap-3">

          {/* 卡片1：开始时间 + 运行时长 */}
          <div className="rounded-2xl px-4 py-3" style={cardStyle}>
            <div className="text-[11px] mb-1" style={{ color: LABEL_COLOR }}>开始时间</div>
            <div className="text-sm font-bold" style={{ color: DATA_COLOR }}>2026年3月23日</div>
            <div className="text-[11px] mt-2 mb-0.5" style={{ color: LABEL_COLOR }}>运行时长</div>
            <div className="text-sm font-bold" style={{ color: DATA_COLOR }}>
              {runHours >= 24
                ? `${Math.floor(runHours / 24)}天${runHours % 24}小时`
                : `${runHours}小时`}
            </div>
          </div>

          {/* 卡片2：开始金额 + 保证金 */}
          <div className="rounded-2xl px-4 py-3" style={cardStyle}>
            <div className="text-[11px] mb-1" style={{ color: LABEL_COLOR }}>开始金额</div>
            <div className="text-sm font-bold" style={{ color: DATA_COLOR }}>{startAmount}</div>
            <div className="text-[11px] mt-2 mb-0.5" style={{ color: LABEL_COLOR }}>保证金</div>
            <div className="text-sm font-bold" style={{ color: DATA_COLOR }}>{deposit}</div>
          </div>

          {/* 卡片3：累计/待结/已结利息 */}
          <div className="rounded-2xl px-4 py-3" style={cardStyle}>
            <div className="text-[11px] mb-1" style={{ color: LABEL_COLOR }}>累计利息</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-bold font-mono" style={{ color: DATA_COLOR }}>¥{interestCNY}</span>
              <span className="text-[10px]" style={{ color: LABEL_COLOR }}>≈{interestUSDT} U</span>
            </div>
            <div className="text-[11px] mt-2 mb-0.5" style={{ color: LABEL_COLOR }}>待结利息</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-bold font-mono" style={{ color: GOLD_COLOR }}>¥{pendingCNY}</span>
              <span className="text-[10px]" style={{ color: LABEL_COLOR }}>≈{pendingUSDT} U</span>
            </div>
            <div className="text-[11px] mt-2 mb-0.5" style={{ color: LABEL_COLOR }}>已结利息</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-bold font-mono" style={{ color: GREEN_COLOR }}>¥{settledCNY}</span>
              <span className="text-[10px]" style={{ color: LABEL_COLOR }}>≈{settledUSDT} U</span>
            </div>
          </div>

          {/* 卡片4：累计盈利（仅 jiang 和 yjh 可见） */}
          {(currentUserId === JIANG_ID || currentUserId === YJH_ID) && (
            <div className="rounded-2xl px-4 py-3" style={cardStyle}>
              <div className="text-[11px] mb-1" style={{ color: LABEL_COLOR }}>累计盈利</div>
              <div className="flex items-baseline gap-1.5">
                <span className={`text-sm font-bold font-mono`} style={{ color: profitTotal >= 0 ? GREEN_COLOR : '#EF4444' }}>
                  {profitTotal >= 0 ? '+' : ''}{"\u00A5"}{profitTotal.toFixed(2)}
                </span>
              </div>
              <div className="text-[11px] mt-2 mb-0.5" style={{ color: LABEL_COLOR }}>已结盈利</div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-bold font-mono" style={{ color: GREEN_COLOR }}>
                  {"\u00A5"}{profitSettled.toFixed(2)}
                </span>
              </div>
              <div className="text-[11px] mt-2 mb-0.5" style={{ color: LABEL_COLOR }}>最近结算</div>
              <div className="flex items-baseline gap-1.5">
                {profitLast ? (
                  <>
                    <span className="text-[11px] font-mono" style={{ color: DATA_COLOR }}>{profitLast.date}</span>
                    <span className="text-[11px] font-bold font-mono" style={{ color: GREEN_COLOR }}>
                      {"\u00A5"}{profitLast.amount.toFixed(2)}
                    </span>
                  </>
                ) : (
                  <span className="text-[11px]" style={{ color: LABEL_COLOR }}>暂无记录</span>
                )}
              </div>
            </div>
          )}

          {/* 占位（非 jiang/yjh 用户显示空白） */}
          {currentUserId !== JIANG_ID && currentUserId !== YJH_ID && (
            <div className="rounded-2xl px-4 py-3" style={{ ...cardStyle, minHeight: '80px' }} />
          )}

          {/* 卡片5：投注统计（横跨两列，仅jiang可见） */}
          {currentUserId === JIANG_ID && (
            <div className="col-span-2 rounded-2xl px-4 py-3" style={cardStyle}>
              <div className="text-[11px] mb-3" style={{ color: LABEL_COLOR }}>投注统计</div>
              <div style={{ display: 'flex', width: '100%' }}>

                {/* 左列：次数 */}
                <div style={{ flex: '1 1 0', minWidth: 0, paddingRight: '8px', borderRight: '1px solid rgba(255,255,255,0.06)' }} className="flex flex-col gap-2.5">
                  <div>
                    <div className="text-[10px] mb-0.5" style={{ color: LABEL_COLOR }}>中奖次数</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px' }}>
                      <span className="text-sm font-bold font-mono" style={{ color: GREEN_COLOR }}>{tradeStats?.won ?? 0}</span>
                      <span className="text-[10px] ml-1" style={{ color: '#FFFFFF', opacity: 0.6 }}>{pct(tradeStats?.won ?? 0, tradeStats?.total ?? 0)}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] mb-0.5" style={{ color: LABEL_COLOR }}>未中奖次数</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px' }}>
                      <span className="text-sm font-bold font-mono" style={{ color: RED_COLOR }}>{tradeStats?.lost ?? 0}</span>
                      <span className="text-[10px] ml-1" style={{ color: '#FFFFFF', opacity: 0.6 }}>{pct(tradeStats?.lost ?? 0, tradeStats?.total ?? 0)}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] mb-0.5" style={{ color: LABEL_COLOR }}>投注总数</div>
                    <div className="text-sm font-bold font-mono" style={{ color: DATA_COLOR }}>{tradeStats?.total ?? 0}</div>
                  </div>
                </div>

                {/* 中列：投注额 */}
                <div style={{ flex: '1 1 0', minWidth: 0, padding: '0 8px', borderRight: '1px solid rgba(255,255,255,0.06)' }} className="flex flex-col gap-2.5">
                  <div>
                    <div className="text-[10px] mb-0.5" style={{ color: LABEL_COLOR }}>最大投注</div>
                    <div className="text-sm font-bold font-mono" style={{ color: DATA_COLOR, wordBreak: 'break-all' }}>{fmt(tradeStats?.maxAmount)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] mb-0.5" style={{ color: LABEL_COLOR }}>最小投注</div>
                    <div className="text-sm font-bold font-mono" style={{ color: DATA_COLOR, wordBreak: 'break-all' }}>{fmt(tradeStats?.minAmount)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] mb-0.5" style={{ color: LABEL_COLOR }}>平均投注</div>
                    <div className="text-sm font-bold font-mono" style={{ color: GOLD_COLOR, wordBreak: 'break-all' }}>{fmt(tradeStats?.avgAmount)}</div>
                  </div>
                </div>

                {/* 右列：派彩 */}
                <div style={{ flex: '1 1 0', minWidth: 0, paddingLeft: '8px' }} className="flex flex-col gap-2.5">
                  <div>
                    <div className="text-[10px] mb-0.5" style={{ color: LABEL_COLOR }}>最大派彩</div>
                    <div className="text-sm font-bold font-mono" style={{ color: DATA_COLOR, wordBreak: 'break-all' }}>{fmt((tradeStats as any)?.maxPayout)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] mb-0.5" style={{ color: LABEL_COLOR }}>最小派彩</div>
                    <div className="text-sm font-bold font-mono" style={{ color: DATA_COLOR, wordBreak: 'break-all' }}>{fmt((tradeStats as any)?.minPayout)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] mb-0.5" style={{ color: LABEL_COLOR }}>平均派彩</div>
                    <div className="text-sm font-bold font-mono" style={{ color: GOLD_COLOR, wordBreak: 'break-all' }}>{fmt((tradeStats as any)?.avgPayout)}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── 短周期监控（仅jiang可见）── */}
      {currentUserId === JIANG_ID && <ShortCycleMonitorPanel />}

      {/* ── AI监控（仅jiang可见）── */}
      {currentUserId === JIANG_ID && <AIRiskControlPanel />}

      {/* ── AI监控 - 投注金额（仅jiang可见）── */}
      {currentUserId === JIANG_ID && <AmountAnalysisPanel />}

      <div className="h-20" />

      {/* ── 底部悬浮按钮（仅jiang可见）── */}
      {currentUserId === JIANG_ID && (
        <>
          {showMenu && (
            <div className="fixed inset-0 z-20" onClick={() => setShowMenu(false)} />
          )}
          {showMenu && (
            <div
              className="fixed z-30 flex flex-col gap-2"
              style={{ bottom: '80px', left: '50%', transform: 'translateX(-50%)' }}
            >
              <button
                onClick={() => { location.assign(location.href); }}
                className="flex items-center gap-3 px-5 py-3 rounded-2xl shadow-lg text-sm font-medium"
                style={{ background: 'rgba(13,27,42,0.95)', border: '1px solid rgba(200,168,76,0.3)', backdropFilter: 'blur(12px)', minWidth: '160px', color: DATA_COLOR }}
              >
                <RefreshCw className="w-4 h-4" style={{ color: LABEL_COLOR }} />
                刷新
              </button>
              <button
                onClick={() => { setShowMenu(false); setLocation(`/ledger/${id}/qq/trade`); }}
                className="flex items-center gap-3 px-5 py-3 rounded-2xl shadow-lg text-sm font-medium"
                style={{ background: 'rgba(13,27,42,0.95)', border: '1px solid rgba(200,168,76,0.3)', backdropFilter: 'blur(12px)', minWidth: '160px', color: DATA_COLOR }}
              >
                <ClipboardList className="w-4 h-4" style={{ color: LABEL_COLOR }} />
                交易记录
              </button>
            </div>
          )}
          <button
            onClick={() => setShowMenu(v => !v)}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center justify-center rounded-full shadow-lg active:opacity-80"
            style={{ width: '56px', height: '56px', background: 'linear-gradient(135deg, #0D1B2A 0%, #1A3A5C 100%)', border: '1px solid rgba(200,168,76,0.4)' }}
          >
            {showMenu
              ? <X className="w-6 h-6" style={{ color: GOLD_COLOR }} />
              : <Plus className="w-7 h-7" style={{ color: GOLD_COLOR }} />
            }
          </button>
        </>
      )}
    </div>
  );
}
