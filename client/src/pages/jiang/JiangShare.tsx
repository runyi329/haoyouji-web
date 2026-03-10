/**
 * 润仪算力研发中心 - 商家分享页（海报式）
 * 路由：/share/jiang
 *
 * 规则（§24 商品分享页架构规则）：
 * - 完全免登录浏览，不做任何认证检查
 * - 无顶部导航栏、无返回按钮、无底部 TabBar
 * - 顶部仅显示品牌 Logo 标识
 * - 底部固定「立即进入」按钮：
 *   - 已登录 → 跳转到 /jiang
 *   - 未登录 → 跳转到登录页，登录后回到 /jiang
 * - 分享链接自带 ?ref= 邀请码（由分享方生成，此页面负责存储）
 */
import { useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Share2, Cpu, Zap, Code2, Layers, ArrowRight } from "lucide-react";
import { toast } from "sonner";

const SENTIA_ICON = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/sentia-icon-v1_cfb26d59.webp";
const PRODUCT_CONTACTS = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/product-contacts-4fLDcpWoC7ZCAT35ypvu8N.webp";
const PRODUCT_LEDGER = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/product-ledger-NQcVJ5YtbWDun8Aoa4XYAe.webp";
const PRODUCT_COMPUTE = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/product-compute-2bXPVJV4rgCSkDNJEdtAFQ.webp";

const FEATURES = [
  { icon: <Layers className="w-4 h-4" />, color: "#7C3AED", title: "需求分析", desc: "AI 深度理解场景，生成精准方案" },
  { icon: <Code2 className="w-4 h-4" />, color: "#D32F2F", title: "设计开发", desc: "AI 全程参与代码生成" },
  { icon: <Cpu className="w-4 h-4" />, color: "#0277BD", title: "算力加工", desc: "调用算力资源驱动核心功能" },
  { icon: <Zap className="w-4 h-4" />, color: "#2E7D32", title: "落地交付", desc: "3 天内交付，持续迭代" },
];

const CASES = [
  { name: "好友记人脉管理", tag: "人脉管理", tagColor: "#7C3AED", img: PRODUCT_CONTACTS },
  { name: "蜂窝式定制账本", tag: "账本定制", tagColor: "#D32F2F", img: PRODUCT_LEDGER },
  { name: "算力驱动平台", tag: "算力服务", tagColor: "#0277BD", img: PRODUCT_COMPUTE },
];

export default function JiangShare() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { user, isAuthenticated } = useAuth();

  // §3.4 存储 ref 邀请码到 localStorage（有效期 7 天）
  useEffect(() => {
    const params = new URLSearchParams(search);
    const ref = params.get("ref");
    if (ref) {
      const expire = Date.now() + 7 * 24 * 60 * 60 * 1000;
      localStorage.setItem("invite_ref", JSON.stringify({ code: ref, expire }));
    }
  }, [search]);

  // 底部「立即进入」按钮
  const handleEnter = () => {
    if (isAuthenticated) {
      setLocation("/jiang");
    } else {
      window.location.href = getLoginUrl();
    }
  };

  // 二次分享
  const handleShare = () => {
    const params = new URLSearchParams(search);
    const ref = params.get("ref") || "jiang";
    const shareUrl = `${window.location.origin}/share/jiang?ref=${ref}`;
    if (navigator.share) {
      navigator.share({
        title: "润仪算力研发中心",
        text: "AI 全链路驱动，算力加工，让 AI 为你落地",
        url: shareUrl,
      });
    } else {
      navigator.clipboard.writeText(shareUrl).then(() => {
        toast.success("链接已复制！");
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      {/* 顶部品牌标识（无返回按钮，无 App 导航） */}
      <div className="bg-[#0d0d14] border-b border-[#D32F2F]/20 px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={SENTIA_ICON} alt="润仪" className="w-9 h-9 rounded-xl" />
            <div>
              <div className="text-sm font-bold text-white leading-tight">润仪算力研发中心</div>
              <div className="text-[10px] text-[#D32F2F] leading-tight">Runyi AI Compute Lab</div>
            </div>
          </div>
          {/* 二次分享按钮 */}
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 bg-[#D32F2F]/10 border border-[#D32F2F]/30 rounded-full px-3 py-1.5 text-[#D32F2F] text-xs"
          >
            <Share2 className="w-3 h-3" />
            分享
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto pb-28">
        {/* Hero */}
        <div className="relative px-4 pt-10 pb-8 overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-[#D32F2F]/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative text-center">
            <div className="inline-flex items-center gap-1.5 bg-[#D32F2F]/10 border border-[#D32F2F]/30 rounded-full px-3 py-1 mb-4">
              <span className="w-1.5 h-1.5 bg-[#D32F2F] rounded-full" />
              <span className="text-[11px] text-[#D32F2F] font-medium">AI 全链路驱动</span>
            </div>
            <h1 className="text-2xl font-bold leading-tight mb-3">
              算力加工，
              <br />
              <span className="text-[#D32F2F]">让 AI 为你落地</span>
            </h1>
            <p className="text-[#888899] text-sm leading-relaxed max-w-xs mx-auto">
              从需求分析、产品设计、代码开发到上线运营，AI 在每个环节深度参与。你提供算力，我们交付产品。
            </p>
          </div>
        </div>

        {/* AI 流程 */}
        <div className="px-4 mb-8">
          <div className="grid grid-cols-2 gap-3">
            {FEATURES.map((f, i) => (
              <div key={i} className="bg-[#0d0d1a] border border-[#1e1e35] rounded-2xl p-4">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: `${f.color}20`, color: f.color }}
                >
                  {f.icon}
                </div>
                <div className="text-xs font-bold text-white mb-1">
                  <span className="text-[#444466] mr-1">0{i + 1}</span>{f.title}
                </div>
                <div className="text-[11px] text-[#666680]">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 已交付案例 */}
        <div className="px-4 mb-8">
          <h2 className="text-base font-bold text-white mb-3">已交付案例</h2>
          <div className="space-y-3">
            {CASES.map((c, i) => (
              <div key={i} className="bg-[#0d0d1a] border border-[#1e1e35] rounded-2xl overflow-hidden flex items-center gap-3 p-3">
                <img src={c.img} alt={c.name} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-bold text-white">{c.name}</span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full"
                      style={{ background: `${c.tagColor}20`, color: c.tagColor }}
                    >
                      {c.tag}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 数据 */}
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
                <div className="text-[11px] text-[#666680] mt-0.5">平均交付</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 底部固定「立即进入」按钮（§24.2 唯一行动入口） */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#0A0A0F]/95 backdrop-blur-sm border-t border-[#D32F2F]/20 px-4 py-4 safe-area-inset-bottom">
        <div className="max-w-lg mx-auto">
          <button
            onClick={handleEnter}
            className="w-full bg-[#D32F2F] hover:bg-[#B71C1C] text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-colors"
          >
            立即进入算力中心
            <ArrowRight className="w-5 h-5" />
          </button>
          <p className="text-center text-[11px] text-[#444466] mt-2">
            {isAuthenticated ? `已登录为 ${(user as any)?.name || (user as any)?.username}` : "登录后可购买算力包"}
          </p>
        </div>
      </div>
    </div>
  );
}
