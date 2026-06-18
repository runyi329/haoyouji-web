import OpsCard from "./OpsCard";
import { mockPaymentMethods } from "../mockData";

export default function PaymentMethod() {
  const data = mockPaymentMethods;
  const total = data.reduce((s, d) => s + d.amount, 0);
  return (
    <OpsCard title="收费方式" subtitle="本月支付渠道分布">
      <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden", marginBottom: 12 }}>
        {data.map((item, i) => (
          <div key={i} style={{ width: `${item.pct}%`, background: item.color }} title={`${item.method} ${item.pct}%`} />
        ))}
      </div>
      {data.map((item, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: i < data.length - 1 ? "1px solid #F9FAFB" : "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: item.color, display: "inline-block", flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: "#374151" }}>{item.method}</span>
          </div>
          <div>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#1F2937" }}>{item.amount.toFixed(1)}万</span>
            <span style={{ fontSize: 10, color: "#9CA3AF", marginLeft: 6 }}>{item.pct}%</span>
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
