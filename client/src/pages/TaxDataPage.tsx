/**
 * 税务×AI 页面
 * 路由：/tax-data
 * 内容：中国税收数据分析 + AI解读
 */
import { useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";

export default function TaxDataPage() {
  const [, navigate] = useLocation();

  return (
    <div
      className="min-h-screen max-w-md mx-auto relative"
      style={{ background: '#f5f6f8', color: '#1a1a2e' }}
    >
      {/* 顶部导航 */}
      <div
        className="sticky top-0 z-20 flex items-center px-4 py-3"
        style={{
          background: '#ffffff',
          borderBottom: '1px solid #e4e7ed',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}
      >
        <button
          onClick={() => navigate("/smart-finance")}
          className="flex items-center justify-center w-8 h-8 rounded-full mr-3"
          style={{ background: '#f0f2f5' }}
        >
          <ChevronLeft className="w-5 h-5" style={{ color: '#1a1a2e' }} />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <span className="text-base font-bold" style={{ color: '#1a1a2e' }}>税务×AI</span>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-bold"
            style={{ background: 'linear-gradient(90deg, #1d6a9e, #38bdf8)', color: '#fff' }}
          >
            AI
          </span>
        </div>
      </div>

      {/* 内容区 */}
      <div className="px-4 pt-6 pb-10 space-y-4">
        {/* 税收总览卡片 */}
        <div
          className="rounded-3xl p-5"
          style={{
            background: 'linear-gradient(135deg, #0a1628 0%, #1e3a5f 40%, #1d6a9e 100%)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          }}
        >
          <div className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.55)' }}>2024年中国税收总览</div>
          <div style={{ fontSize: 36, fontWeight: 900, color: '#fff', lineHeight: 1 }}>18.0<span style={{ fontSize: 18, color: '#38bdf8' }}>万亿</span></div>
          <div className="text-xs mt-1 mb-4" style={{ color: 'rgba(255,255,255,0.45)' }}>税收总收入（不含社保）</div>
          <div
            className="grid grid-cols-3 gap-2"
            style={{
              background: 'rgba(0,0,0,0.22)',
              borderRadius: 14,
              padding: '10px 8px',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {[
              { label: '增值税', value: '6.9万亿' },
              { label: '企业所得税', value: '4.0万亿' },
              { label: '个人所得税', value: '1.5万亿' },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', marginBottom: 3 }}>{s.label}</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: i === 2 ? '#38bdf8' : '#fff', lineHeight: 1.2 }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 税种结构 */}
        <div className="rounded-2xl p-4" style={{ background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div className="text-sm font-bold mb-3" style={{ color: '#1a1a2e' }}>主要税种结构</div>
          {[
            { name: '增值税', pct: 38.5, color: '#1d6a9e' },
            { name: '企业所得税', pct: 22.2, color: '#0891b2' },
            { name: '消费税', pct: 9.8, color: '#38bdf8' },
            { name: '个人所得税', pct: 8.3, color: '#7dd3fc' },
            { name: '其他税种', pct: 21.2, color: '#bae6fd' },
          ].map((item, i) => (
            <div key={i} className="mb-2">
              <div className="flex justify-between text-xs mb-1" style={{ color: '#6b7280' }}>
                <span>{item.name}</span>
                <span style={{ fontWeight: 600, color: '#1a1a2e' }}>{item.pct}%</span>
              </div>
              <div style={{ background: '#f0f2f5', borderRadius: 4, height: 6 }}>
                <div style={{ width: `${item.pct}%`, background: item.color, borderRadius: 4, height: 6 }} />
              </div>
            </div>
          ))}
        </div>

        {/* 减税降费 */}
        <div className="rounded-2xl p-4" style={{ background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div className="text-sm font-bold mb-3" style={{ color: '#1a1a2e' }}>减税降费政策</div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: '2024年减税降费', value: '2.2万亿', sub: '延续优惠政策' },
              { label: '小微企业优惠', value: '3,000亿', sub: '普惠性减税' },
              { label: '研发费用加计', value: '100%', sub: '制造业加计扣除' },
              { label: '个税专项扣除', value: '6项', sub: '教育/医疗/房贷等' },
            ].map((item, i) => (
              <div key={i} className="rounded-xl p-3" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 9, color: '#9ca3af', marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#1d6a9e' }}>{item.value}</div>
                <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>{item.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 即将上线提示 */}
        <div
          className="rounded-2xl p-4 flex items-center justify-center"
          style={{ background: '#fff', border: '1px dashed #d1d5db', minHeight: 64 }}
        >
          <p style={{ fontSize: 12, color: '#9ca3af' }}>AI税务分析 · 个税计算器 · 即将上线</p>
        </div>
      </div>
    </div>
  );
}
