import { useState } from "react";
import { ChevronLeft, Calculator, Info } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

const MARYKAY_LEVELS = [
  { name: "国家销售督导", code: "NSD", rate: 0.13, minConsultants: 24, color: "text-yellow-400" },
  { name: "高级销售督导", code: "SSD", rate: 0.11, minConsultants: 12, color: "text-orange-400" },
  { name: "销售督导", code: "SD", rate: 0.09, minConsultants: 5, color: "text-red-400" },
  { name: "高级美容顾问", code: "SAC", rate: 0.05, minConsultants: 2, color: "text-blue-400" },
  { name: "美容顾问", code: "AC", rate: 0, minConsultants: 0, color: "text-muted-foreground" },
];

function getLevel(consultants: number) {
  for (const l of MARYKAY_LEVELS) {
    if (consultants >= l.minConsultants) return l;
  }
  return MARYKAY_LEVELS[MARYKAY_LEVELS.length - 1];
}

export default function MaryKaySimulator() {
  const [activeTab, setActiveTab] = useState<"calc" | "rules">("calc");
  const [mySales, setMySales] = useState(5000);
  const [consultants, setConsultants] = useState(8);
  const [avgConsultantSales, setAvgConsultantSales] = useState(3000);

  const myLevel = getLevel(consultants);
  const teamSales = consultants * avgConsultantSales;
  
  // 零售利润（建议零售价与批发价差约50%）
  const retailProfit = mySales * 0.5;
  
  // 代数奖金（对下线团队销售额的提成）
  const generationBonus = teamSales * myLevel.rate;
  
  // 招募奖金（每招募一名新顾问约500元）
  const recruitBonus = 0; // 简化，不计
  
  const totalBonus = retailProfit + generationBonus;

  return (
    <div className="p-4 md:p-6 min-h-screen">
      <div className="flex items-center gap-3 mb-5">
        <Link href="/">
          <button className="text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
        </Link>
        <div>
          <h1 className="text-lg font-bold text-foreground">玫琳凯奖金模拟器</h1>
          <p className="text-xs text-muted-foreground">Mary Kay · 代数制 · 5代 · 拨出率50%</p>
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
          {/* Level badge */}
          <div className="tech-card rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-xs text-muted-foreground mb-1">当前职级</div>
                <div className={cn("text-xl font-bold", myLevel.color)}>{myLevel.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{myLevel.code}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground mb-1">代数奖金率</div>
                <div className="text-2xl font-bold text-primary">{(myLevel.rate * 100).toFixed(0)}%</div>
              </div>
            </div>
            <div className="pt-3 border-t border-border">
              <div className="text-xs text-muted-foreground mb-1">月度预计收入</div>
              <div className="text-3xl font-bold text-primary">¥{totalBonus.toFixed(0)}</div>
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                <span>零售利润: ¥{retailProfit.toFixed(0)}</span>
                <span>代数奖金: ¥{generationBonus.toFixed(0)}</span>
              </div>
            </div>
          </div>

          {/* Sliders */}
          <div className="tech-card rounded-xl p-4 space-y-4">
            <div className="text-sm font-semibold text-foreground mb-3">调整参数</div>
            
            {[
              { label: "我的个人销售额", value: mySales, setter: setMySales, max: 20000, unit: "元" },
              { label: "我的顾问人数", value: consultants, setter: setConsultants, max: 30, unit: "人" },
              { label: "顾问平均销售额", value: avgConsultantSales, setter: setAvgConsultantSales, max: 10000, unit: "元" },
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
                  step={item.unit === "人" ? 1 : 100}
                  value={item.value}
                  onChange={(e) => item.setter(Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>
            ))}
          </div>

          {/* Level progression */}
          <div className="tech-card rounded-xl p-4">
            <div className="text-sm font-semibold text-foreground mb-3">职级晋升路径</div>
            <div className="space-y-2">
              {MARYKAY_LEVELS.map((l) => (
                <div
                  key={l.code}
                  className={cn(
                    "flex items-center justify-between py-2 px-3 rounded-lg text-xs",
                    myLevel.code === l.code
                      ? "bg-primary/20 border border-primary/30"
                      : "bg-card border border-border/30"
                  )}
                >
                  <span className={cn("font-semibold", l.color)}>{l.name}</span>
                  <span className="text-muted-foreground">≥ {l.minConsultants} 顾问</span>
                  <span className="text-muted-foreground">{(l.rate * 100).toFixed(0)}% 代数奖</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "rules" && (
        <div className="space-y-3">
          {[
            {
              title: "收入来源",
              content: "玫琳凯顾问的收入分为三部分：零售利润（建议零售价与批发价差约50%）、代数奖金（对下线销售额的提成）、招募奖励。",
            },
            {
              title: "督导制度",
              content: "核心晋升路径：美容顾问→高级美容顾问→销售督导→高级销售督导→国家销售督导。督导级别享受下线团队销售额的9%-13%代数奖金。",
            },
            {
              title: "粉红凯迪拉克",
              content: "达到一定业绩的督导可获得玫琳凯标志性的粉红色凯迪拉克使用权，是品牌文化的重要组成部分。",
            },
            {
              title: "注意事项",
              content: "本模拟器为简化版，实际奖金涉及月度业绩维持、团队规模要求等更多条件。数据仅供参考。",
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
