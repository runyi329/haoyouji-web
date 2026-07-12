import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

const INFINITUS_LEVELS = [
  { name: "高级市场总监", code: "GMD", pv: 80000, rate: 0.21, bonus: 0.05 },
  { name: "市场总监", code: "MD", pv: 40000, rate: 0.18, bonus: 0.04 },
  { name: "高级市场经理", code: "GMM", pv: 20000, rate: 0.15, bonus: 0.03 },
  { name: "市场经理", code: "MM", pv: 10000, rate: 0.12, bonus: 0.02 },
  { name: "高级业务经理", code: "GBM", pv: 5000, rate: 0.09, bonus: 0 },
  { name: "业务经理", code: "BM", pv: 2000, rate: 0.06, bonus: 0 },
  { name: "高级业务员", code: "SBA", pv: 800, rate: 0.03, bonus: 0 },
  { name: "业务员", code: "BA", pv: 300, rate: 0.01, bonus: 0 },
  { name: "优惠顾客", code: "PC", pv: 0, rate: 0, bonus: 0 },
];

function getLevel(pv: number) {
  for (const l of INFINITUS_LEVELS) {
    if (pv >= l.pv) return l;
  }
  return INFINITUS_LEVELS[INFINITUS_LEVELS.length - 1];
}

const PV_TO_RMB = 10; // 1 PV ≈ 10元

export default function InfinitusSimulator() {
  const [activeTab, setActiveTab] = useState<"calc" | "rules">("calc");
  const [myPV, setMyPV] = useState(5000);
  const [teamPV, setTeamPV] = useState(15000);

  const totalPV = myPV + teamPV;
  const myLevel = getLevel(totalPV);
  
  // 差额奖金
  const diffRate = myLevel.rate;
  const bonus = totalPV * PV_TO_RMB * diffRate;
  
  // 分红奖金（市场经理及以上）
  const dividendBonus = myLevel.bonus > 0 ? totalPV * PV_TO_RMB * myLevel.bonus : 0;
  
  const totalIncome = bonus + dividendBonus;

  return (
    <div className="p-4 md:p-6 min-h-screen">
      <div className="flex items-center gap-3 mb-5">
        <Link href="/">
          <button className="text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
        </Link>
        <div>
          <h1 className="text-lg font-bold text-foreground">无限极奖金模拟器</h1>
          <p className="text-xs text-muted-foreground">Infinitus · 级差+分红 · 9级 · 拨出率60%</p>
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
                <div className="text-xl font-bold text-primary">{myLevel.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{myLevel.code}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground mb-1">奖金率</div>
                <div className="text-2xl font-bold text-gradient-red">{(myLevel.rate * 100).toFixed(0)}%</div>
              </div>
            </div>
            <div className="pt-3 border-t border-border">
              <div className="text-xs text-muted-foreground mb-1">月度预计收入</div>
              <div className="text-3xl font-bold text-primary">¥{totalIncome.toFixed(0)}</div>
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                <span>差额奖金: ¥{bonus.toFixed(0)}</span>
                {dividendBonus > 0 && <span>分红奖金: ¥{dividendBonus.toFixed(0)}</span>}
              </div>
            </div>
          </div>

          <div className="tech-card rounded-xl p-4 space-y-4">
            <div className="text-sm font-semibold text-foreground mb-3">调整参数</div>
            {[
              { label: "我的个人PV", value: myPV, setter: setMyPV, max: 30000 },
              { label: "团队PV（下线合计）", value: teamPV, setter: setTeamPV, max: 80000 },
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
                  step={500}
                  value={item.value}
                  onChange={(e) => item.setter(Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>
            ))}
          </div>

          <div className="tech-card rounded-xl p-4">
            <div className="text-sm font-semibold text-foreground mb-3">9级职级体系</div>
            <div className="space-y-1.5">
              {INFINITUS_LEVELS.map((l) => (
                <div
                  key={l.code}
                  className={cn(
                    "flex items-center justify-between py-1.5 px-3 rounded-lg text-xs",
                    myLevel.code === l.code
                      ? "bg-primary/20 border border-primary/30"
                      : "bg-card border border-border/30"
                  )}
                >
                  <span className={cn("font-medium", myLevel.code === l.code ? "text-primary" : "text-foreground")}>
                    {l.name}
                  </span>
                  <span className="text-muted-foreground">≥{l.pv.toLocaleString()}PV</span>
                  <span className="text-muted-foreground">{(l.rate * 100).toFixed(0)}%{l.bonus > 0 ? `+${(l.bonus * 100).toFixed(0)}%分红` : ""}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "rules" && (
        <div className="space-y-3">
          {[
            { title: "制度特点", content: "无限极采用级差制+分红制双轨制度，9个职级，最高拨出率达60%，是中国本土最大直销企业之一。" },
            { title: "差额奖金", content: "根据团队总PV达到不同职级，享受1%-21%的差额奖金。上级享受自身比例与直接下线比例的差额部分。" },
            { title: "分红奖金", content: "市场经理及以上职级（团队PV≥10000）可额外享受2%-5%的分红奖金，体现对高级别经营者的额外激励。" },
            { title: "注意事项", content: "本模拟器为简化版，实际制度涉及个人业绩要求、团队维持条件等更多规则。数据仅供参考。" },
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
