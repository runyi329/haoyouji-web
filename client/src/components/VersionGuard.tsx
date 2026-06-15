import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

/**
 * VersionGuard - 全局版本守卫
 *
 * 解决场景：
 * iOS Safari / PWA「上滑挂起再打开」时，应用恢复的是上次离开的页面与内存状态，
 * 不会重新加载 index.html、也不会重新走根路由 "/" 的 HomeEntry 版本分发。
 * 因此当管理员把用户切换到非脉动版（如牙伴版）后，用户挂起恢复时仍停在旧版本页面。
 *
 * 守卫策略：
 * - 监听页面「从后台恢复可见」(visibilitychange→visible) 与 bfcache 恢复 (pageshow.persisted)
 * - 恢复时重新拉取 auth.me 的生效版本
 * - 若该版本为「非脉动版」（landingPath 不是 "/"，领地前缀如 /yaban），
 *   且当前路径不在该版本领地内、也不在公共页（登录/协议）内，则跳转到该版本主页
 *
 * 只在「跨版本越界」时纠正，不影响用户在本版本领地内的正常浏览。
 */

// 公共页：不受版本守卫约束（任何版本用户都可正常停留）
const PUBLIC_PREFIXES = ["/login", "/privacy-policy", "/user-agreement"];

// 由 landingPath 计算版本「领地前缀」与「恢复时落地主页」
// 例如 landingPath="/yaban/intro" → 领地前缀 "/yaban"，主页 "/yaban"（跳主页而非 intro 开机页）
function deriveVersionArea(landingPath: string): { areaPrefix: string; homePath: string } | null {
  if (!landingPath || landingPath === "/") return null;
  const seg = landingPath.split("/").filter(Boolean)[0];
  if (!seg) return null;
  return { areaPrefix: `/${seg}`, homePath: `/${seg}` };
}

export default function VersionGuard() {
  const [location, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const locationRef = useRef(location);
  locationRef.current = location;

  useEffect(() => {
    let cancelled = false;

    const checkAndRedirect = async () => {
      try {
        const me: any = await utils.auth.me.fetch();
        if (cancelled || !me) return;
        const version = me.version as
          | { landingPath?: string }
          | undefined;
        const landingPath = version?.landingPath || "/";
        const area = deriveVersionArea(landingPath);
        // 脉动版（landingPath="/"）不约束：人脉首页本就是默认领地
        if (!area) return;

        const cur = locationRef.current || "/";
        // 已在本版本领地内：不动
        if (cur === area.areaPrefix || cur.startsWith(area.areaPrefix + "/")) return;
        // 公共页：不强制跳转
        if (PUBLIC_PREFIXES.some((p) => cur === p || cur.startsWith(p + "/"))) return;
        // 越界：拽回本版本主页
        setLocation(area.homePath);
      } catch {
        // 拉取失败（如未登录）时不处理
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") checkAndRedirect();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      // persisted=true 表示从 bfcache 恢复
      if (e.persisted) checkAndRedirect();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [utils, setLocation]);

  return null;
}
