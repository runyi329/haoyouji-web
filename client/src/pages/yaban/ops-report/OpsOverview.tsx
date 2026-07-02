/**
 * OpsOverview - 本月实收总览卡片
 */

import { TrendingUp, TrendingDown } from "lucide-react";
import { mockOverview } from "../mockData";

export default function OpsOverview() {
  const d = mockOverview;
  const isUp = d.trendPct >= 0;

  return (
    <div
      style={{
        background: "white",
        borderRadius: 7,
        boxShadow: "0 4px 16px rgba(15,23,42,0.10), 0 1px 4px rgba(15,23,42,0.06)",
        padding: "16px 16px 14px",
      }}
    >
      {/* 主数字行 */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <p style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>{d.label}</p>
          <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
            <span style={{ fontSize: 11, color: "#6B7280" }}>¥</span>
            <span style={{ fontSize: 28, fontWeight: 700, color: "#1F2937", lineHeight: 1 }}>
              {d.amount}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 2,
                fontSize: 11,
                fontWeight: 500,
                color: isUp ? "#10B981" : "#EF4444",
              }}
            >
              {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {isUp ? "+" : ""}{d.trendPct}%
            </span>
            <span style={{ fontSize: 11, color: "#9CA3AF" }}>{d.trendLabel}</span>
          </div>
        </div>

        {/* 迷你折线图占位（后续可接真实sparkline） */}
        <svg width="80" height="36" viewBox="0 0 80 36">
          <polyline
            points="0,28 13,22 26,25 40,14 53,18 66,10 80,6"
            fill="none"
            stroke="#1E88D6"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* 三格指标 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 0,
          marginTop: 14,
          borderTop: "1px solid #F3F4F6",
          paddingTop: 12,
        }}
      >
        {[
          { label: "目标", value: d.target },
          { label: "接诊量", value: `${d.patients}人` },
          { label: "客单价", value: `¥${d.avgPerPatient.toLocaleString()}` },
        ].map((item, i) => (
          <div
            key={i}
            style={{
              textAlign: "center",
              borderRight: i < 2 ? "1px solid #F3F4F6" : "none",
            }}
          >
            <p style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>{item.label}</p>
            <p style={{ fontSize: 15, fontWeight: 700, color: "#1F2937" }}>{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
