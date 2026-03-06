/**
 * 红酒文化商会 - 首页
 * 路径: /wine
 * 
 * 架构规则：
 * - 必须包含三大入口：分享、注册/登录、个人中心
 * - 底部脉动导航：人脉 | 红酒（中间大按钮）| 钱脉
 * - 访客无需登录即可浏览
 */
import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import {
  Share2, User, ChevronRight, Wine, Globe, Award, Users, LogOut, Settings
} from "lucide-react";
import WineTabBar from "./WineTabBar";
import BottomNav from "@/components/BottomNav";
import ShareSheet from "@/components/ShareSheet";

const HERO_BG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/wine-hero-banner_b83f1a40.jpg";
const ABOUT_BG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/wine-about-bg_24a554e9.jpg";

const WINE_INFO = {
  name: "红酒文化商会",
  subtitle: "WINE CULTURE SOCIETY",
  slogan: "品味世界，汇聚同好",
  description: "我们是一群热爱葡萄酒文化的同好，汇聚了来自法国、意大利、智利等世界顶级产区的优质酒庄资源。商会认可的每一款酒，都经过严格品鉴与溯源认证。",
};

// 合作酒庄数据（示例）
const PARTNER_WINERIES = [
  { id: 1, name: "拉菲古堡", region: "法国·波尔多", flag: "🇫🇷", established: "1354年" },
  { id: 2, name: "奔富酒庄", region: "澳大利亚·南澳", flag: "🇦🇺", established: "1844年" },
  { id: 3, name: "卡门酒庄", region: "智利·迈坡谷", flag: "🇨🇱", established: "1850年" },
  { id: 4, name: "安东尼世家", region: "意大利·托斯卡纳", flag: "🇮🇹", established: "1385年" },
];

// 最新资讯（示例）
const LATEST_NEWS = [
  { id: 1, title: "2024年份波尔多期酒品鉴报告", date: "2025-03-01", tag: "品鉴报告" },
  { id: 2, title: "勃艮第产区：气候变化对黑皮诺的影响", date: "2025-02-20", tag: "产区资讯" },
  { id: 3, title: "商会春季品鉴会活动预告", date: "2025-02-15", tag: "活动预告" },
];

export default function WineHome() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 加载商家分享信息（公开接口，访客无需登录即可获取，§11.5 分享Meta标签注入）
  const { data: merchantSettings } = trpc.merchant.getMerchantShareInfo.useQuery({ merchantCode: 'cx8618' });

  // 动态注入 Meta 标签，实现分享显示商家信息
  useEffect(() => {
    const shareTitle = merchantSettings?.shareTitle || WINE_INFO.name;
    const shareDesc = merchantSettings?.shareDescription || WINE_INFO.slogan;
    const shareLogo = merchantSettings?.shareLogo || merchantSettings?.shopLogoUrl || "";
    const shareCover = merchantSettings?.shareCoverImage || "";

    // 更新页面标题
    document.title = shareTitle;

    // 更新或创建 Open Graph meta 标签
    const setMeta = (property: string, content: string) => {
      let el = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("property", property);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };
    const setMetaName = (name: string, content: string) => {
      let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("name", name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    setMeta("og:title", shareTitle);
    setMeta("og:description", shareDesc);
    setMeta("og:type", "website");
    setMeta("og:url", `${window.location.origin}/wine`);
    if (shareCover) setMeta("og:image", shareCover);
    else if (shareLogo) setMeta("og:image", shareLogo);
    setMetaName("description", shareDesc);
    setMetaName("twitter:card", "summary_large_image");
    setMetaName("twitter:title", shareTitle);
    setMetaName("twitter:description", shareDesc);
    if (shareCover) setMetaName("twitter:image", shareCover);

    // 离开页面时恢复默认标题
    return () => {
      document.title = "脉动";
    };
  }, [merchantSettings]);

  // 点击外部关闭菜单
  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  // 分享功能：动态读取当前用户邀请码，未登录时使用商城默认邀请码 cx8618
  const refCode = user?.inviteCode || 'cx8618';
  const shareUrl = `${window.location.origin}/wine?ref=${refCode}`;
  const shareTitle = merchantSettings?.shareTitle || WINE_INFO.name;
  const shareDescription = merchantSettings?.shareDescription || WINE_INFO.slogan;
  const handleShare = () => setShareOpen(true);

  return (
    <div className="min-h-screen bg-[#0d0505] text-white pb-24">
      {/* Hero 区域 */}
      <div
        className="relative min-h-[260px] flex flex-col justify-end"
        style={{
          backgroundImage: `linear-gradient(to bottom, rgba(13,5,5,0.3) 0%, rgba(13,5,5,0.85) 100%), url(${HERO_BG})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        {/* 顶部操作栏：分享 + 头像 */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-4">
          {/* 分享按钮（必备入口1） */}
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 bg-white/10 backdrop-blur-sm rounded-full px-3 py-1.5 text-white/80 text-sm hover:bg-white/20 transition-colors"
          >
            <Share2 className="w-4 h-4" />
            <span>分享</span>
          </button>

          {/* 分享面板 */}
          <ShareSheet
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            shareUrl={shareUrl}
            title={shareTitle}
            description={shareDescription}
            inviteCode={user?.inviteCode}
            isLoggedIn={!!user}
          />

          {/* 头像/登录入口（必备入口2+3） */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="w-10 h-10 rounded-full bg-[#8B1A1A]/60 border-2 border-[#C9A84C]/50 flex items-center justify-center overflow-hidden"
            >
              {user?.avatar ? (
                <img src={user.avatar} alt="头像" className="w-full h-full object-cover" />
              ) : (
                <User className="w-5 h-5 text-[#C9A84C]" />
              )}
            </button>

            {/* 下拉菜单 */}
            {menuOpen && (
              <div className="absolute right-0 top-12 w-44 bg-[#1a0a0a] border border-[#8B1A1A]/40 rounded-xl shadow-2xl overflow-hidden z-50">
                {user ? (
                  <>
                    <div className="px-4 py-3 border-b border-[#8B1A1A]/30">
                      <p className="text-xs text-[#8a7a6a]">已登录</p>
                      <p className="text-sm text-white font-medium truncate">{user.name || user.username}</p>
                    </div>
                    <button
                      onClick={() => { setMenuOpen(false); setLocation("/wine/profile"); }}
                      className="w-full flex items-center gap-2 px-4 py-3 text-sm text-[#C9A84C] hover:bg-[#8B1A1A]/20 transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                      个人中心
                    </button>
                    <button
                      onClick={() => { setMenuOpen(false); logout(); }}
                      className="w-full flex items-center gap-2 px-4 py-3 text-sm text-[#8a7a6a] hover:bg-[#8B1A1A]/20 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      退出登录
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => { setMenuOpen(false); window.location.href = getLoginUrl(); }}
                      className="w-full flex items-center gap-2 px-4 py-3 text-sm text-[#C9A84C] hover:bg-[#8B1A1A]/20 transition-colors"
                    >
                      <User className="w-4 h-4" />
                      登录 / 注册
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 商会标题 */}
        <div className="px-5 pb-5 pt-16">
          <p className="text-[#C9A84C]/70 text-xs tracking-[0.3em] mb-1">{WINE_INFO.subtitle}</p>
          <h1 className="text-3xl font-bold text-white mb-1">{WINE_INFO.name}</h1>
          <p className="text-[#C9A84C] text-sm">{WINE_INFO.slogan}</p>
        </div>
      </div>

      {/* Tab 导航 */}
      <WineTabBar />

      {/* 内容区域 */}
      <div className="px-4 pt-5 space-y-6">

        {/* 商会简介 */}
        <div
          className="relative rounded-2xl overflow-hidden p-5"
          style={{
            backgroundImage: `linear-gradient(135deg, rgba(139,26,26,0.8) 0%, rgba(26,10,10,0.95) 100%)`,
          }}
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-[#C9A84C]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Wine className="w-5 h-5 text-[#C9A84C]" />
            </div>
            <div>
              <h2 className="text-[#C9A84C] font-semibold mb-1.5">关于商会</h2>
              <p className="text-white/70 text-sm leading-relaxed">{WINE_INFO.description}</p>
            </div>
          </div>
        </div>

        {/* 数据统计 */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: <Globe className="w-5 h-5" />, value: "12+", label: "合作产区" },
            { icon: <Award className="w-5 h-5" />, value: "80+", label: "认证酒款" },
            { icon: <Users className="w-5 h-5" />, value: "500+", label: "会员同好" },
          ].map((item, i) => (
            <div key={i} className="bg-[#1a0a0a] border border-[#8B1A1A]/30 rounded-xl p-3 flex flex-col items-center gap-1">
              <div className="text-[#C9A84C]">{item.icon}</div>
              <span className="text-white font-bold text-lg">{item.value}</span>
              <span className="text-[#8a7a6a] text-xs">{item.label}</span>
            </div>
          ))}
        </div>

        {/* 合作酒庄 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-semibold">合作酒庄</h2>
            <button className="text-[#C9A84C] text-xs flex items-center gap-0.5">
              查看全部 <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {PARTNER_WINERIES.map((winery) => (
              <div
                key={winery.id}
                className="bg-[#1a0a0a] border border-[#8B1A1A]/30 rounded-xl p-3.5 hover:border-[#C9A84C]/40 transition-colors"
              >
                <div className="text-2xl mb-1.5">{winery.flag}</div>
                <p className="text-white font-medium text-sm">{winery.name}</p>
                <p className="text-[#8a7a6a] text-xs mt-0.5">{winery.region}</p>
                <p className="text-[#C9A84C]/60 text-xs mt-0.5">创立于 {winery.established}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 最新资讯 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-semibold">最新资讯</h2>
            <button
              onClick={() => setLocation("/wine/news")}
              className="text-[#C9A84C] text-xs flex items-center gap-0.5"
            >
              更多 <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-2">
            {LATEST_NEWS.map((news) => (
              <div
                key={news.id}
                className="bg-[#1a0a0a] border border-[#8B1A1A]/30 rounded-xl px-4 py-3 flex items-center justify-between hover:border-[#C9A84C]/40 transition-colors cursor-pointer"
              >
                <div className="flex-1 min-w-0 pr-3">
                  <p className="text-white text-sm font-medium truncate">{news.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[#C9A84C]/70 text-xs bg-[#C9A84C]/10 px-2 py-0.5 rounded-full">{news.tag}</span>
                    <span className="text-[#8a7a6a] text-xs">{news.date}</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[#8a7a6a] flex-shrink-0" />
              </div>
            ))}
          </div>
        </div>

        {/* 品牌中心入口（低调） */}
        <button
          onClick={() => setLocation("/wine/brands")}
          className="w-full flex items-center justify-between bg-gradient-to-r from-[#8B1A1A]/30 to-[#1a0a0a] border border-[#8B1A1A]/40 rounded-xl px-4 py-4 hover:border-[#C9A84C]/40 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#C9A84C]/10 flex items-center justify-center">
              <Wine className="w-5 h-5 text-[#C9A84C]" />
            </div>
            <div className="text-left">
              <p className="text-white text-sm font-medium">探索品牌中心</p>
              <p className="text-[#8a7a6a] text-xs">商会认可 · 品质保证</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-[#C9A84C]" />
        </button>

      </div>

      {/* 底部脉动导航 */}
      <BottomNav />
    </div>
  );
}
