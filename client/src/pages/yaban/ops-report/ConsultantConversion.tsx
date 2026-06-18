/**
 * ConsultantConversion - 咨询师转化
 */
import OpsCard from "./OpsCard";
import { mockConsultants } from "../mockData";

export default function ConsultantConversion() {
  const data = mockConsultants;
  return (
    <OpsCard title="咨询师转化" subtitle="方案接受率与贡献">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {data.map((c, i) => (
          <div key={i} style={{ background: "#F8FAFC", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#1F2937", marginBottom: 4 }}>{c.name}</div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: "#9CA3AF" }}>转化率</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#1E88D6" }}>{c.convRate}%</span>
            </div>
            <div style={{ height: 4, background: "#E5E7EB", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${c.convRate}%`, background: "#1E88D6", borderRadius: 2 }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
              <span style={{ fontSize: 10, color: "#9CA3AF" }}>贡献营收</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#374151" }}>{c.revenue}万</span>
            </div>
          </div>
        ))}
      </div>
    </OpsCard>
  );
}
