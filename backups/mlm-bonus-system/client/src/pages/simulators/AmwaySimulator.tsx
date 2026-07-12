import { useState, useMemo } from "react";
import { ChevronLeft, Calculator, Info } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

const AMWAY_LEVELS = [
  { name: "21%", pv: 10000, rate: 0.21 },
  { name: "18%", pv: 7000, rate: 0.18 },
  { name: "15%", pv: 4000, rate: 0.15 },
  { name: "12%", pv: 2500, rate: 0.12 },
  { name: "9%", pv: 1500, rate: 0.09 },
  { name: "6%", pv: 600, rate: 0.06 },
  { name: "3%", pv: 200, rate: 0.03 },
];

const BV_RATIO = 2.5; // 1 PV ≈ 2.5 BV（人民币）

function getLevel(pv: number) {
  for (const l of AMWAY_LEVELS) {
    if (pv >= l.pv) return l;
  }
  return AMWAY_LEVELS[AMWAY_LEVELS.length - 1];
}

interface Member {
  id: number;
  name: string;
  pv: number;
  downlines: Member[];
}

const defaultTeam: Member[] = [
  { id: 1, name: "我", pv: 3000, downlines: [
    { id: 2, name: "下线A", pv: 1200, downlines: [
      { id: 4, name: "A-1", pv: 400, downlines: [] },
      { id: 5, name: "A-2", pv: 300, downlines: [] },
    ]},
    { id: 3, name: "下线B", pv: 800, downlines: [
      { id: 6, name: "B-1", pv: 200, downlines: [] },
    ]},
  ]},
];

function calcBonus(member: Member): { selfPV: number; groupPV: number; bonus: number } {
  const downlineTotal = member.downlines.reduce((sum, d) => sum + calcBonus(d).groupPV, 0);
  const groupPV = member.pv + downlineTotal;
  const myLevel = getLevel(groupPV);
  
  let bonus = member.pv * BV_RATIO * myLevel.rate;
  
  // 差额奖金：减去下线的奖金
  for (const d of member.downlines) {
    const dLevel = getLevel(calcBonus(d).groupPV);
    const diff = myLevel.rate - dLevel.rate;
    if (diff > 0) {
      bonus += calcBonus(d).groupPV * BV_RATIO * diff;
    }
  }
  
  return { selfPV: member.pv, groupPV, bonus };
}

function MemberRow({ member, depth = 0 }: { member: Member; depth?: number }) {
  const { groupPV, bonus } = calcBonus(member);
  const level = getLevel(groupPV);
  
  return (
    <>
      <tr className="border-b border-border/30">
        <td className="py-2 px-3">
          <div className="flex items-center gap-1" style={{ paddingLeft: depth * 16 }}>
            {depth > 0 && <span className="text-muted-foreground text-xs">└</span>}
            <span className="text-sm text-foreground">{member.name}</span>
          </div>
        </td>
        <td className="py-2 px-3 text-right text-sm text-muted-foreground">{member.pv.toLocaleString()}</td>
        <td className="py-2 px-3 text-right text-sm text-muted-foreground">{groupPV.toLocaleString()}</td>
        <td className="py-2 px-3 text-right">
          <span className="text-xs bg-primary/20 text-primary border border-primary/30 px-1.5 py-0.5 rounded">
            {level.name}
          </span>
        </td>
        <td className="py-2 px-3 text-right text-sm font-semibold text-primary">
          ¥{bonus.toFixed(0)}
        </td>
      </tr>
      {member.downlines.map((d) => (
        <MemberRow key={d.id} member={d} depth={depth + 1} />
      ))}
    </>
  );
}

export default function AmwaySimulator() {
  const [myPV, setMyPV] = useState(3000);
  const [dl1PV, setDl1PV] = useState(1200);
  const [dl2PV, setDl2PV] = useState(800);
  const [activeTab, setActiveTab] = useState<"calc" | "rules" | "tree">("calc");

  const team: Member = useMemo(() => ({
    id: 1, name: "我", pv: myPV, downlines: [
      { id: 2, name: "下线A", pv: dl1PV, downlines: [
        { id: 4, name: "A-1", pv: 400, downlines: [] },
        { id: 5, name: "A-2", pv: 300, downlines: [] },
      ]},
      { id: 3, name: "下线B", pv: dl2PV, downlines: [
        { id: 6, name: "B-1", pv: 200, downlines: [] },
      ]},
    ],
  }), [myPV, dl1PV, dl2PV]);

  const { groupPV, bonus } = calcBonus(team);
  const myLevel = getLevel(groupPV);

  return (
    <div className="p-4 md:p-6 min-h-screen">
      <div className="flex items-center gap-3 mb-5">
        <Link href="/">
          <button className="text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
        </Link>
        <div>
          <h1 className="text-lg font-bold text-foreground">安利奖金模拟器</h1>
          <p className="text-xs text-muted-foreground">Amway · 级差制 · 7级 · 拨出率43%</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-card rounded-xl p-1 border border-border">
        {[
          { key: "calc", label: "计算器", icon: Calculator },
          { key: "tree", label: "组织树", icon: null },
          { key: "rules", label: "制度说明", icon: Info },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={cn(
              "flex-1 py-2 text-xs font-medium rounded-lg transition-all",
              activeTab === tab.key
                ? "bg-primary text-white"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "calc" && (
        <div className="space-y-4">
          {/* Summary card */}
          <div className="tech-card rounded-xl p-4">
            <div className="text-xs text-muted-foreground mb-1">当前等级</div>
            <div className="text-2xl font-bold text-gradient-red">{myLevel.name}</div>
            <div className="text-xs text-muted-foreground mt-1">团队PV: {groupPV.toLocaleString()}</div>
            <div className="mt-3 pt-3 border-t border-border">
              <div className="text-xs text-muted-foreground mb-1">本月预计奖金</div>
              <div className="text-3xl font-bold text-primary">¥{bonus.toFixed(0)}</div>
            </div>
          </div>

          {/* Sliders */}
          <div className="tech-card rounded-xl p-4 space-y-4">
            <div className="text-sm font-semibold text-foreground mb-3">调整业绩参数</div>
            
            {[
              { label: "我的个人PV", value: myPV, setter: setMyPV, max: 15000 },
              { label: "下线A团队PV", value: dl1PV, setter: setDl1PV, max: 12000 },
              { label: "下线B团队PV", value: dl2PV, setter: setDl2PV, max: 8000 },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="text-foreground font-medium">{item.value.toLocaleString()} PV</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={item.max}
                  step={100}
                  value={item.value}
                  onChange={(e) => item.setter(Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>
            ))}
          </div>

          {/* Level table */}
          <div className="tech-card rounded-xl p-4">
            <div className="text-sm font-semibold text-foreground mb-3">级别对照表</div>
            <div className="space-y-2">
              {AMWAY_LEVELS.map((l) => (
                <div
                  key={l.name}
                  className={cn(
                    "flex items-center justify-between py-2 px-3 rounded-lg text-xs",
                    myLevel.name === l.name
                      ? "bg-primary/20 border border-primary/30"
                      : "bg-card border border-border/30"
                  )}
                >
                  <span className={cn("font-semibold", myLevel.name === l.name ? "text-primary" : "text-foreground")}>
                    {l.name}
                  </span>
                  <span className="text-muted-foreground">≥ {l.pv.toLocaleString()} PV</span>
                  <span className="text-muted-foreground">BV×{l.rate * 100}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "tree" && (
        <div className="tech-card rounded-xl overflow-hidden">
          <div className="p-3 border-b border-border">
            <div className="text-sm font-semibold text-foreground">组织树奖金分析</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[400px]">
              <thead>
                <tr className="border-b border-border bg-card/50">
                  <th className="py-2 px-3 text-left text-xs text-muted-foreground">成员</th>
                  <th className="py-2 px-3 text-right text-xs text-muted-foreground">个人PV</th>
                  <th className="py-2 px-3 text-right text-xs text-muted-foreground">团队PV</th>
                  <th className="py-2 px-3 text-right text-xs text-muted-foreground">级别</th>
                  <th className="py-2 px-3 text-right text-xs text-muted-foreground">奖金</th>
                </tr>
              </thead>
              <tbody>
                <MemberRow member={team} />
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "rules" && (
        <div className="space-y-3">
          {[
            {
              title: "基本制度",
              content: "安利采用级差制奖金体系，以PV（积分值）和BV（业绩值）双积分制度为核心。1 PV约等于2.5元人民币的BV。",
            },
            {
              title: "7级奖金比例",
              content: "根据团队总PV达到不同门槛，享受3%至21%的奖金比例。差额奖金制度：上级享受自身比例与下级比例的差额部分。",
            },
            {
              title: "领导奖",
              content: "当下线达到21%级别（独立营业主）后，上级可获得6%的领导奖，以及更高级别的红宝石、翡翠、钻石等荣誉奖励。",
            },
            {
              title: "注意事项",
              content: "本模拟器为简化版，实际奖金计算涉及更多规则，包括月度业绩要求、资格维持条件等。数据仅供参考。",
            },
          ].map((item) => (
            <div key={item.title} className="tech-card rounded-xl p-4">
              <div className="text-sm font-semibold text-foreground mb-2">{item.title}</div>
              <p className="text-xs text-muted-foreground leading-relaxed">{item.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
