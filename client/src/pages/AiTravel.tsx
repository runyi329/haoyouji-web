/**
 * AI 旅行 汇总入口页
 * 路由：/ai-travel
 * 6 个模块：天气×AI、交通/航班×AI、景点×AI、文化古迹×AI、摄影×AI、旅游账本×AI
 * 风格：浅色背景 + 渐变大卡片（参考 SmartFinancePage）
 */
import React from "react";
import { useLocation } from "wouter";
import { ChevronLeft, Cloud, Plane, Mountain, Landmark, Camera, BookOpen } from "lucide-react";
import { PageTag } from "@/components/PageTag";

export default function AiTravel() {
  const [, navigate] = useLocation();

  const handleRefresh = () => window.location.reload();

  type TravelModule = {
    key: string;
    title: string;
    tag: string;
    sub: string;
    path: string;
    gradient: string;
    circle1: string;
    circle2: string;
    icon: string;
    stats: { label: string; value: string }[];
    badge: string;
    highlight: string;
    iconComp: React.ElementType;
  };

  const MODULES: TravelModule[] = [
    {
      key: 'weather',
      title: '天气',
      tag: '×AI',
      sub: '实时天气 · 7日预报 · 出行建议',
      path: '/ai-travel/weather',
      gradient: 'linear-gradient(135deg, #0c2340 0%, #0e4d8a 40%, #1a8fe3 100%)',
      circle1: 'rgba(26,143,227,0.35)',
      circle2: 'rgba(255,255,255,0.06)',
      icon: '',
      stats: [
        { label: '今日天气', value: '晴转多云' },
        { label: '最高温度', value: '28°C' },
        { label: 'AI出行指数', value: '92分' },
      ],
      badge: '气象预报',
      highlight: '#7dd3fc',
      iconComp: Cloud,
    },
    {
      key: 'transport',
      title: '交通',
      tag: '×AI',
      sub: '航班查询 · 高铁票价 · 路线规划',
      path: '/ai-travel/transport',
      gradient: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 40%, #2563eb 100%)',
      circle1: 'rgba(37,99,235,0.35)',
      circle2: 'rgba(255,255,255,0.06)',
      icon: '',
      stats: [
        { label: '今日航班', value: '2,847班' },
        { label: '正点率', value: '87.3%' },
        { label: 'AI最优路线', value: '已就绪' },
      ],
      badge: '出行交通',
      highlight: '#93c5fd',
      iconComp: Plane,
    },
    {
      key: 'attractions',
      title: '景点',
      tag: '×AI',
      sub: '热门景区 · 门票预订 · 游客评分',
      path: '/ai-travel/attractions',
      gradient: 'linear-gradient(135deg, #052e16 0%, #14532d 40%, #15803d 100%)',
      circle1: 'rgba(21,128,61,0.35)',
      circle2: 'rgba(255,255,255,0.06)',
      icon: '',
      stats: [
        { label: '全国景区', value: '3.2万个' },
        { label: '5A级景区', value: '306个' },
        { label: 'AI推荐', value: '已更新' },
      ],
      badge: '旅游景区',
      highlight: '#86efac',
      iconComp: Mountain,
    },
    {
      key: 'culture',
      title: '文化古迹',
      tag: '×AI',
      sub: '历史遗址 · 非遗文化 · 博物馆导览',
      path: '/ai-travel/culture',
      gradient: 'linear-gradient(135deg, #2d1b00 0%, #5c3a00 40%, #b45309 100%)',
      circle1: 'rgba(180,83,9,0.35)',
      circle2: 'rgba(255,255,255,0.06)',
      icon: '',
      stats: [
        { label: '世界遗产', value: '57处' },
        { label: '国家博物馆', value: '6,183家' },
        { label: 'AI导览', value: '已就绪' },
      ],
      badge: '文化遗产',
      highlight: '#fcd34d',
      iconComp: Landmark,
    },
    {
      key: 'photography',
      title: '摄影',
      tag: '×AI',
      sub: '打卡地推荐 · 拍摄技巧 · AI修图',
      path: '/ai-travel/photography',
      gradient: 'linear-gradient(135deg, #1a0533 0%, #3b0764 40%, #7c3aed 100%)',
      circle1: 'rgba(124,58,237,0.35)',
      circle2: 'rgba(255,255,255,0.06)',
      icon: '',
      stats: [
        { label: '热门打卡地', value: '1,200+' },
        { label: '摄影技巧', value: '86篇' },
        { label: 'AI修图', value: '即将上线' },
      ],
      badge: '旅行摄影',
      highlight: '#c4b5fd',
      iconComp: Camera,
    },
    {
      key: 'ledger',
      title: '旅游账本',
      tag: '×AI',
      sub: '旅行预算 · 费用分摊 · 行程记账',
      path: '/ledger',
      gradient: 'linear-gradient(135deg, #1a0a00 0%, #3d1a00 40%, #c2410c 100%)',
      circle1: 'rgba(194,65,12,0.35)',
      circle2: 'rgba(255,255,255,0.06)',
      icon: '',
      stats: [
        { label: '旅行账本', value: '随时创建' },
        { label: 'AA分摊', value: '智能计算' },
        { label: 'AI分析', value: '即将上线' },
      ],
      badge: '旅游账本',
      highlight: '#fb923c',
      iconComp: BookOpen,
    },
  ];

  return (
    <div
      className="min-h-screen max-w-md mx-auto relative"
      style={{ background: '#f5f6f8', color: '#1a1a2e' }}
    >
      <PageTag code="P034" />
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
          onClick={() => navigate("/")}
          className="flex items-center justify-center w-8 h-8 rounded-full mr-3"
          style={{ background: '#f0f2f5' }}
        >
          <ChevronLeft className="w-5 h-5" style={{ color: '#1a1a2e' }} />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <span className="text-base font-bold" style={{ color: '#1a1a2e' }}>AI 旅行</span>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-bold"
            style={{ background: 'linear-gradient(90deg, #0891b2, #2563eb)', color: '#fff' }}
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

      {/* 顶部海报横幅 */}
      <div
        className="mx-4 mt-4 rounded-3xl overflow-hidden relative"
        style={{ height: 140 }}
      >
        <img
          src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663346422697/wvSFVajprWDkVXHi.png"
          alt="AI旅行"
          className="w-full h-full object-cover"
        />
        <div
          className="absolute inset-0 flex flex-col justify-end p-4"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 60%)' }}
        >
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)' }}>
            智能规划 · 个性推荐 · 实时预订 · 贴心助手
          </p>
        </div>
      </div>

      {/* 模块卡片列表 */}
      <div className="px-4 mt-4 space-y-4 pb-10">
        {MODULES.map((mod) => (
          <div
            key={mod.key}
            className="rounded-3xl overflow-hidden cursor-pointer relative"
            style={{
              background: mod.gradient,
              boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
              minHeight: 160,
            }}
            onClick={() => {
              // 旅游账本直接跳转，其余模块暂时提示即将上线
              if (mod.key === 'ledger') {
                navigate(mod.path);
              } else {
                // 暂时显示即将上线提示（后续接入真实功能）
                alert(`${mod.title}×AI 模块即将上线，敬请期待！`);
              }
            }}
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
              {/* 标签 + Emoji图标 */}
              <div className="flex items-center justify-between mb-2">
                <span
                  className="text-xs px-2.5 py-1 rounded-full font-semibold"
                  style={{ background: 'rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.9)' }}
                >
                  {mod.badge}
                </span>
                <div style={{ width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.35))' }}>
                  {mod.iconComp && <mod.iconComp style={{ width: 40, height: 40, color: mod.highlight }} />}
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
          <p style={{ fontSize: 12, color: '#9ca3af' }}>更多旅行模块即将上线</p>
        </div>
      </div>
    </div>
  );
}
