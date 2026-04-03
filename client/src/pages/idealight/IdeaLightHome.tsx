/**
 * IDEALIGHT 红颜派 - 商家主页
 * 路径: /idealight
 * 无需登录，公开访问
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { Share2, ShoppingBag, Activity, BookOpen, ChevronRight, Phone, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";

const CDN = "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb";
const ICON_URL = `${CDN}/idealight_icon_transparent_da0e38f1.png`;

const PRODUCT_PAGES = [
  `${CDN}/page01_hero_a4d6eb0c.png`,
  `${CDN}/page02_brand_78d64c06.png`,
  `${CDN}/page03_science_bf5079d4.png`,
  `${CDN}/page04_sofa_v2_5f4efe0a.png`,
  `${CDN}/page05_vanity_v2_5da85aed.png`,
  `${CDN}/page06_before_after_3d2b74d4.png`,
  `${CDN}/page07_specs_v4_f66b5771.png`,
  `${CDN}/page08_steps_v3_1512b675.png`,
  `${CDN}/page09_faq_v3_ec6c2f75.png`,
  `${CDN}/page10_ending_0f63160b.png`,
];

type TabType = "intro" | "shop" | "health";

export default function IdeaLightHome() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<TabType>("intro");

  const handleShare = () => {
    const shareUrl = `${window.location.origin}/idealight`;
    if (navigator.share) {
      navigator.share({
        title: "IDEALIGHT 红颜派 · 红光美容灯",
        text: "650nm 黄金波长，科学美容，在家享受专业护肤体验",
        url: shareUrl,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareUrl).then(() => {
        toast.success("链接已复制，快去分享吧！");
      });
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <div className="sticky top-0 z-50 bg-black/90 backdrop-blur-md border-b border-white/10">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <img src={ICON_URL} alt="IDEALIGHT" className="w-7 h-7 object-contain" />
            <span className="text-white font-semibold tracking-widest text-sm">IDEALIGHT</span>
          </div>
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 rounded-full px-3 py-1.5 text-xs text-white/80 transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>分享</span>
          </button>
        </div>
        <div className="flex border-t border-white/10">
          {([
            { key: "intro" as TabType, label: "产品介绍" },
            { key: "shop" as TabType, label: "商城" },
            { key: "health" as TabType, label: "健康检测" },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                if (tab.key === "shop") toast("商城即将上线，敬请期待");
                if (tab.key === "health") toast("健康检测功能即将上线，敬请期待");
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "text-[#E53935] border-b-2 border-[#E53935]"
                  : "text-white/50 hover:text-white/80"
              }`}
            >
              {tab.key === "intro" && <BookOpen className="w-4 h-4" />}
              {tab.key === "shop" && <ShoppingBag className="w-4 h-4" />}
              {tab.key === "health" && <Activity className="w-4 h-4" />}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 pb-24">
        {activeTab === "intro" && (
          <div className="w-full">
            {PRODUCT_PAGES.map((url, idx) => (
              <div key={idx} style={{ lineHeight: 0 }}>
                <img
                  src={url}
                  alt={`红颜派产品介绍 ${idx + 1}`}
                  className="w-full block"
                  loading={idx < 3 ? "eager" : "lazy"}
                />
              </div>
            ))}
            <div className="bg-[#0D0D0D] px-6 py-8 border-t border-white/10">
              <div className="flex items-center justify-center mb-6">
                <img src={ICON_URL} alt="IDEALIGHT" className="w-6 h-6 object-contain mr-2" />
                <span className="text-white/60 text-xs tracking-widest">IDEALIGHT</span>
              </div>
              <div className="space-y-3">
                <a
                  href="tel:13761550633"
                  className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3.5 active:bg-white/10"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#E53935]/20 flex items-center justify-center">
                      <Phone className="w-4 h-4 text-[#E53935]" />
                    </div>
                    <div>
                      <div className="text-white text-sm font-medium">电话咨询</div>
                      <div className="text-white/40 text-xs">137 6155 0633</div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/30" />
                </a>
                <div className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-green-500/20 flex items-center justify-center">
                      <MessageCircle className="w-4 h-4 text-green-400" />
                    </div>
                    <div>
                      <div className="text-white text-sm font-medium">微信客服</div>
                      <div className="text-white/40 text-xs">13761550633</div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/30" />
                </div>
              </div>
              <p className="text-center text-white/20 text-xs mt-6">上海佰时特健康科技有限公司</p>
            </div>
          </div>
        )}

        {activeTab === "shop" && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] px-8 text-center">
            <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6">
              <ShoppingBag className="w-9 h-9 text-white/30" />
            </div>
            <h3 className="text-white text-lg font-medium mb-2">商城即将上线</h3>
            <p className="text-white/40 text-sm leading-relaxed">我们正在为您精心准备<br />敬请期待</p>
            <button
              onClick={handleShare}
              className="mt-8 flex items-center gap-2 bg-[#E53935] text-white rounded-full px-6 py-3 text-sm font-medium"
            >
              <Share2 className="w-4 h-4" />
              分享给朋友
            </button>
          </div>
        )}

        {activeTab === "health" && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] px-8 text-center">
            <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6">
              <Activity className="w-9 h-9 text-white/30" />
            </div>
            <h3 className="text-white text-lg font-medium mb-2">健康检测即将上线</h3>
            <p className="text-white/40 text-sm leading-relaxed">AI 驱动的皮肤健康分析<br />个性化护肤方案，敬请期待</p>
            <button
              onClick={handleShare}
              className="mt-8 flex items-center gap-2 bg-[#E53935] text-white rounded-full px-6 py-3 text-sm font-medium"
            >
              <Share2 className="w-4 h-4" />
              分享给朋友
            </button>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
