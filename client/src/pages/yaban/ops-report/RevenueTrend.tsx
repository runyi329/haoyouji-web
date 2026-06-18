/**
 * RevenueTrend - 营收趋势卡片
 * 包含 4 个 Tab：柱状图 / 热力图 / 趋势图 / 周对比
 */

import { useState, useRef, useEffect } from "react";
import OpsCard from "./OpsCard";
import BarChart from "./charts/BarChart";
import HeatmapChart from "./charts/HeatmapChart";
import AreaChart from "./charts/AreaChart";
import WeekCompareChart from "./charts/WeekCompareChart";

const TABS = [
  { id: "bar", label: "柱状图" },
  { id: "heatmap", label: "热力图" },
  { id: "area", label: "趋势图" },
  { id: "week", label: "周对比" },
];

export default function RevenueTrend() {
  const [activeTab, setActiveTab] = useState("bar");
  const [dateRange, setDateRange] = useState("5月19日 - 5月27日");
  const tabsRef = useRef<HTMLDivElement>(null);

  // 滚动到激活tab
  useEffect(() => {
    const el = tabsRef.current?.querySelector(`[data-tab="${activeTab}"]`) as HTMLElement;
    el?.scrollIntoView({ inline: "center", behavior: "smooth", block: "nearest" });
  }, [activeTab]);

  return (
    <OpsCard
      title="营收趋势"
      subtitle="AI多维视角分析"
      action={<span style={{ fontSize: 11, color: "#6B7280" }}>{dateRange}</span>}
    >
      {/* 图表区 */}
      <div style={{ marginTop: 4 }}>
        {activeTab === "bar" && <BarChart onDateRangeChange={setDateRange} />}
        {activeTab === "heatmap" && <HeatmapChart />}
        {activeTab === "area" && <AreaChart />}
        {activeTab === "week" && <WeekCompareChart />}
      </div>

      {/* Tab 切换 */}
      <div
        ref={tabsRef}
        style={{
          display: "flex",
          gap: 6,
          marginTop: 12,
          overflowX: "auto",
          scrollbarWidth: "none",
          paddingBottom: 2,
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            data-tab={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flexShrink: 0,
              padding: "6px 14px",
              borderRadius: 8,
              border: "none",
              fontSize: 12,
              fontWeight: activeTab === tab.id ? 700 : 400,
              color: activeTab === tab.id ? "#1E88D6" : "#6B7280",
              background: activeTab === tab.id ? "#EAF4FE" : "transparent",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </OpsCard>
  );
}
