/**
 * 牙伴齿科管理 - 页眉“当前医院”展示/切换条
 *
 * 设计要点（严禁 Emoji，沿用牙伴整体配色）：
 *   - 显示当前所属医院（优先简称）。
 *   - 有多家医院：可点击展开下拉切换；只有一家：仅展示不可切换。
 *   - 模拟医院附“模拟”标签，便于识别演示数据。
 *   - 切换通过 useYabanClinic 广播，跨页面/组件同步。
 *
 * 统一用法（推荐）：以「整行栏模式」asBar 放在顶栏第一行下方，
 *   左侧固定为医院切换胶囊，右侧 rightSlot 放该页上下文信息（日期/统计等），
 *   使整条栏左右撑满、视觉饱满，且所有页面位置一致。
 */
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Building2, ChevronDown, Check } from "lucide-react";
import { useYabanClinic, YABAN_MODEL_TENANT_ID } from "./useYabanClinic";

interface Props {
  /** 紧凑模式：用于嵌在已有标题栏内 */
  compact?: boolean;
  className?: string;
  /** 整行栏模式：组件自身渲染为一条左右撑满的“医院上下文栏”，右侧可放 rightSlot */
  asBar?: boolean;
  /** 整行栏模式下，右侧的上下文信息（如日期 / 统计），可选 */
  rightSlot?: ReactNode;
}

export default function YabanClinicHeader({
  compact = false,
  className = "",
  asBar = false,
  rightSlot = null,
}: Props) {
  const { clinics, current, hasMultiple, selectClinic } = useYabanClinic();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (!current) return null;

  const display = current.shortName?.trim() || current.name?.trim() || `门店 ${current.tenantId}`;
  const isModel = current.tenantId === YABAN_MODEL_TENANT_ID;

  // 医院切换胶囊（核心可点击元素）
  const pill = (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => hasMultiple && setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-md border border-white/30 bg-white/15 px-3 py-1 text-white backdrop-blur-sm transition active:scale-[0.97] ${
          hasMultiple ? "cursor-pointer hover:bg-white/25" : "cursor-default"
        } ${compact ? "text-xs" : "text-sm"}`}
        style={{ transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)", transitionDuration: "160ms" }}
      >
        <Building2 size={compact ? 13 : 15} className="shrink-0 opacity-90" />
        <span className="max-w-[8rem] truncate font-medium">{display}</span>
        {isModel && (
          <span className="rounded bg-amber-400/90 px-1 text-[10px] font-semibold leading-tight text-amber-950">
            演示
          </span>
        )}
        {hasMultiple && (
          <ChevronDown
            size={compact ? 13 : 15}
            className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        )}
      </button>

      {open && hasMultiple && (
        <div
          className="absolute left-0 z-50 mt-1.5 w-72 origin-top-left overflow-hidden rounded-md border border-gray-100 bg-white shadow-lg"
          style={{ animation: "ybClinicIn 150ms cubic-bezier(0.23, 1, 0.32, 1)" }}
        >
          <div className="border-b border-gray-50 px-3 py-2 text-xs font-medium text-gray-400">
            切换所属医院
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {clinics.map((c) => {
              const active = c.tenantId === current.tenantId;
              const cm = c.tenantId === YABAN_MODEL_TENANT_ID;
              const label = c.name?.trim() || c.shortName?.trim() || `门店 ${c.tenantId}`;
              return (
                <button
                  key={c.tenantId}
                  type="button"
                  onClick={() => {
                    selectClinic(c.tenantId);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition-colors ${
                    active ? "bg-cyan-50 text-cyan-900" : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{label}</span>
                    {cm && (
                      <span className="shrink-0 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-700">
                        演示
                      </span>
                    )}
                  </span>
                  {active && <Check size={15} className="shrink-0 text-cyan-600" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        @keyframes ybClinicIn {
          from { opacity: 0; transform: scale(0.96) translateY(-4px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );

  // 整行栏模式：左=切换胶囊，右=上下文信息，左右撑满
  if (asBar) {
    return (
      <div className={`mt-2.5 flex items-center justify-between gap-3 ${className}`}>
        {pill}
        {rightSlot != null && (
          <div className="flex min-w-0 items-center gap-2 text-[12px] font-medium text-white/85">
            {rightSlot}
          </div>
        )}
      </div>
    );
  }

  // 兼容旧用法：仅返回胶囊
  return <div className={className}>{pill}</div>;
}
