/**
 * 牙伴运营报表主页面
 * 路由：/yaban/ops-report
 *
 * 设计规范：牙伴风格 - 蓝白商务，主色 #1E88D6，移动端优先，最大宽度 480px
 * 严禁 Emoji，图标统一用 lucide-react
 */

import { useState, useMemo } from "react";
import OpsHeader from "./ops-report/OpsHeader";
import OpsOverview from "./ops-report/OpsOverview";
import RevenueTrend from "./ops-report/RevenueTrend";
import RevenueStructure from "./ops-report/RevenueStructure";
import DoctorPerformance from "./ops-report/DoctorPerformance";
import ConsultantConversion from "./ops-report/ConsultantConversion";
import PatientAnalysis from "./ops-report/PatientAnalysis";
import PatientSource from "./ops-report/PatientSource";
import OperationEfficiency from "./ops-report/OperationEfficiency";
import PaymentMethod from "./ops-report/PaymentMethod";
import DebtWarning from "./ops-report/DebtWarning";
import AnnualProgress from "./ops-report/AnnualProgress";
import CostProfit from "./ops-report/CostProfit";
import InventoryMaterial from "./ops-report/InventoryMaterial";
import AppointmentFunnel from "./ops-report/AppointmentFunnel";
import MemberDeposit from "./ops-report/MemberDeposit";
import TimeEfficiency from "./ops-report/TimeEfficiency";
import { DATE_QUICK_OPTIONS } from "./mockData";
import { useYabanClinic } from "./useYabanClinic";

function toYmd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function getDefaultRange(): { startDate: string; endDate: string } {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  return { startDate: toYmd(firstDay), endDate: toYmd(today) };
}

export default function OpsReport() {
  const { clinics, currentTenantId, selectClinic } = useYabanClinic();

  const today = new Date();
  const defaultRange = getDefaultRange();
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
  const [selectedDate, setSelectedDate] = useState("month");
  const [dateLabel, setDateLabel] = useState(
    `本月（${today.getMonth() + 1}月1日 - ${today.getMonth() + 1}月${today.getDate()}日）`
  );

  // 将 clinics 转换为 OpsHeader 需要的 shops 格式
  const shops = useMemo(() => {
    if (clinics.length === 0) return [{ id: 0, name: "全部门店", badge: "全" }];
    return clinics.map((c) => ({
      id: c.tenantId,
      name: c.name,
      badge: c.shortName?.slice(0, 1) || c.name.slice(0, 1),
    }));
  }, [clinics]);

  const selectedShop = currentTenantId ?? (shops[0]?.id || 0);

  // 传给所有子组件的公共 props
  const queryProps = { startDate, endDate, tenantId: selectedShop || undefined };

  return (
    <div
      style={{
        maxWidth: 480,
        margin: "0 auto",
        minHeight: "100vh",
        background: "#F5F7FA",
        fontFamily: "Nunito, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif",
      }}
    >
      {/* 顶部导航 + 选择器 */}
      <OpsHeader
        shops={shops}
        selectedShop={selectedShop}
        onShopChange={(id) => selectClinic(id)}
        dateQuickOptions={DATE_QUICK_OPTIONS}
        selectedDate={selectedDate}
        dateLabel={dateLabel}
        onDateChange={(val, label) => {
          setSelectedDate(val);
          setDateLabel(label);
        }}
        onRangeChange={(start, end) => {
          setStartDate(start);
          setEndDate(end);
        }}
      />

      {/* 内容区 */}
      <div style={{ padding: "12px 12px 32px", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* 总览卡片 */}
        <OpsOverview {...queryProps} />

        {/* 营收趋势（柱状图/热力图/趋势图/周对比） */}
        <RevenueTrend {...queryProps} />

        {/* 收入结构 */}
        <RevenueStructure {...queryProps} />

        {/* 医生绩效 */}
        <DoctorPerformance {...queryProps} />

        {/* 咨询师转化 */}
        <ConsultantConversion {...queryProps} />

        {/* 患者分析 */}
        <PatientAnalysis {...queryProps} />

        {/* 患者来源 */}
        <PatientSource {...queryProps} />

        {/* 运营效率 */}
        <OperationEfficiency {...queryProps} />

        {/* 收费方式 */}
        <PaymentMethod {...queryProps} />

        {/* 欠费预警 */}
        <DebtWarning {...queryProps} />

        {/* 年度营收进度 */}
        <AnnualProgress {...queryProps} />

        {/* 成本与利润 */}
        <CostProfit {...queryProps} />

        {/* 库存与耗材 */}
        <InventoryMaterial {...queryProps} />

        {/* 预约漏斗 */}
        <AppointmentFunnel {...queryProps} />

        {/* 会员与储值 */}
        <MemberDeposit {...queryProps} />

        {/* 时段效率 */}
        <TimeEfficiency {...queryProps} />
      </div>
    </div>
  );
}
