import OpsCard from "./OpsCard";
import { trpc } from "@/lib/trpc";
import React from "react";

interface TimeEfficiencyProps {
  startDate: string;
  endDate: string;
  tenantId?: number;
}

export default function TimeEfficiency({ startDate, endDate, tenantId }: TimeEfficiencyProps) {
  const { data, isLoading } = trpc.yabanOps.timeSlotStats.useQuery({
    startDate,
    endDate,
    tenantId,
  });

  const slots = data?.slots || [];
  const maxPatients = React.useMemo(() => {
    if (slots.length === 0) return 0;
    return Math.max(...slots.map((d) => d.patients));
  }, [slots]);

  if (isLoading) {
    return (
      <OpsCard title="时段效率" subtitle="按时段接诊与产值分布">
        <div style={{ padding: "20px", textAlign: "center" }}>
          <div style={{ height: "100px", backgroundColor: "#F3F4F6", borderRadius: "8px" }} />
        </div>
      </OpsCard>
    );
  }

  if (slots.length === 0) {
    return (
      <OpsCard title="时段效率" subtitle="按时段接诊与产值分布">
        <div style={{ padding: "20px", textAlign: "center", color: "#6B7280" }}>
          暂无数据
        </div>
      </OpsCard>
    );
  }

  return (
    <OpsCard title="时段效率" subtitle="按时段接诊与产值分布">
      <div style={{ overflowX: "auto", scrollbarWidth: "none" }}>
        <div style={{ minWidth: 320 }}>
          {slots.map((slot, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
              <span style={{ width: 36, fontSize: 9, color: "#9CA3AF", flexShrink: 0 }}>{slot.hour}</span>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ height: 5, background: "#F3F4F6", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(slot.patients / maxPatients) * 100}%`, background: "#1E88D6", borderRadius: 2 }} />
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 10, color: "#1E88D6" }}>{slot.patients}人</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 10, color: "#6B7280" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ display: "inline-block", width: 10, height: 5, background: "#1E88D6", borderRadius: 1 }} />接诊量
        </span>
      </div>
    </OpsCard>
  );
}