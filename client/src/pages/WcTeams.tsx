import { useState } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft, Search } from "lucide-react";
import { wcTeams, teamsByGroup, type TeamData } from "@/data/wcTeams";

// ===== 颜色常量（与 WorldCup.tsx 保持一致） =====
const BG   = "#0D1B2A";
const BG2  = "#112236";
const BG3  = "#162C42";
const GOLD = "#FFD700";
const TEXT  = "#E8EDF2";
const TEXT2 = "#8FA3B8";
const BORDER = "rgba(255,255,255,0.08)";

// ===== 国旗图片 =====
function Flag({ code, size = 28 }: { code: string; size?: number }) {
  return (
    <img
      src={`/flags/${code.toLowerCase()}.png`}
      width={size}
      height={Math.round(size * 0.67)}
      alt={code}
      style={{ borderRadius: 2, objectFit: "cover", display: "inline-block", flexShrink: 0 }}
      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
    />
  );
}

// ===== 排名颜色 =====
function rankColor(rank: number) {
  if (rank <= 5)  return GOLD;
  if (rank <= 15) return "#FF9500";
  if (rank <= 30) return "#5BA3FF";
  return TEXT2;
}

// ===== 位置徽章样式 =====
const posBadge: Record<string, { bg: string; color: string; label: string }> = {
  GK:     { bg: "rgba(255,215,0,0.15)",   color: GOLD,      label: "门将" },
  DF:     { bg: "rgba(91,163,255,0.15)",  color: "#5BA3FF", label: "后卫" },
  MF:     { bg: "rgba(80,220,120,0.15)",  color: "#50DC78", label: "中场" },
  FW:     { bg: "rgba(255,80,80,0.15)",   color: "#FF5050", label: "前锋" },
  COACH:  { bg: "rgba(180,120,255,0.15)", color: "#B478FF", label: "主教练" },
};

// ===== 球队详情页 =====
function TeamDetail({ team, backHref }: { team: TeamData; backHref: string }) {
  // 按位置顺序排列：GK → DF → MF → FW，主教练最后
  const posOrder = ["GK", "DF", "MF", "FW"];
  const sortedPlayers = [...team.players].sort((a, b) => {
    return posOrder.indexOf(a.pos) - posOrder.indexOf(b.pos);
  });

  return (
    <div style={{ minHeight: "100vh", background: BG, paddingBottom: 32, maxWidth: 480, margin: "0 auto" }}>

      {/* 顶部导航 */}
      <div style={{
        position: "sticky", top: 0, zIndex: 10,
        background: BG2,
        borderBottom: `1px solid ${BORDER}`,
        padding: "10px 16px",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <Link href={backHref}>
          <button style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}>
            <ArrowLeft style={{ width: 18, height: 18, color: TEXT2 }} />
          </button>
        </Link>
        <Flag code={team.code} size={20} />
        <span style={{ fontWeight: 700, color: TEXT, fontSize: 15, flex: 1 }}>{team.nameCn}</span>
        <span style={{ color: TEXT2, fontSize: 11 }}>{team.name}</span>
      </div>

      {/* 球队概览：紧凑一行 */}
      <div style={{
        margin: "12px 16px 0",
        background: BG3,
        borderRadius: 12,
        border: `1px solid ${BORDER}`,
        padding: "14px 16px",
        display: "flex", alignItems: "center", gap: 14,
      }}>
        <Flag code={team.code} size={52} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: TEXT, lineHeight: 1.2 }}>{team.nameCn}</div>
          <div style={{ fontSize: 12, color: TEXT2, marginTop: 2 }}>{team.name}</div>
          {/* 信息标签行 */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            <span style={{
              background: "rgba(255,215,0,0.12)", color: rankColor(team.fifaRank),
              fontSize: 12, fontWeight: 700, padding: "2px 10px", borderRadius: 20,
              border: `1px solid ${rankColor(team.fifaRank)}30`,
            }}>
              FIFA {team.fifaRank}
            </span>
            <span style={{
              background: "rgba(255,255,255,0.06)", color: TEXT2,
              fontSize: 12, padding: "2px 10px", borderRadius: 20,
              border: `1px solid ${BORDER}`,
            }}>
              {team.group} 组
            </span>
            <span style={{
              background: "rgba(255,255,255,0.06)", color: TEXT2,
              fontSize: 12, padding: "2px 10px", borderRadius: 20,
              border: `1px solid ${BORDER}`,
            }}>
              {team.players.length} 人
            </span>
          </div>
        </div>
      </div>

      {/* 球员名单 */}
      {team.players.length > 0 ? (
        <div style={{ margin: "10px 16px 0", borderRadius: 12, overflow: "hidden", border: `1px solid ${BORDER}` }}>
          {sortedPlayers.map((player, idx) => {
            const badge = posBadge[player.pos] || posBadge.MF;
            return (
              <div
                key={idx}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 12px",
                  background: idx % 2 === 0 ? BG3 : BG2,
                  borderBottom: idx < sortedPlayers.length - 1 ? `1px solid ${BORDER}` : "none",
                }}
              >
                {/* 头像占位 */}
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: badge.bg,
                  border: `1.5px solid ${badge.color}40`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                  fontSize: 12, fontWeight: 700, color: badge.color,
                }}>
                  {(player.nameCn || player.name).charAt(0)}
                </div>

                {/* 姓名 + 俱乐部 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                    {/* 位置标签 */}
                    <span style={{
                      background: badge.bg, color: badge.color,
                      fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 8,
                      border: `1px solid ${badge.color}30`,
                      flexShrink: 0,
                    }}>
                      {badge.label}
                    </span>
                    {/* 中文名 */}
                    <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>
                      {player.nameCn || player.name}
                    </span>
                    {/* 英文名 */}
                    {player.nameCn && (
                      <span style={{ fontSize: 11, color: TEXT2 }}>{player.name}</span>
                    )}
                    {/* 队长标签 */}
                    {player.captain && (
                      <span style={{
                        fontSize: 10, fontWeight: 800,
                        background: "rgba(255,215,0,0.15)", color: GOLD,
                        padding: "1px 6px", borderRadius: 8,
                        border: `1px solid rgba(255,215,0,0.3)`,
                        flexShrink: 0,
                      }}>队长</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: TEXT2, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {player.club}
                  </div>
                </div>

                {/* 数据 */}
                <div style={{ flexShrink: 0, textAlign: "right" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: TEXT }}>{player.age}岁</div>
                  <div style={{ fontSize: 10, color: TEXT2, marginTop: 1 }}>
                    {player.caps}帽 {player.goals}球
                  </div>
                </div>
              </div>
            );
          })}

          {/* 主教练作为最后一条 */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "9px 12px",
            background: sortedPlayers.length % 2 === 0 ? BG3 : BG2,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: posBadge.COACH.bg,
              border: `1.5px solid ${posBadge.COACH.color}40`,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
              fontSize: 12, fontWeight: 700, color: posBadge.COACH.color,
            }}>
              {team.coach.charAt(0)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{
                  background: posBadge.COACH.bg, color: posBadge.COACH.color,
                  fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 8,
                  border: `1px solid ${posBadge.COACH.color}30`,
                  flexShrink: 0,
                }}>主教练</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{team.coach}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{
          margin: "10px 16px 0", borderRadius: 12,
          background: BG3, border: `1px solid ${BORDER}`,
          padding: "28px 16px", textAlign: "center",
        }}>
          {/* 主教练单独显示 */}
          <div style={{ marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <span style={{
              background: posBadge.COACH.bg, color: posBadge.COACH.color,
              fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 8,
            }}>主教练</span>
            <span style={{ color: TEXT, fontSize: 14 }}>{team.coach}</span>
          </div>
          <div style={{ color: TEXT2, fontSize: 13 }}>球员名单尚未公布</div>
        </div>
      )}
    </div>
  );
}

// ===== 球队列表页 =====
function TeamList() {
  const [searchText, setSearchText] = useState("");
  const groups = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

  const filteredTeams = searchText
    ? wcTeams.filter(t =>
        t.nameCn.includes(searchText) ||
        t.name.toLowerCase().includes(searchText.toLowerCase())
      )
    : null;

  return (
    <div style={{ minHeight: "100vh", background: BG, paddingBottom: 32, maxWidth: 480, margin: "0 auto" }}>

      {/* 顶部导航 */}
      <div style={{
        position: "sticky", top: 0, zIndex: 10,
        background: BG2, borderBottom: `1px solid ${BORDER}`,
        padding: "10px 16px",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <Link href="/world-cup">
          <button style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}>
            <ArrowLeft style={{ width: 18, height: 18, color: TEXT2 }} />
          </button>
        </Link>
        <span style={{ fontWeight: 700, color: TEXT, fontSize: 15, flex: 1 }}>球队档案</span>
        <span style={{ color: TEXT2, fontSize: 11 }}>2026 FIFA World Cup</span>
      </div>

      {/* 搜索框 */}
      <div style={{ padding: "10px 16px 6px" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: BG3, border: `1px solid ${BORDER}`,
          borderRadius: 10, padding: "8px 12px",
        }}>
          <Search style={{ width: 14, height: 14, color: TEXT2, flexShrink: 0 }} />
          <input
            type="text"
            placeholder="搜索球队..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            style={{
              flex: 1, background: "none", border: "none", outline: "none",
              color: TEXT, fontSize: 13,
            }}
          />
        </div>
      </div>

      {/* 搜索结果 */}
      {filteredTeams ? (
        <div style={{ padding: "4px 16px 0" }}>
          {filteredTeams.length === 0 ? (
            <div style={{ background: BG3, borderRadius: 10, padding: "28px 16px", textAlign: "center", border: `1px solid ${BORDER}` }}>
              <span style={{ color: TEXT2, fontSize: 13 }}>未找到相关球队</span>
            </div>
          ) : (
            <div style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${BORDER}` }}>
              {filteredTeams.map((team, idx) => (
                <Link key={team.code} href={`/world-cup/teams/${team.code}`}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 12px",
                    background: idx % 2 === 0 ? BG3 : BG2,
                    borderBottom: idx < filteredTeams.length - 1 ? `1px solid ${BORDER}` : "none",
                    cursor: "pointer",
                  }}>
                    <Flag code={team.code} size={30} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: TEXT, fontSize: 13 }}>{team.nameCn}</div>
                      <div style={{ color: TEXT2, fontSize: 11, marginTop: 1 }}>{team.name} · {team.group}组</div>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: rankColor(team.fifaRank) }}>{team.fifaRank}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* 按小组展示 */
        <div style={{ padding: "4px 16px 0" }}>
          {groups.map(group => {
            const teams = teamsByGroup[group] || [];
            if (teams.length === 0) return null;
            return (
              <div key={group} style={{ marginBottom: 12 }}>
                {/* 组标题 */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, padding: "0 2px" }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: "50%",
                    background: "rgba(255,215,0,0.15)",
                    border: `1px solid rgba(255,215,0,0.3)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <span style={{ color: GOLD, fontSize: 10, fontWeight: 800 }}>{group}</span>
                  </div>
                  <span style={{ color: TEXT2, fontSize: 12, fontWeight: 600 }}>{group} 组</span>
                </div>
                {/* 球队列表 */}
                <div style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${BORDER}` }}>
                  {teams.map((team, idx) => (
                    <Link key={team.code} href={`/world-cup/teams/${team.code}`}>
                      <div style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "9px 12px",
                        background: idx % 2 === 0 ? BG3 : BG2,
                        borderBottom: idx < teams.length - 1 ? `1px solid ${BORDER}` : "none",
                        cursor: "pointer",
                      }}>
                        <Flag code={team.code} size={30} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, color: TEXT, fontSize: 13 }}>{team.nameCn}</div>
                          <div style={{ color: TEXT2, fontSize: 11, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {team.name}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: rankColor(team.fifaRank) }}>{team.fifaRank}</div>
                          <div style={{ fontSize: 10, color: TEXT2, marginTop: 1 }}>{team.players.length}人</div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ===== 主路由组件 =====
export default function WcTeams() {
  const params = useParams<{ code?: string }>();
  const code = params.code;

  if (code) {
    const team = wcTeams.find(t => t.code === code);
    if (!team) {
      return (
        <div style={{ minHeight: "100vh", background: BG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", maxWidth: 480, margin: "0 auto" }}>
          <div style={{ color: TEXT2, marginBottom: 16 }}>未找到该球队</div>
          <Link href="/world-cup/teams">
            <button style={{ background: "none", border: "none", cursor: "pointer", color: GOLD, fontSize: 14, fontWeight: 600 }}>← 返回列表</button>
          </Link>
        </div>
      );
    }
    return <TeamDetail team={team} backHref="/world-cup/teams" />;
  }

  return <TeamList />;
}
