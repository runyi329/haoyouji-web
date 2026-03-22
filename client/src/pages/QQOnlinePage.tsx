import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { History } from "lucide-react";

// 管理员（jiang）每月20万，yjh为1/5即4万
// 每秒收益 = 月收益 ÷ 30 ÷ 24 ÷ 3600
const PER_SECOND_FULL = 200000 / 30 / 24 / 3600;  // jiang
const PER_SECOND_YJH  =  40000 / 30 / 24 / 3600;  // yjh (1/5)
const YJH_ID = 4957151;
const START_TIME = new Date('2026-03-23T00:00:00+08:00').getTime();

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

  const { data, refetch } = trpc.getQQOnlineRecords.useQuery(
    { page: 1, pageSize: 1 },
    { refetchInterval: 60 * 1000 }
  );

  const latest = data?.list?.[0];

  // 倒计时（对齐QQ数据每分钟第1秒更新）
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
          {/* 第3个：累计利息 + 待结利息（按秒实时增长） */}
          <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}>
            <div className="text-[11px] text-white/55 mb-1">累计利息</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-bold text-white font-mono">¥{interestCNY}</span>
              <span className="text-[10px] text-white/50">≈{interestUSDT} U</span>
            </div>
            <div className="text-[11px] text-white/55 mt-2 mb-0.5">待结利息</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-bold text-white font-mono">¥{interestCNY}</span>
              <span className="text-[10px] text-white/50">≈{interestUSDT} U</span>
            </div>
          </div>
          {/* 第4个：空 */}
          <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', minHeight: '80px' }}>
          </div>
        </div>
      </div>

      <div className="h-20" />
    </div>
  );
}
