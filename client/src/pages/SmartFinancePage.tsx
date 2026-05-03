/**
 * 智能财务 汇总入口页
 * 路由：/smart-finance
 * 包含：人口×AI、房产×AI 等宏观数据入口
 */
import { useLocation } from "wouter";
import { ChevronLeft, Users, Home, TrendingDown, BarChart2, Shield, Stethoscope } from "lucide-react";

const BG_PAGE   = "#f5f6f8";
const BG_WHITE  = "#ffffff";
const BORDER    = "#e4e7ed";
const TEXT_MAIN = "#1a1a2e";
const TEXT_SUB  = "#6b7280";
const TEXT_MUTED = "#9ca3af";
const ACCENT    = "#1a56db";
const AI_COLOR  = "#7c3aed";
const ACCENT2   = "#e53935";
const GOLD_LINE = "#d97706";
const BG_SUBTLE = "#f0f2f5";

const MODULES = [
  {
    key: 'population',
    title: '人口',
    subtitle: '×AI',
    desc: '出生人口趋势、分省数据、性别结构及 AI 预测（2026-2035）',
    path: '/macro-data',
    icon: Users,
    accentColor: ACCENT,
    stats: [
      { label: '2024年出生', value: '954万', color: ACCENT2 },
      { label: '历史峰值', value: '2953万', color: GOLD_LINE },
      { label: 'AI预测2035', value: '520万', color: AI_COLOR },
    ],
    tag: '人口学',
  },
  {
    key: 'realestate',
    title: '房产',
    subtitle: '×AI',
    desc: '全国均价趋势、销售面积、城市分化及 AI 预测（2025-2034）',
    path: '/real-estate',
    icon: Home,
    accentColor: ACCENT2,
    stats: [
      { label: '2024年均价', value: '9,200元', color: ACCENT2 },
      { label: '历史峰値', value: '10,139元', color: GOLD_LINE },
      { label: 'AI预测2034', value: '6,900元', color: AI_COLOR },
    ],
    tag: '房地产',
  },
  {
    key: 'socialsecurity',
    title: '社保',
    subtitle: '×AI',
    desc: '社保基金结余、收支趋势、参保人数及 AI 预测（2025-2034）',
    path: '/social-security',
    icon: Shield,
    accentColor: '#16a34a',
    stats: [
      { label: '2024年结余', value: '10.98万亿', color: '#16a34a' },
      { label: '2024年收入', value: '8.21万亿', color: ACCENT },
      { label: 'AI预测2034', value: '12.65万亿', color: AI_COLOR },
    ],
    tag: '社会保障',
  },
  {
    key: 'healthcare',
    title: '医疗',
    subtitle: '×AI',
    desc: '医疗机构、床位、医护人员、主要疾病发病率及 AI 预测（2025-2034）',
    path: '/healthcare',
    icon: Stethoscope,
    accentColor: '#0891b2',
    stats: [
      { label: '2024年医院数', value: '3.9万家', color: '#0891b2' },
      { label: '2024年床位数', value: '1030万张', color: ACCENT },
      { label: 'AI预测2034', value: '14.9万亿', color: AI_COLOR },
    ],
    tag: '医疗卫生',
  },
];

export default function SmartFinancePage() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen max-w-md mx-auto relative" style={{ background: BG_PAGE, color: TEXT_MAIN }}>
      {/* ── 顶部导航 ── */}
      <div
        className="sticky top-0 z-20 flex items-center px-4 py-3"
        style={{ background: '#fff', borderBottom: `1px solid ${BORDER}` }}
      >
        <button
          onClick={() => navigate("/")}
          className="flex items-center justify-center w-8 h-8 rounded-full mr-3"
          style={{ background: BG_SUBTLE }}
        >
          <ChevronLeft className="w-5 h-5" style={{ color: TEXT_MAIN }} />
        </button>
        <div className="flex items-center gap-1.5 flex-1">
          <BarChart2 className="w-4 h-4" style={{ color: GOLD_LINE }} />
          <span className="text-base font-bold" style={{ color: TEXT_MAIN }}>智能财务</span>
          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(124,58,237,0.1)', color: AI_COLOR, fontWeight: 600 }}>AI</span>
        </div>
      </div>

      {/* ── 副标题 ── */}
      <div className="px-4 pt-4 pb-2">
        <p style={{ fontSize: 12, color: TEXT_MUTED }}>基于 AI 大模型的宏观经济数据分析与预测</p>
      </div>

      {/* ── 模块入口卡片 ── */}
      <div className="px-4 space-y-3 pb-8">
        {MODULES.map((mod) => {
          const Icon = mod.icon;
          return (
            <div
              key={mod.key}
              className="rounded-2xl cursor-pointer active:scale-[0.99] overflow-hidden"
              style={{
                background: BG_WHITE,
                border: `1px solid ${BORDER}`,
                boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              }}
              onClick={() => navigate(mod.path)}
            >
              {/* 顶部色条 */}
              <div style={{ height: 3, background: `linear-gradient(90deg, ${mod.accentColor}, ${AI_COLOR})` }} />

              <div className="p-4">
                {/* 标题行 */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center"
                      style={{ background: `${mod.accentColor}15` }}
                    >
                      <Icon className="w-5 h-5" style={{ color: mod.accentColor }} />
                    </div>
                    <div>
                      <div className="flex items-baseline gap-1">
                        <span style={{ fontSize: 16, fontWeight: 700, color: TEXT_MAIN }}>{mod.title}</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: mod.accentColor }}>{mod.subtitle}</span>
                      </div>
                      <span style={{ fontSize: 10, color: TEXT_MUTED }}>{mod.tag}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1" style={{ color: TEXT_MUTED }}>
                    <span style={{ fontSize: 11 }}>查看详情</span>
                    <ChevronLeft className="w-3.5 h-3.5 rotate-180" />
                  </div>
                </div>

                {/* 描述 */}
                <p style={{ fontSize: 11, color: TEXT_SUB, lineHeight: 1.6, marginBottom: 12 }}>{mod.desc}</p>

                {/* 关键数据 */}
                <div className="grid grid-cols-3 gap-2">
                  {mod.stats.map((stat, i) => (
                    <div
                      key={i}
                      className="rounded-lg p-2 text-center"
                      style={{ background: BG_PAGE }}
                    >
                      <div style={{ fontSize: 9, color: TEXT_MUTED, marginBottom: 2 }}>{stat.label}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}

        {/* 更多模块占位 */}
        <div
          className="rounded-2xl p-4 flex items-center justify-center"
          style={{ background: BG_WHITE, border: `1px dashed ${BORDER}`, minHeight: 72 }}
        >
          <div className="text-center">
            <TrendingDown className="w-5 h-5 mx-auto mb-1" style={{ color: TEXT_MUTED }} />
            <p style={{ fontSize: 11, color: TEXT_MUTED }}>更多宏观数据模块即将上线</p>
          </div>
        </div>
      </div>
    </div>
  );
}
