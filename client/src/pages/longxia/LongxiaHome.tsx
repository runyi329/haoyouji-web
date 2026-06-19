/**
 * LongxiaHome.tsx — 龙虾项目首页
 *
 * 路由：/longxia
 * 结构：顶部品牌栏（左空 + 标题居中 + 右上角「我的」入口）+ 主内容区（空白占位）
 *   点击右上角头像/「我的」→ 跳转 /longxia/my
 *
 * 设计：移动端优先（居中 maxWidth 480），龙虾深红金配色，严禁 Emoji。
 */
import { useLocation } from "wouter";
import { User } from "lucide-react";

const C = {
  brand: "#C0392B",
  brandDeep: "#7A1E12",
  gold: "#E0B97D",
  bg: "#F7F4F2",
} as const;

export default function LongxiaHome() {
  const [, navigate] = useLocation();

  return (
    <div
      className="flex flex-col"
      style={{
        minHeight: "100dvh",
        maxWidth: 480,
        margin: "0 auto",
        backgroundColor: C.bg,
        fontFamily: "'Noto Sans SC', -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif",
      }}
    >
      {/* ── 顶部品牌栏 ── */}
      <header
        className="sticky top-0 z-10 flex items-center justify-between px-4"
        style={{
          height: 52,
          background: `linear-gradient(135deg,${C.brandDeep} 0%,${C.brand} 100%)`,
          flexShrink: 0,
        }}
      >
        {/* 左侧占位 */}
        <div className="w-8" />
        {/* 标题居中 */}
        <span className="text-[17px] font-bold tracking-wide" style={{ color: C.gold }}>
          龙虾
        </span>
        {/* 右侧：我的入口 */}
        <button
          onClick={() => navigate("/longxia/my")}
          className="w-8 h-8 flex items-center justify-center rounded-full transition-transform active:scale-[0.92]"
          style={{ backgroundColor: "rgba(255,255,255,0.18)" }}
          aria-label="我的"
        >
          <User size={18} strokeWidth={1.8} style={{ color: "#fff" }} />
        </button>
      </header>

      {/* ── 主内容区（占位，后续替换为实际内容）── */}
      <main className="flex-1" style={{ backgroundColor: C.bg }} />
    </div>
  );
}
