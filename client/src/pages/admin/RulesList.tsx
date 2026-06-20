/**
 * RulesList - 规则库列表页（仅超管可见，路由 /admin/rules）
 *
 * 顶部为搜索框（按编号/名称/简介关键字过滤），下面一行一条规则：
 * 编号 + 名称 + 一句话简介，点击进入对应规则详情页。
 * 数据来自 client/src/lib/rulesData.tsx，新增规则只改数据文件即可。
 *
 * 设计风格：与 ProjectConsole 一致——移动端优先、白卡片 + 圆角 + 米白底，
 * 强调色金棕色 #CBA471。
 */
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ShieldCheck, Search } from "lucide-react";
import { RULES } from "@/lib/rulesData";

export default function RulesList() {
  const [, navigate] = useLocation();
  const [keyword, setKeyword] = useState("");

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return RULES;
    return RULES.filter(
      (r) =>
        r.id.toLowerCase().includes(kw) ||
        r.title.toLowerCase().includes(kw) ||
        r.summary.toLowerCase().includes(kw),
    );
  }, [keyword]);

  return (
    <div className="min-h-screen bg-[#FAFAFA] pb-12">
      {/* 顶部栏 */}
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="flex items-center gap-3 px-4 h-14">
          <button
            onClick={() => navigate("/admin/projects")}
            className="p-1.5 -ml-1.5 rounded-full active:scale-95 transition-transform"
            aria-label="返回"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-base font-semibold text-gray-900">规则库</h1>
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-[#CBA471] bg-[#FAF3ED] px-2 py-1 rounded-full">
            <ShieldCheck className="w-3.5 h-3.5" />
            超管
          </span>
        </div>
      </header>

      <main className="px-4 pt-4 space-y-4 max-w-xl mx-auto">
        {/* 搜索框 */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索规则编号、名称或关键字"
            className="w-full h-12 pl-11 pr-4 rounded-2xl bg-white border border-gray-100 shadow-sm text-[15px] text-gray-900 placeholder:text-gray-400 outline-none focus:border-[#CBA471] transition-colors"
          />
        </div>

        {/* 规则列表 */}
        {filtered.length > 0 ? (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden divide-y divide-gray-100">
            {filtered.map((rule) => (
              <button
                key={rule.id}
                onClick={() => navigate(`/admin/rules/${rule.id}`)}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left active:bg-gray-50 transition-colors"
              >
                <span className="inline-flex items-center justify-center font-mono text-[13px] font-bold text-white bg-[#CBA471] w-10 h-7 rounded-lg shrink-0">
                  {rule.id}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[16px] font-bold text-gray-900 leading-tight">
                    {rule.title}
                  </span>
                  <span className="block text-[12.5px] leading-snug text-gray-500 mt-0.5 line-clamp-2">
                    {rule.summary}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
            <p className="text-sm text-gray-500">
              没有匹配 “{keyword}” 的规则
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
