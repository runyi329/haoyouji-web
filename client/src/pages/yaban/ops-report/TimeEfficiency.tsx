import OpsCard from "./OpsCard";
import { mockTimeSlots } from "../mockData";

export default function TimeEfficiency() {
  const data = mockTimeSlots;
  const maxPatients = Math.max(...data.map((d) => d.patients));
  const maxRevenue = Math.max(...data.map((d) => d.revenue));
  return (
    <OpsCard title="时段效率" subtitle="按时段接诊与产值分布">
      <div style={{ overflowX:"auto", scrollbarWidth:"none" }}>
        <div style={{ minWidth:320 }}>
          {data.map((slot, i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
              <span style={{ width:36, fontSize:9, color:"#9CA3AF", flexShrink:0 }}>{slot.hour}</span>
              <div style={{ flex:1, display:"flex", flexDirection:"column", gap:2 }}>
                <div style={{ height:5, background:"#F3F4F6", borderRadius:2, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${(slot.patients/maxPatients)*100}%`, background:"#1E88D6", borderRadius:2 }} />
                </div>
                <div style={{ height:5, background:"#F3F4F6", borderRadius:2, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${(slot.revenue/maxRevenue)*100}%`, background:"#10B981", borderRadius:2 }} />
                </div>
              </div>
              <div style={{ textAlign:"right", flexShrink:0 }}>
                <div style={{ fontSize:10, color:"#1E88D6" }}>{slot.patients}人</div>
                <div style={{ fontSize:10, color:"#10B981" }}>{slot.revenue}万</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display:"flex", gap:12, marginTop:8, fontSize:10, color:"#6B7280" }}>
        <span style={{ display:"flex", alignItems:"center", gap:4 }}>
          <span style={{ display:"inline-block", width:10, height:5, background:"#1E88D6", borderRadius:1 }} />接诊量
        </span>
        <span style={{ display:"flex", alignItems:"center", gap:4 }}>
          <span style={{ display:"inline-block", width:10, height:5, background:"#10B981", borderRadius:1 }} />产值
        </span>
      </div>
    </OpsCard>
  );
}
