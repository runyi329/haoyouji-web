import OpsCard from "./OpsCard";
import { trpc } from "@/lib/trpc";

interface PaymentMethodProps {
  startDate: string;
  endDate: string;
  tenantId?: number;
}

export default function PaymentMethod({ startDate, endDate, tenantId }: PaymentMethodProps) {
  const { data, isLoading } = trpc.yabanOps.paymentMethodStats.useQuery({
    startDate,
    endDate,
    tenantId,
  });

  if (isLoading) {
    return (
      <OpsCard title="收费方式" subtitle="本月支付渠道分布">
        <div>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: i < 3 ? "1px solid #F9FAFB" : "none" }}>
              <div style={{ height: 14, background: "#F3F4F6", borderRadius: 3, width: "40%" }} />
              <div style={{ height: 14, background: "#F3F4F6", borderRadius: 3, width: "25%" }} />
            </div>
          ))}
        </div>
      </OpsCard>
    );
  }

  const items = data?.items || [];
  // 后端 total 是原始金额（元），转换为万元
  const total = (data?.total || 0) / 10000;

  if (items.length === 0) {
    return (
      <OpsCard title="收费方式" subtitle="本月支付渠道分布">
        <div style={{ textAlign: "center", padding: "20px 0", color: "#9CA3AF" }}>暂无数据</div>
      </OpsCard>
    );
  }

  return (
    <OpsCard title="收费方式" subtitle="本月支付渠道分布">
      <div style={{ display: "flex", height: 12, borderRadius: 4, overflow: "hidden", marginBottom: 12 }}>
        {items.map((item, i) => (
          <div key={i} style={{ width: `${item.ratio}%`, background: `hsl(${i * 60}, 70%, 50%)` }} title={`${item.method} ${item.ratio}%`} />
        ))}
      </div>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: i < items.length - 1 ? "1px solid #F9FAFB" : "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: `hsl(${i * 60}, 70%, 50%)`, display: "inline-block", flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: "#374151" }}>{item.method}</span>
          </div>
          <div>
            {/* 后端 amount 是原始金额（元），转换为万元显示 */}
            <span style={{ fontSize: 12, fontWeight: 600, color: "#1F2937" }}>{(item.amount / 10000).toFixed(1)}万</span>
            <span style={{ fontSize: 10, color: "#9CA3AF", marginLeft: 6 }}>{item.ratio}%</span>
          </div>
        </div>
      ))}
      <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, color: "#9CA3AF" }}>合计</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#1F2937" }}>{total.toFixed(1)}万</span>
      </div>
    </OpsCard>
  );
}
