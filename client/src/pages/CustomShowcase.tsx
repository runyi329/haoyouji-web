import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { ChevronLeft, Gem, X, MessageSquare, TrendingUp, Heart, GraduationCap, ShoppingBag, Home, Briefcase, Utensils, Car, Dumbbell, Music, Stethoscope, Building2, Users, Star, ArrowRight } from "lucide-react";

// ===== 场景数据 =====
const SCENARIOS = [
  // 中心
  {
    id: "core", label: "底层账本\n引擎", icon: Gem, color: "#D32F2F", textColor: "#fff",
    size: "large", desc: "以账本共享为底层逻辑，无限延伸定制场景", ring: 0, angle: 0
  },
  // 第一圈：行业大类
  {
    id: "food", label: "餐饮\n门店", icon: Utensils, color: "#FF6B35", textColor: "#fff",
    desc: "餐厅桌号意见本、连锁门店反馈系统、菜品评分收集", ring: 1, angle: 0,
    examples: ["扫码留意见", "连锁分店管理", "菜品评分"]
  },
  {
    id: "health", label: "健康\n管理", icon: Heart, color: "#E91E63", textColor: "#fff",
    desc: "减肥打卡账本、健身记录、医疗费用共享追踪", ring: 1, angle: 60,
    examples: ["共享减肥计划", "健身打卡记录", "医疗费用追踪"]
  },
  {
    id: "education", label: "教育\n培训", icon: GraduationCap, color: "#3F51B5", textColor: "#fff",
    desc: "学费分摊账本、培训班收支、学生成绩追踪", ring: 1, angle: 120,
    examples: ["学费分摊", "培训收支", "学习打卡"]
  },
  {
    id: "business", label: "商业\n合作", icon: Briefcase, color: "#795548", textColor: "#fff",
    desc: "合伙人账本、项目分成记录、股权追踪", ring: 1, angle: 180,
    examples: ["合伙人分账", "项目收益分成", "股权记录"]
  },
  {
    id: "family", label: "家庭\n生活", icon: Home, color: "#4CAF50", textColor: "#fff",
    desc: "家庭共同账本、装修费用追踪、家庭旅行预算", ring: 1, angle: 240,
    examples: ["家庭共同账本", "装修费用", "旅行预算"]
  },
  {
    id: "social", label: "社群\n运营", icon: Users, color: "#9C27B0", textColor: "#fff",
    desc: "社群活动费用、AA制聚餐、团购分摊", ring: 1, angle: 300,
    examples: ["AA制聚餐", "团购分摊", "活动费用"]
  },
  // 第二圈：具体场景
  {
    id: "restaurant", label: "连锁\n餐厅", icon: Building2, color: "#FF8A65", textColor: "#fff",
    desc: "多门店意见收集，顾客扫码免注册留言，实时查看各分店反馈", ring: 2, angle: 30,
    examples: ["30家门店统一管理", "桌号二维码", "实时意见汇总"]
  },
  {
    id: "fitness", label: "健身\n打卡", icon: Dumbbell, color: "#F06292", textColor: "#fff",
    desc: "好友共同健身账本，互相监督打卡，记录每次训练", ring: 2, angle: 90,
    examples: ["好友互督", "训练记录", "目标追踪"]
  },
  {
    id: "tutoring", label: "培训\n收费", icon: Star, color: "#5C6BC0", textColor: "#fff",
    desc: "培训机构收费账本，学员缴费记录，课时追踪", ring: 2, angle: 150,
    examples: ["学员缴费", "课时记录", "收入统计"]
  },
  {
    id: "investment", label: "投资\n跟踪", icon: TrendingUp, color: "#8D6E63", textColor: "#fff",
    desc: "合伙投资账本，收益分配记录，资金进出追踪", ring: 2, angle: 210,
    examples: ["收益分配", "资金追踪", "持仓记录"]
  },
  {
    id: "travel", label: "旅行\n AA", icon: Car, color: "#66BB6A", textColor: "#fff",
    desc: "多人旅行费用AA，实时记录各项开销，自动计算人均", ring: 2, angle: 270,
    examples: ["实时记账", "人均计算", "费用分摊"]
  },
  {
    id: "music", label: "活动\n策划", icon: Music, color: "#AB47BC", textColor: "#fff",
    desc: "活动收支账本，门票收入、场地费用、物料采购一目了然", ring: 2, angle: 330,
    examples: ["收支明细", "预算管理", "成本核算"]
  },
];

// ===== 六边形组件 =====
function Hexagon({
  x, y, size, color, textColor, label, icon: Icon, onClick, isSelected, isCenter
}: {
  x: number; y: number; size: number; color: string; textColor: string;
  label: string; icon: any; onClick: () => void; isSelected: boolean; isCenter?: boolean;
}) {
  const w = size;
  const h = size * 1.1547;
  const points = [
    [w / 2, 0],
    [w, h * 0.25],
    [w, h * 0.75],
    [w / 2, h],
    [0, h * 0.75],
    [0, h * 0.25],
  ].map(p => p.join(",")).join(" ");

  const lines = label.split("\n");

  return (
    <g
      transform={`translate(${x - w / 2}, ${y - h / 2})`}
      onClick={onClick}
      style={{ cursor: "pointer" }}
    >
      <polygon
        points={points}
        fill={color}
        stroke={isSelected ? "#fff" : "rgba(255,255,255,0.3)"}
        strokeWidth={isSelected ? 3 : 1.5}
        style={{
          filter: isSelected ? `drop-shadow(0 0 8px ${color})` : isCenter ? `drop-shadow(0 2px 6px rgba(0,0,0,0.3))` : `drop-shadow(0 1px 3px rgba(0,0,0,0.2))`,
          transition: "all 0.2s ease"
        }}
      />
      <foreignObject x={0} y={0} width={w} height={h}>
        <div
          style={{
            width: "100%", height: "100%",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            color: textColor, padding: "4px"
          }}
        >
          <Icon size={isCenter ? 20 : size > 55 ? 16 : 12} strokeWidth={2} />
          {lines.map((line, i) => (
            <div key={i} style={{
              fontSize: isCenter ? 11 : size > 55 ? 10 : 8,
              fontWeight: 700, lineHeight: 1.2,
              textAlign: "center", marginTop: i === 0 ? 3 : 0
            }}>{line}</div>
          ))}
        </div>
      </foreignObject>
    </g>
  );
}

// ===== 详情卡片 =====
function DetailCard({ scenario, onClose }: { scenario: typeof SCENARIOS[0]; onClose: () => void }) {
  const Icon = scenario.icon;
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl w-full max-w-md p-6 pb-10"
        onClick={e => e.stopPropagation()}
        style={{ animation: "slideUp 0.3s ease" }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ backgroundColor: scenario.color }}>
              <Icon size={20} color="#fff" strokeWidth={2} />
            </div>
            <div>
              <h3 className="font-bold text-gray-800 text-base">{scenario.label.replace("\n", "")}</h3>
              <p className="text-xs text-gray-400">私人定制账本场景</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-4 leading-relaxed">{scenario.desc}</p>

        {scenario.examples && (
          <div className="mb-5">
            <p className="text-xs text-gray-400 mb-2 font-medium">典型应用</p>
            <div className="flex flex-wrap gap-2">
              {scenario.examples.map((ex, i) => (
                <span key={i} className="text-xs px-3 py-1 rounded-full border font-medium"
                  style={{ borderColor: scenario.color, color: scenario.color, backgroundColor: `${scenario.color}10` }}>
                  {ex}
                </span>
              ))}
            </div>
          </div>
        )}

        {scenario.id !== "core" && (
          <div className="bg-gray-50 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">想要这个场景的定制账本？</p>
              <p className="text-sm font-semibold text-gray-800 mt-0.5">联系我们进行私人定制</p>
            </div>
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: scenario.color }}>
              <ArrowRight size={14} color="#fff" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ===== 主页面 =====
export default function CustomShowcase() {
  const [selected, setSelected] = useState<typeof SCENARIOS[0] | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // 计算六边形位置
  const centerX = 185;
  const centerY = 200;
  const hexSize = 58;   // 中心大六边形
  const hexSm = 46;     // 第一圈
  const hexXs = 38;     // 第二圈

  // 六边形中心到中心的距离（考虑六边形的几何特性）
  const r1 = hexSize * 1.0 + hexSm * 0.55 + 4;   // 第一圈半径
  const r2 = r1 + hexSm * 0.55 + hexXs * 0.55 + 6; // 第二圈半径

  const getPos = (ring: number, angle: number) => {
    if (ring === 0) return { x: centerX, y: centerY };
    const r = ring === 1 ? r1 : r2;
    const rad = (angle - 90) * Math.PI / 180;
    return { x: centerX + r * Math.cos(rad), y: centerY + r * Math.sin(rad) };
  };

  const svgWidth = 370;
  const svgHeight = 420;

  return (
    <div className="min-h-screen bg-[#0D0D0D] text-white">
      {/* 顶部导航 */}
      <div className="flex items-center px-4 pt-12 pb-4">
        <Link href="/ledger">
          <button className="p-2 -ml-2 rounded-lg">
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>
        </Link>
        <div className="flex-1 text-center">
          <h1 className="text-base font-bold text-white">私人定制账本</h1>
          <p className="text-xs text-gray-400">以账本共享为底层，无限延伸定制场景</p>
        </div>
        <div className="w-10" />
      </div>

      {/* 副标题 */}
      <div className="px-5 mb-2">
        <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
          <div className="flex items-center gap-2 mb-1">
            <Gem className="w-4 h-4 text-[#CBA471]" />
            <span className="text-sm font-semibold text-[#CBA471]">无限蜂巢</span>
            <span className="text-xs text-gray-400">The Infinite Honeycomb</span>
          </div>
          <p className="text-xs text-gray-300 leading-relaxed">
            中心是底层账本引擎，向外辐射各行业大类，再扩散出无数具体场景。
            点击任意六边形了解详情。
          </p>
        </div>
      </div>

      {/* 蜂巢图 */}
      <div className="flex justify-center overflow-hidden">
        <svg
          ref={svgRef}
          width={svgWidth}
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ overflow: "visible" }}
        >
          {/* 连接线 */}
          {SCENARIOS.filter(s => s.ring > 0).map(s => {
            const pos = getPos(s.ring, s.angle);
            const parentAngle = s.ring === 2 ? Math.round(s.angle / 60) * 60 : 0;
            const parentPos = s.ring === 1 ? getPos(0, 0) : getPos(1, parentAngle);
            return (
              <line
                key={`line-${s.id}`}
                x1={parentPos.x} y1={parentPos.y}
                x2={pos.x} y2={pos.y}
                stroke="rgba(255,255,255,0.1)"
                strokeWidth={1}
                strokeDasharray="3,3"
              />
            );
          })}

          {/* 六边形 */}
          {SCENARIOS.map(s => {
            const pos = getPos(s.ring, s.angle);
            const size = s.ring === 0 ? hexSize : s.ring === 1 ? hexSm : hexXs;
            return (
              <Hexagon
                key={s.id}
                x={pos.x} y={pos.y}
                size={size}
                color={s.color}
                textColor={s.textColor}
                label={s.label}
                icon={s.icon}
                isCenter={s.ring === 0}
                isSelected={selected?.id === s.id}
                onClick={() => setSelected(selected?.id === s.id ? null : s)}
              />
            );
          })}
        </svg>
      </div>

      {/* 图例说明 */}
      <div className="px-5 mt-2 mb-6">
        <div className="flex items-center justify-center gap-6 text-xs text-gray-500">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-[#D32F2F]" />
            <span>核心引擎</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-[#FF6B35]" />
            <span>行业大类</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-[#FF8A65]" />
            <span>具体场景</span>
          </div>
        </div>
      </div>

      {/* 底部说明 */}
      <div className="px-5 pb-10">
        <div className="bg-gradient-to-r from-[#D32F2F]/20 to-[#CBA471]/20 rounded-2xl p-4 border border-[#D32F2F]/20">
          <div className="flex items-center gap-2 mb-2">
            <Gem className="w-4 h-4 text-[#CBA471]" />
            <span className="text-sm font-bold text-white">私人定制，无限可能</span>
          </div>
          <p className="text-xs text-gray-300 leading-relaxed">
            无论是连锁餐厅的意见收集、合伙人的投资追踪、还是家庭的共同账本——
            只要有「多人协作 + 数据记录」的场景，都可以基于账本引擎进行私人定制。
          </p>
          <div className="mt-3 flex items-center gap-1 text-xs text-[#CBA471] font-medium">
            <MessageSquare className="w-3 h-3" />
            <span>联系管理员了解定制方案</span>
          </div>
        </div>
      </div>

      {/* 详情弹窗 */}
      {selected && <DetailCard scenario={selected} onClose={() => setSelected(null)} />}

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
