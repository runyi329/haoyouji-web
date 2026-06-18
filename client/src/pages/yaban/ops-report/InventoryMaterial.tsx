import OpsCard from "./OpsCard";
import { mockInventory } from "../mockData";
import { AlertCircle } from "lucide-react";

const STATUS_COLOR = { normal:"#10B981", warning:"#F59E0B", critical:"#EF4444" };
const STATUS_LABEL = { normal:"正常", warning:"预警", critical:"紧缺" };

export default function InventoryMaterial() {
  const data = mockInventory;
  return (
    <OpsCard title="库存与耗材" subtitle="高值耗材管理">
      {data.map((item, i) => (
        <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"7px 0", borderBottom: i < data.length-1 ? "1px solid #F9FAFB" : "none" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {item.status !== "normal" && <AlertCircle size={14} color={STATUS_COLOR[item.status]} />}
            <div>
              <div style={{ fontSize:12, color:"#374151" }}>{item.name}</div>
              <div style={{ fontSize:10, color:"#9CA3AF" }}>月用量 {item.monthUsage}{item.unit}</div>
            </div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:12, fontWeight:600, color:STATUS_COLOR[item.status] }}>{item.stock}{item.unit}</div>
            <div style={{ fontSize:10, color:"#9CA3AF" }}>剩余约{item.daysLeft}天</div>
          </div>
        </div>
      ))}
    </OpsCard>
  );
}
