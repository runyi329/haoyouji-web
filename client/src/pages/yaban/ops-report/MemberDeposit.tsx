import OpsCard from "./OpsCard";
import { trpc } from "@/lib/trpc";

interface MemberDepositProps {
  startDate: string;
  endDate: string;
  tenantId?: number;
}

export default function MemberDeposit({ startDate, endDate, tenantId }: MemberDepositProps) {
  const { data, isLoading, isError } = trpc.yabanOps.memberDeposit.useQuery({
    startDate,
    endDate,
    tenantId,
  });

  if (isLoading) {
    return (
      <OpsCard title="会员与储值" subtitle="储值客户经营分析">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{ background: "#F3F4F6", borderRadius: 5, padding: "10px 12px", height: 50 }} />
          ))}
        </div>
        <div style={{ height: 8, background: "#F3F4F6", borderRadius: 4, overflow: "hidden", marginBottom: 4 }} />
        <div style={{ height: 16, background: "#F3F4F6", borderRadius: 4, width: "50%" }} />
      </OpsCard>
    );
  }

  if (isError || !data || (data.totalCustomers === 0 && data.membersWithBalance === 0 && data.totalBalance === 0 && data.activeBalance === 0 && data.newCustomersThisMonth === 0 && data.avgBalancePerMember === 0)) {
    return (
      <OpsCard title="会员与储值" subtitle="储值客户经营分析">
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 150, color: "#6B7280" }}>
          暂无数据
        </div>
      </OpsCard>
    );
  }

  const d = data;
  // Assuming totalBalance from API maps to totalDeposit, and activeBalance is the remaining deposit.
  // usedDeposit is not directly available, so we calculate it as totalBalance - activeBalance.
  const totalDeposit = d.totalBalance;
  const usedDeposit = totalDeposit - d.activeBalance;
  const usedPct = totalDeposit > 0 ? Math.round((usedDeposit / totalDeposit) * 100) : 0;

  return (
    <OpsCard title="会员与储值" subtitle="储值客户经营分析">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        {[
          { label: "总会员数", value: d.totalCustomers, unit: "人", color: "#1E88D6", bg: "#EAF4FE" },
          { label: "活跃会员", value: d.membersWithBalance, unit: "人", color: "#10B981", bg: "#ECFDF5" },
          { label: "本月新增", value: d.newCustomersThisMonth, unit: "人", color: "#F59E0B", bg: "#FFFBEB" },
          { label: "人均储值", value: `¥${d.avgBalancePerMember.toLocaleString()}`, unit: "", color: "#9C27B0", bg: "#FDF4FF" },
        ].map((item, i) => (
          <div key={i} style={{ background: item.bg, borderRadius: 5, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 4 }}>{item.label}</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: item.color }}>{item.value}<span style={{ fontSize: 11, fontWeight: 400 }}>{item.unit}</span></div>
          </div>
        ))}
      </div>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: "#6B7280" }}>储值消耗 <strong style={{ color: "#1F2937" }}>{usedDeposit.toFixed(1)}万</strong></span>
          <span style={{ fontSize: 11, color: "#6B7280" }}>总储值 <strong style={{ color: "#1F2937" }}>{totalDeposit.toFixed(1)}万</strong></span>
        </div>
        <div style={{ height: 8, background: "#F3F4F6", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${usedPct}%`, background: "linear-gradient(90deg,#1E88D6,#3BA9E0)", borderRadius: 4 }} />
        </div>
        <div style={{ fontSize: 11, color: "#1E88D6", fontWeight: 600, marginTop: 4 }}>已消耗 {usedPct}%</div>
      </div>
    </OpsCard>
  );
}
