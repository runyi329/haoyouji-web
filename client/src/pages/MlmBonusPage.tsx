import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";

export default function MlmBonusPage() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [, setLocation] = useLocation();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeSrc, setIframeSrc] = useState<string>("");
  const [error, setError] = useState<string>("");

  const mlmSsoLink = trpc.auth.mlmSsoLink.useMutation({
    onSuccess: (data) => {
      setIframeSrc(data.url);
    },
    onError: (err) => {
      setError(err.message);
      // 降级：直接跳转到奖金平台首页（未登录状态）
      setIframeSrc("https://bonus.jiangyuchen.cn");
    },
  });

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      // 未登录：直接显示奖金平台（未登录状态）
      setIframeSrc("https://bonus.jiangyuchen.cn");
      return;
    }
    // 已登录：获取SSO签名链接
    mlmSsoLink.mutate();
  }, [isAuthenticated, isLoading]);

  if (isLoading || (!iframeSrc && !error)) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fff",
          zIndex: 9999,
        }}
      >
        <div style={{ textAlign: "center", color: "#666" }}>
          <div
            style={{
              width: 32,
              height: 32,
              border: "3px solid #e5e7eb",
              borderTopColor: "#3b82f6",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
              margin: "0 auto 12px",
            }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ fontSize: 14 }}>正在进入奖金制度研究平台...</p>
        </div>
      </div>
    );
  }

  // 取用户名首字作为头像文字
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
        {/* 左侧：仅箭头返回按钮 */}
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
          奖金制度研究平台
        </span>

        {/* 右侧：用户头像（仅展示，无操作） */}
        {isAuthenticated && user ? (
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: "#D32F2F",
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
                alt={user.name}
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
        src={iframeSrc}
        style={{
          flex: 1,
          width: "100%",
          border: "none",
          display: "block",
        }}
        allow="fullscreen"
        title="奖金制度研究平台"
      />
    </div>
  );
}
