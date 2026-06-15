import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

/**
 * VersionSwitcher - 多版本快捷切换器（小圆圈 + 点击弹出下拉）
 *
 * 显示规则：
 * - 仅当当前登录用户被管理员授予「允许切换(switchEnabled)」且可切换版本 >= 2 时才显示；
 *   否则完全不渲染（用户看不到任何按钮）。
 * - 点击小圆圈弹出下拉，列出可切换版本，当前版本带勾选；点击某版本即切换到其落地地址。
 *
 * 两种摆放模式：
 * - 默认（floating）：固定浮在屏幕右上角，适用于无顶栏图标行的页面（如脉动版人脉首页）。
 * - inline：内嵌进顶栏图标行（如牙伴版顶栏「刷新/搜索/新增」一行），渲染为与顶栏同色系的小圆圈。
 *
 * 通过 variant 控制内嵌时圆圈的配色：
 * - "light"（默认 inline）：浅色顶栏，图标用深色
 * - "onColor"：彩色顶栏（如牙伴蓝色 Header），圆圈为白底、图标深色，贴合截图样式
 */
type Variant = "floating" | "inline";

export default function VersionSwitcher({
  variant = "floating",
}: {
  variant?: Variant;
}) {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);

  const { data: user } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const { data: versions } = trpc.version.listVersions.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const version = (user as any)?.version as
    | {
        versionKey?: string;
        switchEnabled?: boolean;
        switchableVersionKeys?: string[];
      }
    | undefined;

  // 无切换权限：不渲染任何东西
  if (!version || !version.switchEnabled) return null;

  const allowedKeys = version.switchableVersionKeys || [];
  const options = (versions || [])
    .filter((v: any) => allowedKeys.includes(v.versionKey))
    .map((v: any) => ({
      versionKey: v.versionKey as string,
      name: v.name as string,
      landingPath: (v.landingPath as string) || "/",
    }));

  // 少于2个可切换版本时无需展示切换器
  if (options.length < 2) return null;

  const currentKey = version.versionKey;

  const handleSwitch = (target: { versionKey: string; landingPath: string }) => {
    setOpen(false);
    if (target.versionKey === currentKey) return;
    setLocation(target.landingPath || "/");
  };

  // 切换图标（两个相对箭头，表示切换）
  const SwitchIcon = ({ className }: { className?: string }) => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M17 1l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 23l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );

  // 下拉菜单（两种模式共用）
  const Dropdown = (
    <div className="absolute right-0 mt-2 w-44 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50">
      <div className="px-3 py-2 text-xs text-gray-400 border-b border-gray-50">
        切换版本
      </div>
      {options.map((opt) => {
        const active = opt.versionKey === currentKey;
        return (
          <button
            key={opt.versionKey}
            type="button"
            onClick={() => handleSwitch(opt)}
            className={`w-full text-left px-3 py-2.5 text-sm flex items-center justify-between hover:bg-gray-50 ${
              active ? "text-[#D32F2F] font-semibold" : "text-gray-700"
            }`}
          >
            <span>{opt.name}</span>
            {active && (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );

  // ── inline 模式：内嵌进顶栏图标行（白底小圆圈，贴合彩色 Header）──────────────
  if (variant === "inline") {
    return (
      <div className="relative inline-flex">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center active:scale-95 transition"
          title="切换版本"
          aria-label="切换版本"
        >
          <SwitchIcon className="text-gray-700" />
        </button>
        {open && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
            />
            {Dropdown}
          </>
        )}
      </div>
    );
  }

  // ── floating 模式：固定浮在屏幕右上角（默认）────────────────────────────────
  return (
    <div className="fixed top-3 right-3 z-[9999]">
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-10 h-10 rounded-full bg-white/90 backdrop-blur shadow-lg border border-gray-200 flex items-center justify-center active:scale-95 transition"
          title="切换版本"
          aria-label="切换版本"
        >
          <SwitchIcon className="text-gray-700" />
        </button>
        {open && (
          <>
            <div
              className="fixed inset-0 z-[-1]"
              onClick={() => setOpen(false)}
            />
            {Dropdown}
          </>
        )}
      </div>
    </div>
  );
}
