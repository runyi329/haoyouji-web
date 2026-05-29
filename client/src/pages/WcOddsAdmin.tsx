/**
 * 世界杯赔率追踪 - 管理员页面
 * 功能：查看抓取状态、手动触发抓取、横向时间轴表格展示赔率变化
 */
import { useState, useRef } from "react";
import { ArrowLeft, RefreshCw, Play, Info } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { toast } from "sonner";

// 颜色常量（与WorldCup.tsx保持一致）
const BG = "#0D1B2A";
const BG2 = "#112236";
const BG3 = "#162C42";
const GOLD = "#FFD700";
const TEXT = "#E8EDF2";
const TEXT2 = "#8FA3B8";
const BORDER = "rgba(255,255,255,0.08)";

// 赔率变化颜色：赔率升高（变难）= 绿色，赔率降低（变容易/热门）= 红色
// 符合金融习惯：红涨绿跌（这里赔率降低=更热门=红色）
const COLOR_DOWN = "#FF4D4F";  // 赔率降低（更热门）= 红色
const COLOR_UP = "#52C41A";    // 赔率升高（变冷门）= 绿色
const COLOR_SAME = "#8FA3B8";  // 无变化 = 灰色

function formatTime(ts: string | null) {
  if (!ts) return "-";
  const d = new Date(ts);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mo}/${day} ${h}:${mi}`;
}

export default function WcOddsAdmin() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin";

  // 如果不是管理员，重定向
  if (user && !isAdmin) {
    navigate("/world-cup");
    return null;
  }

  const { data: stats, refetch: refetchStats } = trpc.wcOdds.getStats.useQuery();
  const { data: matrix, isLoading: matrixLoading, refetch: refetchMatrix } = trpc.wcOdds.getOddsMatrix.useQuery({ limit: 30 });

  const triggerFetch = trpc.wcOdds.triggerFetch.useMutation({
    onSuccess: (data) => {
      toast.success(`✅ 抓取成功！共 ${data.teamCount} 支球队，快照 #${data.snapshotId}`);
      refetchStats();
      refetchMatrix();
    },
    onError: (err) => {
      toast.error(`❌ 抓取失败：${err.message}`);
    },
  });

  const tableRef = useRef<HTMLDivElement>(null);

  // 构建表格数据
  const snapshots = matrix?.snapshots ?? [];
  const teams = matrix?.teams ?? [];
  const matrixData = matrix?.matrix ?? {};

  // 计算赔率变化颜色
  function getOddsColor(current: number | null, prev: number | null): string {
    if (!current || !prev) return COLOR_SAME;
    if (current < prev) return COLOR_DOWN; // 赔率降低=更热门=红色
    if (current > prev) return COLOR_UP;   // 赔率升高=变冷门=绿色
    return COLOR_SAME;
  }

  function getOddsArrow(current: number | null, prev: number | null): string {
    if (!current || !prev) return "";
    if (current < prev) return "↓";
    if (current > prev) return "↑";
    return "";
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: BG, color: TEXT }}>
      {/* 顶部导航 */}
      <div
        className="flex items-center gap-3 px-4 py-3 sticky top-0 z-30"
        style={{ backgroundColor: BG2, borderBottom: `1px solid ${BORDER}` }}
      >
        <button
          onClick={() => navigate("/world-cup")}
          className="w-8 h-8 flex items-center justify-center rounded-full"
          style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
        >
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>
        <span className="font-bold text-base" style={{ color: TEXT }}>
          赔率追踪
        </span>
        <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(255,215,0,0.15)", color: GOLD }}>
          管理员
        </span>
      </div>

      {/* 信息卡片 */}
      <div className="px-4 pt-4 pb-2 space-y-3">
        <div
          className="rounded-xl p-4"
          style={{ backgroundColor: BG3, border: `1px solid ${BORDER}` }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4" style={{ color: GOLD }} />
            <span className="text-sm font-semibold" style={{ color: GOLD }}>
              数据源信息
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div style={{ color: TEXT2 }} className="text-xs mb-1">数据来源</div>
              <div style={{ color: TEXT }} className="font-medium">wc-2026.com</div>
              <div style={{ color: TEXT2 }} className="text-xs">（聚合 Pinnacle + William Hill）</div>
            </div>
            <div>
              <div style={{ color: TEXT2 }} className="text-xs mb-1">抓取频率</div>
              <div style={{ color: TEXT }} className="font-medium">每4小时一次</div>
              <div style={{ color: TEXT2 }} className="text-xs">（部署后自动启动）</div>
            </div>
            <div>
              <div style={{ color: TEXT2 }} className="text-xs mb-1">累计运行</div>
              <div style={{ color: GOLD }} className="font-bold text-lg">
                {stats?.totalRuns ?? 0} 次
              </div>
            </div>
            <div>
              <div style={{ color: TEXT2 }} className="text-xs mb-1">最后更新</div>
              <div style={{ color: TEXT }} className="font-medium text-xs">
                {stats?.lastFetchedAt ? formatTime(stats.lastFetchedAt) : "尚未抓取"}
              </div>
            </div>
          </div>
        </div>

        {/* 手动触发按钮 */}
        <button
          onClick={() => triggerFetch.mutate()}
          disabled={triggerFetch.isPending}
          className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
          style={{
            backgroundColor: triggerFetch.isPending ? "rgba(255,215,0,0.3)" : "rgba(255,215,0,0.15)",
            border: `1px solid ${GOLD}`,
            color: GOLD,
          }}
        >
          {triggerFetch.isPending ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {triggerFetch.isPending ? "正在抓取..." : "立即抓取一次"}
        </button>
      </div>

      {/* 赔率追踪表格 */}
      <div className="px-4 pb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold" style={{ color: TEXT }}>
            赔率变化追踪
          </span>
          <span className="text-xs" style={{ color: TEXT2 }}>
            {snapshots.length > 0
              ? `共 ${snapshots.length} 次记录，最新：${formatTime(snapshots[snapshots.length - 1]?.fetchedAt ?? null)}`
              : "暂无数据"}
          </span>
        </div>

        {/* 颜色说明 */}
        <div className="flex items-center gap-4 mb-3 text-xs" style={{ color: TEXT2 }}>
          <span>
            <span style={{ color: COLOR_DOWN }}>↓红</span> = 赔率降低（更热门）
          </span>
          <span>
            <span style={{ color: COLOR_UP }}>↑绿</span> = 赔率升高（变冷门）
          </span>
        </div>

        {matrixLoading ? (
          <div className="text-center py-8" style={{ color: TEXT2 }}>
            加载中...
          </div>
        ) : snapshots.length === 0 ? (
          <div
            className="rounded-xl p-8 text-center"
            style={{ backgroundColor: BG3, border: `1px solid ${BORDER}` }}
          >
            <div style={{ color: TEXT2 }} className="text-sm">
              暂无赔率数据
            </div>
            <div style={{ color: TEXT2 }} className="text-xs mt-1">
              点击"立即抓取一次"获取第一批数据
            </div>
          </div>
        ) : (
          /* 横向滚动表格：首列冻结，时间列从左（新）到右（旧） */
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: `1px solid ${BORDER}` }}
          >
            <div
              ref={tableRef}
              style={{
                overflowX: "auto",
                overflowY: "auto",
                maxHeight: "calc(100vh - 380px)",
                WebkitOverflowScrolling: "touch",
              }}
            >
              <table
                style={{
                  borderCollapse: "collapse",
                  fontSize: 12,
                  minWidth: "100%",
                  tableLayout: "fixed",
                }}
              >
                {/* 表头 */}
                <thead>
                  <tr style={{ backgroundColor: BG2 }}>
                    {/* 冻结首列：球队名 */}
                    <th
                      style={{
                        position: "sticky",
                        left: 0,
                        zIndex: 10,
                        backgroundColor: BG2,
                        padding: "8px 10px",
                        textAlign: "left",
                        color: TEXT2,
                        fontWeight: 600,
                        borderBottom: `1px solid ${BORDER}`,
                        borderRight: `1px solid ${BORDER}`,
                        minWidth: 90,
                        width: 90,
                        whiteSpace: "nowrap",
                      }}
                    >
                      球队
                    </th>
                    {/* 时间列（新→旧，最新在左） */}
                    {[...snapshots].reverse().map((snap) => (
                      <th
                        key={snap.id}
                        style={{
                          padding: "8px 6px",
                          textAlign: "center",
                          color: TEXT2,
                          fontWeight: 500,
                          borderBottom: `1px solid ${BORDER}`,
                          borderRight: `1px solid ${BORDER}`,
                          minWidth: 72,
                          width: 72,
                          whiteSpace: "nowrap",
                          backgroundColor: BG2,
                        }}
                      >
                        {formatTime(snap.fetchedAt)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {teams.map((team: { name: string; code: string }, teamIdx: number) => {
                    const teamData = matrixData[team.name] ?? {};
                    // 按时间正序排列的快照（旧→新）
                    const snapshotsAsc = [...snapshots]; // 已是正序
                    // 反转用于显示（新→旧）
                    const snapshotsDesc = [...snapshots].reverse();

                    return (
                      <tr
                        key={team.name}
                        style={{
                          backgroundColor: teamIdx % 2 === 0 ? BG3 : BG2,
                        }}
                      >
                        {/* 冻结首列：球队名 */}
                        <td
                          style={{
                            position: "sticky",
                            left: 0,
                            zIndex: 5,
                            backgroundColor: teamIdx % 2 === 0 ? BG3 : BG2,
                            padding: "7px 10px",
                            borderRight: `1px solid ${BORDER}`,
                            borderBottom: `1px solid rgba(255,255,255,0.04)`,
                            whiteSpace: "nowrap",
                            color: TEXT,
                            fontWeight: 500,
                          }}
                        >
                          <span className="text-xs">{teamIdx + 1}. {team.name}</span>
                        </td>
                        {/* 赔率列（新→旧） */}
                        {snapshotsDesc.map((snap, colIdx) => {
                          const current = teamData[snap.id];
                          // 找前一次快照（时间上更早的那次）
                          // snapshotsDesc[colIdx+1] 是更旧的快照
                          const prevSnap = snapshotsDesc[colIdx + 1];
                          const prev = prevSnap ? teamData[prevSnap.id] : null;

                          const pinnacle = current?.pinnacle ? parseFloat(current.pinnacle) : null;
                          const prevPinnacle = prev?.pinnacle ? parseFloat(prev.pinnacle) : null;
                          const color = getOddsColor(pinnacle, prevPinnacle);
                          const arrow = getOddsArrow(pinnacle, prevPinnacle);

                          return (
                            <td
                              key={snap.id}
                              style={{
                                padding: "7px 6px",
                                textAlign: "center",
                                borderRight: `1px solid ${BORDER}`,
                                borderBottom: `1px solid rgba(255,255,255,0.04)`,
                                color: pinnacle ? color : "rgba(255,255,255,0.15)",
                                fontWeight: pinnacle && color !== COLOR_SAME ? 600 : 400,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {pinnacle ? (
                                <>
                                  <div>
                                    {arrow && (
                                      <span style={{ fontSize: 10, marginRight: 1 }}>{arrow}</span>
                                    )}
                                    {pinnacle.toFixed(2)}
                                  </div>
                                  <div style={{ fontSize: 9, opacity: 0.55, marginTop: 1 }}>
                                    {(100 / pinnacle).toFixed(1)}%
                                  </div>
                                </>
                              ) : (
                                <span style={{ color: "rgba(255,255,255,0.15)" }}>-</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
                {/* 隐含概率合计行 */}
                <tfoot>
                  <tr style={{ backgroundColor: "rgba(255,215,0,0.08)", borderTop: `2px solid ${BORDER}` }}>
                    <td
                      style={{
                        position: "sticky",
                        left: 0,
                        zIndex: 5,
                        backgroundColor: "rgba(255,215,0,0.12)",
                        padding: "8px 10px",
                        borderRight: `1px solid ${BORDER}`,
                        whiteSpace: "nowrap",
                        color: "rgba(255,215,0,0.9)",
                        fontWeight: 700,
                        fontSize: 11,
                      }}
                    >
                      隐含概率合计
                    </td>
                    {[...snapshots].reverse().map((snap) => {
                      // 计算该列所有球队的隐含概率之和
                      let total = 0;
                      let count = 0;
                      teams.forEach((team: { name: string; code: string }) => {
                        const teamData = matrixData[team.name] ?? {};
                        const current = teamData[snap.id];
                        const pinnacle = current?.pinnacle ? parseFloat(current.pinnacle) : null;
                        if (pinnacle && pinnacle > 0) {
                          total += (1 / pinnacle) * 100;
                          count++;
                        }
                      });
                      const overround = total - 100;
                      const color = total > 120 ? "#ff6b6b" : total > 110 ? "#ffd700" : "#4ade80";
                      return (
                        <td
                          key={snap.id}
                          style={{
                            padding: "8px 6px",
                            textAlign: "center",
                            borderRight: `1px solid ${BORDER}`,
                            color,
                            fontWeight: 700,
                            fontSize: 11,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {count > 0 ? (
                            <>
                              <div>{total.toFixed(1)}%</div>
                              <div style={{ fontSize: 9, opacity: 0.7 }}>+{overround.toFixed(1)}%</div>
                            </>
                          ) : "-"}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
