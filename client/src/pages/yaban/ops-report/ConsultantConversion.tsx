import OpsCard from "./OpsCard";
import { trpc } from "@/lib/trpc";

export default function ConsultantConversion({ startDate, endDate, tenantId }: { startDate: string; endDate: string; tenantId?: number }) {
  const { data, isLoading } = trpc.yabanOps.consultantConversion.useQuery({ startDate, endDate, tenantId });

  if (isLoading) {
    return (
      <OpsCard title="咨询师转化" subtitle="方案接受率与贡献">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{ background: "#F8FAFC", borderRadius: 5, padding: "10px 12px", height: 80 }}>
              <div style={{ width: '80%', height: 16, background: '#E5E7EB', borderRadius: 2, marginBottom: 8 }} />
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ width: '40%', height: 12, background: '#E5E7EB', borderRadius: 2 }} />
                <div style={{ width: '20%', height: 12, background: '#E5E7EB', borderRadius: 2 }} />
              </div>
              <div style={{ height: 4, background: "#E5E7EB", borderRadius: 2, overflow: "hidden" }} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                <div style={{ width: '40%', height: 12, background: '#E5E7EB', borderRadius: 2 }} />
                <div style={{ width: '20%', height: 12, background: '#E5E7EB', borderRadius: 2 }} />
              </div>
            </div>
          ))}
        </div>
      </OpsCard>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <OpsCard title="咨询师转化" subtitle="方案接受率与贡献">
        <div style={{ textAlign: "center", padding: "20px" }}>暂无数据</div>
      </OpsCard>
    );
  }

  return (
    <OpsCard title="咨询师转化" subtitle="方案接受率与贡献">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {data.items.map((c, i) => (
          <div key={i} style={{ background: "#F8FAFC", borderRadius: 5, padding: "10px 12px" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#1F2937", marginBottom: 4 }}>{c.consultantName}</div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: "#9CA3AF" }}>转化率</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#1E88D6" }}>{c.conversionRate}%</span>
            </div>
            <div style={{ height: 4, background: "#E5E7EB", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${c.conversionRate}%`, background: "#1E88D6", borderRadius: 2 }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
              <span style={{ fontSize: 10, color: "#9CA3AF" }}>贡献营收</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#374151" }}>{(c.revenue / 10000).toFixed(1)}万</span>
            </div>
          </div>
        ))}
      </div>
    </OpsCard>
  );
}
