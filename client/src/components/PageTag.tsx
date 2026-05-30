import { useAuth } from "@/_core/hooks/useAuth";

interface PageTagProps {
  code: string;
}

/**
 * PageTag - 仅超级管理员可见的页面编号标签
 * 固定显示在页面右下角，用于快速定位页面
 * 其他用户完全不可见
 */
export function PageTag({ code }: PageTagProps) {
  const { user } = useAuth();

  if (!user || user.role !== "super_admin") {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: "72px",
        right: "8px",
        zIndex: 9999,
        backgroundColor: "rgba(0,0,0,0.55)",
        color: "#FFD700",
        fontSize: "10px",
        fontFamily: "monospace",
        fontWeight: "bold",
        padding: "2px 6px",
        borderRadius: "4px",
        pointerEvents: "none",
        userSelect: "none",
        letterSpacing: "0.5px",
        border: "1px solid rgba(255,215,0,0.4)",
      }}
    >
      {code}
    </div>
  );
}
