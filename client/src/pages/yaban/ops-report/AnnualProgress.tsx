import OpsCard from "./OpsCard";
import { trpc } from "@/lib/trpc";

interface AnnualProgressProps {
  startDate: string;
  endDate: string;
  tenantId?: number;
}

export default function AnnualProgress({ tenantId }: AnnualProgressProps) {
  const currentYear = new Date().getFullYear();
  const { data, isLoading, isError } = trpc.yabanOps.annualProgress.useQuery({
    tenantId,
    year: currentYear,
  });

  if (isLoading) {
    return (
      <OpsCard title="年度营收进度" subtitle={`${currentYear}年度目标跟踪`}>
        <div style={{ height: 100, backgroundColor: "#F3F4F6", borderRadius: 4 }} />
      </OpsCard>
    );
  }

  if (isError || !data || !data.items || data.items.length === 0) {
    return (
      <OpsCard title="年度营收进度" subtitle={`${currentYear}年度目标跟踪`}>
        <div style={{ textAlign: "center", padding: "20px 0", color: "#6B7280" }}>暂无数据</div>
      </OpsCard>
    );
  }

  const { items, totalActual, annualTarget } = data;
  const pct = annualTarget ? Math.round((totalActual / annualTarget) * 100) : 0;

  return (
    <OpsCard title="年度营收进度" subtitle={`${currentYear}年度目标跟踪`}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: "#6B7280" }}>已完成 <strong style={{ color: "#1F2937" }}>{totalActual.toFixed(1)}万</strong></span>
          <span style={{ fontSize: 12, color: "#6B7280" }}>目标 <strong style={{ color: "#1F2937" }}>{annualTarget}万</strong></span>
        </div>
        <div style={{ height: 8, background: "#F3F4F6", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg,#1E88D6,#3BA9E0)", borderRadius: 4 }} />
        </div>
        <div style={{ fontSize: 11, color: "#1E88D6", fontWeight: 600, marginTop: 4, textAlign: "right" }}>{pct}%</div>
      </div>
      <div style={{ display: "flex", gap: 2 }}>
        {items.map((m, i) => {
          const hasActual = m.actual > 0;
          const achieved = hasActual && m.actual >= m.target;
          return (
            <div key={i} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ height: 40, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 1 }}>
                {hasActual && (
                  <div style={{ width: "100%", background: achieved ? "#10B981" : "#1E88D6", borderRadius: "2px 2px 0 0", height: `${(m.actual / annualTarget) * 40}px`, minHeight: 4 }} />
                )}
                {!hasActual && (
                  <div style={{ width: "100%", background: "#F3F4F6", borderRadius: "2px 2px 0 0", height: `${(m.target / annualTarget) * 40}px`, minHeight: 4 }} />
                )}
              </div>
              <div style={{ fontSize: 8, color: "#9CA3AF", marginTop: 2 }}>{m.month.replace("月", "")}</div>
            </div>
          );
        })}
      </div>
    </OpsCard>
  );
}
