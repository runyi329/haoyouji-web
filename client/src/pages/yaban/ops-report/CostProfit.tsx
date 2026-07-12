import OpsCard from "./OpsCard";
import { trpc } from "@/lib/trpc";

export default function CostProfit({ startDate, endDate, tenantId }: { startDate: string; endDate: string; tenantId?: number }) {
  const { data, isLoading, isError } = trpc.yabanOps.costProfit.useQuery({
    startDate,
    endDate,
    tenantId,
  });

  if (isLoading) {
    return (
      <OpsCard title="成本与利润" subtitle="本月经营效益分析">
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
          <div style={{ background:"#EAF4FE", borderRadius: 5, padding:"10px 12px" }}>
            <div style={{ fontSize:10, color:"#6B7280" }}>毛利率</div>
            <div style={{ fontSize:22, fontWeight:800, color:"#D1D5DB" }}>--</div>
          </div>
          <div style={{ background:"#ECFDF5", borderRadius: 5, padding:"10px 12px" }}>
            <div style={{ fontSize:10, color:"#6B7280" }}>净利率</div>
            <div style={{ fontSize:22, fontWeight:800, color:"#D1D5DB" }}>--</div>
          </div>
        </div>
        {[...Array(5)].map((_, i) => (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
            <span style={{ width:8, height:8, borderRadius: 2, background:"#D1D5DB", flexShrink:0, display:"inline-block" }} />
            <span style={{ flex:1, fontSize:11, color:"#D1D5DB" }}>加载中...</span>
            <div style={{ flex:2, height:5, background:"#E5E7EB", borderRadius: 2, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${Math.random() * 70 + 30}%`, background:"#D1D5DB", borderRadius: 2 }} />
            </div>
            <span style={{ width:36, fontSize:11, color:"#D1D5DB", textAlign:"right", flexShrink:0 }}>--</span>
          </div>
        ))}
      </OpsCard>
    );
  }

  if (isError || !data) {
    return (
      <OpsCard title="成本与利润" subtitle="本月经营效益分析">
        <div style={{ textAlign: "center", padding: "20px" }}>暂无数据</div>
      </OpsCard>
    );
  }

  const costs = [
    { label:"耗材成本", value:data.materialCost, color:"#EF4444" },
    { label:"人力成本", value:data.laborCost, color:"#F59E0B" },
    { label:"其他成本", value:data.otherCost, color:"#9CA3AF" },
  ];

  return (
    <OpsCard title="成本与利润" subtitle="本月经营效益分析">
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
        <div style={{ background:"#EAF4FE", borderRadius: 5, padding:"10px 12px" }}>
          <div style={{ fontSize:10, color:"#6B7280" }}>毛利率</div>
          <div style={{ fontSize:22, fontWeight:800, color:"#1E88D6" }}>{data.grossMargin?.toFixed(1) || 0}%</div>
        </div>
        <div style={{ background:"#ECFDF5", borderRadius: 5, padding:"10px 12px" }}>
          <div style={{ fontSize:10, color:"#6B7280" }}>净利率</div>
          <div style={{ fontSize:22, fontWeight:800, color:"#10B981" }}>{data.netMargin?.toFixed(1) || 0}%</div>
        </div>
      </div>
      {costs.map((item, i) => (
        <div key={i} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
          <span style={{ width:8, height:8, borderRadius: 2, background:item.color, flexShrink:0, display:"inline-block" }} />
          <span style={{ flex:1, fontSize:11, color:"#6B7280" }}>{item.label}</span>
          <div style={{ flex:2, height:5, background:"#F3F4F6", borderRadius: 2, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${(item.value / (data.revenue || 1)) * 100}%`, background:item.color, borderRadius: 2 }} />
          </div>
          <span style={{ width:36, fontSize:11, color:"#374151", textAlign:"right", flexShrink:0 }}>{item.value?.toFixed(1) || 0}万</span>
        </div>
      ))}
    </OpsCard>
  );
}