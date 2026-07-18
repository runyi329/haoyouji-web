import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { mtrpc } from "./mibanTrpc";
import { saveToken } from "@/lib/tokenStorage";
import { toast } from "sonner";
import { Home, BookOpen, FlaskConical, User, ChevronDown, LogOut, Settings, Briefcase } from "lucide-react";
import CartDrawer from "./CartDrawer";

const tabItems = [
  { href: "/p/proj_hzxm2t/", label: "首页", icon: Home },
  { href: "/p/proj_hzxm2t/rice", label: "百科", icon: BookOpen },
  { href: "/p/proj_hzxm2t/diy", label: "配米", icon: FlaskConical },
  { href: "/p/proj_hzxm2t/my-orders", label: "我的", icon: User },
];

const MIBAN_LOGO = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/miban/rice_logo_final.webp";

// 版本图标映射
const VERSION_ICONS: Record<string, string> = {
  maidong: "/maidong-switch-icon.webp",
  yaban: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/icons/yaban/yaban_logo_bottomnav.webp",
  proj_hzxm2t: MIBAN_LOGO,
};

// 三个测试账号的颜色
const IDENTITY_COLORS: Record<string, string> = {
  jiang: "#FF6900",
  hyy329: "#22C55E",
  yunting: "#3B82F6",
};
const ALLOWED_IDENTITIES = ["jiang", "hyy329", "yunting"];

// ─── 身份切换器（Logo 右边，仅三个测试账号可见）────────────────────────────────
function IdentitySwitcherNav() {
  const { user } = useAuth();
  const currentUsername = (user as any)?.username as string | undefined;
  const isAllowed = ALLOWED_IDENTITIES.includes(currentUsername ?? "");

  // 三个账号都用 fullSwitchList + switchToAny，避免权限问题
  const { data: rawList } = (mtrpc as any).mibanImpersonate.fullSwitchList.useQuery(
    undefined,
    { enabled: isAllowed }
  );
  const list: any[] = rawList ?? [];
  const switchToAny = (mtrpc as any).mibanImpersonate.switchToAny.useMutation();
  const [switching, setSwitching] = useState<string | null>(null);

  if (!isAllowed) return null;

  async function handleSwitch(username: string) {
    if (switching || username === currentUsername) return;
    setSwitching(username);
    try {
      const res = await switchToAny.mutateAsync({ username });
      await saveToken(res.token);
      toast.success(`已切换到 ${res.name || username}`);
      setTimeout(() => window.location.reload(), 300);
    } catch (e: any) {
      toast.error(e?.message || "切换失败");
      setSwitching(null);
    }
  }

  return (
    <div className="flex items-center gap-1.5 ml-2">
      {list.map((acct: any) => {
        const isCurrent = acct.username === currentUsername;
        const color = IDENTITY_COLORS[acct.username] ?? "#999";
        return (
          <button
            key={acct.username}
            onClick={() => handleSwitch(acct.username)}
            disabled={isCurrent || !!switching}
            title={`切换到 ${acct.label}（${acct.username}）`}
            style={{ opacity: isCurrent ? 1 : 0.4 }}
            className="transition-opacity active:scale-95"
          >
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
              style={{
                background: color,
                outline: isCurrent ? `2px solid ${color}` : "none",
                outlineOffset: "1.5px",
              }}
            >
              {switching === acct.username ? "…" : (acct.name || acct.username).slice(0, 1)}
            </div>
          </button>
        );
      })}
    </div>
  );
}

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
        <img
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
              <img src={MIBAN_LOGO} alt="" width={24} height={24} className="rounded-full object-cover" style={{ width: 24, height: 24 }} />
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
                  <img
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
function UserMenu({ user, isAuthenticated, onLogout }: {
  user: { name?: string | null; role?: string; username?: string; mibanRole?: string } | null;
  isAuthenticated: boolean;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
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
  const isMibanAdmin = username === "jiang";
  const isMibanAgent = mibanRole === "parent";
  const initial = (user?.name ?? "我").charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 active:opacity-70"
      >
        <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center">
          <span className="text-white text-[12px] font-semibold">{initial}</span>
        </div>
        <ChevronDown className={`w-3 h-3 text-black/40 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-44 bg-white border border-black/10 rounded-2xl shadow-xl overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-black/5">
            <p className="text-sm font-semibold text-black truncate">{user?.name ?? "用户"}</p>
            <p className="text-xs text-black/40 mt-0.5">
              {isMibanAdmin ? "管理员" : isMibanAgent ? "米商" : "顾客"}
            </p>
          </div>

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
            <Link
              href="/p/proj_hzxm2t/admin"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-3 text-sm text-black/70 hover:bg-black/5 transition-colors"
            >
              <Settings className="w-4 h-4 text-[#FF6900]" />
              管理后台
            </Link>
          )}

          <button
            onClick={() => { setOpen(false); onLogout(); }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-500 hover:bg-red-50 transition-colors border-t border-black/5"
          >
            <LogOut className="w-4 h-4" />
            退出登录
          </button>
        </div>
      )}
    </div>
  );
}

export default function NavBar() {
  const [location] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => { window.location.href = "/p/proj_hzxm2t/"; },
    onError: () => toast.error("退出失败，请重试"),
  });

  const isTabActive = (href: string) => {
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
        <div className="max-w-[480px] mx-auto flex items-center justify-between px-4 h-full">
          {/* Logo + 版本切换 + 身份切换器 */}
          <div className="flex items-center">
            <LogoWithVersionSwitch />
            <IdentitySwitcherNav />
          </div>

          {/* 右侧：购物车 + 用户头像 */}
          <div className="flex items-center gap-2">
            <CartDrawer />
            <UserMenu user={user} isAuthenticated={isAuthenticated} onLogout={() => logout.mutate()} />
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
        <div className="max-w-[480px] mx-auto flex items-center h-14">
          {tabItems.map((tab) => {
            const active = isTabActive(tab.href);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 h-full active:opacity-70"
              >
                <Icon
                  className="w-5 h-5"
                  style={{ color: active ? "#FF6900" : "#AAAAAA" }}
                  strokeWidth={active ? 2.5 : 1.8}
                />
                <span
                  className="text-[10px] font-medium"
                  style={{ color: active ? "#FF6900" : "#AAAAAA" }}
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
