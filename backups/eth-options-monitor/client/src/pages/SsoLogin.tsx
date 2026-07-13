/**
 * 脉动网 SSO 单点登录中转页面
 *
 * HMAC 方案说明：
 * - 脉动网主站直接生成签名 URL，跳转到 /api/auth/external-login（GET 请求）
 * - 后端验证签名后自动重定向到首页，用户无感知
 * - 本页面作为降级入口：当用户直接访问 /sso 时显示提示
 *
 * 正常 SSO 流程（用户不会看到本页面）：
 *   脉动网 → GET /api/auth/external-login?uid=xxx&name=xxx&ts=xxx&sign=xxx → 自动跳转 /
 */
import { useEffect } from "react";

export default function SsoLogin() {
  useEffect(() => {
    // 如果用户直接访问 /sso，3 秒后跳转首页
    const timer = setTimeout(() => {
      window.location.replace("/");
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "#0D1117" }}
    >
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-sky-400 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-400 text-sm font-sans">正在跳转...</p>
        <p className="text-gray-600 text-xs font-sans">
          请从脉动网入口进入，3 秒后自动跳转首页
        </p>
      </div>
    </div>
  );
}
