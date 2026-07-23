/**
 * QibanEntry - 企伴 SSO 入口页
 *
 * 从首页第三页（AI商城）点击"企伴"图标后进入此页。
 * 功能：生成 SSO 签名链接，跳转到企伴子项目（iframe嵌入方式）。
 *
 * 当前阶段：企伴子项目尚在脉动网内部开发，直接跳转到 /qiban 内部路由。
 * 将来独立部署后，改为 iframe 嵌入 qiban.jiangyuchen.cn。
 */
import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";

export default function QibanEntry() {
  const [, navigate] = useLocation();
  const { isAuthenticated, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    // 无论是否登录，都跳转到企伴首页（首页支持免登录查看）
    navigate("/qiban");
  }, [loading, isAuthenticated, navigate]);

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
            borderTopColor: "#1a56db",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
            margin: "0 auto 12px",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ fontSize: 14 }}>正在进入企伴平台...</p>
      </div>
    </div>
  );
}
