import { useState } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft, Search } from "lucide-react";
import { wcTeams, teamsByGroup, type TeamData } from "@/data/wcTeams";

// ===== 颜色常量（与 WorldCup.tsx 保持一致） =====
const BG    = "#0D1B2A";
const BG2   = "#112236";
const BG3   = "#162C42";
const GOLD  = "#FFD700";
const TEXT  = "#E8EDF2";
const TEXT2 = "#8FA3B8";
const TEXT3 = "#5A7A96";
const BORDER = "rgba(255,255,255,0.07)";

// ===== 位置配置（统一用同一色系，仅文字不同） =====
const POS_CONFIG: Record<string, { label: string; abbr: string }> = {
  GK:    { label: "门将", abbr: "GK" },
  DF:    { label: "后卫", abbr: "DF" },
  MF:    { label: "中场", abbr: "MF" },
  FW:    { label: "前锋", abbr: "FW" },
  COACH: { label: "主教练", abbr: "HC" },
};

// 位置排序
const POS_ORDER = ["GK", "DF", "MF", "FW"];

// ===== 国旗 =====
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

// ===== FIFA排名颜色 =====
function rankColor(rank: number) {
  if (rank <= 5)  return GOLD;
  if (rank <= 15) return "#E8A020";
  if (rank <= 30) return "#4A8FBF";
  return TEXT2;
}

// ===== 身价格式化 =====
function fmtValue(v?: number): string | null {
  if (!v) return null;
  if (v >= 10000) return `${(v / 10000).toFixed(1)}亿`;
  return `${v}万`;
}

// ===== 位置标签（方角，低调单色） =====
function PosBadge({ pos }: { pos: string }) {
  const cfg = POS_CONFIG[pos] || POS_CONFIG.MF;
  return (
    <span style={{
      display: "inline-block",
      background: "rgba(255,255,255,0.06)",
      color: TEXT2,
      fontSize: 10,
      fontWeight: 600,
      padding: "1px 5px",
      borderRadius: 3,
      border: `1px solid rgba(255,255,255,0.1)`,
      letterSpacing: "0.02em",
      flexShrink: 0,
      fontFamily: "monospace",
    }}>
      {cfg.abbr}
    </span>
  );
}

// ===== 头像占位（人形轮廓） =====
function PlayerAvatar({ pos }: { pos: string }) {
  const bgMap: Record<string, string> = {
    GK: "#1A2E42",
    DF: "#162840",
    MF: "#14263C",
    FW: "#182438",
    COACH: "#1C2A3E",
  };
  const bg = bgMap[pos] || bgMap.MF;
  return (
    <div style={{
      width: 34, height: 34,
      borderRadius: 4,
      background: bg,
      border: `1px solid rgba(255,255,255,0.1)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
      overflow: "hidden",
    }}>
      {/* 人形轮廓 SVG */}
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
        <circle cx="12" cy="8" r="4" fill="rgba(255,255,255,0.18)" />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" fill="rgba(255,255,255,0.18)" />
      </svg>
    </div>
  );
}

// ===== 球队详情页 =====
function TeamDetail({ team, backHref }: { team: TeamData; backHref: string }) {
  const sortedPlayers = [...team.players].sort((a, b) =>
    POS_ORDER.indexOf(a.pos) - POS_ORDER.indexOf(b.pos)
  );

  return (
    <div style={{ minHeight: "100vh", background: BG, paddingBottom: 32, maxWidth: 480, margin: "0 auto" }}>

      {/* 顶部导航 */}
      <div style={{
        position: "sticky", top: 0, zIndex: 10,
        background: BG2, borderBottom: `1px solid ${BORDER}`,
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
        <span style={{ color: TEXT3, fontSize: 11 }}>{team.name}</span>
      </div>

      {/* 球队概览卡片 */}
      <div style={{
        margin: "12px 16px 0",
        background: BG3,
        borderRadius: 8,
        border: `1px solid ${BORDER}`,
        padding: "14px 16px",
        display: "flex", alignItems: "center", gap: 14,
      }}>
        <Flag code={team.code} size={56} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: TEXT, lineHeight: 1.2 }}>{team.nameCn}</div>
          <div style={{ fontSize: 12, color: TEXT3, marginTop: 2 }}>{team.name}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: rankColor(team.fifaRank) }}>
              FIFA {team.fifaRank}
            </span>
            <span style={{ color: TEXT3, fontSize: 12 }}>·</span>
            <span style={{ fontSize: 12, color: TEXT2 }}>{team.group} 组</span>
            <span style={{ color: TEXT3, fontSize: 12 }}>·</span>
            <span style={{ fontSize: 12, color: TEXT2 }}>{team.players.length} 人</span>
          </div>
        </div>
      </div>

      {/* 球员名单 */}
      {team.players.length > 0 ? (
        <div style={{
          margin: "10px 16px 0",
          borderRadius: 8, overflow: "hidden",
          border: `1px solid ${BORDER}`,
        }}>
          {sortedPlayers.map((player, idx) => {
            const valStr = fmtValue(player.value);
            return (
              <div
                key={idx}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 12px",
                  background: idx % 2 === 0 ? BG3 : BG2,
                  borderBottom: idx < sortedPlayers.length - 1 ? `1px solid ${BORDER}` : "none",
                }}
              >
                {/* 头像（球衣号码风格） */}
                <PlayerAvatar pos={player.pos} />

                {/* 姓名 + 俱乐部 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                    <PosBadge pos={player.pos} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: player.captain ? GOLD : TEXT }}>
                      {player.nameCn || player.name}
                    </span>
                    {player.nameCn && (
                      <span style={{ fontSize: 11, color: TEXT3 }}>{player.name}</span>
                    )}
                  </div>
                  <div style={{
                    fontSize: 11, color: TEXT3, marginTop: 2,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {player.club}
                  </div>
                </div>

                {/* 右侧：年龄 + 身价 */}
                <div style={{ flexShrink: 0, textAlign: "right" }}>
                  <div style={{ fontSize: 12, color: TEXT2 }}>{player.age}岁</div>
                  {valStr && (
                    <div style={{ fontSize: 11, color: "#C8A840", marginTop: 1, fontWeight: 600 }}>
                      ${valStr}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* 主教练（最后一条） */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 12px",
            background: sortedPlayers.length % 2 === 0 ? BG3 : BG2,
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: 4,
              background: "#1C2A3E",
              border: `1px solid rgba(255,255,255,0.1)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                <circle cx="12" cy="8" r="4" fill="rgba(255,255,255,0.18)" />
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" fill="rgba(255,255,255,0.18)" />
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{
                  display: "inline-block",
                  background: "rgba(255,255,255,0.06)", color: TEXT2,
                  fontSize: 10, fontWeight: 600, padding: "1px 5px", borderRadius: 3,
                  border: `1px solid rgba(255,255,255,0.1)`,
                  fontFamily: "monospace", flexShrink: 0,
                }}>HC</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{team.coach}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{
          margin: "10px 16px 0", borderRadius: 8,
          background: BG3, border: `1px solid ${BORDER}`,
          padding: "24px 16px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{
              background: "rgba(255,255,255,0.06)", color: TEXT2,
              fontSize: 10, fontWeight: 600, padding: "1px 5px", borderRadius: 3,
              border: `1px solid rgba(255,255,255,0.1)`, fontFamily: "monospace",
            }}>HC</span>
            <span style={{ color: TEXT, fontSize: 13, fontWeight: 700 }}>{team.coach}</span>
          </div>
          <div style={{ color: TEXT3, fontSize: 12 }}>球员名单尚未公布</div>
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
        <span style={{ color: TEXT3, fontSize: 11 }}>2026 FIFA World Cup</span>
      </div>

      {/* 搜索框 */}
      <div style={{ padding: "10px 16px 6px" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: BG3, border: `1px solid ${BORDER}`,
          borderRadius: 6, padding: "7px 12px",
        }}>
          <Search style={{ width: 13, height: 13, color: TEXT3, flexShrink: 0 }} />
          <input
            type="text"
            placeholder="搜索球队..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            style={{ flex: 1, background: "none", border: "none", outline: "none", color: TEXT, fontSize: 13 }}
          />
        </div>
      </div>

      {/* 搜索结果 */}
      {filteredTeams ? (
        <div style={{ padding: "4px 16px 0" }}>
          {filteredTeams.length === 0 ? (
            <div style={{ background: BG3, borderRadius: 6, padding: "24px 16px", textAlign: "center", border: `1px solid ${BORDER}` }}>
              <span style={{ color: TEXT3, fontSize: 13 }}>未找到相关球队</span>
            </div>
          ) : (
            <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${BORDER}` }}>
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
                      <div style={{ color: TEXT3, fontSize: 11, marginTop: 1 }}>{team.name} · {team.group}组</div>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: rankColor(team.fifaRank) }}>{team.fifaRank}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: "4px 16px 0" }}>
          {groups.map(group => {
            const teams = teamsByGroup[group] || [];
            if (teams.length === 0) return null;
            return (
              <div key={group} style={{ marginBottom: 10 }}>
                {/* 组标题 */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, padding: "0 2px" }}>
                  <span style={{
                    background: "rgba(255,215,0,0.12)", color: GOLD,
                    fontSize: 10, fontWeight: 800,
                    padding: "1px 6px", borderRadius: 3,
                    border: `1px solid rgba(255,215,0,0.2)`,
                    fontFamily: "monospace",
                  }}>{group}</span>
                  <span style={{ color: TEXT3, fontSize: 11, fontWeight: 600 }}>{group} 组</span>
                </div>
                {/* 球队列表 */}
                <div style={{ borderRadius: 6, overflow: "hidden", border: `1px solid ${BORDER}` }}>
                  {teams.map((team, idx) => (
                    <Link key={team.code} href={`/world-cup/teams/${team.code}`}>
                      <div style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "9px 12px",
                        background: idx % 2 === 0 ? BG3 : BG2,
                        borderBottom: idx < teams.length - 1 ? `1px solid ${BORDER}` : "none",
                        cursor: "pointer",
                      }}>
                        <Flag code={team.code} size={28} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, color: TEXT, fontSize: 13 }}>{team.nameCn}</div>
                          <div style={{ color: TEXT3, fontSize: 11, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {team.name}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: rankColor(team.fifaRank) }}>{team.fifaRank}</div>
                          <div style={{ fontSize: 10, color: TEXT3, marginTop: 1 }}>{team.players.length}人</div>
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
          <div style={{ color: TEXT3, marginBottom: 16, fontSize: 13 }}>未找到该球队</div>
          <Link href="/world-cup/teams">
            <button style={{ background: "none", border: "none", cursor: "pointer", color: GOLD, fontSize: 13, fontWeight: 600 }}>← 返回列表</button>
          </Link>
        </div>
      );
    }
    return <TeamDetail team={team} backHref="/world-cup/teams" />;
  }

  return <TeamList />;
}
