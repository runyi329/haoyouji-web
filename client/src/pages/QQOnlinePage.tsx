import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, History } from "lucide-react";

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
      const secs = 60 - now.getSeconds();
      setCountdown(secs >= 60 ? 0 : secs);
    }
    calcCountdown();
    const timer = setInterval(calcCountdown, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (countdown === 0) {
      refetch();
    }
  }, [countdown, refetch]);

  function formatNum(n: number): string {
    return n.toLocaleString("zh-CN");
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #1A56DB 0%, #3B82F6 100%)' }}>
      {/* 导航栏 */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <button
          onClick={() => {
            if (window.history.length > 1) {
              window.history.back();
            } else {
              setLocation(id ? `/ledger/${id}` : '/');
            }
          }}
          className="p-1 -ml-1"
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <span className="text-base font-semibold text-white">QQ 在线人数</span>
        <div className="w-5" />
      </div>

      {/* 主数据区 */}
      <div className="px-4 pt-2">
        <div className="rounded-2xl px-5 py-4" style={{ backgroundColor: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}>
          {/* 第一行：人数 + 倒计时 + 历史按钮 */}
          <div className="flex items-center justify-between">
            {/* 左侧：人数 + 时间 */}
            <div className="flex-1">
              <div className="text-xs text-white/60 mb-1">当前在线</div>
              {latest ? (
                <>
                  <div className="text-3xl font-bold text-white font-mono tracking-wide leading-tight">
                    {formatNum(latest.online_num)}
                  </div>
                  <div className="text-[11px] text-white/45 mt-1.5">
                    {latest.online_time}
                  </div>
                </>
              ) : (
                <div className="text-xl text-white/50">加载中...</div>
              )}
            </div>
            {/* 右侧：倒计时 + 历史按钮 */}
            <div className="flex items-center gap-3">
              {/* 倒计时圆 */}
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
              >
                <span className="text-lg font-bold font-mono text-white">{countdown}</span>
              </div>
              {/* 历史按钮 */}
              <button
                onClick={() => setLocation(`/ledger/${id}/qq/history`)}
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
              >
                <History className="w-4.5 h-4.5 text-white/80" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2x2 数据卡片 */}
      <div className="px-4 pt-3">
        <div className="grid grid-cols-2 gap-3">
          {/* 末1位 */}
          <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}>
            <div className="text-[11px] text-white/55 mb-1">末1位</div>
            <div className="text-2xl font-bold font-mono text-white">
              {latest ? latest.last1 : '-'}
            </div>
          </div>
          {/* 末2位 */}
          <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}>
            <div className="text-[11px] text-white/55 mb-1">末2位</div>
            <div className="text-2xl font-bold font-mono text-white">
              {latest ? String(latest.last2).padStart(2, '0') : '--'}
            </div>
          </div>
          {/* 末3位 */}
          <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}>
            <div className="text-[11px] text-white/55 mb-1">末3位</div>
            <div className="text-2xl font-bold font-mono text-white">
              {latest ? String(latest.last3).padStart(3, '0') : '---'}
            </div>
          </div>
          {/* 期号 */}
          <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}>
            <div className="text-[11px] text-white/55 mb-1">期号</div>
            <div className="text-sm font-bold font-mono text-white">
              {latest ? latest.issue_no : '-'}
            </div>
          </div>
        </div>
      </div>

      {/* 底部留白 */}
      <div className="h-20" />
    </div>
  );
}
