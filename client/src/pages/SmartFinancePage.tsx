/**
 * 智能财务 汇总入口页
 * 路由：/smart-finance
 * 5 个模块：人口×AI、房产×AI、社保×AI、医疗×AI、存款×AI
 * 风格：浅色背景 + 渐变大卡片
 */
import { useLocation } from "wouter";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function SmartFinancePage() {
  const [, navigate] = useLocation();

  const handleRefresh = () => window.location.reload();

  const MODULES = [
    {
      key: 'population',
      title: '人口',
      tag: '×AI',
      sub: '出生人口 · 趋势预测 · 分省数据',
      path: '/macro-data',
      gradient: 'linear-gradient(135deg, #1a1a4e 0%, #0f3460 40%, #1a56db 100%)',
      circle1: 'rgba(26,86,219,0.35)',
      circle2: 'rgba(255,255,255,0.06)',
      stats: [
        { label: '2024年出生', value: '954万人' },
        { label: '历史峰值', value: '2953万人' },
        { label: 'AI预测2035', value: '520万人' },
      ],
      badge: '人口学',
      highlight: '#60a5fa',
    },
    {
      key: 'realestate',
      title: '房产',
      tag: '×AI',
      sub: '全国均价 · 销售面积 · 城市分化',
      path: '/real-estate',
      gradient: 'linear-gradient(135deg, #3b0a0a 0%, #7f1d1d 40%, #dc2626 100%)',
      circle1: 'rgba(220,38,38,0.35)',
      circle2: 'rgba(255,255,255,0.06)',
      stats: [
        { label: '2024年均价', value: '9,200元/㎡' },
        { label: '历史峰值', value: '10,139元/㎡' },
        { label: 'AI预测2034', value: '6,900元/㎡' },
      ],
      badge: '房地产',
      highlight: '#fca5a5',
    },
    {
      key: 'socialsecurity',
      title: '社保',
      tag: '×AI',
      sub: '基金结余 · 收支趋势 · 参保人数',
      path: '/social-security',
      gradient: 'linear-gradient(135deg, #052e16 0%, #14532d 40%, #16a34a 100%)',
      circle1: 'rgba(22,163,74,0.35)',
      circle2: 'rgba(255,255,255,0.06)',
      stats: [
        { label: '2024年结余', value: '10.98万亿' },
        { label: '2024年收入', value: '8.21万亿' },
        { label: 'AI预测2034', value: '12.65万亿' },
      ],
      badge: '社会保障',
      highlight: '#86efac',
    },
    {
      key: 'healthcare',
      title: '医疗',
      tag: '×AI',
      sub: '医疗机构 · 疾病统计 · 卫生费用',
      path: '/healthcare',
      gradient: 'linear-gradient(135deg, #0c1a2e 0%, #0e3a5c 40%, #0891b2 100%)',
      circle1: 'rgba(8,145,178,0.35)',
      circle2: 'rgba(255,255,255,0.06)',
      stats: [
        { label: '2024年医院', value: '3.9万家' },
        { label: '2024年床位', value: '1030万张' },
        { label: '卫生总费用', value: '9.6万亿' },
      ],
      badge: '医疗卫生',
      highlight: '#67e8f9',
    },
    {
      key: 'bankrate',
      title: '存款',
      tag: '×AI',
      sub: '存款利率 · LPR贷款 · 存贷利差',
      path: '/bank-rate',
      gradient: 'linear-gradient(135deg, #1c1207 0%, #451a03 40%, #d97706 100%)',
      circle1: 'rgba(217,119,6,0.35)',
      circle2: 'rgba(255,255,255,0.06)',
      stats: [
        { label: '1年期存款', value: '1.10%' },
        { label: '1年期LPR', value: '3.10%' },
        { label: '存贷利差', value: '2.00%' },
      ],
      badge: '银行利率',
      highlight: '#fcd34d',
    },
  ];

  return (
    <div
      className="min-h-screen max-w-md mx-auto relative"
      style={{ background: '#f5f6f8', color: '#1a1a2e' }}
    >
      {/* ── 顶部导航 ── */}
      <div
        className="sticky top-0 z-20 flex items-center px-4 py-3"
        style={{
          background: '#ffffff',
          borderBottom: '1px solid #e4e7ed',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}
      >
        <button
          onClick={() => navigate("/")}
          className="flex items-center justify-center w-8 h-8 rounded-full mr-3"
          style={{ background: '#f0f2f5' }}
        >
          <ChevronLeft className="w-5 h-5" style={{ color: '#1a1a2e' }} />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <span className="text-base font-bold" style={{ color: '#1a1a2e' }}>智能财务</span>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-bold"
            style={{ background: 'linear-gradient(90deg, #7c3aed, #1a56db)', color: '#fff' }}
          >
            AI
          </span>
        </div>
        {/* 刷新按钮 */}
        <button
          onClick={handleRefresh}
          className="px-3 py-1 rounded-full text-xs font-medium"
          style={{ background: '#f0f2f5', color: '#6b7280' }}
        >
          刷新
        </button>
      </div>

      {/* ── 副标题 ── */}
      <div className="px-4 pt-4 pb-2">
        <p style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.6 }}>
          基于 AI 大模型的宏观经济数据分析与预测平台
        </p>
      </div>

      {/* ── 模块卡片列表 ── */}
      <div className="px-4 space-y-4 pb-10">
        {MODULES.map((mod) => (
          <div
            key={mod.key}
            className="rounded-3xl overflow-hidden cursor-pointer relative"
            style={{
              background: mod.gradient,
              boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
              minHeight: 160,
            }}
            onClick={() => navigate(mod.path)}
          >
            {/* 装饰圆圈 1 */}
            <div style={{
              position: 'absolute', top: -40, right: -40,
              width: 160, height: 160, borderRadius: '50%',
              background: mod.circle1, pointerEvents: 'none',
            }} />
            {/* 装饰圆圈 2 */}
            <div style={{
              position: 'absolute', bottom: -30, left: -30,
              width: 120, height: 120, borderRadius: '50%',
              background: mod.circle2, border: '1px solid rgba(255,255,255,0.08)',
              pointerEvents: 'none',
            }} />

            <div className="relative p-5">
              {/* 标签 + 箭头 */}
              <div className="flex items-center justify-between mb-3">
                <span
                  className="text-xs px-2.5 py-1 rounded-full font-semibold"
                  style={{ background: 'rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.9)' }}
                >
                  {mod.badge}
                </span>
                <div
                  className="flex items-center justify-center w-7 h-7 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.18)' }}
                >
                  <ChevronRight className="w-4 h-4 text-white" />
                </div>
              </div>

              {/* 大标题 */}
              <div className="flex items-baseline gap-1 mb-1">
                <span style={{ fontSize: 32, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{mod.title}</span>
                <span style={{ fontSize: 20, fontWeight: 900, color: mod.highlight, lineHeight: 1 }}>{mod.tag}</span>
              </div>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginBottom: 16 }}>{mod.sub}</p>

              {/* 关键数据 3 格 */}
              <div
                className="grid grid-cols-3 gap-2"
                style={{
                  background: 'rgba(0,0,0,0.22)',
                  borderRadius: 14,
                  padding: '10px 8px',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                {mod.stats.map((s, i) => (
                  <div key={i} className="text-center">
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', marginBottom: 3 }}>{s.label}</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: i === 2 ? mod.highlight : '#fff', lineHeight: 1.2 }}>
                      {s.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}

        {/* 更多模块占位 */}
        <div
          className="rounded-3xl p-5 flex items-center justify-center"
          style={{
            background: '#ffffff',
            border: '1px dashed #d1d5db',
            minHeight: 64,
          }}
        >
          <p style={{ fontSize: 12, color: '#9ca3af' }}>更多宏观数据模块即将上线</p>
        </div>
      </div>
    </div>
  );
}
