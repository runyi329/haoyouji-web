/**
 * 牙伴齿科管理 - 全站统一顶栏组件
 *
 * 设计规范（全站统一，禁止各页面再各写各的顶栏）：
 * - 底色：标准主色渐变 #1E88D6 → #3D9FD6，白字
 * - 返回标识：统一用左箭头图标 ChevronLeft（不再用文字「取消」）
 * - 标题：居中单行，只放页面名
 * - 所属医院：移出标题下方，改为顶栏右侧小药丸标签（clinicName）
 * - 右侧操作：支持传入 right 自定义按钮（如「保存」「编辑」），与 clinicName 二选一或并存
 * - 适配刘海屏：顶部内边距含 env(safe-area-inset-top)
 * - 禁止 Emoji
 */
import { ChevronLeft } from "lucide-react";
import { useLocation } from "wouter";

const SKY_D = "#1E88D6", SKY = "#3D9FD6";

interface YabanTopBarProps {
  title: string;
  /** 返回目标路由；不传则调用浏览器后退 */
  back?: string;
  /** 自定义返回行为，优先级高于 back */
  onBack?: () => void;
  /** 门店名，显示为右侧小药丸标签 */
  clinicName?: string;
  /** 右侧自定义内容（如保存按钮）；传入后会覆盖 clinicName 标签位置 */
  right?: React.ReactNode;
}

export function YabanTopBar({ title, back, onBack, clinicName, right }: YabanTopBarProps) {
  const [, setLocation] = useLocation();

  const handleBack = () => {
    if (onBack) return onBack();
    if (back) return setLocation(back);
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else {
      setLocation("/yaban/home");
    }
  };

  return (
    <div
      style={{
        background: `linear-gradient(90deg, ${SKY_D}, ${SKY})`,
        color: "#fff",
        padding: "calc(env(safe-area-inset-top) + 14px) 12px 12px",
        position: "relative",
      }}
    >
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 28 }}>
        {/* 返回箭头（统一标识，绝对定位左侧，热区加大） */}
        <button
          onClick={handleBack}
          aria-label="返回"
          style={{
            position: "absolute",
            left: 0,
            top: "50%",
            transform: "translateY(-50%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            border: "none",
            background: "transparent",
            color: "#fff",
            cursor: "pointer",
            padding: 0,
          }}
        >
          <ChevronLeft size={24} />
        </button>

        {/* 标题：居中单行 */}
        <span style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.2, maxWidth: "60%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
        </span>

        {/* 右侧：自定义内容 或 门店药丸标签 */}
        <div style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center" }}>
          {right
            ? right
            : clinicName && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: "#fff",
                    background: "rgba(255,255,255,.18)",
                    borderRadius: 20,
                    padding: "4px 10px",
                    maxWidth: 120,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {clinicName}
                </span>
              )}
        </div>
      </div>
    </div>
  );
}

export default YabanTopBar;
