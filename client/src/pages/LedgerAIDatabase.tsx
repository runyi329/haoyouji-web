/**
 * LedgerAIDatabase.tsx
 * 定制账本(AA) - AI数据库页面
 * 路径: /ledger/:id/ai-database
 */
import { useParams, useLocation } from "wouter";
import { ChevronLeft, Database, Sparkles, Bot, BarChart2, FileText, Search } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function LedgerAIDatabase() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 0;

  const { data: ledgerData } = trpc.ledger.getById.useQuery(
    { ledgerId },
    { enabled: !!ledgerId }
  );

  const ledgerName = ledgerData?.name || "账本";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部导航 */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button
          onClick={() => setLocation(`/ledger/${ledgerId}`)}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <Database className="w-5 h-5 text-blue-600" />
          <span className="font-semibold text-gray-900 text-base">AI数据库</span>
        </div>
        <span className="text-xs text-gray-400 truncate max-w-[120px]">{ledgerName}</span>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 px-4 py-5 space-y-4">

        {/* 功能入口占位符 */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => {}}
            className="bg-white rounded-2xl p-4 flex flex-col items-start gap-2 shadow-sm border border-gray-100 active:bg-gray-50 transition-colors"
          >
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
              <Bot className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">AI 分析</p>
              <p className="text-xs text-gray-400 mt-0.5">即将上线</p>
            </div>
          </button>

          <button
            onClick={() => {}}
            className="bg-white rounded-2xl p-4 flex flex-col items-start gap-2 shadow-sm border border-gray-100 active:bg-gray-50 transition-colors"
          >
            <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center">
              <BarChart2 className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">数据报表</p>
              <p className="text-xs text-gray-400 mt-0.5">即将上线</p>
            </div>
          </button>

          <button
            onClick={() => {}}
            className="bg-white rounded-2xl p-4 flex flex-col items-start gap-2 shadow-sm border border-gray-100 active:bg-gray-50 transition-colors"
          >
            <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center">
              <Search className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">智能检索</p>
              <p className="text-xs text-gray-400 mt-0.5">即将上线</p>
            </div>
          </button>

          <button
            onClick={() => {}}
            className="bg-white rounded-2xl p-4 flex flex-col items-start gap-2 shadow-sm border border-gray-100 active:bg-gray-50 transition-colors"
          >
            <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center">
              <FileText className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">文档归档</p>
              <p className="text-xs text-gray-400 mt-0.5">即将上线</p>
            </div>
          </button>
        </div>

        {/* 说明区块 */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-4 border border-blue-100">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-semibold text-blue-800">AI数据库</span>
          </div>
          <p className="text-xs text-blue-700 leading-relaxed">
            AI数据库将整合账本数据，提供智能分析、趋势预测、数据检索等功能，帮助您更高效地管理和洞察账本数据。更多功能持续开发中，敬请期待。
          </p>
        </div>

      </div>
    </div>
  );
}
