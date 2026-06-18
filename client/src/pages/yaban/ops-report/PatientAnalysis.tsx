import OpsCard from "./OpsCard";
import { mockPatientAnalysis } from "../mockData";

export default function PatientAnalysis() {
  const d = mockPatientAnalysis;
  const total = d.newPatients + d.returnPatients;
  return (
    <OpsCard title="患者分析" subtitle="本月患者维度数据">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        {[
          { label: "新患", value: d.newPatients, color: "#1E88D6" },
          { label: "复诊", value: d.returnPatients, color: "#10B981" },
          { label: "复诊率", value: `${d.returnRate}%`, color: "#F59E0B" },
          { label: "平均年龄", value: `${d.avgAge}岁`, color: "#9C27B0" },
        ].map((item, i) => (
          <div key={i} style={{ background: "#F8FAFC", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 4 }}>{item.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: item.color }}>{item.value}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 6 }}>年龄分布</div>
      {d.ageGroups.map((g, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
          <span style={{ width: 36, fontSize: 10, color: "#9CA3AF", flexShrink: 0 }}>{g.label}</span>
          <div style={{ flex: 1, height: 6, background: "#F3F4F6", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(g.count / total) * 100}%`, background: "#1E88D6", borderRadius: 3 }} />
          </div>
          <span style={{ width: 28, fontSize: 10, color: "#374151", textAlign: "right", flexShrink: 0 }}>{g.count}</span>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <div style={{ flex: 1, background: "#EAF4FE", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
          <div style={{ fontSize: 10, color: "#6B7280" }}>男</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1E88D6" }}>{d.genderMale}%</div>
        </div>
        <div style={{ flex: 1, background: "#FDF2F8", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
          <div style={{ fontSize: 10, color: "#6B7280" }}>女</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#EC4899" }}>{d.genderFemale}%</div>
        </div>
      </div>
    </OpsCard>
  );
}
