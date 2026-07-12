import OpsCard from "./OpsCard";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";

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
          <Skeleton className="h-[60px] w-full" />
          <Skeleton className="h-[60px] w-full" />
          <Skeleton className="h-[60px] w-full" />
          <Skeleton className="h-[60px] w-full" />
        </div>
        <Skeleton className="h-[150px] w-full mb-4" />
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <Skeleton className="h-[60px] flex-1" />
          <Skeleton className="h-[60px] flex-1" />
        </div>
      </OpsCard>
    );
  }

  if (isError || !data || (data.newPatients === 0 && data.returnPatients === 0)) {
    return (
      <OpsCard title="患者分析" subtitle="本月患者维度数据">
        <div style={{ textAlign: "center", padding: "20px 0", color: "#9CA3AF" }}>暂无数据</div>
      </OpsCard>
    );
  }

  const { newPatients, returnPatients, returnRate } = data;

  return (
    <OpsCard title="患者分析" subtitle="本月患者维度数据">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        {[
          { label: "新患", value: newPatients, color: "#1E88D6" },
          { label: "复诊", value: returnPatients, color: "#10B981" },
          { label: "复诊率", value: `${returnRate}%`, color: "#F59E0B" },
        ].map((item, i) => (
          <div key={i} style={{ background: "#F8FAFC", borderRadius: 5, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 4 }}>{item.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: item.color }}>{item.value}</div>
          </div>
        ))}
      </div>
      {/* Removed age distribution and gender distribution as data is not available from tRPC interface */}
    </OpsCard>
  );
}
