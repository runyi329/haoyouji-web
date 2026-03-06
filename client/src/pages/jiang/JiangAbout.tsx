/**
 * 润仪算力研发中心 - 关于/联系页
 * 路由：/jiang/about
 */
import JiangTabBar from "./JiangTabBar";
import BottomNav from "@/components/BottomNav";
import { MessageCircle, Phone, Mail, MapPin, Cpu, Zap, Shield } from "lucide-react";

const SENTIA_ICON = "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/sentia-icon-v1_cfb26d59.png";

const VALUES = [
  {
    icon: <Cpu className="w-5 h-5" />,
    color: "#D32F2F",
    title: "AI 原生",
    desc: "所有产品从设计到交付，AI 全程深度参与，不是辅助工具，而是核心生产力",
  },
  {
    icon: <Zap className="w-5 h-5" />,
    color: "#0277BD",
    title: "快速交付",
    desc: "算力加工模式大幅缩短研发周期，普通项目 3 天内交付，复杂项目 7 天内完成",
  },
  {
    icon: <Shield className="w-5 h-5" />,
    color: "#2E7D32",
    title: "可靠稳定",
    desc: "基于成熟技术栈构建，每个产品都经过完整测试，长期维护，持续迭代",
  },
];

export default function JiangAbout() {
  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      {/* 顶部 Header */}
      <div className="bg-[#0d0d14] border-b border-[#D32F2F]/20">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <img src={SENTIA_ICON} alt="润仪" className="w-8 h-8 rounded-full" />
          <div>
            <div className="text-sm font-bold text-white leading-tight">润仪算力研发中心</div>
            <div className="text-[10px] text-[#D32F2F] leading-tight">Runyi AI Compute Lab</div>
          </div>
        </div>
        <JiangTabBar />
      </div>

      <div className="max-w-lg mx-auto pb-24">
        {/* 品牌介绍 */}
        <div className="px-4 pt-8 pb-6 text-center">
          <div className="relative inline-block mb-4">
            <img src={SENTIA_ICON} alt="润仪" className="w-20 h-20 rounded-2xl mx-auto" />
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-[#D32F2F] rounded-full flex items-center justify-center">
              <Cpu className="w-3 h-3 text-white" />
            </div>
          </div>
          <h1 className="text-xl font-bold text-white mb-1">润仪算力研发中心</h1>
          <p className="text-[11px] text-[#D32F2F] mb-4">Runyi AI Compute Lab</p>
          <p className="text-[12px] text-[#888899] leading-relaxed max-w-xs mx-auto">
            专注于 AI 驱动的数字产品研发，从算力采购到产品交付，
            全链路 AI 深度参与。我们相信，算力是未来最重要的生产资料。
          </p>
        </div>

        {/* 核心价值观 */}
        <div className="px-4 mb-6">
          <h2 className="text-base font-bold text-white mb-3">我们的理念</h2>
          <div className="space-y-3">
            {VALUES.map((v, i) => (
              <div key={i} className="bg-[#0d0d1a] border border-[#1e1e35] rounded-2xl p-4 flex items-start gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${v.color}20`, color: v.color }}
                >
                  {v.icon}
                </div>
                <div>
                  <div className="text-sm font-bold text-white mb-0.5">{v.title}</div>
                  <div className="text-[11px] text-[#666680] leading-relaxed">{v.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 联系方式 */}
        <div className="px-4 mb-6">
          <h2 className="text-base font-bold text-white mb-3">联系我们</h2>
          <div className="bg-[#0d0d1a] border border-[#1e1e35] rounded-2xl overflow-hidden">
            {/* 微信 */}
            <div className="flex items-center gap-3 p-4 border-b border-[#1e1e35]">
              <div className="w-9 h-9 rounded-xl bg-[#07C160]/20 flex items-center justify-center flex-shrink-0">
                <MessageCircle className="w-5 h-5 text-[#07C160]" />
              </div>
              <div className="flex-1">
                <div className="text-xs text-[#444466]">微信咨询</div>
                <div className="text-sm font-semibold text-white">扫码添加微信</div>
              </div>
              <div className="text-[11px] text-[#D32F2F]">推荐</div>
            </div>
            {/* 电话 */}
            <div className="flex items-center gap-3 p-4 border-b border-[#1e1e35]">
              <div className="w-9 h-9 rounded-xl bg-[#D32F2F]/20 flex items-center justify-center flex-shrink-0">
                <Phone className="w-5 h-5 text-[#D32F2F]" />
              </div>
              <div className="flex-1">
                <div className="text-xs text-[#444466]">电话咨询</div>
                <div className="text-sm font-semibold text-white">工作日 9:00 - 18:00</div>
              </div>
            </div>
            {/* 邮件 */}
            <div className="flex items-center gap-3 p-4 border-b border-[#1e1e35]">
              <div className="w-9 h-9 rounded-xl bg-[#0277BD]/20 flex items-center justify-center flex-shrink-0">
                <Mail className="w-5 h-5 text-[#0277BD]" />
              </div>
              <div className="flex-1">
                <div className="text-xs text-[#444466]">邮件咨询</div>
                <div className="text-sm font-semibold text-white">hello@runyi.ai</div>
              </div>
            </div>
            {/* 地址 */}
            <div className="flex items-center gap-3 p-4">
              <div className="w-9 h-9 rounded-xl bg-[#2E7D32]/20 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-5 h-5 text-[#2E7D32]" />
              </div>
              <div className="flex-1">
                <div className="text-xs text-[#444466]">服务区域</div>
                <div className="text-sm font-semibold text-white">全国远程服务</div>
              </div>
            </div>
          </div>
        </div>

        {/* 服务承诺 */}
        <div className="px-4">
          <div className="bg-gradient-to-br from-[#D32F2F]/10 to-[#7C3AED]/10 border border-[#D32F2F]/20 rounded-2xl p-5">
            <h3 className="text-sm font-bold text-white mb-3">服务承诺</h3>
            <div className="space-y-2">
              {[
                "需求确认后 24 小时内给出方案",
                "定制项目 3-7 个工作日交付",
                "交付后 30 天内免费修改",
                "长期维护，持续迭代优化",
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-[#D32F2F] rounded-full flex-shrink-0" />
                  <span className="text-[12px] text-[#aaaacc]">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
