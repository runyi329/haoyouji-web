/**
 * 牙伴齿科管理 - 诊疗记录列表
 * 展示患者历次就诊的诊疗记录，支持新建、查看详情。
 * 移动端优先，蓝白风格，严禁 Emoji，图标统一用 lucide-react。
 */
import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { useYabanClinic } from "./useYabanClinic";
import { useSmartBack } from "@/hooks/useSmartBack";
import {
  ChevronLeft,
  Plus,
  Stethoscope,
  User,
  Calendar,
  FileText,
  ChevronRight,
  Loader2,
  AlertCircle,
} from "lucide-react";

const ACCENT = "#1E88D6";

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  completed: { label: "已完成", cls: "bg-green-50 text-green-600" },
  ongoing: { label: "进行中", cls: "bg-blue-50 text-blue-600" },
  cancelled: { label: "已取消", cls: "bg-gray-100 text-gray-400" },
};

export default function YabanTreatmentList() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/yaban/patient/:id/treatment");
  const customerId = params?.id ? Number(params.id) : 0;
  const { current, currentTenantId } = useYabanClinic();
  const clinicName = current?.name?.trim() || current?.shortName?.trim() || "";
  const goBack = useSmartBack(`/yaban/patient/${customerId}`);

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const listQuery = trpc.yabanTreatment.list.useQuery(
    { customerId, tenantId: currentTenantId ?? undefined, page, pageSize: PAGE_SIZE },
    { enabled: customerId > 0, refetchOnWindowFocus: false }
  );

  const records = (listQuery.data?.list as any[]) || [];
  const total = listQuery.data?.total ?? 0;
  const hasMore = page * PAGE_SIZE < total;

  function formatDate(val: any): string {
    if (!val) return "";
    const s = String(val);
    return s.slice(0, 16).replace("T", " ");
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部导航 */}
      <div className="bg-gradient-to-r from-sky-500 to-sky-400 text-white sticky top-0 z-20">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={goBack} className="p-1" aria-label="返回">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex flex-col items-center">
            <span className="text-lg font-bold leading-tight">诊疗记录</span>
            {clinicName && (
              <span className="text-[11px] font-normal text-white/80 leading-tight mt-0.5">
                所属：{clinicName}
              </span>
            )}
          </div>
          <button
            onClick={() => navigate(`/yaban/patient/${customerId}/treatment/create`)}
            className="p-1"
            aria-label="新建诊疗记录"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 max-w-lg w-full mx-auto px-4 py-4 space-y-3">
        {/* 加载中 */}
        {listQuery.isLoading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin" />
            <span className="text-sm">加载中...</span>
          </div>
        )}

        {/* 错误 */}
        {listQuery.isError && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-red-400">
            <AlertCircle className="w-8 h-8" />
            <span className="text-sm">加载失败，请重试</span>
            <button
              onClick={() => listQuery.refetch()}
              className="text-sm text-sky-500 underline"
            >
              重新加载
            </button>
          </div>
        )}

        {/* 空状态 */}
        {!listQuery.isLoading && !listQuery.isError && records.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-gray-400">
            <Stethoscope className="w-12 h-12 text-gray-200" />
            <span className="text-sm">暂无诊疗记录</span>
            <button
              onClick={() => navigate(`/yaban/patient/${customerId}/treatment/create`)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md text-white text-sm"
              style={{ background: ACCENT }}
            >
              <Plus className="w-4 h-4" />
              新建诊疗记录
            </button>
          </div>
        )}

        {/* 记录列表 */}
        {records.map((rec: any) => {
          const status = STATUS_MAP[rec.status] || STATUS_MAP.completed;
          return (
            <button
              key={rec.id}
              onClick={() => navigate(`/yaban/patient/${customerId}/treatment/${rec.id}`)}
              className="w-full bg-white rounded-md border border-gray-100 px-4 py-4 text-left active:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  {/* 单号 + 状态 */}
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[12px] text-gray-400">{rec.treatment_no}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-md ${status.cls}`}>
                      {status.label}
                    </span>
                  </div>
                  {/* 就诊时间 */}
                  <div className="flex items-center gap-1.5 text-[13px] text-gray-500 mb-1">
                    <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{formatDate(rec.visit_at)}</span>
                  </div>
                  {/* 医生 */}
                  {rec.doctor && (
                    <div className="flex items-center gap-1.5 text-[13px] text-gray-500 mb-1">
                      <User className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{rec.doctor}</span>
                      {rec.dept && <span className="text-gray-400">· {rec.dept}</span>}
                    </div>
                  )}
                  {/* 主诉摘要 */}
                  {rec.chief_complaint && (
                    <div className="flex items-start gap-1.5 text-[13px] text-gray-600 mt-1.5">
                      <FileText className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{rec.chief_complaint}</span>
                    </div>
                  )}
                  {/* 诊断摘要 */}
                  {!rec.chief_complaint && rec.diagnosis && (
                    <div className="flex items-start gap-1.5 text-[13px] text-gray-600 mt-1.5">
                      <Stethoscope className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{rec.diagnosis}</span>
                    </div>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-1" />
              </div>
            </button>
          );
        })}

        {/* 加载更多 */}
        {hasMore && (
          <button
            onClick={() => setPage((p) => p + 1)}
            className="w-full py-3 text-sm text-sky-500 bg-white rounded-md border border-gray-100"
          >
            加载更多（共 {total} 条）
          </button>
        )}
      </div>
    </div>
  );
}
