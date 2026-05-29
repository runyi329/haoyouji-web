import { useLocation } from "wouter";
import { ArrowLeft, Trophy, Calendar, Star } from "lucide-react";
import { useState } from "react";

// FIFA 2026 官方配色
const FIFA_RED = "#C0001A";
const FIFA_DARK_RED = "#8B0000";
const FIFA_GOLD = "#C9A227";

// 48支参赛队伍 - 12组，每组4队
const groups: Record<string, { name: string; flag: string }[]> = {
  A: [
    { name: "美国", flag: "🇺🇸" },
    { name: "待定", flag: "🏳" },
    { name: "待定", flag: "🏳" },
    { name: "待定", flag: "🏳" },
  ],
  B: [
    { name: "墨西哥", flag: "🇲🇽" },
    { name: "待定", flag: "🏳" },
    { name: "待定", flag: "🏳" },
    { name: "待定", flag: "🏳" },
  ],
  C: [
    { name: "加拿大", flag: "🇨🇦" },
    { name: "待定", flag: "🏳" },
    { name: "待定", flag: "🏳" },
    { name: "待定", flag: "🏳" },
  ],
  D: [
    { name: "巴西", flag: "🇧🇷" },
    { name: "待定", flag: "🏳" },
    { name: "待定", flag: "🏳" },
    { name: "待定", flag: "🏳" },
  ],
  E: [
    { name: "阿根廷", flag: "🇦🇷" },
    { name: "待定", flag: "🏳" },
    { name: "待定", flag: "🏳" },
    { name: "待定", flag: "🏳" },
  ],
  F: [
    { name: "法国", flag: "🇫🇷" },
    { name: "待定", flag: "🏳" },
    { name: "待定", flag: "🏳" },
    { name: "待定", flag: "🏳" },
  ],
  G: [
    { name: "英格兰", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
    { name: "待定", flag: "🏳" },
    { name: "待定", flag: "🏳" },
    { name: "待定", flag: "🏳" },
  ],
  H: [
    { name: "西班牙", flag: "🇪🇸" },
    { name: "待定", flag: "🏳" },
    { name: "待定", flag: "🏳" },
    { name: "待定", flag: "🏳" },
  ],
  I: [
    { name: "德国", flag: "🇩🇪" },
    { name: "待定", flag: "🏳" },
    { name: "待定", flag: "🏳" },
    { name: "待定", flag: "🏳" },
  ],
  J: [
    { name: "葡萄牙", flag: "🇵🇹" },
    { name: "待定", flag: "🏳" },
    { name: "待定", flag: "🏳" },
    { name: "待定", flag: "🏳" },
  ],
  K: [
    { name: "荷兰", flag: "🇳🇱" },
    { name: "待定", flag: "🏳" },
    { name: "待定", flag: "🏳" },
    { name: "待定", flag: "🏳" },
  ],
  L: [
    { name: "日本", flag: "🇯🇵" },
    { name: "待定", flag: "🏳" },
    { name: "待定", flag: "🏳" },
    { name: "待定", flag: "🏳" },
  ],
};

// 淘汰赛对阵（1/16决赛，共16场）
const knockout16 = [
  { home: "A组第1", away: "C组第2" },
  { home: "C组第1", away: "A组第2" },
  { home: "B组第1", away: "D组第2" },
  { home: "D组第1", away: "B组第2" },
  { home: "E组第1", away: "G组第2" },
  { home: "G组第1", away: "E组第2" },
  { home: "F组第1", away: "H组第2" },
  { home: "H组第1", away: "F组第2" },
  { home: "I组第1", away: "K组第2" },
  { home: "K组第1", away: "I组第2" },
  { home: "J组第1", away: "L组第2" },
  { home: "L组第1", away: "J组第2" },
  { home: "A组第3*", away: "B组第3*" },
  { home: "C组第3*", away: "D组第3*" },
  { home: "E组第3*", away: "F组第3*" },
  { home: "G组第3*", away: "H组第3*" },
];

type TabType = "schedule" | "groups" | "guess";

export default function WorldCup() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<TabType>("schedule");

  const tabs: { key: TabType; label: string; icon: React.ReactNode }[] = [
    { key: "schedule", label: "赛程", icon: <Calendar className="w-4 h-4" /> },
    { key: "groups", label: "小组赛", icon: <Trophy className="w-4 h-4" /> },
    { key: "guess", label: "冠军竞猜", icon: <Star className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#F5F5F5" }}>
      {/* ===== 顶部 Header ===== */}
      <div
        style={{
          background: `linear-gradient(160deg, ${FIFA_DARK_RED} 0%, ${FIFA_RED} 60%, #E8001C 100%)`,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* 装饰性背景圆圈 */}
        <div
          style={{
            position: "absolute",
            top: -40,
            right: -40,
            width: 160,
            height: 160,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.06)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -20,
            left: -20,
            width: 100,
            height: 100,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.04)",
          }}
        />

        {/* 导航栏 */}
        <div className="flex items-center px-4 pt-4 pb-2 relative z-10">
          <button
            onClick={() => window.history.back()}
            className="w-8 h-8 flex items-center justify-center rounded-full"
            style={{ backgroundColor: "rgba(255,255,255,0.18)" }}
          >
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <div className="flex-1" />
        </div>

        {/* 主标题区域 */}
        <div className="flex flex-col items-center pb-6 pt-2 relative z-10">
          <img
            src="/wc2026-logo.png"
            alt="FIFA World Cup 2026"
            className="w-20 h-20 rounded-full object-cover mb-3"
            style={{
              border: `3px solid ${FIFA_GOLD}`,
              boxShadow: `0 0 20px rgba(201,162,39,0.4)`,
            }}
          />
          <h1
            className="text-xl font-black tracking-wide text-white"
            style={{ textShadow: "0 2px 8px rgba(0,0,0,0.3)" }}
          >
            FIFA WORLD CUP 2026™
          </h1>
          <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.75)" }}>
            美国 · 加拿大 · 墨西哥 &nbsp;|&nbsp; 6月11日 — 7月19日
          </p>
          {/* 金色装饰线 */}
          <div
            className="mt-3 rounded-full"
            style={{ width: 48, height: 2, backgroundColor: FIFA_GOLD }}
          />
        </div>

        {/* Tab 栏 */}
        <div
          className="flex"
          style={{ borderTop: "1px solid rgba(255,255,255,0.15)" }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex-1 flex flex-col items-center gap-1 py-3 text-xs font-semibold transition-all"
              style={{
                color: activeTab === tab.key ? FIFA_GOLD : "rgba(255,255,255,0.65)",
                borderBottom: activeTab === tab.key ? `2px solid ${FIFA_GOLD}` : "2px solid transparent",
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ===== 内容区域 ===== */}
      <div className="flex-1 overflow-y-auto pb-8">

        {/* ---- 赛程 Tab ---- */}
        {activeTab === "schedule" && (
          <div className="px-4 pt-4 space-y-3">
            {/* 赛事信息卡 */}
            <div
              className="rounded-2xl p-4 text-white"
              style={{ background: `linear-gradient(135deg, ${FIFA_DARK_RED}, ${FIFA_RED})` }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Trophy className="w-5 h-5" style={{ color: FIFA_GOLD }} />
                <span className="font-bold text-sm">第23届FIFA世界杯</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div style={{ color: "rgba(255,255,255,0.65)" }}>参赛球队</div>
                  <div className="font-bold text-base">48 支</div>
                </div>
                <div>
                  <div style={{ color: "rgba(255,255,255,0.65)" }}>比赛场次</div>
                  <div className="font-bold text-base">104 场</div>
                </div>
                <div>
                  <div style={{ color: "rgba(255,255,255,0.65)" }}>开幕时间</div>
                  <div className="font-bold">2026年6月11日</div>
                </div>
                <div>
                  <div style={{ color: "rgba(255,255,255,0.65)" }}>决赛时间</div>
                  <div className="font-bold">2026年7月19日</div>
                </div>
              </div>
            </div>

            {/* 淘汰赛标题 */}
            <div className="flex items-center gap-2 mt-4 mb-2">
              <div className="w-1 h-5 rounded-full" style={{ backgroundColor: FIFA_RED }} />
              <span className="font-bold text-sm text-gray-800">淘汰赛路线图</span>
            </div>

            {/* 1/16决赛 */}
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
              <div
                className="px-4 py-2 text-xs font-bold text-white"
                style={{ backgroundColor: FIFA_RED }}
              >
                1/16 决赛（32强）
              </div>
              <div className="divide-y divide-gray-50">
                {knockout16.map((match, i) => (
                  <div key={i} className="flex items-center px-4 py-3">
                    <span className="text-xs text-gray-400 w-5">{i + 1}</span>
                    <div className="flex-1 flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 flex-1 text-right pr-3">
                        {match.home}
                      </span>
                      <span
                        className="text-xs font-black px-2 py-0.5 rounded"
                        style={{ backgroundColor: FIFA_RED, color: "white", minWidth: 28, textAlign: "center" }}
                      >
                        VS
                      </span>
                      <span className="text-sm font-medium text-gray-700 flex-1 text-left pl-3">
                        {match.away}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 后续轮次 */}
            {[
              { label: "1/8 决赛（16强）", count: 8 },
              { label: "1/4 决赛（8强）", count: 4 },
              { label: "半 决 赛", count: 2 },
            ].map((round) => (
              <div key={round.label} className="bg-white rounded-2xl overflow-hidden shadow-sm">
                <div
                  className="px-4 py-2 text-xs font-bold text-white"
                  style={{ backgroundColor: "#555" }}
                >
                  {round.label}
                </div>
                <div className="divide-y divide-gray-50">
                  {Array.from({ length: round.count }).map((_, i) => (
                    <div key={i} className="flex items-center px-4 py-3">
                      <span className="text-xs text-gray-400 w-5">{i + 1}</span>
                      <div className="flex-1 flex items-center justify-between">
                        <span className="text-sm text-gray-400 flex-1 text-right pr-3">待定</span>
                        <span
                          className="text-xs font-black px-2 py-0.5 rounded"
                          style={{ backgroundColor: "#888", color: "white", minWidth: 28, textAlign: "center" }}
                        >
                          VS
                        </span>
                        <span className="text-sm text-gray-400 flex-1 text-left pl-3">待定</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* 决赛 */}
            <div
              className="rounded-2xl overflow-hidden shadow-sm"
              style={{ border: `2px solid ${FIFA_GOLD}` }}
            >
              <div
                className="px-4 py-2 text-xs font-black text-white flex items-center gap-2"
                style={{ background: `linear-gradient(90deg, ${FIFA_DARK_RED}, ${FIFA_RED})` }}
              >
                <Trophy className="w-4 h-4" style={{ color: FIFA_GOLD }} />
                🏆 决 赛
              </div>
              <div className="bg-white px-4 py-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400 flex-1 text-right pr-3">待定</span>
                  <span
                    className="text-sm font-black px-3 py-1 rounded-full text-white"
                    style={{ backgroundColor: FIFA_RED }}
                  >
                    VS
                  </span>
                  <span className="text-sm text-gray-400 flex-1 text-left pl-3">待定</span>
                </div>
                <div className="text-center mt-2 text-xs text-gray-400">
                  2026年7月19日 · 纽约/新泽西 大都会球场
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ---- 小组赛 Tab ---- */}
        {activeTab === "groups" && (
          <div className="px-4 pt-4 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1 h-5 rounded-full" style={{ backgroundColor: FIFA_RED }} />
              <span className="font-bold text-sm text-gray-800">12组 · 共48支球队</span>
            </div>
            {Object.entries(groups).map(([groupName, teams]) => (
              <div key={groupName} className="bg-white rounded-2xl overflow-hidden shadow-sm">
                <div
                  className="px-4 py-2 flex items-center gap-2"
                  style={{ backgroundColor: groupName <= "D" ? FIFA_RED : groupName <= "H" ? "#1a3a8b" : "#1a6b1a" }}
                >
                  <span className="text-white font-black text-sm">{groupName} 组</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {teams.map((team, i) => (
                    <div key={i} className="flex items-center px-4 py-2.5 gap-3">
                      <span className="text-xl">{team.flag}</span>
                      <span className="text-sm font-medium text-gray-700">{team.name}</span>
                      <div className="flex-1" />
                      <div className="flex gap-3 text-xs text-gray-400">
                        <span>积分 -</span>
                        <span>净胜 -</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ---- 冠军竞猜 Tab ---- */}
        {activeTab === "guess" && (
          <div className="px-4 pt-4 space-y-4">
            {/* 说明卡 */}
            <div
              className="rounded-2xl p-4 text-white"
              style={{ background: `linear-gradient(135deg, ${FIFA_DARK_RED}, ${FIFA_RED})` }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Star className="w-5 h-5" style={{ color: FIFA_GOLD }} />
                <span className="font-bold text-sm">冠军竞猜</span>
              </div>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.8)" }}>
                预测2026年FIFA世界杯冠军球队，功能即将开放
              </p>
            </div>

            {/* 热门夺冠赔率（展示用） */}
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1 h-5 rounded-full" style={{ backgroundColor: FIFA_RED }} />
              <span className="font-bold text-sm text-gray-800">热门夺冠球队</span>
            </div>
            {[
              { flag: "🇧🇷", name: "巴西", odds: "5.0" },
              { flag: "🇫🇷", name: "法国", odds: "5.5" },
              { flag: "🇦🇷", name: "阿根廷", odds: "6.0" },
              { flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", name: "英格兰", odds: "7.0" },
              { flag: "🇪🇸", name: "西班牙", odds: "7.5" },
              { flag: "🇩🇪", name: "德国", odds: "8.0" },
              { flag: "🇵🇹", name: "葡萄牙", odds: "9.0" },
              { flag: "🇳🇱", name: "荷兰", odds: "10.0" },
            ].map((team, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm"
              >
                <span className="text-2xl">{team.flag}</span>
                <span className="flex-1 text-sm font-semibold text-gray-800">{team.name}</span>
                <span
                  className="text-xs font-bold px-3 py-1 rounded-full"
                  style={{ backgroundColor: "#FFF8E7", color: FIFA_GOLD }}
                >
                  赔率 {team.odds}
                </span>
                <button
                  className="text-xs font-bold px-3 py-1.5 rounded-full text-white"
                  style={{ backgroundColor: FIFA_RED }}
                  onClick={() => alert("竞猜功能即将开放")}
                >
                  竞猜
                </button>
              </div>
            ))}

            <p className="text-center text-xs text-gray-400 pt-2">
              * 赔率仅供参考，竞猜功能即将开放
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
