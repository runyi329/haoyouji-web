/**
 * DoctorPerformance - 医生绩效
 */

import OpsCard from "./OpsCard";
import { mockDoctorPerf } from "../mockData";

export default function DoctorPerformance() {
  const data = mockDoctorPerf;
  const maxVal = Math.max(...data.map((d) => d.value));

  return (
    <OpsCard title="医生绩效" subtitle="本月产值排名" action="全部">
      {data.map((doc, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "7px 0",
            borderBottom: i < data.length - 1 ? "1px solid #F9FAFB" : "none",
          }}
        >
          {/* 排名 */}
          <span
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: i < 3 ? ["#F59E0B", "#9CA3AF", "#CD7C3A"][i] : "#F3F4F6",
              color: i < 3 ? "white" : "#9CA3AF",
              fontSize: 10,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {i + 1}
          </span>

          {/* 医生名 */}
          <span style={{ width: 42, fontSize: 12, color: "#374151", flexShrink: 0 }}>{doc.name}</span>

          {/* 进度条 */}
          <div style={{ flex: 1, height: 6, background: "#F3F4F6", borderRadius: 3, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${(doc.value / maxVal) * 100}%`,
                background: i === 0 ? "#1E88D6" : "#3BA9E0",
                borderRadius: 3,
                transition: "width 0.6s ease",
              }}
            />
          </div>

          {/* 数值 */}
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#1F2937" }}>{doc.value.toFixed(1)}万</span>
            <span style={{ fontSize: 9, color: "#9CA3AF", display: "block" }}>{doc.patients}人</span>
          </div>
        </div>
      ))}
    </OpsCard>
  );
}
