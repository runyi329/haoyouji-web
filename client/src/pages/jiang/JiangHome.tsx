/**
 * 润仪算力研发中心 - 首页
 * 路由：/jiang
 */
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { LogIn } from "lucide-react";
import JiangTabBar from "./JiangTabBar";
import BottomNav from "@/components/BottomNav";
import { Cpu, Zap, Code2, Layers, ArrowRight, ChevronRight } from "lucide-react";

// CDN 资源
const SENTIA_ICON = "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/sentia-icon-v1_cfb26d59.png";
const PRODUCT_CONTACTS = "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-contacts-4fLDcpWoC7ZCAT35ypvu8N.webp";
const PRODUCT_LEDGER = "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-ledger-NQcVJ5YtbWDun8Aoa4XYAe.webp";
const PRODUCT_COMPUTE = "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-compute-2bXPVJV4rgCSkDNJEdtAFQ.webp";

// AI 全链路流程步骤
const AI_STEPS = [
  {
    icon: <Layers className="w-5 h-5" />,
    title: "需求分析",
    desc: "AI 深度理解客户场景，生成精准产品方案",
    color: "#7C3AED",
  },
  {
    icon: <Code2 className="w-5 h-5" />,
    title: "设计开发",
    desc: "前端 UI 到后端架构，AI 全程参与代码生成",
    color: "#D32F2F",
  },
  {
    icon: <Cpu className="w-5 h-5" />,
    title: "算力加工",
    desc: "调用算力资源，AI 模型驱动核心功能运行",
    color: "#0277BD",
  },
  {
    icon: <Zap className="w-5 h-5" />,
    title: "落地交付",
    desc: "产品上线运营，AI 持续优化迭代",
    color: "#2E7D32",
  },
];

// 已交付案例
const CASES = [
  {
    name: "好友记人脉管理",
    desc: "AI 驱动的人脉关系管理系统，智能分析人际网络价值",
    tag: "人脉管理",
    tagColor: "#7C3AED",
    img: PRODUCT_CONTACTS,
  },
  {
    name: "蜂窝式定制账本",
    desc: "多场景共享账本，支持 AA 型、餐厅点评等多种定制模式",
    tag: "账本定制",
    tagColor: "#D32F2F",
    img: PRODUCT_LEDGER,
  },
  {
    name: "算力驱动平台",
    desc: "AI 算力资源调度平台，按需购买，实时消耗，透明可追踪",
    tag: "算力服务",
    tagColor: "#0277BD",
    img: PRODUCT_COMPUTE,
  },
];

export default function JiangHome() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      {/* 顶部 Header */}
      <div className="bg-[#0d0d14] border-b border-[#D32F2F]/20">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <img src={SENTIA_ICON} alt="润仪" className="w-8 h-8 rounded-full" />
          <div className="flex-1">
            <div className="text-sm font-bold text-white leading-tight">润仪算力研发中心</div>
            <div className="text-[10px] text-[#D32F2F] leading-tight">Runyi AI Compute Lab</div>
          </div>
          {/* §9.2 未登录时顶部角落显示登录按钮 */}
          {!user && (
            <button
              onClick={() => window.location.href = getLoginUrl()}
              className="flex items-center gap-1 text-[11px] text-[#888899] hover:text-white border border-[#333355] rounded-full px-2.5 py-1 transition-colors"
            >
              <LogIn className="w-3 h-3" />
              登录
            </button>
          )}
        </div>
        <JiangTabBar />
      </div>

      <div className="max-w-lg mx-auto pb-24">
        {/* Hero 区域 */}
        <div className="relative px-4 pt-10 pb-8 overflow-hidden">
          {/* 背景光效 */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-[#D32F2F]/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute top-10 right-0 w-40 h-40 bg-[#7C3AED]/10 rounded-full blur-2xl pointer-events-none" />

          <div className="relative">
            <div className="inline-flex items-center gap-1.5 bg-[#D32F2F]/10 border border-[#D32F2F]/30 rounded-full px-3 py-1 mb-4">
              <span className="w-1.5 h-1.5 bg-[#D32F2F] rounded-full animate-pulse" />
              <span className="text-[11px] text-[#D32F2F] font-medium">AI 全链路驱动</span>
            </div>

            <h1 className="text-2xl font-bold leading-tight mb-3">
              算力加工，
              <br />
              <span className="text-[#D32F2F]">让 AI 为你落地</span>
            </h1>

            <p className="text-[#888899] text-sm leading-relaxed mb-6">
              从需求分析、产品设计、代码开发到上线运营，
              AI 在每个环节深度参与。你提供算力，我们交付产品。
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setLocation("/jiang/shop")}
                className="flex-1 bg-[#D32F2F] hover:bg-[#B71C1C] text-white text-sm font-semibold py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-colors"
              >
                立即购买算力
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setLocation("/jiang/services")}
                className="flex-1 bg-[#1a1a2e] border border-[#333355] text-[#aaaacc] text-sm font-semibold py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-colors hover:border-[#D32F2F]/50"
              >
                查看服务
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* AI 全链路流程 */}
        <div className="px-4 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-white">AI 全链路研发流程</h2>
            <span className="text-[10px] text-[#666680] bg-[#1a1a2e] px-2 py-0.5 rounded-full">4 个阶段</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {AI_STEPS.map((step, i) => (
              <div
                key={i}
                className="bg-[#0d0d1a] border border-[#1e1e35] rounded-2xl p-4 relative overflow-hidden"
              >
                <div
                  className="absolute top-0 right-0 w-16 h-16 rounded-full blur-2xl opacity-20"
                  style={{ background: step.color }}
                />
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: `${step.color}20`, color: step.color }}
                >
                  {step.icon}
                </div>
                <div className="text-xs font-bold text-white mb-1">
                  <span className="text-[#444466] mr-1">0{i + 1}</span>
                  {step.title}
                </div>
                <div className="text-[11px] text-[#666680] leading-relaxed">{step.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 已交付案例 */}
        <div className="px-4 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-white">已交付案例</h2>
            <button
              onClick={() => setLocation("/jiang/services")}
              className="text-[11px] text-[#D32F2F] flex items-center gap-0.5"
            >
              全部服务 <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-3">
            {CASES.map((c, i) => (
              <div
                key={i}
                className="bg-[#0d0d1a] border border-[#1e1e35] rounded-2xl overflow-hidden flex items-center gap-3 p-3"
              >
                <img
                  src={c.img}
                  alt={c.name}
                  className="w-16 h-16 rounded-xl object-cover flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-bold text-white truncate">{c.name}</span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                      style={{ background: `${c.tagColor}20`, color: c.tagColor }}
                    >
                      {c.tag}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#666680] leading-relaxed line-clamp-2">{c.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 数据统计 */}
        <div className="px-4 mb-8">
          <div className="bg-gradient-to-br from-[#D32F2F]/10 to-[#7C3AED]/10 border border-[#D32F2F]/20 rounded-2xl p-5">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-[#D32F2F]">10+</div>
                <div className="text-[11px] text-[#666680] mt-0.5">已交付项目</div>
              </div>
              <div className="border-x border-[#D32F2F]/20">
                <div className="text-2xl font-bold text-[#D32F2F]">100%</div>
                <div className="text-[11px] text-[#666680] mt-0.5">AI 参与率</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-[#D32F2F]">3天</div>
                <div className="text-[11px] text-[#666680] mt-0.5">平均交付周期</div>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="px-4">
          <div className="bg-[#0d0d1a] border border-[#1e1e35] rounded-2xl p-5 text-center">
            <div className="text-sm font-bold text-white mb-1">有定制需求？</div>
            <div className="text-[11px] text-[#666680] mb-4">告诉我们你的想法，AI 帮你快速落地</div>
            <button
              onClick={() => setLocation("/jiang/about")}
              className="w-full bg-[#D32F2F] hover:bg-[#B71C1C] text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
            >
              联系我们
            </button>
          </div>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
