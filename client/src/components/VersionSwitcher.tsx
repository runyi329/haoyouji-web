import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

/**
 * VersionSwitcher - 右上角多版本快捷切换器
 *
 * 显示规则：
 * - 仅当当前登录用户被管理员授予「允许切换(switchEnabled)」时才显示；否则完全不渲染（用户看不到任何按钮）。
 * - 列出该用户可切换到的版本（switchableVersionKeys，预留多版本，目前为脉动版/牙伴版）。
 * - 点击某版本即跳转到该版本的落地地址（脉动版 "/"，牙伴版 "/yaban" 等）。
 *   切换仅改变「当前查看的版本」，不改变用户的归属版本（归属由推荐链决定，用户无权更改）。
 *
 * 用法：在各版本首页右上角挂载 <VersionSwitcher />。
 */
export default function VersionSwitcher() {
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
  // 可切换目标（带名称与落地地址）
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

  return (
    <div className="fixed top-3 right-3 z-[9999]">
      <div className="relative">
        {/* 圆圈快捷按钮 */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-10 h-10 rounded-full bg-white/90 backdrop-blur shadow-lg border border-gray-200 flex items-center justify-center active:scale-95 transition"
          title="切换版本"
          aria-label="切换版本"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-gray-700"
          >
            <path d="M17 1l4 4-4 4" />
            <path d="M3 11V9a4 4 0 0 1 4-4h14" />
            <path d="M7 23l-4-4 4-4" />
            <path d="M21 13v2a4 4 0 0 1-4 4H3" />
          </svg>
        </button>

        {/* 版本列表下拉 */}
        {open && (
          <>
            <div
              className="fixed inset-0 z-[-1]"
              onClick={() => setOpen(false)}
            />
            <div className="absolute right-0 mt-2 w-44 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden">
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
                      active ? "text-blue-600 font-medium" : "text-gray-700"
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
          </>
        )}
      </div>
    </div>
  );
}
