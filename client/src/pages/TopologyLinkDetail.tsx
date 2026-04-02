import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { ArrowLeft } from 'lucide-react';

export default function TopologyLinkDetail() {
  const [location, setLocation] = useLocation();

  // 从URL参数中获取userId和userName
  const params = new URLSearchParams(window.location.search);
  const userId = parseInt(params.get('userId') || '0');
  const userName = params.get('name') || '未知';

  const { data, isLoading, error } = trpc.topology.getIntroducerLinks.useQuery(
    { userId },
    { enabled: userId > 0 }
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="bg-[#D32F2F] text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => setLocation('/parent/topology')} className="p-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <div className="font-semibold text-base">链接详情</div>
          <div className="text-xs text-red-200">{userName} · 作为介绍人促成的连接</div>
        </div>
      </div>

      <div className="p-4">
        {/* 说明卡片 */}
        <div className="bg-white rounded-xl p-3 mb-4 border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 leading-relaxed">
            以下记录表示：<span className="text-[#D32F2F] font-semibold">{userName}</span> 作为介绍人，
            通过其聚合码/介绍码，促成了"共享方"与"接收方"之间建立共享连接的记录。
          </p>
        </div>

        {/* 统计 */}
        {data && (
          <div className="bg-[#D32F2F] text-white rounded-xl p-3 mb-4 flex items-center justify-between">
            <span className="text-sm">共促成连接</span>
            <span className="text-2xl font-bold">{data.length} 对</span>
          </div>
        )}

        {/* 加载中 */}
        {isLoading && (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
            加载中...
          </div>
        )}

        {/* 错误 */}
        {error && (
          <div className="text-center py-16 text-red-500 text-sm">
            加载失败，请重试
          </div>
        )}

        {/* 无数据 */}
        {data && data.length === 0 && (
          <div className="text-center py-16 text-gray-400 text-sm">
            暂无链接记录
          </div>
        )}

        {/* 连接列表 */}
        {data && data.length > 0 && (
          <div className="bg-white rounded-xl overflow-hidden border border-gray-100 shadow-sm">
            {/* 表头 */}
            <div className="grid grid-cols-12 gap-1 px-3 py-2 bg-gray-50 border-b border-gray-100">
              <div className="col-span-1 text-[10px] text-gray-400 font-semibold">#</div>
              <div className="col-span-4 text-[10px] text-gray-400 font-semibold">共享方</div>
              <div className="col-span-1 text-[10px] text-gray-400 text-center">→</div>
              <div className="col-span-4 text-[10px] text-gray-400 font-semibold">接收方</div>
              <div className="col-span-2 text-[10px] text-gray-400 font-semibold text-right">日期</div>
            </div>

            {/* 数据行 */}
            {data.map((item, index) => (
              <div
                key={item.id}
                className={`grid grid-cols-12 gap-1 px-3 py-2.5 border-b border-gray-50 ${
                  index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                }`}
              >
                <div className="col-span-1 text-[11px] text-gray-400">{index + 1}</div>
                <div className="col-span-4">
                  <div className="text-[11px] font-medium text-gray-800 truncate">{item.sharerName}</div>
                </div>
                <div className="col-span-1 text-[11px] text-[#CBA471] text-center font-bold">→</div>
                <div className="col-span-4">
                  <div className="text-[11px] font-medium text-gray-800 truncate">{item.receiverName}</div>
                </div>
                <div className="col-span-2 text-[10px] text-gray-400 text-right">{item.createdAt}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
