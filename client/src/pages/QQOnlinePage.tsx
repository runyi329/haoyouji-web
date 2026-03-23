import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { History, Plus, RefreshCw, ClipboardList, X } from "lucide-react";

// 管理员（jiang）每月20万，yjh为1/5即4万
// 每秒收益 = 月收益 ÷ 30 ÷ 24 ÷ 3600
const PER_SECOND_FULL = 200000 / 30 / 24 / 3600;  // jiang
const PER_SECOND_YJH  =  40000 / 30 / 24 / 3600;  // yjh (1/5)
const YJH_ID = 4957151;
const JIANG_ID = 870413;
const START_TIME = new Date('2026-03-23T00:00:00+08:00').getTime();
const LEDGER_ID = 52;

export default function QQOnlinePage() {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();

  // 获取当前用户ID，判断利息份额
  const { data: meData } = trpc.auth.me.useQuery();
  const currentUserId = (meData as any)?.id;
  const perSecond = currentUserId === YJH_ID ? PER_SECOND_YJH : PER_SECOND_FULL;
  // 开始金额和保证金也按比例
  const startAmount = currentUserId === YJH_ID ? '40万元整' : '200万元整';
  const deposit = currentUserId === YJH_ID ? '4万元' : '20万元';

  // 投注统计（仅jiang可见）
  const { data: tradeStats } = trpc.getQQTradeStats.useQuery(undefined, {
    enabled: currentUserId === JIANG_ID,
    refetchInterval: 60 * 1000,
  });

  // 已结利息（仅jiang可见，从数据库读取）
  const { data: settlementData } = trpc.getInterestSettlements.useQuery(
    { ledgerId: LEDGER_ID },
    {
      enabled: currentUserId === JIANG_ID,
      refetchInterval: 5 * 60 * 1000, // 5分钟刷新一次
    }
  );
  // yjh看到的已结利息 = jiang已结利息 / 5
  const settledTotal = currentUserId === JIANG_ID
    ? (settlementData?.total || 0)
    : currentUserId === YJH_ID
      ? 0  // yjh暂不显示已结（如需要可改为 / 5）
      : 0;

  const { data, refetch } = trpc.getQQOnlineRecords.useQuery(
    { page: 1, pageSize: 1 },
    { refetchInterval: 60 * 1000 }
  );

  const latest = data?.list?.[0];

  // 倒计时（对齐QQ数据每分钟第1秒更新）
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

  useEffect(() => {
    if (countdown === 0) refetch();
  }, [countdown, refetch]);

  // 运行时长（按小时，先收后计）
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

  // 累计利息（按秒实时增长，根据用户份额计算）
  const [interest, setInterest] = useState(0);
  useEffect(() => {
    function calcInterest() {
      const elapsed = Math.max(0, Date.now() - START_TIME) / 1000; // 已过秒数
      setInterest(elapsed * perSecond);
    }
    calcInterest();
    const timer = setInterval(calcInterest, 1000);
    return () => clearInterval(timer);
  }, [perSecond]);

  function formatNum(n: number): string {
    return n.toLocaleString("zh-CN");
  }

  const interestCNY = interest.toFixed(2);
  const interestUSDT = (interest / 7).toFixed(2);

  // 待结利息 = 累计利息 - 已结利息
  const pendingInterest = Math.max(0, interest - settledTotal);
  const pendingCNY = pendingInterest.toFixed(2);
  const pendingUSDT = (pendingInterest / 7).toFixed(2);
  const settledCNY = settledTotal.toFixed(2);
  const settledUSDT = (settledTotal / 7).toFixed(2);

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #1A56DB 0%, #3B82F6 100%)' }}>

      {/* 主数据卡片 - 直接置顶 */}
      <div className="px-4 pt-4">
        <div className="rounded-2xl px-5 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-xs text-white/60">当前在线</span>
                <span className="text-[11px] text-white/40">{latest ? latest.online_time : ''}</span>
              </div>
              <div className="text-3xl font-bold text-white font-mono tracking-wide leading-tight">
                {latest ? formatNum(latest.online_num) : '加载中...'}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div
                className="rounded-xl flex items-center justify-center"
                style={{ backgroundColor: 'rgba(255,255,255,0.12)', width: '40px', height: '40px' }}
              >
                <span className="text-base font-bold font-mono text-white">{countdown}</span>
              </div>
              <button
                onClick={() => setLocation(`/ledger/${id}/qq/history`)}
                className="rounded-xl flex items-center justify-center active:opacity-70"
                style={{ backgroundColor: 'rgba(255,255,255,0.12)', width: '40px', height: '40px' }}
              >
                <History className="w-4 h-4 text-white/80" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2x2 数据卡片 */}
      <div className="px-4 pt-3">
        <div className="grid grid-cols-2 gap-3">
          {/* 第1个：开始时间 + 运行时长 */}
          <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}>
            <div className="text-[11px] text-white/55 mb-1">开始时间</div>
            <div className="text-sm font-bold text-white leading-snug">2026年3月23日</div>
            <div className="text-[11px] text-white/55 mt-2 mb-0.5">运行时长</div>
            <div className="text-sm font-bold text-white">
              {runHours >= 24
                ? `${Math.floor(runHours / 24)}天${runHours % 24}小时`
                : `${runHours}小时`}
            </div>
          </div>
          {/* 第2个：开始金额 + 保证金 */}
          <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}>
            <div className="text-[11px] text-white/55 mb-1">开始金额</div>
            <div className="text-sm font-bold text-white">{startAmount}</div>
            <div className="text-[11px] text-white/55 mt-2 mb-0.5">保证金</div>
            <div className="text-sm font-bold text-white">{deposit}</div>
          </div>
          {/* 第3个：累计利息 + 待结利息 + 已结利息 */}
          <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}>
            <div className="text-[11px] text-white/55 mb-1">累计利息</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-bold text-white font-mono">¥{interestCNY}</span>
              <span className="text-[10px] text-white/50">≈{interestUSDT} U</span>
            </div>
            <div className="text-[11px] text-white/55 mt-2 mb-0.5">待结利息</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-bold text-yellow-200 font-mono">¥{pendingCNY}</span>
              <span className="text-[10px] text-white/50">≈{pendingUSDT} U</span>
            </div>
            <div className="text-[11px] text-white/55 mt-2 mb-0.5">已结利息</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-bold text-green-300 font-mono">¥{settledCNY}</span>
              <span className="text-[10px] text-white/50">≈{settledUSDT} U</span>
            </div>
          </div>
          {/* 投注统计（横跨两列，仅jiang可见） */}
          {currentUserId === JIANG_ID && (
            <div className="col-span-2 rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}>
              <div className="text-[11px] text-white/55 mb-2">投注统计</div>
              <div className="grid grid-cols-2 gap-0">
                {/* 左列：次数 */}
                <div className="flex flex-col gap-2 pr-3 border-r border-white/10">
                  <div>
                    <div className="text-[10px] text-white/50 mb-0.5">投注次数</div>
                    <div className="text-base font-bold text-white font-mono">{tradeStats?.total ?? 0} 次</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-white/50 mb-0.5">中奖</div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-sm font-bold text-green-300 font-mono">{tradeStats?.won ?? 0} 次</span>
                      <span className="text-[10px] text-green-400/70">
                        {tradeStats?.total ? `${((tradeStats.won / tradeStats.total) * 100).toFixed(1)}%` : '--'}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-white/50 mb-0.5">未中奖</div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-sm font-bold text-red-300 font-mono">{tradeStats?.lost ?? 0} 次</span>
                      <span className="text-[10px] text-red-400/70">
                        {tradeStats?.total ? `${((tradeStats.lost / tradeStats.total) * 100).toFixed(1)}%` : '--'}
                      </span>
                    </div>
                  </div>
                </div>
                {/* 右列：金额 */}
                <div className="flex flex-col gap-2 pl-3">
                  <div>
                    <div className="text-[10px] text-white/50 mb-0.5">平均投注额</div>
                    <div className="text-sm font-bold text-yellow-200 font-mono">
                      {tradeStats?.avgAmount != null ? `¥${tradeStats.avgAmount.toFixed(2)}` : '--'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-white/50 mb-0.5">最大投注额</div>
                    <div className="text-sm font-bold text-white font-mono">
                      {tradeStats?.maxAmount != null ? `¥${tradeStats.maxAmount.toFixed(2)}` : '--'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-white/50 mb-0.5">最小投注额</div>
                    <div className="text-sm font-bold text-white font-mono">
                      {tradeStats?.minAmount != null ? `¥${tradeStats.minAmount.toFixed(2)}` : '--'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="h-20" />

      {/* 底部悬浮添加按钮（仅jiang可见） */}
      {currentUserId === JIANG_ID && (
        <>
          {/* 弹出菜单 */}
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
                className="flex items-center gap-3 px-5 py-3 rounded-2xl shadow-lg text-white text-sm font-medium"
                style={{ background: 'rgba(26,86,219,0.92)', backdropFilter: 'blur(8px)', minWidth: '160px' }}
              >
                <RefreshCw className="w-4 h-4" />
                刷新
              </button>
              <button
                onClick={() => { setShowMenu(false); setLocation(`/ledger/${id}/qq/trade`); }}
                className="flex items-center gap-3 px-5 py-3 rounded-2xl shadow-lg text-white text-sm font-medium"
                style={{ background: 'rgba(26,86,219,0.92)', backdropFilter: 'blur(8px)', minWidth: '160px' }}
              >
                <ClipboardList className="w-4 h-4" />
                交易记录
              </button>
            </div>
          )}
          <button
            onClick={() => setShowMenu(v => !v)}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center justify-center rounded-full shadow-lg active:opacity-80"
            style={{ width: '56px', height: '56px', background: 'linear-gradient(135deg, #1A56DB 0%, #3B82F6 100%)' }}
          >
            {showMenu ? <X className="w-6 h-6 text-white" /> : <Plus className="w-7 h-7 text-white" />}
          </button>
        </>
      )}
    </div>
  );
}
