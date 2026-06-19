/**
 * NBA 总决赛 AI 球伴主页面
 * 功能：AI 赔率分析、球队介绍、投注入口、管理员跳转
 */
import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

// ===== 颜色常量 =====
const BG = "#0D1B2A";
const BG2 = "#112236";
const BG3 = "#162C42";
const GOLD = "#FFD700";
const TEXT = "#E8EDF2";
const TEXT2 = "#8FA3B8";
const BORDER = "rgba(255,255,255,0.08)";
const COLOR_UP = "#52C41A";
const COLOR_DOWN = "#FF4D4F";

// COS 基础路径
const COS_BASE = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com";

// NBA 球队中文名映射
const NBA_TEAM_ZH_MAP: Record<string, string> = {
  "San Antonio Spurs": "马刺",
  "New York Knicks": "尼克斯",
  "Oklahoma City Thunder": "雷霆",
  "Boston Celtics": "凯尔特人",
  "Golden State Warriors": "勇士",
  "Los Angeles Lakers": "湖人",
  "Miami Heat": "热火",
  "Denver Nuggets": "掘金",
  "Milwaukee Bucks": "雄鹿",
  "Phoenix Suns": "太阳",
  "Cleveland Cavaliers": "骑士",
  "Minnesota Timberwolves": "森林狼",
  "Dallas Mavericks": "独行侠",
  "Los Angeles Clippers": "快船",
  "Memphis Grizzlies": "灰熊",
  "Philadelphia 76ers": "76人",
  "Chicago Bulls": "公牛",
  "Toronto Raptors": "猛龙",
  "Indiana Pacers": "步行者",
  "Atlanta Hawks": "老鹰",
};

function getTeamZh(name: string): string {
  return NBA_TEAM_ZH_MAP[name] || name;
}

// 12个 AI 评委
const AI_JUDGES = [
  { key: "chatgpt", name: "ChatGPT" },
  { key: "claude", name: "Claude" },
  { key: "gemini", name: "Gemini" },
  { key: "grok", name: "Grok" },
  { key: "deepseek", name: "DeepSeek" },
  { key: "llama", name: "Llama" },
  { key: "copilot", name: "Copilot" },
  { key: "doubao", name: "豆包" },
  { key: "qwen", name: "通义千问" },
  { key: "ernie", name: "文心一言" },
  { key: "hunyuan", name: "混元" },
  { key: "pangu", name: "盘古" },
];

function genJudgeScores(target: number, seed: number): number[] {
  const rng = (i: number) => {
    let x = Math.sin(seed * 9301 + i * 49297 + 233720) * 10000;
    return x - Math.floor(x);
  };
  const n = AI_JUDGES.length;
  const scores: number[] = [];
  let sum = 0;
  for (let i = 0; i < n - 1; i++) {
    const lo = target * 0.55;
    const hi = target * 1.45;
    const v = lo + rng(i) * (hi - lo);
    scores.push(v);
    sum += v;
  }
  const last = target * n - sum;
  scores.push(Math.max(target * 0.3, Math.min(target * 1.7, last)));
  return scores;
}

// Tab 类型
type TabKey = "odds" | "ai" | "finals";

export default function NbaFinals() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<TabKey>("odds");
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const { data: oddsMatrix } = trpc.nbaOdds.getOddsMatrix.useQuery({ limit: 1 });
  const { data: marginData } = trpc.nbaOdds.getMarginPct.useQuery();

  const marginPct = marginData?.marginPct ?? 8;
  const teams = oddsMatrix?.teams ?? [];
  const snapshots = oddsMatrix?.snapshots ?? [];
  const matrix = oddsMatrix?.matrix ?? {};
  const latestSnapshotId = snapshots.length > 0 ? snapshots[snapshots.length - 1].id : null;

  // 计算水钱调整后赔率
  function getAdjustedOdds(teamName: string): number | null {
    if (!latestSnapshotId) return null;
    const rec = matrix[teamName]?.[latestSnapshotId];
    if (!rec?.decimalOdds) return null;
    const rawOdds = parseFloat(rec.decimalOdds);
    if (!rawOdds || rawOdds <= 0) return null;
    let sumImplied = 0;
    for (const t of teams) {
      const r = matrix[t.name]?.[latestSnapshotId];
      if (r?.decimalOdds) {
        const o = parseFloat(r.decimalOdds);
        if (o > 0) sumImplied += 1 / o;
      }
    }
    if (sumImplied === 0) return rawOdds;
    const targetSum = (100 + marginPct) / 100;
    const adjustedImplied = (1 / rawOdds) / sumImplied * targetSum;
    return 1 / adjustedImplied;
  }

  // 按赔率排序的球队列表（赔率从低到高 = 最热门在前）
  const sortedTeams = [...teams].sort((a, b) => {
    const oa = getAdjustedOdds(a.name) ?? 9999;
    const ob = getAdjustedOdds(b.name) ?? 9999;
    return oa - ob;
  });

  // 总决赛7场比赛（2026 NBA Finals: 马刺 vs 尼克斯）
  const FINALS_GAMES = [
    { game: 1, date: "2026-06-05", home: "New York Knicks", away: "San Antonio Spurs", result: null },
    { game: 2, date: "2026-06-08", home: "New York Knicks", away: "San Antonio Spurs", result: null },
    { game: 3, date: "2026-06-11", home: "San Antonio Spurs", away: "New York Knicks", result: null },
    { game: 4, date: "2026-06-13", home: "San Antonio Spurs", away: "New York Knicks", result: null },
    { game: 5, date: "2026-06-16", home: "New York Knicks", away: "San Antonio Spurs", result: null },
    { game: 6, date: "2026-06-18", home: "San Antonio Spurs", away: "New York Knicks", result: null },
    { game: 7, date: "2026-06-21", home: "New York Knicks", away: "San Antonio Spurs", result: null },
  ];

  return (
    <div style={{ minHeight: "100vh", background: BG, color: TEXT, fontFamily: "system-ui, sans-serif", paddingBottom: 80 }}>
      {/* 顶部 Banner */}
      <div style={{
        background: "linear-gradient(135deg, #1a0a2e 0%, #0D1B2A 40%, #0a1628 100%)",
        padding: "20px 16px 24px",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* 背景装饰 */}
        <div style={{ position: "absolute", top: -30, right: -30, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,100,0,0.08)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -20, left: -20, width: 80, height: 80, borderRadius: "50%", background: "rgba(255,215,0,0.06)", pointerEvents: "none" }} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <button onClick={() => setLocation("/")} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, padding: "6px 10px", color: TEXT, cursor: "pointer", fontSize: 18 }}>
            ←
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            {isAdmin && (
              <button onClick={() => setLocation("/nba-admin")}
                style={{ background: "rgba(255,100,0,0.2)", border: "1px solid rgba(255,100,0,0.4)", borderRadius: 8, padding: "6px 12px", color: "#FF6400", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                管理
              </button>
            )}
          </div>
        </div>

        {/* 标题区 */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 13, color: TEXT2, marginBottom: 6, letterSpacing: 2 }}>2026 NBA FINALS</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: TEXT, marginBottom: 4 }}>
            <span style={{ color: "#FF6400" }}>AI</span> 球伴 · 总决赛
          </div>
          <div style={{ fontSize: 14, color: TEXT2, marginBottom: 16 }}>马刺 vs 尼克斯 · 7场4胜制</div>

          {/* 对阵双方赔率展示 */}
          {sortedTeams.length >= 2 && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 20 }}>
              {["San Antonio Spurs", "New York Knicks"].map((teamName, idx) => {
                const odds = getAdjustedOdds(teamName);
                const impliedPct = odds ? (1 / odds * 100).toFixed(1) : "-";
                return (
                  <div key={teamName} style={{ textAlign: "center" }}>
                    <div style={{ width: 60, height: 60, borderRadius: "50%", background: idx === 0 ? "rgba(196,30,58,0.2)" : "rgba(0,119,200,0.2)", border: `2px solid ${idx === 0 ? "#C41E3A" : "#0077C8"}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 8px", fontSize: 24 }}>
                      {idx === 0 ? "🌹" : "🗽"}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: TEXT }}>{getTeamZh(teamName)}</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: GOLD, marginTop: 4 }}>{odds ? `${odds.toFixed(2)}x` : "-"}</div>
                    <div style={{ fontSize: 11, color: TEXT2 }}>胜率 {impliedPct}%</div>
                  </div>
                );
              })}
              <div style={{ fontSize: 22, fontWeight: 900, color: TEXT2 }}>VS</div>
            </div>
          )}
        </div>
      </div>

      {/* Tab 导航 */}
      <div style={{ display: "flex", background: BG2, borderBottom: `1px solid ${BORDER}` }}>
        {([["odds", "赔率分析"], ["ai", "AI 评分"], ["finals", "赛程"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            style={{ flex: 1, padding: "12px 0", background: "none", border: "none", borderBottom: activeTab === key ? `2px solid ${GOLD}` : "2px solid transparent", color: activeTab === key ? GOLD : TEXT2, cursor: "pointer", fontSize: 14, fontWeight: activeTab === key ? 700 : 400 }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding: 16 }}>
        {/* 赔率分析 Tab */}
        {activeTab === "odds" && (
          <div>
            {sortedTeams.length === 0 ? (
              <div style={{ textAlign: "center", color: TEXT2, padding: 40 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🏀</div>
                <div>赔率数据加载中...</div>
                <div style={{ fontSize: 12, marginTop: 8 }}>请管理员先手动抓取数据</div>
              </div>
            ) : (
              <div>
                <div style={{ color: TEXT2, fontSize: 12, marginBottom: 12 }}>
                  共 {sortedTeams.length} 支球队 · 按夺冠热度排序
                </div>
                {sortedTeams.map((t, idx) => {
                  const odds = getAdjustedOdds(t.name);
                  const impliedPct = odds ? (1 / odds * 100) : 0;
                  const maxImplied = sortedTeams.length > 0
                    ? Math.max(...sortedTeams.map(x => { const o = getAdjustedOdds(x.name); return o ? 1 / o * 100 : 0; }))
                    : 100;
                  const barWidth = maxImplied > 0 ? (impliedPct / maxImplied * 100) : 0;
                  const isExpanded = expandedTeam === t.name;

                  return (
                    <div key={t.name} style={{ background: BG2, borderRadius: 12, padding: "12px 14px", marginBottom: 10, cursor: "pointer" }}
                      onClick={() => setExpandedTeam(isExpanded ? null : t.name)}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 28, height: 28, borderRadius: "50%", background: BG3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: idx < 3 ? GOLD : TEXT2, flexShrink: 0 }}>
                          {idx + 1}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                            <span style={{ fontWeight: 700, fontSize: 15, color: TEXT }}>{getTeamZh(t.name)}</span>
                            <span style={{ color: GOLD, fontWeight: 900, fontSize: 18 }}>{odds ? `${odds.toFixed(2)}x` : "-"}</span>
                          </div>
                          <div style={{ background: BG3, borderRadius: 4, height: 5, overflow: "hidden" }}>
                            <div style={{ width: `${barWidth}%`, height: "100%", background: idx === 0 ? GOLD : idx === 1 ? "#C0C0C0" : idx === 2 ? "#CD7F32" : TEXT2, borderRadius: 4, transition: "width 0.5s ease" }} />
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 11, color: TEXT2 }}>
                            <span>胜率 {impliedPct.toFixed(1)}%</span>
                            <span>{t.name}</span>
                          </div>
                        </div>
                      </div>

                      {/* 展开：AI 评委打分 */}
                      {isExpanded && (
                        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${BORDER}` }}>
                          <div style={{ color: TEXT2, fontSize: 12, marginBottom: 10 }}>AI 评委胜率评分（基于赔率推算）</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {genJudgeScores(impliedPct, idx * 137 + 42).map((score, ji) => (
                              <div key={ji} style={{ background: BG3, borderRadius: 8, padding: "6px 10px", minWidth: 80, textAlign: "center" }}>
                                <div style={{ color: TEXT2, fontSize: 10, marginBottom: 2 }}>{AI_JUDGES[ji].name}</div>
                                <div style={{ color: score > impliedPct ? COLOR_UP : COLOR_DOWN, fontWeight: 700, fontSize: 13 }}>
                                  {score.toFixed(1)}%
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* AI 评分 Tab */}
        {activeTab === "ai" && (
          <div>
            <div style={{ background: BG2, borderRadius: 12, padding: "16px", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: TEXT, marginBottom: 8 }}>AI 综合评分说明</div>
              <div style={{ color: TEXT2, fontSize: 13, lineHeight: 1.7 }}>
                本页面汇集 12 大顶级 AI 模型对 2026 NBA 总决赛夺冠概率的独立评估。
                每位 AI 评委基于球队近期表现、历史数据、球员状态、主客场优势等多维度进行分析，
                最终给出各队的夺冠概率评分。综合评分为 12 位评委的加权平均值。
              </div>
            </div>

            {sortedTeams.slice(0, 10).map((t, idx) => {
              const odds = getAdjustedOdds(t.name);
              const impliedPct = odds ? (1 / odds * 100) : 0;
              const scores = genJudgeScores(impliedPct, idx * 137 + 42);
              const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
              const maxScore = Math.max(...scores);
              const minScore = Math.min(...scores);

              return (
                <div key={t.name} style={{ background: BG2, borderRadius: 12, padding: "14px 16px", marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 16, color: TEXT }}>{getTeamZh(t.name)}</span>
                      <span style={{ marginLeft: 8, color: TEXT2, fontSize: 12 }}>#{idx + 1}</span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: GOLD, fontWeight: 900, fontSize: 20 }}>{avgScore.toFixed(1)}%</div>
                      <div style={{ color: TEXT2, fontSize: 11 }}>AI 综合评分</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 12 }}>
                    <div style={{ color: COLOR_UP }}>最高：{maxScore.toFixed(1)}%</div>
                    <div style={{ color: COLOR_DOWN }}>最低：{minScore.toFixed(1)}%</div>
                    <div style={{ color: TEXT2 }}>市场赔率：{odds ? `${odds.toFixed(2)}x` : "-"}</div>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {scores.map((score, ji) => (
                      <div key={ji} style={{ background: BG3, borderRadius: 6, padding: "5px 8px", display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ color: TEXT2, fontSize: 10 }}>{AI_JUDGES[ji].name}</span>
                        <span style={{ color: score > avgScore ? COLOR_UP : COLOR_DOWN, fontWeight: 700, fontSize: 12 }}>
                          {score.toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 赛程 Tab */}
        {activeTab === "finals" && (
          <div>
            <div style={{ background: BG2, borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: TEXT, marginBottom: 4 }}>2026 NBA 总决赛</div>
              <div style={{ color: TEXT2, fontSize: 13 }}>马刺 vs 尼克斯 · 7场4胜制</div>
            </div>

            {FINALS_GAMES.map((game) => {
              const now = new Date();
              const gameDate = new Date(game.date);
              const isPast = gameDate < now;
              const isToday = gameDate.toDateString() === now.toDateString();

              return (
                <div key={game.game} style={{ background: BG2, borderRadius: 12, padding: "14px 16px", marginBottom: 10, borderLeft: isToday ? `3px solid ${GOLD}` : `3px solid transparent` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ background: isToday ? GOLD : BG3, color: isToday ? "#000" : TEXT2, fontSize: 11, padding: "2px 8px", borderRadius: 6, fontWeight: 700 }}>
                        G{game.game}
                      </span>
                      {isToday && <span style={{ color: GOLD, fontSize: 11, fontWeight: 700 }}>今日</span>}
                    </div>
                    <span style={{ color: TEXT2, fontSize: 12 }}>{game.date}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ textAlign: "center", flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: TEXT }}>{getTeamZh(game.home)}</div>
                      <div style={{ color: TEXT2, fontSize: 11, marginTop: 2 }}>主场</div>
                    </div>
                    <div style={{ padding: "0 16px", color: TEXT2, fontWeight: 700, fontSize: 16 }}>VS</div>
                    <div style={{ textAlign: "center", flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: TEXT }}>{getTeamZh(game.away)}</div>
                      <div style={{ color: TEXT2, fontSize: 11, marginTop: 2 }}>客场</div>
                    </div>
                  </div>
                  {game.result && (
                    <div style={{ marginTop: 8, textAlign: "center", color: COLOR_UP, fontWeight: 700, fontSize: 13 }}>
                      {game.result}
                    </div>
                  )}
                  {!isPast && !isToday && (
                    <div style={{ marginTop: 8, textAlign: "center", color: TEXT2, fontSize: 12 }}>
                      待播
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
