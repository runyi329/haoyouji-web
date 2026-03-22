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
    <div className="min-h-screen bg-gray-950 text-white">
      {/* 顶部导航 */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800">
        <button
          onClick={() => {
            if (window.history.length > 1) {
              window.history.back();
            } else {
              setLocation(id ? `/ledger/${id}` : '/');
            }
          }}
          className="flex items-center gap-1 text-gray-400 active:text-white"
        >
          <ChevronLeft size={20} />
          <span className="text-sm">返回</span>
        </button>
        <h1 className="text-base font-bold text-white">QQ 在线人数</h1>
        {/* 历史记录按钮 */}
        <button
          onClick={() => setLocation(`/ledger/${id}/qq/history`)}
          className="flex items-center gap-1 text-gray-400 active:text-white"
        >
          <History size={20} />
        </button>
      </div>

      {/* 主体：最新数据 */}
      <div className="flex flex-col items-center justify-center pt-20 pb-10 px-4">
        {latest ? (
          <>
            {/* 在线人数 - 大字 */}
            <div className="text-4xl font-bold font-mono text-white tracking-wide">
              {formatNum(latest.online_num)}
            </div>
            {/* 统计时间 - 小字 */}
            <div className="mt-3 text-sm text-gray-500">
              {latest.online_time}
            </div>
          </>
        ) : (
          <div className="text-gray-500 text-sm">加载中...</div>
        )}

        {/* 倒计时 */}
        <div className="mt-8 flex flex-col items-center">
          <div className="text-xs text-gray-600 mb-1">下次更新</div>
          <div className="text-2xl font-mono text-blue-400 font-bold">
            {countdown}<span className="text-sm text-gray-500 ml-1">秒</span>
          </div>
        </div>
      </div>

      {/* 底部安全区 */}
      <div className="h-8" />
    </div>
  );
}
