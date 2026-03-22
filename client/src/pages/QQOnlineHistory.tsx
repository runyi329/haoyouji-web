import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { ChevronLeft } from "lucide-react";

interface QQRecord {
  id: number;
  issue_no: number;
  online_time: string;
  online_num: number;
  online_change: number;
  last1: number;
  last2: number;
  last3: number;
  created_at: string;
}

export default function QQOnlineHistory() {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const { data, isLoading } = trpc.getQQOnlineRecords.useQuery(
    { page, pageSize },
    { refetchInterval: 60 * 1000 }
  );

  const list: QQRecord[] = data?.list || [];
  const total: number = data?.total || 0;
  const totalPages = Math.ceil(total / pageSize);

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
              setLocation(id ? `/ledger/${id}/qq` : '/');
            }
          }}
          className="flex items-center gap-1 text-gray-400 active:text-white"
        >
          <ChevronLeft size={20} />
          <span className="text-sm">返回</span>
        </button>
        <h1 className="text-base font-bold text-white">历史记录</h1>
        <div className="w-10" />
      </div>

      {/* 说明栏 */}
      <div className="px-4 py-2 bg-gray-900 border-b border-gray-800 text-xs text-gray-500">
        共 {total} 条记录
      </div>

      {/* 表头 */}
      <div className="grid grid-cols-12 gap-0 px-3 py-2 text-xs text-gray-500 border-b border-gray-800 bg-gray-900 sticky top-0 z-10">
        <div className="col-span-1 text-center">序号</div>
        <div className="col-span-6 text-center">统计时间</div>
        <div className="col-span-5 text-right">在线人数</div>
      </div>

      {/* 列表 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-gray-500 text-sm">
          加载中...
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500 text-sm gap-2">
          <span>暂无数据</span>
        </div>
      ) : (
        <div className="divide-y divide-gray-800">
          {list.map((item, idx) => {
            const globalIdx = (page - 1) * pageSize + idx + 1;
            return (
              <div
                key={item.id}
                className="grid grid-cols-12 gap-0 px-3 py-2.5 text-sm items-center"
              >
                <div className="col-span-1 text-center text-xs text-gray-600">
                  {globalIdx}
                </div>
                <div className="col-span-6 text-center text-xs text-gray-300">
                  {item.online_time}
                </div>
                <div className="col-span-5 text-right font-mono text-white text-xs">
                  {formatNum(item.online_num)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 py-4 border-t border-gray-800">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1 text-sm bg-gray-800 rounded disabled:opacity-40 active:bg-gray-700"
          >
            上一页
          </button>
          <span className="text-sm text-gray-400">{page} / {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1 text-sm bg-gray-800 rounded disabled:opacity-40 active:bg-gray-700"
          >
            下一页
          </button>
        </div>
      )}

      {/* 底部安全区 */}
      <div className="h-8" />
    </div>
  );
}
