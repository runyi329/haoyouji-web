import { useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import Home from "./Home";

/**
 * HomeEntry - 首页入口路由组件
 *
 * 路由规则（§12.1 首页访问控制 + 多版本分发）：
 * - 未登录用户：自动跳转到 /login 登录页
 * - 已登录用户：确定其「应落地版本」的 landingPath
 *     - 若为根首页（脉动版 "/"）：正常渲染人脉首页 Home
 *     - 若为其它子页面（如牙伴版 "/yaban/intro"）：重定向到该地址
 *
 * 「应落地版本」的确定优先级：
 *   1) 用户在「版本切换器」里手动选择的查看版本（sessionStorage `_viewing_version`，
 *      且该版本在其可切换范围内）—— 尊重用户本会话内的主动选择；
 *   2) 否则用归属版本（auth.me.version，由后端按推荐链计算）兜底。
 *
 * 这样「牙伴归属用户手动切到脉动版」进入根路由 "/" 时不会被又跳回牙伴开机画面。
 */
export default function HomeEntry() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const { data: versions } = trpc.version.listVersions.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const version = (user as any)?.version as
    | { versionKey?: string; landingPath?: string; switchableVersionKeys?: string[] }
    | undefined;

  // 计算「应落地版本」的 landingPath：优先用户手动选择的查看版本，否则归属版本
  let landingPath = version?.landingPath || "/";
  try {
    const viewing = sessionStorage.getItem("_viewing_version");
    const allowed = version?.switchableVersionKeys || [];
    if (viewing && allowed.includes(viewing)) {
      const v = (versions || []).find((x: any) => x.versionKey === viewing);
      if (v) landingPath = (v.landingPath as string) || "/";
    }
  } catch {}

  useEffect(() => {
    // 等待认证状态加载完成
    if (isLoading) return;
    // 未登录：跳转到登录页
    if (!user) {
      setLocation("/login");
      return;
    }
    // 已登录：按应落地版本分发（非根首页则重定向）
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
