import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

// 双轨制：左右两条腿，以较小腿为基准计算对碰奖金
const BABYCARE_LEVELS = [
  { name: "钻石总监", code: "DD", minPairs: 5000, pairBonus: 0.10, capPerDay: 5000 },
  { name: "金钻总监", code: "GD", minPairs: 3000, pairBonus: 0.09, capPerDay: 3000 },
  { name: "蓝钻总监", code: "BD", minPairs: 1500, pairBonus: 0.08, capPerDay: 2000 },
  { name: "总监", code: "D", minPairs: 600, pairBonus: 0.07, capPerDay: 1500 },
  { name: "经理", code: "M", minPairs: 200, pairBonus: 0.06, capPerDay: 1000 },
  { name: "主任", code: "S", minPairs: 60, pairBonus: 0.05, capPerDay: 600 },
  { name: "顾问", code: "C", minPairs: 0, pairBonus: 0.04, capPerDay: 300 },
];

function getLevel(pairs: number) {
  for (const l of BABYCARE_LEVELS) {
    if (pairs >= l.minPairs) return l;
  }
  return BABYCARE_LEVELS[BABYCARE_LEVELS.length - 1];
}

export default function BabycareSimulator() {
  const [activeTab, setActiveTab] = useState<"calc" | "rules">("calc");
  const [leftPV, setLeftPV] = useState(3000);
  const [rightPV, setRightPV] = useState(2500);
  const [days, setDays] = useState(30);

  const smallLeg = Math.min(leftPV, rightPV);
  const myLevel = getLevel(smallLeg);
  
  // 对碰奖金：较小腿 × 奖金率，但每日有上限
  const dailyBonus = Math.min(smallLeg * myLevel.pairBonus, myLevel.capPerDay);
  const monthlyBonus = dailyBonus * days;
  
  // 直推奖（简化：每直推一个会员约50元）
  const directBonus = 0;
  
  const totalIncome = monthlyBonus + directBonus;

  return (
    <div className="p-4 md:p-6 min-h-screen">
      <div className="flex items-center gap-3 mb-5">
        <Link href="/">
          <button className="text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
        </Link>
        <div>
          <h1 className="text-lg font-bold text-foreground">葆婴奖金模拟器</h1>
          <p className="text-xs text-muted-foreground">Babycare · 双轨对碰 · 7级 · 拨出率55%</p>
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
          {/* Dual track visualization */}
          <div className="tech-card rounded-xl p-4">
            <div className="text-xs text-muted-foreground mb-3">双轨对碰示意</div>
            <div className="flex items-center gap-2 mb-4">
              <div className="flex-1 bg-card border border-border rounded-lg p-3 text-center">
                <div className="text-xs text-muted-foreground mb-1">左腿 PV</div>
                <div className={cn("text-xl font-bold", leftPV >= rightPV ? "text-primary" : "text-foreground")}>
                  {leftPV.toLocaleString()}
                </div>
              </div>
              <div className="text-muted-foreground text-xs font-bold">VS</div>
              <div className="flex-1 bg-card border border-border rounded-lg p-3 text-center">
                <div className="text-xs text-muted-foreground mb-1">右腿 PV</div>
                <div className={cn("text-xl font-bold", rightPV >= leftPV ? "text-primary" : "text-foreground")}>
                  {rightPV.toLocaleString()}
                </div>
              </div>
            </div>
            <div className="bg-primary/10 border border-primary/30 rounded-lg p-3 text-center">
              <div className="text-xs text-muted-foreground mb-1">对碰基准（较小腿）</div>
              <div className="text-2xl font-bold text-primary">{smallLeg.toLocaleString()} PV</div>
              <div className="text-xs text-muted-foreground mt-1">职级: {myLevel.name} · 奖金率: {(myLevel.pairBonus * 100).toFixed(0)}%</div>
            </div>
          </div>

          <div className="tech-card rounded-xl p-4">
            <div className="pt-0 border-t-0">
              <div className="text-xs text-muted-foreground mb-1">月度预计奖金</div>
              <div className="text-3xl font-bold text-primary">¥{totalIncome.toFixed(0)}</div>
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                <span>日奖金: ¥{dailyBonus.toFixed(0)}</span>
                <span>日上限: ¥{myLevel.capPerDay.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="tech-card rounded-xl p-4 space-y-4">
            <div className="text-sm font-semibold text-foreground mb-3">调整参数</div>
            {[
              { label: "左腿月PV", value: leftPV, setter: setLeftPV, max: 8000 },
              { label: "右腿月PV", value: rightPV, setter: setRightPV, max: 8000 },
              { label: "计算天数", value: days, setter: setDays, max: 31, step: 1 },
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
                  step={item.step ?? 100}
                  value={item.value}
                  onChange={(e) => item.setter(Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "rules" && (
        <div className="space-y-3">
          {[
            { title: "双轨制原理", content: "双轨制要求每个会员只能发展两个直接下线（左腿和右腿），形成两条业绩线。奖金以较小腿的业绩为基准计算。" },
            { title: "对碰奖金", content: "每日以左右腿中较小腿的PV为基准，乘以奖金率（4%-10%），但每日奖金有上限（300-5000元），防止奖金超发。" },
            { title: "细胞矩阵", content: "葆婴采用细胞矩阵法，强调团队均衡发展。左右腿业绩差距越小，奖金效率越高。" },
            { title: "注意事项", content: "本模拟器为简化版，实际制度涉及个人消费要求、团队维持条件等更多规则。数据仅供参考。" },
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
