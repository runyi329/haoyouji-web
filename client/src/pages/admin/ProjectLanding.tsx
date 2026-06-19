/**
 * ProjectLanding - 项目占位首页（小龙虾 / 大龙虾等未配置项目）
 *
 * 路由：/p/:slug
 * 由「项目总控台」中各项目卡片点击进入。本页为占位首页，
 * 显示项目名称（依据 localStorage 中总控台的项目数据匹配 slug），
 * 并提供「返回总控台」按钮回到 /admin/projects。
 *
 * 风格：脉动红金白，移动端优先，lucide-react 图标，严禁 Emoji。
 */
import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useSmartBack } from "@/hooks/useSmartBack";
import { ArrowLeft, Sparkles, ExternalLink } from "lucide-react";

// 临时实时预览（热修改）监听地址 —— 仅用于开发态客户实时预览
const LIVE_PREVIEW_URL =
  "https://3000-idq74i86gfo1tcyghhsn5-fb479a13.sg1.manus.computer";

type StoredProject = {
  key: string;
  name: string;
  landingPath: string;
  status: string;
};

const STORAGE_KEY = "project_console_items_v3";

export default function ProjectLanding() {
  const [, navigate] = useLocation();
  const goBack = useSmartBack("/admin/projects");
  const [, params] = useRoute("/p/:slug");
  const slug = params?.slug ?? "";

  const [projectName, setProjectName] = useState<string>("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const list = JSON.parse(raw) as StoredProject[];
        const hit = Array.isArray(list)
          ? list.find((p) => p.landingPath === `/p/${slug}`)
          : null;
        if (hit) setProjectName(hit.name);
      }
    } catch {
      // ignore
    }
  }, [slug]);

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col">
      {/* 顶部栏：返回总控台 */}
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="flex items-center gap-3 px-4 h-14">
          <button
            onClick={goBack}
            className="inline-flex items-center gap-1.5 text-sm text-gray-700 active:scale-95 transition-transform"
            aria-label="返回"
          >
            <ArrowLeft className="w-5 h-5" />
            返回
          </button>
        </div>
      </header>

      {/* 占位首页内容 */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#FDECEC] flex items-center justify-center mb-5">
          <Sparkles className="w-7 h-7 text-[#D32F2F]" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {projectName || "项目首页"}
        </h1>
        <p className="text-sm text-gray-500 mb-1">这是该项目的首页（占位）</p>
        <p className="text-xs text-gray-400 mb-8 break-all">
          访问路径：/p/{slug}
        </p>
        <button
          onClick={goBack}
          className="px-6 py-2.5 rounded-full bg-[#D32F2F] text-white text-sm font-medium active:scale-[0.97] transition-transform"
        >
          返回
        </button>

        {/* 实时预览（热修改）入口 —— 点进去即开发态监听地址，可实时看到改动 */}
        <a
          href={LIVE_PREVIEW_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#1A1A1A] text-[#F5C518] text-sm font-medium active:scale-[0.97] transition-transform"
        >
          <ExternalLink className="w-4 h-4" />
          实时预览（热修改）
        </a>
      </main>
    </div>
  );
}
