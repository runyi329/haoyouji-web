import OpsCard from "./OpsCard";
import { trpc } from "@/lib/trpc";

interface OperationEfficiencyProps {
  startDate: string;
  endDate: string;
  tenantId?: number;
}

export default function OperationEfficiency({ startDate, endDate, tenantId }: OperationEfficiencyProps) {
  const { data, isLoading, isError } = trpc.yabanOps.operationEfficiency.useQuery({
    startDate,
    endDate,
    tenantId,
  });

  if (isLoading) {
    return (
      <OpsCard title="运营效率" subtitle="本月平均指标">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ background: "#F3F4F6", borderRadius: 5, padding: "10px 10px", height: 50 }}></div>
          ))}
        </div>
      </OpsCard>
    );
  }

  if (isError || !data) {
    return (
      <OpsCard title="运营效率" subtitle="本月平均指标">
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 100, color: "#9CA3AF" }}>
          暂无数据
        </div>
      </OpsCard>
    );
  }

  const items = [
    { label: "就诊率", value: `${(data.visitRate * 100).toFixed(2)}%`, color: "#1E88D6", bg: "#EAF4FE" },
    { label: "平均治疗时长", value: `${data.avgTreatmentMinutes}分钟`, color: "#10B981", bg: "#ECFDF5" },
    { label: "爽约率", value: `${(data.noShowRate * 100).toFixed(2)}%`, color: "#EF4444", bg: "#FEF2F2" },
    { label: "改约率", value: `${(data.rescheduledRate * 100).toFixed(2)}%`, color: "#F59E0B", bg: "#FFFBEB" },
    { label: "诊室数量", value: `${data.roomCount}间`, color: "#6B7280", bg: "#F9FAFB" },
  ];

  return (
    <OpsCard title="运营效率" subtitle="本月平均指标">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {items.map((item, i) => (
          <div key={i} style={{ background: item.bg, borderRadius: 5, padding: "10px 10px" }}>
            <div style={{ fontSize: 9, color: "#9CA3AF", marginBottom: 4, lineHeight: 1.3 }}>{item.label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: item.color }}>{item.value}</div>
          </div>
        ))}
      </div>
    </OpsCard>
  );
}
