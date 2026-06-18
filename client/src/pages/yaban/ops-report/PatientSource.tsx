import OpsCard from "./OpsCard";
import { mockPatientSources } from "../mockData";

export default function PatientSource() {
  const data = mockPatientSources;
  const maxCount = Math.max(...data.map((d) => d.count));
  return (
    <OpsCard title="患者来源" subtitle="获客渠道ROI分析">
      {data.map((item, i) => (
        <div key={i} style={{ padding: "7px 0", borderBottom: i < data.length - 1 ? "1px solid #F9FAFB" : "none" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: "#374151" }}>{item.channel}</span>
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#1F2937" }}>{item.count}人</span>
              {item.roi > 0 && <span style={{ fontSize: 10, color: "#10B981", marginLeft: 6 }}>ROI {item.roi}%</span>}
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
