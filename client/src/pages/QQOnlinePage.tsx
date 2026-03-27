import React, { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { History, Plus, RefreshCw, ClipboardList, X } from "lucide-react";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);

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

// ========== AI监控 习惯板块 ==========

function AIHabitsPanel() {
  const [result, setResult] = React.useState<{ analysis: string; stats: any } | null>(null);
  const [analyzing, setAnalyzing] = React.useState(false);
  const [lastTime, setLastTime] = React.useState<string | null>(null);

  // 初始化时从服务器加载全局缓存（所有用户共享最新一次分析结果）
  const { data: cacheData } = trpc.getQQAICache.useQuery(undefined, {
    refetchOnWindowFocus: false,
    refetchInterval: false,
  });
  React.useEffect(() => {
    if (cacheData) {
      setResult({ analysis: cacheData.analysis, stats: cacheData.stats });
      if (cacheData.lastTime) setLastTime(cacheData.lastTime);
    }
  }, [cacheData]);

  const analyzeMutation = trpc.analyzeQQBettingHabits.useMutation({
    onSuccess: (data) => {
      const now = new Date();
      const timeStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      setResult(data);
      setLastTime(timeStr);
      setAnalyzing(false);
    },
    onError: (err) => {
      setAnalyzing(false);
      alert('分析失败: ' + err.message);
    }
  });

  const handleAnalyze = () => {
    setAnalyzing(true);
    analyzeMutation.mutate();
  };

  const cardStyle = { background: CARD_BG, border: CARD_BORDER, backdropFilter: 'blur(12px)' };

  // 将分析结果按维度分割
  const parseAnalysis = (text: string) => {
    const sections: { title: string; content: string }[] = [];
    const parts = text.split(/【([^】]+)】/);
    for (let i = 1; i < parts.length; i += 2) {
      sections.push({ title: parts[i], content: (parts[i + 1] || '').trim() });
    }
    return sections.length > 0 ? sections : [{ title: '分析结果', content: text }];
  };

  return (
    <div className="px-4 pt-3">
      <div className="rounded-2xl px-4 py-3" style={cardStyle}>
        {/* 标题行 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="text-[11px]" style={{ color: LABEL_COLOR }}>AI监控</span>
            <span className="text-[11px] font-bold" style={{ color: GOLD_COLOR }}>客户习惯</span>
            {lastTime && (
              <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ color: LABEL_COLOR, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                上次分析：{lastTime}
              </span>
            )}
          </div>
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold"
            style={{
              background: analyzing ? 'rgba(201,168,76,0.15)' : 'rgba(201,168,76,0.2)',
              color: GOLD_COLOR,
              border: `1px solid ${GOLD_COLOR}40`,
              opacity: analyzing ? 0.7 : 1,
              cursor: analyzing ? 'not-allowed' : 'pointer'
            }}
          >
            {analyzing ? (
              <>
                <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', fontSize: '10px' }}>◔</span>
                分析中...
              </>
            ) : (
              <>全量分析</>
            )}
          </button>
        </div>

        {/* 未分析时的提示 */}
        {!result && !analyzing && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: LABEL_COLOR }} className="text-[10px]">
            点击「全量分析」，调用 DeepSeek 分析投注习惯、心理状态与行为预测
          </div>
        )}

        {/* 加载中 */}
        {analyzing && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: GOLD_COLOR }} className="text-[10px]">
            正在读取全量数据并调用 DeepSeek 分析，通常需要 10–30 秒...
          </div>
        )}

        {/* 分析结果 */}
        {result && !analyzing && (
          <div>
            {/* 数据摘要标签 */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
              <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ color: GOLD_COLOR, background: `${GOLD_COLOR}18`, border: `1px solid ${GOLD_COLOR}30` }}>
                总 {result.stats.totalBets} 笔
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ color: GREEN_COLOR, background: `${GREEN_COLOR}18`, border: `1px solid ${GREEN_COLOR}30` }}>
                胜率 {result.stats.winRate}%
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ color: result.stats.netProfit >= 0 ? GREEN_COLOR : '#F47068', background: result.stats.netProfit >= 0 ? `${GREEN_COLOR}18` : '#F4706818', border: `1px solid ${result.stats.netProfit >= 0 ? GREEN_COLOR : '#F47068'}30` }}>
                净{result.stats.netProfit >= 0 ? '+' : ''}{result.stats.netProfit}元
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ color: LABEL_COLOR, background: 'rgba(255,255,255,0.05)' }}>
                {result.stats.activeDays}天
              </span>
            </div>

            {/* 三个维度分析 */}
            {parseAnalysis(result.analysis).map((section, i) => (
              <div key={i} style={{ marginBottom: i < 2 ? '10px' : 0, paddingBottom: i < 2 ? '10px' : 0, borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                <div className="text-[10px] font-bold mb-1.5" style={{ color: GOLD_COLOR }}>【{section.title}】</div>
                <div className="text-[10px] leading-relaxed" style={{ color: DATA_COLOR, opacity: 0.9 }}>{section.content}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AIRiskControlPanel() {
  const { data: riskData, isLoading } = trpc.getAIRiskControl.useQuery(undefined, {
    refetchInterval: 5 * 60 * 1000,
  });

  const cardStyle = { backgroundColor: CARD_BG, border: CARD_BORDER, backdropFilter: 'blur(12px)' };

  return (
    <div className="px-4 pt-3">
      <div className="rounded-2xl px-3 py-3" style={cardStyle}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px]" style={{ color: LABEL_COLOR }}>AI监控 <span style={{ color: GOLD_COLOR }}>投注号码</span></div>
          {riskData && riskData.length > 0 && (
            <div className="text-[9px] px-1.5 py-0.5 rounded" style={{ color: GOLD_COLOR, backgroundColor: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)' }}>
              共 <span className="font-mono font-bold">{riskData.reduce((s: number, r: any) => s + (r.betCount || 0), 0)}</span> 次投注
            </div>
          )}
        </div>

        {isLoading && (
          <div className="text-center py-4 text-xs" style={{ color: LABEL_COLOR }}>加载中...</div>
        )}

        {!isLoading && (!riskData || riskData.length === 0) && (
          <div className="text-center py-4 text-xs" style={{ color: LABEL_COLOR }}>暂无投注数据</div>
        )}

        {!isLoading && riskData && riskData.length > 0 && (
          <>
            {/* \u8868\u5934 */}
            <div style={{ display: 'flex', width: '100%', paddingBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.08)', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ width: '64px', flexShrink: 0 }} className="text-[9px] font-medium"><span style={{ color: LABEL_COLOR }}>号码</span></div>
              <div style={{ width: '24px', flexShrink: 0, textAlign: 'center' }} className="text-[9px] font-medium"><span style={{ color: LABEL_COLOR }}>次数</span></div>
              <div style={{ width: '36px', flexShrink: 0, textAlign: 'center' }} className="text-[9px] font-medium"><span style={{ color: LABEL_COLOR }}>实际</span></div>
              <div style={{ width: '36px', flexShrink: 0, textAlign: 'center' }} className="text-[9px] font-medium"><span style={{ color: LABEL_COLOR }}>理论</span></div>
              <div style={{ width: '38px', flexShrink: 0, textAlign: 'center' }} className="text-[9px] font-medium"><span style={{ color: LABEL_COLOR }}>偏离</span></div>
              <div style={{ width: '46px', flexShrink: 0, textAlign: 'right' }} className="text-[9px] font-medium"><span style={{ color: LABEL_COLOR }}>正态分布</span></div>
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
                  style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between',
                    paddingTop: '5px', paddingBottom: '5px',
                    borderBottom: idx < riskData.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none'
                  }}
                >
                  <div style={{ width: '64px', flexShrink: 0 }}>
                    <span className="text-[10px] font-mono" style={{ color: DATA_COLOR, whiteSpace: 'nowrap' }}>
                      {item.digits.join(',')}
                    </span>
                  </div>
                  <div style={{ width: '24px', flexShrink: 0, textAlign: 'center' }}>
                    <span className="text-[10px] font-mono" style={{ color: DATA_COLOR }}>{item.betCount}</span>
                  </div>
                  <div style={{ width: '36px', flexShrink: 0, textAlign: 'center' }}>
                    <span className="text-[10px] font-mono" style={{ color: DATA_COLOR }}>{Number(item.actualPct).toFixed(1)}%</span>
                  </div>
                  <div style={{ width: '36px', flexShrink: 0, textAlign: 'center' }}>
                    <span className="text-[10px] font-mono" style={{ color: LABEL_COLOR }}>{Number(item.theoryPct).toFixed(1)}%</span>
                  </div>
                  <div style={{ width: '38px', flexShrink: 0, textAlign: 'center' }}>
                    <span className="text-[10px] font-bold font-mono" style={{ color: devColor }}>
                      {item.deviation > 0 ? '+' : ''}{Number(item.deviation).toFixed(1)}%
                    </span>
                  </div>
                  <div style={{ width: '46px', flexShrink: 0, textAlign: 'right' }}>
                    <span
                      className="text-[9px] font-bold px-1 py-0.5 rounded"
                      style={{ color: sig.color, backgroundColor: `${sig.color}15`, whiteSpace: 'nowrap', display: 'inline-block' }}
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

  // 风险颜色计算
  function riskColor(score: number) {
    if (score >= 80) return '#F47068';
    if (score >= 50) return '#E78340';
    if (score >= 25) return '#C9A84C';
    return '#3DD68C';
  }

  return (
    <div className="px-4 pt-3">
      <div className="rounded-2xl px-3 py-3" style={cardStyle}>
        <div className="flex items-center justify-between mb-3">
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
            {/* 三列布局：近30笔 | 近150笔 | 近500笔，与上方投注统计对称 */}
            <div style={{ display: 'flex', width: '100%' }}>
              {monitorData.windows.map((w: any, idx: number) => {
                const isLast = idx === monitorData.windows.length - 1;
                const scoreColor = riskColor(w.riskScore);
                const sigmaColor = Math.abs(w.sigmaValue) > 2 ? '#F47068' : Math.abs(w.sigmaValue) > 1 ? '#C9A84C' : '#3DD68C';
                const winRateColor = w.overallWinRate > w.expectedWinRate * 1.5 ? '#F47068' : DATA_COLOR;
                return (
                  <div key={w.size}
                    style={{
                      flex: '1 1 0', minWidth: 0,
                      paddingLeft: idx > 0 ? '8px' : '0',
                      paddingRight: !isLast ? '8px' : '0',
                      borderRight: !isLast ? '1px solid rgba(255,255,255,0.06)' : 'none',
                    }}
                    className="flex flex-col gap-2.5">
                    {/* 标题 */}
                    <div className="text-center">
                      <div className="text-[10px] mb-1" style={{ color: GOLD_COLOR }}>近{w.actualSize}笔</div>
                    </div>
                    {/* 风险评分 */}
                    <div>
                      <div className="text-[10px] mb-0.5" style={{ color: LABEL_COLOR }}>风险评分</div>
                      <div className="text-sm font-bold font-mono" style={{ color: scoreColor }}>{w.riskScore}<span className="text-[9px] font-normal" style={{ color: LABEL_COLOR }}>/100</span></div>
                    </div>
                    {/* 实际胜率 */}
                    <div>
                      <div className="text-[10px] mb-0.5" style={{ color: LABEL_COLOR }}>实际胜率</div>
                      <div className="text-sm font-bold font-mono" style={{ color: winRateColor }}>{w.overallWinRate.toFixed(1)}%</div>
                    </div>
                    {/* 期望胜率 */}
                    <div>
                      <div className="text-[10px] mb-0.5" style={{ color: LABEL_COLOR }}>期望胜率</div>
                      <div className="text-sm font-bold font-mono" style={{ color: LABEL_COLOR }}>{w.expectedWinRate.toFixed(1)}%</div>
                    </div>
                    {/* 标准差偏离 */}
                    <div>
                      <div className="text-[10px] mb-0.5" style={{ color: LABEL_COLOR }}>偏离度</div>
                      <div className="text-sm font-bold font-mono" style={{ color: sigmaColor }}>
                        {w.sigmaValue > 0 ? '+' : ''}{w.sigmaValue.toFixed(2)}σ
                      </div>
                    </div>
                    {/* 状态 */}
                    <div>
                      <div className="text-[9px] font-bold px-2 py-0.5 rounded-full text-center"
                        style={{
                          color: scoreColor,
                          backgroundColor: `${scoreColor}15`,
                          border: `1px solid ${scoreColor}30`,
                        }}>
                        {w.alertMsg}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 分组明细（可展开） */}
            <details className="mt-3" style={{ paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
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

// ========== 历史滑动扫描预警面板 ==========
function HistoryScanPanel() {
  const [scanning, setScanning] = React.useState(false);
  const [scanResult, setScanResult] = React.useState<{ scanned: number; newAlerts: number; total: number } | null>(null);
  const [daysFilter, setDaysFilter] = React.useState(7);
  const [showHelp, setShowHelp] = React.useState(false);

  const { data: alertsData, isLoading: alertsLoading, refetch: refetchAlerts } = trpc.getRiskAlerts.useQuery(
    { days: daysFilter },
    { refetchInterval: 0 }
  );

  const scanMutation = trpc.runRollingWindowScan.useMutation({
    onSuccess: (result) => {
      setScanResult(result);
      setScanning(false);
      refetchAlerts();
    },
    onError: () => setScanning(false),
  });

  const cardStyle = { backgroundColor: CARD_BG, border: CARD_BORDER, backdropFilter: 'blur(12px)' };

  function alertLevelLabel(level: string) {
    if (level === 'abnormal') return { text: '确定异常', color: '#F47068' };
    if (level === 'suspect') return { text: '疯疫嵌入', color: '#E78340' };
    return { text: '需关注', color: '#C9A84C' };
  }

  const summary = alertsData?.summary || {};
  const alerts = alertsData?.alerts || [];

  return (
    <div className="px-4 pt-3">
      <div className="rounded-2xl px-3 py-3" style={cardStyle}>
        <div className="flex items-center justify-between mb-3">
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div className="text-[11px]" style={{ color: LABEL_COLOR }}>历史滑动扫描预警</div>
            <button
              onClick={() => setShowHelp(true)}
              style={{
                width: '14px', height: '14px', borderRadius: '50%',
                backgroundColor: 'rgba(201,168,76,0.15)',
                border: '1px solid rgba(201,168,76,0.3)',
                color: GOLD_COLOR, fontSize: '9px', fontWeight: 'bold',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0,
              }}>?
            </button>
          </div>

          {/* 说明弹窗 */}
          {showHelp && (
            <div style={{
              position: 'fixed', inset: 0, zIndex: 9999,
              backgroundColor: 'rgba(0,0,0,0.75)',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            }} onClick={() => setShowHelp(false)}>
              <div style={{
                width: '100%', maxWidth: '480px',
                backgroundColor: '#1A1A1A',
                border: '1px solid rgba(201,168,76,0.2)',
                borderRadius: '20px 20px 0 0',
                padding: '20px 16px 32px',
                maxHeight: '80vh', overflowY: 'auto',
              }} onClick={e => e.stopPropagation()}>
                {/* 头部 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div style={{ color: GOLD_COLOR, fontSize: '14px', fontWeight: 'bold' }}>历史滑动扫描预警 — 原理说明</div>
                  <button onClick={() => setShowHelp(false)} style={{ color: LABEL_COLOR, fontSize: '18px', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
                </div>

                {/* 一、作用 */}
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ color: GOLD_COLOR, fontSize: '11px', fontWeight: 'bold', marginBottom: '6px', paddingBottom: '4px', borderBottom: '1px solid rgba(201,168,76,0.15)' }}>一、为什么需要它？</div>
                  <div style={{ color: '#D0D0D0', fontSize: '11px', lineHeight: '1.7' }}>
                    实时监控只看“最新的N笔”，异常发生10分钟后就被新数据淹没，永远不会留下痕迹。
                    历史滑动扫描解决这个问题：对<span style={{ color: GOLD_COLOR }}>全部历史数据</span>做一次完整的回测，把每一个曾经发生过的异常时间段永久入库、留存证据。
                  </div>
                </div>

                {/* 二、工作原理 */}
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ color: GOLD_COLOR, fontSize: '11px', fontWeight: 'bold', marginBottom: '6px', paddingBottom: '4px', borderBottom: '1px solid rgba(201,168,76,0.15)' }}>二、工作原理</div>
                  <div style={{ color: '#D0D0D0', fontSize: '11px', lineHeight: '1.7' }}>
                    想象把1000笔历史数据排成一行，用一个滑动的“窗口”从左向右扫过每一个位置：
                  </div>
                  <div style={{ backgroundColor: 'rgba(201,168,76,0.06)', borderRadius: '8px', padding: '10px', margin: '8px 0', fontFamily: 'monospace', fontSize: '10px', color: '#C0C0C0', lineHeight: '1.8' }}>
                    第1笔 → 第30笔：检验这30笔是否异常<br/>
                    第11笔 → 第40笔：检验这30笔是否异常<br/>
                    第21笔 → 第50笔：检验这30笔是否异常<br/>
                    ……共进行数百次独立检验
                  </div>
                  <div style={{ color: '#D0D0D0', fontSize: '11px', lineHeight: '1.7' }}>
                    每次扫描步长为<span style={{ color: GOLD_COLOR }}>10笔</span>，三个窗口尺寸分别为<span style={{ color: GOLD_COLOR }}>30笔、150笔、500笔</span>，覆盖短期、中期、长期三个时间维度。
                  </div>
                </div>

                {/* 三、计算逻辑 */}
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ color: GOLD_COLOR, fontSize: '11px', fontWeight: 'bold', marginBottom: '6px', paddingBottom: '4px', borderBottom: '1px solid rgba(201,168,76,0.15)' }}>三、计算逻辑（加权概率）</div>
                  <div style={{ color: '#D0D0D0', fontSize: '11px', lineHeight: '1.7' }}>
                    每笔投注的号码不同，理论中奖概率也不同，因此不能简单用“10笔中了几笔”来判断，而是采用加权计算：
                  </div>
                  <div style={{ backgroundColor: 'rgba(201,168,76,0.06)', borderRadius: '8px', padding: '10px', margin: '8px 0', fontSize: '10px', color: '#C0C0C0', lineHeight: '1.9' }}>
                    <div style={{ color: GOLD_COLOR, marginBottom: '4px' }}>期望中奖数 = 每笔理论概率之和</div>
                    <div>如：10笔中，每笔理论概率分别为 8%、8%、12%、15%…</div>
                    <div>期望中奖数 = 0.08+0.08+0.12+0.15+… = 1.05笔</div>
                    <div style={{ color: GOLD_COLOR, margin: '6px 0 2px' }}>Z-Score = (实际中奖数 − 期望中奖数) ÷ 加权标准差</div>
                    <div>加权标准差 = √(每笔概率 × (1−概率) 之和)</div>
                  </div>
                </div>

                {/* 四、预警等级 */}
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ color: GOLD_COLOR, fontSize: '11px', fontWeight: 'bold', marginBottom: '6px', paddingBottom: '4px', borderBottom: '1px solid rgba(201,168,76,0.15)' }}>四、预警等级划分</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {[
                      { color: '#C9A84C', label: '需关注', desc: 'Z > 2.5，实际胜率较期望偏高，属于边界异常' },
                      { color: '#E78340', label: '高度异常', desc: 'Z > 3.0，异常显著，在正常随机情况下概率低于0.1%' },
                      { color: '#F47068', label: '确定异常', desc: 'Z > 3.5 且连续多组离群，几乎不可能是偶然，是确定性作弊的强烈信号' },
                    ].map(item => (
                      <div key={item.label} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                        <div style={{ width: '52px', flexShrink: 0, fontSize: '9px', fontWeight: 'bold', color: item.color, backgroundColor: `${item.color}15`, border: `1px solid ${item.color}30`, borderRadius: '4px', padding: '2px 4px', textAlign: 'center', marginTop: '1px' }}>{item.label}</div>
                        <div style={{ color: '#B0B0B0', fontSize: '10px', lineHeight: '1.6' }}>{item.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 五、使用建议 */}
                <div>
                  <div style={{ color: GOLD_COLOR, fontSize: '11px', fontWeight: 'bold', marginBottom: '6px', paddingBottom: '4px', borderBottom: '1px solid rgba(201,168,76,0.15)' }}>五、使用建议</div>
                  <div style={{ color: '#D0D0D0', fontSize: '11px', lineHeight: '1.8' }}>
                    ① 首次使用时点击「全量扫描」，对历史所有数据做一次完整回测，建立基线数据库。<br/>
                    ② 此后每天或每周定期扫描一次，新增的异常窗口会自动入库。<br/>
                    ③ 通过「近N天」过滤器查看不同时间范围的历史预警。<br/>
                    ④ 当“确定异常”条数较多时，结合具体时间段和第几笔到第几笔的区间进行证据取证。
                  </div>
                </div>

                <div style={{ textAlign: 'center', marginTop: '16px' }}>
                  <button onClick={() => setShowHelp(false)}
                    style={{ backgroundColor: GOLD_COLOR, color: '#0D0D0D', fontSize: '12px', fontWeight: 'bold', padding: '8px 32px', borderRadius: '20px', border: 'none', cursor: 'pointer' }}>
                    我明白了
                  </button>
                </div>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {/* 时间过滤 */}
            {[7, 30, 90].map(d => (
              <button key={d}
                onClick={() => setDaysFilter(d)}
                className="text-[9px] px-1.5 py-0.5 rounded"
                style={{
                  color: daysFilter === d ? GOLD_COLOR : LABEL_COLOR,
                  backgroundColor: daysFilter === d ? 'rgba(201,168,76,0.15)' : 'transparent',
                  border: `1px solid ${daysFilter === d ? 'rgba(201,168,76,0.3)' : 'rgba(255,255,255,0.1)'}`,
                }}>
                近{d}天
              </button>
            ))}
            {/* 扫描按鈕 */}
            <button
              onClick={() => { setScanning(true); scanMutation.mutate({}); }}
              disabled={scanning}
              className="text-[9px] px-2 py-0.5 rounded"
              style={{
                color: scanning ? LABEL_COLOR : '#0D0D0D',
                backgroundColor: scanning ? 'rgba(255,255,255,0.05)' : GOLD_COLOR,
                border: 'none',
                opacity: scanning ? 0.6 : 1,
              }}>
              {scanning ? '扫描中...' : '全量扫描'}
            </button>
          </div>
        </div>

        {/* 扫描结果提示 */}
        {scanResult && (
          <div className="text-[9px] mb-2 px-2 py-1 rounded" style={{ backgroundColor: 'rgba(61,214,140,0.08)', color: GREEN_COLOR }}>
            扫描完成：共扫描 {scanResult.scanned} 个窗口（全量 {scanResult.total} 笔），新增 {scanResult.newAlerts} 条预警
          </div>
        )}

        {/* 汇总统计卡片 */}
        {Object.keys(summary).length > 0 && (
          <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {[30, 150, 500].map(ws => {
              const s = (summary as any)[ws];
              if (!s) return null;
              const hasAbnormal = s.abnormalCount > 0;
              return (
                <div key={ws} style={{ flex: '1 1 0' }} className="text-center">
                  <div className="text-[9px] mb-0.5" style={{ color: GOLD_COLOR }}>窗口{ws}笔</div>
                  <div className="text-[12px] font-bold font-mono" style={{ color: hasAbnormal ? '#F47068' : DATA_COLOR }}>
                    {s.totalAlerts}
                  </div>
                  <div className="text-[8px]" style={{ color: LABEL_COLOR }}>预警条数</div>
                  {s.abnormalCount > 0 && (
                    <div className="text-[8px] font-bold" style={{ color: '#F47068' }}>确定异常 {s.abnormalCount}条</div>
                  )}
                  <div className="text-[8px]" style={{ color: LABEL_COLOR }}>max σ {Number(s.maxSigma).toFixed(1)}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* 预警列表 */}
        {alertsLoading && (
          <div className="text-center py-4 text-xs" style={{ color: LABEL_COLOR }}>加载中...</div>
        )}
        {!alertsLoading && alerts.length === 0 && (
          <div className="text-center py-4 text-[10px]" style={{ color: LABEL_COLOR }}>
            {Object.keys(summary).length === 0 ? '尚未扫描，点击「全量扫描」开始检测' : '最近没有预警记录'}
          </div>
        )}
        {!alertsLoading && alerts.length > 0 && (
          <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
            {alerts.slice(0, 50).map((a: any) => {
              const lv = alertLevelLabel(a.alertLevel);
              return (
                <div key={a.id} className="mb-1.5 px-2 py-1.5 rounded"
                  style={{ backgroundColor: `${lv.color}10`, border: `1px solid ${lv.color}25` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span className="text-[9px] font-bold px-1 py-0.5 rounded" style={{ color: lv.color, backgroundColor: `${lv.color}20` }}>{lv.text}</span>
                      <span className="text-[9px]" style={{ color: GOLD_COLOR }}>窗口{a.windowSize}笔</span>
                      <span className="text-[9px]" style={{ color: LABEL_COLOR }}>#{a.startIndex}-{a.endIndex}</span>
                    </div>
                    <div className="text-[9px] font-mono font-bold" style={{ color: lv.color }}>+{a.sigmaValue.toFixed(2)}σ</div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '3px' }}>
                    <span className="text-[8px]" style={{ color: LABEL_COLOR }}>实际胜率 <span style={{ color: DATA_COLOR }}>{a.actualWinRate.toFixed(1)}%</span></span>
                    <span className="text-[8px]" style={{ color: LABEL_COLOR }}>期望胜率 <span style={{ color: LABEL_COLOR }}>{a.expectedWinRate.toFixed(1)}%</span></span>
                    {a.consecutiveOutlierGroups > 0 && (
                      <span className="text-[8px] font-bold" style={{ color: '#F47068' }}>连续{a.consecutiveOutlierGroups}组离群</span>
                    )}
                  </div>
                  {a.windowStartTime && (
                    <div className="text-[8px] mt-0.5" style={{ color: LABEL_COLOR, opacity: 0.6 }}>
                      {new Date(a.windowStartTime).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      {' ~ '}
                      {new Date(a.windowEndTime).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
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
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px]" style={{ color: LABEL_COLOR }}>AI监控 <span style={{ color: GOLD_COLOR }}>投注金额</span></div>
        </div>

        {isLoading && (
          <div className="text-center py-4 text-xs" style={{ color: LABEL_COLOR }}>加载中...</div>
        )}

        {!isLoading && (!amountData || amountData.length === 0) && (
          <div className="text-center py-4 text-xs" style={{ color: LABEL_COLOR }}>暂无投注数据</div>
        )}

        {!isLoading && amountData && amountData.length > 0 && (
          <>
            {/* 汇总概览 - 黄色标签行 */}
            {summary && (
              <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'nowrap' }}>
                <div className="text-[9px] px-1.5 py-0.5 rounded" style={{ color: GOLD_COLOR, backgroundColor: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)', whiteSpace: 'nowrap' }}>
                  档位 <span className="font-mono font-bold">{amountData.length}</span>
                </div>
                <div className="text-[9px] px-1.5 py-0.5 rounded" style={{ color: GOLD_COLOR, backgroundColor: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)', whiteSpace: 'nowrap' }}>
                  投注 <span className="font-mono font-bold">{summary.totalBets}</span>
                </div>
                <div className="text-[9px] px-1.5 py-0.5 rounded" style={{ color: GOLD_COLOR, backgroundColor: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)', whiteSpace: 'nowrap' }}>
                  中奖 <span className="font-mono font-bold">{summary.totalWins}</span>
                </div>
                <div className="text-[9px] px-1.5 py-0.5 rounded" style={{ color: summary.totalProfit >= 0 ? GREEN_COLOR : RED_COLOR, backgroundColor: summary.totalProfit >= 0 ? 'rgba(61,214,140,0.1)' : 'rgba(231,64,64,0.1)', border: `1px solid ${summary.totalProfit >= 0 ? 'rgba(61,214,140,0.2)' : 'rgba(231,64,64,0.2)'}`, whiteSpace: 'nowrap' }}>
                  获利 <span className="font-mono font-bold">{summary.totalProfit >= 0 ? '+' : ''}{summary.totalProfit.toFixed(1)}</span>
                </div>
              </div>
            )}

            {/* 表头 */}
            <div style={{ display: 'flex', width: '100%', paddingBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.08)', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ width: '58px', flexShrink: 0 }} className="text-[9px] font-medium"><span style={{ color: LABEL_COLOR }}>金额</span></div>
              <div style={{ width: '22px', flexShrink: 0, textAlign: 'center' }} className="text-[9px] font-medium"><span style={{ color: LABEL_COLOR }}>次数</span></div>
              <div style={{ width: '34px', flexShrink: 0, textAlign: 'center' }} className="text-[9px] font-medium"><span style={{ color: LABEL_COLOR }}>实际</span></div>
              <div style={{ width: '34px', flexShrink: 0, textAlign: 'center' }} className="text-[9px] font-medium"><span style={{ color: LABEL_COLOR }}>理论</span></div>
              <div style={{ width: '36px', flexShrink: 0, textAlign: 'center' }} className="text-[9px] font-medium"><span style={{ color: LABEL_COLOR }}>偏离</span></div>
              <div style={{ width: '40px', flexShrink: 0, textAlign: 'center' }} className="text-[9px] font-medium"><span style={{ color: LABEL_COLOR }}>获利</span></div>
              <div style={{ width: '40px', flexShrink: 0, textAlign: 'right' }} className="text-[9px] font-medium"><span style={{ color: LABEL_COLOR }}>正态</span></div>
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
                    display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between',
                    paddingTop: '5px', paddingBottom: '5px',
                    borderBottom: idx < amountData.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none'
                  }}
                >
                  <div style={{ width: '58px', flexShrink: 0 }}>
                    <span className="text-[10px] font-bold font-mono" style={{ color: GOLD_COLOR, whiteSpace: 'nowrap' }}>
                      {item.amountYuan.toFixed(2)}元
                    </span>
                  </div>
                  <div style={{ width: '22px', flexShrink: 0, textAlign: 'center' }}>
                    <span className="text-[10px] font-mono" style={{ color: DATA_COLOR }}>{item.betCount}</span>
                  </div>
                  <div style={{ width: '34px', flexShrink: 0, textAlign: 'center' }}>
                    <span className="text-[10px] font-mono" style={{ color: DATA_COLOR }}>{Number(item.actualPct).toFixed(1)}%</span>
                  </div>
                  <div style={{ width: '34px', flexShrink: 0, textAlign: 'center' }}>
                    <span className="text-[10px] font-mono" style={{ color: LABEL_COLOR }}>{Number(item.theoryPct).toFixed(1)}%</span>
                  </div>
                  <div style={{ width: '36px', flexShrink: 0, textAlign: 'center' }}>
                    <span className="text-[10px] font-bold font-mono" style={{ color: devColor }}>
                      {item.deviation > 0 ? '+' : ''}{Number(item.deviation).toFixed(1)}%
                    </span>
                  </div>
                  <div style={{ width: '40px', flexShrink: 0, textAlign: 'center' }}>
                    <span className="text-[10px] font-bold font-mono" style={{ color: profitColor }}>
                      {item.profit >= 0 ? '+' : ''}{item.profit.toFixed(1)}
                    </span>
                  </div>
                  <div style={{ width: '40px', flexShrink: 0, textAlign: 'right' }}>
                    <span
                      className="text-[9px] font-bold px-1 py-0.5 rounded"
                      style={{ color: sig.color, backgroundColor: `${sig.color}15`, whiteSpace: 'nowrap', display: 'inline-block' }}
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

// ========== 累计盈亏曲线（单独卡片，放在投注统计下方）==========
function CumPnlCard() {
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const { data, isLoading } = trpc.getQQChartData.useQuery(undefined, {
    refetchInterval: 5 * 60 * 1000,
  });
  const [Chart, setChart] = React.useState<any>(null);
  // 每个数据点的像素宽度，用于缩放
  const [pxPerPoint, setPxPerPoint] = React.useState(14);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const cumPnlLengthRef = React.useRef<number>(0);
  const pinchRef = React.useRef<{ startDist: number; startPx: number } | null>(null);

  useEffect(() => {
    Promise.all([import('chart.js'), import('react-chartjs-2')]).then(([chartjs, rChartjs]) => {
      const { Chart: ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } = chartjs;
      ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);
      setChart({ Line: rChartjs.Line });
    });
  }, []);

  // 数据加载完成后自动滚动到最右侧（最新数据）
  useEffect(() => {
    if (!isLoading && data?.cumPnl?.length && scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth;
    }
  }, [isLoading, data?.cumPnl?.length]);

  // 双指捏合缩放处理
  const handleTouchStart = React.useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      pinchRef.current = { startDist: dist, startPx: pxPerPoint };
    }
  }, [pxPerPoint]);

  const handleTouchMove = React.useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scale = dist / pinchRef.current.startDist;
      const containerWidth = containerRef.current?.offsetWidth ?? 300;
      const minPx = cumPnlLengthRef.current > 0 ? containerWidth / cumPnlLengthRef.current : 4;
      const newPx = Math.min(60, Math.max(minPx, pinchRef.current.startPx * scale));
      setPxPerPoint(newPx);
      e.preventDefault();
    }
  }, []);

  const handleTouchEnd = React.useCallback(() => {
    pinchRef.current = null;
  }, []);

  const cardStyle: React.CSSProperties = {
    background: 'linear-gradient(145deg, rgba(18,42,68,0.95) 0%, rgba(11,28,48,0.98) 100%)',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: '16px',
    padding: '14px 14px 10px',
    marginBottom: '10px',
    marginTop: '12px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.06) inset, 0 -1px 0 rgba(0,0,0,0.4) inset',
    backdropFilter: 'blur(16px)',
    position: 'relative',
    overflow: 'hidden',
  };

  if (isLoading || !Chart) {
    return (
      <div className="mx-3 mb-1">
        <div style={cardStyle}>
          <div style={{ position: 'absolute', top: 0, left: '10%', right: '10%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(201,168,76,0.35), transparent)' }} />
          <div className="text-[10px] font-bold tracking-widest" style={{ color: GOLD_COLOR }}>累计盈亏曲线</div>
          <div className="text-[11px] mt-1" style={{ color: LABEL_COLOR }}>加载中...</div>
        </div>
      </div>
    );
  }

  const { Line } = Chart;
  const cumPnl = data?.cumPnl ?? [];
  cumPnlLengthRef.current = cumPnl.length;

  return (
    <div className="mx-3 mb-1">
      <div style={cardStyle}>
        <div style={{ position: 'absolute', top: 0, left: '10%', right: '10%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(201,168,76,0.35), transparent)' }} />
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px]">◳</span>
            <span className="text-[10px] font-bold tracking-wider" style={{ color: GOLD_COLOR }}>累计盈亏曲线</span>
          </div>
          <span className="text-[8px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(201,168,76,0.15)', color: GOLD_COLOR, border: '1px solid rgba(201,168,76,0.25)' }}>资金轨迹</span>
        </div>
        <div className="text-[8px] mb-2" style={{ color: LABEL_COLOR, opacity: 0.65 }}>每20笔采样一次，共{cumPnl.length}个数据点 · 左滑查看历史 · 双指缩放</div>
        {/* 冻结Y轴 + 横向可滑动 + 双指缩放 */}
        <div style={{ position: 'relative', height: '160px' }}>
          {/* 冻结Y轴：纯HTML自绘，右对齐，紧贴曲线区域左边界 */}
          {(() => {
            const vals = cumPnl.map((d: any) => d.pnl as number);
            const dataMin = vals.length ? Math.min(...vals) : 0;
            const dataMax = vals.length ? Math.max(...vals) : 0;
            // 以0为锚点：正方向取dataMax，负方向取dataMin的绝对值，取两者较大值作为单侧range
            const posMax = Math.max(dataMax, 0);
            const negMax = Math.abs(Math.min(dataMin, 0));
            // 单侧步长：上下各2格，共5个刻度（+2step, +1step, 0, -1step, -2step）
            const sideSteps = 2;
            const posStep = posMax > 0 ? posMax / sideSteps : (negMax / sideSteps || 1);
            const negStep = negMax > 0 ? negMax / sideSteps : posStep;
            // 取上下步长一致（取较大值），让刻度对称美观
            const step = Math.max(posStep, negStep);
            const yMax = step * sideSteps;
            const yMin = -step * sideSteps;
            // 5个刻度：从上到下 +2step, +1step, 0, -1step, -2step
            const tickVals = [yMax, step, 0, -step, yMin];
            const fmt = (v: number) => {
              if (v === 0) return '0';
              if (Math.abs(v) >= 10000) return (v / 10000).toFixed(1) + 'w';
              if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1) + 'k';
              return Math.round(v).toString();
            };
            return (
              <div style={{ position: 'absolute', top: 0, left: 0, width: '46px', height: '160px', zIndex: 2, background: 'linear-gradient(145deg, rgba(18,42,68,0.98) 0%, rgba(11,28,48,0.99) 100%)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingTop: '4px', paddingBottom: '18px', boxSizing: 'border-box' }}>
                {tickVals.map((v, i) => (
                  <div key={i} style={{ width: '100%', textAlign: 'right', paddingRight: '4px', fontSize: '9px', color: v === 0 ? '#E8F0FE' : '#7A9BBF', fontWeight: v === 0 ? 'bold' : 'normal', lineHeight: '1', whiteSpace: 'nowrap' }}>{fmt(v)}</div>
                ))}
              </div>
            );
          })()}
          {/* 横向可滑动区域（含X轴和曲线，左侧留出Y轴宽度） */}
          <div
            ref={(el) => { (scrollContainerRef as React.MutableRefObject<HTMLDivElement|null>).current = el; (containerRef as React.MutableRefObject<HTMLDivElement|null>).current = el; }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{
              position: 'absolute',
              top: 0,
              left: '46px',
              right: 0,
              height: '160px',
              overflowX: 'auto',
              overflowY: 'hidden',
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            <div style={{ width: Math.max(cumPnl.length * pxPerPoint, (containerRef.current?.offsetWidth ?? 300)) + 'px', height: '160px' }}>
              <Line
                data={{
                  labels: cumPnl.map((d: any) => d.idx),
                  datasets: [{
                    data: cumPnl.map((d: any) => d.pnl),
                    borderColor: '#3DD68C',
                    backgroundColor: (ctx: any) => {
                      const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 160);
                      gradient.addColorStop(0, 'rgba(61,214,140,0.18)');
                      gradient.addColorStop(1, 'rgba(61,214,140,0.01)');
                      return gradient;
                    },
                    borderWidth: 1.8,
                    pointRadius: 0,
                    fill: true,
                    tension: 0.35,
                  }],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  animation: false,
                  plugins: {
                    legend: { display: false },
                    tooltip: { backgroundColor: 'rgba(13,27,42,0.95)', titleColor: '#E8F0FE', bodyColor: '#7A9BBF', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1 },
                  },
                  scales: {
                    x: { ticks: { color: '#7A9BBF', font: { size: 9 }, maxRotation: 0 }, grid: { color: 'rgba(255,255,255,0.04)' } },
                    y: {
                      display: false,
                      min: (() => {
                        const vs = cumPnl.map((d: any) => d.pnl as number);
                        const dMin = vs.length ? Math.min(...vs) : 0;
                        const dMax = vs.length ? Math.max(...vs) : 0;
                        const pMax = Math.max(dMax, 0);
                        const nMax = Math.abs(Math.min(dMin, 0));
                        const pStep = pMax > 0 ? pMax / 2 : (nMax / 2 || 1);
                        const nStep = nMax > 0 ? nMax / 2 : pStep;
                        const s = Math.max(pStep, nStep);
                        return -s * 2;
                      })(),
                      max: (() => {
                        const vs = cumPnl.map((d: any) => d.pnl as number);
                        const dMin = vs.length ? Math.min(...vs) : 0;
                        const dMax = vs.length ? Math.max(...vs) : 0;
                        const pMax = Math.max(dMax, 0);
                        const nMax = Math.abs(Math.min(dMin, 0));
                        const pStep = pMax > 0 ? pMax / 2 : (nMax / 2 || 1);
                        const nStep = nMax > 0 ? nMax / 2 : pStep;
                        const s = Math.max(pStep, nStep);
                        return s * 2;
                      })(),
                    },
                  },
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ========== 高阶图表分析面板 ==========
function QQChartsPanel() {
  const { data, isLoading } = trpc.getQQChartData.useQuery(undefined, {
    refetchInterval: 5 * 60 * 1000,
  });

  // 动态导入 Chart.js
  const [Chart, setChart] = React.useState<any>(null);
  useEffect(() => {
    Promise.all([
      import('chart.js'),
      import('react-chartjs-2'),
    ]).then(([chartjs, rChartjs]) => {
      const { Chart: ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler } = chartjs;
      ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);
      setChart({ Line: rChartjs.Line, Bar: rChartjs.Bar });
    });
  }, []);

  // 独立图表卡片样式：具备立体感和阶层感
  const chartCardStyle: React.CSSProperties = {
    background: 'linear-gradient(145deg, rgba(18,42,68,0.95) 0%, rgba(11,28,48,0.98) 100%)',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: '16px',
    padding: '14px 14px 10px',
    marginBottom: '10px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.06) inset, 0 -1px 0 rgba(0,0,0,0.4) inset',
    backdropFilter: 'blur(16px)',
    position: 'relative',
    overflow: 'hidden',
  };
  // 卡片顶部光泽条
  const chartCardGlow: React.CSSProperties = {
    position: 'absolute',
    top: 0, left: '10%', right: '10%',
    height: '1px',
    background: 'linear-gradient(90deg, transparent, rgba(201,168,76,0.35), transparent)',
  };
  const chartCardTitle = (icon: string, title: string, badge?: string) => (
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px]">{icon}</span>
        <span className="text-[10px] font-bold tracking-wider" style={{ color: GOLD_COLOR }}>{title}</span>
      </div>
      {badge && <span className="text-[8px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(201,168,76,0.15)', color: GOLD_COLOR, border: '1px solid rgba(201,168,76,0.25)' }}>{badge}</span>}
    </div>
  );

  const chartOptions = (title: string, yLabel = '') => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: { display: false },
      tooltip: { backgroundColor: 'rgba(13,27,42,0.95)', titleColor: '#E8F0FE', bodyColor: '#7A9BBF', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1 },
    },
    scales: {
      x: { ticks: { color: '#7A9BBF', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
      y: { ticks: { color: '#7A9BBF', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.04)' }, title: { display: !!yLabel, text: yLabel, color: '#7A9BBF', font: { size: 9 } } },
    },
  });

  if (isLoading || !Chart) {
    return (
      <div className="mx-3 mb-1">
        <div style={{ ...chartCardStyle }}>
          <div style={chartCardGlow} />
          <div className="text-[10px] font-bold tracking-widest" style={{ color: GOLD_COLOR }}>高阶图表分析</div>
          <div className="text-[11px] mt-1" style={{ color: LABEL_COLOR }}>加载中...</div>
        </div>
      </div>
    );
  }

  const { Line, Bar } = Chart;
  const cumPnl = data?.cumPnl ?? [];
  const hourly = data?.hourly ?? [];
  const multiplier = data?.multiplier ?? [];
  const dailyPnl = data?.dailyPnl ?? [];
  const numberPref = data?.numberPref ?? [];
  const houseEdge = data?.houseEdge ?? [];

  return (
    <div className="mx-3">

      {/* 模块标题 */}
      <div className="flex items-center gap-2 mb-2 px-1">
        <div style={{ width: '3px', height: '14px', background: 'linear-gradient(180deg, #C9A84C, #8B6914)', borderRadius: '2px' }} />
        <span className="text-[10px] font-bold tracking-widest" style={{ color: GOLD_COLOR }}>高阶图表分析</span>
        <span className="text-[8px]" style={{ color: LABEL_COLOR, opacity: 0.6 }}>Las Vegas / Macau Professional View</span>
      </div>

      {/* 2. 每日盈亏柱状图（累计盈亏曲线已移至投注统计下方）*/}
      <div style={chartCardStyle}>
        <div style={chartCardGlow} />
        {chartCardTitle('■', '每日投注 vs 中奖', '日度对比')}
        <div style={{ height: '130px' }}>
          <Bar
            data={{
              labels: dailyPnl.map((d: any) => d.day),
              datasets: [
                { label: '投注额', data: dailyPnl.map((d: any) => d.betSum), backgroundColor: 'rgba(122,155,191,0.55)', borderRadius: 4, borderSkipped: false as any },
                { label: '中奖额', data: dailyPnl.map((d: any) => d.winSum), backgroundColor: 'rgba(201,168,76,0.72)', borderRadius: 4, borderSkipped: false as any },
              ],
            }}
            options={{
              ...chartOptions('每日盈亏'),
              plugins: { ...chartOptions('每日盈亏').plugins, legend: { display: true, labels: { color: '#7A9BBF', font: { size: 9 }, boxWidth: 10, padding: 8 } } },
            }}
          />
        </div>
        <div className="flex gap-3 mt-1.5">
          {dailyPnl.map((d: any) => (
            <div key={d.day} className="flex-1 text-center">
              <div className="text-[8px]" style={{ color: LABEL_COLOR, opacity: 0.6 }}>{d.day}</div>
              <div className="text-[9px] font-mono font-bold" style={{ color: d.pnl >= 0 ? GREEN_COLOR : RED_COLOR }}>
                {d.pnl >= 0 ? '+' : ''}{d.pnl.toFixed(0)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. 每小时胜率 */}
      <div style={chartCardStyle}>
        <div style={chartCardGlow} />
        {chartCardTitle('◔', '每小时胜率分布', '时段分析')}
        <div style={{ height: '130px' }}>
          <Bar
            data={{
              labels: hourly.map((d: any) => `${d.hour}时`),
              datasets: [{
                data: hourly.map((d: any) => d.winRate),
                backgroundColor: hourly.map((d: any) =>
                  d.winRate > 40 ? 'rgba(244,112,104,0.75)' : 'rgba(122,155,191,0.5)'
                ),
                borderRadius: 4,
                borderSkipped: false as any,
              }],
            }}
            options={chartOptions('每小时胜率', '%')}
          />
        </div>
        <div className="text-[8px] mt-1.5 px-1" style={{ color: RED_COLOR, opacity: 0.85 }}>⚠ 红色柱表示胜率 &gt;40%，应重点关注该时段投注行为</div>
      </div>

      {/* 4. 倍投层级分布 */}
      <div style={chartCardStyle}>
        <div style={chartCardGlow} />
        {chartCardTitle('▲', '倍投层级分布', '斯斐波那契体系')}
        <div style={{ height: '130px' }}>
          <Bar
            data={{
              labels: multiplier.map((d: any) => d.label),
              datasets: [{
                data: multiplier.map((d: any) => d.count),
                backgroundColor: multiplier.map((_: any, i: number) =>
                  i < 2 ? 'rgba(61,214,140,0.65)' : i < 5 ? 'rgba(201,168,76,0.65)' : 'rgba(244,112,104,0.75)'
                ),
                borderRadius: 4,
                borderSkipped: false as any,
              }],
            }}
            options={chartOptions('倍投层级', '笔数')}
          />
        </div>
        <div className="flex gap-2 mt-1.5">
          <span className="text-[8px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(61,214,140,0.12)', color: GREEN_COLOR }}>x1–x3 正常区</span>
          <span className="text-[8px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(201,168,76,0.12)', color: GOLD_COLOR }}>x4–x31 预警区</span>
          <span className="text-[8px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(244,112,104,0.12)', color: RED_COLOR }}>x32+ 极限区</span>
        </div>
      </div>

      {/* 5. 号码偏好 */}
      <div style={chartCardStyle}>
        <div style={chartCardGlow} />
        {chartCardTitle('◆', '选号偏好分布', '行为分析')}
        <div className="text-[8px] mb-1.5" style={{ color: LABEL_COLOR, opacity: 0.65 }}>前10常用选号投注次数排行</div>
        <div style={{ height: '130px' }}>
          <Bar
            data={{
              labels: numberPref.map((d: any) => d.content),
              datasets: [{
                data: numberPref.map((d: any) => d.cnt),
                backgroundColor: numberPref.map((_: any, i: number) => {
                  const alpha = 0.85 - i * 0.06;
                  return `rgba(201,168,76,${alpha.toFixed(2)})`;
                }),
                borderRadius: 4,
                borderSkipped: false as any,
              }],
            }}
            options={chartOptions('号码偏好', '投注次数')}
          />
        </div>
      </div>

      {/* 6. 庄家优势 */}
      {houseEdge.length > 0 && (
        <div style={{ ...chartCardStyle, marginBottom: '4px' }}>
          <div style={chartCardGlow} />
          {chartCardTitle('◉', '庄家优势率', '赔率校验')}
          <div className="text-[8px] mb-1.5" style={{ color: LABEL_COLOR, opacity: 0.65 }}>各玩法实际庄家优势％（基于差值概率表精算）</div>
          <div style={{ height: '130px' }}>
            <Bar
              data={{
                labels: houseEdge.map((d: any) => d.content),
                datasets: [{
                  data: houseEdge.map((d: any) => d.houseEdgePct),
                  backgroundColor: houseEdge.map((d: any) =>
                    d.houseEdgePct > 0 ? 'rgba(61,214,140,0.65)' : 'rgba(244,112,104,0.65)'
                  ),
                  borderRadius: 4,
                  borderSkipped: false as any,
                }],
              }}
              options={chartOptions('庄家优势', '%')}
            />
          </div>
          <div className="flex gap-2 mt-1.5">
            <span className="text-[8px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(61,214,140,0.12)', color: GREEN_COLOR }}>绿色 = 庄家正优势</span>
            <span className="text-[8px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(244,112,104,0.12)', color: RED_COLOR }}>红色 = 赔率偏高需调整</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function QQOnlinePage() {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();

  const { data: meData } = trpc.auth.me.useQuery();
  const currentUserId = (meData as any)?.id;
  const perSecond = currentUserId === YJH_ID ? PER_SECOND_YJH : PER_SECOND_FULL;
  const startAmount = '200万元整';
  const deposit = '20万元';

  const { data: tradeStats } = trpc.getQQTradeStats.useQuery(undefined, {
    refetchInterval: 60 * 1000,
  });

  const { data: settlementData } = trpc.getInterestSettlements.useQuery(
    { ledgerId: LEDGER_ID },
    { refetchInterval: 5 * 60 * 1000 }
  );
  const settledTotal = settlementData?.total || 0;

  // 盈利结算数据
  const { data: profitData } = trpc.getProfitSettlements.useQuery(
    { ledgerId: LEDGER_ID },
    { refetchInterval: 5 * 60 * 1000 }
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

          {/* 卡牲3：累计/待结/已结利息 */}
          <div className="rounded-2xl px-4 py-3" style={cardStyle}>
            <div className="text-[11px] mb-1" style={{ color: LABEL_COLOR }}>累计利息</div>
            <div className="flex items-center justify-between gap-1" style={{ flexWrap: 'nowrap' }}>
              <span className="text-sm font-bold font-mono" style={{ color: DATA_COLOR, whiteSpace: 'nowrap' }}>¥{interestCNY}</span>
              <span className="text-[10px]" style={{ color: LABEL_COLOR, whiteSpace: 'nowrap', flexShrink: 0 }}>≈{interestUSDT} U</span>
            </div>
            <div className="text-[11px] mt-2 mb-0.5" style={{ color: LABEL_COLOR }}>待结利息</div>
            <div className="flex items-center justify-between gap-1" style={{ flexWrap: 'nowrap' }}>
              <span className="text-sm font-bold font-mono" style={{ color: GOLD_COLOR, whiteSpace: 'nowrap' }}>¥{pendingCNY}</span>
              <span className="text-[10px]" style={{ color: LABEL_COLOR, whiteSpace: 'nowrap', flexShrink: 0 }}>≈{pendingUSDT} U</span>
            </div>
            <div className="text-[11px] mt-2 mb-0.5" style={{ color: LABEL_COLOR }}>已结利息</div>
            <div className="flex items-center justify-between gap-1" style={{ flexWrap: 'nowrap' }}>
              <span className="text-sm font-bold font-mono" style={{ color: GREEN_COLOR, whiteSpace: 'nowrap' }}>¥{settledCNY}</span>
              <span className="text-[10px]" style={{ color: LABEL_COLOR, whiteSpace: 'nowrap', flexShrink: 0 }}>≈{settledUSDT} U</span>
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
              <div className="flex items-baseline gap-1.5 mt-2 mb-0.5">
                <span className="text-[11px]" style={{ color: LABEL_COLOR }}>最近结算</span>
                {profitLast && (
                  <span className="text-[11px] font-mono" style={{ color: LABEL_COLOR, opacity: 0.8 }}>{profitLast.date}</span>
                )}
              </div>
              <div className="text-sm font-bold font-mono" style={{ color: GREEN_COLOR }}>
                {profitLast ? `¥${profitLast.amount.toFixed(2)}` : <span className="text-[11px]" style={{ color: LABEL_COLOR }}>暂无记录</span>}
              </div>
            </div>
          )}

          {/* 占位（非 jiang/yjh 用户显示空白） */}
          {currentUserId !== JIANG_ID && currentUserId !== YJH_ID && (
            <div className="rounded-2xl px-4 py-3" style={{ ...cardStyle, minHeight: '80px' }} />
          )}

          {/* 卡片5：投注统计（横跨两列，仅jiang可见） */}
          {(currentUserId === JIANG_ID || currentUserId === YJH_ID) && (
            <div className="col-span-2 rounded-2xl px-4 py-3" style={cardStyle}>
              {/* 标题行 */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px]" style={{ color: LABEL_COLOR }}>投注统计</span>
                <span className="text-[10px] font-mono" style={{ color: LABEL_COLOR }}>总计 <span style={{ color: DATA_COLOR }}>{tradeStats?.total ?? 0}</span> 笔</span>
              </div>

              {/* 第一行：实际中奖 / 实际未中奖 / 总数 */}
              <div className="rounded-xl px-3 py-2 mb-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <div className="text-[9px] mb-1.5 tracking-widest" style={{ color: LABEL_COLOR }}>实际结果</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0' }}>
                  <div style={{ borderRight: '1px solid rgba(255,255,255,0.06)', paddingRight: '8px' }}>
                    <div className="text-[9px] mb-0.5" style={{ color: LABEL_COLOR }}>实际中奖</div>
                    <div className="text-base font-bold font-mono" style={{ color: GREEN_COLOR }}>{tradeStats?.won ?? 0}</div>
                    <div className="text-[9px]" style={{ color: GREEN_COLOR, opacity: 0.7 }}>{pct(tradeStats?.won ?? 0, tradeStats?.total ?? 0)}</div>
                  </div>
                  <div style={{ borderRight: '1px solid rgba(255,255,255,0.06)', padding: '0 8px' }}>
                    <div className="text-[9px] mb-0.5" style={{ color: LABEL_COLOR }}>实际未中</div>
                    <div className="text-base font-bold font-mono" style={{ color: RED_COLOR }}>{tradeStats?.lost ?? 0}</div>
                    <div className="text-[9px]" style={{ color: RED_COLOR, opacity: 0.7 }}>{pct(tradeStats?.lost ?? 0, tradeStats?.total ?? 0)}</div>
                  </div>
                  <div style={{ paddingLeft: '8px' }}>
                    <div className="text-[9px] mb-0.5" style={{ color: LABEL_COLOR }}>投注总数</div>
                    <div className="text-base font-bold font-mono" style={{ color: DATA_COLOR }}>{tradeStats?.total ?? 0}</div>
                    <div className="text-[9px]" style={{ color: LABEL_COLOR }}>笔</div>
                  </div>
                </div>
              </div>

              {/* 第二行：加权期望中奖 / 加权期望未中 / 偏离度 */}
              <div className="rounded-xl px-3 py-2 mb-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <div className="text-[9px] mb-1.5 tracking-widest" style={{ color: LABEL_COLOR }}>加权期望（差值概率表逐笔计算）</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0' }}>
                  <div style={{ borderRight: '1px solid rgba(255,255,255,0.06)', paddingRight: '8px' }}>
                    <div className="text-[9px] mb-0.5" style={{ color: LABEL_COLOR }}>期望中奖</div>
                    <div className="text-sm font-bold font-mono" style={{ color: GOLD_COLOR }}>{tradeStats?.expectedWon ?? '-'}</div>
                    <div className="text-[9px]" style={{ color: GOLD_COLOR, opacity: 0.7 }}>{tradeStats?.expectedWon ? pct(tradeStats.expectedWon, tradeStats?.total ?? 0) : ''}</div>
                  </div>
                  <div style={{ borderRight: '1px solid rgba(255,255,255,0.06)', padding: '0 8px' }}>
                    <div className="text-[9px] mb-0.5" style={{ color: LABEL_COLOR }}>期望未中</div>
                    <div className="text-sm font-bold font-mono" style={{ color: GOLD_COLOR }}>{tradeStats?.expectedLost ?? '-'}</div>
                    <div className="text-[9px]" style={{ color: GOLD_COLOR, opacity: 0.7 }}>{tradeStats?.expectedLost ? pct(tradeStats.expectedLost, tradeStats?.total ?? 0) : ''}</div>
                  </div>
                  <div style={{ paddingLeft: '8px' }}>
                    <div className="text-[9px] mb-0.5" style={{ color: LABEL_COLOR }}>偏离度</div>
                    <div className="text-sm font-bold font-mono" style={{ color: (tradeStats?.deviation ?? 0) >= 0 ? GREEN_COLOR : RED_COLOR }}>
                      {(tradeStats?.deviation ?? 0) >= 0 ? '+' : ''}{tradeStats?.deviation ?? 0}%
                    </div>
                    <div className="text-[9px]" style={{ color: LABEL_COLOR }}>加权基准</div>
                  </div>
                </div>
              </div>

              {/* 第三行：投注额 */}
              <div className="rounded-xl px-3 py-2 mb-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <div className="text-[9px] mb-1.5 tracking-widest" style={{ color: LABEL_COLOR }}>投注额</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0' }}>
                  <div style={{ borderRight: '1px solid rgba(255,255,255,0.06)', paddingRight: '8px' }}>
                    <div className="text-[9px] mb-0.5" style={{ color: LABEL_COLOR }}>最大投</div>
                    <div className="text-[11px] font-bold font-mono" style={{ color: DATA_COLOR }}>{fmt(tradeStats?.maxAmount)}</div>
                  </div>
                  <div style={{ borderRight: '1px solid rgba(255,255,255,0.06)', padding: '0 8px' }}>
                    <div className="text-[9px] mb-0.5" style={{ color: LABEL_COLOR }}>最小投</div>
                    <div className="text-[11px] font-bold font-mono" style={{ color: DATA_COLOR }}>{fmt(tradeStats?.minAmount)}</div>
                  </div>
                  <div style={{ paddingLeft: '8px' }}>
                    <div className="text-[9px] mb-0.5" style={{ color: LABEL_COLOR }}>均投</div>
                    <div className="text-[11px] font-bold font-mono" style={{ color: GOLD_COLOR }}>{fmt(tradeStats?.avgAmount)}</div>
                  </div>
                </div>
              </div>

              {/* 第四行：派彩 */}
              <div className="rounded-xl px-3 py-2 mb-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <div className="text-[9px] mb-1.5 tracking-widest" style={{ color: LABEL_COLOR }}>派彩</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0' }}>
                  <div style={{ borderRight: '1px solid rgba(255,255,255,0.06)', paddingRight: '8px' }}>
                    <div className="text-[9px] mb-0.5" style={{ color: LABEL_COLOR }}>最大彩</div>
                    <div className="text-[11px] font-bold font-mono" style={{ color: DATA_COLOR }}>{fmt((tradeStats as any)?.maxPayout)}</div>
                  </div>
                  <div style={{ borderRight: '1px solid rgba(255,255,255,0.06)', padding: '0 8px' }}>
                    <div className="text-[9px] mb-0.5" style={{ color: LABEL_COLOR }}>最小彩</div>
                    <div className="text-[11px] font-bold font-mono" style={{ color: DATA_COLOR }}>{fmt((tradeStats as any)?.minPayout)}</div>
                  </div>
                  <div style={{ paddingLeft: '8px' }}>
                    <div className="text-[9px] mb-0.5" style={{ color: LABEL_COLOR }}>均彩</div>
                    <div className="text-[11px] font-bold font-mono" style={{ color: GOLD_COLOR }}>{fmt((tradeStats as any)?.avgPayout)}</div>
                  </div>
                </div>
              </div>

              {/* 第五行：总流水 / 期望损益 / 实际净盈亏 */}
              <div className="rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <div className="text-[9px] mb-1.5 tracking-widest" style={{ color: LABEL_COLOR }}>总流水与期望损益</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0' }}>
                  <div style={{ borderRight: '1px solid rgba(255,255,255,0.06)', paddingRight: '8px' }}>
                    <div className="text-[9px] mb-0.5" style={{ color: LABEL_COLOR }}>总流水</div>
                    <div className="text-[11px] font-bold font-mono" style={{ color: DATA_COLOR }}>{fmt((tradeStats as any)?.sumAmount)}</div>
                    <div className="text-[9px]" style={{ color: LABEL_COLOR, opacity: 0.6 }}>元</div>
                  </div>
                  <div style={{ borderRight: '1px solid rgba(255,255,255,0.06)', padding: '0 8px' }}>
                    <div className="text-[9px] mb-0.5" style={{ color: LABEL_COLOR }}>期望损益</div>
                    <div className="text-[11px] font-bold font-mono" style={{ color: ((tradeStats as any)?.expectedLossAmount ?? 0) >= 0 ? GOLD_COLOR : '#f87171' }}>
                      {((tradeStats as any)?.expectedLossAmount ?? 0) >= 0 ? '+' : ''}{fmt((tradeStats as any)?.expectedLossAmount)}
                    </div>
                    <div className="text-[9px]" style={{ color: LABEL_COLOR, opacity: 0.6 }}>赔率加权</div>
                  </div>
                  <div style={{ paddingLeft: '8px' }}>
                    <div className="text-[9px] mb-0.5" style={{ color: LABEL_COLOR }}>实际净盈亏</div>
                    <div className="text-[11px] font-bold font-mono" style={{ color: ((tradeStats as any)?.netProfit ?? 0) >= 0 ? '#4ade80' : '#f87171' }}>{((tradeStats as any)?.netProfit ?? 0) >= 0 ? '+' : ''}{fmt((tradeStats as any)?.netProfit)}</div>
                    <div className="text-[9px]" style={{ color: LABEL_COLOR, opacity: 0.6 }}>元</div>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── 累计盈亏曲线（投注统计下方）── */}
      {(currentUserId === JIANG_ID || currentUserId === YJH_ID) && <CumPnlCard />}
      {/* ── AI监控 习惯（jiang和yjh可见）── */}
      {(currentUserId === JIANG_ID || currentUserId === YJH_ID) && <AIHabitsPanel />}

      {/* ── 短周期监控（jiang和yjh可见）── */}
      {(currentUserId === JIANG_ID || currentUserId === YJH_ID) && <ShortCycleMonitorPanel />}

      {/* ── 历史滑动扫描预警（jiang和yjh可见）── */}
      {(currentUserId === JIANG_ID || currentUserId === YJH_ID) && <HistoryScanPanel />}

      {/* ── AI监控（jiang和yjh可见）── */}
      {(currentUserId === JIANG_ID || currentUserId === YJH_ID) && <AIRiskControlPanel />}

       {/* ── AI监控 - 投注金额（jiang和yjh可见）── */}
      {(currentUserId === JIANG_ID || currentUserId === YJH_ID) && <AmountAnalysisPanel />}
      {/* ── 高阶图表分析（jiang和yjh可见）── */}
      {(currentUserId === JIANG_ID || currentUserId === YJH_ID) && <QQChartsPanel />}
      {/* ── 蒙特卡洛风险模拟（jiang和yjh可见）── */}
      {(currentUserId === JIANG_ID || currentUserId === YJH_ID) && <MonteCarloCard />}
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

// ========== 蒙特卡洛风险模拟卡片 ==========
function MonteCarloCard() {
  const { data: mcData, isLoading } = trpc.getQQMonteCarloData.useQuery(undefined, {
    refetchInterval: 10 * 60 * 1000,
  });
  // 从localStorage恢复上次模拟结果
  const [simResult, setSimResult] = React.useState<any>(() => {
    try {
      const saved = localStorage.getItem('mc_sim_result_v1');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [simRunning, setSimRunning] = React.useState(false);

  const cardStyle: React.CSSProperties = {
    background: 'linear-gradient(145deg, rgba(18,42,68,0.95) 0%, rgba(11,28,48,0.98) 100%)',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: '16px',
    padding: '14px 14px 12px',
    marginBottom: '10px',
    marginTop: '12px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.45)',
    backdropFilter: 'blur(16px)',
    position: 'relative',
    overflow: 'hidden',
  };

  // 核心模拟函数：每天要么赢满dailyTarget，要么输光本金
  function runSimulation(params: {
    winRate: number;       // 胜率 0-1
    avgBet: number;        // 均投（元）
    avgPayout: number;     // 均彩（元）
    initialCapital: number; // 初始本金
    dailyTarget: number;   // 每日目标
    days: number;          // 模拟天数
    simCount: number;      // 模拟次数
  }) {
    const { winRate, avgBet, avgPayout, initialCapital, dailyTarget, days, simCount } = params;
    // 每笔期望净值
    const betEV = winRate * (avgPayout - avgBet) + (1 - winRate) * (-avgBet);
    // 每笔标准差
    const betStd = Math.sqrt(winRate * Math.pow(avgPayout - avgBet - betEV, 2) + (1 - winRate) * Math.pow(-avgBet - betEV, 2));

    // 模拟单天：要么赢满target，要么输光capital
    // 用正态近似：每笔均值betEV，标准差betStd，连续投注直到累计盈亏>=target或<=−capital
    function simulateOneDay(capital: number, target: number): { won: boolean; pnl: number } {
      let cumPnl = 0;
      let bets = 0;
      const maxBets = 2000; // 防止无限循环
      while (bets < maxBets) {
        // 单笔结果
        const r = Math.random();
        const pnl = r < winRate ? (avgPayout - avgBet) : -avgBet;
        cumPnl += pnl;
        bets++;
        if (cumPnl >= target) return { won: true, pnl: target };
        if (cumPnl <= -capital) return { won: false, pnl: -capital };
      }
      return { won: cumPnl > 0, pnl: cumPnl };
    }

    // 按天统计：各天的资产中位数、25/75分位、5/95分位
    const capitalByDay: number[][] = Array.from({ length: days + 1 }, () => []);
    const bankruptByDay = new Array(days + 1).fill(0);
    const bankruptDay: number[] = []; // 每条路径的破产天（-1=未破产）

    for (let s = 0; s < simCount; s++) {
      let capital = initialCapital;
      let bankrupt = false;
      let bankruptAt = -1;
      capitalByDay[0].push(capital);
      for (let d = 1; d <= days; d++) {
        if (bankrupt) {
          capitalByDay[d].push(0);
          bankruptByDay[d]++;
          continue;
        }
        const { won, pnl } = simulateOneDay(capital, dailyTarget);
        capital = won ? capital + pnl : 0;
        if (!won) {
          bankrupt = true;
          bankruptAt = d;
        }
        capitalByDay[d].push(capital);
        if (bankrupt) bankruptByDay[d]++;
      }
      bankruptDay.push(bankruptAt);
    }

    // 计算各天分位数
    function percentile(arr: number[], p: number) {
      const sorted = [...arr].sort((a, b) => a - b);
      const idx = Math.floor(p * sorted.length);
      return sorted[Math.min(idx, sorted.length - 1)];
    }

    const dayLabels = Array.from({ length: days + 1 }, (_, i) => i);
    const p50 = dayLabels.map(d => percentile(capitalByDay[d], 0.5));
    const p25 = dayLabels.map(d => percentile(capitalByDay[d], 0.25));
    const p75 = dayLabels.map(d => percentile(capitalByDay[d], 0.75));
    const p5  = dayLabels.map(d => percentile(capitalByDay[d], 0.05));
    const p95 = dayLabels.map(d => percentile(capitalByDay[d], 0.95));

    // 破产累计概率
    const bankruptCumRate = dayLabels.map(d => Math.round(bankruptByDay[d] / simCount * 1000) / 10);

    // 关键节点统计
    const checkpoints = [7, 15, 30, 60].filter(d => d <= days);
    const stats = checkpoints.map(d => {
      const survivedCount = capitalByDay[d].filter(c => c > 0).length;
      const profitCount = capitalByDay[d].filter(c => c > initialCapital).length;
      const avgCapital = capitalByDay[d].reduce((s, c) => s + c, 0) / simCount;
      return {
        day: d,
        profitRate: Math.round(profitCount / simCount * 1000) / 10,
        bankruptRate: Math.round((simCount - survivedCount) / simCount * 1000) / 10,
        avgCapital: Math.round(avgCapital),
      };
    });

    // 单日赢满概率（模拟1000次单天）
    let dailyWinCount = 0;
    for (let i = 0; i < 1000; i++) {
      const { won } = simulateOneDay(initialCapital, dailyTarget);
      if (won) dailyWinCount++;
    }
    const dailyWinRate = Math.round(dailyWinCount / 10);

    // 平均破产天数
    const bankruptPaths = bankruptDay.filter(d => d > 0);
    const avgBankruptDay = bankruptPaths.length > 0
      ? Math.round(bankruptPaths.reduce((s, d) => s + d, 0) / bankruptPaths.length * 10) / 10
      : null;

    return { dayLabels, p50, p25, p75, p5, p95, bankruptCumRate, stats, dailyWinRate, avgBankruptDay };
  }

  function handleSimulate() {
    if (!mcData) return;
    setSimRunning(true);
    // 使用setTimeout让UI先更新显示loading
    setTimeout(() => {
      const capital = mcData.currentBalance > 0 ? mcData.currentBalance : 1500;
      const dailyTarget = capital * 100; // 每日目标 = 本金 × 100
      const params = {
        avgBet: mcData.avgBet,
        avgPayout: mcData.avgPayout,
        initialCapital: capital,
        dailyTarget,
        days: 60,
        simCount: 100000,
      };
      const actualResult = runSimulation({ ...params, winRate: mcData.actualWinRate / 100 });
      const expectedResult = runSimulation({ ...params, winRate: mcData.expectedWinRate / 100 });
      const result = { actual: actualResult, expected: expectedResult, params: { ...params, mcData }, savedAt: new Date().toLocaleString('zh-CN') };
      setSimResult(result);
      // 持久化到localStorage
      try { localStorage.setItem('mc_sim_result_v1', JSON.stringify(result)); } catch {}
      setSimRunning(false);
    }, 50);
  }

  const fmtMoney = (v: number) => {
    if (Math.abs(v) >= 10000) return `${(v / 10000).toFixed(1)}w`;
    if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
    return String(Math.round(v));
  };

  return (
    <div className="mx-3 mb-1">
      <div style={cardStyle}>
        <div style={{ position: 'absolute', top: 0, left: '10%', right: '10%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(201,168,76,0.35), transparent)' }} />

        {/* 标题行 */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px]">◈</span>
            <span className="text-[10px] font-bold tracking-wider" style={{ color: GOLD_COLOR }}>蒙特卡洛风险模拟</span>
          </div>
          <span className="text-[8px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(201,168,76,0.15)', color: GOLD_COLOR, border: '1px solid rgba(201,168,76,0.25)' }}>10万次</span>
        </div>

        {/* 模拟条件说明 */}
        {mcData && !isLoading && (
          <div className="mb-3 px-2 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="text-[8px] mb-1 font-medium" style={{ color: GOLD_COLOR }}>模拟规则</div>
            <div className="text-[8px] leading-relaxed" style={{ color: LABEL_COLOR }}>
              每天要么赢满每日目标收手，要么把本金全部输光（两种极端）
            </div>
            <div className="grid grid-cols-3 gap-1 mt-2">
              <div className="text-center">
                <div className="text-[8px]" style={{ color: LABEL_COLOR }}>当前本金</div>
                <div className="text-[11px] font-bold font-mono" style={{ color: DATA_COLOR }}>¥{mcData.currentBalance.toFixed(0)}</div>
              </div>
              <div className="text-center">
                <div className="text-[8px]" style={{ color: LABEL_COLOR }}>每日目标</div>
                <div className="text-[11px] font-bold font-mono" style={{ color: GREEN_COLOR }}>¥{(mcData.currentBalance * 100).toFixed(0)}</div>
              </div>
              <div className="text-center">
                <div className="text-[8px]" style={{ color: LABEL_COLOR }}>倍数</div>
                <div className="text-[11px] font-bold font-mono" style={{ color: GOLD_COLOR }}>×100</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1 mt-1.5">
              <div className="text-center">
                <div className="text-[8px]" style={{ color: LABEL_COLOR }}>实际胜率</div>
                <div className="text-[11px] font-bold font-mono" style={{ color: DATA_COLOR }}>{mcData.actualWinRate}%</div>
              </div>
              <div className="text-center">
                <div className="text-[8px]" style={{ color: LABEL_COLOR }}>期望胜率</div>
                <div className="text-[11px] font-bold font-mono" style={{ color: LABEL_COLOR }}>{mcData.expectedWinRate}%</div>
              </div>
            </div>
          </div>
        )}

        {/* 模拟按钮 */}
        <button
          onClick={handleSimulate}
          disabled={simRunning || isLoading || !mcData}
          className="w-full py-2.5 rounded-xl text-[11px] font-bold tracking-wider mb-3 active:opacity-70"
          style={{
            background: simRunning ? 'rgba(201,168,76,0.2)' : 'linear-gradient(135deg, rgba(201,168,76,0.3) 0%, rgba(201,168,76,0.15) 100%)',
            border: '1px solid rgba(201,168,76,0.4)',
            color: GOLD_COLOR,
            cursor: simRunning ? 'not-allowed' : 'pointer',
          }}
        >
          {simRunning ? '模拟运行中... (约2-5秒)' : simResult ? '重新模拟（10万次）' : '开始模拟（10万次）'}
        </button>

        {/* 模拟结果 */}
        {simResult && (() => {
          const { actual, expected, params: p, savedAt } = simResult;
          const days = actual.dayLabels;
          const capital = p.mcData.currentBalance;
          const dailyTarget = capital * 100;

          // 图表公共配置
          const commonOptions = (title: string, yLabel: string, isPercent = false) => ({
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: true, labels: { color: LABEL_COLOR, font: { size: 9 }, boxWidth: 10, padding: 6 } },
              title: { display: true, text: title, color: GOLD_COLOR, font: { size: 9, weight: 'bold' as const }, padding: { bottom: 4 } },
              tooltip: { enabled: false },
            },
            scales: {
              x: {
                ticks: { color: LABEL_COLOR, font: { size: 7 }, maxTicksLimit: 8 },
                grid: { color: 'rgba(255,255,255,0.05)' },
              },
              y: {
                ticks: {
                  color: LABEL_COLOR,
                  font: { size: 7 },
                  callback: (v: any) => isPercent ? `${v}%` : fmtMoney(v),
                },
                grid: { color: 'rgba(255,255,255,0.05)' },
              },
            },
          });

          // 图1：实际胜率资金曲线
          const chart1Data = {
            labels: days.map((d: number) => d === 0 ? '0' : d % 10 === 0 ? `${d}天` : ''),
            datasets: [
              { label: '中位数', data: actual.p50, borderColor: GREEN_COLOR, borderWidth: 1.5, pointRadius: 0, fill: false },
              { label: '25-75%', data: actual.p75, borderColor: 'transparent', backgroundColor: 'rgba(61,214,140,0.15)', fill: '+1', pointRadius: 0, borderWidth: 0 },
              { label: '', data: actual.p25, borderColor: 'transparent', backgroundColor: 'rgba(61,214,140,0.15)', fill: false, pointRadius: 0, borderWidth: 0 },
              { label: '5-95%', data: actual.p95, borderColor: 'transparent', backgroundColor: 'rgba(61,214,140,0.07)', fill: '+1', pointRadius: 0, borderWidth: 0 },
              { label: '', data: actual.p5, borderColor: 'transparent', backgroundColor: 'rgba(61,214,140,0.07)', fill: false, pointRadius: 0, borderWidth: 0 },
            ],
          };

          // 图2：期望胜率资金曲线
          const chart2Data = {
            labels: days.map((d: number) => d === 0 ? '0' : d % 10 === 0 ? `${d}天` : ''),
            datasets: [
              { label: '中位数', data: expected.p50, borderColor: LABEL_COLOR, borderWidth: 1.5, pointRadius: 0, fill: false },
              { label: '25-75%', data: expected.p75, borderColor: 'transparent', backgroundColor: 'rgba(122,155,191,0.15)', fill: '+1', pointRadius: 0, borderWidth: 0 },
              { label: '', data: expected.p25, borderColor: 'transparent', backgroundColor: 'rgba(122,155,191,0.15)', fill: false, pointRadius: 0, borderWidth: 0 },
            ],
          };

          // 图3：破产累计概率
          const chart3Data = {
            labels: days.map((d: number) => d === 0 ? '0' : d % 10 === 0 ? `${d}天` : ''),
            datasets: [
              { label: `实际${p.mcData.actualWinRate}%`, data: actual.bankruptCumRate, borderColor: GREEN_COLOR, borderWidth: 1.5, pointRadius: 0, fill: false },
              { label: `期望${p.mcData.expectedWinRate}%`, data: expected.bankruptCumRate, borderColor: RED_COLOR, borderWidth: 1.5, pointRadius: 0, fill: false },
            ],
          };

          // 图4（柱状图）：单日赢满概率对比
          const chart4Data = {
            labels: [`实际\n${p.mcData.actualWinRate}%`, `期望\n${p.mcData.expectedWinRate}%`],
            datasets: [
              {
                label: '单日赢满概率',
                data: [actual.dailyWinRate, expected.dailyWinRate],
                backgroundColor: [
                  'rgba(61,214,140,0.6)',
                  'rgba(122,155,191,0.6)',
                ],
                borderColor: [GREEN_COLOR, LABEL_COLOR],
                borderWidth: 1,
                borderRadius: 4,
              },
            ],
          };

          return (
            <div>
              {/* 上次模拟时间 */}
              {savedAt && (
                <div className="text-[7px] mb-2 text-right" style={{ color: 'rgba(122,155,191,0.6)' }}>
                  上次模拟：{savedAt}
                </div>
              )}
              {/* 3图布局：左上+右上+左下，右下为柱状图 */}
              <div className="grid grid-cols-2 gap-2 mb-2">
                {/* 图1：实际胜率资金曲线 */}
                <div style={{ height: '130px' }}>
                  <Line data={chart1Data} options={commonOptions(`实际胜率 ${p.mcData.actualWinRate}%`, '资产')} />
                </div>
                {/* 图2：期望胜率资金曲线 */}
                <div style={{ height: '130px' }}>
                  <Line data={chart2Data} options={commonOptions(`期望胜率 ${p.mcData.expectedWinRate}%`, '资产')} />
                </div>
                {/* 图3：破产概率曲线 */}
                <div style={{ height: '130px' }}>
                  <Line data={chart3Data} options={commonOptions('破产累计概率', '%', true)} />
                </div>
                {/* 图4：单日赢满概率柱状图 */}
                <div style={{ height: '130px' }}>
                  <Bar
                    data={chart4Data}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { display: false },
                        title: { display: true, text: '单日赢满概率', color: GOLD_COLOR, font: { size: 9, weight: 'bold' as const }, padding: { bottom: 4 } },
                        tooltip: { enabled: false },
                      },
                      scales: {
                        x: { ticks: { color: LABEL_COLOR, font: { size: 8 } }, grid: { display: false } },
                        y: {
                          ticks: { color: LABEL_COLOR, font: { size: 7 }, callback: (v: any) => `${v}%` },
                          grid: { color: 'rgba(255,255,255,0.05)' },
                          max: 100,
                        },
                      },
                    }}
                  />
                </div>
              </div>

              {/* 汇总表 */}
              <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', overflow: 'hidden' }}>
                <div className="grid grid-cols-5 text-center py-1.5" style={{ background: 'rgba(201,168,76,0.1)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="text-[8px] font-bold" style={{ color: GOLD_COLOR }}>节点</div>
                  <div className="text-[8px] font-bold" style={{ color: GREEN_COLOR }}>实际盈利%</div>
                  <div className="text-[8px] font-bold" style={{ color: RED_COLOR }}>实际破产%</div>
                  <div className="text-[8px] font-bold" style={{ color: LABEL_COLOR }}>期望盈利%</div>
                  <div className="text-[8px] font-bold" style={{ color: LABEL_COLOR }}>期望破产%</div>
                </div>
                {actual.stats.map((s: any, i: number) => {
                  const es = expected.stats[i];
                  return (
                    <div key={s.day} className="grid grid-cols-5 text-center py-1.5" style={{ borderBottom: i < actual.stats.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                      <div className="text-[9px] font-bold font-mono" style={{ color: DATA_COLOR }}>第{s.day}天</div>
                      <div className="text-[9px] font-mono" style={{ color: GREEN_COLOR }}>{s.profitRate}%</div>
                      <div className="text-[9px] font-mono" style={{ color: RED_COLOR }}>{s.bankruptRate}%</div>
                      <div className="text-[9px] font-mono" style={{ color: LABEL_COLOR }}>{es?.profitRate ?? '-'}%</div>
                      <div className="text-[9px] font-mono" style={{ color: LABEL_COLOR }}>{es?.bankruptRate ?? '-'}%</div>
                    </div>
                  );
                })}
              </div>

              {/* 补充说明 */}
              <div className="mt-2 px-1">
                <div className="grid grid-cols-2 gap-2">
                  <div className="text-center">
                    <div className="text-[8px]" style={{ color: LABEL_COLOR }}>实际单日赢满概率</div>
                    <div className="text-[13px] font-bold font-mono" style={{ color: GREEN_COLOR }}>{actual.dailyWinRate}%</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[8px]" style={{ color: LABEL_COLOR }}>期望单日赢满概率</div>
                    <div className="text-[13px] font-bold font-mono" style={{ color: LABEL_COLOR }}>{expected.dailyWinRate}%</div>
                  </div>
                </div>
                {actual.avgBankruptDay && (
                  <div className="text-center mt-1.5">
                    <div className="text-[8px]" style={{ color: LABEL_COLOR }}>实际情景平均破产天数</div>
                    <div className="text-[11px] font-bold font-mono" style={{ color: RED_COLOR }}>第 {actual.avgBankruptDay} 天</div>
                  </div>
                )}
                <div className="text-[7px] mt-2 leading-relaxed" style={{ color: LABEL_COLOR, opacity: 0.6 }}>
                  本金¥{capital.toFixed(0)} · 每日目标¥{dailyTarget.toFixed(0)}（×100倍） · 10万次蒙特卡洛模拟 · 仅供参考
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
