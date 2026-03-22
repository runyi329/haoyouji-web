import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, History } from "lucide-react";

export default function QQOnlinePage() {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();

  // 只取最新1条
  const { data, refetch } = trpc.getQQOnlineRecords.useQuery(
    { page: 1, pageSize: 1 },
    { refetchInterval: 60 * 1000 }
  );

  const latest = data?.list?.[0];

  // 倒计时：距离下一分钟的秒数
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

  // 倒计时到0时自动刷新
  useEffect(() => {
    if (countdown === 0) {
      refetch();
    }
  }, [countdown, refetch]);

  function formatNum(n: number): string {
    return n.toLocaleString("zh-CN");
  }

  return (
    <div className="min-h-screen" style={{ background: '#F0F4FF' }}>
      {/* 蓝色渐变顶部区域 */}
      <div className="pb-6" style={{ background: 'linear-gradient(135deg, #1A56DB 0%, #3B82F6 100%)', color: '#FFFFFF' }}>
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
          <button
            onClick={() => setLocation(`/ledger/${id}/qq/history`)}
            className="p-1 -mr-1"
          >
            <History className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* 数据展示区 */}
        <div className="px-4 pt-2">
          <div className="rounded-2xl px-5 py-4" style={{ backgroundColor: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
            <div className="flex items-center justify-between">
              {/* 左侧：人数 + 时间 */}
              <div>
                <div className="text-xs text-white/70 mb-1">当前在线人数</div>
                {latest ? (
                  <>
                    <div className="text-2xl font-bold text-white font-mono tracking-wide">
                      {formatNum(latest.online_num)}
                    </div>
                    <div className="text-xs text-white/50 mt-1">
                      {latest.online_time}
                    </div>
                  </>
                ) : (
                  <div className="text-lg text-white/60">加载中...</div>
                )}
              </div>
              {/* 右侧：倒计时 */}
              <div className="flex flex-col items-center">
                <div className="text-[10px] text-white/50 mb-0.5">下次更新</div>
                <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
                  <span className="text-xl font-bold font-mono text-white">{countdown}</span>
                </div>
                <div className="text-[10px] text-white/50 mt-0.5">秒</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2x2 容器区域 */}
      <div className="px-4 -mt-2">
        <div className="grid grid-cols-2 gap-3">
          {/* 容器1 */}
          <div className="rounded-2xl px-4 py-4 bg-white shadow-sm" style={{ minHeight: '100px' }}>
            <div className="text-xs text-gray-400 mb-1">末1位</div>
            <div className="text-2xl font-bold font-mono" style={{ color: '#1A56DB' }}>
              {latest ? latest.last1 : '-'}
            </div>
          </div>
          {/* 容器2 */}
          <div className="rounded-2xl px-4 py-4 bg-white shadow-sm" style={{ minHeight: '100px' }}>
            <div className="text-xs text-gray-400 mb-1">末2位</div>
            <div className="text-2xl font-bold font-mono" style={{ color: '#1A56DB' }}>
              {latest ? String(latest.last2).padStart(2, '0') : '--'}
            </div>
          </div>
          {/* 容器3 */}
          <div className="rounded-2xl px-4 py-4 bg-white shadow-sm" style={{ minHeight: '100px' }}>
            <div className="text-xs text-gray-400 mb-1">末3位</div>
            <div className="text-2xl font-bold font-mono" style={{ color: '#1A56DB' }}>
              {latest ? String(latest.last3).padStart(3, '0') : '---'}
            </div>
          </div>
          {/* 容器4 */}
          <div className="rounded-2xl px-4 py-4 bg-white shadow-sm" style={{ minHeight: '100px' }}>
            <div className="text-xs text-gray-400 mb-1">期号</div>
            <div className="text-sm font-bold font-mono" style={{ color: '#1A56DB' }}>
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
