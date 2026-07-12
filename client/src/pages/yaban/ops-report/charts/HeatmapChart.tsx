/**
 * HeatmapChart - 接诊热力图
 * 按周/时段显示接诊强度
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  startDate: string;
  endDate: string;
  tenantId?: number;
}

const DAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8-20

function intensityColor(v: number) {
  if (v === 0) return "#F9FAFB";
  if (v < 20) return "#DBEAFE";
  if (v < 40) return "#93C5FD";
  if (v < 60) return "#3B82F6";
  if (v < 80) return "#1D4ED8";
  return "#1E3A8A";
}

export default function HeatmapChart({ startDate, endDate, tenantId }: Props) {
  const [weekOffset, setWeekOffset] = useState(0);
  const { data: rawData } = trpc.yabanOps.heatmapStats.useQuery({ startDate, endDate, tenantId });
  const data = rawData?.items ?? [];

  const weekLabel = weekOffset === 0 ? "本周" : weekOffset === -1 ? "上周" : `${-weekOffset}周前`;

  function getVal(day: number, hour: number) {
    return data.find((c) => c.day === day && c.hour === hour)?.value ?? 0;
  }

  return (
    <div>
      {/* 周导航 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <button
          onClick={() => setWeekOffset((v) => v - 1)}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#6B7280" }}
        >
          <ChevronLeft size={16} />
        </button>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{weekLabel}</span>
        <button
          onClick={() => setWeekOffset((v) => Math.min(0, v + 1))}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#6B7280" }}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* 热力图表格 */}
      <div style={{ overflowX: "auto", scrollbarWidth: "none" }}>
        <div style={{ minWidth: 320 }}>
          {/* 列头（时段） */}
          <div style={{ display: "flex", marginLeft: 28, marginBottom: 2 }}>
            {HOURS.filter((_, i) => i % 2 === 0).map((h) => (
              <div
                key={h}
                style={{
                  flex: 1,
                  fontSize: 8,
                  color: "#9CA3AF",
                  textAlign: "center",
                }}
              >
                {h}
              </div>
            ))}
          </div>

          {/* 行（每天） */}
          {DAYS.map((day, di) => (
            <div key={di} style={{ display: "flex", alignItems: "center", marginBottom: 3 }}>
              <span style={{ width: 28, fontSize: 9, color: "#6B7280", flexShrink: 0 }}>{day}</span>
              <div style={{ flex: 1, display: "flex", gap: 2 }}>
                {HOURS.map((h) => {
                  const v = getVal(di, h);
                  return (
                    <div
                      key={h}
                      title={`${day} ${h}:00 强度${v}`}
                      style={{
                        flex: 1,
                        height: 18,
                        borderRadius: 3,
                        background: intensityColor(v),
                      }}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 图例 */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8, justifyContent: "flex-end" }}>
        <span style={{ fontSize: 9, color: "#9CA3AF" }}>低</span>
        {["#DBEAFE", "#93C5FD", "#3B82F6", "#1D4ED8", "#1E3A8A"].map((c) => (
          <div key={c} style={{ width: 12, height: 12, borderRadius: 2, background: c }} />
        ))}
        <span style={{ fontSize: 9, color: "#9CA3AF" }}>高</span>
      </div>
    </div>
  );
}
