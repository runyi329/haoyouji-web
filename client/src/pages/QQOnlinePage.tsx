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
          <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}>
            <div className="text-[11px] text-white/55 mb-1">末1位</div>
            <div className="text-2xl font-bold font-mono text-white">
              {latest ? latest.last1 : '-'}
            </div>
          </div>
          <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}>
            <div className="text-[11px] text-white/55 mb-1">末2位</div>
            <div className="text-2xl font-bold font-mono text-white">
              {latest ? String(latest.last2).padStart(2, '0') : '--'}
            </div>
          </div>
          <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}>
            <div className="text-[11px] text-white/55 mb-1">末3位</div>
            <div className="text-2xl font-bold font-mono text-white">
              {latest ? String(latest.last3).padStart(3, '0') : '---'}
            </div>
          </div>
          <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}>
            <div className="text-[11px] text-white/55 mb-1">期号</div>
            <div className="text-sm font-bold font-mono text-white">
              {latest ? latest.issue_no : '-'}
            </div>
          </div>
        </div>
      </div>

      <div className="h-20" />
    </div>
  );
}
