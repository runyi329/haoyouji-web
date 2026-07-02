/**
 * OpsCard - 通用卡片容器
 * 牙伴风格：白底，圆角14px，轻阴影
 */

import type { ReactNode } from "react";

interface OpsCardProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  style?: React.CSSProperties;
}

export default function OpsCard({ title, subtitle, action, children, style }: OpsCardProps) {
  return (
    <div
      style={{
        background: "white",
        borderRadius: 7,
        boxShadow: "0 4px 16px rgba(15,23,42,0.10), 0 1px 4px rgba(15,23,42,0.06)",
        overflow: "hidden",
        ...style,
      }}
    >
      {/* 卡片头 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px 8px",
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1F2937" }}>{title}</div>
          {subtitle && (
            <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{subtitle}</div>
          )}
        </div>
        {action && (
          <div style={{ fontSize: 11, color: "#2196C8", fontWeight: 500, cursor: "pointer" }}>
            {action}
          </div>
        )}
      </div>

      {/* 卡片体 */}
      <div style={{ padding: "0 16px 14px" }}>{children}</div>
    </div>
  );
}
