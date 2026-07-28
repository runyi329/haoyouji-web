import { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { ChevronLeft, ToggleLeft, ToggleRight, Clock, Gift } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

const LEDGER_ID = 52;

export default function Af525SwitchPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const ledgerId = parseInt(id || String(LEDGER_ID));

  const utils = trpc.useUtils();

  // 查询开关状态
  const { data: switchData, isLoading } = trpc.ledger.af525GetSwitch.useQuery(
    { ledgerId },
    { refetchOnWindowFocus: false }
  );

  // 查询历史记录
  const { data: logsData, isLoading: logsLoading } = trpc.ledger.af525GetLogs.useQuery(
    { ledgerId, page: 1 },
    { refetchOnWindowFocus: false }
  );

  // 设置开关
  const setSwitchMutation = trpc.ledger.af525SetSwitch.useMutation({
    onSuccess: () => {
      utils.ledger.af525GetSwitch.invalidate({ ledgerId });
      utils.ledger.af525GetLogs.invalidate({ ledgerId });
      toast.success(switchData?.enabled ? '已关闭 5.25 定向开关' : '已开启 5.25 定向开关');
    },
    onError: (e) => toast.error(e.message || '操作失败'),
  });

  const handleToggle = () => {
    if (setSwitchMutation.isPending) return;
    setSwitchMutation.mutate({ ledgerId, enabled: !switchData?.enabled });
  };

  const formatTime = (s: string) => {
    if (!s) return '';
    const d = new Date(s);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const enabled = switchData?.enabled ?? false;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 顶部导航 */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="flex items-center h-14 px-4">
          <button onClick={() => setLocation(`/ledger/${ledgerId}/settings`)} className="p-2 -ml-2">
            <ChevronLeft className="w-6 h-6 text-gray-700" />
          </button>
          <h1 className="text-base font-semibold text-gray-900 ml-2">5.25 定向开关</h1>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* 说明卡片 */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm text-amber-800 leading-relaxed">
            <span className="font-semibold">功能说明：</span>开启后，52号账本谷底增筹每笔新订单成交时，将额外生成一张 <span className="font-semibold">0.25 倍</span>赠单给 <span className="font-semibold">大饼江湖（YJH）</span>。
          </p>
          <p className="text-xs text-amber-600 mt-2">
            赠单金额 = 用户投入 × 0.25（与正单 5.25 倍计算方式一致）。关闭后恢复原逻辑，已产生的赠单不受影响。
          </p>
        </div>

        {/* 开关卡片 */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-5">
            <div className="flex items-center gap-3">
              {enabled
                ? <ToggleRight className="w-7 h-7 text-green-500" />
                : <ToggleLeft className="w-7 h-7 text-gray-400" />
              }
              <div>
                <div className="text-sm font-semibold text-gray-900">
                  当前状态：<span className={enabled ? 'text-green-600' : 'text-gray-500'}>{isLoading ? '加载中...' : enabled ? '已开启' : '已关闭'}</span>
                </div>
                {switchData?.updatedAt && (
                  <div className="text-xs text-gray-400 mt-0.5">
                    最后操作：{formatTime(switchData.updatedAt)}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={handleToggle}
              disabled={isLoading || setSwitchMutation.isPending}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
                enabled
                  ? 'bg-red-50 text-red-600 border border-red-200 active:bg-red-100'
                  : 'bg-green-50 text-green-700 border border-green-200 active:bg-green-100'
              }`}
            >
              {setSwitchMutation.isPending ? '处理中...' : enabled ? '关闭' : '开启'}
            </button>
          </div>
        </div>

        {/* 赠单记录 */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-50">
            <Gift className="w-4 h-4 text-purple-500" />
            <span className="text-sm font-semibold text-gray-800">触发的赠单记录</span>
            <span className="ml-auto text-xs text-gray-400">最近 50 条</span>
          </div>
          {logsLoading ? (
            <div className="py-8 text-center text-sm text-gray-400">加载中...</div>
          ) : (logsData?.giftRecords ?? []).length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">暂无赠单记录</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {(logsData?.giftRecords ?? []).map((r: any) => (
                <div key={r.id} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-700">{r.sourceName}</span>
                      <span className="text-xs text-gray-400">→ YJH</span>
                    </div>
                    <span className="text-xs font-semibold text-purple-600">
                      {r.giftAmount.toFixed(2)} U
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-gray-400">
                      正单 #{r.sourceOrderId} · 赠单 #{r.giftOrderId} · {r.coin}
                    </span>
                    <span className="text-xs text-gray-400">{formatTime(r.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 操作日志 */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-50">
            <Clock className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-semibold text-gray-800">开关操作日志</span>
          </div>
          {logsLoading ? (
            <div className="py-8 text-center text-sm text-gray-400">加载中...</div>
          ) : (logsData?.switchLogs ?? []).length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">暂无操作记录</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {(logsData?.switchLogs ?? []).map((l: any) => (
                <div key={l.id} className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      l.action === 'enable'
                        ? 'bg-green-50 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {l.action === 'enable' ? '开启' : '关闭'}
                    </span>
                    <span className="text-xs text-gray-600">{l.operatorName}</span>
                  </div>
                  <span className="text-xs text-gray-400">{formatTime(l.operatedAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
