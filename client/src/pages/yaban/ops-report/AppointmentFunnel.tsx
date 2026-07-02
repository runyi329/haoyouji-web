import OpsCard from "./OpsCard";
import { mockAppointmentFunnel } from "../mockData";

export default function AppointmentFunnel() {
  const data = mockAppointmentFunnel;
  return (
    <OpsCard title="预约漏斗" subtitle="从咨询到成交全链路">
      {data.map((step, i) => (
        <div key={i} style={{ marginBottom: i < data.length-1 ? 8 : 0 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
            <span style={{ fontSize:12, color:"#374151" }}>{step.label}</span>
            <div>
              <span style={{ fontSize:12, fontWeight:700, color:"#1F2937" }}>{step.count}</span>
              <span style={{ fontSize:10, color:"#9CA3AF", marginLeft:6 }}>{step.pct}%</span>
            </div>
          </div>
          <div style={{ height:8, background:"#F3F4F6", borderRadius: 4, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${step.pct}%`, background:`rgba(30,136,214,${0.4 + i*0.12})`, borderRadius: 4 }} />
          </div>
          {i < data.length-1 && (
            <div style={{ fontSize:10, color:"#9CA3AF", textAlign:"right", marginTop:2 }}>
              流失 {(data[i].count - data[i+1].count)}人 ({(100 - data[i+1].pct / data[i].pct * 100).toFixed(1)}%)
            </div>
          )}
        </div>
      ))}
    </OpsCard>
  );
}
