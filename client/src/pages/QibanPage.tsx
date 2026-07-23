import { useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";

export default function QibanPage() {
  const [, setLocation] = useLocation();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { isAuthenticated, user } = useAuth();
  const avatarText = user?.name ? user.name.charAt(0).toUpperCase() : "?";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#fff",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* 顶部返回栏 */}
      <div
        style={{
          height: 44,
          display: "flex",
          alignItems: "center",
          padding: "0 12px",
          background: "#fff",
          borderBottom: "1px solid #f0f0f0",
          flexShrink: 0,
        }}
      >
        {/* 左侧：返回按钮 */}
        <button
          onClick={() => setLocation("/")}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            color: "#555",
            background: "none",
            border: "none",
            cursor: "pointer",
            borderRadius: 6,
            padding: 0,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        {/* 中间：标题 */}
        <span
          style={{
            flex: 1,
            textAlign: "center",
            fontSize: 15,
            fontWeight: 600,
            color: "#1a1a1a",
          }}
        >
          企伴
        </span>
        {/* 右侧占位 */}
        {isAuthenticated && user ? (
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: "#1a3a6b",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 700,
              flexShrink: 0,
              overflow: "hidden",
            }}
          >
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.name ?? ""}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              avatarText
            )}
          </div>
        ) : (
          <div style={{ width: 30 }} />
        )}
      </div>
      {/* 全屏 iframe */}
      <iframe
        ref={iframeRef}
        src="https://qiban.jiangyuchen.cn"
        style={{
          flex: 1,
          width: "100%",
          border: "none",
          display: "block",
        }}
        allow="fullscreen"
        title="企伴"
      />
    </div>
  );
}
