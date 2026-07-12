import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

const SUNHOPE_LEVELS = [
  { name: "总监", code: "D", minSalons: 5, shopBonus: 0.15, teamBonus: 0.05 },
  { name: "高级经理", code: "SM", minSalons: 3, shopBonus: 0.12, teamBonus: 0.04 },
  { name: "经理", code: "M", minSalons: 2, shopBonus: 0.10, teamBonus: 0.03 },
  { name: "高级顾问", code: "SC", minSalons: 1, shopBonus: 0.08, teamBonus: 0.02 },
  { name: "顾问", code: "C", minSalons: 0, shopBonus: 0.05, teamBonus: 0 },
];

function getLevel(salons: number) {
  for (const l of SUNHOPE_LEVELS) {
    if (salons >= l.minSalons) return l;
  }
  return SUNHOPE_LEVELS[SUNHOPE_LEVELS.length - 1];
}

export default function SunhopeSimulator() {
  const [activeTab, setActiveTab] = useState<"calc" | "rules">("calc");
  const [mySalonSales, setMySalonSales] = useState(30000);
  const [mySalons, setMySalons] = useState(2);
  const [teamSales, setTeamSales] = useState(60000);

  const myLevel = getLevel(mySalons);
  
  // 店补：自己沙龙的销售额 × 店补率
  const shopBonus = mySalonSales * myLevel.shopBonus;
  
  // 团队分红：下线团队销售额 × 团队奖金率
  const teamBonus = teamSales * myLevel.teamBonus;
  
  const totalIncome = shopBonus + teamBonus;

  return (
    <div className="p-4 md:p-6 min-h-screen">
      <div className="flex items-center gap-3 mb-5">
        <Link href="/">
          <button className="text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
        </Link>
        <div>
          <h1 className="text-lg font-bold text-foreground">尚赫奖金模拟器</h1>
          <p className="text-xs text-muted-foreground">Sunhope · 店补+分红 · 5级 · 拨出率58%</p>
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
                <div className="text-xs text-muted-foreground mb-1">店补率</div>
                <div className="text-2xl font-bold text-gradient-red">{(myLevel.shopBonus * 100).toFixed(0)}%</div>
              </div>
            </div>
            <div className="pt-3 border-t border-border">
              <div className="text-xs text-muted-foreground mb-1">月度预计收入</div>
              <div className="text-3xl font-bold text-primary">¥{totalIncome.toFixed(0)}</div>
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                <span>店补: ¥{shopBonus.toFixed(0)}</span>
                {teamBonus > 0 && <span>团队分红: ¥{teamBonus.toFixed(0)}</span>}
              </div>
            </div>
          </div>

          <div className="tech-card rounded-xl p-4 space-y-4">
            <div className="text-sm font-semibold text-foreground mb-3">调整参数</div>
            {[
              { label: "我的沙龙月销售额", value: mySalonSales, setter: setMySalonSales, max: 100000, step: 1000, unit: "元" },
              { label: "我管理的沙龙数", value: mySalons, setter: setMySalons, max: 10, step: 1, unit: "家" },
              { label: "团队月销售额", value: teamSales, setter: setTeamSales, max: 300000, step: 5000, unit: "元" },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="text-foreground font-medium">{item.value.toLocaleString()} {item.unit}</span>
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

          <div className="tech-card rounded-xl p-4">
            <div className="text-sm font-semibold text-foreground mb-3">职级体系</div>
            <div className="space-y-2">
              {SUNHOPE_LEVELS.map((l) => (
                <div
                  key={l.code}
                  className={cn(
                    "flex items-center justify-between py-2 px-3 rounded-lg text-xs",
                    myLevel.code === l.code
                      ? "bg-primary/20 border border-primary/30"
                      : "bg-card border border-border/30"
                  )}
                >
                  <span className={cn("font-medium", myLevel.code === l.code ? "text-primary" : "text-foreground")}>
                    {l.name}
                  </span>
                  <span className="text-muted-foreground">≥{l.minSalons}家沙龙</span>
                  <span className="text-muted-foreground">店补{(l.shopBonus * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "rules" && (
        <div className="space-y-3">
          {[
            { title: "制度特点", content: "尚赫以美容沙龙店为核心运营单元，采用店补+分红双轨制度。顾问通过经营沙龙获得店补，同时通过发展下线团队获得分红。" },
            { title: "店补制度", content: "顾问经营美容沙龙，根据沙龙月销售额获得5%-15%的店补奖励。职级越高，店补率越高。" },
            { title: "团队分红", content: "经理及以上职级（管理≥2家沙龙）可获得下线团队销售额的3%-5%分红奖励，激励团队扩张。" },
            { title: "注意事项", content: "本模拟器为简化版，实际制度涉及沙龙资质认证、月度维持要求等更多条件。数据仅供参考。" },
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
