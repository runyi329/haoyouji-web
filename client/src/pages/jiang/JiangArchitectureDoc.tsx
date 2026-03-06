/**
 * 润仪算力研发中心 - 完整架构文档页
 * 路由：/jiang/architecture-doc
 *
 * 从服务端动态读取 maidong-merchant-architecture.md 完整内容
 * 文档更新后自动同步，无需重新部署前端
 */
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, RefreshCw, FileText, Calendar } from "lucide-react";
import BottomNav from "@/components/BottomNav";

export default function JiangArchitectureDoc() {
  const [, setLocation] = useLocation();

  const { data, isLoading, error, refetch } = trpc.getMerchantArchitectureDoc.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // 5分钟缓存
  });

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      {/* 顶部 Header */}
      <div className="bg-[#0d0d14] border-b border-[#D32F2F]/20 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLocation("/jiang/build-rules")}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-[#1a1a2e] text-[#888899] hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#D32F2F]" />
              <div>
                <div className="text-sm font-bold text-white leading-tight">完整架构文档</div>
                <div className="text-[10px] text-[#D32F2F] leading-tight">脉动共享商盟 · 建站规则原文</div>
              </div>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[#1a1a2e] text-[#888899] hover:text-[#D32F2F] transition-colors"
            title="刷新文档"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto pb-24">
        {/* 文档元信息 */}
        {data && (
          <div className="px-4 pt-4 pb-2 flex items-center gap-2 text-[#444466] text-[11px]">
            <Calendar className="w-3 h-3" />
            <span>加载时间：{new Date(data.updatedAt).toLocaleString('zh-CN')}</span>
            <span className="ml-auto bg-[#D32F2F]/20 text-[#D32F2F] px-2 py-0.5 rounded-full">实时同步</span>
          </div>
        )}

        {/* 加载状态 */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-10 h-10 border-2 border-[#D32F2F]/30 border-t-[#D32F2F] rounded-full animate-spin" />
            <p className="text-[#666680] text-sm">正在加载完整文档...</p>
          </div>
        )}

        {/* 错误状态 */}
        {error && (
          <div className="mx-4 mt-4 bg-[#D32F2F]/10 border border-[#D32F2F]/30 rounded-2xl p-5 text-center">
            <p className="text-[#D32F2F] text-sm mb-2">文档加载失败</p>
            <p className="text-[#666680] text-xs mb-4">{error.message}</p>
            <button
              onClick={() => refetch()}
              className="bg-[#D32F2F] text-white text-sm px-4 py-2 rounded-xl"
            >
              重试
            </button>
          </div>
        )}

        {/* 文档内容（Markdown 原文，等宽字体展示） */}
        {data && !isLoading && (
          <div className="px-4 pt-2">
            <pre
              className="text-[12px] text-[#ccccdd] leading-relaxed whitespace-pre-wrap break-words font-mono bg-[#0d0d1a] border border-[#1e1e35] rounded-2xl p-4 overflow-x-auto"
              style={{ fontFamily: "'Courier New', 'Consolas', monospace" }}
            >
              {data.content}
            </pre>
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
