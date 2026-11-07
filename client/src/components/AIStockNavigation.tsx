import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { UserAvatar } from "@/components/UserAvatar";
import AnimatedWalletLogo from "@/components/AnimatedWalletLogo";
import { useMibanWalletValue } from "@/pages/miban/useMibanWalletValue";
import { clearLedgerViewAsState } from "@/lib/authIdentity";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import AIStockHeaderSearch from "@/components/AIStockHeaderSearch";
import { AI_STOCK_THEME } from "@/lib/ai-stock-theme";

type AIStockNavigationProps = {
  active: "overview" | "stocks" | "compare";
  ledgerId: number | string;
  homeMode?: boolean;
  onBack: () => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
};

const NAV_ITEMS = [
  { key: "overview", label: "总览" },
  { key: "compare", label: "数据" },
] as const;

// 仅在本次AI访问期间保留已展开状态；不写入持久存储，也不跨用户复用余额。
let walletRevealSession: {
  scope: string;
  userId: number;
  value: number;
  revealed: boolean;
} | null = null;

if (typeof window !== "undefined") {
  const resetAfterLeavingAI = () => {
    const path = window.location.pathname;
    const insideAI = /^\/ledger\/[^/]+\/(ai-database|stock-lifecycle|stock-compare)\/?$/.test(path)
      || /^\/stock-tracker(?:\/(stock-lifecycle|stock-compare))?\/?$/.test(path)
      || /^\/stock\/[^/]+\/?$/.test(path);
    if (!insideAI) walletRevealSession = null;
  };
  // Wouter在SPA导航时发送对应事件，个股详情内离开AI也会清理。
  for (const event of ["pushState", "replaceState", "popstate"]) {
    window.addEventListener(event, resetAfterLeavingAI);
  }
}

export default function AIStockNavigation({
  active,
  ledgerId,
  homeMode = false,
  onBack,
  onRefresh,
  isRefreshing = false,
  searchValue,
  onSearchChange,
}: AIStockNavigationProps) {
  const { user, loading } = useAuth();
  const wallet = useMibanWalletValue();
  const displayName = user?.nickname?.trim() || user?.name?.trim() || user?.username?.trim() || "";
  const base = homeMode ? "/stock-tracker" : `/ledger/${ledgerId}`;
  const paths = {
    overview: homeMode ? base : `${base}/ai-database`,
    stocks: `${base}/stock-compare?view=stocks`,
    compare: `${base}/stock-compare?view=stocks&market=all`,
  };
  const walletPath = homeMode ? "/wallet" : `/wallet?fromLedger=${ledgerId}&account=CNY`;
  const walletHref = user ? walletPath : `/login?from=${encodeURIComponent(walletPath)}`;
  const walletScope = homeMode ? "home" : `ledger:${ledgerId}`;
  const [lastValue, setLastValue] = useState<{ userId: number; value: number } | null>(() =>
    walletRevealSession?.scope === walletScope
      ? { userId: walletRevealSession.userId, value: walletRevealSession.value } : null);
  const liveValue = wallet.error ? null : wallet.value?.availableCny;
  const usableLiveValue = typeof liveValue === "number" && Number.isFinite(liveValue) ? liveValue : null;
  useEffect(() => {
    if (user && usableLiveValue !== null) {
      setLastValue(previous => previous?.userId === user.id && previous.value === usableLiveValue
        ? previous : { userId: user.id, value: usableLiveValue });
    }
    if (!loading && !user) walletRevealSession = null;
    if (user && usableLiveValue !== null) {
      const sameUser = walletRevealSession?.scope === walletScope && walletRevealSession.userId === user.id;
      walletRevealSession = {
        scope: walletScope,
        userId: user.id,
        value: usableLiveValue,
        revealed: sameUser && Boolean(walletRevealSession?.revealed),
      };
    }
  }, [user?.id, usableLiveValue, loading, walletScope]);
  // 后台读取时保留同一用户最近成功值；身份改变后绝不沿用上一位用户的余额。
  const value = user ? usableLiveValue ?? (lastValue?.userId === user.id ? lastValue.value : null) : null;
  const amount = value === null ? "" : `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const contentReady = Boolean(user && displayName && amount);
  const infoRef = useRef<HTMLDivElement>(null);
  const [infoWidth, setInfoWidth] = useState(0);
  const [revealedUserId, setRevealedUserId] = useState<number | null>(() =>
    walletRevealSession?.scope === walletScope && walletRevealSession.revealed ? walletRevealSession.userId : null);
  const [skipRevealAnimation, setSkipRevealAnimation] = useState(() =>
    walletRevealSession?.scope === walletScope && Boolean(walletRevealSession.revealed));
  const expanded = contentReady && revealedUserId === user?.id;
  const [actionsOpen, setActionsOpen] = useState(false);
  useEffect(() => setActionsOpen(false), [user?.id, active]);
  useLayoutEffect(() => {
    const element = infoRef.current;
    if (!element) return;
    const measure = () => setInfoWidth(Math.ceil(element.getBoundingClientRect().width));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [displayName, amount]);
  useEffect(() => {
    if (!contentReady || !user) return;
    if (walletRevealSession?.scope === walletScope && walletRevealSession.userId === user.id && walletRevealSession.revealed) {
      setSkipRevealAnimation(true);
      setRevealedUserId(user.id);
      return;
    }
    setSkipRevealAnimation(false);
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        if (value === null) return;
        walletRevealSession = { scope: walletScope, userId: user.id, value, revealed: true };
        setRevealedUserId(user.id);
      });
    });
    return () => { cancelAnimationFrame(firstFrame); cancelAnimationFrame(secondFrame); };
  }, [contentReady, user?.id, walletScope]);

  return (
    <div className="flex-shrink-0">
      <header className="flex items-center gap-2 px-3 py-3 text-white" style={{ background: AI_STOCK_THEME.headerGradient }}>
        <div
          data-wallet-avatar-group="true"
          className="inline-flex h-[52px] w-max max-w-[55%] min-w-0 shrink-0 items-center rounded-md border border-[#DCE7F0] bg-white pl-2 pr-2.5 shadow-[0_2px_7px_rgba(10,31,49,0.12)]"
        >
          <Popover open={actionsOpen} onOpenChange={setActionsOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={displayName ? `打开${displayName}的账户操作` : "打开账户操作"}
                title="点击头像：刷新或返回"
                className="flex shrink-0 items-center justify-center rounded-full active:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#087987]"
              >
                <UserAvatar
                  key={user?.id ?? "anonymous"}
                  username={user?.username}
                  nickname={displayName || null}
                  avatar={user?.avatar}
                  size="md"
                  className="shrink-0"
                />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" sideOffset={8} className="w-32 rounded-xl border-[#DCE7F0] bg-white p-1 text-[#142A3F] shadow-lg">
              <button
                type="button"
                onClick={() => { setActionsOpen(false); onRefresh(); }}
                disabled={isRefreshing}
                className="flex min-h-10 w-full items-center rounded-lg px-3 text-sm hover:bg-[#EAF2F7] disabled:opacity-50"
              >
                <span>刷新</span>
              </button>
              <button
                type="button"
                onClick={() => { setActionsOpen(false); onBack(); }}
                className="flex min-h-10 w-full items-center rounded-lg px-3 text-sm hover:bg-[#EAF2F7]"
              >
                <span>返回</span>
              </button>
            </PopoverContent>
          </Popover>
          <a
            href={walletHref}
            onClick={event => { if (loading) event.preventDefault(); else clearLedgerViewAsState(); }}
            title={wallet.error ? "钱包暂时未更新，保留最近成功显示；点击查看钱包" : "我的钱包：全部资产剔除冻结后的可用余额"}
            aria-label={displayName ? `${displayName}的钱包余额` : "用户钱包"}
            tabIndex={expanded ? 0 : -1}
            className="min-w-0 overflow-hidden motion-reduce:transition-none"
            aria-hidden={!expanded}
            style={{ width: expanded ? infoWidth : 0, opacity: expanded ? 1 : 0, transition: skipRevealAnimation ? "none" : "width 0.85s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease" }}
          >
            <div ref={infoRef} className="flex w-max items-center gap-2 pl-2 text-left">
              <span aria-hidden="true" className="h-[26px] w-px shrink-0 bg-[#DCE7F0]" />
              <div className="grid grid-cols-[8px_max-content] gap-x-0.5 gap-y-0.5">
                <div className="col-span-2 col-start-1 row-start-1 text-[13px] font-semibold leading-4 text-[#142A3F]" title={displayName}>{displayName}</div>
                {expanded && <span className="col-start-1 row-start-2 block h-5 w-5 self-end origin-bottom -translate-x-[11px] -translate-y-[3px]"><AnimatedWalletLogo /></span>}
                <span className="col-start-2 row-start-2 flex h-5 items-center text-[13px] font-bold leading-none text-[#087987] tabular-nums" data-header-wallet-balance title={amount}>
                  <span>{amount}</span>
                </span>
              </div>
            </div>
          </a>
        </div>
        <AIStockHeaderSearch stocksPath={paths.stocks} value={searchValue} onChange={onSearchChange} />
      </header>
      <nav
        aria-label="A股AI导航"
        className="px-3 py-2"
        style={{ background: AI_STOCK_THEME.background, borderBottom: `1px solid ${AI_STOCK_THEME.border}` }}
      >
        <div className="grid grid-cols-2 gap-1 rounded-xl p-1" style={{ background: AI_STOCK_THEME.surface }}>
          {NAV_ITEMS.map(item => {
            const isActive = (active === "stocks" ? "compare" : active) === item.key;
            return (
              <Link
                key={item.key}
                href={paths[item.key]}
                aria-current={isActive ? "page" : undefined}
                className="flex min-w-0 items-center justify-center rounded-lg py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{
                  background: isActive ? AI_STOCK_THEME.accentGradient : "transparent",
                  color: isActive ? "#FFFFFF" : AI_STOCK_THEME.muted,
                  outlineColor: AI_STOCK_THEME.accent,
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
