import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { ChevronLeft, Gem, X, MessageSquare, TrendingUp, Heart, GraduationCap, ShoppingBag, Home, Briefcase, Utensils, Car, Dumbbell, Music, Stethoscope, Building2, Users, Star, ArrowRight, HelpCircle, Zap, Rocket } from "lucide-react";

// ===== 场景数据（普通版 + AI版文案）=====
const SCENARIOS = [
  {
    id: "core", label: "底层账本\n引擎", icon: Gem, color: "#D32F2F", textColor: "#fff",
    ring: 0, angle: 0,
    desc: "以账本共享为底层逻辑，无限延伸定制场景",
    aiDesc: "「宇宙级数据引擎」——每一笔记录都是一个量子态，在多人协作的观测中坍缩为真相。",
    current: "多人实时共享账本，数据永久留存，权限精细管控。",
    future: "AI将分析所有账本的行为模式，自动识别异常、预测趋势，成为你的财务大脑。",
    examples: []
  },
  {
    id: "food", label: "餐饮\n门店", icon: Utensils, color: "#FF6B35", textColor: "#fff",
    ring: 1, angle: 0,
    desc: "餐厅桌号意见本、连锁门店反馈系统、菜品评分收集",
    aiDesc: "「味觉神经网络」——每一条顾客留言都是一个神经元，AI实时感知你的口碑生命体征。",
    current: "顾客扫码免注册留意见，老板实时收到，按分店/桌号筛选查看。",
    future: "AI将分析留言情绪，自动识别「高危投诉」，在差评扩散前主动预警。",
    examples: ["扫码留意见", "连锁分店管理", "菜品评分"]
  },
  {
    id: "health", label: "健康\n管理", icon: Heart, color: "#E91E63", textColor: "#fff",
    ring: 1, angle: 60,
    desc: "减肥打卡账本、健身记录、医疗费用共享追踪",
    aiDesc: "「生物节律解码器」——它不只是记录你的健康，它在为你编程未来10年的体质。",
    current: "好友共同健身账本，互相监督打卡，记录每次训练数据。",
    future: "AI分析你的饮食逻辑与肌肉酸痛反馈，逆向推演生物损耗模型，精准预测免疫低点。",
    examples: ["共享减肥计划", "健身打卡记录", "医疗费用追踪"]
  },
  {
    id: "education", label: "教育\n培训", icon: GraduationCap, color: "#3F51B5", textColor: "#fff",
    ring: 1, angle: 120,
    desc: "学费分摊账本、培训班收支、学生成绩追踪",
    aiDesc: "「知识契约系统」——不再是冰冷的数字，而是教练与学员之间的实时生长契约。",
    current: "学员缴费记录、课时追踪，教练与学员双方共同可见进度。",
    future: "AI根据学员上传的练习数据，实时语音点评，自动调整次日课表，双方共同签署周报。",
    examples: ["学费分摊", "培训收支", "学习打卡"]
  },
  {
    id: "business", label: "商业\n合作", icon: Briefcase, color: "#795548", textColor: "#fff",
    ring: 1, angle: 180,
    desc: "合伙人账本、项目分成记录、股权追踪",
    aiDesc: "「信任量化引擎」——将商业关系中最脆弱的部分——利益分配——变成可被所有人验证的数学公式。",
    current: "合伙人账本，收益分配记录，资金进出追踪，权限分级管控。",
    future: "AI自动识别资金异常流向，生成可信度评分，在信任危机发生前发出预警。",
    examples: ["合伙人分账", "项目收益分成", "股权记录"]
  },
  {
    id: "family", label: "家庭\n生活", icon: Home, color: "#4CAF50", textColor: "#fff",
    ring: 1, angle: 240,
    desc: "家庭共同账本、装修费用追踪、家庭旅行预算",
    aiDesc: "「家庭财务基因图谱」——每一笔开销都是家庭价值观的像素点，AI将它们拼成你们独有的生活画像。",
    current: "家庭共同账本，装修费用追踪，旅行预算管理，全家实时可见。",
    future: "AI分析家庭消费基因，自动识别「隐性焦虑支出」，为家庭财务健康打分并给出优化建议。",
    examples: ["家庭共同账本", "装修费用", "旅行预算"]
  },
  {
    id: "social", label: "社群\n运营", icon: Users, color: "#9C27B0", textColor: "#fff",
    ring: 1, angle: 300,
    desc: "社群活动费用、AA制聚餐、团购分摊",
    aiDesc: "「社群能量场监测仪」——每一次AA分摊都是社群凝聚力的一次脉冲，AI实时感知你的社群生命力。",
    current: "AA制聚餐、团购分摊、活动费用，多人实时记账，自动计算人均。",
    future: "AI分析参与频率与消费模式，识别「核心成员」与「边缘流失」，为社群运营提供数据支撑。",
    examples: ["AA制聚餐", "团购分摊", "活动费用"]
  },
  // 第二圈：具体场景
  {
    id: "restaurant", label: "连锁\n餐厅", icon: Building2, color: "#FF8A65", textColor: "#fff",
    ring: 2, angle: 30,
    desc: "多门店意见收集，顾客扫码免注册留言，实时查看各分店反馈",
    aiDesc: "「口碑雷达」——30家门店的每一条留言，都是AI感知你品牌健康度的神经末梢。",
    current: "30家门店统一管理，桌号二维码，顾客扫码留言，按分店筛选。",
    future: "AI实时分析各门店情绪曲线，自动生成「门店健康报告」，识别需要重点关注的分店。",
    examples: ["30家门店统一管理", "桌号二维码", "实时意见汇总"]
  },
  {
    id: "fitness", label: "健身\n打卡", icon: Dumbbell, color: "#F06292", textColor: "#fff",
    ring: 2, angle: 90,
    desc: "好友共同健身账本，互相监督打卡，记录每次训练",
    aiDesc: "「肌肉记忆银行」——每一次打卡都是一笔存款，AI将为你计算身体的复利增长曲线。",
    current: "好友互督打卡，训练记录，目标追踪，共同可见进度。",
    future: "AI分析你的训练节奏，在你即将过度训练前自动预警，并推荐最优恢复方案。",
    examples: ["好友互督", "训练记录", "目标追踪"]
  },
  {
    id: "tutoring", label: "培训\n收费", icon: Star, color: "#5C6BC0", textColor: "#fff",
    ring: 2, angle: 150,
    desc: "培训机构收费账本，学员缴费记录，课时追踪",
    aiDesc: "「学习价值转化器」——将每一分培训费转化为可量化的能力增长数据。",
    current: "学员缴费记录，课时追踪，收入统计，学员进度可视化。",
    future: "AI根据缴费周期与学习进度的相关性，预测续费概率，提前30天触发续费提醒。",
    examples: ["学员缴费", "课时记录", "收入统计"]
  },
  {
    id: "investment", label: "投资\n跟踪", icon: TrendingUp, color: "#8D6E63", textColor: "#fff",
    ring: 2, angle: 210,
    desc: "合伙投资账本，收益分配记录，资金进出追踪",
    aiDesc: "「财富量子纠缠系统」——合伙人之间的每一笔资金流动，都在AI的观测下保持完美的量子纠缠态。",
    current: "收益分配记录，资金追踪，持仓记录，合伙人实时可见。",
    future: "AI识别资金异常模式，自动生成可信度报告，在信任危机前主动预警。",
    examples: ["收益分配", "资金追踪", "持仓记录"]
  },
  {
    id: "travel", label: "旅行\nAA", icon: Car, color: "#66BB6A", textColor: "#fff",
    ring: 2, angle: 270,
    desc: "多人旅行费用AA，实时记录各项开销，自动计算人均",
    aiDesc: "「旅行记忆晶体」——每一笔开销都是旅行记忆的一个像素，AI将它们永久封存为你们独有的时光胶囊。",
    current: "实时记账，人均计算，费用分摊，多人协作记录。",
    future: "AI分析你的旅行消费偏好，下次出行前自动生成个性化预算方案。",
    examples: ["实时记账", "人均计算", "费用分摊"]
  },
  {
    id: "event", label: "活动\n策划", icon: Music, color: "#AB47BC", textColor: "#fff",
    ring: 2, angle: 330,
    desc: "活动收支账本，门票收入、场地费用、物料采购一目了然",
    aiDesc: "「活动能量守恒定律」——AI实时监测每一分预算的流向，确保活动能量在最关键的节点精准爆发。",
    current: "收支明细，预算管理，成本核算，多人协作记录。",
    future: "AI分析历史活动数据，自动识别「超支风险点」，在预算耗尽前发出预警。",
    examples: ["收支明细", "预算管理", "成本核算"]
  },
];

// 边缘问号六边形（暗示无限延伸）
const GHOST_HEXAGONS = [
  { angle: 15, ring: 2.5 },
  { angle: 195, ring: 2.5 },
  { angle: 345, ring: 2.2 },
];

// ===== 六边形组件 =====
function Hexagon({
  x, y, size, color, textColor, label, icon: Icon, onClick, isSelected, isCenter, isGhost, aiMode, pulse
}: {
  x: number; y: number; size: number; color: string; textColor: string;
  label: string; icon: any; onClick?: () => void; isSelected: boolean;
  isCenter?: boolean; isGhost?: boolean; aiMode?: boolean; pulse?: boolean;
}) {
  const w = size;
  const h = size * 1.1547;
  const points = [
    [w / 2, 0], [w, h * 0.25], [w, h * 0.75],
    [w / 2, h], [0, h * 0.75], [0, h * 0.25],
  ].map(p => p.join(",")).join(" ");

  const lines = label.split("\n");

  if (isGhost) {
    return (
      <g transform={`translate(${x - w / 2}, ${y - h / 2})`} style={{ opacity: 0.25 }}>
        <polygon points={points} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={1.5} strokeDasharray="4,3" />
        <foreignObject x={0} y={0} width={w} height={h}>
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <HelpCircle size={size * 0.3} color="rgba(255,255,255,0.5)" />
          </div>
        </foreignObject>
      </g>
    );
  }

  const glowColor = aiMode ? "#CBA471" : color;
  const fillColor = aiMode && !isCenter ? `${color}CC` : color;

  return (
    <g
      transform={`translate(${x - w / 2}, ${y - h / 2})`}
      onClick={onClick}
      style={{ cursor: "pointer" }}
    >
      {/* 选中光晕 */}
      {isSelected && (
        <polygon points={points} fill="none" stroke={glowColor} strokeWidth={4}
          style={{ filter: `drop-shadow(0 0 12px ${glowColor})`, opacity: 0.8 }} />
      )}
      {/* 呼吸光晕（中心） */}
      {isCenter && pulse && (
        <polygon points={points} fill="none" stroke={aiMode ? "#CBA471" : "#D32F2F"} strokeWidth={3}
          style={{ filter: `drop-shadow(0 0 16px ${aiMode ? "#CBA471" : "#D32F2F"})`, opacity: 0.6 }}
          className="animate-pulse" />
      )}
      <polygon
        points={points}
        fill={fillColor}
        stroke={isSelected ? "#fff" : "rgba(255,255,255,0.2)"}
        strokeWidth={isSelected ? 2.5 : 1}
        style={{
          filter: isSelected
            ? `drop-shadow(0 0 10px ${glowColor})`
            : isCenter
              ? `drop-shadow(0 3px 8px rgba(0,0,0,0.5))`
              : `drop-shadow(0 1px 4px rgba(0,0,0,0.3))`,
          transition: "all 0.3s ease"
        }}
      />
      {/* AI模式极光边框 */}
      {aiMode && (
        <polygon points={points} fill="none"
          stroke="rgba(203,164,113,0.4)" strokeWidth={1.5}
          style={{ filter: "drop-shadow(0 0 4px #CBA471)" }} />
      )}
      <foreignObject x={0} y={0} width={w} height={h}>
        <div style={{
          width: "100%", height: "100%",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          color: textColor, padding: "4px"
        }}>
          <Icon size={isCenter ? 20 : size > 50 ? 15 : 11} strokeWidth={2} />
          {lines.map((line, i) => (
            <div key={i} style={{
              fontSize: isCenter ? 10 : size > 50 ? 9 : 7,
              fontWeight: 700, lineHeight: 1.2,
              textAlign: "center", marginTop: i === 0 ? 2 : 0,
              textShadow: aiMode ? "0 0 6px rgba(203,164,113,0.8)" : "none"
            }}>{line}</div>
          ))}
        </div>
      </foreignObject>
    </g>
  );
}

// ===== 三段式详情弹窗 =====
function DetailCard({ scenario, onClose, aiMode }: {
  scenario: typeof SCENARIOS[0]; onClose: () => void; aiMode: boolean;
}) {
  const Icon = scenario.icon;
  const bgColor = aiMode ? "#1A1200" : "#fff";
  const textPrimary = aiMode ? "#CBA471" : "#1a1a1a";
  const textSecondary = aiMode ? "#8B7355" : "#6b7280";
  const accentColor = aiMode ? "#CBA471" : scenario.color;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
      onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-3xl pb-10"
        style={{
          backgroundColor: bgColor,
          border: aiMode ? "1px solid rgba(203,164,113,0.3)" : "none",
          animation: "slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)"
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 把手 */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: aiMode ? "rgba(203,164,113,0.4)" : "#e5e7eb" }} />
        </div>

        {/* 头部 */}
        <div className="flex items-center justify-between px-5 pt-3 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center"
              style={{
                backgroundColor: scenario.color,
                boxShadow: aiMode ? `0 0 16px ${scenario.color}66` : "none"
              }}>
              <Icon size={22} color="#fff" strokeWidth={2} />
            </div>
            <div>
              <h3 className="font-bold text-base" style={{ color: textPrimary }}>
                {scenario.label.replace("\n", "")}
              </h3>
              <p className="text-xs" style={{ color: textSecondary }}>
                {aiMode ? "AI 神奇版" : "私人定制账本场景"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor: aiMode ? "rgba(203,164,113,0.15)" : "#f3f4f6" }}>
            <X size={16} style={{ color: textSecondary }} />
          </button>
        </div>

        {/* 正文描述 */}
        <div className="px-5 mb-4">
          <p className="text-sm leading-relaxed" style={{ color: aiMode ? "#CBA471" : "#374151", fontStyle: aiMode ? "italic" : "normal" }}>
            {aiMode ? `"${scenario.aiDesc}"` : scenario.desc}
          </p>
        </div>

        {/* 三段式内容 */}
        <div className="px-5 space-y-3">
          {/* 当前功能 */}
          <div className="rounded-2xl p-4"
            style={{ backgroundColor: aiMode ? "rgba(203,164,113,0.08)" : `${scenario.color}0D` }}>
            <div className="flex items-center gap-2 mb-2">
              <Zap size={14} style={{ color: accentColor }} />
              <span className="text-xs font-bold" style={{ color: accentColor }}>
                {aiMode ? "🔧 当前功能：解决「此刻之痛」" : "当前功能"}
              </span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: aiMode ? "#A0845C" : "#4b5563" }}>
              {scenario.current}
            </p>
            {scenario.examples && scenario.examples.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {scenario.examples.map((ex, i) => (
                  <span key={i} className="text-xs px-2.5 py-0.5 rounded-full font-medium"
                    style={{
                      border: `1px solid ${accentColor}`,
                      color: accentColor,
                      backgroundColor: `${accentColor}10`
                    }}>{ex}</span>
                ))}
              </div>
            )}
          </div>

          {/* 未来AI升级 */}
          <div className="rounded-2xl p-4"
            style={{
              background: aiMode
                ? "linear-gradient(135deg, rgba(203,164,113,0.15), rgba(180,100,50,0.1))"
                : "linear-gradient(135deg, #f8f9fa, #f0f0f0)",
              border: aiMode ? "1px solid rgba(203,164,113,0.2)" : "1px solid #e5e7eb"
            }}>
            <div className="flex items-center gap-2 mb-2">
              <Rocket size={14} style={{ color: aiMode ? "#CBA471" : "#6366f1" }} />
              <span className="text-xs font-bold" style={{ color: aiMode ? "#CBA471" : "#6366f1" }}>
                🚀 未来 AI 升级：赋予数据「灵魂」
              </span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: aiMode ? "#CBA471" : "#4b5563", fontStyle: aiMode ? "italic" : "normal" }}>
              {aiMode ? `[预言家模式加载中]：${scenario.future}` : scenario.future}
            </p>
          </div>

          {/* 联系定制 */}
          {scenario.id !== "core" && (
            <div className="rounded-2xl p-4 flex items-center justify-between"
              style={{
                background: aiMode
                  ? "linear-gradient(135deg, rgba(203,164,113,0.2), rgba(211,47,47,0.15))"
                  : `linear-gradient(135deg, ${scenario.color}15, ${scenario.color}08)`,
                border: `1px solid ${accentColor}25`
              }}>
              <div>
                <p className="text-xs" style={{ color: textSecondary }}>想要这个场景的定制账本？</p>
                <p className="text-sm font-semibold mt-0.5" style={{ color: textPrimary }}>联系管理员进行私人定制</p>
              </div>
              <div className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ backgroundColor: accentColor, boxShadow: aiMode ? `0 0 12px ${accentColor}66` : "none" }}>
                <ArrowRight size={16} color="#fff" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== 主页面 =====
export default function CustomShowcase() {
  const [selected, setSelected] = useState<typeof SCENARIOS[0] | null>(null);
  const [aiMode, setAiMode] = useState(false);
  const [ripple, setRipple] = useState(false);
  const [revealed, setRevealed] = useState(false);

  // 进入页面时触发波纹动画
  useEffect(() => {
    const t1 = setTimeout(() => setRipple(true), 300);
    const t2 = setTimeout(() => setRevealed(true), 800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // AI模式切换时触发波纹
  const handleAiToggle = () => {
    setRipple(false);
    setTimeout(() => {
      setAiMode(v => !v);
      setRipple(true);
    }, 100);
  };

  const centerX = 185;
  const centerY = 210;
  const hexSize = 60;
  const hexSm = 48;
  const hexXs = 40;

  const r1 = hexSize * 0.9 + hexSm * 0.6 + 5;
  const r2 = r1 + hexSm * 0.6 + hexXs * 0.6 + 6;

  const getPos = (ring: number, angle: number) => {
    if (ring === 0) return { x: centerX, y: centerY };
    const r = ring === 1 ? r1 : ring === 2 ? r2 : r2 * 1.18;
    const rad = (angle - 90) * Math.PI / 180;
    return { x: centerX + r * Math.cos(rad), y: centerY + r * Math.sin(rad) };
  };

  const svgWidth = 370;
  const svgHeight = 440;

  const bgStyle = aiMode
    ? { background: "linear-gradient(160deg, #0D0800 0%, #1A0F00 50%, #0D0D0D 100%)" }
    : { backgroundColor: "#0D0D0D" };

  return (
    <div className="min-h-screen text-white" style={bgStyle}>
      {/* 顶部导航 */}
      <div className="flex items-center px-4 pt-12 pb-3">
        <Link href="/ledger">
          <button className="p-2 -ml-2 rounded-lg">
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>
        </Link>
        <div className="flex-1 text-center">
          <h1 className="text-base font-bold" style={{ color: aiMode ? "#CBA471" : "#fff" }}>
            私人定制账本
          </h1>
          <p className="text-xs" style={{ color: aiMode ? "#8B7355" : "#6b7280" }}>
            {aiMode ? "AI 预言家模式 · 加载中..." : "以账本共享为底层，无限延伸定制场景"}
          </p>
        </div>
        <div className="w-10" />
      </div>

      {/* 副标题卡片 */}
      <div className="px-4 mb-1">
        <div className="rounded-2xl p-3.5"
          style={{
            background: aiMode
              ? "linear-gradient(135deg, rgba(203,164,113,0.12), rgba(180,80,30,0.08))"
              : "rgba(255,255,255,0.05)",
            border: aiMode ? "1px solid rgba(203,164,113,0.25)" : "1px solid rgba(255,255,255,0.08)"
          }}>
          <div className="flex items-center gap-2 mb-1">
            <Gem className="w-4 h-4" style={{ color: aiMode ? "#CBA471" : "#CBA471" }} />
            <span className="text-sm font-semibold" style={{ color: "#CBA471" }}>无限蜂巢</span>
            <span className="text-xs" style={{ color: aiMode ? "#6B5A3E" : "#4b5563" }}>The Infinite Honeycomb</span>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: aiMode ? "#8B7355" : "#9ca3af" }}>
            {aiMode
              ? "量子账本引擎已激活。每一个六边形都是一个平行宇宙的入口，点击探索你的专属场景。"
              : "中心是底层账本引擎，向外辐射各行业大类，再扩散出无数具体场景。点击任意六边形了解详情。"}
          </p>
        </div>
      </div>

      {/* 蜂巢图 */}
      <div className="flex justify-center overflow-hidden" style={{ position: "relative" }}>
        {/* 波纹动画 */}
        {ripple && (
          <div style={{
            position: "absolute",
            top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            pointerEvents: "none", zIndex: 0
          }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{
                position: "absolute",
                width: `${i * 80}px`, height: `${i * 80}px`,
                borderRadius: "50%",
                border: `1px solid ${aiMode ? "rgba(203,164,113,0.3)" : "rgba(211,47,47,0.2)"}`,
                top: "50%", left: "50%",
                transform: "translate(-50%, -50%)",
                animation: `rippleOut ${1.5 + i * 0.5}s ease-out ${i * 0.3}s infinite`
              }} />
            ))}
          </div>
        )}

        <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ overflow: "visible", position: "relative", zIndex: 1 }}>
          {/* 连接线 */}
          {SCENARIOS.filter(s => s.ring > 0).map(s => {
            const pos = getPos(s.ring, s.angle);
            const parentAngle = s.ring === 2 ? Math.round(s.angle / 60) * 60 : 0;
            const parentPos = s.ring === 1 ? getPos(0, 0) : getPos(1, parentAngle);
            return (
              <line key={`line-${s.id}`}
                x1={parentPos.x} y1={parentPos.y} x2={pos.x} y2={pos.y}
                stroke={aiMode ? "rgba(203,164,113,0.15)" : "rgba(255,255,255,0.08)"}
                strokeWidth={1} strokeDasharray="3,4" />
            );
          })}

          {/* 问号幽灵六边形 */}
          {GHOST_HEXAGONS.map((g, i) => {
            const pos = getPos(g.ring, g.angle);
            return (
              <Hexagon key={`ghost-${i}`}
                x={pos.x} y={pos.y} size={hexXs}
                color="" textColor="" label="" icon={HelpCircle}
                isSelected={false} isGhost={true} />
            );
          })}

          {/* 主六边形 */}
          {SCENARIOS.map((s, idx) => {
            const pos = getPos(s.ring, s.angle);
            const size = s.ring === 0 ? hexSize : s.ring === 1 ? hexSm : hexXs * 0.92;
            const delay = revealed ? 0 : idx * 80;
            return (
              <g key={s.id} style={{
                opacity: revealed ? 1 : 0,
                transition: `opacity 0.4s ease ${delay}ms, transform 0.4s ease ${delay}ms`
              }}>
                <Hexagon
                  x={pos.x} y={pos.y} size={size}
                  color={s.color} textColor={s.textColor} label={s.label} icon={s.icon}
                  isCenter={s.ring === 0}
                  isSelected={selected?.id === s.id}
                  aiMode={aiMode}
                  pulse={s.ring === 0}
                  onClick={() => setSelected(selected?.id === s.id ? null : s)}
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* 图例 */}
      <div className="px-5 mt-1 mb-4">
        <div className="flex items-center justify-center gap-5 text-xs" style={{ color: "#6b7280" }}>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "#D32F2F" }} />
            <span>核心引擎</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "#FF6B35" }} />
            <span>行业大类</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "#FF8A65" }} />
            <span>具体场景</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm border border-white/30" style={{ backgroundColor: "transparent" }} />
            <span>待定制</span>
          </div>
        </div>
      </div>

      {/* AI预览模式开关 */}
      <div className="px-5 mb-5">
        <div className="rounded-2xl p-4"
          style={{
            background: aiMode
              ? "linear-gradient(135deg, rgba(203,164,113,0.15), rgba(211,47,47,0.1))"
              : "rgba(255,255,255,0.05)",
            border: aiMode ? "1px solid rgba(203,164,113,0.3)" : "1px solid rgba(255,255,255,0.08)"
          }}>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <Rocket size={14} style={{ color: aiMode ? "#CBA471" : "#9ca3af" }} />
                <span className="text-sm font-bold" style={{ color: aiMode ? "#CBA471" : "#e5e7eb" }}>
                  开启 AI 预览模式
                </span>
              </div>
              <p className="text-xs" style={{ color: aiMode ? "#8B7355" : "#6b7280" }}>
                {aiMode ? "预言家模式已激活 · 感受未来的力量" : "开启后页面切换为赛博金色，展示AI神奇版文案"}
              </p>
            </div>
            {/* 滑动开关 */}
            <button
              onClick={handleAiToggle}
              className="relative ml-4 flex-shrink-0"
              style={{
                width: 52, height: 28,
                borderRadius: 14,
                backgroundColor: aiMode ? "#CBA471" : "rgba(255,255,255,0.15)",
                transition: "background-color 0.3s ease",
                boxShadow: aiMode ? "0 0 12px rgba(203,164,113,0.5)" : "none",
                border: "none", cursor: "pointer", padding: 0
              }}
            >
              <div style={{
                position: "absolute",
                top: 3, left: aiMode ? 27 : 3,
                width: 22, height: 22,
                borderRadius: "50%",
                backgroundColor: "#fff",
                transition: "left 0.3s cubic-bezier(0.34,1.56,0.64,1)",
                boxShadow: "0 1px 4px rgba(0,0,0,0.3)"
              }} />
            </button>
          </div>
        </div>
      </div>

      {/* 底部说明 */}
      <div className="px-5 pb-12">
        <div className="rounded-2xl p-4"
          style={{
            background: aiMode
              ? "linear-gradient(135deg, rgba(203,164,113,0.12), rgba(211,47,47,0.08))"
              : "linear-gradient(135deg, rgba(211,47,47,0.15), rgba(203,164,113,0.1))",
            border: aiMode ? "1px solid rgba(203,164,113,0.2)" : "1px solid rgba(211,47,47,0.15)"
          }}>
          <div className="flex items-center gap-2 mb-2">
            <Gem className="w-4 h-4" style={{ color: "#CBA471" }} />
            <span className="text-sm font-bold" style={{ color: aiMode ? "#CBA471" : "#fff" }}>私人定制，无限可能</span>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: aiMode ? "#8B7355" : "#9ca3af" }}>
            {aiMode
              ? "你正在窥视一个正在进化的系统。每一个六边形都是一个等待被激活的场景宇宙——只要有「多人协作 + 数据记录」的需求，AI就能为它注入灵魂。"
              : "无论是连锁餐厅的意见收集、合伙人的投资追踪、还是家庭的共同账本——只要有「多人协作 + 数据记录」的场景，都可以基于账本引擎进行私人定制。"}
          </p>
          <div className="mt-3 flex items-center gap-1 text-xs font-medium" style={{ color: "#CBA471" }}>
            <MessageSquare className="w-3 h-3" />
            <span>联系管理员了解定制方案</span>
          </div>
        </div>
      </div>

      {/* 详情弹窗 */}
      {selected && <DetailCard scenario={selected} onClose={() => setSelected(null)} aiMode={aiMode} />}

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes rippleOut {
          0% { opacity: 0.6; transform: translate(-50%, -50%) scale(0.5); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(2.5); }
        }
        .animate-pulse {
          animation: hexPulse 2.5s ease-in-out infinite;
        }
        @keyframes hexPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.9; }
        }
      `}</style>
    </div>
  );
}
