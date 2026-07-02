import OpsCard from "./OpsCard";
import { mockOperationEfficiency } from "../mockData";

export default function OperationEfficiency() {
  const d = mockOperationEfficiency;
  const items = [
    { label: "椅位使用率", value: `${d.chairUsageRate}%`, color: "#1E88D6", bg: "#EAF4FE" },
    { label: "平均治疗时长", value: `${d.avgTreatmentTime}分钟`, color: "#10B981", bg: "#ECFDF5" },
    { label: "爽约率", value: `${d.noShowRate}%`, color: "#EF4444", bg: "#FEF2F2" },
    { label: "改约率", value: `${d.rescheduledRate}%`, color: "#F59E0B", bg: "#FFFBEB" },
    { label: "椅位数量", value: `${d.chairCount}台`, color: "#6B7280", bg: "#F9FAFB" },
    { label: "高峰时段产值", value: `${d.peakHourRevenue}万`, color: "#9C27B0", bg: "#FDF4FF" },
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
