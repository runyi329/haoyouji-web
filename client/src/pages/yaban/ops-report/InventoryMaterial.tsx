import OpsCard from "./OpsCard";
import { AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";

const STATUS_COLOR = { normal:"#10B981", warning:"#F59E0B", critical:"#EF4444" };
const STATUS_LABEL = { normal:"正常", warning:"预警", critical:"紧缺" };

export default function InventoryMaterial(props: { startDate: string; endDate: string; tenantId?: number }) {
  const { data, isLoading } = trpc.yabanOps.inventoryWarning.useQuery({ tenantId: props.tenantId });

  if (isLoading) {
    return (
      <OpsCard title="库存与耗材" subtitle="高值耗材管理">
        <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} style={{ height:"40px", backgroundColor:"#F3F4F6", borderRadius:"4px" }} />
          ))}
        </div>
      </OpsCard>
    );
  }

  if (!data?.items || data.items.length === 0) {
    return (
      <OpsCard title="库存与耗材" subtitle="高值耗材管理">
        <div style={{ textAlign:"center", color:"#9CA3AF", padding:"20px 0" }}>暂无数据</div>
      </OpsCard>
    );
  }

  return (
    <OpsCard title="库存与耗材" subtitle="高值耗材管理">
      {data.items.map((item, i) => (
        <div key={item.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"7px 0", borderBottom: i < data.items.length-1 ? "1px solid #F9FAFB" : "none" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {item.status !== "normal" && <AlertCircle size={14} color={STATUS_COLOR[item.status]} />}
            <div>
              <div style={{ fontSize:12, color:"#374151" }}>{item.name}</div>
              <div style={{ fontSize:10, color:"#9CA3AF" }}>库存 {item.currentStock}{item.unit}</div>
            </div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:12, fontWeight:600, color:STATUS_COLOR[item.status] }}>{STATUS_LABEL[item.status]}</div>
            <div style={{ fontSize:10, color:"#9CA3AF" }}>{item.daysToExpiry ? `剩余${item.daysToExpiry}天` : `安全库存: ${item.safetyStock}`}</div>
          </div>
        </div>
      ))}
    </OpsCard>
  );
}