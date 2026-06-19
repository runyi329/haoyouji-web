/**
 * LongxiaMy.tsx — 龙虾项目「我的」管理页（骨架，仿牙伴 YabanMyPage 风格）
 *
 * 规则 005 · 项目创建规则：
 *   {项目名}网站管理员只管自己项目内事务。本页为「龙虾网站管理员」后台雏形。
 *
 * 路由：/longxia/my
 * 结构：顶部品牌渐变栏 + 个人信息卡 + 白色圆角卡片分组列表。
 *   当前仅放一项管理入口「页面布局管理」→ /longxia/layout-templates。
 *
 * 设计：移动端优先（居中 maxWidth 480），龙虾深红金配色，
 *   lucide-react 图标，严禁 Emoji。
 */
import { useLocation } from "wouter";
import { ChevronLeft, LayoutTemplate, ChevronRight } from "lucide-react";

// ─── 龙虾 UI 配色 ──────────────────────────────────────────────
const C = {
  brand: "#C0392B",
  brandDeep: "#7A1E12",
  brandGrad: "linear-gradient(135deg,#7A1E12 0%,#C0392B 100%)",
  gold: "#E0B97D",
  bg: "#F7F4F2",
  white: "#FFFFFF",
  line100: "#F0EAE6",
  textWeak: "#B3A89F",
  textSub: "#8A7F78",
  textMain: "#2A2320",
} as const;

// ─── 当前网站管理员（占位）──────────────────────────────────────
const ADMIN = {
  name: "龙虾网站管理员",
  role: "网站管理员",
  project: "龙虾",
};

// ─── 管理项配置（配置驱动：以后增减管理入口改这里）────────────────
const MANAGE_ITEMS = [
  {
    key: "layout",
    label: "页面布局管理",
    desc: "选择 / 切换首页骨架模板",
    icon: LayoutTemplate,
    route: "/longxia/layout-templates",
  },
];

export default function LongxiaMy() {
  const [, navigate] = useLocation();

  return (
    <div
      style={{
        minHeight: "100dvh",
        maxWidth: 480,
        margin: "0 auto",
        backgroundColor: C.bg,
        fontFamily: "'Noto Sans SC', -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif",
      }}
    >
      {/* ── 顶栏 + 个人信息卡 ── */}
      <div style={{ background: C.brandGrad }}>
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => navigate("/longxia")} className="p-1 -ml-1" aria-label="返回">
            <ChevronLeft size={22} strokeWidth={2} style={{ color: "#fff" }} />
          </button>
          <span className="text-[18px] font-extrabold text-white">我的</span>
          <div className="w-8" />
        </div>

        <div className="px-4 pb-5 flex items-center gap-3">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-[22px] font-extrabold flex-shrink-0"
            style={{ backgroundColor: "rgba(255,255,255,0.22)", color: C.gold }}
          >
            {ADMIN.name[0]}
          </div>
          <div>
            <div className="text-[18px] font-extrabold text-white">{ADMIN.name}</div>
            <div className="text-[12px] text-white/75 mt-0.5">
              {ADMIN.project} · {ADMIN.role}
            </div>
          </div>
        </div>
      </div>

      {/* ── 管理项列表 ── */}
      <div className="px-4 py-3 flex flex-col gap-3">
        <div
          className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: C.white, boxShadow: "0 1px 3px rgba(40,20,10,.06)" }}
        >
          {MANAGE_ITEMS.map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                onClick={() => navigate(item.route)}
                className="w-full flex items-center gap-3 px-4 py-3.5 transition-transform active:scale-[0.99]"
                style={{ borderBottom: i < MANAGE_ITEMS.length - 1 ? `1px solid ${C.line100}` : "none" }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: "#F3E2DC" }}
                >
                  <Icon size={18} strokeWidth={1.6} style={{ color: C.brand }} />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-[14px] font-bold" style={{ color: C.textMain }}>
                    {item.label}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: C.textSub }}>
                    {item.desc}
                  </div>
                </div>
                <ChevronRight size={18} strokeWidth={1.6} style={{ color: C.textWeak }} />
              </button>
            );
          })}
        </div>

        <p className="text-[11px] text-center mt-1" style={{ color: C.textWeak }}>
          更多管理项陆续开放
        </p>
      </div>
    </div>
  );
}
