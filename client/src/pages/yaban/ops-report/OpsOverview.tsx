/**
 * OpsOverview - 本月实收总览卡片（真实接口版）
 */

import { TrendingUp, TrendingDown } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface Props {
  startDate: string;
  endDate: string;
  tenantId?: number;
}

function Skeleton() {
  return (
    <div style={{ background: "white", borderRadius: 7, boxShadow: "0 4px 16px rgba(15,23,42,0.10)", padding: "16px 16px 14px" }}>
      <div style={{ height: 60, background: "#F3F4F6", borderRadius: 4, marginBottom: 12 }} />
      <div style={{ height: 40, background: "#F3F4F6", borderRadius: 4 }} />
    </div>
  );
}

export default function OpsOverview({ startDate, endDate, tenantId }: Props) {
  const { data, isLoading } = trpc.yabanOps.revenueSummary.useQuery({ startDate, endDate, tenantId });

  if (isLoading) return <Skeleton />;

  const revenue = data?.totalRevenue ?? 0;
  const prevRevenue = data?.prevRevenue ?? 0;
  const trendPct = prevRevenue > 0 ? Math.round(((revenue - prevRevenue) / prevRevenue) * 100) : 0;
  const isUp = trendPct >= 0;
  const patients = data?.totalPatients ?? 0;
  const avgPerPatient = patients > 0 ? Math.round(revenue / patients) : 0;

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
          <p style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>期间实收</p>
          <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
            <span style={{ fontSize: 11, color: "#6B7280" }}>¥</span>
            <span style={{ fontSize: 28, fontWeight: 700, color: "#1F2937", lineHeight: 1 }}>
              {revenue.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}
            </span>
          </div>
          {prevRevenue > 0 && (
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
                {isUp ? "+" : ""}{trendPct}%
              </span>
              <span style={{ fontSize: 11, color: "#9CA3AF" }}>较上期</span>
            </div>
          )}
        </div>

        {/* 迷你折线图占位 */}
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
          { label: "收费笔数", value: `${data?.totalCharges ?? 0}笔` },
          { label: "接诊量", value: `${patients}人` },
          { label: "客单价", value: `¥${avgPerPatient.toLocaleString()}` },
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
