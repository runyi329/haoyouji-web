/**
 * WeekCompareChart - 周对比图
 * 本周 vs 上周 vs AI预测（+1周/+4周）
 */

import { useState } from "react";
import { mockWeekCompare } from "../../mockData";

export default function WeekCompareChart() {
  const [forecast, setForecast] = useState<1 | 4>(1);
  const data = mockWeekCompare;
  const maxVal = Math.max(...data.flatMap((d) => [d.thisWeek, d.lastWeek, d.aiNext])) * 1.15;

  const BAR_H_MAX = 120;
  const BAR_W = 8;
  const GROUP_W = 48;

  function toH(v: number) {
    return Math.max(4, (v / maxVal) * BAR_H_MAX);
  }

  return (
    <div>
      {/* 预测切换 */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {([1, 4] as const).map((w) => (
          <button
            key={w}
            onClick={() => setForecast(w)}
            style={{
              padding: "4px 12px",
              borderRadius: 7,
              border: `1px solid ${forecast === w ? "#1E88D6" : "#E5E7EB"}`,
              fontSize: 11,
              color: forecast === w ? "white" : "#6B7280",
              background: forecast === w ? "#1E88D6" : "white",
              cursor: "pointer",
              fontWeight: forecast === w ? 600 : 400,
            }}
          >
            +{w}周
          </button>
        ))}
      </div>

      {/* 柱状图 */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 0, overflowX: "auto", scrollbarWidth: "none" }}>
        {data.map((d, i) => (
          <div
            key={i}
            style={{
              width: GROUP_W,
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            {/* 三根柱子 */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: BAR_H_MAX }}>
              {[
                { val: d.lastWeek, color: "#CBD5E1", label: "上周" },
                { val: d.thisWeek, color: "#1E88D6", label: "本周" },
                { val: d.aiNext * (forecast === 4 ? 1.08 : 1), color: "#9C27B0", label: "AI" },
              ].map((bar) => (
                <div
                  key={bar.label}
                  style={{
                    width: BAR_W,
                    height: toH(bar.val),
                    background: bar.color,
                    borderRadius: "3px 3px 0 0",
                    position: "relative",
                  }}
                  title={`${bar.label}: ${bar.val.toFixed(1)}万`}
                />
              ))}
            </div>

            {/* 数值 */}
            <div style={{ fontSize: 9, color: "#1E88D6", fontWeight: 600, marginTop: 2 }}>
              {d.thisWeek.toFixed(1)}
            </div>

            {/* 日期标签 */}
            <div style={{ fontSize: 9, color: "#9CA3AF", marginTop: 1 }}>{d.day}</div>
          </div>
        ))}
      </div>

      {/* 图例 */}
      <div style={{ display: "flex", gap: 12, marginTop: 10, fontSize: 10, color: "#6B7280" }}>
        {[
          { color: "#CBD5E1", label: "上周" },
          { color: "#1E88D6", label: "本周" },
          { color: "#9C27B0", label: `AI预测(+${forecast}周)` },
        ].map((item) => (
          <span key={item.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: 2,
                background: item.color,
              }}
            />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
