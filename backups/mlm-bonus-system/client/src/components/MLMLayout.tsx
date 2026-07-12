import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  LayoutGrid,
  Users,
  TrendingUp,
  GitBranch,
  ChevronLeft,
  ChevronRight,
  Menu,
  Zap,
  UserCircle,
  LogOut,
} from "lucide-react";

const navItems = [
  { path: "/", label: "制度总览", icon: LayoutGrid },
  { path: "/herbalife", label: "康宝莱", icon: TrendingUp },
  { path: "/syjk", label: "数研金控", icon: GitBranch },
  { path: "/amway", label: "安利", icon: Users },
  { path: "/marykay", label: "玫琳凯", icon: Users },
  { path: "/infinitus", label: "无限极", icon: Users },
  { path: "/sunhope", label: "尚赫", icon: Users },
  { path: "/babycare", label: "葆婴", icon: Users },
  { path: "/tianshou", label: "天狮", icon: Users },
  { path: "/nuskin", label: "如新", icon: Users },
];

interface MLMLayoutProps {
  children: React.ReactNode;
}

export default function MLMLayout({ children }: MLMLayoutProps) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 h-full z-50 flex flex-col transition-all duration-300",
          "bg-sidebar border-r border-sidebar-border",
          collapsed ? "w-16" : "w-56",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border min-h-[64px]">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0 tech-glow">
            <Zap className="w-4 h-4 text-white" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <div className="text-sm font-bold text-foreground whitespace-nowrap">奖金制度</div>
              <div className="text-xs text-muted-foreground whitespace-nowrap">研究平台</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.path || (item.path !== "/" && location.startsWith(item.path));
            return (
              <Link key={item.path} href={item.path}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg cursor-pointer transition-all duration-200",
                    isActive
                      ? "bg-primary/20 text-primary border border-primary/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                  onClick={() => setMobileOpen(false)}
                >
                  <Icon className={cn("w-4 h-4 flex-shrink-0", isActive && "text-primary")} />
                  {!collapsed && (
                    <span className="text-sm font-medium whitespace-nowrap">{item.label}</span>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Collapse toggle (desktop) */}
        <div className="hidden md:flex p-3 border-t border-sidebar-border">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className={cn("flex-1 flex flex-col transition-all duration-300", collapsed ? "md:ml-16" : "md:ml-56")}>
        {/* Top bar (mobile) */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
          <button onClick={() => setMobileOpen(true)} className="text-muted-foreground hover:text-foreground">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
              <Zap className="w-3 h-3 text-white" />
            </div>
            <span className="text-sm font-bold">奖金制度研究平台</span>
          </div>
          {/* 用户状态 */}
          {isAuthenticated ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <UserCircle className="w-4 h-4 text-primary" />
                <span className="max-w-[60px] truncate">{user?.name || "用户"}</span>
              </div>
              <button
                onClick={logout}
                className="text-muted-foreground hover:text-destructive transition-colors"
                title="退出登录"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <Link href="/login">
              <button className="flex items-center gap-1 text-xs font-medium text-primary border border-primary/30 rounded-lg px-2.5 py-1 hover:bg-primary/10 transition-colors">
                <UserCircle className="w-3.5 h-3.5" />
                登录
              </button>
            </Link>
          )}
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
