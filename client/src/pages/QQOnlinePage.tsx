import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { History } from "lucide-react";

export default function QQOnlinePage() {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();

  const { data, refetch } = trpc.getQQOnlineRecords.useQuery(
    { page: 1, pageSize: 1 },
    { refetchInterval: 60 * 1000 }
  );

  const latest = data?.list?.[0];

  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    function calcCountdown() {
      const now = new Date();
      // QQ数据在每分钟第1秒更新，所以倒计时基于距离下一个「第1秒」的秒数
      const sec = now.getSeconds();
      // 距离下一分钟第1秒的秒数
      const remaining = sec === 0 ? 1 : 61 - sec;
      setCountdown(remaining > 60 ? 0 : remaining);
    }
    calcCountdown();
    const timer = setInterval(calcCountdown, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // 倒计时到0时（即刚过整分钟第1秒），立即拉取最新数据
    if (countdown === 0) {
      refetch();
    }
  }, [countdown, refetch]);

  // 运行时长：从2026-03-23 00:00:00起按小时计算
  const startTime = new Date('2026-03-23T00:00:00+08:00').getTime();
  const [runHours, setRunHours] = useState(0);

  useEffect(() => {
    function calcRunHours() {
      const now = Date.now();
      const hours = Math.floor((now - startTime) / (1000 * 60 * 60));
      setRunHours(hours > 0 ? hours : 0);
    }
    calcRunHours();
    const timer = setInterval(calcRunHours, 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  function formatNum(n: number): string {
    return n.toLocaleString("zh-CN");
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #1A56DB 0%, #3B82F6 100%)' }}>

      {/* 主数据卡片 - 直接置顶 */}
      <div className="px-4 pt-4">
        <div className="rounded-2xl px-5 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}>
          <div className="flex items-center justify-between gap-3">
            {/* 左侧：标签+时间 + 大数字 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-xs text-white/60">当前在线</span>
                <span className="text-[11px] text-white/40">{latest ? latest.online_time : ''}</span>
              </div>
              <div className="text-3xl font-bold text-white font-mono tracking-wide leading-tight">
                {latest ? formatNum(latest.online_num) : '加载中...'}
              </div>
            </div>

            {/* 右侧：倒计时 + 历史 两个小方形按钮 */}
            <div className="flex items-center gap-2 shrink-0">
              {/* 倒计时 */}
              <div
                className="rounded-xl flex items-center justify-center"
                style={{ backgroundColor: 'rgba(255,255,255,0.12)', width: '40px', height: '40px' }}
              >
                <span className="text-base font-bold font-mono text-white">{countdown}</span>
              </div>
              {/* 历史记录 */}
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
            <div className="text-sm font-bold text-white">200万元整</div>
            <div className="text-[11px] text-white/55 mt-2 mb-0.5">保证金</div>
            <div className="text-sm font-bold text-white">20万元</div>
          </div>
          {/* 第3个：累计利息 + 待结利息 */}
          <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}>
            <div className="text-[11px] text-white/55 mb-1">累计利息</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-bold text-white">¥{(runHours * 277.78).toFixed(2)}</span>
              <span className="text-[10px] text-white/50">≈ {(runHours * 277.78 / 7).toFixed(2)} USDT</span>
            </div>
            <div className="text-[11px] text-white/55 mt-2 mb-0.5">待结利息</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-bold text-white">¥{(runHours * 277.78).toFixed(2)}</span>
              <span className="text-[10px] text-white/50">≈ {(runHours * 277.78 / 7).toFixed(2)} USDT</span>
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
