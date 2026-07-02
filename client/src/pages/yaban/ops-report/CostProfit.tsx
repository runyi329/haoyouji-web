import OpsCard from "./OpsCard";
import { mockCostProfit } from "../mockData";

export default function CostProfit() {
  const d = mockCostProfit;
  const costs = [
    { label:"耗材成本", value:d.materialCost, color:"#EF4444" },
    { label:"人力成本", value:d.laborCost, color:"#F59E0B" },
    { label:"房租成本", value:d.rentCost, color:"#8B5CF6" },
    { label:"营销成本", value:d.marketingCost, color:"#EC4899" },
    { label:"其他", value:d.otherCost, color:"#9CA3AF" },
  ];
  return (
    <OpsCard title="成本与利润" subtitle="本月经营效益分析">
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
        <div style={{ background:"#EAF4FE", borderRadius: 5, padding:"10px 12px" }}>
          <div style={{ fontSize:10, color:"#6B7280" }}>毛利率</div>
          <div style={{ fontSize:22, fontWeight:800, color:"#1E88D6" }}>{d.grossMargin}%</div>
        </div>
        <div style={{ background:"#ECFDF5", borderRadius: 5, padding:"10px 12px" }}>
          <div style={{ fontSize:10, color:"#6B7280" }}>净利率</div>
          <div style={{ fontSize:22, fontWeight:800, color:"#10B981" }}>{d.netMargin}%</div>
        </div>
      </div>
      {costs.map((item, i) => (
        <div key={i} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
          <span style={{ width:8, height:8, borderRadius: 2, background:item.color, flexShrink:0, display:"inline-block" }} />
          <span style={{ flex:1, fontSize:11, color:"#6B7280" }}>{item.label}</span>
          <div style={{ flex:2, height:5, background:"#F3F4F6", borderRadius: 2, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${(item.value/d.revenue)*100}%`, background:item.color, borderRadius: 2 }} />
          </div>
          <span style={{ width:36, fontSize:11, color:"#374151", textAlign:"right", flexShrink:0 }}>{item.value.toFixed(1)}万</span>
        </div>
      ))}
    </OpsCard>
  );
}
