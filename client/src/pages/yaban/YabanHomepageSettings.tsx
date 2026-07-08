/**
 * 牙伴齿科管理 - 首页展示设置
 * 路由：/yaban/settings/homepage-display
 * 功能：允许用户为首页工作台的9个卡片槽位自定义显示的数据指标
 * 存储：localStorage，key = yaban_home_cards_{tenantId}
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useSmartBack } from "@/hooks/useSmartBack";
import { ChevronLeft, Check, RotateCcw } from "lucide-react";
import YabanClinicHeader from "./YabanClinicHeader";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ── 所有可选数据指标定义 ──────────────────────────────────────────
export type CardMetricKey =
  | "appt"        // 今日预约
  | "follow"      // 今日随访
  | "charge"      // 今日营业额
  | "arrived"     // 今日到诊
  | "missed"      // 今日爽约
  | "birthday"    // 今日生日
  | "confirmed"   // 今日已确认
  | "newCustomer" // 今日新顾客
  | "onDuty"      // 今日出勤
  | "empty";      // 空白占位

export interface CardMetricDef {
  key: CardMetricKey;
  label: string;
  desc: string;
  gradient: string;
  borderColor: string;
}

export const CARD_METRICS: CardMetricDef[] = [
  {
    key: "appt",
    label: "今日预约",
    desc: "当天所有预约数量（含各状态）",
    gradient: "linear-gradient(135deg, #4DB8E8 0%, #2196C8 100%)",
    borderColor: "#2196C8",
  },
  {
    key: "follow",
    label: "今日随访",
    desc: "当天需要随访的顾客数量",
    gradient: "linear-gradient(135deg, #34D399 0%, #10B981 100%)",
    borderColor: "#10B981",
  },
  {
    key: "charge",
    label: "今日营业额",
    desc: "当天实收金额合计（元）",
    gradient: "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)",
    borderColor: "#D97706",
  },
  {
    key: "arrived",
    label: "今日到诊",
    desc: "当天已到诊（含已完成）的预约数",
    gradient: "linear-gradient(135deg, #818CF8 0%, #6366F1 100%)",
    borderColor: "#6366F1",
  },
  {
    key: "missed",
    label: "今日爽约",
    desc: "当天已取消或爽约的预约数",
    gradient: "linear-gradient(135deg, #F87171 0%, #EF4444 100%)",
    borderColor: "#EF4444",
  },
  {
    key: "birthday",
    label: "今日生日",
    desc: "当天生日的顾客数量",
    gradient: "linear-gradient(135deg, #F472B6 0%, #EC4899 100%)",
    borderColor: "#EC4899",
  },
  {
    key: "confirmed",
    label: "今日已确认",
    desc: "当天状态为「已确认」的预约数",
    gradient: "linear-gradient(135deg, #6EE7B7 0%, #059669 100%)",
    borderColor: "#059669",
  },
  {
    key: "newCustomer",
    label: "今日新顾客",
    desc: "当天新建档案的顾客数量",
    gradient: "linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%)",
    borderColor: "#F59E0B",
  },
  {
    key: "onDuty",
    label: "今日出勤",
    desc: "当天排班出勤的员工数量",
    gradient: "linear-gradient(135deg, #93C5FD 0%, #3B82F6 100%)",
    borderColor: "#3B82F6",
  },
];

// 默认9个卡片配置
export const DEFAULT_CARD_KEYS: CardMetricKey[] = [
  "appt", "follow", "charge",
  "arrived", "missed", "birthday",
  "confirmed", "newCustomer", "onDuty",
];

// localStorage 工具
export function getStorageKey(tenantId: number): string {
  return `yaban_home_cards_${tenantId}`;
}

export function loadCardConfig(tenantId: number): CardMetricKey[] {
  try {
    const raw = localStorage.getItem(getStorageKey(tenantId));
    if (!raw) return DEFAULT_CARD_KEYS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === 9) return parsed as CardMetricKey[];
  } catch {}
  return DEFAULT_CARD_KEYS;
}

export function saveCardConfig(tenantId: number, keys: CardMetricKey[]): void {
  localStorage.setItem(getStorageKey(tenantId), JSON.stringify(keys));
}

// ── 主组件 ────────────────────────────────────────────────────────
export default function YabanHomepageSettings() {
  const [, navigate] = useLocation();
  const goBack = useSmartBack("/yaban/settings/website-features");

  // 获取当前门店 ID
  const meQuery = trpc.yabanRole.myMembership.useQuery();
  const tenantId: number = (meQuery.data as any)?.member?.tenant_id ?? 0;

  // 9个槽位的当前配置
  const [slots, setSlots] = useState<CardMetricKey[]>(DEFAULT_CARD_KEYS);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);

  // 加载已保存配置
  useEffect(() => {
    if (tenantId > 0) {
      setSlots(loadCardConfig(tenantId));
    }
  }, [tenantId]);

  // 选择某个指标赋给当前激活槽位
  // 如果该指标已被其他槽位占用，则两个槽位自动互换
  const handleSelectMetric = (key: CardMetricKey) => {
    if (activeSlot === null) return;
    const newSlots = [...slots];
    const existingIdx = newSlots.findIndex((k, i) => k === key && i !== activeSlot);
    if (existingIdx !== -1) {
      // 自动互换：将当前槽位的旧内容放到被占用的槽位
      newSlots[existingIdx] = newSlots[activeSlot];
    }
    newSlots[activeSlot] = key;
    setSlots(newSlots);
    setActiveSlot(null);
  };

  // 保存
  const handleSave = () => {
    // tenantId 可能还在加载中（为0），仍然允许保存（用0作为key），加载完成后会自动迁移
    saveCardConfig(tenantId, slots);
    toast.success("首页展示设置已保存");
    navigate("/yaban/settings/website-features");
  };

  // 重置为默认
  const handleReset = () => {
    setSlots([...DEFAULT_CARD_KEYS]);
    setActiveSlot(null);
  };

  // 获取指标定义
  const getMetric = (key: CardMetricKey): CardMetricDef | undefined =>
    CARD_METRICS.find((m) => m.key === key);

  // 槽位标签
  const slotLabel = (i: number) => `第${["一","二","三","四","五","六","七","八","九"][i]}个`;

  return (
    <div className="min-h-screen bg-[#F0F4F8] pb-10">
      {/* 头部 */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white">
        <div className="flex items-center gap-2 px-4 py-3">
          <button onClick={goBack} aria-label="返回">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-base font-bold flex-1">首页展示设置</span>
          <button
            onClick={handleReset}
            className="flex items-center gap-1 text-white/80 text-sm active:opacity-60"
          >
            <RotateCcw className="w-4 h-4" />
            <span>重置</span>
          </button>
        </div>
        <div className="px-4 pb-3">
          <YabanClinicHeader asBar />
        </div>
      </div>

      <div className="px-4 pt-5 space-y-4">
        {/* 说明 */}
        <div className="bg-white rounded overflow-hidden shadow-sm px-4 py-3">
          <p className="text-xs text-gray-500 leading-relaxed">
            首页工作台共有 <span className="font-semibold text-[#2196C8]">9个</span> 数据卡片（3行×3列）。
            点击下方任意卡片槽位，可更换该位置显示的数据指标。
          </p>
        </div>

        {/* 9个槽位预览（3×3网格） */}
        <div className="bg-white rounded overflow-hidden shadow-sm p-4">
          <div className="text-xs font-medium text-gray-500 mb-3">点击卡片可更换内容</div>
          <div className="grid grid-cols-3 gap-2">
            {slots.map((key, i) => {
              const metric = getMetric(key);
              const isActive = activeSlot === i;
              return (
                <button
                  key={i}
                  onClick={() => setActiveSlot(isActive ? null : i)}
                  style={{
                    background: metric ? metric.gradient : "#e5e7eb",
                    boxShadow: isActive
                      ? `0 0 0 3px #fff, 0 0 0 5px ${metric?.borderColor || "#2196C8"}`
                      : metric
                      ? `0 3px 10px ${metric.borderColor}44`
                      : "none",
                    borderRadius: 12,
                    padding: "12px 6px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: 70,
                    border: "none",
                    cursor: "pointer",
                    transition: "box-shadow 0.15s",
                    position: "relative",
                  }}
                >
                  {isActive && (
                    <div
                      style={{
                        position: "absolute",
                        top: 4,
                        right: 4,
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        background: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: metric?.borderColor || "#2196C8" }} />
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.8)", marginBottom: 4 }}>
                    {slotLabel(i)}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", textAlign: "center", lineHeight: 1.2 }}>
                    {metric ? metric.label : "空白"}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 指标选择面板（仅当有激活槽位时显示） */}
        {activeSlot !== null && (
          <div className="bg-white rounded overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-gray-100">
              <span className="text-sm font-medium text-gray-700">
                为「{slotLabel(activeSlot)}」选择数据指标
              </span>
            </div>
            <div className="divide-y divide-gray-50">
              {CARD_METRICS.map((metric) => {
                const isSelected = slots[activeSlot] === metric.key;
                return (
                  <button
                    key={metric.key}
                    onClick={() => handleSelectMetric(metric.key)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-gray-50"
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        background: metric.gradient,
                        flexShrink: 0,
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800">{metric.label}</div>
                      <div className="text-xs text-gray-400 mt-0.5 truncate">{metric.desc}</div>
                    </div>
                    {isSelected && <Check className="w-5 h-5 text-[#2196C8] flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 保存按钮 */}
        <button
          onClick={handleSave}
          className="w-full py-3.5 rounded-lg text-white font-semibold text-base active:opacity-80"
          style={{ background: "linear-gradient(135deg, #4DB8E8 0%, #2196C8 100%)" }}
        >
          保存设置
        </button>
      </div>
    </div>
  );
}
