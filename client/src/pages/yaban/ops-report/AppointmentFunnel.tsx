import OpsCard from "./OpsCard";
import { trpc } from "@/lib/trpc";

export default function AppointmentFunnel({ startDate, endDate, tenantId }: { startDate: string; endDate: string; tenantId?: number }) {
  const { data, isLoading } = trpc.yabanOps.appointmentFunnel.useQuery({ startDate, endDate, tenantId });

  if (isLoading) {
    return (
      <OpsCard title="预约漏斗" subtitle="从咨询到成交全链路">
        <div style={{ height: 150, backgroundColor: '#F3F4F6', borderRadius: 8 }} />
      </OpsCard>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <OpsCard title="预约漏斗" subtitle="从咨询到成交全链路">
        <div style={{ textAlign: 'center', padding: '20px 0', color: '#6B7280' }}>暂无数据</div>
      </OpsCard>
    );
  }

  const funnelData = data.items;
  return (
    <OpsCard title="预约漏斗" subtitle="从咨询到成交全链路">
      {funnelData.map((step, i) => (
        <div key={i} style={{ marginBottom: i < funnelData.length-1 ? 8 : 0 }}>
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
          {i < funnelData.length-1 && (
            <div style={{ fontSize:10, color:"#9CA3AF", textAlign:"right", marginTop:2 }}>
              流失 {(funnelData[i].count - funnelData[i+1].count)}人 ({(100 - funnelData[i+1].pct / funnelData[i].pct * 100).toFixed(1)}%)
            </div>
          )}
        </div>
      ))}
    </OpsCard>
  );
}