/**
 * DoctorPerformance - 医生绩效
 */

import OpsCard from "./OpsCard";
import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";

interface DoctorPerformanceProps {
  startDate: string;
  endDate: string;
  tenantId?: number;
}

export default function DoctorPerformance({ startDate, endDate, tenantId }: DoctorPerformanceProps) {
  const { data, isLoading, isError } = trpc.yabanOps.doctorPerformance.useQuery({
    startDate,
    endDate,
    tenantId,
  });

  const [displayData, setDisplayData] = useState<any[]>([]);

  useEffect(() => {
    if (data?.items) {
      setDisplayData(data.items);
    }
  }, [data]);

  if (isLoading) {
    return (
      <OpsCard title="医生绩效" subtitle="本月产值排名" action="全部">
        <div style={{ padding: "10px 0" }}>
          <div style={{ height: 20, background: "#F3F4F6", borderRadius: 3, marginBottom: 5 }} />
          <div style={{ height: 20, background: "#F3F4F6", borderRadius: 3, marginBottom: 5 }} />
          <div style={{ height: 20, background: "#F3F4F6", borderRadius: 3 }} />
        </div>
      </OpsCard>
    );
  }

  if (isError || !displayData || displayData.length === 0) {
    return (
      <OpsCard title="医生绩效" subtitle="本月产值排名" action="全部">
        <div style={{ padding: "10px 0", textAlign: "center", color: "#9CA3AF" }}>暂无数据</div>
      </OpsCard>
    );
  }

  const maxVal = Math.max(...displayData.map((d) => d.revenue));

  return (
    <OpsCard title="医生绩效" subtitle="本月产值排名" action="全部">
      {displayData.map((doc, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "7px 0",
            borderBottom: i < displayData.length - 1 ? "1px solid #F9FAFB" : "none",
          }}
        >
          {/* 排名 */}
          <span
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: i < 3 ? ["#F59E0B", "#9CA3AF", "#CD7C3A"][i] : "#F3F4F6",
              color: i < 3 ? "white" : "#9CA3AF",
              fontSize: 10,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {i + 1}
          </span>

          {/* 医生名 */}
          <span style={{ width: 42, fontSize: 12, color: "#374151", flexShrink: 0 }}>{doc.doctorName}</span>

          {/* 进度条 */}
          <div style={{ flex: 1, height: 6, background: "#F3F4F6", borderRadius: 3, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${(doc.revenue / maxVal) * 100}%`,
                background: i === 0 ? "#1E88D6" : "#3BA9E0",
                borderRadius: 3,
                transition: "width 0.6s ease",
              }}
            />
          </div>

          {/* 数值 */}
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#1F2937" }}>{(doc.revenue / 10000).toFixed(1)}万</span>
            <span style={{ fontSize: 9, color: "#9CA3AF", display: "block" }}>{doc.patients}人</span>
          </div>
        </div>
      ))}
    </OpsCard>
  );
}