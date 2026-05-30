import { useState } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft, ChevronDown, ChevronUp, Trophy, Users, Star } from "lucide-react";
import { wcTeams, teamsByGroup, posMap, type TeamData } from "@/data/wcTeams";

// 国旗 emoji 映射
function getFlagEmoji(code: string): string {
  const flagMap: Record<string, string> = {
    "cz": "🇨🇿", "mx": "🇲🇽", "za": "🇿🇦", "kr": "🇰🇷",
    "ba": "🇧🇦", "ca": "🇨🇦", "qa": "🇶🇦", "ch": "🇨🇭",
    "br": "🇧🇷", "ht": "🇭🇹", "ma": "🇲🇦", "gb-sct": "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
    "au": "🇦🇺", "py": "🇵🇾", "tr": "🇹🇷", "us": "🇺🇸",
    "cw": "🇨🇼", "ec": "🇪🇨", "de": "🇩🇪", "ci": "🇨🇮",
    "jp": "🇯🇵", "nl": "🇳🇱", "se": "🇸🇪", "tn": "🇹🇳",
    "be": "🇧🇪", "eg": "🇪🇬", "ir": "🇮🇷", "nz": "🇳🇿",
    "cv": "🇨🇻", "sa": "🇸🇦", "es": "🇪🇸", "uy": "🇺🇾",
    "fr": "🇫🇷", "iq": "🇮🇶", "no": "🇳🇴", "sn": "🇸🇳",
    "dz": "🇩🇿", "ar": "🇦🇷", "at": "🇦🇹", "jo": "🇯🇴",
    "co": "🇨🇴", "cd": "🇨🇩", "pt": "🇵🇹", "uz": "🇺🇿",
    "hr": "🇭🇷", "gb-eng": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "gh": "🇬🇭", "pa": "🇵🇦",
  };
  return flagMap[code] || "🏳️";
}

// 排名颜色
function rankColor(rank: number): string {
  if (rank <= 5) return "text-yellow-500 font-bold";
  if (rank <= 15) return "text-orange-500 font-bold";
  if (rank <= 30) return "text-blue-500 font-bold";
  return "text-gray-600 font-medium";
}

// 位置颜色标签
function posBadge(pos: string): string {
  const map: Record<string, string> = {
    GK: "bg-yellow-100 text-yellow-700",
    DF: "bg-blue-100 text-blue-700",
    MF: "bg-green-100 text-green-700",
    FW: "bg-red-100 text-red-700",
  };
  return map[pos] || "bg-gray-100 text-gray-600";
}

// ===== 球队详情页 =====
function TeamDetail({ team, backHref }: { team: TeamData; backHref: string }) {
  const [expandedPos, setExpandedPos] = useState<string | null>("FW");
  const positions = ["GK", "DF", "MF", "FW"] as const;

  const playersByPos = positions.reduce((acc, pos) => {
    acc[pos] = team.players.filter(p => p.pos === pos);
    return acc;
  }, {} as Record<string, typeof team.players>);

  const captain = team.players.find(p => p.captain);

  return (
    <div className="min-h-screen bg-gray-50 pb-8 max-w-md mx-auto">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 shadow-sm">
        <Link href={backHref}>
          <button className="p-1.5 rounded-full hover:bg-gray-100 transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
        </Link>
        <span className="text-lg">{getFlagEmoji(team.code)}</span>
        <h1 className="font-bold text-gray-800 text-base flex-1">{team.nameCn}</h1>
        <span className="text-xs text-gray-400">{team.name}</span>
      </div>

      {/* 球队概览卡片 */}
      <div className="mx-4 mt-4 bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-[#A80000] to-[#D44000] p-5 text-white">
          <div className="flex items-center gap-4">
            <span className="text-5xl">{getFlagEmoji(team.code)}</span>
            <div>
              <h2 className="text-2xl font-bold">{team.nameCn}</h2>
              <p className="text-white/80 text-sm mt-0.5">{team.name}</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-gray-100 py-4">
          <div className="flex flex-col items-center gap-1">
            <Trophy className="w-4 h-4 text-yellow-500" />
            <span className={`text-lg ${rankColor(team.fifaRank)}`}>#{team.fifaRank}</span>
            <span className="text-xs text-gray-400">FIFA排名</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Star className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-semibold text-gray-700 text-center leading-tight px-1">{team.group}组</span>
            <span className="text-xs text-gray-400">所在分组</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Users className="w-4 h-4 text-green-500" />
            <span className="text-lg font-bold text-gray-700">{team.players.length}</span>
            <span className="text-xs text-gray-400">球员人数</span>
          </div>
        </div>
      </div>

      {/* 主教练 & 队长 */}
      <div className="mx-4 mt-3 bg-white rounded-2xl shadow-sm p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xl">👔</div>
          <div>
            <p className="text-xs text-gray-400">主教练</p>
            <p className="font-semibold text-gray-800">{team.coach}</p>
          </div>
        </div>
        {captain && (
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-50">
            <div className="w-10 h-10 rounded-full bg-yellow-50 flex items-center justify-center text-xl">©️</div>
            <div>
              <p className="text-xs text-gray-400">队长</p>
              <p className="font-semibold text-gray-800">{captain.name}</p>
              <p className="text-xs text-gray-400">{captain.club}</p>
            </div>
          </div>
        )}
      </div>

      {/* 球员名单 */}
      {team.players.length > 0 ? (
        <div className="mx-4 mt-3 space-y-2">
          {positions.map(pos => {
            const players = playersByPos[pos];
            if (!players || players.length === 0) return null;
            const isExpanded = expandedPos === pos;
            return (
              <div key={pos} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-4 py-3"
                  onClick={() => setExpandedPos(isExpanded ? null : pos)}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${posBadge(pos)}`}>
                      {posMap[pos]}
                    </span>
                    <span className="text-sm text-gray-500">{players.length}人</span>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </button>
                {isExpanded && (
                  <div className="border-t border-gray-50">
                    {players.map((player, idx) => (
                      <div
                        key={idx}
                        className={`px-4 py-3 flex items-center gap-3 ${idx < players.length - 1 ? "border-b border-gray-50" : ""}`}
                      >
                        {/* 头像占位 */}
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-sm font-bold text-gray-500 flex-shrink-0">
                          {player.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-gray-800 text-sm truncate">{player.name}</span>
                            {player.captain && (
                              <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">C</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 truncate mt-0.5">{player.club}</p>
                        </div>
                        <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                          <span className="text-xs text-gray-500">{player.age}岁</span>
                          <span className="text-xs text-gray-400">{player.caps}帽 {player.goals}球</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mx-4 mt-3 bg-white rounded-2xl shadow-sm p-8 text-center">
          <p className="text-gray-400 text-sm">球员名单尚未公布</p>
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
    ? wcTeams.filter(
        t =>
          t.nameCn.includes(searchText) ||
          t.name.toLowerCase().includes(searchText.toLowerCase())
      )
    : null;

  return (
    <div className="min-h-screen bg-gray-50 pb-8 max-w-md mx-auto">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 shadow-sm">
        <Link href="/world-cup">
          <button className="p-1.5 rounded-full hover:bg-gray-100 transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
        </Link>
        <h1 className="font-bold text-gray-800 flex-1">球队档案</h1>
        <span className="text-xs text-gray-400">2026 FIFA World Cup</span>
      </div>

      {/* 搜索框 */}
      <div className="px-4 pt-4 pb-2">
        <input
          type="text"
          placeholder="搜索球队..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#A80000]/20 focus:border-[#A80000]/50"
        />
      </div>

      {/* 搜索结果 */}
      {filteredTeams ? (
        <div className="px-4 mt-2">
          {filteredTeams.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center">
              <p className="text-gray-400 text-sm">未找到相关球队</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {filteredTeams.map((team, idx) => (
                <Link key={team.code} href={`/world-cup/teams/${team.code}`}>
                  <div className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer ${idx < filteredTeams.length - 1 ? "border-b border-gray-50" : ""}`}>
                    <span className="text-2xl">{getFlagEmoji(team.code)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800 text-sm">{team.nameCn}</p>
                      <p className="text-xs text-gray-400">{team.name} · {team.group}组</p>
                    </div>
                    <span className={`text-sm ${rankColor(team.fifaRank)}`}>#{team.fifaRank}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* 按小组展示 */
        <div className="px-4 mt-2 space-y-4">
          {groups.map(group => {
            const teams = teamsByGroup[group] || [];
            if (teams.length === 0) return null;
            return (
              <div key={group}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-[#A80000] flex items-center justify-center">
                    <span className="text-white text-xs font-bold">{group}</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-600">{group}组</span>
                </div>
                <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  {teams.map((team, idx) => (
                    <Link key={team.code} href={`/world-cup/teams/${team.code}`}>
                      <div className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer ${idx < teams.length - 1 ? "border-b border-gray-50" : ""}`}>
                        <span className="text-2xl">{getFlagEmoji(team.code)}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-800 text-sm">{team.nameCn}</p>
                          <p className="text-xs text-gray-400 truncate">{team.coach}</p>
                        </div>
                        <div className="flex flex-col items-end gap-0.5">
                          <span className={`text-sm ${rankColor(team.fifaRank)}`}>#{team.fifaRank}</span>
                          <span className="text-xs text-gray-400">{team.players.length}人</span>
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
// 路由：/world-cup/teams        → 列表页
// 路由：/world-cup/teams/:code  → 某球队详情页
export default function WcTeams() {
  const params = useParams<{ code?: string }>();
  const code = params.code;

  if (code) {
    const team = wcTeams.find(t => t.code === code);
    if (!team) {
      return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center max-w-md mx-auto">
          <p className="text-gray-400 mb-4">未找到该球队</p>
          <Link href="/world-cup/teams">
            <button className="text-[#A80000] text-sm font-semibold">← 返回列表</button>
          </Link>
        </div>
      );
    }
    return <TeamDetail team={team} backHref="/world-cup/teams" />;
  }

  return <TeamList />;
}
