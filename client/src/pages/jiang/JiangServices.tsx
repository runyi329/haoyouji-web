/**
 * 润仪算力研发中心 - 服务页
 * 路由：/jiang/services
 */
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";
import JiangTabBar from "./JiangTabBar";
import BottomNav from "@/components/BottomNav";
import { Users, BookOpen, Globe, ChevronRight, CheckCircle2, LogIn, Share2 } from "lucide-react";

const SENTIA_ICON = "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/sentia-icon-v1_cfb26d59.png";
const PRODUCT_CONTACTS = "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-contacts-4fLDcpWoC7ZCAT35ypvu8N.webp";
const PRODUCT_LEDGER = "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-ledger-NQcVJ5YtbWDun8Aoa4XYAe.webp";
const PRODUCT_COMPUTE = "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-compute-2bXPVJV4rgCSkDNJEdtAFQ.webp";

const SERVICES = [
  {
    icon: <Users className="w-6 h-6" />,
    color: "#7C3AED",
    img: PRODUCT_CONTACTS,
    title: "人脉管理软件定制",
    subtitle: "AI 驱动的人际关系管理系统",
    desc: "帮助个人和企业系统化管理人脉资源，AI 智能分析关系价值，自动提醒跟进时机，让每一段关系都产生价值。",
    features: [
      "AI 智能人脉分析与价值评估",
      "多维度关系标签与分类管理",
      "智能提醒与跟进建议",
      "人脉关系图谱可视化",
      "数据导入导出与备份",
    ],
    cases: ["好友记人脉管理 App", "企业客户关系管理系统"],
    priceFrom: "¥28/月起",
    href: "/jiang/shop",
  },
  {
    icon: <BookOpen className="w-6 h-6" />,
    color: "#D32F2F",
    img: PRODUCT_LEDGER,
    title: "蜂窝式定制账本",
    subtitle: "多场景共享账本解决方案",
    desc: "为不同业务场景定制专属账本系统，支持多人协作、权限管理、数据统计。蜂窝式架构让每个场景都有最适合的账本形态。",
    features: [
      "AA 型：多人共享，权限分级管理",
      "餐厅/门店：扫码免注册提意见",
      "自定义分类与统计维度",
      "实时同步与多端访问",
      "数据导出与财务报表",
    ],
    cases: ["家庭共享账本", "小团队 AA 记账", "门店客户反馈系统"],
    priceFrom: "¥299 起",
    href: "/jiang/shop",
  },
  {
    icon: <Globe className="w-6 h-6" />,
    color: "#0277BD",
    img: PRODUCT_COMPUTE,
    title: "商家主页定制开发",
    subtitle: "AI 全程参与的品牌数字主页",
    desc: "从品牌定位、视觉设计到前后端开发，AI 全程协作完成。已服务美容院、红酒商会等多个行业客户，3 天快速交付。",
    features: [
      "品牌视觉设计与 UI/UX",
      "前端 React + 后端 Node.js 全栈开发",
      "商城、预约、会员等功能模块",
      "移动端优先，响应式适配",
      "支付宝/微信支付接入",
    ],
    cases: ["奢贝美容院主页", "红酒文化商会主页", "亲子游戏平台"],
    priceFrom: "¥1,299 起",
    href: "/jiang/shop",
  },
];

export default function JiangServices() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const handleShare = () => {
    const inviteCode = (user as any)?.inviteCode || "jiang";
    const shareUrl = `${window.location.origin}/jiang?ref=${inviteCode}`;
    if (navigator.share) {
      navigator.share({ title: "润仪算力研发中心", text: "AI 全链路驱动，算力加工，让 AI 为你落地", url: shareUrl });
    } else {
      navigator.clipboard.writeText(shareUrl).then(() => toast.success("链接已复制！已包含您的邀请码"));
    }
  };

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
          {!user ? (
            <button
              onClick={() => window.location.href = getLoginUrl()}
              className="flex items-center gap-1 text-[11px] text-[#888899] hover:text-white border border-[#333355] rounded-full px-2.5 py-1 transition-colors"
            >
              <LogIn className="w-3 h-3" />
              登录
            </button>
          ) : (
            <button
              onClick={handleShare}
              className="flex items-center justify-center w-8 h-8 rounded-full border border-[#333355] text-[#888899] hover:text-white hover:border-[#D32F2F]/50 transition-colors"
            >
              <Share2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <JiangTabBar />
      </div>

      <div className="max-w-lg mx-auto pb-24">
        {/* 页面标题 */}
        <div className="px-4 pt-6 pb-4">
          <h1 className="text-lg font-bold text-white mb-1">我们的服务</h1>
          <p className="text-[12px] text-[#666680]">AI 全链路参与，从设计到交付，快速落地你的想法</p>
        </div>

        {/* 服务列表 */}
        <div className="px-4 space-y-5">
          {SERVICES.map((svc, i) => (
            <div
              key={i}
              className="bg-[#0d0d1a] border border-[#1e1e35] rounded-2xl overflow-hidden"
            >
              {/* 封面图 */}
              <div className="relative h-36 overflow-hidden">
                <img src={svc.img} alt={svc.title} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d1a] via-[#0d0d1a]/40 to-transparent" />
                <div
                  className="absolute top-3 left-3 w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: `${svc.color}30`, color: svc.color, border: `1px solid ${svc.color}40` }}
                >
                  {svc.icon}
                </div>
                <div className="absolute bottom-3 left-3">
                  <div className="text-base font-bold text-white">{svc.title}</div>
                  <div className="text-[11px]" style={{ color: svc.color }}>{svc.subtitle}</div>
                </div>
              </div>

              {/* 内容 */}
              <div className="p-4">
                <p className="text-[12px] text-[#888899] leading-relaxed mb-4">{svc.desc}</p>

                {/* 功能点 */}
                <div className="space-y-1.5 mb-4">
                  {svc.features.map((f, j) => (
                    <div key={j} className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: svc.color }} />
                      <span className="text-[11px] text-[#aaaacc]">{f}</span>
                    </div>
                  ))}
                </div>

                {/* 已有案例 */}
                <div className="mb-4">
                  <div className="text-[10px] text-[#444466] mb-1.5">已交付案例</div>
                  <div className="flex flex-wrap gap-1.5">
                    {svc.cases.map((c, j) => (
                      <span
                        key={j}
                        className="text-[10px] px-2 py-0.5 rounded-full"
                        style={{ background: `${svc.color}15`, color: svc.color, border: `1px solid ${svc.color}30` }}
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>

                {/* 价格和按钮 */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] text-[#444466]">起步价格</div>
                    <div className="text-base font-bold" style={{ color: svc.color }}>{svc.priceFrom}</div>
                  </div>
                  <button
                    onClick={() => setLocation(svc.href)}
                    className="flex items-center gap-1 text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
                    style={{ background: `${svc.color}20`, color: svc.color, border: `1px solid ${svc.color}40` }}
                  >
                    立即购买 <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 底部咋询 */}
        <div className="px-4 mt-6">
          <div className="bg-gradient-to-br from-[#D32F2F]/10 to-[#7C3AED]/10 border border-[#D32F2F]/20 rounded-2xl p-5 text-center">
            <div className="text-sm font-bold text-white mb-1">需要定制方案？</div>
            <div className="text-[11px] text-[#666680] mb-4">以上服务均可根据您的具体需求定制，欢迎咋询</div>
            <button
              onClick={() => setLocation("/jiang/about")}
              className="bg-[#D32F2F] hover:bg-[#B71C1C] text-white text-sm font-semibold px-8 py-2.5 rounded-xl transition-colors"
            >
              联系咋询
            </button>
          </div>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
