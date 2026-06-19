/**
 * RuleDetail - 规则详情页（仅超管可见，路由 /admin/rules/:id）
 *
 * 根据 URL 中的编号查 rulesData，渲染对应规则的完整内容。
 * 001 的详情即角标规则的完整说明。
 *
 * 设计风格：与 ProjectConsole 一致——移动端优先、白卡片 + 圆角 + 米白底。
 */
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, ShieldCheck, FileQuestion } from "lucide-react";
import { getRuleById } from "@/lib/rulesData";

export default function RuleDetail() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/admin/rules/:id");
  const id = params?.id ?? "";
  const rule = getRuleById(id);

  return (
    <div className="min-h-screen bg-[#FAFAFA] pb-12">
      {/* 顶部栏 */}
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="flex items-center gap-3 px-4 h-14">
          <button
            onClick={() => navigate("/admin/rules")}
            className="p-1.5 -ml-1.5 rounded-full active:scale-95 transition-transform"
            aria-label="返回"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-base font-semibold text-gray-900 truncate">
            {rule ? `${rule.id} · ${rule.title}` : "规则详情"}
          </h1>
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-[#CBA471] bg-[#FAF3ED] px-2 py-1 rounded-full shrink-0">
            <ShieldCheck className="w-3.5 h-3.5" />
            超管
          </span>
        </div>
      </header>

      <main className="px-4 pt-4 space-y-4 max-w-xl mx-auto">
        {rule ? (
          rule.content
        ) : (
          <div className="bg-white rounded-2xl p-8 shadow-sm flex flex-col items-center text-center">
            <FileQuestion className="w-10 h-10 text-gray-300 mb-3" />
            <p className="text-sm font-semibold text-gray-900">未找到规则</p>
            <p className="text-[12.5px] text-gray-500 mt-1">
              编号 “{id}” 在规则库中不存在。
            </p>
            <button
              onClick={() => navigate("/admin/rules")}
              className="mt-4 px-4 py-2 rounded-full bg-[#CBA471] text-white text-xs font-medium active:scale-95 transition-transform"
            >
              返回规则库
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
