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
function sigmaDisplay(level: string): { label: string; color: string } {
  switch (level) {
    case 'normal':       return { label: '1σ 正常', color: '#3DD68C' };
    case 'watch':        return { label: '2σ 关注', color: '#E7E740' };
    case 'suspect':      return { label: '3σ 可疑', color: '#E78340' };
    case 'abnormal':     return { label: '3σ+ 异常', color: '#E74040' };
    case 'insufficient': return { label: '样本不足', color: '#5A6B7F' };
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
        <div className="text-[11px] mb-2" style={{ color: LABEL_COLOR }}>AI风控部</div>

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
              <div style={{ flex: '2 1 0', minWidth: 0 }} className="text-[9px] font-medium text-right"><span style={{ color: LABEL_COLOR }}>分布</span></div>
            </div>

            {/* \u6570\u636e\u884c */}
            {riskData.map((item: any, idx: number) => {
              const sig = sigmaDisplay(item.sigmaLevel);
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
                    <span className="text-[10px] font-mono" style={{ color: DATA_COLOR }}>{item.actualPct}%</span>
                  </div>
                  <div style={{ flex: '1.5 1 0', minWidth: 0 }} className="text-center">
                    <span className="text-[10px] font-mono" style={{ color: LABEL_COLOR }}>{item.theoryPct}%</span>
                  </div>
                  <div style={{ flex: '1.8 1 0', minWidth: 0 }} className="text-center">
                    <span className="text-[10px] font-bold font-mono" style={{ color: devColor }}>
                      {item.deviation > 0 ? '+' : ''}{item.deviation}%
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
    return `${((part / total) * 100).toFixed(1)}%`;
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

          {/* 卡片4（占位，仅非jiang用户显示空白） */}
          {currentUserId !== JIANG_ID && (
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
                      <span className="text-[10px]" style={{ color: GREEN_COLOR, opacity: 0.7 }}>{pct(tradeStats?.won ?? 0, tradeStats?.total ?? 0)}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] mb-0.5" style={{ color: LABEL_COLOR }}>未中奖次数</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px' }}>
                      <span className="text-sm font-bold font-mono" style={{ color: RED_COLOR }}>{tradeStats?.lost ?? 0}</span>
                      <span className="text-[10px]" style={{ color: RED_COLOR, opacity: 0.7 }}>{pct(tradeStats?.lost ?? 0, tradeStats?.total ?? 0)}</span>
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

      {/* ── AI风控部（仅jiang可见）── */}
      {currentUserId === JIANG_ID && <AIRiskControlPanel />}

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
