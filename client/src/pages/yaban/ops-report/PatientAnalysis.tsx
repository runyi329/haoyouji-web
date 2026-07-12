import OpsCard from "./OpsCard";
import { trpc } from "@/lib/trpc";

interface PatientAnalysisProps {
  startDate: string;
  endDate: string;
  tenantId?: number;
}

export default function PatientAnalysis({ startDate, endDate, tenantId }: PatientAnalysisProps) {
  const { data, isLoading, isError } = trpc.yabanOps.patientAnalysis.useQuery({
    startDate,
    endDate,
    tenantId,
  });

  if (isLoading) {
    return (
      <OpsCard title="患者分析" subtitle="本月患者维度数据">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{ height: 60, background: "#F3F4F6", borderRadius: 5 }} />
          ))}
        </div>
      </OpsCard>
    );
  }

  if (isError || !data || data.totalPatients === 0) {
    return (
      <OpsCard title="患者分析" subtitle="本月患者维度数据">
        <div style={{ textAlign: "center", padding: "20px 0", color: "#9CA3AF" }}>暂无数据</div>
      </OpsCard>
    );
  }

  // 后端返回字段：newVsReturn.newCount, newVsReturn.returnCount, totalPatients
  const newCount = data.newVsReturn?.newCount ?? 0;
  const returnCount = data.newVsReturn?.returnCount ?? 0;
  const total = data.totalPatients ?? 0;
  const returnRate = total > 0 ? Math.round((returnCount / total) * 100) : 0;

  const cards = [
    { label: "总接诊", value: total, color: "#6B7280" },
    { label: "新患", value: newCount, color: "#1E88D6" },
    { label: "复诊", value: returnCount, color: "#10B981" },
    { label: "复诊率", value: `${returnRate}%`, color: "#F59E0B" },
  ];

  return (
    <OpsCard title="患者分析" subtitle="本月患者维度数据">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        {cards.map((item, i) => (
          <div key={i} style={{ background: "#F8FAFC", borderRadius: 5, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 4 }}>{item.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: item.color }}>{item.value}</div>
          </div>
        ))}
      </div>
      {/* 性别分布 */}
      {data.genderDistribution && data.genderDistribution.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 6 }}>性别分布</div>
          <div style={{ display: "flex", gap: 6 }}>
            {data.genderDistribution.map((g, i) => (
              <div key={i} style={{ flex: 1, background: "#F8FAFC", borderRadius: 4, padding: "6px 8px", textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#9CA3AF" }}>{g.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#374151" }}>{g.count}</div>
                <div style={{ fontSize: 10, color: "#9CA3AF" }}>{g.ratio}%</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </OpsCard>
  );
}
