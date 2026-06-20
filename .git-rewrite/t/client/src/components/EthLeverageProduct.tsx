import { useState } from "react";
import { ChevronDown, ChevronUp, TrendingUp, Shield, Clock, BarChart2, Info } from "lucide-react";

/**
 * ETH 一次性付款型杠杆买入产品参数展示
 * 包含：三档参数表、时间让渡曲线、跌幅让渡表、购买页结构稿、持仓页结构稿
 * 仅管理员/创建者可见
 */

const TIERS = [
  {
    key: "1.5x",
    label: "1.5 倍档",
    tag: "稳健",
    tagColor: "#16A34A",
    tagBg: "#F0FDF4",
    tagBorder: "#86EFAC",
    accentColor: "#16A34A",
    accentBg: "#F0FDF4",
    accentBorder: "#86EFAC",
    desc: "偏稳健、初次尝试",
    buyPower: "10,000 U 可买 15,000 U ETH",
    baseSurrender: "6%",
    timePerMonth: "+1.5%",
    timeCap: "9%",
    dropCap: "12%",
    totalCap: "27%",
    protectLine: "-45% 左右",
    timeTable: [
      { period: "开仓当日", val: "0%" },
      { period: "30 天", val: "1.5%" },
      { period: "60 天", val: "3.0%" },
      { period: "90 天", val: "4.5%" },
      { period: "120 天", val: "6.0%" },
      { period: "150 天", val: "7.5%" },
      { period: "180 天+", val: "封顶 9%" },
    ],
    dropTable: [
      { range: "0% 到 -10%", val: "0%" },
      { range: "-10% 到 -20%", val: "+3%" },
      { range: "-20% 到 -30%", val: "累计 7%" },
      { range: "-30% 到 -40%", val: "累计 12%" },
      { range: "超过 -40%", val: "平台保护观察区" },
    ],
  },
  {
    key: "2x",
    label: "2 倍档",
    tag: "推荐",
    tagColor: "#1D4ED8",
    tagBg: "#EFF6FF",
    tagBorder: "#93C5FD",
    accentColor: "#1D4ED8",
    accentBg: "#EFF6FF",
    accentBorder: "#93C5FD",
    desc: "主流目标用户",
    buyPower: "10,000 U 可买 20,000 U ETH",
    baseSurrender: "9%",
    timePerMonth: "+2.0%",
    timeCap: "12%",
    dropCap: "15%",
    totalCap: "36%",
    protectLine: "-40% 左右",
    timeTable: [
      { period: "开仓当日", val: "0%" },
      { period: "30 天", val: "2.0%" },
      { period: "60 天", val: "4.0%" },
      { period: "90 天", val: "6.0%" },
      { period: "120 天", val: "8.0%" },
      { period: "150 天", val: "10.0%" },
      { period: "180 天+", val: "封顶 12%" },
    ],
    dropTable: [
      { range: "0% 到 -10%", val: "0%" },
      { range: "-10% 到 -20%", val: "+4%" },
      { range: "-20% 到 -30%", val: "累计 9%" },
      { range: "-30% 到 -40%", val: "累计 15%" },
      { range: "超过 -40%", val: "平台保护观察区" },
    ],
  },
  {
    key: "2.5x",
    label: "2.5 倍档",
    tag: "进攻",
    tagColor: "#B45309",
    tagBg: "#FFFBEB",
    tagBorder: "#FCD34D",
    accentColor: "#B45309",
    accentBg: "#FFFBEB",
    accentBorder: "#FCD34D",
    desc: "高风险偏好用户",
    buyPower: "10,000 U 可买 25,000 U ETH",
    baseSurrender: "12%",
    timePerMonth: "+3.0%",
    timeCap: "15%",
    dropCap: "19%",
    totalCap: "46%",
    protectLine: "-35% 左右",
    timeTable: [
      { period: "开仓当日", val: "0%" },
      { period: "30 天", val: "3.0%" },
      { period: "60 天", val: "6.0%" },
      { period: "90 天", val: "9.0%" },
      { period: "120 天", val: "12.0%" },
      { period: "150 天", val: "15.0%" },
      { period: "180 天+", val: "封顶 15%" },
    ],
    dropTable: [
      { range: "0% 到 -10%", val: "0%" },
      { range: "-10% 到 -20%", val: "+5%" },
      { range: "-20% 到 -30%", val: "累计 11%" },
      { range: "-30% 到 -40%", val: "累计 19%" },
      { range: "超过 -35%", val: "优先进入保护观察区" },
    ],
  },
];

// 总让渡示例数据
const SCENARIO_TABLE = [
  { scene: "开仓 0 天，价格不变", v1: "6%", v2: "9%", v3: "12%" },
  { scene: "开仓 60 天，价格不变", v1: "9%", v2: "13%", v3: "18%" },
  { scene: "开仓 90 天，下跌 15%", v1: "13.5%", v2: "19%", v3: "26%" },
  { scene: "开仓 120 天，下跌 25%", v1: "20%", v2: "26%", v3: "35%" },
  { scene: "开仓 150 天，下跌 35%", v1: "25.5%", v2: "34%", v3: "46%（接近上限）" },
];

function Section({ title, icon, children, defaultOpen = true }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-3 rounded-2xl overflow-hidden" style={{ border: '1px solid #E8EEF8', background: '#FAFBFF' }}>
      <button
        className="w-full flex items-center justify-between px-4 py-3"
        onClick={() => setOpen(v => !v)}
        style={{ background: '#F0F4FF' }}
      >
        <div className="flex items-center gap-2">
          <span style={{ color: '#1A56DB' }}>{icon}</span>
          <span className="text-sm font-semibold" style={{ color: '#1A2340' }}>{title}</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4" style={{ color: '#6B7280' }} /> : <ChevronDown className="w-4 h-4" style={{ color: '#6B7280' }} />}
      </button>
      {open && <div className="px-4 py-3">{children}</div>}
    </div>
  );
}

export default function EthLeverageProduct() {
  const [activeTier, setActiveTier] = useState<string>("2x");
  const tier = TIERS.find(t => t.key === activeTier) || TIERS[1];

  return (
    <div className="px-4 pb-20 pt-2">
      {/* 产品标题 */}
      <div className="mb-4 rounded-2xl p-4" style={{ background: 'linear-gradient(135deg, #1A56DB 0%, #3B82F6 100%)' }}>
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="w-5 h-5 text-white" />
          <span className="text-base font-bold text-white">ETH 一次性付款型杠杆买入</span>
        </div>
        <p className="text-xs text-white/80 leading-relaxed">
          同样一笔首付款，放大购买力；回撤期间无需追加保证金，代价通过时间与跌幅逐步体现在未来收益分配里。
        </p>
      </div>

      {/* 档位切换 */}
      <div className="flex gap-2 mb-4">
        {TIERS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTier(t.key)}
            className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all"
            style={activeTier === t.key
              ? { background: t.accentBg, color: t.accentColor, border: `1.5px solid ${t.accentBorder}` }
              : { background: '#F3F4F6', color: '#6B7280', border: '1.5px solid transparent' }
            }
          >
            <div>{t.label}</div>
            <div className="text-[10px] font-normal mt-0.5" style={{ color: activeTier === t.key ? t.accentColor : '#9CA3AF' }}>{t.tag}</div>
          </button>
        ))}
      </div>

      {/* 当前档位核心参数 */}
      <Section title={`${tier.label} · 核心参数`} icon={<BarChart2 className="w-4 h-4" />}>
        <div className="space-y-2">
          <div className="flex items-center justify-between py-1.5 border-b border-gray-100">
            <span className="text-xs text-gray-500">适合人群</span>
            <span className="text-xs font-medium text-gray-800">{tier.desc}</span>
          </div>
          <div className="flex items-center justify-between py-1.5 border-b border-gray-100">
            <span className="text-xs text-gray-500">首付款购买力</span>
            <span className="text-xs font-semibold" style={{ color: tier.accentColor }}>{tier.buyPower}</span>
          </div>
          <div className="flex items-center justify-between py-1.5 border-b border-gray-100">
            <span className="text-xs text-gray-500">基础让渡比例</span>
            <span className="text-xs font-bold" style={{ color: tier.accentColor }}>{tier.baseSurrender}</span>
          </div>
          <div className="flex items-center justify-between py-1.5 border-b border-gray-100">
            <span className="text-xs text-gray-500">每 30 天时间让渡</span>
            <span className="text-xs font-medium text-gray-800">{tier.timePerMonth}</span>
          </div>
          <div className="flex items-center justify-between py-1.5 border-b border-gray-100">
            <span className="text-xs text-gray-500">时间让渡上限</span>
            <span className="text-xs font-medium text-gray-800">{tier.timeCap}</span>
          </div>
          <div className="flex items-center justify-between py-1.5 border-b border-gray-100">
            <span className="text-xs text-gray-500">跌幅让渡上限</span>
            <span className="text-xs font-medium text-gray-800">{tier.dropCap}</span>
          </div>
          <div className="flex items-center justify-between py-1.5 border-b border-gray-100">
            <span className="text-xs text-gray-500">总让渡上限</span>
            <span className="text-xs font-bold text-red-600">{tier.totalCap}</span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-xs text-gray-500">平台保护线建议</span>
            <span className="text-xs font-medium text-gray-800">{tier.protectLine}</span>
          </div>
        </div>
      </Section>

      {/* 时间让渡曲线 */}
      <Section title="时间让渡曲线" icon={<Clock className="w-4 h-4" />}>
        <p className="text-xs text-gray-500 mb-2 leading-relaxed">持有占用成本，不是惩罚——平台为用户持续保留仓位的成本，逐步体现在未来收益分配中。</p>
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #E8EEF8' }}>
          <div className="grid grid-cols-2 text-xs font-semibold py-2 px-3" style={{ background: '#F0F4FF', color: '#1A56DB' }}>
            <span>持有时长</span>
            <span className="text-right">时间让渡</span>
          </div>
          {tier.timeTable.map((row, i) => (
            <div key={i} className={`grid grid-cols-2 text-xs py-2 px-3 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
              <span className="text-gray-600">{row.period}</span>
              <span className="text-right font-semibold" style={{ color: row.val.startsWith('封顶') ? '#DC2626' : tier.accentColor }}>{row.val}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* 跌幅让渡表 */}
      <Section title="跌幅让渡表（分段式）" icon={<TrendingUp className="w-4 h-4" style={{ transform: 'scaleY(-1)' }} />}>
        <p className="text-xs text-gray-500 mb-2 leading-relaxed">前 10% 回撤为温和区间，真正卖的是"比交易所更能扛一次正常回撤"。</p>
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #E8EEF8' }}>
          <div className="grid grid-cols-2 text-xs font-semibold py-2 px-3" style={{ background: '#F0F4FF', color: '#1A56DB' }}>
            <span>ETH 跌幅区间</span>
            <span className="text-right">跌幅让渡</span>
          </div>
          {tier.dropTable.map((row, i) => (
            <div key={i} className={`grid grid-cols-2 text-xs py-2 px-3 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
              <span className="text-gray-600">{row.range}</span>
              <span className="text-right font-semibold" style={{ color: row.val.includes('保护') ? '#7C3AED' : row.val === '0%' ? '#16A34A' : '#DC2626' }}>{row.val}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* 三档横向对比 */}
      <Section title="三档总让渡对比（首付款 10,000 U）" icon={<BarChart2 className="w-4 h-4" />} defaultOpen={false}>
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #E8EEF8' }}>
          <div className="grid text-xs font-semibold py-2 px-2" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr', background: '#F0F4FF', color: '#1A56DB' }}>
            <span>场景</span>
            <span className="text-center">1.5×</span>
            <span className="text-center">2×</span>
            <span className="text-center">2.5×</span>
          </div>
          {SCENARIO_TABLE.map((row, i) => (
            <div key={i} className={`grid text-xs py-2 px-2 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`} style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr' }}>
              <span className="text-gray-600 text-[10px] leading-tight">{row.scene}</span>
              <span className="text-center font-semibold" style={{ color: '#16A34A' }}>{row.v1}</span>
              <span className="text-center font-semibold" style={{ color: '#1D4ED8' }}>{row.v2}</span>
              <span className="text-center font-semibold text-[10px]" style={{ color: '#B45309' }}>{row.v3}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2 leading-relaxed">2.5 倍档不是给所有人的，而是明确给"愿意用更高未来收益让渡换更大当下购买力"的用户。</p>
      </Section>

      {/* 首页购买页结构稿 */}
      <Section title="首页购买页结构稿" icon={<Info className="w-4 h-4" />} defaultOpen={false}>
        <div className="space-y-2">
          {[
            { no: "1", name: "顶部产品主标题区", desc: "一句话讲清产品卖点" },
            { no: "2", name: "首付款输入区", desc: "用户输入一次性投入金额" },
            { no: "3", name: "杠杆档位选择区", desc: "选择 1.5 倍 / 2 倍 / 2.5 倍" },
            { no: "4", name: "结果总览区", desc: "即时看到可买仓位、让渡规则（实时刷新）" },
            { no: "5", name: "风险缓冲对比区", desc: "对比交易所自开仓的压力" },
            { no: "6", name: "购买确认区", desc: "展示确认按钮与关键条款" },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
              <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white mt-0.5" style={{ background: '#1A56DB' }}>{item.no}</div>
              <div>
                <div className="text-xs font-semibold text-gray-800">{item.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-xl p-3" style={{ background: '#FFF7ED', border: '1px solid #FED7AA' }}>
          <p className="text-xs font-semibold text-orange-700 mb-1">关键设计原则</p>
          <p className="text-xs text-orange-600 leading-relaxed">结果总览要实时刷新——用户每改一次首付款金额、每切一次倍率档位，下方所有数据立即变化，呈现"算给你看"的产品感。</p>
        </div>
        <div className="mt-2 rounded-xl p-3" style={{ background: '#F0FDF4', border: '1px solid #86EFAC' }}>
          <p className="text-xs font-semibold text-green-700 mb-1">文案建议</p>
          <div className="space-y-1">
            <div className="flex items-start gap-1.5">
              <span className="text-xs text-red-500 flex-shrink-0">✗</span>
              <span className="text-xs text-gray-500">0 利息买 ETH</span>
              <span className="text-xs text-gray-400 mx-1">→</span>
              <span className="text-xs text-green-700 font-medium">一次性首付款锁定更大 ETH 仓位</span>
            </div>
            <div className="flex items-start gap-1.5">
              <span className="text-xs text-red-500 flex-shrink-0">✗</span>
              <span className="text-xs text-gray-500">下跌也不怕</span>
              <span className="text-xs text-gray-400 mx-1">→</span>
              <span className="text-xs text-green-700 font-medium">回撤期间无需追加保证金，代价体现在未来收益分配</span>
            </div>
          </div>
        </div>
      </Section>

      {/* 持仓页结构稿 */}
      <Section title="持仓页结构稿" icon={<Shield className="w-4 h-4" />} defaultOpen={false}>
        <div className="space-y-2">
          {[
            { no: "1", name: "当前状态总览", desc: "一眼看到仓位、盈亏、当前档位" },
            { no: "2", name: "累计让渡构成", desc: "拆开显示：基础 + 时间 + 跌幅三部分" },
            { no: "3", name: "风险路径区", desc: "看清继续持有或继续下跌会怎样" },
            { no: "4", name: "平台保护线提示区", desc: "告知最后边界，当前距离缓冲" },
            { no: "5", name: "处置/结算动作区", desc: "卖出、结算、提前结束" },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
              <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white mt-0.5" style={{ background: '#1A56DB' }}>{item.no}</div>
              <div>
                <div className="text-xs font-semibold text-gray-800">{item.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-xl p-3" style={{ background: '#EFF6FF', border: '1px solid #93C5FD' }}>
          <p className="text-xs font-semibold text-blue-700 mb-1">持仓页五个核心数字</p>
          <div className="space-y-1">
            {[
              "当前名义仓位（用户最关心头寸大小）",
              "当前浮盈浮亏（用户每天先看这个）",
              "当前累计让渡比例（产品核心成本）",
              "下一档时间节点（时间成本何时再上升）",
              "距离平台保护线缓冲（还有多大安全垫）",
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#1A56DB' }} />
                <span className="text-xs text-blue-800">{item}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-2 rounded-xl p-3" style={{ background: '#F5F3FF', border: '1px solid #C4B5FD' }}>
          <p className="text-xs text-purple-700 leading-relaxed font-medium">让渡比例必须拆开显示。只给总数用户会觉得黑箱收费；拆成"基础 + 时间 + 跌幅"，规则才是透明可预期的。</p>
        </div>
      </Section>

      {/* 与交易所对比 */}
      <Section title="与交易所自开仓对比" icon={<Shield className="w-4 h-4" />} defaultOpen={false}>
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #E8EEF8' }}>
          <div className="grid text-xs font-semibold py-2 px-3" style={{ gridTemplateColumns: '1.2fr 1fr 1fr', background: '#F0F4FF', color: '#1A56DB' }}>
            <span>对比项</span>
            <span className="text-center">交易所自开仓</span>
            <span className="text-center">本产品</span>
          </div>
          {[
            { item: "首付款后还要不要持续管理", ex: "要", us: "不需要持续追加资金" },
            { item: "回撤后的主要压力", ex: "补保证金 / 防强平", us: "未来收益让渡上升" },
            { item: "适合什么人", ex: "会盯盘、会补仓的人", us: "只想一次性上车的人" },
          ].map((row, i) => (
            <div key={i} className={`grid text-xs py-2 px-3 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`} style={{ gridTemplateColumns: '1.2fr 1fr 1fr' }}>
              <span className="text-gray-600 text-[10px] leading-tight">{row.item}</span>
              <span className="text-center text-red-500 text-[10px]">{row.ex}</span>
              <span className="text-center text-green-600 font-medium text-[10px]">{row.us}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* 核心卖点 */}
      <div className="mt-2 rounded-2xl p-4" style={{ background: 'linear-gradient(135deg, #1A2340 0%, #1A56DB 100%)' }}>
        <p className="text-xs text-white/60 mb-1 font-medium">产品核心卖点</p>
        <p className="text-sm text-white leading-relaxed font-medium">
          同样一笔首付款，你在这里可以买到更大的 ETH 仓位；即使后面发生回撤，你也不需要像交易所那样继续补仓，代价只会通过时间与跌幅逐步体现在未来收益分配里。
        </p>
      </div>
    </div>
  );
}
