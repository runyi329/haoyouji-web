import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

const TIENS_LEVELS = [
  { name: "经销商", code: "D", discount: 0.70, minPoints: 0, color: "text-muted-foreground" },
  { name: "高级经销商", code: "SD", discount: 0.75, minPoints: 1000, color: "text-blue-400" },
  { name: "主任", code: "S", discount: 0.80, minPoints: 5000, color: "text-green-400" },
  { name: "经理", code: "M", discount: 0.85, minPoints: 20000, color: "text-yellow-400" },
];

function getLevel(points: number) {
  for (let i = TIENS_LEVELS.length - 1; i >= 0; i--) {
    if (points >= TIENS_LEVELS[i].minPoints) return TIENS_LEVELS[i];
  }
  return TIENS_LEVELS[0];
}

const RETAIL_PRICE = 100; // 建议零售价基准

export default function TianshouSimulator() {
  const [activeTab, setActiveTab] = useState<"calc" | "rules">("calc");
  const [myPoints, setMyPoints] = useState(5000);
  const [monthlySales, setMonthlySales] = useState(10000);
  const [downlinePoints, setDownlinePoints] = useState(8000);

  const myLevel = getLevel(myPoints);
  const downlineLevel = getLevel(downlinePoints);
  
  // 差价利润：以折扣价购入，建议零售价卖出
  const purchaseDiscount = myLevel.discount;
  const retailProfit = monthlySales * (1 - purchaseDiscount);
  
  // 差额奖金：自己折扣与下线折扣的差额
  const discountDiff = myLevel.discount - downlineLevel.discount;
  const diffBonus = discountDiff > 0 ? downlinePoints * RETAIL_PRICE * 0.01 * discountDiff * 100 : 0;
  
  const totalIncome = retailProfit + diffBonus;

  return (
    <div className="p-4 md:p-6 min-h-screen">
      <div className="flex items-center gap-3 mb-5">
        <Link href="/">
          <button className="text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
        </Link>
        <div>
          <h1 className="text-lg font-bold text-foreground">天狮奖金模拟器</h1>
          <p className="text-xs text-muted-foreground">Tiens · 会员等级差价 · 4级 · 拨出率30%</p>
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
                <div className="text-xs text-muted-foreground mb-1">当前等级</div>
                <div className={cn("text-xl font-bold", myLevel.color)}>{myLevel.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">购货折扣: {(myLevel.discount * 100).toFixed(0)}折</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground mb-1">零售利润率</div>
                <div className="text-2xl font-bold text-gradient-red">
                  {((1 - myLevel.discount) * 100).toFixed(0)}%
                </div>
              </div>
            </div>
            <div className="pt-3 border-t border-border">
              <div className="text-xs text-muted-foreground mb-1">月度预计收入</div>
              <div className="text-3xl font-bold text-primary">¥{totalIncome.toFixed(0)}</div>
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                <span>零售利润: ¥{retailProfit.toFixed(0)}</span>
                {diffBonus > 0 && <span>差额奖金: ¥{diffBonus.toFixed(0)}</span>}
              </div>
            </div>
          </div>

          <div className="tech-card rounded-xl p-4 space-y-4">
            <div className="text-sm font-semibold text-foreground mb-3">调整参数</div>
            {[
              { label: "我的累计积分", value: myPoints, setter: setMyPoints, max: 30000, step: 500 },
              { label: "月销售额（零售价）", value: monthlySales, setter: setMonthlySales, max: 50000, step: 1000 },
              { label: "下线累计积分", value: downlinePoints, setter: setDownlinePoints, max: 25000, step: 500 },
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

          <div className="tech-card rounded-xl p-4">
            <div className="text-sm font-semibold text-foreground mb-3">等级体系</div>
            <div className="space-y-2">
              {TIENS_LEVELS.map((l) => (
                <div
                  key={l.code}
                  className={cn(
                    "flex items-center justify-between py-2 px-3 rounded-lg text-xs",
                    myLevel.code === l.code
                      ? "bg-primary/20 border border-primary/30"
                      : "bg-card border border-border/30"
                  )}
                >
                  <span className={cn("font-medium", l.color)}>{l.name}</span>
                  <span className="text-muted-foreground">≥{l.minPoints.toLocaleString()}积分</span>
                  <span className="text-muted-foreground">{(l.discount * 100).toFixed(0)}折购货</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "rules" && (
        <div className="space-y-3">
          {[
            { title: "制度特点", content: "天狮采用消费晋级制度，会员根据累计消费积分晋升等级，享受不同折扣购货，通过零售差价和差额奖金获利。" },
            { title: "差价利润", content: "不同等级会员以不同折扣（70%-85折）购入产品，以建议零售价销售，差价即为利润。等级越高，购货折扣越优惠。" },
            { title: "差额奖金", content: "上级会员可获得自身折扣与直接下线折扣之间的差额奖金，激励发展下线并帮助下线晋级。" },
            { title: "全球布局", content: "天狮集团在全球80+国家开展业务，是中国最早走向国际化的直销企业之一，1992年成立于天津。" },
            { title: "注意事项", content: "本模拟器为简化版，实际制度涉及月度消费要求、资格维持等更多条件。数据仅供参考。" },
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
