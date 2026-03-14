import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { ChevronLeft, RefreshCw, CheckCircle, XCircle, Clock, Database, Info, ChevronDown, ChevronUp } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export default function AgDataSources() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 1;

  const [activeSource, setActiveSource] = useState<number | null>(null);
  const [showRule, setShowRule] = useState<Record<number, boolean>>({});

  // 获取数据源列表
  const { data: sourcesData, refetch: refetchSources } = trpc.ledger.getAgSyncSources.useQuery(
    { ledgerId },
    { retry: false }
  );

  // 获取当前选中数据源的日志
  const { data: logsData, refetch: refetchLogs } = trpc.ledger.getAgSyncLogs.useQuery(
    { sourceId: activeSource ?? 0, limit: 20 },
    { enabled: !!activeSource, retry: false }
  );

  // 触发同步
  const syncMutation = trpc.ledger.syncAgFromSource.useMutation({
    onSuccess: (result) => {
      toast.success(
        `同步完成！新增 ${result.newCount} 条，跳过 ${result.skipCount} 条重复，耗时 ${(result.durationMs / 1000).toFixed(1)}s`
      );
      refetchSources();
      refetchLogs();
    },
    onError: (err) => {
      toast.error(`同步失败：${err.message}`);
      refetchLogs();
    },
  });

  const sources = sourcesData?.sources || [];
  const logs = logsData?.logs || [];

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return "从未";
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 顶部导航 */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="flex items-center h-14 px-4">
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}
            className="p-2 -ml-2"
          >
            <ChevronLeft className="w-6 h-6 text-gray-700" />
          </button>
          <h1 className="text-lg font-medium text-gray-900 ml-2">数据源管理</h1>
        </div>
      </div>

      {/* 说明卡片 */}
      <div className="mx-4 mt-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-blue-700 leading-relaxed">
            数据源管理允许您从外部平台增量同步图片提示词。每次同步只拉取新增内容，不会产生重复数据。
          </p>
        </div>
      </div>

      {/* 数据源列表 */}
      <div className="mx-4 mt-4 space-y-3">
        {sources.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center text-gray-400">
            <Database className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>暂无数据源</p>
          </div>
        ) : (
          sources.map((source: any) => (
            <div key={source.id} className="bg-white rounded-xl overflow-hidden shadow-sm">
              {/* 数据源头部 */}
              <div
                className="p-4 cursor-pointer"
                onClick={() => setActiveSource(activeSource === source.id ? null : source.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center">
                      <Database className="w-5 h-5 text-orange-500" />
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 text-sm">{source.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        共 {source.totalSynced ?? 0} 条已同步
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        source.status === "active" ? "bg-green-400" : "bg-gray-300"
                      }`}
                    />
                    {activeSource === source.id ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                </div>

                {/* 上次同步时间 */}
                <div className="flex items-center gap-1.5 mt-3">
                  <Clock className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-xs text-gray-400">
                    上次同步：{formatTime(source.lastSyncedAt)}
                  </span>
                </div>
              </div>

              {/* 展开详情 */}
              {activeSource === source.id && (
                <div className="border-t border-gray-100">
                  {/* 同步规则说明 */}
                  <div className="px-4 pt-3 pb-2">
                    <button
                      className="flex items-center gap-1.5 text-xs text-gray-500 font-medium"
                      onClick={() => setShowRule((prev) => ({ ...prev, [source.id]: !prev[source.id] }))}
                    >
                      <Info className="w-3.5 h-3.5" />
                      同步规则说明
                      {showRule[source.id] ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                    {showRule[source.id] && (
                      <div className="mt-2 p-3 bg-gray-50 rounded-lg text-xs text-gray-600 leading-relaxed">
                        {source.syncRule}
                        <div className="mt-2 pt-2 border-t border-gray-200 text-gray-400">
                          <div>API 地址：{source.apiUrl}</div>
                          <div>模型：{source.modelName}</div>
                          <div>增量同步：通过 imageKey 前缀去重，遇到已存在记录即停止</div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 同步按钮 */}
                  <div className="px-4 pb-4">
                    <Button
                      className="w-full"
                      style={{ backgroundColor: "#D32F2F", color: "white" }}
                      disabled={syncMutation.isPending}
                      onClick={() => syncMutation.mutate({ sourceId: source.id })}
                    >
                      {syncMutation.isPending ? (
                        <div className="flex items-center gap-2">
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          同步中，请稍候...
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <RefreshCw className="w-4 h-4" />
                          立即增量同步
                        </div>
                      )}
                    </Button>
                    {syncMutation.isPending && (
                      <p className="text-xs text-gray-400 text-center mt-2">
                        正在拉取新内容并上传至云存储，请勿关闭页面...
                      </p>
                    )}
                  </div>

                  {/* 同步日志 */}
                  <div className="border-t border-gray-100 px-4 py-3">
                    <div className="text-xs font-medium text-gray-500 mb-3">同步日志（最近20条）</div>
                    {logs.length === 0 ? (
                      <div className="text-xs text-gray-400 text-center py-4">暂无同步记录</div>
                    ) : (
                      <div className="space-y-2">
                        {logs.map((log: any) => (
                          <div
                            key={log.id}
                            className="flex items-start gap-2.5 p-2.5 rounded-lg bg-gray-50"
                          >
                            {log.status === "success" ? (
                              <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span
                                  className={`text-xs font-medium ${
                                    log.status === "success" ? "text-green-700" : "text-red-700"
                                  }`}
                                >
                                  {log.status === "success"
                                    ? `新增 ${log.new_count} 条，跳过 ${log.skip_count} 条`
                                    : `失败：${log.error_msg || "未知错误"}`}
                                </span>
                                <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                                  {formatDuration(log.duration_ms)}
                                </span>
                              </div>
                              <div className="text-xs text-gray-400 mt-0.5">
                                {formatTime(log.created_at)}
                                {log.triggered_by_name && ` · ${log.triggered_by_name}`}
                                {log.status === "success" && log.max_id_after > log.max_id_before && (
                                  <span className="ml-1">
                                    · ID {log.max_id_before} → {log.max_id_after}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* 底部提示 */}
      <div className="mx-4 mt-6 p-4 bg-amber-50 rounded-xl border border-amber-100">
        <p className="text-xs text-amber-700 leading-relaxed">
          <span className="font-medium">扩展说明：</span>
          后续可在此添加更多数据源（如其他开源提示词平台），每个数据源独立管理，互不影响。
        </p>
      </div>
    </div>
  );
}
