import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

// 如新太阳线制：无限代，以直接下线为"腿"，每条腿独立计算
const NUSKIN_LEVELS = [
  { name: "钻石执行官", code: "DEX", minPSV: 2000, minGSV: 500000, execBonus: 0.09, color: "text-cyan-300" },
  { name: "执行官", code: "EX", minPSV: 2000, minGSV: 100000, execBonus: 0.08, color: "text-cyan-400" },
  { name: "黄金执行官", code: "GEX", minPSV: 2000, minGSV: 50000, execBonus: 0.06, color: "text-yellow-400" },
  { name: "白银执行官", code: "SEX", minPSV: 2000, minGSV: 20000, execBonus: 0.05, color: "text-gray-300" },
  { name: "执行官候选", code: "EC", minPSV: 2000, minGSV: 5000, execBonus: 0.03, color: "text-blue-400" },
  { name: "活跃会员", code: "AM", minPSV: 100, minGSV: 0, execBonus: 0, color: "text-muted-foreground" },
];

function getLevel(psv: number, gsv: number) {
  for (const l of NUSKIN_LEVELS) {
    if (psv >= l.minPSV && gsv >= l.minGSV) return l;
  }
  return NUSKIN_LEVELS[NUSKIN_LEVELS.length - 1];
}

export default function NuSkinSimulator() {
  const [activeTab, setActiveTab] = useState<"calc" | "rules">("calc");
  const [myPSV, setMyPSV] = useState(2500);
  const [teamGSV, setTeamGSV] = useState(30000);
  const [directLegs, setDirectLegs] = useState(5);
  const [avgLegGSV, setAvgLegGSV] = useState(6000);

  const myLevel = getLevel(myPSV, teamGSV);
  
  // 零售利润（PSV约等于人民币，利润约30%）
  const retailProfit = myPSV * 0.30;
  
  // 执行官奖金（对团队GSV的提成）
  const execBonus = myLevel.execBonus > 0 ? teamGSV * myLevel.execBonus : 0;
  
  // 品牌分红（简化：执行官以上享受全球业绩分红，约0.5%）
  const brandBonus = myLevel.execBonus >= 0.05 ? teamGSV * 0.005 : 0;
  
  const totalIncome = retailProfit + execBonus + brandBonus;

  return (
    <div className="p-4 md:p-6 min-h-screen">
      <div className="flex items-center gap-3 mb-5">
        <Link href="/">
          <button className="text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
        </Link>
        <div>
          <h1 className="text-lg font-bold text-foreground">如新奖金模拟器</h1>
          <p className="text-xs text-muted-foreground">Nu Skin · 太阳线制 · 无限代 · 拨出率45%</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-card rounded-xl p-1 border border-border">
        {[
          { key: "calc", label: "计算器" },
          { key: "rules", label: "制度说明" },
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
          <div className="tech-card rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-xs text-muted-foreground mb-1">当前职级</div>
                <div className={cn("text-xl font-bold", myLevel.color)}>{myLevel.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{myLevel.code}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground mb-1">执行官奖金率</div>
                <div className="text-2xl font-bold text-gradient-red">
                  {myLevel.execBonus > 0 ? `${(myLevel.execBonus * 100).toFixed(0)}%` : "—"}
                </div>
              </div>
            </div>
            <div className="pt-3 border-t border-border">
              <div className="text-xs text-muted-foreground mb-1">月度预计收入</div>
              <div className="text-3xl font-bold text-primary">¥{totalIncome.toFixed(0)}</div>
              <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                <span>零售利润: ¥{retailProfit.toFixed(0)}</span>
                {execBonus > 0 && <span>执行官奖金: ¥{execBonus.toFixed(0)}</span>}
                {brandBonus > 0 && <span>品牌分红: ¥{brandBonus.toFixed(0)}</span>}
              </div>
            </div>
          </div>

          <div className="tech-card rounded-xl p-4 space-y-4">
            <div className="text-sm font-semibold text-foreground mb-3">调整参数</div>
            {[
              { label: "我的个人PSV", value: myPSV, setter: setMyPSV, max: 10000, step: 100 },
              { label: "团队总GSV", value: teamGSV, setter: setTeamGSV, max: 600000, step: 5000 },
              { label: "直接下线数（太阳线数）", value: directLegs, setter: setDirectLegs, max: 20, step: 1 },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="text-foreground font-medium">{item.value.toLocaleString()}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={item.max}
                  step={item.step}
                  value={item.value}
                  onChange={(e) => item.setter(Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>
            ))}
          </div>

          {/* Level table */}
          <div className="tech-card rounded-xl p-4">
            <div className="text-sm font-semibold text-foreground mb-3">职级体系</div>
            <div className="space-y-1.5">
              {NUSKIN_LEVELS.map((l) => (
                <div
                  key={l.code}
                  className={cn(
                    "flex items-center justify-between py-1.5 px-3 rounded-lg text-xs",
                    myLevel.code === l.code
                      ? "bg-primary/20 border border-primary/30"
                      : "bg-card border border-border/30"
                  )}
                >
                  <span className={cn("font-medium", l.color)}>{l.name}</span>
                  <span className="text-muted-foreground">GSV≥{l.minGSV.toLocaleString()}</span>
                  <span className="text-muted-foreground">{l.execBonus > 0 ? `${(l.execBonus * 100).toFixed(0)}%` : "—"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "rules" && (
        <div className="space-y-3">
          {[
            { title: "太阳线制", content: "如新采用太阳线制度，每个会员可以无限发展直接下线（太阳线），每条线独立计算业绩，没有宽度限制。" },
            { title: "Velocity计划", content: "如新的销售补偿计划称为Velocity，以PSV（个人销售积分）和GSV（团队销售积分）为核心指标，达到不同门槛享受不同奖金。" },
            { title: "执行官奖金", content: "达到执行官候选及以上职级（个人PSV≥2000，团队GSV≥5000），可获得团队GSV的3%-9%执行官奖金。" },
            { title: "品牌分红", content: "白银执行官及以上职级可参与如新全球业绩分红计划，享受公司整体业绩的分红奖励。" },
            { title: "注意事项", content: "本模拟器为简化版，实际制度涉及月度维持要求、资格认证等更多条件。数据仅供参考。" },
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
