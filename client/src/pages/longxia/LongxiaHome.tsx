/**
 * LongxiaHome.tsx — 龙虾项目首页主框架（骨架）
 *
 * 规则 005 · 项目创建规则 · C 板块「项目骨架结构」样板：
 *   底部 TabBar 框架（配置驱动，可换），顶部内容区 + 底部标签栏切换。
 *
 * 路由：/longxia
 * 结构：底部 4 个 Tab（按钮一 / 按钮二 / 按钮三 / 我的）。
 *   - 前三个为占位内容区；
 *   - 第四个「我的」跳转到龙虾「我的」管理页（仿牙伴风格）。
 *
 * 设计：移动端优先（居中 maxWidth 480），龙虾深红金配色，
 *   lucide-react 图标，严禁 Emoji。Tab 配置驱动（数量/名字/图标改 TABS 即可）。
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { LayoutGrid, Box, Bell, User, type LucideIcon } from "lucide-react";

// ─── 龙虾 UI 配色 ──────────────────────────────────────────────
const C = {
  brand: "#C0392B", // 龙虾红
  brandDeep: "#7A1E12",
  gold: "#E0B97D",
  bg: "#F7F4F2",
  white: "#FFFFFF",
  textMain: "#2A2320",
  textSub: "#8A7F78",
  line: "#ECE6E2",
} as const;

// ─── Tab 配置（配置驱动：改这里即可增减/换名/换图标/换跳转）──────
type TabItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  /** 若设置 route，点击则跳转到该路由；否则在本页切换占位内容区 */
  route?: string;
};

const TABS: TabItem[] = [
  { key: "tab1", label: "按钮一", icon: LayoutGrid },
  { key: "tab2", label: "按钮二", icon: Box },
  { key: "tab3", label: "按钮三", icon: Bell },
  { key: "mine", label: "我的", icon: User, route: "/longxia/my" },
];

export default function LongxiaHome() {
  const [, navigate] = useLocation();
  const [active, setActive] = useState<string>("tab1");

  const activeTab = TABS.find((t) => t.key === active) ?? TABS[0];

  function handleTab(t: TabItem) {
    if (t.route) {
      navigate(t.route);
      return;
    }
    setActive(t.key);
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        maxWidth: 480,
        margin: "0 auto",
        backgroundColor: C.bg,
        fontFamily: "'Noto Sans SC', -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif",
      }}
    >
      {/* ── 顶部栏 ── */}
      <header
        className="sticky top-0 z-10 flex items-center justify-center px-4"
        style={{
          height: 52,
          background: `linear-gradient(135deg,${C.brandDeep} 0%,${C.brand} 100%)`,
        }}
      >
        <span className="text-[17px] font-bold tracking-wide" style={{ color: C.gold }}>
          龙虾
        </span>
      </header>

      {/* ── 主内容区（占位）── */}
      <main className="flex-1 overflow-y-auto">
        <div className="min-h-full flex flex-col items-center justify-center px-6 py-16 text-center">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
            style={{ backgroundColor: "#F3E2DC" }}
          >
            <activeTab.icon className="w-7 h-7" style={{ color: C.brand }} />
          </div>
          <div className="text-[18px] font-bold mb-1.5" style={{ color: C.textMain }}>
            {activeTab.label} · 内容区
          </div>
          <div className="text-[13px]" style={{ color: C.textSub }}>
            这里是「{activeTab.label}」的占位内容，后续替换为实际功能。
          </div>
        </div>
      </main>

      {/* ── 底部 TabBar ── */}
      <nav
        className="sticky bottom-0 z-10 flex border-t"
        style={{ backgroundColor: C.white, borderColor: C.line }}
      >
        {TABS.map((t) => {
          const isActive = !t.route && active === t.key;
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => handleTab(t)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-transform active:scale-[0.96]"
              style={{ color: isActive ? C.brand : C.textSub }}
            >
              <Icon className="w-[22px] h-[22px]" strokeWidth={isActive ? 2.2 : 1.8} />
              <span className="text-[11px]" style={{ fontWeight: isActive ? 700 : 500 }}>
                {t.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
