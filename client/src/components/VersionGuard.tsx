import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

/**
 * VersionGuard - 全局版本守卫
 *
 * 统一规则（与 HomeEntry 一致）：
 * 「应落地版本」= 用户手动选择的查看版本（sessionStorage `_viewing_version`，且在可切换范围内）
 *                 优先；否则用归属版本（auth.me.version）兜底。
 *
 * 解决场景：
 * iOS Safari / PWA「上滑挂起再打开」时，应用恢复的是上次离开的页面与内存状态，
 * 不会重新加载 index.html、也不会重新走根路由 "/" 的 HomeEntry 版本分发。
 *
 * 守卫策略：
 * - 监听页面「从后台恢复可见」(visibilitychange→visible) 与 bfcache 恢复 (pageshow.persisted)
 * - 恢复时按「应落地版本」判定：若当前路径不在该版本领地内、也不在公共页内，则跳回该版本主页
 *
 * 因「应落地版本」优先取用户手动选择，故用户主动切到的版本不会被守卫拽走，不会产生循环。
 */

// 公共页：不受版本守卫约束（任何版本用户都可正常停留）
// /ledger 账本子页面也不受约束：用户主动进入的账本子页面（如 crypto-prediction、finance 等）
// 不应被守卫在 visibilitychange/pageshow 时拽走，避免 HMR 热更新触发误跳转
const PUBLIC_PREFIXES = ["/login", "/privacy-policy", "/user-agreement", "/ledger"];

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

  // 版本列表（用于把 sessionStorage 里的查看版本 key 映射到其 landingPath）
  const { data: versions } = trpc.version.listVersions.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const versionsRef = useRef(versions);
  versionsRef.current = versions;

  useEffect(() => {
    let cancelled = false;

    const checkAndRedirect = async () => {
      try {
        const me: any = await utils.auth.me.fetch();
        if (cancelled || !me) return;
        const version = me.version as
          | { landingPath?: string; switchableVersionKeys?: string[] }
          | undefined;

        // 优先尊重用户在「版本切换器」里手动选择的查看版本：
        // 若用户主动切到了某版本（且该版本在其可切换范围内），则以该版本的领地为准，
        // 不再按归属版本强制拽回。这样「牙伴归属用户手动切到脉动版」不会被守卫拉回牙伴。
        let landingPath = version?.landingPath || "/";
        try {
          const viewing = sessionStorage.getItem("_viewing_version");
          const allowed = version?.switchableVersionKeys || [];
          if (viewing && allowed.includes(viewing)) {
            const v = (versionsRef.current || []).find(
              (x: any) => x.versionKey === viewing
            );
            if (v) landingPath = (v.landingPath as string) || "/";
          }
        } catch {}

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
