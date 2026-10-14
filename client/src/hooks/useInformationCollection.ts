import { useEffect, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

type TrackedPage = {
  sectionKey: "site" | "ledger" | "other";
  ledgerId: number | null;
  pageKey: string | null;
  pageLabel: string | null;
  pagePath: string | null;
  detailed: boolean;
};

type CurrentUser = {
  id: number;
} | null | undefined;

const LEDGER_37_PAGE_LABELS: Array<{ suffix: string; key: string; label: string }> = [
  { suffix: "/deposit-manage", key: "ledger37_margin", label: "37号账本·保证金管理" },
  { suffix: "/aa-initial-balance", key: "ledger37_initial_margin", label: "37号账本·初始保证金" },
  { suffix: "/interest-manage", key: "ledger37_interest", label: "37号账本·利息管理" },
  { suffix: "/settings", key: "ledger37_settings", label: "37号账本·设置" },
];

const LEDGER_52_PAGE_LABELS: Array<{ suffix: string; key: string; label: string }> = [
  { suffix: "/t0-journal", key: "ledger52_t0_journal", label: "52号账本·T+0速记账本" },
  { suffix: "/funder-management", key: "ledger52_funder", label: "52号账本·融资复息订单管理" },
  { suffix: "/finance-management", key: "ledger52_finance", label: "52号账本·财务管理" },
  { suffix: "/finance-unified", key: "ledger52_finance_unified", label: "52号账本·财务汇总" },
  { suffix: "/settings", key: "ledger52_settings", label: "52号账本·设置" },
];

function parseLedgerPage(pathname: string, ledgerId: 37 | 52): TrackedPage {
  const definitions = ledgerId === 37 ? LEDGER_37_PAGE_LABELS : LEDGER_52_PAGE_LABELS;
  const exact = definitions.find((item) => pathname.endsWith(item.suffix));
  if (exact) {
    return {
      sectionKey: "ledger",
      ledgerId,
      pageKey: exact.key,
      pageLabel: exact.label,
      pagePath: pathname,
      detailed: true,
    };
  }

  const isOverview = pathname === `/ledger/${ledgerId}` || pathname === `/ledger/${ledgerId}/`;
  return {
    sectionKey: "ledger",
    ledgerId,
    pageKey: isOverview ? `ledger${ledgerId}_overview` : `ledger${ledgerId}_other`,
    pageLabel: isOverview ? `${ledgerId}号账本·概览` : `${ledgerId}号账本·其他页面`,
    pagePath: pathname,
    detailed: true,
  };
}

/**
 * 全站会话会被纳入“脉动网”总数；当前只有账本中心、37号和52号提供可展开的页面级明细。
 * 未纳入模块不会写入页面明细，因此商城等功能在信息采集页保持“暂未启用”。
 */
export function classifyInformationCollectionPath(location: string): TrackedPage | null {
  const pathname = location.split("?")[0] || "/";
  if (pathname === "/login" || pathname.startsWith("/admin") || pathname === "/privacy-policy" || pathname === "/user-agreement") {
    return null;
  }

  if (pathname === "/") {
    return {
      sectionKey: "site",
      ledgerId: null,
      pageKey: "site_home",
      pageLabel: "脉动网·首页",
      pagePath: pathname,
      detailed: true,
    };
  }

  if (pathname === "/ledger" || pathname === "/ledger/list" || pathname === "/ledger/guide") {
    return {
      sectionKey: "ledger",
      ledgerId: null,
      pageKey: "ledger_hub",
      pageLabel: "账本中心",
      pagePath: pathname,
      detailed: true,
    };
  }

  if (/^\/ledger\/37(?:\/|$)/.test(pathname)) return parseLedgerPage(pathname, 37);
  if (/^\/ledger\/52(?:\/|$)/.test(pathname)) return parseLedgerPage(pathname, 52);

  return {
    sectionKey: "other",
    ledgerId: null,
    pageKey: null,
    pageLabel: null,
    pagePath: null,
    detailed: false,
  };
}

function getSessionToken(userId: number) {
  const storageKey = `haoyouji-information-collection-session:${userId}`;
  const existing = sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const token = typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
  sessionStorage.setItem(storageKey, token);
  return token;
}

function getClientSummary() {
  const userAgent = navigator.userAgent || "";
  const lower = userAgent.toLowerCase();
  const isTablet = /ipad|tablet|playbook|silk/.test(lower) || (/android/.test(lower) && !/mobile/.test(lower));
  const deviceType = isTablet ? "tablet" : /mobile|iphone|ipod|android/.test(lower) ? "mobile" : "desktop";
  const osName = /iphone|ipad|ipod/.test(lower)
    ? "iOS"
    : /android/.test(lower)
      ? "Android"
      : /windows/.test(lower)
        ? "Windows"
        : /mac os|macintosh/.test(lower)
          ? "macOS"
          : /linux/.test(lower)
            ? "Linux"
            : "未知系统";
  const browserName = /micromessenger/.test(lower)
    ? "微信内置浏览器"
    : /edg\//.test(lower)
      ? "Edge"
      : /opr\//.test(lower)
        ? "Opera"
        : /firefox\//.test(lower)
          ? "Firefox"
          : /chrome\//.test(lower) && !/edg\//.test(lower)
            ? "Chrome"
            : /safari\//.test(lower) && !/chrome\//.test(lower)
              ? "Safari"
              : "未知浏览器";

  let timezone: string | null = null;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    timezone = null;
  }

  return {
    deviceType,
    osName,
    browserName,
    language: navigator.language || null,
    timezone,
    viewport: `${Math.max(0, window.innerWidth)}×${Math.max(0, window.innerHeight)}`,
  } as const;
}

export function InformationCollectionTracker({ user }: { user: CurrentUser }) {
  const [location] = useLocation();
  const trackedPage = useMemo(() => classifyInformationCollectionPath(location), [location]);
  const { mutate: recordVisit } = trpc.informationCollection.recordVisit.useMutation();
  const startedAtRef = useRef<number | null>(null);
  const sentSecondsRef = useRef(0);

  useEffect(() => {
    if (!user || !trackedPage || typeof window === "undefined") return;

    const sessionToken = getSessionToken(user.id);
    const client = getClientSummary();
    startedAtRef.current = Date.now();
    sentSecondsRef.current = 0;

    const send = (eventType: "page_view" | "heartbeat", force = false) => {
      if (document.visibilityState !== "visible" && !force) return;
      const startedAt = startedAtRef.current ?? Date.now();
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      const visibleSeconds = Math.max(0, elapsedSeconds - sentSecondsRef.current);
      if (eventType === "heartbeat" && visibleSeconds === 0 && !force) return;
      sentSecondsRef.current += visibleSeconds;

      recordVisit({
        sessionToken,
        sectionKey: trackedPage.sectionKey,
        ledgerId: trackedPage.ledgerId,
        pageKey: trackedPage.pageKey,
        pageLabel: trackedPage.pageLabel,
        pagePath: trackedPage.pagePath,
        detailed: trackedPage.detailed,
        eventType,
        visibleSeconds,
        ...client,
      });
    };

    send("page_view");
    const heartbeat = window.setInterval(() => send("heartbeat"), 60_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") send("heartbeat", true);
      if (document.visibilityState === "visible") startedAtRef.current = Date.now();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      send("heartbeat", true);
    };
  }, [location, recordVisit, trackedPage, user?.id]);

  return null;
}
