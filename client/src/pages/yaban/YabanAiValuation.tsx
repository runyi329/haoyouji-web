/**
 * 牙伴齿科管理 - AI估值
 * 路由：/yaban/ai-valuation
 * 面向投资人的门店动态价值评估展示页。
 * 当前为展示框架：核心估值、关键经营指标、估值构成、趋势说明；
 * 后续可接入实时经营数据驱动动态估值模型。
 * 严禁 Emoji，仅用 lucide-react 图标，配色沿用牙伴蓝青系。
 */
import { useLocation } from "wouter";
import { ChevronLeft, TrendingUp, Activity, Users, Wallet } from "lucide-react";
import YabanTabBar from "./YabanTabBar";
import { PageTag } from "@/components/PageTag";

export default function YabanAiValuation() {
  const [, setLocation] = useLocation();

  const metrics = [
    { label: "月营收", value: "—", icon: Wallet, color: "#2196C8" },
    { label: "活跃患者", value: "—", icon: Users, color: "#2BA471" },
    { label: "复诊率", value: "—", icon: Activity, color: "#7C5CFC" },
    { label: "椅位利用率", value: "—", icon: TrendingUp, color: "#E8973A" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <PageTag code="P403" />
      <div
        className="text-white sticky top-0 z-40"
        style={{ background: "linear-gradient(135deg, #2196C8 0%, #4DB8E8 100%)" }}
      >
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => setLocation("/yaban/features")} className="p-1" aria-label="返回">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-base font-bold">AI估值</span>
          <span className="w-6" />
        </div>
      </div>

      <div className="max-w-lg mx-auto pb-20">
        {/* 核心估值卡 */}
        <div
          className="mx-3 mt-3 rounded-2xl p-5 text-white relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, #2196C8 0%, #1B7AA8 100%)" }}
        >
          <div className="text-xs opacity-80">AI 实时动态估值</div>
          <div className="mt-2 flex items-end gap-2">
            <span className="text-3xl font-bold tracking-tight">待评估</span>
          </div>
          <div className="mt-2 text-xs opacity-80 flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" />
            基于经营数据动态测算，模型接入中
          </div>
        </div>

        {/* 关键指标 */}
        <div className="grid grid-cols-2 gap-3 px-3 mt-3">
          {metrics.map((m) => {
            const Icon = m.icon;
            return (
              <div key={m.label} className="bg-white rounded-xl p-4">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center mb-2"
                  style={{ background: m.color + "1A" }}
                >
                  <Icon className="w-5 h-5" style={{ color: m.color }} />
                </div>
                <div className="text-lg font-bold text-gray-800">{m.value}</div>
                <div className="text-xs text-gray-400 mt-0.5">{m.label}</div>
              </div>
            );
          })}
        </div>

        {/* 估值说明 */}
        <div className="bg-white mx-3 mt-3 rounded-xl p-4">
          <div className="text-sm font-semibold text-gray-800 mb-2">估值模型说明</div>
          <p className="text-xs text-gray-500 leading-relaxed">
            AI 估值依据门店实时经营数据（营收规模与增长、患者资产与复诊粘性、椅位与人效、口碑与获客成本等）
            进行动态加权测算，帮助投资人快速、客观地评估门店当前价值与成长性。
            随着经营数据接入完善，本页将展示可实时刷新的估值区间与趋势曲线。
          </p>
        </div>
      </div>

      <YabanTabBar />
    </div>
  );
}
