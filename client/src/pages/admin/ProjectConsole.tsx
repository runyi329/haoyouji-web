/**
 * ProjectConsole - 项目总控台（伪独立项目管理后台）
 *
 * 入口伪装：个人中心「隐私设置」按钮。普通用户点击只会看到「功能开发中」，
 * 仅超级管理员点击才会进入本页。
 *
 * 安全：本页前端先做 super_admin 校验，非超管一律展示 404 式「页面不存在」，
 * 不暴露页面真实用途。后端接口在后续阶段会再次强校验。
 *
 * 当前为第一阶段空壳：仅搭建页面框架与导航，业务功能（项目增删改查、随机 slug、
 * 合作方指派、归属配置、操作日志）将在后续阶段逐步填充。
 *
 * 风格：脉动红金白，移动端优先，使用 lucide-react 图标，严禁 Emoji。
 */
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Loader2, LayoutGrid, Plus, Users, ScrollText, ShieldCheck, ExternalLink, ChevronRight } from "lucide-react";

// 第一阶段：项目数据先以静态形式展示，下一步接入后端 site_versions 后改为真实读取
type ProjectItem = {
  key: string;
  name: string;
  landingPath: string;
  status: "active" | "disabled";
  accent: string; // 主色
  accentBg: string;
};

const PROJECTS: ProjectItem[] = [
  {
    key: "yaban",
    name: "牙伴版",
    landingPath: "/yaban/intro",
    status: "active",
    accent: "text-[#0EA5A4]",
    accentBg: "bg-[#E6F7F7]",
  },
];

export default function ProjectConsole() {
  const [, navigate] = useLocation();
  const { data: user, isLoading } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
        <Loader2 className="w-6 h-6 animate-spin text-[#D32F2F]" />
      </div>
    );
  }

  // 非超管：404 式拦截，不暴露页面用途
  if (!user || (user as any).role !== "super_admin") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#FAFAFA] px-6 text-center">
        <div className="text-6xl font-bold text-gray-300 mb-3">404</div>
        <div className="text-gray-500 mb-6">页面不存在</div>
        <button
          onClick={() => navigate("/")}
          className="px-5 py-2 rounded-full bg-[#D32F2F] text-white text-sm font-medium active:scale-[0.97] transition-transform"
        >
          返回首页
        </button>
      </div>
    );
  }

  const stats = [
    { label: "项目总数", value: String(PROJECTS.length), icon: LayoutGrid, color: "text-[#D32F2F]", bg: "bg-[#FDECEC]" },
    { label: "合作方", value: "—", icon: Users, color: "text-[#CBA471]", bg: "bg-[#FAF3ED]" },
    { label: "操作日志", value: "—", icon: ScrollText, color: "text-slate-600", bg: "bg-slate-100" },
  ];

  return (
    <div className="min-h-screen bg-[#FAFAFA] pb-10">
      {/* 顶部栏 */}
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="flex items-center gap-3 px-4 h-14">
          <button
            onClick={() => navigate("/parent/profile")}
            className="p-1.5 -ml-1.5 rounded-full active:scale-95 transition-transform"
            aria-label="返回"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-base font-semibold text-gray-900">项目总控台</h1>
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-[#CBA471] bg-[#FAF3ED] px-2 py-1 rounded-full">
            <ShieldCheck className="w-3.5 h-3.5" />
            超管
          </span>
        </div>
      </header>

      <main className="px-4 pt-4 space-y-4">
        {/* 概览统计 */}
        <section className="grid grid-cols-3 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="bg-white rounded-2xl p-3 shadow-sm flex flex-col items-center">
              <div className={`w-9 h-9 rounded-xl ${s.bg} flex items-center justify-center mb-2`}>
                <s.icon className={`w-4.5 h-4.5 ${s.color}`} />
              </div>
              <div className="text-lg font-bold text-gray-900 leading-none">{s.value}</div>
              <div className="text-[11px] text-gray-500 mt-1">{s.label}</div>
            </div>
          ))}
        </section>

        {/* 项目列表占位 */}
        <section className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">项目列表</h2>
            <button
              onClick={() => {}}
              className="inline-flex items-center gap-1 text-xs font-medium text-white bg-[#D32F2F] px-3 py-1.5 rounded-full active:scale-[0.97] transition-transform"
            >
              <Plus className="w-3.5 h-3.5" />
              新建项目
            </button>
          </div>
          <ul className="space-y-2.5">
            {PROJECTS.map((p) => (
              <li key={p.key}>
                <button
                  onClick={() => navigate(p.landingPath)}
                  className="w-full text-left flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-white active:scale-[0.99] transition-transform"
                >
                  <div className={`w-10 h-10 rounded-xl ${p.accentBg} flex items-center justify-center shrink-0`}>
                    <LayoutGrid className={`w-5 h-5 ${p.accent}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900 truncate">{p.name}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          p.status === "active"
                            ? "bg-green-50 text-green-600"
                            : "bg-gray-100 text-gray-400"
                        }`}
                      >
                        {p.status === "active" ? "运行中" : "已停用"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5 truncate">
                      <ExternalLink className="w-3 h-3 shrink-0" />
                      <span className="truncate">{p.landingPath}</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
