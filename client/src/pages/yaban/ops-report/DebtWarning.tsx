import OpsCard from "./OpsCard";
import { AlertTriangle } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface DebtWarningProps {
  startDate: string;
  endDate: string;
  tenantId?: number;
}

export default function DebtWarning({ tenantId }: DebtWarningProps) {
  const { data, isLoading, isError } = trpc.yabanOps.debtWarning.useQuery({
    tenantId,
  });

  if (isLoading) {
    return (
      <OpsCard title="欠费预警" subtitle="" action={<span></span>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 14, height: 14, backgroundColor: "#E5E7EB", borderRadius: "50%" }}></div>
                <div>
                  <div style={{ width: 80, height: 12, backgroundColor: "#E5E7EB", marginBottom: 4 }}></div>
                  <div style={{ width: 120, height: 10, backgroundColor: "#E5E7EB" }}></div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ width: 60, height: 13, backgroundColor: "#E5E7EB", marginBottom: 4 }}></div>
                <div style={{ width: 90, height: 10, backgroundColor: "#E5E7EB" }}></div>
              </div>
            </div>
          ))}
        </div>
      </OpsCard>
    );
  }

  if (isError || !data || data.items.length === 0) {
    return (
      <OpsCard title="欠费预警" subtitle="" action={<span></span>}>
        <div style={{ textAlign: "center", padding: "20px 0", color: "#9CA3AF" }}>暂无数据</div>
      </OpsCard>
    );
  }

  const totalOwedAmount = data.totalOwedAmount || 0;
  const totalOwedCount = data.totalOwedCount || 0;

  return (
    <OpsCard title="欠费预警" subtitle={`${totalOwedCount}位患者待回款`} action={<span style={{color:"#EF4444"}}>¥{(totalOwedAmount/10000).toFixed(1)}万</span>}>
      {data.items.map((item, i) => (
        <div key={item.customerId} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"7px 0", borderBottom: i < data.items.length-1 ? "1px solid #F9FAFB" : "none" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <AlertTriangle size={14} color="#EF4444" />
            <div>
              <div style={{ fontSize:12, color:"#374151", fontWeight:500 }}>{item.customerName}</div>
              {/* 医生和逾期天数信息在新的API中不可用，因此移除 */}
              {/* <div style={{ fontSize:10, color:"#9CA3AF" }}>{item.doctor} · 逾期{item.daysOverdue}天</div> */}
            </div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:13, fontWeight:700, color:"#EF4444" }}>¥{item.totalOwed.toLocaleString()}</div>
            {/* 最近联系信息在新的API中不可用，因此移除 */}
            {/* <div style={{ fontSize:10, color:"#9CA3AF" }}>最近联系 {item.lastContact}</div> */}
          </div>
        </div>
      ))}
    </OpsCard>
  );
}
