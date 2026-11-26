import { MibanImage } from "./MibanImage";
import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { mtrpc } from "./mibanTrpc";
import { toast } from "sonner";
import { Home, BookOpen, Clock, User, ChevronDown, LogOut, Settings, Briefcase, QrCode, X, Copy, Check, Wallet, Store } from "lucide-react";
import AnimatedWalletLogo from "@/components/AnimatedWalletLogo";
import { clearLedgerViewAsState } from "@/lib/authIdentity";
import { QRCodeSVG } from "qrcode.react";
import { useMibanWalletValue } from "./useMibanWalletValue";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

const SITE_URL = typeof window !== "undefined" ? window.location.origin : "";

// ─── 从头像菜单打开邀请二维码 ────────────────────────────────────────────────
function InviteQrDialog({ isAuthenticated, open, onClose }: { isAuthenticated: boolean; open: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const { data: inviteInfo } = mtrpc.agent.myInviteInfo.useQuery(
    undefined,
    { enabled: isAuthenticated && open }
  );

  const inviteCode = inviteInfo?.inviteCode ?? "";
  const inviteLink = inviteCode ? `${SITE_URL}/join?ref=${inviteCode}` : `${SITE_URL}/p/proj_hzxm2t/`;

  function copyLink() {
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (!open) return null;
  return (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
          role="dialog"
          aria-modal="true"
          aria-label="扫码邀请好友"
        >
          <div className="bg-white rounded-3xl px-6 py-7 w-72 flex flex-col items-center shadow-2xl relative">
            <button
              onClick={onClose}
              aria-label="关闭邀请弹窗"
              className="absolute top-4 right-4 w-7 h-7 rounded-full bg-black/5 flex items-center justify-center active:opacity-70"
            >
              <X className="w-4 h-4 text-black/40" />
            </button>

            <div className="text-[15px] font-bold text-gray-900 mb-1">邀请好友加入米伴</div>
            <div className="text-[12px] text-gray-400 mb-5">扫码注册，共享健康饮食</div>

            {/* 二维码 */}
            <div className="p-3 rounded-2xl border border-gray-100 bg-white shadow-sm mb-4">
              <QRCodeSVG
                value={inviteLink}
                size={180}
                level="M"
                fgColor="#1a1a1a"
                bgColor="#ffffff"
              />
            </div>

            {/* 邀请码 */}
            {inviteCode && (
              <div className="text-[12px] text-gray-400 mb-3">
                邀请码：<span className="font-bold text-gray-700">{inviteCode}</span>
              </div>
            )}

            {/* 复制链接按钮 */}
            <button
              onClick={copyLink}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-semibold active:opacity-80 transition-all"
              style={{ background: copied ? "#F0FAF4" : "#FF6900", color: copied ? "#2D7D46" : "#fff" }}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "已复制链接" : "复制邀请链接"}
            </button>
          </div>
        </div>
  );
}

const tabItems = [
  { href: "/p/proj_hzxm2t/", label: "首页", icon: Home },
  { href: "/p/proj_hzxm2t/rice", label: "百科", icon: BookOpen },
  { href: "/p/proj_hzxm2t/limited", label: "限时", icon: Clock },
  { href: "/p/proj_hzxm2t/my-orders", label: "我的", icon: User },
];

const MIBAN_LOGO = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/miban/rice_logo_final.webp";

// 版本图标映射
const VERSION_ICONS: Record<string, string> = {
  maidong: "/maidong-switch-icon.webp",
  yaban: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/icons/yaban/yaban_logo_bottomnav.webp",
  proj_hzxm2t: MIBAN_LOGO,
};

// ─── Logo + 版本切换 ─────────────────────────────────────────────────────────
function LogoWithVersionSwitch() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const ref = useRef<HTMLDivElement>(null);

  const { data: user } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const { data: versions } = trpc.version.listVersions.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    enabled: !!user,
  });

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const version = (user as any)?.version as
    | { versionKey?: string; switchableVersionKeys?: string[] }
    | undefined;

  const openSet = new Set<string>(version?.switchableVersionKeys || []);
  if (version?.versionKey) openSet.add(version.versionKey);
  openSet.add("proj_hzxm2t");

  const canSwitch = openSet.size >= 2;

  const options = canSwitch
    ? (versions || [])
        .filter((v: any) => openSet.has(v.versionKey) && v.versionKey !== "proj_hzxm2t")
        .map((v: any) => ({
          versionKey: v.versionKey as string,
          name: v.name as string,
          landingPath: (v.landingPath as string) || "/",
        }))
    : [];

  const handleSwitch = (target: { versionKey: string; landingPath: string }) => {
    setOpen(false);
    try {
      sessionStorage.setItem("_viewing_version", target.versionKey);
    } catch {}
    setLocation(target.landingPath || "/");
  };

  return (
    <div ref={ref} className="relative flex items-center">
      <button
        type="button"
        onClick={() => canSwitch && options.length > 0 ? setOpen(v => !v) : undefined}
        className={`flex items-center gap-2 ${canSwitch && options.length > 0 ? "active:opacity-70" : ""}`}
      >
        <MibanImage variant="icon" priority
          src={MIBAN_LOGO}
          alt="米伴"
          className="w-7 h-7 rounded-md object-cover"
        />
        <span className="text-[16px] font-bold text-black tracking-tight">
          米伴
        </span>
        {canSwitch && options.length > 0 && (
          <ChevronDown
            className={`w-3 h-3 text-black/40 transition-transform ${open ? "rotate-180" : ""}`}
          />
        )}
      </button>

      {/* 版本切换下拉菜单 */}
      {open && options.length > 0 && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-10 w-44 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50">
            <div className="px-3 py-2 text-xs text-gray-400 border-b border-gray-50">
              切换版本
            </div>
            <div className="w-full text-left px-3 py-2.5 text-sm flex items-center gap-2.5 text-[#FF6900] font-semibold bg-orange-50/50">
              <MibanImage variant="icon" priority src={MIBAN_LOGO} alt="" width={24} height={24} className="rounded-full object-cover" style={{ width: 24, height: 24 }} />
              <span className="flex-1">米伴</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            {options.map((opt) => (
              <button
                key={opt.versionKey}
                type="button"
                onClick={() => handleSwitch(opt)}
                className="w-full text-left px-3 py-2.5 text-sm flex items-center gap-2.5 hover:bg-gray-50 text-gray-700"
              >
                {VERSION_ICONS[opt.versionKey] ? (
                  <MibanImage variant="icon" priority
                    src={VERSION_ICONS[opt.versionKey]}
                    alt=""
                    width={24}
                    height={24}
                    className="rounded-full object-cover"
                    style={{ width: 24, height: 24 }}
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-500">
                    {opt.name.charAt(0)}
                  </div>
                )}
                <span className="flex-1">{opt.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── 用户菜单（角色感知） ─────────────────────────────────────────────────────
function UserMenu({ user, isAuthenticated, onLogout, supplierAdmin, hasSupplierAccess }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user: any;
  isAuthenticated: boolean;
  onLogout: () => void;
  supplierAdmin: boolean;
  hasSupplierAccess: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!isAuthenticated) {
    return (
      <button
        onClick={() => window.location.href = "/login"}
        className="w-8 h-8 rounded-full border border-black/20 flex items-center justify-center active:opacity-70"
      >
        <User className="w-4 h-4 text-black/50" />
      </button>
    );
  }

  const username = (user as any)?.username ?? "";
  const mibanRole = (user as any)?.mibanRole ?? "baby";
  const mibanRankIndex = (user as any)?.mibanRankIndex ?? 1;
  const isMibanAdmin = username === "jiang";
  const isMibanAgent = mibanRole === "parent";
  const initial = (user?.name ?? "我").charAt(0).toUpperCase();

  // 米伴职级名称映射
  const RANK_NAMES: Record<number, string> = { 1: "米农", 2: "米商", 3: "米行", 4: "米庄", 5: "米王" };
  const rankName = RANK_NAMES[mibanRankIndex] ?? "米农";

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen(v => !v)}
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        title="点击头像打开用户菜单"
        className="flex h-8 w-8 items-center justify-center active:opacity-70"
      >
        <Avatar className="h-8 w-8">
          <AvatarImage src={user?.avatar || undefined} alt={`${user?.name || user?.username || "成员"}的头像`} className="object-cover" />
          <AvatarFallback className="bg-gray-100 text-gray-600 text-[12px] font-semibold">{initial}</AvatarFallback>
        </Avatar>
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-44 bg-white border border-black/10 rounded-2xl shadow-xl overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-black/5">
            <p className="text-sm font-semibold text-black truncate">{user?.name ?? "用户"}</p>
            <p className="text-xs text-black/40 mt-0.5">
              {isMibanAdmin ? "管理员" : rankName}
            </p>
          </div>

          {hasSupplierAccess && (
            <Link href="/p/proj_hzxm2t/supplier" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-3 text-sm text-black/70 hover:bg-black/5 transition-colors">
              <Store className="w-4 h-4 text-[#FF6900]" />
              供货商中心
            </Link>
          )}
          {supplierAdmin && (
            <Link href="/p/proj_hzxm2t/admin?tab=suppliers" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-3 text-sm text-black/70 hover:bg-black/5 transition-colors">
              <Settings className="w-4 h-4 text-[#FF6900]" />
              供货商管理
            </Link>
          )}

          {/* 米商入口（仅普通米商显示） */}
          {isMibanAgent && !isMibanAdmin && (
            <Link
              href="/p/proj_hzxm2t/agent"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-3 text-sm text-black/70 hover:bg-black/5 transition-colors"
            >
              <Briefcase className="w-4 h-4 text-blue-500" />
              米商中心
            </Link>
          )}

          {/* 管理员入口（管理员显示，包含订单/米库/用户/团队等全部功能） */}
          {isMibanAdmin && (
            <>
              <Link
                href="/p/proj_hzxm2t/admin"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-3 text-sm text-black/70 hover:bg-black/5 transition-colors"
              >
                <Settings className="w-4 h-4 text-[#FF6900]" />
                管理后台
              </Link>
              <Link
                href="/ledger/52/af-recharge-manage?tab=adjust"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-3 text-sm text-black/70 hover:bg-black/5 transition-colors"
              >
                <Wallet className="w-4 h-4 text-[#FF6900]" />
                钱包充值
              </Link>
            </>
          )}

          <button
            type="button"
            onClick={() => { setOpen(false); setInviteOpen(true); }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-black/70 hover:bg-black/5 transition-colors"
          >
            <QrCode className="w-4 h-4 text-[#FF6900]" />
            扫码邀请
          </button>
          <button
            onClick={() => { setOpen(false); onLogout(); }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-500 hover:bg-red-50 transition-colors border-t border-black/5"
          >
            <LogOut className="w-4 h-4" />
            退出登录
          </button>
        </div>
      )}
      <InviteQrDialog isAuthenticated={isAuthenticated} open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </div>
  );
}

function PersonalWalletEntry() {
  const { value, isLoading, error, isAuthenticated } = useMibanWalletValue();
  const walletPath = "/p/proj_hzxm2t/wallet";
  const amount = !isAuthenticated ? "登录查看" : error ? "暂不可用" : isLoading || !value ? "加载中…" : value.availableCny == null ? "估值待更新" : `¥${value.availableCny.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const amountRef = useRef<HTMLSpanElement>(null);

  // 先使用完整金额的自然宽度；仅在顶栏剩余空间不足时缩小字号，不换行或省略。
  useLayoutEffect(() => {
    const element = amountRef.current;
    if (!element) return;
    let active = true;
    const fitAmount = () => {
      if (!active) return;
      element.style.fontSize = "12px";
      const availableWidth = element.getBoundingClientRect().width;
      if (availableWidth <= 0) return;
      const range = document.createRange();
      range.selectNodeContents(element);
      const naturalWidth = range.getBoundingClientRect().width;
      if (naturalWidth > availableWidth) {
        element.style.fontSize = `${12 * Math.max(0, availableWidth - 0.5) / naturalWidth}px`;
      }
    };
    fitAmount();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fitAmount);
    observer?.observe(element);
    window.addEventListener("resize", fitAmount);
    document.fonts?.ready.then(fitAmount);
    document.fonts?.addEventListener("loadingdone", fitAmount);
    return () => {
      active = false;
      observer?.disconnect();
      window.removeEventListener("resize", fitAmount);
      document.fonts?.removeEventListener("loadingdone", fitAmount);
    };
  }, [amount]);

  return (
    <Link
      href={isAuthenticated ? walletPath : `/login?from=${encodeURIComponent(walletPath)}`}
      onClick={() => clearLedgerViewAsState()}
      className="flex h-9 min-w-0 items-center justify-end gap-0.5 active:opacity-70"
      aria-label="钱包可用余额"
      title="全部资产剔除冻结后的可用余额"
    >
      <span className="h-8 w-7 shrink-0"><AnimatedWalletLogo /></span>
      <span className="min-w-0 text-right">
        <span className="block whitespace-nowrap text-[9px] leading-3 text-gray-400">可用余额</span>
        <span ref={amountRef} className="block whitespace-nowrap text-[12px] font-bold leading-[14px] text-[#B08B32] tabular-nums" data-header-wallet-balance>{amount}</span>
      </span>
    </Link>
  );
}

export default function NavBar() {
  const [location] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const identity = trpc.auth.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  const validIdentity = identity.isSuccess && !!identity.data?.id && !identity.error;
  const supplierAccess = trpc.supplier.access.useQuery(undefined, {
    enabled: validIdentity,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const supplierAdmin = validIdentity && !supplierAccess.error && supplierAccess.data?.isAdmin === true;
  const hasSupplierAccess = validIdentity && !supplierAccess.error && (supplierAdmin || (supplierAccess.data?.suppliers.length ?? 0) > 0);
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => { window.location.href = "/p/proj_hzxm2t/"; },
    onError: () => toast.error("退出失败，请重试"),
  });

  const isTabActive = (href: string) => {
    // 首页精确匹配：必须是完全相等，防止其他页面路径以首页为前缀导致常亮
    if (href === "/p/proj_hzxm2t/") return location === "/p/proj_hzxm2t/" || location === "/p/proj_hzxm2t";
    if (href === "/") return location === "/";
    return location.startsWith(href);
  };

  return (
    <>
      {/* ─── 固定顶部栏 52px ─────────────────────────────────────────── */}
      <header
        className="fixed top-0 left-0 right-0 z-50 bg-white"
        style={{ borderBottom: "1px solid #E8E8E8", height: "52px" }}
      >
        <div className="max-w-[480px] mx-auto flex items-center justify-between px-4 h-full gap-1 max-[350px]:px-3">
          {/* Logo + 版本切换 */}
          <div className="flex shrink-0 items-center">
            <LogoWithVersionSwitch />
          </div>

          {/* 所有米伴页面统一显示钱包与头像，内部仍分别打开钱包和用户菜单 */}
          <div
            className="flex h-10 min-w-0 items-center gap-1 rounded-xl border border-gray-200 bg-white pl-1 pr-0.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
            data-wallet-avatar-group="true"
          >
            <PersonalWalletEntry />
            <span aria-hidden="true" className="h-5 w-px shrink-0 bg-orange-100" />
            <UserMenu user={user} isAuthenticated={isAuthenticated} supplierAdmin={supplierAdmin} hasSupplierAccess={hasSupplierAccess} onLogout={() => logout.mutate()} />
          </div>
        </div>
      </header>

      {/* ─── 固定底部Tab导航 56px ────────────────────────────────────── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 bg-white"
        style={{
          borderTop: "1px solid #E8E8E8",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div className="max-w-[480px] mx-auto flex items-center h-16">
          {tabItems.map((tab) => {
            const active = isTabActive(tab.href);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="flex-1 flex flex-col items-center justify-center gap-1 h-full active:opacity-70"
              >
                <Icon
                  className="w-6 h-6"
                  style={{ color: active ? "#FF6900" : "#888888" }}
                  strokeWidth={active ? 2.5 : 1.8}
                />
                <span
                  className="text-[11px] font-medium"
                  style={{ color: active ? "#FF6900" : "#888888" }}
                >
                  {tab.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
