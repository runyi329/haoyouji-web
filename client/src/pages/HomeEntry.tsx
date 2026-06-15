import { useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import Home from "./Home";

/**
 * HomeEntry - 首页入口路由组件
 *
 * 路由规则（§12.1 首页访问控制 + 多版本分发）：
 * - 未登录用户：自动跳转到 /login 登录页
 * - 已登录用户：读取其「生效版本」(auth.me.version)
 *     - 若版本落地地址为根首页（脉动版 "/"）：正常渲染人脉首页 Home
 *     - 若版本落地地址为其它子页面（如牙伴版 "/yaban"）：重定向到该地址
 *
 * 版本由后端按「最高优先追溯」沿推荐链计算，前端只负责按 landingPath 分发。
 */
export default function HomeEntry() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const version = (user as any)?.version as
    | { versionKey?: string; landingPath?: string }
    | undefined;
  const landingPath = version?.landingPath || "/";

  useEffect(() => {
    // 等待认证状态加载完成
    if (isLoading) return;
    // 未登录：跳转到登录页
    if (!user) {
      setLocation("/login");
      return;
    }
    // 已登录：按版本落地地址分发（非根首页则重定向）
    if (landingPath && landingPath !== "/") {
      setLocation(landingPath);
    }
  }, [user, isLoading, setLocation, landingPath]);

  // 加载中 / 未登录 / 即将重定向到其它版本落地页时，不渲染人脉首页（避免闪烁）
  if (isLoading || !user) {
    return null;
  }
  if (landingPath && landingPath !== "/") {
    return null;
  }

  return <Home />;
}
