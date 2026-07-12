/**
 * RevenueStructure - 收入结构（环形图 + 列表）
 */

import OpsCard from "./OpsCard";
import { trpc } from "@/lib/trpc";

const RADIUS = 52;
const CX = 70;
const CY = 70;
const STROKE = 22;

function polarToXY(angle: number, r: number) {
  const rad = (angle - 90) * (Math.PI / 180);
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

function describeArc(startAngle: number, endAngle: number) {
  const start = polarToXY(startAngle, RADIUS);
  const end = polarToXY(endAngle, RADIUS);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function SkeletonView() {
  return (
    <OpsCard title="收入结构" subtitle="按项目类型">
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 140, height: 140, background: "#F3F4F6", borderRadius: "50%", flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} style={{ height: 16, background: "#F3F4F6", borderRadius: 3, marginBottom: 8 }} />
          ))}
        </div>
      </div>
    </OpsCard>
  );
}

export default function RevenueStructure({ startDate, endDate, tenantId }: { startDate: string; endDate: string; tenantId?: number }) {
  // 使用 revenueByCategory 接口（后端实际接口名）
  const { data, isLoading } = trpc.yabanOps.revenueByCategory.useQuery({
    startDate,
    endDate,
    tenantId,
  });

  if (isLoading) return <SkeletonView />;

  if (!data || data.items.length === 0) {
    return (
      <OpsCard title="收入结构" subtitle="按项目类型">
        <div style={{ textAlign: "center", padding: "20px 0", color: "#6B7280" }}>
          暂无数据
        </div>
      </OpsCard>
    );
  }

  // 预定义的颜色数组，确保每次渲染颜色一致
  const colors = ["#4F46E5", "#EC4899", "#F59E0B", "#10B981", "#6366F1", "#F472B6", "#FBBF24", "#34D399"];

  // 后端返回字段：categoryName, revenue, count, ratio
  const formattedData = data.items.map((item, index) => ({
    name: item.categoryName,
    value: item.revenue / 10000, // 转换为万元
    pct: item.ratio,
    color: colors[index % colors.length],
  }));

  const total = formattedData.reduce((s, d) => s + d.value, 0);

  let currentAngle = 0;
  const arcs = formattedData.map((d) => {
    const sweep = total > 0 ? (d.value / total) * 360 : 0;
    const arc = { ...d, startAngle: currentAngle, endAngle: currentAngle + sweep };
    currentAngle += sweep;
    return arc;
  });

  return (
    <OpsCard title="收入结构" subtitle="按项目类型">
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {/* 环形图 */}
        <div style={{ flexShrink: 0 }}>
          <svg width={140} height={140}>
            {arcs.map((arc, i) => (
              <path
                key={i}
                d={describeArc(arc.startAngle, arc.endAngle - 1)}
                fill="none"
                stroke={arc.color}
                strokeWidth={STROKE}
                strokeLinecap="butt"
              />
            ))}
            {/* 中心文字 */}
            <text x={CX} y={CY - 6} textAnchor="middle" fontSize={11} fill="#6B7280">
              总营收
            </text>
            <text x={CX} y={CY + 10} textAnchor="middle" fontSize={16} fontWeight="700" fill="#1F2937">
              {total.toFixed(1)}
            </text>
            <text x={CX} y={CY + 24} textAnchor="middle" fontSize={9} fill="#9CA3AF">
              万元
            </text>
          </svg>
        </div>

        {/* 列表 */}
        <div style={{ flex: 1 }}>
          {formattedData.map((item, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "5px 0",
                borderBottom: i < formattedData.length - 1 ? "1px solid #F9FAFB" : "none",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: item.color,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 12, color: "#374151" }}>{item.name}</span>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#1F2937" }}>
                  {item.value.toFixed(1)}万
                </span>
                <span style={{ fontSize: 10, color: "#9CA3AF", marginLeft: 4 }}>
                  {item.pct}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </OpsCard>
  );
}
