import { useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import Home from "./Home";

/**
 * HomeEntry - 首页入口路由组件
 *
 * 路由规则（§12.1 首页访问控制）：
 * - 已登录用户：正常显示主页（人脉首页）
 * - 未登录用户：自动跳转到 /login 登录页
 *
 * liulifan 打开网站时的初始跳转由 App.tsx 的 Router 组件处理（仅首次加载触发）
 */
export default function HomeEntry() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    // 等待认证状态加载完成
    if (isLoading) return;
    // 未登录：跳转到登录页
    if (!user) {
      setLocation("/login");
    }
  }, [user, isLoading, setLocation]);

  // 加载中或未登录时不渲染内容（避免闪烁）
  if (isLoading || !user) {
    return null;
  }

  return <Home />;
}
