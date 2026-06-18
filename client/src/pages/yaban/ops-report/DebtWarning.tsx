import OpsCard from "./OpsCard";
import { mockDebtRecords } from "../mockData";
import { AlertTriangle } from "lucide-react";

export default function DebtWarning() {
  const data = mockDebtRecords;
  const total = data.reduce((s, d) => s + d.amount, 0);
  return (
    <OpsCard title="欠费预警" subtitle={`${data.length}位患者待回款`} action={<span style={{color:"#EF4444"}}>¥{(total/10000).toFixed(1)}万</span>}>
      {data.map((item, i) => (
        <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"7px 0", borderBottom: i < data.length-1 ? "1px solid #F9FAFB" : "none" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <AlertTriangle size={14} color={item.daysOverdue > 30 ? "#EF4444" : item.daysOverdue > 14 ? "#F59E0B" : "#9CA3AF"} />
            <div>
              <div style={{ fontSize:12, color:"#374151", fontWeight:500 }}>{item.patientName}</div>
              <div style={{ fontSize:10, color:"#9CA3AF" }}>{item.doctor} · 逾期{item.daysOverdue}天</div>
            </div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:13, fontWeight:700, color:"#EF4444" }}>¥{item.amount.toLocaleString()}</div>
            <div style={{ fontSize:10, color:"#9CA3AF" }}>最近联系 {item.lastContact}</div>
          </div>
        </div>
      ))}
    </OpsCard>
  );
}
