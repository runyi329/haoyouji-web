import OpsCard from "./OpsCard";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "antd";

interface PatientSourceProps {
  startDate: string;
  endDate: string;
  tenantId?: number;
}

export default function PatientSource({ startDate, endDate, tenantId }: PatientSourceProps) {
  const { data, isLoading } = trpc.yabanOps.patientSourceStats.useQuery({
    startDate,
    endDate,
    tenantId,
  });

  if (isLoading) {
    return (
      <OpsCard title="患者来源" subtitle="获客渠道ROI分析">
        <Skeleton active paragraph={{ rows: 4 }} />
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
              {/* ROI字段在接口返回中不存在，此处暂时移除或根据实际情况调整 */}
              {/* {item.roi > 0 && <span style={{ fontSize: 10, color: "#10B981", marginLeft: 6 }}>ROI {item.roi}%</span>} */}
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