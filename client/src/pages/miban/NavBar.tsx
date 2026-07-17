import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Home, BookOpen, FlaskConical, User, ChevronDown, LogOut, Settings, Briefcase } from "lucide-react";
import CartDrawer from "./CartDrawer";

const tabItems = [
  { href: "/p/proj_hzxm2t/", label: "首页", icon: Home },
  { href: "/p/proj_hzxm2t/rice", label: "百科", icon: BookOpen },
  { href: "/p/proj_hzxm2t/diy", label: "配米", icon: FlaskConical },
  { href: "/p/proj_hzxm2t/my-recipes", label: "我的", icon: User },
];

// ─── 用户菜单（角色感知） ─────────────────────────────────────────────────────
function UserMenu({ user, isAuthenticated, onLogout }: {
  user: { name?: string | null; role?: string } | null;
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

  const role = user?.role ?? "user";
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
          {/* 用户信息 */}
          <div className="px-4 py-3 border-b border-black/5">
            <p className="text-sm font-semibold text-black truncate">{user?.name ?? "用户"}</p>
            <p className="text-xs text-black/40 mt-0.5">
              {role === "super_admin" ? "管理员" : role === "parent" ? "家长用户" : "普通用户"}
            </p>
          </div>

          {/* 业务员入口 */}
          {(role === "parent" || role === "super_admin") && (
            <Link
              href="/p/proj_hzxm2t/agent"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-3 text-sm text-black/70 hover:bg-black/5 transition-colors"
            >
              <Briefcase className="w-4 h-4 text-blue-500" />
              业务员中心
            </Link>
          )}

          {/* 管理员入口 */}
          {role === "super_admin" && (
            <Link
              href="/p/proj_hzxm2t/admin"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-3 text-sm text-black/70 hover:bg-black/5 transition-colors"
            >
              <Settings className="w-4 h-4 text-[#FF6900]" />
              管理员后台
            </Link>
          )}

          {/* 退出 */}
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
        <div
          className="max-w-[480px] mx-auto flex items-center justify-between px-4 h-full"
        >
          {/* Logo */}
          <Link href="/p/proj_hzxm2t/" className="flex items-center gap-2">
            <img
              src="/manus-storage/rice_logo_final_bf438530.png"
              alt="米伴"
              className="w-7 h-7 rounded-md object-cover"
            />
            <span className="text-[16px] font-bold text-black tracking-tight">
              米伴
            </span>
          </Link>

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
