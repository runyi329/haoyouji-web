/**
 * 牙伴运营报表主页面
 * 路由：/yaban/ops-report（主项目注册时使用）
 *
 * 设计规范：牙伴风格 - 蓝白商务，主色 #1E88D6，移动端优先，最大宽度 480px
 * 严禁 Emoji，图标统一用 lucide-react
 */

import { useState } from "react";
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
import { SHOPS, DATE_QUICK_OPTIONS } from "./mockData";

export default function OpsReport() {
  const [selectedShop, setSelectedShop] = useState(0);
  const [selectedDate, setSelectedDate] = useState("month");
  const [dateLabel, setDateLabel] = useState("本月（6月1日 - 6月16日）");

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
        shops={SHOPS}
        selectedShop={selectedShop}
        onShopChange={setSelectedShop}
        dateQuickOptions={DATE_QUICK_OPTIONS}
        selectedDate={selectedDate}
        dateLabel={dateLabel}
        onDateChange={(val, label) => {
          setSelectedDate(val);
          setDateLabel(label);
        }}
      />

      {/* 内容区 */}
      <div style={{ padding: "12px 12px 32px", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* 总览卡片 */}
        <OpsOverview />

        {/* 营收趋势（柱状图/热力图/趋势图/周对比） */}
        <RevenueTrend />

        {/* 收入结构 */}
        <RevenueStructure />

        {/* 医生绩效 */}
        <DoctorPerformance />

        {/* 咨询师转化 */}
        <ConsultantConversion />

        {/* 患者分析 */}
        <PatientAnalysis />

        {/* 患者来源 */}
        <PatientSource />

        {/* 运营效率 */}
        <OperationEfficiency />

        {/* 收费方式 */}
        <PaymentMethod />

        {/* 欠费预警 */}
        <DebtWarning />

        {/* 年度营收进度 */}
        <AnnualProgress />

        {/* 成本与利润 */}
        <CostProfit />

        {/* 库存与耗材 */}
        <InventoryMaterial />

        {/* 预约漏斗 */}
        <AppointmentFunnel />

        {/* 会员与储值 */}
        <MemberDeposit />

        {/* 时段效率 */}
        <TimeEfficiency />
      </div>
    </div>
  );
}
