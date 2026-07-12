import OpsCard from "./OpsCard";
import { trpc } from "@/lib/trpc";

interface PatientSourceProps {
  startDate: string;
  endDate: string;
  tenantId?: number;
}

function SkeletonRows() {
  return (
    <div>
      {[...Array(4)].map((_, i) => (
        <div key={i} style={{ padding: "7px 0", borderBottom: i < 3 ? "1px solid #F9FAFB" : "none" }}>
          <div style={{ height: 14, background: "#F3F4F6", borderRadius: 3, marginBottom: 6, width: "60%" }} />
          <div style={{ height: 4, background: "#F3F4F6", borderRadius: 2 }} />
        </div>
      ))}
    </div>
  );
}

export default function PatientSource({ startDate, endDate, tenantId }: PatientSourceProps) {
  // 使用 patientSource 接口（后端实际接口名）
  const { data, isLoading } = trpc.yabanOps.patientSource.useQuery({
    startDate,
    endDate,
    tenantId,
  });

  if (isLoading) {
    return (
      <OpsCard title="患者来源" subtitle="获客渠道ROI分析">
        <SkeletonRows />
      </OpsCard>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <OpsCard title="患者来源" subtitle="获客渠道ROI分析">
        <div style={{ textAlign: "center", padding: "20px 0", color: "#6B7280" }}>暂无数据</div>
      </OpsCard>
    );
  }

  const maxCount = Math.max(...data.items.map((d) => d.count));

  return (
    <OpsCard title="患者来源" subtitle="获客渠道ROI分析">
      {data.items.map((item, i) => (
        <div key={i} style={{ padding: "7px 0", borderBottom: i < data.items.length - 1 ? "1px solid #F9FAFB" : "none" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: "#374151" }}>{item.source}</span>
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#1F2937" }}>{item.count}人</span>
              <span style={{ fontSize: 10, color: "#9CA3AF", marginLeft: 6 }}>{item.ratio}%</span>
            </div>
          </div>
          <div style={{ height: 4, background: "#F3F4F6", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(item.count / maxCount) * 100}%`, background: "#1E88D6", borderRadius: 2 }} />
          </div>
        </div>
      ))}
    </OpsCard>
  );
}
